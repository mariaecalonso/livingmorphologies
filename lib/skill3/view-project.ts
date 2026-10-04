import { MODULE_SIZE_Z, moduleEnvelope, moduleViewColumn } from "@/lib/skill3/envelope";

/** Half of the 20×20×20 module. Corner order depends on this extent. */
export const MODULE_HALF = MODULE_SIZE_Z / 2;

/** Orthographic stack fit. Single and the loading preview both use this. */
export const ORTHO_STACK_FIT = 0.52;

export type RotatedPoint = { x: number; y: number; z: number };
export type ViewPoint = { x: number; y: number; depth: number };

/**
 * Orthographic frame for a unit-square stack.
 * `full` is the vertical span the bounds are fitted to. Yaw and pitch stay with the caller.
 */
export function orthoStackFrame(width: number, height: number, yaw: number, pitch: number, full: number, cover = false) {
  const cy = Math.cos(yaw);
  const sy = Math.sin(yaw);
  const cp = Math.cos(pitch);
  const sp = Math.sin(pitch);
  const rotate = (x: number, y: number, z: number): RotatedPoint => {
    const x1 = x * cy + z * sy;
    const z1 = -x * sy + z * cy;
    return { x: x1, y: y * cp - z1 * sp, z: y * sp + z1 * cp };
  };
  const yBottom = -full * 0.5;
  const yTop = yBottom + full;
  const bounds = [rotate(-0.5, yBottom, -0.5), rotate(0.5, yBottom, 0.5), rotate(-0.5, yTop, -0.5), rotate(0.5, yTop, 0.5)];
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const point of bounds) {
    minX = Math.min(minX, point.x);
    maxX = Math.max(maxX, point.x);
    minY = Math.min(minY, point.y);
    maxY = Math.max(maxY, point.y);
  }
  const spanX = Math.max(0.001, maxX - minX);
  const spanY = Math.max(0.001, maxY - minY);
  const scale = cover
    ? Math.min((width * 0.94) / spanX, (height * 0.94) / spanY)
    : Math.min(width, height) * ORTHO_STACK_FIT;
  const xMid = (minX + maxX) / 2;
  const yMid = (minY + maxY) / 2;
  const du = rotate(1, 0, 0);
  const dv = rotate(0, 0, 1);
  const project = (x: number, y: number, z: number) => {
    const point = rotate(x, y, z);
    return {
      x: width / 2 + (point.x - xMid) * scale,
      y: height / 2 - (point.y - yMid) * scale,
      z: point.z,
    };
  };
  const plateBasis = (dpr: number, origin: RotatedPoint) => ({
    a: dpr * du.x * scale,
    b: dpr * -du.y * scale,
    c: dpr * dv.x * scale,
    d: dpr * -dv.y * scale,
    e: dpr * (width / 2 + (origin.x - xMid) * scale),
    f: dpr * (height / 2 - (origin.y - yMid) * scale),
  });
  return { rotate, project, plateBasis, scale };
}

/** Same fit the mesh shader receives as uFit. */
export function moduleViewFit(column: number, aspect: number) {
  return Math.min(1.45, 1.7 / Math.max(1, (column / 2) * aspect * 0.55));
}

/** Perspective projection of the 20×20×20 module. Camera yaw and pitch stay with the caller. */
export function projectModule(x: number, y: number, z: number, yaw: number, pitch: number, width: number, height: number): ViewPoint {
  const aspect = width / Math.max(1, height);
  const column = moduleViewColumn(moduleEnvelope(MODULE_SIZE_Z));
  const fit = moduleViewFit(column, aspect);
  const cy = Math.cos(yaw);
  const sy = Math.sin(yaw);
  const cp = Math.cos(pitch);
  const sp = Math.sin(pitch);
  const x1 = x * cy + z * sy;
  const z1 = -x * sy + z * cy;
  const y2 = y * cp - z1 * sp;
  const z2 = y * sp + z1 * cp;
  const viewX = x1 * fit;
  const viewY = y2 * fit * aspect;
  const viewZ = -z2 * fit - 3.4;
  const w = -viewZ;
  const ndcX = (viewX * 1.55) / w;
  const ndcY = (viewY * 1.55) / w;
  return {
    x: (ndcX * 0.5 + 0.5) * width,
    y: (1 - (ndcY * 0.5 + 0.5)) * height,
    depth: w,
  };
}

/** Box corners. X, then Y, then Z, each from −10 to 10. Edge indexes depend on this order. */
export function moduleCorners(yaw: number, pitch: number, width: number, height: number) {
  const corners: ViewPoint[] = [];
  for (const x of [-MODULE_HALF, MODULE_HALF]) {
    for (const y of [-MODULE_HALF, MODULE_HALF]) {
      for (const z of [-MODULE_HALF, MODULE_HALF]) corners.push(projectModule(x, y, z, yaw, pitch, width, height));
    }
  }
  return corners;
}

/** Largest uniform scale that keeps the module box inside the well. */
export function moduleScale(width: number, height: number, yaw: number, pitch: number) {
  let max = 0.2;
  for (const corner of moduleCorners(yaw, pitch, width, height)) {
    const nx = Math.abs((corner.x / width) * 2 - 1);
    const ny = Math.abs((corner.y / height) * 2 - 1);
    max = Math.max(max, nx, ny);
  }
  return Math.min(2.2, 0.9 / max);
}
