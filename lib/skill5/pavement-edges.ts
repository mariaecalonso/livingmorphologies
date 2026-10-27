import type { XZ } from "./site-model";

export type PavementSegment = [XZ, XZ];

export type PavementSection = {
  half: number;
  shift: number;
};

const MIN_EDGE_FEET = 6;
const MAX_EDGE_FEET = 70;
const MIN_WIDTH_FEET = 18;
const MAX_WIDTH_FEET = 140;
const ALONG_FEET = 30;

/**
 * Half-width and center shift from the nearest pavement edge on each side.
 * Shift is positive toward the left of travel. Returns null when either edge is missing.
 */
export function pavementSection(point: XZ, tangent: XZ, segments: readonly PavementSegment[]): PavementSection | null {
  const length = Math.hypot(tangent[0], tangent[1]) || 1;
  const tx = tangent[0] / length;
  const tz = tangent[1] / length;
  const nx = -tz;
  const nz = tx;
  let left = Infinity;
  let right = Infinity;
  for (const [start, end] of segments) {
    const abx = end[0] - start[0];
    const abz = end[1] - start[1];
    const span = abx * abx + abz * abz || 1;
    let t = ((point[0] - start[0]) * abx + (point[1] - start[1]) * abz) / span;
    t = Math.max(0, Math.min(1, t));
    const vx = start[0] + abx * t - point[0];
    const vz = start[1] + abz * t - point[1];
    const lateral = vx * nx + vz * nz;
    if (Math.abs(vx * tx + vz * tz) > ALONG_FEET) continue;
    const distance = Math.abs(lateral);
    if (distance < MIN_EDGE_FEET || distance > MAX_EDGE_FEET) continue;
    if (lateral > 0 && distance < left) left = distance;
    if (lateral < 0 && distance < right) right = distance;
  }
  if (!Number.isFinite(left) || !Number.isFinite(right)) return null;
  const width = left + right;
  if (width < MIN_WIDTH_FEET || width > MAX_WIDTH_FEET) return null;
  return {
    half: width / 2,
    shift: (left - right) / 2,
  };
}
