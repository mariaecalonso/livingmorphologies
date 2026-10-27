import type { IsoMesh } from "../scan/isomesh";
import type { FaceFrame, Vec3 } from "./contract";
import { CONNECTION_DEBUG_STAGE } from "./connection-debug";
import { PROFILE_SAMPLES } from "./face-hybrid-profile";
import { faceAttachmentField, type FaceCoverage } from "./face-field";
import { faceSurfaceHighlight } from "./face-outline";
import { HYBRID_GENERATOR_SETTINGS, sectionReach } from "./hybrid-generator";
import { meshAttachment } from "./tile-orientation";
import { rotateByBasis, tileBasis } from "./tile-basis";
import type { TileInstance } from "./tiles";

/**
 * The selected SOM hybrid is the connector.
 * It is placed by rigid motion, then only its two shallow end bands
 * are relaxed onto the scanned gray-face triangles.
 */

const CORE_STEPS = HYBRID_GENERATOR_SETTINGS.loftSteps;
const BAND = 2;
const OVERLAP = 0.22;

export type AttachmentReport = {
  coreVertices: number;
  coreTriangles: number;
  placedVertices: number;
  routesA: number;
  routesB: number;
  primaryA: number;
  secondaryA: number;
  primaryB: number;
  secondaryB: number;
  prunedA: number;
  prunedB: number;
  domainA: number;
  domainB: number;
  adapterTriangles: number;
  protectedFraction: number;
  coreIntact: boolean;
  bounds: { x: number; y: number; z: number };
  faceA: string;
  faceB: string;
  alignmentErrorA: number;
  alignmentErrorB: number;
  deformationA: number;
  deformationB: number;
  spreadAreaA: number;
  spreadAreaB: number;
  overlapDepth: number;
  branchesA: number;
  branchesB: number;
};

type FaceNode = {
  at: Vec3;
  normal: Vec3;
  area: number;
  depth: number;
  u: number;
  v: number;
  corners: [Vec3, Vec3, Vec3];
};

type EndSeat = {
  alignmentError: number;
  deformation: number;
  spreadArea: number;
  branches: number;
  domain: number;
};

export function assembleIntactHybrid(args: {
  mesh: IsoMesh;
  parentA: IsoMesh;
  parentB: IsoMesh;
  frameA: FaceFrame;
  frameB: FaceFrame;
  placedA: FaceFrame;
  placedB: FaceFrame;
  tileA: Pick<TileInstance, "transform" | "rotation" | "rotationQuarter" | "mirror">;
  tileB: Pick<TileInstance, "transform" | "rotation" | "rotationQuarter" | "mirror">;
}): { mesh: IsoMesh; guides: IsoMesh | null; report: AttachmentReport } | null {
  const coreCount = args.mesh.positions.length / 3;
  const samples = loftSampleCount(coreCount);
  const sourceStart = samples > 0 ? centroid(readRange(args.mesh, 0, samples)) : meshCentroid(args.mesh);
  const sourceEnd = samples > 0 ? centroid(readRange(args.mesh, coreCount - samples, samples)) : sourceStart;
  const contact = hybridContactGap(args.mesh);
  const penetration = contact?.penetration ?? OVERLAP;
  if (CONNECTION_DEBUG_STAGE < 2) {
    const meshKey = meshFingerprint(args.mesh.positions);
    const cacheKey = `${args.frameA.id}:${args.frameB.id}:${coreCount}:${meshKey}:${meshFingerprint(args.parentA.positions)}:${meshFingerprint(args.parentB.positions)}:${args.tileA.transform.x.toFixed(2)}:${args.tileA.transform.y.toFixed(2)}:${args.tileA.transform.z.toFixed(2)}:${args.tileB.transform.x.toFixed(2)}:${args.tileB.transform.y.toFixed(2)}:${args.tileB.transform.z.toFixed(2)}`;
    const solved = cacheKey === rigidCacheKey && rigidCache ? rigidCache : solveRigidContact({ ...args, samples, penetration });
    if (!solved) return null;
    rigidCacheKey = cacheKey;
    rigidCache = solved;
    const signature = coreDistanceSignature(args.mesh, coreCount).span;
    if (Math.abs(coreDistanceSignature(solved.mesh, coreCount).span - signature) > 1e-3) return null;
    const key = JSON.stringify(solved.log);
    if (key !== lastRigidLog) {
      lastRigidLog = key;
      console.info("[connection-debug] rigid contact", solved.log);
    }
    return {
      mesh: solved.mesh,
      guides: solved.guides,
      report: seatReport(args, coreCount, solved.grayA, solved.grayB, true),
    };
  }
  const surfaceA = parentSurface(args.parentA, args.frameA, args.tileA, args.placedA);
  const surfaceB = parentSurface(args.parentB, args.frameB, args.tileB, args.placedB);
  const targetA = add(surfaceA, scale(args.placedA.normal, -penetration));
  const targetB = add(surfaceB, scale(args.placedB.normal, -penetration));
  const rigid = rigidCopy(args.mesh, sourceStart, sourceEnd, targetA, targetB, add(args.placedA.u, args.placedB.u), samples);
  const signature = coreDistanceSignature(args.mesh, coreCount).span;
  if (Math.abs(coreDistanceSignature(rigid, coreCount).span - signature) > 1e-3) return null;

  const faceA = faceDomain(args.parentA, args.frameA, args.tileA);
  const faceB = faceDomain(args.parentB, args.frameB, args.tileB);
  const spreadA = spreadReach(args.placedA);
  const spreadB = spreadReach(args.placedB);
  const positions = Float32Array.from(rigid.positions);
  const seatA = conformEnd(positions, rigid, samples, coreCount, true, faceA, args.placedA.normal, spreadA);
  const seatB = conformEnd(positions, rigid, samples, coreCount, false, faceB, args.placedB.normal, spreadB);
  const mesh: IsoMesh = { positions, normals: Float32Array.from(rigid.normals), indices: Uint32Array.from(rigid.indices), triangles: rigid.triangles };
  const coreIntact = coreMatches(rigid, mesh, samples) && sameIndices(args.mesh, mesh);
  if (!coreIntact) return null;
  return { mesh, guides: null, report: seatReport(args, coreCount, faceA.length, faceB.length, coreIntact, seatA, seatB) };
}

function seatReport(
  args: { mesh: IsoMesh; placedA: FaceFrame; placedB: FaceFrame },
  coreCount: number,
  domainA: number,
  domainB: number,
  coreIntact: boolean,
  seatA: EndSeat = { alignmentError: 0, deformation: 0, spreadArea: 0, branches: 0, domain: domainA },
  seatB: EndSeat = { alignmentError: 0, deformation: 0, spreadArea: 0, branches: 0, domain: domainB },
): AttachmentReport {
  return {
      coreVertices: coreCount,
      coreTriangles: args.mesh.triangles,
      placedVertices: coreCount,
      routesA: seatA.branches,
      routesB: seatB.branches,
      primaryA: Math.min(1, seatA.branches),
      secondaryA: Math.max(0, seatA.branches - 1),
      primaryB: Math.min(1, seatB.branches),
      secondaryB: Math.max(0, seatB.branches - 1),
      prunedA: Math.max(0, seatA.domain - seatA.branches),
      prunedB: Math.max(0, seatB.domain - seatB.branches),
      domainA: seatA.domain,
      domainB: seatB.domain,
      adapterTriangles: 0,
      protectedFraction: (CORE_STEPS - BAND * 2) / CORE_STEPS,
      coreIntact,
      bounds: boundsOf(args.mesh),
      faceA: args.placedA.id,
      faceB: args.placedB.id,
      alignmentErrorA: seatA.alignmentError,
      alignmentErrorB: seatB.alignmentError,
      deformationA: seatA.deformation,
      deformationB: seatB.deformation,
      spreadAreaA: seatA.spreadArea,
      spreadAreaB: seatB.spreadArea,
      overlapDepth: CONNECTION_DEBUG_STAGE < 4 ? 0 : OVERLAP,
      branchesA: seatA.branches,
      branchesB: seatB.branches,
  };
}

let lastRigidLog = "";
let rigidCacheKey = "";
let rigidCache: ReturnType<typeof solveRigidContact> | null = null;

function meshFingerprint(positions: Float32Array) {
  let sum = 0;
  const step = Math.max(3, Math.floor(positions.length / 48) * 3);
  for (let index = 0; index < positions.length; index += step) sum += positions[index] * (index + 1);
  return sum.toFixed(3);
}

type RigidLog = Record<string, unknown>;

type GrayTri = {
  at: Vec3;
  normal: Vec3;
  area: number;
  corners: [Vec3, Vec3, Vec3];
};

export function hybridContactGap(mesh: IsoMesh) {
  const ends = localTerminals(mesh);
  if (!ends) return null;
  const travel = sub(ends.b, ends.a);
  const span = Math.abs(dot(travel, ends.forward));
  if (span < 1e-4) return null;
  const radius = (meanRadius(ends.ringA) + meanRadius(ends.ringB)) * 0.5;
  const penetration = Math.min(0.4, Math.max(0.08, radius * 0.02));
  return { length: span, chord: length(travel), penetration, gap: Math.max(0.2, span - penetration * 2) };
}

export type HybridSeatPlan = {
  gap: number;
  localA: Vec3;
  localB: Vec3;
  travel: Vec3;
  forward: Vec3;
  principal: Vec3;
  faceU: Vec3;
  penetration: number;
};

export function hybridFaceTargets(
  mesh: IsoMesh,
  parentA: IsoMesh,
  frameA: FaceFrame,
  parentB: IsoMesh,
  frameB: FaceFrame,
): HybridSeatPlan | null {
  const ends = localTerminals(mesh);
  if (!ends) return null;
  const localA = outerLocal(parentA, frameA, ends.a);
  const localB = outerLocal(parentB, frameB, ends.b);
  if (!localA || !localB) return null;
  const travel = sub(ends.b, ends.a);
  const axial = Math.abs(dot(travel, ends.forward));
  return {
    gap: Math.max(0.2, axial - ends.penetration * 2),
    localA,
    localB,
    travel,
    forward: ends.forward,
    principal: ends.principalA,
    faceU: frameA.u,
    penetration: ends.penetration,
  };
}

function seatOnGrayFaces(
  args: {
    mesh: IsoMesh;
    samples: number;
    parentA: IsoMesh;
    parentB: IsoMesh;
    frameA: FaceFrame;
    frameB: FaceFrame;
    placedA: FaceFrame;
    placedB: FaceFrame;
    tileA: Pick<TileInstance, "transform" | "rotation" | "rotationQuarter" | "mirror">;
    tileB: Pick<TileInstance, "transform" | "rotation" | "rotationQuarter" | "mirror">;
  },
  ends: NonNullable<ReturnType<typeof localTerminals>>,
  grayA: NonNullable<ReturnType<typeof highlightWorld>>,
  grayB: NonNullable<ReturnType<typeof highlightWorld>>,
) {
  const plan = hybridFaceTargets(args.mesh, args.parentA, args.frameA, args.parentB, args.frameB);
  if (!plan) return null;
  const basisA = tileBasis(args.tileA);
  const basisB = tileBasis(args.tileB);
  const surfaceA = add(rotateByBasis(basisA, plan.localA), args.tileA.transform);
  const surfaceB = add(rotateByBasis(basisB, plan.localB), args.tileB.transform);
  const faceN = args.placedA.normal;
  const turn = alignTurn(plan.forward, plan.principal, faceN, reject(args.placedA.u, faceN));
  const targetA = add(surfaceA, scale(faceN, -plan.penetration));
  const placed = applyRigid(args.mesh, turn, ends.a, targetA);
  const endA = centroid(readRange(placed, 0, args.samples));
  const endB = centroid(readRange(placed, placed.positions.length / 3 - args.samples, args.samples));
  const distanceA = dot(sub(endA, surfaceA), faceN);
  const distanceB = dot(sub(endB, surfaceB), args.placedB.normal);
  const alignA = dot(turn(ends.outwardA), faceN);
  const alignB = dot(turn(ends.outwardB), args.placedB.normal);
  const gapA = length(sub(endA, add(surfaceA, scale(faceN, -plan.penetration))));
  const gapB = length(sub(endB, add(surfaceB, scale(faceN, plan.penetration))));
  const rimA = loopGap(readRange(placed, 0, args.samples), grayA.tris);
  const rimB = loopGap(readRange(placed, placed.positions.length / 3 - args.samples, args.samples), grayB.tris);
  const axialError = dot(sub(endB, endA), faceN) - dot(sub(surfaceB, surfaceA), faceN);
  const contacted = gapA <= 0.4 && gapB <= 0.4 && alignA <= -0.75 && alignB <= -0.75;
  const reason = contacted
    ? rimA.max <= 0.75 && rimB.max <= 0.75
      ? "CONTACT"
      : "PLACEMENT INFEASIBLE: gray face is curved, flat terminal cannot cover it"
    : dot(ends.outwardA, ends.outwardB) > -0.8
      ? "PLACEMENT INFEASIBLE: terminal directions incompatible"
      : dot(faceN, args.placedB.normal) > -0.5
        ? "PLACEMENT INFEASIBLE: orientation mismatch"
        : Math.abs(axialError) > 0.4
          ? `PLACEMENT INFEASIBLE: span too ${axialError > 0 ? "long" : "short"}`
          : "PLACEMENT INFEASIBLE";
  const guides = wholeFaceGuides(args, endA, endB);
  const log: RigidLog = {
    stage: CONNECTION_DEBUG_STAGE,
    faceA: args.frameA.id,
    faceB: args.frameB.id,
    grayA: { triangles: grayA.triangles, vertices: grayA.vertices, centroid: roundVec(grayA.centroid), normal: roundVec(grayA.normal), area: Number(grayA.area.toFixed(2)) },
    grayB: { triangles: grayB.triangles, vertices: grayB.vertices, centroid: roundVec(grayB.centroid), normal: roundVec(grayB.normal), area: Number(grayB.area.toFixed(2)) },
    endLabelA: "local ring 0",
    endLabelB: "local last ring",
    endA: roundVec(endA),
    endB: roundVec(endB),
    targetA: roundVec(surfaceA),
    targetB: roundVec(surfaceB),
    distanceA: Number(distanceA.toFixed(3)),
    distanceB: Number(distanceB.toFixed(3)),
    gapA: Number(gapA.toFixed(3)),
    gapB: Number(gapB.toFixed(3)),
    rimA: Number(rimA.max.toFixed(3)),
    rimB: Number(rimB.max.toFixed(3)),
    alignA: Number(alignA.toFixed(3)),
    alignB: Number(alignB.toFixed(3)),
    faceDistance: Number(length(sub(surfaceB, surfaceA)).toFixed(3)),
    hybridDistance: Number(length(sub(endB, endA)).toFixed(3)),
    axial: Number(Math.abs(dot(plan.travel, plan.forward)).toFixed(3)),
    chord: Number(length(plan.travel).toFixed(3)),
    parentBGap: Number(plan.gap.toFixed(3)),
    rotationDeg: 0,
    feasible: reason,
    coverageA: guides.coverageA,
    coverageB: guides.coverageB,
    faceField: guides.coverageA.accepted && guides.coverageB.accepted ? "WHOLE FACE" : "FAIL: INSUFFICIENT FACE COVERAGE",
  };
  return { mesh: placed, surfaceA, surfaceB, endA, endB, grayA: grayA.triangles, grayB: grayB.triangles, guides: guides.mesh, log };
}

function outerLocal(mesh: IsoMesh, frame: FaceFrame, center: Vec3) {
  const coat = faceSurfaceHighlight(mesh, frame);
  if (!coat) return null;
  let best: { at: Vec3; plane: number; depth: number } | null = null;
  for (let index = 0; index < coat.indices.length; index += 3) {
    const a = read(coat.positions, coat.indices[index]);
    const b = read(coat.positions, coat.indices[index + 1]);
    const c = read(coat.positions, coat.indices[index + 2]);
    const width = cross(sub(b, a), sub(c, a));
    const area = length(width);
    if (area < 1e-6) continue;
    if (dot(normalize(width), frame.normal) < 0.45) continue;
    const at = scale(add(add(a, b), c), 1 / 3);
    const plane = length(reject(sub(at, center), frame.normal));
    const depth = dot(at, frame.normal);
    if (!best || plane < best.plane - 0.35 || (plane <= best.plane + 0.35 && depth > best.depth)) best = { at, plane, depth };
  }
  return best?.at ?? null;
}

function alignTurn(forward: Vec3, principal: Vec3, faceNormal: Vec3, faceU: Vec3) {
  void principal;
  void faceU;
  return rotationFromTo(forward, faceNormal);
}

function solveRigidContact(args: {
  mesh: IsoMesh;
  samples: number;
  penetration: number;
  parentA: IsoMesh;
  parentB: IsoMesh;
  frameA: FaceFrame;
  frameB: FaceFrame;
  placedA: FaceFrame;
  placedB: FaceFrame;
  tileA: Pick<TileInstance, "transform" | "rotation" | "rotationQuarter" | "mirror">;
  tileB: Pick<TileInstance, "transform" | "rotation" | "rotationQuarter" | "mirror">;
}) {
  const ends = localTerminals(args.mesh);
  const grayA = highlightWorld(args.parentA, args.frameA, args.tileA);
  const grayB = highlightWorld(args.parentB, args.frameB, args.tileB);
  if (!ends || !grayA || !grayB || args.samples < 3) return null;
  const planned = seatOnGrayFaces(args, ends, grayA, grayB);
  if (planned) return planned;
  const faceN = args.placedA.normal;
  const faceDot = dot(faceN, args.placedB.normal);
  const samplesA = facingSamples(grayA.tris, faceN);
  const samplesB = facingSamples(grayB.tris, args.placedB.normal);
  if (samplesA.length < 1 || samplesB.length < 1) return null;
  const principalA = principalDirection(samplesA.map((tri) => tri.at), centroid(samplesA.map((tri) => tri.at)), faceN);
  const turns = Array.from({ length: 24 }, (_, step) => {
    const angle = (step / 24) * Math.PI * 2;
    const base = rotationFromTo(ends.forward, faceN);
    const turn = (vector: Vec3) => rotateAround(base(vector), faceN, angle);
    return {
      angle,
      turn,
      offsetsA: ends.ringA.filter((_, index) => index % 8 === 0).map((point) => turn(sub(point, ends.a))),
      offsetsB: ends.ringB.filter((_, index) => index % 8 === 0).map((point) => turn(sub(point, ends.b))),
    };
  });
  let best: {
    turn: (vector: Vec3) => Vec3;
    angle: number;
    surfaceA: Vec3;
    surfaceB: Vec3;
    targetA: Vec3;
    miss: number;
    score: number;
  } | null = null;
  for (const candidate of turns) {
    const travel = candidate.turn(sub(ends.b, ends.a));
    const rolled = candidate.turn(ends.principalA);
    const principalPenalty = 0.2 * (1 - Math.abs(dot(rolled, principalA)));
    const coverA = samplesA.map((patch) => rimToSamples(patch.at, candidate.offsetsA, samplesA));
    const coverB = samplesB.map((patch) => rimToSamples(patch.at, candidate.offsetsB, samplesB));
    for (let indexA = 0; indexA < samplesA.length; indexA += 1) {
      const patchA = samplesA[indexA];
      const desired = add(patchA.at, sub(travel, scale(faceN, args.penetration * 2)));
      for (let indexB = 0; indexB < samplesB.length; indexB += 1) {
        const patchB = samplesB[indexB];
        const near = length(sub(patchB.at, desired));
        const score = near + coverA[indexA] + coverB[indexB] + principalPenalty;
        if (best && score >= best.score) continue;
        const planeA = add(patchA.at, scale(faceN, -args.penetration));
        const planeB = add(patchB.at, scale(faceN, args.penetration));
        best = {
          turn: candidate.turn,
          angle: candidate.angle,
          surfaceA: patchA.at,
          surfaceB: patchB.at,
          targetA: lerp(planeA, sub(planeB, travel), 0.5),
          miss: near,
          score,
        };
      }
    }
  }
  if (!best) return null;
  const placed = applyRigid(args.mesh, best.turn, ends.a, best.targetA);
  const endA = centroid(readRange(placed, 0, args.samples));
  const endB = centroid(readRange(placed, placed.positions.length / 3 - args.samples, args.samples));
  const outwardA = best.turn(ends.outwardA);
  const outwardB = best.turn(ends.outwardB);
  const distanceA = dot(sub(endA, best.surfaceA), faceN);
  const distanceB = dot(sub(endB, best.surfaceB), args.placedB.normal);
  const alignA = dot(outwardA, faceN);
  const alignB = dot(outwardB, args.placedB.normal);
  const rimA = loopGap(readRange(placed, 0, args.samples), grayA.tris);
  const rimB = loopGap(readRange(placed, placed.positions.length / 3 - args.samples, args.samples), grayB.tris);
  const faceDistance = length(sub(best.surfaceB, best.surfaceA));
  const hybridDistance = length(sub(endB, endA));
  const axialError = dot(sub(endB, endA), faceN) - dot(sub(best.surfaceB, best.surfaceA), faceN);
  const endsOpposed = dot(ends.outwardA, ends.outwardB);
  const contacted = Math.abs(distanceA + args.penetration) <= 0.4
    && Math.abs(distanceB + args.penetration) <= 0.4
    && alignA <= -0.75
    && alignB <= -0.75
    && rimA.max <= 0.75
    && rimB.max <= 0.75;
  const reason = contacted
    ? "CONTACT"
    : endsOpposed > -0.8
      ? "PLACEMENT INFEASIBLE: terminal directions incompatible"
      : faceDot > -0.5
        ? "PLACEMENT INFEASIBLE: orientation mismatch"
        : Math.abs(axialError) > 0.4
          ? `PLACEMENT INFEASIBLE: span too ${axialError > 0 ? "long" : "short"}`
          : "PLACEMENT INFEASIBLE";
  const log: RigidLog = {
    stage: CONNECTION_DEBUG_STAGE,
    faceA: args.frameA.id,
    faceB: args.frameB.id,
    grayA: { triangles: grayA.triangles, vertices: grayA.vertices, centroid: roundVec(grayA.centroid), normal: roundVec(grayA.normal), area: Number(grayA.area.toFixed(2)) },
    grayB: { triangles: grayB.triangles, vertices: grayB.vertices, centroid: roundVec(grayB.centroid), normal: roundVec(grayB.normal), area: Number(grayB.area.toFixed(2)) },
    endLabelA: "local ring 0",
    endLabelB: "local last ring",
    endA: roundVec(endA),
    endB: roundVec(endB),
    targetA: roundVec(best.surfaceA),
    targetB: roundVec(best.surfaceB),
    distanceA: Number(distanceA.toFixed(3)),
    distanceB: Number(distanceB.toFixed(3)),
    rimA: Number(rimA.max.toFixed(3)),
    rimB: Number(rimB.max.toFixed(3)),
    alignA: Number(alignA.toFixed(3)),
    alignB: Number(alignB.toFixed(3)),
    faceDistance: Number(faceDistance.toFixed(3)),
    hybridDistance: Number(hybridDistance.toFixed(3)),
    axial: Number(Math.abs(dot(sub(ends.b, ends.a), ends.forward)).toFixed(3)),
    chord: Number(length(sub(ends.b, ends.a)).toFixed(3)),
    parentBGap: Number((Math.abs(dot(sub(ends.b, ends.a), ends.forward)) - args.penetration * 2).toFixed(3)),
    rotationDeg: Number((best.angle * 180 / Math.PI).toFixed(1)),
    feasible: reason,
  };
  return { mesh: placed, surfaceA: best.surfaceA, surfaceB: best.surfaceB, endA, endB, grayA: grayA.triangles, grayB: grayB.triangles, guides: contactGuides(best.surfaceA, endA, best.surfaceB, endB), log };
}

function loftSampleCount(vertexCount: number) {
  if (vertexCount % CORE_STEPS !== 0) return 0;
  const samples = vertexCount / CORE_STEPS;
  if (samples === PROFILE_SAMPLES || samples >= 12) return samples;
  return 0;
}

function localTerminals(mesh: IsoMesh) {
  const count = mesh.positions.length / 3;
  const samples = loftSampleCount(count);
  if (samples < 3) return null;
  const ringA = readRange(mesh, 0, samples);
  const ringB = readRange(mesh, count - samples, samples);
  const a = centroid(ringA);
  const b = centroid(ringB);
  const travel = sub(b, a);
  if (length(travel) < 1e-4) return null;
  let forward = loopNormal(ringA);
  if (dot(forward, travel) < 0) forward = scale(forward, -1);
  let outwardB = loopNormal(ringB);
  if (dot(outwardB, travel) < 0) outwardB = scale(outwardB, -1);
  const radius = (meanRadius(ringA) + meanRadius(ringB)) * 0.5;
  return {
    a,
    b,
    ringA,
    ringB,
    forward,
    outwardA: scale(forward, -1),
    outwardB,
    principalA: principalDirection(ringA, a, forward),
    penetration: Math.min(0.4, Math.max(0.08, radius * 0.02)),
  };
}

function highlightWorld(
  mesh: IsoMesh,
  frame: FaceFrame,
  tile: Pick<TileInstance, "transform" | "rotation" | "rotationQuarter" | "mirror">,
) {
  const coat = faceSurfaceHighlight(mesh, frame);
  if (!coat) return null;
  const basis = tileBasis(tile);
  const place = (point: Vec3) => add(rotateByBasis(basis, point), tile.transform);
  const tris: GrayTri[] = [];
  let area = 0;
  let centroidSum = { x: 0, y: 0, z: 0 };
  let normalSum = { x: 0, y: 0, z: 0 };
  for (let index = 0; index < coat.indices.length; index += 3) {
    const a = place(read(coat.positions, coat.indices[index]));
    const b = place(read(coat.positions, coat.indices[index + 1]));
    const c = place(read(coat.positions, coat.indices[index + 2]));
    const width = cross(sub(b, a), sub(c, a));
    const triArea = length(width) * 0.5;
    if (triArea < 1e-6) continue;
    const at = scale(add(add(a, b), c), 1 / 3);
    const normal = normalize(width);
    tris.push({ at, normal, area: triArea, corners: [a, b, c] });
    area += triArea;
    centroidSum = add(centroidSum, scale(at, triArea));
    normalSum = add(normalSum, width);
  }
  if (tris.length < 3 || area < 1e-4) return null;
  return {
    tris,
    triangles: coat.triangles,
    vertices: coat.positions.length / 3,
    centroid: scale(centroidSum, 1 / area),
    normal: normalize(normalSum),
    area,
  };
}

function facingSamples(tris: GrayTri[], faceNormal: Vec3) {
  const aligned = tris.filter((tri) => dot(tri.normal, faceNormal) >= 0.72);
  const pool = aligned.length >= 12 ? aligned : tris.filter((tri) => dot(tri.normal, faceNormal) >= 0.4);
  const source = pool.length >= 8 ? pool : tris;
  const tangent = unitPerp(faceNormal);
  const bitangent = normalize(cross(faceNormal, tangent));
  const cells = new Map<string, GrayTri>();
  for (const tri of source) {
    const key = `${Math.round(dot(tri.at, tangent))}:${Math.round(dot(tri.at, bitangent))}`;
    const existing = cells.get(key);
    if (!existing || tri.area > existing.area) cells.set(key, tri);
  }
  const spread = [...cells.values()];
  if (spread.length <= 48) return spread;
  const step = spread.length / 48;
  return Array.from({ length: 48 }, (_, index) => spread[Math.floor(index * step)]);
}

function rimToSamples(center: Vec3, offsets: Vec3[], samples: GrayTri[]) {
  let worst = 0;
  for (const offset of offsets) {
    const point = add(center, offset);
    let near = Infinity;
    for (const sample of samples) near = Math.min(near, length(sub(sample.at, point)));
    worst = Math.max(worst, near);
  }
  return worst;
}

function principalDirection(points: Vec3[], center: Vec3, normal: Vec3) {
  const u = unitPerp(normal);
  const v = normalize(cross(normal, u));
  let xx = 0;
  let yy = 0;
  let xy = 0;
  for (const point of points) {
    const delta = sub(point, center);
    const x = dot(delta, u);
    const y = dot(delta, v);
    xx += x * x;
    yy += y * y;
    xy += x * y;
  }
  const angle = 0.5 * Math.atan2(2 * xy, xx - yy);
  return normalize(add(scale(u, Math.cos(angle)), scale(v, Math.sin(angle))));
}

function applyRigid(mesh: IsoMesh, turn: (vector: Vec3) => Vec3, origin: Vec3, target: Vec3): IsoMesh {
  const count = mesh.positions.length / 3;
  const positions = new Float32Array(mesh.positions.length);
  const normals = new Float32Array(mesh.normals.length);
  for (let index = 0; index < count; index += 1) {
    write(positions, index, add(turn(sub(read(mesh.positions, index), origin)), target));
    write(normals, index, turn(read(mesh.normals, index)));
  }
  return { positions, normals, indices: Uint32Array.from(mesh.indices), triangles: mesh.triangles };
}

function loopGap(points: Vec3[], tris: GrayTri[]) {
  let min = Infinity;
  let max = 0;
  let sum = 0;
  for (const point of points) {
    let near = Infinity;
    for (const tri of tris) {
      const hit = closestOnTriangle(point, tri.corners[0], tri.corners[1], tri.corners[2]);
      near = Math.min(near, length(sub(hit, point)));
    }
    min = Math.min(min, near);
    max = Math.max(max, near);
    sum += near;
  }
  return { min, max, mean: points.length > 0 ? sum / points.length : 0 };
}

function parentSurface(
  mesh: IsoMesh,
  frame: FaceFrame,
  tile: Pick<TileInstance, "transform" | "rotation" | "rotationQuarter" | "mirror">,
  placed: FaceFrame,
) {
  const local = meshAttachment(mesh.positions, frame);
  if (!local) return facePoint(placed);
  return add(rotateByBasis(tileBasis(tile), local), tile.transform);
}

function wholeFaceGuides(
  args: {
    parentA: IsoMesh;
    parentB: IsoMesh;
    frameA: FaceFrame;
    frameB: FaceFrame;
    tileA: Pick<TileInstance, "transform" | "rotation" | "rotationQuarter" | "mirror">;
    tileB: Pick<TileInstance, "transform" | "rotation" | "rotationQuarter" | "mirror">;
  },
  endA: Vec3,
  endB: Vec3,
): { mesh: IsoMesh; coverageA: FaceCoverage; coverageB: FaceCoverage } {
  const fieldA = fieldFor(args.parentA, args.frameA, args.tileA, endA);
  const fieldB = fieldFor(args.parentB, args.frameB, args.tileB, endB);
  return { mesh: joinLines([fieldA.mesh, fieldB.mesh]), coverageA: fieldA.report, coverageB: fieldB.report };
}

function fieldFor(
  mesh: IsoMesh,
  frame: FaceFrame,
  tile: Pick<TileInstance, "transform" | "rotation" | "rotationQuarter" | "mirror">,
  terminal: Vec3,
) {
  const coat = faceSurfaceHighlight(mesh, frame);
  const basis = tileBasis(tile);
  const place = (point: Vec3) => add(rotateByBasis(basis, point), tile.transform);
  if (!coat) return { mesh: joinLines([]), report: faceAttachmentField({ positions: new Float32Array(), normals: new Float32Array(), indices: new Uint32Array(), triangles: 0 }, place, terminal).report };
  return faceAttachmentField(coat, place, terminal);
}

function contactGuides(faceA: Vec3, endA: Vec3, faceB: Vec3, endB: Vec3) {
  return joinLines([
    lineMesh(faceA, endA),
    lineMesh(faceB, endB),
    marker(faceA),
    marker(endA),
    marker(faceB),
    marker(endB),
  ]);
}

function lineMesh(a: Vec3, b: Vec3): IsoMesh {
  const axis = sub(b, a);
  const side = scale(unitPerp(axis), 0.03);
  const lift = scale(normalize(cross(normalize(axis), unitPerp(axis))), 0.03);
  const corners = [a, add(a, side), add(a, lift), b, add(b, side), add(b, lift)];
  return meshFrom(corners, [0, 1, 4, 0, 4, 3, 0, 2, 5, 0, 5, 3]);
}

function marker(center: Vec3): IsoMesh {
  const arm = 0.18;
  return joinLines([
    lineMesh(add(center, { x: -arm, y: 0, z: 0 }), add(center, { x: arm, y: 0, z: 0 })),
    lineMesh(add(center, { x: 0, y: -arm, z: 0 }), add(center, { x: 0, y: arm, z: 0 })),
    lineMesh(add(center, { x: 0, y: 0, z: -arm }), add(center, { x: 0, y: 0, z: arm })),
  ]);
}

function joinLines(meshes: IsoMesh[]): IsoMesh {
  const ready = meshes.filter((mesh) => mesh.positions.length > 0);
  const positions = new Float32Array(ready.reduce((sum, mesh) => sum + mesh.positions.length, 0));
  const normals = new Float32Array(positions.length);
  const indices: number[] = [];
  let vertex = 0;
  let written = 0;
  for (const mesh of ready) {
    positions.set(mesh.positions, written);
    normals.set(mesh.normals, written);
    mesh.indices.forEach((index) => indices.push(index + vertex));
    vertex += mesh.positions.length / 3;
    written += mesh.positions.length;
  }
  return { positions, normals, indices: Uint32Array.from(indices), triangles: indices.length / 3 };
}

function meshFrom(corners: Vec3[], indices: number[]): IsoMesh {
  const positions = new Float32Array(corners.length * 3);
  const normals = new Float32Array(positions.length);
  corners.forEach((corner, index) => write(positions, index, corner));
  for (let triangle = 0; triangle < indices.length; triangle += 3) {
    const normal = cross(
      sub(corners[indices[triangle + 1]], corners[indices[triangle]]),
      sub(corners[indices[triangle + 2]], corners[indices[triangle]]),
    );
    for (let corner = 0; corner < 3; corner += 1) {
      const offset = indices[triangle + corner] * 3;
      normals[offset] += normal.x;
      normals[offset + 1] += normal.y;
      normals[offset + 2] += normal.z;
    }
  }
  return { positions, normals, indices: Uint32Array.from(indices), triangles: indices.length / 3 };
}

function meanRadius(loop: Vec3[]) {
  const center = centroid(loop);
  return loop.reduce((sum, point) => sum + length(sub(point, center)), 0) / Math.max(1, loop.length);
}

function roundVec(point: Vec3) {
  return { x: Number(point.x.toFixed(2)), y: Number(point.y.toFixed(2)), z: Number(point.z.toFixed(2)) };
}

export function coreDistanceSignature(mesh: IsoMesh, count = mesh.positions.length / 3) {
  let sum = 0;
  let samples = 0;
  for (let index = 0; index < count; index += 17) {
    const other = (index * 7 + 13) % count;
    sum += Math.hypot(
      mesh.positions[index * 3] - mesh.positions[other * 3],
      mesh.positions[index * 3 + 1] - mesh.positions[other * 3 + 1],
      mesh.positions[index * 3 + 2] - mesh.positions[other * 3 + 2],
    );
    samples += 1;
  }
  return { vertices: count, triangles: mesh.triangles, span: samples > 0 ? sum / samples : 0 };
}

function rigidCopy(mesh: IsoMesh, sourceStart: Vec3, sourceEnd: Vec3, targetStart: Vec3, targetEnd: Vec3, upHint: Vec3, samples: number) {
  const axisTurn = rotationFromTo(sub(sourceEnd, sourceStart), sub(targetEnd, targetStart));
  const sourceUp = samples > 0 ? sectionUp(mesh, samples) : upHint;
  const targetDir = normalize(sub(targetEnd, targetStart));
  const roll = rotationFromTo(reject(axisTurn(sourceUp), targetDir), reject(upHint, targetDir));
  const turn = (vector: Vec3) => roll(axisTurn(vector));
  const sourceMid = lerp(sourceStart, sourceEnd, 0.5);
  const targetMid = lerp(targetStart, targetEnd, 0.5);
  const count = mesh.positions.length / 3;
  const positions = new Float32Array(mesh.positions.length);
  const normals = new Float32Array(mesh.normals.length);
  for (let index = 0; index < count; index += 1) {
    write(positions, index, add(turn(sub(read(mesh.positions, index), sourceMid)), targetMid));
    write(normals, index, turn(read(mesh.normals, index)));
  }
  return { positions, normals, indices: Uint32Array.from(mesh.indices), triangles: mesh.triangles };
}

function conformEnd(positions: Float32Array, rigid: IsoMesh, samples: number, count: number, start: boolean, nodes: FaceNode[], faceNormal: Vec3, spread: number): EndSeat {
  const empty = { alignmentError: 0, deformation: 0, spreadArea: 0, branches: 0, domain: nodes.length };
  if (nodes.length < 3) return empty;
  const steps = samples > 0 ? Math.floor(count / samples) : 0;
  const ring = terminalLoop(rigid, samples, count, start);
  if (ring.length < 3) return empty;
  const origin = centroid(ring);
  const outward = loopNormal(ring);
  const site = bestSite(nodes, origin, outward, faceNormal);
  const weights = branchWeights(ring);
  const branches = weights.filter((weight) => weight > 0).length;
  const moved: Vec3[] = [];
  let travel = 0;
  const limit = samples > 0 ? BAND : 1;
  for (let band = 0; band < limit; band += 1) {
    const station = start ? band : steps - 1 - band;
    const falloff = band === 0 ? 1 : 0.3;
    for (let sample = 0; sample < ring.length; sample += 1) {
      const index = samples > 0 ? station * samples + sample : sample;
      if (index < 0 || index >= count) continue;
      const current = read(rigid.positions, index);
      const seated = seatVertex(current, origin, weights[sample] ?? 0, site, nodes, faceNormal, spread);
      const next = lerp(current, seated, falloff);
      write(positions, index, next);
      if (band === 0) {
        moved.push(next);
        travel += length(sub(next, current));
      }
    }
  }
  return {
    alignmentError: length(sub(site.at, origin)),
    deformation: travel / Math.max(1, ring.length),
    spreadArea: loopArea(moved),
    branches: Math.max(1, Math.min(3, branches)),
    domain: nodes.length,
  };
}

function seatVertex(point: Vec3, origin: Vec3, branch: number, site: FaceNode, nodes: FaceNode[], faceNormal: Vec3, spread: number) {
  const local = nearestOnFace(point, nodes);
  const away = reject(sub(point, origin), faceNormal);
  const creep = scale(normalize(length(away) > 1e-5 ? away : site.normal), spread * branch);
  const spreadHit = nearestOnFace(add(local.point, creep), nodes);
  const onFace = lerp(local.point, spreadHit.point, branch);
  return add(onFace, scale(normalize(faceNormal), -OVERLAP));
}

function bestSite(nodes: FaceNode[], terminal: Vec3, outward: Vec3, faceNormal: Vec3) {
  let best = nodes[0];
  let bestScore = Infinity;
  for (const node of nodes) {
    const delta = sub(node.at, terminal);
    const lateral = length(reject(delta, faceNormal));
    const facing = -dot(normalize(outward), normalize(node.normal));
    const smooth = dot(normalize(node.normal), normalize(faceNormal));
    const opening = node.area < 0.15 ? 2.4 : 0;
    const score = lateral * 1.35 + Math.abs(dot(delta, faceNormal)) * 0.7 - facing * 0.35 - smooth * 0.15 + opening;
    if (score < bestScore) {
      best = node;
      bestScore = score;
    }
  }
  return best;
}

function nearestOnFace(point: Vec3, nodes: FaceNode[]) {
  let best = nodes[0].at;
  let bestDistance = Infinity;
  let normal = nodes[0].normal;
  for (const node of nodes) {
    const hit = closestOnTriangle(point, node.corners[0], node.corners[1], node.corners[2]);
    const distance = length(sub(hit, point));
    if (distance < bestDistance) {
      best = hit;
      bestDistance = distance;
      normal = node.normal;
    }
  }
  return { point: best, normal, distance: bestDistance };
}

function closestOnTriangle(point: Vec3, a: Vec3, b: Vec3, c: Vec3) {
  const ab = sub(b, a);
  const ac = sub(c, a);
  const ap = sub(point, a);
  const d1 = dot(ab, ap);
  const d2 = dot(ac, ap);
  if (d1 <= 0 && d2 <= 0) return a;
  const bp = sub(point, b);
  const d3 = dot(ab, bp);
  const d4 = dot(ac, bp);
  if (d3 >= 0 && d4 <= d3) return b;
  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) return add(a, scale(ab, d1 / Math.max(1e-8, d1 - d3)));
  const cp = sub(point, c);
  const d5 = dot(ab, cp);
  const d6 = dot(ac, cp);
  if (d6 >= 0 && d5 <= d6) return c;
  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) return add(a, scale(ac, d2 / Math.max(1e-8, d2 - d6)));
  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && d4 >= d3 && d5 >= d6) return add(b, scale(sub(c, b), (d4 - d3) / Math.max(1e-8, d4 - d3 + d5 - d6)));
  const denom = 1 / Math.max(1e-8, va + vb + vc);
  return add(a, add(scale(ab, vb * denom), scale(ac, vc * denom)));
}

function branchWeights(ring: Vec3[]) {
  const center = centroid(ring);
  const radii = ring.map((point) => length(sub(point, center)));
  const mean = radii.reduce((sum, value) => sum + value, 0) / Math.max(1, radii.length);
  const peaks: number[] = [];
  for (let index = 0; index < ring.length; index += 1) {
    const previous = radii[(index + ring.length - 1) % ring.length];
    const next = radii[(index + 1) % ring.length];
    if (radii[index] >= previous && radii[index] >= next && radii[index] > mean * 1.08) peaks.push(index);
  }
  const kept = peaks.filter((peak, index) => index === 0 || peak - peaks[index - 1] > 8).slice(0, 3);
  return radii.map((_, index) => {
    let weight = 0;
    for (const peak of kept) {
      const span = Math.min(Math.abs(index - peak), ring.length - Math.abs(index - peak));
      weight = Math.max(weight, Math.max(0, 1 - span / 10));
    }
    return weight;
  });
}

function faceDomain(mesh: IsoMesh, frame: FaceFrame, tile: Pick<TileInstance, "transform" | "rotation" | "rotationQuarter" | "mirror">) {
  const basis = tileBasis(tile);
  const place = (point: Vec3) => add(rotateByBasis(basis, point), tile.transform);
  const reach = Math.max(sectionReach(frame) * 3, 0.8);
  const nodes: FaceNode[] = [];
  for (let triangle = 0; triangle < mesh.indices.length; triangle += 3) {
    const a = read(mesh.positions, mesh.indices[triangle]);
    const b = read(mesh.positions, mesh.indices[triangle + 1]);
    const c = read(mesh.positions, mesh.indices[triangle + 2]);
    const center = scale(add(add(a, b), c), 1 / 3);
    const delta = sub(center, frame.origin);
    const depth = dot(delta, frame.normal);
    const u = dot(delta, frame.u);
    const v = dot(delta, frame.v);
    const width = cross(sub(b, a), sub(c, a));
    const area = length(width);
    if (area < 1e-6) continue;
    if (dot(scale(width, 1 / area), frame.normal) < 0.05) continue;
    if (depth > 0.35 || depth < -reach) continue;
    if (Math.abs(u) > frame.extent.u * 0.55 || Math.abs(v) > frame.extent.v * 0.55) continue;
    nodes.push({
      at: place(center),
      normal: placeNormal(width, basis),
      area,
      depth: Math.abs(depth),
      u,
      v,
      corners: [place(a), place(b), place(c)],
    });
  }
  return coverFace(nodes);
}

function coverFace(nodes: FaceNode[]) {
  if (nodes.length === 0) return nodes;
  const cells = new Map<string, FaceNode>();
  for (const node of nodes) {
    const key = `${Math.round(node.u / 0.85)}:${Math.round(node.v / 0.85)}`;
    const existing = cells.get(key);
    if (!existing || node.depth < existing.depth) cells.set(key, node);
  }
  return [...cells.values()].slice(0, 480);
}

function spreadReach(frame: FaceFrame) {
  return Math.min(frame.extent.u, frame.extent.v) * 0.12;
}

function coreMatches(source: IsoMesh, placed: IsoMesh, samples: number) {
  if (samples < 3) return true;
  const steps = Math.floor(source.positions.length / 3 / samples);
  for (let station = BAND; station <= steps - 1 - BAND; station += 1) {
    for (let sample = 0; sample < samples; sample += 1) {
      const index = station * samples + sample;
      for (let axis = 0; axis < 3; axis += 1) {
        if (Math.abs(source.positions[index * 3 + axis] - placed.positions[index * 3 + axis]) > 1e-5) return false;
      }
    }
  }
  return true;
}

function terminalLoop(mesh: IsoMesh, samples: number, count: number, start: boolean) {
  if (samples > 0) return readRange(mesh, start ? 0 : count - samples, samples);
  return readRange(mesh, 0, Math.min(count, 24));
}

function sameIndices(source: IsoMesh, placed: IsoMesh) {
  if (placed.indices.length !== source.indices.length) return false;
  for (let index = 0; index < source.indices.length; index += 1) {
    if (placed.indices[index] !== source.indices[index]) return false;
  }
  return true;
}

function boundsOf(mesh: IsoMesh) {
  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;
  for (let index = 0; index < mesh.positions.length; index += 3) {
    minX = Math.min(minX, mesh.positions[index]);
    minY = Math.min(minY, mesh.positions[index + 1]);
    minZ = Math.min(minZ, mesh.positions[index + 2]);
    maxX = Math.max(maxX, mesh.positions[index]);
    maxY = Math.max(maxY, mesh.positions[index + 1]);
    maxZ = Math.max(maxZ, mesh.positions[index + 2]);
  }
  return { x: maxX - minX, y: maxY - minY, z: maxZ - minZ };
}

function sectionUp(mesh: IsoMesh, samples: number) {
  const center = centroid(readRange(mesh, 0, samples));
  let best = { x: 0, y: 1, z: 0 };
  let bestLength = 0;
  for (let index = 0; index < samples; index += 1) {
    const delta = sub(read(mesh.positions, index), center);
    const span = length(delta);
    if (span > bestLength) {
      best = delta;
      bestLength = span;
    }
  }
  return best;
}

function reject(vector: Vec3, axis: Vec3) {
  return sub(vector, scale(axis, dot(vector, axis)));
}

function rotationFromTo(from: Vec3, to: Vec3) {
  if (length(from) < 1e-5 || length(to) < 1e-5) return (vector: Vec3) => vector;
  const a = normalize(from);
  const b = normalize(to);
  const sineVector = cross(a, b);
  const sine = length(sineVector);
  const cosine = Math.min(1, Math.max(-1, dot(a, b)));
  if (sine < 1e-6) {
    if (cosine > 0) return (vector: Vec3) => vector;
    const axis = unitPerp(a);
    return (vector: Vec3) => rotateAround(vector, axis, Math.PI);
  }
  return (vector: Vec3) => rotateAround(vector, scale(sineVector, 1 / sine), Math.acos(cosine));
}

function facePoint(frame: FaceFrame) {
  return add(frame.origin, scale(frame.normal, -sectionReach(frame)));
}

function placeNormal(width: Vec3, basis: ReturnType<typeof tileBasis>) {
  return normalize(rotateByBasis(basis, width));
}

function loopArea(loop: Vec3[]) {
  let sum = { x: 0, y: 0, z: 0 };
  for (let index = 0; index < loop.length; index += 1) sum = add(sum, cross(loop[index], loop[(index + 1) % loop.length]));
  return length(sum) * 0.5;
}

function loopNormal(loop: Vec3[]) {
  let sum = { x: 0, y: 0, z: 0 };
  for (let index = 0; index < loop.length; index += 1) sum = add(sum, cross(loop[index], loop[(index + 1) % loop.length]));
  return normalize(sum);
}

function readRange(mesh: IsoMesh, start: number, count: number) {
  return Array.from({ length: count }, (_, index) => read(mesh.positions, start + index));
}

function meshCentroid(mesh: IsoMesh) {
  return centroid(Array.from({ length: mesh.positions.length / 3 }, (_, index) => read(mesh.positions, index)));
}

function centroid(points: Vec3[]) {
  return scale(points.reduce((sum, point) => add(sum, point), { x: 0, y: 0, z: 0 }), 1 / Math.max(1, points.length));
}

function rotateAround(vector: Vec3, axis: Vec3, angle: number) {
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  return add(add(scale(vector, cosine), scale(cross(axis, vector), sine)), scale(axis, dot(axis, vector) * (1 - cosine)));
}

function unitPerp(value: Vec3) {
  const helper = Math.abs(value.y) < 0.9 ? { x: 0, y: 1, z: 0 } : { x: 1, y: 0, z: 0 };
  return normalize(cross(value, helper));
}

function read(buffer: Float32Array, vertex: number): Vec3 {
  const offset = vertex * 3;
  return { x: buffer[offset], y: buffer[offset + 1], z: buffer[offset + 2] };
}

function write(buffer: Float32Array, vertex: number, value: Vec3) {
  const offset = vertex * 3;
  buffer[offset] = value.x;
  buffer[offset + 1] = value.y;
  buffer[offset + 2] = value.z;
}

function add(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

function sub(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

function scale(value: Vec3, factor: number): Vec3 {
  return { x: value.x * factor, y: value.y * factor, z: value.z * factor };
}

function lerp(a: Vec3, b: Vec3, t: number): Vec3 {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t };
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return { x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x };
}

function dot(a: Vec3, b: Vec3) {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function length(value: Vec3) {
  return Math.hypot(value.x, value.y, value.z);
}

function normalize(value: Vec3) {
  return scale(value, 1 / Math.max(1e-8, length(value)));
}
