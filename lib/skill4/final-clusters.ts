import { TYPOLOGIES } from "@/lib/catalog";
import type { TypologyId } from "@/lib/types";
import { SITE_ARCHETYPES } from "@/lib/skill5/catalog";
import { offersBetween, type PoolOffer } from "./connection-pool";
import { registrationSpan } from "./compact-measures";
import { connectionId, tileBounds, type TileConnection } from "./connections";
import { readGrowth } from "./growth-reading";
import type { FaceId, Vec3 } from "./contract";
import {
  emptyCatalog,
  FINAL_CLUSTER_GENERATOR,
  FINAL_CLUSTER_MAX_LINE,
  FINAL_CLUSTER_MAX_VERTICAL,
  FINAL_CLUSTER_PAIRS,
  FINAL_CLUSTER_GROWTH_BIASES,
  FINAL_CLUSTER_GROWTH_CHARACTERS,
  kindsForPair,
  sizeScheduleForId,
  type FinalClusterGrowthBias,
  type FinalClusterGrowthCharacter,
  type FinalClusterKind,
  type FinalClusterPair,
  type FinalClusterPairId,
  type FinalClusterSummary,
  type FinalClustersCatalogDocument,
} from "./final-cluster-pairs";
import { faceWorldNormal, orientTiles } from "./tile-orientation";
import { rotateByBasis, tileBasis, type Mat3 } from "./tile-basis";
import type { TileInstance } from "./tiles";

export {
  emptyCatalog,
  FINAL_CLUSTER_GENERATOR,
  FINAL_CLUSTER_MAX_LINE,
  FINAL_CLUSTER_MAX_VERTICAL,
  FINAL_CLUSTER_GROWTH_CHARACTERS,
  FINAL_CLUSTER_PAIRS,
  FINAL_CLUSTER_SIZE_SCHEDULE,
  FINAL_CLUSTERS_PER_PAIR,
  kindsForPair,
  sizeScheduleForId,
  type FinalClusterGrowthCharacter,
  type FinalClusterKind,
  type FinalClusterPair,
  type FinalClusterPairId,
  type FinalClusterSummary,
  type FinalClustersCatalogDocument,
} from "./final-cluster-pairs";

const TILE_IDS = ["A", "B", "C", "D", "E", "F", "G", "H", "I"] as const;
const AXIS_TOLERANCE = 0.35;

export type FinalClusterTileRef = {
  id: string;
  name: string;
  typologyId: TypologyId;
};

export type FinalClusterRecord = {
  id: string;
  pairId: FinalClusterPairId;
  label: string;
  seed: number;
  targetTiles: number;
  tileCount: number;
  tiles: TileInstance[];
  connections: TileConnection[];
  names: string[];
  typologyMix: Record<FinalClusterKind, number>;
  structure?: string;
  intent?: FinalClusterGrowthBias;
  character?: FinalClusterGrowthBias;
  provenance?: {
    selectionHash: string;
    modules: { archetypeId: string; moduleId: string; candidateId: number | null; continuationId: string | null }[];
  };
  hybridReady: boolean;
  validated: boolean;
  generator: typeof FINAL_CLUSTER_GENERATOR;
};

function isBias(value: string | undefined): value is FinalClusterGrowthBias {
  return (FINAL_CLUSTER_GROWTH_BIASES as readonly string[]).includes(value ?? "");
}

function assignedBiasOf(cluster: { intent?: string; character?: string }): FinalClusterGrowthBias | undefined {
  const value = cluster.intent ?? cluster.character;
  return isBias(value) ? value : undefined;
}

export function summarizeCluster(cluster: FinalClusterRecord): FinalClusterSummary {
  const reading = readGrowth(cluster.tiles, cluster.connections ?? []);
  const storedCharacter = (FINAL_CLUSTER_GROWTH_CHARACTERS as readonly string[]).includes(cluster.character ?? "")
    ? cluster.character as FinalClusterGrowthCharacter
    : undefined;
  return {
    id: cluster.id,
    pairId: cluster.pairId,
    label: cluster.label,
    seed: cluster.seed,
    targetTiles: cluster.targetTiles,
    tileCount: cluster.tileCount,
    names: cluster.names,
    tiles: cluster.tiles.map((tile) => ({
      instanceId: tile.instanceId,
      archetypeId: tile.archetypeId,
      transform: { ...tile.transform },
      rotationQuarter: tile.rotationQuarter,
      mirror: tile.mirror,
      rotation: tile.rotation ? [...tile.rotation] : null,
    })),
    typologyMix: cluster.typologyMix,
    assignedBias: assignedBiasOf(cluster),
    realizedPrimary: reading.primary,
    realizedSecondary: reading.secondary,
    balance: registrationSpan(cluster.tiles).balance,
    character: storedCharacter,
    hybridReady: cluster.hybridReady,
    validated: cluster.validated,
    generator: cluster.generator,
  };
}

export function tilesForKinds(kinds: readonly FinalClusterKind[]): FinalClusterTileRef[] {
  const allowed = new Set<TypologyId>(kinds);
  return TYPOLOGIES.filter((typology) => allowed.has(typology.id)).flatMap((typology) =>
    typology.archetypes.map((archetype) => ({
      id: archetype.id,
      name: archetype.name,
      typologyId: typology.id,
    })),
  );
}

/** Usable unique archetype count for a pair family. */
export function uniquePoolSizeForPair(pair: FinalClusterPair) {
  const pool = tilesForKinds(kindsForPair(pair));
  return pool.filter((tile) =>
    pool.some((other) => other.id !== tile.id && (offersBetween(tile.id, other.id).length > 0 || offersBetween(other.id, tile.id).length > 0)),
  ).length;
}

export function scheduleForPair(pair: FinalClusterPair) {
  return sizeScheduleForId(pair.id);
}

function randomOf(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * FNV-1a of `categoryId:slotTimes1000PlusAttemptPlus17:final-v3`.
 * `attemptDirectCluster` passes `catalogSlot * 1000 + retryAttempt + 17`.
 * The catalog slot and the retry both change the sequence. The preference is chosen separately.
 */
export function seedFor(pairId: string, index: number) {
  let hash = 2166136261;
  const text = `${pairId}:${index}:final-v3`;
  for (let i = 0; i < text.length; i += 1) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
  return hash >>> 0;
}

function blankTile(
  instanceId: string,
  archetypeId: string,
  rotationQuarter: TileInstance["rotationQuarter"] = 0,
  rotation: Mat3 | null = null,
): TileInstance {
  const entry = SITE_ARCHETYPES.find((item) => item.archetypeId === archetypeId);
  return {
    instanceId,
    archetypeId,
    moduleId: entry?.moduleId ?? "",
    transform: { x: 0, y: 0, z: 0 },
    rotationQuarter,
    mirror: null,
    rotation: rotation ?? undefined,
  };
}

function mulMat3(a: Mat3, b: Mat3): Mat3 {
  const out = new Array(9).fill(0) as number[];
  for (let column = 0; column < 3; column += 1) {
    for (let row = 0; row < 3; row += 1) {
      out[column * 3 + row] =
        a[row] * b[column * 3]
        + a[3 + row] * b[column * 3 + 1]
        + a[6 + row] * b[column * 3 + 2];
    }
  }
  return out as unknown as Mat3;
}

function connectionBetween(hostId: string, guestId: string, offer: PoolOffer): TileConnection {
  const hostFirst = hostId < guestId;
  const tileAId = hostFirst ? hostId : guestId;
  const tileBId = hostFirst ? guestId : hostId;
  return {
    id: connectionId(tileAId, tileBId),
    tileAId,
    tileBId,
    faceA: hostFirst ? offer.hostFace : offer.guestFace,
    faceB: hostFirst ? offer.guestFace : offer.hostFace,
    origin: "explicit",
    generationStatus: "not-generated",
    faceSelection: "user",
    inputsChanged: false,
    signature: "",
    candidateField: null,
    generatedHybridField: null,
    selectedMockId: "",
    connectionKind: "hybrid",
    separation: offer.distance,
    poseNote: offer.poseNote,
  };
}

function typologyOf(archetypeId: string, pool: readonly FinalClusterTileRef[]): FinalClusterKind | null {
  const hit = pool.find((tile) => tile.id === archetypeId);
  return hit?.typologyId === "lobby" || hit?.typologyId === "workspace" || hit?.typologyId === "gathering"
    ? hit.typologyId
    : null;
}

function mixOf(tiles: readonly TileInstance[], pool: readonly FinalClusterTileRef[]): Record<FinalClusterKind, number> {
  const mix: Record<FinalClusterKind, number> = { workspace: 0, lobby: 0, gathering: 0 };
  for (const tile of tiles) {
    const kind = typologyOf(tile.archetypeId, pool);
    if (kind) mix[kind] += 1;
  }
  return mix;
}

function shuffle<T>(items: readonly T[], random: () => number): T[] {
  const next = [...items];
  for (let index = next.length - 1; index > 0; index -= 1) {
    const pick = Math.floor(random() * (index + 1));
    const hold = next[index];
    next[index] = next[pick];
    next[pick] = hold;
  }
  return next;
}

type Axis = "x" | "y" | "z";

function dominantAxis(normal: Vec3): { axis: Axis; sign: 1 | -1 } | null {
  const ax = Math.abs(normal.x);
  const ay = Math.abs(normal.y);
  const az = Math.abs(normal.z);
  if (ax >= ay && ax >= az && ax > 0.5) return { axis: "x", sign: normal.x >= 0 ? 1 : -1 };
  if (ay >= ax && ay >= az && ay > 0.5) return { axis: "y", sign: normal.y >= 0 ? 1 : -1 };
  if (az >= ax && az >= ay && az > 0.5) return { axis: "z", sign: normal.z >= 0 ? 1 : -1 };
  return null;
}

function sameColumn(a: TileInstance, b: TileInstance) {
  return Math.abs(a.transform.x - b.transform.x) <= AXIS_TOLERANCE
    && Math.abs(a.transform.z - b.transform.z) <= AXIS_TOLERANCE;
}

function verticalStackCount(tiles: readonly TileInstance[], anchor: TileInstance) {
  return tiles.filter((tile) => sameColumn(tile, anchor)).length;
}

function neighborAlong(
  hostId: string,
  axis: Axis,
  sign: 1 | -1,
  tiles: readonly TileInstance[],
  connections: readonly TileConnection[],
): string | null {
  const host = tiles.find((tile) => tile.instanceId === hostId);
  if (!host) return null;
  for (const connection of connections) {
    if (connection.tileAId !== hostId && connection.tileBId !== hostId) continue;
    const otherId = connection.tileAId === hostId ? connection.tileBId : connection.tileAId;
    const other = tiles.find((tile) => tile.instanceId === otherId);
    if (!other) continue;
    const dx = other.transform.x - host.transform.x;
    const dy = other.transform.y - host.transform.y;
    const dz = other.transform.z - host.transform.z;
    const along = axis === "x" ? dx : axis === "y" ? dy : dz;
    const sideA = axis === "x" ? dy : axis === "y" ? dx : dx;
    const sideB = axis === "x" ? dz : axis === "y" ? dz : dy;
    if (Math.abs(sideA) > AXIS_TOLERANCE || Math.abs(sideB) > AXIS_TOLERANCE) continue;
    if (along * sign > AXIS_TOLERANCE) return otherId;
  }
  return null;
}

/** How many tiles already sit in a collinear run ending at host along this attach direction. */
function lineRunAtHost(
  hostId: string,
  axis: Axis,
  attachSign: 1 | -1,
  tiles: readonly TileInstance[],
  connections: readonly TileConnection[],
) {
  let count = 1;
  let current = hostId;
  // Walk opposite the attach direction: the existing chain behind the host.
  while (count < FINAL_CLUSTER_MAX_LINE + 2) {
    const next = neighborAlong(current, axis, (-attachSign) as 1 | -1, tiles, connections);
    if (!next) break;
    count += 1;
    current = next;
  }
  return count;
}

type Frame = {
  tiles: TileInstance[];
  connections: TileConnection[];
  occupied: Map<string, Set<FaceId>>;
};

const STEP_BACKTRACKS = 8;

function extentOf(tiles: readonly TileInstance[]) {
  const xs = tiles.map((tile) => tile.transform.x);
  const ys = tiles.map((tile) => tile.transform.y);
  const zs = tiles.map((tile) => tile.transform.z);
  return {
    rx: Math.max(...xs) - Math.min(...xs),
    ry: Math.max(...ys) - Math.min(...ys),
    rz: Math.max(...zs) - Math.min(...zs),
  };
}

function binExtent(value: number) {
  if (value < 8) return "0";
  if (value < 35) return "1";
  if (value < 70) return "2";
  return "3";
}

function degreeMap(connections: readonly TileConnection[]) {
  const degrees = new Map<string, number>();
  for (const connection of connections) {
    degrees.set(connection.tileAId, (degrees.get(connection.tileAId) ?? 0) + 1);
    degrees.set(connection.tileBId, (degrees.get(connection.tileBId) ?? 0) + 1);
  }
  return degrees;
}

/** Compact organization tag used to keep the ten clusters structurally distinct. */
export function structureSignature(tiles: readonly TileInstance[], connections: readonly TileConnection[]) {
  const { rx, ry, rz } = extentOf(tiles);
  const dom = ry >= rx && ry >= rz ? "Y" : rx >= rz ? "X" : "Z";
  const axes: string[] = [];
  for (const connection of connections) {
    const a = tiles.find((tile) => tile.instanceId === connection.tileAId);
    const b = tiles.find((tile) => tile.instanceId === connection.tileBId);
    if (!a || !b) continue;
    const axis = dominantAxis({
      x: b.transform.x - a.transform.x,
      y: b.transform.y - a.transform.y,
      z: b.transform.z - a.transform.z,
    });
    axes.push(axis?.axis ?? "?");
  }
  const degrees = [...degreeMap(connections).values()];
  const branch = degrees.length ? Math.max(...degrees) : 0;
  const leaves = degrees.filter((value) => value === 1).length;
  return [
    dom,
    `x${binExtent(rx)}`,
    `y${binExtent(ry)}`,
    `z${binExtent(rz)}`,
    axes.join(""),
    `b${branch}`,
    `l${leaves}`,
    `n${tiles.length}`,
  ].join(":");
}

function lastConnectionAxis(tiles: readonly TileInstance[], connections: readonly TileConnection[]): Axis | null {
  const last = connections[connections.length - 1];
  if (!last) return null;
  const a = tiles.find((tile) => tile.instanceId === last.tileAId);
  const b = tiles.find((tile) => tile.instanceId === last.tileBId);
  if (!a || !b) return null;
  return dominantAxis({
    x: b.transform.x - a.transform.x,
    y: b.transform.y - a.transform.y,
    z: b.transform.z - a.transform.z,
  })?.axis ?? null;
}

function assemblySpan(tiles: readonly TileInstance[]) {
  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;
  for (const tile of tiles) {
    const box = tileBounds(tile);
    minX = Math.min(minX, box.min.x);
    minY = Math.min(minY, box.min.y);
    minZ = Math.min(minZ, box.min.z);
    maxX = Math.max(maxX, box.max.x);
    maxY = Math.max(maxY, box.max.y);
    maxZ = Math.max(maxZ, box.max.z);
  }
  return {
    x: Number.isFinite(minX) ? maxX - minX : 0,
    y: Number.isFinite(minY) ? maxY - minY : 0,
    z: Number.isFinite(minZ) ? maxZ - minZ : 0,
  };
}

/**
 * Soft compact bias. It does not reject a legal attachment and it does not
 * force a cube. Balance, shorter dispersion, and growth on the short axis
 * only change the weight of an attachment that already passed the tree rules.
 */
function compactBias(before: readonly TileInstance[], after: readonly TileInstance[]) {
  const current = assemblySpan(before);
  const next = assemblySpan(after);
  const mean = (next.x + next.y + next.z) / 3;
  const deviation = Math.sqrt(
    ((next.x - mean) ** 2 + (next.y - mean) ** 2 + (next.z - mean) ** 2) / 3,
  );
  const balance = mean > 1 ? 1 - Math.min(1, deviation / mean) : 0;
  const axes = ["x", "y", "z"] as const;
  const shortest = axes.reduce((best, axis) => (current[axis] < current[best] ? axis : best), "x");
  const longest = axes.reduce((best, axis) => (current[axis] > current[best] ? axis : best), "x");
  const towardShort = Math.max(0, next[shortest] - current[shortest]);
  const alongLong = Math.max(0, next[longest] - current[longest]);
  const dispersion = next.x + next.y + next.z;
  return balance * 3.4 + towardShort * 0.08 - alongLong * 0.07 - dispersion * 0.01;
}

function scoreMove(
  character: FinalClusterGrowthCharacter | "compact",
  frame: Frame,
  host: TileInstance,
  axis: Axis | null,
  offer: PoolOffer,
  guestId: string,
  pressure: ReadonlyMap<string, number>,
  random: () => number,
  nextTiles?: readonly TileInstance[],
) {
  const vertical = axis === "y";
  const plan = axis === "x" || axis === "z";
  const degrees = degreeMap(frame.connections);
  const hostDegree = degrees.get(host.instanceId) ?? 0;
  const lastAxis = lastConnectionAxis(frame.tiles, frame.connections);
  const guestCount = frame.tiles.filter((tile) => tile.archetypeId === guestId).length;
  let score = offer.strength + random() * 0.35;
  if (guestCount > 0) score *= 0.42;
  score /= 1 + (pressure.get(guestId) ?? 0) * 0.15;

  switch (character) {
    case "linear":
      score += !lastAxis ? (plan ? 3 : 0.4) : axis === lastAxis ? 4 : 0.45;
      break;
    case "angular":
      score += lastAxis && axis && axis !== lastAxis && plan ? 4.5 : plan ? 1.2 : 0.5;
      break;
    case "branching":
      score += hostDegree >= 1 ? 4 : host.instanceId === "A" ? 2.2 : 0.6;
      break;
    case "vertical":
      score += vertical ? 4.5 : 0.7;
      break;
    case "compact":
      if (nextTiles) score += compactBias(frame.tiles, nextTiles);
      break;
  }
  return score;
}

function pickWeighted<T extends { score: number }>(items: readonly T[], random: () => number) {
  const total = items.reduce((sum, item) => sum + Math.max(0.01, item.score), 0);
  let mark = random() * total;
  for (const item of items) {
    mark -= Math.max(0.01, item.score);
    if (mark <= 0) return item;
  }
  return items[items.length - 1]!;
}

function deepOverlap(left: TileInstance, right: TileInstance) {
  const a = tileBounds(left);
  const b = tileBounds(right);
  const span = (a0: number, a1: number, b0: number, b1: number) => Math.min(a1, b1) - Math.max(a0, b0);
  return span(a.min.x, a.max.x, b.min.x, b.max.x) > 6
    && span(a.min.y, a.max.y, b.min.y, b.max.y) > 6
    && span(a.min.z, a.max.z, b.min.z, b.max.z) > 6;
}

function familiesPresent(tiles: readonly TileInstance[], pool: readonly FinalClusterTileRef[]) {
  return new Set(tiles.map((tile) => typologyOf(tile.archetypeId, pool)).filter((kind): kind is FinalClusterKind => kind != null));
}

/**
 * Seeded stochastic tree growth. Hybrid offers only. World up stays up.
 * A second copy of an archetype is allowed and scored at 0.42. A third copy is rejected.
 * The root quarter-turn is 0–3 about world up. Sideways and inverted roots are not used.
 * Linear, angular, branching, vertical, and compact bias the next edge. They do not define the saved shape.
 * Connector generation and assembly validation run after this function returns a seated tree.
 */
export function growDirectCluster(
  pair: FinalClusterPair,
  targetCount: number,
  seed: number,
  character: FinalClusterGrowthCharacter = "linear",
  pressure: ReadonlyMap<string, number> = new Map(),
  experiment: "compact" | null = null,
): { tiles: TileInstance[]; connections: TileConnection[]; names: string[]; structure: string; intent: FinalClusterGrowthCharacter | "compact"; character: FinalClusterGrowthCharacter | "compact" } | null {
  const pool = tilesForKinds(kindsForPair(pair));
  if (pool.length === 0) return null;
  const linked = (left: string, right: string) =>
    offersBetween(left, right).length > 0 || offersBetween(right, left).length > 0;
  const usable = pool.filter((tile) => pool.some((other) => other.id !== tile.id && linked(tile.id, other.id)));
  const hosts = usable.filter((tile) => usable.some((other) => other.id !== tile.id && offersBetween(tile.id, other.id).length > 0));
  if (hosts.length === 0) return null;

  const random = randomOf(seed);
  const names = new Map(pool.map((tile) => [tile.id, tile.name]));
  const minimum = pair.id === "mixed" ? 3 : 2;
  const count = Math.min(TILE_IDS.length, Math.max(minimum, targetCount));
  if (count < minimum) return null;
  const bias = experiment === "compact" ? "compact" : character;
  const maxLine = bias === "linear" ? count : FINAL_CLUSTER_MAX_LINE;
  const maxVertical = bias === "vertical" ? 4 : FINAL_CLUSTER_MAX_VERTICAL;

  const first = hosts[Math.floor(random() * hosts.length)];
  if (!first) return null;
  const rootQuarter = (Math.floor(random() * 4) as 0 | 1 | 2 | 3);

  const rootId = TILE_IDS[0];
  const stack: Frame[] = [{
    tiles: [blankTile(rootId, first.id, rootQuarter)],
    connections: [],
    occupied: new Map([[rootId, new Set()]]),
  }];
  const blocked = new Set<string>();
  let stuck = 0;

  while (stack.length > 0 && stuck < count * 60) {
    stuck += 1;
    const frame = stack[stack.length - 1];
    if (frame.tiles.length >= count) break;

    const counts = new Map<string, number>();
    for (const tile of frame.tiles) counts.set(tile.archetypeId, (counts.get(tile.archetypeId) ?? 0) + 1);
    const required = kindsForPair(pair);
    const present = familiesPresent(frame.tiles, pool);
    const missing = required.filter((kind) => !present.has(kind));
    const slotsLeft = count - frame.tiles.length;
    let guestPool = usable.filter((tile) => (counts.get(tile.id) ?? 0) < 2);
    if (missing.length > 0 && missing.length >= slotsLeft) {
      const forced = guestPool.filter((tile) => missing.includes(tile.typologyId));
      if (forced.length > 0) guestPool = forced;
    }
    const guests = shuffle(guestPool, random);
    const hosts = shuffle([...frame.tiles], random);

    const moves: { key: string; frame: Frame; score: number }[] = [];
    for (const host of hosts) {
      const used = frame.occupied.get(host.instanceId) ?? new Set<FaceId>();
      const hostBasis = tileBasis(host);
      for (const guest of guests) {
        const offers = shuffle(offersBetween(host.archetypeId, guest.id), random);
        for (const offer of offers) {
          if (used.has(offer.hostFace)) continue;
          const guestId = TILE_IDS[frame.tiles.length];
          if (!guestId) continue;
          const key = `${frame.tiles.length}:${host.instanceId}:${guest.id}:${offer.hostFace}:${offer.guestFace}:${offer.distance.toFixed(1)}`;
          if (blocked.has(key)) continue;

          let seated: TileInstance = blankTile(guestId, guest.id);
          const poseSeat = Math.hypot(offer.localOffset.x, offer.localOffset.y, offer.localOffset.z) > 0.5;
          let axis: ReturnType<typeof dominantAxis>;
          if (poseSeat) {
            const offset = rotateByBasis(hostBasis, offer.localOffset);
            seated = {
              ...seated,
              transform: {
                x: host.transform.x + offset.x,
                y: host.transform.y + offset.y,
                z: host.transform.z + offset.z,
              },
              rotation: mulMat3(hostBasis, offer.localRotation),
              rotationQuarter: 0,
              mirror: null,
            };
            axis = dominantAxis(offset);
          } else {
            const normal = faceWorldNormal(offer.hostFace, host);
            seated = {
              ...seated,
              transform: {
                x: host.transform.x + normal.x * offer.distance,
                y: host.transform.y + normal.y * offer.distance,
                z: host.transform.z + normal.z * offer.distance,
              },
            };
            axis = dominantAxis(normal);
          }
          if (axis && axis.axis !== "y") {
            const run = lineRunAtHost(host.instanceId, axis.axis, axis.sign, frame.tiles, frame.connections);
            if (run >= maxLine) continue;
          }
          if (axis?.axis === "y" && verticalStackCount(frame.tiles, host) >= maxVertical) continue;

          const connection = connectionBetween(host.instanceId, guestId, offer);
          const oriented = orientTiles([...frame.tiles, seated], [...frame.connections, connection]);
          if (oriented.unresolved.has(connection.id)) continue;
          if (oriented.tiles.some((tile, index) => oriented.tiles.slice(index + 1).some((other) => deepOverlap(tile, other)))) continue;
          const guestPlaced = oriented.tiles.find((tile) => tile.instanceId === guestId);
          if (guestPlaced && verticalStackCount(oriented.tiles, guestPlaced) > maxVertical) continue;

          const nextOccupied = new Map([...frame.occupied].map(([id, facesUsed]) => [id, new Set(facesUsed)]));
          nextOccupied.set(host.instanceId, new Set([...used, offer.hostFace]));
          nextOccupied.set(guestId, new Set([offer.guestFace]));
          const nextFrame: Frame = {
            tiles: oriented.tiles,
            connections: [...frame.connections, connection],
            occupied: nextOccupied,
          };
          moves.push({
            key,
            frame: nextFrame,
            score: scoreMove(bias, frame, host, axis?.axis ?? null, offer, guest.id, pressure, random, oriented.tiles),
          });
        }
      }
    }

    if (moves.length > 0) {
      let poolMoves = moves;
      if (bias === "linear" || bias === "angular") {
        const planMoves = moves.filter((move) => {
          const axis = lastConnectionAxis(move.frame.tiles, move.frame.connections);
          return axis === "x" || axis === "z";
        });
        if (planMoves.length > 0 && random() < (bias === "linear" ? 0.85 : 0.7)) poolMoves = planMoves;
      }
      if (bias === "vertical") {
        const upMoves = moves.filter((move) => lastConnectionAxis(move.frame.tiles, move.frame.connections) === "y");
        if (upMoves.length > 0 && random() < 0.8) poolMoves = upMoves;
      }
      const pick = pickWeighted(poolMoves, random);
      blocked.add(pick.key);
      stack.push(pick.frame);
      continue;
    }

    const depth = frame.tiles.length;
    for (const key of [...blocked]) {
      if (key.startsWith(`${depth}:`)) blocked.delete(key);
    }
    if (stack.length <= 1) break;
    let pops = 0;
    while (stack.length > 1 && pops < STEP_BACKTRACKS) {
      stack.pop();
      pops += 1;
      if (random() < 0.5) break;
    }
  }

  const frame = stack[stack.length - 1];
  if (!frame || frame.tiles.length !== count || frame.connections.length !== count - 1) return null;
  const present = familiesPresent(frame.tiles, pool);
  if (kindsForPair(pair).some((kind) => !present.has(kind))) return null;
  if (frame.tiles.some((tile) => frame.tiles.filter((other) => other.archetypeId === tile.archetypeId).length > 2)) return null;
  return {
    tiles: frame.tiles,
    connections: frame.connections,
    names: frame.tiles.map((tile) => names.get(tile.archetypeId) ?? tile.archetypeId),
    structure: structureSignature(frame.tiles, frame.connections),
    intent: bias,
    character: bias,
  };
}

/** Experiment index. It is not a catalog slot. The bias rule matches attemptDirectCluster. */
export const PROCESS_EXPERIMENT_INDEX = 900;

export function experimentGrowthCharacter(attempt: number): FinalClusterGrowthBias {
  const safe = Math.max(0, Math.round(attempt));
  const shift = safe > 40 ? Math.floor(safe / 20) : 0;
  return FINAL_CLUSTER_GROWTH_BIASES[(PROCESS_EXPERIMENT_INDEX + shift) % FINAL_CLUSTER_GROWTH_BIASES.length]!;
}

/**
 * `index` is the catalog slot. `attempt` is the retry counter, not the slot.
 * Preference is `(slot + shift) mod 5`, and shift is `floor(attempt / 20)` only after attempt 40.
 * Compact is the fifth assigned bias. Realized topology stays the four-class reading.
 * RNG seed is `seedFor(category, slot * 1000 + attempt + 17)`.
 */
export function attemptDirectCluster(
  pair: FinalClusterPair,
  index: number,
  size: number,
  attempt: number,
  pressure: ReadonlyMap<string, number> = new Map(),
) {
  const shift = attempt > 40 ? Math.floor(attempt / 20) : 0;
  const bias = FINAL_CLUSTER_GROWTH_BIASES[(index + shift) % FINAL_CLUSTER_GROWTH_BIASES.length]!;
  return growDirectCluster(
    pair,
    size,
    seedFor(pair.id, index * 1000 + attempt + 17),
    bias === "compact" ? "linear" : bias,
    pressure,
    bias === "compact" ? "compact" : null,
  );
}
