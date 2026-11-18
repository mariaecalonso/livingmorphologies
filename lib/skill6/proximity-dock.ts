/**
 * Surface proximity docking.
 * Regions come from exterior surface samples. A guest region is turned to face a host region,
 * twisted about that normal, then seated with the adaptive clearance ladder along the host normal.
 * Convex pairs whose curvatures cannot meet the contact area inside the existing tolerance are skipped
 * before testing. The contact, crossing, and overlap tests are unchanged.
 */
import { SKILL6_PARAMETERS, type Skill6Pose, type Vec3 } from "./contract";
import { adaptiveSeatGaps, betterContact, contactNormalOf, validateSeatedPose, type SeatCandidate } from "./adaptive-seat";
import { cheapPoseScore, envelopeTranslation, type EnvelopeSpec } from "./envelope";
import {
  cross,
  dot,
  length,
  multiplyBasis,
  normalize,
  poseWithBasis,
  readTriangle,
  rotationAbout,
  rotationFromTo,
  scale,
  sub,
} from "./geometry";
import type { ArchetypeMesh } from "./source";

/** Both surfaces convex and sharper than the disc that can reach 3.2 area inside the 0.18 band. A skip, not a rejection. */
export const CURVATURE_SKIP = 0.35;

const REGION_CAP = 8;
const PAIR_CAP = 4;
const TWISTS = [0, 90, 180, 270];
const PROBE_GAPS = [0.18, 0.42];

export type DockRegion = {
  id: string;
  centroid: Vec3;
  outward: Vec3;
  area: number;
  radius: number;
  /** Positive is convex. Approximately 1 / radius of curvature. */
  curvature: number;
};

const regionCache = new WeakMap<ArchetypeMesh, DockRegion[]>();

function centroidOf(mesh: ArchetypeMesh): Vec3 {
  let x = 0;
  let y = 0;
  let z = 0;
  const count = mesh.positions.length / 3 || 1;
  for (let index = 0; index < mesh.positions.length; index += 3) {
    x += mesh.positions[index];
    y += mesh.positions[index + 1];
    z += mesh.positions[index + 2];
  }
  return [x / count, y / count, z / count];
}

/** Exterior neighborhoods. Faces that look back toward the mesh center are left out. */
export function dockRegions(mesh: ArchetypeMesh): DockRegion[] {
  const cached = regionCache.get(mesh);
  if (cached) return cached;
  const center = centroidOf(mesh);
  const stride = Math.max(1, Math.floor(mesh.triangles / 900));
  const samples: { point: Vec3; outward: Vec3; area: number }[] = [];
  for (let triangle = 0; triangle < mesh.triangles; triangle += stride) {
    const [a, b, c] = readTriangle(mesh.positions, mesh.indices, triangle);
    const raw = cross(sub(b, a), sub(c, a));
    const span = length(raw);
    if (span < 1e-8) continue;
    const point: Vec3 = [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3, (a[2] + b[2] + c[2]) / 3];
    const outward = scale(raw, -1 / span);
    if (dot(outward, sub(point, center)) < 0.2) continue;
    samples.push({ point, outward, area: span * 0.5 * stride });
  }
  samples.sort((left, right) => right.area - left.area);
  const groups: { samples: typeof samples }[] = [];
  for (const sample of samples) {
    let best = -1;
    let bestAlign = 0.75;
    for (let index = 0; index < groups.length; index += 1) {
      const seed = groups[index].samples[0];
      const align = dot(seed.outward, sample.outward);
      if (align > bestAlign && length(sub(seed.point, sample.point)) < 4) {
        best = index;
        bestAlign = align;
      }
    }
    if (best >= 0) groups[best].samples.push(sample);
    else if (groups.length < REGION_CAP) groups.push({ samples: [sample] });
  }
  const regions = groups.map((group, index) => {
    let area = 0;
    const centroid: Vec3 = [0, 0, 0];
    const outward: Vec3 = [0, 0, 0];
    for (const sample of group.samples) {
      area += sample.area;
      centroid[0] += sample.point[0] * sample.area;
      centroid[1] += sample.point[1] * sample.area;
      centroid[2] += sample.point[2] * sample.area;
      outward[0] += sample.outward[0] * sample.area;
      outward[1] += sample.outward[1] * sample.area;
      outward[2] += sample.outward[2] * sample.area;
    }
    const centerPoint: Vec3 = [centroid[0] / area, centroid[1] / area, centroid[2] / area];
    const normal = normalize(outward);
    let radius = 0;
    let curve = 0;
    let weight = 0;
    for (const sample of group.samples) {
      const offset = sub(sample.point, centerPoint);
      const radial = length(offset);
      radius = Math.max(radius, radial);
      if (radial < 0.4) continue;
      const sagitta = dot(offset, normal);
      curve += (-2 * sagitta) / (radial * radial) * sample.area;
      weight += sample.area;
    }
    return { id: `d${String(index).padStart(2, "0")}`, centroid: centerPoint, outward: normal, area, radius, curvature: weight > 0 ? curve / weight : 0 };
  }).filter((region) => region.area >= SKILL6_PARAMETERS.minPatchArea);
  regionCache.set(mesh, regions);
  return regions;
}

export function curvatureSkips(host: DockRegion, guest: DockRegion): boolean {
  return host.curvature > 0 && guest.curvature > 0 && host.curvature + guest.curvature > CURVATURE_SKIP;
}

function pairScore(host: DockRegion, guest: DockRegion): number {
  return Math.min(host.area, guest.area) / (1 + Math.max(0, host.curvature) + Math.max(0, guest.curvature));
}

export function regionPairs(host: ArchetypeMesh, guest: ArchetypeMesh): { host: DockRegion; guest: DockRegion; skipped: boolean }[] {
  const ranked = dockRegions(host).flatMap((hostRegion) => dockRegions(guest).map((guestRegion) => ({
    host: hostRegion,
    guest: guestRegion,
    skipped: curvatureSkips(hostRegion, guestRegion),
    score: pairScore(hostRegion, guestRegion),
  }))).sort((left, right) => right.score - left.score);
  const open = ranked.filter((pair) => !pair.skipped);
  const picked = (open.length >= 2 ? open : ranked).slice(0, PAIR_CAP);
  return picked.map((pair) => ({ host: pair.host, guest: pair.guest, skipped: open.length >= 2 ? pair.skipped : false }));
}

/** Guest region faces the host region. Twist is a quarter turn about the host normal. Clearance is the adaptive ladder parameter. */
export function dockPose(host: ArchetypeMesh, guest: ArchetypeMesh, hostRegion: DockRegion, guestRegion: DockRegion, twist: number, gap: number): Skill6Pose {
  const align = rotationFromTo(guestRegion.outward, scale(hostRegion.outward, -1));
  const basis = multiplyBasis(rotationAbout(hostRegion.outward, twist * Math.PI / 180), align);
  return poseWithBasis(0, false, basis, envelopeTranslation(host, guest, basis, hostRegion.outward, gap));
}

function specFor(region: DockRegion, gap: number): EnvelopeSpec {
  return { yaw: 0, pitch: 0, roll: 0, axis: region.outward, axisName: "surface", gap, mirrorX: false };
}

export type DockAttempt = {
  hostRegion: string;
  guestRegion: string;
  twist: number;
  hostCurvature: number;
  guestCurvature: number;
  skipped: "curvature" | "prefilter" | null;
  chosen: SeatCandidate | null;
  nearMiss: SeatCandidate | null;
};

export type DockSearch = {
  attempts: DockAttempt[];
  chosen: SeatCandidate | null;
  directions: string[];
  tested: number;
  skippedCurvature: number;
  skippedPrefilter: number;
  milliseconds: number;
};

/**
 * Bounded docking. Full validation runs only after two cheap probes pass.
 * `known` returns an already recorded result for an identical pose, so that pose is not evaluated again.
 */
export async function searchProximityDock(
  host: ArchetypeMesh,
  guest: ArchetypeMesh,
  known?: (pose: Skill6Pose, gap: number) => SeatCandidate | null,
): Promise<DockSearch> {
  const started = Date.now();
  const attempts: DockAttempt[] = [];
  let skippedCurvature = 0;
  let skippedPrefilter = 0;
  let tested = 0;
  const passing: SeatCandidate[] = [];
  for (const pair of regionPairs(host, guest)) {
    if (pair.skipped) {
      skippedCurvature += TWISTS.length;
      attempts.push({ hostRegion: pair.host.id, guestRegion: pair.guest.id, twist: 0, hostCurvature: pair.host.curvature, guestCurvature: pair.guest.curvature, skipped: "curvature", chosen: null, nearMiss: null });
      continue;
    }
    for (const twist of TWISTS) {
      const probes = PROBE_GAPS.map((gap) => cheapPoseScore(host, guest, dockPose(host, guest, pair.host, pair.guest, twist, gap)));
      if (probes.every((score) => score < 0)) {
        skippedPrefilter += 1;
        attempts.push({ hostRegion: pair.host.id, guestRegion: pair.guest.id, twist, hostCurvature: pair.host.curvature, guestCurvature: pair.guest.curvature, skipped: "prefilter", chosen: null, nearMiss: null });
        continue;
      }
      const ladder: SeatCandidate[] = [];
      for (const gap of adaptiveSeatGaps()) {
        const pose = dockPose(host, guest, pair.host, pair.guest, twist, gap);
        const recorded = known?.(pose, gap) ?? null;
        tested += 1;
        ladder.push(recorded ?? await validateSeatedPose(host, guest, pose, specFor(pair.host, gap)));
      }
      const chosen = ladder.filter((item) => item.accepted).sort(betterContact)[0] ?? null;
      const nearMiss = chosen ? null : ladder.slice().sort((left, right) => right.contactArea - left.contactArea)[0] ?? null;
      const kept = chosen ?? nearMiss;
      if (kept && kept.contactArea >= SKILL6_PARAMETERS.minContactArea && !kept.relation.contactNormal) {
        kept.relation = { ...kept.relation, contactNormal: contactNormalOf(host, guest, poseWithBasis(0, false, [1, 0, 0, 0, 1, 0, 0, 0, 1], [0, 0, 0]), kept.pose) };
      }
      if (chosen) passing.push(chosen);
      attempts.push({ hostRegion: pair.host.id, guestRegion: pair.guest.id, twist, hostCurvature: pair.host.curvature, guestCurvature: pair.guest.curvature, skipped: null, chosen, nearMiss });
    }
  }
  passing.sort(betterContact);
  const directions = [...new Set(passing.map((item) => item.relation.growthDirection))];
  return { attempts, chosen: passing[0] ?? null, directions, tested, skippedCurvature, skippedPrefilter, milliseconds: Date.now() - started };
}
