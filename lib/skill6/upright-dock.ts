/**
 * Extra upright seats for Spatial Organization.
 * A host face and a guest face are aligned, then the guest is twisted about that normal
 * so its own up axis stays near world up. The adaptive clearance ladder and the
 * existing contact tests decide acceptance. This does not remove sideways poses.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { adaptiveSeatGaps, betterContact, validateSeatedPose } from "./adaptive-seat";
import type { KnownAttachment } from "./compatibility";
import { SKILL6_PARAMETERS, type Skill6Pose, type Vec3 } from "./contract";
import { cheapPoseScore, envelopeTranslation, type EnvelopeSpec } from "./envelope";
import { cross, dot, length, multiplyBasis, normalize, poseWithBasis, rotationAbout, rotationFromTo, scale, sub } from "./geometry";
import { growthDirection } from "./grow";
import { dockRegions, type DockRegion } from "./proximity-dock";
import type { ArchetypeMesh } from "./source";

const STACK_NORMAL = 0.65;
const SIDE_NORMAL = 0.45;
const UPRIGHT = 0.7;

export type UprightLibrary = {
  revision: string;
  offered: number;
  stack: number;
  side: number;
  directions: Record<string, number>;
  poses(hostId: string, guestId: string): KnownAttachment[];
};

function uprightAngle(align: number[], axis: Vec3): number {
  const up: Vec3 = [align[6], align[7], align[8]];
  const project = (vector: Vec3): Vec3 => sub(vector, scale(axis, dot(vector, axis)));
  const from = project(up);
  const to = project([0, 0, 1]);
  if (length(from) < 1e-4 || length(to) < 1e-4) return 0;
  const left = normalize(from);
  const right = normalize(to);
  const turn = cross(left, right);
  return Math.atan2(dot(turn, normalize(axis)), dot(left, right));
}

function seatedBasis(hostRegion: DockRegion, guestRegion: DockRegion): { basis: Skill6Pose["basis"]; up: number } | null {
  const align = rotationFromTo(guestRegion.outward, scale(hostRegion.outward, -1));
  const basis = multiplyBasis(rotationAbout(hostRegion.outward, uprightAngle(align, hostRegion.outward)), align);
  const up = basis[8];
  if (up < UPRIGHT) return null;
  return { basis, up };
}

async function seat(host: ArchetypeMesh, guest: ArchetypeMesh, region: DockRegion, basis: Skill6Pose["basis"]): Promise<KnownAttachment | null> {
  const probes = [0.18, 0.42].map((gap) => cheapPoseScore(host, guest, poseWithBasis(0, false, basis, envelopeTranslation(host, guest, basis, region.outward, gap))));
  if (probes.every((score) => score < 0)) return null;
  const ladder = [];
  for (const gap of adaptiveSeatGaps()) {
    const pose = poseWithBasis(0, false, basis, envelopeTranslation(host, guest, basis, region.outward, gap));
    const spec: EnvelopeSpec = { yaw: 0, pitch: 0, roll: 0, axis: region.outward, axisName: "surface", gap, mirrorX: false };
    ladder.push(await validateSeatedPose(host, guest, pose, spec));
  }
  const chosen = ladder.filter((item) => item.accepted).sort(betterContact)[0];
  if (!chosen) return null;
  const normal = chosen.relation.contactNormal;
  const label = growthDirection(host, { quarterZ: 0, mirrorX: false, basis: [1, 0, 0, 0, 1, 0, 0, 0, 1], translation: [0, 0, 0] }, guest, chosen.pose);
  return {
    pose: chosen.pose,
    contactArea: chosen.contactArea,
    coherentRegions: chosen.coherentRegions,
    residualGap: chosen.residualGap,
    minSurfaceDistance: chosen.minSurfaceDistance,
    normalAlignment: chosen.normalAlignment ?? 0,
    deepestCrossing: chosen.deepestCrossing,
    overlapVolume: chosen.overlapVolume,
    verdict: chosen.residualGap != null && chosen.residualGap <= SKILL6_PARAMETERS.targetGap ? "surface-contact" : "near-contact",
    note: `upright ${label} normal ${(normal ?? region.outward).map((value) => value.toFixed(2)).join(",")} up ${chosen.pose.basis[8].toFixed(2)} gap ${chosen.gap.toFixed(2)}`,
  };
}

/** At most one upright stack and one upright side seat. Both still have to pass the unchanged tests. */
export async function uprightPair(host: ArchetypeMesh, guest: ArchetypeMesh): Promise<KnownAttachment[]> {
  const hosts = dockRegions(host);
  const guests = dockRegions(guest);
  const stackHosts = hosts.filter((region) => region.outward[2] >= STACK_NORMAL).sort((left, right) => right.area - left.area).slice(0, 2);
  const stackGuests = guests.filter((region) => region.outward[2] <= -STACK_NORMAL).sort((left, right) => right.area - left.area).slice(0, 2);
  const sideHosts = hosts.filter((region) => Math.abs(region.outward[2]) <= SIDE_NORMAL).sort((left, right) => right.area - left.area).slice(0, 2);
  const sideGuests = guests.filter((region) => Math.abs(region.outward[2]) <= SIDE_NORMAL).sort((left, right) => right.area - left.area).slice(0, 2);
  const found: KnownAttachment[] = [];
  for (const hostRegion of stackHosts) {
    if (found.some((item) => item.note.includes(" +Z ") || item.note.startsWith("upright +Z"))) break;
    for (const guestRegion of stackGuests) {
      const turned = seatedBasis(hostRegion, guestRegion);
      if (!turned) continue;
      const kept = await seat(host, guest, hostRegion, turned.basis);
      if (kept) {
        found.push(kept);
        break;
      }
    }
  }
  for (const hostRegion of sideHosts) {
    if (found.length >= 2) break;
    for (const guestRegion of sideGuests) {
      const turned = seatedBasis(hostRegion, guestRegion);
      if (!turned) continue;
      const kept = await seat(host, guest, hostRegion, turned.basis);
      if (kept) {
        found.push(kept);
        break;
      }
    }
  }
  return found;
}

export async function buildUprightLibrary(meshes: readonly ArchetypeMesh[], revision: string, file: string): Promise<UprightLibrary> {
  if (existsSync(file)) {
    try {
      const stored = JSON.parse(readFileSync(file, "utf8")) as { revision?: string; entries?: { host: string; guest: string; pose: KnownAttachment }[] };
      if (stored.revision === revision && Array.isArray(stored.entries)) return libraryFrom(stored.entries, revision);
    } catch {
      // The library is built below.
    }
  }
  const entries: { host: string; guest: string; pose: KnownAttachment }[] = [];
  for (const host of meshes) {
    for (const guest of meshes) {
      if (host.archetypeId === guest.archetypeId) continue;
      const poses = await uprightPair(host, guest);
      for (const pose of poses) entries.push({ host: host.archetypeId, guest: guest.archetypeId, pose });
    }
    console.log("upright", host.archetypeId, entries.length);
  }
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify({ revision, entries }));
  return libraryFrom(entries, revision);
}

function libraryFrom(entries: { host: string; guest: string; pose: KnownAttachment }[], revision: string): UprightLibrary {
  const grouped = new Map<string, KnownAttachment[]>();
  const directions: Record<string, number> = {};
  let stack = 0;
  let side = 0;
  for (const entry of entries) {
    const key = `${entry.host}|${entry.guest}`;
    const list = grouped.get(key) ?? [];
    list.push(entry.pose);
    grouped.set(key, list);
    const label = entry.pose.note.split(" ")[1] ?? "other";
    directions[label] = (directions[label] ?? 0) + 1;
    if (label === "+Z") stack += 1;
    else side += 1;
  }
  return {
    revision,
    offered: entries.length,
    stack,
    side,
    directions,
    poses: (hostId, guestId) => grouped.get(`${hostId}|${guestId}`) ?? [],
  };
}
