import type { StreamlineStats } from "./layerTypes";

const TRK_HEADER_BYTES = 1000;

export type StreamlineReference = {
  dims: { x: number; y: number; z: number };
  voxelSizeMm: { x: number | null; y: number | null; z: number | null };
  fileName?: string | null;
};

export type LoadedStreamlines = {
  url: string;
  linePositions: Float32Array;
  lineColors: Float32Array;
  streamlineCount: number;
  pointCount: number;
  segmentCount: number;
  bounds: {
    min: [number, number, number];
    max: [number, number, number];
  };
};

export type TrkHeader = {
  idString: string;
  dims: { x: number; y: number; z: number };
  voxelSizeMm: { x: number; y: number; z: number };
  nScalars: number;
  nProperties: number;
  voxelOrder: string;
  imageOrientationPatient: [number, number, number, number, number, number];
  nCount: number;
  version: number;
  headerSize: number;
};

export type ParsedTrkInspection = {
  header: TrkHeader;
  streamlineStats: StreamlineStats;
  voxelSizeUm: { x: number | null; y: number | null; z: number | null };
  warning: string | null;
};

export type TckHeader = {
  datatype: "Float32LE" | "Float32BE" | "Float64LE" | "Float64BE";
  fileOffset: number;
  count: number | null;
};

export type ParsedTckInspection = {
  header: TckHeader;
  streamlineStats: StreamlineStats;
  warning: string | null;
};

export type ParsedVtkInspection = {
  streamlineStats: StreamlineStats;
  warning: string | null;
};

export type RawTractogram = {
  streamlines: Float32Array[];
  streamlineCount: number;
  pointCount: number;
  segmentCount: number;
  reference?: StreamlineReference | null;
};

type ParsedVtkLegacyHeader = {
  encoding: "ASCII" | "BINARY";
  dataset: string;
  bodyOffset: number;
};

function trimNulls(value: string): string {
  return value.replace(/\u0000+$/g, "").trim();
}

function isFinitePositive(value: number | null | undefined): value is number {
  return Number.isFinite(value) && Number(value) > 0;
}

function computeBounds(values: Float32Array): LoadedStreamlines["bounds"] {
  if (values.length < 3) {
    return {
      min: [0, 0, 0],
      max: [0, 0, 0],
    };
  }

  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < values.length; i += 3) {
    const x = values[i];
    const y = values[i + 1];
    const z = values[i + 2];
    if (x < min[0]) min[0] = x;
    if (y < min[1]) min[1] = y;
    if (z < min[2]) min[2] = z;
    if (x > max[0]) max[0] = x;
    if (y > max[1]) max[1] = y;
    if (z > max[2]) max[2] = z;
  }
  return { min, max };
}

function safeNormalize3(x: number, y: number, z: number): [number, number, number] {
  const length = Math.hypot(x, y, z);
  if (!Number.isFinite(length) || length <= 1e-8) return [0.577, 0.577, 0.577];
  return [x / length, y / length, z / length];
}

function safeReference(reference: StreamlineReference | null | undefined): StreamlineReference {
  return {
    dims: {
      x: Math.max(1, Math.round(reference?.dims.x ?? 1) || 1),
      y: Math.max(1, Math.round(reference?.dims.y ?? 1) || 1),
      z: Math.max(1, Math.round(reference?.dims.z ?? 1) || 1),
    },
    voxelSizeMm: {
      x: isFinitePositive(reference?.voxelSizeMm.x) ? Number(reference?.voxelSizeMm.x) : null,
      y: isFinitePositive(reference?.voxelSizeMm.y) ? Number(reference?.voxelSizeMm.y) : null,
      z: isFinitePositive(reference?.voxelSizeMm.z) ? Number(reference?.voxelSizeMm.z) : null,
    },
    fileName: reference?.fileName ?? null,
  };
}

function toScenePointFromReference(
  pointX: number,
  pointY: number,
  pointZ: number,
  reference: StreamlineReference
): [number, number, number] {
  const sx = 1.6;
  const sy = sx * (reference.dims.y / reference.dims.x);
  const sz = sx * (reference.dims.z / reference.dims.x);

  const vx = isFinitePositive(reference.voxelSizeMm.x) ? reference.voxelSizeMm.x : 1;
  const vy = isFinitePositive(reference.voxelSizeMm.y) ? reference.voxelSizeMm.y : 1;
  const vz = isFinitePositive(reference.voxelSizeMm.z) ? reference.voxelSizeMm.z : 1;

  const ix = pointX / vx;
  const iy = pointY / vy;
  const iz = pointZ / vz;

  const nx = reference.dims.x > 1 ? ix / Math.max(reference.dims.x - 1, 1) : 0.5;
  const ny = reference.dims.y > 1 ? iy / Math.max(reference.dims.y - 1, 1) : 0.5;
  const nz = reference.dims.z > 1 ? iz / Math.max(reference.dims.z - 1, 1) : 0.5;

  return [
    -sx + 2 * sx * nx,
    -sy + 2 * sy * ny,
    -sz + 2 * sz * nz,
  ];
}

function toScenePointFromBounds(
  pointX: number,
  pointY: number,
  pointZ: number,
  bounds: {
    min: { x: number; y: number; z: number };
    max: { x: number; y: number; z: number };
  }
): [number, number, number] {
  const spanX = Math.max(bounds.max.x - bounds.min.x, 1e-6);
  const spanY = Math.max(bounds.max.y - bounds.min.y, 1e-6);
  const spanZ = Math.max(bounds.max.z - bounds.min.z, 1e-6);
  const longestSpan = Math.max(spanX, spanY, spanZ, 1e-6);
  const centerX = (bounds.min.x + bounds.max.x) * 0.5;
  const centerY = (bounds.min.y + bounds.max.y) * 0.5;
  const centerZ = (bounds.min.z + bounds.max.z) * 0.5;
  const scale = 3.2 / longestSpan;

  return [
    (pointX - centerX) * scale,
    (pointY - centerY) * scale,
    (pointZ - centerZ) * scale,
  ];
}

function buildLineColorBuffer(linePositions: Float32Array): Float32Array {
  const lineColors = new Float32Array(linePositions.length);
  for (let i = 0; i <= linePositions.length - 6; i += 6) {
    const [dx, dy, dz] = safeNormalize3(
      linePositions[i + 3] - linePositions[i],
      linePositions[i + 4] - linePositions[i + 1],
      linePositions[i + 5] - linePositions[i + 2]
    );
    const r = Math.abs(dx);
    const g = Math.abs(dy);
    const b = Math.abs(dz);
    lineColors[i] = r;
    lineColors[i + 1] = g;
    lineColors[i + 2] = b;
    lineColors[i + 3] = r;
    lineColors[i + 4] = g;
    lineColors[i + 5] = b;
  }
  return lineColors;
}

function findNextLineEnd(bytes: Uint8Array, start: number): number {
  let offset = start;
  while (offset < bytes.length && bytes[offset] !== 0x0a && bytes[offset] !== 0x0d) {
    offset += 1;
  }
  return offset;
}

function skipLineBreak(bytes: Uint8Array, start: number): number {
  let offset = start;
  if (offset < bytes.length && bytes[offset] === 0x0d) offset += 1;
  if (offset < bytes.length && bytes[offset] === 0x0a) offset += 1;
  return offset;
}

function readRequiredLegacyVtkLine(bytes: Uint8Array, offset: number, decoder: TextDecoder): { line: string; nextOffset: number } {
  const end = findNextLineEnd(bytes, offset);
  const line = decoder.decode(bytes.subarray(offset, end)).trim();
  return { line, nextOffset: skipLineBreak(bytes, end) };
}

function parseLegacyVtkHeader(buffer: ArrayBuffer): ParsedVtkLegacyHeader {
  const bytes = new Uint8Array(buffer);
  const decoder = new TextDecoder("utf-8");
  let offset = 0;
  const first = readRequiredLegacyVtkLine(bytes, offset, decoder);
  offset = first.nextOffset;
  if (!/^#\s*vtk\b/i.test(first.line)) {
    throw new Error("Unsupported VTK file: missing VTK header.");
  }
  const second = readRequiredLegacyVtkLine(bytes, offset, decoder);
  offset = second.nextOffset;
  const third = readRequiredLegacyVtkLine(bytes, offset, decoder);
  offset = third.nextOffset;
  const encoding = third.line.toUpperCase();
  if (encoding !== "ASCII" && encoding !== "BINARY") {
    throw new Error("Unsupported VTK file: expected legacy ASCII or BINARY encoding.");
  }
  const fourth = readRequiredLegacyVtkLine(bytes, offset, decoder);
  offset = fourth.nextOffset;
  const datasetMatch = fourth.line.match(/^DATASET\s+(.+)$/i);
  if (!datasetMatch) {
    throw new Error("Unsupported VTK file: missing DATASET declaration.");
  }
  return {
    encoding: encoding as ParsedVtkLegacyHeader["encoding"],
    dataset: datasetMatch[1].trim().toUpperCase(),
    bodyOffset: offset,
  };
}

export function parseTrkHeader(buffer: ArrayBuffer): TrkHeader {
  if (buffer.byteLength < TRK_HEADER_BYTES) {
    throw new Error("Unsupported TRK file: header is too small.");
  }
  const view = new DataView(buffer, 0, TRK_HEADER_BYTES);
  const decoder = new TextDecoder("latin1");

  const idString = trimNulls(decoder.decode(new Uint8Array(buffer, 0, 6)));
  const dims = {
    x: view.getInt16(6, true),
    y: view.getInt16(8, true),
    z: view.getInt16(10, true),
  };
  const voxelSizeMm = {
    x: view.getFloat32(12, true),
    y: view.getFloat32(16, true),
    z: view.getFloat32(20, true),
  };
  const nScalars = view.getInt16(36, true);
  const nProperties = view.getInt16(238, true);
  const voxelOrder = trimNulls(decoder.decode(new Uint8Array(buffer, 948, 4)));
  const imageOrientationPatient: TrkHeader["imageOrientationPatient"] = [
    view.getFloat32(956, true),
    view.getFloat32(960, true),
    view.getFloat32(964, true),
    view.getFloat32(968, true),
    view.getFloat32(972, true),
    view.getFloat32(976, true),
  ];
  const nCount = view.getInt32(988, true);
  const version = view.getInt32(992, true);
  const headerSize = view.getInt32(996, true);

  if (!idString.startsWith("TRACK")) {
    throw new Error("Unsupported TRK file: missing TRACK magic header.");
  }
  if (headerSize !== TRK_HEADER_BYTES) {
    throw new Error(`Unsupported TRK file: expected a ${TRK_HEADER_BYTES}-byte header.`);
  }

  return {
    idString,
    dims: {
      x: Math.max(1, Math.round(dims.x) || 1),
      y: Math.max(1, Math.round(dims.y) || 1),
      z: Math.max(1, Math.round(dims.z) || 1),
    },
    voxelSizeMm,
    nScalars: Math.max(0, nScalars),
    nProperties: Math.max(0, nProperties),
    voxelOrder,
    imageOrientationPatient,
    nCount: Math.max(0, nCount),
    version,
    headerSize,
  };
}

export function inspectTrkBuffer(buffer: ArrayBuffer): ParsedTrkInspection {
  const header = parseTrkHeader(buffer);
  const pointStrideBytes = (3 + header.nScalars) * 4;
  const propertyStrideBytes = header.nProperties * 4;
  const view = new DataView(buffer);

  let streamlineCount = 0;
  let pointCount = 0;
  let offset = TRK_HEADER_BYTES;

  while (offset + 4 <= buffer.byteLength) {
    const pointTotal = view.getInt32(offset, true);
    offset += 4;
    if (!Number.isFinite(pointTotal) || pointTotal <= 0) break;
    const nextBytes = pointTotal * pointStrideBytes + propertyStrideBytes;
    if (offset + nextBytes > buffer.byteLength) {
      throw new Error("Unsupported TRK file: streamline payload extends past the end of the file.");
    }
    streamlineCount += 1;
    pointCount += pointTotal;
    offset += nextBytes;
  }

  return {
    header,
    streamlineStats: {
      streamlineCount,
      pointCount,
      segmentCount: Math.max(0, pointCount - streamlineCount),
    },
    voxelSizeUm: {
      x: isFinitePositive(header.voxelSizeMm.x) ? header.voxelSizeMm.x * 1000 : null,
      y: isFinitePositive(header.voxelSizeMm.y) ? header.voxelSizeMm.y * 1000 : null,
      z: isFinitePositive(header.voxelSizeMm.z) ? header.voxelSizeMm.z * 1000 : null,
    },
    warning:
      header.version !== 2
        ? `Imported TRK file version ${header.version}. Basic streamline geometry should load, but this header variant is less common.`
        : null,
  };
}

export function loadTrkBuffer(buffer: ArrayBuffer, url: string): LoadedStreamlines {
  const inspection = inspectTrkBuffer(buffer);
  const { header, streamlineStats } = inspection;
  const view = new DataView(buffer);
  const pointStrideBytes = (3 + header.nScalars) * 4;
  const propertyStrideBytes = header.nProperties * 4;
  const reference: StreamlineReference = {
    dims: header.dims,
    voxelSizeMm: {
      x: header.voxelSizeMm.x,
      y: header.voxelSizeMm.y,
      z: header.voxelSizeMm.z,
    },
  };

  const linePositions = new Float32Array(streamlineStats.segmentCount * 2 * 3);
  let positionOffset = 0;
  let offset = TRK_HEADER_BYTES;

  while (offset + 4 <= buffer.byteLength) {
    const pointTotal = view.getInt32(offset, true);
    offset += 4;
    if (!Number.isFinite(pointTotal) || pointTotal <= 0) break;

    let previousScene: [number, number, number] | null = null;
    for (let pointIndex = 0; pointIndex < pointTotal; pointIndex += 1) {
      const base = offset + pointIndex * pointStrideBytes;
      const scenePoint = toScenePointFromReference(
        view.getFloat32(base, true),
        view.getFloat32(base + 4, true),
        view.getFloat32(base + 8, true),
        reference
      );

      if (previousScene) {
        linePositions[positionOffset++] = previousScene[0];
        linePositions[positionOffset++] = previousScene[1];
        linePositions[positionOffset++] = previousScene[2];
        linePositions[positionOffset++] = scenePoint[0];
        linePositions[positionOffset++] = scenePoint[1];
        linePositions[positionOffset++] = scenePoint[2];
      }

      previousScene = scenePoint;
    }

    offset += pointTotal * pointStrideBytes + propertyStrideBytes;
  }

  return {
    url,
    linePositions,
    lineColors: buildLineColorBuffer(linePositions),
    streamlineCount: streamlineStats.streamlineCount,
    pointCount: streamlineStats.pointCount,
    segmentCount: streamlineStats.segmentCount,
    bounds: computeBounds(linePositions),
  };
}

export function parseTckHeader(buffer: ArrayBuffer): TckHeader {
  const decoder = new TextDecoder("utf-8");
  const bytes = new Uint8Array(buffer);
  const endSentinel = "\nEND\n";
  const text = decoder.decode(bytes.subarray(0, Math.min(buffer.byteLength, 64 * 1024)));
  const endIndex = text.indexOf(endSentinel);
  if (endIndex < 0) {
    throw new Error("Unsupported TCK file: missing END header marker.");
  }
  const headerText = text.slice(0, endIndex + 5);
  const lines = headerText.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines[0] !== "mrtrix tracks") {
    throw new Error("Unsupported TCK file: missing MRtrix tracks header.");
  }

  const values = new Map<string, string>();
  for (const line of lines.slice(1)) {
    if (line === "END") continue;
    const separatorIndex = line.indexOf(":");
    if (separatorIndex <= 0) continue;
    values.set(line.slice(0, separatorIndex).trim().toLowerCase(), line.slice(separatorIndex + 1).trim());
  }

  const datatype = values.get("datatype");
  const fileField = values.get("file");
  if (!datatype || !/^(Float32|Float64)(LE|BE)$/i.test(datatype)) {
    throw new Error("Unsupported TCK file: only Float32/Float64 LE/BE datatypes are supported.");
  }
  if (!fileField) {
    throw new Error("Unsupported TCK file: missing file offset.");
  }
  const fileParts = fileField.split(/\s+/);
  if (fileParts.length < 2 || fileParts[0] !== ".") {
    throw new Error("Unsupported TCK file: only single-file TCK payloads are supported.");
  }
  const fileOffset = Number(fileParts[fileParts.length - 1]);
  if (!Number.isFinite(fileOffset) || fileOffset < 0) {
    throw new Error("Unsupported TCK file: invalid payload offset.");
  }

  const countValue = values.get("count");
  const count = countValue != null && Number.isFinite(Number(countValue)) ? Math.max(0, Math.floor(Number(countValue))) : null;

  return {
    datatype: datatype as TckHeader["datatype"],
    fileOffset: Math.floor(fileOffset),
    count,
  };
}

function readTckNumber(view: DataView, offset: number, datatype: TckHeader["datatype"]): number {
  switch (datatype) {
    case "Float32LE": return view.getFloat32(offset, true);
    case "Float32BE": return view.getFloat32(offset, false);
    case "Float64LE": return view.getFloat64(offset, true);
    case "Float64BE": return view.getFloat64(offset, false);
  }
}

function collectTckPoints(
  buffer: ArrayBuffer,
  header: TckHeader,
  reference?: StreamlineReference | null
): {
  linePositions: Float32Array;
  stats: StreamlineStats;
} {
  const view = new DataView(buffer);
  const componentBytes = header.datatype.startsWith("Float64") ? 8 : 4;
  const strideBytes = componentBytes * 3;
  const points: Array<{ x: number; y: number; z: number; startsNewStreamline: boolean }> = [];
  let offset = header.fileOffset;
  let nextStartsNewStreamline = true;
  const rawBounds = {
    min: { x: Infinity, y: Infinity, z: Infinity },
    max: { x: -Infinity, y: -Infinity, z: -Infinity },
  };

  while (offset + strideBytes <= buffer.byteLength) {
    const x = readTckNumber(view, offset, header.datatype);
    const y = readTckNumber(view, offset + componentBytes, header.datatype);
    const z = readTckNumber(view, offset + componentBytes * 2, header.datatype);
    offset += strideBytes;

    if (Number.isNaN(x) && Number.isNaN(y) && Number.isNaN(z)) {
      nextStartsNewStreamline = true;
      continue;
    }
    if (!Number.isFinite(x) && !Number.isFinite(y) && !Number.isFinite(z)) {
      break;
    }

    if (x < rawBounds.min.x) rawBounds.min.x = x;
    if (y < rawBounds.min.y) rawBounds.min.y = y;
    if (z < rawBounds.min.z) rawBounds.min.z = z;
    if (x > rawBounds.max.x) rawBounds.max.x = x;
    if (y > rawBounds.max.y) rawBounds.max.y = y;
    if (z > rawBounds.max.z) rawBounds.max.z = z;

    points.push({ x, y, z, startsNewStreamline: nextStartsNewStreamline });
    nextStartsNewStreamline = false;
  }

  const positions: number[] = [];
  let streamlineCount = 0;
  let pointCount = 0;
  let previousScene: [number, number, number] | null = null;

  for (const point of points) {
    if (point.startsNewStreamline) {
      previousScene = null;
      streamlineCount += 1;
    }
    const scenePoint = reference
      ? toScenePointFromReference(point.x, point.y, point.z, reference)
      : toScenePointFromBounds(point.x, point.y, point.z, rawBounds);
    if (previousScene) {
      positions.push(
        previousScene[0], previousScene[1], previousScene[2],
        scenePoint[0], scenePoint[1], scenePoint[2]
      );
    }
    pointCount += 1;
    previousScene = scenePoint;
  }

  return {
    linePositions: new Float32Array(positions),
    stats: {
      streamlineCount,
      pointCount,
      segmentCount: positions.length / 6,
    },
  };
}

export function inspectTckBuffer(buffer: ArrayBuffer, reference?: StreamlineReference | null): ParsedTckInspection {
  const header = parseTckHeader(buffer);
  const ref = reference ? safeReference(reference) : null;
  const { stats } = collectTckPoints(buffer, header, ref);
  return {
    header,
    streamlineStats: stats,
    warning: reference
      ? null
      : "Imported TCK streamlines without a companion reference image. Geometry can load, but spatial registration may not match other datasets until a reference volume is provided alongside the TCK file.",
  };
}

export function loadTckBuffer(buffer: ArrayBuffer, url: string, reference?: StreamlineReference | null): LoadedStreamlines {
  const header = parseTckHeader(buffer);
  const ref = reference ? safeReference(reference) : null;
  const { linePositions, stats } = collectTckPoints(buffer, header, ref);
  return {
    url,
    linePositions,
    lineColors: buildLineColorBuffer(linePositions),
    streamlineCount: stats.streamlineCount,
    pointCount: stats.pointCount,
    segmentCount: stats.segmentCount,
    bounds: computeBounds(linePositions),
  };
}

function tokenizeVtkText(text: string): string[] {
  return text
    .replace(/\r/g, "\n")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean);
}

function parseVtkPolylineText(text: string): {
  linePositions: Float32Array;
  stats: StreamlineStats;
} {
  const normalized = text.replace(/\r\n/g, "\n");
  if (!/^#\s*vtk\b/im.test(normalized)) {
    throw new Error("Unsupported VTK file: missing VTK header.");
  }
  if (!/\bASCII\b/i.test(normalized)) {
    throw new Error("Unsupported VTK file: only legacy ASCII VTK PolyData is supported right now.");
  }
  if (!/\bDATASET\s+POLYDATA\b/i.test(normalized)) {
    throw new Error("Unsupported VTK file: expected a legacy POLYDATA dataset.");
  }

  const tokens = tokenizeVtkText(normalized);
  const pointsIndex = tokens.findIndex((token) => token.toUpperCase() === "POINTS");
  if (pointsIndex < 0 || pointsIndex + 2 >= tokens.length) {
    throw new Error("Unsupported VTK file: missing POINTS section.");
  }
  const pointTotal = Number(tokens[pointsIndex + 1]);
  if (!Number.isFinite(pointTotal) || pointTotal <= 0) {
    throw new Error("Unsupported VTK file: invalid POINTS count.");
  }
  const pointDataStart = pointsIndex + 3;
  const pointDataEnd = pointDataStart + pointTotal * 3;
  if (pointDataEnd > tokens.length) {
    throw new Error("Unsupported VTK file: POINTS section is truncated.");
  }

  const points: Array<[number, number, number]> = [];
  const rawBounds = {
    min: { x: Infinity, y: Infinity, z: Infinity },
    max: { x: -Infinity, y: -Infinity, z: -Infinity },
  };
  for (let i = 0; i < pointTotal; i += 1) {
    const x = Number(tokens[pointDataStart + i * 3]);
    const y = Number(tokens[pointDataStart + i * 3 + 1]);
    const z = Number(tokens[pointDataStart + i * 3 + 2]);
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
      throw new Error("Unsupported VTK file: POINTS contains invalid coordinates.");
    }
    points.push([x, y, z]);
    if (x < rawBounds.min.x) rawBounds.min.x = x;
    if (y < rawBounds.min.y) rawBounds.min.y = y;
    if (z < rawBounds.min.z) rawBounds.min.z = z;
    if (x > rawBounds.max.x) rawBounds.max.x = x;
    if (y > rawBounds.max.y) rawBounds.max.y = y;
    if (z > rawBounds.max.z) rawBounds.max.z = z;
  }

  const linesIndex = tokens.findIndex((token, index) => index >= pointDataEnd && token.toUpperCase() === "LINES");
  if (linesIndex < 0 || linesIndex + 2 >= tokens.length) {
    throw new Error("Unsupported VTK file: missing LINES section.");
  }
  const streamlineCount = Number(tokens[linesIndex + 1]);
  const listValueCount = Number(tokens[linesIndex + 2]);
  if (!Number.isFinite(streamlineCount) || streamlineCount < 0 || !Number.isFinite(listValueCount) || listValueCount < 0) {
    throw new Error("Unsupported VTK file: invalid LINES header.");
  }

  let cursor = linesIndex + 3;
  const linePositions: number[] = [];
  let parsedStreamlineCount = 0;
  let parsedPointCount = 0;
  for (let lineIndex = 0; lineIndex < streamlineCount; lineIndex += 1) {
    if (cursor >= tokens.length) {
      throw new Error("Unsupported VTK file: LINES section is truncated.");
    }
    const polylinePointTotal = Number(tokens[cursor]);
    cursor += 1;
    if (!Number.isFinite(polylinePointTotal) || polylinePointTotal <= 0) {
      throw new Error("Unsupported VTK file: invalid polyline length in LINES section.");
    }
    let previousScene: [number, number, number] | null = null;
    for (let pointIndex = 0; pointIndex < polylinePointTotal; pointIndex += 1) {
      if (cursor >= tokens.length) {
        throw new Error("Unsupported VTK file: polyline indices are truncated.");
      }
      const vertexIndex = Number(tokens[cursor]);
      cursor += 1;
      if (!Number.isFinite(vertexIndex) || vertexIndex < 0 || vertexIndex >= points.length) {
        throw new Error("Unsupported VTK file: polyline references an out-of-range point index.");
      }
      const [x, y, z] = points[vertexIndex];
      const scenePoint = toScenePointFromBounds(x, y, z, rawBounds);
      if (previousScene) {
        linePositions.push(
          previousScene[0], previousScene[1], previousScene[2],
          scenePoint[0], scenePoint[1], scenePoint[2]
        );
      }
      previousScene = scenePoint;
      parsedPointCount += 1;
    }
    parsedStreamlineCount += 1;
  }

  return {
    linePositions: new Float32Array(linePositions),
    stats: {
      streamlineCount: parsedStreamlineCount,
      pointCount: parsedPointCount,
      segmentCount: linePositions.length / 6,
    },
  };
}

function parseVtkPolylineBinary(buffer: ArrayBuffer, bodyOffset: number): {
  linePositions: Float32Array;
  stats: StreamlineStats;
} {
  const bytes = new Uint8Array(buffer);
  const decoder = new TextDecoder("utf-8");
  let offset = bodyOffset;

  const pointsLine = readRequiredLegacyVtkLine(bytes, offset, decoder);
  offset = pointsLine.nextOffset;
  const pointsMatch = pointsLine.line.match(/^POINTS\s+(\d+)\s+(\S+)$/i);
  if (!pointsMatch) {
    throw new Error("Unsupported VTK file: missing POINTS section.");
  }
  const pointTotal = Number(pointsMatch[1]);
  const pointType = pointsMatch[2].toLowerCase();
  if (!Number.isFinite(pointTotal) || pointTotal <= 0) {
    throw new Error("Unsupported VTK file: invalid POINTS count.");
  }
  const pointComponentBytes = pointType === "float" ? 4 : pointType === "double" ? 8 : 0;
  if (!pointComponentBytes) {
    throw new Error(`Unsupported VTK file: unsupported POINTS datatype ${pointsMatch[2]}.`);
  }
  const pointByteLength = pointTotal * 3 * pointComponentBytes;
  if (offset + pointByteLength > buffer.byteLength) {
    throw new Error("Unsupported VTK file: POINTS section is truncated.");
  }
  const pointView = new DataView(buffer, offset, pointByteLength);
  const points: Array<[number, number, number]> = [];
  const rawBounds = {
    min: { x: Infinity, y: Infinity, z: Infinity },
    max: { x: -Infinity, y: -Infinity, z: -Infinity },
  };
  for (let i = 0; i < pointTotal; i += 1) {
    const base = i * 3 * pointComponentBytes;
    const x = pointComponentBytes === 4 ? pointView.getFloat32(base, false) : pointView.getFloat64(base, false);
    const y = pointComponentBytes === 4 ? pointView.getFloat32(base + pointComponentBytes, false) : pointView.getFloat64(base + pointComponentBytes, false);
    const z = pointComponentBytes === 4 ? pointView.getFloat32(base + pointComponentBytes * 2, false) : pointView.getFloat64(base + pointComponentBytes * 2, false);
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
      throw new Error("Unsupported VTK file: POINTS contains invalid coordinates.");
    }
    points.push([x, y, z]);
    if (x < rawBounds.min.x) rawBounds.min.x = x;
    if (y < rawBounds.min.y) rawBounds.min.y = y;
    if (z < rawBounds.min.z) rawBounds.min.z = z;
    if (x > rawBounds.max.x) rawBounds.max.x = x;
    if (y > rawBounds.max.y) rawBounds.max.y = y;
    if (z > rawBounds.max.z) rawBounds.max.z = z;
  }
  offset += pointByteLength;
  offset = skipLineBreak(bytes, offset);

  const linesLine = readRequiredLegacyVtkLine(bytes, offset, decoder);
  offset = linesLine.nextOffset;
  const linesMatch = linesLine.line.match(/^LINES\s+(\d+)\s+(\d+)$/i);
  if (!linesMatch) {
    throw new Error("Unsupported VTK file: missing LINES section.");
  }
  const streamlineCount = Number(linesMatch[1]);
  const listValueCount = Number(linesMatch[2]);
  if (!Number.isFinite(streamlineCount) || streamlineCount < 0 || !Number.isFinite(listValueCount) || listValueCount < 0) {
    throw new Error("Unsupported VTK file: invalid LINES header.");
  }
  const lineByteLength = listValueCount * 4;
  if (offset + lineByteLength > buffer.byteLength) {
    throw new Error("Unsupported VTK file: LINES section is truncated.");
  }
  const lineView = new DataView(buffer, offset, lineByteLength);
  const linePositions: number[] = [];
  let cursor = 0;
  let parsedStreamlineCount = 0;
  let parsedPointCount = 0;
  for (let lineIndex = 0; lineIndex < streamlineCount; lineIndex += 1) {
    if (cursor + 4 > lineByteLength) {
      throw new Error("Unsupported VTK file: polyline lengths are truncated.");
    }
    const polylinePointTotal = lineView.getInt32(cursor, false);
    cursor += 4;
    if (!Number.isFinite(polylinePointTotal) || polylinePointTotal <= 0) {
      throw new Error("Unsupported VTK file: invalid polyline length in LINES section.");
    }
    let previousScene: [number, number, number] | null = null;
    for (let pointIndex = 0; pointIndex < polylinePointTotal; pointIndex += 1) {
      if (cursor + 4 > lineByteLength) {
        throw new Error("Unsupported VTK file: polyline indices are truncated.");
      }
      const vertexIndex = lineView.getInt32(cursor, false);
      cursor += 4;
      if (vertexIndex < 0 || vertexIndex >= points.length) {
        throw new Error("Unsupported VTK file: polyline references an out-of-range point index.");
      }
      const [x, y, z] = points[vertexIndex];
      const scenePoint = toScenePointFromBounds(x, y, z, rawBounds);
      if (previousScene) {
        linePositions.push(
          previousScene[0], previousScene[1], previousScene[2],
          scenePoint[0], scenePoint[1], scenePoint[2]
        );
      }
      previousScene = scenePoint;
      parsedPointCount += 1;
    }
    parsedStreamlineCount += 1;
  }

  return {
    linePositions: new Float32Array(linePositions),
    stats: {
      streamlineCount: parsedStreamlineCount,
      pointCount: parsedPointCount,
      segmentCount: linePositions.length / 6,
    },
  };
}

function parseVtkPolylineBuffer(buffer: ArrayBuffer): {
  linePositions: Float32Array;
  stats: StreamlineStats;
  encoding: "ASCII" | "BINARY";
} {
  const header = parseLegacyVtkHeader(buffer);
  if (header.dataset !== "POLYDATA") {
    throw new Error("Unsupported VTK file: expected a legacy POLYDATA dataset.");
  }
  if (header.encoding === "ASCII") {
    const decoder = new TextDecoder("utf-8");
    const text = decoder.decode(new Uint8Array(buffer));
    const parsed = parseVtkPolylineText(text);
    return { ...parsed, encoding: "ASCII" };
  }
  const parsed = parseVtkPolylineBinary(buffer, header.bodyOffset);
  return { ...parsed, encoding: "BINARY" };
}

export function inspectVtkText(text: string): ParsedVtkInspection {
  const { stats } = parseVtkPolylineText(text);
  return {
    streamlineStats: stats,
    warning: "Imported VTK streamlines using legacy ASCII PolyData line parsing.",
  };
}

export function loadVtkText(text: string, url: string): LoadedStreamlines {
  const { linePositions, stats } = parseVtkPolylineText(text);
  return {
    url,
    linePositions,
    lineColors: buildLineColorBuffer(linePositions),
    streamlineCount: stats.streamlineCount,
    pointCount: stats.pointCount,
    segmentCount: stats.segmentCount,
    bounds: computeBounds(linePositions),
  };
}

export function inspectVtkBuffer(buffer: ArrayBuffer): ParsedVtkInspection {
  const parsed = parseVtkPolylineBuffer(buffer);
  return {
    streamlineStats: parsed.stats,
    warning: `Imported VTK streamlines using legacy ${parsed.encoding} PolyData line parsing.`,
  };
}

export function loadVtkBuffer(buffer: ArrayBuffer, url: string): LoadedStreamlines {
  const parsed = parseVtkPolylineBuffer(buffer);
  return {
    url,
    linePositions: parsed.linePositions,
    lineColors: buildLineColorBuffer(parsed.linePositions),
    streamlineCount: parsed.stats.streamlineCount,
    pointCount: parsed.stats.pointCount,
    segmentCount: parsed.stats.segmentCount,
    bounds: computeBounds(parsed.linePositions),
  };
}

function countRawTractogram(streamlines: Float32Array[]) {
  let pointCount = 0;
  let segmentCount = 0;
  for (const streamline of streamlines) {
    const points = Math.floor(streamline.length / 3);
    pointCount += points;
    segmentCount += Math.max(0, points - 1);
  }
  return { pointCount, segmentCount };
}

function computeRawBounds(streamlines: Float32Array[]) {
  const bounds = {
    min: { x: Infinity, y: Infinity, z: Infinity },
    max: { x: -Infinity, y: -Infinity, z: -Infinity },
  };
  for (const streamline of streamlines) {
    for (let i = 0; i < streamline.length; i += 3) {
      const x = streamline[i];
      const y = streamline[i + 1];
      const z = streamline[i + 2];
      if (x < bounds.min.x) bounds.min.x = x;
      if (y < bounds.min.y) bounds.min.y = y;
      if (z < bounds.min.z) bounds.min.z = z;
      if (x > bounds.max.x) bounds.max.x = x;
      if (y > bounds.max.y) bounds.max.y = y;
      if (z > bounds.max.z) bounds.max.z = z;
    }
  }
  if (!Number.isFinite(bounds.min.x)) {
    return {
      min: { x: 0, y: 0, z: 0 },
      max: { x: 1, y: 1, z: 1 },
    };
  }
  return bounds;
}

export function parseTrkRawBuffer(buffer: ArrayBuffer): RawTractogram {
  const header = parseTrkHeader(buffer);
  const view = new DataView(buffer);
  const pointStrideBytes = (3 + Math.max(0, header.nScalars)) * 4;
  const propertyStrideBytes = Math.max(0, header.nProperties) * 4;
  let offset = TRK_HEADER_BYTES;
  const streamlines: Float32Array[] = [];
  while (offset + 4 <= buffer.byteLength) {
    const pointTotal = view.getInt32(offset, true);
    offset += 4;
    if (!Number.isFinite(pointTotal) || pointTotal <= 0) break;
    const nextBytes = pointTotal * pointStrideBytes + propertyStrideBytes;
    if (offset + nextBytes > buffer.byteLength) {
      throw new Error("Unsupported TRK file: streamline payload extends past the end of the file.");
    }
    const points = new Float32Array(pointTotal * 3);
    for (let pointIndex = 0; pointIndex < pointTotal; pointIndex += 1) {
      const base = offset + pointIndex * pointStrideBytes;
      points[pointIndex * 3] = view.getFloat32(base, true);
      points[pointIndex * 3 + 1] = view.getFloat32(base + 4, true);
      points[pointIndex * 3 + 2] = view.getFloat32(base + 8, true);
    }
    streamlines.push(points);
    offset += nextBytes;
  }
  const counts = countRawTractogram(streamlines);
  return {
    streamlines,
    streamlineCount: streamlines.length,
    pointCount: counts.pointCount,
    segmentCount: counts.segmentCount,
    reference: {
      dims: header.dims,
      voxelSizeMm: header.voxelSizeMm,
    },
  };
}

export function parseTckRawBuffer(buffer: ArrayBuffer, reference?: StreamlineReference | null): RawTractogram {
  const header = parseTckHeader(buffer);
  const view = new DataView(buffer);
  const componentBytes = header.datatype.startsWith("Float64") ? 8 : 4;
  const strideBytes = componentBytes * 3;
  let offset = header.fileOffset;
  const streamlines: Float32Array[] = [];
  let current: number[] = [];
  while (offset + strideBytes <= buffer.byteLength) {
    const x = readTckNumber(view, offset, header.datatype);
    const y = readTckNumber(view, offset + componentBytes, header.datatype);
    const z = readTckNumber(view, offset + componentBytes * 2, header.datatype);
    offset += strideBytes;
    if (Number.isNaN(x) && Number.isNaN(y) && Number.isNaN(z)) {
      if (current.length > 0) {
        streamlines.push(Float32Array.from(current));
        current = [];
      }
      continue;
    }
    if (!Number.isFinite(x) && !Number.isFinite(y) && !Number.isFinite(z)) {
      break;
    }
    current.push(x, y, z);
  }
  if (current.length > 0) {
    streamlines.push(Float32Array.from(current));
  }
  const counts = countRawTractogram(streamlines);
  return {
    streamlines,
    streamlineCount: streamlines.length,
    pointCount: counts.pointCount,
    segmentCount: counts.segmentCount,
    reference: reference ? safeReference(reference) : null,
  };
}

export function parseVtkRawBuffer(buffer: ArrayBuffer): RawTractogram {
  const header = parseLegacyVtkHeader(buffer);
  if (header.dataset !== "POLYDATA") {
    throw new Error("Unsupported VTK file: expected a legacy POLYDATA dataset.");
  }
  const streamlines: Float32Array[] = [];
  if (header.encoding === "ASCII") {
    const decoder = new TextDecoder("utf-8");
    const text = decoder.decode(new Uint8Array(buffer));
    const tokens = tokenizeVtkText(text.replace(/\r\n/g, "\n"));
    const pointsIndex = tokens.findIndex((token) => token.toUpperCase() === "POINTS");
    if (pointsIndex < 0 || pointsIndex + 2 >= tokens.length) {
      throw new Error("Unsupported VTK file: missing POINTS section.");
    }
    const pointTotal = Number(tokens[pointsIndex + 1]);
    const pointDataStart = pointsIndex + 3;
    const points: Array<[number, number, number]> = [];
    for (let i = 0; i < pointTotal; i += 1) {
      points.push([
        Number(tokens[pointDataStart + i * 3]),
        Number(tokens[pointDataStart + i * 3 + 1]),
        Number(tokens[pointDataStart + i * 3 + 2]),
      ]);
    }
    const linesIndex = tokens.findIndex((token, index) => index >= pointDataStart + pointTotal * 3 && token.toUpperCase() === "LINES");
    if (linesIndex < 0 || linesIndex + 2 >= tokens.length) {
      throw new Error("Unsupported VTK file: missing LINES section.");
    }
    const streamlineCount = Number(tokens[linesIndex + 1]);
    let cursor = linesIndex + 3;
    for (let lineIndex = 0; lineIndex < streamlineCount; lineIndex += 1) {
      const polylinePointTotal = Number(tokens[cursor++]);
      const streamline = new Float32Array(polylinePointTotal * 3);
      for (let pointIndex = 0; pointIndex < polylinePointTotal; pointIndex += 1) {
        const vertexIndex = Number(tokens[cursor++]);
        const [x, y, z] = points[vertexIndex];
        streamline[pointIndex * 3] = x;
        streamline[pointIndex * 3 + 1] = y;
        streamline[pointIndex * 3 + 2] = z;
      }
      streamlines.push(streamline);
    }
  } else {
    const bytes = new Uint8Array(buffer);
    const decoder = new TextDecoder("utf-8");
    let offset = header.bodyOffset;
    const pointsLine = readRequiredLegacyVtkLine(bytes, offset, decoder);
    offset = pointsLine.nextOffset;
    const pointsMatch = pointsLine.line.match(/^POINTS\s+(\d+)\s+(\S+)$/i);
    if (!pointsMatch) throw new Error("Unsupported VTK file: missing POINTS section.");
    const pointTotal = Number(pointsMatch[1]);
    const pointType = pointsMatch[2].toLowerCase();
    const pointComponentBytes = pointType === "float" ? 4 : pointType === "double" ? 8 : 0;
    if (!pointComponentBytes) throw new Error(`Unsupported VTK file: unsupported POINTS datatype ${pointsMatch[2]}.`);
    const pointView = new DataView(buffer, offset, pointTotal * 3 * pointComponentBytes);
    const points: Array<[number, number, number]> = [];
    for (let i = 0; i < pointTotal; i += 1) {
      const base = i * 3 * pointComponentBytes;
      points.push([
        pointComponentBytes === 4 ? pointView.getFloat32(base, false) : pointView.getFloat64(base, false),
        pointComponentBytes === 4 ? pointView.getFloat32(base + pointComponentBytes, false) : pointView.getFloat64(base + pointComponentBytes, false),
        pointComponentBytes === 4 ? pointView.getFloat32(base + pointComponentBytes * 2, false) : pointView.getFloat64(base + pointComponentBytes * 2, false),
      ]);
    }
    offset += pointTotal * 3 * pointComponentBytes;
    offset = skipLineBreak(bytes, offset);
    const linesLine = readRequiredLegacyVtkLine(bytes, offset, decoder);
    offset = linesLine.nextOffset;
    const linesMatch = linesLine.line.match(/^LINES\s+(\d+)\s+(\d+)$/i);
    if (!linesMatch) throw new Error("Unsupported VTK file: missing LINES section.");
    const streamlineCount = Number(linesMatch[1]);
    const listValueCount = Number(linesMatch[2]);
    const lineView = new DataView(buffer, offset, listValueCount * 4);
    let cursor = 0;
    for (let lineIndex = 0; lineIndex < streamlineCount; lineIndex += 1) {
      const polylinePointTotal = lineView.getInt32(cursor, false);
      cursor += 4;
      const streamline = new Float32Array(polylinePointTotal * 3);
      for (let pointIndex = 0; pointIndex < polylinePointTotal; pointIndex += 1) {
        const vertexIndex = lineView.getInt32(cursor, false);
        cursor += 4;
        const [x, y, z] = points[vertexIndex];
        streamline[pointIndex * 3] = x;
        streamline[pointIndex * 3 + 1] = y;
        streamline[pointIndex * 3 + 2] = z;
      }
      streamlines.push(streamline);
    }
  }
  const counts = countRawTractogram(streamlines);
  return {
    streamlines,
    streamlineCount: streamlines.length,
    pointCount: counts.pointCount,
    segmentCount: counts.segmentCount,
    reference: null,
  };
}

export function createTckBlob(tractogram: RawTractogram): Blob {
  const encoder = new TextEncoder();
  let headerText = "";
  let headerSize = 0;
  for (let i = 0; i < 4; i += 1) {
    headerText = [
      "mrtrix tracks",
      `count: ${tractogram.streamlineCount}`,
      "datatype: Float32LE",
      `file: . ${headerSize}`,
      "END",
      "",
    ].join("\n");
    headerSize = encoder.encode(headerText).byteLength;
  }
  const payload = new ArrayBuffer((tractogram.pointCount + tractogram.streamlineCount + 1) * 12);
  const view = new DataView(payload);
  let offset = 0;
  for (const streamline of tractogram.streamlines) {
    for (let i = 0; i < streamline.length; i += 3) {
      view.setFloat32(offset, streamline[i], true);
      view.setFloat32(offset + 4, streamline[i + 1], true);
      view.setFloat32(offset + 8, streamline[i + 2], true);
      offset += 12;
    }
    view.setFloat32(offset, Number.NaN, true);
    view.setFloat32(offset + 4, Number.NaN, true);
    view.setFloat32(offset + 8, Number.NaN, true);
    offset += 12;
  }
  view.setFloat32(offset, Number.POSITIVE_INFINITY, true);
  view.setFloat32(offset + 4, Number.POSITIVE_INFINITY, true);
  view.setFloat32(offset + 8, Number.POSITIVE_INFINITY, true);
  return new Blob([encoder.encode(headerText), payload], { type: "application/octet-stream" });
}

export function createVtkBlob(tractogram: RawTractogram): Blob {
  const pointLines: string[] = [];
  const lineRows: string[] = [];
  let globalPointIndex = 0;
  let totalListValues = 0;
  for (const streamline of tractogram.streamlines) {
    const pointCount = Math.floor(streamline.length / 3);
    const indices: number[] = [];
    for (let i = 0; i < streamline.length; i += 3) {
      pointLines.push(`${streamline[i]} ${streamline[i + 1]} ${streamline[i + 2]}`);
      indices.push(globalPointIndex++);
    }
    totalListValues += pointCount + 1;
    lineRows.push(`${pointCount} ${indices.join(" ")}`);
  }
  const text = [
    "# vtk DataFile Version 3.0",
    "Generated by Mouse Brain Viewer",
    "ASCII",
    "DATASET POLYDATA",
    `POINTS ${tractogram.pointCount} float`,
    ...pointLines,
    `LINES ${tractogram.streamlineCount} ${totalListValues}`,
    ...lineRows,
    "",
  ].join("\n");
  return new Blob([text], { type: "application/octet-stream" });
}

export function createTrkBlob(tractogram: RawTractogram): Blob {
  const reference = tractogram.reference ? safeReference(tractogram.reference) : null;
  const bounds = computeRawBounds(tractogram.streamlines);
  const voxelSizeMm = {
    x: reference?.voxelSizeMm.x ?? 1,
    y: reference?.voxelSizeMm.y ?? 1,
    z: reference?.voxelSizeMm.z ?? 1,
  };
  const dims = reference?.dims ?? {
    x: Math.max(1, Math.ceil((bounds.max.x - bounds.min.x) / (voxelSizeMm.x || 1)) + 1),
    y: Math.max(1, Math.ceil((bounds.max.y - bounds.min.y) / (voxelSizeMm.y || 1)) + 1),
    z: Math.max(1, Math.ceil((bounds.max.z - bounds.min.z) / (voxelSizeMm.z || 1)) + 1),
  };
  const header = new ArrayBuffer(TRK_HEADER_BYTES);
  const view = new DataView(header);
  const bytes = new Uint8Array(header);
  bytes.set(new TextEncoder().encode("TRACK"), 0);
  view.setInt16(6, dims.x, true);
  view.setInt16(8, dims.y, true);
  view.setInt16(10, dims.z, true);
  view.setFloat32(12, voxelSizeMm.x || 1, true);
  view.setFloat32(16, voxelSizeMm.y || 1, true);
  view.setFloat32(20, voxelSizeMm.z || 1, true);
  bytes.set(new TextEncoder().encode("LPS"), 948);
  view.setInt32(988, tractogram.streamlineCount, true);
  view.setInt32(992, 2, true);
  view.setInt32(996, TRK_HEADER_BYTES, true);
  const payload = new ArrayBuffer(tractogram.streamlines.reduce((sum, streamline) => sum + 4 + Math.floor(streamline.length / 3) * 12, 0));
  const payloadView = new DataView(payload);
  let offset = 0;
  for (const streamline of tractogram.streamlines) {
    const pointCount = Math.floor(streamline.length / 3);
    payloadView.setInt32(offset, pointCount, true);
    offset += 4;
    for (let i = 0; i < streamline.length; i += 3) {
      payloadView.setFloat32(offset, streamline[i], true);
      payloadView.setFloat32(offset + 4, streamline[i + 1], true);
      payloadView.setFloat32(offset + 8, streamline[i + 2], true);
      offset += 12;
    }
  }
  return new Blob([header, payload], { type: "application/octet-stream" });
}
