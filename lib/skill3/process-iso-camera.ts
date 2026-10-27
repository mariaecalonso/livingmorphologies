import { uniformModuleZoom } from "./view-project";

/**
 * Shared Step 05 / Step 06 camera.
 * Yaw 45° and pitch atan(1/√2) is a true isometric view of the 20×20×20 module.
 * The orthographic fit is that module, not the bounds of whichever mesh is on screen.
 */
export const PROCESS_ISO_YAW = Math.PI / 4;
export const PROCESS_ISO_PITCH = Math.atan(1 / Math.SQRT2);

export type ProcessIsoCamera = {
  yaw: number;
  pitch: number;
  zoom: number;
};

export const PROCESS_ISO_PITCH_MIN = 0.08;
export const PROCESS_ISO_PITCH_MAX = 1.25;
export const PROCESS_ISO_ZOOM_MIN = 0.65;
export const PROCESS_ISO_ZOOM_MAX = 2.2;

export function createProcessIsoCamera(): ProcessIsoCamera {
  return { yaw: PROCESS_ISO_YAW, pitch: PROCESS_ISO_PITCH, zoom: 1 };
}

/** Orthographic module fit. `zoom` is the shared user zoom, 1 at the default isometric frame. */
export function processIsoFit(pitch: number, aspect: number, zoom: number) {
  return uniformModuleZoom(pitch, aspect) * zoom;
}

export function orbitProcessIso(camera: ProcessIsoCamera, dx: number, dy: number) {
  camera.yaw += dx * 0.005;
  camera.pitch = Math.min(PROCESS_ISO_PITCH_MAX, Math.max(PROCESS_ISO_PITCH_MIN, camera.pitch + dy * 0.005));
}

export function zoomProcessIso(camera: ProcessIsoCamera, deltaY: number) {
  const next = camera.zoom * (deltaY > 0 ? 0.92 : 1.08);
  camera.zoom = Math.min(PROCESS_ISO_ZOOM_MAX, Math.max(PROCESS_ISO_ZOOM_MIN, next));
}

export function resetProcessIso(camera: ProcessIsoCamera) {
  camera.yaw = PROCESS_ISO_YAW;
  camera.pitch = PROCESS_ISO_PITCH;
  camera.zoom = 1;
}
