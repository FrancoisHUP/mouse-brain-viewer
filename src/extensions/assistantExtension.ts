import { defineUtilityToolExtension } from "../tools/extensionApi";

export const assistantExtension = defineUtilityToolExtension({
  manifest: {
    id: "assistant",
    label: "Assistant",
    kind: "extension",
    status: "beta",
    source: "built-in",
    version: "1.0.0",
    publishedAt: "2026-05-19",
    description: "Open the built-in assistant workspace, send quick prompts, and launch assistant-driven tasks.",
    keywords: ["assistant", "chat", "automation", "workspace", "ai"],
    developerName: "Core viewer",
    toolbar: {
      defaultOrder: 40,
      defaultVisible: false,
      removable: true,
    },
  },
  capabilities: ["assistant.workspace", "toolbar.activate"],
  toolbarPresentation: { variant: "assistant" },
  onToolbarSelect(context) {
    context.commands.toggleAssistantWorkspace();
    return true;
  },
  onAssistantQuickPromptSelect(context, event) {
    context.commands.submitAssistantQuickPrompt(event.prompt);
    return true;
  },
});
