import type { ViewerStatePatchV1, ViewerStateV1 } from "./viewerState";

export const ALLEN_VIEWER_EMBED_NAMESPACE = "allen-viewer";

export type ViewerEmbedCommand =
  | "ping"
  | "getState"
  | "getStateJson"
  | "setState"
  | "setStateJson"
  | "patchState"
  | "setLayoutCollapsed"
  | "selectNode"
  | "openExport"
  | "openImport"
  | "closeDialogs";

export type ViewerEmbedRequest = {
  namespace: typeof ALLEN_VIEWER_EMBED_NAMESPACE;
  type: "request";
  command: ViewerEmbedCommand;
  requestId?: string;
  payload?: Record<string, unknown>;
};

export type ViewerEmbedResponse = {
  namespace: typeof ALLEN_VIEWER_EMBED_NAMESPACE;
  type: "response";
  command: ViewerEmbedCommand;
  requestId?: string;
  ok: boolean;
  payload?: Record<string, unknown>;
  error?: string;
};

export type ViewerEmbedEvent = {
  namespace: typeof ALLEN_VIEWER_EMBED_NAMESPACE;
  type: "event";
  event: "ready";
};

export type ViewerEmbedMessage =
  | ViewerEmbedRequest
  | ViewerEmbedResponse
  | ViewerEmbedEvent;

export type ExternalAllenViewerApi = {
  ping: () => Promise<boolean>;
  getState: () => Promise<ViewerStateV1>;
  getStateJson: () => Promise<string>;
  setState: (state: ViewerStateV1) => Promise<void>;
  setStateJson: (stateJson: string) => Promise<void>;
  patchState: (patch: ViewerStatePatchV1) => Promise<ViewerStateV1>;
  setLayoutCollapsed: (collapsed: boolean) => Promise<ViewerStateV1>;
  selectNode: (nodeId: string | null) => Promise<ViewerStateV1>;
  openExport: () => Promise<void>;
  openImport: () => Promise<void>;
  closeDialogs: () => Promise<void>;
};

export type AllenViewerEmbedApi = ExternalAllenViewerApi;

function createRequestId() {
  return Math.random().toString(36).slice(2, 10);
}

export function createAllenViewerEmbedApi(options: {
  iframe: HTMLIFrameElement;
  targetOrigin?: string;
  timeoutMs?: number;
}): AllenViewerEmbedApi {
  const { iframe, targetOrigin = "*", timeoutMs = 8000 } = options;

  async function request<TPayload = Record<string, unknown>>(
    command: ViewerEmbedCommand,
    payload?: Record<string, unknown>
  ): Promise<TPayload> {
    const requestId = createRequestId();

    const message: ViewerEmbedRequest = {
      namespace: ALLEN_VIEWER_EMBED_NAMESPACE,
      type: "request",
      command,
      requestId,
      payload,
    };

    const targetWindow = iframe.contentWindow;
    if (!targetWindow) {
      throw new Error("Viewer iframe is not ready.");
    }

    return await new Promise<TPayload>((resolve, reject) => {
      const timeout = window.setTimeout(() => {
        cleanup();
        reject(new Error(`Timed out waiting for viewer response to '${command}'.`));
      }, timeoutMs);

      function cleanup() {
        window.clearTimeout(timeout);
        window.removeEventListener("message", handleMessage);
      }

      function handleMessage(event: MessageEvent) {
        if (event.source !== targetWindow) return;
        const data = event.data as ViewerEmbedMessage | undefined;
        if (!data || data.namespace !== ALLEN_VIEWER_EMBED_NAMESPACE) return;
        if (data.type !== "response") return;
        if (data.requestId !== requestId) return;

        cleanup();

        if (!data.ok) {
          reject(new Error(data.error || `Viewer command '${command}' failed.`));
          return;
        }

        resolve((data.payload ?? {}) as TPayload);
      }

      window.addEventListener("message", handleMessage);
      targetWindow.postMessage(message, targetOrigin);
    });
  }

  return {
    async ping() {
      const payload = await request<{ pong?: boolean }>("ping");
      return payload.pong === true;
    },

    async getState() {
      const payload = await request<{ state: ViewerStateV1 }>("getState");
      return payload.state;
    },

    async getStateJson() {
      const payload = await request<{ stateJson: string }>("getStateJson");
      return payload.stateJson;
    },

    async setState(state) {
      await request("setState", { state });
    },

    async setStateJson(stateJson) {
      await request("setStateJson", { stateJson });
    },

    async patchState(patch) {
      const payload = await request<{ state: ViewerStateV1 }>("patchState", { patch });
      return payload.state;
    },

    async setLayoutCollapsed(collapsed) {
      const payload = await request<{ state: ViewerStateV1 }>(
        "setLayoutCollapsed",
        { collapsed }
      );
      return payload.state;
    },

    async selectNode(nodeId) {
      const payload = await request<{ state: ViewerStateV1 }>("selectNode", {
        nodeId,
      });
      return payload.state;
    },

    async openExport() {
      await request("openExport");
    },

    async openImport() {
      await request("openImport");
    },

    async closeDialogs() {
      await request("closeDialogs");
    },
  };
}
