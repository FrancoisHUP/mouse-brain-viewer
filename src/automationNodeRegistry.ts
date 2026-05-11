import {
  AUTOMATION_LIBRARY,
  type AutomationLibraryItem,
  type AutomationNode,
  type AutomationNodeConfig,
  type AutomationNodePort,
  type AutomationPipeline,
  type AutomationSelectionContext,
  type AutomationTokenName,
} from "./automationTypes";
import {
  formatBrowserAutomationResult,
  runBrowserAutomationCode,
} from "./browserAutomationRuntime";

export type AutomationPacket = {
  type: "trigger" | "selection" | "layer" | "viewer-state" | "file" | "url" | "json" | "text" | "any";
  value: unknown;
  meta?: Record<string, unknown>;
};

export type AutomationNodeRunOutput = {
  outputs: Record<string, AutomationPacket>;
  value?: unknown;
};

export type AutomationConfigFieldType = "string" | "text" | "code" | "boolean" | "select";

export type AutomationConfigField = {
  key: keyof AutomationNodeConfig;
  label: string;
  type: AutomationConfigFieldType;
  description?: string;
  options?: Array<{ label: string; value: string | boolean }>;
  placeholder?: string;
};

export type AutomationNodeCategory = AutomationLibraryItem["kind"];

export type AutomationNodeRunServices = {
  openSelectedAnnotationMetadata: (mode: "edit" | "preview", options?: { reuseExisting?: boolean }) => void;
  expandInspector: () => void;
  collapseInspector: () => void;
  setLayerVisibility: (layerId: string, visible: boolean) => void;
  selectLayer: (layerId: string) => void;
  setSelectedLayerVisibility: (visible: boolean) => void;
  toggleSelectedLayerVisibility: () => void;
  setSelectedOpacity: (opacity: number) => void;
  soloSelectedLayer: () => void;
  setGroupVisibility: (groupIdOrName: string, visible: boolean) => void;
  resetCamera: () => void;
  setCameraPreset: (preset: "default" | "xy" | "xz" | "yz") => void;
  setCameraPose: (pose: unknown) => void;
  focusSelection: () => void;
  setSlicePlane: (plane: "xy" | "xz" | "yz") => void;
  stepSliceIndex: (delta: number) => void;
  setSliceIndex: (index: number) => void;
  updateSelectedAnnotationMetadata: (mode: "replace" | "append", text: string) => void;
  selectNextAnnotationByMetadata: (mode: "missing" | "present") => void;
  setSelectedAnnotationColor: (color: string) => void;
  getMemory: (key: string) => unknown;
  setMemory: (key: string, value: unknown) => void;
  clearMemory: (key?: string) => void;
  delay: (ms: number) => Promise<void>;
  debounce: (nodeId: string, ms: number) => Promise<boolean>;
  fetchUrl: (url: string) => Promise<unknown>;
  notify: (notice: { tone: "success" | "info" | "error"; title: string; message: string }) => void;
};

export type AutomationNodeRunRequest = {
  node: AutomationNode;
  input: unknown;
  context: AutomationSelectionContext;
  services: AutomationNodeRunServices;
};

export type AutomationNodeDefinition = {
  type: AutomationTokenName;
  category: AutomationNodeCategory;
  label: string;
  description: string;
  inputs: AutomationNodePort[];
  outputs: AutomationNodePort[];
  defaultConfig?: AutomationNodeConfig;
  configFields: AutomationConfigField[];
  run: (request: AutomationNodeRunRequest) => Promise<AutomationNodeRunOutput | unknown> | AutomationNodeRunOutput | unknown;
};

export type AutomationValidationIssue = {
  level: "error" | "warning";
  message: string;
  nodeId?: string;
  connectionId?: string;
};

function libraryItem(token: AutomationTokenName) {
  const item = AUTOMATION_LIBRARY.find((candidate) => candidate.token === token);
  if (!item) throw new Error(`Missing automation library item for ${token}`);
  return item;
}

function defineNode(
  token: AutomationTokenName,
  configFields: AutomationConfigField[],
  run: AutomationNodeDefinition["run"]
): AutomationNodeDefinition {
  const item = libraryItem(token);
  return {
    type: token,
    category: item.kind,
    label: item.label,
    description: item.description,
    inputs: item.inputs,
    outputs: item.outputs,
    defaultConfig: item.defaultConfig,
    configFields,
    run,
  };
}

export const AUTOMATION_NODE_DEFINITIONS: AutomationNodeDefinition[] = [
  defineNode("manual.trigger", [], ({ context, node }) =>
    nodeOutputs(node, { "trigger-out": packet("trigger", { selection: context }, { source: "manual.trigger" }) })
  ),
  defineNode("selection.changed", [], ({ context, node }) =>
    nodeOutputs(node, { "trigger-out": packet("trigger", { selection: context }, { source: "selection.changed" }) })
  ),
  defineNode("annotation.selected", [], ({ context, node }) =>
    context.selectedLayerType === "annotation"
      ? nodeOutputs(node, { "trigger-out": packet("trigger", { selection: context }, { source: "annotation.selected" }) })
      : undefined
  ),
  defineNode("selection.cleared", [], ({ context, node }) =>
    !context.selectedNodeId
      ? nodeOutputs(node, { "trigger-out": packet("trigger", { selection: context }, { source: "selection.cleared" }) })
      : undefined
  ),
  defineNode(
    "keyboard.keyDown",
    [{ key: "key", label: "Key", type: "string", placeholder: "r" }],
    ({ context, node }) => {
      const expectedKey = node.config?.key?.trim().toLowerCase();
      const actualKey = context.keyboardEvent?.key?.trim().toLowerCase() ?? "";
      if (!actualKey || !expectedKey || actualKey !== expectedKey) return undefined;
      return nodeOutputs(node, {
        "trigger-out": packet("trigger", context.keyboardEvent, { source: "keyboard.keyDown" }),
      });
    }
  ),
  defineNode("viewer.stateChanged", [], ({ context, node }) =>
    context.stateChange
      ? nodeOutputs(node, {
          "trigger-out": packet("trigger", context.stateChange, { source: "viewer.stateChanged" }),
        })
      : undefined
  ),
  defineNode("source.selectedLayer", [], ({ context, node }) =>
    nodeOutputs(node, {
      "trigger-out": packet("trigger", context.selectedLayer ?? null),
      "layer-out": packet("layer", context.selectedLayer ?? null),
    })
  ),
  defineNode("source.viewerState", [], ({ context, node }) =>
    nodeOutputs(node, {
      "trigger-out": packet("trigger", context.viewerState ?? null),
      "state-out": packet("viewer-state", context.viewerState ?? null),
    })
  ),
  defineNode("source.importedFile", [], ({ input, node }) =>
    nodeOutputs(node, {
      "trigger-out": packet("trigger", input),
      "file-out": packet("file", input),
    })
  ),
  defineNode(
    "source.url",
    [{ key: "url", label: "URL", type: "string", placeholder: "https://example.com/data.json" }],
    ({ node }) =>
      nodeOutputs(node, {
        "trigger-out": packet("trigger", node.config?.url ?? ""),
        "url-out": packet("url", node.config?.url ?? ""),
      })
  ),
  defineNode("source.annotationMetadata", [], ({ context, node }) => {
    const raw = context.selectedAnnotationMetadata ?? "";
    return nodeOutputs(node, {
      "trigger-out": packet("trigger", raw),
      "metadata-out": packet("json", parseJsonOrText(raw), { raw }),
    });
  }),
  defineNode("source.selectedNodeInfo", [], ({ context, node }) =>
    nodeOutputs(node, {
      "trigger-out": packet("trigger", buildSelectedNodeInfo(context)),
      "info-out": packet("json", buildSelectedNodeInfo(context)),
    })
  ),
  defineNode("source.annotationText", [], ({ context, node }) => {
    const raw = context.selectedAnnotationMetadata ?? "";
    return nodeOutputs(node, {
      "trigger-out": packet("trigger", raw),
      "text-out": packet("text", raw, { source: "annotation.metadata" }),
    });
  }),
  defineNode("source.stateChange", [], ({ context, node }) =>
    nodeOutputs(node, {
      "trigger-out": packet("trigger", context.stateChange ?? null),
      "change-out": packet("json", context.stateChange ?? null),
    })
  ),
  defineNode("source.cameraPose", [], ({ context, node }) =>
    nodeOutputs(node, {
      "trigger-out": packet("trigger", context.viewerState && typeof context.viewerState === "object" ? (context.viewerState as { camera?: unknown }).camera ?? null : null),
      "camera-out": packet("json", context.viewerState && typeof context.viewerState === "object" ? (context.viewerState as { camera?: unknown }).camera ?? null : null),
    })
  ),
  defineNode(
    "memory.get",
    [{ key: "memoryKey", label: "Memory key", type: "string", placeholder: "lastSelection" }],
    ({ node, input, services }) => {
      const key = node.config?.memoryKey?.trim() ?? "";
      const result = key ? services.getMemory(key) : undefined;
      return nodeOutputs(node, {
        "trigger-out": packet("trigger", result ?? input),
        "memory-out": packet("json", result ?? null),
      });
    }
  ),
  defineNode("selected.isAnnotation", [], ({ input, context, node }) =>
    context.selectedLayerType === "annotation" ? nodeOutputs(node, { "trigger-out": packet("trigger", input) }) : undefined
  ),
  defineNode("selected.hasMetadata", [], ({ input, context, node }) =>
    context.selectedAnnotationMetadata?.trim() ? nodeOutputs(node, { "trigger-out": packet("trigger", input) }) : undefined
  ),
  defineNode("selection.exists", [], ({ input, context, node }) =>
    context.selectedNodeId ? nodeOutputs(node, { "trigger-out": packet("trigger", input) }) : undefined
  ),
  defineNode("selection.isVisible", [], ({ input, context, node }) =>
    isSelectedLayerVisible(context) ? nodeOutputs(node, { "trigger-out": packet("trigger", input) }) : undefined
  ),
  defineNode(
    "state.pathChanged",
    [{ key: "statePath", label: "State path", type: "string", placeholder: "scene.selectedNodeId" }],
    ({ input, context, node }) =>
      context.stateChange?.changedPaths?.includes(node.config?.statePath?.trim() ?? "")
        ? nodeOutputs(node, { "trigger-out": packet("trigger", input) })
        : undefined
  ),
  defineNode(
    "condition.expression",
    [
      {
        key: "expression",
        label: "Expression",
        type: "code",
        description: "JavaScript expression. Available variables: input, selection.",
        placeholder: "input.selection?.selectedLayerType === \"annotation\"",
      },
    ],
    ({ node, input, context }) =>
      evaluateAutomationExpression(node.config?.expression ?? "", input, context)
        ? nodeOutputs(node, { "trigger-out": packet("trigger", input) })
        : undefined
  ),
  defineNode(
    "compute.browserFunction",
    [
      { key: "code", label: "Function", type: "code", description: "Define function run(input)." },
      { key: "outputName", label: "Output name", type: "string" },
    ],
    async ({ node, input, context, services }) => {
      const result = await runBrowserAutomationCode(node.config?.code ?? "", {
        selection: context,
        data: input,
      });
      services.notify({
        tone: "success",
        title: node.label,
        message: formatBrowserAutomationResult(result).slice(0, 220),
      });
      return nodeOutputs(node, {
        "trigger-out": packet("trigger", result),
        "data-out": packet("json", result),
      });
    }
  ),
  defineNode(
    "json.pickPath",
    [{ key: "jsonPath", label: "JSON path", type: "string", placeholder: "foo.bar.0.name" }],
    ({ node, input }) => {
      const result = pickJsonPath(input, node.config?.jsonPath ?? "");
      return nodeOutputs(node, {
        "trigger-out": packet("trigger", result),
        "data-out": packet("json", result),
      });
    }
  ),
  defineNode("state.diffSummary", [], ({ input, context, node }) => {
    const stateChange = asStateChangeRecord(input) ?? context.stateChange;
    const result = {
      summary: stateChange?.summary ?? "No state change summary available.",
      details: stateChange?.details ?? [],
      changedPaths: stateChange?.changedPaths ?? [],
    };
    return nodeOutputs(node, {
      "trigger-out": packet("trigger", result),
      "data-out": packet("json", result),
    });
  }),
  defineNode(
    "text.template",
    [
      {
        key: "template",
        label: "Template",
        type: "text",
        placeholder: "Selection: {{selectedNodeId}}",
        description: "Use placeholders like {{selectedNodeId}}, {{stateChange.summary}}, {{keyboardEvent.key}}, and {{input}}.",
      },
    ],
    ({ node, input, context }) => {
      const result = applyTextTemplate(node.config?.template ?? "", input, context);
      return nodeOutputs(node, {
        "trigger-out": packet("trigger", result),
        "data-out": packet("text", result),
      });
    }
  ),
  defineNode(
    "time.delay",
    [{ key: "delayMs", label: "Delay (ms)", type: "string", placeholder: "300" }],
    async ({ node, input, services }) => {
      const ms = Number(node.config?.delayMs);
      await services.delay(Number.isFinite(ms) ? Math.max(0, ms) : 0);
      return nodeOutputs(node, {
        "trigger-out": packet("trigger", input),
        "data-out": packet("json", input),
      });
    }
  ),
  defineNode(
    "time.debounce",
    [{ key: "debounceMs", label: "Debounce (ms)", type: "string", placeholder: "400" }],
    async ({ node, input, services }) => {
      const ms = Number(node.config?.debounceMs);
      const allowed = await services.debounce(node.id, Number.isFinite(ms) ? Math.max(0, ms) : 0);
      if (!allowed) return undefined;
      return nodeOutputs(node, {
        "trigger-out": packet("trigger", input),
        "data-out": packet("json", input),
      });
    }
  ),
  defineNode(
    "branch.ifElse",
    [
      {
        key: "expression",
        label: "Condition",
        type: "code",
        description: "JavaScript expression. Available variables: input, selection.",
        placeholder: "Boolean(input)",
      },
    ],
    ({ node, input, context }) => {
      const pass = evaluateAutomationExpression(node.config?.expression ?? "Boolean(input)", input, context);
      return nodeOutputs(node, {
        [pass ? "true-out" : "false-out"]: packet("trigger", input),
        "data-out": packet("json", input),
      });
    }
  ),
  defineNode(
    "external.httpRequest",
    [
      { key: "url", label: "URL", type: "string" },
      {
        key: "method",
        label: "Method",
        type: "select",
        options: [
          { label: "GET", value: "GET" },
          { label: "POST", value: "POST" },
        ],
      },
      { key: "headers", label: "Headers", type: "text" },
      { key: "bodyTemplate", label: "Body template", type: "text" },
    ],
    ({ node, input, services }) => {
      services.notify({
        tone: "info",
        title: node.label,
        message: "HTTP routing node received data. Request execution will be wired next.",
      });
      return nodeOutputs(node, {
        "trigger-out": packet("trigger", input),
        "response-out": packet("json", input),
      });
    }
  ),
  defineNode(
    "fetch.url",
    [{ key: "url", label: "URL", type: "string", placeholder: "https://example.com/data.json" }],
    async ({ node, input, services }) => {
      const url = typeof input === "string" && input.trim() ? input.trim() : node.config?.url?.trim() ?? "";
      const result = url ? await services.fetchUrl(url) : null;
      return nodeOutputs(node, {
        "trigger-out": packet("trigger", result),
        "response-out": packet("json", result),
      });
    }
  ),
  defineNode("metadata.openSelectedAnnotation", [], ({ input, services }) => {
    services.openSelectedAnnotationMetadata("edit");
    return input;
  }),
  defineNode("metadata.previewSelectedAnnotation", [], ({ input, services }) => {
    services.openSelectedAnnotationMetadata("preview", { reuseExisting: true });
    return input;
  }),
  defineNode("inspector.expand", [], ({ input, services }) => {
    services.expandInspector();
    return input;
  }),
  defineNode("inspector.collapse", [], ({ input, services }) => {
    services.collapseInspector();
    return input;
  }),
  defineNode("viewer.addLayer", [], ({ input }) => input),
  defineNode(
    "viewer.setLayerVisibility",
    [
      { key: "targetLayerId", label: "Layer id", type: "string" },
      { key: "visible", label: "Visible", type: "boolean" },
    ],
    ({ node, input, services }) => {
      const layerId = node.config?.targetLayerId?.trim();
      if (layerId) services.setLayerVisibility(layerId, node.config?.visible !== false);
      return input;
    }
  ),
  defineNode(
    "viewer.selectLayer",
    [{ key: "targetLayerId", label: "Layer id", type: "string", placeholder: "layer-id" }],
    ({ node, input, services }) => {
      const layerId = coerceLayerId(input) ?? node.config?.targetLayerId?.trim();
      if (layerId) services.selectLayer(layerId);
      return input;
    }
  ),
  defineNode(
    "viewer.setSelectedLayerVisibility",
    [{ key: "visible", label: "Visible", type: "boolean" }],
    ({ node, input, services }) => {
      const visible = typeof input === "boolean" ? input : node.config?.visible !== false;
      services.setSelectedLayerVisibility(visible);
      return input;
    }
  ),
  defineNode("viewer.toggleSelectedLayerVisibility", [], ({ input, services }) => {
    services.toggleSelectedLayerVisibility();
    return input;
  }),
  defineNode(
    "viewer.setSelectedOpacity",
    [{ key: "opacity", label: "Opacity", type: "string", placeholder: "0.4", description: "Value from 0 to 1." }],
    ({ node, input, services }) => {
      const value = typeof input === "number" ? input : Number(node.config?.opacity);
      services.setSelectedOpacity(Number.isFinite(value) ? value : 1);
      return input;
    }
  ),
  defineNode("viewer.soloSelectedLayer", [], ({ input, services }) => {
    services.soloSelectedLayer();
    return input;
  }),
  defineNode(
    "layer.showGroup",
    [{ key: "targetGroupId", label: "Group id or name", type: "string", placeholder: "Cortical layers" }],
    ({ node, input, services }) => {
      const group = coerceGroupTarget(input) ?? node.config?.targetGroupId?.trim();
      if (group) services.setGroupVisibility(group, true);
      return input;
    }
  ),
  defineNode(
    "layer.hideGroup",
    [{ key: "targetGroupId", label: "Group id or name", type: "string", placeholder: "Cortical layers" }],
    ({ node, input, services }) => {
      const group = coerceGroupTarget(input) ?? node.config?.targetGroupId?.trim();
      if (group) services.setGroupVisibility(group, false);
      return input;
    }
  ),
  defineNode("camera.reset", [], ({ input, services }) => {
    services.resetCamera();
    return input;
  }),
  defineNode(
    "camera.setPreset",
    [
      {
        key: "cameraPreset",
        label: "Preset",
        type: "select",
        options: [
          { label: "XY", value: "xy" },
          { label: "XZ", value: "xz" },
          { label: "YZ", value: "yz" },
          { label: "Default", value: "default" },
        ],
      },
    ],
    ({ node, input, services }) => {
      services.setCameraPreset(node.config?.cameraPreset ?? "default");
      return input;
    }
  ),
  defineNode(
    "camera.setPose",
    [{ key: "cameraPoseJson", label: "Camera JSON", type: "text", placeholder: "{\"position\":[0,0,5],\"yaw\":-90}" }],
    ({ node, input, services }) => {
      const pose = parseCameraPoseInput(input, node.config?.cameraPoseJson);
      if (!pose) throw new Error("Camera pose JSON is invalid.");
      services.setCameraPose(pose);
      return input;
    }
  ),
  defineNode("camera.focusSelection", [], ({ input, services }) => {
    services.focusSelection();
    return input;
  }),
  defineNode(
    "slice.setPlane",
    [
      {
        key: "plane",
        label: "Plane",
        type: "select",
        options: [
          { label: "XY", value: "xy" },
          { label: "XZ", value: "xz" },
          { label: "YZ", value: "yz" },
        ],
      },
    ],
    ({ node, input, services }) => {
      services.setSlicePlane(node.config?.plane ?? "xy");
      return input;
    }
  ),
  defineNode(
    "slice.stepIndex",
    [{ key: "stepDelta", label: "Step delta", type: "string", placeholder: "1" }],
    ({ node, input, services }) => {
      const raw = typeof input === "number" ? input : Number(node.config?.stepDelta);
      services.stepSliceIndex(Number.isFinite(raw) ? Math.trunc(raw) : 1);
      return input;
    }
  ),
  defineNode(
    "slice.setIndex",
    [{ key: "sliceIndex", label: "Slice index", type: "string", placeholder: "0" }],
    ({ node, input, services }) => {
      const raw = typeof input === "number" ? input : Number(node.config?.sliceIndex);
      if (Number.isFinite(raw)) services.setSliceIndex(Math.max(0, Math.trunc(raw)));
      return input;
    }
  ),
  defineNode(
    "annotation.setSelectedMetadata",
    [{ key: "metadataText", label: "Metadata text", type: "text", placeholder: "Reviewed" }],
    ({ node, input, services }) => {
      const text = typeof input === "string" && input.trim() ? input : node.config?.metadataText ?? "";
      services.updateSelectedAnnotationMetadata("replace", text);
      return input;
    }
  ),
  defineNode(
    "annotation.appendSelectedMetadata",
    [{ key: "metadataText", label: "Metadata text", type: "text", placeholder: "Needs QC" }],
    ({ node, input, services }) => {
      const text = typeof input === "string" && input.trim() ? input : node.config?.metadataText ?? "";
      services.updateSelectedAnnotationMetadata("append", text);
      return input;
    }
  ),
  defineNode(
    "annotation.selectNextByMetadata",
    [
      {
        key: "metadataMode",
        label: "Mode",
        type: "select",
        options: [
          { label: "Missing metadata", value: "missing" },
          { label: "Has metadata", value: "present" },
        ],
      },
    ],
    ({ node, input, services }) => {
      services.selectNextAnnotationByMetadata(node.config?.metadataMode ?? "missing");
      return input;
    }
  ),
  defineNode(
    "annotation.setSelectedColor",
    [{ key: "color", label: "Color", type: "string", placeholder: "#ff6b6b" }],
    ({ node, input, services }) => {
      const color =
        typeof input === "string" && input.trim() ? input.trim() : node.config?.color?.trim() ?? "";
      if (color) services.setSelectedAnnotationColor(color);
      return input;
    }
  ),
  defineNode(
    "memory.set",
    [{ key: "memoryKey", label: "Memory key", type: "string", placeholder: "lastValue" }],
    ({ node, input, services }) => {
      const key = node.config?.memoryKey?.trim() ?? "";
      if (key) services.setMemory(key, input);
      return nodeOutputs(node, {
        "trigger-out": packet("trigger", input),
        "data-out": packet("json", input),
      });
    }
  ),
  defineNode(
    "memory.clear",
    [{ key: "memoryKey", label: "Memory key", type: "string", placeholder: "Leave empty to clear all" }],
    ({ node, input, services }) => {
      const key = node.config?.memoryKey?.trim();
      services.clearMemory(key || undefined);
      return nodeOutputs(node, {
        "trigger-out": packet("trigger", input),
        "data-out": packet("json", input),
      });
    }
  ),
  defineNode(
    "notify.toast",
    [
      { key: "title", label: "Title", type: "string", placeholder: "Automation" },
      { key: "message", label: "Message", type: "text", placeholder: "Done." },
      {
        key: "tone",
        label: "Tone",
        type: "select",
        options: [
          { label: "Info", value: "info" },
          { label: "Success", value: "success" },
          { label: "Error", value: "error" },
        ],
      },
    ],
    ({ node, input, services }) => {
      services.notify({
        tone: node.config?.tone === "success" || node.config?.tone === "error" ? node.config.tone : "info",
        title: node.config?.title?.trim() || node.label,
        message: node.config?.message?.trim() || formatBrowserAutomationResult(input).slice(0, 220) || "Automation ran.",
      });
      return input;
    }
  ),
  defineNode("debug.log", [], ({ node, input, services }) => {
    console.info("[Automation debug]", node.label, input);
    services.notify({ tone: "info", title: node.label, message: formatBrowserAutomationResult(input).slice(0, 220) });
    return input;
  }),
  defineNode("state.patch", [], ({ input }) => input),
];

export const AUTOMATION_NODE_REGISTRY = new Map(
  AUTOMATION_NODE_DEFINITIONS.map((definition) => [definition.type, definition])
);

export function getAutomationNodeDefinition(token: AutomationTokenName) {
  if (token.startsWith("custom.")) {
    return {
      type: token,
      category: "compute",
      label: "Custom tool",
      description: "User-defined pipeline tool.",
      inputs: [],
      outputs: [],
      defaultConfig: {},
      configFields: [
        { key: "code", label: "Code", type: "code", description: "Define function run(input, context)." },
      ],
      run: runCustomAutomationNode,
    } satisfies AutomationNodeDefinition;
  }
  return AUTOMATION_NODE_REGISTRY.get(token) ?? null;
}

function buildSelectedNodeInfo(context: AutomationSelectionContext) {
  const layer = context.selectedLayer;
  const layerRecord = layer && typeof layer === "object" ? (layer as Record<string, unknown>) : null;
  return {
    id: context.selectedNodeId,
    kind: context.selectedNodeKind,
    type: context.selectedLayerType,
    name: typeof layerRecord?.name === "string" ? layerRecord.name : null,
    visible: typeof layerRecord?.visible === "boolean" ? layerRecord.visible : null,
    opacity: typeof layerRecord?.opacity === "number" ? layerRecord.opacity : null,
    isAnnotation: context.selectedLayerType === "annotation",
    hasMetadata: !!context.selectedAnnotationMetadata?.trim(),
    metadataText: context.selectedAnnotationMetadata ?? "",
  };
}

function isSelectedLayerVisible(context: AutomationSelectionContext) {
  return !!(
    context.selectedLayer &&
    typeof context.selectedLayer === "object" &&
    "visible" in context.selectedLayer &&
    (context.selectedLayer as { visible?: unknown }).visible !== false
  );
}

function coerceLayerId(input: unknown) {
  if (typeof input === "string" && input.trim()) return input.trim();
  if (input && typeof input === "object" && "id" in input) {
    const id = (input as { id?: unknown }).id;
    if (typeof id === "string" && id.trim()) return id.trim();
  }
  return null;
}

function coerceGroupTarget(input: unknown) {
  if (typeof input === "string" && input.trim()) return input.trim();
  if (input && typeof input === "object") {
    const record = input as { groupId?: unknown; id?: unknown; name?: unknown };
    if (typeof record.groupId === "string" && record.groupId.trim()) return record.groupId.trim();
    if (typeof record.id === "string" && record.id.trim()) return record.id.trim();
    if (typeof record.name === "string" && record.name.trim()) return record.name.trim();
  }
  return null;
}

function parseCameraPoseInput(input: unknown, fallbackText?: string) {
  if (input && typeof input === "object") return input;
  const text = typeof input === "string" && input.trim() ? input : fallbackText ?? "";
  if (!text.trim()) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function asStateChangeRecord(input: unknown) {
  if (!input || typeof input !== "object") return null;
  const candidate = input as { summary?: unknown; details?: unknown; changedPaths?: unknown };
  return {
    summary: typeof candidate.summary === "string" ? candidate.summary : "State changed.",
    details: Array.isArray(candidate.details) ? candidate.details.filter((item): item is string => typeof item === "string") : [],
    changedPaths: Array.isArray(candidate.changedPaths)
      ? candidate.changedPaths.filter((item): item is string => typeof item === "string")
      : [],
  };
}

function applyTextTemplate(template: string, input: unknown, context: AutomationSelectionContext) {
  const stateChange = context.stateChange;
  const keyboardEvent = context.keyboardEvent;
  const tokens: Record<string, string> = {
    selectedNodeId: context.selectedNodeId ?? "",
    selectedLayerType: context.selectedLayerType ?? "",
    annotationMetadata: context.selectedAnnotationMetadata ?? "",
    "stateChange.summary": stateChange?.summary ?? "",
    "stateChange.changedPaths": (stateChange?.changedPaths ?? []).join(", "),
    "keyboardEvent.key": keyboardEvent?.key ?? "",
    input: typeof input === "string" ? input : formatBrowserAutomationResult(input),
  };
  return template.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_, key: string) => tokens[key] ?? "");
}

export async function runRegisteredAutomationNode(request: AutomationNodeRunRequest) {
  const definition = getAutomationNodeDefinition(request.node.token);
  if (!definition) throw new Error(`No automation runner registered for ${request.node.token}.`);
  return definition.run(request);
}

async function runCustomAutomationNode({ node, input, context, services }: AutomationNodeRunRequest) {
  if (node.kind === "event") {
    return nodeOutputs(node, { "trigger-out": packet("trigger", { selection: context }, { source: node.token }) });
  }
  if (node.kind === "condition") {
    const passes = evaluateAutomationExpression(node.config?.expression ?? node.config?.code ?? "true", input, context);
    return passes ? nodeOutputs(node, { "trigger-out": packet("trigger", input) }) : undefined;
  }
  const code = node.config?.code ?? "";
  const result = code.trim()
    ? await runBrowserAutomationCode(code, { selection: context, data: input })
    : input;
  if (node.kind === "action") {
    services.notify({ tone: "info", title: node.label, message: formatBrowserAutomationResult(result).slice(0, 220) });
    return result;
  }
  return nodeOutputs(node, Object.fromEntries(
    node.outputs.map((port) => [
      port.id,
      packet(port.dataType === "trigger" ? "trigger" : port.dataType === "viewer-state" ? "viewer-state" : port.dataType, result, {
        source: node.token,
      }),
    ])
  ));
}

export function isAutomationNodeRunOutput(value: unknown): value is AutomationNodeRunOutput {
  return !!value && typeof value === "object" && "outputs" in value && typeof (value as AutomationNodeRunOutput).outputs === "object";
}

export function validateAutomationPipelineRuntime(pipeline: AutomationPipeline): AutomationValidationIssue[] {
  const issues: AutomationValidationIssue[] = [];
  const nodeIds = new Set(pipeline.nodes.map((node) => node.id));

  pipeline.nodes.forEach((node) => {
    const definition = getAutomationNodeDefinition(node.token);
    if (!definition) {
      issues.push({ level: "error", nodeId: node.id, message: `No registry definition for ${node.token}.` });
      return;
    }
    definition.configFields.forEach((field) => {
      if (field.type === "boolean") return;
      const value = node.config?.[field.key];
      if (field.key === "code" && typeof value !== "string") {
        issues.push({ level: "warning", nodeId: node.id, message: `${node.label} has no code configured.` });
      }
      if ((field.key === "url" || field.key === "targetLayerId") && typeof value === "string" && !value.trim()) {
        issues.push({ level: "warning", nodeId: node.id, message: `${node.label} is missing ${field.label.toLowerCase()}.` });
      }
    });
  });

  pipeline.connections.forEach((connection) => {
    const from = pipeline.nodes.find((node) => node.id === connection.fromNodeId);
    const to = pipeline.nodes.find((node) => node.id === connection.toNodeId);
    if (!from || !to) {
      issues.push({ level: "error", connectionId: connection.id, message: "Connection references a missing node." });
      return;
    }
    const fromPort = from.outputs.find((port) => port.id === connection.fromPortId) ?? from.outputs[0];
    const toPort = to.inputs.find((port) => port.id === connection.toPortId) ?? to.inputs[0];
    if (!fromPort || !toPort) {
      issues.push({ level: "error", connectionId: connection.id, message: "Connection references a missing port." });
      return;
    }
    if (connection.mode === "trigger" && (fromPort.dataType !== "trigger" || toPort.dataType !== "trigger")) {
      issues.push({ level: "warning", connectionId: connection.id, message: "Trigger connection is attached to non-trigger ports." });
    }
    if (connection.mode === "data" && fromPort.dataType !== "any" && toPort.dataType !== "any" && fromPort.dataType !== toPort.dataType) {
      issues.push({ level: "warning", connectionId: connection.id, message: `Data route type mismatch: ${fromPort.dataType} to ${toPort.dataType}.` });
    }
  });

  pipeline.connections.forEach((connection) => {
    if (!nodeIds.has(connection.fromNodeId) || !nodeIds.has(connection.toNodeId)) {
      issues.push({ level: "error", connectionId: connection.id, message: "Connection endpoint is missing from this pipeline." });
    }
  });

  return issues;
}

function evaluateAutomationExpression(expression: string, input: unknown, context: AutomationSelectionContext) {
  const trimmed = expression.trim();
  if (!trimmed) return true;
  const evaluator = new Function("input", "selection", `"use strict"; return Boolean(${trimmed});`);
  return Boolean(evaluator(input, context));
}

function packet(type: AutomationPacket["type"], value: unknown, meta?: Record<string, unknown>): AutomationPacket {
  return { type, value, meta };
}

function nodeOutputs(node: AutomationNode, outputs: Record<string, AutomationPacket>): AutomationNodeRunOutput {
  return {
    value: firstDataPacket(outputs)?.value,
    outputs: Object.fromEntries(
      Object.entries(outputs).map(([portId, output]) => [
        portId,
        {
          ...output,
          meta: {
            ...(output.meta ?? {}),
            nodeId: node.id,
            portId,
            portLabel: node.outputs.find((port) => port.id === portId)?.label ?? portId,
          },
        },
      ])
    ),
  };
}

function firstDataPacket(outputs: Record<string, AutomationPacket>) {
  return Object.values(outputs).find((output) => output.type !== "trigger") ?? Object.values(outputs)[0];
}

function parseJsonOrText(value: string) {
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function pickJsonPath(input: unknown, path: string) {
  const normalized = path.trim();
  if (!normalized) return input;
  return normalized.split(".").filter(Boolean).reduce<unknown>((current, segment) => {
    if (current == null) return undefined;
    if (Array.isArray(current)) {
      const index = Number(segment);
      return Number.isInteger(index) ? current[index] : undefined;
    }
    if (typeof current === "object" && segment in current) {
      return (current as Record<string, unknown>)[segment];
    }
    return undefined;
  }, input);
}
