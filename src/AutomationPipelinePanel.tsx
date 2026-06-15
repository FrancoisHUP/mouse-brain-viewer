import { useEffect, useMemo, useRef, useState, type CSSProperties, type DragEvent as ReactDragEvent, type PointerEvent as ReactPointerEvent, type WheelEvent as ReactWheelEvent } from "react";
import {
  AUTOMATION_LIBRARY,
  buildAutomationGraphFromScript,
  createAutomationCustomTool,
  createEmptyAutomationPipeline,
  customToolToLibraryItem,
  serializeAutomationPipelineScript,
  type AutomationConnection,
  type AutomationCustomTool,
  type AutomationDebugSnapshot,
  type AutomationLibraryItem,
  type AutomationNode,
  type AutomationNodeKind,
  type AutomationNodePort,
  type AutomationPipeline,
} from "./automationTypes";
import {
  formatBrowserAutomationResult,
  runBrowserAutomationCode,
} from "./browserAutomationRuntime";
import {
  getAutomationNodeDefinition,
  validateAutomationPipelineRuntime,
  type AutomationValidationIssue,
  type AutomationConfigField,
} from "./automationNodeRegistry";
import { AUTOMATION_TEMPLATES } from "./automationTemplates";

const UI_FONT_FAMILY = "sans-serif";

type BuilderField = {
  key: string;
  label: string;
  type: "string" | "text" | "boolean" | "select";
  placeholder?: string;
  options?: Array<{ label: string; value: string | boolean }>;
  defaultValue?: string | boolean;
  description?: string;
};

type GuidedBuilderTemplate = {
  id: string;
  kind: AutomationNodeKind;
  domain: string;
  operation: string;
  summary: string;
  description: string;
  inputs: AutomationNodePort[];
  outputs: AutomationNodePort[];
  fields: BuilderField[];
  buildCode: (values: Record<string, string | boolean>) => string;
};

const BUILDER_TRIGGER_IN: AutomationNodePort = { id: "trigger-in", label: "In", dataType: "trigger" };
const BUILDER_TRIGGER_OUT: AutomationNodePort = { id: "trigger-out", label: "Next", dataType: "trigger" };
const BUILDER_DATA_IN: AutomationNodePort = { id: "data-in", label: "Data", dataType: "any" };
const BUILDER_DATA_OUT: AutomationNodePort = { id: "data-out", label: "Data", dataType: "any" };
const AUTOMATION_NODE_WIDTH = 210;
const AUTOMATION_NODE_HEIGHT = 104;
const AUTOMATION_GRAPH_PADDING = 220;

const GUIDED_TOOL_TEMPLATES: GuidedBuilderTemplate[] = [
  {
    id: "source-selection-node-info",
    kind: "source",
    domain: "Selection",
    operation: "Selected node info",
    summary: "Read selected node info",
    description: "Provides the selected node id, type, visibility, and annotation flags as data.",
    inputs: [BUILDER_TRIGGER_IN],
    outputs: [BUILDER_TRIGGER_OUT, BUILDER_DATA_OUT],
    fields: [],
    buildCode: () => `function run(input, context) {
  return {
    id: context.selection?.selectedNodeId ?? null,
    kind: context.selection?.selectedNodeKind ?? null,
    type: context.selection?.selectedLayerType ?? null,
    hasMetadata: !!context.selection?.selectedAnnotationMetadata,
    viewerState: context.selection?.viewerState ?? null
  };
}`,
  },
  {
    id: "source-annotation-text",
    kind: "source",
    domain: "Annotation",
    operation: "Metadata text",
    summary: "Read annotation metadata text",
    description: "Provides the selected annotation metadata as raw text.",
    inputs: [BUILDER_TRIGGER_IN],
    outputs: [BUILDER_TRIGGER_OUT, BUILDER_DATA_OUT],
    fields: [],
    buildCode: () => `function run(input, context) {
  return context.selection?.selectedAnnotationMetadata ?? "";
}`,
  },
  {
    id: "source-state-read-path",
    kind: "source",
    domain: "Viewer state",
    operation: "Read path",
    summary: "Read a value from viewer state",
    description: "Reads a nested value from the current viewer state using a dot path.",
    inputs: [BUILDER_TRIGGER_IN],
    outputs: [BUILDER_TRIGGER_OUT, BUILDER_DATA_OUT],
    fields: [{ key: "statePath", label: "State path", type: "string", placeholder: "scene.activeTool", defaultValue: "scene.activeTool" }],
    buildCode: (values) => `function run(input, context) {
  const path = ${JSON.stringify(String(values.statePath ?? ""))};
  const parts = path.split(".").filter(Boolean);
  let current = context.selection?.viewerState ?? null;
  for (const part of parts) {
    if (current == null) return null;
    current = current[part];
  }
  return current ?? null;
}`,
  },
  {
    id: "condition-keyboard-key",
    kind: "condition",
    domain: "Keyboard",
    operation: "Key matches",
    summary: "Only continue for one key",
    description: "Continues only when the keyboard event key matches.",
    inputs: [BUILDER_TRIGGER_IN, BUILDER_DATA_IN],
    outputs: [BUILDER_TRIGGER_OUT],
    fields: [{ key: "key", label: "Key", type: "string", placeholder: "r", defaultValue: "r" }],
    buildCode: (values) => `(context.keyboardEvent?.key ?? "").toLowerCase() === ${JSON.stringify(String(values.key ?? "").toLowerCase())}`,
  },
  {
    id: "condition-selection-exists",
    kind: "condition",
    domain: "Selection",
    operation: "Selection exists",
    summary: "Only continue when something is selected",
    description: "Continues only when a viewer selection exists.",
    inputs: [BUILDER_TRIGGER_IN, BUILDER_DATA_IN],
    outputs: [BUILDER_TRIGGER_OUT],
    fields: [],
    buildCode: () => `!!context.selectedNodeId`,
  },
  {
    id: "condition-selection-annotation",
    kind: "condition",
    domain: "Selection",
    operation: "Is annotation",
    summary: "Only continue for annotations",
    description: "Continues only when the current selection is an annotation.",
    inputs: [BUILDER_TRIGGER_IN, BUILDER_DATA_IN],
    outputs: [BUILDER_TRIGGER_OUT],
    fields: [],
    buildCode: () => `context.selectedLayerType === "annotation"`,
  },
  {
    id: "condition-state-path-equals",
    kind: "condition",
    domain: "Viewer state",
    operation: "Path equals text",
    summary: "Compare a viewer state value",
    description: "Continues only when a viewer state path equals the expected text value.",
    inputs: [BUILDER_TRIGGER_IN, BUILDER_DATA_IN],
    outputs: [BUILDER_TRIGGER_OUT],
    fields: [
      { key: "statePath", label: "State path", type: "string", placeholder: "scene.activeTool", defaultValue: "scene.activeTool" },
      { key: "expectedValue", label: "Expected text", type: "string", placeholder: "slice", defaultValue: "" },
    ],
    buildCode: (values) => `(() => {
  const path = ${JSON.stringify(String(values.statePath ?? ""))};
  const parts = path.split(".").filter(Boolean);
  let current = context.viewerState ?? null;
  for (const part of parts) {
    if (current == null) return false;
    current = current[part];
  }
  return String(current ?? "") === ${JSON.stringify(String(values.expectedValue ?? ""))};
})()`,
  },
  {
    id: "compute-text-template",
    kind: "compute",
    domain: "Text",
    operation: "Format message",
    summary: "Build text from the context",
    description: "Formats text with simple placeholders like {{selectedNodeId}} and {{stateChange.summary}}.",
    inputs: [BUILDER_TRIGGER_IN, BUILDER_DATA_IN],
    outputs: [BUILDER_TRIGGER_OUT, BUILDER_DATA_OUT],
    fields: [
      {
        key: "template",
        label: "Template",
        type: "text",
        defaultValue: "Selection: {{selectedNodeId}}",
        description: "Available placeholders: selectedNodeId, selectedLayerType, stateChange.summary, keyboardEvent.key, data",
      },
    ],
    buildCode: (values) => `function run(input, context) {
  const template = ${JSON.stringify(String(values.template ?? ""))};
  const tokens = {
    selectedNodeId: context.selection?.selectedNodeId ?? "",
    selectedLayerType: context.selection?.selectedLayerType ?? "",
    "stateChange.summary": context.selection?.stateChange?.summary ?? context.stateChange?.summary ?? "",
    "keyboardEvent.key": context.selection?.keyboardEvent?.key ?? context.keyboardEvent?.key ?? "",
    data: typeof context.data === "string" ? context.data : JSON.stringify(context.data ?? "")
  };
  return template.replace(/\\{\\{\\s*([^}]+?)\\s*\\}\\}/g, (_, key) => String(tokens[key] ?? ""));
}`,
  },
  {
    id: "compute-json-pick-path",
    kind: "compute",
    domain: "Data",
    operation: "Pick JSON path",
    summary: "Extract a nested value",
    description: "Extracts a nested value from the routed input data using a dot path.",
    inputs: [BUILDER_TRIGGER_IN, BUILDER_DATA_IN],
    outputs: [BUILDER_TRIGGER_OUT, BUILDER_DATA_OUT],
    fields: [{ key: "jsonPath", label: "JSON path", type: "string", placeholder: "foo.bar.0.name", defaultValue: "" }],
    buildCode: (values) => `function run(input) {
  const path = ${JSON.stringify(String(values.jsonPath ?? ""))};
  const parts = path.split(".").filter(Boolean);
  let current = input;
  for (const part of parts) {
    if (current == null) return null;
    current = current[part];
  }
  return current ?? null;
}`,
  },
  {
    id: "compute-state-summary",
    kind: "compute",
    domain: "Viewer state",
    operation: "Change summary",
    summary: "Format the last state change",
    description: "Returns the last state change summary with paths and details.",
    inputs: [BUILDER_TRIGGER_IN, BUILDER_DATA_IN],
    outputs: [BUILDER_TRIGGER_OUT, BUILDER_DATA_OUT],
    fields: [],
    buildCode: () => `function run(input, context) {
  return context.selection?.stateChange ?? {
    summary: "Viewer state changed.",
    details: [],
    changedPaths: []
  };
}`,
  },
  {
    id: "action-notify-note",
    kind: "action",
    domain: "Notification",
    operation: "Show info note",
    summary: "Show a simple note",
    description: "Shows an info toast using the returned text.",
    inputs: [BUILDER_TRIGGER_IN, BUILDER_DATA_IN],
    outputs: [],
    fields: [{ key: "message", label: "Message", type: "text", defaultValue: "Automation ran." }],
    buildCode: (values) => `function run(input) {
  return typeof input === "string" && input ? input : ${JSON.stringify(String(values.message ?? "Automation ran."))};
}`,
  },
];

function getBuilderTemplate(templateId: string | null) {
  return GUIDED_TOOL_TEMPLATES.find((template) => template.id === templateId) ?? GUIDED_TOOL_TEMPLATES[0];
}

function getTemplateDefaultValues(template: GuidedBuilderTemplate) {
  return Object.fromEntries(template.fields.map((field) => [field.key, field.defaultValue ?? (field.type === "boolean" ? false : "")])) as Record<string, string | boolean>;
}

type Props = {
  open: boolean;
  pipelines: AutomationPipeline[];
  activePipelineId: string | null;
  customTools: AutomationCustomTool[];
  onPipelinesChange: (pipelines: AutomationPipeline[]) => void;
  onCustomToolsChange: (tools: AutomationCustomTool[]) => void;
  onActivePipelineIdChange: (pipelineId: string) => void;
  onRunPipeline: (pipeline: AutomationPipeline) => Promise<{ status: "success" | "error" | "stopped" | "info" }> | { status: "success" | "error" | "stopped" | "info" };
  debug: AutomationDebugSnapshot;
  onResumeDebug: () => void;
  onStopDebug: () => void;
};

function NodeCard({
  node,
  renderX,
  renderY,
  selected,
  debugState,
  onPointerDown,
  onStartConnection,
  onStartRewireConnection,
  onConfigure,
  onDelete,
  onToggleBreakpoint,
  validationIssues,
  connections,
}: {
  node: AutomationNode;
  renderX: number;
  renderY: number;
  selected: boolean;
  debugState?: AutomationDebugSnapshot["nodeStates"][string];
  validationIssues: AutomationValidationIssue[];
  connections: AutomationConnection[];
  onPointerDown: (event: ReactPointerEvent<HTMLDivElement>, node: AutomationNode) => void;
  onStartConnection: (event: ReactPointerEvent<HTMLElement>, node: AutomationNode, port: AutomationNodePort) => void;
  onStartRewireConnection: (event: ReactPointerEvent<HTMLElement>, connection: AutomationConnection) => void;
  onConfigure: (node: AutomationNode) => void;
  onDelete: (node: AutomationNode) => void;
  onToggleBreakpoint: (node: AutomationNode) => void;
}) {
  const accent = getNodeAccent(node.kind);
  const debugStyle = getDebugNodeStyle(debugState?.status, accent);
  const firstError = validationIssues.find((issue) => issue.level === "error");
  const firstWarning = validationIssues.find((issue) => issue.level === "warning");
  const validationIssue = firstError ?? firstWarning;
  return (
    <div
      onPointerDown={(event) => onPointerDown(event, node)}
      onDoubleClick={() => onConfigure(node)}
      style={{
        position: "absolute",
        left: renderX,
        top: renderY,
        width: 210,
        minHeight: 104,
        borderRadius: 8,
        border: debugStyle.border ?? (selected ? `1px solid ${accent}` : `1px solid ${accent}88`),
        background: debugStyle.background ?? (selected ? "rgba(23,30,39,0.98)" : "rgba(15,18,24,0.94)"),
        boxShadow: debugStyle.boxShadow ?? (selected ? `0 0 0 2px ${accent}33, 0 16px 34px rgba(0,0,0,0.36)` : "0 12px 28px rgba(0,0,0,0.30)"),
        color: "white",
        padding: 12,
        display: "grid",
        gap: 7,
        fontFamily: UI_FONT_FAMILY,
        cursor: "grab",
        pointerEvents: "auto",
        zIndex: 2,
        userSelect: "none",
      }}
    >
      <span style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <span style={{ fontSize: 11, fontWeight: 900, color: accent, textTransform: "uppercase" }}>{node.kind}</span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
          {validationIssue ? (
            <span
              title={validationIssue.message}
              style={getNodeValidationBadgeStyle(validationIssue.level)}
            >
              !
            </span>
          ) : null}
          <button
            type="button"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              onToggleBreakpoint(node);
            }}
            title={node.config?.breakpoint ? "Remove breakpoint" : "Add breakpoint"}
            aria-label={node.config?.breakpoint ? `Remove breakpoint from ${node.label}` : `Add breakpoint to ${node.label}`}
            style={getBreakpointButtonStyle(!!node.config?.breakpoint)}
          />
        {selected ? (
          <button
            type="button"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              onDelete(node);
            }}
            title="Delete node"
            aria-label={`Delete ${node.label}`}
            style={nodeDeleteButtonStyle}
          >
            <TrashIcon />
          </button>
        ) : (
          <span style={{ width: 22, height: 22, borderRadius: 7, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
            <span style={{ width: 9, height: 9, borderRadius: 99, background: debugStyle.dotColor ?? accent }} />
          </span>
        )}
        </span>
      </span>
      <span style={{ fontSize: 13, fontWeight: 900, lineHeight: 1.25 }}>{node.label}</span>
      <span style={{ fontSize: 11, color: "rgba(255,255,255,0.58)", lineHeight: 1.25 }}>{node.token}</span>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 2 }}>
        <div style={portGroupStyle}>
          {node.inputs.length ? node.inputs.map((port) => {
            const connectedConnection = connections.find((connection) => connection.toNodeId === node.id && connection.toPortId === port.id);
            return (
              <span
                key={port.id}
              data-automation-port-role="input"
              data-automation-node-id={node.id}
              data-automation-port-id={port.id}
                title={connectedConnection ? "Drag to unplug or rewire" : `Connect to ${port.label}`}
                onPointerDown={connectedConnection ? (event) => onStartRewireConnection(event, connectedConnection) : undefined}
                style={getInputPortStyle(port.dataType, !!connectedConnection)}
            >
                <span data-automation-port-connector="true" style={getInputSocketStyle(port.dataType, !!connectedConnection)}>
                  {connectedConnection ? <span style={getInputSocketDotStyle(port.dataType)} /> : null}
                </span>
                {port.label}
              </span>
            );
          }) : <span style={emptyPortStyle}>No inputs</span>}
        </div>
        <div style={{ ...portGroupStyle, justifyItems: "end" }}>
          {node.outputs.length ? node.outputs.map((port) => (
            <span
              key={port.id}
              data-automation-port-role="output"
              data-automation-node-id={node.id}
              data-automation-port-id={port.id}
              onPointerDown={(event) => onStartConnection(event, node, port)}
              title={`Drag to connect ${port.label}`}
              style={getOutputPortStyle(port.dataType)}
            >
              {port.label}
              <span data-automation-port-connector="true" style={getOutputConnectorStyle(port.dataType)} />
            </span>
          )) : <span style={emptyPortStyle}>No outputs</span>}
        </div>
      </div>
      {debugState?.status && debugState.status !== "idle" ? (
        <span style={{ fontSize: 10, fontWeight: 900, color: debugStyle.labelColor ?? "rgba(255,255,255,0.68)", textTransform: "uppercase" }}>
          {debugState.status}
        </span>
      ) : null}
    </div>
  );
}

const LIBRARY_SECTIONS: Array<{ kind: AutomationLibraryItem["kind"]; title: string }> = [
  { kind: "event", title: "Events" },
  { kind: "source", title: "Sources" },
  { kind: "condition", title: "Conditions" },
  { kind: "compute", title: "Browser compute" },
  { kind: "external", title: "External compute" },
  { kind: "action", title: "Viewer actions" },
];

function PlusIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </svg>
  );
}

function PlayIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M8 5.5v13l10-6.5z" />
    </svg>
  );
}

function LoaderIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{ animation: "automation-spin 850ms linear infinite" }}>
      <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="2" opacity="0.25" />
      <path d="M20 12a8 8 0 0 0-8-8" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  );
}

function AutoIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M13 2L5 14h6l-1 8 9-13h-6z" />
    </svg>
  );
}

function MoreIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <circle cx="12" cy="5" r="1.8" />
      <circle cx="12" cy="12" r="1.8" />
      <circle cx="12" cy="19" r="1.8" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
      <path d="M6 6l12 12" />
      <path d="M18 6L6 18" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 6h18" />
      <path d="M8 6V4h8v2" />
      <path d="M19 6l-1 14H6L5 6" />
      <path d="M10 11v5" />
      <path d="M14 11v5" />
    </svg>
  );
}

function CopyIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="8" y="8" width="11" height="11" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 6L9 17l-5-5" />
    </svg>
  );
}

function PauseIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <rect x="7" y="5.5" width="3.5" height="13" rx="1.2" />
      <rect x="13.5" y="5.5" width="3.5" height="13" rx="1.2" />
    </svg>
  );
}

function StopIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <rect x="7" y="7" width="10" height="10" rx="2.2" />
    </svg>
  );
}

function RunButtonIcon({ status }: { status: string }) {
  if (status === "running") return <StopIcon />;
  if (status === "paused") return <PauseIcon />;
  return <PlayIcon />;
}

function RunButtonLoaderRing() {
  return (
    <span style={runButtonLoaderRingStyle} aria-hidden="true">
      <LoaderIcon />
    </span>
  );
}

function RunButtonStatusDot({ status }: { status: string }) {
  const color =
    status === "paused"
      ? "#f3cd63"
      : status === "success"
      ? "#67d98f"
      : status === "error"
      ? "#ff7a7a"
      : null;

  if (!color) return null;
  return <span style={{ ...runStatusDotStyle, background: color, boxShadow: `0 0 0 2px rgba(12,14,18,0.92), 0 0 0 1px ${color}55` }} aria-hidden="true" />;
}

function ScriptIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M8 7l-4 5 4 5" />
      <path d="M16 7l4 5-4 5" />
      <path d="M14 4l-4 16" />
    </svg>
  );
}

function NodeInspectIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="4" y="4" width="16" height="16" rx="3" />
      <path d="M9 9h6" />
      <path d="M9 12h6" />
      <path d="M9 15h4" />
    </svg>
  );
}

function RouteIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="6" cy="12" r="2" />
      <circle cx="18" cy="6" r="2" />
      <circle cx="18" cy="18" r="2" />
      <path d="M8 12h4a4 4 0 0 0 4-4" />
      <path d="M8 12h4a4 4 0 0 1 4 4" />
    </svg>
  );
}

function InputIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 12H8" />
      <path d="M12 16l-4-4 4-4" />
      <rect x="3" y="5" width="3" height="14" rx="1.5" />
    </svg>
  );
}

function OutputIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 12h12" />
      <path d="M12 8l4 4-4 4" />
      <rect x="18" y="5" width="3" height="14" rx="1.5" />
    </svg>
  );
}

function MemoryIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="6" y="6" width="12" height="12" rx="2" />
      <path d="M9 3v3" />
      <path d="M15 3v3" />
      <path d="M9 18v3" />
      <path d="M15 18v3" />
      <path d="M3 9h3" />
      <path d="M3 15h3" />
      <path d="M18 9h3" />
      <path d="M18 15h3" />
    </svg>
  );
}

function PanelIcon({ side }: { side: "left" | "right" }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d={side === "left" ? "M9 4v16" : "M15 4v16"} />
    </svg>
  );
}

export default function AutomationPipelinePanel({
  open,
  pipelines,
  activePipelineId,
  customTools,
  onPipelinesChange,
  onCustomToolsChange,
  onActivePipelineIdChange,
  onRunPipeline,
  debug,
  onResumeDebug,
  onStopDebug,
}: Props) {
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const canvasDragRef = useRef<{ pointerId: number; startX: number; startY: number; originX: number; originY: number } | null>(null);
  const nodeDragRef = useRef<{ pointerId: number; nodeId: string; startX: number; startY: number; originX: number; originY: number } | null>(null);
  const renameInputRef = useRef<HTMLInputElement | null>(null);
  const [canvasView, setCanvasView] = useState({ x: 34, y: 34, scale: 1 });
  const [portAnchors, setPortAnchors] = useState<Record<string, { x: number; y: number }>>({});
  const [portAnchorOffsets, setPortAnchorOffsets] = useState<Record<string, { x: number; y: number }>>({});
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [leftPanelOpen, setLeftPanelOpen] = useState(true);
  const [rightPanelOpen, setRightPanelOpen] = useState(true);
  const [workspaceView, setWorkspaceView] = useState<"graph" | "script">("graph");
  const [nodeSearch, setNodeSearch] = useState("");
  const [nodeCategory, setNodeCategory] = useState<AutomationLibraryItem["kind"] | "all" | "custom">("all");
  const [rightPanelMode, setRightPanelMode] = useState<"library" | "create-tool">("library");
  const [customToolDraft, setCustomToolDraft] = useState(() => createAutomationCustomTool());
  const [toolBuilderMode, setToolBuilderMode] = useState<"guided" | "scripted">("guided");
  const [guidedTemplateId, setGuidedTemplateId] = useState<string>(() => GUIDED_TOOL_TEMPLATES[0]?.id ?? "");
  const [guidedValues, setGuidedValues] = useState<Record<string, string | boolean>>(() => getTemplateDefaultValues(GUIDED_TOOL_TEMPLATES[0]));
  const [editingCustomToolId, setEditingCustomToolId] = useState<string | null>(null);
  const [openCustomToolMenuId, setOpenCustomToolMenuId] = useState<string | null>(null);
  const [pendingDeleteCustomToolId, setPendingDeleteCustomToolId] = useState<string | null>(null);
  const [scriptCopied, setScriptCopied] = useState(false);
  const [templateMenuOpen, setTemplateMenuOpen] = useState(false);
  const [openPipelineMenuId, setOpenPipelineMenuId] = useState<string | null>(null);
  const [pipelineMenuPosition, setPipelineMenuPosition] = useState<{ top: number; right: number } | null>(null);
  const [runningPipelineId, setRunningPipelineId] = useState<string | null>(null);
  const [pipelineRunOutcome, setPipelineRunOutcome] = useState<Record<string, "success" | "error" | undefined>>({});
  const [renamingPipelineId, setRenamingPipelineId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [editingPipelineDetailsId, setEditingPipelineDetailsId] = useState<string | null>(null);
  const [pipelineDetailsNameDraft, setPipelineDetailsNameDraft] = useState("");
  const [pipelineDetailsDescriptionDraft, setPipelineDetailsDescriptionDraft] = useState("");
  const [pendingDeletePipelineId, setPendingDeletePipelineId] = useState<string | null>(null);
  const [codeEditorNodeId, setCodeEditorNodeId] = useState<string | null>(null);
  const [codeDraft, setCodeDraft] = useState("");
  const [codeRunResult, setCodeRunResult] = useState<string | null>(null);
  const [codeRunError, setCodeRunError] = useState<string | null>(null);
  const [isCodeRunning, setIsCodeRunning] = useState(false);
  const [configEditorNodeId, setConfigEditorNodeId] = useState<string | null>(null);
  const [configDraft, setConfigDraft] = useState<Record<string, string | boolean>>({});
  const [selectedConnectionId, setSelectedConnectionId] = useState<string | null>(null);
  const [connectionDraft, setConnectionDraft] = useState<{
    fromNodeId: string;
    fromPortId: string;
    mode: AutomationConnection["mode"];
    dataType: AutomationNodePort["dataType"];
    existingConnectionId?: string;
    startX: number;
    startY: number;
    currentX: number;
    currentY: number;
    targetNodeId?: string;
    targetPortId?: string;
    targetX?: number;
    targetY?: number;
  } | null>(null);
  const [libraryDrag, setLibraryDrag] = useState<{
    item: AutomationLibraryItem;
    point: { x: number; y: number } | null;
  } | null>(null);
  const fallbackPipeline = useMemo(
    () => createEmptyAutomationPipeline("Untitled pipeline"),
    []
  );
  const activePipeline =
    pipelines.find((pipeline) => pipeline.id === activePipelineId) ??
    pipelines[0] ??
    fallbackPipeline;
  const automationLibrary = useMemo(
    () => [...AUTOMATION_LIBRARY, ...customTools.map(customToolToLibraryItem)],
    [customTools]
  );
  const guidedTemplate = useMemo(() => getBuilderTemplate(guidedTemplateId), [guidedTemplateId]);
  const guidedKinds = useMemo(() => Array.from(new Set(GUIDED_TOOL_TEMPLATES.map((template) => template.kind))), []);
  const guidedDomains = useMemo(
    () => Array.from(new Set(GUIDED_TOOL_TEMPLATES.filter((template) => template.kind === customToolDraft.kind).map((template) => template.domain))),
    [customToolDraft.kind]
  );
  const guidedOperations = useMemo(
    () => GUIDED_TOOL_TEMPLATES.filter((template) => template.kind === customToolDraft.kind && template.domain === guidedTemplate.domain),
    [customToolDraft.kind, guidedTemplate.domain]
  );
  const librarySections = useMemo(
    () => {
      const normalizedSearch = nodeSearch.trim().toLowerCase();
      return LIBRARY_SECTIONS.filter((section) => nodeCategory === "all" || nodeCategory === "custom" || section.kind === nodeCategory)
        .map((section) => ({
          ...section,
          items: automationLibrary.filter((item) => {
            const isCustomTool = item.token.startsWith("custom.");
            if (item.kind !== section.kind) return false;
            if (nodeCategory === "custom" && !isCustomTool) return false;
            if (!normalizedSearch) return true;
            return `${item.label} ${item.description} ${item.kind} ${item.token}`
              .toLowerCase()
              .includes(normalizedSearch);
          }),
        }))
        .filter((section) => section.items.length > 0);
    },
    [automationLibrary, nodeCategory, nodeSearch]
  );
  const codeEditorNode = codeEditorNodeId ? activePipeline.nodes.find((node) => node.id === codeEditorNodeId) ?? null : null;
  const configEditorNode = configEditorNodeId ? activePipeline.nodes.find((node) => node.id === configEditorNodeId) ?? null : null;
  const configEditorDefinition = configEditorNode ? getAutomationNodeDefinition(configEditorNode.token) : null;
  const validationIssues = useMemo(() => validateAutomationPipelineRuntime(activePipeline), [activePipeline]);
  const selectedConnection = selectedConnectionId ? activePipeline.connections.find((connection) => connection.id === selectedConnectionId) ?? null : null;
  const selectedConnectionPacket = selectedConnectionId ? debug.connectionPackets[selectedConnectionId] : undefined;
  const selectedConnectionIssue = selectedConnectionId
    ? validationIssues.find((issue) => issue.connectionId === selectedConnectionId)
    : undefined;
  const debugMemoryEntries = Object.entries(debug.memoryStore ?? {});
  const debugInspectorNodeId = debug.pausedNodeId ?? debug.activeNodeId ?? selectedNodeId;
  const debugInspectorNode = debugInspectorNodeId
    ? activePipeline.nodes.find((node) => node.id === debugInspectorNodeId) ?? null
    : null;
  const debugInspectorState = debugInspectorNodeId ? debug.nodeStates[debugInspectorNodeId] : null;
  const activeConnectionPacket = debug.activeConnectionId ? debug.connectionPackets[debug.activeConnectionId] : undefined;
  const activePipelineRunStatus = getPipelineRowRunStatus(activePipeline, debug, runningPipelineId, pipelineRunOutcome[activePipeline.id]);
  const graphBounds = useMemo(() => {
    const xs: number[] = [];
    const ys: number[] = [];

    activePipeline.nodes.forEach((node) => {
      xs.push(node.x, node.x + AUTOMATION_NODE_WIDTH);
      ys.push(node.y, node.y + AUTOMATION_NODE_HEIGHT);
    });

    if (connectionDraft) {
      xs.push(connectionDraft.startX, connectionDraft.currentX);
      ys.push(connectionDraft.startY, connectionDraft.currentY);
    }

    const minX = (xs.length ? Math.min(...xs) : 0) - AUTOMATION_GRAPH_PADDING;
    const minY = (ys.length ? Math.min(...ys) : 0) - AUTOMATION_GRAPH_PADDING;
    const maxX = (xs.length ? Math.max(...xs) : 1280) + AUTOMATION_GRAPH_PADDING;
    const maxY = (ys.length ? Math.max(...ys) : 820) + AUTOMATION_GRAPH_PADDING;

    return {
      minX,
      minY,
      width: Math.max(1600, maxX - minX),
      height: Math.max(1100, maxY - minY),
    };
  }, [activePipeline.nodes, connectionDraft]);

  useEffect(() => {
    if (!activePipeline || workspaceView !== "graph") return;
    let frame = 0;
    let frame2 = 0;
    frame = window.requestAnimationFrame(() => {
      frame2 = window.requestAnimationFrame(measurePortAnchors);
    });
    return () => {
      window.cancelAnimationFrame(frame);
      window.cancelAnimationFrame(frame2);
    };
  }, [activePipeline, workspaceView, canvasView.x, canvasView.y, canvasView.scale, selectedNodeId, selectedConnectionId, debug.activeNodeId, debug.pausedNodeId, graphBounds.minX, graphBounds.minY, graphBounds.width, graphBounds.height]);

  useEffect(() => {
    if (activePipeline.nodes.some((node) => node.id === selectedNodeId)) return;
    setSelectedNodeId(null);
  }, [activePipeline.id, activePipeline.nodes, selectedNodeId]);

  function updatePipeline(pipelineId: string, updater: (pipeline: AutomationPipeline) => AutomationPipeline) {
    onPipelinesChange(
      pipelines.map((pipeline) => {
        if (pipeline.id !== pipelineId) return pipeline;
        const next = updater(pipeline);
        const graph = buildAutomationGraphFromScript(next.script);
        const usedPreviousIds = new Set<string>();
        const nodes = graph.nodes.map((node) => {
          const previous =
            next.nodes.find((item) => item.id === node.id) ??
            pipeline.nodes.find((item) => item.id === node.id) ??
            pipeline.nodes.find((item) => item.token === node.token && !usedPreviousIds.has(item.id));
          if (previous) usedPreviousIds.add(previous.id);
          return {
            ...node,
            x: previous?.x ?? node.x,
            y: previous?.y ?? node.y,
            config: previous?.config ?? node.config,
          };
        });
        return {
          ...next,
          nodes,
          connections: next.connections.filter((connection) => {
            const from = nodes.find((node) => node.id === connection.fromNodeId);
            const to = nodes.find((node) => node.id === connection.toNodeId);
            return !!from && !!to;
          }),
          updatedAt: Date.now(),
        };
      })
    );
  }

  function updateNodeConfig(nodeId: string, patch: NonNullable<AutomationNode["config"]>) {
    updatePipeline(activePipeline.id, (pipeline) => ({
      ...pipeline,
      nodes: pipeline.nodes.map((node) =>
        node.id === nodeId ? { ...node, config: { ...(node.config ?? {}), ...patch } } : node
      ),
    }));
  }

  function toggleNodeBreakpoint(node: AutomationNode) {
    updateNodeConfig(node.id, { breakpoint: !node.config?.breakpoint });
    setSelectedNodeId(node.id);
  }

  function updateNodePosition(nodeId: string, x: number, y: number) {
    updatePipeline(activePipeline.id, (pipeline) => ({
      ...pipeline,
      nodes: pipeline.nodes.map((node) =>
        node.id === nodeId ? { ...node, x: Math.round(x), y: Math.round(y) } : node
      ),
    }));
  }

  function getPortAnchorKey(nodeId: string, portId: string | undefined, side: "input" | "output") {
    return `${side}:${nodeId}:${portId ?? ""}`;
  }

  function portAnchorsEqual(
    first: Record<string, { x: number; y: number }>,
    second: Record<string, { x: number; y: number }>
  ) {
    const firstKeys = Object.keys(first);
    const secondKeys = Object.keys(second);
    if (firstKeys.length !== secondKeys.length) return false;
    return firstKeys.every((key) => {
      const a = first[key];
      const b = second[key];
      return !!b && Math.abs(a.x - b.x) < 0.35 && Math.abs(a.y - b.y) < 0.35;
    });
  }

  function measurePortAnchors() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const canvasRect = canvas.getBoundingClientRect();
    const nextAnchors: Record<string, { x: number; y: number }> = {};
    const nextOffsets: Record<string, { x: number; y: number }> = {};
    const connectors = canvas.querySelectorAll<HTMLElement>("[data-automation-port-connector='true']");

    connectors.forEach((connector) => {
      const portElement = connector.closest<HTMLElement>("[data-automation-port-role]");
      const nodeId = portElement?.dataset.automationNodeId;
      const portId = portElement?.dataset.automationPortId;
      const role = portElement?.dataset.automationPortRole;
      if (!nodeId || !portId || (role !== "input" && role !== "output")) return;
      const node = activePipeline.nodes.find((item) => item.id === nodeId);
      if (!node) return;
      const connectorRect = connector.getBoundingClientRect();
      const key = getPortAnchorKey(nodeId, portId, role);
      const anchor = {
        x: (connectorRect.left + connectorRect.width / 2 - canvasRect.left - canvasView.x) / canvasView.scale + graphBounds.minX,
        y: (connectorRect.top + connectorRect.height / 2 - canvasRect.top - canvasView.y) / canvasView.scale + graphBounds.minY,
      };
      nextAnchors[key] = anchor;
      nextOffsets[key] = {
        x: anchor.x - node.x,
        y: anchor.y - node.y,
      };
    });

    setPortAnchors((current) => (portAnchorsEqual(current, nextAnchors) ? current : nextAnchors));
    setPortAnchorOffsets((current) => (portAnchorsEqual(current, nextOffsets) ? current : nextOffsets));
  }

  function getGraphPoint(clientX: number, clientY: number) {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return {
      x: (clientX - rect.left - canvasView.x) / canvasView.scale + graphBounds.minX,
      y: (clientY - rect.top - canvasView.y) / canvasView.scale + graphBounds.minY,
    };
  }

  function toRenderPoint(point: { x: number; y: number }) {
    return {
      x: point.x - graphBounds.minX,
      y: point.y - graphBounds.minY,
    };
  }

  function getPortAnchor(node: AutomationNode, portId: string | undefined, side: "input" | "output") {
    const key = getPortAnchorKey(node.id, portId, side);
    const measuredOffset = portAnchorOffsets[key];
    if (measuredOffset) {
      return {
        x: node.x + measuredOffset.x,
        y: node.y + measuredOffset.y,
      };
    }

    const measuredAnchor = portAnchors[key];
    if (measuredAnchor) return measuredAnchor;

    const ports = side === "input" ? node.inputs : node.outputs;
    const portIndex = ports.findIndex((port) => port.id === portId);
    const index = portIndex >= 0 ? portIndex : 0;
    const portCount = Math.max(1, ports.length);

    return {
      x: node.x + (side === "output" ? 196 : 24),
      y: node.y + 94 + (index - (portCount - 1) / 2) * 25,
    };
  }

  function canConnectPortTypes(fromType: AutomationNodePort["dataType"], toType: AutomationNodePort["dataType"]) {
    if (fromType === "any" || toType === "any") return true;
    return fromType === toType;
  }

  function findConnectionSnapTarget(
    point: { x: number; y: number },
    draft: NonNullable<typeof connectionDraft>
  ) {
    const candidates = activePipeline.nodes.flatMap((node) =>
      node.id === draft.fromNodeId
        ? []
        : node.inputs.map((port) => {
            const anchor = getPortAnchor(node, port.id, "input");
            const distance = Math.hypot(point.x - anchor.x, point.y - anchor.y);
            const compatible = canConnectPortTypes(draft.dataType, port.dataType);
            return { node, port, anchor, distance, compatible };
          })
    );
    const nearest = candidates
      .filter((candidate) => candidate.compatible)
      .sort((a, b) => a.distance - b.distance)[0];
    if (!nearest || nearest.distance > 28) return null;
    return nearest;
  }

  function addConnection(connection: AutomationConnection) {
    updatePipeline(activePipeline.id, (pipeline) => {
      const connections = [
        ...pipeline.connections.filter(
          (existing) =>
            existing.id !== connection.id &&
            !(
              existing.fromNodeId === connection.fromNodeId &&
              existing.fromPortId === connection.fromPortId &&
              existing.toNodeId === connection.toNodeId &&
              existing.toPortId === connection.toPortId
            )
        ),
        connection,
      ];
      return {
        ...pipeline,
        connections,
        script: serializeAutomationPipelineScript({ nodes: pipeline.nodes, connections }),
      };
    });
  }

  function removeConnection(connectionId: string) {
    updatePipeline(activePipeline.id, (pipeline) => {
      const connections = pipeline.connections.filter((connection) => connection.id !== connectionId);
      return {
        ...pipeline,
        connections,
        script: serializeAutomationPipelineScript({ nodes: pipeline.nodes, connections }),
      };
    });
    setSelectedConnectionId((current) => (current === connectionId ? null : current));
  }

  function addLibraryNodeAt(item: AutomationLibraryItem, point: { x: number; y: number }) {
    const now = Date.now();
    const node: AutomationNode = {
      id: `node-${item.token.replace(/\W+/g, "-")}-${now}-${Math.random().toString(36).slice(2, 7)}`,
      kind: item.kind,
      label: item.label,
      token: item.token,
      x: Math.round(point.x - 105),
      y: Math.round(point.y - 52),
      inputs: item.inputs,
      outputs: item.outputs,
      config: { ...(item.defaultConfig ?? {}) },
    };
    updatePipeline(activePipeline.id, (pipeline) => {
      const nodes = [...pipeline.nodes, node];
      const nextGraph = { nodes, connections: pipeline.connections };
      return {
        ...pipeline,
        nodes,
        script: serializeAutomationPipelineScript(nextGraph),
      };
    });
    setSelectedNodeId(node.id);
    setSelectedConnectionId(null);
  }

  function handleStartConnection(
    event: ReactPointerEvent<HTMLElement>,
    node: AutomationNode,
    port: AutomationNodePort
  ) {
    if (event.button !== 0) return;
    event.stopPropagation();
    const start = getPortAnchor(node, port.id, "output");
    setSelectedNodeId(node.id);
    setConnectionDraft({
      fromNodeId: node.id,
      fromPortId: port.id,
      mode: port.dataType === "trigger" ? "trigger" : "data",
      dataType: port.dataType,
      startX: start.x,
      startY: start.y,
      currentX: start.x,
      currentY: start.y,
    });
  }

  function handleStartRewireConnection(
    event: ReactPointerEvent<HTMLElement | SVGPathElement>,
    connection: AutomationConnection
  ) {
    if (event.button !== 0) return;
    event.stopPropagation();
    const from = activePipeline.nodes.find((node) => node.id === connection.fromNodeId);
    const port = from?.outputs.find((item) => item.id === connection.fromPortId);
    if (!from || !port) return;
    const start = getPortAnchor(from, port.id, "output");
    const to = activePipeline.nodes.find((node) => node.id === connection.toNodeId);
    const end = to ? getPortAnchor(to, connection.toPortId, "input") : start;
    setSelectedNodeId(null);
    setSelectedConnectionId(connection.id);
    setConnectionDraft({
      fromNodeId: from.id,
      fromPortId: port.id,
      mode: connection.mode,
      dataType: port.dataType,
      existingConnectionId: connection.id,
      startX: start.x,
      startY: start.y,
      currentX: end.x,
      currentY: end.y,
      targetNodeId: connection.toNodeId,
      targetPortId: connection.toPortId,
      targetX: end.x,
      targetY: end.y,
    });
  }

  function openCodeEditor(node: AutomationNode) {
    setCodeEditorNodeId(node.id);
    setCodeDraft(node.config?.code ?? "");
    setCodeRunResult(null);
    setCodeRunError(null);
  }

  function openConfigEditor(node: AutomationNode) {
    const definition = getAutomationNodeDefinition(node.token);
    if (!definition?.configFields.length) return;
    setConfigEditorNodeId(node.id);
    setConfigDraft(
      Object.fromEntries(
        definition.configFields.map((field) => {
          const value = node.config?.[field.key] ?? definition.defaultConfig?.[field.key] ?? "";
          return [field.key, typeof value === "boolean" ? value : String(value ?? "")];
        })
      )
    );
  }

  function configureNode(node: AutomationNode) {
    if (node.token === "compute.browserFunction" || node.token.startsWith("custom.")) {
      openCodeEditor(node);
      return;
    }
    if (getAutomationNodeDefinition(node.token)?.configFields.length) {
      openConfigEditor(node);
      return;
    }
    setSelectedNodeId(node.id);
  }

  function closeConfigEditor() {
    setConfigEditorNodeId(null);
    setConfigDraft({});
  }

  function saveConfigEditor() {
    if (!configEditorNodeId) return;
    updateNodeConfig(configEditorNodeId, configDraft);
    closeConfigEditor();
  }

  function updateConfigDraft(field: AutomationConfigField, value: string | boolean) {
    setConfigDraft((current) => ({ ...current, [field.key]: value }));
  }

  function deleteNode(node: AutomationNode) {
    setSelectedNodeId(null);
    updatePipeline(activePipeline.id, (pipeline) => ({
      ...pipeline,
      script: serializeAutomationPipelineScript({
        nodes: pipeline.nodes.filter((item) => item.id !== node.id),
        connections: pipeline.connections.filter(
          (connection) => connection.fromNodeId !== node.id && connection.toNodeId !== node.id
        ),
      }),
      connections: pipeline.connections.filter(
        (connection) => connection.fromNodeId !== node.id && connection.toNodeId !== node.id
      ),
    }));
  }

  async function copyScript() {
    try {
      await navigator.clipboard.writeText(serializeAutomationPipelineScript(activePipeline));
      setScriptCopied(true);
      window.setTimeout(() => setScriptCopied(false), 1400);
    } catch {
      setScriptCopied(false);
    }
  }

  function closeCodeEditor() {
    setCodeEditorNodeId(null);
    setCodeDraft("");
    setCodeRunResult(null);
    setCodeRunError(null);
    setIsCodeRunning(false);
  }

  function saveCodeEditor() {
    if (!codeEditorNodeId) return;
    updateNodeConfig(codeEditorNodeId, { code: codeDraft });
    closeCodeEditor();
  }

  async function runCodeDraft() {
    setIsCodeRunning(true);
    setCodeRunResult(null);
    setCodeRunError(null);
    try {
      const result = await runBrowserAutomationCode(codeDraft, {
        selection: {
          selectedNodeId: "hello-world-sample",
          selectedNodeKind: "layer",
          selectedLayerType: "annotation",
          selectedAnnotationMetadata: "Sample metadata",
        },
        data: {
          message: "Sample input from the code editor",
        },
      });
      setCodeRunResult(formatBrowserAutomationResult(result));
    } catch (error) {
      setCodeRunError(error instanceof Error ? error.message : "Code execution failed.");
    } finally {
      setIsCodeRunning(false);
    }
  }

  useEffect(() => {
    if (!openPipelineMenuId) return;

    function handlePointerDown(event: PointerEvent) {
      const target = event.target as HTMLElement | null;
      if (target?.closest("[data-automation-pipeline-menu='true']")) return;
      setOpenPipelineMenuId(null);
      setPipelineMenuPosition(null);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpenPipelineMenuId(null);
        setPipelineMenuPosition(null);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [openPipelineMenuId]);

  useEffect(() => {
    if (!renamingPipelineId) return;
    const timeoutId = window.setTimeout(() => {
      renameInputRef.current?.focus();
      renameInputRef.current?.select();
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [renamingPipelineId]);

  async function runPipelineWithFeedback(pipeline: AutomationPipeline) {
    setRunningPipelineId(pipeline.id);
    setPipelineRunOutcome((current) => ({ ...current, [pipeline.id]: undefined }));
    try {
      const result = await onRunPipeline(pipeline);
      const outcome = result.status === "error" ? "error" : result.status === "success" ? "success" : undefined;
      setPipelineRunOutcome((current) => ({ ...current, [pipeline.id]: outcome }));
      if (outcome) {
        window.setTimeout(() => {
          setPipelineRunOutcome((current) => ({ ...current, [pipeline.id]: undefined }));
        }, 2200);
      }
    } catch {
      setPipelineRunOutcome((current) => ({ ...current, [pipeline.id]: "error" }));
    } finally {
      setRunningPipelineId(null);
    }
  }

  function handlePipelineRunControl(pipeline: AutomationPipeline, status: string) {
    if (status === "running") {
      onStopDebug();
      return;
    }
    if (status === "paused") {
      onResumeDebug();
      return;
    }
    void runPipelineWithFeedback(pipeline);
  }

  function addPipeline() {
    const next = createEmptyAutomationPipeline(`Pipeline ${pipelines.length + 1}`);
    onPipelinesChange([...pipelines, next]);
    onActivePipelineIdChange(next.id);
  }

  function addPipelineFromTemplate(templateId: string) {
    const template = AUTOMATION_TEMPLATES.find((item) => item.id === templateId);
    if (!template) return;
    const next = template.create();
    onPipelinesChange([...pipelines, next]);
    onActivePipelineIdChange(next.id);
    setTemplateMenuOpen(false);
    setSelectedNodeId(null);
    setSelectedConnectionId(null);
  }

  function deletePipeline(pipelineId: string) {
    const next = pipelines.filter((pipeline) => pipeline.id !== pipelineId);
    const fallback = next[0] ?? createEmptyAutomationPipeline();
    onPipelinesChange(next.length ? next : [fallback]);
    onActivePipelineIdChange(fallback.id);
    setOpenPipelineMenuId(null);
    setPipelineMenuPosition(null);
  }

  function renamePipeline(pipeline: AutomationPipeline) {
    setRenamingPipelineId(pipeline.id);
    setRenameDraft(pipeline.name);
    setOpenPipelineMenuId(null);
    setPipelineMenuPosition(null);
  }

  function commitRenamePipeline() {
    if (!renamingPipelineId) return;
    const nextName = renameDraft.trim();
    if (nextName) {
      updatePipeline(renamingPipelineId, (current) => ({ ...current, name: nextName }));
    }
    setRenamingPipelineId(null);
    setRenameDraft("");
  }

  function cancelRenamePipeline() {
    setRenamingPipelineId(null);
    setRenameDraft("");
  }

  function editPipelineDetails(pipeline: AutomationPipeline) {
    setEditingPipelineDetailsId(pipeline.id);
    setPipelineDetailsNameDraft(pipeline.name);
    setPipelineDetailsDescriptionDraft(pipeline.description ?? "");
    setOpenPipelineMenuId(null);
    setPipelineMenuPosition(null);
  }

  function closePipelineDetailsEditor() {
    setEditingPipelineDetailsId(null);
    setPipelineDetailsNameDraft("");
    setPipelineDetailsDescriptionDraft("");
  }

  function savePipelineDetails() {
    if (!editingPipelineDetailsId) return;
    const nextName = pipelineDetailsNameDraft.trim();
    updatePipeline(editingPipelineDetailsId, (current) => ({
      ...current,
      name: nextName || current.name,
      description: pipelineDetailsDescriptionDraft.trim(),
    }));
    closePipelineDetailsEditor();
  }

  function requestDeletePipeline(pipelineId: string) {
    setPendingDeletePipelineId(pipelineId);
    setOpenPipelineMenuId(null);
    setPipelineMenuPosition(null);
  }

  function confirmDeletePipeline() {
    if (!pendingDeletePipelineId) return;
    deletePipeline(pendingDeletePipelineId);
    setPendingDeletePipelineId(null);
  }

  function duplicatePipeline(pipeline: AutomationPipeline) {
    const now = Date.now();
    const duplicate: AutomationPipeline = {
      ...pipeline,
      id: `pipeline-${now}-${Math.random().toString(36).slice(2, 8)}`,
      name: `${pipeline.name} copy`,
      active: false,
      autoRun: false,
      createdAt: now,
      updatedAt: now,
    };
    onPipelinesChange([...pipelines, duplicate]);
    onActivePipelineIdChange(duplicate.id);
    setOpenPipelineMenuId(null);
    setPipelineMenuPosition(null);
  }

  function handleLibraryDragStart(event: ReactDragEvent<HTMLButtonElement>, item: AutomationLibraryItem) {
    event.dataTransfer.effectAllowed = "copy";
    event.dataTransfer.setData("application/x-automation-token", item.token);
    const ghost = document.createElement("canvas");
    ghost.width = 1;
    ghost.height = 1;
    event.dataTransfer.setDragImage(ghost, 0, 0);
    setLibraryDrag({ item, point: null });
  }

  function handleLibraryDragEnd() {
    setLibraryDrag(null);
  }

  function getDraggedLibraryItem(event: ReactDragEvent<HTMLElement>) {
    if (libraryDrag?.item) return libraryDrag.item;
    const token = event.dataTransfer.getData("application/x-automation-token");
    return automationLibrary.find((item) => item.token === token) ?? null;
  }

  function handleCanvasDragOver(event: ReactDragEvent<HTMLDivElement>) {
    const item = getDraggedLibraryItem(event);
    if (!item) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    const point = getGraphPoint(event.clientX, event.clientY);
    setLibraryDrag({ item, point });
  }

  function handleCanvasDrop(event: ReactDragEvent<HTMLDivElement>) {
    const item = getDraggedLibraryItem(event);
    if (!item) return;
    event.preventDefault();
    addLibraryNodeAt(item, getGraphPoint(event.clientX, event.clientY));
    setLibraryDrag(null);
  }

  function handleCanvasDragLeave(event: ReactDragEvent<HTMLDivElement>) {
    const nextTarget = event.relatedTarget as Node | null;
    if (nextTarget && event.currentTarget.contains(nextTarget)) return;
    setLibraryDrag((current) => (current ? { ...current, point: null } : null));
  }

  function startCreateCustomTool() {
    const template = GUIDED_TOOL_TEMPLATES[0];
    setEditingCustomToolId(null);
    setToolBuilderMode("guided");
    setGuidedTemplateId(template.id);
    setGuidedValues(getTemplateDefaultValues(template));
    setCustomToolDraft(
      createAutomationCustomTool({
        kind: template.kind,
        label: template.summary,
        description: template.description,
        inputs: template.inputs,
        outputs: template.outputs,
        builder: { mode: "guided", templateId: template.id, values: getTemplateDefaultValues(template) },
      })
    );
    setRightPanelMode("create-tool");
  }

  function startEditCustomTool(toolId: string) {
    const tool = customTools.find((item) => item.id === toolId);
    if (!tool) return;
    setOpenCustomToolMenuId(null);
    setPendingDeleteCustomToolId(null);
    setEditingCustomToolId(tool.id);
    setToolBuilderMode(tool.builder?.mode ?? "scripted");
    if (tool.builder?.mode === "guided" && tool.builder.templateId) {
      const template = getBuilderTemplate(tool.builder.templateId);
      setGuidedTemplateId(template.id);
      setGuidedValues({ ...getTemplateDefaultValues(template), ...(tool.builder.values ?? {}) });
    }
    setCustomToolDraft(createAutomationCustomTool(tool));
    setRightPanelMode("create-tool");
  }

  function closeCustomToolBuilder() {
    setRightPanelMode("library");
    setEditingCustomToolId(null);
  }

  function requestDeleteCustomTool(toolId: string) {
    setOpenCustomToolMenuId(null);
    setPendingDeleteCustomToolId(toolId);
  }

  function confirmDeleteCustomTool() {
    if (!pendingDeleteCustomToolId) return;
    onCustomToolsChange(customTools.filter((item) => item.id !== pendingDeleteCustomToolId));
    if (editingCustomToolId === pendingDeleteCustomToolId) {
      closeCustomToolBuilder();
    }
    setPendingDeleteCustomToolId(null);
  }

  function saveCustomTool() {
    const now = Date.now();
    const tool =
      toolBuilderMode === "guided"
        ? createAutomationCustomTool({
            ...customToolDraft,
            kind: guidedTemplate.kind,
            label: customToolDraft.label.trim() || guidedTemplate.summary,
            description: customToolDraft.description.trim() || guidedTemplate.description,
            inputs: guidedTemplate.inputs,
            outputs: guidedTemplate.outputs,
            code: guidedTemplate.buildCode(guidedValues),
            token: (`custom.${customToolDraft.id}`) as AutomationCustomTool["token"],
            builder: {
              mode: "guided",
              templateId: guidedTemplate.id,
              values: guidedValues,
            },
            updatedAt: now,
          })
        : createAutomationCustomTool({
            ...customToolDraft,
            label: customToolDraft.label.trim() || "Custom tool",
            description: customToolDraft.description.trim() || "User-defined pipeline tool.",
            token: (`custom.${customToolDraft.id}`) as AutomationCustomTool["token"],
            builder: {
              mode: "scripted",
            },
            updatedAt: now,
          });
    onCustomToolsChange([...customTools.filter((item) => item.id !== tool.id), tool]);
    closeCustomToolBuilder();
  }

  function updateCustomToolDraft(patch: Partial<AutomationCustomTool>) {
    setCustomToolDraft((current) => {
      const nextKind = patch.kind ?? current.kind;
      return {
        ...current,
        ...patch,
        inputs: patch.kind ? createAutomationCustomTool({ kind: nextKind }).inputs : patch.inputs ?? current.inputs,
        outputs: patch.kind ? createAutomationCustomTool({ kind: nextKind }).outputs : patch.outputs ?? current.outputs,
      };
    });
  }

  function updateGuidedField(key: string, value: string | boolean) {
    setGuidedValues((current) => ({ ...current, [key]: value }));
  }

  function selectGuidedTemplate(templateId: string) {
    const template = getBuilderTemplate(templateId);
    const defaults = getTemplateDefaultValues(template);
    setGuidedTemplateId(template.id);
    setGuidedValues(defaults);
    setCustomToolDraft((current) =>
      createAutomationCustomTool({
        ...current,
        kind: template.kind,
        label: current.label === "Custom tool" || !current.label.trim() ? template.summary : current.label,
        description: current.description === "User-defined pipeline tool." || !current.description.trim() ? template.description : current.description,
        inputs: template.inputs,
        outputs: template.outputs,
      })
    );
  }

  function selectGuidedKind(kind: AutomationNodeKind) {
    const template = GUIDED_TOOL_TEMPLATES.find((item) => item.kind === kind) ?? GUIDED_TOOL_TEMPLATES[0];
    selectGuidedTemplate(template.id);
  }

  function selectGuidedDomain(kind: AutomationNodeKind, domain: string) {
    const template =
      GUIDED_TOOL_TEMPLATES.find((item) => item.kind === kind && item.domain === domain) ??
      GUIDED_TOOL_TEMPLATES.find((item) => item.kind === kind) ??
      GUIDED_TOOL_TEMPLATES[0];
    selectGuidedTemplate(template.id);
  }

  function handleCanvasPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    setSelectedNodeId(null);
    setSelectedConnectionId(null);
    event.currentTarget.setPointerCapture(event.pointerId);
    canvasDragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: canvasView.x,
      originY: canvasView.y,
    };
  }

  function handleNodePointerDown(event: ReactPointerEvent<HTMLDivElement>, node: AutomationNode) {
    if (event.button !== 0) return;
    event.stopPropagation();
    setSelectedNodeId(node.id);
    setSelectedConnectionId(null);
    event.currentTarget.setPointerCapture(event.pointerId);
    nodeDragRef.current = {
      pointerId: event.pointerId,
      nodeId: node.id,
      startX: event.clientX,
      startY: event.clientY,
      originX: node.x,
      originY: node.y,
    };
  }

  function handleCanvasPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (connectionDraft) {
      const point = getGraphPoint(event.clientX, event.clientY);
      setConnectionDraft((draft) => {
        if (!draft) return null;
        const target = findConnectionSnapTarget(point, draft);
        return {
          ...draft,
          currentX: target?.anchor.x ?? point.x,
          currentY: target?.anchor.y ?? point.y,
          targetNodeId: target?.node.id,
          targetPortId: target?.port.id,
          targetX: target?.anchor.x,
          targetY: target?.anchor.y,
        };
      });
      return;
    }

    const nodeDrag = nodeDragRef.current;
    if (nodeDrag?.pointerId === event.pointerId) {
      updateNodePosition(
        nodeDrag.nodeId,
        nodeDrag.originX + (event.clientX - nodeDrag.startX) / canvasView.scale,
        nodeDrag.originY + (event.clientY - nodeDrag.startY) / canvasView.scale
      );
      return;
    }

    const drag = canvasDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    setCanvasView((view) => ({
      ...view,
      x: drag.originX + event.clientX - drag.startX,
      y: drag.originY + event.clientY - drag.startY,
    }));
  }

  function endCanvasDrag(event: ReactPointerEvent<HTMLDivElement>) {
    if (connectionDraft) {
      const target = document.elementFromPoint(event.clientX, event.clientY) as HTMLElement | null;
      const inputPort = target?.closest("[data-automation-port-role='input']") as HTMLElement | null;
      const toNodeId = connectionDraft.targetNodeId ?? inputPort?.dataset.automationNodeId;
      const toPortId = connectionDraft.targetPortId ?? inputPort?.dataset.automationPortId;
      if (toNodeId && toPortId && toNodeId !== connectionDraft.fromNodeId) {
        addConnection({
          id: connectionDraft.existingConnectionId ?? `connection-${connectionDraft.fromNodeId}-${connectionDraft.fromPortId}-${toNodeId}-${toPortId}-${Date.now()}`,
          fromNodeId: connectionDraft.fromNodeId,
          fromPortId: connectionDraft.fromPortId,
          toNodeId,
          toPortId,
          mode: connectionDraft.mode,
        });
      } else if (connectionDraft.existingConnectionId) {
        removeConnection(connectionDraft.existingConnectionId);
      }
      setConnectionDraft(null);
      return;
    }

    if (nodeDragRef.current?.pointerId === event.pointerId) {
      nodeDragRef.current = null;
    }
    if (canvasDragRef.current?.pointerId === event.pointerId) {
      canvasDragRef.current = null;
    }
  }

  function handleCanvasWheel(event: ReactWheelEvent<HTMLDivElement>) {
    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    const pointerX = event.clientX - rect.left;
    const pointerY = event.clientY - rect.top;
    const nextScale = Math.min(1.8, Math.max(0.55, canvasView.scale * (event.deltaY > 0 ? 0.92 : 1.08)));
    const ratio = nextScale / canvasView.scale;
    setCanvasView({
      scale: nextScale,
      x: pointerX - (pointerX - canvasView.x) * ratio,
      y: pointerY - (pointerY - canvasView.y) * ratio,
    });
  }

  if (!open || !activePipeline) return null;

  return (
    <aside
      data-automation-panel="true"
      data-theme-surface="panel"
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 44,
        borderRadius: 0,
        border: "none",
        background: "rgba(10,12,16,0.98)",
        color: "white",
        boxShadow: "none",
        backdropFilter: "blur(16px)",
        display: "grid",
        gridTemplateColumns: `${leftPanelOpen ? "280px" : "0px"} minmax(420px, 1fr) ${rightPanelOpen ? "360px" : "0px"}`,
        minHeight: 0,
        overflow: "hidden",
        fontFamily: UI_FONT_FAMILY,
        transition: "grid-template-columns 180ms ease",
      }}
    >
      <style>{`
        @keyframes automation-spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes automation-flow {
          from { stroke-dashoffset: 18; }
          to { stroke-dashoffset: 0; }
        }
        .automation-panel-scroll {
          scrollbar-width: thin;
          scrollbar-color: rgba(140, 190, 255, 0.45) rgba(255,255,255,0.06);
        }
        .automation-panel-scroll::-webkit-scrollbar {
          width: 10px;
        }
        .automation-panel-scroll::-webkit-scrollbar-track {
          background: rgba(255,255,255,0.05);
          border-radius: 999px;
        }
        .automation-panel-scroll::-webkit-scrollbar-thumb {
          background: linear-gradient(180deg, rgba(140,190,255,0.52), rgba(90,150,230,0.34));
          border-radius: 999px;
          border: 2px solid rgba(12,14,18,0.82);
        }
        .automation-panel-scroll::-webkit-scrollbar-thumb:hover {
          background: linear-gradient(180deg, rgba(160,210,255,0.68), rgba(110,170,245,0.48));
        }
      `}</style>
      {!leftPanelOpen ? (
        <button type="button" onClick={() => setLeftPanelOpen(true)} title="Show pipelines" aria-label="Show pipelines" style={{ ...floatingToolButtonStyle, position: "absolute", left: 14, top: 14, zIndex: 7 }}>
          <PanelIcon side="left" />
        </button>
      ) : null}
      {!rightPanelOpen ? (
        <button type="button" onClick={() => setRightPanelOpen(true)} title="Show node library" aria-label="Show node library" style={{ ...floatingToolButtonStyle, position: "absolute", right: 18, top: 24, zIndex: 7 }}>
          <PanelIcon side="right" />
        </button>
      ) : null}
      {openPipelineMenuId && pipelineMenuPosition ? (
        <div
          data-automation-pipeline-menu="true"
          data-theme-surface="panel"
          style={{
            position: "absolute",
            right: pipelineMenuPosition.right,
            top: pipelineMenuPosition.top,
            zIndex: 12,
            width: 156,
            borderRadius: 8,
            border: "1px solid rgba(255,255,255,0.12)",
            background: "rgba(12,14,18,0.98)",
            boxShadow: "0 14px 34px rgba(0,0,0,0.42)",
            padding: 6,
            display: "grid",
            gap: 4,
            fontFamily: UI_FONT_FAMILY,
          }}
        >
          {(() => {
            const pipeline = pipelines.find((item) => item.id === openPipelineMenuId);
            if (!pipeline) return null;
            return (
              <>
                <button type="button" onClick={() => renamePipeline(pipeline)} style={menuButtonStyle}>Rename</button>
                <button type="button" onClick={() => editPipelineDetails(pipeline)} style={menuButtonStyle}>Edit details</button>
                <button type="button" onClick={() => duplicatePipeline(pipeline)} style={menuButtonStyle}>Duplicate</button>
                <button type="button" onClick={() => requestDeletePipeline(pipeline.id)} style={{ ...menuButtonStyle, color: "#ffb8b8" }}>Delete</button>
              </>
            );
          })()}
        </div>
      ) : null}
      {editingPipelineDetailsId ? (
        <div
          onClick={closePipelineDetailsEditor}
          style={{
            position: "absolute",
            inset: 0,
            background: "rgba(0,0,0,0.42)",
            zIndex: 20,
            display: "grid",
            placeItems: "center",
            padding: 24,
            fontFamily: UI_FONT_FAMILY,
          }}
        >
          <div
            data-theme-surface="panel"
            onClick={(event) => event.stopPropagation()}
            style={{
              width: "min(460px, 100%)",
              borderRadius: 8,
              border: "1px solid rgba(255,255,255,0.12)",
              background: "rgba(12,14,18,0.96)",
              boxShadow: "0 18px 48px rgba(0,0,0,0.42)",
              padding: 18,
              color: "white",
              display: "grid",
              gap: 14,
            }}
          >
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 900 }}>Pipeline details</div>
                <div style={{ marginTop: 4, fontSize: 12, lineHeight: 1.35, color: "rgba(255,255,255,0.62)" }}>
                  Add a short description that appears in the bottom automation toolbar.
                </div>
              </div>
              <button
                type="button"
                onClick={closePipelineDetailsEditor}
                aria-label="Close pipeline details"
                title="Close"
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 7,
                  border: "1px solid rgba(255,255,255,0.10)",
                  background: "rgba(255,255,255,0.05)",
                  color: "rgba(255,255,255,0.78)",
                  cursor: "pointer",
                  fontSize: 16,
                  lineHeight: 1,
                }}
              >
                ×
              </button>
            </div>
            <label style={{ display: "grid", gap: 6, fontSize: 11, fontWeight: 900, color: "rgba(255,255,255,0.64)", textTransform: "uppercase" }}>
              Name
              <input
                value={pipelineDetailsNameDraft}
                onChange={(event) => setPipelineDetailsNameDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") savePipelineDetails();
                  if (event.key === "Escape") closePipelineDetailsEditor();
                }}
                style={pipelineDetailsInputStyle}
              />
            </label>
            <label style={{ display: "grid", gap: 6, fontSize: 11, fontWeight: 900, color: "rgba(255,255,255,0.64)", textTransform: "uppercase" }}>
              Short description
              <textarea
                value={pipelineDetailsDescriptionDraft}
                onChange={(event) => setPipelineDetailsDescriptionDraft(event.target.value)}
                placeholder="Example: Opens selected annotation metadata and previews it in the inspector."
                maxLength={180}
                style={pipelineDetailsTextareaStyle}
              />
              <span style={{ justifySelf: "end", fontSize: 10, fontWeight: 800, color: "rgba(255,255,255,0.42)", textTransform: "none" }}>
                {pipelineDetailsDescriptionDraft.length}/180
              </span>
            </label>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button type="button" onClick={closePipelineDetailsEditor} style={secondaryActionButtonStyle}>Cancel</button>
              <button type="button" onClick={savePipelineDetails} style={primaryActionButtonStyle}>Save details</button>
            </div>
          </div>
        </div>
      ) : null}
      {pendingDeletePipelineId ? (
        <div
          onClick={() => setPendingDeletePipelineId(null)}
          style={{
            position: "absolute",
            inset: 0,
            background: "rgba(0,0,0,0.42)",
            zIndex: 20,
            display: "grid",
            placeItems: "center",
            padding: 24,
            fontFamily: UI_FONT_FAMILY,
          }}
        >
          <div
            data-theme-surface="panel"
            onClick={(event) => event.stopPropagation()}
            style={{
              width: "min(420px, 100%)",
              borderRadius: 8,
              border: "1px solid rgba(255,255,255,0.12)",
              background: "rgba(12,14,18,0.96)",
              boxShadow: "0 18px 48px rgba(0,0,0,0.42)",
              padding: 18,
              color: "white",
              display: "grid",
              gap: 16,
            }}
          >
            <div>
              <div style={{ fontSize: 16, fontWeight: 800 }}>Delete pipeline?</div>
              <div style={{ fontSize: 12, opacity: 0.76, marginTop: 4, lineHeight: 1.45 }}>
                This automation pipeline will be removed from this browser.
              </div>
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <button type="button" onClick={() => setPendingDeletePipelineId(null)} style={secondaryActionButtonStyle}>Cancel</button>
              <button type="button" onClick={confirmDeletePipeline} style={dangerActionButtonStyle}>Delete</button>
            </div>
          </div>
        </div>
      ) : null}
      {pendingDeleteCustomToolId ? (
        <div
          onClick={() => setPendingDeleteCustomToolId(null)}
          style={{
            position: "absolute",
            inset: 0,
            background: "rgba(0,0,0,0.42)",
            zIndex: 20,
            display: "grid",
            placeItems: "center",
            padding: 24,
            fontFamily: UI_FONT_FAMILY,
          }}
        >
          <div
            data-theme-surface="panel"
            onClick={(event) => event.stopPropagation()}
            style={{
              width: "min(420px, 100%)",
              borderRadius: 8,
              border: "1px solid rgba(255,255,255,0.12)",
              background: "rgba(12,14,18,0.96)",
              boxShadow: "0 18px 48px rgba(0,0,0,0.42)",
              padding: 18,
              color: "white",
              display: "grid",
              gap: 16,
            }}
          >
            <div>
              <div style={{ fontSize: 16, fontWeight: 800 }}>Delete custom tool?</div>
              <div style={{ fontSize: 12, opacity: 0.76, marginTop: 4, lineHeight: 1.45 }}>
                This tool will be removed from your custom tools. Existing pipeline nodes using it may stop working.
              </div>
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <button type="button" onClick={() => setPendingDeleteCustomToolId(null)} style={secondaryActionButtonStyle}>Cancel</button>
              <button type="button" onClick={confirmDeleteCustomTool} style={dangerActionButtonStyle}>Delete</button>
            </div>
          </div>
        </div>
      ) : null}
      {configEditorNode && configEditorDefinition ? (
        <div
          onClick={closeConfigEditor}
          style={{
            position: "absolute",
            inset: 0,
            background: "rgba(0,0,0,0.48)",
            zIndex: 22,
            display: "grid",
            placeItems: "center",
            padding: 24,
            fontFamily: UI_FONT_FAMILY,
          }}
        >
          <div
            data-theme-surface="panel"
            onClick={(event) => event.stopPropagation()}
            style={{
              width: "min(620px, 100%)",
              maxHeight: "min(680px, 100%)",
              borderRadius: 8,
              border: "1px solid rgba(255,255,255,0.12)",
              background: "rgba(12,14,18,0.98)",
              boxShadow: "0 18px 48px rgba(0,0,0,0.44)",
              padding: 16,
              color: "white",
              display: "grid",
              gap: 12,
              minHeight: 0,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 900 }}>{configEditorNode.label}</div>
                <div style={{ marginTop: 3, fontSize: 11, color: "rgba(255,255,255,0.58)" }}>
                  {configEditorDefinition.description}
                </div>
              </div>
              <button type="button" onClick={closeConfigEditor} title="Close settings" aria-label="Close settings" style={iconButtonStyle}>
                <CloseIcon />
              </button>
            </div>
            <div className="automation-panel-scroll" style={{ overflow: "auto", display: "grid", gap: 12, minHeight: 0, maxHeight: 420, paddingRight: 4 }}>
              {configEditorDefinition.configFields.map((field) => (
                <label key={field.key} style={{ display: "grid", gap: 6 }}>
                  <span style={{ fontSize: 12, fontWeight: 900 }}>{field.label}</span>
                  {field.type === "boolean" ? (
                    <button
                      type="button"
                      onClick={() => updateConfigDraft(field, !(configDraft[field.key] === true))}
                      style={getConfigToggleStyle(configDraft[field.key] === true)}
                    >
                      {configDraft[field.key] === true ? "Enabled" : "Disabled"}
                    </button>
                  ) : field.type === "select" ? (
                    <select
                      value={String(configDraft[field.key] ?? "")}
                      onChange={(event) => updateConfigDraft(field, event.target.value)}
                      style={inputStyle}
                    >
                      {(field.options ?? []).map((option) => (
                        <option key={String(option.value)} value={String(option.value)}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <textarea
                      value={String(configDraft[field.key] ?? "")}
                      onChange={(event) => updateConfigDraft(field, event.target.value)}
                      placeholder={field.placeholder}
                      rows={field.type === "string" ? 1 : 6}
                      spellCheck={field.type !== "code"}
                      style={{
                        ...inputStyle,
                        minHeight: field.type === "string" ? 38 : 132,
                        resize: "vertical",
                        fontFamily: field.type === "code" ? "Consolas, monospace" : UI_FONT_FAMILY,
                      }}
                    />
                  )}
                  {field.description ? (
                    <span style={{ fontSize: 11, color: "rgba(255,255,255,0.56)", lineHeight: 1.35 }}>{field.description}</span>
                  ) : null}
                </label>
              ))}
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <button type="button" onClick={closeConfigEditor} style={secondaryActionButtonStyle}>Cancel</button>
              <button type="button" onClick={saveConfigEditor} style={primaryActionButtonStyle}>Save</button>
            </div>
          </div>
        </div>
      ) : null}
      {codeEditorNode ? (
        <div
          onClick={closeCodeEditor}
          style={{
            position: "absolute",
            inset: 0,
            background: "rgba(0,0,0,0.48)",
            zIndex: 22,
            display: "grid",
            placeItems: "center",
            padding: 24,
            fontFamily: UI_FONT_FAMILY,
          }}
        >
          <div
            data-theme-surface="panel"
            onClick={(event) => event.stopPropagation()}
            style={{
              width: "min(760px, 100%)",
              maxHeight: "min(680px, 100%)",
              borderRadius: 8,
              border: "1px solid rgba(255,255,255,0.12)",
              background: "rgba(12,14,18,0.98)",
              boxShadow: "0 18px 48px rgba(0,0,0,0.44)",
              padding: 16,
              color: "white",
              display: "grid",
              gridTemplateRows: "auto minmax(220px, 1fr) auto auto",
              gap: 12,
              minHeight: 0,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 900 }}>{codeEditorNode.label}</div>
                <div style={{ marginTop: 3, fontSize: 11, color: "rgba(255,255,255,0.58)" }}>
                  Define a function named run(input).
                </div>
              </div>
              <button type="button" onClick={closeCodeEditor} title="Close editor" aria-label="Close editor" style={iconButtonStyle}>
                <CloseIcon />
              </button>
            </div>
            <textarea
              value={codeDraft}
              onChange={(event) => setCodeDraft(event.target.value)}
              spellCheck={false}
              aria-label={`${codeEditorNode.label} code editor`}
              style={{
                ...inputStyle,
                height: "100%",
                minHeight: 260,
                resize: "vertical",
                fontFamily: "Consolas, monospace",
                fontSize: 12,
                lineHeight: 1.5,
              }}
            />
            {codeRunResult || codeRunError ? (
              <pre
                style={{
                  margin: 0,
                  borderRadius: 8,
                  border: codeRunError ? "1px solid rgba(255,140,140,0.32)" : "1px solid rgba(120,190,255,0.24)",
                  background: codeRunError ? "rgba(180,60,60,0.12)" : "rgba(120,190,255,0.08)",
                  color: codeRunError ? "#ffd0d0" : "rgba(230,245,255,0.92)",
                  padding: 10,
                  whiteSpace: "pre-wrap",
                  maxHeight: 140,
                  overflow: "auto",
                  fontSize: 12,
                  fontFamily: "Consolas, monospace",
                }}
              >
                {codeRunError ?? codeRunResult}
              </pre>
            ) : null}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <button type="button" onClick={runCodeDraft} disabled={isCodeRunning} style={secondaryActionButtonStyle}>
                {isCodeRunning ? "Running..." : "Run"}
              </button>
              <button type="button" onClick={closeCodeEditor} style={secondaryActionButtonStyle}>Cancel</button>
              <button type="button" onClick={saveCodeEditor} style={primaryActionButtonStyle}>Save</button>
            </div>
          </div>
        </div>
      ) : null}
      <section style={{ borderRight: "1px solid rgba(255,255,255,0.09)", minHeight: 0, display: "grid", gridTemplateRows: "auto auto 1fr", overflow: "hidden" }}>
        <div style={{ padding: 16, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 900 }}>Pipelines</div>
            <div style={{ marginTop: 3, fontSize: 11, color: "rgba(255,255,255,0.58)" }}>
              {pipelines.filter((pipeline) => pipeline.autoRun).length} automatic
            </div>
          </div>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
            <button type="button" onClick={() => setLeftPanelOpen(false)} title="Hide pipelines" aria-label="Hide pipelines" style={iconButtonStyle}>
              <PanelIcon side="left" />
            </button>
            <div style={{ position: "relative" }}>
              <button type="button" onClick={() => setTemplateMenuOpen((value) => !value)} title="New pipeline" aria-label="New pipeline" style={primaryIconButtonStyle}><PlusIcon /></button>
              {templateMenuOpen ? (
                <div data-theme-surface="panel" style={templateMenuStyle}>
                  <button
                    type="button"
                    onClick={() => {
                      addPipeline();
                      setTemplateMenuOpen(false);
                    }}
                    style={templateMenuButtonStyle}
                  >
                    <span style={{ fontWeight: 900 }}>Empty pipeline</span>
                    <span style={templateMenuDescriptionStyle}>Start from a blank automation graph.</span>
                  </button>
                  {AUTOMATION_TEMPLATES.map((template) => (
                    <button key={template.id} type="button" onClick={() => addPipelineFromTemplate(template.id)} style={templateMenuButtonStyle}>
                      <span style={{ fontWeight: 900 }}>{template.name}</span>
                      <span style={templateMenuDescriptionStyle}>{template.description}</span>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        </div>
        <div className="automation-panel-scroll" style={{ overflow: "auto", padding: "0 12px 104px", display: "grid", alignContent: "start", gap: 8 }}>
          {pipelines.map((pipeline) => (
            (() => {
              const rowStatus = getPipelineRowRunStatus(pipeline, debug, runningPipelineId, pipelineRunOutcome[pipeline.id]);
              return (
            <div
              key={pipeline.id}
              data-automation-pipeline-menu="true"
              data-automation-pipeline-row="true"
              style={{
                position: "relative",
                borderRadius: 8,
                border: pipeline.id === activePipeline.id ? "1px solid rgba(120,190,255,0.62)" : "1px solid rgba(255,255,255,0.08)",
                background: pipeline.id === activePipeline.id ? "rgba(120,190,255,0.13)" : "rgba(255,255,255,0.04)",
                color: "white",
                display: "grid",
                gridTemplateColumns: "28px minmax(0, 1fr) auto 24px",
                alignItems: "center",
                gap: 4,
                padding: "8px 7px 8px 8px",
              }}
            >
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  handlePipelineRunControl(pipeline, rowStatus);
                }}
                title={getPipelineRunButtonLabel(pipeline.name, rowStatus)}
                aria-label={getPipelineRunButtonLabel(pipeline.name, rowStatus)}
                style={rowRunButtonStyle}
              >
                {rowStatus === "running" || rowStatus === "paused" ? <RunButtonLoaderRing /> : null}
                <RunButtonIcon status={rowStatus} />
                <RunButtonStatusDot status={rowStatus} />
              </button>
              {renamingPipelineId === pipeline.id ? (
                <input
                  ref={renameInputRef}
                  value={renameDraft}
                  onChange={(event) => setRenameDraft(event.target.value)}
                  onBlur={commitRenamePipeline}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") commitRenamePipeline();
                    if (event.key === "Escape") cancelRenamePipeline();
                  }}
                  aria-label="Pipeline name"
                  style={rowRenameInputStyle}
                />
              ) : (
              <button
                type="button"
                onClick={() => onActivePipelineIdChange(pipeline.id)}
                style={{
                  border: "none",
                  background: "transparent",
                  color: "inherit",
                  textAlign: "left",
                  padding: 4,
                  cursor: "pointer",
                  minWidth: 0,
                  fontFamily: UI_FONT_FAMILY,
                }}
              >
                <span style={{ display: "block", fontSize: 13, fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{pipeline.name}</span>
                <span style={{ display: "block", marginTop: 5, fontSize: 11, color: "rgba(255,255,255,0.58)" }}>
                  {pipeline.nodes.length} nodes {pipeline.autoRun ? "· auto" : ""}
                </span>
              </button>
              )}
              <button
                type="button"
                title={pipeline.autoRun ? "Disable automatic run" : "Enable automatic run"}
                aria-label={pipeline.autoRun ? `Disable automatic run for ${pipeline.name}` : `Enable automatic run for ${pipeline.name}`}
                onClick={(event) => {
                  event.stopPropagation();
                  updatePipeline(pipeline.id, (current) => ({
                    ...current,
                    autoRun: !current.autoRun,
                    active: !current.autoRun ? true : current.active,
                  }));
                }}
                style={getSmallToggleIconButtonStyle(pipeline.autoRun)}
              >
                <AutoIcon />
              </button>
              <button
                type="button"
                title="Pipeline options"
                aria-label={`Options for ${pipeline.name}`}
                onClick={(event) => {
                  event.stopPropagation();
                  const row = event.currentTarget.closest("[data-automation-pipeline-row='true']") as HTMLElement | null;
                  const panel = event.currentTarget.closest("[data-automation-panel='true']") as HTMLElement | null;
                  const rowRect = row?.getBoundingClientRect();
                  const panelRect = panel?.getBoundingClientRect();
                  if (openPipelineMenuId === pipeline.id) {
                    setOpenPipelineMenuId(null);
                    setPipelineMenuPosition(null);
                    return;
                  }
                  if (rowRect && panelRect) {
                    const menuHeight = 128;
                    const preferredTop = rowRect.bottom - panelRect.top + 6;
                    const maxTop = panelRect.height - menuHeight - 12;
                    setPipelineMenuPosition({
                      top: Math.max(12, Math.min(preferredTop, maxTop)),
                      right: panelRect.right - rowRect.right + 6,
                    });
                  }
                  setOpenPipelineMenuId(pipeline.id);
                }}
                style={smallIconButtonStyle}
              >
                <MoreIcon />
              </button>
            </div>
              );
            })()
          ))}
        </div>
      </section>

      <section style={{ position: "relative", minHeight: 0, display: "grid", gridTemplateRows: "1fr" }}>
        <div style={{ position: "absolute", left: leftPanelOpen ? 14 : 58, top: 14, zIndex: 6, display: "flex", gap: 8 }}>
          <button
            type="button"
            onClick={() => setWorkspaceView((value) => (value === "graph" ? "script" : "graph"))}
            title={workspaceView === "graph" ? "Show script" : "Show graph"}
            aria-label={workspaceView === "graph" ? "Show script" : "Show graph"}
            style={getFloatingToggleButtonStyle(workspaceView === "script")}
          >
            <ScriptIcon />
          </button>
          <button
            type="button"
            onClick={() => handlePipelineRunControl(activePipeline, activePipelineRunStatus)}
            title={getPipelineRunButtonLabel(activePipeline.name, activePipelineRunStatus)}
            aria-label={getPipelineRunButtonLabel(activePipeline.name, activePipelineRunStatus)}
            style={{ ...getFloatingToggleButtonStyle(activePipelineRunStatus === "running" || activePipelineRunStatus === "paused"), position: "relative" }}
          >
            {activePipelineRunStatus === "running" || activePipelineRunStatus === "paused" ? <RunButtonLoaderRing /> : null}
            <RunButtonIcon status={activePipelineRunStatus} />
            <RunButtonStatusDot status={activePipelineRunStatus} />
          </button>
        </div>
        {workspaceView === "script" ? (
          <div style={scriptWorkspaceStyle}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 900 }}>Pipeline script</div>
                <div style={{ marginTop: 3, fontSize: 11, color: "rgba(255,255,255,0.58)" }}>
                  Copy, paste, or edit the full automation graph.
                </div>
              </div>
              <button type="button" onClick={copyScript} title="Copy script" aria-label="Copy script" style={primaryIconButtonStyle}>
                {scriptCopied ? <CheckIcon /> : <CopyIcon />}
              </button>
            </div>
            <textarea
              value={activePipeline.script}
              onChange={(event) => updatePipeline(activePipeline.id, (pipeline) => ({ ...pipeline, script: event.target.value }))}
              spellCheck={false}
              style={scriptWorkspaceTextareaStyle}
            />
          </div>
        ) : (
        <div
          ref={canvasRef}
          onPointerDown={handleCanvasPointerDown}
          onPointerMove={handleCanvasPointerMove}
          onPointerUp={endCanvasDrag}
          onPointerCancel={endCanvasDrag}
          onWheel={handleCanvasWheel}
          onDragOver={handleCanvasDragOver}
          onDrop={handleCanvasDrop}
          onDragLeave={handleCanvasDragLeave}
          style={{
            position: "relative",
            overflow: "hidden",
            minHeight: 0,
            background:
              "linear-gradient(rgba(255,255,255,0.035) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.035) 1px, transparent 1px), #090b10",
            backgroundSize: "28px 28px",
            cursor: canvasDragRef.current ? "grabbing" : "grab",
            touchAction: "none",
          }}
        >
          <div
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              width: graphBounds.width,
              height: graphBounds.height,
              transform: `translate(${canvasView.x}px, ${canvasView.y}px) scale(${canvasView.scale})`,
              transformOrigin: "0 0",
              pointerEvents: "none",
            }}
          >
            <svg style={{ position: "absolute", inset: 0, zIndex: 6, width: `${graphBounds.width}px`, height: `${graphBounds.height}px`, overflow: "visible", pointerEvents: "none" }}>
              {activePipeline.connections.map((connection) => {
                const from = activePipeline.nodes.find((node) => node.id === connection.fromNodeId);
                const to = activePipeline.nodes.find((node) => node.id === connection.toNodeId);
                if (!from || !to) return null;
                const fromAnchor = toRenderPoint(getPortAnchor(from, connection.fromPortId, "output"));
                const toAnchor = toRenderPoint(getPortAnchor(to, connection.toPortId, "input"));
                const connectionStatus = debug.connectionStates[connection.id];
                const isActiveConnection = connectionStatus === "active";
                const isSelectedConnection = selectedConnectionId === connection.id;
                const connectionIssue = validationIssues.find((issue) => issue.connectionId === connection.id);
                return (
                  <path
                    key={connection.id}
                    d={`M ${fromAnchor.x} ${fromAnchor.y} C ${fromAnchor.x + 70} ${fromAnchor.y}, ${toAnchor.x - 70} ${toAnchor.y}, ${toAnchor.x} ${toAnchor.y}`}
                    stroke={getConnectionStroke(connection.mode, connectionIssue)}
                    strokeWidth={isActiveConnection || isSelectedConnection || connectionIssue ? "3" : "2"}
                    strokeLinecap="round"
                    strokeDasharray={isActiveConnection ? "8 6" : connectionIssue ? "6 5" : undefined}
                    style={isActiveConnection ? { animation: "automation-flow 900ms linear infinite" } : undefined}
                    onPointerDown={(event) => handleStartRewireConnection(event, connection)}
                    pointerEvents="stroke"
                    fill="none"
                  >
                    <title>{connectionIssue?.message ?? `${connection.fromPortId} to ${connection.toPortId}`}</title>
                  </path>
                );
              })}
              {activePipeline.connections.map((connection) => {
                const from = activePipeline.nodes.find((node) => node.id === connection.fromNodeId);
                const to = activePipeline.nodes.find((node) => node.id === connection.toNodeId);
                if (!from || !to) return null;
                const fromAnchor = toRenderPoint(getPortAnchor(from, connection.fromPortId, "output"));
                const toAnchor = toRenderPoint(getPortAnchor(to, connection.toPortId, "input"));
                const connectionIssue = validationIssues.find((issue) => issue.connectionId === connection.id);
                const color = getConnectionStroke(connection.mode, connectionIssue);
                return (
                  <g key={`${connection.id}-endpoints`} pointerEvents="none">
                    <circle cx={fromAnchor.x} cy={fromAnchor.y} r="5.6" fill={color} stroke="rgba(8,10,14,0.96)" strokeWidth="2" />
                    <circle cx={toAnchor.x} cy={toAnchor.y} r="5.6" fill="rgba(8,10,14,0.96)" stroke={color} strokeWidth="1.8" />
                    <circle cx={toAnchor.x} cy={toAnchor.y} r="2.8" fill={color} />
                  </g>
                );
              })}
              {connectionDraft ? (
                (() => {
                  const start = toRenderPoint({ x: connectionDraft.startX, y: connectionDraft.startY });
                  const current = toRenderPoint({ x: connectionDraft.currentX, y: connectionDraft.currentY });
                  return (
                <g pointerEvents="none">
                  <path
                    d={`M ${start.x} ${start.y} C ${start.x + 76} ${start.y}, ${current.x - 76} ${current.y}, ${current.x} ${current.y}`}
                    stroke={connectionDraft.mode === "data" ? "#9fe6cf" : "#7cc7ff"}
                    strokeWidth="2"
                    strokeDasharray={connectionDraft.targetNodeId ? undefined : "6 5"}
                    strokeLinecap="round"
                    fill="none"
                    style={{ transition: "d 120ms ease" }}
                  />
                  <circle
                    cx={current.x}
                    cy={current.y}
                    r={5}
                    fill={connectionDraft.mode === "data" ? "#9fe6cf" : "#7cc7ff"}
                    stroke="rgba(8,10,14,0.96)"
                    strokeWidth="2"
                  />
                </g>
                  );
                })()
              ) : null}
            </svg>
            {activePipeline.nodes.map((node) => (
              <NodeCard
                key={node.id}
                node={node}
                renderX={node.x - graphBounds.minX}
                renderY={node.y - graphBounds.minY}
                selected={node.id === selectedNodeId}
                debugState={debug.nodeStates[node.id]}
                onPointerDown={handleNodePointerDown}
                onStartConnection={handleStartConnection}
                onStartRewireConnection={handleStartRewireConnection}
                onConfigure={configureNode}
                onDelete={deleteNode}
                onToggleBreakpoint={toggleNodeBreakpoint}
                validationIssues={validationIssues.filter((issue) => issue.nodeId === node.id)}
                connections={activePipeline.connections}
              />
            ))}
            {libraryDrag?.point ? (
              <div
                style={{
                  ...nodeDropPreviewStyle,
                  left: Math.round(libraryDrag.point.x - graphBounds.minX - 105),
                  top: Math.round(libraryDrag.point.y - graphBounds.minY - 52),
                  border: `1px solid ${getNodeAccent(libraryDrag.item.kind)}88`,
                  boxShadow: `0 0 0 2px ${getNodeAccent(libraryDrag.item.kind)}24, 0 18px 34px rgba(0,0,0,0.30)`,
                }}
              >
                <span style={{ fontSize: 11, fontWeight: 900, color: getNodeAccent(libraryDrag.item.kind), textTransform: "uppercase" }}>
                  {libraryDrag.item.kind}
                </span>
                <span style={{ fontSize: 13, fontWeight: 900 }}>{libraryDrag.item.label}</span>
              </div>
            ) : null}
          </div>
          <div style={{ position: "absolute", right: 12, bottom: 96, borderRadius: 8, border: "1px solid rgba(255,255,255,0.10)", background: "rgba(12,14,18,0.78)", padding: "6px 8px", fontSize: 11, color: "rgba(255,255,255,0.66)", pointerEvents: "none" }}>
            {Math.round(canvasView.scale * 100)}%
          </div>
          {debugInspectorNode || selectedConnection ? (
            <div onPointerDown={(event) => event.stopPropagation()} style={debugInspectorStyle}>
              <div style={debugDockHeaderStyle}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                  <div style={debugDockTitleIconStyle}>
                    <NodeInspectIcon />
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 900, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {debugInspectorNode ? debugInspectorNode.label : "Runtime inspector"}
                    </div>
                    <div style={debugDockStatusRowStyle}>
                      <span style={getDebugStatusPillStyle(debugInspectorState?.status ?? "idle")}>
                        {debugInspectorState?.status ?? "selected"}
                      </span>
                      {selectedConnection ? (
                        <span style={debugDockMetaTextStyle}>
                          route: {selectedConnection.mode}
                        </span>
                      ) : null}
                    </div>
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  {debug.paused && debugInspectorNode && debug.pausedNodeId === debugInspectorNode.id ? (
                    <button type="button" onClick={onResumeDebug} style={primaryActionButtonStyle}>
                      Continue
                    </button>
                  ) : null}
                  {selectedConnection ? (
                    <button
                      type="button"
                      onClick={() => setSelectedConnectionId(null)}
                      title="Close route preview"
                      aria-label="Close route preview"
                      style={smallIconButtonStyle}
                    >
                      <CloseIcon />
                    </button>
                  ) : null}
                </div>
              </div>
              {debugInspectorState?.error ? (
                <div style={debugErrorStyle}>{debugInspectorState.error}</div>
              ) : null}
              <div style={debugDockGridStyle}>
                <div style={debugDockSectionStyle}>
                  <div style={debugSectionHeaderStyle}>
                    <span style={debugSectionIconStyle}><InputIcon /></span>
                    <span>Input</span>
                  </div>
                  <RuntimePacketPreview value={debugInspectorState?.input} />
                </div>
                <div style={debugDockSectionStyle}>
                  <div style={debugSectionHeaderStyle}>
                    <span style={debugSectionIconStyle}><OutputIcon /></span>
                    <span>Output</span>
                  </div>
                  <RuntimePacketPreview value={debugInspectorState?.output} />
                </div>
                {selectedConnection ? (
                  <div style={debugDockSectionStyle}>
                    <div style={debugSectionHeaderStyle}>
                      <span style={debugSectionIconStyle}><RouteIcon /></span>
                      <span>Route</span>
                    </div>
                    {selectedConnectionIssue ? (
                      <div style={selectedConnectionIssue.level === "error" ? validationErrorStyle : validationWarningStyle}>
                        {selectedConnectionIssue.message}
                      </div>
                    ) : (
                      <div style={portPacketRowStyle}>
                        <span>{selectedConnection.fromPortId}</span>
                        <span style={{ color: "rgba(255,255,255,0.52)" }}>to {selectedConnection.toPortId}</span>
                      </div>
                    )}
                    <RuntimePacketPreview value={selectedConnectionPacket ?? activeConnectionPacket} />
                  </div>
                ) : activeConnectionPacket ? (
                  <div style={debugDockSectionStyle}>
                    <div style={debugSectionHeaderStyle}>
                      <span style={debugSectionIconStyle}><RouteIcon /></span>
                      <span>Active route</span>
                    </div>
                    <RuntimePacketPreview value={activeConnectionPacket} />
                  </div>
                ) : null}
                {debugMemoryEntries.length ? (
                  <div style={debugDockSectionStyle}>
                    <div style={debugSectionHeaderStyle}>
                      <span style={debugSectionIconStyle}><MemoryIcon /></span>
                      <span>Memory</span>
                    </div>
                    <div style={debugMemoryListStyle} className="automation-panel-scroll">
                      {debugMemoryEntries.map(([key, value]) => (
                        <div key={key} style={debugMemoryRowStyle}>
                          <div style={debugMemoryKeyStyle}>{key}</div>
                          <RuntimePacketPreview value={value} />
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
        )}
      </section>

      <section style={{ borderLeft: "1px solid rgba(255,255,255,0.09)", minHeight: 0, overflow: "hidden", display: "grid", gridTemplateRows: "1fr" }}>
        <div style={rightPanelContentStyle}>
          <div style={rightPanelViewStackStyle}>
            <div style={getRightPanelViewStyle(rightPanelMode === "create-tool", "create-tool")}>
              <div className="automation-panel-scroll" style={toolBuilderScrollStyle}>
              <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 32px", alignItems: "start", gap: 8 }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 900 }}>{editingCustomToolId ? "Edit tool" : "Create tool"}</div>
                  <div style={{ marginTop: 3, fontSize: 11, color: "rgba(255,255,255,0.58)" }}>Build a reusable pipeline element with a guided template or raw browser code.</div>
                </div>
                <button type="button" onClick={closeCustomToolBuilder} title="Close tool builder" aria-label="Close tool builder" style={iconButtonStyle}>
                  <CloseIcon />
                </button>
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                <button
                  type="button"
                  onClick={() => {
                    setToolBuilderMode("guided");
                    if (!guidedKinds.includes(customToolDraft.kind)) {
                      selectGuidedKind(guidedKinds[0] ?? "compute");
                    }
                  }}
                  style={getCategoryButtonStyle(toolBuilderMode === "guided")}
                >
                  Guided
                </button>
                <button type="button" onClick={() => setToolBuilderMode("scripted")} style={getCategoryButtonStyle(toolBuilderMode === "scripted")}>Scripted</button>
              </div>
              <label style={toolBuilderFieldStyle}>
                <span>Name</span>
                <input value={customToolDraft.label} onChange={(event) => updateCustomToolDraft({ label: event.target.value })} style={inputStyle} />
              </label>
              <label style={toolBuilderFieldStyle}>
                <span>Description</span>
                <textarea
                  value={customToolDraft.description}
                  onChange={(event) => updateCustomToolDraft({ description: event.target.value })}
                  rows={3}
                  style={{ ...inputStyle, resize: "vertical" }}
                />
              </label>
              {toolBuilderMode === "guided" ? (
                <>
                  <label style={toolBuilderFieldStyle}>
                    <span>Category</span>
                    <select
                      value={customToolDraft.kind}
                      onChange={(event) => selectGuidedKind(event.target.value as AutomationNodeKind)}
                      style={inputStyle}
                    >
                      {guidedKinds.map((kind) => (
                        <option key={kind} value={kind}>{kind}</option>
                      ))}
                    </select>
                  </label>
                  <label style={toolBuilderFieldStyle}>
                    <span>Domain</span>
                    <select
                      value={guidedTemplate.domain}
                      onChange={(event) => selectGuidedDomain(customToolDraft.kind, event.target.value)}
                      style={inputStyle}
                    >
                      {guidedDomains.map((domain) => (
                        <option key={domain} value={domain}>{domain}</option>
                      ))}
                    </select>
                  </label>
                  <label style={toolBuilderFieldStyle}>
                    <span>Operation</span>
                    <select
                      value={guidedTemplate.id}
                      onChange={(event) => selectGuidedTemplate(event.target.value)}
                      style={inputStyle}
                    >
                      {guidedOperations.map((template) => (
                        <option key={template.id} value={template.id}>{template.operation}</option>
                      ))}
                    </select>
                  </label>
                  <div style={validationPanelStyle}>
                    <div style={{ fontSize: 11, fontWeight: 900, textTransform: "uppercase", color: "rgba(255,255,255,0.64)" }}>Template</div>
                    <div style={{ fontSize: 12, fontWeight: 800 }}>{guidedTemplate.summary}</div>
                    <div style={{ fontSize: 11, color: "rgba(255,255,255,0.62)", lineHeight: 1.35 }}>{guidedTemplate.description}</div>
                  </div>
                  {guidedTemplate.fields.map((field) => (
                    <label key={field.key} style={toolBuilderFieldStyle}>
                      <span>{field.label}</span>
                      {field.type === "select" ? (
                        <select
                          value={String(guidedValues[field.key] ?? "")}
                          onChange={(event) => updateGuidedField(field.key, event.target.value)}
                          style={inputStyle}
                        >
                          {(field.options ?? []).map((option) => (
                            <option key={String(option.value)} value={String(option.value)}>{option.label}</option>
                          ))}
                        </select>
                      ) : field.type === "boolean" ? (
                        <button
                          type="button"
                          onClick={() => updateGuidedField(field.key, !guidedValues[field.key])}
                          style={getSmallToggleIconButtonStyle(!!guidedValues[field.key])}
                        >
                          {guidedValues[field.key] ? "On" : "Off"}
                        </button>
                      ) : field.type === "text" ? (
                        <textarea
                          value={String(guidedValues[field.key] ?? "")}
                          onChange={(event) => updateGuidedField(field.key, event.target.value)}
                          rows={4}
                          placeholder={field.placeholder}
                          style={{ ...inputStyle, resize: "vertical" }}
                        />
                      ) : (
                        <input
                          value={String(guidedValues[field.key] ?? "")}
                          onChange={(event) => updateGuidedField(field.key, event.target.value)}
                          placeholder={field.placeholder}
                          style={inputStyle}
                        />
                      )}
                      {field.description ? <span style={{ fontSize: 11, color: "rgba(255,255,255,0.56)", lineHeight: 1.35 }}>{field.description}</span> : null}
                    </label>
                  ))}
                </>
              ) : (
                <>
                  <label style={toolBuilderFieldStyle}>
                    <span>Type</span>
                    <select
                      value={customToolDraft.kind}
                      onChange={(event) => updateCustomToolDraft({ kind: event.target.value as AutomationLibraryItem["kind"] })}
                      style={inputStyle}
                    >
                      {LIBRARY_SECTIONS.map((section) => (
                        <option key={section.kind} value={section.kind}>{section.title}</option>
                      ))}
                    </select>
                  </label>
                  <div style={validationPanelStyle}>
                    <div style={{ fontSize: 11, fontWeight: 900, textTransform: "uppercase", color: "rgba(255,255,255,0.64)" }}>Scripted tool runtime</div>
                    <div style={{ fontSize: 11, color: "rgba(255,255,255,0.62)", lineHeight: 1.45 }}>
                      Browser tools run in JavaScript. Use <code style={{ fontFamily: "Consolas, monospace" }}>function run(input, context)</code>.
                      <br />
                      Context includes selection, viewerState, previousViewerState, keyboardEvent, stateChange, and routed data.
                    </div>
                  </div>
                  <label style={toolBuilderFieldStyle}>
                    <span>Code</span>
                    <textarea
                      value={customToolDraft.code}
                      onChange={(event) => updateCustomToolDraft({ code: event.target.value })}
                      rows={10}
                      spellCheck={false}
                      style={{ ...inputStyle, resize: "vertical", fontFamily: "Consolas, monospace", lineHeight: 1.45 }}
                    />
                  </label>
                </>
              )}
              <div style={validationPanelStyle}>
                <div style={{ fontSize: 11, fontWeight: 900, textTransform: "uppercase", color: "rgba(255,255,255,0.64)" }}>Ports</div>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.62)", lineHeight: 1.35 }}>
                  {toolBuilderMode === "guided"
                    ? "Ports are generated from the selected template so the tool plugs into the graph immediately."
                    : "Scripted tools still get sensible ports from their selected type. Fine-grained port editing can layer on top of this."}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  <div>
                    <div style={debugDataLabelStyle}>Inputs</div>
                    {customToolDraft.inputs.length ? customToolDraft.inputs.map((port) => <div key={port.id} style={portPacketRowStyle}>{port.label}<span>{port.dataType}</span></div>) : <div style={emptyPortStyle}>No inputs</div>}
                  </div>
                  <div>
                    <div style={debugDataLabelStyle}>Outputs</div>
                    {customToolDraft.outputs.length ? customToolDraft.outputs.map((port) => <div key={port.id} style={portPacketRowStyle}>{port.label}<span>{port.dataType}</span></div>) : <div style={emptyPortStyle}>No outputs</div>}
                  </div>
                </div>
              </div>
              <button type="button" onClick={saveCustomTool} style={primaryActionButtonStyle}>{editingCustomToolId ? "Save changes" : "Save tool"}</button>
              </div>
            </div>
            <div style={getRightPanelViewStyle(rightPanelMode === "library", "library")}>
          <div style={nodeLibraryPanelStyle}>
          <div style={nodeLibraryControlsStyle}>
            <div style={{ display: "grid", gridTemplateColumns: "32px minmax(0, 1fr)", alignItems: "center", gap: 8 }}>
              <button type="button" onClick={() => setRightPanelOpen(false)} title="Hide node library" aria-label="Hide node library" style={iconButtonStyle}>
                <PanelIcon side="right" />
              </button>
              <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 32px", gap: 8 }}>
                <input
                  value={nodeSearch}
                  onChange={(event) => setNodeSearch(event.target.value)}
                  placeholder="Search nodes"
                  aria-label="Search nodes"
                  style={inputStyle}
                />
                <button type="button" onClick={startCreateCustomTool} title="Create custom tool" aria-label="Create custom tool" style={primaryIconButtonStyle}><PlusIcon /></button>
              </div>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              <button
                type="button"
                onClick={() => setNodeCategory("all")}
                style={getCategoryButtonStyle(nodeCategory === "all")}
              >
                All
              </button>
              <button
                type="button"
                onClick={() => setNodeCategory("custom")}
                style={getCategoryButtonStyle(nodeCategory === "custom")}
              >
                My tools
              </button>
              {LIBRARY_SECTIONS.map((section) => (
                <button
                  key={section.kind}
                  type="button"
                  onClick={() => setNodeCategory(section.kind)}
                  style={getCategoryButtonStyle(nodeCategory === section.kind)}
                >
                  {section.title}
                </button>
              ))}
            </div>
          {validationIssues.length ? (
            <div style={validationPanelStyle}>
              <div style={{ fontSize: 11, fontWeight: 900, textTransform: "uppercase", color: "rgba(255,255,255,0.64)" }}>
                Validation
              </div>
              {validationIssues.slice(0, 4).map((issue, index) => (
                <div key={`${issue.nodeId ?? issue.connectionId ?? "pipeline"}-${index}`} style={issue.level === "error" ? validationErrorStyle : validationWarningStyle}>
                  {issue.message}
                </div>
              ))}
            </div>
          ) : null}
          </div>
          <div className="automation-panel-scroll" style={nodeLibraryListScrollStyle}>
          {librarySections.map((section) => (
            <div key={section.kind} style={{ display: "grid", gap: 7 }}>
              <div style={{ fontSize: 11, fontWeight: 900, color: "rgba(255,255,255,0.58)", textTransform: "uppercase" }}>
                {section.title}
              </div>
              {section.items.map((item) => {
                const isCustomTool = item.token.startsWith("custom.");
                return (
                  <div key={item.id} style={{ position: "relative" }}>
                    <button
                      type="button"
                      draggable
                      onDragStart={(event) => handleLibraryDragStart(event, item)}
                      onDragEnd={handleLibraryDragEnd}
                      title="Drag into the canvas"
                      style={{ ...libraryButtonStyle, width: "100%", border: `1px solid ${getNodeAccent(item.kind)}44` }}
                    >
                      <span style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                        <span style={{ fontSize: 12, fontWeight: 900 }}>{item.label}</span>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                          {isCustomTool ? <span style={customToolPillStyle}>Mine</span> : null}
                          <span style={{ fontSize: 10, color: getNodeAccent(item.kind), textTransform: "uppercase" }}>{item.kind}</span>
                        </span>
                      </span>
                      <span style={{ display: "block", marginTop: 15, paddingRight: isCustomTool ? 34 : 0, fontSize: 11, color: "rgba(255,255,255,0.60)", lineHeight: 1.35 }}>
                        {item.description}
                      </span>
                    </button>
                    {isCustomTool ? (
                      <>
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            setOpenCustomToolMenuId((current) => current === item.id ? null : item.id);
                          }}
                          title="Custom tool options"
                          aria-label={`Options for ${item.label}`}
                          style={customToolMenuButtonStyle}
                        >
                          <MoreIcon />
                        </button>
                        {openCustomToolMenuId === item.id ? (
                          <div style={customToolMenuStyle}>
                            <button type="button" onClick={() => startEditCustomTool(item.id)} style={menuButtonStyle}>Edit</button>
                            <button type="button" onClick={() => requestDeleteCustomTool(item.id)} style={{ ...menuButtonStyle, color: "#ffb4b4" }}>Delete</button>
                          </div>
                        ) : null}
                      </>
                    ) : null}
                  </div>
                );
              })}
            </div>
          ))}
          </div>
          </div>
            </div>
          </div>
        </div>
      </section>
    </aside>
  );
}


const rightPanelContentStyle: CSSProperties = {
  minHeight: 0,
  overflow: "hidden",
  padding: "24px 12px 0px",
  display: "grid",
};

const rightPanelViewStackStyle: CSSProperties = {
  display: "grid",
  alignItems: "stretch",
  minWidth: 0,
  minHeight: 0,
  height: "100%",
};

const toolBuilderScrollStyle: CSSProperties = {
  display: "grid",
  alignContent: "start",
  gap: 12,
  minHeight: 0,
  overflow: "auto",
  paddingRight: 4,
};

const nodeLibraryPanelStyle: CSSProperties = {
  display: "grid",
  gridTemplateRows: "auto minmax(0, 1fr)",
  gap: 12,
  minHeight: 0,
  height: "100%",
};

const nodeLibraryControlsStyle: CSSProperties = {
  display: "grid",
  gap: 8,
  minWidth: 0,
};

const nodeLibraryListScrollStyle: CSSProperties = {
  display: "grid",
  alignContent: "start",
  gap: 12,
  minHeight: 0,
  overflowY: "auto",
  overflowX: "hidden",
  paddingRight: 4,
};

function getRightPanelViewStyle(isActive: boolean, mode: "library" | "create-tool"): CSSProperties {
  const hiddenOffset = mode === "create-tool" ? 14 : -14;
  return {
    gridArea: "1 / 1",
    minWidth: 0,
    minHeight: 0,
    height: "100%",
    display: "grid",
    alignContent: "stretch",
    gap: 14,
    opacity: isActive ? 1 : 0,
    transform: isActive ? "translateX(0)" : `translateX(${hiddenOffset}px)`,
    filter: isActive ? "blur(0px)" : "blur(1px)",
    pointerEvents: isActive ? "auto" : "none",
    transition: "opacity 180ms ease, transform 180ms ease, filter 180ms ease",
  };
}

const inputStyle: CSSProperties = {
  width: "100%",
  minWidth: 0,
  boxSizing: "border-box",
  borderRadius: 8,
  border: "1px solid rgba(255,255,255,0.12)",
  background: "rgba(255,255,255,0.06)",
  color: "white",
  padding: "9px 10px",
  fontSize: 13,
  outline: "none",
  fontFamily: UI_FONT_FAMILY,
};

const toolBuilderFieldStyle: CSSProperties = {
  display: "grid",
  gap: 6,
  fontSize: 12,
  fontWeight: 900,
  color: "rgba(255,255,255,0.82)",
};

function getNodeAccent(kind: AutomationLibraryItem["kind"]) {
  if (kind === "event") return "#7cc7ff";
  if (kind === "source") return "#9fe6cf";
  if (kind === "condition") return "#c8d5e8";
  if (kind === "compute") return "#ffc978";
  if (kind === "external") return "#b8a7ff";
  return "#9ecfff";
}

function getDebugNodeStyle(
  status: AutomationDebugSnapshot["nodeStates"][string]["status"] | undefined,
  accent: string
): Pick<CSSProperties, "border" | "background" | "boxShadow"> & { dotColor?: string; labelColor?: string } {
  if (status === "running") {
    return {
      border: `1px solid ${accent}`,
      background: "rgba(24,34,42,0.98)",
      boxShadow: `0 0 0 2px ${accent}44, 0 0 28px ${accent}66, 0 16px 34px rgba(0,0,0,0.36)`,
      labelColor: accent,
    };
  }
  if (status === "paused") {
    return {
      border: "1px solid #ffd27a",
      background: "rgba(38,31,18,0.98)",
      boxShadow: "0 0 0 2px rgba(255,210,122,0.28), 0 0 30px rgba(255,210,122,0.36)",
      dotColor: "#ffd27a",
      labelColor: "#ffd27a",
    };
  }
  if (status === "success") {
    return {
      border: "1px solid rgba(159,230,207,0.86)",
      boxShadow: "0 0 0 1px rgba(159,230,207,0.20), 0 12px 28px rgba(0,0,0,0.30)",
      dotColor: "#9fe6cf",
      labelColor: "#9fe6cf",
    };
  }
  if (status === "error") {
    return {
      border: "1px solid rgba(255,130,130,0.90)",
      background: "rgba(45,18,20,0.98)",
      boxShadow: "0 0 0 2px rgba(255,130,130,0.24), 0 0 30px rgba(255,70,70,0.30)",
      dotColor: "#ff9a9a",
      labelColor: "#ffb3b3",
    };
  }
  if (status === "queued") {
    return {
      border: `1px solid ${accent}aa`,
      boxShadow: `0 0 0 1px ${accent}22, 0 12px 28px rgba(0,0,0,0.30)`,
      labelColor: "rgba(255,255,255,0.72)",
    };
  }
  if (status === "skipped") {
    return {
      border: "1px solid rgba(255,255,255,0.12)",
      background: "rgba(15,18,24,0.72)",
      labelColor: "rgba(255,255,255,0.42)",
    };
  }
  return {};
}

function formatDebugValue(value: unknown) {
  if (value === undefined) return "No data";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function RuntimePacketPreview({ value }: { value: unknown }) {
  const packet = isRuntimePacketLike(value) ? value : null;
  const output = isRuntimeOutputLike(value) && !packet ? value : null;
  const displayValue = output ? output.value : packet ? packet.value : value;
  const displayPorts =
    output && isRecord(output.ports)
      ? output.ports
      : packet?.meta && isRecord(packet.meta.ports)
      ? packet.meta.ports
      : null;

  return (
    <div style={{ display: "grid", gap: 7, minWidth: 0 }}>
      {packet ? <div style={packetBadgeStyle}>{packet.type}</div> : null}
      <pre style={debugDataBlockStyle}>{formatDebugValue(displayValue)}</pre>
      {displayPorts ? (
        <div style={{ display: "grid", gap: 5 }}>
          <div style={{ fontSize: 10, fontWeight: 900, color: "rgba(255,255,255,0.52)", textTransform: "uppercase" }}>
            Ports
          </div>
          <div style={runtimePortsWrapStyle}>
            {Object.entries(displayPorts).map(([portId, portValue]) => (
              <div key={portId} style={runtimePortChipStyle}>
                <span style={{ fontWeight: 900 }}>{portId}</span>
                <span style={{ color: "rgba(255,255,255,0.60)" }}>
                  {isRuntimePacketLike(portValue) ? portValue.type : typeof portValue}
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function isRuntimePacketLike(value: unknown): value is { type: string; value: unknown; meta?: Record<string, unknown> } {
  return isRecord(value) && typeof value.type === "string" && "value" in value;
}

function isRuntimeOutputLike(value: unknown): value is { value: unknown; ports?: Record<string, unknown> } {
  return isRecord(value) && "value" in value && "ports" in value;
}

function getBreakpointButtonStyle(active: boolean): CSSProperties {
  return {
    width: 13,
    height: 13,
    borderRadius: 999,
    border: active ? "1px solid rgba(255,100,100,0.95)" : "1px solid rgba(255,255,255,0.22)",
    background: active ? "#ff6969" : "rgba(255,255,255,0.06)",
    boxShadow: active ? "0 0 10px rgba(255,90,90,0.55)" : "none",
    cursor: "pointer",
    padding: 0,
  };
}

const portGroupStyle: CSSProperties = {
  minHeight: 18,
  display: "grid",
  alignContent: "start",
  gap: 4,
};

const portPillStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 5,
  width: "fit-content",
  maxWidth: "100%",
  borderRadius: 999,
  border: "1px solid rgba(255,255,255,0.12)",
  background: "rgba(255,255,255,0.055)",
  color: "rgba(255,255,255,0.70)",
  padding: "2px 6px",
  fontSize: 10,
  fontWeight: 800,
  lineHeight: 1.1,
};

function getConnectionStroke(
  mode: AutomationConnection["mode"],
  issue?: AutomationValidationIssue
): string {
  if (issue?.level === "error") return "#ff8b8b";
  return mode === "data" ? "#9fe6cf" : "#7cc7ff";
}

function getInputPortStyle(dataType: AutomationNodePort["dataType"], connected: boolean): CSSProperties {
  return {
    ...portPillStyle,
    position: "relative",
    minHeight: 21,
    padding: "3px 7px 3px 8px",
    cursor: connected ? "grab" : "default",
    border: "1px solid rgba(255,255,255,0.12)",
    background: connected ? "rgba(255,255,255,0.075)" : "rgba(255,255,255,0.045)",
    color: dataType === "trigger" ? "rgba(210,235,255,0.88)" : "rgba(224,246,239,0.86)",
  };
}

function getOutputPortStyle(dataType: AutomationNodePort["dataType"]): CSSProperties {
  return {
    ...portPillStyle,
    position: "relative",
    minHeight: 21,
    padding: "3px 8px",
    cursor: "grab",
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(255,255,255,0.055)",
    color: dataType === "trigger" ? "rgba(210,235,255,0.88)" : "rgba(224,246,239,0.86)",
  };
}

function getInputSocketStyle(dataType: AutomationNodePort["dataType"], connected: boolean): CSSProperties {
  const color = dataType === "trigger" ? "#7cc7ff" : "#9fe6cf";
  return {
    width: 11,
    height: 11,
    borderRadius: 999,
    border: `1.7px solid ${color}`,
    background: "transparent",
    boxShadow: connected ? `0 0 0 2px ${color}18` : undefined,
    flex: "0 0 auto",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
  };
}

function getInputSocketDotStyle(dataType: AutomationNodePort["dataType"]): CSSProperties {
  const color = dataType === "trigger" ? "#7cc7ff" : "#9fe6cf";
  return {
    width: 5,
    height: 5,
    borderRadius: 999,
    background: color,
    boxShadow: `0 0 8px ${color}66`,
  };
}

function getOutputConnectorStyle(dataType: AutomationNodePort["dataType"]): CSSProperties {
  const color = dataType === "trigger" ? "#7cc7ff" : "#9fe6cf";
  return {
    width: 11,
    height: 11,
    borderRadius: 999,
    border: `1.5px solid ${color}`,
    background: color,
    flex: "0 0 auto",
  };
}

const nodeDeleteButtonStyle: CSSProperties = {
  width: 22,
  height: 22,
  borderRadius: 6,
  border: "1px solid rgba(255,255,255,0.12)",
  background: "rgba(255,255,255,0.07)",
  color: "rgba(255,255,255,0.78)",
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 0,
};

const emptyPortStyle: CSSProperties = {
  color: "rgba(255,255,255,0.32)",
  fontSize: 10,
  fontWeight: 700,
};

const nodeDropPreviewStyle: CSSProperties = {
  position: "absolute",
  width: 210,
  minHeight: 104,
  borderRadius: 8,
  background: "rgba(18,22,30,0.70)",
  color: "white",
  padding: 12,
  display: "grid",
  alignContent: "start",
  gap: 7,
  fontFamily: UI_FONT_FAMILY,
  pointerEvents: "none",
  userSelect: "none",
  opacity: 0.74,
  backdropFilter: "blur(4px)",
};

const iconButtonStyle: CSSProperties = {
  width: 32,
  height: 32,
  borderRadius: 8,
  border: "1px solid rgba(255,255,255,0.10)",
  background: "rgba(255,255,255,0.05)",
  color: "white",
  cursor: "pointer",
  fontWeight: 900,
  fontFamily: UI_FONT_FAMILY,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
};

const primaryIconButtonStyle: CSSProperties = {
  ...iconButtonStyle,
  border: "1px solid rgba(120,190,255,0.45)",
  background: "rgba(120,190,255,0.16)",
};

const floatingToolButtonStyle: CSSProperties = {
  ...iconButtonStyle,
  width: 34,
  height: 34,
  background: "rgba(12,14,18,0.82)",
  backdropFilter: "blur(10px)",
  boxShadow: "0 10px 24px rgba(0,0,0,0.26)",
};

function getFloatingToggleButtonStyle(active: boolean): CSSProperties {
  return {
    ...floatingToolButtonStyle,
    border: active ? "1px solid rgba(120,190,255,0.52)" : floatingToolButtonStyle.border,
    background: active ? "rgba(120,190,255,0.18)" : floatingToolButtonStyle.background,
    color: active ? "#d9eeff" : floatingToolButtonStyle.color,
  };
}

const scriptWorkspaceStyle: CSSProperties = {
  minHeight: 0,
  padding: "62px 18px 104px",
  background: "#090b10",
  display: "grid",
  gridTemplateRows: "auto minmax(0, 1fr)",
  gap: 12,
  color: "white",
};

const scriptWorkspaceTextareaStyle: CSSProperties = {
  ...inputStyle,
  height: "100%",
  minHeight: 0,
  resize: "none",
  fontFamily: "Consolas, monospace",
  lineHeight: 1.5,
  fontSize: 12,
  background: "rgba(255,255,255,0.045)",
};

const smallIconButtonStyle: CSSProperties = {
  width: 24,
  minWidth: 24,
  height: 28,
  borderRadius: 6,
  border: "1px solid transparent",
  background: "transparent",
  color: "rgba(255,255,255,0.58)",
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 0,
};

const rowRunButtonStyle: CSSProperties = {
  position: "relative",
  width: 28,
  height: 28,
  borderRadius: 7,
  border: "1px solid rgba(120,190,255,0.20)",
  background: "rgba(120,190,255,0.08)",
  color: "rgba(210,235,255,0.92)",
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 0,
  overflow: "visible",
};

const runButtonLoaderRingStyle: CSSProperties = {
  position: "absolute",
  inset: -5,
  borderRadius: 999,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  pointerEvents: "none",
  color: "rgba(120,190,255,0.9)",
};

const runStatusDotStyle: CSSProperties = {
  position: "absolute",
  right: -4,
  top: -4,
  width: 8,
  height: 8,
  borderRadius: 999,
  pointerEvents: "none",
};

const pipelineDetailsInputStyle: CSSProperties = {
  width: "100%",
  minWidth: 0,
  height: 36,
  borderRadius: 8,
  border: "1px solid rgba(120,190,255,0.34)",
  background: "rgba(255,255,255,0.07)",
  color: "white",
  padding: "0 10px",
  fontSize: 13,
  fontWeight: 800,
  outline: "none",
  fontFamily: UI_FONT_FAMILY,
};

const pipelineDetailsTextareaStyle: CSSProperties = {
  ...pipelineDetailsInputStyle,
  height: 88,
  resize: "vertical",
  padding: "9px 10px",
  lineHeight: 1.35,
  fontWeight: 650,
};

const rowRenameInputStyle: CSSProperties = {
  width: "100%",
  minWidth: 0,
  height: 34,
  borderRadius: 7,
  border: "1px solid rgba(120,190,255,0.48)",
  background: "rgba(255,255,255,0.07)",
  color: "white",
  padding: "0 9px",
  fontSize: 13,
  fontWeight: 800,
  outline: "none",
  fontFamily: UI_FONT_FAMILY,
};

function getConfigToggleStyle(active: boolean): CSSProperties {
  return {
    width: "fit-content",
    minHeight: 32,
    borderRadius: 8,
    border: active ? "1px solid rgba(120,190,255,0.48)" : "1px solid rgba(255,255,255,0.12)",
    background: active ? "rgba(120,190,255,0.16)" : "rgba(255,255,255,0.06)",
    color: active ? "#d7eeff" : "rgba(255,255,255,0.78)",
    padding: "0 12px",
    cursor: "pointer",
    fontSize: 12,
    fontWeight: 800,
    fontFamily: UI_FONT_FAMILY,
  };
}

const validationPanelStyle: CSSProperties = {
  borderRadius: 8,
  border: "1px solid rgba(255,255,255,0.10)",
  background: "rgba(255,255,255,0.045)",
  padding: 10,
  display: "grid",
  gap: 7,
};

const validationWarningStyle: CSSProperties = {
  borderRadius: 7,
  border: "1px solid rgba(255,210,122,0.24)",
  background: "rgba(255,210,122,0.10)",
  color: "#ffe0a0",
  padding: "7px 8px",
  fontSize: 11,
  lineHeight: 1.35,
};

const validationErrorStyle: CSSProperties = {
  ...validationWarningStyle,
  border: "1px solid rgba(255,130,130,0.26)",
  background: "rgba(190,60,60,0.14)",
  color: "#ffd1d1",
};

function getNodeValidationBadgeStyle(level: AutomationValidationIssue["level"]): CSSProperties {
  const isError = level === "error";
  return {
    width: 18,
    height: 18,
    borderRadius: 999,
    border: isError ? "1px solid rgba(255,130,130,0.50)" : "1px solid rgba(255,210,122,0.50)",
    background: isError ? "rgba(190,60,60,0.22)" : "rgba(255,210,122,0.16)",
    color: isError ? "#ffd1d1" : "#ffe0a0",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 11,
    fontWeight: 950,
    lineHeight: 1,
  };
}

const templateMenuStyle: CSSProperties = {
  position: "absolute",
  right: 0,
  top: 38,
  zIndex: 30,
  width: 264,
  maxHeight: 360,
  overflow: "auto",
  borderRadius: 8,
  border: "1px solid rgba(255,255,255,0.12)",
  background: "rgba(15,18,24,0.98)",
  boxShadow: "0 18px 44px rgba(0,0,0,0.42)",
  padding: 6,
  display: "grid",
  gap: 4,
  fontFamily: UI_FONT_FAMILY,
};

const templateMenuButtonStyle: CSSProperties = {
  border: "none",
  borderRadius: 7,
  background: "transparent",
  color: "white",
  cursor: "pointer",
  display: "grid",
  gap: 3,
  padding: "9px 10px",
  textAlign: "left",
  fontFamily: UI_FONT_FAMILY,
};

const templateMenuDescriptionStyle: CSSProperties = {
  color: "rgba(255,255,255,0.58)",
  fontSize: 11,
  lineHeight: 1.3,
  fontWeight: 650,
};

const libraryButtonStyle: CSSProperties = {
  borderRadius: 8,
  border: "1px solid rgba(255,255,255,0.08)",
  background: "rgba(255,255,255,0.045)",
  color: "white",
  textAlign: "left",
  padding: 10,
  cursor: "pointer",
  minWidth: 0,
  fontFamily: UI_FONT_FAMILY,
};

const customToolPillStyle: CSSProperties = {
  borderRadius: 999,
  border: "1px solid rgba(120,190,255,0.28)",
  background: "rgba(120,190,255,0.13)",
  color: "#d9eeff",
  padding: "2px 6px",
  fontSize: 9,
  fontWeight: 900,
  textTransform: "uppercase",
};

const customToolMenuButtonStyle: CSSProperties = {
  position: "absolute",
  right: 7,
  bottom: 7,
  width: 26,
  height: 26,
  borderRadius: 7,
  border: "1px solid rgba(255,255,255,0.10)",
  background: "rgba(8,10,14,0.78)",
  color: "rgba(255,255,255,0.76)",
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
};

const customToolMenuStyle: CSSProperties = {
  position: "absolute",
  right: 7,
  bottom: 36,
  zIndex: 8,
  minWidth: 118,
  borderRadius: 9,
  border: "1px solid rgba(255,255,255,0.12)",
  background: "rgba(12,15,20,0.98)",
  boxShadow: "0 14px 32px rgba(0,0,0,0.42)",
  padding: 4,
  display: "grid",
  gap: 2,
};

function getCategoryButtonStyle(active: boolean): CSSProperties {
  return {
    minHeight: 26,
    borderRadius: 999,
    border: active ? "1px solid rgba(120,190,255,0.42)" : "1px solid rgba(255,255,255,0.08)",
    background: active ? "rgba(120,190,255,0.14)" : "rgba(255,255,255,0.04)",
    color: active ? "#d9eeff" : "rgba(255,255,255,0.68)",
    padding: "0 9px",
    cursor: "pointer",
    fontSize: 11,
    fontWeight: 800,
    fontFamily: UI_FONT_FAMILY,
  };
}

function getPipelineRowRunStatus(
  pipeline: AutomationPipeline,
  debug: AutomationDebugSnapshot,
  runningPipelineId: string | null,
  localOutcome: "success" | "error" | undefined
) {
  if (debug.pipelineId === pipeline.id) {
    const states = Object.values(debug.nodeStates);
    if (debug.paused) return "paused";
    if (states.some((state) => state.status === "error")) return "error";
    if (debug.running) return "running";
    if (states.some((state) => state.status === "success" || state.status === "skipped")) return "success";
  }
  if (runningPipelineId === pipeline.id) return "running";
  return localOutcome ?? "idle";
}

function getPipelineRunButtonLabel(name: string, status: string) {
  if (status === "running") return `Stop ${name}`;
  if (status === "paused") return `Resume ${name}`;
  return `Run ${name}`;
}

function getDebugStatusPillStyle(status: string): CSSProperties {
  const tone =
    status === "running"
      ? { border: "rgba(120,190,255,0.34)", background: "rgba(120,190,255,0.14)", color: "#dcefff" }
      : status === "paused"
      ? { border: "rgba(243,205,99,0.34)", background: "rgba(243,205,99,0.14)", color: "#ffe8a8" }
      : status === "error"
      ? { border: "rgba(255,122,122,0.34)", background: "rgba(255,122,122,0.14)", color: "#ffd5d5" }
      : status === "success"
      ? { border: "rgba(103,217,143,0.34)", background: "rgba(103,217,143,0.14)", color: "#d8ffe5" }
      : { border: "rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.72)" };
  return {
    borderRadius: 999,
    border: `1px solid ${tone.border}`,
    background: tone.background,
    color: tone.color,
    padding: "3px 8px",
    fontSize: 10,
    fontWeight: 900,
    textTransform: "uppercase",
    whiteSpace: "nowrap",
  };
}

const debugInspectorStyle: CSSProperties = {
  position: "absolute",
  left: 14,
  right: 14,
  bottom: 96,
  width: "auto",
  borderRadius: 8,
  border: "1px solid rgba(255,255,255,0.12)",
  background: "rgba(10,12,16,0.94)",
  boxShadow: "0 16px 42px rgba(0,0,0,0.38)",
  color: "white",
  padding: 12,
  display: "grid",
  gap: 10,
  fontFamily: UI_FONT_FAMILY,
  boxSizing: "border-box",
  overflow: "hidden",
};

const debugDockHeaderStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
};

const debugDockTitleIconStyle: CSSProperties = {
  width: 30,
  height: 30,
  borderRadius: 8,
  border: "1px solid rgba(255,255,255,0.10)",
  background: "rgba(255,255,255,0.045)",
  color: "rgba(220,238,255,0.9)",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  flex: "0 0 auto",
};

const debugDockStatusRowStyle: CSSProperties = {
  marginTop: 4,
  display: "flex",
  alignItems: "center",
  gap: 8,
  flexWrap: "wrap",
};

const debugDockMetaTextStyle: CSSProperties = {
  fontSize: 10,
  fontWeight: 800,
  color: "rgba(255,255,255,0.56)",
  textTransform: "uppercase",
};

const debugDockGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 10,
  minWidth: 0,
};

const debugDockSectionStyle: CSSProperties = {
  minWidth: 0,
  borderRadius: 8,
  border: "1px solid rgba(255,255,255,0.08)",
  background: "rgba(255,255,255,0.035)",
  padding: 10,
  display: "grid",
  gap: 8,
  alignContent: "start",
};

const debugSectionHeaderStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 7,
  minWidth: 0,
  fontSize: 11,
  fontWeight: 900,
  color: "rgba(255,255,255,0.78)",
  textTransform: "uppercase",
};

const debugSectionIconStyle: CSSProperties = {
  width: 22,
  height: 22,
  borderRadius: 6,
  border: "1px solid rgba(255,255,255,0.10)",
  background: "rgba(255,255,255,0.04)",
  color: "rgba(220,238,255,0.88)",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  flex: "0 0 auto",
};

const debugDataLabelStyle: CSSProperties = {
  marginBottom: 5,
  fontSize: 10,
  fontWeight: 900,
  color: "rgba(255,255,255,0.56)",
  textTransform: "uppercase",
};

const debugMemoryListStyle: CSSProperties = {
  display: "grid",
  gap: 7,
  maxHeight: 220,
  overflowY: "auto",
  minWidth: 0,
  paddingRight: 2,
};

const debugMemoryRowStyle: CSSProperties = {
  display: "grid",
  gap: 4,
  minWidth: 0,
};

const debugMemoryKeyStyle: CSSProperties = {
  fontSize: 10,
  fontWeight: 900,
  color: "rgba(255,255,255,0.72)",
  textTransform: "uppercase",
  letterSpacing: 0.2,
};

const debugDataBlockStyle: CSSProperties = {
  margin: 0,
  minHeight: 74,
  maxHeight: 148,
  overflow: "auto",
  borderRadius: 8,
  border: "1px solid rgba(255,255,255,0.08)",
  background: "rgba(0,0,0,0.24)",
  color: "rgba(235,245,255,0.86)",
  padding: 8,
  fontSize: 11,
  lineHeight: 1.4,
  fontFamily: "Consolas, monospace",
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
  boxSizing: "border-box",
};

const packetBadgeStyle: CSSProperties = {
  width: "fit-content",
  borderRadius: 999,
  border: "1px solid rgba(120,190,255,0.26)",
  background: "rgba(120,190,255,0.10)",
  color: "#d7eeff",
  padding: "3px 7px",
  fontSize: 10,
  fontWeight: 900,
  textTransform: "uppercase",
};

const runtimePortsWrapStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 6,
};

const runtimePortChipStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  minHeight: 24,
  borderRadius: 999,
  border: "1px solid rgba(255,255,255,0.10)",
  background: "rgba(255,255,255,0.045)",
  padding: "0 8px",
  fontSize: 10,
  whiteSpace: "nowrap",
};

const portPacketRowStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr) auto",
  gap: 8,
  alignItems: "center",
  borderRadius: 7,
  border: "1px solid rgba(255,255,255,0.08)",
  background: "rgba(255,255,255,0.04)",
  color: "rgba(235,245,255,0.82)",
  padding: "6px 7px",
  fontSize: 10,
};

const debugErrorStyle: CSSProperties = {
  borderRadius: 8,
  border: "1px solid rgba(255,130,130,0.24)",
  background: "rgba(190,60,60,0.14)",
  color: "#ffd1d1",
  padding: 9,
  fontSize: 12,
  lineHeight: 1.35,
  wordBreak: "break-word",
  overflowWrap: "anywhere",
};

const menuButtonStyle: CSSProperties = {
  border: "none",
  borderRadius: 6,
  background: "transparent",
  color: "rgba(255,255,255,0.88)",
  padding: "8px 9px",
  textAlign: "left",
  cursor: "pointer",
  fontSize: 12,
  fontWeight: 700,
  fontFamily: UI_FONT_FAMILY,
};

const secondaryActionButtonStyle: CSSProperties = {
  minHeight: 34,
  borderRadius: 8,
  border: "1px solid rgba(255,255,255,0.10)",
  background: "rgba(255,255,255,0.05)",
  color: "white",
  padding: "0 12px",
  cursor: "pointer",
  fontSize: 12,
  fontWeight: 800,
  fontFamily: UI_FONT_FAMILY,
};

const primaryActionButtonStyle: CSSProperties = {
  ...secondaryActionButtonStyle,
  border: "1px solid rgba(120,190,255,0.42)",
  background: "rgba(120,190,255,0.16)",
};

const dangerActionButtonStyle: CSSProperties = {
  ...secondaryActionButtonStyle,
  border: "1px solid rgba(255,140,140,0.34)",
  background: "rgba(200,70,70,0.18)",
};


function getSmallToggleIconButtonStyle(isActive: boolean): CSSProperties {
  return {
    width: 26,
    height: 28,
    borderRadius: 7,
    border: isActive ? "1px solid rgba(120,190,255,0.42)" : "1px solid rgba(255,255,255,0.08)",
    background: isActive ? "rgba(120,190,255,0.15)" : "rgba(255,255,255,0.035)",
    color: isActive ? "#d7eeff" : "rgba(255,255,255,0.68)",
    cursor: "pointer",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 0,
    fontFamily: UI_FONT_FAMILY,
  };
}
