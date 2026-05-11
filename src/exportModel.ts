import type { LoadedMesh } from "./allenMesh";
import type { CustomExternalSource, CustomExternalSourceScale } from "./customSourceStore";
import type { LocalImportCandidate } from "./localDataHandlers";
import type { StoredLocalDatasetRecord } from "./localDataStore";
import type {
  LocalDataFormat,
  LocalDataKind,
  LocalDatasetInfo,
  LocalDatasetScale,
  RemoteContentKind,
  RemoteDataFormat,
  RemoteOmeResolution,
} from "./layerTypes";
import type { LoadedVolume, VolumeContentKind } from "./omeZarr";

export type ExportTargetFormat =
  | "original"
  | "zip"
  | "nrrd"
  | "nii"
  | "tiff"
  | "ome-zarr"
  | "zarr"
  | "obj";

export type ExportOrigin = "local" | "external";

export type ExportDataKind = "volume" | "mesh" | "annotation" | "unknown";

export type ExportTargetSupportState = "available" | "planned" | "unsupported";

export type ExportVoxelSizeUm = {
  z: number | null;
  y: number | null;
  x: number | null;
};

export type ExportDimensions = {
  z: number;
  y: number;
  x: number;
};

export type ExportScaleDescriptor = {
  datasetIndex: number;
  datasetPath: string;
  resolutionUm: number | null;
  resolutionLabel: string;
  voxelSizeUm: ExportVoxelSizeUm;
  dims: ExportDimensions;
  rawShape: number[];
  estimatedBytes: number;
  estimatedMemoryBytes: number;
  canLoad: boolean;
  unsupportedReason?: string | null;
};

export type ExportSourceReference =
  | {
      kind: "local-record";
      datasetId: string;
      storageKind: StoredLocalDatasetRecord["kind"];
    }
  | {
      kind: "external-url";
      url: string;
    }
  | {
      kind: "loaded-volume";
      url: string;
      datasetPath: string;
      datasetIndex: number;
    }
  | {
      kind: "loaded-mesh";
      url: string;
    };

export type ExportTargetCapability = {
  format: ExportTargetFormat;
  state: ExportTargetSupportState;
  reason?: string;
  lossy?: boolean;
};

export type ExportSourceModel = {
  id: string;
  name: string;
  origin: ExportOrigin;
  dataKind: ExportDataKind;
  sourceFormat: LocalDataFormat | RemoteDataFormat | "unknown";
  contentKind?: RemoteContentKind | VolumeContentKind;
  sizeBytes: number;
  createdAt?: string;
  updatedAt?: string;
  sourceUrl?: string;
  remoteProvider?: CustomExternalSource["provider"];
  mimeType?: string;
  dims?: ExportDimensions | null;
  rawShape?: number[] | null;
  voxelSizeUm?: ExportVoxelSizeUm | null;
  recommendedResolution?: string | null;
  scales?: ExportScaleDescriptor[] | null;
  warnings?: string[];
  reference: ExportSourceReference;
  capabilities: ExportTargetCapability[];
};

function mapLocalKind(kind: LocalDataKind): ExportDataKind {
  if (kind === "volume") return "volume";
  if (kind === "mesh") return "mesh";
  return "unknown";
}

function mapRemoteKind(format?: RemoteDataFormat, contentKind?: RemoteContentKind): ExportDataKind {
  if (format === "mesh-obj") return "mesh";
  if (contentKind === "annotation") return "annotation";
  if (format === "ome-zarr") return "volume";
  return "unknown";
}

function normalizeScaleDescriptor(scale: LocalDatasetScale | CustomExternalSourceScale): ExportScaleDescriptor {
  return {
    datasetIndex: scale.datasetIndex,
    datasetPath: scale.datasetPath,
    resolutionUm: scale.resolutionUm,
    resolutionLabel: scale.resolutionLabel,
    voxelSizeUm: {
      z: scale.voxelSizeUm.z,
      y: scale.voxelSizeUm.y,
      x: scale.voxelSizeUm.x,
    },
    dims: {
      z: scale.dims.z,
      y: scale.dims.y,
      x: scale.dims.x,
    },
    rawShape: [...scale.rawShape],
    estimatedBytes: scale.estimatedBytes,
    estimatedMemoryBytes: scale.estimatedMemoryBytes,
    canLoad: scale.canLoad,
    unsupportedReason: "unsupportedReason" in scale ? scale.unsupportedReason ?? null : null,
  };
}

function uniqueCapabilities(capabilities: ExportTargetCapability[]): ExportTargetCapability[] {
  const byFormat = new Map<ExportTargetFormat, ExportTargetCapability>();
  for (const capability of capabilities) {
    const existing = byFormat.get(capability.format);
    if (!existing) {
      byFormat.set(capability.format, capability);
      continue;
    }
    const rank = capability.state === "available" ? 3 : capability.state === "planned" ? 2 : 1;
    const existingRank = existing.state === "available" ? 3 : existing.state === "planned" ? 2 : 1;
    if (rank > existingRank) {
      byFormat.set(capability.format, capability);
    }
  }
  return [...byFormat.values()];
}

function buildCapabilities(params: {
  origin: ExportOrigin;
  dataKind: ExportDataKind;
  sourceFormat: LocalDataFormat | RemoteDataFormat | "unknown";
  storageKind?: StoredLocalDatasetRecord["kind"];
}): ExportTargetCapability[] {
  const capabilities: ExportTargetCapability[] = [];

  if (params.origin === "local") {
    capabilities.push({ format: "original", state: "available" });
    capabilities.push({
      format: "zip",
      state: "available",
      reason: params.storageKind === "tree" ? "Tree-style browser datasets are exported as ZIP archives." : undefined,
    });
  } else {
    capabilities.push({
      format: "original",
      state: "planned",
      reason: "Remote export needs fetch, streaming, and host compatibility checks first.",
    });
    capabilities.push({
      format: "zip",
      state: "planned",
      reason: "Remote archive export will need recursive fetch and packaging support.",
    });
  }

  if (params.dataKind === "volume" || params.dataKind === "annotation") {
    capabilities.push(
      {
        format: "nrrd",
        state: params.origin === "local" ? "available" : "planned",
        reason: params.origin === "local" ? "Exports the browser-hosted volume into a NRRD file." : "Remote NRRD export will be added after streamed remote fetch/export support lands.",
      },
      {
        format: "nii",
        state: params.origin === "local" ? "available" : "planned",
        reason: params.origin === "local" ? "Exports the browser-hosted volume into a NIfTI file." : "Remote NIfTI export will be added after streamed remote fetch/export support lands.",
      },
      { format: "tiff", state: "planned", reason: "TIFF export needs stack-writing and metadata mapping support." },
      {
        format: "ome-zarr",
        state: params.origin === "local" ? "available" : "planned",
        reason:
          params.origin === "local"
            ? "Exports the browser-hosted volume as a downloadable OME-Zarr archive."
            : "OME-Zarr conversion needs chunk and multiscale writing support.",
      },
      {
        format: "zarr",
        state: params.origin === "local" ? "available" : "planned",
        reason:
          params.origin === "local"
            ? "Exports the browser-hosted volume as a downloadable Zarr archive."
            : "Zarr conversion needs chunk writer support.",
      },
    );
  } else if (params.dataKind === "mesh") {
    capabilities.push({
      format: "obj",
      state: params.sourceFormat === "obj" && params.origin === "local" ? "planned" : "planned",
      reason: "Mesh writer/export plumbing will come after volume export is in place.",
    });
  }

  return uniqueCapabilities(capabilities);
}

function sourceWarnings(info?: Pick<LocalDatasetInfo, "warning"> | null, inspectionError?: string | null): string[] | undefined {
  const warnings = [info?.warning, inspectionError].filter((value): value is string => typeof value === "string" && value.trim().length > 0);
  return warnings.length ? warnings : undefined;
}

export function buildExportSourceFromLocalRecord(
  record: StoredLocalDatasetRecord,
  inspection?: Pick<LocalImportCandidate["inspection"], "format" | "kind" | "info">
): ExportSourceModel {
  const info = inspection?.info;
  const dataKind = inspection ? mapLocalKind(inspection.kind) : "unknown";
  const sourceFormat = inspection?.format ?? "unknown";

  return {
    id: record.id,
    name: record.fileName,
    origin: "local",
    dataKind,
    sourceFormat,
    sizeBytes: record.size,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    mimeType: record.mimeType,
    dims: info?.dims ?? null,
    rawShape: info?.rawShape ? [...info.rawShape] : null,
    voxelSizeUm: info?.voxelSizeUm ?? null,
    recommendedResolution: info?.recommendedResolution ?? null,
    scales: info?.availableScales?.map(normalizeScaleDescriptor) ?? null,
    warnings: sourceWarnings(info),
    reference: {
      kind: "local-record",
      datasetId: record.id,
      storageKind: record.kind,
    },
    capabilities: buildCapabilities({
      origin: "local",
      dataKind,
      sourceFormat,
      storageKind: record.kind,
    }),
  };
}

export function buildExportSourceFromLocalCandidate(candidate: LocalImportCandidate): ExportSourceModel {
  return {
    id: candidate.id,
    name: candidate.name,
    origin: "local",
    dataKind: mapLocalKind(candidate.inspection.kind),
    sourceFormat: candidate.inspection.format,
    sizeBytes: candidate.inspection.info.fileSizeBytes,
    mimeType: candidate.inspection.info.mimeType,
    dims: candidate.inspection.info.dims ?? null,
    rawShape: candidate.inspection.info.rawShape ? [...candidate.inspection.info.rawShape] : null,
    voxelSizeUm: candidate.inspection.info.voxelSizeUm ?? null,
    recommendedResolution: candidate.inspection.info.recommendedResolution ?? null,
    scales: candidate.inspection.info.availableScales?.map(normalizeScaleDescriptor) ?? null,
    warnings: sourceWarnings(candidate.inspection.info),
    reference: {
      kind: "local-record",
      datasetId: candidate.id,
      storageKind: candidate.entries.length > 1 ? "tree" : "blob",
    },
    capabilities: buildCapabilities({
      origin: "local",
      dataKind: mapLocalKind(candidate.inspection.kind),
      sourceFormat: candidate.inspection.format,
      storageKind: candidate.entries.length > 1 ? "tree" : "blob",
    }),
  };
}

export function buildExportSourceFromCustomExternalSource(source: CustomExternalSource): ExportSourceModel {
  const dataKind = mapRemoteKind(source.remoteFormat, source.remoteContentKind);
  const scales = source.availableScales?.map(normalizeScaleDescriptor) ?? null;
  const bestScale = scales?.find((scale) => scale.resolutionLabel === source.recommendedResolution) ?? scales?.[0] ?? null;

  return {
    id: source.id,
    name: source.name,
    origin: "external",
    dataKind,
    sourceFormat: source.remoteFormat ?? "unknown",
    contentKind: source.remoteContentKind,
    sizeBytes: bestScale?.estimatedBytes ?? 0,
    createdAt: source.createdAt,
    updatedAt: source.updatedAt,
    sourceUrl: source.url,
    remoteProvider: source.provider,
    dims: bestScale?.dims ?? null,
    rawShape: bestScale?.rawShape ? [...bestScale.rawShape] : null,
    voxelSizeUm: bestScale?.voxelSizeUm ?? null,
    recommendedResolution: source.recommendedResolution ?? null,
    scales,
    warnings: sourceWarnings(null, source.inspectionError ?? null),
    reference: {
      kind: "external-url",
      url: source.url,
    },
    capabilities: buildCapabilities({
      origin: "external",
      dataKind,
      sourceFormat: source.remoteFormat ?? "unknown",
    }),
  };
}

export function buildExportSourceFromLoadedVolume(
  volume: LoadedVolume,
  options?: {
    id?: string;
    name?: string;
    origin?: ExportOrigin;
    sourceFormat?: LocalDataFormat | RemoteDataFormat | "unknown";
    sourceUrl?: string;
    recommendedResolution?: RemoteOmeResolution | null;
    createdAt?: string;
    updatedAt?: string;
  }
): ExportSourceModel {
  const origin = options?.origin ?? "external";
  const sourceFormat = options?.sourceFormat ?? "ome-zarr";

  return {
    id: options?.id ?? `${origin}-loaded-volume:${volume.url}:${volume.datasetPath}`,
    name: options?.name ?? volume.datasetPath ?? "Loaded volume",
    origin,
    dataKind: volume.contentKind === "annotation" ? "annotation" : "volume",
    sourceFormat,
    contentKind: volume.contentKind,
    sizeBytes: volume.data.byteLength,
    createdAt: options?.createdAt,
    updatedAt: options?.updatedAt,
    sourceUrl: options?.sourceUrl ?? volume.url,
    dims: {
      z: volume.dims.z,
      y: volume.dims.y,
      x: volume.dims.x,
    },
    rawShape: [...volume.rawShape],
    voxelSizeUm: {
      z: volume.voxelSizeUm.z,
      y: volume.voxelSizeUm.y,
      x: volume.voxelSizeUm.x,
    },
    recommendedResolution: options?.recommendedResolution ?? null,
    scales: [
      {
        datasetIndex: volume.datasetIndex,
        datasetPath: volume.datasetPath,
        resolutionUm: volume.resolvedResolutionUm,
        resolutionLabel: volume.resolvedResolutionUm != null ? `${Math.round(volume.resolvedResolutionUm * 100) / 100}um` : volume.datasetPath,
        voxelSizeUm: {
          z: volume.voxelSizeUm.z,
          y: volume.voxelSizeUm.y,
          x: volume.voxelSizeUm.x,
        },
        dims: {
          z: volume.dims.z,
          y: volume.dims.y,
          x: volume.dims.x,
        },
        rawShape: [...volume.rawShape],
        estimatedBytes: volume.data.byteLength,
        estimatedMemoryBytes: volume.data.byteLength,
        canLoad: true,
      },
    ],
    reference: {
      kind: "loaded-volume",
      url: volume.url,
      datasetPath: volume.datasetPath,
      datasetIndex: volume.datasetIndex,
    },
    capabilities: buildCapabilities({
      origin,
      dataKind: volume.contentKind === "annotation" ? "annotation" : "volume",
      sourceFormat,
    }),
  };
}

export function buildExportSourceFromLoadedMesh(
  mesh: LoadedMesh,
  options?: {
    id?: string;
    name?: string;
    origin?: ExportOrigin;
    sourceFormat?: LocalDataFormat | RemoteDataFormat | "unknown";
    createdAt?: string;
    updatedAt?: string;
  }
): ExportSourceModel {
  const origin = options?.origin ?? "external";
  const sourceFormat = options?.sourceFormat ?? "obj";

  return {
    id: options?.id ?? `${origin}-loaded-mesh:${mesh.url}`,
    name: options?.name ?? "Loaded mesh",
    origin,
    dataKind: "mesh",
    sourceFormat,
    sizeBytes: mesh.linePositions.byteLength + mesh.trianglePositions.byteLength,
    createdAt: options?.createdAt,
    updatedAt: options?.updatedAt,
    sourceUrl: mesh.url,
    warnings: undefined,
    reference: {
      kind: "loaded-mesh",
      url: mesh.url,
    },
    capabilities: buildCapabilities({
      origin,
      dataKind: "mesh",
      sourceFormat,
    }),
  };
}

export function getAvailableExportTargets(source: ExportSourceModel): ExportTargetCapability[] {
  return source.capabilities.filter((capability) => capability.state === "available");
}

export function getPlannedExportTargets(source: ExportSourceModel): ExportTargetCapability[] {
  return source.capabilities.filter((capability) => capability.state === "planned");
}
