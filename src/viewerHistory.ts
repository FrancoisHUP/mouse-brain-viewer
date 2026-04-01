import type { ViewerStateV1 } from "./viewerState";
import { loadAppPreferences } from "./appPreferencesStore";

export const VIEWER_HISTORY_STORAGE_KEY = "allen-viewer-history-v2";

export type ViewerHistoryEntry = {
  state: ViewerStateV1;
  committedAt: number;
};

export type PersistedViewerHistoryV2 = {
  version: 2;
  past: ViewerHistoryEntry[];
  present: ViewerHistoryEntry;
  future: ViewerHistoryEntry[];
};

type LegacyPersistedViewerHistoryV1 = {
  version: 1;
  past: ViewerStateV1[];
  present: ViewerStateV1;
  future: ViewerStateV1[];
};

function isBrowserFile(value: unknown): value is File {
  return typeof File !== "undefined" && value instanceof File;
}

function sanitizeForHistory(value: unknown): unknown {
  if (isBrowserFile(value)) {
    return {
      __file: true,
      name: value.name,
      size: value.size,
      type: value.type,
      lastModified: value.lastModified,
    };
  }

  if (Array.isArray(value)) {
    return value.map(sanitizeForHistory);
  }

  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).map(
      ([key, nested]) => [key, sanitizeForHistory(nested)]
    );
    return Object.fromEntries(entries);
  }

  return value;
}

function stripCameraPoseFromHistoryState(state: ViewerStateV1): ViewerStateV1 {
  return {
    ...state,
    camera: {
      ...state.camera,
      position: [0, 0, 5],
      yaw: -90,
      pitch: 0,
      fovDeg: 60,
    },
  };
}

export function hashViewerStateForHistory(state: ViewerStateV1): string {
  return JSON.stringify(sanitizeForHistory(stripCameraPoseFromHistoryState(state)));
}

export function createViewerHistoryEntry(
  state: ViewerStateV1,
  committedAt: number = Date.now()
): ViewerHistoryEntry {
  return { state, committedAt };
}

export function getViewerHistoryLimit(): number {
  return loadAppPreferences().historyLimit;
}

export function clampHistoryStack(states: ViewerHistoryEntry[]): ViewerHistoryEntry[] {
  const limit = getViewerHistoryLimit();
  if (states.length <= limit) return states;
  return states.slice(states.length - limit);
}

function isViewerHistoryEntry(value: unknown): value is ViewerHistoryEntry {
  return (
    !!value &&
    typeof value === "object" &&
    "state" in (value as Record<string, unknown>) &&
    "committedAt" in (value as Record<string, unknown>)
  );
}

export function loadPersistedViewerHistory(): PersistedViewerHistoryV2 | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.localStorage.getItem(VIEWER_HISTORY_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as PersistedViewerHistoryV2;
      if (
        parsed &&
        parsed.version === 2 &&
        Array.isArray(parsed.past) &&
        isViewerHistoryEntry(parsed.present) &&
        Array.isArray(parsed.future)
      ) {
        return {
          ...parsed,
          past: clampHistoryStack(parsed.past),
        };
      }
    }

    const legacyRaw = window.localStorage.getItem("allen-viewer-history-v1");
    if (!legacyRaw) return null;

    const legacy = JSON.parse(legacyRaw) as LegacyPersistedViewerHistoryV1;
    if (!legacy || legacy.version !== 1) return null;
    if (!Array.isArray(legacy.past) || !legacy.present || !Array.isArray(legacy.future)) {
      return null;
    }

    const baseTime = Date.now();
    const past = legacy.past.map((state, index) =>
      createViewerHistoryEntry(state, baseTime - (legacy.past.length - index) * 1000)
    );
    const present = createViewerHistoryEntry(legacy.present, baseTime);
    const future = legacy.future.map((state, index) =>
      createViewerHistoryEntry(state, baseTime + (index + 1) * 1000)
    );

    return {
      version: 2,
      past: clampHistoryStack(past),
      present,
      future,
    };
  } catch (error) {
    console.warn("Failed to load persisted viewer history.", error);
    return null;
  }
}

export function savePersistedViewerHistory(history: PersistedViewerHistoryV2) {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(
      VIEWER_HISTORY_STORAGE_KEY,
      JSON.stringify({
        ...history,
        past: clampHistoryStack(history.past),
      })
    );
  } catch (error) {
    console.warn("Failed to persist viewer history.", error);
  }
}

export function clearPersistedViewerHistory() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(VIEWER_HISTORY_STORAGE_KEY);
    window.localStorage.removeItem("allen-viewer-history-v1");
  } catch (error) {
    console.warn("Failed to clear persisted viewer history.", error);
  }
}
