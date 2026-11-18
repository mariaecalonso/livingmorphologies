/**
 * Tangent slides for poses already stored in compatibility.json.
 * The baseline file is only read. Expanded poses go to compatibility-shifts.json.
 *
 * Run: npx tsx lib/skill6/shifts.ts
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { Skill6Pose, Vec3 } from "./contract";
import { poseWithBasis } from "./geometry";
import {
  compatibilityTable,
  readCompatibility,
  type CompatibilityTable,
  type KnownAttachment,
} from "./compatibility";
import {
  cheapPoseScore,
  poseOverlap,
  shiftOffsets,
  translatePose,
  validatePose,
  type EnvelopeSpec,
} from "./envelope";
import { loadArchetypeMeshes } from "./source";

export const SHIFT_PATH = path.join(process.cwd(), "data", "skill6", "compatibility-shifts.json");

type StoredShift = KnownAttachment & {
  basis: number[];
  translation: number[];
  quarterZ: number;
  mirrorX: boolean;
  shift: Vec3;
};

type ShiftDirection = {
  host: string;
  guest: string;
  cheapChecks: number;
  denseChecks: number;
  seconds: number;
  poses: Array<{
    basis: number[];
    translation: number[];
    quarterZ: number;
    mirrorX: boolean;
    shift: number[];
    contactArea: number;
    coherentRegions: number;
    residualGap: number | null;
    minSurfaceDistance: number | null;
    normalAlignment: number;
    deepestCrossing: number;
    overlapVolume: number | null;
    verdict: "surface-contact" | "near-contact";
    note: string;
  }>;
};

export type ShiftFile = {
  version: 1;
  baseline: "data/skill6/compatibility.json";
  steps: number[];
  cheapChecks: number;
  denseChecks: number;
  seconds: number;
  directions: ShiftDirection[];
};

type BaselinePose = {
  yaw: number;
  pitch: number;
  roll: number;
  axis: string;
  gap: number;
  mirrorX: boolean;
  basis: number[];
  translation: number[];
  quarterZ: number;
};

const AXIS: Record<string, Vec3> = {
  "+X": [1, 0, 0],
  "-X": [-1, 0, 0],
  "+Y": [0, 1, 0],
  "-Y": [0, -1, 0],
  "+Z": [0, 0, 1],
  "-Z": [0, 0, -1],
};

function readShifts(file = SHIFT_PATH): ShiftFile | null {
  try {
    const parsed = JSON.parse(readFileSync(file, "utf8")) as ShiftFile;
    if (parsed.version !== 1 || !Array.isArray(parsed.directions)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeShifts(file: ShiftFile) {
  mkdirSync(path.dirname(SHIFT_PATH), { recursive: true });
  writeFileSync(SHIFT_PATH, JSON.stringify(file));
}

function poseKey(basis: readonly number[], translation: readonly number[]): string {
  return `${basis.map((value) => value.toFixed(2)).join(",")}|${translation.map((value) => value.toFixed(1)).join(",")}`;
}

function specOf(pose: BaselinePose): EnvelopeSpec {
  return {
    yaw: pose.yaw,
    pitch: pose.pitch,
    roll: pose.roll,
    axis: AXIS[pose.axis] ?? [1, 0, 0],
    axisName: pose.axis,
    gap: pose.gap,
    mirrorX: pose.mirrorX,
  };
}

function attachmentOf(pose: ShiftDirection["poses"][number]): KnownAttachment {
  return {
    pose: poseWithBasis(pose.quarterZ as 0 | 1 | 2 | 3, pose.mirrorX, pose.basis as Skill6Pose["basis"], pose.translation as Vec3),
    contactArea: pose.contactArea,
    coherentRegions: pose.coherentRegions,
    residualGap: pose.residualGap,
    minSurfaceDistance: pose.minSurfaceDistance,
    normalAlignment: pose.normalAlignment,
    deepestCrossing: pose.deepestCrossing,
    overlapVolume: pose.overlapVolume,
    verdict: pose.verdict,
    note: pose.note,
  };
}

/** Baseline poses plus any tangent slides. The baseline table itself is unchanged. */
export function loadTranslatedTable(): CompatibilityTable & { shiftPoses: number; shiftDirections: number } {
  const base = compatibilityTable(readCompatibility());
  const extra = readShifts();
  const added = new Map<string, KnownAttachment[]>();
  let shiftPoses = 0;
  for (const direction of extra?.directions ?? []) {
    const poses = direction.poses.map(attachmentOf);
    shiftPoses += poses.length;
    added.set(`${direction.host}|${direction.guest}`, poses);
  }
  return {
    testedPairs: base.testedPairs,
    totalPairs: base.totalPairs,
    compatiblePairs: base.compatiblePairs,
    shiftPoses,
    shiftDirections: extra?.directions.length ?? 0,
    poses(hostId: string, guestId: string) {
      const seen = new Set<string>();
      const merged: KnownAttachment[] = [];
      for (const pose of [...base.poses(hostId, guestId), ...(added.get(`${hostId}|${guestId}`) ?? [])]) {
        const key = poseKey(pose.pose.basis, pose.pose.translation);
        if (seen.has(key)) continue;
        seen.add(key);
        merged.push(pose);
      }
      return merged;
    },
  };
}

export async function runShiftBatch() {
  const baseline = readCompatibility();
  if (!baseline) throw new Error("compatibility.json is missing. The shift study does not rebuild it.");
  const meshes = loadArchetypeMeshes();
  const byId = new Map(meshes.map((mesh) => [mesh.archetypeId, mesh]));
  const file: ShiftFile = readShifts() ?? {
    version: 1,
    baseline: "data/skill6/compatibility.json",
    steps: [3, 6, 9],
    cheapChecks: 0,
    denseChecks: 0,
    seconds: 0,
    directions: [],
  };
  const started = Date.now();
  for (const pair of baseline.pairs) {
    for (const direction of pair.directions) {
      if (!direction.compatible || direction.poses.length === 0) continue;
      if (file.directions.some((item) => item.host === direction.host && item.guest === direction.guest)) continue;
      const host = byId.get(direction.host);
      const guest = byId.get(direction.guest);
      if (!host || !guest) continue;
      const seen = new Set<string>();
      const bases: BaselinePose[] = [];
      for (const pose of direction.poses) {
        const key = poseKey(pose.basis, pose.translation);
        if (seen.has(key)) continue;
        seen.add(key);
        bases.push(pose);
        if (bases.length >= 3) break;
      }
      const kept: ShiftDirection["poses"] = [];
      let cheapChecks = 0;
      let denseChecks = 0;
      const mark = Date.now();
      for (const base of bases) {
        const spec = specOf(base);
        const origin = poseWithBasis(base.quarterZ as 0 | 1 | 2 | 3, base.mirrorX, base.basis as Skill6Pose["basis"], base.translation as Vec3);
        const ranked = shiftOffsets(spec.axis)
          .map((shift) => {
            cheapChecks += 1;
            const pose = translatePose(origin, shift);
            return { shift, pose, score: cheapPoseScore(host, guest, pose) };
          })
          .filter((item) => item.score >= 3.2)
          .sort((left, right) => right.score - left.score)
          .slice(0, 4);
        for (const item of ranked) {
          if (denseChecks >= 8) break;
          denseChecks += 1;
          const reading = validatePose(host, guest, item.pose, spec);
          if (!reading.accepted || reading.verdict === "rejected") continue;
          const volume = await poseOverlap(host, guest, poseWithBasis(0, false, [1, 0, 0, 0, 1, 0, 0, 0, 1], [0, 0, 0]), reading.pose);
          if (volume != null && Math.abs(volume) > 0.05) continue;
          const key = poseKey(reading.pose.basis, reading.pose.translation);
          if (seen.has(key)) continue;
          seen.add(key);
          kept.push({
            basis: [...reading.pose.basis],
            translation: [...reading.pose.translation],
            quarterZ: reading.pose.quarterZ,
            mirrorX: reading.pose.mirrorX,
            shift: [...item.shift],
            contactArea: reading.contactArea,
            coherentRegions: reading.coherentRegions,
            residualGap: reading.residualGap,
            minSurfaceDistance: reading.minSurfaceDistance,
            normalAlignment: reading.normalAlignment ?? 0,
            deepestCrossing: reading.deepestCrossing,
            overlapVolume: volume,
            verdict: reading.verdict,
            note: `${spec.axisName} yaw ${spec.yaw} pitch ${spec.pitch} roll ${spec.roll} gap ${spec.gap}${spec.mirrorX ? " mirror" : ""} shift ${item.shift.map((value) => value.toFixed(1)).join(",")}`,
          });
        }
      }
      file.directions.push({
        host: direction.host,
        guest: direction.guest,
        cheapChecks,
        denseChecks,
        seconds: Math.round((Date.now() - mark) / 1000),
        poses: kept,
      });
      file.cheapChecks += cheapChecks;
      file.denseChecks += denseChecks;
      file.seconds = Math.round((Date.now() - started) / 1000);
      writeShifts(file);
      console.log(`${direction.host} → ${direction.guest} slides ${kept.length} dense ${denseChecks} cheap ${cheapChecks}`);
    }
  }
  const poses = file.directions.reduce((sum, direction) => sum + direction.poses.length, 0);
  console.log(JSON.stringify({ directions: file.directions.length, poses, cheap: file.cheapChecks, dense: file.denseChecks, seconds: file.seconds }, null, 2));
}

if (process.argv[1]?.replaceAll("\\", "/").endsWith("lib/skill6/shifts.ts")) {
  void runShiftBatch();
}
