import { createPortal } from "react-dom";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react";
import type { SavedViewerEntry, SavedViewerRevision } from "./viewerLibrary";
import { collectAllLayerItems } from "./layerTypes";

type ViewerLibraryMode = "browse" | "save";

function formatDate(timestamp: number) {
  return new Date(timestamp).toLocaleString([], {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function buildSnapshotKey(entryId: string, revisionId: string | null) {
  return `${entryId}:${revisionId ?? "current"}`;
}

function MoreIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <circle cx="5" cy="12" r="1.8" />
      <circle cx="12" cy="12" r="1.8" />
      <circle cx="19" cy="12" r="1.8" />
    </svg>
  );
}

function PrimaryButton({
  children,
  disabled,
  onClick,
}: {
  children: ReactNode;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      style={{
        height: 38,
        borderRadius: 12,
        border: disabled ? "1px solid rgba(255,255,255,0.08)" : "1px solid rgba(160,220,255,0.22)",
        background: disabled ? "rgba(255,255,255,0.03)" : "rgba(255,255,255,0.05)",
        color: "white",
        cursor: disabled ? "not-allowed" : "pointer",
        padding: "0 14px",
        fontSize: 12,
        fontWeight: 800,
        fontFamily: "sans-serif",
      }}
    >
      {children}
    </button>
  );
}

function SecondaryButton({
  children,
  disabled,
  onClick,
}: {
  children: ReactNode;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      style={{
        height: 38,
        borderRadius: 12,
        border: "1px solid rgba(255,255,255,0.10)",
        background: disabled ? "rgba(255,255,255,0.03)" : "rgba(255,255,255,0.05)",
        color: disabled ? "rgba(255,255,255,0.4)" : "white",
        cursor: disabled ? "not-allowed" : "pointer",
        padding: "0 14px",
        fontSize: 12,
        fontWeight: 700,
      }}
    >
      {children}
    </button>
  );
}

function ViewerCard({
  entry,
  isSelected,
  isActiveSaveTarget,
  isRenaming,
  renameDraft,
  renameInputRef,
  onSelect,
  onOpen,
  onOpenMenu,
  onRenameDraftChange,
  onRenameCommit,
  onRenameCancel,
}: {
  entry: SavedViewerEntry;
  isSelected: boolean;
  isActiveSaveTarget: boolean;
  isRenaming: boolean;
  renameDraft: string;
  renameInputRef: React.RefObject<HTMLInputElement | null>;
  onSelect: (modifiers: { shiftKey: boolean; ctrlKey: boolean; metaKey: boolean }) => void;
  onOpen: () => void;
  onOpenMenu: (rect: DOMRect) => void;
  onRenameDraftChange: (value: string) => void;
  onRenameCommit: () => void;
  onRenameCancel: () => void;
}) {
  const layerCount = collectAllLayerItems(entry.state.scene.layerTree).length;
  const isOwned = entry.ownerKind === "owned";

  function handleKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    onSelect({ shiftKey: event.shiftKey, ctrlKey: event.ctrlKey, metaKey: event.metaKey });
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={(event) => onSelect({ shiftKey: event.shiftKey, ctrlKey: event.ctrlKey, metaKey: event.metaKey })}
      onDoubleClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onOpen();
      }}
      onKeyDown={handleKeyDown}
      style={{
        minHeight: 212,
        borderRadius: 18,
        border: isSelected
          ? "1px solid rgba(120,190,255,0.72)"
          : isOwned
            ? "1px solid rgba(160,220,255,0.16)"
            : "1px solid rgba(215,180,255,0.16)",
        background: isSelected ? "rgba(120,190,255,0.10)" : "rgba(255,255,255,0.04)",
        color: "white",
        padding: 14,
        textAlign: "left",
        display: "flex",
        flexDirection: "column",
        gap: 12,
        cursor: "pointer",
        transition: "border-color 160ms ease, background 160ms ease",
        outline: "none",
        userSelect: "none",
        WebkitUserSelect: "none",
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {isActiveSaveTarget ? (
            <div
              style={{
                borderRadius: 999,
                padding: "6px 10px",
                fontSize: 10,
                fontWeight: 800,
                letterSpacing: 0.3,
                textTransform: "uppercase",
                background: "rgba(120,190,255,0.16)",
                border: "1px solid rgba(120,190,255,0.28)",
              }}
            >
              Ctrl+S target
            </div>
          ) : null}
        </div>
        <button
          type="button"
          aria-label={`More actions for ${entry.name}`}
          onClick={(event) => {
            event.stopPropagation();
            onOpenMenu((event.currentTarget as HTMLButtonElement).getBoundingClientRect());
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
            flexShrink: 0,
          }}
        >
          <MoreIcon />
        </button>
      </div>

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

      <div style={{ minHeight: 42 }}>
        {isRenaming ? (
          <input
            ref={renameInputRef}
            value={renameDraft}
            onChange={(event) => onRenameDraftChange(event.target.value)}
            onClick={(event) => event.stopPropagation()}
            onDoubleClick={(event) => event.stopPropagation()}
            onMouseDown={(event) => event.stopPropagation()}
            onKeyDown={(event) => {
              event.stopPropagation();
              if (event.key === "Enter") {
                onRenameCommit();
              } else if (event.key === "Escape") {
                onRenameCancel();
              }
            }}
            onBlur={onRenameCommit}
            style={{
              width: "100%",
              height: 36,
              borderRadius: 10,
              border: "1px solid rgba(160,220,255,0.22)",
              background: "rgba(255,255,255,0.05)",
              color: "white",
              padding: "0 10px",
              boxSizing: "border-box",
              outline: "none",
              fontSize: 14,
              fontWeight: 700,
              fontFamily: "sans-serif",
              userSelect: "text",
              WebkitUserSelect: "text",
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

      <div style={{ fontSize: 11, opacity: 0.72, lineHeight: 1.45 }}>
        Last saved {formatDate(entry.updatedAt)}
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, marginTop: "auto" }}>
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
      </div>
    </div>
  );
}

export default function ViewerLibraryPanel({
  open,
  mode,
  onSetMode,
  onClose,
  entries,
  activeSavedViewerId,
  errorMessage,
  saveNamePlaceholder,
  onSaveNewViewer,
  onOpenViewer,
  onDeleteViewers,
  onRenameViewer,
}: {
  open: boolean;
  mode: ViewerLibraryMode;
  onSetMode: (mode: ViewerLibraryMode) => void;
  onClose: () => void;
  entries: SavedViewerEntry[];
  activeSavedViewerId: string | null;
  errorMessage?: string | null;
  saveNamePlaceholder: string;
  onSaveNewViewer: (name: string) => void;
  onOpenViewer: (entry: SavedViewerEntry, revision: SavedViewerRevision | null) => void;
  onDeleteViewers: (entryIds: string[]) => void;
  onRenameViewer: (entryId: string, nextName: string) => void;
}) {
  const [selectedEntryIds, setSelectedEntryIds] = useState<string[]>([]);
  const [selectionAnchorId, setSelectionAnchorId] = useState<string | null>(null);
  const [saveDraft, setSaveDraft] = useState("");
  const [menuEntryId, setMenuEntryId] = useState<string | null>(null);
  const [menuPosition, setMenuPosition] = useState<{ top: number; left: number } | null>(null);
  const [renamingEntryId, setRenamingEntryId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [versionEntryId, setVersionEntryId] = useState<string | null>(null);
  const [selectedVersionKey, setSelectedVersionKey] = useState<string | null>(null);
  const [pendingDeleteEntryIds, setPendingDeleteEntryIds] = useState<string[] | null>(null);
  const saveInputRef = useRef<HTMLInputElement | null>(null);
  const renameInputRef = useRef<HTMLInputElement | null>(null);

  const selectedSingleEntry =
    selectedEntryIds.length === 1 ? entries.find((entry) => entry.id === selectedEntryIds[0]) ?? null : null;

  const versionEntry =
    versionEntryId ? entries.find((entry) => entry.id === versionEntryId) ?? null : null;

  const versionRows = useMemo(() => {
    if (!versionEntry) return [];
    return [
      {
        key: buildSnapshotKey(versionEntry.id, null),
        label: "Current saved version",
        meta: formatDate(versionEntry.updatedAt),
        revision: null as SavedViewerRevision | null,
      },
      ...versionEntry.revisions.map((revision, index) => ({
        key: buildSnapshotKey(versionEntry.id, revision.id),
        label: `Previous version ${index + 1}`,
        meta: formatDate(revision.savedAt),
        revision,
      })),
    ];
  }, [versionEntry]);

  const selectedVersion = useMemo(() => {
    if (!versionEntry || !selectedVersionKey) return null;
    const currentKey = buildSnapshotKey(versionEntry.id, null);
    if (selectedVersionKey === currentKey) return null;
    const revisionId = selectedVersionKey.slice(versionEntry.id.length + 1);
    return versionEntry.revisions.find((revision) => revision.id === revisionId) ?? null;
  }, [selectedVersionKey, versionEntry]);

  useEffect(() => {
    if (!open) {
      setSelectedEntryIds([]);
      setSelectionAnchorId(null);
      setSaveDraft("");
      setMenuEntryId(null);
      setMenuPosition(null);
      setRenamingEntryId(null);
      setRenameDraft("");
      setVersionEntryId(null);
      setSelectedVersionKey(null);
      setPendingDeleteEntryIds(null);
      return;
    }

    if (mode === "save") {
      const timeoutId = window.setTimeout(() => {
        saveInputRef.current?.focus();
        saveInputRef.current?.select();
      }, 0);
      return () => window.clearTimeout(timeoutId);
    }

    if (selectedEntryIds.length) return;

    if (activeSavedViewerId && entries.some((entry) => entry.id === activeSavedViewerId)) {
      setSelectedEntryIds([activeSavedViewerId]);
      setSelectionAnchorId(activeSavedViewerId);
    }
  }, [activeSavedViewerId, entries, mode, open, selectedEntryIds.length]);

  useEffect(() => {
    setSelectedEntryIds((prev) => prev.filter((entryId) => entries.some((entry) => entry.id === entryId)));
    setSelectionAnchorId((prev) => (prev && entries.some((entry) => entry.id === prev) ? prev : null));
    setMenuEntryId((prev) => (prev && entries.some((entry) => entry.id === prev) ? prev : null));
    setVersionEntryId((prev) => (prev && entries.some((entry) => entry.id === prev) ? prev : null));
    setRenamingEntryId((prev) => (prev && entries.some((entry) => entry.id === prev) ? prev : null));
  }, [entries]);

  useEffect(() => {
    if (!versionEntry) {
      setSelectedVersionKey(null);
      return;
    }

    const currentKey = buildSnapshotKey(versionEntry.id, null);
    const isStillValid =
      selectedVersionKey === currentKey ||
      versionEntry.revisions.some((revision) => buildSnapshotKey(versionEntry.id, revision.id) === selectedVersionKey);

    if (!isStillValid) {
      setSelectedVersionKey(currentKey);
    }
  }, [selectedVersionKey, versionEntry]);

  useEffect(() => {
    if (!menuEntryId) return;

    function handlePointerDown(event: PointerEvent) {
      const target = event.target as HTMLElement | null;
      if (!target) return;
      if (target.closest("[data-viewer-library-menu='true']")) return;
      setMenuEntryId(null);
      setMenuPosition(null);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setMenuEntryId(null);
        setMenuPosition(null);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [menuEntryId]);

  useEffect(() => {
    if (!renamingEntryId) return;
    const timeoutId = window.setTimeout(() => {
      renameInputRef.current?.focus();
      renameInputRef.current?.select();
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [renamingEntryId]);

  function selectEntryRange(targetEntryId: string, keepExistingSelection: boolean) {
    const anchorId = selectionAnchorId ?? targetEntryId;
    const anchorIndex = entries.findIndex((entry) => entry.id === anchorId);
    const targetIndex = entries.findIndex((entry) => entry.id === targetEntryId);
    if (anchorIndex < 0 || targetIndex < 0) {
      setSelectedEntryIds([targetEntryId]);
      setSelectionAnchorId(targetEntryId);
      return;
    }

    const start = Math.min(anchorIndex, targetIndex);
    const end = Math.max(anchorIndex, targetIndex);
    const rangeIds = entries.slice(start, end + 1).map((entry) => entry.id);

    setSelectedEntryIds((prev) => {
      if (!keepExistingSelection) return rangeIds;
      return Array.from(new Set([...prev, ...rangeIds]));
    });
  }

  function handleEntrySelect(entryId: string, modifiers: { shiftKey: boolean; ctrlKey: boolean; metaKey: boolean }) {
    const keepExistingSelection = modifiers.ctrlKey || modifiers.metaKey;
    const useRangeSelection = modifiers.shiftKey;

    if (useRangeSelection) {
      selectEntryRange(entryId, keepExistingSelection);
      return;
    }

    if (keepExistingSelection) {
      setSelectedEntryIds((prev) =>
        prev.includes(entryId) ? prev.filter((value) => value !== entryId) : [...prev, entryId]
      );
      setSelectionAnchorId(entryId);
      return;
    }

    setSelectedEntryIds([entryId]);
    setSelectionAnchorId(entryId);
  }

  function handleOpenSelectedEntry() {
    if (!selectedSingleEntry) return;
    onOpenViewer(selectedSingleEntry, null);
  }

  function handleCreateSavedViewer() {
    const nextName = saveDraft.trim() || saveNamePlaceholder;
    onSaveNewViewer(nextName);
    setSaveDraft("");
  }

  function startRename(entry: SavedViewerEntry) {
    setRenamingEntryId(entry.id);
    setRenameDraft(entry.name);
    setMenuEntryId(null);
    setMenuPosition(null);
  }

  function commitRename() {
    if (!renamingEntryId) return;
    const trimmed = renameDraft.trim();
    if (!trimmed) {
      setRenamingEntryId(null);
      setRenameDraft("");
      return;
    }
    onRenameViewer(renamingEntryId, trimmed);
    setRenamingEntryId(null);
    setRenameDraft("");
  }

  function openVersionDialog(entry: SavedViewerEntry) {
    setVersionEntryId(entry.id);
    setSelectedVersionKey(buildSnapshotKey(entry.id, null));
    setMenuEntryId(null);
    setMenuPosition(null);
  }

  function closeVersionDialog() {
    setVersionEntryId(null);
    setSelectedVersionKey(null);
  }

  function handleDeleteEntry(entry: SavedViewerEntry) {
    setMenuEntryId(null);
    setMenuPosition(null);
    setPendingDeleteEntryIds([entry.id]);
  }

  function requestDeleteSelectedEntries() {
    if (!selectedEntryIds.length) return;
    setPendingDeleteEntryIds(selectedEntryIds);
  }

  function confirmDeleteEntries() {
    if (!pendingDeleteEntryIds?.length) return;
    onDeleteViewers(pendingDeleteEntryIds);
    setSelectedEntryIds((prev) => prev.filter((id) => !pendingDeleteEntryIds.includes(id)));
    if (versionEntryId && pendingDeleteEntryIds.includes(versionEntryId)) {
      closeVersionDialog();
    }
    setPendingDeleteEntryIds(null);
  }

  if (!open) return null;

  return (
    <div
      onClick={onClose}
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 40,
        background: "rgba(0,0,0,0.52)",
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
          width: "min(1120px, calc(100vw - 32px))",
          maxHeight: "min(88vh, 920px)",
          borderRadius: 24,
          border: "1px solid rgba(255,255,255,0.10)",
          background: "rgba(12,14,18,0.97)",
          color: "white",
          fontFamily: "sans-serif",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 18,
            padding: "18px 18px 16px 18px",
            borderBottom: "1px solid rgba(255,255,255,0.08)",
            flexShrink: 0,
          }}
        >
          <div style={{ minWidth: 0, flex: "1 1 auto" }}>
            <div style={{ fontSize: 18, fontWeight: 800 }}>Saved Viewers</div>
            <div style={{ fontSize: 12, opacity: 0.72, marginTop: 4 }}>
              Click to select. Hold `Ctrl` and click to add or remove viewers. Hold `Shift` and click to select a range.
            </div>
            {selectedEntryIds.length ? (
              <div style={{ fontSize: 12, opacity: 0.86, marginTop: 8 }}>
                {selectedEntryIds.length} viewer{selectedEntryIds.length === 1 ? "" : "s"} selected
              </div>
            ) : null}
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "flex-end", gap: 10 }}>
            {selectedSingleEntry ? (
              <PrimaryButton onClick={handleOpenSelectedEntry}>Open Selected</PrimaryButton>
            ) : null}
            <SecondaryButton
              onClick={() => {
                setSaveDraft("");
                onSetMode("save");
              }}
            >
              Save As New
            </SecondaryButton>
            {selectedEntryIds.length > 1 ? (
              <SecondaryButton onClick={requestDeleteSelectedEntries}>
                Delete Selected
              </SecondaryButton>
            ) : null}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close saved viewers"
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
              x
            </button>
          </div>
        </div>

        <div
          data-viewer-library-scroll="true"
          style={{
            overflowY: "auto",
            padding: 18,
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

          <div
            aria-hidden={mode !== "save"}
            style={{
              marginBottom: mode === "save" ? 16 : 0,
              maxHeight: mode === "save" ? 220 : 0,
              opacity: mode === "save" ? 1 : 0,
              transform: mode === "save" ? "translateY(0)" : "translateY(-10px)",
              overflow: "hidden",
              pointerEvents: mode === "save" ? "auto" : "none",
              transition: "max-height 220ms ease, opacity 180ms ease, transform 220ms ease, margin-bottom 220ms ease",
            }}
          >
            <div
              style={{
                borderRadius: 18,
                border: "1px solid rgba(120,190,255,0.22)",
                background: "rgba(120,190,255,0.08)",
                padding: 16,
                display: "grid",
                gap: 12,
              }}
            >
              <div>
                <div style={{ fontSize: 14, fontWeight: 800 }}>Save current viewer as a new saved slot</div>
                <div style={{ fontSize: 12, opacity: 0.76, marginTop: 4 }}>
                  This creates a new saved viewer. Future `Ctrl+S` presses will update that slot.
                </div>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                <input
                  ref={saveInputRef}
                  value={saveDraft}
                  onChange={(event) => setSaveDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      handleCreateSavedViewer();
                    }
                    if (event.key === "Escape") {
                      setSaveDraft("");
                      onSetMode("browse");
                    }
                  }}
                  placeholder={saveNamePlaceholder}
                  style={{
                    flex: "1 1 260px",
                    minWidth: 220,
                    height: 40,
                    borderRadius: 12,
                    border: "1px solid rgba(120,190,255,0.34)",
                    background: "rgba(0,0,0,0.22)",
                    color: "white",
                    padding: "0 12px",
                    outline: "none",
                    boxSizing: "border-box",
                  }}
                />
                <PrimaryButton onClick={handleCreateSavedViewer}>Save Viewer</PrimaryButton>
                <SecondaryButton
                  onClick={() => {
                    setSaveDraft("");
                    onSetMode("browse");
                  }}
                >
                  Cancel
                </SecondaryButton>
              </div>
            </div>
          </div>

          {errorMessage ? (
            <div
              style={{
                color: "#ffb4b4",
                fontSize: 12,
                marginBottom: 12,
                borderRadius: 12,
                border: "1px solid rgba(255,120,120,0.22)",
                background: "rgba(255,120,120,0.08)",
                padding: "10px 12px",
              }}
            >
              {errorMessage}
            </div>
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
                  isSelected={selectedEntryIds.includes(entry.id)}
                  isActiveSaveTarget={activeSavedViewerId === entry.id}
                  isRenaming={renamingEntryId === entry.id}
                  renameDraft={renameDraft}
                  renameInputRef={renameInputRef}
                  onSelect={(modifiers) => handleEntrySelect(entry.id, modifiers)}
                  onOpen={() => onOpenViewer(entry, null)}
                  onOpenMenu={(rect) => {
                    setMenuEntryId(entry.id);
                    setMenuPosition({ top: rect.bottom + 8, left: rect.right - 12 });
                  }}
                  onRenameDraftChange={setRenameDraft}
                  onRenameCommit={commitRename}
                  onRenameCancel={() => {
                    setRenamingEntryId(null);
                    setRenameDraft("");
                  }}
                />
              ))}
            </div>
          ) : (
            <div
              data-theme-surface="soft"
              style={{
                minHeight: 120,
                borderRadius: 16,
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

      {menuEntryId && menuPosition
        ? createPortal(
            <div
              data-viewer-library-menu="true"
              data-theme-surface="panel"
              onClick={(event) => event.stopPropagation()}
              style={{
                position: "fixed",
                top: menuPosition.top,
                left: menuPosition.left,
                width: "fit-content",
                background: "rgba(14,17,22,0.98)",
                border: "1px solid rgba(255,255,255,0.10)",
                borderRadius: 12,
                padding: 6,
                zIndex: 9999,
                transform: "translateX(-100%)",
              }}
            >
              {(() => {
                const entry = entries.find((item) => item.id === menuEntryId);
                if (!entry) return null;

                const menuItemStyle = {
                  width: "auto",
                  display: "block",
                  height: 36,
                  borderRadius: 8,
                  border: "none",
                  background: "transparent",
                  color: "white",
                  cursor: "pointer",
                  textAlign: "left" as const,
                  padding: "0 10px",
                  fontSize: 12,
                  fontWeight: 600,
                  whiteSpace: "nowrap" as const,
                  fontFamily: "sans-serif",
                };

                return (
                  <>
                    <button type="button" onClick={() => startRename(entry)} style={menuItemStyle}>
                      Rename
                    </button>
                    <button type="button" onClick={() => openVersionDialog(entry)} style={menuItemStyle}>
                      View more versions
                    </button>
                    <button type="button" onClick={() => handleDeleteEntry(entry)} style={menuItemStyle}>
                      Delete
                    </button>
                  </>
                );
              })()}
            </div>,
            document.body
          )
        : null}

      {versionEntry
        ? createPortal(
            <div
              onClick={closeVersionDialog}
              style={{
                position: "fixed",
                inset: 0,
                background: "rgba(0,0,0,0.42)",
                zIndex: 10000,
                display: "grid",
                placeItems: "center",
                padding: 20,
              }}
            >
              <div
                data-theme-surface="panel"
                onClick={(event) => event.stopPropagation()}
                style={{
                  width: "min(560px, calc(100vw - 32px))",
                  maxHeight: "min(80vh, 720px)",
                  borderRadius: 20,
                  border: "1px solid rgba(255,255,255,0.10)",
                  background: "rgba(14,17,22,0.98)",
                  padding: 18,
                  display: "flex",
                  flexDirection: "column",
                  gap: 14,
                  color: "white",
                  fontFamily: "sans-serif",
                }}
              >
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 14 }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 16, fontWeight: 800, lineHeight: 1.3, color: "white", fontFamily: "sans-serif" }}>{versionEntry.name}</div>
                    <div style={{ fontSize: 12, opacity: 0.72, marginTop: 4, color: "rgba(255,255,255,0.78)", fontFamily: "sans-serif" }}>
                      {versionEntry.revisions.length
                        ? `Current saved version plus ${versionEntry.revisions.length} previous version${versionEntry.revisions.length === 1 ? "" : "s"}.`
                        : "Only the current saved version is available right now."}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={closeVersionDialog}
                    aria-label="Close version history"
                    style={{
                      width: 34,
                      height: 34,
                      borderRadius: 10,
                      border: "1px solid rgba(255,255,255,0.10)",
                      background: "rgba(255,255,255,0.04)",
                      color: "white",
                      cursor: "pointer",
                      fontSize: 18,
                      flexShrink: 0,
                    }}
                  >
                    x
                  </button>
                </div>

                <div
                  style={{
                    overflowY: "auto",
                    display: "grid",
                    gap: 8,
                    paddingRight: 2,
                  }}
                >
                  {versionRows.map((row) => (
                    <button
                      key={row.key}
                      type="button"
                      onClick={() => setSelectedVersionKey(row.key)}
                      style={{
                        borderRadius: 14,
                        border: row.key === selectedVersionKey
                          ? "1px solid rgba(120,190,255,0.62)"
                          : "1px solid rgba(255,255,255,0.08)",
                        background: row.key === selectedVersionKey ? "rgba(120,190,255,0.10)" : "rgba(255,255,255,0.03)",
                        color: "white",
                        textAlign: "left",
                        padding: "12px 14px",
                        cursor: "pointer",
                        fontFamily: "sans-serif",
                      }}
                    >
                      <div style={{ fontSize: 13, fontWeight: 700, color: "white", fontFamily: "sans-serif" }}>{row.label}</div>
                      <div style={{ fontSize: 11, opacity: 0.72, marginTop: 4, color: "rgba(255,255,255,0.78)", fontFamily: "sans-serif" }}>{row.meta}</div>
                    </button>
                  ))}
                </div>

                <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
                  <PrimaryButton onClick={() => onOpenViewer(versionEntry, selectedVersion)}>
                    Open Selected Version
                  </PrimaryButton>
                </div>
              </div>
            </div>,
            document.body
          )
        : null}

      {pendingDeleteEntryIds?.length
        ? createPortal(
            <div
              onClick={() => setPendingDeleteEntryIds(null)}
              style={{
                position: "fixed",
                inset: 0,
                background: "rgba(0,0,0,0.42)",
                zIndex: 10000,
                display: "grid",
                placeItems: "center",
                padding: 20,
              }}
            >
              <div
                data-theme-surface="panel"
                onClick={(event) => event.stopPropagation()}
                style={{
                  width: "min(420px, calc(100vw - 32px))",
                  borderRadius: 18,
                  border: "1px solid rgba(255,255,255,0.10)",
                  background: "rgba(14,17,22,0.98)",
                  padding: 18,
                  display: "grid",
                  gap: 14,
                  color: "white",
                  fontFamily: "sans-serif",
                }}
              >
                <div>
                  <div style={{ fontSize: 16, fontWeight: 800 }}>Delete saved viewer{pendingDeleteEntryIds.length === 1 ? "" : "s"}?</div>
                  <div style={{ fontSize: 12, opacity: 0.76, marginTop: 4 }}>
                    {pendingDeleteEntryIds.length === 1
                      ? "This saved viewer will be removed from this browser."
                      : `${pendingDeleteEntryIds.length} saved viewers will be removed from this browser.`}
                  </div>
                </div>
                <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
                  <SecondaryButton onClick={() => setPendingDeleteEntryIds(null)}>Cancel</SecondaryButton>
                  <PrimaryButton onClick={confirmDeleteEntries}>Delete</PrimaryButton>
                </div>
              </div>
            </div>,
            document.body
          )
        : null}
    </div>
  );
}
