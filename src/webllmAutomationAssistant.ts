import {
  normalizeAutomationAssistantDraft,
  type AutomationAssistantDraft,
  type AutomationAssistantModel,
  type AutomationAssistantResponse,
} from "./automationCapabilities";

const DEFAULT_WEBLLM_MODEL_ID = "Qwen2.5-1.5B-Instruct-q4f16_1-MLC";

type WebLLMModule = typeof import("@mlc-ai/web-llm");
type WebLLMEngine = Awaited<ReturnType<WebLLMModule["CreateMLCEngine"]>>;

export type WebLLMAssistantStatus = {
  phase: "idle" | "unsupported" | "loading" | "ready" | "generating" | "error";
  message: string;
  progress?: number;
};

let enginePromise: Promise<WebLLMEngine> | null = null;
let loadedEngine: WebLLMEngine | null = null;

export function createWebLLMAutomationAssistantModel(options?: {
  modelId?: string;
  onStatus?: (status: WebLLMAssistantStatus) => void;
}): AutomationAssistantModel {
  const modelId = options?.modelId ?? DEFAULT_WEBLLM_MODEL_ID;

  return {
    async generateResponse(request) {
      if (!isWebGPUSupported()) {
        options?.onStatus?.({
          phase: "unsupported",
          message: "Local LLM needs WebGPU. Use Chrome or Edge with WebGPU enabled, or fall back to the mock assistant.",
        });
        throw new Error("WebGPU is not available for local WebLLM.");
      }

      options?.onStatus?.({ phase: "loading", message: `Loading ${modelId}...`, progress: 0 });
      const engine = await getWebLLMEngine(modelId, options?.onStatus);
      options?.onStatus?.({ phase: "generating", message: "Generating pipeline draft..." });

      let streamedText = "";
      const response = await engine.chat.completions.create({
        messages: [
          {
            role: "system",
            content: buildSystemPrompt(),
          },
          {
            role: "user",
            content: buildUserPrompt(request.userMessage),
          },
        ],
        temperature: 0.1,
        top_p: 0.85,
        max_tokens: 1800,
        stream: true,
      });

      for await (const chunk of response) {
        const token = chunk.choices[0]?.delta?.content ?? "";
        if (!token) continue;
        streamedText += token;
        request.onToken?.(streamedText);
      }

      const assistantResponse = parseAssistantResponse(streamedText);
      options?.onStatus?.({ phase: "ready", message: assistantResponse.draft ? "Local LLM draft ready." : "Local LLM response ready." });
      return assistantResponse;
    },
  };
}

export function isWebGPUSupported() {
  return typeof navigator !== "undefined" && "gpu" in navigator;
}

export async function stopWebLLMAutomationAssistant() {
  await loadedEngine?.interruptGenerate();
}

async function getWebLLMEngine(
  modelId: string,
  onStatus?: (status: WebLLMAssistantStatus) => void
) {
  if (!enginePromise) {
    enginePromise = import("@mlc-ai/web-llm")
      .then(async ({ CreateMLCEngine }) => {
        const engine = await CreateMLCEngine(modelId, {
          initProgressCallback: (report) => {
            onStatus?.({
              phase: "loading",
              message: report.text || `Loading ${modelId}...`,
              progress: report.progress,
            });
          },
        });
        loadedEngine = engine;
        return engine;
      })
      .catch((error) => {
        enginePromise = null;
        onStatus?.({
          phase: "error",
          message: error instanceof Error ? error.message : "Local LLM failed to load.",
        });
        throw error;
      });
  }
  return enginePromise;
}

function buildSystemPrompt() {
  return `You are the automation assistant for Mouse Brain Viewer.
You help users build automation pipelines, but you must be honest when the app does not expose a needed capability.

Reply with one short sentence first.
Then write the pipeline JSON object.
The JSON object has this shape:
{
  "message": "Short conversational explanation for the user.",
  "draft": null
}

When you can build a pipeline, set "draft" to:
{
  "name": "Pipeline name",
  "description": "What it does",
  "active": true,
  "autoRun": false,
  "nodes": [
    { "id": "node-id", "kind": "event", "label": "Selection changes", "token": "selection.changed", "x": 140, "y": 170 }
  ],
  "connections": [
    { "id": "connection-id", "fromNodeId": "source-node", "toNodeId": "target-node", "mode": "trigger" }
  ]
}

Use only listed tokens. If a requested feature is unavailable, explain what is missing in the first sentence and set draft to null.
Do not include inputs or outputs; the application fills those from the token.`;
}

function buildUserPrompt(userMessage: string) {
  return `User automation request:
${userMessage}

Available capabilities:
${JSON.stringify(
  [
    {
      kind: "event",
      token: "selection.changed",
      use: "Start when the viewer selection changes.",
    },
    {
      kind: "condition",
      token: "selected.isAnnotation",
      use: "Continue only if the selected layer is an annotation.",
    },
    {
      kind: "condition",
      token: "selected.hasMetadata",
      use: "Continue only if the selected annotation has metadata.",
    },
    {
      kind: "action",
      token: "metadata.previewSelectedAnnotation",
      use: "Open or reuse one metadata preview window for the selected annotation.",
    },
    {
      kind: "action",
      token: "metadata.openSelectedAnnotation",
      use: "Open the metadata editor for the selected annotation.",
    },
    {
      kind: "compute",
      token: "compute.browserFunction",
      use: "Run JavaScript in config.code. It must define function run(input).",
    },
    {
      kind: "source",
      token: "source.selectedLayer",
      use: "Provide the selected layer as data.",
    },
    {
      kind: "source",
      token: "source.viewerState",
      use: "Provide the current viewer state as data.",
    },
    {
      kind: "external",
      token: "external.httpRequest",
      use: "Route data to a configured HTTP endpoint.",
    },
  ],
  null,
  2
)}

For the common request "click an annotation and preview metadata", use exactly:
selection.changed -> selected.isAnnotation -> metadata.previewSelectedAnnotation
with active true and autoRun true.

Example valid response:
I can build that with the selection event, an annotation condition, and the reusable metadata preview action.

{
  "message": "I can build that with the selection event, an annotation condition, and the reusable metadata preview action.",
  "draft": {
    "name": "Preview selected annotation",
    "description": "When the selected object is an annotation, reuse one metadata preview window for it.",
    "active": true,
    "autoRun": true,
    "nodes": [
      { "id": "selection-event", "kind": "event", "label": "Selection changes", "token": "selection.changed", "x": 140, "y": 170 },
      { "id": "is-annotation", "kind": "condition", "label": "Selected is annotation", "token": "selected.isAnnotation", "x": 430, "y": 170 },
      { "id": "preview-metadata", "kind": "action", "label": "Preview metadata", "token": "metadata.previewSelectedAnnotation", "x": 720, "y": 170 }
    ],
    "connections": [
      { "id": "selection-to-condition", "fromNodeId": "selection-event", "toNodeId": "is-annotation", "mode": "trigger" },
      { "id": "condition-to-preview", "fromNodeId": "is-annotation", "toNodeId": "preview-metadata", "mode": "trigger" }
    ]
  }
}`;
}

function parseAssistantResponse(content: unknown): AutomationAssistantResponse {
  if (typeof content !== "string" || !content.trim()) {
    throw new Error("Local LLM returned an empty response.");
  }
  const trimmed = content.trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) {
      parsed = JSON.parse(trimmed.slice(start, end + 1));
    } else {
      return {
        message: trimmed,
        rawText: trimmed,
      };
    }
  }

  if (!parsed || typeof parsed !== "object") {
    return { message: trimmed, rawText: trimmed };
  }

  const candidate = parsed as { message?: unknown; draft?: unknown };
  const message = typeof candidate.message === "string" && candidate.message.trim()
    ? candidate.message
    : "I generated a response.";
  if (!candidate.draft) return { message, rawText: trimmed };
  try {
    return {
      message,
      draft: normalizeAutomationAssistantDraft(candidate.draft),
      rawText: trimmed,
    };
  } catch (error) {
    return {
      message: `${message}\n\nI could not turn the draft into a valid pipeline: ${error instanceof Error ? error.message : "unknown validation issue"}`,
      rawText: trimmed,
    };
  }
}

export type { AutomationAssistantDraft };
