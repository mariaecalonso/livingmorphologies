/**
 * Experimental seating for one already chosen orientation.
 * The clearance is the percentile-plane gap used by `envelopeTranslation`:
 * host samples at the 90th percentile along the axis, guest samples at the 10th,
 * plus this gap. It is not the measured surface gap. The fixed library uses 0.1.
 * Measured residual and penetration stay on the unchanged tests.
 * A tangent offset is applied after that axial seat, then the axis is searched again.
 */
import {
  SKILL6_GROWTH_DIRECTIONS,
  SKILL6_PARAMETERS,
  type GrowthDirection,
  type Skill6Pose,
  type Vec3,
} from "./contract";
import {
  ENVELOPE_GRID,
  MAX_BOOLEAN_VOLUME,
  envelopePose,
  measureEnvelope,
  poseOverlap,
  shiftOffsets,
  validatePose,
  type EnvelopeReading,
  type EnvelopeSpec,
} from "./envelope";
import { growthDirection } from "./grow";
import {
  IDENTITY,
  add,
  applyBasis,
  closestOnTriangle,
  cross,
  invertPose,
  length,
  normalize,
  poseBounds,
  poseWithBasis,
  queryHash,
  readTriangle,
  scale,
  sub,
} from "./geometry";
import type { ArchetypeMesh } from "./source";

/** Fixed clearance, then the range the rejected-pair sweep actually rescued. */
export function adaptiveSeatGaps(): number[] {
  const gaps = [ENVELOPE_GRID.gap];
  for (let gap = 0.14; gap <= 0.5 + 1e-9; gap += 0.04) gaps.push(Math.round(gap * 100) / 100);
  return gaps;
}

export type SeatRelation = {
  /** Area-weighted host outward normal at the measured contact. Null when no coherent region was sampled. */
  contactNormal: Vec3 | null;
  /** Guest centroid minus host centroid, world space. */
  displacement: Vec3;
  elevation: {
    hostMinZ: number;
    hostMaxZ: number;
    guestMinZ: number;
    guestMaxZ: number;
    /** Guest base relative to the host top. Negative means the guest drops beside or into the host. */
    guestBaseAboveHostTop: number;
  };
  /** Bounds label. Recorded beside the contact normal. Not a replacement for the growth rule. */
  growthDirection: GrowthDirection;
  growthAllowed: boolean;
};

export type SeatCandidate = {
  gap: number;
  shift: Vec3;
  accepted: boolean;
  pose: Skill6Pose;
  contactArea: number;
  coherentRegions: number;
  residualGap: number | null;
  minSurfaceDistance: number | null;
  normalAlignment: number | null;
  deepestCrossing: number;
  overlapVolume: number | null;
  reason: string | null;
  relation: SeatRelation;
};

const HOME: Skill6Pose = poseWithBasis(0, false, IDENTITY, [0, 0, 0]);

/** Axial percentile seat, then a tangent offset that the next search is not allowed to keep as its normal component. */
export function poseAtGap(host: ArchetypeMesh, guest: ArchetypeMesh, spec: EnvelopeSpec, gap: number, shift: Vec3 = [0, 0, 0]): Skill6Pose {
  const seated = envelopePose(host, guest, { ...spec, gap });
  return poseWithBasis(seated.quarterZ, seated.mirrorX, seated.basis, add(seated.translation, shift));
}

function centroid(mesh: ArchetypeMesh, pose: Skill6Pose): Vec3 {
  let x = 0;
  let y = 0;
  let z = 0;
  const count = mesh.positions.length / 3 || 1;
  for (let index = 0; index < mesh.positions.length; index += 3) {
    const world = [
      pose.basis[0] * mesh.positions[index] + pose.basis[3] * mesh.positions[index + 1] + pose.basis[6] * mesh.positions[index + 2] + pose.translation[0],
      pose.basis[1] * mesh.positions[index] + pose.basis[4] * mesh.positions[index + 1] + pose.basis[7] * mesh.positions[index + 2] + pose.translation[1],
      pose.basis[2] * mesh.positions[index] + pose.basis[5] * mesh.positions[index + 1] + pose.basis[8] * mesh.positions[index + 2] + pose.translation[2],
    ];
    x += world[0];
    y += world[1];
    z += world[2];
  }
  return [x / count, y / count, z / count];
}

/**
 * Outward host normal over the coherent contact samples. Independent of the bounds growth label.
 * The 15 source meshes are wound inward (negative signed volume), so the triangle normal points into the solid.
 */
export function contactNormalOf(host: ArchetypeMesh, guest: ArchetypeMesh, hostPose: Skill6Pose, guestPose: Skill6Pose): Vec3 | null {
  const measured = measureEnvelope(host, guest, hostPose, guestPose);
  if (measured.samples.length === 0 || measured.contactArea <= 0) return null;
  const sum: Vec3 = [0, 0, 0];
  let count = 0;
  for (const sample of measured.samples) {
    const local = invertPose(hostPose, sample.host);
    let best: { distance: number; normal: Vec3 } | null = null;
    for (const triangle of queryHash(host.hash, local, 0.7)) {
      const [a, b, c] = readTriangle(host.positions, host.indices, triangle);
      const point = closestOnTriangle(local, a, b, c);
      const distance = length(sub(local, point));
      if (best && distance >= best.distance) continue;
      const raw = cross(sub(b, a), sub(c, a));
      const span = length(raw);
      best = { distance, normal: span > 1e-8 ? scale(raw, 1 / span) : [0, 0, 1] };
    }
    if (!best) continue;
    const world = applyBasis(hostPose.basis, best.normal);
    sum[0] -= world[0];
    sum[1] -= world[1];
    sum[2] -= world[2];
    count += 1;
  }
  if (count === 0 || length(sum) < 1e-6) return null;
  return normalize(sum);
}

export function seatRelation(host: ArchetypeMesh, guest: ArchetypeMesh, pose: Skill6Pose, normal: Vec3 | null): SeatRelation {
  const hostBox = poseBounds(host.tight, HOME);
  const guestBox = poseBounds(guest.tight, pose);
  const direction = growthDirection(host, HOME, guest, pose);
  return {
    contactNormal: normal,
    displacement: sub(centroid(guest, pose), centroid(host, HOME)),
    elevation: {
      hostMinZ: hostBox.min[2],
      hostMaxZ: hostBox.max[2],
      guestMinZ: guestBox.min[2],
      guestMaxZ: guestBox.max[2],
      guestBaseAboveHostTop: guestBox.min[2] - hostBox.max[2],
    },
    growthDirection: direction,
    growthAllowed: (SKILL6_GROWTH_DIRECTIONS as readonly string[]).includes(direction),
  };
}

function fromReading(reading: EnvelopeReading, shift: Vec3, overlap: number | null, accepted: boolean, reason: string | null, normal: Vec3 | null, host: ArchetypeMesh, guest: ArchetypeMesh): SeatCandidate {
  return {
    gap: reading.spec.gap,
    shift,
    accepted,
    pose: reading.pose,
    contactArea: reading.contactArea,
    coherentRegions: reading.coherentRegions,
    residualGap: reading.residualGap,
    minSurfaceDistance: reading.minSurfaceDistance,
    normalAlignment: reading.normalAlignment,
    deepestCrossing: reading.deepestCrossing,
    overlapVolume: overlap,
    reason,
    relation: seatRelation(host, guest, reading.pose, normal),
  };
}

/** Larger coherent area, then the tighter residual, then the more opposed normals. */
export function betterContact(left: SeatCandidate, right: SeatCandidate): number {
  if (right.contactArea !== left.contactArea) return right.contactArea - left.contactArea;
  const leftGap = left.residualGap ?? Infinity;
  const rightGap = right.residualGap ?? Infinity;
  if (leftGap !== rightGap) return leftGap - rightGap;
  return (left.normalAlignment ?? 0) - (right.normalAlignment ?? 0);
}

/** The unchanged contact, crossing, and boolean-overlap tests for a pose that is already seated. */
export async function validateSeatedPose(host: ArchetypeMesh, guest: ArchetypeMesh, pose: Skill6Pose, spec: EnvelopeSpec, shift: Vec3 = [0, 0, 0]): Promise<SeatCandidate> {
  const reading = validatePose(host, guest, pose, spec);
  let overlap: number | null = null;
  let accepted = reading.accepted;
  let reason = reading.reason;
  if (accepted) {
    overlap = await poseOverlap(host, guest, HOME, reading.pose);
    if (overlap != null && Math.abs(overlap) > MAX_BOOLEAN_VOLUME) {
      accepted = false;
      reason = `Boolean overlap ${overlap.toFixed(3)} exceeds the seating sliver.`;
    }
  }
  return fromReading(reading, shift, overlap, accepted, reason, null, host, guest);
}

async function judge(host: ArchetypeMesh, guest: ArchetypeMesh, spec: EnvelopeSpec, gap: number, shift: Vec3): Promise<SeatCandidate> {
  return validateSeatedPose(host, guest, poseAtGap(host, guest, spec, gap, shift), { ...spec, gap }, shift);
}

function withNormal(host: ArchetypeMesh, guest: ArchetypeMesh, candidate: SeatCandidate | null): SeatCandidate | null {
  if (!candidate || candidate.contactArea < SKILL6_PARAMETERS.minContactArea) return candidate;
  const normal = contactNormalOf(host, guest, HOME, candidate.pose);
  return { ...candidate, relation: { ...candidate.relation, contactNormal: normal } };
}

export type SeatSearch = {
  gaps: number[];
  shift: Vec3;
  tested: SeatCandidate[];
  chosen: SeatCandidate | null;
  /** Strongest rejected distance, so a miss still has a validation record. */
  nearMiss: SeatCandidate | null;
  milliseconds: number;
};

/** Every clearance on the ladder. The chosen distance is the best contact that passes, not the first. */
export async function searchAdaptiveSeat(host: ArchetypeMesh, guest: ArchetypeMesh, spec: EnvelopeSpec, shift: Vec3 = [0, 0, 0], normals: "kept" | "regions" = "kept"): Promise<SeatSearch> {
  const started = Date.now();
  const gaps = adaptiveSeatGaps();
  const tested: SeatCandidate[] = [];
  for (const gap of gaps) tested.push(await judge(host, guest, spec, gap, shift));
  const passing = tested.filter((item) => item.accepted).sort(betterContact);
  const rejected = tested.filter((item) => !item.accepted).sort((left, right) => right.contactArea - left.contactArea);
  const chosen = withNormal(host, guest, passing[0] ?? null);
  const nearMiss = chosen ? null : withNormal(host, guest, rejected[0] ?? null);
  if (normals === "regions") {
    for (let index = 0; index < tested.length; index += 1) {
      const item = tested[index];
      if (item.contactArea < SKILL6_PARAMETERS.minContactArea || item.coherentRegions !== 1) continue;
      if (chosen && item.gap === chosen.gap) {
        tested[index] = chosen;
        continue;
      }
      if (nearMiss && item.gap === nearMiss.gap) {
        tested[index] = nearMiss;
        continue;
      }
      tested[index] = withNormal(host, guest, item) ?? item;
    }
  } else if (chosen) {
    const at = tested.findIndex((item) => item.gap === chosen.gap);
    if (at >= 0) tested[at] = chosen;
  }
  return { gaps, shift, tested, chosen, nearMiss, milliseconds: Date.now() - started };
}

export type SlideAttempt = {
  shift: Vec3;
  chosen: SeatCandidate | null;
  nearMiss: SeatCandidate | null;
};

export type SlideSearch = {
  offsets: number;
  attempts: SlideAttempt[];
  /** Best reseated slide. Compared with the centered seat by the same contact order. */
  chosen: SeatCandidate | null;
  milliseconds: number;
};

/**
 * Each tangent slide is seated again. The slide does not keep the centered clearance.
 * Slides are only worth running once some centered clearance has already passed.
 */
export async function searchReseatedSlides(host: ArchetypeMesh, guest: ArchetypeMesh, spec: EnvelopeSpec): Promise<SlideSearch> {
  const started = Date.now();
  const attempts: SlideAttempt[] = [];
  for (const offset of shiftOffsets(spec.axis)) {
    const search = await searchAdaptiveSeat(host, guest, spec, offset);
    attempts.push({ shift: offset, chosen: search.chosen, nearMiss: search.chosen ? null : search.nearMiss });
  }
  const chosen = attempts.map((item) => item.chosen).filter((item): item is SeatCandidate => item != null).sort(betterContact)[0] ?? null;
  return { offsets: attempts.length, attempts, chosen, milliseconds: Date.now() - started };
}
