/**
 * Outer-envelope seating. A guest is placed against the host's outer surface
 * band, then checked with dense samples, a full triangle-box intersection, and
 * a manifold overlap when the caller asks for one. Planar pads are not used.
 */
import { SKILL6_PARAMETERS, type Mat3, type Quarter, type Skill6Pose, type Vec3 } from "./contract";
import {
  add,
  applyBasis,
  applyPose,
  boundsOverlap,
  closestOnTriangle,
  crossingPenetration,
  cross,
  dot,
  IDENTITY,
  invertPose,
  length,
  multiplyBasis,
  normalize,
  poseBounds,
  rotationFromTo,
  poseWithBasis,
  queryHash,
  queryHashBox,
  readTriangle,
  rotationAbout,
  scale,
  sub,
} from "./geometry";
import type { ArchetypeMesh } from "./source";

export const ENVELOPE_GRID = {
  yaws: [0, 90, 180, 270],
  pitches: [-40, 0, 40],
  rolls: [0, 90],
  axes: [
    { name: "+X", direction: [1, 0, 0] as Vec3 },
    { name: "-X", direction: [-1, 0, 0] as Vec3 },
    { name: "+Y", direction: [0, 1, 0] as Vec3 },
    { name: "-Y", direction: [0, -1, 0] as Vec3 },
    { name: "+Z", direction: [0, 0, 1] as Vec3 },
    { name: "-Z", direction: [0, 0, -1] as Vec3 },
  ],
  gap: 0.1,
} as const;

/**
 * Boolean overlap above this, with a shallow triangle reading, means the
 * crossing test missed a solid bite. The measured plate sliver is 0.008.
 */
export const MAX_BOOLEAN_VOLUME = 0.05;

const MIRROR_X: Mat3 = [-1, 0, 0, 0, 1, 0, 0, 0, 1];

type Sample = { point: Vec3; normal: Vec3; area: number };

export type EnvelopeSpec = {
  yaw: number;
  pitch: number;
  roll: number;
  axis: Vec3;
  axisName: string;
  gap: number;
  mirrorX: boolean;
};

export type EnvelopeReading = {
  spec: EnvelopeSpec;
  pose: Skill6Pose;
  contactArea: number;
  coherentRegions: number;
  residualGap: number | null;
  minSurfaceDistance: number | null;
  normalAlignment: number | null;
  deepestCrossing: number;
  crossingCount: number;
  overlapVolume: number | null;
  accepted: boolean;
  verdict: "surface-contact" | "near-contact" | "rejected";
  reason: string | null;
};

const samplesOf = new WeakMap<ArchetypeMesh, Sample[]>();

function surfaceSamples(mesh: ArchetypeMesh, target = 180): Sample[] {
  const cached = samplesOf.get(mesh);
  if (cached) return cached;
  const stride = Math.max(1, Math.floor(mesh.triangles / target));
  const samples: Sample[] = [];
  for (let triangle = 0; triangle < mesh.triangles; triangle += stride) {
    const [a, b, c] = readTriangle(mesh.positions, mesh.indices, triangle);
    const raw = cross(sub(b, a), sub(c, a));
    const span = length(raw);
    if (span < 1e-8) continue;
    samples.push({
      point: [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3, (a[2] + b[2] + c[2]) / 3],
      normal: scale(raw, 1 / span),
      area: span * 0.5 * stride,
    });
  }
  samplesOf.set(mesh, samples);
  return samples;
}

function percentile(values: number[], fraction: number): number {
  const sorted = values.slice().sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.floor((sorted.length - 1) * fraction)));
  return sorted[index] ?? 0;
}

export function envelopeBasis(spec: Pick<EnvelopeSpec, "yaw" | "pitch" | "roll" | "mirrorX">): Mat3 {
  const aboutZ = rotationAbout([0, 0, 1], spec.yaw * Math.PI / 180);
  const aboutX = rotationAbout([1, 0, 0], spec.pitch * Math.PI / 180);
  const aboutY = rotationAbout([0, 1, 0], spec.roll * Math.PI / 180);
  const turned = multiplyBasis(aboutZ, multiplyBasis(aboutX, aboutY));
  return spec.mirrorX ? multiplyBasis(turned, MIRROR_X) : turned;
}

export function envelopeTranslation(host: ArchetypeMesh, guest: ArchetypeMesh, basis: Mat3, direction: Vec3, gap: number): Vec3 {
  const hostSamples = surfaceSamples(host);
  const guestSamples = host === guest ? hostSamples : surfaceSamples(guest);
  const outer = hostSamples.length >= 40 ? 0.9 : 1;
  const inner = guestSamples.length >= 40 ? 0.1 : 0;
  const hostFront = percentile(hostSamples.map((sample) => dot(sample.point, direction)), outer);
  const guestBack = percentile(guestSamples.map((sample) => dot(applyBasis(basis, sample.point), direction)), inner);
  return scale(direction, hostFront - guestBack + gap);
}

function quarterOf(spec: EnvelopeSpec): Quarter {
  if (spec.pitch !== 0 || spec.roll !== 0 || spec.yaw % 90 !== 0) return 0;
  return ((spec.yaw / 90) % 4) as Quarter;
}

export function envelopePose(host: ArchetypeMesh, guest: ArchetypeMesh, spec: EnvelopeSpec): Skill6Pose {
  const basis = envelopeBasis(spec);
  return poseWithBasis(quarterOf(spec), spec.mirrorX, basis, envelopeTranslation(host, guest, basis, spec.axis, spec.gap));
}

/** Rotate a valid relative pose so its approach faces `to`, then reseat the gap along that axis. The guest's twist around the approach is kept. */
export function reseatPose(host: ArchetypeMesh, guest: ArchetypeMesh, pose: Skill6Pose, to: Vec3, gap = ENVELOPE_GRID.gap): Skill6Pose {
  const span = length(pose.translation);
  const from = span < 1e-6 ? [1, 0, 0] as Vec3 : scale(pose.translation, 1 / span);
  const turn = rotationFromTo(from, to);
  const basis = multiplyBasis(turn, pose.basis);
  const aim = normalize(to);
  return poseWithBasis(pose.quarterZ, pose.mirrorX, basis, envelopeTranslation(host, guest, basis, aim, gap));
}

/** World pose of a guest whose relative pose was measured on an untransformed host. */
export function composePose(host: Skill6Pose, relative: Skill6Pose): Skill6Pose {
  return poseWithBasis(
    relative.quarterZ,
    relative.mirrorX,
    multiplyBasis(host.basis, relative.basis),
    add(applyBasis(host.basis, relative.translation), host.translation),
  );
}

function linkRegions(hits: { guest: Vec3; area: number; gap: number }[]) {
  if (hits.length === 0) return { regions: 0, largest: 0, residual: null as number | null, closest: null as number | null };
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
  const spacing = finite.length > 0 ? finite[Math.floor(finite.length / 2)] : 1.6;
  const reach = Math.max(1.6, spacing * 1.45);
  for (let left = 0; left < hits.length; left += 1) {
    for (let right = left + 1; right < hits.length; right += 1) {
      const span = Math.hypot(
        hits[left].guest[0] - hits[right].guest[0],
        hits[left].guest[1] - hits[right].guest[1],
        hits[left].guest[2] - hits[right].guest[2],
      );
      if (span <= reach) parent[find(right)] = find(left);
    }
  }
  const groups = new Map<number, { area: number; residual: number; closest: number }>();
  for (let index = 0; index < hits.length; index += 1) {
    const root = find(index);
    const group = groups.get(root) ?? { area: 0, residual: 0, closest: Infinity };
    group.area += hits[index].area;
    group.residual = Math.max(group.residual, hits[index].gap);
    group.closest = Math.min(group.closest, hits[index].gap);
    groups.set(root, group);
  }
  let largest = 0;
  let residual: number | null = null;
  let closest: number | null = null;
  let regions = 0;
  for (const group of groups.values()) {
    if (group.area >= 0.4) regions += 1;
    if (group.area > largest) {
      largest = group.area;
      residual = group.residual;
      closest = group.closest;
    }
  }
  return { regions, largest, residual, closest };
}

function nearestLocal(host: ArchetypeMesh, local: Vec3): { distance: number; normal: Vec3; point: Vec3 } | null {
  const triangles = queryHash(host.hash, local, 0.7);
  let best: { distance: number; normal: Vec3; point: Vec3 } | null = null;
  for (const triangle of triangles) {
    const [a, b, c] = readTriangle(host.positions, host.indices, triangle);
    const point = closestOnTriangle(local, a, b, c);
    const distance = length(sub(local, point));
    if (best && distance >= best.distance) continue;
    const raw = cross(sub(b, a), sub(c, a));
    const span = length(raw);
    best = { distance, point, normal: span > 1e-8 ? scale(raw, 1 / span) : [0, 0, 1] };
  }
  return best;
}

type CachedContact = {
  contactArea: number;
  coherentRegions: number;
  residualGap: number | null;
  minSurfaceDistance: number | null;
  normalAlignment: number | null;
  samples: { host: Vec3; guest: Vec3; gap: number }[];
};

const ENVELOPE_CACHE = new Map<string, CachedContact>();
const CROSSING_CACHE = new Map<string, { count: number; deepest: number }>();
const PAIR_CACHE_LIMIT = 4000;

function meshIdentity(mesh: ArchetypeMesh): string {
  return `${mesh.archetypeId}|${mesh.moduleId}|${mesh.triangles}|${mesh.positions.byteLength}`;
}

function poseIdentity(pose: Skill6Pose): string {
  return `${pose.quarterZ}|${pose.mirrorX ? 1 : 0}|${pose.basis.join(",")}|${pose.translation.join(",")}`;
}

function pairKey(kind: string, host: ArchetypeMesh, guest: ArchetypeMesh, hostPose: Skill6Pose, guestPose: Skill6Pose): string {
  return `${kind}\n${meshIdentity(host)}\n${meshIdentity(guest)}\n${poseIdentity(hostPose)}\n${poseIdentity(guestPose)}`;
}

function remember<T>(cache: Map<string, T>, key: string, value: T) {
  if (cache.has(key)) cache.delete(key);
  cache.set(key, value);
  while (cache.size > PAIR_CACHE_LIMIT) {
    const oldest = cache.keys().next().value;
    if (oldest == null) break;
    cache.delete(oldest);
  }
}

function copyEnvelope(reading: CachedContact): CachedContact {
  return {
    ...reading,
    samples: reading.samples.map((sample) => ({ host: [...sample.host], guest: [...sample.guest], gap: sample.gap })),
  };
}

/** Dense contact of one posed guest against one posed host. Area uses the triangle stride, not a sparse guess. */
export function measureEnvelope(host: ArchetypeMesh, guest: ArchetypeMesh, hostPose: Skill6Pose, guestPose: Skill6Pose): CachedContact {
  const key = pairKey("envelope", host, guest, hostPose, guestPose);
  const found = ENVELOPE_CACHE.get(key);
  if (found) return copyEnvelope(found);
  const reading = measureEnvelopeOnce(host, guest, hostPose, guestPose);
  remember(ENVELOPE_CACHE, key, reading);
  return copyEnvelope(reading);
}

function measureEnvelopeOnce(host: ArchetypeMesh, guest: ArchetypeMesh, hostPose: Skill6Pose, guestPose: Skill6Pose): CachedContact {
  const hits: { guest: Vec3; host: Vec3; area: number; gap: number; alignment: number }[] = [];
  let minDistance: number | null = null;
  const stride = Math.max(1, Math.floor(guest.triangles / 2500));
  for (let triangle = 0; triangle < guest.triangles; triangle += stride) {
    const [a, b, c] = readTriangle(guest.positions, guest.indices, triangle);
    const raw = cross(sub(b, a), sub(c, a));
    const span = length(raw);
    if (span < 1e-8) continue;
    const world = applyPose(guestPose, [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3, (a[2] + b[2] + c[2]) / 3]);
    const found = nearestLocal(host, invertPose(hostPose, world));
    if (!found) continue;
    if (minDistance == null || found.distance < minDistance) minDistance = found.distance;
    if (found.distance > SKILL6_PARAMETERS.contactTolerance) continue;
    const guestNormal = applyBasis(guestPose.basis, scale(raw, 1 / span));
    const hostNormal = applyBasis(hostPose.basis, found.normal);
    const alignment = dot(hostNormal, guestNormal);
    if (alignment > -0.5) continue;
    hits.push({
      guest: world,
      host: applyPose(hostPose, found.point),
      area: span * 0.5 * stride,
      gap: found.distance,
      alignment,
    });
  }
  const grouped = linkRegions(hits);
  const meanAlignment = hits.length > 0
    ? hits.reduce((sum, hit) => sum + hit.alignment * hit.area, 0) / hits.reduce((sum, hit) => sum + hit.area, 0)
    : null;
  return {
    contactArea: grouped.largest,
    coherentRegions: grouped.regions,
    residualGap: grouped.residual,
    minSurfaceDistance: grouped.closest ?? minDistance,
    normalAlignment: meanAlignment,
    samples: hits.slice(0, 18).map((hit) => ({ host: hit.host, guest: hit.guest, gap: hit.gap })),
  };
}

/** Full triangle-box intersection. A centroid neighborhood is not used as clearance. */
export function scanCrossings(
  host: ArchetypeMesh,
  guest: ArchetypeMesh,
  hostPose: Skill6Pose,
  guestPose: Skill6Pose,
): { count: number; deepest: number } {
  const key = pairKey("crossing", host, guest, hostPose, guestPose);
  const found = CROSSING_CACHE.get(key);
  if (found) return { count: found.count, deepest: found.deepest };
  if (!boundsOverlap(poseBounds(host.tight, hostPose), poseBounds(guest.tight, guestPose))) {
    const separated = { count: 0, deepest: 0 };
    remember(CROSSING_CACHE, key, separated);
    return { count: 0, deepest: 0 };
  }
  const measured = scanCrossingsOnce(host, guest, hostPose, guestPose);
  remember(CROSSING_CACHE, key, measured);
  return { count: measured.count, deepest: measured.deepest };
}

function scanCrossingsOnce(
  host: ArchetypeMesh,
  guest: ArchetypeMesh,
  hostPose: Skill6Pose,
  guestPose: Skill6Pose,
): { count: number; deepest: number } {
  let count = 0;
  let deepest = 0;
  for (let triangle = 0; triangle < guest.triangles; triangle += 1) {
    const [a, b, c] = readTriangle(guest.positions, guest.indices, triangle);
    const localA = invertPose(hostPose, applyPose(guestPose, a));
    const localB = invertPose(hostPose, applyPose(guestPose, b));
    const localC = invertPose(hostPose, applyPose(guestPose, c));
    const min: Vec3 = [
      Math.min(localA[0], localB[0], localC[0]) - 0.02,
      Math.min(localA[1], localB[1], localC[1]) - 0.02,
      Math.min(localA[2], localB[2], localC[2]) - 0.02,
    ];
    const max: Vec3 = [
      Math.max(localA[0], localB[0], localC[0]) + 0.02,
      Math.max(localA[1], localB[1], localC[1]) + 0.02,
      Math.max(localA[2], localB[2], localC[2]) + 0.02,
    ];
    for (const other of queryHashBox(host.hash, min, max)) {
      const [d, e, f] = readTriangle(host.positions, host.indices, other);
      const depth = crossingPenetration(localA, localB, localC, d, e, f);
      if (depth <= 1e-4) continue;
      if (depth > deepest) deepest = depth;
      if (depth > SKILL6_PARAMETERS.maxPenetration) {
        count += 1;
        if (count >= 40) return { count, deepest };
      }
    }
  }
  return { count, deepest };
}

export function poseBlocked(
  members: readonly { mesh: ArchetypeMesh; pose: Skill6Pose }[],
  guest: ArchetypeMesh,
  guestPose: Skill6Pose,
): { blocked: boolean; deepest: number; count: number } {
  let deepest = 0;
  let count = 0;
  for (const member of members) {
    const hit = scanCrossings(member.mesh, guest, member.pose, guestPose);
    count += hit.count;
    if (hit.deepest > deepest) deepest = hit.deepest;
    if (hit.count > SKILL6_PARAMETERS.maxIntersectingTriangles) return { blocked: true, deepest, count };
  }
  return { blocked: false, deepest, count };
}

function contactPasses(reading: { contactArea: number; coherentRegions: number; residualGap: number | null; normalAlignment: number | null }): boolean {
  return reading.coherentRegions === 1
    && reading.contactArea >= SKILL6_PARAMETERS.minContactArea
    && reading.residualGap != null
    && reading.residualGap <= SKILL6_PARAMETERS.contactTolerance
    && reading.normalAlignment != null
    && reading.normalAlignment <= -SKILL6_PARAMETERS.normalOpposition;
}

function verdictOf(residual: number | null): "surface-contact" | "near-contact" {
  return residual != null && residual <= SKILL6_PARAMETERS.targetGap ? "surface-contact" : "near-contact";
}

export function describeSpec(spec: EnvelopeSpec): string {
  return `${spec.axisName} yaw ${spec.yaw} pitch ${spec.pitch} roll ${spec.roll} gap ${spec.gap}${spec.mirrorX ? " mirror" : ""}`;
}

/** Tangents of a contact axis. Z stays the vertical axis of the pose; these are the slide directions. */
export function contactTangents(normal: Vec3): [Vec3, Vec3] {
  const helper: Vec3 = Math.abs(normal[2]) < 0.85 ? [0, 0, 1] : [1, 0, 0];
  const u = normalize(cross(normal, helper));
  const v = normalize(cross(normal, u));
  return [u, v];
}

export const SHIFT_STEPS = [3, 6, 9] as const;

/** Lateral offsets in the host frame. The centered pose is not included. */
export function shiftOffsets(axis: Vec3): Vec3[] {
  const [u, v] = contactTangents(axis);
  const found: Vec3[] = [];
  for (const step of SHIFT_STEPS) {
    found.push(scale(u, step), scale(u, -step), scale(v, step), scale(v, -step));
  }
  found.push(
    add(scale(u, 4), scale(v, 4)),
    add(scale(u, -4), scale(v, 4)),
    add(scale(u, 4), scale(v, -4)),
    add(scale(u, -4), scale(v, -4)),
  );
  return found;
}

export function translatePose(pose: Skill6Pose, offset: Vec3): Skill6Pose {
  return poseWithBasis(pose.quarterZ, pose.mirrorX, pose.basis, add(pose.translation, offset));
}

/** Sparse ranking. A high score is not acceptance. */
export function cheapPoseScore(host: ArchetypeMesh, guest: ArchetypeMesh, pose: Skill6Pose): number {
  const hits: { guest: Vec3; area: number; gap: number; alignment: number }[] = [];
  for (const sample of (host === guest ? surfaceSamples(host) : surfaceSamples(guest))) {
    const world = applyPose(pose, sample.point);
    const found = nearestLocal(host, world);
    if (!found || found.distance > SKILL6_PARAMETERS.contactTolerance) continue;
    const alignment = dot(found.normal, applyBasis(pose.basis, sample.normal));
    if (alignment > -0.5) continue;
    hits.push({ guest: world, area: sample.area, gap: found.distance, alignment });
  }
  const grouped = linkRegions(hits);
  const alignment = hits.length > 0
    ? hits.reduce((sum, hit) => sum + hit.alignment * hit.area, 0) / hits.reduce((sum, hit) => sum + hit.area, 0)
    : 0;
  if (grouped.largest < SKILL6_PARAMETERS.minContactArea * 0.75) return -1;
  if (alignment > -SKILL6_PARAMETERS.normalOpposition) return grouped.largest * 0.01;
  return grouped.largest - (grouped.residual ?? 0);
}

function cheapScore(host: ArchetypeMesh, guest: ArchetypeMesh, spec: EnvelopeSpec): number {
  const pose = envelopePose(host, guest, spec);
  const hits: { guest: Vec3; area: number; gap: number; alignment: number }[] = [];
  for (const sample of surfaceSamples(guest)) {
    const world = applyPose(pose, sample.point);
    const found = nearestLocal(host, world);
    if (!found || found.distance > SKILL6_PARAMETERS.contactTolerance) continue;
    const alignment = dot(found.normal, applyBasis(pose.basis, sample.normal));
    if (alignment > -0.5) continue;
    hits.push({ guest: world, area: sample.area, gap: found.distance, alignment });
  }
  const grouped = linkRegions(hits);
  const alignment = hits.length > 0
    ? hits.reduce((sum, hit) => sum + hit.alignment * hit.area, 0) / hits.reduce((sum, hit) => sum + hit.area, 0)
    : 0;
  if (grouped.largest < SKILL6_PARAMETERS.minContactArea * 0.75) return -1;
  if (alignment > -SKILL6_PARAMETERS.normalOpposition) return grouped.largest * 0.01;
  return grouped.largest - (grouped.residual ?? 0);
}

export async function poseOverlap(host: ArchetypeMesh, guest: ArchetypeMesh, hostPose: Skill6Pose, guestPose: Skill6Pose): Promise<number | null> {
  try {
    const wasm = await (await import("manifold-3d/manifold")).default();
    wasm.setup();
    const positioned = (mesh: ArchetypeMesh, pose: Skill6Pose) => {
      const vertProperties = new Float32Array(mesh.positions.length);
      for (let vertex = 0; vertex < mesh.positions.length; vertex += 3) {
        const world = applyPose(pose, [mesh.positions[vertex], mesh.positions[vertex + 1], mesh.positions[vertex + 2]]);
        vertProperties[vertex] = world[0];
        vertProperties[vertex + 1] = world[1];
        vertProperties[vertex + 2] = world[2];
      }
      return vertProperties;
    };
    const hostSolid = new wasm.Manifold(new wasm.Mesh({ numProp: 3, vertProperties: positioned(host, hostPose), triVerts: host.indices }));
    const guestSolid = new wasm.Manifold(new wasm.Mesh({ numProp: 3, vertProperties: positioned(guest, guestPose), triVerts: guest.indices }));
    const overlap = hostSolid.intersect(guestSolid);
    const volume = overlap.volume();
    overlap.delete();
    guestSolid.delete();
    hostSolid.delete();
    return volume;
  } catch {
    return null;
  }
}

function finishReading(
  spec: EnvelopeSpec,
  pose: Skill6Pose,
  measured: Omit<ReturnType<typeof measureEnvelope>, "samples">,
  crossing: { count: number; deepest: number },
  volume: number | null,
): EnvelopeReading {
  const base = {
    spec,
    pose,
    ...measured,
    deepestCrossing: crossing.deepest,
    crossingCount: crossing.count,
    overlapVolume: volume,
  };
  if (!contactPasses(measured)) {
    return { ...base, accepted: false, verdict: "rejected", reason: "The coherent region missed the area, residual, or alignment limit." };
  }
  if (crossing.deepest > SKILL6_PARAMETERS.maxPenetration) {
    return { ...base, accepted: false, verdict: "rejected", reason: `Triangle crossing depth ${crossing.deepest.toFixed(3)} exceeds 0.02.` };
  }
  if (volume != null && Math.abs(volume) > MAX_BOOLEAN_VOLUME) {
    return { ...base, accepted: false, verdict: "rejected", reason: `Boolean overlap ${volume.toFixed(3)} exceeds the seating sliver.` };
  }
  return { ...base, accepted: true, verdict: verdictOf(measured.residualGap), reason: null };
}

export function validatePose(host: ArchetypeMesh, guest: ArchetypeMesh, pose: Skill6Pose, spec: EnvelopeSpec): EnvelopeReading {
  const home = poseWithBasis(0, false, IDENTITY, [0, 0, 0]);
  return finishReading(spec, pose, measureEnvelope(host, guest, home, pose), scanCrossings(host, guest, home, pose), null);
}

export function validateSpec(host: ArchetypeMesh, guest: ArchetypeMesh, spec: EnvelopeSpec): EnvelopeReading {
  return validatePose(host, guest, envelopePose(host, guest, spec), spec);
}

export async function validateSpecVolume(host: ArchetypeMesh, guest: ArchetypeMesh, spec: EnvelopeSpec): Promise<EnvelopeReading> {
  const reading = validateSpec(host, guest, spec);
  if (!reading.accepted) return reading;
  const home = poseWithBasis(0, false, IDENTITY, [0, 0, 0]);
  const volume = await poseOverlap(host, guest, home, reading.pose);
  return finishReading(spec, reading.pose, reading, { count: reading.crossingCount, deepest: reading.deepestCrossing }, volume);
}

function gridSpecs(mirrorX: boolean): EnvelopeSpec[] {
  const specs: EnvelopeSpec[] = [];
  for (const yaw of ENVELOPE_GRID.yaws) {
    for (const pitch of ENVELOPE_GRID.pitches) {
      for (const roll of ENVELOPE_GRID.rolls) {
        for (const axis of ENVELOPE_GRID.axes) {
          specs.push({ yaw, pitch, roll, axis: axis.direction, axisName: axis.name, gap: ENVELOPE_GRID.gap, mirrorX });
        }
      }
    }
  }
  return specs;
}

export type DirectionStudy = {
  hostId: string;
  guestId: string;
  testedPoses: number;
  denseChecks: number;
  seconds: number;
  compatible: boolean;
  rejection: string | null;
  nearMiss: {
    pose: string;
    contactArea: number;
    residualGap: number | null;
    normalAlignment: number | null;
    deepestCrossing: number;
    reason: string | null;
  } | null;
  poses: EnvelopeReading[];
};

/** Documented yaw, pitch, roll, and axis grid. Reflection is tried on the strongest unmirrored orientations. */
export function studyDirection(host: ArchetypeMesh, guest: ArchetypeMesh): DirectionStudy {
  const started = Date.now();
  const ranked = gridSpecs(false)
    .map((spec) => ({ spec, score: cheapScore(host, guest, spec) }))
    .sort((left, right) => right.score - left.score);
  const mirrored = ranked.filter((item) => item.score >= 0).slice(0, 6).map((item) => ({ ...item.spec, mirrorX: true }));
  const chosen = new Map<string, EnvelopeSpec>();
  for (const item of ranked) {
    if (item.score < 0) break;
    if (!chosen.has(item.spec.axisName)) chosen.set(item.spec.axisName, item.spec);
  }
  for (const item of ranked) {
    if (item.score < 0 || chosen.size >= 8) break;
    chosen.set(describeSpec(item.spec), item.spec);
  }
  for (const spec of mirrored) chosen.set(describeSpec(spec), spec);
  const poses: EnvelopeReading[] = [];
  let nearMiss: DirectionStudy["nearMiss"] = null;
  let denseChecks = 0;
  for (const spec of chosen.values()) {
    denseChecks += 1;
    const reading = validateSpec(host, guest, spec);
    if (!reading.accepted) {
      if (!nearMiss || reading.contactArea > nearMiss.contactArea) {
        nearMiss = {
          pose: describeSpec(spec),
          contactArea: reading.contactArea,
          residualGap: reading.residualGap,
          normalAlignment: reading.normalAlignment,
          deepestCrossing: reading.deepestCrossing,
          reason: reading.reason,
        };
      }
      continue;
    }
    if (poses.length >= 8) continue;
    poses.push(reading);
  }
  poses.sort((left, right) => right.contactArea - left.contactArea);
  return {
    hostId: host.archetypeId,
    guestId: guest.archetypeId,
    testedPoses: ranked.length + mirrored.length,
    denseChecks,
    seconds: Math.round((Date.now() - started) / 1000),
    compatible: poses.length > 0,
    rejection: poses.length > 0 ? null : (nearMiss?.reason ?? "No orientation on this grid produced a coherent region inside the limits."),
    nearMiss: poses.length > 0 ? null : nearMiss,
    poses: poses.slice(0, 6),
  };
}

export async function studyDirectionVolume(host: ArchetypeMesh, guest: ArchetypeMesh): Promise<DirectionStudy> {
  const study = studyDirection(host, guest);
  const home = poseWithBasis(0, false, IDENTITY, [0, 0, 0]);
  const poses: EnvelopeReading[] = [];
  for (const reading of study.poses) {
    const volume = await poseOverlap(host, guest, home, reading.pose);
    const checked = finishReading(reading.spec, reading.pose, reading, { count: reading.crossingCount, deepest: reading.deepestCrossing }, volume);
    if (checked.accepted) poses.push(checked);
  }
  return {
    ...study,
    poses,
    compatible: poses.length > 0,
    rejection: poses.length > 0 ? null : (study.rejection ?? "Boolean overlap rejected the seated poses."),
  };
}
