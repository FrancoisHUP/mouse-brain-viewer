import { defineUtilityToolExtension } from "../tools/extensionApi";

export const resourceManagerExtension = defineUtilityToolExtension({
  manifest: {
    id: "resources",
    label: "Resource manager",
    kind: "extension",
    status: "stable",
    source: "built-in",
    version: "1.0.0",
    publishedAt: "2026-05-19",
    description: "Monitor browser and worker usage, inspect recent activity, and manage local resource-heavy tasks.",
    keywords: ["resources", "performance", "workers", "monitoring", "telemetry"],
    developerName: "Core viewer",
    toolbar: {
      defaultOrder: 41,
      defaultVisible: false,
      removable: true,
    },
  },
  capabilities: ["resource-manager.workspace", "toolbar.activate"],
  toolbarPresentation: { variant: "resources" },
  onToolbarSelect(context) {
    context.commands.toggleResourceManagerWorkspace();
    return true;
  },
});
