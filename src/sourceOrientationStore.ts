import {
  cloneAxisSliceViewState,
  isVolumeOrientationPresetId,
  type StoredSourceOrientationPreference,
  type StoredTransformPreset,
} from "./volumeOrientation";

const SOURCE_ORIENTATION_STORAGE_KEY =
  "mouse_brain_viewer.source_orientation_preferences";

type SourceOrientationMap = Record<string, StoredSourceOrientationPreference>;

function cloneNodeTransform(
  value: StoredTransformPreset["transform"] | undefined
): StoredTransformPreset["transform"] | undefined {
  if (!value) return undefined;
  return {
    translation: value.translation ? [...value.translation] : undefined,
    rotation: value.rotation ? [...value.rotation] : undefined,
    scale: value.scale ? [...value.scale] : undefined,
  };
}

function normalizeTransformPresets(
  value: unknown
): StoredTransformPreset[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const result: StoredTransformPreset[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const raw = item as Partial<StoredTransformPreset>;
    const id =
      typeof raw.id === "string" && raw.id.trim() ? raw.id.trim() : null;
    const name =
      typeof raw.name === "string" && raw.name.trim()
        ? raw.name.trim()
        : null;
    if (!id || !name) continue;
    result.push({
      id,
      name,
      orientationPreset: isVolumeOrientationPresetId(raw.orientationPreset)
        ? raw.orientationPreset
        : "custom",
      axisSliceViewState: cloneAxisSliceViewState(raw.axisSliceViewState),
      transform: cloneNodeTransform(raw.transform) ?? {},
    });
  }
  return result.length ? result : undefined;
}

function normalizeStoredPreference(
  value: unknown
): StoredSourceOrientationPreference | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Partial<StoredSourceOrientationPreference>;
  if (!isVolumeOrientationPresetId(raw.preset)) return null;
  return {
    preset: raw.preset,
    axisSliceViewState: cloneAxisSliceViewState(raw.axisSliceViewState),
    transformPresets: normalizeTransformPresets(raw.transformPresets),
  };
}

function loadStore(): SourceOrientationMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(SOURCE_ORIENTATION_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const next: SourceOrientationMap = {};
    for (const [key, value] of Object.entries(parsed)) {
      const normalized = normalizeStoredPreference(value);
      if (normalized) next[key] = normalized;
    }
    return next;
  } catch {
    return {};
  }
}

function saveStore(store: SourceOrientationMap) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(
    SOURCE_ORIENTATION_STORAGE_KEY,
    JSON.stringify(store)
  );
}

export function loadSourceOrientationPreference(
  key: string
): StoredSourceOrientationPreference | null {
  const store = loadStore();
  return store[key] ?? null;
}

export function saveSourceOrientationPreference(
  key: string,
  preference: StoredSourceOrientationPreference
) {
  if (!key) return;
  const store = loadStore();
  store[key] = {
    preset: preference.preset,
    axisSliceViewState: cloneAxisSliceViewState(preference.axisSliceViewState),
    transformPresets: normalizeTransformPresets(preference.transformPresets),
  };
  saveStore(store);
}
