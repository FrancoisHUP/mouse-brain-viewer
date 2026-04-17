/// <reference lib="webworker" />

export {};

import { loadLocalBrowserMesh, loadLocalBrowserVolume } from "./localDataHandlers";
import type { LocalDatasetInfo } from "./layerTypes";

type WorkerRequest =
  | { type: "load-volume"; requestId: string; datasetId: string; info: LocalDatasetInfo }
  | { type: "load-mesh"; requestId: string; datasetId: string };

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const msg = event.data;
  try {
    if (msg.type === "load-volume") {
      const payload = await loadLocalBrowserVolume(msg.datasetId, msg.info);
      self.postMessage(
        { requestId: msg.requestId, ok: true, type: msg.type, payload },
        [payload.data.buffer]
      );
      return;
    }

    if (msg.type === "load-mesh") {
      const payload = await loadLocalBrowserMesh(msg.datasetId);
      const transfer: Transferable[] = [];
      if (payload.linePositions?.buffer) transfer.push(payload.linePositions.buffer);
      if (payload.trianglePositions?.buffer) transfer.push(payload.trianglePositions.buffer);
      self.postMessage(
        { requestId: msg.requestId, ok: true, type: msg.type, payload },
        transfer
      );
    }
  } catch (error) {
    self.postMessage({
      requestId: msg.requestId,
      ok: false,
      error: error instanceof Error ? error.message : "Local data worker failed.",
    });
  }
};
