import { useEffect, useMemo, useRef, useState } from "react";
import { APP_PREFERENCES_STORAGE_KEY } from "./appPreferencesStore";
import { APP_ASSISTANT_CONVERSATIONS_STORAGE_KEY } from "./appAssistant";
import { AUTOMATION_CUSTOM_TOOLS_STORAGE_KEY, AUTOMATION_PIPELINES_STORAGE_KEY } from "./automationStore";
import { ANONYMOUS_USER_DATA_STORAGE_KEY } from "./customSourceStore";
import { listLocalDatasetRecords } from "./localDataStore";
import { SHORTCUT_BINDINGS_STORAGE_KEY } from "./shortcutStore";
import { VIEWER_HISTORY_STORAGE_KEY } from "./viewerHistory";
import { VIEWER_LIBRARY_STORAGE_KEY } from "./viewerLibrary";
import { VIEWER_STATE_STORAGE_KEY } from "./viewerStateStorage";

export type ResourceMetricId = "cpu" | "gpu" | "ram";

export type ResourceHistorySample = {
  timestamp: number;
  cpuPercent: number;
  gpuPercent: number;
  ramPercent: number;
};

export type ResourceProcessKind =
  | "worker"
  | "automation"
  | "assistant"
  | "storage"
  | "task";

export type ResourceProcess = {
  id: string;
  kind: ResourceProcessKind;
  name: string;
  status: "idle" | "running" | "stopping" | "error";
  badgeLabel?: string;
  detail?: string;
  startedAt: number;
  updatedAt: number;
  cpuPercent: number | null;
  gpuPercent: number | null;
  ramBytes: number | null;
  vramBytes: number | null;
  canEnd: boolean;
};

type InternalProcess = ResourceProcess & {
  end?: () => void | Promise<void>;
};

export type ResourceMemoryBucket = {
  id: string;
  label: string;
  bytes: number;
  category: "memory" | "storage" | "process";
  description: string;
  accent: string;
};

export type BrowserResourceSummary = {
  cpuPercent: number;
  gpuPercent: number;
  ramPercent: number;
  processCount: number;
  hiddenLayerCount: number;
  hiddenCacheBytes: number;
  historyBytes: number;
  assistantLoaded: boolean;
  storageUsageBytes: number | null;
  storageQuotaBytes: number | null;
  heapUsedBytes: number | null;
  heapLimitBytes: number | null;
  appTrackedBytes: number;
  memoryBuckets: ResourceMemoryBucket[];
  processes: ResourceProcess[];
  notes: string[];
};

type BrowserResourceTelemetryOptions = {
  viewerState: unknown;
  activeAutomationCount: number;
  visibleLayerCount: number;
  localScenePendingCount: number;
  refreshToken?: number;
};

type ProcessRegistration = {
  id: string;
  kind: ResourceProcessKind;
  name: string;
  badgeLabel?: string;
  detail?: string;
  status?: ResourceProcess["status"];
  cpuPercent?: number | null;
  gpuPercent?: number | null;
  ramBytes?: number | null;
  vramBytes?: number | null;
  end?: () => void | Promise<void>;
};

type StorageEstimateSummary = {
  usage: number | null;
  quota: number | null;
};

type CacheEstimateSnapshot = {
  hiddenVolumeCount: number;
  hiddenMeshCount: number;
  hiddenCacheBytes: number;
};

const STORAGE_CATEGORY_DEFINITIONS = [
  {
    id: "viewer-session",
    label: "Viewer session",
    key: VIEWER_STATE_STORAGE_KEY,
    description: "The current saved viewer state cached in localStorage.",
    accent: "#7ad5ff",
  },
  {
    id: "viewer-library",
    label: "Saved viewers",
    key: VIEWER_LIBRARY_STORAGE_KEY,
    description: "Saved viewer entries and their revisions.",
    accent: "#93c5fd",
  },
  {
    id: "viewer-history",
    label: "Undo / redo history",
    key: VIEWER_HISTORY_STORAGE_KEY,
    description: "Committed viewer history snapshots kept for undo and redo.",
    accent: "#60a5fa",
  },
  {
    id: "preferences",
    label: "Preferences",
    key: APP_PREFERENCES_STORAGE_KEY,
    description: "Theme, cursor, and other personal settings.",
    accent: "#a78bfa",
  },
  {
    id: "shortcuts",
    label: "Shortcuts",
    key: SHORTCUT_BINDINGS_STORAGE_KEY,
    description: "Saved shortcut bindings.",
    accent: "#f9a8d4",
  },
  {
    id: "custom-sources",
    label: "Custom sources",
    key: ANONYMOUS_USER_DATA_STORAGE_KEY,
    description: "Custom external sources and anonymous browser profile data.",
    accent: "#fbbf24",
  },
  {
    id: "assistant-conversations",
    label: "Assistant chats",
    key: APP_ASSISTANT_CONVERSATIONS_STORAGE_KEY,
    description: "Stored assistant conversations in the browser.",
    accent: "#34d399",
  },
  {
    id: "automation-pipelines",
    label: "Automation pipelines",
    key: AUTOMATION_PIPELINES_STORAGE_KEY,
    description: "Automation pipeline graph definitions.",
    accent: "#38bdf8",
  },
  {
    id: "automation-tools",
    label: "Automation tools",
    key: AUTOMATION_CUSTOM_TOOLS_STORAGE_KEY,
    description: "Custom automation helper tools saved in the browser.",
    accent: "#22c55e",
  },
] as const;

const PROCESS_STORE = new Map<string, InternalProcess>();
const PROCESS_LISTENERS = new Set<() => void>();
const CACHE_ESTIMATE_LISTENERS = new Set<() => void>();
let CACHE_ESTIMATE_SNAPSHOT: CacheEstimateSnapshot = {
  hiddenVolumeCount: 0,
  hiddenMeshCount: 0,
  hiddenCacheBytes: 0,
};
const SAMPLE_INTERVAL_MS = 1000;
const MAX_HISTORY_SAMPLES = 90;

function emitProcessStoreChange() {
  PROCESS_LISTENERS.forEach((listener) => listener());
}

function emitCacheEstimateChange() {
  CACHE_ESTIMATE_LISTENERS.forEach((listener) => listener());
}

function sortProcesses(processes: InternalProcess[]) {
  return [...processes].sort((left, right) => right.updatedAt - left.updatedAt);
}

function getProcessSnapshot(): ResourceProcess[] {
  return sortProcesses([...PROCESS_STORE.values()]).map(({ end: _end, ...process }) => process);
}

export function subscribeTrackedProcesses(listener: () => void) {
  PROCESS_LISTENERS.add(listener);
  return () => {
    PROCESS_LISTENERS.delete(listener);
  };
}

export function subscribeTrackedCacheEstimate(listener: () => void) {
  CACHE_ESTIMATE_LISTENERS.add(listener);
  return () => {
    CACHE_ESTIMATE_LISTENERS.delete(listener);
  };
}

export function updateTrackedCacheEstimate(snapshot: CacheEstimateSnapshot) {
  const next: CacheEstimateSnapshot = {
    hiddenVolumeCount: Math.max(0, Math.round(snapshot.hiddenVolumeCount || 0)),
    hiddenMeshCount: Math.max(0, Math.round(snapshot.hiddenMeshCount || 0)),
    hiddenCacheBytes: Math.max(0, Math.round(snapshot.hiddenCacheBytes || 0)),
  };
  if (
    next.hiddenVolumeCount === CACHE_ESTIMATE_SNAPSHOT.hiddenVolumeCount &&
    next.hiddenMeshCount === CACHE_ESTIMATE_SNAPSHOT.hiddenMeshCount &&
    next.hiddenCacheBytes === CACHE_ESTIMATE_SNAPSHOT.hiddenCacheBytes
  ) {
    return;
  }
  CACHE_ESTIMATE_SNAPSHOT = next;
  emitCacheEstimateChange();
}

export function registerTrackedProcess(process: ProcessRegistration) {
  const now = Date.now();
  const existing = PROCESS_STORE.get(process.id);
  PROCESS_STORE.set(process.id, {
    id: process.id,
    kind: process.kind,
    name: process.name,
    badgeLabel: process.badgeLabel ?? existing?.badgeLabel,
    detail: process.detail ?? existing?.detail,
    status: process.status ?? existing?.status ?? "running",
    startedAt: existing?.startedAt ?? now,
    updatedAt: now,
    cpuPercent: process.cpuPercent ?? existing?.cpuPercent ?? null,
    gpuPercent: process.gpuPercent ?? existing?.gpuPercent ?? null,
    ramBytes: process.ramBytes ?? existing?.ramBytes ?? null,
    vramBytes: process.vramBytes ?? existing?.vramBytes ?? null,
    canEnd: typeof process.end === "function",
    end: process.end ?? existing?.end,
  });
  emitProcessStoreChange();
}

export function updateTrackedProcess(
  id: string,
  patch: Partial<Omit<InternalProcess, "id" | "startedAt">>
) {
  const existing = PROCESS_STORE.get(id);
  if (!existing) return;
  PROCESS_STORE.set(id, {
    ...existing,
    ...patch,
    updatedAt: Date.now(),
    canEnd: typeof (patch.end ?? existing.end) === "function",
  });
  emitProcessStoreChange();
}

export function removeTrackedProcess(id: string) {
  if (!PROCESS_STORE.delete(id)) return;
  emitProcessStoreChange();
}

export async function endTrackedProcess(id: string) {
  const existing = PROCESS_STORE.get(id);
  if (!existing?.end) return false;
  updateTrackedProcess(id, { status: "stopping" });
  try {
    await existing.end();
    return true;
  } catch (error) {
    updateTrackedProcess(id, {
      status: "error",
      detail: error instanceof Error ? error.message : "Could not stop this browser task.",
    });
    return false;
  }
}

function clampPercent(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function useTrackedCacheEstimate() {
  const [snapshot, setSnapshot] = useState<CacheEstimateSnapshot>(CACHE_ESTIMATE_SNAPSHOT);

  useEffect(() => {
    return subscribeTrackedCacheEstimate(() => {
      setSnapshot(CACHE_ESTIMATE_SNAPSHOT);
    });
  }, []);

  return snapshot;
}

function estimateJsonBytes(value: unknown) {
  try {
    return new Blob([JSON.stringify(value)]).size;
  } catch {
    return 0;
  }
}

function countHiddenLayers(value: unknown): number {
  const nodes =
    value &&
    typeof value === "object" &&
    "scene" in (value as Record<string, unknown>) &&
    (value as { scene?: { layerTree?: unknown } }).scene?.layerTree;
  if (!Array.isArray(nodes)) return 0;

  function walk(items: unknown[]): number {
    let total = 0;
    for (const item of items) {
      if (!item || typeof item !== "object") continue;
      const node = item as { kind?: unknown; visible?: unknown; children?: unknown[] };
      if (node.kind === "layer" && node.visible === false) {
        total += 1;
      }
      if (node.kind === "group" && Array.isArray(node.children)) {
        total += walk(node.children);
      }
    }
    return total;
  }

  return walk(nodes);
}

function getLocalStorageEntryBytes(key: string) {
  if (typeof window === "undefined") return 0;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? new Blob([raw]).size : 0;
  } catch {
    return 0;
  }
}

async function getStorageEstimateSummary(): Promise<StorageEstimateSummary> {
  if (typeof navigator === "undefined" || !navigator.storage || typeof navigator.storage.estimate !== "function") {
    return { usage: null, quota: null };
  }
  try {
    const estimate = await navigator.storage.estimate();
    return {
      usage: typeof estimate.usage === "number" ? estimate.usage : null,
      quota: typeof estimate.quota === "number" ? estimate.quota : null,
    };
  } catch {
    return { usage: null, quota: null };
  }
}

function getHeapSnapshot() {
  const performanceWithMemory = performance as Performance & {
    memory?: {
      usedJSHeapSize?: number;
      jsHeapSizeLimit?: number;
    };
  };
  return {
    used: typeof performanceWithMemory.memory?.usedJSHeapSize === "number"
      ? performanceWithMemory.memory.usedJSHeapSize
      : null,
    limit: typeof performanceWithMemory.memory?.jsHeapSizeLimit === "number"
      ? performanceWithMemory.memory.jsHeapSizeLimit
      : null,
  };
}

export function formatBytes(bytes: number | null | undefined) {
  if (!Number.isFinite(bytes) || !bytes || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value >= 10 || unitIndex === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[unitIndex]}`;
}

export function formatMetricPercent(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return "n/a";
  return `${Math.round(value)}%`;
}

export function getMetricFillColor(value: number) {
  if (value >= 95) return "#ff6b6b";
  if (value >= 75) return "#f7c873";
  return "#72e3c0";
}

export function getMetricLabel(metric: ResourceMetricId) {
  if (metric === "cpu") return "CPU";
  if (metric === "gpu") return "GPU";
  return "RAM";
}

export function useTrackedProcesses() {
  const [processes, setProcesses] = useState<ResourceProcess[]>(() => getProcessSnapshot());
  useEffect(() => subscribeTrackedProcesses(() => setProcesses(getProcessSnapshot())), []);
  return processes;
}

export function useBrowserResourceTelemetry(
  options: BrowserResourceTelemetryOptions
): {
  summary: BrowserResourceSummary;
  samples: ResourceHistorySample[];
  endProcess: (processId: string) => Promise<boolean>;
} {
  const processes = useTrackedProcesses();
  const cacheEstimate = useTrackedCacheEstimate();
  const [storageEstimate, setStorageEstimate] = useState<StorageEstimateSummary>({
    usage: null,
    quota: null,
  });
  const [datasetBytes, setDatasetBytes] = useState(0);
  const [samples, setSamples] = useState<ResourceHistorySample[]>([]);
  const lastTickRef = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function refreshStorage() {
      const [estimate, records] = await Promise.all([
        getStorageEstimateSummary(),
        listLocalDatasetRecords().catch(() => []),
      ]);
      if (cancelled) return;
      setStorageEstimate(estimate);
      setDatasetBytes(
        records.reduce((sum, record) => sum + Math.max(0, Number(record.size) || 0), 0)
      );
    }

    refreshStorage();
    const intervalId = window.setInterval(refreshStorage, 1000);
    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [options.refreshToken]);

  const summary = useMemo<BrowserResourceSummary>(() => {
    const storageBuckets: ResourceMemoryBucket[] = STORAGE_CATEGORY_DEFINITIONS.map((definition) => ({
      id: definition.id,
      label: definition.label,
      bytes: getLocalStorageEntryBytes(definition.key),
      category: "storage",
      description: definition.description,
      accent: definition.accent,
    }));

    const liveViewerStateBytes = estimateJsonBytes(options.viewerState);
    const heapSnapshot = getHeapSnapshot();
    const processBuckets = processes
      .filter((process) => (process.ramBytes ?? 0) > 0 || (process.vramBytes ?? 0) > 0)
      .map((process) => ({
        id: `process-${process.id}`,
        label: process.name,
        bytes: (process.ramBytes ?? 0) + (process.vramBytes ?? 0),
        category: "process" as const,
        description: process.detail || "Tracked browser-owned task.",
        accent: process.kind === "assistant" ? "#38bdf8" : "#c084fc",
      }));

    const memoryBuckets: ResourceMemoryBucket[] = [
      {
        id: "live-viewer-state",
        label: "Live viewer state",
        bytes: liveViewerStateBytes,
        category: "memory" as const,
        description: "Estimated size of the current in-memory viewer state snapshot.",
        accent: "#8b5cf6",
      },
      {
        id: "local-datasets",
        label: "Local datasets",
        bytes: datasetBytes,
        category: "storage" as const,
        description: "Files stored in IndexedDB for local viewing.",
        accent: "#22d3ee",
      },
      ...storageBuckets,
      ...processBuckets,
    ].filter((bucket) => bucket.bytes > 0);

    const appTrackedBytes = memoryBuckets.reduce((sum, bucket) => sum + bucket.bytes, 0);
    const assistantProcess = processes.find((process) => process.kind === "assistant");
    const hiddenLayerCount = countHiddenLayers(options.viewerState);
    const historyBytes =
      storageBuckets.find((bucket) => bucket.id === "viewer-history")?.bytes ?? 0;
    const assistantGpuBoost =
      assistantProcess?.status === "running"
        ? Math.max(assistantProcess.gpuPercent ?? 0, assistantProcess.cpuPercent ?? 0)
        : 0;
    const activeWorkerCount = processes.filter((process) => process.kind === "worker").length;
    const activeAutomationCount = processes.filter((process) => process.kind === "automation").length;

    const notes: string[] = [];
    if (heapSnapshot.used == null || heapSnapshot.limit == null) {
      notes.push("Exact JS heap usage is unavailable in this browser, so RAM is estimated from tracked app data.");
    }
    if (!("gpu" in navigator)) {
      notes.push("GPU usage is estimated from browser activity because the browser does not expose real GPU/VRAM counters.");
    }

    return {
      cpuPercent: clampPercent(
        activeWorkerCount * 14 +
          activeAutomationCount * 22 +
          options.activeAutomationCount * 6 +
          options.localScenePendingCount * 16 +
          Math.min(options.visibleLayerCount, 12) * 2 +
          (assistantProcess?.cpuPercent ?? 0)
      ),
      gpuPercent: clampPercent(
        assistantGpuBoost +
          options.localScenePendingCount * 18 +
          Math.min(options.visibleLayerCount, 16) * 3 +
          (("gpu" in navigator) ? 8 : 0)
      ),
      ramPercent: clampPercent(
        heapSnapshot.used != null && heapSnapshot.limit != null && heapSnapshot.limit > 0
          ? (heapSnapshot.used / heapSnapshot.limit) * 100
          : appTrackedBytes / (512 * 1024 * 1024) * 100
      ),
      processCount: processes.length,
      hiddenLayerCount,
      hiddenCacheBytes: cacheEstimate.hiddenCacheBytes,
      historyBytes,
      assistantLoaded: !!assistantProcess,
      storageUsageBytes: storageEstimate.usage,
      storageQuotaBytes: storageEstimate.quota,
      heapUsedBytes: heapSnapshot.used,
      heapLimitBytes: heapSnapshot.limit,
      appTrackedBytes,
      memoryBuckets,
      processes,
      notes,
    };
  }, [
    datasetBytes,
    cacheEstimate.hiddenCacheBytes,
    options.activeAutomationCount,
    options.localScenePendingCount,
    options.viewerState,
    options.visibleLayerCount,
    processes,
    storageEstimate.quota,
    storageEstimate.usage,
  ]);

  useEffect(() => {
    function pushSample() {
      const now = performance.now();
      const lastTick = lastTickRef.current;
      const drift = lastTick == null ? 0 : Math.max(0, now - lastTick - SAMPLE_INTERVAL_MS);
      lastTickRef.current = now;
      const driftPercent = clampPercent((drift / SAMPLE_INTERVAL_MS) * 220);
      setSamples((current) => {
        const nextSample: ResourceHistorySample = {
          timestamp: Date.now(),
          cpuPercent: clampPercent(summary.cpuPercent * 0.68 + driftPercent * 0.32),
          gpuPercent: summary.gpuPercent,
          ramPercent: summary.ramPercent,
        };
        return [...current, nextSample].slice(-MAX_HISTORY_SAMPLES);
      });
    }

    pushSample();
    const intervalId = window.setInterval(pushSample, SAMPLE_INTERVAL_MS);
    return () => {
      window.clearInterval(intervalId);
    };
  }, [summary.cpuPercent, summary.gpuPercent, summary.ramPercent]);

  return {
    summary,
    samples,
    endProcess: endTrackedProcess,
  };
}
