import { defineToolExtension } from "../tools/extensionApi";

export const annotationExtension = defineToolExtension({
  manifest: {
    id: "pencil",
    label: "Draw",
    kind: "extension",
    status: "stable",
    source: "built-in",
    version: "1.0.0",
    publishedAt: "2026-05-19",
    description: "Create and edit annotations directly in the viewer.",
    keywords: ["annotation", "draw", "markup", "notes"],
    developerName: "Core viewer",
    toolbar: {
      defaultOrder: 3,
      defaultVisible: true,
      removable: true,
    },
  },
  capabilities: ["toolbar.activate", "annotation.manage", "viewer.inspectSelection"],
  toolbarPresentation: { variant: "annotation" },
  onToolbarSelect(context) {
    context.commands.activateToolbarTool("pencil");
    return true;
  },
  onAnnotationPrimarySelect(context) {
    context.commands.activateToolbarTool("pencil");
    return true;
  },
  onAnnotationSettingSelect(context, event) {
    if (event.action === "set-shape" && typeof event.value === "string") {
      context.commands.setAnnotationShape(event.value);
      return true;
    }
    if (event.action === "set-color" && typeof event.value === "string") {
      context.commands.setAnnotationColor(event.value);
      return true;
    }
    if (event.action === "commit-color" && typeof event.value === "string") {
      context.commands.commitAnnotationColor(event.value);
      return true;
    }
    if (event.action === "set-opacity" && typeof event.value === "number") {
      context.commands.setAnnotationOpacity(event.value);
      return true;
    }
    if (event.action === "set-size" && typeof event.value === "number") {
      context.commands.setAnnotationSize(event.value);
      return true;
    }
    if (event.action === "set-depth" && typeof event.value === "number") {
      context.commands.setAnnotationDepth(event.value);
      return true;
    }
    if (event.action === "set-erase-mode" && (event.value === "all" || event.value === "color")) {
      context.commands.setAnnotationEraseMode(event.value);
      return true;
    }
    if (event.action === "pick-color") {
      void context.commands.pickAnnotationColorFromScreen();
      return true;
    }
  },
});
