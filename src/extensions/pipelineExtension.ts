import { defineToolExtension } from "../tools/extensionApi";

export const pipelineExtension = defineToolExtension({
  manifest: {
    id: "pipeline",
    label: "Automation pipelines",
    kind: "extension",
    status: "beta",
    source: "built-in",
    version: "0.9.0-beta",
    publishedAt: "2026-05-19",
    description: "Open and manage automation pipelines connected to viewer events.",
    keywords: ["automation", "pipeline", "workflow", "beta"],
    developerName: "Core viewer",
    toolbar: {
      defaultOrder: 5,
      defaultVisible: true,
      removable: true,
    },
  },
  capabilities: ["toolbar.activate", "pipeline.manage"],
  toolbarPresentation: { variant: "pipeline" },
  onToolbarSelect(context) {
    context.commands.openAutomationPipelineWorkspace();
    return true;
  },
  onPipelineMenuSelect(context, event) {
    context.commands.openAutomationPipelineWorkspace(event.pipelineId);
    return true;
  },
  onPipelineToggleSelect(context, event) {
    context.commands.setAutomationPipelineEnabled(event.pipelineId, event.enabled);
    return true;
  },
});
