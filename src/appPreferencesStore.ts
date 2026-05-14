export type AppThemeId = "dark" | "gray" | "light";
export type CursorStyleId = "default" | "high-contrast" | "crosshair";
export type ReleaseUpdateMode = "manual" | "notify" | "auto-latest";

export type AppPreferences = {
    schemaVersion: 2;
    theme: AppThemeId;
    cursorStyle: CursorStyleId;
    sceneBackground: string;
    historyLimit: number;
    keepAssistantModel: boolean;
    hiddenDataAutoUnloadMinutes: number | null;
    releaseUpdateMode: ReleaseUpdateMode;
    lastSeenReleaseCommitSha: string | null;
};

export const APP_PREFERENCES_STORAGE_KEY = "mouse_brain_viewer.app_preferences";

const DEFAULT_PREFERENCES: AppPreferences = {
    schemaVersion: 2,
    theme: "dark",
    cursorStyle: "default",
    sceneBackground: "#0b0f14",
    historyLimit: 80,
    keepAssistantModel: true,
    hiddenDataAutoUnloadMinutes: null,
    releaseUpdateMode: "notify",
    lastSeenReleaseCommitSha: null,
};

function clampHistoryLimit(value: number) {
    if (!Number.isFinite(value)) return DEFAULT_PREFERENCES.historyLimit;
    return Math.max(5, Math.min(500, Math.round(value)));
}

function clampHiddenDataAutoUnloadMinutes(value: number | null | undefined) {
    if (value == null) return null;
    if (!Number.isFinite(value)) return DEFAULT_PREFERENCES.hiddenDataAutoUnloadMinutes;
    return Math.max(1, Math.min(240, Math.round(value)));
}

function normalizePreferences(value: unknown): AppPreferences {
    if (!value || typeof value !== "object") {
        return DEFAULT_PREFERENCES;
    }

    const raw = value as Partial<AppPreferences>;

    return {
        schemaVersion: 2,
        theme:
            raw.theme === "dark" || raw.theme === "gray" || raw.theme === "light"
                ? raw.theme
                : DEFAULT_PREFERENCES.theme,
        cursorStyle:
            raw.cursorStyle === "default" ||
                raw.cursorStyle === "high-contrast" ||
                raw.cursorStyle === "crosshair"
                ? raw.cursorStyle
                : DEFAULT_PREFERENCES.cursorStyle,
        sceneBackground:
            typeof raw.sceneBackground === "string" && raw.sceneBackground.trim()
                ? raw.sceneBackground
                : DEFAULT_PREFERENCES.sceneBackground,
        historyLimit: clampHistoryLimit(raw.historyLimit ?? DEFAULT_PREFERENCES.historyLimit),
        keepAssistantModel:
            typeof raw.keepAssistantModel === "boolean"
                ? raw.keepAssistantModel
                : DEFAULT_PREFERENCES.keepAssistantModel,
        hiddenDataAutoUnloadMinutes: clampHiddenDataAutoUnloadMinutes(
            raw.hiddenDataAutoUnloadMinutes ?? DEFAULT_PREFERENCES.hiddenDataAutoUnloadMinutes
        ),
        releaseUpdateMode:
            raw.releaseUpdateMode === "manual" ||
            raw.releaseUpdateMode === "notify" ||
            raw.releaseUpdateMode === "auto-latest"
                ? raw.releaseUpdateMode
                : DEFAULT_PREFERENCES.releaseUpdateMode,
        lastSeenReleaseCommitSha:
            typeof raw.lastSeenReleaseCommitSha === "string" && raw.lastSeenReleaseCommitSha.trim()
                ? raw.lastSeenReleaseCommitSha.trim()
                : DEFAULT_PREFERENCES.lastSeenReleaseCommitSha,
    };
}

export function loadAppPreferences(): AppPreferences {
    if (typeof window === "undefined") return DEFAULT_PREFERENCES;

    try {
        const raw = window.localStorage.getItem(APP_PREFERENCES_STORAGE_KEY);
        if (!raw) {
            saveAppPreferences(DEFAULT_PREFERENCES);
            return DEFAULT_PREFERENCES;
        }

        const parsed = JSON.parse(raw);
        const normalized = normalizePreferences(parsed);
        saveAppPreferences(normalized);
        return normalized;
    } catch {
        saveAppPreferences(DEFAULT_PREFERENCES);
        return DEFAULT_PREFERENCES;
    }
}

export function saveAppPreferences(preferences: AppPreferences) {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(APP_PREFERENCES_STORAGE_KEY, JSON.stringify(preferences));
}

export function updateAppPreferences(
    patch: Partial<Omit<AppPreferences, "schemaVersion">>
): AppPreferences {
    const current = loadAppPreferences();
    const next = normalizePreferences({
        ...current,
        ...patch,
    });
    saveAppPreferences(next);
    return next;
}

export function resetAppPreferences(): AppPreferences {
    saveAppPreferences(DEFAULT_PREFERENCES);
    return DEFAULT_PREFERENCES;
}
