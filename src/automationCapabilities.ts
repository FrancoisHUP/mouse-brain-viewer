import {
  AUTOMATION_LIBRARY,
  createEmptyAutomationPipeline,
  serializeAutomationPipelineScript,
  type AutomationConnection,
  type AutomationLibraryItem,
  type AutomationNode,
  type AutomationNodeConfig,
  type AutomationPipeline,
} from "./automationTypes";

export type AutomationCapability = AutomationLibraryItem & {
  safety: "safe" | "review" | "advanced";
  configSchema: Record<string, string>;
  examples: string[];
};

export type AutomationAssistantDraft = {
  name: string;
  description?: string;
  active?: boolean;
  autoRun?: boolean;
  nodes: AutomationNode[];
  connections: AutomationConnection[];
};

export type AutomationValidationIssue = {
  level: "error" | "warning";
  message: string;
};

export type AutomationValidationResult = {
  valid: boolean;
  issues: AutomationValidationIssue[];
};

export type AutomationAssistantMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  plainText?: string;
  codeText?: string;
};

export type AutomationAssistantModel = {
  generateResponse: (request: {
    userMessage: string;
    currentPipeline?: AutomationPipeline;
    capabilities: AutomationCapability[];
    onToken?: (text: string) => void;
  }) => Promise<AutomationAssistantResponse>;
};

export type AutomationAssistantResponse = {
  message: string;
  draft?: AutomationAssistantDraft;
  rawText?: string;
};

export type AutomationAssistantPatchOperation =
  | {
      op: "set_pipeline_meta";
      name?: string;
      description?: string;
      active?: boolean;
      autoRun?: boolean;
    }
  | {
      op: "add_node";
      node: Partial<AutomationNode> & { token: AutomationLibraryItem["token"] | string; id?: string };
    }
  | {
      op: "remove_node";
      nodeId: string;
    }
  | {
      op: "update_node_config";
      nodeId: string;
      config: AutomationNodeConfig;
    }
  | {
      op: "add_connection";
      connection: Partial<AutomationConnection> & {
        fromNodeId: string;
        toNodeId: string;
      };
    }
  | {
      op: "remove_connection";
      connectionId: string;
    };

export type AutomationAssistantPatch = {
  operations: AutomationAssistantPatchOperation[];
};

export type AutomationAssistantPipelineProposal =
  | {
      mode: "draft";
      summary: string;
      targetPipelineId?: string | null;
      draft: AutomationAssistantDraft;
    }
  | {
      mode: "patch";
      summary: string;
      targetPipelineId?: string | null;
      patch: AutomationAssistantPatch;
    };

export const AUTOMATION_PIPELINE_JSON_SCHEMA = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  title: "Mouse Brain Viewer automation pipeline draft",
  type: "object",
  required: ["name", "nodes", "connections"],
  additionalProperties: false,
  properties: {
    name: { type: "string", minLength: 1 },
    description: { type: "string" },
    active: { type: "boolean" },
    autoRun: { type: "boolean" },
    nodes: {
      type: "array",
      items: {
        type: "object",
        required: ["id", "kind", "label", "token", "x", "y"],
        additionalProperties: true,
        properties: {
          id: { type: "string", minLength: 1 },
          kind: { enum: ["event", "source", "condition", "compute", "external", "action"] },
          label: { type: "string" },
          token: { type: "string" },
          x: { type: "number" },
          y: { type: "number" },
          config: { type: "object" },
        },
      },
    },
    connections: {
      type: "array",
      items: {
        type: "object",
        required: ["id", "fromNodeId", "toNodeId", "mode"],
        additionalProperties: true,
        properties: {
          id: { type: "string", minLength: 1 },
          fromNodeId: { type: "string", minLength: 1 },
          toNodeId: { type: "string", minLength: 1 },
          fromPortId: { type: "string" },
          toPortId: { type: "string" },
          mode: { enum: ["trigger", "data"] },
        },
      },
    },
  },
} as const;

export const AUTOMATION_ASSISTANT_SYSTEM_PROMPT = `You are an automation pipeline author for Mouse Brain Viewer.
Return only a valid automation pipeline JSON draft.
Use only capabilities from the provided capability list.
Every node token must exist in the capability list.
Every connection must reference existing node ids and valid ports.
Prefer simple deterministic graphs.
Use browser code only inside compute.browserFunction nodes.
Never claim that an unsupported viewer action exists. Ask for a new capability instead.`;

export const AUTOMATION_CAPABILITIES: AutomationCapability[] = AUTOMATION_LIBRARY.map((item) => ({
  ...item,
  safety:
    item.kind === "action" && (item.token === "state.patch" || item.token === "viewer.addLayer")
      ? "advanced"
      : item.kind === "external" || item.kind === "compute"
      ? "review"
      : "safe",
  configSchema: getCapabilityConfigSchema(item),
  examples: getCapabilityExamples(item),
}));

export function getAutomationAssistantContext() {
  return {
    systemPrompt: AUTOMATION_ASSISTANT_SYSTEM_PROMPT,
    jsonSchema: AUTOMATION_PIPELINE_JSON_SCHEMA,
    capabilities: AUTOMATION_CAPABILITIES,
  };
}

export function validateAutomationPipelineDraft(draft: AutomationAssistantDraft): AutomationValidationResult {
  const issues: AutomationValidationIssue[] = [];
  const nodeIds = new Set<string>();
  const connectionIds = new Set<string>();

  if (!draft.name?.trim()) {
    issues.push({ level: "error", message: "Pipeline name is required." });
  }

  if (!Array.isArray(draft.nodes) || draft.nodes.length === 0) {
    issues.push({ level: "error", message: "Pipeline needs at least one node." });
  }

  draft.nodes.forEach((node) => {
    if (!node.id?.trim()) {
      issues.push({ level: "error", message: "Every node needs an id." });
      return;
    }
    if (nodeIds.has(node.id)) {
      issues.push({ level: "error", message: `Duplicate node id: ${node.id}.` });
    }
    nodeIds.add(node.id);

    const capability = AUTOMATION_CAPABILITIES.find((item) => item.token === node.token);
    if (!capability) {
      issues.push({ level: "error", message: `Unknown node token: ${node.token}.` });
      return;
    }
    if (capability.kind !== node.kind) {
      issues.push({ level: "error", message: `${node.id} uses kind ${node.kind}, but ${node.token} is a ${capability.kind}.` });
    }
    if (capability.safety === "advanced") {
      issues.push({ level: "warning", message: `${capability.label} can change viewer state and should be reviewed before running.` });
    }
    validateNodeConfig(node, capability, issues);
  });

  draft.connections.forEach((connection) => {
    if (!connection.id?.trim()) {
      issues.push({ level: "error", message: "Every connection needs an id." });
      return;
    }
    if (connectionIds.has(connection.id)) {
      issues.push({ level: "error", message: `Duplicate connection id: ${connection.id}.` });
    }
    connectionIds.add(connection.id);

    const from = draft.nodes.find((node) => node.id === connection.fromNodeId);
    const to = draft.nodes.find((node) => node.id === connection.toNodeId);
    if (!from) issues.push({ level: "error", message: `Connection ${connection.id} has an unknown source node.` });
    if (!to) issues.push({ level: "error", message: `Connection ${connection.id} has an unknown target node.` });
    if (!from || !to) return;

    const output = connection.fromPortId ? from.outputs.find((port) => port.id === connection.fromPortId) : from.outputs[0];
    const input = connection.toPortId ? to.inputs.find((port) => port.id === connection.toPortId) : to.inputs[0];
    if (!output) issues.push({ level: "error", message: `Connection ${connection.id} uses an invalid source port.` });
    if (!input) issues.push({ level: "error", message: `Connection ${connection.id} uses an invalid target port.` });
    if (output && input && !portsCanConnect(output.dataType, input.dataType)) {
      issues.push({
        level: "error",
        message: `Connection ${connection.id} cannot route ${output.dataType} into ${input.dataType}.`,
      });
    }
  });

  return {
    valid: !issues.some((issue) => issue.level === "error"),
    issues,
  };
}

export function normalizeAutomationAssistantDraft(value: unknown): AutomationAssistantDraft {
  if (!value || typeof value !== "object") {
    throw new Error("Assistant response was not a pipeline object.");
  }
  const candidate = value as Partial<AutomationAssistantDraft>;
  if (!Array.isArray(candidate.nodes)) {
    throw new Error("Assistant response did not include nodes.");
  }

  const nodes = candidate.nodes.map((nodeValue, index) => {
    const node = nodeValue as Partial<AutomationNode>;
    const capability = AUTOMATION_CAPABILITIES.find((item) => item.token === node.token);
    if (!capability) {
      throw new Error(`Assistant used an unknown node token: ${String(node.token)}`);
    }
    return {
      id: typeof node.id === "string" && node.id.trim() ? node.id : `assistant-node-${index + 1}`,
      kind: capability.kind,
      label: typeof node.label === "string" && node.label.trim() ? node.label : capability.label,
      token: capability.token,
      x: typeof node.x === "number" && Number.isFinite(node.x) ? node.x : 140 + index * 290,
      y: typeof node.y === "number" && Number.isFinite(node.y) ? node.y : 170,
      inputs: capability.inputs,
      outputs: capability.outputs,
      config: {
        ...(capability.defaultConfig ?? {}),
        ...(node.config ?? {}),
      },
    };
  });

  const connections: AutomationConnection[] = Array.isArray(candidate.connections)
    ? candidate.connections.map((connectionValue, index) => {
        const connection = connectionValue as Partial<AutomationConnection>;
        const from = nodes.find((node) => node.id === connection.fromNodeId);
        const to = nodes.find((node) => node.id === connection.toNodeId);
        return {
          id:
            typeof connection.id === "string" && connection.id.trim()
              ? connection.id
              : `assistant-connection-${index + 1}`,
          fromNodeId: typeof connection.fromNodeId === "string" ? connection.fromNodeId : "",
          toNodeId: typeof connection.toNodeId === "string" ? connection.toNodeId : "",
          fromPortId:
            typeof connection.fromPortId === "string"
              ? connection.fromPortId
              : from?.outputs.find((port) => port.dataType === "trigger")?.id ?? from?.outputs[0]?.id,
          toPortId:
            typeof connection.toPortId === "string"
              ? connection.toPortId
              : to?.inputs.find((port) => port.dataType === "trigger")?.id ?? to?.inputs[0]?.id,
          mode: connection.mode === "data" ? "data" : "trigger",
        };
      })
    : [];

  return {
    name: typeof candidate.name === "string" && candidate.name.trim() ? candidate.name : "Assistant pipeline",
    description: typeof candidate.description === "string" ? candidate.description : "",
    active: candidate.active ?? true,
    autoRun: candidate.autoRun ?? false,
    nodes,
    connections,
  };
}

export function createPipelineFromAssistantDraft(draft: AutomationAssistantDraft): AutomationPipeline {
  const pipeline = createEmptyAutomationPipeline(draft.name.trim() || "Assistant pipeline");
  const next: AutomationPipeline = {
    ...pipeline,
    name: draft.name.trim() || pipeline.name,
    description: draft.description ?? "",
    active: draft.active ?? true,
    autoRun: draft.autoRun ?? false,
    nodes: draft.nodes,
    connections: draft.connections,
  };
  return {
    ...next,
    script: serializeAutomationPipelineScript(next),
    updatedAt: Date.now(),
  };
}

export function normalizeAutomationAssistantPatch(value: unknown): AutomationAssistantPatch {
  if (!value || typeof value !== "object") {
    throw new Error("Assistant patch was not an object.");
  }
  const candidate = value as { operations?: unknown };
  if (!Array.isArray(candidate.operations) || candidate.operations.length === 0) {
    throw new Error("Assistant patch did not include operations.");
  }
  const operations = candidate.operations.map((operationValue, index) =>
    normalizeAutomationAssistantPatchOperation(operationValue, index)
  );
  return { operations };
}

export function validateAutomationAssistantPatch(
  patch: AutomationAssistantPatch,
  currentPipeline: AutomationPipeline | null
): AutomationValidationResult {
  if (!currentPipeline) {
    return {
      valid: false,
      issues: [{ level: "error", message: "No active pipeline is available for this patch." }],
    };
  }
  try {
    const next = applyAutomationAssistantPatch(currentPipeline, patch);
    return validateAutomationPipelineDraft({
      name: next.name,
      description: next.description,
      active: next.active,
      autoRun: next.autoRun,
      nodes: next.nodes,
      connections: next.connections,
    });
  } catch (error) {
    return {
      valid: false,
      issues: [{ level: "error", message: error instanceof Error ? error.message : "Patch could not be applied." }],
    };
  }
}

export function applyAutomationAssistantPatch(
  currentPipeline: AutomationPipeline,
  patch: AutomationAssistantPatch
): AutomationPipeline {
  const next: AutomationPipeline = {
    ...currentPipeline,
    nodes: [...currentPipeline.nodes],
    connections: [...currentPipeline.connections],
  };

  patch.operations.forEach((operation, index) => {
    if (operation.op === "set_pipeline_meta") {
      next.name = operation.name?.trim() ? operation.name.trim() : next.name;
      next.description = typeof operation.description === "string" ? operation.description : next.description;
      if (typeof operation.active === "boolean") next.active = operation.active;
      if (typeof operation.autoRun === "boolean") next.autoRun = operation.autoRun;
      return;
    }

    if (operation.op === "add_node") {
      const token = String(operation.node.token ?? "");
      const node = createNodeFromCapability(
        token as AutomationLibraryItem["token"],
        typeof operation.node.id === "string" && operation.node.id.trim()
          ? operation.node.id
          : `assistant-node-${Date.now()}-${index + 1}`,
        typeof operation.node.x === "number" && Number.isFinite(operation.node.x)
          ? operation.node.x
          : 160 + next.nodes.length * 220,
        typeof operation.node.y === "number" && Number.isFinite(operation.node.y)
          ? operation.node.y
          : 180,
        operation.node.config
      );
      node.label =
        typeof operation.node.label === "string" && operation.node.label.trim()
          ? operation.node.label
          : node.label;
      next.nodes = [...next.nodes.filter((existing) => existing.id !== node.id), node];
      return;
    }

    if (operation.op === "remove_node") {
      next.nodes = next.nodes.filter((node) => node.id !== operation.nodeId);
      next.connections = next.connections.filter(
        (connection) => connection.fromNodeId !== operation.nodeId && connection.toNodeId !== operation.nodeId
      );
      return;
    }

    if (operation.op === "update_node_config") {
      const target = next.nodes.find((node) => node.id === operation.nodeId);
      if (!target) throw new Error(`Patch references unknown node ${operation.nodeId}.`);
      next.nodes = next.nodes.map((node) =>
        node.id === operation.nodeId
          ? { ...node, config: { ...(node.config ?? {}), ...(operation.config ?? {}) } }
          : node
      );
      return;
    }

    if (operation.op === "remove_connection") {
      next.connections = next.connections.filter((connection) => connection.id !== operation.connectionId);
      return;
    }

    if (operation.op === "add_connection") {
      const from = next.nodes.find((node) => node.id === operation.connection.fromNodeId);
      const to = next.nodes.find((node) => node.id === operation.connection.toNodeId);
      if (!from || !to) {
        throw new Error(`Patch connection ${operation.connection.id ?? index + 1} references a missing node.`);
      }
      const mode = operation.connection.mode === "data" ? "data" : "trigger";
      const fromPortId =
        typeof operation.connection.fromPortId === "string"
          ? operation.connection.fromPortId
          : mode === "trigger"
          ? from.outputs.find((port) => port.dataType === "trigger")?.id ?? from.outputs[0]?.id
          : from.outputs.find((port) => port.dataType !== "trigger")?.id ?? from.outputs[0]?.id;
      const toPortId =
        typeof operation.connection.toPortId === "string"
          ? operation.connection.toPortId
          : mode === "trigger"
          ? to.inputs.find((port) => port.dataType === "trigger")?.id ?? to.inputs[0]?.id
          : to.inputs.find((port) => port.dataType !== "trigger")?.id ?? to.inputs[0]?.id;
      next.connections = [
        ...next.connections.filter(
          (connection) =>
            !(
              connection.fromNodeId === from.id &&
              connection.toNodeId === to.id &&
              connection.fromPortId === fromPortId &&
              connection.toPortId === toPortId
            )
        ),
        {
          id:
            typeof operation.connection.id === "string" && operation.connection.id.trim()
              ? operation.connection.id
              : `assistant-connection-${Date.now()}-${index + 1}`,
          fromNodeId: from.id,
          toNodeId: to.id,
          fromPortId,
          toPortId,
          mode,
        },
      ];
    }
  });

  return {
    ...next,
    script: serializeAutomationPipelineScript(next),
    updatedAt: Date.now(),
  };
}

export const mockAutomationAssistantModel: AutomationAssistantModel = {
  async generateResponse(request) {
    const draft = await generateMockAutomationAssistantDraft(request.userMessage);
    const message = `I drafted "${draft.name}" with ${draft.nodes.length} nodes and ${draft.connections.length} routes.`;
    request.onToken?.(message);
    return { message, draft };
  },
};

export async function generateMockAutomationAssistantDraft(userMessage: string): Promise<AutomationAssistantDraft> {
  const normalized = userMessage.toLowerCase();
  if (normalized.includes("hello") || normalized.includes("compute") || normalized.includes("browser")) {
    return buildHelloWorldDraft();
  }
  if (normalized.includes("metadata") || normalized.includes("annotation") || normalized.includes("selected")) {
    return buildPreviewSelectedAnnotationDraft();
  }
  return buildPreviewSelectedAnnotationDraft();
}

function buildPreviewSelectedAnnotationDraft(): AutomationAssistantDraft {
  const eventNode = createNodeFromCapability("selection.changed", "assistant-selection-event", 140, 170);
  const conditionNode = createNodeFromCapability("selected.isAnnotation", "assistant-is-annotation", 430, 170);
  const actionNode = createNodeFromCapability("metadata.previewSelectedAnnotation", "assistant-preview-metadata", 720, 170);
  return {
    name: "Preview selected annotation",
    description: "When the selected object is an annotation, reuse one metadata preview window for it.",
    active: true,
    autoRun: true,
    nodes: [eventNode, conditionNode, actionNode],
    connections: [
      createTriggerConnection(eventNode, conditionNode, "assistant-selection-to-condition"),
      createTriggerConnection(conditionNode, actionNode, "assistant-condition-to-preview"),
    ],
  };
}

function buildHelloWorldDraft(): AutomationAssistantDraft {
  const eventNode = createNodeFromCapability("selection.changed", "assistant-selection-event", 140, 170);
  const computeNode = createNodeFromCapability("compute.browserFunction", "assistant-hello-world", 430, 170, {
    code: "function run(input) {\n  return {\n    message: \"Hello world from the assistant-built pipeline\",\n    selectedNodeId: input.selection?.selectedNodeId ?? null,\n    incomingData: input.data ?? null\n  };\n}",
    outputName: "helloWorld",
  });
  return {
    name: "Hello world compute",
    description: "Runs a browser function from the pipeline play button.",
    active: true,
    autoRun: false,
    nodes: [eventNode, computeNode],
    connections: [createTriggerConnection(eventNode, computeNode, "assistant-selection-to-compute")],
  };
}

function createNodeFromCapability(
  token: AutomationLibraryItem["token"],
  id: string,
  x: number,
  y: number,
  config?: AutomationNodeConfig
): AutomationNode {
  const capability = AUTOMATION_CAPABILITIES.find((item) => item.token === token);
  if (!capability) throw new Error(`Unknown automation capability: ${token}`);
  return {
    id,
    kind: capability.kind,
    label: capability.label,
    token: capability.token,
    x,
    y,
    inputs: capability.inputs,
    outputs: capability.outputs,
    config: {
      ...(capability.defaultConfig ?? {}),
      ...(config ?? {}),
    },
  };
}

function normalizeAutomationAssistantPatchOperation(
  value: unknown,
  index: number
): AutomationAssistantPatchOperation {
  if (!value || typeof value !== "object") {
    throw new Error(`Patch operation ${index + 1} is not an object.`);
  }
  const candidate = value as Record<string, unknown>;
  const op = String(candidate.op ?? "");
  if (op === "set_pipeline_meta") {
    return {
      op,
      name: typeof candidate.name === "string" ? candidate.name : undefined,
      description: typeof candidate.description === "string" ? candidate.description : undefined,
      active: typeof candidate.active === "boolean" ? candidate.active : undefined,
      autoRun: typeof candidate.autoRun === "boolean" ? candidate.autoRun : undefined,
    };
  }
  if (op === "add_node") {
    if (!candidate.node || typeof candidate.node !== "object") {
      throw new Error(`Patch operation ${index + 1} is missing node data.`);
    }
    return { op, node: candidate.node as Partial<AutomationNode> & { token: string; id?: string } };
  }
  if (op === "remove_node") {
    if (typeof candidate.nodeId !== "string" || !candidate.nodeId.trim()) {
      throw new Error(`Patch operation ${index + 1} is missing nodeId.`);
    }
    return { op, nodeId: candidate.nodeId };
  }
  if (op === "update_node_config") {
    if (typeof candidate.nodeId !== "string" || !candidate.nodeId.trim()) {
      throw new Error(`Patch operation ${index + 1} is missing nodeId.`);
    }
    return {
      op,
      nodeId: candidate.nodeId,
      config: (candidate.config ?? {}) as AutomationNodeConfig,
    };
  }
  if (op === "add_connection") {
    if (!candidate.connection || typeof candidate.connection !== "object") {
      throw new Error(`Patch operation ${index + 1} is missing connection data.`);
    }
    const connection = candidate.connection as Record<string, unknown>;
    if (typeof connection.fromNodeId !== "string" || typeof connection.toNodeId !== "string") {
      throw new Error(`Patch operation ${index + 1} needs fromNodeId and toNodeId.`);
    }
    return {
      op,
      connection: connection as Partial<AutomationConnection> & { fromNodeId: string; toNodeId: string },
    };
  }
  if (op === "remove_connection") {
    if (typeof candidate.connectionId !== "string" || !candidate.connectionId.trim()) {
      throw new Error(`Patch operation ${index + 1} is missing connectionId.`);
    }
    return { op, connectionId: candidate.connectionId };
  }
  throw new Error(`Unsupported patch operation: ${op || `#${index + 1}`}.`);
}

function createTriggerConnection(from: AutomationNode, to: AutomationNode, id: string): AutomationConnection {
  return {
    id,
    fromNodeId: from.id,
    toNodeId: to.id,
    fromPortId: from.outputs.find((port) => port.dataType === "trigger")?.id ?? from.outputs[0]?.id,
    toPortId: to.inputs.find((port) => port.dataType === "trigger")?.id ?? to.inputs[0]?.id,
    mode: "trigger",
  };
}

function validateNodeConfig(
  node: AutomationNode,
  capability: AutomationCapability,
  issues: AutomationValidationIssue[]
) {
  if (node.token === "compute.browserFunction" && !node.config?.code?.trim()) {
    issues.push({ level: "error", message: `${node.label} needs code in config.code.` });
  }
  if (node.token === "external.httpRequest" && !node.config?.url?.trim()) {
    issues.push({ level: "warning", message: `${node.label} needs a URL before it can call an external service.` });
  }
  if (Object.keys(capability.configSchema).length === 0 && node.config && Object.keys(node.config).length > 0) {
    issues.push({ level: "warning", message: `${node.label} has config, but this capability does not currently use config.` });
  }
}

function portsCanConnect(fromType: AutomationNode["outputs"][number]["dataType"], toType: AutomationNode["inputs"][number]["dataType"]) {
  return fromType === toType || fromType === "any" || toType === "any";
}

function getCapabilityConfigSchema(item: AutomationLibraryItem): Record<string, string> {
  if (item.token === "compute.browserFunction") {
    return {
      code: "JavaScript source defining function run(input).",
      outputName: "Optional name for the returned value.",
      breakpoint: "Optional debug pause before this node executes.",
    };
  }
  if (item.token === "external.httpRequest") {
    return {
      url: "HTTP endpoint URL.",
      method: "GET or POST.",
      headers: "JSON object encoded as text.",
      bodyTemplate: "Request body template.",
      breakpoint: "Optional debug pause before this node executes.",
    };
  }
  if (item.token === "source.url") {
    return {
      url: "URL to use as source data.",
      breakpoint: "Optional debug pause before this node executes.",
    };
  }
  return {
    breakpoint: "Optional debug pause before this node executes.",
  };
}

function getCapabilityExamples(item: AutomationLibraryItem) {
  if (item.token === "metadata.previewSelectedAnnotation") {
    return ["When selection changes and selected.isAnnotation passes, preview selected metadata."];
  }
  if (item.token === "compute.browserFunction") {
    return ["Transform incoming data with a function run(input) and pass the result downstream."];
  }
  if (item.token === "external.httpRequest") {
    return ["Send routed data to a local server and use the JSON response in the next node."];
  }
  return [item.description];
}
