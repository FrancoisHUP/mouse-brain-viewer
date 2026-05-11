export type SaveToast = {
  id: string;
  title: string;
  message: string;
  tone: "success" | "info" | "error";
  detail?: string;
  isClosing: boolean;
  isHovered?: boolean;
};

function getToneAccent(tone: SaveToast["tone"]) {
  switch (tone) {
    case "error":
      return "rgba(255, 110, 110, 0.95)";
    case "info":
      return "rgba(120, 190, 255, 0.95)";
    case "success":
    default:
      return "rgba(130, 230, 170, 0.95)";
  }
}

export type LoadingNotice = {
  active: boolean;
  pending: number;
  onDismiss: () => void;
};

export type TaskNotice = {
  active: boolean;
  title: string;
  message: string;
  detail?: string | null;
  progress?: number | null;
  tone?: SaveToast["tone"];
  terminal?: boolean;
  onDismiss: () => void;
  onCancel?: (() => void) | null;
  onClick?: (() => void) | null;
  onHoverChange?: ((isHovered: boolean) => void) | null;
};

export default function SaveToastStack({
  toasts,
  bottomOffset,
  onDismiss,
  onHoverChange,
  loadingNotice,
  taskNotice,
}: {
  toasts: SaveToast[];
  bottomOffset: number;
  onDismiss: (toastId: string) => void;
  onHoverChange: (toastId: string, isHovered: boolean) => void;
  loadingNotice?: LoadingNotice | null;
  taskNotice?: TaskNotice | null;
}) {
  const showLoadingNotice = !!loadingNotice?.active;
  const showTaskNotice = !!taskNotice?.active;
  if (!toasts.length && !showLoadingNotice && !showTaskNotice) return null;

  function renderLoadingNotice() {
    if (!showLoadingNotice || !loadingNotice) return null;

    return (
      <div
        key="loading-notice"
        style={{
          pointerEvents: "auto",
          animation: "toast-panel-in 180ms ease",
        }}
      >
        <div
          data-theme-surface="panel"
          style={{
            position: "relative",
            borderRadius: 16,
            border: "1px solid rgba(255,255,255,0.10)",
            boxShadow: "0 12px 28px rgba(0,0,0,0.30)",
            padding: "12px 14px 12px 16px",
            display: "grid",
            gap: 8,
            fontFamily: "sans-serif",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              bottom: 0,
              width: 3,
              background: "rgba(120, 190, 255, 0.95)",
            }}
          />

          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
            <div style={{ minWidth: 0 }}>
              <div data-theme-text="strong" style={{ fontSize: 13, fontWeight: 700, fontFamily: "sans-serif" }}>
                Loading local data…
              </div>
              <div
                data-theme-text="muted"
                style={{ fontSize: 12, opacity: 0.74, lineHeight: 1.45, marginTop: 4, fontFamily: "sans-serif" }}
              >
                Preparing local data in the background. You can keep using the viewer while it loads.
              </div>
            </div>
            <button
              type="button"
              onClick={loadingNotice.onDismiss}
              aria-label="Dismiss loading notification"
              title="Dismiss"
              style={{
                width: 28,
                height: 28,
                flex: "0 0 auto",
                borderRadius: 10,
                border: "1px solid rgba(255,255,255,0.10)",
                background: "rgba(255,255,255,0.04)",
                color: "inherit",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                lineHeight: 1,
              }}
            >
              ×
            </button>
          </div>

          <div
            data-theme-surface="soft"
            style={{
              height: 7,
              borderRadius: 999,
              border: "1px solid rgba(255,255,255,0.08)",
              overflow: "hidden",
              position: "relative",
            }}
          >
            <div
              style={{
                position: "absolute",
                inset: 0,
                width: "34%",
                borderRadius: 999,
                background:
                  "linear-gradient(90deg, rgba(120,190,255,0.08), rgba(120,190,255,0.92), rgba(120,190,255,0.08))",
                animation: "local-load-indeterminate 1.15s linear infinite",
              }}
            />
          </div>

          <div data-theme-text="muted" style={{ fontSize: 11, opacity: 0.7 }}>
            {loadingNotice.pending} pending item{loadingNotice.pending > 1 ? "s" : ""}
          </div>
        </div>
      </div>
    );
  }

  function renderTaskNotice() {
    if (!showTaskNotice || !taskNotice) return null;
    const accent = getToneAccent(taskNotice.tone ?? "info");
    return (
      <div
        key="task-notice"
        style={{
          pointerEvents: "auto",
          animation: "toast-panel-in 180ms ease",
        }}
      >
        <div
          data-theme-surface="panel"
          onMouseEnter={() => taskNotice.onHoverChange?.(true)}
          onMouseLeave={() => taskNotice.onHoverChange?.(false)}
          onClick={() => taskNotice.onClick?.()}
          style={{
            position: "relative",
            borderRadius: 16,
            border: "1px solid rgba(255,255,255,0.10)",
            boxShadow: "0 12px 28px rgba(0,0,0,0.30)",
            padding: "12px 14px 12px 16px",
            display: "grid",
            gap: 8,
            fontFamily: "sans-serif",
            overflow: "hidden",
            cursor: taskNotice.onClick ? "pointer" : "default",
          }}
        >
          <div
            aria-hidden="true"
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              bottom: 0,
              width: 4,
              background: accent,
            }}
          />
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
            <div style={{ minWidth: 0 }}>
              <div data-theme-text="strong" style={{ fontSize: 13, fontWeight: 700, fontFamily: "sans-serif" }}>
                {taskNotice.title}
              </div>
              <div
                data-theme-text="muted"
                style={{ fontSize: 12, opacity: 0.82, lineHeight: 1.45, marginTop: 4, fontFamily: "sans-serif" }}
              >
                {taskNotice.message}
              </div>
              {taskNotice.detail ? (
                <div
                  data-theme-text="muted"
                  style={{
                    fontSize: 11,
                    opacity: 0.66,
                    lineHeight: 1.45,
                    marginTop: 6,
                    fontFamily: "sans-serif",
                  }}
                >
                  {taskNotice.detail}
                </div>
              ) : null}
            </div>
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                taskNotice.onDismiss();
              }}
              aria-label={`Dismiss ${taskNotice.title}`}
              title="Dismiss"
              style={{
                width: 28,
                height: 28,
                flex: "0 0 auto",
                borderRadius: 10,
                border: "1px solid rgba(255,255,255,0.10)",
                background: "rgba(255,255,255,0.04)",
                color: "inherit",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                lineHeight: 1,
              }}
            >
              {"\u00d7"}
            </button>
          </div>
          {taskNotice.onCancel ? (
            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: -2 }}>
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  taskNotice.onCancel?.();
                }}
                style={{
                  width: 34,
                  height: 30,
                  borderRadius: 10,
                  border: "1px solid rgba(255,255,255,0.10)",
                  background: "rgba(255,255,255,0.04)",
                  color: "inherit",
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
                aria-label="Stop export"
                title="Stop export"
              >
                <span
                  aria-hidden="true"
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: 2,
                    background: "currentColor",
                    display: "inline-block",
                  }}
                />
              </button>
            </div>
          ) : null}
          <div
            data-theme-surface="soft"
            style={{
              height: 7,
              borderRadius: 999,
              border: "1px solid rgba(255,255,255,0.08)",
              overflow: "hidden",
              position: "relative",
            }}
          >
            {typeof taskNotice.progress === "number" ? (
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  width: `${Math.max(4, Math.min(100, Math.round(taskNotice.progress * 100)))}%`,
                  borderRadius: 999,
                  background: `linear-gradient(90deg, ${accent}, rgba(255,255,255,0.92))`,
                  transition: "width 180ms ease",
                }}
              />
            ) : (
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  width: "34%",
                  borderRadius: 999,
                  background:
                    "linear-gradient(90deg, rgba(120,190,255,0.08), rgba(120,190,255,0.92), rgba(120,190,255,0.08))",
                  animation: "local-load-indeterminate 1.15s linear infinite",
                }}
              />
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        position: "absolute",
        left: 18,
        bottom: bottomOffset,
        zIndex: 120,
        width: "min(340px, calc(100vw - 40px))",
        display: "grid",
        gap: 10,
        pointerEvents: "none",
      }}
    >
      {renderTaskNotice()}
      {renderLoadingNotice()}
      {toasts.map((toast) => {
        const accent = getToneAccent(toast.tone);
        const highlightOpacity = toast.isHovered ? 0.1 : 0;
        return (
          <div
            key={toast.id}
            style={{
              pointerEvents: "auto",
              animation: toast.isClosing ? "toast-panel-out 220ms ease forwards" : "toast-panel-in 180ms ease",
            }}
          >
            <div
              data-theme-surface="panel"
              onMouseEnter={() => onHoverChange(toast.id, true)}
              onMouseLeave={() => onHoverChange(toast.id, false)}
              style={{
                position: "relative",
                borderRadius: 16,
                border: toast.isHovered ? "1px solid rgba(255,255,255,0.18)" : "1px solid rgba(255,255,255,0.10)",
                boxShadow: toast.isHovered
                  ? "0 14px 32px rgba(0,0,0,0.34)"
                  : "0 12px 28px rgba(0,0,0,0.30)",
                padding: "12px 14px 12px 16px",
                display: "grid",
                gap: 8,
                fontFamily: "sans-serif",
                overflow: "hidden",
                transition:
                  "border-color 180ms ease, box-shadow 180ms ease, transform 220ms cubic-bezier(0.22, 1, 0.36, 1)",
                transform: toast.isHovered ? "translate3d(0, -4px, 0)" : "translate3d(0, 0, 0)",
                willChange: "transform, box-shadow, border-color",
              }}
            >
              <div
                aria-hidden="true"
                style={{
                  position: "absolute",
                  inset: 0,
                  background: "rgba(255,255,255,0.08)",
                  opacity: highlightOpacity,
                  transition: "opacity 180ms ease",
                  pointerEvents: "none",
                }}
              />
              <div
                aria-hidden="true"
                style={{
                  position: "absolute",
                  left: 0,
                  top: 0,
                  bottom: 0,
                  width: 4,
                  background: accent,
                }}
              />
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
                <div style={{ minWidth: 0 }}>
                  <div data-theme-text="strong" style={{ fontSize: 13, fontWeight: 700, fontFamily: "sans-serif" }}>
                    {toast.title}
                  </div>
                  <div data-theme-text="muted" style={{ fontSize: 12, opacity: 0.82, lineHeight: 1.45, marginTop: 4, fontFamily: "sans-serif" }}>
                    {toast.message}
                  </div>
                  {toast.detail ? (
                    <div
                      data-theme-text="muted"
                      style={{
                        fontSize: 11,
                        opacity: 0.62,
                        lineHeight: 1.45,
                        marginTop: 6,
                        fontFamily: "monospace",
                        whiteSpace: "pre-wrap",
                        wordBreak: "break-word",
                      }}
                    >
                      {toast.detail}
                    </div>
                  ) : null}
                </div>
                <button
                  type="button"
                  onClick={() => onDismiss(toast.id)}
                  aria-label={`Dismiss ${toast.title}`}
                  title="Dismiss"
                  style={{
                    width: 28,
                    height: 28,
                    flex: "0 0 auto",
                    borderRadius: 10,
                    border: "1px solid rgba(255,255,255,0.10)",
                    background: "rgba(255,255,255,0.04)",
                    color: "inherit",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    lineHeight: 1,
                    transition: "background 160ms ease, border-color 160ms ease",
                  }}
                >
                  ×
                </button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
