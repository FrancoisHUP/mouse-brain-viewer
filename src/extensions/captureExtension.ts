import { defineToolExtension } from "../tools/extensionApi";

export const captureExtension = defineToolExtension({
  manifest: {
    id: "capture",
    label: "Capture image",
    kind: "extension",
    status: "stable",
    source: "built-in",
    version: "1.0.0",
    publishedAt: "2026-05-19",
    description: "Capture still images, manage scenes, and play saved sequences.",
    keywords: ["capture", "export", "snapshot", "animation"],
    developerName: "Core viewer",
    toolbar: {
      defaultOrder: 2,
      defaultVisible: true,
      removable: true,
    },
  },
  capabilities: ["toolbar.activate", "capture.openEditor", "capture.manage"],
  toolbarPresentation: { variant: "capture" },
  onToolbarSelect(context) {
      context.commands.openCaptureEditor();
    return true;
  },
  onCapturePrimarySelect(context, event) {
    if (event.action === "open-editor") {
      context.commands.openCaptureEditor();
      return true;
    }
    if (event.action === "export-frame") {
      context.commands.exportCaptureFrame();
      return true;
    }
    if (event.action === "toggle-playback") {
      context.commands.toggleCapturePlayback();
      return true;
    }
    if (event.action === "stop-playback") {
      context.commands.stopCapturePlayback();
      return true;
    }
  },
  onCaptureStillSelect(context, event) {
    if (event.action === "load") {
      context.commands.loadCaptureStill(event.stillId);
      return true;
    }
    if (event.action === "download") {
      context.commands.downloadCaptureStill(event.stillId);
      return true;
    }
    if (event.action === "delete") {
      context.commands.deleteCaptureStill(event.stillId);
      return true;
    }
  },
  onCaptureSequenceSelect(context, event) {
    if (event.action === "load") {
      context.commands.loadCaptureSequence(event.sequenceId);
      return true;
    }
    if (event.action === "play-once") {
      context.commands.playCaptureSequence(event.sequenceId, "once");
      return true;
    }
    if (event.action === "play-loop") {
      context.commands.playCaptureSequence(event.sequenceId, "loop");
      return true;
    }
    if (event.action === "rename" && event.nextName) {
      context.commands.renameCaptureSequence(event.sequenceId, event.nextName);
      return true;
    }
    if (event.action === "delete") {
      context.commands.deleteCaptureSequence(event.sequenceId);
      return true;
    }
  },
});
