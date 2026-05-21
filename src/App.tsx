import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
} from "react";
import WebGLCanvas from "./WebGLCanvas";
import BottomToolbar, {
  type CaptureStillMenuItem,
  type CaptureSequenceMenuItem,
  type HistoryMenuItem,
  type PipelineMenuItem,
} from "./BottomToolbar";
import type { ToolExtensionContext } from "./tools/extensionApi";
import { getToolExtensionDefinition, getUtilityToolExtensionDefinition } from "./tools/registry";
import {
  getHiddenToolbarToolIds,
  getVisibleToolbarToolIds,
  hideToolbarTool,
  loadToolbarLayout,
  moveToolbarTool,
  resetToolbarLayout,
  saveToolbarLayout,
  showToolbarTool,
  type ToolbarLayout,
} from "./toolbarLayoutStore";
import type { ToolId, ToolbarToolId } from "./tools/types";
import LayerPanel from "./LayerPanel";
import ImportDataPanel from "./ImportDataPanel";
import LocalDatasetManagerPanel from "./LocalDatasetManagerPanel";
import UserProfilePanel from "./UserProfilePanel";
import StatePanel from "./StatePanel";
import AutomationPipelinePanel from "./AutomationPipelinePanel";
import AppAssistantPanel from "./AppAssistantPanel";
import ResourceManagerPanel from "./ResourceManagerPanel";
import SaveToastStack, { type SaveToast, type TaskNotice } from "./components/app/SaveToastStack";
import VersionBadge from "./components/app/VersionBadge";
import LayerInspectorPanel from "./components/app/LayerInspectorPanel";
import GlobalDropOverlay from "./components/app/GlobalDropOverlay";
import AppMenuPanel from "./components/app/AppMenuPanel";
import AboutDialog from "./components/app/AboutDialog";
import ShareDialog from "./components/app/ShareDialog";
import StateDialog from "./components/app/StateDialog";
import ClearHistoryDialog from "./components/app/ClearHistoryDialog";
import type { FloatingWindowState } from "./components/app/FloatingWindowManager";
import { MetadataEditor } from "./components/app/MetadataRichContent";
import {
  createId,
  loadRecentAnnotationColors,
  saveRecentAnnotationColors,
  normalizeHexColor,
  ANNOTATION_RECENT_COLORS_STORAGE_KEY,
  getThemeRootCss,
} from "./utils/app/appHelpers";
import {
  loadAppPreferences,
  type AppPreferences,
} from "./appPreferencesStore";
import { getCustomExternalSources } from "./customSourceStore";
import {
  loadSourceOrientationPreference,
  saveSourceOrientationPreference,
} from "./sourceOrientationStore";
import {
  clearPersistedViewerState,
  loadPersistedViewerSession,
  savePersistedViewerSession,
  type CaptureSceneTransitionEasing,
  type PersistedCaptureScene,
  type PersistedCaptureSequence,
} from "./viewerStateStorage";
import {
  ALLEN_VIEWER_EMBED_NAMESPACE,
  type ViewerEmbedMessage,
  type ViewerEmbedRequest,
  type ViewerEmbedResponse,
} from "./viewerEmbedApi";
import {
  DEFAULT_CAMERA_STATE,
  createViewerState,
  getLocalOnlyLayerNames,
  hasLocalOnlyLayers,
  isSerializableLayerTree,
  mergeViewerState,
	  parseViewerState,
	  type SerializableFloatingWindowState,
	  type SerializableCameraState,
  type ViewerStatePatchV1,
  type ViewerStateV1,
	} from "./viewerState";
import { buildViewerShareUrl, readViewerStateFromHash } from "./viewerShare";
import {
  SHORTCUT_DEFINITIONS,
  doesShortcutMatchKeyboardEvent,
  doesShortcutMatchMouseEvent,
  loadShortcutBindings,
  resetShortcutBindings,
  resetSingleShortcutBinding,
  saveShortcutBindings,
  updateShortcutBindingUnique,
  type ShortcutBindingMap,
  type ShortcutCommandId,
} from "./shortcutStore";
import ViewerLibraryPanel from "./ViewerLibraryPanel";
import {
  buildDefaultSavedViewerName,
  clearPersistedViewerLibrary,
  createSavedViewerEntry,
  loadPersistedViewerLibrary,
  overwriteSavedViewerEntry,
  savePersistedViewerLibrary,
  upsertSharedViewerEntry,
  type SavedViewerEntry,
  type SavedViewerRevision,
} from "./viewerLibrary";
import {
  VIEWER_HISTORY_STORAGE_KEY,
  clampHistoryStack,
  clearPersistedViewerHistory,
  createViewerHistoryEntry,
  hashViewerStateForHistory,
  loadPersistedViewerHistory,
  savePersistedViewerHistory,
  type ViewerHistoryEntry,
} from "./viewerHistory";
import { useBrowserResourceTelemetry } from "./resourceTelemetry";
import {
  EMPTY_AUTOMATION_DEBUG_SNAPSHOT,
  parseAutomationScript,
  runAutomationPipelineForEvent,
  type AutomationAppCommand,
  type AutomationCustomTool,
  type AutomationDebugSnapshot,
  type AutomationEventName,
  type AutomationNode,
  type AutomationPipeline,
  type AutomationRunResult,
  type AutomationSelectionContext,
} from "./automationTypes";
import {
  formatBrowserAutomationResult,
  runBrowserAutomationCode,
} from "./browserAutomationRuntime";
import {
  isAutomationNodeRunOutput,
  runRegisteredAutomationNode,
  validateAutomationPipelineRuntime,
  type AutomationPacket,
  type AutomationNodeRunServices,
} from "./automationNodeRegistry";
import { loadAutomationCustomTools, loadAutomationPipelines } from "./automationStore";
import { buildAppAssistantContext, type AppAssistantConversation } from "./appAssistant";
import type { AppAssistantToolCall } from "./appAssistant";
import type {
  AnnotationShape,
  IntensityWindow,
  LayerItemNode,
  LayerTreeNode,
  MeshStyle,
  NodeTransform,
  RemoteContentKind,
  RemoteDataFormat,
  RemoteOmeResolution,
  RemoteRenderMode,
  SliceLayerParams,
  SlicePlane,
  VolumeOrientationPresetId,
} from "./layerTypes";
import {
  inspectStoredLocalDatasetById,
  type LocalImportCandidate,
  type LocalInputEntry,
} from "./localDataHandlers";
import {
  clearAllLocalDatasetRecords,
  deleteLocalDatasetRecord,
  renameLocalDatasetRecord,
  storeLocalDatasetFile,
  storeLocalDatasetTree,
  type StoredLocalDatasetRecord,
} from "./localDataStore";
import type { ScenePointerHit, SelectedLayerRuntimeInfo } from "./WebGLCanvas";
import {
  getProfileAdjustedPlaneBasis,
  makePlaneBasis,
  type ViewerOrientationProfile,
} from "./omeZarr";
import {
  cloneAxisSliceViewState,
  getDefaultTransformForOrientationPreset,
  getAxisSliceViewStateForOrientationPreset,
  getDefaultVolumeOrientationPresetForLayer,
  getEffectiveVolumeOrientationPresetForLayer,
  getViewerOrientationProfileForPreset,
  getVolumeOrientationSourceKey,
  isVolumeOrientationAdjustableLayer,
  type StoredTransformPreset,
  VOLUME_ORIENTATION_PRESET_OPTIONS,
} from "./volumeOrientation";
import {
  collectAllLayerItems,
  collectGroups,
  deleteNodeById,
  findNodeById,
  getFirstLayerId,
  insertIntoGroup,
  insertNodesBeforeNode,
  insertNodesIntoGroup,
  isCustomSliceLayer,
  isGroupNode,
  isRemoteOmeLayer,
  moveNodeBeforeNode,
  moveNodeToGroup,
  removeNodesByIds,
  renameNodeById,
  setGroupExpandedById,
  updateNodeById,
  setNodeVisibleState,
  toggleGroupExpandedById,
} from "./layerTypes";

declare global {
  interface Window {
    EyeDropper?: new () => {
      open: () => Promise<{ sRGBHex: string }>;
    };
    AllenViewerApi?: {
      ping: () => boolean;
      getState: () => ViewerStateV1;
      getStateJson: () => string;
      setState: (state: ViewerStateV1) => ViewerStateV1;
      setStateJson: (stateJson: string) => ViewerStateV1;
      patchState: (patch: ViewerStatePatchV1) => ViewerStateV1;
      setLayoutCollapsed: (collapsed: boolean) => ViewerStateV1;
      selectNode: (nodeId: string | null) => ViewerStateV1;
      openExport: () => void;
      openImport: () => void;
      closeDialogs: () => void;
      undo: () => ViewerStateV1 | null;
      redo: () => ViewerStateV1 | null;
      clearHistory: () => ViewerStateV1;
    };
  }
}

type ExternalSourceDraft = {
  id: string;
  name: string;
  url: string;
  icon?: "generic" | "custom";
  builtIn?: boolean;
  remoteFormat?: RemoteDataFormat;
  remoteContentKind?: RemoteContentKind;
  renderMode?: RemoteRenderMode;
  remoteResolution?: RemoteOmeResolution;
};


type ViewerStartupSlice = {
  volumeLayerId?: string;
  volumeUrl?: string;
  plane: SlicePlane;
  index: number;
  name?: string;
  opacity?: number;
};

type AppProps = {
  startupSlices?: ViewerStartupSlice[];
};

type AnnotationShapeSizeMap = Record<AnnotationShape, number>;
type LayerClipboardPayload = {
  sourceIds: string[];
  nodes: LayerTreeNode[];
};
type SliceVec3 = { x: number; y: number; z: number };
type VolumeDims = { x: number; y: number; z: number };
type CaptureSceneTransitionOption = {
  value: CaptureSceneTransitionEasing;
  label: string;
};
type CaptureTimelineHistorySnapshot = {
  scenes: PersistedCaptureScene[];
  activeSceneId: string | null;
  cursorMs: number;
  zoom: number;
};
type CaptureTimelinePlaybackMode = "once" | "loop";
type CaptureSliceCropRequest = {
  layerId: string;
  plane?: SlicePlane;
  points: [number, number, number][];
  cropRect?: {
    left: number;
    top: number;
    width: number;
    height: number;
  } | null;
};

const DEFAULT_CAPTURE_SCENE_TRANSITION_MS = 2200;
const DEFAULT_CAPTURE_TIMELINE_ZOOM = 1;
const CAPTURE_TIMELINE_MIN_ZOOM = 0.6;
const CAPTURE_TIMELINE_MAX_ZOOM = 3;
const CAPTURE_TIMELINE_BASE_PX_PER_SECOND = 110;
const CAPTURE_TIMELINE_VIEW_PADDING_MS = 2000;
const DEFAULT_CAPTURE_TIMELINE_RANGE_MS = 60_000;
const CAPTURE_SCENE_TRANSITION_OPTIONS: CaptureSceneTransitionOption[] = [
  { value: "ease-in-out", label: "Smooth" },
  { value: "linear", label: "Linear" },
  { value: "ease-in", label: "Ease in" },
  { value: "ease-out", label: "Ease out" },
];

function cloneViewerStateSnapshot(state: ViewerStateV1): ViewerStateV1 {
  if (typeof structuredClone === "function") {
    return structuredClone(state);
  }
  return JSON.parse(JSON.stringify(state)) as ViewerStateV1;
}

function clampCaptureTimelineZoom(value: number) {
  if (!Number.isFinite(value)) return DEFAULT_CAPTURE_TIMELINE_ZOOM;
  return Math.min(CAPTURE_TIMELINE_MAX_ZOOM, Math.max(CAPTURE_TIMELINE_MIN_ZOOM, value));
}

function cloneCaptureScene(scene: PersistedCaptureScene): PersistedCaptureScene {
  return {
    ...scene,
    selectedLayerIds: [...scene.selectedLayerIds],
    viewerState: scene.viewerState ? cloneViewerStateSnapshot(scene.viewerState) : null,
  };
}

function cloneCaptureScenes(scenes: PersistedCaptureScene[]) {
  return scenes.map(cloneCaptureScene);
}

function cloneCaptureSequence(sequence: PersistedCaptureSequence): PersistedCaptureSequence {
  return {
    ...sequence,
    scenes: cloneCaptureScenes(sequence.scenes),
  };
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result === "string") {
        resolve(result);
        return;
      }
      reject(new Error("The captured image could not be read back."));
    };
    reader.onerror = () => {
      reject(reader.error ?? new Error("The captured image could not be read back."));
    };
    reader.readAsDataURL(blob);
  });
}

function dataUrlToBlob(dataUrl: string): Blob | null {
  const match = /^data:([^;,]+)?(?:;base64)?,(.*)$/.exec(dataUrl);
  if (!match) return null;
  const mimeType = match[1] || "image/png";
  const payload = match[2] ?? "";
  try {
    const binary = atob(payload);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return new Blob([bytes], { type: mimeType });
  } catch {
    return null;
  }
}

function CaptureTimelineIcon({
  kind,
  size = 16,
}: {
  kind: "play" | "play-start" | "pause" | "stop" | "export";
  size?: number;
}) {
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };

  if (kind === "play") {
    return (
      <svg {...common}>
        <path d="M8 6.5v11l9-5.5-9-5.5z" fill="currentColor" stroke="none" />
      </svg>
    );
  }

  if (kind === "play-start") {
    return (
      <svg {...common}>
        <path d="M5.5 5.5v13" />
        <path d="M9 6.5v11l6.8-5.5L9 6.5z" fill="currentColor" stroke="none" />
        <path d="M15.4 6.5v11l4.1-5.5-4.1-5.5z" fill="currentColor" stroke="none" />
      </svg>
    );
  }

  if (kind === "pause") {
    return (
      <svg {...common}>
        <path d="M8.5 6.5v11" />
        <path d="M15.5 6.5v11" />
      </svg>
    );
  }

  if (kind === "stop") {
    return (
      <svg {...common}>
        <rect x="7.5" y="7.5" width="9" height="9" rx="1.6" fill="currentColor" stroke="none" />
      </svg>
    );
  }

  return (
    <svg {...common}>
      <path d="M12 4v10" />
      <path d="M8 8l4-4 4 4" />
      <path d="M5 15v3a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-3" />
    </svg>
  );
}

function easeCaptureSceneProgress(progress: number, easing: CaptureSceneTransitionEasing) {
  const clamped = Math.min(1, Math.max(0, progress));
  if (easing === "linear") return clamped;
  if (easing === "ease-in") return clamped * clamped;
  if (easing === "ease-out") return 1 - (1 - clamped) * (1 - clamped);
  return clamped < 0.5
    ? 4 * clamped * clamped * clamped
    : 1 - Math.pow(-2 * clamped + 2, 3) / 2;
}

function interpolateNumber(start: number | undefined, end: number | undefined, fallback: number, progress: number) {
  const startValue = typeof start === "number" && Number.isFinite(start) ? start : fallback;
  const endValue = typeof end === "number" && Number.isFinite(end) ? end : fallback;
  return startValue + (endValue - startValue) * progress;
}

function interpolateVector3(
  start: [number, number, number] | undefined,
  end: [number, number, number] | undefined,
  fallback: [number, number, number],
  progress: number
): [number, number, number] {
  return [
    interpolateNumber(start?.[0], end?.[0], fallback[0], progress),
    interpolateNumber(start?.[1], end?.[1], fallback[1], progress),
    interpolateNumber(start?.[2], end?.[2], fallback[2], progress),
  ];
}

function pickSteppedValue<T>(start: T, end: T, progress: number, threshold = 0.5) {
  return progress < threshold ? start : end;
}

function interpolateCameraState(
  start: SerializableCameraState,
  end: SerializableCameraState,
  progress: number
): SerializableCameraState {
  return {
    mode: pickSteppedValue(start.mode, end.mode, progress),
    position: interpolateVector3(start.position, end.position, DEFAULT_CAMERA_STATE.position, progress),
    yaw: interpolateNumber(start.yaw, end.yaw, DEFAULT_CAMERA_STATE.yaw, progress),
    pitch: interpolateNumber(start.pitch, end.pitch, DEFAULT_CAMERA_STATE.pitch, progress),
    fovDeg: interpolateNumber(start.fovDeg, end.fovDeg, DEFAULT_CAMERA_STATE.fovDeg, progress),
  };
}

function interpolateNodeTransform(start: NodeTransform | undefined, end: NodeTransform | undefined, progress: number): NodeTransform {
  return {
    translation: interpolateVector3(start?.translation, end?.translation, [0, 0, 0], progress),
    rotation: interpolateVector3(start?.rotation, end?.rotation, [0, 0, 0], progress),
    scale: interpolateVector3(start?.scale, end?.scale, [1, 1, 1], progress),
  };
}

function interpolateSliceDirection(
  start: SliceVec3 | undefined,
  end: SliceVec3 | undefined,
  fallback: SliceVec3,
  progress: number
): SliceVec3 {
  return {
    x: interpolateNumber(start?.x, end?.x, fallback.x, progress),
    y: interpolateNumber(start?.y, end?.y, fallback.y, progress),
    z: interpolateNumber(start?.z, end?.z, fallback.z, progress),
  };
}

function interpolateSliceParams(start: SliceLayerParams, end: SliceLayerParams, progress: number): SliceLayerParams {
  if (start.mode === "oblique" && end.mode === "oblique") {
    return {
      mode: "oblique",
      normal: interpolateSliceDirection(start.normal, end.normal, { x: 0, y: 0, z: 1 }, progress),
      uAxis: interpolateSliceDirection(start.uAxis, end.uAxis, { x: 1, y: 0, z: 0 }, progress),
      referencePlane: pickSteppedValue(start.referencePlane, end.referencePlane, progress),
      offset: interpolateNumber(start.offset, end.offset, 0, progress),
      width: interpolateNumber(start.width, end.width, 1, progress),
      height: interpolateNumber(start.height, end.height, 1, progress),
      opacity: interpolateNumber(start.opacity, end.opacity, 1, progress),
      flipX: pickSteppedValue(!!start.flipX, !!end.flipX, progress),
      flipY: pickSteppedValue(!!start.flipY, !!end.flipY, progress),
      flipZ: pickSteppedValue(!!start.flipZ, !!end.flipZ, progress),
      rotationDeg: interpolateNumber(start.rotationDeg, end.rotationDeg, 0, progress),
      scale: interpolateNumber(start.scale, end.scale, 1, progress),
    };
  }

  if (start.mode !== "oblique" && end.mode !== "oblique") {
    return {
      mode: "axis",
      plane: pickSteppedValue(start.plane, end.plane, progress),
      index: Math.round(interpolateNumber(start.index, end.index, 0, progress)),
      opacity: interpolateNumber(start.opacity, end.opacity, 1, progress),
    };
  }

  return pickSteppedValue(start, end, progress);
}

function interpolateAxisSliceViewState(
  start: LayerItemNode["axisSliceViewState"],
  end: LayerItemNode["axisSliceViewState"],
  progress: number
): LayerItemNode["axisSliceViewState"] {
  if (!start && !end) return undefined;
  const planes: SlicePlane[] = ["xy", "xz", "yz"];
  const result: LayerItemNode["axisSliceViewState"] = {};
  for (const plane of planes) {
    const startPlane = start?.[plane];
    const endPlane = end?.[plane];
    if (!startPlane && !endPlane) continue;
    result[plane] = {
      flipX: pickSteppedValue(!!startPlane?.flipX, !!endPlane?.flipX, progress),
      flipY: pickSteppedValue(!!startPlane?.flipY, !!endPlane?.flipY, progress),
      flipZ: pickSteppedValue(!!startPlane?.flipZ, !!endPlane?.flipZ, progress),
      rotationDeg: interpolateNumber(startPlane?.rotationDeg, endPlane?.rotationDeg, 0, progress),
      scale: interpolateNumber(startPlane?.scale, endPlane?.scale, 1, progress),
    };
  }
  return result;
}

function interpolateAxisSliceState(
  start: LayerItemNode["axisSliceState"],
  end: LayerItemNode["axisSliceState"],
  progress: number
): LayerItemNode["axisSliceState"] {
  if (!start && !end) return undefined;
  return {
    activePlane: pickSteppedValue(start?.activePlane, end?.activePlane, progress),
    xy: Math.round(interpolateNumber(start?.xy, end?.xy, 0, progress)),
    xz: Math.round(interpolateNumber(start?.xz, end?.xz, 0, progress)),
    yz: Math.round(interpolateNumber(start?.yz, end?.yz, 0, progress)),
  };
}

function interpolateLayerNode(start: LayerTreeNode, end: LayerTreeNode, progress: number): LayerTreeNode {
  if (start.id !== end.id || start.kind !== end.kind) {
    return cloneLayerTreeNodeSnapshot(pickSteppedValue(start, end, progress));
  }

  const baseNode = {
    ...pickSteppedValue(start, end, progress),
    id: start.id,
    name: pickSteppedValue(start.name, end.name, progress),
    visible: pickSteppedValue(start.visible, end.visible, progress),
    opacity: interpolateNumber(start.opacity, end.opacity, 1, progress),
    transform: interpolateNodeTransform(start.transform, end.transform, progress),
  };

  if (start.kind === "group" && end.kind === "group") {
    if (start.children.length !== end.children.length) {
      return cloneLayerTreeNodeSnapshot(pickSteppedValue(start, end, progress));
    }
    const sameShape = start.children.every((child, index) => {
      const match = end.children[index];
      return !!match && child.id === match.id && child.kind === match.kind;
    });
    if (!sameShape) {
      return cloneLayerTreeNodeSnapshot(pickSteppedValue(start, end, progress));
    }
    return {
      ...baseNode,
      kind: "group",
      expanded: pickSteppedValue(start.expanded, end.expanded, progress),
      children: start.children.map((child, index) => interpolateLayerNode(child, end.children[index], progress)),
    };
  }

  if (start.kind === "layer" && end.kind === "layer" && start.type === end.type) {
    return {
      ...baseNode,
      kind: "layer",
      type: start.type,
      source: pickSteppedValue(start.source, end.source, progress),
      sourceKind: pickSteppedValue(start.sourceKind, end.sourceKind, progress),
      mimeType: pickSteppedValue(start.mimeType, end.mimeType, progress),
      description: pickSteppedValue(start.description, end.description, progress),
      remoteFormat: pickSteppedValue(start.remoteFormat, end.remoteFormat, progress),
      renderMode: pickSteppedValue(start.renderMode, end.renderMode, progress),
      remoteResolution: pickSteppedValue(start.remoteResolution, end.remoteResolution, progress),
      remoteContentKind: pickSteppedValue(start.remoteContentKind, end.remoteContentKind, progress),
      sliceParams:
        start.sliceParams && end.sliceParams
          ? interpolateSliceParams(start.sliceParams, end.sliceParams, progress)
          : pickSteppedValue(start.sliceParams, end.sliceParams, progress),
      axisSliceState: interpolateAxisSliceState(start.axisSliceState, end.axisSliceState, progress),
      axisSliceViewState: interpolateAxisSliceViewState(start.axisSliceViewState, end.axisSliceViewState, progress),
      localOnly: pickSteppedValue(start.localOnly, end.localOnly, progress),
      localDataFormat: pickSteppedValue(start.localDataFormat, end.localDataFormat, progress),
      localDataKind: pickSteppedValue(start.localDataKind, end.localDataKind, progress),
      localDatasetInfo: pickSteppedValue(start.localDatasetInfo, end.localDatasetInfo, progress),
      annotation:
        start.annotation && end.annotation
          ? {
              ...pickSteppedValue(start.annotation, end.annotation, progress),
              color: pickSteppedValue(start.annotation.color, end.annotation.color, progress),
              opacity: interpolateNumber(start.annotation.opacity, end.annotation.opacity, 1, progress),
              size: interpolateNumber(start.annotation.size, end.annotation.size, 1, progress),
              brushDepth: interpolateNumber(start.annotation.brushDepth, end.annotation.brushDepth, 0, progress),
              metadata: pickSteppedValue(start.annotation.metadata, end.annotation.metadata, progress),
              points: pickSteppedValue(start.annotation.points, end.annotation.points, progress),
              normal: pickSteppedValue(start.annotation.normal, end.annotation.normal, progress),
              attachedLayerId: pickSteppedValue(start.annotation.attachedLayerId, end.annotation.attachedLayerId, progress),
              attachedLayerName: pickSteppedValue(start.annotation.attachedLayerName, end.annotation.attachedLayerName, progress),
              freehandStrokes: pickSteppedValue(start.annotation.freehandStrokes, end.annotation.freehandStrokes, progress),
            }
          : pickSteppedValue(start.annotation, end.annotation, progress),
    };
  }

  return cloneLayerTreeNodeSnapshot(pickSteppedValue(start, end, progress));
}

function interpolateLayerTree(start: LayerTreeNode[], end: LayerTreeNode[], progress: number): LayerTreeNode[] {
  if (start.length !== end.length) {
    return cloneLayerTreeNodeSnapshotArray(pickSteppedValue(start, end, progress));
  }
  const sameShape = start.every((node, index) => {
    const match = end[index];
    return !!match && node.id === match.id && node.kind === match.kind;
  });
  if (!sameShape) {
    return cloneLayerTreeNodeSnapshotArray(pickSteppedValue(start, end, progress));
  }
  return start.map((node, index) => interpolateLayerNode(node, end[index], progress));
}

function cloneLayerTreeNodeSnapshotArray(nodes: LayerTreeNode[]): LayerTreeNode[] {
  return nodes.map((node) => cloneLayerTreeNodeSnapshot(node));
}

function interpolateViewerState(start: ViewerStateV1, end: ViewerStateV1, progress: number): ViewerStateV1 {
  return {
    version: 1,
    layout: {
      ...pickSteppedValue(start.layout, end.layout, progress),
      windows: pickSteppedValue(start.layout.windows ?? [], end.layout.windows ?? [], progress),
    },
    camera: interpolateCameraState(start.camera, end.camera, progress),
    scene: {
      activeTool: pickSteppedValue(start.scene.activeTool, end.scene.activeTool, progress),
      selectedNodeId: pickSteppedValue(start.scene.selectedNodeId, end.scene.selectedNodeId, progress),
      layerTree: interpolateLayerTree(start.scene.layerTree, end.scene.layerTree, progress),
    },
    ui: {
      sliceVolumeLayerId: pickSteppedValue(start.ui.sliceVolumeLayerId, end.ui.sliceVolumeLayerId, progress),
      sliceName: pickSteppedValue(start.ui.sliceName, end.ui.sliceName, progress),
      sliceParamsDraft: interpolateSliceParams(start.ui.sliceParamsDraft, end.ui.sliceParamsDraft, progress),
    },
    automation: pickSteppedValue(start.automation, end.automation, progress),
  };
}


function isCanonicalSliceBrowsableLayer(
  node: LayerTreeNode | null | undefined
): node is LayerItemNode {
  return (
    !!node &&
    node.kind === "layer" &&
    (node.type === "remote" || node.type === "file") &&
    node.renderMode === "slices"
  );
}

function cloneLayerTreeNodeSnapshot(node: LayerTreeNode): LayerTreeNode {
  if (typeof structuredClone === "function") {
    return structuredClone(node);
  }
  return JSON.parse(JSON.stringify(node)) as LayerTreeNode;
}

function buildDuplicateLayerName(baseName: string, usedNames: Set<string>): string {
  const trimmed = baseName.trim() || "Untitled";
  const copyBase = `${trimmed} copy`;
  if (!usedNames.has(copyBase)) {
    usedNames.add(copyBase);
    return copyBase;
  }

  let suffix = 2;
  while (usedNames.has(`${copyBase} ${suffix}`)) {
    suffix += 1;
  }
  const nextName = `${copyBase} ${suffix}`;
  usedNames.add(nextName);
  return nextName;
}

function cloneLayerTreeNodeWithFreshIds(
  node: LayerTreeNode,
  rootNameOverride?: string
): LayerTreeNode {
  const snapshot = cloneLayerTreeNodeSnapshot(node);

  function assignFreshIds(current: LayerTreeNode, nameOverride?: string): LayerTreeNode {
    if (current.kind === "group") {
      return {
        ...current,
        id: createId(),
        name: nameOverride ?? current.name,
        children: current.children.map((child) => assignFreshIds(child)),
      };
    }

    return {
      ...current,
      id: createId(),
      name: nameOverride ?? current.name,
    };
  }

  return assignFreshIds(snapshot, rootNameOverride);
}

function collectTopLevelSelectedNodes(
  nodes: LayerTreeNode[],
  selectedIds: string[]
): LayerTreeNode[] {
  const selectedIdSet = new Set(
    selectedIds.filter((id) => typeof id === "string" && id.length > 0)
  );
  const result: LayerTreeNode[] = [];

  function walk(current: LayerTreeNode[], ancestorSelected: boolean) {
    for (const node of current) {
      const isSelected = selectedIdSet.has(node.id);
      if (isSelected && !ancestorSelected) {
        result.push(node);
        continue;
      }

      if (node.kind === "group") {
        walk(node.children, ancestorSelected || isSelected);
      }
    }
  }

  walk(nodes, false);
  return result;
}

function duplicateLayerNodesByIds(
  nodes: LayerTreeNode[],
  selectedIds: string[]
): { tree: LayerTreeNode[]; duplicatedRootIds: string[] } {
  const topLevelSelection = collectTopLevelSelectedNodes(nodes, selectedIds);
  if (!topLevelSelection.length) {
    return { tree: nodes, duplicatedRootIds: [] };
  }

  const selectedIdSet = new Set(topLevelSelection.map((node) => node.id));
  const duplicatedRootIds: string[] = [];

  function walk(current: LayerTreeNode[]): LayerTreeNode[] {
    const out: LayerTreeNode[] = [];
    const usedNames = new Set(current.map((node) => node.name));

    for (const node of current) {
      if (selectedIdSet.has(node.id)) {
        out.push(node);
        const duplicateName = buildDuplicateLayerName(node.name, usedNames);
        const duplicateNode = cloneLayerTreeNodeWithFreshIds(node, duplicateName);
        duplicatedRootIds.push(duplicateNode.id);
        out.push(duplicateNode);
        continue;
      }

      if (node.kind === "group") {
        out.push({
          ...node,
          children: walk(node.children),
        });
        continue;
      }

      out.push(node);
    }

    return out;
  }

  return {
    tree: walk(nodes),
    duplicatedRootIds,
  };
}

function appendClipboardNodesToRoot(
  nodes: LayerTreeNode[],
  clipboardNodes: LayerTreeNode[]
): { tree: LayerTreeNode[]; duplicatedRootIds: string[] } {
  if (!clipboardNodes.length) {
    return { tree: nodes, duplicatedRootIds: [] };
  }

  const usedNames = new Set(nodes.map((node) => node.name));
  const duplicates = clipboardNodes.map((node) =>
    cloneLayerTreeNodeWithFreshIds(node, buildDuplicateLayerName(node.name, usedNames))
  );

  return {
    tree: [...nodes, ...duplicates],
    duplicatedRootIds: duplicates.map((node) => node.id),
  };
}

function hasVolumeLayerId(source: unknown): source is { volumeLayerId: string } {
  return !!source && typeof source === "object" && "volumeLayerId" in source;
}

function isObliqueSliceParams(
  params: SliceLayerParams | undefined | null
): params is Extract<SliceLayerParams, { mode: "oblique" }> {
  return (
    !!params &&
    params.mode === "oblique" &&
    typeof params.normal?.x === "number" &&
    typeof params.normal?.y === "number" &&
    typeof params.normal?.z === "number"
  );
}

function normalizeSliceVec3(vector: SliceVec3): SliceVec3 {
  const length = Math.hypot(vector.x, vector.y, vector.z) || 1;
  return {
    x: vector.x / length,
    y: vector.y / length,
    z: vector.z / length,
  };
}

function crossSliceVec3(a: SliceVec3, b: SliceVec3): SliceVec3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

function projectSliceVec3OntoPlane(vector: SliceVec3, normal: SliceVec3): SliceVec3 {
  const dot = dotSliceVec3(vector, normal);
  return {
    x: vector.x - normal.x * dot,
    y: vector.y - normal.y * dot,
    z: vector.z - normal.z * dot,
  };
}

function dotSliceVec3(a: SliceVec3, b: SliceVec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function rotateSliceVec3AroundAxis(
  vector: SliceVec3,
  axis: SliceVec3,
  deltaDeg: number
): SliceVec3 {
  const unitVector = normalizeSliceVec3(vector);
  const unitAxis = normalizeSliceVec3(axis);
  const theta = (deltaDeg * Math.PI) / 180;
  const cosTheta = Math.cos(theta);
  const sinTheta = Math.sin(theta);
  const cross = crossSliceVec3(unitAxis, unitVector);
  const dot = dotSliceVec3(unitAxis, unitVector);
  return normalizeSliceVec3({
    x:
      unitVector.x * cosTheta +
      cross.x * sinTheta +
      unitAxis.x * dot * (1 - cosTheta),
    y:
      unitVector.y * cosTheta +
      cross.y * sinTheta +
      unitAxis.y * dot * (1 - cosTheta),
    z:
      unitVector.z * cosTheta +
      cross.z * sinTheta +
      unitAxis.z * dot * (1 - cosTheta),
  });
}

function getCanonicalPlaneNormal(plane: SlicePlane): SliceVec3 {
  if (plane === "xy") return { x: 0, y: 0, z: 1 };
  if (plane === "xz") return { x: 0, y: 1, z: 0 };
  return { x: 1, y: 0, z: 0 };
}

function getPlaneCenterCoordinate(dims: VolumeDims, plane: SlicePlane): number {
  if (plane === "xy") return (dims.z - 1) * 0.5;
  if (plane === "xz") return (dims.y - 1) * 0.5;
  return (dims.x - 1) * 0.5;
}

function getAxisSliceSizeForPlane(
  dims: VolumeDims,
  plane: SlicePlane
): { width: number; height: number } {
  if (plane === "xy") return { width: dims.x, height: dims.y };
  if (plane === "xz") return { width: dims.x, height: dims.z };
  return { width: dims.z, height: dims.y };
}

function getSliceOrientationProfileForLayer(layer: LayerItemNode) {
  return getViewerOrientationProfileForPreset(
    getEffectiveVolumeOrientationPresetForLayer(layer)
  );
}

function applyOrientationPreferenceToLayer(
  layer: LayerItemNode
): LayerItemNode {
  if (!isVolumeOrientationAdjustableLayer(layer)) return layer;
  const sourceKey = getVolumeOrientationSourceKey(layer);
  const persisted = sourceKey
    ? loadSourceOrientationPreference(sourceKey)
    : null;
  const preset =
    persisted?.preset ?? getDefaultVolumeOrientationPresetForLayer(layer);
  return {
    ...layer,
    orientationPreset: preset,
    axisSliceViewState:
      cloneAxisSliceViewState(
        persisted?.axisSliceViewState ??
          getAxisSliceViewStateForOrientationPreset(preset)
      ) ?? undefined,
  };
}

function getMaxFloatingWindowZ(windows: Array<{ zIndex: number }>) {
  return windows.reduce(
    (maxZ, windowState) =>
      Number.isFinite(windowState.zIndex) ? Math.max(maxZ, windowState.zIndex) : maxZ,
    1
  );
}

function updateDerivedCustomSlicesForVolume(
  nodes: LayerTreeNode[],
  volumeLayerId: string,
  updater: (node: LayerItemNode) => LayerItemNode
): LayerTreeNode[] {
  return nodes.map((node) => {
    if (node.kind === "group") {
      return {
        ...node,
        children: updateDerivedCustomSlicesForVolume(
          node.children,
          volumeLayerId,
          updater
        ),
      };
    }
    if (
      node.type === "custom-slice" &&
      hasVolumeLayerId(node.source) &&
      node.source.volumeLayerId === volumeLayerId
    ) {
      return updater(node);
    }
    return node;
  });
}

function cloneNodeTransformValue(
  transform: NodeTransform | undefined
): NodeTransform {
  return {
    translation: transform?.translation ? [...transform.translation] : [0, 0, 0],
    rotation: transform?.rotation ? [...transform.rotation] : [0, 0, 0],
    scale: transform?.scale ? [...transform.scale] : [1, 1, 1],
  };
}

function applyPlanarViewTransformToBasis(
  basis: { u: SliceVec3; v: SliceVec3; n: SliceVec3 },
  viewTransform?: {
    flipX?: boolean;
    flipY?: boolean;
    rotationDeg?: number;
  }
): { u: SliceVec3; v: SliceVec3; n: SliceVec3 } {
  let u = normalizeSliceVec3(basis.u);
  let v = normalizeSliceVec3(basis.v);
  const n = normalizeSliceVec3(basis.n);

  if (viewTransform?.flipX) {
    u = { x: -u.x, y: -u.y, z: -u.z };
  }
  if (viewTransform?.flipY) {
    v = { x: -v.x, y: -v.y, z: -v.z };
  }

  const rotationDeg = Number.isFinite(viewTransform?.rotationDeg)
    ? Number(viewTransform?.rotationDeg)
    : 0;
  if (Math.abs(rotationDeg) > 1e-6) {
    u = rotateSliceVec3AroundAxis(u, n, rotationDeg);
    v = rotateSliceVec3AroundAxis(v, n, rotationDeg);
  }

  return { u, v, n };
}

function getPlaneReverseIndex(
  plane: SlicePlane,
  profile: ViewerOrientationProfile
): boolean {
  if (plane === "xy") return !!profile.xy?.reverseIndex;
  if (plane === "xz") return !!profile.xz?.reverseIndex;
  return !!profile.yz?.reverseIndex;
}

function buildObliqueSliceFromCanonicalPlane(
  layer: LayerItemNode,
  dims: VolumeDims,
  plane: SlicePlane,
  displayIndex: number,
  viewTransform?: {
    flipX?: boolean;
    flipY?: boolean;
    flipZ?: boolean;
    rotationDeg?: number;
    scale?: number;
  }
): Extract<SliceLayerParams, { mode: "oblique" }> {
  const profile = getSliceOrientationProfileForLayer(layer);
  const maxIndex =
    plane === "xy" ? Math.max(0, dims.z - 1) : plane === "xz" ? Math.max(0, dims.y - 1) : Math.max(0, dims.x - 1);
  const safeDisplayIndex = Math.max(0, Math.min(maxIndex, Math.round(displayIndex)));
  const sourceIndex = viewTransform?.flipZ
    ? maxIndex - safeDisplayIndex
    : safeDisplayIndex;
  const dataIndex = getPlaneReverseIndex(plane, profile)
    ? maxIndex - sourceIndex
    : sourceIndex;
  const { width, height } = getAxisSliceSizeForPlane(dims, plane);
  const canonicalBasis = getProfileAdjustedPlaneBasis(
    getCanonicalPlaneNormal(plane),
    profile,
    undefined,
    plane
  );
  const basis = applyPlanarViewTransformToBasis(canonicalBasis, viewTransform);

  return {
    mode: "oblique",
    normal: basis.n,
    uAxis: basis.u,
    referencePlane: plane,
    offset: dataIndex - getPlaneCenterCoordinate(dims, plane),
    width,
    height,
    opacity: 1,
    flipX: true,
    flipY: false,
    flipZ: true,
    rotationDeg: 0,
    scale: Number.isFinite(viewTransform?.scale) ? Number(viewTransform?.scale) : 1,
  };
}

function getObliqueSliceBasis(
  params: Extract<SliceLayerParams, { mode: "oblique" }>
): { u: SliceVec3; v: SliceVec3; n: SliceVec3 } {
  const n = normalizeSliceVec3(params.normal);
  const projectedU = params.uAxis
    ? projectSliceVec3OntoPlane(params.uAxis, n)
    : null;
  const projectedULength = projectedU
    ? Math.hypot(projectedU.x, projectedU.y, projectedU.z)
    : 0;
  const fallbackBasis = makePlaneBasis(n);
  const u =
    projectedU && projectedULength > 1e-6
      ? normalizeSliceVec3(projectedU)
      : normalizeSliceVec3(fallbackBasis.u);
  const rawV = crossSliceVec3(n, u);
  const rawVLength = Math.hypot(rawV.x, rawV.y, rawV.z);
  const v =
    rawVLength > 1e-6
      ? normalizeSliceVec3(rawV)
      : normalizeSliceVec3(fallbackBasis.v);
  return { u, v, n };
}


const DEFAULT_ANNOTATION_SHAPE_SIZES: AnnotationShapeSizeMap = {
  point: 0.06,
  line: 0.06,
  rectangle: 0.06,
  circle: 0.06,
  note: 0.06,
  freehand: 0.06,
  eraser: 0.06,
};

type AnnotationDraftSettings = {
  shape: AnnotationShape;
  color: string;
  opacity: number;
  size: number;
  sizeByShape: AnnotationShapeSizeMap;
  depth: number;
  eraseMode: "all" | "color";
};

const DEFAULT_ANNOTATION_DRAFT: AnnotationDraftSettings = {
  shape: "point",
  color: "#ff5c5c",
  opacity: 0.9,
  size: DEFAULT_ANNOTATION_SHAPE_SIZES.point,
  sizeByShape: { ...DEFAULT_ANNOTATION_SHAPE_SIZES },
  depth: 0.015,
  eraseMode: "color",
};

const INITIAL_TREE: LayerTreeNode[] = [];

function detectRemoteFormat(url: string): RemoteDataFormat {
  const lower = url.toLowerCase();

  if (lower.includes(".ome.zarr")) return "ome-zarr";
  if (lower.endsWith(".obj")) return "mesh-obj";

  return "generic";
}

function decodeBase64Url(input: string): string {
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
  const padding = normalized.length % 4 === 0 ? "" : "=".repeat(4 - (normalized.length % 4));
  return atob(normalized + padding);
}

function readInitialStateFromLocation(): ViewerStateV1 | null {
  if (typeof window === "undefined") return null;

  try {
    const sharedState = readViewerStateFromHash();
    if (sharedState) {
      return sharedState;
    }
  } catch (error) {
    console.warn("Failed to parse shared viewer state from hash.", error);
  }

  const params = new URLSearchParams(window.location.search);
  const rawState = params.get("viewerState");
  if (rawState) {
    try {
      return parseViewerState(rawState);
    } catch (error) {
      console.warn("Failed to parse viewerState query parameter.", error);
    }
  }

  const rawState64 = params.get("viewerState64");
  if (rawState64) {
    try {
      return parseViewerState(decodeBase64Url(rawState64));
    } catch (error) {
      console.warn("Failed to parse viewerState64 query parameter.", error);
    }
  }

  return null;
}


function getCurrentSharedViewerUrl(): string | null {
  if (typeof window === "undefined") return null;
  const rawHash = window.location.hash.startsWith("#")
    ? window.location.hash.slice(1)
    : window.location.hash;
  if (!rawHash) return null;
  const params = new URLSearchParams(rawHash);
  return params.get("vs") ? window.location.href : null;
}

function resolveOwnedSavedViewerId(entryId: string | null, entries: SavedViewerEntry[]): string | null {
  if (!entryId) return null;
  const entry = entries.find((item) => item.id === entryId);
  return entry?.ownerKind === "owned" ? entry.id : null;
}

function buildUniqueSavedViewerName(
  requestedName: string,
  entries: SavedViewerEntry[],
  excludedEntryId?: string
) {
  const trimmed = requestedName.trim();
  if (!trimmed) return trimmed;

  const usedNames = new Set(
    entries
      .filter((entry) => entry.id !== excludedEntryId)
      .map((entry) => entry.name.trim())
  );

  if (!usedNames.has(trimmed)) return trimmed;

  let suffix = 1;
  let candidate = `${trimmed} (${suffix})`;
  while (usedNames.has(candidate)) {
    suffix += 1;
    candidate = `${trimmed} (${suffix})`;
  }
  return candidate;
}

function buildLibrarySavePlaceholder(entries: SavedViewerEntry[]) {
  const nextIndex = entries.filter((entry) => entry.ownerKind === "owned").length + 1;
  return `Viewer ${nextIndex}`;
}


const APP_VERSION = __APP_VERSION__ || "0.0.0-dev";
const APP_COMMIT_SHA = __APP_COMMIT_SHA__ || "dev";
const APP_REPO_URL = __APP_REPO_URL__ || "";
const APP_COMMIT_SHORT = APP_COMMIT_SHA === "dev" ? "dev" : APP_COMMIT_SHA.slice(0, 7);
const APP_COMMIT_URL =
  !APP_REPO_URL
    ? null
    : APP_COMMIT_SHA === "dev"
      ? APP_REPO_URL
      : `${APP_REPO_URL}/commit/${APP_COMMIT_SHA}`;
const DEFAULT_RESOURCE_SECTION_HEIGHT = 340;

const GENERIC_UNEXPECTED_ERROR_MESSAGE =
  "Unexpected error. Please try again or reload the viewer.";

function shouldSuppressRuntimeToast(rawMessage: string | null | undefined): boolean {
  const lower = (rawMessage ?? "").trim().toLowerCase();
  if (!lower) return false;

  return (
    lower.includes("maximum update depth exceeded") ||
    lower.includes("too many re-renders")
  );
}


function normalizeUnknownErrorMessage(value: unknown): string | null {
  if (!value) return null;
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed || null;
  }
  if (value instanceof Error) {
    const trimmed = value.message?.trim();
    return trimmed || value.name || null;
  }
  if (typeof value === "object" && value !== null) {
    const maybeMessage = (value as { message?: unknown }).message;
    if (typeof maybeMessage === "string" && maybeMessage.trim()) {
      return maybeMessage.trim();
    }
    const maybeReason = (value as { reason?: unknown }).reason;
    if (typeof maybeReason === "string" && maybeReason.trim()) {
      return maybeReason.trim();
    }
  }
  return null;
}

function mapRuntimeErrorMessage(rawMessage: string | null | undefined): { title: string; message: string } {
  const message = (rawMessage ?? "").trim();
  const lower = message.toLowerCase();

  if (!message) {
    return { title: "Unexpected error", message: GENERIC_UNEXPECTED_ERROR_MESSAGE };
  }

  if (lower.includes("unsupported") && (lower.includes("file") || lower.includes("format"))) {
    return {
      title: "Unsupported file",
      message: "This file could not be loaded because its format is not supported by the viewer.",
    };
  }

  if (lower.includes("decompress gzip") || lower.includes("gzip")) {
    return {
      title: "File could not be loaded",
      message: "The selected compressed file could not be opened. The file may be corrupted or use an unsupported compression layout.",
    };
  }

  if (lower.includes("webgl") && (lower.includes("lost") || lower.includes("context") || lower.includes("unsupported"))) {
    return {
      title: "WebGL error",
      message: "The 3D viewer could not continue because WebGL is unavailable or the graphics context was lost.",
    };
  }

  if ((lower.includes("mesh") || lower.includes("obj")) && (lower.includes("load") || lower.includes("parse") || lower.includes("failed"))) {
    return {
      title: "Mesh could not be loaded",
      message: "The 3D mesh could not be loaded. Please verify that the source file is valid and supported.",
    };
  }

  if ((lower.includes("ome-zarr") || lower.includes("zarr") || lower.includes("volume") || lower.includes("brain")) && (lower.includes("load") || lower.includes("fetch") || lower.includes("failed") || lower.includes("error"))) {
    return {
      title: "Brain data could not be loaded",
      message: "The viewer could not load the brain data source. Please verify the file or remote URL and try again.",
    };
  }

  return { title: "Unexpected error", message: GENERIC_UNEXPECTED_ERROR_MESSAGE };
}

function dataTransferHasFiles(dataTransfer: DataTransfer | null): boolean {
  if (!dataTransfer) return false;
  return Array.from(dataTransfer.types ?? []).includes("Files");
}

async function collectDroppedLocalEntries(
  items: DataTransferItemList | null,
  files: FileList | null
): Promise<LocalInputEntry[]> {
  const output: LocalInputEntry[] = [];

  async function walkEntry(entry: any, prefix: string) {
    if (!entry) return;
    if (entry.isFile) {
      const file: File = await new Promise((resolve, reject) => entry.file(resolve, reject));
      output.push({ path: prefix ? `${prefix}/${file.name}` : file.name, file });
      return;
    }
    if (entry.isDirectory) {
      const reader = entry.createReader();
      const readBatch = (): Promise<any[]> => new Promise((resolve, reject) => reader.readEntries(resolve, reject));
      while (true) {
        const batch = await readBatch();
        if (!batch.length) break;
        for (const child of batch) {
          await walkEntry(child, prefix ? `${prefix}/${entry.name}` : entry.name);
        }
      }
    }
  }

  let usedDirectoryApi = false;
  if (items) {
    for (const item of Array.from(items)) {
      const entry = (item as any).webkitGetAsEntry?.();
      if (entry) {
        usedDirectoryApi = true;
        await walkEntry(entry, "");
      } else {
        const file = item.getAsFile?.();
        if (file) {
          output.push({ path: file.webkitRelativePath || file.name, file });
        }
      }
    }
  }

  if (!usedDirectoryApi && files) {
    for (const file of Array.from(files)) {
      output.push({ path: file.webkitRelativePath || file.name, file });
    }
  }

  return output;
}




export default function App({ startupSlices = [] }: AppProps) {
  const [activeTool, setActiveTool] = useState<ToolId>("mouse");
  const [resourceSectionHeight, setResourceSectionHeight] = useState(DEFAULT_RESOURCE_SECTION_HEIGHT);
  const [isResourceManagerOpen, setIsResourceManagerOpen] = useState(false);
  const [isImportPanelOpen, setIsImportPanelOpen] = useState(false);
  const [importPanelView, setImportPanelView] = useState<"library" | "import-external" | "import-local">("library");
  const [isLocalDatasetManagerOpen, setIsLocalDatasetManagerOpen] = useState(false);
  const [requestedLocalDatasetManagerSourceId, setRequestedLocalDatasetManagerSourceId] = useState<string | null>(null);
  const [isUserProfilePanelOpen, setIsUserProfilePanelOpen] = useState(false);
  const [isStateDialogOpen, setIsStateDialogOpen] = useState(false);
  const [isShareDialogOpen, setIsShareDialogOpen] = useState(false);
  const [isAboutDialogOpen, setIsAboutDialogOpen] = useState(false);
  const [isAppMenuOpen, setIsAppMenuOpen] = useState(false);
  const [appAssistantQuickPrompt, setAppAssistantQuickPrompt] = useState<{ id: string; prompt: string } | null>(null);
  const [layerTree, setLayerTree] = useState<LayerTreeNode[]>(INITIAL_TREE);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(
    getFirstLayerId(INITIAL_TREE)
  );
  const [selectedNodeIdsExternal, setSelectedNodeIdsExternal] = useState<string[] | null>(null);
  const layerClipboardRef = useRef<LayerClipboardPayload | null>(null);
  const [isLayerPanelCollapsed, setIsLayerPanelCollapsed] = useState(false);
  const [cameraState, setCameraState] = useState<SerializableCameraState>(
    DEFAULT_CAMERA_STATE
  );
  const [cameraSyncKey, setCameraSyncKey] = useState(0);
  const pendingCameraStateRef = useRef<SerializableCameraState | null>(null);
  const cameraCommitTimeoutRef = useRef<number | null>(null);
  const [focusSelectedLayerRequestKey, setFocusSelectedLayerRequestKey] = useState(0);
  const [stateModalMode, setStateModalMode] = useState<"export" | "import">("export");
  const [stateTextDraft, setStateTextDraft] = useState("");
  const [stateError, setStateError] = useState<string | null>(null);
  const [stateShareMessage, setStateShareMessage] = useState<string | null>(null);
  const [shareUrlDraft, setShareUrlDraft] = useState("");
  const [viewerLibrary, setViewerLibrary] = useState<SavedViewerEntry[]>(() =>
    loadPersistedViewerLibrary()
  );
  const [activeSavedViewerId, setActiveSavedViewerId] = useState<string | null>(null);
  const [viewerLibraryMode, setViewerLibraryMode] = useState<"browse" | "save">("browse");
  const [, setLibraryMessage] = useState<string | null>(null);
  const [libraryError, setLibraryError] = useState<string | null>(null);
  const [saveToasts, setSaveToasts] = useState<SaveToast[]>([]);
  const [exportTaskNotice, setExportTaskNotice] = useState<TaskNotice | null>(null);
  const [dismissedExportTaskNoticeKey, setDismissedExportTaskNoticeKey] = useState<string | null>(null);
  const [isExportTaskNoticeHovered, setIsExportTaskNoticeHovered] = useState(false);
  const runtimeErrorFingerprintRef = useRef<Map<string, number>>(new Map());
  const exportTaskNoticeTimeoutRef = useRef<number | null>(null);
  const [historyRevision, setHistoryRevision] = useState(0);
  const [cacheClearRequestKey, setCacheClearRequestKey] = useState(0);
  const [assistantClearRequestKey, setAssistantClearRequestKey] = useState(0);
  const [isClearHistoryConfirmOpen, setIsClearHistoryConfirmOpen] = useState(false);
  const [appPreferences, setAppPreferences] = useState<AppPreferences>(() =>
    loadAppPreferences()
  );
  const [toolbarLayout, setToolbarLayout] = useState<ToolbarLayout>(() =>
    loadToolbarLayout()
  );
  const [isToolbarEditMode, setIsToolbarEditMode] = useState(false);
  const [profileDataRevision, setProfileDataRevision] = useState(0);
  const [hasPersistedViewerState, setHasPersistedViewerState] = useState(false);
  const [shortcutBindings, setShortcutBindings] = useState<ShortcutBindingMap>(() => loadShortcutBindings());

  const [annotationDraft, setAnnotationDraft] = useState<AnnotationDraftSettings>(DEFAULT_ANNOTATION_DRAFT);
  const [annotationRecentColors, setAnnotationRecentColors] = useState<string[]>(() => loadRecentAnnotationColors());
  const [isInspectorCollapsed, setIsInspectorCollapsed] = useState(false);
  const [showRasReference, setShowRasReference] = useState(false);
  const [sourceOrientationRevision, setSourceOrientationRevision] = useState(0);
  const [selectedLayerRuntimeInfo, setSelectedLayerRuntimeInfo] = useState<SelectedLayerRuntimeInfo | null>(null);
  const [captureRequestKey, setCaptureRequestKey] = useState(0);
  const [isCapturePending, setIsCapturePending] = useState(false);
  const [captureRequestLayerIds, setCaptureRequestLayerIds] = useState<string[]>([]);
  const [captureRequestSliceCrop, setCaptureRequestSliceCrop] = useState<CaptureSliceCropRequest | null>(null);
  const [captureStills, setCaptureStills] = useState<PersistedCaptureScene[]>([]);
  const [activeCaptureStillId, setActiveCaptureStillId] = useState<string | null>(null);
  const [captureScenes, setCaptureScenes] = useState<PersistedCaptureScene[]>([]);
  const [activeCaptureSceneId, setActiveCaptureSceneId] = useState<string | null>(null);
  const [captureSequences, setCaptureSequences] = useState<PersistedCaptureSequence[]>([]);
  const [activeCaptureSequenceId, setActiveCaptureSequenceId] = useState<string | null>(null);
  const [isCapturePanelOpen, setIsCapturePanelOpen] = useState(false);
  const [captureTimelineCursorMs, setCaptureTimelineCursorMs] = useState(0);
  const [captureTimelineZoom, setCaptureTimelineZoom] = useState(DEFAULT_CAPTURE_TIMELINE_ZOOM);
  const [captureTimelineRangeMs, setCaptureTimelineRangeMs] = useState(DEFAULT_CAPTURE_TIMELINE_RANGE_MS);
  const [captureTimelineHoverMs, setCaptureTimelineHoverMs] = useState<number | null>(null);
  const [isCaptureTimelinePlaying, setIsCaptureTimelinePlaying] = useState(false);
  const [isCaptureTimelinePaused, setIsCaptureTimelinePaused] = useState(false);
  const [floatingWindows, setFloatingWindows] = useState<FloatingWindowState[]>([]);
  const nextFloatingWindowZRef = useRef(1);
  const captureTimelineFrameRef = useRef<number | null>(null);
  const captureTimelineTokenRef = useRef(0);
  const visibleToolbarToolIds = useMemo<ToolbarToolId[]>(
    () => getVisibleToolbarToolIds(toolbarLayout),
    [toolbarLayout]
  );
  const hiddenToolbarToolIds = useMemo<ToolbarToolId[]>(
    () => getHiddenToolbarToolIds(toolbarLayout),
    [toolbarLayout]
  );

  const extensionContext = useMemo<ToolExtensionContext>(
    () => ({
      viewer: {
        activeTool,
        selectedNodeId,
      },
      toolbar: {
        visibleToolIds: visibleToolbarToolIds,
        hiddenToolIds: hiddenToolbarToolIds,
        editMode: isToolbarEditMode,
      },
      commands: {
        activateToolbarTool: (toolId) => applyToolbarToolChange(toolId),
        setAnnotationShape: (shape) => setAnnotationDraftShape(shape as AnnotationShape),
        setAnnotationColor: (color) => handleAnnotationDraftColorChange(color),
        commitAnnotationColor: (color) => handleAnnotationDraftColorCommit(color),
        setAnnotationOpacity: (opacity) => handleAnnotationDraftOpacityChange(opacity),
        setAnnotationSize: (size) => handleAnnotationDraftSizeChange(size),
        setAnnotationDepth: (depth) => handleAnnotationDraftDepthChange(depth),
        setAnnotationEraseMode: (mode) => {
          setAnnotationDraft((prev) => ({ ...prev, eraseMode: mode }));
          setActiveTool("pencil");
        },
        pickAnnotationColorFromScreen: () => handlePickAnnotationColorFromScreen(),
        openCaptureEditor: () => handleCreateCaptureSequence({ openPanel: true }),
        exportCaptureFrame: () => handleRequestCaptureImage(),
        toggleCapturePlayback: () => handleToggleCaptureTimelinePlayback(),
        stopCapturePlayback: () => stopCaptureTimelinePlayback(),
        loadCaptureStill: (stillId) => handleApplyCaptureStill(stillId),
        downloadCaptureStill: (stillId) => handleDownloadCaptureStill(stillId),
        deleteCaptureStill: (stillId) => handleDeleteCaptureStill(stillId),
        loadCaptureSequence: (sequenceId) =>
          handleLoadCaptureSequence(sequenceId, { openPanel: true }),
        playCaptureSequence: (sequenceId, mode) =>
          handlePlayCaptureSequenceFromLibrary(sequenceId, mode),
        renameCaptureSequence: (sequenceId, nextName) =>
          handleRenameCaptureSequence(sequenceId, nextName),
        deleteCaptureSequence: (sequenceId) =>
          handleDeleteCaptureSequence(sequenceId),
        openAutomationPipelineWorkspace: (pipelineId) => {
          if (pipelineId) {
            setActiveAutomationPipelineId(pipelineId);
          }
          applyToolbarToolChange("pipeline");
        },
        setAutomationPipelineEnabled: (pipelineId, enabled) => {
          setAutomationPipelines((prev) =>
            prev.map((pipeline) =>
              pipeline.id === pipelineId
                ? { ...pipeline, active: enabled, autoRun: enabled, updatedAt: Date.now() }
                : pipeline
            )
          );
        },
        toggleAssistantWorkspace: () => {
          applyToolbarToolChange("assistant");
        },
        submitAssistantQuickPrompt: (prompt) => {
          setActiveTool((current) => current === "assistant" ? "mouse" : current);
          setAppAssistantQuickPrompt({ id: `quick-${Date.now()}`, prompt });
        },
        toggleResourceManagerWorkspace: () => {
          applyToolbarToolChange("resources");
        },
        showToolbarTool: (toolId) => handleToolbarShow(toolId),
        hideToolbarTool: (toolId) => handleToolbarHide(toolId),
        setToolbarEditMode: (editing) => setIsToolbarEditMode(editing),
      },
    }),
    [activeTool, selectedNodeId, visibleToolbarToolIds, hiddenToolbarToolIds, isToolbarEditMode]
  );

  useEffect(() => {
    saveToolbarLayout(toolbarLayout);
  }, [toolbarLayout]);

  function handleToolbarMove(draggedToolId: ToolbarToolId, targetToolId: ToolbarToolId) {
    setToolbarLayout((current) => moveToolbarTool(current, draggedToolId, targetToolId));
  }

  function handleToolbarHide(toolId: ToolbarToolId) {
    setToolbarLayout((current) => hideToolbarTool(current, toolId));
    setActiveTool((current) => (current === toolId ? "mouse" : current));
  }

  function handleToolbarShow(toolId: ToolbarToolId) {
    setToolbarLayout((current) => showToolbarTool(current, toolId));
  }
  const isCaptureTimelinePlayingRef = useRef(false);
  const captureTimelinePlaybackModeRef = useRef<CaptureTimelinePlaybackMode>("once");
  const captureTimelineViewportRef = useRef<HTMLDivElement | null>(null);
  const captureTimelineDragRef = useRef<{ sceneId: string; startMs: number; originClientX: number; hasMoved: boolean } | null>(null);
  const captureTimelinePastRef = useRef<CaptureTimelineHistorySnapshot[]>([]);
  const captureTimelineFutureRef = useRef<CaptureTimelineHistorySnapshot[]>([]);
  const pendingCaptureStillRef = useRef<{ scene: PersistedCaptureScene; fileName: string } | null>(null);

  const [localSceneLoadState, setLocalSceneLoadState] = useState<{ active: boolean; pending: number }>({ active: false, pending: 0 });
  const [dismissLocalSceneLoadNotice, setDismissLocalSceneLoadNotice] = useState(false);
  const [isGlobalFileDragActive, setIsGlobalFileDragActive] = useState(false);
  const [droppedLocalEntries, setDroppedLocalEntries] = useState<LocalInputEntry[] | null>(null);
  const [scenePointerTarget, setScenePointerTarget] = useState<ScenePointerHit | null>(null);
  const [isSlicePanelHoverLocked, setIsSlicePanelHoverLocked] = useState(false);
  const [sliceToolPlane, setSliceToolPlane] = useState<SlicePlane | null>(null);
  const [automationPipelines, setAutomationPipelines] = useState<AutomationPipeline[]>(() =>
    loadAutomationPipelines()
  );
  const [automationCustomTools, setAutomationCustomTools] = useState<AutomationCustomTool[]>(() =>
    loadAutomationCustomTools()
  );
  const [activeAutomationPipelineId, setActiveAutomationPipelineId] = useState<string | null>(null);
  const [automationDebug, setAutomationDebug] = useState<AutomationDebugSnapshot>(
    EMPTY_AUTOMATION_DEBUG_SNAPSHOT
  );
  const automationDebugResumeRef = useRef<(() => void) | null>(null);
  const automationDebugStopRequestedRef = useRef(false);
  const previousViewerStateForAutomationRef = useRef<ViewerStateV1 | null>(null);
  const suppressNextStateAutomationRef = useRef(false);
  const automationDebounceSerialRef = useRef<Record<string, number>>({});

  useEffect(() => {
    try {
      window.localStorage.setItem("mouse-brain-viewer:automation-custom-tools:v1", JSON.stringify(automationCustomTools));
    } catch {}
  }, [automationCustomTools]);

  useEffect(() => {
    if (!localSceneLoadState.active) {
      setDismissLocalSceneLoadNotice(false);
      return;
    }
    setDismissLocalSceneLoadNotice(false);
  }, [localSceneLoadState.active]);

  useEffect(() => {
    if (!isAppMenuOpen) return;
    function handlePointerDown(event: PointerEvent) {
      const target = event.target as HTMLElement | null;
      if (target?.closest("[data-viewer-app-menu='true']")) return;
      setIsAppMenuOpen(false);
    }
    document.addEventListener("pointerdown", handlePointerDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [isAppMenuOpen]);

  const initializedStartupSlicesRef = useRef(false);
  const hasHydratedHistoryRef = useRef(false);
  const autoCommitTimeoutRef = useRef<number | null>(null);
  const suppressNextAutoCommitRef = useRef(false);
  const pastStatesRef = useRef<ViewerHistoryEntry[]>([]);
  const futureStatesRef = useRef<ViewerHistoryEntry[]>([]);
  const lastCommittedStateRef = useRef<ViewerStateV1 | null>(null);
  const lastCommittedHashRef = useRef<string>("");
  const viewerCanvasElementRef = useRef<HTMLCanvasElement | null>(null);
  const globalFileDragDepthRef = useRef(0);
  const toastAutoCloseTimeoutsRef = useRef<Map<string, number>>(new Map());
  const toastRemovalTimeoutsRef = useRef<Map<string, number>>(new Map());
  const toastDurationsRef = useRef<Map<string, number>>(new Map());

  const [sliceVolumeLayerId, setSliceVolumeLayerId] = useState<string>("");
  const [sliceName, setSliceName] = useState<string>("");
  const [sliceParamsDraft, setSliceParamsDraft] = useState<SliceLayerParams>({
    mode: "axis",
    plane: "xy",
    index: 0,
    opacity: 1,
  });

  const groupOptions = useMemo(() => collectGroups(layerTree), [layerTree]);
  const allLayers = useMemo(() => collectAllLayerItems(layerTree), [layerTree]);
  const sliceBrowsableLayers = useMemo(
    () => allLayers.filter(isCanonicalSliceBrowsableLayer),
    [allLayers]
  );

  const selectedNode = useMemo(
    () => (selectedNodeId ? findNodeById(layerTree, selectedNodeId) : null),
    [layerTree, selectedNodeId]
  );
  const selectedVolumeOrientationSourceKey = useMemo(() => {
    return selectedNode &&
      selectedNode.kind === "layer" &&
      isVolumeOrientationAdjustableLayer(selectedNode)
      ? getVolumeOrientationSourceKey(selectedNode)
      : null;
  }, [selectedNode]);
  const selectedStoredSourceOrientationPreference = useMemo(() => {
    return selectedVolumeOrientationSourceKey
      ? loadSourceOrientationPreference(selectedVolumeOrientationSourceKey)
      : null;
  }, [selectedVolumeOrientationSourceKey, sourceOrientationRevision]);
  const selectedTransformPresets = useMemo(
    () => selectedStoredSourceOrientationPreference?.transformPresets ?? [],
    [selectedStoredSourceOrientationPreference]
  );
  const selectedCaptureLayerIds = useMemo(() => {
    const candidateIds = selectedNodeIdsExternal?.length
      ? selectedNodeIdsExternal
      : selectedNodeId
        ? [selectedNodeId]
        : [];
    return Array.from(
      new Set(
        candidateIds.filter((nodeId) => {
          const node = findNodeById(layerTree, nodeId);
          return !!node && node.kind === "layer";
        })
      )
    );
  }, [layerTree, selectedNodeId, selectedNodeIdsExternal]);
  const selectedCaptureLayerNames = useMemo(
    () =>
      selectedCaptureLayerIds
        .map((nodeId) => {
          const node = findNodeById(layerTree, nodeId);
          return node?.kind === "layer" ? node.name : null;
        })
        .filter((name): name is string => !!name),
    [layerTree, selectedCaptureLayerIds]
  );
  const visibleCaptureLayerIds = useMemo(
    () =>
      allLayers
        .filter((node) => node.visible)
        .map((node) => node.id),
    [allLayers]
  );
  const orderedCaptureScenes = useMemo(
    () =>
      [...captureScenes].sort((a, b) => {
        const aTime = a.timestampMs ?? 0;
        const bTime = b.timestampMs ?? 0;
        if (aTime !== bTime) return aTime - bTime;
        return a.createdAt - b.createdAt;
      }),
    [captureScenes]
  );
  const orderedCaptureStills = useMemo(
    () =>
      [...captureStills].sort((a, b) => {
        if (a.updatedAt !== b.updatedAt) return b.updatedAt - a.updatedAt;
        return b.createdAt - a.createdAt;
      }),
    [captureStills]
  );
  const orderedCaptureSequences = useMemo(
    () =>
      [...captureSequences].sort((a, b) => {
        if (a.updatedAt !== b.updatedAt) return b.updatedAt - a.updatedAt;
        return b.createdAt - a.createdAt;
      }),
    [captureSequences]
  );
  const activeCaptureScene = useMemo(
    () => captureScenes.find((scene) => scene.id === activeCaptureSceneId) ?? null,
    [activeCaptureSceneId, captureScenes]
  );
  const captureSequenceMenuItems = useMemo<CaptureSequenceMenuItem[]>(
    () =>
      orderedCaptureSequences.map((sequence) => ({
        id: sequence.id,
        name: sequence.name,
        sceneCount: sequence.scenes.length,
        updatedAt: sequence.updatedAt,
        active: sequence.id === activeCaptureSequenceId,
      })),
    [activeCaptureSequenceId, orderedCaptureSequences]
  );
  const captureStillMenuItems = useMemo<CaptureStillMenuItem[]>(
    () =>
      orderedCaptureStills.map((still) => ({
        id: still.id,
        name: still.name,
        thumbnailDataUrl: still.thumbnailDataUrl ?? still.capturedImageDataUrl,
        updatedAt: still.updatedAt,
        active: still.id === activeCaptureStillId,
      })),
    [activeCaptureStillId, orderedCaptureStills]
  );
  const activeOrderedCaptureSceneIndex = useMemo(
    () => orderedCaptureScenes.findIndex((scene) => scene.id === activeCaptureSceneId),
    [activeCaptureSceneId, orderedCaptureScenes]
  );
  const captureTimelineDurationMs = useMemo(
    () => Math.max(DEFAULT_CAPTURE_TIMELINE_RANGE_MS, captureTimelineRangeMs),
    [captureTimelineRangeMs]
  );
  const captureTimelinePixelsPerMs = useMemo(
    () => (CAPTURE_TIMELINE_BASE_PX_PER_SECOND * captureTimelineZoom) / 1000,
    [captureTimelineZoom]
  );
  const captureTimelineContentWidth = useMemo(
    () => Math.max(900, Math.round(captureTimelineDurationMs * captureTimelinePixelsPerMs) + 80),
    [captureTimelineDurationMs, captureTimelinePixelsPerMs]
  );
  const shouldShowCapturePanel = isCapturePanelOpen;

  const selectedAnnotationLayer =
    selectedNode &&
    selectedNode.kind === "layer" &&
    selectedNode.type === "annotation"
      ? selectedNode
      : null;

  const selectedCanonicalSliceLayer = isCanonicalSliceBrowsableLayer(selectedNode)
    ? selectedNode
    : null;
  const selectedCustomSliceLayer =
    selectedNode && selectedNode.kind === "layer" && isCustomSliceLayer(selectedNode)
      ? selectedNode
      : null;
  const selectedObliqueSliceLayer =
    selectedCustomSliceLayer && isObliqueSliceParams(selectedCustomSliceLayer.sliceParams)
      ? selectedCustomSliceLayer
      : null;

  const selectedAnnotation = selectedAnnotationLayer?.annotation ?? null;

  const openMetadataWindowForLayer = useCallback((annotationLayer: LayerItemNode, options?: { mode?: "edit" | "preview" | "split"; reuseMetadataWindow?: boolean }) => {
    const nextZ = nextFloatingWindowZRef.current + 1;
    nextFloatingWindowZRef.current = nextZ;
    const offset = floatingWindows.length * 26;
    const width = Math.min(760, Math.max(460, Math.round(window.innerWidth * 0.42)));
    const height = Math.min(620, Math.max(360, Math.round(window.innerHeight * 0.58)));
    const isNote = annotationLayer.annotation?.shape === "note";
    setFloatingWindows((prev) => {
      const existing = options?.reuseMetadataWindow
        ? prev.find((windowState) => !!windowState.metadataNodeId)
        : prev.find((windowState) => windowState.metadataNodeId === annotationLayer.id);
      if (existing) {
        return prev.map((windowState) =>
          windowState.id === existing.id
            ? {
                ...windowState,
                title: isNote ? "Note" : "Metadata",
                subtitle: annotationLayer.name,
                metadataNodeId: annotationLayer.id,
                minimized: false,
                zIndex: nextZ,
                metadataMode: options?.mode ?? windowState.metadataMode ?? "edit",
              }
            : windowState
        );
      }
      return [
        ...prev,
        {
          id: createId(),
          kind: "metadata",
          title: isNote ? "Note" : "Metadata",
          subtitle: annotationLayer.name,
          metadataNodeId: annotationLayer.id,
          x: Math.max(16, Math.round((window.innerWidth - width) * 0.5) + offset),
          y: Math.max(16, Math.round((window.innerHeight - height) * 0.5) + offset),
          width,
          height,
          zIndex: nextZ,
          minimized: false,
          maximized: false,
          metadataMode: options?.mode ?? "edit",
        },
      ];
    });
  }, [floatingWindows.length]);

  const openMetadataWindow = useCallback(() => {
    if (!selectedAnnotationLayer) return;
    openMetadataWindowForLayer(selectedAnnotationLayer);
  }, [openMetadataWindowForLayer, selectedAnnotationLayer]);

  const openAssistantChatWindow = useCallback((conversation: AppAssistantConversation) => {
    const nextZ = nextFloatingWindowZRef.current + 1;
    nextFloatingWindowZRef.current = nextZ;
    const offset = floatingWindows.length * 26;
    const width = Math.min(680, Math.max(460, Math.round(window.innerWidth * 0.38)));
    const height = Math.min(640, Math.max(420, Math.round(window.innerHeight * 0.58)));
    setFloatingWindows((prev) => [
      ...prev,
      {
        id: createId(),
        kind: "assistant-chat",
        title: "Assistant",
        subtitle: conversation.title,
        assistantConversationId: conversation.id,
        x: Math.max(16, Math.round((window.innerWidth - width) * 0.5) + offset),
        y: Math.max(16, Math.round((window.innerHeight - height) * 0.5) + offset),
        width,
        height,
        zIndex: nextZ,
        minimized: false,
        maximized: false,
      },
    ]);
  }, [floatingWindows.length]);

	  useEffect(() => {
	    const targetNodeId = selectedAnnotationLayer?.id;
	    if (!targetNodeId) return;
	    const nextZ = nextFloatingWindowZRef.current + 1;
	    nextFloatingWindowZRef.current = nextZ;
	    setFloatingWindows((prev) =>
	      prev.map((windowState) => {
	        if (windowState.metadataNodeId !== targetNodeId || windowState.minimized) {
	          return windowState;
	        }
	        const maxZ = getMaxFloatingWindowZ(prev);
	        if (windowState.zIndex >= maxZ) {
	          return windowState;
	        }
	        return { ...windowState, zIndex: nextZ };
	      })
	    );
	  }, [selectedAnnotationLayer?.id]);

  const canShowGlobalDropOverlay =
    isGlobalFileDragActive &&
    !isImportPanelOpen &&
    !isLocalDatasetManagerOpen &&
    !isUserProfilePanelOpen &&
    activeTool !== "library" &&
    activeTool !== "pipeline" &&
    activeTool !== "assistant" &&
    activeTool !== "export";

  useEffect(() => {
    if (activeTool !== "slice" || !selectedCanonicalSliceLayer) return;
    if (selectedCanonicalSliceLayer.axisSliceState?.activePlane) return;
    setLayerTree((prev) =>
      updateNodeById(prev, selectedCanonicalSliceLayer.id, (node) =>
        node.kind !== "layer"
          ? node
          : {
              ...node,
              axisSliceState: {
                ...node.axisSliceState,
                activePlane: "xy",
              },
            }
      )
    );
  }, [activeTool, selectedCanonicalSliceLayer]);

  useEffect(() => {
    if (activeTool !== "slice") {
      setSliceToolPlane(null);
      return;
    }
    if (!selectedCanonicalSliceLayer) {
      setSliceToolPlane(null);
      return;
    }
    setSliceToolPlane(selectedCanonicalSliceLayer.axisSliceState?.activePlane ?? "xy");
  }, [activeTool, selectedCanonicalSliceLayer]);

  useEffect(() => {
    async function handleWindowDrop(event: DragEvent) {
      if (!dataTransferHasFiles(event.dataTransfer)) return;
      event.preventDefault();
      event.stopPropagation();
      globalFileDragDepthRef.current = 0;
      setIsGlobalFileDragActive(false);
      const entries = await collectDroppedLocalEntries(event.dataTransfer?.items ?? null, event.dataTransfer?.files ?? null);
      if (!entries.length) return;
      setDroppedLocalEntries(entries);
      setIsLocalDatasetManagerOpen(false);
      setIsUserProfilePanelOpen(false);
      setActiveTool("mouse");
      setImportPanelView("import-local");
      setIsImportPanelOpen(true);
    }

    function handleWindowDragEnter(event: DragEvent) {
      if (!dataTransferHasFiles(event.dataTransfer)) return;
      event.preventDefault();
      globalFileDragDepthRef.current += 1;
      setIsGlobalFileDragActive(true);
    }

    function handleWindowDragOver(event: DragEvent) {
      if (!dataTransferHasFiles(event.dataTransfer)) return;
      event.preventDefault();
      if (event.dataTransfer) {
        event.dataTransfer.dropEffect = "copy";
      }
      setIsGlobalFileDragActive(true);
    }

    function handleWindowDragLeave(event: DragEvent) {
      if (!dataTransferHasFiles(event.dataTransfer)) return;
      event.preventDefault();
      globalFileDragDepthRef.current = Math.max(0, globalFileDragDepthRef.current - 1);
      if (globalFileDragDepthRef.current === 0) {
        setIsGlobalFileDragActive(false);
      }
    }

    window.addEventListener("dragenter", handleWindowDragEnter);
    window.addEventListener("dragover", handleWindowDragOver);
    window.addEventListener("dragleave", handleWindowDragLeave);
    window.addEventListener("drop", handleWindowDrop);
    return () => {
      window.removeEventListener("dragenter", handleWindowDragEnter);
      window.removeEventListener("dragover", handleWindowDragOver);
      window.removeEventListener("dragleave", handleWindowDragLeave);
      window.removeEventListener("drop", handleWindowDrop);
    };
  }, []);

  useEffect(() => {
    if (!selectedNode || selectedNode.kind !== "layer" || selectedNode.type === "annotation") {
      setSelectedLayerRuntimeInfo((prev) => (prev ? null : prev));
    }
  }, [selectedNode]);

  useEffect(() => {
    function handleWindowError(event: ErrorEvent) {
      enqueueErrorToast(event.error ?? event.message, {
        source: "window.error",
        technicalMessage: event.message || normalizeUnknownErrorMessage(event.error),
      });
    }

    function handleUnhandledRejection(event: PromiseRejectionEvent) {
      enqueueErrorToast(event.reason, {
        source: "window.unhandledrejection",
      });
    }

    const originalConsoleError = console.error.bind(console);
    console.error = (...args: unknown[]) => {
      originalConsoleError(...args);
      const technicalMessage = args
        .map((value) => normalizeUnknownErrorMessage(value))
        .filter((value): value is string => !!value)
        .join(" | ");
      enqueueErrorToast(args[0] ?? technicalMessage, {
        source: "console.error",
        technicalMessage,
      });
    };

    window.addEventListener("error", handleWindowError);
    window.addEventListener("unhandledrejection", handleUnhandledRejection);

    return () => {
      window.removeEventListener("error", handleWindowError);
      window.removeEventListener("unhandledrejection", handleUnhandledRejection);
      console.error = originalConsoleError;
    };
  }, []);

  const handleCameraStateChange = useCallback((next: SerializableCameraState) => {
    if (isCaptureTimelinePlayingRef.current) {
      return;
    }
    pendingCameraStateRef.current = next;

    if (cameraCommitTimeoutRef.current !== null) {
      return;
    }

    cameraCommitTimeoutRef.current = window.setTimeout(() => {
      cameraCommitTimeoutRef.current = null;
      const pending = pendingCameraStateRef.current;
      if (!pending) return;

      setCameraState((prev) => {
        if (
          prev.mode === pending.mode &&
          prev.yaw === pending.yaw &&
          prev.pitch === pending.pitch &&
          prev.fovDeg === pending.fovDeg &&
          prev.position[0] === pending.position[0] &&
          prev.position[1] === pending.position[1] &&
          prev.position[2] === pending.position[2]
        ) {
          return prev;
        }
        return pending;
      });
    }, 33);
  }, []);

  useEffect(() => {
    isCaptureTimelinePlayingRef.current = isCaptureTimelinePlaying;
  }, [isCaptureTimelinePlaying]);

  const handleSelectedLayerRuntimeInfoChange = useCallback(
    (next: SelectedLayerRuntimeInfo | null) => {
      setSelectedLayerRuntimeInfo((prev) => {
        const prevKey = prev ? JSON.stringify(prev) : "null";
        const nextKey = next ? JSON.stringify(next) : "null";
        return prevKey === nextKey ? prev : next;
      });
    },
    []
  );

  const handleCanvasElementChange = useCallback((canvas: HTMLCanvasElement | null) => {
    viewerCanvasElementRef.current = canvas;
  }, []);

  const handleLocalSceneLoadStateChange = useCallback(
    (next: { active: boolean; pending: number }) => {
      setLocalSceneLoadState((prev) =>
        prev.active === next.active && prev.pending === next.pending ? prev : next
      );
    },
    []
  );

  useEffect(() => {
    return () => {
      if (cameraCommitTimeoutRef.current !== null) {
        window.clearTimeout(cameraCommitTimeoutRef.current);
      }
    };
  }, []);



  function handleCenterCanonicalSlices() {
    const targetId = selectedCanonicalSliceLayer?.id;
    const dims = selectedLayerRuntimeInfo?.dims ?? null;
    if (!targetId || !dims) return;
    setLayerTree((prev) =>
      updateNodeById(prev, targetId, (node) =>
        node.kind !== "layer"
          ? node
          : {
              ...node,
              axisSliceState: {
                ...node.axisSliceState,
                xy: Math.round(Math.max(0, dims.z - 1) * 0.5),
                xz: Math.round(Math.max(0, dims.y - 1) * 0.5),
                yz: Math.round(Math.max(0, dims.x - 1) * 0.5),
                activePlane: node.axisSliceState?.activePlane ?? "xy",
              },
            }
      )
    );
  }

  function getCanonicalSliceViewState(plane: SlicePlane) {
    const viewState = selectedCanonicalSliceLayer?.axisSliceViewState?.[plane] as
      | {
          flipX?: boolean;
          flipY?: boolean;
          flipZ?: boolean;
          visible?: boolean;
          rotationDeg?: number;
          scale?: number;
        }
      | undefined;
    return {
      flipX: !!viewState?.flipX,
      flipY: !!viewState?.flipY,
      flipZ: !!viewState?.flipZ,
      visible: viewState?.visible !== false,
      rotationDeg: Number.isFinite(viewState?.rotationDeg) ? Number(viewState?.rotationDeg) : 0,
      scale: Number.isFinite(viewState?.scale) ? Number(viewState?.scale) : 1,
    };
  }

  function getObliqueSliceViewState() {
    const params =
      selectedObliqueSliceLayer && isObliqueSliceParams(selectedObliqueSliceLayer.sliceParams)
        ? selectedObliqueSliceLayer.sliceParams
        : null;
    return {
      flipX: !!params?.flipX,
      flipY: !!params?.flipY,
      flipZ: !!params?.flipZ,
      rotationDeg: Number.isFinite(params?.rotationDeg) ? Number(params?.rotationDeg) : 0,
      scale: Number.isFinite(params?.scale) ? Number(params?.scale) : 1,
    };
  }

  function getCanonicalSliceToolPlane(): SlicePlane | null {
    if (!selectedCanonicalSliceLayer) return null;
    return (
      sliceToolPlane ??
      selectedCanonicalSliceLayer.axisSliceState?.activePlane ??
      "xy"
    );
  }

  function handleUpdateCanonicalSliceViewState(
    plane: SlicePlane,
    updater: (current: { flipX: boolean; flipY: boolean; flipZ: boolean; visible: boolean; rotationDeg: number; scale: number }) => {
      flipX?: boolean;
      flipY?: boolean;
      flipZ?: boolean;
      visible?: boolean;
      rotationDeg?: number;
      scale?: number;
    }
  ) {
    const targetId = selectedCanonicalSliceLayer?.id;
    if (!targetId) return;
    setLayerTree((prev) =>
      updateNodeById(prev, targetId, (node) => {
        if (node.kind !== "layer") return node;
        const current = node.axisSliceViewState?.[plane];
        const normalized = {
          flipX: !!current?.flipX,
          flipY: !!current?.flipY,
          flipZ: !!current?.flipZ,
          visible: (current as { visible?: boolean } | undefined)?.visible !== false,
          rotationDeg: Number.isFinite(current?.rotationDeg) ? Number(current?.rotationDeg) : 0,
          scale: Number.isFinite(current?.scale) ? Number(current?.scale) : 1,
        };
        const next = updater(normalized);
        return {
          ...node,
          orientationPreset: "custom",
          axisSliceState: {
            ...node.axisSliceState,
            activePlane: plane,
          },
          axisSliceViewState: {
            ...node.axisSliceViewState,
            [plane]: {
              ...normalized,
              ...next,
            },
          },
        };
      })
    );
    setSliceToolPlane(plane);
  }

  function handleRotateCanonicalSlice(deltaDeg: number) {
    const plane = getCanonicalSliceToolPlane();
    if (!plane) return;
    handleUpdateCanonicalSliceViewState(plane, (current) => ({
      rotationDeg: ((current.rotationDeg + deltaDeg) % 360 + 360) % 360,
    }));
  }

  function handleToggleCanonicalSliceFlip(axis: "x" | "y" | "z") {
    const plane = getCanonicalSliceToolPlane();
    if (!plane) return;
    handleUpdateCanonicalSliceViewState(plane, (current) => {
      if (axis === "x") return { flipX: !current.flipX };
      if (axis === "y") return { flipY: !current.flipY };
      return { flipZ: !current.flipZ };
    });
  }

  function handleToggleCanonicalSliceVisibility(plane: SlicePlane) {
    handleUpdateCanonicalSliceViewState(plane, (current) => ({
      visible: !current.visible,
    }));
    setSliceToolPlane(plane);
  }

  function handleScaleCanonicalSlice(delta: number) {
    const plane = getCanonicalSliceToolPlane();
    if (!plane) return;
    handleUpdateCanonicalSliceViewState(plane, (current) => ({
      scale: Math.max(0.05, Math.min(6, Math.round((current.scale + delta) * 1000) / 1000)),
    }));
  }



  function handleResetCanonicalSliceView() {
    const plane = getCanonicalSliceToolPlane();
    if (!plane) return;
    handleUpdateCanonicalSliceViewState(plane, () => ({
      flipX: false,
      flipY: false,
      flipZ: false,
      visible: true,
      rotationDeg: 0,
      scale: 1,
    }));
  }

  function handleUpdateObliqueSliceParams(
    updater: (
      current: Extract<SliceLayerParams, { mode: "oblique" }>
    ) => Extract<SliceLayerParams, { mode: "oblique" }>
  ) {
    const targetId = selectedObliqueSliceLayer?.id;
    if (!targetId) return;

    setLayerTree((prev) =>
      updateNodeById(prev, targetId, (node) => {
        if (
          node.kind !== "layer" ||
          node.type !== "custom-slice" ||
          !isObliqueSliceParams(node.sliceParams)
        ) {
          return node;
        }

        return {
          ...node,
          sliceParams: updater(node.sliceParams),
        };
      })
    );
  }

  function handleUpdateObliqueSliceViewState(
    updater: (current: { flipX: boolean; flipY: boolean; flipZ: boolean; rotationDeg: number; scale: number }) => {
      flipX?: boolean;
      flipY?: boolean;
      flipZ?: boolean;
      rotationDeg?: number;
      scale?: number;
    }
  ) {
    handleUpdateObliqueSliceParams((current) => {
      const normalized = {
        flipX: !!current.flipX,
        flipY: !!current.flipY,
        flipZ: !!current.flipZ,
        rotationDeg: Number.isFinite(current.rotationDeg) ? Number(current.rotationDeg) : 0,
        scale: Number.isFinite(current.scale) ? Number(current.scale) : 1,
      };
      return {
        ...current,
        ...normalized,
        ...updater(normalized),
      };
    });
  }

  function handleCreateFreeSliceFromCanonical() {
    const layer = selectedCanonicalSliceLayer;
    const dims = selectedLayerRuntimeInfo?.dims ?? null;
    const plane = getCanonicalSliceToolPlane();
    if (!layer || !dims || !plane) return;

    const displayIndex =
      layer.axisSliceState?.[plane] ??
      Math.round(getPlaneCenterCoordinate(dims, plane));
    const nextSliceParams = buildObliqueSliceFromCanonicalPlane(
      layer,
      dims,
      plane,
      displayIndex,
      getCanonicalSliceViewState(plane)
    );
    const nextId = createId();
    const nextName = `${layer.name} free slice`;

    setLayerTree((prev) => [
      ...prev,
      {
        id: nextId,
        kind: "layer",
        name: nextName,
        type: "custom-slice",
        visible: true,
        source: { volumeLayerId: layer.id },
        sourceKind: "built-in",
        description: `Free slice from ${layer.name}`,
        sliceParams: nextSliceParams,
        transform: layer.transform
          ? {
              translation: layer.transform.translation
                ? [...layer.transform.translation]
                : undefined,
              rotation: layer.transform.rotation
                ? [...layer.transform.rotation]
                : undefined,
              scale: layer.transform.scale ? [...layer.transform.scale] : undefined,
            }
          : undefined,
      },
    ]);
    setSelectedNodeId(nextId);
    setSelectedNodeIdsExternal([nextId]);
    setSliceVolumeLayerId(layer.id);
    setSliceName(nextName);
    setSliceParamsDraft(nextSliceParams);
  }

  function handleSnapObliqueSliceToPlane(plane: SlicePlane) {
    const dims = selectedLayerRuntimeInfo?.dims ?? null;
    if (!dims) return;
    const profile = selectedCanonicalSliceLayer
      ? getSliceOrientationProfileForLayer(selectedCanonicalSliceLayer)
      : getViewerOrientationProfileForPreset("allen");
    const basis = getProfileAdjustedPlaneBasis(
      getCanonicalPlaneNormal(plane),
      profile,
      undefined,
      plane
    );
    handleUpdateObliqueSliceParams((current) => ({
      ...current,
      normal: getCanonicalPlaneNormal(plane),
      uAxis: basis.u,
      referencePlane: plane,
      offset: 0,
      ...getAxisSliceSizeForPlane(dims, plane),
    }));
  }

  function handleNudgeObliqueSliceOffset(delta: number) {
    handleUpdateObliqueSliceParams((current) => ({
      ...current,
      offset: Math.round(((current.offset ?? 0) + delta) * 1000) / 1000,
    }));
  }

  function handleRotateObliqueSlice(deltaDeg: number) {
    handleUpdateObliqueSliceViewState((current) => ({
      rotationDeg: ((current.rotationDeg + deltaDeg) % 360 + 360) % 360,
    }));
  }

  function handleToggleObliqueSliceFlip(axis: "x" | "y" | "z") {
    handleUpdateObliqueSliceViewState((current) => {
      if (axis === "x") return { flipX: !current.flipX };
      if (axis === "y") return { flipY: !current.flipY };
      return { flipZ: !current.flipZ };
    });
  }

  function handleScaleObliqueSlice(delta: number) {
    handleUpdateObliqueSliceViewState((current) => ({
      scale: Math.max(0.05, Math.min(6, Math.round((current.scale + delta) * 1000) / 1000)),
    }));
  }

  function handleResetObliqueSliceView() {
    handleUpdateObliqueSliceViewState(() => ({
      flipX: false,
      flipY: false,
      flipZ: false,
      rotationDeg: 0,
      scale: 1,
    }));
  }

  function handleTiltObliqueSlice(axis: "u" | "v", deltaDeg: number) {
    handleUpdateObliqueSliceParams((current) => {
      const basis = getObliqueSliceBasis(current);
      const rotationAxis = axis === "u" ? basis.u : basis.v;
      const nextNormal = rotateSliceVec3AroundAxis(current.normal, rotationAxis, deltaDeg);
      const nextUAxis =
        axis === "u"
          ? basis.u
          : rotateSliceVec3AroundAxis(basis.u, rotationAxis, deltaDeg);
      return {
        ...current,
        normal: nextNormal,
        uAxis: normalizeSliceVec3(projectSliceVec3OntoPlane(nextUAxis, nextNormal)),
      };
    });
  }

  function handleResetObliqueSliceToCenter() {
    handleUpdateObliqueSliceParams((current) => ({
      ...current,
      offset: 0,
    }));
  }

  function handleTiltObliqueSliceForLayer(
    layerId: string,
    axis: "u" | "v",
    deltaDeg: number
  ) {
    setLayerTree((prev) =>
      updateNodeById(prev, layerId, (node) => {
        if (
          node.kind !== "layer" ||
          node.type !== "custom-slice" ||
          !isObliqueSliceParams(node.sliceParams)
        ) {
          return node;
        }

        const current = node.sliceParams;
        const basis = getObliqueSliceBasis(current);
        const rotationAxis = axis === "u" ? basis.u : basis.v;
        const nextNormal = rotateSliceVec3AroundAxis(current.normal, rotationAxis, deltaDeg);
        const nextUAxis =
          axis === "u"
            ? basis.u
            : rotateSliceVec3AroundAxis(basis.u, rotationAxis, deltaDeg);

        return {
          ...node,
          sliceParams: {
            ...current,
            normal: nextNormal,
            uAxis: normalizeSliceVec3(projectSliceVec3OntoPlane(nextUAxis, nextNormal)),
          },
        };
      })
    );
  }






  const sliceToolTargetPlane = getCanonicalSliceToolPlane();
  const sliceToolViewState = selectedObliqueSliceLayer
    ? getObliqueSliceViewState()
    : sliceToolTargetPlane
      ? getCanonicalSliceViewState(sliceToolTargetPlane)
      : {
          flipX: false,
          flipY: false,
          flipZ: false,
          rotationDeg: 0,
          scale: 1,
        };
  const sliceToolMode = selectedObliqueSliceLayer ? "free" : "canonical";
  const sliceToolSelectedLayerName =
    selectedObliqueSliceLayer?.name ?? selectedCanonicalSliceLayer?.name ?? null;
  const sliceToolFreeSliceOffset =
    selectedObliqueSliceLayer && isObliqueSliceParams(selectedObliqueSliceLayer.sliceParams)
      ? selectedObliqueSliceLayer.sliceParams.offset ?? 0
      : 0;

  const inspectorPanelContent = (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <LayerInspectorPanel
        selectedNode={selectedNode}
        selectedAnnotation={selectedAnnotation ?? null}
        selectedLayerRuntimeInfo={selectedLayerRuntimeInfo}
        annotationDraft={annotationDraft}
        isInspectorCollapsed={isInspectorCollapsed}
        onToggleCollapsed={() => setIsInspectorCollapsed((prev) => !prev)}
        onRenameNode={handleRenameNode}
        onUpdateSelectedNodeOpacity={updateSelectedNodeOpacity}
        onUpdateSelectedNodeIntensityWindow={updateSelectedNodeIntensityWindow}
        onUpdateSelectedNodeMeshStyle={updateSelectedNodeMeshStyle}
        onUpdateSelectedNodeTransform={updateSelectedNodeTransform}
        onResetSelectedNodeTransform={resetSelectedNodeTransform}
        orientationPresetOptions={VOLUME_ORIENTATION_PRESET_OPTIONS}
        onUpdateSelectedNodeOrientationPreset={updateSelectedNodeOrientationPreset}
        showRasReference={showRasReference}
        onToggleShowRasReference={() => setShowRasReference((prev) => !prev)}
        transformPresets={selectedTransformPresets}
        onSaveSelectedNodeTransformPreset={saveSelectedNodeTransformPreset}
        onApplySelectedNodeTransformPreset={applySelectedNodeTransformPreset}
        onRenameSelectedNodeTransformPreset={renameSelectedNodeTransformPreset}
        onDeleteSelectedNodeTransformPreset={deleteSelectedNodeTransformPreset}
        onUpdateSelectedAnnotationLayer={updateSelectedAnnotationLayer}
        onOpenMetadataWindow={openMetadataWindow}
      />
   </div>
  );

  const currentViewerState = useMemo(
    () =>
      createViewerState({
        activeTool,
        selectedNodeId,
        layerTree,
        sliceVolumeLayerId,
        sliceName,
        sliceParamsDraft,
	        layerPanelCollapsed: isLayerPanelCollapsed,
	        inspectorCollapsed: isInspectorCollapsed,
	        windows: floatingWindows.map((windowState): SerializableFloatingWindowState => ({
          id: windowState.id,
          kind: windowState.kind,
          title: windowState.title,
          subtitle: windowState.subtitle,
          metadataNodeId: windowState.metadataNodeId,
          assistantConversationId: windowState.assistantConversationId,
          x: windowState.x,
	          y: windowState.y,
	          width: windowState.width,
	          height: windowState.height,
	          zIndex: windowState.zIndex,
	          minimized: windowState.minimized,
	          maximized: windowState.maximized,
	          metadataMode: windowState.metadataMode,
	        })),
	        camera: cameraState,
	        automationPipelines,
	        automationCustomTools,
	      }),
    [
      activeTool,
      selectedNodeId,
      layerTree,
      sliceVolumeLayerId,
      sliceName,
      sliceParamsDraft,
	      isLayerPanelCollapsed,
	      isInspectorCollapsed,
	      floatingWindows,
	      cameraState,
	      automationPipelines,
	      automationCustomTools,
	    ]
  );

  const currentViewerHash = useMemo(
    () => hashViewerStateForHistory(currentViewerState),
    [currentViewerState]
  );
  const resourceRefreshToken = useMemo(
    () => historyRevision * 1_000_000 + profileDataRevision * 1_000 + cacheClearRequestKey,
    [cacheClearRequestKey, historyRevision, profileDataRevision]
  );
  const visibleLayerCount = useMemo(
    () => allLayers.filter((layer) => layer.visible !== false).length,
    [allLayers]
  );
  const activeAutomationCount = useMemo(
    () => automationPipelines.filter((pipeline) => pipeline.active).length,
    [automationPipelines]
  );
  const {
    summary: resourceSummary,
    samples: resourceHistorySamples,
    endProcess: endResourceProcess,
  } = useBrowserResourceTelemetry({
    viewerState: currentViewerState,
    activeAutomationCount,
    visibleLayerCount,
    localScenePendingCount: localSceneLoadState.pending,
    refreshToken: resourceRefreshToken,
  });

  useEffect(() => {
    if (!automationPipelines.some((pipeline) => pipeline.id === activeAutomationPipelineId)) {
      setActiveAutomationPipelineId(automationPipelines[0]?.id ?? null);
    }
  }, [automationPipelines, activeAutomationPipelineId]);

  const pipelineMenuItems = useMemo<PipelineMenuItem[]>(
    () =>
      automationPipelines.map((pipeline) => ({
        id: pipeline.id,
        name: pipeline.name,
        description: pipeline.description,
        active: pipeline.autoRun,
      })),
    [automationPipelines]
  );

  const appAssistantContext = useMemo(
    () =>
      buildAppAssistantContext({
        activeTool,
        isImportPanelOpen,
        isLocalDatasetManagerOpen,
        selectedNode,
        selectedNodeIds: selectedNodeIdsExternal ?? (selectedNodeId ? [selectedNodeId] : []),
        viewerState: currentViewerState,
        savedViewers: viewerLibrary,
        activeSavedViewerId,
        automationPipelines,
        activeAutomationPipelineId,
        automationCustomTools,
      }),
    [
      activeTool,
      isImportPanelOpen,
      isLocalDatasetManagerOpen,
      selectedNode,
      selectedNodeIdsExternal,
      selectedNodeId,
      currentViewerState,
      viewerLibrary,
      activeSavedViewerId,
      automationPipelines,
      activeAutomationPipelineId,
      automationCustomTools,
    ]
  );

  const applyAssistantToolCall = useCallback((toolCall: AppAssistantToolCall) => {
    if (toolCall.name === "assistant.proposePipelineCommand") {
      const command = toolCall.arguments.command;
      if (!activeAutomationPipelineId) return;
      if (command.kind === "activePipeline.setDescription") {
        setAutomationPipelines((prev) =>
          prev.map((pipeline) =>
            pipeline.id === activeAutomationPipelineId
              ? { ...pipeline, description: command.description }
              : pipeline
          )
        );
        return;
      }
      if (command.kind === "activePipeline.rename") {
        setAutomationPipelines((prev) =>
          prev.map((pipeline) =>
            pipeline.id === activeAutomationPipelineId
              ? { ...pipeline, name: command.name }
              : pipeline
          )
        );
        return;
      }
      if (command.kind === "activePipeline.setEnabled") {
        setAutomationPipelines((prev) =>
          prev.map((pipeline) =>
            pipeline.id === activeAutomationPipelineId
              ? { ...pipeline, active: command.active }
              : pipeline
          )
        );
        return;
      }
      if (command.kind === "activePipeline.setAutoRun") {
        setAutomationPipelines((prev) =>
          prev.map((pipeline) =>
            pipeline.id === activeAutomationPipelineId
              ? { ...pipeline, autoRun: command.autoRun }
              : pipeline
          )
        );
        return;
      }
      if (command.kind === "activePipeline.updateNodeConfig") {
        setAutomationPipelines((prev) =>
          prev.map((pipeline) => {
            if (pipeline.id !== activeAutomationPipelineId) return pipeline;
            const nextNodes = pipeline.nodes.map((node) => {
              const matchesById = command.nodeId && node.id === command.nodeId;
              const matchesByToken = command.nodeToken && node.token === command.nodeToken;
              if (!matchesById && !matchesByToken) return node;
              return {
                ...node,
                config: {
                  ...(node.config ?? {}),
                  [command.key]: command.value,
                },
              };
            });
            let nextScript = pipeline.script;
            try {
              const parsed = JSON.parse(pipeline.script) as {
                nodes: Array<Record<string, unknown> & { id?: string; token?: string; config?: Record<string, unknown> }>;
                connections: unknown[];
              };
              nextScript = JSON.stringify(
                {
                  automationScriptVersion: 1,
                  nodes: parsed.nodes.map((node) => {
                    const matchesById = command.nodeId && node.id === command.nodeId;
                    const matchesByToken = command.nodeToken && node.token === command.nodeToken;
                    if (!matchesById && !matchesByToken) return node;
                    return {
                      ...node,
                      config: {
                        ...(node.config ?? {}),
                        [command.key]: command.value,
                      },
                    };
                  }),
                  connections: parsed.connections,
                },
                null,
                2
              );
            } catch {
              nextScript = pipeline.script;
            }
            return {
              ...pipeline,
              nodes: nextNodes,
              script: nextScript,
            };
          })
        );
        return;
      }
    }
    if (toolCall.name === "assistant.proposeStateCommand") {
      const command = toolCall.arguments.command;
      if (command.kind === "selectedLayer.setVisibility") {
        if (!selectedNodeId) return;
        suppressNextStateAutomationRef.current = true;
        setLayerTree((prev) => setNodeVisibleState(prev, selectedNodeId, command.visible));
        return;
      }
      if (command.kind === "selectedLayer.setOpacity") {
        suppressNextStateAutomationRef.current = true;
        updateSelectedNodeOpacity(command.opacity);
        return;
      }
      if (command.kind === "selectedLayer.translate") {
        const currentNode = selectedNodeId ? findNodeById(layerTree, selectedNodeId) : null;
        const currentTranslation = currentNode?.transform?.translation ?? [0, 0, 0];
        suppressNextStateAutomationRef.current = true;
        updateSelectedNodeTransform({
          translation: [
            currentTranslation[0] + (command.dx ?? 0),
            currentTranslation[1] + (command.dy ?? 0),
            currentTranslation[2] + (command.dz ?? 0),
          ],
        });
        return;
      }
      if (command.kind === "selectedLayer.rename") {
        if (!selectedNodeId) return;
        suppressNextStateAutomationRef.current = true;
        handleRenameNode(selectedNodeId, command.name);
        return;
      }
      if (command.kind === "selection.group") {
        const selectionIds = selectedNodeIdsExternal ?? (selectedNodeId ? [selectedNodeId] : []);
        suppressNextStateAutomationRef.current = true;
        handleCreateGroupFromNodes(selectionIds);
        return;
      }
    }
  }, [activeAutomationPipelineId, layerTree, selectedNodeId, selectedNodeIdsExternal]);

  const libraryEntries = useMemo(() =>
    [...viewerLibrary].sort((a, b) => b.updatedAt - a.updatedAt),
    [viewerLibrary]
  );
  const viewerLibrarySavePlaceholder = useMemo(
    () => buildLibrarySavePlaceholder(viewerLibrary),
    [viewerLibrary]
  );

  const canUndo = pastStatesRef.current.length > 0;
  const canRedo = futureStatesRef.current.length > 0;
  const canClearHistory = canUndo || canRedo;
  const isStateModalOpen = isStateDialogOpen;
  const localOnlyLayerNames = useMemo(() => getLocalOnlyLayerNames(layerTree), [layerTree]);
  const isCurrentViewerShareSerializable = useMemo(() => isSerializableLayerTree(layerTree), [layerTree]);

  function formatHistoryTimestamp(timestamp: number) {
    const date = new Date(timestamp);
    const now = new Date();
    const sameDay =
      date.getFullYear() === now.getFullYear() &&
      date.getMonth() === now.getMonth() &&
      date.getDate() === now.getDate();

    return sameDay
      ? date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })
      : date.toLocaleString([], {
          year: "numeric",
          month: "short",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        });
  }

  function buildStateHistoryLabel(entry: ViewerHistoryEntry) {
    const state = entry.state;
    const selectedName = state.scene.selectedNodeId
      ? findNodeById(state.scene.layerTree, state.scene.selectedNodeId)?.name ?? state.scene.selectedNodeId
      : "No selection";
    const layerCount = collectAllLayerItems(state.scene.layerTree).length;
    const layoutLabel = state.layout.layerPanelCollapsed ? "panel hidden" : "panel visible";
    return {
      label: selectedName,
      meta: `${formatHistoryTimestamp(entry.committedAt)} · ${layerCount} layers · ${layoutLabel}`,
    };
  }

  const undoItems = useMemo<HistoryMenuItem[]>(() => {
    void historyRevision;
    const states = [...pastStatesRef.current].reverse();
    return states.map((entry, index) => {
      const info = buildStateHistoryLabel(entry);
      return {
        id: `undo-${index}-${hashViewerStateForHistory(entry.state).slice(0, 12)}`,
        label: info.label,
        meta: info.meta,
      };
    });
  }, [historyRevision]);

  const redoItems = useMemo<HistoryMenuItem[]>(() => {
    void historyRevision;
    const states = futureStatesRef.current;
    return states.map((entry, index) => {
      const info = buildStateHistoryLabel(entry);
      return {
        id: `redo-${index}-${hashViewerStateForHistory(entry.state).slice(0, 12)}`,
        label: info.label,
        meta: info.meta,
      };
    });
  }, [historyRevision]);

  function bumpHistoryRevision() {
    setHistoryRevision((value) => value + 1);
  }

  function notifyProfileDataChanged() {
    setProfileDataRevision((value) => value + 1);
  }

  function pushRecentAnnotationColor(color: string) {
    const normalized = normalizeHexColor(color);
    setAnnotationRecentColors((prev) => {
      const next = [normalized, ...prev.filter((value) => value !== normalized)].slice(0, 10);
      saveRecentAnnotationColors(next);
      return next;
    });
  }

  function updateAnnotationDraft(patch: Partial<AnnotationDraftSettings>) {
    setAnnotationDraft((prev) => {
      const nextShape = patch.shape ?? prev.shape;
      const mergedSizeByShape: AnnotationShapeSizeMap = {
        ...DEFAULT_ANNOTATION_SHAPE_SIZES,
        ...(prev.sizeByShape ?? DEFAULT_ANNOTATION_SHAPE_SIZES),
        ...(patch.sizeByShape ?? {}),
      };

      if (typeof patch.size === "number" && Number.isFinite(patch.size)) {
        mergedSizeByShape[nextShape] = patch.size;
      }

      const nextSize =
        typeof patch.size === "number" && Number.isFinite(patch.size)
          ? patch.size
          : mergedSizeByShape[nextShape] ?? prev.size ?? DEFAULT_ANNOTATION_SHAPE_SIZES[nextShape];

      return {
        ...prev,
        ...patch,
        shape: nextShape,
        size: nextSize,
        sizeByShape: mergedSizeByShape,
      };
    });
  }

  function handleAnnotationDraftColorChange(color: string) {
    const normalized = normalizeHexColor(color);
    updateAnnotationDraft({ color: normalized });
    setActiveTool("pencil");
  }

  function handleAnnotationDraftColorCommit(color: string) {
    pushRecentAnnotationColor(color);
    setActiveTool("pencil");
  }

  function handleAnnotationDraftOpacityChange(opacity: number) {
    updateAnnotationDraft({ opacity });
    setActiveTool("pencil");
  }

  function handleAnnotationDraftSizeChange(size: number) {
    updateAnnotationDraft({ size });
    setActiveTool("pencil");
  }

  function handleAnnotationDraftDepthChange(depth: number) {
    updateAnnotationDraft({ depth });
    setActiveTool("pencil");
  }

  async function handlePickAnnotationColorFromScreen() {
    if (typeof window === "undefined" || typeof window.EyeDropper !== "function") return;
    try {
      const eyeDropper = new window.EyeDropper();
      const result = await eyeDropper.open();
      handleAnnotationDraftColorChange(result.sRGBHex);
      handleAnnotationDraftColorCommit(result.sRGBHex);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      console.warn("Failed to pick annotation color.", error);
    }
  }

  function persistHistorySnapshot(presentState: ViewerStateV1, committedAt: number = Date.now()) {
    if (!isSerializableLayerTree(presentState.scene.layerTree)) {
      clearPersistedViewerHistory();
      return;
    }

    const serializablePast = pastStatesRef.current.filter((entry) =>
      isSerializableLayerTree(entry.state.scene.layerTree)
    );
    const serializableFuture = futureStatesRef.current.filter((entry) =>
      isSerializableLayerTree(entry.state.scene.layerTree)
    );

    savePersistedViewerHistory({
      version: 2,
      past: serializablePast,
      present: createViewerHistoryEntry(presentState, committedAt),
      future: serializableFuture,
    });
  }

  function flushPendingAutoCommit() {
    if (autoCommitTimeoutRef.current === null) return;

    window.clearTimeout(autoCommitTimeoutRef.current);
    autoCommitTimeoutRef.current = null;

    if (currentViewerHash === lastCommittedHashRef.current) {
      return;
    }

    const committed = lastCommittedStateRef.current;
    if (committed) {
      pastStatesRef.current = clampHistoryStack([
        ...pastStatesRef.current,
        createViewerHistoryEntry(committed),
      ]);
    }

    futureStatesRef.current = [];
    lastCommittedStateRef.current = currentViewerState;
    lastCommittedHashRef.current = currentViewerHash;
    persistHistorySnapshot(currentViewerState);
    bumpHistoryRevision();
  }

  function applyViewerState(
    nextState: ViewerStateV1,
    options?: { suppressAutoCommit?: boolean; syncCamera?: boolean }
  ) {
    if (options?.suppressAutoCommit) {
      suppressNextAutoCommitRef.current = true;
    }

    setActiveTool(nextState.scene.activeTool);
    setSelectedNodeId(nextState.scene.selectedNodeId);
    setLayerTree(nextState.scene.layerTree);
    setSliceVolumeLayerId(nextState.ui.sliceVolumeLayerId ?? "");
    setSliceName(nextState.ui.sliceName ?? "");
	    setSliceParamsDraft(nextState.ui.sliceParamsDraft);
	    setIsLayerPanelCollapsed(nextState.layout.layerPanelCollapsed);
	    setIsInspectorCollapsed(nextState.layout.inspectorCollapsed ?? false);
	    setFloatingWindows(nextState.layout.windows ?? []);
	    nextFloatingWindowZRef.current = getMaxFloatingWindowZ(nextState.layout.windows ?? []);
	    setCameraState(nextState.camera);
	    setAutomationPipelines(nextState.automation.pipelines);
	    setAutomationCustomTools(nextState.automation.customTools ?? []);
    if (options?.syncCamera !== false) {
      setCameraSyncKey((value) => value + 1);
    }
    setStateError(null);
    setStateShareMessage(null);
    return nextState;
  }

  function applyHistoricalViewerState(nextState: ViewerStateV1) {
    return applyViewerState(nextState, {
      suppressAutoCommit: true,
      syncCamera: true,
    });
  }

  function commitCurrentStateNow(nextState: ViewerStateV1) {
    const nextHash = hashViewerStateForHistory(nextState);
    const committed = lastCommittedStateRef.current;

    if (committed && nextHash === lastCommittedHashRef.current) {
      return applyViewerState(nextState, { suppressAutoCommit: true });
    }

    if (committed) {
      pastStatesRef.current = clampHistoryStack([...pastStatesRef.current, createViewerHistoryEntry(committed)]);
    }

    futureStatesRef.current = [];
    lastCommittedStateRef.current = nextState;
    lastCommittedHashRef.current = nextHash;
    bumpHistoryRevision();
    persistHistorySnapshot(nextState);
    return applyViewerState(nextState, { suppressAutoCommit: true });
  }

  function applyViewerStatePatch(patch: ViewerStatePatchV1) {
    const nextState = mergeViewerState(currentViewerState, patch);
    return commitCurrentStateNow(nextState);
  }

  function buildAutomationSelectionContext(
    nodeId: string | null,
    extras?: Pick<AutomationSelectionContext, "previousViewerState" | "keyboardEvent" | "stateChange">
  ): AutomationSelectionContext {
    const node = nodeId ? findNodeById(layerTree, nodeId) : null;
    return {
      selectedNodeId: nodeId,
      selectedNodeKind: node?.kind ?? null,
      selectedLayerType: node?.kind === "layer" ? node.type : null,
      selectedAnnotationMetadata:
        node?.kind === "layer" && node.type === "annotation" ? node.annotation?.metadata ?? "" : null,
      selectedLayer: node?.kind === "layer" ? node : null,
      viewerState: currentViewerState,
      previousViewerState: extras?.previousViewerState,
      keyboardEvent: extras?.keyboardEvent ?? null,
      stateChange: extras?.stateChange ?? null,
    };
  }

  async function executeAutomationCommands(commands: AutomationAppCommand[], context: AutomationSelectionContext) {
    for (const command of commands) {
      if (command.type === "inspector.expand") {
        suppressNextStateAutomationRef.current = true;
        setIsInspectorCollapsed(false);
      }
      if (command.type === "inspector.collapse") {
        suppressNextStateAutomationRef.current = true;
        setIsInspectorCollapsed(true);
      }
      if (command.type === "metadata.openSelectedAnnotation" && context.selectedNodeId) {
        const node = findNodeById(layerTree, context.selectedNodeId);
        if (node?.kind === "layer" && node.type === "annotation") {
          openMetadataWindowForLayer(node);
        }
      }
      if (command.type === "metadata.previewSelectedAnnotation" && context.selectedNodeId) {
        const node = findNodeById(layerTree, context.selectedNodeId);
        if (node?.kind === "layer" && node.type === "annotation") {
          openMetadataWindowForLayer(node, { mode: "preview", reuseMetadataWindow: true });
        }
      }
      if (command.type === "compute.browserFunction") {
        try {
          const result = await runBrowserAutomationCode(command.code, {
            selection: context,
            data: command.input,
          });
          enqueueToast({
            tone: "success",
            title: command.label,
            message: formatBrowserAutomationResult(result).slice(0, 220),
          });
        } catch (error) {
          enqueueToast({
            tone: "error",
            title: command.label,
            message: error instanceof Error ? error.message : "Browser code failed.",
          });
        }
      }
      if (command.type === "external.httpRequest") {
        enqueueToast({
          tone: "info",
          title: command.label,
          message: "HTTP routing is modeled in the graph and will be wired to local/remote services next.",
        });
      }
      if (command.type === "viewer.setLayerVisibility" && command.targetLayerId) {
        suppressNextStateAutomationRef.current = true;
        setLayerTree((prev) => setNodeVisibleState(prev, command.targetLayerId!, command.visible !== false));
      }
      if (command.type === "viewer.selectLayer" && command.targetLayerId) {
        suppressNextStateAutomationRef.current = true;
        setSelectedNodeId(command.targetLayerId);
        setSelectedNodeIdsExternal([command.targetLayerId]);
      }
      if (command.type === "viewer.setSelectedLayerVisibility" && context.selectedNodeId) {
        suppressNextStateAutomationRef.current = true;
        setLayerTree((prev) => setNodeVisibleState(prev, context.selectedNodeId!, command.visible !== false));
      }
      if (command.type === "viewer.toggleSelectedLayerVisibility" && context.selectedNodeId) {
        const currentNode = findNodeById(layerTree, context.selectedNodeId);
        const nextVisible = !(currentNode?.visible !== false);
        suppressNextStateAutomationRef.current = true;
        setLayerTree((prev) => setNodeVisibleState(prev, context.selectedNodeId!, nextVisible));
      }
      if (command.type === "viewer.setSelectedOpacity") {
        suppressNextStateAutomationRef.current = true;
        updateSelectedNodeOpacity(command.opacity ?? 1);
      }
      if (command.type === "viewer.soloSelectedLayer" && context.selectedNodeId) {
        suppressNextStateAutomationRef.current = true;
        setLayerTree((prev) => setAllNodesVisibilityExcept(prev, context.selectedNodeId!));
      }
      if (command.type === "layer.showGroup" && command.targetGroupId) {
        suppressNextStateAutomationRef.current = true;
        setLayerTree((prev) => setGroupVisibilityByTarget(prev, command.targetGroupId!, true));
      }
      if (command.type === "layer.hideGroup" && command.targetGroupId) {
        suppressNextStateAutomationRef.current = true;
        setLayerTree((prev) => setGroupVisibilityByTarget(prev, command.targetGroupId!, false));
      }
      if (command.type === "camera.reset") {
        suppressNextStateAutomationRef.current = true;
        applyAutomationCameraPreset("default");
      }
      if (command.type === "camera.setPreset") {
        suppressNextStateAutomationRef.current = true;
        applyAutomationCameraPreset(command.preset ?? "default");
      }
      if (command.type === "camera.setPose") {
        suppressNextStateAutomationRef.current = true;
        applyAutomationCameraPose(command.poseJson);
      }
      if (command.type === "camera.focusSelection") {
        suppressNextStateAutomationRef.current = true;
        handleRequestFocusSelectedLayer();
      }
      if (command.type === "slice.setPlane") {
        suppressNextStateAutomationRef.current = true;
        applyAutomationSlicePlane(command.plane ?? "xy");
      }
      if (command.type === "slice.stepIndex") {
        suppressNextStateAutomationRef.current = true;
        stepAutomationSliceIndex(command.stepDelta ?? 1);
      }
      if (command.type === "slice.setIndex" && typeof command.sliceIndex === "number") {
        suppressNextStateAutomationRef.current = true;
        setAutomationSliceIndex(command.sliceIndex);
      }
      if (command.type === "annotation.setSelectedMetadata" && context.selectedNodeId) {
        const node = findNodeById(layerTree, context.selectedNodeId);
        if (node?.kind === "layer" && node.type === "annotation") {
          suppressNextStateAutomationRef.current = true;
          updateAnnotationLayerById(node.id, { metadata: command.metadataText ?? "" });
        }
      }
      if (command.type === "annotation.appendSelectedMetadata" && context.selectedNodeId) {
        const node = findNodeById(layerTree, context.selectedNodeId);
        if (node?.kind === "layer" && node.type === "annotation") {
          suppressNextStateAutomationRef.current = true;
          const existing = node.annotation?.metadata ?? "";
          const addition = command.metadataText ?? "";
          updateAnnotationLayerById(node.id, { metadata: `${existing}${existing && addition ? "\n" : ""}${addition}` });
        }
      }
      if (command.type === "annotation.selectNextByMetadata") {
        suppressNextStateAutomationRef.current = true;
        selectNextAnnotationByMetadata(command.metadataMode ?? "missing");
      }
      if (command.type === "annotation.setSelectedColor" && context.selectedNodeId && command.color) {
        suppressNextStateAutomationRef.current = true;
        updateAnnotationLayerById(context.selectedNodeId, { color: command.color });
      }
      if (command.type === "notify.toast") {
        enqueueToast({
          tone: command.tone ?? "info",
          title: command.title?.trim() || "Automation",
          message: command.message?.trim() || "Automation ran.",
        });
      }
    }
  }

  function createAutomationNodeRunServices(
    context: AutomationSelectionContext,
    runtime?: { pipelineId?: string; memoryStore?: Map<string, unknown> }
  ): AutomationNodeRunServices {
    const memoryStore = runtime?.memoryStore ?? new Map<string, unknown>();
    const syncDebugMemoryStore = () => {
      setAutomationDebug((current) => ({
        ...current,
        memoryStore: Object.fromEntries(memoryStore.entries()),
      }));
    };
    return {
      openSelectedAnnotationMetadata: (mode, options) => {
        if (!context.selectedNodeId) return;
        const node = findNodeById(layerTree, context.selectedNodeId);
        if (node?.kind === "layer" && node.type === "annotation") {
          openMetadataWindowForLayer(node, { mode, reuseMetadataWindow: options?.reuseExisting });
        }
      },
      expandInspector: () => {
        suppressNextStateAutomationRef.current = true;
        setIsInspectorCollapsed(false);
      },
      collapseInspector: () => {
        suppressNextStateAutomationRef.current = true;
        setIsInspectorCollapsed(true);
      },
      setLayerVisibility: (layerId, visible) =>
      {
        suppressNextStateAutomationRef.current = true;
        setLayerTree((prev) => setNodeVisibleState(prev, layerId, visible));
      },
      selectLayer: (layerId) => {
        suppressNextStateAutomationRef.current = true;
        setSelectedNodeId(layerId);
        setSelectedNodeIdsExternal([layerId]);
      },
      setSelectedLayerVisibility: (visible) => {
        if (!context.selectedNodeId) return;
        suppressNextStateAutomationRef.current = true;
        setLayerTree((prev) => setNodeVisibleState(prev, context.selectedNodeId!, visible));
      },
      toggleSelectedLayerVisibility: () => {
        if (!context.selectedNodeId) return;
        const currentNode = findNodeById(layerTree, context.selectedNodeId);
        const nextVisible = !(currentNode?.visible !== false);
        suppressNextStateAutomationRef.current = true;
        setLayerTree((prev) => setNodeVisibleState(prev, context.selectedNodeId!, nextVisible));
      },
      setSelectedOpacity: (opacity) => {
        suppressNextStateAutomationRef.current = true;
        updateSelectedNodeOpacity(opacity);
      },
      soloSelectedLayer: () => {
        if (!context.selectedNodeId) return;
        suppressNextStateAutomationRef.current = true;
        setLayerTree((prev) => setAllNodesVisibilityExcept(prev, context.selectedNodeId!));
      },
      setGroupVisibility: (groupIdOrName, visible) => {
        if (!groupIdOrName.trim()) return;
        suppressNextStateAutomationRef.current = true;
        setLayerTree((prev) => setGroupVisibilityByTarget(prev, groupIdOrName, visible));
      },
      resetCamera: () => {
        suppressNextStateAutomationRef.current = true;
        applyAutomationCameraPreset("default");
      },
      setCameraPreset: (preset) => {
        suppressNextStateAutomationRef.current = true;
        applyAutomationCameraPreset(preset);
      },
      setCameraPose: (pose) => {
        suppressNextStateAutomationRef.current = true;
        applyAutomationCameraPose(pose);
      },
      focusSelection: () => {
        suppressNextStateAutomationRef.current = true;
        handleRequestFocusSelectedLayer();
      },
      setSlicePlane: (plane) => {
        suppressNextStateAutomationRef.current = true;
        applyAutomationSlicePlane(plane);
      },
      stepSliceIndex: (delta) => {
        suppressNextStateAutomationRef.current = true;
        stepAutomationSliceIndex(delta);
      },
      setSliceIndex: (index) => {
        suppressNextStateAutomationRef.current = true;
        setAutomationSliceIndex(index);
      },
      updateSelectedAnnotationMetadata: (mode, text) => {
        if (!context.selectedNodeId) return;
        const node = findNodeById(layerTree, context.selectedNodeId);
        if (!node || node.kind !== "layer" || node.type !== "annotation") return;
        const existing = node.annotation?.metadata ?? "";
        updateAnnotationLayerById(node.id, {
          metadata: mode === "append" ? `${existing}${existing && text ? "\n" : ""}${text}` : text,
        });
      },
      selectNextAnnotationByMetadata: (mode) => {
        suppressNextStateAutomationRef.current = true;
        selectNextAnnotationByMetadata(mode);
      },
      setSelectedAnnotationColor: (color) => {
        if (!context.selectedNodeId || !color.trim()) return;
        suppressNextStateAutomationRef.current = true;
        updateAnnotationLayerById(context.selectedNodeId, { color });
      },
      getMemory: (key) => memoryStore.get(key),
      setMemory: (key, value) => {
        memoryStore.set(key, value);
        syncDebugMemoryStore();
      },
      clearMemory: (key) => {
        if (key?.trim()) {
          memoryStore.delete(key.trim());
          syncDebugMemoryStore();
          return;
        }
        memoryStore.clear();
        syncDebugMemoryStore();
      },
      delay: async (ms) => {
        await new Promise<void>((resolve) => window.setTimeout(resolve, Math.max(0, ms)));
      },
      debounce: async (nodeId, ms) => {
        const debounceKey = `${runtime?.pipelineId ?? "pipeline"}:${nodeId}`;
        const nextSerial = (automationDebounceSerialRef.current[debounceKey] ?? 0) + 1;
        automationDebounceSerialRef.current[debounceKey] = nextSerial;
        await new Promise<void>((resolve) => window.setTimeout(resolve, Math.max(0, ms)));
        return automationDebounceSerialRef.current[debounceKey] === nextSerial;
      },
      fetchUrl: async (url) => {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Request failed with ${response.status}.`);
        const contentType = response.headers.get("content-type") ?? "";
        return contentType.includes("application/json") ? response.json() : response.text();
      },
      notify: (notice) => enqueueToast(notice),
    };
  }

  function applyAutomationCameraPreset(preset: "default" | "xy" | "xz" | "yz") {
    const next =
      preset === "xy"
        ? { mode: cameraState.mode, position: [0, 0, 5] as [number, number, number], yaw: -90, pitch: -89, fovDeg: 60 }
        : preset === "xz"
        ? { mode: cameraState.mode, position: [0, 5, 0] as [number, number, number], yaw: -90, pitch: 0, fovDeg: 60 }
        : preset === "yz"
        ? { mode: cameraState.mode, position: [5, 0, 0] as [number, number, number], yaw: 180, pitch: 0, fovDeg: 60 }
        : { ...DEFAULT_CAMERA_STATE, mode: cameraState.mode };
    setCameraState(next);
    setCameraSyncKey((value) => value + 1);
  }

  function applyAutomationCameraPose(pose: unknown) {
    if (!pose || typeof pose !== "object") return;
    const candidate = pose as Partial<SerializableCameraState>;
    setCameraState((prev) => ({
      ...prev,
      mode: candidate.mode === "orbit" || candidate.mode === "fly" ? candidate.mode : prev.mode,
      position:
        Array.isArray(candidate.position) &&
        candidate.position.length === 3 &&
        candidate.position.every((value) => typeof value === "number" && Number.isFinite(value))
          ? [candidate.position[0], candidate.position[1], candidate.position[2]]
          : prev.position,
      yaw: typeof candidate.yaw === "number" && Number.isFinite(candidate.yaw) ? candidate.yaw : prev.yaw,
      pitch: typeof candidate.pitch === "number" && Number.isFinite(candidate.pitch) ? candidate.pitch : prev.pitch,
      fovDeg: typeof candidate.fovDeg === "number" && Number.isFinite(candidate.fovDeg) ? candidate.fovDeg : prev.fovDeg,
    }));
    setCameraSyncKey((value) => value + 1);
  }

  function applyAutomationSlicePlane(plane: "xy" | "xz" | "yz") {
    setSliceToolPlane(plane);
    setSliceParamsDraft((prev) => ({ ...prev, plane }));
    const targetLayerId =
      (selectedCanonicalSliceLayer?.id ?? (sliceVolumeLayerId || null));
    if (!targetLayerId) return;
    setLayerTree((prev) =>
      updateNodeById(prev, targetLayerId, (node) =>
        node.kind !== "layer"
          ? node
          : {
              ...node,
              axisSliceState: {
                ...node.axisSliceState,
                activePlane: plane,
              },
            }
      )
    );
  }

  function getActiveAutomationSlicePlane(): "xy" | "xz" | "yz" {
    if (selectedCanonicalSliceLayer?.axisSliceState?.activePlane) {
      return selectedCanonicalSliceLayer.axisSliceState.activePlane;
    }
    if ("plane" in sliceParamsDraft && (sliceParamsDraft.plane === "xy" || sliceParamsDraft.plane === "xz" || sliceParamsDraft.plane === "yz")) {
      return sliceParamsDraft.plane;
    }
    return "xy";
  }

  function setAutomationSliceIndex(index: number) {
    const safeIndex = Math.max(0, Math.trunc(index));
    const activePlane = getActiveAutomationSlicePlane();
    setSliceParamsDraft((prev) =>
      "plane" in prev
        ? {
            ...prev,
            plane: activePlane,
            index: safeIndex,
          }
        : prev
    );
    const targetLayerId = selectedCanonicalSliceLayer?.id ?? (sliceVolumeLayerId || null);
    if (!targetLayerId) return;
    setLayerTree((prev) =>
      updateNodeById(prev, targetLayerId, (node) =>
        node.kind !== "layer"
          ? node
          : {
              ...node,
              axisSliceState: {
                ...node.axisSliceState,
                activePlane,
                [activePlane]: safeIndex,
              },
            }
      )
    );
  }

  function stepAutomationSliceIndex(delta: number) {
    const activePlane = getActiveAutomationSlicePlane();
    const currentIndex =
      selectedCanonicalSliceLayer?.axisSliceState?.[activePlane] ??
      ("plane" in sliceParamsDraft && sliceParamsDraft.plane === activePlane ? sliceParamsDraft.index : 0);
    setAutomationSliceIndex((typeof currentIndex === "number" ? currentIndex : 0) + delta);
  }

  function setAllNodesVisibilityExcept(nodes: LayerTreeNode[], visibleNodeId: string): LayerTreeNode[] {
    return nodes.map((node) => {
      if (node.kind === "group") {
        return {
          ...node,
          visible: true,
          children: setAllNodesVisibilityExcept(node.children, visibleNodeId),
        };
      }
      return {
        ...node,
        visible: node.id === visibleNodeId,
      };
    });
  }

  function setGroupVisibilityByTarget(
    nodes: LayerTreeNode[],
    groupIdOrName: string,
    visible: boolean
  ): LayerTreeNode[] {
    const target = groupIdOrName.trim().toLowerCase();
    function setNodeVisibleDeep(node: LayerTreeNode): LayerTreeNode {
      if (node.kind === "group") {
        return {
          ...node,
          visible,
          children: node.children.map(setNodeVisibleDeep),
        };
      }
      return { ...node, visible };
    }
    return nodes.map((node) => {
      if (node.kind === "group") {
        const matches = node.id.toLowerCase() === target || node.name.trim().toLowerCase() === target;
        if (matches) return setNodeVisibleDeep(node);
        return {
          ...node,
          children: setGroupVisibilityByTarget(node.children, groupIdOrName, visible),
        };
      }
      return node;
    });
  }

  function selectNextAnnotationByMetadata(mode: "missing" | "present") {
    const annotationLayers = allLayers.filter((layer) => layer.type === "annotation");
    if (!annotationLayers.length) return;
    const matches = annotationLayers.filter((layer) => {
      const hasMetadata = !!layer.annotation?.metadata?.trim();
      return mode === "missing" ? !hasMetadata : hasMetadata;
    });
    if (!matches.length) return;
    const currentIndex = matches.findIndex((layer) => layer.id === selectedNodeId);
    const next = matches[(currentIndex + 1 + matches.length) % matches.length] ?? matches[0];
    if (!next) return;
    setSelectedNodeId(next.id);
    setSelectedNodeIdsExternal([next.id]);
    void runAutomationForSelection(next.id);
  }

  function getSelectionAutomationEvents(context: AutomationSelectionContext): AutomationEventName[] {
    if (!context.selectedNodeId) return ["selection.cleared", "selection.changed"];
    if (context.selectedLayerType === "annotation") return ["annotation.selected", "selection.changed"];
    return ["selection.changed"];
  }

  async function runAutomationForEventContext(
    eventName: AutomationEventName,
    context: AutomationSelectionContext,
    options?: { manual?: boolean }
  ) {
    const routedPipelines = automationPipelines.filter(
      (pipeline) =>
        pipeline.active &&
        pipeline.autoRun &&
        pipeline.connections.length > 0 &&
        pipeline.nodes.some((node) => node.token === eventName)
    );
    let routedCommandCount = 0;
    for (const pipeline of routedPipelines) {
      initializeAutomationDebug(pipeline);
      const result = await runRoutedAutomationPipeline(pipeline, context, { eventName });
      routedCommandCount += result.executedCount;
      patchAutomationDebug({
        running: false,
        paused: false,
        activeNodeId: null,
        activeConnectionId: null,
        pausedNodeId: null,
      });
    }
    const results = automationPipelines
      .filter((pipeline) => pipeline.connections.length === 0)
      .map((pipeline) => {
        const parsed = parseAutomationScript(pipeline.script);
        return parsed.eventNames.includes(eventName) ? runAutomationPipelineForEvent(pipeline, eventName, context) : null;
      })
      .filter((result): result is AutomationRunResult => !!result);
    const commands = results.flatMap((result) => result.commands);
    if (commands.length) {
      await executeAutomationCommands(commands, context);
      if (options?.manual) {
        enqueueToast({
          tone: "success",
          title: "Automation ran",
          message: `Ran ${commands.length} action${commands.length === 1 ? "" : "s"}.`,
        });
      }
    } else if (options?.manual && !routedCommandCount) {
      enqueueToast({
        tone: "info",
        title: "Automation skipped",
        message: "No active pipeline matched this event.",
      });
    }
  }

  async function runAutomationForSelection(nodeId: string | null, options?: { manual?: boolean }) {
    const context = buildAutomationSelectionContext(nodeId);
    const triggeredEvents = getSelectionAutomationEvents(context);
    let matched = false;
    for (const eventName of triggeredEvents) {
      const hasMatch = automationPipelines.some((pipeline) => {
        if (!pipeline.active || !pipeline.autoRun) return false;
        if (pipeline.connections.length > 0) {
          return pipeline.nodes.some((node) => node.token === eventName);
        }
        return parseAutomationScript(pipeline.script).eventNames.includes(eventName);
      });
      if (!hasMatch) continue;
      matched = true;
      await runAutomationForEventContext(eventName, context, options);
      if (!options?.manual) break;
    }
    if (options?.manual && !matched) {
      enqueueToast({
        tone: "info",
        title: "Automation skipped",
        message: "No active pipeline matched the current selection.",
      });
    }
  }

  useEffect(() => {
    function handleAutomationKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable)
      ) {
        return;
      }
      const hasKeyboardPipeline = automationPipelines.some(
        (pipeline) =>
          pipeline.active &&
          pipeline.autoRun &&
          (pipeline.connections.length > 0
            ? pipeline.nodes.some((node) => node.token === "keyboard.keyDown")
            : parseAutomationScript(pipeline.script).eventNames.includes("keyboard.keyDown"))
      );
      if (!hasKeyboardPipeline) return;
      void runAutomationForEventContext(
        "keyboard.keyDown",
        buildAutomationSelectionContext(selectedNodeId, {
          keyboardEvent: {
            key: event.key,
            code: event.code,
            altKey: event.altKey,
            ctrlKey: event.ctrlKey,
            metaKey: event.metaKey,
            shiftKey: event.shiftKey,
          },
        })
      );
    }

    window.addEventListener("keydown", handleAutomationKeyDown);
    return () => window.removeEventListener("keydown", handleAutomationKeyDown);
  }, [automationPipelines, selectedNodeId, currentViewerState]);

  useEffect(() => {
    const previous = previousViewerStateForAutomationRef.current;
    previousViewerStateForAutomationRef.current = currentViewerState;
    if (!previous) return;
    if (suppressNextStateAutomationRef.current) {
      suppressNextStateAutomationRef.current = false;
      return;
    }
    const stateChange = summarizeViewerStateChange(previous, currentViewerState);
    if (!stateChange.changedPaths.length) return;
    const hasStateChangePipeline = automationPipelines.some(
      (pipeline) =>
        pipeline.active &&
        pipeline.autoRun &&
        (pipeline.connections.length > 0
          ? pipeline.nodes.some((node) => node.token === "viewer.stateChanged")
          : parseAutomationScript(pipeline.script).eventNames.includes("viewer.stateChanged"))
    );
    if (!hasStateChangePipeline) return;
    void runAutomationForEventContext(
      "viewer.stateChanged",
      buildAutomationSelectionContext(currentViewerState.scene.selectedNodeId, {
        previousViewerState: previous,
        stateChange,
      })
    );
  }, [automationPipelines, currentViewerState]);

  function summarizeViewerStateChange(previous: ViewerStateV1, next: ViewerStateV1) {
    const changedPaths: string[] = [];
    const details: string[] = [];

    if (previous.camera.mode !== next.camera.mode) {
      changedPaths.push("camera.mode");
      details.push(`Camera mode: ${previous.camera.mode} -> ${next.camera.mode}`);
    }
    if (JSON.stringify(previous.camera.position) !== JSON.stringify(next.camera.position)) {
      changedPaths.push("camera.position");
      details.push(`Camera position changed to [${next.camera.position.join(", ")}]`);
    }
    if (previous.camera.yaw !== next.camera.yaw || previous.camera.pitch !== next.camera.pitch) {
      changedPaths.push("camera.orientation");
      details.push(`Camera orientation changed to yaw ${next.camera.yaw}, pitch ${next.camera.pitch}`);
    }
    if (previous.camera.fovDeg !== next.camera.fovDeg) {
      changedPaths.push("camera.fovDeg");
      details.push(`Camera zoom changed to ${next.camera.fovDeg}deg`);
    }
    if (previous.scene.activeTool !== next.scene.activeTool) {
      changedPaths.push("scene.activeTool");
      details.push(`Active tool: ${previous.scene.activeTool} -> ${next.scene.activeTool}`);
    }
    if (previous.scene.selectedNodeId !== next.scene.selectedNodeId) {
      changedPaths.push("scene.selectedNodeId");
      details.push(`Selection: ${previous.scene.selectedNodeId ?? "none"} -> ${next.scene.selectedNodeId ?? "none"}`);
    }
    if (JSON.stringify(previous.scene.layerTree) !== JSON.stringify(next.scene.layerTree)) {
      changedPaths.push("scene.layerTree");
      details.push("Layer tree changed");
    }
    if (previous.layout.layerPanelCollapsed !== next.layout.layerPanelCollapsed) {
      changedPaths.push("layout.layerPanelCollapsed");
      details.push(`Layer panel ${next.layout.layerPanelCollapsed ? "collapsed" : "expanded"}`);
    }
    if (previous.layout.inspectorCollapsed !== next.layout.inspectorCollapsed) {
      changedPaths.push("layout.inspectorCollapsed");
      details.push(`Inspector ${next.layout.inspectorCollapsed ? "collapsed" : "expanded"}`);
    }
    if ((previous.layout.windows?.length ?? 0) !== (next.layout.windows?.length ?? 0)) {
      changedPaths.push("layout.windows");
      details.push(`Window count: ${previous.layout.windows?.length ?? 0} -> ${next.layout.windows?.length ?? 0}`);
    }
    if (previous.ui.sliceVolumeLayerId !== next.ui.sliceVolumeLayerId) {
      changedPaths.push("ui.sliceVolumeLayerId");
      details.push(`Slice volume layer changed to ${next.ui.sliceVolumeLayerId || "none"}`);
    }
    if (previous.ui.sliceName !== next.ui.sliceName) {
      changedPaths.push("ui.sliceName");
      details.push(`Slice name: ${previous.ui.sliceName || "none"} -> ${next.ui.sliceName || "none"}`);
    }
    if (JSON.stringify(previous.ui.sliceParamsDraft) !== JSON.stringify(next.ui.sliceParamsDraft)) {
      changedPaths.push("ui.sliceParamsDraft");
      details.push("Slice parameters changed");
    }
    if (JSON.stringify(previous.automation.pipelines) !== JSON.stringify(next.automation.pipelines)) {
      changedPaths.push("automation.pipelines");
      details.push("Automation pipelines changed");
    }
    if (JSON.stringify(previous.automation.customTools ?? []) !== JSON.stringify(next.automation.customTools ?? [])) {
      changedPaths.push("automation.customTools");
      details.push("Automation tools changed");
    }

    return {
      summary: details[0] ?? "Viewer state changed.",
      details,
      changedPaths,
    };
  }

  async function runAutomationPipeline(pipeline: AutomationPipeline): Promise<{ status: "success" | "error" | "stopped" | "info" }> {
    const context = buildAutomationSelectionContext(selectedNodeId);
    if (pipeline.connections.length > 0) {
      initializeAutomationDebug(pipeline);
      const issues = validateAutomationPipelineRuntime(pipeline);
      const error = issues.find((issue) => issue.level === "error");
      if (error) {
        patchAutomationDebug({ running: false, paused: false, activeNodeId: null, activeConnectionId: null, pausedNodeId: null });
        enqueueToast({
          tone: "error",
          title: pipeline.name,
          message: error.message,
        });
        return { status: "error" };
      }
      const routedResult = await runRoutedAutomationPipeline(pipeline, context, { eventName: "manual.trigger" });
      patchAutomationDebug({
        running: false,
        paused: false,
        activeNodeId: null,
        activeConnectionId: null,
        pausedNodeId: null,
      });
      enqueueToast({
        tone: routedResult.status === "error" ? "error" : routedResult.status === "stopped" ? "info" : routedResult.executedCount ? "success" : "info",
        title: pipeline.name,
        message: routedResult.message,
      });
      return { status: routedResult.status === "success" ? (routedResult.executedCount ? "success" : "info") : routedResult.status };
    }

    const result = runAutomationPipelineForEvent(pipeline, "selection.changed", context);
    await executeAutomationCommands(result.commands, context);
    enqueueToast({
      tone: result.commands.length ? "success" : "info",
      title: result.pipelineName,
      message: result.message,
    });
    return { status: result.commands.length ? "success" : "info" };
  }

  function initializeAutomationDebug(pipeline: AutomationPipeline) {
    automationDebugStopRequestedRef.current = false;
    const nodeStates = Object.fromEntries(
      pipeline.nodes.map((node) => [node.id, { status: "idle" as const }])
    );
    const connectionStates = Object.fromEntries(
      pipeline.connections.map((connection) => [connection.id, "idle" as const])
    );
    setAutomationDebug({
      pipelineId: pipeline.id,
      running: true,
      paused: false,
      activeNodeId: null,
      activeConnectionId: null,
      nodeStates,
      connectionStates,
      connectionPackets: {},
      memoryStore: {},
      pausedNodeId: null,
    });
  }

  function patchAutomationDebug(patch: Partial<AutomationDebugSnapshot>) {
    setAutomationDebug((current) => ({
      ...current,
      ...patch,
      nodeStates: patch.nodeStates ?? current.nodeStates,
      connectionStates: patch.connectionStates ?? current.connectionStates,
      connectionPackets: patch.connectionPackets ?? current.connectionPackets,
    }));
  }

  function updateAutomationDebugNode(
    nodeId: string,
    patch: Partial<AutomationDebugSnapshot["nodeStates"][string]>
  ) {
    setAutomationDebug((current) => ({
      ...current,
      activeNodeId: patch.status === "running" || patch.status === "paused" ? nodeId : current.activeNodeId,
      nodeStates: {
        ...current.nodeStates,
        [nodeId]: {
          ...(current.nodeStates[nodeId] ?? { status: "idle" }),
          ...patch,
        },
      },
    }));
  }

  function updateAutomationDebugConnection(
    connectionId: string,
    status: AutomationDebugSnapshot["connectionStates"][string],
    packet?: AutomationPacket
  ) {
    setAutomationDebug((current) => ({
      ...current,
      activeConnectionId: status === "active" ? connectionId : current.activeConnectionId,
      connectionStates: {
        ...current.connectionStates,
        [connectionId]: status,
      },
      connectionPackets: packet
        ? {
            ...current.connectionPackets,
            [connectionId]: packet,
          }
        : current.connectionPackets,
    }));
  }

  async function waitForAutomationDebugResume(nodeId: string) {
    patchAutomationDebug({ paused: true, pausedNodeId: nodeId, activeNodeId: nodeId });
    updateAutomationDebugNode(nodeId, { status: "paused" });
    await new Promise<void>((resolve) => {
      automationDebugResumeRef.current = resolve;
    });
    automationDebugResumeRef.current = null;
    patchAutomationDebug({ paused: false, pausedNodeId: null });
    return automationDebugStopRequestedRef.current ? "stop" : "resume";
  }

  function resumeAutomationDebug() {
    automationDebugResumeRef.current?.();
  }

  function stopAutomationDebug() {
    automationDebugStopRequestedRef.current = true;
    patchAutomationDebug({
      paused: false,
      pausedNodeId: null,
      activeConnectionId: null,
    });
    automationDebugResumeRef.current?.();
  }

  async function runRoutedAutomationPipeline(
    pipeline: AutomationPipeline,
    context: AutomationSelectionContext,
    options?: { eventName?: AutomationEventName }
  ): Promise<{ executedCount: number; message: string; status: "success" | "error" | "stopped" }> {
    const incomingByNode = new Map<string, typeof pipeline.connections>();
    const outgoingByNode = new Map<string, typeof pipeline.connections>();
    pipeline.connections.forEach((connection) => {
      incomingByNode.set(connection.toNodeId, [
        ...(incomingByNode.get(connection.toNodeId) ?? []),
        connection,
      ]);
      outgoingByNode.set(connection.fromNodeId, [
        ...(outgoingByNode.get(connection.fromNodeId) ?? []),
        connection,
      ]);
    });

    const nodeById = new Map(pipeline.nodes.map((node) => [node.id, node]));
    const outputByPort = new Map<string, AutomationPacket>();
    const availableRootNodes = pipeline.nodes
      .filter((node) => !(incomingByNode.get(node.id)?.length))
      .sort((a, b) => a.x - b.x || a.y - b.y);
    const eventRootNodes = options?.eventName
      ? availableRootNodes.filter((node) => node.token === options.eventName)
      : [];
    const rootNodes =
      options?.eventName === "manual.trigger" && eventRootNodes.length === 0
        ? availableRootNodes
        : options?.eventName
        ? eventRootNodes
        : availableRootNodes;
    const runtimeServices = createAutomationNodeRunServices(context, {
      pipelineId: pipeline.id,
      memoryStore: new Map<string, unknown>(),
    });
    const queue: AutomationNode[] = [...rootNodes];
    const executed = new Set<string>();
    let executedCount = 0;
    rootNodes.forEach((node) => updateAutomationDebugNode(node.id, { status: "queued" }));

    while (queue.length && executedCount < 100) {
      if (automationDebugStopRequestedRef.current) {
        return {
          executedCount,
          status: "stopped",
          message: executedCount
            ? `Execution stopped after ${executedCount} node${executedCount === 1 ? "" : "s"}.`
            : "Execution stopped.",
        };
      }
      const node = queue.shift();
      if (!node || executed.has(node.id)) continue;
      const incoming = incomingByNode.get(node.id) ?? [];
      const inputPacket = buildAutomationNodeInputPacket(incoming, outputByPort, context);
      const inputData = inputPacket.value;
      if (node.config?.breakpoint) {
        updateAutomationDebugNode(node.id, { status: "paused", input: inputPacket, output: undefined, error: undefined });
        const resumeMode = await waitForAutomationDebugResume(node.id);
        if (resumeMode === "stop" || automationDebugStopRequestedRef.current) {
          updateAutomationDebugNode(node.id, { status: "idle" });
          return {
            executedCount,
            status: "stopped",
            message: executedCount
              ? `Execution stopped after ${executedCount} node${executedCount === 1 ? "" : "s"}.`
              : "Execution stopped before the next node ran.",
          };
        }
      }
      const startedAt = performance.now();
      updateAutomationDebugNode(node.id, { status: "running", input: inputPacket, output: undefined, error: undefined });
      let output: unknown;
      let outputValue: unknown;
      try {
        output = await executeRoutedAutomationNode(node, inputData, context, runtimeServices);
        executed.add(node.id);
        executedCount += 1;
        outputValue = isAutomationNodeRunOutput(output) ? output.value : output;
        const portOutputs = buildAutomationNodeOutputPackets(node, output);
        Object.entries(portOutputs).forEach(([portId, packet]) => {
          outputByPort.set(getAutomationPortKey(node.id, portId), packet);
        });
        updateAutomationDebugNode(node.id, {
          status: output === undefined ? "skipped" : "success",
          output: { value: outputValue, ports: portOutputs },
          durationMs: Math.round(performance.now() - startedAt),
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Node execution failed.";
        updateAutomationDebugNode(node.id, {
          status: "error",
          input: inputData,
          error: message,
          durationMs: Math.round(performance.now() - startedAt),
        });
        patchAutomationDebug({ running: false, paused: false, activeNodeId: node.id, pausedNodeId: null });
        return { executedCount, message, status: "error" };
      }
      if (output === undefined) continue;

      (outgoingByNode.get(node.id) ?? []).forEach((connection) => {
        const next = nodeById.get(connection.toNodeId);
        const packet = outputByPort.get(getAutomationPortKey(connection.fromNodeId, connection.fromPortId));
        if (next && packet && !executed.has(next.id)) {
          updateAutomationDebugConnection(connection.id, "active", packet);
          window.setTimeout(() => updateAutomationDebugConnection(connection.id, "success"), 420);
          updateAutomationDebugNode(next.id, { status: "queued" });
          queue.push(next);
        }
      });
    }

    if (executedCount >= 100) {
      return { executedCount, message: "Pipeline stopped after 100 nodes to avoid a loop.", status: "stopped" };
    }

    return {
      executedCount,
      status: "success",
      message: executedCount
        ? `Manual root ran ${executedCount} node${executedCount === 1 ? "" : "s"}.`
        : "No routed nodes were available to run.",
    };
  }

  async function executeRoutedAutomationNode(
    node: AutomationNode,
    inputData: unknown,
    context: AutomationSelectionContext,
    services: AutomationNodeRunServices
  ): Promise<unknown> {
    return runRegisteredAutomationNode({
      node,
      input: inputData,
      context,
      services,
    });
  }

  function getAutomationPortKey(nodeId: string, portId: string | undefined) {
    return `${nodeId}:${portId ?? "__default"}`;
  }

  function createAutomationPacket(
    type: AutomationPacket["type"],
    value: unknown,
    meta?: Record<string, unknown>
  ): AutomationPacket {
    return { type, value, meta };
  }

  function buildAutomationNodeInputPacket(
    incoming: AutomationPipeline["connections"],
    outputByPort: Map<string, AutomationPacket>,
    context: AutomationSelectionContext
  ): AutomationPacket {
    const packets = incoming
      .map((connection) => ({
        connectionId: connection.id,
        toPortId: connection.toPortId ?? "input",
        packet: outputByPort.get(getAutomationPortKey(connection.fromNodeId, connection.fromPortId)),
      }))
      .filter((item): item is { connectionId: string; toPortId: string; packet: AutomationPacket } => !!item.packet);

    if (!packets.length) {
      return createAutomationPacket("selection", { selection: context }, { source: "runtime.root" });
    }

    const dataPackets = packets.filter((item) => item.packet.type !== "trigger");
    const selectedPackets = dataPackets.length ? dataPackets : packets;
    const value =
      selectedPackets.length === 1
        ? selectedPackets[0].packet.value
        : Object.fromEntries(selectedPackets.map((item) => [item.toPortId, item.packet.value]));

    return createAutomationPacket(selectedPackets.length === 1 ? selectedPackets[0].packet.type : "json", value, {
      ports: Object.fromEntries(packets.map((item) => [item.toPortId, item.packet])),
    });
  }

  function buildAutomationNodeOutputPackets(node: AutomationNode, value: unknown): Record<string, AutomationPacket> {
    if (value === undefined) return {};
    if (isAutomationNodeRunOutput(value)) return value.outputs;
    const outputs: Record<string, AutomationPacket> = {};
    node.outputs.forEach((port) => {
      const type = mapAutomationPortDataTypeToPacketType(port.dataType);
      outputs[port.id] = createAutomationPacket(type, value, {
        nodeId: node.id,
        portId: port.id,
        portLabel: port.label,
      });
    });
    return outputs;
  }

  function mapAutomationPortDataTypeToPacketType(dataType: AutomationNode["outputs"][number]["dataType"]): AutomationPacket["type"] {
    if (dataType === "viewer-state") return "viewer-state";
    if (dataType === "layer") return "layer";
    if (dataType === "file") return "file";
    if (dataType === "url") return "url";
    if (dataType === "json") return "json";
    if (dataType === "trigger") return "trigger";
    return "any";
  }

  function buildHistoryDebugLabel() {
    return `${pastStatesRef.current.length}:${futureStatesRef.current.length}:${VIEWER_HISTORY_STORAGE_KEY}`;
  }
  function handleShortcutBindingChange(commandId: ShortcutCommandId, combo: string | null) {
    setShortcutBindings((prev) => updateShortcutBindingUnique(prev, commandId, combo));
  }

  function handleResetSingleShortcut(commandId: ShortcutCommandId) {
    setShortcutBindings((prev) => resetSingleShortcutBinding(commandId, prev));
  }

  function handleResetAllShortcuts() {
    setShortcutBindings(resetShortcutBindings());
  }

  function openViewerLibrary(
    mode: "browse" | "save" = "browse",
    options?: { preserveFeedback?: boolean }
  ) {
    if (!options?.preserveFeedback) {
      setLibraryError(null);
      setLibraryMessage(null);
    }
    setViewerLibraryMode(mode);
    setActiveTool("library");
    setIsAppMenuOpen(false);
  }

  function requestNewSavedViewerFlow() {
    if (!isSerializableLayerTree(currentViewerState.scene.layerTree)) {
      setLibraryMessage(null);
      setLibraryError("This viewer contains layers that cannot be saved locally.");
      openViewerLibrary("browse", { preserveFeedback: true });
      return;
    }

    openViewerLibrary("save");
  }

  function handlePrimarySaveAction() {
    const targetId = resolveOwnedSavedViewerId(activeSavedViewerId, viewerLibrary);
    if (!targetId) {
      requestNewSavedViewerFlow();
      return;
    }

    handleOverwriteSavedViewer(targetId);
  }

  function shouldIgnoreShortcutTarget(target: EventTarget | null): boolean {
    const element = target as HTMLElement | null;
    if (!element) return false;
    if (element.closest("input, textarea, select, [contenteditable='true']")) return true;
    if (element.closest("[data-shortcut-capture='true']")) return true;
    return false;
  }

  function activateAnnotationShortcut(shape: AnnotationShape) {
    setAnnotationDraft((prev) => {
      const sizeByShape: AnnotationShapeSizeMap = {
        ...DEFAULT_ANNOTATION_SHAPE_SIZES,
        ...(prev.sizeByShape ?? DEFAULT_ANNOTATION_SHAPE_SIZES),
      };
      return {
        ...prev,
        shape,
        size: sizeByShape[shape] ?? prev.size ?? DEFAULT_ANNOTATION_SHAPE_SIZES[shape],
        sizeByShape,
      };
    });
    setActiveTool("pencil");
  }

  function executeShortcutCommand(commandId: ShortcutCommandId) {
    switch (commandId) {
      case "saveViewer":
        handlePrimarySaveAction();
        return;
      case "newViewer":
        handleCreateNewViewer();
        return;
      case "openLibrary":
        openViewerLibrary("browse");
        return;
      case "openShareDialog":
        openShareDialog();
        return;
      case "toolMove":
        setActiveTool("mouse");
        return;
      case "toolDraw":
        setActiveTool("pencil");
        return;
      case "toolSlice":
        setActiveTool("slice");
        return;
      case "cameraFly":
        handleCameraModeChange("fly");
        setActiveTool("mouse");
        return;
      case "cameraOrbit":
        handleCameraModeChange("orbit");
        setActiveTool("mouse");
        return;
      case "annotationPoint":
        activateAnnotationShortcut("point");
        return;
      case "annotationLine":
        activateAnnotationShortcut("line");
        return;
      case "annotationRectangle":
        activateAnnotationShortcut("rectangle");
        return;
      case "annotationCircle":
        activateAnnotationShortcut("circle");
        return;
      case "annotationFreehand":
        activateAnnotationShortcut("freehand");
        return;
      case "annotationEraser":
        activateAnnotationShortcut("eraser");
        return;
      case "recenterOrbit":
        handleRequestResetOrbitCenter();
        return;
      case "undo":
        handleUndo();
        return;
      case "redo":
        handleRedo();
        return;
      default:
        return;
    }
  }

  useEffect(() => {
    if (selectedCanonicalSliceLayer) {
      if (sliceVolumeLayerId !== selectedCanonicalSliceLayer.id) {
        setSliceVolumeLayerId(selectedCanonicalSliceLayer.id);
      }
      return;
    }

    if (selectedCustomSliceLayer && hasVolumeLayerId(selectedCustomSliceLayer.source)) {
      const volumeNode = findNodeById(layerTree, selectedCustomSliceLayer.source.volumeLayerId);
      if (volumeNode && isCanonicalSliceBrowsableLayer(volumeNode)) {
        if (sliceVolumeLayerId !== volumeNode.id) {
          setSliceVolumeLayerId(volumeNode.id);
        }
        return;
      }
    }

    const currentSliceVolumeNode = sliceVolumeLayerId
      ? findNodeById(layerTree, sliceVolumeLayerId)
      : null;
    const currentSliceVolumeIsValid = isCanonicalSliceBrowsableLayer(currentSliceVolumeNode);

    if (currentSliceVolumeIsValid) {
      return;
    }

    if (sliceBrowsableLayers.length > 0) {
      setSliceVolumeLayerId(sliceBrowsableLayers[0].id);
      return;
    }

    if (sliceVolumeLayerId !== "") {
      setSliceVolumeLayerId("");
    }
  }, [
    selectedCanonicalSliceLayer,
    selectedCustomSliceLayer,
    sliceVolumeLayerId,
    sliceBrowsableLayers,
    layerTree,
  ]);

  useEffect(() => {
    for (const node of collectAllLayerItems(layerTree)) {
      if (!isVolumeOrientationAdjustableLayer(node)) continue;
      const sourceKey = getVolumeOrientationSourceKey(node);
      if (!sourceKey) continue;
      const preset = getEffectiveVolumeOrientationPresetForLayer(node);
      const existingPreference = loadSourceOrientationPreference(sourceKey);
      saveSourceOrientationPreference(sourceKey, {
        preset,
        axisSliceViewState:
          cloneAxisSliceViewState(
            node.axisSliceViewState ??
              getAxisSliceViewStateForOrientationPreset(preset)
          ) ?? undefined,
        transformPresets: existingPreference?.transformPresets,
      });
    }
    setSourceOrientationRevision((prev) => prev + 1);
  }, [layerTree]);

  useEffect(() => {
    if (hasHydratedHistoryRef.current) return;
    hasHydratedHistoryRef.current = true;

    const stateFromLocation = readInitialStateFromLocation();
    const sharedViewerUrl = getCurrentSharedViewerUrl();
    const persistedSession = loadPersistedViewerSession();
    const persistedHistory = loadPersistedViewerHistory();

    if (stateFromLocation) {
      stopCaptureTimelinePlayback();
      lastCommittedStateRef.current = stateFromLocation;
      lastCommittedHashRef.current = hashViewerStateForHistory(stateFromLocation);
      applyViewerState(stateFromLocation, { suppressAutoCommit: true });
      setCaptureStills([]);
      setActiveCaptureStillId(null);
      setCaptureScenes([]);
      setActiveCaptureSceneId(null);
      setCaptureSequences([]);
      setActiveCaptureSequenceId(null);
      setIsCapturePanelOpen(false);
      setCaptureTimelineCursorMs(0);
      setCaptureTimelineZoom(DEFAULT_CAPTURE_TIMELINE_ZOOM);
      setActiveSavedViewerId(null);
      if (sharedViewerUrl && isSerializableLayerTree(stateFromLocation.scene.layerTree)) {
        setViewerLibrary((prev) =>
          upsertSharedViewerEntry(prev, {
            state: stateFromLocation,
            sourceShareUrl: sharedViewerUrl,
          })
        );
      }
      pastStatesRef.current = [];
      futureStatesRef.current = [];
      setHasPersistedViewerState(true);
      bumpHistoryRevision();
      return;
    }

    const initialState = persistedSession?.state ?? persistedHistory?.present.state ?? currentViewerState;

    if (persistedHistory) {
      pastStatesRef.current = persistedHistory.past;
      futureStatesRef.current = persistedHistory.future;
    }

    if (persistedSession || persistedHistory) {
      stopCaptureTimelinePlayback();
      lastCommittedStateRef.current = initialState;
      lastCommittedHashRef.current = hashViewerStateForHistory(initialState);
      applyViewerState(initialState, { suppressAutoCommit: true });
      setCaptureStills(cloneCaptureScenes(persistedSession?.captureStills ?? []));
      setCaptureScenes(cloneCaptureScenes(persistedSession?.captureScenes ?? []));
      setCaptureSequences((persistedSession?.captureSequences ?? []).map(cloneCaptureSequence));
      setActiveCaptureStillId(
        persistedSession?.captureStills.some((scene) => scene.id === persistedSession.activeCaptureStillId)
          ? persistedSession.activeCaptureStillId ?? null
          : null
      );
      setActiveCaptureSceneId(
        persistedSession?.captureScenes.some((scene) => scene.id === persistedSession.activeCaptureSceneId)
          ? persistedSession.activeCaptureSceneId
          : null
      );
      setActiveCaptureSequenceId(
        persistedSession?.captureSequences?.some((sequence) => sequence.id === persistedSession.activeCaptureSequenceId)
          ? persistedSession.activeCaptureSequenceId ?? null
          : null
      );
      setIsCapturePanelOpen(persistedSession?.isCapturePanelOpen ?? false);
      setCaptureTimelineCursorMs(persistedSession?.captureTimelineCursorMs ?? 0);
      setCaptureTimelineZoom(clampCaptureTimelineZoom(persistedSession?.captureTimelineZoom ?? DEFAULT_CAPTURE_TIMELINE_ZOOM));
      setActiveSavedViewerId(resolveOwnedSavedViewerId(persistedSession?.activeSavedViewerId ?? null, viewerLibrary));
      setHasPersistedViewerState(!!persistedSession || !!persistedHistory);
      bumpHistoryRevision();
      return;
    }

    lastCommittedStateRef.current = currentViewerState;
    lastCommittedHashRef.current = currentViewerHash;
    savePersistedViewerSession({
      version: 8,
      state: currentViewerState,
      activeSavedViewerId: null,
      captureStills: [],
      activeCaptureStillId: null,
      captureScenes: [],
      activeCaptureSceneId: null,
      captureTimelineCursorMs: 0,
      captureTimelineZoom: DEFAULT_CAPTURE_TIMELINE_ZOOM,
      captureSequences: [],
      activeCaptureSequenceId: null,
      isCapturePanelOpen: false,
    });
    setHasPersistedViewerState(true);
    bumpHistoryRevision();
  }, []);

  useEffect(() => {
    if (!hasHydratedHistoryRef.current) return;

    if (suppressNextAutoCommitRef.current) {
      suppressNextAutoCommitRef.current = false;
      lastCommittedStateRef.current = currentViewerState;
      lastCommittedHashRef.current = currentViewerHash;
      return;
    }

    if (currentViewerHash === lastCommittedHashRef.current) return;

    if (autoCommitTimeoutRef.current !== null) {
      window.clearTimeout(autoCommitTimeoutRef.current);
    }

    autoCommitTimeoutRef.current = window.setTimeout(() => {
      const committed = lastCommittedStateRef.current;
      if (committed) {
        pastStatesRef.current = clampHistoryStack([...pastStatesRef.current, createViewerHistoryEntry(committed)]);
      }
      futureStatesRef.current = [];
      lastCommittedStateRef.current = currentViewerState;
      lastCommittedHashRef.current = currentViewerHash;
      persistHistorySnapshot(currentViewerState);
      bumpHistoryRevision();
      autoCommitTimeoutRef.current = null;
    }, 450);

    return () => {
      if (autoCommitTimeoutRef.current !== null) {
        window.clearTimeout(autoCommitTimeoutRef.current);
      }
    };
  }, [currentViewerHash, currentViewerState]);

  useEffect(() => {
    if (!hasHydratedHistoryRef.current) return;

    if (isSerializableLayerTree(currentViewerState.scene.layerTree)) {
      savePersistedViewerSession({
        version: 8,
        state: currentViewerState,
        activeSavedViewerId: resolveOwnedSavedViewerId(activeSavedViewerId, viewerLibrary),
        captureStills: captureStills.map((scene) => ({
          ...scene,
          viewerState:
            scene.viewerState && isSerializableLayerTree(scene.viewerState.scene.layerTree)
              ? scene.viewerState
              : null,
        })),
        activeCaptureStillId:
          captureStills.some((scene) => scene.id === activeCaptureStillId) ? activeCaptureStillId : null,
        captureScenes: captureScenes.map((scene) => ({
          ...scene,
          viewerState:
            scene.viewerState && isSerializableLayerTree(scene.viewerState.scene.layerTree)
              ? scene.viewerState
              : null,
        })),
        activeCaptureSceneId:
          captureScenes.some((scene) => scene.id === activeCaptureSceneId) ? activeCaptureSceneId : null,
        captureTimelineCursorMs,
        captureTimelineZoom,
        captureSequences: captureSequences.map((sequence) => ({
          ...sequence,
          scenes: sequence.scenes.map((scene) => ({
            ...scene,
            viewerState:
              scene.viewerState && isSerializableLayerTree(scene.viewerState.scene.layerTree)
                ? scene.viewerState
                : null,
          })),
        })),
        activeCaptureSequenceId:
          captureSequences.some((sequence) => sequence.id === activeCaptureSequenceId)
            ? activeCaptureSequenceId
            : null,
        isCapturePanelOpen,
      });
      setHasPersistedViewerState(true);
    } else {
      clearPersistedViewerState();
      setHasPersistedViewerState(false);
    }
  }, [
    activeCaptureSceneId,
    activeCaptureSequenceId,
    activeSavedViewerId,
    activeCaptureStillId,
    captureStills,
    captureScenes,
    captureSequences,
    currentViewerState,
    viewerLibrary,
    captureTimelineCursorMs,
    captureTimelineZoom,
    isCapturePanelOpen,
  ]);

  useEffect(() => {
    if (!hasHydratedHistoryRef.current) return;
    if (!activeCaptureSequenceId) return;
    setCaptureSequences((prev) =>
      prev.map((sequence) =>
        sequence.id === activeCaptureSequenceId
          ? {
              ...sequence,
              scenes: cloneCaptureScenes(captureScenes),
              cursorMs: captureTimelineCursorMs,
              zoom: captureTimelineZoom,
              updatedAt: Date.now(),
            }
          : sequence
      )
    );
  }, [activeCaptureSequenceId, captureScenes, captureTimelineCursorMs, captureTimelineZoom]);

  useEffect(() => {
    return () => {
      stopCaptureTimelinePlayback();
    };
  }, []);

  useEffect(() => {
    savePersistedViewerLibrary(viewerLibrary);
  }, [viewerLibrary]);

  useEffect(() => {
    setActiveSavedViewerId((prev) => resolveOwnedSavedViewerId(prev, viewerLibrary));
  }, [viewerLibrary]);

  useEffect(() => {
    saveShortcutBindings(shortcutBindings);
  }, [shortcutBindings]);

  useEffect(() => {
    return () => {
      for (const timeoutId of toastAutoCloseTimeoutsRef.current.values()) {
        window.clearTimeout(timeoutId);
      }
      for (const timeoutId of toastRemovalTimeoutsRef.current.values()) {
        window.clearTimeout(timeoutId);
      }
      toastAutoCloseTimeoutsRef.current.clear();
      toastRemovalTimeoutsRef.current.clear();
      toastDurationsRef.current.clear();
    };
  }, []);


  useEffect(() => {
    if (initializedStartupSlicesRef.current) return;
    if (!startupSlices.length) return;

    setLayerTree((prev) => {
      let next = prev;
      const nextAllLayers = () => collectAllLayerItems(next);

      for (const item of startupSlices) {
        let targetVolumeId: string | null = null;

        if (item.volumeLayerId) {
          const node = findNodeById(next, item.volumeLayerId);
          if (node && isRemoteOmeLayer(node)) {
            targetVolumeId = node.id;
          }
        }

        if (!targetVolumeId && item.volumeUrl) {
          const match = nextAllLayers().find(
            (node) =>
              node.type === "remote" &&
              typeof node.source === "string" &&
              node.source === item.volumeUrl &&
              node.remoteFormat === "ome-zarr"
          );

          if (match) {
            targetVolumeId = match.id;
          }
        }

        if (!targetVolumeId) continue;

        next = [
          ...next,
          {
            id: createId(),
            kind: "layer",
            name: item.name?.trim() || `${item.plane.toUpperCase()} @ ${item.index}`,
            type: "custom-slice",
            visible: true,
            source: { volumeLayerId: targetVolumeId },
            sourceKind: "built-in",
            description: "Startup custom slice",
            sliceParams: {
              mode: "axis",
              plane: item.plane,
              index: item.index,
              opacity: item.opacity ?? 1,
            },
          },
        ];
      }

      return next;
    });

    initializedStartupSlicesRef.current = true;
  }, [startupSlices]);

  useEffect(() => {
    function handleEscapeKey(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      if (event.defaultPrevented) return;
      const closed = closeTopmostOverlay();
      if (!closed) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation?.();
    }

    window.addEventListener("keydown", handleEscapeKey);
    return () => {
      window.removeEventListener("keydown", handleEscapeKey);
    };
  }, [
    activeTool,
    isAppMenuOpen,
    isClearHistoryConfirmOpen,
    isImportPanelOpen,
    isLocalDatasetManagerOpen,
    isShareDialogOpen,
    isAboutDialogOpen,
    isStateDialogOpen,
    isUserProfilePanelOpen,
  ]);

  useEffect(() => {
    const blockingOverlayOpen =
      isUserProfilePanelOpen ||
      isStateDialogOpen ||
      isShareDialogOpen ||
      isAboutDialogOpen ||
      isImportPanelOpen ||
      isLocalDatasetManagerOpen ||
      (activeTool === "library" || activeTool === "pipeline" || activeTool === "assistant");

    function handleKeyDown(event: KeyboardEvent) {
      const hasPrimaryModifier = event.metaKey || event.ctrlKey;
      const lowerKey = event.key.toLowerCase();
      const isHistoryShortcut =
        hasPrimaryModifier &&
        !event.altKey &&
        (lowerKey === "z" || lowerKey === "y");

      if (activeTool === "pipeline" && isHistoryShortcut) {
        if (shouldIgnoreShortcutTarget(event.target)) return;
        event.preventDefault();
        if (lowerKey === "y" || event.shiftKey) {
          handleRedo();
        } else {
          handleUndo();
        }
        return;
      }

      if (blockingOverlayOpen) return;
      if (shouldIgnoreShortcutTarget(event.target)) return;

      if (isCapturePanelOpen && isHistoryShortcut) {
        event.preventDefault();
        if (lowerKey === "y" || event.shiftKey) {
          if (!handleCaptureTimelineRedo()) {
            handleRedo();
          }
        } else if (!handleCaptureTimelineUndo()) {
          handleUndo();
        }
        return;
      }

      if (isCapturePanelOpen && (event.key === "Delete" || event.key === "Backspace")) {
        if (activeCaptureSceneId) {
          event.preventDefault();
          handleDeleteCaptureScene(activeCaptureSceneId);
        }
        return;
      }

      if (event.key === "Delete") {
        if (handleDeleteSelectedNodes()) {
          event.preventDefault();
        }
        return;
      }

      const hasNoSecondaryModifiers = !event.altKey && !event.shiftKey;

      if (hasPrimaryModifier && hasNoSecondaryModifiers && lowerKey === "c") {
        if (handleCopySelectedNodesToClipboard()) {
          event.preventDefault();
        }
        return;
      }

      if (hasPrimaryModifier && hasNoSecondaryModifiers && lowerKey === "v") {
        if (handlePasteCopiedNodes()) {
          event.preventDefault();
        }
        return;
      }

      const match = SHORTCUT_DEFINITIONS.find((definition) =>
        doesShortcutMatchKeyboardEvent(event, shortcutBindings[definition.id])
      );
      if (!match) return;
      event.preventDefault();
      executeShortcutCommand(match.id);
    }

    function handleMouseDown(event: MouseEvent) {
      if (blockingOverlayOpen) return;
      if (shouldIgnoreShortcutTarget(event.target)) return;

      const match = SHORTCUT_DEFINITIONS.find((definition) =>
        doesShortcutMatchMouseEvent(event, shortcutBindings[definition.id])
      );
      if (!match) return;
      event.preventDefault();
      executeShortcutCommand(match.id);
    }

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("mousedown", handleMouseDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("mousedown", handleMouseDown);
    };
  }, [
    shortcutBindings,
    activeTool,
    isImportPanelOpen,
    isLocalDatasetManagerOpen,
    isShareDialogOpen,
    isStateDialogOpen,
    isUserProfilePanelOpen,
    historyRevision,
    isCapturePanelOpen,
    activeCaptureSceneId,
    layerTree,
    selectedNodeId,
    selectedNodeIdsExternal,
  ]);

  function handleUndo() {
    flushPendingAutoCommit();
    if (!pastStatesRef.current.length) return null;

    const previousEntry = pastStatesRef.current[pastStatesRef.current.length - 1];
    const current = currentViewerState;

    pastStatesRef.current = pastStatesRef.current.slice(0, -1);
    futureStatesRef.current = clampHistoryStack([
      createViewerHistoryEntry(current),
      ...futureStatesRef.current,
    ]);
    lastCommittedStateRef.current = previousEntry.state;
    lastCommittedHashRef.current = hashViewerStateForHistory(previousEntry.state);
    persistHistorySnapshot(previousEntry.state, previousEntry.committedAt);
    bumpHistoryRevision();
    return applyHistoricalViewerState(previousEntry.state);
  }

  function handleRedo() {
    flushPendingAutoCommit();
    if (!futureStatesRef.current.length) return null;

    const nextEntry = futureStatesRef.current[0];
    const current = currentViewerState;

    futureStatesRef.current = futureStatesRef.current.slice(1);
    pastStatesRef.current = clampHistoryStack([
      ...pastStatesRef.current,
      createViewerHistoryEntry(current),
    ]);
    lastCommittedStateRef.current = nextEntry.state;
    lastCommittedHashRef.current = hashViewerStateForHistory(nextEntry.state);
    persistHistorySnapshot(nextEntry.state, nextEntry.committedAt);
    bumpHistoryRevision();
    return applyHistoricalViewerState(nextEntry.state);
  }

  function handleJumpUndo(steps: number) {
    flushPendingAutoCommit();
    if (steps <= 0 || steps > pastStatesRef.current.length) return null;

    const current = currentViewerState;
    const targetIndex = pastStatesRef.current.length - steps;
    const previousEntry = pastStatesRef.current[targetIndex];
    const movedFromPast = pastStatesRef.current.slice(targetIndex + 1);

    pastStatesRef.current = pastStatesRef.current.slice(0, targetIndex);
    futureStatesRef.current = clampHistoryStack([
      ...movedFromPast,
      createViewerHistoryEntry(current),
      ...futureStatesRef.current,
    ]);
    lastCommittedStateRef.current = previousEntry.state;
    lastCommittedHashRef.current = hashViewerStateForHistory(previousEntry.state);
    persistHistorySnapshot(previousEntry.state, previousEntry.committedAt);
    bumpHistoryRevision();
    return applyHistoricalViewerState(previousEntry.state);
  }

  function handleJumpRedo(steps: number) {
    flushPendingAutoCommit();
    if (steps <= 0 || steps > futureStatesRef.current.length) return null;

    const current = currentViewerState;
    const nextEntry = futureStatesRef.current[steps - 1];
    const movedFromFuture = futureStatesRef.current.slice(0, steps - 1);

    futureStatesRef.current = futureStatesRef.current.slice(steps);
    pastStatesRef.current = clampHistoryStack([
      ...pastStatesRef.current,
      createViewerHistoryEntry(current),
      ...movedFromFuture,
    ]);
    lastCommittedStateRef.current = nextEntry.state;
    lastCommittedHashRef.current = hashViewerStateForHistory(nextEntry.state);
    persistHistorySnapshot(nextEntry.state, nextEntry.committedAt);
    bumpHistoryRevision();
    return applyHistoricalViewerState(nextEntry.state);
  }

  function handleCreateNewViewer() {
    const nextState = createViewerState({
      activeTool: "mouse",
      selectedNodeId: null,
      layerTree: [],
      sliceVolumeLayerId: "",
      sliceName: "",
      sliceParamsDraft: {
        mode: "axis",
        plane: "xy",
        index: 0,
        opacity: 1,
      },
      layerPanelCollapsed: false,
      inspectorCollapsed: false,
      camera: DEFAULT_CAMERA_STATE,
      automationPipelines: [],
    });

    setIsImportPanelOpen(false);
    setIsLocalDatasetManagerOpen(false);
    setIsUserProfilePanelOpen(false);
    setIsStateDialogOpen(false);
    setIsShareDialogOpen(false);
    setIsAboutDialogOpen(false);
    setLibraryError(null);
    setLibraryMessage(null);
    setStateError(null);
    setStateShareMessage(null);
    setStateTextDraft("");
    setIsAppMenuOpen(false);
    setViewerLibraryMode("browse");
    setActiveSavedViewerId(null);
    commitCurrentStateNow(nextState);
  }

  function openExportStateModal() {
    setStateError(null);
    setStateShareMessage(null);
    setStateModalMode("export");
    setStateTextDraft(JSON.stringify(currentViewerState, null, 2));
    setIsStateDialogOpen(true);
    setIsAppMenuOpen(false);
  }

  function openImportStateModal() {
    setStateError(null);
    setStateShareMessage(null);
    setStateModalMode("import");
    setStateTextDraft("");
    setIsStateDialogOpen(true);
    setIsAppMenuOpen(false);
  }

  function closeDialogs() {
    setIsImportPanelOpen(false);
    setIsUserProfilePanelOpen(false);
    setIsStateDialogOpen(false);
    setIsShareDialogOpen(false);
    setIsAboutDialogOpen(false);
    setIsClearHistoryConfirmOpen(false);
    setLibraryError(null);
    setLibraryMessage(null);
    setIsAppMenuOpen(false);
    setActiveTool((prev) =>
      prev === "slice" || prev === "library" || prev === "pipeline" ? "mouse" : prev
    );
  }

  function closeTopmostOverlay(): boolean {
    if (isAppMenuOpen) {
      setIsAppMenuOpen(false);
      return true;
    }
    if (isClearHistoryConfirmOpen) {
      setIsClearHistoryConfirmOpen(false);
      return true;
    }
    if (isShareDialogOpen) {
      setIsShareDialogOpen(false);
      return true;
    }
    if (isAboutDialogOpen) {
      setIsAboutDialogOpen(false);
      return true;
    }
    if (isStateDialogOpen) {
      setIsStateDialogOpen(false);
      return true;
    }
    if (isLocalDatasetManagerOpen) {
      setIsLocalDatasetManagerOpen(false);
      return true;
    }
    if (isImportPanelOpen) {
      setIsImportPanelOpen(false);
      setDroppedLocalEntries(null);
      return true;
    }
    if (activeTool === "library" || activeTool === "pipeline" || activeTool === "assistant") {
      setActiveTool("mouse");
      return true;
    }
    if (isUserProfilePanelOpen) {
      setIsUserProfilePanelOpen(false);
      return true;
    }
    return false;
  }

  function openClearHistoryConfirm() {
    if (!canClearHistory) return;
    setIsClearHistoryConfirmOpen(true);
  }

  function handleConfirmClearHistory() {
    flushPendingAutoCommit();
    const baselineEntry = createViewerHistoryEntry(currentViewerState);

    pastStatesRef.current = [];
    futureStatesRef.current = [];
    lastCommittedStateRef.current = baselineEntry.state;
    lastCommittedHashRef.current = hashViewerStateForHistory(baselineEntry.state);

    persistHistorySnapshot(baselineEntry.state, baselineEntry.committedAt);
    bumpHistoryRevision();
    setIsClearHistoryConfirmOpen(false);

    return baselineEntry.state;
  }

  function handleRequestClearResourceCache() {
    setCacheClearRequestKey((value) => value + 1);
  }

  function handleResourceCacheCleared(result: {
    clearedVolumes: number;
    clearedMeshes: number;
    workerReleased: boolean;
  }) {
    const clearedItems = result.clearedVolumes + result.clearedMeshes;
    enqueueToast({
      tone: "info",
      title: clearedItems > 0 ? "Cache cleared" : "Cache already lean",
      message:
        clearedItems > 0
          ? `Unloaded ${result.clearedVolumes} hidden volume cache${result.clearedVolumes === 1 ? "" : "s"} and ${result.clearedMeshes} hidden mesh cache${result.clearedMeshes === 1 ? "" : "s"}.`
          : "No hidden volume or mesh caches were loaded, so there was nothing to evict.",
      detail: result.workerReleased
        ? "The idle local data worker was also released."
        : "The local data worker is still busy, so it was kept alive.",
    });
  }

  function handleAssistantCleared(released: boolean) {
    if (!released) return;
    enqueueToast({
      tone: "info",
      title: "Assistant unloaded",
      message: "The local assistant model was released from memory.",
    });
  }

  function handleRunResourceCleanup(options: {
    unloadHiddenData: boolean;
    clearHistory: boolean;
    unloadAssistant: boolean;
  }) {
    if (options.clearHistory) {
      handleClearViewerHistoryOnly();
      enqueueToast({
        tone: "info",
        title: "History cleared",
        message: "Undo and redo history were trimmed from browser memory.",
      });
    }
    if (options.unloadHiddenData) {
      handleRequestClearResourceCache();
    }
    if (options.unloadAssistant) {
      setAssistantClearRequestKey((value) => value + 1);
    }
  }

  function handleApplyImportedState() {
    try {
      const parsed = parseViewerState(stateTextDraft);
      commitCurrentStateNow(parsed);
      setActiveSavedViewerId(null);
      setViewerLibraryMode("browse");
      setStateShareMessage(null);
      setIsStateDialogOpen(false);
      setActiveTool("mouse");
    } catch (error) {
      setStateError(
        error instanceof Error ? error.message : "Failed to import viewer state."
      );
    }
  }

  async function handleCopyExportState() {
    if (!stateTextDraft) return;
    await navigator.clipboard.writeText(stateTextDraft);
  }

  function handleCameraModeChange(mode: SerializableCameraState["mode"]) {
    setCameraState((prev) => ({
      ...prev,
      mode,
    }));
  }

  function buildShareUrlForCurrentViewer() {
    if (!isSerializableLayerTree(layerTree)) {
      throw new Error(
        "This view contains layers that cannot be turned into a share link."
      );
    }

    const shareUrl = buildViewerShareUrl(currentViewerState);
    if (shareUrl.length > 12000) {
      throw new Error(
        "This view is too large to share as a URL without a backend. Use the JSON export instead."
      );
    }
    return shareUrl;
  }

  function openShareDialog() {
    try {
      const shareUrl = buildShareUrlForCurrentViewer();
      setShareUrlDraft(shareUrl);
      setStateError(null);
      setStateShareMessage(null);
      setIsShareDialogOpen(true);
      setIsAppMenuOpen(false);
    } catch (error) {
      setIsShareDialogOpen(false);
      setStateShareMessage(null);
      setStateError(
        error instanceof Error ? error.message : "Failed to create share link."
      );
      setIsAppMenuOpen(false);
    }
  }

  async function handleShareViewerState() {
    try {
      const shareUrl = shareUrlDraft || buildShareUrlForCurrentViewer();
      await navigator.clipboard.writeText(shareUrl);
      setShareUrlDraft(shareUrl);
      setStateError(null);
      if (hasLocalOnlyLayers(layerTree)) {
        setStateShareMessage(
          "Share link copied to clipboard. Some local browser-only layers will not appear on other devices or browsers."
        );
      } else {
        setStateShareMessage("Share link copied to clipboard.");
      }
    } catch (error) {
      setStateShareMessage(null);
      setStateError(
        error instanceof Error ? error.message : "Failed to create share link."
      );
    }
  }

  function openAboutDialog() {
    setIsAboutDialogOpen(true);
    setIsAppMenuOpen(false);
  }

  function captureViewerThumbnailDataUrl(): string | undefined {
    const sourceCanvas = viewerCanvasElementRef.current;
    if (!sourceCanvas || sourceCanvas.width <= 0 || sourceCanvas.height <= 0) {
      return undefined;
    }

    try {
      const maxWidth = 400;
      const aspect = sourceCanvas.width / Math.max(sourceCanvas.height, 1);
      const targetWidth = Math.min(maxWidth, sourceCanvas.width);
      const targetHeight = Math.max(1, Math.round(targetWidth / Math.max(aspect, 1e-6)));

      const previewCanvas = document.createElement("canvas");
      previewCanvas.width = targetWidth;
      previewCanvas.height = targetHeight;
      const ctx = previewCanvas.getContext("2d");
      if (!ctx) return undefined;

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(sourceCanvas, 0, 0, targetWidth, targetHeight);
      return previewCanvas.toDataURL("image/jpeg", 0.82);
    } catch (error) {
      console.warn("Failed to capture viewer thumbnail.", error);
      return undefined;
    }
  }

  function clearToastTimers(toastId: string) {
    const autoCloseTimer = toastAutoCloseTimeoutsRef.current.get(toastId);
    if (typeof autoCloseTimer === "number") {
      window.clearTimeout(autoCloseTimer);
      toastAutoCloseTimeoutsRef.current.delete(toastId);
    }

    const removalTimer = toastRemovalTimeoutsRef.current.get(toastId);
    if (typeof removalTimer === "number") {
      window.clearTimeout(removalTimer);
      toastRemovalTimeoutsRef.current.delete(toastId);
    }
  }

  function finalizeToastDismiss(toastId: string) {
    clearToastTimers(toastId);
    setSaveToasts((prev) => prev.filter((toast) => toast.id !== toastId));
    toastDurationsRef.current.delete(toastId);
  }

  function scheduleToastRemoval(toastId: string, delayMs: number = 220) {
    const removalTimer = window.setTimeout(() => {
      finalizeToastDismiss(toastId);
    }, delayMs);
    toastRemovalTimeoutsRef.current.set(toastId, removalTimer);
  }

  function dismissToastLater(toastId: string, delayMs: number = 3200) {
    clearToastTimers(toastId);
    const autoCloseTimer = window.setTimeout(() => {
      setSaveToasts((prev) =>
        prev.map((toast) => (toast.id === toastId ? { ...toast, isHovered: false, isClosing: true } : toast))
      );
      scheduleToastRemoval(toastId, 220);
    }, delayMs);
    toastAutoCloseTimeoutsRef.current.set(toastId, autoCloseTimer);
  }

  function enqueueToast(toast: Omit<SaveToast, "id" | "isClosing">, options?: { durationMs?: number; dedupeKey?: string; dedupeWindowMs?: number }) {
    const durationMs = options?.durationMs ?? (toast.tone === "error" ? 5600 : 3200);
    const dedupeWindowMs = options?.dedupeWindowMs ?? 4000;
    const dedupeKey = options?.dedupeKey?.trim();
    const now = Date.now();

    if (dedupeKey) {
      const previousTimestamp = runtimeErrorFingerprintRef.current.get(dedupeKey);
      if (typeof previousTimestamp === "number" && now - previousTimestamp < dedupeWindowMs) {
        return;
      }
      runtimeErrorFingerprintRef.current.set(dedupeKey, now);

      if (runtimeErrorFingerprintRef.current.size > 80) {
        for (const [key, value] of runtimeErrorFingerprintRef.current.entries()) {
          if (now - value > dedupeWindowMs * 4) {
            runtimeErrorFingerprintRef.current.delete(key);
          }
        }
      }
    }

    const id = `toast-${now}-${Math.random().toString(36).slice(2, 8)}`;
    toastDurationsRef.current.set(id, durationMs);
    setSaveToasts((prev) => [...prev, { id, isClosing: false, isHovered: false, ...toast }]);
    dismissToastLater(id, durationMs);
  }

  function enqueueErrorToast(error: unknown, options?: { source?: string; technicalMessage?: string | null }) {
    const rawMessage = options?.technicalMessage ?? normalizeUnknownErrorMessage(error);

    if (shouldSuppressRuntimeToast(rawMessage)) {
      return;
    }

    const mapped = mapRuntimeErrorMessage(rawMessage);
    const dedupeKey = [options?.source ?? "runtime", mapped.title, mapped.message, rawMessage ?? ""].join("|");
    enqueueToast(
      {
        tone: "error",
        title: mapped.title,
        message: mapped.message,
        detail: rawMessage && mapped.message !== rawMessage ? rawMessage : undefined,
      },
      { durationMs: 5600, dedupeKey }
    );
  }

  function handleDismissSaveToast(toastId: string) {
    clearToastTimers(toastId);
    setSaveToasts((prev) => prev.map((toast) => (toast.id === toastId ? { ...toast, isHovered: false, isClosing: true } : toast)));
    scheduleToastRemoval(toastId, 220);
  }

  function handleDismissExportTaskNotice() {
    clearExportTaskNoticeTimer();
    setIsExportTaskNoticeHovered(false);
    setExportTaskNotice(null);
    if (exportTaskNotice?.detail) {
      setDismissedExportTaskNoticeKey(`${exportTaskNotice.title}|${exportTaskNotice.message}|${exportTaskNotice.detail}`);
    } else {
      setDismissedExportTaskNoticeKey(`${exportTaskNotice?.title ?? ""}|${exportTaskNotice?.message ?? ""}`);
    }
  }

  function clearExportTaskNoticeTimer() {
    if (exportTaskNoticeTimeoutRef.current != null) {
      window.clearTimeout(exportTaskNoticeTimeoutRef.current);
      exportTaskNoticeTimeoutRef.current = null;
    }
  }

  function scheduleExportTaskNoticeDismiss(delayMs: number = 3600) {
    clearExportTaskNoticeTimer();
    exportTaskNoticeTimeoutRef.current = window.setTimeout(() => {
      handleDismissExportTaskNotice();
    }, delayMs);
  }

  function handleToastHoverChange(toastId: string, isHovered: boolean) {
    setSaveToasts((prev) =>
      prev.map((toast) => {
        if (toast.id !== toastId || toast.isClosing) return toast;
        return toast.isHovered === isHovered ? toast : { ...toast, isHovered };
      })
    );

    if (isHovered) {
      clearToastTimers(toastId);
      return;
    }

    const durationMs = toastDurationsRef.current.get(toastId) ?? 3200;
    dismissToastLater(toastId, durationMs);
  }

  useEffect(() => {
    if (!exportTaskNotice || isLocalDatasetManagerOpen) {
      clearExportTaskNoticeTimer();
      return;
    }
    if (!exportTaskNotice.terminal || isExportTaskNoticeHovered) {
      clearExportTaskNoticeTimer();
      return;
    }
    scheduleExportTaskNoticeDismiss();
    return () => clearExportTaskNoticeTimer();
  }, [exportTaskNotice, isLocalDatasetManagerOpen, isExportTaskNoticeHovered]);

  function handleSaveCurrentViewerToLibrary(name?: string) {
    if (!isSerializableLayerTree(currentViewerState.scene.layerTree)) {
      setLibraryMessage(null);
      setLibraryError(
        "This viewer contains layers that cannot be saved locally."
      );
      openViewerLibrary("browse", { preserveFeedback: true });
      return;
    }

    const entry = createSavedViewerEntry({
      ownerKind: "owned",
      name: name?.trim() || buildDefaultSavedViewerName("Viewer"),
      state: currentViewerState,
      thumbnailDataUrl: captureViewerThumbnailDataUrl(),
    });

    setViewerLibrary((prev) => [entry, ...prev]);
    setActiveSavedViewerId(entry.id);
    setViewerLibraryMode("browse");
    setLibraryError(null);
    setLibraryMessage(null);
    enqueueToast({
      tone: "success",
      title: "Viewer saved",
      message: `Created "${entry.name}". Ctrl+S will now update this saved viewer.`,
    });
  }

  function handleOverwriteSavedViewer(entryId: string) {
    if (!isSerializableLayerTree(currentViewerState.scene.layerTree)) {
      setLibraryMessage(null);
      setLibraryError("This viewer contains layers that cannot be saved locally.");
      openViewerLibrary("browse", { preserveFeedback: true });
      return;
    }

    let savedName = "";
    let didOverwrite = false;

    setViewerLibrary((prev) =>
      prev.map((entry) => {
        if (entry.id !== entryId || entry.ownerKind !== "owned") {
          return entry;
        }

        didOverwrite = true;
        const nextEntry = overwriteSavedViewerEntry(entry, {
          state: currentViewerState,
          thumbnailDataUrl: captureViewerThumbnailDataUrl(),
        });
        savedName = nextEntry.name;
        return nextEntry;
      })
    );

    if (!didOverwrite) {
      requestNewSavedViewerFlow();
      return;
    }

    setActiveSavedViewerId(entryId);
    setViewerLibraryMode("browse");
    setLibraryError(null);
    setLibraryMessage(null);
    enqueueToast({
      tone: "success",
      title: "Viewer updated",
      message: `Updated "${savedName}". The previous saved version is still available from version history.`,
    });
  }

  function handleOpenSavedViewer(entry: SavedViewerEntry, revision: SavedViewerRevision | null) {
    commitCurrentStateNow(revision?.state ?? entry.state);
    setActiveSavedViewerId(entry.ownerKind === "owned" ? entry.id : null);
    setViewerLibraryMode("browse");
    setLibraryError(null);
    setLibraryMessage(null);
    setIsAppMenuOpen(false);
    setIsStateDialogOpen(false);
    setActiveTool("mouse");
  }

  function handleDeleteSavedViewer(entryIds: string[]) {
    if (!entryIds.length) return;
    const uniqueIds = Array.from(new Set(entryIds));
    setViewerLibrary((prev) => prev.filter((entry) => !uniqueIds.includes(entry.id)));
    setActiveSavedViewerId((prev) => (prev && uniqueIds.includes(prev) ? null : prev));
    setViewerLibraryMode("browse");
    setLibraryError(null);
    setLibraryMessage(null);
    enqueueToast({
      tone: "info",
      title: uniqueIds.length === 1 ? "Viewer removed" : "Viewers removed",
      message:
        uniqueIds.length === 1
          ? "The saved viewer was removed from this browser."
          : `${uniqueIds.length} saved viewers were removed from this browser.`,
    });
  }

  function handleRenameSavedViewer(entryId: string, nextName: string) {
    const trimmed = nextName.trim();
    if (!trimmed) return;

    let resolvedName = trimmed;
    setViewerLibrary((prev) => {
      resolvedName = buildUniqueSavedViewerName(trimmed, prev, entryId);
      return prev.map((entry) =>
        entry.id === entryId
          ? { ...entry, name: resolvedName }
          : entry
      );
    });
    setLibraryError(null);
    setLibraryMessage(null);
    enqueueToast({
      tone: "info",
      title: "Viewer renamed",
      message: `This saved viewer is now called "${resolvedName}".`,
    });
  }


  function closeResourceManager() {
    setResourceSectionHeight(DEFAULT_RESOURCE_SECTION_HEIGHT);
    setIsResourceManagerOpen(false);
    setActiveTool((current) => (current === "resources" ? "mouse" : current));
  }

  function applyToolbarToolChange(tool: ToolId) {
    if (tool === "resources") {
      setIsResourceManagerOpen((current) => {
        const next = !current;
        if (!next) {
          setResourceSectionHeight(DEFAULT_RESOURCE_SECTION_HEIGHT);
        }
        return next;
      });
      if (activeTool === "resources") {
        setActiveTool("mouse");
      }
      return;
    }
    setActiveTool(tool);
    if (tool === "capture") {
      setIsCapturePanelOpen(false);
    }
    if (tool !== "slice") {
      setScenePointerTarget(null);
    }

    if (tool === "slice") {
      if (
        selectedCustomSliceLayer &&
        hasVolumeLayerId(selectedCustomSliceLayer.source)
      ) {
        setSelectedNodeId(selectedCustomSliceLayer.id);
        setSliceVolumeLayerId(selectedCustomSliceLayer.source.volumeLayerId);
        return;
      }

      const preferredLayer =
        selectedCanonicalSliceLayer ??
        (sliceVolumeLayerId ? findNodeById(layerTree, sliceVolumeLayerId) : null) ??
        sliceBrowsableLayers[0] ??
        null;

      if (isCanonicalSliceBrowsableLayer(preferredLayer)) {
        setSelectedNodeId(preferredLayer.id);
        setSliceVolumeLayerId(preferredLayer.id);
      }
    }
  }

  function handleToolChange(tool: ToolId) {
    const extensionDefinition = getToolExtensionDefinition(tool as ToolbarToolId);
    if (extensionDefinition?.onToolbarSelect) {
      const handled = extensionDefinition.onToolbarSelect(extensionContext, {
        source: "toolbar",
      });
      if (handled) return;
    }
    applyToolbarToolChange(tool);
  }

  function handleOpenPipelineFromExtension(pipelineId: string) {
    const extensionDefinition = getToolExtensionDefinition("pipeline");
    if (extensionDefinition?.onPipelineMenuSelect) {
      const handled = extensionDefinition.onPipelineMenuSelect(extensionContext, {
        pipelineId,
      });
      if (handled) return;
    }
    setActiveAutomationPipelineId(pipelineId);
  }

  function handleTogglePipelineFromExtension(pipelineId: string, enabled: boolean) {
    const extensionDefinition = getToolExtensionDefinition("pipeline");
    if (extensionDefinition?.onPipelineToggleSelect) {
      const handled = extensionDefinition.onPipelineToggleSelect(extensionContext, {
        pipelineId,
        enabled,
      });
      if (handled) return;
    }
    setAutomationPipelines((prev) =>
      prev.map((pipeline) =>
        pipeline.id === pipelineId
          ? { ...pipeline, active: enabled, autoRun: enabled, updatedAt: Date.now() }
          : pipeline
      )
    );
  }

  function handleCapturePrimaryActionFromExtension(
    action: "open-editor" | "export-frame" | "toggle-playback" | "stop-playback"
  ) {
    const extensionDefinition = getToolExtensionDefinition("capture");
    if (extensionDefinition?.onCapturePrimarySelect) {
      const handled = extensionDefinition.onCapturePrimarySelect(extensionContext, {
        action,
      });
      if (handled) return;
    }

    if (action === "open-editor") {
      handleToolChange("capture");
      return;
    }
    if (action === "export-frame") {
      handleRequestCaptureImage();
      return;
    }
    if (action === "toggle-playback") {
      handleToggleCaptureTimelinePlayback();
      return;
    }
    stopCaptureTimelinePlayback();
  }

  function handleCaptureStillActionFromExtension(
    action: "load" | "download" | "delete",
    stillId: string
  ) {
    const extensionDefinition = getToolExtensionDefinition("capture");
    if (extensionDefinition?.onCaptureStillSelect) {
      const handled = extensionDefinition.onCaptureStillSelect(extensionContext, {
        action,
        stillId,
      });
      if (handled) return;
    }

    if (action === "load") {
      handleApplyCaptureStill(stillId);
      return;
    }
    if (action === "download") {
      handleDownloadCaptureStill(stillId);
      return;
    }
    handleDeleteCaptureStill(stillId);
  }

  function handleCaptureSequenceActionFromExtension(
    action: "load" | "play-once" | "play-loop" | "rename" | "delete",
    sequenceId: string,
    nextName?: string
  ) {
    const extensionDefinition = getToolExtensionDefinition("capture");
    if (extensionDefinition?.onCaptureSequenceSelect) {
      const handled = extensionDefinition.onCaptureSequenceSelect(extensionContext, {
        action,
        sequenceId,
        nextName,
      });
      if (handled) return;
    }

    if (action === "load") {
      handleLoadCaptureSequence(sequenceId, { openPanel: true });
      return;
    }
    if (action === "play-once") {
      handlePlayCaptureSequenceFromLibrary(sequenceId, "once");
      return;
    }
    if (action === "play-loop") {
      handlePlayCaptureSequenceFromLibrary(sequenceId, "loop");
      return;
    }
    if (action === "rename" && nextName) {
      handleRenameCaptureSequence(sequenceId, nextName);
      return;
    }
    handleDeleteCaptureSequence(sequenceId);
  }

  function handleAnnotationSettingActionFromExtension(
    action:
      | "set-shape"
      | "set-color"
      | "commit-color"
      | "set-opacity"
      | "set-size"
      | "set-depth"
      | "set-erase-mode"
      | "pick-color",
    value?: string | number
  ) {
    const extensionDefinition = getToolExtensionDefinition("pencil");
    if (extensionDefinition?.onAnnotationSettingSelect) {
      const handled = extensionDefinition.onAnnotationSettingSelect(extensionContext, {
        action,
        value,
      });
      if (handled) return;
    }

    if (action === "set-shape" && typeof value === "string") {
      setAnnotationDraftShape(value as AnnotationShape);
      return;
    }
    if (action === "set-color" && typeof value === "string") {
      handleAnnotationDraftColorChange(value);
      return;
    }
    if (action === "commit-color" && typeof value === "string") {
      handleAnnotationDraftColorCommit(value);
      return;
    }
    if (action === "set-opacity" && typeof value === "number") {
      handleAnnotationDraftOpacityChange(value);
      return;
    }
    if (action === "set-size" && typeof value === "number") {
      handleAnnotationDraftSizeChange(value);
      return;
    }
    if (action === "set-depth" && typeof value === "number") {
      handleAnnotationDraftDepthChange(value);
      return;
    }
    if (action === "set-erase-mode" && (value === "all" || value === "color")) {
      setAnnotationDraft((prev) => ({ ...prev, eraseMode: value }));
      setActiveTool("pencil");
      return;
    }
    if (action === "pick-color") {
      void handlePickAnnotationColorFromScreen();
    }
  }

  function handleAssistantToolbarSelectFromExtension() {
    const extensionDefinition = getUtilityToolExtensionDefinition("assistant");
    if (extensionDefinition?.onToolbarSelect) {
      const handled = extensionDefinition.onToolbarSelect(extensionContext, {
        source: "toolbar",
      });
      if (handled) return;
    }
    handleToolChange("assistant");
  }

  function handleAssistantQuickPromptFromExtension(prompt: string) {
    const extensionDefinition = getUtilityToolExtensionDefinition("assistant");
    if (extensionDefinition?.onAssistantQuickPromptSelect) {
      const handled = extensionDefinition.onAssistantQuickPromptSelect(extensionContext, {
        prompt,
      });
      if (handled) return;
    }
    setActiveTool((current) => current === "assistant" ? "mouse" : current);
    setAppAssistantQuickPrompt({ id: `quick-${Date.now()}`, prompt });
  }

  function handleResourceManagerToolbarSelectFromExtension() {
    const extensionDefinition = getUtilityToolExtensionDefinition("resources");
    if (extensionDefinition?.onToolbarSelect) {
      const handled = extensionDefinition.onToolbarSelect(extensionContext, {
        source: "toolbar",
      });
      if (handled) return;
    }
    handleToolChange("resources");
  }

  function buildCaptureFileName() {
    const baseName =
      selectedCaptureLayerNames.length === 1
        ? selectedCaptureLayerNames[0]
        : selectedCaptureLayerNames.length > 1
          ? `${selectedCaptureLayerNames.length}-layers`
          : "viewer-capture";
    const safeBaseName = baseName.replace(/[^a-z0-9-_]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase() || "viewer-capture";
    return `${safeBaseName}-${new Date().toISOString().replace(/[:.]/g, "-")}.png`;
  }

  function buildCaptureStillName(fileName: string) {
    return fileName.replace(/\.png$/i, "");
  }

  function normalizeCaptureSceneName(value: string) {
    const trimmed = value.trim();
    return trimmed || `Scene ${captureScenes.length + 1}`;
  }

  function normalizeCaptureSequenceName(value: string) {
    const trimmed = value.trim();
    return trimmed || `Animation ${captureSequences.length + 1}`;
  }

  function getNextCaptureSequenceName() {
    const usedNumbers = captureSequences
      .map((sequence) => {
        const match = /^New animation\s+(\d+)$/i.exec(sequence.name.trim());
        return match ? Number.parseInt(match[1] ?? "", 10) : null;
      })
      .filter((value): value is number => typeof value === "number" && Number.isFinite(value) && value > 0);
    let nextIndex = 1;
    while (usedNumbers.includes(nextIndex)) {
      nextIndex += 1;
    }
    return `New animation ${nextIndex}`;
  }

  function buildCurrentCaptureStill(fileName: string): PersistedCaptureScene {
    const now = Date.now();
    return {
      id: createId(),
      name: buildCaptureStillName(fileName),
      camera: {
        mode: cameraState.mode,
        position: [cameraState.position[0], cameraState.position[1], cameraState.position[2]],
        yaw: cameraState.yaw,
        pitch: cameraState.pitch,
        fovDeg: cameraState.fovDeg,
      },
      selectedLayerIds: selectedCaptureLayerIds,
      viewerState: cloneViewerStateSnapshot(currentViewerState),
      thumbnailDataUrl: captureViewerThumbnailDataUrl(),
      createdAt: now,
      updatedAt: now,
    };
  }

  function formatCaptureTimelineTime(valueMs: number) {
    const safeValue = Math.max(0, Math.round(valueMs));
    const totalSeconds = Math.floor(safeValue / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    const milliseconds = safeValue % 1000;
    return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(Math.floor(milliseconds / 10)).padStart(2, "0")}`;
  }

  function snapshotCaptureTimelineState(): CaptureTimelineHistorySnapshot {
    return {
      scenes: captureScenes.map((scene) => ({ ...scene, viewerState: scene.viewerState ? cloneViewerStateSnapshot(scene.viewerState) : null })),
      activeSceneId: activeCaptureSceneId,
      cursorMs: captureTimelineCursorMs,
      zoom: captureTimelineZoom,
    };
  }

  function applyCaptureTimelineHistorySnapshot(snapshot: CaptureTimelineHistorySnapshot) {
    setCaptureScenes(snapshot.scenes.map((scene) => ({ ...scene, viewerState: scene.viewerState ? cloneViewerStateSnapshot(scene.viewerState) : null })));
    setActiveCaptureSceneId(snapshot.activeSceneId);
    setCaptureTimelineCursorMs(snapshot.cursorMs);
    setCaptureTimelineZoom(snapshot.zoom);
  }

  function pushCaptureTimelineHistorySnapshot() {
    captureTimelinePastRef.current = [
      ...captureTimelinePastRef.current,
      snapshotCaptureTimelineState(),
    ];
    captureTimelineFutureRef.current = [];
    bumpHistoryRevision();
  }

  function handleCaptureTimelineUndo() {
    if (!captureTimelinePastRef.current.length) return false;
    const previous = captureTimelinePastRef.current[captureTimelinePastRef.current.length - 1];
    captureTimelinePastRef.current = captureTimelinePastRef.current.slice(0, -1);
    captureTimelineFutureRef.current = [snapshotCaptureTimelineState(), ...captureTimelineFutureRef.current];
    stopCaptureTimelinePlayback();
    applyCaptureTimelineHistorySnapshot(previous);
    bumpHistoryRevision();
    return true;
  }

  function handleCaptureTimelineRedo() {
    if (!captureTimelineFutureRef.current.length) return false;
    const next = captureTimelineFutureRef.current[0];
    captureTimelineFutureRef.current = captureTimelineFutureRef.current.slice(1);
    captureTimelinePastRef.current = [...captureTimelinePastRef.current, snapshotCaptureTimelineState()];
    stopCaptureTimelinePlayback();
    applyCaptureTimelineHistorySnapshot(next);
    bumpHistoryRevision();
    return true;
  }

  function getDefaultNextCaptureSceneTimestamp() {
    const lastScene = orderedCaptureScenes[orderedCaptureScenes.length - 1];
    if (!lastScene) return Math.max(0, captureTimelineCursorMs);
    return Math.max(captureTimelineCursorMs, (lastScene.timestampMs ?? 0) + DEFAULT_CAPTURE_SCENE_TRANSITION_MS);
  }

  function ensureCaptureTimelineRange(targetMs: number) {
    setCaptureTimelineRangeMs((prev) => {
      const required = Math.max(DEFAULT_CAPTURE_TIMELINE_RANGE_MS, targetMs + CAPTURE_TIMELINE_VIEW_PADDING_MS);
      if (required <= prev) return prev;
      let next = prev;
      while (next < required) {
        next *= 2;
      }
      return next;
    });
  }

  function buildCurrentCaptureScene(name?: string, timestampMs?: number): PersistedCaptureScene | null {
    const now = Date.now();
    const nextTimestampMs = Math.max(0, Math.round(timestampMs ?? getDefaultNextCaptureSceneTimestamp()));
    ensureCaptureTimelineRange(nextTimestampMs);
    return {
      id: createId(),
      name: normalizeCaptureSceneName(name ?? ""),
      camera: {
        mode: cameraState.mode,
        position: [cameraState.position[0], cameraState.position[1], cameraState.position[2]],
        yaw: cameraState.yaw,
        pitch: cameraState.pitch,
        fovDeg: cameraState.fovDeg,
      },
      selectedLayerIds: selectedCaptureLayerIds,
      viewerState: cloneViewerStateSnapshot(currentViewerState),
      timestampMs: nextTimestampMs,
      thumbnailDataUrl: captureViewerThumbnailDataUrl(),
      transitionEasing: activeCaptureScene?.transitionEasing ?? "ease-in-out",
      createdAt: now,
      updatedAt: now,
    };
  }

  function resolveCaptureSceneViewerState(scene: PersistedCaptureScene): ViewerStateV1 | null {
    if (!scene.viewerState) return null;
    const nextState = cloneViewerStateSnapshot(scene.viewerState);
    nextState.camera = {
      mode: scene.camera.mode,
      position: [scene.camera.position[0], scene.camera.position[1], scene.camera.position[2]],
      yaw: scene.camera.yaw,
      pitch: scene.camera.pitch,
      fovDeg: scene.camera.fovDeg,
    };
    return nextState;
  }

  function applyCaptureSceneCamera(nextCamera: SerializableCameraState) {
    setCameraState({
      mode: nextCamera.mode,
      position: [nextCamera.position[0], nextCamera.position[1], nextCamera.position[2]],
      yaw: nextCamera.yaw,
      pitch: nextCamera.pitch,
      fovDeg: nextCamera.fovDeg,
    });
    setCameraSyncKey((prev) => prev + 1);
  }

  function applyCaptureScene(scene: PersistedCaptureScene, options?: { preserveActiveTool?: boolean; suppressAutoCommit?: boolean; syncCamera?: boolean }) {
    const existingLayerIds = scene.selectedLayerIds.filter((layerId) => {
      const node = findNodeById(layerTree, layerId);
      return !!node && node.kind === "layer";
    });
    const resolvedViewerState = resolveCaptureSceneViewerState(scene);
    const preferredNodeId = resolvedViewerState
      ? applyCaptureSceneState(resolvedViewerState, existingLayerIds, options)
      : (() => {
          const fallbackNodeId = existingLayerIds[existingLayerIds.length - 1] ?? null;
          setSelectedNodeIdsExternal(existingLayerIds.length ? existingLayerIds : null);
          setSelectedNodeId(fallbackNodeId);
          applyCaptureSceneCamera(scene.camera);
          return fallbackNodeId;
        })();
    return {
      preferredNodeId,
      existingLayerIds,
    };
  }

  function applyCaptureSceneState(
    viewerState: ViewerStateV1,
    selectedLayerIds: string[],
    options?: { preserveActiveTool?: boolean; suppressAutoCommit?: boolean; syncCamera?: boolean }
  ) {
    const nextState = cloneViewerStateSnapshot(viewerState);
    const preferredNodeId = selectedLayerIds[selectedLayerIds.length - 1] ?? nextState.scene.selectedNodeId ?? null;
    if (options?.preserveActiveTool) {
      nextState.scene.activeTool = activeTool;
    }
    nextState.scene.selectedNodeId = preferredNodeId;
    setSelectedNodeIdsExternal(selectedLayerIds.length ? selectedLayerIds : null);
    applyViewerState(nextState, {
      suppressAutoCommit: options?.suppressAutoCommit,
      syncCamera: options?.syncCamera,
    });
    return preferredNodeId;
  }

  function stopCaptureTimelinePlayback(options?: { resetSceneId?: string | null }) {
    captureTimelineTokenRef.current += 1;
    if (captureTimelineFrameRef.current !== null) {
      window.cancelAnimationFrame(captureTimelineFrameRef.current);
      captureTimelineFrameRef.current = null;
    }
    captureTimelinePlaybackModeRef.current = "once";
    setIsCaptureTimelinePlaying(false);
    setIsCaptureTimelinePaused(false);
    if (typeof options?.resetSceneId !== "undefined") {
      setActiveCaptureSceneId(options.resetSceneId);
    }
  }

  function pauseCaptureTimelinePlayback() {
    captureTimelineTokenRef.current += 1;
    if (captureTimelineFrameRef.current !== null) {
      window.cancelAnimationFrame(captureTimelineFrameRef.current);
      captureTimelineFrameRef.current = null;
    }
    setIsCaptureTimelinePlaying(false);
    setIsCaptureTimelinePaused(true);
  }

  function beginCaptureTimelineLoop(
    scenes: PersistedCaptureScene[],
    playbackToken: number,
    startCursorMs: number,
    playbackMode: CaptureTimelinePlaybackMode
  ) {
    const lastScene = scenes[scenes.length - 1];
    const playbackStart = performance.now();
    const firstScene = scenes[0];
    const startSceneTime = firstScene?.timestampMs ?? 0;
    const endSceneTime = lastScene.timestampMs ?? startSceneTime;

    const renderPlaybackFrame = (frameTime: number) => {
      if (captureTimelineTokenRef.current !== playbackToken) return;
      const elapsed = frameTime - playbackStart;
      const absoluteTimelineMs = startCursorMs + elapsed;
      setCaptureTimelineCursorMs(Math.min(endSceneTime, Math.max(startCursorMs, absoluteTimelineMs)));
      if (absoluteTimelineMs >= endSceneTime) {
        const finalSelection = lastScene.selectedLayerIds.filter((layerId) => {
          const node = findNodeById(layerTree, layerId);
          return !!node && node.kind === "layer";
        });
        const finalState = resolveCaptureSceneViewerState(lastScene);
        if (finalState) {
          applyCaptureSceneState(finalState, finalSelection, {
            preserveActiveTool: true,
            suppressAutoCommit: true,
            syncCamera: true,
          });
        } else {
          handleApplyCaptureScene(lastScene.id);
        }
        if (playbackMode === "loop" && scenes.length > 1) {
          applyCaptureScene(firstScene, {
            preserveActiveTool: true,
            suppressAutoCommit: true,
            syncCamera: true,
          });
          setActiveCaptureSceneId(firstScene.id);
          setCaptureTimelineCursorMs(startSceneTime);
          captureTimelineFrameRef.current = window.requestAnimationFrame(() => {
            if (captureTimelineTokenRef.current !== playbackToken) return;
            beginCaptureTimelineLoop(scenes, playbackToken, startSceneTime, playbackMode);
          });
          return;
        }
        stopCaptureTimelinePlayback({
          resetSceneId: lastScene.id,
        });
        return;
      }

      for (let index = 1; index < scenes.length; index += 1) {
        const startScene = scenes[index - 1];
        const endScene = scenes[index];
        const segmentStartMs = startScene.timestampMs ?? 0;
        const segmentEndMs = endScene.timestampMs ?? segmentStartMs;
        const segmentDuration = Math.max(1, segmentEndMs - segmentStartMs);
        if (absoluteTimelineMs < segmentEndMs) {
          const segmentProgress = Math.min(1, Math.max(0, (absoluteTimelineMs - segmentStartMs) / segmentDuration));
          const easedProgress = easeCaptureSceneProgress(segmentProgress, endScene.transitionEasing ?? "ease-in-out");
          const startState = resolveCaptureSceneViewerState(startScene);
          const endState = resolveCaptureSceneViewerState(endScene);
          const interpolatedCamera = interpolateCameraState(startScene.camera, endScene.camera, easedProgress);
          if (startState && endState) {
            const interpolatedState = interpolateViewerState(startState, endState, easedProgress);
            interpolatedState.camera = interpolatedCamera;
            const interpolatedSelectionSource = easedProgress < 0.5 ? startScene.selectedLayerIds : endScene.selectedLayerIds;
            const interpolatedSelection = interpolatedSelectionSource.filter((layerId) => {
              const node = findNodeById(interpolatedState.scene.layerTree, layerId);
              return !!node && node.kind === "layer";
            });
            applyCaptureSceneState(interpolatedState, interpolatedSelection, {
              preserveActiveTool: true,
              suppressAutoCommit: true,
              syncCamera: true,
            });
          } else {
            if (startState || endState) {
              const steppedState = cloneViewerStateSnapshot((easedProgress < 0.5 ? startState : endState) ?? startState ?? endState!);
              steppedState.camera = interpolatedCamera;
              const steppedSelectionSource = easedProgress < 0.5 ? startScene.selectedLayerIds : endScene.selectedLayerIds;
              const steppedSelection = steppedSelectionSource.filter((layerId) => {
                const node = findNodeById(steppedState.scene.layerTree, layerId);
                return !!node && node.kind === "layer";
              });
              applyCaptureSceneState(steppedState, steppedSelection, {
                preserveActiveTool: true,
                suppressAutoCommit: true,
                syncCamera: true,
              });
            } else {
              if (segmentProgress < 0.5) {
                setSelectedNodeIdsExternal(startScene.selectedLayerIds.length ? startScene.selectedLayerIds : null);
                setSelectedNodeId(startScene.selectedLayerIds[startScene.selectedLayerIds.length - 1] ?? null);
              } else {
                setSelectedNodeIdsExternal(endScene.selectedLayerIds.length ? endScene.selectedLayerIds : null);
                setSelectedNodeId(endScene.selectedLayerIds[endScene.selectedLayerIds.length - 1] ?? null);
              }
              applyCaptureSceneCamera(interpolatedCamera);
            }
          }
          setActiveCaptureSceneId(easedProgress < 0.5 ? startScene.id : endScene.id);
          captureTimelineFrameRef.current = window.requestAnimationFrame(renderPlaybackFrame);
          return;
        }
      }

      stopCaptureTimelinePlayback({
        resetSceneId: lastScene.id,
      });
    };

    captureTimelineFrameRef.current = window.requestAnimationFrame(renderPlaybackFrame);
  }

  function downloadBlob(blob: Blob, fileName: string) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  function handleRequestCaptureImage(
    layerIds?: string[] | null,
    sliceCrop?: CaptureSliceCropRequest | null
  ) {
    const requestedLayerIds = Array.from(new Set((layerIds ?? visibleCaptureLayerIds).filter((id) => typeof id === "string" && id.length > 0)));
    if (!requestedLayerIds.length) return;
    const stillFileName = sliceCrop ? null : buildCaptureFileName();
    pendingCaptureStillRef.current = stillFileName
      ? {
          scene: buildCurrentCaptureStill(stillFileName),
          fileName: stillFileName,
        }
      : null;
    setCaptureRequestLayerIds(requestedLayerIds);
    setCaptureRequestSliceCrop(sliceCrop ?? null);
    setIsCapturePending(true);
    setCaptureRequestKey((prev) => prev + 1);
  }

  function handleCaptureSliceRegion(payload: {
    layerId: string;
    plane?: SlicePlane;
    points: [number, number, number][];
    cropRect?: {
      left: number;
      top: number;
      width: number;
      height: number;
    } | null;
  }) {
    handleRequestCaptureImage([payload.layerId], payload);
  }

  function handleSaveCaptureScene() {
    pushCaptureTimelineHistorySnapshot();
    const scene = buildCurrentCaptureScene(undefined, captureTimelineCursorMs);
    if (!scene) {
      return;
    }
    setCaptureScenes((prev) => [...prev, scene]);
    setActiveCaptureSceneId(scene.id);
    setCaptureTimelineCursorMs(scene.timestampMs ?? 0);
  }

  function handleUpdateActiveCaptureScene() {
    if (!activeCaptureScene) return;
    pushCaptureTimelineHistorySnapshot();
    const updatedAt = Date.now();
    setCaptureScenes((prev) =>
      prev.map((scene) =>
        scene.id === activeCaptureScene.id
          ? {
              ...scene,
              camera: {
                mode: cameraState.mode,
                position: [cameraState.position[0], cameraState.position[1], cameraState.position[2]],
                yaw: cameraState.yaw,
                pitch: cameraState.pitch,
                fovDeg: cameraState.fovDeg,
              },
              selectedLayerIds: selectedCaptureLayerIds,
              viewerState: cloneViewerStateSnapshot(currentViewerState),
              thumbnailDataUrl: captureViewerThumbnailDataUrl(),
              transitionEasing: scene.transitionEasing ?? "ease-in-out",
              updatedAt,
            }
          : scene
      )
    );
  }

  function handleApplyCaptureScene(sceneId: string) {
    const scene = captureScenes.find((entry) => entry.id === sceneId);
    if (!scene) return;
    stopCaptureTimelinePlayback({ resetSceneId: scene.id });
    const { preferredNodeId } = applyCaptureScene(scene, { syncCamera: true });
    setActiveCaptureSceneId(scene.id);
    setCaptureTimelineCursorMs(scene.timestampMs ?? 0);
    runAutomationForSelection(preferredNodeId);
  }

  function handleApplyCaptureStill(stillId: string) {
    const still = captureStills.find((entry) => entry.id === stillId);
    if (!still) return;
    const { preferredNodeId } = applyCaptureScene(still, { syncCamera: true });
    setActiveCaptureStillId(still.id);
    runAutomationForSelection(preferredNodeId);
  }

  function handleDownloadCaptureStill(stillId: string) {
    const still = captureStills.find((entry) => entry.id === stillId);
    if (!still?.capturedImageDataUrl) return;
    const blob = dataUrlToBlob(still.capturedImageDataUrl);
    if (!blob) {
      enqueueToast({
        tone: "error",
        title: "Screen shot unavailable",
        message: "This saved screen shot could not be prepared for download.",
      }, { dedupeKey: `capture-still-download:${stillId}`, dedupeWindowMs: 3000 });
      return;
    }
    downloadBlob(blob, `${still.name || "viewer-capture"}.png`);
  }

  function handleDeleteCaptureStill(stillId: string) {
    setCaptureStills((prev) => prev.filter((entry) => entry.id !== stillId));
    setActiveCaptureStillId((prev) => (prev === stillId ? null : prev));
  }

  function handleUpdateCaptureSceneTransition(
    sceneId: string,
    patch: Partial<Pick<PersistedCaptureScene, "transitionEasing">>
  ) {
    pushCaptureTimelineHistorySnapshot();
    setCaptureScenes((prev) =>
      prev.map((scene) =>
        scene.id === sceneId
          ? {
              ...scene,
              transitionEasing: patch.transitionEasing ?? scene.transitionEasing ?? "ease-in-out",
              updatedAt: Date.now(),
            }
          : scene
      )
    );
  }

  function loadCaptureSequenceIntoEditor(sequence: PersistedCaptureSequence, options?: { openPanel?: boolean }) {
    stopCaptureTimelinePlayback();
    const nextScenes = cloneCaptureScenes(sequence.scenes);
    const nextActiveSceneId =
      nextScenes.some((scene) => scene.id === activeCaptureSceneId) ? activeCaptureSceneId : nextScenes[0]?.id ?? null;
    setCaptureScenes(nextScenes);
    setActiveCaptureSceneId(nextActiveSceneId);
    setCaptureTimelineCursorMs(sequence.cursorMs ?? 0);
    setCaptureTimelineZoom(clampCaptureTimelineZoom(sequence.zoom ?? DEFAULT_CAPTURE_TIMELINE_ZOOM));
    setActiveCaptureSequenceId(sequence.id);
    if (typeof options?.openPanel === "boolean") {
      setIsCapturePanelOpen(options.openPanel);
    }
  }

  function handleCreateCaptureSequence(options?: { openPanel?: boolean }) {
    const now = Date.now();
    const sequence: PersistedCaptureSequence = {
      id: createId(),
      name: getNextCaptureSequenceName(),
      scenes: [],
      cursorMs: 0,
      zoom: DEFAULT_CAPTURE_TIMELINE_ZOOM,
      createdAt: now,
      updatedAt: now,
    };
    setCaptureSequences((prev) => [sequence, ...prev]);
    setActiveCaptureSequenceId(sequence.id);
    setCaptureScenes([]);
    setActiveCaptureSceneId(null);
    setCaptureTimelineCursorMs(0);
    setCaptureTimelineZoom(DEFAULT_CAPTURE_TIMELINE_ZOOM);
    setIsCapturePanelOpen(options?.openPanel ?? true);
    setActiveTool("capture");
  }

  function handleDeleteCaptureSequence(sequenceId: string) {
    stopCaptureTimelinePlayback();
    setCaptureSequences((prev) => prev.filter((sequence) => sequence.id !== sequenceId));
    setActiveCaptureSequenceId((prev) => (prev === sequenceId ? null : prev));
    if (activeCaptureSequenceId === sequenceId) {
      setCaptureScenes([]);
      setActiveCaptureSceneId(null);
      setCaptureTimelineCursorMs(0);
      setCaptureTimelineZoom(DEFAULT_CAPTURE_TIMELINE_ZOOM);
      setIsCapturePanelOpen(false);
    }
  }

  function handleRenameCaptureSequence(sequenceId: string, nextName: string) {
    const normalized = normalizeCaptureSequenceName(nextName);
    setCaptureSequences((prev) =>
      prev.map((sequence) =>
        sequence.id === sequenceId
          ? {
              ...sequence,
              name: normalized,
              updatedAt: Date.now(),
            }
          : sequence
      )
    );
  }

  function handleLoadCaptureSequence(sequenceId: string, options?: { openPanel?: boolean }) {
    const sequence = captureSequences.find((entry) => entry.id === sequenceId);
    if (!sequence) return;
    loadCaptureSequenceIntoEditor(sequence, {
      openPanel: options?.openPanel ?? true,
    });
  }

  function handlePlayCaptureTimeline(options?: {
    fromStart?: boolean;
    playbackMode?: CaptureTimelinePlaybackMode;
    scenes?: PersistedCaptureScene[];
    startCursorMs?: number;
  }) {
    const sourceScenes = options?.scenes ? cloneCaptureScenes(options.scenes) : cloneCaptureScenes(orderedCaptureScenes);
    if (!sourceScenes.length) return;
    stopCaptureTimelinePlayback();
    setIsCapturePanelOpen(false);
    const playbackMode = options?.playbackMode ?? "once";
    const firstSceneTime = sourceScenes[0]?.timestampMs ?? 0;
    const startCursorMs = Math.max(
      firstSceneTime,
      options?.startCursorMs ?? (options?.fromStart ? firstSceneTime : captureTimelineCursorMs)
    );
    const startIndex = Math.max(
      0,
      sourceScenes.findIndex((scene, index) => {
        const nextScene = sourceScenes[index + 1];
        const sceneStart = scene.timestampMs ?? 0;
        const nextSceneStart = nextScene?.timestampMs ?? Number.POSITIVE_INFINITY;
        return startCursorMs >= sceneStart && startCursorMs < nextSceneStart;
      })
    );
    const playbackScenes = sourceScenes.slice(startIndex).map((scene) => ({
      ...scene,
      viewerState: resolveCaptureSceneViewerState(scene),
      transitionEasing: scene.transitionEasing ?? "ease-in-out",
    }));
    if (playbackScenes.length === 1) {
      setIsCapturePanelOpen(false);
      handleApplyCaptureScene(playbackScenes[0].id);
      return;
    }
    const firstScene = playbackScenes[0];
    captureTimelinePlaybackModeRef.current = playbackMode;
    applyCaptureScene(firstScene, {
      preserveActiveTool: true,
      suppressAutoCommit: true,
      syncCamera: true,
    });
    setActiveCaptureSceneId(firstScene.id);
    setCaptureTimelineCursorMs(startCursorMs);
    setIsCaptureTimelinePaused(false);
    setIsCaptureTimelinePlaying(true);
    const playbackToken = captureTimelineTokenRef.current + 1;
    captureTimelineTokenRef.current = playbackToken;
    captureTimelineFrameRef.current = window.requestAnimationFrame(() => {
      if (captureTimelineTokenRef.current !== playbackToken) return;
      captureTimelineFrameRef.current = window.requestAnimationFrame(() => {
        if (captureTimelineTokenRef.current !== playbackToken) return;
        beginCaptureTimelineLoop(playbackScenes, playbackToken, startCursorMs, playbackMode);
      });
    });
  }

  function handlePauseCaptureTimeline() {
    if (!isCaptureTimelinePlaying) return;
    pauseCaptureTimelinePlayback();
  }

  function handleToggleCaptureTimelinePlayback() {
    if (isCaptureTimelinePlaying) {
      handlePauseCaptureTimeline();
      return;
    }
    if (isCaptureTimelinePaused) {
      handlePlayCaptureTimeline({ playbackMode: captureTimelinePlaybackModeRef.current });
      return;
    }
    handlePlayCaptureTimeline({ playbackMode: captureTimelinePlaybackModeRef.current });
  }

  function handlePlayCaptureSequenceFromLibrary(
    sequenceId: string,
    playbackMode: CaptureTimelinePlaybackMode = "once"
  ) {
    const sequence = captureSequences.find((entry) => entry.id === sequenceId);
    if (!sequence) return;
    const nextScenes = cloneCaptureScenes(sequence.scenes);
    setCaptureScenes(nextScenes);
    setActiveCaptureSceneId(nextScenes[0]?.id ?? null);
    setCaptureTimelineCursorMs(sequence.cursorMs ?? 0);
    setCaptureTimelineZoom(clampCaptureTimelineZoom(sequence.zoom ?? DEFAULT_CAPTURE_TIMELINE_ZOOM));
    setActiveCaptureSequenceId(sequence.id);
    setIsCapturePanelOpen(false);
    setActiveTool((current) => (current === "capture" ? "mouse" : current));
    handlePlayCaptureTimeline({
      fromStart: true,
      playbackMode,
      scenes: nextScenes,
      startCursorMs: nextScenes[0]?.timestampMs ?? 0,
    });
  }

  function handleDeleteCaptureScene(sceneId: string) {
    const scene = captureScenes.find((entry) => entry.id === sceneId);
    if (!scene) return;
    pushCaptureTimelineHistorySnapshot();
    if (isCaptureTimelinePlaying) {
      stopCaptureTimelinePlayback({ resetSceneId: activeCaptureSceneId });
    }
    setCaptureScenes((prev) => prev.filter((entry) => entry.id !== sceneId));
    setActiveCaptureSceneId((prev) => (prev === sceneId ? null : prev));
    if (activeCaptureSceneId === sceneId) {
      setCaptureTimelineCursorMs(scene.timestampMs ?? captureTimelineCursorMs);
    }
  }

  function handleDownloadCaptureScene(sceneId: string) {
    const scene = captureScenes.find((entry) => entry.id === sceneId);
    const imageDataUrl = scene?.thumbnailDataUrl;
    if (!scene || !imageDataUrl) return;
    const blob = dataUrlToBlob(imageDataUrl);
    if (!blob) {
      enqueueToast({
        tone: "error",
        title: "Scene screen shot unavailable",
        message: "This timeline scene preview could not be prepared for download.",
      }, { dedupeKey: `capture-scene-download:${sceneId}`, dedupeWindowMs: 3000 });
      return;
    }
    downloadBlob(blob, `${scene.name || "scene"}-${formatCaptureTimelineTime(scene.timestampMs ?? 0).replace(/[^0-9a-z]+/gi, "-")}.png`);
  }

  function getCaptureTimelineMsFromClientX(clientX: number) {
    const viewport = captureTimelineViewportRef.current;
    if (!viewport) return captureTimelineCursorMs;
    const rect = viewport.getBoundingClientRect();
    const localX = clientX - rect.left + viewport.scrollLeft - 28;
    const nextMs = localX / Math.max(captureTimelinePixelsPerMs, 1e-6);
    const boundedMs = Math.max(0, Math.round(nextMs));
    ensureCaptureTimelineRange(boundedMs);
    return boundedMs;
  }

  function handleCaptureTimelineBackgroundPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    const nextMs = getCaptureTimelineMsFromClientX(event.clientX);
    setCaptureTimelineCursorMs(nextMs);
    setCaptureTimelineHoverMs(nextMs);
    setActiveCaptureSceneId(null);
  }

  function handleCaptureTimelineScenePointerDown(event: ReactPointerEvent<HTMLElement>, sceneId: string) {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const scene = captureScenes.find((entry) => entry.id === sceneId);
    if (!scene) return;
    captureTimelineDragRef.current = {
      sceneId,
      startMs: scene.timestampMs ?? 0,
      originClientX: event.clientX,
      hasMoved: false,
    };
    setActiveCaptureSceneId(sceneId);
    setCaptureTimelineCursorMs(scene.timestampMs ?? 0);
  }

  function handleCaptureTimelineWheel(event: ReactWheelEvent<HTMLDivElement>) {
    if (!event.currentTarget.contains(event.target as Node)) return;
    event.preventDefault();
    const viewport = captureTimelineViewportRef.current;
    if (!viewport) return;
    const nextZoom = clampCaptureTimelineZoom(
      captureTimelineZoom * (event.deltaY < 0 ? 1.12 : 1 / 1.12)
    );
    if (nextZoom === captureTimelineZoom) return;

    const rect = viewport.getBoundingClientRect();
    const localX = event.clientX - rect.left - 28;
    const timeAtPointerMs =
      (viewport.scrollLeft + localX) / Math.max(captureTimelinePixelsPerMs, 1e-6);
    const nextPixelsPerMs = (CAPTURE_TIMELINE_BASE_PX_PER_SECOND * nextZoom) / 1000;
    const targetVisibleEndMs =
      timeAtPointerMs + (viewport.clientWidth / Math.max(nextPixelsPerMs, 1e-6));
    ensureCaptureTimelineRange(targetVisibleEndMs);
    setCaptureTimelineZoom(nextZoom);
    window.requestAnimationFrame(() => {
      const currentViewport = captureTimelineViewportRef.current;
      if (!currentViewport) return;
      currentViewport.scrollLeft = Math.max(
        0,
        timeAtPointerMs * nextPixelsPerMs - localX
      );
    });
  }

  useEffect(() => {
    const furthestSceneMs = orderedCaptureScenes.length ? orderedCaptureScenes[orderedCaptureScenes.length - 1].timestampMs ?? 0 : 0;
    ensureCaptureTimelineRange(Math.max(furthestSceneMs, captureTimelineCursorMs, captureTimelineHoverMs ?? 0));
  }, [orderedCaptureScenes, captureTimelineCursorMs, captureTimelineHoverMs]);

  useEffect(() => {
    function handleWindowPointerMove(event: PointerEvent) {
      const drag = captureTimelineDragRef.current;
      if (!drag) return;
      const deltaMs = Math.round((event.clientX - drag.originClientX) / Math.max(captureTimelinePixelsPerMs, 1e-6));
      if (!drag.hasMoved && Math.abs(deltaMs) > 0) {
        pushCaptureTimelineHistorySnapshot();
        drag.hasMoved = true;
      }
      const nextTimestampMs = Math.max(0, drag.startMs + deltaMs);
      setCaptureScenes((prev) =>
        prev.map((scene) =>
          scene.id === drag.sceneId
            ? {
                ...scene,
                timestampMs: nextTimestampMs,
                updatedAt: Date.now(),
              }
            : scene
        )
      );
      setCaptureTimelineCursorMs(nextTimestampMs);
      setCaptureTimelineHoverMs(nextTimestampMs);
    }

    function handleWindowPointerUp() {
      if (!captureTimelineDragRef.current) return;
      captureTimelineDragRef.current = null;
      setCaptureTimelineHoverMs(null);
    }

    window.addEventListener("pointermove", handleWindowPointerMove);
    window.addEventListener("pointerup", handleWindowPointerUp);
    return () => {
      window.removeEventListener("pointermove", handleWindowPointerMove);
      window.removeEventListener("pointerup", handleWindowPointerUp);
    };
  }, [captureTimelinePixelsPerMs]);

  const handleImageCaptureComplete = useCallback(async (result: { ok: boolean; blob?: Blob; error?: string }) => {
    setIsCapturePending(false);
    setCaptureRequestLayerIds([]);
    setCaptureRequestSliceCrop(null);
    if (!result.ok || !result.blob) {
      pendingCaptureStillRef.current = null;
      const message = result.error ?? "The viewer could not create the PNG capture.";
      console.warn(message);
      enqueueToast({
        tone: "error",
        title: "Image capture failed",
        message,
      }, { dedupeKey: `image-capture-error:${message}`, dedupeWindowMs: 3000 });
      return;
    }

    const pendingStill = pendingCaptureStillRef.current;
    pendingCaptureStillRef.current = null;
    const fileName = pendingStill?.fileName ?? buildCaptureFileName();
    downloadBlob(result.blob, fileName);

    if (!pendingStill) {
      return;
    }

    try {
      const imageDataUrl = await blobToDataUrl(result.blob);
      const nextStill: PersistedCaptureScene = {
        ...pendingStill.scene,
        thumbnailDataUrl: imageDataUrl,
        capturedImageDataUrl: imageDataUrl,
        updatedAt: Date.now(),
      };
      setCaptureStills((prev) => [nextStill, ...prev.filter((entry) => entry.id !== nextStill.id)]);
      setActiveCaptureStillId(nextStill.id);
    } catch (error) {
      console.warn("Failed to persist capture still preview.", error);
    }
  }, []);

  useEffect(() => {
    if (activeTool !== "resources") return;
    setIsResourceManagerOpen(true);
    setActiveTool("mouse");
  }, [activeTool]);

  function handleToggleVisible(nodeId: string) {
    setLayerTree((prev) => {
      const target = findNodeById(prev, nodeId);
      if (!target) return prev;
      return setNodeVisibleState(prev, nodeId, !target.visible);
    });
  }

  function handleLayerPanelSelectionChange(nodeIds: string[], preferredNodeId: string) {
    const orderedUnique = Array.from(new Set(nodeIds.filter((id) => typeof id === "string" && id.length > 0)));
    if (!orderedUnique.length) return;
    setSelectedNodeIdsExternal(orderedUnique);
    setSelectedNodeId(preferredNodeId || orderedUnique[orderedUnique.length - 1] || orderedUnique[0]);
  }

  function handleSelectNode(nodeId: string) {
    setSelectedNodeId(nodeId);
    setSelectedNodeIdsExternal([nodeId]);
    runAutomationForSelection(nodeId);
  }

  function resolveManagedSourceDetailsIdFromNode(node: LayerTreeNode | null): string | null {
    if (!node || node.kind !== "layer") return null;

    if (
      node.type === "file" &&
      node.sourceKind === "custom-upload" &&
      typeof node.source === "string"
    ) {
      return node.source;
    }

    if (
      node.type === "remote" &&
      node.sourceKind === "external" &&
      typeof node.source === "string"
    ) {
      const sourceUrl = node.source;
      const matchingSource = getCustomExternalSources().find(
        (source) => source.url.trim() === sourceUrl.trim()
      );
      return matchingSource?.id ?? null;
    }

    if (
      node.type === "custom-slice" &&
      node.source &&
      typeof node.source === "object" &&
      "volumeLayerId" in node.source
    ) {
      const parentNode = findNodeById(layerTree, node.source.volumeLayerId);
      return resolveManagedSourceDetailsIdFromNode(parentNode ?? null);
    }

    return null;
  }

  function handleOpenSelectedLayerSourceDetails(nodeId: string) {
    const node = findNodeById(layerTree, nodeId);
    const sourceId = resolveManagedSourceDetailsIdFromNode(node ?? null);
    if (!sourceId) return;
    setRequestedLocalDatasetManagerSourceId(sourceId);
    setIsImportPanelOpen(false);
    setImportPanelView("library");
    setDroppedLocalEntries(null);
    setIsLocalDatasetManagerOpen(true);
  }

  function handleSelectSceneLayer(nodeId: string | null, options?: { toggle?: boolean }) {
    if (!nodeId) {
      setSelectedNodeId(null);
      setSelectedNodeIdsExternal(null);
      runAutomationForSelection(null);
      return;
    }

    const isToggle = !!options?.toggle;
    setSelectedNodeIdsExternal((prev) => {
      const current = Array.from(new Set((prev ?? (selectedNodeId ? [selectedNodeId] : [])).filter(Boolean)));
      let next: string[];
      if (isToggle) {
        next = current.includes(nodeId)
          ? current.filter((id) => id !== nodeId)
          : [...current, nodeId];
        if (!next.length) next = [nodeId];
      } else {
        next = [nodeId];
      }
      return next;
    });
    setSelectedNodeId(nodeId);
    runAutomationForSelection(nodeId);
  }

  function handleSelectSceneLayers(
    nodeIds: string[],
    options?: { append?: boolean; preferredNodeId?: string | null; captureAfterSelect?: boolean }
  ) {
    const orderedUnique = Array.from(new Set(nodeIds.filter((id) => typeof id === "string" && id.length > 0)));
    if (!orderedUnique.length) return;
    const append = !!options?.append;
    setSelectedNodeIdsExternal((prev) => {
      const base = append ? Array.from(new Set((prev ?? (selectedNodeId ? [selectedNodeId] : [])).filter(Boolean))) : [];
      const merged = append ? Array.from(new Set([...base, ...orderedUnique])) : orderedUnique;
      return merged.length ? merged : null;
    });
    const nextSelectedNodeId = options?.preferredNodeId ?? orderedUnique[orderedUnique.length - 1] ?? orderedUnique[0];
    setSelectedNodeId(nextSelectedNodeId);
    runAutomationForSelection(nextSelectedNodeId);
  }

  function handleToggleGroupExpanded(groupId: string) {
    setLayerTree((prev) => toggleGroupExpandedById(prev, groupId));
  }

  function handleSetGroupExpanded(groupId: string, expanded: boolean) {
    setLayerTree((prev) => setGroupExpandedById(prev, groupId, expanded));
  }

  function addNodeAtBestLocation(newNode: LayerTreeNode) {
    setLayerTree((prev) => {
      const selected = selectedNodeId ? findNodeById(prev, selectedNodeId) : null;

      if (selected && isGroupNode(selected)) {
        return insertIntoGroup(prev, selected.id, newNode);
      }

      return [...prev, newNode];
    });
  }

  function buildLocalLayerDisplayName(baseName: string, options: { renderMode?: RemoteRenderMode; selectedResolution?: string | null; kind?: string | null }) {
    const modeLabel = options.renderMode && options.renderMode !== "auto"
      ? (options.renderMode === "volume" ? "Volume" : "Slices")
      : null;
    const resolutionLabel = options.selectedResolution ? options.selectedResolution.replace("um", " µm") : null;
    const suffix = [modeLabel, resolutionLabel].filter(Boolean).join(" · ");
    if (options.kind === "volume" && suffix) return `${baseName} (${suffix})`;
    return baseName;
  }

  async function handleRenameLocalDataset(datasetId: string, nextName: string) {
    const trimmed = nextName.trim();
    if (!trimmed) return;
    await renameLocalDatasetRecord(datasetId, trimmed);
    setLayerTree((prev) => {
      const visit = (nodes: LayerTreeNode[]): LayerTreeNode[] => nodes.map((node) => {
        if (node.kind === "group") return { ...node, children: visit(node.children) };
        if (node.type === "file" && node.sourceKind === "custom-upload" && typeof node.source === "string" && node.source === datasetId) {
          const info = node.localDatasetInfo ?? null;
          return {
            ...node,
            name: buildLocalLayerDisplayName(trimmed, {
              renderMode: node.renderMode,
              selectedResolution: info?.selectedResolution ?? null,
              kind: info?.kind ?? node.localDataKind ?? null,
            }),
            localDatasetInfo: info ? { ...info, fileName: trimmed } : info,
          };
        }
        return node;
      });
      return visit(prev);
    });
  }

  async function handleDeleteLocalDataset(datasetId: string) {
    await deleteLocalDatasetRecord(datasetId);
    setLayerTree((prev) => {
      const matchingIds = collectAllLayerItems(prev)
        .filter((node) => node.type === "file" && node.sourceKind === "custom-upload" && typeof node.source === "string" && node.source === datasetId)
        .map((node) => node.id);
      if (!matchingIds.length) return prev;
      const next = removeNodesByIds(prev, matchingIds).tree;
      reconcileSelectionAfterTreeMutation(next, matchingIds);
      return next;
    });
  }

  function buildLocalLayerNode(
    candidate: LocalImportCandidate,
    datasetId: string,
    options?: { renderMode?: Exclude<RemoteRenderMode, "auto">; selectedResolution?: string | null }
  ): LayerTreeNode {
    const renderMode = candidate.inspection.kind === "volume"
      ? (options?.renderMode ?? candidate.inspection.renderMode ?? "slices")
      : undefined;
    const resolvedInfo = {
      ...candidate.inspection.info,
      selectedResolution: options?.selectedResolution ?? candidate.inspection.info.selectedResolution,
    };
    const displayName = buildLocalLayerDisplayName(candidate.name, {
      renderMode,
      selectedResolution: resolvedInfo.selectedResolution,
      kind: candidate.inspection.kind,
    });

    return applyOrientationPreferenceToLayer({
      id: createId(),
      kind: "layer",
      name: displayName,
      type: "file",
      visible: true,
      source: datasetId,
      sourceKind: "custom-upload",
      mimeType: candidate.inspection.info.mimeType || undefined,
      description: "Stored only in this browser. This layer is not included in share links.",
      renderMode,
      localOnly: true,
      localDataFormat: candidate.inspection.format,
      localDataKind: candidate.inspection.kind,
      localDatasetInfo: {
        ...resolvedInfo,
        datasetId,
      },
    });
  }

  function addLayerNodes(nodes: LayerTreeNode[]) {
    if (!nodes.length) return;
    setLayerTree((prev) => {
      let next = prev;

      for (const node of nodes) {
        const selected = selectedNodeId ? findNodeById(next, selectedNodeId) : null;
        if (selected && isGroupNode(selected)) {
          next = insertIntoGroup(next, selected.id, node);
        } else {
          next = [...next, node];
        }
      }

      return next;
    });
  }

  async function handleImportLocalSources(
    candidates: LocalImportCandidate[]
  ): Promise<{ importedCount: number; importedRecords: StoredLocalDatasetRecord[]; errors: string[] }> {
    if (!candidates.length) return { importedCount: 0, importedRecords: [], errors: [] };

    const importedRecords: StoredLocalDatasetRecord[] = [];
    const errors: string[] = [];

    for (const candidate of candidates) {
      try {
        const isTree = candidate.entries.length > 1 || candidate.inspection.format === "ome-zarr" || candidate.inspection.format === "zarr";
        const stored = isTree
          ? await storeLocalDatasetTree(candidate.name, candidate.entries)
          : await storeLocalDatasetFile(candidate.entries[0].file);
        importedRecords.push(stored);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unsupported local dataset.";
        errors.push(`${candidate.name}: ${message}`);
      }
    }

    return { importedCount: importedRecords.length, importedRecords, errors };
  }

  async function handleAddStoredLocalSources(
    entries: Array<{ datasetId: string; renderMode?: Exclude<RemoteRenderMode, "auto">; selectedResolution?: string }>
  ): Promise<{ addedCount: number; errors: string[] }> {
    if (!entries.length) return { addedCount: 0, errors: [] };

    const addedNodes: LayerTreeNode[] = [];
    const errors: string[] = [];

    for (const entry of entries) {
      try {
        const candidate = await inspectStoredLocalDatasetById(entry.datasetId);
        addedNodes.push(buildLocalLayerNode(candidate, entry.datasetId, {
          renderMode: entry.renderMode,
          selectedResolution: entry.selectedResolution ?? null,
        }));
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unsupported local dataset.";
        errors.push(`${entry.datasetId}: ${message}`);
      }
    }

    if (addedNodes.length > 0) {
      addLayerNodes(addedNodes);
    }

    if (errors.length > 0 && addedNodes.length === 0) {
      setStateError(errors.join("\n"));
      setStateShareMessage(null);
    } else {
      setStateError(null);
      setStateShareMessage(null);
    }

    return { addedCount: addedNodes.length, errors };
  }

  function handleAddGroup() {
    const newGroup: LayerTreeNode = {
      id: createId(),
      kind: "group",
      name: "New Group",
      visible: true,
      expanded: true,
      children: [],
    };

    addNodeAtBestLocation(newGroup);
  }

  function handleOpenAddLayer() {
    setImportPanelView("library");
    setIsImportPanelOpen(true);
  }

  function handleCreatePointAnnotationAtHit(hit: ScenePointerHit) {
    const id = createId();
    const name = `Point ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}`;

    addNodeAtBestLocation({
      id,
      kind: "layer",
      name,
      type: "annotation",
      visible: true,
      source: "drawing-layer",
      sourceKind: "drawing",
      description: `Point annotation on ${hit.layerName}`,
      annotation: {
        shape: "point",
        color: annotationDraft.color,
        opacity: annotationDraft.opacity,
        size: annotationDraft.size,
        metadata: "",
        points: [[hit.position[0], hit.position[1], hit.position[2]]],
        normal: [hit.normal[0], hit.normal[1], hit.normal[2]],
        attachedLayerId: hit.layerId,
        attachedLayerName: hit.layerName,
      },
    });

    setSelectedNodeId(id);
  }

  function handleCommitFreehandStroke(stroke: {
    points: [number, number, number][];
    normals: [number, number, number][];
    attachedLayerId?: string;
    attachedLayerName?: string;
  }) {
    if (stroke.points.length === 0) return;

    let reusedLayerId: string | null = null;

    setLayerTree((prev) => {
      let targetLayerId: string | null = null;
      const selectedNode = selectedNodeId ? findNodeById(prev, selectedNodeId) : null;
      if (
        selectedNode &&
        selectedNode.kind === "layer" &&
        selectedNode.type === "annotation" &&
        selectedNode.annotation?.shape === "freehand" &&
        selectedNode.annotation?.color?.toLowerCase() === annotationDraft.color.toLowerCase()
      ) {
        targetLayerId = selectedNode.id;
      }

      if (!targetLayerId) {
        const existing = collectAllLayerItems(prev).find((layer) =>
          layer.type === "annotation" &&
          layer.annotation?.shape === "freehand" &&
          (layer.annotation?.color ?? "").toLowerCase() === annotationDraft.color.toLowerCase()
        );
        targetLayerId = existing?.id ?? null;
      }

      if (targetLayerId) {
        reusedLayerId = targetLayerId;
        return updateNodeById(prev, targetLayerId, (node) => {
          if (node.kind !== "layer" || node.type !== "annotation") return node;
          return {
            ...node,
            annotation: {
              ...node.annotation,
              shape: "freehand",
              color: node.annotation?.color ?? annotationDraft.color,
              opacity: node.annotation?.opacity ?? annotationDraft.opacity,
              size: annotationDraft.size,
              brushDepth: annotationDraft.depth,
              metadata: node.annotation?.metadata ?? "",
              freehandStrokes: [
                ...(node.annotation?.freehandStrokes ?? []),
                {
                  points: stroke.points,
                  normals: stroke.normals,
                  attachedLayerId: stroke.attachedLayerId,
                  attachedLayerName: stroke.attachedLayerName,
                },
              ],
            },
          };
        });
      }

      const id = createId();
      reusedLayerId = id;
      
      const selected = selectedNodeId ? findNodeById(prev, selectedNodeId) : null;
      const createdNode: LayerItemNode = {
        id,
        kind: "layer",
        name: `Pencil ${annotationDraft.color.toUpperCase()}`,
        type: "annotation",
        visible: true,
        source: "drawing-layer",
        sourceKind: "drawing",
        description: `Freehand annotation on ${stroke.attachedLayerName ?? "surface"}`,
        annotation: {
          shape: "freehand",
          color: annotationDraft.color,
          opacity: annotationDraft.opacity,
          size: annotationDraft.size,
          brushDepth: annotationDraft.depth,
          metadata: "",
          attachedLayerId: stroke.attachedLayerId,
          attachedLayerName: stroke.attachedLayerName,
          freehandStrokes: [{
            points: stroke.points,
            normals: stroke.normals,
            attachedLayerId: stroke.attachedLayerId,
            attachedLayerName: stroke.attachedLayerName,
          }],
        },
      };

      if (selected && isGroupNode(selected)) {
        return insertIntoGroup(prev, selected.id, createdNode);
      }

      return [...prev, createdNode];
    });

    if (reusedLayerId) {
      setSelectedNodeId(reusedLayerId);
    }
  }

  function handleEraseFreehandStroke(payload: {
    path: [number, number, number][];
    radius: number;
  }) {
    if (payload.path.length === 0) return;

    const radiusSq = payload.radius * payload.radius;
    const targetColor = annotationDraft.color.toLowerCase();

    function isErased(point: [number, number, number]) {
      for (const erasePoint of payload.path) {
        const dx = point[0] - erasePoint[0];
        const dy = point[1] - erasePoint[1];
        const dz = point[2] - erasePoint[2];
        if (dx * dx + dy * dy + dz * dz <= radiusSq) return true;
      }
      return false;
    }

    function splitStroke(points: [number, number, number][], normals: [number, number, number][] | undefined) {
      const segments: Array<{ points: [number, number, number][]; normals: [number, number, number][] }> = [];
      let currentPoints: [number, number, number][] = [];
      let currentNormals: [number, number, number][] = [];

      for (let i = 0; i < points.length; i += 1) {
        const point = points[i];
        const erased = isErased(point);
        if (!erased) {
          currentPoints.push(point);
          currentNormals.push(normals?.[i] ?? [0, 0, 1]);
        } else if (currentPoints.length > 0) {
          segments.push({ points: currentPoints, normals: currentNormals });
          currentPoints = [];
          currentNormals = [];
        }
      }

      if (currentPoints.length > 0) {
        segments.push({ points: currentPoints, normals: currentNormals });
      }

      return segments;
    }

    setLayerTree((prev) => {
      function updateNodes(nodes: LayerTreeNode[]): LayerTreeNode[] {
        return nodes.flatMap((node): LayerTreeNode[] => {
          if (node.kind === "group") {
            return [{ ...node, children: updateNodes(node.children) }];
          }
          if (node.type !== "annotation" || node.annotation?.shape !== "freehand") {
            return [node];
          }
          if (annotationDraft.eraseMode === "color" && (node.annotation?.color ?? "").toLowerCase() !== targetColor) {
            return [node];
          }

          const existingStrokes = node.annotation?.freehandStrokes ?? [];
          const rewritten = existingStrokes.flatMap((stroke) =>
            splitStroke(stroke.points, stroke.normals).map((segment) => ({
              ...stroke,
              points: segment.points,
              normals: segment.normals,
            }))
          );

          if (rewritten.length === existingStrokes.length && rewritten.every((stroke, index) => stroke.points.length === existingStrokes[index]?.points.length)) {
            return [node];
          }

          if (rewritten.length === 0) {
            return [];
          }

          return [{
            ...node,
            annotation: {
              ...node.annotation,
              freehandStrokes: rewritten,
            },
          }];
        });
      }
      return updateNodes(prev);
    });
  }


  function handleCreateLineAnnotation(params: {
    start: ScenePointerHit;
    end: ScenePointerHit;
  }) {
    const id = createId();
    const name = `Line ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}`;

    addNodeAtBestLocation({
      id,
      kind: "layer",
      name,
      type: "annotation",
      visible: true,
      source: "drawing-layer",
      sourceKind: "drawing",
      description: `Line annotation on ${params.start.layerName}`,
      annotation: {
        shape: "line",
        color: annotationDraft.color,
        opacity: annotationDraft.opacity,
        size: annotationDraft.size,
        metadata: "",
        points: [
          [params.start.position[0], params.start.position[1], params.start.position[2]],
          [params.end.position[0], params.end.position[1], params.end.position[2]],
        ],
        normal: [params.start.normal[0], params.start.normal[1], params.start.normal[2]],
        attachedLayerId: params.start.layerId,
        attachedLayerName: params.start.layerName,
      },
    });

    setSelectedNodeId(id);
  }

  function handleCreateShapeAnnotation(params: {
    shape: "rectangle" | "circle";
    points: [number, number, number][];
    normal: [number, number, number];
    layerId: string;
    layerName: string;
  }) {
    if (!params.points.length) return;
    const id = createId();
    const label = params.shape === "rectangle" ? "Rectangle" : "Circle";
    const name = `${label} ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}`;

    addNodeAtBestLocation({
      id,
      kind: "layer",
      name,
      type: "annotation",
      visible: true,
      source: "drawing-layer",
      sourceKind: "drawing",
      description: `${label} annotation on ${params.layerName}`,
      annotation: {
        shape: params.shape,
        color: annotationDraft.color,
        opacity: annotationDraft.opacity,
        size: annotationDraft.size,
        metadata: "",
        points: params.points.map((point) => [point[0], point[1], point[2]] as [number, number, number]),
        normal: [params.normal[0], params.normal[1], params.normal[2]],
        attachedLayerId: params.layerId,
        attachedLayerName: params.layerName,
      },
    });

    setSelectedNodeId(id);
  }
  function handleAddDrawingLayer(name?: string) {
    const prettyShape =
      annotationDraft.shape === "freehand"
        ? "Pencil"
        : annotationDraft.shape === "rectangle"
        ? "Rectangle"
        : annotationDraft.shape.charAt(0).toUpperCase() + annotationDraft.shape.slice(1);

    addNodeAtBestLocation({
      id: createId(),
      kind: "layer",
      name: name?.trim() || `${prettyShape} Annotation`,
      type: "annotation",
      visible: true,
      source: "drawing-layer",
      sourceKind: "drawing",
      description: "User-created annotation layer",
      annotation: {
        shape: annotationDraft.shape,
        color: annotationDraft.color,
        opacity: annotationDraft.opacity,
        size: annotationDraft.size,
        metadata: "",
      },
    });

  }

  function handleCreateNoteAnnotation() {
    const id = createId();
    const name = `Note ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}`;
    const noteLayer: LayerItemNode = {
      id,
      kind: "layer",
      name,
      type: "annotation",
      visible: true,
      source: "drawing-layer",
      sourceKind: "drawing",
      description: "Written note annotation",
      annotation: {
        shape: "note",
        color: annotationDraft.color,
        opacity: annotationDraft.opacity,
        size: annotationDraft.size,
        metadata: "",
      },
    };

    addNodeAtBestLocation(noteLayer);
    setSelectedNodeId(id);
    openMetadataWindowForLayer(noteLayer);
  }

  function updateSelectedAnnotationLayer(patch: Partial<NonNullable<LayerItemNode["annotation"]>>) {
    if (!selectedNodeId) return;

    if (patch.color) {
      pushRecentAnnotationColor(patch.color);
    }

    setLayerTree((prev) =>
      updateNodeById(prev, selectedNodeId, (node) => {
        if (node.kind !== "layer" || node.type !== "annotation") return node;
        return {
          ...node,
          annotation: {
            shape: node.annotation?.shape ?? annotationDraft.shape,
            color: node.annotation?.color ?? annotationDraft.color,
            opacity: node.annotation?.opacity ?? annotationDraft.opacity,
            size: node.annotation?.size ?? annotationDraft.size,
            brushDepth: node.annotation?.brushDepth ?? annotationDraft.depth,
            metadata: node.annotation?.metadata ?? "",
            ...node.annotation,
            ...patch,
          },
        };
      })
    );
  }

  function updateAnnotationLayerById(
    nodeId: string,
    patch: Partial<NonNullable<LayerItemNode["annotation"]>>
  ) {
    if (patch.color) {
      pushRecentAnnotationColor(patch.color);
    }

    setLayerTree((prev) =>
      updateNodeById(prev, nodeId, (node) => {
        if (node.kind !== "layer" || node.type !== "annotation") return node;
        return {
          ...node,
          annotation: {
            shape: node.annotation?.shape ?? annotationDraft.shape,
            color: node.annotation?.color ?? annotationDraft.color,
            opacity: node.annotation?.opacity ?? annotationDraft.opacity,
            size: node.annotation?.size ?? annotationDraft.size,
            brushDepth: node.annotation?.brushDepth ?? annotationDraft.depth,
            metadata: node.annotation?.metadata ?? "",
            ...node.annotation,
            ...patch,
          },
        };
      })
    );
  }

  function normalizeTransformVector(
    value: number[] | undefined,
    fallback: [number, number, number]
  ): [number, number, number] {
    return [
      Number.isFinite(value?.[0]) ? Number(value![0]) : fallback[0],
      Number.isFinite(value?.[1]) ? Number(value![1]) : fallback[1],
      Number.isFinite(value?.[2]) ? Number(value![2]) : fallback[2],
    ];
  }

  function updateSelectedNodeOpacity(opacity: number) {
    if (!selectedNodeId) return;
    const safeOpacity = Math.max(0, Math.min(1, opacity));
    setLayerTree((prev) =>
      updateNodeById(prev, selectedNodeId, (node) => ({
        ...node,
        opacity: safeOpacity,
      }))
    );
  }

  function updateSelectedNodeIntensityWindow(window: IntensityWindow) {
    if (!selectedNodeId) return;
    const safeMin = Math.max(0, Math.min(0.99, window.min));
    const safeMax = Math.max(safeMin + 0.01, Math.min(1, window.max));
    setLayerTree((prev) =>
      updateNodeById(prev, selectedNodeId, (node) => ({
        ...node,
        intensityWindow: {
          min: safeMin,
          max: safeMax,
        },
      }))
    );
  }

  function updateSelectedNodeMeshStyle(patch: Partial<MeshStyle>) {
    if (!selectedNodeId) return;

    setLayerTree((prev) =>
      updateNodeById(prev, selectedNodeId, (node) => {
        if (node.kind !== "layer") return node;
        const current = node.meshStyle ?? {};
        return {
          ...node,
          meshStyle: {
            color:
              patch.color !== undefined
                ? normalizeHexColor(patch.color)
                : current.color,
            lineWidth:
              patch.lineWidth !== undefined
                ? Math.max(
                    0.5,
                    Math.min(
                      6,
                      Number.isFinite(patch.lineWidth)
                        ? Number(patch.lineWidth)
                        : current.lineWidth ?? 1.6
                    )
                  )
                : current.lineWidth,
          },
        };
      })
    );
  }

  function updateSelectedNodeTransform(patch: Partial<NodeTransform>) {
    if (!selectedNodeId) return;

    setLayerTree((prev) => {
      let nextTransform: NodeTransform | null = null;
      let shouldSyncDerivedSlices = false;
      const next = updateNodeById(prev, selectedNodeId, (node) => {
        const currentTranslation = normalizeTransformVector(node.transform?.translation, [0, 0, 0]);
        const currentRotation = normalizeTransformVector(node.transform?.rotation, [0, 0, 0]);
        const currentScale = normalizeTransformVector(node.transform?.scale, [1, 1, 1]);

        const updatedNode = {
          ...node,
          transform: {
            translation: patch.translation
              ? normalizeTransformVector(patch.translation, currentTranslation)
              : currentTranslation,
            rotation: patch.rotation
              ? normalizeTransformVector(patch.rotation, currentRotation)
              : currentRotation,
            scale: patch.scale
              ? normalizeTransformVector(patch.scale, currentScale)
              : currentScale,
          },
        };
        if (
          updatedNode.kind === "layer" &&
          isCanonicalSliceBrowsableLayer(updatedNode)
        ) {
          nextTransform = updatedNode.transform;
          shouldSyncDerivedSlices = true;
        }
        return updatedNode;
      });
      if (!shouldSyncDerivedSlices || !nextTransform) {
        return next;
      }
      return updateDerivedCustomSlicesForVolume(
        next,
        selectedNodeId,
        (node) => ({
          ...node,
          transform: {
            translation: nextTransform?.translation
              ? [...nextTransform.translation]
              : undefined,
            rotation: nextTransform?.rotation
              ? [...nextTransform.rotation]
              : undefined,
            scale: nextTransform?.scale ? [...nextTransform.scale] : undefined,
          },
        })
      );
    });
  }

  function resetSelectedNodeTransform() {
    if (!selectedNodeId) return;
    setLayerTree((prev) => {
      let shouldSyncDerivedSlices = false;
      const next = updateNodeById(prev, selectedNodeId, (node) => {
        const updatedNode = {
          ...node,
          transform: {
            translation: [0, 0, 0] as [number, number, number],
            rotation: [0, 0, 0] as [number, number, number],
            scale: [1, 1, 1] as [number, number, number],
          },
        };
        if (
          updatedNode.kind === "layer" &&
          isCanonicalSliceBrowsableLayer(updatedNode)
        ) {
          shouldSyncDerivedSlices = true;
        }
        return updatedNode;
      });
      if (!shouldSyncDerivedSlices) {
        return next;
      }
      return updateDerivedCustomSlicesForVolume(next, selectedNodeId, (node) => ({
        ...node,
        transform: {
          translation: [0, 0, 0],
          rotation: [0, 0, 0],
          scale: [1, 1, 1],
        },
      }));
    });
  }

  function updateSelectedNodeOrientationPreset(
    preset: VolumeOrientationPresetId
  ) {
    if (!selectedNodeId) return;
    setLayerTree((prev) => {
      let shouldSyncDerivedSlices = false;
      const next = updateNodeById(prev, selectedNodeId, (node) => {
        if (node.kind !== "layer" || !isVolumeOrientationAdjustableLayer(node)) {
          return node;
        }
        const updatedNode = {
          ...node,
          orientationPreset: preset,
          axisSliceViewState: cloneAxisSliceViewState(
            getAxisSliceViewStateForOrientationPreset(preset)
          ),
          transform: cloneNodeTransformValue(
            getDefaultTransformForOrientationPreset(preset)
          ),
        };
        if (isCanonicalSliceBrowsableLayer(updatedNode)) {
          shouldSyncDerivedSlices = true;
        }
        return updatedNode;
      });
      if (!shouldSyncDerivedSlices) {
        return next;
      }
      const nextTransform = cloneNodeTransformValue(
        getDefaultTransformForOrientationPreset(preset)
      );
      return updateDerivedCustomSlicesForVolume(next, selectedNodeId, (node) => ({
        ...node,
        transform: cloneNodeTransformValue(nextTransform),
      }));
    });
  }

  function saveSelectedNodeTransformPreset(name: string) {
    const trimmedName = name.trim();
    if (!trimmedName || !selectedVolumeOrientationSourceKey) return;
    const currentNode =
      selectedNode && selectedNode.kind === "layer" ? selectedNode : null;
    if (!currentNode) return;
    const existingPreference =
      loadSourceOrientationPreference(selectedVolumeOrientationSourceKey);
    const nextPreset: StoredTransformPreset = {
      id: createId(),
      name: trimmedName,
      orientationPreset:
        currentNode.kind === "layer" && isVolumeOrientationAdjustableLayer(currentNode)
          ? getEffectiveVolumeOrientationPresetForLayer(currentNode)
          : "custom",
      axisSliceViewState:
        cloneAxisSliceViewState(
          currentNode.kind === "layer" ? currentNode.axisSliceViewState : undefined
        ) ?? undefined,
      transform: cloneNodeTransformValue(currentNode.transform),
    };
    saveSourceOrientationPreference(selectedVolumeOrientationSourceKey, {
      preset:
        currentNode.kind === "layer" && isVolumeOrientationAdjustableLayer(currentNode)
          ? getEffectiveVolumeOrientationPresetForLayer(currentNode)
          : existingPreference?.preset ?? "identity",
      axisSliceViewState:
        cloneAxisSliceViewState(
          currentNode.kind === "layer" && isVolumeOrientationAdjustableLayer(currentNode)
            ? currentNode.axisSliceViewState
            : existingPreference?.axisSliceViewState
        ) ?? undefined,
      transformPresets: [
        ...(existingPreference?.transformPresets ?? []),
        nextPreset,
      ],
    });
    setSourceOrientationRevision((prev) => prev + 1);
  }

  function applySelectedNodeTransformPreset(presetId: string) {
    const preset = selectedTransformPresets.find((item) => item.id === presetId);
    if (!preset || !selectedNodeId) return;
    setLayerTree((prev) => {
      let shouldSyncDerivedSlices = false;
      const next = updateNodeById(prev, selectedNodeId, (node) => {
        const updatedNode = {
          ...node,
          orientationPreset: preset.orientationPreset,
          axisSliceViewState:
            cloneAxisSliceViewState(preset.axisSliceViewState) ?? undefined,
          transform: cloneNodeTransformValue(preset.transform),
        };
        if (
          updatedNode.kind === "layer" &&
          isCanonicalSliceBrowsableLayer(updatedNode)
        ) {
          shouldSyncDerivedSlices = true;
        }
        return updatedNode;
      });
      if (!shouldSyncDerivedSlices) {
        return next;
      }
      return updateDerivedCustomSlicesForVolume(next, selectedNodeId, (node) => ({
        ...node,
        transform: cloneNodeTransformValue(preset.transform),
      }));
    });
  }

  function renameSelectedNodeTransformPreset(
    presetId: string,
    name: string
  ) {
    const trimmedName = name.trim();
    if (!trimmedName || !selectedVolumeOrientationSourceKey) return;
    const currentNode =
      selectedNode && selectedNode.kind === "layer" ? selectedNode : null;
    const existingPreference =
      loadSourceOrientationPreference(selectedVolumeOrientationSourceKey);
    if (!existingPreference) return;
    saveSourceOrientationPreference(selectedVolumeOrientationSourceKey, {
      preset:
        currentNode && isVolumeOrientationAdjustableLayer(currentNode)
          ? getEffectiveVolumeOrientationPresetForLayer(currentNode)
          : existingPreference.preset,
      axisSliceViewState:
        cloneAxisSliceViewState(
          currentNode && isVolumeOrientationAdjustableLayer(currentNode)
            ? currentNode.axisSliceViewState
            : existingPreference.axisSliceViewState
        ) ?? undefined,
      transformPresets: (existingPreference.transformPresets ?? []).map((item) =>
        item.id === presetId ? { ...item, name: trimmedName } : item
      ),
    });
    setSourceOrientationRevision((prev) => prev + 1);
  }

  function deleteSelectedNodeTransformPreset(presetId: string) {
    if (!selectedVolumeOrientationSourceKey) return;
    const currentNode =
      selectedNode && selectedNode.kind === "layer" ? selectedNode : null;
    const existingPreference =
      loadSourceOrientationPreference(selectedVolumeOrientationSourceKey);
    if (!existingPreference) return;
    saveSourceOrientationPreference(selectedVolumeOrientationSourceKey, {
      preset:
        currentNode && isVolumeOrientationAdjustableLayer(currentNode)
          ? getEffectiveVolumeOrientationPresetForLayer(currentNode)
          : existingPreference.preset,
      axisSliceViewState:
        cloneAxisSliceViewState(
          currentNode && isVolumeOrientationAdjustableLayer(currentNode)
            ? currentNode.axisSliceViewState
            : existingPreference.axisSliceViewState
        ) ?? undefined,
      transformPresets: (existingPreference.transformPresets ?? []).filter(
        (item) => item.id !== presetId
      ),
    });
    setSourceOrientationRevision((prev) => prev + 1);
  }


  function setAnnotationDraftShape(shape: AnnotationShape) {
    setAnnotationDraft((prev) => {
      const sizeByShape: AnnotationShapeSizeMap = {
        ...DEFAULT_ANNOTATION_SHAPE_SIZES,
        ...(prev.sizeByShape ?? DEFAULT_ANNOTATION_SHAPE_SIZES),
      };
      return {
        ...prev,
        shape,
        size: sizeByShape[shape] ?? prev.size ?? DEFAULT_ANNOTATION_SHAPE_SIZES[shape],
        sizeByShape,
      };
    });
    setActiveTool("pencil");
  }

  function handleRenameNode(nodeId: string, newName: string) {
    const trimmed = newName.trim();
    if (!trimmed) return;
    setLayerTree((prev) => renameNodeById(prev, nodeId, trimmed));
  }

  function applyDuplicatedLayerSelection(nodeIds: string[]) {
    if (!nodeIds.length) return;
    setSelectedNodeIdsExternal(nodeIds);
    setSelectedNodeId(nodeIds[nodeIds.length - 1] ?? nodeIds[0]);
  }

  function handleCopySelectedNodesToClipboard() {
    const selectionIds = selectedNodeIdsExternal ?? (selectedNodeId ? [selectedNodeId] : []);
    const topLevelSelection = collectTopLevelSelectedNodes(layerTree, selectionIds);
    if (!topLevelSelection.length) return false;

    layerClipboardRef.current = {
      sourceIds: topLevelSelection.map((node) => node.id),
      nodes: topLevelSelection.map((node) => cloneLayerTreeNodeSnapshot(node)),
    };
    return true;
  }

  function handleDuplicateNodes(nodeIds: string[]) {
    const uniqueIds = Array.from(new Set(nodeIds.filter((id) => typeof id === "string" && id.length > 0)));
    if (!uniqueIds.length) return false;

    const result = duplicateLayerNodesByIds(layerTree, uniqueIds);
    if (!result.duplicatedRootIds.length) return false;

    setLayerTree(result.tree);
    applyDuplicatedLayerSelection(result.duplicatedRootIds);
    return true;
  }

  function handleDuplicateNode(nodeId: string) {
    handleDuplicateNodes([nodeId]);
  }

  function handlePasteCopiedNodes() {
    const clipboard = layerClipboardRef.current;
    if (!clipboard?.nodes.length) return false;

    const inPlaceResult = duplicateLayerNodesByIds(layerTree, clipboard.sourceIds);
    const result = inPlaceResult.duplicatedRootIds.length
      ? inPlaceResult
      : appendClipboardNodesToRoot(layerTree, clipboard.nodes);
    if (!result.duplicatedRootIds.length) return false;

    setLayerTree(result.tree);
    applyDuplicatedLayerSelection(result.duplicatedRootIds);
    return true;
  }

  function reconcileSelectionAfterTreeMutation(next: LayerTreeNode[], removedIds: string[] = []) {
    const nextSelectedNodeId =
      selectedNodeId && !removedIds.includes(selectedNodeId) && findNodeById(next, selectedNodeId)
        ? selectedNodeId
        : getFirstLayerId(next);

    setSelectedNodeId(nextSelectedNodeId);
    setSelectedNodeIdsExternal((prev) => {
      if (!prev?.length) return prev;
      const filtered = prev.filter((id) => !removedIds.includes(id) && !!findNodeById(next, id));
      if (!filtered.length) return nextSelectedNodeId ? [nextSelectedNodeId] : null;
      return filtered;
    });

    const currentSliceVolumeStillExists =
      !!sliceVolumeLayerId && !removedIds.includes(sliceVolumeLayerId) && !!findNodeById(next, sliceVolumeLayerId);

    if (!currentSliceVolumeStillExists) {
      const nextOmeLayer = collectAllLayerItems(next).find((node) => isRemoteOmeLayer(node)) ?? null;
      setSliceVolumeLayerId(nextOmeLayer?.id ?? "");
    }
  }

  function handleDeleteNode(nodeId: string) {
    setLayerTree((prev) => {
      const next = deleteNodeById(prev, nodeId);
      reconcileSelectionAfterTreeMutation(next, [nodeId]);
      return next;
    });
  }

  function handleDeleteNodes(nodeIds: string[]) {
    const uniqueIds = Array.from(new Set(nodeIds));
    if (!uniqueIds.length) return;
    setLayerTree((prev) => {
      const next = removeNodesByIds(prev, uniqueIds).tree;
      reconcileSelectionAfterTreeMutation(next, uniqueIds);
      return next;
    });
  }

  function handleDeleteSelectedNodes() {
    const selectionIds = Array.from(
      new Set(
        (selectedNodeIdsExternal?.length
          ? selectedNodeIdsExternal
          : selectedNodeId
            ? [selectedNodeId]
            : []
        ).filter((nodeId) => {
          if (typeof nodeId !== "string" || nodeId.length === 0) return false;
          return !!findNodeById(layerTree, nodeId);
        })
      )
    );

    if (!selectionIds.length) return false;
    if (selectionIds.length === 1) {
      handleDeleteNode(selectionIds[0]);
    } else {
      handleDeleteNodes(selectionIds);
    }
    return true;
  }

  function handleCreateGroupFromNodes(nodeIds: string[]) {
    const uniqueIds = Array.from(new Set(nodeIds));
    if (uniqueIds.length < 2) return;

    setLayerTree((prev) => {
      const { tree: withoutNodes, removed } = removeNodesByIds(prev, uniqueIds);
      if (removed.length < 2) return prev;

      const newGroupId = createId();
      const newGroup: LayerTreeNode = {
        id: newGroupId,
        kind: "group",
        name: "New Group",
        visible: true,
        expanded: true,
        children: removed,
      };

      const next = [...withoutNodes, newGroup];
      setSelectedNodeId(newGroupId);
      reconcileSelectionAfterTreeMutation(next);
      return next;
    });
  }

  function handleDropNodesIntoGroup(nodeIds: string[], groupId: string) {
    const uniqueIds = Array.from(new Set(nodeIds)).filter((id) => id !== groupId);
    if (!uniqueIds.length) return;
    setLayerTree((prev) => {
      const { tree: withoutNodes, removed } = removeNodesByIds(prev, uniqueIds);
      if (!removed.length) return prev;
      return insertNodesIntoGroup(withoutNodes, groupId, removed);
    });
  }

  function handleDropNodesToRoot(nodeIds: string[]) {
    const uniqueIds = Array.from(new Set(nodeIds));
    if (!uniqueIds.length) return;
    setLayerTree((prev) => {
      const { tree: withoutNodes, removed } = removeNodesByIds(prev, uniqueIds);
      if (!removed.length) return prev;
      return [...withoutNodes, ...removed];
    });
  }

  function handleReorderNodesBefore(nodeIds: string[], overId: string) {
    const uniqueIds = Array.from(new Set(nodeIds)).filter((id) => id !== overId);
    if (!uniqueIds.length) return;
    setLayerTree((prev) => {
      const { tree: withoutNodes, removed } = removeNodesByIds(prev, uniqueIds);
      if (!removed.length) return prev;
      return insertNodesBeforeNode(withoutNodes, overId, removed);
    });
  }

  function handleDropNodeIntoGroup(nodeId: string, groupId: string) {
    setLayerTree((prev) => moveNodeToGroup(prev, nodeId, groupId));
  }

  function handleDropNodeToRoot(nodeId: string) {
    setLayerTree((prev) => moveNodeToGroup(prev, nodeId, null));
  }

  function handleReorderBefore(activeId: string, overId: string) {
    setLayerTree((prev) => moveNodeBeforeNode(prev, activeId, overId));
  }

  function handleAddExternalSources(sources: ExternalSourceDraft[]) {
    if (!sources.length) return;

    setLayerTree((prev) => {
      let next = prev;

      for (const item of sources) {
        const trimmedUrl = item.url.trim();
        const remoteFormat = item.remoteFormat ?? detectRemoteFormat(trimmedUrl);
        const node = applyOrientationPreferenceToLayer({
          id: createId(),
          kind: "layer",
          name: item.name.trim() || "Remote Data",
          type: "remote",
          visible: true,
          opacity: item.id === "allen-brain-skeleton-mesh" ? 0.5 : undefined,
          source: trimmedUrl,
          sourceKind: item.builtIn ? "built-in" : "external",
          description:
            remoteFormat === "mesh-obj"
              ? item.builtIn
                ? "Built-in template mesh"
                : "External mesh source"
              : item.remoteContentKind === "annotation"
              ? "Allen annotation overlay"
              : item.icon === "custom"
              ? "Custom external source"
              : "External data source",
          remoteFormat,
          remoteContentKind: item.remoteContentKind ?? "intensity",
          renderMode:
            remoteFormat === "ome-zarr" ? item.renderMode ?? "volume" : undefined,
          remoteResolution:
            remoteFormat === "ome-zarr" ? item.remoteResolution ?? "100um" : undefined,
          meshStyle:
            remoteFormat === "mesh-obj" && item.id === "allen-volume-bounds-cube"
              ? {
                  color: "#86d7ff",
                  lineWidth: 2.2,
                }
              : undefined,
        });

        const selected = selectedNodeId ? findNodeById(next, selectedNodeId) : null;

        if (selected && isGroupNode(selected)) {
          next = insertIntoGroup(next, selected.id, node);
        } else {
          next = [...next, node];
        }
      }

      return next;
    });

    setIsImportPanelOpen(false);
  }



  function handleClearPersistedViewerState() {
    clearPersistedViewerState();
    clearPersistedViewerLibrary();
    setViewerLibrary([]);
    setActiveSavedViewerId(null);
    setCaptureScenes([]);
    setActiveCaptureSceneId(null);
    setCaptureTimelineCursorMs(0);
    setCaptureTimelineZoom(DEFAULT_CAPTURE_TIMELINE_ZOOM);
    setViewerLibraryMode("browse");
    setHasPersistedViewerState(false);
    notifyProfileDataChanged();
  }

  function handleClearViewerHistoryOnly() {
    flushPendingAutoCommit();
    clearPersistedViewerHistory();
    pastStatesRef.current = [];
    futureStatesRef.current = [];
    lastCommittedStateRef.current = currentViewerState;
    lastCommittedHashRef.current = hashViewerStateForHistory(currentViewerState);
    bumpHistoryRevision();
    notifyProfileDataChanged();
  }

  async function handleResetLocalProfileData() {
    flushPendingAutoCommit();
    clearPersistedViewerHistory();
    clearPersistedViewerState();
    clearPersistedViewerLibrary();
    await clearAllLocalDatasetRecords();
    try {
      window.localStorage.removeItem(ANNOTATION_RECENT_COLORS_STORAGE_KEY);
    } catch {}
    setViewerLibrary([]);
    setActiveSavedViewerId(null);
    setCaptureScenes([]);
    setActiveCaptureSceneId(null);
    setCaptureTimelineCursorMs(0);
    setCaptureTimelineZoom(DEFAULT_CAPTURE_TIMELINE_ZOOM);
    setViewerLibraryMode("browse");
    setAnnotationRecentColors([]);
    setToolbarLayout(resetToolbarLayout());
    setIsToolbarEditMode(false);
    pastStatesRef.current = [];
    futureStatesRef.current = [];
    lastCommittedStateRef.current = currentViewerState;
    lastCommittedHashRef.current = hashViewerStateForHistory(currentViewerState);
    setHasPersistedViewerState(false);
    setAppPreferences(loadAppPreferences());
    bumpHistoryRevision();
    notifyProfileDataChanged();
    if (typeof window !== "undefined") {
      window.location.reload();
    }
  }

  useEffect(() => {
    const api = {
      ping: () => true,
      getState: () => currentViewerState,
      getStateJson: () => JSON.stringify(currentViewerState, null, 2),
      setState: (state: ViewerStateV1) => commitCurrentStateNow(state),
      setStateJson: (stateJson: string) => commitCurrentStateNow(parseViewerState(stateJson)),
      patchState: (patch: ViewerStatePatchV1) => applyViewerStatePatch(patch),
      setLayoutCollapsed: (collapsed: boolean) =>
        applyViewerStatePatch({
          layout: { layerPanelCollapsed: collapsed },
        }),
      selectNode: (nodeId: string | null) =>
        applyViewerStatePatch({
          scene: { selectedNodeId: nodeId },
        }),
      openExport: () => openExportStateModal(),
      openImport: () => openImportStateModal(),
      closeDialogs: () => closeDialogs(),
      undo: () => handleUndo(),
      redo: () => handleRedo(),
      clearHistory: () => {
        openClearHistoryConfirm();
        return currentViewerState;
      },
    };

    window.AllenViewerApi = api;

    return () => {
      if (window.AllenViewerApi === api) {
        delete window.AllenViewerApi;
      }
    };
  }, [currentViewerState, historyRevision]);

  useEffect(() => {
    function reply(event: MessageEvent, response: ViewerEmbedResponse) {
      if (!event.source || typeof (event.source as Window).postMessage !== "function") return;
      (event.source as Window).postMessage(response, event.origin || "*");
    }

    function handleMessage(event: MessageEvent) {
      const message = event.data as ViewerEmbedMessage | undefined;
      if (!message || message.namespace !== ALLEN_VIEWER_EMBED_NAMESPACE) return;
      if (message.type !== "request") return;

      const request = message as ViewerEmbedRequest;

      try {
        switch (request.command) {
          case "ping":
            reply(event, {
              namespace: ALLEN_VIEWER_EMBED_NAMESPACE,
              type: "response",
              command: request.command,
              requestId: request.requestId,
              ok: true,
              payload: { pong: true, history: buildHistoryDebugLabel() },
            });
            return;
          case "getState":
            reply(event, {
              namespace: ALLEN_VIEWER_EMBED_NAMESPACE,
              type: "response",
              command: request.command,
              requestId: request.requestId,
              ok: true,
              payload: { state: currentViewerState },
            });
            return;
          case "getStateJson":
            reply(event, {
              namespace: ALLEN_VIEWER_EMBED_NAMESPACE,
              type: "response",
              command: request.command,
              requestId: request.requestId,
              ok: true,
              payload: { stateJson: JSON.stringify(currentViewerState, null, 2) },
            });
            return;
          case "setState": {
            const incomingState = request.payload?.state as ViewerStateV1 | undefined;
            if (!incomingState) throw new Error("Missing 'state' payload.");
            const nextState = commitCurrentStateNow(incomingState);
            reply(event, {
              namespace: ALLEN_VIEWER_EMBED_NAMESPACE,
              type: "response",
              command: request.command,
              requestId: request.requestId,
              ok: true,
              payload: { state: nextState },
            });
            return;
          }
          case "setStateJson": {
            const stateJson = request.payload?.stateJson;
            if (typeof stateJson !== "string") throw new Error("Missing 'stateJson' payload.");
            const nextState = commitCurrentStateNow(parseViewerState(stateJson));
            reply(event, {
              namespace: ALLEN_VIEWER_EMBED_NAMESPACE,
              type: "response",
              command: request.command,
              requestId: request.requestId,
              ok: true,
              payload: { state: nextState },
            });
            return;
          }
          case "patchState": {
            const patch = request.payload?.patch as ViewerStatePatchV1 | undefined;
            if (!patch) throw new Error("Missing 'patch' payload.");
            const nextState = applyViewerStatePatch(patch);
            reply(event, {
              namespace: ALLEN_VIEWER_EMBED_NAMESPACE,
              type: "response",
              command: request.command,
              requestId: request.requestId,
              ok: true,
              payload: { state: nextState },
            });
            return;
          }
          case "setLayoutCollapsed": {
            const collapsed = Boolean(request.payload?.collapsed);
            const nextState = applyViewerStatePatch({
              layout: { layerPanelCollapsed: collapsed },
            });
            reply(event, {
              namespace: ALLEN_VIEWER_EMBED_NAMESPACE,
              type: "response",
              command: request.command,
              requestId: request.requestId,
              ok: true,
              payload: { state: nextState },
            });
            return;
          }
          case "selectNode": {
            const nodeId = (request.payload?.nodeId as string | null | undefined) ?? null;
            const nextState = applyViewerStatePatch({ scene: { selectedNodeId: nodeId } });
            reply(event, {
              namespace: ALLEN_VIEWER_EMBED_NAMESPACE,
              type: "response",
              command: request.command,
              requestId: request.requestId,
              ok: true,
              payload: { state: nextState },
            });
            return;
          }
          case "openExport":
            openExportStateModal();
            reply(event, {
              namespace: ALLEN_VIEWER_EMBED_NAMESPACE,
              type: "response",
              command: request.command,
              requestId: request.requestId,
              ok: true,
            });
            return;
          case "openImport":
            openImportStateModal();
            reply(event, {
              namespace: ALLEN_VIEWER_EMBED_NAMESPACE,
              type: "response",
              command: request.command,
              requestId: request.requestId,
              ok: true,
            });
            return;
          case "closeDialogs":
            closeDialogs();
            reply(event, {
              namespace: ALLEN_VIEWER_EMBED_NAMESPACE,
              type: "response",
              command: request.command,
              requestId: request.requestId,
              ok: true,
            });
            return;
          default:
            reply(event, {
              namespace: ALLEN_VIEWER_EMBED_NAMESPACE,
              type: "response",
              command: request.command,
              requestId: request.requestId,
              ok: false,
              error: "Unsupported viewer command.",
            });
            return;
        }
      } catch (error) {
        reply(event, {
          namespace: ALLEN_VIEWER_EMBED_NAMESPACE,
          type: "response",
          command: request.command,
          requestId: request.requestId,
          ok: false,
          error: error instanceof Error ? error.message : "Viewer command failed.",
        });
      }
    }

    window.addEventListener("message", handleMessage);

    if (window.parent && window.parent !== window) {
      window.parent.postMessage(
        {
          namespace: ALLEN_VIEWER_EMBED_NAMESPACE,
          type: "event",
          event: "ready",
        },
        "*"
      );
    }

    return () => {
      window.removeEventListener("message", handleMessage);
    };
  }, [currentViewerState, historyRevision]);

  function handleUpdateAxisSliceState(
    layerId: string,
    patch: Partial<NonNullable<LayerItemNode["axisSliceState"]>>
  ) {
    if (activeTool === "slice" && patch.activePlane && selectedCanonicalSliceLayer?.id === layerId) {
      setSliceToolPlane(patch.activePlane);
    }
    setLayerTree((prev) =>
      updateNodeById(prev, layerId, (node) =>
        node.kind !== "layer"
          ? node
          : {
              ...node,
              axisSliceState: {
                ...node.axisSliceState,
                ...patch,
              },
            }
      )
    );
  }

  function handleUpdateCustomSliceParams(
    layerId: string,
    patch: Partial<Extract<SliceLayerParams, { mode: "oblique" }>>
  ) {
    setLayerTree((prev) =>
      updateNodeById(prev, layerId, (node) => {
        if (
          node.kind !== "layer" ||
          node.type !== "custom-slice" ||
          !isObliqueSliceParams(node.sliceParams)
        ) {
          return node;
        }

        return {
          ...node,
          sliceParams: {
            ...node.sliceParams,
            ...patch,
            normal: patch.normal
              ? normalizeSliceVec3(patch.normal)
              : node.sliceParams.normal,
          },
        };
      })
    );
  }

  function handleRequestFocusSelectedLayer() {
    if (!selectedNode || selectedNode.kind !== "layer") return;
    setActiveTool("mouse");
    setFocusSelectedLayerRequestKey((prev) => prev + 1);
  }

  function handleRequestResetOrbitCenter() {
    setCameraState((prev) => ({ ...DEFAULT_CAMERA_STATE, mode: prev.mode }));
    setCameraSyncKey((prev) => prev + 1);
  }

  function updateFloatingWindow(id: string, patch: Partial<FloatingWindowState>) {
    setFloatingWindows((prev) =>
      prev.map((windowState) =>
        windowState.id === id ? { ...windowState, ...patch } : windowState
      )
    );
  }

  function focusFloatingWindow(id: string) {
    const nextZ = nextFloatingWindowZRef.current + 1;
    nextFloatingWindowZRef.current = nextZ;
    updateFloatingWindow(id, { zIndex: nextZ });
  }

  function closeFloatingWindow(id: string) {
    setFloatingWindows((prev) => prev.filter((windowState) => windowState.id !== id));
  }

  function renderFloatingWindowContent(windowState: FloatingWindowState) {
    if (!windowState.metadataNodeId) return null;
    const node = findNodeById(layerTree, windowState.metadataNodeId);
    if (!node || node.kind !== "layer" || node.type !== "annotation") {
      return (
        <div data-theme-text="muted" style={{ fontSize: 13, lineHeight: 1.5, opacity: 0.74 }}>
          The annotation layer for this metadata window is no longer available.
        </div>
      );
    }

    return (
      <MetadataEditor
        value={node.annotation?.metadata ?? ""}
        onChange={(metadata) => updateAnnotationLayerById(node.id, { metadata })}
        mode={windowState.metadataMode ?? "edit"}
        onModeChange={(metadataMode) => updateFloatingWindow(windowState.id, { metadataMode })}
      />
    );
  }

  return (
    <div
      data-app-theme={appPreferences.theme}
      style={{
        width: "100vw",
        height: "100vh",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        margin: 0,
        position: "relative",
        background: appPreferences.sceneBackground,
        color: appPreferences.theme === "light" ? "#18212b" : "white",
        cursor:
          (activeTool === "select" || activeTool === "capture")
            ? "pointer"
            : appPreferences.cursorStyle === "crosshair"
            ? "crosshair"
            : appPreferences.cursorStyle === "high-contrast"
            ? "cell"
            : "default",
        userSelect: activeTool === "select" || activeTool === "capture" ? "none" : "auto",
        WebkitUserSelect: activeTool === "select" || activeTool === "capture" ? "none" : "auto",
      }}
    >
      <style>{getThemeRootCss(appPreferences.theme)}</style>
      <style>{`
        [data-viewer-app-menu='true'] {
          -webkit-user-select: none;
          user-select: none;
        }
      `}</style>
      <div
        style={{
          flex: "1 1 auto",
          minHeight: 0,
          position: "relative",
          overflow: "hidden",
        }}
      >

      <WebGLCanvas
        activeTool={activeTool}
        layerTree={layerTree}
        selectedNodeId={selectedNodeId}
        selectedNodeIds={selectedNodeIdsExternal ?? (selectedNodeId ? [selectedNodeId] : [])}
        cameraState={cameraState}
        cameraSyncKey={cameraSyncKey}
        onCameraStateChange={handleCameraStateChange}
        backgroundColor={appPreferences.sceneBackground}
        annotationShape={annotationDraft.shape}
        annotationColor={annotationDraft.color}
        annotationOpacity={annotationDraft.opacity}
        annotationSize={annotationDraft.size}
        annotationDepth={annotationDraft.depth}
        annotationEraseMode={annotationDraft.eraseMode}
        onAnnotationSizeChange={handleAnnotationDraftSizeChange}
        onCreatePointAnnotation={handleCreatePointAnnotationAtHit}
        onCreateLineAnnotation={handleCreateLineAnnotation}
        onCreateShapeAnnotation={handleCreateShapeAnnotation}
        onCommitFreehandStroke={handleCommitFreehandStroke}
        onEraseFreehand={handleEraseFreehandStroke}
        onSelectedLayerRuntimeInfoChange={handleSelectedLayerRuntimeInfoChange}
        onScenePointerTargetChange={setScenePointerTarget}
        suppressScenePointerTarget={isSlicePanelHoverLocked}
        onSelectSceneLayer={handleSelectSceneLayer}
        onSelectSceneLayers={handleSelectSceneLayers}
        onCaptureSliceRegion={handleCaptureSliceRegion}
        onAxisSliceStateChange={handleUpdateAxisSliceState}
        onCustomSliceParamsChange={handleUpdateCustomSliceParams}
        onCustomSliceTilt={handleTiltObliqueSliceForLayer}
        onCanvasElementChange={handleCanvasElementChange}
        onLocalSceneLoadStateChange={handleLocalSceneLoadStateChange}
        localSceneLoadingActive={localSceneLoadState.active}
        focusSelectedLayerRequestKey={focusSelectedLayerRequestKey}
        cacheClearRequestKey={cacheClearRequestKey}
        hiddenDataAutoUnloadMinutes={appPreferences.hiddenDataAutoUnloadMinutes}
        onCacheClearComplete={handleResourceCacheCleared}
        imageCaptureRequest={
          isCapturePending
            ? {
                key: captureRequestKey,
                selectedLayerIds: captureRequestLayerIds,
                sliceCrop: captureRequestSliceCrop,
              }
            : null
        }
        onImageCaptureComplete={handleImageCaptureComplete}
        showRasReference={showRasReference}
      />

      <style>{`
        @keyframes local-load-indeterminate {
          0% { transform: translateX(-120%); }
          100% { transform: translateX(320%); }
        }
        @keyframes local-load-panel-in {
          0% { opacity: 0; transform: translateY(8px); }
          100% { opacity: 1; transform: translateY(0); }
        }
        @keyframes toast-panel-in {
          0% { opacity: 0; transform: translateY(8px); }
          100% { opacity: 1; transform: translateY(0); }
        }
        @keyframes toast-panel-out {
          0% { opacity: 1; transform: translateY(0); }
          100% { opacity: 0; transform: translateY(8px); }
        }
      `}</style>
      <SaveToastStack
        toasts={saveToasts}
        bottomOffset={104}
        onDismiss={handleDismissSaveToast}
        onHoverChange={handleToastHoverChange}
        taskNotice={
          exportTaskNotice && !isLocalDatasetManagerOpen
            ? (() => {
                const noticeKey = exportTaskNotice.detail
                  ? `${exportTaskNotice.title}|${exportTaskNotice.message}|${exportTaskNotice.detail}`
                  : `${exportTaskNotice.title}|${exportTaskNotice.message}`;
                if (dismissedExportTaskNoticeKey === noticeKey) return null;
                return {
                  ...exportTaskNotice,
                  onDismiss: handleDismissExportTaskNotice,
                  onClick: () => {
                    setRequestedLocalDatasetManagerSourceId(null);
                    setIsLocalDatasetManagerOpen(true);
                  },
                  onHoverChange: setIsExportTaskNoticeHovered,
                  progress:
                    exportTaskNotice.terminal
                      ? 1
                      : typeof exportTaskNotice.progress === "number"
                        ? exportTaskNotice.progress
                        : null,
                };
              })()
            : null
        }
        loadingNotice={{
          active: localSceneLoadState.active && !dismissLocalSceneLoadNotice,
          pending: localSceneLoadState.pending,
          onDismiss: () => setDismissLocalSceneLoadNotice(true),
        }}
      />

      <GlobalDropOverlay visible={canShowGlobalDropOverlay} />

      <AppMenuPanel
        open={isAppMenuOpen}
        onToggleOpen={() => setIsAppMenuOpen((prev) => !prev)}
        onCreateNewViewer={handleCreateNewViewer}
        onOpenLibrary={() => openViewerLibrary("browse")}
        onSaveViewer={requestNewSavedViewerFlow}
        onOpenImportData={() => {
          setImportPanelView("library");
          setIsImportPanelOpen(true);
          setIsAppMenuOpen(false);
        }}
        onOpenManageLocalData={() => { setRequestedLocalDatasetManagerSourceId(null); setIsLocalDatasetManagerOpen(true); setIsAppMenuOpen(false); }}
        onOpenExportState={() => { openExportStateModal(); setIsAppMenuOpen(false); }}
        onOpenImportState={() => { openImportStateModal(); setIsAppMenuOpen(false); }}
        onOpenShareDialog={openShareDialog}
        onOpenProfile={() => { setIsUserProfilePanelOpen(true); setIsAppMenuOpen(false); }}
        onOpenAbout={openAboutDialog}
      />

      {shouldShowCapturePanel ? (
        <div
          data-theme-surface="panel"
          style={{
            position: "absolute",
            left: 18,
            right: 18,
            bottom: 82,
            borderRadius: 18,
            border: "1px solid rgba(255,255,255,0.10)",
            background: "rgba(12,14,18,0.92)",
            boxShadow: "0 16px 40px rgba(0,0,0,0.28)",
            backdropFilter: "blur(14px)",
            padding: 12,
            color: "white",
            display: "grid",
            gridTemplateRows: "auto 1fr",
            gap: 10,
            zIndex: 48,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              flexWrap: "nowrap",
              overflowX: "auto",
              overflowY: "hidden",
              paddingBottom: 2,
            }}
          >
            <button
              type="button"
              aria-label="Play from start"
              title="Play from start"
              onClick={() => handlePlayCaptureTimeline({ fromStart: true, playbackMode: "once" })}
              disabled={orderedCaptureScenes.length === 0}
              style={{
                minHeight: 34,
                minWidth: 34,
                borderRadius: 9,
                border: "1px solid rgba(120,190,255,0.28)",
                background: "rgba(120,190,255,0.18)",
                color: "white",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                padding: "0 10px",
                cursor: orderedCaptureScenes.length === 0 ? "not-allowed" : "pointer",
                opacity: orderedCaptureScenes.length === 0 ? 0.58 : 1,
              }}
            >
              <CaptureTimelineIcon kind="play-start" />
            </button>
            <button
              type="button"
              aria-label={isCaptureTimelinePlaying ? "Pause preview" : isCaptureTimelinePaused ? "Resume preview" : "Play from cursor"}
              title={isCaptureTimelinePlaying ? "Pause preview" : isCaptureTimelinePaused ? "Resume preview" : "Play from cursor"}
              onClick={handleToggleCaptureTimelinePlayback}
              disabled={orderedCaptureScenes.length === 0}
              style={{
                minHeight: 34,
                minWidth: 34,
                borderRadius: 9,
                border: "1px solid rgba(255,255,255,0.10)",
                background: isCaptureTimelinePlaying ? "rgba(255,160,120,0.16)" : "rgba(255,255,255,0.08)",
                color: "white",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                padding: "0 10px",
                cursor: orderedCaptureScenes.length === 0 ? "not-allowed" : "pointer",
                opacity: orderedCaptureScenes.length === 0 ? 0.58 : 1,
              }}
            >
              <CaptureTimelineIcon kind={isCaptureTimelinePlaying ? "pause" : "play"} />
            </button>
            <div
              aria-hidden="true"
              style={{
                width: 1,
                alignSelf: "stretch",
                minHeight: 28,
                background: "rgba(255,255,255,0.12)",
                margin: "0 4px",
              }}
            />
            <div style={{ display: "flex", alignItems: "center", gap: 8, flex: "0 0 auto" }}>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.56)" }}>Transition</div>
              <select
                value={activeCaptureScene?.transitionEasing ?? "ease-in-out"}
                onChange={(event) =>
                  activeCaptureScene
                    ? handleUpdateCaptureSceneTransition(activeCaptureScene.id, {
                        transitionEasing: event.target.value as CaptureSceneTransitionEasing,
                      })
                    : undefined
                }
                disabled={!activeCaptureScene || activeOrderedCaptureSceneIndex <= 0}
                style={{
                  minHeight: 32,
                  borderRadius: 9,
                  border: "1px solid rgba(255,255,255,0.10)",
                  background: "rgba(255,255,255,0.08)",
                  color: "white",
                  padding: "0 8px",
                  fontSize: 12,
                  outline: "none",
                  opacity: !activeCaptureScene || activeOrderedCaptureSceneIndex <= 0 ? 0.58 : 1,
                }}
              >
                {CAPTURE_SCENE_TRANSITION_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <div
              aria-hidden="true"
              style={{
                width: 1,
                alignSelf: "stretch",
                minHeight: 28,
                background: "rgba(255,255,255,0.12)",
                margin: "0 4px",
                flex: "0 0 auto",
              }}
            />
            <button
              type="button"
              onClick={handleSaveCaptureScene}
              style={{
                minHeight: 34,
                borderRadius: 9,
                border: "1px solid rgba(255,255,255,0.10)",
                background: "rgba(255,255,255,0.08)",
                color: "white",
                fontSize: 12,
                fontWeight: 800,
                padding: "0 12px",
                cursor: "pointer",
                flex: "0 0 auto",
              }}
            >
              Add scene at cursor
            </button>
            <button
              type="button"
              onClick={handleUpdateActiveCaptureScene}
              disabled={!activeCaptureScene}
              style={{
                minHeight: 34,
                borderRadius: 9,
                border: "1px solid rgba(255,255,255,0.10)",
                background: "rgba(255,255,255,0.08)",
                color: "white",
                fontSize: 12,
                fontWeight: 800,
                padding: "0 12px",
                cursor: activeCaptureScene ? "pointer" : "not-allowed",
                opacity: activeCaptureScene ? 1 : 0.58,
                flex: "0 0 auto",
              }}
            >
              Update selected scene
            </button>
            <div style={{ flex: 1, minWidth: 16 }} />
            <button
              type="button"
              aria-label="Close timeline editor"
              title="Close timeline editor"
              onClick={() => setIsCapturePanelOpen(false)}
              style={{
                minHeight: 34,
                minWidth: 34,
                borderRadius: 9,
                border: "1px solid rgba(255,255,255,0.10)",
                background: "rgba(255,255,255,0.08)",
                color: "white",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                padding: "0 10px",
                cursor: "pointer",
                flex: "0 0 auto",
              }}
            >
              <span style={{ fontSize: 18, lineHeight: 1 }}>×</span>
            </button>
          </div>

          <>
              <div style={{ display: "grid", gridTemplateColumns: "auto auto 1fr auto", gap: 12, alignItems: "center" }}>
                <div style={{ fontSize: 12, fontWeight: 800 }}>Playhead {formatCaptureTimelineTime(captureTimelineCursorMs)}</div>
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.62)" }}>
                  {selectedCaptureLayerNames.length
                    ? selectedCaptureLayerNames.length === 1
                      ? selectedCaptureLayerNames[0]
                      : `${selectedCaptureLayerNames.length} layers selected`
                    : "No scene layer selected"}
                </div>
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.62)" }}>
                  {activeCaptureScene
                    ? `Selected scene ${formatCaptureTimelineTime(activeCaptureScene.timestampMs ?? 0)}`
                    : "No scene selected"}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.56)" }}>
                    Wheel to zoom {Math.round(captureTimelineZoom * 100)}%
                  </div>
                </div>
              </div>

              <div
                ref={captureTimelineViewportRef}
                onPointerDown={handleCaptureTimelineBackgroundPointerDown}
                onPointerMove={(event) => setCaptureTimelineHoverMs(getCaptureTimelineMsFromClientX(event.clientX))}
                onPointerLeave={() => setCaptureTimelineHoverMs(null)}
                onWheel={handleCaptureTimelineWheel}
                onScroll={(event) => {
                  const viewport = event.currentTarget;
                  const visibleEndMs =
                    (viewport.scrollLeft + viewport.clientWidth) / Math.max(captureTimelinePixelsPerMs, 1e-6);
                  if (visibleEndMs > captureTimelineDurationMs - CAPTURE_TIMELINE_VIEW_PADDING_MS) {
                    ensureCaptureTimelineRange(visibleEndMs + CAPTURE_TIMELINE_VIEW_PADDING_MS);
                  }
                }}
                style={{
                  position: "relative",
                  overflowX: "auto",
                  overflowY: "hidden",
                  borderRadius: 14,
                  border: "1px solid rgba(255,255,255,0.08)",
                  background:
                    "linear-gradient(180deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.03) 100%)",
                }}
              >
                <div
                  style={{
                    position: "relative",
                    width: captureTimelineContentWidth,
                    minHeight: 148,
                    padding: "10px 20px 14px 28px",
                    boxSizing: "border-box",
                  }}
                >
                  {Array.from({ length: Math.floor(captureTimelineDurationMs / 1000) + 1 }, (_, index) => {
                    const tickMs = index * 1000;
                    const x = 28 + tickMs * captureTimelinePixelsPerMs;
                    return (
                      <div key={tickMs}>
                        <div
                          style={{
                            position: "absolute",
                            left: x,
                            top: 0,
                            bottom: 0,
                            width: 1,
                            background: index % 5 === 0 ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.05)",
                          }}
                        />
                        <div
                          style={{
                            position: "absolute",
                            left: x + 4,
                            top: 8,
                            fontSize: 10,
                            color: "rgba(255,255,255,0.48)",
                            userSelect: "none",
                          }}
                        >
                          {formatCaptureTimelineTime(tickMs)}
                        </div>
                      </div>
                    );
                  })}

                  <div
                    style={{
                      position: "absolute",
                      left: 28,
                      right: 20,
                      top: 44,
                      height: 2,
                      borderRadius: 999,
                      background: "rgba(255,255,255,0.10)",
                    }}
                  />

                  <div
                    style={{
                      position: "absolute",
                      left: 28 + captureTimelineCursorMs * captureTimelinePixelsPerMs,
                      top: 28,
                      bottom: 12,
                      width: 2,
                      background: "rgba(120,190,255,0.92)",
                      borderRadius: 999,
                      pointerEvents: "none",
                    }}
                  />

                  {captureTimelineHoverMs !== null ? (
                    <>
                      <div
                        style={{
                          position: "absolute",
                          left: 28 + captureTimelineHoverMs * captureTimelinePixelsPerMs,
                          top: 28,
                          bottom: 12,
                          width: 1,
                          background: "rgba(255,255,255,0.36)",
                          borderRadius: 999,
                          pointerEvents: "none",
                        }}
                      />
                      <div
                        style={{
                          position: "absolute",
                          left: 34 + captureTimelineHoverMs * captureTimelinePixelsPerMs,
                          top: 28,
                          fontSize: 10,
                          color: "rgba(255,255,255,0.72)",
                          pointerEvents: "none",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {formatCaptureTimelineTime(captureTimelineHoverMs)}
                      </div>
                    </>
                  ) : null}

                  {orderedCaptureScenes.map((scene) => {
                    const left = 28 + (scene.timestampMs ?? 0) * captureTimelinePixelsPerMs;
                    const isActive = scene.id === activeCaptureSceneId;
                    return (
                      <div
                        key={scene.id}
                        onPointerDown={(event) => handleCaptureTimelineScenePointerDown(event, scene.id)}
                        style={{
                          position: "absolute",
                          left,
                          top: 54,
                          width: 148,
                          height: 90,
                          transform: "translateX(-50%)",
                          borderRadius: 12,
                          border: isActive ? "2px solid rgba(120,190,255,0.84)" : "1px solid rgba(255,255,255,0.12)",
                          background: scene.thumbnailDataUrl ? `center / cover no-repeat url(${scene.thumbnailDataUrl})` : "rgba(255,255,255,0.08)",
                          boxShadow: isActive ? "0 0 0 3px rgba(120,190,255,0.14)" : "0 8px 20px rgba(0,0,0,0.22)",
                          overflow: "hidden",
                          cursor: "grab",
                          padding: 0,
                          userSelect: "none",
                        }}
                      >
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            handleApplyCaptureScene(scene.id);
                          }}
                          style={{
                            position: "absolute",
                            inset: 0,
                            border: "none",
                            background: "transparent",
                            padding: 0,
                            cursor: "pointer",
                          }}
                          aria-label={`Load scene at ${formatCaptureTimelineTime(scene.timestampMs ?? 0)}`}
                        />
                        <div
                          style={{
                            position: "absolute",
                            top: 6,
                            right: 6,
                            display: "flex",
                            alignItems: "center",
                            gap: 6,
                            zIndex: 1,
                          }}
                        >
                          <button
                            type="button"
                            onPointerDown={(event) => event.stopPropagation()}
                            onClick={(event) => {
                              event.stopPropagation();
                              handleDownloadCaptureScene(scene.id);
                            }}
                            title="Download scene screen shot"
                            aria-label="Download scene screen shot"
                            style={{
                              width: 28,
                              height: 28,
                              borderRadius: 8,
                              border: "1px solid rgba(255,255,255,0.16)",
                              background: "rgba(10,12,16,0.72)",
                              color: "white",
                              display: "inline-flex",
                              alignItems: "center",
                              justifyContent: "center",
                              cursor: "pointer",
                              backdropFilter: "blur(8px)",
                            }}
                          >
                            <CaptureTimelineIcon kind="export" />
                          </button>
                          <button
                            type="button"
                            onPointerDown={(event) => event.stopPropagation()}
                            onClick={(event) => {
                              event.stopPropagation();
                              handleDeleteCaptureScene(scene.id);
                            }}
                            title="Delete scene"
                            aria-label="Delete scene"
                            style={{
                              width: 28,
                              height: 28,
                              borderRadius: 8,
                              border: "1px solid rgba(255,160,160,0.18)",
                              background: "rgba(55,18,18,0.72)",
                              color: "rgba(255,220,220,0.96)",
                              display: "inline-flex",
                              alignItems: "center",
                              justifyContent: "center",
                              cursor: "pointer",
                              backdropFilter: "blur(8px)",
                            }}
                          >
                            <span style={{ fontSize: 14, lineHeight: 1 }}>✕</span>
                          </button>
                        </div>
                        <div
                          style={{
                            position: "absolute",
                            inset: "auto 0 0 0",
                            background: "linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0.72) 100%)",
                            padding: "24px 8px 7px",
                            textAlign: "left",
                          }}
                        >
                          <div style={{ fontSize: 11, fontWeight: 800, color: "white" }}>
                            {formatCaptureTimelineTime(scene.timestampMs ?? 0)}
                          </div>
                          <div style={{ fontSize: 10, color: "rgba(255,255,255,0.72)" }}>
                            {scene.selectedLayerIds.length === 1 ? "1 layer" : `${scene.selectedLayerIds.length} layers`}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
        </div>
      ) : null}

      <LayerPanel
        layerTree={layerTree}
        selectedNodeId={selectedNodeId}
        selectedNodeIdsExternal={selectedNodeIdsExternal}
        activeTool={activeTool}
        groupOptions={groupOptions}
        detailsContent={inspectorPanelContent}
        isDetailsCollapsed={isInspectorCollapsed}
        onToggleDetailsCollapsed={() => setIsInspectorCollapsed((prev) => !prev)}
        isCollapsed={isLayerPanelCollapsed}
        onSetCollapsed={setIsLayerPanelCollapsed}
        onToggleVisible={handleToggleVisible}
        onSelectNode={handleSelectNode}
        onDoubleClickNode={handleOpenSelectedLayerSourceDetails}
        onSelectionChange={handleLayerPanelSelectionChange}
        onToggleGroupExpanded={handleToggleGroupExpanded}
        onSetGroupExpanded={handleSetGroupExpanded}
        onAddGroup={handleAddGroup}
        onAddLayer={handleOpenAddLayer}
        onRenameNode={handleRenameNode}
        onDuplicateNode={handleDuplicateNode}
        onDeleteNode={handleDeleteNode}
        onDeleteNodes={handleDeleteNodes}
        onCreateGroupFromNodes={handleCreateGroupFromNodes}
        onDropNodeIntoGroup={handleDropNodeIntoGroup}
        onDropNodeToRoot={handleDropNodeToRoot}
        onReorderBefore={handleReorderBefore}
        onDropNodesIntoGroup={handleDropNodesIntoGroup}
        onDropNodesToRoot={handleDropNodesToRoot}
        onReorderNodesBefore={handleReorderNodesBefore}
      />

      <ViewerLibraryPanel
        open={activeTool === "library"}
        mode={viewerLibraryMode}
        onSetMode={setViewerLibraryMode}
        onClose={() => {
          setViewerLibraryMode("browse");
          setActiveTool("mouse");
        }}
        entries={libraryEntries}
        activeSavedViewerId={activeSavedViewerId}
        errorMessage={libraryError}
        saveNamePlaceholder={viewerLibrarySavePlaceholder}
        onSaveNewViewer={handleSaveCurrentViewerToLibrary}
        onOverwriteViewer={handleOverwriteSavedViewer}
        onOpenViewer={handleOpenSavedViewer}
        onDeleteViewers={handleDeleteSavedViewer}
        onRenameViewer={handleRenameSavedViewer}
      />

      <AutomationPipelinePanel
        open={activeTool === "pipeline"}
        pipelines={automationPipelines}
        activePipelineId={activeAutomationPipelineId}
        customTools={automationCustomTools}
        onPipelinesChange={setAutomationPipelines}
      onCustomToolsChange={setAutomationCustomTools}
      onActivePipelineIdChange={setActiveAutomationPipelineId}
      onRunPipeline={runAutomationPipeline}
      debug={automationDebug}
      onResumeDebug={resumeAutomationDebug}
      onStopDebug={stopAutomationDebug}
    />

      <ClearHistoryDialog
        open={isClearHistoryConfirmOpen}
        onClose={() => setIsClearHistoryConfirmOpen(false)}
        onConfirm={handleConfirmClearHistory}
      />

      <VersionBadge
        version={APP_VERSION}
        commitSha={APP_COMMIT_SHA}
        commitShort={APP_COMMIT_SHORT}
        commitUrl={APP_COMMIT_URL}
        theme={appPreferences.theme}
      />

      <AppAssistantPanel
        workspaceOpen={activeTool === "assistant"}
        keepModelLoaded={appPreferences.keepAssistantModel}
        assistantClearRequestKey={assistantClearRequestKey}
        quickPrompt={appAssistantQuickPrompt}
        context={appAssistantContext}
        activePipelineId={activeAutomationPipelineId}
        pipelines={automationPipelines}
        windows={floatingWindows}
        onCloseWorkspace={() => setActiveTool("mouse")}
        onQuickPromptConsumed={() => setAppAssistantQuickPrompt(null)}
        onPipelinesChange={setAutomationPipelines}
        onActivePipelineIdChange={setActiveAutomationPipelineId}
        onApplyAssistantToolCall={applyAssistantToolCall}
        onCreateChatWindow={openAssistantChatWindow}
        onUpdateWindow={updateFloatingWindow}
        onFocusWindow={focusFloatingWindow}
        onCloseWindow={closeFloatingWindow}
        renderWindowContent={renderFloatingWindowContent}
        onAssistantClearComplete={handleAssistantCleared}
      />

      <BottomToolbar
        activeTool={activeTool}
        toolbarToolIds={visibleToolbarToolIds}
        hiddenToolbarToolIds={hiddenToolbarToolIds}
        toolbarEditMode={isToolbarEditMode}
        onToolbarEditModeChange={setIsToolbarEditMode}
        onToolbarMove={handleToolbarMove}
        onToolbarHide={handleToolbarHide}
        onToolbarShow={handleToolbarShow}
        onToolChange={handleToolChange}
        resourceManagerOpen={isResourceManagerOpen}
        cameraMode={cameraState.mode}
        onCameraModeChange={handleCameraModeChange}
        onFocusSelectedLayer={handleRequestFocusSelectedLayer}
        onSaveCurrentViewer={handleSaveCurrentViewerToLibrary}
        captureStills={captureStillMenuItems}
        captureSequences={captureSequenceMenuItems}
        capturePlaybackActive={isCaptureTimelinePlaying}
        capturePlaybackPaused={isCaptureTimelinePaused}
        onOpenCaptureEditor={() => handleCapturePrimaryActionFromExtension("open-editor")}
        onExportCaptureFrame={() => handleCapturePrimaryActionFromExtension("export-frame")}
        captureExportEnabled={visibleCaptureLayerIds.length > 0}
        captureExportPending={isCapturePending}
        onToggleCapturePlayback={() => handleCapturePrimaryActionFromExtension("toggle-playback")}
        onStopCapturePlayback={() => handleCapturePrimaryActionFromExtension("stop-playback")}
        onLoadCaptureStill={(stillId) => handleCaptureStillActionFromExtension("load", stillId)}
        onDownloadCaptureStill={(stillId) => handleCaptureStillActionFromExtension("download", stillId)}
        onDeleteCaptureStill={(stillId) => handleCaptureStillActionFromExtension("delete", stillId)}
        onLoadCaptureSequence={(sequenceId) => handleCaptureSequenceActionFromExtension("load", sequenceId)}
        onPlayCaptureSequence={(sequenceId) => handleCaptureSequenceActionFromExtension("play-once", sequenceId)}
        onLoopCaptureSequence={(sequenceId) => handleCaptureSequenceActionFromExtension("play-loop", sequenceId)}
        onRenameCaptureSequence={(sequenceId, nextName) => handleCaptureSequenceActionFromExtension("rename", sequenceId, nextName)}
        onDeleteCaptureSequence={(sequenceId) => handleCaptureSequenceActionFromExtension("delete", sequenceId)}
        canUndo={canUndo}
        canRedo={canRedo}
        onUndo={() => handleUndo()}
        onRedo={() => handleRedo()}
        canClearHistory={canClearHistory}
        onRequestClearHistory={openClearHistoryConfirm}
        undoItems={undoItems}
        redoItems={redoItems}
        onJumpUndo={handleJumpUndo}
        onJumpRedo={handleJumpRedo}
        statePopoverOpen={false}
        onRequestCloseStatePopover={() => setIsStateDialogOpen(false)}
        accountPopoverOpen={false}
        annotationShape={annotationDraft.shape}
        annotationColor={annotationDraft.color}
        annotationOpacity={annotationDraft.opacity}
        annotationSize={annotationDraft.size}
        annotationDepth={annotationDraft.depth}
        annotationEraseMode={annotationDraft.eraseMode}
        annotationRecentColors={annotationRecentColors}
        onAnnotationShapeChange={(shape) => handleAnnotationSettingActionFromExtension("set-shape", shape)}
        onAnnotationColorChange={(color) => handleAnnotationSettingActionFromExtension("set-color", color)}
        onAnnotationColorCommit={(color) => handleAnnotationSettingActionFromExtension("commit-color", color)}
        onAnnotationOpacityChange={(opacity) => handleAnnotationSettingActionFromExtension("set-opacity", opacity)}
        onAnnotationSizeChange={(size) => handleAnnotationSettingActionFromExtension("set-size", size)}
        onAnnotationDepthChange={(depth) => handleAnnotationSettingActionFromExtension("set-depth", depth)}
        onAnnotationEraseModeChange={(mode) => handleAnnotationSettingActionFromExtension("set-erase-mode", mode)}
        onAnnotationPickColorFromScreen={() => handleAnnotationSettingActionFromExtension("pick-color")}
        sliceMode={sliceToolMode}
        sliceSelectedLayerName={sliceToolSelectedLayerName}
        sliceTargetPlane={sliceToolTargetPlane}
        sliceHoveredPlane={
          !isSlicePanelHoverLocked &&
          scenePointerTarget?.plane &&
          selectedCanonicalSliceLayer &&
          scenePointerTarget.layerId === selectedCanonicalSliceLayer.id
            ? scenePointerTarget.plane
            : null
        }
        sliceCanResetToCenter={!!sliceToolSelectedLayerName && !!selectedLayerRuntimeInfo?.dims}
        sliceRotationDeg={sliceToolViewState.rotationDeg}
        sliceScale={sliceToolViewState.scale}
        sliceFlipX={sliceToolViewState.flipX}
        sliceFlipY={sliceToolViewState.flipY}
        sliceFlipZ={sliceToolViewState.flipZ}
        sliceVisibilityXY={getCanonicalSliceViewState("xy").visible}
        sliceVisibilityXZ={getCanonicalSliceViewState("xz").visible}
        sliceVisibilityYZ={getCanonicalSliceViewState("yz").visible}
        sliceCanCreateFreeSlice={!!selectedCanonicalSliceLayer && !!sliceToolTargetPlane && !!selectedLayerRuntimeInfo?.dims}
        sliceFreeSliceOffset={sliceToolFreeSliceOffset}
        onSliceHoverLockChange={setIsSlicePanelHoverLocked}
        onSliceToggleVisibility={handleToggleCanonicalSliceVisibility}
        onSliceResetView={sliceToolMode === "free" ? handleResetObliqueSliceView : handleResetCanonicalSliceView}
        onSliceToggleFlip={sliceToolMode === "free" ? handleToggleObliqueSliceFlip : handleToggleCanonicalSliceFlip}
        onSliceResetToCenter={sliceToolMode === "free" ? handleResetObliqueSliceToCenter : handleCenterCanonicalSlices}
	        onSliceRotate={sliceToolMode === "free" ? handleRotateObliqueSlice : handleRotateCanonicalSlice}
	        onSliceScale={sliceToolMode === "free" ? handleScaleObliqueSlice : handleScaleCanonicalSlice}
	        onSliceCreateFreeSlice={handleCreateFreeSliceFromCanonical}
	        onSliceNudgeFreeOffset={handleNudgeObliqueSliceOffset}
	        onSliceTiltFreeSlice={handleTiltObliqueSlice}
	        onSliceSnapFreeSlice={handleSnapObliqueSliceToPlane}
	        windows={floatingWindows}
	        onFocusWindow={focusFloatingWindow}
	        onRestoreWindow={(id) => updateFloatingWindow(id, { minimized: false })}
	        onCloseWindow={closeFloatingWindow}
          onCreateNoteAnnotation={handleCreateNoteAnnotation}
          pipelines={pipelineMenuItems}
          assistantOpen={activeTool === "assistant"}
          onToggleAssistant={handleAssistantToolbarSelectFromExtension}
          onToggleResourceManager={handleResourceManagerToolbarSelectFromExtension}
          resourceSummary={resourceSummary}
          resourceSamples={resourceHistorySamples}
          onQuickAssistantSubmit={handleAssistantQuickPromptFromExtension}
          onOpenPipeline={handleOpenPipelineFromExtension}
          onTogglePipeline={handleTogglePipelineFromExtension}
	      />

      </div>

      <ResourceManagerPanel
        open={isResourceManagerOpen}
        height={resourceSectionHeight}
        summary={resourceSummary}
        samples={resourceHistorySamples}
        onHeightChange={setResourceSectionHeight}
        onClose={closeResourceManager}
        onEndProcess={(processId) => {
          void endResourceProcess(processId);
        }}
        onRunCleanup={handleRunResourceCleanup}
      />

      <AboutDialog
        open={isAboutDialogOpen}
        onClose={() => setIsAboutDialogOpen(false)}
        version={APP_VERSION}
        commitShort={APP_COMMIT_SHORT}
        commitUrl={APP_COMMIT_URL}
        githubUrl="https://github.com/FrancoisHUP/mouse-brain-viewer"
        contactEmail="francois.h.marcoux@gmail.com"
      />

      <ShareDialog
        open={isShareDialogOpen}
        shareUrlDraft={shareUrlDraft}
        localOnlyLayerNames={localOnlyLayerNames}
        stateError={stateError}
        stateShareMessage={stateShareMessage}
        onClose={() => setIsShareDialogOpen(false)}
        onCopyShareLink={() => void handleShareViewerState()}
      />

      <StateDialog open={isStateModalOpen} onClose={() => setIsStateDialogOpen(false)}>
        <StatePanel
          mode={stateModalMode}
          stateTextDraft={stateTextDraft}
          stateError={stateError}
          stateShareMessage={stateShareMessage}
          localOnlyLayerNames={localOnlyLayerNames}
          isSerializable={isCurrentViewerShareSerializable}
          onStateTextDraftChange={setStateTextDraft}
          onOpenExport={openExportStateModal}
          onOpenImport={openImportStateModal}
          onCopyExportState={handleCopyExportState}
          onApplyImportedState={handleApplyImportedState}
        />
      </StateDialog>

      <ImportDataPanel
        key={profileDataRevision}
        open={isImportPanelOpen}
        initialView={importPanelView}
        initialLocalEntries={droppedLocalEntries}
        onConsumeInitialLocalEntries={() => setDroppedLocalEntries(null)}
        onClose={() => {
          setIsImportPanelOpen(false);
          setImportPanelView("library");
          setDroppedLocalEntries(null);
        }}
        onAddDrawingLayer={handleAddDrawingLayer}
        onAddExternalSources={handleAddExternalSources}
        onImportLocalSources={handleImportLocalSources}
        onAddStoredLocalSources={handleAddStoredLocalSources}
        onOpenLocalDatasetManager={() => {
          setIsImportPanelOpen(false);
          setImportPanelView("library");
          setDroppedLocalEntries(null);
          setRequestedLocalDatasetManagerSourceId(null);
          setIsLocalDatasetManagerOpen(true);
        }}
      />

      <LocalDatasetManagerPanel
        open={isLocalDatasetManagerOpen}
        onClose={() => {
          setIsLocalDatasetManagerOpen(false);
          setRequestedLocalDatasetManagerSourceId(null);
        }}
        requestedDetailSourceId={requestedLocalDatasetManagerSourceId}
        onRenameDataset={handleRenameLocalDataset}
        onDeleteDataset={handleDeleteLocalDataset}
        activeLayerTree={layerTree}
        savedViewers={viewerLibrary}
        onExportNoticeChange={(notice) => {
          setExportTaskNotice(notice);
          setIsExportTaskNoticeHovered(false);
          if (notice) {
            const nextKey = notice.detail ? `${notice.title}|${notice.message}|${notice.detail}` : `${notice.title}|${notice.message}`;
            setDismissedExportTaskNoticeKey((prev) => (prev === nextKey ? prev : null));
          } else {
            setDismissedExportTaskNoticeKey(null);
          }
        }}
      />

      <UserProfilePanel
        open={isUserProfilePanelOpen}
        onClose={() => setIsUserProfilePanelOpen(false)}
        onPreferencesChange={(next) => {
          setAppPreferences(next);
        }}
        onClearViewerState={handleClearPersistedViewerState}
        onClearViewerHistory={handleClearViewerHistoryOnly}
        onResetLocalProfile={handleResetLocalProfileData}
        onDeleteLocalDataset={handleDeleteLocalDataset}
        onOpenLocalDatasetManager={() => {
          setIsUserProfilePanelOpen(false);
          setRequestedLocalDatasetManagerSourceId(null);
          setIsLocalDatasetManagerOpen(true);
        }}
        onDataChanged={notifyProfileDataChanged}
        shortcutBindings={shortcutBindings}
        onShortcutBindingChange={handleShortcutBindingChange}
        onResetShortcutBinding={handleResetSingleShortcut}
        onResetAllShortcuts={handleResetAllShortcuts}
        savedViewerStateExists={hasPersistedViewerState || viewerLibrary.length > 0}
        savedHistoryCount={pastStatesRef.current.length + futureStatesRef.current.length}
        dataRevision={profileDataRevision}
      />
    </div>
  );
}
