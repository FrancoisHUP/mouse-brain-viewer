import { useEffect, useMemo, useRef, useState } from "react";
import type {
  BrowserResourceSummary,
  ResourceHistorySample,
  ResourceMetricId,
} from "./resourceTelemetry";
import {
  formatBytes,
  formatMetricPercent,
  getMetricFillColor,
} from "./resourceTelemetry";

type Props = {
  open: boolean;
  height: number;
  summary: BrowserResourceSummary;
  samples: ResourceHistorySample[];
  onHeightChange: (height: number) => void;
  onClose: () => void;
  onEndProcess: (processId: string) => void | Promise<void>;
  onRunCleanup: (options: {
    unloadHiddenData: boolean;
    clearHistory: boolean;
    unloadAssistant: boolean;
  }) => void | Promise<void>;
};

type TabId = "graphs" | "tasks" | "memory" | "settings";
type TaskSortKey = "name" | "status" | "startedAt" | "cpu" | "gpu" | "ram" | "vram";

function Sparkline({
  samples,
  metric,
  accent,
  tall = false,
}: {
  samples: ResourceHistorySample[];
  metric: ResourceMetricId;
  accent: string;
  tall?: boolean;
}) {
  const chartHeight = tall ? 170 : 64;
  const topPadding = tall ? 12 : 10;
  const bottomPadding = tall ? 12 : 6;
  const drawableHeight = chartHeight - topPadding - bottomPadding;
  const values = samples.map((sample) =>
    metric === "cpu"
      ? sample.cpuPercent
      : metric === "gpu"
        ? sample.gpuPercent
        : sample.ramPercent
  );
  const path = useMemo(() => {
    if (values.length === 0) return "";
    return values
      .map((value, index) => {
        const x = values.length === 1 ? 0 : (index / (values.length - 1)) * 196;
        const clampedValue = Math.max(0, Math.min(100, value));
        const y = chartHeight - bottomPadding - (clampedValue / 100) * drawableHeight;
        return `${index === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`;
      })
      .join(" ");
  }, [bottomPadding, chartHeight, drawableHeight, values]);

  return (
    <svg width="100%" height={chartHeight} viewBox={`0 0 196 ${chartHeight}`} preserveAspectRatio="none">
      {[0, 1, 2, 3].map((index) => (
        <line
          key={index}
          x1="0"
          x2="196"
          y1={topPadding + index * (drawableHeight / 3)}
          y2={topPadding + index * (drawableHeight / 3)}
          stroke="rgba(255,255,255,0.08)"
          strokeWidth="1"
        />
      ))}
      <path d={path} fill="none" stroke={accent} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function MetricCard({
  label,
  percent,
  samples,
  metric,
  fillHeight = false,
  tallGraph = false,
}: {
  label: string;
  percent: number;
  samples: ResourceHistorySample[];
  metric: ResourceMetricId;
  fillHeight?: boolean;
  tallGraph?: boolean;
}) {
  const accent = getMetricFillColor(percent);
  return (
    <div
      style={{
        borderRadius: 16,
        border: "1px solid rgba(255,255,255,0.10)",
        background: "rgba(255,255,255,0.04)",
        padding: 14,
        display: "grid",
        gap: 10,
        height: fillHeight ? "100%" : undefined,
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
        <div style={{ fontSize: 13, fontWeight: 800 }}>{label}</div>
        <div style={{ fontSize: 22, fontWeight: 900, color: accent }}>{formatMetricPercent(percent)}</div>
      </div>
      <Sparkline samples={samples} metric={metric} accent={accent} tall={tallGraph} />
    </div>
  );
}

function OverviewChip({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        borderRadius: 14,
        border: "1px solid rgba(255,255,255,0.10)",
        background: "rgba(255,255,255,0.04)",
        padding: "10px 12px",
        display: "grid",
        gap: 4,
      }}
    >
      <div style={{ fontSize: 11, color: "rgba(255,255,255,0.62)", textTransform: "uppercase", letterSpacing: 0.45 }}>
        {label}
      </div>
      <div style={{ fontSize: 14, fontWeight: 800, color: "white" }}>{value}</div>
    </div>
  );
}

function SortArrow({ active, direction }: { active: boolean; direction: "asc" | "desc" }) {
  return (
    <span
      aria-hidden="true"
      style={{
        fontSize: 10,
        color: active ? "rgba(255,255,255,0.82)" : "rgba(255,255,255,0.34)",
        lineHeight: 1,
      }}
    >
      {direction === "asc" ? "\u25B2" : "\u25BC"}
    </span>
  );
}

function MemoryRow({
  label,
  bytes,
  description,
  accent,
}: {
  label: string;
  bytes: number;
  description: string;
  accent: string;
}) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "minmax(0, 1fr) auto",
        gap: 10,
        alignItems: "start",
        borderRadius: 14,
        border: "1px solid rgba(255,255,255,0.08)",
        background: "rgba(255,255,255,0.03)",
        padding: 12,
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span
            aria-hidden="true"
            style={{
              width: 9,
              height: 9,
              borderRadius: 999,
              background: accent,
              boxShadow: `0 0 0 5px ${accent}20`,
              flexShrink: 0,
            }}
          />
          <div style={{ fontSize: 13, fontWeight: 700, color: "white" }}>{label}</div>
        </div>
        <div style={{ marginTop: 6, fontSize: 11, color: "rgba(255,255,255,0.60)", lineHeight: 1.45 }}>
          {description}
        </div>
      </div>
      <div style={{ fontSize: 12, fontWeight: 800, color: "rgba(255,255,255,0.88)" }}>
        {formatBytes(bytes)}
      </div>
    </div>
  );
}

function TabIcon({ tab, active }: { tab: TabId; active: boolean }) {
  const stroke = active ? "white" : "rgba(255,255,255,0.72)";
  if (tab === "graphs") {
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 18L9 12l4 3 7-9" />
        <path d="M4 4v14h16" opacity="0.45" />
      </svg>
    );
  }
  if (tab === "tasks") {
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="4" y="4" width="6" height="6" rx="1.5" />
        <rect x="14" y="4" width="6" height="6" rx="1.5" />
        <rect x="4" y="14" width="6" height="6" rx="1.5" />
        <rect x="14" y="14" width="6" height="6" rx="1.5" />
      </svg>
    );
  }
  if (tab === "memory") {
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="5" y="7" width="14" height="10" rx="2" />
        <path d="M8 7V5M12 7V5M16 7V5M8 19v-2M12 19v-2M16 19v-2M3 10h2M3 14h2M19 10h2M19 14h2" />
      </svg>
    );
  }
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.6 1.6 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.6 1.6 0 00-1.8-.3 1.6 1.6 0 00-1 1.5V21a2 2 0 11-4 0v-.2a1.6 1.6 0 00-1-1.5 1.6 1.6 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.6 1.6 0 00.3-1.8 1.6 1.6 0 00-1.5-1H3a2 2 0 110-4h.2a1.6 1.6 0 001.5-1 1.6 1.6 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.6 1.6 0 001.8.3h.1A1.6 1.6 0 0010 3.2V3a2 2 0 114 0v.2a1.6 1.6 0 001 1.5 1.6 1.6 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.6 1.6 0 00-.3 1.8v.1a1.6 1.6 0 001.5 1H21a2 2 0 110 4h-.2a1.6 1.6 0 00-1.4 1z" />
    </svg>
  );
}

export default function ResourceManagerPanel({
  open,
  height,
  summary,
  samples,
  onHeightChange,
  onClose,
  onEndProcess,
  onRunCleanup,
}: Props) {
  const [activeTab, setActiveTab] = useState<TabId>("graphs");
  const [taskSort, setTaskSort] = useState<{ key: TaskSortKey; direction: "asc" | "desc" }>({
    key: "startedAt",
    direction: "desc",
  });
  const [unloadHiddenData, setUnloadHiddenData] = useState(true);
  const [clearHistory, setClearHistory] = useState(false);
  const [unloadAssistant, setUnloadAssistant] = useState(false);
  const dragStateRef = useRef<{
    pointerId: number;
    startY: number;
    startHeight: number;
  } | null>(null);

  useEffect(() => {
    if (!open) return;
    setUnloadHiddenData(summary.hiddenCacheBytes > 0);
    setClearHistory(summary.historyBytes >= 8 * 1024 * 1024);
    setUnloadAssistant(summary.assistantLoaded);
  }, [open, summary.assistantLoaded, summary.hiddenCacheBytes, summary.historyBytes]);

  const assistantProcess = summary.processes.find((process) => process.kind === "assistant");
  const assistantBytes = (assistantProcess?.ramBytes ?? 0) + (assistantProcess?.vramBytes ?? 0);
  const hiddenCleanupBytes = unloadHiddenData ? summary.hiddenCacheBytes : 0;
  const historyCleanupBytes = clearHistory ? summary.historyBytes : 0;
  const assistantCleanupBytes = unloadAssistant ? assistantBytes : 0;
  const cleanupBytes = hiddenCleanupBytes + historyCleanupBytes + assistantCleanupBytes;
  const canRunCleanup = cleanupBytes > 0;
  const closeThreshold = 84;
  const minHeight = 120;
  const maxHeight =
    typeof window === "undefined"
      ? 560
      : Math.max(280, Math.min(window.innerHeight - 120, Math.round(window.innerHeight * 0.72)));

  function clampPanelHeight(nextHeight: number) {
    return Math.max(minHeight, Math.min(maxHeight, Math.round(nextHeight)));
  }

  function beginResize(event: React.PointerEvent<HTMLButtonElement>) {
    dragStateRef.current = {
      pointerId: event.pointerId,
      startY: event.clientY,
      startHeight: height,
    };
    const target = event.currentTarget;
    target.setPointerCapture(event.pointerId);
    event.preventDefault();
  }

  function handleResizeMove(event: React.PointerEvent<HTMLButtonElement>) {
    const dragState = dragStateRef.current;
    if (!dragState || dragState.pointerId !== event.pointerId) return;
    const deltaY = dragState.startY - event.clientY;
    const nextHeight = Math.round(dragState.startHeight + deltaY);
    if (nextHeight <= closeThreshold) {
      onHeightChange(closeThreshold);
      return;
    }
    onHeightChange(clampPanelHeight(nextHeight));
  }

  function endResize(event: React.PointerEvent<HTMLButtonElement>) {
    const dragState = dragStateRef.current;
    if (!dragState || dragState.pointerId !== event.pointerId) return;
    const nextHeight = Math.round(dragState.startHeight + (dragState.startY - event.clientY));
    dragStateRef.current = null;
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {}
    if (nextHeight <= closeThreshold) {
      onClose();
    }
  }

  const tabs: Array<{ id: TabId; label: string }> = [
    { id: "graphs", label: "Graphs" },
    { id: "tasks", label: "Tasks" },
    { id: "memory", label: "Memory" },
    { id: "settings", label: "Settings" },
  ];

  const sortedMemoryBuckets = [...summary.memoryBuckets].sort((left, right) => right.bytes - left.bytes);
  const cleanupButtonLabel = canRunCleanup ? `Free ${formatBytes(cleanupBytes)}` : "Nothing to free";
  const sortedProcesses = useMemo(() => {
    const directionFactor = taskSort.direction === "asc" ? 1 : -1;
    const getNumber = (value: number | null | undefined) => value ?? Number.NEGATIVE_INFINITY;
    return [...summary.processes].sort((left, right) => {
      let result = 0;
      switch (taskSort.key) {
        case "name":
          result = left.name.localeCompare(right.name);
          break;
        case "status":
          result = left.status.localeCompare(right.status);
          break;
        case "startedAt":
          result = left.startedAt - right.startedAt;
          break;
        case "cpu":
          result = getNumber(left.cpuPercent) - getNumber(right.cpuPercent);
          break;
        case "gpu":
          result = getNumber(left.gpuPercent) - getNumber(right.gpuPercent);
          break;
        case "ram":
          result = getNumber(left.ramBytes) - getNumber(right.ramBytes);
          break;
        case "vram":
          result = getNumber(left.vramBytes) - getNumber(right.vramBytes);
          break;
      }
      if (result !== 0) return result * directionFactor;
      return left.name.localeCompare(right.name);
    });
  }, [summary.processes, taskSort]);

  function toggleTaskSort(key: TaskSortKey) {
    setTaskSort((current) =>
      current.key === key
        ? { key, direction: current.direction === "asc" ? "desc" : "asc" }
        : { key, direction: key === "name" || key === "status" ? "asc" : "desc" }
    );
  }

  if (!open) return null;

  return (
    <div
      data-theme-surface="panel"
      style={{
        height,
        borderTop: "1px solid rgba(255,255,255,0.10)",
        background: "linear-gradient(180deg, rgba(10,12,18,0.98), rgba(8,10,16,0.98))",
        boxShadow: "0 -12px 28px rgba(0,0,0,0.28)",
        color: "white",
        display: "grid",
        gridTemplateRows: "auto auto 1fr",
        overflow: "hidden",
        flexShrink: 0,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          paddingTop: 2,
          paddingBottom: 2,
        }}
      >
        <button
          type="button"
          aria-label="Resize resource manager"
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
          padding: "0 18px 12px",
          borderBottom: "1px solid rgba(255,255,255,0.08)",
          display: "flex",
          gap: 10,
          alignItems: "center",
          overflowX: "auto",
          overflowY: "hidden",
        }}
      >
        {tabs.map((tab) => {
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              style={{
                height: 36,
                borderRadius: 999,
                border: active ? "1px solid rgba(140,190,255,0.34)" : "1px solid rgba(255,255,255,0.10)",
                background: active ? "rgba(120,190,255,0.16)" : "rgba(255,255,255,0.04)",
                color: "white",
                padding: "0 14px",
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                fontSize: 12,
                fontWeight: 800,
                cursor: "pointer",
                flexShrink: 0,
              }}
            >
              <TabIcon tab={tab.id} active={active} />
              {tab.label}
            </button>
          );
        })}
      </div>

      <div
        style={{
          minHeight: 0,
          overflowY: "auto",
          padding: 18,
        }}
      >
        {activeTab === "graphs" ? (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(170px, 2.2fr) minmax(0, 9.8fr)",
              gap: 16,
              minHeight: 0,
              alignItems: "stretch",
            }}
          >
            <div style={{ display: "grid", gap: 10, alignContent: "stretch", gridAutoRows: "minmax(0, 1fr)" }}>
              <OverviewChip label="Processes" value={String(summary.processCount)} />
              <OverviewChip label="Tracked app data" value={formatBytes(summary.appTrackedBytes)} />
              <OverviewChip
                label="Browser storage"
                value={
                  summary.storageQuotaBytes
                    ? `${formatBytes(summary.storageUsageBytes)} / ${formatBytes(summary.storageQuotaBytes)}`
                    : formatBytes(summary.storageUsageBytes)
                }
              />
              <OverviewChip
                label="JS heap"
                value={
                  summary.heapUsedBytes != null || summary.heapLimitBytes != null
                    ? `${formatBytes(summary.heapUsedBytes)} / ${formatBytes(summary.heapLimitBytes)}`
                    : "Unavailable"
                }
              />
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
                gap: 12,
                alignItems: "stretch",
                minHeight: 0,
              }}
            >
              <MetricCard label="CPU" percent={summary.cpuPercent} samples={samples} metric="cpu" fillHeight tallGraph />
              <MetricCard label="GPU" percent={summary.gpuPercent} samples={samples} metric="gpu" fillHeight tallGraph />
              <MetricCard label="RAM" percent={summary.ramPercent} samples={samples} metric="ram" fillHeight tallGraph />
            </div>
          </div>
        ) : null}

        {activeTab === "tasks" ? (
          <div style={{ display: "grid", gap: 10 }}>
            {sortedProcesses.length > 0 ? (
              <div
                style={{
                  borderRadius: 16,
                  border: "1px solid rgba(255,255,255,0.10)",
                  background: "rgba(255,255,255,0.04)",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "minmax(260px, 2.6fr) 110px 110px repeat(4, minmax(84px, 1fr)) 110px",
                    gap: 10,
                    padding: "10px 14px",
                    borderBottom: "1px solid rgba(255,255,255,0.08)",
                    background: "rgba(255,255,255,0.03)",
                    alignItems: "center",
                  }}
                >
                  {[
                    ["name", "Name"],
                    ["status", "Status"],
                    ["startedAt", "Started"],
                    ["cpu", "CPU"],
                    ["gpu", "GPU"],
                    ["ram", "RAM"],
                    ["vram", "VRAM"],
                  ].map(([key, label]) => {
                    const sortKey = key as TaskSortKey;
                    const active = taskSort.key === sortKey;
                    return (
                      <button
                        key={sortKey}
                        type="button"
                        onClick={() => toggleTaskSort(sortKey)}
                        style={{
                          border: "none",
                          background: "transparent",
                          color: "rgba(255,255,255,0.72)",
                          padding: 0,
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 6,
                          fontSize: 11,
                          fontWeight: 800,
                          letterSpacing: 0.3,
                          textTransform: "uppercase",
                          cursor: "pointer",
                          justifyContent: sortKey === "name" ? "flex-start" : "center",
                        }}
                      >
                        {label}
                        <SortArrow active={active} direction={active ? taskSort.direction : "desc"} />
                      </button>
                    );
                  })}
                  <div
                    style={{
                      fontSize: 11,
                      fontWeight: 800,
                      letterSpacing: 0.3,
                      textTransform: "uppercase",
                      color: "rgba(255,255,255,0.72)",
                      textAlign: "center",
                    }}
                  >
                    Action
                  </div>
                </div>
                <div style={{ display: "grid" }}>
                  {sortedProcesses.map((process, index) => (
                    <div
                      key={process.id}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "minmax(260px, 2.6fr) 110px 110px repeat(4, minmax(84px, 1fr)) 110px",
                        gap: 10,
                        padding: "10px 14px",
                        alignItems: "center",
                        borderTop: index === 0 ? "none" : "1px solid rgba(255,255,255,0.06)",
                      }}
                    >
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 800, color: "white", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          {process.name}
                        </div>
                        <div
                          style={{
                            marginTop: 3,
                            fontSize: 11,
                            color: "rgba(255,255,255,0.60)",
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          }}
                        >
                          {process.detail || "Tracked browser task."}
                        </div>
                      </div>
                      <div style={{ display: "flex", justifyContent: "center" }}>
                        <div
                          style={{
                            borderRadius: 999,
                            padding: "4px 8px",
                            border: "1px solid rgba(255,255,255,0.10)",
                            background:
                              process.status === "error"
                                ? "rgba(255,107,107,0.14)"
                                : process.status === "stopping"
                                  ? "rgba(247,200,115,0.14)"
                                  : "rgba(114,227,192,0.10)",
                            color:
                              process.status === "error"
                                ? "#ff9f9f"
                                : process.status === "stopping"
                                  ? "#f7c873"
                                  : "#9cebd4",
                            fontSize: 10,
                            fontWeight: 800,
                            textTransform: "uppercase",
                            letterSpacing: 0.4,
                          }}
                        >
                          {process.status}
                        </div>
                      </div>
                      <div style={{ fontSize: 11, color: "rgba(255,255,255,0.70)", textAlign: "center" }}>
                        {new Date(process.startedAt).toLocaleTimeString()}
                      </div>
                      <div style={{ fontSize: 12, color: "rgba(255,255,255,0.86)", textAlign: "center" }}>
                        {formatMetricPercent(process.cpuPercent)}
                      </div>
                      <div style={{ fontSize: 12, color: "rgba(255,255,255,0.86)", textAlign: "center" }}>
                        {formatMetricPercent(process.gpuPercent)}
                      </div>
                      <div style={{ fontSize: 12, color: "rgba(255,255,255,0.86)", textAlign: "center" }}>
                        {formatBytes(process.ramBytes)}
                      </div>
                      <div style={{ fontSize: 12, color: "rgba(255,255,255,0.86)", textAlign: "center" }}>
                        {formatBytes(process.vramBytes)}
                      </div>
                      <div style={{ display: "flex", justifyContent: "center" }}>
                        {process.canEnd ? (
                          <button
                            type="button"
                            onClick={() => {
                              void onEndProcess(process.id);
                            }}
                            disabled={process.status === "stopping"}
                            style={{
                              height: 30,
                              borderRadius: 999,
                              border: "1px solid rgba(255,120,120,0.30)",
                              background: "rgba(255,120,120,0.12)",
                              color: "white",
                              padding: "0 12px",
                              fontSize: 12,
                              fontWeight: 800,
                              cursor: process.status === "stopping" ? "wait" : "pointer",
                              opacity: process.status === "stopping" ? 0.6 : 1,
                            }}
                          >
                            End task
                          </button>
                        ) : process.badgeLabel ? (
                          <div
                            style={{
                              borderRadius: 999,
                              padding: "5px 9px",
                              border: "1px solid rgba(255,255,255,0.10)",
                              background: "rgba(255,255,255,0.05)",
                              color: "rgba(255,255,255,0.74)",
                              fontSize: 10,
                              fontWeight: 800,
                              textTransform: "uppercase",
                              letterSpacing: 0.4,
                            }}
                          >
                            {process.badgeLabel}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div
                style={{
                  borderRadius: 16,
                  border: "1px solid rgba(255,255,255,0.10)",
                  background: "rgba(255,255,255,0.04)",
                  padding: 16,
                  fontSize: 12,
                  color: "rgba(255,255,255,0.66)",
                }}
              >
                No tracked background tasks are running right now.
              </div>
            )}
          </div>
        ) : null}

        {activeTab === "memory" ? (
          <div style={{ display: "grid", gap: 10 }}>
            {sortedMemoryBuckets.map((bucket) => (
              <MemoryRow
                key={bucket.id}
                label={bucket.label}
                bytes={bucket.bytes}
                description={bucket.description}
                accent={bucket.accent}
              />
            ))}
          </div>
        ) : null}

        {activeTab === "settings" ? (
          <div style={{ display: "grid", gap: 14 }}>
            <div
              style={{
                borderRadius: 16,
                border: "1px solid rgba(255,255,255,0.10)",
                background: "rgba(255,255,255,0.04)",
                padding: 14,
                display: "grid",
                gap: 12,
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 800 }}>Cleanup</div>
                    <div style={{ marginTop: 5, fontSize: 11, lineHeight: 1.45, color: "rgba(255,255,255,0.62)" }}>
                      Choose which browser resources to release. The panel suggests options based on hidden layers, history size, and whether the assistant model is still loaded.
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={!canRunCleanup}
                    onClick={() => {
                      void onRunCleanup({
                        unloadHiddenData,
                        clearHistory,
                        unloadAssistant,
                      });
                    }}
                    style={{
                      height: 34,
                      flexShrink: 0,
                      borderRadius: 999,
                      border: "1px solid rgba(140,190,255,0.28)",
                      background: "rgba(120,190,255,0.12)",
                      color: "white",
                      padding: "0 14px",
                      fontSize: 12,
                      fontWeight: 800,
                      cursor: canRunCleanup ? "pointer" : "not-allowed",
                      opacity: canRunCleanup ? 1 : 0.55,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {cleanupButtonLabel}
                  </button>
                </div>
              </div>
              <div style={{ display: "grid", gap: 10 }}>
                {[
                  {
                    checked: unloadHiddenData,
                    setChecked: setUnloadHiddenData,
                    label: "Unload hidden layer data",
                    description:
                      summary.hiddenCacheBytes > 0
                        ? `${summary.hiddenLayerCount} hidden layer${summary.hiddenLayerCount === 1 ? "" : "s"} can release about ${formatBytes(summary.hiddenCacheBytes)} from cache.`
                        : "No hidden cached layer data is currently available to release.",
                  },
                  {
                    checked: clearHistory,
                    setChecked: setClearHistory,
                    label: "Trim undo history",
                    description:
                      summary.historyBytes > 0
                        ? `Undo/redo history is using about ${formatBytes(summary.historyBytes)} in browser storage.`
                        : "Undo/redo history is already minimal.",
                  },
                  {
                    checked: unloadAssistant,
                    setChecked: setUnloadAssistant,
                    label: "Unload assistant model",
                    description: summary.assistantLoaded
                      ? "The local assistant model is loaded and can be released to free memory."
                      : "The local assistant model is not currently loaded.",
                  },
                ].map((option) => (
                  <label
                    key={option.label}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "18px minmax(0, 1fr)",
                      gap: 10,
                      alignItems: "start",
                      borderRadius: 12,
                      border: "1px solid rgba(255,255,255,0.08)",
                      background: "rgba(255,255,255,0.03)",
                      padding: 10,
                      cursor: "pointer",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={option.checked}
                      onChange={(event) => option.setChecked(event.target.checked)}
                      style={{ marginTop: 2 }}
                    />
                    <span style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: "white" }}>{option.label}</div>
                      <div style={{ marginTop: 4, fontSize: 11, lineHeight: 1.45, color: "rgba(255,255,255,0.60)" }}>
                        {option.description}
                      </div>
                    </span>
                  </label>
                ))}
              </div>
            </div>

            {summary.notes.length > 0 ? (
              <div
                style={{
                  borderRadius: 16,
                  border: "1px solid rgba(255,255,255,0.10)",
                  background: "rgba(255,255,255,0.04)",
                  padding: 14,
                  display: "grid",
                  gap: 8,
                }}
              >
                <div style={{ fontSize: 13, fontWeight: 800 }}>Notes</div>
                {summary.notes.map((note) => (
                  <div key={note} style={{ fontSize: 11, lineHeight: 1.5, color: "rgba(255,255,255,0.64)" }}>
                    {note}
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
