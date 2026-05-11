import {
  AUTOMATION_LIBRARY,
  serializeAutomationPipelineScript,
  type AutomationConnection,
  type AutomationNode,
  type AutomationNodeConfig,
  type AutomationPipeline,
  type AutomationTokenName,
} from "./automationTypes";

type TemplateNodeSpec = {
  id: string;
  token: AutomationTokenName;
  x: number;
  y: number;
  config?: AutomationNodeConfig;
};

type TemplateConnectionSpec = {
  from: string;
  to: string;
  fromPort: string;
  toPort: string;
  mode: AutomationConnection["mode"];
};

export type AutomationTemplate = {
  id: string;
  name: string;
  description: string;
  create: () => AutomationPipeline;
};

export const AUTOMATION_TEMPLATES: AutomationTemplate[] = [
  {
    id: "preview-selected-annotation",
    name: "Preview selected annotation",
    description: "When selection is an annotation, reuse one metadata preview window.",
    create: () =>
      createPipelineFromTemplate({
        name: "Preview selected annotation",
        description: "When selection is an annotation, reuse one metadata preview window.",
        active: true,
        autoRun: true,
        nodes: [
          { id: "selection", token: "selection.changed", x: 120, y: 160 },
          { id: "is-annotation", token: "selected.isAnnotation", x: 390, y: 160 },
          { id: "preview", token: "metadata.previewSelectedAnnotation", x: 680, y: 160 },
        ],
        connections: [
          { from: "selection", fromPort: "trigger-out", to: "is-annotation", toPort: "trigger-in", mode: "trigger" },
          { from: "is-annotation", fromPort: "trigger-out", to: "preview", toPort: "trigger-in", mode: "trigger" },
        ],
      }),
  },
  {
    id: "fetch-json-log",
    name: "Fetch JSON and log",
    description: "Manual trigger fetches JSON from a URL and logs the response packet.",
    create: () =>
      createPipelineFromTemplate({
        name: "Fetch JSON and log",
        description: "Manual trigger fetches JSON from a URL and logs the response packet.",
        active: false,
        autoRun: false,
        nodes: [
          { id: "manual", token: "manual.trigger", x: 120, y: 180 },
          { id: "url", token: "source.url", x: 390, y: 180, config: { url: "https://example.com/data.json" } },
          { id: "fetch", token: "fetch.url", x: 660, y: 180 },
          { id: "log", token: "debug.log", x: 930, y: 180 },
        ],
        connections: [
          { from: "manual", fromPort: "trigger-out", to: "url", toPort: "trigger-in", mode: "trigger" },
          { from: "url", fromPort: "url-out", to: "fetch", toPort: "url-in", mode: "data" },
          { from: "fetch", fromPort: "response-out", to: "log", toPort: "data-in", mode: "data" },
        ],
      }),
  },
  {
    id: "pick-json-path",
    name: "Fetch and pick JSON path",
    description: "Fetch data, extract a dot-path value, and log the selected value.",
    create: () =>
      createPipelineFromTemplate({
        name: "Fetch and pick JSON path",
        description: "Fetch data, extract a dot-path value, and log the selected value.",
        active: false,
        autoRun: false,
        nodes: [
          { id: "manual", token: "manual.trigger", x: 120, y: 220 },
          { id: "url", token: "source.url", x: 360, y: 220, config: { url: "https://example.com/data.json" } },
          { id: "fetch", token: "fetch.url", x: 600, y: 220 },
          { id: "pick", token: "json.pickPath", x: 840, y: 220, config: { jsonPath: "items.0" } },
          { id: "log", token: "debug.log", x: 1080, y: 220 },
        ],
        connections: [
          { from: "manual", fromPort: "trigger-out", to: "url", toPort: "trigger-in", mode: "trigger" },
          { from: "url", fromPort: "url-out", to: "fetch", toPort: "url-in", mode: "data" },
          { from: "fetch", fromPort: "response-out", to: "pick", toPort: "data-in", mode: "data" },
          { from: "pick", fromPort: "data-out", to: "log", toPort: "data-in", mode: "data" },
        ],
      }),
  },
  {
    id: "manual-layer-visibility",
    name: "Manual layer visibility",
    description: "Manual trigger toggles a configured layer visibility value.",
    create: () =>
      createPipelineFromTemplate({
        name: "Manual layer visibility",
        description: "Manual trigger toggles a configured layer visibility value.",
        active: false,
        autoRun: false,
        nodes: [
          { id: "manual", token: "manual.trigger", x: 120, y: 180 },
          { id: "visibility", token: "viewer.setLayerVisibility", x: 390, y: 180, config: { targetLayerId: "", visible: true } },
        ],
        connections: [
          { from: "manual", fromPort: "trigger-out", to: "visibility", toPort: "trigger-in", mode: "trigger" },
        ],
      }),
  },
];

function createPipelineFromTemplate(input: {
  name: string;
  description: string;
  active: boolean;
  autoRun: boolean;
  nodes: TemplateNodeSpec[];
  connections: TemplateConnectionSpec[];
}): AutomationPipeline {
  const now = Date.now();
  const nodeIdMap = new Map<string, string>();
  const nodes = input.nodes.map((spec, index) => {
    const node = createNode(spec, index);
    nodeIdMap.set(spec.id, node.id);
    return node;
  });
  const connections = input.connections.map((connection, index): AutomationConnection => ({
    id: `template-connection-${now}-${index}`,
    fromNodeId: nodeIdMap.get(connection.from) ?? connection.from,
    toNodeId: nodeIdMap.get(connection.to) ?? connection.to,
    fromPortId: connection.fromPort,
    toPortId: connection.toPort,
    mode: connection.mode,
  }));
  const pipeline: AutomationPipeline = {
    id: `pipeline-${now}-${Math.random().toString(36).slice(2, 8)}`,
    name: input.name,
    description: input.description,
    active: input.active,
    autoRun: input.autoRun,
    script: "",
    nodes,
    connections,
    createdAt: now,
    updatedAt: now,
  };
  return { ...pipeline, script: serializeAutomationPipelineScript(pipeline) };
}

function createNode(spec: TemplateNodeSpec, index: number): AutomationNode {
  const item = AUTOMATION_LIBRARY.find((candidate) => candidate.token === spec.token);
  if (!item) throw new Error(`Unknown automation template token: ${spec.token}`);
  return {
    id: `template-node-${spec.id}-${Date.now()}-${index}`,
    kind: item.kind,
    label: item.label,
    token: item.token,
    x: spec.x,
    y: spec.y,
    inputs: item.inputs,
    outputs: item.outputs,
    config: {
      ...(item.defaultConfig ?? {}),
      ...(spec.config ?? {}),
    },
  };
}
