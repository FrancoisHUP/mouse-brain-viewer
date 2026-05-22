import { defineUtilityToolExtension } from "../tools/extensionApi";

export const commandConsoleExtension = defineUtilityToolExtension({
  manifest: {
    id: "commands",
    label: "Command console",
    kind: "extension",
    status: "beta",
    source: "built-in",
    version: "1.0.0",
    publishedAt: "2026-05-22",
    description: "Run viewer commands from a docked console and expose the same command service to external clients.",
    keywords: ["command", "console", "cli", "api", "automation"],
    developerName: "Core viewer",
    toolbar: {
      defaultOrder: 42,
      defaultVisible: false,
      removable: true,
    },
  },
  capabilities: ["command-console.workspace", "toolbar.activate"],
  toolbarPresentation: { variant: "commands" },
  onToolbarSelect(context) {
    context.commands.toggleCommandConsoleWorkspace();
    return true;
  },
});
