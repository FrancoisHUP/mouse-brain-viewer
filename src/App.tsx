import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import WebGLCanvas from "./WebGLCanvas";
import BottomToolbar, { type ToolId } from "./BottomToolbar";
import LayerPanel from "./LayerPanel";
import ImportDataPanel from "./ImportDataPanel";
import SliceToolPopover from "./SliceToolPopover";
import {
  DEFAULT_CAMERA_STATE,
  createViewerState,
  isSerializableLayerTree,
  parseViewerState,
  type SerializableCameraState,
} from "./viewerState";
import type {
  LayerTreeNode,
  RemoteDataFormat,
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

function createId() {
  return Math.random().toString(36).slice(2, 10);
}

type ExternalSourceDraft = {
  id: string;
  name: string;
  url: string;
  icon?: "generic" | "custom";
  renderMode?: RemoteRenderMode;
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
  return url.includes(".ome.zarr") ? "ome-zarr" : "generic";
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

  const initializedStartupSlicesRef = useRef(false);

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

  const omeLayers = useMemo(
    () => allLayers.filter(isRemoteOmeLayer),
    [allLayers]
  );

  const selectedNode = useMemo(
    () => (selectedNodeId ? findNodeById(layerTree, selectedNodeId) : null),
    [layerTree, selectedNodeId]
  );

  useEffect(() => {
    if (selectedNode && isRemoteOmeLayer(selectedNode)) {
      setSliceVolumeLayerId(selectedNode.id);
      return;
    }

    if (!sliceVolumeLayerId && omeLayers.length > 0) {
      setSliceVolumeLayerId(omeLayers[0].id);
    }
  }, [selectedNode, sliceVolumeLayerId, omeLayers]);

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

  function buildCurrentViewerState() {
    return createViewerState({
      activeTool,
      selectedNodeId,
      layerTree,
      sliceVolumeLayerId,
      sliceName,
      sliceParamsDraft,
      layerPanelCollapsed: isLayerPanelCollapsed,
      camera: cameraState,
    });
  }

  function handleOpenExportState() {
    if (!isSerializableLayerTree(layerTree)) {
      setStateError(
        "This viewer contains uploaded file layers. Copy-paste export currently supports only serializable layers like remote volumes, slices, and annotations."
      );
      setStateModalMode("export");
      setStateTextDraft("");
      setIsStateModalOpen(true);
      return;
    }

    const state = buildCurrentViewerState();
    setStateError(null);
    setStateModalMode("export");
    setStateTextDraft(JSON.stringify(state, null, 2));
    setIsStateModalOpen(true);
  }

  function handleOpenImportState() {
    setStateError(null);
    setStateModalMode("import");
    setStateTextDraft("");
    setIsStateModalOpen(true);
  }

  function handleApplyImportedState() {
    try {
      const parsed = parseViewerState(stateTextDraft);

      setActiveTool(parsed.scene.activeTool);
      setSelectedNodeId(parsed.scene.selectedNodeId);
      setLayerTree(parsed.scene.layerTree);
      setSliceVolumeLayerId(parsed.ui.sliceVolumeLayerId ?? "");
      setSliceName(parsed.ui.sliceName ?? "");
      setSliceParamsDraft(parsed.ui.sliceParamsDraft);
      setIsLayerPanelCollapsed(parsed.layout.layerPanelCollapsed);
      setCameraState(parsed.camera);
      setStateError(null);
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
      handleOpenExportState();
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

  function handleAddFromUrl(url: string, name?: string) {
    const trimmed = url.trim();
    if (!trimmed) return;

    const fallbackName = (() => {
      try {
        const parsed = new URL(trimmed);
        const last = parsed.pathname.split("/").filter(Boolean).pop();
        return last || parsed.hostname || "Remote Data";
      } catch {
        return "Remote Data";
      }
    })();

    addNodeAtBestLocation({
      id: createId(),
      kind: "layer",
      name: name?.trim() || fallbackName,
      type: "remote",
      visible: true,
      source: trimmed,
      sourceKind: "external",
      description: "Remote data source",
      remoteFormat: detectRemoteFormat(trimmed),
      renderMode: detectRemoteFormat(trimmed) === "ome-zarr" ? "volume" : "auto",
    });

    setIsImportPanelOpen(false);
  }

  function handleAddFiles(files: FileList | null) {
    if (!files || files.length === 0) return;

    setLayerTree((prev) => {
      let next = prev;
      let lastAddedId: string | null = null;

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

        lastAddedId = node.id;
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
      let lastAddedId: string | null = null;

      for (const item of sources) {
        const trimmedUrl = item.url.trim();
        const node: LayerTreeNode = {
          id: createId(),
          kind: "layer",
          name: item.name.trim() || "Remote Data",
          type: "remote",
          visible: true,
          source: trimmedUrl,
          sourceKind: "external",
          description: item.icon === "custom" ? "Custom external source" : "External data source",
          remoteFormat: detectRemoteFormat(trimmedUrl),
          renderMode:
            item.renderMode ??
            (detectRemoteFormat(trimmedUrl) === "ome-zarr" ? "volume" : "auto"),
        };

        const selected = selectedNodeId ? findNodeById(next, selectedNodeId) : null;

        if (selected && isGroupNode(selected)) {
          next = insertIntoGroup(next, selected.id, node);
        } else {
          next = [...next, node];
        }

        lastAddedId = node.id;
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

      <BottomToolbar
        activeTool={activeTool}
        onToolChange={handleToolChange}
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
                <button type="button" onClick={handleOpenExportState} style={secondaryButtonStyle}>
                  Export
                </button>
                <button type="button" onClick={handleOpenImportState} style={secondaryButtonStyle}>
                  Import
                </button>
              </div>
            </div>

            <textarea
              value={stateTextDraft}
              onChange={(e) => setStateTextDraft(e.target.value)}
              readOnly={stateModalMode === "export"}
              placeholder={
                stateModalMode === "import" ? "Paste a viewer state JSON here..." : ""
              }
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
                Versioned JSON state for copy-paste sharing.
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