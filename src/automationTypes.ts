export type AutomationEventName =
  | "manual.trigger"
  | "selection.changed"
  | "annotation.selected"
  | "selection.cleared"
  | "keyboard.keyDown"
  | "viewer.stateChanged";
export type AutomationConditionName =
  | "selected.isAnnotation"
  | "selected.hasMetadata"
  | "selection.exists"
  | "selection.isVisible"
  | "state.pathChanged"
  | "condition.expression";
export type AutomationSourceName =
  | "source.selectedLayer"
  | "source.viewerState"
  | "source.importedFile"
  | "source.url"
  | "source.annotationMetadata"
  | "source.selectedNodeInfo"
  | "source.annotationText"
  | "source.stateChange"
  | "source.cameraPose"
  | "memory.get";
export type AutomationComputeName =
  | "compute.browserFunction"
  | "json.pickPath"
  | "state.diffSummary"
  | "text.template"
  | "time.delay"
  | "time.debounce"
  | "branch.ifElse";
export type AutomationExternalName = "external.httpRequest" | "fetch.url";
export type AutomationActionName =
  | "metadata.openSelectedAnnotation"
  | "metadata.previewSelectedAnnotation"
  | "inspector.expand"
  | "inspector.collapse"
  | "viewer.addLayer"
  | "viewer.setLayerVisibility"
  | "viewer.selectLayer"
  | "viewer.setSelectedLayerVisibility"
  | "viewer.toggleSelectedLayerVisibility"
  | "viewer.setSelectedOpacity"
  | "viewer.soloSelectedLayer"
  | "layer.showGroup"
  | "layer.hideGroup"
  | "camera.reset"
  | "camera.setPreset"
  | "camera.setPose"
  | "camera.focusSelection"
  | "slice.setPlane"
  | "slice.stepIndex"
  | "slice.setIndex"
  | "annotation.setSelectedMetadata"
  | "annotation.appendSelectedMetadata"
  | "annotation.selectNextByMetadata"
  | "annotation.setSelectedColor"
  | "memory.set"
  | "memory.clear"
  | "notify.toast"
  | "debug.log"
  | "state.patch";
export type AutomationCustomToolName = `custom.${string}`;
export type AutomationTokenName =
  | AutomationEventName
  | AutomationSourceName
  | AutomationConditionName
  | AutomationComputeName
  | AutomationExternalName
  | AutomationActionName
  | AutomationCustomToolName;

export type AutomationNodeKind = "event" | "source" | "condition" | "compute" | "external" | "action";

export type AutomationNodePort = {
  id: string;
  label: string;
  dataType: "trigger" | "viewer-state" | "layer" | "file" | "url" | "json" | "any";
};

export type AutomationNodeConfig = {
  code?: string;
  expression?: string;
  url?: string;
  method?: "GET" | "POST";
  headers?: string;
  bodyTemplate?: string;
  outputName?: string;
  jsonPath?: string;
  statePath?: string;
  template?: string;
  key?: string;
  cameraPreset?: "default" | "xy" | "xz" | "yz";
  cameraPoseJson?: string;
  targetLayerId?: string;
  targetGroupId?: string;
  memoryKey?: string;
  metadataText?: string;
  metadataMode?: "missing" | "present";
  plane?: "xy" | "xz" | "yz";
  opacity?: number;
  color?: string;
  delayMs?: string;
  debounceMs?: string;
  stepDelta?: string;
  sliceIndex?: string;
  visible?: boolean;
  title?: string;
  message?: string;
  tone?: "success" | "info" | "error";
  customToolId?: string;
  customToolMode?: AutomationNodeKind;
  breakpoint?: boolean;
};

export type AutomationNode = {
  id: string;
  kind: AutomationNodeKind;
  label: string;
  x: number;
  y: number;
  token: AutomationTokenName;
  inputs: AutomationNodePort[];
  outputs: AutomationNodePort[];
  config?: AutomationNodeConfig;
};

export type AutomationConnection = {
  id: string;
  fromNodeId: string;
  toNodeId: string;
  fromPortId?: string;
  toPortId?: string;
  mode: "trigger" | "data";
};

export type AutomationPipeline = {
  id: string;
  name: string;
  description?: string;
  active: boolean;
  autoRun: boolean;
  script: string;
  nodes: AutomationNode[];
  connections: AutomationConnection[];
  createdAt: number;
  updatedAt: number;
};

export type AutomationSelectionContext = {
  selectedNodeId: string | null;
  selectedNodeKind: "group" | "layer" | null;
  selectedLayerType: string | null;
  selectedAnnotationMetadata: string | null;
  selectedLayer?: unknown;
  viewerState?: unknown;
  previousViewerState?: unknown;
  keyboardEvent?: {
    key: string;
    code: string;
    altKey: boolean;
    ctrlKey: boolean;
    metaKey: boolean;
    shiftKey: boolean;
  } | null;
  stateChange?: {
    summary: string;
    details: string[];
    changedPaths: string[];
  } | null;
};

export type AutomationAppCommand =
  | { type: "metadata.openSelectedAnnotation" }
  | { type: "metadata.previewSelectedAnnotation" }
  | { type: "inspector.expand" }
  | { type: "inspector.collapse" }
  | { type: "compute.browserFunction"; label: string; code: string; input?: unknown }
  | { type: "external.httpRequest"; label: string }
  | { type: "viewer.setLayerVisibility"; targetLayerId?: string; visible?: boolean }
  | { type: "viewer.selectLayer"; targetLayerId?: string }
  | { type: "viewer.setSelectedLayerVisibility"; visible?: boolean }
  | { type: "viewer.toggleSelectedLayerVisibility" }
  | { type: "viewer.setSelectedOpacity"; opacity?: number }
  | { type: "viewer.soloSelectedLayer" }
  | { type: "layer.showGroup"; targetGroupId?: string }
  | { type: "layer.hideGroup"; targetGroupId?: string }
  | { type: "camera.reset" }
  | { type: "camera.setPreset"; preset?: "default" | "xy" | "xz" | "yz" }
  | { type: "camera.setPose"; poseJson?: string }
  | { type: "camera.focusSelection" }
  | { type: "slice.setPlane"; plane?: "xy" | "xz" | "yz" }
  | { type: "slice.stepIndex"; stepDelta?: number }
  | { type: "slice.setIndex"; sliceIndex?: number }
  | { type: "annotation.setSelectedMetadata"; metadataText?: string }
  | { type: "annotation.appendSelectedMetadata"; metadataText?: string }
  | { type: "annotation.selectNextByMetadata"; metadataMode?: "missing" | "present" }
  | { type: "annotation.setSelectedColor"; color?: string }
  | { type: "memory.set"; memoryKey?: string; value?: unknown }
  | { type: "memory.clear"; memoryKey?: string }
  | { type: "notify.toast"; title?: string; message?: string; tone?: "success" | "info" | "error" };

export type AutomationRunResult = {
  pipelineId: string;
  pipelineName: string;
  commands: AutomationAppCommand[];
  message: string;
};

export type AutomationDebugNodeStatus =
  | "idle"
  | "queued"
  | "running"
  | "success"
  | "paused"
  | "error"
  | "skipped";

export type AutomationDebugNodeState = {
  status: AutomationDebugNodeStatus;
  input?: unknown;
  output?: unknown;
  error?: string;
  durationMs?: number;
};

export type AutomationDebugSnapshot = {
  pipelineId: string | null;
  running: boolean;
  paused: boolean;
  activeNodeId: string | null;
  activeConnectionId: string | null;
  nodeStates: Record<string, AutomationDebugNodeState>;
  connectionStates: Record<string, "idle" | "active" | "success" | "error">;
  connectionPackets: Record<string, unknown>;
  memoryStore: Record<string, unknown>;
  pausedNodeId: string | null;
};

export const EMPTY_AUTOMATION_DEBUG_SNAPSHOT: AutomationDebugSnapshot = {
  pipelineId: null,
  running: false,
  paused: false,
  activeNodeId: null,
  activeConnectionId: null,
  nodeStates: {},
  connectionStates: {},
  connectionPackets: {},
  memoryStore: {},
  pausedNodeId: null,
};

export type AutomationLibraryItem = {
  id: string;
  kind: AutomationNodeKind;
  token: AutomationTokenName;
  label: string;
  description: string;
  inputs: AutomationNodePort[];
  outputs: AutomationNodePort[];
  defaultConfig?: AutomationNodeConfig;
};

export type AutomationCustomTool = {
  id: string;
  kind: AutomationNodeKind;
  token: AutomationCustomToolName;
  label: string;
  description: string;
  inputs: AutomationNodePort[];
  outputs: AutomationNodePort[];
  code: string;
  builder?: {
    mode: "guided" | "scripted";
    templateId?: string;
    values?: Record<string, string | boolean>;
  };
  createdAt: number;
  updatedAt: number;
};

type AutomationScriptV1 = {
  automationScriptVersion: 1;
  nodes: AutomationNode[];
  connections: AutomationConnection[];
};

const TRIGGER_IN: AutomationNodePort = { id: "trigger-in", label: "In", dataType: "trigger" };
const TRIGGER_OUT: AutomationNodePort = { id: "trigger-out", label: "Next", dataType: "trigger" };
const DATA_IN: AutomationNodePort = { id: "data-in", label: "Data", dataType: "any" };
const DATA_OUT: AutomationNodePort = { id: "data-out", label: "Data", dataType: "any" };
const DEFAULT_CUSTOM_TOOL_CODE = `function run(input, context) {
  return input;
}`;

export const AUTOMATION_LIBRARY: AutomationLibraryItem[] = [
  {
    id: "event-manual-trigger",
    kind: "event",
    token: "manual.trigger",
    label: "Manual trigger",
    description: "Starts when the user presses play on the pipeline.",
    inputs: [],
    outputs: [TRIGGER_OUT],
  },
  {
    id: "event-selection-changed",
    kind: "event",
    token: "selection.changed",
    label: "Selection changes",
    description: "Runs when the user selects an object in the scene or layer panel.",
    inputs: [],
    outputs: [TRIGGER_OUT],
  },
  {
    id: "event-annotation-selected",
    kind: "event",
    token: "annotation.selected",
    label: "Annotation selected",
    description: "Runs when the current selection is an annotation layer.",
    inputs: [],
    outputs: [TRIGGER_OUT],
  },
  {
    id: "event-selection-cleared",
    kind: "event",
    token: "selection.cleared",
    label: "Selection cleared",
    description: "Runs when the user clears the current selection.",
    inputs: [],
    outputs: [TRIGGER_OUT],
  },
  {
    id: "event-keyboard-keydown",
    kind: "event",
    token: "keyboard.keyDown",
    label: "Key pressed",
    description: "Runs when a configured keyboard key is pressed outside of text inputs.",
    inputs: [],
    outputs: [TRIGGER_OUT],
    defaultConfig: { key: "r" },
  },
  {
    id: "event-viewer-state-changed",
    kind: "event",
    token: "viewer.stateChanged",
    label: "Viewer state changed",
    description: "Runs when the saved viewer state changes from user interaction.",
    inputs: [],
    outputs: [TRIGGER_OUT],
  },
  {
    id: "source-selected-layer",
    kind: "source",
    token: "source.selectedLayer",
    label: "Selected layer",
    description: "Provides the currently selected layer as pipeline data.",
    inputs: [TRIGGER_IN],
    outputs: [TRIGGER_OUT, { id: "layer-out", label: "Layer", dataType: "layer" }],
  },
  {
    id: "source-viewer-state",
    kind: "source",
    token: "source.viewerState",
    label: "Viewer state",
    description: "Provides the serialized viewer state as data for a route.",
    inputs: [TRIGGER_IN],
    outputs: [TRIGGER_OUT, { id: "state-out", label: "State", dataType: "viewer-state" }],
  },
  {
    id: "source-imported-file",
    kind: "source",
    token: "source.importedFile",
    label: "Imported file",
    description: "Represents a user-provided file from drag and drop or browser import.",
    inputs: [TRIGGER_IN],
    outputs: [TRIGGER_OUT, { id: "file-out", label: "File", dataType: "file" }],
  },
  {
    id: "source-url",
    kind: "source",
    token: "source.url",
    label: "URL data",
    description: "Fetches or references data from a URL configured on this node.",
    inputs: [TRIGGER_IN],
    outputs: [TRIGGER_OUT, { id: "url-out", label: "URL", dataType: "url" }],
    defaultConfig: { url: "" },
  },
  {
    id: "source-annotation-metadata",
    kind: "source",
    token: "source.annotationMetadata",
    label: "Annotation metadata",
    description: "Provides the selected annotation metadata as text and parsed JSON when possible.",
    inputs: [TRIGGER_IN, DATA_IN],
    outputs: [TRIGGER_OUT, { id: "metadata-out", label: "Metadata", dataType: "json" }],
  },
  {
    id: "source-selected-node-info",
    kind: "source",
    token: "source.selectedNodeInfo",
    label: "Selected node info",
    description: "Provides the selected node identity, type, name, and visibility as JSON.",
    inputs: [TRIGGER_IN],
    outputs: [TRIGGER_OUT, { id: "info-out", label: "Info", dataType: "json" }],
  },
  {
    id: "source-annotation-text",
    kind: "source",
    token: "source.annotationText",
    label: "Annotation text",
    description: "Provides the selected annotation metadata as raw text.",
    inputs: [TRIGGER_IN, DATA_IN],
    outputs: [TRIGGER_OUT, { id: "text-out", label: "Text", dataType: "any" }],
  },
  {
    id: "source-state-change",
    kind: "source",
    token: "source.stateChange",
    label: "State change",
    description: "Provides a readable summary and changed paths for the last viewer state change.",
    inputs: [TRIGGER_IN],
    outputs: [TRIGGER_OUT, { id: "change-out", label: "Change", dataType: "json" }],
  },
  {
    id: "source-camera-pose",
    kind: "source",
    token: "source.cameraPose",
    label: "Camera pose",
    description: "Provides the current camera pose as JSON data.",
    inputs: [TRIGGER_IN],
    outputs: [TRIGGER_OUT, { id: "camera-out", label: "Camera", dataType: "json" }],
  },
  {
    id: "source-memory-get",
    kind: "source",
    token: "memory.get",
    label: "Memory value",
    description: "Reads a stored value from pipeline memory by key.",
    inputs: [TRIGGER_IN],
    outputs: [TRIGGER_OUT, { id: "memory-out", label: "Value", dataType: "json" }],
    defaultConfig: { memoryKey: "lastSelection" },
  },
  {
    id: "condition-selected-is-annotation",
    kind: "condition",
    token: "selected.isAnnotation",
    label: "Selected is annotation",
    description: "Continues only when the selected layer is an annotation.",
    inputs: [TRIGGER_IN, DATA_IN],
    outputs: [TRIGGER_OUT],
  },
  {
    id: "condition-selected-has-metadata",
    kind: "condition",
    token: "selected.hasMetadata",
    label: "Selected has metadata",
    description: "Continues only when the selected annotation has metadata text.",
    inputs: [TRIGGER_IN, DATA_IN],
    outputs: [TRIGGER_OUT],
  },
  {
    id: "condition-selection-exists",
    kind: "condition",
    token: "selection.exists",
    label: "Selection exists",
    description: "Continues only when something is selected in the viewer.",
    inputs: [TRIGGER_IN, DATA_IN],
    outputs: [TRIGGER_OUT],
  },
  {
    id: "condition-selection-visible",
    kind: "condition",
    token: "selection.isVisible",
    label: "Selection is visible",
    description: "Continues only when the selected layer is currently visible.",
    inputs: [TRIGGER_IN, DATA_IN],
    outputs: [TRIGGER_OUT],
  },
  {
    id: "condition-state-path-changed",
    kind: "condition",
    token: "state.pathChanged",
    label: "State path changed",
    description: "Continues only when a specific viewer state path changed in the last update.",
    inputs: [TRIGGER_IN, DATA_IN],
    outputs: [TRIGGER_OUT],
    defaultConfig: { statePath: "scene.selectedNodeId" },
  },
  {
    id: "condition-expression",
    kind: "condition",
    token: "condition.expression",
    label: "Expression condition",
    description: "Continues when a JavaScript expression returns true.",
    inputs: [TRIGGER_IN, DATA_IN],
    outputs: [TRIGGER_OUT],
    defaultConfig: {
      expression: "input.selection?.selectedLayerType === \"annotation\"",
    },
  },
  {
    id: "compute-browser-function",
    kind: "compute",
    token: "compute.browserFunction",
    label: "Browser function",
    description: "Runs a user-defined JavaScript function in the browser runtime.",
    inputs: [TRIGGER_IN, DATA_IN],
    outputs: [TRIGGER_OUT, DATA_OUT],
    defaultConfig: {
      code: "function run(input) {\n  return {\n    message: \"Hello world from the automation pipeline\",\n    selectedNodeId: input.selection?.selectedNodeId ?? null\n  };\n}",
      outputName: "result",
    },
  },
  {
    id: "compute-json-pick-path",
    kind: "compute",
    token: "json.pickPath",
    label: "Pick JSON path",
    description: "Extracts a nested value from JSON data with a dot path.",
    inputs: [TRIGGER_IN, DATA_IN],
    outputs: [TRIGGER_OUT, DATA_OUT],
    defaultConfig: { jsonPath: "" },
  },
  {
    id: "compute-state-diff-summary",
    kind: "compute",
    token: "state.diffSummary",
    label: "State diff summary",
    description: "Formats the current state change into a compact summary object and text.",
    inputs: [TRIGGER_IN, DATA_IN],
    outputs: [TRIGGER_OUT, DATA_OUT],
  },
  {
    id: "compute-text-template",
    kind: "compute",
    token: "text.template",
    label: "Format text",
    description: "Builds a readable text string from routed data and viewer context.",
    inputs: [TRIGGER_IN, DATA_IN],
    outputs: [TRIGGER_OUT, DATA_OUT],
    defaultConfig: { template: "Selection: {{selectedNodeId}}" },
  },
  {
    id: "compute-time-delay",
    kind: "compute",
    token: "time.delay",
    label: "Delay",
    description: "Waits a configured amount of time before continuing.",
    inputs: [TRIGGER_IN, DATA_IN],
    outputs: [TRIGGER_OUT, DATA_OUT],
    defaultConfig: { delayMs: "300" },
  },
  {
    id: "compute-time-debounce",
    kind: "compute",
    token: "time.debounce",
    label: "Debounce",
    description: "Lets only the latest trigger continue after a short quiet period.",
    inputs: [TRIGGER_IN, DATA_IN],
    outputs: [TRIGGER_OUT, DATA_OUT],
    defaultConfig: { debounceMs: "400" },
  },
  {
    id: "compute-branch-if-else",
    kind: "compute",
    token: "branch.ifElse",
    label: "If / else",
    description: "Routes execution to true or false based on input data or a simple expression.",
    inputs: [TRIGGER_IN, DATA_IN],
    outputs: [
      { id: "true-out", label: "True", dataType: "trigger" },
      { id: "false-out", label: "False", dataType: "trigger" },
      DATA_OUT,
    ],
    defaultConfig: { expression: "Boolean(input)" },
  },
  {
    id: "external-http-request",
    kind: "external",
    token: "external.httpRequest",
    label: "HTTP request",
    description: "Routes data to a local or remote HTTP service and returns its response.",
    inputs: [TRIGGER_IN, DATA_IN],
    outputs: [TRIGGER_OUT, { id: "response-out", label: "Response", dataType: "json" }],
    defaultConfig: {
      url: "http://localhost:8000/run",
      method: "POST",
      headers: "{\n  \"Content-Type\": \"application/json\"\n}",
      bodyTemplate: "{{data}}",
    },
  },
  {
    id: "external-fetch-url",
    kind: "external",
    token: "fetch.url",
    label: "Fetch URL",
    description: "Fetches JSON or text from a URL and returns the response.",
    inputs: [TRIGGER_IN, { id: "url-in", label: "URL", dataType: "url" }],
    outputs: [TRIGGER_OUT, { id: "response-out", label: "Response", dataType: "json" }],
    defaultConfig: { url: "" },
  },
  {
    id: "action-open-selected-metadata",
    kind: "action",
    token: "metadata.openSelectedAnnotation",
    label: "Open metadata",
    description: "Opens the metadata editor for the selected annotation.",
    inputs: [TRIGGER_IN, DATA_IN],
    outputs: [],
  },
  {
    id: "action-preview-selected-metadata",
    kind: "action",
    token: "metadata.previewSelectedAnnotation",
    label: "Preview metadata",
    description: "Shows selected annotation metadata in one reusable preview window.",
    inputs: [TRIGGER_IN, DATA_IN],
    outputs: [],
  },
  {
    id: "action-expand-inspector",
    kind: "action",
    token: "inspector.expand",
    label: "Expand inspector",
    description: "Opens the layer inspector panel.",
    inputs: [TRIGGER_IN],
    outputs: [],
  },
  {
    id: "action-collapse-inspector",
    kind: "action",
    token: "inspector.collapse",
    label: "Collapse inspector",
    description: "Closes the layer inspector panel.",
    inputs: [TRIGGER_IN],
    outputs: [],
  },
  {
    id: "action-viewer-add-layer",
    kind: "action",
    token: "viewer.addLayer",
    label: "Add result layer",
    description: "Adds routed output data back into the viewer as a layer.",
    inputs: [TRIGGER_IN, DATA_IN],
    outputs: [],
  },
  {
    id: "action-set-layer-visibility",
    kind: "action",
    token: "viewer.setLayerVisibility",
    label: "Set layer visibility",
    description: "Shows or hides a configured layer.",
    inputs: [TRIGGER_IN, DATA_IN],
    outputs: [],
    defaultConfig: { targetLayerId: "", visible: true },
  },
  {
    id: "action-select-layer",
    kind: "action",
    token: "viewer.selectLayer",
    label: "Select layer",
    description: "Selects a layer by id from input data or node config.",
    inputs: [TRIGGER_IN, DATA_IN],
    outputs: [],
    defaultConfig: { targetLayerId: "" },
  },
  {
    id: "action-set-selected-layer-visibility",
    kind: "action",
    token: "viewer.setSelectedLayerVisibility",
    label: "Set selected visibility",
    description: "Shows or hides the currently selected layer.",
    inputs: [TRIGGER_IN, DATA_IN],
    outputs: [],
    defaultConfig: { visible: true },
  },
  {
    id: "action-toggle-selected-layer-visibility",
    kind: "action",
    token: "viewer.toggleSelectedLayerVisibility",
    label: "Toggle selected visibility",
    description: "Toggles visibility for the currently selected layer.",
    inputs: [TRIGGER_IN, DATA_IN],
    outputs: [],
  },
  {
    id: "action-set-selected-opacity",
    kind: "action",
    token: "viewer.setSelectedOpacity",
    label: "Set selected opacity",
    description: "Sets the opacity of the selected layer.",
    inputs: [TRIGGER_IN, DATA_IN],
    outputs: [],
    defaultConfig: { opacity: 0.4 },
  },
  {
    id: "action-solo-selected-layer",
    kind: "action",
    token: "viewer.soloSelectedLayer",
    label: "Solo selected layer",
    description: "Shows only the selected layer and hides the rest.",
    inputs: [TRIGGER_IN, DATA_IN],
    outputs: [],
  },
  {
    id: "action-layer-show-group",
    kind: "action",
    token: "layer.showGroup",
    label: "Show group",
    description: "Shows all layers inside a target group by id or name.",
    inputs: [TRIGGER_IN, DATA_IN],
    outputs: [],
    defaultConfig: { targetGroupId: "" },
  },
  {
    id: "action-layer-hide-group",
    kind: "action",
    token: "layer.hideGroup",
    label: "Hide group",
    description: "Hides all layers inside a target group by id or name.",
    inputs: [TRIGGER_IN, DATA_IN],
    outputs: [],
    defaultConfig: { targetGroupId: "" },
  },
  {
    id: "action-camera-reset",
    kind: "action",
    token: "camera.reset",
    label: "Reset camera",
    description: "Resets the camera to the default viewer position.",
    inputs: [TRIGGER_IN],
    outputs: [],
  },
  {
    id: "action-camera-set-preset",
    kind: "action",
    token: "camera.setPreset",
    label: "Set camera preset",
    description: "Moves the camera to a built-in XY, XZ, YZ, or default preset.",
    inputs: [TRIGGER_IN],
    outputs: [],
    defaultConfig: { cameraPreset: "xy" },
  },
  {
    id: "action-camera-focus-selection",
    kind: "action",
    token: "camera.focusSelection",
    label: "Focus selection",
    description: "Moves the viewer focus to the selected layer.",
    inputs: [TRIGGER_IN],
    outputs: [],
  },
  {
    id: "action-camera-set-pose",
    kind: "action",
    token: "camera.setPose",
    label: "Set camera pose",
    description: "Applies a custom camera pose from JSON.",
    inputs: [TRIGGER_IN, DATA_IN],
    outputs: [],
    defaultConfig: {
      cameraPoseJson: "{\n  \"mode\": \"fly\",\n  \"position\": [0, 0, 5],\n  \"yaw\": -90,\n  \"pitch\": 0,\n  \"fovDeg\": 60\n}",
    },
  },
  {
    id: "action-slice-set-plane",
    kind: "action",
    token: "slice.setPlane",
    label: "Set slice plane",
    description: "Switches the active slice plane to XY, XZ, or YZ.",
    inputs: [TRIGGER_IN],
    outputs: [],
    defaultConfig: { plane: "xy" },
  },
  {
    id: "action-slice-step-index",
    kind: "action",
    token: "slice.stepIndex",
    label: "Step slice index",
    description: "Moves the active slice index forward or backward.",
    inputs: [TRIGGER_IN, DATA_IN],
    outputs: [],
    defaultConfig: { stepDelta: "1" },
  },
  {
    id: "action-slice-set-index",
    kind: "action",
    token: "slice.setIndex",
    label: "Set slice index",
    description: "Sets the active slice index directly.",
    inputs: [TRIGGER_IN, DATA_IN],
    outputs: [],
    defaultConfig: { sliceIndex: "0" },
  },
  {
    id: "action-annotation-set-metadata",
    kind: "action",
    token: "annotation.setSelectedMetadata",
    label: "Set metadata text",
    description: "Replaces the selected annotation metadata.",
    inputs: [TRIGGER_IN, DATA_IN],
    outputs: [],
    defaultConfig: { metadataText: "" },
  },
  {
    id: "action-annotation-append-metadata",
    kind: "action",
    token: "annotation.appendSelectedMetadata",
    label: "Append metadata text",
    description: "Appends text to the selected annotation metadata.",
    inputs: [TRIGGER_IN, DATA_IN],
    outputs: [],
    defaultConfig: { metadataText: "" },
  },
  {
    id: "action-annotation-select-next-by-metadata",
    kind: "action",
    token: "annotation.selectNextByMetadata",
    label: "Next annotation by metadata",
    description: "Selects the next annotation with missing or present metadata.",
    inputs: [TRIGGER_IN],
    outputs: [],
    defaultConfig: { metadataMode: "missing" },
  },
  {
    id: "action-annotation-set-color",
    kind: "action",
    token: "annotation.setSelectedColor",
    label: "Set annotation color",
    description: "Changes the selected annotation color.",
    inputs: [TRIGGER_IN, DATA_IN],
    outputs: [],
    defaultConfig: { color: "#ff6b6b" },
  },
  {
    id: "action-memory-set",
    kind: "action",
    token: "memory.set",
    label: "Store memory",
    description: "Stores the current routed value under a memory key for this pipeline run.",
    inputs: [TRIGGER_IN, DATA_IN],
    outputs: [TRIGGER_OUT, DATA_OUT],
    defaultConfig: { memoryKey: "lastValue" },
  },
  {
    id: "action-memory-clear",
    kind: "action",
    token: "memory.clear",
    label: "Clear memory",
    description: "Clears one memory key or all pipeline memory values.",
    inputs: [TRIGGER_IN, DATA_IN],
    outputs: [TRIGGER_OUT, DATA_OUT],
    defaultConfig: { memoryKey: "" },
  },
  {
    id: "action-notify-toast",
    kind: "action",
    token: "notify.toast",
    label: "Show toast",
    description: "Shows a viewer toast using configured text or routed input.",
    inputs: [TRIGGER_IN, DATA_IN],
    outputs: [],
    defaultConfig: { title: "Automation", message: "", tone: "info" },
  },
  {
    id: "action-debug-log",
    kind: "action",
    token: "debug.log",
    label: "Debug log",
    description: "Shows routed data in the debug inspector and browser console.",
    inputs: [TRIGGER_IN, DATA_IN],
    outputs: [],
  },
  {
    id: "action-state-patch",
    kind: "action",
    token: "state.patch",
    label: "Patch viewer state",
    description: "Applies a structured patch to the viewer state.",
    inputs: [TRIGGER_IN, { id: "state-patch-in", label: "Patch", dataType: "json" }],
    outputs: [],
  },
];

const DEFAULT_SCRIPT = `on selection.changed
if selected.isAnnotation
do metadata.openSelectedAnnotation`;

export const EMPTY_AUTOMATION_SCRIPT = `on selection.changed`;

const NODE_POSITIONS: Record<string, { x: number; y: number }> = {
  "manual.trigger": { x: 120, y: 60 },
  "selection.changed": { x: 120, y: 160 },
  "annotation.selected": { x: 120, y: 260 },
  "selection.cleared": { x: 120, y: 360 },
  "keyboard.keyDown": { x: 120, y: 460 },
  "viewer.stateChanged": { x: 120, y: 560 },
  "source.selectedLayer": { x: 390, y: 300 },
  "source.viewerState": { x: 390, y: 440 },
  "source.importedFile": { x: 390, y: 580 },
  "source.url": { x: 390, y: 720 },
  "source.annotationMetadata": { x: 390, y: 860 },
  "source.selectedNodeInfo": { x: 390, y: 1000 },
  "source.annotationText": { x: 390, y: 1140 },
  "source.stateChange": { x: 390, y: 1280 },
  "source.cameraPose": { x: 390, y: 1420 },
  "memory.get": { x: 390, y: 1560 },
  "selected.isAnnotation": { x: 390, y: 160 },
  "selected.hasMetadata": { x: 390, y: 300 },
  "selection.exists": { x: 390, y: 440 },
  "selection.isVisible": { x: 390, y: 580 },
  "state.pathChanged": { x: 390, y: 720 },
  "condition.expression": { x: 390, y: 860 },
  "compute.browserFunction": { x: 680, y: 300 },
  "json.pickPath": { x: 680, y: 560 },
  "state.diffSummary": { x: 680, y: 700 },
  "text.template": { x: 680, y: 840 },
  "time.delay": { x: 680, y: 980 },
  "time.debounce": { x: 680, y: 1120 },
  "branch.ifElse": { x: 680, y: 1260 },
  "external.httpRequest": { x: 680, y: 440 },
  "fetch.url": { x: 680, y: 680 },
  "metadata.openSelectedAnnotation": { x: 680, y: 160 },
  "metadata.previewSelectedAnnotation": { x: 680, y: 260 },
  "inspector.expand": { x: 680, y: 300 },
  "inspector.collapse": { x: 680, y: 400 },
  "viewer.addLayer": { x: 970, y: 220 },
  "viewer.setLayerVisibility": { x: 970, y: 300 },
  "viewer.selectLayer": { x: 970, y: 380 },
  "viewer.setSelectedLayerVisibility": { x: 970, y: 460 },
  "viewer.toggleSelectedLayerVisibility": { x: 970, y: 540 },
  "viewer.setSelectedOpacity": { x: 970, y: 620 },
  "viewer.soloSelectedLayer": { x: 970, y: 700 },
  "layer.showGroup": { x: 970, y: 780 },
  "layer.hideGroup": { x: 970, y: 860 },
  "camera.reset": { x: 970, y: 940 },
  "camera.setPreset": { x: 970, y: 1020 },
  "camera.setPose": { x: 970, y: 1100 },
  "camera.focusSelection": { x: 970, y: 1180 },
  "slice.setPlane": { x: 970, y: 1260 },
  "slice.stepIndex": { x: 970, y: 1340 },
  "slice.setIndex": { x: 970, y: 1420 },
  "annotation.setSelectedMetadata": { x: 970, y: 1500 },
  "annotation.appendSelectedMetadata": { x: 970, y: 1580 },
  "annotation.selectNextByMetadata": { x: 970, y: 1660 },
  "annotation.setSelectedColor": { x: 970, y: 1740 },
  "memory.set": { x: 970, y: 1820 },
  "memory.clear": { x: 970, y: 1900 },
  "notify.toast": { x: 970, y: 1980 },
  "debug.log": { x: 970, y: 2060 },
  "state.patch": { x: 970, y: 2140 },
};

export function createAutomationPipeline(name = "Show annotation metadata"): AutomationPipeline {
  const now = Date.now();
  return {
    id: `pipeline-${now}-${Math.random().toString(36).slice(2, 8)}`,
    name,
    description: "Open annotation metadata when an annotation is selected.",
    active: true,
    autoRun: true,
    script: DEFAULT_SCRIPT,
    ...buildAutomationGraphFromScript(DEFAULT_SCRIPT),
    createdAt: now,
    updatedAt: now,
  };
}

export function createEmptyAutomationPipeline(name = "Untitled pipeline"): AutomationPipeline {
  const now = Date.now();
  return {
    id: `pipeline-${now}-${Math.random().toString(36).slice(2, 8)}`,
    name,
    description: "",
    active: false,
    autoRun: false,
    script: EMPTY_AUTOMATION_SCRIPT,
    ...buildAutomationGraphFromScript(EMPTY_AUTOMATION_SCRIPT),
    createdAt: now,
    updatedAt: now,
  };
}

export function sanitizeAutomationPipeline(value: unknown): AutomationPipeline | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<AutomationPipeline>;
  if (typeof candidate.id !== "string" || !candidate.id.trim()) return null;
  if (typeof candidate.name !== "string") return null;

  const script =
    typeof candidate.script === "string" && candidate.script.trim()
      ? candidate.script
      : EMPTY_AUTOMATION_SCRIPT;
  const now = Date.now();
  const graph = buildAutomationGraphFromScript(script);
  const previousNodes = Array.isArray(candidate.nodes) ? candidate.nodes : [];
  const nodes = graph.nodes.map((node) => {
    const previous = previousNodes.find((item) => item?.id === node.id);
    return {
      ...node,
      x: typeof previous?.x === "number" ? previous.x : node.x,
      y: typeof previous?.y === "number" ? previous.y : node.y,
      config: previous?.config ?? node.config,
    };
  });
  const savedConnections = Array.isArray(candidate.connections)
    ? candidate.connections
        .map((connection) => sanitizeAutomationScriptConnection(connection, nodes))
        .filter((connection): connection is AutomationConnection => !!connection)
    : [];
  const connections = graph.connections.length > 0 ? graph.connections : savedConnections;

  return {
    id: candidate.id,
    name: candidate.name.trim() || "Untitled pipeline",
    description: typeof candidate.description === "string" ? candidate.description : "",
    active: !!candidate.active,
    autoRun: !!candidate.autoRun,
    script,
    nodes,
    connections,
    createdAt: typeof candidate.createdAt === "number" ? candidate.createdAt : now,
    updatedAt: typeof candidate.updatedAt === "number" ? candidate.updatedAt : now,
  };
}

export function sanitizeAutomationPipelines(
  value: unknown,
  fallback: AutomationPipeline[] = []
): AutomationPipeline[] {
  if (!Array.isArray(value)) return fallback;
  const pipelines = value
    .map(sanitizeAutomationPipeline)
    .filter((pipeline): pipeline is AutomationPipeline => !!pipeline);
  return pipelines.length > 0 ? pipelines : fallback;
}

export function createAutomationCustomTool(params?: Partial<AutomationCustomTool>): AutomationCustomTool {
  const now = Date.now();
  const kind = params?.kind ?? "compute";
  const id = params?.id?.trim() || `custom-tool-${now}-${Math.random().toString(36).slice(2, 7)}`;
  return {
    id,
    kind,
    token: (params?.token?.startsWith("custom.") ? params.token : `custom.${id}`) as AutomationCustomToolName,
    label: params?.label?.trim() || "Custom tool",
    description: params?.description?.trim() || "User-defined pipeline tool.",
    inputs: params?.inputs?.length ? params.inputs : defaultCustomToolInputs(kind),
    outputs: params?.outputs?.length ? params.outputs : defaultCustomToolOutputs(kind),
    code: params?.code ?? DEFAULT_CUSTOM_TOOL_CODE,
    builder: params?.builder,
    createdAt: typeof params?.createdAt === "number" ? params.createdAt : now,
    updatedAt: typeof params?.updatedAt === "number" ? params.updatedAt : now,
  };
}

export function customToolToLibraryItem(tool: AutomationCustomTool): AutomationLibraryItem {
  return {
    id: tool.id,
    kind: tool.kind,
    token: tool.token,
    label: tool.label,
    description: tool.description,
    inputs: tool.inputs,
    outputs: tool.outputs,
    defaultConfig: {
      customToolId: tool.id,
      customToolMode: tool.kind,
      code: tool.code,
    },
  };
}

export function sanitizeAutomationCustomTools(value: unknown): AutomationCustomTool[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item): AutomationCustomTool | null => {
      if (!item || typeof item !== "object") return null;
      const candidate = item as Partial<AutomationCustomTool>;
      if (typeof candidate.id !== "string" || !candidate.id.trim()) return null;
      if (!isAutomationNodeKind(candidate.kind)) return null;
      const tool = createAutomationCustomTool({
        ...candidate,
        token: (typeof candidate.token === "string" && candidate.token.startsWith("custom.")
          ? candidate.token
          : `custom.${candidate.id}`) as AutomationCustomToolName,
        inputs: sanitizeAutomationPorts(candidate.inputs, defaultCustomToolInputs(candidate.kind)),
        outputs: sanitizeAutomationPorts(candidate.outputs, defaultCustomToolOutputs(candidate.kind)),
        code: typeof candidate.code === "string" ? candidate.code : DEFAULT_CUSTOM_TOOL_CODE,
      });
      return tool;
    })
    .filter((tool): tool is AutomationCustomTool => !!tool);
}

export function parseAutomationScript(script: string) {
  const eventNames: AutomationEventName[] = [];
  const sourceNames: AutomationSourceName[] = [];
  const conditionNames: AutomationConditionName[] = [];
  const computeNames: AutomationComputeName[] = [];
  const externalNames: AutomationExternalName[] = [];
  const actionNames: AutomationActionName[] = [];

  script.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return;
    const [keyword, ...rest] = trimmed.split(/\s+/);
    const token = rest.join(" ");
    if (
      keyword === "on" &&
      (token === "manual.trigger" ||
        token === "selection.changed" ||
        token === "annotation.selected" ||
        token === "selection.cleared" ||
        token === "keyboard.keyDown" ||
        token === "viewer.stateChanged")
    ) {
      eventNames.push(token);
    }
    if (
      keyword === "source" &&
      (token === "source.selectedLayer" ||
        token === "source.viewerState" ||
        token === "source.importedFile" ||
        token === "source.url" ||
        token === "source.annotationMetadata" ||
        token === "source.selectedNodeInfo" ||
        token === "source.annotationText" ||
        token === "source.stateChange" ||
        token === "source.cameraPose" ||
        token === "memory.get")
    ) {
      sourceNames.push(token);
    }
    if (
      keyword === "if" &&
      (token === "selected.isAnnotation" ||
        token === "selected.hasMetadata" ||
        token === "selection.exists" ||
        token === "selection.isVisible" ||
        token === "state.pathChanged" ||
        token === "condition.expression")
    ) {
      conditionNames.push(token);
    }
    if (
      keyword === "compute" &&
      (token === "compute.browserFunction" ||
        token === "json.pickPath" ||
        token === "state.diffSummary" ||
        token === "text.template" ||
        token === "time.delay" ||
        token === "time.debounce" ||
        token === "branch.ifElse")
    ) {
      computeNames.push(token);
    }
    if (keyword === "external" && (token === "external.httpRequest" || token === "fetch.url")) {
      externalNames.push(token);
    }
    if (
      keyword === "do" &&
      (token === "metadata.openSelectedAnnotation" ||
        token === "metadata.previewSelectedAnnotation" ||
        token === "inspector.expand" ||
        token === "inspector.collapse" ||
        token === "viewer.addLayer" ||
        token === "viewer.setLayerVisibility" ||
        token === "viewer.selectLayer" ||
        token === "viewer.setSelectedLayerVisibility" ||
        token === "viewer.toggleSelectedLayerVisibility" ||
        token === "viewer.setSelectedOpacity" ||
        token === "viewer.soloSelectedLayer" ||
        token === "layer.showGroup" ||
        token === "layer.hideGroup" ||
        token === "camera.reset" ||
        token === "camera.setPreset" ||
        token === "camera.setPose" ||
        token === "camera.focusSelection" ||
        token === "slice.setPlane" ||
        token === "slice.stepIndex" ||
        token === "slice.setIndex" ||
        token === "annotation.setSelectedMetadata" ||
        token === "annotation.appendSelectedMetadata" ||
        token === "annotation.selectNextByMetadata" ||
        token === "annotation.setSelectedColor" ||
        token === "memory.set" ||
        token === "memory.clear" ||
        token === "notify.toast" ||
        token === "debug.log" ||
        token === "state.patch")
    ) {
      actionNames.push(token);
    }
  });

  return { eventNames, sourceNames, conditionNames, computeNames, externalNames, actionNames };
}

function sanitizeAutomationScriptNode(value: unknown): AutomationNode | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<AutomationNode>;
  if (typeof candidate.id !== "string" || !candidate.id.trim()) return null;
  if (typeof candidate.token !== "string") return null;
  const libraryItem = AUTOMATION_LIBRARY.find((item) => item.token === candidate.token);
  if (!libraryItem && !candidate.token.startsWith("custom.")) return null;
  const kind = libraryItem?.kind ?? (isAutomationNodeKind(candidate.kind) ? candidate.kind : "compute");
  return {
    id: candidate.id,
    kind,
    label: typeof candidate.label === "string" && candidate.label.trim() ? candidate.label : libraryItem?.label ?? "Custom tool",
    token: (libraryItem?.token ?? candidate.token) as AutomationTokenName,
    x: typeof candidate.x === "number" && Number.isFinite(candidate.x) ? candidate.x : NODE_POSITIONS[libraryItem?.token ?? ""]?.x ?? 120,
    y: typeof candidate.y === "number" && Number.isFinite(candidate.y) ? candidate.y : NODE_POSITIONS[libraryItem?.token ?? ""]?.y ?? 160,
    inputs: libraryItem?.inputs ?? sanitizeAutomationPorts(candidate.inputs, defaultCustomToolInputs(kind)),
    outputs: libraryItem?.outputs ?? sanitizeAutomationPorts(candidate.outputs, defaultCustomToolOutputs(kind)),
    config: {
      ...(libraryItem?.defaultConfig ?? {}),
      ...(candidate.config ?? {}),
    },
  };
}

function sanitizeAutomationScriptConnection(
  value: unknown,
  nodes: AutomationNode[]
): AutomationConnection | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<AutomationConnection>;
  if (typeof candidate.id !== "string" || !candidate.id.trim()) return null;
  if (typeof candidate.fromNodeId !== "string" || typeof candidate.toNodeId !== "string") return null;
  const from = nodes.find((node) => node.id === candidate.fromNodeId);
  const to = nodes.find((node) => node.id === candidate.toNodeId);
  if (!from || !to) return null;
  return {
    id: candidate.id,
    fromNodeId: candidate.fromNodeId,
    toNodeId: candidate.toNodeId,
    fromPortId: typeof candidate.fromPortId === "string" ? candidate.fromPortId : from.outputs[0]?.id,
    toPortId: typeof candidate.toPortId === "string" ? candidate.toPortId : to.inputs[0]?.id,
    mode: candidate.mode === "data" ? "data" : "trigger",
  };
}

function parseRichAutomationScript(script: string): Pick<AutomationPipeline, "nodes" | "connections"> | null {
  const trimmed = script.trim();
  if (!trimmed.startsWith("{")) return null;
  try {
    const parsed = JSON.parse(trimmed) as Partial<AutomationScriptV1>;
    if (parsed.automationScriptVersion !== 1 || !Array.isArray(parsed.nodes)) return null;
    const nodes = parsed.nodes
      .map(sanitizeAutomationScriptNode)
      .filter((node): node is AutomationNode => !!node);
    const connections = Array.isArray(parsed.connections)
      ? parsed.connections
          .map((connection) => sanitizeAutomationScriptConnection(connection, nodes))
          .filter((connection): connection is AutomationConnection => !!connection)
      : [];
    return { nodes, connections };
  } catch {
    return null;
  }
}

export function serializeAutomationPipelineScript(pipeline: Pick<AutomationPipeline, "nodes" | "connections">) {
  const payload: AutomationScriptV1 = {
    automationScriptVersion: 1,
    nodes: pipeline.nodes,
    connections: pipeline.connections,
  };
  return JSON.stringify(payload, null, 2);
}

function isAutomationNodeKind(value: unknown): value is AutomationNodeKind {
  return (
    value === "event" ||
    value === "source" ||
    value === "condition" ||
    value === "compute" ||
    value === "external" ||
    value === "action"
  );
}

function sanitizeAutomationPorts(value: unknown, fallback: AutomationNodePort[]): AutomationNodePort[] {
  if (!Array.isArray(value)) return fallback;
  const ports = value
    .map((item): AutomationNodePort | null => {
      if (!item || typeof item !== "object") return null;
      const candidate = item as Partial<AutomationNodePort>;
      if (typeof candidate.id !== "string" || !candidate.id.trim()) return null;
      if (typeof candidate.label !== "string" || !candidate.label.trim()) return null;
      if (!isAutomationPortDataType(candidate.dataType)) return null;
      return {
        id: candidate.id.trim(),
        label: candidate.label.trim(),
        dataType: candidate.dataType,
      };
    })
    .filter((port): port is AutomationNodePort => !!port);
  return ports.length ? ports : fallback;
}

function isAutomationPortDataType(value: unknown): value is AutomationNodePort["dataType"] {
  return (
    value === "trigger" ||
    value === "viewer-state" ||
    value === "layer" ||
    value === "file" ||
    value === "url" ||
    value === "json" ||
    value === "any"
  );
}

function defaultCustomToolInputs(kind: AutomationNodeKind): AutomationNodePort[] {
  if (kind === "event") return [];
  if (kind === "source") return [TRIGGER_IN];
  return [TRIGGER_IN, DATA_IN];
}

function defaultCustomToolOutputs(kind: AutomationNodeKind): AutomationNodePort[] {
  if (kind === "action") return [];
  if (kind === "condition" || kind === "event") return [TRIGGER_OUT];
  return [TRIGGER_OUT, DATA_OUT];
}

export function buildAutomationGraphFromScript(script: string): Pick<AutomationPipeline, "nodes" | "connections"> {
  const richScript = parseRichAutomationScript(script);
  if (richScript) return richScript;

  const parsed = parseAutomationScript(script);
  const tokens = [
    ...parsed.eventNames,
    ...parsed.sourceNames,
    ...parsed.conditionNames,
    ...parsed.computeNames,
    ...parsed.externalNames,
    ...parsed.actionNames,
  ];
  const tokenCounts = new Map<AutomationTokenName, number>();
  const nodes = tokens.map((token, index): AutomationNode => {
    const libraryItem = AUTOMATION_LIBRARY.find((item) => item.token === token);
    const position = NODE_POSITIONS[token] ?? { x: 120 + index * 260, y: 160 };
    const occurrence = tokenCounts.get(token) ?? 0;
    tokenCounts.set(token, occurrence + 1);
    return {
      id: `${libraryItem?.kind ?? "node"}-${token}-${occurrence}`,
      kind: libraryItem?.kind ?? "action",
      label: libraryItem?.label ?? token,
      token,
      x: position.x + occurrence * 34,
      y: position.y + occurrence * 34,
      inputs: libraryItem?.inputs ?? [TRIGGER_IN],
      outputs: libraryItem?.outputs ?? [TRIGGER_OUT],
      config: libraryItem?.defaultConfig,
    };
  });

  return { nodes, connections: [] };
}

export function addAutomationTokenToScript(script: string, token: AutomationLibraryItem["token"]) {
  const item = AUTOMATION_LIBRARY.find((candidate) => candidate.token === token);
  const keyword =
    item?.kind === "event"
      ? "on"
      : item?.kind === "source"
      ? "source"
      : item?.kind === "condition"
      ? "if"
      : item?.kind === "compute"
      ? "compute"
      : item?.kind === "external"
      ? "external"
      : "do";
  const line = `${keyword} ${token}`;
  return `${script.trim()}\n${line}`.trim();
}

export function runAutomationPipelineForEvent(
  pipeline: AutomationPipeline,
  eventName: AutomationEventName,
  context: AutomationSelectionContext
): AutomationRunResult {
  const parsed = parseAutomationScript(pipeline.script);
  if (!pipeline.active || !pipeline.autoRun || !parsed.eventNames.includes(eventName)) {
    return {
      pipelineId: pipeline.id,
      pipelineName: pipeline.name,
      commands: [],
      message: "Pipeline is not listening for this event.",
    };
  }

  const conditionsPass = parsed.conditionNames.every((condition) => {
    if (condition === "selected.isAnnotation") return context.selectedLayerType === "annotation";
    if (condition === "selected.hasMetadata") return !!context.selectedAnnotationMetadata?.trim();
    if (condition === "selection.exists") return !!context.selectedNodeId;
    if (condition === "selection.isVisible") {
      return !!(
        context.selectedLayer &&
        typeof context.selectedLayer === "object" &&
        "visible" in context.selectedLayer &&
        (context.selectedLayer as { visible?: unknown }).visible !== false
      );
    }
    if (condition === "state.pathChanged") return !!context.stateChange?.changedPaths?.length;
    return true;
  });

  if (!conditionsPass) {
    return {
      pipelineId: pipeline.id,
      pipelineName: pipeline.name,
      commands: [],
      message: "Conditions did not pass.",
    };
  }

  const commands: AutomationAppCommand[] = [
    ...parsed.computeNames.filter((compute) => compute === "compute.browserFunction").map((compute) => {
      const node = pipeline.nodes.find((item) => item.token === compute);
      return {
        type: compute,
        label: node?.label ?? AUTOMATION_LIBRARY.find((item) => item.token === compute)?.label ?? compute,
        code: node?.config?.code ?? "",
      };
    }),
    ...parsed.externalNames.filter((external) => external === "external.httpRequest").map((external) => ({
      type: external,
      label: AUTOMATION_LIBRARY.find((item) => item.token === external)?.label ?? external,
    })),
    ...parsed.actionNames
      .filter(
        (action) =>
          action === "metadata.openSelectedAnnotation" ||
          action === "metadata.previewSelectedAnnotation" ||
          action === "inspector.expand" ||
          action === "inspector.collapse" ||
          action === "viewer.selectLayer" ||
          action === "viewer.setSelectedLayerVisibility" ||
          action === "viewer.toggleSelectedLayerVisibility" ||
          action === "viewer.setSelectedOpacity" ||
          action === "viewer.soloSelectedLayer" ||
          action === "camera.reset" ||
          action === "camera.setPreset" ||
          action === "camera.setPose" ||
          action === "camera.focusSelection" ||
          action === "slice.setPlane" ||
          action === "annotation.setSelectedMetadata" ||
          action === "annotation.appendSelectedMetadata" ||
          action === "annotation.selectNextByMetadata" ||
          action === "notify.toast" ||
          action === "viewer.setLayerVisibility"
      )
      .map((action) => {
        const node = pipeline.nodes.find((item) => item.token === action);
        if (action === "viewer.setLayerVisibility") {
          return { type: action, targetLayerId: node?.config?.targetLayerId, visible: node?.config?.visible };
        }
        if (action === "viewer.selectLayer") {
          return { type: action, targetLayerId: node?.config?.targetLayerId };
        }
        if (action === "viewer.setSelectedLayerVisibility") {
          return { type: action, visible: node?.config?.visible };
        }
        if (action === "viewer.setSelectedOpacity") {
          return { type: action, opacity: node?.config?.opacity };
        }
        if (action === "notify.toast") {
          return {
            type: action,
            title: node?.config?.title,
            message: node?.config?.message,
            tone: node?.config?.tone,
          };
        }
        if (action === "camera.setPreset") {
          return { type: action, preset: node?.config?.cameraPreset };
        }
        if (action === "camera.setPose") {
          return { type: action, poseJson: node?.config?.cameraPoseJson };
        }
        if (action === "slice.setPlane") {
          return { type: action, plane: node?.config?.plane };
        }
        if (action === "annotation.setSelectedMetadata" || action === "annotation.appendSelectedMetadata") {
          return { type: action, metadataText: node?.config?.metadataText };
        }
        if (action === "annotation.selectNextByMetadata") {
          return { type: action, metadataMode: node?.config?.metadataMode };
        }
        return { type: action };
      }),
  ];
  return {
    pipelineId: pipeline.id,
    pipelineName: pipeline.name,
    commands,
    message: commands.length ? `Ran ${commands.length} action${commands.length === 1 ? "" : "s"}.` : "No actions were defined.",
  };
}
