/**
 * Confirms correspondence lock is the default on the regression case and three other saved pairs.
 * Run: npx tsx lib/skill4/run-lock-check.ts
 */
import { adaptModule, type ReadyModule } from "./adapt";
import { validateMeshes } from "./assembly-validation";
import type { HybridCandidate } from "./candidate-field";
import { SKILL4_MODULE_CONTRACT, registrationEnvelope, VIEW_SCAN, type FaceId, type Vec3 } from "./contract";
import { loftSectionRings } from "./hybrid-spine";
import { generateSectionalCandidate as generatePrevious } from "./section-hybrid-previous";
import { generateSectionalCandidate, terminalSectionPair } from "./section-hybrid";
import { registerMeshIntoCell } from "./skill3-handoff";
import { readSolidifiedMesh } from "../skill3/solidified-catalogue";
import { decodeSolidifiedMesh } from "../skill3/solidified-mesh";
import type { IsoMesh } from "../scan/isomesh";

function load(archetypeId: string, candidateId: number, continuationId: string): ReadyModule {
  const stored = readSolidifiedMesh(archetypeId, candidateId, continuationId);
  if (!stored?.geometry) throw new Error(`missing ${archetypeId}`);
  const registration = registrationEnvelope(VIEW_SCAN.spacing, VIEW_SCAN.yaw);
  const handoff = adaptModule({
    contract: SKILL4_MODULE_CONTRACT,
    moduleId: stored.moduleId ?? `${archetypeId}:${candidateId}:${continuationId}`,
    revision: 1,
    archetypeId,
    source: "skill03",
    provisional: false,
    selectedFinal: true,
    scan: { seed: VIEW_SCAN.seed, iso: VIEW_SCAN.iso, spacing: VIEW_SCAN.spacing, yaw: VIEW_SCAN.yaw, slices: 24, stepsBetweenSlices: 22, stoppedOnConverged: false },
    registration,
    geometry: registerMeshIntoCell(decodeSolidifiedMesh(stored.geometry), registration),
    provenance: { role: "skill03-output", note: "correspondence lock check" },
  });
  if (handoff.status !== "ready") throw new Error(handoff.status);
  return handoff;
}

const round = (value: number) => Number(value.toFixed(3));
function add(a: Vec3, b: Vec3): Vec3 { return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z }; }
function sub(a: Vec3, b: Vec3): Vec3 { return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z }; }
function scale(value: Vec3, factor: number): Vec3 { return { x: value.x * factor, y: value.y * factor, z: value.z * factor }; }
function dot(a: Vec3, b: Vec3) { return a.x * b.x + a.y * b.y + a.z * b.z; }
function cross(a: Vec3, b: Vec3): Vec3 { return { x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x }; }
function length(value: Vec3) { return Math.hypot(value.x, value.y, value.z); }
function mean(points: Vec3[]): Vec3 { return scale(points.reduce((sum, point) => add(sum, point), { x: 0, y: 0, z: 0 }), 1 / points.length); }

function piercingsOf(mesh: IsoMesh) {
  const tris: { ids: number[]; points: Vec3[] }[] = [];
  for (let index = 0; index < mesh.indices.length; index += 3) {
    const ids = [mesh.indices[index], mesh.indices[index + 1], mesh.indices[index + 2]];
    tris.push({ ids, points: ids.map((id) => ({ x: mesh.positions[id * 3], y: mesh.positions[id * 3 + 1], z: mesh.positions[id * 3 + 2] })) });
  }
  let count = 0;
  for (let left = 0; left < tris.length; left += 1) {
    for (let right = left + 1; right < tris.length; right += 1) {
      if (tris[left].ids.some((id) => tris[right].ids.includes(id))) continue;
      const hit = (a: Vec3[], b: Vec3[]) => {
        for (let edge = 0; edge < 3; edge += 1) {
          const origin = a[edge];
          const direction = sub(a[(edge + 1) % 3], origin);
          const edge1 = sub(b[1], b[0]);
          const edge2 = sub(b[2], b[0]);
          const pvec = cross(direction, edge2);
          const det = dot(edge1, pvec);
          if (Math.abs(det) < 1e-8) continue;
          const inverse = 1 / det;
          const tvec = sub(origin, b[0]);
          const u = dot(tvec, pvec) * inverse;
          if (u < -1e-5 || u > 1.00001) continue;
          const qvec = cross(tvec, edge1);
          const v = dot(direction, qvec) * inverse;
          if (v < -1e-5 || u + v > 1.00001) continue;
          const t = dot(edge2, qvec) * inverse;
          if (t > 1e-4 && t < 1 - 1e-4) return true;
        }
        return false;
      };
      if (hit(tris[left].points, tris[right].points) || hit(tris[right].points, tris[left].points)) count += 1;
    }
  }
  return count;
}

function manifold(mesh: IsoMesh) {
  const edges = new Map<string, number>();
  for (let index = 0; index < mesh.indices.length; index += 3) {
    const tri = [mesh.indices[index], mesh.indices[index + 1], mesh.indices[index + 2]];
    for (let edge = 0; edge < 3; edge += 1) {
      const a = tri[edge];
      const b = tri[(edge + 1) % 3];
      const key = a < b ? `${a}:${b}` : `${b}:${a}`;
      edges.set(key, (edges.get(key) ?? 0) + 1);
    }
  }
  let boundary = 0;
  let nonManifold = 0;
  edges.forEach((count) => {
    if (count === 1) boundary += 1;
    else if (count !== 2) nonManifold += 1;
  });
  return { boundary, nonManifold, closed: boundary === 0 && nonManifold === 0 };
}

function pairCost(source: Vec3[], reference: Vec3[]) {
  let best = 0;
  let bestCost = Infinity;
  for (let shift = 0; shift < source.length; shift += 1) {
    let cost = 0;
    for (let index = 0; index < source.length; index += 1) {
      const point = source[(index + shift) % source.length];
      const target = reference[index];
      cost += (point.x - target.x) ** 2 + (point.y - target.y) ** 2 + (point.z - target.z) ** 2;
    }
    if (cost < bestCost) {
      bestCost = cost;
      best = shift;
    }
  }
  return best;
}

function sizes(rings: Vec3[][]) {
  return rings.map((ring) => {
    const origin = mean(ring);
    let normal = { x: 0, y: 0, z: 0 };
    for (let index = 0; index < ring.length; index += 1) normal = add(normal, cross(sub(ring[index], origin), sub(ring[(index + 1) % ring.length], origin)));
    const axis = length(normal) < 1e-8 ? { x: 0, y: 0, z: 1 } : scale(normal, 1 / length(normal));
    let up = sub(ring[0], origin);
    up = sub(up, scale(axis, dot(up, axis)));
    up = scale(up, 1 / (length(up) || 1));
    const right = cross(axis, up);
    let minU = Infinity, maxU = -Infinity, minV = Infinity, maxV = -Infinity;
    ring.forEach((point) => {
      const delta = sub(point, origin);
      minU = Math.min(minU, dot(delta, up)); maxU = Math.max(maxU, dot(delta, up));
      minV = Math.min(minV, dot(delta, right)); maxV = Math.max(maxV, dot(delta, right));
    });
    return { width: round(maxU - minU), height: round(maxV - minV) };
  });
}

const expectedH10 = [
  { width: 10.607, height: 5.593 },
  { width: 10.149, height: 12.335 },
  { width: 9.508, height: 6.923 },
  { width: 13.013, height: 9.127 },
  { width: 10.969, height: 9.747 },
  { width: 10.505, height: 9.77 },
  { width: 10.605, height: 9.851 },
];

function check(id: string, moduleA: ReadyModule, faceA: FaceId, moduleB: ReadyModule, faceB: FaceId, hybrid: string, expectSilhouette: boolean) {
  const stamp = `${moduleA.geometry.positions[0]}:${moduleA.geometry.positions.length}:${moduleB.geometry.positions[1]}`;
  const boundary = terminalSectionPair(moduleA, faceA, moduleB, faceB);
  const candidate = { id: hybrid, row: hybrid === "H10" ? 1 : hybrid === "H13" ? 2 : hybrid === "H25" ? 4 : 0, column: hybrid === "H10" ? 4 : 2, parentAWeight: 0.5, parentBWeight: 0.5, transformationIntensity: 0.34, criteria: [] } as unknown as HybridCandidate;
  const built = generateSectionalCandidate({ moduleA, moduleB, faceA, faceB }, candidate);
  const previous = generatePrevious({ moduleA, moduleB, faceA, faceB }, candidate);
  const parentChanged = `${moduleA.geometry.positions[0]}:${moduleA.geometry.positions.length}:${moduleB.geometry.positions[1]}` !== stamp;
  if (built.status !== "ready" || !built.geometry || !built.loftRings) {
    return { id, status: "FAIL", reason: `${built.status} ${built.reason}` };
  }
  const rings = built.loftRings;
  const shifts = rings.slice(1).map((ring, index) => pairCost(ring, rings[index]));
  const validation = validateMeshes([built.geometry]);
  const closed = manifold(built.geometry);
  const piercings = piercingsOf(built.geometry);
  const measured = sizes(rings);
  const silhouette = !expectSilhouette || measured.every((size, index) => Math.abs(size.width - expectedH10[index].width) < 0.02 && Math.abs(size.height - expectedH10[index].height) < 0.02);
  const residual = shifts.find((shift) => shift !== 0) ?? 0;
  const aligned = residual === 0 ? null : loftSectionRings(rings.map((ring, index) => {
    const station = rings.indexOf(ring);
    void station;
    const breakAt = shifts.findIndex((shift) => shift !== 0);
    return index > breakAt ? ring.map((_, sample) => ring[(sample + residual) % ring.length]) : ring;
  }));
  const pass = built.status === "ready"
    && piercings === 0
    && closed.closed
    && !parentChanged
    && silhouette
    && (validation?.verdict !== "unresolved")
    && (!expectSilhouette || (validation?.note ?? "").includes("left in place"));
  return {
    id,
    status: pass ? "PASS" : "FAIL",
    hybrid,
    faces: `${faceA} → ${faceB}`,
    piercings,
    previousPiercings: previous.status === "ready" && previous.geometry ? piercingsOf(previous.geometry) : null,
    piercingsWithoutTailJump: aligned ? piercingsOf(aligned) : piercings,
    shifts,
    manifold: closed,
    parentChanged,
    spineSamples: rings.map((ring) => mean(ring)).map((point) => ({ x: round(point.x), y: round(point.y), z: round(point.z) })),
    sizes: measured,
    silhouette,
    verdict: validation?.verdict ?? null,
    note: validation?.note ?? "",
    displacement: validation ? round(validation.displacement) : null,
    openings: (built.loftOpenings ?? []).reduce((sum, station) => sum + station.length, 0),
    boundary: boundary ? "present" : "missing",
  };
}

const regressionA = load("void-field", 270, "N19");
const regressionB = load("inserted-horizontal-plate", 265, "N47");
const rows = [
  check("S04 TEST12 006", regressionA, "N", regressionB, "S", "H10", true),
  check("S04 TEST2 003", load("compressed-sequential", 205, "N03"), "E", load("linear-edge-gallery", 121, "N02"), "W", "H01", false),
  check("S04 TEST10 013", load("vertical-void", 351, "N24"), "N", load("compressed-sequential", 205, "N03"), "S", "H13", false),
  check("S04 TEST10 034", load("open-hall", 333, "N08"), "W", load("terraced", 46, "N06"), "E", "H25", false),
];
console.log(JSON.stringify(rows, null, 2));
