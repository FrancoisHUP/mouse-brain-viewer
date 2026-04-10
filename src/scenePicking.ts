import { mat4, vec3, vec4 } from "gl-matrix";

export type SceneRay = {
  origin: vec3;
  direction: vec3;
};

export type RayHit = {
  distance: number;
  position: vec3;
  normal: vec3;
};

export function transformPoint(matrix: mat4, point: readonly [number, number, number]): vec3 {
  const p = vec4.fromValues(point[0], point[1], point[2], 1);
  vec4.transformMat4(p, p, matrix);
  const w = Math.abs(p[3]) > 1e-8 ? p[3] : 1;
  return vec3.fromValues(p[0] / w, p[1] / w, p[2] / w);
}

export function createRayFromScreen(params: {
  canvas: HTMLCanvasElement;
  clientX: number;
  clientY: number;
  projection: mat4;
  view: mat4;
}): SceneRay | null {
  const { canvas, clientX, clientY, projection, view } = params;
  const rect = canvas.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return null;

  const ndcX = ((clientX - rect.left) / rect.width) * 2 - 1;
  const ndcY = 1 - ((clientY - rect.top) / rect.height) * 2;

  const viewProjection = mat4.create();
  mat4.multiply(viewProjection, projection, view);

  const invViewProjection = mat4.create();
  if (!mat4.invert(invViewProjection, viewProjection)) {
    return null;
  }

  const near = vec4.fromValues(ndcX, ndcY, -1, 1);
  const far = vec4.fromValues(ndcX, ndcY, 1, 1);

  vec4.transformMat4(near, near, invViewProjection);
  vec4.transformMat4(far, far, invViewProjection);

  if (Math.abs(near[3]) <= 1e-8 || Math.abs(far[3]) <= 1e-8) {
    return null;
  }

  near[0] /= near[3];
  near[1] /= near[3];
  near[2] /= near[3];
  far[0] /= far[3];
  far[1] /= far[3];
  far[2] /= far[3];

  const origin = vec3.fromValues(near[0], near[1], near[2]);
  const direction = vec3.fromValues(far[0] - near[0], far[1] - near[1], far[2] - near[2]);
  if (vec3.length(direction) <= 1e-8) return null;
  vec3.normalize(direction, direction);

  return { origin, direction };
}

export function intersectRayTriangle(
  ray: SceneRay,
  a: vec3,
  b: vec3,
  c: vec3
): RayHit | null {
  const epsilon = 1e-7;
  const edge1 = vec3.create();
  const edge2 = vec3.create();
  vec3.subtract(edge1, b, a);
  vec3.subtract(edge2, c, a);

  const pvec = vec3.create();
  vec3.cross(pvec, ray.direction, edge2);
  const det = vec3.dot(edge1, pvec);

  if (Math.abs(det) < epsilon) return null;

  const invDet = 1 / det;
  const tvec = vec3.create();
  vec3.subtract(tvec, ray.origin, a);
  const u = vec3.dot(tvec, pvec) * invDet;
  if (u < 0 || u > 1) return null;

  const qvec = vec3.create();
  vec3.cross(qvec, tvec, edge1);
  const v = vec3.dot(ray.direction, qvec) * invDet;
  if (v < 0 || u + v > 1) return null;

  const t = vec3.dot(edge2, qvec) * invDet;
  if (t <= epsilon) return null;

  const position = vec3.create();
  vec3.scaleAndAdd(position, ray.origin, ray.direction, t);

  const normal = vec3.create();
  vec3.cross(normal, edge1, edge2);
  if (vec3.length(normal) <= epsilon) return null;
  vec3.normalize(normal, normal);
  if (vec3.dot(normal, ray.direction) > 0) {
    vec3.scale(normal, normal, -1);
  }

  return {
    distance: t,
    position,
    normal,
  };
}

export function intersectRayQuad(
  ray: SceneRay,
  a: vec3,
  b: vec3,
  c: vec3,
  d: vec3
): RayHit | null {
  const hit1 = intersectRayTriangle(ray, a, b, c);
  const hit2 = intersectRayTriangle(ray, a, c, d);

  if (!hit1) return hit2;
  if (!hit2) return hit1;
  return hit1.distance <= hit2.distance ? hit1 : hit2;
}
