import type { ToolbarToolId, ToolbarToolManifest, ToolId } from "./types";

export type ToolExtensionCapability =
  | "toolbar.activate"
  | "annotation.manage"
  | "assistant.workspace"
  | "command-console.workspace"
  | "toolbar.customize"
  | "capture.openEditor"
  | "capture.manage"
  | "pipeline.manage"
  | "resource-manager.workspace"
  | "viewer.inspectSelection";

export type ToolExtensionViewerSnapshot = {
  activeTool: ToolId;
  selectedNodeId: string | null;
};

export type ToolExtensionToolbarSnapshot = {
  visibleToolIds: ToolbarToolId[];
  hiddenToolIds: ToolbarToolId[];
  editMode: boolean;
};

export type ToolExtensionCommands = {
  activateToolbarTool: (toolId: ToolId) => void;
  setAnnotationShape: (shape: string) => void;
  setAnnotationColor: (color: string) => void;
  commitAnnotationColor: (color: string) => void;
  setAnnotationOpacity: (opacity: number) => void;
  setAnnotationSize: (size: number) => void;
  setAnnotationDepth: (depth: number) => void;
  setAnnotationEraseMode: (mode: "all" | "color") => void;
  pickAnnotationColorFromScreen: () => Promise<void>;
  openCaptureEditor: () => void;
  exportCaptureFrame: () => void;
  toggleCapturePlayback: () => void;
  stopCapturePlayback: () => void;
  loadCaptureStill: (stillId: string) => void;
  downloadCaptureStill: (stillId: string) => void;
  deleteCaptureStill: (stillId: string) => void;
  loadCaptureSequence: (sequenceId: string) => void;
  playCaptureSequence: (sequenceId: string, mode: "once" | "loop") => void;
  renameCaptureSequence: (sequenceId: string, nextName: string) => void;
  deleteCaptureSequence: (sequenceId: string) => void;
  openAutomationPipelineWorkspace: (pipelineId?: string | null) => void;
  setAutomationPipelineEnabled: (pipelineId: string, enabled: boolean) => void;
  toggleAssistantWorkspace: () => void;
  toggleCommandConsoleWorkspace: () => void;
  submitAssistantQuickPrompt: (prompt: string) => void;
  toggleResourceManagerWorkspace: () => void;
  showToolbarTool: (toolId: ToolbarToolId) => void;
  hideToolbarTool: (toolId: ToolbarToolId) => void;
  setToolbarEditMode: (editing: boolean) => void;
};

export type ToolExtensionContext = {
  viewer: ToolExtensionViewerSnapshot;
  toolbar: ToolExtensionToolbarSnapshot;
  commands: ToolExtensionCommands;
};

export type ToolExtensionSelectSource = "toolbar" | "explorer" | "command";

export type ToolExtensionSelectEvent = {
  source: ToolExtensionSelectSource;
};

export type ToolExtensionPipelineMenuEvent = {
  pipelineId: string;
};

export type ToolExtensionPipelineToggleEvent = {
  pipelineId: string;
  enabled: boolean;
};

export type ToolExtensionCapturePrimaryAction =
  | "open-editor"
  | "export-frame"
  | "toggle-playback"
  | "stop-playback";

export type ToolExtensionCapturePrimaryEvent = {
  action: ToolExtensionCapturePrimaryAction;
};

export type ToolExtensionCaptureStillAction = "load" | "download" | "delete";

export type ToolExtensionCaptureStillEvent = {
  action: ToolExtensionCaptureStillAction;
  stillId: string;
};

export type ToolExtensionCaptureSequenceAction =
  | "load"
  | "play-once"
  | "play-loop"
  | "rename"
  | "delete";

export type ToolExtensionCaptureSequenceEvent = {
  action: ToolExtensionCaptureSequenceAction;
  sequenceId: string;
  nextName?: string;
};

export type ToolExtensionAnnotationPrimaryEvent = {
  action: "activate";
};

export type ToolExtensionAnnotationSettingAction =
  | "set-shape"
  | "set-color"
  | "commit-color"
  | "set-opacity"
  | "set-size"
  | "set-depth"
  | "set-erase-mode"
  | "pick-color";

export type ToolExtensionAnnotationSettingEvent = {
  action: ToolExtensionAnnotationSettingAction;
  value?: string | number;
};

export type ToolExtensionAssistantQuickPromptEvent = {
  prompt: string;
};

export type ToolExtensionToolbarPresentation =
  | { variant: "default" }
  | { variant: "annotation" }
  | { variant: "capture" }
  | { variant: "slice" }
  | { variant: "pipeline" }
  | { variant: "assistant" }
  | { variant: "commands" }
  | { variant: "resources" };

export type ToolExtensionDefinition = {
  manifest: ToolbarToolManifest;
  capabilities: ToolExtensionCapability[];
  toolbarPresentation: ToolExtensionToolbarPresentation;
  onToolbarSelect?: (
    context: ToolExtensionContext,
    event: ToolExtensionSelectEvent
  ) => boolean | void;
  onPipelineMenuSelect?: (
    context: ToolExtensionContext,
    event: ToolExtensionPipelineMenuEvent
  ) => boolean | void;
  onPipelineToggleSelect?: (
    context: ToolExtensionContext,
    event: ToolExtensionPipelineToggleEvent
  ) => boolean | void;
  onCapturePrimarySelect?: (
    context: ToolExtensionContext,
    event: ToolExtensionCapturePrimaryEvent
  ) => boolean | void;
  onCaptureStillSelect?: (
    context: ToolExtensionContext,
    event: ToolExtensionCaptureStillEvent
  ) => boolean | void;
  onCaptureSequenceSelect?: (
    context: ToolExtensionContext,
    event: ToolExtensionCaptureSequenceEvent
  ) => boolean | void;
  onAnnotationPrimarySelect?: (
    context: ToolExtensionContext,
    event: ToolExtensionAnnotationPrimaryEvent
  ) => boolean | void;
  onAnnotationSettingSelect?: (
    context: ToolExtensionContext,
    event: ToolExtensionAnnotationSettingEvent
  ) => boolean | void;
};

export type UtilityToolExtensionDefinition = {
  manifest: ToolbarToolManifest;
  capabilities: ToolExtensionCapability[];
  toolbarPresentation: ToolExtensionToolbarPresentation;
  onToolbarSelect?: (
    context: ToolExtensionContext,
    event: ToolExtensionSelectEvent
  ) => boolean | void;
  onAssistantQuickPromptSelect?: (
    context: ToolExtensionContext,
    event: ToolExtensionAssistantQuickPromptEvent
  ) => boolean | void;
};

export function defineToolExtension(
  definition: ToolExtensionDefinition
): ToolExtensionDefinition {
  return definition;
}

export function defineUtilityToolExtension(
  definition: UtilityToolExtensionDefinition
): UtilityToolExtensionDefinition {
  return definition;
}
