import type { IsoMesh } from "../scan/isomesh";
import { MOCK_HYBRID_LABEL, MOCK_PREVIEW_SETTINGS } from "./assembly-layout";

export { MOCK_HYBRID_LABEL };

export type MockHybrid = {
  id: string;
  row: number;
  column: number;
  mesh: IsoMesh;
  source: "mock-interface-test";
  validation: "unverified";
  physicallyConnected: false;
  label: typeof MOCK_HYBRID_LABEL;
};

export type MockHybridField = {
  version: typeof MOCK_PREVIEW_SETTINGS.version;
  signature: string;
  candidates: MockHybrid[];
};

const cache = new Map<string, MockHybridField>();

type Point = [number, number, number];

/** A thin tube, the same family as a Skill 3 filament column, laid across the connector depth. */
function tube(points: Point[], radius: number, positions: number[], normals: number[], indices: number[]) {
  const sides = 6;
  const rings: number[] = [];
  for (let i = 0; i < points.length; i += 1) {
    const prev = points[Math.max(0, i - 1)];
    const next = points[Math.min(points.length - 1, i + 1)];
    const tx = next[0] - prev[0];
    const ty = next[1] - prev[1];
    const tz = next[2] - prev[2];
    const length = Math.hypot(tx, ty, tz) || 1;
    const tangent = [tx / length, ty / length, tz / length];
    const helper = Math.abs(tangent[1]) > 0.85 ? [1, 0, 0] : [0, 1, 0];
    const nx = helper[1] * tangent[2] - helper[2] * tangent[1];
    const ny = helper[2] * tangent[0] - helper[0] * tangent[2];
    const nz = helper[0] * tangent[1] - helper[1] * tangent[0];
    const nLength = Math.hypot(nx, ny, nz) || 1;
    const normal = [nx / nLength, ny / nLength, nz / nLength];
    const bx = tangent[1] * normal[2] - tangent[2] * normal[1];
    const by = tangent[2] * normal[0] - tangent[0] * normal[2];
    const bz = tangent[0] * normal[1] - tangent[1] * normal[0];
    rings.push(positions.length / 3);
    for (let side = 0; side < sides; side += 1) {
      const angle = (side / sides) * Math.PI * 2;
      const c = Math.cos(angle);
      const s = Math.sin(angle);
      positions.push(
        points[i][0] + (normal[0] * c + bx * s) * radius,
        points[i][1] + (normal[1] * c + by * s) * radius,
        points[i][2] + (normal[2] * c + bz * s) * radius,
      );
      normals.push(normal[0] * c + bx * s, normal[1] * c + by * s, normal[2] * c + bz * s);
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

function spine(row: number, column: number, bend: number, lift: number): Point[] {
  const depth = MOCK_PREVIEW_SETTINGS.depth;
  const count = 7;
  const points: Point[] = [];
  for (let i = 0; i < count; i += 1) {
    const t = i / (count - 1);
    const gap = row === 2 && t > 0.38 && t < 0.62;
    if (gap) continue;
    const stepped = row === 1 || row === 3 ? Math.round(t * 3) / 3 : t;
    points.push([
      -depth / 2 + t * depth,
      -0.22 + stepped * lift,
      Math.sin(t * Math.PI) * bend,
    ]);
  }
  return points;
}

function mockMesh(row: number, column: number): IsoMesh {
  const t = column / 4;
  const radius = 0.018 + t * 0.028;
  const bend = 0.02 + t * 0.12;
  const lift = 0.2 + (row === 4 ? 0.28 : row * 0.04);
  const positions: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];
  tube(spine(row, column, bend, lift), radius, positions, normals, indices);
  if (row >= 3) {
    const branch = spine(row, column, bend, lift).map((point, index, all) => {
      if (index < all.length / 2) return point;
      return [point[0], point[1] + 0.08, point[2] + 0.1 + t * 0.08] as Point;
    });
    tube(branch, radius * 0.75, positions, normals, indices);
  }
  return {
    positions: Float32Array.from(positions),
    normals: Float32Array.from(normals),
    indices: Uint32Array.from(indices),
    triangles: indices.length / 3,
  };
}

export function mockHybridField(signature: string): MockHybridField {
  const key = `${MOCK_PREVIEW_SETTINGS.version}:${signature}`;
  const cached = cache.get(key);
  if (cached) return cached;
  const candidates: MockHybrid[] = [];
  for (let row = 0; row < 5; row += 1) {
    for (let column = 0; column < 5; column += 1) {
      const index = row * 5 + column + 1;
      candidates.push({
        id: `H${String(index).padStart(2, "0")}`,
        row,
        column,
        mesh: mockMesh(row, column),
        source: "mock-interface-test",
        validation: "unverified",
        physicallyConnected: false,
        label: MOCK_HYBRID_LABEL,
      });
    }
  }
  const field = { version: MOCK_PREVIEW_SETTINGS.version, signature, candidates };
  cache.set(key, field);
  return field;
}
