import type { ToolbarToolId } from "./types";

export type ToolDocumentationAsset = {
  id: string;
  title: string;
  description: string;
  alt: string;
  suggestedPath: string;
  src?: string;
};

export type ToolDocumentationEntry = {
  content: string;
  assets: ToolDocumentationAsset[];
};

const TOOL_DOCUMENTATION: Record<ToolbarToolId, ToolDocumentationEntry> = {
  mouse: {
    content: `
## What it does

The **Move** tool lets you navigate the 3D brain view. It is the main tool for changing viewpoint, framing the scene, and switching between **orbit controls** and **fly camera** behavior.

## How to use

1. Activate **Move** from the toolbar.
2. Use the camera mode switch inside the tool menu to choose **Orbit controls** or **Fly camera**.
3. In **Orbit controls**, drag to rotate around the scene and zoom to inspect structures from different distances.
4. In **Fly camera**, use free-look navigation to move through the scene more directly.
5. Use the focus action when you want to quickly recenter on the active layer.

## Notes

- **Orbit controls** are the default mode because they are usually the most comfortable for scientific inspection.
- Use this tool when you want to explore the scene without editing content.
`.trim(),
    assets: [
      {
        id: "orbit-navigation",
        title: "Orbit navigation overview",
        description: "Show the user rotating around the brain, zooming in, and reframing the scene with orbit controls.",
        alt: "Orbit navigation around the 3D mouse brain scene.",
        suggestedPath: "/tool-docs/mouse/orbit-navigation.gif",
      },
      {
        id: "fly-vs-orbit",
        title: "Switching camera modes",
        description: "Show the move tool menu opening, then switching between Orbit controls and Fly camera so the difference is immediately visible.",
        alt: "Switching between orbit controls and fly camera.",
        suggestedPath: "/tool-docs/mouse/camera-mode-switch.gif",
      },
    ],
  },
  select: {
    content: `
## What it does

The **Select** tool is used to inspect objects in the scene and make them active. It is the safest tool for browsing data because it focuses on picking and inspection rather than editing.

## How to use

1. Activate **Select** from the toolbar.
2. Click a visible structure, slice, or annotation to make it active.
3. Use the resulting selection to inspect metadata, adjust settings in related panels, or prepare another tool to act on that item.
4. Combine **Select** with **Windows** or inspector panels when you want to compare information across multiple views.

## Notes

- Use **Select** before tools like **Browse slices** or **Annotation** when those tools depend on the current active layer.
- If a click does not affect the expected object, first make sure the correct layer is visible and unlocked.
`.trim(),
    assets: [
      {
        id: "pick-layer",
        title: "Selecting a structure",
        description: "Show the cursor clicking a visible object and the corresponding layer or metadata becoming active.",
        alt: "Selecting a structure in the viewer.",
        suggestedPath: "/tool-docs/select/select-structure.gif",
      },
    ],
  },
  windows: {
    content: `
## What it does

The **Windows** tool helps manage floating workspace windows such as metadata views, assistant conversations, or other detached panels.

## How to use

1. Activate **Windows** from the toolbar.
2. Review the list of currently open floating windows.
3. Restore minimized windows when you want them back in view.
4. Focus a window to bring it to the front.
5. Close windows you no longer need to keep the workspace tidy.

## Notes

- This tool is always available because it supports the whole workspace layout.
- Use it when the screen becomes crowded or when a useful panel seems to have disappeared.
`.trim(),
    assets: [
      {
        id: "window-management",
        title: "Managing floating windows",
        description: "Show multiple floating windows, then demonstrate focusing, restoring, and closing them from the Windows tool.",
        alt: "Managing floating workspace windows.",
        suggestedPath: "/tool-docs/windows/manage-windows.gif",
      },
    ],
  },
  capture: {
    content: `
## What it does

The **Capture image** tool helps you save views of the scene, build reusable scenes, and create animation sequences for communication or documentation.

## How to use

1. Activate **Capture image** from the toolbar.
2. Use **Export frame** when you want a single still image of the current view.
3. Use **Record animation** to open the animation workspace and create a richer sequence.
4. Save important viewpoints as scenes so they can be reloaded later.
5. Organize scenes into a sequence, then play the sequence once or in a loop.

## Notes

- Still captures are useful for figures and reports.
- Sequences are useful for walkthroughs, presentations, and showing spatial relationships through motion.
`.trim(),
    assets: [
      {
        id: "export-still",
        title: "Exporting a still image",
        description: "Show the user framing the scene, opening Capture image, and exporting a single still frame.",
        alt: "Exporting a still frame from the viewer.",
        suggestedPath: "/tool-docs/capture/export-still.gif",
      },
      {
        id: "record-animation",
        title: "Recording an animation workflow",
        description: "Show the Record animation action opening the animation workspace, adding scenes, and previewing the sequence.",
        alt: "Opening the animation workspace and building a sequence.",
        suggestedPath: "/tool-docs/capture/record-animation.gif",
      },
    ],
  },
  pencil: {
    content: `
## What it does

The **Annotation** tool lets you draw directly in the viewer. It is useful for pointing out structures, tracing areas of interest, and marking observations during review.

## How to use

1. Activate **Annotation** from the toolbar.
2. Choose a shape or drawing mode appropriate for the note you want to make.
3. Set the annotation color, size, opacity, and depth.
4. Draw directly in the scene.
5. Use erase mode or the color picker when you want to refine existing markup.

## Notes

- Recent colors make it easy to stay visually consistent across related annotations.
- Depth and opacity are especially helpful when annotations need to sit clearly on top of 3D content.
`.trim(),
    assets: [
      {
        id: "draw-annotation",
        title: "Creating an annotation",
        description: "Show the annotation panel opening, changing color and size, then drawing a simple note on top of the scene.",
        alt: "Drawing an annotation in the viewer.",
        suggestedPath: "/tool-docs/pencil/create-annotation.gif",
      },
      {
        id: "erase-and-pick",
        title: "Refining annotations",
        description: "Show toggling erase mode and using the eyedropper to match an existing annotation color.",
        alt: "Erasing annotations and picking a color from the scene.",
        suggestedPath: "/tool-docs/pencil/refine-annotation.gif",
      },
    ],
  },
  slice: {
    content: `
## What it does

The **Browse slices** tool is designed for inspecting volumetric data through orthogonal or free slice views. It helps reveal internal structure that may be hidden in the standard 3D rendering.

## How to use

1. Activate **Browse slices** from the toolbar.
2. Make sure the volume layer you want to inspect is selected.
3. Toggle the XY, XZ, or YZ slice planes to inspect canonical anatomical views.
4. Adjust visibility, flips, scale, and rotation to refine the slice presentation.
5. Create a free slice when you need an oblique cut through the volume.

## Notes

- Canonical planes are best for quick orientation.
- Free slices are best when the structure of interest is not aligned to the major axes.
`.trim(),
    assets: [
      {
        id: "canonical-slices",
        title: "Browsing canonical slice planes",
        description: "Show the user toggling XY, XZ, and YZ planes and moving between them to inspect the volume.",
        alt: "Browsing canonical slice planes in the viewer.",
        suggestedPath: "/tool-docs/slice/canonical-slices.gif",
      },
      {
        id: "free-slice",
        title: "Creating a free slice",
        description: "Show creating a free slice and then tilting or offsetting it to inspect a structure from a custom angle.",
        alt: "Creating and adjusting a free slice.",
        suggestedPath: "/tool-docs/slice/free-slice.gif",
      },
    ],
  },
  pipeline: {
    content: `
## What it does

The **Automation pipelines** tool gives access to viewer-connected workflows that react to events or help automate repeated tasks.

## How to use

1. Activate **Automation pipelines** from the toolbar.
2. Review the pipelines currently available in the project.
3. Open a specific pipeline to inspect or edit its behavior.
4. Enable or disable pipelines depending on the workflow you want active.
5. Use pipelines when you find yourself repeating the same multi-step viewer operation.

## Notes

- This tool is currently in **beta**.
- Pipelines are most useful once the team has a few shared workflows worth reusing.
`.trim(),
    assets: [
      {
        id: "pipeline-overview",
        title: "Opening and enabling a pipeline",
        description: "Show the user opening the pipeline tool, selecting a pipeline, and enabling it for the current session.",
        alt: "Opening and enabling an automation pipeline.",
        suggestedPath: "/tool-docs/pipeline/open-pipeline.gif",
      },
    ],
  },
  resources: {
    content: `
## What it does

The **Resource manager** tool helps monitor browser and worker activity. It is useful for understanding heavy operations, tracking recent resource usage, and debugging performance-sensitive workflows.

## How to use

1. Activate **Resource manager** from the toolbar.
2. Review the current resource summary to understand what parts of the app are active.
3. Inspect recent samples or spikes when performance feels slow.
4. Use this tool while testing large datasets, expensive rendering operations, or automation tasks.

## Notes

- This tool is especially helpful for developers and power users.
- It can also help explain why a complex scene feels heavier than expected.
`.trim(),
    assets: [
      {
        id: "resource-overview",
        title: "Reviewing resource usage",
        description: "Show the resource panel updating while a heavy scene loads or while an animation or automation task is running.",
        alt: "Reviewing resource usage in the resource manager.",
        suggestedPath: "/tool-docs/resources/resource-overview.gif",
      },
    ],
  },
  assistant: {
    content: `
## What it does

The **Assistant** tool opens the built-in assistant workspace so users can ask questions, launch assistant-guided tasks, and keep a working conversation next to the viewer.

## How to use

1. Activate **Assistant** from the toolbar.
2. Open the assistant workspace or send a quick prompt.
3. Ask for help understanding data, navigating the app, or preparing a workflow.
4. Keep the conversation open as a floating workspace window when you want to reference it while working.

## Notes

- This tool is currently in **beta**.
- The assistant is most useful when paired with active selection, annotations, and capture workflows.
`.trim(),
    assets: [
      {
        id: "assistant-quick-prompt",
        title: "Launching a quick assistant task",
        description: "Show the assistant opening from the toolbar and sending a short prompt tied to the current viewer context.",
        alt: "Opening the assistant and sending a quick prompt.",
        suggestedPath: "/tool-docs/assistant/quick-prompt.gif",
      },
      {
        id: "assistant-window",
        title: "Using the assistant as a workspace window",
        description: "Show the assistant conversation staying open as a floating window while the user continues working in the scene.",
        alt: "Using the assistant as a floating workspace window.",
        suggestedPath: "/tool-docs/assistant/floating-window.gif",
      },
    ],
  },
};

export function getToolbarToolDocumentation(toolId: ToolbarToolId): ToolDocumentationEntry {
  return TOOL_DOCUMENTATION[toolId];
}
