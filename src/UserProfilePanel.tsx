import { useEffect, useMemo, useState } from "react";
import { listLocalDatasetRecords, type StoredLocalDatasetRecord } from "./localDataStore";
import {
  clearAllAnonymousUserData,
  clearAllCustomExternalSources,
  getAnonymousUserId,
  getCustomExternalSources,
} from "./customSourceStore";
import {
  loadAppPreferences,
  resetAppPreferences,
  updateAppPreferences,
  type AppPreferences,
  type AppThemeId,
  type CursorStyleId,
} from "./appPreferencesStore";

type ProfileTabId = "data" | "settings";

type ThemePalette = {
  panelBackground: string;
  border: string;
  subtleBackground: string;
  strongBackground: string;
  titleColor: string;
  textColor: string;
  mutedText: string;
  overlayBackground: string;
};

type ConfirmDialogState = {
  title: string;
  message: string;
  confirmLabel: string;
  onConfirm: () => void | Promise<void>;
} | null;

type LocalDatasetSummary = {
  records: StoredLocalDatasetRecord[];
  totalBytes: number;
};

type StorageEstimateSummary = {
  usage: number | null;
  quota: number | null;
};

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value >= 10 || unitIndex === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[unitIndex]}`;
}

async function getStorageEstimateSummary(): Promise<StorageEstimateSummary> {
  if (typeof navigator === "undefined" || !navigator.storage || typeof navigator.storage.estimate !== "function") {
    return { usage: null, quota: null };
  }
  try {
    const estimate = await navigator.storage.estimate();
    return {
      usage: typeof estimate.usage === "number" ? estimate.usage : null,
      quota: typeof estimate.quota === "number" ? estimate.quota : null,
    };
  } catch {
    return { usage: null, quota: null };
  }
}


function getThemePalette(theme: AppThemeId): ThemePalette {
  switch (theme) {
    case "light":
      return {
        panelBackground: "rgba(235,240,246,0.96)",
        border: "rgba(20,28,36,0.12)",
        subtleBackground: "rgba(20,28,36,0.05)",
        strongBackground: "rgba(20,28,36,0.08)",
        titleColor: "#14212c",
        textColor: "#1e2a34",
        mutedText: "rgba(20,33,44,0.68)",
        overlayBackground: "rgba(8,12,16,0.42)",
      };
    case "gray":
      return {
        panelBackground: "rgba(32,35,39,0.96)",
        border: "rgba(255,255,255,0.10)",
        subtleBackground: "rgba(255,255,255,0.04)",
        strongBackground: "rgba(255,255,255,0.06)",
        titleColor: "#f3f5f7",
        textColor: "#eef1f4",
        mutedText: "rgba(255,255,255,0.66)",
        overlayBackground: "rgba(0,0,0,0.45)",
      };
    case "dark":
    default:
      return {
        panelBackground: "rgba(12,14,18,0.96)",
        border: "rgba(255,255,255,0.10)",
        subtleBackground: "rgba(255,255,255,0.03)",
        strongBackground: "rgba(255,255,255,0.05)",
        titleColor: "#ffffff",
        textColor: "#ffffff",
        mutedText: "rgba(255,255,255,0.68)",
        overlayBackground: "rgba(0,0,0,0.45)",
      };
  }
}

function UserIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21a8 8 0 00-16 0" />
      <circle cx="12" cy="8" r="4" />
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.6 1.6 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.6 1.6 0 00-1.8-.3 1.6 1.6 0 00-1 1.5V21a2 2 0 11-4 0v-.2a1.6 1.6 0 00-1-1.5 1.6 1.6 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.6 1.6 0 00.3-1.8 1.6 1.6 0 00-1.5-1H3a2 2 0 110-4h.2a1.6 1.6 0 001.5-1 1.6 1.6 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.6 1.6 0 001.8.3h.1A1.6 1.6 0 0010 3.2V3a2 2 0 114 0v.2a1.6 1.6 0 001 1.5 1.6 1.6 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.6 1.6 0 00-.3 1.8v.1a1.6 1.6 0 001.5 1H21a2 2 0 110 4h-.2a1.6 1.6 0 00-1.4 1z" />
    </svg>
  );
}

function TabButton({
  active,
  label,
  icon,
  onClick,
  palette,
}: {
  active: boolean;
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  palette: ThemePalette;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        flex: 1,
        height: 40,
        borderRadius: 12,
        border: active ? "1px solid rgba(160,220,255,0.65)" : `1px solid ${palette.border}`,
        background: active ? "rgba(120,190,255,0.14)" : palette.subtleBackground,
        color: palette.textColor,
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        fontWeight: 700,
        fontSize: 13,
      }}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

function SectionCard({
  title,
  subtitle,
  children,
  palette,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  palette: ThemePalette;
}) {
  return (
    <div
      style={{
        borderRadius: 16,
        border: `1px solid ${palette.border}`,
        background: palette.subtleBackground,
        padding: 16,
      }}
    >
      <div style={{ fontSize: 14, fontWeight: 800, color: palette.titleColor }}>{title}</div>
      {subtitle ? (
        <div style={{ fontSize: 12, color: palette.mutedText, marginTop: 6 }}>{subtitle}</div>
      ) : null}
      <div style={{ marginTop: 14 }}>{children}</div>
    </div>
  );
}

function ActionButton({
  label,
  onClick,
  danger,
  palette,
}: {
  label: string;
  onClick: () => void;
  danger?: boolean;
  palette: ThemePalette;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        height: 38,
        padding: "0 12px",
        borderRadius: 10,
        border: danger ? "1px solid rgba(255,120,120,0.25)" : `1px solid ${palette.border}`,
        background: danger ? "rgba(255,80,80,0.10)" : palette.strongBackground,
        color: palette.textColor,
        cursor: "pointer",
        fontSize: 12,
        fontWeight: 700,
      }}
    >
      {label}
    </button>
  );
}

function ConfirmDialog({
  dialog,
  palette,
  onCancel,
}: {
  dialog: ConfirmDialogState;
  palette: ThemePalette;
  onCancel: () => void;
}) {
  if (!dialog) return null;

  return (
    <div
      onClick={onCancel}
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 80,
        background: palette.overlayBackground,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(460px, calc(100vw - 40px))",
          borderRadius: 18,
          border: `1px solid ${palette.border}`,
          background: palette.panelBackground,
          boxShadow: "0 24px 60px rgba(0,0,0,0.45)",
          backdropFilter: "blur(14px)",
          padding: 18,
          color: palette.textColor,
        }}
      >
        <div style={{ fontSize: 17, fontWeight: 800, color: palette.titleColor }}>
          {dialog.title}
        </div>
        <div style={{ fontSize: 13, color: palette.mutedText, marginTop: 10, lineHeight: 1.45 }}>
          {dialog.message}
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            gap: 10,
            marginTop: 18,
          }}
        >
          <button
            type="button"
            onClick={onCancel}
            style={{
              height: 40,
              padding: "0 14px",
              borderRadius: 10,
              border: `1px solid ${palette.border}`,
              background: palette.strongBackground,
              color: palette.textColor,
              cursor: "pointer",
              fontSize: 12,
              fontWeight: 700,
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={async () => {
              await dialog.onConfirm();
              onCancel();
            }}
            style={{
              height: 40,
              padding: "0 14px",
              borderRadius: 10,
              border: "1px solid rgba(255,120,120,0.25)",
              background: "rgba(255,80,80,0.12)",
              color: palette.textColor,
              cursor: "pointer",
              fontSize: 12,
              fontWeight: 700,
            }}
          >
            {dialog.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function UserProfilePanel({
  open,
  onClose,
  onPreferencesChange,
  onClearViewerState,
  onClearViewerHistory,
  onResetLocalProfile,
  onDeleteLocalDataset,
  onOpenLocalDatasetManager,
  onDataChanged,
  savedViewerStateExists = false,
  savedHistoryCount = 0,
  dataRevision = 0,
}: {
  open: boolean;
  onClose: () => void;
  onPreferencesChange?: (preferences: AppPreferences) => void;
  onClearViewerState?: () => void | Promise<void>;
  onClearViewerHistory?: () => void | Promise<void>;
  onResetLocalProfile?: () => void | Promise<void>;
  onDeleteLocalDataset?: (datasetId: string) => void | Promise<void>;
  onOpenLocalDatasetManager?: () => void;
  onDataChanged?: () => void;
  savedViewerStateExists?: boolean;
  savedHistoryCount?: number;
  dataRevision?: number;
}) {
  const [tab, setTab] = useState<ProfileTabId>("data");
  const [preferences, setPreferences] = useState<AppPreferences>(loadAppPreferences());
  const [customSourceCount, setCustomSourceCount] = useState(0);
  const [anonymousUserId, setAnonymousUserId] = useState("");
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState>(null);
  const [localDatasetSummary, setLocalDatasetSummary] = useState<LocalDatasetSummary>({ records: [], totalBytes: 0 });
  const [storageEstimate, setStorageEstimate] = useState<StorageEstimateSummary>({ usage: null, quota: null });
  const [localDatasetError, setLocalDatasetError] = useState<string | null>(null);

  async function refreshLocalDatasetSummary() {
    try {
      const [records, estimate] = await Promise.all([
        listLocalDatasetRecords(),
        getStorageEstimateSummary(),
      ]);
      setLocalDatasetSummary({
        records,
        totalBytes: records.reduce((sum, record) => sum + record.size, 0),
      });
      setStorageEstimate(estimate);
      setLocalDatasetError(null);
    } catch (error) {
      setLocalDatasetSummary({ records: [], totalBytes: 0 });
      setStorageEstimate({ usage: null, quota: null });
      setLocalDatasetError(error instanceof Error ? error.message : "Failed to load local browser datasets.");
    }
  }

  useEffect(() => {
    if (!open) return;
    setPreferences(loadAppPreferences());
    setCustomSourceCount(getCustomExternalSources().length);
    setAnonymousUserId(getAnonymousUserId());
    void refreshLocalDatasetSummary();
  }, [open, dataRevision]);

  const palette = useMemo(() => getThemePalette(preferences.theme), [preferences.theme]);
  const storageUsageRatio = useMemo(() => {
    if (storageEstimate.quota == null || storageEstimate.quota <= 0) return null;
    return Math.max(0, Math.min(1, localDatasetSummary.totalBytes / storageEstimate.quota));
  }, [localDatasetSummary.totalBytes, storageEstimate.quota]);
  const storageUsagePercent = storageUsageRatio == null ? null : Math.round(storageUsageRatio * 100);
  const storageWarningMessage = useMemo(() => {
    if (storageUsageRatio == null) return null;
    if (storageUsageRatio >= 0.95) {
      return "Almost no browser storage space is left. Delete some local files soon to avoid import failures.";
    }
    if (storageUsageRatio >= 0.8) {
      return "Browser storage is getting full. You may want to free some local files.";
    }
    return null;
  }, [storageUsageRatio]);


  if (!open) return null;

  function applyPreferences(next: AppPreferences) {
    setPreferences(next);
    onPreferencesChange?.(next);
  }

  function requestConfirmation(dialog: ConfirmDialogState) {
    setConfirmDialog(dialog);
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 60,
        background: palette.overlayBackground,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(760px, calc(100vw - 32px))",
          maxHeight: "min(86vh, 900px)",
          overflowY: "auto",
          borderRadius: 20,
          border: `1px solid ${palette.border}`,
          background: palette.panelBackground,
          backdropFilter: "blur(14px)",
          boxShadow: "0 24px 60px rgba(0,0,0,0.45)",
          color: palette.textColor,
          fontFamily: "sans-serif",
          padding: 18,
          position: "relative",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 16,
            marginBottom: 18,
          }}
        >
          <div>
            <div style={{ fontSize: 18, fontWeight: 800, color: palette.titleColor }}>User profile</div>
            <div style={{ fontSize: 12, color: palette.mutedText, marginTop: 6 }}>
              Anonymous browser profile: {anonymousUserId || "Not initialized"}
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            style={{
              width: 36,
              height: 36,
              borderRadius: 10,
              border: `1px solid ${palette.border}`,
              background: palette.strongBackground,
              color: palette.textColor,
              cursor: "pointer",
              fontSize: 18,
            }}
          >
            ×
          </button>
        </div>

        <div style={{ display: "flex", gap: 10, marginBottom: 18 }}>
          <TabButton active={tab === "data"} label="User data" icon={<UserIcon />} onClick={() => setTab("data")} palette={palette} />
          <TabButton active={tab === "settings"} label="Settings" icon={<SettingsIcon />} onClick={() => setTab("settings")} palette={palette} />
        </div>

        {tab === "data" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <SectionCard
              title="History retention"
              subtitle="Choose how many undo states the browser can keep."
              palette={palette}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                <input
                  type="range"
                  min={5}
                  max={500}
                  step={5}
                  value={preferences.historyLimit}
                  onChange={(e) => {
                    const next = updateAppPreferences({ historyLimit: Number(e.target.value) });
                    applyPreferences(next);
                  }}
                  style={{ width: 240 }}
                />
                <div
                  style={{
                    minWidth: 90,
                    height: 36,
                    borderRadius: 10,
                    border: `1px solid ${palette.border}`,
                    background: palette.strongBackground,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 12,
                    fontWeight: 700,
                  }}
                >
                  {preferences.historyLimit} steps
                </div>
              </div>
            </SectionCard>

            <SectionCard
              title="Saved browser data"
              subtitle="Manage the data currently stored locally by this browser for the viewer."
              palette={palette}
            >
              <div style={{ display: "grid", gap: 14 }}>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "minmax(0,1fr) auto",
                    gap: 12,
                    alignItems: "center",
                    padding: 12,
                    borderRadius: 12,
                    border: `1px solid ${palette.border}`,
                    background: palette.strongBackground,
                  }}
                >
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700 }}>Custom external sources</div>
                    <div style={{ fontSize: 12, color: palette.mutedText, marginTop: 4 }}>
                      {customSourceCount} custom source{customSourceCount !== 1 ? "s" : ""} saved
                    </div>
                  </div>
                  <ActionButton
                    label="Delete custom sources"
                    danger
                    palette={palette}
                    onClick={() => {
                      requestConfirmation({
                        title: "Delete custom sources",
                        message: "Delete all saved custom external sources from this browser? This action cannot be undone.",
                        confirmLabel: "Delete sources",
                        onConfirm: () => {
                          clearAllCustomExternalSources();
                          setCustomSourceCount(0);
                          onDataChanged?.();
                        },
                      });
                    }}
                  />
                </div>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "minmax(0,1fr) auto auto",
                    gap: 12,
                    alignItems: "center",
                    padding: 12,
                    borderRadius: 12,
                    border: `1px solid ${palette.border}`,
                    background: palette.strongBackground,
                  }}
                >
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700 }}>Viewer saved state</div>
                    <div style={{ fontSize: 12, color: palette.mutedText, marginTop: 4 }}>
                      Current saved state: {savedViewerStateExists ? "available" : "empty"}
                    </div>
                  </div>
                  <ActionButton
                    label="Delete saved state"
                    danger
                    palette={palette}
                    onClick={() => {
                      requestConfirmation({
                        title: "Delete saved viewer state",
                        message: "Delete the saved viewer state for this browser? The current on-screen session will stay open until you leave or reload.",
                        confirmLabel: "Delete state",
                        onConfirm: () => {
                          onClearViewerState?.();
                          onDataChanged?.();
                        },
                      });
                    }}
                  />
                  <ActionButton
                    label="Delete viewer history"
                    danger
                    palette={palette}
                    onClick={() => {
                      requestConfirmation({
                        title: "Delete viewer history",
                        message: "Delete the saved undo/redo history for this browser? This will not delete the current saved viewer state.",
                        confirmLabel: "Delete history",
                        onConfirm: () => {
                          onClearViewerHistory?.();
                          onDataChanged?.();
                        },
                      });
                    }}
                  />
                </div>

                <div
                  style={{
                    display: "grid",
                    gap: 12,
                    padding: 12,
                    borderRadius: 12,
                    border: `1px solid ${palette.border}`,
                    background: palette.strongBackground,
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700 }}>Browser local datasets</div>
                      <div style={{ fontSize: 12, color: palette.mutedText, marginTop: 4 }}>
                        {localDatasetSummary.records.length} saved file{localDatasetSummary.records.length !== 1 ? "s" : ""} · {formatBytes(localDatasetSummary.totalBytes)} used
                        {storageEstimate.quota != null ? ` of ${formatBytes(storageEstimate.quota)}` : " in browser storage"}
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
                      <ActionButton
                        label="Open data manager"
                        palette={palette}
                        onClick={() => {
                          onOpenLocalDatasetManager?.();
                        }}
                      />
                      <ActionButton
                        label="Delete all files"
                        danger
                        palette={palette}
                        onClick={() => {
                          if (!localDatasetSummary.records.length) return;
                          requestConfirmation({
                            title: "Delete local browser files",
                            message: `Delete all ${localDatasetSummary.records.length} locally stored file${localDatasetSummary.records.length !== 1 ? "s" : ""} from this browser? This action cannot be undone.`,
                            confirmLabel: "Delete files",
                            onConfirm: async () => {
                              for (const record of localDatasetSummary.records) {
                                await onDeleteLocalDataset?.(record.id);
                              }
                              await refreshLocalDatasetSummary();
                              onDataChanged?.();
                            },
                          });
                        }}
                      />
                    </div>
                  </div>

                  <div style={{ display: "grid", gap: 8 }}>
                    <div
                      style={{
                        height: 10,
                        borderRadius: 999,
                        background: palette.subtleBackground,
                        border: `1px solid ${palette.border}`,
                        overflow: "hidden",
                      }}
                    >
                      <div
                        style={{
                          width: `${storageUsagePercent ?? 0}%`,
                          height: "100%",
                          borderRadius: 999,
                          background:
                            storageUsageRatio != null && storageUsageRatio >= 0.95
                              ? "linear-gradient(90deg, rgba(255,120,120,0.9), rgba(255,80,80,0.95))"
                              : storageUsageRatio != null && storageUsageRatio >= 0.8
                              ? "linear-gradient(90deg, rgba(255,210,120,0.9), rgba(255,170,70,0.95))"
                              : "linear-gradient(90deg, rgba(120,190,255,0.9), rgba(90,160,255,0.95))",
                          transition: "width 180ms ease",
                        }}
                      />
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 11, color: palette.mutedText }}>
                      <span>{formatBytes(localDatasetSummary.totalBytes)} used by local files</span>
                      <span>
                        {storageEstimate.quota != null
                          ? `${storageUsagePercent ?? 0}% of browser quota`
                          : "Browser quota unavailable"}
                      </span>
                    </div>
                  </div>

                  {localDatasetError ? (
                    <div style={{ fontSize: 12, color: "#ffb4b4" }}>{localDatasetError}</div>
                  ) : null}

                  {storageWarningMessage ? (
                    <div
                      style={{
                        fontSize: 12,
                        color: storageUsageRatio != null && storageUsageRatio >= 0.95 ? "#ffd4d4" : "#ffe2a8",
                        border: storageUsageRatio != null && storageUsageRatio >= 0.95
                          ? "1px solid rgba(255,120,120,0.25)"
                          : "1px solid rgba(255,190,90,0.22)",
                        background: storageUsageRatio != null && storageUsageRatio >= 0.95
                          ? "rgba(255,80,80,0.10)"
                          : "rgba(255,180,60,0.10)",
                        borderRadius: 10,
                        padding: "10px 12px",
                        lineHeight: 1.45,
                      }}
                    >
                      {storageWarningMessage}
                    </div>
                  ) : null}

                  {!localDatasetSummary.records.length ? (
                    <div style={{ fontSize: 12, color: palette.mutedText }}>
                      No local browser files saved right now.
                    </div>
                  ) : null}
                </div>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "minmax(0,1fr) auto",
                    gap: 12,
                    alignItems: "center",
                    padding: 12,
                    borderRadius: 12,
                    border: `1px solid ${palette.border}`,
                    background: palette.strongBackground,
                  }}
                >
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700 }}>Reset local profile</div>
                    <div style={{ fontSize: 12, color: palette.mutedText, marginTop: 4 }}>
                      Factory reset for this browser: clears custom sources, saved states, viewer history, local browser datasets, preferences, and the current viewer state. History snapshots saved: {savedHistoryCount}
                    </div>
                  </div>
                  <ActionButton
                    label="Reset all local data"
                    danger
                    palette={palette}
                    onClick={() => {
                      requestConfirmation({
                        title: "Reset local profile",
                        message: "Reset all locally saved data and settings for this browser? This clears custom sources, saved states, viewer history, local browser datasets, preferences, and the current viewer state, then reloads the page.",
                        confirmLabel: "Reset everything",
                        onConfirm: () => {
                          clearAllAnonymousUserData();
                          setCustomSourceCount(0);
                          setAnonymousUserId("");
                          const next = resetAppPreferences();
                          applyPreferences(next);
                          onResetLocalProfile?.();
                          onDataChanged?.();
                        },
                      });
                    }}
                  />
                </div>
              </div>
            </SectionCard>
          </div>
        )}

        {tab === "settings" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <SectionCard title="Theme" subtitle="Choose the general application theme." palette={palette}>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                {(["dark", "gray", "light"] as AppThemeId[]).map((themeId) => {
                  const active = preferences.theme === themeId;
                  return (
                    <button
                      key={themeId}
                      type="button"
                      onClick={() => {
                        const next = updateAppPreferences({ theme: themeId });
                        applyPreferences(next);
                      }}
                      style={{
                        height: 38,
                        padding: "0 14px",
                        borderRadius: 10,
                        border: active ? "1px solid rgba(160,220,255,0.65)" : `1px solid ${palette.border}`,
                        background: active ? "rgba(120,190,255,0.14)" : palette.strongBackground,
                        color: palette.textColor,
                        cursor: "pointer",
                        fontSize: 12,
                        fontWeight: 700,
                        textTransform: "capitalize",
                      }}
                    >
                      {themeId}
                    </button>
                  );
                })}
              </div>
            </SectionCard>

            <SectionCard title="Cursor" subtitle="Choose a cursor style for visibility and precision." palette={palette}>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                {(["default", "high-contrast", "crosshair"] as CursorStyleId[]).map((cursorId) => {
                  const active = preferences.cursorStyle === cursorId;
                  return (
                    <button
                      key={cursorId}
                      type="button"
                      onClick={() => {
                        const next = updateAppPreferences({ cursorStyle: cursorId });
                        applyPreferences(next);
                      }}
                      style={{
                        height: 38,
                        padding: "0 14px",
                        borderRadius: 10,
                        border: active ? "1px solid rgba(160,220,255,0.65)" : `1px solid ${palette.border}`,
                        background: active ? "rgba(120,190,255,0.14)" : palette.strongBackground,
                        color: palette.textColor,
                        cursor: "pointer",
                        fontSize: 12,
                        fontWeight: 700,
                      }}
                    >
                      {cursorId}
                    </button>
                  );
                })}
              </div>
            </SectionCard>

            <SectionCard title="3D scene background" subtitle="Choose the background color used in the 3D viewer." palette={palette}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                <input
                  type="color"
                  value={preferences.sceneBackground}
                  onChange={(e) => {
                    const next = updateAppPreferences({
                      sceneBackground: e.target.value,
                    });
                    applyPreferences(next);
                  }}
                  style={{
                    width: 56,
                    height: 40,
                    border: `1px solid ${palette.border}`,
                    borderRadius: 10,
                    background: "transparent",
                    padding: 4,
                    cursor: "pointer",
                  }}
                />
                <input
                  type="text"
                  value={preferences.sceneBackground}
                  onChange={(e) => {
                    const next = updateAppPreferences({
                      sceneBackground: e.target.value,
                    });
                    applyPreferences(next);
                  }}
                  style={{
                    width: 120,
                    height: 40,
                    borderRadius: 10,
                    border: `1px solid ${palette.border}`,
                    background: palette.strongBackground,
                    color: palette.textColor,
                    padding: "0 12px",
                    boxSizing: "border-box",
                    outline: "none",
                  }}
                />
              </div>
            </SectionCard>

            <SectionCard title="Reset settings" subtitle="Restore UI preferences to their default values." palette={palette}>
              <ActionButton
                label="Reset settings to default"
                palette={palette}
                onClick={() => {
                  const next = resetAppPreferences();
                  applyPreferences(next);
                }}
              />
            </SectionCard>
          </div>
        )}

        <ConfirmDialog
          dialog={confirmDialog}
          palette={palette}
          onCancel={() => setConfirmDialog(null)}
        />
      </div>
    </div>
  );
}
