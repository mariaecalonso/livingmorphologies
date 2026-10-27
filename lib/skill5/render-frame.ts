import { OrthographicCamera, PerspectiveCamera, Vector3, type Camera } from "three";

/**
 * Stored site coordinates stay +X east, +Y up, +Z north.
 * Three.js lookAt in that frame puts west on the right of a north-up view,
 * because the camera's right axis is the cross of up and the backward vector.
 * The render frame reflects north once: world Z = −stored north.
 * A group scale of (1, 1, −1) applies that reflection to every mesh.
 * Cameras and rays live in the reflected world and convert back at the boundary.
 */
export const RENDER_GROUP_SCALE: [number, number, number] = [1, 1, -1];

export const WORLD_NORTH = new Vector3(0, 0, -1);

export type SiteFrame = {
  cx: number;
  cz: number;
  width: number;
  depth: number;
  span: number;
};

export function storedToWorld(x: number, y: number, z: number) {
  return { x, y, z: -z };
}

export function worldToStored(x: number, y: number, z: number) {
  return { x, y, z: -z };
}

export function northDegrees(camera: Camera) {
  const right = new Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
  const up = new Vector3().setFromMatrixColumn(camera.matrixWorld, 1);
  const screenX = WORLD_NORTH.dot(right);
  const screenY = WORLD_NORTH.dot(up);
  return (Math.atan2(screenX, screenY) * 180) / Math.PI;
}

function lookAtStored(camera: Camera, frame: SiteFrame, y = 0) {
  const target = storedToWorld(frame.cx, y, frame.cz);
  camera.lookAt(target.x, target.y, target.z);
  return target;
}

export function placePlan(camera: OrthographicCamera, size: { width: number; height: number }, frame: SiteFrame, pad: number) {
  camera.left = -size.width / 2;
  camera.right = size.width / 2;
  camera.top = size.height / 2;
  camera.bottom = -size.height / 2;
  camera.zoom = Math.min(size.width / (frame.width * pad), size.height / (frame.depth * pad));
  camera.up.set(0, 0, -1);
  const eye = storedToWorld(frame.cx, frame.span * 3, frame.cz);
  camera.position.set(eye.x, eye.y, eye.z);
  const target = lookAtStored(camera, frame);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();
  return target;
}

export function placeAxon(camera: OrthographicCamera, size: { width: number; height: number }, frame: SiteFrame, fit: "site" | "context") {
  camera.left = -size.width / 2;
  camera.right = size.width / 2;
  camera.top = size.height / 2;
  camera.bottom = -size.height / 2;
  camera.zoom = Math.min(size.width, size.height) / (frame.span * (fit === "site" ? 1.08 : 1.72));
  camera.up.set(0, 1, 0);
  const eye = storedToWorld(frame.cx + frame.span * 0.62, frame.span * 0.48, frame.cz - frame.span * 0.62);
  camera.position.set(eye.x, eye.y, eye.z);
  const target = lookAtStored(camera, frame);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();
  return target;
}

export function placePerspective(camera: PerspectiveCamera, size: { width: number; height: number }, frame: SiteFrame, fit: "site" | "context") {
  const reach = fit === "site" ? 1.16 : 1.18;
  camera.fov = 32;
  camera.aspect = size.width / Math.max(1, size.height);
  camera.up.set(0, 1, 0);
  const eye = storedToWorld(
    frame.cx + frame.span * reach * 0.86,
    frame.span * reach * 0.46,
    frame.cz - frame.span * reach * 0.4,
  );
  camera.position.set(eye.x, eye.y, eye.z);
  const target = lookAtStored(camera, frame, 36);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();
  return target;
}

/** East of the parcel, looking west, with north on the right. Matches the bay-toward-city view. */
export function placeWaterfront(camera: PerspectiveCamera, frame: SiteFrame) {
  const distance = Math.max(frame.span, 900) * 1.15;
  camera.fov = 46;
  camera.aspect = 16 / 9;
  camera.up.set(0, 1, 0);
  const eye = storedToWorld(frame.cx + distance, distance * 0.34, frame.cz + frame.depth * 0.05);
  camera.position.set(eye.x, eye.y, eye.z);
  const target = lookAtStored(camera, frame, 40);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();
  return target;
}
