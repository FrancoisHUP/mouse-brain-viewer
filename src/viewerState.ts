import type { ToolId } from "./BottomToolbar";
import type { LayerTreeNode, SliceLayerParams } from "./layerTypes";

export type SerializableCameraState = {
  position: [number, number, number];
  yaw: number;
  pitch: number;
  fovDeg: number;
};

export type ViewerStateV1 = {
  version: 1;
  layout: {
    layerPanelCollapsed: boolean;
  };
  camera: SerializableCameraState;
  scene: {
    activeTool: ToolId;
    selectedNodeId: string | null;
    layerTree: LayerTreeNode[];
  };
  ui: {
    sliceVolumeLayerId: string;
    sliceName: string;
    sliceParamsDraft: SliceLayerParams;
  };
};

export const DEFAULT_CAMERA_STATE: SerializableCameraState = {
  position: [0, 0, 5],
  yaw: -90,
  pitch: 0,
  fovDeg: 60,
};

export function isSerializableLayerTree(tree: LayerTreeNode[]): boolean {
  function isSerializableNode(node: LayerTreeNode): boolean {
    if (node.kind === "group") {
      return node.children.every(isSerializableNode);
    }

    if (node.type === "file") {
      return false;
    }

    if (node.type === "remote" && typeof node.source !== "string") {
      return false;
    }

    return true;
  }

  return tree.every(isSerializableNode);
}

export function createViewerState(params: {
  activeTool: ToolId;
  selectedNodeId: string | null;
  layerTree: LayerTreeNode[];
  sliceVolumeLayerId: string;
  sliceName: string;
  sliceParamsDraft: SliceLayerParams;
  layerPanelCollapsed: boolean;
  camera: SerializableCameraState;
}): ViewerStateV1 {
  return {
    version: 1,
    layout: {
      layerPanelCollapsed: params.layerPanelCollapsed,
    },
    camera: params.camera,
    scene: {
      activeTool: params.activeTool,
      selectedNodeId: params.selectedNodeId,
      layerTree: params.layerTree,
    },
    ui: {
      sliceVolumeLayerId: params.sliceVolumeLayerId,
      sliceName: params.sliceName,
      sliceParamsDraft: params.sliceParamsDraft,
    },
  };
}

export function parseViewerState(raw: string): ViewerStateV1 {
  const parsed = JSON.parse(raw);

  if (!parsed || parsed.version !== 1) {
    throw new Error("Unsupported viewer state version.");
  }

  if (!parsed.scene || !Array.isArray(parsed.scene.layerTree)) {
    throw new Error("Invalid viewer state: missing layer tree.");
  }

  return parsed as ViewerStateV1;
}
