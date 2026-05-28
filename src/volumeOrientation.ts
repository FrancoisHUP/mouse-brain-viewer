import type {
  AxisSliceViewState,
  LayerItemNode,
  NodeTransform,
  VolumeOrientationPresetId,
} from "./layerTypes";
import {
  ALLEN_VOLUME_PROFILE,
  IDENTITY_PROFILE,
  type ViewerOrientationProfile,
} from "./omeZarr";

export const DEFAULT_REMOTE_VOLUME_ORIENTATION_PRESET: VolumeOrientationPresetId =
  "identity";
export const DEFAULT_LOCAL_VOLUME_ORIENTATION_PRESET: VolumeOrientationPresetId =
  "identity";

export const VOLUME_ORIENTATION_PRESET_OPTIONS: Array<{
  value: VolumeOrientationPresetId;
  label: string;
}> = [
    { value: "allen", label: "Allen" },
    { value: "registered-to-allen", label: "Registered to Allen" },
    { value: "identity", label: "Identity" },
    { value: "custom", label: "Custom" },
  ];

export type StoredTransformPreset = {
  id: string;
  name: string;
  orientationPreset: VolumeOrientationPresetId;
  axisSliceViewState?: AxisSliceViewState;
  transform: NodeTransform;
};

export type StoredSourceOrientationPreference = {
  preset: VolumeOrientationPresetId;
  axisSliceViewState?: AxisSliceViewState;
  transformPresets?: StoredTransformPreset[];
};

export function isVolumeOrientationPresetId(
  value: unknown
): value is VolumeOrientationPresetId {
  return (
    value === "allen" ||
    value === "registered-to-allen" ||
    value === "ras+" ||
    value === "identity" ||
    value === "custom"
  );
}

export function cloneAxisSliceViewState(
  value: AxisSliceViewState | undefined
): AxisSliceViewState | undefined {
  if (!value) return undefined;
  return {
    xy: value.xy ? { ...value.xy } : undefined,
    xz: value.xz ? { ...value.xz } : undefined,
    yz: value.yz ? { ...value.yz } : undefined,
  };
}

export function getAxisSliceViewStateForOrientationPreset(
  preset: VolumeOrientationPresetId
): AxisSliceViewState {
  switch (preset) {
    case "allen":
      return {
        xy: { flipZ: true },
        xz: { flipZ: true },
        yz: { flipX: true, rotationDeg: 90 },
      };
    case "registered-to-allen":
      return {
        xy: {},
        xz: { flipX: true, flipZ: true },
        yz: { flipZ: true, rotationDeg: -90 },
      };
    case "ras+":
    case "identity":
    case "custom":
    default:
      return {
        xy: {},
        xz: {},
        yz: {},
      };
  }
}

export function getDefaultTransformForOrientationPreset(
  preset: VolumeOrientationPresetId
): NodeTransform | undefined {
  switch (preset) {
    case "registered-to-allen":
      return {
        rotation: [0, 270, 0],
      };
    case "allen":
    case "ras+":
    case "identity":
    case "custom":
    default:
      return undefined;
  }
}

export function getViewerOrientationProfileForPreset(
  preset: VolumeOrientationPresetId | undefined
): ViewerOrientationProfile {
  switch (preset) {
    case "allen":
      return ALLEN_VOLUME_PROFILE;
    case "registered-to-allen":
    case "ras+":
    case "identity":
    case "custom":
    default:
      return IDENTITY_PROFILE;
  }
}

export function isVolumeOrientationAdjustableLayer(
  layer: LayerItemNode | null | undefined
): layer is LayerItemNode {
  return !!layer && (
    (layer.type === "remote" && layer.remoteFormat === "ome-zarr") ||
    (layer.type === "file" &&
      layer.sourceKind === "custom-upload" &&
      layer.localOnly === true &&
      layer.localDataKind === "volume")
  );
}

export function getDefaultVolumeOrientationPresetForLayer(
  layer: LayerItemNode
): VolumeOrientationPresetId {
  if (
    layer.type === "remote" &&
    layer.remoteFormat === "ome-zarr" &&
    layer.sourceKind === "built-in"
  ) {
    return "allen";
  }
  return layer.type === "remote"
    ? DEFAULT_REMOTE_VOLUME_ORIENTATION_PRESET
    : DEFAULT_LOCAL_VOLUME_ORIENTATION_PRESET;
}

export function getEffectiveVolumeOrientationPresetForLayer(
  layer: LayerItemNode
): VolumeOrientationPresetId {
  return layer.orientationPreset ?? getDefaultVolumeOrientationPresetForLayer(layer);
}

export function getVolumeOrientationSourceKey(
  layer: LayerItemNode
): string | null {
  if (!isVolumeOrientationAdjustableLayer(layer)) return null;
  if (layer.type === "remote" && typeof layer.source === "string") {
    const trimmed = layer.source.trim();
    return trimmed ? `remote:${trimmed}` : null;
  }
  if (
    layer.type === "file" &&
    typeof layer.source === "string" &&
    layer.localDatasetInfo?.datasetId
  ) {
    return `local:${layer.localDatasetInfo.datasetId}`;
  }
  return null;
}
