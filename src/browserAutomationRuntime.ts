import {
  registerTrackedProcess,
  removeTrackedProcess,
  updateTrackedProcess,
} from "./resourceTelemetry";

export type BrowserAutomationInput = {
  selection?: unknown;
  data?: unknown;
};

export function formatBrowserAutomationResult(value: unknown): string {
  if (value === undefined) return "undefined";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export function runBrowserAutomationCode(
  code: string,
  input: BrowserAutomationInput,
  timeoutMs = 2500
): Promise<unknown> {
  if (typeof Worker === "undefined") {
    return Promise.reject(new Error("Browser workers are not available in this environment."));
  }

  return new Promise((resolve, reject) => {
    const processId = `browser-automation-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const workerSource = `
      self.onmessage = async (event) => {
        try {
          const { code, input } = event.data;
          const factory = new Function(
            '"use strict";\\n' +
            code +
            '\\n; return typeof run === "function" ? run : null;'
          );
          const run = factory();
          if (typeof run !== "function") {
            throw new Error('Define a function named run(input).');
          }
          const result = await run(input);
          self.postMessage({ ok: true, result });
        } catch (error) {
          self.postMessage({
            ok: false,
            error: error && typeof error.message === "string" ? error.message : String(error)
          });
        }
      };
    `;
    const blob = new Blob([workerSource], { type: "text/javascript" });
    const workerUrl = URL.createObjectURL(blob);
    const worker = new Worker(workerUrl);
    registerTrackedProcess({
      id: processId,
      kind: "automation",
      name: "Browser automation task",
      detail: "Executes browser-side automation code in a sandboxed worker.",
      cpuPercent: 52,
      gpuPercent: 0,
      end: () => {
        worker.terminate();
        URL.revokeObjectURL(workerUrl);
        removeTrackedProcess(processId);
      },
    });
    const timeoutId = window.setTimeout(() => {
      worker.terminate();
      URL.revokeObjectURL(workerUrl);
      removeTrackedProcess(processId);
      reject(new Error("Code execution timed out."));
    }, timeoutMs);

    worker.onmessage = (event: MessageEvent<{ ok: boolean; result?: unknown; error?: string }>) => {
      window.clearTimeout(timeoutId);
      worker.terminate();
      URL.revokeObjectURL(workerUrl);
      removeTrackedProcess(processId);
      if (event.data.ok) {
        resolve(event.data.result);
      } else {
        reject(new Error(event.data.error ?? "Code execution failed."));
      }
    };

    worker.onerror = (event) => {
      window.clearTimeout(timeoutId);
      worker.terminate();
      URL.revokeObjectURL(workerUrl);
      updateTrackedProcess(processId, {
        status: "error",
        detail: event.message || "Code execution failed.",
      });
      removeTrackedProcess(processId);
      reject(new Error(event.message || "Code execution failed."));
    };

    updateTrackedProcess(processId, {
      detail: "Running browser automation code.",
      cpuPercent: 60,
    });
    worker.postMessage({ code, input });
  });
}
