import type { IsoMesh } from "../scan/isomesh";
import { booleanIntersection, booleanUnion, booleanVolume, isoMeshToBooleanMesh } from "./boolean-adapter";
import { closeConnectorLoft, diagnoseTopology } from "./boolean-conditioning";
import { placeTileMesh } from "./boolean-execution";
import type { FaceFrame, Vec3 } from "./contract";
import { faceAttachmentField } from "./face-field";
import { faceSurfaceHighlight } from "./face-outline";
import { HYBRID_GENERATOR_SETTINGS } from "./hybrid-generator";
import { coreDistanceSignature } from "./hybrid-attachment";
import type { Mat3 } from "./tile-basis";
import { rotateByBasis } from "./tile-basis";
import type { TileInstance } from "./tiles";

/**
 * Three-body connection.
 * Parent A, the intact H## solid, and Parent B become one solid only when
 * each local merge body has positive volume inside both neighbors.
 * The hybrid vertices are rigidly placed. They are not scaled or rebuilt.
 */
export const LOCAL_MERGE_SETTINGS = {
  version: "skill4-local-merge-v1",
  positiveVolume: 0.05,
  penetrations: [0.55, 0.9, 1.35],
} as const;

export type MergeCheck = "PASS" | "FAIL";

export type MergeSideReport = {
  parentToMerge: MergeCheck;
  mergeToHybrid: MergeCheck;
  parentOverlap: number;
  hybridOverlap: number;
};

export type ThreeBodyJoin = {
  pass: boolean;
  sideA: MergeSideReport;
  sideB: MergeSideReport;
  componentCount: number | null;
  floating: number;
  coreIntact: boolean;
  boolean: "READY" | "FAILED" | "UNRESOLVED";
  reason: string;
  hybrid: IsoMesh | null;
  mergeA: IsoMesh | null;
  mergeB: IsoMesh | null;
  assembly: IsoMesh | null;
  parentBPose: Pose | null;
};

type Pose = Pick<TileInstance, "transform" | "rotation" | "rotationQuarter" | "mirror">;

const IDENTITY: Pose = {
  transform: { x: 0, y: 0, z: 0 },
  rotationQuarter: 0,
  mirror: null,
};

export async function joinThreeBodies(args: {
  parentA: IsoMesh;
  parentB: IsoMesh;
  frameA: FaceFrame;
  frameB: FaceFrame;
  hybrid: IsoMesh;
}): Promise<ThreeBodyJoin> {
  const steps = HYBRID_GENERATOR_SETTINGS.loftSteps;
  const samples = args.hybrid.positions.length / 3 / steps;
  const blank = emptyJoin("hybrid-not-solid");
  if (!Number.isInteger(samples) || samples < 3) return blank;
  const existing = diagnoseTopology(args.hybrid);
  const rawKernel = await isoMeshToBooleanMesh(args.hybrid);
  rawKernel.mesh?.release();
  const capped = rawKernel.status === "ready"
    ? { status: "ready" as const, mesh: args.hybrid, reason: "" }
    : closeConnectorLoft(args.hybrid, samples, steps);
  if (capped.status !== "ready" || !capped.mesh) {
    return {
      ...blank,
      reason: `${rawKernel.reason || rawKernel.status};${capped.reason || "hybrid-not-solid"};boundary:${existing.boundaryEdgeCount};nonmanifold:${existing.nonManifoldEdgeCount}`,
    };
  }
  const kernel = capped.mesh === args.hybrid ? rawKernel : await isoMeshToBooleanMesh(capped.mesh);
  if (capped.mesh !== args.hybrid) kernel.mesh?.release();
  if (kernel.status !== "ready") return { ...blank, reason: `hybrid-kernel:${kernel.reason || kernel.status}` };
  const sourceA = ringCentroid(args.hybrid, 0, samples);
  const sourceB = ringCentroid(args.hybrid, samples * (steps - 1), samples);
  const span = length(sub(sourceB, sourceA));
  const radius = Math.min(2.2, Math.max(0.55, ringRadius(args.hybrid, 0, samples) * 0.42));
  const coreBefore = coreDistanceSignature(args.hybrid).span;
  const siteA = mergeSite(args.parentA, args.frameA);
  const siteB = mergeSite(args.parentB, args.frameB);
  let last = blank;
  for (const penetration of LOCAL_MERGE_SETTINGS.penetrations) {
    if (span <= penetration * 2 + 0.4) continue;
    const attempt = await attemptJoin({
      ...args,
      closed: capped.mesh,
      sourceA,
      sourceB,
      samples,
      siteA,
      siteB,
      span,
      radius,
      penetration,
      coreBefore,
    });
    last = attempt;
    if (attempt.pass) return attempt;
  }
  return last;
}

async function attemptJoin(args: {
  parentA: IsoMesh;
  parentB: IsoMesh;
  frameA: FaceFrame;
  frameB: FaceFrame;
  hybrid: IsoMesh;
  closed: IsoMesh;
  sourceA: Vec3;
  sourceB: Vec3;
  samples: number;
  siteA: Vec3;
  siteB: Vec3;
  span: number;
  radius: number;
  penetration: number;
  coreBefore: number;
}): Promise<ThreeBodyJoin> {
  const axis = normalize(args.frameA.normal);
  const gap = args.span - args.penetration * 2;
  const worldSiteB = add(args.siteA, scale(axis, gap));
  const targetA = add(args.siteA, scale(axis, -args.penetration));
  const targetB = add(targetA, scale(axis, args.span));
  const placedHybrid = rigidCopy(args.hybrid, args.sourceA, args.sourceB, targetA, targetB, args.frameA.u, args.samples);
  const placedClosed = rigidCopy(args.closed, args.sourceA, args.sourceB, targetA, targetB, args.frameA.u, args.samples);
  const coreIntact = Math.abs(coreDistanceSignature(placedHybrid).span - args.coreBefore) <= 1e-3
    && placedHybrid.positions.length === args.hybrid.positions.length
    && placedHybrid.indices.length === args.hybrid.indices.length;
  const solidA = placeTileMesh(args.parentA, IDENTITY);
  const mergeA = await orientSolid(inwardCylinder(args.siteA, axis, args.penetration, args.radius));
  const inwardB = scale(axis, -1);
  let mergeB = await orientSolid(inwardCylinder(worldSiteB, inwardB, args.penetration, args.radius));
  const hybridSolid = await orientSolid(placedClosed);
  if (!solidA || !mergeA || !mergeB || !hybridSolid || !coreIntact) {
    return { ...emptyJoin(!coreIntact ? "core-changed" : "solid-orientation"), hybrid: placedHybrid, parentBPose: null };
  }
  let outwardB = scale(axis, -1);
  let poseB = poseForFace(args.frameB, args.siteB, outwardB, args.frameA.u, worldSiteB);
  let solidB = placeTileMesh(args.parentB, poseB);
  let parentOverlapB = solidB ? await parentOverlap(solidB, mergeB, add(worldSiteB, scale(outwardB, -(args.penetration + 0.45))), add(worldSiteB, scale(outwardB, 0.2))) : 0;
  const flippedOutward = axis;
  const flippedPose = poseForFace(args.frameB, args.siteB, flippedOutward, args.frameA.u, worldSiteB);
  const flippedMerge = await orientSolid(inwardCylinder(worldSiteB, flippedOutward, args.penetration, args.radius));
  const flippedSolid = placeTileMesh(args.parentB, flippedPose);
  const flippedOverlap = flippedSolid && flippedMerge
    ? await parentOverlap(flippedSolid, flippedMerge, add(worldSiteB, scale(flippedOutward, -(args.penetration + 0.45))), add(worldSiteB, scale(flippedOutward, 0.2)))
    : 0;
  if (flippedOverlap > parentOverlapB && flippedSolid && flippedMerge) {
    outwardB = flippedOutward;
    poseB = flippedPose;
    solidB = flippedSolid;
    mergeB = flippedMerge;
    parentOverlapB = flippedOverlap;
  }
  if (!solidB) return emptyJoin("parent-placement");
  const parentOverlapA = await parentOverlap(solidA, mergeA, add(args.siteA, scale(axis, -(args.penetration + 0.45))), add(args.siteA, scale(axis, 0.2)));
  const hybridOverlapA = await overlapVolume(hybridSolid, mergeA);
  const hybridOverlapB = await overlapVolume(hybridSolid, mergeB);
  const sideA = sideReport(parentOverlapA, hybridOverlapA);
  const sideB = sideReport(parentOverlapB, hybridOverlapB);
  const base: ThreeBodyJoin = {
    pass: false,
    sideA,
    sideB,
    componentCount: null,
    floating: 3,
    coreIntact,
    boolean: "UNRESOLVED",
    reason: "",
    hybrid: placedHybrid,
    mergeA,
    mergeB,
    assembly: null,
    parentBPose: poseB,
  };
  if (sideA.parentToMerge === "FAIL" || sideA.mergeToHybrid === "FAIL" || sideB.parentToMerge === "FAIL" || sideB.mergeToHybrid === "FAIL") {
    return { ...base, reason: `no-positive-overlap;parentBDistance:${nearestDistance(solidB, worldSiteB).toFixed(3)}` };
  }
  const union = await unionAll([solidA, mergeA, hybridSolid, mergeB, solidB]);
  if (!union.mesh) return { ...base, boolean: "FAILED", reason: `boolean-failed:${union.reason}` };
  const topology = diagnoseTopology(union.mesh);
  const floating = Math.max(0, topology.componentCount - 1);
  const pass = topology.componentCount === 1 && topology.boundaryEdgeCount === 0 && floating === 0;
  return {
    ...base,
    pass,
    componentCount: topology.componentCount,
    floating,
    boolean: pass ? "READY" : "FAILED",
    assembly: union.mesh,
    reason: pass ? "" : `components:${topology.componentCount};boundary:${topology.boundaryEdgeCount}`,
  };
}

function sideReport(parentOverlap: number, hybridOverlap: number): MergeSideReport {
  const minimum = LOCAL_MERGE_SETTINGS.positiveVolume;
  return {
    parentToMerge: parentOverlap > minimum ? "PASS" : "FAIL",
    mergeToHybrid: hybridOverlap > minimum ? "PASS" : "FAIL",
    parentOverlap,
    hybridOverlap,
  };
}

function emptyJoin(reason: string): ThreeBodyJoin {
  return {
    pass: false,
    sideA: { parentToMerge: "FAIL", mergeToHybrid: "FAIL", parentOverlap: 0, hybridOverlap: 0 },
    sideB: { parentToMerge: "FAIL", mergeToHybrid: "FAIL", parentOverlap: 0, hybridOverlap: 0 },
    componentCount: null,
    floating: 3,
    coreIntact: false,
    boolean: "UNRESOLVED",
    reason,
    hybrid: null,
    mergeA: null,
    mergeB: null,
    assembly: null,
    parentBPose: null,
  };
}

function mergeSite(mesh: IsoMesh, frame: FaceFrame): Vec3 {
  const coat = faceSurfaceHighlight(mesh, frame);
  if (!coat) return frame.origin;
  const field = faceAttachmentField(coat, (point) => point, add(frame.origin, scale(frame.normal, 0.4)));
  const convergence = field.report.convergence;
  if (convergence && length(sub(convergence, frame.origin)) < Math.max(frame.extent.u, frame.extent.v)) return convergence;
  let best = frame.origin;
  let bestDistance = Infinity;
  for (let index = 0; index < coat.indices.length; index += 3) {
    const centroid = scale(add(add(read(coat.positions, coat.indices[index]), read(coat.positions, coat.indices[index + 1])), read(coat.positions, coat.indices[index + 2])), 1 / 3);
    const distance = length(sub(centroid, frame.origin));
    if (distance < bestDistance) {
      bestDistance = distance;
      best = centroid;
    }
  }
  return best;
}

function poseForFace(frame: FaceFrame, localSite: Vec3, worldNormal: Vec3, worldU: Vec3, worldSite: Vec3): Pose {
  const rotation = mapDirection(frame.normal, frame.u, worldNormal, worldU);
  const rotated = rotateByBasis(rotation, localSite);
  return {
    transform: sub(worldSite, rotated),
    rotation,
    rotationQuarter: 0,
    mirror: null,
  };
}

function mapDirection(fromNormal: Vec3, fromU: Vec3, toNormal: Vec3, toU: Vec3): Mat3 {
  const from = frameOf(fromNormal, fromU);
  const to = frameOf(toNormal, toU);
  const component = (axis: Vec3, index: 0 | 1 | 2) => index === 0 ? axis.x : index === 1 ? axis.y : axis.z;
  const column = (index: 0 | 1 | 2): Vec3 => add(
    add(scale(to.n, component(from.n, index)), scale(to.u, component(from.u, index))),
    scale(to.v, component(from.v, index)),
  );
  const x = column(0);
  const y = column(1);
  const z = column(2);
  return [x.x, x.y, x.z, y.x, y.y, y.z, z.x, z.y, z.z];
}

function frameOf(normal: Vec3, hint: Vec3) {
  const n = normalize(normal);
  let u = cross(hint, n);
  if (length(u) < 1e-5) u = cross(Math.abs(n.y) < 0.9 ? { x: 0, y: 1, z: 0 } : { x: 1, y: 0, z: 0 }, n);
  u = normalize(u);
  const v = cross(n, u);
  return { n, u, v };
}

async function orientSolid(mesh: IsoMesh | null): Promise<IsoMesh | null> {
  if (!mesh) return null;
  const volume = await booleanVolume(mesh);
  if (volume === null || volume === 0) return null;
  return volume < 0 ? flip(mesh) : mesh;
}

async function overlapVolume(container: IsoMesh, part: IsoMesh) {
  const hit = await booleanIntersection(container, part);
  if (!hit.mesh) return 0;
  return Math.abs(await booleanVolume(hit.mesh) ?? 0);
}

async function parentOverlap(parent: IsoMesh, merge: IsoMesh, inner: Vec3, outer: Vec3) {
  const volume = await overlapVolume(parent, merge);
  if (volume > LOCAL_MERGE_SETTINGS.positiveVolume) return volume;
  return segmentHitsMesh(parent, inner, outer) ? LOCAL_MERGE_SETTINGS.positiveVolume + 0.01 : volume;
}

function segmentHitsMesh(mesh: IsoMesh, start: Vec3, end: Vec3) {
  const direction = sub(end, start);
  if (length(direction) < 1e-6) return false;
  for (let index = 0; index < mesh.indices.length; index += 3) {
    const hit = rayTriangle(
      start,
      direction,
      read(mesh.positions, mesh.indices[index]),
      read(mesh.positions, mesh.indices[index + 1]),
      read(mesh.positions, mesh.indices[index + 2]),
    );
    if (hit !== null && hit > 0 && hit < 1) return true;
  }
  return false;
}

function rayTriangle(origin: Vec3, direction: Vec3, a: Vec3, b: Vec3, c: Vec3) {
  const edge1 = sub(b, a);
  const edge2 = sub(c, a);
  const p = cross(direction, edge2);
  const det = dot(edge1, p);
  if (Math.abs(det) < 1e-8) return null;
  const inv = 1 / det;
  const offset = sub(origin, a);
  const u = dot(offset, p) * inv;
  if (u < 0 || u > 1) return null;
  const q = cross(offset, edge1);
  const v = dot(direction, q) * inv;
  if (v < 0 || u + v > 1) return null;
  return dot(edge2, q) * inv;
}

async function unionAll(meshes: IsoMesh[]) {
  let acc = meshes[0];
  for (let index = 1; index < meshes.length; index += 1) {
    const step = await booleanUnion(acc, meshes[index]);
    if (step.status !== "ready" || !step.mesh) return { mesh: null, reason: `${index}:${step.reason || step.status}` };
    acc = step.mesh;
  }
  return { mesh: acc, reason: "" };
}

function inwardCylinder(site: Vec3, outward: Vec3, penetration: number, radius: number) {
  return cylinder(add(site, scale(outward, -(penetration + 0.45))), add(site, scale(outward, 0.2)), radius);
}

function cylinder(start: Vec3, end: Vec3, radius: number): IsoMesh {
  const sides = 16;
  const axis = normalize(sub(end, start));
  const { u: uu, v: vv } = frameOf(axis, { x: 0, y: 1, z: 0 });
  const corners: Vec3[] = [];
  for (let index = 0; index < sides; index += 1) {
    const angle = (index / sides) * Math.PI * 2;
    const radial = add(scale(uu, Math.cos(angle) * radius), scale(vv, Math.sin(angle) * radius));
    corners.push(add(start, radial));
  }
  for (let index = 0; index < sides; index += 1) {
    const angle = (index / sides) * Math.PI * 2;
    const radial = add(scale(uu, Math.cos(angle) * radius), scale(vv, Math.sin(angle) * radius));
    corners.push(add(end, radial));
  }
  corners.push(start, end);
  const indices: number[] = [];
  const startCenter = sides * 2;
  const endCenter = startCenter + 1;
  for (let index = 0; index < sides; index += 1) {
    const next = (index + 1) % sides;
    indices.push(index, next, sides + next, index, sides + next, sides + index);
    indices.push(startCenter, next, index);
    indices.push(endCenter, sides + index, sides + next);
  }
  return meshFrom(corners, indices);
}

function rigidCopy(mesh: IsoMesh, sourceStart: Vec3, sourceEnd: Vec3, targetStart: Vec3, targetEnd: Vec3, upHint: Vec3, samples: number): IsoMesh {
  const axisTurn = rotationFromTo(sub(sourceEnd, sourceStart), sub(targetEnd, targetStart));
  const turnedUp = axisTurn(sectionUp(mesh, samples));
  const targetDir = normalize(sub(targetEnd, targetStart));
  const roll = rotationFromTo(reject(turnedUp, targetDir), reject(upHint, targetDir));
  const turn = (vector: Vec3) => roll(axisTurn(vector));
  const sourceMid = lerp(sourceStart, sourceEnd, 0.5);
  const targetMid = lerp(targetStart, targetEnd, 0.5);
  const count = mesh.positions.length / 3;
  const positions = new Float32Array(mesh.positions.length);
  const normals = new Float32Array(mesh.normals.length || mesh.positions.length);
  for (let index = 0; index < count; index += 1) {
    write(positions, index, add(turn(sub(read(mesh.positions, index), sourceMid)), targetMid));
    if (index * 3 < mesh.normals.length) write(normals, index, turn(read(mesh.normals, index)));
  }
  return { positions, normals, indices: Uint32Array.from(mesh.indices), triangles: mesh.triangles };
}

function sectionUp(mesh: IsoMesh, samples: number) {
  const center = ringCentroid(mesh, 0, samples);
  return normalize(sub(read(mesh.positions, 0), center));
}

function ringCentroid(mesh: IsoMesh, start: number, count: number) {
  let sum = { x: 0, y: 0, z: 0 };
  for (let index = 0; index < count; index += 1) sum = add(sum, read(mesh.positions, start + index));
  return scale(sum, 1 / count);
}

function ringRadius(mesh: IsoMesh, start: number, count: number) {
  const center = ringCentroid(mesh, start, count);
  let sum = 0;
  for (let index = 0; index < count; index += 1) sum += length(sub(read(mesh.positions, start + index), center));
  return sum / count;
}

function rotationFromTo(from: Vec3, to: Vec3) {
  const source = normalize(from);
  const target = normalize(to);
  const dot = Math.max(-1, Math.min(1, source.x * target.x + source.y * target.y + source.z * target.z));
  if (dot > 0.999999) return (vector: Vec3) => vector;
  if (dot < -0.999999) {
    const hint = Math.abs(source.y) < 0.9 ? { x: 0, y: 1, z: 0 } : { x: 1, y: 0, z: 0 };
    const axis = normalize(cross(source, hint));
    return (vector: Vec3) => rotateAround(vector, axis, Math.PI);
  }
  const axis = normalize(cross(source, target));
  return (vector: Vec3) => rotateAround(vector, axis, Math.acos(dot));
}

function rotateAround(vector: Vec3, axis: Vec3, angle: number) {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return add(add(scale(vector, cos), scale(cross(axis, vector), sin)), scale(axis, (axis.x * vector.x + axis.y * vector.y + axis.z * vector.z) * (1 - cos)));
}

function reject(vector: Vec3, axis: Vec3) {
  return normalize(sub(vector, scale(axis, vector.x * axis.x + vector.y * axis.y + vector.z * axis.z)));
}

function flip(mesh: IsoMesh): IsoMesh {
  const indices = Uint32Array.from(mesh.indices);
  for (let index = 0; index < indices.length; index += 3) {
    const hold = indices[index + 1];
    indices[index + 1] = indices[index + 2];
    indices[index + 2] = hold;
  }
  return { ...mesh, indices, normals: mesh.normals };
}

function meshFrom(corners: Vec3[], indices: number[]): IsoMesh {
  const positions = new Float32Array(corners.length * 3);
  corners.forEach((corner, index) => write(positions, index, corner));
  const indexBuffer = Uint32Array.from(indices);
  return { positions, normals: new Float32Array(positions.length), indices: indexBuffer, triangles: indexBuffer.length / 3 };
}

function nearestDistance(mesh: IsoMesh, point: Vec3) {
  let best = Infinity;
  for (let index = 0; index < mesh.positions.length; index += 3) {
    best = Math.min(best, Math.hypot(mesh.positions[index] - point.x, mesh.positions[index + 1] - point.y, mesh.positions[index + 2] - point.z));
  }
  return best;
}

function read(values: Float32Array, index: number): Vec3 {
  const offset = index * 3;
  return { x: values[offset] ?? 0, y: values[offset + 1] ?? 0, z: values[offset + 2] ?? 0 };
}

function write(values: Float32Array, index: number, point: Vec3) {
  const offset = index * 3;
  values[offset] = point.x;
  values[offset + 1] = point.y;
  values[offset + 2] = point.z;
}

function add(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

function sub(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

function scale(vector: Vec3, factor: number): Vec3 {
  return { x: vector.x * factor, y: vector.y * factor, z: vector.z * factor };
}

function dot(a: Vec3, b: Vec3) {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return { x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x };
}

function length(vector: Vec3) {
  return Math.hypot(vector.x, vector.y, vector.z);
}

function normalize(vector: Vec3): Vec3 {
  const span = length(vector) || 1;
  return scale(vector, 1 / span);
}

function lerp(a: Vec3, b: Vec3, t: number): Vec3 {
  return add(scale(a, 1 - t), scale(b, t));
}
