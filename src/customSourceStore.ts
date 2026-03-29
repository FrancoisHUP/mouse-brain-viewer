import type {
  RemoteContentKind,
  RemoteDataFormat,
  RemoteOmeResolution,
  RemoteRenderMode,
} from "./layerTypes";

export type CustomExternalSource = {
  id: string;
  name: string;
  url: string;
  icon: "custom";
  builtIn: false;
  remoteFormat?: RemoteDataFormat;
  remoteContentKind?: RemoteContentKind;
  renderMode?: RemoteRenderMode;
  remoteResolution?: RemoteOmeResolution;
  createdAt: string;
  updatedAt: string;
};

type AnonymousUserData = {
  schemaVersion: 1;
  anonymousUserId: string;
  customSources: CustomExternalSource[];
};

const STORAGE_KEY = "mouse_brain_viewer.anonymous_user_data";

function createId(prefix: string) {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${prefix}-${crypto.randomUUID()}`;
  }

  return `${prefix}-${Math.random().toString(36).slice(2, 10)}-${Date.now().toString(36)}`;
}

function createEmptyAnonymousUserData(): AnonymousUserData {
  return {
    schemaVersion: 1,
    anonymousUserId: createId("anon"),
    customSources: [],
  };
}

function isValidCustomSource(value: unknown): value is CustomExternalSource {
  if (!value || typeof value !== "object") return false;

  const source = value as Record<string, unknown>;
  return (
    typeof source.id === "string" &&
    typeof source.name === "string" &&
    typeof source.url === "string" &&
    source.icon === "custom" &&
    source.builtIn === false &&
    typeof source.createdAt === "string" &&
    typeof source.updatedAt === "string"
  );
}

function normalizeStoredData(value: unknown): AnonymousUserData {
  if (!value || typeof value !== "object") {
    return createEmptyAnonymousUserData();
  }

  const record = value as Record<string, unknown>;
  const anonymousUserId =
    typeof record.anonymousUserId === "string" && record.anonymousUserId.trim()
      ? record.anonymousUserId
      : createId("anon");

  const customSources = Array.isArray(record.customSources)
    ? record.customSources.filter(isValidCustomSource)
    : [];

  return {
    schemaVersion: 1,
    anonymousUserId,
    customSources,
  };
}

export function loadAnonymousUserData(): AnonymousUserData {
  if (typeof window === "undefined") {
    return createEmptyAnonymousUserData();
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      const empty = createEmptyAnonymousUserData();
      saveAnonymousUserData(empty);
      return empty;
    }

    const parsed = JSON.parse(raw);
    const normalized = normalizeStoredData(parsed);
    saveAnonymousUserData(normalized);
    return normalized;
  } catch {
    const empty = createEmptyAnonymousUserData();
    saveAnonymousUserData(empty);
    return empty;
  }
}

export function saveAnonymousUserData(data: AnonymousUserData) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

export function getAnonymousUserId() {
  return loadAnonymousUserData().anonymousUserId;
}

export function getCustomExternalSources(): CustomExternalSource[] {
  return loadAnonymousUserData().customSources;
}

export function addCustomExternalSource(input: {
  name: string;
  url: string;
  remoteFormat?: RemoteDataFormat;
  remoteContentKind?: RemoteContentKind;
  renderMode?: RemoteRenderMode;
  remoteResolution?: RemoteOmeResolution;
}): CustomExternalSource {
  const now = new Date().toISOString();
  const data = loadAnonymousUserData();

  const newSource: CustomExternalSource = {
    id: createId("custom"),
    name: input.name.trim(),
    url: input.url.trim(),
    icon: "custom",
    builtIn: false,
    remoteFormat: input.remoteFormat,
    remoteContentKind: input.remoteContentKind ?? "intensity",
    renderMode: input.renderMode ?? "auto",
    remoteResolution: input.remoteResolution,
    createdAt: now,
    updatedAt: now,
  };

  data.customSources = [...data.customSources, newSource];
  saveAnonymousUserData(data);

  return newSource;
}

export function renameCustomExternalSource(sourceId: string, nextName: string) {
  const trimmed = nextName.trim();
  if (!trimmed) return null;

  const data = loadAnonymousUserData();
  let updatedSource: CustomExternalSource | null = null;

  data.customSources = data.customSources.map((source) => {
    if (source.id !== sourceId) return source;

    updatedSource = {
      ...source,
      name: trimmed,
      updatedAt: new Date().toISOString(),
    };
    return updatedSource;
  });

  saveAnonymousUserData(data);
  return updatedSource;
}

export function deleteCustomExternalSource(sourceId: string) {
  const data = loadAnonymousUserData();
  const nextSources = data.customSources.filter((source) => source.id !== sourceId);
  data.customSources = nextSources;
  saveAnonymousUserData(data);
}

export function replaceCustomExternalSources(sources: CustomExternalSource[]) {
  const data = loadAnonymousUserData();
  data.customSources = sources;
  saveAnonymousUserData(data);
}