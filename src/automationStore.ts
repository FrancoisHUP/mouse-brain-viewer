import {
  createAutomationPipeline,
  sanitizeAutomationCustomTools,
  sanitizeAutomationPipelines,
  type AutomationCustomTool,
  type AutomationPipeline,
} from "./automationTypes";

export const AUTOMATION_PIPELINES_STORAGE_KEY = "mouse-brain-viewer:automation-pipelines:v1";
export const AUTOMATION_CUSTOM_TOOLS_STORAGE_KEY = "mouse-brain-viewer:automation-custom-tools:v1";

export function loadAutomationPipelines(): AutomationPipeline[] {
  if (typeof window === "undefined") return [createAutomationPipeline("First pipeline")];
  try {
    const raw = window.localStorage.getItem(AUTOMATION_PIPELINES_STORAGE_KEY);
    if (!raw) return [createAutomationPipeline("First pipeline")];
    const parsed = JSON.parse(raw) as unknown;
    return sanitizeAutomationPipelines(parsed, [createAutomationPipeline("First pipeline")]);
  } catch {
    return [createAutomationPipeline("First pipeline")];
  }
}

export function loadAutomationCustomTools(): AutomationCustomTool[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(AUTOMATION_CUSTOM_TOOLS_STORAGE_KEY);
    if (!raw) return [];
    return sanitizeAutomationCustomTools(JSON.parse(raw) as unknown);
  } catch {
    return [];
  }
}
