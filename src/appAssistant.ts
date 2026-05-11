import {
  mockAutomationAssistantModel,
  normalizeAutomationAssistantPatch,
  normalizeAutomationAssistantDraft,
  type AutomationAssistantPipelineProposal,
  type AutomationAssistantDraft,
} from "./automationCapabilities";
import {
  AUTOMATION_LIBRARY,
  customToolToLibraryItem,
  type AutomationCustomTool,
  type AutomationLibraryItem,
  type AutomationPipeline,
} from "./automationTypes";
import {
  APP_ASSISTANT_READ_TOOLS,
  APP_ASSISTANT_TOOLS,
  getAssistantToolAvailability,
  normalizeAssistantToolCall,
  summarizeAssistantToolCall,
  type AppAssistantToolCall,
} from "./appAssistantTools";
export type { AppAssistantToolCall } from "./appAssistantTools";
import type { LayerTreeNode } from "./layerTypes";
import type { SavedViewerEntry } from "./viewerLibrary";
import type { ViewerStateV1 } from "./viewerState";

export type AppAssistantSize = "compact" | "medium" | "wide";

export type AppAssistantMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  plainText?: string;
  codeText?: string;
  branchGroupId?: string;
  branchIndex?: number;
  branchCount?: number;
  activeBranchIndex?: number;
};

export type AppAssistantConversation = {
  id: string;
  title: string;
  messages: AppAssistantMessage[];
  createdAt: number;
  updatedAt: number;
};

export type AppAssistantContext = {
  view: {
    activeTool: string;
    importPanelOpen: boolean;
    localDatasetManagerOpen: boolean;
    selectedNodeId: string | null;
    selectedNodeIds: string[];
    selectedNodeCount: number;
    selectedNodeName: string | null;
    selectedNodeKind: string | null;
    selectedLayerType: string | null;
    selectedNodeVisible: boolean | null;
    selectedNodeOpacity: number | null;
    selectedNodeTranslation: [number, number, number] | null;
  };
  layers: {
    total: number;
    visible: number;
    hidden: number;
    localDatasets: number;
    names: string[];
  };
  savedViewers: {
    count: number;
    activeName: string | null;
    recentNames: string[];
  };
  automation: {
    count: number;
    activeCount: number;
    activePipelineName: string | null;
    pipelineNames: string[];
    activePipeline: {
      id: string;
      name: string;
      description: string;
      active: boolean;
      autoRun: boolean;
      nodeCount: number;
      connectionCount: number;
      script: string;
    } | null;
    availableTools: Array<{ token: string; kind: string; label: string }>;
  };
  viewerStateSummary: {
    hasSerializableState: boolean;
    floatingWindowCount: number;
  };
  assistantReadTools: Array<{
    name:
      | "viewer.getSelectionSummary"
      | "viewer.getSelectedLayerDetails"
      | "pipeline.getActivePipelineSummary"
      | "viewer.getSavedViewerSummary";
    description: string;
  }>;
  assistantTools: Array<{
    name: AppAssistantToolCall["name"];
    description: string;
    available: boolean;
    reason?: string;
  }>;
};

export type AppAssistantResponse = {
  message: string;
  rawText?: string;
  pipelineDraft?: AutomationAssistantDraft;
  proposal?: AutomationAssistantPipelineProposal;
  intent?: AppAssistantIntent;
  toolProposal?: AppAssistantToolProposal;
};

export type AppAssistantToolProposal = {
  summary: string;
  toolCall: AppAssistantToolCall;
};

export type AppAssistantIntent =
  | {
      kind: "set_pipeline_meta";
      target?: { pipeline?: "active" };
      changes: {
        name?: string;
        description?: string;
        active?: boolean;
        autoRun?: boolean;
      };
    }
  | {
      kind: "update_node_config";
      target: {
        pipeline?: "active";
        nodeId?: string;
        nodeToken?: string;
        nodeLabel?: string;
      };
      changes: Record<string, string | number | boolean>;
    }
  | {
      kind: "update_many_node_configs";
      updates: Array<{
        target: {
          pipeline?: "active";
          nodeId?: string;
          nodeToken?: string;
          nodeLabel?: string;
        };
        changes: Record<string, string | number | boolean>;
      }>;
    }
  | {
      kind: "add_node";
      node: {
        token: string;
        id?: string;
        label?: string;
        config?: Record<string, string | number | boolean>;
        x?: number;
        y?: number;
      };
    }
  | {
      kind: "remove_node";
      target: {
        pipeline?: "active";
        nodeId?: string;
        nodeToken?: string;
        nodeLabel?: string;
      };
    }
  | {
      kind: "add_connection";
      from: {
        nodeId?: string;
        nodeToken?: string;
        nodeLabel?: string;
      };
      to: {
        nodeId?: string;
        nodeToken?: string;
        nodeLabel?: string;
      };
      mode?: "trigger" | "data";
    }
  | {
      kind: "remove_connection";
      target: {
        connectionId?: string;
        fromNodeId?: string;
        fromNodeToken?: string;
        toNodeId?: string;
        toNodeToken?: string;
        mode?: "trigger" | "data";
      };
    }
  | {
      kind: "set_layer_visibility";
      target?: {
        scope?: "selected";
      };
      visible: boolean;
    };

export type AppAssistantModel = {
  sendMessage: (request: {
    userMessage: string;
    appContext: AppAssistantContext;
    conversationHistory?: Array<{ role: "user" | "assistant"; content: string }>;
    onToken?: (text: string) => void;
  }) => Promise<AppAssistantResponse>;
};

type WebLLMModule = typeof import("@mlc-ai/web-llm");
type WebLLMEngine = Awaited<ReturnType<WebLLMModule["CreateMLCEngine"]>>;

export type AppAssistantStatus = {
  phase: "idle" | "unsupported" | "loading" | "ready" | "generating" | "error";
  message: string;
  progress?: number;
};

const DEFAULT_WEBLLM_MODEL_ID = "Qwen2.5-1.5B-Instruct-q4f16_1-MLC";
const APP_ASSISTANT_CONVERSATIONS_STORAGE_KEY = "mouse-brain-viewer:assistant-conversations:v1";

let appAssistantEnginePromise: Promise<WebLLMEngine> | null = null;
let appAssistantEngine: WebLLMEngine | null = null;

export function createEmptyAssistantConversation(title = "New chat"): AppAssistantConversation {
  const now = Date.now();
  return {
    id: `assistant-chat-${now}-${Math.random().toString(36).slice(2, 8)}`,
    title,
    messages: [],
    createdAt: now,
    updatedAt: now,
  };
}

export function loadAssistantConversations(): AppAssistantConversation[] {
  if (typeof window === "undefined") return [createEmptyAssistantConversation()];
  try {
    const raw = window.localStorage.getItem(APP_ASSISTANT_CONVERSATIONS_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    const conversations = sanitizeAssistantConversations(parsed);
    return conversations.length ? conversations : [createEmptyAssistantConversation()];
  } catch {
    return [createEmptyAssistantConversation()];
  }
}

export function saveAssistantConversations(conversations: AppAssistantConversation[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(
    APP_ASSISTANT_CONVERSATIONS_STORAGE_KEY,
    JSON.stringify(sanitizeAssistantConversations(conversations))
  );
}

function sanitizeAssistantConversations(value: unknown): AppAssistantConversation[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item): AppAssistantConversation | null => {
      if (!item || typeof item !== "object") return null;
      const candidate = item as Partial<AppAssistantConversation>;
      if (typeof candidate.id !== "string" || !candidate.id.trim()) return null;
      const messages = Array.isArray(candidate.messages)
        ? candidate.messages
            .map((message): AppAssistantMessage | null => {
              if (!message || typeof message !== "object") return null;
              const candidateMessage = message as Partial<AppAssistantMessage>;
              if (candidateMessage.role !== "user" && candidateMessage.role !== "assistant") return null;
              if (typeof candidateMessage.content !== "string") return null;
              return {
                id:
                  typeof candidateMessage.id === "string" && candidateMessage.id.trim()
                    ? candidateMessage.id
                    : `assistant-message-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                role: candidateMessage.role,
                content: candidateMessage.content,
                plainText: typeof candidateMessage.plainText === "string" ? candidateMessage.plainText : undefined,
                codeText: typeof candidateMessage.codeText === "string" ? candidateMessage.codeText : undefined,
                branchGroupId: typeof candidateMessage.branchGroupId === "string" ? candidateMessage.branchGroupId : undefined,
                branchIndex: typeof candidateMessage.branchIndex === "number" ? candidateMessage.branchIndex : undefined,
                branchCount: typeof candidateMessage.branchCount === "number" ? candidateMessage.branchCount : undefined,
                activeBranchIndex: typeof candidateMessage.activeBranchIndex === "number" ? candidateMessage.activeBranchIndex : undefined,
              };
            })
            .filter((message): message is AppAssistantMessage => !!message)
        : [];
      return {
        id: candidate.id,
        title: typeof candidate.title === "string" && candidate.title.trim() ? candidate.title : "New chat",
        messages,
        createdAt: typeof candidate.createdAt === "number" ? candidate.createdAt : Date.now(),
        updatedAt: typeof candidate.updatedAt === "number" ? candidate.updatedAt : Date.now(),
      };
    })
    .filter((item): item is AppAssistantConversation => !!item);
}

export function buildAppAssistantContext(input: {
  activeTool: string;
  isImportPanelOpen: boolean;
  isLocalDatasetManagerOpen: boolean;
  selectedNode: LayerTreeNode | null;
  selectedNodeIds: string[];
  viewerState: ViewerStateV1;
  savedViewers: SavedViewerEntry[];
  activeSavedViewerId: string | null;
  automationPipelines: AutomationPipeline[];
  activeAutomationPipelineId: string | null;
  automationCustomTools: AutomationCustomTool[];
}): AppAssistantContext {
  const layerNodes = collectLayerNodes(input.viewerState.scene.layerTree);
  const activeSavedViewer = input.savedViewers.find((entry) => entry.id === input.activeSavedViewerId) ?? null;
  const activePipeline = input.automationPipelines.find((pipeline) => pipeline.id === input.activeAutomationPipelineId) ?? null;
  const availableTools = [...AUTOMATION_LIBRARY, ...input.automationCustomTools.map(customToolToLibraryItem)];
  const selectedLayer = input.selectedNode && input.selectedNode.kind === "layer" ? input.selectedNode : null;
  const toolAvailability = getAssistantToolAvailability({
    selectedNodeId: input.selectedNode?.id ?? null,
    selectedNodeKind: input.selectedNode?.kind ?? null,
    selectedNodeCount: input.selectedNodeIds.length,
    activePipelineId: activePipeline?.id ?? null,
  });

  return {
    view: {
      activeTool: input.activeTool,
      importPanelOpen: input.isImportPanelOpen,
      localDatasetManagerOpen: input.isLocalDatasetManagerOpen,
      selectedNodeId: input.selectedNode?.id ?? null,
      selectedNodeIds: input.selectedNodeIds,
      selectedNodeCount: input.selectedNodeIds.length,
      selectedNodeName: input.selectedNode?.name ?? null,
      selectedNodeKind: input.selectedNode?.kind ?? null,
      selectedLayerType: selectedLayer?.type ?? null,
      selectedNodeVisible: typeof input.selectedNode?.visible === "boolean" ? input.selectedNode.visible : null,
      selectedNodeOpacity: typeof input.selectedNode?.opacity === "number" ? input.selectedNode.opacity : null,
      selectedNodeTranslation: Array.isArray(input.selectedNode?.transform?.translation)
        ? [
            Number(input.selectedNode.transform.translation[0] ?? 0),
            Number(input.selectedNode.transform.translation[1] ?? 0),
            Number(input.selectedNode.transform.translation[2] ?? 0),
          ]
        : null,
    },
    layers: {
      total: layerNodes.length,
      visible: layerNodes.filter((node) => node.visible !== false).length,
      hidden: layerNodes.filter((node) => node.visible === false).length,
      localDatasets: layerNodes.filter((node) => !!node.localDatasetInfo).length,
      names: layerNodes.slice(0, 12).map((node) => node.name),
    },
    savedViewers: {
      count: input.savedViewers.length,
      activeName: activeSavedViewer?.name ?? null,
      recentNames: input.savedViewers.slice(0, 8).map((entry) => entry.name),
    },
    automation: {
      count: input.automationPipelines.length,
      activeCount: input.automationPipelines.filter((pipeline) => pipeline.active).length,
      activePipelineName: activePipeline?.name ?? null,
      pipelineNames: input.automationPipelines.slice(0, 8).map((pipeline) => pipeline.name),
      activePipeline: activePipeline
        ? {
            id: activePipeline.id,
            name: activePipeline.name,
            description: activePipeline.description ?? "",
            active: activePipeline.active,
            autoRun: activePipeline.autoRun,
            nodeCount: activePipeline.nodes.length,
            connectionCount: activePipeline.connections.length,
            script: activePipeline.script,
          }
        : null,
      availableTools: availableTools.map((tool) => ({
        token: tool.token,
        kind: tool.kind,
        label: tool.label,
      })),
    },
    viewerStateSummary: {
      hasSerializableState: true,
      floatingWindowCount: input.viewerState.layout.windows?.length ?? 0,
    },
    assistantReadTools: APP_ASSISTANT_READ_TOOLS.map((tool) => ({
      name: tool.name,
      description: tool.description,
    })),
    assistantTools: APP_ASSISTANT_TOOLS.map((tool) => {
      const availability = toolAvailability.find((item) => item.name === tool.name);
      return {
        name: tool.name,
        description: tool.description,
        available: availability?.available ?? false,
        reason: availability?.reason,
      };
    }),
  };
}

export function createMockAppAssistantModel(): AppAssistantModel {
  return {
    async sendMessage(request) {
      const response = await mockAutomationAssistantModel.generateResponse({
        userMessage: request.userMessage,
        capabilities: [],
        onToken: request.onToken,
      });
      const draftProposal = response.draft
        ? {
            mode: "draft" as const,
            summary: `Create "${response.draft.name}".`,
            targetPipelineId: null,
            draft: response.draft,
          }
        : undefined;
      return finalizeAssistantResponse(
        {
          message: response.message,
          rawText: response.rawText ?? response.message,
          pipelineDraft: response.draft,
          proposal: draftProposal,
        },
        response.rawText ?? response.message,
        request.userMessage,
        request.appContext,
        request.conversationHistory
      );
    },
  };
}

export function createWebLLMAppAssistantModel(options?: {
  modelId?: string;
  onStatus?: (status: AppAssistantStatus) => void;
}): AppAssistantModel {
  const modelId = options?.modelId ?? DEFAULT_WEBLLM_MODEL_ID;
  return {
    async sendMessage(request) {
      if (!isWebGPUSupported()) {
        options?.onStatus?.({
          phase: "unsupported",
          message: "Local assistant needs WebGPU. Use Chrome or Edge with WebGPU enabled, or switch to Mock.",
        });
        throw new Error("WebGPU is not available for the local assistant.");
      }

      options?.onStatus?.({ phase: "loading", message: `Loading ${modelId}...`, progress: 0 });
      const engine = await getAppAssistantEngine(modelId, options?.onStatus);
      options?.onStatus?.({ phase: "generating", message: "Assistant is thinking..." });

      let streamedText = "";
      const createCompletion = (compact = false, ultraCompact = false) =>
        engine.chat.completions.create({
          messages: [
            { role: "system", content: buildAppAssistantPrompt() },
            {
              role: "user",
              content: buildAppAssistantUserPrompt(request.userMessage, request.appContext, {
                compact,
                ultraCompact,
                conversationHistory: request.conversationHistory,
              }),
            },
          ],
          temperature: 0.2,
          top_p: 0.9,
          max_tokens: 1800,
          stream: true,
        });

      let response;
      try {
        response = await createCompletion(false, false);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        if (!/context window size|prompt tokens exceed/i.test(errorMessage)) {
          throw error;
        }
        options?.onStatus?.({ phase: "generating", message: "Prompt is large. Retrying with compact context..." });
        try {
          response = await createCompletion(true, false);
        } catch (compactError) {
          const compactErrorMessage = compactError instanceof Error ? compactError.message : String(compactError);
          if (!/context window size|prompt tokens exceed/i.test(compactErrorMessage)) {
            throw compactError;
          }
          options?.onStatus?.({ phase: "generating", message: "Still too large. Retrying with minimal context..." });
          response = await createCompletion(true, true);
        }
      }

      for await (const chunk of response) {
        const token = chunk.choices[0]?.delta?.content ?? "";
        if (!token) continue;
        streamedText += token;
        request.onToken?.(streamedText);
      }

      const parsed = parseAppAssistantResponse(streamedText);
      const finalized = finalizeAssistantResponse(
        parsed,
        streamedText,
        request.userMessage,
        request.appContext,
        request.conversationHistory
      );
      options?.onStatus?.({ phase: "ready", message: "Assistant response ready." });
      return finalized;
    },
  };
}

export async function stopAppAssistantGeneration() {
  await appAssistantEngine?.interruptGenerate();
}

export function isWebGPUSupported() {
  return typeof navigator !== "undefined" && "gpu" in navigator;
}

function collectLayerNodes(nodes: LayerTreeNode[]): Array<Extract<LayerTreeNode, { kind: "layer" }>> {
  const result: Array<Extract<LayerTreeNode, { kind: "layer" }>> = [];
  nodes.forEach((node) => {
    if (node.kind === "layer") result.push(node);
    if (node.kind === "group") result.push(...collectLayerNodes(node.children));
  });
  return result;
}

async function getAppAssistantEngine(
  modelId: string,
  onStatus?: (status: AppAssistantStatus) => void
) {
  if (!appAssistantEnginePromise) {
    appAssistantEnginePromise = import("@mlc-ai/web-llm")
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
        appAssistantEngine = engine;
        return engine;
      })
      .catch((error) => {
        appAssistantEnginePromise = null;
        onStatus?.({
          phase: "error",
          message: error instanceof Error ? error.message : "Local assistant failed to load.",
        });
        throw error;
      });
  }
  return appAssistantEnginePromise;
}

function buildAppAssistantPrompt() {
  return `You are the general assistant for Mouse Brain Viewer.
You answer questions about the app, explain viewer context, and can propose changes to the current viewer state or the current automation pipeline.

When the user is only asking a question or continuing the conversation, reply naturally in plain text.
When the user wants a change to be applied, return a JSON object with a human-readable "message" plus either:
- a "toolCall" object for a direct viewer/app/pipeline state change, or
- an "intent" object only for structured pipeline graph edits, or
- a "proposal" object for a full pipeline draft or explicit patch.

Structured response shape:
{
  "message": "Briefly explain what will change.",
  "toolCall": { ... }
}

Rules:
- Do not repeat the user's prompt back to them.
- Do not invent API endpoints.
- Do not dump the raw context object.
- Only return a toolCall that exists in the tools provided in the request context.
- Prefer a toolCall for direct state updates such as visibility, opacity, translation, grouping, renaming, pipeline description, pipeline enabled state, pipeline autorun, or pipeline node config changes.
- Use intent mainly for pipeline graph structure edits like adding or removing nodes or connections.
- If a requested change needs a concrete value and the user has not provided one, ask a short follow-up question instead of inventing a value.
- Do not confuse opacity with rotation, translation, visibility, or other unrelated operations.
- If the user asks what you can or cannot do, answer from the available read tools and write tools in the app context.
- If a requested write tool is unavailable right now, say so plainly and use the provided reason.
- If you cannot produce a valid change request, say so plainly in normal text.
- Prefer concise answers.`;
}

function buildAppAssistantUserPrompt(
  userMessage: string,
  context: AppAssistantContext,
  options?: {
    compact?: boolean;
    ultraCompact?: boolean;
    conversationHistory?: Array<{ role: "user" | "assistant"; content: string }>;
  }
) {
  const scope = inferAssistantRequestScope(userMessage);
  const focusedContext = buildFocusedAppAssistantContext(context, {
    compact: options?.compact ?? false,
    ultraCompact: options?.ultraCompact ?? false,
    includeTools: requestNeedsStructuredProposal(userMessage),
    scope,
  });
  const readTools = filterAssistantReadTools(context.assistantReadTools, scope, options?.ultraCompact ?? false);
  const writeTools = filterAssistantWriteTools(context.assistantTools, scope, options?.ultraCompact ?? false);
  const conversationContext = summarizeConversationHistory(options?.conversationHistory ?? [], options?.ultraCompact ?? false);
  const changeHint = requestNeedsStructuredProposal(userMessage)
    ? "This request appears to ask for a change. If you can propose one, return JSON with a message plus a toolCall, intent, or proposal."
    : "If no change is needed, answer in plain text.";
  return `User message:
${userMessage}

${conversationContext ? `Recent conversation:
${conversationContext}

` : ""}Current app context:
${JSON.stringify(focusedContext)}

Available read tools:
${readTools.map((tool) => `- ${tool.name}: ${tool.description}`).join("\n")}

Available write tools right now:
${writeTools
  .map((tool) => `- ${tool.name}: ${tool.description} [${tool.available ? "available" : `unavailable: ${tool.reason ?? "not available"}`}]`)
  .join("\n")}

${changeHint}`;
}

function buildFocusedAppAssistantContext(
  context: AppAssistantContext,
  options: { compact: boolean; ultraCompact: boolean; includeTools: boolean; scope: AssistantRequestScope }
) {
  const includeAutomation = options.scope !== "viewer";
  const includeSavedViewers = options.scope === "general";
  const includeLayerNames = !options.ultraCompact;
  return {
    view: {
      activeTool: context.view.activeTool,
      selectedNodeId: context.view.selectedNodeId,
      selectedNodeIds: context.view.selectedNodeIds,
      selectedNodeCount: context.view.selectedNodeCount,
      selectedNodeName: context.view.selectedNodeName,
      selectedNodeKind: context.view.selectedNodeKind,
      selectedLayerType: context.view.selectedLayerType,
      selectedNodeVisible: context.view.selectedNodeVisible,
      selectedNodeOpacity: context.view.selectedNodeOpacity,
      selectedNodeTranslation: context.view.selectedNodeTranslation,
    },
    layers: {
      total: context.layers.total,
      visible: context.layers.visible,
      hidden: context.layers.hidden,
      localDatasets: context.layers.localDatasets,
      names: includeLayerNames ? context.layers.names.slice(0, options.compact ? 3 : 6) : undefined,
    },
    savedViewers: includeSavedViewers
      ? {
          count: context.savedViewers.count,
          activeName: context.savedViewers.activeName,
          recentNames: context.savedViewers.recentNames.slice(0, options.compact ? 2 : 4),
        }
      : undefined,
    automation: includeAutomation
      ? {
          count: context.automation.count,
          activeCount: context.automation.activeCount,
          activePipelineName: context.automation.activePipelineName,
          activePipeline: summarizePipelineForAssistant(context.automation.activePipeline, options.compact || options.ultraCompact),
          availableTools:
            options.includeTools && !options.ultraCompact
              ? context.automation.availableTools
                  .slice(0, options.compact ? 20 : 60)
                  .map((tool) => (options.compact ? tool.token : tool))
              : undefined,
        }
      : undefined,
    viewerStateSummary: context.viewerStateSummary,
  };
}

function summarizePipelineForAssistant(
  activePipeline: AppAssistantContext["automation"]["activePipeline"],
  compact: boolean
) {
  if (!activePipeline) return null;
  try {
    const script = JSON.parse(activePipeline.script) as {
      nodes?: Array<{ id?: string; token?: string; label?: string; config?: Record<string, unknown> }>;
      connections?: Array<{ fromNodeId?: string; toNodeId?: string; mode?: string }>;
    };
    return {
      id: activePipeline.id,
      name: activePipeline.name,
      description: activePipeline.description,
      active: activePipeline.active,
      autoRun: activePipeline.autoRun,
      nodeCount: activePipeline.nodeCount,
      connectionCount: activePipeline.connectionCount,
      nodes: (script.nodes ?? []).slice(0, compact ? 24 : 60).map((node) => ({
        id: node.id,
        token: node.token,
        label: node.label,
        config: compact ? compactConfig(node.config) : node.config,
      })),
      connections: (script.connections ?? []).slice(0, compact ? 32 : 80).map((connection) => ({
        fromNodeId: connection.fromNodeId,
        toNodeId: connection.toNodeId,
        mode: connection.mode,
      })),
    };
  } catch {
    return {
      id: activePipeline.id,
      name: activePipeline.name,
      description: activePipeline.description,
      active: activePipeline.active,
      autoRun: activePipeline.autoRun,
      nodeCount: activePipeline.nodeCount,
      connectionCount: activePipeline.connectionCount,
      scriptPreview: activePipeline.script.slice(0, compact ? 400 : 1200),
    };
  }
}

function compactConfig(config: Record<string, unknown> | undefined) {
  if (!config) return undefined;
  const entries = Object.entries(config).slice(0, 6).map(([key, value]) => [
    key,
    typeof value === "string" && value.length > 80 ? `${value.slice(0, 77)}...` : value,
  ]);
  return Object.fromEntries(entries);
}

function summarizeConversationHistory(
  history: Array<{ role: "user" | "assistant"; content: string }>,
  ultraCompact: boolean
) {
  return history
    .slice(-(ultraCompact ? 2 : 4))
    .map((message) => {
      const text = message.content.trim().replace(/\s+/g, " ");
      const capped = text.length > (ultraCompact ? 120 : 220) ? `${text.slice(0, ultraCompact ? 117 : 217)}...` : text;
      return `${message.role === "user" ? "User" : "Assistant"}: ${capped}`;
    })
    .filter((line) => !!line && line.length < (ultraCompact ? 180 : 320))
    .join("\n");
}

type AssistantRequestScope = "viewer" | "pipeline" | "general";

function inferAssistantRequestScope(userMessage: string): AssistantRequestScope {
  const lower = normalizeAssistantQuestion(userMessage);
  const pipelineDomain =
    /\b(pipeline|automation|node|nodes|tool|tools|event|action|condition|source|compute|graph|route)\b/.test(lower);
  const viewerDomain =
    /\b(layer|layers|group|annotation|annotations|window|windows|camera|slice|viewer|state|selection|selected|opacity|visible|invisible)\b/.test(lower);
  if (pipelineDomain && !viewerDomain) return "pipeline";
  if (viewerDomain && !pipelineDomain) return "viewer";
  return "general";
}

function filterAssistantReadTools(
  tools: AppAssistantContext["assistantReadTools"],
  scope: AssistantRequestScope,
  ultraCompact: boolean
) {
  const filtered =
    scope === "viewer"
      ? tools.filter((tool) => tool.name.startsWith("viewer."))
      : scope === "pipeline"
      ? tools.filter((tool) => tool.name.startsWith("pipeline."))
      : tools;
  return filtered.slice(0, ultraCompact ? 2 : 6);
}

function filterAssistantWriteTools(
  tools: AppAssistantContext["assistantTools"],
  scope: AssistantRequestScope,
  ultraCompact: boolean
) {
  const assistantFacingTools = tools.filter(
    (tool) =>
      tool.name === "assistant.proposeStateCommand" ||
      tool.name === "assistant.proposePipelineCommand"
  );
  const filtered =
    scope === "viewer"
      ? assistantFacingTools.filter((tool) => tool.name === "assistant.proposeStateCommand")
      : scope === "pipeline"
      ? assistantFacingTools.filter((tool) => tool.name === "assistant.proposePipelineCommand")
      : assistantFacingTools;
  return filtered.slice(0, ultraCompact ? 4 : 10);
}

function requestNeedsStructuredProposal(userMessage: string) {
  const lower = normalizeAssistantQuestion(userMessage);
  const mutationVerb =
    /\b(change|update|modify|edit|replace|switch|adjust|fix|hide|show|group|ungroup|rename|move|set|create|delete|remove|toggle|focus|select|deselect|open|close|reorder|merge|split|apply)\b/.test(lower);
  const pipelineDomain =
    /\b(pipeline|automation|node|nodes|tool|tools|event|action|condition|source|compute|graph|route)\b/.test(lower);
  const viewerDomain =
    /\b(layer|layers|group|annotation|annotations|window|windows|camera|slice|viewer|state|selection|selected|opacity|visible|invisible)\b/.test(lower);
  return mutationVerb && (pipelineDomain || viewerDomain);
}

function parseAppAssistantResponse(text: string): AppAssistantResponse {
  const trimmed = text.trim();
  const jsonStart = findLikelyJsonStart(trimmed);
  if (jsonStart < 0) {
    const extracted = extractJsonCandidate(trimmed);
    if (extracted) {
      const prefix = extracted.prefix.trim();
      try {
        const parsed = JSON.parse(extracted.jsonText) as {
          message?: unknown;
          draft?: unknown;
          proposal?: unknown;
          intent?: unknown;
          toolCall?: unknown;
        };
        const parsedMessage =
          typeof parsed.message === "string" && parsed.message.trim() ? parsed.message.trim() : prefix || "";
        return {
          message: parsedMessage || "I generated a response.",
          rawText: text,
          pipelineDraft: parsed.draft ? normalizeAutomationAssistantDraft(parsed.draft) : undefined,
          proposal: normalizeAppAssistantProposal(parsed.proposal, parsed.draft),
          intent: normalizeAppAssistantIntent(parsed.intent),
          toolProposal: normalizeToolProposal(parsed.toolCall ?? parsed),
        };
      } catch {
        return {
          message: prefix || trimmed || "No response.",
          rawText: text,
        };
      }
    }
    return {
      message: trimmed || "No response.",
      rawText: text,
    };
  }

  const prefix = trimmed.slice(0, jsonStart).trim();
  const jsonText = trimmed.slice(jsonStart);
  try {
    const parsed = JSON.parse(jsonText) as {
      message?: unknown;
      draft?: unknown;
      proposal?: unknown;
      intent?: unknown;
      toolCall?: unknown;
    };
    const parsedMessage =
      typeof parsed.message === "string" && parsed.message.trim() ? parsed.message.trim() : prefix || "";
    return {
      message: parsedMessage || "I generated a response.",
      rawText: text,
      pipelineDraft: parsed.draft ? normalizeAutomationAssistantDraft(parsed.draft) : undefined,
      proposal: normalizeAppAssistantProposal(parsed.proposal, parsed.draft),
      intent: normalizeAppAssistantIntent(parsed.intent),
      toolProposal: normalizeToolProposal(parsed.toolCall ?? parsed),
    };
  } catch {
    return {
      message: prefix || trimmed || "No response.",
      rawText: text,
    };
  }
}

function finalizeAssistantResponse(
  parsed: AppAssistantResponse,
  rawText: string,
  userMessage: string,
  context: AppAssistantContext,
  conversationHistory?: Array<{ role: "user" | "assistant"; content: string }>
): AppAssistantResponse {
  const inferredToolProposal = inferToolProposalFromRequest(userMessage, context, conversationHistory);
  const resolvedToolProposal =
    parsed.toolProposal ??
    resolveAssistantToolProposal(parsed.intent, context) ??
    (requestNeedsStructuredProposal(userMessage) ? inferredToolProposal : undefined);
  const refinedToolResult = refineToolProposalFromConversation(
    resolvedToolProposal,
    userMessage,
    conversationHistory
  );
  const toolProposal = refinedToolResult.toolProposal;
  const proposal = parsed.proposal ?? (!toolProposal ? resolveAssistantIntentToProposal(parsed.intent, context) : undefined);
  const message =
    refinedToolResult.messageOverride ??
    chooseAssistantMessage(parsed.message, userMessage, proposal, toolProposal, context);
  const shouldSuppressRaw = isLowSignalAssistantReply(parsed.message, userMessage) || !!proposal || !!toolProposal;
  return {
    ...parsed,
    message,
    rawText: shouldSuppressRaw ? message : rawText,
    proposal,
    toolProposal,
    pipelineDraft: parsed.pipelineDraft ?? (proposal?.mode === "draft" ? proposal.draft : undefined),
  };
}

function refineToolProposalFromConversation(
  toolProposal: AppAssistantToolProposal | undefined,
  userMessage: string,
  conversationHistory?: Array<{ role: "user" | "assistant"; content: string }>
): { toolProposal?: AppAssistantToolProposal; messageOverride?: string } {
  if (!toolProposal) return {};
  const recentUserMessages = [
    ...(conversationHistory ?? []).filter((entry) => entry.role === "user").map((entry) => entry.content),
    userMessage,
  ].slice(-6);

  if (toolProposal.toolCall.name === "assistant.proposeStateCommand") {
    const command = toolProposal.toolCall.arguments.command;
    if (command.kind === "selectedLayer.setOpacity") {
      const requestedOpacity = extractRequestedOpacity(recentUserMessages);
      if (requestedOpacity === null) {
        return {
          messageOverride:
            "Sure — what opacity do you want for the selected layer? For example 10%, 50%, or 100%.",
        };
      }
      if (command.opacity !== requestedOpacity) {
        const nextToolCall: AppAssistantToolCall = {
          name: "assistant.proposeStateCommand",
          arguments: { command: { kind: "selectedLayer.setOpacity", opacity: requestedOpacity } },
        };
        return {
          toolProposal: {
            summary: summarizeAssistantToolCall(nextToolCall),
            toolCall: nextToolCall,
          },
        };
      }
    }

    if (command.kind === "selectedLayer.setVisibility") {
      const requestedVisible = extractRequestedVisibility(recentUserMessages);
      if (requestedVisible !== null && command.visible !== requestedVisible) {
        const nextToolCall: AppAssistantToolCall = {
          name: "assistant.proposeStateCommand",
          arguments: { command: { kind: "selectedLayer.setVisibility", visible: requestedVisible } },
        };
        return {
          toolProposal: {
            summary: summarizeAssistantToolCall(nextToolCall),
            toolCall: nextToolCall,
          },
        };
      }
    }
  }

  if (toolProposal.toolCall.name === "assistant.proposePipelineCommand") {
    const command = toolProposal.toolCall.arguments.command;
    if (command.kind === "activePipeline.setDescription") {
      const requestedDescription = extractRequestedPipelineDescription(recentUserMessages);
      if (requestedDescription && command.description !== requestedDescription) {
        const nextToolCall: AppAssistantToolCall = {
          name: "assistant.proposePipelineCommand",
          arguments: { command: { kind: "activePipeline.setDescription", description: requestedDescription } },
        };
        return {
          toolProposal: {
            summary: summarizeAssistantToolCall(nextToolCall),
            toolCall: nextToolCall,
          },
        };
      }
    }
  }

  return { toolProposal };
}

function inferToolProposalFromRequest(
  userMessage: string,
  context: AppAssistantContext,
  conversationHistory?: Array<{ role: "user" | "assistant"; content: string }>
): AppAssistantToolProposal | undefined {
  const recentUserMessages = [
    ...(conversationHistory ?? []).filter((entry) => entry.role === "user").map((entry) => entry.content),
    userMessage,
  ].slice(-6);
  const lower = normalizeAssistantQuestion(userMessage);

  if (context.view.selectedNodeId && context.view.selectedNodeKind === "layer") {
    const requestedVisible = extractRequestedVisibility(recentUserMessages);
    if (requestedVisible !== null && /\b(show|hide|visible|invisible|unhide)\b/.test(lower)) {
      const toolCall: AppAssistantToolCall = {
        name: "assistant.proposeStateCommand",
        arguments: { command: { kind: "selectedLayer.setVisibility", visible: requestedVisible } },
      };
      return {
        summary: summarizeAssistantToolCall(toolCall),
        toolCall,
      };
    }

    if (/\bopacity\b/.test(lower)) {
      const requestedOpacity = extractRequestedOpacity(recentUserMessages);
      if (requestedOpacity !== null) {
        const toolCall: AppAssistantToolCall = {
          name: "assistant.proposeStateCommand",
          arguments: { command: { kind: "selectedLayer.setOpacity", opacity: requestedOpacity } },
        };
        return {
          summary: summarizeAssistantToolCall(toolCall),
          toolCall,
        };
      }
    }

    const translation = extractRequestedTranslation(recentUserMessages);
    if (translation && (translation.dx !== undefined || translation.dy !== undefined || translation.dz !== undefined)) {
      const toolCall: AppAssistantToolCall = {
        name: "assistant.proposeStateCommand",
        arguments: { command: { kind: "selectedLayer.translate", ...translation } },
      };
      return {
        summary: summarizeAssistantToolCall(toolCall),
        toolCall,
      };
    }

    const renameTarget = extractRequestedLayerName(recentUserMessages);
    if (renameTarget) {
      const toolCall: AppAssistantToolCall = {
        name: "assistant.proposeStateCommand",
        arguments: { command: { kind: "selectedLayer.rename", name: renameTarget } },
      };
      return {
        summary: summarizeAssistantToolCall(toolCall),
        toolCall,
      };
    }
  }

  if (context.view.selectedNodeCount >= 2 && /\b(group|group together|create a group)\b/.test(lower)) {
    const groupName = extractRequestedGroupName(recentUserMessages) ?? undefined;
    const toolCall: AppAssistantToolCall = {
      name: "assistant.proposeStateCommand",
      arguments: { command: groupName ? { kind: "selection.group", name: groupName } : { kind: "selection.group" } },
    };
    return {
      summary: summarizeAssistantToolCall(toolCall),
      toolCall,
    };
  }

  if (context.automation.activePipeline) {
    const pipelineDescription = extractRequestedPipelineDescription(recentUserMessages);
    if (pipelineDescription) {
      const toolCall: AppAssistantToolCall = {
        name: "assistant.proposePipelineCommand",
        arguments: { command: { kind: "activePipeline.setDescription", description: pipelineDescription } },
      };
      return {
        summary: summarizeAssistantToolCall(toolCall),
        toolCall,
      };
    }
  }

  return undefined;
}

function extractRequestedOpacity(messages: string[]): number | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    const percentMatch = message.match(/(\d+(?:\.\d+)?)\s*%/);
    if (percentMatch?.[1]) {
      const percent = Number(percentMatch[1]);
      if (Number.isFinite(percent)) {
        return Math.max(0, Math.min(1, percent / 100));
      }
    }
    const decimalMatch = message.match(/\b(?:opacity|opaque|transparen\w*)\b[\s\S]{0,40}?\b(0(?:\.\d+)?|1(?:\.0+)?)\b/i);
    if (decimalMatch?.[1]) {
      const value = Number(decimalMatch[1]);
      if (Number.isFinite(value)) {
        return Math.max(0, Math.min(1, value));
      }
    }
  }
  return null;
}

function extractRequestedTranslation(messages: string[]) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const lower = normalizeAssistantQuestion(messages[index]);
    const directionMatches = Array.from(lower.matchAll(/\b([xyz])\s+direction\s+(-?\d+(?:\.\d+)?)\b/g));
    if (directionMatches.length) {
      const out: { dx?: number; dy?: number; dz?: number } = {};
      directionMatches.forEach((match) => {
        const axis = match[1];
        const value = Number(match[2]);
        if (!Number.isFinite(value)) return;
        if (axis === "x") out.dx = value;
        if (axis === "y") out.dy = value;
        if (axis === "z") out.dz = value;
      });
      return out;
    }
    const simpleMatch = lower.match(/\bmove\b[\s\S]{0,40}?\b([xyz])\b[\s\S]{0,20}?\b(-?\d+(?:\.\d+)?)\b/);
    if (simpleMatch?.[1] && simpleMatch[2]) {
      const axis = simpleMatch[1];
      const value = Number(simpleMatch[2]);
      if (Number.isFinite(value)) {
        return axis === "x" ? { dx: value } : axis === "y" ? { dy: value } : { dz: value };
      }
    }
  }
  return null;
}

function extractRequestedLayerName(messages: string[]) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const match = messages[index].match(/\brename\b[\s\S]{0,40}?\bto\b\s+["']?([^"'\n]+?)["']?\s*$/i);
    if (match?.[1]?.trim()) {
      return match[1].trim();
    }
  }
  return null;
}

function extractRequestedGroupName(messages: string[]) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const match = messages[index].match(/\bgroup\b[\s\S]{0,40}?\b(?:called|named)\b\s+["']?([^"'\n]+?)["']?\s*$/i);
    if (match?.[1]?.trim()) {
      return match[1].trim();
    }
  }
  return null;
}

function extractRequestedPipelineDescription(messages: string[]) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const match = messages[index].match(/\bdescription\b[\s\S]{0,40}?\bto\b\s+["']?([^"'\n]+?)["']?\s*$/i);
    if (match?.[1]?.trim()) {
      return match[1].trim();
    }
  }
  return null;
}

function extractRequestedVisibility(messages: string[]): boolean | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const lower = normalizeAssistantQuestion(messages[index]);
    if (/\b(unhide|show|make visible|visible again)\b/.test(lower)) return true;
    if (/\b(hide|invisible|not visible)\b/.test(lower)) return false;
  }
  return null;
}

function chooseAssistantMessage(
  parsedMessage: string,
  userMessage: string,
  proposal: AutomationAssistantPipelineProposal | undefined,
  toolProposal: AppAssistantToolProposal | undefined,
  context: AppAssistantContext
) {
  if (!isLowSignalAssistantReply(parsedMessage, userMessage)) {
    return parsedMessage;
  }
  if (toolProposal) {
    return toolProposal.summary;
  }
  if (proposal?.mode === "draft") {
    return proposal.summary;
  }
  if (proposal?.mode === "patch") {
    return proposal.summary;
  }
  if (requestNeedsStructuredProposal(userMessage)) {
    return inferGenericFailureMessage(userMessage, context);
  }
  return parsedMessage.trim() || "I understood the request, but I could not produce a useful response yet.";
}

function inferGenericFailureMessage(userMessage: string, _context: AppAssistantContext) {
  if (isPipelineFocusedQuestion(userMessage)) {
    return "I understood that you want to change the current pipeline, but I could not produce a valid pipeline change yet.";
  }
  if (isViewerStateFocusedQuestion(userMessage)) {
    return "I understood that you want to change the current viewer state, but I could not produce a valid state change yet.";
  }
  return "I understood the request, but I could not produce a valid change yet.";
}

function isLowSignalAssistantReply(value: string, userMessage: string) {
  const normalized = normalizeAssistantQuestion(value);
  if (!normalized) return true;
  if (normalized === normalizeAssistantQuestion(userMessage)) return true;
  return (
    normalized === "i generated a response" ||
    normalized === "what you built" ||
    normalized === "changes made" ||
    normalized === "updated" ||
    normalized === "short explanation"
  );
}

function findLikelyJsonStart(content: string) {
  const messageIndex = content.indexOf('"message"');
  if (messageIndex >= 0) {
    const beforeMessage = content.lastIndexOf("{", messageIndex);
    if (beforeMessage >= 0) return beforeMessage;
  }
  const draftIndex = content.indexOf('"draft"');
  if (draftIndex >= 0) {
    const beforeDraft = content.lastIndexOf("{", draftIndex);
    if (beforeDraft >= 0) return beforeDraft;
  }
  return content.search(/^\s*[{[]/);
}

function extractJsonCandidate(content: string): { prefix: string; jsonText: string } | null {
  const fencedMatch = content.match(/```json\s*([\s\S]*?)```/i) ?? content.match(/```\s*([\s\S]*?)```/i);
  if (fencedMatch?.[1]) {
    const jsonText = fencedMatch[1].trim();
    if (jsonText.startsWith("{") || jsonText.startsWith("[")) {
      const prefix = content.slice(0, fencedMatch.index ?? 0);
      return { prefix, jsonText };
    }
  }
  const firstBrace = content.indexOf("{");
  const lastBrace = content.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    const jsonText = content.slice(firstBrace, lastBrace + 1).trim();
    if (jsonText.startsWith("{") || jsonText.startsWith("[")) {
      const prefix = content.slice(0, firstBrace);
      return { prefix, jsonText };
    }
  }
  return null;
}

function normalizeAppAssistantProposal(
  proposalValue: unknown,
  legacyDraftValue: unknown
): AutomationAssistantPipelineProposal | undefined {
  if (proposalValue && typeof proposalValue === "object") {
    const candidate = proposalValue as {
      mode?: unknown;
      summary?: unknown;
      targetPipelineId?: unknown;
      draft?: unknown;
      patch?: unknown;
    };
    const summary =
      typeof candidate.summary === "string" && candidate.summary.trim()
        ? candidate.summary
        : "Assistant proposed a pipeline change.";
    const targetPipelineId =
      typeof candidate.targetPipelineId === "string" && candidate.targetPipelineId.trim()
        ? candidate.targetPipelineId
        : null;
    if (candidate.mode === "patch") {
      try {
        return {
          mode: "patch",
          summary,
          targetPipelineId,
          patch: normalizeAutomationAssistantPatch(candidate.patch),
        };
      } catch {
        return undefined;
      }
    }
    if (candidate.mode === "draft" || candidate.draft) {
      try {
        return {
          mode: "draft",
          summary,
          targetPipelineId,
          draft: normalizeAutomationAssistantDraft(candidate.draft),
        };
      } catch {
        return undefined;
      }
    }
  }

  if (legacyDraftValue) {
    try {
      return {
        mode: "draft",
        summary: "Assistant drafted a pipeline.",
        targetPipelineId: null,
        draft: normalizeAutomationAssistantDraft(legacyDraftValue),
      };
    } catch {
      return undefined;
    }
  }
  return undefined;
}

function normalizeAppAssistantIntent(value: unknown): AppAssistantIntent | undefined {
  if (!value || typeof value !== "object") return undefined;
  const candidate = value as {
    kind?: unknown;
    target?: unknown;
    changes?: unknown;
    updates?: unknown;
    node?: unknown;
    from?: unknown;
    to?: unknown;
    mode?: unknown;
    visible?: unknown;
  };

  if (candidate.kind === "set_pipeline_meta" && candidate.changes && typeof candidate.changes === "object") {
    const changes = candidate.changes as Record<string, unknown>;
    return {
      kind: "set_pipeline_meta",
      target: normalizeIntentTarget(candidate.target),
      changes: {
        ...(typeof changes.name === "string" ? { name: changes.name } : {}),
        ...(typeof changes.description === "string" ? { description: changes.description } : {}),
        ...(typeof changes.active === "boolean" ? { active: changes.active } : {}),
        ...(typeof changes.autoRun === "boolean" ? { autoRun: changes.autoRun } : {}),
      },
    };
  }

  if (candidate.kind === "update_node_config" && candidate.changes && typeof candidate.changes === "object") {
    return {
      kind: "update_node_config",
      target: normalizeIntentTarget(candidate.target),
      changes: normalizeScalarRecord(candidate.changes),
    };
  }

  if (candidate.kind === "update_many_node_configs" && Array.isArray(candidate.updates)) {
    const updates = candidate.updates
      .map((update) => {
        if (!update || typeof update !== "object") return null;
        const item = update as { target?: unknown; changes?: unknown };
        if (!item.changes || typeof item.changes !== "object") return null;
        const changes = normalizeScalarRecord(item.changes);
        if (!Object.keys(changes).length) return null;
        return { target: normalizeIntentTarget(item.target), changes };
      })
      .filter((update): update is NonNullable<typeof update> => !!update);
    return updates.length ? { kind: "update_many_node_configs", updates } : undefined;
  }

  if (candidate.kind === "add_node" && candidate.node && typeof candidate.node === "object") {
    const node = candidate.node as Record<string, unknown>;
    if (typeof node.token !== "string" || !node.token.trim()) return undefined;
    return {
      kind: "add_node",
      node: {
        token: node.token,
        ...(typeof node.id === "string" ? { id: node.id } : {}),
        ...(typeof node.label === "string" ? { label: node.label } : {}),
        ...(typeof node.x === "number" ? { x: node.x } : {}),
        ...(typeof node.y === "number" ? { y: node.y } : {}),
        ...(node.config && typeof node.config === "object" ? { config: normalizeScalarRecord(node.config) } : {}),
      },
    };
  }

  if (candidate.kind === "remove_node") {
    return {
      kind: "remove_node",
      target: normalizeIntentTarget(candidate.target),
    };
  }

  if (candidate.kind === "add_connection") {
    return {
      kind: "add_connection",
      from: normalizeConnectionNodeTarget(candidate.from),
      to: normalizeConnectionNodeTarget(candidate.to),
      ...(candidate.mode === "data" || candidate.mode === "trigger" ? { mode: candidate.mode } : {}),
    };
  }

  if (candidate.kind === "remove_connection" && candidate.target && typeof candidate.target === "object") {
    const target = candidate.target as Record<string, unknown>;
    return {
      kind: "remove_connection",
      target: {
        ...(typeof target.connectionId === "string" ? { connectionId: target.connectionId } : {}),
        ...(typeof target.fromNodeId === "string" ? { fromNodeId: target.fromNodeId } : {}),
        ...(typeof target.fromNodeToken === "string" ? { fromNodeToken: target.fromNodeToken } : {}),
        ...(typeof target.toNodeId === "string" ? { toNodeId: target.toNodeId } : {}),
        ...(typeof target.toNodeToken === "string" ? { toNodeToken: target.toNodeToken } : {}),
        ...(target.mode === "trigger" || target.mode === "data" ? { mode: target.mode } : {}),
      },
    };
  }

  if (candidate.kind === "set_layer_visibility" && typeof candidate.visible === "boolean") {
    return {
      kind: "set_layer_visibility",
      target: { scope: "selected" },
      visible: candidate.visible,
    };
  }

  return undefined;
}

function normalizeToolProposal(value: unknown): AppAssistantToolProposal | undefined {
  const toolCall = normalizeAssistantToolCall(value);
  if (!toolCall) return undefined;
  return {
    summary: summarizeAssistantToolCall(toolCall),
    toolCall,
  };
}

function normalizeScalarRecord(value: unknown): Record<string, string | number | boolean> {
  if (!value || typeof value !== "object") return {};
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).filter(
      ([, item]) => typeof item === "string" || typeof item === "number" || typeof item === "boolean"
    )
  ) as Record<string, string | number | boolean>;
}

function normalizeIntentTarget(value: unknown) {
  if (!value || typeof value !== "object") return { pipeline: "active" as const };
  const candidate = value as Record<string, unknown>;
  return {
    pipeline: candidate.pipeline === "active" ? ("active" as const) : ("active" as const),
    ...(typeof candidate.nodeId === "string" ? { nodeId: candidate.nodeId } : {}),
    ...(typeof candidate.nodeToken === "string" ? { nodeToken: candidate.nodeToken } : {}),
    ...(typeof candidate.nodeLabel === "string" ? { nodeLabel: candidate.nodeLabel } : {}),
  };
}

function normalizeConnectionNodeTarget(value: unknown) {
  if (!value || typeof value !== "object") return {};
  const candidate = value as Record<string, unknown>;
  return {
    ...(typeof candidate.nodeId === "string" ? { nodeId: candidate.nodeId } : {}),
    ...(typeof candidate.nodeToken === "string" ? { nodeToken: candidate.nodeToken } : {}),
    ...(typeof candidate.nodeLabel === "string" ? { nodeLabel: candidate.nodeLabel } : {}),
  };
}

function resolveAssistantIntentToProposal(
  intent: AppAssistantIntent | undefined,
  context: AppAssistantContext
): AutomationAssistantPipelineProposal | undefined {
  const activePipeline = context.automation.activePipeline;
  if (!intent || !activePipeline) return undefined;

  if (intent.kind === "set_pipeline_meta") {
    return {
      mode: "patch",
      summary: "Update pipeline settings.",
      targetPipelineId: activePipeline.id,
      patch: {
        operations: [
          {
            op: "set_pipeline_meta",
            ...(typeof intent.changes.name === "string" ? { name: intent.changes.name } : {}),
            ...(typeof intent.changes.description === "string" ? { description: intent.changes.description } : {}),
            ...(typeof intent.changes.active === "boolean" ? { active: intent.changes.active } : {}),
            ...(typeof intent.changes.autoRun === "boolean" ? { autoRun: intent.changes.autoRun } : {}),
          },
        ],
      },
    };
  }

  if (intent.kind === "update_node_config") {
    const targetNode = resolveIntentTargetNode(activePipeline, intent.target, intent.changes);
    if (!targetNode) return undefined;
    return {
      mode: "patch",
      summary: `Update ${targetNode.id}.`,
      targetPipelineId: activePipeline.id,
      patch: {
        operations: [
          {
            op: "update_node_config",
            nodeId: targetNode.id,
            config: Object.fromEntries(Object.entries(intent.changes).map(([key, value]) => [key, String(value)])),
          },
        ],
      },
    };
  }

  if (intent.kind === "update_many_node_configs") {
    const operations = intent.updates
      .map((update) => {
        const targetNode = resolveIntentTargetNode(activePipeline, update.target, update.changes);
        if (!targetNode) return null;
        return {
          op: "update_node_config" as const,
          nodeId: targetNode.id,
          config: Object.fromEntries(Object.entries(update.changes).map(([key, value]) => [key, String(value)])),
        };
      })
      .filter((operation): operation is NonNullable<typeof operation> => !!operation);
    if (!operations.length) return undefined;
    return {
      mode: "patch",
      summary: `Update ${operations.length} node configuration${operations.length === 1 ? "" : "s"}.`,
      targetPipelineId: activePipeline.id,
      patch: { operations },
    };
  }

  if (intent.kind === "add_node") {
    const normalizedConfig = intent.node.config
      ? Object.fromEntries(
          Object.entries(intent.node.config).filter(([, value]) =>
            typeof value === "string" || typeof value === "number" || typeof value === "boolean"
          )
        )
      : undefined;
    return {
      mode: "patch",
      summary: `Add ${intent.node.token} to the current pipeline.`,
      targetPipelineId: activePipeline.id,
      patch: {
        operations: [
          {
            op: "add_node",
            node: {
              token: intent.node.token as AutomationLibraryItem["token"],
              ...(intent.node.id ? { id: intent.node.id } : {}),
              ...(intent.node.label ? { label: intent.node.label } : {}),
              ...(typeof intent.node.x === "number" ? { x: intent.node.x } : {}),
              ...(typeof intent.node.y === "number" ? { y: intent.node.y } : {}),
              ...(normalizedConfig ? { config: normalizedConfig } : {}),
            },
          },
        ],
      },
    };
  }

  if (intent.kind === "remove_node") {
    const targetNode = resolveIntentTargetNode(activePipeline, intent.target, {});
    if (!targetNode) return undefined;
    return {
      mode: "patch",
      summary: `Remove ${targetNode.id} from the current pipeline.`,
      targetPipelineId: activePipeline.id,
      patch: {
        operations: [
          {
            op: "remove_node",
            nodeId: targetNode.id,
          },
        ],
      },
    };
  }

  if (intent.kind === "add_connection") {
    const fromNode = resolveGenericNodeTarget(activePipeline, intent.from);
    const toNode = resolveGenericNodeTarget(activePipeline, intent.to);
    if (!fromNode || !toNode) return undefined;
    return {
      mode: "patch",
      summary: `Connect ${fromNode.id} to ${toNode.id}.`,
      targetPipelineId: activePipeline.id,
      patch: {
        operations: [
          {
            op: "add_connection",
            connection: {
              fromNodeId: fromNode.id,
              toNodeId: toNode.id,
              mode: intent.mode ?? "trigger",
            },
          },
        ],
      },
    };
  }

  if (intent.kind === "remove_connection") {
    const script = parseActivePipelineScript(activePipeline);
    if (!script) return undefined;
    const connection = resolveIntentConnection(script, intent.target);
    if (!connection) return undefined;
    return {
      mode: "patch",
      summary: `Remove the route from ${connection.fromNodeId} to ${connection.toNodeId}.`,
      targetPipelineId: activePipeline.id,
      patch: {
        operations: [
          {
            op: "remove_connection",
            connectionId: connection.id,
          },
        ],
      },
    };
  }

  return undefined;
}

function resolveAssistantToolProposal(
  intent: AppAssistantIntent | undefined,
  context: AppAssistantContext
): AppAssistantToolProposal | undefined {
  if (!intent) return undefined;
  if (intent.kind === "set_pipeline_meta" && context.automation.activePipeline) {
    const changedKeys = Object.entries(intent.changes).filter(([, value]) => value !== undefined);
    if (changedKeys.length === 1) {
      const [key, value] = changedKeys[0];
      if (key === "description" && typeof value === "string") {
        return {
          summary: `Update the active pipeline description to: "${value}"`,
          toolCall: {
            name: "assistant.proposePipelineCommand",
            arguments: { command: { kind: "activePipeline.setDescription", description: value } },
          },
        };
      }
      if (key === "name" && typeof value === "string") {
        return {
          summary: `Rename the active pipeline to "${value}".`,
          toolCall: {
            name: "assistant.proposePipelineCommand",
            arguments: { command: { kind: "activePipeline.rename", name: value } },
          },
        };
      }
      if (key === "active" && typeof value === "boolean") {
        return {
          summary: `${value ? "Enable" : "Disable"} the active pipeline.`,
          toolCall: {
            name: "assistant.proposePipelineCommand",
            arguments: { command: { kind: "activePipeline.setEnabled", active: value } },
          },
        };
      }
      if (key === "autoRun" && typeof value === "boolean") {
        return {
          summary: `${value ? "Enable" : "Disable"} autorun for the active pipeline.`,
          toolCall: {
            name: "assistant.proposePipelineCommand",
            arguments: { command: { kind: "activePipeline.setAutoRun", autoRun: value } },
          },
        };
      }
    }
  }
  if (intent.kind === "update_node_config" && context.automation.activePipeline) {
    const changedKeys = Object.entries(intent.changes).filter(([, value]) => value !== undefined);
    if (changedKeys.length === 1) {
      const [key, value] = changedKeys[0];
      if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
        return {
          summary: `Update ${intent.target.nodeId ?? intent.target.nodeToken ?? intent.target.nodeLabel ?? "the target node"} so ${key} becomes ${JSON.stringify(value)}.`,
          toolCall: {
            name: "assistant.proposePipelineCommand",
            arguments: {
              command: {
                kind: "activePipeline.updateNodeConfig",
                ...(intent.target.nodeId ? { nodeId: intent.target.nodeId } : {}),
                ...(intent.target.nodeToken ? { nodeToken: intent.target.nodeToken } : {}),
                key,
                value,
              },
            },
          },
        };
      }
    }
  }
  if (intent.kind === "set_layer_visibility" && intent.target?.scope === "selected" && context.view.selectedNodeId) {
    return {
      summary: `${intent.visible ? "Show" : "Hide"} the selected layer.`,
      toolCall: {
        name: "assistant.proposeStateCommand",
        arguments: { command: { kind: "selectedLayer.setVisibility", visible: intent.visible } },
      },
    };
  }
  return undefined;
}

function resolveIntentTargetNode(
  activePipeline: AppAssistantContext["automation"]["activePipeline"],
  target: {
    pipeline?: "active";
    nodeId?: string;
    nodeToken?: string;
    nodeLabel?: string;
  },
  changes: Record<string, string | number | boolean>
) {
  const script = parseActivePipelineScript(activePipeline);
  if (!script) return null;
  if (target.nodeId) {
    const byId = script.nodes.find((node) => node.id === target.nodeId);
    if (byId) return byId;
  }
  if (target.nodeToken) {
    const byToken = script.nodes.find((node) => node.token === target.nodeToken);
    if (byToken) return byToken;
  }
  if (target.nodeLabel) {
    const label = target.nodeLabel.trim().toLowerCase();
    const byLabel = script.nodes.find((node) => (node.label ?? "").trim().toLowerCase() === label);
    if (byLabel) return byLabel;
  }
  const changeKeys = new Set(Object.keys(changes));
  if (changeKeys.size) {
    const byConfigKey = script.nodes.find((node) =>
      Array.from(changeKeys).every((key) => key in (node.config ?? {}))
    );
    if (byConfigKey) return byConfigKey;
  }
  return null;
}

function resolveGenericNodeTarget(
  activePipeline: AppAssistantContext["automation"]["activePipeline"],
  target: { nodeId?: string; nodeToken?: string; nodeLabel?: string }
) {
  const script = parseActivePipelineScript(activePipeline);
  if (!script) return null;
  if (target.nodeId) {
    const byId = script.nodes.find((node) => node.id === target.nodeId);
    if (byId) return byId;
  }
  if (target.nodeToken) {
    const byToken = script.nodes.find((node) => node.token === target.nodeToken);
    if (byToken) return byToken;
  }
  if (target.nodeLabel) {
    const label = target.nodeLabel.trim().toLowerCase();
    const byLabel = script.nodes.find((node) => (node.label ?? "").trim().toLowerCase() === label);
    if (byLabel) return byLabel;
  }
  return null;
}

function resolveIntentConnection(
  script: NonNullable<ReturnType<typeof parseActivePipelineScript>>,
  target: {
    connectionId?: string;
    fromNodeId?: string;
    fromNodeToken?: string;
    toNodeId?: string;
    toNodeToken?: string;
    mode?: "trigger" | "data";
  }
) {
  if (target.connectionId) {
    const byId = script.connections.find((connection) => connection.id === target.connectionId);
    if (byId) return byId;
  }
  const fromNodeId =
    target.fromNodeId ??
    (target.fromNodeToken ? script.nodes.find((node) => node.token === target.fromNodeToken)?.id : undefined);
  const toNodeId =
    target.toNodeId ??
    (target.toNodeToken ? script.nodes.find((node) => node.token === target.toNodeToken)?.id : undefined);
  return (
    script.connections.find(
      (connection) =>
        (!fromNodeId || connection.fromNodeId === fromNodeId) &&
        (!toNodeId || connection.toNodeId === toNodeId) &&
        (!target.mode || connection.mode === target.mode)
    ) ?? null
  );
}

function parseActivePipelineScript(activePipeline: AppAssistantContext["automation"]["activePipeline"] | null) {
  if (!activePipeline?.script) return null;
  try {
    return JSON.parse(activePipeline.script) as {
      nodes: Array<{ id: string; token?: string; label?: string; config?: Record<string, unknown> }>;
      connections: Array<{ id: string; fromNodeId?: string; toNodeId?: string; mode?: "trigger" | "data" }>;
    };
  } catch {
    return null;
  }
}

function normalizeAssistantQuestion(value: string) {
  return value.toLowerCase().replace(/[^\w\s]/g, " ").replace(/\s+/g, " ").trim();
}


function isPipelineFocusedQuestion(userMessage: string) {
  const lower = normalizeAssistantQuestion(userMessage);
  return /\b(pipeline|automation|node|nodes|tool|tools|event|action|condition|source|compute|graph|route)\b/.test(lower);
}

function isViewerStateFocusedQuestion(userMessage: string) {
  const lower = normalizeAssistantQuestion(userMessage);
  return /\b(layer|layers|group|annotation|annotations|window|windows|camera|slice|viewer|state|selection|selected|opacity|visible|invisible)\b/.test(lower);
}
