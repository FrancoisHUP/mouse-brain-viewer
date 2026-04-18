export default function GlobalDropOverlay({ visible }: { visible: boolean }) {
  if (!visible) return null;
  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 26, background: 'rgba(8,12,16,0.54)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none', padding: 24, boxSizing: 'border-box' }}>
      <div data-theme-surface="panel" style={{ width: 'min(500px, calc(100vw - 48px))', borderRadius: 24, border: '1px solid rgba(255,255,255,0.16)', background: 'rgba(12,14,18,0.92)', boxShadow: '0 24px 60px rgba(0,0,0,0.38)', padding: '28px 30px', display: 'grid', gap: 10, textAlign: 'center', fontFamily: 'sans-serif' }}>
        <div style={{ width: 64, height: 64, margin: '0 auto', borderRadius: 18, border: '1px solid rgba(255,255,255,0.18)', background: 'rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.92)', fontSize: 28, fontWeight: 700 }}>+</div>
        <div data-theme-text="strong" style={{ fontSize: 22, fontWeight: 800 }}>Drop files to add them</div>
        <div data-theme-text="muted" style={{ fontSize: 13, opacity: 0.76, lineHeight: 1.5 }}>Release anywhere in the viewer.</div>
      </div>
    </div>
  );
}
