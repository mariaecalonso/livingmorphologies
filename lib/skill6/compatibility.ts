/**
 * Resumable compatibility cache for the fifteen archetypes.
 * Skill 3 meshes are only read. Findings are written under data/skill6.
 *
 * Run: npx tsx lib/skill6/compatibility.ts
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { SKILL6_PARAMETERS, type Quarter, type Skill6Pose } from "./contract";
import { poseWithBasis } from "./geometry";
import { ENVELOPE_GRID, describeSpec, studyDirectionVolume, type DirectionStudy, type EnvelopeReading } from "./envelope";
import { loadArchetypeMeshes } from "./source";

export const COMPATIBILITY_PATH = path.join(process.cwd(), "data", "skill6", "compatibility.json");

type StoredPose = {
  yaw: number;
  pitch: number;
  roll: number;
  axis: string;
  gap: number;
  mirrorX: boolean;
  basis: number[];
  translation: number[];
  quarterZ: number;
  contactArea: number;
  coherentRegions: number;
  residualGap: number | null;
  minSurfaceDistance: number | null;
  normalAlignment: number | null;
  deepestCrossing: number;
  overlapVolume: number | null;
  verdict: EnvelopeReading["verdict"];
  note: string;
};

type StoredDirection = {
  host: string;
  guest: string;
  compatible: boolean;
  testedPoses: number;
  denseChecks: number;
  seconds: number;
  rejection: string | null;
  nearMiss: DirectionStudy["nearMiss"];
  poses: StoredPose[];
};

type StoredPair = {
  left: string;
  right: string;
  directions: StoredDirection[];
};

export type CompatibilityFile = {
  version: 1;
  search: typeof ENVELOPE_GRID;
  thresholds: {
    contactTolerance: number;
    minContactArea: number;
    maxPenetration: number;
    normalOpposition: number;
    targetGap: number;
  };
  totalPairs: number;
  pairs: StoredPair[];
};

function storePose(reading: EnvelopeReading): StoredPose {
  return {
    yaw: reading.spec.yaw,
    pitch: reading.spec.pitch,
    roll: reading.spec.roll,
    axis: reading.spec.axisName,
    gap: reading.spec.gap,
    mirrorX: reading.spec.mirrorX,
    basis: [...reading.pose.basis],
    translation: [...reading.pose.translation],
    quarterZ: reading.pose.quarterZ,
    contactArea: reading.contactArea,
    coherentRegions: reading.coherentRegions,
    residualGap: reading.residualGap,
    minSurfaceDistance: reading.minSurfaceDistance,
    normalAlignment: reading.normalAlignment,
    deepestCrossing: reading.deepestCrossing,
    overlapVolume: reading.overlapVolume,
    verdict: reading.verdict,
    note: describeSpec(reading.spec),
  };
}

function storeDirection(study: DirectionStudy): StoredDirection {
  return {
    host: study.hostId,
    guest: study.guestId,
    compatible: study.compatible,
    testedPoses: study.testedPoses,
    denseChecks: study.denseChecks,
    seconds: study.seconds,
    rejection: study.rejection,
    nearMiss: study.nearMiss,
    poses: study.poses.map(storePose),
  };
}

export function emptyCompatibility(totalPairs: number): CompatibilityFile {
  return {
    version: 1,
    search: ENVELOPE_GRID,
    thresholds: {
      contactTolerance: SKILL6_PARAMETERS.contactTolerance,
      minContactArea: SKILL6_PARAMETERS.minContactArea,
      maxPenetration: SKILL6_PARAMETERS.maxPenetration,
      normalOpposition: SKILL6_PARAMETERS.normalOpposition,
      targetGap: SKILL6_PARAMETERS.targetGap,
    },
    totalPairs,
    pairs: [],
  };
}

export function readCompatibility(file = COMPATIBILITY_PATH): CompatibilityFile | null {
  try {
    const parsed = JSON.parse(readFileSync(file, "utf8")) as CompatibilityFile;
    if (parsed.version !== 1 || !Array.isArray(parsed.pairs)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeCompatibility(file: CompatibilityFile, target = COMPATIBILITY_PATH) {
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, JSON.stringify(file));
}

export type KnownAttachment = {
  pose: Skill6Pose;
  contactArea: number;
  coherentRegions: number;
  residualGap: number | null;
  minSurfaceDistance: number | null;
  normalAlignment: number;
  deepestCrossing: number;
  overlapVolume: number | null;
  verdict: "surface-contact" | "near-contact";
  note: string;
};

export type CompatibilityTable = {
  testedPairs: number;
  totalPairs: number;
  compatiblePairs: number;
  poses(hostId: string, guestId: string): KnownAttachment[];
};

export function compatibilityTable(file: CompatibilityFile | null): CompatibilityTable {
  const directions = new Map<string, KnownAttachment[]>();
  let testedPairs = 0;
  let compatiblePairs = 0;
  for (const pair of file?.pairs ?? []) {
    const expected = pair.left === pair.right ? 1 : 2;
    if (pair.directions.length >= expected) testedPairs += 1;
    let pairOk = false;
    for (const direction of pair.directions) {
      const poses = direction.poses
        .filter((pose) => pose.verdict === "surface-contact" || pose.verdict === "near-contact")
        .filter((pose) => pose.overlapVolume == null || Math.abs(pose.overlapVolume) <= 0.05)
        .map((pose): KnownAttachment => ({
          pose: poseWithBasis((pose.quarterZ % 4) as Quarter, pose.mirrorX, pose.basis as Skill6Pose["basis"], pose.translation as Skill6Pose["translation"]),
          contactArea: pose.contactArea,
          coherentRegions: pose.coherentRegions,
          residualGap: pose.residualGap,
          minSurfaceDistance: pose.minSurfaceDistance,
          normalAlignment: pose.normalAlignment ?? 0,
          deepestCrossing: pose.deepestCrossing,
          overlapVolume: pose.overlapVolume,
          verdict: pose.verdict === "surface-contact" ? "surface-contact" : "near-contact",
          note: pose.note,
        }));
      if (poses.length > 0) pairOk = true;
      directions.set(`${direction.host}|${direction.guest}`, poses);
    }
    if (pairOk) compatiblePairs += 1;
  }
  return {
    testedPairs,
    totalPairs: file?.totalPairs ?? 0,
    compatiblePairs,
    poses(hostId: string, guestId: string) {
      return directions.get(`${hostId}|${guestId}`) ?? [];
    },
  };
}

export function unorderedPairs(ids: readonly string[]): [string, string][] {
  const pairs: [string, string][] = [];
  for (let left = 0; left < ids.length; left += 1) {
    for (let right = left; right < ids.length; right += 1) pairs.push([ids[left], ids[right]]);
  }
  return pairs;
}

function hasDirection(pair: StoredPair, host: string, guest: string) {
  return pair.directions.some((direction) => direction.host === host && direction.guest === guest);
}

export async function runCompatibilityBatch() {
  const meshes = loadArchetypeMeshes();
  const byId = new Map(meshes.map((mesh) => [mesh.archetypeId, mesh]));
  const ids = meshes.map((mesh) => mesh.archetypeId);
  const pairs = unorderedPairs(ids);
  const file = readCompatibility() ?? emptyCompatibility(pairs.length);
  file.totalPairs = pairs.length;
  let done = 0;
  for (const [leftId, rightId] of pairs) {
    const key = `${leftId} × ${rightId}`;
    let pair = file.pairs.find((item) => item.left === leftId && item.right === rightId);
    if (!pair) {
      pair = { left: leftId, right: rightId, directions: [] };
      file.pairs.push(pair);
    }
    const host = byId.get(leftId);
    const guest = byId.get(rightId);
    if (!host || !guest) continue;
    const directions: [typeof host, typeof guest][] = leftId === rightId ? [[host, guest]] : [[host, guest], [guest, host]];
    for (const [from, to] of directions) {
      if (hasDirection(pair, from.archetypeId, to.archetypeId)) {
        done += 1;
        continue;
      }
      const study = await studyDirectionVolume(from, to);
      pair.directions.push(storeDirection(study));
      writeCompatibility(file);
      done += 1;
      console.log(`${done} ${from.archetypeId} → ${to.archetypeId} ${study.compatible ? "compatible" : "incompatible"} ${study.seconds}s ${study.rejection ?? study.poses[0]?.verdict ?? ""}`);
    }
    void key;
  }
  const compatible = file.pairs.filter((pair) => pair.directions.some((direction) => direction.compatible)).length;
  console.log(JSON.stringify({ pairs: file.pairs.length, compatible, total: pairs.length }, null, 2));
}

if (process.argv[1]?.replaceAll("\\", "/").endsWith("lib/skill6/compatibility.ts")) {
  void runCompatibilityBatch();
}
