import { useEffect, useMemo, useState } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";
import { deleteLocalDatasetRecord, listLocalDatasetRecords, renameLocalDatasetRecord, type StoredLocalDatasetRecord } from "./localDataStore";

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value >= 10 || unitIndex === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[unitIndex]}`;
}

function formatDate(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Unknown";
  return date.toLocaleString();
}

function kindLabel(record: StoredLocalDatasetRecord) {
  return record.kind === "tree" ? "Folder dataset" : "Single file";
}

function isToggleModifierPressed(event: ReactMouseEvent) {
  return event.ctrlKey || event.metaKey;
}

export default function LocalDatasetManagerPanel({
  open,
  onClose,
  onRenameDataset,
  onDeleteDataset,
}: {
  open: boolean;
  onClose: () => void;
  onRenameDataset?: (datasetId: string, nextName: string) => Promise<void> | void;
  onDeleteDataset?: (datasetId: string) => Promise<void> | void;
}) {
  const [records, setRecords] = useState<StoredLocalDatasetRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [selectionAnchorId, setSelectionAnchorId] = useState<string | null>(null);
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const nextRecords = await listLocalDatasetRecords();
      setRecords(nextRecords);
      setSelectedIds((prev) => prev.filter((id) => nextRecords.some((record) => record.id === id)));
      setSelectionAnchorId((prev) => (prev && nextRecords.some((record) => record.id === prev) ? prev : null));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load local datasets.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!open) return;
    void refresh();
  }, [open]);

  useEffect(() => {
    if (!open) {
      setSelectedIds([]);
      setSelectionAnchorId(null);
      setConfirmBulkDelete(false);
      setDeletingId(null);
      setRenamingId(null);
      setRenameDraft("");
      setMessage(null);
      setError(null);
    }
  }, [open]);

  const totalBytes = useMemo(() => records.reduce((sum, record) => sum + record.size, 0), [records]);
  const selectedCount = selectedIds.length;
  const selectedBytes = useMemo(
    () => records.filter((record) => selectedIds.includes(record.id)).reduce((sum, record) => sum + record.size, 0),
    [records, selectedIds]
  );

  function handleSelectRecord(recordId: string, event: ReactMouseEvent<HTMLDivElement>) {
    if (renamingId || deletingId) return;
    setMessage(null);
    setError(null);
    setConfirmBulkDelete(false);

    const recordIndex = records.findIndex((record) => record.id === recordId);
    if (recordIndex < 0) return;

    const toggleModifier = isToggleModifierPressed(event);
    const shiftModifier = event.shiftKey;

    setSelectedIds((prev) => {
      if (shiftModifier) {
        const anchorId = selectionAnchorId ?? prev[0] ?? recordId;
        const anchorIndex = records.findIndex((record) => record.id === anchorId);
        const start = Math.min(anchorIndex >= 0 ? anchorIndex : recordIndex, recordIndex);
        const end = Math.max(anchorIndex >= 0 ? anchorIndex : recordIndex, recordIndex);
        const rangeIds = records.slice(start, end + 1).map((record) => record.id);

        if (toggleModifier) {
          const next = new Set(prev);
          for (const id of rangeIds) {
            if (next.has(id)) next.delete(id);
            else next.add(id);
          }
          return records.map((record) => record.id).filter((id) => next.has(id));
        }

        return rangeIds;
      }

      if (toggleModifier) {
        if (prev.includes(recordId)) {
          return prev.filter((id) => id !== recordId);
        }
        return [...prev, recordId];
      }

      return [recordId];
    });

    setSelectionAnchorId(recordId);
  }

  async function handleDeleteMany(datasetIds: string[]) {
    if (!datasetIds.length) return;
    setError(null);
    setMessage(null);

    const failed: string[] = [];
    for (const datasetId of datasetIds) {
      try {
        if (onDeleteDataset) {
          await onDeleteDataset(datasetId);
        } else {
          await deleteLocalDatasetRecord(datasetId);
        }
      } catch (err) {
        failed.push(err instanceof Error ? err.message : `Failed to delete dataset ${datasetId}.`);
      }
    }

    if (failed.length) {
      setError(failed[0]);
    } else {
      setMessage(datasetIds.length === 1 ? "Dataset removed." : `${datasetIds.length} datasets removed.`);
    }

    setDeletingId(null);
    setConfirmBulkDelete(false);
    await refresh();
  }

  if (!open) return null;

  return (
    <div
      onClick={onClose}
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 48,
        background: "rgba(0,0,0,0.45)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        userSelect: "none",
        WebkitUserSelect: "none",
      }}
    >
      <div
        data-theme-surface="panel"
        onClick={(event) => event.stopPropagation()}
        onMouseDown={(event) => {
          if ((event.target as HTMLElement).tagName !== "INPUT" && (event.target as HTMLElement).tagName !== "TEXTAREA") {
            event.preventDefault();
          }
        }}
        style={{
          width: "min(860px, calc(100vw - 32px))",
          height: "min(82vh, 760px)",
          borderRadius: 20,
          border: "1px solid rgba(255,255,255,0.10)",
          background: "rgba(12,14,18,0.96)",
          backdropFilter: "blur(14px)",
          boxShadow: "0 24px 60px rgba(0,0,0,0.45)",
          color: "white",
          fontFamily: "sans-serif",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          padding: 18,
          gap: 14,
          userSelect: "none",
          WebkitUserSelect: "none",
        }}
      >
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16 }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 800 }}>Local dataset manager</div>
            <div data-theme-text="muted" style={{ fontSize: 13, opacity: 0.72, marginTop: 6 }}>
              Manage datasets stored only in this browser. Use Ctrl/Cmd-click and Shift-click to select multiple datasets quickly.
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{ width: 36, height: 36, borderRadius: 10, border: "1px solid rgba(255,255,255,0.10)", background: "rgba(255,255,255,0.04)", color: "white", cursor: "pointer", fontSize: 18 }}
          >
            ×
          </button>
        </div>

        <div data-theme-surface="soft" style={{ borderRadius: 14, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.04)", padding: 12, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap", fontSize: 12 }}>
            <div><strong>{records.length}</strong> dataset{records.length === 1 ? "" : "s"}</div>
            <div><strong>{formatBytes(totalBytes)}</strong> stored locally</div>
            {selectedCount > 0 ? <div><strong>{selectedCount}</strong> selected · <strong>{formatBytes(selectedBytes)}</strong></div> : null}
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {selectedCount > 0 ? (
              <>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedIds([]);
                    setSelectionAnchorId(null);
                    setConfirmBulkDelete(false);
                  }}
                  style={{ height: 34, padding: "0 12px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.10)", background: "rgba(255,255,255,0.05)", color: "white", cursor: "pointer", fontSize: 12, fontWeight: 700 }}
                >
                  Clear selection
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    if (!confirmBulkDelete) {
                      setConfirmBulkDelete(true);
                      return;
                    }
                    await handleDeleteMany(selectedIds);
                    setSelectedIds([]);
                    setSelectionAnchorId(null);
                  }}
                  style={{ height: 34, padding: "0 12px", borderRadius: 10, border: confirmBulkDelete ? "1px solid rgba(255,120,120,0.35)" : "1px solid rgba(255,255,255,0.10)", background: confirmBulkDelete ? "rgba(255,80,80,0.12)" : "rgba(255,255,255,0.05)", color: "white", cursor: "pointer", fontSize: 12, fontWeight: 700 }}
                >
                  {confirmBulkDelete ? `Confirm delete (${selectedCount})` : `Delete selected (${selectedCount})`}
                </button>
              </>
            ) : null}
            <button type="button" onClick={() => void refresh()} style={{ height: 34, padding: "0 12px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.10)", background: "rgba(255,255,255,0.05)", color: "white", cursor: "pointer", fontSize: 12, fontWeight: 700 }}>Refresh</button>
          </div>
        </div>

        {message ? <div style={{ borderRadius: 10, border: "1px solid rgba(120,220,150,0.24)", background: "rgba(70,180,100,0.12)", color: "#d7ffe2", padding: "10px 12px", fontSize: 12 }}>{message}</div> : null}
        {error ? <div style={{ borderRadius: 10, border: "1px solid rgba(255,120,120,0.22)", background: "rgba(255,80,80,0.08)", color: "#ffd0d0", padding: "10px 12px", fontSize: 12 }}>{error}</div> : null}

        <div className="layer-panel-scroll" style={{ flex: 1, minHeight: 0, display: "grid", gridAutoRows: "max-content", alignContent: "start", gap: 10, paddingRight: 4 }}>
          {!loading && records.length === 0 ? (
            <div data-theme-surface="soft" style={{ minHeight: 160, borderRadius: 14, border: "1px dashed rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.02)", display: "flex", alignItems: "center", justifyContent: "center", textAlign: "center", padding: 20, color: "rgba(255,255,255,0.72)", fontSize: 13 }}>
              No local datasets are stored in this browser yet.
            </div>
          ) : null}

          {records.map((record) => {
            const isRenaming = renamingId === record.id;
            const isDeleting = deletingId === record.id;
            const isSelected = selectedIds.includes(record.id);
            const entryCount = record.kind === "tree" ? (record.entries?.length ?? 0) : 1;
            const metadataParts = [
              `Created: ${formatDate(record.createdAt)}`,
              `Updated: ${formatDate(record.updatedAt)}`,
              record.mimeType ? `MIME type: ${record.mimeType}` : null,
            ].filter(Boolean) as string[];
            return (
              <div
                key={record.id}
                data-theme-surface="soft"
                onClick={(event) => handleSelectRecord(record.id, event)}
                style={{
                  borderRadius: 14,
                  border: isSelected ? "1px solid rgba(160,220,255,0.85)" : "1px solid rgba(255,255,255,0.08)",
                  background: isSelected ? "rgba(120,190,255,0.12)" : "rgba(255,255,255,0.04)",
                  padding: 14,
                  display: "grid",
                  gap: 10,
                  cursor: renamingId || deletingId ? "default" : "pointer",
                  boxShadow: isSelected ? "inset 0 0 0 1px rgba(255,255,255,0.06)" : "none",
                  transition: "border-color 160ms ease, background 160ms ease, box-shadow 160ms ease",
                  userSelect: "none",
                  WebkitUserSelect: "none",
                }}
              >
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
                  <div style={{ minWidth: 0, flex: 1, display: "flex", gap: 10, alignItems: "flex-start" }}>
                    <div style={{ width: 18, height: 18, borderRadius: 999, border: isSelected ? "1px solid rgba(160,220,255,0.95)" : "1px solid rgba(255,255,255,0.24)", background: isSelected ? "rgba(92,149,230,0.92)" : "transparent", flexShrink: 0, marginTop: 2 }} />
                    <div style={{ minWidth: 0, flex: 1 }}>
                      {isRenaming ? (
                        <input
                          autoFocus
                          value={renameDraft}
                          onChange={(event) => setRenameDraft(event.target.value)}
                          onClick={(event) => event.stopPropagation()}
                          onMouseDown={(event) => event.stopPropagation()}
                          style={{ width: "100%", height: 36, borderRadius: 10, border: "1px solid rgba(160,220,255,0.35)", background: "rgba(255,255,255,0.06)", color: "white", padding: "0 10px", boxSizing: "border-box", outline: "none", userSelect: "text", WebkitUserSelect: "text" }}
                        />
                      ) : (
                        <div style={{ fontSize: 14, fontWeight: 700, lineHeight: 1.35, wordBreak: "break-word" }}>{record.fileName}</div>
                      )}
                      <div data-theme-text="muted" style={{ fontSize: 12, opacity: 0.72, marginTop: 6, display: "flex", gap: 10, flexWrap: "wrap" }}>
                        <span>{kindLabel(record)}</span>
                        <span>{formatBytes(record.size)}</span>
                        <span>{entryCount} item{entryCount === 1 ? "" : "s"}</span>
                        {metadataParts.map((part) => (
                          <span key={part}>{part}</span>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 8, flexShrink: 0 }} onClick={(event) => event.stopPropagation()} onMouseDown={(event) => event.stopPropagation()}>
                    {isRenaming ? (
                      <>
                        <button type="button" onClick={async () => {
                          const nextName = renameDraft.trim();
                          if (!nextName) return;
                          setError(null);
                          try {
                            if (onRenameDataset) {
                              await onRenameDataset(record.id, nextName);
                            } else {
                              await renameLocalDatasetRecord(record.id, nextName);
                            }
                            setMessage("Dataset renamed.");
                            setRenamingId(null);
                            setRenameDraft("");
                            await refresh();
                          } catch (err) {
                            setError(err instanceof Error ? err.message : "Failed to rename dataset.");
                          }
                        }} style={{ height: 34, padding: "0 12px", borderRadius: 10, border: "1px solid rgba(160,220,255,0.35)", background: "rgba(120,190,255,0.18)", color: "white", cursor: "pointer", fontSize: 12, fontWeight: 700 }}>Save</button>
                        <button type="button" onClick={() => { setRenamingId(null); setRenameDraft(""); }} style={{ height: 34, padding: "0 12px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.10)", background: "rgba(255,255,255,0.05)", color: "white", cursor: "pointer", fontSize: 12, fontWeight: 700 }}>Cancel</button>
                      </>
                    ) : (
                      <>
                        <button type="button" onClick={() => { setRenamingId(record.id); setRenameDraft(record.fileName); setMessage(null); setConfirmBulkDelete(false); }} style={{ height: 34, padding: "0 12px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.10)", background: "rgba(255,255,255,0.05)", color: "white", cursor: "pointer", fontSize: 12, fontWeight: 700 }}>Rename</button>
                        <button type="button" onClick={async () => {
                          if (!isDeleting) {
                            setDeletingId(record.id);
                            setConfirmBulkDelete(false);
                            return;
                          }
                          await handleDeleteMany([record.id]);
                        }} style={{ height: 34, padding: "0 12px", borderRadius: 10, border: isDeleting ? "1px solid rgba(255,120,120,0.35)" : "1px solid rgba(255,255,255,0.10)", background: isDeleting ? "rgba(255,80,80,0.12)" : "rgba(255,255,255,0.05)", color: "white", cursor: "pointer", fontSize: 12, fontWeight: 700 }}>{isDeleting ? "Confirm delete" : "Delete"}</button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
