export type SaveToast = { id: string; message: string; isClosing: boolean };

export default function SaveToastStack({ toasts, bottomOffset, onDismiss }: { toasts: SaveToast[]; bottomOffset: number; onDismiss: (toastId: string) => void; }) {
  if (!toasts.length) return null;
  return (
    <div style={{ position: "absolute", right: 18, bottom: bottomOffset, zIndex: 19, width: "min(320px, calc(100vw - 40px))", display: "grid", gap: 10, pointerEvents: "none" }}>
      {toasts.map((toast) => (
        <div key={toast.id} data-theme-surface="panel" style={{ borderRadius: 16, border: "1px solid rgba(255,255,255,0.10)", boxShadow: "0 12px 28px rgba(0,0,0,0.30)", padding: "12px 14px", display: "grid", gap: 8, fontFamily: "sans-serif", pointerEvents: "auto", animation: toast.isClosing ? "toast-panel-out 220ms ease forwards" : "toast-panel-in 180ms ease" }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
            <div style={{ minWidth: 0 }}>
              <div data-theme-text="strong" style={{ fontSize: 13, fontWeight: 700, fontFamily: "sans-serif" }}>Viewer saved</div>
              <div data-theme-text="muted" style={{ fontSize: 12, opacity: 0.74, lineHeight: 1.45, marginTop: 4, fontFamily: "sans-serif" }}>{toast.message}</div>
            </div>
            <button type="button" onClick={() => onDismiss(toast.id)} aria-label="Dismiss save notification" title="Dismiss" style={{ width: 28, height: 28, flex: "0 0 auto", borderRadius: 10, border: "1px solid rgba(255,255,255,0.10)", background: "rgba(255,255,255,0.04)", color: "inherit", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>×</button>
          </div>
        </div>
      ))}
    </div>
  );
}
