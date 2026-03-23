import * as zarr from "zarrita";

export type LoadedVolume = {
  url: string;
  datasetPath: string;
  shape: number[];
  rawShape: number[];
  dims: {
    z: number;
    y: number;
    x: number;
  };
  data: Float32Array;
};

export type Slice2D = {
  pixels: Float32Array;
  width: number;
  height: number;
};

export type SliceTransform = {
  flipX?: boolean;
  flipY?: boolean;
  rotate90?: boolean; // clockwise
  reverseIndex?: boolean; // maps display slice order to data slice order
};

export type ViewerOrientationProfile = {
  xy?: SliceTransform;
  xz?: SliceTransform;
  yz?: SliceTransform;
};

export type SlicePlane = "xy" | "xz" | "yz";

export type Vec3 = {
  x: number;
  y: number;
  z: number;
};

export type ObliqueSliceSpec = {
  normal: Vec3;
  offset?: number; // in voxel-index units relative to center
  width?: number;
  height?: number;
};

type OMEAxis = {
  name?: string;
  type?: string;
};

type OMEDataset = {
  path: string;
  coordinateTransformations?: Array<{
    type: string;
    scale?: number[];
    translation?: number[];
  }>;
};

type OMEAttributes = {
  multiscales?: Array<{
    axes?: OMEAxis[];
    datasets: OMEDataset[];
  }>;
};

export const IDENTITY_PROFILE: ViewerOrientationProfile = {
  xy: {},
  xz: {},
  yz: {},
};

/**
 * Your current working Allen viewer orientation profile.
 */
export const ALLEN_VIEWER_PROFILE: ViewerOrientationProfile = {
  xy: {
    reverseIndex: true,
    flipX: true,
  },
  xz: {
    flipY: true,
  },
  yz: {
    rotate90: true,
    reverseIndex: true,
  },
};

export const ALLEN_OBLIQUE_TRANSFORM: SliceTransform = {};

function stripTrailingSlash(url: string): string {
  return url.replace(/\/+$/, "");
}

async function fetchJsonMaybe(url: string): Promise<any | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

async function readOMEAttributes(baseUrl: string): Promise<OMEAttributes | null> {
  const clean = stripTrailingSlash(baseUrl);

  const zattrs = await fetchJsonMaybe(`${clean}/.zattrs`);
  if (zattrs && Array.isArray(zattrs.multiscales)) {
    return zattrs as OMEAttributes;
  }

  const zarrJson = await fetchJsonMaybe(`${clean}/zarr.json`);
  if (zarrJson?.attributes?.multiscales) {
    return zarrJson.attributes as OMEAttributes;
  }

  return null;
}

function inferSpatialDims(shape: number[]): { z: number; y: number; x: number } {
  if (shape.length < 3) {
    throw new Error(`Invalid OME-Zarr shape: ${JSON.stringify(shape)}`);
  }

  return {
    z: shape[shape.length - 3],
    y: shape[shape.length - 2],
    x: shape[shape.length - 1],
  };
}

function normalizeToFloat01(
  data:
    | Uint8Array
    | Uint16Array
    | Int16Array
    | Int32Array
    | Uint32Array
    | Float32Array
    | Float64Array
): Float32Array {
  let min = Infinity;
  let max = -Infinity;

  for (let i = 0; i < data.length; i += 1) {
    const v = data[i];
    if (v < min) min = v;
    if (v > max) max = v;
  }

  const out = new Float32Array(data.length);
  const range = max > min ? max - min : 1;

  for (let i = 0; i < data.length; i += 1) {
    out[i] = (data[i] - min) / range;
  }

  return out;
}

function computeSpatialOffset(_shape: number[]): number {
  return 0;
}

function index2D(x: number, y: number, width: number): number {
  return y * width + x;
}

function vec3Length(v: Vec3): number {
  return Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
}

export function normalizeVec3(v: Vec3): Vec3 {
  const len = vec3Length(v);
  if (len < 1e-8) {
    return { x: 0, y: 0, z: 1 };
  }
  return {
    x: v.x / len,
    y: v.y / len,
    z: v.z / len,
  };
}

function crossVec3(a: Vec3, b: Vec3): Vec3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

function scaleVec3(v: Vec3, s: number): Vec3 {
  return {
    x: v.x * s,
    y: v.y * s,
    z: v.z * s,
  };
}

function addVec3(a: Vec3, b: Vec3): Vec3 {
  return {
    x: a.x + b.x,
    y: a.y + b.y,
    z: a.z + b.z,
  };
}

function mapViewerNormalToDataNormal(
  normal: Vec3,
  profile: ViewerOrientationProfile = ALLEN_VIEWER_PROFILE
): Vec3 {
  return {
    x: profile.yz?.reverseIndex ? -normal.x : normal.x,
    y: profile.xz?.reverseIndex ? -normal.y : normal.y,
    z: profile.xy?.reverseIndex ? -normal.z : normal.z,
  };
}

function maxAbsPlaneExtentForDirection(
  volume: LoadedVolume,
  dir: Vec3
): number {
  const hx = (volume.dims.x - 1) * 0.5;
  const hy = (volume.dims.y - 1) * 0.5;
  const hz = (volume.dims.z - 1) * 0.5;

  let tMax = Infinity;

  if (Math.abs(dir.x) > 1e-8) {
    tMax = Math.min(tMax, hx / Math.abs(dir.x));
  }
  if (Math.abs(dir.y) > 1e-8) {
    tMax = Math.min(tMax, hy / Math.abs(dir.y));
  }
  if (Math.abs(dir.z) > 1e-8) {
    tMax = Math.min(tMax, hz / Math.abs(dir.z));
  }

  return Number.isFinite(tMax) ? tMax : 0;
}

/**
 * Build an orthonormal basis for a slice plane:
 * - n = slice normal
 * - u, v = in-plane axes
 */
function dotVec3(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function projectVectorOntoPlane(vec: Vec3, normal: Vec3): Vec3 {
  const d = dotVec3(vec, normal);
  return {
    x: vec.x - d * normal.x,
    y: vec.y - d * normal.y,
    z: vec.z - d * normal.z,
  };
}

export function makePlaneBasis(normal: Vec3): {
  u: Vec3;
  v: Vec3;
  n: Vec3;
} {
  const n = normalizeVec3(normal);

  const eps = 0.999;

  // Keep exact orientation for the 3 canonical normals.
  // This preserves the behavior you already fixed.

  // +Z / -Z  -> XY-style
  if (Math.abs(n.z) > eps) {
    return {
      u: { x: -1, y: 0, z: 0 },
      v: { x: 0, y: 1, z: 0 },
      n,
    };
  }

  // +Y / -Y -> XZ-style
  if (Math.abs(n.y) > eps) {
    return {
      u: { x: 1, y: 0, z: 0 },
      v: { x: 0, y: 0, z: 1 },
      n,
    };
  }

  // +X / -X -> YZ-style
  if (Math.abs(n.x) > eps) {
    return {
      u: { x: 0, y: 0, z: -1 },
      v: { x: 0, y: 1, z: 0 },
      n,
    };
  }

  // True arbitrary oblique basis:
  // keep vertical direction as close as possible to +Y,
  // unless the plane is too close to Y, then fall back to +Z.
  let ref: Vec3 =
    Math.abs(dotVec3(n, { x: 0, y: 1, z: 0 })) < 0.95
      ? { x: 0, y: 1, z: 0 }
      : { x: 0, y: 0, z: 1 };

  let v = projectVectorOntoPlane(ref, n);

  if (vec3Length(v) < 1e-8) {
    ref = { x: 0, y: 0, z: 1 };
    v = projectVectorOntoPlane(ref, n);
  }

  v = normalizeVec3(v);

  let u = normalizeVec3(crossVec3(v, n));

  // Stabilize left/right direction so the image does not suddenly flip
  // when the normal changes a little.
  const preferred = Math.abs(n.y) > 0.7
    ? { x: 1, y: 0, z: 0 }   // for Y-like planes, prefer +X horizontally
    : { x: -1, y: 0, z: 0 }; // otherwise prefer -X horizontally

  if (dotVec3(u, preferred) < 0) {
    u = scaleVec3(u, -1);
    v = scaleVec3(v, -1);
  }

  return { u, v, n };
}

function getObliqueDisplayTransform(
  viewerNormal: Vec3,
  profile: ViewerOrientationProfile = ALLEN_VIEWER_PROFILE
): SliceTransform {
  const n = normalizeVec3(viewerNormal);

  const ax = Math.abs(n.x);
  const ay = Math.abs(n.y);
  const az = Math.abs(n.z);

  if (az >= ax && az >= ay) {
    return {
      flipX: !!profile.xy?.flipX,
      flipY: !!profile.xy?.flipY,
      rotate90: !!profile.xy?.rotate90,
    };
  }

  if (ay >= ax && ay >= az) {
    return {
      flipX: !!profile.xz?.flipX,
      flipY: !!profile.xz?.flipY,
      rotate90: !!profile.xz?.rotate90,
    };
  }

  return {};
}

export async function loadLowestResolutionVolume(url: string): Promise<LoadedVolume> {
  const clean = stripTrailingSlash(url);
  const root = zarr.root(new zarr.FetchStore(clean));

  const attrs = await readOMEAttributes(clean);

  const datasetPath =
    attrs?.multiscales?.[0]?.datasets?.[
      attrs.multiscales[0].datasets.length - 1
    ]?.path ?? "0";

  const arr = await zarr.open(root.resolve(datasetPath), { kind: "array" });
  const full = await zarr.get(arr);

  const rawShape = [...full.shape];
  const dims = inferSpatialDims(rawShape);
  const normalized = normalizeToFloat01(
    full.data as
      | Uint8Array
      | Uint16Array
      | Int16Array
      | Int32Array
      | Uint32Array
      | Float32Array
      | Float64Array
  );

  return {
    url: clean,
    datasetPath,
    shape: rawShape,
    rawShape,
    dims,
    data: normalized,
  };
}

export function getVoxel(
  volume: LoadedVolume,
  z: number,
  y: number,
  x: number
): number {
  const { dims, data, rawShape } = volume;
  const baseOffset = computeSpatialOffset(rawShape);
  const index = baseOffset + z * dims.y * dims.x + y * dims.x + x;
  return data[index] ?? 0;
}

export function extractXYSlice(volume: LoadedVolume, zIndex: number): Float32Array {
  const { x, y } = volume.dims;
  const out = new Float32Array(x * y);
  let ptr = 0;

  for (let yy = 0; yy < y; yy += 1) {
    for (let xx = 0; xx < x; xx += 1) {
      out[ptr++] = getVoxel(volume, zIndex, yy, xx);
    }
  }

  return out;
}

export function extractXZSlice(volume: LoadedVolume, yIndex: number): Float32Array {
  const { x, z } = volume.dims;
  const out = new Float32Array(x * z);
  let ptr = 0;

  for (let zz = 0; zz < z; zz += 1) {
    for (let xx = 0; xx < x; xx += 1) {
      out[ptr++] = getVoxel(volume, zz, yIndex, xx);
    }
  }

  return out;
}

export function extractYZSlice(volume: LoadedVolume, xIndex: number): Float32Array {
  const { y, z } = volume.dims;
  const out = new Float32Array(y * z);
  let ptr = 0;

  for (let zz = 0; zz < z; zz += 1) {
    for (let yy = 0; yy < y; yy += 1) {
      out[ptr++] = getVoxel(volume, zz, yy, xIndex);
    }
  }

  return out;
}

export function extractXYSlice2D(volume: LoadedVolume, zIndex: number): Slice2D {
  return {
    pixels: extractXYSlice(volume, zIndex),
    width: volume.dims.x,
    height: volume.dims.y,
  };
}

export function extractXZSlice2D(volume: LoadedVolume, yIndex: number): Slice2D {
  return {
    pixels: extractXZSlice(volume, yIndex),
    width: volume.dims.x,
    height: volume.dims.z,
  };
}

export function extractYZSlice2D(volume: LoadedVolume, xIndex: number): Slice2D {
  return {
    pixels: extractYZSlice(volume, xIndex),
    width: volume.dims.y,
    height: volume.dims.z,
  };
}

export function transformSlice2D(
  input: Slice2D,
  transform: SliceTransform = {}
): Slice2D {
  let current = input;

  if (transform.flipX) {
    const out = new Float32Array(current.pixels.length);

    for (let y = 0; y < current.height; y += 1) {
      for (let x = 0; x < current.width; x += 1) {
        const src = index2D(x, y, current.width);
        const dst = index2D(current.width - 1 - x, y, current.width);
        out[dst] = current.pixels[src];
      }
    }

    current = {
      ...current,
      pixels: out,
    };
  }

  if (transform.flipY) {
    const out = new Float32Array(current.pixels.length);

    for (let y = 0; y < current.height; y += 1) {
      for (let x = 0; x < current.width; x += 1) {
        const src = index2D(x, y, current.width);
        const dst = index2D(x, current.height - 1 - y, current.width);
        out[dst] = current.pixels[src];
      }
    }

    current = {
      ...current,
      pixels: out,
    };
  }

  if (transform.rotate90) {
    const out = new Float32Array(current.pixels.length);
    const newWidth = current.height;
    const newHeight = current.width;

    for (let y = 0; y < current.height; y += 1) {
      for (let x = 0; x < current.width; x += 1) {
        const src = index2D(x, y, current.width);

        const nx = current.height - 1 - y;
        const ny = x;

        const dst = index2D(nx, ny, newWidth);
        out[dst] = current.pixels[src];
      }
    }

    current = {
      pixels: out,
      width: newWidth,
      height: newHeight,
    };
  }

  return current;
}

export function clampSliceIndex(
  volume: LoadedVolume,
  plane: SlicePlane,
  index: number
): number {
  const max =
    plane === "xy"
      ? volume.dims.z - 1
      : plane === "xz"
      ? volume.dims.y - 1
      : volume.dims.x - 1;

  return Math.max(0, Math.min(max, Math.round(index)));
}

export function mapDisplaySliceIndexToDataIndex(
  volume: LoadedVolume,
  plane: SlicePlane,
  displayIndex: number,
  profile: ViewerOrientationProfile = ALLEN_VIEWER_PROFILE
): number {
  const safeDisplayIndex = clampSliceIndex(volume, plane, displayIndex);

  const transform =
    plane === "xy"
      ? profile.xy
      : plane === "xz"
      ? profile.xz
      : profile.yz;

  const max =
    plane === "xy"
      ? volume.dims.z - 1
      : plane === "xz"
      ? volume.dims.y - 1
      : volume.dims.x - 1;

  if (transform?.reverseIndex) {
    return max - safeDisplayIndex;
  }

  return safeDisplayIndex;
}

export function extractOrientedSlice2D(
  volume: LoadedVolume,
  plane: SlicePlane,
  index: number,
  profile: ViewerOrientationProfile = ALLEN_VIEWER_PROFILE
): Slice2D {
  const dataIndex = mapDisplaySliceIndexToDataIndex(volume, plane, index, profile);

  if (plane === "xy") {
    return transformSlice2D(
      extractXYSlice2D(volume, dataIndex),
      profile.xy ?? {}
    );
  }

  if (plane === "xz") {
    return transformSlice2D(
      extractXZSlice2D(volume, dataIndex),
      profile.xz ?? {}
    );
  }

  return transformSlice2D(
    extractYZSlice2D(volume, dataIndex),
    profile.yz ?? {}
  );
}

export function extractOrientedCenterSlices(
  volume: LoadedVolume,
  profile: ViewerOrientationProfile = ALLEN_VIEWER_PROFILE
): {
  xy: Slice2D;
  xz: Slice2D;
  yz: Slice2D;
} {
  const cx = Math.floor(volume.dims.x / 2);
  const cy = Math.floor(volume.dims.y / 2);
  const cz = Math.floor(volume.dims.z / 2);

  return {
    xy: extractOrientedSlice2D(volume, "xy", cz, profile),
    xz: extractOrientedSlice2D(volume, "xz", cy, profile),
    yz: extractOrientedSlice2D(volume, "yz", cx, profile),
  };
}

function clampContinuous(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

export function sampleTrilinear(
  volume: LoadedVolume,
  z: number,
  y: number,
  x: number
): number {
  const zMax = volume.dims.z - 1;
  const yMax = volume.dims.y - 1;
  const xMax = volume.dims.x - 1;

  const zc = clampContinuous(z, 0, zMax);
  const yc = clampContinuous(y, 0, yMax);
  const xc = clampContinuous(x, 0, xMax);

  const z0 = Math.floor(zc);
  const y0 = Math.floor(yc);
  const x0 = Math.floor(xc);

  const z1 = Math.min(z0 + 1, zMax);
  const y1 = Math.min(y0 + 1, yMax);
  const x1 = Math.min(x0 + 1, xMax);

  const dz = zc - z0;
  const dy = yc - y0;
  const dx = xc - x0;

  const c000 = getVoxel(volume, z0, y0, x0);
  const c001 = getVoxel(volume, z0, y0, x1);
  const c010 = getVoxel(volume, z0, y1, x0);
  const c011 = getVoxel(volume, z0, y1, x1);
  const c100 = getVoxel(volume, z1, y0, x0);
  const c101 = getVoxel(volume, z1, y0, x1);
  const c110 = getVoxel(volume, z1, y1, x0);
  const c111 = getVoxel(volume, z1, y1, x1);

  const c00 = c000 * (1 - dx) + c001 * dx;
  const c01 = c010 * (1 - dx) + c011 * dx;
  const c10 = c100 * (1 - dx) + c101 * dx;
  const c11 = c110 * (1 - dx) + c111 * dx;

  const c0 = c00 * (1 - dy) + c01 * dy;
  const c1 = c10 * (1 - dy) + c11 * dy;

  return c0 * (1 - dz) + c1 * dz;
}

/**
 * Extract an arbitrary slice through the volume.
 * The plane is defined by:
 * - center = volume center + normal * offset
 * - normal = arbitrary direction
 *
 * Output pixels are sampled with trilinear interpolation.
 */
export function extractObliqueSlice2D(
  volume: LoadedVolume,
  spec: ObliqueSliceSpec,
  profile: ViewerOrientationProfile = ALLEN_VIEWER_PROFILE
): Slice2D {
  const width = Math.max(8, Math.round(spec.width ?? 256));
  const height = Math.max(8, Math.round(spec.height ?? 256));
  const offset = spec.offset ?? 0;

  const dataNormal = mapViewerNormalToDataNormal(spec.normal, profile);
  const { u, v, n } = makePlaneBasis(dataNormal);

  const center = {
    x: (volume.dims.x - 1) * 0.5,
    y: (volume.dims.y - 1) * 0.5,
    z: (volume.dims.z - 1) * 0.5,
  };

  const sliceCenter = addVec3(center, scaleVec3(n, offset));

  const halfSpanU = maxAbsPlaneExtentForDirection(volume, u);
  const halfSpanV = maxAbsPlaneExtentForDirection(volume, v);

  const out = new Float32Array(width * height);

  for (let j = 0; j < height; j += 1) {
    const tj = height <= 1 ? 0 : j / (height - 1);
    const dv = (tj * 2 - 1) * halfSpanV;

    for (let i = 0; i < width; i += 1) {
      const ti = width <= 1 ? 0 : i / (width - 1);
      const du = (ti * 2 - 1) * halfSpanU;

      const p = addVec3(
        addVec3(sliceCenter, scaleVec3(u, du)),
        scaleVec3(v, dv)
      );

      out[j * width + i] = sampleTrilinear(volume, p.z, p.y, p.x);
    }
  }

  const displayTransform = getObliqueDisplayTransform(spec.normal, profile);

  return transformSlice2D(
    {
      pixels: out,
      width,
      height,
    },
    displayTransform
  );
}

/**
 * Returns the oblique plane frame in normalized [0..1] volume space,
 * which is convenient for building the 3D model matrix in the viewer.
 */
export function getObliquePlaneFrame(
  volume: LoadedVolume,
  spec: ObliqueSliceSpec,
  profile: ViewerOrientationProfile = ALLEN_VIEWER_PROFILE
): {
  center01: Vec3;
  u: Vec3;
  v: Vec3;
  n: Vec3;
  halfSpanU01: number;
  halfSpanV01: number;
} {
  const offset = spec.offset ?? 0;

  const dataNormal = mapViewerNormalToDataNormal(spec.normal, profile);
  const { u, v, n } = makePlaneBasis(dataNormal);

  const center = {
    x: (volume.dims.x - 1) * 0.5,
    y: (volume.dims.y - 1) * 0.5,
    z: (volume.dims.z - 1) * 0.5,
  };

  const sliceCenter = addVec3(center, scaleVec3(n, offset));

  const center01 = {
    x: volume.dims.x <= 1 ? 0 : sliceCenter.x / (volume.dims.x - 1),
    y: volume.dims.y <= 1 ? 0 : sliceCenter.y / (volume.dims.y - 1),
    z: volume.dims.z <= 1 ? 0 : sliceCenter.z / (volume.dims.z - 1),
  };

  const halfSpanU = maxAbsPlaneExtentForDirection(volume, u);
  const halfSpanV = maxAbsPlaneExtentForDirection(volume, v);

  return {
    center01,
    u,
    v,
    n,
    halfSpanU01: volume.dims.x <= 1 ? 0 : halfSpanU / (volume.dims.x - 1),
    halfSpanV01: volume.dims.y <= 1 ? 0 : halfSpanV / (volume.dims.y - 1),
  };
}

export function buildPointCloud(
  volume: LoadedVolume,
  threshold = 0.12,
  step = 1
): Float32Array {
  const { z, y, x } = volume.dims;
  const out: number[] = [];

  const sx = 2 / Math.max(1, x - 1);
  const sy = 2 / Math.max(1, y - 1);
  const sz = 2 / Math.max(1, z - 1);

  for (let zz = 0; zz < z; zz += step) {
    for (let yy = 0; yy < y; yy += step) {
      for (let xx = 0; xx < x; xx += step) {
        const v = getVoxel(volume, zz, yy, xx);
        if (v < threshold) continue;

        const px = -1 + xx * sx;
        const py = -1 + yy * sy;
        const pz = -1 + zz * sz;

        out.push(px, py, pz, v);
      }
    }
  }

  return new Float32Array(out);
}

export function sliceToImageData(
  slice: Float32Array,
  width: number,
  height: number
): ImageData {
  const img = new ImageData(width, height);

  for (let i = 0; i < slice.length; i += 1) {
    const v = Math.max(0, Math.min(255, Math.round(slice[i] * 255)));
    const j = i * 4;
    img.data[j + 0] = v;
    img.data[j + 1] = v;
    img.data[j + 2] = v;
    img.data[j + 3] = 255;
  }

  return img;
}

export function sliceToRgbaBytes(slice: Float32Array): Uint8Array {
  const out = new Uint8Array(slice.length * 4);

  for (let i = 0; i < slice.length; i += 1) {
    const v = Math.max(0, Math.min(255, Math.round(slice[i] * 255)));
    const j = i * 4;
    out[j + 0] = v;
    out[j + 1] = v;
    out[j + 2] = v;
    out[j + 3] = 255;
  }

  return out;
}