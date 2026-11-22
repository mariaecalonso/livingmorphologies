/**
 * Isolated Y-chord vs face-normal comparison for one saved Skill 04 pair.
 * Not imported by the app. Does not write catalog files.
 * Run: npx tsx lib/skill4/run-axis-compare.ts
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { adaptModule, type ReadyModule } from "./adapt";
import { validateMeshes } from "./assembly-validation";
import type { HybridCandidate } from "./candidate-field";
import { SKILL4_MODULE_CONTRACT, registrationEnvelope, VIEW_SCAN, type FaceId, type Vec3 } from "./contract";
import { connectionProcess, generateSectionalCandidate, type ConnectorProgression } from "./section-hybrid";
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
    provenance: { role: "skill03-output", note: "axis comparison" },
  });
  if (handoff.status !== "ready") throw new Error(handoff.status);
  return handoff;
}

const round = (value: number) => Number(value.toFixed(3));
const vec = (point: Vec3) => ({ x: round(point.x), y: round(point.y), z: round(point.z) });

function mean(points: Vec3[]): Vec3 {
  const sum = points.reduce((acc, point) => ({ x: acc.x + point.x, y: acc.y + point.y, z: acc.z + point.z }), { x: 0, y: 0, z: 0 });
  return { x: sum.x / points.length, y: sum.y / points.length, z: sum.z / points.length };
}

function sub(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

function dot(a: Vec3, b: Vec3) {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return { x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x };
}

function length(value: Vec3) {
  return Math.hypot(value.x, value.y, value.z);
}

function normalize(value: Vec3): Vec3 {
  const span = length(value) || 1;
  return { x: value.x / span, y: value.y / span, z: value.z / span };
}

function box(positions: ArrayLike<number>) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let index = 0; index < positions.length; index += 3) {
    for (let axis = 0; axis < 3; axis += 1) {
      min[axis] = Math.min(min[axis], positions[index + axis]);
      max[axis] = Math.max(max[axis], positions[index + axis]);
    }
  }
  return { x: round(max[0] - min[0]), y: round(max[1] - min[1]), z: round(max[2] - min[2]) };
}

function ringsOf(mesh: IsoMesh, samples: number): Vec3[][] {
  const count = mesh.positions.length / 3 / samples;
  return Array.from({ length: count }, (_, station) => Array.from({ length: samples }, (__, sample) => {
    const offset = (station * samples + sample) * 3;
    return { x: mesh.positions[offset], y: mesh.positions[offset + 1], z: mesh.positions[offset + 2] };
  }));
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

function readPoint(mesh: IsoMesh, index: number): Vec3 {
  return { x: mesh.positions[index * 3], y: mesh.positions[index * 3 + 1], z: mesh.positions[index * 3 + 2] };
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

function trianglesIntersect(a: Vec3[], b: Vec3[]) {
  for (let index = 0; index < 3; index += 1) {
    if (edgePierces(a[index], sub(a[(index + 1) % 3], a[index]), b)) return true;
    if (edgePierces(b[index], sub(b[(index + 1) % 3], b[index]), a)) return true;
  }
  return false;
}

function selfIntersections(mesh: IsoMesh) {
  const tris: { ids: number[]; points: Vec3[] }[] = [];
  for (let index = 0; index < mesh.indices.length; index += 3) {
    const ids = [mesh.indices[index], mesh.indices[index + 1], mesh.indices[index + 2]];
    tris.push({ ids, points: ids.map((id) => readPoint(mesh, id)) });
  }
  let count = 0;
  for (let left = 0; left < tris.length; left += 1) {
    for (let right = left + 1; right < tris.length; right += 1) {
      if (tris[left].ids.some((id) => tris[right].ids.includes(id))) continue;
      if (trianglesIntersect(tris[left].points, tris[right].points)) count += 1;
    }
  }
  return count;
}

function surfaceReport(rings: Vec3[][]) {
  let maxDihedral = 0;
  let foldsOver90 = 0;
  let maxTurn = 0;
  const angles: number[] = [];
  for (let station = 0; station < rings.length - 1; station += 1) {
    const ring = rings[station];
    const next = rings[station + 1];
    let previous: Vec3 | null = null;
    for (let sample = 0; sample < ring.length; sample += 1) {
      const ahead = (sample + 1) % ring.length;
      const left = cross(sub(ring[ahead], ring[sample]), sub(next[sample], ring[sample]));
      const rightSample = (sample + 1) % ring.length;
      const rightAhead = (rightSample + 1) % ring.length;
      const right = cross(sub(ring[rightAhead], ring[rightSample]), sub(next[rightSample], ring[rightSample]));
      if (length(left) < 1e-8 || length(right) < 1e-8) continue;
      const hinge = Math.acos(Math.max(-1, Math.min(1, dot(normalize(left), normalize(right))))) * 180 / Math.PI;
      maxDihedral = Math.max(maxDihedral, hinge);
      if (hinge > 90) foldsOver90 += 1;
    }
    const step = sub(mean(next), mean(ring));
    if (length(step) < 1e-5) continue;
    const axis = normalize(step);
    const hint = Math.abs(axis.y) < 0.9 ? { x: 0, y: 1, z: 0 } : { x: 1, y: 0, z: 0 };
    const u = normalize(cross(axis, hint));
    let xx = 0;
    let xy = 0;
    let yy = 0;
    const center = mean(ring);
    ring.forEach((point) => {
      const delta = sub(point, center);
      const pu = dot(delta, u);
      const pv = dot(delta, cross(axis, u));
      xx += pu * pu;
      xy += pu * pv;
      yy += pv * pv;
    });
    let angle = 0.5 * Math.atan2(2 * xy, xx - yy);
    if (angles.length > 0) {
      const prior = angles[angles.length - 1];
      while (angle - prior > Math.PI / 2) angle -= Math.PI;
      while (prior - angle > Math.PI / 2) angle += Math.PI;
      maxTurn = Math.max(maxTurn, Math.abs(angle - prior) * 180 / Math.PI);
    }
    angles.push(angle);
    previous = axis;
    void previous;
  }
  return { maxDihedral: round(maxDihedral), foldsOver90, maxTwistStep: round(maxTurn), totalTwist: round(Math.abs((angles.at(-1) ?? 0) - (angles[0] ?? 0)) * 180 / Math.PI) };
}

function nearest(points: Vec3[], target: Vec3) {
  return points.reduce((best, point) => Math.min(best, length(sub(point, target))), Infinity);
}

function jointGap(ring: Vec3[], face: Vec3[]) {
  const gaps = ring.map((point) => nearest(face, point));
  gaps.sort((a, b) => a - b);
  return { mean: round(gaps.reduce((sum, value) => sum + value, 0) / gaps.length), max: round(gaps[gaps.length - 1] ?? 0) };
}

const moduleA = load("void-field", 270, "N19");
const moduleB = load("inserted-horizontal-plate", 265, "N47");
const faceA: FaceId = "N";
const faceB: FaceId = "S";
const parentStamp = `${moduleA.geometry.positions[0]}:${moduleA.geometry.positions.length}:${moduleB.geometry.positions[1]}`;
const record = connectionProcess(moduleA, faceA, moduleB, faceB);
if (!record) throw new Error("no sections");
const sourceFace = record.a[record.a.length - 1].worldContour;
const targetFace = record.b[0].worldContour;
const sourceCenter = mean(sourceFace);
const targetCenter = mean(targetFace);
const target = normalize(sub(targetCenter, sourceCenter));
const candidate = { id: "H10", row: 1, column: 4, parentAWeight: 0.05, parentBWeight: 0.95, transformationIntensity: 0.34, criteria: [] } as unknown as HybridCandidate;

function ringNormal(ring: Vec3[]): Vec3 {
  const center = mean(ring);
  const acc = { x: 0, y: 0, z: 0 };
  for (let index = 0; index < ring.length; index += 1) {
    const edge = cross(sub(ring[index], center), sub(ring[(index + 1) % ring.length], center));
    acc.x += edge.x;
    acc.y += edge.y;
    acc.z += edge.z;
  }
  const normal = normalize(acc);
  return dot(normal, target) >= 0 ? normal : { x: -normal.x, y: -normal.y, z: -normal.z };
}

function spineBow(rings: Vec3[][]) {
  const start = mean(rings[0]);
  const end = mean(rings[rings.length - 1]);
  const chord = sub(end, start);
  const span = length(chord) || 1;
  return round(rings.reduce((best, ring) => {
    const point = mean(ring);
    const t = dot(sub(point, start), chord) / (span * span);
    const projected = { x: start.x + chord.x * t, y: start.y + chord.y * t, z: start.z + chord.z * t };
    return Math.max(best, length(sub(point, projected)));
  }, 0));
}

function assess(progression: ConnectorProgression, label: string) {
  const built = generateSectionalCandidate({ moduleA, moduleB, faceA, faceB }, candidate, progression);
  if (built.status !== "ready" || !built.geometry || !built.loftRings) throw new Error(`${label} ${built.status} ${built.reason}`);
  const rings = built.loftRings.map((ring) => ring.map((point) => ({ ...point })));
  const start = mean(rings[0]);
  const end = mean(rings[rings.length - 1]);
  const axis = normalize(sub(end, start));
  const section = ringNormal(rings[Math.floor(rings.length / 2)]);
  const validation = validateMeshes([built.geometry]);
  const shell = manifold(built.geometry);
  return {
    label,
    progression,
    sourceFaceCenter: vec(sourceCenter),
    targetFaceCenter: vec(targetCenter),
    connectionAxis: vec(axis),
    sectionNormal: vec(section),
    sectionDominant: Math.abs(section.x) >= Math.abs(section.y) && Math.abs(section.x) >= Math.abs(section.z) ? "X" : Math.abs(section.y) >= Math.abs(section.z) ? "Y" : "Z",
    spineBow: spineBow(rings),
    axisDotTarget: round(dot(axis, target)),
    dominantAxis: Math.abs(axis.x) >= Math.abs(axis.y) && Math.abs(axis.x) >= Math.abs(axis.z) ? "X" : Math.abs(axis.y) >= Math.abs(axis.z) ? "Y" : "Z",
    bbox: box(built.geometry.positions),
    spineStart: vec(start),
    spineEnd: vec(end),
    spansTowardTarget: dot(axis, target) > 0.9,
    surface: surfaceReport(rings),
    selfIntersections: selfIntersections(built.geometry),
    manifold: shell,
    jointA: jointGap(rings[0], sourceFace),
    jointB: jointGap(rings[rings.length - 1], targetFace),
    smoothnessBefore: validation?.before.smoothness ?? null,
    smoothnessAfter: validation?.after.smoothness ?? null,
    largestCorrection: validation ? round(validation.displacement) : null,
    verdict: validation?.verdict ?? null,
    note: validation?.note ?? "",
    positions: Array.from(built.geometry.positions),
    indices: Array.from(built.geometry.indices),
  };
}

const baseline = assess("chord", "Y-AXIS BASELINE");
const tested = assess("face", "Z-AXIS TEST");
if (`${moduleA.geometry.positions[0]}:${moduleA.geometry.positions.length}:${moduleB.geometry.positions[1]}` !== parentStamp) {
  throw new Error("parent geometry changed");
}

const directory = join(tmpdir(), "skill4-axis-compare");
mkdirSync(directory, { recursive: true });
const pack = (row: ReturnType<typeof assess>) => ({ ...row, positions: undefined, indices: undefined });
writeFileSync(join(directory, "report.json"), JSON.stringify({
  pair: "S04 TEST12 006",
  modules: ["carved-mass:void-field:270:N19", "carved-mass:inserted-horizontal-plate:265:N47"],
  faces: [faceA, faceB],
  faceNormals: { A: moduleA.faces[faceA].normal, B: moduleB.faces[faceB].normal },
  baseline: pack(baseline),
  tested: pack(tested),
}, null, 2));
const html = `<!doctype html>
<html><head><meta charset="utf-8"><title>Skill 04 axis test</title>
<style>
  html,body{margin:0;background:#000;color:#e8e8e8;font:12px/1.4 ui-sans-serif,sans-serif}
  main{display:grid;grid-template-columns:1fr;gap:28px;padding:28px 60px;max-width:1100px}
  h1{margin:0 0 8px;font-size:13px;letter-spacing:.14em;font-weight:500}
  p{margin:0 0 12px;color:#9a9a9a}
  canvas{width:100%;height:480px;background:#000;border:1px solid #2a2a2a}
  .a h1{color:#49d7de}.b h1{color:#c77e5f}
</style></head><body>
<main>
  <section class="a"><h1>Y-AXIS BASELINE</h1><p>Chord frames. Spine ${baseline.connectionAxis.x}, ${baseline.connectionAxis.y}, ${baseline.connectionAxis.z}. Section normal ${baseline.sectionNormal.x}, ${baseline.sectionNormal.y}, ${baseline.sectionNormal.z}</p><canvas id="a" width="900" height="560"></canvas></section>
  <section class="b"><h1>Z-AXIS TEST</h1><p>Face-normal frames. Spine ${tested.connectionAxis.x}, ${tested.connectionAxis.y}, ${tested.connectionAxis.z}. Section normal ${tested.sectionNormal.x}, ${tested.sectionNormal.y}, ${tested.sectionNormal.z}</p><canvas id="b" width="900" height="560"></canvas></section>
</main>
<script>
const meshes = ${JSON.stringify([
  { id: "a", positions: baseline.positions, indices: baseline.indices, color: "#49d7de" },
  { id: "b", positions: tested.positions, indices: tested.indices, color: "#c77e5f" },
])};
function draw(item) {
  const canvas = document.getElementById(item.id);
  const ctx = canvas.getContext("2d");
  const p = item.positions;
  let minX=Infinity,minY=Infinity,minZ=Infinity,maxX=-Infinity,maxY=-Infinity,maxZ=-Infinity;
  for (let i=0;i<p.length;i+=3){ minX=Math.min(minX,p[i]); minY=Math.min(minY,p[i+1]); minZ=Math.min(minZ,p[i+2]); maxX=Math.max(maxX,p[i]); maxY=Math.max(maxY,p[i+1]); maxZ=Math.max(maxZ,p[i+2]); }
  const cx=(minX+maxX)/2, cy=(minY+maxY)/2, cz=(minZ+maxZ)/2;
  const span=Math.max(maxX-minX,maxY-minY,maxZ-minZ,1);
  const yaw=0.9, pitch=0.42, c=Math.cos(yaw), s=Math.sin(yaw), cp=Math.cos(pitch), sp=Math.sin(pitch);
  const project=(x,y,z)=>{ const dx=x-cx, dy=y-cy, dz=z-cz; const rx=dx*c-dz*s, rz=dx*s+dz*c; const ry=dy*cp-rz*sp, depth=dy*sp+rz*cp; return {x:canvas.width/2+rx/span*canvas.width*0.72, y:canvas.height/2-ry/span*canvas.height*0.72, depth}; };
  const faces=[];
  for (let i=0;i<item.indices.length;i+=3){
    const a=project(p[item.indices[i]*3],p[item.indices[i]*3+1],p[item.indices[i]*3+2]);
    const b=project(p[item.indices[i+1]*3],p[item.indices[i+1]*3+1],p[item.indices[i+1]*3+2]);
    const c2=project(p[item.indices[i+2]*3],p[item.indices[i+2]*3+1],p[item.indices[i+2]*3+2]);
    const area=(b.x-a.x)*(c2.y-a.y)-(b.y-a.y)*(c2.x-a.x);
    faces.push({a,b,c:c2,depth:(a.depth+b.depth+c2.depth)/3,light:Math.min(1,Math.max(0.25,0.45+area/800))});
  }
  faces.sort((u,v)=>u.depth-v.depth);
  ctx.clearRect(0,0,canvas.width,canvas.height);
  faces.forEach((face)=>{
    ctx.beginPath(); ctx.moveTo(face.a.x,face.a.y); ctx.lineTo(face.b.x,face.b.y); ctx.lineTo(face.c.x,face.c.y); ctx.closePath();
    ctx.fillStyle=item.color; ctx.globalAlpha=0.22+face.light*0.45; ctx.fill();
    ctx.globalAlpha=0.8; ctx.strokeStyle=item.color; ctx.lineWidth=0.6; ctx.stroke();
  });
  ctx.globalAlpha=1;
}
meshes.forEach(draw);
</script></body></html>`;
writeFileSync(join(directory, "index.html"), html);
console.log(JSON.stringify({ directory, baseline: pack(baseline), tested: pack(tested) }, null, 2));
