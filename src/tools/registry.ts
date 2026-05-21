import { TOOL_EXTENSIONS, UTILITY_TOOL_EXTENSIONS } from "../extensions";
import { CORE_TOOL_MANIFESTS } from "./coreTools";
import type { ToolExtensionDefinition, UtilityToolExtensionDefinition } from "./extensionApi";
import type { ToolId, ToolbarToolId, ToolbarToolManifest } from "./types";

export const TOOL_EXTENSION_DEFINITIONS: ToolExtensionDefinition[] = TOOL_EXTENSIONS;
export const TOOL_EXTENSION_DEFINITIONS_BY_ID: Partial<Record<ToolbarToolId, ToolExtensionDefinition>> =
  TOOL_EXTENSION_DEFINITIONS.reduce((accumulator, definition) => {
    accumulator[definition.manifest.id] = definition;
    return accumulator;
  }, {} as Partial<Record<ToolbarToolId, ToolExtensionDefinition>>);

export const UTILITY_TOOL_EXTENSION_DEFINITIONS: UtilityToolExtensionDefinition[] =
  UTILITY_TOOL_EXTENSIONS;
export const UTILITY_TOOL_EXTENSION_DEFINITIONS_BY_ID: Partial<
  Record<ToolId, UtilityToolExtensionDefinition>
> = UTILITY_TOOL_EXTENSION_DEFINITIONS.reduce((accumulator, definition) => {
  accumulator[definition.manifest.id] = definition;
  return accumulator;
}, {} as Partial<Record<ToolId, UtilityToolExtensionDefinition>>);

export const TOOLBAR_TOOL_MANIFESTS: ToolbarToolManifest[] = [
  ...CORE_TOOL_MANIFESTS,
  ...TOOL_EXTENSION_DEFINITIONS.map((definition) => definition.manifest),
  ...UTILITY_TOOL_EXTENSION_DEFINITIONS.map((definition) => definition.manifest),
].sort((left, right) => left.toolbar.defaultOrder - right.toolbar.defaultOrder);

export const TOOLBAR_TOOL_MANIFESTS_BY_ID: Record<ToolbarToolId, ToolbarToolManifest> =
  TOOLBAR_TOOL_MANIFESTS.reduce(
    (accumulator, manifest) => {
      accumulator[manifest.id] = manifest;
      return accumulator;
    },
    {} as Record<ToolbarToolId, ToolbarToolManifest>
  );

export const DEFAULT_TOOLBAR_TOOL_IDS: ToolbarToolId[] = TOOLBAR_TOOL_MANIFESTS
  .filter((manifest) => manifest.toolbar.defaultVisible)
  .map((manifest) => manifest.id);

export const TOOLBAR_TOOL_IDS: ToolbarToolId[] = TOOLBAR_TOOL_MANIFESTS.map(
  (manifest) => manifest.id
);

export function getToolbarToolManifest(toolId: ToolbarToolId): ToolbarToolManifest {
  return TOOLBAR_TOOL_MANIFESTS_BY_ID[toolId];
}

export function getToolExtensionDefinition(toolId: ToolbarToolId): ToolExtensionDefinition | null {
  return TOOL_EXTENSION_DEFINITIONS_BY_ID[toolId] ?? null;
}

export function getUtilityToolExtensionDefinition(
  toolId: ToolId
): UtilityToolExtensionDefinition | null {
  return UTILITY_TOOL_EXTENSION_DEFINITIONS_BY_ID[toolId] ?? null;
}
