export default function AboutDialog({ open, onClose, version, commitShort, commitUrl, githubUrl, contactEmail }: { open: boolean; onClose: () => void; version: string; commitShort: string; commitUrl: string | null; githubUrl: string; contactEmail: string; }) {
  if (!open) return null;
  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 44, background: 'rgba(4,6,10,0.48)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, boxSizing: 'border-box' }} onClick={onClose}>
      <div onClick={(event) => event.stopPropagation()} data-theme-surface="panel" style={{ width: 'min(760px, 100%)', maxHeight: 'min(86vh, 920px)', overflow: 'hidden', borderRadius: 18, border: '1px solid rgba(255,255,255,0.10)', boxShadow: '0 18px 48px rgba(0,0,0,0.42)', color: 'inherit', position: 'relative' }}>
        <button type="button" onClick={onClose} aria-label="Close about dialog" title="Close" style={{ position: 'absolute', top: 14, right: 14, width: 34, height: 34, borderRadius: 10, border: '1px solid rgba(255,255,255,0.10)', background: 'rgba(255,255,255,0.05)', color: 'inherit', cursor: 'pointer', zIndex: 2 }}>×</button>
        <div data-slice-tool="true" style={{ fontFamily: 'sans-serif', color: 'inherit' }}>
          <div className="layer-panel-scroll" style={{ maxHeight: 'min(86vh, 920px)', overflowY: 'auto', padding: 22, paddingRight: 18 }}>
            <div style={{ maxWidth: 620, display: 'grid', gap: 18 }}>
              <div style={{ paddingRight: 48, display: 'grid', gap: 8 }}>
                <div style={{ fontSize: 22, fontWeight: 800 }}>About the Viewer</div>
                <div data-theme-text="muted" style={{ fontSize: 13, lineHeight: 1.6 }}>Mouse Brain Viewer is a browser-based 3D viewer for exploring layered mouse-brain data, annotations, custom slices, saved sessions, and shareable states in a single interactive WebGL workspace.</div>
              </div>
              <div style={{ display: 'grid', gap: 12, fontSize: 13, lineHeight: 1.65 }}>
                <div>This application was created as a custom React + TypeScript viewer with a WebGL rendering pipeline and a browser-first UX for scientific visualization. The goal is to make advanced 3D exploration accessible directly from the web, without requiring a desktop application.</div>
                <div data-theme-text="muted" style={{ fontSize: 12 }}>Created by François Huppé-Marcoux.</div>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', minHeight: 28, padding: '0 10px', borderRadius: 999, border: '1px solid rgba(255,255,255,0.10)', background: 'rgba(255,255,255,0.04)', fontSize: 11, fontWeight: 700 }}>Version {version}</span>
                <span style={{ display: 'inline-flex', alignItems: 'center', minHeight: 28, padding: '0 10px', borderRadius: 999, border: '1px solid rgba(255,255,255,0.10)', background: 'rgba(255,255,255,0.04)', fontSize: 11, fontWeight: 700 }}>Commit {commitShort}</span>
              </div>
              <div style={{ display: 'grid', gap: 10, paddingTop: 4 }}>
                <div style={{ fontSize: 14, fontWeight: 700 }}>Project links</div>
                <div style={{ display: 'grid', gap: 10 }}>
                  <div style={{ display: 'grid', gap: 4 }}>
                    <div data-theme-text="muted" style={{ fontSize: 12, fontWeight: 700 }}>GitHub repository</div>
                    <a href={githubUrl} target="_blank" rel="noreferrer" style={{ color: 'inherit', textDecoration: 'underline', textUnderlineOffset: 3, wordBreak: 'break-all' }}>{githubUrl}</a>
                  </div>
                  {commitUrl ? (
                    <div style={{ display: 'grid', gap: 4 }}>
                      <div data-theme-text="muted" style={{ fontSize: 12, fontWeight: 700 }}>Deployed commit</div>
                      <a href={commitUrl} target="_blank" rel="noreferrer" style={{ color: 'inherit', textDecoration: 'underline', textUnderlineOffset: 3, wordBreak: 'break-all' }}>{commitUrl}</a>
                    </div>
                  ) : null}
                </div>
              </div>
              <div style={{ display: 'grid', gap: 10, paddingTop: 4 }}>
                <div style={{ fontSize: 14, fontWeight: 700 }}>Contact</div>
                <div data-theme-text="muted" style={{ fontSize: 12, lineHeight: 1.6 }}>For questions, feedback, collaboration, or bug reports, contact:</div>
                <div style={{ fontSize: 13, fontWeight: 700 }}>{contactEmail}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
