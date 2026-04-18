import { useEffect, useMemo, useState } from "react";
import {
  SHORTCUT_DEFINITIONS,
  formatShortcutCombo,
  keyboardEventToShortcutCombo,
  mouseEventToShortcutCombo,
  type ShortcutBindingMap,
  type ShortcutCommandId,
} from "./shortcutStore";

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

type ShortcutCaptureState = ShortcutCommandId | null;

const SHORTCUT_GROUP_LABELS: Record<string, string> = {
  viewer: "Viewer",
  tools: "Navigation & tools",
  annotation: "Annotation",
  history: "History",
};

function ShortcutKeyboardIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="6" width="18" height="12" rx="2.5" />
      <path d="M7 10h.01" />
      <path d="M11 10h.01" />
      <path d="M15 10h.01" />
      <path d="M7 14h10" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 6L6 18" />
      <path d="M6 6l12 12" />
    </svg>
  );
}

function ActionButton({
  label,
  onClick,
  palette,
}: {
  label: string;
  onClick: () => void;
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
        border: `1px solid ${palette.border}`,
        background: palette.strongBackground,
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

function ShortcutBindingRow({
  label,
  description,
  binding,
  isCapturing,
  palette,
  onStartCapture,
  onClear,
  onReset,
}: {
  label: string;
  description: string;
  binding: string | null | undefined;
  isCapturing: boolean;
  palette: ThemePalette;
  onStartCapture: () => void;
  onClear: () => void;
  onReset: () => void;
}) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "minmax(0, 1fr) auto",
        gap: 10,
        alignItems: "center",
        padding: 12,
        borderRadius: 12,
        border: `1px solid ${palette.border}`,
        background: palette.strongBackground,
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: palette.titleColor }}>{label}</div>
        <div style={{ fontSize: 12, color: palette.mutedText, marginTop: 4, lineHeight: 1.4 }}>{description}</div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
        <button
          type="button"
          onClick={onStartCapture}
          style={{
            minWidth: 124,
            height: 34,
            padding: "0 12px",
            borderRadius: 10,
            border: isCapturing ? "1px solid rgba(160,220,255,0.68)" : `1px solid ${palette.border}`,
            background: isCapturing ? "rgba(120,190,255,0.16)" : palette.subtleBackground,
            color: palette.textColor,
            cursor: "pointer",
            fontSize: 12,
            fontWeight: 700,
          }}
        >
          {isCapturing ? "Press a shortcut…" : formatShortcutCombo(binding)}
        </button>
        <button
          type="button"
          onClick={onClear}
          style={{
            height: 34,
            padding: "0 10px",
            borderRadius: 10,
            border: `1px solid ${palette.border}`,
            background: "transparent",
            color: palette.mutedText,
            cursor: "pointer",
            fontSize: 12,
            fontWeight: 700,
          }}
        >
          Clear
        </button>
        <button
          type="button"
          onClick={onReset}
          style={{
            height: 34,
            padding: "0 10px",
            borderRadius: 10,
            border: `1px solid ${palette.border}`,
            background: "transparent",
            color: palette.mutedText,
            cursor: "pointer",
            fontSize: 12,
            fontWeight: 700,
          }}
        >
          Reset
        </button>
      </div>
    </div>
  );
}

export default function ShortcutPanel({
  open,
  palette,
  shortcutBindings,
  onClose,
  onShortcutBindingChange,
  onResetShortcutBinding,
  onResetAllShortcuts,
}: {
  open: boolean;
  palette: ThemePalette;
  shortcutBindings: ShortcutBindingMap;
  onClose: () => void;
  onShortcutBindingChange?: (commandId: ShortcutCommandId, combo: string | null) => void;
  onResetShortcutBinding?: (commandId: ShortcutCommandId) => void;
  onResetAllShortcuts?: () => void;
}) {
  const [capturingShortcut, setCapturingShortcut] = useState<ShortcutCaptureState>(null);

  const shortcutDefinitionsByGroup = useMemo(() => {
    return SHORTCUT_DEFINITIONS.reduce<Record<string, typeof SHORTCUT_DEFINITIONS>>((groups, definition) => {
      groups[definition.group] ||= [];
      groups[definition.group].push(definition);
      return groups;
    }, {});
  }, []);

  useEffect(() => {
    if (!open) {
      setCapturingShortcut(null);
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !capturingShortcut) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation?.();
        onClose();
        return;
      }
      if (!capturingShortcut) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation?.();
      if (event.key === "Escape") {
        setCapturingShortcut(null);
        return;
      }
      const combo = keyboardEventToShortcutCombo(event);
      if (!combo) return;
      onShortcutBindingChange?.(capturingShortcut, combo);
      setCapturingShortcut(null);
    }

    function handleMouseDown(event: MouseEvent) {
      if (!capturingShortcut) return;
      const combo = mouseEventToShortcutCombo(event);
      if (!combo) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation?.();
      onShortcutBindingChange?.(capturingShortcut, combo);
      setCapturingShortcut(null);
    }

    window.addEventListener("keydown", handleKeyDown, true);
    window.addEventListener("mousedown", handleMouseDown, true);
    return () => {
      window.removeEventListener("keydown", handleKeyDown, true);
      window.removeEventListener("mousedown", handleMouseDown, true);
    };
  }, [open, capturingShortcut, onClose, onShortcutBindingChange]);

  if (!open) return null;

  return (
    <div
      onClick={() => {
        setCapturingShortcut(null);
        onClose();
      }}
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 90,
        background: palette.overlayBackground,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
    >
      <div
        onClick={(event) => event.stopPropagation()}
        data-theme-surface="panel"
        style={{
          width: "min(920px, calc(100vw - 40px))",
          maxHeight: "min(82vh, 860px)",
          borderRadius: 20,
          border: `1px solid ${palette.border}`,
          background: palette.panelBackground,
          boxShadow: "0 24px 60px rgba(0,0,0,0.45)",
          backdropFilter: "blur(14px)",
          color: palette.textColor,
          fontFamily: "sans-serif",
          display: "grid",
          gridTemplateRows: "auto minmax(0,1fr)",
          overflow: "hidden",
        }}
      >
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, padding: 18, borderBottom: `1px solid ${palette.border}` }}>
          <div style={{ display: "flex", gap: 12, minWidth: 0 }}>
            <div style={{ marginTop: 2, color: palette.textColor }}><ShortcutKeyboardIcon /></div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 18, fontWeight: 800, color: palette.titleColor }}>Keyboard & mouse shortcuts</div>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <ActionButton label="Reset all" onClick={() => onResetAllShortcuts?.()} palette={palette} />
            <button
              type="button"
              onClick={() => {
                setCapturingShortcut(null);
                onClose();
              }}
              style={{
                width: 36,
                height: 36,
                borderRadius: 12,
                border: `1px solid ${palette.border}`,
                background: palette.subtleBackground,
                color: palette.textColor,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <CloseIcon />
            </button>
          </div>
        </div>

        <div className="layer-panel-scroll" style={{ padding: 18, overflowY: "auto" }}>
          <div
            style={{
              display: "flex",
              gap: 10,
              alignItems: "flex-start",
              padding: 12,
              borderRadius: 12,
              border: `1px solid ${palette.border}`,
              background: palette.strongBackground,
              marginBottom: 16,
            }}
          >
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: palette.titleColor }}>How rebinding works</div>
              <div style={{ fontSize: 12, color: palette.mutedText, marginTop: 4, lineHeight: 1.45 }}>
                Duplicate bindings are resolved automatically. Assigning a shortcut to one action removes it from any previous action.
              </div>
            </div>
          </div>

          <div style={{ display: "grid", gap: 18 }}>
            {(["viewer", "tools", "annotation", "history"] as const).map((groupId) => {
              const definitions = shortcutDefinitionsByGroup[groupId] ?? [];
              if (!definitions.length) return null;
              return (
                <div key={groupId} style={{ display: "grid", gap: 8 }}>
                  <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 0.45, textTransform: "uppercase", color: palette.mutedText }}>
                    {SHORTCUT_GROUP_LABELS[groupId]}
                  </div>
                  <div style={{ display: "grid", gap: 8 }}>
                    {definitions.map((definition) => (
                      <ShortcutBindingRow
                        key={definition.id}
                        label={definition.label}
                        description={definition.description}
                        binding={shortcutBindings[definition.id]}
                        isCapturing={capturingShortcut === definition.id}
                        palette={palette}
                        onStartCapture={() => setCapturingShortcut(definition.id)}
                        onClear={() => onShortcutBindingChange?.(definition.id, null)}
                        onReset={() => onResetShortcutBinding?.(definition.id)}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
