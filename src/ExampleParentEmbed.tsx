import { useMemo, useRef, useState } from "react";
import {
  createAllenViewerEmbedApi,
  type AllenViewerEmbedApi,
} from "./viewerEmbedApi";
import type { ViewerStateV1 } from "./viewerState";

const VIEWER_ORIGIN = "http://localhost:5173";
const VIEWER_IFRAME_SRC = `${VIEWER_ORIGIN}/`;

const DEMO_STATE: ViewerStateV1 = {
  version: 1,
  layout: {
    layerPanelCollapsed: false,
  },
  camera: {
    mode: "fly",
    position: [0, 0, 5],
    yaw: -90,
    pitch: 0,
    fovDeg: 60,
  },
  scene: {
    activeTool: "mouse",
    selectedNodeId: "allen-average-volume",
    layerTree: [
      {
        id: "reference-data",
        kind: "group",
        name: "Reference Data",
        visible: true,
        expanded: true,
        children: [
          {
            id: "base-square",
            kind: "layer",
            name: "Base Slice Plane",
            type: "primitive",
            visible: true,
            source: "built-in",
            sourceKind: "built-in",
          },
        ],
      },
      {
        id: "allen-average-volume",
        kind: "layer",
        name: "Allen Average Mouse Brain",
        type: "remote",
        visible: true,
        source: "https://storage.googleapis.com/sbh-assistant-data/allen_average_template.ome.zarr/",
        sourceKind: "external",
        description: "Built-in Allen average mouse brain volume",
        remoteFormat: "ome-zarr",
        renderMode: "volume",
      },
      {
        id: "debug-slice-1",
        kind: "layer",
        name: "Top-1 Predicted Slice",
        type: "custom-slice",
        visible: true,
        source: { volumeLayerId: "allen-average-volume" },
        sourceKind: "built-in",
        description: "Debug top-1 slice",
        sliceParams: {
          mode: "oblique",
          normal: {
            x: -0.9477945559013159,
            y: 0.06347621445882563,
            z: -0.3124999999996875,
          },
          offset: -128.09146767364973,
          width: 256,
          height: 256,
          opacity: 1,
        },
      },
    ],
  },
  ui: {
    sliceVolumeLayerId: "allen-average-volume",
    sliceName: "Top-1 Predicted Slice",
    sliceParamsDraft: {
      mode: "oblique",
      normal: {
        x: -0.9477945559013159,
        y: 0.06347621445882563,
        z: -0.3124999999996875,
      },
      offset: -128.09146767364973,
      width: 256,
      height: 256,
      opacity: 1,
    },
  },
};

export default function ExampleParentEmbed() {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [status, setStatus] = useState("Idle");
  const [stateJson, setStateJson] = useState(
    JSON.stringify(DEMO_STATE, null, 2)
  );

  const api: AllenViewerEmbedApi | null = useMemo(() => {
    if (!iframeRef.current) return null;
    return createAllenViewerEmbedApi({
      iframe: iframeRef.current,
      targetOrigin: VIEWER_ORIGIN,
      timeoutMs: 8000,
    });
  }, [iframeRef.current]);

  async function handlePing() {
    try {
      setStatus("Checking iframe API...");
      if (!api) throw new Error("Iframe API not ready.");
      const result = await api.ping();
      setStatus(`Viewer replied: ${result}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Ping failed.");
    }
  }

  async function handleLoadState() {
    try {
      setStatus("Sending state to iframe viewer...");
      if (!api) throw new Error("Iframe API not ready.");
      const parsed = JSON.parse(stateJson) as ViewerStateV1;
      await api.setState(parsed);
      setStatus("Viewer state loaded into iframe.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Failed to load state.");
    }
  }

  async function handleReadState() {
    try {
      setStatus("Reading state from iframe viewer...");
      if (!api) throw new Error("Iframe API not ready.");
      const state = await api.getState();
      setStateJson(JSON.stringify(state, null, 2));
      setStatus("Viewer state read successfully.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Failed to read state.");
    }
  }

  async function handleCollapsePanel(collapsed: boolean) {
    try {
      setStatus(collapsed ? "Collapsing layout panel..." : "Opening layout panel...");
      if (!api) throw new Error("Iframe API not ready.");
      await api.setLayoutCollapsed(collapsed);
      setStatus(collapsed ? "Layout panel collapsed." : "Layout panel opened.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Failed to update layout.");
    }
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#0b0f14",
        color: "white",
        fontFamily: "Inter, system-ui, sans-serif",
        display: "grid",
        gridTemplateColumns: "420px 1fr",
      }}
    >
      <aside
        style={{
          borderRight: "1px solid rgba(255,255,255,0.08)",
          padding: 20,
          boxSizing: "border-box",
          display: "flex",
          flexDirection: "column",
          gap: 14,
        }}
      >
        <div>
          <div style={{ fontSize: 22, fontWeight: 800 }}>External Embed Debug</div>
          <div style={{ fontSize: 13, opacity: 0.72, marginTop: 8, lineHeight: 1.5 }}>
            This page lives at <code>/externalembedding</code> and drives the viewer loaded in the iframe at <code>{VIEWER_IFRAME_SRC}</code>.
          </div>
        </div>

        <div
          style={{
            padding: 12,
            borderRadius: 14,
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.08)",
            fontSize: 12,
            lineHeight: 1.5,
          }}
        >
          <div style={{ fontWeight: 700, marginBottom: 6 }}>Status</div>
          <div>{status}</div>
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button type="button" onClick={handlePing} style={buttonStyle}>
            Ping iframe API
          </button>
          <button type="button" onClick={handleLoadState} style={buttonStyle}>
            Load state into iframe
          </button>
          <button type="button" onClick={handleReadState} style={buttonStyle}>
            Read state from iframe
          </button>
          <button
            type="button"
            onClick={() => handleCollapsePanel(true)}
            style={buttonStyle}
          >
            Collapse panel
          </button>
          <button
            type="button"
            onClick={() => handleCollapsePanel(false)}
            style={buttonStyle}
          >
            Open panel
          </button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 8, minHeight: 0, flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 700 }}>Viewer state JSON</div>
          <textarea
            value={stateJson}
            onChange={(e) => setStateJson(e.target.value)}
            spellCheck={false}
            style={{
              flex: 1,
              minHeight: 320,
              resize: "vertical",
              borderRadius: 14,
              border: "1px solid rgba(255,255,255,0.10)",
              background: "rgba(255,255,255,0.04)",
              color: "white",
              padding: 12,
              fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
              fontSize: 12,
              lineHeight: 1.45,
              boxSizing: "border-box",
            }}
          />
        </div>
      </aside>

      <main style={{ padding: 16, boxSizing: "border-box", minWidth: 0 }}>
        <iframe
          ref={iframeRef}
          title="Allen viewer iframe debug"
          src={VIEWER_IFRAME_SRC}
          style={{
            width: "100%",
            height: "calc(100vh - 32px)",
            border: "1px solid rgba(255,255,255,0.10)",
            borderRadius: 18,
            background: "#05070a",
          }}
        />
      </main>
    </div>
  );
}

const buttonStyle: React.CSSProperties = {
  height: 36,
  padding: "0 12px",
  borderRadius: 10,
  border: "1px solid rgba(160,220,255,0.35)",
  background: "rgba(120,190,255,0.16)",
  color: "white",
  cursor: "pointer",
  fontWeight: 600,
};
