import type { CSSProperties } from "react";

export type StatePanelMode = "export" | "import";

type StatePanelProps = {
  mode: StatePanelMode;
  stateTextDraft: string;
  stateError: string | null;
  stateShareMessage: string | null;
  localOnlyLayerNames: string[];
  isSerializable: boolean;
  onStateTextDraftChange: (value: string) => void;
  onOpenExport: () => void;
  onOpenImport: () => void;
  onShareViewerState: () => void | Promise<void>;
  onCopyExportState: () => void | Promise<void>;
  onApplyImportedState: () => void;
};

const secondaryButtonStyle: CSSProperties = {
  height: 34,
  padding: "0 12px",
  borderRadius: 10,
  border: "1px solid rgba(255,255,255,0.10)",
  background: "rgba(255,255,255,0.05)",
  color: "inherit",
  cursor: "pointer",
};

const primaryButtonStyle: CSSProperties = {
  height: 34,
  padding: "0 12px",
  borderRadius: 10,
  border: "1px solid rgba(160,220,255,0.35)",
  background: "rgba(120,190,255,0.18)",
  color: "inherit",
  cursor: "pointer",
  fontWeight: 600,
};

export default function StatePanel({
  mode,
  stateTextDraft,
  stateError,
  stateShareMessage,
  localOnlyLayerNames,
  isSerializable,
  onStateTextDraftChange,
  onOpenExport,
  onOpenImport,
  onShareViewerState,
  onCopyExportState,
  onApplyImportedState,
}: StatePanelProps) {
  const showLocalOnlyWarning = mode === "export" && localOnlyLayerNames.length > 0;
  const showSerializationWarning = mode === "export" && !isSerializable;

  return (
    <div data-slice-tool="true" style={{ fontFamily: "sans-serif", color: "inherit" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 12,
          gap: 12,
        }}
      >
        <div>
          <div style={{ fontSize: 15, fontWeight: 700 }}>
            {mode === "export" ? "Export Viewer State" : "Import Viewer State"}
          </div>
          <div data-theme-text="muted" style={{ fontSize: 12, marginTop: 4 }}>
            Copy this state to reproduce the current viewer, or paste one to restore it.
          </div>
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          <button type="button" onClick={onOpenExport} style={secondaryButtonStyle}>
            Export
          </button>
          <button type="button" onClick={onOpenImport} style={secondaryButtonStyle}>
            Import
          </button>
        </div>
      </div>

      {showLocalOnlyWarning ? (
        <div
          style={{
            marginBottom: 12,
            borderRadius: 12,
            border: "1px solid rgba(255,180,120,0.35)",
            background: "rgba(255,180,120,0.10)",
            padding: 12,
            fontSize: 12,
            lineHeight: 1.5,
          }}
        >
          <div style={{ fontWeight: 700, marginBottom: 6 }}>Some layers cannot be shared</div>
          <div>
            This viewer uses {localOnlyLayerNames.length} personal browser-hosted layer{localOnlyLayerNames.length === 1 ? "" : "s"}. Other people will not receive these layers from a share link.
          </div>
          <div style={{ marginTop: 8 }}>
            <strong>Unavailable in shared view:</strong>
          </div>
          <div style={{ marginTop: 6, display: "flex", flexWrap: "wrap", gap: 6 }}>
            {localOnlyLayerNames.map((layerName) => (
              <span
                key={layerName}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  minHeight: 24,
                  padding: "0 8px",
                  borderRadius: 999,
                  border: "1px solid rgba(255,200,150,0.30)",
                  background: "rgba(255,255,255,0.06)",
                  fontSize: 11,
                  fontWeight: 600,
                }}
              >
                {layerName}
              </span>
            ))}
          </div>
        </div>
      ) : null}

      {showSerializationWarning ? (
        <div
          style={{
            marginBottom: 12,
            borderRadius: 12,
            border: "1px solid rgba(255,140,140,0.28)",
            background: "rgba(255,140,140,0.10)",
            padding: 12,
            fontSize: 12,
            lineHeight: 1.5,
          }}
        >
          This viewer contains layers that cannot be turned into a share link. Use the JSON export instead.
        </div>
      ) : null}

      <textarea
        value={stateTextDraft}
        onChange={(event) => onStateTextDraftChange(event.target.value)}
        readOnly={mode === "export"}
        placeholder={mode === "import" ? "Paste a viewer state JSON here..." : ""}
        spellCheck={false}
        style={{
          width: "100%",
          minHeight: 260,
          resize: "vertical",
          borderRadius: 12,
          border: "1px solid rgba(255,255,255,0.12)",
          background: "rgba(255,255,255,0.05)",
          color: "inherit",
          padding: 12,
          boxSizing: "border-box",
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
          fontSize: 12,
          lineHeight: 1.45,
          outline: "none",
        }}
      />

      {stateError ? (
        <div
          style={{
            marginTop: 10,
            fontSize: 12,
            color: "#ffb4b4",
            lineHeight: 1.4,
          }}
        >
          {stateError}
        </div>
      ) : null}

      {!stateError && stateShareMessage ? (
        <div
          style={{
            marginTop: 10,
            fontSize: 12,
            color: "rgba(170,230,190,0.95)",
            lineHeight: 1.4,
          }}
        >
          {stateShareMessage}
        </div>
      ) : null}

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginTop: 12,
          gap: 10,
        }}
      >
        <div data-theme-text="muted" style={{ fontSize: 12 }}>
          Undo/redo snapshots are saved after actions settle and restored from browser storage.
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          {mode === "export" ? (
            <>
              <button type="button" onClick={() => void onShareViewerState()} style={secondaryButtonStyle}>
                Share Link
              </button>
              <button type="button" onClick={() => void onCopyExportState()} style={primaryButtonStyle}>
                Copy JSON
              </button>
            </>
          ) : null}

          {mode === "import" ? (
            <button type="button" onClick={onApplyImportedState} style={primaryButtonStyle}>
              Load State
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
