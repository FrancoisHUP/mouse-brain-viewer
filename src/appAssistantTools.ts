export type ViewerStateCommand =
  | {
      kind: "selectedLayer.setVisibility";
      visible: boolean;
    }
  | {
      kind: "selectedLayer.setOpacity";
      opacity: number;
    }
  | {
      kind: "selectedLayer.translate";
      dx?: number;
      dy?: number;
      dz?: number;
    }
  | {
      kind: "selectedLayer.rename";
      name: string;
    }
  | {
      kind: "selection.group";
      name?: string;
    };

export type PipelineCommand =
  | {
      kind: "activePipeline.setDescription";
      description: string;
    }
  | {
      kind: "activePipeline.rename";
      name: string;
    }
  | {
      kind: "activePipeline.setEnabled";
      active: boolean;
    }
  | {
      kind: "activePipeline.setAutoRun";
      autoRun: boolean;
    }
  | {
      kind: "activePipeline.updateNodeConfig";
      nodeId?: string;
      nodeToken?: string;
      key: string;
      value: string | number | boolean;
    };

export type AppAssistantToolCall =
  | {
      name: "assistant.proposeStateCommand";
      arguments: { command: ViewerStateCommand };
    }
  | {
      name: "assistant.proposePipelineCommand";
      arguments: { command: PipelineCommand };
    };

export type AppAssistantToolDefinition = {
  name: AppAssistantToolCall["name"];
  description: string;
  argumentsShape: string;
};

export type AppAssistantReadToolDefinition = {
  name:
    | "viewer.getSelectionSummary"
    | "viewer.getSelectedLayerDetails"
    | "pipeline.getActivePipelineSummary"
    | "viewer.getSavedViewerSummary";
  description: string;
};

export type AppAssistantToolAvailability = {
  name: AppAssistantToolCall["name"];
  available: boolean;
  reason?: string;
};

export type AssistantToolAvailabilityInput = {
  selectedNodeId: string | null;
  selectedNodeKind: string | null;
  selectedNodeCount: number;
  activePipelineId: string | null;
};

export const APP_ASSISTANT_TOOLS: AppAssistantToolDefinition[] = [
  {
    name: "assistant.proposeStateCommand",
    description:
      "Propose a semantic viewer state command. Supported commands are selectedLayer.setVisibility, selectedLayer.setOpacity, selectedLayer.translate, selectedLayer.rename, and selection.group.",
    argumentsShape:
      '{ "command": { "kind": "selectedLayer.setVisibility" | "selectedLayer.setOpacity" | "selectedLayer.translate" | "selectedLayer.rename" | "selection.group", ... } }',
  },
  {
    name: "assistant.proposePipelineCommand",
    description:
      "Propose a semantic pipeline command. Supported commands are activePipeline.setDescription, activePipeline.rename, activePipeline.setEnabled, activePipeline.setAutoRun, and activePipeline.updateNodeConfig.",
    argumentsShape:
      '{ "command": { "kind": "activePipeline.setDescription" | "activePipeline.rename" | "activePipeline.setEnabled" | "activePipeline.setAutoRun" | "activePipeline.updateNodeConfig", ... } }',
  },
];

export const APP_ASSISTANT_READ_TOOLS: AppAssistantReadToolDefinition[] = [
  {
    name: "viewer.getSelectionSummary",
    description: "Read the current selection, including the number of selected nodes and their ids.",
  },
  {
    name: "viewer.getSelectedLayerDetails",
    description: "Read the currently selected layer details such as visibility, opacity, transform, and type.",
  },
  {
    name: "pipeline.getActivePipelineSummary",
    description: "Read the currently open pipeline summary, including description, node count, and routes.",
  },
  {
    name: "viewer.getSavedViewerSummary",
    description: "Read the saved viewer library summary and current active saved viewer.",
  },
];

export function normalizeAssistantToolCall(value: unknown): AppAssistantToolCall | undefined {
  if (!value || typeof value !== "object") return undefined;
  const candidate = value as {
    name?: unknown;
    arguments?: unknown;
    args?: unknown;
    toolName?: unknown;
    method?: unknown;
    params?: unknown;
  };

  if (typeof candidate.name !== "string") {
    const nestedName = APP_ASSISTANT_TOOLS.find((tool) =>
      Object.prototype.hasOwnProperty.call(value, tool.name)
    )?.name;
    if (nestedName) {
      const nestedArgs = (value as Record<string, unknown>)[nestedName];
      return normalizeAssistantToolCall({
        name: nestedName,
        arguments: nestedArgs && typeof nestedArgs === "object" ? nestedArgs : {},
      });
    }
    const namespaceCandidate = value as Record<string, unknown>;
    const methods = namespaceCandidate.assistant;
    if (methods && typeof methods === "object") {
      for (const [methodName, methodArgs] of Object.entries(methods as Record<string, unknown>)) {
        const fullName = normalizeLegacyToolName("assistant", methodName);
        if (!fullName) continue;
        return normalizeAssistantToolCall({
          name: fullName,
          arguments: methodArgs && typeof methodArgs === "object" ? methodArgs : {},
        });
      }
    }
  }

  const legacyName =
    typeof candidate.toolName === "string" && typeof candidate.method === "string"
      ? normalizeLegacyToolName(candidate.toolName, candidate.method)
      : undefined;
  const normalizedName = typeof candidate.name === "string" ? candidate.name : legacyName;
  const args = (candidate.arguments && typeof candidate.arguments === "object"
    ? candidate.arguments
    : candidate.args && typeof candidate.args === "object"
    ? candidate.args
    : candidate.params && typeof candidate.params === "object"
    ? candidate.params
    : {}) as Record<string, unknown>;

  if (normalizedName === "assistant.proposeStateCommand") {
    const command = normalizeViewerStateCommand(args.command);
    if (command) {
      return {
        name: "assistant.proposeStateCommand",
        arguments: { command },
      };
    }
  }

  if (normalizedName === "assistant.proposePipelineCommand") {
    const command = normalizePipelineCommand(args.command);
    if (command) {
      return {
        name: "assistant.proposePipelineCommand",
        arguments: { command },
      };
    }
  }

  return undefined;
}

export function summarizeAssistantToolCall(toolCall: AppAssistantToolCall) {
  if (toolCall.name === "assistant.proposeStateCommand") {
    return summarizeViewerStateCommand(toolCall.arguments.command);
  }
  return summarizePipelineCommand(toolCall.arguments.command);
}

export function getAssistantToolAvailability(input: AssistantToolAvailabilityInput): AppAssistantToolAvailability[] {
  return APP_ASSISTANT_TOOLS.map((tool) => {
    if (tool.name === "assistant.proposeStateCommand") {
      const available = input.selectedNodeCount > 0;
      return {
        name: tool.name,
        available,
        ...(available ? {} : { reason: "Select one or more layers first." }),
      };
    }
    const available = !!input.activePipelineId;
    return {
      name: tool.name,
      available,
      ...(available ? {} : { reason: "Open a pipeline first." }),
    };
  });
}

export function getViewerStateCommandAvailability(
  command: ViewerStateCommand,
  input: AssistantToolAvailabilityInput
) {
  if (command.kind === "selection.group") {
    return input.selectedNodeCount >= 2
      ? { available: true as const }
      : { available: false as const, reason: "Select at least two layers first." };
  }
  const hasSelectedLayer = !!input.selectedNodeId && input.selectedNodeKind === "layer";
  return hasSelectedLayer
    ? { available: true as const }
    : { available: false as const, reason: "Select a layer first." };
}

export function getPipelineCommandAvailability(
  command: PipelineCommand,
  input: AssistantToolAvailabilityInput,
  activePipelineScript: string | null | undefined
) {
  if (!input.activePipelineId) {
    return { available: false as const, reason: "Open a pipeline first." };
  }
  if (command.kind !== "activePipeline.updateNodeConfig") {
    return { available: true as const };
  }
  if (!activePipelineScript) {
    return { available: false as const, reason: "The active pipeline could not be parsed." };
  }
  try {
    const parsed = JSON.parse(activePipelineScript) as {
      nodes?: Array<{ id?: string; token?: string }>;
    };
    const found = (parsed.nodes ?? []).some(
      (item) =>
        (command.nodeId && item.id === command.nodeId) ||
        (command.nodeToken && item.token === command.nodeToken)
    );
    return found
      ? { available: true as const }
      : { available: false as const, reason: "The requested pipeline node could not be found." };
  } catch {
    return { available: false as const, reason: "The active pipeline could not be parsed." };
  }
}

type ToolPreviewContext = {
  selectedNodeName: string | null;
  selectedNodeVisible: boolean | null;
  selectedNodeOpacity?: number | null;
  selectedNodeTranslation?: [number, number, number] | null;
  selectedNodeCount: number;
  activePipelineName?: string | null;
  activePipelineEnabled?: boolean | null;
  activePipelineAutoRun?: boolean | null;
  activePipelineDescription?: string | null;
  activePipelineNodeConfigValue?: unknown;
};

export function getActivePipelineNodeConfigPreviewValue(
  activePipelineScript: string | null | undefined,
  toolCall: Extract<AppAssistantToolCall, { name: "assistant.proposePipelineCommand" }>
) {
  const command = toolCall.arguments.command;
  if (!activePipelineScript || command.kind !== "activePipeline.updateNodeConfig") return undefined;
  try {
    const parsed = JSON.parse(activePipelineScript) as {
      nodes?: Array<{ id?: string; token?: string; config?: Record<string, unknown> }>;
    };
    const node = (parsed.nodes ?? []).find(
      (item) =>
        (command.nodeId && item.id === command.nodeId) ||
        (command.nodeToken && item.token === command.nodeToken)
    );
    return node?.config?.[command.key];
  } catch {
    return undefined;
  }
}

export function previewAssistantToolCall(
  toolCall: AppAssistantToolCall,
  context: ToolPreviewContext
) {
  if (toolCall.name === "assistant.proposeStateCommand") {
    return previewViewerStateCommand(toolCall.arguments.command, context);
  }
  return previewPipelineCommand(toolCall.arguments.command, context);
}

function formatPreviewValue(value: unknown) {
  if (value === null || value === undefined) return "undefined";
  if (typeof value === "string") return `"${value}"`;
  return JSON.stringify(value);
}

function parseOptionalNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function normalizeLegacyToolName(toolName: string, method: string): AppAssistantToolCall["name"] | undefined {
  if (toolName === "assistant" && method === "proposeStateCommand") return "assistant.proposeStateCommand";
  if (toolName === "assistant" && method === "proposePipelineCommand") return "assistant.proposePipelineCommand";
  const normalized = `${toolName}.${method}`;
  if (normalized === "assistant.proposeStateCommand") return normalized;
  if (normalized === "assistant.proposePipelineCommand") return normalized;
  return undefined;
}

export function normalizeViewerStateCommand(value: unknown): ViewerStateCommand | undefined {
  if (!value || typeof value !== "object") return undefined;
  const candidate = value as Record<string, unknown>;
  if (candidate.kind === "selectedLayer.setVisibility" && typeof candidate.visible === "boolean") {
    return { kind: candidate.kind, visible: candidate.visible };
  }
  if (candidate.kind === "selectedLayer.setOpacity") {
    const opacity = parseOptionalNumber(candidate.opacity);
    if (opacity !== undefined) {
      return { kind: candidate.kind, opacity };
    }
  }
  if (candidate.kind === "selectedLayer.translate") {
    const dx = parseOptionalNumber(candidate.dx);
    const dy = parseOptionalNumber(candidate.dy);
    const dz = parseOptionalNumber(candidate.dz);
    if (dx !== undefined || dy !== undefined || dz !== undefined) {
      return {
        kind: candidate.kind,
        ...(dx !== undefined ? { dx } : {}),
        ...(dy !== undefined ? { dy } : {}),
        ...(dz !== undefined ? { dz } : {}),
      };
    }
  }
  if (candidate.kind === "selectedLayer.rename" && typeof candidate.name === "string" && candidate.name.trim()) {
    return { kind: candidate.kind, name: candidate.name };
  }
  if (candidate.kind === "selection.group") {
    return {
      kind: candidate.kind,
      ...(typeof candidate.name === "string" && candidate.name.trim() ? { name: candidate.name } : {}),
    };
  }
  return undefined;
}

export function normalizePipelineCommand(value: unknown): PipelineCommand | undefined {
  if (!value || typeof value !== "object") return undefined;
  const candidate = value as Record<string, unknown>;
  if (candidate.kind === "activePipeline.setDescription" && typeof candidate.description === "string" && candidate.description.trim()) {
    return { kind: candidate.kind, description: candidate.description };
  }
  if (candidate.kind === "activePipeline.rename" && typeof candidate.name === "string" && candidate.name.trim()) {
    return { kind: candidate.kind, name: candidate.name };
  }
  if (candidate.kind === "activePipeline.setEnabled" && typeof candidate.active === "boolean") {
    return { kind: candidate.kind, active: candidate.active };
  }
  if (candidate.kind === "activePipeline.setAutoRun" && typeof candidate.autoRun === "boolean") {
    return { kind: candidate.kind, autoRun: candidate.autoRun };
  }
  if (
    candidate.kind === "activePipeline.updateNodeConfig" &&
    typeof candidate.key === "string" &&
    candidate.key.trim() &&
    (typeof candidate.value === "string" || typeof candidate.value === "number" || typeof candidate.value === "boolean")
  ) {
    return {
      kind: candidate.kind,
      ...(typeof candidate.nodeId === "string" ? { nodeId: candidate.nodeId } : {}),
      ...(typeof candidate.nodeToken === "string" ? { nodeToken: candidate.nodeToken } : {}),
      key: candidate.key,
      value: candidate.value,
    };
  }
  return undefined;
}

function summarizeViewerStateCommand(command: ViewerStateCommand) {
  if (command.kind === "selectedLayer.setVisibility") {
    return `${command.visible ? "Show" : "Hide"} the selected layer.`;
  }
  if (command.kind === "selectedLayer.setOpacity") {
    return `Set the selected layer opacity to ${Math.round(command.opacity * 100)}%.`;
  }
  if (command.kind === "selectedLayer.translate") {
    const parts = [
      command.dx !== undefined ? `x ${command.dx}` : null,
      command.dy !== undefined ? `y ${command.dy}` : null,
      command.dz !== undefined ? `z ${command.dz}` : null,
    ].filter(Boolean);
    return `Move the selected layer by ${parts.join(", ")}.`;
  }
  if (command.kind === "selectedLayer.rename") {
    return `Rename the selected layer to "${command.name}".`;
  }
  return command.name
    ? `Create a group named "${command.name}" from the current selection.`
    : "Create a group from the current selection.";
}

function summarizePipelineCommand(command: PipelineCommand) {
  if (command.kind === "activePipeline.setDescription") {
    return `Update the active pipeline description to: "${command.description}"`;
  }
  if (command.kind === "activePipeline.rename") {
    return `Rename the active pipeline to "${command.name}".`;
  }
  if (command.kind === "activePipeline.setEnabled") {
    return `${command.active ? "Enable" : "Disable"} the active pipeline.`;
  }
  if (command.kind === "activePipeline.setAutoRun") {
    return `${command.autoRun ? "Enable" : "Disable"} autorun for the active pipeline.`;
  }
  return `Update ${command.nodeId ?? command.nodeToken ?? "a pipeline node"} so ${command.key} becomes ${JSON.stringify(command.value)}.`;
}

function previewViewerStateCommand(command: ViewerStateCommand, context: ToolPreviewContext) {
  if (command.kind === "selectedLayer.setVisibility") {
    return [
      `${context.selectedNodeName ?? "Selected layer"}.visible: ${formatPreviewValue(context.selectedNodeVisible)} -> ${formatPreviewValue(command.visible)}`,
    ];
  }
  if (command.kind === "selectedLayer.setOpacity") {
    return [
      `${context.selectedNodeName ?? "Selected layer"}.opacity: ${formatPreviewValue(context.selectedNodeOpacity)} -> ${formatPreviewValue(command.opacity)}`,
    ];
  }
  if (command.kind === "selectedLayer.translate") {
    const current = context.selectedNodeTranslation ?? [0, 0, 0];
    const next: [number, number, number] = [
      current[0] + (command.dx ?? 0),
      current[1] + (command.dy ?? 0),
      current[2] + (command.dz ?? 0),
    ];
    return [
      `${context.selectedNodeName ?? "Selected layer"}.translation: ${formatPreviewValue(current)} -> ${formatPreviewValue(next)}`,
    ];
  }
  if (command.kind === "selectedLayer.rename") {
    return [
      `${context.selectedNodeName ?? "Selected layer"}.name: ${formatPreviewValue(context.selectedNodeName)} -> ${formatPreviewValue(command.name)}`,
    ];
  }
  return [
    `selection.count: ${context.selectedNodeCount} -> 1 group`,
    `group.name: ${command.name ? `"${command.name}"` : `"New Group"`}`,
  ];
}

function previewPipelineCommand(command: PipelineCommand, context: ToolPreviewContext) {
  if (command.kind === "activePipeline.setDescription") {
    return [
      `pipeline.description: ${formatPreviewValue(context.activePipelineDescription)} -> ${formatPreviewValue(command.description)}`,
    ];
  }
  if (command.kind === "activePipeline.rename") {
    return [
      `pipeline.name: ${formatPreviewValue(context.activePipelineName)} -> ${formatPreviewValue(command.name)}`,
    ];
  }
  if (command.kind === "activePipeline.setEnabled") {
    return [
      `pipeline.active: ${formatPreviewValue(context.activePipelineEnabled)} -> ${formatPreviewValue(command.active)}`,
    ];
  }
  if (command.kind === "activePipeline.setAutoRun") {
    return [
      `pipeline.autoRun: ${formatPreviewValue(context.activePipelineAutoRun)} -> ${formatPreviewValue(command.autoRun)}`,
    ];
  }
  return [
    `${command.nodeId ?? command.nodeToken ?? "pipeline node"}.${command.key}: ${formatPreviewValue(context.activePipelineNodeConfigValue)} -> ${formatPreviewValue(command.value)}`,
  ];
}
