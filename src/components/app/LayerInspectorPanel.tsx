import type { LayerItemNode, LayerTreeNode, AnnotationShape } from '../../layerTypes';
import type { SelectedLayerRuntimeInfo } from '../../WebGLCanvas';

type AnnotationDraftSettings = {
  shape: AnnotationShape;
  color: string;
  opacity: number;
  size: number;
  depth: number;
  eraseMode: 'all' | 'color';
};

export default function LayerInspectorPanel({
  selectedNode,
  selectedAnnotation,
  selectedLayerRuntimeInfo,
  annotationDraft,
  isInspectorCollapsed,
  onToggleCollapsed,
  onRenameNode,
  onUpdateSelectedAnnotationLayer,
}: {
  selectedNode: LayerTreeNode | null;
  selectedAnnotation: LayerItemNode['annotation'] | null;
  selectedLayerRuntimeInfo: SelectedLayerRuntimeInfo | null;
  annotationDraft: AnnotationDraftSettings;
  isInspectorCollapsed: boolean;
  onToggleCollapsed: () => void;
  onRenameNode: (nodeId: string, newName: string) => void;
  onUpdateSelectedAnnotationLayer: (patch: Partial<NonNullable<LayerItemNode['annotation']>>) => void;
}) {
  const selectedAnnotationLayer =
    selectedNode && selectedNode.kind === 'layer' && selectedNode.type === 'annotation'
      ? selectedNode
      : null;

  return (
    <div
      data-theme-surface="panel"
      style={{
        width: '100%',
        borderRadius: 14,
        border: '1px solid rgba(255,255,255,0.08)',
        boxShadow: 'none',
        backdropFilter: 'blur(14px)',
        overflow: 'hidden',
        transition: 'width 220ms ease',
        fontFamily: 'sans-serif',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          padding: '12px 14px',
          borderBottom: isInspectorCollapsed ? 'none' : '1px solid rgba(255,255,255,0.08)',
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div data-theme-text="strong" style={{ fontSize: 13, fontWeight: 700 }}>
            {selectedNode ? selectedNode.name : 'No selection'}
          </div>
          <div data-theme-text="muted" style={{ fontSize: 11, marginTop: 3 }}>
            {selectedNode
              ? selectedNode.kind === 'group'
                ? 'Group'
                : selectedNode.type === 'annotation'
                ? `Annotation · ${selectedAnnotation?.shape ?? 'point'}`
                : selectedNode.type === 'custom-slice'
                ? 'Custom slice'
                : selectedNode.type === 'remote'
                ? 'Remote layer'
                : selectedNode.type === 'primitive'
                ? 'Primitive'
                : 'Layer'
              : 'Select a layer to inspect it.'}
          </div>
        </div>

        <button
          type="button"
          onClick={onToggleCollapsed}
          aria-label={isInspectorCollapsed ? 'Expand inspector' : 'Collapse inspector'}
          title={isInspectorCollapsed ? 'Expand inspector' : 'Collapse inspector'}
          style={{
            width: 34,
            height: 34,
            borderRadius: 12,
            border: '1px solid rgba(255,255,255,0.10)',
            background: 'rgba(255,255,255,0.04)',
            color: 'inherit',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            transition: 'all 180ms ease',
            flex: '0 0 auto',
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ transform: isInspectorCollapsed ? 'rotate(-90deg)' : 'rotate(90deg)', transition: 'transform 220ms ease' }}>
            <path d="M9 6l6 6-6 6" />
          </svg>
        </button>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateRows: isInspectorCollapsed ? '0fr' : '1fr',
          transition: 'grid-template-rows 220ms ease',
        }}
      >
        <div style={{ overflow: 'hidden' }}>
          <div style={{ padding: '14px', display: 'grid', gap: 12 }}>
            {selectedNode ? (
              <>
                <label style={{ display: 'grid', gap: 6 }}>
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
                    }}
                  />
                </label>

                {selectedAnnotationLayer ? (
                  <>
                    <div style={{ display: 'grid', gap: 6 }}>
                      <span data-theme-text="muted" style={{ fontSize: 11, fontWeight: 600, letterSpacing: 0.2 }}>
                        Color
                      </span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <input
                          type="color"
                          value={selectedAnnotation?.color ?? annotationDraft.color}
                          onChange={(event) => onUpdateSelectedAnnotationLayer({ color: event.target.value })}
                          style={{ width: 40, height: 34, padding: 0, border: 'none', background: 'transparent', cursor: 'pointer' }}
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

                    {selectedAnnotation?.shape !== 'rectangle' && selectedAnnotation?.shape !== 'circle' && selectedAnnotation?.shape !== 'freehand' ? (
                      <label style={{ display: 'grid', gap: 6 }}>
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

                    <label style={{ display: 'grid', gap: 6 }}>
                      <span data-theme-text="muted" style={{ fontSize: 11, fontWeight: 600, letterSpacing: 0.2 }}>
                        Metadata
                      </span>
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
                        }}
                      />
                    </label>
                  </>
                ) : selectedNode.kind === 'layer' ? (
                  <div style={{ display: 'grid', gap: 10 }}>
                    <div data-theme-surface="soft" style={{ borderRadius: 12, border: '1px solid rgba(255,255,255,0.08)', padding: 12, fontSize: 12, lineHeight: 1.55, display: 'grid', gap: 8 }}>
                      <div style={{ fontSize: 13, fontWeight: 700 }}>Source information</div>
                      <div><strong>Type:</strong> {selectedLayerRuntimeInfo?.sourceType ?? (selectedNode.type === 'remote' ? 'Remote layer' : selectedNode.type === 'custom-slice' ? 'Custom slice' : selectedNode.type === 'file' ? 'Uploaded file' : 'Primitive')}</div>
                      <div><strong>Description:</strong> {selectedNode.description ?? '—'}</div>
                      {selectedLayerRuntimeInfo?.sourceName ? <div><strong>Source name:</strong> {selectedLayerRuntimeInfo.sourceName}</div> : null}
                      {selectedLayerRuntimeInfo?.sourcePath ? <div style={{ wordBreak: 'break-all' }}><strong>Source path:</strong> {selectedLayerRuntimeInfo.sourcePath}</div> : typeof selectedNode.source === 'string' ? <div style={{ wordBreak: 'break-all' }}><strong>Source path:</strong> {selectedNode.source}</div> : null}
                    </div>

                    {(selectedLayerRuntimeInfo?.requestedResolutionUm != null || selectedLayerRuntimeInfo?.dims || selectedLayerRuntimeInfo?.datasetPath || selectedLayerRuntimeInfo?.rawShape) ? (
                      <div data-theme-surface="soft" style={{ borderRadius: 12, border: '1px solid rgba(255,255,255,0.08)', padding: 12, fontSize: 12, lineHeight: 1.55, display: 'grid', gap: 8 }}>
                        <div style={{ fontSize: 13, fontWeight: 700 }}>Loaded dataset</div>
                        {selectedLayerRuntimeInfo?.requestedResolutionUm != null ? <div><strong>Requested resolution:</strong> {selectedLayerRuntimeInfo.requestedResolutionUm} µm</div> : null}
                        {selectedLayerRuntimeInfo?.resolvedResolutionUm != null ? <div><strong>Resolved resolution:</strong> {selectedLayerRuntimeInfo.resolvedResolutionUm} µm</div> : null}
                        {selectedLayerRuntimeInfo?.datasetIndex != null ? <div><strong>Dataset index:</strong> {selectedLayerRuntimeInfo.datasetIndex}</div> : null}
                        {selectedLayerRuntimeInfo?.datasetPath ? <div style={{ wordBreak: 'break-all' }}><strong>OME-Zarr path:</strong> {selectedLayerRuntimeInfo.datasetPath}</div> : null}
                        {selectedLayerRuntimeInfo?.voxelSizeUm ? <div><strong>Voxel size (z,y,x):</strong> {selectedLayerRuntimeInfo.voxelSizeUm.z ?? '?'}, {selectedLayerRuntimeInfo.voxelSizeUm.y ?? '?'}, {selectedLayerRuntimeInfo.voxelSizeUm.x ?? '?'} µm</div> : null}
                        {selectedLayerRuntimeInfo?.dims ? <div><strong>Dims (z,y,x):</strong> {selectedLayerRuntimeInfo.dims.z}, {selectedLayerRuntimeInfo.dims.y}, {selectedLayerRuntimeInfo.dims.x}</div> : null}
                        {selectedLayerRuntimeInfo?.rawShape ? <div><strong>Raw shape:</strong> [{selectedLayerRuntimeInfo.rawShape.join(', ')}]</div> : null}
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <div data-theme-surface="soft" style={{ borderRadius: 12, border: '1px solid rgba(255,255,255,0.08)', padding: 12, fontSize: 12, lineHeight: 1.55 }}>
                    Select an annotation layer to edit its style and metadata here.
                  </div>
                )}
              </>
            ) : (
              <div data-theme-surface="soft" style={{ borderRadius: 12, border: '1px solid rgba(255,255,255,0.08)', padding: 12, fontSize: 12, lineHeight: 1.55 }}>
                Select a layer in the panel to inspect it here.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
