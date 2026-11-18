/**
 * Envelope growth with tangent slides and bounded backtracking.
 * rule-based-envelope-v1 stays in aggregate.ts and is not replaced.
 */
import {
  SKILL6_CONTRACT,
  SKILL6_COVERAGE_ALGORITHM,
  SKILL6_PARAMETERS,
  SKILL6_SHIFT_ALGORITHM,
  type ClusterRecord,
  type ClusterTile,
  type ContactRelation,
  type GrowthDirection,
  type SearchStats,
  type Skill6Algorithm,
  type Skill6Pose,
  type Vec3,
} from "./contract";
import type { KnownAttachment } from "./compatibility";
import {
  cheapPoseScore,
  composePose,
  measureEnvelope,
  reseatPose,
  scanCrossings,
  shiftOffsets,
  studyDirection,
  translatePose,
  validatePose,
} from "./envelope";
import {
  applyBasis,
  boundsOverlap,
  closestOnTriangle,
  cross,
  dot,
  invertPose,
  length,
  normalize,
  poseBounds,
  poseOf,
  queryHash,
  readTriangle,
  type Bounds,
  pointInsideMesh,
  scale,
  sub,
} from "./geometry";
import { connectedGroups, measureCluster } from "./metrics";
import type { ArchetypeMesh } from "./source";
import { guestWorldTriangles, placeSolid, scanPrepared, type PlacedSolid } from "./world-solid";

export type GrowOptions = {
  seed: number;
  tiles: number;
  id: string;
  compatibility?: { poses(hostId: string, guestId: string): KnownAttachment[] } | null;
  budget?: { evaluations: number; backtracks: number };
  /** Undefined keeps the v2 cap of 20. Null tries every stored pose at that depth. */
  triesPerDepth?: number | null;
  /** Undefined keeps the v2 shuffle cap of 72. Null keeps every pose. */
  choiceCap?: number | null;
  order?: "shuffle" | "axis" | "spread";
  collision?: "local" | "world";
  algorithm?: Skill6Algorithm;
  /** Undefined keeps every direction. When set, a guest must lie in one of these from its host. */
  directions?: readonly GrowthDirection[];
  /** When set, this archetype is the seed. Undefined keeps the seeded pick among the four most connected. */
  rootId?: string;
  /** Also try each stored pose reseated toward world ±X, ±Y, and +Z. The contact is measured again. */
  aims?: boolean;
  /** First keeps the first pose that passes. Scored compares the poses that pass in the depth window. */
  select?: "first" | "scored";
  /** Preferences for scored selection. None of these override a failed contact or collision. */
  weights?: PlacementWeights;
  /**
   * Experimental Spatial Organization ranking. Compact, branching, and vertical
   * reorder poses that already pass. They are not the finalized method.
   * Undefined keeps the baseline score.
   */
  organization?: "compact" | "branching" | "vertical" | "integrated";
  /**
   * Profile 2 scores the cluster that would result, and it can read atlas poses.
   * Profile 3 adds upright poses, dual-tile slides, and cohesion terms.
   * Undefined keeps the profile used by organization-v1.
   */
  profile?: 2 | 3;
  /** Accepted atlas poses. Each one is collision-checked and measured again on the cluster. */
  atlas?: { poses(hostId: string, guestId: string): KnownAttachment[] };
};

export type PlacementWeights = {
  contact: number;
  newDirection: number;
  newArchetype: number;
  branch: number;
  compact: number;
  upright: number;
  future: number;
  directionBias: Partial<Record<GrowthDirection, number>>;
};

export const PLACEMENT_WEIGHTS: PlacementWeights = {
  contact: 0.05,
  newDirection: 3,
  newArchetype: 2,
  branch: 2,
  compact: 0.04,
  upright: 2,
  future: 0.4,
  directionBias: {},
};

const DEFAULT_BUDGET = { evaluations: 160, backtracks: 14 };
const TRIES_PER_DEPTH = 20;

function mulberry32(seed: number) {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let next = state;
    next = Math.imul(next ^ (next >>> 15), next | 1);
    next ^= next + Math.imul(next ^ (next >>> 7), next | 61);
    return ((next ^ (next >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(items: readonly T[], random: () => number): T[] {
  const copy = items.slice();
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    const item = copy[index];
    copy[index] = copy[swap];
    copy[swap] = item;
  }
  return copy;
}

function attachmentNormal(hostMesh: ArchetypeMesh, hostPose: Skill6Pose, samples: readonly { host: Vec3 }[]): Vec3 | null {
  const sum: Vec3 = [0, 0, 0];
  let count = 0;
  for (const sample of samples) {
    const local = invertPose(hostPose, sample.host);
    let best: { distance: number; normal: Vec3 } | null = null;
    for (const triangle of queryHash(hostMesh.hash, local, 0.7)) {
      const [a, b, c] = readTriangle(hostMesh.positions, hostMesh.indices, triangle);
      const point = closestOnTriangle(local, a, b, c);
      const distance = length(sub(local, point));
      if (best && distance >= best.distance) continue;
      const raw = cross(sub(b, a), sub(c, a));
      const span = length(raw);
      best = { distance, normal: span > 1e-8 ? scale(raw, -1 / span) : [0, 0, 1] };
    }
    if (!best) continue;
    const world = applyBasis(hostPose.basis, best.normal);
    sum[0] += world[0];
    sum[1] += world[1];
    sum[2] += world[2];
    count += 1;
  }
  return count > 0 && length(sum) > 1e-6 ? normalize(sum) : null;
}

function poseToken(pose: Skill6Pose): string {
  return `${pose.basis.map((value) => value.toFixed(3)).join(",")}|${pose.translation.map((value) => value.toFixed(2)).join(",")}`;
}

function scoreOrganizationV2(
  strategy: "compact" | "branching" | "vertical" | "integrated",
  input: {
    direction: GrowthDirection;
    contactArea: number;
    neighbors: number;
    up: number;
    hostId: string;
    guestBox: Bounds;
    hostBox: Bounds;
    sampleZ: number;
    sampleCount: number;
    cluster: { extent: Vec3; longest: number; volume: number };
    beforeLongest: number;
    beforePlan: number;
    beforeTop: number;
    usedDirections: ReadonlySet<string>;
    children: ReadonlyMap<string, number>;
    hostDepth: number;
    occupancy: number;
    hostsWithChildren: number;
  },
): number {
  if (strategy === "integrated") {
    return scoreOrganizationV2("compact", input) + scoreOrganizationV2("branching", input) + scoreOrganizationV2("vertical", input);
  }
  const contact = Math.min(input.contactArea, 40) * 0.01;
  const extra = Math.max(0, input.neighbors - 1);
  if (strategy === "compact") {
    const sprawl = Math.max(0, input.cluster.longest - input.beforeLongest);
    return extra * 10 + input.occupancy * 18 - input.cluster.volume / 10000 - sprawl * 0.45 + contact;
  }
  if (strategy === "branching") {
    const horizontal = input.direction !== "+Z" && input.direction !== "-Z";
    const fresh = horizontal && !input.usedDirections.has(input.direction);
    const repeated = horizontal && input.usedDirections.has(input.direction);
    const childrenNow = input.children.get(input.hostId) ?? 0;
    const plan = Math.hypot(input.cluster.extent[0], input.cluster.extent[1]);
    return (fresh ? 10 : 0)
      + (repeated ? -6 : 0)
      + (childrenNow >= 1 ? 8 : 0)
      + (childrenNow === 0 ? 5 : 0)
      + input.hostsWithChildren * 0.4
      + Math.max(0, plan - input.beforePlan) * 0.12
      - input.hostDepth * 2
      + extra * 0.2
      + contact;
  }
  const onTop = input.guestBox.min[2] >= input.hostBox.max[2] - SKILL6_PARAMETERS.contactTolerance
    && input.guestBox.min[2] <= input.hostBox.max[2] + SKILL6_PARAMETERS.contactTolerance;
  const supported = input.direction === "+Z" && onTop && (input.sampleCount === 0 || input.sampleZ >= input.hostBox.max[2] - 4);
  const rise = Math.max(0, input.guestBox.max[2] - input.beforeTop);
  const tilt = input.up < 0.7 ? (0.7 - input.up) * 12 : 0;
  return (supported ? 16 : 0) + rise * 0.45 + input.up * 5 - tilt - (input.direction === "+Z" ? 0 : 4) + contact;
}

function passes(reading: { contactArea: number; coherentRegions: number; residualGap: number | null; normalAlignment: number | null }) {
  return reading.coherentRegions === 1
    && reading.contactArea >= SKILL6_PARAMETERS.minContactArea
    && reading.residualGap != null
    && reading.residualGap <= SKILL6_PARAMETERS.contactTolerance
    && reading.normalAlignment != null
    && reading.normalAlignment <= -SKILL6_PARAMETERS.normalOpposition;
}

function centroid(mesh: ArchetypeMesh, pose: Skill6Pose): Vec3 {
  let x = 0;
  let y = 0;
  let z = 0;
  const count = mesh.positions.length / 3 || 1;
  for (let index = 0; index < mesh.positions.length; index += 3) {
    x += mesh.positions[index];
    y += mesh.positions[index + 1];
    z += mesh.positions[index + 2];
  }
  const local: Vec3 = [x / count, y / count, z / count];
  return [
    pose.basis[0] * local[0] + pose.basis[3] * local[1] + pose.basis[6] * local[2] + pose.translation[0],
    pose.basis[1] * local[0] + pose.basis[4] * local[1] + pose.basis[7] * local[2] + pose.translation[1],
    pose.basis[2] * local[0] + pose.basis[5] * local[1] + pose.basis[8] * local[2] + pose.translation[2],
  ];
}

/** The axis where the two posed bounds meet, signed toward the guest. Not the centroid. */
export function growthDirection(hostMesh: ArchetypeMesh, hostPose: Skill6Pose, guestMesh: ArchetypeMesh, guestPose: Skill6Pose): GrowthDirection {
  return directionOfBounds(poseBounds(hostMesh.tight, hostPose), poseBounds(guestMesh.tight, guestPose));
}

function directionOfBounds(host: Bounds, guest: Bounds): GrowthDirection {
  const overlap = (axis: 0 | 1 | 2) => Math.min(host.max[axis], guest.max[axis]) - Math.max(host.min[axis], guest.min[axis]);
  let axis: 0 | 1 | 2 = 0;
  if (overlap(1) < overlap(0)) axis = 1;
  if (overlap(2) < overlap(axis)) axis = 2;
  const guestMid = (guest.min[axis] + guest.max[axis]) / 2;
  const hostMid = (host.min[axis] + host.max[axis]) / 2;
  return `${guestMid >= hostMid ? "+" : "-"}${"XYZ"[axis]}` as GrowthDirection;
}

/**
 * Why a posed guest is not an allowed growth step.
 * Downward means the guest's body center sits in the host's lower quarter while its base clears the contact tolerance.
 * A corner that dips less than that, from a rotation, is kept.
 */
export function growthRejection(host: Bounds, guest: Bounds, allowed: readonly GrowthDirection[]): string | null {
  if (guest.min[2] < -1e-3) return "The guest passes below Z = 0.";
  const direction = directionOfBounds(host, guest);
  if (!allowed.includes(direction)) return `The meeting face is ${direction}.`;
  const hostHeight = Math.max(1e-6, host.max[2] - host.min[2]);
  const guestMid = (guest.min[2] + guest.max[2]) / 2;
  const hostLowerQuarter = host.min[2] + hostHeight * 0.25;
  if (guest.min[2] < host.min[2] - SKILL6_PARAMETERS.contactTolerance && guestMid < hostLowerQuarter) return "The guest drops below its host.";
  if (guest.min[2] - host.max[2] > SKILL6_PARAMETERS.contactTolerance) return "The guest floats above its host.";
  return null;
}

function knownFromReading(reading: ReturnType<typeof validatePose>, note: string): KnownAttachment | null {
  if (!reading.accepted || reading.verdict === "rejected") return null;
  return {
    pose: reading.pose,
    contactArea: reading.contactArea,
    coherentRegions: reading.coherentRegions,
    residualGap: reading.residualGap,
    minSurfaceDistance: reading.minSurfaceDistance,
    normalAlignment: reading.normalAlignment ?? 0,
    deepestCrossing: reading.deepestCrossing,
    overlapVolume: reading.overlapVolume,
    verdict: reading.verdict,
    note,
  };
}

function livePoses(host: ArchetypeMesh, guest: ArchetypeMesh): KnownAttachment[] {
  const found: KnownAttachment[] = [];
  const seen = new Set<string>();
  const push = (pose: KnownAttachment | null) => {
    if (!pose) return;
    const key = pose.pose.translation.map((value) => value.toFixed(1)).join(",");
    if (seen.has(`${pose.note}|${key}`)) return;
    seen.add(`${pose.note}|${key}`);
    found.push(pose);
  };
  for (const reading of studyDirection(host, guest).poses) {
    const note = `${reading.spec.axisName} yaw ${reading.spec.yaw} pitch ${reading.spec.pitch} roll ${reading.spec.roll} gap ${reading.spec.gap}`;
    push(knownFromReading(reading, note));
    const slides = shiftOffsets(reading.spec.axis)
      .map((offset) => ({ offset, pose: translatePose(reading.pose, offset), score: cheapPoseScore(host, guest, translatePose(reading.pose, offset)) }))
      .filter((item) => item.score >= 3.2)
      .sort((left, right) => right.score - left.score)
      .slice(0, 3);
    for (const slide of slides) {
      push(knownFromReading(validatePose(host, guest, slide.pose, reading.spec), `${note} shift ${slide.offset.map((value) => value.toFixed(1)).join(",")}`));
    }
  }
  return found;
}

type Choice = { hostIndex: number; guestId: string; poseIndex: number };

const WORLD_AIMS: { name: GrowthDirection; axis: Vec3 }[] = [
  { name: "+X", axis: [1, 0, 0] },
  { name: "-X", axis: [-1, 0, 0] },
  { name: "+Y", axis: [0, 1, 0] },
  { name: "-Y", axis: [0, -1, 0] },
  { name: "+Z", axis: [0, 0, 1] },
];

function basisTranspose(basis: Skill6Pose["basis"], world: Vec3): Vec3 {
  return applyBasis([basis[0], basis[3], basis[6], basis[1], basis[4], basis[7], basis[2], basis[5], basis[8]], world);
}

function recordOf(
  id: string,
  seed: number,
  status: ClusterRecord["status"],
  reason: string | null,
  tiles: ClusterTile[],
  contacts: ContactRelation[],
  byId: Map<string, ArchetypeMesh>,
  search: SearchStats,
  algorithm: Skill6Algorithm = SKILL6_SHIFT_ALGORITHM,
): ClusterRecord {
  const groups = tiles.length > 0 ? connectedGroups(tiles, contacts) : [];
  const metrics = tiles.length > 0 ? measureCluster(tiles, contacts, byId) : null;
  return {
    contract: SKILL6_CONTRACT,
    id,
    status,
    reason,
    algorithm,
    seed,
    parameters: SKILL6_PARAMETERS,
    tiles,
    contacts,
    components: groups,
    metrics,
    search,
  };
}

function contactOf(
  hostId: string,
  guestId: string,
  hostMesh: ArchetypeMesh,
  guestMesh: ArchetypeMesh,
  hostPose: Skill6Pose,
  world: Skill6Pose,
  known: KnownAttachment,
  measured: ReturnType<typeof measureEnvelope>,
  deepest: number,
): ContactRelation {
  const verdict = measured.residualGap != null && measured.residualGap <= SKILL6_PARAMETERS.targetGap ? "surface-contact" as const : "near-contact" as const;
  const origin = measured.samples[0];
  const offset = origin ? sub(origin.host, origin.guest) : [0, 0, 1] as Vec3;
  const span = length(offset) || 1;
  const hostNormal = scale(offset, 1 / span);
  return {
    hostId,
    guestId,
    hostPatch: "envelope",
    guestPatch: "envelope",
    verdict,
    minSurfaceDistance: measured.minSurfaceDistance,
    residualGap: measured.residualGap,
    contactArea: measured.contactArea,
    coherentRegions: measured.coherentRegions,
    normalAlignment: measured.normalAlignment ?? known.normalAlignment,
    hostNormal,
    guestNormal: scale(hostNormal, -1),
    samples: measured.samples,
    rejected: [],
    intersectingTriangles: 0,
    deepestCrossing: deepest,
    overlapVolume: known.overlapVolume,
    attachment: "envelope",
    searchNote: known.note,
    registrationOverlap: false,
    tightBox: "touch",
    tolerance: SKILL6_PARAMETERS.contactTolerance,
  };
}

/** Translated envelope growth. A failed branch can be undone until the budget stops. */
export function aggregateTranslated(meshes: readonly ArchetypeMesh[], options: GrowOptions): ClusterRecord {
  const started = Date.now();
  const budget = options.budget ?? DEFAULT_BUDGET;
  const search: SearchStats = {
    evaluations: 0,
    acceptedPoses: 0,
    backtracks: 0,
    milliseconds: 0,
    exhausted: false,
    truncated: false,
    untried: 0,
    geometricRejections: 0,
    rejectionCounts: { intersection: 0, containment: 0, contact: 0 },
    depthLimit: options.triesPerDepth === undefined ? TRIES_PER_DEPTH : options.triesPerDepth,
    stop: "geometric",
    ...(options.directions ? { directionRejections: 0 } : {}),
    ...(options.organization ? { organization: options.organization } : {}),
    ...(options.profile === 2 || options.profile === 3 ? { profile: options.profile, passedDirections: {}, atlasAccepted: 0, uprightAccepted: 0, dualAccepted: 0 } : {}),
  };
  const algorithm = options.algorithm ?? SKILL6_SHIFT_ALGORITHM;
  const order = options.order ?? "shuffle";
  const collision = options.collision ?? "local";
  const choiceCap = options.choiceCap === undefined ? 72 : options.choiceCap;
  const finish = (status: ClusterRecord["status"], reason: string | null, tiles: ClusterTile[], contacts: ContactRelation[], byId: Map<string, ArchetypeMesh>) => {
    search.milliseconds = Date.now() - started;
    return recordOf(options.id, options.seed, status, reason, tiles, contacts, byId, search, algorithm);
  };
  if (meshes.length === 0 || options.tiles < 2) {
    return finish("unsuccessful", "A cluster needs two tiles.", [], [], new Map());
  }
  const byId = new Map(meshes.map((mesh) => [mesh.archetypeId, mesh]));
  const memory = new Map<string, KnownAttachment[]>();
  const liveAllowed = meshes.every((mesh) => mesh.triangles < 2000);
  const candidates = (hostId: string, guestId: string): KnownAttachment[] => {
    if (options.compatibility && !options.atlas) return options.compatibility.poses(hostId, guestId);
    const key = `${options.atlas ? "atlas|" : ""}${hostId}|${guestId}`;
    const stored = memory.get(key);
    if (stored) return stored;
    const host = byId.get(hostId);
    const guest = byId.get(guestId);
    const library = options.compatibility
      ? options.compatibility.poses(hostId, guestId)
      : host && guest && liveAllowed ? livePoses(host, guest) : [];
    if (!options.atlas) {
      memory.set(key, library);
      return library;
    }
    const seen = new Set(library.map((item) => poseToken(item.pose)));
    const merged = library.slice();
    for (const pose of options.atlas.poses(hostId, guestId)) {
      const token = poseToken(pose.pose);
      if (seen.has(token)) continue;
      seen.add(token);
      merged.push(pose);
    }
    memory.set(key, merged);
    return merged;
  };
  const guestsFor = (hostId: string) => meshes.filter((mesh) => candidates(hostId, mesh.archetypeId).length > 0);
  const roots = meshes.filter((mesh) => guestsFor(mesh.archetypeId).length > 0)
    .slice()
    .sort((left, right) => guestsFor(right.archetypeId).length - guestsFor(left.archetypeId).length);
  if (roots.length === 0) {
    search.milliseconds = Date.now() - started;
    return finish("unsuccessful", "No verified compatible archetype pair is available for translated growth.", [], [], byId);
  }
  const random = mulberry32(options.seed);
  const pinned = options.rootId ? roots.find((mesh) => mesh.archetypeId === options.rootId) : undefined;
  if (options.rootId && !pinned) {
    search.milliseconds = Date.now() - started;
    return finish("unsuccessful", `${options.rootId} has no verified guest in the pose library.`, [], [], byId);
  }
  const rootMesh = pinned ?? roots[Math.floor(random() * Math.min(4, roots.length))];
  const home = poseOf(0, false, [0, 0, 0]);
  const rootLow = options.directions ? poseBounds(rootMesh.tight, home).min[2] : 0;
  const root: ClusterTile = {
    instanceId: "t00",
    archetypeId: rootMesh.archetypeId,
    moduleId: rootMesh.moduleId,
    typologyId: rootMesh.typologyId,
    name: rootMesh.name,
    pose: rootLow < 0 ? poseOf(0, false, [0, 0, -rootLow]) : home,
  };

  const poseCache = new Map<string, KnownAttachment[]>();
  const posesFor = (host: ClusterTile, guestId: string): KnownAttachment[] => {
    const key = `${host.instanceId}|${host.pose.basis.join(",")}|${host.pose.translation.join(",")}|${guestId}|${options.aims ? "aim" : "base"}`;
    const stored = poseCache.get(key);
    if (stored) return stored;
    const base = candidates(host.archetypeId, guestId);
    if (!options.aims) {
      poseCache.set(key, base);
      return base;
    }
    const hostMesh = byId.get(host.archetypeId);
    const guestMesh = byId.get(guestId);
    if (!hostMesh || !guestMesh) return base;
    const expanded = base.slice();
    for (const known of base) {
      const span = Math.hypot(known.pose.translation[0], known.pose.translation[1], known.pose.translation[2]);
      for (const aim of WORLD_AIMS) {
        const local = basisTranspose(host.pose.basis, aim.axis);
        const localSpan = Math.hypot(local[0], local[1], local[2]) || 1;
        const aligned = span < 1e-6 ? 0 : (known.pose.translation[0] * local[0] + known.pose.translation[1] * local[1] + known.pose.translation[2] * local[2]) / (span * localSpan);
        if (aligned > 0.98) continue;
        expanded.push({ ...known, pose: reseatPose(hostMesh, guestMesh, known.pose, local), note: `${aim.name} reseat ${known.note}` });
      }
    }
    poseCache.set(key, expanded);
    return expanded;
  };

  type Ready = { choice: Choice; known: KnownAttachment; world: Skill6Pose; guestMesh: ArchetypeMesh; hostMesh: ArchetypeMesh; host: ClusterTile; measured: ReturnType<typeof measureEnvelope>; deepest: number; direction: GrowthDirection; neighbors: number; score: number };
  type Frame = { tiles: ClusterTile[]; contacts: ContactRelation[]; solids: PlacedSolid[]; options: Choice[]; index: number; passed?: Ready[]; ready?: Ready[]; readyIndex?: number };
  const axisOf = (note: string) => {
    const token = note.split(" ")[0];
    return token === "+Z" || token === "-Z" || token === "+X" || token === "-X" || token === "+Y" || token === "-Y" ? token : "other";
  };
  const choicesFor = (tiles: readonly ClusterTile[], contacts: readonly ContactRelation[], salt: number): Choice[] => {
    const list: Choice[] = [];
    tiles.forEach((tile, hostIndex) => {
      for (const guest of guestsFor(tile.archetypeId)) {
        const poses = posesFor(tile, guest.archetypeId);
        for (let poseIndex = 0; poseIndex < poses.length; poseIndex += 1) list.push({ hostIndex, guestId: guest.archetypeId, poseIndex });
      }
    });
    const random = mulberry32(options.seed + salt * 1009);
    if (order === "shuffle") {
      const shuffled = shuffle(list, random);
      return choiceCap == null ? shuffled : shuffled.slice(0, choiceCap);
    }
    const lanes = new Map<string, Choice[]>();
    for (const choice of shuffle(list, random)) {
      const hostTile = tiles[choice.hostIndex];
      const pose = posesFor(hostTile, choice.guestId)[choice.poseIndex];
      const hostMesh = byId.get(hostTile.archetypeId);
      const guestMesh = byId.get(choice.guestId);
      const axis = options.aims && pose && hostMesh && guestMesh
        ? directionOfBounds(poseBounds(hostMesh.tight, hostTile.pose), poseBounds(guestMesh.tight, composePose(hostTile.pose, pose.pose)))
        : axisOf(pose?.note ?? "");
      const lane = lanes.get(axis) ?? [];
      lane.push(choice);
      lanes.set(axis, lane);
    }
    if (options.aims) {
      for (const lane of lanes.values()) {
        lane.sort((left, right) => {
          const leftNote = posesFor(tiles[left.hostIndex], left.guestId)[left.poseIndex]?.note ?? "";
          const rightNote = posesFor(tiles[right.hostIndex], right.guestId)[right.poseIndex]?.note ?? "";
          return Number(leftNote.includes("reseat")) - Number(rightNote.includes("reseat"));
        });
      }
    }
    const keys = (options.aims ? ["+Z", "+Y", "-Y", "+X", "-X", "-Z", "other"] : ["+Z", "-Z", "+X", "-X", "+Y", "-Y", "other"]).filter((key) => lanes.has(key));
    const ordered: Choice[] = [];
    let pending = true;
    while (pending) {
      pending = false;
      for (const key of keys) {
        const lane = lanes.get(key);
        const next = lane?.shift();
        if (!next) continue;
        ordered.push(next);
        pending = true;
      }
    }
    const capped = choiceCap == null ? ordered : ordered.slice(0, choiceCap);
    const cover = (list: Choice[]) => {
      if (options.profile !== 2 && options.profile !== 3) return list;
      const lanes = new Map<string, Choice[]>();
      for (const choice of list) {
        const hostTile = tiles[choice.hostIndex];
        const pose = posesFor(hostTile, choice.guestId)[choice.poseIndex];
        const hostMesh = byId.get(hostTile.archetypeId);
        const guestMesh = byId.get(choice.guestId);
        const axis = pose && hostMesh && guestMesh
          ? directionOfBounds(poseBounds(hostMesh.tight, hostTile.pose), poseBounds(guestMesh.tight, composePose(hostTile.pose, pose.pose)))
          : "other";
        const laneKey = `${hostTile.instanceId}|${axis}|${choice.guestId}`;
        const lane = lanes.get(laneKey) ?? [];
        lane.push(choice);
        lanes.set(laneKey, lane);
      }
      const keys = [...lanes.keys()].sort();
      const covered: Choice[] = [];
      let pending = true;
      while (pending) {
        pending = false;
        for (const laneKey of keys) {
          const next = lanes.get(laneKey)?.shift();
          if (!next) continue;
          covered.push(next);
          pending = true;
        }
      }
      return covered;
    };
    if (order !== "spread" || options.aims) return cover(capped);
    const children = new Map<string, number>();
    for (const contact of contacts) children.set(contact.hostId, (children.get(contact.hostId) ?? 0) + 1);
    const lastAxis = axisOf(contacts[contacts.length - 1]?.searchNote ?? "");
    const rank = (choice: Choice) => {
      const pose = posesFor(tiles[choice.hostIndex], choice.guestId)[choice.poseIndex];
      const axis = axisOf(pose?.note ?? "");
      const inverted = pose && pose.pose.basis[8] < 0 ? 1 : 0;
      return [(children.get(tiles[choice.hostIndex].instanceId) ?? 0), inverted, axis === lastAxis ? 1 : 0];
    };
    return cover(capped.slice().sort((left, right) => {
      const a = rank(left);
      const b = rank(right);
      return a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
    }));
  };

  const rootSolid = collision === "world" ? placeSolid(rootMesh, root.pose) : null;
  const stack: Frame[] = [{ tiles: [root], contacts: [], solids: rootSolid ? [rootSolid] : [], options: choicesFor([root], [], 1), index: 0 }];
  let deepest: Frame = stack[0];
  let blockedReason = "";

  const blockedBy = (tiles: readonly ClusterTile[], solids: readonly PlacedSolid[], hostIndex: number, guest: ArchetypeMesh, world: Skill6Pose) => {
    const prepared = collision === "world" ? guestWorldTriangles(guest, world) : null;
    let deepestHit = 0;
    let count = 0;
    for (let index = 0; index < tiles.length; index += 1) {
      const mesh = byId.get(tiles[index].archetypeId);
      if (!mesh) continue;
      const hostBox = poseBounds(mesh.tight, tiles[index].pose);
      const guestBox = poseBounds(guest.tight, world);
      if (!boundsOverlap(hostBox, guestBox, 0.02)) continue;
      const hit = collision === "world" && solids[index] && prepared
        ? scanPrepared(solids[index], prepared, guest.triangles)
        : scanCrossings(mesh, guest, tiles[index].pose, world);
      count += hit.count;
      if (hit.deepest > deepestHit) deepestHit = hit.deepest;
      if (hit.count > SKILL6_PARAMETERS.maxIntersectingTriangles) {
        return { blocked: true, deepest: deepestHit, count, contained: false };
      }
      if (index === hostIndex) continue;
      const center = centroid(guest, world);
      const insideBox = center[0] >= hostBox.min[0] && center[0] <= hostBox.max[0]
        && center[1] >= hostBox.min[1] && center[1] <= hostBox.max[1]
        && center[2] >= hostBox.min[2] && center[2] <= hostBox.max[2];
      if (!insideBox) continue;
      if (pointInsideMesh(invertPose(tiles[index].pose, center), mesh.positions, mesh.indices, mesh.triangles)) {
        return { blocked: true, deepest: deepestHit, count, contained: true };
      }
    }
    return { blocked: false, deepest: deepestHit, count, contained: false };
  };

  while (stack.length > 0) {
    const frame = stack[stack.length - 1];
    if (frame.tiles.length >= options.tiles) break;
    if (search.evaluations >= budget.evaluations || search.backtracks >= budget.backtracks) {
      search.exhausted = true;
      search.stop = "exhausted";
      break;
    }
    if (options.select === "scored" && frame.ready) {
      const chosen = frame.ready[frame.readyIndex ?? 0];
      frame.readyIndex = (frame.readyIndex ?? 0) + 1;
      if (!chosen) {
        if (stack.length > 1) search.backtracks += 1;
        stack.pop();
        continue;
      }
      const instanceId = `t${String(frame.tiles.length).padStart(2, "0")}`;
      const tile: ClusterTile = { instanceId, archetypeId: chosen.guestMesh.archetypeId, moduleId: chosen.guestMesh.moduleId, typologyId: chosen.guestMesh.typologyId, name: chosen.guestMesh.name, pose: chosen.world };
      const contacts = [contactOf(chosen.host.instanceId, instanceId, chosen.hostMesh, chosen.guestMesh, chosen.host.pose, chosen.world, chosen.known, chosen.measured, chosen.deepest)];
      for (let index = 0; index < frame.tiles.length; index += 1) {
        if (index === chosen.choice.hostIndex) continue;
        const other = frame.tiles[index];
        const otherMesh = byId.get(other.archetypeId);
        if (!otherMesh) continue;
        if (!boundsOverlap(poseBounds(otherMesh.tight, other.pose), poseBounds(chosen.guestMesh.tight, chosen.world), SKILL6_PARAMETERS.contactTolerance)) continue;
        const secondary = measureEnvelope(otherMesh, chosen.guestMesh, other.pose, chosen.world);
        if (!passes(secondary)) continue;
        contacts.push(contactOf(other.instanceId, instanceId, otherMesh, chosen.guestMesh, other.pose, chosen.world, chosen.known, secondary, chosen.deepest));
      }
      const tiles = [...frame.tiles, tile];
      const solids = collision === "world" ? [...frame.solids, placeSolid(chosen.guestMesh, chosen.world)] : frame.solids;
      const nextContacts = [...frame.contacts, ...contacts];
      stack.push({ tiles, contacts: nextContacts, solids, options: choicesFor(tiles, nextContacts, tiles.length + 1), index: 0 });
      const rest = frame.ready.filter((item) => item !== chosen);
      search.placements = [...(search.placements ?? []), { step: frame.tiles.length, chosen: `${chosen.guestMesh.archetypeId} ${chosen.direction} ${chosen.score.toFixed(2)} ${chosen.known.note.slice(0, 48)}`, score: Number(chosen.score.toFixed(2)), world: chosen.direction, alternatives: rest.slice(0, 8).map((item) => ({ world: item.direction, score: Number(item.score.toFixed(2)), note: item.known.note.slice(0, 80) })) }];
      search.acceptedPoses += 1;
      if (tiles.length > deepest.tiles.length) deepest = stack[stack.length - 1];
      continue;
    }
    const depthLimit = search.depthLimit == null ? frame.options.length : Math.min(frame.options.length, search.depthLimit);
    if (frame.index >= depthLimit) {
      if (options.select === "scored" && frame.passed && frame.passed.length > 0 && !frame.ready) {
        const weights = { ...PLACEMENT_WEIGHTS, ...options.weights, directionBias: { ...PLACEMENT_WEIGHTS.directionBias, ...options.weights?.directionBias } };
        const usedDirections = new Set(frame.contacts.map((contact) => contact.searchNote.split(" ")[0]).filter((token) => token.startsWith("+") || token.startsWith("-")));
        const usedArchetypes = new Set(frame.tiles.map((tile) => tile.archetypeId));
        const children = new Map<string, number>();
        for (const contact of frame.contacts) children.set(contact.hostId, (children.get(contact.hostId) ?? 0) + 1);
        const diagonal = (tiles: readonly ClusterTile[]) => {
          const min = [Infinity, Infinity, Infinity];
          const max = [-Infinity, -Infinity, -Infinity];
          for (const tile of tiles) {
            const mesh = byId.get(tile.archetypeId);
            if (!mesh) continue;
            const box = poseBounds(mesh.tight, tile.pose);
            for (let axis = 0; axis < 3; axis += 1) {
              min[axis] = Math.min(min[axis], box.min[axis]);
              max[axis] = Math.max(max[axis], box.max[axis]);
            }
          }
          return Math.hypot(max[0] - min[0], max[1] - min[1], max[2] - min[2]);
        };
        const currentSpan = diagonal(frame.tiles);
        const placedDirection = (guestId: string): GrowthDirection | null => {
          const link = frame.contacts.find((contact) => contact.guestId === guestId);
          const hostTile = frame.tiles.find((tile) => tile.instanceId === link?.hostId);
          const guestTile = frame.tiles.find((tile) => tile.instanceId === guestId);
          const hostMesh = hostTile ? byId.get(hostTile.archetypeId) : undefined;
          const guestMesh = guestTile ? byId.get(guestTile.archetypeId) : undefined;
          if (!link || !hostTile || !guestTile || !hostMesh || !guestMesh) return null;
          return growthDirection(hostMesh, hostTile.pose, guestMesh, guestTile.pose);
        };
        const hostDepth = (hostId: string) => {
          let depth = 0;
          let current = hostId;
          while (current !== frame.tiles[0]?.instanceId && depth < 12) {
            const link = frame.contacts.find((contact) => contact.guestId === current);
            if (!link) break;
            current = link.hostId;
            depth += 1;
          }
          return depth;
        };
        const clusterBox = (extra?: Bounds) => {
          const min = [Infinity, Infinity, Infinity];
          const max = [-Infinity, -Infinity, -Infinity];
          const include = (box: Bounds) => {
            for (let axis = 0; axis < 3; axis += 1) {
              min[axis] = Math.min(min[axis], box.min[axis]);
              max[axis] = Math.max(max[axis], box.max[axis]);
            }
          };
          for (const tile of frame.tiles) {
            const mesh = byId.get(tile.archetypeId);
            if (mesh) include(poseBounds(mesh.tight, tile.pose));
          }
          if (extra) include(extra);
          const extent: Vec3 = [max[0] - min[0], max[1] - min[1], max[2] - min[2]];
          return { extent, longest: Math.max(...extent), volume: extent[0] * extent[1] * extent[2] };
        };
        for (const item of frame.passed) {
          if (options.organization && (options.profile === 2 || options.profile === 3 || options.organization === "integrated")) {
            const hostBox = poseBounds(item.hostMesh.tight, item.host.pose);
            const guestBox = poseBounds(item.guestMesh.tight, item.world);
            const mass = clusterBox(guestBox);
            const before = clusterBox();
            const volumes = frame.tiles.reduce((sum, tile) => sum + Math.abs(byId.get(tile.archetypeId)?.solidVolume ?? 0), 0) + Math.abs(item.guestMesh.solidVolume);
            const hosts = new Set(frame.contacts.map((contact) => contact.hostId));
            hosts.add(item.host.instanceId);
            const sampleZ = item.measured.samples.reduce((sum, sample) => sum + sample.host[2], 0) / (item.measured.samples.length || 1);
            item.score = scoreOrganizationV2(options.organization, {
              direction: item.direction,
              contactArea: item.measured.contactArea,
              neighbors: item.neighbors,
              up: item.world.basis[8],
              hostId: item.host.instanceId,
              guestBox,
              hostBox,
              sampleZ,
              sampleCount: item.measured.samples.length,
              cluster: mass,
              beforeLongest: before.longest,
              beforePlan: Math.hypot(before.extent[0], before.extent[1]),
              beforeTop: frame.tiles.reduce((top, tile) => {
                const mesh = byId.get(tile.archetypeId);
                return mesh ? Math.max(top, poseBounds(mesh.tight, tile.pose).max[2]) : top;
              }, 0),
              usedDirections,
              children,
              hostDepth: hostDepth(item.host.instanceId),
              occupancy: mass.volume > 0 ? volumes / mass.volume : 0,
              hostsWithChildren: hosts.size,
            });
            if (options.profile === 3) {
              const normal = attachmentNormal(item.hostMesh, item.host.pose, item.measured.samples);
              const clusterUp = frame.tiles.reduce((sum, tile) => sum + tile.pose.basis[8], 0) / frame.tiles.length;
              const future = meshes.reduce((count, mesh) => count + (candidates(item.guestMesh.archetypeId, mesh.archetypeId).length > 0 ? 1 : 0), 0);
              item.score += Math.min(item.measured.contactArea, 60) * 0.03;
              if (item.measured.contactArea < 8) item.score -= 2.5;
              item.score += Math.min(future, 8) * 0.2;
              item.score += item.world.basis[8] * clusterUp * 3;
              if (options.organization === "vertical" && normal) {
                if (item.direction === "+Z" && normal[2] > 0.7) item.score += 6;
                if (item.direction === "+Z" && normal[2] < 0.35) item.score -= 8;
              }
            }
            continue;
          }
          if (options.organization) {
            const hostBox = poseBounds(item.hostMesh.tight, item.host.pose);
            const guestBox = poseBounds(item.guestMesh.tight, item.world);
            const up = item.world.basis[8];
            const contact = Math.min(item.measured.contactArea, 80);
            const extraNeighbors = Math.max(0, item.neighbors - 1);
            if (options.organization === "compact") {
              const mass = clusterBox(guestBox);
              const guestCenter = centroid(item.guestMesh, item.world);
              const anchor = frame.tiles.reduce((sum, tile) => {
                const mesh = byId.get(tile.archetypeId);
                const center = mesh ? centroid(mesh, tile.pose) : guestCenter;
                return [sum[0] + center[0], sum[1] + center[1], sum[2] + center[2]] as Vec3;
              }, [0, 0, 0] as Vec3).map((value) => value / frame.tiles.length) as Vec3;
              const proximity = Math.hypot(guestCenter[0] - anchor[0], guestCenter[1] - anchor[1], guestCenter[2] - anchor[2]);
              item.score = extraNeighbors * 6 + contact * 0.04 - mass.longest * 0.35 - mass.volume / 12000 - proximity * 0.08 + up * 0.5;
            } else if (options.organization === "branching") {
              const horizontal = item.direction !== "+Z";
              const already = frame.tiles.some((tile) => placedDirection(tile.instanceId) === item.direction);
              item.score = ((children.get(item.host.instanceId) ?? 0) >= 1 ? 9 : 0)
                + (horizontal && !already ? 7 : 0)
                - (horizontal && already ? 6 : 0)
                - hostDepth(item.host.instanceId) * 2.5
                + contact * 0.015
                + (item.direction === "+Z" ? 0.5 : 0)
                + extraNeighbors;
            } else {
              const onTop = guestBox.min[2] >= hostBox.max[2] - SKILL6_PARAMETERS.contactTolerance && guestBox.min[2] <= hostBox.max[2] + SKILL6_PARAMETERS.contactTolerance;
              const sampleZ = item.measured.samples.reduce((sum, sample) => sum + sample.host[2], 0) / (item.measured.samples.length || 1);
              const onSupport = item.direction === "+Z" && onTop && (item.measured.samples.length === 0 || sampleZ >= hostBox.max[2] - 4);
              const heightGain = Math.max(0, guestBox.max[2] - hostBox.max[2]);
              item.score = (onSupport ? 14 : 0) + heightGain * 0.2 + up * 2.5 + contact * 0.02 + (item.direction === "+Z" ? 1 : 0);
            }
            continue;
          }
          const future = meshes.reduce((count, mesh) => count + (candidates(item.guestMesh.archetypeId, mesh.archetypeId).length > 0 ? 1 : 0), 0);
          const span = diagonal([...frame.tiles, { ...frame.tiles[0], pose: item.world, archetypeId: item.guestMesh.archetypeId }]);
          item.score = item.measured.contactArea * weights.contact
            + (usedDirections.has(item.direction) ? 0 : weights.newDirection)
            + (usedArchetypes.has(item.guestMesh.archetypeId) ? 0 : weights.newArchetype)
            + weights.branch / (1 + (children.get(item.host.instanceId) ?? 0))
            - Math.max(0, span - currentSpan) * weights.compact
            + (item.world.basis[8] < 0 ? -weights.upright : 0)
            + future * weights.future
            + (weights.directionBias[item.direction] ?? 0);
        }
        frame.passed.sort((left, right) => right.score - left.score);
        frame.ready = frame.passed;
        frame.readyIndex = 0;
        continue;
      }
      if (frame.index < frame.options.length) {
        search.truncated = true;
        search.untried += frame.options.length - frame.index;
      }
      if (stack.length > 1) search.backtracks += 1;
      stack.pop();
      continue;
    }
    const choice = frame.options[frame.index];
    frame.index += 1;
    search.evaluations += 1;
    const host = frame.tiles[choice.hostIndex];
    const hostMesh = byId.get(host.archetypeId);
    const guestMesh = byId.get(choice.guestId);
    const known = hostMesh && guestMesh ? posesFor(host, guestMesh.archetypeId)[choice.poseIndex] : undefined;
    if (!hostMesh || !guestMesh || !known) continue;
    const world = composePose(host.pose, known.pose);
    const center = centroid(guestMesh, world);
    const duplicate = frame.tiles.some((tile) => {
      const mesh = byId.get(tile.archetypeId);
      if (!mesh || mesh.archetypeId !== guestMesh.archetypeId) return false;
      const other = centroid(mesh, tile.pose);
      return Math.hypot(other[0] - center[0], other[1] - center[1], other[2] - center[2]) < 0.75;
    });
    if (duplicate) continue;
    if (options.directions) {
      const rejection = growthRejection(poseBounds(hostMesh.tight, host.pose), poseBounds(guestMesh.tight, world), options.directions);
      if (rejection) {
        search.directionRejections = (search.directionRejections ?? 0) + 1;
        blockedReason = rejection;
        continue;
      }
    }
    const clearance = blockedBy(frame.tiles, frame.solids, choice.hostIndex, guestMesh, world);
    if (clearance.blocked) {
      search.geometricRejections += 1;
      if (clearance.contained) search.rejectionCounts.containment += 1;
      else search.rejectionCounts.intersection += 1;
      blockedReason = clearance.contained
        ? "containment of a non-host tile"
        : `intersection with an existing tile, depth ${clearance.deepest.toFixed(3)}`;
      continue;
    }
    const measured = measureEnvelope(hostMesh, guestMesh, host.pose, world);
    if (!passes(measured)) {
      search.geometricRejections += 1;
      search.rejectionCounts.contact += 1;
      blockedReason = `composed contact area ${measured.contactArea.toFixed(1)}`;
      continue;
    }
    const instanceId = `t${String(frame.tiles.length).padStart(2, "0")}`;
    const tile: ClusterTile = {
      instanceId,
      archetypeId: guestMesh.archetypeId,
      moduleId: guestMesh.moduleId,
      typologyId: guestMesh.typologyId,
      name: guestMesh.name,
      pose: world,
    };
    const contacts = [
      contactOf(host.instanceId, instanceId, hostMesh, guestMesh, host.pose, world, known, measured, clearance.deepest),
    ];
    for (let index = 0; index < frame.tiles.length; index += 1) {
      if (index === choice.hostIndex) continue;
      const other = frame.tiles[index];
      const otherMesh = byId.get(other.archetypeId);
      if (!otherMesh) continue;
      if (!boundsOverlap(poseBounds(otherMesh.tight, other.pose), poseBounds(guestMesh.tight, world), SKILL6_PARAMETERS.contactTolerance)) continue;
      const secondary = measureEnvelope(otherMesh, guestMesh, other.pose, world);
      if (!passes(secondary)) continue;
      contacts.push(contactOf(other.instanceId, instanceId, otherMesh, guestMesh, other.pose, world, known, secondary, clearance.deepest));
    }
    if (options.select === "scored") {
      frame.passed ??= [];
      const direction = growthDirection(hostMesh, host.pose, guestMesh, world);
      const remember = (attachment: KnownAttachment, posed: Skill6Pose, reading: typeof measured, depth: number, label: GrowthDirection, neighbors: number) => {
        if (options.profile === 2 || options.profile === 3) {
          const tally = search.passedDirections ?? {};
          tally[label] = (tally[label] ?? 0) + 1;
          search.passedDirections = tally;
          if (attachment.note.startsWith("atlas ")) search.atlasAccepted = (search.atlasAccepted ?? 0) + 1;
          if (attachment.note.startsWith("upright ")) search.uprightAccepted = (search.uprightAccepted ?? 0) + 1;
          if (attachment.note.includes(" dual")) search.dualAccepted = (search.dualAccepted ?? 0) + 1;
        }
        frame.passed?.push({ choice, known: attachment, world: posed, guestMesh, hostMesh, host, measured: reading, deepest: depth, direction: label, neighbors, score: 0 });
      };
      remember(known, world, measured, clearance.deepest, direction, contacts.length);
      if (options.profile === 3 && frame.tiles.length > 1) {
        const guestBox = poseBounds(guestMesh.tight, world);
        const near = frame.tiles.some((tile, index) => {
          if (index === choice.hostIndex) return false;
          const mesh = byId.get(tile.archetypeId);
          if (!mesh) return false;
          return boundsOverlap(poseBounds(mesh.tight, tile.pose), guestBox, 6);
        });
        const axis: Vec3 = direction === "+X" ? [1, 0, 0] : direction === "-X" ? [-1, 0, 0] : direction === "+Y" ? [0, 1, 0] : direction === "-Y" ? [0, -1, 0] : direction === "+Z" ? [0, 0, 1] : [0, 0, -1];
        let added = 0;
        if (near) {
          for (const offset of shiftOffsets(axis).slice(0, 8)) {
            if (added >= 1 || search.evaluations >= budget.evaluations) break;
            search.evaluations += 1;
            const shifted = translatePose(world, offset);
            const hit = blockedBy(frame.tiles, frame.solids, choice.hostIndex, guestMesh, shifted);
            if (hit.blocked) continue;
            const again = measureEnvelope(hostMesh, guestMesh, host.pose, shifted);
            if (!passes(again)) continue;
            let neighbors = 1;
            for (let index = 0; index < frame.tiles.length; index += 1) {
              if (index === choice.hostIndex) continue;
              const other = frame.tiles[index];
              const otherMesh = byId.get(other.archetypeId);
              if (!otherMesh) continue;
              if (!boundsOverlap(poseBounds(otherMesh.tight, other.pose), poseBounds(guestMesh.tight, shifted), SKILL6_PARAMETERS.contactTolerance)) continue;
              const secondary = measureEnvelope(otherMesh, guestMesh, other.pose, shifted);
              if (passes(secondary)) neighbors += 1;
            }
            if (neighbors < 2) continue;
            const label = growthDirection(hostMesh, host.pose, guestMesh, shifted);
            remember({ ...known, note: `${known.note} dual` }, shifted, again, hit.deepest, label, neighbors);
            added += 1;
          }
        }
      }
      continue;
    }
    const tiles = [...frame.tiles, tile];
    const solids = collision === "world" ? [...frame.solids, placeSolid(guestMesh, world)] : frame.solids;
    const nextContacts = [...frame.contacts, ...contacts];
    const next = { tiles, contacts: nextContacts, solids, options: choicesFor(tiles, nextContacts, tiles.length + 1), index: 0 };
    stack.push(next);
    search.acceptedPoses += 1;
    if (tiles.length > deepest.tiles.length) deepest = next;
  }

  const placed = stack.length > 0 && stack[stack.length - 1].tiles.length >= options.tiles
    ? stack[stack.length - 1]
    : null;
  if (placed) {
    for (let later = 1; later < placed.tiles.length; later += 1) {
      for (let earlier = 0; earlier < later; earlier += 1) {
        const hostMesh = byId.get(placed.tiles[earlier].archetypeId);
        const guestMesh = byId.get(placed.tiles[later].archetypeId);
        if (!hostMesh || !guestMesh) continue;
        if (!boundsOverlap(poseBounds(hostMesh.tight, placed.tiles[earlier].pose), poseBounds(guestMesh.tight, placed.tiles[later].pose), 0.02)) continue;
        const hit = scanCrossings(hostMesh, guestMesh, placed.tiles[earlier].pose, placed.tiles[later].pose);
        if (hit.count > SKILL6_PARAMETERS.maxIntersectingTriangles) {
          search.stop = "geometric";
          return finish("unsuccessful", `Tile ${placed.tiles[later].instanceId} intersects ${placed.tiles[earlier].instanceId} at depth ${hit.deepest.toFixed(3)}.`, placed.tiles, placed.contacts, byId);
        }
      }
    }
    const groups = connectedGroups(placed.tiles, placed.contacts);
    if (groups.length !== 1) {
      search.stop = "geometric";
      return finish("unsuccessful", "The arrangement is not one connected component.", placed.tiles, placed.contacts, byId);
    }
    search.untried += stack.reduce((sum, frame) => sum + Math.max(0, frame.options.length - frame.index), 0);
    search.stop = "reached";
    return finish("accepted", null, placed.tiles, placed.contacts, byId);
  }
  search.untried += stack.reduce((sum, frame) => sum + Math.max(0, frame.options.length - frame.index), 0);
  if (search.truncated || search.untried > 0) search.exhausted = true;
  const coverage = `${search.untried} candidates were not evaluated. ${search.geometricRejections} evaluated candidates were rejected geometrically (${search.rejectionCounts.intersection} intersections, ${search.rejectionCounts.containment} containments, ${search.rejectionCounts.contact} contact failures).`;
  const detail = search.exhausted
    ? `Search budget exhausted at ${deepest.tiles.length} tiles after ${search.evaluations} evaluations and ${search.backtracks} backtracks. ${coverage}`
    : `Every stored pose at the searched depths was evaluated. Deepest valid cluster has ${deepest.tiles.length}. ${search.evaluations} evaluations, ${search.backtracks} backtracks. ${coverage}${blockedReason ? ` Last rejection: ${blockedReason}.` : ""}`;
  search.stop = search.exhausted ? "exhausted" : "geometric";
  return finish("unsuccessful", detail, deepest.tiles, deepest.contacts, byId);
}

/** v2 pose library, without the 20-pose depth cap. Collision caching does not replace the final scan. */
export function aggregateCoverage(meshes: readonly ArchetypeMesh[], options: GrowOptions): ClusterRecord {
  return aggregateTranslated(meshes, {
    ...options,
    triesPerDepth: options.triesPerDepth === undefined ? null : options.triesPerDepth,
    choiceCap: null,
    order: options.order ?? "axis",
    collision: "world",
    algorithm: SKILL6_COVERAGE_ALGORITHM,
  });
}
