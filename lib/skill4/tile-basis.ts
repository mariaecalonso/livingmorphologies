import type { Vec3 } from "./contract";

/** Column-major. Columns are the images of local X, Y, and Z. */
export type Mat3 = readonly [
  number, number, number,
  number, number, number,
  number, number, number,
];

export const IDENTITY_BASIS: Mat3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];

type Quarter = 0 | 1 | 2 | 3;
type Mirror = "x" | "y" | "z" | null;

/** Mirror, then the same quarter-turn yaw the assembly shader uses. */
export function manualBasis(mirror: Mirror, quarter: Quarter): Mat3 {
  const x = yaw(mirrorVec({ x: 1, y: 0, z: 0 }, mirror), quarter);
  const y = yaw(mirrorVec({ x: 0, y: 1, z: 0 }, mirror), quarter);
  const z = yaw(mirrorVec({ x: 0, y: 0, z: 1 }, mirror), quarter);
  return [x.x, x.y, x.z, y.x, y.y, y.z, z.x, z.y, z.z];
}

/** Full placed rotation. A stored basis includes pitch and roll; otherwise yaw and mirror. */
export function tileBasis(tile: { rotation?: Mat3; rotationQuarter: Quarter; mirror: Mirror }): Mat3 {
  return tile.rotation ?? manualBasis(tile.mirror, tile.rotationQuarter);
}

export function rotateByBasis(basis: Mat3, vector: Vec3): Vec3 {
  return {
    x: basis[0] * vector.x + basis[3] * vector.y + basis[6] * vector.z,
    y: basis[1] * vector.x + basis[4] * vector.y + basis[7] * vector.z,
    z: basis[2] * vector.x + basis[5] * vector.y + basis[8] * vector.z,
  };
}

export function basisDeterminant(basis: Mat3) {
  const a = basis;
  return a[0] * (a[4] * a[8] - a[7] * a[5])
    - a[3] * (a[1] * a[8] - a[7] * a[2])
    + a[6] * (a[1] * a[5] - a[4] * a[2]);
}

function yaw(vector: Vec3, quarter: Quarter): Vec3 {
  const angle = quarter * Math.PI / 2;
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  return { x: vector.x * cosine + vector.z * sine, y: vector.y, z: -vector.x * sine + vector.z * cosine };
}

function mirrorVec(vector: Vec3, axis: Mirror): Vec3 {
  if (axis === "x") return { x: -vector.x, y: vector.y, z: vector.z };
  if (axis === "y") return { x: vector.x, y: -vector.y, z: vector.z };
  if (axis === "z") return { x: vector.x, y: vector.y, z: -vector.z };
  return vector;
}
