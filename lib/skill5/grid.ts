import type { XZ } from "./site-model";

/** Developable-site reference. Phase 2 can pass positions through snapSitePlan. */
export const SITE_GRID_FEET = 10;

export function snapSitePlan(x: number, z: number, step = SITE_GRID_FEET) {
  return {
    x: Math.round(x / step) * step,
    z: Math.round(z / step) * step,
  };
}

function intersections(ring: readonly XZ[], axis: "x" | "z", value: number) {
  const hits: number[] = [];
  for (let index = 0; index < ring.length; index += 1) {
    const start = ring[index];
    const end = ring[(index + 1) % ring.length];
    const a0 = axis === "x" ? start[0] : start[1];
    const a1 = axis === "x" ? end[0] : end[1];
    const b0 = axis === "x" ? start[1] : start[0];
    const b1 = axis === "x" ? end[1] : end[0];
    const span = a1 - a0;
    if (Math.abs(span) < 1e-8) continue;
    const t = (value - a0) / span;
    if (t < 0 || t >= 1) continue;
    hits.push(b0 + (b1 - b0) * t);
  }
  hits.sort((left, right) => left - right);
  return hits;
}

/** Grid segments inside the site ring. Positions are x, y, z triples. */
export function siteGridPositions(ring: readonly XZ[], y: number, step = SITE_GRID_FEET) {
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const [x, z] of ring) {
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minZ = Math.min(minZ, z);
    maxZ = Math.max(maxZ, z);
  }
  const positions: number[] = [];
  const push = (x0: number, z0: number, x1: number, z1: number) => {
    positions.push(x0, y, z0, x1, y, z1);
  };
  for (let x = Math.ceil(minX / step) * step; x <= maxX; x += step) {
    const hits = intersections(ring, "x", x);
    for (let index = 0; index + 1 < hits.length; index += 2) push(x, hits[index], x, hits[index + 1]);
  }
  for (let z = Math.ceil(minZ / step) * step; z <= maxZ; z += step) {
    const hits = intersections(ring, "z", z);
    for (let index = 0; index + 1 < hits.length; index += 2) push(hits[index], z, hits[index + 1], z);
  }
  return new Float32Array(positions);
}
