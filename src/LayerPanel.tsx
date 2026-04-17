import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, MouseEvent as ReactMouseEvent } from "react";
import { createPortal } from "react-dom";
import {
  closestCenter,
  DndContext,
  DragOverlay,
  MouseSensor,
  TouchSensor,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import type { DragEndEvent, DragOverEvent } from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { LayerGroupNode, LayerTreeNode, FlatTreeRow } from "./layerTypes";
import { flattenTree, isLocalOnlyFileLayer } from "./layerTypes";

const ROOT_DROP_ID = "__root_drop_zone__";

type MenuPosition = {
  top: number;
  left: number;
};

function EyeIcon({ open }: { open: boolean }) {
  const common = {
    width: 18,
    height: 18,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };

  if (open) {
    return (
      <svg {...common}>
        <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6z" />
        <circle cx="12" cy="12" r="2.8" />
      </svg>
    );
  }

  return (
    <svg {...common}>
      <path d="M3 3l18 18" />
      <path d="M10.6 10.7a2.8 2.8 0 003.1 3.1" />
      <path d="M9.4 5.1A11.3 11.3 0 0112 5c6.5 0 10 7 10 7a17.3 17.3 0 01-4.2 4.8" />
      <path d="M6.2 6.2C3.8 8 2 12 2 12s3.5 6 10 6c1.5 0 2.9-.3 4.1-.8" />
    </svg>
  );
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ transform: open ? "rotate(90deg)" : "rotate(0deg)", transition: "transform 160ms ease" }}>
      <path d="M9 6l6 6-6 6" />
    </svg>
  );
}

function FolderIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
    </svg>
  );
}

function LayerIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3l9 5-9 5-9-5 9-5z" />
      <path d="M3 13l9 5 9-5" />
    </svg>
  );
}

function GripDots() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
      <circle cx="5" cy="4" r="1.1" />
      <circle cx="11" cy="4" r="1.1" />
      <circle cx="5" cy="8" r="1.1" />
      <circle cx="11" cy="8" r="1.1" />
      <circle cx="5" cy="12" r="1.1" />
      <circle cx="11" cy="12" r="1.1" />
    </svg>
  );
}

function MoreVertical() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <circle cx="12" cy="5" r="1.8" />
      <circle cx="12" cy="12" r="1.8" />
      <circle cx="12" cy="19" r="1.8" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 6L6 18" />
      <path d="M6 6l12 12" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 6h18" />
      <path d="M8 6V4h8v2" />
      <path d="M19 6l-1 14H6L5 6" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
    </svg>
  );
}

function AddGroupIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
      <path d="M12 11v6" />
      <path d="M9 14h6" />
    </svg>
  );
}

function RowShell({ row, selected, inheritedSelected, hoveringGroupTarget, dragStyle, dragging, children }: { row: FlatTreeRow; selected: boolean; inheritedSelected: boolean; hoveringGroupTarget: boolean; dragStyle?: CSSProperties; dragging?: boolean; children: React.ReactNode; }) {
  let background = "rgba(255,255,255,0.04)";
  let border = "1px solid rgba(255,255,255,0.06)";
  let color = "rgba(255,255,255,0.82)";

  if (inheritedSelected) {
    background = "rgba(90,140,190,0.14)";
    border = "1px solid rgba(120,170,220,0.20)";
    color = "rgba(255,255,255,0.92)";
  }
  if (selected) {
    background = "rgba(120,190,255,0.22)";
    border = "1px solid rgba(160,220,255,0.95)";
    color = "rgba(255,255,255,1)";
  }
  if (hoveringGroupTarget) {
    background = "rgba(90,210,160,0.18)";
    border = "1px solid rgba(130,240,190,0.85)";
    color = "rgba(255,255,255,1)";
  }

  return <div style={{ display: "flex", flexDirection: "column", gap: 6, padding: "8px 10px", paddingLeft: 10 + row.depth * 18, borderRadius: 12, cursor: "pointer", background, border, color, opacity: dragging ? 0.45 : 1, transition: dragging ? "none" : "transform 180ms ease, background 180ms ease, border-color 180ms ease", userSelect: "none", WebkitUserSelect: "none", ...dragStyle }}>{children}</div>;
}

function RootDropZone({ active }: { active: boolean }) {
  const { setNodeRef, isOver } = useDroppable({ id: ROOT_DROP_ID });
  if (!active) return null;
  return <div ref={setNodeRef} style={{ marginTop: 10, height: 44, borderRadius: 12, border: isOver ? "1px solid rgba(130,240,190,0.85)" : "1px dashed rgba(255,255,255,0.18)", background: isOver ? "rgba(90,210,160,0.16)" : "rgba(255,255,255,0.03)", color: "rgba(255,255,255,0.7)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, transition: "all 160ms ease" }}>Drop here to move to root</div>;
}

function SortableTreeRow({ row, focusedNodeId, selectedNodeIds, openMenuId, setOpenMenuId, setMenuPosition, renamingId, renameDraft, setRenameDraft, finishRename, cancelRename, hoveredGroupId, onToggleVisible, onSelectNode, onToggleGroupExpanded }: { row: FlatTreeRow; focusedNodeId: string | null; selectedNodeIds: string[]; openMenuId: string | null; setOpenMenuId: (id: string | null) => void; setMenuPosition: (position: MenuPosition | null) => void; renamingId: string | null; renameDraft: string; setRenameDraft: (value: string) => void; startRename: (row: FlatTreeRow) => void; finishRename: (nodeId: string) => void; cancelRename: () => void; hoveredGroupId: string | null; onToggleVisible: (nodeId: string) => void; onSelectNode: (nodeId: string, event: ReactMouseEvent<HTMLDivElement>) => void; onToggleGroupExpanded: (groupId: string) => void; }) {
  const isSelected = selectedNodeIds.includes(row.id);
  const inheritedSelected = !isSelected && !!focusedNodeId && row.ancestorIds.includes(focusedNodeId);
  const isEditing = renamingId === row.id;
  const hoveringGroupTarget = hoveredGroupId === row.id && row.kind === "group";
  const isGroup = row.kind === "group";
  const isExpanded = isGroup ? (row.node as LayerGroupNode).expanded : false;
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: row.id });
  const style: CSSProperties = { transform: CSS.Transform.toString(transform), transition };

  return (
    <div ref={setNodeRef}>
      <RowShell row={row} selected={isSelected} inheritedSelected={inheritedSelected} hoveringGroupTarget={hoveringGroupTarget} dragStyle={style} dragging={isDragging}>
        <div onClick={(event) => onSelectNode(row.id, event)} style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button ref={setActivatorNodeRef} type="button" title="Drag to reorder" {...attributes} {...listeners} onClick={(e) => e.stopPropagation()} style={{ width: 28, height: 28, borderRadius: 8, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.65)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "grab", flexShrink: 0 }}><GripDots /></button>
          {isGroup ? <button type="button" title={isExpanded ? "Collapse group" : "Expand group"} onClick={(e) => { e.stopPropagation(); onToggleGroupExpanded(row.id); }} style={{ width: 20, height: 20, border: "none", background: "transparent", color: "rgba(255,255,255,0.8)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", padding: 0, flexShrink: 0 }}><Chevron open={isExpanded} /></button> : null}
          <button type="button" title={row.visible ? "Hide node" : "Show node"} aria-label={row.visible ? "Hide node" : "Show node"} onClick={(e) => { e.stopPropagation(); onToggleVisible(row.id); }} style={{ width: 30, height: 30, borderRadius: 10, border: "1px solid rgba(255,255,255,0.10)", background: "rgba(255,255,255,0.05)", color: row.visible ? "#d5ecff" : "rgba(255,255,255,0.45)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 }}><EyeIcon open={row.visible} /></button>
          <div data-theme-text="strong" style={{ width: 20, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{isGroup ? <FolderIcon /> : <LayerIcon />}</div>
          <div style={{ minWidth: 0, flex: 1 }}>
            {isEditing ? <input autoFocus value={renameDraft} onChange={(e) => setRenameDraft(e.target.value)} onClick={(e) => e.stopPropagation()} onBlur={() => finishRename(row.id)} onKeyDown={(e) => { if (e.key === "Enter") finishRename(row.id); if (e.key === "Escape") cancelRename(); }} style={{ width: "100%", height: 32, borderRadius: 8, border: "1px solid rgba(160,220,255,0.45)", background: "rgba(255,255,255,0.07)", color: "white", padding: "0 10px", boxSizing: "border-box", outline: "none" }} /> : <><div data-theme-text="strong" style={{ fontSize: isSelected ? 13.5 : inheritedSelected ? 13.2 : 13, fontWeight: isSelected ? 700 : inheritedSelected ? 650 : 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", userSelect: "none", WebkitUserSelect: "none" }}>{row.name}</div><div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 2, minWidth: 0 }}><div data-theme-text="muted" style={{ fontSize: 11, opacity: isSelected || inheritedSelected ? 0.85 : 0.58, textTransform: "uppercase", letterSpacing: 0.4, userSelect: "none", WebkitUserSelect: "none" }}>{row.kind}</div>{isLocalOnlyFileLayer(row.node) ? <div style={{ height: 18, padding: "0 6px", borderRadius: 999, border: "1px solid rgba(255,210,120,0.26)", background: "rgba(255,210,120,0.12)", color: "#ffe4ad", fontSize: 10, fontWeight: 700, display: "inline-flex", alignItems: "center", lineHeight: 1 }}>LOCAL ONLY</div> : null}</div></>}
          </div>
          <div data-layer-menu-container="true" style={{ position: "relative" }}>
            <button type="button" title="More" onClick={(e) => { e.stopPropagation(); if (openMenuId === row.id) { setOpenMenuId(null); setMenuPosition(null); return; } const rect = (e.currentTarget as HTMLButtonElement).getBoundingClientRect(); const menuWidth = 140; const gap = 6; let left = rect.right - menuWidth; let top = rect.bottom + gap; if (left < 8) left = 8; if (left + menuWidth > window.innerWidth - 8) left = window.innerWidth - menuWidth - 8; const estimatedMenuHeight = 84; if (top + estimatedMenuHeight > window.innerHeight - 8) top = rect.top - estimatedMenuHeight - gap; if (top < 8) top = 8; setMenuPosition({ top, left }); setOpenMenuId(row.id); }} style={{ width: 30, height: 30, borderRadius: 8, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.8)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 }}><MoreVertical /></button>
          </div>
        </div>
      </RowShell>
    </div>
  );
}

const menuItemStyle: CSSProperties = { width: "100%", height: 34, borderRadius: 8, border: "none", background: "transparent", color: "white", cursor: "pointer", textAlign: "left", padding: "0 10px" };

export default function LayerPanel({ layerTree, selectedNodeId, groupOptions: _groupOptions, detailsContent = null, isCollapsed, onSetCollapsed, onToggleVisible, onSelectNode, onToggleGroupExpanded, onSetGroupExpanded, onAddGroup, onAddLayer, onRenameNode, onDeleteNode, onDeleteNodes, onCreateGroupFromNodes, onDropNodeIntoGroup, onDropNodeToRoot, onReorderBefore, onDropNodesIntoGroup, onDropNodesToRoot, onReorderNodesBefore }: { layerTree: LayerTreeNode[]; selectedNodeId: string | null; groupOptions: LayerGroupNode[]; detailsContent?: React.ReactNode; isCollapsed: boolean; onSetCollapsed: (collapsed: boolean) => void; onToggleVisible: (nodeId: string) => void; onSelectNode: (nodeId: string) => void; onToggleGroupExpanded: (groupId: string) => void; onSetGroupExpanded: (groupId: string, expanded: boolean) => void; onAddGroup: () => void; onAddLayer: () => void; onRenameNode: (nodeId: string, newName: string) => void; onDeleteNode: (nodeId: string) => void; onDeleteNodes: (nodeIds: string[]) => void; onCreateGroupFromNodes: (nodeIds: string[]) => void; onDropNodeIntoGroup: (nodeId: string, groupId: string) => void; onDropNodeToRoot: (nodeId: string) => void; onReorderBefore: (activeId: string, overId: string) => void; onDropNodesIntoGroup: (nodeIds: string[], groupId: string) => void; onDropNodesToRoot: (nodeIds: string[]) => void; onReorderNodesBefore: (nodeIds: string[], overId: string) => void; }) {
  const rows = useMemo(() => flattenTree(layerTree), [layerTree]);
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>(selectedNodeId ? [selectedNodeId] : []);
  const [selectionAnchorId, setSelectionAnchorId] = useState<string | null>(selectedNodeId);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [dragNodeIds, setDragNodeIds] = useState<string[]>([]);
  const [hoveredGroupId, setHoveredGroupId] = useState<string | null>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [menuPosition, setMenuPosition] = useState<MenuPosition | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const hoverExpandTimerRef = useRef<number | null>(null);
  const internalSelectionUpdateRef = useRef(false);
  const sensors = useSensors(useSensor(MouseSensor, { activationConstraint: { distance: 6 } }), useSensor(TouchSensor, { activationConstraint: { delay: 120, tolerance: 6 } }));
  const activeRow = rows.find((row) => row.id === activeId) ?? null;

  useEffect(() => {
    const rowIds = new Set(rows.map((row) => row.id));
    setSelectedNodeIds((prev) => prev.filter((id) => rowIds.has(id)));
    setSelectionAnchorId((prev) => (prev && rowIds.has(prev) ? prev : null));
  }, [rows]);

  useEffect(() => {
    if (internalSelectionUpdateRef.current) {
      internalSelectionUpdateRef.current = false;
      return;
    }
    if (!selectedNodeId) return;
    setSelectedNodeIds([selectedNodeId]);
    setSelectionAnchorId(selectedNodeId);
  }, [selectedNodeId]);

  useEffect(() => {
    function handlePointerDown(event: PointerEvent) {
      const target = event.target as HTMLElement | null;
      if (!target) return;
      if (!target.closest("[data-layer-menu-container='true']") && !target.closest("[data-layer-menu-popup='true']")) {
        setOpenMenuId(null);
        setMenuPosition(null);
      }
    }
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, []);

  useEffect(() => () => { if (hoverExpandTimerRef.current) window.clearTimeout(hoverExpandTimerRef.current); }, []);

  function startRename(row: FlatTreeRow) { setRenamingId(row.id); setRenameDraft(row.name); }
  function finishRename(nodeId: string) { const trimmed = renameDraft.trim(); if (trimmed) onRenameNode(nodeId, trimmed); setRenamingId(null); setRenameDraft(""); }
  function cancelRename() { setRenamingId(null); setRenameDraft(""); }
  function clearHoverExpandTimer() { if (hoverExpandTimerRef.current) { window.clearTimeout(hoverExpandTimerRef.current); hoverExpandTimerRef.current = null; } }
  function getOrderedSelection(ids: string[]) { const set = new Set(ids); return rows.map((row) => row.id).filter((id) => set.has(id)); }

  function handleRowSelect(nodeId: string, event: ReactMouseEvent<HTMLDivElement>) {
    const isToggle = event.metaKey || event.ctrlKey;
    const isRange = event.shiftKey;
    const clickedIndex = rows.findIndex((row) => row.id === nodeId);
    if (clickedIndex < 0) return;
    let nextSelection: string[];
    if (isRange && selectionAnchorId) {
      const anchorIndex = rows.findIndex((row) => row.id === selectionAnchorId);
      if (anchorIndex >= 0) {
        const start = Math.min(anchorIndex, clickedIndex);
        const end = Math.max(anchorIndex, clickedIndex);
        const rangeIds = rows.slice(start, end + 1).map((row) => row.id);
        nextSelection = isToggle ? Array.from(new Set([...selectedNodeIds, ...rangeIds])) : rangeIds;
      } else {
        nextSelection = isToggle ? (selectedNodeIds.includes(nodeId) ? selectedNodeIds.filter((id) => id != nodeId) : [...selectedNodeIds, nodeId]) : [nodeId];
      }
    } else if (isToggle) {
      nextSelection = selectedNodeIds.includes(nodeId) ? selectedNodeIds.filter((id) => id !== nodeId) : [...selectedNodeIds, nodeId];
    } else {
      nextSelection = [nodeId];
    }
    if (!nextSelection.length) nextSelection = [nodeId];
    nextSelection = getOrderedSelection(nextSelection);
    setSelectedNodeIds(nextSelection);
    setSelectionAnchorId(nodeId);
    internalSelectionUpdateRef.current = true;
    onSelectNode(nodeId);
  }

  function handleDragOver(event: DragOverEvent) {
    const overId = event.over?.id ? String(event.over.id) : null;
    clearHoverExpandTimer();
    if (!overId || overId === ROOT_DROP_ID || dragNodeIds.includes(overId)) { setHoveredGroupId(null); return; }
    const row = rows.find((r) => r.id === overId);
    if (row?.kind === "group") {
      setHoveredGroupId(row.id);
      const groupNode = row.node as LayerGroupNode;
      if (!groupNode.expanded) {
        hoverExpandTimerRef.current = window.setTimeout(() => { onSetGroupExpanded(row.id, true); }, 450);
      }
    } else setHoveredGroupId(null);
  }

  function handleDragEnd(event: DragEndEvent) {
    const { over } = event;
    const movedIds = dragNodeIds.length ? dragNodeIds : activeId ? [activeId] : [];
    clearHoverExpandTimer();
    setActiveId(null); setDragNodeIds([]);
    if (!over || !movedIds.length) { setHoveredGroupId(null); return; }
    const overId = String(over.id);
    if (overId === ROOT_DROP_ID) { movedIds.length > 1 ? onDropNodesToRoot(movedIds) : onDropNodeToRoot(movedIds[0]); setHoveredGroupId(null); return; }
    if (movedIds.includes(overId)) { setHoveredGroupId(null); return; }
    const overRow = rows.find((row) => row.id === overId);
    if (!overRow) { setHoveredGroupId(null); return; }
    if (overRow.kind === "group") movedIds.length > 1 ? onDropNodesIntoGroup(movedIds, overRow.id) : onDropNodeIntoGroup(movedIds[0], overRow.id);
    else movedIds.length > 1 ? onReorderNodesBefore(movedIds, overRow.id) : onReorderBefore(movedIds[0], overRow.id);
    setHoveredGroupId(null);
  }

  const selectionCount = selectedNodeIds.length;

  return (<>
    <style>{`.layer-panel-scroll{overflow-y:auto;overflow-x:hidden;max-height:min(68vh,720px);padding-right:4px;scrollbar-width:thin;scrollbar-color:rgba(140,190,255,0.45) rgba(255,255,255,0.06)}.layer-panel-scroll::-webkit-scrollbar{width:10px}.layer-panel-scroll::-webkit-scrollbar-track{background:rgba(255,255,255,0.05);border-radius:999px}.layer-panel-scroll::-webkit-scrollbar-thumb{background:linear-gradient(180deg,rgba(140,190,255,0.52),rgba(90,150,230,0.34));border-radius:999px;border:2px solid rgba(12,14,18,0.82)}.layer-panel-scroll::-webkit-scrollbar-thumb:hover{background:linear-gradient(180deg,rgba(160,210,255,0.68),rgba(110,170,245,0.48))}.layer-panel-no-select,.layer-panel-no-select *{user-select:none;-webkit-user-select:none}`}</style>
    <div style={{ position: "absolute", top: 16, right: 16, zIndex: 20, display: "flex", justifyContent: "flex-end", pointerEvents: "none" }}>
      <div style={{ pointerEvents: "auto", width: isCollapsed ? 52 : 360, opacity: isCollapsed ? 0.96 : 1, transition: "width 220ms ease, opacity 220ms ease, transform 220ms ease" }}>
        {isCollapsed ? <button data-theme-surface="panel" type="button" title="Open layers" onClick={() => onSetCollapsed(false)} style={{ width: 52, height: 52, borderRadius: 16, border: "1px solid rgba(255,255,255,0.10)", background: "rgba(12,14,18,0.82)", color: "white", boxShadow: "0 12px 30px rgba(0,0,0,0.32)", backdropFilter: "blur(12px)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}><span data-theme-text="strong" style={{ display: "flex", alignItems: "center", justifyContent: "center" }}><LayerIcon /></span></button> : <div className="layer-panel-no-select" data-theme-surface="panel" style={{ background: "rgba(12,14,18,0.82)", border: "1px solid rgba(255,255,255,0.10)", borderRadius: 16, padding: 12, color: "white", fontFamily: "sans-serif", boxShadow: "0 12px 30px rgba(0,0,0,0.32)", backdropFilter: "blur(12px)", transition: "opacity 220ms ease, transform 220ms ease" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}><div data-theme-text="strong" style={{ display: "flex", alignItems: "center" }}><LayerIcon /></div><div data-theme-text="strong" style={{ fontSize: 14, fontWeight: 700, opacity: 0.95 }}>Layers</div></div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <button type="button" onClick={onAddLayer} style={{ height: 32, padding: "0 10px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.10)", background: "rgba(120,190,255,0.14)", color: "white", cursor: "pointer", fontSize: 12, fontWeight: 600 }}>+ Layer</button>
              <button type="button" onClick={onAddGroup} style={{ height: 32, padding: "0 10px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.10)", background: "rgba(255,255,255,0.05)", color: "white", cursor: "pointer", fontSize: 12 }}>+ Group</button>
              <button type="button" title="Close layers" onClick={() => onSetCollapsed(true)} style={{ width: 32, height: 32, borderRadius: 10, border: "1px solid rgba(255,255,255,0.10)", background: "rgba(255,255,255,0.05)", color: "white", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}><Chevron open /></button>
            </div>
          </div>
          {selectionCount > 1 ? <div data-theme-surface="soft" style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", borderRadius: 12, border: "1px solid rgba(255,255,255,0.08)", marginBottom: 10, background: "rgba(255,255,255,0.035)" }}><div style={{ width: 22, height: 22, borderRadius: 999, background: "rgba(120,190,255,0.16)", border: "1px solid rgba(160,220,255,0.20)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 800, color: "white", flexShrink: 0 }}>{selectionCount}</div><div data-theme-text="muted" style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.25 }}>multi-select active</div><div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6 }}><button type="button" title="Create group from selection" onClick={() => onCreateGroupFromNodes(selectedNodeIds)} style={{ height: 30, padding: "0 10px", borderRadius: 999, border: "1px solid rgba(160,220,255,0.22)", background: "rgba(120,190,255,0.10)", color: "white", cursor: "pointer", fontSize: 11, fontWeight: 700, display: "flex", alignItems: "center", gap: 6 }}><AddGroupIcon /><span>+ Group</span></button><button type="button" title="Delete selected" onClick={() => onDeleteNodes(selectedNodeIds)} style={{ width: 30, height: 30, borderRadius: 999, border: "1px solid rgba(255,120,120,0.22)", background: "rgba(255,80,80,0.10)", color: "white", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}><TrashIcon /></button><button type="button" title="Close multi-select" onClick={() => setSelectedNodeIds(selectedNodeId ? [selectedNodeId] : [])} style={{ width: 30, height: 30, borderRadius: 999, border: "1px solid rgba(255,255,255,0.10)", background: "rgba(255,255,255,0.05)", color: "white", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}><CloseIcon /></button></div></div> : null}
          <div className="layer-panel-scroll">
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={(event) => { const nextActiveId = String(event.active.id); setActiveId(nextActiveId); setOpenMenuId(null); setMenuPosition(null); const movedIds = selectedNodeIds.includes(nextActiveId) ? getOrderedSelection(selectedNodeIds) : [nextActiveId]; setDragNodeIds(movedIds); if (!selectedNodeIds.includes(nextActiveId)) { setSelectedNodeIds([nextActiveId]); setSelectionAnchorId(nextActiveId); internalSelectionUpdateRef.current = true; onSelectNode(nextActiveId); } }} onDragOver={handleDragOver} onDragEnd={handleDragEnd} onDragCancel={() => { clearHoverExpandTimer(); setActiveId(null); setDragNodeIds([]); setHoveredGroupId(null); setOpenMenuId(null); setMenuPosition(null); }}>
              <SortableContext items={rows.map((row) => row.id)} strategy={verticalListSortingStrategy}>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>{rows.map((row) => <SortableTreeRow key={row.id} row={row} focusedNodeId={selectedNodeId} selectedNodeIds={selectedNodeIds} openMenuId={openMenuId} setOpenMenuId={setOpenMenuId} setMenuPosition={setMenuPosition} renamingId={renamingId} renameDraft={renameDraft} setRenameDraft={setRenameDraft} startRename={startRename} finishRename={finishRename} cancelRename={cancelRename} hoveredGroupId={hoveredGroupId} onToggleVisible={onToggleVisible} onSelectNode={handleRowSelect} onToggleGroupExpanded={onToggleGroupExpanded} />)}</div>
              </SortableContext>
              <RootDropZone active={!!activeId} />
              <DragOverlay>{activeRow ? <div style={{ width: 320 }}><RowShell row={activeRow} selected={selectedNodeIds.includes(activeRow.id)} inheritedSelected={false} hoveringGroupTarget={false}><div style={{ display: "flex", alignItems: "center", gap: 8 }}><div style={{ width: 28, height: 28, borderRadius: 8, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.65)", display: "flex", alignItems: "center", justifyContent: "center" }}><GripDots /></div><div style={{ width: 20, display: "flex", alignItems: "center", justifyContent: "center" }}>{activeRow.kind === "group" ? <Chevron open={(activeRow.node as LayerGroupNode).expanded} /> : null}</div><div style={{ width: 30, height: 30, borderRadius: 10, border: "1px solid rgba(255,255,255,0.10)", background: "rgba(255,255,255,0.05)", color: activeRow.visible ? "#d5ecff" : "rgba(255,255,255,0.45)", display: "flex", alignItems: "center", justifyContent: "center" }}><EyeIcon open={activeRow.visible} /></div><div style={{ width: 20, display: "flex", justifyContent: "center" }}>{activeRow.kind === "group" ? <FolderIcon /> : <LayerIcon />}</div><div style={{ minWidth: 0, flex: 1, fontWeight: 700 }}>{dragNodeIds.length > 1 ? `${dragNodeIds.length} items` : activeRow.name}</div></div></RowShell></div> : null}</DragOverlay>
            </DndContext>
          </div>

          {detailsContent ? (
            <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid rgba(255,255,255,0.08)" }}>
              <div data-theme-text="strong" style={{ fontSize: 13, fontWeight: 700, marginBottom: 10, opacity: 0.95 }}>Selected layer</div>
              <div style={{ maxHeight: "min(42vh, 420px)", overflow: "auto", paddingRight: 4 }}>
                {detailsContent}
              </div>
            </div>
          ) : null}
        </div>}
      </div>
    </div>
    {openMenuId && menuPosition ? createPortal(<div data-layer-menu-popup="true" data-theme-surface="panel" onClick={(e) => e.stopPropagation()} style={{ position: "fixed", top: menuPosition.top, left: menuPosition.left, minWidth: 140, background: "rgba(14,17,22,0.98)", border: "1px solid rgba(255,255,255,0.10)", borderRadius: 12, boxShadow: "0 12px 28px rgba(0,0,0,0.35)", padding: 6, zIndex: 9999 }}><button type="button" onClick={() => { const row = rows.find((r) => r.id === openMenuId); if (!row) return; startRename(row); setOpenMenuId(null); setMenuPosition(null); }} style={menuItemStyle}>Rename</button><button type="button" onClick={() => { onDeleteNode(openMenuId); setOpenMenuId(null); setMenuPosition(null); }} style={menuItemStyle}>Delete</button></div>, document.body) : null}
  </>);
}
