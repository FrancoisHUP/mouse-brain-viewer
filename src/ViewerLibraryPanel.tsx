import { createPortal } from "react-dom";
import { useEffect, useRef, useState } from "react";
import type { SavedViewerEntry } from "./viewerLibrary";
import { collectAllLayerItems } from "./layerTypes";

function formatDate(timestamp: number) {
  return new Date(timestamp).toLocaleString([], {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function MoreIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <circle cx="5" cy="12" r="1.8" />
      <circle cx="12" cy="12" r="1.8" />
      <circle cx="19" cy="12" r="1.8" />
    </svg>
  );
}

const menuItemStyle = {
  width: "100%",
  height: 34,
  borderRadius: 8,
  border: "none",
  background: "transparent",
  color: "white",
  cursor: "pointer",
  textAlign: "left" as const,
  padding: "0 10px",
  fontSize: 12,
  fontWeight: 600,
} as const;

function ViewerCard({
  entry,
  isRenaming,
  renameDraft,
  renameInputRef,
  onRenameDraftChange,
  onRenameCommit,
  onRenameCancel,
  onOpenViewer,
  onOpenMenu,
}: {
  entry: SavedViewerEntry;
  isRenaming: boolean;
  renameDraft: string;
  renameInputRef: React.RefObject<HTMLInputElement | null>;
  onRenameDraftChange: (value: string) => void;
  onRenameCommit: () => void;
  onRenameCancel: () => void;
  onOpenViewer: (entry: SavedViewerEntry) => void;
  onOpenMenu: (entryId: string, rect: DOMRect) => void;
}) {
  const layerCount = collectAllLayerItems(entry.state.scene.layerTree).length;
  const isOwned = entry.ownerKind === "owned";

  return (
    <button
      type="button"
      onClick={() => onOpenViewer(entry)}
      style={{
        minHeight: 210,
        height: "100%",
        borderRadius: 16,
        border: isOwned
          ? "1px solid rgba(160,220,255,0.16)"
          : "1px solid rgba(215,180,255,0.16)",
        background: "rgba(255,255,255,0.04)",
        color: "white",
        padding: 14,
        textAlign: "left",
        display: "flex",
        flexDirection: "column",
        gap: 12,
        cursor: "pointer",
      }}
    >
      <div
        style={{
          height: 118,
          borderRadius: 12,
          border: isOwned
            ? "1px solid rgba(160,220,255,0.12)"
            : "1px solid rgba(215,180,255,0.12)",
          background: entry.thumbnailDataUrl
            ? `center / cover no-repeat url(${entry.thumbnailDataUrl})`
            : isOwned
              ? "linear-gradient(135deg, rgba(120,190,255,0.18), rgba(255,255,255,0.03))"
              : "linear-gradient(135deg, rgba(170,140,255,0.18), rgba(255,255,255,0.03))",
        }}
      />

      <div style={{ minHeight: 44 }}>
        {isRenaming ? (
          <input
            ref={renameInputRef}
            value={renameDraft}
            onChange={(e) => onRenameDraftChange(e.target.value)}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === "Enter") {
                onRenameCommit();
              } else if (e.key === "Escape") {
                onRenameCancel();
              }
            }}
            onBlur={onRenameCommit}
            style={{
              width: "100%",
              height: 34,
              borderRadius: 8,
              border: "1px solid rgba(160,220,255,0.45)",
              background: "rgba(255,255,255,0.07)",
              color: "white",
              padding: "0 10px",
              boxSizing: "border-box",
              outline: "none",
              fontSize: 14,
              fontWeight: 700,
            }}
          />
        ) : (
          <div
            data-theme-text="strong"
            style={{
              fontSize: 14,
              fontWeight: 700,
              lineHeight: 1.35,
              wordBreak: "break-word",
            }}
          >
            {entry.name}
          </div>
        )}
      </div>

      <div style={{ fontSize: 11, opacity: 0.66, lineHeight: 1.4 }}>{formatDate(entry.updatedAt)}</div>

      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: "auto" }}>
        <div
          style={{
            height: 28,
            fontSize: 11,
            fontWeight: 700,
            borderRadius: 999,
            padding: "0 10px",
            background: "rgba(255,255,255,0.05)",
            border: "1px solid rgba(255,255,255,0.08)",
            color: "rgba(255,255,255,0.84)",
            display: "flex",
            alignItems: "center",
          }}
        >
          {layerCount} layers
        </div>
        <div
          style={{
            height: 28,
            padding: "0 10px",
            borderRadius: 999,
            border: isOwned
              ? "1px solid rgba(160,220,255,0.18)"
              : "1px solid rgba(215,180,255,0.18)",
            background: isOwned ? "rgba(120,190,255,0.10)" : "rgba(170,140,255,0.10)",
            color: "white",
            display: "flex",
            alignItems: "center",
            fontSize: 11,
            fontWeight: 700,
          }}
        >
          {isOwned ? "Mine" : "Shared"}
        </div>
        <div style={{ marginLeft: "auto" }}>
          <button
            type="button"
            aria-label="Viewer actions"
            onClick={(event) => {
              event.stopPropagation();
              onOpenMenu(entry.id, (event.currentTarget as HTMLButtonElement).getBoundingClientRect());
            }}
            style={{
              width: 32,
              height: 32,
              borderRadius: 10,
              border: "1px solid rgba(255,255,255,0.10)",
              background: "rgba(255,255,255,0.05)",
              color: "white",
              display: "grid",
              placeItems: "center",
              cursor: "pointer",
            }}
          >
            <MoreIcon />
          </button>
        </div>
      </div>
    </button>
  );
}

export default function ViewerLibraryPanel({
  open,
  onClose,
  entries,
  errorMessage,
  successMessage,
  onOpenViewer,
  onDeleteViewer,
  onRenameViewer,
}: {
  open: boolean;
  onClose: () => void;
  entries: SavedViewerEntry[];
  errorMessage?: string | null;
  successMessage?: string | null;
  onOpenViewer: (entry: SavedViewerEntry) => void;
  onDeleteViewer: (entryId: string) => void;
  onRenameViewer: (entryId: string, nextName: string) => void;
}) {
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [menuPosition, setMenuPosition] = useState<{ top: number; left: number } | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const renameInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) {
      setOpenMenuId(null);
      setMenuPosition(null);
      setRenamingId(null);
      setRenameDraft("");
    }
  }, [open]);

  useEffect(() => {
    if (!renamingId) return;
    const timeoutId = window.setTimeout(() => {
      renameInputRef.current?.focus();
      renameInputRef.current?.select();
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [renamingId]);

  useEffect(() => {
    if (!openMenuId) return;

    function handlePointerDown(event: PointerEvent) {
      const target = event.target as HTMLElement | null;
      if (!target) return;
      if (target.closest("[data-layer-menu-popup='true']")) return;
      setOpenMenuId(null);
      setMenuPosition(null);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpenMenuId(null);
        setMenuPosition(null);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [openMenuId]);

  function startRename(entry: SavedViewerEntry) {
    setRenamingId(entry.id);
    setRenameDraft(entry.name);
  }

  function cancelRename() {
    setRenamingId(null);
    setRenameDraft("");
  }

  function commitRename() {
    if (!renamingId) return;
    const trimmed = renameDraft.trim();
    if (!trimmed) {
      cancelRename();
      return;
    }
    onRenameViewer(renamingId, trimmed);
    cancelRename();
  }

  if (!open) return null;

  return (
    <div
      onClick={onClose}
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 40,
        background: "rgba(0,0,0,0.45)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
    >
      <div
        data-theme-surface="panel"
        onClick={(event) => event.stopPropagation()}
        style={{
          width: "min(860px, calc(100vw - 32px))",
          maxHeight: "min(88vh, 920px)",
          borderRadius: 20,
          border: "1px solid rgba(255,255,255,0.10)",
          background: "rgba(12,14,18,0.96)",
          backdropFilter: "blur(14px)",
          boxShadow: "0 24px 60px rgba(0,0,0,0.45)",
          color: "white",
          fontFamily: "sans-serif",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div
          style={{
            position: "sticky",
            top: 0,
            zIndex: 2,
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-end",
            gap: 16,
            padding: "18px 18px 14px 18px",
            background: "rgba(12,14,18,0.98)",
            borderBottom: "1px solid rgba(255,255,255,0.08)",
            flexShrink: 0,
          }}
        >
          <button
            type="button"
            onClick={onClose}
            style={{
              width: 36,
              height: 36,
              borderRadius: 10,
              border: "1px solid rgba(255,255,255,0.10)",
              background: "rgba(255,255,255,0.04)",
              color: "white",
              cursor: "pointer",
              fontSize: 18,
              flexShrink: 0,
            }}
          >
            ×
          </button>
        </div>

        <div
          data-viewer-library-scroll="true"
          style={{
            overflowY: "auto",
            padding: 18,
            paddingTop: 14,
            scrollbarWidth: "thin",
            scrollbarColor: "rgba(255,255,255,0.26) rgba(255,255,255,0.06)",
          }}
        >
          <style>
            {`
              [data-viewer-library-scroll='true']::-webkit-scrollbar {
                width: 10px;
              }
              [data-viewer-library-scroll='true']::-webkit-scrollbar-track {
                background: rgba(255,255,255,0.05);
                border-radius: 999px;
              }
              [data-viewer-library-scroll='true']::-webkit-scrollbar-thumb {
                background: rgba(255,255,255,0.22);
                border-radius: 999px;
                border: 2px solid rgba(12,14,18,0.96);
              }
              [data-viewer-library-scroll='true']::-webkit-scrollbar-thumb:hover {
                background: rgba(255,255,255,0.34);
              }
            `}
          </style>
          {errorMessage ? <div style={{ color: "#ffb4b4", fontSize: 12, marginBottom: 12 }}>{errorMessage}</div> : null}
            {successMessage ? (
              <div style={{ color: "rgba(180,245,210,0.95)", fontSize: 12, marginBottom: 12 }}>{successMessage}</div>
            ) : null}

            {entries.length ? (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
                  gap: 12,
                  alignItems: "stretch",
                }}
              >
                {entries.map((entry) => (
                  <ViewerCard
                    key={entry.id}
                    entry={entry}
                    isRenaming={renamingId === entry.id}
                    renameDraft={renameDraft}
                    renameInputRef={renameInputRef}
                    onRenameDraftChange={setRenameDraft}
                    onRenameCommit={commitRename}
                    onRenameCancel={cancelRename}
                    onOpenViewer={onOpenViewer}
                    onOpenMenu={(entryId, rect) => {
                      setOpenMenuId(entryId);
                      setMenuPosition({ top: rect.bottom + 8, left: rect.right - 140 });
                    }}
                  />
                ))}
              </div>
            ) : (
              <div
                data-theme-surface="soft"
                style={{
                  minHeight: 120,
                  borderRadius: 14,
                  border: "1px dashed rgba(255,255,255,0.12)",
                  background: "rgba(255,255,255,0.02)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  textAlign: "center",
                  padding: 20,
                  color: "rgba(255,255,255,0.72)",
                  fontSize: 13,
                }}
              >
                No saved viewers in this browser yet.
              </div>
            )}
        </div>
      </div>

      {openMenuId && menuPosition
        ? createPortal(
            <div
              data-layer-menu-popup="true"
              data-theme-surface="panel"
              onClick={(e) => e.stopPropagation()}
              style={{
                position: "fixed",
                top: menuPosition.top,
                left: menuPosition.left,
                minWidth: 140,
                background: "rgba(14,17,22,0.98)",
                border: "1px solid rgba(255,255,255,0.10)",
                borderRadius: 12,
                boxShadow: "0 12px 28px rgba(0,0,0,0.35)",
                padding: 6,
                zIndex: 9999,
              }}
            >
              <button
                type="button"
                onClick={() => {
                  const entry = entries.find((r) => r.id === openMenuId);
                  if (!entry) return;
                  startRename(entry);
                  setOpenMenuId(null);
                  setMenuPosition(null);
                }}
                style={menuItemStyle}
              >
                Rename
              </button>
              <button
                type="button"
                onClick={() => {
                  onDeleteViewer(openMenuId);
                  setOpenMenuId(null);
                  setMenuPosition(null);
                }}
                style={menuItemStyle}
              >
                Delete
              </button>
            </div>,
            document.body
          )
        : null}
    </div>
  );
}
