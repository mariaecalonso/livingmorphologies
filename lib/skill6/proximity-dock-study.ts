/**
 * Surface proximity docking against the fixed and adaptive seats already recorded.
 * Writes data/skill6/experiments/proximity-dock-v1/ and refreshes data/skill6/atlas/v1.json.
 * The compatibility library and the catalog are not written.
 *
 * Run: npx tsx lib/skill6/proximity-dock-study.ts
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { assembleCluster, encodeMesh } from "./assembly";
import { poseAtGap, type SeatCandidate } from "./adaptive-seat";
import {
  ATLAS_PATH,
  acceptedPoses,
  candidatePoses,
  entriesFromAdaptive,
  entryFromMeasurement,
  mergeEntries,
  pairHistory,
  poseKey,
  sourceRevision,
  writeAtlas,
  type AtlasEntry,
  type AtlasFile,
} from "./atlas";
import {
  SKILL6_CONTRACT,
  SKILL6_COVERAGE_ALGORITHM,
  SKILL6_PARAMETERS,
  type ClusterRecord,
  type ContactRelation,
  type SearchStats,
  type Skill6Pose,
  type Vec3,
} from "./contract";
import { IDENTITY, poseWithBasis, sub } from "./geometry";
import { connectedGroups, measureCluster } from "./metrics";
import { measurePreservation } from "./preservation";
import { dockPose, dockRegions, searchProximityDock, type DockAttempt } from "./proximity-dock";
import { loadArchetypeMeshes, type ArchetypeMesh } from "./source";
import type { EnvelopeSpec } from "./envelope";

const DIRECTORY = path.join(process.cwd(), "data", "skill6", "experiments", "proximity-dock-v1");
const ADAPTIVE = path.join(process.cwd(), "data", "skill6", "experiments", "adaptive-seating-v1", "index.json");
const AXIS: Record<string, Vec3> = { "+X": [1, 0, 0], "-X": [-1, 0, 0], "+Y": [0, 1, 0], "-Y": [0, -1, 0], "+Z": [0, 0, 1], "-Z": [0, 0, -1] };

type DirectionRecord = {
  key: string;
  host: string;
  guest: string;
  orientation?: { axis?: string; yaw?: number; pitch?: number; roll?: number; mirrorX?: boolean };
  fixed?: { accepted?: boolean; contactArea?: number; gap?: number } | null;
  adaptive?: { accepted?: boolean; contactArea?: number; gap?: number; growthDirection?: string } | null;
  distances?: { contactArea?: number }[];
};

function verifyAtlas(atlas: AtlasFile, meshes: readonly ArchetypeMesh[]) {
  const revision = sourceRevision(meshes);
  if (atlas.sourceRevision !== revision) throw new Error("Atlas revision does not match the loaded meshes.");
  if (atlas.entries.some((entry) => entry.closed !== false)) throw new Error("A historical rejection was stored as a closed pair.");
  const adaptive = atlas.entries.find((entry) => entry.method === "adaptive-seating-v1" && entry.outcome === "accepted" && entry.parameters.axis && entry.parameters.yaw != null && entry.parameters.shift.every((value) => value === 0));
  if (!adaptive) throw new Error("No centered adaptive pose was indexed.");
  const host = meshes.find((mesh) => mesh.archetypeId === adaptive.host);
  const guest = meshes.find((mesh) => mesh.archetypeId === adaptive.guest);
  const axis = AXIS[adaptive.parameters.axis ?? ""];
  if (!host || !guest || !axis) throw new Error("Indexed adaptive pose cannot be rebuilt.");
  const spec: EnvelopeSpec = {
    yaw: adaptive.parameters.yaw ?? 0,
    pitch: adaptive.parameters.pitch ?? 0,
    roll: adaptive.parameters.roll ?? 0,
    axis,
    axisName: adaptive.parameters.axis ?? "+X",
    gap: adaptive.parameters.gap,
    mirrorX: Boolean(adaptive.parameters.mirrorX),
  };
  const rebuilt = poseAtGap(host, guest, spec, adaptive.parameters.gap, adaptive.parameters.shift as Vec3);
  const delta = sub(rebuilt.translation, adaptive.pose.translation as Vec3);
  if (Math.hypot(delta[0], delta[1], delta[2]) > 1e-3) throw new Error(`Adaptive pose did not rebuild (${Math.hypot(delta[0], delta[1], delta[2]).toFixed(4)}).`);
  const rejected = atlas.entries.find((entry) => entry.host === "continuous-hall" && entry.outcome === "rejected");
  if (!rejected) throw new Error("Continuous Hall has no rejected history.");
  const history = pairHistory(atlas, rejected.host, rejected.guest);
  if (history.closed !== false || history.rejected < 1) throw new Error("Rejected history was dropped.");
  if (acceptedPoses(atlas, rejected.host, rejected.guest).some((entry) => entry.id === rejected.id)) throw new Error("A rejected pose was offered as a candidate.");
  if (candidatePoses(atlas, adaptive.host, adaptive.guest).some((pose) => pose.revalidate !== true)) throw new Error("A candidate pose skipped revalidation.");
  if (mergeEntries(atlas.entries, atlas.entries).length !== atlas.entries.length) throw new Error("Identical records were duplicated.");
  const again = candidatePoses(atlas, adaptive.host, adaptive.guest);
  if (again.length < 1) throw new Error("Retrieval returned no accepted pose.");
}

function selectPairs(directions: DirectionRecord[], assemblyKeys: string[]) {
  const byKey = new Map(directions.map((direction) => [direction.key, direction]));
  const chosen: DirectionRecord[] = [];
  const take = (direction: DirectionRecord | undefined) => {
    if (direction && !chosen.some((item) => item.key === direction.key)) chosen.push(direction);
  };
  for (const key of assemblyKeys) take(byKey.get(key));
  const rejected = directions.filter((direction) => !direction.adaptive?.accepted);
  const area = (direction: DirectionRecord) => Math.max(direction.fixed?.contactArea ?? 0, ...(direction.distances ?? []).map((item) => item.contactArea ?? 0));
  rejected.sort((left, right) => area(right) - area(left));
  take(rejected.find((direction) => direction.host === "continuous-hall"));
  const seenHost = new Set<string>();
  for (const direction of rejected) {
    if (chosen.length >= assemblyKeys.length + 8) break;
    if (seenHost.has(direction.host)) continue;
    seenHost.add(direction.host);
    take(direction);
  }
  return chosen;
}

function remembered(entries: readonly AtlasEntry[], host: string, guest: string) {
  const byId = new Map(entries.filter((entry) => entry.host === host && entry.guest === guest).map((entry) => [entry.id, entry]));
  return (pose: Skill6Pose, gap: number): SeatCandidate | null => {
    const entry = byId.get(poseKey(host, guest, pose, gap));
    if (!entry) return null;
    return {
      gap,
      shift: entry.parameters.shift as Vec3,
      accepted: entry.outcome === "accepted",
      pose,
      contactArea: entry.contact.area,
      coherentRegions: entry.contact.coherentRegions,
      residualGap: entry.contact.residualGap,
      minSurfaceDistance: entry.contact.minSurfaceDistance,
      normalAlignment: entry.contact.normalAlignment,
      deepestCrossing: entry.contact.deepestCrossing,
      overlapVolume: entry.contact.overlapVolume,
      reason: entry.reason,
      relation: {
        contactNormal: entry.region.contactNormal,
        displacement: entry.region.displacement ?? [0, 0, 0],
        elevation: { hostMinZ: 0, hostMaxZ: 0, guestMinZ: 0, guestMaxZ: 0, guestBaseAboveHostTop: 0 },
        growthDirection: (entry.region.growthDirection ?? "+X") as SeatCandidate["relation"]["growthDirection"],
        growthAllowed: ["+X", "-X", "+Y", "-Y", "+Z"].includes(entry.region.growthDirection ?? ""),
      },
    };
  };
}

function pairRecord(id: string, host: ArchetypeMesh, guest: ArchetypeMesh, candidate: SeatCandidate): ClusterRecord {
  const home = poseWithBasis(0, false, IDENTITY, [0, 0, 0]);
  const normal = candidate.relation.contactNormal ?? [0, 0, 1];
  const contact: ContactRelation = {
    hostId: "t00",
    guestId: "t01",
    hostPatch: "envelope",
    guestPatch: "envelope",
    verdict: candidate.residualGap != null && candidate.residualGap <= SKILL6_PARAMETERS.targetGap ? "surface-contact" : "near-contact",
    minSurfaceDistance: candidate.minSurfaceDistance,
    residualGap: candidate.residualGap,
    contactArea: candidate.contactArea,
    coherentRegions: candidate.coherentRegions,
    normalAlignment: candidate.normalAlignment ?? 0,
    hostNormal: normal,
    guestNormal: [-normal[0], -normal[1], -normal[2]],
    samples: [],
    rejected: [],
    intersectingTriangles: 0,
    deepestCrossing: candidate.deepestCrossing,
    overlapVolume: candidate.overlapVolume,
    attachment: "envelope",
    searchNote: `surface docking gap ${candidate.gap} ${candidate.relation.growthDirection}`,
    registrationOverlap: false,
    tightBox: "touch",
    tolerance: SKILL6_PARAMETERS.contactTolerance,
  };
  const tiles = [host, guest].map((mesh, index) => ({
    instanceId: `t0${index}`,
    archetypeId: mesh.archetypeId,
    moduleId: mesh.moduleId,
    typologyId: mesh.typologyId,
    name: mesh.name,
    pose: index === 0 ? home : candidate.pose,
  }));
  const byId = new Map([host, guest].map((mesh) => [mesh.archetypeId, mesh]));
  const search: SearchStats = { evaluations: 1, acceptedPoses: 1, backtracks: 0, milliseconds: 0, exhausted: false, truncated: false, untried: 0, geometricRejections: 0, rejectionCounts: { intersection: 0, containment: 0, contact: 0 }, depthLimit: null, stop: "reached" };
  return {
    contract: SKILL6_CONTRACT,
    id,
    status: "accepted",
    reason: "Two-tile proximity docking check. Not a catalog cluster.",
    algorithm: SKILL6_COVERAGE_ALGORITHM,
    seed: 0,
    parameters: SKILL6_PARAMETERS,
    tiles,
    contacts: [contact],
    components: connectedGroups(tiles, [contact]),
    metrics: measureCluster(tiles, [contact], byId),
    search,
  };
}

function dockEntries(hostId: string, guestId: string, attempts: DockAttempt[], meshes: readonly ArchetypeMesh[], revision: string): AtlasEntry[] {
  const found: AtlasEntry[] = [];
  for (const attempt of attempts) {
    const measured = attempt.chosen ?? attempt.nearMiss;
    if (!measured || attempt.skipped) continue;
    const entry = entryFromMeasurement({
      host: hostId,
      guest: guestId,
      meshes,
      revision,
      method: "proximity-dock-v1",
      experiment: "proximity-dock-v1",
      measured,
      twist: attempt.twist,
      hostRegion: attempt.hostRegion,
      guestRegion: attempt.guestRegion,
      orientation: { axis: "surface" },
    });
    if (entry) found.push(entry);
  }
  return found;
}

async function main() {
  const meshes = loadArchetypeMeshes();
  const byId = new Map(meshes.map((mesh) => [mesh.archetypeId, mesh]));
  const revision = sourceRevision(meshes);
  const adaptive = JSON.parse(readFileSync(ADAPTIVE, "utf8")) as { directions: DirectionRecord[]; assemblies?: { key: string }[] };
  const prior = entriesFromAdaptive(adaptive, meshes, revision);
  let entries = mergeEntries([], prior);
  const atlas: AtlasFile = {
    version: 1,
    sourceRevision: revision,
    note: "Compatibility atlas. Not the cluster catalog. Accepted poses are candidates and must be revalidated on the assembled cluster. Rejected searches stay in the history and do not close a pair.",
    closedPairs: false,
    experiments: [],
    entries,
  };
  verifyAtlas(atlas, meshes);
  console.log(`atlas ${entries.length} records from fixed and adaptive seating, revision ${revision}`);

  const pairs = selectPairs(adaptive.directions, (adaptive.assemblies ?? []).map((item) => item.key));
  mkdirSync(DIRECTORY, { recursive: true });
  const comparisons: Record<string, unknown>[] = [];
  for (const pair of pairs) {
    const host = byId.get(pair.host);
    const guest = byId.get(pair.guest);
    if (!host || !guest) throw new Error(`Missing mesh ${pair.key}`);
    const search = await searchProximityDock(host, guest, remembered(entries, pair.host, pair.guest));
    const winner = search.chosen;
    entries = mergeEntries(entries, dockEntries(pair.host, pair.guest, search.attempts, meshes, revision));
    const row = {
      key: pair.key,
      host: pair.host,
      guest: pair.guest,
      fixedAccepted: Boolean(pair.fixed?.accepted),
      adaptiveAccepted: Boolean(pair.adaptive?.accepted),
      adaptiveArea: pair.adaptive?.contactArea ?? null,
      adaptiveDirection: pair.adaptive?.growthDirection ?? null,
      dockAccepted: Boolean(winner),
      dockArea: winner?.contactArea ?? null,
      dockGap: winner?.gap ?? null,
      dockDirection: winner?.relation.growthDirection ?? null,
      dockNormal: winner?.relation.contactNormal ?? null,
      directions: search.directions,
      beyondAdaptive: Boolean(winner) && !pair.adaptive?.accepted,
      tested: search.tested,
      skippedCurvature: search.skippedCurvature,
      skippedPrefilter: search.skippedPrefilter,
      milliseconds: search.milliseconds,
      attempts: search.attempts.map((attempt) => ({
        hostRegion: attempt.hostRegion,
        guestRegion: attempt.guestRegion,
        twist: attempt.twist,
        curvature: [attempt.hostCurvature, attempt.guestCurvature],
        skipped: attempt.skipped,
        accepted: Boolean(attempt.chosen),
        area: attempt.chosen?.contactArea ?? attempt.nearMiss?.contactArea ?? null,
        gap: attempt.chosen?.gap ?? attempt.nearMiss?.gap ?? null,
        direction: attempt.chosen?.relation.growthDirection ?? null,
        reason: attempt.chosen?.reason ?? attempt.nearMiss?.reason ?? null,
        pose: attempt.chosen ? { basis: [...attempt.chosen.pose.basis], translation: [...attempt.chosen.pose.translation], quarterZ: attempt.chosen.pose.quarterZ, mirrorX: attempt.chosen.pose.mirrorX } : null,
      })),
    };
    comparisons.push(row);
    console.log(`${pair.host} → ${pair.guest} fixed ${row.fixedAccepted ? "yes" : "no"} adaptive ${row.adaptiveAccepted ? "yes" : "no"} dock ${row.dockAccepted ? `yes ${row.dockArea?.toFixed(1)} ${row.dockDirection}` : "no"} ${search.milliseconds} ms`);
  }

  const reproducible = comparisons.find((row) => row.dockAccepted && (row.attempts as { pose: { translation: number[] } | null; twist: number; gap: number | null }[]).some((attempt) => attempt.pose));
  if (reproducible) {
    const attempt = (reproducible.attempts as { pose: { basis: number[]; translation: number[] } | null; twist: number; gap: number | null; hostRegion: string; guestRegion: string }[]).find((item) => item.pose && item.gap != null);
    const host = byId.get(reproducible.host as string)!;
    const guest = byId.get(reproducible.guest as string)!;
    const hostRegion = dockRegions(host).find((region) => region.id === attempt?.hostRegion);
    const guestRegion = dockRegions(guest).find((region) => region.id === attempt?.guestRegion);
    if (!attempt?.pose || !hostRegion || !guestRegion || attempt.gap == null) throw new Error("Dock pose is missing its regions.");
    const rebuilt = dockPose(host, guest, hostRegion, guestRegion, attempt.twist, attempt.gap);
    const delta = sub(rebuilt.translation, attempt.pose.translation as Vec3);
    if (Math.hypot(delta[0], delta[1], delta[2]) > 1e-3) throw new Error("Dock pose did not rebuild.");
  }

  atlas.entries = entries;
  writeAtlas(atlas, ATLAS_PATH);
  verifyAtlas(atlas, meshes);

  const novel = comparisons.filter((row) => row.beyondAdaptive && row.dockDirection && ["+X", "-X", "+Y", "-Y", "+Z"].includes(String(row.dockDirection)));
  novel.sort((left, right) => Number(right.dockArea) - Number(left.dockArea));
  const shared = comparisons.filter((row) => row.dockAccepted && row.adaptiveAccepted && row.dockDirection !== row.adaptiveDirection);
  const assemble = [...novel.slice(0, 2), ...shared.slice(0, 1)].slice(0, 3);
  if (assemble.length === 0) {
    const fallback = comparisons.filter((row) => row.dockAccepted && ["+X", "-X", "+Y", "-Y", "+Z"].includes(String(row.dockDirection))).sort((left, right) => Number(right.dockArea) - Number(left.dockArea))[0];
    if (fallback) assemble.push(fallback);
  }
  const assemblies: unknown[] = [];
  for (const row of assemble) {
    const attempt = (row.attempts as { accepted: boolean; pose: Skill6Pose | null; gap: number | null; area: number | null; direction: string | null }[]).find((item) => item.accepted && item.pose);
    if (!attempt?.pose || attempt.gap == null || attempt.area == null) continue;
    const host = byId.get(row.host as string)!;
    const guest = byId.get(row.guest as string)!;
    const candidate: SeatCandidate = {
      gap: attempt.gap,
      shift: [0, 0, 0],
      accepted: true,
      pose: attempt.pose,
      contactArea: attempt.area,
      coherentRegions: 1,
      residualGap: null,
      minSurfaceDistance: null,
      normalAlignment: null,
      deepestCrossing: 0,
      overlapVolume: null,
      reason: null,
      relation: { contactNormal: row.dockNormal as Vec3 | null, displacement: [0, 0, 0], elevation: { hostMinZ: 0, hostMaxZ: 0, guestMinZ: 0, guestMaxZ: 0, guestBaseAboveHostTop: 0 }, growthDirection: attempt.direction as SeatCandidate["relation"]["growthDirection"], growthAllowed: true },
    };
    const stored = entries.find((entry) => entry.id === poseKey(row.host as string, row.guest as string, attempt.pose as Skill6Pose, attempt.gap));
    if (stored) {
      candidate.residualGap = stored.contact.residualGap;
      candidate.normalAlignment = stored.contact.normalAlignment;
      candidate.minSurfaceDistance = stored.contact.minSurfaceDistance;
      candidate.deepestCrossing = stored.contact.deepestCrossing;
      candidate.overlapVolume = stored.contact.overlapVolume;
      candidate.coherentRegions = stored.contact.coherentRegions;
    }
    const id = `dock-${row.host}-${row.guest}`.replace(/[^a-z0-9+-]+/gi, "-");
    const record = pairRecord(id, host, guest, candidate);
    const built = await assembleCluster(record, meshes, `data/skill6/experiments/proximity-dock-v1/${id}.mesh.json`);
    if (!built.meshes.raw || !built.meshes.refined) {
      assemblies.push({ id, assembled: false });
      continue;
    }
    const seated = new Map(built.assembly.seatedTiles.map((tile) => [tile.instanceId, tile.pose]));
    const preservation = await measurePreservation({
      tiles: record.tiles.map((tile) => ({ instanceId: tile.instanceId, archetypeId: tile.archetypeId, mesh: byId.get(tile.archetypeId)!, pose: seated.get(tile.instanceId)! })),
      raw: built.meshes.raw,
      refined: built.meshes.refined,
      patches: built.meshes.patches,
      patchStats: built.assembly.joints.map((joint) => ({ volume: joint.patch?.volume ?? null, hostOverlap: joint.patch?.hostOverlap ?? null, guestOverlap: joint.patch?.guestOverlap ?? null })),
      refinerFilled: built.assembly.refined.cavitiesFilled,
    });
    writeFileSync(path.join(DIRECTORY, `${id}.mesh.json`), JSON.stringify({ id, raw: encodeMesh(built.meshes.raw), refined: encodeMesh(built.meshes.refined), patches: built.meshes.patches.map((mesh) => encodeMesh(mesh)) }));
    assemblies.push({
      id,
      key: row.key,
      beyondAdaptive: row.beyondAdaptive,
      dockArea: row.dockArea,
      dockDirection: row.dockDirection,
      joint: built.assembly.joints.map((joint) => joint.classification),
      originalVoidAltered: preservation.originalVoidAltered,
      originalOpeningAltered: preservation.originalOpeningAltered,
      review: preservation.review,
      preservation,
      milliseconds: built.assembly.milliseconds,
    });
    console.log(`assembled ${id} void ${preservation.originalVoidAltered} opening ${preservation.originalOpeningAltered}`);
  }

  const gained = comparisons.filter((row) => row.beyondAdaptive);
  const summary = {
    pairs: comparisons.length,
    fixedAccepted: comparisons.filter((row) => row.fixedAccepted).length,
    adaptiveAccepted: comparisons.filter((row) => row.adaptiveAccepted).length,
    dockAccepted: comparisons.filter((row) => row.dockAccepted).length,
    beyondAdaptive: gained.length,
    beyondAdaptiveAllowed: gained.filter((row) => ["+X", "-X", "+Y", "-Y", "+Z"].includes(String(row.dockDirection))).length,
    directionCounts: comparisons.reduce<Record<string, number>>((counts, row) => {
      for (const direction of row.directions as string[]) counts[direction] = (counts[direction] ?? 0) + 1;
      return counts;
    }, {}),
    tested: comparisons.reduce((sum, row) => sum + Number(row.tested), 0),
    skippedCurvature: comparisons.reduce((sum, row) => sum + Number(row.skippedCurvature), 0),
    skippedPrefilter: comparisons.reduce((sum, row) => sum + Number(row.skippedPrefilter), 0),
    milliseconds: comparisons.reduce((sum, row) => sum + Number(row.milliseconds), 0),
    atlasEntries: entries.length,
  };
  writeFileSync(path.join(DIRECTORY, "index.json"), JSON.stringify({
    version: 1,
    note: "Surface proximity docking on the adaptive-seating comparison pairs. Not promoted. Thresholds unchanged.",
    atlas: "data/skill6/atlas/v1.json",
    summary,
    comparisons,
    assemblies,
  }, null, 1));
  console.log(JSON.stringify(summary));
  console.log("proximity docking study stored");
}

if (process.argv[1]?.replaceAll("\\", "/").endsWith("lib/skill6/proximity-dock-study.ts")) {
  void main();
}
