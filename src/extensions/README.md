# Extension authoring

This folder contains the in-repo extension system for the viewer.

The current model is intentionally simple:

- extension code lives in the main repository
- maintainers review and merge extensions like normal source code
- users can enable, disable, and reorder toolbar extensions without downloading remote code

This keeps the project safe and easy to test while still making it possible for contributors to add new tools.

## Extension types

There are two extension categories today.

### 1. Toolbar extensions

These are tools that appear in the customizable toolbar and the tool explorer.

Examples:

- `capture`
- `annotation`
- `slice`
- `pipeline`

Toolbar extensions are registered in:

- [src/extensions/index.ts](/home/frank/mouse-brain-viewer/src/extensions/index.ts)

They use:

- `defineToolExtension(...)` from [src/tools/extensionApi.ts](/home/frank/mouse-brain-viewer/src/tools/extensionApi.ts)

Each toolbar extension provides:

- a `manifest`
- a set of `capabilities`
- a `toolbarPresentation`
- optional event handlers such as `onToolbarSelect(...)`

### 2. Utility toolbar extensions

These are toolbar-adjacent tools that are not yet part of the customizable extension registry.

Examples:

- `assistant`
- `resources`

Utility extensions are also registered in:

- [src/extensions/index.ts](/home/frank/mouse-brain-viewer/src/extensions/index.ts)

They use:

- `defineUtilityToolExtension(...)` from [src/tools/extensionApi.ts](/home/frank/mouse-brain-viewer/src/tools/extensionApi.ts)

## How to add a new toolbar extension

1. Create a file in `src/extensions/`, for example `myToolExtension.ts`.
2. Export the extension with `defineToolExtension(...)`.
3. Add it to `TOOL_EXTENSIONS` in [src/extensions/index.ts](/home/frank/mouse-brain-viewer/src/extensions/index.ts).
4. If the extension needs a special toolbar UI, add a new `toolbarPresentation` variant in [src/tools/extensionApi.ts](/home/frank/mouse-brain-viewer/src/tools/extensionApi.ts) and teach [src/BottomToolbar.tsx](/home/frank/mouse-brain-viewer/src/BottomToolbar.tsx) how to render that variant.
5. If the extension needs new app actions, extend `ToolExtensionCommands` and wire them in [src/App.tsx](/home/frank/mouse-brain-viewer/src/App.tsx).

Example:

```ts
import { defineToolExtension } from "../tools/extensionApi";

export const myToolExtension = defineToolExtension({
  manifest: {
    id: "pipeline",
    label: "My tool",
    kind: "extension",
    status: "beta",
    source: "contributed",
    version: "0.1.0",
    publishedAt: "2026-05-19",
    description: "Short explanation of what this tool does.",
    keywords: ["example", "tool"],
    developerName: "Your name",
    toolbar: {
      defaultOrder: 99,
      defaultVisible: true,
      removable: true,
    },
  },
  capabilities: ["toolbar.activate"],
  toolbarPresentation: { variant: "default" },
  onToolbarSelect(context) {
    context.commands.activateToolbarTool("pipeline");
    return true;
  },
});
```

The example above is only structural. In practice, new tools should get a new `ToolbarToolId` rather than reuse an existing id.

## How to add a new utility extension

1. Create a file in `src/extensions/`.
2. Export the extension with `defineUtilityToolExtension(...)`.
3. Add it to `UTILITY_TOOL_EXTENSIONS` in [src/extensions/index.ts](/home/frank/mouse-brain-viewer/src/extensions/index.ts).
4. Route the relevant toolbar button or quick action through `getUtilityToolExtensionDefinition(...)` in [src/App.tsx](/home/frank/mouse-brain-viewer/src/App.tsx).

## Authoring rules

- Prefer adding new behavior through `ToolExtensionCommands` instead of importing deep app internals into extension files.
- Keep extension files small and declarative.
- If a new extension requires app changes, try to add a reusable command or event hook instead of a one-off special case.
- Use the manifest metadata seriously. The tool explorer reads directly from it.
- Keep tool documentation in [src/tools/toolDocumentation.ts](/home/frank/mouse-brain-viewer/src/tools/toolDocumentation.ts). The explorer detail panel supports markdown or sanitized HTML through the shared rich-content renderer.
- Put temporary GIF references in the documentation entry using `suggestedPath`, for example `/tool-docs/my-tool/overview.gif`. When the actual media exists, add `src` to the asset entry.
- Avoid editing unrelated toolbar code when the extension can express its needs through the API.

## Current limits

The extension system is still growing. Right now:

- toolbar rendering still has some special variants in [src/BottomToolbar.tsx](/home/frank/mouse-brain-viewer/src/BottomToolbar.tsx)
- only some tools are fully migrated to the extension runtime contract
- utility extensions are not yet first-class customizable toolbar registry items

Even with those limits, the current direction is:

- define tools in `src/extensions`
- register them centrally
- expose app behavior through typed commands
- keep contributor logic out of `App.tsx` whenever possible
