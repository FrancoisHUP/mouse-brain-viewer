import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import WebGLCanvas from "./WebGLCanvas";
import BottomToolbar, { type HistoryMenuItem, type ToolId } from "./BottomToolbar";
import LayerPanel from "./LayerPanel";
import ImportDataPanel from "./ImportDataPanel";
import LocalDatasetManagerPanel from "./LocalDatasetManagerPanel";
import UserProfilePanel from "./UserProfilePanel";
import StatePanel from "./StatePanel";
import SaveToastStack, { type SaveToast } from "./components/app/SaveToastStack";
import VersionBadge from "./components/app/VersionBadge";
import LayerInspectorPanel from "./components/app/LayerInspectorPanel";
import GlobalDropOverlay from "./components/app/GlobalDropOverlay";
import AppMenuPanel from "./components/app/AppMenuPanel";
import AboutDialog from "./components/app/AboutDialog";
import ShareDialog from "./components/app/ShareDialog";
import StateDialog from "./components/app/StateDialog";
import ClearHistoryDialog from "./components/app/ClearHistoryDialog";
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
import {
  clearPersistedViewerState,
  loadPersistedViewerSession,
  savePersistedViewerSession,
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
import type {
  AnnotationShape,
  LayerItemNode,
  LayerTreeNode,
  NodeTransform,
  RemoteContentKind,
  RemoteDataFormat,
  RemoteOmeResolution,
  RemoteRenderMode,
  SliceLayerParams,
  SlicePlane,
} from "./layerTypes";
import { type LocalImportCandidate, type LocalInputEntry } from "./localDataHandlers";
import { clearAllLocalDatasetRecords, deleteLocalDatasetRecord, renameLocalDatasetRecord, storeLocalDatasetFile, storeLocalDatasetTree } from "./localDataStore";
import type { ScenePointerHit, SelectedLayerRuntimeInfo } from "./WebGLCanvas";
import {
  collectAllLayerItems,
  collectGroups,
  deleteNodeById,
  findNodeById,
  getFirstLayerId,
  insertIntoGroup,
  insertNodesBeforeNode,
  insertNodesIntoGroup,
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


const DEFAULT_ANNOTATION_SHAPE_SIZES: AnnotationShapeSizeMap = {
  point: 0.06,
  line: 0.06,
  rectangle: 0.06,
  circle: 0.06,
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
  const [isImportPanelOpen, setIsImportPanelOpen] = useState(false);
  const [isLocalDatasetManagerOpen, setIsLocalDatasetManagerOpen] = useState(false);
  const [isUserProfilePanelOpen, setIsUserProfilePanelOpen] = useState(false);
  const [isStateDialogOpen, setIsStateDialogOpen] = useState(false);
  const [isShareDialogOpen, setIsShareDialogOpen] = useState(false);
  const [isAboutDialogOpen, setIsAboutDialogOpen] = useState(false);
  const [isAppMenuOpen, setIsAppMenuOpen] = useState(false);
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
  const runtimeErrorFingerprintRef = useRef<Map<string, number>>(new Map());
  const [historyRevision, setHistoryRevision] = useState(0);
  const [isClearHistoryConfirmOpen, setIsClearHistoryConfirmOpen] = useState(false);
  const [appPreferences, setAppPreferences] = useState<AppPreferences>(() =>
    loadAppPreferences()
  );
  const [profileDataRevision, setProfileDataRevision] = useState(0);
  const [hasPersistedViewerState, setHasPersistedViewerState] = useState(false);
  const [shortcutBindings, setShortcutBindings] = useState<ShortcutBindingMap>(() => loadShortcutBindings());

  const [annotationDraft, setAnnotationDraft] = useState<AnnotationDraftSettings>(DEFAULT_ANNOTATION_DRAFT);
  const [annotationRecentColors, setAnnotationRecentColors] = useState<string[]>(() => loadRecentAnnotationColors());
  const [isInspectorCollapsed, setIsInspectorCollapsed] = useState(false);
  const [selectedLayerRuntimeInfo, setSelectedLayerRuntimeInfo] = useState<SelectedLayerRuntimeInfo | null>(null);

  const [localSceneLoadState, setLocalSceneLoadState] = useState<{ active: boolean; pending: number }>({ active: false, pending: 0 });
  const [dismissLocalSceneLoadNotice, setDismissLocalSceneLoadNotice] = useState(false);
  const [isGlobalFileDragActive, setIsGlobalFileDragActive] = useState(false);
  const [droppedLocalEntries, setDroppedLocalEntries] = useState<LocalInputEntry[] | null>(null);
  const [scenePointerTarget, setScenePointerTarget] = useState<ScenePointerHit | null>(null);
  const [isSlicePanelHoverLocked, setIsSlicePanelHoverLocked] = useState(false);
  const [sliceToolPlane, setSliceToolPlane] = useState<SlicePlane | null>(null);

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
    opacity: 0.92,
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

  const selectedAnnotationLayer =
    selectedNode &&
    selectedNode.kind === "layer" &&
    selectedNode.type === "annotation"
      ? selectedNode
      : null;

  const selectedCanonicalSliceLayer = isCanonicalSliceBrowsableLayer(selectedNode)
    ? selectedNode
    : null;

  const selectedAnnotation = selectedAnnotationLayer?.annotation ?? null;

  const canShowGlobalDropOverlay =
    isGlobalFileDragActive &&
    !isImportPanelOpen &&
    !isLocalDatasetManagerOpen &&
    !isUserProfilePanelOpen &&
    activeTool !== "library" &&
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






  const sliceToolTargetPlane = getCanonicalSliceToolPlane();
  const sliceToolViewState = sliceToolTargetPlane
    ? getCanonicalSliceViewState(sliceToolTargetPlane)
    : {
        flipX: false,
        flipY: false,
        flipZ: false,
        rotationDeg: 0,
        scale: 1,
      };

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
        onUpdateSelectedNodeTransform={updateSelectedNodeTransform}
        onResetSelectedNodeTransform={resetSelectedNodeTransform}
        onUpdateSelectedAnnotationLayer={updateSelectedAnnotationLayer}
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
        camera: cameraState,
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
      cameraState,
    ]
  );

  const currentViewerHash = useMemo(
    () => hashViewerStateForHistory(currentViewerState),
    [currentViewerState]
  );

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
    setCameraState(nextState.camera);
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
    if (isCanonicalSliceBrowsableLayer(selectedNode)) {
      if (sliceVolumeLayerId !== selectedNode.id) {
        setSliceVolumeLayerId(selectedNode.id);
      }
      return;
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
  }, [selectedNode, sliceVolumeLayerId, sliceBrowsableLayers, layerTree]);

  useEffect(() => {
    if (hasHydratedHistoryRef.current) return;
    hasHydratedHistoryRef.current = true;

    const stateFromLocation = readInitialStateFromLocation();
    const sharedViewerUrl = getCurrentSharedViewerUrl();
    const persistedSession = loadPersistedViewerSession();
    const persistedHistory = loadPersistedViewerHistory();

    if (stateFromLocation) {
      lastCommittedStateRef.current = stateFromLocation;
      lastCommittedHashRef.current = hashViewerStateForHistory(stateFromLocation);
      applyViewerState(stateFromLocation, { suppressAutoCommit: true });
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
      lastCommittedStateRef.current = initialState;
      lastCommittedHashRef.current = hashViewerStateForHistory(initialState);
      applyViewerState(initialState, { suppressAutoCommit: true });
      setActiveSavedViewerId(resolveOwnedSavedViewerId(persistedSession?.activeSavedViewerId ?? null, viewerLibrary));
      setHasPersistedViewerState(!!persistedSession || !!persistedHistory);
      bumpHistoryRevision();
      return;
    }

    lastCommittedStateRef.current = currentViewerState;
    lastCommittedHashRef.current = currentViewerHash;
    savePersistedViewerSession({
      version: 2,
      state: currentViewerState,
      activeSavedViewerId: null,
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
        version: 2,
        state: currentViewerState,
        activeSavedViewerId: resolveOwnedSavedViewerId(activeSavedViewerId, viewerLibrary),
      });
      setHasPersistedViewerState(true);
    } else {
      clearPersistedViewerState();
      setHasPersistedViewerState(false);
    }
  }, [activeSavedViewerId, currentViewerState, viewerLibrary]);

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
              opacity: item.opacity ?? 0.92,
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
      activeTool === "library";

    function handleKeyDown(event: KeyboardEvent) {
      if (blockingOverlayOpen) return;
      if (shouldIgnoreShortcutTarget(event.target)) return;

      const hasPrimaryModifier = event.metaKey || event.ctrlKey;
      const hasNoSecondaryModifiers = !event.altKey && !event.shiftKey;
      const lowerKey = event.key.toLowerCase();

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
        opacity: 0.92,
      },
      layerPanelCollapsed: false,
      inspectorCollapsed: false,
      camera: DEFAULT_CAMERA_STATE,
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
      prev === "slice" || prev === "library" ? "mouse" : prev
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
    if (activeTool === "library") {
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

    setViewerLibrary((prev) =>
      prev.map((entry) =>
        entry.id === entryId
          ? { ...entry, name: trimmed }
          : entry
      )
    );
    setLibraryError(null);
    setLibraryMessage(null);
    enqueueToast({
      tone: "info",
      title: "Viewer renamed",
      message: `This saved viewer is now called "${trimmed}".`,
    });
  }


  function handleToolChange(tool: ToolId) {
    setActiveTool(tool);
    if (tool !== "slice") {
      setScenePointerTarget(null);
    }

    if (tool === "slice") {
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
  }

  function handleSelectSceneLayer(nodeId: string | null, options?: { toggle?: boolean }) {
    if (!nodeId) {
      setSelectedNodeId(null);
      setSelectedNodeIdsExternal(null);
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
  }

  function handleSelectSceneLayers(nodeIds: string[], options?: { append?: boolean; preferredNodeId?: string | null }) {
    const orderedUnique = Array.from(new Set(nodeIds.filter((id) => typeof id === "string" && id.length > 0)));
    if (!orderedUnique.length) return;
    const append = !!options?.append;
    setSelectedNodeIdsExternal((prev) => {
      const base = append ? Array.from(new Set((prev ?? (selectedNodeId ? [selectedNodeId] : [])).filter(Boolean))) : [];
      const merged = append ? Array.from(new Set([...base, ...orderedUnique])) : orderedUnique;
      return merged.length ? merged : null;
    });
    setSelectedNodeId(options?.preferredNodeId ?? orderedUnique[orderedUnique.length - 1] ?? orderedUnique[0]);
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

  async function handleAddLocalImports(
    candidates: LocalImportCandidate[]
  ): Promise<{ addedCount: number; errors: string[] }> {
    if (!candidates.length) return { addedCount: 0, errors: [] };

    const addedNodes: LayerTreeNode[] = [];
    const errors: string[] = [];

    for (const candidate of candidates) {
      try {
        const isTree = candidate.entries.length > 1 || candidate.inspection.format === "ome-zarr" || candidate.inspection.format === "zarr";
        const stored = isTree
          ? await storeLocalDatasetTree(candidate.name, candidate.entries)
          : await storeLocalDatasetFile(candidate.entries[0].file);
        const renderMode = candidate.inspection.kind === "volume" ? (candidate.inspection.renderMode ?? "slices") : undefined;
        const displayName = buildLocalLayerDisplayName(candidate.name, {
          renderMode,
          selectedResolution: candidate.inspection.info.selectedResolution,
          kind: candidate.inspection.kind,
        });

        addedNodes.push({
          id: createId(),
          kind: "layer",
          name: displayName,
          type: "file",
          visible: true,
          source: stored.id,
          sourceKind: "custom-upload",
          mimeType: candidate.inspection.info.mimeType || undefined,
          description: "Stored only in this browser. This layer is not included in share links.",
          renderMode,
          localOnly: true,
          localDataFormat: candidate.inspection.format,
          localDataKind: candidate.inspection.kind,
          localDatasetInfo: {
            ...candidate.inspection.info,
            datasetId: stored.id,
          },
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unsupported local dataset.";
        errors.push(`${candidate.name}: ${message}`);
      }
    }

    if (addedNodes.length > 0) {
      setLayerTree((prev) => {
        let next = prev;

        for (const node of addedNodes) {
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

    setIsImportPanelOpen(false);
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

  function updateSelectedNodeTransform(patch: Partial<NodeTransform>) {
    if (!selectedNodeId) return;

    setLayerTree((prev) =>
      updateNodeById(prev, selectedNodeId, (node) => {
        const currentTranslation = normalizeTransformVector(node.transform?.translation, [0, 0, 0]);
        const currentRotation = normalizeTransformVector(node.transform?.rotation, [0, 0, 0]);
        const currentScale = normalizeTransformVector(node.transform?.scale, [1, 1, 1]);

        return {
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
      })
    );
  }

  function resetSelectedNodeTransform() {
    if (!selectedNodeId) return;
    setLayerTree((prev) =>
      updateNodeById(prev, selectedNodeId, (node) => ({
        ...node,
        transform: {
          translation: [0, 0, 0],
          rotation: [0, 0, 0],
          scale: [1, 1, 1],
        },
      }))
    );
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
        const node: LayerTreeNode = {
          id: createId(),
          kind: "layer",
          name: item.name.trim() || "Remote Data",
          type: "remote",
          visible: true,
          source: trimmedUrl,
          sourceKind: "external",
          description:
            remoteFormat === "mesh-obj"
              ? "External mesh source"
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
        };

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
    setViewerLibraryMode("browse");
    setAnnotationRecentColors([]);
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

  function handleRequestFocusSelectedLayer() {
    if (!selectedNode || selectedNode.kind !== "layer") return;
    setActiveTool("mouse");
    setFocusSelectedLayerRequestKey((prev) => prev + 1);
  }

  function handleRequestResetOrbitCenter() {
    setCameraState((prev) => ({ ...DEFAULT_CAMERA_STATE, mode: prev.mode }));
    setCameraSyncKey((prev) => prev + 1);
  }

  return (
    <div
      data-app-theme={appPreferences.theme}
      style={{
        width: "100vw",
        height: "100vh",
        overflow: "hidden",
        margin: 0,
        position: "relative",
        background: appPreferences.sceneBackground,
        color: appPreferences.theme === "light" ? "#18212b" : "white",
        cursor:
          activeTool === "select"
            ? "pointer"
            : appPreferences.cursorStyle === "crosshair"
            ? "crosshair"
            : appPreferences.cursorStyle === "high-contrast"
            ? "cell"
            : "default",
        userSelect: activeTool === "select" ? "none" : "auto",
        WebkitUserSelect: activeTool === "select" ? "none" : "auto",
      }}
    >
      <style>{getThemeRootCss(appPreferences.theme)}</style>
      <style>{`
        [data-viewer-app-menu='true'] {
          -webkit-user-select: none;
          user-select: none;
        }
      `}</style>

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
        onAxisSliceStateChange={handleUpdateAxisSliceState}
        onCanvasElementChange={handleCanvasElementChange}
        onLocalSceneLoadStateChange={handleLocalSceneLoadStateChange}
        localSceneLoadingActive={localSceneLoadState.active}
        focusSelectedLayerRequestKey={focusSelectedLayerRequestKey}
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
        onOpenImportData={() => { setIsImportPanelOpen(true); setIsAppMenuOpen(false); }}
        onOpenManageLocalData={() => { setIsLocalDatasetManagerOpen(true); setIsAppMenuOpen(false); }}
        onOpenExportState={() => { openExportStateModal(); setIsAppMenuOpen(false); }}
        onOpenImportState={() => { openImportStateModal(); setIsAppMenuOpen(false); }}
        onOpenShareDialog={openShareDialog}
        onOpenProfile={() => { setIsUserProfilePanelOpen(true); setIsAppMenuOpen(false); }}
        onOpenAbout={openAboutDialog}
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

      <ImportDataPanel
        key={profileDataRevision}
        open={isImportPanelOpen}
        initialLocalEntries={droppedLocalEntries}
        onConsumeInitialLocalEntries={() => setDroppedLocalEntries(null)}
        onClose={() => {
          setIsImportPanelOpen(false);
          setDroppedLocalEntries(null);
        }}
        onAddDrawingLayer={handleAddDrawingLayer}
        onAddExternalSources={handleAddExternalSources}
        onAddLocalImports={handleAddLocalImports}
        onOpenLocalDatasetManager={() => {
          setIsImportPanelOpen(false);
          setDroppedLocalEntries(null);
          setIsLocalDatasetManagerOpen(true);
        }}
      />

      <LocalDatasetManagerPanel
        open={isLocalDatasetManagerOpen}
        onClose={() => setIsLocalDatasetManagerOpen(false)}
        onRenameDataset={handleRenameLocalDataset}
        onDeleteDataset={handleDeleteLocalDataset}
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
        onOpenViewer={handleOpenSavedViewer}
        onDeleteViewers={handleDeleteSavedViewer}
        onRenameViewer={handleRenameSavedViewer}
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

      <BottomToolbar
        activeTool={activeTool}
        onToolChange={handleToolChange}
        cameraMode={cameraState.mode}
        onCameraModeChange={handleCameraModeChange}
        onFocusSelectedLayer={handleRequestFocusSelectedLayer}
        onSaveCurrentViewer={handleSaveCurrentViewerToLibrary}
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
        onAnnotationShapeChange={setAnnotationDraftShape}
        onAnnotationColorChange={handleAnnotationDraftColorChange}
        onAnnotationColorCommit={handleAnnotationDraftColorCommit}
        onAnnotationOpacityChange={handleAnnotationDraftOpacityChange}
        onAnnotationSizeChange={handleAnnotationDraftSizeChange}
        onAnnotationDepthChange={handleAnnotationDraftDepthChange}
        onAnnotationEraseModeChange={(mode) => setAnnotationDraft((prev) => ({ ...prev, eraseMode: mode }))}
        onAnnotationPickColorFromScreen={handlePickAnnotationColorFromScreen}
        sliceSelectedLayerName={selectedCanonicalSliceLayer?.name ?? null}
        sliceTargetPlane={sliceToolTargetPlane}
        sliceHoveredPlane={
          !isSlicePanelHoverLocked &&
          scenePointerTarget?.plane &&
          selectedCanonicalSliceLayer &&
          scenePointerTarget.layerId === selectedCanonicalSliceLayer.id
            ? scenePointerTarget.plane
            : null
        }
        sliceCanResetToCenter={!!selectedCanonicalSliceLayer && !!selectedLayerRuntimeInfo?.dims}
        sliceRotationDeg={sliceToolViewState.rotationDeg}
        sliceScale={sliceToolViewState.scale}
        sliceFlipX={sliceToolViewState.flipX}
        sliceFlipY={sliceToolViewState.flipY}
        sliceFlipZ={sliceToolViewState.flipZ}
        sliceVisibilityXY={getCanonicalSliceViewState("xy").visible}
        sliceVisibilityXZ={getCanonicalSliceViewState("xz").visible}
        sliceVisibilityYZ={getCanonicalSliceViewState("yz").visible}
        onSliceHoverLockChange={setIsSlicePanelHoverLocked}
        onSliceToggleVisibility={handleToggleCanonicalSliceVisibility}
        onSliceResetView={handleResetCanonicalSliceView}
        onSliceToggleFlip={handleToggleCanonicalSliceFlip}
        onSliceResetToCenter={handleCenterCanonicalSlices}
        onSliceRotate={handleRotateCanonicalSlice}
        onSliceScale={handleScaleCanonicalSlice}
      />
    </div>
  );
}
