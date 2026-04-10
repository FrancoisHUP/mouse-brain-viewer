import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { CameraControlMode } from "./viewerState";
import type { AnnotationShape } from "./layerTypes";

declare global {
  interface Window {
    EyeDropper?: new () => {
      open: () => Promise<{ sRGBHex: string }>;
    };
  }
}

export type ToolId =
  | "mouse"
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
  { id: "pencil", label: "Draw" },
  { id: "slice", label: "Slice" },
  { id: "data", label: "Data" },
  { id: "library", label: "Library" },
  { id: "save", label: "Save" },
  { id: "export", label: "Export" },
  { id: "account", label: "Account" },
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
    case "pencil":
      return (
        <svg {...common}>
          <path d="M3 21l3.8-1 11-11a2.2 2.2 0 10-3.1-3.1l-11 11L3 21z" />
          <path d="M13.5 6.5l4 4" />
        </svg>
      );
    case "slice":
      return (
        <svg {...common}>
          <circle cx="6.5" cy="7.5" r="2.2" />
          <circle cx="6.5" cy="16.5" r="2.2" />
          <path d="M8.2 8.9L19 4" />
          <path d="M8.2 15.1L19 20" />
          <path d="M11.5 12L19 12" />
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
      return <svg {...common}><rect x="4.5" y="7" width="8.5" height="9.5" rx="1.2" /><circle cx="16.8" cy="11.8" r="3.2" /></svg>;
    case "eraser":
      return <svg {...common}><path d="M7 16l6-6 4 4-6 6H7z" /><path d="M14 7l3 3" /><path d="M4 20h8" /></svg>;
    default:
      return null;
  }
}

function EyeDropperIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 14L4 20" />
      <path d="M14.5 4.5l5 5" />
      <path d="M12 7l5 5" />
      <path d="M8 16l8.5-8.5a2.1 2.1 0 10-3-3L5 13v3h3z" />
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

function MoveToolButton({ active, cameraMode, onClick, onCameraModeChange }: { active: boolean; cameraMode: CameraControlMode; onClick: () => void; onCameraModeChange: (mode: CameraControlMode) => void; }) {
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
                onClick={() => onCameraModeChange(option.id)}
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
        </div>
      </div>
    </div>
  );
}

function needsSizeControl(shape: AnnotationShape) {
  return shape === "point" || shape === "line" || shape === "freehand" || shape === "eraser";
}

function buildSizeLabel(shape: AnnotationShape) {
  if (shape === "point") return "Point size";
  if (shape === "line") return "Line thickness";
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
                      borderRadius: 999,
                      border: selected ? "2px solid rgba(255,255,255,0.95)" : "1px solid rgba(255,255,255,0.18)",
                      background: swatch,
                      boxShadow: selected ? "0 0 0 2px rgba(120,190,255,0.34)" : "none",
                      cursor: "pointer",
                    }}
                  />
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
                        borderRadius: 999,
                        border: selected ? "2px solid rgba(160,220,255,0.95)" : "1px solid rgba(255,255,255,0.14)",
                        background: swatch,
                        cursor: "pointer",
                        opacity: 0.95,
                      }}
                    />
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
  onSaveCurrentViewer,
  saveNoticeOpen = false,
  saveNoticeContent = null,
  onRequestCloseSaveNotice,
  slicePopoverOpen = false,
  slicePopoverContent = null,
  onRequestCloseSlicePopover,
  statePopoverOpen = false,
  statePopoverContent = null,
  onRequestCloseStatePopover,
  accountPopoverOpen = false,
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
  onSaveCurrentViewer?: () => void;
  saveNoticeOpen?: boolean;
  saveNoticeContent?: ReactNode;
  onRequestCloseSaveNotice?: () => void;
  slicePopoverOpen?: boolean;
  slicePopoverContent?: ReactNode;
  onRequestCloseSlicePopover?: () => void;
  statePopoverOpen?: boolean;
  statePopoverContent?: ReactNode;
  onRequestCloseStatePopover?: () => void;
  accountPopoverOpen?: boolean;
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
    if (!saveNoticeOpen && !slicePopoverOpen && !statePopoverOpen) return;

    function handlePointerDown(event: PointerEvent) {
      const target = event.target as Node | null;
      if (!target) return;
      if (rootRef.current?.contains(target)) return;
      onRequestCloseSaveNotice?.();
      onRequestCloseSlicePopover?.();
      onRequestCloseStatePopover?.();
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onRequestCloseSaveNotice?.();
        onRequestCloseSlicePopover?.();
        onRequestCloseStatePopover?.();
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [saveNoticeOpen, slicePopoverOpen, statePopoverOpen, onRequestCloseSaveNotice, onRequestCloseSlicePopover, onRequestCloseStatePopover]);

  const toolbarButtons = useMemo(
    () =>
      TOOLS.map((tool) => {
        const isActive =
          activeTool === tool.id ||
          (tool.id === "slice" && slicePopoverOpen) ||
          (tool.id === "export" && statePopoverOpen) ||
          (tool.id === "account" && accountPopoverOpen) ||
          (tool.id === "save" && saveNoticeOpen);

        if (tool.id === "mouse") {
          return <MoveToolButton key={tool.id} active={isActive} cameraMode={cameraMode} onClick={() => onToolChange(tool.id)} onCameraModeChange={onCameraModeChange} />;
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

        return <ToolButton key={tool.id} id={tool.id} label={tool.label} active={isActive} onClick={() => onToolChange(tool.id)} />;
      }),
    [activeTool, slicePopoverOpen, statePopoverOpen, accountPopoverOpen, saveNoticeOpen, cameraMode, onCameraModeChange, onSaveCurrentViewer, onToolChange, saveNoticeContent, annotationShape, annotationColor, annotationOpacity, annotationSize, annotationDepth, annotationEraseMode, annotationRecentColors, onAnnotationShapeChange, onAnnotationColorChange, onAnnotationColorCommit, onAnnotationOpacityChange, onAnnotationSizeChange, onAnnotationDepthChange, onAnnotationEraseModeChange, onAnnotationPickColorFromScreen]
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
        <div style={{ position: "absolute", left: "50%", bottom: slicePopoverOpen ? "calc(100% + 260px)" : "calc(100% + 12px)", transform: statePopoverOpen ? "translate(-50%, 0)" : "translate(-50%, 10px)", opacity: statePopoverOpen ? 1 : 0, pointerEvents: statePopoverOpen ? "auto" : "none", transition: "opacity 180ms ease, transform 220ms ease, visibility 180ms ease", visibility: statePopoverOpen ? "visible" : "hidden" }}>
          <div data-theme-surface="panel" style={{ minWidth: 520, maxWidth: 760, borderRadius: 18, background: "rgba(12,14,18,0.94)", border: "1px solid rgba(255,255,255,0.10)", boxShadow: "0 16px 40px rgba(0,0,0,0.40)", backdropFilter: "blur(14px)", padding: 12, color: "white" }}>
            {statePopoverContent}
          </div>
        </div>

        <div style={{ position: "absolute", left: "50%", bottom: "calc(100% + 12px)", transform: slicePopoverOpen ? "translate(-50%, 0)" : "translate(-50%, 10px)", opacity: slicePopoverOpen ? 1 : 0, pointerEvents: slicePopoverOpen ? "auto" : "none", transition: "opacity 180ms ease, transform 220ms ease, visibility 180ms ease", visibility: slicePopoverOpen ? "visible" : "hidden" }}>
          <div data-theme-surface="panel" style={{ minWidth: 420, maxWidth: 520, borderRadius: 18, background: "rgba(12,14,18,0.90)", border: "1px solid rgba(255,255,255,0.10)", boxShadow: "0 16px 40px rgba(0,0,0,0.40)", backdropFilter: "blur(14px)", padding: 12, color: "white" }}>
            {slicePopoverContent}
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
