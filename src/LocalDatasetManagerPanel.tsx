import { useEffect, useMemo, useRef, useState } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";
import { createPortal } from "react-dom";
import { zipSync } from "fflate";
import type { TaskNotice } from "./components/app/SaveToastStack";
import {
  deleteCustomExternalSource,
  getCustomExternalSources,
  renameCustomExternalSource,
  updateCustomExternalSource,
  type CustomExternalSource,
} from "./customSourceStore";
import { collectAllLayerItems, type LayerTreeNode } from "./layerTypes";
import {
  deleteLocalDatasetRecord,
  getLocalDatasetRecord,
  listLocalDatasetRecords,
  renameLocalDatasetRecord,
  type StoredLocalDatasetRecord,
} from "./localDataStore";
import { inspectStoredLocalDatasetById, type LocalImportCandidate } from "./localDataHandlers";
import { disposeLocalDataLoadWorker, loadLocalBrowserVolumeInWorker } from "./localDataLoadWorkerClient";
import { loadVolumeAtResolution, probeOmeZarrSource } from "./omeZarr";
import type { SavedViewerEntry } from "./viewerLibrary";
import { buildExportFileName, canExportVolumeAsNrrd, createChunkedLocalZarrVolumeExportBlob, createLocalVolumeZarrExportBlob, createNiftiExportBlob, createNrrdExportBlob, createRemoteOmeZarrZipBlob } from "./exportConverters";
import { buildExportSourceFromLoadedVolume, buildExportSourceFromLocalRecord } from "./exportModel";

type SourceManagerItem =
  | {
      id: string;
      sourceType: "local";
      name: string;
      updatedAt: string;
      createdAt: string;
      size: number;
      details: string;
      subtitle: string;
      deletable: true;
      renamable: true;
      record: StoredLocalDatasetRecord;
    }
  | {
      id: string;
      sourceType: "external";
      name: string;
      updatedAt: string;
      createdAt: string;
      size: 0;
      details: string;
      subtitle: string;
      deletable: true;
      renamable: true;
      source: CustomExternalSource;
    };

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

function getResolutionLabel(resolution?: string | null): string {
  if (!resolution) return "";
  return resolution.replace("um", " µm");
}

function formatVoxelSizeValue(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "?";
  return (Math.round(value * 100) / 100).toFixed(2);
}

function formatProviderLabel(provider: CustomExternalSource["provider"]): string {
  if (provider === "gcs") return "Google Cloud Storage";
  if (provider === "s3") return "Amazon S3";
  if (provider === "azure") return "Azure Blob Storage";
  if (provider === "generic_http") return "Public web host";
  return "External host";
}

function inferProvider(url: string): CustomExternalSource["provider"] {
  const lower = url.trim().toLowerCase();
  if (!lower) return "unknown";
  if (lower.includes("storage.googleapis.com") || lower.includes(".storage.googleapis.com")) return "gcs";
  if (lower.includes("amazonaws.com") || lower.includes(".s3.")) return "s3";
  if (lower.includes("blob.core.windows.net")) return "azure";
  if (lower.startsWith("http://") || lower.startsWith("https://")) return "generic_http";
  return "unknown";
}

function isToggleModifierPressed(event: ReactMouseEvent) {
  return event.ctrlKey || event.metaKey;
}

function MoreVertical() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <circle cx="12" cy="5" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="12" cy="19" r="1.2" fill="currentColor" stroke="none" />
    </svg>
  );
}

function DataIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <ellipse cx="12" cy="5" rx="7" ry="3" />
      <path d="M5 5v6c0 1.7 3.1 3 7 3s7-1.3 7-3V5" />
      <path d="M5 11v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6" />
    </svg>
  );
}

function ChainIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 13a5 5 0 0 0 7.07 0l2.83-2.83a5 5 0 0 0-7.07-7.07L11.5 4.43" />
      <path d="M14 11a5 5 0 0 0-7.07 0L4.1 13.83a5 5 0 0 0 7.07 7.07l1.33-1.33" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-3.5-3.5" />
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

function BackArrowIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M15 18l-6-6 6-6" />
    </svg>
  );
}

function ExportIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 4v11" />
      <path d="M8 11l4 4 4-4" />
      <path d="M5 19h14" />
    </svg>
  );
}

function ChevronDownIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

function SpinnerIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ animation: "source-manager-spin 0.9s linear infinite" }}>
      <path d="M21 12a9 9 0 1 1-2.64-6.36" />
    </svg>
  );
}

function StopIcon() {
  return (
    <span
      aria-hidden="true"
      style={{
        width: 10,
        height: 10,
        borderRadius: 2,
        background: "currentColor",
        display: "inline-block",
      }}
    />
  );
}

function ActivityNoticeIcon() {
  return (
    <span
      aria-hidden="true"
      style={{
        width: 18,
        height: 18,
        borderRadius: 999,
        border: "1px solid rgba(255,215,120,0.38)",
        background: "rgba(255,215,120,0.16)",
        color: "#ffe7a8",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 12,
        fontWeight: 900,
      }}
    >
      !
    </span>
  );
}

type ViewerUsageMatch = {
  viewerName: string;
  layerNames: string[];
};

type DeleteUsageSummary = {
  breakingCurrentViewerMatches: string[];
  breakingSavedViewerMatches: ViewerUsageMatch[];
  nonBreakingCurrentViewerMatches: string[];
  nonBreakingSavedViewerMatches: ViewerUsageMatch[];
};

type SourceDetailInspectionState = {
  status: "idle" | "loading" | "ready" | "error";
  candidate?: LocalImportCandidate | null;
  error?: string | null;
};

type SourceInspectionStatus = {
  status: "idle" | "loading" | "ready" | "error";
  error?: string | null;
};

type ExportActivityState = {
  id: string;
  sourceId: string;
  sourceName: string;
  label: string;
  status: "preparing" | "analyzing" | "packaging" | "downloading" | "success" | "error" | "cancelled";
  detail?: string | null;
  progress?: number | null;
  cancellable?: boolean;
};

function throwIfExportAborted(signal?: AbortSignal) {
  if (signal?.aborted) {
    throw new DOMException("Export canceled", "AbortError");
  }
}

function collectMatchingLayerNames(
  layerTree: LayerTreeNode[],
  predicate: (source: ReturnType<typeof collectAllLayerItems>[number]) => boolean
): string[] {
  return collectAllLayerItems(layerTree)
    .filter(predicate)
    .map((layer) => layer.name);
}

function buildDeleteUsageSummary(
  targets: SourceManagerItem[],
  activeLayerTree: LayerTreeNode[],
  savedViewers: SavedViewerEntry[]
): DeleteUsageSummary {
  const summary: DeleteUsageSummary = {
    breakingCurrentViewerMatches: [],
    breakingSavedViewerMatches: [],
    nonBreakingCurrentViewerMatches: [],
    nonBreakingSavedViewerMatches: [],
  };

  for (const item of targets) {
    if (item.sourceType === "local") {
      const currentMatches = collectMatchingLayerNames(
        activeLayerTree,
        (layer) =>
          layer.type === "file" &&
          layer.sourceKind === "custom-upload" &&
          typeof layer.source === "string" &&
          layer.source === item.id
      );
      summary.breakingCurrentViewerMatches.push(...currentMatches);

      for (const entry of savedViewers) {
        const matches = collectMatchingLayerNames(
          entry.state.scene.layerTree,
          (layer) =>
            layer.type === "file" &&
            layer.sourceKind === "custom-upload" &&
            typeof layer.source === "string" &&
            layer.source === item.id
        );
        if (matches.length) {
          summary.breakingSavedViewerMatches.push({ viewerName: entry.name, layerNames: matches });
        }
      }
      continue;
    }

    const sourceUrl = item.source.url.trim();
    const currentMatches = collectMatchingLayerNames(
      activeLayerTree,
      (layer) =>
        layer.sourceKind === "external" &&
        typeof layer.source === "string" &&
        layer.source.trim() === sourceUrl
    );
    summary.nonBreakingCurrentViewerMatches.push(...currentMatches);

    for (const entry of savedViewers) {
      const matches = collectMatchingLayerNames(
        entry.state.scene.layerTree,
        (layer) =>
          layer.sourceKind === "external" &&
          typeof layer.source === "string" &&
          layer.source.trim() === sourceUrl
      );
      if (matches.length) {
        summary.nonBreakingSavedViewerMatches.push({ viewerName: entry.name, layerNames: matches });
      }
    }
  }

  return summary;
}

function buildManagerItems(
  localRecords: StoredLocalDatasetRecord[],
  externalSources: CustomExternalSource[]
): SourceManagerItem[] {
  const localItems: SourceManagerItem[] = localRecords.map((record) => ({
    id: record.id,
    sourceType: "local",
    name: record.fileName,
    updatedAt: record.updatedAt,
    createdAt: record.createdAt,
    size: record.size,
    details: `${record.kind === "tree" ? "Browser dataset" : "Browser file"} · ${formatBytes(record.size)}`,
    subtitle: record.kind === "tree" ? "Imported personal data stored in this browser" : "Imported personal file stored in this browser",
    deletable: true,
    renamable: true,
    record,
  }));

  const externalItems: SourceManagerItem[] = externalSources.map((source) => ({
    id: source.id,
    sourceType: "external",
    name: source.name,
    updatedAt: source.updatedAt,
    createdAt: source.createdAt,
    size: 0,
    details: source.url,
    subtitle: source.provider === "gcs"
      ? "Custom external source · Google Cloud Storage"
      : source.provider === "s3"
      ? "Custom external source · Amazon S3"
      : source.provider === "azure"
      ? "Custom external source · Azure Blob Storage"
      : "Custom external source",
    deletable: true,
    renamable: true,
    source,
  }));

  return [...localItems, ...externalItems].sort((a, b) => {
    return new Date(b.updatedAt || b.createdAt).getTime() - new Date(a.updatedAt || a.createdAt).getTime();
  });
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function normalizeExportBaseName(name: string): string {
  const trimmed = name.trim();
  return trimmed || "dataset";
}

function ensureZipFileName(name: string): string {
  return /\.zip$/i.test(name) ? name : `${name}.zip`;
}

async function createLocalDatasetZipBlob(record: StoredLocalDatasetRecord, rootFolderName?: string): Promise<Blob> {
  const baseName = normalizeExportBaseName(rootFolderName ?? record.fileName);
  const files: Record<string, Uint8Array> = {};

  if (record.kind === "blob" && record.blob) {
    files[record.fileName] = new Uint8Array(await record.blob.arrayBuffer());
  } else if (record.kind === "tree" && record.entries?.length) {
    for (const entry of record.entries) {
      const relativePath = entry.path.replace(/^\/+/, "") || entry.fileName;
      const zipPath = relativePath.startsWith(`${baseName}/`) ? relativePath : `${baseName}/${relativePath}`;
      files[zipPath] = new Uint8Array(await entry.blob.arrayBuffer());
    }
  } else {
    throw new Error("This local dataset is missing from browser storage.");
  }

  const zipped = zipSync(files, { level: 0 });
  const zipBytes = new Uint8Array(zipped.byteLength);
  zipBytes.set(zipped);
  return new Blob([zipBytes.buffer], { type: "application/zip" });
}

function getStructuredArchiveRootName(fileName: string, format: "zarr" | "ome-zarr"): string {
  const baseName = normalizeExportBaseName(fileName);
  if (format === "ome-zarr") {
    if (/\.ome\.zarr$/i.test(baseName)) return baseName;
    if (/\.zarr$/i.test(baseName)) return baseName.replace(/\.zarr$/i, ".ome.zarr");
    return `${baseName}.ome.zarr`;
  }
  if (/\.zarr$/i.test(baseName)) return baseName;
  if (/\.ome\.zarr$/i.test(baseName)) return baseName.replace(/\.ome\.zarr$/i, ".zarr");
  return `${baseName}.zarr`;
}

function isExternalVolumeExportSupported(item: Extract<SourceManagerItem, { sourceType: "external" }>): boolean {
  return item.source.remoteFormat === "ome-zarr";
}

function getExternalExportScales(item: Extract<SourceManagerItem, { sourceType: "external" }>) {
  return [...(item.source.availableScales ?? [])].sort((a, b) => {
    const aResolution = a.resolutionUm ?? Number.POSITIVE_INFINITY;
    const bResolution = b.resolutionUm ?? Number.POSITIVE_INFINITY;
    return aResolution - bResolution;
  });
}

function classifyRemoteExportError(error: unknown): "cancelled" | "cors" | "size" | "network" | "unsupported" | "other" {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  if (error instanceof DOMException && error.name === "AbortError") return "cancelled";
  if (message.includes("abort")) return "cancelled";
  if (message.includes("cors") || message.includes("failed to fetch") || message.includes("could not read remote")) return "cors";
  if (message.includes("array buffer allocation failed") || message.includes("out of memory") || message.includes("memory") || message.includes("too large")) return "size";
  if (message.includes("remote host returned") || message.includes("network") || message.includes("fetch")) return "network";
  if (message.includes("supports") || message.includes("unsupported")) return "unsupported";
  return "other";
}

function formatRemoteExportError(error: unknown, attemptedScale?: string | null): string {
  const message = error instanceof Error ? error.message : "Failed to export this external data source.";
  const kind = classifyRemoteExportError(error);
  if (kind === "cancelled") return "Remote export canceled.";
  if (kind === "cors") return "The remote host blocked browser access to this source. Check that CORS allows metadata and chunk reads.";
  if (kind === "size") return attemptedScale ? `This source was too large to export at ${attemptedScale}. The browser will try a coarser scale when possible.` : "This remote source is too large for the browser to export at the requested fidelity.";
  if (kind === "network") return `The remote host did not provide all required files for export. ${message}`;
  if (kind === "unsupported") return message;
  return message;
}

function shouldTryCoarserScaleAfterError(error: unknown): boolean {
  const kind = classifyRemoteExportError(error);
  return kind === "size" || kind === "network";
}

export default function LocalDatasetManagerPanel({
  open,
  onClose,
  onRenameDataset,
  onDeleteDataset,
  activeLayerTree,
  savedViewers,
  onExportNoticeChange,
}: {
  open: boolean;
  onClose: () => void;
  onRenameDataset?: (datasetId: string, nextName: string) => Promise<void> | void;
  onDeleteDataset?: (datasetId: string) => Promise<void> | void;
  activeLayerTree: LayerTreeNode[];
  savedViewers: SavedViewerEntry[];
  onExportNoticeChange?: (notice: TaskNotice | null) => void;
}) {
  const [items, setItems] = useState<SourceManagerItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | "local" | "external">("all");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [selectionAnchorId, setSelectionAnchorId] = useState<string | null>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [openExportMenuId, setOpenExportMenuId] = useState<string | null>(null);
  const [storageQuotaBytes, setStorageQuotaBytes] = useState<number | null>(null);
  const [showSearch, setShowSearch] = useState(false);
  const [pendingDeleteTargets, setPendingDeleteTargets] = useState<SourceManagerItem[] | null>(null);
  const [pendingDeleteIndex, setPendingDeleteIndex] = useState(0);
  const [pendingDeleteDeletedCount, setPendingDeleteDeletedCount] = useState(0);
  const [pendingDeleteSkippedCount, setPendingDeleteSkippedCount] = useState(0);
  const [detailSourceId, setDetailSourceId] = useState<string | null>(null);
  const [detailDraftName, setDetailDraftName] = useState("");
  const [detailDraftUrl, setDetailDraftUrl] = useState("");
  const [detailInspection, setDetailInspection] = useState<SourceDetailInspectionState>({ status: "idle" });
  const [detailSaveError, setDetailSaveError] = useState<string | null>(null);
  const [detailSaving, setDetailSaving] = useState(false);
  const [exportingSourceId, setExportingSourceId] = useState<string | null>(null);
  const [localInspectionCache, setLocalInspectionCache] = useState<Record<string, LocalImportCandidate | undefined>>({});
  const [localInspectionStatus, setLocalInspectionStatus] = useState<Record<string, SourceInspectionStatus | undefined>>({});
  const [exportActivity, setExportActivity] = useState<ExportActivityState | null>(null);
  const [hideInlineExportActivity, setHideInlineExportActivity] = useState(false);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const exportAbortRef = useRef<AbortController | null>(null);
  const exportSequenceRef = useRef(0);

  function handleCancelExport() {
    exportAbortRef.current?.abort();
  }

  function nextExportActivityId() {
    exportSequenceRef.current += 1;
    return `export-${exportSequenceRef.current}`;
  }

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const [localRecords, externalSources] = await Promise.all([
        listLocalDatasetRecords(),
        Promise.resolve(getCustomExternalSources()),
      ]);
      setItems(buildManagerItems(localRecords, externalSources));
      setSelectedIds((prev) => prev.filter((id) => [...localRecords.map((entry) => entry.id), ...externalSources.map((entry) => entry.id)].includes(id)));
      setSelectionAnchorId((prev) => (prev && [...localRecords.map((entry) => entry.id), ...externalSources.map((entry) => entry.id)].includes(prev) ? prev : null));

      if (navigator.storage?.estimate) {
        const estimate = await navigator.storage.estimate();
        setStorageQuotaBytes(typeof estimate.quota === "number" ? estimate.quota : null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load saved data sources.");
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
      setRenamingId(null);
      setRenameDraft("");
      setOpenMenuId(null);
      setOpenExportMenuId(null);
      setMessage(null);
      setError(null);
      setSearchQuery("");
      setTypeFilter("all");
      setShowSearch(false);
      setPendingDeleteTargets(null);
      setPendingDeleteIndex(0);
      setPendingDeleteDeletedCount(0);
      setPendingDeleteSkippedCount(0);
      setDetailSourceId(null);
      setDetailDraftName("");
      setDetailDraftUrl("");
      setDetailInspection({ status: "idle" });
      setDetailSaveError(null);
      setDetailSaving(false);
      setLocalInspectionCache({});
      setLocalInspectionStatus({});
      setHideInlineExportActivity(false);
    }
  }, [open]);

  useEffect(() => {
    if (!exportActivity) {
      onExportNoticeChange?.(null);
      return;
    }
    onExportNoticeChange?.({
      active: true,
      title: exportActivity.sourceName,
      message: exportActivity.label,
      detail: exportActivity.detail ?? null,
      progress: exportActivity.progress ?? null,
      tone:
        exportActivity.status === "error"
          ? "error"
          : exportActivity.status === "success"
            ? "success"
            : "info",
      terminal:
        exportActivity.status === "success" ||
        exportActivity.status === "error" ||
        exportActivity.status === "cancelled",
      onDismiss: () => {},
      onCancel: exportActivity.cancellable ? handleCancelExport : null,
    });
  }, [exportActivity, onExportNoticeChange]);

  useEffect(() => {
    if (exportActivity) {
      setHideInlineExportActivity(false);
    }
  }, [exportActivity?.id, exportActivity?.status]);

  useEffect(() => {
    if (!exportActivity) return;
    if (
      exportActivity.status !== "success" &&
      exportActivity.status !== "error" &&
      exportActivity.status !== "cancelled"
    ) {
      return;
    }
    const timeoutId = window.setTimeout(() => {
      setExportActivity((current) => (current?.id === exportActivity.id ? null : current));
      setHideInlineExportActivity(false);
    }, 3200);
    return () => window.clearTimeout(timeoutId);
  }, [exportActivity]);

  useEffect(() => {
    if (!openMenuId && !openExportMenuId) return;
    function handlePointerDown() {
      setOpenMenuId(null);
      setOpenExportMenuId(null);
    }
    window.addEventListener("pointerdown", handlePointerDown);
    return () => window.removeEventListener("pointerdown", handlePointerDown);
  }, [openExportMenuId, openMenuId]);

  useEffect(() => {
    if (!showSearch) return;
    const id = window.setTimeout(() => searchInputRef.current?.focus(), 0);
    return () => window.clearTimeout(id);
  }, [showSearch]);

  const filteredItems = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return items.filter((item) => {
      if (typeFilter !== "all" && item.sourceType !== typeFilter) return false;
      if (!query) return true;
      return [item.name, item.subtitle, item.details].join(" ").toLowerCase().includes(query);
    });
  }, [items, searchQuery, typeFilter]);

  const localItems = useMemo(() => items.filter((item) => item.sourceType === "local"), [items]);
  const totalLocalBytes = useMemo(
    () => localItems.reduce((sum, item) => sum + item.size, 0),
    [localItems]
  );
  const selectedCount = selectedIds.length;
  const selectedDeletableItems = useMemo(
    () => items.filter((item) => selectedIds.includes(item.id) && item.deletable),
    [items, selectedIds]
  );
  const selectedTotalBytes = useMemo(
    () => items.filter((item) => selectedIds.includes(item.id)).reduce((sum, item) => sum + item.size, 0),
    [items, selectedIds]
  );
  const currentPendingDeleteTarget = pendingDeleteTargets?.[pendingDeleteIndex] ?? null;
  const deleteUsageSummary = useMemo(
    () => currentPendingDeleteTarget ? buildDeleteUsageSummary([currentPendingDeleteTarget], activeLayerTree, savedViewers) : null,
    [activeLayerTree, currentPendingDeleteTarget, savedViewers]
  );
  const localUsageRatio = storageQuotaBytes && storageQuotaBytes > 0
    ? Math.max(0, Math.min(1, totalLocalBytes / storageQuotaBytes))
    : null;
  const detailItem = useMemo(
    () => items.find((item) => item.id === detailSourceId) ?? null,
    [detailSourceId, items]
  );
  const detailExternalItem = detailItem?.sourceType === "external" ? detailItem : null;
  const isDetailView = Boolean(detailItem);

  useEffect(() => {
    if (!detailSourceId) return;
    if (!detailItem) {
      setDetailSourceId(null);
      return;
    }

    setDetailDraftName(detailItem.name);
    setDetailDraftUrl(detailItem.sourceType === "external" ? detailItem.source.url : "");
    setDetailSaveError(null);

    if (detailItem.sourceType === "local") {
      let cancelled = false;
      setDetailInspection({ status: "loading" });
      void inspectStoredLocalDatasetById(detailItem.id)
        .then((candidate) => {
          if (cancelled) return;
          setDetailInspection({ status: "ready", candidate });
        })
        .catch((error) => {
          if (cancelled) return;
          setDetailInspection({
            status: "error",
            error: error instanceof Error ? error.message : "Failed to inspect this source.",
          });
        });
      return () => {
        cancelled = true;
      };
    }

    setDetailInspection({ status: "idle" });
  }, [detailItem, detailSourceId]);

  useEffect(() => {
    if (!detailItem || detailItem.sourceType !== "local") return;
    if (detailInspection.status !== "ready" || !detailInspection.candidate) return;
    const inspectedCandidate = detailInspection.candidate;
    setLocalInspectionCache((prev) => {
      if (prev[detailItem.id] === inspectedCandidate) return prev;
      return {
        ...prev,
        [detailItem.id]: inspectedCandidate,
      };
    });
    setLocalInspectionStatus((prev) => ({
      ...prev,
      [detailItem.id]: { status: "ready" },
    }));
  }, [detailInspection.candidate, detailInspection.status, detailItem]);

  function handleSearchBlur() {
    if (!searchQuery.trim()) {
      setShowSearch(false);
    }
  }

  function openSourceDetails(itemId: string) {
    if (renamingId) return;
    if (!items.some((item) => item.id === itemId)) return;
    setDetailSourceId(itemId);
  }

  function requestDeleteTargets(targets: SourceManagerItem[]) {
    if (!targets.length) return;
    setPendingDeleteTargets(targets);
    setPendingDeleteIndex(0);
    setPendingDeleteDeletedCount(0);
    setPendingDeleteSkippedCount(0);
    setOpenMenuId(null);
  }

  function handleSelectItem(itemId: string, event: ReactMouseEvent<HTMLDivElement>) {
    if (renamingId) return;
    setMessage(null);
    setError(null);

    if (!event.shiftKey && !isToggleModifierPressed(event) && selectedIds.length === 1 && selectedIds[0] === itemId) {
      openSourceDetails(itemId);
      return;
    }

    const itemIndex = filteredItems.findIndex((item) => item.id === itemId);
    if (itemIndex < 0) return;

    const toggleModifier = isToggleModifierPressed(event);
    const shiftModifier = event.shiftKey;

    setSelectedIds((prev) => {
      if (shiftModifier) {
        const anchorId = selectionAnchorId ?? prev[0] ?? itemId;
        const anchorIndex = filteredItems.findIndex((item) => item.id === anchorId);
        const start = Math.min(anchorIndex >= 0 ? anchorIndex : itemIndex, itemIndex);
        const end = Math.max(anchorIndex >= 0 ? anchorIndex : itemIndex, itemIndex);
        const rangeIds = filteredItems.slice(start, end + 1).map((item) => item.id);

        if (toggleModifier) {
          const next = new Set(prev);
          for (const id of rangeIds) {
            if (next.has(id)) next.delete(id);
            else next.add(id);
          }
          return items.map((item) => item.id).filter((id) => next.has(id));
        }

        return rangeIds;
      }

      if (toggleModifier) {
        if (prev.includes(itemId)) return prev.filter((id) => id !== itemId);
        return [...prev, itemId];
      }

      return [itemId];
    });

    setSelectionAnchorId(itemId);
  }

  async function handleSaveDetailSource() {
    if (!detailItem) return;
    const nextName = detailDraftName.trim();
    if (!nextName) {
      setDetailSaveError("Source name cannot be empty.");
      return;
    }

    setDetailSaveError(null);
    setDetailSaving(true);
    try {
      if (detailItem.sourceType === "local") {
        if (nextName !== detailItem.name) {
          if (onRenameDataset) await onRenameDataset(detailItem.id, nextName);
          else await renameLocalDatasetRecord(detailItem.id, nextName);
        }
      } else {
        const nextUrl = detailDraftUrl.trim();
        if (!nextUrl) {
          throw new Error("Source URL cannot be empty.");
        }
        const probe = await probeOmeZarrSource(nextUrl, detailItem.source.remoteContentKind === "annotation" ? "annotation" : "intensity");
        const updated = updateCustomExternalSource(detailItem.id, {
          name: nextName,
          url: nextUrl,
          provider: inferProvider(nextUrl),
          remoteFormat: "ome-zarr",
          remoteContentKind: detailItem.source.remoteContentKind ?? "intensity",
          availableScales: probe.scales.map((scale) => ({
            datasetIndex: scale.datasetIndex,
            datasetPath: scale.datasetPath,
            resolutionUm: scale.resolutionUm,
            resolutionLabel: scale.resolutionLabel,
            voxelSizeUm: scale.voxelSizeUm,
            rawShape: scale.rawShape,
            dims: scale.dims,
            estimatedBytes: scale.estimatedBytes,
            estimatedMemoryBytes: scale.estimatedMemoryBytes,
            canLoad: scale.canLoad,
          })),
          recommendedResolution: probe.recommendedScale?.resolutionLabel,
          inspectionError: null,
        });
        if (!updated) {
          throw new Error("Failed to update this external source.");
        }
      }

      await refresh();
      setMessage("Source updated.");
    } catch (error) {
      setDetailSaveError(error instanceof Error ? error.message : "Failed to update this source.");
    } finally {
      setDetailSaving(false);
    }
  }

  async function handleRename(item: SourceManagerItem) {
    const nextName = renameDraft.trim();
    if (!nextName) return;
    setError(null);
    try {
      if (item.sourceType === "local") {
        if (onRenameDataset) await onRenameDataset(item.id, nextName);
        else await renameLocalDatasetRecord(item.id, nextName);
      } else {
        renameCustomExternalSource(item.id, nextName);
      }
      setMessage("Source renamed.");
      setRenamingId(null);
      setRenameDraft("");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to rename source.");
    }
  }

  async function ensureLocalInspection(item: Extract<SourceManagerItem, { sourceType: "local" }>) {
    const cached = localInspectionCache[item.id];
    if (cached) return cached;
    setLocalInspectionStatus((prev) => ({
      ...prev,
      [item.id]: { status: "loading" },
    }));
    try {
      const candidate = await inspectStoredLocalDatasetById(item.id);
      setLocalInspectionCache((prev) => ({
        ...prev,
        [item.id]: candidate,
      }));
      setLocalInspectionStatus((prev) => ({
        ...prev,
        [item.id]: { status: "ready" },
      }));
      return candidate;
    } catch (inspectionError) {
      setLocalInspectionStatus((prev) => ({
        ...prev,
        [item.id]: {
          status: "error",
          error: inspectionError instanceof Error ? inspectionError.message : "Failed to inspect this source.",
        },
      }));
      throw inspectionError;
    }
  }

  async function handleExportLocalSource(item: Extract<SourceManagerItem, { sourceType: "local" }>, mode: "original" | "zip" | "nrrd" | "nii" | "zarr" | "ome-zarr") {
    setError(null);
    setMessage(null);
    setOpenExportMenuId(null);
    setExportingSourceId(item.id);
    exportAbortRef.current?.abort();
    const abortController = new AbortController();
    exportAbortRef.current = abortController;
    const activityId = nextExportActivityId();
    const setCurrentExportActivity = (next: Omit<ExportActivityState, "id">) => {
      setExportActivity({ id: activityId, ...next });
    };
    setCurrentExportActivity({
      sourceId: item.id,
      sourceName: item.name,
      label: mode === "original" ? "Preparing original download" : mode === "zip" ? "Preparing ZIP export" : `Preparing ${mode === "nii" ? "NIfTI" : mode === "nrrd" ? "NRRD" : mode === "ome-zarr" ? "OME-Zarr" : "Zarr"} export`,
      status: "preparing",
      cancellable: true,
      progress: null,
      detail: null,
    });
    try {
      throwIfExportAborted(abortController.signal);
      if (mode === "original" && item.record.kind === "blob" && item.record.blob) {
        setCurrentExportActivity({
          sourceId: item.id,
          sourceName: item.name,
          label: "Starting download",
          status: "downloading",
          cancellable: false,
          progress: 1,
          detail: null,
        });
        downloadBlob(item.record.blob, item.record.fileName);
        setCurrentExportActivity({
          sourceId: item.id,
          sourceName: item.name,
          label: "Download started",
          status: "success",
          cancellable: false,
          progress: 1,
          detail: `Started download for ${item.name}.`,
        });
        return;
      }

      if (mode === "nrrd" || mode === "nii") {
        setCurrentExportActivity({
          sourceId: item.id,
          sourceName: item.name,
          label: "Analyzing source for volume export",
          status: "analyzing",
          cancellable: true,
          progress: null,
          detail: null,
        });
        const candidate = await ensureLocalInspection(item);
        throwIfExportAborted(abortController.signal);
        if (candidate.inspection.kind !== "volume") {
          throw new Error(`${mode === "nrrd" ? "NRRD" : "NIfTI"} export is currently available only for local volume data sources.`);
        }
        const record = await getLocalDatasetRecord(item.id);
        if (!record) {
          throw new Error("This local dataset is missing from browser storage.");
        }
        const exportSource = buildExportSourceFromLocalRecord(record, candidate.inspection);
        if (!canExportVolumeAsNrrd(exportSource)) {
          throw new Error(`${mode === "nrrd" ? "NRRD" : "NIfTI"} export is not available for this source.`);
        }
        if (candidate.inspection.format === "zarr" || candidate.inspection.format === "ome-zarr") {
          setCurrentExportActivity({
            sourceId: item.id,
            sourceName: item.name,
            label: `Packaging ${mode === "nrrd" ? "NRRD" : "NIfTI"} from Zarr chunks`,
            status: "packaging",
            cancellable: true,
            progress: 0,
            detail: "Reading local Zarr chunks.",
          });
          const chunkedBlob = await createChunkedLocalZarrVolumeExportBlob(exportSource, record, candidate.inspection.info, mode, {
            signal: abortController.signal,
            onProgress: (progress) => {
              setExportActivity((current) =>
                current?.id === activityId
                  ? {
                      ...current,
                      label: `Packaging ${mode === "nrrd" ? "NRRD" : "NIfTI"} from Zarr chunks`,
                      detail: progress.label,
                      progress: progress.total > 0 ? progress.completed / progress.total : null,
                    }
                  : current
              );
            },
          });
          throwIfExportAborted(abortController.signal);
          setCurrentExportActivity({
            sourceId: item.id,
            sourceName: item.name,
            label: "Starting download",
            status: "downloading",
            cancellable: false,
            progress: 1,
            detail: null,
          });
          downloadBlob(chunkedBlob, buildExportFileName(item.record.fileName, mode));
          setCurrentExportActivity({
            sourceId: item.id,
            sourceName: item.name,
            label: "Download started",
            status: "success",
            cancellable: false,
            progress: 1,
            detail: `Started ${mode === "nrrd" ? "NRRD" : "NIfTI"} download for ${item.name}.`,
          });
          return;
        }
        {
          setCurrentExportActivity({
            sourceId: item.id,
            sourceName: item.name,
            label: `Converting source to ${mode === "nrrd" ? "NRRD" : "NIfTI"}`,
            status: "packaging",
            cancellable: true,
            progress: null,
            detail: "Loading local volume in the background.",
          });
          const loadedVolume = await Promise.race([
            loadLocalBrowserVolumeInWorker(item.id, candidate.inspection.info),
            new Promise<never>((_, reject) => {
              abortController.signal.addEventListener(
                "abort",
                () => {
                  disposeLocalDataLoadWorker();
                  reject(new DOMException("Export canceled", "AbortError"));
                },
                { once: true }
              );
            }),
          ]);
          throwIfExportAborted(abortController.signal);
          const directBlob = mode === "nrrd" ? createNrrdExportBlob(exportSource, loadedVolume) : createNiftiExportBlob(exportSource, loadedVolume);
          setCurrentExportActivity({
            sourceId: item.id,
            sourceName: item.name,
            label: "Starting download",
            status: "downloading",
            cancellable: false,
            progress: 1,
            detail: null,
          });
          downloadBlob(directBlob, buildExportFileName(item.record.fileName, mode));
          setCurrentExportActivity({
            sourceId: item.id,
            sourceName: item.name,
            label: "Download started",
            status: "success",
            cancellable: false,
            progress: 1,
            detail: `Started ${mode === "nrrd" ? "NRRD" : "NIfTI"} download for ${item.name}.`,
          });
          return;
        }
      }

      if (mode === "zarr" || mode === "ome-zarr") {
        setCurrentExportActivity({
          sourceId: item.id,
          sourceName: item.name,
          label: `Analyzing source for ${mode === "ome-zarr" ? "OME-Zarr" : "Zarr"} export`,
          status: "analyzing",
          cancellable: true,
          progress: null,
          detail: null,
        });
        const candidate = await ensureLocalInspection(item);
        throwIfExportAborted(abortController.signal);
        let archiveBlob: Blob;
        if (candidate.inspection.kind === "volume") {
          setCurrentExportActivity({
            sourceId: item.id,
            sourceName: item.name,
            label: `Converting source to ${mode === "ome-zarr" ? "OME-Zarr" : "Zarr"}`,
            status: "packaging",
            cancellable: true,
            progress: 0,
            detail: "Preparing archive structure.",
          });
          if (item.record.kind === "tree" && candidate.inspection.format === mode) {
            const archiveRootName = getStructuredArchiveRootName(item.record.fileName, mode);
            archiveBlob = await createLocalDatasetZipBlob(item.record, archiveRootName);
          } else {
            const record = await getLocalDatasetRecord(item.id);
            if (!record) {
              throw new Error("This local dataset is missing from browser storage.");
            }
            const exportSource = buildExportSourceFromLocalRecord(record, candidate.inspection);
            const loadedVolume = await Promise.race([
              loadLocalBrowserVolumeInWorker(item.id, candidate.inspection.info),
              new Promise<never>((_, reject) => {
                abortController.signal.addEventListener(
                  "abort",
                  () => {
                    disposeLocalDataLoadWorker();
                    reject(new DOMException("Export canceled", "AbortError"));
                  },
                  { once: true }
                );
              }),
            ]);
            throwIfExportAborted(abortController.signal);
            const archiveRootName = getStructuredArchiveRootName(item.record.fileName, mode);
            archiveBlob = await createLocalVolumeZarrExportBlob(exportSource, loadedVolume, mode, archiveRootName, {
              signal: abortController.signal,
              onProgress: (progress) => {
                setExportActivity((current) =>
                  current?.id === activityId
                    ? {
                        ...current,
                        label: `Converting source to ${mode === "ome-zarr" ? "OME-Zarr" : "Zarr"}`,
                        detail: progress.label,
                        progress: progress.total > 0 ? progress.completed / progress.total : null,
                      }
                    : current
                );
              },
            });
          }
        } else {
          throw new Error(`${mode === "ome-zarr" ? "OME-Zarr" : "Zarr"} export is currently available only for local volume data sources.`);
        }
        throwIfExportAborted(abortController.signal);
        setCurrentExportActivity({
          sourceId: item.id,
          sourceName: item.name,
          label: "Starting download",
          status: "downloading",
          cancellable: false,
          progress: 1,
          detail: null,
        });
        downloadBlob(archiveBlob, buildExportFileName(item.record.fileName, mode));
        setCurrentExportActivity({
          sourceId: item.id,
          sourceName: item.name,
          label: "Download started",
          status: "success",
          cancellable: false,
          progress: 1,
          detail: `Started ${mode === "ome-zarr" ? "OME-Zarr" : "Zarr"} download for ${item.name}.`,
        });
        return;
      }

      setCurrentExportActivity({
        sourceId: item.id,
        sourceName: item.name,
        label: "Packaging ZIP archive",
        status: "packaging",
        cancellable: true,
        progress: null,
        detail: null,
      });
      throwIfExportAborted(abortController.signal);
      const zipBlob = await createLocalDatasetZipBlob(item.record);
      const baseName = normalizeExportBaseName(item.record.fileName);
      const downloadName =
        mode === "original" && item.record.kind === "tree"
          ? ensureZipFileName(baseName)
          : ensureZipFileName(baseName);
      setCurrentExportActivity({
        sourceId: item.id,
        sourceName: item.name,
        label: "Starting download",
        status: "downloading",
        cancellable: false,
        progress: 1,
        detail: null,
      });
      downloadBlob(zipBlob, downloadName);
      setCurrentExportActivity({
        sourceId: item.id,
        sourceName: item.name,
        label: "Download started",
        status: "success",
        cancellable: false,
        progress: 1,
        detail:
          mode === "original" && item.record.kind === "tree"
            ? `Started original-structure download for ${item.name}.`
            : `Started ${mode.toUpperCase()} download for ${item.name}.`,
      });
    } catch (err) {
      setExportActivity({
        id: activityId,
        sourceId: item.id,
        sourceName: item.name,
        label: err instanceof DOMException && err.name === "AbortError" ? "Export canceled" : "Export failed",
        status: err instanceof DOMException && err.name === "AbortError" ? "cancelled" : "error",
        cancellable: false,
        progress: null,
        detail: err instanceof Error ? err.message : "Failed to export this local data source.",
      });
    } finally {
      setExportingSourceId(null);
      if (exportAbortRef.current === abortController) {
        exportAbortRef.current = null;
      }
    }
  }

  async function handleExportExternalSource(item: Extract<SourceManagerItem, { sourceType: "external" }>, mode: "original" | "zip" | "nrrd" | "nii" | "zarr" | "ome-zarr") {
    setError(null);
    setMessage(null);
    setOpenExportMenuId(null);
    setExportingSourceId(item.id);
    exportAbortRef.current?.abort();
    const abortController = new AbortController();
    exportAbortRef.current = abortController;
    const activityId = nextExportActivityId();
    const setCurrentExportActivity = (next: Omit<ExportActivityState, "id">) => {
      setExportActivity({ id: activityId, ...next });
    };
    setCurrentExportActivity({
      sourceId: item.id,
      sourceName: item.name,
      label: `Preparing remote ${mode === "original" ? "original" : mode === "zip" ? "ZIP" : mode === "nii" ? "NIfTI" : mode === "nrrd" ? "NRRD" : mode === "ome-zarr" ? "OME-Zarr" : "Zarr"} export`,
      status: "preparing",
      cancellable: true,
      progress: null,
      detail: null,
    });
    try {
      if (!isExternalVolumeExportSupported(item)) {
        throw new Error("External export is currently available only for public OME-Zarr sources.");
      }

      const contentKind = item.source.remoteContentKind === "annotation" ? "annotation" : "intensity";
      let scales = getExternalExportScales(item);
        setCurrentExportActivity({
          sourceId: item.id,
          sourceName: item.name,
          label: "Checking remote source",
          detail: scales.length ? `Found ${scales.length} saved scale${scales.length === 1 ? "" : "s"}.` : "Refreshing source metadata.",
        status: "analyzing",
        cancellable: true,
        progress: null,
      });
      if (!scales.length) {
        const probed = await probeOmeZarrSource(item.source.url, contentKind);
        scales = [...probed.scales].sort((a, b) => (a.resolutionUm ?? Number.POSITIVE_INFINITY) - (b.resolutionUm ?? Number.POSITIVE_INFINITY));
      }
      if (!scales.length) {
        throw new Error("No exportable OME-Zarr scales were found for this external source.");
      }

      if (mode === "original" || mode === "zip") {
        const archiveRootName = getStructuredArchiveRootName(item.source.name, "ome-zarr");
        setCurrentExportActivity({
          sourceId: item.id,
          sourceName: item.name,
          label: "Fetching remote OME-Zarr archive",
          detail: "Downloading metadata and chunks from the remote host.",
          status: "packaging",
          cancellable: true,
          progress: 0,
        });
        const archiveBlob = await createRemoteOmeZarrZipBlob({
          url: item.source.url,
          rootFolderName: archiveRootName,
          signal: abortController.signal,
          onProgress: (progress) => {
            setExportActivity((current) =>
              current?.id === activityId
                ? {
                    ...current,
                    label: "Fetching remote OME-Zarr archive",
                    detail: progress.label,
                    progress: progress.total > 0 ? progress.completed / progress.total : null,
                    cancellable: true,
                  }
                : current
            );
          },
        });
        setCurrentExportActivity({
          sourceId: item.id,
          sourceName: item.name,
          label: "Starting download",
          detail: archiveRootName,
          status: "downloading",
          cancellable: false,
          progress: 1,
        });
        downloadBlob(archiveBlob, mode === "original" ? ensureZipFileName(archiveRootName) : buildExportFileName(item.source.name, "zip"));
        setCurrentExportActivity({
          sourceId: item.id,
          sourceName: item.name,
          label: "Download started",
          status: "success",
          detail: `Started remote ${mode === "original" ? "original-structure" : "ZIP"} download for ${item.name}.`,
          cancellable: false,
          progress: 1,
        });
        return;
      }

      let lastFailure: unknown = null;
      let lastAttemptedScale: string | null = null;
      for (let index = 0; index < scales.length; index += 1) {
        const scale = scales[index];
        if (abortController.signal.aborted) {
          throw new DOMException("Export canceled", "AbortError");
        }
        lastAttemptedScale = scale.resolutionLabel;
        if (!scale.canLoad) {
          lastFailure = new Error(`Scale ${scale.resolutionLabel} exceeds the current browser memory budget.`);
          setCurrentExportActivity({
            sourceId: item.id,
            sourceName: item.name,
            label: `Skipping ${scale.resolutionLabel}`,
            detail: `Trying a coarser scale (${index + 1}/${scales.length}).`,
            status: "analyzing",
            cancellable: true,
            progress: null,
          });
          continue;
        }
        try {
          setCurrentExportActivity({
            sourceId: item.id,
            sourceName: item.name,
            label: `Fetching remote ${scale.resolutionLabel} volume`,
            detail: `Attempt ${index + 1} of ${scales.length}`,
            status: "packaging",
            cancellable: true,
            progress: null,
          });
          const loadedVolume = await loadVolumeAtResolution(item.source.url, scale.resolutionLabel, contentKind);
          const exportSource = buildExportSourceFromLoadedVolume(loadedVolume, {
            id: item.id,
            name: item.source.name,
            origin: "external",
            sourceFormat: item.source.remoteFormat ?? "ome-zarr",
            sourceUrl: item.source.url,
            recommendedResolution: scale.resolutionLabel,
            createdAt: item.source.createdAt,
            updatedAt: item.source.updatedAt,
          });

          if (mode === "nrrd" || mode === "nii") {
            setCurrentExportActivity({
              sourceId: item.id,
              sourceName: item.name,
              label: `Converting ${scale.resolutionLabel} to ${mode === "nrrd" ? "NRRD" : "NIfTI"}`,
              detail: scale.canLoad ? "Using the highest fidelity browser-safe scale." : null,
              status: "packaging",
              cancellable: true,
              progress: null,
            });
            const blob = mode === "nrrd" ? createNrrdExportBlob(exportSource, loadedVolume) : createNiftiExportBlob(exportSource, loadedVolume);
            setCurrentExportActivity({
              sourceId: item.id,
              sourceName: item.name,
              label: "Starting download",
              detail: `Exported from ${scale.resolutionLabel}`,
              status: "downloading",
              cancellable: false,
              progress: 1,
            });
            downloadBlob(blob, buildExportFileName(item.source.name, mode));
            setCurrentExportActivity({
              sourceId: item.id,
              sourceName: item.name,
              label: "Download started",
              status: "success",
              detail: `Started remote ${mode === "nrrd" ? "NRRD" : "NIfTI"} download for ${item.name} from ${scale.resolutionLabel}.`,
              cancellable: false,
              progress: 1,
            });
            return;
          }

          setCurrentExportActivity({
            sourceId: item.id,
            sourceName: item.name,
            label: `Converting ${scale.resolutionLabel} to ${mode === "ome-zarr" ? "OME-Zarr" : "Zarr"}`,
            detail: "Packaging the fetched remote scale.",
            status: "packaging",
            cancellable: true,
            progress: null,
          });
          const archiveRootName = getStructuredArchiveRootName(item.source.name, mode);
          const archiveBlob = await createLocalVolumeZarrExportBlob(exportSource, loadedVolume, mode, archiveRootName, {
            signal: abortController.signal,
            onProgress: (progress) => {
              setExportActivity((current) =>
                current?.id === activityId
                  ? {
                      ...current,
                      label: `Converting ${scale.resolutionLabel} to ${mode === "ome-zarr" ? "OME-Zarr" : "Zarr"}`,
                      detail: progress.label,
                      progress: progress.total > 0 ? progress.completed / progress.total : null,
                    }
                  : current
              );
            },
          });
          setCurrentExportActivity({
            sourceId: item.id,
            sourceName: item.name,
            label: "Starting download",
            detail: `Exported from ${scale.resolutionLabel}`,
            status: "downloading",
            cancellable: false,
            progress: 1,
          });
          downloadBlob(archiveBlob, buildExportFileName(item.source.name, mode));
          setCurrentExportActivity({
            sourceId: item.id,
            sourceName: item.name,
            label: "Download started",
            status: "success",
            detail: `Started remote ${mode === "ome-zarr" ? "OME-Zarr" : "Zarr"} download for ${item.name} from ${scale.resolutionLabel}.`,
            cancellable: false,
            progress: 1,
          });
          return;
        } catch (error) {
          if (!shouldTryCoarserScaleAfterError(error) || index === scales.length - 1) {
            throw error;
          }
          lastFailure = error;
          setCurrentExportActivity({
            sourceId: item.id,
            sourceName: item.name,
            label: `Could not export ${scale.resolutionLabel}`,
            detail: `Trying a coarser scale next.`,
            status: "analyzing",
            cancellable: true,
            progress: null,
          });
        }
      }
      throw lastFailure instanceof Error ? lastFailure : new Error(formatRemoteExportError(lastFailure, lastAttemptedScale));
    } catch (err) {
      const nextMessage = formatRemoteExportError(err);
      setExportActivity({
        id: activityId,
        sourceId: item.id,
        sourceName: item.name,
        label: classifyRemoteExportError(err) === "cancelled" ? "Export canceled" : "Export failed",
        status: classifyRemoteExportError(err) === "cancelled" ? "cancelled" : "error",
        detail: nextMessage,
        cancellable: false,
        progress: null,
      });
    } finally {
      setExportingSourceId(null);
      if (exportAbortRef.current === abortController) {
        exportAbortRef.current = null;
      }
    }
  }

  async function deleteSingleTarget(item: SourceManagerItem) {
    if (item.sourceType === "local") {
      if (onDeleteDataset) await onDeleteDataset(item.id);
      else await deleteLocalDatasetRecord(item.id);
      return;
    }
    deleteCustomExternalSource(item.id);
  }

  function finalizeDeleteReview(nextDeletedCount: number, nextSkippedCount: number) {
    setPendingDeleteTargets(null);
    setPendingDeleteIndex(0);
    setPendingDeleteDeletedCount(0);
    setPendingDeleteSkippedCount(0);
    setSelectedIds([]);
    setSelectionAnchorId(null);

    if (nextDeletedCount > 0 && nextSkippedCount > 0) {
      setMessage(`Removed ${nextDeletedCount} source${nextDeletedCount === 1 ? "" : "s"} and skipped ${nextSkippedCount}.`);
    } else if (nextDeletedCount > 0) {
      setMessage(nextDeletedCount === 1 ? "Source removed." : `${nextDeletedCount} sources removed.`);
    } else if (nextSkippedCount > 0) {
      setMessage(nextSkippedCount === 1 ? "Deletion skipped." : `${nextSkippedCount} deletions skipped.`);
    }
  }

  async function handleConfirmCurrentDelete() {
    if (!pendingDeleteTargets?.length || !currentPendingDeleteTarget) return;
    setError(null);
    setMessage(null);

    let nextDeletedCount = pendingDeleteDeletedCount;
    try {
      await deleteSingleTarget(currentPendingDeleteTarget);
      nextDeletedCount += 1;
      setPendingDeleteDeletedCount(nextDeletedCount);
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to delete ${currentPendingDeleteTarget.name}.`);
    }

    await refresh();

    const nextIndex = pendingDeleteIndex + 1;
    if (nextIndex >= pendingDeleteTargets.length) {
      finalizeDeleteReview(nextDeletedCount, pendingDeleteSkippedCount);
      return;
    }
    setPendingDeleteIndex(nextIndex);
  }

  function handleSkipCurrentDelete() {
    if (!pendingDeleteTargets?.length) return;
    const nextSkippedCount = pendingDeleteSkippedCount + 1;
    setPendingDeleteSkippedCount(nextSkippedCount);
    const nextIndex = pendingDeleteIndex + 1;
    if (nextIndex >= pendingDeleteTargets.length) {
      finalizeDeleteReview(pendingDeleteDeletedCount, nextSkippedCount);
      return;
    }
    setPendingDeleteIndex(nextIndex);
  }

  function handleCancelDeleteReview() {
    finalizeDeleteReview(pendingDeleteDeletedCount, pendingDeleteSkippedCount);
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
      }}
    >
      <style>{`
        @keyframes source-manager-spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes source-manager-progress {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
      `}</style>
      <div
        data-theme-surface="panel"
        onClick={(event) => event.stopPropagation()}
        style={{
          width: "min(960px, calc(100vw - 32px))",
          height: "min(84vh, 780px)",
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
        }}
      >
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16 }}>
          <div style={{ minWidth: 0, display: "grid", gap: 6 }}>
            {isDetailView ? (
              <button
                type="button"
                onClick={() => setDetailSourceId(null)}
                title="Back to data source manager"
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 10,
                  border: "1px solid rgba(255,255,255,0.10)",
                  background: "rgba(255,255,255,0.05)",
                  color: "white",
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <BackArrowIcon />
              </button>
            ) : null}
            <div style={{ fontSize: 18, fontWeight: 800 }}>{isDetailView ? "Data source details" : "Data source manager"}</div>
            <div data-theme-text="muted" style={{ fontSize: 13, opacity: 0.72, lineHeight: 1.5 }}>
              {isDetailView
                ? "Review this source, update its settings, or remove it from the source library."
                : "Manage browser-hosted personal data and saved external sources. Use Ctrl/Cmd-click and Shift-click to select multiple sources quickly."}
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
        <div style={{ flex: 1, minHeight: 0, overflow: "hidden" }}>
          <div
            style={{
              width: "200%",
              height: "100%",
              display: "flex",
              transform: isDetailView ? "translateX(-50%)" : "translateX(0%)",
              transition: "transform 260ms cubic-bezier(0.22, 1, 0.36, 1)",
            }}
          >
            <div style={{ width: "50%", minWidth: "50%", height: "100%", display: "flex", flexDirection: "column", gap: 14, paddingRight: 10, boxSizing: "border-box" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {(["all", "local", "external"] as const).map((filter) => (
                    <button
                      key={filter}
                      type="button"
                      onClick={() => setTypeFilter(filter)}
                      style={{
                        height: 32,
                        padding: "0 12px",
                        borderRadius: 999,
                        border: typeFilter === filter ? "1px solid rgba(92,149,230,0.88)" : "1px solid rgba(255,255,255,0.12)",
                        background: typeFilter === filter ? "rgba(92,149,230,0.22)" : "rgba(255,255,255,0.04)",
                        color: "white",
                        cursor: "pointer",
                        fontSize: 11,
                        fontWeight: 800,
                        textTransform: "uppercase",
                        letterSpacing: "0.04em",
                      }}
                    >
                      {filter === "all" ? "All sources" : filter === "local" ? "Browser data" : "External"}
                    </button>
                  ))}
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  {selectedDeletableItems.length > 1 ? (
                    <button
                      type="button"
                      onClick={() => requestDeleteTargets(selectedDeletableItems)}
                      style={{
                        height: 34,
                        padding: "0 12px",
                        borderRadius: 10,
                        border: "1px solid rgba(255,120,120,0.32)",
                        background: "rgba(255,80,80,0.14)",
                        color: "#ffd0d0",
                        cursor: "pointer",
                        fontSize: 12,
                        fontWeight: 700,
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 8,
                      }}
                    >
                      <TrashIcon />
                      <span>{`Delete selected (${selectedDeletableItems.length})`}</span>
                    </button>
                  ) : null}
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      height: 34,
                      borderRadius: 10,
                      border: showSearch ? "1px solid rgba(160,220,255,0.28)" : "1px solid rgba(255,255,255,0.10)",
                      background: showSearch ? "rgba(120,190,255,0.08)" : "rgba(255,255,255,0.05)",
                      overflow: "hidden",
                      width: showSearch ? 220 : 34,
                      transition: "width 180ms ease, background 180ms ease, border-color 180ms ease",
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        if (showSearch && searchQuery) {
                          setSearchQuery("");
                          searchInputRef.current?.focus();
                          return;
                        }
                        setShowSearch(true);
                      }}
                      title="Search sources"
                      style={{
                        height: 34,
                        width: 34,
                        minWidth: 34,
                        border: "none",
                        background: "transparent",
                        color: "white",
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <SearchIcon />
                    </button>

                    {showSearch ? (
                      <>
                        <input
                          ref={searchInputRef}
                          value={searchQuery}
                          onChange={(event) => setSearchQuery(event.target.value)}
                          onBlur={handleSearchBlur}
                          placeholder="Search sources..."
                          style={{
                            flex: 1,
                            minWidth: 0,
                            height: 34,
                            border: "none",
                            background: "transparent",
                            color: "white",
                            padding: "0 8px 0 0",
                            boxSizing: "border-box",
                            outline: "none",
                            fontSize: 12,
                          }}
                        />
                        <button
                          type="button"
                          onClick={() => {
                            if (searchQuery.trim()) {
                              setSearchQuery("");
                              searchInputRef.current?.focus();
                            } else {
                              setShowSearch(false);
                            }
                          }}
                          title="Close search"
                          style={{
                            width: 30,
                            minWidth: 30,
                            height: 34,
                            border: "none",
                            background: "transparent",
                            color: "rgba(255,255,255,0.7)",
                            cursor: "pointer",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            padding: 0,
                          }}
                        >
                          <CloseIcon />
                        </button>
                      </>
                    ) : null}
                  </div>
                </div>
              </div>

              <div data-theme-surface="soft" style={{ borderRadius: 14, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.04)", padding: "10px 14px 12px", display: "grid", gap: 8 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <div style={{ fontSize: 12, fontWeight: 700 }}>Browser storage</div>
                    <span style={{ height: 24, padding: "0 9px", borderRadius: 999, border: "1px solid rgba(255,210,120,0.26)", background: "rgba(255,210,120,0.12)", color: "#ffe4ad", fontSize: 10.5, fontWeight: 800, display: "inline-flex", alignItems: "center", gap: 6 }}>
                      <DataIcon />
                      <span>{localItems.length}</span>
                    </span>
                    <span style={{ height: 24, padding: "0 9px", borderRadius: 999, border: "1px solid rgba(120,190,255,0.28)", background: "rgba(92,149,230,0.18)", color: "#d6e8ff", fontSize: 10.5, fontWeight: 800, display: "inline-flex", alignItems: "center", gap: 6 }}>
                      <ChainIcon />
                      <span>{items.length - localItems.length}</span>
                    </span>
                    {exportActivity && hideInlineExportActivity ? (
                      <button
                        type="button"
                        onClick={() => setHideInlineExportActivity(false)}
                        title="Show export status"
                        aria-label="Show export status"
                        style={{
                          height: 24,
                          padding: "0 8px",
                          borderRadius: 999,
                          border: "1px solid rgba(255,215,120,0.24)",
                          background: "rgba(255,215,120,0.10)",
                          color: "#ffe7a8",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 6,
                          cursor: "pointer",
                        }}
                      >
                        <ActivityNoticeIcon />
                        <span style={{ fontSize: 10.5, fontWeight: 800 }}>Export active</span>
                      </button>
                    ) : null}
                    {selectedCount > 0 ? (
                      <>
                        <span data-theme-text="muted" style={{ fontSize: 11, opacity: 0.68 }}>
                          {selectedCount} selected
                        </span>
                        <span data-theme-text="muted" style={{ fontSize: 11, opacity: 0.68 }}>
                          {formatBytes(selectedTotalBytes)}
                        </span>
                      </>
                    ) : null}
                  </div>
                  <div data-theme-text="muted" style={{ fontSize: 12, opacity: 0.72 }}>
                    {storageQuotaBytes ? `${formatBytes(totalLocalBytes)}/${formatBytes(storageQuotaBytes)}` : formatBytes(totalLocalBytes)}
                  </div>
                </div>
                <div style={{ height: 8, borderRadius: 999, background: "rgba(255,255,255,0.08)", overflow: "hidden" }}>
                  <div
                    style={{
                      height: "100%",
                      width: `${Math.max(3, Math.round((localUsageRatio ?? 0) * 100))}%`,
                      borderRadius: 999,
                      background: "linear-gradient(90deg, rgba(92,149,230,0.92), rgba(120,190,255,0.95))",
                    }}
                  />
                </div>
              </div>

              {!exportActivity ? (message ? <div style={{ borderRadius: 10, border: "1px solid rgba(120,220,150,0.24)", background: "rgba(70,180,100,0.12)", color: "#d7ffe2", padding: "10px 12px", fontSize: 12 }}>{message}</div> : null) : null}
              {!exportActivity ? (error ? <div style={{ borderRadius: 10, border: "1px solid rgba(255,120,120,0.22)", background: "rgba(255,80,80,0.08)", color: "#ffd0d0", padding: "10px 12px", fontSize: 12 }}>{error}</div> : null) : null}
              {exportActivity && !hideInlineExportActivity ? (
                <div style={{ borderRadius: 12, border: exportActivity.status === "error" ? "1px solid rgba(255,120,120,0.22)" : exportActivity.status === "success" ? "1px solid rgba(120,220,150,0.24)" : "1px solid rgba(120,190,255,0.22)", background: exportActivity.status === "error" ? "rgba(255,80,80,0.08)" : exportActivity.status === "success" ? "rgba(70,180,100,0.12)" : "rgba(92,149,230,0.12)", padding: "11px 12px", display: "grid", gap: 8 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, fontWeight: 700 }}>
                      {exportActivity.status === "success" ? <span style={{ fontSize: 13 }}>Done</span> : exportActivity.status === "error" ? <span style={{ fontSize: 13 }}>Error</span> : exportActivity.status === "cancelled" ? <span style={{ fontSize: 13 }}>Stopped</span> : <SpinnerIcon />}
                      <span>{exportActivity.label}</span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      {exportActivity.cancellable ? (
                        <button type="button" onClick={handleCancelExport} aria-label="Stop export" title="Stop export" style={{ width: 28, height: 28, borderRadius: 8, border: "1px solid rgba(255,255,255,0.14)", background: "rgba(255,255,255,0.06)", color: "white", cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
                          <StopIcon />
                        </button>
                      ) : null}
                      <button type="button" onClick={() => setHideInlineExportActivity(true)} aria-label="Close export status" style={{ width: 28, height: 28, borderRadius: 8, border: "1px solid rgba(255,255,255,0.14)", background: "rgba(255,255,255,0.04)", color: "white", cursor: "pointer", fontSize: 12, fontWeight: 700 }}>
                        ×
                      </button>
                    </div>
                  </div>
                  <div style={{ fontSize: 11.5, opacity: 0.72 }}>
                    {exportActivity.sourceName}
                  </div>
                  {exportActivity.detail ? (
                    <div style={{ fontSize: 11, opacity: 0.66, lineHeight: 1.45 }}>
                      {exportActivity.detail}
                    </div>
                  ) : null}
                  <div style={{ height: 7, borderRadius: 999, background: "rgba(255,255,255,0.10)", overflow: "hidden", position: "relative" }}>
                    {typeof exportActivity.progress === "number" ? (
                      <div style={{ position: "absolute", inset: 0, width: `${Math.max(4, Math.min(100, Math.round(exportActivity.progress * 100)))}%`, background: "linear-gradient(90deg, rgba(92,149,230,0.95), rgba(180,220,255,0.95))", transition: "width 180ms ease" }} />
                    ) : exportActivity.status === "success" || exportActivity.status === "error" || exportActivity.status === "cancelled" ? (
                      <div style={{ position: "absolute", inset: 0, width: "100%", background: exportActivity.status === "success" ? "linear-gradient(90deg, rgba(70,180,100,0.92), rgba(160,240,190,0.95))" : exportActivity.status === "cancelled" ? "linear-gradient(90deg, rgba(190,190,190,0.6), rgba(230,230,230,0.75))" : "linear-gradient(90deg, rgba(255,110,110,0.86), rgba(255,180,180,0.9))" }} />
                    ) : (
                      <div style={{ position: "absolute", inset: 0, transform: "translateX(-100%)", background: "linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(140,190,255,0.18) 18%, rgba(180,220,255,0.92) 50%, rgba(140,190,255,0.18) 82%, rgba(255,255,255,0) 100%)", animation: "source-manager-progress 1.2s ease-in-out infinite" }} />
                    )}
                  </div>
                </div>
              ) : null}

              <div className="layer-panel-scroll" style={{ flex: 1, minHeight: 0, display: "grid", gridAutoRows: "max-content", alignContent: "start", gap: 10, paddingRight: 4 }}>
                {!loading && filteredItems.length === 0 ? (
                  <div data-theme-surface="soft" style={{ minHeight: 160, borderRadius: 14, border: "1px dashed rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.02)", display: "flex", alignItems: "center", justifyContent: "center", textAlign: "center", padding: 20, color: "rgba(255,255,255,0.72)", fontSize: 13 }}>
                    No data source matches the current filters.
                  </div>
                ) : null}

                {filteredItems.map((item, itemIndex) => {
                  const isRenaming = renamingId === item.id;
                  const isSelected = selectedIds.includes(item.id);
                  const typeLabel = item.sourceType === "local" ? "BROWSER DATA" : "EXTERNAL SOURCE";
                  const inspectionState = localInspectionStatus[item.id]?.status ?? (localInspectionCache[item.id] ? "ready" : "idle");
                  const inspectionError = localInspectionStatus[item.id]?.error ?? null;
                  const flipMenusUp = itemIndex >= Math.max(0, filteredItems.length - 2);

                  return (
                    <div
                      key={item.id}
                      onClick={(event) => handleSelectItem(item.id, event)}
                      onDoubleClick={() => openSourceDetails(item.id)}
                      style={{
                        borderRadius: 14,
                        border: isSelected ? "1px solid rgba(160,220,255,0.85)" : "1px solid rgba(255,255,255,0.08)",
                        background: isSelected ? "rgba(92,149,230,0.18)" : "rgba(255,255,255,0.04)",
                        boxShadow: "none",
                        padding: 14,
                        display: "grid",
                        gap: 10,
                        cursor: renamingId ? "default" : "pointer",
                        userSelect: "none",
                        WebkitUserSelect: "none",
                        transition: "border-color 180ms ease, background 180ms ease, box-shadow 220ms ease",
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
                                style={{ width: "100%", height: 36, borderRadius: 10, border: "1px solid rgba(160,220,255,0.35)", background: "rgba(255,255,255,0.06)", color: "white", padding: "0 10px", boxSizing: "border-box", outline: "none" }}
                              />
                            ) : (
                              <div style={{ fontSize: 14, fontWeight: 700, lineHeight: 1.35, wordBreak: "break-word" }}>{item.name}</div>
                            )}
                            <div data-theme-text="muted" style={{ fontSize: 12, opacity: 0.72, marginTop: 6, lineHeight: 1.45 }}>
                              {item.subtitle}
                            </div>
                            <div data-theme-text="muted" style={{ fontSize: 11, opacity: 0.62, marginTop: 6, display: "flex", gap: 10, flexWrap: "wrap" }}>
                              <span>{item.details}</span>
                              <span>Updated: {formatDate(item.updatedAt)}</span>
                            </div>
                          </div>
                        </div>

                        <div style={{ display: "flex", gap: 8, flexShrink: 0, alignItems: "center" }} onClick={(event) => event.stopPropagation()} onMouseDown={(event) => event.stopPropagation()}>
                          <span style={{ height: 22, padding: "0 8px", borderRadius: 999, border: item.sourceType === "local" ? "1px solid rgba(255,210,120,0.26)" : "1px solid rgba(120,190,255,0.26)", background: item.sourceType === "local" ? "rgba(255,210,120,0.12)" : "rgba(120,190,255,0.12)", color: item.sourceType === "local" ? "#ffe4ad" : "#d9f0ff", fontSize: 10, fontWeight: 700, display: "inline-flex", alignItems: "center" }}>
                            {typeLabel}
                          </span>

                          {isRenaming ? (
                            <>
                              <button type="button" onClick={() => void handleRename(item)} style={{ height: 34, padding: "0 12px", borderRadius: 10, border: "1px solid rgba(160,220,255,0.35)", background: "rgba(120,190,255,0.18)", color: "white", cursor: "pointer", fontSize: 12, fontWeight: 700 }}>Save</button>
                              <button type="button" onClick={() => { setRenamingId(null); setRenameDraft(""); }} style={{ height: 34, padding: "0 12px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.10)", background: "rgba(255,255,255,0.05)", color: "white", cursor: "pointer", fontSize: 12, fontWeight: 700 }}>Cancel</button>
                            </>
                          ) : (
                            <>
                              {item.sourceType === "local" || item.sourceType === "external" ? (
                                <div style={{ position: "relative" }} onPointerDown={(event) => event.stopPropagation()}>
                                  <button
                                    type="button"
                                    title="Export source"
                                    onClick={() => {
                                      setOpenMenuId(null);
                                      if (item.sourceType === "local" && !localInspectionCache[item.id] && inspectionState !== "loading") {
                                        void ensureLocalInspection(item).catch(() => {});
                                      }
                                      setOpenExportMenuId((prev) => prev === item.id ? null : item.id);
                                    }}
                                    style={{ height: 30, padding: "0 10px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.9)", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, cursor: "pointer", fontSize: 11, fontWeight: 700 }}
                                  >
                                    <ExportIcon />
                                    <span>Export</span>
                                    <ChevronDownIcon />
                                  </button>
                                  {openExportMenuId === item.id ? (
                                    <div style={{ position: "absolute", ...(flipMenusUp ? { bottom: 36 } : { top: 36 }), right: 0, minWidth: 188, borderRadius: 12, border: "1px solid rgba(255,255,255,0.10)", background: "rgba(18,22,28,0.98)", boxShadow: "0 20px 40px rgba(0,0,0,0.35)", padding: 6, display: "grid", gap: 4, zIndex: 3 }} onPointerDown={(event) => event.stopPropagation()}>
                                      {item.sourceType === "local" ? (
                                        <>
                                      <button type="button" onClick={() => void handleExportLocalSource(item, "original")} disabled={exportingSourceId === item.id} style={{ height: 34, borderRadius: 8, border: "none", background: "transparent", color: "white", cursor: "pointer", textAlign: "left", padding: "0 10px", fontSize: 12, opacity: exportingSourceId === item.id ? 0.6 : 1 }}>
                                        Original{item.record.kind === "tree" ? " (ZIP archive)" : ""}
                                      </button>
                                      <button type="button" onClick={() => void handleExportLocalSource(item, "zip")} disabled={exportingSourceId === item.id} style={{ height: 34, borderRadius: 8, border: "none", background: "transparent", color: "white", cursor: "pointer", textAlign: "left", padding: "0 10px", fontSize: 12, opacity: exportingSourceId === item.id ? 0.6 : 1 }}>
                                        ZIP
                                      </button>
                                      {inspectionState === "loading" ? (
                                        <div style={{ height: 34, borderRadius: 8, color: "rgba(255,255,255,0.76)", padding: "0 10px", fontSize: 11.5, display: "flex", alignItems: "center", gap: 8 }}>
                                          <SpinnerIcon />
                                          <span>Analyzing export formats…</span>
                                        </div>
                                      ) : null}
                                      {inspectionState === "ready" ? (
                                        <div style={{ height: 28, borderRadius: 8, color: "rgba(180,220,255,0.78)", padding: "0 10px", fontSize: 11, display: "flex", alignItems: "center" }}>
                                          Export analysis ready
                                        </div>
                                      ) : null}
                                      {inspectionState === "error" ? (
                                        <div style={{ borderRadius: 8, color: "#ffd0d0", padding: "6px 10px", fontSize: 11.5, lineHeight: 1.4 }}>
                                          {inspectionError ?? "Failed to inspect this source."}
                                        </div>
                                      ) : null}
                                      {localInspectionCache[item.id]?.inspection.kind === "volume" ? (
                                        <>
                                          <button type="button" onClick={() => void handleExportLocalSource(item, "nrrd")} disabled={exportingSourceId === item.id} style={{ height: 34, borderRadius: 8, border: "none", background: "transparent", color: "white", cursor: "pointer", textAlign: "left", padding: "0 10px", fontSize: 12, opacity: exportingSourceId === item.id ? 0.6 : 1 }}>
                                            NRRD
                                          </button>
                                          <button type="button" onClick={() => void handleExportLocalSource(item, "nii")} disabled={exportingSourceId === item.id} style={{ height: 34, borderRadius: 8, border: "none", background: "transparent", color: "white", cursor: "pointer", textAlign: "left", padding: "0 10px", fontSize: 12, opacity: exportingSourceId === item.id ? 0.6 : 1 }}>
                                            NIfTI
                                          </button>
                                          <button type="button" onClick={() => void handleExportLocalSource(item, "ome-zarr")} disabled={exportingSourceId === item.id} style={{ height: 34, borderRadius: 8, border: "none", background: "transparent", color: "white", cursor: "pointer", textAlign: "left", padding: "0 10px", fontSize: 12, opacity: exportingSourceId === item.id ? 0.6 : 1 }}>
                                            OME-Zarr
                                          </button>
                                          <button type="button" onClick={() => void handleExportLocalSource(item, "zarr")} disabled={exportingSourceId === item.id} style={{ height: 34, borderRadius: 8, border: "none", background: "transparent", color: "white", cursor: "pointer", textAlign: "left", padding: "0 10px", fontSize: 12, opacity: exportingSourceId === item.id ? 0.6 : 1 }}>
                                            Zarr
                                          </button>
                                        </>
                                      ) : null}
                                        </>
                                      ) : null}
                                      {item.sourceType === "external" ? (
                                        isExternalVolumeExportSupported(item) ? (
                                          <>
                                            <div style={{ borderRadius: 8, color: "rgba(180,220,255,0.78)", padding: "6px 10px", fontSize: 11, lineHeight: 1.4 }}>
                          Exports the best remote data the browser can handle.
                        </div>
                        <button type="button" onClick={() => void handleExportExternalSource(item, "original")} disabled={exportingSourceId === item.id} style={{ height: 34, borderRadius: 8, border: "none", background: "transparent", color: "white", cursor: "pointer", textAlign: "left", padding: "0 10px", fontSize: 12, opacity: exportingSourceId === item.id ? 0.6 : 1 }}>
                          Original (ZIP archive)
                        </button>
                        <button type="button" onClick={() => void handleExportExternalSource(item, "zip")} disabled={exportingSourceId === item.id} style={{ height: 34, borderRadius: 8, border: "none", background: "transparent", color: "white", cursor: "pointer", textAlign: "left", padding: "0 10px", fontSize: 12, opacity: exportingSourceId === item.id ? 0.6 : 1 }}>
                          ZIP
                        </button>
                        <button type="button" onClick={() => void handleExportExternalSource(item, "nrrd")} disabled={exportingSourceId === item.id} style={{ height: 34, borderRadius: 8, border: "none", background: "transparent", color: "white", cursor: "pointer", textAlign: "left", padding: "0 10px", fontSize: 12, opacity: exportingSourceId === item.id ? 0.6 : 1 }}>
                          NRRD
                        </button>
                                            <button type="button" onClick={() => void handleExportExternalSource(item, "nii")} disabled={exportingSourceId === item.id} style={{ height: 34, borderRadius: 8, border: "none", background: "transparent", color: "white", cursor: "pointer", textAlign: "left", padding: "0 10px", fontSize: 12, opacity: exportingSourceId === item.id ? 0.6 : 1 }}>
                                              NIfTI
                                            </button>
                                            <button type="button" onClick={() => void handleExportExternalSource(item, "ome-zarr")} disabled={exportingSourceId === item.id} style={{ height: 34, borderRadius: 8, border: "none", background: "transparent", color: "white", cursor: "pointer", textAlign: "left", padding: "0 10px", fontSize: 12, opacity: exportingSourceId === item.id ? 0.6 : 1 }}>
                                              OME-Zarr
                                            </button>
                                            <button type="button" onClick={() => void handleExportExternalSource(item, "zarr")} disabled={exportingSourceId === item.id} style={{ height: 34, borderRadius: 8, border: "none", background: "transparent", color: "white", cursor: "pointer", textAlign: "left", padding: "0 10px", fontSize: 12, opacity: exportingSourceId === item.id ? 0.6 : 1 }}>
                                              Zarr
                                            </button>
                                          </>
                                        ) : (
                                          <div style={{ borderRadius: 8, color: "#ffd0d0", padding: "6px 10px", fontSize: 11.5, lineHeight: 1.4 }}>
                                            External export currently supports public OME-Zarr sources only.
                                          </div>
                                        )
                                      ) : null}
                                    </div>
                                  ) : null}
                                </div>
                              ) : null}

                              <div style={{ position: "relative" }} onPointerDown={(event) => event.stopPropagation()}>
                                <button type="button" title="More" onClick={() => { setOpenExportMenuId(null); setOpenMenuId((prev) => prev === item.id ? null : item.id); }} style={{ width: 30, height: 30, borderRadius: 8, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.8)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}><MoreVertical /></button>
                                {openMenuId === item.id ? (
                                  <div style={{ position: "absolute", ...(flipMenusUp ? { bottom: 36 } : { top: 36 }), right: 0, minWidth: 156, borderRadius: 12, border: "1px solid rgba(255,255,255,0.10)", background: "rgba(18,22,28,0.98)", boxShadow: "0 20px 40px rgba(0,0,0,0.35)", padding: 6, display: "grid", gap: 4, zIndex: 2 }} onPointerDown={(event) => event.stopPropagation()}>
                                    <button type="button" onClick={() => { setRenamingId(item.id); setRenameDraft(item.name); setOpenMenuId(null); }} style={{ height: 34, borderRadius: 8, border: "none", background: "transparent", color: "white", cursor: "pointer", textAlign: "left", padding: "0 10px", fontSize: 12 }}>Rename</button>
                                    <button type="button" onClick={() => requestDeleteTargets([item])} style={{ height: 34, borderRadius: 8, border: "none", background: "transparent", color: "#ffd0d0", cursor: "pointer", textAlign: "left", padding: "0 10px", fontSize: 12 }}>Delete</button>
                                  </div>
                                ) : null}
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div style={{ width: "50%", minWidth: "50%", height: "100%", paddingLeft: 10, boxSizing: "border-box", display: "flex", flexDirection: "column", gap: 14 }}>
              {detailItem ? (
                <>
                  {!exportActivity ? (message ? <div style={{ borderRadius: 10, border: "1px solid rgba(120,220,150,0.24)", background: "rgba(70,180,100,0.12)", color: "#d7ffe2", padding: "10px 12px", fontSize: 12 }}>{message}</div> : null) : null}
                  {!exportActivity ? (error ? <div style={{ borderRadius: 10, border: "1px solid rgba(255,120,120,0.22)", background: "rgba(255,80,80,0.08)", color: "#ffd0d0", padding: "10px 12px", fontSize: 12 }}>{error}</div> : null) : null}
                  {exportActivity && !hideInlineExportActivity ? (
                    <div style={{ borderRadius: 12, border: exportActivity.status === "error" ? "1px solid rgba(255,120,120,0.22)" : exportActivity.status === "success" ? "1px solid rgba(120,220,150,0.24)" : "1px solid rgba(120,190,255,0.22)", background: exportActivity.status === "error" ? "rgba(255,80,80,0.08)" : exportActivity.status === "success" ? "rgba(70,180,100,0.12)" : "rgba(92,149,230,0.12)", padding: "11px 12px", display: "grid", gap: 8 }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, fontWeight: 700 }}>
                          {exportActivity.status === "success" ? <span style={{ fontSize: 13 }}>Done</span> : exportActivity.status === "error" ? <span style={{ fontSize: 13 }}>Error</span> : exportActivity.status === "cancelled" ? <span style={{ fontSize: 13 }}>Stopped</span> : <SpinnerIcon />}
                          <span>{exportActivity.label}</span>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          {exportActivity.cancellable ? (
                            <button type="button" onClick={handleCancelExport} aria-label="Stop export" title="Stop export" style={{ width: 28, height: 28, borderRadius: 8, border: "1px solid rgba(255,255,255,0.14)", background: "rgba(255,255,255,0.06)", color: "white", cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
                              <StopIcon />
                            </button>
                          ) : null}
                          <button type="button" onClick={() => setHideInlineExportActivity(true)} aria-label="Close export status" style={{ width: 28, height: 28, borderRadius: 8, border: "1px solid rgba(255,255,255,0.14)", background: "rgba(255,255,255,0.04)", color: "white", cursor: "pointer", fontSize: 12, fontWeight: 700 }}>
                            ×
                          </button>
                        </div>
                      </div>
                      <div style={{ fontSize: 11.5, opacity: 0.72 }}>
                        {exportActivity.sourceName}
                      </div>
                      {exportActivity.detail ? (
                        <div style={{ fontSize: 11, opacity: 0.66, lineHeight: 1.45 }}>
                          {exportActivity.detail}
                        </div>
                      ) : null}
                      <div style={{ height: 7, borderRadius: 999, background: "rgba(255,255,255,0.10)", overflow: "hidden", position: "relative" }}>
                        {typeof exportActivity.progress === "number" ? (
                          <div style={{ position: "absolute", inset: 0, width: `${Math.max(4, Math.min(100, Math.round(exportActivity.progress * 100)))}%`, background: "linear-gradient(90deg, rgba(92,149,230,0.95), rgba(180,220,255,0.95))", transition: "width 180ms ease" }} />
                        ) : exportActivity.status === "success" || exportActivity.status === "error" || exportActivity.status === "cancelled" ? (
                          <div style={{ position: "absolute", inset: 0, width: "100%", background: exportActivity.status === "success" ? "linear-gradient(90deg, rgba(70,180,100,0.92), rgba(160,240,190,0.95))" : exportActivity.status === "cancelled" ? "linear-gradient(90deg, rgba(190,190,190,0.6), rgba(230,230,230,0.75))" : "linear-gradient(90deg, rgba(255,110,110,0.86), rgba(255,180,180,0.9))" }} />
                        ) : (
                          <div style={{ position: "absolute", inset: 0, transform: "translateX(-100%)", background: "linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(140,190,255,0.18) 18%, rgba(180,220,255,0.92) 50%, rgba(140,190,255,0.18) 82%, rgba(255,255,255,0) 100%)", animation: "source-manager-progress 1.2s ease-in-out infinite" }} />
                        )}
                      </div>
                    </div>
                  ) : null}

                  <div className="layer-panel-scroll" style={{ flex: 1, minHeight: 0, overflowY: "auto", display: "grid", gap: 14, paddingRight: 4 }}>
                    <div style={{ borderRadius: 14, border: "1px solid rgba(255,255,255,0.10)", background: "rgba(255,255,255,0.04)", padding: 14, display: "grid", gap: 10 }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                        <div style={{ display: "grid", gap: 4, minWidth: 0 }}>
                          <div style={{ fontSize: 15, fontWeight: 800, wordBreak: "break-word" }}>{detailItem.name}</div>
                          <div style={{ fontSize: 12, opacity: 0.72 }}>{detailItem.sourceType === "local" ? "Browser-hosted source" : `External source from ${formatProviderLabel(detailItem.source.provider)}`}</div>
                        </div>
                        <span style={{ height: 24, padding: "0 9px", borderRadius: 999, border: detailItem.sourceType === "local" ? "1px solid rgba(255,210,120,0.26)" : "1px solid rgba(120,190,255,0.28)", background: detailItem.sourceType === "local" ? "rgba(255,210,120,0.12)" : "rgba(92,149,230,0.18)", color: detailItem.sourceType === "local" ? "#ffe4ad" : "#d6e8ff", fontSize: 10.5, fontWeight: 800, display: "inline-flex", alignItems: "center", gap: 6 }}>
                          {detailItem.sourceType === "local" ? <DataIcon /> : <ChainIcon />}
                          <span>{detailItem.sourceType === "local" ? "BROWSER" : "EXTERNAL"}</span>
                        </span>
                      </div>

                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
                        <div style={{ borderRadius: 12, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.03)", padding: "10px 12px", display: "grid", gap: 4 }}>
                          <div style={{ fontSize: 11, opacity: 0.62, textTransform: "uppercase", letterSpacing: "0.04em" }}>Updated</div>
                          <div style={{ fontSize: 12, fontWeight: 700 }}>{formatDate(detailItem.updatedAt)}</div>
                        </div>
                        <div style={{ borderRadius: 12, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.03)", padding: "10px 12px", display: "grid", gap: 4 }}>
                          <div style={{ fontSize: 11, opacity: 0.62, textTransform: "uppercase", letterSpacing: "0.04em" }}>Stored size</div>
                          <div style={{ fontSize: 12, fontWeight: 700 }}>{formatBytes(detailItem.size)}</div>
                        </div>
                        <div style={{ borderRadius: 12, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.03)", padding: "10px 12px", display: "grid", gap: 4 }}>
                          <div style={{ fontSize: 11, opacity: 0.62, textTransform: "uppercase", letterSpacing: "0.04em" }}>Created</div>
                          <div style={{ fontSize: 12, fontWeight: 700 }}>{formatDate(detailItem.createdAt)}</div>
                        </div>
                      </div>
                    </div>

                    <div style={{ borderRadius: 14, border: "1px solid rgba(255,255,255,0.10)", background: "rgba(255,255,255,0.04)", padding: 14, display: "grid", gap: 12 }}>
                      <div style={{ fontSize: 13, fontWeight: 800 }}>Edit source</div>
                      <div style={{ display: "grid", gridTemplateColumns: detailItem.sourceType === "external" ? "1fr 1.4fr" : "1fr", gap: 10 }}>
                        <input
                          value={detailDraftName}
                          onChange={(event) => setDetailDraftName(event.target.value)}
                          placeholder="Source name"
                          style={{ width: "100%", height: 40, borderRadius: 10, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.05)", color: "white", padding: "0 12px", boxSizing: "border-box", outline: "none" }}
                        />
                        {detailItem.sourceType === "external" ? (
                          <input
                            value={detailDraftUrl}
                            onChange={(event) => setDetailDraftUrl(event.target.value)}
                            placeholder="Source URL"
                            style={{ width: "100%", height: 40, borderRadius: 10, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.05)", color: "white", padding: "0 12px", boxSizing: "border-box", outline: "none" }}
                          />
                        ) : null}
                      </div>
                      {detailSaveError ? (
                        <div style={{ borderRadius: 10, border: "1px solid rgba(255,120,120,0.22)", background: "rgba(255,80,80,0.08)", color: "#ffd0d0", padding: "10px 12px", fontSize: 12 }}>
                          {detailSaveError}
                        </div>
                      ) : null}
                    </div>

                    <div style={{ borderRadius: 14, border: "1px solid rgba(255,255,255,0.10)", background: "rgba(255,255,255,0.04)", padding: 14, display: "grid", gap: 12 }}>
                      <div style={{ fontSize: 13, fontWeight: 800 }}>Source metadata</div>
                      {detailItem.sourceType === "local" || detailItem.sourceType === "external" ? (
                        detailInspection.status === "loading" ? (
                          <div style={{ fontSize: 12, opacity: 0.72 }}>Loading source details…</div>
                        ) : detailInspection.status === "error" ? (
                          <div style={{ borderRadius: 10, border: "1px solid rgba(255,120,120,0.22)", background: "rgba(255,80,80,0.08)", color: "#ffd0d0", padding: "10px 12px", fontSize: 12 }}>
                            {detailInspection.error ?? "Failed to inspect this source."}
                          </div>
                        ) : detailInspection.candidate ? (
                          <>
                            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
                              <div style={{ borderRadius: 12, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.03)", padding: "10px 12px", display: "grid", gap: 4 }}>
                                <div style={{ fontSize: 11, opacity: 0.62, textTransform: "uppercase", letterSpacing: "0.04em" }}>Format</div>
                                <div style={{ fontSize: 12, fontWeight: 700 }}>{detailInspection.candidate.inspection.info.format.toUpperCase()}</div>
                              </div>
                              <div style={{ borderRadius: 12, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.03)", padding: "10px 12px", display: "grid", gap: 4 }}>
                                <div style={{ fontSize: 11, opacity: 0.62, textTransform: "uppercase", letterSpacing: "0.04em" }}>Kind</div>
                                <div style={{ fontSize: 12, fontWeight: 700 }}>{detailInspection.candidate.inspection.info.kind}</div>
                              </div>
                              <div style={{ borderRadius: 12, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.03)", padding: "10px 12px", display: "grid", gap: 4 }}>
                                <div style={{ fontSize: 11, opacity: 0.62, textTransform: "uppercase", letterSpacing: "0.04em" }}>Dimensions</div>
                                <div style={{ fontSize: 12, fontWeight: 700 }}>
                                  {detailInspection.candidate.inspection.info.dims
                                    ? `${detailInspection.candidate.inspection.info.dims.z} × ${detailInspection.candidate.inspection.info.dims.y} × ${detailInspection.candidate.inspection.info.dims.x}`
                                    : "Unknown"}
                                </div>
                              </div>
                              <div style={{ borderRadius: 12, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.03)", padding: "10px 12px", display: "grid", gap: 4 }}>
                                <div style={{ fontSize: 11, opacity: 0.62, textTransform: "uppercase", letterSpacing: "0.04em" }}>Voxel size</div>
                                <div style={{ fontSize: 12, fontWeight: 700 }}>
                                  {detailInspection.candidate.inspection.info.voxelSizeUm
                                    ? `${formatVoxelSizeValue(detailInspection.candidate.inspection.info.voxelSizeUm.z)} × ${formatVoxelSizeValue(detailInspection.candidate.inspection.info.voxelSizeUm.y)} × ${formatVoxelSizeValue(detailInspection.candidate.inspection.info.voxelSizeUm.x)} µm`
                                    : "Unknown"}
                                </div>
                              </div>
                            </div>

                            {detailInspection.candidate.inspection.info.availableScales?.length ? (
                              <div style={{ display: "grid", gap: 8 }}>
                                <div style={{ fontSize: 12, fontWeight: 700 }}>Available scales</div>
                                <div style={{ display: "grid", gap: 8 }}>
                                  {detailInspection.candidate.inspection.info.availableScales.map((scale) => (
                                    <div key={`${scale.datasetIndex}-${scale.datasetPath}`} style={{ borderRadius: 12, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.03)", padding: "10px 12px", display: "grid", gap: 4 }}>
                                      <div style={{ fontSize: 12, fontWeight: 700 }}>{getResolutionLabel(scale.resolutionLabel) || scale.resolutionLabel}</div>
                                      <div style={{ fontSize: 11.5, opacity: 0.72 }}>
                                        {scale.dims.z} × {scale.dims.y} × {scale.dims.x} · voxel {formatVoxelSizeValue(scale.voxelSizeUm.z)}/{formatVoxelSizeValue(scale.voxelSizeUm.y)}/{formatVoxelSizeValue(scale.voxelSizeUm.x)} µm
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            ) : null}
                          </>
                        ) : null
                      ) : (
                        <>
                          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
                            <div style={{ borderRadius: 12, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.03)", padding: "10px 12px", display: "grid", gap: 4 }}>
                              <div style={{ fontSize: 11, opacity: 0.62, textTransform: "uppercase", letterSpacing: "0.04em" }}>Provider</div>
                              <div style={{ fontSize: 12, fontWeight: 700 }}>{formatProviderLabel(detailExternalItem?.source.provider ?? "unknown")}</div>
                            </div>
                            <div style={{ borderRadius: 12, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.03)", padding: "10px 12px", display: "grid", gap: 4 }}>
                              <div style={{ fontSize: 11, opacity: 0.62, textTransform: "uppercase", letterSpacing: "0.04em" }}>Format</div>
                              <div style={{ fontSize: 12, fontWeight: 700 }}>{(detailExternalItem?.source.remoteFormat ?? "ome-zarr").toUpperCase()}</div>
                            </div>
                            <div style={{ borderRadius: 12, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.03)", padding: "10px 12px", display: "grid", gap: 4 }}>
                              <div style={{ fontSize: 11, opacity: 0.62, textTransform: "uppercase", letterSpacing: "0.04em" }}>Available scales</div>
                              <div style={{ fontSize: 12, fontWeight: 700 }}>{detailExternalItem?.source.availableScales?.length ?? 0}</div>
                            </div>
                            <div style={{ borderRadius: 12, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.03)", padding: "10px 12px", display: "grid", gap: 4 }}>
                              <div style={{ fontSize: 11, opacity: 0.62, textTransform: "uppercase", letterSpacing: "0.04em" }}>Recommended</div>
                              <div style={{ fontSize: 12, fontWeight: 700 }}>{getResolutionLabel(detailExternalItem?.source.recommendedResolution) || detailExternalItem?.source.recommendedResolution || "Unknown"}</div>
                            </div>
                          </div>

                          <div style={{ borderRadius: 12, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.03)", padding: "10px 12px", display: "grid", gap: 4 }}>
                            <div style={{ fontSize: 11, opacity: 0.62, textTransform: "uppercase", letterSpacing: "0.04em" }}>Source URL</div>
                            <div style={{ fontSize: 12, lineHeight: 1.5, wordBreak: "break-word" }}>{detailExternalItem?.source.url ?? ""}</div>
                          </div>

                          {detailExternalItem?.source.availableScales?.length ? (
                            <div style={{ display: "grid", gap: 8 }}>
                              <div style={{ fontSize: 12, fontWeight: 700 }}>Detected scales</div>
                              <div style={{ display: "grid", gap: 8 }}>
                                {detailExternalItem.source.availableScales.map((scale) => (
                                  <div key={`${scale.datasetIndex}-${scale.datasetPath}`} style={{ borderRadius: 12, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.03)", padding: "10px 12px", display: "grid", gap: 4 }}>
                                    <div style={{ fontSize: 12, fontWeight: 700 }}>{getResolutionLabel(scale.resolutionLabel) || scale.resolutionLabel}</div>
                                    <div style={{ fontSize: 11.5, opacity: 0.72 }}>
                                      {scale.dims.z} × {scale.dims.y} × {scale.dims.x} · voxel {formatVoxelSizeValue(scale.voxelSizeUm.z)}/{formatVoxelSizeValue(scale.voxelSizeUm.y)}/{formatVoxelSizeValue(scale.voxelSizeUm.x)} µm
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ) : null}
                        </>
                      )}
                    </div>
                  </div>

                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                    <button
                      type="button"
                      onClick={() => requestDeleteTargets([detailItem])}
                      style={{ height: 40, padding: "0 14px", borderRadius: 10, border: "1px solid rgba(255,120,120,0.32)", background: "rgba(255,80,80,0.14)", color: "#ffd0d0", cursor: "pointer", fontSize: 12, fontWeight: 700, display: "inline-flex", alignItems: "center", gap: 8 }}
                    >
                      <TrashIcon />
                      <span>Delete</span>
                    </button>
                    <div style={{ display: "flex", gap: 10 }}>
                      {detailItem.sourceType === "local" ? (
                        <div style={{ position: "relative" }} onPointerDown={(event) => event.stopPropagation()}>
                          <button
                            type="button"
                            onClick={() => {
                              if (detailItem.sourceType === "local" && !localInspectionCache[detailItem.id] && (localInspectionStatus[detailItem.id]?.status ?? "idle") !== "loading") {
                                void ensureLocalInspection(detailItem).catch(() => {});
                              }
                              setOpenExportMenuId((prev) => prev === detailItem.id ? null : detailItem.id);
                            }}
                            style={{ height: 40, padding: "0 14px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.10)", background: "rgba(255,255,255,0.05)", color: "white", cursor: "pointer", fontSize: 12, fontWeight: 700, display: "inline-flex", alignItems: "center", gap: 8 }}
                          >
                            <ExportIcon />
                            <span>Export</span>
                            <ChevronDownIcon />
                          </button>
                          {openExportMenuId === detailItem.id ? (
                            <div style={{ position: "absolute", bottom: 46, right: 0, minWidth: 180, borderRadius: 12, border: "1px solid rgba(255,255,255,0.10)", background: "rgba(18,22,28,0.98)", boxShadow: "0 20px 40px rgba(0,0,0,0.35)", padding: 6, display: "grid", gap: 4, zIndex: 3 }} onPointerDown={(event) => event.stopPropagation()}>
                              {detailItem.sourceType === "local" ? (
                                <>
                              <button type="button" onClick={() => void handleExportLocalSource(detailItem, "original")} disabled={exportingSourceId === detailItem.id} style={{ height: 34, borderRadius: 8, border: "none", background: "transparent", color: "white", cursor: "pointer", textAlign: "left", padding: "0 10px", fontSize: 12, opacity: exportingSourceId === detailItem.id ? 0.6 : 1 }}>
                                Original{detailItem.record.kind === "tree" ? " (ZIP archive)" : ""}
                              </button>
                              <button type="button" onClick={() => void handleExportLocalSource(detailItem, "zip")} disabled={exportingSourceId === detailItem.id} style={{ height: 34, borderRadius: 8, border: "none", background: "transparent", color: "white", cursor: "pointer", textAlign: "left", padding: "0 10px", fontSize: 12, opacity: exportingSourceId === detailItem.id ? 0.6 : 1 }}>
                                ZIP
                              </button>
                              {(localInspectionStatus[detailItem.id]?.status ?? (localInspectionCache[detailItem.id] ? "ready" : "idle")) === "loading" ? (
                                <div style={{ height: 34, borderRadius: 8, color: "rgba(255,255,255,0.76)", padding: "0 10px", fontSize: 11.5, display: "flex", alignItems: "center", gap: 8 }}>
                                  <SpinnerIcon />
                                  <span>Analyzing export formats…</span>
                                </div>
                              ) : null}
                              {(localInspectionStatus[detailItem.id]?.status ?? (localInspectionCache[detailItem.id] ? "ready" : "idle")) === "ready" ? (
                                <div style={{ height: 28, borderRadius: 8, color: "rgba(180,220,255,0.78)", padding: "0 10px", fontSize: 11, display: "flex", alignItems: "center" }}>
                                  Export analysis ready
                                </div>
                              ) : null}
                              {(localInspectionStatus[detailItem.id]?.status ?? "idle") === "error" ? (
                                <div style={{ borderRadius: 8, color: "#ffd0d0", padding: "6px 10px", fontSize: 11.5, lineHeight: 1.4 }}>
                                  {localInspectionStatus[detailItem.id]?.error ?? "Failed to inspect this source."}
                                </div>
                              ) : null}
                              {localInspectionCache[detailItem.id]?.inspection.kind === "volume" ? (
                                <>
                                  <button type="button" onClick={() => void handleExportLocalSource(detailItem, "nrrd")} disabled={exportingSourceId === detailItem.id} style={{ height: 34, borderRadius: 8, border: "none", background: "transparent", color: "white", cursor: "pointer", textAlign: "left", padding: "0 10px", fontSize: 12, opacity: exportingSourceId === detailItem.id ? 0.6 : 1 }}>
                                    NRRD
                                  </button>
                                  <button type="button" onClick={() => void handleExportLocalSource(detailItem, "nii")} disabled={exportingSourceId === detailItem.id} style={{ height: 34, borderRadius: 8, border: "none", background: "transparent", color: "white", cursor: "pointer", textAlign: "left", padding: "0 10px", fontSize: 12, opacity: exportingSourceId === detailItem.id ? 0.6 : 1 }}>
                                    NIfTI
                                  </button>
                                  <button type="button" onClick={() => void handleExportLocalSource(detailItem, "ome-zarr")} disabled={exportingSourceId === detailItem.id} style={{ height: 34, borderRadius: 8, border: "none", background: "transparent", color: "white", cursor: "pointer", textAlign: "left", padding: "0 10px", fontSize: 12, opacity: exportingSourceId === detailItem.id ? 0.6 : 1 }}>
                                    OME-Zarr
                                  </button>
                                  <button type="button" onClick={() => void handleExportLocalSource(detailItem, "zarr")} disabled={exportingSourceId === detailItem.id} style={{ height: 34, borderRadius: 8, border: "none", background: "transparent", color: "white", cursor: "pointer", textAlign: "left", padding: "0 10px", fontSize: 12, opacity: exportingSourceId === detailItem.id ? 0.6 : 1 }}>
                                    Zarr
                                  </button>
                                </>
                              ) : null}
                                </>
                              ) : null}
                              {detailExternalItem ? (
                                isExternalVolumeExportSupported(detailExternalItem) ? (
                                  <>
                                    <div style={{ borderRadius: 8, color: "rgba(180,220,255,0.78)", padding: "6px 10px", fontSize: 11, lineHeight: 1.4 }}>
                  Exports the best remote data the browser can handle.
                </div>
                <button type="button" onClick={() => void handleExportExternalSource(detailExternalItem, "original")} disabled={exportingSourceId === detailExternalItem.id} style={{ height: 34, borderRadius: 8, border: "none", background: "transparent", color: "white", cursor: "pointer", textAlign: "left", padding: "0 10px", fontSize: 12, opacity: exportingSourceId === detailExternalItem.id ? 0.6 : 1 }}>
                  Original (ZIP archive)
                </button>
                <button type="button" onClick={() => void handleExportExternalSource(detailExternalItem, "zip")} disabled={exportingSourceId === detailExternalItem.id} style={{ height: 34, borderRadius: 8, border: "none", background: "transparent", color: "white", cursor: "pointer", textAlign: "left", padding: "0 10px", fontSize: 12, opacity: exportingSourceId === detailExternalItem.id ? 0.6 : 1 }}>
                  ZIP
                </button>
                <button type="button" onClick={() => void handleExportExternalSource(detailExternalItem, "nrrd")} disabled={exportingSourceId === detailExternalItem.id} style={{ height: 34, borderRadius: 8, border: "none", background: "transparent", color: "white", cursor: "pointer", textAlign: "left", padding: "0 10px", fontSize: 12, opacity: exportingSourceId === detailExternalItem.id ? 0.6 : 1 }}>
                  NRRD
                </button>
                                    <button type="button" onClick={() => void handleExportExternalSource(detailExternalItem, "nii")} disabled={exportingSourceId === detailExternalItem.id} style={{ height: 34, borderRadius: 8, border: "none", background: "transparent", color: "white", cursor: "pointer", textAlign: "left", padding: "0 10px", fontSize: 12, opacity: exportingSourceId === detailExternalItem.id ? 0.6 : 1 }}>
                                      NIfTI
                                    </button>
                                    <button type="button" onClick={() => void handleExportExternalSource(detailExternalItem, "ome-zarr")} disabled={exportingSourceId === detailExternalItem.id} style={{ height: 34, borderRadius: 8, border: "none", background: "transparent", color: "white", cursor: "pointer", textAlign: "left", padding: "0 10px", fontSize: 12, opacity: exportingSourceId === detailExternalItem.id ? 0.6 : 1 }}>
                                      OME-Zarr
                                    </button>
                                    <button type="button" onClick={() => void handleExportExternalSource(detailExternalItem, "zarr")} disabled={exportingSourceId === detailExternalItem.id} style={{ height: 34, borderRadius: 8, border: "none", background: "transparent", color: "white", cursor: "pointer", textAlign: "left", padding: "0 10px", fontSize: 12, opacity: exportingSourceId === detailExternalItem.id ? 0.6 : 1 }}>
                                      Zarr
                                    </button>
                                  </>
                                ) : (
                                  <div style={{ borderRadius: 8, color: "#ffd0d0", padding: "6px 10px", fontSize: 11.5, lineHeight: 1.4 }}>
                                    External export currently supports public OME-Zarr sources only.
                                  </div>
                                )
                              ) : null}
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => setDetailSourceId(null)}
                        style={{ height: 40, padding: "0 14px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.10)", background: "rgba(255,255,255,0.05)", color: "white", cursor: "pointer", fontSize: 12, fontWeight: 700 }}
                      >
                        Back
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleSaveDetailSource()}
                        disabled={detailSaving}
                        style={{ height: 40, padding: "0 14px", borderRadius: 10, border: "1px solid rgba(160,220,255,0.35)", background: "rgba(120,190,255,0.18)", color: "white", cursor: "pointer", opacity: detailSaving ? 0.6 : 1, fontSize: 12, fontWeight: 700 }}
                      >
                        {detailSaving ? "Saving…" : "Save changes"}
                      </button>
                    </div>
                  </div>
                </>
              ) : (
                <div />
              )}
            </div>
          </div>
        </div>
      </div>

      {currentPendingDeleteTarget
        ? createPortal(
            <div
              onClick={handleCancelDeleteReview}
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
                  width: "min(480px, calc(100vw - 32px))",
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
                  <div style={{ fontSize: 16, fontWeight: 800 }}>
                    Delete data source{pendingDeleteTargets && pendingDeleteTargets.length > 1 ? ` ${pendingDeleteIndex + 1} of ${pendingDeleteTargets.length}` : ""}?
                  </div>
                  <div style={{ fontSize: 12, opacity: 0.76, marginTop: 4, lineHeight: 1.45 }}>
                    {currentPendingDeleteTarget.sourceType === "local"
                      ? "This browser-hosted dataset will be removed from this browser."
                      : "This saved external source entry will be removed from the source library."}
                  </div>
                </div>

                <div style={{ borderRadius: 12, border: "1px solid rgba(255,255,255,0.10)", background: "rgba(255,255,255,0.04)", padding: "12px 14px", display: "grid", gap: 6 }}>
                  <div style={{ fontSize: 13, fontWeight: 700 }}>{currentPendingDeleteTarget.name}</div>
                  <div style={{ fontSize: 11.5, opacity: 0.72, lineHeight: 1.45 }}>{currentPendingDeleteTarget.details}</div>
                </div>

                {deleteUsageSummary ? (
                  <div style={{ display: "grid", gap: 10 }}>
                    {deleteUsageSummary.breakingCurrentViewerMatches.length > 0 || deleteUsageSummary.breakingSavedViewerMatches.length > 0 ? (
                      <div style={{ borderRadius: 12, border: "1px solid rgba(255,120,120,0.24)", background: "rgba(255,80,80,0.10)", padding: "12px 14px", display: "grid", gap: 8 }}>
                        <div style={{ fontSize: 12, fontWeight: 800, color: "#ffd0d0" }}>
                          Warning: deleting this browser-hosted data will break layers that still depend on it.
                        </div>
                        {deleteUsageSummary.breakingCurrentViewerMatches.length > 0 ? (
                          <div style={{ fontSize: 11.5, lineHeight: 1.5 }}>
                            Current viewer: {deleteUsageSummary.breakingCurrentViewerMatches.join(", ")}
                          </div>
                        ) : null}
                        {deleteUsageSummary.breakingSavedViewerMatches.map((match) => (
                          <div key={`saved-${match.viewerName}`} style={{ fontSize: 11.5, lineHeight: 1.5 }}>
                            Saved viewer "{match.viewerName}": {match.layerNames.join(", ")}
                          </div>
                        ))}
                      </div>
                    ) : null}

                    {currentPendingDeleteTarget.sourceType === "external" && (deleteUsageSummary.nonBreakingCurrentViewerMatches.length > 0 || deleteUsageSummary.nonBreakingSavedViewerMatches.length > 0) ? (
                      <div style={{ borderRadius: 12, border: "1px solid rgba(120,190,255,0.24)", background: "rgba(120,190,255,0.10)", padding: "12px 14px", display: "grid", gap: 8 }}>
                        <div style={{ fontSize: 12, fontWeight: 800, color: "#d6e8ff" }}>
                          Existing layers using this URL should keep working. This only removes the saved source entry.
                        </div>
                        {deleteUsageSummary.nonBreakingCurrentViewerMatches.length > 0 ? (
                          <div style={{ fontSize: 11.5, lineHeight: 1.5 }}>
                            Current viewer: {deleteUsageSummary.nonBreakingCurrentViewerMatches.join(", ")}
                          </div>
                        ) : null}
                        {deleteUsageSummary.nonBreakingSavedViewerMatches.map((match) => (
                          <div key={`saved-external-${match.viewerName}`} style={{ fontSize: 11.5, lineHeight: 1.5 }}>
                            Saved viewer "{match.viewerName}": {match.layerNames.join(", ")}
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ) : null}

                <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
                  <button
                    type="button"
                    onClick={handleCancelDeleteReview}
                    style={{ height: 38, padding: "0 12px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.10)", background: "rgba(255,255,255,0.05)", color: "white", cursor: "pointer", fontSize: 12, fontWeight: 700 }}
                  >
                    Cancel all
                  </button>
                  {pendingDeleteTargets && pendingDeleteTargets.length > 1 ? (
                    <button
                      type="button"
                      onClick={handleSkipCurrentDelete}
                      style={{ height: 38, padding: "0 12px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.10)", background: "rgba(255,255,255,0.05)", color: "white", cursor: "pointer", fontSize: 12, fontWeight: 700 }}
                    >
                      Skip
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => void handleConfirmCurrentDelete()}
                    style={{ height: 38, padding: "0 12px", borderRadius: 10, border: "1px solid rgba(255,120,120,0.32)", background: "rgba(255,80,80,0.14)", color: "#ffd0d0", cursor: "pointer", fontSize: 12, fontWeight: 700, display: "inline-flex", alignItems: "center", gap: 8 }}
                  >
                    <TrashIcon />
                    <span>Delete</span>
                  </button>
                </div>
              </div>
            </div>,
            document.body
          )
        : null}
    </div>
  );
}
