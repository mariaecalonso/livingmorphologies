/**
 * Versioned compatibility atlas.
 * This is the record of tested pair poses. It is not the cluster catalog.
 * An accepted pose can be offered again as a candidate. It still has to be
 * revalidated against the assembled cluster. A rejection is not a closed pair.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { Skill6Pose, Vec3 } from "./contract";
import type { ArchetypeMesh } from "./source";

export const ATLAS_PATH = path.join(process.cwd(), "data", "skill6", "atlas", "v1.json");
export const ATLAS_VERSION = 1;

export type AtlasPose = {
  quarterZ: Skill6Pose["quarterZ"];
  mirrorX: boolean;
  basis: number[];
  translation: number[];
};

export type AtlasEntry = {
  id: string;
  host: string;
  guest: string;
  sourceRevision: string;
  hostTriangles: number;
  guestTriangles: number;
  hostVolume: number;
  guestVolume: number;
  method: "fixed-seat" | "adaptive-seating-v1" | "proximity-dock-v1";
  experiment: string;
  parameters: {
    gap: number;
    shift: number[];
    axis?: string;
    yaw?: number;
    pitch?: number;
    roll?: number;
    mirrorX?: boolean;
    twist?: number;
    hostRegion?: string;
    guestRegion?: string;
  };
  pose: AtlasPose;
  region: {
    hostRegion: string | null;
    guestRegion: string | null;
    contactNormal: Vec3 | null;
    displacement: Vec3 | null;
    growthDirection: string | null;
  };
  contact: {
    area: number;
    coherentRegions: number;
    residualGap: number | null;
    normalAlignment: number | null;
    minSurfaceDistance: number | null;
    deepestCrossing: number;
    overlapVolume: number | null;
  };
  outcome: "accepted" | "rejected";
  reason: string | null;
  /** Rejections stay in the history. They do not mark the pair incompatible forever. */
  closed: false;
};

export type AtlasFile = {
  version: typeof ATLAS_VERSION;
  sourceRevision: string;
  note: string;
  closedPairs: false;
  experiments: { id: string; entries: number }[];
  entries: AtlasEntry[];
};

export type ReusablePose = {
  host: string;
  guest: string;
  pose: Skill6Pose;
  experiment: string;
  method: AtlasEntry["method"];
  contactArea: number;
  /** Stored acceptance is not clearance. Run the contact and collision tests on the assembled cluster. */
  revalidate: true;
};

type Measured = {
  accepted?: boolean;
  gap?: number;
  shift?: number[];
  pose?: { quarterZ?: number; mirrorX?: boolean; basis?: number[]; translation?: number[] };
  contactArea?: number;
  coherentRegions?: number;
  residualGap?: number | null;
  normalAlignment?: number | null;
  minSurfaceDistance?: number | null;
  deepestCrossing?: number;
  overlapVolume?: number | null;
  reason?: string | null;
  contactNormal?: Vec3 | null;
  displacement?: Vec3 | null;
  growthDirection?: string | null;
};

export function sourceRevision(meshes: readonly ArchetypeMesh[]): string {
  const body = meshes
    .map((mesh) => `${mesh.archetypeId}:${mesh.triangles}:${mesh.solidVolume.toFixed(2)}:${mesh.continuationId}`)
    .sort()
    .join("|");
  let hash = 2166136261;
  for (let index = 0; index < body.length; index += 1) hash = Math.imul(hash ^ body.charCodeAt(index), 16777619);
  return (hash >>> 0).toString(16);
}

export function poseKey(host: string, guest: string, pose: { basis: readonly number[]; translation: readonly number[] }, gap: number): string {
  const basis = pose.basis.map((value) => value.toFixed(3)).join(",");
  const translation = pose.translation.map((value) => value.toFixed(2)).join(",");
  return `${host}|${guest}|${basis}|${translation}|${gap.toFixed(2)}`;
}

function meshOf(meshes: readonly ArchetypeMesh[], id: string): ArchetypeMesh | undefined {
  return meshes.find((mesh) => mesh.archetypeId === id);
}

export function entryFromMeasurement(input: {
  host: string;
  guest: string;
  meshes: readonly ArchetypeMesh[];
  revision: string;
  method: AtlasEntry["method"];
  experiment: string;
  measured: Measured;
  orientation?: { axis?: string; yaw?: number; pitch?: number; roll?: number; mirrorX?: boolean };
  twist?: number;
  hostRegion?: string;
  guestRegion?: string;
}): AtlasEntry | null {
  const pose = input.measured.pose;
  if (!pose?.basis || !pose.translation || pose.basis.length !== 9 || pose.translation.length !== 3) return null;
  if (input.measured.contactArea == null || input.measured.deepestCrossing == null) return null;
  const host = meshOf(input.meshes, input.host);
  const guest = meshOf(input.meshes, input.guest);
  if (!host || !guest) return null;
  const gap = input.measured.gap ?? 0;
  return {
    id: poseKey(input.host, input.guest, pose, gap),
    host: input.host,
    guest: input.guest,
    sourceRevision: input.revision,
    hostTriangles: host.triangles,
    guestTriangles: guest.triangles,
    hostVolume: host.solidVolume,
    guestVolume: guest.solidVolume,
    method: input.method,
    experiment: input.experiment,
    parameters: {
      gap,
      shift: input.measured.shift ?? [0, 0, 0],
      axis: input.orientation?.axis,
      yaw: input.orientation?.yaw,
      pitch: input.orientation?.pitch,
      roll: input.orientation?.roll,
      mirrorX: input.orientation?.mirrorX,
      twist: input.twist,
      hostRegion: input.hostRegion,
      guestRegion: input.guestRegion,
    },
    pose: { quarterZ: (pose.quarterZ ?? 0) as 0 | 1 | 2 | 3, mirrorX: Boolean(pose.mirrorX), basis: [...pose.basis], translation: [...pose.translation] },
    region: {
      hostRegion: input.hostRegion ?? null,
      guestRegion: input.guestRegion ?? null,
      contactNormal: input.measured.contactNormal ?? null,
      displacement: input.measured.displacement ?? null,
      growthDirection: input.measured.growthDirection ?? null,
    },
    contact: {
      area: input.measured.contactArea,
      coherentRegions: input.measured.coherentRegions ?? 0,
      residualGap: input.measured.residualGap ?? null,
      normalAlignment: input.measured.normalAlignment ?? null,
      minSurfaceDistance: input.measured.minSurfaceDistance ?? null,
      deepestCrossing: input.measured.deepestCrossing,
      overlapVolume: input.measured.overlapVolume ?? null,
    },
    outcome: input.measured.accepted ? "accepted" : "rejected",
    reason: input.measured.reason ?? null,
    closed: false,
  };
}

/** First record wins. An accepted record replaces a rejected record of the same pose. */
export function mergeEntries(current: readonly AtlasEntry[], incoming: readonly AtlasEntry[]): AtlasEntry[] {
  const byId = new Map(current.map((entry) => [entry.id, entry]));
  for (const entry of incoming) {
    const prior = byId.get(entry.id);
    if (!prior || (prior.outcome === "rejected" && entry.outcome === "accepted")) byId.set(entry.id, entry);
  }
  return [...byId.values()];
}

export function readAtlas(file = ATLAS_PATH): AtlasFile | null {
  try {
    const parsed = JSON.parse(readFileSync(file, "utf8")) as AtlasFile;
    if (parsed.version !== ATLAS_VERSION || !Array.isArray(parsed.entries)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeAtlas(atlas: AtlasFile, file = ATLAS_PATH) {
  mkdirSync(path.dirname(file), { recursive: true });
  const experiments = new Map<string, number>();
  for (const entry of atlas.entries) experiments.set(entry.experiment, (experiments.get(entry.experiment) ?? 0) + 1);
  writeFileSync(file, JSON.stringify({ ...atlas, experiments: [...experiments].map(([id, entries]) => ({ id, entries })) }, null, 1));
}

export function acceptedPoses(atlas: AtlasFile, host: string, guest: string, revision = atlas.sourceRevision): AtlasEntry[] {
  return atlas.entries.filter((entry) => entry.host === host && entry.guest === guest && entry.outcome === "accepted" && entry.sourceRevision === revision);
}

export function pairHistory(atlas: AtlasFile, host: string, guest: string) {
  const entries = atlas.entries.filter((entry) => entry.host === host && entry.guest === guest);
  return {
    accepted: entries.filter((entry) => entry.outcome === "accepted").length,
    rejected: entries.filter((entry) => entry.outcome === "rejected").length,
    closed: false as const,
    entries,
  };
}

/** Validated poses for a later cluster search. Each one still has to pass on the assembled geometry. */
export function candidatePoses(atlas: AtlasFile, host: string, guest: string, revision = atlas.sourceRevision): ReusablePose[] {
  return acceptedPoses(atlas, host, guest, revision).map((entry) => ({
    host: entry.host,
    guest: entry.guest,
    pose: { quarterZ: entry.pose.quarterZ, mirrorX: entry.pose.mirrorX, basis: entry.pose.basis as Skill6Pose["basis"], translation: entry.pose.translation as Vec3 },
    experiment: entry.experiment,
    method: entry.method,
    contactArea: entry.contact.area,
    revalidate: true as const,
  }));
}

type AdaptiveDirection = {
  host: string;
  guest: string;
  orientation?: { axis?: string; yaw?: number; pitch?: number; roll?: number; mirrorX?: boolean };
  fixed?: Measured | null;
  adaptive?: Measured | null;
  method?: Measured | null;
  methodUsesSlide?: boolean;
};

/** Fixed and adaptive records that already carry a pose and a validation outcome. */
export function entriesFromAdaptive(file: { directions?: AdaptiveDirection[] }, meshes: readonly ArchetypeMesh[], revision: string): AtlasEntry[] {
  const found: AtlasEntry[] = [];
  for (const direction of file.directions ?? []) {
    const orientation = direction.orientation;
    const push = (method: AtlasEntry["method"], measured: Measured | null | undefined, experiment: string) => {
      if (!measured) return;
      const entry = entryFromMeasurement({ host: direction.host, guest: direction.guest, meshes, revision, method, experiment, measured, orientation });
      if (entry) found.push(entry);
    };
    push("fixed-seat", direction.fixed, "adaptive-seating-v1");
    push("adaptive-seating-v1", direction.adaptive, "adaptive-seating-v1");
    if (direction.methodUsesSlide) push("adaptive-seating-v1", direction.method, "adaptive-seating-v1");
  }
  return mergeEntries([], found);
}
