import { defineToolExtension } from "../tools/extensionApi";

export const sliceExtension = defineToolExtension({
  manifest: {
    id: "slice",
    label: "Browse slices",
    kind: "extension",
    status: "stable",
    source: "built-in",
    version: "1.0.0",
    publishedAt: "2026-05-19",
    description: "Inspect orthogonal and free slices for the active volume layer.",
    keywords: ["slice", "volume", "plane", "browse"],
    developerName: "Core viewer",
    toolbar: {
      defaultOrder: 4,
      defaultVisible: true,
      removable: true,
    },
  },
  capabilities: ["toolbar.activate", "viewer.inspectSelection"],
  toolbarPresentation: { variant: "slice" },
  onToolbarSelect(context) {
    context.commands.activateToolbarTool("slice");
    return true;
  },
});
