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
    inspectorCollapsed: boolean;
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
      return typeof node.source === "string";
    }

    if (node.type === "remote" && typeof node.source !== "string") {
      return false;
    }

    return true;
  }

  return tree.every(isSerializableNode);
}

export function getLocalOnlyLayerNames(tree: LayerTreeNode[]): string[] {
  const blockedNames: string[] = [];

  function visit(node: LayerTreeNode) {
    if (node.kind === "group") {
      node.children.forEach(visit);
      return;
    }

    if (node.type === "file" && node.sourceKind === "custom-upload" && !!node.localOnly) {
      blockedNames.push(node.name);
    }
  }

  tree.forEach(visit);

  return blockedNames;
}

export function hasLocalOnlyLayers(tree: LayerTreeNode[]): boolean {
  return getLocalOnlyLayerNames(tree).length > 0;
}

export function createViewerState(params: {
  activeTool: ToolId;
  selectedNodeId: string | null;
  layerTree: LayerTreeNode[];
  sliceVolumeLayerId: string;
  sliceName: string;
  sliceParamsDraft: SliceLayerParams;
  layerPanelCollapsed: boolean;
  inspectorCollapsed: boolean;
  camera: SerializableCameraState;
}): ViewerStateV1 {
  return {
    version: 1,
    layout: {
      layerPanelCollapsed: params.layerPanelCollapsed,
      inspectorCollapsed: params.inspectorCollapsed,
    },
    camera: {
      ...DEFAULT_CAMERA_STATE,
      ...params.camera,
      mode: params.camera.mode ?? DEFAULT_CAMERA_STATE.mode,
      position: params.camera.position ?? DEFAULT_CAMERA_STATE.position,
    },
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
  const parsed = JSON.parse(raw) as Partial<ViewerStateV1> & {
    camera?: Partial<SerializableCameraState>;
    scene?: Partial<ViewerStateV1["scene"]>;
  };

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
    ...(parsed as ViewerStateV1),
    layout: {
      layerPanelCollapsed: parsed.layout?.layerPanelCollapsed ?? false,
      inspectorCollapsed: parsed.layout?.inspectorCollapsed ?? false,
    },
    camera: {
      mode: parsed.camera.mode ?? DEFAULT_CAMERA_STATE.mode,
      position:
        (parsed.camera.position as [number, number, number] | undefined) ??
        DEFAULT_CAMERA_STATE.position,
      yaw: parsed.camera.yaw ?? DEFAULT_CAMERA_STATE.yaw,
      pitch: parsed.camera.pitch ?? DEFAULT_CAMERA_STATE.pitch,
      fovDeg: parsed.camera.fovDeg ?? DEFAULT_CAMERA_STATE.fovDeg,
    },
  };
}
