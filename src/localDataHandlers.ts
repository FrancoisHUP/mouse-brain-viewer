import { gunzipSync, unzipSync } from "fflate";
import { fromArrayBuffer as geotiffFromArrayBuffer } from "geotiff";
import type { LoadedVolume } from "./omeZarr";
import type { LoadedMesh } from "./allenMesh";
import type {
    LocalDataFormat,
    LocalDataKind,
    LocalDatasetInfo,
    LocalDatasetScale,
    RemoteRenderMode,
} from "./layerTypes";
import { getLocalDatasetRecord } from "./localDataStore";

const DEFAULT_BROWSER_VOLUME_BUDGET_BYTES = 1_500_000_000;

export type LocalInputEntry = {
    path: string;
    file: File;
};

export type LocalDatasetInspection = {
    format: LocalDataFormat;
    kind: LocalDataKind;
    renderMode?: Exclude<RemoteRenderMode, "auto">;
    info: LocalDatasetInfo;
};

export type LocalImportCandidate = {
    id: string;
    name: string;
    entries: LocalInputEntry[];
    inspection: LocalDatasetInspection;
};

export type LocalInspectionProgress = {
    phase: "reading" | "inspecting";
    message: string;
    completed: number;
    total: number;
    percent: number;
};

export type LocalInspectionOptions = {
    signal?: AbortSignal;
    onProgress?: (progress: LocalInspectionProgress) => void;
};

function throwIfAborted(signal?: AbortSignal) {
    if (signal?.aborted) {
        const error = new Error("Local import cancelled.");
        (error as Error & { name?: string }).name = "AbortError";
        throw error;
    }
}

async function yieldToBrowser() {
    await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
}

function reportProgress(options: LocalInspectionOptions | undefined, progress: LocalInspectionProgress) {
    options?.onProgress?.(progress);
}

function createId(prefix: string) {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
        return `${prefix}-${crypto.randomUUID()}`;
    }
    return `${prefix}-${Math.random().toString(36).slice(2, 10)}-${Date.now().toString(36)}`;
}

function normalizePath(path: string): string {
    return path.replace(/\\/g, "/").replace(/^\/+/, "").replace(/\/+/g, "/");
}

function fileExt(name: string): string {
    const trimmed = name.trim().toLowerCase();
    const idx = trimmed.lastIndexOf(".");
    return idx >= 0 ? trimmed.slice(idx + 1) : "";
}

function trimNullTerminator(value: string): string {
    return value.replace(/\u0000+$/g, "");
}


function stripGzipSuffix(name: string): string {
    return /\.gz$/i.test(name) ? name.replace(/\.gz$/i, "") : name;
}

function toPlainUint8Array(data: Uint8Array): Uint8Array<ArrayBuffer> {
    const copy = new Uint8Array(data.byteLength);
    copy.set(data);
    return copy;
}

function toArrayBuffer(data: Uint8Array): ArrayBuffer {
    const copy = toPlainUint8Array(data);
    return copy.buffer.slice(copy.byteOffset, copy.byteOffset + copy.byteLength) as ArrayBuffer;
}

async function robustGunzipBytes(input: Uint8Array, fileName: string): Promise<Uint8Array> {
    if (typeof DecompressionStream !== "undefined") {
        try {
            const stream = new Blob([toArrayBuffer(input)]).stream().pipeThrough(new DecompressionStream("gzip"));
            const response = new Response(stream);
            return new Uint8Array(await response.arrayBuffer());
        } catch {
            // Fall back to fflate below.
        }
    }
    try {
        return gunzipSync(input);
    } catch {
        throw new Error(`Failed to decompress gzip file ${fileName}.`);
    }
}

async function maybeGunzipFile(file: File): Promise<{ file: File; wasGzip: boolean }> {
    if (fileExt(file.name) !== "gz") return { file, wasGzip: false };
    const input = new Uint8Array(await file.arrayBuffer());
    const output = await robustGunzipBytes(input, file.name);
    const nextName = stripGzipSuffix(file.name) || file.name;
    const nextType = file.type === "application/gzip" || file.type === "application/x-gzip" ? "" : file.type;
    return { file: new File([toArrayBuffer(output)], nextName, { type: nextType }), wasGzip: true };
}

async function maybeGunzipBlob(blob: Blob, fileName: string): Promise<ArrayBuffer> {
    const buffer = await blob.arrayBuffer();
    if (fileExt(fileName) !== "gz") return buffer;
    const output = await robustGunzipBytes(new Uint8Array(buffer), fileName);
    return toArrayBuffer(output);
}


function textDecoder(buffer: ArrayBuffer, length?: number): string {
    const view = length == null ? new Uint8Array(buffer) : new Uint8Array(buffer, 0, length);
    return new TextDecoder("utf-8").decode(view);
}

function safeRoundResolution(value: number | null): string {
    if (value == null || !Number.isFinite(value)) return "unknown";
    const rounded = Math.round(value * 100) / 100;
    return Number.isInteger(rounded) ? String(rounded) : String(rounded);
}

function inferResolutionLabel(resolutionUm: number | null, datasetPath: string): string {
    return resolutionUm != null ? `${safeRoundResolution(resolutionUm)}um` : datasetPath || "dataset";
}

function typedToFloat32(data: ArrayLike<number>): Float32Array {
    const out = new Float32Array(data.length);
    for (let i = 0; i < data.length; i += 1) out[i] = Number(data[i] ?? 0);
    return out;
}

function normalizeToFloat01(data: ArrayLike<number>): Float32Array {
    let min = Infinity;
    let max = -Infinity;
    for (let i = 0; i < data.length; i += 1) {
        const v = Number(data[i] ?? 0);
        if (v < min) min = v;
        if (v > max) max = v;
    }
    const out = new Float32Array(data.length);
    const range = max > min ? max - min : 1;
    for (let i = 0; i < data.length; i += 1) out[i] = (Number(data[i] ?? 0) - min) / range;
    return out;
}

function maybeInvertBackground(data: Float32Array, dims: { x: number; y: number; z: number }): Float32Array {
    const { x, y, z } = dims;
    if (x < 3 || y < 3 || z < 3) return data;
    const xy = x * y;
    let borderSum = 0;
    let borderCount = 0;
    let centerSum = 0;
    let centerCount = 0;
    const cz0 = Math.floor(z * 0.25);
    const cz1 = Math.ceil(z * 0.75);
    const cy0 = Math.floor(y * 0.25);
    const cy1 = Math.ceil(y * 0.75);
    const cx0 = Math.floor(x * 0.25);
    const cx1 = Math.ceil(x * 0.75);
    for (let zz = 0; zz < z; zz += 1) {
        for (let yy = 0; yy < y; yy += 1) {
            for (let xx = 0; xx < x; xx += 1) {
                const v = data[zz * xy + yy * x + xx];
                const isBorder = zz === 0 || yy === 0 || xx === 0 || zz === z - 1 || yy === y - 1 || xx === x - 1;
                if (isBorder) {
                    borderSum += v;
                    borderCount += 1;
                }
                const isCenter = zz >= cz0 && zz < cz1 && yy >= cy0 && yy < cy1 && xx >= cx0 && xx < cx1;
                if (isCenter) {
                    centerSum += v;
                    centerCount += 1;
                }
            }
        }
    }
    const borderMean = borderCount > 0 ? borderSum / borderCount : 0;
    const centerMean = centerCount > 0 ? centerSum / centerCount : 0;
    if (borderMean <= centerMean) return data;
    const out = new Float32Array(data.length);
    for (let i = 0; i < data.length; i += 1) out[i] = 1 - data[i];
    return out;
}

function estimateDatasetMemoryBytes(rawShape: number[]): { estimatedBytes: number; estimatedMemoryBytes: number } {
    const voxelCount = rawShape.reduce((acc, value) => acc * Math.max(1, Number(value) || 1), 1);
    const estimatedBytes = voxelCount * 4;
    return { estimatedBytes, estimatedMemoryBytes: Math.ceil(estimatedBytes * 1.35) };
}

function parseJson(text: string): any {
    try {
        return JSON.parse(text);
    } catch (error) {
        throw new Error(error instanceof Error ? error.message : "Invalid JSON metadata.");
    }
}


let bloscCodecFactoryPromise: Promise<any> | null = null;

async function getBloscCodecFactory(): Promise<any> {
    if (!bloscCodecFactoryPromise) {
        bloscCodecFactoryPromise = import("numcodecs").then((module: any) => module.Blosc ?? module.default ?? module);
    }
    return bloscCodecFactoryPromise;
}

async function decodeBloscChunk(buffer: ArrayBuffer, compressor: Record<string, any>): Promise<Uint8Array> {
    const Blosc = await getBloscCodecFactory();
    const config = { ...compressor };
    delete config.id;
    const codec = typeof Blosc?.fromConfig === "function" ? Blosc.fromConfig(config) : new Blosc(config);
    const decoded = await codec.decode(new Uint8Array(buffer));
    if (decoded instanceof Uint8Array) return decoded;
    if (decoded?.buffer instanceof ArrayBuffer) {
        return new Uint8Array(decoded.buffer, decoded.byteOffset ?? 0, decoded.byteLength ?? decoded.buffer.byteLength);
    }
    throw new Error("Failed to decode local Blosc-compressed chunk data.");
}

function formatUnsupportedLocalZarrReason(reason: string | null | undefined): string | null {
    if (!reason) return null;
    if (/Unsupported local Zarr compressor: blosc/i.test(reason)) {
        return null;
    }
    if (/Unsupported local Zarr compressor:/i.test(reason)) {
        return "This resolution uses a local Zarr compression method that is not supported in the browser yet.";
    }
    if (/Local Zarr v3 codec decoding/i.test(reason)) {
        return "This local Zarr dataset uses codecs that are not supported in the browser yet.";
    }
    if (/Too large for browser memory budget/i.test(reason)) {
        return "This resolution is too large to load in the browser.";
    }
    if (/Unsupported Zarr array order:/i.test(reason)) {
        return "This resolution uses a Zarr array layout that is not supported in the browser yet.";
    }
    return reason;
}

function nrrdTypeToArrayCtor(type: string): { ctor: any; bytes: number } {
    const normalized = type.trim().toLowerCase();
    switch (normalized) {
        case "uchar": case "unsigned char": case "uint8": case "uint8_t": return { ctor: Uint8Array, bytes: 1 };
        case "signed char": case "int8": case "int8_t": return { ctor: Int8Array, bytes: 1 };
        case "short": case "short int": case "signed short": case "signed short int": case "int16": case "int16_t": return { ctor: Int16Array, bytes: 2 };
        case "ushort": case "unsigned short": case "unsigned short int": case "uint16": case "uint16_t": return { ctor: Uint16Array, bytes: 2 };
        case "int": case "signed int": case "int32": case "int32_t": return { ctor: Int32Array, bytes: 4 };
        case "uint": case "unsigned int": case "uint32": case "uint32_t": return { ctor: Uint32Array, bytes: 4 };
        case "float": return { ctor: Float32Array, bytes: 4 };
        case "double": return { ctor: Float64Array, bytes: 8 };
        default: throw new Error(`Unsupported NRRD type: ${type}`);
    }
}

function parseNrrdHeader(text: string): Record<string, string> {
    const lines = text.split(/\r?\n/);
    if (!lines[0]?.startsWith("NRRD")) throw new Error("Unsupported NRRD file: missing NRRD magic header.");
    const out: Record<string, string> = {};
    for (const rawLine of lines.slice(1)) {
        const line = rawLine.trim();
        if (!line || line.startsWith("#")) continue;
        const idx = line.indexOf(":");
        if (idx <= 0) continue;
        out[line.slice(0, idx).trim().toLowerCase()] = line.slice(idx + 1).trim();
    }
    return out;
}

function findNrrdHeaderLength(bytes: Uint8Array): number {
    for (let i = 0; i < bytes.length - 1; i += 1) {
        if (bytes[i] === 10 && bytes[i + 1] === 10) return i + 2;
        if (i < bytes.length - 3 && bytes[i] === 13 && bytes[i + 1] === 10 && bytes[i + 2] === 13 && bytes[i + 3] === 10) return i + 4;
    }
    throw new Error("Invalid NRRD file: could not find the header terminator.");
}

function parseNrrdSpaceDirections(raw: string | undefined): { x: number | null; y: number | null; z: number | null } {
    if (!raw) return { x: null, y: null, z: null };
    const matches = [...raw.matchAll(/\(([^)]*)\)/g)].map((match) => match[1].split(",").map((part) => Number(part.trim())));
    if (matches.length < 3) return { x: null, y: null, z: null };
    const norms = matches.slice(0, 3).map((vec) => {
        if (vec.some((value) => !Number.isFinite(value))) return null;
        return Math.sqrt(vec.reduce((acc, value) => acc + value * value, 0));
    });
    return { x: norms[0] ?? null, y: norms[1] ?? null, z: norms[2] ?? null };
}

async function decompressGzip(data: Uint8Array): Promise<Uint8Array> {
    return await robustGunzipBytes(data, "embedded-gzip-payload");
}

function inferSpatialDims(rawShape: number[]): { z: number; y: number; x: number } {
    const len = rawShape.length;
    return {
        z: Math.max(1, Number(rawShape[len - 3] ?? 1)),
        y: Math.max(1, Number(rawShape[len - 2] ?? 1)),
        x: Math.max(1, Number(rawShape[len - 1] ?? 1)),
    };
}

function coerceNumber(value: unknown): number | null {
    return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function inferVoxelSizeUmFromDataset(dataset: any): { z: number | null; y: number | null; x: number | null } {
    const transforms = Array.isArray(dataset?.coordinateTransformations) ? dataset.coordinateTransformations : [];
    const scaleTransform = transforms.find((entry: any) => entry && entry.type === "scale" && Array.isArray(entry.scale));
    const scale = Array.isArray(scaleTransform?.scale) ? scaleTransform.scale : [];
    const spatial = scale.slice(-3).map((value: any) => coerceNumber(value));
    return { z: spatial[0] ?? null, y: spatial[1] ?? null, x: spatial[2] ?? null };
}

function inferResolutionUm(voxelSizeUm: { z: number | null; y: number | null; x: number | null }): number | null {
    const values = [voxelSizeUm.z, voxelSizeUm.y, voxelSizeUm.x].filter((v): v is number => v != null && Number.isFinite(v));
    if (!values.length) return null;
    return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function mapByPath(entries: LocalInputEntry[]) {
    const map = new Map<string, File>();
    for (const entry of entries) map.set(normalizePath(entry.path), entry.file);
    return map;
}

function maybeGetText(map: Map<string, File>, path: string): Promise<string | null> {
    const file = map.get(normalizePath(path));
    return file ? file.text() : Promise.resolve(null);
}

async function maybeGetJson(map: Map<string, File>, path: string): Promise<any | null> {
    const text = await maybeGetText(map, path);
    return text == null ? null : parseJson(text);
}

function detectRootGroups(entries: LocalInputEntry[]): Array<{ root: string; format: "ome-zarr" | "zarr" }> {
    const roots = new Map<string, "ome-zarr" | "zarr">();
    for (const entry of entries) {
        const path = normalizePath(entry.path);
        const omeMatch = path.match(/^(.*?\.ome\.zarr)(?:\/.*)?$/i);
        if (omeMatch) {
            roots.set(omeMatch[1], "ome-zarr");
            continue;
        }
        const zarrMatch = path.match(/^(.*?\.zarr)(?:\/.*)?$/i);
        if (zarrMatch) roots.set(zarrMatch[1], "zarr");
    }
    return Array.from(roots, ([root, format]) => ({ root, format }));
}

async function inspectLocalZarrTree(entries: LocalInputEntry[], rootPath: string, formatHint: "ome-zarr" | "zarr", options?: LocalInspectionOptions): Promise<LocalDatasetInspection> {
    const map = mapByPath(entries);
    const cleanRoot = normalizePath(rootPath).replace(/\/+$/, "");
    const rootZarrJson = await maybeGetJson(map, `${cleanRoot}/zarr.json`);
    const rootZattrs = await maybeGetJson(map, `${cleanRoot}/.zattrs`);
    const rootMeta = rootZarrJson?.attributes ?? rootZarrJson ?? rootZattrs ?? {};
    const multiscales = Array.isArray(rootMeta?.multiscales) ? rootMeta.multiscales : [];
    const primary = multiscales[0];

    let datasets: any[] = [];
    let format: LocalDataFormat = formatHint;
    if (Array.isArray(primary?.datasets) && primary.datasets.length > 0) {
        datasets = primary.datasets;
        format = "ome-zarr";
    } else {
        const rootArrayMeta = rootZarrJson && Array.isArray(rootZarrJson.shape)
            ? { shape: rootZarrJson.shape, chunks: rootZarrJson.chunk_grid?.configuration?.chunk_shape, codecs: rootZarrJson.codecs ?? [], zarrVersion: 3 }
            : await maybeGetJson(map, `${cleanRoot}/.zarray`);
        if (!rootArrayMeta) {
            throw new Error(`Unsupported local ${formatHint} dataset: missing multiscales metadata or root array metadata.`);
        }
        datasets = [{ path: "" }];
        format = "zarr";
    }

    const scales: LocalDatasetScale[] = [];
    const warnings: string[] = [];

    for (let datasetIndex = 0; datasetIndex < datasets.length; datasetIndex += 1) {
        throwIfAborted(options?.signal);
        const dataset = datasets[datasetIndex] ?? {};
        const datasetPath = typeof dataset.path === "string" ? dataset.path : "";
        reportProgress(options, {
            phase: "inspecting",
            message: `Reading ${cleanRoot}${datasetPath ? ` / ${datasetPath}` : ""}`,
            completed: datasetIndex,
            total: Math.max(datasets.length, 1),
            percent: datasets.length > 0 ? datasetIndex / datasets.length : 0,
        });
        await yieldToBrowser();
        const zarrJson = await maybeGetJson(map, datasetPath ? `${cleanRoot}/${datasetPath}/zarr.json` : `${cleanRoot}/zarr.json`);
        const zarray = zarrJson && Array.isArray(zarrJson.shape) ? null : await maybeGetJson(map, datasetPath ? `${cleanRoot}/${datasetPath}/.zarray` : `${cleanRoot}/.zarray`);
        const arrayMeta = zarray ?? zarrJson;
        if (!arrayMeta || !Array.isArray(arrayMeta.shape)) continue;
        const rawShape = arrayMeta.shape.map((value: any) => Number(value));
        const dims = inferSpatialDims(rawShape);
        const voxelSizeUm = inferVoxelSizeUmFromDataset(dataset);
        const resolutionUm = inferResolutionUm(voxelSizeUm);
        const estimates = estimateDatasetMemoryBytes(rawShape);
        let canLoad = estimates.estimatedMemoryBytes <= DEFAULT_BROWSER_VOLUME_BUDGET_BYTES;
        let unsupportedReason: string | null = canLoad ? null : "Too large for browser memory budget.";

        const compressor = zarray?.compressor ?? null;
        if (compressor && compressor?.id !== "blosc") {
            canLoad = false;
            unsupportedReason = formatUnsupportedLocalZarrReason(`Unsupported local Zarr compressor: ${compressor?.id ?? "unknown"}.`);
            if (unsupportedReason) warnings.push(unsupportedReason);
        }
        if (zarrJson?.codecs?.length) {
            // Local v3 codec decoding is not implemented in this first pass.
            canLoad = false;
            unsupportedReason = formatUnsupportedLocalZarrReason("Local Zarr v3 codec decoding is not implemented yet.");
            if (unsupportedReason) warnings.push(unsupportedReason);
        }
        if (arrayMeta.order && arrayMeta.order !== "C") {
            canLoad = false;
            unsupportedReason = `Unsupported Zarr array order: ${arrayMeta.order}.`;
            if (unsupportedReason) warnings.push(unsupportedReason);
        }

        scales.push({
            datasetIndex,
            datasetPath,
            resolutionUm,
            resolutionLabel: inferResolutionLabel(resolutionUm, datasetPath || "root"),
            voxelSizeUm,
            rawShape,
            dims,
            estimatedBytes: estimates.estimatedBytes,
            estimatedMemoryBytes: estimates.estimatedMemoryBytes,
            canLoad,
            unsupportedReason,
        });
    }

    if (!scales.length) throw new Error(`Could not detect any local ${formatHint} array datasets.`);
    const selectable = scales.filter((scale) => scale.canLoad);
    const recommended = selectable[0] ?? scales[0];
    const firstDims = recommended.dims;
    return {
        format,
        kind: "volume",
        renderMode: "slices",
        info: {
            shareable: false,
            format,
            kind: "volume",
            fileName: cleanRoot.split("/").pop() || cleanRoot,
            fileSizeBytes: entries.reduce((sum, entry) => sum + entry.file.size, 0),
            dims: firstDims,
            rawShape: recommended.rawShape,
            voxelSizeUm: recommended.voxelSizeUm,
            warning: warnings.find(Boolean) ?? null,
            availableScales: scales,
            recommendedResolution: recommended.resolutionLabel,
            selectedResolution: recommended.resolutionLabel,
            selectedDatasetPath: recommended.datasetPath,
            treeRootPath: cleanRoot,
        },
    };
}


function readInt16(view: DataView, offset: number, littleEndian: boolean): number {
    return view.getInt16(offset, littleEndian);
}

function readInt32(view: DataView, offset: number, littleEndian: boolean): number {
    return view.getInt32(offset, littleEndian);
}

function readFloat32(view: DataView, offset: number, littleEndian: boolean): number {
    return view.getFloat32(offset, littleEndian);
}

function detectNiftiEndian(view: DataView): boolean {
    const little = view.getInt32(0, true);
    if (little === 348 || little === 540) return true;
    const big = view.getInt32(0, false);
    if (big === 348 || big === 540) return false;
    throw new Error("Unsupported NIfTI file: invalid header size.");
}

function parseNiftiHeader(buffer: ArrayBuffer) {
    if (buffer.byteLength < 352) throw new Error("Unsupported NIfTI file: header is too small.");
    const view = new DataView(buffer);
    const littleEndian = detectNiftiEndian(view);
    const sizeof_hdr = readInt32(view, 0, littleEndian);
    if (sizeof_hdr !== 348 && sizeof_hdr !== 540) {
        throw new Error("Unsupported NIfTI file: only NIfTI-1 and NIfTI-2 single-file headers are supported.");
    }
    if (sizeof_hdr === 540) {
        throw new Error("Unsupported NIfTI file: NIfTI-2 is not supported yet.");
    }
    const dimCount = readInt16(view, 40, littleEndian);
    const dim1 = readInt16(view, 42, littleEndian);
    const dim2 = readInt16(view, 44, littleEndian);
    const dim3 = readInt16(view, 46, littleEndian);
    if (dimCount < 3 || dim1 <= 0 || dim2 <= 0 || dim3 <= 0) {
        throw new Error("Unsupported NIfTI file: expected at least 3 spatial dimensions.");
    }
    const datatype = readInt16(view, 70, littleEndian);
    const bitpix = readInt16(view, 72, littleEndian);
    let voxOffset = readFloat32(view, 108, littleEndian);
    if (!Number.isFinite(voxOffset) || voxOffset <= 0) voxOffset = 352;
    const magicBytes = new Uint8Array(buffer, 344, Math.min(4, Math.max(0, buffer.byteLength - 344)));
    const magic = new TextDecoder("utf-8").decode(magicBytes).replace(/\u0000/g, "");
    const dims = { x: Math.max(1, dim1), y: Math.max(1, dim2), z: Math.max(1, dim3) };
    const voxelSizeUm = {
        x: (() => { const v = readFloat32(view, 80, littleEndian); return Number.isFinite(v) && v > 0 ? v : null; })(),
        y: (() => { const v = readFloat32(view, 84, littleEndian); return Number.isFinite(v) && v > 0 ? v : null; })(),
        z: (() => { const v = readFloat32(view, 88, littleEndian); return Number.isFinite(v) && v > 0 ? v : null; })(),
    };
    return { littleEndian, datatype, bitpix, voxOffset: Math.max(0, Math.floor(voxOffset)), dims, voxelSizeUm, magic };
}

function niftiDatatypeInfo(datatype: number, bitpix: number): { bytes: number; read: (view: DataView, offset: number, littleEndian: boolean) => number } {
    switch (datatype) {
        case 2: return { bytes: 1, read: (view, offset) => view.getUint8(offset) };
        case 4: return { bytes: 2, read: (view, offset, le) => view.getInt16(offset, le) };
        case 8: return { bytes: 4, read: (view, offset, le) => view.getInt32(offset, le) };
        case 16: return { bytes: 4, read: (view, offset, le) => view.getFloat32(offset, le) };
        case 64: return { bytes: 8, read: (view, offset, le) => view.getFloat64(offset, le) };
        case 256: return { bytes: 1, read: (view, offset) => view.getInt8(offset) };
        case 512: return { bytes: 2, read: (view, offset, le) => view.getUint16(offset, le) };
        case 768: return { bytes: 4, read: (view, offset, le) => view.getUint32(offset, le) };
        default: throw new Error(`Unsupported NIfTI datatype: ${datatype}${bitpix ? ` (${bitpix} bits)` : ""}.`);
    }
}

async function inspectNrrdFile(file: File, displayName?: string): Promise<LocalDatasetInspection> {
    const buffer = await file.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    const headerLength = findNrrdHeaderLength(bytes);
    const headerText = textDecoder(buffer, headerLength);
    const header = parseNrrdHeader(headerText);
    const sizes = (header["sizes"] ?? "").split(/\s+/).map((value) => Number(value)).filter((value) => Number.isFinite(value));
    if (sizes.length < 3) throw new Error("Unsupported NRRD file: expected at least 3 spatial dimensions.");
    const dims = { x: Math.max(1, sizes[0] ?? 1), y: Math.max(1, sizes[1] ?? 1), z: Math.max(1, sizes[2] ?? 1) };
    const spacings = parseNrrdSpaceDirections(header["space directions"]);
    return {
        format: "nrrd",
        kind: "volume",
        renderMode: "slices",
        info: {
            shareable: false,
            format: "nrrd",
            kind: "volume",
            fileName: displayName ?? file.name,
            mimeType: file.type || undefined,
            fileSizeBytes: file.size,
            dims,
            rawShape: [dims.z, dims.y, dims.x],
            voxelSizeUm: { z: spacings.z, y: spacings.y, x: spacings.x },
            warning: null,
        },
    };
}

async function inspectTiffFile(file: File, displayName?: string): Promise<LocalDatasetInspection> {
    const tiff = await geotiffFromArrayBuffer(await file.arrayBuffer());
    const imageCount = await tiff.getImageCount();
    const first = await tiff.getImage(0);
    const dims = { x: Math.max(1, first.getWidth()), y: Math.max(1, first.getHeight()), z: Math.max(1, imageCount) };
    return {
        format: "tiff",
        kind: "volume",
        renderMode: "slices",
        info: {
            shareable: false,
            format: "tiff",
            kind: "volume",
            fileName: displayName ?? file.name,
            mimeType: file.type || undefined,
            fileSizeBytes: file.size,
            dims,
            rawShape: [dims.z, dims.y, dims.x],
            voxelSizeUm: { z: null, y: null, x: null },
            warning: imageCount > 1 ? null : "Single-page TIFF imported as a one-slice volume.",
        },
    };
}

async function inspectObjFile(file: File, displayName?: string): Promise<LocalDatasetInspection> {
    return {
        format: "obj",
        kind: "mesh",
        info: { shareable: false, format: "obj", kind: "mesh", fileName: displayName ?? file.name, mimeType: file.type || undefined, fileSizeBytes: file.size, warning: null },
    };
}

async function inspectNiftiFile(file: File, displayName?: string): Promise<LocalDatasetInspection> {
    const buffer = await file.arrayBuffer();
    const header = parseNiftiHeader(buffer);
    return {
        format: "nii",
        kind: "volume",
        renderMode: "slices",
        info: {
            shareable: false,
            format: "nii",
            kind: "volume",
            fileName: displayName ?? file.name,
            mimeType: file.type || undefined,
            fileSizeBytes: file.size,
            dims: header.dims,
            rawShape: [header.dims.z, header.dims.y, header.dims.x],
            voxelSizeUm: header.voxelSizeUm,
            warning: header.magic && header.magic !== "n+1" && header.magic !== "ni1" ? "Imported NIfTI file with an uncommon header variant." : null,
        },
    };
}

async function unzipEntries(file: File): Promise<LocalInputEntry[]> {
    const zipped = new Uint8Array(await file.arrayBuffer());
    const data = unzipSync(zipped);
    const entries: LocalInputEntry[] = [];
    for (const [path, bytes] of Object.entries(data)) {
        if (path.endsWith("/")) continue;
        const name = path.split("/").pop() || path;
        entries.push({ path: normalizePath(path), file: new File([toArrayBuffer(bytes)], name) });
    }
    return entries;
}

export async function inspectLocalInputEntries(inputEntries: LocalInputEntry[], options?: LocalInspectionOptions): Promise<LocalImportCandidate[]> {
    const expanded: LocalInputEntry[] = [];
    const totalInput = Math.max(inputEntries.length, 1);
    for (let index = 0; index < inputEntries.length; index += 1) {
        throwIfAborted(options?.signal);
        const entry = inputEntries[index];
        reportProgress(options, {
            phase: "reading",
            message: `Preparing ${entry.file.name}`,
            completed: index,
            total: totalInput,
            percent: totalInput > 0 ? index / totalInput : 0,
        });
        if (fileExt(entry.file.name) === "zip") {
            const unzipped = await unzipEntries(entry.file);
            expanded.push(...unzipped);
        } else {
            expanded.push({ path: normalizePath(entry.path), file: entry.file });
        }
        await yieldToBrowser();
    }

    const treeGroups = detectRootGroups(expanded);
    const consumed = new Set<string>();
    const candidates: LocalImportCandidate[] = [];
    const totalGroups = treeGroups.length + expanded.length;
    let processed = 0;

    for (const group of treeGroups) {
        throwIfAborted(options?.signal);
        reportProgress(options, {
            phase: "inspecting",
            message: `Inspecting ${group.root}`,
            completed: processed,
            total: Math.max(totalGroups, 1),
            percent: totalGroups > 0 ? processed / totalGroups : 0,
        });
        const groupEntries = expanded.filter((entry) => normalizePath(entry.path).startsWith(`${group.root}/`) || normalizePath(entry.path) === group.root);
        for (const entry of groupEntries) consumed.add(normalizePath(entry.path));
        const inspection = await inspectLocalZarrTree(groupEntries, group.root, group.format, options);
        candidates.push({ id: createId("local-import"), name: inspection.info.fileName, entries: groupEntries, inspection });
        processed += Math.max(groupEntries.length, 1);
        await yieldToBrowser();
    }

    for (const entry of expanded) {
        const normalizedPath = normalizePath(entry.path);
        if (consumed.has(normalizedPath)) continue;
        throwIfAborted(options?.signal);
        reportProgress(options, {
            phase: "inspecting",
            message: `Inspecting ${entry.file.name}`,
            completed: processed,
            total: Math.max(totalGroups, 1),
            percent: totalGroups > 0 ? processed / totalGroups : 0,
        });
        const inspection = await inspectLocalBrowserFile(entry.file);
        candidates.push({ id: createId("local-import"), name: entry.file.name, entries: [entry], inspection });
        processed += 1;
        await yieldToBrowser();
    }

    reportProgress(options, {
        phase: "inspecting",
        message: `Inspection complete`,
        completed: Math.max(totalGroups, 1),
        total: Math.max(totalGroups, 1),
        percent: 1,
    });
    return candidates;
}

export async function inspectLocalBrowserFile(file: File): Promise<LocalDatasetInspection> {
    const { file: innerFile } = await maybeGunzipFile(file);
    const ext = fileExt(innerFile.name);
    if (ext === "nrrd" || innerFile.type === "application/octet-stream") {
        try { return await inspectNrrdFile(innerFile, file.name); } catch (error) { if (ext === "nrrd") throw error; }
    }
    if (ext === "nii") return await inspectNiftiFile(innerFile, file.name);
    if (ext === "tif" || ext === "tiff" || innerFile.type.toLowerCase().includes("tiff")) return await inspectTiffFile(innerFile, file.name);
    if (ext === "obj") return await inspectObjFile(innerFile, file.name);
    throw new Error(`Unsupported local file format for ${file.name}. Current local import supports NRRD, NIfTI (.nii/.nii.gz), TIFF, OBJ, OME-Zarr/Zarr folders, and ZIP archives containing OME-Zarr/Zarr.`);
}

function collapseRasterToGrayscale(raster: any, width: number, height: number): Float32Array {
    const pixelCount = width * height;
    if (Array.isArray(raster)) {
        const out = new Float32Array(pixelCount);
        const samples = raster.length;
        for (let i = 0; i < pixelCount; i += 1) {
            let sum = 0;
            for (let s = 0; s < samples; s += 1) sum += Number(raster[s]?.[i] ?? 0);
            out[i] = sum / Math.max(samples, 1);
        }
        return out;
    }
    return typedToFloat32(raster as ArrayLike<number>);
}

async function loadNrrdVolumeFromBlob(blob: Blob, datasetId: string, info: LocalDatasetInfo): Promise<LoadedVolume> {
    const buffer = await maybeGunzipBlob(blob, info.fileName);
    const bytes = new Uint8Array(buffer);
    const headerLength = findNrrdHeaderLength(bytes);
    const headerText = textDecoder(buffer, headerLength);
    const header = parseNrrdHeader(headerText);
    const sizes = (header["sizes"] ?? "").split(/\s+/).map((value) => Number(value)).filter((value) => Number.isFinite(value));
    if (sizes.length < 3) throw new Error("Unsupported NRRD file: expected at least 3 spatial dimensions.");
    const dims = { x: Math.max(1, sizes[0] ?? 1), y: Math.max(1, sizes[1] ?? 1), z: Math.max(1, sizes[2] ?? 1) };
    const encoding = (header["encoding"] ?? "raw").trim().toLowerCase();
    let payload = bytes.slice(headerLength);
    if (encoding === "gzip" || encoding === "gz") payload = toPlainUint8Array(await decompressGzip(payload));
    else if (encoding !== "raw") throw new Error(`Unsupported NRRD encoding: ${encoding}`);
    const { ctor, bytes: bytesPerElement } = nrrdTypeToArrayCtor(header["type"] ?? "float");
    const expectedElements = dims.x * dims.y * dims.z;
    const expectedBytes = expectedElements * bytesPerElement;
    if (payload.byteLength < expectedBytes) throw new Error("Invalid NRRD file: payload is smaller than expected from the header.");
    const sliced = payload.byteOffset === 0 && payload.byteLength === payload.buffer.byteLength ? payload.buffer : payload.buffer.slice(payload.byteOffset, payload.byteOffset + expectedBytes);
    const typed = new ctor(sliced, 0, expectedElements);
    const normalized = normalizeToFloat01(typed);
    const data = maybeInvertBackground(normalized, dims);
    return { url: `browser-local://${datasetId}`, datasetPath: datasetId, datasetIndex: 0, requestedResolutionUm: null, resolvedResolutionUm: null, voxelSizeUm: info.voxelSizeUm ?? { z: null, y: null, x: null }, shape: [dims.z, dims.y, dims.x], rawShape: [dims.z, dims.y, dims.x], dims, contentKind: "intensity", data };
}

async function loadTiffVolumeFromBlob(blob: Blob, datasetId: string, info: LocalDatasetInfo): Promise<LoadedVolume> {
    const tiff = await geotiffFromArrayBuffer(await maybeGunzipBlob(blob, info.fileName));
    const imageCount = await tiff.getImageCount();
    const first = await tiff.getImage(0);
    const width = first.getWidth();
    const height = first.getHeight();
    const depth = Math.max(1, imageCount);
    const out = new Float32Array(width * height * depth);
    for (let z = 0; z < depth; z += 1) {
        const image = await tiff.getImage(z);
        const raster = await image.readRasters({ interleave: false });
        out.set(collapseRasterToGrayscale(raster, width, height), z * width * height);
    }
    const normalized = normalizeToFloat01(out);
    const data = maybeInvertBackground(normalized, { x: width, y: height, z: depth });
    return { url: `browser-local://${datasetId}`, datasetPath: datasetId, datasetIndex: 0, requestedResolutionUm: null, resolvedResolutionUm: null, voxelSizeUm: info.voxelSizeUm ?? { z: null, y: null, x: null }, shape: [depth, height, width], rawShape: [depth, height, width], dims: { z: depth, y: height, x: width }, contentKind: "intensity", data };
}

async function loadNiftiVolumeFromBlob(blob: Blob, datasetId: string, info: LocalDatasetInfo): Promise<LoadedVolume> {
    const buffer = await maybeGunzipBlob(blob, info.fileName);
    const header = parseNiftiHeader(buffer);
    const type = niftiDatatypeInfo(header.datatype, header.bitpix);
    const expectedElements = header.dims.x * header.dims.y * header.dims.z;
    const expectedBytes = expectedElements * type.bytes;
    const byteOffset = header.voxOffset;
    if (buffer.byteLength < byteOffset + expectedBytes) {
        throw new Error("Invalid NIfTI file: payload is smaller than expected from the header.");
    }
    const view = new DataView(buffer, byteOffset, expectedBytes);
    const raw = new Float32Array(expectedElements);
    for (let i = 0; i < expectedElements; i += 1) {
        raw[i] = type.read(view, i * type.bytes, header.littleEndian);
    }
    const normalized = normalizeToFloat01(raw);
    const data = maybeInvertBackground(normalized, header.dims);
    return {
        url: `browser-local://${datasetId}`,
        datasetPath: datasetId,
        datasetIndex: 0,
        requestedResolutionUm: null,
        resolvedResolutionUm: null,
        voxelSizeUm: info.voxelSizeUm ?? header.voxelSizeUm ?? { z: null, y: null, x: null },
        shape: [header.dims.z, header.dims.y, header.dims.x],
        rawShape: [header.dims.z, header.dims.y, header.dims.x],
        dims: header.dims,
        contentKind: "intensity",
        data,
    };
}

function parseObjText(text: string, datasetId: string): LoadedMesh {
    const vertices: Array<[number, number, number]> = [];
    const lineSegments: number[] = [];
    const triangles: number[] = [];
    const pushSegment = (aIndex: number, bIndex: number) => {
        const a = vertices[aIndex]; const b = vertices[bIndex]; if (!a || !b) return;
        lineSegments.push(a[0], a[1], a[2], b[0], b[1], b[2]);
    };
    const pushTriangle = (aIndex: number, bIndex: number, cIndex: number) => {
        const a = vertices[aIndex]; const b = vertices[bIndex]; const c = vertices[cIndex]; if (!a || !b || !c) return;
        triangles.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
    };
    const parseIndex = (token: string) => { const base = token.split("/")[0]; const idx = Number(base); if (!Number.isFinite(idx) || idx === 0) return null; return idx > 0 ? idx - 1 : vertices.length + idx; };
    for (const rawLine of text.split(/\r?\n/)) {
        const line = trimNullTerminator(rawLine.trim());
        if (!line || line.startsWith("#")) continue;
        if (line.startsWith("v ")) {
            const parts = line.slice(2).trim().split(/\s+/).map(Number);
            if (parts.length >= 3 && parts.every((value) => Number.isFinite(value))) vertices.push([parts[0], parts[1], parts[2]]);
            continue;
        }
        if (line.startsWith("l ")) {
            const points = line.slice(2).trim().split(/\s+/).map(parseIndex).filter((v): v is number => v != null);
            for (let i = 0; i < points.length - 1; i += 1) pushSegment(points[i], points[i + 1]);
            continue;
        }
        if (line.startsWith("f ")) {
            const points = line.slice(2).trim().split(/\s+/).map(parseIndex).filter((v): v is number => v != null);
            if (points.length >= 2) for (let i = 0; i < points.length; i += 1) pushSegment(points[i], points[(i + 1) % points.length]);
            if (points.length >= 3) for (let i = 1; i < points.length - 1; i += 1) pushTriangle(points[0], points[i], points[i + 1]);
        }
    }
    let min: [number, number, number] = [0, 0, 0];
    let max: [number, number, number] = [1, 1, 1];
    if (vertices.length > 0) {
        min = [Infinity, Infinity, Infinity]; max = [-Infinity, -Infinity, -Infinity];
        for (const [x, y, z] of vertices) {
            if (x < min[0]) min[0] = x; if (y < min[1]) min[1] = y; if (z < min[2]) min[2] = z;
            if (x > max[0]) max[0] = x; if (y > max[1]) max[1] = y; if (z > max[2]) max[2] = z;
        }
    }
    return { url: `browser-local://${datasetId}`, linePositions: new Float32Array(lineSegments), trianglePositions: new Float32Array(triangles), bounds: { min, max } };
}

function dtypeInfo(dtype: string): { bytes: number; signed: boolean; float: boolean; littleEndian: boolean } {
    const match = dtype.match(/^([<>|])([uif])(\d+)$/i);
    if (!match) throw new Error(`Unsupported Zarr dtype: ${dtype}`);
    return {
        littleEndian: match[1] !== ">",
        signed: match[2] === "i",
        float: match[2] === "f",
        bytes: Number(match[3]),
    };
}

function readNumber(view: DataView, offset: number, info: ReturnType<typeof dtypeInfo>): number {
    if (info.float) {
        if (info.bytes === 4) return view.getFloat32(offset, info.littleEndian);
        if (info.bytes === 8) return view.getFloat64(offset, info.littleEndian);
    } else if (info.signed) {
        if (info.bytes === 1) return view.getInt8(offset);
        if (info.bytes === 2) return view.getInt16(offset, info.littleEndian);
        if (info.bytes === 4) return view.getInt32(offset, info.littleEndian);
    } else {
        if (info.bytes === 1) return view.getUint8(offset);
        if (info.bytes === 2) return view.getUint16(offset, info.littleEndian);
        if (info.bytes === 4) return view.getUint32(offset, info.littleEndian);
    }
    throw new Error("Unsupported Zarr dtype byte width.");
}

async function loadLocalZarrVolumeFromTree(record: Awaited<ReturnType<typeof getLocalDatasetRecord>>, datasetId: string, info: LocalDatasetInfo): Promise<LoadedVolume> {
    if (!record || record.kind !== "tree" || !record.entries) throw new Error("This local dataset tree is missing from browser storage.");
    const map = new Map(record.entries.map((entry) => [normalizePath(entry.path), entry]));
    const root = normalizePath(info.treeRootPath ?? "").replace(/\/+$/, "");
    const datasetPath = normalizePath(info.selectedDatasetPath ?? "");
    const arrayMetaEntry = map.get(datasetPath ? `${root}/${datasetPath}/.zarray` : `${root}/.zarray`);
    if (!arrayMetaEntry) throw new Error("Local Zarr loading currently supports Zarr v2 arrays only.");
    const arrayMeta = parseJson(await arrayMetaEntry.blob.text());
    const compressor = arrayMeta.compressor ?? null;
    if (compressor && compressor?.id !== "blosc") {
        throw new Error(formatUnsupportedLocalZarrReason(`Unsupported local Zarr compressor: ${compressor?.id ?? "unknown"}.`) ?? "Unsupported local Zarr compressor.");
    }
    if (arrayMeta.order && arrayMeta.order !== "C") throw new Error(`Unsupported Zarr array order: ${arrayMeta.order}.`);
    const shape: number[] = (arrayMeta.shape ?? []).map((v: any) => Number(v));
    const chunks: number[] = (arrayMeta.chunks ?? []).map((v: any) => Number(v));
    const dims = inferSpatialDims(shape);
    const total = shape.reduce((acc, value) => acc * Math.max(1, value || 1), 1);
    const out = new Float32Array(total);
    const sep = arrayMeta.dimension_separator === "/" ? "/" : ".";
    const chunkCounts = shape.map((size, axis) => Math.ceil(size / Math.max(1, chunks[axis] || size)));
    const infoType = dtypeInfo(arrayMeta.dtype ?? "<f4");

    const recurse = async (axis: number, coord: number[]) => {
        if (axis === chunkCounts.length) {
            const chunkKey = coord.join(sep);
            const chunkPath = datasetPath ? `${root}/${datasetPath}/${chunkKey}` : `${root}/${chunkKey}`;
            const chunkEntry = map.get(chunkPath);
            if (!chunkEntry) return;
            const rawBuffer = await chunkEntry.blob.arrayBuffer();
            const chunkBytes = compressor?.id === "blosc"
                ? await decodeBloscChunk(rawBuffer, compressor)
                : new Uint8Array(rawBuffer);
            const view = new DataView(chunkBytes.buffer, chunkBytes.byteOffset, chunkBytes.byteLength);
            const chunkShape = shape.map((size, i) => {
                const start = coord[i] * chunks[i];
                return Math.max(0, Math.min(chunks[i], size - start));
            });
            const chunkElements = chunkShape.reduce((acc, value) => acc * Math.max(1, value), 1);
            const strides = new Array(shape.length).fill(1);
            for (let i = shape.length - 2; i >= 0; i -= 1) strides[i] = strides[i + 1] * shape[i + 1];
            for (let linear = 0; linear < chunkElements; linear += 1) {
                let remainder = linear;
                let targetIndex = 0;
                for (let i = chunkShape.length - 1; i >= 0; i -= 1) {
                    const size = chunkShape[i];
                    const local = remainder % size;
                    remainder = Math.floor(remainder / size);
                    const global = coord[i] * chunks[i] + local;
                    targetIndex += global * strides[i];
                }
                out[targetIndex] = readNumber(view, linear * infoType.bytes, infoType);
            }
            return;
        }
        for (let i = 0; i < chunkCounts[axis]; i += 1) await recurse(axis + 1, [...coord, i]);
    };
    await recurse(0, []);
    const normalized = maybeInvertBackground(normalizeToFloat01(out), { x: dims.x, y: dims.y, z: dims.z });
    const selectedScale = (info.availableScales ?? []).find((scale) => scale.datasetPath === datasetPath || (!scale.datasetPath && !datasetPath));
    return {
        url: `browser-local://${datasetId}`,
        datasetPath,
        datasetIndex: selectedScale?.datasetIndex ?? 0,
        requestedResolutionUm: selectedScale?.resolutionUm ?? null,
        resolvedResolutionUm: selectedScale?.resolutionUm ?? null,
        voxelSizeUm: selectedScale?.voxelSizeUm ?? info.voxelSizeUm ?? { z: null, y: null, x: null },
        shape,
        rawShape: shape,
        dims,
        contentKind: "intensity",
        data: normalized,
    };
}

export async function loadLocalBrowserVolume(datasetId: string, info: LocalDatasetInfo): Promise<LoadedVolume> {
    const record = await getLocalDatasetRecord(datasetId);
    if (!record) throw new Error("This local dataset is missing from browser storage.");
    const blob = record.kind === "blob" ? (record.blob as Blob) : null;
    if (info.format === "nrrd") return await loadNrrdVolumeFromBlob(blob as Blob, datasetId, info);
    if (info.format === "nii") return await loadNiftiVolumeFromBlob(blob as Blob, datasetId, info);
    if (info.format === "tiff") return await loadTiffVolumeFromBlob(blob as Blob, datasetId, info);
    if (info.format === "ome-zarr" || info.format === "zarr") return await loadLocalZarrVolumeFromTree(record, datasetId, info);
    throw new Error(`Local volume loading is not implemented for ${info.format}.`);
}

export async function loadLocalBrowserMesh(datasetId: string): Promise<LoadedMesh> {
    const record = await getLocalDatasetRecord(datasetId);
    if (!record || record.kind !== "blob" || !record.blob) throw new Error("This local mesh is missing from browser storage.");
    const text = new TextDecoder("utf-8").decode(await maybeGunzipBlob(record.blob, record.fileName));
    return parseObjText(text, datasetId);
}


export type LocalImportPreview = {
    key: string;
    xyDataUrl: string;
    xzDataUrl: string;
    yzDataUrl: string;
    dims: { x: number; y: number; z: number };
};

function getCandidatePreviewKey(candidate: LocalImportCandidate): string {
    return `${candidate.id}::${candidate.inspection.info.selectedResolution ?? "default"}`;
}

function buildSlicePreviewDataUrl(slice: Float32Array, width: number, height: number): string {
    if (typeof document === "undefined") {
        throw new Error("Slice previews are only available in the browser UI.");
    }
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Failed to create preview canvas.");
    const image = ctx.createImageData(width, height);
    for (let i = 0; i < slice.length; i += 1) {
        const value = Math.max(0, Math.min(255, Math.round((slice[i] ?? 0) * 255)));
        const offset = i * 4;
        image.data[offset] = value;
        image.data[offset + 1] = value;
        image.data[offset + 2] = value;
        image.data[offset + 3] = 255;
    }
    ctx.putImageData(image, 0, 0);
    return canvas.toDataURL("image/png");
}

function extractPreviewSlice(volume: LoadedVolume, plane: "xy" | "xz" | "yz"): { data: Float32Array; width: number; height: number } {
    const { x, y, z } = volume.dims;
    const source = volume.data;
    if (plane === "xy") {
        const width = x;
        const height = y;
        const zz = Math.floor(z / 2);
        const out = new Float32Array(width * height);
        const base = zz * x * y;
        for (let yy = 0; yy < y; yy += 1) {
            const row = yy * x;
            for (let xx = 0; xx < x; xx += 1) {
                out[row + xx] = source[base + row + xx] ?? 0;
            }
        }
        return { data: out, width, height };
    }
    if (plane === "xz") {
        const width = x;
        const height = z;
        const yy = Math.floor(y / 2);
        const out = new Float32Array(width * height);
        for (let zz = 0; zz < z; zz += 1) {
            const outRow = zz * x;
            const base = zz * x * y + yy * x;
            for (let xx = 0; xx < x; xx += 1) {
                out[outRow + xx] = source[base + xx] ?? 0;
            }
        }
        return { data: out, width, height };
    }
    const width = y;
    const height = z;
    const xx = Math.floor(x / 2);
    const out = new Float32Array(width * height);
    for (let zz = 0; zz < z; zz += 1) {
        const outRow = zz * y;
        const base = zz * x * y;
        for (let yy = 0; yy < y; yy += 1) {
            out[outRow + yy] = source[base + yy * x + xx] ?? 0;
        }
    }
    return { data: out, width, height };
}

async function loadLocalZarrVolumeFromEntries(entries: LocalInputEntry[], datasetId: string, info: LocalDatasetInfo): Promise<LoadedVolume> {
    const normalizedEntries = entries.map((entry) => ({
        path: normalizePath(entry.path),
        blob: entry.file as Blob,
        fileName: entry.file.name,
        mimeType: entry.file.type || undefined,
        size: entry.file.size,
    }));
    const map = new Map(normalizedEntries.map((entry) => [entry.path, entry]));
    const root = normalizePath(info.treeRootPath ?? "").replace(/\/+$/, "");
    const datasetPath = normalizePath(info.selectedDatasetPath ?? "");
    const arrayMetaEntry = map.get(datasetPath ? `${root}/${datasetPath}/.zarray` : `${root}/.zarray`);
    if (!arrayMetaEntry) throw new Error("Local Zarr preview currently supports Zarr v2 arrays only.");
    const arrayMeta = parseJson(await arrayMetaEntry.blob.text());
    const compressor = arrayMeta.compressor ?? null;
    if (compressor && compressor?.id !== "blosc") {
        throw new Error(formatUnsupportedLocalZarrReason(`Unsupported local Zarr compressor: ${compressor?.id ?? "unknown"}.`) ?? "Unsupported local Zarr compressor.");
    }
    if (arrayMeta.order && arrayMeta.order !== "C") throw new Error(`Unsupported Zarr array order: ${arrayMeta.order}.`);
    const shape: number[] = (arrayMeta.shape ?? []).map((v: any) => Number(v));
    const chunks: number[] = (arrayMeta.chunks ?? []).map((v: any) => Number(v));
    const dims = inferSpatialDims(shape);
    const total = shape.reduce((acc, value) => acc * Math.max(1, value || 1), 1);
    const out = new Float32Array(total);
    const sep = arrayMeta.dimension_separator === "/" ? "/" : ".";
    const chunkCounts = shape.map((size, axis) => Math.ceil(size / Math.max(1, chunks[axis] || size)));
    const infoType = dtypeInfo(arrayMeta.dtype ?? "<f4");

    const recurse = async (axis: number, coord: number[]) => {
        if (axis === chunkCounts.length) {
            const chunkKey = coord.join(sep);
            const chunkPath = datasetPath ? `${root}/${datasetPath}/${chunkKey}` : `${root}/${chunkKey}`;
            const chunkEntry = map.get(chunkPath);
            if (!chunkEntry) return;
            const rawBuffer = await chunkEntry.blob.arrayBuffer();
            const chunkBytes = compressor?.id === "blosc"
                ? await decodeBloscChunk(rawBuffer, compressor)
                : new Uint8Array(rawBuffer);
            const view = new DataView(chunkBytes.buffer, chunkBytes.byteOffset, chunkBytes.byteLength);
            const chunkShape = shape.map((size, i) => {
                const start = coord[i] * chunks[i];
                return Math.max(0, Math.min(chunks[i], size - start));
            });
            const chunkElements = chunkShape.reduce((acc, value) => acc * Math.max(1, value), 1);
            const strides = new Array(shape.length).fill(1);
            for (let i = shape.length - 2; i >= 0; i -= 1) strides[i] = strides[i + 1] * shape[i + 1];
            for (let linear = 0; linear < chunkElements; linear += 1) {
                let remainder = linear;
                let targetIndex = 0;
                for (let i = chunkShape.length - 1; i >= 0; i -= 1) {
                    const size = chunkShape[i];
                    const local = remainder % size;
                    remainder = Math.floor(remainder / size);
                    const global = coord[i] * chunks[i] + local;
                    targetIndex += global * strides[i];
                }
                out[targetIndex] = readNumber(view, linear * infoType.bytes, infoType);
            }
            return;
        }
        for (let i = 0; i < chunkCounts[axis]; i += 1) await recurse(axis + 1, [...coord, i]);
    };
    await recurse(0, []);
    const normalized = maybeInvertBackground(normalizeToFloat01(out), { x: dims.x, y: dims.y, z: dims.z });
    const selectedScale = (info.availableScales ?? []).find((scale) => scale.datasetPath === datasetPath || (!scale.datasetPath && !datasetPath));
    return {
        url: `browser-local-preview://${datasetId}`,
        datasetPath,
        datasetIndex: selectedScale?.datasetIndex ?? 0,
        requestedResolutionUm: selectedScale?.resolutionUm ?? null,
        resolvedResolutionUm: selectedScale?.resolutionUm ?? null,
        voxelSizeUm: selectedScale?.voxelSizeUm ?? info.voxelSizeUm ?? { z: null, y: null, x: null },
        shape,
        rawShape: shape,
        dims,
        contentKind: "intensity",
        data: normalized,
    };
}

async function loadLocalImportCandidateVolume(candidate: LocalImportCandidate): Promise<LoadedVolume> {
    if (candidate.inspection.kind !== "volume") {
        throw new Error("Slice previews are only available for volume datasets.");
    }
    if (candidate.inspection.format === "ome-zarr" || candidate.inspection.format === "zarr") {
        return await loadLocalZarrVolumeFromEntries(candidate.entries, candidate.id, candidate.inspection.info);
    }
    const first = candidate.entries[0]?.file;
    if (!first) throw new Error("Local import preview is missing its source file.");
    const { file: innerFile } = await maybeGunzipFile(first);
    if (candidate.inspection.format === "nrrd") return await loadNrrdVolumeFromBlob(innerFile, candidate.id, candidate.inspection.info);
    if (candidate.inspection.format === "nii") return await loadNiftiVolumeFromBlob(innerFile, candidate.id, candidate.inspection.info);
    if (candidate.inspection.format === "tiff") return await loadTiffVolumeFromBlob(innerFile, candidate.id, candidate.inspection.info);
    throw new Error(`Local previews are not implemented for ${candidate.inspection.format}.`);
}

export async function createLocalImportPreview(candidate: LocalImportCandidate): Promise<LocalImportPreview> {
    const volume = await loadLocalImportCandidateVolume(candidate);
    const xy = extractPreviewSlice(volume, "xy");
    const xz = extractPreviewSlice(volume, "xz");
    const yz = extractPreviewSlice(volume, "yz");
    return {
        key: getCandidatePreviewKey(candidate),
        dims: volume.dims,
        xyDataUrl: buildSlicePreviewDataUrl(xy.data, xy.width, xy.height),
        xzDataUrl: buildSlicePreviewDataUrl(xz.data, xz.width, xz.height),
        yzDataUrl: buildSlicePreviewDataUrl(yz.data, yz.width, yz.height),
    };
}
