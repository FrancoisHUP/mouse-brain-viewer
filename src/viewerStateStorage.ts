import { parseViewerState, type SerializableCameraState, type ViewerStateV1 } from "./viewerState";

export const VIEWER_STATE_STORAGE_KEY = "allen-viewer-state-v1";

export type CaptureSceneTransitionEasing = "linear" | "ease-in-out" | "ease-in" | "ease-out";

export type PersistedCaptureScene = {
  id: string;
  name: string;
  camera: SerializableCameraState;
  selectedLayerIds: string[];
  viewerState?: ViewerStateV1 | null;
  capturedImageDataUrl?: string;
  timestampMs?: number;
  thumbnailDataUrl?: string;
  transitionMs?: number;
  transitionEasing?: CaptureSceneTransitionEasing;
  createdAt: number;
  updatedAt: number;
};

export type PersistedCaptureSequence = {
  id: string;
  name: string;
  scenes: PersistedCaptureScene[];
  cursorMs?: number;
  zoom?: number;
  createdAt: number;
  updatedAt: number;
};

export type PersistedViewerSession = {
  version: 8;
  state: ViewerStateV1;
  activeSavedViewerId: string | null;
  captureStills: PersistedCaptureScene[];
  activeCaptureStillId?: string | null;
  captureScenes: PersistedCaptureScene[];
  activeCaptureSceneId: string | null;
  captureTimelineCursorMs?: number;
  captureTimelineZoom?: number;
  captureSequences?: PersistedCaptureSequence[];
  activeCaptureSequenceId?: string | null;
  isCapturePanelOpen?: boolean;
};

function isViewerState(value: unknown): value is ViewerStateV1 {
  return !!value && typeof value === "object" && "scene" in (value as Record<string, unknown>) && "camera" in (value as Record<string, unknown>);
}

function normalizeViewerState(value: unknown): ViewerStateV1 | null {
  if (!isViewerState(value)) return null;
  try {
    return parseViewerState(JSON.stringify(value));
  } catch {
    return null;
  }
}

function normalizeCameraState(value: unknown): SerializableCameraState | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<SerializableCameraState>;
  if (candidate.mode !== "fly" && candidate.mode !== "orbit" && candidate.mode !== "ortho") return null;
  if (!Array.isArray(candidate.position) || candidate.position.length < 3) return null;
  const [x, y, z] = candidate.position;
  if (
    ![x, y, z, candidate.yaw, candidate.pitch, candidate.fovDeg].every(
      (item) => typeof item === "number" && Number.isFinite(item)
    )
  ) {
    return null;
  }
  const yaw = candidate.yaw as number;
  const pitch = candidate.pitch as number;
  const fovDeg = candidate.fovDeg as number;
  const orthoSize =
    typeof candidate.orthoSize === "number" && Number.isFinite(candidate.orthoSize)
      ? candidate.orthoSize
      : 2.5;
  return {
    mode: candidate.mode,
    position: [x, y, z],
    yaw,
    pitch,
    fovDeg,
    orthoSize,
  };
}

function normalizeCaptureScenes(value: unknown): PersistedCaptureScene[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry): PersistedCaptureScene | null => {
      if (!entry || typeof entry !== "object") return null;
      const candidate = entry as Partial<PersistedCaptureScene>;
      const camera = normalizeCameraState(candidate.camera);
      if (!camera) return null;
      if (typeof candidate.id !== "string" || !candidate.id.trim()) return null;
      const name = typeof candidate.name === "string" && candidate.name.trim() ? candidate.name.trim() : "Scene";
      const selectedLayerIds = Array.isArray(candidate.selectedLayerIds)
        ? candidate.selectedLayerIds.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
        : [];
      const viewerState = normalizeViewerState(candidate.viewerState);
      const timestampMs =
        typeof candidate.timestampMs === "number" && Number.isFinite(candidate.timestampMs)
          ? Math.max(0, Math.round(candidate.timestampMs))
          : null;
      const thumbnailDataUrl =
        typeof candidate.thumbnailDataUrl === "string" && candidate.thumbnailDataUrl.startsWith("data:image/")
          ? candidate.thumbnailDataUrl
          : undefined;
      const capturedImageDataUrl =
        typeof candidate.capturedImageDataUrl === "string" && candidate.capturedImageDataUrl.startsWith("data:image/")
          ? candidate.capturedImageDataUrl
          : undefined;
      const transitionMs =
        typeof candidate.transitionMs === "number" && Number.isFinite(candidate.transitionMs)
          ? Math.min(20000, Math.max(250, Math.round(candidate.transitionMs)))
          : 2200;
      const transitionEasing: CaptureSceneTransitionEasing =
        candidate.transitionEasing === "linear" ||
        candidate.transitionEasing === "ease-in" ||
        candidate.transitionEasing === "ease-out" ||
        candidate.transitionEasing === "ease-in-out"
          ? candidate.transitionEasing
          : "ease-in-out";
      const createdAt = typeof candidate.createdAt === "number" && Number.isFinite(candidate.createdAt) ? candidate.createdAt : Date.now();
      const updatedAt = typeof candidate.updatedAt === "number" && Number.isFinite(candidate.updatedAt) ? candidate.updatedAt : createdAt;
      return {
        id: candidate.id,
        name,
        camera,
        selectedLayerIds: Array.from(new Set(selectedLayerIds)),
        viewerState,
        capturedImageDataUrl,
        timestampMs: timestampMs ?? undefined,
        thumbnailDataUrl,
        transitionMs,
        transitionEasing,
        createdAt,
        updatedAt,
      };
    })
    .filter((entry): entry is PersistedCaptureScene => !!entry)
    .map((entry, index, scenes) => ({
      ...entry,
      timestampMs:
        typeof entry.timestampMs === "number"
          ? entry.timestampMs
          : index === 0
            ? 0
            : (scenes[index - 1]?.timestampMs ?? (index - 1) * 2200) + (entry.transitionMs ?? 2200),
    }));
}

function normalizeCaptureSequences(value: unknown): PersistedCaptureSequence[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry): PersistedCaptureSequence | null => {
      if (!entry || typeof entry !== "object") return null;
      const candidate = entry as Partial<PersistedCaptureSequence>;
      if (typeof candidate.id !== "string" || !candidate.id.trim()) return null;
      const name = typeof candidate.name === "string" && candidate.name.trim() ? candidate.name.trim() : "Animation";
      const scenes = normalizeCaptureScenes(candidate.scenes);
      const createdAt = typeof candidate.createdAt === "number" && Number.isFinite(candidate.createdAt) ? candidate.createdAt : Date.now();
      const updatedAt = typeof candidate.updatedAt === "number" && Number.isFinite(candidate.updatedAt) ? candidate.updatedAt : createdAt;
      const cursorMs =
        typeof candidate.cursorMs === "number" && Number.isFinite(candidate.cursorMs)
          ? Math.max(0, Math.round(candidate.cursorMs))
          : 0;
      const zoom =
        typeof candidate.zoom === "number" && Number.isFinite(candidate.zoom)
          ? Math.min(4, Math.max(0.5, candidate.zoom))
          : 1;
      return {
        id: candidate.id,
        name,
        scenes,
        cursorMs,
        zoom,
        createdAt,
        updatedAt,
      };
    })
    .filter((entry): entry is PersistedCaptureSequence => !!entry);
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
      (parsed.version === 2 || parsed.version === 3 || parsed.version === 4 || parsed.version === 5 || parsed.version === 6 || parsed.version === 7 || parsed.version === 8) &&
      normalizeViewerState((parsed as PersistedViewerSession).state)
    ) {
      const activeSavedViewerId = (parsed as PersistedViewerSession).activeSavedViewerId;
      const activeCaptureStillId = (parsed as Partial<PersistedViewerSession>).activeCaptureStillId;
      const activeCaptureSceneId = (parsed as PersistedViewerSession).activeCaptureSceneId;
      const captureTimelineCursorMs = (parsed as Partial<PersistedViewerSession>).captureTimelineCursorMs;
      const captureTimelineZoom = (parsed as Partial<PersistedViewerSession>).captureTimelineZoom;
      const activeCaptureSequenceId = (parsed as Partial<PersistedViewerSession>).activeCaptureSequenceId;
      const isCapturePanelOpen = (parsed as Partial<PersistedViewerSession>).isCapturePanelOpen;
      return {
        version: 8,
        state: normalizeViewerState((parsed as PersistedViewerSession).state)!,
        activeSavedViewerId: typeof activeSavedViewerId === "string" ? activeSavedViewerId : null,
        captureStills: normalizeCaptureScenes((parsed as Partial<PersistedViewerSession>).captureStills),
        activeCaptureStillId: typeof activeCaptureStillId === "string" ? activeCaptureStillId : null,
        captureScenes: normalizeCaptureScenes((parsed as Partial<PersistedViewerSession>).captureScenes),
        activeCaptureSceneId: typeof activeCaptureSceneId === "string" ? activeCaptureSceneId : null,
        captureTimelineCursorMs:
          typeof captureTimelineCursorMs === "number" && Number.isFinite(captureTimelineCursorMs)
            ? Math.max(0, Math.round(captureTimelineCursorMs))
            : 0,
        captureTimelineZoom:
          typeof captureTimelineZoom === "number" && Number.isFinite(captureTimelineZoom)
            ? Math.min(4, Math.max(0.5, captureTimelineZoom))
            : 1,
        captureSequences: normalizeCaptureSequences((parsed as Partial<PersistedViewerSession>).captureSequences),
        activeCaptureSequenceId: typeof activeCaptureSequenceId === "string" ? activeCaptureSequenceId : null,
        isCapturePanelOpen: typeof isCapturePanelOpen === "boolean" ? isCapturePanelOpen : false,
      };
    }

    const normalizedState = normalizeViewerState(parsed);
    if (normalizedState) {
      return {
        version: 8,
        state: normalizedState,
        activeSavedViewerId: null,
        captureStills: [],
        activeCaptureStillId: null,
        captureScenes: [],
        activeCaptureSceneId: null,
        captureTimelineCursorMs: 0,
        captureTimelineZoom: 1,
        captureSequences: [],
        activeCaptureSequenceId: null,
        isCapturePanelOpen: false,
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
