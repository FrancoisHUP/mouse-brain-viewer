import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import type {
  ViewerCommandDownload,
  ViewerCommandExecutionResult,
  ViewerCommandRunOptions,
  ViewerCommandShellFile,
  ViewerCommandSummary,
} from "./viewerCommands";

type CommandConsoleLogEntry = {
  id: string;
  line: string;
  commandId: string;
  payload: unknown;
  result?: unknown;
  outputText?: string;
  error?: string;
  downloads?: ViewerCommandDownload[];
  startedAt: number;
};

type CommandConsoleSession = {
  id: string;
  title: string;
  draft: string;
  entries: CommandConsoleLogEntry[];
  history: string[];
  historyIndex: number | null;
  running: boolean;
  artifacts: Record<string, ViewerCommandShellFile>;
  variables: Record<string, string>;
};

type Props = {
  open: boolean;
  height: number;
  commands: ViewerCommandSummary[];
  onHeightChange: (height: number) => void;
  onClose: () => void;
  onRunCommandLine: (
    line: string,
    options?: ViewerCommandRunOptions
  ) => ViewerCommandExecutionResult | Promise<ViewerCommandExecutionResult>;
};

const COMMAND_CONSOLE_WINDOW_STORAGE_KEY = "viewer.commandConsole.detachedWindow.v1";

type DetachedFrame = {
  x: number;
  y: number;
  width: number;
  height: number;
};

function loadDetachedWindowState(): {
  detached: boolean;
  frame: DetachedFrame;
} {
  const fallback = {
    detached: false,
    frame: {
      x: 72,
      y: 84,
      width: 880,
      height: 520,
    },
  };

  if (typeof window === "undefined") {
    return fallback;
  }

  try {
    const raw = window.localStorage.getItem(COMMAND_CONSOLE_WINDOW_STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<{
      detached: boolean;
      frame: Partial<DetachedFrame>;
    }>;
    return {
      detached: parsed.detached === true,
      frame: {
        x: typeof parsed.frame?.x === "number" ? parsed.frame.x : fallback.frame.x,
        y: typeof parsed.frame?.y === "number" ? parsed.frame.y : fallback.frame.y,
        width:
          typeof parsed.frame?.width === "number"
            ? parsed.frame.width
            : fallback.frame.width,
        height:
          typeof parsed.frame?.height === "number"
            ? parsed.frame.height
            : fallback.frame.height,
      },
    };
  } catch {
    return fallback;
  }
}

function ResizeGripIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M9 19 19 9" />
      <path d="M14 19 19 14" />
      <path d="M18 19 19 18" />
    </svg>
  );
}

function createSession(index: number): CommandConsoleSession {
  return {
    id: `shell-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    title: `shell ${index}`,
    draft: "",
    entries: [],
    history: [],
    historyIndex: null,
    running: false,
    artifacts: {},
    variables: {},
  };
}

function createLogEntry(line: string): CommandConsoleLogEntry {
  const startedAt = Date.now();
  return {
    id: `command-${startedAt}-${Math.random().toString(36).slice(2, 8)}`,
    line,
    commandId: line.split(/\s+/, 1)[0] ?? line,
    payload: undefined,
    startedAt,
  };
}

function formatOutput(value: unknown): string {
  if (typeof value === "undefined") return "";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function buildEntryOutput(execution: ViewerCommandExecutionResult): string {
  if (execution.downloads?.length) {
    return execution.downloads
      .map((download) =>
        `${download.append ? "append ready" : "download ready"} -> ${download.filename}`
      )
      .join("\n");
  }
  if (typeof execution.stdout === "string") {
    return execution.stdout;
  }
  return formatOutput(execution.result);
}

function triggerDownload(download: ViewerCommandDownload) {
  const blob = new Blob([download.content], { type: download.mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = download.filename;
  link.target = "_blank";
  link.rel = "noopener";
  document.body.appendChild(link);
  window.requestAnimationFrame(() => {
    link.click();
    document.body.removeChild(link);
  });
  window.setTimeout(() => URL.revokeObjectURL(url), 30000);
}

function extractBackgroundCommand(line: string): { line: string; background: boolean } {
  const trimmed = line.trimEnd();
  if (!trimmed.endsWith("&") || trimmed.endsWith("&&")) {
    return { line: trimmed, background: false };
  }

  let quote: '"' | "'" | null = null;
  let escapeNext = false;
  let braceDepth = 0;
  let bracketDepth = 0;
  let parenDepth = 0;

  for (let index = 0; index < trimmed.length; index += 1) {
    const character = trimmed[index];

    if (quote) {
      if (escapeNext) {
        escapeNext = false;
        continue;
      }
      if (character === "\\") {
        escapeNext = true;
        continue;
      }
      if (character === quote) {
        quote = null;
      }
      continue;
    }

    if (character === '"' || character === "'") {
      quote = character;
      continue;
    }

    if (character === "{") braceDepth += 1;
    else if (character === "}") braceDepth = Math.max(0, braceDepth - 1);
    else if (character === "[") bracketDepth += 1;
    else if (character === "]") bracketDepth = Math.max(0, bracketDepth - 1);
    else if (character === "(") parenDepth += 1;
    else if (character === ")") parenDepth = Math.max(0, parenDepth - 1);
  }

  if (quote || braceDepth || bracketDepth || parenDepth) {
    return { line: trimmed, background: false };
  }

  return {
    line: trimmed.slice(0, -1).trimEnd(),
    background: true,
  };
}

function TerminalIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M4 17l5-5-5-5" />
      <path d="M12 19h8" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </svg>
  );
}

function ExtractIcon({ detached }: { detached: boolean }) {
  return detached ? (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M8 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
      <path d="M10 14 20 4" />
      <path d="M14 4h6v6" />
    </svg>
  ) : (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M14 4h6v6" />
      <path d="M10 14 20 4" />
      <path d="M20 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h4" />
    </svg>
  );
}

function BookIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5V4.5A2.5 2.5 0 0 1 6.5 2z" />
    </svg>
  );
}

function applySuggestionToDraft(draft: string, commandId: string) {
  const commandMatch = /(^|(?:\|\||&&|[;|&])\s*)([^\s;|&]*)$/.exec(draft);
  if (!commandMatch) {
    return `${draft}${draft.endsWith(" ") ? "" : " "}${commandId} `;
  }

  const prefix = draft.slice(0, commandMatch.index) + commandMatch[1];
  return `${prefix}${commandId} `;
}

function getCurrentCommandFragment(draft: string): string {
  const match = /(?:^|(?:\|\||&&|[;|&])\s*)([^\s;|&]*)$/.exec(draft);
  return match?.[1] ?? "";
}

export default function CommandConsolePanel({
  open,
  height,
  commands,
  onHeightChange,
  onClose,
  onRunCommandLine,
}: Props) {
  const initialDetachedWindowState = useMemo(() => loadDetachedWindowState(), []);
  const [sessions, setSessions] = useState<CommandConsoleSession[]>(() => [
    createSession(1),
  ]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [commandListOpen, setCommandListOpen] = useState(false);
  const [commandFilter, setCommandFilter] = useState("");
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(0);
  const [detached, setDetached] = useState(initialDetachedWindowState.detached);
  const [detachedFrame, setDetachedFrame] = useState(initialDetachedWindowState.frame);
  const dragStateRef = useRef<{
    pointerId: number;
    startY: number;
    startHeight: number;
  } | null>(null);
  const detachedDragStateRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    initialX: number;
    initialY: number;
  } | null>(null);
  const detachedResizeStateRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    initialWidth: number;
    initialHeight: number;
  } | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const commandListInputRef = useRef<HTMLInputElement | null>(null);
  const logEndRef = useRef<HTMLDivElement | null>(null);
  const foregroundRunTokenRef = useRef<Record<string, number>>({});
  const foregroundEntryIdRef = useRef<Record<string, string | null>>({});

  const activeSession =
    sessions.find((session) => session.id === activeSessionId) ?? sessions[0] ?? null;

  useEffect(() => {
    if (!activeSessionId && sessions[0]) {
      setActiveSessionId(sessions[0].id);
    }
  }, [activeSessionId, sessions]);

  useEffect(() => {
    if (!open) return;
    window.setTimeout(() => {
      if (commandListOpen) {
        commandListInputRef.current?.focus();
        return;
      }
      inputRef.current?.focus();
    }, 0);
  }, [commandListOpen, open, activeSessionId]);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ block: "end" });
  }, [activeSession?.entries.length, activeSession?.running, activeSessionId]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(
      COMMAND_CONSOLE_WINDOW_STORAGE_KEY,
      JSON.stringify({
        detached,
        frame: detachedFrame,
      })
    );
  }, [detached, detachedFrame]);

  const commandMatches = useMemo(() => {
    const normalized = commandFilter.trim().toLowerCase();
    if (!normalized) return commands;
    return commands.filter((command) => {
      const haystack = [
        command.id,
        command.title,
        command.description,
        command.usage,
        ...command.examples,
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(normalized);
    });
  }, [commandFilter, commands]);

  const inlineSuggestions = useMemo(() => {
    const draft = getCurrentCommandFragment(activeSession?.draft ?? "");
    const normalized = draft.trim().toLowerCase();
    if (!normalized) return [];
    const matches = commands.filter((command) =>
      command.id.toLowerCase().startsWith(normalized)
    );
    if (matches.length === 1 && matches[0]?.id === draft.trim()) {
      return [];
    }
    return matches.slice(0, 8);
  }, [activeSession?.draft, commands]);

  useEffect(() => {
    setSelectedSuggestionIndex((current) => {
      if (inlineSuggestions.length === 0) return 0;
      return Math.min(current, inlineSuggestions.length - 1);
    });
  }, [inlineSuggestions.length]);

  function clampPanelHeight(nextHeight: number) {
    const maxHeight =
      typeof window === "undefined"
        ? 620
        : Math.max(
            300,
            Math.min(window.innerHeight - 120, Math.round(window.innerHeight * 0.8))
          );
    return Math.max(220, Math.min(maxHeight, Math.round(nextHeight)));
  }

  function clampDetachedFrame(nextFrame: typeof detachedFrame) {
    if (typeof window === "undefined") {
      return nextFrame;
    }
    const minWidth = 560;
    const minHeight = 320;
    const maxWidth = Math.max(minWidth, window.innerWidth - 32);
    const maxHeight = Math.max(minHeight, window.innerHeight - 32);
    const width = Math.max(minWidth, Math.min(maxWidth, Math.round(nextFrame.width)));
    const height = Math.max(minHeight, Math.min(maxHeight, Math.round(nextFrame.height)));
    const x = Math.max(16, Math.min(window.innerWidth - width - 16, Math.round(nextFrame.x)));
    const y = Math.max(16, Math.min(window.innerHeight - height - 16, Math.round(nextFrame.y)));
    return { x, y, width, height };
  }

  function beginResize(event: ReactPointerEvent<HTMLButtonElement>) {
    dragStateRef.current = {
      pointerId: event.pointerId,
      startY: event.clientY,
      startHeight: height,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
  }

  function handleResizeMove(event: ReactPointerEvent<HTMLButtonElement>) {
    const dragState = dragStateRef.current;
    if (!dragState || dragState.pointerId !== event.pointerId) return;
    const nextHeight = dragState.startHeight + (dragState.startY - event.clientY);
    if (nextHeight <= 92) {
      onHeightChange(92);
      return;
    }
    onHeightChange(clampPanelHeight(nextHeight));
  }

  function endResize(event: ReactPointerEvent<HTMLButtonElement>) {
    const dragState = dragStateRef.current;
    if (!dragState || dragState.pointerId !== event.pointerId) return;
    const nextHeight = dragState.startHeight + (dragState.startY - event.clientY);
    dragStateRef.current = null;
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {}
    if (nextHeight <= 92) {
      onClose();
    }
  }

  function beginDetachedDrag(event: ReactPointerEvent<HTMLDivElement>) {
    if (!detached) return;
    detachedDragStateRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      initialX: detachedFrame.x,
      initialY: detachedFrame.y,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
  }

  function handleDetachedDragMove(event: ReactPointerEvent<HTMLDivElement>) {
    const dragState = detachedDragStateRef.current;
    if (!dragState || dragState.pointerId !== event.pointerId) return;
    setDetachedFrame(
      clampDetachedFrame({
        ...detachedFrame,
        x: dragState.initialX + (event.clientX - dragState.startX),
        y: dragState.initialY + (event.clientY - dragState.startY),
      })
    );
  }

  function endDetachedDrag(event: ReactPointerEvent<HTMLDivElement>) {
    const dragState = detachedDragStateRef.current;
    if (!dragState || dragState.pointerId !== event.pointerId) return;
    detachedDragStateRef.current = null;
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {}
  }

  function beginDetachedResize(event: ReactPointerEvent<HTMLButtonElement>) {
    if (!detached) return;
    detachedResizeStateRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      initialWidth: detachedFrame.width,
      initialHeight: detachedFrame.height,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
  }

  function handleDetachedResizeMove(event: ReactPointerEvent<HTMLButtonElement>) {
    const resizeState = detachedResizeStateRef.current;
    if (!resizeState || resizeState.pointerId !== event.pointerId) return;
    setDetachedFrame(
      clampDetachedFrame({
        ...detachedFrame,
        width: resizeState.initialWidth + (event.clientX - resizeState.startX),
        height: resizeState.initialHeight + (event.clientY - resizeState.startY),
      })
    );
  }

  function endDetachedResize(event: ReactPointerEvent<HTMLButtonElement>) {
    const resizeState = detachedResizeStateRef.current;
    if (!resizeState || resizeState.pointerId !== event.pointerId) return;
    detachedResizeStateRef.current = null;
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {}
  }

  function updateSession(
    sessionId: string,
    updater: (session: CommandConsoleSession) => CommandConsoleSession
  ) {
    setSessions((current) =>
      current.map((session) => (session.id === sessionId ? updater(session) : session))
    );
  }

  function createNewSession() {
    const session = createSession(sessions.length + 1);
    setSessions((current) => [...current, session]);
    setActiveSessionId(session.id);
  }

  function closeSession(sessionId: string) {
    setSessions((current) => {
      if (current.length <= 1) return current;
      const index = current.findIndex((session) => session.id === sessionId);
      const next = current.filter((session) => session.id !== sessionId);
      if (activeSessionId === sessionId) {
        const fallback = next[Math.max(0, index - 1)] ?? next[0] ?? null;
        setActiveSessionId(fallback?.id ?? null);
      }
      return next;
    });
  }

  async function runActiveSessionCommand() {
    if (!activeSession) return;
    const enteredText = activeSession.draft.trim();
    const parsed = extractBackgroundCommand(enteredText);
    const trimmed = parsed.line.trim();
    if (!trimmed || activeSession.running) return;

    const sessionId = activeSession.id;
    const entry = createLogEntry(enteredText);
    const runToken = (foregroundRunTokenRef.current[sessionId] ?? 0) + 1;
    const isBackground = parsed.background;

    if (!isBackground) {
      foregroundRunTokenRef.current[sessionId] = runToken;
      foregroundEntryIdRef.current[sessionId] = entry.id;
    }

    updateSession(sessionId, (session) => ({
      ...session,
      draft: "",
      running: isBackground ? session.running : true,
      history:
        session.history[session.history.length - 1] === trimmed
          ? session.history
          : [...session.history, trimmed],
      historyIndex: null,
      entries: [...session.entries, entry].slice(-160),
    }));
    setSelectedSuggestionIndex(0);

    try {
      const execution = await onRunCommandLine(trimmed, {
        files: activeSession.artifacts,
        variables: activeSession.variables,
      });
      if (!isBackground && foregroundRunTokenRef.current[sessionId] !== runToken) {
        return;
      }

      let normalizedDownloads: ViewerCommandDownload[] = [];
      if (execution.downloads?.length) {
        updateSession(sessionId, (session) => {
          const nextArtifacts = { ...session.artifacts };
          normalizedDownloads = execution.downloads?.map((download) => {
            const previous = nextArtifacts[download.filename];
            const nextContent =
              download.append && previous
                ? `${previous.content}${download.content}`
                : download.content;
            nextArtifacts[download.filename] = {
              content: nextContent,
              mimeType: download.mimeType,
            };
            return {
              ...download,
              content: nextContent,
            };
          }) ?? [];

          return {
            ...session,
            artifacts: nextArtifacts,
          };
        });
        normalizedDownloads.forEach(triggerDownload);
      }

      updateSession(sessionId, (session) => ({
        ...session,
        running: isBackground ? session.running : false,
        variables: execution.variables ?? session.variables,
        entries: session.entries.map((item) =>
          item.id === entry.id
            ? {
                ...item,
                commandId: execution.commandId,
                payload: execution.payload,
                result: execution.result,
                outputText: buildEntryOutput(execution),
                downloads: normalizedDownloads,
              }
            : item
        ),
      }));
    } catch (error) {
      if (!isBackground && foregroundRunTokenRef.current[sessionId] !== runToken) {
        return;
      }
      updateSession(sessionId, (session) => ({
        ...session,
        running: isBackground ? session.running : false,
        entries: session.entries.map((item) =>
          item.id === entry.id
            ? {
                ...item,
                error: error instanceof Error ? error.message : "Command failed.",
                outputText: error instanceof Error ? error.message : "Command failed.",
              }
            : item
        ),
      }));
    } finally {
      if (!isBackground && foregroundRunTokenRef.current[sessionId] === runToken) {
        foregroundEntryIdRef.current[sessionId] = null;
      }
    }
  }

  function setActiveDraft(nextDraft: string) {
    if (!activeSession) return;
    updateSession(activeSession.id, (session) => ({
      ...session,
      draft: nextDraft,
      historyIndex: null,
    }));
  }

  function applyInlineSuggestion(commandId: string) {
    if (!activeSession) return;
    updateSession(activeSession.id, (session) => ({
      ...session,
      draft: applySuggestionToDraft(session.draft, commandId),
      historyIndex: null,
    }));
    setSelectedSuggestionIndex(0);
    window.setTimeout(() => {
      inputRef.current?.focus();
    }, 0);
  }

  function handlePromptKeyDown(event: ReactKeyboardEvent<HTMLInputElement>) {
    if (!activeSession) return;

    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "c") {
      event.preventDefault();
      if (activeSession.running) {
        const sessionId = activeSession.id;
        foregroundRunTokenRef.current[sessionId] =
          (foregroundRunTokenRef.current[sessionId] ?? 0) + 1;
        const interruptedEntryId = foregroundEntryIdRef.current[sessionId] ?? null;
        foregroundEntryIdRef.current[sessionId] = null;
        updateSession(sessionId, (session) => ({
          ...session,
          running: false,
          draft: "",
          historyIndex: null,
          entries: session.entries.map((item) =>
            item.id === interruptedEntryId
              ? {
                  ...item,
                  error: "Interrupted.",
                  outputText: "^C",
                }
              : item
          ),
        }));
        return;
      }
      if (activeSession.draft) {
        setActiveDraft("");
      }
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      void runActiveSessionCommand();
      return;
    }

    if (event.key === "Tab" && inlineSuggestions.length > 0) {
      event.preventDefault();
      const suggestion =
        inlineSuggestions[selectedSuggestionIndex] ?? inlineSuggestions[0] ?? null;
      if (suggestion) {
        applyInlineSuggestion(suggestion.id);
      }
      return;
    }

    if (event.key === "ArrowUp") {
      if (inlineSuggestions.length > 0) {
        event.preventDefault();
        setSelectedSuggestionIndex((current) =>
          current <= 0 ? inlineSuggestions.length - 1 : current - 1
        );
        return;
      }
      if (!activeSession.history.length) return;
      event.preventDefault();
      const nextIndex =
        activeSession.historyIndex === null
          ? activeSession.history.length - 1
          : Math.max(0, activeSession.historyIndex - 1);
      updateSession(activeSession.id, (session) => ({
        ...session,
        historyIndex: nextIndex,
        draft: session.history[nextIndex] ?? session.draft,
      }));
      return;
    }

    if (event.key === "ArrowDown") {
      if (inlineSuggestions.length > 0) {
        event.preventDefault();
        setSelectedSuggestionIndex((current) =>
          current >= inlineSuggestions.length - 1 ? 0 : current + 1
        );
        return;
      }
      if (!activeSession.history.length || activeSession.historyIndex === null) return;
      event.preventDefault();
      const nextIndex = activeSession.historyIndex + 1;
      if (nextIndex >= activeSession.history.length) {
        updateSession(activeSession.id, (session) => ({
          ...session,
          historyIndex: null,
          draft: "",
        }));
        return;
      }
      updateSession(activeSession.id, (session) => ({
        ...session,
        historyIndex: nextIndex,
        draft: session.history[nextIndex] ?? "",
      }));
      return;
    }

    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
      event.preventDefault();
      if (!activeSession.entries.length) return;
      updateSession(activeSession.id, (session) => ({
        ...session,
        entries: [],
      }));
      return;
    }

    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "l") {
      event.preventDefault();
      updateSession(activeSession.id, (session) => ({
        ...session,
        entries: [],
      }));
      return;
    }

    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "u") {
      event.preventDefault();
      setActiveDraft("");
      return;
    }

    if ((event.metaKey || event.ctrlKey) && event.key === " ") {
      event.preventDefault();
      setCommandListOpen((current) => !current);
      return;
    }

    if (event.key === "Escape") {
      if (commandListOpen) {
        event.preventDefault();
        setCommandListOpen(false);
        return;
      }
      if (inlineSuggestions.length > 0) {
        event.preventDefault();
        setSelectedSuggestionIndex(0);
      }
    }
  }

  if (!open || !activeSession) return null;

  return (
    <div
      data-theme-surface="panel"
      style={{
        height: detached ? detachedFrame.height : height,
        width: detached ? detachedFrame.width : undefined,
        position: detached ? "fixed" : "relative",
        left: detached ? detachedFrame.x : undefined,
        top: detached ? detachedFrame.y : undefined,
        zIndex: detached ? 58 : undefined,
        borderRadius: detached ? 18 : 0,
        borderTop: "1px solid rgba(255,255,255,0.10)",
        background:
          "radial-gradient(circle at top left, rgba(82,177,255,0.09), transparent 24%), linear-gradient(180deg, rgba(7,10,16,0.988), rgba(5,7,12,0.995))",
        boxShadow: detached
          ? "0 28px 56px rgba(0,0,0,0.48)"
          : "0 -12px 28px rgba(0,0,0,0.28)",
        color: "#e9f3ff",
        display: "grid",
        gridTemplateRows: detached ? "auto 1fr" : "auto auto 1fr",
        overflow: "hidden",
        flexShrink: 0,
        minHeight: 0,
        minWidth: 0,
        fontFamily:
          'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
      }}
    >
      <div
        style={{
          display: detached ? "none" : "flex",
          justifyContent: "center",
          alignItems: "center",
          paddingTop: 2,
          paddingBottom: 2,
        }}
      >
        <button
          type="button"
          aria-label="Resize command console"
          onPointerDown={beginResize}
          onPointerMove={handleResizeMove}
          onPointerUp={endResize}
          onPointerCancel={endResize}
          style={{
            width: 92,
            height: 14,
            border: "none",
            background: "transparent",
            padding: 0,
            cursor: "ns-resize",
            display: "grid",
            placeItems: "center",
          }}
        >
          <span
            aria-hidden="true"
            style={{
              width: 52,
              height: 5,
              borderRadius: 999,
              background: "rgba(255,255,255,0.22)",
              boxShadow: "0 0 0 1px rgba(255,255,255,0.04)",
            }}
          />
        </button>
      </div>

      <div
        style={{
          padding: "0 14px 12px",
          borderBottom: "1px solid rgba(255,255,255,0.08)",
          display: "grid",
          gap: 10,
        }}
      >
        <div
          onPointerDown={detached ? beginDetachedDrag : undefined}
          onPointerMove={detached ? handleDetachedDragMove : undefined}
          onPointerUp={detached ? endDetachedDrag : undefined}
          onPointerCancel={detached ? endDetachedDrag : undefined}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 14,
            cursor: detached ? "move" : "default",
            paddingTop: detached ? 6 : 0,
          }}
        >
          <div style={{ minWidth: 0 }}>
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                fontSize: 13,
                fontWeight: 800,
                letterSpacing: 0.2,
              }}
            >
              <TerminalIcon />
              command shell
            </div>
            <div
              style={{
                marginTop: 4,
                fontSize: 11,
                color: "rgba(220,236,255,0.58)",
                lineHeight: 1.5,
                fontFamily: "inherit",
              }}
            >
              Enter runs the command. Tab autocompletes the command id. Ctrl/Cmd+Space
              toggles the command list.
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button
              type="button"
              onClick={() => setDetached((current) => !current)}
              onPointerDown={(event) => event.stopPropagation()}
              style={{
                borderRadius: 999,
                border: "1px solid rgba(255,255,255,0.12)",
                background: detached
                  ? "rgba(102,188,255,0.18)"
                  : "rgba(255,255,255,0.05)",
                color: "white",
                height: 32,
                padding: "0 12px",
                fontSize: 11,
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: 7,
              }}
              title={detached ? "Dock command shell" : "Extract command shell"}
            >
              <ExtractIcon detached={detached} />
              {detached ? "dock" : "extract"}
            </button>
            <button
              type="button"
              onClick={onClose}
              onPointerDown={(event) => event.stopPropagation()}
              style={{
                borderRadius: 999,
                border: "1px solid rgba(255,255,255,0.12)",
                background: "rgba(255,255,255,0.05)",
                color: "white",
                height: 32,
                padding: "0 9px",
                fontSize: 11,
                cursor: "pointer",
              }}
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              >
                <path d="M6 6l12 12" />
                <path d="M18 6L6 18" />
              </svg>
            </button>
          </div>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            overflowX: "auto",
            paddingBottom: 2,
          }}
        >
          {sessions.map((session) => {
            const active = session.id === activeSession.id;
            return (
              <div
                key={session.id}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "0 6px 0 0",
                  borderRadius: 999,
                  border: active
                    ? "1px solid rgba(102,188,255,0.34)"
                    : "1px solid rgba(255,255,255,0.10)",
                  background: active
                    ? "rgba(102,188,255,0.14)"
                    : "rgba(255,255,255,0.035)",
                  flexShrink: 0,
                }}
              >
                <button
                  type="button"
                  onClick={() => setActiveSessionId(session.id)}
                  style={{
                    border: "none",
                    background: "transparent",
                    color: "white",
                    padding: "8px 12px",
                    fontSize: 11,
                    cursor: "pointer",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  <span
                    aria-hidden="true"
                    style={{
                      width: 7,
                      height: 7,
                      borderRadius: 999,
                      background: session.running ? "#7cd6ff" : "rgba(255,255,255,0.32)",
                      boxShadow: session.running
                        ? "0 0 0 5px rgba(124,214,255,0.16)"
                        : "none",
                    }}
                  />
                  {session.title}
                </button>
                {sessions.length > 1 ? (
                  <button
                    type="button"
                    onClick={() => closeSession(session.id)}
                    style={{
                      border: "none",
                      background: "transparent",
                      color: "rgba(255,255,255,0.68)",
                      width: 24,
                      height: 24,
                      borderRadius: 999,
                      cursor: "pointer",
                      display: "grid",
                      placeItems: "center",
                    }}
                  >
                    ×
                  </button>
                ) : null}
              </div>
            );
          })}
          <button
            type="button"
            onClick={createNewSession}
            style={{
              width: 30,
              height: 30,
              borderRadius: 999,
              border: "1px solid rgba(255,255,255,0.12)",
              background: "rgba(255,255,255,0.05)",
              color: "white",
              display: "grid",
              placeItems: "center",
              cursor: "pointer",
              flexShrink: 0,
            }}
            aria-label="Create terminal tab"
            title="Create terminal tab"
          >
            <PlusIcon />
          </button>
          <button
            type="button"
            onClick={() => setCommandListOpen((current) => !current)}
            style={{
              marginLeft: "auto",
              borderRadius: 999,
              border: "1px solid rgba(255,255,255,0.12)",
              background: commandListOpen
                ? "rgba(102,188,255,0.18)"
                : "rgba(255,255,255,0.05)",
              color: "white",
              height: 30,
              padding: "0 12px",
              fontSize: 11,
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: 7,
              flexShrink: 0,
            }}
          >
            <BookIcon />
            commands
          </button>
        </div>
      </div>

      <div
        style={{
          minHeight: 0,
          position: "relative",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "grid",
            gridTemplateRows: "1fr auto",
            minHeight: 0,
          }}
        >
          <div
            style={{
              minHeight: 0,
              overflowY: "auto",
              padding: "14px 16px 4px",
              background:
                "linear-gradient(180deg, rgba(3,5,9,0.34), rgba(3,5,9,0.12) 24%, rgba(3,5,9,0))",
            }}
          >
            {activeSession.entries.length === 0 ? (
              <div
                style={{
                  padding: "6px 0 16px",
                  fontSize: 12,
                  lineHeight: 1.7,
                  color: "rgba(220,236,255,0.45)",
                  fontFamily: "inherit",
                }}
              >
                Shell ready. Try `help`, `viewer.getState`, or `pipeline.list`.
              </div>
            ) : null}

            {activeSession.entries.map((entry) => {
              const outputText =
                typeof entry.outputText === "string"
                  ? entry.outputText
                  : formatOutput(entry.error ? entry.error : entry.result);
              const failed = !!entry.error;
              return (
                <div key={entry.id} style={{ paddingBottom: 14 }}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "baseline",
                      gap: 10,
                      color: failed ? "#ffd4d4" : "#dff0ff",
                      fontSize: 12,
                      lineHeight: 1.6,
                      whiteSpace: "pre-wrap",
                      wordBreak: "break-word",
                    }}
                  >
                    <span style={{ color: "#7cd6ff", flexShrink: 0 }}>viewer$</span>
                    <span>{entry.line}</span>
                  </div>
                  <div
                    style={{
                      marginTop: 2,
                      marginLeft: 58,
                      fontSize: 12,
                      lineHeight: 1.65,
                      color: failed ? "#ffb8b8" : "rgba(226,238,255,0.84)",
                      whiteSpace: "pre-wrap",
                      wordBreak: "break-word",
                    }}
                  >
                    {outputText || (failed ? "" : "ok")}
                  </div>
                  {entry.downloads?.length ? (
                    <div
                      style={{
                        marginTop: 8,
                        marginLeft: 58,
                        display: "flex",
                        flexWrap: "wrap",
                        gap: 8,
                      }}
                    >
                      {entry.downloads.map((download) => (
                        <button
                          key={`${entry.id}-${download.filename}`}
                          type="button"
                          onClick={() => triggerDownload(download)}
                          style={{
                            borderRadius: 999,
                            border: "1px solid rgba(124,214,255,0.24)",
                            background: "rgba(124,214,255,0.10)",
                            color: "#dff6ff",
                            padding: "6px 10px",
                            fontSize: 11,
                            cursor: "pointer",
                            fontFamily: "inherit",
                          }}
                        >
                          download {download.filename}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              );
            })}

            <div ref={logEndRef} />
          </div>

          <div
            style={{
              borderTop: "1px solid rgba(255,255,255,0.08)",
              background: "rgba(7,10,16,0.96)",
              padding: "12px 16px 14px",
              position: "relative",
            }}
          >
            {inlineSuggestions.length > 0 ? (
              <div
                style={{
                  position: "absolute",
                  left: 16,
                  right: 16,
                  bottom: 60,
                  borderRadius: 12,
                  border: "1px solid rgba(255,255,255,0.10)",
                  background: "rgba(10,13,20,0.98)",
                  boxShadow: "0 14px 32px rgba(0,0,0,0.42)",
                  overflow: "hidden",
                }}
              >
                {inlineSuggestions.map((command, index) => {
                  const active = index === selectedSuggestionIndex;
                  return (
                    <button
                      key={command.id}
                      type="button"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => applyInlineSuggestion(command.id)}
                      style={{
                        width: "100%",
                        border: "none",
                        background: active
                          ? "rgba(102,188,255,0.16)"
                          : "transparent",
                        color: "white",
                        textAlign: "left",
                        padding: "10px 12px",
                        display: "grid",
                        gap: 4,
                        cursor: "pointer",
                      }}
                    >
                      <div style={{ fontSize: 12, color: "#d9efff" }}>{command.id}</div>
                      <div
                        style={{
                          fontSize: 11,
                          color: "rgba(220,236,255,0.56)",
                          fontFamily: "inherit",
                        }}
                      >
                        {command.description}
                      </div>
                    </button>
                  );
                })}
              </div>
            ) : null}

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "auto minmax(0, 1fr)",
                gap: 10,
                alignItems: "center",
              }}
            >
              <span style={{ color: "#7cd6ff", fontSize: 12 }}>viewer$</span>
              <input
                ref={inputRef}
                value={activeSession.draft}
                onChange={(event) => setActiveDraft(event.target.value)}
                onKeyDown={handlePromptKeyDown}
                spellCheck={false}
                autoCapitalize="off"
                autoCorrect="off"
                placeholder={
                  activeSession.running
                    ? "Command running..."
                    : 'Type a command, for example: viewer.patchState {"scene":{"selectedNodeId":"allen-average-volume"}}'
                }
                disabled={activeSession.running}
                style={{
                  width: "100%",
                  boxSizing: "border-box",
                  border: "none",
                  outline: "none",
                  background: "transparent",
                  color: "white",
                  fontSize: 12,
                  lineHeight: 1.5,
                  padding: 0,
                  fontFamily: "inherit",
                }}
              />
            </div>
          </div>
        </div>

        {commandListOpen ? (
          <div
            style={{
              position: "absolute",
              top: 0,
              right: 0,
              bottom: 0,
              width: "min(420px, 100%)",
              borderLeft: "1px solid rgba(255,255,255,0.08)",
              background: "rgba(8,11,18,0.985)",
              boxShadow: "-18px 0 36px rgba(0,0,0,0.34)",
              display: "grid",
              gridTemplateRows: "auto 1fr",
            }}
          >
            <div
              style={{
                padding: 14,
                borderBottom: "1px solid rgba(255,255,255,0.08)",
                display: "grid",
                gap: 10,
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 12,
                }}
              >
                <div style={{ fontSize: 12, color: "#dff0ff" }}>command catalog</div>
                <button
                  type="button"
                  onClick={() => setCommandListOpen(false)}
                  style={{
                    border: "none",
                    background: "transparent",
                    color: "rgba(255,255,255,0.68)",
                    cursor: "pointer",
                    fontSize: 16,
                    lineHeight: 1,
                  }}
                >
                  ×
                </button>
              </div>
              <input
                ref={commandListInputRef}
                value={commandFilter}
                onChange={(event) => setCommandFilter(event.target.value)}
                placeholder="Search commands..."
                style={{
                  width: "100%",
                  boxSizing: "border-box",
                  borderRadius: 10,
                  border: "1px solid rgba(255,255,255,0.10)",
                  background: "rgba(255,255,255,0.05)",
                  color: "white",
                  padding: "10px 11px",
                  fontSize: 12,
                  outline: "none",
                  fontFamily: "inherit",
                }}
              />
            </div>

            <div
              style={{
                minHeight: 0,
                overflowY: "auto",
                padding: 14,
                display: "grid",
                gap: 8,
              }}
            >
              {commandMatches.map((command) => (
                <button
                  key={command.id}
                  type="button"
                  onClick={() => {
                    setActiveDraft(command.examples[0] ?? command.usage);
                    setCommandListOpen(false);
                  }}
                  style={{
                    textAlign: "left",
                    borderRadius: 12,
                    border: "1px solid rgba(255,255,255,0.08)",
                    background: "rgba(255,255,255,0.035)",
                    color: "white",
                    padding: 12,
                    display: "grid",
                    gap: 6,
                    cursor: "pointer",
                  }}
                >
                  <div style={{ fontSize: 12, color: "#d9efff" }}>{command.id}</div>
                  <div
                    style={{
                      fontSize: 11,
                      color: "rgba(220,236,255,0.62)",
                      lineHeight: 1.55,
                      fontFamily: "inherit",
                    }}
                  >
                    {command.description}
                  </div>
                  <code
                    style={{
                      display: "block",
                      fontSize: 10,
                      color: "rgba(124,214,255,0.9)",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {command.examples[0] ?? command.usage}
                  </code>
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </div>
      {detached ? (
        <button
          type="button"
          aria-label="Resize command shell window"
          onPointerDown={beginDetachedResize}
          onPointerMove={handleDetachedResizeMove}
          onPointerUp={endDetachedResize}
          onPointerCancel={endDetachedResize}
          style={{
            position: "absolute",
            right: 0,
            bottom: 0,
            width: 34,
            height: 34,
            border: "none",
            background: "transparent",
            cursor: "nwse-resize",
            padding: 0,
            color: "rgba(220,236,255,0.62)",
            display: "grid",
            placeItems: "end",
          }}
        >
          <span
            style={{
              display: "inline-flex",
              paddingRight: 6,
              paddingBottom: 6,
              pointerEvents: "none",
            }}
          >
            <ResizeGripIcon />
          </span>
        </button>
      ) : null}
    </div>
  );
}
