import { hashViewerStateForHistory } from "./viewerHistory";
import type { ViewerStateV1 } from "./viewerState";

export const VIEWER_LIBRARY_STORAGE_KEY = "allen-viewer-library-v1";
export const SAVED_VIEWER_REVISION_LIMIT = 5;

export type SavedViewerRevision = {
  id: string;
  savedAt: number;
  thumbnailDataUrl?: string;
  state: ViewerStateV1;
};

export type SavedViewerEntry = {
  id: string;
  name: string;
  ownerKind: "owned" | "shared";
  createdAt: number;
  updatedAt: number;
  thumbnailDataUrl?: string;
  sourceShareUrl?: string;
  state: ViewerStateV1;
  revisions: SavedViewerRevision[];
};

type PersistedViewerLibraryV1 = {
  version: 1;
  items: Array<Omit<SavedViewerEntry, "revisions">>;
};

type PersistedViewerLibraryV2 = {
  version: 2;
  items: SavedViewerEntry[];
};

function createId() {
  return Math.random().toString(36).slice(2, 10);
}

function normalizeRevision(value: unknown): SavedViewerRevision | null {
  if (!value || typeof value !== "object") return null;
  const revision = value as Partial<SavedViewerRevision>;
  if (!revision.state || typeof revision.savedAt !== "number") return null;
  return {
    id: typeof revision.id === "string" && revision.id.trim() ? revision.id : createId(),
    savedAt: revision.savedAt,
    thumbnailDataUrl: revision.thumbnailDataUrl,
    state: revision.state,
  };
}

function normalizeEntry(value: unknown): SavedViewerEntry | null {
  if (!value || typeof value !== "object") return null;
  const entry = value as Partial<SavedViewerEntry> & { revisions?: unknown[] };
  if (
    typeof entry.id !== "string" ||
    typeof entry.name !== "string" ||
    (entry.ownerKind !== "owned" && entry.ownerKind !== "shared") ||
    typeof entry.createdAt !== "number" ||
    typeof entry.updatedAt !== "number" ||
    !entry.state
  ) {
    return null;
  }

  return {
    id: entry.id,
    name: entry.name,
    ownerKind: entry.ownerKind,
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
    thumbnailDataUrl: entry.thumbnailDataUrl,
    sourceShareUrl: entry.sourceShareUrl,
    state: entry.state,
    revisions: Array.isArray(entry.revisions)
      ? entry.revisions
          .map((revision) => normalizeRevision(revision))
          .filter((revision): revision is SavedViewerRevision => !!revision)
          .slice(0, SAVED_VIEWER_REVISION_LIMIT)
      : [],
  };
}

function createRevision(state: ViewerStateV1, savedAt: number, thumbnailDataUrl?: string): SavedViewerRevision {
  return {
    id: createId(),
    savedAt,
    thumbnailDataUrl,
    state,
  };
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
    revisions: [],
  };
}

export function overwriteSavedViewerEntry(
  entry: SavedViewerEntry,
  params: {
    state: ViewerStateV1;
    name?: string;
    thumbnailDataUrl?: string;
    sourceShareUrl?: string;
  }
): SavedViewerEntry {
  const now = Date.now();
  const hasMeaningfulStateChange =
    hashViewerStateForHistory(entry.state) !== hashViewerStateForHistory(params.state);

  const revisions = hasMeaningfulStateChange
    ? [
        createRevision(entry.state, entry.updatedAt, entry.thumbnailDataUrl),
        ...entry.revisions,
      ].slice(0, SAVED_VIEWER_REVISION_LIMIT)
    : entry.revisions;

  return {
    ...entry,
    name: params.name ?? entry.name,
    updatedAt: now,
    thumbnailDataUrl: params.thumbnailDataUrl ?? entry.thumbnailDataUrl,
    sourceShareUrl: params.sourceShareUrl ?? entry.sourceShareUrl,
    state: params.state,
    revisions,
  };
}

export function loadPersistedViewerLibrary(): SavedViewerEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(VIEWER_LIBRARY_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as PersistedViewerLibraryV1 | PersistedViewerLibraryV2;
    if (!parsed || !Array.isArray(parsed.items)) {
      return [];
    }

    if (parsed.version === 2) {
      return parsed.items
        .map((item) => normalizeEntry(item))
        .filter((item): item is SavedViewerEntry => !!item);
    }

    if (parsed.version === 1) {
      return parsed.items
        .map((item) => normalizeEntry({ ...item, revisions: [] }))
        .filter((item): item is SavedViewerEntry => !!item);
    }

    return [];
  } catch (error) {
    console.warn("Failed to load persisted viewer library.", error);
    return [];
  }
}

export function savePersistedViewerLibrary(items: SavedViewerEntry[]) {
  if (typeof window === "undefined") return;
  try {
    const payload: PersistedViewerLibraryV2 = {
      version: 2,
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
