export default function LocalLoadNotice({ active, pending, onDismiss }: { active: boolean; pending: number; onDismiss: () => void; }) {
  if (!active) return null;
  return (
    <div
      data-theme-surface="panel"
      style={{
        position: 'absolute',
        right: 18,
        bottom: 104,
        zIndex: 18,
        width: 'min(320px, calc(100vw - 40px))',
        borderRadius: 16,
        border: '1px solid rgba(255,255,255,0.10)',
        boxShadow: '0 12px 28px rgba(0,0,0,0.30)',
        padding: '12px 14px',
        display: 'grid',
        gap: 8,
        animation: 'local-load-panel-in 180ms ease',
        fontFamily: 'sans-serif',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
        <div style={{ minWidth: 0 }}>
          <div data-theme-text="strong" style={{ fontSize: 13, fontWeight: 700, fontFamily: 'sans-serif' }}>Loading local data…</div>
          <div data-theme-text="muted" style={{ fontSize: 12, opacity: 0.74, lineHeight: 1.45, marginTop: 4, fontFamily: 'sans-serif' }}>
            Preparing local data in the background. You can keep using the viewer while it loads.
          </div>
        </div>
        <button type="button" onClick={onDismiss} aria-label="Dismiss loading notification" title="Dismiss" style={{ width: 28, height: 28, flex: '0 0 auto', borderRadius: 10, border: '1px solid rgba(255,255,255,0.10)', background: 'rgba(255,255,255,0.04)', color: 'inherit', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1 }}>×</button>
      </div>
      <div data-theme-surface="soft" style={{ height: 7, borderRadius: 999, border: '1px solid rgba(255,255,255,0.08)', overflow: 'hidden', position: 'relative' }}>
        <div style={{ position: 'absolute', inset: 0, width: '34%', borderRadius: 999, background: 'linear-gradient(90deg, rgba(120,190,255,0.08), rgba(120,190,255,0.92), rgba(120,190,255,0.08))', animation: 'local-load-indeterminate 1.15s linear infinite' }} />
      </div>
      <div data-theme-text="muted" style={{ fontSize: 11, opacity: 0.7 }}>
        {pending} pending item{pending > 1 ? 's' : ''}
      </div>
    </div>
  );
}
