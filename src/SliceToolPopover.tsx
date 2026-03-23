import type { SlicePlane } from "./layerTypes";

type AxisSliceParams = {
  mode?: "axis";
  plane: SlicePlane;
  index: number;
  opacity?: number;
};

type ObliqueSliceParams = {
  mode: "oblique";
  normal: {
    x: number;
    y: number;
    z: number;
  };
  offset?: number;
  width?: number;
  height?: number;
  opacity?: number;
};

type SliceParams = AxisSliceParams | ObliqueSliceParams;

function rowStyle(): React.CSSProperties {
  return {
    display: "flex",
    alignItems: "center",
    gap: 10,
    marginBottom: 10,
  };
}

function labelStyle(width = 88): React.CSSProperties {
  return {
    width,
    fontSize: 13,
    color: "rgba(255,255,255,0.82)",
    flexShrink: 0,
  };
}

function inputStyle(): React.CSSProperties {
  return {
    width: "100%",
    background: "rgba(255,255,255,0.06)",
    color: "white",
    border: "1px solid rgba(255,255,255,0.12)",
    borderRadius: 10,
    padding: "8px 10px",
    outline: "none",
  };
}

function buttonStyle(active: boolean): React.CSSProperties {
  return {
    padding: "8px 10px",
    borderRadius: 10,
    border: active
      ? "1px solid rgba(120,200,255,0.85)"
      : "1px solid rgba(255,255,255,0.10)",
    background: active
      ? "rgba(80,160,255,0.20)"
      : "rgba(255,255,255,0.04)",
    color: active ? "#9bd3ff" : "rgba(255,255,255,0.92)",
    cursor: "pointer",
  };
}

function normalizeNormal(n: { x: number; y: number; z: number }) {
  const len = Math.sqrt(n.x * n.x + n.y * n.y + n.z * n.z);
  if (len < 1e-8) {
    return { x: 0, y: 0, z: 1 };
  }
  return {
    x: n.x / len,
    y: n.y / len,
    z: n.z / len,
  };
}

export default function SliceToolPopover({
  value,
  onChange,
}: {
  value: SliceParams;
  onChange: (next: SliceParams) => void;
}) {
  const isOblique = value.mode === "oblique";

  const oblique =
    value.mode === "oblique"
      ? value
      : {
          mode: "oblique" as const,
          normal: { x: 0, y: 0, z: 1 },
          offset: 0,
          width: 256,
          height: 256,
          opacity: value.opacity ?? 0.95,
        };

  const axis =
    value.mode === "oblique"
      ? {
          mode: "axis" as const,
          plane: "xy" as SlicePlane,
          index: 0,
          opacity: value.opacity ?? 0.95,
        }
      : {
          mode: "axis" as const,
          plane: value.plane,
          index: value.index,
          opacity: value.opacity ?? 0.95,
        };

  function setObliqueNormalPart(
    key: "x" | "y" | "z",
    raw: number
  ) {
    const nextNormal = {
      ...oblique.normal,
      [key]: Number.isFinite(raw) ? raw : 0,
    };

    onChange({
      ...oblique,
      normal: nextNormal,
    });
  }

  function applyPreset(normal: { x: number; y: number; z: number }) {
    onChange({
      ...oblique,
      mode: "oblique",
      normal: normalizeNormal(normal),
    });
  }

  return (
    <div>
      <div
        style={{
          fontSize: 14,
          fontWeight: 600,
          marginBottom: 12,
          color: "white",
        }}
      >
        Slice Controls
      </div>

      <div style={{ ...rowStyle(), marginBottom: 14 }}>
        <button
          type="button"
          style={buttonStyle(!isOblique)}
          onClick={() => onChange(axis)}
        >
          Axis Slice
        </button>
        <button
          type="button"
          style={buttonStyle(isOblique)}
          onClick={() => onChange(oblique)}
        >
          Custom Orientation
        </button>
      </div>

      {!isOblique ? (
        <>
          <div style={rowStyle()}>
            <div style={labelStyle()}>Plane</div>
            <div style={{ display: "flex", gap: 8 }}>
              {(["xy", "xz", "yz"] as SlicePlane[]).map((plane) => (
                <button
                  key={plane}
                  type="button"
                  style={buttonStyle(axis.plane === plane)}
                  onClick={() =>
                    onChange({
                      ...axis,
                      plane,
                    })
                  }
                >
                  {plane.toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          <div style={rowStyle()}>
            <div style={labelStyle()}>Index</div>
            <input
              type="number"
              value={axis.index}
              onChange={(e) =>
                onChange({
                  ...axis,
                  index: Number(e.target.value),
                })
              }
              style={inputStyle()}
            />
          </div>

          <div style={rowStyle()}>
            <div style={labelStyle()}>Opacity</div>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={axis.opacity ?? 0.95}
              onChange={(e) =>
                onChange({
                  ...axis,
                  opacity: Number(e.target.value),
                })
              }
              style={{ width: "100%" }}
            />
          </div>
        </>
      ) : (
        <>
          <div style={rowStyle()}>
            <div style={labelStyle()}>Presets</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              <button
                type="button"
                style={buttonStyle(false)}
                onClick={() => applyPreset({ x: 0, y: 0, z: 1 })}
              >
                XY
              </button>
              <button
                type="button"
                style={buttonStyle(false)}
                onClick={() => applyPreset({ x: 0, y: 1, z: 0 })}
              >
                XZ
              </button>
              <button
                type="button"
                style={buttonStyle(false)}
                onClick={() => applyPreset({ x: 1, y: 0, z: 0 })}
              >
                YZ
              </button>
              <button
                type="button"
                style={buttonStyle(false)}
                onClick={() => applyPreset({ x: 1, y: 1, z: 1 })}
              >
                Diagonal
              </button>
            </div>
          </div>

          <div style={rowStyle()}>
            <div style={labelStyle()}>Normal X</div>
            <input
              type="number"
              step="0.1"
              value={oblique.normal.x}
              onChange={(e) => setObliqueNormalPart("x", Number(e.target.value))}
              style={inputStyle()}
            />
          </div>

          <div style={rowStyle()}>
            <div style={labelStyle()}>Normal Y</div>
            <input
              type="number"
              step="0.1"
              value={oblique.normal.y}
              onChange={(e) => setObliqueNormalPart("y", Number(e.target.value))}
              style={inputStyle()}
            />
          </div>

          <div style={rowStyle()}>
            <div style={labelStyle()}>Normal Z</div>
            <input
              type="number"
              step="0.1"
              value={oblique.normal.z}
              onChange={(e) => setObliqueNormalPart("z", Number(e.target.value))}
              style={inputStyle()}
            />
          </div>

          <div style={rowStyle()}>
            <div style={labelStyle()}>Offset</div>
            <input
              type="number"
              step="1"
              value={oblique.offset ?? 0}
              onChange={(e) =>
                onChange({
                  ...oblique,
                  offset: Number(e.target.value),
                })
              }
              style={inputStyle()}
            />
          </div>

          <div style={rowStyle()}>
            <div style={labelStyle()}>Width</div>
            <input
              type="number"
              step="1"
              value={oblique.width ?? 256}
              onChange={(e) =>
                onChange({
                  ...oblique,
                  width: Number(e.target.value),
                })
              }
              style={inputStyle()}
            />
          </div>

          <div style={rowStyle()}>
            <div style={labelStyle()}>Height</div>
            <input
              type="number"
              step="1"
              value={oblique.height ?? 256}
              onChange={(e) =>
                onChange({
                  ...oblique,
                  height: Number(e.target.value),
                })
              }
              style={inputStyle()}
            />
          </div>

          <div style={rowStyle()}>
            <div style={labelStyle()}>Opacity</div>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={oblique.opacity ?? 0.95}
              onChange={(e) =>
                onChange({
                  ...oblique,
                  opacity: Number(e.target.value),
                })
              }
              style={{ width: "100%" }}
            />
          </div>
        </>
      )}
    </div>
  );
}