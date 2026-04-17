import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import WebGLCanvas from "./WebGLCanvas";
import BottomToolbar, { type HistoryMenuItem, type ToolId } from "./BottomToolbar";
import LayerPanel from "./LayerPanel";
import ImportDataPanel from "./ImportDataPanel";
import LocalDatasetManagerPanel from "./LocalDatasetManagerPanel";
import SliceToolPopover from "./SliceToolPopover";
import UserProfilePanel from "./UserProfilePanel";
import StatePanel from "./StatePanel";
import {
  loadAppPreferences,
  type AppPreferences,
} from "./appPreferencesStore";
import {
  clearPersistedViewerState,
  loadPersistedViewerState,
  savePersistedViewerState,
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
import ViewerLibraryPanel from "./ViewerLibraryPanel";
import {
  buildDefaultSavedViewerName,
  clearPersistedViewerLibrary,
  createSavedViewerEntry,
  loadPersistedViewerLibrary,
  savePersistedViewerLibrary,
  upsertSharedViewerEntry,
  type SavedViewerEntry,
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

function createId() {
  return Math.random().toString(36).slice(2, 10);
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

type AddSliceOptions = {
  volumeLayerId: string;
  sliceParams: SliceLayerParams;
  name?: string;
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

type AnnotationDraftSettings = {
  shape: AnnotationShape;
  color: string;
  opacity: number;
  size: number;
  depth: number;
  eraseMode: "all" | "color";
};

const DEFAULT_ANNOTATION_DRAFT: AnnotationDraftSettings = {
  shape: "point",
  color: "#ff5c5c",
  opacity: 0.9,
  size: 0.06,
  depth: 0.015,
  eraseMode: "color",
};

const ANNOTATION_RECENT_COLORS_STORAGE_KEY = "allen-viewer-annotation-recent-colors-v1";

function loadRecentAnnotationColors(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(ANNOTATION_RECENT_COLORS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((value): value is string => typeof value === "string").slice(0, 10);
  } catch {
    return [];
  }
}

function saveRecentAnnotationColors(colors: string[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(ANNOTATION_RECENT_COLORS_STORAGE_KEY, JSON.stringify(colors.slice(0, 10)));
  } catch {}
}

function normalizeHexColor(color: string): string {
  const normalized = color.trim().replace("#", "");
  const safe = normalized.length === 3 ? normalized.split("").map((c) => c + c).join("") : normalized;
  return /^[0-9a-fA-F]{6}$/.test(safe) ? `#${safe.toLowerCase()}` : DEFAULT_ANNOTATION_DRAFT.color;
}

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

const secondaryButtonStyle: CSSProperties = {
  height: 34,
  padding: "0 12px",
  borderRadius: 10,
  border: "1px solid rgba(255,255,255,0.10)",
  background: "rgba(255,255,255,0.05)",
  color: "white",
  cursor: "pointer",
};

const primaryButtonStyle: CSSProperties = {
  height: 34,
  padding: "0 12px",
  borderRadius: 10,
  border: "1px solid rgba(160,220,255,0.35)",
  background: "rgba(120,190,255,0.18)",
  color: "white",
  cursor: "pointer",
  fontWeight: 600,
};

const APP_VERSION = __APP_VERSION__ || "0.0.0-dev";
const APP_COMMIT_SHA = __APP_COMMIT_SHA__ || "dev";
const APP_REPO_URL = __APP_REPO_URL__ || "";
const APP_COMMIT_SHORT = APP_COMMIT_SHA === "dev" ? "dev" : APP_COMMIT_SHA.slice(0, 7);
const APP_COMMIT_URL =
  APP_COMMIT_SHA === "dev" || !APP_REPO_URL
    ? null
    : `${APP_REPO_URL}/commit/${APP_COMMIT_SHA}`;

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


function MenuHamburgerIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M4 7h16" />
      <path d="M4 12h16" />
      <path d="M4 17h16" />
    </svg>
  );
}

function NewViewerIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="5" width="16" height="14" rx="2.5" />
      <path d="M12 9v6" />
      <path d="M9 12h6" />
    </svg>
  );
}

function LibraryMenuIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3.5 7.5A2.5 2.5 0 016 5h4l2 2h6A2.5 2.5 0 0120.5 9.5v8A2.5 2.5 0 0118 20H6a2.5 2.5 0 01-2.5-2.5z" />
      <path d="M3.5 9h17" />
    </svg>
  );
}

function SaveMenuIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 4h11l3 3v13a1 1 0 01-1 1H6a1 1 0 01-1-1V4z" />
      <path d="M8 4v6h8V4" />
      <path d="M9 16h6" />
    </svg>
  );
}

function ImportDataMenuIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <ellipse cx="12" cy="6" rx="7" ry="3" />
      <path d="M5 6v6c0 1.7 3.1 3 7 3s7-1.3 7-3V6" />
      <path d="M5 12v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6" />
    </svg>
  );
}

function ManageDataMenuIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 6h10" />
      <path d="M4 12h16" />
      <path d="M4 18h12" />
      <circle cx="17" cy="6" r="2" />
      <circle cx="8" cy="18" r="2" />
    </svg>
  );
}

function ShareMenuIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="18" cy="5" r="2.5" />
      <circle cx="6" cy="12" r="2.5" />
      <circle cx="18" cy="19" r="2.5" />
      <path d="M8.2 10.8l7.6-4.6" />
      <path d="M8.2 13.2l7.6 4.6" />
    </svg>
  );
}

function ImportStateMenuIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 21V10" />
      <path d="M8 17l4 4 4-4" />
      <path d="M5 10V6a2 2 0 012-2h10a2 2 0 012 2v4" />
    </svg>
  );
}

function ProfileMenuIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 20a7 7 0 0114 0" />
    </svg>
  );
}


function getThemeRootCss(theme: AppPreferences["theme"]): string {
  if (theme === "light") {
    return `
      [data-app-theme="light"] { color: #18212b; }
      [data-app-theme="light"] button,
      [data-app-theme="light"] input,
      [data-app-theme="light"] select,
      [data-app-theme="light"] textarea {
        background: rgba(255,255,255,0.92) !important;
        color: #18212b !important;
        border-color: rgba(24,33,43,0.14) !important;
      }
      [data-app-theme="light"] button[style],
      [data-app-theme="light"] input[style],
      [data-app-theme="light"] select[style],
      [data-app-theme="light"] textarea[style] {
        box-shadow: none !important;
      }
      [data-app-theme="light"] [data-theme-surface="panel"] {
        background: rgba(245,248,252,0.96) !important;
        color: #18212b !important;
        border-color: rgba(24,33,43,0.12) !important;
      }
      [data-app-theme="light"] [data-theme-surface="soft"] {
        background: rgba(255,255,255,0.78) !important;
        color: #18212b !important;
        border-color: rgba(24,33,43,0.10) !important;
      }
      [data-app-theme="light"] [data-theme-text="muted"] {
        color: rgba(24,33,43,0.74) !important;
      }
      [data-app-theme="light"] [data-theme-text="strong"] {
        color: #18212b !important;
      }
      [data-app-theme="light"] option {
        color: #18212b !important;
        background: #ffffff !important;
      }
      [data-app-theme="light"] [data-slice-tool="true"] label,
      [data-app-theme="light"] [data-slice-tool="true"] div,
      [data-app-theme="light"] [data-slice-tool="true"] span {
        color: #18212b !important;
      }
    `;
  }

  if (theme === "gray") {
    return `
      [data-app-theme="gray"] { color: #edf1f5; }
      [data-app-theme="gray"] button,
      [data-app-theme="gray"] input,
      [data-app-theme="gray"] select,
      [data-app-theme="gray"] textarea {
        background: rgba(64,72,82,0.88) !important;
        color: #edf1f5 !important;
        border-color: rgba(255,255,255,0.12) !important;
      }
      [data-app-theme="gray"] [data-theme-surface="panel"] {
        background: rgba(46,52,60,0.96) !important;
        color: #edf1f5 !important;
        border-color: rgba(255,255,255,0.10) !important;
      }
      [data-app-theme="gray"] [data-theme-surface="soft"] {
        background: rgba(58,66,76,0.78) !important;
        color: #edf1f5 !important;
        border-color: rgba(255,255,255,0.10) !important;
      }
      [data-app-theme="gray"] [data-theme-text="muted"] {
        color: rgba(237,241,245,0.74) !important;
      }
      [data-app-theme="gray"] [data-theme-text="strong"] {
        color: #edf1f5 !important;
      }
      [data-app-theme="gray"] option {
        color: #edf1f5 !important;
        background: #414a54 !important;
      }
    `;
  }

  return `
    [data-app-theme="dark"] [data-theme-surface="panel"] {
      background: rgba(12,14,18,0.96) !important;
      color: white !important;
      border-color: rgba(255,255,255,0.10) !important;
    }
    [data-app-theme="dark"] [data-theme-surface="soft"] {
      background: rgba(255,255,255,0.05) !important;
      color: white !important;
      border-color: rgba(255,255,255,0.10) !important;
    }
    [data-app-theme="dark"] [data-theme-text="muted"] {
      color: rgba(255,255,255,0.74) !important;
    }
    [data-app-theme="dark"] [data-theme-text="strong"] {
      color: white !important;
    }
  `;
}

export default function App({ startupSlices = [] }: AppProps) {
  const [activeTool, setActiveTool] = useState<ToolId>("mouse");
  const [isImportPanelOpen, setIsImportPanelOpen] = useState(false);
  const [isLocalDatasetManagerOpen, setIsLocalDatasetManagerOpen] = useState(false);
  const [isUserProfilePanelOpen, setIsUserProfilePanelOpen] = useState(false);
  const [isStateDialogOpen, setIsStateDialogOpen] = useState(false);
  const [isShareDialogOpen, setIsShareDialogOpen] = useState(false);
  const [isAppMenuOpen, setIsAppMenuOpen] = useState(false);
  const [layerTree, setLayerTree] = useState<LayerTreeNode[]>(INITIAL_TREE);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(
    getFirstLayerId(INITIAL_TREE)
  );
  const [isLayerPanelCollapsed, setIsLayerPanelCollapsed] = useState(false);
  const [cameraState, setCameraState] = useState<SerializableCameraState>(
    DEFAULT_CAMERA_STATE
  );
  const [cameraSyncKey, setCameraSyncKey] = useState(0);
  const [orbitResetRequestKey, setOrbitResetRequestKey] = useState(0);
  const [stateModalMode, setStateModalMode] = useState<"export" | "import">("export");
  const [stateTextDraft, setStateTextDraft] = useState("");
  const [stateError, setStateError] = useState<string | null>(null);
  const [stateShareMessage, setStateShareMessage] = useState<string | null>(null);
  const [shareUrlDraft, setShareUrlDraft] = useState("");
  const [viewerLibrary, setViewerLibrary] = useState<SavedViewerEntry[]>(() =>
    loadPersistedViewerLibrary()
  );
  const [libraryMessage, setLibraryMessage] = useState<string | null>(null);
  const [libraryError, setLibraryError] = useState<string | null>(null);
  const [saveNoticeOpen, setSaveNoticeOpen] = useState(false);
  const [saveNoticeMessage, setSaveNoticeMessage] = useState<string | null>(null);
  const [historyRevision, setHistoryRevision] = useState(0);
  const [isClearHistoryConfirmOpen, setIsClearHistoryConfirmOpen] = useState(false);
  const [appPreferences, setAppPreferences] = useState<AppPreferences>(() =>
    loadAppPreferences()
  );
  const [profileDataRevision, setProfileDataRevision] = useState(0);
  const [hasPersistedViewerState, setHasPersistedViewerState] = useState(false);

  const [annotationDraft, setAnnotationDraft] = useState<AnnotationDraftSettings>(DEFAULT_ANNOTATION_DRAFT);
  const [annotationRecentColors, setAnnotationRecentColors] = useState<string[]>(() => loadRecentAnnotationColors());
  const [isInspectorCollapsed, setIsInspectorCollapsed] = useState(false);
  const [selectedLayerRuntimeInfo, setSelectedLayerRuntimeInfo] = useState<SelectedLayerRuntimeInfo | null>(null);

  const [localSceneLoadState, setLocalSceneLoadState] = useState<{ active: boolean; pending: number }>({ active: false, pending: 0 });
  const [dismissLocalSceneLoadNotice, setDismissLocalSceneLoadNotice] = useState(false);
  const [isGlobalFileDragActive, setIsGlobalFileDragActive] = useState(false);
  const [droppedLocalEntries, setDroppedLocalEntries] = useState<LocalInputEntry[] | null>(null);

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
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setIsAppMenuOpen(false);
    }
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
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
  const omeLayers = useMemo(() => allLayers.filter(isRemoteOmeLayer), [allLayers]);

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

  const selectedAnnotation = selectedAnnotationLayer?.annotation ?? null;

  const canShowGlobalDropOverlay =
    isGlobalFileDragActive &&
    !isImportPanelOpen &&
    !isLocalDatasetManagerOpen &&
    !isUserProfilePanelOpen &&
    activeTool !== "library" &&
    activeTool !== "export";

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

  const inspectorPanelContent: ReactNode = (
    <div
      data-theme-surface="panel"
      style={{
        width: "100%",
        borderRadius: 14,
        border: "1px solid rgba(255,255,255,0.08)",
        boxShadow: "none",
        backdropFilter: "blur(14px)",
        overflow: "hidden",
        transition: "width 220ms ease",
        fontFamily: "sans-serif",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          padding: "12px 14px",
          borderBottom: isInspectorCollapsed ? "none" : "1px solid rgba(255,255,255,0.08)",
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div data-theme-text="strong" style={{ fontSize: 13, fontWeight: 700 }}>
            {selectedNode ? selectedNode.name : "No selection"}
          </div>
          <div data-theme-text="muted" style={{ fontSize: 11, marginTop: 3 }}>
            {selectedNode
              ? selectedNode.kind === "group"
                ? "Group"
                : selectedNode.type === "annotation"
                ? `Annotation · ${selectedAnnotation?.shape ?? "point"}`
                : selectedNode.type === "custom-slice"
                ? "Custom slice"
                : selectedNode.type === "remote"
                ? "Remote layer"
                : selectedNode.type === "primitive"
                ? "Primitive"
                : "Layer"
              : "Select a layer to inspect it."}
          </div>
        </div>

        <button
          type="button"
          onClick={() => setIsInspectorCollapsed((prev) => !prev)}
          aria-label={isInspectorCollapsed ? "Expand inspector" : "Collapse inspector"}
          title={isInspectorCollapsed ? "Expand inspector" : "Collapse inspector"}
          style={{
            width: 34,
            height: 34,
            borderRadius: 12,
            border: "1px solid rgba(255,255,255,0.10)",
            background: "rgba(255,255,255,0.04)",
            color: "inherit",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            transition: "all 180ms ease",
            flex: "0 0 auto",
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ transform: isInspectorCollapsed ? "rotate(-90deg)" : "rotate(90deg)", transition: "transform 220ms ease" }}>
            <path d="M9 6l6 6-6 6" />
          </svg>
        </button>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateRows: isInspectorCollapsed ? "0fr" : "1fr",
          transition: "grid-template-rows 220ms ease",
        }}
      >
        <div style={{ overflow: "hidden" }}>
          <div style={{ padding: "14px", display: "grid", gap: 12 }}>
            {selectedNode ? (
              <>
                <label style={{ display: "grid", gap: 6 }}>
                  <input
                    value={selectedNode.name}
                    onChange={(event) => handleRenameNode(selectedNode.id, event.target.value)}
                    style={{
                      height: 34,
                      padding: "0 10px",
                      borderRadius: 10,
                      border: "1px solid rgba(255,255,255,0.10)",
                      background: "rgba(255,255,255,0.04)",
                      color: "inherit",
                    }}
                  />
                </label>

                {selectedAnnotationLayer ? (
                  <>
                    <div style={{ display: "grid", gap: 6 }}>
                      <span data-theme-text="muted" style={{ fontSize: 11, fontWeight: 600, letterSpacing: 0.2 }}>
                        Color
                      </span>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <input
                          type="color"
                          value={selectedAnnotation?.color ?? annotationDraft.color}
                          onChange={(event) => updateSelectedAnnotationLayer({ color: event.target.value })}
                          style={{ width: 40, height: 34, padding: 0, border: "none", background: "transparent", cursor: "pointer" }}
                        />
                        {selectedAnnotation?.shape !== "freehand" ? (
                          <>
                            <input
                              type="range"
                              min={0}
                              max={1}
                              step={0.01}
                              value={selectedAnnotation?.opacity ?? annotationDraft.opacity}
                              onChange={(event) => updateSelectedAnnotationLayer({ opacity: Number(event.target.value) })}
                              style={{ flex: 1 }}
                            />
                            <span style={{ fontSize: 11, minWidth: 36, textAlign: "right", opacity: 0.72 }}>
                              {Math.round((selectedAnnotation?.opacity ?? annotationDraft.opacity) * 100)}%
                            </span>
                          </>
                        ) : (
                          <span data-theme-text="muted" style={{ fontSize: 11, opacity: 0.72 }}>
                            This layer keeps all strokes in one color.
                          </span>
                        )}
                      </div>
                    </div>

                    {selectedAnnotation?.shape !== "rectangle" && selectedAnnotation?.shape !== "circle" && selectedAnnotation?.shape !== "freehand" ? (
                      <label style={{ display: "grid", gap: 6 }}>
                        <span data-theme-text="muted" style={{ fontSize: 11, fontWeight: 600, letterSpacing: 0.2 }}>
                          Size
                        </span>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <input
                            type="range"
                            min={0.01}
                            max={0.3}
                            step={0.005}
                            value={selectedAnnotation?.size ?? annotationDraft.size}
                            onChange={(event) => updateSelectedAnnotationLayer({ size: Number(event.target.value) })}
                            style={{ flex: 1 }}
                          />
                          <span style={{ fontSize: 11, minWidth: 42, textAlign: "right", opacity: 0.72 }}>
                            {(selectedAnnotation?.size ?? annotationDraft.size).toFixed(3)}
                          </span>
                        </div>
                      </label>
                    ) : null}

                    <label style={{ display: "grid", gap: 6 }}>
                      <span data-theme-text="muted" style={{ fontSize: 11, fontWeight: 600, letterSpacing: 0.2 }}>
                        Metadata
                      </span>
                      <textarea
                        value={selectedAnnotation?.metadata ?? ""}
                        onChange={(event) => updateSelectedAnnotationLayer({ metadata: event.target.value })}
                        rows={4}
                        style={{
                          resize: "vertical",
                          minHeight: 82,
                          padding: 10,
                          borderRadius: 10,
                          border: "1px solid rgba(255,255,255,0.10)",
                          background: "rgba(255,255,255,0.04)",
                          color: "inherit",
                        }}
                      />
                    </label>
                  </>
                ) : selectedNode.kind === "layer" ? (
                  <div style={{ display: "grid", gap: 10 }}>
                    <div
                      data-theme-surface="soft"
                      style={{
                        borderRadius: 12,
                        border: "1px solid rgba(255,255,255,0.08)",
                        padding: 12,
                        fontSize: 12,
                        lineHeight: 1.55,
                        display: "grid",
                        gap: 8,
                      }}
                    >
                      <div style={{ fontSize: 13, fontWeight: 700 }}>Source information</div>
                      <div><strong>Type:</strong> {selectedLayerRuntimeInfo?.sourceType ?? (selectedNode.type === "remote" ? "Remote layer" : selectedNode.type === "custom-slice" ? "Custom slice" : selectedNode.type === "file" ? "Uploaded file" : "Primitive")}</div>
                      <div><strong>Description:</strong> {selectedNode.description ?? "—"}</div>
                      {selectedLayerRuntimeInfo?.sourceName ? <div><strong>Source name:</strong> {selectedLayerRuntimeInfo.sourceName}</div> : null}
                      {selectedLayerRuntimeInfo?.sourcePath ? (
                        <div style={{ wordBreak: "break-all" }}><strong>Source path:</strong> {selectedLayerRuntimeInfo.sourcePath}</div>
                      ) : typeof selectedNode.source === "string" ? (
                        <div style={{ wordBreak: "break-all" }}><strong>Source path:</strong> {selectedNode.source}</div>
                      ) : null}
                    </div>

                    {(selectedLayerRuntimeInfo?.requestedResolutionUm != null || selectedLayerRuntimeInfo?.dims || selectedLayerRuntimeInfo?.datasetPath || selectedLayerRuntimeInfo?.rawShape) ? (
                      <div
                        data-theme-surface="soft"
                        style={{
                          borderRadius: 12,
                          border: "1px solid rgba(255,255,255,0.08)",
                          padding: 12,
                          fontSize: 12,
                          lineHeight: 1.55,
                          display: "grid",
                          gap: 8,
                        }}
                      >
                        <div style={{ fontSize: 13, fontWeight: 700 }}>Loaded dataset</div>
                        {selectedLayerRuntimeInfo?.requestedResolutionUm != null ? <div><strong>Requested resolution:</strong> {selectedLayerRuntimeInfo.requestedResolutionUm} µm</div> : null}
                        {selectedLayerRuntimeInfo?.resolvedResolutionUm != null ? <div><strong>Resolved resolution:</strong> {selectedLayerRuntimeInfo.resolvedResolutionUm} µm</div> : null}
                        {selectedLayerRuntimeInfo?.datasetIndex != null ? <div><strong>Dataset index:</strong> {selectedLayerRuntimeInfo.datasetIndex}</div> : null}
                        {selectedLayerRuntimeInfo?.datasetPath ? <div style={{ wordBreak: "break-all" }}><strong>OME-Zarr path:</strong> {selectedLayerRuntimeInfo.datasetPath}</div> : null}
                        {selectedLayerRuntimeInfo?.voxelSizeUm ? <div><strong>Voxel size (z,y,x):</strong> {selectedLayerRuntimeInfo.voxelSizeUm.z ?? "?"}, {selectedLayerRuntimeInfo.voxelSizeUm.y ?? "?"}, {selectedLayerRuntimeInfo.voxelSizeUm.x ?? "?"} µm</div> : null}
                        {selectedLayerRuntimeInfo?.dims ? <div><strong>Dims (z,y,x):</strong> {selectedLayerRuntimeInfo.dims.z}, {selectedLayerRuntimeInfo.dims.y}, {selectedLayerRuntimeInfo.dims.x}</div> : null}
                        {selectedLayerRuntimeInfo?.rawShape ? <div><strong>Raw shape:</strong> [{selectedLayerRuntimeInfo.rawShape.join(", ")}]</div> : null}
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <div
                    data-theme-surface="soft"
                    style={{
                      borderRadius: 12,
                      border: "1px solid rgba(255,255,255,0.08)",
                      padding: 12,
                      fontSize: 12,
                      lineHeight: 1.55,
                    }}
                  >
                    Select an annotation layer to edit its style and metadata here.
                  </div>
                )}
              </>
            ) : (
              <div
                data-theme-surface="soft"
                style={{
                  borderRadius: 12,
                  border: "1px solid rgba(255,255,255,0.08)",
                  padding: 12,
                  fontSize: 12,
                  lineHeight: 1.55,
                }}
              >
                Select a layer in the panel to inspect it here.
              </div>
            )}
          </div>
        </div>
      </div>
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
    setAnnotationDraft((prev) => ({ ...prev, ...patch }));
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

  useEffect(() => {
    if (selectedNode && isRemoteOmeLayer(selectedNode)) {
      if (sliceVolumeLayerId !== selectedNode.id) {
        setSliceVolumeLayerId(selectedNode.id);
      }
      return;
    }

    const currentSliceVolumeNode = sliceVolumeLayerId
      ? findNodeById(layerTree, sliceVolumeLayerId)
      : null;
    const currentSliceVolumeIsValid =
      !!currentSliceVolumeNode && isRemoteOmeLayer(currentSliceVolumeNode);

    if (currentSliceVolumeIsValid) {
      return;
    }

    if (omeLayers.length > 0) {
      setSliceVolumeLayerId(omeLayers[0].id);
      return;
    }

    if (sliceVolumeLayerId !== "") {
      setSliceVolumeLayerId("");
    }
  }, [selectedNode, sliceVolumeLayerId, omeLayers, layerTree]);

  useEffect(() => {
    if (hasHydratedHistoryRef.current) return;
    hasHydratedHistoryRef.current = true;

    const stateFromLocation = readInitialStateFromLocation();
    const sharedViewerUrl = getCurrentSharedViewerUrl();
    const persistedState = loadPersistedViewerState();
    const persistedHistory = loadPersistedViewerHistory();

    if (stateFromLocation) {
      lastCommittedStateRef.current = stateFromLocation;
      lastCommittedHashRef.current = hashViewerStateForHistory(stateFromLocation);
      applyViewerState(stateFromLocation, { suppressAutoCommit: true });
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

    const initialState = persistedState ?? persistedHistory?.present.state ?? currentViewerState;

    if (persistedHistory) {
      pastStatesRef.current = persistedHistory.past;
      futureStatesRef.current = persistedHistory.future;
    }

    if (persistedState || persistedHistory) {
      lastCommittedStateRef.current = initialState;
      lastCommittedHashRef.current = hashViewerStateForHistory(initialState);
      applyViewerState(initialState, { suppressAutoCommit: true });
      setHasPersistedViewerState(!!persistedState || !!persistedHistory);
      bumpHistoryRevision();
      return;
    }

    lastCommittedStateRef.current = currentViewerState;
    lastCommittedHashRef.current = currentViewerHash;
    savePersistedViewerState(currentViewerState);
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
      savePersistedViewerState(currentViewerState);
      setHasPersistedViewerState(true);
    } else {
      clearPersistedViewerState();
      setHasPersistedViewerState(false);
    }
  }, [currentViewerState]);

  useEffect(() => {
    savePersistedViewerLibrary(viewerLibrary);
  }, [viewerLibrary]);

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
    function handleKeyDown(event: KeyboardEvent) {
      const isMeta = event.metaKey || event.ctrlKey;
      if (!isMeta) return;

      const key = event.key.toLowerCase();
      if (key === "z" && !event.shiftKey) {
        event.preventDefault();
        handleUndo();
        return;
      }

      if ((key === "z" && event.shiftKey) || key === "y") {
        event.preventDefault();
        handleRedo();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [historyRevision]);

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
    setLibraryError(null);
    setLibraryMessage(null);
    setSaveNoticeOpen(false);
    setSaveNoticeMessage(null);
    setStateError(null);
    setStateShareMessage(null);
    setStateTextDraft("");
    setIsAppMenuOpen(false);
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
    setIsClearHistoryConfirmOpen(false);
    setLibraryError(null);
    setLibraryMessage(null);
    setIsAppMenuOpen(false);
    setActiveTool((prev) =>
      prev === "slice" || prev === "library" ? "mouse" : prev
    );
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

  function handleSaveCurrentViewerToLibrary(name?: string) {
    if (!isSerializableLayerTree(currentViewerState.scene.layerTree)) {
      setLibraryMessage(null);
      setLibraryError(
        "This viewer contains layers that cannot be saved locally."
      );
      setSaveNoticeOpen(false);
      setSaveNoticeMessage(null);
      return;
    }

    const entry = createSavedViewerEntry({
      ownerKind: "owned",
      name: name?.trim() || buildDefaultSavedViewerName("Viewer"),
      state: currentViewerState,
      thumbnailDataUrl: captureViewerThumbnailDataUrl(),
    });

    setViewerLibrary((prev) => [entry, ...prev]);
    setLibraryError(null);
    setLibraryMessage(null);
    setSaveNoticeMessage(`Saved "${entry.name}".`);
    setSaveNoticeOpen(true);
  }

  function handleOpenSavedViewer(entry: SavedViewerEntry) {
    commitCurrentStateNow(entry.state);
    setViewerLibrary((prev) =>
      prev.map((item) =>
        item.id === entry.id ? { ...item, updatedAt: Date.now() } : item
      )
    );
    setLibraryError(null);
    setLibraryMessage(null);
    setSaveNoticeOpen(false);
    setActiveTool("mouse");
  }

  function handleDeleteSavedViewer(entryId: string) {
    setViewerLibrary((prev) => prev.filter((entry) => entry.id !== entryId));
    setLibraryError(null);
    setLibraryMessage("Viewer removed.");
    setSaveNoticeOpen(false);
  }

  function handleRenameSavedViewer(entryId: string, nextName: string) {
    const trimmed = nextName.trim();
    if (!trimmed) return;

    setViewerLibrary((prev) =>
      prev.map((entry) =>
        entry.id === entryId
          ? { ...entry, name: trimmed, updatedAt: Date.now() }
          : entry
      )
    );
    setLibraryError(null);
    setLibraryMessage("Viewer renamed.");
    setSaveNoticeOpen(false);
  }


  function handleOpenLibraryFromSaveNotice() {
    setSaveNoticeOpen(false);
    setLibraryError(null);
    setLibraryMessage(null);
    setActiveTool("library");
  }

  function handleCloseSaveNotice() {
    setSaveNoticeOpen(false);
  }

  function handleToolChange(tool: ToolId) {
    setActiveTool((prev) => (prev === tool && tool === "slice" ? "mouse" : tool));
  }

  function handleToggleVisible(nodeId: string) {
    setLayerTree((prev) => {
      const target = findNodeById(prev, nodeId);
      if (!target) return prev;
      return setNodeVisibleState(prev, nodeId, !target.visible);
    });
  }

  function handleSelectNode(nodeId: string) {
    setSelectedNodeId(nodeId);
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

  function setAnnotationDraftShape(shape: AnnotationShape) {
    setAnnotationDraft((prev) => ({ ...prev, shape }));
    setActiveTool("pencil");
  }

  function handleRenameNode(nodeId: string, newName: string) {
    const trimmed = newName.trim();
    if (!trimmed) return;
    setLayerTree((prev) => renameNodeById(prev, nodeId, trimmed));
  }

  function reconcileSelectionAfterTreeMutation(next: LayerTreeNode[], removedIds: string[] = []) {
    if (!selectedNodeId) return;
    if (removedIds.includes(selectedNodeId) || !findNodeById(next, selectedNodeId)) {
      setSelectedNodeId(getFirstLayerId(next));
    }
    if (removedIds.includes(sliceVolumeLayerId) || (sliceVolumeLayerId && !findNodeById(next, sliceVolumeLayerId))) {
      const nextOmeLayer = collectAllLayerItems(next).find(isRemoteOmeLayer) ?? null;
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

  function handleAddCustomSlice(options: AddSliceOptions) {
    const volumeNode = findNodeById(layerTree, options.volumeLayerId);

    if (!volumeNode || !isRemoteOmeLayer(volumeNode)) {
      console.warn("Cannot create slice: target volume layer not found or not OME-Zarr");
      return;
    }

    const defaultName =
      options.sliceParams.mode === "oblique"
        ? `${volumeNode.name} Oblique Slice`
        : `${volumeNode.name} ${options.sliceParams.plane.toUpperCase()} @ ${options.sliceParams.index}`;

    addNodeAtBestLocation({
      id: createId(),
      kind: "layer",
      name: options.name?.trim() || defaultName,
      type: "custom-slice",
      visible: true,
      source: {
        volumeLayerId: options.volumeLayerId,
      },
      sourceKind: "built-in",
      description:
        options.sliceParams.mode === "oblique"
          ? "Custom oblique slice"
          : "Custom slice",
      sliceParams: options.sliceParams,
    });
  }

  function handleCreateSliceFromUi() {
    if (!sliceVolumeLayerId) return;

    let normalizedParams: SliceLayerParams;

    if (sliceParamsDraft.mode === "oblique") {
      const nx = Number(sliceParamsDraft.normal.x);
      const ny = Number(sliceParamsDraft.normal.y);
      const nz = Number(sliceParamsDraft.normal.z);

      const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
      if (!Number.isFinite(len) || len < 1e-8) return;

      normalizedParams = {
        mode: "oblique",
        normal: {
          x: nx / len,
          y: ny / len,
          z: nz / len,
        },
        offset: Number.isFinite(sliceParamsDraft.offset ?? 0)
          ? sliceParamsDraft.offset ?? 0
          : 0,
        width: Math.max(8, Math.round(sliceParamsDraft.width ?? 256)),
        height: Math.max(8, Math.round(sliceParamsDraft.height ?? 256)),
        opacity: Math.max(0, Math.min(1, sliceParamsDraft.opacity ?? 0.92)),
      };
    } else {
      normalizedParams = {
        mode: "axis",
        plane: sliceParamsDraft.plane,
        index: Math.round(sliceParamsDraft.index),
        opacity: Math.max(0, Math.min(1, sliceParamsDraft.opacity ?? 0.92)),
      };
    }

    handleAddCustomSlice({
      volumeLayerId: sliceVolumeLayerId,
      sliceParams: normalizedParams,
      name: sliceName.trim() || undefined,
    });

    setSliceName("");
  }

  function handleClearPersistedViewerState() {
    clearPersistedViewerState();
    clearPersistedViewerLibrary();
    setViewerLibrary([]);
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

  function handleRequestResetOrbitCenter() {
    setActiveTool("mouse");
    setOrbitResetRequestKey((prev) => prev + 1);
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
          appPreferences.cursorStyle === "crosshair"
            ? "crosshair"
            : appPreferences.cursorStyle === "high-contrast"
            ? "cell"
            : "default",
      }}
    >
      <style>{getThemeRootCss(appPreferences.theme)}</style>

      <WebGLCanvas
        activeTool={activeTool}
        layerTree={layerTree}
        selectedNodeId={selectedNodeId}
        cameraState={cameraState}
        cameraSyncKey={cameraSyncKey}
        onCameraStateChange={setCameraState}
        backgroundColor={appPreferences.sceneBackground}
        annotationShape={annotationDraft.shape}
        annotationColor={annotationDraft.color}
        annotationOpacity={annotationDraft.opacity}
        annotationSize={annotationDraft.size}
        annotationDepth={annotationDraft.depth}
        annotationEraseMode={annotationDraft.eraseMode}
        onCreatePointAnnotation={handleCreatePointAnnotationAtHit}
        onCreateLineAnnotation={handleCreateLineAnnotation}
        onCreateShapeAnnotation={handleCreateShapeAnnotation}
        onCommitFreehandStroke={handleCommitFreehandStroke}
        onEraseFreehand={handleEraseFreehandStroke}
        onSelectedLayerRuntimeInfoChange={setSelectedLayerRuntimeInfo}
        onCanvasElementChange={(canvas) => {
          viewerCanvasElementRef.current = canvas;
        }}
        onLocalSceneLoadStateChange={setLocalSceneLoadState}
        localSceneLoadingActive={localSceneLoadState.active}
        orbitResetRequestKey={orbitResetRequestKey}
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
      `}</style>

      {localSceneLoadState.active && !dismissLocalSceneLoadNotice ? (
        <div
          data-theme-surface="panel"
          style={{
            position: "absolute",
            right: 18,
            bottom: 104,
            zIndex: 18,
            width: "min(320px, calc(100vw - 40px))",
            borderRadius: 16,
            border: "1px solid rgba(255,255,255,0.10)",
            boxShadow: "0 12px 28px rgba(0,0,0,0.30)",
            padding: "12px 14px",
            display: "grid",
            gap: 8,
            animation: "local-load-panel-in 180ms ease",
            fontFamily: "sans-serif",
          }}
        >
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
            <div style={{ minWidth: 0 }}>
              <div data-theme-text="strong" style={{ fontSize: 13, fontWeight: 700, fontFamily: "sans-serif" }}>Loading local data…</div>
              <div data-theme-text="muted" style={{ fontSize: 12, opacity: 0.74, lineHeight: 1.45, marginTop: 4, fontFamily: "sans-serif" }}>
                Preparing local data in the background. You can keep using the viewer while it loads.
              </div>
            </div>
            <button
              type="button"
              onClick={() => setDismissLocalSceneLoadNotice(true)}
              aria-label="Dismiss loading notification"
              title="Dismiss"
              style={{
                width: 28,
                height: 28,
                flex: "0 0 auto",
                borderRadius: 10,
                border: "1px solid rgba(255,255,255,0.10)",
                background: "rgba(255,255,255,0.04)",
                color: "inherit",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                lineHeight: 1,
              }}
            >
              ×
            </button>
          </div>
          <div
            data-theme-surface="soft"
            style={{
              height: 7,
              borderRadius: 999,
              border: "1px solid rgba(255,255,255,0.08)",
              overflow: "hidden",
              position: "relative",
            }}
          >
            <div
              style={{
                position: "absolute",
                inset: 0,
                width: "34%",
                borderRadius: 999,
                background: "linear-gradient(90deg, rgba(120,190,255,0.08), rgba(120,190,255,0.92), rgba(120,190,255,0.08))",
                animation: "local-load-indeterminate 1.15s linear infinite",
              }}
            />
          </div>
          <div data-theme-text="muted" style={{ fontSize: 11, opacity: 0.7 }}>
            {localSceneLoadState.pending} pending item{localSceneLoadState.pending > 1 ? "s" : ""}
          </div>
        </div>
      ) : null}

      {canShowGlobalDropOverlay ? (
        <div
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 26,
            background: "rgba(8,12,16,0.54)",
            backdropFilter: "blur(4px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            pointerEvents: "none",
            padding: 24,
            boxSizing: "border-box",
          }}
        >
          <div
            data-theme-surface="panel"
            style={{
              width: "min(500px, calc(100vw - 48px))",
              borderRadius: 24,
              border: "1px solid rgba(255,255,255,0.16)",
              background: "rgba(12,14,18,0.92)",
              boxShadow: "0 24px 60px rgba(0,0,0,0.38)",
              padding: "28px 30px",
              display: "grid",
              gap: 10,
              textAlign: "center",
              fontFamily: "sans-serif",
            }}
          >
            <div
              style={{
                width: 64,
                height: 64,
                margin: "0 auto",
                borderRadius: 18,
                border: "1px solid rgba(255,255,255,0.18)",
                background: "rgba(255,255,255,0.06)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "rgba(255,255,255,0.92)",
                fontSize: 28,
                fontWeight: 700,
              }}
            >
              +
            </div>
            <div data-theme-text="strong" style={{ fontSize: 22, fontWeight: 800 }}>
              Drop files to add them
            </div>
            <div data-theme-text="muted" style={{ fontSize: 13, opacity: 0.76, lineHeight: 1.5 }}>
              Release anywhere in the viewer.
            </div>
          </div>
        </div>
      ) : null}

      <div data-viewer-app-menu="true" style={{ position: "absolute", top: 16, left: 16, zIndex: 26, pointerEvents: "none" }}>
        <div style={{ position: "relative", pointerEvents: "auto", fontFamily: "sans-serif" }}>
          <button
            type="button"
            onClick={() => setIsAppMenuOpen((prev) => !prev)}
            style={{
              height: 46,
              padding: "0 14px",
              borderRadius: 16,
              border: "1px solid rgba(255,255,255,0.10)",
              background: "rgba(12,14,18,0.82)",
              color: "white",
              boxShadow: "0 12px 30px rgba(0,0,0,0.32)",
              backdropFilter: "blur(12px)",
              display: "flex",
              alignItems: "center",
              gap: 10,
              cursor: "pointer",
              fontWeight: 700,
            }}
          >
            <span style={{ display: "flex", alignItems: "center", justifyContent: "center" }}><MenuHamburgerIcon /></span>
            <span>Viewer</span>
          </button>

          <div
            data-theme-surface="panel"
            style={{
              marginTop: 10,
              width: 292,
              borderRadius: 18,
              border: "1px solid rgba(255,255,255,0.10)",
              boxShadow: "0 16px 40px rgba(0,0,0,0.40)",
              backdropFilter: "blur(14px)",
              padding: 12,
              display: "grid",
              gap: 12,
              opacity: isAppMenuOpen ? 1 : 0,
              transform: isAppMenuOpen ? "translateY(0) scale(1)" : "translateY(-8px) scale(0.985)",
              transformOrigin: "top left",
              visibility: isAppMenuOpen ? "visible" : "hidden",
              pointerEvents: isAppMenuOpen ? "auto" : "none",
              transition: "opacity 180ms ease, transform 220ms ease, visibility 180ms ease",
            }}
          >
            <div style={{ display: "grid", gap: 6 }}>
              <div data-theme-text="muted" style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.45, textTransform: "uppercase" }}>Viewer</div>
              <div style={{ display: "grid", gap: 4 }}>
                <button
                  type="button"
                  onClick={handleCreateNewViewer}
                  style={{ height: 36, padding: "0 10px", borderRadius: 10, border: "1px solid transparent", background: "transparent", color: "inherit", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "flex-start", gap: 10, textAlign: "left", transition: "background 160ms ease, border-color 160ms ease" }}
                  onMouseEnter={(event) => { event.currentTarget.style.background = "rgba(255,255,255,0.06)"; event.currentTarget.style.borderColor = "rgba(255,255,255,0.08)"; }}
                  onMouseLeave={(event) => { event.currentTarget.style.background = "transparent"; event.currentTarget.style.borderColor = "transparent"; }}
                >
                  <NewViewerIcon />
                  <span>New empty viewer</span>
                </button>
                <button
                  type="button"
                  onClick={() => { setLibraryError(null); setLibraryMessage(null); setSaveNoticeOpen(false); setActiveTool("library"); setIsAppMenuOpen(false); }}
                  style={{ height: 36, padding: "0 10px", borderRadius: 10, border: "1px solid transparent", background: "transparent", color: "inherit", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "flex-start", gap: 10, textAlign: "left", transition: "background 160ms ease, border-color 160ms ease" }}
                  onMouseEnter={(event) => { event.currentTarget.style.background = "rgba(255,255,255,0.06)"; event.currentTarget.style.borderColor = "rgba(255,255,255,0.08)"; }}
                  onMouseLeave={(event) => { event.currentTarget.style.background = "transparent"; event.currentTarget.style.borderColor = "transparent"; }}
                >
                  <LibraryMenuIcon />
                  <span>Open library</span>
                </button>
                <button
                  type="button"
                  onClick={() => { handleSaveCurrentViewerToLibrary(); setIsAppMenuOpen(false); }}
                  style={{ height: 36, padding: "0 10px", borderRadius: 10, border: "1px solid transparent", background: "transparent", color: "inherit", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "flex-start", gap: 10, textAlign: "left", transition: "background 160ms ease, border-color 160ms ease" }}
                  onMouseEnter={(event) => { event.currentTarget.style.background = "rgba(255,255,255,0.06)"; event.currentTarget.style.borderColor = "rgba(255,255,255,0.08)"; }}
                  onMouseLeave={(event) => { event.currentTarget.style.background = "transparent"; event.currentTarget.style.borderColor = "transparent"; }}
                >
                  <SaveMenuIcon />
                  <span>Save viewer</span>
                </button>
              </div>
            </div>

            <div style={{ display: "grid", gap: 6 }}>
              <div data-theme-text="muted" style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.45, textTransform: "uppercase" }}>Data</div>
              <div style={{ display: "grid", gap: 4 }}>
                <button
                  type="button"
                  onClick={() => { setIsImportPanelOpen(true); setIsAppMenuOpen(false); }}
                  style={{ height: 36, padding: "0 10px", borderRadius: 10, border: "1px solid transparent", background: "transparent", color: "inherit", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "flex-start", gap: 10, textAlign: "left", transition: "background 160ms ease, border-color 160ms ease" }}
                  onMouseEnter={(event) => { event.currentTarget.style.background = "rgba(255,255,255,0.06)"; event.currentTarget.style.borderColor = "rgba(255,255,255,0.08)"; }}
                  onMouseLeave={(event) => { event.currentTarget.style.background = "transparent"; event.currentTarget.style.borderColor = "transparent"; }}
                >
                  <ImportDataMenuIcon />
                  <span>Import data</span>
                </button>
                <button
                  type="button"
                  onClick={() => { setIsLocalDatasetManagerOpen(true); setIsAppMenuOpen(false); }}
                  style={{ height: 36, padding: "0 10px", borderRadius: 10, border: "1px solid transparent", background: "transparent", color: "inherit", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "flex-start", gap: 10, textAlign: "left", transition: "background 160ms ease, border-color 160ms ease" }}
                  onMouseEnter={(event) => { event.currentTarget.style.background = "rgba(255,255,255,0.06)"; event.currentTarget.style.borderColor = "rgba(255,255,255,0.08)"; }}
                  onMouseLeave={(event) => { event.currentTarget.style.background = "transparent"; event.currentTarget.style.borderColor = "transparent"; }}
                >
                  <ManageDataMenuIcon />
                  <span>Manage local data</span>
                </button>
              </div>
            </div>

            <div style={{ display: "grid", gap: 6 }}>
              <div data-theme-text="muted" style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.45, textTransform: "uppercase" }}>Share</div>
              <div style={{ display: "grid", gap: 4 }}>
                <button
                  type="button"
                  onClick={() => { openExportStateModal(); setIsAppMenuOpen(false); }}
                  style={{ height: 36, padding: "0 10px", borderRadius: 10, border: "1px solid transparent", background: "transparent", color: "inherit", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "flex-start", gap: 10, textAlign: "left", transition: "background 160ms ease, border-color 160ms ease" }}
                  onMouseEnter={(event) => { event.currentTarget.style.background = "rgba(255,255,255,0.06)"; event.currentTarget.style.borderColor = "rgba(255,255,255,0.08)"; }}
                  onMouseLeave={(event) => { event.currentTarget.style.background = "transparent"; event.currentTarget.style.borderColor = "transparent"; }}
                >
                  <ShareMenuIcon />
                  <span>Export viewer state</span>
                </button>
                <button
                  type="button"
                  onClick={() => { openImportStateModal(); setIsAppMenuOpen(false); }}
                  style={{ height: 36, padding: "0 10px", borderRadius: 10, border: "1px solid transparent", background: "transparent", color: "inherit", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "flex-start", gap: 10, textAlign: "left", transition: "background 160ms ease, border-color 160ms ease" }}
                  onMouseEnter={(event) => { event.currentTarget.style.background = "rgba(255,255,255,0.06)"; event.currentTarget.style.borderColor = "rgba(255,255,255,0.08)"; }}
                  onMouseLeave={(event) => { event.currentTarget.style.background = "transparent"; event.currentTarget.style.borderColor = "transparent"; }}
                >
                  <ImportStateMenuIcon />
                  <span>Import viewer state</span>
                </button>
                <button
                  type="button"
                  onClick={openShareDialog}
                  style={{ height: 36, padding: "0 10px", borderRadius: 10, border: "1px solid transparent", background: "transparent", color: "inherit", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "flex-start", gap: 10, textAlign: "left", transition: "background 160ms ease, border-color 160ms ease" }}
                  onMouseEnter={(event) => { event.currentTarget.style.background = "rgba(255,255,255,0.06)"; event.currentTarget.style.borderColor = "rgba(255,255,255,0.08)"; }}
                  onMouseLeave={(event) => { event.currentTarget.style.background = "transparent"; event.currentTarget.style.borderColor = "transparent"; }}
                >
                  <ShareMenuIcon />
                  <span>Copy share link</span>
                </button>
              </div>
            </div>

            <div style={{ display: "grid", gap: 6 }}>
              <div data-theme-text="muted" style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.45, textTransform: "uppercase" }}>App</div>
              <div style={{ display: "grid", gap: 4 }}>
                <button
                  type="button"
                  onClick={() => { setIsUserProfilePanelOpen(true); setIsAppMenuOpen(false); }}
                  style={{ height: 36, padding: "0 10px", borderRadius: 10, border: "1px solid transparent", background: "transparent", color: "inherit", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "flex-start", gap: 10, textAlign: "left", transition: "background 160ms ease, border-color 160ms ease" }}
                  onMouseEnter={(event) => { event.currentTarget.style.background = "rgba(255,255,255,0.06)"; event.currentTarget.style.borderColor = "rgba(255,255,255,0.08)"; }}
                  onMouseLeave={(event) => { event.currentTarget.style.background = "transparent"; event.currentTarget.style.borderColor = "transparent"; }}
                >
                  <ProfileMenuIcon />
                  <span>Profile & preferences</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {isShareDialogOpen ? (
        <div
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 45,
            background: "rgba(4,6,10,0.48)",
            backdropFilter: "blur(4px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 24,
            boxSizing: "border-box",
          }}
          onClick={() => setIsShareDialogOpen(false)}
        >
          <div
            onClick={(event) => event.stopPropagation()}
            data-theme-surface="panel"
            style={{
              width: "min(720px, 100%)",
              maxHeight: "min(82vh, 820px)",
              overflow: "hidden",
              borderRadius: 18,
              border: "1px solid rgba(255,255,255,0.10)",
              boxShadow: "0 18px 48px rgba(0,0,0,0.42)",
              padding: 18,
              color: "inherit",
              position: "relative",
              display: "grid",
              gap: 14,
            }}
          >
            <button
              type="button"
              onClick={() => setIsShareDialogOpen(false)}
              aria-label="Close share dialog"
              title="Close"
              style={{
                position: "absolute",
                top: 14,
                right: 14,
                width: 34,
                height: 34,
                borderRadius: 10,
                border: "1px solid rgba(255,255,255,0.10)",
                background: "rgba(255,255,255,0.05)",
                color: "inherit",
                cursor: "pointer",
                zIndex: 2,
              }}
            >
              ×
            </button>

            <div data-slice-tool="true" style={{ fontFamily: "sans-serif", color: "inherit", display: "grid", gap: 14 }}>
              <div style={{ paddingRight: 48 }}>
                <div style={{ fontSize: 18, fontWeight: 700 }}>Share Viewer Link</div>
                <div data-theme-text="muted" style={{ fontSize: 12, marginTop: 5, lineHeight: 1.45 }}>
                  Copy a URL containing the current viewer state. Anyone with the link can open the same shared view.
                </div>
              </div>

              {localOnlyLayerNames.length > 0 ? (
                <div
                  style={{
                    borderRadius: 12,
                    border: "1px solid rgba(255,180,120,0.35)",
                    background: "rgba(255,180,120,0.10)",
                    padding: 12,
                    fontSize: 12,
                    lineHeight: 1.5,
                  }}
                >
                  <div style={{ fontWeight: 700, marginBottom: 6 }}>Some layers are local to this browser</div>
                  <div>
                    The link will still work, but these local layers will not appear on other devices or browsers.
                  </div>
                  <div style={{ marginTop: 8 }}><strong>Unavailable in shared view:</strong></div>
                  <div style={{ marginTop: 6, display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {localOnlyLayerNames.map((layerName) => (
                      <span
                        key={layerName}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          minHeight: 24,
                          padding: "0 8px",
                          borderRadius: 999,
                          border: "1px solid rgba(255,200,150,0.30)",
                          background: "rgba(255,255,255,0.06)",
                          fontSize: 11,
                          fontWeight: 600,
                        }}
                      >
                        {layerName}
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}

              <textarea
              className="layer-panel-scroll"
              value={shareUrlDraft}
              readOnly
              spellCheck={false}
              style={{
                width: "100%",
                minHeight: 140,
                maxHeight: "min(36vh, 320px)",
                resize: "vertical",
                overflowY: "auto",
                borderRadius: 14,
                border: "1px solid rgba(255,255,255,0.12)",
                background: "rgba(255,255,255,0.05)",
                color: "inherit",
                padding: 14,
                boxSizing: "border-box",
                fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
                fontSize: 12,
                lineHeight: 1.52,
                outline: "none",
              }}
            />

            {stateError ? (
              <div style={{ fontSize: 12, color: "#ffb4b4", lineHeight: 1.4 }}>{stateError}</div>
            ) : null}

            {!stateError && stateShareMessage ? (
              <div style={{ fontSize: 12, color: "rgba(170,230,190,0.95)", lineHeight: 1.4 }}>{stateShareMessage}</div>
            ) : null}

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                <div data-theme-text="muted" style={{ fontSize: 12 }}>
                  The link uses the current website URL with an encoded viewer state in the hash.
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button type="button" onClick={() => setIsShareDialogOpen(false)} style={secondaryButtonStyle}>Close</button>
                  <button type="button" onClick={() => void handleShareViewerState()} style={primaryButtonStyle}>Copy share link</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {isStateModalOpen ? (
        <div
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 44,
            background: "rgba(4,6,10,0.48)",
            backdropFilter: "blur(4px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 24,
            boxSizing: "border-box",
          }}
          onClick={() => setIsStateDialogOpen(false)}
        >
          <div
            onClick={(event) => event.stopPropagation()}
            data-theme-surface="panel"
            style={{
              width: "min(820px, 100%)",
              maxHeight: "min(86vh, 960px)",
              overflow: "hidden",
              borderRadius: 18,
              border: "1px solid rgba(255,255,255,0.10)",
              boxShadow: "0 18px 48px rgba(0,0,0,0.42)",
              padding: 18,
              color: "inherit",
              position: "relative",
            }}
          >
            <button
              type="button"
              onClick={() => setIsStateDialogOpen(false)}
              aria-label="Close viewer state dialog"
              title="Close"
              style={{
                position: "absolute",
                top: 14,
                right: 14,
                width: 34,
                height: 34,
                borderRadius: 10,
                border: "1px solid rgba(255,255,255,0.10)",
                background: "rgba(255,255,255,0.05)",
                color: "inherit",
                cursor: "pointer",
                zIndex: 2,
              }}
            >
              ×
            </button>
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
          </div>
        </div>
      ) : null}

      <LayerPanel
        layerTree={layerTree}
        selectedNodeId={selectedNodeId}
        groupOptions={groupOptions}
        detailsContent={inspectorPanelContent}
        isCollapsed={isLayerPanelCollapsed}
        onSetCollapsed={setIsLayerPanelCollapsed}
        onToggleVisible={handleToggleVisible}
        onSelectNode={handleSelectNode}
        onToggleGroupExpanded={handleToggleGroupExpanded}
        onSetGroupExpanded={handleSetGroupExpanded}
        onAddGroup={handleAddGroup}
        onAddLayer={handleOpenAddLayer}
        onRenameNode={handleRenameNode}
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
        savedViewerStateExists={hasPersistedViewerState || viewerLibrary.length > 0}
        savedHistoryCount={pastStatesRef.current.length + futureStatesRef.current.length}
        dataRevision={profileDataRevision}
      />

      <ViewerLibraryPanel
        open={activeTool === "library"}
        onClose={() => setActiveTool("mouse")}
        entries={libraryEntries}
        errorMessage={libraryError}
        successMessage={libraryMessage}
        onOpenViewer={handleOpenSavedViewer}
        onDeleteViewer={handleDeleteSavedViewer}
        onRenameViewer={handleRenameSavedViewer}
      />

      {isClearHistoryConfirmOpen ? (
        <div
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 45,
            background: "rgba(4,6,10,0.48)",
            backdropFilter: "blur(4px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 24,
            boxSizing: "border-box",
          }}
          onClick={() => setIsClearHistoryConfirmOpen(false)}
        >
          <div
            onClick={(event) => event.stopPropagation()}
            data-theme-surface="panel"
            style={{
              width: "min(420px, 100%)",
              borderRadius: 18,
              background: "rgba(12,14,18,0.96)",
              border: "1px solid rgba(255,255,255,0.10)",
              boxShadow: "0 18px 48px rgba(0,0,0,0.42)",
              padding: 18,
              color: "white",
            }}
          >
            <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 10 }}>
              Delete history?
            </div>
            <div
              style={{
                fontSize: 13,
                lineHeight: 1.55,
                opacity: 0.78,
              }}
            >
              Do you really want to delete the entire history? This operation cannot be undone.
            </div>

            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                gap: 10,
                marginTop: 18,
              }}
            >
              <button
                type="button"
                onClick={() => setIsClearHistoryConfirmOpen(false)}
                style={secondaryButtonStyle}
              >
                No
              </button>
              <button
                type="button"
                onClick={handleConfirmClearHistory}
                style={{
                  ...primaryButtonStyle,
                  border: "1px solid rgba(255,140,140,0.34)",
                  background: "rgba(200,70,70,0.18)",
                }}
              >
                Yes, delete history
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <div
        style={{
          position: "fixed",
          right: 12,
          bottom: 8,
          zIndex: 18,
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: "3px 7px",
          borderRadius: 8,
          border:
            appPreferences.theme === "light"
              ? "1px solid rgba(24,33,43,0.08)"
              : "1px solid rgba(255,255,255,0.06)",
          background:
            appPreferences.theme === "light"
              ? "rgba(255,255,255,0.52)"
              : appPreferences.theme === "gray"
              ? "rgba(46,52,60,0.48)"
              : "rgba(12,14,18,0.42)",
          color:
            appPreferences.theme === "light"
              ? "rgba(24,33,43,0.58)"
              : "rgba(255,255,255,0.5)",
          boxShadow: "0 2px 8px rgba(0,0,0,0.12)",
          backdropFilter: "blur(6px)",
          fontFamily: "sans-serif",
          fontSize: 10,
          lineHeight: 1,
          letterSpacing: 0.2,
          pointerEvents: "auto",
          userSelect: "none",
        }}
      >
        <span title={`Viewer version ${APP_VERSION}`}>v{APP_VERSION}</span>
        <span style={{ opacity: 0.22 }}>•</span>
        {APP_COMMIT_URL ? (
          <a
            href={APP_COMMIT_URL}
            target="_blank"
            rel="noreferrer"
            title={`Open deployed commit ${APP_COMMIT_SHA}`}
            style={{
              color:
                appPreferences.theme === "light"
                  ? "rgba(24,33,43,0.56)"
                  : "rgba(255,255,255,0.46)",
              textDecoration: "none",
              fontWeight: 500,
            }}
          >
            {APP_COMMIT_SHORT}
          </a>
        ) : (
          <span title="Git commit unavailable in local development" style={{ opacity: 0.5 }}>
            {APP_COMMIT_SHORT}
          </span>
        )}
      </div>

      <BottomToolbar
        activeTool={activeTool}
        onToolChange={handleToolChange}
        cameraMode={cameraState.mode}
        onCameraModeChange={handleCameraModeChange}
        onResetOrbitCenter={handleRequestResetOrbitCenter}
        onSaveCurrentViewer={handleSaveCurrentViewerToLibrary}
        saveNoticeOpen={saveNoticeOpen}
        onRequestCloseSaveNotice={handleCloseSaveNotice}
        saveNoticeContent={
          <div style={{ display: "grid", gap: 10, fontFamily: "sans-serif" }}>
            <div style={{ fontSize: 13, fontWeight: 700 }}>Viewer saved</div>
            <div data-theme-text="muted" style={{ fontSize: 12, opacity: 0.74, lineHeight: 1.45 }}>
              {saveNoticeMessage ?? "The current viewer has been saved in this browser."}
            </div>
            <button
              type="button"
              onClick={handleOpenLibraryFromSaveNotice}
              style={{
                height: 34,
                padding: "0 12px",
                borderRadius: 10,
                border: "1px solid rgba(160,220,255,0.35)",
                background: "rgba(120,190,255,0.18)",
                color: "white",
                cursor: "pointer",
                fontWeight: 600,
                justifySelf: "start",
              }}
            >
              Open library
            </button>
          </div>
        }
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
        slicePopoverOpen={activeTool === "slice"}
        onRequestCloseSlicePopover={() => setActiveTool("mouse")}
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
        slicePopoverContent={
          omeLayers.length > 0 ? (
            <div data-slice-tool="true" style={{ fontFamily: "sans-serif" }}>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "92px 1fr",
                  gap: 8,
                  alignItems: "center",
                  marginBottom: 12,
                }}
              >
                <div data-theme-text="muted" style={{ fontSize: 12, opacity: 0.8 }}>Volume</div>
                <select
                  value={sliceVolumeLayerId}
                  onChange={(e) => setSliceVolumeLayerId(e.target.value)}
                  style={{
                    height: 32,
                    borderRadius: 10,
                    border: "1px solid rgba(255,255,255,0.12)",
                    background: "rgba(255,255,255,0.06)",
                    color: "white",
                    padding: "0 8px",
                  }}
                >
                  {omeLayers.map((layer) => (
                    <option key={layer.id} value={layer.id} style={{ color: "inherit" }}>
                      {layer.name}
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ marginBottom: 12 }}>
                <SliceToolPopover value={sliceParamsDraft} onChange={setSliceParamsDraft} />
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "92px 1fr",
                  gap: 8,
                  alignItems: "center",
                  marginBottom: 12,
                }}
              >
                <div data-theme-text="muted" style={{ fontSize: 12, opacity: 0.8 }}>Name</div>
                <input
                  value={sliceName}
                  onChange={(e) => setSliceName(e.target.value)}
                  placeholder="Optional custom name"
                  style={{
                    height: 32,
                    borderRadius: 10,
                    border: "1px solid rgba(255,255,255,0.12)",
                    background: "rgba(255,255,255,0.06)",
                    color: "white",
                    padding: "0 10px",
                    outline: "none",
                  }}
                />
              </div>

              <div
                style={{
                  display: "flex",
                  justifyContent: "flex-end",
                  alignItems: "center",
                  marginTop: 12,
                  gap: 10,
                }}
              >
                <button
                  type="button"
                  onClick={handleCreateSliceFromUi}
                  style={{
                    height: 34,
                    padding: "0 12px",
                    borderRadius: 10,
                    border: "1px solid rgba(255,255,255,0.10)",
                    background: "rgba(120,190,255,0.18)",
                    color: "white",
                    cursor: "pointer",
                    fontWeight: 600,
                    whiteSpace: "nowrap",
                  }}
                >
                  Add Slice Layer
                </button>
              </div>
            </div>
          ) : (
            <div
              style={{
                fontFamily: "sans-serif",
                fontSize: 13,
                opacity: 0.8,
                lineHeight: 1.5,
              }}
            >
              Import an OME-Zarr volume first to create slice layers.
            </div>
          )
        }
      />
    </div>
  );
}
