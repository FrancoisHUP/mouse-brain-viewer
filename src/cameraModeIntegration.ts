import type { CameraControlMode, SerializableCameraState, ViewerStateV1 } from "./viewerState";

export function setCameraMode(
  camera: SerializableCameraState,
  mode: CameraControlMode
): SerializableCameraState {
  if (camera.mode === mode) return camera;
  return {
    ...camera,
    mode,
  };
}

export function setCameraModeInViewerState(
  state: ViewerStateV1,
  mode: CameraControlMode
): ViewerStateV1 {
  if (state.camera.mode === mode) return state;
  return {
    ...state,
    camera: setCameraMode(state.camera, mode),
  };
}
