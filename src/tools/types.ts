export type ToolId =
  | "mouse"
  | "select"
  | "windows"
  | "capture"
  | "pencil"
  | "slice"
  | "pipeline"
  | "resources"
  | "assistant"
  | "data"
  | "search"
  | "library"
  | "save"
  | "export"
  | "settings"
  | "account";

export type ToolbarToolId =
  | "mouse"
  | "select"
  | "windows"
  | "capture"
  | "pencil"
  | "slice"
  | "pipeline"
  | "resources"
  | "assistant";

export type ToolKind = "core" | "extension";
export type ToolStatus = "stable" | "beta";
export type ToolSource = "built-in" | "contributed";

export type ToolbarToolManifest = {
  id: ToolbarToolId;
  label: string;
  kind: ToolKind;
  status: ToolStatus;
  source: ToolSource;
  version: string;
  publishedAt: string;
  description: string;
  keywords: string[];
  developerName: string;
  toolbar: {
    defaultOrder: number;
    defaultVisible: boolean;
    removable: boolean;
  };
};
