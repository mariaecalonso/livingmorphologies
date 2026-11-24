import { evaluateClusterMorphology, readVerticalSupport, spineEndIds, tileDegrees } from "./cluster-morphology";
import type { TileConnection } from "./connections";
import { envelopeWidth, type TileInstance } from "./tiles";

/**
 * Program bias among placements that are already legal.
 * A nudge never accepts a collision, an incompatible face, or a hard shape failure.
 */
export type PlacementNudge = {
  preference: string;
  weight: number;
  read: (delta: PlacementDelta) => number;
};

export type PlacementDelta = {
  tiles: number;
  verticalStep: number;
  horizontalStep: number;
  heightGain: number;
  spreadGain: number;
  fieldGain: number;
  branchGain: number;
  directionGain: number;
  enclosureGain: number;
  hostDegree: number;
  hostsGained: number;
  onEnd: number;
  turn: number;
  straight: number;
  twist: number;
  clearance: number;
  pockets: number;
  pocketGain: number;
  dominantShare: number;
  openSide: number;
  enclosed: number;
  symmetry: number;
  spine: number;
  levels: number;
  levelGain: number;
  elevated: number;
  elevatedGain: number;
  transitions: number;
  transitionGain: number;
};

function clamp(value: number, min = -1, max = 1) {
  return Math.min(max, Math.max(min, value));
}

function unit(value: number, span: number) {
  if (span <= 0) return 0;
  return clamp(value / span);
}

function planField(tiles: readonly TileInstance[]) {
  const empty = { pockets: 0, dominantShare: 1, openSide: 0, enclosed: 0, symmetry: 0, held: 0 };
  if (tiles.length < 2) return empty;
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
  if (nx < 2 || nz < 2 || nx * nz > 12000) return empty;
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
  const held = new Uint8Array(nx * nz);
  const see = (x: number, z: number, sx: number, sz: number) => {
    for (let step = 1; step <= reach; step += 1) {
      const xx = x + sx * step;
      const zz = z + sz * step;
      if (xx < 0 || zz < 0 || xx >= nx || zz >= nz) return false;
      if (solid[zz * nx + xx]) return true;
    }
    return false;
  };
  for (let z = 1; z < nz - 1; z += 1) {
    for (let x = 1; x < nx - 1; x += 1) {
      if (solid[z * nx + x]) continue;
      const px = see(x, z, 1, 0);
      const nxHit = see(x, z, -1, 0);
      const pz = see(x, z, 0, 1);
      const nzHit = see(x, z, 0, -1);
      const pairs = Number(px && nxHit) + Number(pz && nzHit);
      const hits = Number(px) + Number(nxHit) + Number(pz) + Number(nzHit);
      if (pairs >= 2 || (pairs >= 1 && hits >= 3)) held[z * nx + x] = 1;
    }
  }
  const seen = new Uint8Array(nx * nz);
  let pockets = 0;
  let largest = 0;
  let total = 0;
  for (let z = 1; z < nz - 1; z += 1) {
    for (let x = 1; x < nx - 1; x += 1) {
      const start = z * nx + x;
      if (!held[start] || seen[start]) continue;
      pockets += 1;
      let count = 0;
      const queue = [start];
      seen[start] = 1;
      while (queue.length > 0) {
        const index = queue.pop();
        if (index == null) break;
        count += 1;
        const cx = index % nx;
        const cz = Math.floor(index / nx);
        for (const [sx, sz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
          const xx = cx + sx;
          const zz = cz + sz;
          if (xx < 0 || zz < 0 || xx >= nx || zz >= nz) continue;
          const next = zz * nx + xx;
          if (!held[next] || seen[next]) continue;
          seen[next] = 1;
          queue.push(next);
        }
      }
      total += count;
      if (count > largest) largest = count;
    }
  }
  const edge = (cells: number, solids: number) => (cells > 0 ? solids / cells : 0);
  let top = 0;
  let bottom = 0;
  let left = 0;
  let right = 0;
  let topN = 0;
  let bottomN = 0;
  let leftN = 0;
  let rightN = 0;
  for (let x = 0; x < nx; x += 1) {
    topN += 1;
    bottomN += 1;
    top += solid[x];
    bottom += solid[(nz - 1) * nx + x];
  }
  for (let z = 0; z < nz; z += 1) {
    leftN += 1;
    rightN += 1;
    left += solid[z * nx];
    right += solid[z * nx + nx - 1];
  }
  const borders = [edge(topN, top), edge(bottomN, bottom), edge(leftN, left), edge(rightN, right)];
  const densest = Math.max(...borders);
  const sparsest = Math.min(...borders);
  let cx = 0;
  let cz = 0;
  let solids = 0;
  for (let z = 0; z < nz; z += 1) {
    for (let x = 0; x < nx; x += 1) {
      if (!solid[z * nx + x]) continue;
      cx += x;
      cz += z;
      solids += 1;
    }
  }
  const quadrants = [0, 0, 0, 0];
  if (solids > 0) {
    cx /= solids;
    cz /= solids;
    for (let z = 0; z < nz; z += 1) {
      for (let x = 0; x < nx; x += 1) {
        if (!solid[z * nx + x]) continue;
        quadrants[(x >= cx ? 1 : 0) + (z >= cz ? 2 : 0)] += 1;
      }
    }
  }
  const mean = solids / 4;
  const skew = quadrants.reduce((sum, count) => sum + Math.abs(count - mean), 0);
  return {
    pockets,
    dominantShare: total > 0 ? largest / total : 1,
    openSide: densest - sparsest,
    enclosed: sparsest,
    symmetry: solids > 0 ? clamp(1 - skew / solids, 0, 1) : 0,
    held: total,
  };
}

function addedStep(beforeTiles: readonly TileInstance[], beforeConnections: readonly TileConnection[], afterTiles: readonly TileInstance[], afterConnections: readonly TileConnection[]) {
  const known = new Set(beforeConnections.map((connection) => connection.id));
  const added = afterConnections.find((connection) => !known.has(connection.id));
  const at = new Map(afterTiles.map((tile) => [tile.instanceId, tile.transform]));
  if (!added) return { verticalStep: 0, horizontalStep: 0, turn: 0, straight: 0, twist: 0, hostDegree: 0, onEnd: 0 };
  const a = at.get(added.tileAId);
  const b = at.get(added.tileBId);
  if (!a || !b) return { verticalStep: 0, horizontalStep: 0, turn: 0, straight: 0, twist: 0, hostDegree: 0, onEnd: 0 };
  const module = envelopeWidth();
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dz = b.z - a.z;
  const horizontal = Math.hypot(dx, dz);
  const beforeIds = new Set(beforeTiles.map((tile) => tile.instanceId));
  const hostId = beforeIds.has(added.tileAId) ? added.tileAId : added.tileBId;
  const hostDegree = tileDegrees(beforeTiles, beforeConnections).get(hostId) ?? 0;
  const onEnd = spineEndIds(beforeTiles, beforeConnections).has(hostId) || hostDegree <= 1 ? 1 : 0;
  let align = 0;
  if (horizontal > 1 && beforeConnections.length > 0) {
    const ux = dx / horizontal;
    const uz = dz / horizontal;
    const prior = new Map(beforeTiles.map((tile) => [tile.instanceId, tile.transform]));
    for (const connection of beforeConnections) {
      if (connection.tileAId !== hostId && connection.tileBId !== hostId) continue;
      const left = prior.get(connection.tileAId);
      const right = prior.get(connection.tileBId);
      if (!left || !right) continue;
      const span = Math.hypot(right.x - left.x, right.z - left.z);
      if (span < 1) continue;
      align = Math.max(align, Math.abs(((right.x - left.x) / span) * ux + ((right.z - left.z) / span) * uz));
    }
  }
  const axis = horizontal > 1 ? Math.max(Math.abs(dx), Math.abs(dz)) / horizontal : 1;
  return {
    verticalStep: clamp(Math.abs(dy) / module, 0, 1.4) / 1.4,
    horizontalStep: clamp(horizontal / (module * 1.6), 0, 1),
    turn: beforeConnections.length === 0 ? 0 : clamp(1 - align, 0, 1),
    straight: align > 0.82 ? 1 : 0,
    twist: axis < 0.9 ? clamp((0.9 - axis) / 0.35, 0, 1) : 0,
    hostDegree,
    onEnd,
  };
}

function hosts(tiles: readonly TileInstance[], connections: readonly TileConnection[]) {
  let count = 0;
  for (const degree of tileDegrees(tiles, connections).values()) {
    if (degree >= 2) count += 1;
  }
  return count;
}

export function readPlacementDelta(
  beforeTiles: readonly TileInstance[],
  beforeConnections: readonly TileConnection[],
  afterTiles: readonly TileInstance[],
  afterConnections: readonly TileConnection[],
  spacing: number,
): PlacementDelta {
  const before = evaluateClusterMorphology(beforeTiles, beforeConnections, "public-lobby");
  const after = evaluateClusterMorphology(afterTiles, afterConnections, "public-lobby");
  const beforeField = planField(beforeTiles);
  const afterField = planField(afterTiles);
  const step = addedStep(beforeTiles, beforeConnections, afterTiles, afterConnections);
  const module = envelopeWidth();
  const spreadReady = beforeTiles.length >= 2 && afterTiles.length >= 3;
  const beforeRise = readVerticalSupport(beforeTiles, beforeConnections);
  const afterRise = readVerticalSupport(afterTiles, afterConnections);
  return {
    tiles: afterTiles.length,
    verticalStep: step.verticalStep,
    horizontalStep: step.horizontalStep,
    heightGain: unit(after.height - before.height, module),
    spreadGain: spreadReady ? clamp(after.planSpread - before.planSpread, -1, 1) : 0,
    fieldGain: unit(afterField.held - beforeField.held, 18),
    branchGain: clamp(after.meaningfulBranches - before.meaningfulBranches, -1, 1),
    directionGain: clamp(after.directions - before.directions, -1, 1),
    enclosureGain: clamp(after.enclosureDirections - before.enclosureDirections, -1, 1),
    hostDegree: step.hostDegree,
    hostsGained: clamp(hosts(afterTiles, afterConnections) - hosts(beforeTiles, beforeConnections), -1, 1),
    onEnd: step.onEnd,
    turn: step.turn,
    straight: step.straight,
    twist: step.twist,
    clearance: clamp((spacing - module * 0.35) / (module * 0.5), 0, 1),
    pockets: afterField.pockets,
    pocketGain: clamp(afterField.pockets - beforeField.pockets, -1, 1),
    dominantShare: afterTiles.length < 3 ? 0 : clamp(afterField.dominantShare, 0, 1),
    openSide: afterTiles.length < 3 ? 0 : clamp(afterField.openSide, 0, 1),
    enclosed: afterTiles.length < 3 ? 0 : clamp(afterField.enclosed, 0, 1),
    symmetry: afterTiles.length < 3 ? 0 : afterField.symmetry,
    spine: afterTiles.length < 4 ? 0 : clamp(after.spineShare, 0, 1),
    levels: after.verticalLevels,
    levelGain: clamp(after.verticalLevels - before.verticalLevels, -1, 1),
    elevated: afterRise.elevatedTiles,
    elevatedGain: clamp(afterRise.elevatedTiles - beforeRise.elevatedTiles, -1, 1),
    transitions: afterRise.verticalTransitionCount,
    transitionGain: clamp(afterRise.verticalTransitionCount - beforeRise.verticalTransitionCount, -1, 1),
  };
}

function nudge(preference: string, weight: number, read: (delta: PlacementDelta) => number): PlacementNudge {
  return { preference, weight, read };
}

const NUDGES: Record<string, PlacementNudge[]> = {
  "public-lobby": [
    nudge("substantial vertical around the void", 3.4, (delta) => {
      if (delta.elevated === 1 && delta.verticalStep < 0.35 && delta.tiles >= 4) return -1;
      if (delta.elevated <= 1 && delta.verticalStep > 0.35) return -0.35;
      if (delta.elevated >= 2 && (delta.elevatedGain > 0 || delta.transitionGain > 0 || delta.heightGain > 0.15)) return 1;
      return 0;
    }),
    nudge("several approaches", 1.15, (delta) => clamp(delta.directionGain + delta.enclosureGain * 0.8)),
    nudge("one dominant open field", 1.35, (delta) => (delta.dominantShare > 0.62 && delta.pockets <= 2 ? 0.8 + delta.fieldGain * 0.4 : 0) - (delta.pockets >= 3 && delta.dominantShare < 0.5 ? 1 : 0)),
    nudge("penalize flat fragmented clusters", 1.15, (delta) => (delta.tiles >= 4 && delta.verticalStep < 0.25 && delta.levels <= 1 ? -0.3 : 0) - (delta.pockets >= 3 ? 0.7 : 0)),
  ],
  "private-staff-lobby": [
    nudge("compact plan", 1.45, (delta) => clamp(0.55 - delta.horizontalStep * 0.9 - Math.max(0, delta.spreadGain) * 0.8 + (delta.spreadGain < 0 ? 0.2 : 0))),
    nudge("moderate enclosure", 1.15, (delta) => clamp(delta.enclosureGain * 0.7 + (delta.enclosed > 0.15 && delta.enclosed < 0.7 ? 0.5 : 0) - (delta.enclosed > 0.85 ? 0.4 : 0))),
    nudge("one clear direction", 1.2, (delta) => clamp(delta.onEnd * 0.5 + delta.straight * 0.4 - delta.directionGain * 0.3 - (delta.hostDegree >= 2 ? 0.7 : 0))),
    nudge("penalize height and dispersal", 1.55, (delta) => clamp(-delta.verticalStep * 1.1 - delta.levelGain - Math.max(0, delta.fieldGain) * 0.4)),
  ],
  "architecture-design-studio": [
    nudge("horizontal plan spread", 1.8, (delta) => clamp(delta.horizontalStep * 1.15 + delta.spreadGain - delta.verticalStep * 1.15)),
    nudge("one continuous open field", 1.4, (delta) => clamp(delta.fieldGain * 0.8 + (delta.dominantShare > 0.7 ? 0.6 : 0) - (delta.pockets >= 3 ? 0.8 : 0))),
    nudge("visual continuity", 1.1, (delta) => clamp(delta.straight * 0.5 - delta.twist * 0.6 - (delta.pockets >= 3 ? 0.4 : 0))),
    nudge("penalize stacking and pockets", 1.6, (delta) => clamp(-delta.verticalStep * 1.2 - delta.levelGain - (delta.pockets >= 3 ? 0.8 : 0))),
  ],
  "product-design-studio": [
    nudge("branching", 1.55, (delta) => clamp(delta.branchGain + (delta.hostDegree >= 2 ? 0.7 : 0) + delta.hostsGained * 0.4)),
    nudge("mixed open and work pockets", 1.35, (delta) => clamp((delta.pockets >= 2 && delta.dominantShare < 0.82 ? 0.7 : 0) + delta.pocketGain * 0.5 - (delta.pockets <= 1 && delta.dominantShare > 0.85 ? 0.8 : 0))),
    nudge("moderate enclosure", 1.05, (delta) => clamp(delta.enclosureGain * 0.6)),
    nudge("several directions", 1.2, (delta) => clamp(delta.directionGain - delta.straight * 0.35)),
  ],
  "prototyping-fabrication-lab": [
    nudge("broad horizontal clearance", 1.75, (delta) => clamp(delta.horizontalStep + delta.clearance * 0.9 + Math.max(0, delta.spreadGain) - delta.verticalStep)),
    nudge("direct organization", 1.35, (delta) => clamp(delta.straight * 0.8 - delta.twist - delta.turn * 0.7)),
    nudge("one clear field", 1.2, (delta) => clamp((delta.dominantShare > 0.65 ? 0.5 : 0) - (delta.pockets >= 3 ? 1 : 0) - (delta.clearance < 0.25 && delta.pockets >= 2 ? 0.6 : 0))),
    nudge("penalize stacking", 1.5, (delta) => clamp(-delta.verticalStep * 1.2 - delta.levelGain)),
  ],
  "biological-research-lab": [
    nudge("cellular pockets", 1.6, (delta) => clamp(delta.pocketGain + (delta.pockets >= 2 && delta.dominantShare < 0.75 ? 0.7 : 0) - (delta.dominantShare > 0.88 && delta.pockets <= 1 ? 1 : 0))),
    nudge("branching across plan and section", 1.45, (delta) => clamp(delta.branchGain + (delta.hostDegree >= 2 ? 0.45 : 0) + (delta.verticalStep > 0.4 && (delta.branchGain > 0 || delta.pocketGain > 0) ? 0.4 : 0))),
    nudge("layered staggered pockets", 1.75, (delta) => {
      if (delta.verticalStep <= 0.4 && delta.levelGain <= 0) return 0;
      if (delta.tiles < 5) return 0.05;
      const pocket = delta.pocketGain > 0 || (delta.elevatedGain > 0 && delta.elevated >= 2) ? 0.25 : 0;
      const tallHall = delta.dominantShare > 0.9 && delta.pockets <= 1 ? 0.4 : 0;
      return clamp(0.85 + pocket - tallHall);
    }),
    nudge("penalize a linear hall", 1.45, (delta) => clamp(-delta.straight * 0.7 - (delta.spine > 0.8 ? 0.8 : 0) - (delta.dominantShare > 0.9 ? 0.5 : 0))),
  ],
  "interdisciplinary-collaboration-hub": [
    nudge("a new meaningful branch", 1.8, (delta) => clamp(delta.branchGain * 1.1 + (delta.hostDegree >= 2 ? 0.85 : -0.25) + delta.hostsGained)),
    nudge("several growth directions", 1.45, (delta) => clamp(delta.directionGain * 1.1 + delta.turn * 0.3 - delta.straight * 0.45)),
    nudge("distributed connected voids", 1.3, (delta) => clamp(delta.pocketGain * 0.6 + (delta.pockets >= 2 ? 0.45 : 0) + delta.enclosureGain * 0.3)),
    nudge("penalize a spine or a stub branch", 1.6, (delta) => clamp(-(delta.spine > 0.72 ? 0.9 : 0) - (delta.onEnd > 0 && delta.hostDegree <= 1 && delta.branchGain <= 0 ? 0.7 : 0))),
  ],
  "public-exhibition-gallery": [
    nudge("a turn along the sequence", 1.7, (delta) => clamp(delta.onEnd * 0.7 + delta.turn * 0.9 - (delta.hostDegree >= 2 ? 0.8 : 0))),
    nudge("compression and release", 1.35, (delta) => clamp(Math.abs(delta.spreadGain) * 0.8 + (delta.turn > 0.35 ? Math.abs(delta.fieldGain) * 0.4 : 0))),
    nudge("penalize a straight corridor", 1.55, (delta) => clamp(delta.straight > 0 && delta.turn < 0.25 ? -1 : delta.turn * 0.2)),
    nudge("penalize a radial center", 1.4, (delta) => clamp(delta.hostDegree >= 2 && delta.onEnd === 0 ? -1 : 0)),
  ],
  "indoor-public-gathering": [
    nudge("one shared void", 1.6, (delta) => clamp((delta.dominantShare > 0.62 ? 0.8 : 0) + delta.fieldGain * 0.5 - (delta.pockets >= 3 && delta.dominantShare < 0.45 ? 1 : 0))),
    nudge("solids around several sides", 1.35, (delta) => clamp(delta.enclosureGain + delta.directionGain * 0.5)),
    nudge("broad usable floor", 1.2, (delta) => clamp(delta.horizontalStep * 0.5 + Math.max(0, delta.spreadGain) * 0.6)),
    nudge("penalize a long chain", 1.4, (delta) => clamp(-(delta.spine > 0.78 ? 1 : 0) - delta.straight * 0.4)),
  ],
  "waterfront-gathering": [
    nudge("one open direction", 1.7, (delta) => clamp(delta.openSide * 1.3 - delta.symmetry * 0.4)),
    nudge("asymmetric enclosure", 1.4, (delta) => clamp((1 - delta.symmetry) * 0.8 + delta.enclosureGain * 0.3 - (delta.enclosed > 0.72 ? 1 : 0))),
    nudge("solids holding the other sides", 1.15, (delta) => clamp(delta.enclosed > 0.12 && delta.enclosed < 0.62 ? 0.7 : delta.enclosureGain * 0.3)),
    nudge("penalize a centered radial room", 1.45, (delta) => clamp(-(delta.symmetry > 0.72 && delta.hostDegree >= 2 ? 1 : 0) - (delta.enclosed > 0.8 ? 0.7 : 0))),
  ],
  "public-restaurant": [
    nudge("several connected pockets", 1.55, (delta) => clamp(delta.pocketGain + (delta.pockets >= 2 && delta.pockets <= 4 ? 0.6 : 0) - (delta.pockets <= 1 && delta.dominantShare > 0.85 ? 0.9 : 0))),
    nudge("branching circulation", 1.4, (delta) => clamp(delta.branchGain + (delta.hostDegree >= 2 ? 0.55 : 0) - delta.straight * 0.3)),
    nudge("an open zone with contained edges", 1.2, (delta) => clamp((delta.dominantShare > 0.35 && delta.dominantShare < 0.8 ? 0.5 : 0) + delta.enclosureGain * 0.4)),
    nudge("penalize one hall, a chain, or routine stacking", 1.9, (delta) => {
      if (delta.verticalStep > 0.35 || delta.levelGain > 0) return -1;
      return clamp(-(delta.spine > 0.8 ? 0.9 : 0) - (delta.pockets <= 1 && delta.straight > 0 ? 0.5 : 0));
    }),
  ],
  "staff-dining": [
    nudge("compact short organization", 1.55, (delta) => clamp(0.4 - delta.horizontalStep * 0.7 - Math.max(0, delta.spreadGain) + (delta.onEnd && delta.tiles <= 4 ? 0.3 : 0))),
    nudge("moderate enclosure", 1.15, (delta) => clamp(delta.enclosureGain * 0.5 + (delta.enclosed > 0.12 && delta.enclosed < 0.7 ? 0.45 : 0))),
    nudge("one to three pockets", 1.25, (delta) => clamp((delta.pockets >= 1 && delta.pockets <= 3 ? 0.6 : 0) - (delta.pockets >= 4 ? 0.8 : 0))),
    nudge("penalize height, branches, and dispersal", 3.8, (delta) => {
      const rises = delta.verticalStep > 0.35 || delta.levelGain > 0 || delta.elevatedGain > 0;
      const helpsCompact = rises && delta.spreadGain < -0.12 && delta.enclosed > 0.12 && delta.horizontalStep < 0.45;
      if (rises) return helpsCompact ? -0.45 : -1;
      return clamp(-delta.branchGain * 0.8 - Math.max(0, delta.fieldGain) * 0.35);
    }),
  ],
};

export function programPlacementNudges(programId: string): readonly PlacementNudge[] {
  return NUDGES[programId] ?? [];
}

/** Scales the existing candidate score. 1 leaves the generic score unchanged. */
export function programNudgeFactor(
  programId: string,
  beforeTiles: readonly TileInstance[],
  beforeConnections: readonly TileConnection[],
  afterTiles: readonly TileInstance[],
  afterConnections: readonly TileConnection[],
  spacing: number,
) {
  const nudges = programPlacementNudges(programId);
  if (nudges.length === 0) return 1;
  const delta = readPlacementDelta(beforeTiles, beforeConnections, afterTiles, afterConnections, spacing);
  const raw = nudges.reduce((sum, item) => sum + item.weight * item.read(delta), 0);
  return Math.min(3.3, Math.max(0.3, Math.exp(raw * 0.3)));
}
