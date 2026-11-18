/**
 * Experimental compatibility probe. It does not change the clustering catalog,
 * the rule-based search, or the acceptance thresholds.
 *
 * Run: npx tsx lib/skill6/compatibility-study.ts
 */
import { SKILL6_PARAMETERS, type Mat3, type Skill6Pose, type Vec3 } from "./contract";
import { aggregateRule } from "./aggregate";
import {
  add,
  applyBasis,
  applyPose,
  closestOnTriangle,
  crossingPenetration,
  cross,
  dot,
  length,
  multiplyBasis,
  poseOf,
  poseWithBasis,
  queryHash,
  readTriangle,
  rotationAbout,
  scale,
  sub,
} from "./geometry";
import { loadArchetypeMeshes, type ArchetypeMesh } from "./source";

type Sample = { point: Vec3; normal: Vec3; area: number };

type Reading = {
  strategy: string;
  yaw: number;
  pitch: number;
  roll: number;
  gap: number;
  axis: string;
  estimatedArea: number;
  largestRegion: number;
  regions: number;
  residual: number | null;
  minDistance: number | null;
  meanAlignment: number | null;
  deepCrossings: number;
  deepest: number | null;
  passesCurrentRule: boolean;
};

const PAIRS: [string, string][] = [
  ["flat-deep-plan", "inserted-horizontal-plate"],
  ["inserted-horizontal-plate", "inserted-horizontal-plate"],
  ["flat-deep-plan", "flat-deep-plan"],
  ["undulated", "inserted-horizontal-plate"],
  ["vertical-void", "open-hall"],
  ["stepped-amphitheater", "topographic-ground-field"],
  ["contained-room-within-volume", "linear-gallery"],
  ["void-edge", "terraced"],
];

const YAWS = [0, 90, 180, 270];
const PITCHES = [-40, 0, 40];
const ROLLS = [0, 90];
const AXES: { name: string; direction: Vec3 }[] = [
  { name: "+X", direction: [1, 0, 0] },
  { name: "-X", direction: [-1, 0, 0] },
  { name: "+Y", direction: [0, 1, 0] },
  { name: "-Y", direction: [0, -1, 0] },
  { name: "+Z", direction: [0, 0, 1] },
  { name: "-Z", direction: [0, 0, -1] },
];

function euler(yaw: number, pitch: number, roll: number): Mat3 {
  const aboutZ = rotationAbout([0, 0, 1], yaw * Math.PI / 180);
  const aboutX = rotationAbout([1, 0, 0], pitch * Math.PI / 180);
  const aboutY = rotationAbout([0, 1, 0], roll * Math.PI / 180);
  return multiplyBasis(aboutZ, multiplyBasis(aboutX, aboutY));
}

function surfaceSamples(mesh: ArchetypeMesh, target: number): Sample[] {
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
  return samples;
}

function percentile(values: number[], fraction: number): number {
  const sorted = values.slice().sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.floor((sorted.length - 1) * fraction)));
  return sorted[index] ?? 0;
}

function componentsOf(hits: { guest: Vec3; area: number; gap: number }[]): { regions: number; largest: number; residual: number | null } {
  if (hits.length === 0) return { regions: 0, largest: 0, residual: null };
  const parent = hits.map((_, index) => index);
  const find = (index: number): number => {
    let root = index;
    while (parent[root] !== root) root = parent[root];
    parent[index] = root;
    return root;
  };
  for (let left = 0; left < hits.length; left += 1) {
    for (let right = left + 1; right < hits.length; right += 1) {
      const span = Math.hypot(
        hits[left].guest[0] - hits[right].guest[0],
        hits[left].guest[1] - hits[right].guest[1],
        hits[left].guest[2] - hits[right].guest[2],
      );
      if (span <= 1.6) parent[find(right)] = find(left);
    }
  }
  const groups = new Map<number, { area: number; residual: number }>();
  for (let index = 0; index < hits.length; index += 1) {
    const root = find(index);
    const group = groups.get(root) ?? { area: 0, residual: 0 };
    group.area += hits[index].area;
    group.residual = Math.max(group.residual, hits[index].gap);
    groups.set(root, group);
  }
  let largest = 0;
  let residual: number | null = null;
  let regions = 0;
  for (const group of groups.values()) {
    if (group.area >= 0.4) regions += 1;
    if (group.area > largest) {
      largest = group.area;
      residual = group.residual;
    }
  }
  return { regions, largest, residual };
}

function nearest(host: ArchetypeMesh, local: Vec3): { distance: number; normal: Vec3 } | null {
  const triangles = queryHash(host.hash, local, 0.7);
  let best: { distance: number; normal: Vec3 } | null = null;
  for (const triangle of triangles) {
    const [a, b, c] = readTriangle(host.positions, host.indices, triangle);
    const point = closestOnTriangle(local, a, b, c);
    const distance = length(sub(local, point));
    if (best && distance >= best.distance) continue;
    const raw = cross(sub(b, a), sub(c, a));
    const span = length(raw);
    best = { distance, normal: span > 1e-8 ? scale(raw, 1 / span) : [0, 0, 1] };
  }
  return best;
}

function deepCrossings(host: ArchetypeMesh, guest: ArchetypeMesh, pose: Skill6Pose, target = 900): { count: number; deepest: number | null } {
  const stride = Math.max(1, Math.floor(guest.triangles / target));
  let count = 0;
  let deepest: number | null = null;
  for (let triangle = 0; triangle < guest.triangles; triangle += stride) {
    const [a, b, c] = readTriangle(guest.positions, guest.indices, triangle);
    const worldA = applyPose(pose, a);
    const worldB = applyPose(pose, b);
    const worldC = applyPose(pose, c);
    const center: Vec3 = [
      (worldA[0] + worldB[0] + worldC[0]) / 3,
      (worldA[1] + worldB[1] + worldC[1]) / 3,
      (worldA[2] + worldB[2] + worldC[2]) / 3,
    ];
    for (const other of queryHash(host.hash, center, 0.8)) {
      const [d, e, f] = readTriangle(host.positions, host.indices, other);
      const depth = crossingPenetration(worldA, worldB, worldC, d, e, f);
      if (depth <= SKILL6_PARAMETERS.maxPenetration) continue;
      count += 1;
      if (deepest == null || depth > deepest) deepest = depth;
      if (count >= 40) return { count, deepest };
    }
  }
  return { count, deepest };
}

function measurePose(
  host: ArchetypeMesh,
  guest: ArchetypeMesh,
  guestSamples: Sample[],
  basis: Mat3,
  translation: Vec3,
  meta: Omit<Reading, "estimatedArea" | "largestRegion" | "regions" | "residual" | "minDistance" | "meanAlignment" | "deepCrossings" | "deepest" | "passesCurrentRule">,
): Reading {
  const pose = poseWithBasis(0, false, basis, translation);
  const hits: { guest: Vec3; area: number; gap: number; alignment: number }[] = [];
  let minDistance: number | null = null;
  for (const sample of guestSamples) {
    const world = add(applyBasis(basis, sample.point), translation);
    const found = nearest(host, world);
    if (!found) continue;
    if (minDistance == null || found.distance < minDistance) minDistance = found.distance;
    if (found.distance > SKILL6_PARAMETERS.contactTolerance) continue;
    const guestNormal = applyBasis(basis, sample.normal);
    const alignment = dot(found.normal, guestNormal);
    if (alignment > -0.5) continue;
    hits.push({ guest: world, area: sample.area, gap: found.distance, alignment });
  }
  const grouped = componentsOf(hits);
  const alignment = hits.length > 0 ? hits.reduce((sum, hit) => sum + hit.alignment * hit.area, 0) / hits.reduce((sum, hit) => sum + hit.area, 0) : null;
  const promising = grouped.largest >= SKILL6_PARAMETERS.minContactArea * 0.75;
  const crossing = promising ? deepCrossings(host, guest, pose) : { count: 0, deepest: null };
  const passes = grouped.regions === 1
    && grouped.largest >= SKILL6_PARAMETERS.minContactArea
    && grouped.residual != null
    && grouped.residual <= SKILL6_PARAMETERS.contactTolerance
    && alignment != null
    && alignment <= -SKILL6_PARAMETERS.normalOpposition
    && crossing.count === 0;
  return {
    ...meta,
    estimatedArea: grouped.largest,
    largestRegion: grouped.largest,
    regions: grouped.regions,
    residual: grouped.residual,
    minDistance,
    meanAlignment: alignment,
    deepCrossings: crossing.count,
    deepest: crossing.deepest,
    passesCurrentRule: passes,
  };
}

function seat(
  hostSamples: Sample[],
  guestSamples: Sample[],
  basis: Mat3,
  direction: Vec3,
  gap: number,
): Vec3 {
  const hostDots = hostSamples.map((sample) => dot(sample.point, direction));
  const guestDots = guestSamples.map((sample) => dot(applyBasis(basis, sample.point), direction));
  const hostFront = percentile(hostDots, 0.9);
  const guestBack = percentile(guestDots, 0.1);
  return scale(direction, hostFront - guestBack + gap);
}

function better(current: Reading | null, next: Reading): boolean {
  if (!current) return true;
  if (next.passesCurrentRule !== current.passesCurrentRule) return next.passesCurrentRule;
  if (next.deepCrossings === 0 && current.deepCrossings > 0 && next.largestRegion > 1) return true;
  if (current.deepCrossings === 0 && next.deepCrossings > 0) return false;
  return next.largestRegion - next.deepCrossings * 0.05 > current.largestRegion - current.deepCrossings * 0.05;
}

function searchPair(host: ArchetypeMesh, guest: ArchetypeMesh, hostSamples: Sample[], guestSamples: Sample[]) {
  const support: Reading[] = [];
  const nest: Reading[] = [];
  let bestSupport: Reading | null = null;
  let bestNest: Reading | null = null;
  let bestClear: Reading | null = null;
  for (const yaw of YAWS) {
    for (const pitch of PITCHES) {
      for (const roll of ROLLS) {
        const basis = euler(yaw, pitch, roll);
        for (const axis of AXES) {
          const supportTranslation = seat(hostSamples, guestSamples, basis, axis.direction, 0.1);
          const supportReading = measurePose(host, guest, guestSamples, basis, supportTranslation, {
            strategy: "support-band",
            yaw, pitch, roll, gap: 0.1, axis: axis.name,
          });
          if (better(bestSupport, supportReading)) bestSupport = supportReading;
          if (supportReading.passesCurrentRule || (supportReading.largestRegion >= 3 && supportReading.deepCrossings === 0)) {
            support.push(supportReading);
          }
          if (supportReading.deepCrossings === 0 && supportReading.largestRegion > (bestClear?.largestRegion ?? -1)) bestClear = supportReading;
          const nestThis = pitch === 0 && roll === 0 && (yaw === 0 || yaw === 90);
          if (!nestThis) continue;
          const nestTranslation = seat(hostSamples, guestSamples, basis, axis.direction, -0.12);
          const nestReading = measurePose(host, guest, guestSamples, basis, nestTranslation, {
            strategy: "nest-band",
            yaw, pitch, roll, gap: -0.12, axis: axis.name,
          });
          if (better(bestNest, nestReading)) bestNest = nestReading;
          if (nestReading.passesCurrentRule || (nestReading.deepCrossings === 0 && nestReading.largestRegion >= 3)) nest.push(nestReading);
        }
      }
    }
  }
  const planar = aggregateRule([host, guest], { id: `${host.archetypeId}__${guest.archetypeId}`, seed: 11, tiles: 2, attemptsPerTile: 1 });
  return { bestSupport, bestNest, bestClear, supportHits: support.length, nestHits: nest.length, planar };
}

function confirmPose(host: ArchetypeMesh, guest: ArchetypeMesh, reading: Reading | null) {
  if (!reading) return null;
  const basis = euler(reading.yaw, reading.pitch, reading.roll);
  const translation = seat(
    surfaceSamples(host, 180),
    surfaceSamples(guest, 180),
    basis,
    AXES.find((axis) => axis.name === reading.axis)?.direction ?? [1, 0, 0],
    reading.gap,
  );
  const pose = poseWithBasis(0, false, basis, translation);
  const hits: { guest: Vec3; area: number; gap: number; alignment: number }[] = [];
  let minDistance: number | null = null;
  const stride = Math.max(1, Math.floor(guest.triangles / 2500));
  for (let triangle = 0; triangle < guest.triangles; triangle += stride) {
    const [a, b, c] = readTriangle(guest.positions, guest.indices, triangle);
    const raw = cross(sub(b, a), sub(c, a));
    const span = length(raw);
    if (span < 1e-8) continue;
    const local: Vec3 = [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3, (a[2] + b[2] + c[2]) / 3];
    const world = add(applyBasis(basis, local), translation);
    const found = nearest(host, world);
    if (!found) continue;
    if (minDistance == null || found.distance < minDistance) minDistance = found.distance;
    if (found.distance > SKILL6_PARAMETERS.contactTolerance) continue;
    const alignment = dot(found.normal, applyBasis(basis, scale(raw, 1 / span)));
    if (alignment > -0.5) continue;
    hits.push({ guest: world, area: span * 0.5 * stride, gap: found.distance, alignment });
  }
  const grouped = componentsOf(hits);
  const alignment = hits.length > 0 ? hits.reduce((sum, hit) => sum + hit.alignment * hit.area, 0) / hits.reduce((sum, hit) => sum + hit.area, 0) : null;
  const crossing = deepCrossings(host, guest, pose, 4000);
  const passes = grouped.regions === 1
    && grouped.largest >= SKILL6_PARAMETERS.minContactArea
    && grouped.residual != null
    && grouped.residual <= SKILL6_PARAMETERS.contactTolerance
    && alignment != null
    && alignment <= -SKILL6_PARAMETERS.normalOpposition
    && crossing.count === 0;
  return {
    pose: reading.pose,
    largestRegion: round(grouped.largest),
    regions: grouped.regions,
    residual: round(grouped.residual, 3),
    minDistance: round(minDistance, 3),
    alignment: round(alignment, 3),
    deepCrossings: crossing.count,
    deepest: round(crossing.deepest, 3),
    passesCurrentRule: passes,
    samplesInBand: hits.length,
  };
}

function round(value: number | null | undefined, digits = 2): number | null {
  if (value == null || Number.isNaN(value)) return null;
  const scaleBy = 10 ** digits;
  return Math.round(value * scaleBy) / scaleBy;
}

function brief(reading: Reading | null) {
  if (!reading) return null;
  return {
    strategy: reading.strategy,
    pose: `${reading.axis} yaw ${reading.yaw} pitch ${reading.pitch} roll ${reading.roll} gap ${reading.gap}`,
    largestRegion: round(reading.largestRegion),
    regions: reading.regions,
    residual: round(reading.residual, 3),
    minDistance: round(reading.minDistance, 3),
    alignment: round(reading.meanAlignment, 3),
    deepCrossings: reading.deepCrossings,
    deepest: round(reading.deepest, 3),
    passesCurrentRule: reading.passesCurrentRule,
  };
}

const meshes = loadArchetypeMeshes();
const byId = new Map(meshes.map((mesh) => [mesh.archetypeId, mesh]));
const sampleCache = new Map<string, Sample[]>();
const started = Date.now();
const rows = PAIRS.map(([leftId, rightId]) => {
  const host = byId.get(leftId);
  const guest = byId.get(rightId);
  if (!host || !guest) return { pair: `${leftId} × ${rightId}`, missing: true };
  const hostSamples = sampleCache.get(host.archetypeId) ?? surfaceSamples(host, 180);
  const guestSamples = leftId === rightId ? hostSamples : (sampleCache.get(guest.archetypeId) ?? surfaceSamples(guest, 180));
  sampleCache.set(host.archetypeId, hostSamples);
  sampleCache.set(guest.archetypeId, guestSamples);
  const found = searchPair(host, guest, hostSamples, guestSamples);
  return {
    pair: `${leftId} × ${rightId}`,
    hostPads: host.patches.length,
    guestPads: guest.patches.length,
    planar: {
      status: found.planar.status,
      reason: found.planar.reason,
      area: found.planar.contacts[0]?.contactArea ?? null,
      residual: found.planar.contacts[0]?.residualGap ?? null,
      verdict: found.planar.contacts[0]?.verdict ?? null,
    },
    support: brief(found.bestSupport),
    supportConfirmed: confirmPose(host, guest, found.bestSupport),
    clearest: brief(found.bestClear),
    clearestConfirmed: confirmPose(host, guest, found.bestClear),
    nest: brief(found.bestNest),
    supportCandidates: found.supportHits,
    nestCandidates: found.nestHits,
  };
});

console.log(JSON.stringify({
  seconds: Math.round((Date.now() - started) / 1000),
  thresholds: {
    contactTolerance: SKILL6_PARAMETERS.contactTolerance,
    minContactArea: SKILL6_PARAMETERS.minContactArea,
    maxPenetration: SKILL6_PARAMETERS.maxPenetration,
    normalOpposition: SKILL6_PARAMETERS.normalOpposition,
  },
  grid: { yaws: YAWS, pitches: PITCHES, rolls: ROLLS, axes: AXES.map((axis) => axis.name) },
  rows,
}, null, 2));
