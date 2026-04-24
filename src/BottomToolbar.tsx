import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { CameraControlMode } from "./viewerState";
import type { AnnotationShape, SlicePlane } from "./layerTypes";

declare global {
  interface Window {
    EyeDropper?: new () => {
      open: () => Promise<{ sRGBHex: string }>;
    };
  }
}

export type ToolId =
  | "mouse"
  | "select"
  | "pencil"
  | "slice"
  | "data"
  | "search"
  | "library"
  | "save"
  | "export"
  | "settings"
  | "account";

export type HistoryMenuItem = {
  id: string;
  label: string;
  meta?: string;
};

type ToolDefinition = {
  id: ToolId;
  label: string;
};

const TOOLS: ToolDefinition[] = [
  { id: "mouse", label: "Move" },
  { id: "select", label: "Select" },
  { id: "pencil", label: "Draw" },
  { id: "slice", label: "Browse slices" },
];

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

function ToolButton({ id, label, active, onClick }: { id: ToolId; label: string; active: boolean; onClick: () => void; }) {
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
      <Icon id={id} />
    </button>
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
  const activePlane = targetPlane ?? hoveredPlane;
  const summaryTitle = activePlane ? getCanonicalSlicePlaneLabel(activePlane) : "Slice explorer";
  const summaryHint = !hasSelectedLayer
    ? "Select a slice-rendered layer to browse and adjust its canonical planes."
    : !targetPlane
      ? "Hover a canonical plane in the scene to choose which one to adjust."
      : null;
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
          {activePlane ? (
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
          {hasSelectedLayer && targetPlane ? (
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

      {hasSelectedLayer && targetPlane ? (
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
  active: boolean;
  onClick: () => void;
  onHoverLockChange?: (locked: boolean) => void;
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
            onToggleVisibility={onToggleVisibility}
            onResetSliceView={onResetSliceView}
            onToggleFlip={onToggleFlip}
            onResetToCenter={onResetToCenter}
            onRotate={onRotate}
            onScale={onScale}
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

function SaveToolButton({ open, onClick, content }: { open: boolean; onClick: () => void; content?: ReactNode; }) {
  return (
    <div style={{ position: "relative" }}>
      <ToolButton id="save" label="Save viewer" active={open} onClick={onClick} />
      <div
        style={{
          position: "absolute",
          left: "50%",
          bottom: "100%",
          paddingBottom: 12,
          transform: open ? "translate(-50%, 0) scale(1)" : "translate(-50%, 12px) scale(0.96)",
          opacity: open ? 1 : 0,
          visibility: open ? "visible" : "hidden",
          pointerEvents: open ? "auto" : "none",
          transition: "opacity 180ms ease, transform 220ms ease, visibility 180ms ease",
          zIndex: 42,
        }}
      >
        <div data-theme-surface="panel" style={{ minWidth: 280, maxWidth: 340, borderRadius: 16, background: "rgba(12,14,18,0.96)", border: "1px solid rgba(255,255,255,0.10)", boxShadow: "0 16px 40px rgba(0,0,0,0.40)", backdropFilter: "blur(14px)", padding: 12, color: "white" }}>
          {content}
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
  onSliceHoverLockChange,
  onSliceToggleVisibility = () => {},
  onSliceResetView,
  onSliceToggleFlip,
  onSliceResetToCenter,
  onSliceRotate,
  onSliceScale,
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
  onSliceHoverLockChange?: (locked: boolean) => void;
  onSliceToggleVisibility?: (plane: SlicePlane) => void;
  onSliceResetView?: () => void;
  onSliceToggleFlip?: (axis: "x" | "y" | "z") => void;
  onSliceResetToCenter?: () => void;
  onSliceRotate?: (deltaDeg: number) => void;
  onSliceScale?: (delta: number) => void;
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
}) {
  const rootRef = useRef<HTMLDivElement | null>(null);

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

  const toolbarButtons = useMemo(
    () =>
      TOOLS.map((tool) => {
        const isActive =
          activeTool === tool.id ||
          (tool.id === "export" && statePopoverOpen) ||
          (tool.id === "account" && accountPopoverOpen) ||
          (tool.id === "save" && saveNoticeOpen);

        if (tool.id === "mouse") {
          return <MoveToolButton key={tool.id} active={isActive} cameraMode={cameraMode} onClick={() => onToolChange(tool.id)} onCameraModeChange={onCameraModeChange} onFocusSelectedLayer={onFocusSelectedLayer} />;
        }

        if (tool.id === "pencil") {
          return (
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
          );
        }

        if (tool.id === "save") {
          return <SaveToolButton key={tool.id} open={saveNoticeOpen} onClick={() => onSaveCurrentViewer?.()} content={saveNoticeContent} />;
        }

        if (tool.id === "slice") {
          return (
            <SliceToolButton
              key={tool.id}
              active={activeTool === "slice"}
              onClick={() => onToolChange(tool.id)}
              onHoverLockChange={onSliceHoverLockChange}
              selectedLayerName={sliceSelectedLayerName}
              targetPlane={sliceTargetPlane}
              hoveredPlane={sliceHoveredPlane}
              hasSelectedLayer={!!sliceSelectedLayerName}
              canResetToCenter={sliceCanResetToCenter}
              canAdjustView={!!sliceSelectedLayerName && !!sliceTargetPlane}
              rotationDeg={sliceRotationDeg}
              scale={sliceScale}
              flipX={sliceFlipX}
              flipY={sliceFlipY}
              flipZ={sliceFlipZ}
              visibilityXY={sliceVisibilityXY}
              visibilityXZ={sliceVisibilityXZ}
              visibilityYZ={sliceVisibilityYZ}
              onToggleVisibility={onSliceToggleVisibility}
              onResetSliceView={onSliceResetView ?? (() => {})}
              onToggleFlip={onSliceToggleFlip ?? (() => {})}
              onResetToCenter={onSliceResetToCenter ?? (() => {})}
              onRotate={onSliceRotate ?? (() => {})}
              onScale={onSliceScale ?? (() => {})}
            />
          );
        }

        return <ToolButton key={tool.id} id={tool.id} label={tool.label} active={isActive} onClick={() => onToolChange(tool.id)} />;
      }),
    [activeTool, statePopoverOpen, accountPopoverOpen, saveNoticeOpen, cameraMode, onCameraModeChange, onFocusSelectedLayer, onSaveCurrentViewer, onToolChange, saveNoticeContent, sliceSelectedLayerName, sliceTargetPlane, sliceHoveredPlane, sliceCanResetToCenter, sliceRotationDeg, sliceScale, sliceFlipX, sliceFlipY, sliceFlipZ, sliceVisibilityXY, sliceVisibilityXZ, sliceVisibilityYZ, onSliceHoverLockChange, onSliceToggleVisibility, onSliceResetView, onSliceToggleFlip, onSliceResetToCenter, onSliceRotate, onSliceScale, annotationShape, annotationColor, annotationOpacity, annotationSize, annotationDepth, annotationEraseMode, annotationRecentColors, onAnnotationShapeChange, onAnnotationColorChange, onAnnotationColorCommit, onAnnotationOpacityChange, onAnnotationSizeChange, onAnnotationDepthChange, onAnnotationEraseModeChange, onAnnotationPickColorFromScreen]
  );

  return (
    <>
      <style>{`
        .history-menu-scroll { scrollbar-width: thin; scrollbar-color: rgba(140, 190, 255, 0.45) rgba(255,255,255,0.06); }
        .history-menu-scroll::-webkit-scrollbar { width: 10px; }
        .history-menu-scroll::-webkit-scrollbar-track { background: rgba(255,255,255,0.05); border-radius: 999px; }
        .history-menu-scroll::-webkit-scrollbar-thumb { background: linear-gradient(180deg, rgba(140,190,255,0.52), rgba(90,150,230,0.34)); border-radius: 999px; border: 2px solid rgba(12,14,18,0.82); }
        .history-menu-scroll::-webkit-scrollbar-thumb:hover { background: linear-gradient(180deg, rgba(160,210,255,0.68), rgba(110,170,245,0.48)); }
      `}</style>
      <div ref={rootRef} style={{ position: "absolute", left: "50%", bottom: 18, transform: "translateX(-50%)", zIndex: 30 }}>
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




        <div data-theme-surface="panel" style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 18, background: "rgba(12,14,18,0.78)", border: "1px solid rgba(255,255,255,0.10)", boxShadow: "0 10px 30px rgba(0,0,0,0.35)", backdropFilter: "blur(12px)" }}>
          <HistoryButton direction="undo" disabled={!canUndo} onClick={() => onUndo?.()} items={undoItems} onJump={onJumpUndo} canClearHistory={canClearHistory} onRequestClearHistory={onRequestClearHistory} />
          <HistoryButton direction="redo" disabled={!canRedo} onClick={() => onRedo?.()} items={redoItems} onJump={onJumpRedo} canClearHistory={canClearHistory} onRequestClearHistory={onRequestClearHistory} />
          <div style={{ width: 1, height: 26, background: "rgba(255,255,255,0.10)", margin: "0 2px" }} />
          {toolbarButtons}
        </div>
      </div>
    </>
  );
}
