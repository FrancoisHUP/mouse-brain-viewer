import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  closestCenter,
  DndContext,
  MouseSensor,
  TouchSensor,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import type { DragEndEvent, DragOverEvent, DragStartEvent } from "@dnd-kit/core";
import {
  horizontalListSortingStrategy,
  SortableContext,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { MetadataRichContent } from "./components/app/MetadataRichContent";
import type { CameraControlMode } from "./viewerState";
import type { AnnotationShape, SlicePlane } from "./layerTypes";
import type { FloatingWindowState } from "./components/app/FloatingWindowManager";
import type { BrowserResourceSummary, ResourceHistorySample, ResourceMetricId } from "./resourceTelemetry";
import { formatMetricPercent, getMetricFillColor, getMetricLabel } from "./resourceTelemetry";
import { DEFAULT_TOOLBAR_TOOL_IDS, getToolExtensionDefinition, getToolbarToolManifest, getUtilityToolExtensionDefinition, TOOLBAR_TOOL_MANIFESTS } from "./tools/registry";
import { getToolbarToolDocumentation } from "./tools/toolDocumentation";
import type { ToolId, ToolbarToolId } from "./tools/types";

declare global {
  interface Window {
    EyeDropper?: new () => {
      open: () => Promise<{ sRGBHex: string }>;
    };
  }
}

export type HistoryMenuItem = {
  id: string;
  label: string;
  meta?: string;
};

export type PipelineMenuItem = {
  id: string;
  name: string;
  description?: string;
  active: boolean;
};

export type CaptureSequenceMenuItem = {
  id: string;
  name: string;
  sceneCount: number;
  updatedAt: number;
  active?: boolean;
};

export type CaptureStillMenuItem = {
  id: string;
  name: string;
  thumbnailDataUrl?: string;
  updatedAt: number;
  active?: boolean;
};

type ToolbarButtonEntry = {
  toolId: ToolbarToolId;
  kind: "core" | "extension";
  removable: boolean;
  node: ReactNode;
};

type ToolbarRendererVariant =
  | "default"
  | "core-mouse"
  | "core-windows"
  | "annotation"
  | "capture"
  | "slice"
  | "pipeline"
  | "assistant"
  | "resources";

const TOOLBAR_TRASH_DROP_ID = "__toolbar_trash_drop__";
const TOOLBAR_REVEAL_ZONE_PX = 64;
const TOOLBAR_HIDDEN_OFFSET_PX = 82;

const PIPELINE_DESCRIPTION_MAX_CHARS = 96;

function getPipelineDescriptionPreview(description?: string): string {
  const normalized = description?.trim();
  if (!normalized) return "No description yet.";
  if (normalized.length <= PIPELINE_DESCRIPTION_MAX_CHARS) return normalized;
  return `${normalized.slice(0, PIPELINE_DESCRIPTION_MAX_CHARS - 1).trimEnd()}…`;
}

const CAMERA_MODE_OPTIONS: Array<{
  id: CameraControlMode;
  label: string;
  description: string;
}> = [
  { id: "fly", label: "Fly camera", description: "Free look + WASD movement" },
  { id: "orbit", label: "Orbit controls", description: "Rotate around the scene center" },
];

const ANNOTATION_COLORS = [
  "#ff5c5c",
  "#ff9f43",
  "#ffd166",
  "#6ddc6d",
  "#38bdf8",
  "#4f7cff",
  "#a855f7",
  "#f472b6",
  "#ffffff",
];
const UI_FONT_FAMILY = "sans-serif";

const SHAPE_GROUP_FORMS: AnnotationShape[] = ["rectangle", "circle"];
const PRIMARY_ANNOTATION_TOOLS: Array<AnnotationShape | "shape"> = [
  "point",
  "line",
  "shape",
  "freehand",
  "eraser",
];

function Icon({ id }: { id: ToolId }) {
  const common = {
    width: 20,
    height: 20,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };

  switch (id) {
    case "mouse":
      return (
        <svg {...common}>
          <path d="M8 4l8 8-4 1 2 5-2 1-2-5-3 3z" />
        </svg>
      );
    case "select":
      return (
        <svg {...common} viewBox="0 0 24 24">
          <path d="M5 3.5h3" />
          <path d="M3.5 5v3" />
          <path d="M16 3.5h3" />
          <path d="M20.5 5v3" />
          <path d="M3.5 16v3" />
          <path d="M5 20.5h3" />
          <path d="M11.5 20.5h2" />
          <path d="M20.5 11.5v2" />
          <path d="M14.5 12.5v10.7a.3.3 0 0 0 .5.2l2.95-2.95a.3.3 0 0 1 .21-.09H22a.3.3 0 0 0 .21-.51l-7.2-7.2a.3.3 0 0 0-.51.21Z" />
        </svg>
      );
    case "windows":
      return <WindowsIcon />;
    case "capture":
      return (
        <svg {...common} viewBox="0 0 24 24">
          <path d="M4.5 8.5h3l1.8-2h6.4l1.8 2h2.5A2.5 2.5 0 0 1 22.5 11v7A2.5 2.5 0 0 1 20 20.5H4A2.5 2.5 0 0 1 1.5 18v-7A2.5 2.5 0 0 1 4 8.5z" />
          <circle cx="12" cy="14" r="3.8" />
          <path d="M18.2 11.8h.01" />
        </svg>
      );
    case "pencil":
      return (
        <svg {...common}>
          <path d="M3 21l3.8-1 11-11a2.2 2.2 0 10-3.1-3.1l-11 11L3 21z" />
          <path d="M13.5 6.5l4 4" />
        </svg>
      );
    case "slice":
      return (
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M12 4.5l6 3.5-6 3.5-6-3.5 6-3.5z" />
          <path d="M6 8v8l6 3.5 6-3.5V8" />
          <path d="M12 11.5v8" />
        </svg>
      );
    case "pipeline":
      return (
        <svg {...common} strokeWidth={1.65}>
          <circle cx="9" cy="13" r="4.1" />
          <circle cx="16.4" cy="7.4" r="3" />
          <circle cx="17.1" cy="17.1" r="2.35" />
          <path d="M9 8.9v1.3" />
          <path d="M9 15.8v1.3" />
          <path d="M4.9 13h1.3" />
          <path d="M11.8 13h1.3" />
          <path d="M6.1 10.1l.9.9" />
          <path d="M11 15l.9.9" />
          <path d="M11.9 10.1l-.9.9" />
          <path d="M7 15l-.9.9" />
          <path d="M16.4 4.4v1" />
          <path d="M16.4 9.4v1" />
          <path d="M13.4 7.4h1" />
          <path d="M18.4 7.4h1" />
        </svg>
      );
    case "assistant":
      return <AssistantToolbarIcon />;
    case "resources":
      return <ResourceBarsIcon />;
    case "data":
      return (
        <svg {...common}>
          <ellipse cx="12" cy="6" rx="7" ry="3" />
          <path d="M5 6v6c0 1.7 3.1 3 7 3s7-1.3 7-3V6" />
          <path d="M5 12v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6" />
        </svg>
      );
    case "library":
      return (
        <svg {...common}>
          <path d="M3.5 7.5A2.5 2.5 0 016 5h4l2 2h6A2.5 2.5 0 0120.5 9.5v8A2.5 2.5 0 0118 20H6a2.5 2.5 0 01-2.5-2.5z" />
          <path d="M3.5 9h17" />
        </svg>
      );
    case "save":
      return (
        <svg {...common}>
          <path d="M5 4h11l3 3v13a1 1 0 01-1 1H6a1 1 0 01-1-1V4z" />
          <path d="M8 4v6h8V4" />
          <path d="M9 16h6" />
        </svg>
      );
    case "search":
      return (
        <svg {...common}>
          <circle cx="11" cy="11" r="6.5" />
          <path d="M16 16l4.5 4.5" />
        </svg>
      );
    case "export":
      return (
        <svg {...common}>
          <path d="M12 3v11" />
          <path d="M8 7l4-4 4 4" />
          <path d="M5 14v4a2 2 0 002 2h10a2 2 0 002-2v-4" />
        </svg>
      );
    case "settings":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1 1 0 00.2 1.1l.1.1a2 2 0 01-2.8 2.8l-.1-.1a1 1 0 00-1.1-.2 1 1 0 00-.6.9V21a2 2 0 01-4 0v-.2a1 1 0 00-.6-.9 1 1 0 00-1.1.2l-.1.1a2 2 0 01-2.8-2.8l.1-.1a1 1 0 00.2-1.1 1 1 0 00-.9-.6H3a2 2 0 010-4h.2a1 1 0 00.9-.6 1 1 0 00-.2-1.1l-.1-.1a2 2 0 012.8-2.8l.1.1a1 1 0 001.1.2 1 1 0 00.6-.9V3a2 2 0 014 0v.2a1 1 0 00.6.9 1 1 0 001.1-.2l.1-.1a2 2 0 012.8 2.8l-.1.1a1 1 0 00-.2 1.1 1 1 0 00.9.6H21a2 2 0 010 4h-.2a1 1 0 00-.9.6z" />
        </svg>
      );
    case "account":
      return (
        <svg {...common}>
          <circle cx="12" cy="8" r="3.5" />
          <path d="M5 20a7 7 0 0114 0" />
        </svg>
      );
    default:
      return null;
  }
}

function ResourceBarsIcon({
  cpuPercent = 0,
  gpuPercent = 0,
  ramPercent = 0,
}: {
  cpuPercent?: number;
  gpuPercent?: number;
  ramPercent?: number;
}) {
  const metrics = [
    { value: cpuPercent, x: 5 },
    { value: gpuPercent, x: 10 },
    { value: ramPercent, x: 15 },
  ];
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      {metrics.map((metric) => {
        const height = Math.max(3, (Math.max(0, Math.min(100, metric.value)) / 100) * 12);
        const y = 18 - height;
        const fill = getMetricFillColor(metric.value);
        return (
          <g key={metric.x}>
            <rect x={metric.x} y={5} width="4" height="13" rx="1.5" stroke="currentColor" strokeWidth="1.2" opacity="0.42" />
            <rect x={metric.x + 0.8} y={y} width="2.4" height={Math.max(2, height)} rx="1.2" fill={fill} />
          </g>
        );
      })}
    </svg>
  );
}

function ResourceSparkline({
  samples,
  metric,
}: {
  samples: ResourceHistorySample[];
  metric: ResourceMetricId;
}) {
  const values = samples.map((sample) =>
    metric === "cpu"
      ? sample.cpuPercent
      : metric === "gpu"
        ? sample.gpuPercent
        : sample.ramPercent
  );
  const accent = getMetricFillColor(values[values.length - 1] ?? 0);
  const path = values
    .map((value, index) => {
      const x = values.length <= 1 ? 0 : (index / (values.length - 1)) * 108;
      const y = 34 - (Math.max(0, Math.min(100, value)) / 100) * 28;
      return `${index === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <svg width="100%" height="40" viewBox="0 0 108 40" preserveAspectRatio="none">
      <line x1="0" x2="108" y1="34" y2="34" stroke="rgba(255,255,255,0.08)" strokeWidth="1" />
      <path d={path} fill="none" stroke={accent} strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ResourceToolButton({
  active,
  summary,
  samples,
  onClick,
}: {
  active: boolean;
  summary: BrowserResourceSummary | null;
  samples: ResourceHistorySample[];
  onClick: () => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const metrics = [
    { id: "cpu" as const, value: summary?.cpuPercent ?? 0 },
    { id: "gpu" as const, value: summary?.gpuPercent ?? 0 },
    { id: "ram" as const, value: summary?.ramPercent ?? 0 },
  ];

  return (
    <div
      style={{ position: "relative" }}
      onMouseEnter={() => setIsOpen(true)}
      onMouseLeave={() => setIsOpen(false)}
      onFocus={() => setIsOpen(true)}
      onBlur={(event) => {
        if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
        setIsOpen(false);
      }}
    >
      <ToolButton
        id="resources"
        label="Resource manager"
        active={active}
        onClick={onClick}
        icon={
          <ResourceBarsIcon
            cpuPercent={summary?.cpuPercent ?? 0}
            gpuPercent={summary?.gpuPercent ?? 0}
            ramPercent={summary?.ramPercent ?? 0}
          />
        }
      />
      <div
        data-theme-surface="panel"
        onClick={onClick}
        role="button"
        tabIndex={0}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onClick();
          }
        }}
        style={{
          position: "absolute",
          left: "50%",
          bottom: "calc(100% + 12px)",
          transform: isOpen ? "translate(-50%, 0)" : "translate(-50%, 8px)",
          width: 360,
          maxWidth: "min(360px, calc(100vw - 32px))",
          borderRadius: 14,
          border: "1px solid rgba(255,255,255,0.12)",
          background: "rgba(12,14,18,0.95)",
          boxShadow: "0 16px 42px rgba(0,0,0,0.42)",
          backdropFilter: "blur(14px)",
          padding: 12,
          opacity: isOpen ? 1 : 0,
          visibility: isOpen ? "visible" : "hidden",
          pointerEvents: isOpen ? "auto" : "none",
          transition: "opacity 150ms ease, transform 170ms ease, visibility 150ms ease",
          color: "white",
          fontFamily: UI_FONT_FAMILY,
          cursor: "pointer",
          display: "grid",
          gap: 10,
          zIndex: 72,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <div style={{ fontSize: 12, fontWeight: 800 }}>Resource manager</div>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.58)" }}>
            {summary?.processCount ?? 0} tasks
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8 }}>
          {metrics.map((metric) => (
            <div
              key={metric.id}
              style={{
                borderRadius: 10,
                border: "1px solid rgba(255,255,255,0.08)",
                background: "rgba(255,255,255,0.04)",
                padding: 8,
                display: "grid",
                gap: 6,
              }}
            >
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 6 }}>
                <span style={{ fontSize: 10, fontWeight: 800, color: "rgba(255,255,255,0.70)" }}>
                  {getMetricLabel(metric.id)}
                </span>
                <span style={{ fontSize: 11, fontWeight: 900, color: getMetricFillColor(metric.value) }}>
                  {formatMetricPercent(metric.value)}
                </span>
              </div>
              <ResourceSparkline samples={samples} metric={metric.id} />
            </div>
          ))}
        </div>
        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.58)", lineHeight: 1.45 }}>
          Click to open the full browser resource panel and manage tracked workers or local assistant tasks.
        </div>
      </div>
    </div>
  );
}

function AssistantToolbarIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" />
      <path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z" />
    </svg>
  );
}

function AssistantToolButton({
  active,
  onClick,
  onSubmit,
}: {
  active: boolean;
  onClick: () => void;
  onSubmit: (prompt: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [prompt, setPrompt] = useState("");
  const closeTimeoutRef = useRef<number | null>(null);

  function showMenu() {
    if (closeTimeoutRef.current !== null) {
      window.clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }
    setOpen(true);
  }

  function scheduleClose() {
    if (closeTimeoutRef.current !== null) window.clearTimeout(closeTimeoutRef.current);
    closeTimeoutRef.current = window.setTimeout(() => {
      if (!prompt.trim()) setOpen(false);
    }, 220);
  }

  function submit() {
    const trimmed = prompt.trim();
    if (!trimmed) return;
    setPrompt("");
    setOpen(false);
    onSubmit(trimmed);
  }

  return (
    <div
      style={{ position: "relative" }}
      onMouseEnter={showMenu}
      onMouseLeave={scheduleClose}
    >
      <ToolButton id="assistant" label="Assistant" active={active} onClick={onClick} icon={<AssistantToolbarIcon />} />
      {open ? (
        <div
          data-theme-surface="panel"
          style={{
            position: "absolute",
            left: "50%",
            bottom: "calc(100% + 12px)",
            transform: "translateX(-50%)",
            width: 340,
            borderRadius: 12,
            border: "1px solid rgba(255,255,255,0.12)",
            background: "rgba(12,14,18,0.96)",
            color: "white",
            boxShadow: "0 16px 40px rgba(0,0,0,0.40)",
            backdropFilter: "blur(14px)",
            padding: 10,
            display: "grid",
            gap: 8,
            fontFamily: UI_FONT_FAMILY,
            zIndex: 70,
          }}
          onMouseEnter={showMenu}
          onMouseLeave={scheduleClose}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <div style={{ fontSize: 12, fontWeight: 900 }}>Ask assistant</div>
          <textarea
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== "Enter" || event.shiftKey) return;
              event.preventDefault();
              submit();
            }}
            placeholder="Ask a quick question..."
            rows={3}
            style={{
              width: "100%",
              boxSizing: "border-box",
              borderRadius: 8,
              border: "1px solid rgba(255,255,255,0.12)",
              background: "rgba(255,255,255,0.06)",
              color: "white",
              padding: "9px 10px",
              fontSize: 13,
              lineHeight: 1.35,
              outline: "none",
              resize: "none",
              fontFamily: UI_FONT_FAMILY,
            }}
          />
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <button
              type="button"
              onClick={submit}
              disabled={!prompt.trim()}
              style={{
                minHeight: 30,
                borderRadius: 8,
                border: "1px solid rgba(120,190,255,0.42)",
                background: "rgba(120,190,255,0.16)",
                color: "white",
                padding: "0 12px",
                cursor: prompt.trim() ? "pointer" : "not-allowed",
                opacity: prompt.trim() ? 1 : 0.55,
                fontSize: 12,
                fontWeight: 800,
                fontFamily: UI_FONT_FAMILY,
              }}
            >
              Send
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function AnnotationModeIcon({ shape }: { shape: AnnotationShape | "shape" }) {
  const common = {
    width: 18,
    height: 18,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };

  switch (shape) {
    case "point":
      return <svg {...common}><circle cx="12" cy="12" r="4.25" /></svg>;
    case "line":
      return <svg {...common}><path d="M5 19L19 5" /><circle cx="5" cy="19" r="2" /><circle cx="19" cy="5" r="2" /></svg>;
    case "rectangle":
      return <svg {...common}><rect x="5" y="7" width="14" height="10" rx="1.5" /></svg>;
    case "circle":
      return <svg {...common}><circle cx="12" cy="12" r="6.5" /></svg>;
    case "note":
      return (
        <svg {...common}>
          <path d="M6 4.5h9l3 3V19a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V5.5a1 1 0 0 1 1-1z" />
          <path d="M15 4.5V8h3" />
          <path d="M8 11h8" />
          <path d="M8 15h6" />
        </svg>
      );
    case "freehand":
      return <svg {...common}><path d="M5 16c2-5 4-8 6-8 2.5 0 2.5 6 5 6 1.1 0 2-.8 3-2" /></svg>;
    case "shape":
      return (
        <svg {...common}>
          <rect x="5" y="5" width="9.5" height="9.5" rx="1.6" />
          <circle cx="15.2" cy="15.2" r="4.8" />
        </svg>
      );
    case "eraser":
      return (
        <svg {...common}>
          <path d="M6.5 13.5l6.5-6.5a2 2 0 012.8 0l4.2 4.2a2 2 0 010 2.8l-4 4a2 2 0 01-1.4.6H10a2 2 0 01-1.4-.6l-2.1-2.1a2 2 0 010-2.8z" />
          <path d="M13.5 20H21" />
          <path d="M10.5 10.5l5 5" />
        </svg>
      );
    default:
      return null;
  }
}

function EyeDropperIcon() {
  return (
    <svg
      width="17"
      height="17"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M11 7l6 6" />
      <path d="M19 5a2 2 0 00-2.8 0L7 14.2 4 20l5.8-3 9.2-9.2A2 2 0 0019 5z" />
      <path d="M15 9l-6 6" />
    </svg>
  );
}

function HistoryIcon({ direction }: { direction: "undo" | "redo" }) {
  const isRedo = direction === "redo";
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" style={{ transform: isRedo ? "scaleX(-1)" : "none" }}>
      <path d="M10 7L5 12L10 17" />
      <path d="M6 12H14C17.314 12 20 14.686 20 18" />
    </svg>
  );
}

function RecenterIcon({ size = 15 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="1.6" />
      <path d="M12 2.75v3.75" />
      <path d="M9.9 5.1L12 7.2 14.1 5.1" />
      <path d="M21.25 12h-3.75" />
      <path d="M18.9 9.9L16.8 12 18.9 14.1" />
      <path d="M12 21.25v-3.75" />
      <path d="M9.9 18.9L12 16.8 14.1 18.9" />
      <path d="M2.75 12h3.75" />
      <path d="M5.1 9.9L7.2 12 5.1 14.1" />
    </svg>
  );
}

function ResetTransformIcon({ size = 14 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M20 11a8 8 0 10-2.34 5.66" />
      <path d="M20 4v7h-7" />
    </svg>
  );
}

function ToolButton({ id, label, active, onClick, icon }: { id: ToolId; label: string; active: boolean; onClick: () => void; icon?: ReactNode; }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      style={{
        width: 44,
        height: 44,
        borderRadius: 14,
        border: active ? "1px solid rgba(120,190,255,0.75)" : "1px solid rgba(255,255,255,0.08)",
        background: active ? "rgba(120,190,255,0.18)" : "rgba(255,255,255,0.03)",
        color: active ? "#d7eeff" : "rgba(255,255,255,0.82)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: "pointer",
        transition: "all 160ms ease",
      }}
    >
      {icon ?? <Icon id={id} />}
    </button>
  );
}

function BackSmallIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M15 18l-6-6 6-6" />
    </svg>
  );
}

function SearchSmallIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="11" cy="11" r="6.5" />
      <path d="M16 16l4.5 4.5" />
    </svg>
  );
}

function ToolExplorerIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="4" y="4" width="6" height="6" rx="1.5" />
      <rect x="14" y="4" width="6" height="6" rx="1.5" />
      <rect x="4" y="14" width="6" height="6" rx="1.5" />
      <rect x="14" y="14" width="6" height="6" rx="1.5" />
    </svg>
  );
}

function TrashSmallIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 7h16" />
      <path d="M9 7V4.8c0-.4.3-.8.8-.8h4.4c.5 0 .8.4.8.8V7" />
      <path d="M7.2 7l.7 11.1c0 1 .8 1.9 1.9 1.9h4.4c1 0 1.8-.8 1.9-1.9L16.8 7" />
      <path d="M10 11.2v4.8" />
      <path d="M14 11.2v4.8" />
    </svg>
  );
}

function formatToolKindLabel(kind: "core" | "extension") {
  return kind === "core" ? "Core" : "Extension";
}

function formatToolStatusLabel(status: "stable" | "beta") {
  return status === "beta" ? "Beta" : "Stable";
}

function formatToolSourceLabel(source: "built-in" | "contributed") {
  return source === "contributed" ? "Contributed" : "Built-in";
}

function ToolTag({
  label,
  tone = "default",
}: {
  label: string;
  tone?: "default" | "beta" | "accent";
}) {
  const palette =
    tone === "beta"
      ? {
          border: "1px solid rgba(255,196,92,0.22)",
          background: "rgba(255,196,92,0.10)",
          color: "rgba(255,231,179,0.96)",
        }
      : tone === "accent"
        ? {
            border: "1px solid rgba(120,190,255,0.22)",
            background: "rgba(120,190,255,0.12)",
            color: "rgba(218,240,255,0.96)",
          }
        : {
            border: "1px solid rgba(255,255,255,0.10)",
            background: "rgba(255,255,255,0.05)",
            color: "rgba(255,255,255,0.74)",
          };

  return (
    <span
      style={{
        minHeight: 18,
        padding: "0 7px",
        borderRadius: 999,
        display: "inline-flex",
        alignItems: "center",
        lineHeight: 1,
        fontSize: 9,
        fontWeight: 800,
        letterSpacing: 0.2,
        ...palette,
      }}
    >
      {label}
    </span>
  );
}

function SortableToolbarItem({
  entry,
  isDropTarget,
  children,
}: {
  entry: ToolbarButtonEntry;
  isDropTarget: boolean;
  children: ReactNode;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: entry.toolId });

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      style={{
        position: "relative",
        display: "flex",
        alignItems: "center",
        borderRadius: 16,
        padding: 3,
        outline: isDropTarget ? "2px solid rgba(120,190,255,0.72)" : "none",
        outlineOffset: 2,
        opacity: isDragging ? 0.42 : 1,
        transform: CSS.Transform.toString(transform),
        transition,
        cursor: isDragging ? "grabbing" : "grab",
      }}
    >
      <div ref={setActivatorNodeRef} style={{ pointerEvents: "auto" }}>
        {children}
      </div>
    </div>
  );
}

function ToolbarTrashDropTarget({
  activeTool,
}: {
  activeTool: ToolbarButtonEntry | null;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: TOOLBAR_TRASH_DROP_ID,
    disabled: !activeTool?.removable,
  });
  const isActiveRemovableTool = Boolean(activeTool?.removable);
  return (
    <div
      ref={setNodeRef}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <button
        type="button"
        title={
          activeTool
            ? activeTool.removable
              ? `Remove ${getToolbarToolManifest(activeTool.toolId).label} from toolbar`
              : `${getToolbarToolManifest(activeTool.toolId).label} cannot be removed`
            : "Remove tool from toolbar"
        }
        aria-label={
          activeTool
            ? activeTool.removable
              ? `Remove ${getToolbarToolManifest(activeTool.toolId).label} from toolbar`
              : `${getToolbarToolManifest(activeTool.toolId).label} cannot be removed`
            : "Remove tool from toolbar"
        }
        style={{
          height: 36,
          width: 36,
          borderRadius: 12,
          border: activeTool
            ? activeTool.removable
              ? isOver
                ? "1px solid rgba(255,120,120,0.88)"
                : "1px solid rgba(255,140,140,0.30)"
              : "1px solid rgba(255,255,255,0.10)"
            : "1px solid rgba(255,255,255,0.06)",
          background: activeTool
            ? activeTool.removable
              ? isOver
                ? "linear-gradient(180deg, rgba(225,82,82,0.50), rgba(176,42,42,0.72))"
                : "rgba(180,68,68,0.16)"
              : "rgba(255,255,255,0.04)"
            : "rgba(255,255,255,0.02)",
          color: activeTool
            ? activeTool.removable
              ? isOver
                ? "#ffffff"
                : "rgba(255,225,225,0.96)"
              : "rgba(255,255,255,0.56)"
            : "rgba(255,255,255,0.22)",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: activeTool ? (activeTool.removable ? "copy" : "not-allowed") : "default",
          transition: "all 160ms ease",
          boxShadow:
            activeTool && isOver
              ? "0 0 0 4px rgba(255,90,90,0.18), 0 14px 28px rgba(120,12,12,0.35)"
              : "none",
          transform: activeTool && isOver ? "scale(1.1) translateY(-1px)" : "scale(1)",
          opacity: activeTool ? 1 : 0,
          pointerEvents: activeTool ? "auto" : "none",
          overflow: "hidden",
        }}
      >
        <span
          aria-hidden="true"
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            transform: isActiveRemovableTool && isOver ? "scale(1.12)" : "scale(1)",
            transition: "transform 160ms ease",
            filter: isActiveRemovableTool && isOver ? "drop-shadow(0 0 10px rgba(255,255,255,0.18))" : "none",
          }}
        >
          <TrashSmallIcon />
        </span>
      </button>
    </div>
  );
}


function PipelineToolButton({
  active,
  pipelines,
  onClick,
  onOpenPipeline,
  onTogglePipeline,
}: {
  active: boolean;
  pipelines: PipelineMenuItem[];
  onClick: () => void;
  onOpenPipeline: (pipelineId: string) => void;
  onTogglePipeline: (pipelineId: string, active: boolean) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const pipelineCount = pipelines.length;
  const activePipelineCount = pipelines.filter((pipeline) => pipeline.active).length;
  const hasActive = activePipelineCount > 0;
  const pipelinePanelWidth = pipelineCount <= 1 ? 240 : pipelineCount === 2 ? 438 : 640;
  const pipelineGridColumns = pipelineCount <= 1 ? "minmax(0, 220px)" : "repeat(2, minmax(190px, 1fr))";
  const pipelineGridScrollable = pipelineCount > 4;

  return (
    <div
      style={{ position: "relative" }}
      onMouseEnter={() => setIsOpen(true)}
      onMouseLeave={() => setIsOpen(false)}
      onFocus={() => setIsOpen(true)}
      onBlur={(event) => {
        if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
        setIsOpen(false);
      }}
    >
      <button
        type="button"
        onClick={onClick}
        title="Automation pipelines"
        aria-label="Automation pipelines"
        style={{
          width: 44,
          height: 44,
          borderRadius: 14,
          border: active ? "1px solid rgba(120,190,255,0.75)" : "1px solid rgba(255,255,255,0.08)",
          background: active ? "rgba(120,190,255,0.18)" : "rgba(255,255,255,0.03)",
          color: active ? "#d7eeff" : "rgba(255,255,255,0.82)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: "pointer",
          transition: "all 160ms ease",
          position: "relative",
        }}
      >
        <Icon id="pipeline" />
        {hasActive ? (
          <span
            aria-hidden="true"
            style={{
              position: "absolute",
              right: 5,
              top: 5,
              minWidth: 16,
              height: 16,
              borderRadius: 999,
              background: "rgba(120,190,255,0.96)",
              color: "#07111d",
              fontSize: 10,
              fontWeight: 900,
              lineHeight: "16px",
              textAlign: "center",
              padding: "0 4px",
              boxSizing: "border-box",
            }}
          >
            {activePipelineCount}
          </span>
        ) : null}
      </button>

      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          left: -12,
          right: -12,
          bottom: "100%",
          height: 14,
          pointerEvents: isOpen ? "auto" : "none",
        }}
      />
      <div
        data-theme-surface="panel"
        style={{
          position: "absolute",
          left: "50%",
          bottom: "calc(100% + 12px)",
          transform: isOpen ? "translate(-50%, 0)" : "translate(-50%, 8px)",
          width: pipelinePanelWidth,
          maxWidth: "min(640px, calc(100vw - 32px))",
          borderRadius: 8,
          border: "1px solid rgba(255,255,255,0.12)",
          background: "rgba(12,14,18,0.94)",
          boxShadow: "0 16px 42px rgba(0,0,0,0.42)",
          backdropFilter: "blur(14px)",
          padding: 10,
          opacity: isOpen ? 1 : 0,
          visibility: isOpen ? "visible" : "hidden",
          pointerEvents: isOpen ? "auto" : "none",
          transition: "opacity 150ms ease, transform 170ms ease, visibility 150ms ease",
          color: "white",
          fontFamily: UI_FONT_FAMILY,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
          <div style={{ fontSize: 12, fontWeight: 800 }}>Automation</div>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.58)" }}>
            {activePipelineCount}/{pipelineCount} active
          </div>
        </div>
        <div
          style={{
            marginTop: 8,
            display: "grid",
            gridTemplateColumns: pipelineGridColumns,
            gap: 8,
            maxHeight: pipelineGridScrollable ? 304 : "none",
            overflowY: pipelineGridScrollable ? "auto" : "visible",
            overflowX: "hidden",
            paddingRight: pipelineGridScrollable ? 4 : 0,
          }}
        >
          {pipelines.length > 0 ? (
            pipelines.map((pipeline) => {
              const description = getPipelineDescriptionPreview(pipeline.description);

              return (
                <div
                  key={pipeline.id}
                  style={{
                    position: "relative",
                    minWidth: 0,
                    borderRadius: 8,
                    background: "rgba(255,255,255,0.05)",
                    padding: "8px 48px 8px 8px",
                  }}
                >
                  <button
                    type="button"
                    onClick={() => onOpenPipeline(pipeline.id)}
                    style={{
                      border: "none",
                      background: "transparent",
                      color: "rgba(255,255,255,0.92)",
                      padding: 0,
                      textAlign: "left",
                      fontFamily: UI_FONT_FAMILY,
                      cursor: "pointer",
                      minWidth: 0,
                    }}
                  >
                    <div style={{ fontSize: 12, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{pipeline.name}</div>
                    <div
                      title={pipeline.description?.trim() || description}
                      style={{
                        marginTop: 4,
                        minHeight: 30,
                        color: "rgba(255,255,255,0.58)",
                        fontSize: 11,
                        fontWeight: 500,
                        lineHeight: 1.35,
                        display: "-webkit-box",
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: "vertical",
                        overflow: "hidden",
                      }}
                    >
                      {description}
                    </div>
                  </button>
                  <button
                    type="button"
                    aria-label={`${pipeline.active ? "Disable" : "Enable"} ${pipeline.name}`}
                    title={pipeline.active ? "Disable automation" : "Enable automation"}
                    onClick={(event) => {
                      event.stopPropagation();
                      onTogglePipeline(pipeline.id, !pipeline.active);
                    }}
                    style={{
                      position: "absolute",
                      top: 8,
                      right: 8,
                      width: 34,
                      height: 20,
                      borderRadius: 999,
                      border: pipeline.active ? "1px solid rgba(120,190,255,0.58)" : "1px solid rgba(255,255,255,0.12)",
                      background: pipeline.active ? "rgba(120,190,255,0.22)" : "rgba(255,255,255,0.07)",
                      padding: 2,
                      cursor: "pointer",
                      display: "flex",
                      justifyContent: pipeline.active ? "flex-end" : "flex-start",
                      fontFamily: UI_FONT_FAMILY,
                    }}
                  >
                    <span style={{ width: 14, height: 14, borderRadius: 999, background: pipeline.active ? "rgba(160,215,255,0.96)" : "rgba(255,255,255,0.42)" }} />
                  </button>
                </div>
              );
            })
          ) : (
            <div style={{ flex: "1 1 auto", borderRadius: 8, background: "rgba(255,255,255,0.05)", padding: "8px 10px", fontSize: 12, color: "rgba(255,255,255,0.62)" }}>
              No pipelines
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function CapturePlaybackIcon({ kind }: { kind: "play" | "pause" | "stop" | "loop" }) {
  if (kind === "play") {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M8 6.5v11l9-5.5z" />
      </svg>
    );
  }
  if (kind === "pause") {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <rect x="7" y="6" width="3.5" height="12" rx="1" />
        <rect x="13.5" y="6" width="3.5" height="12" rx="1" />
      </svg>
    );
  }
  if (kind === "stop") {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <rect x="7" y="7" width="10" height="10" rx="2" />
      </svg>
    );
  }
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 12a8 8 0 1 1-2.34-5.66" />
      <path d="M20 4v5h-5" />
    </svg>
  );
}

function CaptureStillIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4.5 8.5h3l1.8-2h6.4l1.8 2h2.5A2.5 2.5 0 0 1 22.5 11v7A2.5 2.5 0 0 1 20 20.5H4A2.5 2.5 0 0 1 1.5 18v-7A2.5 2.5 0 0 1 4 8.5z" />
      <circle cx="12" cy="14" r="3.8" />
      <path d="M18.2 11.8h.01" />
    </svg>
  );
}

function CaptureRecordIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3.5" y="6.5" width="13" height="11" rx="2.5" />
      <path d="M16.5 10.1l4-2.4v8.6l-4-2.4" />
      <circle cx="9.9" cy="12" r="2.2" fill="currentColor" stroke="none" />
    </svg>
  );
}

function CaptureToolButton({
  active,
  onOpenEditor,
  onCreateSequence,
  onExportFrame,
  canExportFrame,
  exportPending,
  isPlaybackActive,
  isPlaybackPaused,
  onTogglePlayback,
  onStopPlayback,
  stills,
  sequences,
  onLoadStill,
  onDownloadStill,
  onDeleteStill,
  onLoadSequence,
  onPlaySequence,
  onLoopSequence,
  onRenameSequence,
  onDeleteSequence,
}: {
  active: boolean;
  onOpenEditor: () => void;
  onCreateSequence: () => void;
  onExportFrame: () => void;
  canExportFrame: boolean;
  exportPending: boolean;
  isPlaybackActive: boolean;
  isPlaybackPaused: boolean;
  onTogglePlayback: () => void;
  onStopPlayback: () => void;
  stills: CaptureStillMenuItem[];
  sequences: CaptureSequenceMenuItem[];
  onLoadStill: (stillId: string) => void;
  onDownloadStill: (stillId: string) => void;
  onDeleteStill: (stillId: string) => void;
  onLoadSequence: (sequenceId: string) => void;
  onPlaySequence: (sequenceId: string) => void;
  onLoopSequence: (sequenceId: string) => void;
  onRenameSequence: (sequenceId: string, nextName: string) => void;
  onDeleteSequence: (sequenceId: string) => void;
}) {
  const [isHovered, setIsHovered] = useState(false);
  const [openMenuSequenceId, setOpenMenuSequenceId] = useState<string | null>(null);
  const [renameSequenceId, setRenameSequenceId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [confirmDeleteSequence, setConfirmDeleteSequence] = useState<CaptureSequenceMenuItem | null>(null);
  const [menuPosition, setMenuPosition] = useState<{ top: number; left: number } | null>(null);
  const buttonLabel = isPlaybackActive ? "Pause animation" : isPlaybackPaused ? "Resume animation" : "Capture image";
  const keepCaptureMenuOpen = isHovered || openMenuSequenceId !== null || renameSequenceId !== null || confirmDeleteSequence !== null;
  const buttonIcon = isPlaybackActive ? (
    <CapturePlaybackIcon kind="pause" />
  ) : isPlaybackPaused ? (
    <CapturePlaybackIcon kind="play" />
  ) : undefined;

  useEffect(() => {
    function handlePointerDown(event: PointerEvent) {
      const target = event.target as HTMLElement | null;
      if (!target) return;
      if (!target.closest("[data-capture-sequence-menu-container='true']") && !target.closest("[data-capture-sequence-menu-popup='true']")) {
        setOpenMenuSequenceId(null);
        setMenuPosition(null);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, []);

  function handleStartRename(sequence: CaptureSequenceMenuItem) {
    setOpenMenuSequenceId(null);
    setRenameSequenceId(sequence.id);
    setRenameValue(sequence.name);
    setConfirmDeleteSequence(null);
    setMenuPosition(null);
  }

  function handleCommitRename(sequenceId: string) {
    const nextName = renameValue.trim();
    if (nextName) {
      onRenameSequence(sequenceId, nextName);
    }
    setRenameSequenceId(null);
    setOpenMenuSequenceId(null);
    setConfirmDeleteSequence(null);
    setMenuPosition(null);
    setRenameValue("");
  }

  function handleCancelRename() {
    setRenameSequenceId(null);
    setRenameValue("");
  }

  function handleOpenSequenceMenu(sequenceId: string, button: HTMLButtonElement) {
    if (openMenuSequenceId === sequenceId) {
      setOpenMenuSequenceId(null);
      setMenuPosition(null);
      return;
    }
    const rect = button.getBoundingClientRect();
    const menuWidth = 176;
    const estimatedMenuHeight = 84;
    const gap = 6;
    let left = rect.right - menuWidth;
    let top = rect.bottom + gap;
    if (left < 8) left = 8;
    if (left + menuWidth > window.innerWidth - 8) left = window.innerWidth - menuWidth - 8;
    if (top + estimatedMenuHeight > window.innerHeight - 8) top = Math.max(8, rect.bottom - estimatedMenuHeight);
    if (top < 8) top = 8;
    setOpenMenuSequenceId(sequenceId);
    setConfirmDeleteSequence(null);
    setMenuPosition({ top, left });
  }

  return (
    <div
      style={{ position: "relative", paddingTop: 4 }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => {
        setIsHovered(false);
      }}
    >
      <ToolButton
        id="capture"
        label={buttonLabel}
        active={active}
        onClick={isPlaybackActive || isPlaybackPaused ? onTogglePlayback : onOpenEditor}
        icon={buttonIcon}
      />
      <div
        data-theme-surface="panel"
        style={{
          position: "absolute",
          left: "50%",
          bottom: "calc(100% - 2px)",
          transform: keepCaptureMenuOpen ? "translate(-50%, 0)" : "translate(-50%, 8px)",
          width: 320,
          borderRadius: 14,
          border: "1px solid rgba(255,255,255,0.10)",
          background: "rgba(12,14,18,0.96)",
          boxShadow: "0 16px 40px rgba(0,0,0,0.40)",
          backdropFilter: "blur(14px)",
          padding: 12,
          color: "white",
          opacity: keepCaptureMenuOpen ? 1 : 0,
          visibility: keepCaptureMenuOpen ? "visible" : "hidden",
          pointerEvents: keepCaptureMenuOpen ? "auto" : "none",
          transition: "opacity 170ms ease, transform 190ms ease, visibility 170ms ease",
          zIndex: 70,
          display: "grid",
          gap: 8,
          fontFamily: UI_FONT_FAMILY,
        }}
      >
        {(isPlaybackActive || isPlaybackPaused) ? (
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onStopPlayback();
              }}
              style={{
                width: 28,
                height: 28,
                borderRadius: 8,
                border: "1px solid rgba(255,255,255,0.10)",
                background: "rgba(255,255,255,0.08)",
                color: "white",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
              }}
            >
              <CapturePlaybackIcon kind="stop" />
            </button>
          </div>
        ) : null}
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onExportFrame();
          }}
          disabled={!canExportFrame || exportPending}
          style={{
            minHeight: 34,
            borderRadius: 9,
            border: "1px solid rgba(255,255,255,0.10)",
            background: "rgba(255,255,255,0.08)",
            color: "white",
            fontSize: 12,
            fontWeight: 800,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            cursor: !canExportFrame || exportPending ? "not-allowed" : "pointer",
            opacity: !canExportFrame || exportPending ? 0.58 : 1,
          }}
        >
          <CaptureStillIcon />
          <span>{exportPending ? "Capturing..." : "Screen shot"}</span>
        </button>
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onCreateSequence();
          }}
          style={{
            minHeight: 34,
            borderRadius: 9,
            border: "1px solid rgba(120,190,255,0.28)",
            background: "rgba(120,190,255,0.18)",
            color: "white",
            fontSize: 12,
            fontWeight: 800,
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
          }}
        >
          <CaptureRecordIcon />
          <span>Record animation</span>
        </button>
        {stills.length || sequences.length ? (
          <div style={{ height: 1, background: "rgba(255,255,255,0.08)" }} />
        ) : null}
        {stills.length ? (
          <div style={{ display: "grid", gap: 8 }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: "rgba(255,255,255,0.62)", textTransform: "uppercase", letterSpacing: 0.5 }}>
              Screen shots
            </div>
            <div style={{ display: "grid", gap: 8, maxHeight: 204, overflowY: "auto", paddingRight: 2 }}>
              {stills.map((still) => (
                <div
                  key={still.id}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "60px minmax(0, 1fr) auto auto",
                    gap: 8,
                    alignItems: "center",
                    borderRadius: 10,
                    border: still.active ? "1px solid rgba(120,190,255,0.28)" : "1px solid rgba(255,255,255,0.08)",
                    background: still.active ? "rgba(120,190,255,0.10)" : "rgba(255,255,255,0.04)",
                    padding: 8,
                  }}
                >
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      onLoadStill(still.id);
                    }}
                    style={{
                      width: 60,
                      height: 42,
                      borderRadius: 8,
                      border: "1px solid rgba(255,255,255,0.10)",
                      background: still.thumbnailDataUrl ? `center / cover no-repeat url(${still.thumbnailDataUrl})` : "rgba(255,255,255,0.08)",
                      cursor: "pointer",
                      padding: 0,
                    }}
                    aria-label={`Open ${still.name}`}
                    title="Open saved screen shot"
                  />
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      onLoadStill(still.id);
                    }}
                    style={{
                      border: "none",
                      background: "transparent",
                      color: "white",
                      textAlign: "left",
                      display: "grid",
                      gap: 2,
                      cursor: "pointer",
                      minWidth: 0,
                      padding: 0,
                    }}
                  >
                    <span style={{ fontSize: 12, fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {still.name}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      onDownloadStill(still.id);
                    }}
                    title="Download screen shot"
                    aria-label="Download screen shot"
                    style={{
                      width: 30,
                      height: 30,
                      borderRadius: 8,
                      border: "1px solid rgba(255,255,255,0.10)",
                      background: "rgba(255,255,255,0.08)",
                      color: "white",
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      cursor: "pointer",
                    }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M12 3v11" />
                      <path d="M8 10l4 4 4-4" />
                      <path d="M5 20h14" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      onDeleteStill(still.id);
                    }}
                    title="Delete screen shot"
                    aria-label="Delete screen shot"
                    style={{
                      width: 30,
                      height: 30,
                      borderRadius: 8,
                      border: "1px solid rgba(255,255,255,0.10)",
                      background: "rgba(255,255,255,0.08)",
                      color: "rgba(255,160,160,0.92)",
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      cursor: "pointer",
                    }}
                  >
                    <span style={{ fontSize: 14, lineHeight: 1 }}>✕</span>
                  </button>
                </div>
              ))}
            </div>
          </div>
        ) : null}
        {stills.length && sequences.length ? (
          <div style={{ height: 1, background: "rgba(255,255,255,0.08)" }} />
        ) : null}
        {sequences.length ? (
          <div style={{ display: "grid", gap: 8, maxHeight: 260, overflowY: "auto", paddingRight: 2 }}>
            {sequences.map((sequence) => (
            <div
              key={sequence.id}
              style={{
                display: "grid",
                gridTemplateColumns: "auto auto minmax(0, 1fr) auto",
                gap: 8,
                alignItems: "center",
                borderRadius: 10,
                border: sequence.active ? "1px solid rgba(120,190,255,0.28)" : "1px solid rgba(255,255,255,0.08)",
                background: sequence.active ? "rgba(120,190,255,0.10)" : "rgba(255,255,255,0.04)",
                padding: 8,
                position: "relative",
              }}
            >
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  onPlaySequence(sequence.id);
                }}
                title="Play animation"
                aria-label="Play animation"
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: 8,
                  border: "1px solid rgba(255,255,255,0.10)",
                  background: "rgba(255,255,255,0.08)",
                  color: "white",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "pointer",
                }}
              >
                <CapturePlaybackIcon kind="play" />
              </button>
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  onLoopSequence(sequence.id);
                }}
                title="Loop animation"
                aria-label="Loop animation"
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: 8,
                  border: "1px solid rgba(255,255,255,0.10)",
                  background: "rgba(255,255,255,0.08)",
                  color: "white",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "pointer",
                }}
              >
                <CapturePlaybackIcon kind="loop" />
              </button>
              {renameSequenceId === sequence.id ? (
                <div
                  style={{
                    display: "grid",
                    gap: 2,
                    minWidth: 0,
                  }}
                >
                  <input
                    autoFocus
                    data-shortcut-capture="true"
                    value={renameValue}
                    onChange={(event) => setRenameValue(event.target.value)}
                    onClick={(event) => event.stopPropagation()}
                    onBlur={() => handleCommitRename(sequence.id)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        handleCommitRename(sequence.id);
                      } else if (event.key === "Escape") {
                        event.preventDefault();
                        handleCancelRename();
                      }
                    }}
                    style={{
                      width: "100%",
                      height: 32,
                      borderRadius: 8,
                      border: "1px solid rgba(160,220,255,0.45)",
                      background: "rgba(255,255,255,0.07)",
                      color: "white",
                      padding: "0 10px",
                      boxSizing: "border-box",
                      outline: "none",
                      fontSize: 12,
                      fontWeight: 700,
                    }}
                  />
                  <span style={{ fontSize: 10, color: "rgba(255,255,255,0.58)" }}>
                    {sequence.sceneCount} {sequence.sceneCount === 1 ? "scene" : "scenes"}
                  </span>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    onLoadSequence(sequence.id);
                  }}
                  style={{
                    border: "none",
                    background: "transparent",
                    color: "white",
                    textAlign: "left",
                    display: "grid",
                    gap: 2,
                    cursor: "pointer",
                    minWidth: 0,
                    padding: 0,
                  }}
                >
                  <span style={{ fontSize: 12, fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {sequence.name}
                  </span>
                  <span style={{ fontSize: 10, color: "rgba(255,255,255,0.58)" }}>
                    {sequence.sceneCount} {sequence.sceneCount === 1 ? "scene" : "scenes"}
                  </span>
                </button>
              )}
              <div data-capture-sequence-menu-container="true" style={{ position: "relative" }}>
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    setRenameSequenceId(null);
                    setRenameValue(sequence.name);
                    handleOpenSequenceMenu(sequence.id, event.currentTarget);
                  }}
                  title="Animation options"
                  aria-label="Animation options"
                  style={{
                    width: 30,
                    height: 30,
                    borderRadius: 8,
                    border: "1px solid rgba(255,255,255,0.10)",
                    background: "rgba(255,255,255,0.08)",
                    color: "white",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    cursor: "pointer",
                  }}
                >
                  <span style={{ fontSize: 16, lineHeight: 1 }}>⋮</span>
                </button>
              </div>
            </div>
          ))}
          </div>
        ) : null}
      </div>
        {openMenuSequenceId && menuPosition && typeof document !== "undefined"
          ? createPortal(
            <div
              data-theme-surface="panel"
              data-capture-sequence-menu-popup="true"
              style={{
                position: "fixed",
                top: menuPosition.top,
                left: menuPosition.left,
                minWidth: 176,
                borderRadius: 12,
                border: "1px solid rgba(255,255,255,0.10)",
                background: "rgba(12,14,18,0.98)",
                boxShadow: "0 20px 40px rgba(0,0,0,0.42)",
                padding: 8,
                display: "grid",
                gap: 6,
                zIndex: 9999,
              }}
              onPointerDown={(event) => event.stopPropagation()}
            >
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  const sequence = sequences.find((item) => item.id === openMenuSequenceId);
                  if (sequence) {
                    handleStartRename(sequence);
                  }
                }}
                style={{
                  minHeight: 32,
                  borderRadius: 8,
                  border: "none",
                  background: "transparent",
                  color: "white",
                  textAlign: "left",
                  padding: "0 10px",
                  cursor: "pointer",
                  fontSize: 12,
                }}
              >
                Rename
              </button>
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  const sequence = sequences.find((item) => item.id === openMenuSequenceId) ?? null;
                  setConfirmDeleteSequence(sequence);
                  setOpenMenuSequenceId(null);
                  setMenuPosition(null);
                }}
                style={{
                  minHeight: 32,
                  borderRadius: 8,
                  border: "none",
                  background: "transparent",
                  color: "rgba(255,190,190,0.96)",
                  textAlign: "left",
                  padding: "0 10px",
                  cursor: "pointer",
                  fontSize: 12,
                }}
              >
                Delete
              </button>
            </div>,
            document.body
          )
        : null}
      {confirmDeleteSequence && typeof document !== "undefined"
        ? createPortal(
            <div
              data-capture-sequence-delete-dialog="true"
              style={{
                position: "fixed",
                inset: 0,
                background: "rgba(6,8,12,0.52)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: 20,
                zIndex: 10000,
              }}
              onPointerDown={() => setConfirmDeleteSequence(null)}
            >
              <div
                data-theme-surface="panel"
                style={{
                  width: "min(420px, 100%)",
                  borderRadius: 18,
                  border: "1px solid rgba(255,255,255,0.12)",
                  background: "rgba(18,22,28,0.98)",
                  boxShadow: "0 28px 60px rgba(0,0,0,0.42)",
                  padding: 20,
                  color: "white",
                  display: "grid",
                  gap: 14,
                }}
                onPointerDown={(event) => event.stopPropagation()}
              >
                <div style={{ display: "grid", gap: 6 }}>
                  <div style={{ fontSize: 16, fontWeight: 800 }}>Delete animation?</div>
                  <div style={{ fontSize: 12.5, lineHeight: 1.5, color: "rgba(255,255,255,0.72)" }}>
                    Delete "{confirmDeleteSequence.name}" from the saved viewer state?
                  </div>
                </div>
                <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
                  <button
                    type="button"
                    onClick={() => setConfirmDeleteSequence(null)}
                    style={{
                      minHeight: 36,
                      borderRadius: 10,
                      border: "1px solid rgba(255,255,255,0.10)",
                      background: "rgba(255,255,255,0.06)",
                      color: "white",
                      padding: "0 14px",
                      cursor: "pointer",
                      fontSize: 12,
                      fontWeight: 700,
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onDeleteSequence(confirmDeleteSequence.id);
                      setConfirmDeleteSequence(null);
                    }}
                    style={{
                      minHeight: 36,
                      borderRadius: 10,
                      border: "1px solid rgba(255,120,120,0.20)",
                      background: "rgba(255,120,120,0.14)",
                      color: "rgba(255,220,220,0.98)",
                      padding: "0 14px",
                      cursor: "pointer",
                      fontSize: 12,
                      fontWeight: 700,
                    }}
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>,
            document.body
          )
        : null}
    </div>
  );
}

function WindowsIcon() {
   return (
     <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="2" y="3" width="20" height="18" rx="2" ry="2" />
      <line x1="2" y1="9" x2="22" y2="9" />
      <line x1="6" y1="6" x2="6" y2="6" strokeWidth="3" />
      <line x1="10" y1="6" x2="10" y2="6" strokeWidth="3" />
    </svg>
  );
}

function CloseSmallIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
      <path d="M6 6l12 12" />
      <path d="M18 6L6 18" />
    </svg>
  );
}

function WindowManagerToolButton({
  windows,
  onFocusWindow,
  onRestoreWindow,
  onCloseWindow,
  onCreateNoteAnnotation,
}: {
  windows: FloatingWindowState[];
  onFocusWindow: (id: string) => void;
  onRestoreWindow: (id: string) => void;
  onCloseWindow: (id: string) => void;
  onCreateNoteAnnotation: () => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const hasWindows = windows.length > 0;
  return (
    <div
      style={{ position: "relative" }}
      onMouseEnter={() => setIsOpen(true)}
      onMouseLeave={() => setIsOpen(false)}
      onFocus={() => setIsOpen(true)}
      onBlur={(event) => {
        if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
        setIsOpen(false);
      }}
    >
      <button
        type="button"
        title="Windows"
        aria-label="Windows"
        style={{
          width: 44,
          height: 44,
          borderRadius: 14,
          border: hasWindows ? "1px solid rgba(120,190,255,0.75)" : "1px solid rgba(255,255,255,0.08)",
          background: hasWindows ? "rgba(120,190,255,0.18)" : "rgba(255,255,255,0.03)",
          color: hasWindows ? "#d7eeff" : "rgba(255,255,255,0.82)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: "default",
          transition: "all 160ms ease",
          position: "relative",
        }}
      >
        <WindowsIcon />
        {hasWindows ? (
          <span
            aria-hidden="true"
            style={{
              position: "absolute",
              right: 5,
              top: 5,
              minWidth: 16,
              height: 16,
              borderRadius: 999,
              background: "rgba(120,190,255,0.96)",
              color: "#07111d",
              fontSize: 10,
              fontWeight: 900,
              lineHeight: "16px",
              textAlign: "center",
              padding: "0 4px",
              boxSizing: "border-box",
            }}
          >
            {windows.length}
          </span>
        ) : null}
      </button>

      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          left: -12,
          right: -12,
          bottom: "100%",
          height: 14,
          pointerEvents: isOpen ? "auto" : "none",
        }}
      />
      <div
        data-theme-surface="panel"
        className="toolbar-window-popover"
        style={{
          position: "absolute",
          left: "50%",
          bottom: "calc(100% + 12px)",
          transform: isOpen ? "translate(-50%, 0)" : "translate(-50%, 8px)",
          minWidth: hasWindows ? undefined : 148,
          maxWidth: "min(760px, calc(100vw - 32px))",
          overflowX: "auto",
          overflowY: "hidden",
          borderRadius: 16,
          border: "1px solid rgba(255,255,255,0.12)",
          background: "rgba(12,14,18,0.94)",
          boxShadow: "0 16px 42px rgba(0,0,0,0.42)",
          backdropFilter: "blur(14px)",
          padding: 8,
          opacity: isOpen ? 1 : 0,
          visibility: isOpen ? "visible" : "hidden",
          pointerEvents: isOpen ? "auto" : "none",
          transition: "opacity 150ms ease, transform 170ms ease, visibility 150ms ease",
        }}
      >
        {hasWindows ? (
          <div style={{ display: "flex", flexDirection: "row", gap: 8, alignItems: "stretch", width: "max-content", maxWidth: "100%" }}>
            {windows.map((windowState) => (
              <div
                key={windowState.id}
                role="button"
                tabIndex={0}
                onClick={() => {
                  onFocusWindow(windowState.id);
                  onRestoreWindow(windowState.id);
                }}
                onKeyDown={(event) => {
                  if (event.key !== "Enter" && event.key !== " ") return;
                  event.preventDefault();
                  onFocusWindow(windowState.id);
                  onRestoreWindow(windowState.id);
                }}
                style={{
                  width: 220,
                  minHeight: 68,
                  boxSizing: "border-box",
                  borderRadius: 8,
                  border: windowState.minimized ? "1px solid rgba(255,255,255,0.10)" : "1px solid rgba(130,190,255,0.28)",
                  background: windowState.minimized ? "rgba(255,255,255,0.045)" : "rgba(120,190,255,0.12)",
                  color: "white",
                  cursor: "pointer",
                  padding: 10,
                  textAlign: "left",
                  display: "grid",
                  gridTemplateColumns: "minmax(0, 1fr) auto",
                  gap: 8,
                  alignItems: "start",
                  flex: "0 0 auto",
                }}
              >
                <span style={{ minWidth: 0 }}>
                  <span style={{ display: "block", fontSize: 12, fontWeight: 800, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {windowState.title}
                  </span>
                  {windowState.subtitle ? (
                    <span style={{ display: "block", marginTop: 3, fontSize: 11, opacity: 0.68, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {windowState.subtitle}
                    </span>
                  ) : null}
                  <span
                    aria-hidden="true"
                    style={{
                      display: "block",
                      height: 18,
                      marginTop: 8,
                      borderRadius: 5,
                      background: "linear-gradient(90deg, rgba(120,190,255,0.20), rgba(255,255,255,0.06))",
                    }}
                  />
                </span>
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    onCloseWindow(windowState.id);
                  }}
                  title="Close window"
                  aria-label="Close window"
                  role="button"
                  tabIndex={0}
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: 999,
                    border: "1px solid rgba(255,255,255,0.14)",
                    background: "rgba(255,255,255,0.06)",
                    color: "white",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                    cursor: "pointer",
                    padding: 0,
                  }}
                >
                  <CloseSmallIcon />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div
            style={{
              display: "grid",
              gap: 8,
              justifyItems: "center",
              width: 132,
            }}
          >
            <button
              type="button"
              onClick={onCreateNoteAnnotation}
              title="Create note"
              aria-label="Create note"
              style={{
                width: 132,
                minHeight: 120,
                borderRadius: 16,
                border: "1px solid rgba(130,190,255,0.24)",
                background: "linear-gradient(180deg, rgba(120,190,255,0.16), rgba(120,190,255,0.08))",
                color: "white",
                cursor: "pointer",
                display: "grid",
                justifyItems: "center",
                alignContent: "center",
                gap: 10,
                padding: "14px 12px",
                textAlign: "center",
                transition: "transform 160ms ease, border-color 160ms ease, background 160ms ease, box-shadow 160ms ease",
                boxShadow: "0 8px 24px rgba(0,0,0,0.18)",
              }}
            >
              <span
                aria-hidden="true"
                style={{
                  width: 42,
                  height: 42,
                  borderRadius: 14,
                  border: "1px solid rgba(255,255,255,0.12)",
                  background: "rgba(255,255,255,0.08)",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <AnnotationModeIcon shape="note" />
              </span>
              <span style={{ display: "grid", gap: 4 }}>
                <span style={{ fontSize: 12, fontWeight: 800, lineHeight: 1.2 }}>Create note</span>
                <span style={{ fontSize: 10, lineHeight: 1.35, color: "rgba(255,255,255,0.64)" }}>
                  Open a note window
                </span>
              </span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function MoveToolButton({ active, cameraMode, onClick, onCameraModeChange, onFocusSelectedLayer }: { active: boolean; cameraMode: CameraControlMode; onClick: () => void; onCameraModeChange: (mode: CameraControlMode) => void; onFocusSelectedLayer?: () => void; }) {
  const [isHovered, setIsHovered] = useState(false);
  const showMenu = isHovered;
  return (
    <div style={{ position: "relative" }} onMouseEnter={() => setIsHovered(true)} onMouseLeave={() => setIsHovered(false)}>
      <ToolButton id="mouse" label="Move" active={active} onClick={onClick} />
      <div
        style={{
          position: "absolute",
          left: "50%",
          bottom: "100%",
          paddingBottom: 12,
          transform: showMenu ? "translate(-50%, 0)" : "translate(-50%, 8px)",
          opacity: showMenu ? 1 : 0,
          visibility: showMenu ? "visible" : "hidden",
          pointerEvents: showMenu ? "auto" : "none",
          transition: "opacity 180ms ease, transform 220ms ease, visibility 180ms ease",
          zIndex: 40,
        }}
      >
        <div data-theme-surface="panel" style={{ width: 260, borderRadius: 16, background: "rgba(12,14,18,0.96)", border: "1px solid rgba(255,255,255,0.10)", boxShadow: "0 16px 40px rgba(0,0,0,0.40)", backdropFilter: "blur(14px)", padding: 10, color: "white", display: "grid", gap: 8 }}>
          {CAMERA_MODE_OPTIONS.map((option) => {
            const selected = option.id === cameraMode;
            return (
              <button
                key={option.id}
                type="button"
                onClick={() => { onCameraModeChange(option.id); onClick(); }}
                style={{
                  textAlign: "left",
                  borderRadius: 12,
                  border: selected ? "1px solid rgba(120,190,255,0.75)" : "1px solid rgba(255,255,255,0.08)",
                  background: selected ? "rgba(120,190,255,0.16)" : "rgba(255,255,255,0.04)",
                  color: "white",
                  padding: "10px 12px",
                  cursor: "pointer",
                }}
              >
                <div style={{ fontSize: 13, fontWeight: 700 }}>{option.label}</div>
                <div style={{ fontSize: 11, opacity: 0.68, marginTop: 4 }}>{option.description}</div>
              </button>
            );
          })}
          <div style={{ height: 1, background: "rgba(255,255,255,0.08)", margin: "2px 0" }} />
          <button
            type="button"
            onClick={() => { onClick(); onFocusSelectedLayer?.(); }}
            style={{
              textAlign: "left",
              borderRadius: 12,
              border: "1px solid rgba(255,255,255,0.08)",
              background: "rgba(255,255,255,0.04)",
              color: "white",
              padding: "10px 12px",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 10,
            }}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
              style={{ flexShrink: 0, opacity: 0.92 }}
            >
              <path d="M9 4H5v4" />
              <path d="M15 4h4v4" />
              <path d="M20 15v4h-4" />
              <path d="M4 15v4h4" />
              <rect x="9" y="9" width="6" height="6" rx="1.2" />
            </svg>
            <div style={{ fontSize: 13, fontWeight: 700 }}>Focus selected layer</div>
          </button>
        </div>
      </div>
    </div>
  );
}


function getCanonicalSlicePlaneLabel(plane: SlicePlane): string {
  if (plane === "xy") return "Axial (XY)";
  if (plane === "xz") return "Coronal (XZ)";
  return "Sagittal (YZ)";
}

function getCanonicalSlicePlaneCompactLabel(plane: SlicePlane): string {
  if (plane === "xy") return "XY";
  if (plane === "xz") return "XZ";
  return "YZ";
}

function SlicePanelIcon({ children }: { children: ReactNode }) {
  return (
    <span
      aria-hidden="true"
      style={{
        width: 24,
        height: 24,
        borderRadius: 8,
        border: "1px solid rgba(255,255,255,0.10)",
        background: "rgba(255,255,255,0.05)",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        color: "rgba(255,255,255,0.88)",
        flexShrink: 0,
      }}
    >
      {children}
    </span>
  );
}

function SliceHeaderIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 4.5l6 3.5-6 3.5-6-3.5 6-3.5z" />
      <path d="M6 8v8l6 3.5 6-3.5V8" />
      <path d="M12 11.5v8" />
    </svg>
  );
}

function VisibilityIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6z" />
      <circle cx="12" cy="12" r="2.8" />
    </svg>
  );
}

function FlipIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 4v16" />
      <path d="M9 8H5l2.5-2.5" />
      <path d="M9 16H5l2.5 2.5" />
      <path d="M15 8h4l-2.5-2.5" />
      <path d="M15 16h4l-2.5 2.5" />
    </svg>
  );
}

function RotateIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 11a8 8 0 10-2.34 5.66" />
      <path d="M20 4v7h-7" />
    </svg>
  );
}

function ScaleIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 12L5 5" />
      <path d="M5 9V5h4" />
      <path d="M12 12l7 7" />
      <path d="M15 19h4v-4" />
      <path d="M12 12l7-7" />
      <path d="M15 5h4v4" />
      <path d="M12 12l-7 7" />
      <path d="M5 15v4h4" />
    </svg>
  );
}

function PanelSection({
  title,
  icon,
  children,
}: {
  title: string;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <div
      style={{
        borderRadius: 14,
        border: "1px solid rgba(255,255,255,0.08)",
        background: "rgba(255,255,255,0.03)",
        padding: 12,
        display: "grid",
        gap: 10,
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, padding: "2px 2px 0 2px" }}>
        <SlicePanelIcon>{icon}</SlicePanelIcon>
        <div style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.92)" }}>{title}</div>
      </div>
      {children}
    </div>
  );
}

void PanelSection;

function SliceToolPanelLegacy({
  selectedLayerName,
  targetPlane,
  hoveredPlane,
  hasSelectedLayer,
  canResetToCenter,
  canAdjustView,
  rotationDeg,
  scale,
  flipX,
  flipY,
  flipZ,
  visibilityXY,
  visibilityXZ,
  visibilityYZ,
  onToggleVisibility,
  onResetSliceView,
  onToggleFlip,
  onResetToCenter,
  onRotate,
  onScale,
}: {
  selectedLayerName: string | null;
  targetPlane: SlicePlane | null;
  hoveredPlane: SlicePlane | null;
  hasSelectedLayer: boolean;
  canResetToCenter: boolean;
  canAdjustView: boolean;
  rotationDeg: number;
  scale: number;
  flipX: boolean;
  flipY: boolean;
  flipZ: boolean;
  visibilityXY: boolean;
  visibilityXZ: boolean;
  visibilityYZ: boolean;
  onToggleVisibility: (plane: SlicePlane) => void;
  onResetSliceView: () => void;
  onToggleFlip: (axis: "x" | "y" | "z") => void;
  onResetToCenter: () => void;
  onRotate: (deltaDeg: number) => void;
  onScale: (delta: number) => void;
}) {
  const headerTitle = hasSelectedLayer
    ? targetPlane
      ? getCanonicalSlicePlaneLabel(targetPlane)
      : hoveredPlane
        ? `${getCanonicalSlicePlaneLabel(hoveredPlane)} ready`
        : "Slice explorer ready"
    : "Slice explorer";
  const helperText = hasSelectedLayer
    ? hoveredPlane
      ? "Drag in the scene to move this plane, use the wheel to browse slices, then fine-tune the view here."
      : "Hover one of the canonical planes in the scene to start adjusting it."
    : "Select a slice-rendered layer in the layer panel to browse and adjust its canonical planes.";
  void headerTitle;
  void helperText;
  return (
    <div
      style={{
        minWidth: 320,
        maxWidth: 620,
        borderRadius: 14,
        color: "white",
        fontFamily: "sans-serif",
        display: "grid",
        gap: 10,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <SlicePanelIcon>
          <SliceHeaderIcon />
        </SlicePanelIcon>
        <div
          data-theme-text="strong"
          style={{
            fontSize: 12,
            fontWeight: 700,
            lineHeight: 1.35,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 10,
            width: "100%",
          }}
        >
          <span>
            {hasSelectedLayer && targetPlane
              ? `${getCanonicalSlicePlaneLabel(targetPlane)} · ${selectedLayerName ?? ""}`
              : hoveredPlane
                ? getCanonicalSlicePlaneLabel(hoveredPlane)
                : "No plane under pointer"}
          </span>
          <button
            type="button"
            onClick={onResetToCenter}
            disabled={!canResetToCenter}
            title="Reset to center"
            aria-label="Reset to center"
            style={{
              width: 28,
              height: 28,
              borderRadius: 999,
              border: "1px solid rgba(255,255,255,0.10)",
              background: "rgba(255,255,255,0.05)",
              color: "inherit",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: canResetToCenter ? "pointer" : "default",
              opacity: canResetToCenter ? 1 : 0.5,
              flexShrink: 0,
            }}
          >
            <RecenterIcon />
          </button>
        </div>
      </div>

      <div data-theme-text="muted" style={{ fontSize: 11, opacity: 0.76, lineHeight: 1.4 }}>
        {hasSelectedLayer
          ? hoveredPlane
            ? "Drag to move this plane, use the mouse wheel to browse slices, then adjust the view here."
            : "Select a layer and hover a plane to target it."
          : "Select a slice-rendered layer in the layer panel to browse and adjust its canonical planes."}
      </div>

      {hasSelectedLayer && targetPlane ? (
        <div style={{ display: "grid", gap: 8 }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
            <span
              data-theme-text="strong"
              style={{
                display: "inline-flex",
                alignItems: "center",
                minHeight: 28,
                padding: "0 10px",
                borderRadius: 999,
                border: "1px solid rgba(120,200,255,0.28)",
                background: "rgba(120,200,255,0.10)",
                fontSize: 11,
                fontWeight: 700,
              }}
            >
              {getCanonicalSlicePlaneCompactLabel(targetPlane)}
            </span>
            <span
              data-theme-text="default"
              style={{
                display: "inline-flex",
                alignItems: "center",
                minHeight: 28,
                padding: "0 10px",
                borderRadius: 999,
                border: "1px solid rgba(255,255,255,0.10)",
                background: "rgba(255,255,255,0.05)",
                fontSize: 11,
                fontWeight: 600,
              }}
            >
              Rotation {rotationDeg.toFixed(1)}°
            </span>
            <span
              data-theme-text="default"
              style={{
                display: "inline-flex",
                alignItems: "center",
                minHeight: 28,
                padding: "0 10px",
                borderRadius: 999,
                border: "1px solid rgba(255,255,255,0.10)",
                background: "rgba(255,255,255,0.05)",
                fontSize: 11,
                fontWeight: 600,
              }}
            >
              Scale {scale.toFixed(2)}×
            </span>
            <button
              type="button"
              onClick={onResetSliceView}
              disabled={!canAdjustView}
              title="Reset slice view"
              aria-label="Reset slice view"
              style={{
                width: 30,
                height: 30,
                borderRadius: 999,
                border: "1px solid rgba(255,255,255,0.10)",
                background: "rgba(255,255,255,0.05)",
                color: "inherit",
                cursor: canAdjustView ? "pointer" : "default",
                opacity: canAdjustView ? 1 : 0.5,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <ResetTransformIcon />
            </button>
          </div>

          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
            <span data-theme-text="muted" style={{ fontSize: 11, opacity: 0.76, minWidth: 58 }}>
              Flip
            </span>
            {([
              ["x", "X", flipX],
              ["y", "Y", flipY],
              ["z", "Z", flipZ],
            ] as const).map(([axis, label, isActive]) => (
              <button
                key={axis}
                type="button"
                onClick={() => onToggleFlip(axis)}
                disabled={!canAdjustView}
                title={axis === "z" ? "Reverse the slice browsing direction for this plane" : `Flip ${label}`}
                aria-label={axis === "z" ? "Flip Z" : `Flip ${label}`}
                style={{
                  minWidth: 30,
                  height: 30,
                  padding: "0 10px",
                  borderRadius: 999,
                  border: "1px solid rgba(255,255,255,0.10)",
                  background: isActive ? "rgba(80,160,255,0.18)" : "rgba(255,255,255,0.05)",
                  color: "inherit",
                  cursor: canAdjustView ? "pointer" : "default",
                  opacity: canAdjustView ? 1 : 0.5,
                  fontSize: 11,
                  fontWeight: 700,
                }}
              >
                {label}
              </button>
            ))}
          </div>

          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
            <span data-theme-text="muted" style={{ fontSize: 11, opacity: 0.76, minWidth: 58 }}>
              Visibility
            </span>
            {([
              ["xy", "XY", visibilityXY],
              ["xz", "XZ", visibilityXZ],
              ["yz", "YZ", visibilityYZ],
            ] as const).map(([planeId, label, isVisible]) => (
              <button
                key={planeId}
                type="button"
                onClick={() => onToggleVisibility(planeId)}
                style={{
                  minWidth: 42,
                  height: 30,
                  padding: "0 10px",
                  borderRadius: 999,
                  border: "1px solid rgba(255,255,255,0.10)",
                  background: isVisible ? "rgba(80,160,255,0.18)" : "rgba(255,255,255,0.05)",
                  color: "inherit",
                  cursor: "pointer",
                  opacity: 1,
                  fontSize: 11,
                  fontWeight: 700,
                }}
                title={isVisible ? `Hide ${label} slice` : `Show ${label} slice`}
                aria-label={isVisible ? `Hide ${label} slice` : `Show ${label} slice`}
              >
                {label}
              </button>
            ))}
          </div>

          <div style={{ display: "grid", gap: 8 }}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
              <span data-theme-text="muted" style={{ fontSize: 11, opacity: 0.76, minWidth: 58 }}>
                Rotation
              </span>
              {[-90, 90].map((step) => (
                <button
                  key={step}
                  type="button"
                  onClick={() => onRotate(step)}
                  disabled={!canAdjustView}
                  style={{
                    height: 30,
                    padding: "0 10px",
                    borderRadius: 999,
                    border: "1px solid rgba(255,255,255,0.10)",
                    background: "rgba(255,255,255,0.05)",
                    color: "inherit",
                    cursor: canAdjustView ? "pointer" : "default",
                    opacity: canAdjustView ? 1 : 0.5,
                    fontSize: 11,
                    fontWeight: 700,
                  }}
                >
                  {step > 0 ? `+${step}°` : `${step}°`}
                </button>
              ))}
            </div>

            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
              <span data-theme-text="muted" style={{ fontSize: 11, opacity: 0.76, minWidth: 58 }}>
                Scale
              </span>
              {[-0.10, -0.01, 0.01, 0.10].map((step) => (
                <button
                  key={step}
                  type="button"
                  onClick={() => onScale(step)}
                  disabled={!canAdjustView}
                  style={{
                    height: 30,
                    padding: "0 10px",
                    borderRadius: 999,
                    border: "1px solid rgba(255,255,255,0.10)",
                    background: "rgba(255,255,255,0.05)",
                    color: "inherit",
                    cursor: canAdjustView ? "pointer" : "default",
                    opacity: canAdjustView ? 1 : 0.5,
                    fontSize: 11,
                    fontWeight: 700,
                  }}
                >
                  {step > 0 ? `+${step.toFixed(2)}` : step.toFixed(2)}
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

void SliceToolPanelLegacy;

function SliceToolPanel({
  mode,
  selectedLayerName,
  targetPlane,
  hoveredPlane,
  hasSelectedLayer,
  canResetToCenter,
  canAdjustView,
  rotationDeg,
  scale,
  flipX,
  flipY,
  flipZ,
  visibilityXY,
  visibilityXZ,
  visibilityYZ,
  canCreateFreeSlice,
  freeSliceOffset: _freeSliceOffset,
  onToggleVisibility,
  onResetSliceView,
  onToggleFlip,
  onResetToCenter,
  onRotate,
  onScale,
  onCreateFreeSlice,
  onNudgeFreeOffset: _onNudgeFreeOffset,
  onTiltFreeSlice,
  onSnapFreeSlice: _onSnapFreeSlice,
}: {
  mode: "canonical" | "free";
  selectedLayerName: string | null;
  targetPlane: SlicePlane | null;
  hoveredPlane: SlicePlane | null;
  hasSelectedLayer: boolean;
  canResetToCenter: boolean;
  canAdjustView: boolean;
  rotationDeg: number;
  scale: number;
  flipX: boolean;
  flipY: boolean;
  flipZ: boolean;
  visibilityXY: boolean;
  visibilityXZ: boolean;
  visibilityYZ: boolean;
  canCreateFreeSlice: boolean;
  freeSliceOffset: number;
  onToggleVisibility: (plane: SlicePlane) => void;
  onResetSliceView: () => void;
  onToggleFlip: (axis: "x" | "y" | "z") => void;
  onResetToCenter: () => void;
  onRotate: (deltaDeg: number) => void;
  onScale: (delta: number) => void;
  onCreateFreeSlice: () => void;
  onNudgeFreeOffset: (delta: number) => void;
  onTiltFreeSlice: (axis: "u" | "v", deltaDeg: number) => void;
  onSnapFreeSlice: (plane: SlicePlane) => void;
}) {
  const activePlane = targetPlane ?? hoveredPlane;
  const isFreeSlice = mode === "free";
  const summaryTitle = isFreeSlice
    ? "Free slice"
    : activePlane
      ? getCanonicalSlicePlaneLabel(activePlane)
      : "Slice explorer";
  const summaryHint = isFreeSlice
    ? "Drag or use the wheel in the scene to move this slice. Use the same transform controls plus tilt."
    : !hasSelectedLayer
    ? "Select a slice-rendered layer to browse and adjust its canonical planes."
    : !targetPlane
      ? "Hover a canonical plane in the scene to choose which one to adjust."
      : null;
  const showTransformControls = hasSelectedLayer && (isFreeSlice || !!targetPlane);
  const rowLabelStyle = {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    minWidth: 92,
    fontSize: 11,
    fontWeight: 700,
    color: "rgba(255,255,255,0.84)",
    flexShrink: 0,
  } as const;
  const actionButtonStyle = {
    height: 28,
    padding: "0 10px",
    borderRadius: 999,
    border: "1px solid rgba(255,255,255,0.10)",
    background: "rgba(255,255,255,0.05)",
    color: "inherit",
    fontSize: 11,
    fontWeight: 700,
  } as const;

  return (
    <div
      style={{
        minWidth: 320,
        maxWidth: 540,
        borderRadius: 12,
        color: "white",
        fontFamily: "sans-serif",
        display: "grid",
        gap: 8,
      }}
    >
      <div
        style={{
          display: "grid",
          gap: 8,
          borderRadius: 12,
          border: "1px solid rgba(255,255,255,0.08)",
          background: "rgba(255,255,255,0.03)",
          padding: 10,
        }}
      >
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 8, minWidth: 0 }}>
            <SlicePanelIcon>
              <SliceHeaderIcon />
            </SlicePanelIcon>
            <div style={{ display: "grid", gap: 3, minWidth: 0 }}>
              <div data-theme-text="strong" style={{ fontSize: 12, fontWeight: 700, lineHeight: 1.35 }}>
                {summaryTitle}
              </div>
              <div
                data-theme-text="muted"
                style={{
                  fontSize: 11,
                  opacity: 0.8,
                  lineHeight: 1.35,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  maxWidth: 280,
                }}
              >
                {selectedLayerName ? selectedLayerName : "No layer selected"}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onResetToCenter}
            disabled={!canResetToCenter}
            title="Reset to center"
            aria-label="Reset to center"
            style={{
              width: 28,
              height: 28,
              borderRadius: 999,
              border: "1px solid rgba(255,255,255,0.10)",
              background: "rgba(255,255,255,0.05)",
              color: "inherit",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: canResetToCenter ? "pointer" : "default",
              opacity: canResetToCenter ? 1 : 0.5,
              flexShrink: 0,
            }}
          >
            <RecenterIcon />
          </button>
        </div>

          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
          {isFreeSlice ? (
            <>
              <span
                data-theme-text="strong"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  minHeight: 26,
                  padding: "0 9px",
                  borderRadius: 999,
                  border: "1px solid rgba(120,200,255,0.28)",
                  background: "rgba(120,200,255,0.10)",
                  fontSize: 11,
                  fontWeight: 700,
                }}
              >
                OBLIQUE
              </span>
            </>
          ) : activePlane ? (
            <span
              data-theme-text="strong"
              style={{
                display: "inline-flex",
                alignItems: "center",
                minHeight: 26,
                padding: "0 9px",
                borderRadius: 999,
                border: "1px solid rgba(120,200,255,0.28)",
                background: "rgba(120,200,255,0.10)",
                fontSize: 11,
                fontWeight: 700,
              }}
            >
              {getCanonicalSlicePlaneCompactLabel(activePlane)}
            </span>
          ) : null}
          {showTransformControls ? (
            <>
              <span
                data-theme-text="default"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  minHeight: 26,
                  padding: "0 9px",
                  borderRadius: 999,
                  border: "1px solid rgba(255,255,255,0.10)",
                  background: "rgba(255,255,255,0.05)",
                  fontSize: 11,
                  fontWeight: 600,
                }}
              >
                Rotation {rotationDeg.toFixed(1)} deg
              </span>
              <span
                data-theme-text="default"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  minHeight: 26,
                  padding: "0 9px",
                  borderRadius: 999,
                  border: "1px solid rgba(255,255,255,0.10)",
                  background: "rgba(255,255,255,0.05)",
                  fontSize: 11,
                  fontWeight: 600,
                }}
              >
                Scale {scale.toFixed(2)}x
              </span>
            </>
          ) : null}
        </div>
        {summaryHint ? (
          <div data-theme-text="muted" style={{ fontSize: 11, opacity: 0.72, lineHeight: 1.35 }}>
            {summaryHint}
          </div>
        ) : null}
      </div>

      {showTransformControls ? (
        <div
          style={{
            display: "grid",
            gap: 8,
            borderRadius: 12,
            border: "1px solid rgba(255,255,255,0.08)",
            background: "rgba(255,255,255,0.03)",
            padding: 10,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "space-between" }}>
            <div data-theme-text="strong" style={{ fontSize: 12, fontWeight: 700 }}>
              Transformations
            </div>
            <button
              type="button"
              onClick={onResetSliceView}
              disabled={!canAdjustView}
              title="Reset slice view"
              aria-label="Reset slice view"
              style={{
                width: 28,
                height: 28,
                borderRadius: 999,
                border: "1px solid rgba(255,255,255,0.10)",
                background: "rgba(255,255,255,0.05)",
                color: "inherit",
                cursor: canAdjustView ? "pointer" : "default",
                opacity: canAdjustView ? 1 : 0.5,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <ResetTransformIcon />
            </button>
          </div>

          <div style={{ display: "grid", gap: 6 }}>
            {!isFreeSlice ? (
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <span style={rowLabelStyle}>
                  <SlicePanelIcon>
                    <VisibilityIcon />
                  </SlicePanelIcon>
                  Visibility
                </span>
                {([
                  ["xy", "XY", visibilityXY],
                  ["xz", "XZ", visibilityXZ],
                  ["yz", "YZ", visibilityYZ],
                ] as const).map(([planeId, label, isVisible]) => (
                  <button
                    key={planeId}
                    type="button"
                    onClick={() => onToggleVisibility(planeId)}
                    style={{
                      ...actionButtonStyle,
                      minWidth: 42,
                      background: isVisible ? "rgba(80,160,255,0.18)" : "rgba(255,255,255,0.05)",
                      cursor: "pointer",
                      opacity: 1,
                    }}
                    title={isVisible ? `Hide ${label} slice` : `Show ${label} slice`}
                    aria-label={isVisible ? `Hide ${label} slice` : `Show ${label} slice`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            ) : null}

            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span style={rowLabelStyle}>
                <SlicePanelIcon>
                  <FlipIcon />
                </SlicePanelIcon>
                Flip
              </span>
              {([
                ["x", "X", flipX],
                ["y", "Y", flipY],
                ["z", "Z", flipZ],
              ] as const).map(([axis, label, isActive]) => (
                <button
                  key={axis}
                  type="button"
                  onClick={() => onToggleFlip(axis)}
                  disabled={!canAdjustView}
                  title={axis === "z" ? "Reverse the slice browsing direction for this plane" : `Flip ${label}`}
                  aria-label={axis === "z" ? "Flip Z" : `Flip ${label}`}
                  style={{
                    ...actionButtonStyle,
                    minWidth: 30,
                    background: isActive ? "rgba(80,160,255,0.18)" : "rgba(255,255,255,0.05)",
                    cursor: canAdjustView ? "pointer" : "default",
                    opacity: canAdjustView ? 1 : 0.5,
                  }}
                >
                  {label}
                </button>
              ))}
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span style={rowLabelStyle}>
                <SlicePanelIcon>
                  <RotateIcon />
                </SlicePanelIcon>
                Rotation
              </span>
              {[-90, 90].map((step) => (
                <button
                  key={step}
                  type="button"
                  onClick={() => onRotate(step)}
                  disabled={!canAdjustView}
                  style={{
                    ...actionButtonStyle,
                    cursor: canAdjustView ? "pointer" : "default",
                    opacity: canAdjustView ? 1 : 0.5,
                  }}
                >
                  {step > 0 ? `+${step}` : step} deg
                </button>
              ))}
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span style={rowLabelStyle}>
                <SlicePanelIcon>
                  <ScaleIcon />
                </SlicePanelIcon>
                Scale
              </span>
              {[-0.1, 0.1].map((step) => (
                <button
                  key={step}
                  type="button"
                  onClick={() => onScale(step)}
                  disabled={!canAdjustView}
                  style={{
                    ...actionButtonStyle,
                    cursor: canAdjustView ? "pointer" : "default",
                    opacity: canAdjustView ? 1 : 0.5,
                  }}
                >
                  {step > 0 ? `+${step.toFixed(2)}` : step.toFixed(2)}
                </button>
              ))}
            </div>
            {isFreeSlice ? (
              <>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <span style={rowLabelStyle}>
                    <SlicePanelIcon>
                      <RotateIcon />
                    </SlicePanelIcon>
                    Tilt horiz
                  </span>
                  {[-5, 5].map((step) => (
                    <button
                      key={`u-${step}`}
                      type="button"
                      onClick={() => onTiltFreeSlice("u", step)}
                      style={{ ...actionButtonStyle, cursor: "pointer" }}
                    >
                      {step > 0 ? `+${step}` : step} deg
                    </button>
                  ))}
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <span style={rowLabelStyle}>
                    <SlicePanelIcon>
                      <FlipIcon />
                    </SlicePanelIcon>
                    Tilt vert
                  </span>
                  {[-5, 5].map((step) => (
                    <button
                      key={`v-${step}`}
                      type="button"
                      onClick={() => onTiltFreeSlice("v", step)}
                      style={{ ...actionButtonStyle, cursor: "pointer" }}
                    >
                      {step > 0 ? `+${step}` : step} deg
                    </button>
                  ))}
                </div>
              </>
            ) : null}
          </div>
        </div>
      ) : null}

      {!isFreeSlice && canCreateFreeSlice ? (
        <div
          style={{
            display: "grid",
            gap: 8,
            borderRadius: 12,
            border: "1px solid rgba(255,255,255,0.08)",
            background: "rgba(255,255,255,0.03)",
            padding: 10,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
            <div style={{ display: "grid", gap: 3 }}>
              <div data-theme-text="strong" style={{ fontSize: 12, fontWeight: 700 }}>
                Free slice
              </div>
              <div data-theme-text="muted" style={{ fontSize: 11, opacity: 0.72, lineHeight: 1.35 }}>
                Create an independent slice from the current plane, then tilt it to any orientation.
              </div>
            </div>
            <button
              type="button"
              onClick={onCreateFreeSlice}
              style={{
                ...actionButtonStyle,
                cursor: "pointer",
                background: "rgba(120,190,255,0.14)",
                border: "1px solid rgba(120,190,255,0.26)",
                flexShrink: 0,
              }}
            >
              Create free slice
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function SliceToolButton({
  active,
  onClick,
  onHoverLockChange,
  mode,
  selectedLayerName,
  targetPlane,
  hoveredPlane,
  hasSelectedLayer,
  canResetToCenter,
  canAdjustView,
  rotationDeg,
  scale,
  flipX,
  flipY,
  flipZ,
  visibilityXY,
  visibilityXZ,
  visibilityYZ,
  canCreateFreeSlice,
  freeSliceOffset,
  onToggleVisibility,
  onResetSliceView,
  onToggleFlip,
  onResetToCenter,
  onRotate,
  onScale,
  onCreateFreeSlice,
  onNudgeFreeOffset,
  onTiltFreeSlice,
  onSnapFreeSlice,
}: {
  active: boolean;
  onClick: () => void;
  onHoverLockChange?: (locked: boolean) => void;
  mode: "canonical" | "free";
  selectedLayerName: string | null;
  targetPlane: SlicePlane | null;
  hoveredPlane: SlicePlane | null;
  hasSelectedLayer: boolean;
  canResetToCenter: boolean;
  canAdjustView: boolean;
  rotationDeg: number;
  scale: number;
  flipX: boolean;
  flipY: boolean;
  flipZ: boolean;
  visibilityXY: boolean;
  visibilityXZ: boolean;
  visibilityYZ: boolean;
  canCreateFreeSlice: boolean;
  freeSliceOffset: number;
  onToggleVisibility: (plane: SlicePlane) => void;
  onResetSliceView: () => void;
  onToggleFlip: (axis: "x" | "y" | "z") => void;
  onResetToCenter: () => void;
  onRotate: (deltaDeg: number) => void;
  onScale: (delta: number) => void;
  onCreateFreeSlice: () => void;
  onNudgeFreeOffset: (delta: number) => void;
  onTiltFreeSlice: (axis: "u" | "v", deltaDeg: number) => void;
  onSnapFreeSlice: (plane: SlicePlane) => void;
}) {
  const [isHovered, setIsHovered] = useState(false);
  const showMenu = isHovered;

  useEffect(() => {
    onHoverLockChange?.(showMenu);
    return () => onHoverLockChange?.(false);
  }, [onHoverLockChange, showMenu]);

  return (
    <div
      style={{ position: "relative" }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <ToolButton id="slice" label="Browse slices" active={active} onClick={onClick} />
      <div
        style={{
          position: "absolute",
          left: "50%",
          bottom: "100%",
          paddingBottom: 12,
          transform: showMenu ? "translate(-50%, 0)" : "translate(-50%, 8px)",
          opacity: showMenu ? 1 : 0,
          visibility: showMenu ? "visible" : "hidden",
          pointerEvents: showMenu ? "auto" : "none",
          transition: "opacity 180ms ease, transform 220ms ease, visibility 180ms ease",
          zIndex: 40,
        }}
      >
        <div
          data-theme-surface="panel"
          onPointerDownCapture={() => {
            if (!active) {
              onClick();
            }
          }}
          style={{
            minWidth: 360,
            maxWidth: 560,
            borderRadius: 16,
            background: "rgba(12,14,18,0.90)",
            border: "1px solid rgba(255,255,255,0.10)",
            boxShadow: "0 16px 40px rgba(0,0,0,0.40)",
            backdropFilter: "blur(14px)",
            padding: 10,
            color: "white",
          }}
        >
          <SliceToolPanel
            mode={mode}
            selectedLayerName={selectedLayerName}
            targetPlane={targetPlane}
            hoveredPlane={hoveredPlane}
            hasSelectedLayer={hasSelectedLayer}
            canResetToCenter={canResetToCenter}
            canAdjustView={canAdjustView}
            rotationDeg={rotationDeg}
            scale={scale}
            flipX={flipX}
            flipY={flipY}
            flipZ={flipZ}
            visibilityXY={visibilityXY}
            visibilityXZ={visibilityXZ}
            visibilityYZ={visibilityYZ}
            canCreateFreeSlice={canCreateFreeSlice}
            freeSliceOffset={freeSliceOffset}
            onToggleVisibility={onToggleVisibility}
            onResetSliceView={onResetSliceView}
            onToggleFlip={onToggleFlip}
            onResetToCenter={onResetToCenter}
            onRotate={onRotate}
            onScale={onScale}
            onCreateFreeSlice={onCreateFreeSlice}
            onNudgeFreeOffset={onNudgeFreeOffset}
            onTiltFreeSlice={onTiltFreeSlice}
            onSnapFreeSlice={onSnapFreeSlice}
          />
        </div>
      </div>
    </div>
  );
}

function needsSizeControl(shape: AnnotationShape) {
  return (
    shape === "point" ||
    shape === "line" ||
    shape === "rectangle" ||
    shape === "circle" ||
    shape === "freehand" ||
    shape === "eraser"
  );
}

function buildSizeLabel(shape: AnnotationShape) {
  if (shape === "point") return "Point size";
  if (shape === "line") return "Line thickness";
  if (shape === "rectangle") return "Border thickness";
  if (shape === "circle") return "Border thickness";
  if (shape === "eraser") return "Eraser size";
  return "Brush size";
}

function CircularColorInput({ color, onChange, onCommit }: { color: string; onChange: (color: string) => void; onCommit?: (color: string) => void; }) {
  return (
    <label
      title="Custom color"
      style={{
        width: 30,
        height: 30,
        borderRadius: 999,
        overflow: "hidden",
        border: "1px solid rgba(255,255,255,0.16)",
        boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.05)",
        cursor: "pointer",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        background: color,
      }}
    >
      <input
        type="color"
        value={color}
        onChange={(event) => onChange(event.target.value)}
        onBlur={() => onCommit?.(color)}
        onPointerUp={() => onCommit?.(color)}
        aria-label="Custom annotation color"
        style={{ width: 42, height: 42, padding: 0, border: "none", background: "transparent", cursor: "pointer", opacity: 0 }}
      />
    </label>
  );
}


function hexToRgb(color: string) {
  const normalized = color.trim().replace("#", "");
  const safe = normalized.length === 3
    ? normalized.split("").map((part) => part + part).join("")
    : normalized;
  if (!/^[0-9a-fA-F]{6}$/.test(safe)) {
    return { r: 255, g: 92, b: 92 };
  }
  return {
    r: parseInt(safe.slice(0, 2), 16),
    g: parseInt(safe.slice(2, 4), 16),
    b: parseInt(safe.slice(4, 6), 16),
  };
}

function checkerboardBackground() {
  return `linear-gradient(45deg, rgba(255,255,255,0.09) 25%, transparent 25%), linear-gradient(-45deg, rgba(255,255,255,0.09) 25%, transparent 25%), linear-gradient(45deg, transparent 75%, rgba(255,255,255,0.09) 75%), linear-gradient(-45deg, transparent 75%, rgba(255,255,255,0.09) 75%)`;
}

function SliderShell({
  value,
  min,
  max,
  step,
  onChange,
  ariaLabel,
  track,
  height = 18,
}: {
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (next: number) => void;
  ariaLabel: string;
  track: ReactNode;
  height?: number;
}) {
  const ratio = Math.max(0, Math.min(1, (value - min) / (max - min || 1)));
  return (
    <div style={{ position: "relative", height, display: "flex", alignItems: "center" }}>
      <div
        style={{
          position: "absolute",
          inset: 0,
          borderRadius: 999,
          overflow: "hidden",
          border: "1px solid rgba(255,255,255,0.10)",
          background: "rgba(255,255,255,0.03)",
        }}
      >
        {track}
      </div>
      <div
        style={{
          position: "absolute",
          left: `calc(${(ratio * 100).toFixed(3)}% - 8px)`,
          top: "50%",
          width: 16,
          height: 16,
          transform: "translateY(-50%)",
          borderRadius: 999,
          background: "rgba(255,255,255,0.96)",
          boxShadow: "0 0 0 2px rgba(12,14,18,0.42), 0 2px 10px rgba(0,0,0,0.35)",
          pointerEvents: "none",
        }}
      />
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        aria-label={ariaLabel}
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          margin: 0,
          opacity: 0,
          cursor: "pointer",
        }}
      />
    </div>
  );
}

function OpacitySlider({ color, opacity, onChange }: { color: string; opacity: number; onChange: (next: number) => void; }) {
  const { r, g, b } = hexToRgb(color);
  return (
    <SliderShell
      value={opacity}
      min={0}
      max={1}
      step={0.01}
      onChange={onChange}
      ariaLabel="Annotation opacity"
      height={18}
      track={
        <>
          <div
            style={{
              position: "absolute",
              inset: 0,
              backgroundImage: checkerboardBackground(),
              backgroundSize: "12px 12px",
              backgroundPosition: "0 0, 0 6px, 6px -6px, -6px 0px",
            }}
          />
          <div
            style={{
              position: "absolute",
              inset: 0,
              background: `linear-gradient(90deg, rgba(${r}, ${g}, ${b}, 0) 0%, rgba(${r}, ${g}, ${b}, 1) 100%)`,
            }}
          />
        </>
      }
    />
  );
}

function ThicknessSlider({ shape, size, onChange }: { shape: AnnotationShape; size: number; onChange: (next: number) => void; }) {
  const min = 0.01;
  const max = 0.3;
  const ratio = Math.max(0, Math.min(1, (size - min) / (max - min)));
  const leftHeight = shape === "point" ? 20 : 18;
  const rightHeight = shape === "point" ? 66 : 56;
  return (
    <SliderShell
      value={size}
      min={min}
      max={max}
      step={0.005}
      onChange={onChange}
      ariaLabel={buildSizeLabel(shape)}
      height={24}
      track={
        <>
          <div
            style={{
              position: "absolute",
              inset: 0,
              background: "rgba(255,255,255,0.05)",
            }}
          />
          <div
            style={{
              position: "absolute",
              inset: 0,
              background: "linear-gradient(90deg, rgba(120,190,255,0.30) 0%, rgba(120,190,255,0.62) 100%)",
              clipPath: `polygon(0% ${50 - leftHeight / 2}%, 100% ${50 - rightHeight / 2}%, 100% ${50 + rightHeight / 2}%, 0% ${50 + leftHeight / 2}%)`,
            }}
          />
          <div
            style={{
              position: "absolute",
              inset: 0,
              width: `${ratio * 100}%`,
              background: "linear-gradient(90deg, rgba(185,230,255,0.42) 0%, rgba(185,230,255,0.72) 100%)",
              clipPath: `polygon(0% ${50 - leftHeight / 2}%, 100% ${50 - rightHeight / 2}%, 100% ${50 + rightHeight / 2}%, 0% ${50 + leftHeight / 2}%)`,
            }}
          />
        </>
      }
    />
  );
}

function PencilToolButton({
  active,
  onClick,
  shape,
  color,
  opacity,
  size,
  depth,
  recentColors,
  canUseEyeDropper,
  onShapeChange,
  onColorChange,
  onColorCommit,
  onOpacityChange,
  onSizeChange,
  onDepthChange,
  onPickColorFromScreen,
  eraseMode,
  onEraseModeChange,
}: {
  active: boolean;
  onClick: () => void;
  shape: AnnotationShape;
  color: string;
  opacity: number;
  size: number;
  depth: number;
  recentColors: string[];
  canUseEyeDropper: boolean;
  onShapeChange: (shape: AnnotationShape) => void;
  onColorChange: (color: string) => void;
  onColorCommit?: (color: string) => void;
  onOpacityChange: (opacity: number) => void;
  onSizeChange: (size: number) => void;
  onDepthChange: (depth: number) => void;
  onPickColorFromScreen?: () => void | Promise<void>;
  eraseMode: "all" | "color";
  onEraseModeChange: (mode: "all" | "color") => void;
}) {
  const [isHovered, setIsHovered] = useState(false);
  const showMenu = isHovered;
  const primaryShape: AnnotationShape | "shape" = SHAPE_GROUP_FORMS.includes(shape) ? "shape" : shape;

  function handleSelectShape(nextShape: AnnotationShape) {
    onShapeChange(nextShape);
    onClick();
  }

  return (
    <div style={{ position: "relative" }} onMouseEnter={() => setIsHovered(true)} onMouseLeave={() => setIsHovered(false)}>
      <ToolButton id="pencil" label="Draw" active={active} onClick={onClick} />
      <div
        style={{
          position: "absolute",
          left: "50%",
          bottom: "100%",
          paddingBottom: 12,
          transform: showMenu ? "translate(-50%, 0)" : "translate(-50%, 8px)",
          opacity: showMenu ? 1 : 0,
          visibility: showMenu ? "visible" : "hidden",
          pointerEvents: showMenu ? "auto" : "none",
          transition: "opacity 180ms ease, transform 220ms ease, visibility 180ms ease",
          zIndex: 41,
        }}
      >
        <div data-theme-surface="panel" style={{ width: 332, borderRadius: 16, background: "rgba(12,14,18,0.96)", border: "1px solid rgba(255,255,255,0.10)", boxShadow: "0 16px 40px rgba(0,0,0,0.40)", backdropFilter: "blur(14px)", padding: 12, color: "white", display: "grid", gap: 12 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(0, 1fr))", gap: 8 }}>
            {PRIMARY_ANNOTATION_TOOLS.map((option) => {
              const selected = option === primaryShape;
              return (
                <button
                  key={option}
                  type="button"
                  title={option === "shape" ? "Shape" : option}
                  aria-label={option === "shape" ? "Shape" : option}
                  onClick={() => {
                    if (option === "shape") {
                      handleSelectShape(shape === "rectangle" || shape === "circle" ? shape : "rectangle");
                    } else {
                      handleSelectShape(option);
                    }
                  }}
                  style={{
                    height: 42,
                    borderRadius: 12,
                    border: selected ? "1px solid rgba(120,190,255,0.82)" : "1px solid rgba(255,255,255,0.08)",
                    background: selected ? "rgba(120,190,255,0.18)" : "rgba(255,255,255,0.04)",
                    color: selected ? "#d7eeff" : "white",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    cursor: "pointer",
                    transition: "all 160ms ease",
                  }}
                >
                  <AnnotationModeIcon shape={option} />
                </button>
              );
            })}
          </div>

          {primaryShape === "shape" ? (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 8 }}>
              {SHAPE_GROUP_FORMS.map((option) => {
                const selected = option === shape;
                return (
                  <button
                    key={option}
                    type="button"
                    onClick={() => handleSelectShape(option)}
                    style={{
                      height: 38,
                      borderRadius: 12,
                      border: selected ? "1px solid rgba(120,190,255,0.82)" : "1px solid rgba(255,255,255,0.08)",
                      background: selected ? "rgba(120,190,255,0.16)" : "rgba(255,255,255,0.035)",
                      color: selected ? "#d7eeff" : "rgba(255,255,255,0.86)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 8,
                      cursor: "pointer",
                    }}
                  >
                    <AnnotationModeIcon shape={option} />
                    <span style={{ fontSize: 12, fontWeight: 600, textTransform: "capitalize" }}>{option}</span>
                  </button>
                );
              })}
            </div>
          ) : null}

          <div style={{ display: "grid", gap: 12 }}>
            {shape === "eraser" ? (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 8 }}>
                <button
                  type="button"
                  onClick={() => { onEraseModeChange("color"); onClick(); }}
                  style={{
                    height: 36,
                    borderRadius: 12,
                    border: eraseMode === "color" ? "1px solid rgba(120,190,255,0.82)" : "1px solid rgba(255,255,255,0.08)",
                    background: eraseMode === "color" ? "rgba(120,190,255,0.16)" : "rgba(255,255,255,0.035)",
                    color: eraseMode === "color" ? "#d7eeff" : "rgba(255,255,255,0.86)",
                    cursor: "pointer",
                    fontSize: 12,
                    fontWeight: 600,
                  }}
                >
                  Erase one color
                </button>
                <button
                  type="button"
                  onClick={() => { onEraseModeChange("all"); onClick(); }}
                  style={{
                    height: 36,
                    borderRadius: 12,
                    border: eraseMode === "all" ? "1px solid rgba(120,190,255,0.82)" : "1px solid rgba(255,255,255,0.08)",
                    background: eraseMode === "all" ? "rgba(120,190,255,0.16)" : "rgba(255,255,255,0.035)",
                    color: eraseMode === "all" ? "#d7eeff" : "rgba(255,255,255,0.86)",
                    cursor: "pointer",
                    fontSize: 12,
                    fontWeight: 600,
                  }}
                >
                  Erase all colors
                </button>
              </div>
            ) : null}

            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
              {ANNOTATION_COLORS.map((swatch) => {
                const selected = swatch.toLowerCase() === color.toLowerCase();
                return (
                  <button
                    key={swatch}
                    type="button"
                    onClick={() => {
                      onColorChange(swatch);
                      onColorCommit?.(swatch);
                      onClick();
                    }}
                    aria-label={`Choose ${swatch}`}
                    title={swatch}
                    style={{
                      width: 24,
                      height: 24,
                      padding: 0,
                      borderRadius: 999,
                      border: selected ? "2px solid rgba(255,255,255,0.95)" : "1px solid rgba(255,255,255,0.18)",
                      background: "transparent",
                      boxShadow: selected ? "0 0 0 2px rgba(120,190,255,0.34)" : "none",
                      cursor: "pointer",
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      appearance: "none",
                      WebkitAppearance: "none",
                    }}
                  >
                    <span
                      aria-hidden="true"
                      style={{
                        width: 16,
                        height: 16,
                        borderRadius: 999,
                        background: swatch,
                        display: "block",
                        boxShadow: swatch.toLowerCase() === "#ffffff"
                          ? "inset 0 0 0 1px rgba(24,33,43,0.22)"
                          : "none",
                      }}
                    />
                  </button>
                );
              })}
            </div>

            {shape !== "eraser" && recentColors.length > 0 ? (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
                {recentColors.map((swatch) => {
                  const selected = swatch.toLowerCase() === color.toLowerCase();
                  return (
                    <button
                      key={swatch}
                      type="button"
                      onClick={() => {
                        onColorChange(swatch);
                        onColorCommit?.(swatch);
                        onClick();
                      }}
                      title={`Recent ${swatch}`}
                      aria-label={`Recent ${swatch}`}
                      style={{
                        width: 22,
                        height: 22,
                        padding: 0,
                        borderRadius: 999,
                        border: selected ? "2px solid rgba(160,220,255,0.95)" : "1px solid rgba(255,255,255,0.14)",
                        background: "transparent",
                        cursor: "pointer",
                        opacity: 0.95,
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        appearance: "none",
                        WebkitAppearance: "none",
                      }}
                    >
                      <span
                        aria-hidden="true"
                        style={{
                          width: 14,
                          height: 14,
                          borderRadius: 999,
                          background: swatch,
                          display: "block",
                          boxShadow: swatch.toLowerCase() === "#ffffff"
                            ? "inset 0 0 0 1px rgba(24,33,43,0.22)"
                            : "none",
                        }}
                      />
                    </button>
                  );
                })}
              </div>
            ) : null}

            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <CircularColorInput color={color} onChange={(nextColor) => { onColorChange(nextColor); onClick(); }} onCommit={(nextColor) => onColorCommit?.(nextColor)} />
                {shape !== "eraser" && canUseEyeDropper ? (
                  <button
                    type="button"
                    onClick={() => {
                      onClick();
                      void onPickColorFromScreen?.();
                    }}
                    title="Pick a color from the viewer"
                    aria-label="Pick a color from the viewer"
                    style={{
                      width: 30,
                      height: 30,
                      borderRadius: 999,
                      border: "1px solid rgba(255,255,255,0.16)",
                      background: "rgba(255,255,255,0.04)",
                      color: "rgba(255,255,255,0.88)",
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      cursor: "pointer",
                    }}
                  >
                    <EyeDropperIcon />
                  </button>
                ) : null}
              </div>
              <div style={{ fontSize: 11, opacity: 0.74 }}>{color.toUpperCase()}</div>
            </div>

            {shape !== "eraser" ? (
            <div style={{ display: "grid", gap: 8 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.86)" }}>Opacity</span>
                <div style={{ fontSize: 11, opacity: 0.72 }}>{Math.round(opacity * 100)}%</div>
              </div>
              <OpacitySlider color={color} opacity={opacity} onChange={(next) => { onOpacityChange(next); onClick(); }} />
            </div>
            ) : null}
          </div>

          {needsSizeControl(shape) ? (
            <div style={{ display: "grid", gap: 8 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, color: "rgba(255,255,255,0.86)" }}>
                  <span style={{ fontSize: 12, fontWeight: 700 }}>{buildSizeLabel(shape)}</span>
                </div>
                <div style={{ fontSize: 11, opacity: 0.72 }}>{size.toFixed(3)}</div>
              </div>
              <ThicknessSlider shape={shape} size={size} onChange={(next) => onSizeChange(next)} />
            </div>
          ) : null}

          {(shape === "freehand" || shape === "eraser") ? (
            <div style={{ display: "grid", gap: 8 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, color: "rgba(255,255,255,0.86)" }}>
                  <span style={{ fontSize: 12, fontWeight: 700 }}>Brush depth</span>
                </div>
                <div style={{ fontSize: 11, opacity: 0.72 }}>{depth.toFixed(3)}</div>
              </div>
              <ThicknessSlider shape={shape} size={depth} onChange={(next) => onDepthChange(next)} />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function HistoryButton({ direction, disabled, onClick, items, onJump, canClearHistory = false, onRequestClearHistory, }: { direction: "undo" | "redo"; disabled: boolean; onClick: () => void; items: HistoryMenuItem[]; onJump?: (steps: number) => void; canClearHistory?: boolean; onRequestClearHistory?: () => void; }) {
  const [isHovered, setIsHovered] = useState(false);
  const label = direction === "undo" ? "Undo" : "Redo";
  const title = disabled ? label : `${label} · hover for history`;
  const showMenu = isHovered && items.length > 0;

  return (
    <div style={{ position: "relative" }} onMouseEnter={() => setIsHovered(true)} onMouseLeave={() => setIsHovered(false)}>
      <button type="button" title={title} aria-label={label} disabled={disabled} onClick={onClick} style={{ width: 44, height: 44, borderRadius: 14, border: "1px solid rgba(255,255,255,0.08)", background: disabled ? "rgba(255,255,255,0.02)" : "rgba(255,255,255,0.03)", color: disabled ? "rgba(255,255,255,0.28)" : "rgba(255,255,255,0.82)", display: "flex", alignItems: "center", justifyContent: "center", cursor: disabled ? "not-allowed" : "pointer", transition: "all 160ms ease" }}>
        <HistoryIcon direction={direction} />
      </button>
      <div style={{ position: "absolute", left: "50%", bottom: "100%", paddingBottom: 12, transform: showMenu ? "translate(-50%, 0)" : "translate(-50%, 8px)", opacity: showMenu ? 1 : 0, visibility: showMenu ? "visible" : "hidden", pointerEvents: showMenu ? "auto" : "none", transition: "opacity 180ms ease, transform 220ms ease, visibility 180ms ease", zIndex: 40 }}>
        <div data-theme-surface="panel" style={{ width: 320, maxHeight: 320, overflow: "hidden", borderRadius: 16, background: "rgba(12,14,18,0.96)", border: "1px solid rgba(255,255,255,0.10)", boxShadow: "0 16px 40px rgba(0,0,0,0.40)", backdropFilter: "blur(14px)", padding: 10, color: "white" }}>
          <div className="history-menu-scroll" style={{ display: "grid", gap: 6, maxHeight: canClearHistory ? 220 : 256, overflowY: "auto", paddingRight: 4 }}>
            {items.map((item, index) => (
              <button key={item.id} type="button" onClick={() => onJump?.(index + 1)} style={{ textAlign: "left", borderRadius: 12, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.04)", color: "white", padding: "10px 12px", cursor: "pointer" }}>
                <div style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.35 }}>{item.label}</div>
                {item.meta ? <div style={{ fontSize: 11, opacity: 0.62, marginTop: 4 }}>{item.meta}</div> : null}
              </button>
            ))}
          </div>
          {canClearHistory ? (
            <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid rgba(255,255,255,0.08)", display: "flex", justifyContent: "flex-end" }}>
              <button type="button" onClick={() => onRequestClearHistory?.()} style={{ border: "none", background: "transparent", color: "rgba(255,140,140,0.92)", cursor: "pointer", fontSize: 12, fontWeight: 600, padding: "4px 2px" }}>
                Clear history
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export default function BottomToolbar({
  activeTool,
  onToolChange,
  cameraMode,
  onCameraModeChange,
  onFocusSelectedLayer,
  onSaveCurrentViewer,
  saveNoticeOpen = false,
  saveNoticeContent = null,
  onRequestCloseSaveNotice,
  statePopoverOpen = false,
  statePopoverContent = null,
  onRequestCloseStatePopover,
  accountPopoverOpen = false,
  shareBlockedLayerNames = [],
  sliceMode = "canonical",
  sliceSelectedLayerName = null,
  sliceTargetPlane = null,
  sliceHoveredPlane = null,
  sliceCanResetToCenter = false,
  sliceRotationDeg = 0,
  sliceScale = 1,
  sliceFlipX = false,
  sliceFlipY = false,
  sliceFlipZ = false,
  sliceVisibilityXY = true,
  sliceVisibilityXZ = true,
  sliceVisibilityYZ = true,
  sliceCanCreateFreeSlice = false,
  sliceFreeSliceOffset = 0,
  onSliceHoverLockChange,
  onSliceToggleVisibility = () => {},
  onSliceResetView,
  onSliceToggleFlip,
  onSliceResetToCenter,
  onSliceRotate,
  onSliceScale,
  onSliceCreateFreeSlice,
  onSliceNudgeFreeOffset,
  onSliceTiltFreeSlice,
  onSliceSnapFreeSlice,
  annotationShape,
  annotationColor,
  annotationOpacity,
  annotationSize,
  annotationDepth,
  annotationEraseMode,
  annotationRecentColors = [],
  onAnnotationShapeChange,
  onAnnotationColorChange,
  onAnnotationColorCommit,
  onAnnotationOpacityChange,
  onAnnotationSizeChange,
  onAnnotationDepthChange,
  onAnnotationEraseModeChange,
  onAnnotationPickColorFromScreen,
  canUndo = false,
  canRedo = false,
  onUndo,
  onRedo,
  canClearHistory = false,
  onRequestClearHistory,
  undoItems = [],
  redoItems = [],
  onJumpUndo,
  onJumpRedo,
  windows = [],
  onFocusWindow,
  onRestoreWindow,
  onCloseWindow,
  onCreateNoteAnnotation,
  pipelines = [],
  onOpenPipeline,
  onTogglePipeline,
  assistantOpen = false,
  onToggleAssistant,
  onToggleResourceManager,
  onQuickAssistantSubmit,
  resourceManagerOpen = false,
  resourceSummary = null,
  resourceSamples = [],
  captureStills = [],
  captureSequences = [],
  capturePlaybackActive = false,
  capturePlaybackPaused = false,
  onOpenCaptureEditor,
  onExportCaptureFrame,
  captureExportEnabled = false,
  captureExportPending = false,
  onToggleCapturePlayback,
  onStopCapturePlayback,
  onLoadCaptureStill,
  onDownloadCaptureStill,
  onDeleteCaptureStill,
  onLoadCaptureSequence,
  onPlayCaptureSequence,
  onLoopCaptureSequence,
  onRenameCaptureSequence,
  onDeleteCaptureSequence,
  toolbarToolIds = DEFAULT_TOOLBAR_TOOL_IDS,
  toolbarEditMode = false,
  onToolbarEditModeChange,
  onToolbarMove,
  onToolbarHide,
  onToolbarShow,
}: {
  activeTool: ToolId;
  onToolChange: (tool: ToolId) => void;
  cameraMode: CameraControlMode;
  onCameraModeChange: (mode: CameraControlMode) => void;
  onFocusSelectedLayer?: () => void;
  onSaveCurrentViewer?: () => void;
  saveNoticeOpen?: boolean;
  saveNoticeContent?: ReactNode;
  onRequestCloseSaveNotice?: () => void;
  sliceMode?: "canonical" | "free";
  sliceSelectedLayerName?: string | null;
  sliceTargetPlane?: SlicePlane | null;
  sliceHoveredPlane?: SlicePlane | null;
  sliceCanResetToCenter?: boolean;
  sliceRotationDeg?: number;
  sliceScale?: number;
  sliceFlipX?: boolean;
  sliceFlipY?: boolean;
  sliceFlipZ?: boolean;
  sliceVisibilityXY?: boolean;
  sliceVisibilityXZ?: boolean;
  sliceVisibilityYZ?: boolean;
  sliceCanCreateFreeSlice?: boolean;
  sliceFreeSliceOffset?: number;
  onSliceHoverLockChange?: (locked: boolean) => void;
  onSliceToggleVisibility?: (plane: SlicePlane) => void;
  onSliceResetView?: () => void;
  onSliceToggleFlip?: (axis: "x" | "y" | "z") => void;
  onSliceResetToCenter?: () => void;
  onSliceRotate?: (deltaDeg: number) => void;
  onSliceScale?: (delta: number) => void;
  onSliceCreateFreeSlice?: () => void;
  onSliceNudgeFreeOffset?: (delta: number) => void;
  onSliceTiltFreeSlice?: (axis: "u" | "v", deltaDeg: number) => void;
  onSliceSnapFreeSlice?: (plane: SlicePlane) => void;
  statePopoverOpen?: boolean;
  statePopoverContent?: ReactNode;
  onRequestCloseStatePopover?: () => void;
  accountPopoverOpen?: boolean;
  shareBlockedLayerNames?: string[];
  annotationShape: AnnotationShape;
  annotationColor: string;
  annotationOpacity: number;
  annotationSize: number;
  annotationDepth: number;
  annotationEraseMode: "all" | "color";
  annotationRecentColors?: string[];
  onAnnotationShapeChange: (shape: AnnotationShape) => void;
  onAnnotationColorChange: (color: string) => void;
  onAnnotationColorCommit?: (color: string) => void;
  onAnnotationOpacityChange: (opacity: number) => void;
  onAnnotationSizeChange: (size: number) => void;
  onAnnotationDepthChange: (depth: number) => void;
  onAnnotationEraseModeChange: (mode: "all" | "color") => void;
  onAnnotationPickColorFromScreen?: () => void | Promise<void>;
  canUndo?: boolean;
  canRedo?: boolean;
  onUndo?: () => void;
  onRedo?: () => void;
  canClearHistory?: boolean;
  onRequestClearHistory?: () => void;
  undoItems?: HistoryMenuItem[];
  redoItems?: HistoryMenuItem[];
  onJumpUndo?: (steps: number) => void;
  onJumpRedo?: (steps: number) => void;
  windows?: FloatingWindowState[];
  onFocusWindow?: (id: string) => void;
  onRestoreWindow?: (id: string) => void;
  onCloseWindow?: (id: string) => void;
  onCreateNoteAnnotation?: () => void;
  pipelines?: PipelineMenuItem[];
  onOpenPipeline?: (pipelineId: string) => void;
  onTogglePipeline?: (pipelineId: string, active: boolean) => void;
  assistantOpen?: boolean;
  onToggleAssistant?: () => void;
  onToggleResourceManager?: () => void;
  onQuickAssistantSubmit?: (prompt: string) => void;
  resourceManagerOpen?: boolean;
  resourceSummary?: BrowserResourceSummary | null;
  resourceSamples?: ResourceHistorySample[];
  captureStills?: CaptureStillMenuItem[];
  captureSequences?: CaptureSequenceMenuItem[];
  capturePlaybackActive?: boolean;
  capturePlaybackPaused?: boolean;
  onOpenCaptureEditor?: () => void;
  onExportCaptureFrame?: () => void;
  captureExportEnabled?: boolean;
  captureExportPending?: boolean;
  onToggleCapturePlayback?: () => void;
  onStopCapturePlayback?: () => void;
  onLoadCaptureStill?: (stillId: string) => void;
  onDownloadCaptureStill?: (stillId: string) => void;
  onDeleteCaptureStill?: (stillId: string) => void;
  onLoadCaptureSequence?: (sequenceId: string) => void;
  onPlayCaptureSequence?: (sequenceId: string) => void;
  onLoopCaptureSequence?: (sequenceId: string) => void;
  onRenameCaptureSequence?: (sequenceId: string, nextName: string) => void;
  onDeleteCaptureSequence?: (sequenceId: string) => void;
  toolbarToolIds?: ToolbarToolId[];
  hiddenToolbarToolIds?: ToolbarToolId[];
  toolbarEditMode?: boolean;
  onToolbarEditModeChange?: (editing: boolean) => void;
  onToolbarMove?: (draggedToolId: ToolbarToolId, targetToolId: ToolbarToolId) => void;
  onToolbarHide?: (toolId: ToolbarToolId) => void;
  onToolbarShow?: (toolId: ToolbarToolId) => void;
}) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const toolExplorerPanelRef = useRef<HTMLDivElement | null>(null);
  const [draggedToolId, setDraggedToolId] = useState<ToolbarToolId | null>(null);
  const [dropTargetToolId, setDropTargetToolId] = useState<ToolbarToolId | null>(null);
  const [toolExplorerOpen, setToolExplorerOpen] = useState(false);
  const [toolExplorerQuery, setToolExplorerQuery] = useState("");
  const [selectedExplorerToolId, setSelectedExplorerToolId] = useState<ToolbarToolId | null>(null);
  const [toolbarPinnedOpen, setToolbarPinnedOpen] = useState(true);
  const [toolbarRevealActive, setToolbarRevealActive] = useState(false);
  const [toolbarHovered, setToolbarHovered] = useState(false);

  useEffect(() => {
    if (!saveNoticeOpen && !statePopoverOpen) return;

    function handlePointerDown(event: PointerEvent) {
      const target = event.target as Node | null;
      if (!target) return;
      if (rootRef.current?.contains(target)) return;
      onRequestCloseSaveNotice?.();
      onRequestCloseStatePopover?.();
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onRequestCloseSaveNotice?.();
          onRequestCloseStatePopover?.();
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [saveNoticeOpen, statePopoverOpen, onRequestCloseSaveNotice, onRequestCloseStatePopover]);

  useEffect(() => {
    if (!toolbarEditMode) {
      setDraggedToolId(null);
      setDropTargetToolId(null);
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      const target = event.target as Node | null;
      if (!target) return;
      if (rootRef.current?.contains(target)) return;
      onToolbarEditModeChange?.(false);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onToolbarEditModeChange?.(false);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [toolbarEditMode, onToolbarEditModeChange]);

  useEffect(() => {
    if (!toolExplorerOpen) {
      setToolExplorerQuery("");
      setSelectedExplorerToolId(null);
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      const target = event.target as Node | null;
      if (!target) return;
      if (rootRef.current?.contains(target)) return;
      if (toolExplorerPanelRef.current?.contains(target)) return;
      setToolExplorerOpen(false);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        if (selectedExplorerToolId) {
          setSelectedExplorerToolId(null);
          return;
        }
        setToolExplorerOpen(false);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [toolExplorerOpen, selectedExplorerToolId]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    function handlePointerMove(event: PointerEvent) {
      const viewportHeight = window.innerHeight;
      const nearBottomEdge = viewportHeight - event.clientY <= TOOLBAR_REVEAL_ZONE_PX;
      setToolbarRevealActive(nearBottomEdge);
    }

    function handlePointerLeave() {
      setToolbarRevealActive(false);
    }

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerleave", handlePointerLeave);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerleave", handlePointerLeave);
    };
  }, []);

  const toolbarButtonEntries = useMemo(() => {
    const entries: ToolbarButtonEntry[] = [];

    toolbarToolIds.forEach((toolId) => {
      const tool = getToolbarToolManifest(toolId);
      const isActive = activeTool === tool.id;
      const extensionDefinition = getToolExtensionDefinition(tool.id);
      const utilityDefinition = getUtilityToolExtensionDefinition(tool.id);
      const rendererVariant: ToolbarRendererVariant =
        tool.id === "mouse"
          ? "core-mouse"
          : tool.id === "windows"
            ? "core-windows"
          : (extensionDefinition?.toolbarPresentation.variant ??
            utilityDefinition?.toolbarPresentation.variant ??
            "default");
      const renderers: Record<ToolbarRendererVariant, () => ReactNode> = {
        default: () => (
          <ToolButton
            key={tool.id}
            id={tool.id}
            label={tool.label}
            active={isActive}
            onClick={() => onToolChange(tool.id)}
          />
        ),
        "core-mouse": () => (
          <MoveToolButton
            key={tool.id}
            active={isActive}
            cameraMode={cameraMode}
            onClick={() => onToolChange(tool.id)}
            onCameraModeChange={onCameraModeChange}
            onFocusSelectedLayer={onFocusSelectedLayer}
          />
        ),
        "core-windows": () => (
          <WindowManagerToolButton
            key={tool.id}
            windows={windows}
            onFocusWindow={onFocusWindow ?? (() => {})}
            onRestoreWindow={onRestoreWindow ?? (() => {})}
            onCloseWindow={onCloseWindow ?? (() => {})}
            onCreateNoteAnnotation={onCreateNoteAnnotation ?? (() => {})}
          />
        ),
        annotation: () => (
          <PencilToolButton
            key={tool.id}
            active={activeTool === "pencil"}
            onClick={() => onToolChange(tool.id)}
            shape={annotationShape}
            color={annotationColor}
            opacity={annotationOpacity}
            size={annotationSize}
            depth={annotationDepth}
            recentColors={annotationRecentColors}
            canUseEyeDropper={typeof window !== "undefined" && typeof window.EyeDropper === "function"}
            eraseMode={annotationEraseMode}
            onShapeChange={onAnnotationShapeChange}
            onColorChange={onAnnotationColorChange}
            onColorCommit={onAnnotationColorCommit}
            onOpacityChange={onAnnotationOpacityChange}
            onSizeChange={onAnnotationSizeChange}
            onDepthChange={onAnnotationDepthChange}
            onEraseModeChange={onAnnotationEraseModeChange}
            onPickColorFromScreen={onAnnotationPickColorFromScreen}
          />
        ),
        capture: () => (
          <CaptureToolButton
            key={tool.id}
            active={activeTool === "capture" || capturePlaybackActive || capturePlaybackPaused}
            onOpenEditor={() => {
              onToolChange(tool.id);
            }}
            onCreateSequence={() => onOpenCaptureEditor?.()}
            onExportFrame={() => onExportCaptureFrame?.()}
            canExportFrame={captureExportEnabled}
            exportPending={captureExportPending}
            isPlaybackActive={capturePlaybackActive}
            isPlaybackPaused={capturePlaybackPaused}
            onTogglePlayback={() => onToggleCapturePlayback?.()}
            onStopPlayback={() => onStopCapturePlayback?.()}
            stills={captureStills}
            sequences={captureSequences}
            onLoadStill={(stillId) => onLoadCaptureStill?.(stillId)}
            onDownloadStill={(stillId) => onDownloadCaptureStill?.(stillId)}
            onDeleteStill={(stillId) => onDeleteCaptureStill?.(stillId)}
            onLoadSequence={(sequenceId) => onLoadCaptureSequence?.(sequenceId)}
            onPlaySequence={(sequenceId) => onPlayCaptureSequence?.(sequenceId)}
            onLoopSequence={(sequenceId) => onLoopCaptureSequence?.(sequenceId)}
            onRenameSequence={(sequenceId, nextName) => onRenameCaptureSequence?.(sequenceId, nextName)}
            onDeleteSequence={(sequenceId) => onDeleteCaptureSequence?.(sequenceId)}
          />
        ),
        slice: () => (
          <SliceToolButton
            key={tool.id}
            active={activeTool === "slice"}
            onClick={() => onToolChange(tool.id)}
            onHoverLockChange={onSliceHoverLockChange}
            mode={sliceMode}
            selectedLayerName={sliceSelectedLayerName}
            targetPlane={sliceTargetPlane}
            hoveredPlane={sliceHoveredPlane}
            hasSelectedLayer={!!sliceSelectedLayerName}
            canResetToCenter={sliceCanResetToCenter}
            canAdjustView={!!sliceSelectedLayerName && (sliceMode === "free" || !!sliceTargetPlane)}
            rotationDeg={sliceRotationDeg}
            scale={sliceScale}
            flipX={sliceFlipX}
            flipY={sliceFlipY}
            flipZ={sliceFlipZ}
            visibilityXY={sliceVisibilityXY}
            visibilityXZ={sliceVisibilityXZ}
            visibilityYZ={sliceVisibilityYZ}
            canCreateFreeSlice={sliceCanCreateFreeSlice}
            freeSliceOffset={sliceFreeSliceOffset}
            onToggleVisibility={onSliceToggleVisibility}
            onResetSliceView={onSliceResetView ?? (() => {})}
            onToggleFlip={onSliceToggleFlip ?? (() => {})}
            onResetToCenter={onSliceResetToCenter ?? (() => {})}
            onRotate={onSliceRotate ?? (() => {})}
            onScale={onSliceScale ?? (() => {})}
            onCreateFreeSlice={onSliceCreateFreeSlice ?? (() => {})}
            onNudgeFreeOffset={onSliceNudgeFreeOffset ?? (() => {})}
            onTiltFreeSlice={onSliceTiltFreeSlice ?? (() => {})}
            onSnapFreeSlice={onSliceSnapFreeSlice ?? (() => {})}
          />
        ),
        pipeline: () => (
          <PipelineToolButton
            key={tool.id}
            active={activeTool === "pipeline"}
            pipelines={pipelines}
            onClick={() => onToolChange(tool.id)}
            onOpenPipeline={(pipelineId) => {
              onOpenPipeline?.(pipelineId);
              onToolChange("pipeline");
            }}
            onTogglePipeline={onTogglePipeline ?? (() => {})}
          />
        ),
        assistant: () => (
          <AssistantToolButton
            key={tool.id}
            active={assistantOpen}
            onClick={() => onToggleAssistant?.()}
            onSubmit={onQuickAssistantSubmit ?? (() => {})}
          />
        ),
        resources: () => (
          <ResourceToolButton
            key={tool.id}
            active={resourceManagerOpen}
            summary={resourceSummary ?? null}
            samples={resourceSamples ?? []}
            onClick={() => onToggleResourceManager?.()}
          />
        ),
      };

      entries.push({
        toolId: tool.id,
        kind: tool.kind,
        removable: tool.toolbar.removable,
        node: renderers[rendererVariant](),
      });
    });

    return entries;
  }, [activeTool, statePopoverOpen, accountPopoverOpen, saveNoticeOpen, cameraMode, onCameraModeChange, onFocusSelectedLayer, onSaveCurrentViewer, onToolChange, saveNoticeContent, sliceMode, sliceSelectedLayerName, sliceTargetPlane, sliceHoveredPlane, sliceCanResetToCenter, sliceRotationDeg, sliceScale, sliceFlipX, sliceFlipY, sliceFlipZ, sliceVisibilityXY, sliceVisibilityXZ, sliceVisibilityYZ, sliceCanCreateFreeSlice, sliceFreeSliceOffset, onSliceHoverLockChange, onSliceToggleVisibility, onSliceResetView, onSliceToggleFlip, onSliceResetToCenter, onSliceRotate, onSliceScale, onSliceCreateFreeSlice, onSliceNudgeFreeOffset, onSliceTiltFreeSlice, onSliceSnapFreeSlice, annotationShape, annotationColor, annotationOpacity, annotationSize, annotationDepth, annotationEraseMode, annotationRecentColors, onAnnotationShapeChange, onAnnotationColorChange, onAnnotationColorCommit, onAnnotationOpacityChange, onAnnotationSizeChange, onAnnotationDepthChange, onAnnotationEraseModeChange, onAnnotationPickColorFromScreen, pipelines, onOpenPipeline, onTogglePipeline, assistantOpen, onToggleAssistant, onQuickAssistantSubmit, resourceManagerOpen, resourceSummary, resourceSamples, onToggleResourceManager, windows, onFocusWindow, onRestoreWindow, onCloseWindow, onCreateNoteAnnotation, toolbarToolIds]);
  const activeDraggedToolbarEntry = useMemo(
    () => toolbarButtonEntries.find((entry) => entry.toolId === draggedToolId) ?? null,
    [toolbarButtonEntries, draggedToolId]
  );

  const visibleToolbarToolIdSet = useMemo(
    () => new Set(toolbarToolIds),
    [toolbarToolIds]
  );

  const filteredExplorerTools = useMemo(() => {
    const query = toolExplorerQuery.trim().toLowerCase();
    if (!query) return TOOLBAR_TOOL_MANIFESTS;

    return TOOLBAR_TOOL_MANIFESTS.filter((tool) => {
      const searchable = [
        tool.label,
        tool.description,
        tool.developerName,
        formatToolKindLabel(tool.kind),
        formatToolSourceLabel(tool.source),
        formatToolStatusLabel(tool.status),
        ...tool.keywords,
      ]
        .join(" ")
        .toLowerCase();
      return searchable.includes(query);
    });
  }, [toolExplorerQuery]);

  const selectedExplorerTool = useMemo(
    () => (selectedExplorerToolId ? getToolbarToolManifest(selectedExplorerToolId) : null),
    [selectedExplorerToolId]
  );
  const selectedExplorerToolDocumentation = useMemo(
    () => (selectedExplorerToolId ? getToolbarToolDocumentation(selectedExplorerToolId) : null),
    [selectedExplorerToolId]
  );
  const toolbarVisible =
    toolbarPinnedOpen ||
    toolbarRevealActive ||
    toolbarHovered ||
    toolExplorerOpen ||
    draggedToolId !== null ||
    saveNoticeOpen ||
    statePopoverOpen;
  const toolbarHandleActive = toolbarVisible || toolbarRevealActive;
  const toolbarSensors = useSensors(
    useSensor(MouseSensor, {
      activationConstraint: {
        distance: 4,
      },
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 100,
        tolerance: 8,
      },
    })
  );

  function handleToolbarDragStart(event: DragStartEvent) {
    const toolId = String(event.active.id) as ToolbarToolId;
    setDraggedToolId(toolId);
    setDropTargetToolId(toolId);
  }

  function handleToolbarDragOver(event: DragOverEvent) {
    const overId = event.over?.id ? String(event.over.id) : null;
    if (!overId || overId === TOOLBAR_TRASH_DROP_ID) {
      setDropTargetToolId(null);
      return;
    }
    setDropTargetToolId(overId as ToolbarToolId);
  }

  function handleToolbarDragEnd(event: DragEndEvent) {
    const activeId = String(event.active.id) as ToolbarToolId;
    const overId = event.over?.id ? String(event.over.id) : null;
    const activeTool = getToolbarToolManifest(activeId);

    if (overId === TOOLBAR_TRASH_DROP_ID) {
      if (activeTool.toolbar.removable) {
        onToolbarHide?.(activeId);
      }
    } else if (overId && overId !== activeId) {
      onToolbarMove?.(activeId, overId as ToolbarToolId);
    }

    setDraggedToolId(null);
    setDropTargetToolId(null);
  }

  return (
    <>
      <style>{`
        .history-menu-scroll { scrollbar-width: thin; scrollbar-color: rgba(140, 190, 255, 0.45) rgba(255,255,255,0.06); }
        .history-menu-scroll::-webkit-scrollbar { width: 10px; }
	        .history-menu-scroll::-webkit-scrollbar-track { background: rgba(255,255,255,0.05); border-radius: 999px; }
	        .history-menu-scroll::-webkit-scrollbar-thumb { background: linear-gradient(180deg, rgba(140,190,255,0.52), rgba(90,150,230,0.34)); border-radius: 999px; border: 2px solid rgba(12,14,18,0.82); }
	        .history-menu-scroll::-webkit-scrollbar-thumb:hover { background: linear-gradient(180deg, rgba(160,210,255,0.68), rgba(110,170,245,0.48)); }
          @keyframes toolbar-edit-wiggle {
            0% { transform: rotate(-1.7deg); }
            50% { transform: rotate(1.7deg); }
            100% { transform: rotate(-1.7deg); }
          }
	      `}</style>
      <div
        ref={rootRef}
        onPointerEnter={() => setToolbarHovered(true)}
        onPointerLeave={() => setToolbarHovered(false)}
        style={{
          position: "absolute",
          left: "50%",
          bottom: 10,
          transform: "translateX(-50%)",
          zIndex: 50,
          display: "grid",
          justifyItems: "center",
          gap: 10,
        }}
      >
        <div style={{ position: "absolute", left: "50%", bottom: "calc(100% + 12px)", transform: statePopoverOpen ? "translate(-50%, 0)" : "translate(-50%, 10px)", opacity: statePopoverOpen ? 1 : 0, pointerEvents: statePopoverOpen ? "auto" : "none", transition: "opacity 180ms ease, transform 220ms ease, visibility 180ms ease", visibility: statePopoverOpen ? "visible" : "hidden" }}>
          <div data-theme-surface="panel" style={{ minWidth: 520, maxWidth: 760, borderRadius: 18, background: "rgba(12,14,18,0.94)", border: "1px solid rgba(255,255,255,0.10)", boxShadow: "0 16px 40px rgba(0,0,0,0.40)", backdropFilter: "blur(14px)", padding: 12, color: "white" }}>
            {shareBlockedLayerNames.length > 0 ? (
              <div
                style={{
                  marginBottom: 12,
                  borderRadius: 14,
                  border: "1px solid rgba(255, 184, 77, 0.32)",
                  background: "rgba(255, 184, 77, 0.10)",
                  padding: 12,
                  display: "grid",
                  gap: 8,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div
                    aria-hidden="true"
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: 999,
                      background: "rgba(255, 184, 77, 0.95)",
                      boxShadow: "0 0 0 4px rgba(255, 184, 77, 0.14)",
                      flexShrink: 0,
                    }}
                  />
                  <div style={{ fontSize: 13, fontWeight: 700, color: "rgba(255, 225, 175, 0.98)" }}>
                    Some layers cannot be shared
                  </div>
                </div>
                <div style={{ fontSize: 12, lineHeight: 1.5, color: "rgba(255,255,255,0.84)" }}>
                  This viewer uses {shareBlockedLayerNames.length} personal browser-hosted {shareBlockedLayerNames.length === 1 ? "layer" : "layers"}. These layers stay local to your browser and will not be available to other people through the shared link.
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {shareBlockedLayerNames.map((layerName) => (
                    <span
                      key={layerName}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        minHeight: 26,
                        padding: "4px 10px",
                        borderRadius: 999,
                        border: "1px solid rgba(255,255,255,0.10)",
                        background: "rgba(255,255,255,0.06)",
                        fontSize: 11,
                        fontWeight: 600,
                        color: "rgba(255,255,255,0.88)",
                      }}
                    >
                      {layerName}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}
            {statePopoverContent}
          </div>
        </div>
        {toolExplorerOpen && typeof document !== "undefined"
          ? createPortal(
              <div
                style={{
                  position: "fixed",
                  inset: 0,
                  zIndex: 1200,
                  background: "rgba(4,6,10,0.58)",
                  backdropFilter: "blur(12px)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: 20,
                }}
                onClick={() => setToolExplorerOpen(false)}
              >
                <div
                  ref={toolExplorerPanelRef}
                  data-theme-surface="panel"
                  onClick={(event) => event.stopPropagation()}
                  style={{
                    width: "min(1180px, calc(100vw - 32px))",
                    height: "min(720px, calc(100vh - 40px))",
                    minHeight: 520,
                    borderRadius: 26,
                    background: "rgba(12,14,18,0.96)",
                    border: "1px solid rgba(255,255,255,0.10)",
                    boxShadow: "0 28px 90px rgba(0,0,0,0.48)",
                    backdropFilter: "blur(18px)",
                    color: "white",
                    overflow: "hidden",
                  }}
                >
            <div style={{ display: "flex", width: "200%", height: "100%", transform: selectedExplorerTool ? "translateX(-50%)" : "translateX(0)", transition: "transform 220ms ease" }}>
              <div style={{ width: "50%", height: "100%", padding: 18, boxSizing: "border-box", display: "grid", gap: 14, gridTemplateRows: "auto auto minmax(0, 1fr)" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                  <div>
                    <div style={{ fontSize: 16, fontWeight: 900, letterSpacing: 0.2 }}>Tool explorer</div>
                    <div style={{ marginTop: 4, fontSize: 12, color: "rgba(255,255,255,0.62)" }}>
                      Browse built-in tools and extensions, then add the ones you want in your toolbar.
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setToolExplorerOpen(false)}
                    aria-label="Close tool explorer"
                    title="Close"
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 10,
                      border: "1px solid rgba(255,255,255,0.10)",
                      background: "rgba(255,255,255,0.04)",
                      color: "rgba(255,255,255,0.78)",
                      cursor: "pointer",
                    }}
                  >
                    <CloseSmallIcon />
                  </button>
                </div>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    minHeight: 40,
                    borderRadius: 12,
                    border: "1px solid rgba(255,255,255,0.10)",
                    background: "rgba(255,255,255,0.04)",
                    padding: "0 12px",
                  }}
                >
                  <SearchSmallIcon />
                  <input
                    value={toolExplorerQuery}
                    onChange={(event) => setToolExplorerQuery(event.target.value)}
                    placeholder="Search tools, developers, tags..."
                    style={{ flex: 1, background: "transparent", border: "none", outline: "none", color: "white", fontSize: 13, fontFamily: UI_FONT_FAMILY }}
                  />
                </div>
                <div className="history-menu-scroll" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12, overflowY: "auto", paddingRight: 6, alignContent: "start" }}>
                  {filteredExplorerTools.map((tool) => {
                    const isVisible = visibleToolbarToolIdSet.has(tool.id);
                    const canAdd = !isVisible;
                    return (
                      <div
                        key={tool.id}
                        onClick={() => setSelectedExplorerToolId(tool.id)}
                        style={{
                          position: "relative",
                          borderRadius: 16,
                          border: "1px solid rgba(255,255,255,0.10)",
                          background: isVisible ? "rgba(255,255,255,0.035)" : "rgba(255,255,255,0.05)",
                          padding: 14,
                          display: "grid",
                          gap: 10,
                          cursor: "pointer",
                          opacity: isVisible ? 0.62 : 1,
                        }}
                      >
                        <div style={{ display: "grid", gridTemplateColumns: "44px minmax(0, 1fr) 26px", alignItems: "center", gap: 10 }}>
                          <div style={{ width: 44, height: 44, borderRadius: 13, border: "1px solid rgba(255,255,255,0.10)", background: "rgba(255,255,255,0.04)", display: "flex", alignItems: "center", justifyContent: "center", color: "rgba(255,255,255,0.9)" }}>
                            <Icon id={tool.id} />
                          </div>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontSize: 13, fontWeight: 800, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "100%" }}>
                              {tool.label}
                            </div>
                            <div style={{ marginTop: 3, fontSize: 11, color: "rgba(255,255,255,0.60)" }}>
                              {tool.developerName}
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              if (canAdd) {
                                onToolbarShow?.(tool.id);
                              }
                            }}
                            disabled={!canAdd}
                            title={canAdd ? `Add ${tool.label}` : `${tool.label} is already in the toolbar`}
                            aria-label={canAdd ? `Add ${tool.label}` : `${tool.label} is already in the toolbar`}
                            style={{
                              width: 26,
                              height: 26,
                              borderRadius: 999,
                              border: canAdd ? "1px solid rgba(120,190,255,0.30)" : "1px solid rgba(255,255,255,0.10)",
                              background: canAdd ? "rgba(120,190,255,0.14)" : "rgba(255,255,255,0.04)",
                              color: canAdd ? "rgba(230,244,255,0.98)" : "rgba(255,255,255,0.42)",
                              padding: 0,
                              cursor: canAdd ? "pointer" : "default",
                              fontSize: 16,
                              fontWeight: 700,
                              lineHeight: 1,
                              fontFamily: UI_FONT_FAMILY,
                              display: "inline-flex",
                              alignItems: "center",
                              justifyContent: "center",
                            }}
                          >
                            +
                          </button>
                        </div>
                        <div style={{ fontSize: 11, lineHeight: 1.45, color: "rgba(255,255,255,0.74)", minHeight: 62 }}>
                          {tool.description}
                        </div>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                          <ToolTag label={formatToolSourceLabel(tool.source)} />
                          <ToolTag label={formatToolKindLabel(tool.kind)} tone={tool.kind === "extension" ? "accent" : "default"} />
                          <ToolTag label={formatToolStatusLabel(tool.status)} tone={tool.status === "beta" ? "beta" : "default"} />
                        </div>
                      </div>
                    );
                  })}
                  {filteredExplorerTools.length === 0 ? (
                    <div
                      style={{
                        gridColumn: "1 / -1",
                        minHeight: 140,
                        borderRadius: 14,
                        border: "1px dashed rgba(255,255,255,0.14)",
                        background: "rgba(255,255,255,0.03)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        textAlign: "center",
                        padding: 24,
                        fontSize: 12,
                        color: "rgba(255,255,255,0.60)",
                      }}
                    >
                      No tools match this search.
                    </div>
                  ) : null}
                </div>
              </div>

              <div style={{ width: "50%", height: "100%", padding: 18, boxSizing: "border-box", borderLeft: "1px solid rgba(255,255,255,0.08)", display: "flex", flexDirection: "column", gap: 16, minHeight: 0 }}>
                {selectedExplorerTool ? (
                  <>
                    <div style={{ display: "grid", gap: 16, flex: "0 0 auto" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                      <button
                        type="button"
                        onClick={() => setSelectedExplorerToolId(null)}
                        style={{
                          height: 32,
                          borderRadius: 10,
                          border: "1px solid rgba(255,255,255,0.10)",
                          background: "rgba(255,255,255,0.04)",
                          color: "white",
                          padding: "0 10px",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 8,
                          cursor: "pointer",
                          fontSize: 12,
                          fontWeight: 700,
                          fontFamily: UI_FONT_FAMILY,
                        }}
                      >
                        <BackSmallIcon />
                        Back
                      </button>
                      {visibleToolbarToolIdSet.has(selectedExplorerTool.id) ? (
                        selectedExplorerTool.toolbar.removable ? (
                          <button
                            type="button"
                            onClick={() => onToolbarHide?.(selectedExplorerTool.id)}
                            style={{
                              height: 32,
                              borderRadius: 10,
                              border: "1px solid rgba(255,140,140,0.22)",
                              background: "rgba(180,68,68,0.14)",
                              color: "rgba(255,220,220,0.96)",
                              padding: "0 12px",
                              cursor: "pointer",
                              fontSize: 12,
                              fontWeight: 800,
                              fontFamily: UI_FONT_FAMILY,
                            }}
                          >
                            Remove from toolbar
                          </button>
                        ) : (
                          <ToolTag label="Always available" tone="accent" />
                        )
                      ) : (
                        <button
                          type="button"
                          onClick={() => onToolbarShow?.(selectedExplorerTool.id)}
                          style={{
                            height: 32,
                            borderRadius: 10,
                            border: "1px solid rgba(120,190,255,0.30)",
                            background: "rgba(120,190,255,0.16)",
                            color: "rgba(230,244,255,0.98)",
                            padding: "0 12px",
                            cursor: "pointer",
                            fontSize: 12,
                            fontWeight: 800,
                            fontFamily: UI_FONT_FAMILY,
                          }}
                        >
                          Add to toolbar
                        </button>
                      )}
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "60px minmax(0, 1fr) auto", alignItems: "center", gap: 12 }}>
                      <div style={{ width: 60, height: 60, borderRadius: 18, border: "1px solid rgba(255,255,255,0.10)", background: "rgba(255,255,255,0.04)", display: "flex", alignItems: "center", justifyContent: "center", color: "rgba(255,255,255,0.9)" }}>
                        <Icon id={selectedExplorerTool.id} />
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 18, fontWeight: 900 }}>{selectedExplorerTool.label}</div>
                        <div style={{ marginTop: 4, fontSize: 12, color: "rgba(255,255,255,0.64)" }}>
                          by {selectedExplorerTool.developerName}
                        </div>
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(88px, 1fr))", gap: 8 }}>
                        <div style={{ borderRadius: 12, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.04)", padding: "8px 10px", display: "grid", gap: 3 }}>
                          <div style={{ fontSize: 10, fontWeight: 900, color: "rgba(255,255,255,0.54)" }}>Version</div>
                          <div style={{ fontSize: 12, fontWeight: 800, color: "rgba(255,255,255,0.92)" }}>{selectedExplorerTool.version}</div>
                        </div>
                        <div style={{ borderRadius: 12, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.04)", padding: "8px 10px", display: "grid", gap: 3 }}>
                          <div style={{ fontSize: 10, fontWeight: 900, color: "rgba(255,255,255,0.54)" }}>Published</div>
                          <div style={{ fontSize: 12, fontWeight: 800, color: "rgba(255,255,255,0.92)" }}>{selectedExplorerTool.publishedAt}</div>
                        </div>
                      </div>
                    </div>

                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                      <ToolTag label={formatToolSourceLabel(selectedExplorerTool.source)} />
                      <ToolTag label={formatToolKindLabel(selectedExplorerTool.kind)} tone={selectedExplorerTool.kind === "extension" ? "accent" : "default"} />
                      <ToolTag label={formatToolStatusLabel(selectedExplorerTool.status)} tone={selectedExplorerTool.status === "beta" ? "beta" : "default"} />
                      {visibleToolbarToolIdSet.has(selectedExplorerTool.id) ? <ToolTag label="In toolbar" tone="accent" /> : null}
                    </div>

                    <div style={{ display: "grid", gap: 8 }}>
                      <div style={{ fontSize: 12, fontWeight: 900, color: "rgba(255,255,255,0.86)" }}>Description</div>
                      <div style={{ fontSize: 13, lineHeight: 1.6, color: "rgba(255,255,255,0.78)" }}>
                        {selectedExplorerTool.description}
                      </div>
                    </div>
                    </div>

                    {selectedExplorerToolDocumentation ? (
                      <div
                        style={{
                          flex: 1,
                          minHeight: 0,
                          borderRadius: 14,
                          border: "1px solid rgba(255,255,255,0.08)",
                          background: "rgba(255,255,255,0.04)",
                          overflow: "hidden",
                          display: "flex",
                          flexDirection: "column",
                        }}
                      >
                        <div style={{ width: "100%", height: 1, background: "rgba(255,255,255,0.10)", flexShrink: 0 }} />
                        <div
                          className="history-menu-scroll"
                          style={{
                            minHeight: 0,
                            overflowY: "auto",
                            padding: 14,
                            paddingRight: 8,
                            display: "grid",
                            gap: 12,
                          }}
                        >
                          {selectedExplorerToolDocumentation.assets.map((asset) => (
                            (() => {
                              const assetSrc = asset.src;
                              return (
                            <div
                              key={asset.id}
                              style={{
                                display: "grid",
                                gap: 10,
                              }}
                            >
                              {assetSrc ? (
                                <div style={{ display: "grid", gap: 8, justifyItems: "center" }}>
                                  <img
                                    src={assetSrc}
                                    alt={asset.alt}
                                    style={{
                                      width: "min(100%, 560px)",
                                      maxHeight: 512,
                                      borderRadius: 12,
                                      border: "1px solid rgba(255,255,255,0.08)",
                                      background: "rgba(0,0,0,0.18)",
                                      objectFit: "contain",
                                      justifySelf: "center",
                                    }}
                                  />
                                  <div
                                    style={{
                                      width: "min(100%, 560px)",
                                      fontSize: 12,
                                      lineHeight: 1.45,
                                      color: "rgba(255,255,255,0.66)",
                                      textAlign: "center",
                                    }}
                                  >
                                    {asset.title}
                                  </div>
                                </div>
                              ) : (
                                <div
                                  style={{
                                    minHeight: 132,
                                    borderRadius: 12,
                                    border: "1px dashed rgba(255,255,255,0.16)",
                                    background:
                                      "linear-gradient(135deg, rgba(255,255,255,0.05), rgba(255,255,255,0.02))",
                                    display: "grid",
                                    placeItems: "center",
                                    textAlign: "center",
                                    padding: 18,
                                    color: "rgba(255,255,255,0.56)",
                                    fontSize: 12,
                                    fontWeight: 700,
                                  }}
                                >
                                  GIF placeholder
                                </div>
                              )}
                            </div>
                              );
                            })()
                          ))}
                          <MetadataRichContent value={selectedExplorerToolDocumentation.content} />
                        </div>
                      </div>
                    ) : null}
                  </>
                ) : (
                  <div style={{ minHeight: 300, display: "grid", placeItems: "center", textAlign: "center", color: "rgba(255,255,255,0.58)", padding: 24 }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 900, color: "rgba(255,255,255,0.82)" }}>Tool details</div>
                      <div style={{ marginTop: 8, fontSize: 12, lineHeight: 1.5 }}>
                        Select a tool from the explorer to inspect its details, tags, version, and toolbar availability.
                      </div>
                    </div>
                  </div>
                )}
                  </div>
                </div>
              </div>
            </div>,
              document.body
            )
          : null}

        <div
          data-theme-surface="panel"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "10px 12px",
            borderRadius: 18,
            background: "rgba(12,14,18,0.78)",
            border: "1px solid rgba(255,255,255,0.10)",
            boxShadow: "0 10px 30px rgba(0,0,0,0.35)",
            backdropFilter: "blur(12px)",
            transform: toolbarVisible ? "translateY(0)" : `translateY(${TOOLBAR_HIDDEN_OFFSET_PX}px)`,
            opacity: toolbarVisible ? 1 : 0,
            pointerEvents: toolbarVisible ? "auto" : "none",
            transition: "transform 220ms ease, opacity 180ms ease",
          }}
        >
          <HistoryButton direction="undo" disabled={!canUndo} onClick={() => onUndo?.()} items={undoItems} onJump={onJumpUndo} canClearHistory={canClearHistory} onRequestClearHistory={onRequestClearHistory} />
	          <HistoryButton direction="redo" disabled={!canRedo} onClick={() => onRedo?.()} items={redoItems} onJump={onJumpRedo} canClearHistory={canClearHistory} onRequestClearHistory={onRequestClearHistory} />
	          <div style={{ width: 1, height: 26, background: "rgba(255,255,255,0.10)", margin: "0 2px" }} />
              <DndContext
                sensors={toolbarSensors}
                collisionDetection={closestCenter}
                onDragStart={handleToolbarDragStart}
                onDragOver={handleToolbarDragOver}
                onDragEnd={handleToolbarDragEnd}
                onDragCancel={() => {
                  setDraggedToolId(null);
                  setDropTargetToolId(null);
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                  <SortableContext items={toolbarButtonEntries.map((entry) => entry.toolId)} strategy={horizontalListSortingStrategy}>
                    {toolbarButtonEntries.map((entry) => (
                      <SortableToolbarItem
                        key={entry.toolId}
                        entry={entry}
                        isDropTarget={dropTargetToolId === entry.toolId && draggedToolId !== entry.toolId}
                      >
                        {entry.node}
                      </SortableToolbarItem>
                    ))}
                  </SortableContext>
                  <div style={{ width: 1, height: 26, background: "rgba(255,255,255,0.10)", margin: "0 2px" }} />
                  {activeDraggedToolbarEntry ? (
                    <ToolbarTrashDropTarget activeTool={activeDraggedToolbarEntry} />
                  ) : (
                    <button
                      type="button"
                      onClick={() => setToolExplorerOpen((current) => !current)}
                      title="Open tool explorer"
                      aria-label="Open tool explorer"
                      style={{
                        height: 36,
                        minWidth: 36,
                        borderRadius: 12,
                        border: toolExplorerOpen ? "1px solid rgba(120,190,255,0.72)" : "1px solid rgba(255,255,255,0.10)",
                        background: toolExplorerOpen ? "rgba(120,190,255,0.18)" : "rgba(255,255,255,0.04)",
                        color: toolExplorerOpen ? "#d7eeff" : "rgba(255,255,255,0.82)",
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        cursor: "pointer",
                        transition: "all 160ms ease",
                      }}
                    >
                      <ToolExplorerIcon />
                    </button>
                  )}
                </div>
              </DndContext>
	        </div>
        <button
          type="button"
          onClick={() => setToolbarPinnedOpen((current) => !current)}
          aria-label={toolbarPinnedOpen ? "Enable toolbar auto-hide" : "Pin toolbar open"}
          title={toolbarPinnedOpen ? "Enable toolbar auto-hide" : "Pin toolbar open"}
          style={{
            width: toolbarHandleActive ? 96 : 72,
            height: 7,
            borderRadius: 999,
            border: toolbarPinnedOpen
              ? "1px solid rgba(255,255,255,0.16)"
              : "1px solid rgba(120,190,255,0.34)",
            background: toolbarPinnedOpen
              ? "rgba(255,255,255,0.10)"
              : "rgba(120,190,255,0.18)",
            boxShadow: toolbarHandleActive
              ? "0 10px 24px rgba(0,0,0,0.28)"
              : "0 6px 14px rgba(0,0,0,0.18)",
            opacity: toolbarHandleActive ? 0.96 : 0.42,
            cursor: "pointer",
            transition:
              "width 180ms ease, opacity 180ms ease, background 180ms ease, border-color 180ms ease, box-shadow 180ms ease",
          }}
        />
      </div>
    </>
  );
}
