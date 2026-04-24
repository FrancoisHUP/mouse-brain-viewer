import type { ViewerStateV1 } from "./viewerState";

export const VIEWER_STATE_STORAGE_KEY = "allen-viewer-state-v1";

export type PersistedViewerSession = {
  version: 2;
  state: ViewerStateV1;
  activeSavedViewerId: string | null;
};

function isViewerState(value: unknown): value is ViewerStateV1 {
  return !!value && typeof value === "object" && "scene" in (value as Record<string, unknown>) && "camera" in (value as Record<string, unknown>);
}

export function loadPersistedViewerSession(): PersistedViewerSession | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.localStorage.getItem(VIEWER_STATE_STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as
      | PersistedViewerSession
      | ViewerStateV1
      | { version?: number; state?: ViewerStateV1; activeSavedViewerId?: unknown };

    if (
      parsed &&
      typeof parsed === "object" &&
      parsed.version === 2 &&
      isViewerState((parsed as PersistedViewerSession).state)
    ) {
      const activeSavedViewerId = (parsed as PersistedViewerSession).activeSavedViewerId;
      return {
        version: 2,
        state: (parsed as PersistedViewerSession).state,
        activeSavedViewerId: typeof activeSavedViewerId === "string" ? activeSavedViewerId : null,
      };
    }

    if (isViewerState(parsed)) {
      return {
        version: 2,
        state: parsed,
        activeSavedViewerId: null,
      };
    }

    return null;
  } catch (error) {
    console.warn("Failed to load persisted viewer state.", error);
    return null;
  }
}

export function savePersistedViewerSession(session: PersistedViewerSession) {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(VIEWER_STATE_STORAGE_KEY, JSON.stringify(session));
  } catch (error) {
    console.warn("Failed to persist viewer state.", error);
  }
}

export function clearPersistedViewerState() {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.removeItem(VIEWER_STATE_STORAGE_KEY);
  } catch (error) {
    console.warn("Failed to clear persisted viewer state.", error);
  }
}
