import type { IsoMesh } from "../scan/isomesh";
import type { TypologyId } from "../types";

/** Authoring box for a Skill 04 module mock. Drawn at 1/20 so it fills one registration cell. */
export const MODULE_BOX = 20;

/** Module ink stays off the interface teal and copper. */
export const TYPOLOGY_COLOR: Record<TypologyId, [number, number, number]> = {
  lobby: [0.62, 0.54, 0.44],
  workspace: [0.7, 0.7, 0.66],
  gathering: [0.5, 0.56, 0.5],
};

const cache = new Map<string, IsoMesh>();

function hash(value: string) {
  let h = 2166136261;
  for (let i = 0; i < value.length; i += 1) h = Math.imul(h ^ value.charCodeAt(i), 16777619);
  return h >>> 0;
}

function unit(seed: number) {
  let t = seed >>> 0;
  t += 0x6d2b79f5;
  let r = Math.imul(t ^ (t >>> 15), 1 | t);
  r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
  return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
}

function tube(points: Array<[number, number, number]>, radius: number, positions: number[], normals: number[], indices: number[]) {
  const sides = 5;
  const rings: number[] = [];
  for (let i = 0; i < points.length; i += 1) {
    const prev = points[Math.max(0, i - 1)];
    const next = points[Math.min(points.length - 1, i + 1)];
    const tx = next[0] - prev[0];
    const ty = next[1] - prev[1];
    const tz = next[2] - prev[2];
    const length = Math.hypot(tx, ty, tz) || 1;
    const tangent = [tx / length, ty / length, tz / length];
    const nx = -tangent[2];
    const nz = tangent[0];
    const nLength = Math.hypot(nx, nz) || 1;
    rings.push(positions.length / 3);
    for (let side = 0; side < sides; side += 1) {
      const angle = (side / sides) * Math.PI * 2;
      const c = Math.cos(angle);
      const s = Math.sin(angle);
      const ox = (nx / nLength) * c + tangent[0] * s * 0.15;
      const oy = s;
      const oz = (nz / nLength) * c;
      positions.push(points[i][0] + ox * radius, points[i][1] + oy * radius, points[i][2] + oz * radius);
      normals.push(ox, oy, oz);
    }
  }
  for (let ring = 0; ring < rings.length - 1; ring += 1) {
    for (let side = 0; side < sides; side += 1) {
      const a = rings[ring] + side;
      const b = rings[ring] + ((side + 1) % sides);
      const c = rings[ring + 1] + side;
      const d = rings[ring + 1] + ((side + 1) % sides);
      indices.push(a, c, b, b, c, d);
    }
  }
}

/**
 * A plan of a few traces, propagated upward through the 20 box.
 * This is an interface stand-in for a Skill 2 drawing continued as a Skill 3 isomesh.
 * It is not a production Skill 3 output.
 */
export function moduleMock(archetypeId: string): IsoMesh {
  const cached = cache.get(archetypeId);
  if (cached) return cached;
  const seed = hash(archetypeId);
  const positions: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];
  const traces = 4 + (seed % 3);
  for (let trace = 0; trace < traces; trace += 1) {
    const angle = unit(seed + trace * 17) * Math.PI * 2;
    const reach = 3 + unit(seed + trace * 29) * 5;
    const cx = (unit(seed + trace * 3) - 0.5) * 8;
    const cz = (unit(seed + 90 + trace * 5) - 0.5) * 8;
    const points: Array<[number, number, number]> = [];
    for (let level = 0; level < 8; level += 1) {
      const y = -10 + (level / 7) * 20;
      const drift = Math.sin(level * 0.7 + trace) * (0.4 + (seed % 5) * 0.15);
      const gap = trace === 0 && level === 4;
      if (gap) continue;
      const limit = MODULE_BOX / 2 - 1;
      points.push([
        Math.max(-limit, Math.min(limit, cx + Math.cos(angle) * reach * (level / 7) + drift)),
        y,
        Math.max(-limit, Math.min(limit, cz + Math.sin(angle) * reach * (level / 7))),
      ]);
    }
    tube(points, 0.55, positions, normals, indices);
  }
  const scale = 1 / MODULE_BOX;
  const mesh: IsoMesh = {
    positions: Float32Array.from(positions.map((value) => value * scale)),
    normals: Float32Array.from(normals),
    indices: Uint32Array.from(indices),
    triangles: indices.length / 3,
  };
  cache.set(archetypeId, mesh);
  return mesh;
}
