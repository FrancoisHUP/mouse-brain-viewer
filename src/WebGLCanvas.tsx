import { useEffect, useMemo, useRef, useState } from "react";
import { mat4, vec3 } from "gl-matrix";
import type { SerializableCameraState, CameraControlMode } from "./viewerState";
import type { ToolId } from "./BottomToolbar";
import type { LayerTreeNode, LayerItemNode, RemoteContentKind, RemoteOmeResolution } from "./layerTypes";
import {
  collectLayerIdsInSubtree,
  collectVisibleLayerItems,
  findNodeById,
  isCustomSliceLayer,
  isRemoteMeshLayer,
} from "./layerTypes";
import {
  ALLEN_CUSTOM_SLICE_PROFILE,
  ALLEN_VOLUME_PROFILE,
  clampSliceIndex,
  extractObliqueSlice2D,
  extractOrientedCenterSlices,
  extractOrientedSlice2D,
  getObliquePlaneFrame,
  loadVolumeAtResolution,
  mapDisplaySliceIndexToDataIndex,
  sliceToRgbaBytes,
  type LoadedVolume,
  type ObliqueSliceSpec,
  type SlicePlane,
  type ViewerOrientationProfile,
} from "./omeZarr";
import { annotationSliceToRgbaBytes } from "./annotationColors";
import {
  getAllenMeshModelMatrix,
  getMeshCacheKey,
  loadObjMesh,
  type LoadedMesh,
} from "./allenMesh";

type CameraState = {
  mode: CameraControlMode;
  position: vec3;
  yaw: number;
  pitch: number;
  fovDeg: number;
};

type SliceTextureSet = {
  xy: WebGLTexture;
  xz: WebGLTexture;
  yz: WebGLTexture;
  xySize: { width: number; height: number };
  xzSize: { width: number; height: number };
  yzSize: { width: number; height: number };
};

type AxisSliceTextureEntry = {
  texture: WebGLTexture;
  width: number;
  height: number;
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

function hexToRgb01(hex: string): [number, number, number] {
  const normalized = hex.trim().replace("#", "");
  const safe =
    normalized.length === 3
      ? normalized
          .split("")
          .map((c) => c + c)
          .join("")
      : normalized;

  if (!/^[0-9a-fA-F]{6}$/.test(safe)) {
    return [11 / 255, 15 / 255, 20 / 255];
  }

  const r = parseInt(safe.slice(0, 2), 16) / 255;
  const g = parseInt(safe.slice(2, 4), 16) / 255;
  const b = parseInt(safe.slice(4, 6), 16) / 255;
  return [r, g, b];
}

function isOmeZarrLayer(layer: LayerItemNode): boolean {
  return (
    layer.type === "remote" &&
    typeof layer.source === "string" &&
    layer.remoteFormat === "ome-zarr"
  );
}

function isMeshLayer(layer: LayerItemNode): boolean {
  return (
    layer.type === "remote" &&
    typeof layer.source === "string" &&
    layer.remoteFormat === "mesh-obj"
  );
}

type CustomSliceSourceRef = {
  volumeLayerId?: string | null;
};

function hasVolumeLayerId(source: unknown): source is CustomSliceSourceRef {
  return !!source && typeof source === "object" && "volumeLayerId" in source;
}

function isAxisAlignedSliceParams(
  params: unknown
): params is { plane: SlicePlane; index: number; opacity?: number } {
  return (
    !!params &&
    typeof params === "object" &&
    "plane" in params &&
    "index" in params
  );
}

function getRemoteLayerResolution(layer: LayerItemNode): RemoteOmeResolution {
  return layer.remoteResolution ?? "100um";
}

function getRemoteLayerContentKind(layer: LayerItemNode): RemoteContentKind {
  return layer.remoteContentKind ?? "intensity";
}

function getRemoteLayerResolutionUm(layer: LayerItemNode): 10 | 25 | 50 | 100 {
  switch (getRemoteLayerResolution(layer)) {
    case "10um":
      return 10;
    case "25um":
      return 25;
    case "50um":
      return 50;
    case "100um":
    default:
      return 100;
  }
}

function getVolumeCacheKey(
  url: string,
  resolutionUm: 10 | 25 | 50 | 100,
  contentKind: RemoteContentKind
): string {
  return `${url}::${resolutionUm}::${contentKind}`;
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

function collectReferencedVolumeCacheKeys(nodes: LayerTreeNode[]): Set<string> {
  const keys = new Set<string>();

  function visit(list: LayerTreeNode[]) {
    for (const node of list) {
      if (node.kind === "group") {
        visit(node.children);
        continue;
      }

      if (isOmeZarrLayer(node) && typeof node.source === "string") {
        keys.add(getVolumeCacheKey(node.source, getRemoteLayerResolutionUm(node), getRemoteLayerContentKind(node)));
        continue;
      }

      if (isCustomSliceLayer(node)) {
        const customSource = hasVolumeLayerId(node.source) ? node.source : null;

        const volumeNode = customSource?.volumeLayerId
          ? findNodeById(nodes, customSource.volumeLayerId)
          : null;

        if (
          volumeNode &&
          volumeNode.kind === "layer" &&
          volumeNode.type === "remote" &&
          typeof volumeNode.source === "string" &&
          volumeNode.remoteFormat === "ome-zarr"
        ) {
          keys.add(
            getVolumeCacheKey(volumeNode.source, getRemoteLayerResolutionUm(volumeNode), getRemoteLayerContentKind(volumeNode))
          );
        }
      }
    }
  }

  visit(nodes);
  return keys;
}

function collectReferencedMeshCacheKeys(nodes: LayerTreeNode[]): Set<string> {
  const keys = new Set<string>();

  function visit(list: LayerTreeNode[]) {
    for (const node of list) {
      if (node.kind === "group") {
        visit(node.children);
        continue;
      }

      if (isRemoteMeshLayer(node) && typeof node.source === "string") {
        keys.add(getMeshCacheKey(node.source));
      }
    }
  }

  visit(nodes);
  return keys;
}

function getPlaneSliceCount(volume: LoadedVolume, plane: SlicePlane): number {
  if (plane === "xy") return volume.dims.z;
  if (plane === "xz") return volume.dims.y;
  return volume.dims.x;
}

function chooseVolumeRenderPlane(forward: vec3): SlicePlane {
  const ax = Math.abs(forward[0]);
  const ay = Math.abs(forward[1]);
  const az = Math.abs(forward[2]);

  if (az >= ax && az >= ay) return "xy";
  if (ay >= ax && ay >= az) return "xz";
  return "yz";
}

function buildVolumeDisplayIndices(total: number): number[] {
  if (total <= 0) return [];

  const maxSlices = 180;
  const step = Math.max(1, Math.ceil(total / maxSlices));
  const indices: number[] = [];

  for (let i = 0; i < total; i += step) {
    indices.push(i);
  }

  if (indices[indices.length - 1] !== total - 1) {
    indices.push(total - 1);
  }

  return indices;
}

function getVolumeStackAlpha(sliceCount: number, highlighted: boolean): number {
  const base = clamp(10 / Math.max(sliceCount, 1), 0.035, 0.12);
  return highlighted ? Math.min(base * 1.15, 0.16) : base;
}

export default function WebGLCanvas({
  activeTool,
  layerTree,
  selectedNodeId,
  cameraState,
  cameraSyncKey,
  onCameraStateChange,
  backgroundColor = "#0b0f14",
}: {
  activeTool: ToolId;
  layerTree: LayerTreeNode[];
  selectedNodeId: string | null;
  cameraState: SerializableCameraState;
  cameraSyncKey: number;
  onCameraStateChange?: (next: SerializableCameraState) => void;
  backgroundColor?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const cameraRef = useRef<CameraState>({
    mode: cameraState.mode ?? "fly",
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
  const targetOrbitDistanceRef = useRef(Math.max(0.25, vec3.length(vec3.fromValues(
    cameraState.position[0],
    cameraState.position[1],
    cameraState.position[2]
  ))));

  const activeToolRef = useRef<ToolId>(activeTool);
  const layerTreeRef = useRef<LayerTreeNode[]>(layerTree);
  const volumeCacheRef = useRef<Map<string, LoadedVolume>>(new Map());
  const meshCacheRef = useRef<Map<string, LoadedMesh>>(new Map());
  const loadingUrlsRef = useRef<Set<string>>(new Set());
  const loadingMeshesRef = useRef<Set<string>>(new Set());

  const [loadTick, setLoadTick] = useState(0);

  useEffect(() => {
    activeToolRef.current = activeTool;
  }, [activeTool]);

  useEffect(() => {
    layerTreeRef.current = layerTree;
  }, [layerTree]);

  useEffect(() => {
    cameraRef.current.mode = cameraState.mode ?? "fly";
    if ((cameraState.mode ?? "fly") === "orbit") {
      targetOrbitDistanceRef.current = Math.max(0.25, vec3.distance(cameraRef.current.position, vec3.fromValues(0, 0, 0)));
    }
  }, [cameraState.mode]);

  useEffect(() => {
    const camera = cameraRef.current;
    camera.mode = cameraState.mode ?? "fly";
    camera.position[0] = cameraState.position[0];
    camera.position[1] = cameraState.position[1];
    camera.position[2] = cameraState.position[2];
    camera.yaw = cameraState.yaw;
    camera.pitch = cameraState.pitch;
    camera.fovDeg = cameraState.fovDeg;
    targetOrbitDistanceRef.current = Math.max(0.25, vec3.distance(camera.position, vec3.fromValues(0, 0, 0)));
  }, [cameraSyncKey]);

  function publishCameraIfNeeded(camera: CameraState) {
    const next: SerializableCameraState = {
      mode: camera.mode,
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

  const volumesToLoad = useMemo(() => {
    const entries = new Map<
      string,
      { cacheKey: string; url: string; resolutionUm: 10 | 25 | 50 | 100; contentKind: RemoteContentKind }
    >();

    for (const layer of visibleLayers) {
      if (isOmeZarrLayer(layer)) {
        const url = layer.source as string;
        const resolutionUm = getRemoteLayerResolutionUm(layer);
        const contentKind = getRemoteLayerContentKind(layer);
        const cacheKey = getVolumeCacheKey(url, resolutionUm, contentKind);
        entries.set(cacheKey, { cacheKey, url, resolutionUm, contentKind });
        continue;
      }

      if (isCustomSliceLayer(layer)) {
        const customSource = hasVolumeLayerId(layer.source) ? layer.source : null;

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
          const resolutionUm = getRemoteLayerResolutionUm(volumeNode);
          const contentKind = getRemoteLayerContentKind(volumeNode);
          const cacheKey = getVolumeCacheKey(volumeNode.source, resolutionUm, contentKind);
          entries.set(cacheKey, {
            cacheKey,
            url: volumeNode.source,
            resolutionUm,
            contentKind,
          });
        }
      }
    }

    return Array.from(entries.values());
  }, [visibleLayers, layerTree]);

  const meshesToLoad = useMemo(() => {
    const entries = new Map<string, { cacheKey: string; url: string }>();

    for (const layer of visibleLayers) {
      if (!isMeshLayer(layer)) continue;

      const url = layer.source as string;
      const cacheKey = getMeshCacheKey(url);
      entries.set(cacheKey, { cacheKey, url });
    }

    return Array.from(entries.values());
  }, [visibleLayers]);

  useEffect(() => {
    for (const item of volumesToLoad) {
      if (volumeCacheRef.current.has(item.cacheKey)) continue;
      if (loadingUrlsRef.current.has(item.cacheKey)) continue;

      loadingUrlsRef.current.add(item.cacheKey);

      loadVolumeAtResolution(item.url, item.resolutionUm, item.contentKind)
        .then((volume) => {
          volumeCacheRef.current.set(item.cacheKey, volume);
          setLoadTick((v) => v + 1);
        })
        .catch((err) => {
          console.error(
            "Failed to load OME-Zarr volume:",
            item.url,
            item.resolutionUm,
            err
          );
        })
        .finally(() => {
          loadingUrlsRef.current.delete(item.cacheKey);
        });
    }
  }, [volumesToLoad]);

  useEffect(() => {
    for (const item of meshesToLoad) {
      if (meshCacheRef.current.has(item.cacheKey)) continue;
      if (loadingMeshesRef.current.has(item.cacheKey)) continue;

      loadingMeshesRef.current.add(item.cacheKey);

      loadObjMesh(item.url)
        .then((mesh) => {
          meshCacheRef.current.set(item.cacheKey, mesh);
          setLoadTick((v) => v + 1);
        })
        .catch((err) => {
          console.error("Failed to load mesh:", item.url, err);
        })
        .finally(() => {
          loadingMeshesRef.current.delete(item.cacheKey);
        });
    }
  }, [meshesToLoad]);

  const retainedVolumeCacheKeys = useMemo(
    () => collectReferencedVolumeCacheKeys(layerTree),
    [layerTree]
  );

  const retainedMeshCacheKeys = useMemo(
    () => collectReferencedMeshCacheKeys(layerTree),
    [layerTree]
  );

  useEffect(() => {
    let didEvict = false;

    for (const cacheKey of Array.from(volumeCacheRef.current.keys())) {
      if (!retainedVolumeCacheKeys.has(cacheKey)) {
        volumeCacheRef.current.delete(cacheKey);
        loadingUrlsRef.current.delete(cacheKey);
        didEvict = true;
      }
    }

    if (didEvict) {
      setLoadTick((v) => v + 1);
    }
  }, [retainedVolumeCacheKeys]);

  useEffect(() => {
    let didEvict = false;

    for (const cacheKey of Array.from(meshCacheRef.current.keys())) {
      if (!retainedMeshCacheKeys.has(cacheKey)) {
        meshCacheRef.current.delete(cacheKey);
        loadingMeshesRef.current.delete(cacheKey);
        didEvict = true;
      }
    }

    if (didEvict) {
      setLoadTick((v) => v + 1);
    }
  }, [retainedMeshCacheKeys]);

  useEffect(() => {
    const canvasElement = canvasRef.current;
    if (!canvasElement) return;

    const glContext = canvasElement.getContext("webgl");
    if (!glContext) {
      throw new Error("WebGL not supported");
    }

    const canvas: HTMLCanvasElement = canvasElement;
    const gl: WebGLRenderingContext = glContext;

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

    const volumeFragmentShaderSource = `
      precision mediump float;
      varying vec2 vTexCoord;
      uniform sampler2D uTexture;
      uniform float uAlpha;
      uniform float uBrightness;
      void main() {
        vec4 tex = texture2D(uTexture, vTexCoord);
        float v = tex.r;
        float alpha = v * uAlpha;
        vec3 color = vec3(v * uBrightness);
        gl_FragColor = vec4(color, alpha);
      }
    `;

    const colorProgram = createProgram(gl, colorVertexShaderSource, colorFragmentShaderSource);
    const textureProgram = createProgram(gl, textureVertexShaderSource, textureFragmentShaderSource);
    const volumeTextureProgram = createProgram(gl, textureVertexShaderSource, volumeFragmentShaderSource);

    const aColorPosition = gl.getAttribLocation(colorProgram, "aPosition");
    const uColorMVP = gl.getUniformLocation(colorProgram, "uMVP");
    const uColor = gl.getUniformLocation(colorProgram, "uColor");

    const aTexPosition = gl.getAttribLocation(textureProgram, "aPosition");
    const aTexCoord = gl.getAttribLocation(textureProgram, "aTexCoord");
    const uTexMVP = gl.getUniformLocation(textureProgram, "uMVP");
    const uTexture = gl.getUniformLocation(textureProgram, "uTexture");
    const uAlpha = gl.getUniformLocation(textureProgram, "uAlpha");

    const aVolTexPosition = gl.getAttribLocation(volumeTextureProgram, "aPosition");
    const aVolTexCoord = gl.getAttribLocation(volumeTextureProgram, "aTexCoord");
    const uVolTexMVP = gl.getUniformLocation(volumeTextureProgram, "uMVP");
    const uVolTexture = gl.getUniformLocation(volumeTextureProgram, "uTexture");
    const uVolAlpha = gl.getUniformLocation(volumeTextureProgram, "uAlpha");
    const uVolBrightness = gl.getUniformLocation(volumeTextureProgram, "uBrightness");

    const maxVertexAttribs = gl.getParameter(gl.MAX_VERTEX_ATTRIBS) as number;

    function resetVertexAttribArrays() {
      for (let i = 0; i < maxVertexAttribs; i += 1) {
        gl.disableVertexAttribArray(i);
      }
    }

    if (
      aColorPosition < 0 ||
      !uColorMVP ||
      !uColor ||
      aTexPosition < 0 ||
      aTexCoord < 0 ||
      !uTexMVP ||
      !uTexture ||
      !uAlpha ||
      aVolTexPosition < 0 ||
      aVolTexCoord < 0 ||
      !uVolTexMVP ||
      !uVolTexture ||
      !uVolAlpha ||
      !uVolBrightness
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
    const customSliceTextureCache = new Map<string, AxisSliceTextureEntry>();
    const volumeSliceTextureCache = new Map<string, AxisSliceTextureEntry>();

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

    function getOrCreateSliceTextures(cacheKey: string, volume: LoadedVolume): SliceTextureSet {
      const cached = sliceTextureCache.get(cacheKey);
      if (cached) return cached;

      const { xy, xz, yz } = extractOrientedCenterSlices(volume, ALLEN_VOLUME_PROFILE);

      const xyTex = createSliceTexture(xy.width, xy.height, volume.contentKind === "annotation" ? annotationSliceToRgbaBytes(xy.pixels) : sliceToRgbaBytes(xy.pixels));
      const xzTex = createSliceTexture(xz.width, xz.height, volume.contentKind === "annotation" ? annotationSliceToRgbaBytes(xz.pixels) : sliceToRgbaBytes(xz.pixels));
      const yzTex = createSliceTexture(yz.width, yz.height, volume.contentKind === "annotation" ? annotationSliceToRgbaBytes(yz.pixels) : sliceToRgbaBytes(yz.pixels));

      const set: SliceTextureSet = {
        xy: xyTex,
        xz: xzTex,
        yz: yzTex,
        xySize: { width: xy.width, height: xy.height },
        xzSize: { width: xz.width, height: xz.height },
        yzSize: { width: yz.width, height: yz.height },
      };

      sliceTextureCache.set(cacheKey, set);
      return set;
    }

    function axisSliceToObliqueSpec(
      volume: LoadedVolume,
      plane: SlicePlane,
      displayIndex: number,
      profile: ViewerOrientationProfile = ALLEN_VOLUME_PROFILE
    ): ObliqueSliceSpec {
      const dataIndex = mapDisplaySliceIndexToDataIndex(
        volume,
        plane,
        displayIndex,
        profile
      );

      const centerX = (volume.dims.x - 1) * 0.5;
      const centerY = (volume.dims.y - 1) * 0.5;
      const centerZ = (volume.dims.z - 1) * 0.5;

      if (plane === "xy") {
        return {
          normal: { x: 0, y: 0, z: 1 },
          offset: dataIndex - centerZ,
          width: volume.dims.x,
          height: volume.dims.y,
        };
      }

      if (plane === "xz") {
        return {
          normal: { x: 0, y: 1, z: 0 },
          offset: dataIndex - centerY,
          width: volume.dims.x,
          height: volume.dims.z,
        };
      }

      return {
        normal: { x: 1, y: 0, z: 0 },
        offset: dataIndex - centerX,
        width: volume.dims.z,
        height: volume.dims.y,
      };
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
    ): AxisSliceTextureEntry {
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
              ALLEN_CUSTOM_SLICE_PROFILE
            )
          : extractOrientedSlice2D(
              volume,
              sliceSpec.plane,
              sliceSpec.index,
              ALLEN_VOLUME_PROFILE
            );

      const texture = createSliceTexture(slice.width, slice.height, volume.contentKind === "annotation" ? annotationSliceToRgbaBytes(slice.pixels) : sliceToRgbaBytes(slice.pixels));

      const entry = {
        texture,
        width: slice.width,
        height: slice.height,
      };

      customSliceTextureCache.set(cacheKey, entry);
      return entry;
    }

    function getOrCreateVolumeAxisSliceTexture(
      cacheKey: string,
      volume: LoadedVolume,
      plane: SlicePlane,
      index: number
    ): AxisSliceTextureEntry {
      const cached = volumeSliceTextureCache.get(cacheKey);
      if (cached) return cached;

      const slice = extractOrientedSlice2D(volume, plane, index, ALLEN_VOLUME_PROFILE);
      const texture = createSliceTexture(slice.width, slice.height, volume.contentKind === "annotation" ? annotationSliceToRgbaBytes(slice.pixels) : sliceToRgbaBytes(slice.pixels));
      const entry = {
        texture,
        width: slice.width,
        height: slice.height,
      };

      volumeSliceTextureCache.set(cacheKey, entry);
      return entry;
    }

    function makeSliceModelMatrix(
      volume: LoadedVolume,
      plane: SlicePlane,
      displayIndex: number,
      profile: ViewerOrientationProfile = ALLEN_VOLUME_PROFILE
    ): mat4 {
      return makeObliqueSliceModelMatrix(
        volume,
        axisSliceToObliqueSpec(volume, plane, displayIndex, profile),
        profile
      );
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
      spec: ObliqueSliceSpec,
      profile: ViewerOrientationProfile = ALLEN_CUSTOM_SLICE_PROFILE
    ): mat4 {
      const model = mat4.create();

      const { sx, sy, sz } = getVolumeDisplayScale(volume);
      const frame = getObliquePlaneFrame(volume, spec, profile);

      const cx = -sx + 2 * sx * frame.center01.x;
      const cy = -sy + 2 * sy * frame.center01.y;
      const cz = -sz + 2 * sz * frame.center01.z;

      const halfSpanU = maxAbsPlaneExtentForObliqueWorld(volume, frame.u);
      const halfSpanV = maxAbsPlaneExtentForObliqueWorld(volume, frame.v);

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
    const orbitTarget = vec3.fromValues(0, 0, 0);
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

    function getCameraDistanceToTarget(): number {
      return vec3.distance(camera.position, orbitTarget);
    }

    function setCameraFromOrbitAngles(
      distance: number,
      yawDeg: number,
      pitchDeg: number
    ) {
      const yawRad = (yawDeg * Math.PI) / 180;
      const pitchRad = (pitchDeg * Math.PI) / 180;

      const x = Math.cos(yawRad) * Math.cos(pitchRad) * distance;
      const y = Math.sin(pitchRad) * distance;
      const z = Math.sin(yawRad) * Math.cos(pitchRad) * distance;

      camera.position[0] = orbitTarget[0] - x;
      camera.position[1] = orbitTarget[1] - y;
      camera.position[2] = orbitTarget[2] - z;
      camera.yaw = yawDeg;
      camera.pitch = pitchDeg;
    }

    function updateCamera(dt: number) {
      if (camera.mode !== "fly") return;

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

    const meshBufferCache = new Map<
      string,
      {
        lineBuffer: WebGLBuffer | null;
        lineVertexCount: number;
        triangleBuffer: WebGLBuffer | null;
        triangleVertexCount: number;
      }
    >();

    function drawColorPlane(mvp: mat4, color: [number, number, number, number]) {
      resetVertexAttribArrays();

      gl.useProgram(colorProgram);
      gl.uniformMatrix4fv(uColorMVP, false, mvp);
      gl.uniform4f(uColor, color[0], color[1], color[2], color[3]);

      gl.bindBuffer(gl.ARRAY_BUFFER, planeVertexBuffer);
      gl.enableVertexAttribArray(aColorPosition);
      gl.vertexAttribPointer(aColorPosition, 3, gl.FLOAT, false, 0, 0);

      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, planeIndexBuffer);
      gl.drawElements(gl.TRIANGLES, planeIndices.length, gl.UNSIGNED_SHORT, 0);
    }

    function getOrCreateMeshBuffer(mesh: LoadedMesh) {
      const key = getMeshCacheKey(mesh.url);
      const cached = meshBufferCache.get(key);
      if (cached) return cached;

      let lineBuffer: WebGLBuffer | null = null;
      if (mesh.linePositions.length > 0) {
        lineBuffer = gl.createBuffer();
        if (!lineBuffer) {
          throw new Error("Failed to create line mesh buffer");
        }
        gl.bindBuffer(gl.ARRAY_BUFFER, lineBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, mesh.linePositions, gl.STATIC_DRAW);
      }

      let triangleBuffer: WebGLBuffer | null = null;
      if (mesh.trianglePositions.length > 0) {
        triangleBuffer = gl.createBuffer();
        if (!triangleBuffer) {
          throw new Error("Failed to create triangle mesh buffer");
        }
        gl.bindBuffer(gl.ARRAY_BUFFER, triangleBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, mesh.trianglePositions, gl.STATIC_DRAW);
      }

      const entry = {
        lineBuffer,
        lineVertexCount: mesh.linePositions.length / 3,
        triangleBuffer,
        triangleVertexCount: mesh.trianglePositions.length / 3,
      };

      meshBufferCache.set(key, entry);
      return entry;
    }

    function drawMeshSurface(mesh: LoadedMesh, mvp: mat4, color: [number, number, number, number]) {
      const entry = getOrCreateMeshBuffer(mesh);
      if (!entry.triangleBuffer || entry.triangleVertexCount <= 0) {
        return;
      }

      resetVertexAttribArrays();

      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.depthMask(false);

      gl.useProgram(colorProgram);
      gl.uniformMatrix4fv(uColorMVP, false, mvp);
      gl.uniform4f(uColor, color[0], color[1], color[2], color[3]);

      gl.bindBuffer(gl.ARRAY_BUFFER, entry.triangleBuffer);
      gl.enableVertexAttribArray(aColorPosition);
      gl.vertexAttribPointer(aColorPosition, 3, gl.FLOAT, false, 0, 0);

      gl.drawArrays(gl.TRIANGLES, 0, entry.triangleVertexCount);

      gl.depthMask(true);
      gl.disable(gl.BLEND);
    }

    function drawTexturedPlane(texture: WebGLTexture, mvp: mat4, alpha: number) {
      resetVertexAttribArrays();

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

    function drawVolumeSlice(texture: WebGLTexture, mvp: mat4, alpha: number) {
      resetVertexAttribArrays();

      gl.useProgram(volumeTextureProgram);
      gl.uniformMatrix4fv(uVolTexMVP, false, mvp);
      gl.uniform1f(uVolAlpha, alpha);
      gl.uniform1f(uVolBrightness, 1.12);

      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.uniform1i(uVolTexture, 0);

      gl.bindBuffer(gl.ARRAY_BUFFER, planeVertexBuffer);
      gl.enableVertexAttribArray(aVolTexPosition);
      gl.vertexAttribPointer(aVolTexPosition, 3, gl.FLOAT, false, 0, 0);

      gl.bindBuffer(gl.ARRAY_BUFFER, planeTexCoordBuffer);
      gl.enableVertexAttribArray(aVolTexCoord);
      gl.vertexAttribPointer(aVolTexCoord, 2, gl.FLOAT, false, 0, 0);

      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, planeIndexBuffer);

      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

      gl.drawElements(gl.TRIANGLES, planeIndices.length, gl.UNSIGNED_SHORT, 0);

      gl.bindTexture(gl.TEXTURE_2D, null);
    }

    function renderVolumeLayer(
      volumeKey: string,
      volume: LoadedVolume,
      highlighted: boolean,
      forward: vec3,
      view: mat4,
      projection: mat4
    ) {
      const plane = chooseVolumeRenderPlane(forward);
      const totalSlices = getPlaneSliceCount(volume, plane);
      const displayIndices = buildVolumeDisplayIndices(totalSlices);
      const alpha = volume.contentKind === "annotation" ? (highlighted ? 0.92 : 0.78) : getVolumeStackAlpha(displayIndices.length, highlighted);

      const sortedIndices = [...displayIndices].sort((a, b) => {
        const modelA = makeSliceModelMatrix(volume, plane, a, ALLEN_VOLUME_PROFILE);
        const modelB = makeSliceModelMatrix(volume, plane, b, ALLEN_VOLUME_PROFILE);
        const mvA = mat4.create();
        const mvB = mat4.create();
        mat4.multiply(mvA, view, modelA);
        mat4.multiply(mvB, view, modelB);
        return mvA[14] - mvB[14];
      });

      gl.depthMask(false);

      for (const displayIndex of sortedIndices) {
        const sliceKey = `${volumeKey}|volume|${plane}|${displayIndex}`;
        const sliceEntry = getOrCreateVolumeAxisSliceTexture(
          sliceKey,
          volume,
          plane,
          displayIndex
        );

        const model = makeSliceModelMatrix(volume, plane, displayIndex, ALLEN_VOLUME_PROFILE);
        const mv = mat4.create();
        const mvp = mat4.create();
        mat4.multiply(mv, view, model);
        mat4.multiply(mvp, projection, mv);

        if (volume.contentKind === "annotation") {
          drawTexturedPlane(sliceEntry.texture, mvp, alpha);
        } else {
          drawVolumeSlice(sliceEntry.texture, mvp, alpha);
        }
      }

      gl.depthMask(true);
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

      if (camera.mode === "orbit") {
        const orbitAlpha = 1 - Math.exp(-zoomSharpness * dt);
        const currentDistance = getCameraDistanceToTarget();
        const nextDistance = currentDistance + (targetOrbitDistanceRef.current - currentDistance) * orbitAlpha;
        if (Math.abs(nextDistance - currentDistance) > 1e-4) {
          setCameraFromOrbitAngles(nextDistance, camera.yaw, camera.pitch);
          publishCameraIfNeeded(camera);
        }
      }

      gl.enable(gl.DEPTH_TEST);
      const [bgR, bgG, bgB] = hexToRgb01(backgroundColor);
      gl.clearColor(bgR, bgG, bgB, 1.0);
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

      const view = mat4.create();
      if (camera.mode === "fly") {
        const target = vec3.create();
        vec3.add(target, camera.position, forward);
        mat4.lookAt(view, camera.position, target, [0, 1, 0]);
      } else {
        mat4.lookAt(view, camera.position, orbitTarget, [0, 1, 0]);
      }

      const layers = collectVisibleLayerItems(layerTreeRef.current, true);

      for (let i = 0; i < layers.length; i += 1) {
        const layer = layers[i];
        const isHighlighted = highlightedLayerIds.has(layer.id);

        if (isMeshLayer(layer) && typeof layer.source === "string") {
          const mesh = meshCacheRef.current.get(getMeshCacheKey(layer.source));

          if (mesh) {
            const model = getAllenMeshModelMatrix(mesh);
            const mv = mat4.create();
            const mvp = mat4.create();

            mat4.multiply(mv, view, model);
            mat4.multiply(mvp, projection, mv);

            drawMeshSurface(
              mesh,
              mvp,
              isHighlighted ? [0.72, 0.96, 1.0, 0.26] : [0.52, 0.72, 0.96, 0.16]
            );
          }

          continue;
        }

        if (isOmeZarrLayer(layer) && typeof layer.source === "string") {
          const volumeKey = getVolumeCacheKey(
            layer.source,
            getRemoteLayerResolutionUm(layer),
            getRemoteLayerContentKind(layer)
          );
          const volume = volumeCacheRef.current.get(volumeKey);

          if (volume) {
            if (layer.renderMode === "volume") {
              renderVolumeLayer(volumeKey, volume, isHighlighted, forward, view, projection);
            } else if (layer.renderMode === "slices") {
              const textures = getOrCreateSliceTextures(volumeKey, volume);
              const alpha = isHighlighted ? 0.98 : 0.92;

              const { sx, sy, sz } = getVolumeDisplayScale(volume);

              {
                const model = mat4.create();
                const mv = mat4.create();
                const mvp = mat4.create();

                mat4.scale(model, model, [sx, sy, 1]);
                mat4.multiply(mv, view, model);
                mat4.multiply(mvp, projection, mv);
                drawTexturedPlane(textures.xy, mvp, alpha);
              }

              {
                const model = mat4.create();
                const mv = mat4.create();
                const mvp = mat4.create();

                mat4.rotateX(model, model, Math.PI / 2);
                mat4.scale(model, model, [sx, sz, 1]);
                mat4.multiply(mv, view, model);
                mat4.multiply(mvp, projection, mv);
                drawTexturedPlane(textures.xz, mvp, alpha);
              }

              {
                const model = mat4.create();
                const mv = mat4.create();
                const mvp = mat4.create();

                mat4.rotateY(model, model, Math.PI / 2);
                mat4.scale(model, model, [sz, sy, 1]);
                mat4.multiply(mv, view, model);
                mat4.multiply(mvp, projection, mv);
                drawTexturedPlane(textures.yz, mvp, alpha);
              }
            }
          }

          continue;
        }

        if (layer.type === "custom-slice") {
          const volumeLayerId = hasVolumeLayerId(layer.source)
            ? layer.source.volumeLayerId
            : null;
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

          const volumeKey = getVolumeCacheKey(
            volumeNode.source,
            getRemoteLayerResolutionUm(volumeNode),
            getRemoteLayerContentKind(volumeNode)
          );
          const volume = volumeCacheRef.current.get(volumeKey);
          if (!volume) {
            continue;
          }

          let sliceTex: AxisSliceTextureEntry | undefined;
          let model: mat4;

          const isOblique =
            sliceParams.mode === "oblique" &&
            !!sliceParams.normal &&
            typeof sliceParams.normal.x === "number" &&
            typeof sliceParams.normal.y === "number" &&
            typeof sliceParams.normal.z === "number";

          if (isOblique) {
            const nx = sliceParams.normal.x;
            const ny = sliceParams.normal.y;
            const nz = sliceParams.normal.z;
            const offset = sliceParams.offset ?? 0;
            const width = sliceParams.width ?? 256;
            const height = sliceParams.height ?? 256;

            const cacheKey = [
              volumeKey,
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
            }, ALLEN_VOLUME_PROFILE);
          } else if (isAxisAlignedSliceParams(sliceParams)) {
            const safeIndex = clampSliceIndex(volume, sliceParams.plane, sliceParams.index);
            const cacheKey = `${volumeKey}|${sliceParams.plane}|${safeIndex}`;

            sliceTex = createCustomSliceTexture(cacheKey, volume, {
              mode: "axis",
              plane: sliceParams.plane,
              index: safeIndex,
            });

            model = makeSliceModelMatrix(
              volume,
              sliceParams.plane,
              safeIndex,
              ALLEN_VOLUME_PROFILE
            );
          } else {
            continue;
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
      if (camera.mode !== "fly") return;
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

      if (camera.mode === "fly") {
        const sensitivity = 0.2;
        camera.yaw += dx * sensitivity;
        camera.pitch -= dy * sensitivity;
        camera.pitch = clamp(camera.pitch, -89, 89);
        publishCameraIfNeeded(camera);
        return;
      }

      const sensitivity = 0.2;
      const nextYaw = camera.yaw + dx * sensitivity;
      const nextPitch = clamp(camera.pitch - dy * sensitivity, -89, 89);
      const distance = Math.max(0.25, getCameraDistanceToTarget());

      setCameraFromOrbitAngles(distance, nextYaw, nextPitch);
      publishCameraIfNeeded(camera);
    }

    function onWheel(e: WheelEvent) {
      if (activeToolRef.current !== "mouse") return;
      e.preventDefault();

      if (camera.mode === "fly") {
        targetFovDeg = clamp(targetFovDeg + e.deltaY * 0.02, 20, 90);
        return;
      }

      const distance = targetOrbitDistanceRef.current;
      targetOrbitDistanceRef.current = clamp(distance + e.deltaY * 0.01, 0.25, 20);
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

      for (const entry of volumeSliceTextureCache.values()) {
        gl.deleteTexture(entry.texture);
      }

      for (const entry of meshBufferCache.values()) {
        if (entry.lineBuffer) gl.deleteBuffer(entry.lineBuffer);
        if (entry.triangleBuffer) gl.deleteBuffer(entry.triangleBuffer);
      }

      gl.deleteBuffer(planeVertexBuffer);
      gl.deleteBuffer(planeTexCoordBuffer);
      gl.deleteBuffer(planeIndexBuffer);
      gl.deleteProgram(colorProgram);
      gl.deleteProgram(textureProgram);
      gl.deleteProgram(volumeTextureProgram);
    };
  }, [selectedNodeId, highlightedLayerIds, loadTick, backgroundColor]);

  const selectedDataLayer =
    visibleLayers.find((layer) => layer.id === selectedNodeId && (isOmeZarrLayer(layer) || layer.type === "custom-slice")) ?? null;

  const selectedVolume =
    selectedDataLayer &&
    (() => {
      if (selectedDataLayer.type === "remote" && typeof selectedDataLayer.source === "string") {
        const resolutionUm = getRemoteLayerResolutionUm(selectedDataLayer);
        return (
          volumeCacheRef.current.get(
            getVolumeCacheKey(selectedDataLayer.source, resolutionUm, getRemoteLayerContentKind(selectedDataLayer))
          ) ?? null
        );
      }

      if (selectedDataLayer.type === "custom-slice") {
        const customSource = hasVolumeLayerId(selectedDataLayer.source)
          ? selectedDataLayer.source
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
          const resolutionUm = getRemoteLayerResolutionUm(volumeNode);
          return (
            volumeCacheRef.current.get(
              getVolumeCacheKey(volumeNode.source, resolutionUm, getRemoteLayerContentKind(volumeNode))
            ) ?? null
          );
        }
      }

      return null;
    })();

  return (
    <div style={{ width: "100%", height: "100%", position: "relative" }}>
      <canvas ref={canvasRef} style={{ width: "100%", height: "100%", display: "block" }} />

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
            <div>Requested resolution: {selectedVolume.requestedResolutionUm ?? "n/a"} µm</div>
            <div>Resolved resolution: {selectedVolume.resolvedResolutionUm ?? "unknown"} µm</div>
            <div>Dataset index: {selectedVolume.datasetIndex}</div>
            <div>OME-Zarr path: {selectedVolume.datasetPath}</div>
            <div>
              Voxel size (z,y,x): {selectedVolume.voxelSizeUm.z ?? "?"},{" "}
              {selectedVolume.voxelSizeUm.y ?? "?"}, {selectedVolume.voxelSizeUm.x ?? "?"} µm
            </div>
            <div>
              Dims (z,y,x): {selectedVolume.dims.z}, {selectedVolume.dims.y},{" "}
              {selectedVolume.dims.x}
            </div>
            <div>Raw shape: [{selectedVolume.rawShape.join(", ")}]</div>
          </>
        )}
      </div>
    </div>
  );
}
