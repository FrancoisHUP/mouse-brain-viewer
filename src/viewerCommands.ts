import type { AutomationPipeline } from "./automationTypes";
import type {
  BrowserResourceSummary,
  ResourceHistorySample,
} from "./resourceTelemetry";
import type { ViewerStatePatchV1, ViewerStateV1 } from "./viewerState";

type JsonPrimitive = string | number | boolean | null;
type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export type ViewerCommandSummary = {
  id: string;
  title: string;
  description: string;
  usage: string;
  examples: string[];
};

export type ViewerCommandExecutionResult = {
  commandId: string;
  payload: unknown;
  result: unknown;
  stdout?: string;
  success?: boolean;
  steps?: ViewerCommandExecutionStep[];
  downloads?: ViewerCommandDownload[];
  variables?: Record<string, string>;
};

export type ViewerCommandExecutionStep = {
  commandId: string;
  payload: unknown;
  result: unknown;
  stdout: string;
  success: boolean;
};

export type ViewerCommandDownload = {
  filename: string;
  content: string;
  mimeType: string;
  append?: boolean;
};

export type ViewerCommandShellFile = {
  content: string;
  mimeType: string;
};

export type ViewerCommandRunOptions = {
  stdin?: string;
  files?: Record<string, ViewerCommandShellFile>;
  variables?: Record<string, string>;
};

export type ViewerCommandContext = {
  getState: () => ViewerStateV1;
  getSelectedNodeId: () => string | null;
  getFloatingWindows: () => ViewerStateV1["layout"]["windows"];
  setState: (state: ViewerStateV1) => ViewerStateV1;
  setStateJson: (stateJson: string) => ViewerStateV1;
  patchState: (patch: ViewerStatePatchV1) => ViewerStateV1;
  setLayoutCollapsed: (collapsed: boolean) => ViewerStateV1;
  setInspectorCollapsed: (collapsed: boolean) => ViewerStateV1;
  selectNode: (nodeId: string | null) => ViewerStateV1;
  setNodeVisibility: (nodeId: string, visible: boolean) => ViewerStateV1;
  toggleNodeVisibility: (nodeId: string) => ViewerStateV1;
  setSelectedOpacity: (opacity: number) => ViewerStateV1;
  focusSelectedLayer: () => { focused: boolean; selectedNodeId: string | null };
  focusWindow: (id: string) => ViewerStateV1["layout"]["windows"];
  updateWindow: (
    id: string,
    patch: Partial<NonNullable<ViewerStateV1["layout"]["windows"]>[number]>
  ) => ViewerStateV1["layout"]["windows"];
  closeWindow: (id: string) => ViewerStateV1["layout"]["windows"];
  openSelectedMetadataWindow: (mode?: "edit" | "preview" | "split") => ViewerStateV1["layout"]["windows"];
  openExport: () => void;
  openImport: () => void;
  openImportWorkspace: (view: "library" | "import-external" | "import-local") => {
    open: true;
    view: "library" | "import-external" | "import-local";
  };
  openLocalDatasetManager: (sourceId?: string | null) => {
    open: true;
    sourceId: string | null;
  };
  openSelectedLayerSourceDetails: (nodeId?: string | null) => {
    opened: boolean;
    nodeId: string | null;
  };
  openViewerLibraryWorkspace: () => { open: true };
  closeDialogs: () => void;
  undo: () => ViewerStateV1 | null;
  redo: () => ViewerStateV1 | null;
  clearHistory: () => ViewerStateV1;
  listPipelines: () => AutomationPipeline[];
  getActivePipeline: () => AutomationPipeline | null;
  openPipeline: (pipelineId: string) => AutomationPipeline;
  runPipeline: (pipelineId: string) => Promise<{ status: "success" | "error" | "stopped" | "info" }>;
  setPipelineEnabled: (pipelineId: string, enabled: boolean) => AutomationPipeline;
  setPipelineAutoRun: (pipelineId: string, autoRun: boolean) => AutomationPipeline;
  renamePipeline: (pipelineId: string, name: string) => AutomationPipeline;
  setPipelineDescription: (pipelineId: string, description: string) => AutomationPipeline;
  getResourceSummary: () => BrowserResourceSummary;
  getResourceSamples: (limit?: number) => ResourceHistorySample[];
  runResourceCleanup: (options: {
    unloadHiddenData: boolean;
    clearHistory: boolean;
    unloadAssistant: boolean;
  }) => {
    unloadHiddenData: boolean;
    clearHistory: boolean;
    unloadAssistant: boolean;
  };
  toggleAssistantWorkspace: () => void;
  toggleResourceManagerWorkspace: () => boolean;
  toggleCommandConsoleWorkspace: () => boolean;
};

type ViewerCommandDefinition<TPayload = unknown, TResult = unknown> = {
  id: string;
  title: string;
  description: string;
  usage: string;
  examples: string[];
  parsePayload?: (value: unknown) => TPayload;
  execute: (context: ViewerCommandContext, payload: TPayload) => TResult | Promise<TResult>;
};

type AnyViewerCommandDefinition = ViewerCommandDefinition<any, any>;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function expectObject(value: unknown, message: string): Record<string, unknown> {
  if (!isPlainObject(value)) {
    throw new Error(message);
  }
  return value;
}

function expectString(value: unknown, message: string): string {
  if (typeof value !== "string") {
    throw new Error(message);
  }
  return value;
}

function expectBoolean(value: unknown, message: string): boolean {
  if (typeof value !== "boolean") {
    throw new Error(message);
  }
  return value;
}

function parseLayoutCollapsedPayload(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  const payload = expectObject(
    value,
    "layout.setLayerPanelCollapsed expects a boolean or { \"collapsed\": boolean }."
  );
  return expectBoolean(
    payload.collapsed,
    "layout.setLayerPanelCollapsed needs a boolean 'collapsed' field."
  );
}

function parseSelectNodePayload(value: unknown): string | null {
  if (typeof value === "string" || value === null) return value;
  const payload = expectObject(
    value,
    "scene.selectNode expects a node id string, null, or { \"nodeId\": string | null }."
  );
  if (typeof payload.nodeId === "string" || payload.nodeId === null) {
    return payload.nodeId;
  }
  throw new Error("scene.selectNode needs a string or null 'nodeId' field.");
}

function parseNodeVisibilityPayload(value: unknown): {
  nodeId?: string;
  visible: boolean;
} {
  const payload = expectObject(
    value,
    "scene.setNodeVisibility expects { \"nodeId\"?: string, \"visible\": boolean }."
  );
  return {
    nodeId:
      typeof payload.nodeId === "string" && payload.nodeId.trim()
        ? payload.nodeId
        : undefined,
    visible: expectBoolean(
      payload.visible,
      "scene.setNodeVisibility needs a boolean 'visible' field."
    ),
  };
}

function parseNodeTargetPayload(value: unknown): {
  nodeId?: string;
} {
  if (typeof value === "string") {
    return { nodeId: value };
  }
  const payload = expectObject(
    value,
    "scene.toggleNodeVisibility expects a node id string or { \"nodeId\"?: string }."
  );
  return {
    nodeId:
      typeof payload.nodeId === "string" && payload.nodeId.trim()
        ? payload.nodeId
        : undefined,
  };
}

function parseOpacityPayload(value: unknown): number {
  if (typeof value === "number") return value;
  const payload = expectObject(
    value,
    "scene.setSelectedOpacity expects a number or { \"opacity\": number }."
  );
  if (typeof payload.opacity !== "number") {
    throw new Error("scene.setSelectedOpacity needs a numeric 'opacity' field.");
  }
  return payload.opacity;
}

function parsePipelineTargetPayload(value: unknown): {
  pipelineId?: string;
} {
  if (typeof value === "string") {
    return { pipelineId: value };
  }
  if (typeof value === "undefined") {
    return {};
  }
  const payload = expectObject(
    value,
    "Pipeline command expects a pipeline id string or payload object."
  );
  return {
    pipelineId:
      typeof payload.pipelineId === "string" && payload.pipelineId.trim()
        ? payload.pipelineId
        : undefined,
  };
}

function parsePipelineEnabledPayload(value: unknown): {
  pipelineId?: string;
  enabled: boolean;
} {
  const payload = expectObject(
    value,
    "pipeline.setEnabled expects { \"pipelineId\"?: string, \"enabled\": boolean }."
  );
  return {
    pipelineId:
      typeof payload.pipelineId === "string" && payload.pipelineId.trim()
        ? payload.pipelineId
        : undefined,
    enabled: expectBoolean(
      payload.enabled,
      "pipeline.setEnabled needs a boolean 'enabled' field."
    ),
  };
}

function parsePipelineAutoRunPayload(value: unknown): {
  pipelineId?: string;
  autoRun: boolean;
} {
  const payload = expectObject(
    value,
    "pipeline.setAutoRun expects { \"pipelineId\"?: string, \"autoRun\": boolean }."
  );
  return {
    pipelineId:
      typeof payload.pipelineId === "string" && payload.pipelineId.trim()
        ? payload.pipelineId
        : undefined,
    autoRun: expectBoolean(
      payload.autoRun,
      "pipeline.setAutoRun needs a boolean 'autoRun' field."
    ),
  };
}

function parsePipelineStringFieldPayload(
  value: unknown,
  fieldName: "name" | "description",
  commandId: string
): { pipelineId?: string; value: string } {
  const payload = expectObject(
    value,
    `${commandId} expects { "pipelineId"?: string, "${fieldName}": string }.`
  );
  return {
    pipelineId:
      typeof payload.pipelineId === "string" && payload.pipelineId.trim()
        ? payload.pipelineId
        : undefined,
    value: expectString(
      payload[fieldName],
      `${commandId} needs a string '${fieldName}' field.`
    ),
  };
}

function parseResourceSamplesPayload(value: unknown): { limit?: number } {
  if (typeof value === "undefined") return {};
  if (typeof value === "number") return { limit: value };
  const payload = expectObject(
    value,
    "resource.getSamples expects a number or { \"limit\"?: number }."
  );
  return {
    limit: typeof payload.limit === "number" ? payload.limit : undefined,
  };
}

function parseResourceCleanupPayload(value: unknown): {
  unloadHiddenData: boolean;
  clearHistory: boolean;
  unloadAssistant: boolean;
} {
  const payload = expectObject(
    value,
    "resource.cleanup expects { \"unloadHiddenData\"?: boolean, \"clearHistory\"?: boolean, \"unloadAssistant\"?: boolean }."
  );
  return {
    unloadHiddenData: payload.unloadHiddenData !== false,
    clearHistory: payload.clearHistory === true,
    unloadAssistant: payload.unloadAssistant === true,
  };
}

function parseCollapsedPayload(
  value: unknown,
  commandId: string
): boolean {
  if (typeof value === "boolean") return value;
  const payload = expectObject(
    value,
    `${commandId} expects a boolean or { "collapsed": boolean }.`
  );
  return expectBoolean(
    payload.collapsed,
    `${commandId} needs a boolean 'collapsed' field.`
  );
}

function parseWindowIdPayload(
  value: unknown,
  commandId: string
): { id: string } {
  if (typeof value === "string") {
    return { id: value };
  }
  const payload = expectObject(
    value,
    `${commandId} expects a window id string or { "id": string }.`
  );
  return {
    id: expectString(payload.id, `${commandId} needs a string 'id' field.`),
  };
}

function parseWindowUpdatePayload(value: unknown): {
  id: string;
  minimized?: boolean;
  maximized?: boolean;
} {
  const payload = expectObject(
    value,
    'window.update expects { "id": string, "minimized"?: boolean, "maximized"?: boolean }.'
  );
  const minimized =
    typeof payload.minimized === "boolean" ? payload.minimized : undefined;
  const maximized =
    typeof payload.maximized === "boolean" ? payload.maximized : undefined;
  if (typeof minimized === "undefined" && typeof maximized === "undefined") {
    throw new Error("window.update needs at least one of 'minimized' or 'maximized'.");
  }
  return {
    id: expectString(payload.id, "window.update needs a string 'id' field."),
    minimized,
    maximized,
  };
}

function parseMetadataWindowPayload(value: unknown): {
  mode?: "edit" | "preview" | "split";
} {
  if (typeof value === "undefined") return {};
  if (typeof value === "string") {
    if (value === "edit" || value === "preview" || value === "split") {
      return { mode: value };
    }
    throw new Error("window.openSelectedMetadata expects mode 'edit', 'preview', or 'split'.");
  }
  const payload = expectObject(
    value,
    'window.openSelectedMetadata expects { "mode"?: "edit" | "preview" | "split" }.'
  );
  const mode =
    payload.mode === "edit" || payload.mode === "preview" || payload.mode === "split"
      ? payload.mode
      : undefined;
  return { mode };
}

function parseImportWorkspacePayload(value: unknown): {
  view: "library" | "import-external" | "import-local";
} {
  if (
    value === "library" ||
    value === "import-external" ||
    value === "import-local"
  ) {
    return { view: value };
  }
  const payload = expectObject(
    value,
    'workspace.openImport expects "library", "import-external", "import-local", or { "view": ... }.'
  );
  const view = payload.view;
  if (
    view !== "library" &&
    view !== "import-external" &&
    view !== "import-local"
  ) {
    throw new Error(
      "workspace.openImport needs view 'library', 'import-external', or 'import-local'."
    );
  }
  return { view };
}

function parseOptionalNodeTargetPayload(
  value: unknown,
  commandId: string
): { nodeId?: string } {
  if (typeof value === "string") {
    return { nodeId: value };
  }
  if (typeof value === "undefined") {
    return {};
  }
  const payload = expectObject(
    value,
    `${commandId} expects a node id string or { "nodeId"?: string }.`
  );
  return {
    nodeId:
      typeof payload.nodeId === "string" && payload.nodeId.trim()
        ? payload.nodeId
        : undefined,
  };
}

function parseOptionalSourceIdPayload(value: unknown): { sourceId?: string } {
  if (typeof value === "string") {
    return { sourceId: value };
  }
  if (typeof value === "undefined") {
    return {};
  }
  const payload = expectObject(
    value,
    'data.openLocalManager expects a source id string or { "sourceId"?: string }.'
  );
  return {
    sourceId:
      typeof payload.sourceId === "string" && payload.sourceId.trim()
        ? payload.sourceId
        : undefined,
  };
}

function parseCommandRequestPayload(value: unknown): {
  commandId: string;
  payload?: unknown;
} {
  const payload = expectObject(
    value,
    "help expects a command id string or { \"commandId\": string }."
  );
  return {
    commandId: expectString(payload.commandId, "help needs a string 'commandId' field."),
    payload: payload.payload,
  };
}

function parseCommandLinePayload(
  text: string,
  variables: Record<string, string>
): unknown {
  const trimmed = text.trim();
  if (!trimmed) return undefined;

  const words = tokenizeShellWords(trimmed, variables);
  if (!words.length) return undefined;
  if (words.length > 1) {
    return words.map((word) => word.text).join(" ");
  }

  const normalized = words[0]?.text ?? "";
  if (words[0]?.quoted) {
    return normalized;
  }

  const looksLikeJson =
    normalized.startsWith("{") ||
    normalized.startsWith("[") ||
    normalized.startsWith('"') ||
    normalized === "true" ||
    normalized === "false" ||
    normalized === "null" ||
    /^-?\d+(\.\d+)?([eE][+-]?\d+)?$/.test(normalized);

  if (!looksLikeJson) {
    return normalized;
  }

  try {
    return JSON.parse(normalized) as JsonValue;
  } catch (error) {
    throw new Error(
      `Could not parse command payload as JSON: ${
        error instanceof Error ? error.message : "unknown error"
      }`
    );
  }
}

type ShellBuiltinDefinition = {
  id: string;
  title: string;
  description: string;
  usage: string;
  examples: string[];
};

const SHELL_BUILTINS: ShellBuiltinDefinition[] = [
  {
    id: "grep",
    title: "Filter text lines",
    description: "Filter piped text lines by substring or regular expression-like text matching.",
    usage: "grep pattern",
    examples: [
      "viewer.getStateJson | grep selectedNodeId",
      "viewer.getStateJson | grep -i automation",
    ],
  },
  {
    id: "head",
    title: "Show first lines",
    description: "Show the first lines from piped text.",
    usage: "head 10",
    examples: [
      "viewer.getStateJson | head 20",
    ],
  },
  {
    id: "tail",
    title: "Show last lines",
    description: "Show the last lines from piped text.",
    usage: "tail 10",
    examples: [
      "viewer.getStateJson | tail 20",
    ],
  },
  {
    id: "sort",
    title: "Sort text lines",
    description: "Sort piped text lines alphabetically, with optional reverse ordering.",
    usage: "sort [-r]",
    examples: [
      "pipeline.list | grep id | sort",
      "pipeline.list | grep id | sort -r",
    ],
  },
  {
    id: "uniq",
    title: "Remove duplicate lines",
    description: "Collapse adjacent duplicate piped lines, with optional counts.",
    usage: "uniq [-c]",
    examples: [
      "pipeline.list | grep id | sort | uniq",
      "pipeline.list | grep id | sort | uniq -c",
    ],
  },
  {
    id: "jq",
    title: "Query JSON",
    description: "Extract data from piped JSON with simple jq-style paths and array selectors.",
    usage: "jq [-r] .path[0][]",
    examples: [
      `viewer.getStateJson | jq '.scene.selectedNodeId'`,
      `pipeline.list | jq '.[0].id'`,
      `pipeline.list | jq -r '.[].id' | sort | uniq`,
    ],
  },
  {
    id: "wc",
    title: "Count lines, words, and chars",
    description: "Count lines, words, and characters from piped text.",
    usage: "wc",
    examples: [
      "viewer.getStateJson | wc",
    ],
  },
  {
    id: "echo",
    title: "Print text",
    description: "Print literal text into the shell pipeline.",
    usage: "echo hello world",
    examples: [
      "echo viewer.getStateJson",
    ],
  },
  {
    id: "cat",
    title: "Read shell files",
    description: "Print saved shell file contents, with wildcard support for matching filenames.",
    usage: "cat file.json [other-file.json]",
    examples: [
      "cat viewer-state.json",
      "cat viewer-*.json | jq '.scene.selectedNodeId'",
    ],
  },
  {
    id: "set",
    title: "Set shell variables",
    description: "List shell variables or assign one for later $NAME expansion in this console tab.",
    usage: "set NAME value",
    examples: [
      "set NODE allen-average-volume",
      "set QUERY '.scene.selectedNodeId'",
    ],
  },
  {
    id: "unset",
    title: "Unset shell variables",
    description: "Remove one or more shell variables from this console tab.",
    usage: "unset NAME [OTHER_NAME]",
    examples: [
      "unset NODE",
    ],
  },
];

function formatShellOutput(value: unknown): string {
  if (typeof value === "undefined" || value === null) return "";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function inferDownloadMimeType(filename: string, content: string): string {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".json")) return "application/json";
  if (lower.endsWith(".csv")) return "text/csv";
  if (lower.endsWith(".tsv")) return "text/tab-separated-values";
  if (lower.endsWith(".txt") || lower.endsWith(".log")) return "text/plain";
  const trimmed = content.trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    return "application/json";
  }
  return "text/plain";
}

type ShellWord = {
  text: string;
  quoted: boolean;
};

type ShellRuntimeState = {
  files: Record<string, ViewerCommandShellFile>;
  variables: Record<string, string>;
};

function readShellVariableName(
  input: string,
  startIndex: number
): { name: string; endIndex: number } | null {
  const first = input[startIndex];
  if (!first || !/[A-Za-z_]/.test(first)) {
    return null;
  }
  let endIndex = startIndex + 1;
  while (endIndex < input.length && /[A-Za-z0-9_]/.test(input[endIndex] ?? "")) {
    endIndex += 1;
  }
  return {
    name: input.slice(startIndex, endIndex),
    endIndex,
  };
}

function tokenizeShellWords(
  input: string,
  variables: Record<string, string>
): ShellWord[] {
  const words: ShellWord[] = [];
  let current = "";
  let quote: '"' | "'" | null = null;
  let escaping = false;
  let currentQuoted = false;

  const pushWord = () => {
    if (!current.length && !currentQuoted) return;
    words.push({ text: current, quoted: currentQuoted });
    current = "";
    currentQuoted = false;
  };

  for (let index = 0; index < input.length; index += 1) {
    const character = input[index] ?? "";

    if (quote === "'") {
      if (character === "'") {
        quote = null;
        currentQuoted = true;
      } else {
        current += character;
      }
      continue;
    }

    if (quote === '"') {
      if (escaping) {
        current += character;
        escaping = false;
        currentQuoted = true;
        continue;
      }
      if (character === "\\") {
        escaping = true;
        currentQuoted = true;
        continue;
      }
      if (character === '"') {
        quote = null;
        currentQuoted = true;
        continue;
      }
      if (character === "$") {
        const variableMatch = readShellVariableName(input, index + 1);
        if (!variableMatch) {
          current += "$";
          continue;
        }
        current += variables[variableMatch.name] ?? "";
        index = variableMatch.endIndex - 1;
        currentQuoted = true;
        continue;
      }
      current += character;
      continue;
    }

    if (escaping) {
      current += character;
      escaping = false;
      continue;
    }

    if (/\s/.test(character)) {
      pushWord();
      continue;
    }

    if (character === "\\") {
      escaping = true;
      continue;
    }

    if (character === "'") {
      quote = "'";
      currentQuoted = true;
      continue;
    }

    if (character === '"') {
      quote = '"';
      currentQuoted = true;
      continue;
    }

    if (character === "$") {
      const variableMatch = readShellVariableName(input, index + 1);
      if (!variableMatch) {
        current += "$";
        continue;
      }
      current += variables[variableMatch.name] ?? "";
      index = variableMatch.endIndex - 1;
      continue;
    }

    current += character;
  }

  if (escaping) {
    throw new Error("Shell input ends with an unfinished escape (\\).");
  }
  if (quote) {
    throw new Error("Shell input has an unterminated quoted string.");
  }

  pushWord();
  return words;
}

function stripMatchingQuotes(value: string): string {
  const words = tokenizeShellWords(value.trim(), {});
  if (words.length === 1) {
    return words[0]?.text ?? "";
  }
  return value.trim();
}

function stripShellComment(input: string): string {
  let quote: '"' | "'" | null = null;
  let escaping = false;

  for (let index = 0; index < input.length; index += 1) {
    const character = input[index] ?? "";

    if (quote === "'") {
      if (character === "'") {
        quote = null;
      }
      continue;
    }

    if (quote === '"') {
      if (escaping) {
        escaping = false;
        continue;
      }
      if (character === "\\") {
        escaping = true;
        continue;
      }
      if (character === '"') {
        quote = null;
      }
      continue;
    }

    if (escaping) {
      escaping = false;
      continue;
    }

    if (character === "\\") {
      escaping = true;
      continue;
    }

    if (character === "'" || character === '"') {
      quote = character;
      continue;
    }

    if (character === "#") {
      return input.slice(0, index).trimEnd();
    }
  }

  return input.trimEnd();
}

function wildcardToRegExp(pattern: string): RegExp {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  const regexSource = escaped.replace(/\*/g, ".*").replace(/\?/g, ".");
  return new RegExp(`^${regexSource}$`);
}

function expandWildcardPattern(
  pattern: string,
  filenames: string[]
): string[] {
  if (!pattern.includes("*") && !pattern.includes("?")) {
    return [pattern];
  }
  const matcher = wildcardToRegExp(pattern);
  return filenames.filter((filename) => matcher.test(filename)).sort((left, right) =>
    left.localeCompare(right)
  );
}

function resolveShellFileMatches(
  args: ShellWord[],
  shellState: ShellRuntimeState
): Array<{ filename: string; file: ViewerCommandShellFile }> {
  if (!args.length) {
    throw new Error("cat needs at least one filename or wildcard pattern.");
  }

  const matches: Array<{ filename: string; file: ViewerCommandShellFile }> = [];
  for (const arg of args) {
    const filenames = expandWildcardPattern(arg.text, Object.keys(shellState.files));
    if (!filenames.length) {
      throw new Error(`No shell file matches '${arg.text}'.`);
    }
    for (const filename of filenames) {
      const file = shellState.files[filename];
      if (!file) {
        throw new Error(`Unknown shell file '${filename}'.`);
      }
      matches.push({ filename, file });
    }
  }
  return matches;
}

function scanTopLevelOperator(
  input: string,
  fromEnd: boolean,
  matcher: (input: string, index: number) => { length: number; operator: string } | null
): { index: number; length: number; operator: string } | null {
  let quote: '"' | "'" | null = null;
  let escapeNext = false;
  let braceDepth = 0;
  let bracketDepth = 0;
  let parenDepth = 0;
  const matches: Array<{ index: number; length: number; operator: string }> = [];

  for (let index = 0; index < input.length; index += 1) {
    const character = input[index];

    if (quote) {
      if (escapeNext) {
        escapeNext = false;
        continue;
      }
      if (character === "\\") {
        escapeNext = true;
        continue;
      }
      if (character === quote) {
        quote = null;
      }
      continue;
    }

    if (character === '"' || character === "'") {
      quote = character;
      continue;
    }

    if (character === "\\") {
      index += 1;
      continue;
    }

    if (character === "{") braceDepth += 1;
    else if (character === "}") braceDepth = Math.max(0, braceDepth - 1);
    else if (character === "[") bracketDepth += 1;
    else if (character === "]") bracketDepth = Math.max(0, bracketDepth - 1);
    else if (character === "(") parenDepth += 1;
    else if (character === ")") parenDepth = Math.max(0, parenDepth - 1);

    if (braceDepth || bracketDepth || parenDepth) continue;

    const match = matcher(input, index);
    if (match) {
      matches.push({
        index,
        length: match.length,
        operator: match.operator,
      });
      index += match.length - 1;
    }
  }

  if (!matches.length) return null;
  return fromEnd ? matches[matches.length - 1] ?? null : matches[0] ?? null;
}

function splitTopLevelByOperators(
  input: string,
  operators: string[]
): Array<{ text: string; operatorBefore: string | null }> {
  const sortedOperators = [...operators].sort((left, right) => right.length - left.length);
  const parts: Array<{ text: string; operatorBefore: string | null }> = [];
  let start = 0;
  let currentOperator: string | null = null;

  while (start <= input.length) {
    const slice = input.slice(start);
    const match = scanTopLevelOperator(slice, false, (source, index) => {
      for (const candidate of sortedOperators) {
        if (source.startsWith(candidate, index)) {
          return { length: candidate.length, operator: candidate };
        }
      }
      return null;
    });

    if (!match) {
      const tail = input.slice(start).trim();
      if (tail) {
        parts.push({ text: tail, operatorBefore: currentOperator });
      }
      break;
    }

    const absoluteIndex = start + match.index;
    const text = input.slice(start, absoluteIndex).trim();
    if (text) {
      parts.push({ text, operatorBefore: currentOperator });
    }
    start = absoluteIndex + match.length;
    currentOperator = match.operator;
  }

  return parts;
}

function resolveShellWordsToSingleValue(
  rawText: string,
  variables: Record<string, string>,
  message: string
): string {
  const words = tokenizeShellWords(rawText.trim(), variables);
  if (words.length !== 1) {
    throw new Error(message);
  }
  return words[0]?.text ?? "";
}

function resolveInputRedirectFiles(
  rawTarget: string,
  shellState: ShellRuntimeState
): Array<{ filename: string; file: ViewerCommandShellFile }> {
  const target = resolveShellWordsToSingleValue(
    rawTarget,
    shellState.variables,
    "Input redirection needs exactly one filename or wildcard pattern."
  );
  if (!target) {
    throw new Error("Input redirection needs a target filename.");
  }

  const filenames = expandWildcardPattern(target, Object.keys(shellState.files));
  if (!filenames.length) {
    throw new Error(`No shell file matches '${target}'.`);
  }

  return filenames.map((filename) => {
    const file = shellState.files[filename];
    if (!file) {
      throw new Error(`Unknown shell file '${filename}'.`);
    }
    return { filename, file };
  });
}

function parseRedirects(
  input: string,
  shellState: ShellRuntimeState
): {
  commandText: string;
  redirect: ViewerCommandDownload | null;
  stdin: string;
} {
  let commandText = input.trim();
  let redirect: ViewerCommandDownload | null = null;
  let stdin = "";

  const outputMatch = scanTopLevelOperator(commandText, true, (source, index) => {
    if (source.startsWith(">>", index)) {
      return { length: 2, operator: ">>" };
    }
    if (source[index] === ">") {
      return { length: 1, operator: ">" };
    }
    return null;
  });

  if (outputMatch) {
    const filename = resolveShellWordsToSingleValue(
      commandText.slice(outputMatch.index + outputMatch.length),
      shellState.variables,
      "Output redirection needs exactly one filename."
    );
    if (!filename) {
      throw new Error("Output redirection needs a target filename.");
    }
    redirect = {
      filename,
      content: "",
      mimeType: "text/plain",
      append: outputMatch.operator === ">>",
    };
    commandText = commandText.slice(0, outputMatch.index).trimEnd();
  }

  const inputMatch = scanTopLevelOperator(commandText, true, (source, index) => {
    if (source[index] === "<") {
      return { length: 1, operator: "<" };
    }
    return null;
  });

  if (inputMatch) {
    const files = resolveInputRedirectFiles(
      commandText.slice(inputMatch.index + inputMatch.length),
      shellState
    );
    stdin = files
      .map(({ file }) => file.content)
      .join(files.length > 1 ? "\n" : "");
    commandText = commandText.slice(0, inputMatch.index).trimEnd();
  }

  return {
    commandText: commandText.trim(),
    redirect,
    stdin,
  };
}

function parseSingleStage(stageText: string): { commandId: string; payloadText: string } {
  const trimmed = stageText.trim();
  const firstWhitespace = trimmed.search(/\s/);
  return {
    commandId:
      firstWhitespace === -1 ? trimmed : trimmed.slice(0, firstWhitespace).trim(),
    payloadText: firstWhitespace === -1 ? "" : trimmed.slice(firstWhitespace + 1).trim(),
  };
}

function parseGrepArgs(args: ShellWord[]): { pattern: string; caseInsensitive: boolean } {
  if (!args.length) {
    throw new Error("grep needs a pattern.");
  }
  if (args[0]?.text === "-i") {
    const pattern = args.slice(1).map((arg) => arg.text).join(" ");
    if (!pattern) {
      throw new Error("grep -i still needs a pattern.");
    }
    return { pattern, caseInsensitive: true };
  }
  return {
    pattern: args.map((arg) => arg.text).join(" "),
    caseInsensitive: false,
  };
}

function parseSortArgs(args: ShellWord[]): { reverse: boolean } {
  if (!args.length) {
    return { reverse: false };
  }
  if (args.length === 1 && args[0]?.text === "-r") {
    return { reverse: true };
  }
  throw new Error("sort supports only the optional -r flag.");
}

function parseUniqArgs(args: ShellWord[]): { count: boolean } {
  if (!args.length) {
    return { count: false };
  }
  if (args.length === 1 && args[0]?.text === "-c") {
    return { count: true };
  }
  throw new Error("uniq supports only the optional -c flag.");
}

function parseJqArgs(args: ShellWord[]): { raw: boolean; expression: string } {
  if (!args.length) {
    throw new Error("jq needs an expression.");
  }

  let raw = false;
  let expressionWords = args;
  if (args[0]?.text === "-r") {
    raw = true;
    expressionWords = args.slice(1);
  }
  const expression = expressionWords.map((word) => word.text).join(" ");
  if (!expression) {
    throw new Error("jq needs a non-empty expression.");
  }

  return { raw, expression };
}

type JqToken =
  | { type: "identity" }
  | { type: "property"; key: string }
  | { type: "index"; index: number }
  | { type: "iterate" };

function parseJqExpression(expression: string): JqToken[] {
  const trimmed = expression.trim();
  if (!trimmed.startsWith(".")) {
    throw new Error("jq expressions must start with '.'.");
  }

  const tokens: JqToken[] = [{ type: "identity" }];
  let index = 1;

  while (index < trimmed.length) {
    const character = trimmed[index];

    if (/[A-Za-z0-9_-]/.test(character)) {
      const propertyMatch = /^[A-Za-z0-9_-]+/.exec(trimmed.slice(index));
      if (!propertyMatch) {
        throw new Error(`Unsupported jq expression near '${trimmed.slice(index)}'.`);
      }
      tokens.push({ type: "property", key: propertyMatch[0] });
      index += propertyMatch[0].length;
      continue;
    }

    if (character === ".") {
      index += 1;
      const propertyMatch = /^[A-Za-z0-9_-]+/.exec(trimmed.slice(index));
      if (!propertyMatch) {
        throw new Error(`Unsupported jq expression near '${trimmed.slice(index)}'.`);
      }
      tokens.push({ type: "property", key: propertyMatch[0] });
      index += propertyMatch[0].length;
      continue;
    }

    if (character === "[") {
      const closingIndex = trimmed.indexOf("]", index);
      if (closingIndex === -1) {
        throw new Error("jq expression has an unterminated '['.");
      }

      const content = trimmed.slice(index + 1, closingIndex).trim();
      if (!content) {
        tokens.push({ type: "iterate" });
      } else if (/^-?\d+$/.test(content)) {
        tokens.push({ type: "index", index: Number(content) });
      } else {
        const key = stripMatchingQuotes(content);
        if (!key || key === content) {
          throw new Error(`Unsupported jq selector '[${content}]'.`);
        }
        tokens.push({ type: "property", key });
      }

      index = closingIndex + 1;
      continue;
    }

    if (/\s/.test(character)) {
      index += 1;
      continue;
    }

    throw new Error(`Unsupported jq syntax near '${trimmed.slice(index)}'.`);
  }

  return tokens;
}

function applyJqToken(input: JsonValue, token: JqToken): JsonValue[] {
  if (token.type === "identity") {
    return [input];
  }

  if (token.type === "property") {
    if (!isPlainObject(input)) {
      return [];
    }
    const value = input[token.key];
    return typeof value === "undefined" ? [] : [value as JsonValue];
  }

  if (token.type === "index") {
    if (!Array.isArray(input)) {
      return [];
    }
    const normalizedIndex =
      token.index < 0 ? input.length + token.index : token.index;
    const value = input[normalizedIndex];
    return typeof value === "undefined" ? [] : [value as JsonValue];
  }

  if (!Array.isArray(input)) {
    return [];
  }
  return input as JsonValue[];
}

function formatJqValue(value: JsonValue, raw: boolean): string {
  if (raw && (typeof value === "string" || typeof value === "number" || typeof value === "boolean")) {
    return String(value);
  }
  if (raw && value === null) {
    return "null";
  }
  if (typeof value === "string") {
    return JSON.stringify(value);
  }
  if (typeof value === "number" || typeof value === "boolean" || value === null) {
    return String(value);
  }
  return JSON.stringify(value, null, 2);
}

function runJq(args: ShellWord[], stdin: string): string {
  if (!stdin.trim()) {
    throw new Error("jq needs JSON input from the previous stage.");
  }

  const { raw, expression } = parseJqArgs(args);
  const input = JSON.parse(stdin) as JsonValue;
  const tokens = parseJqExpression(expression);
  let current: JsonValue[] = [input];

  for (const token of tokens) {
    current = current.flatMap((value) => applyJqToken(value, token));
  }

  return current.map((value) => formatJqValue(value, raw)).join("\n");
}

function runShellBuiltin(
  commandId: string,
  rawArgs: string,
  stdin: string,
  shellState: ShellRuntimeState
): string {
  const args = tokenizeShellWords(rawArgs, shellState.variables);

  if (commandId === "echo") {
    return args.length ? args.map((arg) => arg.text).join(" ") : stdin;
  }

  if (commandId === "cat") {
    return resolveShellFileMatches(args, shellState)
      .map(({ file }) => file.content)
      .join("\n");
  }

  if (commandId === "grep") {
    const { pattern, caseInsensitive } = parseGrepArgs(args);
    const matcher = caseInsensitive
      ? pattern.toLowerCase()
      : pattern;
    return stdin
      .split(/\r?\n/)
      .filter((line) =>
        caseInsensitive
          ? line.toLowerCase().includes(matcher)
          : line.includes(matcher)
      )
      .join("\n");
  }

  if (commandId === "head") {
    const countText = args[0]?.text ?? "";
    const count = countText ? Math.max(0, Math.floor(Number(countText) || 0)) : 10;
    return stdin.split(/\r?\n/).slice(0, count || 10).join("\n");
  }

  if (commandId === "tail") {
    const countText = args[0]?.text ?? "";
    const count = countText ? Math.max(0, Math.floor(Number(countText) || 0)) : 10;
    const lines = stdin.split(/\r?\n/);
    return lines.slice(Math.max(0, lines.length - (count || 10))).join("\n");
  }

  if (commandId === "sort") {
    const { reverse } = parseSortArgs(args);
    if (!stdin.length) return "";
    const lines = stdin.split(/\r?\n/).sort((left, right) => left.localeCompare(right));
    if (reverse) {
      lines.reverse();
    }
    return lines.join("\n");
  }

  if (commandId === "uniq") {
    const { count } = parseUniqArgs(args);
    if (!stdin.length) return "";
    const lines = stdin.split(/\r?\n/);
    const deduped: string[] = [];
    let previous: string | null = null;
    let occurrences = 0;

    const flush = () => {
      if (previous === null) return;
      deduped.push(count ? `${occurrences} ${previous}` : previous);
    };

    for (const line of lines) {
      if (previous === null) {
        previous = line;
        occurrences = 1;
        continue;
      }
      if (line === previous) {
        occurrences += 1;
        continue;
      }
      flush();
      previous = line;
      occurrences = 1;
    }
    flush();
    return deduped.join("\n");
  }

  if (commandId === "jq") {
    return runJq(args, stdin);
  }

  if (commandId === "set") {
    if (!args.length) {
      return Object.keys(shellState.variables)
        .sort((left, right) => left.localeCompare(right))
        .map((name) => `${name}=${shellState.variables[name] ?? ""}`)
        .join("\n");
    }

    const assignment = args[0]?.text ?? "";
    const equalsIndex = assignment.indexOf("=");
    if (equalsIndex > 0) {
      const name = assignment.slice(0, equalsIndex);
      const value = assignment.slice(equalsIndex + 1);
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
        throw new Error(`Invalid shell variable name '${name}'.`);
      }
      shellState.variables[name] = value;
      return value;
    }

    if (args.length < 2) {
      throw new Error("set needs NAME value or NAME=value.");
    }
    const name = args[0]?.text ?? "";
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
      throw new Error(`Invalid shell variable name '${name}'.`);
    }
    const value = args.slice(1).map((arg) => arg.text).join(" ");
    shellState.variables[name] = value;
    return value;
  }

  if (commandId === "unset") {
    if (!args.length) {
      throw new Error("unset needs at least one variable name.");
    }
    for (const arg of args) {
      delete shellState.variables[arg.text];
    }
    return "";
  }

  if (commandId === "wc") {
    const lines = stdin.length ? stdin.split(/\r?\n/).length : 0;
    const words = stdin.trim() ? stdin.trim().split(/\s+/).length : 0;
    const chars = stdin.length;
    return `${lines} ${words} ${chars}`;
  }

  throw new Error(`Unknown shell builtin '${commandId}'.`);
}

function createDefinitions(): AnyViewerCommandDefinition[] {
  return [
    {
      id: "help",
      title: "List available commands",
      description: "Show the command catalog or describe one specific command.",
      usage: "help [commandId]",
      examples: ["help", "help viewer.patchState"],
      parsePayload(value) {
        if (typeof value === "undefined") return undefined;
        if (typeof value === "string") return value;
        return parseCommandRequestPayload(value).commandId;
      },
      execute(_context, payload) {
        return payload;
      },
    },
    {
      id: "viewer.ping",
      title: "Ping the viewer",
      description: "Check that the command service is alive.",
      usage: "viewer.ping",
      examples: ["viewer.ping"],
      execute() {
        return { pong: true };
      },
    },
    {
      id: "viewer.getState",
      title: "Read current viewer state",
      description: "Return the full serializable viewer state object.",
      usage: "viewer.getState",
      examples: ["viewer.getState"],
      execute(context) {
        return context.getState();
      },
    },
    {
      id: "viewer.getStateJson",
      title: "Read current viewer state JSON",
      description: "Return the full serializable viewer state as formatted JSON text.",
      usage: "viewer.getStateJson",
      examples: ["viewer.getStateJson"],
      execute(context) {
        return JSON.stringify(context.getState(), null, 2);
      },
    },
    {
      id: "viewer.setState",
      title: "Replace viewer state",
      description: "Commit a full serializable viewer state object.",
      usage: "viewer.setState { ...state }",
      examples: ['viewer.setState {"version":1,"layout":{"layerPanelCollapsed":false,"inspectorCollapsed":false},"camera":{"mode":"orbit","position":[0,0,5],"yaw":-90,"pitch":0,"fovDeg":60},"scene":{"activeTool":"mouse","selectedNodeId":null,"layerTree":[]},"ui":{"sliceVolumeLayerId":"","sliceName":"","sliceParamsDraft":{"mode":"axis","plane":"xy","index":0,"opacity":1}},"automation":{"pipelines":[]}}'],
      parsePayload(value) {
        return expectObject(value, "viewer.setState expects a JSON object.") as ViewerStateV1;
      },
      execute(context, payload: ViewerStateV1) {
        return context.setState(payload);
      },
    },
    {
      id: "viewer.setStateJson",
      title: "Replace viewer state from JSON",
      description: "Commit a full viewer state from a JSON string.",
      usage: 'viewer.setStateJson "{...json...}"',
      examples: ['viewer.setStateJson "{\\"version\\":1,...}"'],
      parsePayload(value) {
        return expectString(value, "viewer.setStateJson expects a JSON string payload.");
      },
      execute(context, payload: string) {
        return context.setStateJson(payload);
      },
    },
    {
      id: "viewer.patchState",
      title: "Patch viewer state",
      description: "Apply a partial state patch through the normal commit path.",
      usage: "viewer.patchState { ...patch }",
      examples: [
        'viewer.patchState {"scene":{"selectedNodeId":"allen-average-volume"}}',
        'viewer.patchState {"layout":{"layerPanelCollapsed":true}}',
      ],
      parsePayload(value) {
        return expectObject(value, "viewer.patchState expects a JSON object.") as ViewerStatePatchV1;
      },
      execute(context, payload: ViewerStatePatchV1) {
        return context.patchState(payload);
      },
    },
    {
      id: "layout.setLayerPanelCollapsed",
      title: "Toggle layer panel visibility",
      description: "Collapse or reopen the layer panel.",
      usage: "layout.setLayerPanelCollapsed true",
      examples: [
        "layout.setLayerPanelCollapsed true",
        'layout.setLayerPanelCollapsed {"collapsed":false}',
      ],
      parsePayload: parseLayoutCollapsedPayload,
      execute(context, payload: boolean) {
        return context.setLayoutCollapsed(payload);
      },
    },
    {
      id: "layout.setInspectorCollapsed",
      title: "Toggle inspector visibility",
      description: "Collapse or reopen the inspector panel.",
      usage: "layout.setInspectorCollapsed true",
      examples: [
        "layout.setInspectorCollapsed true",
        'layout.setInspectorCollapsed {"collapsed":false}',
      ],
      parsePayload(value) {
        return parseCollapsedPayload(value, "layout.setInspectorCollapsed");
      },
      execute(context, payload: boolean) {
        return context.setInspectorCollapsed(payload);
      },
    },
    {
      id: "scene.selectNode",
      title: "Select a node",
      description: "Change the selected node by id, or clear selection with null.",
      usage: "scene.selectNode allen-average-volume",
      examples: [
        "scene.selectNode allen-average-volume",
        'scene.selectNode {"nodeId":null}',
      ],
      parsePayload: parseSelectNodePayload,
      execute(context, payload: string | null) {
        return context.selectNode(payload);
      },
    },
    {
      id: "scene.setNodeVisibility",
      title: "Set node visibility",
      description: "Show or hide a layer or group by id, defaulting to the current selection.",
      usage: 'scene.setNodeVisibility {"nodeId":"allen-average-volume","visible":false}',
      examples: [
        'scene.setNodeVisibility {"nodeId":"allen-average-volume","visible":false}',
        'scene.setNodeVisibility {"visible":true}',
      ],
      parsePayload: parseNodeVisibilityPayload,
      execute(context, payload: { nodeId?: string; visible: boolean }) {
        const nodeId = payload.nodeId ?? context.getSelectedNodeId();
        if (!nodeId) {
          throw new Error("scene.setNodeVisibility needs a target node or current selection.");
        }
        return context.setNodeVisibility(nodeId, payload.visible);
      },
    },
    {
      id: "scene.toggleNodeVisibility",
      title: "Toggle node visibility",
      description: "Invert visibility for a layer or group by id, defaulting to the current selection.",
      usage: "scene.toggleNodeVisibility allen-average-volume",
      examples: [
        "scene.toggleNodeVisibility allen-average-volume",
        'scene.toggleNodeVisibility {"nodeId":"allen-average-volume"}',
      ],
      parsePayload: parseNodeTargetPayload,
      execute(context, payload: { nodeId?: string }) {
        const nodeId = payload.nodeId ?? context.getSelectedNodeId();
        if (!nodeId) {
          throw new Error("scene.toggleNodeVisibility needs a target node or current selection.");
        }
        return context.toggleNodeVisibility(nodeId);
      },
    },
    {
      id: "scene.setSelectedOpacity",
      title: "Set selected opacity",
      description: "Update the opacity of the currently selected layer.",
      usage: "scene.setSelectedOpacity 0.4",
      examples: [
        "scene.setSelectedOpacity 0.4",
        'scene.setSelectedOpacity {"opacity":0.8}',
      ],
      parsePayload: parseOpacityPayload,
      execute(context, payload: number) {
        if (!context.getSelectedNodeId()) {
          throw new Error("scene.setSelectedOpacity needs a selected layer.");
        }
        return context.setSelectedOpacity(payload);
      },
    },
    {
      id: "camera.focusSelected",
      title: "Focus selected layer",
      description: "Trigger the same camera focus action used by the toolbar.",
      usage: "camera.focusSelected",
      examples: ["camera.focusSelected"],
      execute(context) {
        return context.focusSelectedLayer();
      },
    },
    {
      id: "window.list",
      title: "List floating windows",
      description: "Return the current floating workspace windows.",
      usage: "window.list",
      examples: ["window.list"],
      execute(context) {
        return context.getFloatingWindows();
      },
    },
    {
      id: "window.focus",
      title: "Focus a window",
      description: "Bring a floating workspace window to the front.",
      usage: "window.focus window-id",
      examples: [
        "window.focus window-id",
        'window.focus {"id":"window-id"}',
      ],
      parsePayload(value) {
        return parseWindowIdPayload(value, "window.focus");
      },
      execute(context, payload: { id: string }) {
        return context.focusWindow(payload.id);
      },
    },
    {
      id: "window.close",
      title: "Close a window",
      description: "Close a floating workspace window by id.",
      usage: "window.close window-id",
      examples: [
        "window.close window-id",
        'window.close {"id":"window-id"}',
      ],
      parsePayload(value) {
        return parseWindowIdPayload(value, "window.close");
      },
      execute(context, payload: { id: string }) {
        return context.closeWindow(payload.id);
      },
    },
    {
      id: "window.update",
      title: "Update window state",
      description: "Minimize, restore, or maximize a floating workspace window.",
      usage: 'window.update {"id":"window-id","minimized":true}',
      examples: [
        'window.update {"id":"window-id","minimized":true}',
        'window.update {"id":"window-id","minimized":false,"maximized":true}',
      ],
      parsePayload: parseWindowUpdatePayload,
      execute(context, payload) {
        return context.updateWindow(payload.id, {
          ...(typeof payload.minimized === "boolean"
            ? { minimized: payload.minimized }
            : {}),
          ...(typeof payload.maximized === "boolean"
            ? { maximized: payload.maximized }
            : {}),
        });
      },
    },
    {
      id: "window.openSelectedMetadata",
      title: "Open metadata window",
      description: "Open a floating metadata window for the selected annotation layer.",
      usage: "window.openSelectedMetadata",
      examples: [
        "window.openSelectedMetadata",
        'window.openSelectedMetadata {"mode":"preview"}',
      ],
      parsePayload: parseMetadataWindowPayload,
      execute(context, payload) {
        return context.openSelectedMetadataWindow(payload.mode);
      },
    },
    {
      id: "history.undo",
      title: "Undo",
      description: "Undo the most recent committed viewer state change.",
      usage: "history.undo",
      examples: ["history.undo"],
      execute(context) {
        return context.undo();
      },
    },
    {
      id: "history.redo",
      title: "Redo",
      description: "Redo the next viewer state change if one exists.",
      usage: "history.redo",
      examples: ["history.redo"],
      execute(context) {
        return context.redo();
      },
    },
    {
      id: "history.clear",
      title: "Clear history",
      description: "Open the clear-history confirmation flow.",
      usage: "history.clear",
      examples: ["history.clear"],
      execute(context) {
        return context.clearHistory();
      },
    },
    {
      id: "pipeline.list",
      title: "List pipelines",
      description: "Return all automation pipelines currently loaded in the viewer.",
      usage: "pipeline.list",
      examples: ["pipeline.list"],
      execute(context) {
        return context.listPipelines();
      },
    },
    {
      id: "pipeline.getActive",
      title: "Get active pipeline",
      description: "Return the currently open automation pipeline, if any.",
      usage: "pipeline.getActive",
      examples: ["pipeline.getActive"],
      execute(context) {
        return context.getActivePipeline();
      },
    },
    {
      id: "pipeline.open",
      title: "Open a pipeline",
      description: "Set the active pipeline workspace target by id.",
      usage: "pipeline.open pipeline-id",
      examples: [
        "pipeline.open pipeline-id",
        'pipeline.open {"pipelineId":"pipeline-id"}',
      ],
      parsePayload: parsePipelineTargetPayload,
      execute(context, payload: { pipelineId?: string }) {
        if (!payload.pipelineId) {
          throw new Error("pipeline.open needs a 'pipelineId'.");
        }
        return context.openPipeline(payload.pipelineId);
      },
    },
    {
      id: "pipeline.run",
      title: "Run a pipeline",
      description: "Run a pipeline by id, or the active pipeline when no id is provided.",
      usage: "pipeline.run pipeline-id",
      examples: [
        "pipeline.run pipeline-id",
        "pipeline.run",
      ],
      parsePayload: parsePipelineTargetPayload,
      async execute(context, payload: { pipelineId?: string }) {
        const pipelineId = payload.pipelineId ?? context.getActivePipeline()?.id;
        if (!pipelineId) {
          throw new Error("pipeline.run needs a pipeline id or an active pipeline.");
        }
        return await context.runPipeline(pipelineId);
      },
    },
    {
      id: "pipeline.setEnabled",
      title: "Enable or disable a pipeline",
      description: "Update the active flag for a pipeline by id, defaulting to the active pipeline.",
      usage: 'pipeline.setEnabled {"pipelineId":"pipeline-id","enabled":true}',
      examples: [
        'pipeline.setEnabled {"pipelineId":"pipeline-id","enabled":true}',
        'pipeline.setEnabled {"enabled":false}',
      ],
      parsePayload: parsePipelineEnabledPayload,
      execute(context, payload: { pipelineId?: string; enabled: boolean }) {
        const pipelineId = payload.pipelineId ?? context.getActivePipeline()?.id;
        if (!pipelineId) {
          throw new Error("pipeline.setEnabled needs a pipeline id or an active pipeline.");
        }
        return context.setPipelineEnabled(pipelineId, payload.enabled);
      },
    },
    {
      id: "pipeline.setAutoRun",
      title: "Enable or disable pipeline autorun",
      description: "Update the autorun flag for a pipeline by id, defaulting to the active pipeline.",
      usage: 'pipeline.setAutoRun {"pipelineId":"pipeline-id","autoRun":true}',
      examples: [
        'pipeline.setAutoRun {"pipelineId":"pipeline-id","autoRun":true}',
        'pipeline.setAutoRun {"autoRun":false}',
      ],
      parsePayload: parsePipelineAutoRunPayload,
      execute(context, payload: { pipelineId?: string; autoRun: boolean }) {
        const pipelineId = payload.pipelineId ?? context.getActivePipeline()?.id;
        if (!pipelineId) {
          throw new Error("pipeline.setAutoRun needs a pipeline id or an active pipeline.");
        }
        return context.setPipelineAutoRun(pipelineId, payload.autoRun);
      },
    },
    {
      id: "pipeline.rename",
      title: "Rename a pipeline",
      description: "Rename a pipeline by id, defaulting to the active pipeline.",
      usage: 'pipeline.rename {"pipelineId":"pipeline-id","name":"New name"}',
      examples: [
        'pipeline.rename {"pipelineId":"pipeline-id","name":"New name"}',
        'pipeline.rename {"name":"Selection watcher"}',
      ],
      parsePayload(value) {
        return parsePipelineStringFieldPayload(value, "name", "pipeline.rename");
      },
      execute(context, payload: { pipelineId?: string; value: string }) {
        const pipelineId = payload.pipelineId ?? context.getActivePipeline()?.id;
        if (!pipelineId) {
          throw new Error("pipeline.rename needs a pipeline id or an active pipeline.");
        }
        return context.renamePipeline(pipelineId, payload.value);
      },
    },
    {
      id: "pipeline.setDescription",
      title: "Set pipeline description",
      description: "Update the description of a pipeline by id, defaulting to the active pipeline.",
      usage: 'pipeline.setDescription {"pipelineId":"pipeline-id","description":"..."}',
      examples: [
        'pipeline.setDescription {"pipelineId":"pipeline-id","description":"Runs after selection changes."}',
        'pipeline.setDescription {"description":"Quick debug pipeline."}',
      ],
      parsePayload(value) {
        return parsePipelineStringFieldPayload(
          value,
          "description",
          "pipeline.setDescription"
        );
      },
      execute(context, payload: { pipelineId?: string; value: string }) {
        const pipelineId = payload.pipelineId ?? context.getActivePipeline()?.id;
        if (!pipelineId) {
          throw new Error("pipeline.setDescription needs a pipeline id or an active pipeline.");
        }
        return context.setPipelineDescription(pipelineId, payload.value);
      },
    },
    {
      id: "resource.getSummary",
      title: "Read resource summary",
      description: "Return the current browser resource summary shown in the resource manager.",
      usage: "resource.getSummary",
      examples: ["resource.getSummary"],
      execute(context) {
        return context.getResourceSummary();
      },
    },
    {
      id: "resource.getSamples",
      title: "Read resource samples",
      description: "Return recent resource telemetry samples, with an optional limit.",
      usage: "resource.getSamples 20",
      examples: [
        "resource.getSamples",
        "resource.getSamples 20",
        'resource.getSamples {"limit":10}',
      ],
      parsePayload: parseResourceSamplesPayload,
      execute(context, payload: { limit?: number }) {
        return context.getResourceSamples(payload.limit);
      },
    },
    {
      id: "resource.cleanup",
      title: "Run resource cleanup",
      description: "Trigger the same cleanup actions exposed by the resource manager.",
      usage: 'resource.cleanup {"unloadHiddenData":true,"clearHistory":true,"unloadAssistant":false}',
      examples: [
        'resource.cleanup {"unloadHiddenData":true}',
        'resource.cleanup {"clearHistory":true,"unloadAssistant":true}',
      ],
      parsePayload: parseResourceCleanupPayload,
      execute(context, payload) {
        return context.runResourceCleanup(payload);
      },
    },
    {
      id: "workspace.toggleAssistant",
      title: "Toggle assistant workspace",
      description: "Open or close the built-in assistant workspace.",
      usage: "workspace.toggleAssistant",
      examples: ["workspace.toggleAssistant"],
      execute(context) {
        context.toggleAssistantWorkspace();
        return { active: true };
      },
    },
    {
      id: "workspace.toggleResources",
      title: "Toggle resource manager",
      description: "Open or close the bottom resource manager workspace.",
      usage: "workspace.toggleResources",
      examples: ["workspace.toggleResources"],
      execute(context) {
        return { open: context.toggleResourceManagerWorkspace() };
      },
    },
    {
      id: "workspace.toggleCommands",
      title: "Toggle command console",
      description: "Open or close the bottom command console workspace.",
      usage: "workspace.toggleCommands",
      examples: ["workspace.toggleCommands"],
      execute(context) {
        return { open: context.toggleCommandConsoleWorkspace() };
      },
    },
    {
      id: "workspace.openExport",
      title: "Open export dialog",
      description: "Open the viewer state export dialog.",
      usage: "workspace.openExport",
      examples: ["workspace.openExport"],
      execute(context) {
        context.openExport();
        return { opened: true };
      },
    },
    {
      id: "workspace.openImport",
      title: "Open import workspace",
      description: "Open the data import workspace with a chosen initial view.",
      usage: "workspace.openImport library",
      examples: [
        "workspace.openImport library",
        "workspace.openImport import-external",
        'workspace.openImport {"view":"import-local"}',
      ],
      parsePayload: parseImportWorkspacePayload,
      execute(context, payload) {
        return context.openImportWorkspace(payload.view);
      },
    },
    {
      id: "workspace.openStateImport",
      title: "Open state import dialog",
      description: "Open the viewer state import dialog.",
      usage: "workspace.openStateImport",
      examples: ["workspace.openStateImport"],
      execute(context) {
        context.openImport();
        return { opened: true };
      },
    },
    {
      id: "workspace.openLibrary",
      title: "Open viewer library",
      description: "Open the saved viewer library workspace.",
      usage: "workspace.openLibrary",
      examples: ["workspace.openLibrary"],
      execute(context) {
        return context.openViewerLibraryWorkspace();
      },
    },
    {
      id: "workspace.closeDialogs",
      title: "Close dialogs",
      description: "Close viewer dialogs and transient modals.",
      usage: "workspace.closeDialogs",
      examples: ["workspace.closeDialogs"],
      execute(context) {
        context.closeDialogs();
        return { closed: true };
      },
    },
    {
      id: "data.openAddLayer",
      title: "Open add-layer workspace",
      description: "Open the import workspace on the add-layer browser.",
      usage: "data.openAddLayer",
      examples: ["data.openAddLayer"],
      execute(context) {
        return context.openImportWorkspace("library");
      },
    },
    {
      id: "data.openLocalManager",
      title: "Open local dataset manager",
      description: "Open the local dataset manager, optionally targeting a specific source id.",
      usage: "data.openLocalManager",
      examples: [
        "data.openLocalManager",
        "data.openLocalManager source-id",
        'data.openLocalManager {"sourceId":"source-id"}',
      ],
      parsePayload: parseOptionalSourceIdPayload,
      execute(context, payload) {
        return context.openLocalDatasetManager(payload.sourceId ?? null);
      },
    },
    {
      id: "data.openSourceDetails",
      title: "Open selected layer source details",
      description: "Open the managed source or note details for a layer, defaulting to the current selection.",
      usage: "data.openSourceDetails",
      examples: [
        "data.openSourceDetails",
        "data.openSourceDetails layer-id",
        'data.openSourceDetails {"nodeId":"layer-id"}',
      ],
      parsePayload(value) {
        return parseOptionalNodeTargetPayload(value, "data.openSourceDetails");
      },
      execute(context, payload) {
        return context.openSelectedLayerSourceDetails(payload.nodeId ?? null);
      },
    },
  ];
}

export function createViewerCommandService(context: ViewerCommandContext) {
  const definitions = createDefinitions();
  const definitionsById = new Map(definitions.map((definition) => [definition.id, definition]));
  const shellBuiltinsById = new Map(
    SHELL_BUILTINS.map((definition) => [definition.id, definition])
  );

  function listCommands(): ViewerCommandSummary[] {
    return [
      ...definitions.map((definition) => ({
        id: definition.id,
        title: definition.title,
        description: definition.description,
        usage: definition.usage,
        examples: definition.examples,
      })),
      ...SHELL_BUILTINS.map((definition) => ({
        id: definition.id,
        title: definition.title,
        description: definition.description,
        usage: definition.usage,
        examples: definition.examples,
      })),
    ];
  }

  function getCommandSummary(commandId: string): ViewerCommandSummary | null {
    const definition = definitionsById.get(commandId);
    if (definition) {
      return {
        id: definition.id,
        title: definition.title,
        description: definition.description,
        usage: definition.usage,
        examples: definition.examples,
      };
    }
    const shellBuiltin = shellBuiltinsById.get(commandId);
    if (!shellBuiltin) return null;
    return {
      id: shellBuiltin.id,
      title: shellBuiltin.title,
      description: shellBuiltin.description,
      usage: shellBuiltin.usage,
      examples: shellBuiltin.examples,
    };
  }

  function execute(commandId: string, payload?: unknown): unknown | Promise<unknown> {
    const definition = definitionsById.get(commandId);
    if (!definition) {
      throw new Error(`Unknown viewer command '${commandId}'.`);
    }

    if (commandId === "help") {
      const requestedId =
        typeof definition.parsePayload === "function"
          ? (definition.parsePayload(payload) as string | undefined)
          : undefined;

      if (!requestedId) {
        return listCommands();
      }

      const summary = getCommandSummary(requestedId);
      if (!summary) {
        throw new Error(`Unknown viewer command '${requestedId}'.`);
      }
      return summary;
    }

    const parsedPayload =
      typeof definition.parsePayload === "function"
        ? definition.parsePayload(payload)
        : payload;

    return definition.execute(context, parsedPayload as never);
  }

  async function executeStage(
    stageText: string,
    stdin: string,
    shellState: ShellRuntimeState
  ): Promise<ViewerCommandExecutionStep> {
    const { commandId, payloadText } = parseSingleStage(stageText);
    if (!commandId) {
      throw new Error("Missing command in pipeline stage.");
    }

    if (shellBuiltinsById.has(commandId)) {
      const stdout = runShellBuiltin(commandId, payloadText, stdin, shellState);
      return {
        commandId,
        payload: payloadText,
        result: stdout,
        stdout,
        success: true,
      };
    }

    const payload =
      payloadText.length > 0
        ? parseCommandLinePayload(payloadText, shellState.variables)
        : stdin
          ? stdin
          : undefined;
    const result = await Promise.resolve(execute(commandId, payload));
    const stdout = formatShellOutput(result);

    return {
      commandId,
      payload,
      result,
      stdout,
      success: true,
    };
  }

  async function executePipeline(
    pipelineText: string,
    stdin: string,
    shellState: ShellRuntimeState
  ): Promise<{
    stdout: string;
    steps: ViewerCommandExecutionStep[];
    finalStep: ViewerCommandExecutionStep | null;
  }> {
    const stages = splitTopLevelByOperators(pipelineText, ["|"]).map((part) => part.text);
    if (!stages.length) {
      throw new Error("Missing command to execute.");
    }

    const steps: ViewerCommandExecutionStep[] = [];
    let currentStdin = stdin;

    for (const stage of stages) {
      const step = await executeStage(stage, currentStdin, shellState);
      steps.push(step);
      currentStdin = step.stdout;
    }

    return {
      stdout: currentStdin,
      steps,
      finalStep: steps[steps.length - 1] ?? null,
    };
  }

  async function runLine(
    line: string,
    options: ViewerCommandRunOptions = {}
  ): Promise<ViewerCommandExecutionResult> {
    const trimmed = stripShellComment(line).trim();
    if (!trimmed) {
      throw new Error("Enter a viewer command.");
    }

    const shellState: ShellRuntimeState = {
      files: { ...(options.files ?? {}) },
      variables: { ...(options.variables ?? {}) },
    };
    const { commandText, redirect, stdin: redirectedStdin } = parseRedirects(
      trimmed,
      shellState
    );
    const sequences = splitTopLevelByOperators(commandText, ["&&", ";"]);
    if (!sequences.length) {
      throw new Error("Enter a viewer command.");
    }

    const steps: ViewerCommandExecutionStep[] = [];
    let lastSuccess = true;
    let lastStdout = "";
    let lastStep: ViewerCommandExecutionStep | null = null;

    for (const sequence of sequences) {
      if (sequence.operatorBefore === "&&" && !lastSuccess) {
        continue;
      }

      try {
        const execution = await executePipeline(
          sequence.text,
          lastStep ? "" : options.stdin ?? redirectedStdin,
          shellState
        );
        steps.push(...execution.steps);
        lastStdout = execution.stdout;
        lastStep = execution.finalStep;
        lastSuccess = true;
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Viewer command failed.";
        const failedStep: ViewerCommandExecutionStep = {
          commandId: parseSingleStage(sequence.text).commandId || "shell",
          payload: sequence.text,
          result: message,
          stdout: message,
          success: false,
        };
        steps.push(failedStep);
        lastStdout = message;
        lastStep = failedStep;
        lastSuccess = false;
      }
    }

    const downloads = redirect
      ? [
          {
            ...redirect,
            content: lastStdout,
            mimeType: inferDownloadMimeType(
              redirect.filename,
              lastStdout
            ),
          },
        ]
      : undefined;

    return {
      commandId: lastStep?.commandId ?? "shell",
      payload: trimmed,
      result: lastStep?.result ?? lastStdout,
      stdout: lastStdout,
      success: lastSuccess,
      steps,
      downloads,
      variables: shellState.variables,
    };
  }

  return {
    listCommands,
    getCommandSummary,
    execute,
    runLine,
  };
}
