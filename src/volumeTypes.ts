// src/volumeTypes.ts

export type RemoteFormat = "generic" | "ome-zarr";

export type RemoteRenderMode = "slices" | "volume";

export type VolumeSliceState = {
  x: number; // normalized [0..1]
  y: number; // normalized [0..1]
  z: number; // normalized [0..1]
};

export type VolumeRenderSettings = {
  threshold: number; // normalized [0..1]
  opacity: number;   // normalized [0..1]
  pointStep: number; // integer >= 1
};

export type RemoteVolumeConfig = {
  remoteFormat: RemoteFormat;
  renderMode: RemoteRenderMode;
  sliceState?: VolumeSliceState;
  volumeSettings?: VolumeRenderSettings;
};