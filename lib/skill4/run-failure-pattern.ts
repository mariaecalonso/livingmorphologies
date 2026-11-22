import { adaptModule, type ReadyModule } from "./adapt";
import type { HybridCandidate } from "./candidate-field";
import { SKILL4_MODULE_CONTRACT, registrationEnvelope, VIEW_SCAN, type FaceId, type Vec3 } from "./contract";
import { generateSectionalCandidate } from "./section-hybrid";
import { registerMeshIntoCell } from "./skill3-handoff";
import { readSolidifiedMesh } from "../skill3/solidified-catalogue";
import { decodeSolidifiedMesh } from "../skill3/solidified-mesh";

const cache = new Map<string, ReadyModule>();
function load(archetypeId: string, candidateId: number, continuationId: string): ReadyModule {
  const key = `${archetypeId}:${candidateId}:${continuationId}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const stored = readSolidifiedMesh(archetypeId, candidateId, continuationId);
  if (!stored?.geometry) throw new Error(`missing ${key}`);
  const registration = registrationEnvelope(VIEW_SCAN.spacing, VIEW_SCAN.yaw);
  const handoff = adaptModule({
    contract: SKILL4_MODULE_CONTRACT,
    moduleId: stored.moduleId ?? key,
    revision: 1,
    archetypeId,
    source: "skill03",
    provisional: false,
    selectedFinal: true,
    scan: { seed: VIEW_SCAN.seed, iso: VIEW_SCAN.iso, spacing: VIEW_SCAN.spacing, yaw: VIEW_SCAN.yaw, slices: 24, stepsBetweenSlices: 22, stoppedOnConverged: false },
    registration,
    geometry: registerMeshIntoCell(decodeSolidifiedMesh(stored.geometry), registration),
    provenance: { role: "skill03-output", note: "failure pattern" },
  });
  if (handoff.status !== "ready") throw new Error(handoff.status);
  cache.set(key, handoff);
  return handoff;
}

function sub(a: Vec3, b: Vec3): Vec3 { return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z }; }
function add(a: Vec3, b: Vec3): Vec3 { return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z }; }
function scale(a: Vec3, k: number): Vec3 { return { x: a.x * k, y: a.y * k, z: a.z * k }; }
function cross(a: Vec3, b: Vec3): Vec3 { return { x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x }; }
function dot(a: Vec3, b: Vec3) { return a.x * b.x + a.y * b.y + a.z * b.z; }
function len(a: Vec3) { return Math.hypot(a.x, a.y, a.z); }
function average(points: Vec3[]): Vec3 {
  const origin = { x: 0, y: 0, z: 0 };
  points.forEach((point) => { origin.x += point.x; origin.y += point.y; origin.z += point.z; });
  return scale(origin, 1 / Math.max(1, points.length));
}
function normalOf(ring: Vec3[]) {
  const origin = average(ring);
  let normal = { x: 0, y: 0, z: 0 };
  for (let index = 0; index < ring.length; index += 1) normal = add(normal, cross(sub(ring[index], origin), sub(ring[(index + 1) % ring.length], origin)));
  const magnitude = len(normal) || 1;
  return scale(normal, 1 / magnitude);
}
function radius(ring: Vec3[]) {
  const origin = average(ring);
  return ring.reduce((sum, point) => sum + len(sub(point, origin)), 0) / ring.length;
}
function reflexAt(ring: Vec3[]) {
  const normal = normalOf(ring);
  const origin = average(ring);
  let deepest = 0;
  let depth = 0;
  let count = 0;
  for (let index = 0; index < ring.length; index += 1) {
    const previous = ring[(index + ring.length - 1) % ring.length];
    const point = ring[index];
    const next = ring[(index + 1) % ring.length];
    const turn = dot(cross(sub(point, previous), sub(next, point)), normal);
    if (turn < 0) count += 1;
    const radial = len(sub(point, origin));
    if (index === 0 || radial < depth) {
      depth = radial;
      deepest = index;
    }
  }
  return { count, deepest };
}
function rotation(previous: Vec3[], next: Vec3[]) {
  const normal = normalOf(next);
  const from = average(previous);
  const to = average(next);
  let carried = sub(previous[0], from);
  carried = sub(carried, scale(normal, dot(carried, normal)));
  let current = sub(next[0], to);
  current = sub(current, scale(normal, dot(current, normal)));
  if (len(carried) < 1e-6 || len(current) < 1e-6) return 0;
  const cosine = Math.max(-1, Math.min(1, dot(scale(carried, 1 / len(carried)), scale(current, 1 / len(current)))));
  return Math.acos(cosine) * 180 / Math.PI;
}

function analyze(name: string, a: [string, number, string], b: [string, number, string], faceA: FaceId, faceB: FaceId, row: number, column: number, id: string) {
  const built = generateSectionalCandidate(
    { moduleA: load(...a), moduleB: load(...b), faceA, faceB },
    { id, row, column, parentAWeight: 0.5, parentBWeight: 0.5, transformationIntensity: 0.34, criteria: [] } as unknown as HybridCandidate,
  );
  const rings = built.loftRings ?? [];
  const openings = built.loftOpenings ?? [];
  const mesh = built.geometry;
  if (!mesh || rings.length < 2) return console.log(`${name} | none | other | 0`);
  const count = rings[0].length;
  const tris: { ids: number[]; points: Vec3[]; station: number }[] = [];
  for (let index = 0; index < mesh.indices.length; index += 3) {
    const ids = [mesh.indices[index], mesh.indices[index + 1], mesh.indices[index + 2]];
    tris.push({
      ids,
      station: [...new Set(ids.map((vertex) => Math.min(rings.length - 1, Math.floor(vertex / count))))].sort((left, right) => left - right).join("-"),
      points: ids.map((vertex) => ({ x: mesh.positions[vertex * 3], y: mesh.positions[vertex * 3 + 1], z: mesh.positions[vertex * 3 + 2] })),
    });
  }
  const hits = (source: Vec3[], target: Vec3[]) => {
    for (let index = 0; index < 3; index += 1) {
      const origin = source[index];
      const direction = sub(source[(index + 1) % 3], origin);
      const edge1 = sub(target[1], target[0]);
      const edge2 = sub(target[2], target[0]);
      const pvec = cross(direction, edge2);
      const det = dot(edge1, pvec);
      if (Math.abs(det) < 1e-8) continue;
      const inverse = 1 / det;
      const u = dot(sub(origin, target[0]), pvec) * inverse;
      if (u < -1e-5 || u > 1.00001) continue;
      const qvec = cross(sub(origin, target[0]), edge1);
      const v = dot(direction, qvec) * inverse;
      if (v < -1e-5 || u + v > 1.00001) continue;
      const t = dot(edge2, qvec) * inverse;
      if (t > 1e-3 && t < 1 - 1e-3) return true;
    }
    return false;
  };
  const bands = new Map<string, number>();
  let total = 0;
  for (let left = 0; left < tris.length; left += 1) {
    for (let right = left + 1; right < tris.length; right += 1) {
      if (tris[left].ids.some((vertex) => tris[right].ids.includes(vertex))) continue;
      if (!hits(tris[left].points, tris[right].points) && !hits(tris[right].points, tris[left].points)) continue;
      const key = [tris[left].station, tris[right].station].sort().join(" x ");
      bands.set(key, (bands.get(key) ?? 0) + 1);
      total += 1;
    }
  }
  const ranked = [...bands.entries()].sort((left, right) => right[1] - left[1]);
  const pairs = rings.slice(0, -1).map((ring, index) => {
    const next = rings[index + 1];
    const left = reflexAt(ring);
    const right = reflexAt(next);
    return {
      pair: `${index}-${index + 1}`,
      ratio: Number((radius(next) / Math.max(1e-4, radius(ring))).toFixed(2)),
      turn: Number(rotation(ring, next).toFixed(1)),
      reflex: [left.count, right.count],
      deepest: [left.deepest, right.deepest],
      openings: [openings[index]?.length ?? 0, openings[index + 1]?.length ?? 0],
    };
  });
  console.log(JSON.stringify({ name, total, top: ranked.slice(0, 5), pairs }));
}

analyze("H13", ["vertical-void", 351, "N24"], ["compressed-sequential", 205, "N03"], "N", "S", 2, 2, "H13");
analyze("H25", ["open-hall", 333, "N08"], ["terraced", 46, "N06"], "W", "E", 4, 2, "H25");
analyze("H06", ["undulated", 71, "N06"], ["stepped-amphitheater", 374, "N03"], "S", "N", 1, 1, "H06");
analyze("H14", ["terraced", 46, "N06"], ["undulated", 71, "N06"], "N", "S", 2, 3, "H14");
analyze("H05", ["flat-deep-plan", 83, "N16"], ["linear-edge-gallery", 121, "N02"], "E", "W", 0, 4, "H05");
