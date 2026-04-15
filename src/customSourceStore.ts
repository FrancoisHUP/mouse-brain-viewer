import type { RemoteContentKind, RemoteDataFormat, RemoteOmeResolution } from "./layerTypes";

export type CustomExternalSourceScale = {
  datasetIndex: number;
  datasetPath: string;
  resolutionUm: number | null;
  resolutionLabel: string;
  voxelSizeUm: { z: number | null; y: number | null; x: number | null };
  rawShape: number[];
  dims: { z: number; y: number; x: number };
  estimatedBytes: number;
  estimatedMemoryBytes: number;
  canLoad: boolean;
};

export type CustomExternalSource = {
  id: string;
  name: string;
  url: string;
  icon: "custom";
  builtIn: false;
  remoteFormat?: RemoteDataFormat;
  remoteContentKind?: RemoteContentKind;
  provider?: "gcs" | "s3" | "azure" | "generic_http" | "unknown";
  availableScales?: CustomExternalSourceScale[];
  recommendedResolution?: RemoteOmeResolution;
  inspectionError?: string | null;
  createdAt: string;
  updatedAt: string;

  // Legacy fields kept for backward compatibility with older saved sources.
  remoteResolution?: RemoteOmeResolution;
};

type AnonymousUserData = {
  schemaVersion: 2;
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
    schemaVersion: 2,
    anonymousUserId: createId("anon"),
    customSources: [],
  };
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function normalizeScale(value: unknown): CustomExternalSourceScale | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const datasetIndex = Number(record.datasetIndex);
  const datasetPath = typeof record.datasetPath === "string" ? record.datasetPath : "";
  const resolutionLabel = typeof record.resolutionLabel === "string" ? record.resolutionLabel : datasetPath;
  const rawShape = Array.isArray(record.rawShape)
    ? record.rawShape.map((entry) => Number(entry)).filter((entry) => Number.isFinite(entry))
    : [];
  const dimsRecord = record.dims && typeof record.dims === "object" ? (record.dims as Record<string, unknown>) : {};
  const voxelRecord =
    record.voxelSizeUm && typeof record.voxelSizeUm === "object"
      ? (record.voxelSizeUm as Record<string, unknown>)
      : {};

  if (!Number.isFinite(datasetIndex) || !datasetPath || rawShape.length < 3) {
    return null;
  }

  return {
    datasetIndex,
    datasetPath,
    resolutionUm: isFiniteNumber(record.resolutionUm) ? record.resolutionUm : null,
    resolutionLabel,
    voxelSizeUm: {
      z: isFiniteNumber(voxelRecord.z) ? voxelRecord.z : null,
      y: isFiniteNumber(voxelRecord.y) ? voxelRecord.y : null,
      x: isFiniteNumber(voxelRecord.x) ? voxelRecord.x : null,
    },
    rawShape,
    dims: {
      z: Math.max(1, Number(dimsRecord.z) || rawShape[rawShape.length - 3] || 1),
      y: Math.max(1, Number(dimsRecord.y) || rawShape[rawShape.length - 2] || 1),
      x: Math.max(1, Number(dimsRecord.x) || rawShape[rawShape.length - 1] || 1),
    },
    estimatedBytes: Math.max(0, Number(record.estimatedBytes) || 0),
    estimatedMemoryBytes: Math.max(0, Number(record.estimatedMemoryBytes) || 0),
    canLoad: Boolean(record.canLoad),
  };
}

function migrateCustomSource(value: unknown): CustomExternalSource | null {
  if (!value || typeof value !== "object") return null;

  const source = value as Record<string, unknown>;
  const id = typeof source.id === "string" ? source.id : createId("custom");
  const rawUrl = typeof source.url === "string" ? source.url.trim() : "";
  const rawName = typeof source.name === "string" ? source.name.trim() : "";
  const createdAt = typeof source.createdAt === "string" ? source.createdAt : new Date().toISOString();
  const updatedAt = typeof source.updatedAt === "string" ? source.updatedAt : createdAt;

  if (!rawUrl || !rawName || source.icon !== "custom" || source.builtIn !== false) {
    return null;
  }

  const availableScales = Array.isArray(source.availableScales)
    ? source.availableScales.map(normalizeScale).filter((entry): entry is CustomExternalSourceScale => !!entry)
    : [];

  const legacyResolution =
    typeof source.remoteResolution === "string" && source.remoteResolution.trim()
      ? source.remoteResolution.trim()
      : undefined;

  const recommendedResolution =
    typeof source.recommendedResolution === "string" && source.recommendedResolution.trim()
      ? source.recommendedResolution.trim()
      : availableScales.find((scale) => scale.canLoad)?.resolutionLabel ?? legacyResolution;

  return {
    id,
    name: rawName,
    url: rawUrl,
    icon: "custom",
    builtIn: false,
    remoteFormat:
      typeof source.remoteFormat === "string" ? (source.remoteFormat as RemoteDataFormat) : "ome-zarr",
    remoteContentKind:
      typeof source.remoteContentKind === "string"
        ? (source.remoteContentKind as RemoteContentKind)
        : "intensity",
    provider:
      typeof source.provider === "string"
        ? (source.provider as CustomExternalSource["provider"])
        : "unknown",
    availableScales,
    recommendedResolution,
    inspectionError:
      typeof source.inspectionError === "string" ? source.inspectionError : null,
    createdAt,
    updatedAt,
    remoteResolution: legacyResolution,
  };
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
    ? record.customSources
      .map(migrateCustomSource)
      .filter((entry): entry is CustomExternalSource => !!entry)
    : [];

  return {
    schemaVersion: 2,
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
  provider?: CustomExternalSource["provider"];
  availableScales?: CustomExternalSourceScale[];
  recommendedResolution?: RemoteOmeResolution;
  inspectionError?: string | null;
}): CustomExternalSource {
  const now = new Date().toISOString();
  const data = loadAnonymousUserData();

  const newSource: CustomExternalSource = {
    id: createId("custom"),
    name: input.name.trim(),
    url: input.url.trim(),
    icon: "custom",
    builtIn: false,
    remoteFormat: input.remoteFormat ?? "ome-zarr",
    remoteContentKind: input.remoteContentKind ?? "intensity",
    provider: input.provider ?? "unknown",
    availableScales: [...(input.availableScales ?? [])],
    recommendedResolution: input.recommendedResolution,
    inspectionError: input.inspectionError ?? null,
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
  data.customSources = data.customSources.filter((source) => source.id !== sourceId);
  saveAnonymousUserData(data);
}

export function replaceCustomExternalSources(sources: CustomExternalSource[]) {
  const data = loadAnonymousUserData();
  data.customSources = sources.map((source) => ({ ...source }));
  saveAnonymousUserData(data);
}

export function clearAllCustomExternalSources() {
  const data = loadAnonymousUserData();
  data.customSources = [];
  saveAnonymousUserData(data);
}

export function clearAllAnonymousUserData() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(STORAGE_KEY);
}
