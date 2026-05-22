/// <reference lib="webworker" />

export {};

import { loadLocalBrowserMesh, loadLocalBrowserStreamlines, loadLocalBrowserVolume } from "./localDataHandlers";
import type { LocalDatasetInfo } from "./layerTypes";
import type { LoadedStreamlines } from "./streamlines";

type WorkerRequest =
  | { type: "load-volume"; requestId: string; datasetId: string; info: LocalDatasetInfo }
  | { type: "load-mesh"; requestId: string; datasetId: string }
  | { type: "load-streamlines"; requestId: string; datasetId: string };

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
      return;
    }

    if (msg.type === "load-streamlines") {
      const payload: LoadedStreamlines = await loadLocalBrowserStreamlines(msg.datasetId);
      const transfer: Transferable[] = [payload.linePositions.buffer, payload.lineColors.buffer];
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
