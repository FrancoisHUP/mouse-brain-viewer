import type { ToolId } from "./BottomToolbar";
import type { LayerTreeNode, SliceLayerParams } from "./layerTypes";

export type CameraControlMode = "fly" | "orbit";

export type SerializableCameraState = {
  mode: CameraControlMode;
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

export type ViewerStatePatchV1 = {
  version?: 1;
  layout?: Partial<ViewerStateV1["layout"]>;
  camera?: Partial<ViewerStateV1["camera"]>;
  scene?: Partial<ViewerStateV1["scene"]>;
  ui?: Partial<ViewerStateV1["ui"]>;
};

export const DEFAULT_CAMERA_STATE: SerializableCameraState = {
  mode: "fly",
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

export function mergeViewerState(
  base: ViewerStateV1,
  patch: ViewerStatePatchV1
): ViewerStateV1 {
  return {
    version: 1,
    layout: {
      ...base.layout,
      ...(patch.layout ?? {}),
    },
    camera: {
      ...base.camera,
      ...(patch.camera ?? {}),
      mode: patch.camera?.mode ?? base.camera.mode,
      position:
        (patch.camera?.position as [number, number, number] | undefined) ??
        base.camera.position,
    },
    scene: {
      ...base.scene,
      ...(patch.scene ?? {}),
      layerTree: patch.scene?.layerTree ?? base.scene.layerTree,
    },
    ui: {
      ...base.ui,
      ...(patch.ui ?? {}),
      sliceParamsDraft: patch.ui?.sliceParamsDraft ?? base.ui.sliceParamsDraft,
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

  if (!parsed.camera) {
    throw new Error("Invalid viewer state: missing camera.");
  }

  return {
    ...parsed,
    camera: {
      mode: parsed.camera.mode ?? "fly",
      position: parsed.camera.position,
      yaw: parsed.camera.yaw,
      pitch: parsed.camera.pitch,
      fovDeg: parsed.camera.fovDeg,
    },
  } as ViewerStateV1;
}
