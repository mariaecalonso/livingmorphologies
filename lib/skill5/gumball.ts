import { MODULE_HEIGHT_FT, type PlacedModule } from "./placement";

type ReviewedJoin = { tileA: string; tileB: string; review?: string };

const HALF = MODULE_HEIGHT_FT / 2;

export type AxisSpace = "local" | "world";

export type TileAxes = {
  rotationX: number;
  rotationZ: number;
  scaleX: number;
  scaleY: number;
  scaleZ: number;
};

export type GumballPose = TileAxes & {
  x: number;
  y: number;
  z: number;
  rotationY: number;
};

export const IDENTITY_AXES: TileAxes = {
  rotationX: 0,
  rotationZ: 0,
  scaleX: 1,
  scaleY: 1,
  scaleZ: 1,
};

export const JOIN_REVIEW = "The tile was transformed. Revalidate this connection before trusting the passage.";

export function tileAxes(instance: PlacedModule): TileAxes {
  const axes = instance.axes;
  const finite = (value: number | undefined, fallback: number) => typeof value === "number" && Number.isFinite(value) ? value : fallback;
  return {
    rotationX: finite(axes?.rotationX, 0),
    rotationZ: finite(axes?.rotationZ, 0),
    scaleX: Math.max(0.05, finite(axes?.scaleX, 1)),
    scaleY: Math.max(0.05, finite(axes?.scaleY, 1)),
    scaleZ: Math.max(0.05, finite(axes?.scaleZ, 1)),
  };
}

export function tileDistorted(instance: PlacedModule) {
  const axes = tileAxes(instance);
  const limit = 0.02;
  return Math.abs(axes.scaleX - axes.scaleY) > limit || Math.abs(axes.scaleY - axes.scaleZ) > limit || Math.abs(axes.scaleX - axes.scaleZ) > limit;
}

export function poseOf(instance: PlacedModule): GumballPose {
  return {
    ...tileAxes(instance),
    x: instance.transform.position.x,
    y: instance.transform.position.y,
    z: instance.transform.position.z,
    rotationY: instance.transform.rotationY,
  };
}

type Vec3 = { x: number; y: number; z: number };

function rotX(point: Vec3, angle: number): Vec3 {
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  return { x: point.x, y: point.y * cosine - point.z * sine, z: point.y * sine + point.z * cosine };
}

function rotY(point: Vec3, angle: number): Vec3 {
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  return { x: point.x * cosine + point.z * sine, y: point.y, z: -point.x * sine + point.z * cosine };
}

function rotZ(point: Vec3, angle: number): Vec3 {
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  return { x: point.x * cosine - point.y * sine, y: point.x * sine + point.y * cosine, z: point.z };
}

/** Local module point to site east, up, north. Scale, then mirror, then the mesh Euler. */
export function tileVector(local: Vec3, pose: GumballPose, mirror?: PlacedModule["mirror"]): Vec3 {
  let point = { x: local.x * pose.scaleX, y: local.y * pose.scaleY, z: local.z * pose.scaleZ };
  if (mirror === "x") point = { ...point, x: -point.x };
  if (mirror === "y") point = { ...point, y: -point.y };
  if (mirror === "z") point = { ...point, z: -point.z };
  point = rotX(point, pose.rotationX);
  point = rotY(point, -pose.rotationY);
  point = rotZ(point, pose.rotationZ);
  return point;
}

export function tilePoint(local: Vec3, pose: GumballPose, mirror?: PlacedModule["mirror"]): Vec3 {
  const turned = tileVector(local, pose, mirror);
  return { x: pose.x + turned.x, y: pose.y + turned.y, z: pose.z + turned.z };
}

const CORNERS: Vec3[] = [-1, 1].flatMap((x) => [-1, 1].flatMap((y) => [-1, 1].map((z) => ({
  x: x * HALF,
  y: y < 0 ? 0 : MODULE_HEIGHT_FT,
  z: z * HALF,
}))));

export function tileAabb(instance: PlacedModule, pose: GumballPose = poseOf(instance)) {
  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;
  for (const corner of CORNERS) {
    const point = tilePoint(corner, pose, instance.mirror);
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    minZ = Math.min(minZ, point.z);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
    maxZ = Math.max(maxZ, point.z);
  }
  return { minX, minY, minZ, maxX, maxY, maxZ, height: maxY - minY };
}

/** Plan corners of the base, in site east/north. */
export function tileFootprint(instance: PlacedModule, pose: GumballPose = poseOf(instance)) {
  return [
    { x: -1, z: -1 },
    { x: 1, z: -1 },
    { x: 1, z: 1 },
    { x: -1, z: 1 },
  ].map((corner) => {
    const point = tilePoint({ x: corner.x * HALF, y: 0, z: corner.z * HALF }, pose, instance.mirror);
    return { x: point.x, z: point.z };
  });
}

/**
 * Skill 04 basis. Columns are the images of skill-local east, north, and up,
 * already scaled, so a later face frame lands on the transformed tile.
 */
export function skillBasis(instance: PlacedModule): readonly number[] {
  const pose = poseOf(instance);
  const unit: GumballPose = { ...pose, scaleX: 1, scaleY: 1, scaleZ: 1, x: 0, y: 0, z: 0 };
  const east = tileVector({ x: pose.scaleX, y: 0, z: 0 }, unit, instance.mirror);
  const north = tileVector({ x: 0, y: 0, z: pose.scaleZ }, unit, instance.mirror);
  const up = tileVector({ x: 0, y: pose.scaleY, z: 0 }, unit, instance.mirror);
  return [east.x, east.y, east.z, north.x, north.y, north.z, up.x, up.y, up.z];
}

export function reviewJoins<T extends ReviewedJoin>(joins: readonly T[], tileId: string): T[] {
  return joins.map((join) => join.tileA === tileId || join.tileB === tileId ? { ...join, review: JOIN_REVIEW } : join);
}

export function readAxes(value: unknown): TileAxes | undefined {
  if (!value || typeof value !== "object") return undefined;
  const body = value as { rotationX?: unknown; rotationZ?: unknown; scaleX?: unknown; scaleY?: unknown; scaleZ?: unknown };
  const number = (item: unknown) => typeof item === "number" && Number.isFinite(item) ? item : null;
  const rotationX = number(body.rotationX);
  const rotationZ = number(body.rotationZ);
  const scaleX = number(body.scaleX);
  const scaleY = number(body.scaleY);
  const scaleZ = number(body.scaleZ);
  if (rotationX === null && rotationZ === null && scaleX === null && scaleY === null && scaleZ === null) return undefined;
  return {
    rotationX: rotationX ?? 0,
    rotationZ: rotationZ ?? 0,
    scaleX: Math.max(0.05, scaleX ?? 1),
    scaleY: Math.max(0.05, scaleY ?? 1),
    scaleZ: Math.max(0.05, scaleZ ?? 1),
  };
}
