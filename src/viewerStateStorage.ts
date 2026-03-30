import type { ViewerStateV1 } from "./viewerState";

export const VIEWER_STATE_STORAGE_KEY = "allen-viewer-state-v1";

export function loadPersistedViewerState(): ViewerStateV1 | null {
    if (typeof window === "undefined") return null;

    try {
        const raw = window.localStorage.getItem(VIEWER_STATE_STORAGE_KEY);
        if (!raw) return null;
        return JSON.parse(raw) as ViewerStateV1;
    } catch (error) {
        console.warn("Failed to load persisted viewer state.", error);
        return null;
    }
}

export function savePersistedViewerState(state: ViewerStateV1) {
    if (typeof window === "undefined") return;

    try {
        window.localStorage.setItem(VIEWER_STATE_STORAGE_KEY, JSON.stringify(state));
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
