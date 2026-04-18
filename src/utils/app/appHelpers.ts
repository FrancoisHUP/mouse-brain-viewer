import type { CSSProperties } from "react";
import type { LocalInputEntry } from "../../localDataHandlers";
import type { RemoteDataFormat } from "../../layerTypes";
import { parseViewerState, type ViewerStateV1 } from "../../viewerState";
import { readViewerStateFromHash } from "../../viewerShare";

export const ANNOTATION_RECENT_COLORS_STORAGE_KEY = "allen-viewer-annotation-recent-colors-v1";

export const secondaryButtonStyle: CSSProperties = {
  height: 34,
  padding: "0 12px",
  borderRadius: 10,
  border: "1px solid rgba(255,255,255,0.10)",
  background: "rgba(255,255,255,0.05)",
  color: "white",
  cursor: "pointer",
};

export const primaryButtonStyle: CSSProperties = {
  height: 34,
  padding: "0 12px",
  borderRadius: 10,
  border: "1px solid rgba(160,220,255,0.35)",
  background: "rgba(120,190,255,0.18)",
  color: "white",
  cursor: "pointer",
  fontWeight: 600,
};

export function createId() {
  return Math.random().toString(36).slice(2, 10);
}

export function loadRecentAnnotationColors(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(ANNOTATION_RECENT_COLORS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((value): value is string => typeof value === "string").slice(0, 10);
  } catch {
    return [];
  }
}

export function saveRecentAnnotationColors(colors: string[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(ANNOTATION_RECENT_COLORS_STORAGE_KEY, JSON.stringify(colors.slice(0, 10)));
  } catch { }
}

export function normalizeHexColor(color: string, fallback = "#ff5c5c"): string {
  const normalized = color.trim().replace("#", "");
  const safe = normalized.length === 3 ? normalized.split("").map((c) => c + c).join("") : normalized;
  return /^[0-9a-fA-F]{6}$/.test(safe) ? `#${safe.toLowerCase()}` : fallback;
}

export function detectRemoteFormat(url: string): RemoteDataFormat {
  const lower = url.toLowerCase();
  if (lower.includes(".ome.zarr")) return "ome-zarr";
  if (lower.endsWith(".obj")) return "mesh-obj";
  return "generic";
}

export function decodeBase64Url(input: string): string {
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
  const padding = normalized.length % 4 === 0 ? "" : "=".repeat(4 - (normalized.length % 4));
  return atob(normalized + padding);
}

export function readInitialStateFromLocation(): ViewerStateV1 | null {
  if (typeof window === "undefined") return null;
  try {
    const sharedState = readViewerStateFromHash();
    if (sharedState) return sharedState;
  } catch (error) {
    console.warn("Failed to parse shared viewer state from hash.", error);
  }
  const params = new URLSearchParams(window.location.search);
  const rawState = params.get("viewerState");
  if (rawState) {
    try {
      return parseViewerState(rawState);
    } catch (error) {
      console.warn("Failed to parse viewerState query parameter.", error);
    }
  }
  const rawState64 = params.get("viewerState64");
  if (rawState64) {
    try {
      return parseViewerState(decodeBase64Url(rawState64));
    } catch (error) {
      console.warn("Failed to parse viewerState64 query parameter.", error);
    }
  }
  return null;
}

export function getCurrentSharedViewerUrl(): string | null {
  if (typeof window === "undefined") return null;
  const rawHash = window.location.hash.startsWith("#") ? window.location.hash.slice(1) : window.location.hash;
  if (!rawHash) return null;
  const params = new URLSearchParams(rawHash);
  return params.get("vs") ? window.location.href : null;
}

export function dataTransferHasFiles(dataTransfer: DataTransfer | null): boolean {
  if (!dataTransfer) return false;
  return Array.from(dataTransfer.types ?? []).includes("Files");
}

export async function collectDroppedLocalEntries(items: DataTransferItemList | null, files: FileList | null): Promise<LocalInputEntry[]> {
  const output: LocalInputEntry[] = [];
  async function walkEntry(entry: any, prefix: string) {
    if (!entry) return;
    if (entry.isFile) {
      const file: File = await new Promise((resolve, reject) => entry.file(resolve, reject));
      output.push({ path: prefix ? `${prefix}/${file.name}` : file.name, file });
      return;
    }
    if (entry.isDirectory) {
      const reader = entry.createReader();
      const readBatch = (): Promise<any[]> => new Promise((resolve, reject) => reader.readEntries(resolve, reject));
      while (true) {
        const batch = await readBatch();
        if (!batch.length) break;
        for (const child of batch) await walkEntry(child, prefix ? `${prefix}/${entry.name}` : entry.name);
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
        if (file) output.push({ path: file.webkitRelativePath || file.name, file });
      }
    }
  }
  if (!usedDirectoryApi && files) {
    for (const file of Array.from(files)) output.push({ path: file.webkitRelativePath || file.name, file });
  }
  return output;
}

export function getThemeRootCss(theme: "light" | "gray" | "dark"): string {
  if (theme === "light") return `
    [data-app-theme="light"] { color: #18212b; }
    [data-app-theme="light"] button,
    [data-app-theme="light"] input,
    [data-app-theme="light"] select,
    [data-app-theme="light"] textarea {
      background: rgba(255,255,255,0.92) !important;
      color: #18212b !important;
      border-color: rgba(24,33,43,0.14) !important;
    }
    [data-app-theme="light"] [data-theme-surface="panel"] { background: rgba(245,248,252,0.96) !important; color: #18212b !important; border-color: rgba(24,33,43,0.12) !important; }
    [data-app-theme="light"] [data-theme-surface="soft"] { background: rgba(255,255,255,0.78) !important; color: #18212b !important; border-color: rgba(24,33,43,0.10) !important; }
    [data-app-theme="light"] [data-theme-text="muted"] { color: rgba(24,33,43,0.74) !important; }
    [data-app-theme="light"] [data-theme-text="strong"] { color: #18212b !important; }
  `;
  if (theme === "gray") return `
    [data-app-theme="gray"] { color: #edf1f5; }
    [data-app-theme="gray"] button,
    [data-app-theme="gray"] input,
    [data-app-theme="gray"] select,
    [data-app-theme="gray"] textarea {
      background: rgba(64,72,82,0.88) !important;
      color: #edf1f5 !important;
      border-color: rgba(255,255,255,0.12) !important;
    }
    [data-app-theme="gray"] [data-theme-surface="panel"] { background: rgba(46,52,60,0.96) !important; color: #edf1f5 !important; border-color: rgba(255,255,255,0.10) !important; }
    [data-app-theme="gray"] [data-theme-surface="soft"] { background: rgba(58,66,76,0.78) !important; color: #edf1f5 !important; border-color: rgba(255,255,255,0.10) !important; }
    [data-app-theme="gray"] [data-theme-text="muted"] { color: rgba(237,241,245,0.74) !important; }
    [data-app-theme="gray"] [data-theme-text="strong"] { color: #edf1f5 !important; }
  `;
  return `
    [data-app-theme="dark"] [data-theme-surface="panel"] { background: rgba(12,14,18,0.96) !important; color: white !important; border-color: rgba(255,255,255,0.10) !important; }
    [data-app-theme="dark"] [data-theme-surface="soft"] { background: rgba(255,255,255,0.05) !important; color: white !important; border-color: rgba(255,255,255,0.10) !important; }
    [data-app-theme="dark"] [data-theme-text="muted"] { color: rgba(255,255,255,0.74) !important; }
    [data-app-theme="dark"] [data-theme-text="strong"] { color: white !important; }
  `;
}
