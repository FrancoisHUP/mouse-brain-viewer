import { primaryButtonStyle, secondaryButtonStyle } from '../../utils/app/appHelpers';

export default function ShareDialog({ open, shareUrlDraft, localOnlyLayerNames, stateError, stateShareMessage, onClose, onCopyShareLink }: { open: boolean; shareUrlDraft: string; localOnlyLayerNames: string[]; stateError: string | null; stateShareMessage: string | null; onClose: () => void; onCopyShareLink: () => void | Promise<void>; }) {
  if (!open) return null;
  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 45, background: 'rgba(4,6,10,0.48)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, boxSizing: 'border-box' }} onClick={onClose}>
      <div onClick={(event) => event.stopPropagation()} data-theme-surface="panel" style={{ width: 'min(720px, 100%)', maxHeight: 'min(82vh, 820px)', overflow: 'hidden', borderRadius: 18, border: '1px solid rgba(255,255,255,0.10)', boxShadow: '0 18px 48px rgba(0,0,0,0.42)', padding: 18, color: 'inherit', position: 'relative', display: 'grid', gap: 14 }}>
        <button type="button" onClick={onClose} aria-label="Close share dialog" title="Close" style={{ position: 'absolute', top: 14, right: 14, width: 34, height: 34, borderRadius: 10, border: '1px solid rgba(255,255,255,0.10)', background: 'rgba(255,255,255,0.05)', color: 'inherit', cursor: 'pointer', zIndex: 2 }}>×</button>
        <div data-slice-tool="true" style={{ fontFamily: 'sans-serif', color: 'inherit', display: 'grid', gap: 14 }}>
          <div style={{ paddingRight: 48 }}>
            <div style={{ fontSize: 18, fontWeight: 700 }}>Share Viewer Link</div>
            <div data-theme-text="muted" style={{ fontSize: 12, marginTop: 5, lineHeight: 1.45 }}>Copy a URL containing the current viewer state. Anyone with the link can open the same shared view.</div>
          </div>
          {localOnlyLayerNames.length > 0 ? (
            <div style={{ borderRadius: 12, border: '1px solid rgba(255,180,120,0.35)', background: 'rgba(255,180,120,0.10)', padding: 12, fontSize: 12, lineHeight: 1.5 }}>
              <div style={{ fontWeight: 700, marginBottom: 6 }}>Some layers are local to this browser</div>
              <div>The link will still work, but these local layers will not appear on other devices or browsers.</div>
              <div style={{ marginTop: 8 }}><strong>Unavailable in shared view:</strong></div>
              <div style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 6 }}>{localOnlyLayerNames.map((layerName) => <span key={layerName} style={{ display: 'inline-flex', alignItems: 'center', minHeight: 24, padding: '0 8px', borderRadius: 999, border: '1px solid rgba(255,200,150,0.30)', background: 'rgba(255,255,255,0.06)', fontSize: 11, fontWeight: 600 }}>{layerName}</span>)}</div>
            </div>
          ) : null}
          <textarea className="layer-panel-scroll" value={shareUrlDraft} readOnly spellCheck={false} style={{ width: '100%', minHeight: 140, maxHeight: 'min(36vh, 320px)', resize: 'vertical', overflowY: 'auto', borderRadius: 14, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.05)', color: 'inherit', padding: 14, boxSizing: 'border-box', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace', fontSize: 12, lineHeight: 1.52, outline: 'none' }} />
          {stateError ? <div style={{ fontSize: 12, color: '#ffb4b4', lineHeight: 1.4 }}>{stateError}</div> : null}
          {!stateError && stateShareMessage ? <div style={{ fontSize: 12, color: 'rgba(170,230,190,0.95)', lineHeight: 1.4 }}>{stateShareMessage}</div> : null}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
            <div data-theme-text="muted" style={{ fontSize: 12 }}>The link uses the current website URL with an encoded viewer state in the hash.</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" onClick={onClose} style={secondaryButtonStyle}>Close</button>
              <button type="button" onClick={() => void onCopyShareLink()} style={primaryButtonStyle}>Copy share link</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
