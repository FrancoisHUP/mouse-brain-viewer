import type { LoadedVolume } from "./omeZarr";
import type { LoadedMesh } from "./allenMesh";
import type { LocalDatasetInfo } from "./layerTypes";
import {
  registerTrackedProcess,
  removeTrackedProcess,
  updateTrackedProcess,
} from "./resourceTelemetry";

type VolumeRequest = {
  type: "load-volume";
  requestId: string;
  datasetId: string;
  info: LocalDatasetInfo;
};

type MeshRequest = {
  type: "load-mesh";
  requestId: string;
  datasetId: string;
};

type WorkerRequest = VolumeRequest | MeshRequest;

type WorkerSuccessMessage =
  | { requestId: string; ok: true; type: "load-volume"; payload: LoadedVolume }
  | { requestId: string; ok: true; type: "load-mesh"; payload: LoadedMesh };

type WorkerErrorMessage = {
  requestId: string;
  ok: false;
  error: string;
};

type WorkerMessage = WorkerSuccessMessage | WorkerErrorMessage;

type PendingRequest = {
  resolve: (value: any) => void;
  reject: (reason?: unknown) => void;
};

let worker: Worker | null = null;
const pending = new Map<string, PendingRequest>();
const LOCAL_DATA_WORKER_PROCESS_ID = "resource-local-data-worker";

function createId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`;
}

function getWorker() {
  if (!worker) {
    worker = new Worker(new URL("./localDataLoad.worker.ts", import.meta.url), { type: "module" });
    registerTrackedProcess({
      id: LOCAL_DATA_WORKER_PROCESS_ID,
      kind: "worker",
      name: "Local data worker",
      badgeLabel: "Root",
      detail: "Loads local browser datasets in a background worker.",
      cpuPercent: 8,
      gpuPercent: 0,
    });
    worker.onmessage = (event: MessageEvent<WorkerMessage>) => {
      const msg = event.data;
      const request = pending.get(msg.requestId);
      if (!request) return;
      pending.delete(msg.requestId);
      if (msg.ok) {
        request.resolve(msg.payload);
      } else {
        request.reject(new Error(msg.error || "Worker local data load failed."));
      }
      if (pending.size === 0) {
        updateTrackedProcess(LOCAL_DATA_WORKER_PROCESS_ID, {
          detail: "Background worker is idle.",
          cpuPercent: 4,
        });
      }
    };
    worker.onerror = (event) => {
      const error = event.error ?? new Error(event.message || "Local data worker crashed.");
      for (const [, request] of pending) {
        request.reject(error);
      }
      pending.clear();
      updateTrackedProcess(LOCAL_DATA_WORKER_PROCESS_ID, {
        status: "error",
        detail: error.message || "Local data worker crashed.",
        cpuPercent: 0,
      });
    };
  }
  return worker;
}

function postRequest<T>(request: WorkerRequest): Promise<T> {
  const w = getWorker();
  return new Promise<T>((resolve, reject) => {
    pending.set(request.requestId, { resolve, reject });
    updateTrackedProcess(LOCAL_DATA_WORKER_PROCESS_ID, {
      status: "running",
      detail: `${pending.size} local dataset task${pending.size === 1 ? "" : "s"} in progress.`,
      cpuPercent: Math.min(78, 20 + pending.size * 16),
      ramBytes: null,
    });
    w.postMessage(request);
  });
}

export function loadLocalBrowserVolumeInWorker(datasetId: string, info: LocalDatasetInfo): Promise<LoadedVolume> {
  return postRequest<LoadedVolume>({
    type: "load-volume",
    requestId: createId(),
    datasetId,
    info,
  });
}

export function loadLocalBrowserMeshInWorker(datasetId: string): Promise<LoadedMesh> {
  return postRequest<LoadedMesh>({
    type: "load-mesh",
    requestId: createId(),
    datasetId,
  });
}

export function disposeLocalDataLoadWorker() {
  if (worker) {
    worker.terminate();
    worker = null;
  }
  for (const [, request] of pending) {
    request.reject(new Error("Local data worker was terminated."));
  }
  pending.clear();
  removeTrackedProcess(LOCAL_DATA_WORKER_PROCESS_ID);
}
