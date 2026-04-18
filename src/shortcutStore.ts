export type ShortcutCommandId =
    | "saveViewer"
    | "newViewer"
    | "openLibrary"
    | "openShareDialog"
    | "toolMove"
    | "toolDraw"
    | "toolSlice"
    | "cameraFly"
    | "cameraOrbit"
    | "annotationPoint"
    | "annotationLine"
    | "annotationRectangle"
    | "annotationCircle"
    | "annotationFreehand"
    | "annotationEraser"
    | "recenterOrbit"
    | "undo"
    | "redo";

export type ShortcutBindingMap = Record<ShortcutCommandId, string | null>;

export type ShortcutDefinition = {
    id: ShortcutCommandId;
    label: string;
    description: string;
    group: "viewer" | "tools" | "annotation" | "history";
    defaultBinding: string | null;
};

export const SHORTCUT_DEFINITIONS: ShortcutDefinition[] = [
    { id: "saveViewer", label: "Save viewer", description: "Save the current viewer to the local library.", group: "viewer", defaultBinding: "Ctrl+S" },
    { id: "newViewer", label: "New empty viewer", description: "Start from a clean viewer.", group: "viewer", defaultBinding: "Ctrl+Alt+N" },
    { id: "openLibrary", label: "Open library", description: "Open the saved viewer library.", group: "viewer", defaultBinding: "L" },
    { id: "openShareDialog", label: "Open share dialog", description: "Open the share link dialog.", group: "viewer", defaultBinding: "Ctrl+Shift+S" },
    { id: "toolMove", label: "Move tool", description: "Switch to move / navigation mode.", group: "tools", defaultBinding: "V" },
    { id: "toolDraw", label: "Draw tool", description: "Switch to the annotation tool.", group: "tools", defaultBinding: "R" },
    { id: "toolSlice", label: "Slice tool", description: "Open the slice tool.", group: "tools", defaultBinding: "C" },
    { id: "cameraFly", label: "Fly camera", description: "Set the move tool to fly camera mode.", group: "tools", defaultBinding: "1" },
    { id: "cameraOrbit", label: "Orbit camera", description: "Set the move tool to orbit camera mode.", group: "tools", defaultBinding: "2" },
    { id: "recenterOrbit", label: "Recenter orbit", description: "Move the orbit center back to the scene center.", group: "tools", defaultBinding: "F" },
    { id: "annotationPoint", label: "Point annotation", description: "Use point annotations.", group: "annotation", defaultBinding: "3" },
    { id: "annotationLine", label: "Line annotation", description: "Use line annotations.", group: "annotation", defaultBinding: "4" },
    { id: "annotationRectangle", label: "Rectangle annotation", description: "Use rectangle annotations.", group: "annotation", defaultBinding: "5" },
    { id: "annotationCircle", label: "Circle annotation", description: "Use circle annotations.", group: "annotation", defaultBinding: "6" },
    { id: "annotationFreehand", label: "Freehand annotation", description: "Use freehand drawing.", group: "annotation", defaultBinding: "B" },
    { id: "annotationEraser", label: "Eraser", description: "Use the annotation eraser.", group: "annotation", defaultBinding: null },
    { id: "undo", label: "Undo", description: "Undo the last committed viewer action.", group: "history", defaultBinding: "Ctrl+Z" },
    { id: "redo", label: "Redo", description: "Redo the next viewer action.", group: "history", defaultBinding: "Ctrl+Y" },
];

export const DEFAULT_SHORTCUT_BINDINGS: ShortcutBindingMap = SHORTCUT_DEFINITIONS.reduce(
    (acc, definition) => {
        acc[definition.id] = definition.defaultBinding;
        return acc;
    },
    {} as ShortcutBindingMap
);

const STORAGE_KEY = "allen-viewer-shortcuts-v1";

function normalizeKeyName(key: string): string | null {
    if (!key) return null;
    if (key === " ") return "Space";
    const raw = key.trim();
    if (!raw) return null;
    const lower = raw.toLowerCase();
    if (["control", "ctrl"].includes(lower)) return null;
    if (lower === "alt") return null;
    if (lower === "shift") return null;
    if (lower === "meta") return null;
    if (lower === " ") return "Space";
    if (lower === "escape") return "Escape";
    if (lower === "enter") return "Enter";
    if (lower === "tab") return "Tab";
    if (lower === "backspace") return "Backspace";
    if (lower === "delete") return "Delete";
    if (lower === "arrowup") return "ArrowUp";
    if (lower === "arrowdown") return "ArrowDown";
    if (lower === "arrowleft") return "ArrowLeft";
    if (lower === "arrowright") return "ArrowRight";
    if (lower === "pageup") return "PageUp";
    if (lower === "pagedown") return "PageDown";
    if (lower === "home") return "Home";
    if (lower === "end") return "End";
    if (/^f\d{1,2}$/i.test(raw)) return raw.toUpperCase();
    if (raw.length === 1) return raw.toUpperCase();
    return raw.charAt(0).toUpperCase() + raw.slice(1);
}

export function normalizeShortcutCombo(combo: string | null | undefined): string | null {
    if (!combo) return null;
    const parts = combo
        .split("+")
        .map((part) => part.trim())
        .filter(Boolean);
    if (!parts.length) return null;

    let ctrl = false;
    let alt = false;
    let shift = false;
    let meta = false;
    let key: string | null = null;

    for (const part of parts) {
        const lower = part.toLowerCase();
        if (lower === "ctrl" || lower === "control") {
            ctrl = true;
            continue;
        }
        if (lower === "alt" || lower === "option") {
            alt = true;
            continue;
        }
        if (lower === "shift") {
            shift = true;
            continue;
        }
        if (lower === "meta" || lower === "cmd" || lower === "command") {
            meta = true;
            continue;
        }
        const normalizedKey = normalizeKeyName(part);
        if (normalizedKey) key = normalizedKey;
    }

    if (!key) return null;
    const normalizedParts: string[] = [];
    if (ctrl) normalizedParts.push("Ctrl");
    if (alt) normalizedParts.push("Alt");
    if (shift) normalizedParts.push("Shift");
    if (meta) normalizedParts.push("Meta");
    normalizedParts.push(key);
    return normalizedParts.join("+");
}

export function loadShortcutBindings(): ShortcutBindingMap {
    if (typeof window === "undefined") return { ...DEFAULT_SHORTCUT_BINDINGS };
    try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (!raw) return { ...DEFAULT_SHORTCUT_BINDINGS };
        const parsed = JSON.parse(raw) as Partial<Record<ShortcutCommandId, string | null>>;
        const next = { ...DEFAULT_SHORTCUT_BINDINGS };
        for (const definition of SHORTCUT_DEFINITIONS) {
            next[definition.id] = normalizeShortcutCombo(parsed[definition.id]) ?? null;
        }
        return next;
    } catch {
        return { ...DEFAULT_SHORTCUT_BINDINGS };
    }
}

export function saveShortcutBindings(bindings: ShortcutBindingMap) {
    if (typeof window === "undefined") return;
    try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(bindings));
    } catch { }
}

export function resetShortcutBindings(): ShortcutBindingMap {
    const next = { ...DEFAULT_SHORTCUT_BINDINGS };
    saveShortcutBindings(next);
    return next;
}

export function resetSingleShortcutBinding(commandId: ShortcutCommandId, bindings: ShortcutBindingMap): ShortcutBindingMap {
    const next = { ...bindings, [commandId]: DEFAULT_SHORTCUT_BINDINGS[commandId] };
    saveShortcutBindings(next);
    return next;
}

export function keyboardEventToShortcutCombo(event: KeyboardEvent): string | null {
    const key = normalizeKeyName(event.key);
    if (!key) return null;
    const parts: string[] = [];
    if (event.ctrlKey) parts.push("Ctrl");
    if (event.altKey) parts.push("Alt");
    if (event.shiftKey) parts.push("Shift");
    if (event.metaKey) parts.push("Meta");
    parts.push(key);
    return normalizeShortcutCombo(parts.join("+"));
}

export function mouseEventToShortcutCombo(event: MouseEvent): string | null {
    const key = event.button === 1 ? "MouseMiddle" : event.button === 3 ? "MouseBack" : event.button === 4 ? "MouseForward" : null;
    if (!key) return null;
    const parts: string[] = [];
    if (event.ctrlKey) parts.push("Ctrl");
    if (event.altKey) parts.push("Alt");
    if (event.shiftKey) parts.push("Shift");
    if (event.metaKey) parts.push("Meta");
    parts.push(key);
    return normalizeShortcutCombo(parts.join("+"));
}

export function formatShortcutCombo(combo: string | null | undefined): string {
    const normalized = normalizeShortcutCombo(combo);
    if (!normalized) return "Unassigned";
    return normalized
        .replace(/Ctrl/g, "Ctrl")
        .replace(/Alt/g, "Alt")
        .replace(/Shift/g, "Shift")
        .replace(/Meta/g, "Cmd")
        .replace(/MouseMiddle/g, "Middle Click")
        .replace(/MouseBack/g, "Mouse Back")
        .replace(/MouseForward/g, "Mouse Forward")
        .replace(/Arrow/g, "Arrow ");
}

export function doesShortcutMatchKeyboardEvent(event: KeyboardEvent, combo: string | null | undefined): boolean {
    const normalized = normalizeShortcutCombo(combo);
    if (!normalized) return false;
    return keyboardEventToShortcutCombo(event) === normalized;
}

export function doesShortcutMatchMouseEvent(event: MouseEvent, combo: string | null | undefined): boolean {
    const normalized = normalizeShortcutCombo(combo);
    if (!normalized) return false;
    return mouseEventToShortcutCombo(event) === normalized;
}

export function updateShortcutBindingUnique(bindings: ShortcutBindingMap, commandId: ShortcutCommandId, combo: string | null): ShortcutBindingMap {
    const normalized = normalizeShortcutCombo(combo);
    const next = { ...bindings };
    if (normalized) {
        for (const definition of SHORTCUT_DEFINITIONS) {
            if (definition.id !== commandId && next[definition.id] === normalized) {
                next[definition.id] = null;
            }
        }
    }
    next[commandId] = normalized;
    saveShortcutBindings(next);
    return next;
}
