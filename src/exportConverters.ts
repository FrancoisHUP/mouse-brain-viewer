import type { ExportSourceModel, ExportTargetFormat } from "./exportModel";
import type { StoredLocalDatasetRecord } from "./localDataStore";
import type { LocalDatasetInfo } from "./layerTypes";
import type { LoadedVolume } from "./omeZarr";
import { Zip, ZipPassThrough } from "fflate";

export type RemoteArchiveProgress = {
  completed: number;
  total: number;
  label: string;
};

export type ExportPackagingProgress = {
  completed: number;
  total: number;
  label: string;
};

function stripFileExtension(name: string): string {
  if (/\.ome\.zarr$/iu.test(name)) return name.replace(/\.ome\.zarr$/iu, "");
  if (/\.nii\.gz$/iu.test(name)) return name.replace(/\.nii\.gz$/iu, "");
  return name.replace(/\.[^/.]+$/u, "");
}

export function buildExportFileName(name: string, format: ExportTargetFormat): string {
  const baseName = stripFileExtension(name.trim()) || "dataset";
  if (format === "original") return name.trim() || "dataset";
  if (format === "zip") return `${baseName}.zip`;
  if (format === "nrrd") return `${baseName}.nrrd`;
  if (format === "nii") return `${baseName}.nii`;
  if (format === "tiff") return `${baseName}.tiff`;
  if (format === "ome-zarr") return `${baseName}.ome.zarr.zip`;
  if (format === "zarr") return `${baseName}.zarr.zip`;
  if (format === "obj") return `${baseName}.obj`;
  return `${baseName}.bin`;
}

function encodeText(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

function typedArrayToByteView(data: Float32Array | Uint32Array): Uint8Array {
  return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
}

function typedArrayToBlobPart(data: Float32Array | Uint32Array | Uint8Array): BlobPart {
  return data as unknown as BlobPart;
}

function typedArrayToPlainUint8Array(data: Float32Array | Uint32Array | Uint8Array): Uint8Array {
  const view = data instanceof Uint8Array ? data : new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  const copy = new Uint8Array(view.byteLength);
  copy.set(view);
  return copy;
}

type VolumePyramidLevel = {
  data: Float32Array | Uint32Array;
  dims: { z: number; y: number; x: number };
  voxelSizeUm: { z: number; y: number; x: number };
};

function normalizePath(path: string): string {
  return path.replace(/\\/g, "/").replace(/^\/+/, "").replace(/\/+/g, "/");
}

function parseJson(text: string): any {
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(error instanceof Error ? error.message : "Invalid JSON metadata.");
  }
}

function stripTrailingSlash(path: string): string {
  return path.replace(/\/+$/u, "");
}

async function fetchArrayBufferOrThrow(url: string, signal?: AbortSignal): Promise<ArrayBuffer> {
  const response = await fetch(url, { signal });
  if (!response.ok) {
    throw new Error(`Remote host returned ${response.status} for ${url}.`);
  }
  return await response.arrayBuffer();
}

async function fetchTextOrNull(url: string, signal?: AbortSignal): Promise<string | null> {
  try {
    const response = await fetch(url, { signal });
    if (!response.ok) return null;
    return await response.text();
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    return null;
  }
}

function buildChunkKeys(shape: number[], chunks: number[], separator: string): string[] {
  const counts = shape.map((size, axis) => Math.ceil(size / Math.max(1, chunks[axis] || size)));
  const keys: string[] = [];
  for (let z = 0; z < counts[0]; z += 1) {
    for (let y = 0; y < counts[1]; y += 1) {
      for (let x = 0; x < counts[2]; x += 1) {
        keys.push([z, y, x].join(separator));
      }
    }
  }
  return keys;
}

async function yieldToBrowser() {
  await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
}

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) {
    throw new DOMException("Export canceled", "AbortError");
  }
}

async function createStreamingZipBlob(
  entries: Array<{ path: string; bytes: Uint8Array }>,
  options?: {
    signal?: AbortSignal;
    onProgress?: (progress: ExportPackagingProgress) => void;
    progressLabel?: string;
  }
): Promise<Blob> {
  const chunks: Uint8Array[] = [];
  const zip = new Zip((error, chunk, final) => {
    if (error) {
      throw error;
    }
    if (chunk?.length) {
      chunks.push(chunk.slice());
    }
    if (final) {
      return;
    }
  });
  const total = entries.length;
  let completed = 0;

  try {
    for (const entry of entries) {
      throwIfAborted(options?.signal);
      const file = new ZipPassThrough(entry.path);
      zip.add(file);
      file.push(entry.bytes, true);
      completed += 1;
      options?.onProgress?.({
        completed,
        total,
        label: options?.progressLabel ? `${options.progressLabel}: ${entry.path}` : entry.path,
      });
      if (completed % 4 === 0) {
        await yieldToBrowser();
      }
    }
  } catch (error) {
    zip.terminate();
    throw error;
  }

  return await new Promise<Blob>((resolve, reject) => {
    zip.ondata = (error, chunk, final) => {
      if (error) {
        reject(error);
        return;
      }
      if (chunk?.length) {
        chunks.push(chunk.slice());
      }
      if (final) {
        resolve(new Blob(chunks.map((chunk) => typedArrayToBlobPart(chunk)), { type: "application/zip" }));
      }
    };
    zip.end();
  });
}

function createZipStreamWriter() {
  const chunks: BlobPart[] = [];
  const zip = new Zip();
  zip.ondata = (error, chunk) => {
    if (error) {
      throw error;
    }
    if (chunk?.length) {
      chunks.push(typedArrayToBlobPart(chunk));
    }
  };
  return {
    add(path: string, bytes: Uint8Array) {
      const file = new ZipPassThrough(path);
      zip.add(file);
      file.push(bytes, true);
    },
    async finalize() {
      return await new Promise<Blob>((resolve, reject) => {
        zip.ondata = (error, chunk, final) => {
          if (error) {
            reject(error);
            return;
          }
          if (chunk?.length) {
            chunks.push(typedArrayToBlobPart(chunk));
          }
          if (final) {
            resolve(new Blob(chunks, { type: "application/zip" }));
          }
        };
        zip.end();
      });
    },
    terminate() {
      zip.terminate();
    },
  };
}

function inferSpatialDims(shape: number[]): { z: number; y: number; x: number } {
  if (shape.length < 3) {
    throw new Error("Local Zarr export requires at least 3 spatial dimensions.");
  }
  return {
    z: Math.max(1, Number(shape[shape.length - 3]) || 1),
    y: Math.max(1, Number(shape[shape.length - 2]) || 1),
    x: Math.max(1, Number(shape[shape.length - 1]) || 1),
  };
}

function shouldUseNearestDownsample(source: ExportSourceModel, data: Float32Array | Uint32Array): boolean {
  return source.dataKind === "annotation" || data instanceof Uint32Array;
}

function downsampleVolumeLevel(
  source: ExportSourceModel,
  level: VolumePyramidLevel
): VolumePyramidLevel | null {
  const { z, y, x } = level.dims;
  if (z <= 1 && y <= 1 && x <= 1) return null;
  const nextDims = {
    z: Math.max(1, Math.ceil(z / 2)),
    y: Math.max(1, Math.ceil(y / 2)),
    x: Math.max(1, Math.ceil(x / 2)),
  };
  if (nextDims.z === z && nextDims.y === y && nextDims.x === x) return null;

  const useNearest = shouldUseNearestDownsample(source, level.data);
  const nextData = level.data instanceof Uint32Array
    ? new Uint32Array(nextDims.z * nextDims.y * nextDims.x)
    : new Float32Array(nextDims.z * nextDims.y * nextDims.x);
  const sliceStride = x * y;
  const nextSliceStride = nextDims.x * nextDims.y;

  for (let zz = 0; zz < nextDims.z; zz += 1) {
    const srcZ0 = zz * 2;
    const srcZ1 = Math.min(z, srcZ0 + 2);
    for (let yy = 0; yy < nextDims.y; yy += 1) {
      const srcY0 = yy * 2;
      const srcY1 = Math.min(y, srcY0 + 2);
      for (let xx = 0; xx < nextDims.x; xx += 1) {
        const srcX0 = xx * 2;
        const srcX1 = Math.min(x, srcX0 + 2);
        const targetIndex = zz * nextSliceStride + yy * nextDims.x + xx;

        if (useNearest) {
          const sourceIndex = srcZ0 * sliceStride + srcY0 * x + srcX0;
          nextData[targetIndex] = level.data[sourceIndex];
          continue;
        }

        let sum = 0;
        let count = 0;
        for (let srcZ = srcZ0; srcZ < srcZ1; srcZ += 1) {
          const zOffset = srcZ * sliceStride;
          for (let srcY = srcY0; srcY < srcY1; srcY += 1) {
            const rowOffset = zOffset + srcY * x;
            for (let srcX = srcX0; srcX < srcX1; srcX += 1) {
              sum += level.data[rowOffset + srcX];
              count += 1;
            }
          }
        }
        nextData[targetIndex] = count > 0 ? sum / count : 0;
      }
    }
  }

  return {
    data: nextData,
    dims: nextDims,
    voxelSizeUm: {
      z: level.voxelSizeUm.z * 2,
      y: level.voxelSizeUm.y * 2,
      x: level.voxelSizeUm.x * 2,
    },
  };
}

function countVolumeLevelChunkFiles(level: VolumePyramidLevel) {
  const chunkShape = [
    Math.max(1, Math.min(64, level.dims.z)),
    Math.max(1, Math.min(64, level.dims.y)),
    Math.max(1, Math.min(64, level.dims.x)),
  ];
  const zChunks = Math.ceil(level.dims.z / chunkShape[0]);
  const yChunks = Math.ceil(level.dims.y / chunkShape[1]);
  const xChunks = Math.ceil(level.dims.x / chunkShape[2]);
  return zChunks * yChunks * xChunks;
}

async function writeVolumeLevelToZarrFiles(
  emitFile: (path: string, bytes: Uint8Array) => Promise<void> | void,
  basePath: string,
  level: VolumePyramidLevel,
  source: ExportSourceModel,
  metadataMode: "zarr" | "ome-zarr",
  options?: { signal?: AbortSignal }
) {
  const chunkShape = [
    Math.max(1, Math.min(64, level.dims.z)),
    Math.max(1, Math.min(64, level.dims.y)),
    Math.max(1, Math.min(64, level.dims.x)),
  ];
  const zChunks = Math.ceil(level.dims.z / chunkShape[0]);
  const yChunks = Math.ceil(level.dims.y / chunkShape[1]);
  const xChunks = Math.ceil(level.dims.x / chunkShape[2]);
  const zArrayMeta = {
    zarr_format: 2,
    shape: [level.dims.z, level.dims.y, level.dims.x],
    chunks: chunkShape,
    dtype: level.data instanceof Uint32Array ? "<u4" : "<f4",
    compressor: null,
    fill_value: 0,
    order: "C",
    filters: null,
    dimension_separator: ".",
  };

  await emitFile(`${basePath}.zarray`, encodeText(JSON.stringify(zArrayMeta, null, 2)));
  await emitFile(`${basePath}.zattrs`, encodeText(
    JSON.stringify(
      metadataMode === "ome-zarr"
        ? { _ARRAY_DIMENSIONS: ["z", "y", "x"] }
        : {
            exportedBy: "mouse-brain-viewer",
            contentKind: source.contentKind ?? "intensity",
            voxelSizeUm: level.voxelSizeUm,
          },
      null,
      2
    )
  ));

  const sliceStride = level.dims.x * level.dims.y;
  for (let zChunk = 0; zChunk < zChunks; zChunk += 1) {
    throwIfAborted(options?.signal);
    const zStart = zChunk * chunkShape[0];
    const zSize = Math.min(chunkShape[0], level.dims.z - zStart);
    for (let yChunk = 0; yChunk < yChunks; yChunk += 1) {
      const yStart = yChunk * chunkShape[1];
      const ySize = Math.min(chunkShape[1], level.dims.y - yStart);
      for (let xChunk = 0; xChunk < xChunks; xChunk += 1) {
        const xStart = xChunk * chunkShape[2];
        const xSize = Math.min(chunkShape[2], level.dims.x - xStart);
        const chunkVoxelCount = zSize * ySize * xSize;
        const chunkData = level.data instanceof Uint32Array ? new Uint32Array(chunkVoxelCount) : new Float32Array(chunkVoxelCount);
        let targetOffset = 0;

        for (let localZ = 0; localZ < zSize; localZ += 1) {
          const globalZ = zStart + localZ;
          const zOffset = globalZ * sliceStride;
          for (let localY = 0; localY < ySize; localY += 1) {
            const globalY = yStart + localY;
            const sourceRowStart = zOffset + globalY * level.dims.x + xStart;
            const sourceRowEnd = sourceRowStart + xSize;
            chunkData.set(level.data.subarray(sourceRowStart, sourceRowEnd), targetOffset);
            targetOffset += xSize;
          }
        }

        await emitFile(`${basePath}${zChunk}.${yChunk}.${xChunk}`, typedArrayToPlainUint8Array(chunkData));
      }
      await yieldToBrowser();
    }
  }
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

function createNiftiHeaderBuffer(source: ExportSourceModel, volume: Pick<LoadedVolume, "dims" | "voxelSizeUm" | "data">): ArrayBuffer {
  const isLabelVolume = source.dataKind === "annotation" || volume.data instanceof Uint32Array;
  const headerSize = 352;
  const headerBuffer = new ArrayBuffer(headerSize);
  const view = new DataView(headerBuffer);
  const bytes = new Uint8Array(headerBuffer);
  const dims = [3, volume.dims.x, volume.dims.y, volume.dims.z, 1, 1, 1, 1];
  const pixDims = [1, volume.voxelSizeUm.x ?? 1, volume.voxelSizeUm.y ?? 1, volume.voxelSizeUm.z ?? 1, 1, 1, 1, 1];

  view.setInt32(0, 348, true);
  for (let i = 0; i < dims.length; i += 1) {
    view.setInt16(40 + i * 2, dims[i], true);
  }
  view.setInt16(70, isLabelVolume ? 768 : 16, true);
  view.setInt16(72, 32, true);
  for (let i = 0; i < pixDims.length; i += 1) {
    view.setFloat32(76 + i * 4, pixDims[i], true);
  }
  view.setFloat32(108, 352, true);
  view.setFloat32(112, 1, true);
  view.setFloat32(116, 0, true);

  const description = encodeText(`Mouse Brain Viewer export: ${source.name}`.slice(0, 79));
  bytes.set(description, 148);
  bytes.set(encodeText("n+1\0"), 344);
  return headerBuffer;
}

function createNrrdHeaderBytes(source: ExportSourceModel, volume: Pick<LoadedVolume, "dims" | "voxelSizeUm">): Uint8Array {
  const headerLines = [
    "NRRD0005",
    "# Generated by Mouse Brain Viewer",
    "type: float",
    "dimension: 3",
    `sizes: ${volume.dims.x} ${volume.dims.y} ${volume.dims.z}`,
    "encoding: raw",
    "endian: little",
    "space dimension: 3",
    `space directions: ${formatSpaceDirection(volume.voxelSizeUm.x, volume.voxelSizeUm.y, volume.voxelSizeUm.z)}`,
    "kinds: domain domain domain",
    "space origin: (0,0,0)",
    `content: ${source.name}`,
    "",
  ];
  return encodeText(`${headerLines.join("\n")}\n`);
}

export async function createChunkedLocalZarrVolumeExportBlob(
  source: ExportSourceModel,
  record: StoredLocalDatasetRecord,
  info: LocalDatasetInfo,
  format: "nrrd" | "nii",
  options?: {
    signal?: AbortSignal;
    onProgress?: (progress: ExportPackagingProgress) => void;
  }
): Promise<Blob> {
  if (record.kind !== "tree" || !record.entries?.length) {
    throw new Error("Chunked Zarr export requires a browser-hosted dataset tree.");
  }
  if (info.format !== "zarr" && info.format !== "ome-zarr") {
    throw new Error("Chunked Zarr export is only available for local Zarr datasets.");
  }

  const map = new Map(record.entries.map((entry) => [normalizePath(entry.path), entry]));
  const root = normalizePath(info.treeRootPath ?? "").replace(/\/+$/, "");
  const datasetPath = normalizePath(info.selectedDatasetPath ?? "");
  const arrayMetaEntry = map.get(datasetPath ? `${root}/${datasetPath}/.zarray` : `${root}/.zarray`);
  if (!arrayMetaEntry) {
    throw new Error("Local Zarr export currently supports Zarr v2 arrays only.");
  }

  const arrayMeta = parseJson(await arrayMetaEntry.blob.text());
  const compressor = arrayMeta.compressor ?? null;
  if (compressor && compressor?.id !== "blosc") {
    throw new Error(`Unsupported local Zarr compressor: ${compressor?.id ?? "unknown"}.`);
  }
  if (arrayMeta.order && arrayMeta.order !== "C") {
    throw new Error(`Unsupported Zarr array order: ${arrayMeta.order}.`);
  }

  const shape: number[] = (arrayMeta.shape ?? []).map((value: any) => Number(value));
  const chunks: number[] = (arrayMeta.chunks ?? []).map((value: any) => Number(value));
  if (shape.length !== 3 || chunks.length !== 3) {
    throw new Error("Chunked Zarr export currently supports 3D Zarr arrays only.");
  }

  const dims = inferSpatialDims(shape);
  const voxelSizeUm = info.voxelSizeUm ?? { z: null, y: null, x: null };
  const headerPart: BlobPart =
    format === "nrrd"
      ? typedArrayToBlobPart(createNrrdHeaderBytes(source, { dims, voxelSizeUm }))
      : createNiftiHeaderBuffer(source, {
          dims,
          voxelSizeUm,
          data: new Float32Array(0),
        });

  const parts: BlobPart[] = [headerPart];
  const sep = arrayMeta.dimension_separator === "/" ? "/" : ".";
  const chunkCounts = shape.map((size, axis) => Math.ceil(size / Math.max(1, chunks[axis] || size)));
  const infoType = dtypeInfo(arrayMeta.dtype ?? "<f4");
  const bytesPerSlice = dims.x * dims.y * 4;
  const maxBufferedSliceBytes = 96 * 1024 * 1024;
  const maxSlicesPerPass = Math.max(1, Math.floor(maxBufferedSliceBytes / Math.max(1, bytesPerSlice)));
  const totalChunks = chunkCounts[0] * chunkCounts[1] * chunkCounts[2];
  let processedChunks = 0;

  for (let zChunk = 0; zChunk < chunkCounts[0]; zChunk += 1) {
    throwIfAborted(options?.signal);
    const zStart = zChunk * chunks[0];
    const zDepth = Math.max(0, Math.min(chunks[0], shape[0] - zStart));
    for (let localZBase = 0; localZBase < zDepth; localZBase += maxSlicesPerPass) {
      throwIfAborted(options?.signal);
      const passDepth = Math.min(maxSlicesPerPass, zDepth - localZBase);
      const sliceBuffers = Array.from({ length: passDepth }, () => new Float32Array(dims.x * dims.y));

      for (let yChunk = 0; yChunk < chunkCounts[1]; yChunk += 1) {
        for (let xChunk = 0; xChunk < chunkCounts[2]; xChunk += 1) {
          throwIfAborted(options?.signal);
          const chunkKey = [zChunk, yChunk, xChunk].join(sep);
          const chunkPath = datasetPath ? `${root}/${datasetPath}/${chunkKey}` : `${root}/${chunkKey}`;
          const chunkEntry = map.get(chunkPath);
          if (!chunkEntry) {
            processedChunks += 1;
            options?.onProgress?.({ completed: processedChunks, total: totalChunks, label: `Skipping missing chunk ${chunkKey}` });
            continue;
          }

          const rawBuffer = await chunkEntry.blob.arrayBuffer();
          const chunkBytes = compressor?.id === "blosc"
            ? await decodeBloscChunk(rawBuffer, compressor)
            : new Uint8Array(rawBuffer);
          const view = new DataView(chunkBytes.buffer, chunkBytes.byteOffset, chunkBytes.byteLength);

          const chunkShape = [
            Math.max(0, Math.min(chunks[0], shape[0] - zStart)),
            Math.max(0, Math.min(chunks[1], shape[1] - yChunk * chunks[1])),
            Math.max(0, Math.min(chunks[2], shape[2] - xChunk * chunks[2])),
          ];
          const chunkWidth = chunkShape[2];
          const chunkHeight = chunkShape[1];
          const chunkPlaneStride = chunkWidth * chunkHeight;

          for (let localZOffset = 0; localZOffset < passDepth; localZOffset += 1) {
            const chunkLocalZ = localZBase + localZOffset;
            const sliceBuffer = sliceBuffers[localZOffset];
            for (let localY = 0; localY < chunkHeight; localY += 1) {
              const globalY = yChunk * chunks[1] + localY;
              const targetRowOffset = globalY * dims.x + xChunk * chunks[2];
              const sourceRowOffset = chunkLocalZ * chunkPlaneStride + localY * chunkWidth;
              for (let localX = 0; localX < chunkWidth; localX += 1) {
                const sourceIndex = sourceRowOffset + localX;
                sliceBuffer[targetRowOffset + localX] = readNumber(view, sourceIndex * infoType.bytes, infoType);
              }
            }
          }
          processedChunks += 1;
          options?.onProgress?.({ completed: processedChunks, total: totalChunks, label: `Processing chunk ${chunkKey}` });
          if (processedChunks % 3 === 0) {
            await yieldToBrowser();
          }
        }
      }

      for (const sliceBuffer of sliceBuffers) {
        parts.push(typedArrayToBlobPart(sliceBuffer));
      }
    }
  }

  return new Blob(parts, { type: "application/octet-stream" });
}

export async function createLocalVolumeZarrExportBlob(
  source: ExportSourceModel,
  volume: LoadedVolume,
  format: "zarr" | "ome-zarr",
  rootFolderName?: string,
  options?: {
    signal?: AbortSignal;
    onProgress?: (progress: ExportPackagingProgress) => void;
  }
): Promise<Blob> {
  const writer = createZipStreamWriter();
  const normalizedRoot = rootFolderName ? rootFolderName.replace(/\/+$/u, "") : "";
  const fullPath = (path: string) => (normalizedRoot ? `${normalizedRoot}/${path.replace(/^\/+/u, "")}` : path);
  const emitJson = async (path: string, value: unknown, progress?: ExportPackagingProgress) => {
    throwIfAborted(options?.signal);
    writer.add(fullPath(path), encodeText(JSON.stringify(value, null, 2)));
    if (progress) {
      options?.onProgress?.(progress);
    }
    await yieldToBrowser();
  };
  const withRootPath = (path: string) =>
    normalizedRoot ? `${normalizedRoot}/${path.replace(/^\/+/u, "")}` : path;

  try {
  if (format === "zarr") {
    throwIfAborted(options?.signal);
    const baseLevel: VolumePyramidLevel = {
      data: volume.data,
      dims: { z: volume.dims.z, y: volume.dims.y, x: volume.dims.x },
      voxelSizeUm: {
        z: volume.voxelSizeUm.z ?? 1,
        y: volume.voxelSizeUm.y ?? 1,
        x: volume.voxelSizeUm.x ?? 1,
      },
    };
    const total = 2 + countVolumeLevelChunkFiles(baseLevel);
    let completed = 0;
    await writeVolumeLevelToZarrFiles(
      async (path, bytes) => {
        writer.add(path, bytes);
        completed += 1;
        options?.onProgress?.({ completed, total, label: `Writing Zarr data: ${path}` });
      },
      normalizedRoot ? `${normalizedRoot}/` : "",
      baseLevel,
      source,
      "zarr",
      { signal: options?.signal }
    );
  } else {
    const levels: VolumePyramidLevel[] = [];
    const datasets: Array<{ path: string; coordinateTransformations: Array<{ type: "scale"; scale: [number, number, number] }> }> = [];
    let currentLevel: VolumePyramidLevel | null = {
      data: volume.data,
      dims: { z: volume.dims.z, y: volume.dims.y, x: volume.dims.x },
      voxelSizeUm: {
        z: volume.voxelSizeUm.z ?? 1,
        y: volume.voxelSizeUm.y ?? 1,
        x: volume.voxelSizeUm.x ?? 1,
      },
    };
    let levelIndex = 0;
    while (currentLevel && levelIndex < 3) {
      throwIfAborted(options?.signal);
      levels.push(currentLevel);
      datasets.push({
        path: String(levelIndex),
        coordinateTransformations: [
          {
            type: "scale",
            scale: [currentLevel.voxelSizeUm.z, currentLevel.voxelSizeUm.y, currentLevel.voxelSizeUm.x],
          },
        ],
      });
      if (levelIndex >= 2) break;
      const smallestAxis = Math.min(currentLevel.dims.z, currentLevel.dims.y, currentLevel.dims.x);
      if (smallestAxis <= 32) break;
      currentLevel = downsampleVolumeLevel(source, currentLevel);
      levelIndex += 1;
    }
    const total =
      2 +
      levels.reduce((sum, level) => sum + 2 + countVolumeLevelChunkFiles(level), 0);
    let completed = 0;
    await emitJson(".zgroup", { zarr_format: 2 }, {
      completed: ++completed,
      total,
      label: "Writing OME-Zarr group metadata",
    });
    await emitJson(".zattrs", {
      multiscales: [
        {
          version: "0.4",
          name: source.name,
          axes: [
            { name: "z", type: "space", unit: "micrometer" },
            { name: "y", type: "space", unit: "micrometer" },
            { name: "x", type: "space", unit: "micrometer" },
          ],
          datasets,
        },
      ],
    }, {
      completed: ++completed,
      total,
      label: "Writing OME-Zarr multiscale metadata",
    });
    for (let levelNumber = 0; levelNumber < levels.length; levelNumber += 1) {
      const level = levels[levelNumber];
      await writeVolumeLevelToZarrFiles(
        async (path, bytes) => {
          writer.add(path, bytes);
          completed += 1;
          options?.onProgress?.({ completed, total, label: `Writing OME-Zarr level ${levelNumber + 1}: ${path}` });
        },
        withRootPath(`${levelNumber}/`),
        level,
        source,
        "ome-zarr",
        { signal: options?.signal }
      );
    }
  }
    return await writer.finalize();
  } catch (error) {
    writer.terminate();
    throw error;
  }
}

export async function createRemoteOmeZarrZipBlob(options: {
  url: string;
  rootFolderName: string;
  signal?: AbortSignal;
  onProgress?: (progress: RemoteArchiveProgress) => void;
}): Promise<Blob> {
  const cleanUrl = stripTrailingSlash(options.url);
  const rootFolderName = stripTrailingSlash(options.rootFolderName);
  const rootMetadataText =
    (await fetchTextOrNull(`${cleanUrl}/zarr.json`, options.signal)) ??
    (await fetchTextOrNull(`${cleanUrl}/.zattrs`, options.signal));
  if (!rootMetadataText) {
    throw new Error("Could not read remote OME-Zarr metadata. The host may block browser access or the URL may be invalid.");
  }
  const rootMetadata = parseJson(rootMetadataText);
  const multiscales = Array.isArray(rootMetadata?.multiscales) ? rootMetadata.multiscales : [];
  const primary = multiscales[0];
  const datasets = Array.isArray(primary?.datasets) ? primary.datasets : [];
  if (!datasets.length) {
    throw new Error("Remote archive export currently supports public OME-Zarr datasets only.");
  }

  const files: Array<{ path: string; bytes: Uint8Array }> = [];
  const datasetPlans: Array<{
    datasetPath: string;
    zarrayText: string;
    zattrsText: string | null;
    chunkKeys: string[];
  }> = [];

  for (let index = 0; index < datasets.length; index += 1) {
    const dataset = datasets[index];
    const datasetPath = typeof dataset?.path === "string" ? dataset.path : `${index}`;
    const zarrayText =
      (await fetchTextOrNull(`${cleanUrl}/${datasetPath}/zarr.json`, options.signal)) ??
      (await fetchTextOrNull(`${cleanUrl}/${datasetPath}/.zarray`, options.signal));
    if (!zarrayText) {
      throw new Error(`Could not read remote array metadata for ${datasetPath}.`);
    }
    const zarray = parseJson(zarrayText);
    const shape: number[] = Array.isArray(zarray.shape) ? zarray.shape.map((value: any) => Number(value)) : [];
    const chunks: number[] = Array.isArray(zarray.chunks) ? zarray.chunks.map((value: any) => Number(value)) : [];
    if (shape.length !== 3 || chunks.length !== 3) {
      throw new Error("Remote archive export currently supports 3D OME-Zarr arrays only.");
    }
    const zattrsText =
      (await fetchTextOrNull(`${cleanUrl}/${datasetPath}/.zattrs`, options.signal)) ??
      (await fetchTextOrNull(`${cleanUrl}/${datasetPath}/zarr.json`, options.signal));
    datasetPlans.push({
      datasetPath,
      zarrayText,
      zattrsText,
      chunkKeys: buildChunkKeys(shape, chunks, zarray.dimension_separator === "/" ? "/" : "."),
    });
  }

  const totalFetches =
    1 +
    datasetPlans.length * 2 +
    datasetPlans.reduce((sum, plan) => sum + plan.chunkKeys.length, 0);
  let completed = 0;
  const report = (label: string) => {
    options.onProgress?.({ completed, total: totalFetches, label });
  };

  files.push({ path: `${rootFolderName}/.zattrs`, bytes: encodeText(rootMetadataText) });
  completed += 1;
  report("Fetched root metadata");
  const rootGroupText = await fetchTextOrNull(`${cleanUrl}/.zgroup`, options.signal);
  if (rootGroupText) {
    files.push({ path: `${rootFolderName}/.zgroup`, bytes: encodeText(rootGroupText) });
  } else {
    files.push({ path: `${rootFolderName}/.zgroup`, bytes: encodeText(JSON.stringify({ zarr_format: 2 }, null, 2)) });
  }

  for (const plan of datasetPlans) {
    throwIfAborted(options.signal);
    files.push({ path: `${rootFolderName}/${plan.datasetPath}/.zarray`, bytes: encodeText(plan.zarrayText) });
    completed += 1;
    report(`Fetched metadata for ${plan.datasetPath}`);
    if (plan.zattrsText) {
      files.push({ path: `${rootFolderName}/${plan.datasetPath}/.zattrs`, bytes: encodeText(plan.zattrsText) });
    } else {
      files.push({
        path: `${rootFolderName}/${plan.datasetPath}/.zattrs`,
        bytes: encodeText(JSON.stringify({ _ARRAY_DIMENSIONS: ["z", "y", "x"] }, null, 2)),
      });
    }
    completed += 1;
    report(`Prepared attributes for ${plan.datasetPath}`);
    for (const chunkKey of plan.chunkKeys) {
      const chunkBuffer = await fetchArrayBufferOrThrow(`${cleanUrl}/${plan.datasetPath}/${chunkKey}`, options.signal);
      files.push({ path: `${rootFolderName}/${plan.datasetPath}/${chunkKey}`, bytes: new Uint8Array(chunkBuffer) });
      completed += 1;
      report(`Fetched ${plan.datasetPath}/${chunkKey}`);
      if (completed % 4 === 0) {
        await yieldToBrowser();
      }
    }
  }

  return await createStreamingZipBlob(files, {
    signal: options.signal,
    onProgress: options.onProgress
      ? (progress) => {
          const combinedCompleted = totalFetches + progress.completed;
          const combinedTotal = totalFetches + progress.total;
          options.onProgress?.({
            completed: combinedCompleted,
            total: combinedTotal,
            label: progress.label,
          });
        }
      : undefined,
    progressLabel: "Writing remote archive",
  });
}

function formatSpaceDirection(x: number | null, y: number | null, z: number | null): string {
  const sx = x != null && Number.isFinite(x) ? x : "none";
  const sy = y != null && Number.isFinite(y) ? y : "none";
  const sz = z != null && Number.isFinite(z) ? z : "none";
  return `(${sx},0,0) (0,${sy},0) (0,0,${sz})`;
}

export function canExportVolumeAsNrrd(source: ExportSourceModel): boolean {
  return source.origin === "local" && (source.dataKind === "volume" || source.dataKind === "annotation");
}

export function createNrrdExportBlob(source: ExportSourceModel, volume: LoadedVolume): Blob {
  const isLabelVolume = source.dataKind === "annotation" || volume.data instanceof Uint32Array;
  const headerLines = [
    "NRRD0005",
    "# Generated by Mouse Brain Viewer",
    `type: ${isLabelVolume ? "uint32" : "float"}`,
    "dimension: 3",
    `sizes: ${volume.dims.x} ${volume.dims.y} ${volume.dims.z}`,
    "encoding: raw",
    "endian: little",
    "space dimension: 3",
    `space directions: ${formatSpaceDirection(volume.voxelSizeUm.x, volume.voxelSizeUm.y, volume.voxelSizeUm.z)}`,
    "kinds: domain domain domain",
    "space origin: (0,0,0)",
    `content: ${source.name}`,
    "",
  ];
  const headerBytes = encodeText(`${headerLines.join("\n")}\n`);
  const payloadBytes = typedArrayToByteView(volume.data);
  return new Blob([typedArrayToBlobPart(headerBytes), typedArrayToBlobPart(payloadBytes)], { type: "application/octet-stream" });
}

export function createNiftiExportBlob(source: ExportSourceModel, volume: LoadedVolume): Blob {
  const isLabelVolume = source.dataKind === "annotation" || volume.data instanceof Uint32Array;
  const voxelBytes = typedArrayToByteView(volume.data);
  const headerSize = 352;
  const headerBuffer = new ArrayBuffer(headerSize);
  const view = new DataView(headerBuffer);
  const bytes = new Uint8Array(headerBuffer);

  const dims = [
    3,
    volume.dims.x,
    volume.dims.y,
    volume.dims.z,
    1,
    1,
    1,
    1,
  ];
  const pixDims = [
    1,
    volume.voxelSizeUm.x ?? 1,
    volume.voxelSizeUm.y ?? 1,
    volume.voxelSizeUm.z ?? 1,
    1,
    1,
    1,
    1,
  ];

  view.setInt32(0, 348, true);
  for (let i = 0; i < dims.length; i += 1) {
    view.setInt16(40 + i * 2, dims[i], true);
  }
  view.setInt16(70, isLabelVolume ? 768 : 16, true);
  view.setInt16(72, 32, true);
  for (let i = 0; i < pixDims.length; i += 1) {
    view.setFloat32(76 + i * 4, pixDims[i], true);
  }
  view.setFloat32(108, 352, true);
  view.setFloat32(112, 1, true);
  view.setFloat32(116, 0, true);

  const description = encodeText(`Mouse Brain Viewer export: ${source.name}`.slice(0, 79));
  bytes.set(description, 148);

  const magic = encodeText("n+1\0");
  bytes.set(magic, 344);
  return new Blob([headerBuffer, typedArrayToBlobPart(voxelBytes)], { type: "application/octet-stream" });
}
