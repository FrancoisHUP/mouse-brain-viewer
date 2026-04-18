import type { ReactNode } from 'react';

export default function StateDialog({ open, onClose, children }: { open: boolean; onClose: () => void; children: ReactNode; }) {
  if (!open) return null;
  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 44, background: 'rgba(4,6,10,0.48)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, boxSizing: 'border-box' }} onClick={onClose}>
      <div onClick={(event) => event.stopPropagation()} data-theme-surface="panel" style={{ width: 'min(820px, 100%)', maxHeight: 'min(86vh, 960px)', overflow: 'hidden', borderRadius: 18, border: '1px solid rgba(255,255,255,0.10)', boxShadow: '0 18px 48px rgba(0,0,0,0.42)', padding: 18, color: 'inherit', position: 'relative' }}>
        <button type="button" onClick={onClose} aria-label="Close viewer state dialog" title="Close" style={{ position: 'absolute', top: 14, right: 14, width: 34, height: 34, borderRadius: 10, border: '1px solid rgba(255,255,255,0.10)', background: 'rgba(255,255,255,0.05)', color: 'inherit', cursor: 'pointer', zIndex: 2 }}>×</button>
        {children}
      </div>
    </div>
  );
}
