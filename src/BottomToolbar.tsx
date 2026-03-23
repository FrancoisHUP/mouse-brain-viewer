import { useEffect, useRef } from "react";
import type { ReactNode } from "react";

export type ToolId =
  | "mouse"
  | "pencil"
  | "slice"
  | "data"
  | "search"
  | "export"
  | "settings"
  | "account";

type ToolDefinition = {
  id: ToolId;
  label: string;
};

const TOOLS: ToolDefinition[] = [
  { id: "mouse", label: "Move" },
  { id: "pencil", label: "Draw" },
  { id: "slice", label: "Slice" },
  { id: "data", label: "Data" },
  { id: "search", label: "Search" },
  { id: "export", label: "Export" },
  { id: "settings", label: "Settings" },
  { id: "account", label: "Account" },
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

function ToolButton({
  id,
  label,
  active,
  onClick,
}: {
  id: ToolId;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      style={{
        width: 48,
        height: 48,
        borderRadius: 12,
        border: active
          ? "1px solid rgba(120,200,255,0.85)"
          : "1px solid rgba(255,255,255,0.10)",
        background: active
          ? "rgba(80,160,255,0.20)"
          : "rgba(255,255,255,0.04)",
        color: active ? "#9bd3ff" : "rgba(255,255,255,0.92)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: "pointer",
        transition: "all 0.18s ease",
        backdropFilter: "blur(6px)",
      }}
    >
      <Icon id={id} />
    </button>
  );
}

export default function BottomToolbar({
  activeTool,
  onToolChange,
  slicePopoverOpen = false,
  slicePopoverContent = null,
  onRequestCloseSlicePopover,
}: {
  activeTool: ToolId;
  onToolChange: (tool: ToolId) => void;
  slicePopoverOpen?: boolean;
  slicePopoverContent?: ReactNode;
  onRequestCloseSlicePopover?: () => void;
}) {
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!slicePopoverOpen) return;

    function handlePointerDown(event: PointerEvent) {
      const target = event.target as Node | null;
      if (!target) return;
      if (rootRef.current?.contains(target)) return;
      onRequestCloseSlicePopover?.();
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onRequestCloseSlicePopover?.();
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [slicePopoverOpen, onRequestCloseSlicePopover]);

  return (
    <div
      ref={rootRef}
      style={{
        position: "absolute",
        left: "50%",
        bottom: 18,
        transform: "translateX(-50%)",
        zIndex: 30,
      }}
    >
      <div
        style={{
          position: "absolute",
          left: "50%",
          bottom: "calc(100% + 12px)",
          transform: slicePopoverOpen
            ? "translate(-50%, 0)"
            : "translate(-50%, 10px)",
          opacity: slicePopoverOpen ? 1 : 0,
          pointerEvents: slicePopoverOpen ? "auto" : "none",
          transition:
            "opacity 180ms ease, transform 220ms ease, visibility 180ms ease",
          visibility: slicePopoverOpen ? "visible" : "hidden",
        }}
      >
        <div
          style={{
            minWidth: 420,
            maxWidth: 520,
            borderRadius: 18,
            background: "rgba(12,14,18,0.90)",
            border: "1px solid rgba(255,255,255,0.10)",
            boxShadow: "0 16px 40px rgba(0,0,0,0.40)",
            backdropFilter: "blur(14px)",
            padding: 12,
            color: "white",
          }}
        >
          {slicePopoverContent}
        </div>
      </div>

      <div
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
        }}
      >
        {TOOLS.map((tool) => {
          const isActive =
            activeTool === tool.id ||
            (tool.id === "slice" && slicePopoverOpen);

          return (
            <ToolButton
              key={tool.id}
              id={tool.id}
              label={tool.label}
              active={isActive}
              onClick={() => onToolChange(tool.id)}
            />
          );
        })}
      </div>
    </div>
  );
}