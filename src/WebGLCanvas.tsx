import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { mat4, vec3 } from "gl-matrix";
import type { SerializableCameraState, CameraControlMode } from "./viewerState";
import type { ToolId } from "./BottomToolbar";
import type { AnnotationShape, LayerTreeNode, LayerItemNode, RemoteContentKind, RemoteOmeResolution } from "./layerTypes";
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
import {
  createRayFromScreen,
  intersectRayQuad,
  transformPoint,
  type RayHit,
} from "./scenePicking";

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

export type ScenePointerHit = {
  layerId: string;
  layerName: string;
  kind: "plane";
  distance: number;
  position: [number, number, number];
  normal: [number, number, number];
};
export type SelectedLayerRuntimeInfo = {
  layerId: string;
  sourceName?: string;
  sourcePath?: string;
  sourceType?: string;
  requestedResolutionUm?: number | null;
  resolvedResolutionUm?: number | null;
  datasetIndex?: number | null;
  datasetPath?: string | null;
  voxelSizeUm?: { x?: number | null; y?: number | null; z?: number | null } | null;
  dims?: { x: number; y: number; z: number } | null;
  rawShape?: number[] | null;
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

function getRemoteLayerResolutionUm(layer: LayerItemNode): number {
  const raw = String(getRemoteLayerResolution(layer) ?? "100um").trim().toLowerCase();
  const numeric = Number.parseFloat(raw.replace(/[^0-9.]+/g, ""));
  return Number.isFinite(numeric) && numeric > 0 ? numeric : 100;
}

function getVolumeCacheKey(
  url: string,
  resolutionUm: number,
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
  infoPanelContent,
  annotationShape = "point",
  annotationColor = "#ff5c5c",
  annotationOpacity = 0.9,
  annotationSize = 0.06,
  annotationDepth = 0.015,
  annotationEraseMode = "color",
  onScenePointerTargetChange,
  onCreatePointAnnotation,
  onCreateLineAnnotation,
  onCreateShapeAnnotation,
  onCommitFreehandStroke,
  onEraseFreehand,
  onSelectedLayerRuntimeInfoChange,
  onCanvasElementChange,
  orbitResetRequestKey = 0,
}: {
  activeTool: ToolId;
  layerTree: LayerTreeNode[];
  selectedNodeId: string | null;
  cameraState: SerializableCameraState;
  cameraSyncKey: number;
  onCameraStateChange?: (next: SerializableCameraState) => void;
  backgroundColor?: string;
  infoPanelContent?: ReactNode;
  annotationShape?: AnnotationShape;
  annotationColor?: string;
  annotationOpacity?: number;
  annotationSize?: number;
  annotationDepth?: number;
  annotationEraseMode?: "all" | "color";
  onScenePointerTargetChange?: (hit: ScenePointerHit | null) => void;
  onCreatePointAnnotation?: (hit: ScenePointerHit) => void;
  onCreateLineAnnotation?: (params: { start: ScenePointerHit; end: ScenePointerHit }) => void;
  onCreateShapeAnnotation?: (params: { shape: "rectangle" | "circle"; points: [number, number, number][]; normal: [number, number, number]; layerId: string; layerName: string; }) => void;
  onCommitFreehandStroke?: (stroke: { points: [number, number, number][]; normals: [number, number, number][]; attachedLayerId?: string; attachedLayerName?: string; }) => void;
  onEraseFreehand?: (payload: { path: [number, number, number][]; radius: number }) => void;
  onSelectedLayerRuntimeInfoChange?: (info: SelectedLayerRuntimeInfo | null) => void;
  onCanvasElementChange?: (canvas: HTMLCanvasElement | null) => void;
  orbitResetRequestKey?: number;
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
  const orbitTargetRef = useRef(vec3.fromValues(0, 0, 0));
  const orbitTargetGoalRef = useRef(vec3.fromValues(0, 0, 0));

  const activeToolRef = useRef<ToolId>(activeTool);
  const annotationShapeRef = useRef<AnnotationShape>(annotationShape);
  const annotationColorRef = useRef<string>(annotationColor);
  const annotationOpacityRef = useRef<number>(annotationOpacity);
  const annotationSizeRef = useRef<number>(annotationSize);
  const annotationDepthRef = useRef<number>(annotationDepth);
  const annotationEraseModeRef = useRef<"all" | "color">(annotationEraseMode);
  const onCreatePointAnnotationRef = useRef<typeof onCreatePointAnnotation>(onCreatePointAnnotation);
  const onCreateLineAnnotationRef = useRef<typeof onCreateLineAnnotation>(onCreateLineAnnotation);
  const onCreateShapeAnnotationRef = useRef<typeof onCreateShapeAnnotation>(onCreateShapeAnnotation);
  const onCommitFreehandStrokeRef = useRef<typeof onCommitFreehandStroke>(onCommitFreehandStroke);
  const onEraseFreehandRef = useRef<typeof onEraseFreehand>(onEraseFreehand);
  const layerTreeRef = useRef<LayerTreeNode[]>(layerTree);
  const volumeCacheRef = useRef<Map<string, LoadedVolume>>(new Map());
  const meshCacheRef = useRef<Map<string, LoadedMesh>>(new Map());
  const loadingUrlsRef = useRef<Set<string>>(new Set());
  const loadingMeshesRef = useRef<Set<string>>(new Set());
  const hoveredSceneHitRef = useRef<ScenePointerHit | null>(null);
  const lineStartHitRef = useRef<ScenePointerHit | null>(null);
  const shapeDragStartHitRef = useRef<ScenePointerHit | null>(null);
  const shapeDragCurrentHitRef = useRef<ScenePointerHit | null>(null);
  const lastPublishedSceneHitRef = useRef<string>("null");

  const [loadTick, setLoadTick] = useState(0);

  useEffect(() => {
    onCanvasElementChange?.(canvasRef.current);
    return () => {
      onCanvasElementChange?.(null);
    };
  }, [onCanvasElementChange]);

  useEffect(() => {
    activeToolRef.current = activeTool;
  }, [activeTool]);

  useEffect(() => {
    annotationShapeRef.current = annotationShape;
  }, [annotationShape]);

  useEffect(() => {
    annotationColorRef.current = annotationColor;
  }, [annotationColor]);

  useEffect(() => {
    annotationOpacityRef.current = annotationOpacity;
  }, [annotationOpacity]);

  useEffect(() => {
    annotationSizeRef.current = annotationSize;
  }, [annotationSize]);

  useEffect(() => {
    annotationDepthRef.current = annotationDepth;
  }, [annotationDepth]);

  useEffect(() => {
    annotationEraseModeRef.current = annotationEraseMode;
  }, [annotationEraseMode]);

  useEffect(() => {
    onCreatePointAnnotationRef.current = onCreatePointAnnotation;
  }, [onCreatePointAnnotation]);

  useEffect(() => {
    onCreateLineAnnotationRef.current = onCreateLineAnnotation;
  }, [onCreateLineAnnotation]);

  useEffect(() => {
    onCreateShapeAnnotationRef.current = onCreateShapeAnnotation;
  }, [onCreateShapeAnnotation]);

  useEffect(() => {
    onCommitFreehandStrokeRef.current = onCommitFreehandStroke;
  }, [onCommitFreehandStroke]);

  useEffect(() => {
    onEraseFreehandRef.current = onEraseFreehand;
  }, [onEraseFreehand]);

  useEffect(() => {
    layerTreeRef.current = layerTree;
  }, [layerTree]);

  useEffect(() => {
    cameraRef.current.mode = cameraState.mode ?? "fly";
    if ((cameraState.mode ?? "fly") === "orbit") {
      targetOrbitDistanceRef.current = Math.max(0.25, vec3.distance(cameraRef.current.position, orbitTargetRef.current));
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
    targetOrbitDistanceRef.current = Math.max(0.25, vec3.distance(camera.position, orbitTargetRef.current));
  }, [cameraSyncKey]);

  useEffect(() => {
    orbitTargetGoalRef.current[0] = 0;
    orbitTargetGoalRef.current[1] = 0;
    orbitTargetGoalRef.current[2] = 0;
  }, [orbitResetRequestKey]);

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

  const highlightedLayerIds = useMemo(() => {
    if (!selectedNodeId || !selectedNode) return new Set<string>();
    return new Set(collectLayerIdsInSubtree(selectedNode));
  }, [selectedNode, selectedNodeId]);

  const visibleLayers = useMemo(
    () => collectVisibleLayerItems(layerTree, true),
    [layerTree]
  );
  const selectedLayerRuntimeInfo = useMemo<SelectedLayerRuntimeInfo | null>(() => {
    if (!selectedNodeId) return null;
    const selectedNode = findNodeById(layerTree, selectedNodeId);
    if (!selectedNode || selectedNode.kind !== "layer") return null;

    if (selectedNode.type === "remote" && typeof selectedNode.source === "string") {
      const base: SelectedLayerRuntimeInfo = {
        layerId: selectedNode.id,
        sourceName: selectedNode.name,
        sourcePath: selectedNode.source,
        sourceType: selectedNode.remoteFormat === "ome-zarr"
          ? `OME-Zarr${selectedNode.remoteResolution ? ` · ${selectedNode.remoteResolution}` : ""}`
          : selectedNode.remoteFormat === "mesh-obj"
          ? "OBJ mesh"
          : "Remote source",
      };

      if (isOmeZarrLayer(selectedNode)) {
        const resolutionUm = getRemoteLayerResolutionUm(selectedNode);
        const loaded = volumeCacheRef.current.get(
          getVolumeCacheKey(selectedNode.source, resolutionUm, getRemoteLayerContentKind(selectedNode))
        );
        return {
          ...base,
          requestedResolutionUm: loaded?.requestedResolutionUm ?? resolutionUm,
          resolvedResolutionUm: loaded?.resolvedResolutionUm ?? null,
          datasetIndex: loaded?.datasetIndex ?? null,
          datasetPath: loaded?.datasetPath ?? null,
          voxelSizeUm: loaded ? {
            x: loaded.voxelSizeUm.x ?? null,
            y: loaded.voxelSizeUm.y ?? null,
            z: loaded.voxelSizeUm.z ?? null,
          } : null,
          dims: loaded ? { ...loaded.dims } : null,
          rawShape: loaded?.rawShape ? [...loaded.rawShape] : null,
        };
      }

      return base;
    }

    if (selectedNode.type === "custom-slice") {
      const customSource = hasVolumeLayerId(selectedNode.source) ? selectedNode.source : null;
      const volumeNode = customSource?.volumeLayerId ? findNodeById(layerTree, customSource.volumeLayerId) : null;
      if (
        volumeNode &&
        volumeNode.kind === "layer" &&
        volumeNode.type === "remote" &&
        typeof volumeNode.source === "string" &&
        volumeNode.remoteFormat === "ome-zarr"
      ) {
        const resolutionUm = getRemoteLayerResolutionUm(volumeNode);
        const loaded = volumeCacheRef.current.get(
          getVolumeCacheKey(volumeNode.source, resolutionUm, getRemoteLayerContentKind(volumeNode))
        );
        return {
          layerId: selectedNode.id,
          sourceName: volumeNode.name,
          sourcePath: volumeNode.source,
          sourceType: `Custom slice · OME-Zarr${volumeNode.remoteResolution ? ` · ${volumeNode.remoteResolution}` : ""}`,
          requestedResolutionUm: loaded?.requestedResolutionUm ?? resolutionUm,
          resolvedResolutionUm: loaded?.resolvedResolutionUm ?? null,
          datasetIndex: loaded?.datasetIndex ?? null,
          datasetPath: loaded?.datasetPath ?? null,
          voxelSizeUm: loaded ? {
            x: loaded.voxelSizeUm.x ?? null,
            y: loaded.voxelSizeUm.y ?? null,
            z: loaded.voxelSizeUm.z ?? null,
          } : null,
          dims: loaded ? { ...loaded.dims } : null,
          rawShape: loaded?.rawShape ? [...loaded.rawShape] : null,
        };
      }
    }

    return null;
  }, [layerTree, selectedNodeId, loadTick]);

  useEffect(() => {
    onSelectedLayerRuntimeInfoChange?.(selectedLayerRuntimeInfo);
  }, [onSelectedLayerRuntimeInfoChange, selectedLayerRuntimeInfo]);


  const volumesToLoad = useMemo(() => {
    const entries = new Map<
      string,
      { cacheKey: string; url: string; resolutionUm: number; contentKind: RemoteContentKind }
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

    const glContext = canvasElement.getContext("webgl", { preserveDrawingBuffer: true });
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

    function buildSphereGeometry(latSegments: number, lonSegments: number) {
      const positions: number[] = [];
      const indices: number[] = [];

      for (let lat = 0; lat <= latSegments; lat += 1) {
        const v = lat / latSegments;
        const theta = v * Math.PI;
        const sinTheta = Math.sin(theta);
        const cosTheta = Math.cos(theta);

        for (let lon = 0; lon <= lonSegments; lon += 1) {
          const u = lon / lonSegments;
          const phi = u * Math.PI * 2;
          const sinPhi = Math.sin(phi);
          const cosPhi = Math.cos(phi);

          positions.push(sinTheta * cosPhi, cosTheta, sinTheta * sinPhi);
        }
      }

      for (let lat = 0; lat < latSegments; lat += 1) {
        for (let lon = 0; lon < lonSegments; lon += 1) {
          const first = lat * (lonSegments + 1) + lon;
          const second = first + lonSegments + 1;
          indices.push(first, second, first + 1);
          indices.push(second, second + 1, first + 1);
        }
      }

      return {
        positions: new Float32Array(positions),
        indices: new Uint16Array(indices),
      };
    }

    const sphereGeometry = buildSphereGeometry(22, 32);
    const sphereVertexBuffer = gl.createBuffer();
    const sphereIndexBuffer = gl.createBuffer();

    if (!sphereVertexBuffer || !sphereIndexBuffer) {
      throw new Error("Failed to create sphere buffers");
    }

    gl.bindBuffer(gl.ARRAY_BUFFER, sphereVertexBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, sphereGeometry.positions, gl.STATIC_DRAW);

    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, sphereIndexBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, sphereGeometry.indices, gl.STATIC_DRAW);

    function buildCylinderGeometry(radialSegments: number) {
      const positions: number[] = [];
      const indices: number[] = [];
      for (let i = 0; i <= radialSegments; i += 1) {
        const t = (i / radialSegments) * Math.PI * 2;
        const x = Math.cos(t);
        const z = Math.sin(t);
        positions.push(x, -1, z);
        positions.push(x, 1, z);
      }
      for (let i = 0; i < radialSegments; i += 1) {
        const a = i * 2;
        const b = a + 1;
        const c = a + 2;
        const d = a + 3;
        indices.push(a, b, c);
        indices.push(b, d, c);
      }
      return { positions: new Float32Array(positions), indices: new Uint16Array(indices) };
    }

    const cylinderGeometry = buildCylinderGeometry(18);
    const cylinderVertexBuffer = gl.createBuffer();
    const cylinderIndexBuffer = gl.createBuffer();
    if (!cylinderVertexBuffer || !cylinderIndexBuffer) {
      throw new Error("Failed to create cylinder buffers");
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, cylinderVertexBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, cylinderGeometry.positions, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, cylinderIndexBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, cylinderGeometry.indices, gl.STATIC_DRAW);

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

    function getViewProjectionMatrices() {
      const aspect = canvas.width / Math.max(canvas.height, 1);
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
        mat4.lookAt(view, camera.position, orbitTargetRef.current, [0, 1, 0]);
      }

      return { projection, view, forward };
    }

    function intersectModelPlane(
      model: mat4,
      rayOriginClientX: number,
      rayOriginClientY: number,
      projection: mat4,
      view: mat4
    ): RayHit | null {
      const ray = createRayFromScreen({
        canvas,
        clientX: rayOriginClientX,
        clientY: rayOriginClientY,
        projection,
        view,
      });
      if (!ray) return null;

      const a = transformPoint(model, [-1, -1, 0]);
      const b = transformPoint(model, [1, -1, 0]);
      const c = transformPoint(model, [1, 1, 0]);
      const d = transformPoint(model, [-1, 1, 0]);
      return intersectRayQuad(ray, a, b, c, d);
    }

    function makePrimitiveLayerModel(index: number): mat4 {
      const model = mat4.create();
      mat4.translate(model, model, [index * 0.15, index * 0.15, -index * 0.05]);
      return model;
    }

    function publishHoveredSceneHit(hit: ScenePointerHit | null) {
      hoveredSceneHitRef.current = hit;
      const key = hit
        ? `${hit.layerId}|${hit.position.map((value) => value.toFixed(5)).join(",")}|${hit.distance.toFixed(5)}`
        : "null";
      if (key === lastPublishedSceneHitRef.current) return;
      lastPublishedSceneHitRef.current = key;
      onScenePointerTargetChange?.(hit);
    }

    function pickSceneAtClientPosition(clientX: number, clientY: number): ScenePointerHit | null {
      const { projection, view, forward } = getViewProjectionMatrices();
      const layers = collectVisibleLayerItems(layerTreeRef.current, true);
      let bestHit: ScenePointerHit | null = null;

      function considerHit(layer: LayerItemNode, hit: RayHit | null) {
        if (!hit) return;
        if (!bestHit || hit.distance < bestHit.distance) {
          bestHit = {
            layerId: layer.id,
            layerName: layer.name,
            kind: "plane",
            distance: hit.distance,
            position: [hit.position[0], hit.position[1], hit.position[2]],
            normal: [hit.normal[0], hit.normal[1], hit.normal[2]],
          };
        }
      }

      for (let i = 0; i < layers.length; i += 1) {
        const layer = layers[i];

        if (isOmeZarrLayer(layer) && typeof layer.source === "string") {
          const volumeKey = getVolumeCacheKey(
            layer.source,
            getRemoteLayerResolutionUm(layer),
            getRemoteLayerContentKind(layer)
          );
          const volume = volumeCacheRef.current.get(volumeKey);
          if (!volume) continue;

          if (layer.renderMode === "volume") {
            const plane = chooseVolumeRenderPlane(forward);
            const totalSlices = getPlaneSliceCount(volume, plane);
            const displayIndices = buildVolumeDisplayIndices(totalSlices);
            for (const displayIndex of displayIndices) {
              const model = makeSliceModelMatrix(volume, plane, displayIndex, ALLEN_VOLUME_PROFILE);
              considerHit(layer, intersectModelPlane(model, clientX, clientY, projection, view));
            }
          } else if (layer.renderMode === "slices") {
            const { sx, sy, sz } = getVolumeDisplayScale(volume);

            const modelXY = mat4.create();
            mat4.scale(modelXY, modelXY, [sx, sy, 1]);
            considerHit(layer, intersectModelPlane(modelXY, clientX, clientY, projection, view));

            const modelXZ = mat4.create();
            mat4.rotateX(modelXZ, modelXZ, Math.PI / 2);
            mat4.scale(modelXZ, modelXZ, [sx, sz, 1]);
            considerHit(layer, intersectModelPlane(modelXZ, clientX, clientY, projection, view));

            const modelYZ = mat4.create();
            mat4.rotateY(modelYZ, modelYZ, Math.PI / 2);
            mat4.scale(modelYZ, modelYZ, [sz, sy, 1]);
            considerHit(layer, intersectModelPlane(modelYZ, clientX, clientY, projection, view));
          }

          continue;
        }

        if (layer.type === "custom-slice") {
          const volumeLayerId = hasVolumeLayerId(layer.source) ? layer.source.volumeLayerId : null;
          const sliceParams = layer.sliceParams;
          if (!volumeLayerId || !sliceParams) continue;

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
          if (!volume) continue;

          let model: mat4 | null = null;
          const isOblique =
            sliceParams.mode === "oblique" &&
            !!sliceParams.normal &&
            typeof sliceParams.normal.x === "number" &&
            typeof sliceParams.normal.y === "number" &&
            typeof sliceParams.normal.z === "number";

          if (isOblique) {
            model = makeObliqueSliceModelMatrix(volume, {
              normal: {
                x: sliceParams.normal.x,
                y: sliceParams.normal.y,
                z: sliceParams.normal.z,
              },
              offset: sliceParams.offset ?? 0,
              width: sliceParams.width ?? 256,
              height: sliceParams.height ?? 256,
            }, ALLEN_VOLUME_PROFILE);
          } else if (isAxisAlignedSliceParams(sliceParams)) {
            const safeIndex = clampSliceIndex(volume, sliceParams.plane, sliceParams.index);
            model = makeSliceModelMatrix(volume, sliceParams.plane, safeIndex, ALLEN_VOLUME_PROFILE);
          }

          if (model) {
            considerHit(layer, intersectModelPlane(model, clientX, clientY, projection, view));
          }

          continue;
        }

        if (layer.type === "primitive") {
          const model = makePrimitiveLayerModel(i);
          considerHit(layer, intersectModelPlane(model, clientX, clientY, projection, view));
        }
      }

      return bestHit;
    }

    const camera = cameraRef.current;

    let targetFovDeg = camera.fovDeg;
    const keys = new Set<string>();
    let dragging = false;
    let dragMode: "rotate" | "pan" | null = null;
    let freehandDrawing = false;
    let eraseDrawing = false;
    let freehandPoints: [number, number, number][] = [];
    let freehandNormals: [number, number, number][] = [];
    let freehandAttachedLayerId: string | undefined;
    let freehandAttachedLayerName: string | undefined;
    let erasePath: [number, number, number][] = [];
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
      return vec3.distance(camera.position, orbitTargetRef.current);
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

      camera.position[0] = orbitTargetRef.current[0] - x;
      camera.position[1] = orbitTargetRef.current[1] - y;
      camera.position[2] = orbitTargetRef.current[2] - z;
      camera.yaw = yawDeg;
      camera.pitch = pitchDeg;
    }

    function panOrbitTarget(dxPixels: number, dyPixels: number) {
      const distance = Math.max(0.25, getCameraDistanceToTarget());
      const worldUnitsPerPixel = (2 * distance * Math.tan((camera.fovDeg * Math.PI) / 360)) / Math.max(canvas.clientHeight, 1);
      const forward = getForward();
      const worldUp = vec3.fromValues(0, 1, 0);
      const right = vec3.create();
      vec3.cross(right, forward, worldUp);
      if (vec3.length(right) <= 1e-6) {
        vec3.set(right, 1, 0, 0);
      } else {
        vec3.normalize(right, right);
      }
      const up = vec3.create();
      vec3.cross(up, right, forward);
      if (vec3.length(up) <= 1e-6) {
        vec3.set(up, 0, 1, 0);
      } else {
        vec3.normalize(up, up);
      }
      const pan = vec3.create();
      vec3.scaleAndAdd(pan, pan, right, -dxPixels * worldUnitsPerPixel);
      vec3.scaleAndAdd(pan, pan, up, dyPixels * worldUnitsPerPixel);
      vec3.add(orbitTargetRef.current, orbitTargetRef.current, pan);
      vec3.add(orbitTargetGoalRef.current, orbitTargetGoalRef.current, pan);
      setCameraFromOrbitAngles(distance, camera.yaw, camera.pitch);
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

    function drawColorSphere(mvp: mat4, color: [number, number, number, number]) {
      resetVertexAttribArrays();

      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

      gl.useProgram(colorProgram);
      gl.uniformMatrix4fv(uColorMVP, false, mvp);
      gl.uniform4f(uColor, color[0], color[1], color[2], color[3]);

      gl.bindBuffer(gl.ARRAY_BUFFER, sphereVertexBuffer);
      gl.enableVertexAttribArray(aColorPosition);
      gl.vertexAttribPointer(aColorPosition, 3, gl.FLOAT, false, 0, 0);

      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, sphereIndexBuffer);
      gl.drawElements(gl.TRIANGLES, sphereGeometry.indices.length, gl.UNSIGNED_SHORT, 0);
    }

    function drawBrushStamp(position: [number, number, number], normal: [number, number, number] | null | undefined, radius: number, depth: number, color: [number, number, number, number], view: mat4, projection: mat4) {
      const model = mat4.create();
      const mv = mat4.create();
      const mvp = mat4.create();
      const nx = normal?.[0] ?? 0;
      const ny = normal?.[1] ?? 0;
      const nz = normal?.[2] ?? 1;
      const { normal: n, axisU, axisV } = makePlaneBasis([nx, ny, nz]);
      const center = [
        position[0] + n[0] * Math.max(depth * 0.18, 0.0008),
        position[1] + n[1] * Math.max(depth * 0.18, 0.0008),
        position[2] + n[2] * Math.max(depth * 0.18, 0.0008),
      ] as const;
      mat4.set(
        model,
        axisU[0] * radius, axisU[1] * radius, axisU[2] * radius, 0,
        n[0] * depth, n[1] * depth, n[2] * depth, 0,
        axisV[0] * radius, axisV[1] * radius, axisV[2] * radius, 0,
        center[0], center[1], center[2], 1
      );
      mat4.multiply(mv, view, model);
      mat4.multiply(mvp, projection, mv);
      drawColorSphere(mvp, color);
    }

    function drawFreehandStroke(points: [number, number, number][], normals: [number, number, number][], radius: number, depth: number, color: [number, number, number, number], view: mat4, projection: mat4) {
      if (points.length === 0) return;
      const spacing = Math.max(radius * 0.45, 0.0035);
      for (let i = 0; i < points.length; i += 1) {
        drawBrushStamp(points[i], normals[i], radius, depth, color, view, projection);
        if (i === 0) continue;
        const a = points[i - 1];
        const b = points[i];
        const an = normals[i - 1] ?? normals[i] ?? [0, 0, 1];
        const bn = normals[i] ?? an;
        const dx = b[0] - a[0];
        const dy = b[1] - a[1];
        const dz = b[2] - a[2];
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
        const steps = Math.max(1, Math.ceil(dist / spacing));
        for (let step = 1; step < steps; step += 1) {
          const t = step / steps;
          drawBrushStamp(
            [a[0] + dx * t, a[1] + dy * t, a[2] + dz * t],
            [an[0] + (bn[0] - an[0]) * t, an[1] + (bn[1] - an[1]) * t, an[2] + (bn[2] - an[2]) * t],
            radius,
            depth,
            color,
            view,
            projection
          );
        }
      }
    }

function drawColorCylinder(mvp: mat4, color: [number, number, number, number]) {
      resetVertexAttribArrays();

      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

      gl.useProgram(colorProgram);
      gl.uniformMatrix4fv(uColorMVP, false, mvp);
      gl.uniform4f(uColor, color[0], color[1], color[2], color[3]);

      gl.bindBuffer(gl.ARRAY_BUFFER, cylinderVertexBuffer);
      gl.enableVertexAttribArray(aColorPosition);
      gl.vertexAttribPointer(aColorPosition, 3, gl.FLOAT, false, 0, 0);

      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, cylinderIndexBuffer);
      gl.drawElements(gl.TRIANGLES, cylinderGeometry.indices.length, gl.UNSIGNED_SHORT, 0);
    }

    function makeLineModelMatrix(start: [number, number, number], end: [number, number, number], radius: number): mat4 | null {
      const startV = vec3.fromValues(start[0], start[1], start[2]);
      const endV = vec3.fromValues(end[0], end[1], end[2]);
      const axisY = vec3.create();
      vec3.subtract(axisY, endV, startV);
      const length = vec3.length(axisY);
      if (length <= 1e-6) return null;
      vec3.scale(axisY, axisY, 1 / length);

      const fallback = Math.abs(axisY[1]) < 0.95 ? vec3.fromValues(0, 1, 0) : vec3.fromValues(1, 0, 0);
      const axisX = vec3.create();
      vec3.cross(axisX, fallback, axisY);
      if (vec3.length(axisX) <= 1e-6) return null;
      vec3.normalize(axisX, axisX);

      const axisZ = vec3.create();
      vec3.cross(axisZ, axisY, axisX);
      vec3.normalize(axisZ, axisZ);

      const center = vec3.create();
      vec3.add(center, startV, endV);
      vec3.scale(center, center, 0.5);

      const model = mat4.create();
      mat4.set(
        model,
        axisX[0] * radius, axisX[1] * radius, axisX[2] * radius, 0,
        axisY[0] * (length * 0.5), axisY[1] * (length * 0.5), axisY[2] * (length * 0.5), 0,
        axisZ[0] * radius, axisZ[1] * radius, axisZ[2] * radius, 0,
        center[0], center[1], center[2], 1
      );
      return model;
    }

    function makePlaneBasis(normalInput: [number, number, number]) {
      const normal = vec3.fromValues(normalInput[0], normalInput[1], normalInput[2]);
      if (vec3.length(normal) <= 1e-8) {
        vec3.set(normal, 0, 0, 1);
      } else {
        vec3.normalize(normal, normal);
      }

      const reference = Math.abs(normal[1]) < 0.95 ? vec3.fromValues(0, 1, 0) : vec3.fromValues(1, 0, 0);
      const axisU = vec3.create();
      vec3.cross(axisU, reference, normal);
      if (vec3.length(axisU) <= 1e-8) {
        vec3.set(axisU, 1, 0, 0);
      } else {
        vec3.normalize(axisU, axisU);
      }
      const axisV = vec3.create();
      vec3.cross(axisV, normal, axisU);
      if (vec3.length(axisV) <= 1e-8) {
        vec3.set(axisV, 0, 1, 0);
      } else {
        vec3.normalize(axisV, axisV);
      }
      return { normal, axisU, axisV };
    }

    function projectDeltaOntoPlaneBasis(start: [number, number, number], end: [number, number, number], normal: [number, number, number]) {
      const { axisU, axisV } = makePlaneBasis(normal);
      const delta = vec3.fromValues(end[0] - start[0], end[1] - start[1], end[2] - start[2]);
      const du = vec3.dot(delta, axisU);
      const dv = vec3.dot(delta, axisV);
      return { axisU, axisV, du, dv };
    }

    function addScaledPoint(base: [number, number, number], axisA: vec3, scaleA: number, axisB?: vec3, scaleB?: number): [number, number, number] {
      return [
        base[0] + axisA[0] * scaleA + (axisB ? axisB[0] * (scaleB ?? 0) : 0),
        base[1] + axisA[1] * scaleA + (axisB ? axisB[1] * (scaleB ?? 0) : 0),
        base[2] + axisA[2] * scaleA + (axisB ? axisB[2] * (scaleB ?? 0) : 0),
      ];
    }

    function buildRectanglePoints(start: ScenePointerHit, end: ScenePointerHit): [number, number, number][] | null {
      const { axisU, axisV, du, dv } = projectDeltaOntoPlaneBasis(start.position, end.position, start.normal);
      if (Math.abs(du) <= 1e-5 && Math.abs(dv) <= 1e-5) return null;
      const p0: [number, number, number] = [start.position[0], start.position[1], start.position[2]];
      const p1 = addScaledPoint(p0, axisU, du);
      const p2 = addScaledPoint(p1, axisV, dv);
      const p3 = addScaledPoint(p0, axisV, dv);
      return [p0, p1, p2, p3];
    }

    function buildCirclePoints(center: ScenePointerHit, edge: ScenePointerHit, segments: number = 40): [number, number, number][] | null {
      const { axisU, axisV, du, dv } = projectDeltaOntoPlaneBasis(center.position, edge.position, center.normal);
      const radius = Math.hypot(du, dv);
      if (radius <= 1e-5) return null;
      const points: [number, number, number][] = [];
      const centerPoint: [number, number, number] = [center.position[0], center.position[1], center.position[2]];
      for (let i = 0; i < segments; i += 1) {
        const angle = (i / segments) * Math.PI * 2;
        points.push(addScaledPoint(centerPoint, axisU, Math.cos(angle) * radius, axisV, Math.sin(angle) * radius));
      }
      return points;
    }

    function drawPolylineCylinders(points: [number, number, number][], closed: boolean, radius: number, color: [number, number, number, number], view: mat4, projection: mat4) {
      const count = closed ? points.length : points.length - 1;
      for (let i = 0; i < count; i += 1) {
        const start = points[i];
        const end = points[(i + 1) % points.length];
        const model = makeLineModelMatrix(start, end, radius);
        if (!model) continue;
        const mv = mat4.create();
        const mvp = mat4.create();
        mat4.multiply(mv, view, model);
        mat4.multiply(mvp, projection, mv);
        drawColorCylinder(mvp, color);
      }
    }

    function getShapePreviewPoints() {
      const start = shapeDragStartHitRef.current;
      const current = shapeDragCurrentHitRef.current;
      if (!start || !current) return null;
      const shape = annotationShapeRef.current;
      if (shape === "rectangle") {
        const points = buildRectanglePoints(start, current);
        if (!points) return null;
        return { shape: "rectangle" as const, points, start, current };
      }
      if (shape === "circle") {
        const points = buildCirclePoints(start, current);
        if (!points) return null;
        return { shape: "circle" as const, points, start, current };
      }
      return null;
    }

    function collectPointAnnotationCandidates() {
      const candidates: Array<{ layerId: string; layerName: string; point: [number, number, number]; size: number }> = [];
      const layers = collectVisibleLayerItems(layerTreeRef.current, true);
      for (const layer of layers) {
        if (layer.type !== "annotation") continue;
        if (layer.annotation?.shape !== "point") continue;
        const point = layer.annotation.points?.[0];
        if (!point) continue;
        candidates.push({
          layerId: layer.id,
          layerName: layer.name,
          point,
          size: Math.max(0.01, layer.annotation.size ?? 0.06),
        });
      }
      return candidates;
    }

    function snapHitToExistingPoint(hit: ScenePointerHit | null): ScenePointerHit | null {
      if (!hit) return null;
      const candidates = collectPointAnnotationCandidates();
      if (!candidates.length) return hit;

      let best: typeof candidates[number] | null = null;
      let bestDistance = Infinity;
      const hitPos = vec3.fromValues(hit.position[0], hit.position[1], hit.position[2]);

      for (const candidate of candidates) {
        const candidatePos = vec3.fromValues(candidate.point[0], candidate.point[1], candidate.point[2]);
        const distance = vec3.distance(hitPos, candidatePos);
        const threshold = Math.max(candidate.size * 2.25, 0.04);
        if (distance <= threshold && distance < bestDistance) {
          best = candidate;
          bestDistance = distance;
        }
      }

      if (!best) return hit;
      return {
        ...hit,
        layerId: best.layerId,
        layerName: best.layerName,
        position: [best.point[0], best.point[1], best.point[2]],
      };
    }

    function getCurrentHoveredOrSnappedHit(clientX: number, clientY: number) {
      return snapHitToExistingPoint(pickSceneAtClientPosition(clientX, clientY));
    }

    function getLinePreviewEndHit() {
      const hovered = hoveredSceneHitRef.current;
      const start = lineStartHitRef.current;
      if (!hovered || !start) return null;
      const same = hovered.position[0] === start.position[0] && hovered.position[1] === start.position[1] && hovered.position[2] === start.position[2];
      return same ? null : hovered;
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
        const beforeTarget = vec3.clone(orbitTargetRef.current);
        vec3.lerp(orbitTargetRef.current, orbitTargetRef.current, orbitTargetGoalRef.current, orbitAlpha);
        const targetMoved = vec3.distance(beforeTarget, orbitTargetRef.current) > 1e-5;
        if (Math.abs(nextDistance - currentDistance) > 1e-4 || targetMoved) {
          setCameraFromOrbitAngles(nextDistance, camera.yaw, camera.pitch);
          publishCameraIfNeeded(camera);
        }
      }

      gl.enable(gl.DEPTH_TEST);
      const [bgR, bgG, bgB] = hexToRgb01(backgroundColor);
      gl.clearColor(bgR, bgG, bgB, 1.0);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

      const { projection, view, forward } = getViewProjectionMatrices();

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

        if (layer.type === "annotation") {
          const annotation = layer.annotation;
          if (annotation?.shape === "point" && annotation.points?.[0]) {
            const point = annotation.points[0];
            const size = Math.max(0.002, annotation.size ?? 0.06);
            const opacity = clamp(annotation.opacity ?? 0.9, 0.05, 1);
            const [r, g, b] = hexToRgb01(annotation.color ?? "#ff5c5c");
            const model = mat4.create();
            const mv = mat4.create();
            const mvp = mat4.create();

            mat4.translate(model, model, point);
            mat4.scale(model, model, [size, size, size]);
            mat4.multiply(mv, view, model);
            mat4.multiply(mvp, projection, mv);

            if (isHighlighted) {
              drawColorSphere(mvp, [Math.min(r + 0.18, 1), Math.min(g + 0.18, 1), Math.min(b + 0.18, 1), 1]);
            } else {
              drawColorSphere(mvp, [r, g, b, opacity]);
            }
          }

          if (annotation?.shape === "line" && annotation.points && annotation.points.length >= 2) {
            const start = annotation.points[0];
            const end = annotation.points[1];
            const radius = Math.max(0.002, annotation.size ?? 0.03);
            const opacity = clamp(annotation.opacity ?? 0.9, 0.05, 1);
            const [r, g, b] = hexToRgb01(annotation.color ?? "#ff5c5c");
            const lineModel = makeLineModelMatrix(start, end, radius);
            if (lineModel) {
              const mv = mat4.create();
              const mvp = mat4.create();
              mat4.multiply(mv, view, lineModel);
              mat4.multiply(mvp, projection, mv);
              if (isHighlighted) {
                drawColorCylinder(mvp, [Math.min(r + 0.18, 1), Math.min(g + 0.18, 1), Math.min(b + 0.18, 1), 1]);
              } else {
                drawColorCylinder(mvp, [r, g, b, opacity]);
              }
            }

            const endpointSize = Math.max(radius * 1.25, 0.008);
            for (const point of [start, end]) {
              const model = mat4.create();
              const mv = mat4.create();
              const mvp = mat4.create();
              mat4.translate(model, model, point);
              mat4.scale(model, model, [endpointSize, endpointSize, endpointSize]);
              mat4.multiply(mv, view, model);
              mat4.multiply(mvp, projection, mv);
              drawColorSphere(mvp, isHighlighted ? [Math.min(r + 0.18, 1), Math.min(g + 0.18, 1), Math.min(b + 0.18, 1), 1] : [r, g, b, opacity]);
            }
          }

          if ((annotation?.shape === "rectangle" || annotation?.shape === "circle") && annotation.points && annotation.points.length >= 2) {
            const radius = Math.max(0.0015, (annotation.size ?? 0.06) * 0.28);
            const opacity = clamp(annotation.opacity ?? 0.9, 0.05, 1);
            const [r, g, b] = hexToRgb01(annotation.color ?? "#ff5c5c");
            const color: [number, number, number, number] = isHighlighted
              ? [Math.min(r + 0.18, 1), Math.min(g + 0.18, 1), Math.min(b + 0.18, 1), 1]
              : [r, g, b, opacity];
            drawPolylineCylinders(annotation.points as [number, number, number][], true, radius, color, view, projection);
          }

          if (annotation?.shape === "freehand") {
            const size = Math.max(0.002, annotation.size ?? 0.06);
            const brushDepth = Math.max(0.0015, annotation.brushDepth ?? Math.max(size * 0.28, 0.015));
            const opacity = clamp(annotation.opacity ?? 0.9, 0.05, 1);
            const [r, g, b] = hexToRgb01(annotation.color ?? "#ff5c5c");
            const color: [number, number, number, number] = isHighlighted
              ? [Math.min(r + 0.18, 1), Math.min(g + 0.18, 1), Math.min(b + 0.18, 1), 1]
              : [r, g, b, opacity];
            for (const stroke of annotation.freehandStrokes ?? []) {
              drawFreehandStroke(stroke.points, stroke.normals ?? stroke.points.map(() => [0, 0, 1] as [number, number, number]), size, brushDepth, color, view, projection);
            }
          }

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

      const hoveredHit = hoveredSceneHitRef.current;
      if (activeToolRef.current === "pencil" && hoveredHit) {
        const previewSize = annotationSizeRef.current;
        const previewColor = annotationColorRef.current;
        const previewOpacity = annotationOpacityRef.current;
        const [r, g, b] = hexToRgb01(previewColor);

        if (annotationShapeRef.current === "point") {
          const model = mat4.create();
          mat4.translate(model, model, hoveredHit.position);
          mat4.scale(model, model, [previewSize, previewSize, previewSize]);
          const mv = mat4.create();
          const mvp = mat4.create();
          mat4.multiply(mv, view, model);
          mat4.multiply(mvp, projection, mv);
          drawColorSphere(mvp, [r, g, b, clamp(previewOpacity, 0.05, 1)]);
        }

        if (annotationShapeRef.current === "freehand") {
          drawBrushStamp(hoveredHit.position, hoveredHit.normal, previewSize, Math.max(0.0015, annotationDepthRef.current), [r, g, b, clamp(previewOpacity * 0.85, 0.05, 1)], view, projection);
        }

        if (annotationShapeRef.current === "eraser") {
          drawBrushStamp(hoveredHit.position, hoveredHit.normal, previewSize, Math.max(0.0015, annotationDepthRef.current), [1, 0.3, 0.3, 0.45], view, projection);
        }

        if (annotationShapeRef.current === "line") {
          const startHit = lineStartHitRef.current;
          const previewEnd = getLinePreviewEndHit();

          if (startHit) {
            const lineModel = previewEnd ? makeLineModelMatrix(startHit.position, previewEnd.position, Math.max(0.002, previewSize)) : null;
            if (lineModel) {
              const mv = mat4.create();
              const mvp = mat4.create();
              mat4.multiply(mv, view, lineModel);
              mat4.multiply(mvp, projection, mv);
              drawColorCylinder(mvp, [r, g, b, clamp(previewOpacity, 0.05, 1)]);
            }

            for (const point of [startHit.position, hoveredHit.position]) {
              const model = mat4.create();
              const mv = mat4.create();
              const mvp = mat4.create();
              mat4.translate(model, model, point);
              mat4.scale(model, model, [Math.max(previewSize * 1.2, 0.008), Math.max(previewSize * 1.2, 0.008), Math.max(previewSize * 1.2, 0.008)]);
              mat4.multiply(mv, view, model);
              mat4.multiply(mvp, projection, mv);
              drawColorSphere(mvp, [r, g, b, clamp(previewOpacity, 0.08, 1)]);
            }
          } else {
            const model = mat4.create();
            mat4.translate(model, model, hoveredHit.position);
            mat4.scale(model, model, [Math.max(previewSize * 1.2, 0.008), Math.max(previewSize * 1.2, 0.008), Math.max(previewSize * 1.2, 0.008)]);
            const mv = mat4.create();
            const mvp = mat4.create();
            mat4.multiply(mv, view, model);
            mat4.multiply(mvp, projection, mv);
            drawColorSphere(mvp, [r, g, b, clamp(previewOpacity, 0.08, 1)]);
          }
        }

        if (annotationShapeRef.current === "rectangle" || annotationShapeRef.current === "circle") {
          const preview = getShapePreviewPoints();
          if (preview) {
            const strokeRadius = Math.max(0.0015, previewSize * 0.28);
            drawPolylineCylinders(preview.points, true, strokeRadius, [r, g, b, clamp(previewOpacity, 0.05, 1)], view, projection);

            const endpointScale = Math.max(previewSize * 1.0, 0.008);
            const anchorPoints = preview.shape === "rectangle"
              ? [preview.points[0], preview.points[2]]
              : [preview.start.position, preview.current.position];
            for (const point of anchorPoints) {
              const model = mat4.create();
              const mv = mat4.create();
              const mvp = mat4.create();
              mat4.translate(model, model, point);
              mat4.scale(model, model, [endpointScale, endpointScale, endpointScale]);
              mat4.multiply(mv, view, model);
              mat4.multiply(mvp, projection, mv);
              drawColorSphere(mvp, [r, g, b, clamp(previewOpacity, 0.08, 1)]);
            }
          } else if (hoveredHit) {
            const model = mat4.create();
            mat4.translate(model, model, hoveredHit.position);
            mat4.scale(model, model, [Math.max(previewSize, 0.008), Math.max(previewSize, 0.008), Math.max(previewSize, 0.008)]);
            const mv = mat4.create();
            const mvp = mat4.create();
            mat4.multiply(mv, view, model);
            mat4.multiply(mvp, projection, mv);
            drawColorSphere(mvp, [r, g, b, clamp(previewOpacity, 0.08, 1)]);
          }
        }
      }

      if (freehandPoints.length > 0 && freehandDrawing) {
        const [r, g, b] = hexToRgb01(annotationColorRef.current);
        drawFreehandStroke(freehandPoints, freehandNormals, Math.max(0.002, annotationSizeRef.current), Math.max(0.0015, annotationDepthRef.current), [r, g, b, clamp(annotationOpacityRef.current, 0.05, 1)], view, projection);
      }
      if (erasePath.length > 0 && eraseDrawing) {
        drawFreehandStroke(erasePath, erasePath.map(() => [0, 0, 1] as [number, number, number]), Math.max(0.002, annotationSizeRef.current), Math.max(0.0015, annotationDepthRef.current), [1, 0.3, 0.3, 0.25], view, projection);
      }

      animationFrameId = requestAnimationFrame(render);
    }

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && activeToolRef.current === "pencil") {
        lineStartHitRef.current = null;
        shapeDragStartHitRef.current = null;
        shapeDragCurrentHitRef.current = null;
        freehandDrawing = false;
        eraseDrawing = false;
        freehandPoints = [];
        freehandNormals = [];
        erasePath = [];
        freehandAttachedLayerId = undefined;
        freehandAttachedLayerName = undefined;
        return;
      }
      if (activeToolRef.current !== "mouse") return;
      if (camera.mode !== "fly") return;
      keys.add(e.key.toLowerCase());
    }

    function onKeyUp(e: KeyboardEvent) {
      keys.delete(e.key.toLowerCase());
    }

    function onMouseDown(e: MouseEvent) {
      if (activeToolRef.current === "mouse") {
        if (camera.mode === "orbit") {
          if (e.button === 0) {
            dragging = true;
            dragMode = "rotate";
            lastMouseX = e.clientX;
            lastMouseY = e.clientY;
            return;
          }
          if (e.button === 1) {
            e.preventDefault();
            dragging = true;
            dragMode = "pan";
            lastMouseX = e.clientX;
            lastMouseY = e.clientY;
            return;
          }
          return;
        }

        if (e.button !== 0) return;
        dragging = true;
        dragMode = "rotate";
        lastMouseX = e.clientX;
        lastMouseY = e.clientY;
        return;
      }

      if (activeToolRef.current === "pencil") {
        const hit = getCurrentHoveredOrSnappedHit(e.clientX, e.clientY);
        publishHoveredSceneHit(hit);

        if (annotationShapeRef.current === "point" && hit) {
          e.preventDefault();
          onCreatePointAnnotationRef.current?.(hit);
          return;
        }

        if (annotationShapeRef.current === "freehand" && hit) {
          e.preventDefault();
          freehandDrawing = true;
          eraseDrawing = false;
          freehandPoints = [hit.position];
          freehandNormals = [hit.normal];
          freehandAttachedLayerId = hit.layerId;
          freehandAttachedLayerName = hit.layerName;
          return;
        }

        if (annotationShapeRef.current === "eraser" && hit) {
          e.preventDefault();
          eraseDrawing = true;
          freehandDrawing = false;
          erasePath = [hit.position];
          return;
        }

        if (annotationShapeRef.current === "line" && hit) {
          e.preventDefault();
          const startHit = lineStartHitRef.current;
          if (!startHit) {
            lineStartHitRef.current = hit;
          } else {
            const same = startHit.position[0] === hit.position[0] && startHit.position[1] === hit.position[1] && startHit.position[2] === hit.position[2];
            if (!same) {
              onCreateLineAnnotationRef.current?.({ start: startHit, end: hit });
            }
            lineStartHitRef.current = null;
          }
          return;
        }

        if ((annotationShapeRef.current === "rectangle" || annotationShapeRef.current === "circle") && hit) {
          e.preventDefault();
          shapeDragStartHitRef.current = hit;
          shapeDragCurrentHitRef.current = hit;
          return;
        }
      }
    }

    function onMouseUp(e: MouseEvent) {
      dragging = false;
      dragMode = null;

      if (freehandDrawing && freehandPoints.length > 0) {
        onCommitFreehandStrokeRef.current?.({
          points: freehandPoints,
          normals: freehandNormals,
          attachedLayerId: freehandAttachedLayerId,
          attachedLayerName: freehandAttachedLayerName,
        });
      }
      if (eraseDrawing && erasePath.length > 0) {
        onEraseFreehandRef.current?.({ path: erasePath, radius: Math.max(0.002, annotationSizeRef.current) });
      }
      freehandDrawing = false;
      eraseDrawing = false;
      freehandPoints = [];
      freehandNormals = [];
      erasePath = [];
      freehandAttachedLayerId = undefined;
      freehandAttachedLayerName = undefined;

      if (activeToolRef.current !== "pencil") return;
      if (!shapeDragStartHitRef.current) return;
      if (annotationShapeRef.current !== "rectangle" && annotationShapeRef.current !== "circle") {
        shapeDragStartHitRef.current = null;
        shapeDragCurrentHitRef.current = null;
        return;
      }

      const start = shapeDragStartHitRef.current;
      const end = getCurrentHoveredOrSnappedHit(e.clientX, e.clientY) ?? shapeDragCurrentHitRef.current;
      shapeDragCurrentHitRef.current = end;
      const shape = annotationShapeRef.current;
      const points = shape === "rectangle"
        ? (end ? buildRectanglePoints(start, end) : null)
        : (end ? buildCirclePoints(start, end) : null);

      if (end && points && points.length >= 2) {
        const distinct = points.some((point, index) => {
          if (index === 0) return false;
          const prev = points[0];
          return Math.hypot(point[0] - prev[0], point[1] - prev[1], point[2] - prev[2]) > 1e-4;
        });
        if (distinct) {
          onCreateShapeAnnotationRef.current?.({
            shape,
            points,
            normal: [start.normal[0], start.normal[1], start.normal[2]],
            layerId: start.layerId,
            layerName: start.layerName,
          });
        }
      }

      shapeDragStartHitRef.current = null;
      shapeDragCurrentHitRef.current = null;
    }

    function onMouseLeave() {
      dragging = false;
      dragMode = null;
      shapeDragCurrentHitRef.current = null;
      publishHoveredSceneHit(null);
    }

    function onMouseMove(e: MouseEvent) {
      if (activeToolRef.current === "pencil") {
        const hit = getCurrentHoveredOrSnappedHit(e.clientX, e.clientY);
        publishHoveredSceneHit(hit);
        if (shapeDragStartHitRef.current && (annotationShapeRef.current === "rectangle" || annotationShapeRef.current === "circle")) {
          shapeDragCurrentHitRef.current = hit;
        }
        if (freehandDrawing && hit) {
          const last = freehandPoints[freehandPoints.length - 1];
          const dx = hit.position[0] - last[0];
          const dy = hit.position[1] - last[1];
          const dz = hit.position[2] - last[2];
          const distSq = dx * dx + dy * dy + dz * dz;
          const minStep = Math.max(0.0016, annotationSizeRef.current * 0.18);
          if (distSq >= minStep * minStep) {
            freehandPoints = [...freehandPoints, hit.position];
            freehandNormals = [...freehandNormals, hit.normal];
          }
        }
        if (eraseDrawing && hit) {
          const last = erasePath[erasePath.length - 1];
          const dx = hit.position[0] - last[0];
          const dy = hit.position[1] - last[1];
          const dz = hit.position[2] - last[2];
          const distSq = dx * dx + dy * dy + dz * dz;
          const minStep = Math.max(0.0016, annotationSizeRef.current * 0.25);
          if (distSq >= minStep * minStep) {
            erasePath = [...erasePath, hit.position];
          }
        }
        return;
      }

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

      if (dragMode === "pan") {
        panOrbitTarget(dx, dy);
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
    canvas.addEventListener("mouseleave", onMouseLeave);
    window.addEventListener("mouseup", onMouseUp);
    window.addEventListener("mousemove", onMouseMove);
    function onAuxClick(event: MouseEvent) {
      if (event.button === 1) event.preventDefault();
    }

    canvas.addEventListener("wheel", onWheel, { passive: false });
    canvas.addEventListener("auxclick", onAuxClick);
    window.addEventListener("resize", resizeCanvas);

    resizeCanvas();
    animationFrameId = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      canvas.removeEventListener("mousedown", onMouseDown);
      canvas.removeEventListener("mouseleave", onMouseLeave);
      window.removeEventListener("mouseup", onMouseUp);
      window.removeEventListener("mousemove", onMouseMove);
      canvas.removeEventListener("wheel", onWheel);
      canvas.removeEventListener("auxclick", onAuxClick);
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
      gl.deleteBuffer(sphereVertexBuffer);
      gl.deleteBuffer(sphereIndexBuffer);
      gl.deleteBuffer(cylinderVertexBuffer);
      gl.deleteBuffer(cylinderIndexBuffer);
      gl.deleteProgram(colorProgram);
      gl.deleteProgram(textureProgram);
      gl.deleteProgram(volumeTextureProgram);
    };
  }, [selectedNodeId, highlightedLayerIds, loadTick, backgroundColor]);

  return (
    <div style={{ width: "100%", height: "100%", position: "relative" }}>
      <canvas ref={canvasRef} style={{ width: "100%", height: "100%", display: "block" }} />

      {infoPanelContent ? (
        <div
          style={{
            position: "absolute",
            top: 12,
            left: 12,
            zIndex: 10,
            pointerEvents: "auto",
          }}
        >
          {infoPanelContent}
        </div>
      ) : null}
    </div>
  );
}
