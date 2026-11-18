/**
 * Shared geometric realization for the Initial Clustering Lab.
 * Engines decide which discrete candidate to try. This file measures, rejects, and records.
 * Patching, Boolean union, and refinement stay in assembleCluster and run once per finished record.
 */
import {
  SKILL6_CONTRACT,
  SKILL6_GROWTH_DIRECTIONS,
  SKILL6_PARAMETERS,
  type ClusterMorphology,
  type ClusterRecord,
  type ClusterTile,
  type ContactRelation,
  type GrowthDirection,
  type Mat3,
  type SearchStats,
  type Skill6Algorithm,
  type Skill6Pose,
  type Vec3,
} from "../contract";
import { composePose, measureEnvelope, scanCrossings } from "../envelope";
import { length, poseBounds, poseWithBasis, scale, sub } from "../geometry";
import { growthDirection, growthRejection } from "../grow";
import { connectedGroups, measureCluster } from "../metrics";
import type { ArchetypeMesh } from "../source";
import { rankReadings, readShape } from "./morphology";
import type { DockCandidate } from "./pool";

const IDENTITY: Mat3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];

export type Placement = {
  tiles: ClusterTile[];
  contacts: ContactRelation[];
};

export type AttachResult =
  | { ok: true; placement: Placement; direction: GrowthDirection; area: number; up: number }
  | { ok: false; reason: string };

type CacheEntry = { ok: true; world: Skill6Pose; measured: ReturnType<typeof measureEnvelope>; deepest: number; direction: GrowthDirection } | { ok: false; reason: string };

export type Board = {
  meshes: readonly ArchetypeMesh[];
  byId: Map<string, ArchetypeMesh>;
  seed(rootId: string): Placement;
  tryAttach(placement: Placement, hostIndex: number, candidate: DockCandidate): AttachResult;
  record(id: string, seed: number, placement: Placement, status: ClusterRecord["status"], reason: string | null, algorithm: Skill6Algorithm, search: SearchStats): ClusterRecord;
  tests: number;
};

export type EngineJob = {
  id: string;
  seed: number;
  tiles: number;
  rootId: string;
  morphology: ClusterMorphology;
  /** Uncached geometric tests allowed on the board. The same number for every engine at one size. */
  budget?: number;
  /** Rule-Based backtrack cap for one experiment. Absent means the established cap of 8. */
  backtracks?: number;
};

/** The chosen record first, then distinct alternatives the runner may assemble if the first fails final validation. */
export type EngineOutcome = { record: ClusterRecord; alternatives: ClusterRecord[] };

/** Rounded archetypes and poses. Two placements with the same key are the same geometry. */
export function placementKey(tiles: readonly ClusterTile[]): string {
  return tiles.map((tile) => `${tile.archetypeId}@${poseKey(tile.pose)}`).sort().join(";");
}

/** The pair contact and host crossing at identity. Rigid, so it holds wherever the host is placed. */
export function pairValid(host: ArchetypeMesh, guest: ArchetypeMesh, pose: Skill6Pose): boolean {
  const home = poseWithBasis(0, false, IDENTITY, [0, 0, 0]);
  if (!passes(measureEnvelope(host, guest, home, pose))) return false;
  return scanCrossings(host, guest, home, pose).count <= SKILL6_PARAMETERS.maxIntersectingTriangles;
}

function passes(reading: ReturnType<typeof measureEnvelope>): boolean {
  return reading.coherentRegions === 1
    && reading.contactArea >= SKILL6_PARAMETERS.minContactArea
    && reading.residualGap != null
    && reading.residualGap <= SKILL6_PARAMETERS.contactTolerance
    && reading.normalAlignment != null
    && reading.normalAlignment <= -SKILL6_PARAMETERS.normalOpposition;
}

function contactOf(
  hostId: string,
  guestId: string,
  measured: ReturnType<typeof measureEnvelope>,
  deepest: number,
  note: string,
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
    normalAlignment: measured.normalAlignment ?? 0,
    hostNormal,
    guestNormal: scale(hostNormal, -1),
    samples: measured.samples,
    rejected: [],
    intersectingTriangles: deepest > SKILL6_PARAMETERS.maxPenetration ? 1 : 0,
    deepestCrossing: deepest,
    overlapVolume: null,
    attachment: "envelope",
    searchNote: note,
    registrationOverlap: false,
    tightBox: "touch",
    tolerance: SKILL6_PARAMETERS.contactTolerance,
  };
}

function poseKey(pose: Skill6Pose): string {
  return `${pose.basis.map((value) => value.toFixed(2)).join(",")}|${pose.translation.map((value) => value.toFixed(2)).join(",")}`;
}

export function createBoard(meshes: readonly ArchetypeMesh[]): Board {
  const byId = new Map(meshes.map((mesh) => [mesh.archetypeId, mesh]));
  const cache = new Map<string, CacheEntry>();
  let tests = 0;
  const seed = (rootId: string): Placement => {
    const mesh = byId.get(rootId);
    if (!mesh) return { tiles: [], contacts: [] };
    const home = poseWithBasis(0, false, IDENTITY, [0, 0, 0]);
    const low = poseBounds(mesh.tight, home).min[2];
    const pose = low < 0 ? poseWithBasis(0, false, IDENTITY, [0, 0, -low]) : home;
    return {
      tiles: [{
        instanceId: "t00",
        archetypeId: mesh.archetypeId,
        moduleId: mesh.moduleId,
        typologyId: mesh.typologyId,
        name: mesh.name,
        pose,
      }],
      contacts: [],
    };
  };
  const tryAttach = (placement: Placement, hostIndex: number, candidate: DockCandidate): AttachResult => {
    const host = placement.tiles[hostIndex];
    const hostMesh = host ? byId.get(host.archetypeId) : undefined;
    const guestMesh = byId.get(candidate.guest);
    if (!host || !hostMesh || !guestMesh || host.archetypeId !== candidate.host) return { ok: false, reason: "The candidate host does not match this tile." };
    const key = `${placement.tiles.map((tile) => poseKey(tile.pose)).join("/")}#${host.instanceId}#${candidate.id}`;
    let found = cache.get(key);
    if (!found) {
      tests += 1;
      const world = composePose(host.pose, candidate.pose);
      const hostBox = poseBounds(hostMesh.tight, host.pose);
      const guestBox = poseBounds(guestMesh.tight, world);
      const rejected = growthRejection(hostBox, guestBox, SKILL6_GROWTH_DIRECTIONS);
      if (rejected) found = { ok: false, reason: rejected };
      else {
        const measured = measureEnvelope(hostMesh, guestMesh, host.pose, world);
        if (!passes(measured)) found = { ok: false, reason: "The coherent region missed the area, residual, or alignment limit." };
        else {
          let deepest = 0;
          let blocked = false;
          for (const tile of placement.tiles) {
            const mesh = byId.get(tile.archetypeId);
            if (!mesh) continue;
            const hit = scanCrossings(mesh, guestMesh, tile.pose, world);
            if (hit.deepest > deepest) deepest = hit.deepest;
            if (hit.count > SKILL6_PARAMETERS.maxIntersectingTriangles) blocked = true;
          }
          const direction = growthDirection(hostMesh, host.pose, guestMesh, world);
          found = blocked
            ? { ok: false, reason: `Triangle crossing depth ${deepest.toFixed(3)} exceeds ${SKILL6_PARAMETERS.maxPenetration}.` }
            : { ok: true, world, measured, deepest, direction };
        }
      }
      cache.set(key, found);
    }
    if (!found.ok) return found;
    const instanceId = `t${String(placement.tiles.length).padStart(2, "0")}`;
    const tile: ClusterTile = {
      instanceId,
      archetypeId: guestMesh.archetypeId,
      moduleId: guestMesh.moduleId,
      typologyId: guestMesh.typologyId,
      name: guestMesh.name,
      pose: found.world,
    };
    const contacts = [contactOf(host.instanceId, instanceId, found.measured, found.deepest, candidate.note)];
    for (let index = 0; index < placement.tiles.length; index += 1) {
      if (index === hostIndex) continue;
      const other = placement.tiles[index];
      const otherMesh = byId.get(other.archetypeId);
      if (!otherMesh) continue;
      const secondary = measureEnvelope(otherMesh, guestMesh, other.pose, found.world);
      if (!passes(secondary)) continue;
      contacts.push(contactOf(other.instanceId, instanceId, secondary, found.deepest, `${candidate.note} extra`));
    }
    return {
      ok: true,
      placement: { tiles: [...placement.tiles, tile], contacts: [...placement.contacts, ...contacts] },
      direction: found.direction,
      area: found.measured.contactArea,
      up: found.world.basis[8],
    };
  };
  const record = (
    id: string,
    seedValue: number,
    placement: Placement,
    status: ClusterRecord["status"],
    reason: string | null,
    algorithm: Skill6Algorithm,
    search: SearchStats,
  ): ClusterRecord => {
    const groups = placement.tiles.length > 0 ? connectedGroups(placement.tiles, placement.contacts) : [];
    const metrics = placement.tiles.length > 0 ? measureCluster(placement.tiles, placement.contacts, byId) : null;
    const connected = groups.length === 1;
    const accepted = status === "accepted" && placement.tiles.length >= 2 && connected;
    return {
      contract: SKILL6_CONTRACT,
      id,
      status: accepted ? "accepted" : "unsuccessful",
      reason: accepted ? reason : reason ?? "The arrangement is not one connected component.",
      algorithm,
      seed: seedValue,
      parameters: SKILL6_PARAMETERS,
      tiles: placement.tiles,
      contacts: placement.contacts,
      components: groups,
      metrics,
      search,
    };
  };
  return { meshes, byId, seed, tryAttach, record, get tests() { return tests; } };
}

const ALTERNATIVES = 3;

/** Distinct placements ranked by the shared morphology reading. Ties and duplicates never reach the runner twice. */
export function finish(
  board: Board,
  job: EngineJob,
  found: readonly Placement[],
  algorithm: Skill6Algorithm,
  search: (placement: Placement) => SearchStats,
  reasonFor: (placement: Placement) => string | null,
): EngineOutcome {
  const seen = new Set<string>();
  const distinct = found.filter((placement) => {
    if (placement.tiles.length === 0) return false;
    const key = placementKey(placement.tiles);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  if (distinct.length === 0) distinct.push(board.seed(job.rootId));
  const readings = distinct.map((placement) => readShape(placement.tiles, placement.contacts, board.byId));
  const order = rankReadings(job.morphology, readings);
  const records = order.slice(0, ALTERNATIVES + 1).map((index, rank) => {
    const placement = distinct[index];
    return board.record(
      rank === 0 ? job.id : `${job.id}-alt${rank}`,
      job.seed,
      placement,
      placement.tiles.length >= 2 ? "accepted" : "unsuccessful",
      reasonFor(placement),
      algorithm,
      search(placement),
    );
  });
  return { record: records[0], alternatives: records.slice(1) };
}
