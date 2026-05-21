import {
  DEFAULT_TOOLBAR_TOOL_IDS,
  TOOLBAR_TOOL_MANIFESTS_BY_ID,
  TOOLBAR_TOOL_IDS,
  getToolbarToolManifest,
} from "./tools/registry";
import type { ToolbarToolId } from "./tools/types";

export type ToolbarLayout = {
  schemaVersion: 1;
  orderedToolIds: ToolbarToolId[];
  hiddenToolIds: ToolbarToolId[];
};

export const TOOLBAR_LAYOUT_STORAGE_KEY = "mouse_brain_viewer.toolbar_layout";

const DEFAULT_TOOLBAR_LAYOUT: ToolbarLayout = {
  schemaVersion: 1,
  orderedToolIds: DEFAULT_TOOLBAR_TOOL_IDS,
  hiddenToolIds: [],
};

function isToolbarToolId(value: unknown): value is ToolbarToolId {
  return typeof value === "string" && value in TOOLBAR_TOOL_MANIFESTS_BY_ID;
}

function normalizeToolbarToolIds(value: unknown): ToolbarToolId[] {
  if (!Array.isArray(value)) return [];

  const seen = new Set<ToolbarToolId>();
  const output: ToolbarToolId[] = [];

  value.forEach((entry) => {
    if (!isToolbarToolId(entry) || seen.has(entry)) return;
    seen.add(entry);
    output.push(entry);
  });

  return output;
}

export function normalizeToolbarLayout(value: unknown): ToolbarLayout {
  if (!value || typeof value !== "object") {
    return DEFAULT_TOOLBAR_LAYOUT;
  }

  const raw = value as Partial<ToolbarLayout>;
  const orderedToolIds = normalizeToolbarToolIds(raw.orderedToolIds);
  const hiddenRequested = new Set(normalizeToolbarToolIds(raw.hiddenToolIds));

  TOOLBAR_TOOL_IDS.forEach((toolId) => {
    if (!orderedToolIds.includes(toolId)) {
      orderedToolIds.push(toolId);
    }
  });

  const hiddenToolIds = orderedToolIds.filter((toolId) => {
    if (!hiddenRequested.has(toolId)) return false;
    return getToolbarToolManifest(toolId).toolbar.removable;
  });

  return {
    schemaVersion: 1,
    orderedToolIds,
    hiddenToolIds,
  };
}

export function loadToolbarLayout(): ToolbarLayout {
  if (typeof window === "undefined") return DEFAULT_TOOLBAR_LAYOUT;

  try {
    const raw = window.localStorage.getItem(TOOLBAR_LAYOUT_STORAGE_KEY);
    if (!raw) {
      saveToolbarLayout(DEFAULT_TOOLBAR_LAYOUT);
      return DEFAULT_TOOLBAR_LAYOUT;
    }

    const normalized = normalizeToolbarLayout(JSON.parse(raw));
    saveToolbarLayout(normalized);
    return normalized;
  } catch {
    saveToolbarLayout(DEFAULT_TOOLBAR_LAYOUT);
    return DEFAULT_TOOLBAR_LAYOUT;
  }
}

export function saveToolbarLayout(layout: ToolbarLayout) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(TOOLBAR_LAYOUT_STORAGE_KEY, JSON.stringify(layout));
}

export function updateToolbarLayout(
  patch: Partial<Omit<ToolbarLayout, "schemaVersion">>
): ToolbarLayout {
  const current = loadToolbarLayout();
  const next = normalizeToolbarLayout({
    ...current,
    ...patch,
  });
  saveToolbarLayout(next);
  return next;
}

export function resetToolbarLayout(): ToolbarLayout {
  saveToolbarLayout(DEFAULT_TOOLBAR_LAYOUT);
  return DEFAULT_TOOLBAR_LAYOUT;
}

export function getVisibleToolbarToolIds(layout: ToolbarLayout): ToolbarToolId[] {
  const hidden = new Set(layout.hiddenToolIds);
  return layout.orderedToolIds.filter((toolId) => !hidden.has(toolId));
}

export function getHiddenToolbarToolIds(layout: ToolbarLayout): ToolbarToolId[] {
  return [...layout.hiddenToolIds];
}

export function moveToolbarTool(
  layout: ToolbarLayout,
  draggedToolId: ToolbarToolId,
  targetToolId: ToolbarToolId
): ToolbarLayout {
  if (draggedToolId === targetToolId) return layout;

  const nextOrderedToolIds = [...layout.orderedToolIds];
  const draggedIndex = nextOrderedToolIds.indexOf(draggedToolId);
  const targetIndex = nextOrderedToolIds.indexOf(targetToolId);
  if (draggedIndex < 0 || targetIndex < 0) return layout;

  nextOrderedToolIds.splice(draggedIndex, 1);
  nextOrderedToolIds.splice(targetIndex, 0, draggedToolId);

  return normalizeToolbarLayout({
    ...layout,
    orderedToolIds: nextOrderedToolIds,
  });
}

export function hideToolbarTool(
  layout: ToolbarLayout,
  toolId: ToolbarToolId
): ToolbarLayout {
  const manifest = getToolbarToolManifest(toolId);
  if (!manifest.toolbar.removable) return layout;
  if (layout.hiddenToolIds.includes(toolId)) return layout;

  return normalizeToolbarLayout({
    ...layout,
    hiddenToolIds: [...layout.hiddenToolIds, toolId],
  });
}

export function showToolbarTool(
  layout: ToolbarLayout,
  toolId: ToolbarToolId
): ToolbarLayout {
  if (!layout.hiddenToolIds.includes(toolId)) return layout;

  return normalizeToolbarLayout({
    ...layout,
    hiddenToolIds: layout.hiddenToolIds.filter((entry) => entry !== toolId),
  });
}
