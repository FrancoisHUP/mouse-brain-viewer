import { primaryButtonStyle, secondaryButtonStyle } from '../../utils/app/appHelpers';

export default function ClearHistoryDialog({ open, onClose, onConfirm }: { open: boolean; onClose: () => void; onConfirm: () => void; }) {
  if (!open) return null;
  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 45, background: 'rgba(4,6,10,0.48)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, boxSizing: 'border-box' }} onClick={onClose}>
      <div onClick={(event) => event.stopPropagation()} data-theme-surface="panel" style={{ width: 'min(420px, 100%)', borderRadius: 18, background: 'rgba(12,14,18,0.96)', border: '1px solid rgba(255,255,255,0.10)', boxShadow: '0 18px 48px rgba(0,0,0,0.42)', padding: 18, color: 'white' }}>
        <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 10 }}>Delete history?</div>
        <div style={{ fontSize: 13, lineHeight: 1.55, opacity: 0.78 }}>Do you really want to delete the entire history? This operation cannot be undone.</div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 18 }}>
          <button type="button" onClick={onClose} style={secondaryButtonStyle}>No</button>
          <button type="button" onClick={onConfirm} style={{ ...primaryButtonStyle, border: '1px solid rgba(255,140,140,0.34)', background: 'rgba(200,70,70,0.18)' }}>Yes, delete history</button>
        </div>
      </div>
    </div>
  );
}
