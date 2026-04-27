import { useState } from "react";
import type { CSSProperties, ReactNode } from "react";

export type FloatingWindowState = {
  id: string;
  title: string;
  subtitle?: string;
  metadataNodeId?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex: number;
  minimized: boolean;
  maximized: boolean;
  metadataMode?: "edit" | "preview" | "split";
};

type DragPayload =
  | {
      kind: "move";
      id: string;
      startX: number;
      startY: number;
      initialX: number;
      initialY: number;
    }
  | {
      kind: "resize";
      id: string;
      edges: ResizeEdge[];
      startX: number;
      startY: number;
      initialX: number;
      initialY: number;
      initialWidth: number;
      initialHeight: number;
    };

type FloatingWindowManagerProps = {
  windows: FloatingWindowState[];
  onUpdateWindow: (id: string, patch: Partial<FloatingWindowState>) => void;
  onFocusWindow: (id: string) => void;
  onCloseWindow: (id: string) => void;
  renderWindowContent: (window: FloatingWindowState) => ReactNode;
};

const MIN_WIDTH = 360;
const MIN_HEIGHT = 260;
const SNAP_DISTANCE = 28;
const SNAP_MARGIN = 14;
const WINDOW_STACK_Z = 35;

type ResizeEdge = "n" | "e" | "s" | "w";

type ResizeHandle = {
  edges: ResizeEdge[];
  cursor: string;
  style: CSSProperties;
};

type SnapPreview = {
  x: number;
  y: number;
  width: number;
  height: number;
};

function getEdgeSnapPreview(clientX: number, clientY: number): SnapPreview | null {
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const availableWidth = Math.max(MIN_WIDTH, viewportWidth - SNAP_MARGIN * 2);
  const availableHeight = Math.max(MIN_HEIGHT, viewportHeight - 112);
  const halfWidth = Math.max(MIN_WIDTH, Math.round(availableWidth * 0.5));
  const halfHeight = Math.max(MIN_HEIGHT, Math.round(availableHeight * 0.5));

  if (clientX <= SNAP_DISTANCE) {
    return { x: SNAP_MARGIN, y: SNAP_MARGIN, width: halfWidth, height: availableHeight };
  }
  if (clientX >= viewportWidth - SNAP_DISTANCE) {
    return { x: SNAP_MARGIN + availableWidth - halfWidth, y: SNAP_MARGIN, width: halfWidth, height: availableHeight };
  }
  if (clientY <= SNAP_DISTANCE) {
    return { x: SNAP_MARGIN, y: SNAP_MARGIN, width: availableWidth, height: halfHeight };
  }
  if (clientY >= viewportHeight - SNAP_DISTANCE) {
    return { x: SNAP_MARGIN, y: SNAP_MARGIN + availableHeight - halfHeight, width: availableWidth, height: halfHeight };
  }

  return null;
}

function getEdgeSnapPatch(clientX: number, clientY: number): Partial<FloatingWindowState> | null {
  const preview = getEdgeSnapPreview(clientX, clientY);
  return preview ? { ...preview, maximized: false } : null;
}

function getResizePatch(payload: Extract<DragPayload, { kind: "resize" }>, clientX: number, clientY: number): Partial<FloatingWindowState> {
  const deltaX = clientX - payload.startX;
  const deltaY = clientY - payload.startY;
  const hasEast = payload.edges.includes("e");
  const hasWest = payload.edges.includes("w");
  const hasSouth = payload.edges.includes("s");
  const hasNorth = payload.edges.includes("n");
  const initialRight = payload.initialX + payload.initialWidth;
  const initialBottom = payload.initialY + payload.initialHeight;

  let x = payload.initialX;
  let y = payload.initialY;
  let width = payload.initialWidth;
  let height = payload.initialHeight;

  if (hasEast) {
    width = payload.initialWidth + deltaX;
  }
  if (hasWest) {
    x = payload.initialX + deltaX;
    width = initialRight - x;
    if (width < MIN_WIDTH) {
      width = MIN_WIDTH;
      x = initialRight - MIN_WIDTH;
    }
  }
  if (hasSouth) {
    height = payload.initialHeight + deltaY;
  }
  if (hasNorth) {
    y = payload.initialY + deltaY;
    height = initialBottom - y;
    if (height < MIN_HEIGHT) {
      height = MIN_HEIGHT;
      y = initialBottom - MIN_HEIGHT;
    }
  }

  const maxWidth = Math.max(MIN_WIDTH, window.innerWidth - SNAP_MARGIN * 2);
  const maxHeight = Math.max(MIN_HEIGHT, window.innerHeight - 112);
  width = Math.max(MIN_WIDTH, Math.min(maxWidth, width));
  height = Math.max(MIN_HEIGHT, Math.min(maxHeight, height));
  x = Math.max(SNAP_MARGIN, Math.min(window.innerWidth - SNAP_MARGIN - width, x));
  y = Math.max(SNAP_MARGIN, Math.min(window.innerHeight - 98 - height, y));

  return { x, y, width, height, maximized: false };
}

const RESIZE_HANDLES: ResizeHandle[] = [
  { edges: ["n"], cursor: "ns-resize", style: { left: 12, right: 12, top: -5, height: 10 } },
  { edges: ["s"], cursor: "ns-resize", style: { left: 12, right: 12, bottom: -5, height: 10 } },
  { edges: ["w"], cursor: "ew-resize", style: { left: -5, top: 12, bottom: 12, width: 10 } },
  { edges: ["e"], cursor: "ew-resize", style: { right: -5, top: 12, bottom: 12, width: 10 } },
  { edges: ["n", "w"], cursor: "nwse-resize", style: { left: -6, top: -6, width: 16, height: 16 } },
  { edges: ["n", "e"], cursor: "nesw-resize", style: { right: -6, top: -6, width: 16, height: 16 } },
  { edges: ["s", "w"], cursor: "nesw-resize", style: { left: -6, bottom: -6, width: 16, height: 16 } },
  { edges: ["s", "e"], cursor: "nwse-resize", style: { right: -6, bottom: -6, width: 16, height: 16 } },
];

function WindowButton({
  title,
  children,
  onClick,
}: {
  title: string;
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onPointerDown={(event) => {
        event.stopPropagation();
      }}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      style={{
        width: 28,
        height: 28,
        borderRadius: 7,
        border: "1px solid rgba(255,255,255,0.10)",
        background: "rgba(255,255,255,0.05)",
        color: "inherit",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: "pointer",
        padding: 0,
      }}
    >
      {children}
    </button>
  );
}

function MinimizeIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M6 18h12" />
    </svg>
  );
}

function MaximizeIcon({ active }: { active: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      {active ? (
        <>
          <rect x="8" y="8" width="10" height="10" rx="1.5" />
          <path d="M6 14V6h8" />
        </>
      ) : (
        <rect x="6" y="6" width="12" height="12" rx="1.5" />
      )}
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M6 6l12 12" />
      <path d="M18 6L6 18" />
    </svg>
  );
}

export default function FloatingWindowManager({
  windows,
  onUpdateWindow,
  onFocusWindow,
  onCloseWindow,
  renderWindowContent,
}: FloatingWindowManagerProps) {
  const [snapPreview, setSnapPreview] = useState<SnapPreview | null>(null);

  function beginDrag(event: React.PointerEvent, payload: DragPayload) {
    event.preventDefault();
    event.stopPropagation();
    const target = event.currentTarget as HTMLElement;
    target.setPointerCapture(event.pointerId);
    onFocusWindow(payload.id);

    function handlePointerMove(moveEvent: PointerEvent) {
      if (payload.kind === "move") {
        setSnapPreview(getEdgeSnapPreview(moveEvent.clientX, moveEvent.clientY));
        const snapPatch = getEdgeSnapPatch(moveEvent.clientX, moveEvent.clientY);
        if (snapPatch) {
          onUpdateWindow(payload.id, snapPatch);
          return;
        }
        onUpdateWindow(payload.id, {
          x: Math.max(8, Math.min(window.innerWidth - MIN_WIDTH, payload.initialX + moveEvent.clientX - payload.startX)),
          y: Math.max(8, Math.min(window.innerHeight - 130, payload.initialY + moveEvent.clientY - payload.startY)),
          maximized: false,
        });
        return;
      }

      setSnapPreview(null);
      onUpdateWindow(payload.id, getResizePatch(payload, moveEvent.clientX, moveEvent.clientY));
    }

    function handlePointerUp(upEvent: PointerEvent) {
      setSnapPreview(null);
      target.releasePointerCapture(upEvent.pointerId);
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    }

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
  }

  return (
    <>
      {snapPreview ? (
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            left: snapPreview.x,
            top: snapPreview.y,
            width: snapPreview.width,
            height: snapPreview.height,
            zIndex: WINDOW_STACK_Z - 1,
            borderRadius: 8,
            border: "1px solid rgba(140,200,255,0.62)",
            background: "rgba(120,190,255,0.14)",
            boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.08), 0 18px 54px rgba(0,0,0,0.28)",
            pointerEvents: "none",
          }}
        />
      ) : null}
      {[...windows]
        .filter((windowState) => !windowState.minimized)
        .sort((a, b) => a.zIndex - b.zIndex)
        .map((windowState) => {
          const frameStyle = windowState.maximized
            ? {
                left: 14,
                top: 14,
                width: "calc(100vw - 28px)",
                height: "calc(100vh - 112px)",
              }
            : {
                left: windowState.x,
                top: windowState.y,
                width: windowState.width,
                height: windowState.height,
              };

          return (
            <section
              key={windowState.id}
              aria-label={windowState.title}
              onPointerDown={() => onFocusWindow(windowState.id)}
              style={{
                position: "absolute",
                ...frameStyle,
                zIndex: WINDOW_STACK_Z,
                minWidth: MIN_WIDTH,
                minHeight: MIN_HEIGHT,
                display: "grid",
                gridTemplateRows: "44px minmax(0, 1fr)",
                borderRadius: 8,
                border: "1px solid rgba(255,255,255,0.14)",
                background: "rgba(13,16,22,0.94)",
                color: "white",
                boxShadow: "0 18px 54px rgba(0,0,0,0.48)",
                backdropFilter: "blur(16px)",
                overflow: "hidden",
              }}
            >
              <header
                onPointerDown={(event) =>
                  beginDrag(event, {
                    kind: "move",
                    id: windowState.id,
                    startX: event.clientX,
                    startY: event.clientY,
                    initialX: windowState.x,
                    initialY: windowState.y,
                  })
                }
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  minWidth: 0,
                  padding: "0 8px 0 12px",
                  borderBottom: "1px solid rgba(255,255,255,0.10)",
                  background: "rgba(255,255,255,0.045)",
                  cursor: "grab",
                }}
              >
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 800, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {windowState.title}
                  </div>
                  {windowState.subtitle ? (
                    <div data-theme-text="muted" style={{ fontSize: 11, opacity: 0.7, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {windowState.subtitle}
                    </div>
                  ) : null}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                  <WindowButton title="Minimize" onClick={() => onUpdateWindow(windowState.id, { minimized: true })}>
                    <MinimizeIcon />
                  </WindowButton>
                  <WindowButton title={windowState.maximized ? "Restore" : "Maximize"} onClick={() => onUpdateWindow(windowState.id, { maximized: !windowState.maximized, minimized: false })}>
                    <MaximizeIcon active={windowState.maximized} />
                  </WindowButton>
                  <WindowButton title="Close" onClick={() => onCloseWindow(windowState.id)}>
                    <CloseIcon />
                  </WindowButton>
                </div>
              </header>

              <div style={{ minHeight: 0, overflow: "hidden", padding: 12 }}>
                {renderWindowContent(windowState)}
              </div>

              {!windowState.maximized
                ? RESIZE_HANDLES.map((handle) => (
                    <div
                      key={handle.edges.join("")}
                      aria-hidden="true"
                      onPointerDown={(event) =>
                        beginDrag(event, {
                          kind: "resize",
                          id: windowState.id,
                          edges: handle.edges,
                          startX: event.clientX,
                          startY: event.clientY,
                          initialX: windowState.x,
                          initialY: windowState.y,
                          initialWidth: windowState.width,
                          initialHeight: windowState.height,
                        })
                      }
                      style={{
                        position: "absolute",
                        cursor: handle.cursor,
                        ...handle.style,
                      }}
                    />
                  ))
                : null}
            </section>
          );
        })}

    </>
  );
}
