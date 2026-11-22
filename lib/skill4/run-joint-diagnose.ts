/**
 * Isolated joint diagnostic for S04 TEST12 006.
 * Not imported by the app. Does not write catalog files.
 * Run: npx tsx lib/skill4/run-joint-diagnose.ts
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { adaptModule, type ReadyModule } from "./adapt";
import { validateMeshes } from "./assembly-validation";
import type { HybridCandidate } from "./candidate-field";
import { SKILL4_MODULE_CONTRACT, registrationEnvelope, VIEW_SCAN, type FaceId, type Vec3 } from "./contract";
import { connectionProcess, generateSectionalCandidate, terminalSectionPair, type JointVariant } from "./section-hybrid";
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
    provenance: { role: "skill03-output", note: "joint diagnostic" },
  });
  if (handoff.status !== "ready") throw new Error(handoff.status);
  return handoff;
}

const round = (value: number) => Number(value.toFixed(3));
const vec = (point: Vec3) => ({ x: round(point.x), y: round(point.y), z: round(point.z) });
const deg = (radians: number) => round(radians * 180 / Math.PI);

function mean(points: Vec3[]): Vec3 {
  const sum = points.reduce((acc, point) => ({ x: acc.x + point.x, y: acc.y + point.y, z: acc.z + point.z }), { x: 0, y: 0, z: 0 });
  return { x: sum.x / points.length, y: sum.y / points.length, z: sum.z / points.length };
}
function sub(a: Vec3, b: Vec3): Vec3 { return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z }; }
function add(a: Vec3, b: Vec3): Vec3 { return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z }; }
function scale(value: Vec3, factor: number): Vec3 { return { x: value.x * factor, y: value.y * factor, z: value.z * factor }; }
function dot(a: Vec3, b: Vec3) { return a.x * b.x + a.y * b.y + a.z * b.z; }
function cross(a: Vec3, b: Vec3): Vec3 { return { x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x }; }
function length(value: Vec3) { return Math.hypot(value.x, value.y, value.z); }
function normalize(value: Vec3): Vec3 { const span = length(value) || 1; return scale(value, 1 / span); }
function reject(vector: Vec3, axis: Vec3) { return sub(vector, scale(axis, dot(vector, axis))); }

function sectionFrame(ring: Vec3[]) {
  const origin = mean(ring);
  let normal = { x: 0, y: 0, z: 0 };
  for (let index = 0; index < ring.length; index += 1) {
    normal = add(normal, cross(sub(ring[index], origin), sub(ring[(index + 1) % ring.length], origin)));
  }
  const winding = length(normal) < 1e-8 ? 0 : 1;
  normal = length(normal) < 1e-8 ? { x: 0, y: 0, z: 1 } : normalize(normal);
  let up = reject(sub(ring[0], origin), normal);
  if (length(up) < 1e-6) up = reject({ x: 0, y: 1, z: 0 }, normal);
  up = normalize(up);
  const right = normalize(cross(normal, up));
  let minU = Infinity;
  let maxU = -Infinity;
  let minV = Infinity;
  let maxV = -Infinity;
  let reach = 0;
  ring.forEach((point) => {
    const delta = sub(point, origin);
    const u = dot(delta, up);
    const v = dot(delta, right);
    minU = Math.min(minU, u);
    maxU = Math.max(maxU, u);
    minV = Math.min(minV, v);
    maxV = Math.max(maxV, v);
    reach += length(delta);
  });
  return { origin, normal, up, right, winding, width: maxU - minU, height: maxV - minV, reach: reach / ring.length };
}

function bestShift(reference: Vec3[], ring: Vec3[]) {
  const axis = sectionFrame(reference).normal;
  const basisU = sectionFrame(reference).up;
  const basisV = normalize(cross(axis, basisU));
  const project = (points: Vec3[], center: Vec3) => points.map((point) => {
    const delta = sub(point, center);
    return { u: dot(delta, basisU), v: dot(delta, basisV) };
  });
  const left = project(reference, mean(reference));
  const right = project(ring, mean(ring));
  let best = 0;
  let bestCost = Infinity;
  for (let shift = 0; shift < left.length; shift += 1) {
    let travel = 0;
    for (let index = 0; index < left.length; index += 1) {
      const other = right[(index + shift) % right.length];
      travel += (left[index].u - other.u) ** 2 + (left[index].v - other.v) ** 2;
    }
    if (travel < bestCost) {
      bestCost = travel;
      best = shift;
    }
  }
  return best;
}

function pairedDistance(reference: Vec3[], ring: Vec3[], shift: number) {
  const gaps = reference.map((point, index) => length(sub(ring[(index + shift) % ring.length], point)));
  gaps.sort((a, b) => a - b);
  return { mean: round(gaps.reduce((sum, value) => sum + value, 0) / gaps.length), max: round(gaps[gaps.length - 1] ?? 0) };
}

function rotation(previous: ReturnType<typeof sectionFrame>, next: ReturnType<typeof sectionFrame>) {
  const rejected = reject(previous.up, next.normal);
  const carried = length(rejected) < 1e-6 ? next.up : normalize(rejected);
  const cosine = Math.max(-1, Math.min(1, dot(carried, next.up)));
  const sign = dot(cross(carried, next.up), next.normal) >= 0 ? 1 : -1;
  return sign * Math.acos(cosine);
}

function dihedralBetween(ring: Vec3[], next: Vec3[]) {
  let maxDihedral = 0;
  let folds = 0;
  for (let sample = 0; sample < ring.length; sample += 1) {
    const ahead = (sample + 1) % ring.length;
    const left = cross(sub(ring[ahead], ring[sample]), sub(next[sample], ring[sample]));
    const rightSample = ahead;
    const rightAhead = (rightSample + 1) % ring.length;
    const right = cross(sub(ring[rightAhead], ring[rightSample]), sub(next[rightSample], ring[rightSample]));
    if (length(left) < 1e-8 || length(right) < 1e-8) continue;
    const hinge = Math.acos(Math.max(-1, Math.min(1, dot(normalize(left), normalize(right)))));
    maxDihedral = Math.max(maxDihedral, hinge);
    if (hinge > Math.PI / 2) folds += 1;
  }
  return { maxDihedral: deg(maxDihedral), folds };
}

function edgePierces(origin: Vec3, direction: Vec3, tri: Vec3[]) {
  const edge1 = sub(tri[1], tri[0]);
  const edge2 = sub(tri[2], tri[0]);
  const pvec = cross(direction, edge2);
  const det = dot(edge1, pvec);
  if (Math.abs(det) < 1e-8) return false;
  const inverse = 1 / det;
  const tvec = sub(origin, tri[0]);
  const u = dot(tvec, pvec) * inverse;
  if (u < -1e-5 || u > 1.00001) return false;
  const qvec = cross(tvec, edge1);
  const v = dot(direction, qvec) * inverse;
  if (v < -1e-5 || u + v > 1.00001) return false;
  const t = dot(edge2, qvec) * inverse;
  return t > 1e-4 && t < 1 - 1e-4;
}

function zonePiercings(mesh: IsoMesh, samples: number, stationStart: number, stationEnd: number) {
  const first = stationStart * samples;
  const last = (stationEnd + 1) * samples;
  const tris: { ids: number[]; points: Vec3[] }[] = [];
  for (let index = 0; index < mesh.indices.length; index += 3) {
    const ids = [mesh.indices[index], mesh.indices[index + 1], mesh.indices[index + 2]];
    if (ids.some((id) => id < first || id >= last)) continue;
    tris.push({
      ids,
      points: ids.map((id) => ({ x: mesh.positions[id * 3], y: mesh.positions[id * 3 + 1], z: mesh.positions[id * 3 + 2] })),
    });
  }
  let count = 0;
  for (let left = 0; left < tris.length; left += 1) {
    for (let right = left + 1; right < tris.length; right += 1) {
      if (tris[left].ids.some((id) => tris[right].ids.includes(id))) continue;
      const a = tris[left].points;
      const b = tris[right].points;
      let hit = false;
      for (let edge = 0; edge < 3 && !hit; edge += 1) {
        hit = edgePierces(a[edge], sub(a[(edge + 1) % 3], a[edge]), b) || edgePierces(b[edge], sub(b[(edge + 1) % 3], b[edge]), a);
      }
      if (hit) count += 1;
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

function loopArea(ring: Vec3[]) {
  const origin = mean(ring);
  let normal = { x: 0, y: 0, z: 0 };
  for (let index = 0; index < ring.length; index += 1) {
    normal = add(normal, cross(sub(ring[index], origin), sub(ring[(index + 1) % ring.length], origin)));
  }
  return length(normal) * 0.5;
}

function openingSignature(openings: Vec3[][][] | undefined) {
  if (!openings || openings.length === 0) return { stations: 0, loops: 0, areaA: 0, areaB: 0 };
  const areaAt = (station: Vec3[][]) => round(station.reduce((sum, loop) => sum + loopArea(loop), 0));
  return {
    stations: openings.length,
    loops: openings.reduce((sum, station) => sum + station.length, 0),
    areaA: areaAt(openings[0] ?? []),
    areaB: areaAt(openings[openings.length - 1] ?? []),
  };
}

const moduleA = load("void-field", 270, "N19");
const moduleB = load("inserted-horizontal-plate", 265, "N47");
const faceA: FaceId = "N";
const faceB: FaceId = "S";
const parentStamp = `${moduleA.geometry.positions[0]}:${moduleA.geometry.positions.length}:${moduleB.geometry.positions[1]}`;
const record = connectionProcess(moduleA, faceA, moduleB, faceB);
if (!record) throw new Error("no sections");
const boundary = terminalSectionPair(moduleA, faceA, moduleB, faceB);
if (!boundary) throw new Error("no parent boundary");
const candidate = { id: "H10", row: 1, column: 4, parentAWeight: 0.05, parentBWeight: 0.95, transformationIntensity: 0.34, criteria: [] } as unknown as HybridCandidate;

function inspect(rings: Vec3[][], mesh: IsoMesh, parentA: Vec3[], parentB: Vec3[]) {
  const frames = rings.map(sectionFrame);
  const samples = rings[0].length;
  const zone = (start: number, end: number) => {
    const rows = [];
    for (let index = start; index <= end; index += 1) {
      const frame = frames[index];
      const previous = index > 0 ? frames[index - 1] : null;
      const shift = previous ? bestShift(rings[index - 1], rings[index]) : 0;
      const paired = previous ? pairedDistance(rings[index - 1], rings[index], 0) : null;
      const best = previous ? pairedDistance(rings[index - 1], rings[index], shift) : null;
      const parent = index === 0 ? parentA : index === rings.length - 1 ? parentB : null;
      const parentShift = parent && parent.length === rings[index].length ? bestShift(parent, rings[index]) : 0;
      const hinge = index < rings.length - 1 ? dihedralBetween(rings[index], rings[index + 1]) : null;
      rows.push({
        station: index,
        centroid: vec(frame.origin),
        normal: vec(frame.normal),
        up: vec(frame.up),
        right: vec(frame.right),
        rotationFromPrevious: previous ? deg(rotation(previous, frame)) : 0,
        width: round(frame.width),
        height: round(frame.height),
        reach: round(frame.reach),
        winding: frame.winding,
        windingFlips: previous ? dot(frames[index - 1].normal, frame.normal) < 0 : false,
        indexShift: shift,
        indexMean: paired?.mean ?? 0,
        bestMean: best?.mean ?? 0,
        parentIndexMean: parent ? pairedDistance(parent, rings[index], 0).mean : null,
        parentBestMean: parent ? pairedDistance(parent, rings[index], parentShift).mean : null,
        parentShift,
        dihedralToNext: hinge?.maxDihedral ?? null,
        foldsToNext: hinge?.folds ?? null,
      });
    }
    return {
      stations: rows,
      piercings: zonePiercings(mesh, samples, start, end),
    };
  };
  const last = rings.length - 1;
  return {
    count: rings.length,
    parentA: zone(0, Math.min(4, last)),
    parentB: zone(Math.max(0, last - 4), last),
  };
}

function surface(rings: Vec3[][]) {
  let maxDihedral = 0;
  let folds = 0;
  let maxTurn = 0;
  const frames = rings.map(sectionFrame);
  for (let index = 0; index < rings.length - 1; index += 1) {
    const hinge = dihedralBetween(rings[index], rings[index + 1]);
    maxDihedral = Math.max(maxDihedral, hinge.maxDihedral);
    folds += hinge.folds;
    maxTurn = Math.max(maxTurn, Math.abs(deg(rotation(frames[index], frames[index + 1]))));
  }
  return { maxRotation: round(maxTurn), maxDihedral: round(maxDihedral), foldsOver90: folds };
}

function assess(joint: JointVariant, label: string) {
  const built = generateSectionalCandidate({ moduleA, moduleB, faceA, faceB }, candidate, "chord", joint);
  if (built.status !== "ready" || !built.geometry || !built.loftRings) throw new Error(`${label} ${built.status} ${built.reason}`);
  const rings = built.loftRings.map((ring) => ring.map((point) => ({ ...point })));
  const validation = validateMeshes([built.geometry]);
  const shell = manifold(built.geometry);
  const gaps = (ring: Vec3[], face: Vec3[]) => {
    const distances = ring.map((point) => face.reduce((best, target) => Math.min(best, length(sub(point, target))), Infinity));
    return { mean: round(distances.reduce((sum, value) => sum + value, 0) / distances.length), max: round(Math.max(...distances)) };
  };
  const faceAContour = record.a[record.a.length - 1].worldContour;
  const faceBContour = record.b[0].worldContour;
  const openings = openingSignature(built.loftOpenings);
  return {
    label,
    joint,
    inspection: joint === "current" ? inspect(rings, built.geometry, boundary.a, boundary.b) : undefined,
    surface: surface(rings),
    piercings: zonePiercings(built.geometry, rings[0].length, 0, rings.length - 1),
    jointA: gaps(rings[0], faceAContour),
    jointB: gaps(rings[rings.length - 1], faceBContour),
    smoothnessBefore: validation?.before.smoothness ?? null,
    smoothnessAfter: validation?.after.smoothness ?? null,
    largestCorrection: validation ? round(validation.displacement) : null,
    manifold: shell,
    openings,
    verdict: validation?.verdict ?? null,
    positions: Array.from(built.geometry.positions),
    indices: Array.from(built.geometry.indices),
  };
}

const variants: { joint: JointVariant; label: string; color: string }[] = [
  { joint: "current", label: "A — CURRENT", color: "#49d7de" },
  { joint: "correspondence", label: "B — CORRESPONDENCE LOCK", color: "#c77e5f" },
  { joint: "frame", label: "C — FRAME CONTINUITY", color: "#e8e8e8" },
  { joint: "both", label: "D — BOTH", color: "#d7a48a" },
];
const rows = variants.map((item) => assess(item.joint, item.label));
if (`${moduleA.geometry.positions[0]}:${moduleA.geometry.positions.length}:${moduleB.geometry.positions[1]}` !== parentStamp) {
  throw new Error("parent geometry changed");
}
const currentOpenings = rows[0].openings;
const packed = rows.map((row) => ({
  ...row,
  openingsPreserved: row.openings.loops === currentOpenings.loops
    && Math.abs(row.openings.areaA - currentOpenings.areaA) < 0.05
    && Math.abs(row.openings.areaB - currentOpenings.areaB) < 0.05,
  positions: undefined,
  indices: undefined,
}));

const directory = join(tmpdir(), "skill4-joint-diagnose");
mkdirSync(directory, { recursive: true });
writeFileSync(join(directory, "report.json"), JSON.stringify({ pair: "S04 TEST12 006", variants: packed }, null, 2));
const html = `<!doctype html><html><head><meta charset="utf-8"><title>Skill 04 joint diagnostic</title>
<style>html,body{margin:0;background:#000}canvas{display:block;background:#000}</style></head>
<body><canvas id="board" width="1000" height="760"></canvas><script>
const meshes = ${JSON.stringify(rows.map((row, index) => ({ label: variants[index].label, color: variants[index].color, positions: row.positions, indices: row.indices })))};
const canvas = document.getElementById("board");
const ctx = canvas.getContext("2d");
const yaw = 0.9, pitch = 0.42, c = Math.cos(yaw), s = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
function projectRaw(positions) {
  let minX=Infinity,minY=Infinity,minZ=Infinity,maxX=-Infinity,maxY=-Infinity,maxZ=-Infinity;
  for (let i=0;i<positions.length;i+=3){minX=Math.min(minX,positions[i]);minY=Math.min(minY,positions[i+1]);minZ=Math.min(minZ,positions[i+2]);maxX=Math.max(maxX,positions[i]);maxY=Math.max(maxY,positions[i+1]);maxZ=Math.max(maxZ,positions[i+2]);}
  const cx=(minX+maxX)/2, cy=(minY+maxY)/2, cz=(minZ+maxZ)/2;
  const raw=[];
  for (let i=0;i<positions.length;i+=3){
    const dx=positions[i]-cx, dy=positions[i+1]-cy, dz=positions[i+2]-cz;
    const rx=dx*c-dz*s, rz=dx*s+dz*c;
    raw.push({x:rx,y:dy*cp-rz*sp,depth:dy*sp+rz*cp});
  }
  return raw;
}
const projected = meshes.map((item) => projectRaw(item.positions));
let span = 1;
projected.forEach((raw) => raw.forEach((point) => { span = Math.max(span, Math.abs(point.x), Math.abs(point.y)); }));
function draw(item, raw, x0, y0, w, h) {
  const scale = Math.min((w - 70) / (span * 2), (h - 70) / (span * 2));
  const project = (index) => ({ x: x0 + w / 2 + raw[index].x * scale, y: y0 + h / 2 - raw[index].y * scale, depth: raw[index].depth });
  const faces = [];
  for (let i=0;i<item.indices.length;i+=3){
    const a=project(item.indices[i]), b=project(item.indices[i+1]), c2=project(item.indices[i+2]);
    const area=(b.x-a.x)*(c2.y-a.y)-(b.y-a.y)*(c2.x-a.x);
    faces.push({a,b,c:c2,depth:(a.depth+b.depth+c2.depth)/3,light:Math.min(1,Math.max(0.25,0.45+Math.sign(area)*0.25))});
  }
  faces.sort((p,q)=>p.depth-q.depth);
  ctx.strokeStyle="#2a2a2a"; ctx.strokeRect(x0+12,y0+26,w-24,h-38);
  ctx.fillStyle=item.color; ctx.font="13px ui-sans-serif,sans-serif"; ctx.fillText(item.label,x0+20,y0+18);
  faces.forEach((face)=>{
    ctx.beginPath(); ctx.moveTo(face.a.x,face.a.y); ctx.lineTo(face.b.x,face.b.y); ctx.lineTo(face.c.x,face.c.y); ctx.closePath();
    ctx.globalAlpha=0.28+face.light*0.4; ctx.fillStyle=item.color; ctx.fill();
    ctx.globalAlpha=0.9; ctx.strokeStyle=item.color; ctx.lineWidth=0.6; ctx.stroke();
  });
  ctx.globalAlpha=1;
}
ctx.fillStyle="#000"; ctx.fillRect(0,0,canvas.width,canvas.height);
draw(meshes[0], projected[0], 0, 0, 500, 380);
draw(meshes[1], projected[1], 500, 0, 500, 380);
draw(meshes[2], projected[2], 0, 380, 500, 380);
draw(meshes[3], projected[3], 500, 380, 500, 380);
</script></body></html>`;
writeFileSync(join(directory, "index.html"), html);
console.log(JSON.stringify({ directory, variants: packed }, null, 2));
