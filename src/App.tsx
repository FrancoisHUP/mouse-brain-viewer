import { useMemo, useState } from "react";
import WebGLCanvas from "./WebGLCanvas";
import BottomToolbar, { type ToolId } from "./BottomToolbar";
import LayerPanel from "./LayerPanel";
import ImportDataPanel from "./ImportDataPanel";
import type { LayerTreeNode } from "./layerTypes";
import {
  collectGroups,
  deleteNodeById,
  findNodeById,
  getFirstLayerId,
  insertIntoGroup,
  isGroupNode,
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

export default function App() {
  const [activeTool, setActiveTool] = useState<ToolId>("mouse");
  const [isImportPanelOpen, setIsImportPanelOpen] = useState(false);
  const [layerTree, setLayerTree] = useState<LayerTreeNode[]>(INITIAL_TREE);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(
    getFirstLayerId(INITIAL_TREE)
  );

  const groupOptions = useMemo(() => collectGroups(layerTree), [layerTree]);

  function handleToolChange(tool: ToolId) {
    if (tool === "add-data") {
      setIsImportPanelOpen(true);
      return;
    }

    setActiveTool(tool);
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

    setSelectedNodeId(newNode.id);
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

      if (lastAddedId) {
        setSelectedNodeId(lastAddedId);
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
        const node: LayerTreeNode = {
          id: createId(),
          kind: "layer",
          name: item.name.trim() || "Remote Data",
          type: "remote",
          visible: true,
          source: item.url.trim(),
          sourceKind: "external",
          description: item.icon === "custom" ? "Custom external source" : "External data source",
        };

        const selected = selectedNodeId ? findNodeById(next, selectedNodeId) : null;

        if (selected && isGroupNode(selected)) {
          next = insertIntoGroup(next, selected.id, node);
        } else {
          next = [...next, node];
        }

        lastAddedId = node.id;
      }

      if (lastAddedId) {
        setSelectedNodeId(lastAddedId);
      }

      return next;
    });

    setIsImportPanelOpen(false);
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
      />

      <LayerPanel
        layerTree={layerTree}
        selectedNodeId={selectedNodeId}
        groupOptions={groupOptions}
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
      />
    </div>
  );
}