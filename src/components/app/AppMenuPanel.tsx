import type { ReactNode } from 'react';
import { AboutMenuIcon, ExportStateMenuIcon, ImportDataMenuIcon, ImportStateMenuIcon, LibraryMenuIcon, ManageDataMenuIcon, MenuHamburgerIcon, NewViewerIcon, ProfileMenuIcon, SaveMenuIcon, ShareMenuIcon } from '../../utils/app/appIcons';

function AppMenuButton({ icon, label, onClick }: { icon: ReactNode; label: string; onClick: () => void; }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{ height: 36, padding: '0 10px', borderRadius: 10, border: '1px solid transparent', background: 'transparent', color: 'inherit', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'flex-start', gap: 10, textAlign: 'left', transition: 'background 160ms ease, border-color 160ms ease' }}
      onMouseEnter={(event) => { event.currentTarget.style.background = 'rgba(255,255,255,0.06)'; event.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'; }}
      onMouseLeave={(event) => { event.currentTarget.style.background = 'transparent'; event.currentTarget.style.borderColor = 'transparent'; }}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

export default function AppMenuPanel({ open, onToggleOpen, onCreateNewViewer, onOpenLibrary, onSaveViewer, onOpenImportData, onOpenManageLocalData, onOpenExportState, onOpenImportState, onOpenShareDialog, onOpenProfile, onOpenAbout }: { open: boolean; onToggleOpen: () => void; onCreateNewViewer: () => void; onOpenLibrary: () => void; onSaveViewer: () => void; onOpenImportData: () => void; onOpenManageLocalData: () => void; onOpenExportState: () => void; onOpenImportState: () => void; onOpenShareDialog: () => void; onOpenProfile: () => void; onOpenAbout: () => void; }) {
  return (
    <div data-viewer-app-menu="true" style={{ position: 'absolute', top: 16, left: 16, zIndex: 26, pointerEvents: 'none' }}>
      <div style={{ position: 'relative', pointerEvents: 'auto', fontFamily: 'sans-serif', width: 'fit-content' }}>
        <button type="button" onClick={onToggleOpen} style={{ height: 46, padding: '0 14px', borderRadius: 16, border: '1px solid rgba(255,255,255,0.10)', background: 'rgba(12,14,18,0.82)', color: 'white', boxShadow: '0 12px 30px rgba(0,0,0,0.32)', backdropFilter: 'blur(12px)', display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontWeight: 700 }}>
          <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}><MenuHamburgerIcon /></span>
          <span>Viewer</span>
        </button>
        <div data-theme-surface="panel" style={{ position: 'absolute', top: 'calc(100% + 10px)', left: 0, zIndex: 60, width: 292, borderRadius: 18, border: '1px solid rgba(255,255,255,0.10)', boxShadow: '0 16px 40px rgba(0,0,0,0.40)', backdropFilter: 'blur(14px)', padding: 12, display: 'grid', gap: 12, opacity: open ? 1 : 0, transform: open ? 'translateY(0) scale(1)' : 'translateY(-8px) scale(0.985)', transformOrigin: 'top left', visibility: open ? 'visible' : 'hidden', pointerEvents: open ? 'auto' : 'none', transition: 'opacity 180ms ease, transform 220ms ease, visibility 180ms ease' }}>
          <div style={{ display: 'grid', gap: 6 }}>
            <div data-theme-text="muted" style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.45, textTransform: 'uppercase' }}>Viewer</div>
            <div style={{ display: 'grid', gap: 4 }}>
              <AppMenuButton icon={<NewViewerIcon />} label="New empty viewer" onClick={onCreateNewViewer} />
              <AppMenuButton icon={<LibraryMenuIcon />} label="Open library" onClick={onOpenLibrary} />
              <AppMenuButton icon={<SaveMenuIcon />} label="Save viewer" onClick={onSaveViewer} />
            </div>
          </div>
          <div style={{ display: 'grid', gap: 6 }}>
            <div data-theme-text="muted" style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.45, textTransform: 'uppercase' }}>Data</div>
            <div style={{ display: 'grid', gap: 4 }}>
              <AppMenuButton icon={<ImportDataMenuIcon />} label="Import data" onClick={onOpenImportData} />
              <AppMenuButton icon={<ManageDataMenuIcon />} label="Manage local data" onClick={onOpenManageLocalData} />
            </div>
          </div>
          <div style={{ display: 'grid', gap: 6 }}>
            <div data-theme-text="muted" style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.45, textTransform: 'uppercase' }}>Share</div>
            <div style={{ display: 'grid', gap: 4 }}>
              <AppMenuButton icon={<ExportStateMenuIcon />} label="Export viewer state" onClick={onOpenExportState} />
              <AppMenuButton icon={<ImportStateMenuIcon />} label="Import viewer state" onClick={onOpenImportState} />
              <AppMenuButton icon={<ShareMenuIcon />} label="Copy share link" onClick={onOpenShareDialog} />
            </div>
          </div>
          <div style={{ display: 'grid', gap: 6 }}>
            <div data-theme-text="muted" style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.45, textTransform: 'uppercase' }}>App</div>
            <div style={{ display: 'grid', gap: 4 }}>
              <AppMenuButton icon={<ProfileMenuIcon />} label="Profile & preferences" onClick={onOpenProfile} />
              <AppMenuButton icon={<AboutMenuIcon />} label="About" onClick={onOpenAbout} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
