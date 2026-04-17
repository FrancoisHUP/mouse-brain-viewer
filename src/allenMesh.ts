import { mat4 } from "gl-matrix";
import { ALLEN_VIEWER_PROFILE } from "./omeZarr";

export type LoadedMesh = {
  url: string;
  linePositions: Float32Array;
  trianglePositions: Float32Array;
  bounds: {
    min: [number, number, number];
    max: [number, number, number];
  };
};

type MeshOrientationTweak = {
  flipX: boolean;
  flipY: boolean;
  flipZ: boolean;
  rotateXQuarterTurns: 0 | 1 | 2 | 3;
  rotateYQuarterTurns: 0 | 1 | 2 | 3;
  rotateZQuarterTurns: 0 | 1 | 2 | 3;
};

type MeshBoundsInfo = {
  minX: number;
  minY: number;
  minZ: number;
  maxX: number;
  maxY: number;
  maxZ: number;
  sizeX: number;
  sizeY: number;
  sizeZ: number;
  centerX: number;
  centerY: number;
  centerZ: number;
};

const ALLEN_REFERENCE_DIMS_10UM = {
  x: 1320,
  y: 800,
  z: 1140,
};


const ALLEN_MESH_AXIS_CORRECTION = {
  // Targeted correction after centering/orientation.
  // In the current Allen mesh orientation, X maps to the front↔back brain extent.
  x: 0.92,
  y: 1.10,
  z: 1.34,
};
const ALLEN_MESH_CONFIG = {
  orientation: {
    flipX: false,
    flipY: true,
    flipZ: false,
    rotateXQuarterTurns: 0,
    rotateYQuarterTurns: 1,
    rotateZQuarterTurns: 0,
  } satisfies MeshOrientationTweak,
};

export function getMeshCacheKey(url: string): string {
  return url;
}

async function loadText(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch mesh: ${res.status} ${res.statusText}`);
  }
  return await res.text();
}

function computeBoundsFromVertices(
  vertices: Array<[number, number, number]>
): LoadedMesh["bounds"] {
  if (vertices.length === 0) {
    return { min: [0, 0, 0], max: [1, 1, 1] };
  }

  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];

  for (const [x, y, z] of vertices) {
    if (x < min[0]) min[0] = x;
    if (y < min[1]) min[1] = y;
    if (z < min[2]) min[2] = z;
    if (x > max[0]) max[0] = x;
    if (y > max[1]) max[1] = y;
    if (z > max[2]) max[2] = z;
  }

  return { min, max };
}

function getBoundsInfo(mesh: LoadedMesh): MeshBoundsInfo {
  const minX = mesh.bounds.min[0];
  const minY = mesh.bounds.min[1];
  const minZ = mesh.bounds.min[2];
  const maxX = mesh.bounds.max[0];
  const maxY = mesh.bounds.max[1];
  const maxZ = mesh.bounds.max[2];

  return {
    minX,
    minY,
    minZ,
    maxX,
    maxY,
    maxZ,
    sizeX: Math.max(maxX - minX, 1e-6),
    sizeY: Math.max(maxY - minY, 1e-6),
    sizeZ: Math.max(maxZ - minZ, 1e-6),
    centerX: (minX + maxX) * 0.5,
    centerY: (minY + maxY) * 0.5,
    centerZ: (minZ + maxZ) * 0.5,
  };
}

function parseObjMesh(
  text: string
): Omit<LoadedMesh, "url" | "bounds"> & {
  vertices: Array<[number, number, number]>;
} {
  const vertices: Array<[number, number, number]> = [];
  const lineSegments: number[] = [];
  const triangles: number[] = [];

  const pushSegment = (aIndex: number, bIndex: number) => {
    const a = vertices[aIndex];
    const b = vertices[bIndex];
    if (!a || !b) return;
    lineSegments.push(a[0], a[1], a[2], b[0], b[1], b[2]);
  };

  const pushTriangle = (aIndex: number, bIndex: number, cIndex: number) => {
    const a = vertices[aIndex];
    const b = vertices[bIndex];
    const c = vertices[cIndex];
    if (!a || !b || !c) return;

    triangles.push(
      a[0], a[1], a[2],
      b[0], b[1], b[2],
      c[0], c[1], c[2]
    );
  };

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    if (line.startsWith("v ")) {
      const parts = line.split(/\s+/);
      if (parts.length >= 4) {
        vertices.push([
          Number(parts[1]),
          Number(parts[2]),
          Number(parts[3]),
        ]);
      }
      continue;
    }

    if (line.startsWith("l ")) {
      const indices = line
        .split(/\s+/)
        .slice(1)
        .map((token) => Number(token.split("/")[0]) - 1)
        .filter(
          (value) =>
            Number.isInteger(value) &&
            value >= 0 &&
            value < vertices.length
        );

      for (let i = 0; i < indices.length - 1; i += 1) {
        pushSegment(indices[i], indices[i + 1]);
      }
      continue;
    }

    if (line.startsWith("f ")) {
      const indices = line
        .split(/\s+/)
        .slice(1)
        .map((token) => Number(token.split("/")[0]) - 1)
        .filter(
          (value) =>
            Number.isInteger(value) &&
            value >= 0 &&
            value < vertices.length
        );

      if (indices.length >= 3) {
        for (let i = 1; i < indices.length - 1; i += 1) {
          pushTriangle(indices[0], indices[i], indices[i + 1]);
        }
      }

      for (let i = 0; i < indices.length; i += 1) {
        pushSegment(indices[i], indices[(i + 1) % indices.length]);
      }
    }
  }

  return {
    vertices,
    linePositions: new Float32Array(lineSegments),
    trianglePositions: new Float32Array(triangles),
  };
}

export async function loadObjMesh(url: string): Promise<LoadedMesh> {
  const meshText = await loadText(url);
  const parsed = parseObjMesh(meshText);

  return {
    url,
    linePositions: parsed.linePositions,
    trianglePositions: parsed.trianglePositions,
    bounds: computeBoundsFromVertices(parsed.vertices),
  };
}

function getAllenReferenceDisplayScale() {
  const vx = ALLEN_REFERENCE_DIMS_10UM.x;
  const vy = ALLEN_REFERENCE_DIMS_10UM.y;
  const vz = ALLEN_REFERENCE_DIMS_10UM.z;
  const base = 1.6;

  return {
    sx: base,
    sy: base * (vy / vx),
    sz: base * (vz / vx),
  };
}

function applyQuarterTurns(model: mat4, tweak: MeshOrientationTweak) {
  const halfPi = Math.PI * 0.5;

  for (let i = 0; i < tweak.rotateXQuarterTurns; i += 1) {
    mat4.rotateX(model, model, halfPi);
  }
  for (let i = 0; i < tweak.rotateYQuarterTurns; i += 1) {
    mat4.rotateY(model, model, halfPi);
  }
  for (let i = 0; i < tweak.rotateZQuarterTurns; i += 1) {
    mat4.rotateZ(model, model, halfPi);
  }
}

function applyAxisFlips(model: mat4, tweak: MeshOrientationTweak) {
  mat4.scale(model, model, [
    tweak.flipX ? -1 : 1,
    tweak.flipY ? -1 : 1,
    tweak.flipZ ? -1 : 1,
  ]);
}

function applyManualOrientation(model: mat4) {
  applyAxisFlips(model, ALLEN_MESH_CONFIG.orientation);
  applyQuarterTurns(model, ALLEN_MESH_CONFIG.orientation);
}

function applyAllenViewerCorrections(model: mat4) {
  if (ALLEN_VIEWER_PROFILE.yz?.reverseIndex) {
    mat4.scale(model, model, [-1, 1, 1]);
  }

  if (ALLEN_VIEWER_PROFILE.xy?.reverseIndex) {
    mat4.translate(model, model, [0, 0, 1]);
    mat4.scale(model, model, [1, 1, -1]);
  }
}

function applyCenteredBoundsNormalization(model: mat4, bounds: MeshBoundsInfo) {
  mat4.scale(model, model, [
    2 / bounds.sizeX,
    2 / bounds.sizeY,
    2 / bounds.sizeZ,
  ]);
  mat4.translate(model, model, [
    -bounds.centerX,
    -bounds.centerY,
    -bounds.centerZ,
  ]);
}

function applyAllenDisplayScale(model: mat4) {
  const { sx, sy, sz } = getAllenReferenceDisplayScale();
  mat4.scale(model, model, [
    sx * ALLEN_MESH_AXIS_CORRECTION.x,
    sy * ALLEN_MESH_AXIS_CORRECTION.y,
    sz * ALLEN_MESH_AXIS_CORRECTION.z,
  ]);
}

export function getAllenMeshModelMatrix(mesh: LoadedMesh): mat4 {
  const bounds = getBoundsInfo(mesh);
  const model = mat4.create();

  // Final mapping:
  // OBJ mesh -> centered normalized box [-1, 1] -> Allen orientation -> Allen display scale.
  // This keeps the mesh centered at the world origin and scaled to the same display box
  // as the built-in Allen volume, instead of using old hand-tuned offsets.
  applyAllenDisplayScale(model);
  applyManualOrientation(model);
  applyAllenViewerCorrections(model);
  applyCenteredBoundsNormalization(model, bounds);

  return model;
}
