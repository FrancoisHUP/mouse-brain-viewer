import { useEffect, useMemo, useRef, useState } from "react";
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

function HistoryIcon({ direction }: { direction: "undo" | "redo" }) {
  const isRedo = direction === "redo";
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ transform: isRedo ? "scaleX(-1)" : "none" }}
    >
      <path d="M10 7L5 12L10 17" />
      <path d="M6 12H14C17.314 12 20 14.686 20 18" />
    </svg>
  );
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
      onClick={onClick}
      title={label}
      aria-label={label}
      style={{
        width: 44,
        height: 44,
        borderRadius: 14,
        border: active
          ? "1px solid rgba(120,190,255,0.75)"
          : "1px solid rgba(255,255,255,0.08)",
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

function HistoryButton({
  direction,
  disabled,
  onClick,
  items,
  onJump,
  canClearHistory = false,
  onRequestClearHistory,
}: {
  direction: "undo" | "redo";
  disabled: boolean;
  onClick: () => void;
  items: HistoryMenuItem[];
  onJump?: (steps: number) => void;
  canClearHistory?: boolean;
  onRequestClearHistory?: () => void;
}) {
  const [isHovered, setIsHovered] = useState(false);
  const label = direction === "undo" ? "Undo" : "Redo";
  const title = disabled ? label : `${label} · hover for history`;
  const showMenu = isHovered && items.length > 0;

  return (
    <div
      style={{ position: "relative" }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <button
        type="button"
        title={title}
        aria-label={label}
        disabled={disabled}
        onClick={onClick}
        style={{
          width: 44,
          height: 44,
          borderRadius: 14,
          border: "1px solid rgba(255,255,255,0.08)",
          background: disabled ? "rgba(255,255,255,0.02)" : "rgba(255,255,255,0.03)",
          color: disabled ? "rgba(255,255,255,0.28)" : "rgba(255,255,255,0.82)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: disabled ? "not-allowed" : "pointer",
          transition: "all 160ms ease",
        }}
      >
        <HistoryIcon direction={direction} />
      </button>

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
          style={{
            width: 320,
            maxHeight: 320,
            overflow: "hidden",
            borderRadius: 16,
            background: "rgba(12,14,18,0.96)",
            border: "1px solid rgba(255,255,255,0.10)",
            boxShadow: "0 16px 40px rgba(0,0,0,0.40)",
            backdropFilter: "blur(14px)",
            padding: 10,
            color: "white",
          }}
        >
          <div
            className="history-menu-scroll"
            style={{
              display: "grid",
              gap: 6,
              maxHeight: canClearHistory ? 220 : 256,
              overflowY: "auto",
              paddingRight: 4,
            }}
          >
            {items.map((item, index) => (
              <button
                key={item.id}
                type="button"
                onClick={() => onJump?.(index + 1)}
                style={{
                  textAlign: "left",
                  borderRadius: 12,
                  border: "1px solid rgba(255,255,255,0.08)",
                  background: "rgba(255,255,255,0.04)",
                  color: "white",
                  padding: "10px 12px",
                  cursor: "pointer",
                }}
              >
                <div style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.35 }}>
                  {item.label}
                </div>
                {item.meta ? (
                  <div style={{ fontSize: 11, opacity: 0.62, marginTop: 4 }}>{item.meta}</div>
                ) : null}
              </button>
            ))}
          </div>

          {canClearHistory ? (
            <div
              style={{
                marginTop: 10,
                paddingTop: 10,
                borderTop: "1px solid rgba(255,255,255,0.08)",
                display: "flex",
                justifyContent: "flex-end",
              }}
            >
              <button
                type="button"
                onClick={() => onRequestClearHistory?.()}
                style={{
                  border: "none",
                  background: "transparent",
                  color: "rgba(255,140,140,0.92)",
                  cursor: "pointer",
                  fontSize: 12,
                  fontWeight: 600,
                  padding: "4px 2px",
                }}
              >
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
  slicePopoverOpen = false,
  slicePopoverContent = null,
  onRequestCloseSlicePopover,
  statePopoverOpen = false,
  statePopoverContent = null,
  onRequestCloseStatePopover,
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
  slicePopoverOpen?: boolean;
  slicePopoverContent?: ReactNode;
  onRequestCloseSlicePopover?: () => void;
  statePopoverOpen?: boolean;
  statePopoverContent?: ReactNode;
  onRequestCloseStatePopover?: () => void;
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
    if (!slicePopoverOpen && !statePopoverOpen) return;

    function handlePointerDown(event: PointerEvent) {
      const target = event.target as Node | null;
      if (!target) return;
      if (rootRef.current?.contains(target)) return;
      onRequestCloseSlicePopover?.();
      onRequestCloseStatePopover?.();
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
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
  }, [
    slicePopoverOpen,
    statePopoverOpen,
    onRequestCloseSlicePopover,
    onRequestCloseStatePopover,
  ]);

  const toolbarButtons = useMemo(
    () =>
      TOOLS.map((tool) => {
        const isActive =
          activeTool === tool.id ||
          (tool.id === "slice" && slicePopoverOpen) ||
          (tool.id === "export" && statePopoverOpen);

        return (
          <ToolButton
            key={tool.id}
            id={tool.id}
            label={tool.label}
            active={isActive}
            onClick={() => onToolChange(tool.id)}
          />
        );
      }),
    [activeTool, onToolChange, slicePopoverOpen, statePopoverOpen]
  );

  return (
    <>
      <style>
        {`
          .history-menu-scroll {
            scrollbar-width: thin;
            scrollbar-color: rgba(140, 190, 255, 0.45) rgba(255,255,255,0.06);
          }

          .history-menu-scroll::-webkit-scrollbar {
            width: 10px;
          }

          .history-menu-scroll::-webkit-scrollbar-track {
            background: rgba(255,255,255,0.05);
            border-radius: 999px;
          }

          .history-menu-scroll::-webkit-scrollbar-thumb {
            background: linear-gradient(
              180deg,
              rgba(140,190,255,0.52),
              rgba(90,150,230,0.34)
            );
            border-radius: 999px;
            border: 2px solid rgba(12,14,18,0.82);
          }

          .history-menu-scroll::-webkit-scrollbar-thumb:hover {
            background: linear-gradient(
              180deg,
              rgba(160,210,255,0.68),
              rgba(110,170,245,0.48)
            );
          }
        `}
      </style>

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
            bottom: slicePopoverOpen ? "calc(100% + 260px)" : "calc(100% + 12px)",
            transform: statePopoverOpen ? "translate(-50%, 0)" : "translate(-50%, 10px)",
            opacity: statePopoverOpen ? 1 : 0,
            pointerEvents: statePopoverOpen ? "auto" : "none",
            transition: "opacity 180ms ease, transform 220ms ease, visibility 180ms ease",
            visibility: statePopoverOpen ? "visible" : "hidden",
          }}
        >
          <div
            style={{
              minWidth: 520,
              maxWidth: 760,
              borderRadius: 18,
              background: "rgba(12,14,18,0.94)",
              border: "1px solid rgba(255,255,255,0.10)",
              boxShadow: "0 16px 40px rgba(0,0,0,0.40)",
              backdropFilter: "blur(14px)",
              padding: 12,
              color: "white",
            }}
          >
            {statePopoverContent}
          </div>
        </div>

        <div
          style={{
            position: "absolute",
            left: "50%",
            bottom: "calc(100% + 12px)",
            transform: slicePopoverOpen ? "translate(-50%, 0)" : "translate(-50%, 10px)",
            opacity: slicePopoverOpen ? 1 : 0,
            pointerEvents: slicePopoverOpen ? "auto" : "none",
            transition: "opacity 180ms ease, transform 220ms ease, visibility 180ms ease",
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
          <HistoryButton
            direction="undo"
            disabled={!canUndo}
            onClick={() => onUndo?.()}
            items={undoItems}
            onJump={onJumpUndo}
            canClearHistory={canClearHistory}
            onRequestClearHistory={onRequestClearHistory}
          />
          <HistoryButton
            direction="redo"
            disabled={!canRedo}
            onClick={() => onRedo?.()}
            items={redoItems}
            onJump={onJumpRedo}
            canClearHistory={canClearHistory}
            onRequestClearHistory={onRequestClearHistory}
          />

          <div
            style={{
              width: 1,
              height: 26,
              background: "rgba(255,255,255,0.10)",
              margin: "0 2px",
            }}
          />

          {toolbarButtons}
        </div>
      </div>
    </>
  );
}
