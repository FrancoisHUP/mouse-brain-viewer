import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import WebGLCanvas from "./WebGLCanvas";
import BottomToolbar, { type HistoryMenuItem, type ToolId } from "./BottomToolbar";
import LayerPanel from "./LayerPanel";
import ImportDataPanel from "./ImportDataPanel";
import SliceToolPopover from "./SliceToolPopover";
import {
  ALLEN_VIEWER_EMBED_NAMESPACE,
  type ViewerEmbedMessage,
  type ViewerEmbedRequest,
  type ViewerEmbedResponse,
} from "./viewerEmbedApi";
import {
  DEFAULT_CAMERA_STATE,
  createViewerState,
  isSerializableLayerTree,
  mergeViewerState,
  parseViewerState,
  type SerializableCameraState,
  type ViewerStatePatchV1,
  type ViewerStateV1,
} from "./viewerState";
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
  LayerTreeNode,
  RemoteContentKind,
  RemoteDataFormat,
  RemoteOmeResolution,
  RemoteRenderMode,
  SliceLayerParams,
  SlicePlane,
} from "./layerTypes";
import {
  collectAllLayerItems,
  collectGroups,
  deleteNodeById,
  findNodeById,
  getFirstLayerId,
  insertIntoGroup,
  isGroupNode,
  isRemoteOmeLayer,
  moveNodeBeforeNode,
  moveNodeToGroup,
  renameNodeById,
  setGroupExpandedById,
  setNodeVisibleState,
  toggleGroupExpandedById,
} from "./layerTypes";

declare global {
  interface Window {
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

const INITIAL_TREE: LayerTreeNode[] = [
  {
    id: "reference-data",
    kind: "group",
    name: "Reference Data",
    visible: true,
    expanded: true,
    children: [
      {
        id: "base-square",
        kind: "layer",
        name: "Base Slice Plane",
        type: "primitive",
        visible: true,
        source: "built-in",
        sourceKind: "built-in",
      },
    ],
  },
];

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

export default function App({ startupSlices = [] }: AppProps) {
  const [activeTool, setActiveTool] = useState<ToolId>("mouse");
  const [isImportPanelOpen, setIsImportPanelOpen] = useState(false);
  const [layerTree, setLayerTree] = useState<LayerTreeNode[]>(INITIAL_TREE);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(
    getFirstLayerId(INITIAL_TREE)
  );
  const [isLayerPanelCollapsed, setIsLayerPanelCollapsed] = useState(false);
  const [cameraState, setCameraState] = useState<SerializableCameraState>(
    DEFAULT_CAMERA_STATE
  );
  const [isStateModalOpen, setIsStateModalOpen] = useState(false);
  const [stateModalMode, setStateModalMode] = useState<"export" | "import">("export");
  const [stateTextDraft, setStateTextDraft] = useState("");
  const [stateError, setStateError] = useState<string | null>(null);
  const [historyRevision, setHistoryRevision] = useState(0);
  const [isClearHistoryConfirmOpen, setIsClearHistoryConfirmOpen] = useState(false);

  const initializedStartupSlicesRef = useRef(false);
  const initializedLocationStateRef = useRef(false);
  const hasHydratedHistoryRef = useRef(false);
  const autoCommitTimeoutRef = useRef<number | null>(null);
  const suppressNextAutoCommitRef = useRef(false);
  const pastStatesRef = useRef<ViewerHistoryEntry[]>([]);
  const futureStatesRef = useRef<ViewerHistoryEntry[]>([]);
  const lastCommittedStateRef = useRef<ViewerStateV1 | null>(null);
  const lastCommittedHashRef = useRef<string>("");

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
      cameraState,
    ]
  );

  const currentViewerHash = useMemo(
    () => hashViewerStateForHistory(currentViewerState),
    [currentViewerState]
  );

  const canUndo = pastStatesRef.current.length > 0;
  const canRedo = futureStatesRef.current.length > 0;
  const canClearHistory = canUndo || canRedo;

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

  function applyViewerState(nextState: ViewerStateV1, options?: { suppressAutoCommit?: boolean }) {
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
    setCameraState(nextState.camera);
    setStateError(null);
    return nextState;
  }

  function applyHistoricalViewerState(nextState: ViewerStateV1) {
    const preservedCameraState = currentViewerState.camera;
    return applyViewerState(
      {
        ...nextState,
        camera: preservedCameraState,
      },
      { suppressAutoCommit: true }
    );
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
    if (stateFromLocation) {
      lastCommittedStateRef.current = stateFromLocation;
      lastCommittedHashRef.current = hashViewerStateForHistory(stateFromLocation);
      applyViewerState(stateFromLocation, { suppressAutoCommit: true });
      pastStatesRef.current = [];
      futureStatesRef.current = [];
      bumpHistoryRevision();
      persistHistorySnapshot(stateFromLocation);
      return;
    }

    const persistedHistory = loadPersistedViewerHistory();
    if (persistedHistory) {
      pastStatesRef.current = persistedHistory.past;
      futureStatesRef.current = persistedHistory.future;
      lastCommittedStateRef.current = persistedHistory.present.state;
      lastCommittedHashRef.current = hashViewerStateForHistory(persistedHistory.present.state);
      applyViewerState(persistedHistory.present.state, { suppressAutoCommit: true });
      bumpHistoryRevision();
      return;
    }

    lastCommittedStateRef.current = currentViewerState;
    lastCommittedHashRef.current = currentViewerHash;
    persistHistorySnapshot(currentViewerState);
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

  function openExportStateModal() {
    if (!isSerializableLayerTree(layerTree)) {
      setStateError(
        "This viewer contains uploaded file layers. Undo/redo still works in memory, but browser persistence and copy-paste export support only serializable layers like remote volumes, slices, and annotations."
      );
      setStateModalMode("export");
      setStateTextDraft("");
      setIsStateModalOpen(true);
      return;
    }

    setStateError(null);
    setStateModalMode("export");
    setStateTextDraft(JSON.stringify(currentViewerState, null, 2));
    setIsStateModalOpen(true);
  }

  function openImportStateModal() {
    setStateError(null);
    setStateModalMode("import");
    setStateTextDraft("");
    setIsStateModalOpen(true);
  }

  function closeDialogs() {
    setIsImportPanelOpen(false);
    setIsStateModalOpen(false);
    setIsClearHistoryConfirmOpen(false);
    setActiveTool((prev) => (prev === "slice" ? "mouse" : prev));
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
      setIsStateModalOpen(false);
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

  function handleToolChange(tool: ToolId) {
    if (tool === "data") {
      setIsImportPanelOpen(true);
      return;
    }

    if (tool === "export") {
      openExportStateModal();
      return;
    }

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

  function handleAddFiles(files: FileList | null) {
    if (!files || files.length === 0) return;

    setLayerTree((prev) => {
      let next = prev;

      for (const file of Array.from(files)) {
        const node: LayerTreeNode = {
          id: createId(),
          kind: "layer",
          name: file.name,
          type: "file",
          visible: true,
          source: file,
          sourceKind: "custom-upload",
          mimeType: file.type || undefined,
          description: "User uploaded data",
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

  function handleAddDrawingLayer(name?: string) {
    addNodeAtBestLocation({
      id: createId(),
      kind: "layer",
      name: name?.trim() || "Drawing Layer",
      type: "annotation",
      visible: true,
      source: "drawing-layer",
      sourceKind: "drawing",
      description: "User-created annotation layer",
    });

    setIsImportPanelOpen(false);
  }

  function handleRenameNode(nodeId: string, newName: string) {
    const trimmed = newName.trim();
    if (!trimmed) return;
    setLayerTree((prev) => renameNodeById(prev, nodeId, trimmed));
  }

  function handleDeleteNode(nodeId: string) {
    setLayerTree((prev) => {
      const next = deleteNodeById(prev, nodeId);

      if (selectedNodeId === nodeId || (selectedNodeId && !findNodeById(next, selectedNodeId))) {
        setSelectedNodeId(getFirstLayerId(next));
      }

      if (sliceVolumeLayerId === nodeId) {
        const nextOmeLayer = collectAllLayerItems(next).find(isRemoteOmeLayer) ?? null;
        setSliceVolumeLayerId(nextOmeLayer?.id ?? "");
      }

      return next;
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

  return (
    <div
      style={{
        width: "100vw",
        height: "100vh",
        overflow: "hidden",
        margin: 0,
        position: "relative",
        background: "#0b0f14",
      }}
    >
      <WebGLCanvas
        activeTool={activeTool}
        layerTree={layerTree}
        selectedNodeId={selectedNodeId}
        cameraState={cameraState}
        onCameraStateChange={setCameraState}
      />

      <LayerPanel
        layerTree={layerTree}
        selectedNodeId={selectedNodeId}
        groupOptions={groupOptions}
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
        onDropNodeIntoGroup={handleDropNodeIntoGroup}
        onDropNodeToRoot={handleDropNodeToRoot}
        onReorderBefore={handleReorderBefore}
      />

      <ImportDataPanel
        open={isImportPanelOpen}
        onClose={() => setIsImportPanelOpen(false)}
        onAddDrawingLayer={handleAddDrawingLayer}
        onAddExternalSources={handleAddExternalSources}
        onAddFiles={handleAddFiles}
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

      <BottomToolbar
        activeTool={activeTool}
        onToolChange={handleToolChange}
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
        slicePopoverContent={
          omeLayers.length > 0 ? (
            <div style={{ fontFamily: "sans-serif" }}>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "92px 1fr",
                  gap: 8,
                  alignItems: "center",
                  marginBottom: 12,
                }}
              >
                <div style={{ fontSize: 12, opacity: 0.8 }}>Volume</div>
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
                    <option key={layer.id} value={layer.id} style={{ color: "black" }}>
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
                <div style={{ fontSize: 12, opacity: 0.8 }}>Name</div>
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
        statePopoverOpen={isStateModalOpen}
        onRequestCloseStatePopover={() => setIsStateModalOpen(false)}
        statePopoverContent={
          <div style={{ fontFamily: "sans-serif" }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 12,
              }}
            >
              <div>
                <div style={{ fontSize: 15, fontWeight: 700 }}>
                  {stateModalMode === "export" ? "Export Viewer State" : "Import Viewer State"}
                </div>
                <div style={{ fontSize: 12, opacity: 0.7, marginTop: 4 }}>
                  Copy this state to reproduce the current viewer, or paste one to restore it.
                </div>
              </div>

              <div style={{ display: "flex", gap: 8 }}>
                <button type="button" onClick={openExportStateModal} style={secondaryButtonStyle}>
                  Export
                </button>
                <button type="button" onClick={openImportStateModal} style={secondaryButtonStyle}>
                  Import
                </button>
              </div>
            </div>

            <textarea
              value={stateTextDraft}
              onChange={(e) => setStateTextDraft(e.target.value)}
              readOnly={stateModalMode === "export"}
              placeholder={stateModalMode === "import" ? "Paste a viewer state JSON here..." : ""}
              spellCheck={false}
              style={{
                width: "100%",
                minHeight: 260,
                resize: "vertical",
                borderRadius: 12,
                border: "1px solid rgba(255,255,255,0.12)",
                background: "rgba(255,255,255,0.05)",
                color: "white",
                padding: 12,
                boxSizing: "border-box",
                fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
                fontSize: 12,
                lineHeight: 1.45,
                outline: "none",
              }}
            />

            {stateError && (
              <div
                style={{
                  marginTop: 10,
                  fontSize: 12,
                  color: "#ffb4b4",
                  lineHeight: 1.4,
                }}
              >
                {stateError}
              </div>
            )}

            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginTop: 12,
                gap: 10,
              }}
            >
              <div style={{ fontSize: 12, opacity: 0.62 }}>
                Undo/redo snapshots are saved after actions settle and restored from browser storage.
              </div>

              <div style={{ display: "flex", gap: 8 }}>
                {stateModalMode === "export" && (
                  <button type="button" onClick={handleCopyExportState} style={primaryButtonStyle}>
                    Copy
                  </button>
                )}

                {stateModalMode === "import" && (
                  <button type="button" onClick={handleApplyImportedState} style={primaryButtonStyle}>
                    Load State
                  </button>
                )}
              </div>
            </div>
          </div>
        }
      />
    </div>
  );
}
