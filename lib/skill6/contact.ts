import { SKILL6_PARAMETERS, type ContactSample, type ContactVerdict, type Skill6Pose, type Vec3 } from "./contract";
import {
  applyBasis,
  applyPose,
  boundsOverlap,
  boundsRelation,
  closestOnTriangle,
  crossingPenetration,
  cross,
  dot,
  invertPose,
  length,
  pointInsideMesh,
  poseBounds,
  queryHash,
  readTriangle,
  scale,
  sub,
  type Bounds,
} from "./geometry";
import type { ArchetypeMesh, SurfacePatch } from "./source";

export type PairReading = {
  verdict: ContactVerdict;
  minSurfaceDistance: number | null;
  residualGap: number | null;
  contactArea: number;
  coherentRegions: number;
  normalAlignment: number;
  samples: ContactSample[];
  intersectingTriangles: number;
  registrationOverlap: boolean;
  tightBox: "separated" | "touch" | "overlap";
  contained: boolean;
};

const QUERY_RADIUS = 0.62;

type Nearest = { distance: number; point: Vec3; normal: Vec3 };

function nearestOn(mesh: ArchetypeMesh, local: Vec3): Nearest | null {
  const triangles = queryHash(mesh.hash, local, QUERY_RADIUS);
  if (triangles.length === 0) return null;
  let best: Nearest | null = null;
  for (const triangle of triangles) {
    const [a, b, c] = readTriangle(mesh.positions, mesh.indices, triangle);
    const point = closestOnTriangle(local, a, b, c);
    const offset = sub(local, point);
    const distance = length(offset);
    if (best && distance >= best.distance) continue;
    const raw = cross(sub(b, a), sub(c, a));
    const span = length(raw);
    best = { distance, point, normal: span > 1e-8 ? scale(raw, 1 / span) : [0, 0, 1] };
  }
  return best;
}

function countIntersections(
  host: ArchetypeMesh,
  guest: ArchetypeMesh,
  hostPose: Skill6Pose,
  guestPose: Skill6Pose,
  limit: number,
): number {
  const hostBox = poseBounds(host.tight, hostPose);
  let hits = 0;
  for (let triangle = 0; triangle < guest.triangles; triangle += 1) {
    const [a, b, c] = readTriangle(guest.positions, guest.indices, triangle);
    const worldA = applyPose(guestPose, a);
    const worldB = applyPose(guestPose, b);
    const worldC = applyPose(guestPose, c);
    const min = [
      Math.min(worldA[0], worldB[0], worldC[0]),
      Math.min(worldA[1], worldB[1], worldC[1]),
      Math.min(worldA[2], worldB[2], worldC[2]),
    ];
    const max = [
      Math.max(worldA[0], worldB[0], worldC[0]),
      Math.max(worldA[1], worldB[1], worldC[1]),
      Math.max(worldA[2], worldB[2], worldC[2]),
    ];
    if (max[0] < hostBox.min[0] || min[0] > hostBox.max[0]
      || max[1] < hostBox.min[1] || min[1] > hostBox.max[1]
      || max[2] < hostBox.min[2] || min[2] > hostBox.max[2]) continue;
    const localA = invertPose(hostPose, worldA);
    const localB = invertPose(hostPose, worldB);
    const localC = invertPose(hostPose, worldC);
    const center: Vec3 = [
      (localA[0] + localB[0] + localC[0]) / 3,
      (localA[1] + localB[1] + localC[1]) / 3,
      (localA[2] + localB[2] + localC[2]) / 3,
    ];
    const candidates = queryHash(host.hash, center, 0.8);
    for (const other of candidates) {
      const [d, e, f] = readTriangle(host.positions, host.indices, other);
      if (crossingPenetration(localA, localB, localC, d, e, f) > SKILL6_PARAMETERS.maxPenetration) {
        hits += 1;
        if (hits > limit) return hits;
      }
    }
  }
  return hits;
}

const LINK = 1.15;

type RegionHit = {
  guest: Vec3;
  host: Vec3;
  gap: number;
  area: number;
  alignment: number;
  cell: Vec3;
};

export type CoherentReading = {
  minSurfaceDistance: number | null;
  residualGap: number | null;
  contactArea: number;
  coherentRegions: number;
  normalAlignment: number;
  samples: ContactSample[];
};

function classify(
  reading: CoherentReading,
  intersectingTriangles: number,
  contained: boolean,
  tightBox: PairReading["tightBox"],
): ContactVerdict {
  const aligned = reading.normalAlignment <= -SKILL6_PARAMETERS.normalOpposition;
  if (intersectingTriangles > SKILL6_PARAMETERS.maxIntersectingTriangles) return "intersection";
  if (reading.coherentRegions > 1) return "scattered";
  if (aligned && reading.contactArea >= SKILL6_PARAMETERS.minContactArea && reading.residualGap != null && reading.residualGap <= SKILL6_PARAMETERS.targetGap) {
    return "surface-contact";
  }
  if (aligned && reading.contactArea >= SKILL6_PARAMETERS.minContactArea && reading.residualGap != null && reading.residualGap <= SKILL6_PARAMETERS.contactTolerance) {
    return "near-contact";
  }
  if (reading.contactArea > 0 && reading.contactArea < SKILL6_PARAMETERS.minContactArea) return "point-contact";
  if (contained) return "containment";
  if (tightBox !== "separated") return "bbox-only";
  return "gap";
}

/** One guest pad against the host surface. Area is the largest connected in-tolerance set, not the sum of every nearby triangle. */
export function measureCoherent(
  host: ArchetypeMesh,
  hostPose: Skill6Pose,
  guestPose: Skill6Pose,
  patch: SurfacePatch,
  hostNormal: Vec3 | null,
): CoherentReading {
  const guestNormal = applyBasis(guestPose.basis, patch.normal);
  const aimed = hostNormal ? dot(hostNormal, guestNormal) : -1;
  const hits: RegionHit[] = [];
  let minSurfaceDistance: number | null = null;
  for (const sample of patch.samples) {
    const guest = applyPose(guestPose, sample.point);
    const found = nearestOn(host, invertPose(hostPose, guest));
    if (!found) continue;
    if (minSurfaceDistance == null || found.distance < minSurfaceDistance) minSurfaceDistance = found.distance;
    if (found.distance > SKILL6_PARAMETERS.contactTolerance) continue;
    const sampleNormal = applyBasis(guestPose.basis, sample.normal);
    const surfaceNormal = applyBasis(hostPose.basis, found.normal);
    if (dot(surfaceNormal, sampleNormal) > -0.5) continue;
    hits.push({
      guest,
      host: applyPose(hostPose, found.point),
      gap: found.distance,
      area: sample.area,
      alignment: dot(surfaceNormal, sampleNormal),
      cell: [Math.round(guest[0] / LINK), Math.round(guest[1] / LINK), Math.round(guest[2] / LINK)],
    });
  }
  const parent = hits.map((_, index) => index);
  const find = (index: number): number => {
    let root = index;
    while (parent[root] !== root) root = parent[root];
    parent[index] = root;
    return root;
  };
  const nearest = hits.map(() => Infinity);
  for (let left = 0; left < hits.length; left += 1) {
    for (let right = left + 1; right < hits.length; right += 1) {
      const span = Math.hypot(
        hits[left].guest[0] - hits[right].guest[0],
        hits[left].guest[1] - hits[right].guest[1],
        hits[left].guest[2] - hits[right].guest[2],
      );
      if (span < nearest[left]) nearest[left] = span;
      if (span < nearest[right]) nearest[right] = span;
    }
  }
  const finite = nearest.filter((value) => Number.isFinite(value)).sort((left, right) => left - right);
  const spacing = finite.length > 0 ? finite[Math.floor(finite.length / 2)] : LINK;
  const reach = Math.max(LINK, spacing * 1.45);
  for (let left = 0; left < hits.length; left += 1) {
    for (let right = left + 1; right < hits.length; right += 1) {
      const span = Math.hypot(
        hits[left].guest[0] - hits[right].guest[0],
        hits[left].guest[1] - hits[right].guest[1],
        hits[left].guest[2] - hits[right].guest[2],
      );
      if (span > reach) continue;
      parent[find(right)] = find(left);
    }
  }
  const groups = new Map<number, RegionHit[]>();
  for (let index = 0; index < hits.length; index += 1) {
    const root = find(index);
    const list = groups.get(root);
    if (list) list.push(hits[index]);
    else groups.set(root, [hits[index]]);
  }
  let best: RegionHit[] = [];
  let bestArea = 0;
  let regions = 0;
  for (const group of groups.values()) {
    const area = group.reduce((sum, hit) => sum + hit.area, 0);
    if (area >= 0.4) regions += 1;
    if (area > bestArea) {
      bestArea = area;
      best = group;
    }
  }
  const samples = best.slice(0, 18).map((hit) => ({ host: hit.host, guest: hit.guest, gap: hit.gap }));
  const residualGap = best.length > 0 ? Math.max(...best.map((hit) => hit.gap)) : null;
  const sampleAlignment = bestArea > 0 ? best.reduce((sum, hit) => sum + hit.alignment * hit.area, 0) / bestArea : 0;
  return {
    minSurfaceDistance: best.length > 0 ? Math.min(...best.map((hit) => hit.gap)) : minSurfaceDistance,
    residualGap,
    contactArea: bestArea,
    coherentRegions: regions,
    normalAlignment: Math.max(aimed, sampleAlignment),
    samples,
  };
}

function centroidOf(mesh: ArchetypeMesh): Vec3 {
  let x = 0;
  let y = 0;
  let z = 0;
  const count = mesh.positions.length / 3;
  for (let index = 0; index < mesh.positions.length; index += 3) {
    x += mesh.positions[index];
    y += mesh.positions[index + 1];
    z += mesh.positions[index + 2];
  }
  const scaleBy = count || 1;
  return [x / scaleBy, y / scaleBy, z / scaleBy];
}

/**
 * Surface relation between two posed meshes.
 * Registration overlap and tight-box overlap are reported beside the verdict.
 * A touching box is not a contact. Proximity from separate regions is not added into one area.
 */
export function readPair(
  host: ArchetypeMesh,
  guest: ArchetypeMesh,
  hostPose: Skill6Pose,
  guestPose: Skill6Pose,
  tolerance: number,
): PairReading {
  const registrationOverlap = boundsOverlap(poseBounds(host.registration, hostPose), poseBounds(guest.registration, guestPose), 0);
  const tightBox = boundsRelation(poseBounds(host.tight, hostPose), poseBounds(guest.tight, guestPose), tolerance);
  const guestWorld = applyPose(guestPose, centroidOf(guest));
  const hostLocal = invertPose(hostPose, guestWorld);
  const contained = boundsOverlap(poseBounds(host.tight, hostPose), { min: guestWorld, max: guestWorld })
    && pointInsideMesh(hostLocal, host.positions, host.indices, host.triangles);
  let best: CoherentReading = {
    minSurfaceDistance: null,
    residualGap: null,
    contactArea: 0,
    coherentRegions: 0,
    normalAlignment: 0,
    samples: [],
  };
  for (const patch of guest.patches) {
    const reading = measureCoherent(host, hostPose, guestPose, patch, null);
    const readingRank = reading.contactArea - Math.max(0, reading.coherentRegions - 1);
    const bestRank = best.contactArea - Math.max(0, best.coherentRegions - 1);
    if (readingRank > bestRank) best = reading;
  }
  const intersectingTriangles = tightBox === "separated" && (best.minSurfaceDistance == null || best.minSurfaceDistance > tolerance)
    ? 0
    : countIntersections(host, guest, hostPose, guestPose, SKILL6_PARAMETERS.maxIntersectingTriangles);
  return {
    verdict: classify(best, intersectingTriangles, contained, tightBox),
    minSurfaceDistance: best.minSurfaceDistance,
    residualGap: best.residualGap,
    contactArea: best.contactArea,
    coherentRegions: best.coherentRegions,
    normalAlignment: best.normalAlignment,
    samples: best.samples,
    intersectingTriangles,
    registrationOverlap,
    tightBox,
    contained,
  };
}

export function acceptedVerdict(verdict: ContactVerdict): boolean {
  return verdict === "surface-contact" || verdict === "near-contact";
}

export type BoxMesh = Pick<ArchetypeMesh, "positions" | "indices" | "triangles" | "tight" | "registration" | "hash" | "patches">;

export function worldBounds(bounds: Bounds, pose: Skill6Pose): Bounds {
  return poseBounds(bounds, pose);
}
