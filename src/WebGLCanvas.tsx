import { useEffect, useMemo, useRef, useState } from "react";
import { mat4, vec3 } from "gl-matrix";
import type { SerializableCameraState } from "./viewerState";
import type { ToolId } from "./BottomToolbar";
import type { LayerTreeNode, LayerItemNode } from "./layerTypes";
import {
  collectLayerIdsInSubtree,
  collectVisibleLayerItems,
  findNodeById,
  isCustomSliceLayer,
} from "./layerTypes";
import {
  ALLEN_VIEWER_PROFILE,
  buildPointCloud,
  clampSliceIndex,
  extractObliqueSlice2D,
  extractOrientedCenterSlices,
  extractOrientedSlice2D,
  getObliquePlaneFrame,
  loadLowestResolutionVolume,
  mapDisplaySliceIndexToDataIndex,
  sliceToRgbaBytes,
  type LoadedVolume,
  type ObliqueSliceSpec,
  type SlicePlane,
  type ViewerOrientationProfile,
} from "./omeZarr";

type CameraState = {
  position: vec3;
  yaw: number;
  pitch: number;
  fovDeg: number;
};

function createShader(
  gl: WebGLRenderingContext,
  type: number,
  source: string
): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) {
    throw new Error("Failed to create shader");
  }

  gl.shaderSource(shader, source);
  gl.compileShader(shader);

  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const info = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`Shader compile error: ${info}`);
  }

  return shader;
}

function createProgram(
  gl: WebGLRenderingContext,
  vertexSource: string,
  fragmentSource: string
): WebGLProgram {
  const vs = createShader(gl, gl.VERTEX_SHADER, vertexSource);
  const fs = createShader(gl, gl.FRAGMENT_SHADER, fragmentSource);

  const program = gl.createProgram();
  if (!program) {
    throw new Error("Failed to create program");
  }

  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const info = gl.getProgramInfoLog(program);
    gl.deleteProgram(program);
    throw new Error(`Program link error: ${info}`);
  }

  return program;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function isOmeZarrLayer(layer: LayerItemNode): boolean {
  return (
    layer.type === "remote" &&
    typeof layer.source === "string" &&
    layer.remoteFormat === "ome-zarr"
  );
}

function getVolumeDisplayScale(volume: LoadedVolume) {
  const vx = volume.dims.x;
  const vy = volume.dims.y;
  const vz = volume.dims.z;

  const base = 1.6;

  return {
    sx: base,
    sy: base * (vy / vx),
    sz: base * (vz / vx),
  };
}

type SliceTextureSet = {
  xy: WebGLTexture;
  xz: WebGLTexture;
  yz: WebGLTexture;
  xySize: { width: number; height: number };
  xzSize: { width: number; height: number };
  yzSize: { width: number; height: number };
};


export default function WebGLCanvas({
  activeTool,
  layerTree,
  selectedNodeId,
  cameraState,
  onCameraStateChange,
}: {
  activeTool: ToolId;
  layerTree: LayerTreeNode[];
  selectedNodeId: string | null;
  cameraState: SerializableCameraState;
  onCameraStateChange?: (next: SerializableCameraState) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const cameraRef = useRef<CameraState>({
    position: vec3.fromValues(
      cameraState.position[0],
      cameraState.position[1],
      cameraState.position[2]
    ),
    yaw: cameraState.yaw,
    pitch: cameraState.pitch,
    fovDeg: cameraState.fovDeg,
  });
  const lastPublishedCameraRef = useRef("");

  const activeToolRef = useRef<ToolId>(activeTool);
  const layerTreeRef = useRef<LayerTreeNode[]>(layerTree);
  const volumeCacheRef = useRef<Map<string, LoadedVolume>>(new Map());
  const pointCloudCacheRef = useRef<Map<string, Float32Array>>(new Map());
  const loadingUrlsRef = useRef<Set<string>>(new Set());

  const [loadTick, setLoadTick] = useState(0);

  useEffect(() => {
    activeToolRef.current = activeTool;
  }, [activeTool]);

  useEffect(() => {
    layerTreeRef.current = layerTree;
  }, [layerTree]);

  useEffect(() => {
    cameraRef.current = {
      position: vec3.fromValues(
        cameraState.position[0],
        cameraState.position[1],
        cameraState.position[2]
      ),
      yaw: cameraState.yaw,
      pitch: cameraState.pitch,
      fovDeg: cameraState.fovDeg,
    };
  }, [cameraState]);

  function publishCameraIfNeeded(camera: CameraState) {
    const next: SerializableCameraState = {
      position: [camera.position[0], camera.position[1], camera.position[2]],
      yaw: camera.yaw,
      pitch: camera.pitch,
      fovDeg: camera.fovDeg,
    };

    const key = JSON.stringify(next);
    if (key === lastPublishedCameraRef.current) return;

    lastPublishedCameraRef.current = key;
    onCameraStateChange?.(next);
  }

  const selectedNode = useMemo(
    () => (selectedNodeId ? findNodeById(layerTree, selectedNodeId) : null),
    [layerTree, selectedNodeId]
  );

  const selectedNodeName = selectedNode?.name ?? "None";

  const highlightedLayerIds = useMemo(() => {
    if (!selectedNodeId || !selectedNode) return new Set<string>();
    return new Set(collectLayerIdsInSubtree(selectedNode));
  }, [selectedNode, selectedNodeId]);

  const visibleLayers = useMemo(
    () => collectVisibleLayerItems(layerTree, true),
    [layerTree]
  );

  const volumeUrlsToLoad = useMemo(() => {
    const urls = new Set<string>();

    for (const layer of visibleLayers) {
      if (isOmeZarrLayer(layer)) {
        urls.add(layer.source as string);
        continue;
      }

      if (isCustomSliceLayer(layer)) {
        const customSource =
          typeof layer.source === "object" && layer.source !== null
            ? layer.source
            : null;

        const volumeNode = customSource?.volumeLayerId
          ? findNodeById(layerTree, customSource.volumeLayerId)
          : null;

        if (
          volumeNode &&
          volumeNode.kind === "layer" &&
          volumeNode.type === "remote" &&
          typeof volumeNode.source === "string" &&
          volumeNode.remoteFormat === "ome-zarr"
        ) {
          urls.add(volumeNode.source);
        }
      }
    }

    return Array.from(urls);
  }, [visibleLayers, layerTree]);

  useEffect(() => {
    for (const url of volumeUrlsToLoad) {
      if (volumeCacheRef.current.has(url)) continue;
      if (loadingUrlsRef.current.has(url)) continue;

      loadingUrlsRef.current.add(url);

      loadLowestResolutionVolume(url)
        .then((volume) => {
          volumeCacheRef.current.set(url, volume);
          pointCloudCacheRef.current.set(url, buildPointCloud(volume, 0.12, 1));
          setLoadTick((v) => v + 1);
        })
        .catch((err) => {
          console.error("Failed to load OME-Zarr volume:", url, err);
        })
        .finally(() => {
          loadingUrlsRef.current.delete(url);
        });
    }
  }, [volumeUrlsToLoad]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const gl = canvas.getContext("webgl");
    if (!gl) {
      throw new Error("WebGL not supported");
    }

    const colorVertexShaderSource = `
      attribute vec3 aPosition;
      uniform mat4 uMVP;
      void main() {
        gl_Position = uMVP * vec4(aPosition, 1.0);
      }
    `;

    const colorFragmentShaderSource = `
      precision mediump float;
      uniform vec4 uColor;
      void main() {
        gl_FragColor = uColor;
      }
    `;

    const pointVertexShaderSource = `
      attribute vec4 aPoint;
      uniform mat4 uMVP;
      varying float vIntensity;
      void main() {
        gl_Position = uMVP * vec4(aPoint.xyz, 1.0);
        gl_PointSize = 1.5 + 2.5 * aPoint.w;
        vIntensity = aPoint.w;
      }
    `;

    const pointFragmentShaderSource = `
      precision mediump float;
      varying float vIntensity;
      void main() {
        vec2 c = gl_PointCoord - vec2(0.5);
        float r = dot(c, c);
        if (r > 0.25) discard;

        float alpha = 0.05 + 0.22 * vIntensity;
        gl_FragColor = vec4(vIntensity, vIntensity, vIntensity, alpha);
      }
    `;

    const textureVertexShaderSource = `
      attribute vec3 aPosition;
      attribute vec2 aTexCoord;
      uniform mat4 uMVP;
      varying vec2 vTexCoord;
      void main() {
        gl_Position = uMVP * vec4(aPosition, 1.0);
        vTexCoord = aTexCoord;
      }
    `;

    const textureFragmentShaderSource = `
      precision mediump float;
      varying vec2 vTexCoord;
      uniform sampler2D uTexture;
      uniform float uAlpha;
      void main() {
        vec4 tex = texture2D(uTexture, vTexCoord);
        gl_FragColor = vec4(tex.rgb, tex.a * uAlpha);
      }
    `;

    const colorProgram = createProgram(gl, colorVertexShaderSource, colorFragmentShaderSource);
    const pointProgram = createProgram(gl, pointVertexShaderSource, pointFragmentShaderSource);
    const textureProgram = createProgram(gl, textureVertexShaderSource, textureFragmentShaderSource);

    const aColorPosition = gl.getAttribLocation(colorProgram, "aPosition");
    const uColorMVP = gl.getUniformLocation(colorProgram, "uMVP");
    const uColor = gl.getUniformLocation(colorProgram, "uColor");

    const aPoint = gl.getAttribLocation(pointProgram, "aPoint");
    const uPointMVP = gl.getUniformLocation(pointProgram, "uMVP");

    const aTexPosition = gl.getAttribLocation(textureProgram, "aPosition");
    const aTexCoord = gl.getAttribLocation(textureProgram, "aTexCoord");
    const uTexMVP = gl.getUniformLocation(textureProgram, "uMVP");
    const uTexture = gl.getUniformLocation(textureProgram, "uTexture");
    const uAlpha = gl.getUniformLocation(textureProgram, "uAlpha");

    if (
      aColorPosition < 0 ||
      !uColorMVP ||
      !uColor ||
      aPoint < 0 ||
      !uPointMVP ||
      aTexPosition < 0 ||
      aTexCoord < 0 ||
      !uTexMVP ||
      !uTexture ||
      !uAlpha
    ) {
      throw new Error("Failed to get shader locations");
    }

    const planeVertices = new Float32Array([
      -1, -1, 0,
       1, -1, 0,
       1,  1, 0,
      -1,  1, 0,
    ]);

    const planeTexCoords = new Float32Array([
      0, 1,
      1, 1,
      1, 0,
      0, 0,
    ]);

    const planeIndices = new Uint16Array([
      0, 1, 2,
      0, 2, 3,
    ]);

    const planeVertexBuffer = gl.createBuffer();
    const planeTexCoordBuffer = gl.createBuffer();
    const planeIndexBuffer = gl.createBuffer();

    if (!planeVertexBuffer || !planeTexCoordBuffer || !planeIndexBuffer) {
      throw new Error("Failed to create plane buffers");
    }

    gl.bindBuffer(gl.ARRAY_BUFFER, planeVertexBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, planeVertices, gl.STATIC_DRAW);

    gl.bindBuffer(gl.ARRAY_BUFFER, planeTexCoordBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, planeTexCoords, gl.STATIC_DRAW);

    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, planeIndexBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, planeIndices, gl.STATIC_DRAW);

    const sliceTextureCache = new Map<string, SliceTextureSet>();
    const customSliceTextureCache = new Map<
      string,
      {
        texture: WebGLTexture;
        width: number;
        height: number;
      }
    >();

    function createSliceTexture(width: number, height: number, pixels: Uint8Array): WebGLTexture {
      const tex = gl.createTexture();
      if (!tex) {
        throw new Error("Failed to create texture");
      }

      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        width,
        height,
        0,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        pixels
      );

      gl.bindTexture(gl.TEXTURE_2D, null);
      return tex;
    }

    function getOrCreateSliceTextures(url: string, volume: LoadedVolume): SliceTextureSet {
      const cached = sliceTextureCache.get(url);
      if (cached) return cached;

      const { xy, xz, yz } = extractOrientedCenterSlices(volume, ALLEN_VIEWER_PROFILE);

      const xyTex = createSliceTexture(
        xy.width,
        xy.height,
        sliceToRgbaBytes(xy.pixels)
      );

      const xzTex = createSliceTexture(
        xz.width,
        xz.height,
        sliceToRgbaBytes(xz.pixels)
      );

      const yzTex = createSliceTexture(
        yz.width,
        yz.height,
        sliceToRgbaBytes(yz.pixels)
      );

      const set: SliceTextureSet = {
        xy: xyTex,
        xz: xzTex,
        yz: yzTex,
        xySize: { width: xy.width, height: xy.height },
        xzSize: { width: xz.width, height: xz.height },
        yzSize: { width: yz.width, height: yz.height },
      };

      sliceTextureCache.set(url, set);
      return set;
    }

    function createCustomSliceTexture(
      cacheKey: string,
      volume: LoadedVolume,
      sliceSpec:
        | {
            mode?: "axis";
            plane: SlicePlane;
            index: number;
          }
        | {
            mode: "oblique";
            normal: { x: number; y: number; z: number };
            offset?: number;
            width?: number;
            height?: number;
          }
    ) {
      const cached = customSliceTextureCache.get(cacheKey);
      if (cached) return cached;

      const slice =
        sliceSpec.mode === "oblique"
          ? extractObliqueSlice2D(
              volume,
              {
                normal: sliceSpec.normal,
                offset: sliceSpec.offset,
                width: sliceSpec.width,
                height: sliceSpec.height,
              },
              ALLEN_VIEWER_PROFILE
            )
          : extractOrientedSlice2D(
              volume,
              sliceSpec.plane,
              sliceSpec.index,
              ALLEN_VIEWER_PROFILE
            );

      const texture = createSliceTexture(
        slice.width,
        slice.height,
        sliceToRgbaBytes(slice.pixels)
      );

      const entry = {
        texture,
        width: slice.width,
        height: slice.height,
      };

      customSliceTextureCache.set(cacheKey, entry);
      return entry;
    }

    function makeSliceModelMatrix(
      volume: LoadedVolume,
      plane: SlicePlane,
      displayIndex: number,
      profile: ViewerOrientationProfile = ALLEN_VIEWER_PROFILE
    ): mat4 {
      const model = mat4.create();

      const { sx, sy, sz } = getVolumeDisplayScale(volume);

      const dataIndex = mapDisplaySliceIndexToDataIndex(
        volume,
        plane,
        displayIndex,
        profile
      );

      if (plane === "xy") {
        const z01 = volume.dims.z <= 1 ? 0 : dataIndex / (volume.dims.z - 1);
        const zPos = -sz + 2 * sz * z01;

        mat4.translate(model, model, [0, 0, zPos]);
        mat4.scale(model, model, [sx, sy, 1]);
        return model;
      }

      if (plane === "xz") {
        const y01 = volume.dims.y <= 1 ? 0 : dataIndex / (volume.dims.y - 1);
        const yPos = -sy + 2 * sy * y01;

        mat4.translate(model, model, [0, yPos, 0]);
        mat4.rotateX(model, model, Math.PI / 2);
        mat4.scale(model, model, [sx, sz, 1]);
        return model;
      }

      const x01 = volume.dims.x <= 1 ? 0 : dataIndex / (volume.dims.x - 1);
      const xPos = -sx + 2 * sx * x01;

      mat4.translate(model, model, [xPos, 0, 0]);
      mat4.rotateY(model, model, Math.PI / 2);
      mat4.scale(model, model, [sz, sy, 1]);
      return model;
    }

    function maxAbsPlaneExtentForObliqueWorld(
      volume: LoadedVolume,
      dir: { x: number; y: number; z: number }
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

    function makeObliqueSliceModelMatrix(
      volume: LoadedVolume,
      spec: ObliqueSliceSpec
    ): mat4 {
      const model = mat4.create();

      const { sx, sy, sz } = getVolumeDisplayScale(volume);
      const frame = getObliquePlaneFrame(volume, spec, ALLEN_VIEWER_PROFILE);

      const cx = -sx + 2 * sx * frame.center01.x;
      const cy = -sy + 2 * sy * frame.center01.y;
      const cz = -sz + 2 * sz * frame.center01.z;

      const halfSpanU = maxAbsPlaneExtentForObliqueWorld(volume, frame.u);
      const halfSpanV = maxAbsPlaneExtentForObliqueWorld(volume, frame.v);

      // Plane local X axis = U, local Y axis = V
      const ux = (2 * sx * frame.u.x) / Math.max(volume.dims.x - 1, 1);
      const uy = (2 * sy * frame.u.y) / Math.max(volume.dims.y - 1, 1);
      const uz = (2 * sz * frame.u.z) / Math.max(volume.dims.z - 1, 1);

      const vx = (2 * sx * frame.v.x) / Math.max(volume.dims.x - 1, 1);
      const vy = (2 * sy * frame.v.y) / Math.max(volume.dims.y - 1, 1);
      const vz = (2 * sz * frame.v.z) / Math.max(volume.dims.z - 1, 1);

      mat4.set(
        model,
        ux * halfSpanU, uy * halfSpanU, uz * halfSpanU, 0,
        vx * halfSpanV, vy * halfSpanV, vz * halfSpanV, 0,
        0,              0,              1,              0,
        cx,             cy,             cz,             1
      );

      return model;
    }

    const camera = cameraRef.current;

    let targetFovDeg = camera.fovDeg;
    const keys = new Set<string>();
    let dragging = false;
    let lastMouseX = 0;
    let lastMouseY = 0;
    let animationFrameId = 0;
    let lastTime = performance.now();

    function resizeCanvas() {
      const dpr = window.devicePixelRatio || 1;
      const width = Math.floor(canvas.clientWidth * dpr);
      const height = Math.floor(canvas.clientHeight * dpr);

      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }

      gl.viewport(0, 0, canvas.width, canvas.height);
    }

    function getForward(): vec3 {
      const yawRad = (camera.yaw * Math.PI) / 180;
      const pitchRad = (camera.pitch * Math.PI) / 180;

      const forward = vec3.fromValues(
        Math.cos(yawRad) * Math.cos(pitchRad),
        Math.sin(pitchRad),
        Math.sin(yawRad) * Math.cos(pitchRad)
      );

      vec3.normalize(forward, forward);
      return forward;
    }

    function updateCamera(dt: number) {
      const speed = 3.0;
      const velocity = speed * dt;
      let moved = false;

      const forward = getForward();
      const worldUp = vec3.fromValues(0, 1, 0);
      const right = vec3.create();
      vec3.cross(right, forward, worldUp);
      vec3.normalize(right, right);

      if (keys.has("w")) {
        vec3.scaleAndAdd(camera.position, camera.position, forward, velocity);
        moved = true;
      }
      if (keys.has("s")) {
        vec3.scaleAndAdd(camera.position, camera.position, forward, -velocity);
        moved = true;
      }
      if (keys.has("a")) {
        vec3.scaleAndAdd(camera.position, camera.position, right, -velocity);
        moved = true;
      }
      if (keys.has("d")) {
        vec3.scaleAndAdd(camera.position, camera.position, right, velocity);
        moved = true;
      }
      if (keys.has("q")) {
        camera.position[1] -= velocity;
        moved = true;
      }
      if (keys.has("e")) {
        camera.position[1] += velocity;
        moved = true;
      }

      if (moved) {
        publishCameraIfNeeded(camera);
      }
    }

    function drawColorPlane(
      mvp: mat4,
      color: [number, number, number, number]
    ) {
      gl.useProgram(colorProgram);
      gl.uniformMatrix4fv(uColorMVP, false, mvp);
      gl.uniform4f(uColor, color[0], color[1], color[2], color[3]);

      gl.bindBuffer(gl.ARRAY_BUFFER, planeVertexBuffer);
      gl.enableVertexAttribArray(aColorPosition);
      gl.vertexAttribPointer(aColorPosition, 3, gl.FLOAT, false, 0, 0);

      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, planeIndexBuffer);
      gl.drawElements(gl.TRIANGLES, planeIndices.length, gl.UNSIGNED_SHORT, 0);
    }

    function drawPointCloud(mvp: mat4, points: Float32Array) {
      const pointBuffer = gl.createBuffer();
      if (!pointBuffer) return;

      gl.useProgram(pointProgram);
      gl.uniformMatrix4fv(uPointMVP, false, mvp);

      gl.bindBuffer(gl.ARRAY_BUFFER, pointBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, points, gl.STATIC_DRAW);

      gl.enableVertexAttribArray(aPoint);
      gl.vertexAttribPointer(aPoint, 4, gl.FLOAT, false, 16, 0);

      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

      gl.drawArrays(gl.POINTS, 0, points.length / 4);

      gl.deleteBuffer(pointBuffer);
    }

    function drawTexturedPlane(
      texture: WebGLTexture,
      mvp: mat4,
      alpha: number
    ) {
      gl.useProgram(textureProgram);
      gl.uniformMatrix4fv(uTexMVP, false, mvp);
      gl.uniform1f(uAlpha, alpha);

      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.uniform1i(uTexture, 0);

      gl.bindBuffer(gl.ARRAY_BUFFER, planeVertexBuffer);
      gl.enableVertexAttribArray(aTexPosition);
      gl.vertexAttribPointer(aTexPosition, 3, gl.FLOAT, false, 0, 0);

      gl.bindBuffer(gl.ARRAY_BUFFER, planeTexCoordBuffer);
      gl.enableVertexAttribArray(aTexCoord);
      gl.vertexAttribPointer(aTexCoord, 2, gl.FLOAT, false, 0, 0);

      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, planeIndexBuffer);

      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

      gl.drawElements(gl.TRIANGLES, planeIndices.length, gl.UNSIGNED_SHORT, 0);

      gl.bindTexture(gl.TEXTURE_2D, null);
    }

    function render(now: number) {
      const dt = Math.min((now - lastTime) / 1000, 0.033);
      lastTime = now;

      resizeCanvas();

      if (activeToolRef.current === "mouse") {
        updateCamera(dt);
      }

      const zoomSharpness = 10;
      const zoomAlpha = 1 - Math.exp(-zoomSharpness * dt);
      camera.fovDeg += (targetFovDeg - camera.fovDeg) * zoomAlpha;

      gl.enable(gl.DEPTH_TEST);
      gl.clearColor(0.05, 0.06, 0.08, 1.0);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

      const aspect = canvas.width / canvas.height;
      const projection = mat4.create();
      mat4.perspective(
        projection,
        (camera.fovDeg * Math.PI) / 180,
        aspect,
        0.1,
        100.0
      );

      const forward = getForward();
      const target = vec3.create();
      vec3.add(target, camera.position, forward);

      const view = mat4.create();
      mat4.lookAt(view, camera.position, target, [0, 1, 0]);

      const layers = collectVisibleLayerItems(layerTreeRef.current, true);

      for (let i = 0; i < layers.length; i += 1) {
        const layer = layers[i];
        const isHighlighted = highlightedLayerIds.has(layer.id);

        if (isOmeZarrLayer(layer) && typeof layer.source === "string") {
          const volume = volumeCacheRef.current.get(layer.source);

          if (volume) {
            if (layer.renderMode === "volume") {
              const points = pointCloudCacheRef.current.get(layer.source);
              if (points) {
                const model = mat4.create();
                const mv = mat4.create();
                const mvp = mat4.create();

                const { sx, sy, sz } = getVolumeDisplayScale(volume);
                mat4.scale(model, model, [sx, sy, sz]);

                mat4.multiply(mv, view, model);
                mat4.multiply(mvp, projection, mv);

                drawPointCloud(mvp, points);
              }
            } else if (layer.renderMode === "slices") {
              const textures = getOrCreateSliceTextures(layer.source, volume);
              const alpha = isHighlighted ? 0.98 : 0.92;

              const { sx, sy, sz } = getVolumeDisplayScale(volume);

            const xyScaleX = sx;
            const xyScaleY = sy;

            const xzScaleX = sx;
            const xzScaleY = sz;

            const yzScaleX = sz;
            const yzScaleY = sy;

              {
                const model = mat4.create();
                const mv = mat4.create();
                const mvp = mat4.create();

                mat4.scale(model, model, [xyScaleX, xyScaleY, 1]);
                mat4.multiply(mv, view, model);
                mat4.multiply(mvp, projection, mv);

                drawTexturedPlane(textures.xy, mvp, alpha);
              }

              {
                const model = mat4.create();
                const mv = mat4.create();
                const mvp = mat4.create();

                mat4.rotateX(model, model, Math.PI / 2);
                mat4.scale(model, model, [xzScaleX, xzScaleY, 1]);
                mat4.multiply(mv, view, model);
                mat4.multiply(mvp, projection, mv);

                drawTexturedPlane(textures.xz, mvp, alpha);
              }

              {
                const model = mat4.create();
                const mv = mat4.create();
                const mvp = mat4.create();

                mat4.rotateY(model, model, Math.PI / 2);
                mat4.scale(model, model, [yzScaleX, yzScaleY, 1]);
                mat4.multiply(mv, view, model);
                mat4.multiply(mvp, projection, mv);

                drawTexturedPlane(textures.yz, mvp, alpha);
              }
            }

            continue;
          }
        }

        if (isCustomSliceLayer(layer)) {
          const sliceSource =
            typeof layer.source === "object" && layer.source !== null
              ? layer.source
              : null;

          const volumeLayerId = sliceSource?.volumeLayerId;
          const sliceParams = layer.sliceParams;

          if (!volumeLayerId || !sliceParams) {
            continue;
          }

          const volumeNode = findNodeById(layerTreeRef.current, volumeLayerId);

          if (
            !volumeNode ||
            volumeNode.kind !== "layer" ||
            volumeNode.type !== "remote" ||
            typeof volumeNode.source !== "string" ||
            volumeNode.remoteFormat !== "ome-zarr"
          ) {
            continue;
          }

          const volume = volumeCacheRef.current.get(volumeNode.source);
          if (!volume) {
            continue;
          }

          let sliceTex:
            | {
                texture: WebGLTexture;
                width: number;
                height: number;
              }
            | undefined;

          let model: mat4;

          const isOblique =
            sliceParams.mode === "oblique" &&
            !!sliceParams.normal &&
            typeof sliceParams.normal.x === "number" &&
            typeof sliceParams.normal.y === "number" &&
            typeof sliceParams.normal.z === "number"

          if (isOblique) {
            const nx = sliceParams.normal.x;
            const ny = sliceParams.normal.y;
            const nz = sliceParams.normal.z;
            const offset = sliceParams.offset ?? 0;
            const width = sliceParams.width ?? 256;
            const height = sliceParams.height ?? 256;

            const cacheKey = [
              volumeNode.source,
              "oblique",
              nx.toFixed(4),
              ny.toFixed(4),
              nz.toFixed(4),
              offset.toFixed(2),
              String(width),
              String(height),
            ].join("|");

            sliceTex = createCustomSliceTexture(cacheKey, volume, {
              mode: "oblique",
              normal: { x: nx, y: ny, z: nz },
              offset,
              width,
              height,
            });

            model = makeObliqueSliceModelMatrix(volume, {
              normal: { x: nx, y: ny, z: nz },
              offset,
              width,
              height,
            });
          } else {
            const safeIndex = clampSliceIndex(volume, sliceParams.plane, sliceParams.index);
            const cacheKey = `${volumeNode.source}|${sliceParams.plane}|${safeIndex}`;

            sliceTex = createCustomSliceTexture(cacheKey, volume, {
              mode: "axis",
              plane: sliceParams.plane,
              index: safeIndex,
            });

            model = makeSliceModelMatrix(
              volume,
              sliceParams.plane,
              safeIndex,
              ALLEN_VIEWER_PROFILE
            );
          }

          const mv = mat4.create();
          const mvp = mat4.create();

          mat4.multiply(mv, view, model);
          mat4.multiply(mvp, projection, mv);

          drawTexturedPlane(
            sliceTex.texture,
            mvp,
            isHighlighted ? 1.0 : sliceParams.opacity ?? 0.92
          );

          continue;
        }

        const model = mat4.create();
        const mv = mat4.create();
        const mvp = mat4.create();

        mat4.translate(model, model, [i * 0.15, i * 0.15, -i * 0.05]);
        mat4.multiply(mv, view, model);
        mat4.multiply(mvp, projection, mv);

        if (activeToolRef.current === "pencil" && isHighlighted) {
          drawColorPlane(mvp, [1.0, 0.84, 0.22, 1.0]);
        } else if (isHighlighted) {
          drawColorPlane(mvp, [0.72, 0.96, 1.0, 1.0]);
        } else {
          drawColorPlane(mvp, [0.18, 0.45, 0.58, 0.72]);
        }
      }

      animationFrameId = requestAnimationFrame(render);
    }

    function onKeyDown(e: KeyboardEvent) {
      if (activeToolRef.current !== "mouse") return;
      keys.add(e.key.toLowerCase());
    }

    function onKeyUp(e: KeyboardEvent) {
      keys.delete(e.key.toLowerCase());
    }

    function onMouseDown(e: MouseEvent) {
      if (activeToolRef.current === "mouse") {
        dragging = true;
        lastMouseX = e.clientX;
        lastMouseY = e.clientY;
        return;
      }

      if (activeToolRef.current === "pencil") {
        console.log("Start drawing on:", selectedNodeId);
      }
    }

    function onMouseUp() {
      dragging = false;
    }

    function onMouseMove(e: MouseEvent) {
      if (activeToolRef.current !== "mouse") return;
      if (!dragging) return;

      const dx = e.clientX - lastMouseX;
      const dy = e.clientY - lastMouseY;
      lastMouseX = e.clientX;
      lastMouseY = e.clientY;

      const sensitivity = 0.2;
      camera.yaw += dx * sensitivity;
      camera.pitch -= dy * sensitivity;
      camera.pitch = clamp(camera.pitch, -89, 89);
      publishCameraIfNeeded(camera);
    }

    function onWheel(e: WheelEvent) {
      if (activeToolRef.current !== "mouse") return;
      e.preventDefault();
      targetFovDeg = clamp(targetFovDeg + e.deltaY * 0.02, 20, 90);
    }

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    canvas.addEventListener("mousedown", onMouseDown);
    window.addEventListener("mouseup", onMouseUp);
    window.addEventListener("mousemove", onMouseMove);
    canvas.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("resize", resizeCanvas);

    resizeCanvas();
    animationFrameId = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      canvas.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("mouseup", onMouseUp);
      window.removeEventListener("mousemove", onMouseMove);
      canvas.removeEventListener("wheel", onWheel);
      window.removeEventListener("resize", resizeCanvas);

      for (const entry of sliceTextureCache.values()) {
        gl.deleteTexture(entry.xy);
        gl.deleteTexture(entry.xz);
        gl.deleteTexture(entry.yz);
      }

      for (const entry of customSliceTextureCache.values()) {
        gl.deleteTexture(entry.texture);
      }

      gl.deleteBuffer(planeVertexBuffer);
      gl.deleteBuffer(planeTexCoordBuffer);
      gl.deleteBuffer(planeIndexBuffer);
      gl.deleteProgram(colorProgram);
      gl.deleteProgram(pointProgram);
      gl.deleteProgram(textureProgram);
    };
  }, [selectedNodeId, highlightedLayerIds, loadTick]);

  const selectedSliceLayer =
    visibleLayers.find(
      (layer) =>
        layer.id === selectedNodeId &&
        (layer.renderMode === "slices" || layer.type === "custom-slice")
    ) ?? null;

  const selectedVolume =
    selectedSliceLayer &&
    (() => {
      if (
        selectedSliceLayer.type === "remote" &&
        typeof selectedSliceLayer.source === "string"
      ) {
        return volumeCacheRef.current.get(selectedSliceLayer.source) ?? null;
      }

      if (selectedSliceLayer.type === "custom-slice") {
        const customSource =
          typeof selectedSliceLayer.source === "object" &&
          selectedSliceLayer.source !== null
            ? selectedSliceLayer.source
            : null;

        const volumeNode = customSource?.volumeLayerId
          ? findNodeById(layerTree, customSource.volumeLayerId)
          : null;

        if (
          volumeNode &&
          volumeNode.kind === "layer" &&
          volumeNode.type === "remote" &&
          typeof volumeNode.source === "string"
        ) {
          return volumeCacheRef.current.get(volumeNode.source) ?? null;
        }
      }

      return null;
    })();

  return (
    <div style={{ width: "100%", height: "100%", position: "relative" }}>
      <canvas
        ref={canvasRef}
        style={{ width: "100%", height: "100%", display: "block" }}
      />

      <div
        style={{
          position: "absolute",
          top: 12,
          left: 12,
          padding: "8px 10px",
          background: "rgba(0,0,0,0.45)",
          color: "white",
          fontFamily: "sans-serif",
          fontSize: 13,
          borderRadius: 8,
          lineHeight: 1.5,
          zIndex: 10,
        }}
      >
        <div>Active tool: {activeTool}</div>
        <div>Selected node: {selectedNodeName}</div>
        <div>Mouse tool: move in 3D</div>
        <div>Pencil tool: annotation mode placeholder</div>
        {selectedVolume && (
          <>
            <div>OME-Zarr level: {selectedVolume.datasetPath}</div>
            <div>
              Dims (z,y,x): {selectedVolume.dims.z}, {selectedVolume.dims.y},{" "}
              {selectedVolume.dims.x}
            </div>
          </>
        )}
      </div>
    </div>
  );
}