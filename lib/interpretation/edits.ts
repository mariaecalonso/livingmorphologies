import type { ElementEdit } from "./types";

export const IDENTITY_EDIT: ElementEdit = {
  translation: [0, 0, 0],
  rotation: [0, 0, 0],
  scale: [1, 1, 1],
};

export function identityEdit(): ElementEdit {
  return {
    translation: [0, 0, 0],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
  };
}

export function isIdentityEdit(edit: ElementEdit) {
  return edit.translation.every((value) => value === 0)
    && edit.rotation.every((value) => value === 0)
    && edit.scale.every((value) => value === 1);
}

function clampScale(value: number) {
  if (!Number.isFinite(value)) return 1;
  return Math.min(4, Math.max(0.2, value));
}

export function cleanEdit(value: unknown): ElementEdit | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Partial<ElementEdit>;
  const triple = (input: unknown, fallback: number, map: (item: number) => number): [number, number, number] | null => {
    if (!Array.isArray(input) || input.length !== 3) return [fallback, fallback, fallback];
    const numbers = input.map((item) => (typeof item === "number" && Number.isFinite(item) ? map(item) : null));
    if (numbers.some((item) => item == null)) return null;
    return numbers as [number, number, number];
  };
  const translation = triple(record.translation, 0, (item) => item);
  const rotation = triple(record.rotation, 0, (item) => item);
  const scale = triple(record.scale, 1, clampScale);
  if (!translation || !rotation || !scale) return null;
  return { translation, rotation, scale };
}

export function cleanEdits(value: unknown): Record<string, ElementEdit> {
  if (!value || typeof value !== "object") return {};
  const edits: Record<string, ElementEdit> = {};
  for (const [id, edit] of Object.entries(value as Record<string, unknown>)) {
    if (!/^[a-z0-9-]+$/.test(id)) continue;
    const cleaned = cleanEdit(edit);
    if (cleaned && !isIdentityEdit(cleaned)) edits[id] = cleaned;
  }
  return edits;
}

/** Scale about the origin, then rotate X, Y, Z in degrees, then translate in world space. Matches Manifold's global x-y-z rotation. */
export function bakePositions(positions: Float32Array, origin: readonly [number, number, number], edit: ElementEdit): Float32Array {
  if (isIdentityEdit(edit)) return positions;
  const [ox, oy, oz] = origin;
  const [sx, sy, sz] = edit.scale;
  const [rx, ry, rz] = edit.rotation.map((degrees) => (degrees * Math.PI) / 180);
  const cx = Math.cos(rx);
  const sxr = Math.sin(rx);
  const cy = Math.cos(ry);
  const syr = Math.sin(ry);
  const cz = Math.cos(rz);
  const szr = Math.sin(rz);
  const out = new Float32Array(positions.length);
  for (let index = 0; index < positions.length; index += 3) {
    let x = (positions[index] - ox) * sx;
    let y = (positions[index + 1] - oy) * sy;
    let z = (positions[index + 2] - oz) * sz;
    const yx = y * cx - z * sxr;
    const zx = y * sxr + z * cx;
    y = yx;
    z = zx;
    const xy = x * cy + z * syr;
    const zy = -x * syr + z * cy;
    x = xy;
    z = zy;
    const xz = x * cz - y * szr;
    const yz = x * szr + y * cz;
    out[index] = xz + ox + edit.translation[0];
    out[index + 1] = yz + oy + edit.translation[1];
    out[index + 2] = z + oz + edit.translation[2];
  }
  return out;
}

export function boundsOf(positions: ArrayLike<number>) {
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (let index = 0; index < positions.length; index += 3) {
    for (let axis = 0; axis < 3; axis += 1) {
      const value = positions[index + axis];
      min[axis] = Math.min(min[axis], value);
      max[axis] = Math.max(max[axis], value);
    }
  }
  const size: [number, number, number] = [max[0] - min[0], max[1] - min[1], max[2] - min[2]];
  const origin: [number, number, number] = [
    (min[0] + max[0]) / 2,
    (min[1] + max[1]) / 2,
    (min[2] + max[2]) / 2,
  ];
  return { min, max, size, origin };
}
