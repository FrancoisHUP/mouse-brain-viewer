import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import {
  createEmptyAssistantConversation,
  createMockAppAssistantModel,
  createWebLLMAppAssistantModel,
  isWebGPUSupported,
  loadAssistantConversations,
  saveAssistantConversations,
  stopAppAssistantGeneration,
  type AppAssistantContext,
  type AppAssistantConversation,
  type AppAssistantMessage,
  type AppAssistantStatus,
  type AppAssistantToolCall,
  type AppAssistantToolProposal,
} from "./appAssistant";
import {
  getActivePipelineNodeConfigPreviewValue,
  getAssistantToolAvailability,
  getPipelineCommandAvailability,
  getViewerStateCommandAvailability,
  previewAssistantToolCall,
  summarizeAssistantToolCall,
} from "./appAssistantTools";
import {
  applyAutomationAssistantPatch,
  createPipelineFromAssistantDraft,
  type AutomationAssistantPatchOperation,
  validateAutomationAssistantPatch,
  validateAutomationPipelineDraft,
  type AutomationAssistantPipelineProposal,
  type AutomationValidationResult,
} from "./automationCapabilities";
import type { AutomationPipeline } from "./automationTypes";
import FloatingWindowManager, { type FloatingWindowState } from "./components/app/FloatingWindowManager";

const UI_FONT_FAMILY = "inherit";

type Props = {
  workspaceOpen: boolean;
  quickPrompt: { id: string; prompt: string } | null;
  context: AppAssistantContext;
  activePipelineId: string | null;
  pipelines: AutomationPipeline[];
  windows: FloatingWindowState[];
  onCloseWorkspace: () => void;
  onQuickPromptConsumed: () => void;
  onPipelinesChange: (pipelines: AutomationPipeline[]) => void;
  onActivePipelineIdChange: (pipelineId: string) => void;
  onApplyAssistantToolCall: (toolCall: AppAssistantToolCall) => void;
  onCreateChatWindow: (conversation: AppAssistantConversation) => void;
  onUpdateWindow: (id: string, patch: Partial<FloatingWindowState>) => void;
  onFocusWindow: (id: string) => void;
  onCloseWindow: (id: string) => void;
  renderWindowContent: (window: FloatingWindowState) => ReactNode;
};

export default function AppAssistantPanel({
  workspaceOpen,
  quickPrompt,
  context,
  activePipelineId,
  pipelines,
  windows,
  onCloseWorkspace,
  onQuickPromptConsumed,
  onPipelinesChange,
  onActivePipelineIdChange,
  onApplyAssistantToolCall,
  onCreateChatWindow,
  onUpdateWindow,
  onFocusWindow,
  onCloseWindow,
  renderWindowContent,
}: Props) {
  const stopRequestedRef = useRef(false);
  const quickPromptRef = useRef<string | null>(null);
  const [mode, setMode] = useState<"local" | "mock">("local");
  const [composerDrafts, setComposerDrafts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [pendingProposalRequest, setPendingProposalRequest] = useState(false);
  const [streamingMessageId, setStreamingMessageId] = useState<string | null>(null);
  const [leftPanelOpen, setLeftPanelOpen] = useState(true);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editingDraft, setEditingDraft] = useState("");
  const [status, setStatus] = useState<AppAssistantStatus>({
    phase: isWebGPUSupported() ? "idle" : "unsupported",
    message: isWebGPUSupported() ? "Local assistant loads on first use." : "WebGPU is unavailable. Mock mode still works.",
  });
  const [conversations, setConversations] = useState<AppAssistantConversation[]>(() => loadAssistantConversations());
  const [activeConversationId, setActiveConversationId] = useState<string>(() => conversations[0]?.id ?? createEmptyAssistantConversation().id);
  const [pipelineProposal, setPipelineProposal] = useState<AutomationAssistantPipelineProposal | null>(null);
  const [pipelineValidation, setPipelineValidation] = useState<AutomationValidationResult | null>(null);
  const [toolProposal, setToolProposal] = useState<AppAssistantToolProposal | null>(null);

  const activeConversation = conversations.find((conversation) => conversation.id === activeConversationId) ?? conversations[0] ?? null;
  const contextLine = useMemo(
    () => `${context.layers.total} layers · ${context.savedViewers.count} saved viewers · ${context.automation.count} pipelines`,
    [context]
  );

  useEffect(() => {
    saveAssistantConversations(conversations);
  }, [conversations]);

  useEffect(() => {
    if (conversations.some((conversation) => conversation.id === activeConversationId)) return;
    setActiveConversationId(conversations[0]?.id ?? createConversation().id);
  }, [activeConversationId, conversations]);

  useEffect(() => {
    if (!quickPrompt || quickPromptRef.current === quickPrompt.id) return;
    quickPromptRef.current = quickPrompt.id;
    const quickConversation = createConversation();
    onCreateChatWindow(quickConversation);
    onQuickPromptConsumed();
    submitMessage(quickPrompt.prompt, { targetConversation: quickConversation });
  }, [quickPrompt, onCreateChatWindow, onQuickPromptConsumed]);

  useEffect(() => {
    if (!openMenuId) return;
    function close() {
      setOpenMenuId(null);
    }
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [openMenuId]);

  useEffect(() => {
    windows.forEach((windowState) => {
      if (windowState.kind !== "assistant-chat" || !windowState.assistantConversationId) return;
      const conversation = conversations.find((item) => item.id === windowState.assistantConversationId);
      if (!conversation || windowState.subtitle === conversation.title) return;
      onUpdateWindow(windowState.id, { subtitle: conversation.title });
    });
  }, [conversations, onUpdateWindow, windows]);

  function updateConversations(updater: (current: AppAssistantConversation[]) => AppAssistantConversation[]) {
    setConversations((current) => updater(current).sort((a, b) => b.updatedAt - a.updatedAt));
  }

  function createConversation() {
    const next = createEmptyAssistantConversation(`Chat ${conversations.length + 1}`);
    setConversations((current) => [next, ...current]);
    setActiveConversationId(next.id);
    setPipelineProposal(null);
    setPipelineValidation(null);
    setToolProposal(null);
    return next;
  }

  function patchConversation(conversationId: string, updater: (conversation: AppAssistantConversation) => AppAssistantConversation) {
    updateConversations((current) =>
      current.map((conversation) =>
        conversation.id === conversationId ? { ...updater(conversation), updatedAt: Date.now() } : conversation
      )
    );
  }

  function appendMessages(messages: AppAssistantMessage[]) {
    const target = activeConversation ?? createConversation();
    const title =
      target.messages.length === 0 && messages[0]?.role === "user"
        ? messages[0].content.slice(0, 48) || target.title
        : target.title;
    updateConversations((current) =>
      current.map((conversation) =>
        conversation.id === target.id
          ? { ...conversation, title, messages: [...conversation.messages, ...messages], updatedAt: Date.now() }
          : conversation
      )
    );
    setActiveConversationId(target.id);
  }

  function updateMessage(conversationId: string, messageId: string, patch: Partial<AppAssistantMessage>) {
    patchConversation(conversationId, (conversation) => ({
      ...conversation,
      messages: conversation.messages.map((message) =>
        message.id === messageId ? { ...message, ...patch } : message
      ),
    }));
  }

  function createEditedMessageBranch(
    messages: AppAssistantMessage[],
    messageId: string,
    nextUserMessage: AppAssistantMessage,
    nextAssistantMessage: AppAssistantMessage
  ) {
    const userIndex = messages.findIndex((message) => message.id === messageId && message.role === "user");
    if (userIndex < 0) return [...messages, nextUserMessage, nextAssistantMessage];

    const originalUser = messages[userIndex];
    const maybeOriginalAssistant = messages[userIndex + 1]?.role === "assistant" ? messages[userIndex + 1] : null;
    const branchGroupId = originalUser.branchGroupId ?? `app-branch-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const branchMessages = messages.filter((message) => message.branchGroupId === branchGroupId);
    const nextBranchIndex = Math.max(0, ...branchMessages.map((message) => message.branchIndex ?? 0)) + 1;
    const nextBranchCount = nextBranchIndex + 1;

    const withBranch = (message: AppAssistantMessage, branchIndex: number): AppAssistantMessage => ({
      ...message,
      branchGroupId,
      branchIndex,
      branchCount: nextBranchCount,
      activeBranchIndex: nextBranchIndex,
    });

    const originalBranchIndex = originalUser.branchIndex ?? 0;
    const nextUser = withBranch(nextUserMessage, nextBranchIndex);
    const nextAssistant = withBranch(nextAssistantMessage, nextBranchIndex);
    const before = messages.slice(0, userIndex);
    const originalPair = [
      withBranch(originalUser, originalBranchIndex),
      ...(maybeOriginalAssistant ? [withBranch(maybeOriginalAssistant, maybeOriginalAssistant.branchIndex ?? originalBranchIndex)] : []),
    ];

    return [...before, ...originalPair, nextUser, nextAssistant];
  }

  function getComposerDraft(conversationId: string) {
    return composerDrafts[conversationId] ?? "";
  }

  function setComposerDraft(conversationId: string, value: string) {
    setComposerDrafts((current) => ({ ...current, [conversationId]: value }));
  }

  async function submitMessage(value?: string, options?: { targetConversation?: AppAssistantConversation; replaceFromMessageId?: string }) {
    const targetConversation = options?.targetConversation ?? activeConversation ?? createConversation();
    const targetConversationId = targetConversation.id;
    const rawMessage = value ?? getComposerDraft(targetConversationId);
    const message = rawMessage.trim();
    if (!message || busy) return;
    setComposerDraft(targetConversationId, "");
    setBusy(true);
    setPendingProposalRequest(looksLikeProposalRequest(message));
    stopRequestedRef.current = false;
    setPipelineProposal(null);
    setPipelineValidation(null);
    setToolProposal(null);

    const assistantMessageId = `app-assistant-${Date.now()}`;
    const userMessage: AppAssistantMessage = {
      id: `app-user-${Date.now()}`,
      role: "user",
      content: message,
    };
    const assistantMessage: AppAssistantMessage = {
      id: assistantMessageId,
      role: "assistant",
      content: mode === "local" ? "Preparing local assistant..." : "Thinking...",
      plainText: mode === "local" ? "Preparing local assistant..." : "Thinking...",
    };

    if (options?.replaceFromMessageId) {
      patchConversation(targetConversationId, (conversation) => ({
        ...conversation,
        messages: createEditedMessageBranch(conversation.messages, options.replaceFromMessageId!, userMessage, assistantMessage),
      }));
    } else {
      const title =
        targetConversation.messages.length === 0
          ? userMessage.content.slice(0, 48) || targetConversation.title
          : targetConversation.title;
      patchConversation(targetConversationId, (conversation) => ({
        ...conversation,
        title,
        messages: [...conversation.messages, userMessage, assistantMessage],
      }));
    }
    setActiveConversationId(targetConversationId);
    setStreamingMessageId(assistantMessageId);

    try {
      const model = mode === "local" ? createWebLLMAppAssistantModel({ onStatus: setStatus }) : createMockAppAssistantModel();
      const response = await model.sendMessage({
        userMessage: message,
        appContext: context,
        conversationHistory: targetConversation.messages.map((entry) => ({
          role: entry.role,
          content: entry.content,
        })),
        onToken: (text) => {
          const nextDisplay = splitAssistantStreamingResponseForDisplay(text || "Thinking...", message);
          updateMessage(targetConversationId, assistantMessageId, {
            content: text || "Thinking...",
            ...nextDisplay,
          });
        },
      });
      const nextProposal =
        response.proposal ??
        (response.pipelineDraft
          ? ({
              mode: "draft",
              summary: `Create "${response.pipelineDraft.name}".`,
              targetPipelineId: null,
              draft: response.pipelineDraft,
            } satisfies AutomationAssistantPipelineProposal)
          : null);
      if (nextProposal) {
        const validation =
          nextProposal.mode === "draft"
            ? validateAutomationPipelineDraft(nextProposal.draft)
            : validateAutomationAssistantPatch(
                nextProposal.patch,
                pipelines.find((pipeline) => pipeline.id === (nextProposal.targetPipelineId ?? activePipelineId)) ??
                  pipelines.find((pipeline) => pipeline.id === activePipelineId) ??
                  null
              );
        setPipelineProposal(nextProposal);
        setPipelineValidation(validation);
      }
      if (response.toolProposal) {
        setToolProposal(response.toolProposal);
      }
      const visible = nextProposal || response.toolProposal ? response.message : response.rawText || response.message;
      updateMessage(targetConversationId, assistantMessageId, {
        content: visible,
        ...splitAssistantResponseForDisplay(visible),
      });
    } catch (error) {
      if (!stopRequestedRef.current) {
        const text = error instanceof Error ? error.message : "The assistant could not answer.";
        updateMessage(targetConversationId, assistantMessageId, { content: text, plainText: text, codeText: undefined });
      }
    } finally {
      setBusy(false);
      setPendingProposalRequest(false);
      setStreamingMessageId(null);
    }
  }

  async function stopGeneration() {
    stopRequestedRef.current = true;
    if (mode === "local") await stopAppAssistantGeneration();
    if (streamingMessageId) {
      const message = activeConversation?.messages.find((item) => item.id === streamingMessageId);
      const nextContent = `${message?.content ?? ""}\n\nStopped.`;
      if (activeConversation) {
        updateMessage(activeConversation.id, streamingMessageId, { content: nextContent, ...splitAssistantResponseForDisplay(nextContent) });
      }
    }
    setBusy(false);
    setPendingProposalRequest(false);
    setStreamingMessageId(null);
    setStatus((current) => ({ ...current, phase: "ready", message: "Generation stopped." }));
  }

  function applyPipelineProposal() {
    if (!pipelineProposal || !pipelineValidation?.valid) return;
    if (pipelineProposal.mode === "draft") {
      const nextPipeline = createPipelineFromAssistantDraft(pipelineProposal.draft);
      if (activePipelineId && pipelines.some((pipeline) => pipeline.id === activePipelineId)) {
        onPipelinesChange(
          pipelines.map((pipeline) =>
            pipeline.id === activePipelineId ? { ...nextPipeline, id: pipeline.id, createdAt: pipeline.createdAt } : pipeline
          )
        );
        onActivePipelineIdChange(activePipelineId);
      } else {
        onPipelinesChange([...pipelines, nextPipeline]);
        onActivePipelineIdChange(nextPipeline.id);
      }
      appendMessages([
        {
          id: `app-assistant-applied-${Date.now()}`,
          role: "assistant",
          content: `"${pipelineProposal.draft.name}" was applied.`,
          plainText: `"${pipelineProposal.draft.name}" was applied.`,
        },
      ]);
    } else {
      const targetPipelineId = pipelineProposal.targetPipelineId ?? activePipelineId;
      const targetPipeline = pipelines.find((pipeline) => pipeline.id === targetPipelineId);
      if (!targetPipeline) return;
      const nextPipeline = applyAutomationAssistantPatch(targetPipeline, pipelineProposal.patch);
      onPipelinesChange(
        pipelines.map((pipeline) => (pipeline.id === targetPipeline.id ? nextPipeline : pipeline))
      );
      onActivePipelineIdChange(targetPipeline.id);
      appendMessages([
        {
          id: `app-assistant-patch-applied-${Date.now()}`,
          role: "assistant",
          content: `Applied the proposed update to "${targetPipeline.name}".`,
          plainText: `Applied the proposed update to "${targetPipeline.name}".`,
        },
      ]);
    }
    setPipelineProposal(null);
    setPipelineValidation(null);
  }

  function rejectPipelineProposal() {
    setPipelineProposal(null);
    setPipelineValidation(null);
    setToolProposal(null);
  }

  function applyToolProposal() {
    if (!toolProposal) return;
    onApplyAssistantToolCall(toolProposal.toolCall);
    appendMessages([
      {
        id: `app-assistant-action-applied-${Date.now()}`,
        role: "assistant",
        content: `Applied: ${toolProposal.summary}`,
        plainText: `Applied: ${toolProposal.summary}`,
      },
    ]);
    setToolProposal(null);
  }

  function beginRename(conversation: AppAssistantConversation) {
    setRenamingId(conversation.id);
    setRenameDraft(conversation.title);
    setOpenMenuId(null);
  }

  function commitRename() {
    if (!renamingId) return;
    const nextName = renameDraft.trim();
    if (nextName) {
      updateConversations((current) =>
        current.map((conversation) =>
          conversation.id === renamingId ? { ...conversation, title: nextName, updatedAt: Date.now() } : conversation
        )
      );
    }
    setRenamingId(null);
    setRenameDraft("");
  }

  function deleteConversation(conversationId: string) {
    updateConversations((current) => {
      const next = current.filter((conversation) => conversation.id !== conversationId);
      return next.length ? next : [createEmptyAssistantConversation()];
    });
    if (activeConversationId === conversationId) {
      const next = conversations.find((conversation) => conversation.id !== conversationId);
      if (next) setActiveConversationId(next.id);
    }
    setOpenMenuId(null);
  }

  function beginEdit(message: AppAssistantMessage) {
    setEditingMessageId(message.id);
    setEditingDraft(message.content);
  }

  function openConversationInWindow(conversation: AppAssistantConversation | null) {
    if (!conversation) return;
    const existingWindow = windows.find(
      (windowState) =>
        windowState.kind === "assistant-chat" &&
        windowState.assistantConversationId === conversation.id
    );
    if (existingWindow) {
      onUpdateWindow(existingWindow.id, { minimized: false });
      onFocusWindow(existingWindow.id);
      return;
    }
    onCreateChatWindow(conversation);
  }

  function submitEditedMessage(messageId: string) {
    const next = editingDraft.trim();
    if (!next) return;
    setEditingMessageId(null);
    setEditingDraft("");
    submitMessage(next, { replaceFromMessageId: messageId });
  }

  function switchMessageBranch(conversationId: string, branchGroupId: string, branchIndex: number) {
    patchConversation(conversationId, (conversation) => ({
      ...conversation,
      messages: conversation.messages.map((message) =>
        message.branchGroupId === branchGroupId ? { ...message, activeBranchIndex: branchIndex } : message
      ),
    }));
  }

  return (
    <>
      <style>{assistantCss}</style>
      <FloatingWindowManager
        windows={windows}
        onUpdateWindow={onUpdateWindow}
        onFocusWindow={onFocusWindow}
        onCloseWindow={onCloseWindow}
        renderWindowContent={(windowState) =>
          windowState.kind === "assistant-chat" && windowState.assistantConversationId
            ? renderConversation(false, windowState.assistantConversationId)
            : renderWindowContent(windowState)
        }
      />

      {workspaceOpen ? (
        <aside data-theme-surface="panel" style={workspaceStyle}>
          {!leftPanelOpen ? (
            <button type="button" onClick={() => setLeftPanelOpen(true)} title="Show chats" aria-label="Show chats" style={{ ...floatingButtonStyle, left: 14, top: 14 }}>
              <PanelIcon />
            </button>
          ) : null}
          <section style={{ borderRight: "1px solid rgba(255,255,255,0.09)", overflow: "hidden", display: leftPanelOpen ? "grid" : "none", gridTemplateRows: "auto 1fr" }}>
            <div style={{ padding: 16, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 900 }}>Chats</div>
                <div style={{ marginTop: 3, fontSize: 11, color: "rgba(255,255,255,0.58)" }}>{conversations.length} saved</div>
              </div>
              <div style={{ display: "inline-flex", gap: 8 }}>
                <button type="button" onClick={() => setLeftPanelOpen(false)} title="Hide chats" aria-label="Hide chats" style={iconButtonStyle}><PanelIcon /></button>
                <button type="button" onClick={createConversation} title="New chat" aria-label="New chat" style={primaryIconButtonStyle}><PlusIcon /></button>
              </div>
            </div>
            <div className="app-assistant-scroll" style={{ overflow: "auto", padding: "0 12px 104px", display: "grid", alignContent: "start", gap: 8 }}>
              {conversations.map((conversation) => (
                <div key={conversation.id} style={getConversationRowStyle(conversation.id === activeConversation?.id)}>
                  {renamingId === conversation.id ? (
                    <input
                      value={renameDraft}
                      onChange={(event) => setRenameDraft(event.target.value)}
                      onBlur={commitRename}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") commitRename();
                        if (event.key === "Escape") setRenamingId(null);
                      }}
                      autoFocus
                      style={renameInputStyle}
                    />
                  ) : (
                    <button type="button" onClick={() => setActiveConversationId(conversation.id)} style={conversationButtonStyle}>
                      <span style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 13, fontWeight: 800 }}>{conversation.title}</span>
                      <span style={{ display: "block", marginTop: 5, fontSize: 11, color: "rgba(255,255,255,0.58)" }}>{conversation.messages.length} messages</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      setOpenMenuId(openMenuId === conversation.id ? null : conversation.id);
                    }}
                    style={smallIconButtonStyle}
                    title="Chat options"
                    aria-label="Chat options"
                  >
                    <MoreIcon />
                  </button>
                  {openMenuId === conversation.id ? (
                    <div data-theme-surface="panel" onPointerDown={(event) => event.stopPropagation()} style={conversationMenuStyle}>
                      <button type="button" onClick={() => beginRename(conversation)} style={menuButtonStyle}>Rename</button>
                      <button type="button" onClick={() => deleteConversation(conversation.id)} style={{ ...menuButtonStyle, color: "#ffb8b8" }}>Delete</button>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          </section>
          <main style={{ minHeight: 0, display: "grid", gridTemplateRows: "auto minmax(0, 1fr)", background: "#090b10" }}>
            <div style={{ padding: "14px 18px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 900 }}>{activeConversation?.title ?? "Assistant"}</div>
                <div style={{ marginTop: 3, fontSize: 11, color: "rgba(255,255,255,0.58)" }}>{contextLine}</div>
              </div>
              <div style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                <button
                  type="button"
                  onClick={() => openConversationInWindow(activeConversation)}
                  title="Open this chat in a window"
                  aria-label="Open this chat in a window"
                  style={iconButtonStyle}
                >
                  <DetachIcon />
                </button>
                <button type="button" onClick={onCloseWorkspace} title="Close assistant" aria-label="Close assistant" style={iconButtonStyle}><CloseIcon /></button>
              </div>
            </div>
            {renderConversation(true, activeConversation?.id)}
          </main>
        </aside>
      ) : null}
    </>
  );

  function renderConversation(fullscreen: boolean, conversationId?: string) {
    const conversation =
      (conversationId ? conversations.find((item) => item.id === conversationId) : null) ??
      activeConversation;
    const draft = conversation ? getComposerDraft(conversation.id) : "";
    const visibleMessages = (conversation?.messages.length ? conversation.messages : welcomeMessages).filter(isActiveBranchMessage);
    return (
      <div style={{ minHeight: 0, height: "100%", boxSizing: "border-box", display: "grid", gridTemplateRows: "minmax(0, 1fr) auto auto", gap: 10, padding: fullscreen ? "18px 18px 104px" : 0 }}>
        <div className="app-assistant-scroll" style={{ overflow: "auto", display: "grid", alignContent: "start", gap: fullscreen ? 14 : 9, minHeight: 0, paddingRight: 4 }}>
            {visibleMessages.map((message) => (
              <div key={message.id} style={message.role === "user" ? userMessageRowStyle : assistantMessageRowStyle}>
                {message.role === "user" ? (
                  <div style={userBubbleStyle}>
                    {editingMessageId === message.id ? (
                      <div style={{ display: "grid", gap: 8 }}>
                        <textarea
                          value={editingDraft}
                          onChange={(event) => setEditingDraft(event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key !== "Enter" || event.shiftKey) return;
                            event.preventDefault();
                            submitEditedMessage(message.id);
                          }}
                          rows={3}
                          style={inputStyle}
                        />
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                          <ThreadArrows
                            message={message}
                            onSwitch={(branchIndex) => conversation && message.branchGroupId && switchMessageBranch(conversation.id, message.branchGroupId, branchIndex)}
                          />
                          <span style={{ display: "inline-flex", gap: 8 }}>
                            <button type="button" onClick={() => setEditingMessageId(null)} style={secondaryButtonStyle}>Cancel</button>
                            <button type="button" onClick={() => submitEditedMessage(message.id)} style={primaryButtonStyle}>Send</button>
                          </span>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div>{message.content}</div>
                        <div style={{ marginTop: 7, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                          <ThreadArrows
                            message={message}
                            onSwitch={(branchIndex) => conversation && message.branchGroupId && switchMessageBranch(conversation.id, message.branchGroupId, branchIndex)}
                          />
                          <button type="button" onClick={() => beginEdit(message)} title="Edit message" aria-label="Edit message" style={inlineIconButtonStyle}><PencilIcon /></button>
                        </div>
                      </>
                    )}
                  </div>
                ) : (
                  <AssistantMessageContent message={message} />
                )}
              </div>
            ))}
            {busy && pendingProposalRequest ? (
              <div style={assistantMessageRowStyle}>
                <div style={workingMessageStyle}>
                  <span style={assistantWorkingSpinnerStyle} />
                  <div style={{ display: "grid", gap: 2 }}>
                    <div style={{ fontSize: 12, fontWeight: 800, color: "rgba(245,250,255,0.96)" }}>
                      Working on a solution
                    </div>
                    <div style={{ fontSize: 11, color: "rgba(255,255,255,0.62)" }}>
                      Reviewing the current pipeline and preparing a proposal.
                    </div>
                  </div>
                </div>
              </div>
            ) : null}
            {pipelineProposal ? (
              <ProposalCard
                proposal={pipelineProposal}
                validation={pipelineValidation}
                currentPipeline={pipelines.find((pipeline) => pipeline.id === (pipelineProposal.targetPipelineId ?? activePipelineId)) ?? pipelines.find((pipeline) => pipeline.id === activePipelineId) ?? null}
                onApply={applyPipelineProposal}
                onReject={rejectPipelineProposal}
              />
            ) : null}
            {toolProposal ? (
              <ToolProposalCard
                proposal={toolProposal}
                context={context}
                onApply={applyToolProposal}
                onReject={rejectPipelineProposal}
              />
            ) : null}
        </div>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (conversation) submitMessage(draft, { targetConversation: conversation });
          }}
          style={composerStyle}
        >
          <textarea
            value={draft}
            onChange={(event) => conversation && setComposerDraft(conversation.id, event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== "Enter" || event.shiftKey) return;
              event.preventDefault();
              if (conversation) submitMessage(draft, { targetConversation: conversation });
            }}
            placeholder="Ask about the viewer, imports, saved viewers, or automation..."
            rows={fullscreen ? 3 : 2}
            style={composerTextareaStyle}
          />
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
            <label style={modelSelectWrapStyle}>
              <ModelStatusIcon status={status} />
              <select value={mode} onChange={(event) => setMode(event.target.value as "local" | "mock")} style={modelSelectStyle} aria-label="Assistant model">
                <option value="local">Local LLM</option>
                <option value="mock">Mock</option>
              </select>
            </label>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
              <span style={{ maxWidth: 210, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 10, color: "rgba(255,255,255,0.50)" }}>{status.message}</span>
              {busy ? (
                <button type="button" onClick={stopGeneration} title="Stop" aria-label="Stop" style={composerStopButtonStyle}><StopIcon /></button>
              ) : (
                <button type="submit" disabled={!draft.trim()} title="Send" aria-label="Send" style={{ ...composerSendButtonStyle, opacity: draft.trim() ? 1 : 0.48, cursor: draft.trim() ? "pointer" : "not-allowed" }}><SendIcon /></button>
              )}
            </span>
          </div>
          {status.phase === "loading" && typeof status.progress === "number" ? (
            <div style={progressTrackStyle}><div style={{ ...progressFillStyle, width: `${Math.max(3, Math.min(100, status.progress * 100))}%` }} /></div>
          ) : null}
        </form>
      </div>
    );
  }
}

function isActiveBranchMessage(message: AppAssistantMessage) {
  if (!message.branchGroupId) return true;
  return (message.activeBranchIndex ?? message.branchIndex ?? 0) === (message.branchIndex ?? 0);
}

const welcomeMessages: AppAssistantMessage[] = [
  {
    id: "assistant-welcome",
    role: "assistant",
    content: "Ask me about the current viewer, imports, saved viewers, or automation. I can draft changes for you to review.",
    plainText: "Ask me about the current viewer, imports, saved viewers, or automation. I can draft changes for you to review.",
  },
];

function AssistantMessageContent({ message }: { message: AppAssistantMessage }) {
  const parsedDisplay = getStructuredAssistantDisplay(message);
  const plainText = parsedDisplay.plainText;
  return (
    <div style={{ display: "grid", gap: parsedDisplay.codeText ? 8 : 0, maxWidth: 820 }}>
      {plainText.trim() ? <div style={{ whiteSpace: "pre-wrap", fontSize: 13, lineHeight: 1.5, color: "rgba(245,250,255,0.92)" }}>{plainText}</div> : null}
      {parsedDisplay.codeText ? <pre className="app-assistant-scroll" style={codeBlockStyle}>{parsedDisplay.codeText}</pre> : null}
    </div>
  );
}

function getStructuredAssistantDisplay(message: AppAssistantMessage): { plainText: string; codeText?: string } {
  if (message.codeText || message.plainText) {
    const parsedContent = parseAssistantJsonEnvelope(message.content);
    if (parsedContent) {
      return { plainText: parsedContent.message.trim(), codeText: undefined };
    }
  }
  const fromContent = parseAssistantJsonEnvelope(message.content);
  if (fromContent) {
    return { plainText: fromContent.message.trim(), codeText: undefined };
  }
  return {
    plainText: message.plainText ?? message.content,
    codeText: message.codeText,
  };
}

function ThreadArrows({ message, onSwitch }: { message: AppAssistantMessage; onSwitch?: (branchIndex: number) => void }) {
  if (!message.branchCount) return <span />;
  const count = Math.max(1, message.branchCount);
  const activeIndex = Math.min(count - 1, Math.max(0, message.activeBranchIndex ?? message.branchIndex ?? 0));
  const previous = (activeIndex - 1 + count) % count;
  const next = (activeIndex + 1) % count;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, color: "rgba(255,255,255,0.55)", fontSize: 11 }}>
      <button type="button" onClick={() => onSwitch?.(previous)} style={miniArrowStyle}>‹</button>
      {activeIndex + 1} / {count}
      <button type="button" onClick={() => onSwitch?.(next)} style={miniArrowStyle}>›</button>
    </span>
  );
}

function ProposalCard({
  proposal,
  validation,
  currentPipeline,
  onApply,
  onReject,
}: {
  proposal: AutomationAssistantPipelineProposal;
  validation: AutomationValidationResult | null;
  currentPipeline: AutomationPipeline | null;
  onApply: () => void;
  onReject: () => void;
}) {
  const isDraft = proposal.mode === "draft";
  const nodeCount = isDraft ? proposal.draft.nodes.length : proposal.patch.operations.filter((item) => item.op === "add_node").length;
  const routeCount = isDraft ? proposal.draft.connections.length : proposal.patch.operations.filter((item) => item.op === "add_connection").length;
  const patchPreview =
    !isDraft && currentPipeline
      ? safelyApplyProposalPreview(currentPipeline, proposal)
      : null;
  const patchDiffLines = !isDraft ? describePatchEffects(currentPipeline, proposal.patch.operations) : [];
  const patchJson = !isDraft ? JSON.stringify(proposal.patch, null, 2) : "";
  return (
    <div style={draftStyle}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 900, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {isDraft ? proposal.draft.name : proposal.summary}
          </div>
          <div style={{ marginTop: 3, fontSize: 10, color: "rgba(255,255,255,0.55)" }}>
            {isDraft ? `${nodeCount} nodes, ${routeCount} routes` : `${proposal.patch.operations.length} operations${nodeCount || routeCount ? ` · ${nodeCount} nodes · ${routeCount} routes` : ""}`}
          </div>
          {!isDraft && proposal.targetPipelineId ? (
            <div style={{ marginTop: 3, fontSize: 10, color: "rgba(160,225,255,0.62)" }}>
              Target pipeline: {proposal.targetPipelineId}
            </div>
          ) : null}
        </div>
        <div style={{ display: "inline-flex", gap: 8, alignItems: "flex-start" }}>
          <button type="button" onClick={onReject} style={secondaryButtonStyle}>Reject</button>
          <button type="button" onClick={onApply} disabled={!validation?.valid} style={{ ...primaryButtonStyle, opacity: validation?.valid ? 1 : 0.55 }}>Apply</button>
        </div>
      </div>
      {!isDraft ? (
        <div style={{ display: "grid", gap: 8 }}>
          {proposal.patch.operations.map((operation, index) => (
            <div key={index} style={operationSummaryStyle}>
              {summarizePatchOperation(operation)}
            </div>
          ))}
          {patchDiffLines.length ? (
            <div style={proposalSectionStyle}>
              <div style={proposalSectionTitleStyle}><PatchIcon /> Planned changes</div>
              <div style={{ display: "grid", gap: 5 }}>
                {patchDiffLines.map((line, index) => (
                  <div key={index} style={patchLineStyle}>{line}</div>
                ))}
              </div>
            </div>
          ) : null}
          <div style={proposalGridStyle}>
            {currentPipeline ? (
              <div style={proposalSectionStyle}>
                <div style={proposalSectionTitleStyle}><BeforeIcon /> Current pipeline</div>
                <pre className="app-assistant-scroll" style={proposalCodeStyle}>{currentPipeline.script}</pre>
              </div>
            ) : null}
            {patchPreview ? (
              <div style={proposalSectionStyle}>
                <div style={proposalSectionTitleStyle}><AfterIcon /> After patch</div>
                <pre className="app-assistant-scroll" style={proposalCodeStyle}>{patchPreview.script}</pre>
              </div>
            ) : null}
          </div>
          <div style={proposalSectionStyle}>
            <div style={proposalSectionTitleStyle}><CodeIcon /> Patch payload</div>
            <pre className="app-assistant-scroll" style={proposalCodeStyle}>{patchJson}</pre>
          </div>
        </div>
      ) : null}
      {validation?.issues.length ? (
        <div style={{ display: "grid", gap: 5 }}>
          {validation.issues.map((issue, index) => <div key={index} style={issue.level === "error" ? errorIssueStyle : warningIssueStyle}>{issue.message}</div>)}
        </div>
      ) : <div style={validIssueStyle}>Draft passes validation.</div>}
    </div>
  );
}

function ToolProposalCard({
  proposal,
  context,
  onApply,
  onReject,
}: {
  proposal: AppAssistantToolProposal;
  context: AppAssistantContext;
  onApply: () => void;
  onReject: () => void;
}) {
  const availability = getAssistantToolAvailability({
    selectedNodeId: context.view.selectedNodeId,
    selectedNodeKind: context.view.selectedNodeKind,
    selectedNodeCount: context.view.selectedNodeCount,
    activePipelineId: context.automation.activePipeline?.id ?? null,
  }).find((item) => item.name === proposal.toolCall.name);
  const stateCommandAvailability =
    proposal.toolCall.name === "assistant.proposeStateCommand"
      ? getViewerStateCommandAvailability(proposal.toolCall.arguments.command, {
          selectedNodeId: context.view.selectedNodeId,
          selectedNodeKind: context.view.selectedNodeKind,
          selectedNodeCount: context.view.selectedNodeCount,
          activePipelineId: context.automation.activePipeline?.id ?? null,
        })
      : null;
  const pipelineCommandAvailability =
    proposal.toolCall.name === "assistant.proposePipelineCommand"
      ? getPipelineCommandAvailability(
          proposal.toolCall.arguments.command,
          {
            selectedNodeId: context.view.selectedNodeId,
            selectedNodeKind: context.view.selectedNodeKind,
            selectedNodeCount: context.view.selectedNodeCount,
            activePipelineId: context.automation.activePipeline?.id ?? null,
          },
          context.automation.activePipeline?.script
        )
      : null;
  const previewLines = previewAssistantToolCall(proposal.toolCall, {
    selectedNodeName: context.view.selectedNodeName,
    selectedNodeVisible: context.view.selectedNodeVisible,
    selectedNodeOpacity: context.view.selectedNodeOpacity,
    selectedNodeTranslation: context.view.selectedNodeTranslation,
    selectedNodeCount: context.view.selectedNodeCount,
    activePipelineName: context.automation.activePipeline?.name ?? null,
    activePipelineEnabled: context.automation.activePipeline?.active ?? null,
    activePipelineAutoRun: context.automation.activePipeline?.autoRun ?? null,
    activePipelineDescription: context.automation.activePipeline?.description ?? null,
    activePipelineNodeConfigValue:
      proposal.toolCall.name === "assistant.proposePipelineCommand" &&
      proposal.toolCall.arguments.command.kind === "activePipeline.updateNodeConfig"
        ? getActivePipelineNodeConfigPreviewValue(context.automation.activePipeline?.script, proposal.toolCall)
        : undefined,
  });
  const canApply = pipelineCommandAvailability
    ? pipelineCommandAvailability.available
    : stateCommandAvailability
    ? stateCommandAvailability.available
    : availability?.available ?? true;
  const blockedReason = pipelineCommandAvailability?.available === false
    ? pipelineCommandAvailability.reason
    : stateCommandAvailability?.available === false
    ? stateCommandAvailability.reason
    : availability?.reason;
  return (
    <div style={draftStyle}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 900, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {proposal.summary}
          </div>
          <div style={{ marginTop: 3, fontSize: 10, color: "rgba(255,255,255,0.55)" }}>
            1 tool call
          </div>
        </div>
        <div style={{ display: "inline-flex", gap: 8, alignItems: "flex-start" }}>
          <button type="button" onClick={onReject} style={secondaryButtonStyle}>Reject</button>
          <button type="button" onClick={onApply} disabled={!canApply} style={{ ...primaryButtonStyle, opacity: canApply ? 1 : 0.55 }}>Apply</button>
        </div>
      </div>
      <div style={proposalSectionStyle}>
        <div style={proposalSectionTitleStyle}><PatchIcon /> Planned changes</div>
        <div style={{ display: "grid", gap: 5 }}>
          <div style={patchLineStyle}>{summarizeToolProposal(proposal.toolCall)}</div>
          {previewLines.map((line, index) => (
            <div key={index} style={patchLineStyle}>{line}</div>
          ))}
        </div>
      </div>
      {!canApply && blockedReason ? (
        <div style={warningIssueStyle}>{blockedReason}</div>
      ) : null}
    </div>
  );
}

function safelyApplyProposalPreview(
  currentPipeline: AutomationPipeline,
  proposal: Extract<AutomationAssistantPipelineProposal, { mode: "patch" }>
) {
  try {
    return applyAutomationAssistantPatch(currentPipeline, proposal.patch);
  } catch {
    return null;
  }
}

function describePatchEffects(
  currentPipeline: AutomationPipeline | null,
  operations: AutomationAssistantPatchOperation[]
) {
  const lines: string[] = [];
  operations.forEach((operation) => {
    if (operation.op === "update_node_config") {
      const targetNode = currentPipeline?.nodes.find((node) => node.id === operation.nodeId) ?? null;
      Object.entries(operation.config ?? {}).forEach(([key, value]) => {
        const before = (targetNode?.config as Record<string, unknown> | undefined)?.[key];
        lines.push(`${operation.nodeId}.${key}: ${formatPatchValue(before)} -> ${formatPatchValue(value)}`);
      });
      return;
    }
    if (operation.op === "set_pipeline_meta") {
      if (typeof operation.name === "string") lines.push(`pipeline.name: ${formatPatchValue(currentPipeline?.name)} -> ${formatPatchValue(operation.name)}`);
      if (typeof operation.description === "string") lines.push(`pipeline.description updated`);
      if (typeof operation.active === "boolean") lines.push(`pipeline.active: ${formatPatchValue(currentPipeline?.active)} -> ${formatPatchValue(operation.active)}`);
      if (typeof operation.autoRun === "boolean") lines.push(`pipeline.autoRun: ${formatPatchValue(currentPipeline?.autoRun)} -> ${formatPatchValue(operation.autoRun)}`);
      return;
    }
    if (operation.op === "add_connection") {
      lines.push(`route: ${operation.connection.fromNodeId} -> ${operation.connection.toNodeId}`);
      return;
    }
    if (operation.op === "remove_connection") {
      lines.push(`remove route: ${operation.connectionId}`);
      return;
    }
    if (operation.op === "add_node") {
      lines.push(`add node: ${String(operation.node.id ?? operation.node.token)} (${String(operation.node.token)})`);
      return;
    }
    if (operation.op === "remove_node") {
      lines.push(`remove node: ${operation.nodeId}`);
    }
  });
  return lines;
}

function formatPatchValue(value: unknown) {
  if (typeof value === "string") return `"${value}"`;
  if (value === undefined) return "undefined";
  return JSON.stringify(value);
}

function summarizePatchOperation(operation: AutomationAssistantPatchOperation) {
  if (operation.op === "set_pipeline_meta") {
    return "Update pipeline settings";
  }
  if (operation.op === "add_node") {
    return `Add node ${String(operation.node.id ?? operation.node.token)} (${String(operation.node.token)})`;
  }
  if (operation.op === "remove_node") {
    return `Remove node ${operation.nodeId}`;
  }
  if (operation.op === "update_node_config") {
    return `Update config for ${operation.nodeId}`;
  }
  if (operation.op === "add_connection") {
    return `Add route ${operation.connection.fromNodeId} -> ${operation.connection.toNodeId}`;
  }
  return `Remove route ${operation.connectionId}`;
}

function summarizeToolProposal(toolCall: AppAssistantToolCall) {
  return summarizeAssistantToolCall(toolCall);
}

function splitAssistantResponseForDisplay(content: string): Pick<AppAssistantMessage, "plainText" | "codeText"> {
  const parsedEnvelope = parseAssistantJsonEnvelope(content);
  if (parsedEnvelope) {
    return {
      plainText: parsedEnvelope.message.trim(),
      codeText: undefined,
    };
  }
  const trimmed = content.trimStart();
  const leadingOffset = content.length - trimmed.length;
  const jsonStart = findLikelyJsonStart(trimmed);
  if (jsonStart < 0) return { plainText: content, codeText: undefined };
  const absoluteStart = leadingOffset + jsonStart;
  return {
    plainText: content.slice(0, absoluteStart).trim(),
    codeText: content.slice(absoluteStart).trimStart(),
  };
}

function splitAssistantStreamingResponseForDisplay(
  content: string,
  userPrompt?: string
): Pick<AppAssistantMessage, "plainText" | "codeText"> {
  const parsedEnvelope = parseAssistantStreamingEnvelope(content);
  if (parsedEnvelope) {
    const parsedMessage = parsedEnvelope.message.trim();
    if (userPrompt && isLikelyEchoedStreamingReply(parsedMessage, userPrompt)) {
      return {
        plainText: "Working on a solution",
        codeText: undefined,
      };
    }
    return {
      plainText: parsedMessage || "Thinking...",
      codeText: undefined,
    };
  }
  const next = splitAssistantResponseForDisplay(content);
  if (userPrompt && isLikelyEchoedStreamingReply(next.plainText ?? "", userPrompt)) {
    return {
      plainText: "Working on a solution",
      codeText: undefined,
    };
  }
  return next;
}

function findLikelyJsonStart(content: string) {
  const draftIndex = content.indexOf('"draft"');
  if (draftIndex >= 0) {
    const beforeDraft = content.lastIndexOf("{", draftIndex);
    if (beforeDraft >= 0) return beforeDraft;
  }
  const messageIndex = content.indexOf('"message"');
  if (messageIndex >= 0) {
    const beforeMessage = content.lastIndexOf("{", messageIndex);
    if (beforeMessage >= 0) return beforeMessage;
  }
  return content.search(/^\s*[{[]/);
}

function parseAssistantJsonEnvelope(content: string): { message: string } | null {
  const trimmed = content.trim();
  if (!trimmed.startsWith("{") || !trimmed.endsWith("}")) return null;
  try {
    const parsed = JSON.parse(trimmed) as {
      message?: unknown;
      proposal?: unknown;
      draft?: unknown;
      intent?: unknown;
      toolCall?: unknown;
    };
    if (typeof parsed.message !== "string") return null;
    if (!("proposal" in parsed) && !("draft" in parsed) && !("intent" in parsed) && !("toolCall" in parsed)) {
      return null;
    }
    return { message: parsed.message };
  } catch {
    return null;
  }
}

function parseAssistantStreamingEnvelope(content: string): { message: string } | null {
  const trimmed = content.trimStart();
  if (!trimmed.startsWith("{")) return null;
  const messageMatch = trimmed.match(/"message"\s*:\s*"((?:\\.|[^"\\])*)/s);
  if (!messageMatch?.[1]) return null;
  return {
    message: decodeJsonStringFragment(messageMatch[1]),
  };
}

function decodeJsonStringFragment(value: string) {
  return value
    .replace(/\\"/g, "\"")
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\r")
    .replace(/\\t/g, "\t")
    .replace(/\\\\/g, "\\");
}

function isLikelyEchoedStreamingReply(value: string, userPrompt: string) {
  const normalizedValue = normalizeChatComparison(value);
  const normalizedPrompt = normalizeChatComparison(userPrompt);
  if (!normalizedValue || !normalizedPrompt) return false;
  return normalizedValue === normalizedPrompt;
}

function normalizeChatComparison(value: string) {
  return value.toLowerCase().replace(/[^\w\s]/g, " ").replace(/\s+/g, " ").trim();
}

function looksLikeProposalRequest(message: string) {
  const lower = message.toLowerCase();
  const mentionsPipeline =
    /\b(pipeline|automation|node|nodes|tool|tools|event|action|condition|source|compute|graph)\b/.test(lower);
  const asksToCreate =
    /\b(create|build|make|generate|draft|propose|set up)\b/.test(lower);
  const asksToEdit =
    /\b(change|update|modify|edit|replace|switch|adjust|fix)\b/.test(lower);
  const referencesCurrent =
    /\b(this pipeline|current pipeline|open pipeline|that pipeline)\b/.test(lower);
  return (mentionsPipeline && (asksToCreate || asksToEdit)) || (referencesCurrent && asksToEdit);
}

function CloseIcon() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M6 6l12 12" /><path d="M18 6L6 18" /></svg>;
}

function PlusIcon() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 5v14" /><path d="M5 12h14" /></svg>;
}

function MoreIcon() {
  return <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="12" cy="19" r="1.8" /></svg>;
}

function PanelIcon() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M9 4v16" /></svg>;
}

function SendIcon() {
  return <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round"><path d="M22 2L11 13" /><path d="M22 2l-7 20-4-9-9-4z" /></svg>;
}

function StopIcon() {
  return <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2" /></svg>;
}

function PencilIcon() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 20l4.2-1.1L19 8.1a2.1 2.1 0 0 0-3-3L5.2 15.9z" /><path d="M14.5 6.5l3 3" /></svg>;
}

function ModelStatusIcon({ status }: { status: AppAssistantStatus }) {
  if (status.phase === "loading" || status.phase === "generating") {
    return <span style={modelLoadingIconStyle} aria-label="Model loading" />;
  }
  const color = status.phase === "ready" ? "#9fe6cf" : status.phase === "unsupported" || status.phase === "error" ? "#ffb3b3" : "rgba(255,255,255,0.42)";
  return <span style={{ ...modelReadyDotStyle, background: color, boxShadow: status.phase === "ready" ? "0 0 9px rgba(159,230,207,0.55)" : "none" }} />;
}

function PatchIcon() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v6" /><path d="M12 15v6" /><path d="M4.9 4.9l4.2 4.2" /><path d="M14.9 14.9l4.2 4.2" /><path d="M3 12h6" /><path d="M15 12h6" /><path d="M4.9 19.1l4.2-4.2" /><path d="M14.9 9.1l4.2-4.2" /></svg>;
}

function BeforeIcon() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M15 18l-6-6 6-6" /></svg>;
}

function AfterIcon() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M9 18l6-6-6-6" /></svg>;
}

function CodeIcon() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8 9l-4 3 4 3" /><path d="M16 9l4 3-4 3" /><path d="M14 4l-4 16" /></svg>;
}

function DetachIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 4h6v6" />
      <path d="M10 14 20 4" />
      <rect x="4" y="8" width="12" height="12" rx="2" />
    </svg>
  );
}

const assistantCss = `
@keyframes automation-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
.app-assistant-scroll { scrollbar-width: thin; scrollbar-color: rgba(140, 190, 255, 0.45) rgba(255,255,255,0.06); }
.app-assistant-scroll::-webkit-scrollbar { width: 10px; }
.app-assistant-scroll::-webkit-scrollbar-track { background: rgba(255,255,255,0.05); border-radius: 999px; }
.app-assistant-scroll::-webkit-scrollbar-thumb { background: linear-gradient(180deg, rgba(140,190,255,0.52), rgba(90,150,230,0.34)); border-radius: 999px; border: 2px solid rgba(12,14,18,0.82); }
@keyframes assistant-fade-pulse { 0% { opacity: 0.7; transform: translateY(0px); } 50% { opacity: 1; transform: translateY(-1px); } 100% { opacity: 0.7; transform: translateY(0px); } }
`;

const workspaceStyle: CSSProperties = {
  position: "absolute",
  inset: 0,
  zIndex: 44,
  background: "rgba(10,12,16,0.98)",
  color: "white",
  display: "grid",
  gridTemplateColumns: "280px minmax(0, 1fr)",
  overflow: "hidden",
  fontFamily: UI_FONT_FAMILY,
};

const floatingButtonStyle: CSSProperties = {
  position: "absolute",
  zIndex: 7,
  width: 34,
  height: 34,
  borderRadius: 8,
  border: "1px solid rgba(255,255,255,0.10)",
  background: "rgba(12,14,18,0.82)",
  color: "white",
  cursor: "pointer",
};

const iconButtonStyle: CSSProperties = {
  width: 32,
  height: 32,
  borderRadius: 8,
  border: "1px solid rgba(255,255,255,0.10)",
  background: "rgba(255,255,255,0.05)",
  color: "white",
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 0,
  fontFamily: UI_FONT_FAMILY,
};

const primaryIconButtonStyle: CSSProperties = {
  ...iconButtonStyle,
  border: "1px solid rgba(120,190,255,0.45)",
  background: "rgba(120,190,255,0.16)",
};

function getConversationRowStyle(active: boolean): CSSProperties {
  return {
    position: "relative",
    borderRadius: 8,
    border: active ? "1px solid rgba(120,190,255,0.62)" : "1px solid rgba(255,255,255,0.08)",
    background: active ? "rgba(120,190,255,0.13)" : "rgba(255,255,255,0.04)",
    color: "white",
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr) 26px",
    alignItems: "center",
    gap: 4,
    padding: "8px 7px 8px 8px",
  };
}

const conversationButtonStyle: CSSProperties = {
  border: "none",
  background: "transparent",
  color: "inherit",
  textAlign: "left",
  padding: 4,
  cursor: "pointer",
  minWidth: 0,
  fontFamily: UI_FONT_FAMILY,
};

const smallIconButtonStyle: CSSProperties = {
  width: 24,
  minWidth: 24,
  height: 28,
  borderRadius: 6,
  border: "1px solid transparent",
  background: "transparent",
  color: "rgba(255,255,255,0.58)",
  cursor: "pointer",
};

const conversationMenuStyle: CSSProperties = {
  position: "absolute",
  right: 4,
  top: 38,
  zIndex: 10,
  width: 132,
  borderRadius: 8,
  border: "1px solid rgba(255,255,255,0.12)",
  background: "rgba(12,14,18,0.98)",
  boxShadow: "0 14px 34px rgba(0,0,0,0.42)",
  padding: 6,
  display: "grid",
  gap: 4,
};

const menuButtonStyle: CSSProperties = {
  border: "none",
  borderRadius: 6,
  background: "transparent",
  color: "rgba(255,255,255,0.88)",
  padding: "8px 9px",
  textAlign: "left",
  cursor: "pointer",
  fontSize: 12,
  fontWeight: 700,
  fontFamily: UI_FONT_FAMILY,
};

const renameInputStyle: CSSProperties = {
  width: "100%",
  minWidth: 0,
  height: 34,
  borderRadius: 7,
  border: "1px solid rgba(120,190,255,0.48)",
  background: "rgba(255,255,255,0.07)",
  color: "white",
  padding: "0 9px",
  fontSize: 13,
  fontWeight: 800,
  outline: "none",
  fontFamily: UI_FONT_FAMILY,
};

const userMessageRowStyle: CSSProperties = {
  justifySelf: "end",
  maxWidth: "min(720px, 82%)",
};

const assistantMessageRowStyle: CSSProperties = {
  justifySelf: "stretch",
  maxWidth: "min(920px, 92%)",
};

const userBubbleStyle: CSSProperties = {
  borderRadius: 10,
  border: "1px solid rgba(120,190,255,0.22)",
  background: "rgba(120,190,255,0.13)",
  color: "rgba(245,250,255,0.94)",
  padding: "9px 10px",
  fontSize: 13,
  lineHeight: 1.45,
  whiteSpace: "pre-wrap",
};

const codeBlockStyle: CSSProperties = {
  margin: 0,
  maxHeight: 260,
  overflow: "auto",
  borderRadius: 7,
  border: "1px solid rgba(120,190,255,0.18)",
  background: "rgba(0,0,0,0.28)",
  color: "rgba(230,245,255,0.9)",
  padding: 8,
  fontSize: 11,
  lineHeight: 1.45,
  fontFamily: "Consolas, monospace",
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
};

const proposalCodeStyle: CSSProperties = {
  ...codeBlockStyle,
  maxHeight: 220,
  fontSize: 10.5,
  background: "rgba(5,8,12,0.8)",
};

const proposalGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
  gap: 10,
};

const proposalSectionStyle: CSSProperties = {
  display: "grid",
  gap: 7,
  padding: 10,
  borderRadius: 9,
  border: "1px solid rgba(255,255,255,0.08)",
  background: "rgba(255,255,255,0.03)",
};

const proposalSectionTitleStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 7,
  fontSize: 11,
  fontWeight: 800,
  color: "rgba(235,245,255,0.88)",
};

const patchLineStyle: CSSProperties = {
  fontSize: 11,
  lineHeight: 1.4,
  color: "rgba(225,235,248,0.84)",
  fontFamily: "Consolas, monospace",
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
};

const workingMessageStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 10,
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid rgba(120,190,255,0.18)",
  background: "rgba(10,14,20,0.72)",
  boxShadow: "0 10px 24px rgba(0,0,0,0.18)",
  animation: "assistant-fade-pulse 1.6s ease-in-out infinite",
  maxWidth: 420,
};

const assistantWorkingSpinnerStyle: CSSProperties = {
  width: 16,
  height: 16,
  borderRadius: "50%",
  border: "2px solid rgba(120,190,255,0.22)",
  borderTopColor: "rgba(160,220,255,0.96)",
  animation: "automation-spin 0.8s linear infinite",
};

const inputStyle: CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  borderRadius: 8,
  border: "1px solid rgba(255,255,255,0.12)",
  background: "rgba(255,255,255,0.06)",
  color: "white",
  padding: "9px 10px",
  fontSize: 13,
  lineHeight: 1.35,
  outline: "none",
  resize: "none",
  fontFamily: UI_FONT_FAMILY,
};

const composerStyle: CSSProperties = {
  borderRadius: 8,
  border: "1px solid rgba(255,255,255,0.08)",
  background: "rgba(255,255,255,0.055)",
  padding: 10,
  display: "grid",
  gap: 9,
};

const composerTextareaStyle: CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  border: "none",
  background: "transparent",
  color: "white",
  padding: 0,
  fontSize: 13,
  lineHeight: 1.4,
  outline: "none",
  resize: "none",
  fontFamily: UI_FONT_FAMILY,
};

const modelSelectWrapStyle: CSSProperties = {
  minHeight: 30,
  borderRadius: 8,
  border: "1px solid rgba(255,255,255,0.09)",
  background: "rgba(0,0,0,0.14)",
  display: "inline-flex",
  alignItems: "center",
  gap: 7,
  padding: "0 8px",
};

const modelSelectStyle: CSSProperties = {
  border: "none",
  background: "transparent",
  color: "rgba(245,250,255,0.88)",
  outline: "none",
  fontSize: 12,
  fontWeight: 800,
  fontFamily: UI_FONT_FAMILY,
};

const composerSendButtonStyle: CSSProperties = {
  width: 34,
  height: 34,
  borderRadius: 9,
  border: "1px solid rgba(120,190,255,0.42)",
  background: "rgba(120,190,255,0.18)",
  color: "#d9eeff",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 0,
};

const composerStopButtonStyle: CSSProperties = {
  ...composerSendButtonStyle,
  border: "1px solid rgba(255,140,140,0.34)",
  background: "rgba(200,70,70,0.18)",
  color: "#ffd1d1",
  cursor: "pointer",
};

const modelReadyDotStyle: CSSProperties = {
  width: 8,
  height: 8,
  borderRadius: 999,
  display: "inline-block",
};

const modelLoadingIconStyle: CSSProperties = {
  width: 10,
  height: 10,
  borderRadius: 999,
  border: "2px solid rgba(120,190,255,0.28)",
  borderTopColor: "rgba(120,190,255,0.92)",
  display: "inline-block",
  animation: "automation-spin 850ms linear infinite",
};

const progressTrackStyle: CSSProperties = {
  height: 5,
  borderRadius: 999,
  background: "rgba(255,255,255,0.08)",
  overflow: "hidden",
};

const progressFillStyle: CSSProperties = {
  height: "100%",
  borderRadius: 999,
  background: "linear-gradient(90deg, rgba(120,190,255,0.72), rgba(159,230,207,0.72))",
  transition: "width 160ms ease",
};

const draftStyle: CSSProperties = {
  borderRadius: 8,
  border: "1px solid rgba(120,190,255,0.22)",
  background: "rgba(120,190,255,0.08)",
  padding: 10,
  display: "grid",
  gap: 9,
};

const operationSummaryStyle: CSSProperties = {
  borderRadius: 7,
  border: "1px solid rgba(255,255,255,0.08)",
  background: "rgba(255,255,255,0.04)",
  color: "rgba(235,245,255,0.84)",
  padding: "7px 8px",
  fontSize: 11,
  lineHeight: 1.35,
};

const primaryButtonStyle: CSSProperties = {
  minHeight: 32,
  borderRadius: 8,
  border: "1px solid rgba(120,190,255,0.42)",
  background: "rgba(120,190,255,0.16)",
  color: "white",
  padding: "0 12px",
  cursor: "pointer",
  fontSize: 12,
  fontWeight: 800,
  fontFamily: UI_FONT_FAMILY,
};

const secondaryButtonStyle: CSSProperties = {
  ...primaryButtonStyle,
  border: "1px solid rgba(255,255,255,0.10)",
  background: "rgba(255,255,255,0.05)",
};

const inlineIconButtonStyle: CSSProperties = {
  width: 24,
  height: 24,
  borderRadius: 6,
  border: "1px solid rgba(255,255,255,0.08)",
  background: "rgba(255,255,255,0.04)",
  color: "rgba(210,235,255,0.78)",
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 0,
};

const miniArrowStyle: CSSProperties = {
  width: 18,
  height: 18,
  borderRadius: 5,
  border: "1px solid rgba(255,255,255,0.10)",
  background: "rgba(255,255,255,0.04)",
  color: "rgba(255,255,255,0.75)",
  cursor: "pointer",
};

const validIssueStyle: CSSProperties = {
  borderRadius: 7,
  border: "1px solid rgba(159,230,207,0.22)",
  background: "rgba(159,230,207,0.08)",
  color: "#bdeede",
  padding: "7px 8px",
  fontSize: 11,
};

const warningIssueStyle: CSSProperties = {
  borderRadius: 7,
  border: "1px solid rgba(255,210,122,0.24)",
  background: "rgba(255,210,122,0.10)",
  color: "#ffe0a0",
  padding: "7px 8px",
  fontSize: 11,
};

const errorIssueStyle: CSSProperties = {
  ...warningIssueStyle,
  border: "1px solid rgba(255,130,130,0.26)",
  background: "rgba(190,60,60,0.14)",
  color: "#ffd1d1",
};
