import { useEffect, useMemo, useRef, useState } from "react";
import type {
  RemoteContentKind,
  RemoteDataFormat,
  RemoteOmeResolution,
  RemoteRenderMode,
} from "./layerTypes";
import {
  addCustomExternalSource,
  deleteCustomExternalSource,
  getCustomExternalSources,
  renameCustomExternalSource,
  type CustomExternalSource,
  type CustomExternalSourceScale,
} from "./customSourceStore";
import { probeOmeZarrSource, type ProbedOmeZarrSource } from "./omeZarr";
import { createLocalImportPreview, inspectLocalInputEntries, inspectStoredLocalDatasetById, type LocalImportCandidate, type LocalImportPreview, type LocalInputEntry, type LocalInspectionProgress } from "./localDataHandlers";
import { listLocalDatasetRecords, type StoredLocalDatasetRecord } from "./localDataStore";

type ImportPanelView = "library" | "import-external" | "import-local";

type SourceIconKind =
  | "custom"
  | "brain-outline"
  | "brain-filled"
  | "brain-annotation"
  | "axes-3d";

type ExternalSourceItem = {
  id: string;
  name: string;
  url: string;
  icon: SourceIconKind;
  builtIn?: boolean;
  remoteFormat?: RemoteDataFormat;
  remoteContentKind?: RemoteContentKind;
  renderMode?: RemoteRenderMode;
  remoteResolution?: RemoteOmeResolution;
  provider?: CustomExternalSource["provider"];
  availableScales?: CustomExternalSourceScale[];
  recommendedResolution?: RemoteOmeResolution;
  inspectionError?: string | null;
};

type ExternalSourceGroup = {
  kind: "single" | "group";
  id: string;
  name: string;
  icon: SourceIconKind;
  builtIn?: boolean;
  items: ExternalSourceItem[];
};

type CustomSourceUiState = {
  renderMode: Exclude<RemoteRenderMode, "auto">;
  remoteResolution: RemoteOmeResolution;
};

type LocalSourceUiState = {
  status: "idle" | "loading" | "ready" | "error";
  renderMode: Exclude<RemoteRenderMode, "auto">;
  selectedResolution: string | null;
  inspection?: LocalImportCandidate["inspection"];
  error?: string | null;
};

type ExternalPathSuggestion = {
  kind: "root" | "parent" | "metadata" | "dataset" | "entered";
  label: string;
  url: string;
  description: string;
};

type ExternalDraftInspection = {
  status: "idle" | "inspecting" | "ready" | "error";
  normalizedUrl: string | null;
  metadataFile: string | null;
  probe: ProbedOmeZarrSource | null;
  suggestions: ExternalPathSuggestion[];
  message: string | null;
};

function DataIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <ellipse cx="12" cy="5" rx="7" ry="3" />
      <path d="M5 5v6c0 1.7 3.1 3 7 3s7-1.3 7-3V5" />
      <path d="M5 11v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-3.5-3.5" />
    </svg>
  );
}

function ManageSourcesIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M14 5h5v5" />
      <path d="M10 14 19 5" />
      <path d="M19 14v4a1 1 0 0 1-1 1h-4" />
      <path d="M5 10V6a1 1 0 0 1 1-1h4" />
      <path d="M5 19l5-5" />
    </svg>
  );
}

function BackIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M15 18l-6-6 6-6" />
    </svg>
  );
}

function AddSourceIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M10 13a5 5 0 007.07 0l2.12-2.12a5 5 0 10-7.07-7.07L10 6" />
      <path d="M14 11a5 5 0 00-7.07 0L4.81 13.12a5 5 0 107.07 7.07L14 18" />
      <path d="M19 17v6" />
      <path d="M16 20h6" />
    </svg>
  );
}

function PreviewAxisTile({
  label,
  src,
  loading,
  error,
}: {
  label: string;
  src?: string | null;
  loading?: boolean;
  error?: string | null;
}) {
  return (
    <div
      style={{
        borderRadius: 12,
        border: "1px solid rgba(255,255,255,0.10)",
        background: "rgba(255,255,255,0.04)",
        overflow: "hidden",
        minHeight: 84,
        display: "grid",
        gridTemplateRows: "1fr auto",
      }}
    >
      <div
        style={{
          minHeight: 128,
          maxHeight: 128,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "rgba(255,255,255,0.03)",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {src ? (
          <img
            src={src}
            alt={`${label} preview`}
            style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "center", display: "block" }}
          />
        ) : loading ? (
          <div
            style={{
              width: "82%",
              height: 8,
              borderRadius: 999,
              background: "rgba(255,255,255,0.08)",
              overflow: "hidden",
              position: "relative",
            }}
          >
            <div
              style={{
                position: "absolute",
                inset: 0,
                transform: "translateX(-100%)",
                background:
                  "linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(140,190,255,0.12) 20%, rgba(180,220,255,0.85) 50%, rgba(140,190,255,0.12) 80%, rgba(255,255,255,0) 100%)",
                animation: "preview-shimmer 1.35s ease-in-out infinite",
              }}
            />
          </div>
        ) : (
          <div
            data-theme-text="muted"
            style={{ fontSize: 11, opacity: error ? 0.9 : 0.6, padding: 10, textAlign: "center", lineHeight: 1.4 }}
          >
            {error ?? "Preview unavailable"}
          </div>
        )}
      </div>
      <div style={{ padding: "7px 10px", fontSize: 10, fontWeight: 700, letterSpacing: "0.04em", opacity: 0.72 }}>
        {label}
      </div>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.08em", opacity: 0.58, textTransform: "uppercase" }}>{children}</div>;
}

function DatasetStat({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        borderRadius: 10,
        border: "1px solid rgba(255,255,255,0.08)",
        background: "rgba(255,255,255,0.03)",
        padding: "8px 10px",
        minWidth: 0,
      }}
    >
      <div style={{ fontSize: 10, opacity: 0.58, textTransform: "uppercase", letterSpacing: "0.04em" }}>{label}</div>
      <div style={{ fontSize: 12, fontWeight: 700, marginTop: 4, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>{value}</div>
    </div>
  );
}

function SourceIconFrame({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        width: 34,
        height: 34,
        borderRadius: 10,
        border: "1px solid rgba(255,255,255,0.10)",
        background: "rgba(255,255,255,0.05)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
      }}
    >
      {children}
    </div>
  );
}

function BrainOutlineGlyph() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M10.2 4.55C9.48 4.18 8.68 4 7.8 4 5.71 4 4 5.71 4 7.8c0 .53.11 1.03.31 1.49A4.47 4.47 0 0 0 3 12.52c0 2.08 1.45 3.85 3.39 4.26A4.27 4.27 0 0 0 10.58 20h.17c.48 0 .96-.08 1.41-.24" />
      <path d="M13.8 4.55c.72-.37 1.52-.55 2.4-.55C18.29 4 20 5.71 20 7.8c0 .53-.11 1.03-.31 1.49A4.47 4.47 0 0 1 21 12.52c0 2.08-1.45 3.85-3.39 4.26A4.27 4.27 0 0 1 13.42 20h-.17c-.48 0-.96-.08-1.41-.24" />
      <path d="M12 6v11.1" />
      <path d="M8.55 8.55c1 .15 1.78.97 1.9 1.98" />
      <path d="M15.45 8.55c-1 .15-1.78.97-1.9 1.98" />
      <path d="M8.3 13.65c1.2.08 2.19.9 2.55 2.01" />
      <path d="M15.7 13.65c-1.2.08-2.19.9-2.55 2.01" />
    </svg>
  );
}

function BrainFilledGlyph() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="none"
    >
      <path
        d="M10.2 4.55C9.48 4.18 8.68 4 7.8 4 5.71 4 4 5.71 4 7.8c0 .53.11 1.03.31 1.49A4.47 4.47 0 0 0 3 12.52c0 2.08 1.45 3.85 3.39 4.26A4.27 4.27 0 0 0 10.58 20h.17c.48 0 .96-.08 1.41-.24L12 19.68l.24.08c.45.16.93.24 1.41.24h.17a4.27 4.27 0 0 0 4.19-3.22A4.33 4.33 0 0 0 21 12.52c0-1.34-.59-2.54-1.52-3.36.2-.46.31-.96.31-1.49C19.79 5.71 18.09 4 16 4c-.88 0-1.68.18-2.4.55L12 5.35l-1.8-.8Z"
        fill="currentColor"
      />
      <path
        d="M12 6v11.1M8.55 8.55c1 .15 1.78.97 1.9 1.98M15.45 8.55c-1 .15-1.78.97-1.9 1.98M8.3 13.65c1.2.08 2.19.9 2.55 2.01M15.7 13.65c-1.2.08-2.19.9-2.55 2.01"
        fill="none"
        stroke="rgba(12,14,18,0.72)"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function BrainAnnotationGlyph() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M10.2 4.55C9.48 4.18 8.68 4 7.8 4 5.71 4 4 5.71 4 7.8c0 .53.11 1.03.31 1.49A4.47 4.47 0 0 0 3 12.52c0 2.08 1.45 3.85 3.39 4.26A4.27 4.27 0 0 0 10.58 20h.17c.48 0 .96-.08 1.41-.24" />
      <path d="M13.8 4.55c.72-.37 1.52-.55 2.4-.55C18.29 4 20 5.71 20 7.8c0 .53-.11 1.03-.31 1.49A4.47 4.47 0 0 1 21 12.52c0 2.08-1.45 3.85-3.39 4.26A4.27 4.27 0 0 1 13.42 20h-.17c-.48 0-.96-.08-1.41-.24" />
      <path d="M12 6v11.1" />
      <path d="M8.55 8.55c1 .15 1.78.97 1.9 1.98" />
      <path d="M15.45 8.55c-1 .15-1.78.97-1.9 1.98" />
      <path d="M8.3 13.65c1.2.08 2.19.9 2.55 2.01" />
      <path d="M15.7 13.65c-1.2.08-2.19.9-2.55 2.01" />
      <rect x="13.7" y="13.2" width="7.2" height="7" rx="1.7" fill="rgba(12,14,18,0.88)" stroke="none" />
      <path d="M15.2 17.3l3.55-3.55 1.6 1.6-3.55 3.55-1.95.35z" />
      <path d="M17.95 14.55l1.6 1.6" />
    </svg>
  );
}

function Axes3DGlyph() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 4.5v15" />
      <path d="M4.75 12h14.5" />
      <path d="M6.7 17.3l10.6-10.6" />
    </svg>
  );
}

function SourceCustomIcon() {
  return (
    <div
      style={{
        width: 34,
        height: 34,
        borderRadius: 10,
        border: "1px solid rgba(255,255,255,0.10)",
        background: "rgba(120,190,255,0.12)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M12 5v14" />
        <path d="M5 12h14" />
        <path d="M19 16.5V19a1 1 0 01-1 1h-2.5" />
        <path d="M5 7.5V5a1 1 0 011-1h2.5" />
        <path d="M16.5 5H19a1 1 0 011 1v2.5" />
        <path d="M7.5 19H5a1 1 0 01-1-1v-2.5" />
      </svg>
    </div>
  );
}

function SourceIcon({ icon }: { icon: SourceIconKind }) {
  if (icon === "custom") {
    return <SourceCustomIcon />;
  }

  return (
    <SourceIconFrame>
      {icon === "brain-outline" ? <BrainOutlineGlyph /> : null}
      {icon === "brain-filled" ? <BrainFilledGlyph /> : null}
      {icon === "brain-annotation" ? <BrainAnnotationGlyph /> : null}
      {icon === "axes-3d" ? <Axes3DGlyph /> : null}
    </SourceIconFrame>
  );
}

const ALLEN_URL =
  "https://storage.googleapis.com/sbh-assistant-data/allen_average_template.ome.zarr/";

const ALLEN_BRAIN_SKELETON_URL =
  "https://storage.googleapis.com/sbh-assistant-data/allen_structure_meshes/obj/997.obj";

const ALLEN_ANNOTATION_URL =
  "https://storage.googleapis.com/sbh-assistant-data/allen_annotation.ome.zarr/";

const ALLEN_VOLUME_BOUNDS_CUBE_URL =
  "/builtins/allen_volume_bounds_cube.obj";

const BUILT_IN_EXTERNAL_SOURCES: ExternalSourceItem[] = [
  {
    id: "allen-brain-skeleton-mesh",
    name: "Allen Mouse Brain Skeleton Mesh",
    url: ALLEN_BRAIN_SKELETON_URL,
    icon: "brain-outline",
    builtIn: true,
    remoteFormat: "mesh-obj",
  },
  {
    id: "allen-volume-bounds-cube",
    name: "Allen Volume Bounds Cube",
    url: ALLEN_VOLUME_BOUNDS_CUBE_URL,
    icon: "axes-3d",
    builtIn: true,
    remoteFormat: "mesh-obj",
  },
  {
    id: "allen-average-brain-volume-25um",
    name: "Allen Average Mouse Brain (Volume · 25 µm)",
    url: ALLEN_URL,
    icon: "brain-filled",
    builtIn: true,
    renderMode: "volume",
    remoteResolution: "25um",
  },
  {
    id: "allen-average-brain-volume-50um",
    name: "Allen Average Mouse Brain (Volume · 50 µm)",
    url: ALLEN_URL,
    icon: "brain-filled",
    builtIn: true,
    renderMode: "volume",
    remoteResolution: "50um",
  },
  {
    id: "allen-average-brain-volume-100um",
    name: "Allen Average Mouse Brain (Volume · 100 µm)",
    url: ALLEN_URL,
    icon: "brain-filled",
    builtIn: true,
    renderMode: "volume",
    remoteResolution: "100um",
  },
  {
    id: "allen-annotation-volume-25um",
    name: "Allen Annotation (Overlay · 25 µm)",
    url: ALLEN_ANNOTATION_URL,
    icon: "brain-annotation",
    builtIn: true,
    remoteFormat: "ome-zarr",
    remoteContentKind: "annotation",
    renderMode: "volume",
    remoteResolution: "25um",
  },
  {
    id: "allen-annotation-volume-50um",
    name: "Allen Annotation (Overlay · 50 µm)",
    url: ALLEN_ANNOTATION_URL,
    icon: "brain-annotation",
    builtIn: true,
    remoteFormat: "ome-zarr",
    remoteContentKind: "annotation",
    renderMode: "volume",
    remoteResolution: "50um",
  },
  {
    id: "allen-annotation-volume-100um",
    name: "Allen Annotation (Overlay · 100 µm)",
    url: ALLEN_ANNOTATION_URL,
    icon: "brain-annotation",
    builtIn: true,
    remoteFormat: "ome-zarr",
    remoteContentKind: "annotation",
    renderMode: "volume",
    remoteResolution: "100um",
  },
  {
    id: "allen-average-brain-slices-25um",
    name: "Allen Average Mouse Brain (Slices · 25 µm)",
    url: ALLEN_URL,
    icon: "axes-3d",
    builtIn: true,
    renderMode: "slices",
    remoteResolution: "25um",
  },
  {
    id: "allen-average-brain-slices-50um",
    name: "Allen Average Mouse Brain (Slices · 50 µm)",
    url: ALLEN_URL,
    icon: "axes-3d",
    builtIn: true,
    renderMode: "slices",
    remoteResolution: "50um",
  },
  {
    id: "allen-average-brain-slices-100um",
    name: "Allen Average Mouse Brain (Slices · 100 µm)",
    url: ALLEN_URL,
    icon: "axes-3d",
    builtIn: true,
    renderMode: "slices",
    remoteResolution: "100um",
  },
];

function stripResolutionSuffix(name: string) {
  return name.replace(
    /\s*\(([^()]*)\s*·\s*(10|25|50|100)\s*µm\)\s*$/i,
    (_match, label: string) => ` (${label.trim()})`
  );
}

function getResolutionLabel(resolution?: RemoteOmeResolution): string {
  if (!resolution) return "";
  return resolution.replace("um", " µm");
}

function getDefaultGroupItem(items: ExternalSourceItem[]) {
  return items.find((item) => item.remoteResolution === "25um") ?? items[0];
}

function getGroupKey(item: ExternalSourceItem) {
  if (!item.remoteResolution) return null;
  if (!item.builtIn) return null;

  return JSON.stringify({
    url: item.url,
    icon: item.icon,
    builtIn: item.builtIn ?? false,
    remoteFormat: item.remoteFormat ?? null,
    remoteContentKind: item.remoteContentKind ?? null,
    renderMode: item.renderMode ?? null,
    baseName: stripResolutionSuffix(item.name),
  });
}

function inferProvider(url: string): CustomExternalSource["provider"] {
  const lower = url.trim().toLowerCase();
  if (!lower) return "unknown";
  if (lower.includes("storage.googleapis.com") || lower.includes(".storage.googleapis.com")) return "gcs";
  if (lower.includes("amazonaws.com") || lower.includes(".s3.")) return "s3";
  if (lower.includes("blob.core.windows.net")) return "azure";
  if (lower.startsWith("http://") || lower.startsWith("https://")) return "generic_http";
  return "unknown";
}

function formatProviderLabel(provider: CustomExternalSource["provider"]): string {
  if (provider === "gcs") return "Google Cloud Storage";
  if (provider === "s3") return "Amazon S3";
  if (provider === "azure") return "Azure Blob Storage";
  if (provider === "generic_http") return "a public web host";
  return "an external host";
}

function deriveSourceName(url: string): string {
  const cleaned = url.trim().replace(/\/+$/, "");
  if (!cleaned) return "Custom OME-Zarr Source";
  const parts = cleaned.split("/").filter(Boolean);
  const last = parts[parts.length - 1] ?? cleaned;
  return last || "Custom OME-Zarr Source";
}

const EXTERNAL_METADATA_FILES = ["zarr.json", ".zattrs", ".zgroup", ".zarray"] as const;

function normalizeExternalDraftUrl(rawUrl: string): { normalizedUrl: string | null; metadataFile: string | null } {
  const trimmed = rawUrl.trim();
  if (!trimmed) return { normalizedUrl: null, metadataFile: null };

  try {
    const parsed = new URL(trimmed);
    let pathname = parsed.pathname.replace(/\/+$/, "");
    let metadataFile: string | null = null;

    for (const fileName of EXTERNAL_METADATA_FILES) {
      const suffix = `/${fileName}`;
      if (pathname.toLowerCase().endsWith(suffix.toLowerCase())) {
        pathname = pathname.slice(0, -suffix.length);
        metadataFile = fileName;
        break;
      }
    }

    const rootMatch = pathname.match(/^(.*?\.zarr)(?:\/.*)?$/i);
    if (rootMatch) {
      pathname = rootMatch[1];
    }

    parsed.pathname = pathname || "/";
    parsed.search = "";
    parsed.hash = "";

    return {
      normalizedUrl: parsed.toString().replace(/\/+$/, ""),
      metadataFile,
    };
  } catch {
    return { normalizedUrl: null, metadataFile: null };
  }
}

function describeExternalScale(scale: CustomExternalSourceScale | ProbedOmeZarrSource["scales"][number]) {
  return `${getResolutionLabel(scale.resolutionLabel) || scale.resolutionLabel} · ${scale.dims.z}×${scale.dims.y}×${scale.dims.x}`;
}

function buildExternalPathSuggestions(
  rawUrl: string,
  normalizedUrl: string | null,
  probe: ProbedOmeZarrSource | null
): ExternalPathSuggestion[] {
  const suggestions: ExternalPathSuggestion[] = [];
  const seen = new Set<string>();

  function pushSuggestion(suggestion: ExternalPathSuggestion) {
    const key = suggestion.url.trim();
    if (!key || seen.has(key)) return;
    seen.add(key);
    suggestions.push(suggestion);
  }

  const trimmed = rawUrl.trim();
  if (trimmed) {
    pushSuggestion({
      kind: "entered",
      label: "Typed path",
      url: trimmed,
      description: "Keep the exact URL you entered.",
    });
  }

  if (normalizedUrl) {
    pushSuggestion({
      kind: "root",
      label: "Detected dataset root",
      url: normalizedUrl,
      description: "Use the OME-Zarr root folder for import.",
    });

    for (const fileName of EXTERNAL_METADATA_FILES) {
      pushSuggestion({
        kind: "metadata",
        label: fileName,
        url: `${normalizedUrl}/${fileName}`,
        description: "Jump to a metadata file under the detected root.",
      });
    }

    try {
      const parsed = new URL(normalizedUrl);
      const segments = parsed.pathname.split("/").filter(Boolean);
      for (let index = segments.length - 1; index > 0; index -= 1) {
        const parent = new URL(parsed.origin);
        parent.pathname = `/${segments.slice(0, index).join("/")}`;
        pushSuggestion({
          kind: "parent",
          label: `Parent ${segments[index - 1]}`,
          url: parent.toString().replace(/\/+$/, ""),
          description: "Go up one level from the detected dataset root.",
        });
      }
    } catch {}
  }

  if (normalizedUrl && probe?.scales?.length) {
    for (const scale of probe.scales) {
      pushSuggestion({
        kind: "dataset",
        label: scale.datasetPath || ".",
        url: `${normalizedUrl}/${scale.datasetPath || ""}`.replace(/\/+$/, ""),
        description: describeExternalScale(scale),
      });
    }
  }

  return suggestions.slice(0, 10);
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value >= 10 || unitIndex === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[unitIndex]}`;
}

function formatTimestamp(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Unknown";
  return date.toLocaleString();
}

function formatVoxelSizeValue(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "?";
  return (Math.round(value * 100) / 100).toFixed(2);
}

function formatLocalScaleReason(reason?: string | null): string | null {
  if (!reason) return null;
  if (/too large for browser memory budget/i.test(reason)) {
    return "This resolution is too large to load in the browser.";
  }
  if (/local zarr compression method that is not supported/i.test(reason) || /unsupported local zarr compressor/i.test(reason)) {
    return "This resolution uses a compression method that is not supported in the browser yet.";
  }
  if (/local zarr v3 dataset uses codecs/i.test(reason) || /codec decoding is not implemented/i.test(reason)) {
    return "This dataset uses local Zarr v3 codecs that are not supported in the browser yet.";
  }
  if (/unsupported zarr array order/i.test(reason)) {
    return "This resolution uses a Zarr array layout that is not supported in the browser yet.";
  }
  return reason;
}

function resolutionSortValue(value?: string | null): number {
  if (!value) return Number.MAX_SAFE_INTEGER;
  const numeric = Number.parseFloat(String(value).replace(/[^0-9.]+/g, ""));
  return Number.isFinite(numeric) ? numeric : Number.MAX_SAFE_INTEGER;
}

function toExternalSourceItem(source: CustomExternalSource): ExternalSourceItem {
  return {
    id: source.id,
    name: source.name,
    url: source.url,
    icon: "custom",
    builtIn: false,
    remoteFormat: source.remoteFormat ?? "ome-zarr",
    remoteContentKind: source.remoteContentKind ?? "intensity",
    provider: source.provider ?? "unknown",
    availableScales: [...(source.availableScales ?? [])].sort(
      (a, b) => resolutionSortValue(a.resolutionLabel) - resolutionSortValue(b.resolutionLabel)
    ),
    recommendedResolution: source.recommendedResolution,
    inspectionError: source.inspectionError ?? null,
    remoteResolution: source.remoteResolution,
  };
}

function getSelectableScales(item: ExternalSourceItem): CustomExternalSourceScale[] {
  const scales = item.availableScales ?? [];
  return scales.filter((scale) => scale.canLoad);
}

function getDefaultCustomResolution(item: ExternalSourceItem): RemoteOmeResolution {
  const selectable = getSelectableScales(item);
  if (item.recommendedResolution && selectable.some((scale) => scale.resolutionLabel === item.recommendedResolution)) {
    return item.recommendedResolution;
  }
  if (item.remoteResolution && selectable.some((scale) => scale.resolutionLabel === item.remoteResolution)) {
    return item.remoteResolution;
  }
  return selectable[0]?.resolutionLabel ?? item.recommendedResolution ?? item.remoteResolution ?? "100um";
}

function buildCustomLayerName(item: ExternalSourceItem, renderMode: Exclude<RemoteRenderMode, "auto">, resolution: string) {
  const modeLabel = renderMode === "volume" ? "Volume" : "Slices";
  return `${item.name} (${modeLabel} · ${getResolutionLabel(resolution) || resolution})`;
}

export default function ImportDataPanel({
  open,
  initialView = "library",
  onClose,
  onAddExternalSources,
  onImportLocalSources,
  onAddStoredLocalSources,
  onOpenLocalDatasetManager,
  initialLocalEntries,
  onConsumeInitialLocalEntries,
}: {
  open: boolean;
  initialView?: ImportPanelView;
  onClose: () => void;
  onAddDrawingLayer?: (name?: string) => void;
  onAddExternalSources: (
    sources: Array<{
      id: string;
      name: string;
      url: string;
      icon?: "generic" | "custom";
      remoteFormat?: RemoteDataFormat;
      remoteContentKind?: RemoteContentKind;
      renderMode?: RemoteRenderMode;
      remoteResolution?: RemoteOmeResolution;
    }>
  ) => void;
  onImportLocalSources: (
    candidates: LocalImportCandidate[]
  ) => Promise<{ importedCount: number; importedRecords: StoredLocalDatasetRecord[]; errors: string[] }> | { importedCount: number; importedRecords: StoredLocalDatasetRecord[]; errors: string[] };
  onAddStoredLocalSources: (
    entries: Array<{ datasetId: string; renderMode?: Exclude<RemoteRenderMode, "auto">; selectedResolution?: string }>
  ) => Promise<{ addedCount: number; errors: string[] }> | { addedCount: number; errors: string[] };
  onOpenLocalDatasetManager?: () => void;
  initialLocalEntries?: LocalInputEntry[] | null;
  onConsumeInitialLocalEntries?: () => void;
}) {
  const [panelView, setPanelView] = useState<ImportPanelView>(initialView);
  const [isDragging, setIsDragging] = useState(false);

  const [externalSources, setExternalSources] = useState<ExternalSourceItem[]>([]);
  const [selectedExternalIds, setSelectedExternalIds] = useState<string[]>([]);
  const [localDatasetRecords, setLocalDatasetRecords] = useState<StoredLocalDatasetRecord[]>([]);
  const [selectedLocalDatasetIds, setSelectedLocalDatasetIds] = useState<string[]>([]);
  const [customSourceUiState, setCustomSourceUiState] = useState<Record<string, CustomSourceUiState>>({});
  const [localSourceUiState, setLocalSourceUiState] = useState<Record<string, LocalSourceUiState>>({});
  const [newExternalName, setNewExternalName] = useState("");
  const [newExternalUrl, setNewExternalUrl] = useState("");
  const [externalDraftInspection, setExternalDraftInspection] = useState<ExternalDraftInspection>({
    status: "idle",
    normalizedUrl: null,
    metadataFile: null,
    probe: null,
    suggestions: [],
    message: null,
  });
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const [editingCustomSourceId, setEditingCustomSourceId] = useState<string | null>(null);
  const [editingCustomSourceName, setEditingCustomSourceName] = useState("");
  const [openCustomSourceMenuId, setOpenCustomSourceMenuId] = useState<string | null>(null);
  const [localImportFeedback, setLocalImportFeedback] = useState<{ tone: "success" | "error"; message: string } | null>(null);
  const [pendingLocalImports, setPendingLocalImports] = useState<LocalImportCandidate[]>([]);
  const [isInspectingLocalImport, setIsInspectingLocalImport] = useState(false);
  const [isSubmittingSelection, setIsSubmittingSelection] = useState(false);
  const [localInspectionProgress, setLocalInspectionProgress] = useState<LocalInspectionProgress | null>(null);
  const [localImportPreviews, setLocalImportPreviews] = useState<Record<string, { key: string; status: "loading" | "ready" | "error"; preview?: LocalImportPreview; error?: string }>>({});

  const inputRef = useRef<HTMLInputElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const addSourceNameInputRef = useRef<HTMLInputElement | null>(null);
  const localInspectionAbortRef = useRef<AbortController | null>(null);
  const externalInspectRequestRef = useRef(0);

  async function refreshLocalDatasetRecords() {
    const records = await listLocalDatasetRecords();
    setLocalDatasetRecords(records);
    setSelectedLocalDatasetIds((prev) => prev.filter((id) => records.some((record) => record.id === id)));
  }

  useEffect(() => {
    const customSources = getCustomExternalSources().map(toExternalSourceItem);
    setExternalSources([...BUILT_IN_EXTERNAL_SOURCES, ...customSources]);
  }, []);

  useEffect(() => {
    if (!open) return;
    setPanelView(initialView);
    void refreshLocalDatasetRecords();
  }, [initialView, open]);

  useEffect(() => {
    if (!open || !initialLocalEntries?.length) return;
    setPanelView("import-local");
    onConsumeInitialLocalEntries?.();
    void handleLocalDropInput(initialLocalEntries);
  }, [open, initialLocalEntries, onConsumeInitialLocalEntries]);

  useEffect(() => {
    setCustomSourceUiState((prev) => {
      let changed = false;
      const next = { ...prev };

      for (const item of externalSources) {
        if (item.builtIn || item.icon !== "custom") continue;
        const selectable = getSelectableScales(item);
        if (!selectable.length) continue;
        if (next[item.id]) continue;

        next[item.id] = {
          renderMode: "volume",
          remoteResolution: getDefaultCustomResolution(item),
        };
        changed = true;
      }

      return changed ? next : prev;
    });
  }, [externalSources]);

  useEffect(() => {
    if (!open) {
      setPanelView(initialView);
      setIsDragging(false);
      setSelectedExternalIds([]);
      setSelectedLocalDatasetIds([]);
      setLocalSourceUiState({});
      setNewExternalName("");
      setNewExternalUrl("");
      setExternalDraftInspection({
        status: "idle",
        normalizedUrl: null,
        metadataFile: null,
        probe: null,
        suggestions: [],
        message: null,
      });
      setShowSearch(false);
      setSearchQuery("");
      setEditingCustomSourceId(null);
      setEditingCustomSourceName("");
      setOpenCustomSourceMenuId(null);
      localInspectionAbortRef.current?.abort();
      localInspectionAbortRef.current = null;
      setLocalImportFeedback(null);
      setPendingLocalImports([]);
      setIsInspectingLocalImport(false);
      setIsSubmittingSelection(false);
      setLocalInspectionProgress(null);
      setLocalImportPreviews({});
    }
  }, [initialView, open]);

  useEffect(() => {
    if (showSearch) {
      const id = window.setTimeout(() => {
        searchInputRef.current?.focus();
      }, 0);
      return () => window.clearTimeout(id);
    }
  }, [showSearch]);

  useEffect(() => {
    if (panelView === "import-external") {
      const id = window.setTimeout(() => {
        addSourceNameInputRef.current?.focus();
      }, 180);
      return () => window.clearTimeout(id);
    }
  }, [panelView]);

  useEffect(() => {
    if (!open || panelView !== "import-external") return;

    const trimmedUrl = newExternalUrl.trim();
    const normalized = normalizeExternalDraftUrl(trimmedUrl);

    if (!trimmedUrl) {
      setExternalDraftInspection({
        status: "idle",
        normalizedUrl: null,
        metadataFile: null,
        probe: null,
        suggestions: [],
        message: null,
      });
      return;
    }

    if (!normalized.normalizedUrl) {
      setExternalDraftInspection({
        status: "error",
        normalizedUrl: null,
        metadataFile: null,
        probe: null,
        suggestions: [],
        message: "Enter a valid public URL to inspect this source.",
      });
      return;
    }

    const requestId = ++externalInspectRequestRef.current;
    setExternalDraftInspection({
      status: "inspecting",
      normalizedUrl: normalized.normalizedUrl,
      metadataFile: normalized.metadataFile,
      probe: null,
      suggestions: buildExternalPathSuggestions(trimmedUrl, normalized.normalizedUrl, null),
      message: normalized.metadataFile
        ? `Detected ${normalized.metadataFile}; checking the dataset root automatically.`
        : "Checking this path for OME-Zarr metadata.",
    });

    const timeoutId = window.setTimeout(() => {
      void (async () => {
        try {
          const probe = await probeOmeZarrSource(normalized.normalizedUrl!, "intensity");
          if (externalInspectRequestRef.current !== requestId) return;
          setExternalDraftInspection({
            status: "ready",
            normalizedUrl: probe.url,
            metadataFile: normalized.metadataFile,
            probe,
            suggestions: buildExternalPathSuggestions(trimmedUrl, probe.url, probe),
            message: "This path can be saved as a reusable external source.",
          });
        } catch (error) {
          if (externalInspectRequestRef.current !== requestId) return;
          const message = error instanceof Error ? error.message : "Failed to inspect the external source.";
          setExternalDraftInspection({
            status: "error",
            normalizedUrl: normalized.normalizedUrl,
            metadataFile: normalized.metadataFile,
            probe: null,
            suggestions: buildExternalPathSuggestions(trimmedUrl, normalized.normalizedUrl, null),
            message,
          });
        }
      })();
    }, 420);

    return () => window.clearTimeout(timeoutId);
  }, [newExternalUrl, open, panelView]);

  useEffect(() => {
    if (!openCustomSourceMenuId) return;

    function handlePointerDown() {
      setOpenCustomSourceMenuId(null);
      setLocalImportFeedback(null);
      setPendingLocalImports([]);
      setIsInspectingLocalImport(false);
    }

    window.addEventListener("pointerdown", handlePointerDown);
    return () => window.removeEventListener("pointerdown", handlePointerDown);
  }, [openCustomSourceMenuId]);


  function isAbortError(error: unknown) {
    return error instanceof Error && (error.name === "AbortError" || error.message === "Local import cancelled.");
  }

  function cancelLocalInspection() {
    localInspectionAbortRef.current?.abort();
    localInspectionAbortRef.current = null;
    setIsInspectingLocalImport(false);
    setLocalInspectionProgress(null);
    setLocalImportFeedback({ tone: "error", message: "Local import cancelled." });
  }

  function handleRequestClose() {
    if (isInspectingLocalImport) {
      cancelLocalInspection();
    }
    onClose();
  }


  const groupedExternalSources = useMemo<ExternalSourceGroup[]>(() => {
    const groups = new Map<string, ExternalSourceItem[]>();
    const singles: ExternalSourceGroup[] = [];

    for (const item of externalSources) {
      const key = getGroupKey(item);

      if (!key) {
        singles.push({
          kind: "single",
          id: item.id,
          name: item.name,
          icon: item.icon,
          builtIn: item.builtIn,
          items: [item],
        });
        continue;
      }

      const existing = groups.get(key);
      if (existing) {
        existing.push(item);
      } else {
        groups.set(key, [item]);
      }
    }

    const grouped: ExternalSourceGroup[] = Array.from(groups.values()).map((items) => {
      const sortedItems = [...items].sort((a, b) => {
        return resolutionSortValue(a.remoteResolution) - resolutionSortValue(b.remoteResolution);
      });

      const defaultItem = getDefaultGroupItem(sortedItems);

      return {
        kind: "group",
        id: `group-${defaultItem.id}`,
        name: stripResolutionSuffix(defaultItem.name),
        icon: defaultItem.icon,
        builtIn: defaultItem.builtIn,
        items: sortedItems,
      };
    });

    return [...singles, ...grouped];
  }, [externalSources]);

  const filteredGroupedExternalSources = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return groupedExternalSources;

    return groupedExternalSources.filter((group) => {
      const groupNameMatches = group.name.toLowerCase().includes(query);
      const itemNameMatches = group.items.some((item) => item.name.toLowerCase().includes(query));
      const resolutionMatches = group.items.some((item) =>
        [
          getResolutionLabel(item.remoteResolution),
          ...(item.availableScales ?? []).map((scale) => getResolutionLabel(scale.resolutionLabel) || scale.resolutionLabel),
        ]
          .join(" ")
          .toLowerCase()
          .includes(query)
      );
      return groupNameMatches || itemNameMatches || resolutionMatches;
    });
  }, [groupedExternalSources, searchQuery]);

  const filteredLocalDatasetRecords = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return localDatasetRecords;
    return localDatasetRecords.filter((record) => {
      const haystack = [
        record.fileName,
        record.kind === "tree" ? "folder dataset" : "single file",
        record.mimeType ?? "",
      ].join(" ").toLowerCase();
      return haystack.includes(query);
    });
  }, [localDatasetRecords, searchQuery]);

  const selectedExternalSources = useMemo(
    () => externalSources.filter((item) => selectedExternalIds.includes(item.id)),
    [externalSources, selectedExternalIds]
  );

  useEffect(() => {
    if (panelView !== "library") return;
    for (const datasetId of localDatasetRecords.map((record) => record.id)) {
      const existing = localSourceUiState[datasetId];
      if (existing?.status === "loading" || existing?.status === "ready") continue;
      setLocalSourceUiState((prev) => ({
        ...prev,
        [datasetId]: {
          status: "loading",
          renderMode: prev[datasetId]?.renderMode ?? "slices",
          selectedResolution: prev[datasetId]?.selectedResolution ?? null,
          error: null,
        },
      }));
      void inspectStoredLocalDatasetById(datasetId)
        .then((candidate) => {
          const availableScales = candidate.inspection.info.availableScales ?? [];
          const preferredScale = availableScales.find((scale) => scale.canLoad) ?? availableScales[0] ?? null;
          setLocalSourceUiState((prev) => ({
            ...prev,
            [datasetId]: {
              status: "ready",
              renderMode: prev[datasetId]?.renderMode ?? "slices",
              selectedResolution: prev[datasetId]?.selectedResolution ?? candidate.inspection.info.selectedResolution ?? preferredScale?.resolutionLabel ?? null,
              inspection: candidate.inspection,
              error: null,
            },
          }));
        })
        .catch((error) => {
          setLocalSourceUiState((prev) => ({
            ...prev,
            [datasetId]: {
              status: "error",
              renderMode: prev[datasetId]?.renderMode ?? "slices",
              selectedResolution: prev[datasetId]?.selectedResolution ?? null,
              error: error instanceof Error ? error.message : "Failed to inspect dataset.",
            },
          }));
        });
    }
  }, [localDatasetRecords, localSourceUiState, panelView]);

  useEffect(() => {
    let cancelled = false;
    const volumeCandidates = pendingLocalImports.filter((candidate) => candidate.inspection.kind === "volume");
    if (!volumeCandidates.length) {
      setLocalImportPreviews({});
      return;
    }

    for (const candidate of volumeCandidates) {
      const previewKey = `${candidate.id}::${candidate.inspection.info.selectedResolution ?? "default"}`;
      const current = localImportPreviews[candidate.id];
      if (current?.key === previewKey && (current.status === "loading" || current.status === "ready")) {
        continue;
      }
      setLocalImportPreviews((prev) => ({
        ...prev,
        [candidate.id]: { key: previewKey, status: "loading" },
      }));
      void createLocalImportPreview(candidate)
        .then((preview) => {
          if (cancelled) return;
          setLocalImportPreviews((prev) => ({
            ...prev,
            [candidate.id]: { key: preview.key, status: "ready", preview },
          }));
        })
        .catch((error) => {
          if (cancelled) return;
          setLocalImportPreviews((prev) => ({
            ...prev,
            [candidate.id]: {
              key: previewKey,
              status: "error",
              error: error instanceof Error ? error.message : "Preview unavailable.",
            },
          }));
        });
    }

    return () => {
      cancelled = true;
    };
  }, [pendingLocalImports]);



  if (!open) return null;

  function toggleExternalSelection(id: string) {
    const item = externalSources.find((entry) => entry.id === id);
    if (item?.icon === "custom" && !item.builtIn && getSelectableScales(item).length === 0) {
      return;
    }

    setSelectedExternalIds((prev) =>
      prev.includes(id) ? prev.filter((itemId) => itemId !== id) : [...prev, id]
    );
  }

  function toggleLocalDatasetSelection(id: string) {
    setSelectedLocalDatasetIds((prev) =>
      prev.includes(id) ? prev.filter((itemId) => itemId !== id) : [...prev, id]
    );
  }

  function setLocalSourceRenderMode(datasetId: string, renderMode: Exclude<RemoteRenderMode, "auto">) {
    setLocalSourceUiState((prev) => ({
      ...prev,
      [datasetId]: {
        ...(prev[datasetId] ?? { status: "idle", selectedResolution: null, renderMode }),
        renderMode,
      },
    }));
  }

  function setLocalSourceResolution(datasetId: string, selectedResolution: string) {
    setLocalSourceUiState((prev) => ({
      ...prev,
      [datasetId]: {
        ...(prev[datasetId] ?? { status: "idle", selectedResolution, renderMode: "slices" }),
        selectedResolution,
      },
    }));
  }

  function toggleGroupedExternalDefault(group: ExternalSourceGroup) {
    const selectedItem = group.items.find((item) => selectedExternalIds.includes(item.id));

    setSelectedExternalIds((prev) => {
      const withoutGroupItems = prev.filter((id) => !group.items.some((item) => item.id === id));

      if (selectedItem) {
        return withoutGroupItems;
      }

      const defaultItem = getDefaultGroupItem(group.items);
      return [...withoutGroupItems, defaultItem.id];
    });
  }

  function toggleGroupedExternalResolution(group: ExternalSourceGroup, itemId: string) {
    const isAlreadySelected = selectedExternalIds.includes(itemId);

    setSelectedExternalIds((prev) => {
      const withoutGroupItems = prev.filter((id) => !group.items.some((item) => item.id === id));

      if (isAlreadySelected) {
        return withoutGroupItems;
      }

      return [...withoutGroupItems, itemId];
    });
  }

  function handleApplyExternalUrlSuggestion(url: string) {
    setNewExternalUrl(url);
  }

  function handleSaveExternalDraftSource() {
    if (externalDraftInspection.status !== "ready" || !externalDraftInspection.probe || !externalDraftInspection.normalizedUrl) {
      return;
    }

    const url = externalDraftInspection.normalizedUrl;
    const probe = externalDraftInspection.probe;
    const name = newExternalName.trim() || deriveSourceName(url);

    const newSource = addCustomExternalSource({
      name,
      url,
      remoteFormat: "ome-zarr",
      remoteContentKind: "intensity",
      provider: inferProvider(url),
      availableScales: probe.scales.map((scale) => ({
        datasetIndex: scale.datasetIndex,
        datasetPath: scale.datasetPath,
        resolutionUm: scale.resolutionUm,
        resolutionLabel: scale.resolutionLabel,
        voxelSizeUm: scale.voxelSizeUm,
        rawShape: scale.rawShape,
        dims: scale.dims,
        estimatedBytes: scale.estimatedBytes,
        estimatedMemoryBytes: scale.estimatedMemoryBytes,
        canLoad: scale.canLoad,
      })),
      recommendedResolution: probe.recommendedScale?.resolutionLabel,
    });

    const externalItem = toExternalSourceItem(newSource);
    setExternalSources((prev) => [externalItem, ...prev]);
    setCustomSourceUiState((prev) => ({
      ...prev,
      [externalItem.id]: {
        renderMode: "volume",
        remoteResolution: getDefaultCustomResolution(externalItem),
      },
    }));
    setSelectedExternalIds([externalItem.id]);
    setSearchQuery("");
    setShowSearch(false);
    setPanelView("library");
    setNewExternalName("");
    setNewExternalUrl("");
    setExternalDraftInspection({
      status: "idle",
      normalizedUrl: null,
      metadataFile: null,
      probe: null,
      suggestions: [],
      message: null,
    });
  }

  function handleStartRenameCustomSource(item: ExternalSourceItem) {
    setEditingCustomSourceId(item.id);
    setEditingCustomSourceName(item.name);
  }

  function handleConfirmRenameCustomSource(itemId: string) {
    const nextName = editingCustomSourceName.trim();
    if (!nextName) {
      setEditingCustomSourceId(null);
      setEditingCustomSourceName("");
      return;
    }

    const renamed = renameCustomExternalSource(itemId, nextName);
    if (!renamed) {
      setEditingCustomSourceId(null);
      setEditingCustomSourceName("");
      return;
    }

    setExternalSources((prev) =>
      prev.map((item) => (item.id === itemId ? { ...item, name: nextName } : item))
    );
    setEditingCustomSourceId(null);
    setEditingCustomSourceName("");
  }

  function handleDeleteCustomSource(itemId: string) {
    deleteCustomExternalSource(itemId);

    setExternalSources((prev) => prev.filter((item) => item.id !== itemId));
    setSelectedExternalIds((prev) => prev.filter((id) => id !== itemId));
    setCustomSourceUiState((prev) => {
      const next = { ...prev };
      delete next[itemId];
      return next;
    });

    if (editingCustomSourceId === itemId) {
      setEditingCustomSourceId(null);
      setEditingCustomSourceName("");
    }
  }

  function setCustomSourceRenderMode(itemId: string, renderMode: Exclude<RemoteRenderMode, "auto">) {
    setCustomSourceUiState((prev) => ({
      ...prev,
      [itemId]: {
        ...(prev[itemId] ?? { remoteResolution: "100um", renderMode: "volume" }),
        renderMode,
      },
    }));
  }

  function setCustomSourceResolution(itemId: string, remoteResolution: RemoteOmeResolution) {
    setCustomSourceUiState((prev) => ({
      ...prev,
      [itemId]: {
        ...(prev[itemId] ?? { remoteResolution, renderMode: "volume" }),
        remoteResolution,
      },
    }));
  }

  async function handleAddSelectedSources() {
    if (isSubmittingSelection) return;
    if (!selectedExternalSources.length && !selectedLocalDatasetIds.length) return;
    setIsSubmittingSelection(true);
    const sourcesToAdd: Array<{
      id: string;
      name: string;
      url: string;
      icon?: "generic" | "custom";
      builtIn?: boolean;
      remoteFormat?: RemoteDataFormat;
      remoteContentKind?: RemoteContentKind;
      renderMode?: RemoteRenderMode;
      remoteResolution?: RemoteOmeResolution;
    }> = selectedExternalSources.flatMap((item) => {
      if (item.icon === "custom" && !item.builtIn) {
        const selectable = getSelectableScales(item);
        if (!selectable.length) return [];

        const uiState = customSourceUiState[item.id] ?? {
          renderMode: "volume",
          remoteResolution: getDefaultCustomResolution(item),
        };
        const selectedScale = selectable.find((scale) => scale.resolutionLabel === uiState.remoteResolution) ?? selectable[0];

        return [{
          id: item.id,
          name: buildCustomLayerName(item, uiState.renderMode, selectedScale.resolutionLabel),
          url: item.url,
          icon: item.icon === "custom" ? "custom" : "generic",
          builtIn: item.builtIn,
          remoteFormat: item.remoteFormat ?? "ome-zarr",
          remoteContentKind: item.remoteContentKind ?? "intensity",
          renderMode: uiState.renderMode,
          remoteResolution: selectedScale.resolutionLabel,
        }];
      }

      return [{
        id: item.id,
        name: item.name,
        url: item.url,
        icon: item.icon === "custom" ? "custom" : "generic",
        builtIn: item.builtIn,
        remoteFormat: item.remoteFormat,
        remoteContentKind: item.remoteContentKind,
        renderMode: item.renderMode,
        remoteResolution: item.remoteResolution,
      }];
    });

    if (sourcesToAdd.length) {
      onAddExternalSources(sourcesToAdd);
    }

    if (selectedLocalDatasetIds.length) {
      try {
        void onAddStoredLocalSources(selectedLocalDatasetIds.map((datasetId) => ({
          datasetId,
          renderMode: localSourceUiState[datasetId]?.inspection?.kind === "volume"
            ? localSourceUiState[datasetId]?.renderMode ?? "slices"
            : undefined,
          selectedResolution: localSourceUiState[datasetId]?.selectedResolution ?? undefined,
        })));
      } catch {}
    }

    onClose();
  }

  function setPendingImportResolution(importId: string, resolutionLabel: string) {
    setPendingLocalImports((prev) => prev.map((candidate) => {
      if (candidate.id !== importId) return candidate;
      const scales = candidate.inspection.info.availableScales ?? [];
      const selected = scales.find((scale) => scale.resolutionLabel === resolutionLabel) ?? null;
      return {
        ...candidate,
        inspection: {
          ...candidate.inspection,
          info: {
            ...candidate.inspection.info,
            selectedResolution: resolutionLabel,
            selectedDatasetPath: selected?.datasetPath ?? candidate.inspection.info.selectedDatasetPath ?? null,
            dims: selected?.dims ?? candidate.inspection.info.dims,
            rawShape: selected?.rawShape ?? candidate.inspection.info.rawShape,
            voxelSizeUm: selected?.voxelSizeUm ?? candidate.inspection.info.voxelSizeUm,
          },
        },
      };
    }));
  }

  async function collectDroppedEntries(items: DataTransferItemList | null, files: FileList | null, options?: { signal?: AbortSignal; onProgress?: (progress: LocalInspectionProgress) => void }): Promise<LocalInputEntry[]> {
    const output: LocalInputEntry[] = [];
    let discovered = 0;
    const report = (message: string) => options?.onProgress?.({ phase: "reading", message, completed: Math.max(0, discovered), total: Math.max(1, discovered + 1), percent: 0.05 });
    async function walkEntry(entry: any, prefix: string) {
      if (options?.signal?.aborted) {
        const error = new Error("Local import cancelled.");
        (error as Error & { name?: string }).name = "AbortError";
        throw error;
      }
      if (!entry) return;
      if (entry.isFile) {
        const file: File = await new Promise((resolve, reject) => entry.file(resolve, reject));
        discovered += 1;
        output.push({ path: prefix ? `${prefix}/${file.name}` : file.name, file });
        report(`Reading ${file.name}`);
        await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
        return;
      }
      if (entry.isDirectory) {
        report(`Reading folder ${entry.name}`);
        const reader = entry.createReader();
        const readBatch = (): Promise<any[]> => new Promise((resolve, reject) => reader.readEntries(resolve, reject));
        while (true) {
          const batch = await readBatch();
          if (!batch.length) break;
          for (const child of batch) {
            await walkEntry(child, prefix ? `${prefix}/${entry.name}` : entry.name);
          }
          await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
        }
      }
    }

    let usedDirectoryApi = false;
    if (items) {
      for (const item of Array.from(items)) {
        const entry = (item as any).webkitGetAsEntry?.();
        if (entry) {
          usedDirectoryApi = true;
          await walkEntry(entry, "");
        } else {
          const file = item.getAsFile?.();
          if (file) {
            discovered += 1;
            output.push({ path: file.webkitRelativePath || file.name, file });
            report(`Reading ${file.name}`);
          }
        }
      }
    }
    if (!usedDirectoryApi && files) {
      for (const file of Array.from(files)) {
        if (options?.signal?.aborted) {
          const error = new Error("Local import cancelled.");
          (error as Error & { name?: string }).name = "AbortError";
          throw error;
        }
        discovered += 1;
        output.push({ path: file.webkitRelativePath || file.name, file });
        report(`Reading ${file.name}`);
        await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
      }
    }
    return output;
  }

  async function startLocalInspection(getEntries: (controller: AbortController) => Promise<LocalInputEntry[]>) {
    localInspectionAbortRef.current?.abort();
    const controller = new AbortController();
    localInspectionAbortRef.current = controller;
    setIsInspectingLocalImport(true);
    setLocalInspectionProgress({ phase: "reading", message: "Preparing local import…", completed: 0, total: 1, percent: 0 });
    setLocalImportFeedback(null);
    try {
      const entries = await getEntries(controller);
      if (controller.signal.aborted) return;
      await handleLocalDropInput(entries, controller);
    } catch (error) {
      if (isAbortError(error)) return;
      setPendingLocalImports([]);
      setLocalImportFeedback({ tone: "error", message: error instanceof Error ? error.message : "Failed to inspect local import." });
      setIsInspectingLocalImport(false);
      setLocalInspectionProgress(null);
      if (localInspectionAbortRef.current === controller) localInspectionAbortRef.current = null;
    }
  }

  async function handleLocalDropInput(entries: LocalInputEntry[], existingController?: AbortController) {
    if (!entries.length) return;
    const controller = existingController ?? new AbortController();
    if (!existingController) {
      localInspectionAbortRef.current?.abort();
      localInspectionAbortRef.current = controller;
      setIsInspectingLocalImport(true);
      setLocalInspectionProgress({ phase: "reading", message: "Preparing local import…", completed: 0, total: Math.max(entries.length, 1), percent: 0 });
      setLocalImportFeedback(null);
    }
    try {
        const candidates = await inspectLocalInputEntries(entries, {
          signal: controller.signal,
          onProgress: (progress) => setLocalInspectionProgress(progress),
        });
        if (controller.signal.aborted) return;
        setPendingLocalImports(candidates.map((candidate) => {
          const preferredScale = candidate.inspection.info.availableScales?.find((scale) => scale.canLoad) ?? candidate.inspection.info.availableScales?.[0] ?? null;
          return {
            ...candidate,
            inspection: {
              ...candidate.inspection,
              info: {
                ...candidate.inspection.info,
                selectedResolution: candidate.inspection.info.selectedResolution ?? preferredScale?.resolutionLabel ?? null,
              selectedDatasetPath: candidate.inspection.info.selectedDatasetPath ?? preferredScale?.datasetPath ?? null,
              dims: preferredScale?.dims ?? candidate.inspection.info.dims,
              rawShape: preferredScale?.rawShape ?? candidate.inspection.info.rawShape,
              voxelSizeUm: preferredScale?.voxelSizeUm ?? candidate.inspection.info.voxelSizeUm,
            },
          },
        };
      }));
      setLocalImportFeedback({
        tone: "success",
        message: `${entries.length} file${entries.length > 1 ? "s" : ""} inspected. Import it to browser storage, then choose how to display it from Add layer.`,
      });
    } catch (error) {
      if (isAbortError(error)) {
        return;
      }
      setPendingLocalImports([]);
      setLocalImportFeedback({ tone: "error", message: error instanceof Error ? error.message : "Failed to inspect local import." });
    } finally {
      if (localInspectionAbortRef.current === controller) {
        localInspectionAbortRef.current = null;
      }
      setIsInspectingLocalImport(false);
      setLocalInspectionProgress(null);
    }
  }

  async function handleConfirmLocalImports() {
    if (!pendingLocalImports.length) return;
    const result = await onImportLocalSources(pendingLocalImports);
    if (result.importedCount > 0) {
      await refreshLocalDatasetRecords();
      setSelectedLocalDatasetIds(result.importedRecords.map((record) => record.id));
      setLocalImportFeedback({
        tone: result.errors.length ? "error" : "success",
        message: result.errors.length
          ? result.errors.join(" ")
          : `${result.importedCount} dataset${result.importedCount > 1 ? "s" : ""} imported locally.`,
      });
      setPendingLocalImports([]);
      setPanelView("library");
      return;
    }
    setLocalImportFeedback({ tone: "error", message: result.errors.join(" ") || "No supported local dataset could be imported." });
  }


  function getPreviewState(candidate: LocalImportCandidate) {
    const key = `${candidate.id}::${candidate.inspection.info.selectedResolution ?? "default"}`;
    const state = localImportPreviews[candidate.id];
    if (!state || state.key !== key) return null;
    return state;
  }

  function handleSearchBlur() {
    if (!searchQuery.trim()) {
      setShowSearch(false);
    }
  }

  return (
    <div
      onClick={handleRequestClose}
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 40,
        background: "rgba(0,0,0,0.45)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
    >
      <div
        data-theme-surface="panel"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(940px, calc(100vw - 32px))",
          height: "min(86vh, 820px)",
          maxHeight: "min(86vh, 820px)",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          borderRadius: 20,
          border: "1px solid rgba(255,255,255,0.10)",
          background: "rgba(12,14,18,0.96)",
          backdropFilter: "blur(14px)",
          boxShadow: "0 24px 60px rgba(0,0,0,0.45)",
          color: "white",
          fontFamily: "sans-serif",
          padding: 18,
        }}
      >
        <style>{`@keyframes custom-source-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } } @keyframes preview-shimmer { 0% { transform: translateX(-100%); } 100% { transform: translateX(100%); } } @keyframes panel-swap-in { 0% { opacity: 0; transform: translateY(10px) scale(0.99); } 100% { opacity: 1; transform: translateY(0) scale(1); } } @keyframes import-status-pulse { 0% { opacity: 0.52; } 50% { opacity: 1; } 100% { opacity: 0.52; } }`}</style>

        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 16,
            marginBottom: 18,
          }}
        >
          <div>
            <div style={{ fontSize: 18, fontWeight: 800 }}>
              {panelView === "library"
                ? "Add layer"
                : panelView === "import-external"
                ? "Add external source"
                : "Import personal data"}
            </div>
            <div data-theme-text="muted" style={{ fontSize: 13, opacity: 0.7, marginTop: 6 }}>
              {panelView === "library"
                ? "Choose a data source to add to the viewer."
                : panelView === "import-external"
                ? "Save a hosted source first, then add it from the shared source library."
                : "Import data into this browser first, then add it from the shared source library."}
            </div>
          </div>

          <button
            type="button"
            onClick={handleRequestClose}
            style={{
              width: 36,
              height: 36,
              borderRadius: 10,
              border: "1px solid rgba(255,255,255,0.10)",
              background: "rgba(255,255,255,0.04)",
              color: "white",
              cursor: "pointer",
              fontSize: 18,
            }}
          >
            ×
          </button>
        </div>

        {panelView === "library" ? (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 18, flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={() => onOpenLocalDatasetManager?.()}
              style={{
                height: 38,
                padding: "0 12px",
                borderRadius: 10,
                border: "1px solid rgba(255,255,255,0.10)",
                background: "rgba(255,255,255,0.05)",
                color: "white",
                cursor: "pointer",
                fontSize: 12,
                fontWeight: 700,
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              <ManageSourcesIcon />
              <span>Manage data sources</span>
            </button>

            <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 8, flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={() => setPanelView("import-external")}
                title="Add external source"
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: 10,
                  border: "1px solid rgba(255,255,255,0.10)",
                  background: "rgba(255,255,255,0.05)",
                  color: "white",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <AddSourceIcon />
              </button>
              <button
                type="button"
                onClick={() => setPanelView("import-local")}
                title="Add personal data"
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: 10,
                  border: "1px solid rgba(255,255,255,0.10)",
                  background: "rgba(255,255,255,0.05)",
                  color: "white",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <DataIcon />
              </button>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  height: 38,
                  borderRadius: 10,
                  border: showSearch
                    ? "1px solid rgba(160,220,255,0.28)"
                    : "1px solid rgba(255,255,255,0.10)",
                  background: showSearch
                    ? "rgba(120,190,255,0.08)"
                    : "rgba(255,255,255,0.05)",
                  overflow: "hidden",
                  width: showSearch ? 240 : 38,
                  transition: "width 180ms ease, background 180ms ease, border-color 180ms ease",
                }}
              >
                <button
                  type="button"
                  onClick={() => {
                    if (showSearch && searchQuery) {
                      setSearchQuery("");
                      searchInputRef.current?.focus();
                      return;
                    }
                    setShowSearch(true);
                  }}
                  title="Search sources"
                  style={{
                    width: 38,
                    minWidth: 38,
                    height: 38,
                    border: "none",
                    background: "transparent",
                    color: "white",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  <SearchIcon />
                </button>

                {showSearch ? (
                  <>
                    <input
                      ref={searchInputRef}
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      onBlur={handleSearchBlur}
                      placeholder="Search sources..."
                      style={{
                        flex: 1,
                        minWidth: 0,
                        height: 38,
                        border: "none",
                        background: "transparent",
                        color: "white",
                        outline: "none",
                        padding: "0 8px 0 0",
                        fontSize: 12,
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => {
                        if (searchQuery.trim()) {
                          setSearchQuery("");
                          searchInputRef.current?.focus();
                        } else {
                          setShowSearch(false);
                        }
                      }}
                      title="Clear search"
                      style={{
                        width: 30,
                        minWidth: 30,
                        height: 38,
                        border: "none",
                        background: "transparent",
                        color: "rgba(255,255,255,0.7)",
                        cursor: "pointer",
                        fontSize: 16,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        padding: 0,
                        flexShrink: 0,
                      }}
                    >
                      ×
                    </button>
                  </>
                ) : null}
              </div>
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", gap: 10, marginBottom: 18 }}>
            <button
              type="button"
              onClick={() => setPanelView("library")}
              title="Back to sources"
              style={{
                width: 36,
                height: 36,
                borderRadius: 10,
                border: "1px solid rgba(255,255,255,0.10)",
                background: "rgba(255,255,255,0.05)",
                color: "white",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <BackIcon />
            </button>
          </div>
        )}

        <div
          key={panelView}
          style={{
            flex: 1,
            minHeight: 0,
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
            animation: "panel-swap-in 220ms cubic-bezier(0.22, 1, 0.36, 1)",
          }}
        >
        {panelView !== "import-local" && (
          <div
            style={{
              borderRadius: panelView === "import-external" ? 0 : 16,
              border: panelView === "import-external" ? "none" : "1px solid rgba(255,255,255,0.10)",
              background: panelView === "import-external" ? "transparent" : "rgba(255,255,255,0.03)",
              padding: panelView === "import-external" ? 0 : 16,
              display: "flex",
              flexDirection: "column",
              minHeight: 0,
              flex: 1,
            }}
          >
            <div
              style={{
                display: "none",
                justifyContent: "space-between",
                alignItems: "flex-start",
                gap: 12,
                marginBottom: 14,
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 700 }}>
                  Select external sources
                </div>
                <div data-theme-text="muted" style={{ fontSize: 12, opacity: 0.65, marginTop: 4 }}>
                  Built-in sources are ready immediately. Custom URLs are inspected as OME-Zarr first, then you choose a scale and whether to add a volume or slices.
                </div>
              </div>

              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  flexShrink: 0,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    height: 38,
                    borderRadius: 10,
                    border: showSearch
                      ? "1px solid rgba(160,220,255,0.28)"
                      : "1px solid rgba(255,255,255,0.10)",
                    background: showSearch
                      ? "rgba(120,190,255,0.08)"
                      : "rgba(255,255,255,0.05)",
                    overflow: "hidden",
                    width: showSearch ? 220 : 38,
                    transition: "width 180ms ease, background 180ms ease, border-color 180ms ease",
                  }}
                >
                  <button
                    type="button"
                    onClick={() => {
                      if (showSearch && searchQuery) {
                        setSearchQuery("");
                        searchInputRef.current?.focus();
                        return;
                      }
                      setShowSearch(true);
                    }}
                    title="Search sources"
                    style={{
                      width: 38,
                      minWidth: 38,
                      height: 38,
                      border: "none",
                      background: "transparent",
                      color: "white",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                    }}
                  >
                    <SearchIcon />
                  </button>

                  {showSearch && (
                    <>
                      <input
                        ref={searchInputRef}
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        onBlur={handleSearchBlur}
                        placeholder="Search sources..."
                        style={{
                          flex: 1,
                          minWidth: 0,
                          height: 38,
                          border: "none",
                          background: "transparent",
                          color: "white",
                          outline: "none",
                          padding: "0 8px 0 0",
                          fontSize: 12,
                        }}
                      />
                      {(searchQuery || showSearch) && (
                        <button
                          type="button"
                          onClick={() => {
                            if (searchQuery.trim()) {
                              setSearchQuery("");
                              searchInputRef.current?.focus();
                            } else {
                              setShowSearch(false);
                            }
                          }}
                          title="Clear search"
                          style={{
                            width: 30,
                            minWidth: 30,
                            height: 38,
                            border: "none",
                            background: "transparent",
                            color: "rgba(255,255,255,0.7)",
                            cursor: "pointer",
                            fontSize: 16,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            padding: 0,
                            flexShrink: 0,
                          }}
                        >
                          ×
                        </button>
                      )}
                    </>
                  )}
                </div>

              </div>
            </div>

            <div
              style={{
                marginBottom: panelView === "import-external" ? 14 : 0,
                maxHeight: panelView === "import-external" ? 1000 : 0,
                opacity: panelView === "import-external" ? 1 : 0,
                transform: panelView === "import-external" ? "translateY(0)" : "translateY(-6px)",
                overflow: "hidden",
                pointerEvents: panelView === "import-external" ? "auto" : "none",
                transition:
                  "max-height 240ms ease, opacity 180ms ease, transform 180ms ease, margin-bottom 240ms ease",
              }}
            >
              <div
                data-theme-surface="soft"
                style={{
                  borderRadius: 14,
                  border: "1px solid rgba(255,255,255,0.10)",
                  background: "rgba(255,255,255,0.04)",
                  padding: 14,
                }}
              >
                <div style={{ display: "grid", gap: 12 }}>
                  <div style={{ fontSize: 13, fontWeight: 700 }}>
                    Add custom external OME-Zarr source
                  </div>

                  <div
                    data-theme-text="muted"
                    style={{
                      fontSize: 11,
                      opacity: 0.74,
                      lineHeight: 1.45,
                    }}
                  >
                    Paste a public OME-Zarr URL. The panel checks the path, normalizes metadata-file links back to the dataset root, and shows nearby paths you can jump to while you validate the source.
                  </div>

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1.6fr",
                      gap: 10,
                    }}
                  >
                    <input
                      ref={addSourceNameInputRef}
                      value={newExternalName}
                      onChange={(e) => setNewExternalName(e.target.value)}
                      placeholder="Source name (optional)"
                      style={{
                        width: "100%",
                        height: 40,
                        borderRadius: 10,
                        border: "1px solid rgba(255,255,255,0.12)",
                        background: "rgba(255,255,255,0.05)",
                        color: "white",
                        padding: "0 12px",
                        boxSizing: "border-box",
                        outline: "none",
                      }}
                    />

                    <div style={{ position: "relative" }}>
                      <input
                        value={newExternalUrl}
                        onChange={(e) => setNewExternalUrl(e.target.value)}
                        placeholder="https://.../dataset.ome.zarr/.zattrs"
                        style={{
                          width: "100%",
                          height: 40,
                          borderRadius: 10,
                          border:
                            externalDraftInspection.status === "ready"
                              ? "1px solid rgba(120,220,150,0.35)"
                              : externalDraftInspection.status === "error"
                              ? "1px solid rgba(255,120,120,0.28)"
                              : "1px solid rgba(255,255,255,0.12)",
                          background: "rgba(255,255,255,0.05)",
                          color: "white",
                          padding: "0 38px 0 12px",
                          boxSizing: "border-box",
                          outline: "none",
                        }}
                      />

                      <div
                        style={{
                          position: "absolute",
                          top: "50%",
                          right: 12,
                          transform: "translateY(-50%)",
                          width: 10,
                          height: 10,
                          borderRadius: 999,
                          background:
                            externalDraftInspection.status === "ready"
                              ? "#67e8a5"
                              : externalDraftInspection.status === "error"
                              ? "#f87171"
                              : externalDraftInspection.status === "inspecting"
                              ? "#93c5fd"
                              : "rgba(255,255,255,0.22)",
                          boxShadow:
                            externalDraftInspection.status === "inspecting"
                              ? "0 0 0 4px rgba(147,197,253,0.12)"
                              : "none",
                        }}
                      />
                    </div>
                  </div>

                  {externalDraftInspection.suggestions.length > 0 ? (
                    <div style={{ display: "grid", gap: 8 }}>
                      <div data-theme-text="muted" style={{ fontSize: 11, opacity: 0.68 }}>
                        Path suggestions
                      </div>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        {externalDraftInspection.suggestions.map((suggestion) => (
                          <button
                            key={`${suggestion.kind}-${suggestion.url}`}
                            type="button"
                            onClick={() => handleApplyExternalUrlSuggestion(suggestion.url)}
                            title={suggestion.url}
                            style={{
                              maxWidth: "100%",
                              height: 30,
                              padding: "0 10px",
                              borderRadius: 999,
                              border: "1px solid rgba(255,255,255,0.12)",
                              background: "rgba(255,255,255,0.05)",
                              color: "white",
                              cursor: "pointer",
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 6,
                              fontSize: 11,
                            }}
                          >
                            <span style={{ fontWeight: 700 }}>{suggestion.label}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  {externalDraftInspection.status !== "idle" ? (
                    <div
                      style={{
                        borderRadius: 12,
                        border:
                          externalDraftInspection.status === "ready"
                            ? "1px solid rgba(120,220,150,0.24)"
                            : externalDraftInspection.status === "error"
                            ? "1px solid rgba(255,120,120,0.22)"
                            : "1px solid rgba(160,220,255,0.22)",
                        background:
                          externalDraftInspection.status === "ready"
                            ? "rgba(70,180,100,0.10)"
                            : externalDraftInspection.status === "error"
                            ? "rgba(255,80,80,0.08)"
                            : "rgba(120,190,255,0.08)",
                        padding: "12px 14px",
                        display: "grid",
                        gap: 8,
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <span
                          style={{
                            height: 22,
                            padding: "0 8px",
                            borderRadius: 999,
                            border: "1px solid rgba(255,255,255,0.14)",
                            background: "rgba(255,255,255,0.08)",
                            display: "inline-flex",
                            alignItems: "center",
                            fontSize: 10,
                            fontWeight: 800,
                            letterSpacing: "0.04em",
                          }}
                        >
                          {externalDraftInspection.status === "ready"
                            ? "IMPORTABLE"
                            : externalDraftInspection.status === "error"
                            ? "NOT READY"
                            : "CHECKING"}
                        </span>
                        <span style={{ fontSize: 12, fontWeight: 700 }}>
                          {externalDraftInspection.message}
                        </span>
                      </div>

                      {externalDraftInspection.normalizedUrl ? (
                        <div style={{ fontSize: 11, opacity: 0.8, overflowWrap: "anywhere", wordBreak: "break-word" }}>
                          Root: {externalDraftInspection.normalizedUrl}
                        </div>
                      ) : null}

                      {externalDraftInspection.metadataFile ? (
                        <div data-theme-text="muted" style={{ fontSize: 11, opacity: 0.72 }}>
                          Entered metadata file: {externalDraftInspection.metadataFile}
                        </div>
                      ) : null}

                      {externalDraftInspection.probe ? (
                        <div style={{ display: "grid", gap: 8 }}>
                          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", fontSize: 11 }}>
                            <span><strong>{externalDraftInspection.probe.scales.length}</strong> scale{externalDraftInspection.probe.scales.length === 1 ? "" : "s"}</span>
                            {externalDraftInspection.probe.recommendedScale ? (
                              <span>
                                <strong>{getResolutionLabel(externalDraftInspection.probe.recommendedScale.resolutionLabel) || externalDraftInspection.probe.recommendedScale.resolutionLabel}</strong> recommended
                              </span>
                            ) : null}
                          </div>
                          <div style={{ display: "grid", gap: 6 }}>
                            {externalDraftInspection.probe.scales.slice(0, 4).map((scale) => (
                              <div
                                key={`${scale.datasetIndex}-${scale.datasetPath}`}
                                style={{
                                  borderRadius: 10,
                                  border: "1px solid rgba(255,255,255,0.10)",
                                  background: "rgba(255,255,255,0.04)",
                                  padding: "8px 10px",
                                  fontSize: 11,
                                  lineHeight: 1.45,
                                }}
                              >
                                <div style={{ fontWeight: 700 }}>{scale.datasetPath || "."}</div>
                                <div data-theme-text="muted" style={{ opacity: 0.74 }}>
                                  {describeExternalScale(scale)} · voxel {formatVoxelSizeValue(scale.voxelSizeUm.z)}/{formatVoxelSizeValue(scale.voxelSizeUm.y)}/{formatVoxelSizeValue(scale.voxelSizeUm.x)} µm
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </div>
            </div>

            <div
              style={{
                flex: 1,
                minHeight: 0,
                maxHeight: "none",
                overflowY: "auto",
                paddingRight: 4,
                scrollbarWidth: "thin",
                scrollbarColor:
                  "rgba(140, 190, 255, 0.45) rgba(255,255,255,0.06)",
              }}
            >
              {panelView === "library" ? (
                <div style={{ display: "none", gap: 12, marginBottom: 16 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 700 }}>Browser-hosted data</div>
                      <div data-theme-text="muted" style={{ fontSize: 12, opacity: 0.65, marginTop: 4 }}>
                        Imported datasets stay available across viewers in this browser and can be added again anytime.
                      </div>
                    </div>
                    <div style={{ height: 24, padding: "0 10px", borderRadius: 999, border: "1px solid rgba(255,255,255,0.10)", background: "rgba(255,255,255,0.04)", display: "inline-flex", alignItems: "center", fontSize: 10, fontWeight: 800, letterSpacing: "0.05em", opacity: 0.72 }}>
                      {filteredLocalDatasetRecords.length} SAVED
                    </div>
                  </div>

                  {filteredLocalDatasetRecords.length > 0 ? (
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(250px, 1fr))", gap: 12 }}>
                      {filteredLocalDatasetRecords.map((record) => {
                        const selected = selectedLocalDatasetIds.includes(record.id);
                        const entryCount = record.kind === "tree" ? (record.entries?.length ?? 0) : 1;
                        return (
                          <button
                            key={record.id}
                            type="button"
                            onClick={() => toggleLocalDatasetSelection(record.id)}
                            style={{
                              minHeight: 156,
                              borderRadius: 16,
                              border: selected ? "1px solid rgba(160,220,255,0.85)" : "1px solid rgba(255,255,255,0.10)",
                              background: selected ? "rgba(92,149,230,0.18)" : "rgba(255,255,255,0.04)",
                              color: "white",
                              padding: 14,
                              textAlign: "left",
                              display: "grid",
                              gap: 12,
                              cursor: "pointer",
                            }}
                          >
                            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start" }}>
                              <SourceIconFrame>
                                <DataIcon />
                              </SourceIconFrame>
                              <div style={{ width: 18, height: 18, borderRadius: 999, border: selected ? "1px solid rgba(160,220,255,0.95)" : "1px solid rgba(255,255,255,0.24)", background: selected ? "rgba(92,149,230,0.92)" : "transparent", flexShrink: 0, marginTop: 2 }} />
                            </div>
                            <div>
                              <div style={{ fontSize: 13, fontWeight: 700, lineHeight: 1.35 }}>{record.fileName}</div>
                              <div data-theme-text="muted" style={{ fontSize: 11, opacity: 0.68, marginTop: 6, lineHeight: 1.45 }}>
                                {record.kind === "tree" ? "Folder dataset" : "Single file"} · {formatBytes(record.size)} · {entryCount} item{entryCount === 1 ? "" : "s"}
                              </div>
                            </div>
                            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                              <span style={{ height: 22, padding: "0 8px", borderRadius: 999, border: "1px solid rgba(255,210,120,0.26)", background: "rgba(255,210,120,0.12)", color: "#ffe4ad", fontSize: 10, fontWeight: 700, display: "inline-flex", alignItems: "center" }}>
                                BROWSER
                              </span>
                              <span data-theme-text="muted" style={{ fontSize: 10, opacity: 0.62 }}>
                                Updated {formatTimestamp(record.updatedAt)}
                              </span>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <div
                      data-theme-surface="soft"
                      style={{
                        minHeight: 120,
                        borderRadius: 14,
                        border: "1px dashed rgba(255,255,255,0.12)",
                        background: "rgba(255,255,255,0.02)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        textAlign: "center",
                        padding: 20,
                        color: "rgba(255,255,255,0.72)",
                        fontSize: 13,
                      }}
                    >
                      {searchQuery.trim()
                        ? `No browser-hosted dataset matches "${searchQuery}".`
                        : "No browser-hosted dataset is saved yet."}
                    </div>
                  )}
                </div>
              ) : null}

              <div
                style={{
                  display: panelView === "import-external" ? "none" : "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(250px, 1fr))",
                  gap: 12,
                  alignItems: "stretch",
                }}
              >
                {panelView === "library"
                  ? filteredLocalDatasetRecords.map((record) => {
                      const selected = selectedLocalDatasetIds.includes(record.id);
                      const entryCount = record.kind === "tree" ? (record.entries?.length ?? 0) : 1;
                      const localUi = localSourceUiState[record.id];
                      const localInspection = localUi?.inspection;
                      const localScales = localInspection?.info.availableScales ?? [];
                      const selectedResolution = localUi?.selectedResolution ?? localInspection?.info.selectedResolution ?? null;
                      return (
                        <button
                          key={record.id}
                          type="button"
                          onClick={() => toggleLocalDatasetSelection(record.id)}
                          style={{
                            minHeight: 196,
                            minWidth: 0,
                            borderRadius: 16,
                            border: selected ? "1px solid rgba(160,220,255,0.85)" : "1px solid rgba(255,255,255,0.10)",
                            background: selected ? "rgba(92,149,230,0.18)" : "rgba(255,255,255,0.04)",
                            color: "white",
                            padding: 14,
                            textAlign: "left",
                            display: "flex",
                            flexDirection: "column",
                            justifyContent: "space-between",
                            gap: 12,
                            cursor: "pointer",
                            transition: "border-color 180ms ease, background 180ms ease, box-shadow 220ms ease",
                          }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start", minWidth: 0 }}>
                          <SourceIconFrame>
                              <DataIcon />
                            </SourceIconFrame>
                            <div style={{ width: 18, height: 18, borderRadius: 999, border: selected ? "1px solid rgba(160,220,255,0.95)" : "1px solid rgba(255,255,255,0.24)", background: selected ? "rgba(92,149,230,0.92)" : "transparent", flexShrink: 0, marginTop: 2 }} />
                        </div>
                        <div style={{ minWidth: 0 }}>
                          <div
                            style={{
                              display: "block",
                              width: "100%",
                              minWidth: 0,
                              fontSize: 13,
                              fontWeight: 700,
                              lineHeight: 1.35,
                              whiteSpace: "nowrap",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                            }}
                            title={record.fileName}
                          >
                            {record.fileName}
                          </div>
                          <div data-theme-text="muted" style={{ fontSize: 11, opacity: 0.68, marginTop: 6, lineHeight: 1.45 }}>
                            {record.kind === "tree" ? "Folder dataset" : "Single file"} · {formatBytes(record.size)} · {entryCount} item{entryCount === 1 ? "" : "s"}
                          </div>
                        </div>
                        {localInspection?.kind === "volume" ? (
                          <div style={{ display: "grid", gap: 10 }}>
                            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                              <button type="button" onClick={(event) => { event.stopPropagation(); setLocalSourceRenderMode(record.id, "slices"); }} style={{ height: 30, padding: "0 10px", borderRadius: 999, border: selected && localUi?.renderMode === "slices" ? "1px solid rgba(92,149,230,0.88)" : "1px solid rgba(255,255,255,0.14)", background: selected && localUi?.renderMode === "slices" ? "rgba(92,149,230,0.26)" : "rgba(255,255,255,0.05)", color: "white", cursor: "pointer", fontSize: 11, fontWeight: 700, transition: "border-color 180ms ease, background 180ms ease, color 180ms ease" }}>Slices</button>
                              <button type="button" onClick={(event) => { event.stopPropagation(); setLocalSourceRenderMode(record.id, "volume"); }} style={{ height: 30, padding: "0 10px", borderRadius: 999, border: selected && localUi?.renderMode === "volume" ? "1px solid rgba(92,149,230,0.88)" : "1px solid rgba(255,255,255,0.14)", background: selected && localUi?.renderMode === "volume" ? "rgba(92,149,230,0.26)" : "rgba(255,255,255,0.05)", color: "white", cursor: "pointer", fontSize: 11, fontWeight: 700, transition: "border-color 180ms ease, background 180ms ease, color 180ms ease" }}>Volume</button>
                            </div>
                            {localScales.length > 0 ? (
                              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                                {localScales.map((scale) => {
                                  const active = selected && selectedResolution === scale.resolutionLabel;
                                  return (
                                    <button
                                      key={`${record.id}-${scale.datasetPath}`}
                                      type="button"
                                      onClick={(event) => {
                                        event.stopPropagation();
                                        if (scale.canLoad) setLocalSourceResolution(record.id, scale.resolutionLabel);
                                      }}
                                      disabled={!scale.canLoad}
                                      style={{
                                        height: 30,
                                        padding: "0 10px",
                                        borderRadius: 999,
                                        border: active ? "1px solid rgba(92,149,230,0.88)" : scale.canLoad ? "1px solid rgba(255,255,255,0.14)" : "1px solid rgba(255,255,255,0.10)",
                                        background: active ? "rgba(92,149,230,0.26)" : scale.canLoad ? "rgba(255,255,255,0.05)" : "rgba(255,255,255,0.04)",
                                        color: scale.canLoad ? "white" : "rgba(255,255,255,0.46)",
                                        cursor: scale.canLoad ? "pointer" : "default",
                                        fontSize: 11,
                                        fontWeight: 700,
                                        transition: "border-color 180ms ease, background 180ms ease, color 180ms ease",
                                      }}
                                    >
                                      {getResolutionLabel(scale.resolutionLabel) || scale.resolutionLabel}
                                    </button>
                                  );
                                })}
                              </div>
                            ) : null}
                          </div>
                        ) : localUi?.status === "loading" ? (
                          <div data-theme-text="muted" style={{ fontSize: 11, opacity: 0.7 }}>Inspecting display options...</div>
                        ) : localUi?.status === "error" ? (
                          <div style={{ fontSize: 11, color: "#ffd0d0", lineHeight: 1.45 }}>{localUi.error ?? "Failed to inspect dataset."}</div>
                        ) : null}
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                          <span style={{ height: 22, padding: "0 8px", borderRadius: 999, border: "1px solid rgba(255,210,120,0.26)", background: "rgba(255,210,120,0.12)", color: "#ffe4ad", fontSize: 10, fontWeight: 700, display: "inline-flex", alignItems: "center" }}>
                            BROWSER
                            </span>
                            <span data-theme-text="muted" style={{ fontSize: 10, opacity: 0.62 }}>
                              Updated {formatTimestamp(record.updatedAt)}
                            </span>
                          </div>
                        </button>
                      );
                    })
                  : null}

                {filteredGroupedExternalSources.map((group) => {
                  const selectedItem = group.items.find((item) => selectedExternalIds.includes(item.id));
                  const groupSelected = !!selectedItem;

                  if (group.kind === "single") {
                    const item = group.items[0];
                    const selected = selectedExternalIds.includes(item.id);
                    const isCustom = item.icon === "custom" && item.builtIn === false;
                    const isEditing = editingCustomSourceId === item.id;
                    const selectableScales = getSelectableScales(item);
                    const hasDetectedScales = (item.availableScales?.length ?? 0) > 0;
                    const uiState = customSourceUiState[item.id] ?? {
                      renderMode: "volume",
                      remoteResolution: getDefaultCustomResolution(item),
                    };
                    return (
                      <div
                        key={item.id}
                        style={{
                          minHeight: 196,
                          height: "100%",
                          borderRadius: 16,
                          border: selected
                            ? "1px solid rgba(160,220,255,0.85)"
                            : "1px solid rgba(255,255,255,0.10)",
                          background: selected
                            ? "rgba(92,149,230,0.18)"
                            : "rgba(255,255,255,0.04)",
                          boxShadow: "none",
                          color: "white",
                          padding: 14,
                          textAlign: "left",
                          display: "flex",
                          flexDirection: "column",
                          justifyContent: "space-between",
                          gap: 12,
                          transition: "border-color 180ms ease, background 180ms ease, box-shadow 220ms ease",
                        }}
                      >
                        <div
                          onClick={() => {
                            if (isCustom && !selectableScales.length) return;
                            toggleExternalSelection(item.id);
                          }}
                          style={{
                            color: "inherit",
                            padding: 0,
                            margin: 0,
                            cursor: isCustom && !selectableScales.length ? "not-allowed" : "pointer",
                            opacity: isCustom && !selectableScales.length ? 0.75 : 1,
                            textAlign: "left",
                            display: "flex",
                            flexDirection: "column",
                            justifyContent: "space-between",
                            gap: 12,
                          }}
                        >
                          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start" }}>
                            <SourceIcon icon={item.icon} />

                            <div style={{ display: "flex", alignItems: "flex-start", gap: 8, position: "relative" }}>
                              {isCustom ? (
                                <>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setOpenCustomSourceMenuId((prev) => (prev === item.id ? null : item.id));
                                    }}
                                    style={{
                                      width: 28,
                                      height: 28,
                                      borderRadius: 10,
                                      border: "1px solid rgba(255,255,255,0.10)",
                                      background: "rgba(255,255,255,0.05)",
                                      color: "white",
                                      cursor: "pointer",
                                      display: "flex",
                                      alignItems: "center",
                                      justifyContent: "center",
                                      flexShrink: 0,
                                    }}
                                  >
                                    <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
                                      <circle cx="12" cy="5" r="1.8" />
                                      <circle cx="12" cy="12" r="1.8" />
                                      <circle cx="12" cy="19" r="1.8" />
                                    </svg>
                                  </button>

                                  {openCustomSourceMenuId === item.id ? (
                                    <div
                                      onPointerDown={(e) => e.stopPropagation()}
                                      onClick={(e) => e.stopPropagation()}
                                      style={{
                                        position: "absolute",
                                        top: 34,
                                        right: 0,
                                        minWidth: 128,
                                        borderRadius: 12,
                                        border: "1px solid rgba(255,255,255,0.10)",
                                        background: "rgba(20,24,30,0.98)",
                                        boxShadow: "0 12px 30px rgba(0,0,0,0.35)",
                                        overflow: "hidden",
                                        zIndex: 20,
                                      }}
                                    >
                                      <button
                                        type="button"
                                        onPointerDown={(e) => e.stopPropagation()}
                                        onMouseDown={(e) => e.stopPropagation()}
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleStartRenameCustomSource(item);
                                          setOpenCustomSourceMenuId(null);
      setLocalImportFeedback(null);
      setPendingLocalImports([]);
      setIsInspectingLocalImport(false);
                                        }}
                                        style={{
                                          width: "100%",
                                          height: 36,
                                          padding: "0 12px",
                                          border: "none",
                                          background: "transparent",
                                          color: "white",
                                          textAlign: "left",
                                          cursor: "pointer",
                                          fontSize: 12,
                                        }}
                                      >
                                        Rename
                                      </button>
                                      <button
                                        type="button"
                                        onPointerDown={(e) => e.stopPropagation()}
                                        onMouseDown={(e) => e.stopPropagation()}
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleDeleteCustomSource(item.id);
                                          setOpenCustomSourceMenuId(null);
      setLocalImportFeedback(null);
      setPendingLocalImports([]);
      setIsInspectingLocalImport(false);
                                        }}
                                        style={{
                                          width: "100%",
                                          height: 36,
                                          padding: "0 12px",
                                          border: "none",
                                          background: "transparent",
                                          color: "white",
                                          textAlign: "left",
                                          cursor: "pointer",
                                          fontSize: 12,
                                        }}
                                      >
                                        Delete
                                      </button>
                                    </div>
                                  ) : null}
                                </>
                              ) : null}

                              <div
                                style={{
                                  width: 18,
                                  height: 18,
                                  borderRadius: 999,
                                  border: selected
                                    ? "1px solid rgba(160,220,255,0.95)"
                                    : "1px solid rgba(255,255,255,0.24)",
                                  background: selected ? "rgba(92,149,230,0.92)" : "transparent",
                                  flexShrink: 0,
                                  marginTop: 5,
                                }}
                              />
                            </div>
                          </div>

                          <div>
                            {isEditing ? (
                              <input
                                autoFocus
                                value={editingCustomSourceName}
                                onChange={(e) => setEditingCustomSourceName(e.target.value)}
                                onClick={(e) => e.stopPropagation()}
                                onBlur={() => handleConfirmRenameCustomSource(item.id)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") handleConfirmRenameCustomSource(item.id);
                                  if (e.key === "Escape") {
                                    setEditingCustomSourceId(null);
                                    setEditingCustomSourceName("");
                                  }
                                }}
                                style={{
                                  width: "100%",
                                  height: 34,
                                  borderRadius: 8,
                                  border: "1px solid rgba(160,220,255,0.45)",
                                  background: "rgba(255,255,255,0.07)",
                                  color: "white",
                                  padding: "0 10px",
                                  boxSizing: "border-box",
                                  outline: "none",
                                }}
                              />
                            ) : (
                              <>
                                <div data-theme-text="strong" style={{ fontSize: 13, fontWeight: 700, lineHeight: 1.3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={item.name}>
                                  {item.name}
                                </div>
                                <div
                                  data-theme-text="muted"
                                  style={{
                                    fontSize: 11,
                                    opacity: 0.7,
                                    marginTop: 6,
                                    lineHeight: 1.45,
                                  }}
                                >
                                  {item.builtIn
                                    ? "Built-in source"
                                    : `External OME-Zarr dataset${item.provider ? ` from ${formatProviderLabel(item.provider)}` : ""}`}
                                  
                                </div>
                              </>
                            )}
                          </div>
                        </div>

                        {isCustom ? (
                          <div style={{ display: "grid", gap: 10 }}>
                            {hasDetectedScales ? (
                              <>
                                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                                  <button
                                    type="button"
                                    onClick={() => selected && setCustomSourceRenderMode(item.id, "volume")}
                                    disabled={!selected}
                                    style={{
                                      height: 30,
                                      padding: "0 10px",
                                      borderRadius: 999,
                                      border: selected && uiState.renderMode === "volume"
                                        ? "1px solid rgba(92,149,230,0.88)"
                                        : "1px solid rgba(255,255,255,0.14)",
                                      background: selected && uiState.renderMode === "volume"
                                        ? "rgba(92,149,230,0.26)"
                                        : "rgba(255,255,255,0.05)",
                                      color: selected ? "white" : "rgba(255,255,255,0.62)",
                                      cursor: selected ? "pointer" : "default",
                                      fontSize: 11,
                                      fontWeight: 700,
                                      opacity: selected ? 1 : 0.72,
                                    }}
                                  >
                                    Volume
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => selected && setCustomSourceRenderMode(item.id, "slices")}
                                    disabled={!selected}
                                    style={{
                                      height: 30,
                                      padding: "0 10px",
                                      borderRadius: 999,
                                      border: selected && uiState.renderMode === "slices"
                                        ? "1px solid rgba(92,149,230,0.88)"
                                        : "1px solid rgba(255,255,255,0.14)",
                                      background: selected && uiState.renderMode === "slices"
                                        ? "rgba(92,149,230,0.26)"
                                        : "rgba(255,255,255,0.05)",
                                      color: selected ? "white" : "rgba(255,255,255,0.62)",
                                      cursor: selected ? "pointer" : "default",
                                      fontSize: 11,
                                      fontWeight: 700,
                                      opacity: selected ? 1 : 0.72,
                                    }}
                                  >
                                    Slices
                                  </button>
                                </div>

                                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                                  {(item.availableScales ?? []).map((scale) => {
                                    const resolutionSelected = selected && uiState.remoteResolution === scale.resolutionLabel;
                                    return (
                                      <button
                                        key={`${item.id}-${scale.datasetPath}`}
                                        type="button"
                                        onClick={() => selected && scale.canLoad && setCustomSourceResolution(item.id, scale.resolutionLabel)}
                                        title={`${getResolutionLabel(scale.resolutionLabel) || scale.resolutionLabel}${scale.canLoad ? "" : " · too large for browser budget"}`}
                                        disabled={!selected || !scale.canLoad}
                                        style={{
                                          height: 30,
                                          padding: "0 10px",
                                          borderRadius: 999,
                                          border: resolutionSelected
                                            ? "1px solid rgba(92,149,230,0.88)"
                                            : scale.canLoad
                                            ? "1px solid rgba(255,255,255,0.14)"
                                            : "1px solid rgba(255,255,255,0.10)",
                                          background: resolutionSelected
                                            ? "rgba(92,149,230,0.26)"
                                            : scale.canLoad
                                            ? "rgba(255,255,255,0.05)"
                                            : "rgba(255,255,255,0.04)",
                                          color: !selected
                                            ? "rgba(255,255,255,0.62)"
                                            : scale.canLoad
                                            ? "white"
                                            : "rgba(255,255,255,0.46)",
                                          cursor: selected && scale.canLoad ? "pointer" : "default",
                                          fontSize: 11,
                                          fontWeight: 700,
                                          opacity: selected ? (scale.canLoad ? 1 : 0.8) : 0.72,
                                        }}
                                      >
                                        {getResolutionLabel(scale.resolutionLabel) || scale.resolutionLabel}
                                      </button>
                                    );
                                  })}
                                </div>

                                {selectableScales.length === 0 ? (
                                  <div
                                    data-theme-text="muted"
                                    style={{
                                      fontSize: 11,
                                      lineHeight: 1.45,
                                      opacity: 0.72,
                                    }}
                                  >
                                    No browser-loadable resolution detected.
                                  </div>
                                ) : null}
                              </>
                            ) : (
                              <div
                                style={{
                                  borderRadius: 10,
                                  border: "1px solid rgba(255,120,120,0.18)",
                                  background: "rgba(255,80,80,0.08)",
                                  padding: 10,
                                  fontSize: 11,
                                  lineHeight: 1.45,
                                  color: "#ffd0d0",
                                  overflowWrap: "anywhere",
                                  wordBreak: "break-word",
                                }}
                              >
                                {item.inspectionError ?? "This source does not have any browser-loadable OME-Zarr scale."}
                              </div>
                            )}
                          </div>
                        ) : (
                          <div style={{ minHeight: 30, display: "flex", gap: 8, flexWrap: "wrap" }}>
                            {isCustom ? null : null}
                          </div>
                        )}
                      </div>
                    );
                  }

                  return (
                    <div
                      key={group.id}
                      style={{
                        minHeight: 180,
                        height: "100%",
                        borderRadius: 16,
                        border: groupSelected
                          ? "1px solid rgba(160,220,255,0.85)"
                          : "1px solid rgba(255,255,255,0.10)",
                        background: groupSelected
                          ? "rgba(92,149,230,0.18)"
                          : "rgba(255,255,255,0.04)",
                        color: "white",
                        padding: 14,
                        display: "flex",
                        flexDirection: "column",
                        justifyContent: "space-between",
                        gap: 12,
                      }}
                    >
                      <div
                        role="button"
                        tabIndex={0}
                        onClick={() => toggleGroupedExternalDefault(group)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            toggleGroupedExternalDefault(group);
                          }
                        }}
                        style={{
                          border: "1px solid transparent",
                          background: groupSelected ? "rgba(92,149,230,0.08)" : "transparent",
                          color: "inherit",
                          padding: 10,
                          margin: 0,
                          borderRadius: 12,
                          cursor: "pointer",
                          textAlign: "left",
                          display: "flex",
                          flexDirection: "column",
                          gap: 12,
                          boxSizing: "border-box",
                          width: "100%",
                          transition: "background 160ms ease, border-color 160ms ease",
                        }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                          <SourceIcon icon={group.icon} />

                          <div
                            style={{
                              width: 18,
                              height: 18,
                              borderRadius: 999,
                              border: groupSelected
                                ? "1px solid rgba(160,220,255,0.95)"
                                : "1px solid rgba(255,255,255,0.24)",
                              background: groupSelected ? "rgba(92,149,230,0.92)" : "transparent",
                              flexShrink: 0,
                              marginTop: 2,
                            }}
                          />
                        </div>

                        <div>
                          <div data-theme-text="strong" style={{ fontSize: 13, fontWeight: 700, lineHeight: 1.3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={group.name}>
                            {group.name}
                          </div>
                          <div
                            data-theme-text="muted"
                            style={{
                              fontSize: 11,
                              opacity: 0.6,
                              marginTop: 6,
                            }}
                          >
                            {group.builtIn ? "Built-in source" : "Custom external source"}
                            {selectedItem?.remoteResolution
                              ? ` · Selected ${getResolutionLabel(selectedItem.remoteResolution)}`
                              : ""}
                          </div>
                        </div>
                      </div>

                      <div
                        style={{
                          display: "flex",
                          gap: 8,
                          flexWrap: "wrap",
                          minHeight: 30,
                          alignItems: "flex-end",
                        }}
                      >
                        {group.items.map((item) => {
                          const resolutionSelected = selectedExternalIds.includes(item.id);

                          return (
                            <button
                              key={item.id}
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleGroupedExternalResolution(group, item.id);
                              }}
                              style={{
                                height: 30,
                                padding: "0 10px",
                                borderRadius: 999,
                                border: resolutionSelected
                                  ? "1px solid rgba(92,149,230,0.88)"
                                  : "1px solid rgba(255,255,255,0.14)",
                                background: resolutionSelected
                                  ? "rgba(92,149,230,0.26)"
                                  : "rgba(255,255,255,0.05)",
                                boxShadow: resolutionSelected
                                  ? "inset 0 0 0 1px rgba(255,255,255,0.12)"
                                  : "none",
                                color: "white",
                                cursor: "pointer",
                                fontSize: 11,
                                fontWeight: 700,
                              }}
                            >
                              {getResolutionLabel(item.remoteResolution)}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>

              {panelView !== "import-external" && (((panelView === "library" && filteredGroupedExternalSources.length === 0 && filteredLocalDatasetRecords.length === 0)
                || (panelView !== "library" && filteredGroupedExternalSources.length === 0))) && (
                <div
                  data-theme-surface="soft"
                  style={{
                    minHeight: 120,
                    borderRadius: 14,
                    border: "1px dashed rgba(255,255,255,0.12)",
                    background: "rgba(255,255,255,0.02)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    textAlign: "center",
                    padding: 20,
                    marginTop: 2,
                    color: "rgba(255,255,255,0.72)",
                    fontSize: 13,
                  }}
                >
                  {searchQuery.trim()
                    ? `No data source matches "${searchQuery}".`
                    : panelView === "library"
                    ? "No data source is available yet."
                    : "No external source is available yet."}
                </div>
              )}
            </div>
          </div>
        )}

        {panelView === "import-local" && (
          <div
            data-theme-surface="soft"
            style={{
              position: "relative",
              borderRadius: 16,
              border: "1px solid rgba(255,255,255,0.10)",
              background: "rgba(255,255,255,0.03)",
              padding: 16,
              display: "flex",
              flexDirection: "column",
              minHeight: 0,
              flex: 1,
              gap: 12,
            }}
          >
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 2 }}>
                  Upload custom data
                </div>
                <div data-theme-text="muted" style={{ fontSize: 12, opacity: 0.72, lineHeight: 1.45 }}>
                  Drop files, folders, or ZIP archives here. Supports NRRD, NIfTI (.nii/.nii.gz), TIFF, OBJ, OME-Zarr/Zarr, and gzip-compressed variants of supported single files. Local imports stay only in this browser and are not included when sharing the viewer.
                </div>
              </div>
            </div>

            {localImportFeedback ? (
              <div
                style={{
                  borderRadius: 10,
                  border: localImportFeedback.tone === "success" ? "1px solid rgba(120,220,150,0.24)" : "1px solid rgba(255,120,120,0.22)",
                  background: localImportFeedback.tone === "success" ? "rgba(70,180,100,0.12)" : "rgba(255,80,80,0.08)",
                  color: localImportFeedback.tone === "success" ? "#d7ffe2" : "#ffd0d0",
                  padding: "10px 12px",
                  fontSize: 12,
                  lineHeight: 1.45,
                  overflowWrap: "anywhere",
                  wordBreak: "break-word",
                }}
              >
                {localImportFeedback.message}
              </div>
            ) : null}

            <div style={{ display: "grid", gridTemplateColumns: pendingLocalImports.length > 0 ? "minmax(230px, 290px) minmax(0, 1fr)" : "1fr", gap: 12, flex: 1, minHeight: 0 }}>
              <div
                onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setIsDragging(false);
                  void startLocalInspection((controller) => collectDroppedEntries(e.dataTransfer.items, e.dataTransfer.files, {
                    signal: controller.signal,
                    onProgress: (progress) => setLocalInspectionProgress(progress),
                  }));
                }}
                onClick={() => inputRef.current?.click()}
                style={{
                  minHeight: 240,
                  borderRadius: 18,
                  border: isDragging ? "1px solid rgba(130,240,190,0.85)" : "1px dashed rgba(255,255,255,0.20)",
                  background: isDragging ? "rgba(90,210,160,0.12)" : "linear-gradient(180deg, rgba(255,255,255,0.04), rgba(255,255,255,0.02))",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "pointer",
                  textAlign: "center",
                  padding: 24,
                  gap: 10,
                }}
              >
                <div style={{ width: 46, height: 46, borderRadius: 14, border: "1px solid rgba(255,255,255,0.10)", background: "rgba(255,255,255,0.05)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <DataIcon />
                </div>
                <div style={{ fontSize: 15, fontWeight: 800 }}>
                  {isInspectingLocalImport ? "Inspecting local data…" : "Drop local files or folders"}
                </div>
                <div data-theme-text="muted" style={{ fontSize: 12, opacity: 0.74, lineHeight: 1.5, maxWidth: 240 }}>
                  The app inspects your dataset first, then you choose the preview, the import mode, and the best resolution before adding it to the scene.
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center", marginTop: 2 }}>
                  {["NRRD", "NIfTI", "TIFF", "OME-Zarr", "Zarr", "ZIP"].map((label) => (
                    <span key={label} style={{ height: 26, padding: "0 9px", borderRadius: 999, border: "1px solid rgba(255,255,255,0.10)", background: "rgba(255,255,255,0.04)", display: "inline-flex", alignItems: "center", fontSize: 10, fontWeight: 700, letterSpacing: "0.04em", opacity: 0.78 }}>
                      {label}
                    </span>
                  ))}
                </div>
              </div>

              {pendingLocalImports.length > 0 ? (
                <div className="layer-panel-scroll" style={{ minHeight: 0, maxHeight: "none", paddingRight: 4, display: "grid", gap: 12, alignContent: "start" }}>
                  {pendingLocalImports.map((candidate) => {
                    const scales = candidate.inspection.info.availableScales ?? [];
                    const selectableScales = scales.filter((scale) => scale.canLoad);
                    const selectedResolution = candidate.inspection.info.selectedResolution ?? selectableScales[0]?.resolutionLabel ?? scales[0]?.resolutionLabel ?? null;
                    const previewState = getPreviewState(candidate);
                    const preview = previewState?.preview;
                    const dims = candidate.inspection.info.dims;
                    const voxelSize = candidate.inspection.info.voxelSizeUm;
                    const voxelText = voxelSize && (voxelSize.x || voxelSize.y || voxelSize.z)
                      ? `${formatVoxelSizeValue(voxelSize.x)} × ${formatVoxelSizeValue(voxelSize.y)} × ${formatVoxelSizeValue(voxelSize.z)} µm`
                      : "Unknown";
                    return (
                      <div key={candidate.id} style={{ borderRadius: 16, border: "1px solid rgba(255,255,255,0.10)", background: "rgba(255,255,255,0.04)", padding: 14, display: "grid", gap: 12 }}>
                        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontSize: 14, fontWeight: 800, lineHeight: 1.35 }}>{candidate.name}</div>
                            <div data-theme-text="muted" style={{ fontSize: 11, opacity: 0.74, marginTop: 5, lineHeight: 1.45 }}>
                              {candidate.inspection.format === "ome-zarr" || candidate.inspection.format === "zarr"
                                ? `Detected ${candidate.inspection.format.toUpperCase()} dataset`
                                : `Detected ${candidate.inspection.format.toUpperCase()} ${candidate.inspection.kind}`}
                            </div>
                          </div>
                          <div style={{ height: 24, padding: "0 10px", borderRadius: 999, border: "1px solid rgba(255,255,255,0.10)", background: "rgba(255,255,255,0.04)", display: "inline-flex", alignItems: "center", flexShrink: 0, fontSize: 10, fontWeight: 800, letterSpacing: "0.05em", opacity: 0.72 }}>
                            LOCAL ONLY
                          </div>
                        </div>

                        {candidate.inspection.kind === "volume" ? (
                          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 10 }}>
                            <PreviewAxisTile label="XY" src={preview?.xyDataUrl ?? null} loading={previewState?.status === "loading"} error={previewState?.status === "error" ? previewState.error ?? null : null} />
                            <PreviewAxisTile label="XZ" src={preview?.xzDataUrl ?? null} loading={previewState?.status === "loading"} error={previewState?.status === "error" ? previewState.error ?? null : null} />
                            <PreviewAxisTile label="YZ" src={preview?.yzDataUrl ?? null} loading={previewState?.status === "loading"} error={previewState?.status === "error" ? previewState.error ?? null : null} />
                          </div>
                        ) : (
                          <div style={{ borderRadius: 14, border: "1px solid rgba(255,255,255,0.10)", background: "rgba(255,255,255,0.03)", minHeight: 116, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 8 }}>
                            <div style={{ width: 40, height: 40, borderRadius: 12, border: "1px solid rgba(255,255,255,0.10)", background: "rgba(255,255,255,0.05)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                              <DataIcon />
                            </div>
                            <div data-theme-text="muted" style={{ fontSize: 11, opacity: 0.72 }}>Mesh preview is not shown here yet</div>
                          </div>
                        )}

                        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 8 }}>
                          <DatasetStat label="Format" value={candidate.inspection.format.toUpperCase()} />
                          <DatasetStat label="Size" value={formatBytes(candidate.inspection.info.fileSizeBytes)} />
                          <DatasetStat label="Dimensions" value={dims ? `${dims.x} × ${dims.y} × ${dims.z}` : "Unknown"} />
                          <DatasetStat label="Voxel size" value={voxelText} />
                        </div>

                        {candidate.inspection.kind === "volume" && scales.length > 0 ? (
                          <div style={{ display: "grid", gap: 10 }}>
                            <SectionLabel>Resolution</SectionLabel>
                            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                              {scales.map((scale) => {
                                const active = selectedResolution === scale.resolutionLabel;
                                const reason = formatLocalScaleReason(scale.unsupportedReason);
                                const recommended = candidate.inspection.info.recommendedResolution === scale.resolutionLabel;
                                return (
                                  <button
                                    key={`${candidate.id}-${scale.datasetPath}`}
                                    type="button"
                                    disabled={!scale.canLoad}
                                    title={reason ?? undefined}
                                    onClick={() => scale.canLoad && setPendingImportResolution(candidate.id, scale.resolutionLabel)}
                                    style={{
                                      height: 34,
                                      padding: "0 12px",
                                      borderRadius: 999,
                                      border: active ? "1px solid rgba(92,149,230,0.88)" : scale.canLoad ? "1px solid rgba(255,255,255,0.14)" : "1px solid rgba(255,255,255,0.10)",
                                      background: active ? "rgba(92,149,230,0.26)" : scale.canLoad ? "rgba(255,255,255,0.05)" : "rgba(255,255,255,0.04)",
                                      color: scale.canLoad ? "white" : "rgba(255,255,255,0.46)",
                                      cursor: scale.canLoad ? "pointer" : "default",
                                      fontSize: 11,
                                      fontWeight: 800,
                                      display: "inline-flex",
                                      alignItems: "center",
                                      gap: 6,
                                    }}
                                  >
                                    <span>{getResolutionLabel(scale.resolutionLabel) || scale.resolutionLabel}</span>
                                    {recommended ? (
                                      <span style={{ height: 18, padding: "0 6px", borderRadius: 999, background: "rgba(255,255,255,0.10)", display: "inline-flex", alignItems: "center", fontSize: 9, letterSpacing: "0.04em" }}>
                                        BEST
                                      </span>
                                    ) : null}
                                  </button>
                                );
                              })}
                            </div>
                            {scales.some((scale) => !scale.canLoad && formatLocalScaleReason(scale.unsupportedReason)) ? (
                              <div data-theme-text="muted" style={{ fontSize: 11, opacity: 0.72, lineHeight: 1.45 }}>
                                {formatLocalScaleReason(scales.find((scale) => !scale.canLoad && formatLocalScaleReason(scale.unsupportedReason))?.unsupportedReason)}
                              </div>
                            ) : null}
                          </div>
                        ) : null}

                        {candidate.inspection.info.warning ? (
                          <div style={{ borderRadius: 10, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.03)", padding: "9px 10px", fontSize: 11, lineHeight: 1.45, opacity: 0.76 }}>
                            {candidate.inspection.info.warning}
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              ) : null}
            </div>

            <input
              ref={inputRef}
              type="file"
              multiple
              onChange={async (e) => {
                void startLocalInspection((controller) => collectDroppedEntries(null, e.target.files, {
                  signal: controller.signal,
                  onProgress: (progress) => setLocalInspectionProgress(progress),
                }));
                e.currentTarget.value = "";
              }}
              style={{ display: "none" }}
            />

            {isInspectingLocalImport && localInspectionProgress ? (
              <div
                style={{
                  position: "absolute",
                  inset: 16,
                  borderRadius: 16,
                  background: "rgba(10,12,16,0.88)",
                  border: "1px solid rgba(255,255,255,0.10)",
                  backdropFilter: "blur(8px)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  zIndex: 2,
                  padding: 20,
                }}
              >
                <div style={{ width: "min(460px, 100%)", display: "grid", gap: 14 }}>
                  <div style={{ fontSize: 15, fontWeight: 700, animation: "import-status-pulse 1.2s ease-in-out infinite" }}>Importing local data…</div>
                  <div data-theme-text="muted" style={{ fontSize: 12, opacity: 0.78, lineHeight: 1.45 }}>
                    {localInspectionProgress.message}
                  </div>
                  <div style={{ height: 10, borderRadius: 999, background: "rgba(255,255,255,0.08)", overflow: "hidden" }}>
                    <div
                      style={{
                        height: "100%",
                        width: `${Math.max(4, Math.min(100, Math.round(localInspectionProgress.percent * 100)))}%`,
                        borderRadius: 999,
                        background: "linear-gradient(90deg, rgba(92,149,230,0.9), rgba(120,190,255,0.95))",
                        transition: "width 120ms ease",
                      }}
                    />
                  </div>
                  <div style={{ fontSize: 11, opacity: 0.68 }}>
                    {Math.min(localInspectionProgress.completed, localInspectionProgress.total)} / {localInspectionProgress.total}
                  </div>
                  <div style={{ display: "flex", justifyContent: "flex-end" }}>
                    <button
                      type="button"
                      onClick={cancelLocalInspection}
                      style={{
                        height: 36,
                        padding: "0 14px",
                        borderRadius: 10,
                        border: "1px solid rgba(255,255,255,0.14)",
                        background: "rgba(255,255,255,0.06)",
                        color: "white",
                        cursor: "pointer",
                      }}
                    >
                      Cancel import
                    </button>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        )}

        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 12,
            marginTop: 18,
          }}
        >
          <div style={{ fontSize: 12, opacity: 0.62 }}>
            {panelView === "import-external"
              ? externalDraftInspection.status === "ready"
                ? "Path validated. Save it to add this reusable source."
                : externalDraftInspection.status === "inspecting"
                ? "Checking the external path and loading available metadata"
                : "Enter a public OME-Zarr path to inspect it before saving"
              : panelView !== "import-local" && (selectedExternalSources.length > 0 || selectedLocalDatasetIds.length > 0)
              ? `${selectedExternalSources.length + selectedLocalDatasetIds.length} source${selectedExternalSources.length + selectedLocalDatasetIds.length > 1 ? "s" : ""} selected`
              : panelView === "import-local"
              ? pendingLocalImports.length > 0
                ? `${pendingLocalImports.length} local import${pendingLocalImports.length > 1 ? "s" : ""} ready`
                : "Inspect files, folders, or ZIP archives before adding them"
              : "\u00A0"}
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                height: 40,
                padding: "0 14px",
                borderRadius: 10,
                border: "1px solid rgba(255,255,255,0.10)",
                background: "rgba(255,255,255,0.05)",
                color: "white",
                cursor: "pointer",
              }}
            >
              Cancel
            </button>

            {panelView === "import-local" && pendingLocalImports.length > 0 && (
              <button
                type="button"
                onClick={handleConfirmLocalImports}
                style={{
                  height: 40,
                  padding: "0 14px",
                  borderRadius: 10,
                  border: "1px solid rgba(160,220,255,0.35)",
                  background: "rgba(120,190,255,0.18)",
                  color: "white",
                  cursor: "pointer",
                }}
              >
                Add imported data
              </button>
            )}

            {panelView === "import-external" && (
              <button
                type="button"
                onClick={handleSaveExternalDraftSource}
                disabled={externalDraftInspection.status !== "ready"}
                style={{
                  height: 40,
                  padding: "0 14px",
                  borderRadius: 10,
                  border: "1px solid rgba(160,220,255,0.35)",
                  background: "rgba(120,190,255,0.18)",
                  color: "white",
                  cursor: "pointer",
                  opacity: externalDraftInspection.status !== "ready" ? 0.5 : 1,
                }}
              >
                Add external data
              </button>
            )}

            {panelView === "library" && (
              <button
                type="button"
                onClick={() => { void handleAddSelectedSources(); }}
                disabled={isSubmittingSelection || (selectedExternalSources.length === 0 && selectedLocalDatasetIds.length === 0)}
                style={{
                  height: 40,
                  padding: "0 14px",
                  borderRadius: 10,
                  border: "1px solid rgba(160,220,255,0.35)",
                  background: "rgba(120,190,255,0.18)",
                  color: "white",
                  cursor: "pointer",
                  opacity: isSubmittingSelection || (selectedExternalSources.length === 0 && selectedLocalDatasetIds.length === 0) ? 0.5 : 1,
                }}
              >
                Add layer
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
