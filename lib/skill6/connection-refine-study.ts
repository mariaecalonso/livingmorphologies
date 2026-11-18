/**
 * Baseline refinement against a joint-local pass.
 * Poses come from the compatibility atlas. The search is not run again.
 *
 * Run: npx tsx lib/skill6/connection-refine-study.ts
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { acceptedPoses, candidatePoses, readAtlas, type AtlasEntry } from "./atlas";
import { assembleCluster } from "./assembly";
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
import { IDENTITY, applyPose, poseWithBasis } from "./geometry";
import { connectedGroups, measureCluster } from "./metrics";
import { measurePreservation, sealedVoids, type PreservationReport, type VoidBody } from "./preservation";
import { solidSummary, type PatchMesh } from "./patch";
import { CLUSTER_REFINEMENT, refineClusterMesh, type RefinedMesh } from "./refine-mesh";
import { loadArchetypeMeshes, type ArchetypeMesh } from "./source";

const DIRECTORY = path.join(process.cwd(), "data", "skill6", "experiments", "connection-refine-v1");
const PAD = 0.12;

const CASES: { host: string; guest: string; method: AtlasEntry["method"]; gap: number; kind: "strong" | "weak" }[] = [
  { host: "compressed-sequential", guest: "open-hall", method: "adaptive-seating-v1", gap: 0.14, kind: "strong" },
  { host: "linear-gallery", guest: "open-hall", method: "adaptive-seating-v1", gap: 0.3, kind: "strong" },
  { host: "flat-deep-plan", guest: "contained-room-within-volume", method: "adaptive-seating-v1", gap: 0.5, kind: "weak" },
  { host: "open-hall", guest: "undulated", method: "proximity-dock-v1", gap: 0.42, kind: "weak" },
];

function pairRecord(id: string, host: ArchetypeMesh, guest: ArchetypeMesh, entry: AtlasEntry): ClusterRecord {
  const home = poseWithBasis(0, false, IDENTITY, [0, 0, 0]);
  const pose: Skill6Pose = {
    quarterZ: entry.pose.quarterZ,
    mirrorX: entry.pose.mirrorX,
    basis: entry.pose.basis as Skill6Pose["basis"],
    translation: entry.pose.translation as Vec3,
  };
  const normal = entry.region.contactNormal ?? [0, 0, 1];
  const contact: ContactRelation = {
    hostId: "t00",
    guestId: "t01",
    hostPatch: "envelope",
    guestPatch: "envelope",
    verdict: entry.contact.residualGap != null && entry.contact.residualGap <= SKILL6_PARAMETERS.targetGap ? "surface-contact" : "near-contact",
    minSurfaceDistance: entry.contact.minSurfaceDistance,
    residualGap: entry.contact.residualGap,
    contactArea: entry.contact.area,
    coherentRegions: entry.contact.coherentRegions,
    normalAlignment: entry.contact.normalAlignment ?? 0,
    hostNormal: normal,
    guestNormal: [-normal[0], -normal[1], -normal[2]],
    samples: [],
    rejected: [],
    intersectingTriangles: 0,
    deepestCrossing: entry.contact.deepestCrossing,
    overlapVolume: entry.contact.overlapVolume,
    attachment: "envelope",
    searchNote: `${entry.method} gap ${entry.parameters.gap} from the atlas`,
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
    pose: index === 0 ? home : pose,
  }));
  const byId = new Map([host, guest].map((mesh) => [mesh.archetypeId, mesh]));
  const search: SearchStats = {
    evaluations: 1,
    acceptedPoses: 1,
    backtracks: 0,
    milliseconds: 0,
    exhausted: false,
    truncated: false,
    untried: 0,
    geometricRejections: 0,
    rejectionCounts: { intersection: 0, containment: 0, contact: 0 },
    depthLimit: null,
    stop: "reached",
  };
  return {
    contract: SKILL6_CONTRACT,
    id,
    status: "accepted",
    reason: "Connection refinement comparison. Not a catalog cluster.",
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

function poseBox(body: VoidBody, pose: Skill6Pose) {
  const min: Vec3 = [Infinity, Infinity, Infinity];
  const max: Vec3 = [-Infinity, -Infinity, -Infinity];
  for (const x of [body.min[0], body.max[0]]) {
    for (const y of [body.min[1], body.max[1]]) {
      for (const z of [body.min[2], body.max[2]]) {
        const world = applyPose(pose, [x, y, z]);
        for (let axis = 0; axis < 3; axis += 1) {
          min[axis] = Math.min(min[axis], world[axis] - PAD);
          max[axis] = Math.max(max[axis], world[axis] + PAD);
        }
      }
    }
  }
  return { min, max };
}

function continuity(patch: PatchMesh, refined: PatchMesh) {
  const cell = 0.5;
  const buckets = new Map<string, number[]>();
  for (let vertex = 0; vertex < refined.positions.length; vertex += 3) {
    const key = `${Math.floor(refined.positions[vertex] / cell)}:${Math.floor(refined.positions[vertex + 1] / cell)}:${Math.floor(refined.positions[vertex + 2] / cell)}`;
    const list = buckets.get(key) ?? [];
    list.push(vertex);
    buckets.set(key, list);
  }
  const stride = Math.max(1, Math.floor(patch.positions.length / 3 / 800));
  let count = 0;
  let within = 0;
  let maxGap = 0;
  for (let index = 0; index < patch.positions.length; index += stride * 3) {
    const point: Vec3 = [patch.positions[index], patch.positions[index + 1], patch.positions[index + 2]];
    const origin = point.map((value) => Math.floor(value / cell));
    let best = Infinity;
    for (let dx = -1; dx <= 1; dx += 1) {
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dz = -1; dz <= 1; dz += 1) {
          const list = buckets.get(`${origin[0] + dx}:${origin[1] + dy}:${origin[2] + dz}`);
          if (!list) continue;
          for (const vertex of list) {
            best = Math.min(best, Math.hypot(refined.positions[vertex] - point[0], refined.positions[vertex + 1] - point[1], refined.positions[vertex + 2] - point[2]));
          }
        }
      }
    }
    count += 1;
    if (best <= SKILL6_PARAMETERS.contactTolerance) within += 1;
    if (Number.isFinite(best)) maxGap = Math.max(maxGap, best);
  }
  return { samples: count, withinContact: count ? within / count : null, maxGap };
}

function viewOf(report: PreservationReport, refined: RefinedMesh, solid: Awaited<ReturnType<typeof solidSummary>>, milliseconds: number, patches: readonly PatchMesh[]) {
  return {
    milliseconds,
    retained: report.tiles.map((tile) => ({
      archetypeId: tile.archetypeId,
      retained: tile.retained,
      slight: tile.slight,
      moved: tile.moved,
      buried: tile.buried,
      maxDeviation: tile.maxDeviation,
    })),
    silhouettes: report.silhouettes.map((view) => ({ plane: view.plane, deviation: view.deviation, maxGap: view.maxGap })),
    openings: report.openings,
    originalVoidAltered: report.originalVoidAltered,
    originalOpeningAltered: report.originalOpeningAltered,
    review: report.review,
    jointPocketsFilled: report.jointPocketsFilled.length,
    jointPocketVolumeFilled: report.jointPocketVolumeFilled,
    patchVolumeOutside: report.patchVolumeOutside,
    topology: {
      status: solid.status,
      components: solid.components,
      cavities: solid.cavities,
      volume: solid.volume,
      triangles: refined.mesh.indices.length / 3,
      cavitiesFilled: refined.cavitiesFilled,
      penetrations: refined.penetrations,
      grazes: refined.grazes,
      maxPenetration: refined.maxPenetration,
      sharpEdgesBefore: refined.sharpEdgesBefore,
      sharpEdgesAfter: refined.sharpEdgesAfter,
      seamSharpEdgesBefore: refined.seamSharpEdgesBefore,
      seamSharpEdgesAfter: refined.seamSharpEdgesAfter,
      maxShift: refined.maxShift,
      meanShift: refined.meanShift,
      outsideMoved: refined.outsideMoved,
      outsideMax: refined.outsideMax,
    },
    patchContinuity: patches.map((patch) => continuity(patch, refined.mesh)),
  };
}

async function main() {
  const meshes = await loadArchetypeMeshes();
  const byId = new Map(meshes.map((mesh) => [mesh.archetypeId, mesh]));
  const atlas = readAtlas();
  if (!atlas) throw new Error("Compatibility atlas is missing.");
  mkdirSync(DIRECTORY, { recursive: true });
  const rows = [];
  for (const job of CASES) {
    const matches = acceptedPoses(atlas, job.host, job.guest).filter((entry) => entry.method === job.method && Math.abs(entry.parameters.gap - job.gap) < 1e-6);
    matches.sort((left, right) => right.contact.area - left.contact.area);
    const entry = matches[0];
    if (!entry) throw new Error(`Atlas has no accepted ${job.method} pose for ${job.host} -> ${job.guest} at gap ${job.gap}.`);
    const reusable = candidatePoses(atlas, job.host, job.guest).find((pose) => pose.contactArea === entry.contact.area && pose.method === entry.method);
    if (!reusable || reusable.revalidate !== true) throw new Error(`Accepted pose ${entry.id} was not returned for revalidation.`);
    const host = byId.get(job.host);
    const guest = byId.get(job.guest);
    if (!host || !guest) throw new Error(`Missing mesh for ${job.host} -> ${job.guest}.`);
    const id = `${job.kind}-${job.host}-${job.guest}`.replace(/[^a-z0-9+-]+/gi, "-");
    const record = pairRecord(id, host, guest, entry);
    const started = Date.now();
    const built = await assembleCluster(record, meshes, `data/skill6/experiments/connection-refine-v1/${id}.mesh.json`);
    if (!built.meshes.raw || !built.meshes.refined) throw new Error(`${id} did not assemble.`);
    const seated = new Map(built.assembly.seatedTiles.map((tile) => [tile.instanceId, tile.pose]));
    const tiles = record.tiles.map((tile) => ({
      instanceId: tile.instanceId,
      archetypeId: tile.archetypeId,
      mesh: byId.get(tile.archetypeId)!,
      pose: seated.get(tile.instanceId)!,
    }));
    const patchStats = built.assembly.joints.map((joint) => ({
      volume: joint.patch?.volume ?? null,
      hostOverlap: joint.patch?.hostOverlap ?? null,
      guestOverlap: joint.patch?.guestOverlap ?? null,
    }));
    const baselineStarted = Date.now();
    const baselineRefined = refineClusterMesh(built.meshes.raw, built.meshes.patches);
    const baselineSolid = await solidSummary(baselineRefined.mesh);
    const baselineMs = Date.now() - baselineStarted;
    if (baselineRefined.cavitiesFilled !== built.assembly.refined.cavitiesFilled || Math.abs(baselineRefined.maxShift - built.assembly.refined.maxShift) > 1e-3) {
      throw new Error(`${id} baseline refine no longer matches the assembly refiner.`);
    }
    const baselineReport = await measurePreservation({
      tiles,
      raw: built.meshes.raw,
      refined: baselineRefined.mesh,
      patches: built.meshes.patches,
      patchStats,
      refinerFilled: baselineRefined.cavitiesFilled,
    });
    const protectedVoids = [];
    for (const tile of tiles) {
      const voids = await sealedVoids({ positions: tile.mesh.positions, indices: tile.mesh.indices });
      for (const body of voids) protectedVoids.push(poseBox(body, tile.pose));
    }
    const localStarted = Date.now();
    const local = refineClusterMesh(built.meshes.raw, built.meshes.patches, { restrictToJoint: true, protectedVoids });
    const localSolid = await solidSummary(local.mesh);
    const localMs = Date.now() - localStarted;
    const localReport = await measurePreservation({
      tiles,
      raw: built.meshes.raw,
      refined: local.mesh,
      patches: built.meshes.patches,
      patchStats,
      refinerFilled: local.cavitiesFilled,
    });
    const baseline = viewOf(baselineReport, baselineRefined, baselineSolid, baselineMs, built.meshes.patches);
    const proposed = viewOf(localReport, local, localSolid, localMs, built.meshes.patches);
    const retainedDrop = proposed.retained.some((tile, index) => tile.retained + 0.02 < baseline.retained[index].retained);
    const silhouetteRise = proposed.silhouettes.some((view, index) => (view.deviation ?? 0) > (baseline.silhouettes[index].deviation ?? 0) + 0.01);
    const continuityDrop = proposed.patchContinuity.some((patch, index) => (patch.withinContact ?? 1) + 0.02 < (baseline.patchContinuity[index].withinContact ?? 1));
    const regressions = [
      proposed.topology.penetrations > baseline.topology.penetrations ? "penetrations" : null,
      proposed.topology.status !== "NoError" || proposed.topology.components !== 1 ? "topology" : null,
      proposed.originalVoidAltered && !baseline.originalVoidAltered ? "original-void" : null,
      proposed.openings.altered > baseline.openings.altered ? "opening" : null,
      retainedDrop ? "surface-retention" : null,
      silhouetteRise ? "silhouette" : null,
      continuityDrop ? "patch-continuity" : null,
    ].filter((item): item is string => item != null);
    rows.push({
      id,
      kind: job.kind,
      host: job.host,
      guest: job.guest,
      atlasId: entry.id,
      method: entry.method,
      gap: entry.parameters.gap,
      contactArea: entry.contact.area,
      growthDirection: entry.region.growthDirection,
      revalidate: true,
      joint: built.assembly.joints.map((joint) => joint.classification),
      protectedVoids: protectedVoids.length,
      baseline,
      proposed,
      regressions,
      assembleMilliseconds: Date.now() - started,
    });
    console.log(`${id} regressions ${regressions.join(",") || "none"} outside ${baseline.topology.outsideMoved}->${proposed.topology.outsideMoved} openings ${baseline.openings.filled}/${baseline.openings.occupiedByAnotherTile} -> ${proposed.openings.altered}`);
  }
  const summary = {
    pairs: rows.length,
    regressions: rows.filter((row) => row.regressions.length > 0).map((row) => ({ id: row.id, regressions: row.regressions })),
    neighborhood: CLUSTER_REFINEMENT.seamReach + CLUSTER_REFINEMENT.seamFade,
    floorShift: CLUSTER_REFINEMENT.floorShift,
    baseWeight: CLUSTER_REFINEMENT.baseWeight,
  };
  writeFileSync(path.join(DIRECTORY, "index.json"), JSON.stringify({
    version: 1,
    note: "Joint-local refinement compared with the unchanged baseline. Not promoted. Thresholds, patch settings, and scores unchanged.",
    atlas: "data/skill6/atlas/v1.json",
    summary,
    rows,
  }, null, 1));
  console.log(JSON.stringify(summary));
  console.log("connection refinement study stored");
}

if (process.argv[1]?.replaceAll("\\", "/").endsWith("lib/skill6/connection-refine-study.ts")) {
  main();
}
