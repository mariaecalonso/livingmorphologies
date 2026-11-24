import { TILE_IDS } from "./assembly-layout";
import { rankCompatibleFaces } from "./cluster-face-pair";
import { DOMINANT_SPINE, evaluateClusterMorphology, ONE_MODULE_DEEP_CHAIN, PLAN_SPREAD_TOO_LOW, placementBias, readVerticalSupport, SINGLE_VERTICAL_STEM, spineEndIds } from "./cluster-morphology";
import { ADJACENCY_TOLERANCE, connectionId, tileBounds, type TileConnection } from "./connections";
import type { FaceId } from "./contract";
import { programMorphologyProfile } from "./program-morphology";
import { programNudgeFactor } from "./program-placement-nudges";
import { dominantTile, rankedEligibleTiles } from "./program-tiles";
import { spacingProfile, type SpacingProfile } from "./program-spacing";
import { faceWorldNormal, orientTiles } from "./tile-orientation";
import { envelopeWidth, type TileInstance } from "./tiles";

export const CLUSTER_ITERATION_COUNT = 6;
export const MIN_CLUSTER_TILES = 2;
export const MAX_CLUSTER_TILES = 9;
const CLUSTER_TILE_IDS = [...TILE_IDS, "I"] as const;

export type ClusterStatus = "valid" | "failed";

export type ProgramCluster = {
  id: string;
  programId: string;
  status: ClusterStatus;
  targetCount: number;
  tiles: TileInstance[];
  connections: TileConnection[];
  names: string[];
  dominantName: string;
  dominantUsed: boolean;
  /** Face-to-face gap for each connection, in module units, from the program spacing profile. */
  spacings: number[];
};

function randomOf(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function seedFor(programId: string, index: number) {
  let hash = 2166136261;
  const text = `${programId}:${index}`;
  for (let index = 0; index < text.length; index += 1) hash = Math.imul(hash ^ text.charCodeAt(index), 16777619);
  return hash >>> 0;
}

function pickWeighted<T extends { score: number | null }>(items: readonly T[], random: () => number) {
  const weights = items.map((item) => Math.max(item.score ?? 0, 0));
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  if (total <= 0) return items[Math.floor(random() * items.length)] ?? items[0];
  let mark = random() * total;
  for (let index = 0; index < items.length; index += 1) {
    mark -= weights[index];
    if (mark <= 0) return items[index];
  }
  return items[items.length - 1];
}

function blankTile(instanceId: string, archetypeId: string): TileInstance {
  return {
    instanceId,
    archetypeId,
    moduleId: "",
    transform: { x: 0, y: 0, z: 0 },
    rotationQuarter: 0,
    mirror: null,
  };
}

function connectionBetween(hostId: string, guestId: string, hostFace: FaceId, guestFace: FaceId): TileConnection {
  const hostFirst = hostId < guestId;
  const tileAId = hostFirst ? hostId : guestId;
  const tileBId = hostFirst ? guestId : hostId;
  return {
    id: connectionId(tileAId, tileBId),
    tileAId,
    tileBId,
    faceA: hostFirst ? hostFace : guestFace,
    faceB: hostFirst ? guestFace : hostFace,
    origin: "explicit",
    generationStatus: "not-generated",
    faceSelection: "user",
    inputsChanged: false,
    signature: "",
    candidateField: null,
    generatedHybridField: null,
    selectedMockId: "",
  };
}

function overlaps(left: TileInstance, right: TileInstance) {
  const a = tileBounds(left);
  const b = tileBounds(right);
  const span = (a0: number, a1: number, b0: number, b1: number) => Math.min(a1, b1) - Math.max(a0, b0);
  return span(a.min.x, a.max.x, b.min.x, b.max.x) > ADJACENCY_TOLERANCE
    && span(a.min.y, a.max.y, b.min.y, b.max.y) > ADJACENCY_TOLERANCE
    && span(a.min.z, a.max.z, b.min.z, b.max.z) > ADJACENCY_TOLERANCE;
}

function collides(tiles: readonly TileInstance[]) {
  for (let left = 0; left < tiles.length; left += 1) {
    for (let right = left + 1; right < tiles.length; right += 1) {
      if (overlaps(tiles[left], tiles[right])) return true;
    }
  }
  return false;
}

const STEP_BACKTRACKS = 4;
const CLUSTER_ATTEMPT_LIMIT = 30;

function spacingSamples(profile: SpacingProfile, random: () => number) {
  const span = Math.max(0, profile.max - profile.min);
  const prefer = profile.bias === "open" ? 0.82 : profile.bias === "tight" ? 0.18 : 0.5;
  const wander = profile.variabilityLabel === "high" ? 1 : profile.variabilityLabel === "medium" ? 0.55 : 0.28;
  const anchors = profile.bias === "open" ? [0.84, 0.52, 0.2] : profile.bias === "tight" ? [0.16, 0.48, 0.8] : [0.5, 0.22, 0.78];
  return anchors.map((anchor) => {
    const mixed = prefer * (1 - wander) + anchor * wander;
    const roll = (random() - 0.5) * wander * 0.3;
    const t = Math.min(1, Math.max(0, mixed + roll));
    return profile.min + t * span;
  });
}

function distinctSpacing(value: number, profile: SpacingProfile, used: readonly number[]) {
  const nudge = Math.max(profile.variability * 0.18, (profile.max - profile.min) * 0.08);
  let next = value;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    let nearest = Number.POSITIVE_INFINITY;
    for (const prior of used) {
      if (Math.abs(prior - next) < Math.abs(nearest - next)) nearest = prior;
    }
    if (!Number.isFinite(nearest) || Math.abs(nearest - next) >= nudge * 0.65) break;
    const direction = next >= nearest ? 1 : -1;
    next = Math.min(profile.max, Math.max(profile.min, next + direction * nudge));
  }
  return next;
}

/** Keep the rotations from face orientation, then set each face gap to the profile spacing. */
function seatToSpacings(tiles: readonly TileInstance[], connections: readonly TileConnection[], gaps: ReadonlyMap<string, number>) {
  const width = envelopeWidth();
  const byId = new Map(tiles.map((tile) => [tile.instanceId, { ...tile, transform: { ...tile.transform } }]));
  const root = [...tiles].sort((left, right) => (left.instanceId < right.instanceId ? -1 : 1))[0];
  if (!root) return [...tiles];
  const placed = new Set<string>([root.instanceId]);
  const queue = [root.instanceId];
  const seen = new Set<string>();
  while (queue.length > 0) {
    const parentId = queue.shift();
    if (!parentId) break;
    const parent = byId.get(parentId);
    if (!parent) continue;
    for (const connection of connections) {
      if (seen.has(connection.id)) continue;
      if (connection.tileAId !== parentId && connection.tileBId !== parentId) continue;
      seen.add(connection.id);
      const childId = connection.tileAId === parentId ? connection.tileBId : connection.tileAId;
      if (placed.has(childId)) continue;
      const child = byId.get(childId);
      if (!child) continue;
      const parentFace = connection.tileAId === parentId ? connection.faceA : connection.faceB;
      const normal = faceWorldNormal(parentFace, parent);
      const distance = width + (gaps.get(connection.id) ?? 0);
      child.transform = {
        x: parent.transform.x + normal.x * distance,
        y: parent.transform.y + normal.y * distance,
        z: parent.transform.z + normal.z * distance,
      };
      placed.add(childId);
      queue.push(childId);
    }
  }
  return tiles.map((tile) => byId.get(tile.instanceId) ?? tile);
}

function rangeOf(values: readonly number[]) {
  if (values.length === 0) return 0;
  return Math.max(...values) - Math.min(...values);
}

function moveKey(depth: number, hostId: string, archetypeId: string, hostFace: FaceId, guestFace: FaceId) {
  return `${depth}:${hostId}:${archetypeId}:${hostFace}:${guestFace}`;
}

type Attachment = { tiles: TileInstance[]; connection: TileConnection; move: string; spacing: number };

function collectAttachments(
  tiles: readonly TileInstance[],
  connections: readonly TileConnection[],
  occupied: ReadonlyMap<string, ReadonlySet<FaceId>>,
  gaps: ReadonlyMap<string, number>,
  guest: TileInstance,
  hostId: string,
  hostArchetype: string,
  blocked: ReadonlySet<string>,
  profile: SpacingProfile,
  random: () => number,
  limit: number,
  preferVertical = false,
  preferSpread = false,
) {
  const found: Attachment[] = [];
  const used = occupied.get(hostId);
  const samples = spacingSamples(profile, random).map((value) => distinctSpacing(value, profile, [...gaps.values()]));
  const start = gaps.size % samples.length;
  const ordered = [...samples.slice(start), ...samples.slice(0, start)];
  const pairs = rankCompatibleFaces(hostArchetype, guest.archetypeId);
  const host = tiles.find((tile) => tile.instanceId === hostId);
  const weak = rangeOf(tiles.map((tile) => tile.transform.x)) <= rangeOf(tiles.map((tile) => tile.transform.z)) ? "x" : "z";
  const orderedPairs = preferVertical
    ? [...pairs].sort((left, right) => Number(right.faceA === "T" || right.faceA === "B") - Number(left.faceA === "T" || left.faceA === "B"))
    : preferSpread && host
      ? [...pairs].sort((left, right) => Math.abs(faceWorldNormal(right.faceA, host)[weak]) - Math.abs(faceWorldNormal(left.faceA, host)[weak]))
      : pairs;
  for (const pair of orderedPairs) {
    if (used?.has(pair.faceA)) continue;
    const key = moveKey(tiles.length, hostId, guest.archetypeId, pair.faceA, pair.faceB);
    if (blocked.has(key)) continue;
    if (!host) continue;
    const normal = faceWorldNormal(pair.faceA, host);
    for (const spacing of ordered) {
      const step = envelopeWidth() + spacing;
      const seated = {
        ...guest,
        transform: {
          x: host.transform.x + normal.x * step,
          y: host.transform.y + normal.y * step,
          z: host.transform.z + normal.z * step,
        },
      };
      const connection = connectionBetween(hostId, guest.instanceId, pair.faceA, pair.faceB);
      const oriented = orientTiles([...tiles, seated], [...connections, connection]);
      if (oriented.unresolved.has(connection.id)) continue;
      const nextGaps = new Map(gaps);
      nextGaps.set(connection.id, spacing);
      const placed = seatToSpacings(oriented.tiles, [...connections, connection], nextGaps);
      if (collides(placed)) continue;
      found.push({ tiles: placed, connection, move: key, spacing });
      break;
    }
    if (found.length >= limit) break;
  }
  return found;
}

type SearchFrame = {
  tiles: TileInstance[];
  connections: TileConnection[];
  occupied: Map<string, Set<FaceId>>;
  gaps: Map<string, number>;
  move: string;
};

function copyOccupied(source: ReadonlyMap<string, ReadonlySet<FaceId>>) {
  return new Map([...source].map(([id, faces]) => [id, new Set(faces)]));
}

/** Eligible tiles in weighted-random order. Every tile is still offered once. */
function weightedOrder<T extends { score: number | null }>(items: readonly T[], random: () => number) {
  return items
    .map((item) => ({ item, key: Math.pow(random(), 1 / Math.max(item.score ?? 0, 1e-6)) }))
    .sort((left, right) => right.key - left.key)
    .map((entry) => entry.item);
}

/** Plan columns held between tile footprints. Used only to prefer a placement, not to measure the saved void. */
function heldFloor(tiles: readonly TileInstance[]) {
  if (tiles.length < 2) return 0;
  const module = envelopeWidth();
  const half = module * 0.5;
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const tile of tiles) {
    minX = Math.min(minX, tile.transform.x);
    maxX = Math.max(maxX, tile.transform.x);
    minZ = Math.min(minZ, tile.transform.z);
    maxZ = Math.max(maxZ, tile.transform.z);
  }
  const cell = 5;
  const pad = 2;
  const originX = minX - half - cell * pad;
  const originZ = minZ - half - cell * pad;
  const nx = Math.ceil((maxX - minX + module) / cell) + pad * 2;
  const nz = Math.ceil((maxZ - minZ + module) / cell) + pad * 2;
  if (nx < 2 || nz < 2 || nx * nz > 12000) return 0;
  const solid = new Uint8Array(nx * nz);
  for (const tile of tiles) {
    const x0 = Math.max(0, Math.floor((tile.transform.x - half - originX) / cell));
    const x1 = Math.min(nx - 1, Math.ceil((tile.transform.x + half - originX) / cell));
    const z0 = Math.max(0, Math.floor((tile.transform.z - half - originZ) / cell));
    const z1 = Math.min(nz - 1, Math.ceil((tile.transform.z + half - originZ) / cell));
    for (let z = z0; z <= z1; z += 1) {
      for (let x = x0; x <= x1; x += 1) solid[z * nx + x] = 1;
    }
  }
  const reach = Math.ceil(28 / cell);
  let columns = 0;
  for (let z = 1; z < nz - 1; z += 1) {
    for (let x = 1; x < nx - 1; x += 1) {
      if (solid[z * nx + x]) continue;
      const see = (sx: number, sz: number) => {
        for (let step = 1; step <= reach; step += 1) {
          const xx = x + sx * step;
          const zz = z + sz * step;
          if (xx < 0 || zz < 0 || xx >= nx || zz >= nz) return false;
          if (solid[zz * nx + xx]) return true;
        }
        return false;
      };
      const px = see(1, 0);
      const nxHit = see(-1, 0);
      const pz = see(0, 1);
      const nzHit = see(0, -1);
      const pairs = Number(px && nxHit) + Number(pz && nzHit);
      const hits = Number(px) + Number(nxHit) + Number(pz) + Number(nzHit);
      if (pairs >= 2 || (pairs >= 1 && hits >= 3)) columns += 1;
    }
  }
  return columns;
}

function voidBias(before: readonly TileInstance[], after: readonly TileInstance[]) {
  const gain = heldFloor(after) - heldFloor(before);
  if (gain >= 6) return 1.45;
  if (gain >= 2) return 1.18;
  if (gain <= -6) return 0.5;
  if (gain < 0) return 0.74;
  return 0.86;
}

function addsOffsetUpper(beforeTiles: readonly TileInstance[], afterTiles: readonly TileInstance[]) {
  const module = envelopeWidth();
  const minY = Math.min(...beforeTiles.map((tile) => tile.transform.y));
  const prior = beforeTiles.filter((tile) => tile.transform.y > minY + module * 0.7);
  if (prior.length === 0) return false;
  const added = afterTiles.find((tile) => !beforeTiles.some((item) => item.instanceId === tile.instanceId));
  if (!added || added.transform.y <= minY + module * 0.7) return false;
  return prior.every((tile) => Math.hypot(tile.transform.x - added.transform.x, tile.transform.z - added.transform.z) >= module * 0.75);
}

function stemFactor(programId: string, beforeTiles: readonly TileInstance[], beforeConnections: readonly TileConnection[], afterTiles: readonly TileInstance[], afterConnections: readonly TileConnection[]) {
  const before = readVerticalSupport(beforeTiles, beforeConnections);
  const after = readVerticalSupport(afterTiles, afterConnections);
  if (after.developedSingleStem) return 0.08;
  const vertical = programMorphologyProfile(programId).vertical;
  const repairs = before.elevatedTiles >= 1 && before.verticalTransitionCount < 2 && after.verticalTransitionCount >= 2;
  if (repairs && vertical !== "limited" && vertical !== "secondary") return 2.4;
  if (vertical === "strong" && addsOffsetUpper(beforeTiles, afterTiles) && !after.developedSingleStem) return 1.85;
  return 1;
}

function attachmentScore(base: number, programId: string, frame: SearchFrame, fit: Attachment, random: () => number) {
  const next = [...frame.connections, fit.connection];
  const factor = programNudgeFactor(programId, frame.tiles, frame.connections, fit.tiles, next, fit.spacing);
  const stem = stemFactor(programId, frame.tiles, frame.connections, fit.tiles, next);
  const variation = (random() - 0.5) * 0.06 * Math.max(base, 0.15);
  return Math.max(0.02, base * factor * stem + variation);
}

function extend(
  frame: SearchFrame,
  ranked: ReturnType<typeof rankedEligibleTiles>,
  random: () => number,
  blocked: ReadonlySet<string>,
  profile: SpacingProfile,
  programId: string,
) {
  const guestId = CLUSTER_TILE_IDS[frame.tiles.length];
  if (!guestId) return null;
  const ends = spineEndIds(frame.tiles, frame.connections);
  const hosts = frame.tiles
    .filter((tile) => (frame.occupied.get(tile.instanceId)?.size ?? 0) < 6)
    .map((tile) => ({ tile, key: random() }))
    .sort((left, right) => Number(ends.has(left.tile.instanceId)) - Number(ends.has(right.tile.instanceId)) || left.key - right.key)
    .map((entry) => entry.tile);
  const morphology = programMorphologyProfile(programId);
  const candidates: { fit: Attachment; hostId: string; bias: number }[] = [];
  const flat = rangeOf(frame.tiles.map((tile) => tile.transform.y)) < envelopeWidth() * 0.35;
  if (flat && morphology.vertical !== "limited") {
    const lift = morphology.vertical === "strong" ? 2.6 : 1.55;
    for (const choice of ranked) {
      const guest = blankTile(guestId, choice.id);
      for (const host of hosts) {
        for (const fit of collectAttachments(frame.tiles, frame.connections, frame.occupied, frame.gaps, guest, host.instanceId, host.archetypeId, blocked, profile, random, 1, true)) {
          if (rangeOf(fit.tiles.map((tile) => tile.transform.y)) <= rangeOf(frame.tiles.map((tile) => tile.transform.y)) + envelopeWidth() * 0.35) continue;
          const next = [...frame.connections, fit.connection];
          candidates.push({
            fit,
            hostId: host.instanceId,
            bias: attachmentScore(placementBias(frame.tiles, frame.connections, fit.tiles, next, morphology) * voidBias(frame.tiles, fit.tiles) * lift * (0.7 + random()), programId, frame, fit, random),
          });
          if (candidates.length >= 3) break;
        }
        if (candidates.length >= 3) break;
      }
      if (candidates.length >= 3) break;
    }
  }
  const beforeMinor = Math.min(rangeOf(frame.tiles.map((tile) => tile.transform.x)), rangeOf(frame.tiles.map((tile) => tile.transform.z)));
  for (const host of hosts) {
    for (const choice of ranked) {
      const guest = blankTile(guestId, choice.id);
      const fit = collectAttachments(frame.tiles, frame.connections, frame.occupied, frame.gaps, guest, host.instanceId, host.archetypeId, blocked, profile, random, 1, false, true)[0];
      if (!fit) continue;
      const afterMinor = Math.min(rangeOf(fit.tiles.map((tile) => tile.transform.x)), rangeOf(fit.tiles.map((tile) => tile.transform.z)));
      if (afterMinor <= beforeMinor + envelopeWidth() * 0.2) continue;
      const next = [...frame.connections, fit.connection];
      candidates.push({
        fit,
        hostId: host.instanceId,
        bias: attachmentScore(placementBias(frame.tiles, frame.connections, fit.tiles, next, morphology) * voidBias(frame.tiles, fit.tiles) * 1.8 * (0.65 + random()), programId, frame, fit, random),
      });
      break;
    }
  }
  for (const choice of weightedOrder(ranked, random)) {
    const guest = blankTile(guestId, choice.id);
    for (const host of hosts) {
      for (const fit of collectAttachments(frame.tiles, frame.connections, frame.occupied, frame.gaps, guest, host.instanceId, host.archetypeId, blocked, profile, random, 2)) {
        const next = [...frame.connections, fit.connection];
        const bias = attachmentScore(placementBias(frame.tiles, frame.connections, fit.tiles, next, morphology) * voidBias(frame.tiles, fit.tiles) * (0.55 + random()), programId, frame, fit, random);
        candidates.push({ fit, hostId: host.instanceId, bias });
        if (candidates.length >= 10) break;
      }
      if (candidates.length >= 10) break;
    }
    if (candidates.length >= 10) break;
  }
  const beforeSupport = readVerticalSupport(frame.tiles, frame.connections);
  const kept: typeof candidates = [];
  if ((morphology.vertical === "strong" || morphology.vertical === "moderate") && beforeSupport.elevatedTiles >= 1 && beforeSupport.verticalTransitionCount < 2) {
    const floor = Math.min(...frame.tiles.map((tile) => tile.transform.y));
    const repairHosts = hosts.filter((host) => host.transform.y > floor + envelopeWidth() * 0.7);
    let repairs = 0;
    for (const host of (repairHosts.length > 0 ? repairHosts : hosts)) {
      for (const choice of ranked) {
        const guest = blankTile(guestId, choice.id);
        for (const fit of collectAttachments(frame.tiles, frame.connections, frame.occupied, frame.gaps, guest, host.instanceId, host.archetypeId, blocked, profile, random, 3)) {
          const after = readVerticalSupport(fit.tiles, [...frame.connections, fit.connection]);
          if (after.developedSingleStem) continue;
          const second = after.verticalTransitionCount >= 2;
          const offset = morphology.vertical === "strong" && addsOffsetUpper(frame.tiles, fit.tiles);
          if (!second && !offset) continue;
          const next = [...frame.connections, fit.connection];
          const lift = second ? 2.2 : 1.7;
          const candidate = {
            fit,
            hostId: host.instanceId,
            bias: attachmentScore(placementBias(frame.tiles, frame.connections, fit.tiles, next, morphology) * voidBias(frame.tiles, fit.tiles) * lift * (0.55 + random()), programId, frame, fit, random),
          };
          candidates.push(candidate);
          kept.push(candidate);
          repairs += 1;
          if (repairs >= 4) break;
        }
        if (repairs >= 4) break;
      }
      if (repairs >= 4) break;
    }
  }
  const opening = candidates.filter((candidate) => {
    const afterMinor = Math.min(rangeOf(candidate.fit.tiles.map((tile) => tile.transform.x)), rangeOf(candidate.fit.tiles.map((tile) => tile.transform.z)));
    return afterMinor > beforeMinor + envelopeWidth() * 0.2;
  });
  const widened = beforeMinor <= envelopeWidth() * 1.35 && opening.length > 0 ? opening : candidates;
  const pool = widened.slice();
  for (const candidate of kept) if (!pool.includes(candidate)) pool.push(candidate);
  const picked = pickWeighted(pool.map((candidate) => ({ ...candidate, score: candidate.bias })), random);
  if (!picked) return null;
  const fit = picked.fit;
  const occupied = copyOccupied(frame.occupied);
  const hostFace = fit.connection.tileAId === picked.hostId ? fit.connection.faceA : fit.connection.faceB;
  const guestFace = fit.connection.tileAId === guestId ? fit.connection.faceA : fit.connection.faceB;
  occupied.get(picked.hostId)?.add(hostFace);
  occupied.set(guestId, new Set([guestFace]));
  const gaps = new Map(frame.gaps);
  gaps.set(fit.connection.id, fit.spacing);
  return {
    tiles: fit.tiles,
    connections: [...frame.connections, fit.connection],
    occupied,
    gaps,
    move: fit.move,
  };
}

function grow(
  random: () => number,
  ranked: ReturnType<typeof rankedEligibleTiles>,
  dominantId: string,
  programId: string,
  index: number,
  profile: SpacingProfile,
  targetCount: number,
): ProgramCluster {
  const names = new Map(ranked.map((tile) => [tile.id, tile.name]));
  const morphology = programMorphologyProfile(programId);
  const partners = morphology.vertical === "strong"
    ? ranked.filter((tile) => ranked.some((other) => rankCompatibleFaces(tile.id, other.id).some((pair) => pair.faceA === "T" || pair.faceA === "B" || pair.faceB === "T" || pair.faceB === "B")))
    : [];
  const first = partners.length > 0 && random() < 0.75
    ? partners[Math.floor(random() * partners.length)]
    : pickWeighted(ranked, random);
  const blocked = new Set<string>();
  const stack: SearchFrame[] = [{
    tiles: [blankTile(CLUSTER_TILE_IDS[0], first.id)],
    connections: [],
    occupied: new Map([[CLUSTER_TILE_IDS[0], new Set()]]),
    gaps: new Map(),
    move: "",
  }];
  let backtracks = 0;
  let extensions = 0;
  while (stack.length < targetCount && extensions < targetCount * 8) {
    extensions += 1;
    const added = extend(stack[stack.length - 1], ranked, random, blocked, profile, programId);
    if (added) {
      stack.push(added);
      continue;
    }
    if (stack.length <= 1 || backtracks >= STEP_BACKTRACKS) break;
    const undone = stack.pop();
    if (undone?.move) blocked.add(undone.move);
    backtracks += 1;
  }
  const frame = stack[stack.length - 1];
  const count = frame.tiles.length;
  const connected = frame.connections.length + 1 === count;
  const spacings = frame.connections.map((connection) => frame.gaps.get(connection.id) ?? profile.min);
  const usedIds = frame.tiles.map((tile) => tile.archetypeId);
  const organization = evaluateClusterMorphology(frame.tiles, frame.connections, programId);
  const chain = organization.flags.includes(ONE_MODULE_DEEP_CHAIN) || organization.flags.includes(PLAN_SPREAD_TOO_LOW) || organization.flags.includes(DOMINANT_SPINE) || organization.flags.includes(SINGLE_VERTICAL_STEM);
  return {
    id: `${programId}:${index}`,
    programId,
    status: connected && !chain && count === targetCount && count >= MIN_CLUSTER_TILES && count <= MAX_CLUSTER_TILES && spacings.length === frame.connections.length ? "valid" : "failed",
    targetCount,
    tiles: frame.tiles,
    connections: frame.connections,
    names: usedIds.map((id) => names.get(id) ?? id),
    dominantName: names.get(dominantId) ?? dominantId,
    dominantUsed: usedIds.includes(dominantId),
    spacings,
  };
}

export type ClusterBatch = {
  clusters: ProgramCluster[];
  regeneratedFailures: number;
};

/** One connected cluster of a requested size. Spacing and faces come from the existing program rules. */
export function generateSizedCluster(programId: string, targetCount: number, attempt: number, keepRejected = false): ProgramCluster | null {
  const ranked = rankedEligibleTiles(programId).filter((tile) => tile.score !== null);
  const dominantId = dominantTile(programId)?.id ?? "";
  const profile = spacingProfile(programId);
  const count = Math.min(MAX_CLUSTER_TILES, Math.max(MIN_CLUSTER_TILES, targetCount));
  if (ranked.length === 0 || !profile) return null;
  const cluster = grow(randomOf(seedFor(programId, attempt)), ranked, dominantId, programId, attempt, profile, count);
  if (cluster.status === "valid") return cluster;
  const connected = cluster.connections.length + 1 === cluster.tiles.length && cluster.tiles.length === count;
  return keepRejected && connected ? cluster : null;
}

/** Preview clusters across the allowed size range. Area acceptance happens after the void is measured. */
export function generateProgramClusters(programId: string, count = CLUSTER_ITERATION_COUNT): ClusterBatch {
  const clusters: ProgramCluster[] = [];
  let regeneratedFailures = 0;
  let attempt = 0;
  while (clusters.length < count && attempt < count * CLUSTER_ATTEMPT_LIMIT) {
    const size = MIN_CLUSTER_TILES + (attempt % (MAX_CLUSTER_TILES - MIN_CLUSTER_TILES + 1));
    const cluster = generateSizedCluster(programId, size, attempt);
    attempt += 1;
    if (cluster) clusters.push({ ...cluster, id: `${programId}:${clusters.length}` });
    else regeneratedFailures += 1;
  }
  return { clusters, regeneratedFailures };
}
