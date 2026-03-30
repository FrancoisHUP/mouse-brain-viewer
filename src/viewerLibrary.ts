import { hashViewerStateForHistory } from "./viewerHistory";
import type { ViewerStateV1 } from "./viewerState";

export const VIEWER_LIBRARY_STORAGE_KEY = "allen-viewer-library-v1";

export type SavedViewerEntry = {
  id: string;
  name: string;
  ownerKind: "owned" | "shared";
  createdAt: number;
  updatedAt: number;
  thumbnailDataUrl?: string;
  sourceShareUrl?: string;
  state: ViewerStateV1;
};

type PersistedViewerLibraryV1 = {
  version: 1;
  items: SavedViewerEntry[];
};

function createId() {
  return Math.random().toString(36).slice(2, 10);
}

export function buildDefaultSavedViewerName(prefix: string = "Viewer") {
  return `${prefix} ${new Date().toLocaleString()}`;
}

export function createSavedViewerEntry(params: {
  name: string;
  ownerKind: "owned" | "shared";
  state: ViewerStateV1;
  sourceShareUrl?: string;
  thumbnailDataUrl?: string;
}): SavedViewerEntry {
  const now = Date.now();
  return {
    id: createId(),
    name: params.name,
    ownerKind: params.ownerKind,
    createdAt: now,
    updatedAt: now,
    thumbnailDataUrl: params.thumbnailDataUrl,
    sourceShareUrl: params.sourceShareUrl,
    state: params.state,
  };
}

export function loadPersistedViewerLibrary(): SavedViewerEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(VIEWER_LIBRARY_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as PersistedViewerLibraryV1;
    if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.items)) {
      return [];
    }
    return parsed.items;
  } catch (error) {
    console.warn("Failed to load persisted viewer library.", error);
    return [];
  }
}

export function savePersistedViewerLibrary(items: SavedViewerEntry[]) {
  if (typeof window === "undefined") return;
  try {
    const payload: PersistedViewerLibraryV1 = {
      version: 1,
      items,
    };
    window.localStorage.setItem(VIEWER_LIBRARY_STORAGE_KEY, JSON.stringify(payload));
  } catch (error) {
    console.warn("Failed to persist viewer library.", error);
  }
}

export function clearPersistedViewerLibrary() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(VIEWER_LIBRARY_STORAGE_KEY);
  } catch (error) {
    console.warn("Failed to clear persisted viewer library.", error);
  }
}

export function upsertSharedViewerEntry(
  entries: SavedViewerEntry[],
  params: {
    state: ViewerStateV1;
    sourceShareUrl: string;
    name?: string;
    thumbnailDataUrl?: string;
  }
): SavedViewerEntry[] {
  const now = Date.now();
  const targetHash = hashViewerStateForHistory(params.state);
  const existingIndex = entries.findIndex((entry) =>
    entry.ownerKind === "shared" &&
    (entry.sourceShareUrl === params.sourceShareUrl || hashViewerStateForHistory(entry.state) === targetHash)
  );

  if (existingIndex >= 0) {
    const next = [...entries];
    const existing = next[existingIndex];
    next[existingIndex] = {
      ...existing,
      name: params.name ?? existing.name,
      updatedAt: now,
      sourceShareUrl: params.sourceShareUrl,
      thumbnailDataUrl: params.thumbnailDataUrl ?? existing.thumbnailDataUrl,
      state: params.state,
    };
    return next;
  }

  return [
    createSavedViewerEntry({
      ownerKind: "shared",
      name: params.name ?? buildDefaultSavedViewerName("Shared Viewer"),
      state: params.state,
      sourceShareUrl: params.sourceShareUrl,
      thumbnailDataUrl: params.thumbnailDataUrl,
    }),
    ...entries,
  ];
}
