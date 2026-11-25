import { TYPOLOGIES } from "@/lib/catalog";
import type { TypologyId } from "@/lib/types";
import { SITE_ARCHETYPES } from "@/lib/skill5/catalog";
import { rankCompatibleFaces } from "./cluster-face-pair";
import { ADJACENCY_TOLERANCE, connectionId, tileBounds, type TileConnection } from "./connections";
import type { FaceId, Vec3 } from "./contract";
import {
  emptyCatalog,
  FINAL_CLUSTER_GENERATOR,
  FINAL_CLUSTER_MAX_LINE,
  FINAL_CLUSTER_MAX_VERTICAL,
  FINAL_CLUSTER_PAIRS,
  FINAL_CLUSTER_STRUCTURE_INTENTS,
  kindsForPair,
  sizeScheduleForPair,
  type FinalClusterKind,
  type FinalClusterPair,
  type FinalClusterPairId,
  type FinalClusterStructureIntent,
  type FinalClusterSummary,
  type FinalClustersCatalogDocument,
} from "./final-cluster-pairs";
import { faceWorldNormal, orientTiles } from "./tile-orientation";
import { IDENTITY_BASIS, rotateByBasis, tileBasis, type Mat3 } from "./tile-basis";
import { envelopeWidth, HYBRID_GAP, type TileInstance } from "./tiles";

export {
  emptyCatalog,
  FINAL_CLUSTER_GENERATOR,
  FINAL_CLUSTER_MAX_LINE,
  FINAL_CLUSTER_MAX_VERTICAL,
  FINAL_CLUSTER_PAIRS,
  FINAL_CLUSTER_SIZE_SCHEDULE,
  FINAL_CLUSTER_STRUCTURE_INTENTS,
  FINAL_CLUSTERS_PER_PAIR,
  kindsForPair,
  sizeScheduleForPair,
  type FinalClusterKind,
  type FinalClusterPair,
  type FinalClusterPairId,
  type FinalClusterStructureIntent,
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
  intent?: FinalClusterStructureIntent;
  hybridReady: boolean;
  validated: boolean;
  generator: typeof FINAL_CLUSTER_GENERATOR;
};

export function summarizeCluster(cluster: FinalClusterRecord): FinalClusterSummary {
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
    pool.some((other) => other.id !== tile.id && rankCompatibleFaces(tile.id, other.id).length > 0),
  ).length;
}

export function scheduleForPair(pair: FinalClusterPair) {
  return sizeScheduleForPair(pair.a === pair.b, uniquePoolSizeForPair(pair));
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

function seedFor(pairId: string, index: number) {
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

/** World reorientation after seating. orientTiles keeps assemblies upright; this tips whole clusters. */
function worldBasisForIntent(intent: FinalClusterStructureIntent, random: () => number): Mat3 {
  const upright = IDENTITY_BASIS;
  const yaw90: Mat3 = [0, 0, -1, 0, 1, 0, 1, 0, 0];
  const yaw180: Mat3 = [-1, 0, 0, 0, 1, 0, 0, 0, -1];
  const yaw270: Mat3 = [0, 0, 1, 0, 1, 0, -1, 0, 0];
  const tipX: Mat3 = [0, 1, 0, 1, 0, 0, 0, 0, 1];
  const tipNegX: Mat3 = [0, -1, 0, -1, 0, 0, 0, 0, 1];
  const tipZ: Mat3 = [1, 0, 0, 0, 0, -1, 0, 1, 0];
  const tipNegZ: Mat3 = [1, 0, 0, 0, 0, 1, 0, -1, 0];
  const yaws = [upright, yaw90, yaw180, yaw270];
  const tips = [tipX, tipNegX, tipZ, tipNegZ];
  const pick = <T,>(items: readonly T[]) => items[Math.floor(random() * items.length)]!;
  switch (intent) {
    case "vertical-spine":
      return pick(yaws);
    case "plan-spread":
    case "horizontal-first":
      return mulMat3(pick(yaws), pick(tips));
    case "l-elbow":
    case "early-turn":
    case "corner-stack":
      return random() < 0.65 ? mulMat3(pick(yaws), pick(tips)) : pick(yaws);
    case "compact":
    case "axis-alternate":
    case "branch-from-seed":
    case "branch-tips":
      return random() < 0.5 ? mulMat3(pick(yaws), pick(tips)) : pick(yaws);
    default:
      return pick(yaws);
  }
}

function bakeWorldBasis(tiles: readonly TileInstance[], basis: Mat3): TileInstance[] {
  if (basis === IDENTITY_BASIS || (
    basis[0] === 1 && basis[1] === 0 && basis[2] === 0
    && basis[3] === 0 && basis[4] === 1 && basis[5] === 0
    && basis[6] === 0 && basis[7] === 0 && basis[8] === 1
  )) {
    return tiles.map((tile) => ({ ...tile, transform: { ...tile.transform } }));
  }
  return tiles.map((tile) => {
    const local = tileBasis(tile);
    return {
      ...tile,
      transform: rotateByBasis(basis, tile.transform),
      rotation: mulMat3(basis, local),
      rotationQuarter: 0,
      mirror: null,
    };
  });
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

function scoreMove(
  intent: FinalClusterStructureIntent,
  frame: Frame,
  host: TileInstance,
  axis: Axis | null,
  nextTiles: readonly TileInstance[],
  random: () => number,
) {
  const before = extentOf(frame.tiles);
  const after = extentOf(nextTiles);
  const growth = (after.rx - before.rx) + (after.ry - before.ry) + (after.rz - before.rz);
  const planGrowth = (after.rx - before.rx) + (after.rz - before.rz);
  const vertical = axis === "y";
  const plan = axis === "x" || axis === "z";
  const degrees = degreeMap(frame.connections);
  const hostDegree = degrees.get(host.instanceId) ?? 0;
  const lastAxis = lastConnectionAxis(frame.tiles, frame.connections);
  let score = 1 + random() * 0.35;

  switch (intent) {
    case "vertical-spine":
      score += vertical ? 4 : plan ? 0.4 : 1;
      break;
    case "plan-spread":
      score += plan ? 5 : vertical ? 0.2 : 1;
      score += planGrowth * 0.04;
      break;
    case "l-elbow":
      if (!lastAxis) score += 1;
      else if (axis && axis !== lastAxis) score += 5;
      else score += 0.3;
      break;
    case "early-turn":
      score += axis && lastAxis && axis !== lastAxis ? 4 : 1;
      break;
    case "branch-from-seed":
      score += host.instanceId === "A" ? 5 : hostDegree === 0 ? 2 : 0.4;
      break;
    case "branch-tips": {
      const isLeaf = frame.tiles.length < 2 || hostDegree <= 1;
      score += isLeaf ? 4.5 : 0.35;
      break;
    }
    case "horizontal-first":
      if (frame.connections.length === 0) score += plan ? 8 : 0.1;
      else score += plan ? 2.5 : 1;
      break;
    case "compact":
      score += Math.max(0.2, 4 - growth * 0.05);
      break;
    case "axis-alternate":
      if (!lastAxis) score += 1.5;
      else if (axis && axis !== lastAxis) score += 5;
      else score += 0.25;
      break;
    case "corner-stack":
      if (frame.connections.length < 2) score += plan ? 4 : 0.5;
      else score += vertical ? 4 : plan ? 1.2 : 1;
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

/**
 * Random Final Cluster growth with a structural brief.
 * - No archetype repeats.
 * - Collinear runs stop at 3 (or 2 for early-turn).
 * - Vertical stacks stop at 3.
 * - Root yaw is randomized so world organization can leave the default upright.
 */
export function growDirectCluster(
  pair: FinalClusterPair,
  targetCount: number,
  seed: number,
  intent: FinalClusterStructureIntent = "plan-spread",
): { tiles: TileInstance[]; connections: TileConnection[]; names: string[]; structure: string; intent: FinalClusterStructureIntent } | null {
  const pool = tilesForKinds(kindsForPair(pair));
  if (pool.length === 0) return null;
  const usable = pool.filter((tile) =>
    pool.some((other) => other.id !== tile.id && rankCompatibleFaces(tile.id, other.id).length > 0),
  );
  if (usable.length === 0) return null;
  const faceRank = rankCompatibleFaces;

  const random = randomOf(seed);
  const names = new Map(usable.map((tile) => [tile.id, tile.name]));
  const uniqueCap = usable.length;
  const count = Math.min(TILE_IDS.length, uniqueCap, Math.max(2, targetCount));
  if (count < 2) return null;
  const maxLine = intent === "early-turn" ? Math.min(2, FINAL_CLUSTER_MAX_LINE) : FINAL_CLUSTER_MAX_LINE;

  const first = usable[Math.floor(random() * usable.length)];
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

    const usedArchetypes = new Set(frame.tiles.map((tile) => tile.archetypeId));
    const mix = mixOf(frame.tiles, usable);
    const needOther = pair.a !== pair.b && (mix[pair.a] === 0 || mix[pair.b] === 0);
    const missingKind: FinalClusterKind | null = needOther
      ? (mix[pair.a] === 0 ? pair.a : pair.b)
      : null;

    let guestPool = usable.filter((tile) => !usedArchetypes.has(tile.id));
    if (missingKind) {
      const forced = guestPool.filter((tile) => tile.typologyId === missingKind);
      if (forced.length > 0) guestPool = forced;
    }
    // Prefer tiles that unlock horizontal faces when the brief wants plan growth.
    if (intent === "plan-spread" || intent === "horizontal-first" || intent === "l-elbow") {
      guestPool = [...guestPool].sort((left, right) => {
        const score = (id: string) => {
          let horizontal = 0;
          for (const host of frame.tiles) {
            for (const face of faceRank(host.archetypeId, id)) {
              const axis = dominantAxis(faceWorldNormal(face.faceA, host));
              if (axis && axis.axis !== "y") horizontal += 1;
            }
          }
          return horizontal;
        };
        return score(right.id) - score(left.id);
      });
    }
    const guests = shuffle(guestPool, random);
    const hosts = shuffle([...frame.tiles], random);

    const moves: { key: string; frame: Frame; score: number }[] = [];
    for (const host of hosts) {
      const used = frame.occupied.get(host.instanceId) ?? new Set<FaceId>();
      for (const guest of guests) {
        const faces = shuffle(faceRank(host.archetypeId, guest.id), random);
        for (const pairFace of faces) {
          if (used.has(pairFace.faceA)) continue;
          const guestId = TILE_IDS[frame.tiles.length];
          if (!guestId) continue;
          const key = `${frame.tiles.length}:${host.instanceId}:${guest.id}:${pairFace.faceA}:${pairFace.faceB}`;
          if (blocked.has(key)) continue;

          const normal = faceWorldNormal(pairFace.faceA, host);
          const axis = dominantAxis(normal);
          if (axis) {
            const run = lineRunAtHost(host.instanceId, axis.axis, axis.sign, frame.tiles, frame.connections);
            if (run >= maxLine) continue;
          }

          const step = envelopeWidth() + HYBRID_GAP;
          const seated: TileInstance = {
            ...blankTile(guestId, guest.id),
            transform: {
              x: host.transform.x + normal.x * step,
              y: host.transform.y + normal.y * step,
              z: host.transform.z + normal.z * step,
            },
          };

          if (axis?.axis === "y") {
            const column = verticalStackCount(frame.tiles, host);
            if (column >= FINAL_CLUSTER_MAX_VERTICAL) continue;
          } else if (verticalStackCount([...frame.tiles, seated], seated) > FINAL_CLUSTER_MAX_VERTICAL) {
            continue;
          }

          const connection = connectionBetween(host.instanceId, guestId, pairFace.faceA, pairFace.faceB);
          const oriented = orientTiles([...frame.tiles, seated], [...frame.connections, connection]);
          if (oriented.unresolved.has(connection.id)) continue;
          if (collides(oriented.tiles)) continue;

          const guestPlaced = oriented.tiles.find((tile) => tile.instanceId === guestId);
          if (guestPlaced && verticalStackCount(oriented.tiles, guestPlaced) > FINAL_CLUSTER_MAX_VERTICAL) continue;

          const nextOccupied = new Map([...frame.occupied].map(([id, facesUsed]) => [id, new Set(facesUsed)]));
          nextOccupied.set(host.instanceId, new Set([...used, pairFace.faceA]));
          nextOccupied.set(guestId, new Set([pairFace.faceB]));
          const nextFrame: Frame = {
            tiles: oriented.tiles,
            connections: [...frame.connections, connection],
            occupied: nextOccupied,
          };
          moves.push({
            key,
            frame: nextFrame,
            score: scoreMove(intent, frame, host, axis?.axis ?? null, oriented.tiles, random),
          });
        }
      }
    }

    if (moves.length > 0) {
      let poolMoves = moves;
      if (intent === "horizontal-first" && frame.connections.length === 0) {
        const planMoves = moves.filter((move) => {
          const axis = lastConnectionAxis(move.frame.tiles, move.frame.connections);
          return axis === "x" || axis === "z";
        });
        if (planMoves.length > 0) poolMoves = planMoves;
      }
      if (intent === "plan-spread") {
        const planMoves = moves.filter((move) => {
          const axis = lastConnectionAxis(move.frame.tiles, move.frame.connections);
          return axis === "x" || axis === "z";
        });
        if (planMoves.length > 0 && random() < 0.72) poolMoves = planMoves;
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
  const unique = new Set(frame.tiles.map((tile) => tile.archetypeId));
  if (unique.size !== frame.tiles.length) return null;
  if (pair.a !== pair.b) {
    const mix = mixOf(frame.tiles, usable);
    if (mix[pair.a] < 1 || mix[pair.b] < 1) return null;
  }
  const oriented = bakeWorldBasis(frame.tiles, worldBasisForIntent(intent, random));
  return {
    tiles: oriented,
    connections: frame.connections,
    names: oriented.map((tile) => names.get(tile.archetypeId) ?? tile.archetypeId),
    structure: structureSignature(oriented, frame.connections),
    intent,
  };
}

export function attemptDirectCluster(pair: FinalClusterPair, index: number, size: number, attempt: number) {
  const intent = FINAL_CLUSTER_STRUCTURE_INTENTS[index % FINAL_CLUSTER_STRUCTURE_INTENTS.length]!;
  return growDirectCluster(pair, size, seedFor(pair.id, index * 1000 + attempt + 17), intent);
}
