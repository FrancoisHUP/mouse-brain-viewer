import type { ReactNode } from 'react';
import type { LayerItemNode, LayerTreeNode, AnnotationShape, NodeTransform, IntensityWindow } from '../../layerTypes';
import type { SelectedLayerRuntimeInfo } from '../../WebGLCanvas';
import { MetadataRichContent } from './MetadataRichContent';

type AnnotationDraftSettings = {
  shape: AnnotationShape;
  color: string;
  opacity: number;
  size: number;
  depth: number;
  eraseMode: 'all' | 'color';
};

function readTransformVector(
  value: number[] | undefined,
  fallback: [number, number, number]
): [number, number, number] {
  return [
    Number.isFinite(value?.[0]) ? Number(value![0]) : fallback[0],
    Number.isFinite(value?.[1]) ? Number(value![1]) : fallback[1],
    Number.isFinite(value?.[2]) ? Number(value![2]) : fallback[2],
  ];
}

function ResetIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 12a9 9 0 1 0 3-6.7" />
      <path d="M3 4v5h5" />
    </svg>
  );
}

function Section({
  title,
  children,
  actions,
}: {
  title: string;
  children: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div
      data-theme-surface="soft"
      style={{
        borderRadius: 12,
        border: '1px solid rgba(255,255,255,0.08)',
        padding: 12,
        display: 'grid',
        gap: 10,
        minWidth: 0,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 10,
          minWidth: 0,
        }}
      >
        <div style={{ fontSize: 13, fontWeight: 700, minWidth: 0 }}>{title}</div>
        {actions ? <div style={{ flex: '0 0 auto' }}>{actions}</div> : null}
      </div>
      {children}
    </div>
  );
}

function NumberField({
  label,
  value,
  step = 0.01,
  onChange,
}: {
  label: string;
  value: number;
  step?: number;
  onChange: (value: number) => void;
}) {
  return (
    <label style={{ display: 'grid', gap: 6, minWidth: 0 }}>
      <span data-theme-text="muted" style={{ fontSize: 11, fontWeight: 600, letterSpacing: 0.2 }}>
        {label}
      </span>
      <input
        type="number"
        value={Number.isFinite(value) ? value : 0}
        step={step}
        onChange={(event) => onChange(Number(event.target.value))}
        style={{
          height: 34,
          padding: '0 10px',
          borderRadius: 10,
          border: '1px solid rgba(255,255,255,0.10)',
          background: 'rgba(255,255,255,0.04)',
          color: 'inherit',
          width: '100%',
          minWidth: 0,
          boxSizing: 'border-box',
        }}
      />
    </label>
  );
}

function DualRangeSlider({
  min,
  max,
  step = 0.01,
  valueMin,
  valueMax,
  onChange,
}: {
  min: number;
  max: number;
  step?: number;
  valueMin: number;
  valueMax: number;
  onChange: (next: IntensityWindow) => void;
}) {
  const range = Math.max(max - min, 0.0001);
  const startPercent = ((valueMin - min) / range) * 100;
  const endPercent = ((valueMax - min) / range) * 100;

  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <style>{`
        .dual-range-slider{
          -webkit-appearance:none;
          appearance:none;
          height:22px;
          outline:none;
          pointer-events:none;
        }
        .dual-range-slider::-webkit-slider-runnable-track{
          height:6px;
          background:transparent;
          border:none;
        }
        .dual-range-slider::-moz-range-track{
          height:6px;
          background:transparent;
          border:none;
        }
        .dual-range-slider::-webkit-slider-thumb{
          -webkit-appearance:none;
          appearance:none;
          width:14px;
          height:14px;
          border-radius:999px;
          border:1px solid rgba(255,255,255,0.55);
          background:#dff3ff;
          box-shadow:0 0 0 3px rgba(120,200,255,0.18);
          cursor:pointer;
          margin-top:-4px;
          pointer-events:auto;
        }
        .dual-range-slider::-moz-range-thumb{
          width:14px;
          height:14px;
          border-radius:999px;
          border:1px solid rgba(255,255,255,0.55);
          background:#dff3ff;
          box-shadow:0 0 0 3px rgba(120,200,255,0.18);
          cursor:pointer;
          pointer-events:auto;
        }
      `}</style>
      <div style={{ position: 'relative', height: 22, display: 'flex', alignItems: 'center' }}>
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            height: 6,
            borderRadius: 999,
            background: 'rgba(255,255,255,0.10)',
          }}
        />
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            left: `${startPercent}%`,
            width: `${Math.max(endPercent - startPercent, 0)}%`,
            height: 6,
            borderRadius: 999,
            background: 'linear-gradient(90deg, rgba(120,200,255,0.72), rgba(170,230,255,0.96))',
            boxShadow: '0 0 0 1px rgba(255,255,255,0.08)',
          }}
        />
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={valueMin}
          onChange={(event) =>
            onChange({
              min: Math.min(Number(event.target.value), valueMax - step),
              max: valueMax,
            })
          }
          className="dual-range-slider"
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            width: '100%',
            margin: 0,
            background: 'transparent',
          }}
        />
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={valueMax}
          onChange={(event) =>
            onChange({
              min: valueMin,
              max: Math.max(Number(event.target.value), valueMin + step),
            })
          }
          className="dual-range-slider"
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            width: '100%',
            margin: 0,
            background: 'transparent',
          }}
        />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 11, opacity: 0.72 }}>
        <span>Min {valueMin.toFixed(2)}</span>
        <span>Max {valueMax.toFixed(2)}</span>
      </div>
    </div>
  );
}

function SingleRangeSlider({
  min,
  max,
  step = 0.01,
  value,
  onChange,
  valueLabel,
}: {
  min: number;
  max: number;
  step?: number;
  value: number;
  onChange: (value: number) => void;
  valueLabel: string;
}) {
  const range = Math.max(max - min, 0.0001);
  const fillPercent = ((value - min) / range) * 100;

  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <div style={{ position: 'relative', height: 22, display: 'flex', alignItems: 'center' }}>
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            height: 6,
            borderRadius: 999,
            background: 'rgba(255,255,255,0.10)',
          }}
        />
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            left: 0,
            width: `${Math.max(fillPercent, 0)}%`,
            height: 6,
            borderRadius: 999,
            background: 'linear-gradient(90deg, rgba(120,200,255,0.72), rgba(170,230,255,0.96))',
            boxShadow: '0 0 0 1px rgba(255,255,255,0.08)',
          }}
        />
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(event) => onChange(Number(event.target.value))}
          className="dual-range-slider"
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            width: '100%',
            margin: 0,
            background: 'transparent',
            pointerEvents: 'auto',
          }}
        />
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, fontSize: 11, opacity: 0.72 }}>
        <span>{valueLabel}</span>
      </div>
    </div>
  );
}

function TransformEditor({
  transform,
  onUpdate,
  onReset,
}: {
  transform: NodeTransform | undefined;
  onUpdate: (patch: Partial<NodeTransform>) => void;
  onReset: () => void;
}) {
  const translation = readTransformVector(transform?.translation, [0, 0, 0]);
  const rotation = readTransformVector(transform?.rotation, [0, 0, 0]);
  const scale = readTransformVector(transform?.scale, [1, 1, 1]);

  return (
    <Section
      title="Transform"
      actions={
        <button
          type="button"
          onClick={onReset}
          title="Reset transform"
          aria-label="Reset transform"
          style={{
            height: 30,
            padding: '0 10px',
            borderRadius: 10,
            border: '1px solid rgba(255,255,255,0.10)',
            background: 'rgba(255,255,255,0.04)',
            color: 'inherit',
            cursor: 'pointer',
            whiteSpace: 'nowrap',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
          }}
        >
          <ResetIcon />
          <span>Reset</span>
        </button>
      }
    >
      <div style={{ display: 'grid', gap: 8 }}>
        <div data-theme-text="muted" style={{ fontSize: 11, fontWeight: 600, letterSpacing: 0.2 }}>
          Position
        </div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
            gap: 8,
            minWidth: 0,
            width: '100%',
          }}
        >
          <NumberField
            label="X"
            value={translation[0]}
            step={0.01}
            onChange={(value) => onUpdate({ translation: [value, translation[1], translation[2]] })}
          />
          <NumberField
            label="Y"
            value={translation[1]}
            step={0.01}
            onChange={(value) => onUpdate({ translation: [translation[0], value, translation[2]] })}
          />
          <NumberField
            label="Z"
            value={translation[2]}
            step={0.01}
            onChange={(value) => onUpdate({ translation: [translation[0], translation[1], value] })}
          />
        </div>
      </div>

      <div style={{ display: 'grid', gap: 8 }}>
        <div data-theme-text="muted" style={{ fontSize: 11, fontWeight: 600, letterSpacing: 0.2 }}>
          Rotation (deg)
        </div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
            gap: 8,
            minWidth: 0,
            width: '100%',
          }}
        >
          <NumberField
            label="X"
            value={rotation[0]}
            step={1}
            onChange={(value) => onUpdate({ rotation: [value, rotation[1], rotation[2]] })}
          />
          <NumberField
            label="Y"
            value={rotation[1]}
            step={1}
            onChange={(value) => onUpdate({ rotation: [rotation[0], value, rotation[2]] })}
          />
          <NumberField
            label="Z"
            value={rotation[2]}
            step={1}
            onChange={(value) => onUpdate({ rotation: [rotation[0], rotation[1], value] })}
          />
        </div>
      </div>

      <div style={{ display: 'grid', gap: 8 }}>
        <div data-theme-text="muted" style={{ fontSize: 11, fontWeight: 600, letterSpacing: 0.2 }}>
          Scale
        </div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
            gap: 8,
            minWidth: 0,
            width: '100%',
          }}
        >
          <NumberField
            label="X"
            value={scale[0]}
            step={0.01}
            onChange={(value) => onUpdate({ scale: [value, scale[1], scale[2]] })}
          />
          <NumberField
            label="Y"
            value={scale[1]}
            step={0.01}
            onChange={(value) => onUpdate({ scale: [scale[0], value, scale[2]] })}
          />
          <NumberField
            label="Z"
            value={scale[2]}
            step={0.01}
            onChange={(value) => onUpdate({ scale: [scale[0], scale[1], value] })}
          />
        </div>
      </div>
    </Section>
  );
}

export default function LayerInspectorPanel({
  selectedNode,
  selectedAnnotation,
  selectedLayerRuntimeInfo,
  annotationDraft,
  isInspectorCollapsed,
  onToggleCollapsed,
  onRenameNode,
  onUpdateSelectedNodeOpacity,
  onUpdateSelectedNodeIntensityWindow,
  onUpdateSelectedNodeTransform,
  onResetSelectedNodeTransform,
  onUpdateSelectedAnnotationLayer,
  onOpenMetadataWindow,
}: {
  selectedNode: LayerTreeNode | null;
  selectedAnnotation: LayerItemNode['annotation'] | null;
  selectedLayerRuntimeInfo: SelectedLayerRuntimeInfo | null;
  annotationDraft: AnnotationDraftSettings;
  isInspectorCollapsed: boolean;
  onToggleCollapsed: () => void;
  onRenameNode: (nodeId: string, newName: string) => void;
  onUpdateSelectedNodeOpacity: (opacity: number) => void;
  onUpdateSelectedNodeIntensityWindow: (window: IntensityWindow) => void;
  onUpdateSelectedNodeTransform: (patch: Partial<NodeTransform>) => void;
  onResetSelectedNodeTransform: () => void;
  onUpdateSelectedAnnotationLayer: (patch: Partial<NonNullable<LayerItemNode['annotation']>>) => void;
  onOpenMetadataWindow: () => void;
}) {
  const selectedAnnotationLayer =
    selectedNode && selectedNode.kind === 'layer' && selectedNode.type === 'annotation'
      ? selectedNode
      : null;
  const isNoteAnnotation = selectedAnnotation?.shape === 'note';

  const selectedOpacity = Math.max(0, Math.min(1, selectedNode?.opacity ?? 1));
  const selectedIntensityWindow = {
    min: Math.max(0, Math.min(1, selectedNode?.intensityWindow?.min ?? 0)),
    max: Math.max(0, Math.min(1, selectedNode?.intensityWindow?.max ?? 1)),
  };
  const canAdjustIntensityWindow =
    selectedNode?.kind === 'layer' &&
    (
      selectedNode.type === 'custom-slice' ||
      selectedNode.localDataKind === 'volume' ||
      (
        selectedNode.type === 'remote' &&
        selectedNode.remoteFormat === 'ome-zarr' &&
        selectedNode.remoteContentKind !== 'annotation'
      )
    );

  void isInspectorCollapsed;
  void onToggleCollapsed;

  return (
    <div
      style={{
        width: '100%',
        minWidth: 0,
        overflow: 'visible',
        fontFamily: 'sans-serif',
      }}
    >
      <div style={{ display: 'grid', gap: 12, minWidth: 0 }}>
        {selectedNode ? (
          <>
            <label style={{ display: 'grid', gap: 6, minWidth: 0 }}>
              <input
                value={selectedNode.name}
                onChange={(event) => onRenameNode(selectedNode.id, event.target.value)}
                style={{
                  height: 34,
                  padding: '0 10px',
                  borderRadius: 10,
                  border: '1px solid rgba(255,255,255,0.10)',
                  background: 'rgba(255,255,255,0.04)',
                  color: 'inherit',
                  width: '100%',
                  minWidth: 0,
                  boxSizing: 'border-box',
                }}
              />
            </label>

            <Section title="Appearance">
              <div style={{ display: 'grid', gap: 6 }}>
                <span data-theme-text="muted" style={{ fontSize: 11, fontWeight: 600, letterSpacing: 0.2 }}>
                  Opacity
                </span>
                <SingleRangeSlider
                  min={0}
                  max={1}
                  step={0.01}
                  value={selectedOpacity}
                  onChange={onUpdateSelectedNodeOpacity}
                  valueLabel={`${Math.round(selectedOpacity * 100)}%`}
                />
                {canAdjustIntensityWindow ? (
                  <>
                    <span data-theme-text="muted" style={{ fontSize: 11, fontWeight: 600, letterSpacing: 0.2 }}>
                      Intensity range
                    </span>
                    <DualRangeSlider
                      min={0}
                      max={1}
                      step={0.01}
                      valueMin={selectedIntensityWindow.min}
                      valueMax={selectedIntensityWindow.max}
                      onChange={onUpdateSelectedNodeIntensityWindow}
                    />
                  </>
                ) : null}
              </div>
            </Section>

            <TransformEditor
              transform={selectedNode.transform}
              onUpdate={onUpdateSelectedNodeTransform}
              onReset={onResetSelectedNodeTransform}
            />

            {selectedAnnotationLayer ? (
              <Section title={isNoteAnnotation ? 'Note' : 'Annotation style'}>
                {!isNoteAnnotation ? (
                  <div style={{ display: 'grid', gap: 6 }}>
                    <span data-theme-text="muted" style={{ fontSize: 11, fontWeight: 600, letterSpacing: 0.2 }}>
                      Color
                    </span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <input
                        type="color"
                        value={selectedAnnotation?.color ?? annotationDraft.color}
                        onChange={(event) => onUpdateSelectedAnnotationLayer({ color: event.target.value })}
                        style={{
                          width: 40,
                          height: 34,
                          padding: 0,
                          border: 'none',
                          background: 'transparent',
                          cursor: 'pointer',
                        }}
                      />
                      {selectedAnnotation?.shape !== 'freehand' ? (
                        <>
                          <input
                            type="range"
                            min={0}
                            max={1}
                            step={0.01}
                            value={selectedAnnotation?.opacity ?? annotationDraft.opacity}
                            onChange={(event) => onUpdateSelectedAnnotationLayer({ opacity: Number(event.target.value) })}
                            style={{ flex: 1 }}
                          />
                          <span style={{ fontSize: 11, minWidth: 36, textAlign: 'right', opacity: 0.72 }}>
                            {Math.round((selectedAnnotation?.opacity ?? annotationDraft.opacity) * 100)}%
                          </span>
                        </>
                      ) : (
                        <span data-theme-text="muted" style={{ fontSize: 11, opacity: 0.72 }}>
                          This layer keeps all strokes in one color.
                        </span>
                      )}
                    </div>
                  </div>
                ) : null}

                {!isNoteAnnotation &&
                selectedAnnotation?.shape !== 'rectangle' &&
                selectedAnnotation?.shape !== 'circle' &&
                selectedAnnotation?.shape !== 'freehand' ? (
                  <label style={{ display: 'grid', gap: 6, minWidth: 0 }}>
                    <span data-theme-text="muted" style={{ fontSize: 11, fontWeight: 600, letterSpacing: 0.2 }}>
                      Size
                    </span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <input
                        type="range"
                        min={0.01}
                        max={0.3}
                        step={0.005}
                        value={selectedAnnotation?.size ?? annotationDraft.size}
                        onChange={(event) => onUpdateSelectedAnnotationLayer({ size: Number(event.target.value) })}
                        style={{ flex: 1 }}
                      />
                      <span style={{ fontSize: 11, minWidth: 42, textAlign: 'right', opacity: 0.72 }}>
                        {(selectedAnnotation?.size ?? annotationDraft.size).toFixed(3)}
                      </span>
                    </div>
                  </label>
                ) : null}

                <div style={{ display: 'grid', gap: 8, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                    <span data-theme-text="muted" style={{ fontSize: 11, fontWeight: 600, letterSpacing: 0.2 }}>
                      Metadata
                    </span>
                    <button
                      type="button"
                      onClick={onOpenMetadataWindow}
                      style={{
                        height: 30,
                        padding: '0 10px',
                        borderRadius: 8,
                        border: '1px solid rgba(160,220,255,0.22)',
                        background: 'rgba(120,190,255,0.10)',
                        color: 'inherit',
                        cursor: 'pointer',
                        fontSize: 11,
                        fontWeight: 700,
                      }}
                    >
                      Open editor
                    </button>
                  </div>
                  <textarea
                    value={selectedAnnotation?.metadata ?? ''}
                    onChange={(event) => onUpdateSelectedAnnotationLayer({ metadata: event.target.value })}
                    rows={4}
                    style={{
                      resize: 'vertical',
                      minHeight: 82,
                      padding: 10,
                      borderRadius: 10,
                      border: '1px solid rgba(255,255,255,0.10)',
                      background: 'rgba(255,255,255,0.04)',
                      color: 'inherit',
                      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
                      fontSize: 12,
                      lineHeight: 1.45,
                    }}
                  />
                  <div
                    data-theme-surface="soft"
                    style={{
                      maxHeight: 180,
                      overflow: 'auto',
                      borderRadius: 10,
                      border: '1px solid rgba(255,255,255,0.08)',
                      padding: 10,
                      background: 'rgba(255,255,255,0.035)',
                    }}
                  >
                    <MetadataRichContent value={selectedAnnotation?.metadata ?? ''} />
                  </div>
                </div>
              </Section>
            ) : selectedNode.kind === 'layer' ? (
              <div style={{ display: 'grid', gap: 10 }}>
                <Section title="Source information">
                  <div style={{ fontSize: 12, lineHeight: 1.55, display: 'grid', gap: 8 }}>
                    <div>
                      <strong>Type:</strong>{' '}
                      {selectedLayerRuntimeInfo?.sourceType ??
                        (selectedNode.type === 'remote'
                          ? 'Remote layer'
                          : selectedNode.type === 'custom-slice'
                          ? 'Custom slice'
                          : selectedNode.type === 'file'
                          ? 'Uploaded file'
                          : 'Primitive')}
                    </div>
                    <div>
                      <strong>Description:</strong> {selectedNode.description ?? '—'}
                    </div>
                    {selectedLayerRuntimeInfo?.sourceName ? (
                      <div>
                        <strong>Source name:</strong> {selectedLayerRuntimeInfo.sourceName}
                      </div>
                    ) : null}
                    {selectedLayerRuntimeInfo?.sourcePath ? (
                      <div style={{ wordBreak: 'break-all' }}>
                        <strong>Source path:</strong> {selectedLayerRuntimeInfo.sourcePath}
                      </div>
                    ) : typeof selectedNode.source === 'string' ? (
                      <div style={{ wordBreak: 'break-all' }}>
                        <strong>Source path:</strong> {selectedNode.source}
                      </div>
                    ) : null}
                  </div>
                </Section>

                {selectedLayerRuntimeInfo?.requestedResolutionUm != null ||
                selectedLayerRuntimeInfo?.dims ||
                selectedLayerRuntimeInfo?.datasetPath ||
                selectedLayerRuntimeInfo?.rawShape ? (
                  <Section title="Loaded dataset">
                    <div style={{ fontSize: 12, lineHeight: 1.55, display: 'grid', gap: 8 }}>
                      {selectedLayerRuntimeInfo?.requestedResolutionUm != null ? (
                        <div>
                          <strong>Requested resolution:</strong> {selectedLayerRuntimeInfo.requestedResolutionUm} µm
                        </div>
                      ) : null}
                      {selectedLayerRuntimeInfo?.resolvedResolutionUm != null ? (
                        <div>
                          <strong>Resolved resolution:</strong> {selectedLayerRuntimeInfo.resolvedResolutionUm} µm
                        </div>
                      ) : null}
                      {selectedLayerRuntimeInfo?.datasetIndex != null ? (
                        <div>
                          <strong>Dataset index:</strong> {selectedLayerRuntimeInfo.datasetIndex}
                        </div>
                      ) : null}
                      {selectedLayerRuntimeInfo?.datasetPath ? (
                        <div style={{ wordBreak: 'break-all' }}>
                          <strong>OME-Zarr path:</strong> {selectedLayerRuntimeInfo.datasetPath}
                        </div>
                      ) : null}
                      {selectedLayerRuntimeInfo?.voxelSizeUm ? (
                        <div>
                          <strong>Voxel size (z,y,x):</strong> {selectedLayerRuntimeInfo.voxelSizeUm.z ?? '?'},{' '}
                          {selectedLayerRuntimeInfo.voxelSizeUm.y ?? '?'},{' '}
                          {selectedLayerRuntimeInfo.voxelSizeUm.x ?? '?'} µm
                        </div>
                      ) : null}
                      {selectedLayerRuntimeInfo?.dims ? (
                        <div>
                          <strong>Dims (z,y,x):</strong> {selectedLayerRuntimeInfo.dims.z},{' '}
                          {selectedLayerRuntimeInfo.dims.y}, {selectedLayerRuntimeInfo.dims.x}
                        </div>
                      ) : null}
                      {selectedLayerRuntimeInfo?.rawShape ? (
                        <div>
                          <strong>Raw shape:</strong> [{selectedLayerRuntimeInfo.rawShape.join(', ')}]
                        </div>
                      ) : null}
                    </div>
                  </Section>
                ) : null}
              </div>
            ) : (
              <div
                data-theme-surface="soft"
                style={{
                  borderRadius: 12,
                  border: '1px solid rgba(255,255,255,0.08)',
                  padding: 12,
                  fontSize: 12,
                  lineHeight: 1.55,
                }}
              >
                Select an annotation layer to edit its style and metadata here.
              </div>
            )}
          </>
        ) : (
          <div
            data-theme-surface="soft"
            style={{
              borderRadius: 12,
              border: '1px solid rgba(255,255,255,0.08)',
              padding: 12,
              fontSize: 12,
              lineHeight: 1.55,
            }}
          >
            Select a layer in the panel to inspect it here.
          </div>
        )}
      </div>
    </div>
  );
}
