import { useEffect, useMemo, useRef, useState } from "react";
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
import { flattenTree } from "./layerTypes";

const ROOT_DROP_ID = "__root_drop_zone__";

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
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{
        transform: open ? "rotate(90deg)" : "rotate(0deg)",
        transition: "transform 160ms ease",
      }}
    >
      <path d="M9 6l6 6-6 6" />
    </svg>
  );
}

function FolderIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
    </svg>
  );
}

function LayerIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
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

function RowShell({
  row,
  selected,
  inheritedSelected,
  hoveringGroupTarget,
  dragStyle,
  dragging,
  children,
}: {
  row: FlatTreeRow;
  selected: boolean;
  inheritedSelected: boolean;
  hoveringGroupTarget: boolean;
  dragStyle?: React.CSSProperties;
  dragging?: boolean;
  children: React.ReactNode;
}) {
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

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 8,
        padding: "10px 10px",
        paddingLeft: 10 + row.depth * 18,
        borderRadius: 12,
        cursor: "pointer",
        background,
        border,
        color,
        opacity: dragging ? 0.45 : 1,
        transition:
          dragging
            ? "none"
            : "transform 180ms ease, background 180ms ease, border-color 180ms ease",
        ...dragStyle,
      }}
    >
      {children}
    </div>
  );
}

function RootDropZone({ active }: { active: boolean }) {
  const { setNodeRef, isOver } = useDroppable({
    id: ROOT_DROP_ID,
  });

  if (!active) return null;

  return (
    <div
      ref={setNodeRef}
      style={{
        marginTop: 10,
        height: 44,
        borderRadius: 12,
        border: isOver
          ? "1px solid rgba(130,240,190,0.85)"
          : "1px dashed rgba(255,255,255,0.18)",
        background: isOver
          ? "rgba(90,210,160,0.16)"
          : "rgba(255,255,255,0.03)",
        color: "rgba(255,255,255,0.7)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 12,
        transition: "all 160ms ease",
      }}
    >
      Drop here to move to root
    </div>
  );
}

function SortableTreeRow({
  row,
  selectedNodeId,
  openMenuId,
  setOpenMenuId,
  renamingId,
  renameDraft,
  setRenameDraft,
  startRename,
  finishRename,
  cancelRename,
  hoveredGroupId,
  onToggleVisible,
  onSelectNode,
  onToggleGroupExpanded,
  onDeleteNode,
}: {
  row: FlatTreeRow;
  selectedNodeId: string | null;
  openMenuId: string | null;
  setOpenMenuId: (id: string | null) => void;
  renamingId: string | null;
  renameDraft: string;
  setRenameDraft: (value: string) => void;
  startRename: (row: FlatTreeRow) => void;
  finishRename: (nodeId: string) => void;
  cancelRename: () => void;
  hoveredGroupId: string | null;
  onToggleVisible: (nodeId: string) => void;
  onSelectNode: (nodeId: string) => void;
  onToggleGroupExpanded: (groupId: string) => void;
  onDeleteNode: (nodeId: string) => void;
}) {
  const isSelected = selectedNodeId === row.id;
  const inheritedSelected =
    !isSelected && !!selectedNodeId && row.ancestorIds.includes(selectedNodeId);
  const isEditing = renamingId === row.id;
  const hoveringGroupTarget = hoveredGroupId === row.id && row.kind === "group";
  const isGroup = row.kind === "group";
  const isExpanded = isGroup ? (row.node as LayerGroupNode).expanded : false;

  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: row.id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div ref={setNodeRef}>
      <RowShell
        row={row}
        selected={isSelected}
        inheritedSelected={inheritedSelected}
        hoveringGroupTarget={hoveringGroupTarget}
        dragStyle={style}
        dragging={isDragging}
      >
        <div
          onClick={() => onSelectNode(row.id)}
          style={{ display: "flex", alignItems: "center", gap: 10 }}
        >
          <button
            ref={setActivatorNodeRef}
            type="button"
            title="Drag to reorder"
            {...attributes}
            {...listeners}
            onClick={(e) => e.stopPropagation()}
            style={{
              width: 28,
              height: 28,
              borderRadius: 8,
              border: "1px solid rgba(255,255,255,0.08)",
              background: "rgba(255,255,255,0.04)",
              color: "rgba(255,255,255,0.65)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "grab",
              flexShrink: 0,
            }}
          >
            <GripDots />
          </button>

          {isGroup && (
            <button
              type="button"
              title={isExpanded ? "Collapse group" : "Expand group"}
              onClick={(e) => {
                e.stopPropagation();
                onToggleGroupExpanded(row.id);
              }}
              style={{
                width: 24,
                height: 24,
                border: "none",
                background: "transparent",
                color: "rgba(255,255,255,0.8)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
                padding: 0,
                flexShrink: 0,
              }}
            >
              <Chevron open={isExpanded} />
            </button>
          )}

          <button
            type="button"
            title={row.visible ? "Hide node" : "Show node"}
            aria-label={row.visible ? "Hide node" : "Show node"}
            onClick={(e) => {
              e.stopPropagation();
              onToggleVisible(row.id);
            }}
            style={{
              width: 32,
              height: 32,
              borderRadius: 10,
              border: "1px solid rgba(255,255,255,0.10)",
              background: "rgba(255,255,255,0.05)",
              color: row.visible ? "#d5ecff" : "rgba(255,255,255,0.45)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              flexShrink: 0,
            }}
          >
            <EyeIcon open={row.visible} />
          </button>

          <div
            style={{
              width: 22,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              opacity: isSelected || inheritedSelected ? 1 : 0.72,
              flexShrink: 0,
            }}
          >
            {isGroup ? <FolderIcon /> : <LayerIcon />}
          </div>

          <div style={{ minWidth: 0, flex: 1 }}>
            {isEditing ? (
              <input
                autoFocus
                value={renameDraft}
                onChange={(e) => setRenameDraft(e.target.value)}
                onClick={(e) => e.stopPropagation()}
                onBlur={() => finishRename(row.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") finishRename(row.id);
                  if (e.key === "Escape") cancelRename();
                }}
                style={{
                  width: "100%",
                  height: 30,
                  borderRadius: 8,
                  border: "1px solid rgba(160,220,255,0.6)",
                  background: "rgba(255,255,255,0.08)",
                  color: "white",
                  padding: "0 8px",
                  boxSizing: "border-box",
                  outline: "none",
                }}
              />
            ) : (
              <>
                <div
                  style={{
                    fontSize: isSelected ? 13.5 : inheritedSelected ? 13.2 : 13,
                    fontWeight: isSelected ? 700 : inheritedSelected ? 650 : 600,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {row.name}
                </div>
                <div
                  style={{
                    fontSize: 11,
                    opacity: isSelected || inheritedSelected ? 0.85 : 0.58,
                    marginTop: 2,
                    textTransform: "uppercase",
                    letterSpacing: 0.4,
                  }}
                >
                  {row.kind}
                </div>
              </>
            )}
          </div>

          <div data-layer-menu-container="true" style={{ position: "relative" }}>
            <button
              type="button"
              title="More"
              onClick={(e) => {
                e.stopPropagation();
                setOpenMenuId(openMenuId === row.id ? null : row.id);
              }}
              style={{
                width: 30,
                height: 30,
                borderRadius: 8,
                border: "1px solid rgba(255,255,255,0.08)",
                background: "rgba(255,255,255,0.04)",
                color: "rgba(255,255,255,0.8)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
                flexShrink: 0,
              }}
            >
              <MoreVertical />
            </button>

            {openMenuId === row.id && (
              <div
                data-layer-menu-popup="true"
                onClick={(e) => e.stopPropagation()}
                style={{
                  position: "absolute",
                  top: 36,
                  right: 0,
                  minWidth: 140,
                  background: "rgba(14,17,22,0.98)",
                  border: "1px solid rgba(255,255,255,0.10)",
                  borderRadius: 12,
                  boxShadow: "0 12px 28px rgba(0,0,0,0.35)",
                  padding: 6,
                  zIndex: 50,
                }}
              >
                <button
                  type="button"
                  onClick={() => {
                    startRename(row);
                    setOpenMenuId(null);
                  }}
                  style={menuItemStyle}
                >
                  Rename
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onDeleteNode(row.id);
                    setOpenMenuId(null);
                  }}
                  style={menuItemStyle}
                >
                  Delete
                </button>
              </div>
            )}
          </div>
        </div>
      </RowShell>
    </div>
  );
}

const menuItemStyle: React.CSSProperties = {
  width: "100%",
  height: 34,
  borderRadius: 8,
  border: "none",
  background: "transparent",
  color: "white",
  cursor: "pointer",
  textAlign: "left",
  padding: "0 10px",
};

export default function LayerPanel({
  layerTree,
  selectedNodeId,
  groupOptions,
  isCollapsed,
  onSetCollapsed,
  onToggleVisible,
  onSelectNode,
  onToggleGroupExpanded,
  onSetGroupExpanded,
  onAddGroup,
  onAddLayer,
  onRenameNode,
  onDeleteNode,
  onDropNodeIntoGroup,
  onDropNodeToRoot,
  onReorderBefore,
}: {
  layerTree: LayerTreeNode[];
  selectedNodeId: string | null;
  groupOptions: LayerGroupNode[];
  isCollapsed: boolean;
  onSetCollapsed: (collapsed: boolean) => void;
  onToggleVisible: (nodeId: string) => void;
  onSelectNode: (nodeId: string) => void;
  onToggleGroupExpanded: (groupId: string) => void;
  onSetGroupExpanded: (groupId: string, expanded: boolean) => void;
  onAddGroup: () => void;
  onAddLayer: () => void;
  onRenameNode: (nodeId: string, newName: string) => void;
  onDeleteNode: (nodeId: string) => void;
  onDropNodeIntoGroup: (nodeId: string, groupId: string) => void;
  onDropNodeToRoot: (nodeId: string) => void;
  onReorderBefore: (activeId: string, overId: string) => void;
}) {
  const rows = useMemo(() => flattenTree(layerTree), [layerTree]);

  const [activeId, setActiveId] = useState<string | null>(null);
  const [hoveredGroupId, setHoveredGroupId] = useState<string | null>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");

  const hoverExpandTimerRef = useRef<number | null>(null);

  const sensors = useSensors(
    useSensor(MouseSensor, {
      activationConstraint: { distance: 6 },
    }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 120, tolerance: 6 },
    })
  );

  const activeRow = rows.find((row) => row.id === activeId) ?? null;

  useEffect(() => {
    function handlePointerDown(event: PointerEvent) {
      const target = event.target as HTMLElement | null;
      if (!target) return;

      const insideMenu = target.closest("[data-layer-menu-container='true']");
      if (!insideMenu) {
        setOpenMenuId(null);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, []);

  useEffect(() => {
    return () => {
      if (hoverExpandTimerRef.current) {
        window.clearTimeout(hoverExpandTimerRef.current);
      }
    };
  }, []);

  function startRename(row: FlatTreeRow) {
    setRenamingId(row.id);
    setRenameDraft(row.name);
  }

  function finishRename(nodeId: string) {
    const trimmed = renameDraft.trim();
    if (trimmed) {
      onRenameNode(nodeId, trimmed);
    }
    setRenamingId(null);
    setRenameDraft("");
  }

  function cancelRename() {
    setRenamingId(null);
    setRenameDraft("");
  }

  function clearHoverExpandTimer() {
    if (hoverExpandTimerRef.current) {
      window.clearTimeout(hoverExpandTimerRef.current);
      hoverExpandTimerRef.current = null;
    }
  }

  function handleDragOver(event: DragOverEvent) {
    const overId = event.over?.id ? String(event.over.id) : null;

    clearHoverExpandTimer();

    if (!overId || overId === ROOT_DROP_ID) {
      setHoveredGroupId(null);
      return;
    }

    const row = rows.find((r) => r.id === overId);
    if (row?.kind === "group" && row.id !== activeId) {
      setHoveredGroupId(row.id);

      const groupNode = row.node as LayerGroupNode;
      if (!groupNode.expanded) {
        hoverExpandTimerRef.current = window.setTimeout(() => {
          onSetGroupExpanded(row.id, true);
        }, 450);
      }
    } else {
      setHoveredGroupId(null);
    }
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    const activeNodeId = String(active.id);

    clearHoverExpandTimer();
    setActiveId(null);

    if (!over) {
      setHoveredGroupId(null);
      return;
    }

    const overId = String(over.id);

    if (overId === ROOT_DROP_ID) {
      onDropNodeToRoot(activeNodeId);
      setHoveredGroupId(null);
      return;
    }

    const overRow = rows.find((row) => row.id === overId);
    if (!overRow || overId === activeNodeId) {
      setHoveredGroupId(null);
      return;
    }

    if (overRow.kind === "group") {
      onDropNodeIntoGroup(activeNodeId, overRow.id);
      setHoveredGroupId(null);
      return;
    }

    onReorderBefore(activeNodeId, overRow.id);
    setHoveredGroupId(null);
  }

  return (
    <>
      <style>
        {`
          .layer-panel-scroll {
            overflow-y: auto;
            max-height: min(68vh, 720px);
            padding-right: 4px;
            scrollbar-width: thin;
            scrollbar-color: rgba(140, 190, 255, 0.45) rgba(255,255,255,0.06);
          }

          .layer-panel-scroll::-webkit-scrollbar {
            width: 10px;
          }

          .layer-panel-scroll::-webkit-scrollbar-track {
            background: rgba(255,255,255,0.05);
            border-radius: 999px;
          }

          .layer-panel-scroll::-webkit-scrollbar-thumb {
            background: linear-gradient(
              180deg,
              rgba(140,190,255,0.52),
              rgba(90,150,230,0.34)
            );
            border-radius: 999px;
            border: 2px solid rgba(12,14,18,0.82);
          }

          .layer-panel-scroll::-webkit-scrollbar-thumb:hover {
            background: linear-gradient(
              180deg,
              rgba(160,210,255,0.68),
              rgba(110,170,245,0.48)
            );
          }
        `}
      </style>

      <div
        style={{
          position: "absolute",
          top: 16,
          right: 16,
          zIndex: 20,
          display: "flex",
          justifyContent: "flex-end",
          pointerEvents: "none",
        }}
      >
        <div
          style={{
            pointerEvents: "auto",
            width: isCollapsed ? 52 : 360,
            opacity: isCollapsed ? 0.96 : 1,
            transform: isCollapsed ? "translateX(0)" : "translateX(0)",
            transition:
              "width 220ms ease, opacity 220ms ease, transform 220ms ease",
          }}
        >
          {isCollapsed ? (
            <button
              type="button"
              title="Open layers"
              onClick={() => onSetCollapsed(false)}
              style={{
                width: 52,
                height: 52,
                borderRadius: 16,
                border: "1px solid rgba(255,255,255,0.10)",
                background: "rgba(12,14,18,0.82)",
                color: "white",
                boxShadow: "0 12px 30px rgba(0,0,0,0.32)",
                backdropFilter: "blur(12px)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
              }}
            >
              <LayerIcon />
            </button>
          ) : (
            <div
              style={{
                background: "rgba(12,14,18,0.82)",
                border: "1px solid rgba(255,255,255,0.10)",
                borderRadius: 16,
                padding: 12,
                color: "white",
                fontFamily: "sans-serif",
                boxShadow: "0 12px 30px rgba(0,0,0,0.32)",
                backdropFilter: "blur(12px)",
                transform: isCollapsed ? "translateX(16px)" : "translateX(0)",
                opacity: isCollapsed ? 0 : 1,
                transition: "opacity 220ms ease, transform 220ms ease",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: 10,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ display: "flex", alignItems: "center" }}>
                    <LayerIcon />
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 700, opacity: 0.95 }}>
                    Layers
                  </div>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <button
                    type="button"
                    onClick={onAddLayer}
                    style={{
                      height: 32,
                      padding: "0 10px",
                      borderRadius: 10,
                      border: "1px solid rgba(255,255,255,0.10)",
                      background: "rgba(120,190,255,0.14)",
                      color: "white",
                      cursor: "pointer",
                      fontSize: 12,
                      fontWeight: 600,
                    }}
                  >
                    + Layer
                  </button>

                  <button
                    type="button"
                    onClick={onAddGroup}
                    style={{
                      height: 32,
                      padding: "0 10px",
                      borderRadius: 10,
                      border: "1px solid rgba(255,255,255,0.10)",
                      background: "rgba(255,255,255,0.05)",
                      color: "white",
                      cursor: "pointer",
                      fontSize: 12,
                    }}
                  >
                    + Group
                  </button>

                  <button
                    type="button"
                    title="Close layers"
                    onClick={() => onSetCollapsed(true)}
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 10,
                      border: "1px solid rgba(255,255,255,0.10)",
                      background: "rgba(255,255,255,0.05)",
                      color: "white",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Chevron open />
                  </button>
                </div>
              </div>

              <div className="layer-panel-scroll">
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragStart={(event) => {
                    setActiveId(String(event.active.id));
                    setOpenMenuId(null);
                  }}
                  onDragOver={handleDragOver}
                  onDragEnd={handleDragEnd}
                  onDragCancel={() => {
                    clearHoverExpandTimer();
                    setActiveId(null);
                    setHoveredGroupId(null);
                  }}
                >
                  <SortableContext
                    items={rows.map((row) => row.id)}
                    strategy={verticalListSortingStrategy}
                  >
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {rows.map((row) => (
                        <SortableTreeRow
                          key={row.id}
                          row={row}
                          selectedNodeId={selectedNodeId}
                          openMenuId={openMenuId}
                          setOpenMenuId={setOpenMenuId}
                          renamingId={renamingId}
                          renameDraft={renameDraft}
                          setRenameDraft={setRenameDraft}
                          startRename={startRename}
                          finishRename={finishRename}
                          cancelRename={cancelRename}
                          hoveredGroupId={hoveredGroupId}
                          onToggleVisible={onToggleVisible}
                          onSelectNode={onSelectNode}
                          onToggleGroupExpanded={onToggleGroupExpanded}
                          onDeleteNode={onDeleteNode}
                        />
                      ))}
                    </div>
                  </SortableContext>

                  <RootDropZone active={!!activeId} />

                  <DragOverlay>
                    {activeRow ? (
                      <div style={{ width: 320 }}>
                        <RowShell
                          row={activeRow}
                          selected={selectedNodeId === activeRow.id}
                          inheritedSelected={false}
                          hoveringGroupTarget={false}
                        >
                          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <div
                              style={{
                                width: 28,
                                height: 28,
                                borderRadius: 8,
                                border: "1px solid rgba(255,255,255,0.08)",
                                background: "rgba(255,255,255,0.04)",
                                color: "rgba(255,255,255,0.65)",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                              }}
                            >
                              <GripDots />
                            </div>
                            {activeRow.kind === "group" && (
                              <div
                                style={{
                                  width: 24,
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                }}
                              >
                                <Chevron open={(activeRow.node as LayerGroupNode).expanded} />
                              </div>
                            )}
                            <div
                              style={{
                                width: 32,
                                height: 32,
                                borderRadius: 10,
                                border: "1px solid rgba(255,255,255,0.10)",
                                background: "rgba(255,255,255,0.05)",
                                color: activeRow.visible
                                  ? "#d5ecff"
                                  : "rgba(255,255,255,0.45)",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                              }}
                            >
                              <EyeIcon open={activeRow.visible} />
                            </div>
                            <div style={{ width: 22, display: "flex", justifyContent: "center" }}>
                              {activeRow.kind === "group" ? <FolderIcon /> : <LayerIcon />}
                            </div>
                            <div style={{ minWidth: 0, flex: 1, fontWeight: 700 }}>
                              {activeRow.name}
                            </div>
                          </div>
                        </RowShell>
                      </div>
                    ) : null}
                  </DragOverlay>
                </DndContext>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}