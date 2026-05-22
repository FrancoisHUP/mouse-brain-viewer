import { assistantExtension } from "./assistantExtension";
import { annotationExtension } from "./annotationExtension";
import { captureExtension } from "./captureExtension";
import { commandConsoleExtension } from "./commandConsoleExtension";
import { pipelineExtension } from "./pipelineExtension";
import { resourceManagerExtension } from "./resourceManagerExtension";
import { sliceExtension } from "./sliceExtension";

export const TOOL_EXTENSIONS = [
  captureExtension,
  annotationExtension,
  sliceExtension,
  pipelineExtension,
];

export const UTILITY_TOOL_EXTENSIONS = [
  assistantExtension,
  resourceManagerExtension,
  commandConsoleExtension,
];
