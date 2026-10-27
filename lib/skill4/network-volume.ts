import type { HybridCandidate } from "./candidate-field";
import { chooseConnectionSpan, preferredConnectionSpan, sectionInset } from "./connection-span";
import { MODULE_SIZE, type Vec3 } from "./contract";
import { HYBRID_GAP } from "./tiles";
import type { FaceObservation } from "./face-sample";
import type { FaceDepthSignature, FaceProfile } from "./face-profile";
import { connectorFrame } from "./hybrid-deformation";
import type { IsoMesh } from "../scan/isomesh";
import { buildTransitionVolume } from "./transition-volume";

/**
 * Skill 04 seats the parent sections, then builds the connector as a
 * transformation of those sections. The implicit network is not the silhouette.
 */
export const NETWORK_VOLUME_SETTINGS = {
  version: "skill4-network-volume-v4",
  pitch: 0.024 * MODULE_SIZE,
  minimumRadius: 0.028 * MODULE_SIZE,
  rows: [20, 28, 40, 60, 80],
} as const;

export type NetworkReport = {
  nodes: number;
  edges: number;
  primary: number;
  secondary: number;
  tertiary: number;
  merges: number;
  pruned: number;
  steps: number;
  minRadius: number;
  maxRadius: number;
  grid: [number, number, number];
  zonesA: number;
  zonesB: number;
  routes: number;
  routeScores: number[];
  zoneAnglesA: number[];
  zoneAnglesB: number[];
  connectionSpan: number;
  hybridSpan: number;
  primaryBranches: number;
  secondaryBranches: number;
  tertiaryBranches: number;
  averageRadius: number;
  primaryRadius: number;
  secondaryRadius: number;
  tertiaryRadius: number;
  junctions: number;
  crossLinks: number;
  openings: number;
  straightness: number;
  porosity: number;
};

export function growHybridVolume(args: {
  profileA: FaceProfile;
  profileB: FaceProfile;
  candidate: HybridCandidate;
  observationA: FaceObservation;
  observationB: FaceObservation;
  signatureA?: FaceDepthSignature;
  signatureB?: FaceDepthSignature;
  meshA?: IsoMesh | null;
  meshB?: IsoMesh | null;
}): { status: "ready" | "empty" | "blocked"; mesh: IsoMesh | null; stages?: IsoMesh[]; reason: string; report: NetworkReport | null } {
  const loopA = largestLoop(args.profileA);
  const sourceB = largestLoop(args.profileB);
  if (!loopA || !sourceB) return { status: "empty", mesh: null, reason: "A face section has no closed loop.", report: null };
  const centerA = average(loopA.points.map((point) => point.position));
  const centerB0 = average(sourceB.points.map((point) => point.position));
  const initial = connectorFrame(centerA, centerB0);
  if (!initial || initial.span < 1e-4) return { status: "blocked", mesh: null, reason: "The two sections do not form a connection span.", report: null };

  const row = Math.min(4, Math.max(0, args.candidate.row));
  const intensity = clamp01(finite(args.candidate.transformationIntensity, 0.5));
  const faceSpan = Math.min(
    args.profileA.frame?.extent.u ?? MODULE_SIZE,
    args.profileA.frame?.extent.v ?? MODULE_SIZE,
    args.profileB.frame?.extent.u ?? MODULE_SIZE,
    args.profileB.frame?.extent.v ?? MODULE_SIZE,
  );
  const morph = args.candidate.morphology ?? { section: 1, curvature: 0, void: 0, branch: 0 };
  const negotiation = Math.min(1, Math.max(0, morph.void * 0.55 + Math.min(1, morph.branch / 4) * 0.45));
  const faceGap = chooseConnectionSpan(preferredConnectionSpan(row, intensity, faceSpan, negotiation), HYBRID_GAP);
  const hybridSpan = faceGap + sectionInset(args.profileA.frame?.extent) + sectionInset(args.profileB.frame?.extent);
  const loopB = {
    ...sourceB,
    points: sourceB.points.map((point) => ({ ...point, position: add(point.position, scale(initial.direction, hybridSpan - initial.span)) })),
  };
  const profileB = { ...args.profileB, loops: args.profileB.loops.map((loop) => (loop === sourceB ? loopB : loop)) };
  const centerB = average(loopB.points.map((point) => point.position));
  const frame = connectorFrame(centerA, centerB);
  if (!frame || frame.span < 1e-4) return { status: "blocked", mesh: null, reason: "The two sections do not form a connection span.", report: null };
  const transition = buildTransitionVolume({
    profileA: args.profileA,
    profileB,
    loopA,
    loopB,
    centerA,
    centerB,
    candidate: args.candidate,
    observationA: args.observationA,
    observationB: args.observationB,
    meshA: args.meshA ?? null,
    meshB: args.meshB ?? null,
  });
  if (!("report" in transition) || !transition.mesh) {
    return { status: "blocked", mesh: null, reason: "reason" in transition ? transition.reason : "The section transition did not produce a volume.", report: null };
  }
  const tier = Math.max(0, args.candidate.row - 1);
  return {
    status: "ready",
    mesh: transition.mesh,
    stages: transition.stages,
    reason: "",
    report: {
      nodes: transition.mesh.positions.length / 3,
      edges: transition.report.splits + transition.report.voids,
      primary: 1,
      secondary: transition.report.splits,
      tertiary: tier,
      merges: 0,
      pruned: 0,
      steps: 13,
      minRadius: transition.report.meanRadius * 0.45,
      maxRadius: transition.report.meanRadius,
      grid: [36, 13, 1],
      zonesA: 1,
      zonesB: 1,
      routes: transition.report.splits,
      routeScores: [],
      zoneAnglesA: [],
      zoneAnglesB: [],
      connectionSpan: Number(faceGap.toFixed(3)),
      hybridSpan: Number(hybridSpan.toFixed(3)),
      primaryBranches: 1,
      secondaryBranches: transition.report.splits,
      tertiaryBranches: tier,
      averageRadius: Number(transition.report.meanRadius.toFixed(3)),
      primaryRadius: Number(transition.report.meanRadius.toFixed(3)),
      secondaryRadius: Number((transition.report.meanRadius * 0.55).toFixed(3)),
      tertiaryRadius: tier > 0 ? Number((transition.report.meanRadius * 0.3).toFixed(3)) : 0,
      junctions: transition.report.splits,
      crossLinks: Math.max(0, args.candidate.row - 2),
      openings: transition.report.voids,
      straightness: Number((1 - morph.curvature * intensity * 0.35).toFixed(3)),
      porosity: Number((transition.report.voids / 36).toFixed(3)),
    },
  };

}

function largestLoop(profile: FaceProfile) {
  const loops = profile.loops.filter((loop) => loop.points.length >= 3);
  if (loops.length === 0) return null;
  return loops.reduce((best, loop) => (loop.points.length > best.points.length ? loop : best));
}

function average(points: Vec3[]): Vec3 {
  return scale(points.reduce((sum, point) => add(sum, point), { x: 0, y: 0, z: 0 }), 1 / points.length);
}

function add(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

function scale(value: Vec3, factor: number): Vec3 {
  return { x: value.x * factor, y: value.y * factor, z: value.z * factor };
}

function clamp01(value: number) {
  return Math.min(1, Math.max(0, value));
}

function finite(value: number | undefined, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}
