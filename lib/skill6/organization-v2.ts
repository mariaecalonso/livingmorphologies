/**
 * Small-cluster comparison for Spatial Organization profile 2.
 * Atlas poses are revalidated. organization-v1 and the catalog are not rewritten.
 * Run: npx tsx lib/skill6/organization-v2.ts
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { assembleCluster, encodeMesh } from "./assembly";
import { readAtlas, sourceRevision, candidatePoses } from "./atlas";
import type { KnownAttachment } from "./compatibility";
import { SKILL6_GROWTH_DIRECTIONS, SKILL6_PARAMETERS, type ClusterRecord, type Skill6Pose, type Vec3 } from "./contract";
import { poseBounds } from "./geometry";
import { aggregateCoverage, growthDirection, growthRejection } from "./grow";
import { loadTranslatedTable } from "./shifts";
import { loadArchetypeMeshes } from "./source";

const DIRECTORY = path.join(process.cwd(), "data", "skill6", "experiments", "organization-v2");
const BUDGET = { evaluations: 700, backtracks: 12, triesPerDepth: 64 };
const STRATEGIES = ["compact", "branching", "vertical"] as const;
type Strategy = (typeof STRATEGIES)[number];

const JOBS: { id: string; strategy: Strategy; rootId: string; seed: number; tiles: number }[] = [];
for (const strategy of STRATEGIES) {
  for (const root of [
    { key: "hall", rootId: "open-hall" },
    { key: "field", rootId: "topographic-ground-field" },
  ]) {
    for (const tiles of [3, 4]) {
      JOBS.push({ id: `org2-${strategy}-${root.key}-${tiles}-101`, strategy, rootId: root.rootId, seed: 101, tiles });
    }
  }
}

function atlasPoses(meshes: ReturnType<typeof loadArchetypeMeshes>) {
  const atlas = readAtlas();
  if (!atlas) throw new Error("Compatibility atlas is missing.");
  const revision = sourceRevision(meshes);
  if (atlas.sourceRevision !== revision) throw new Error(`Atlas revision ${atlas.sourceRevision} does not match the source meshes ${revision}.`);
  const sample = atlas.entries.find((entry) => entry.outcome === "accepted");
  if (!sample || candidatePoses(atlas, sample.host, sample.guest).some((pose) => pose.revalidate !== true)) {
    throw new Error("Atlas candidates are not marked for revalidation.");
  }
  const grouped = new Map<string, KnownAttachment[]>();
  for (const entry of atlas.entries) {
    if (entry.outcome !== "accepted" || entry.sourceRevision !== revision) continue;
    const pose: Skill6Pose = {
      quarterZ: entry.pose.quarterZ,
      mirrorX: entry.pose.mirrorX,
      basis: entry.pose.basis as Skill6Pose["basis"],
      translation: entry.pose.translation as Vec3,
    };
    const known: KnownAttachment = {
      pose,
      contactArea: entry.contact.area,
      coherentRegions: entry.contact.coherentRegions,
      residualGap: entry.contact.residualGap,
      minSurfaceDistance: entry.contact.minSurfaceDistance,
      normalAlignment: entry.contact.normalAlignment ?? 0,
      deepestCrossing: entry.contact.deepestCrossing,
      overlapVolume: entry.contact.overlapVolume,
      verdict: entry.contact.residualGap != null && entry.contact.residualGap <= SKILL6_PARAMETERS.targetGap ? "surface-contact" : "near-contact",
      note: `atlas ${entry.method} ${entry.region.growthDirection ?? "unlabeled"} gap ${entry.parameters.gap.toFixed(2)}`,
    };
    const key = `${entry.host}|${entry.guest}`;
    const list = grouped.get(key) ?? [];
    list.push(known);
    grouped.set(key, list);
  }
  return {
    offered: [...grouped.values()].reduce((sum, list) => sum + list.length, 0),
    poses: (hostId: string, guestId: string) => grouped.get(`${hostId}|${guestId}`) ?? [],
  };
}

async function main() {
  const meshes = loadArchetypeMeshes();
  const byId = new Map(meshes.map((mesh) => [mesh.archetypeId, mesh]));
  const table = loadTranslatedTable();
  const atlas = atlasPoses(meshes);
  mkdirSync(DIRECTORY, { recursive: true });
  const wasm = await (await import("manifold-3d/manifold")).default();
  wasm.setup();
  const rows = [];
  for (const job of JOBS) {
    const record = aggregateCoverage(meshes, {
      id: job.id,
      seed: job.seed,
      tiles: job.tiles,
      rootId: job.rootId,
      compatibility: table,
      atlas,
      triesPerDepth: BUDGET.triesPerDepth,
      budget: { evaluations: BUDGET.evaluations, backtracks: BUDGET.backtracks },
      directions: SKILL6_GROWTH_DIRECTIONS,
      order: "spread",
      aims: true,
      select: "scored",
      organization: job.strategy,
      profile: 2,
    });
    const primary = record.tiles.slice(1).map((tile) => {
      const contact = record.contacts.find((item) => item.guestId === tile.instanceId);
      const host = record.tiles.find((item) => item.instanceId === contact?.hostId);
      const hostMesh = host ? byId.get(host.archetypeId) : undefined;
      const guestMesh = byId.get(tile.archetypeId);
      if (!host || !hostMesh || !guestMesh || !contact) return "?";
      return growthDirection(hostMesh, host.pose, guestMesh, tile.pose);
    });
    console.log(job.id, record.status, `${record.tiles.length}/${job.tiles}`, primary.join(" "), record.search?.evaluations, "eval", `${record.search?.milliseconds}ms`, "atlas", record.search?.atlasAccepted, JSON.stringify(record.search?.passedDirections ?? {}));
    if (record.status !== "accepted") {
      rows.push({ id: job.id, strategy: job.strategy, rootId: job.rootId, tiles: job.tiles, status: record.status, achieved: record.tiles.length, reason: record.reason, directions: primary, search: record.search, penetrationFlag: false });
      continue;
    }
    const meshFile = `data/skill6/experiments/organization-v2/${job.id}.mesh.json`;
    const { assembly, meshes: built } = await assembleCluster(record, meshes, meshFile);
    const penetrations = assembly.refined.parameters.penetrations ?? 0;
    const penetrationFlag = penetrations > 0;
    const fault = assembly.counts["failed-patch"] > 0
      || assembly.union.components !== 1
      || assembly.refined.status !== "NoError"
      || assembly.refined.components !== 1
      || (assembly.refined.cavities ?? 0) > 0;
    if (!built.refined || fault) {
      rows.push({ id: job.id, strategy: job.strategy, rootId: job.rootId, tiles: job.tiles, status: "unsuccessful", achieved: record.tiles.length, reason: "Assembly did not produce one solid.", directions: primary, search: record.search, penetrationFlag, penetrations });
      console.log("  assembly fault", assembly.refined.status, assembly.refined.components);
      continue;
    }
    writeFileSync(path.join(process.cwd(), meshFile), JSON.stringify({ id: job.id, raw: encodeMesh(built.raw), refined: encodeMesh(built.refined), patches: built.patches.map((mesh) => encodeMesh(mesh)) }));
    const seated = new Map(assembly.seatedTiles.map((tile) => [tile.instanceId, tile.pose]));
    const boxes = record.tiles.map((tile) => {
      const pose = seated.get(tile.instanceId) ?? tile.pose;
      return { id: tile.archetypeId, pose, box: poseBounds(byId.get(tile.archetypeId)!.tight, pose), tilt: (Math.acos(Math.max(-1, Math.min(1, pose.basis[8]))) * 180) / Math.PI };
    });
    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];
    for (const tile of boxes) for (let axis = 0; axis < 3; axis += 1) {
      min[axis] = Math.min(min[axis], tile.box.min[axis]);
      max[axis] = Math.max(max[axis], tile.box.max[axis]);
    }
    const extent = [max[0] - min[0], max[1] - min[1], max[2] - min[2]];
    const volume = boxes.reduce((sum, tile) => sum + Math.abs(byId.get(tile.id)?.solidVolume ?? 0), 0);
    const boxVolume = extent[0] * extent[1] * extent[2];
    const hosts = new Set(assembly.growth.filter((step) => step.hostInstanceId).map((step) => step.hostInstanceId));
    rows.push({
      id: job.id,
      strategy: job.strategy,
      rootId: job.rootId,
      tiles: job.tiles,
      status: "accepted",
      achieved: record.tiles.length,
      directions: assembly.growth.map((step) => step.direction ?? "seed"),
      sequence: assembly.growth.map((step) => `${step.archetypeId} ${step.direction ?? "seed"}`),
      branchPoints: assembly.graph.branchPoints,
      hosts: hosts.size,
      contacts: record.contacts.length,
      height: Number(extent[2].toFixed(1)),
      footprint: Number(Math.hypot(extent[0], extent[1]).toFixed(1)),
      occupancy: boxVolume > 0 ? Number((volume / boxVolume).toFixed(3)) : null,
      maxTilt: Number(Math.max(...boxes.map((tile) => tile.tilt)).toFixed(1)),
      uniqueArchetypes: new Set(record.tiles.map((tile) => tile.archetypeId)).size,
      minContact: Number(Math.min(...record.contacts.map((contact) => contact.contactArea)).toFixed(1)),
      atlasNotes: record.contacts.filter((contact) => contact.searchNote.startsWith("atlas ")).length,
      passedDirections: record.search?.passedDirections ?? {},
      atlasAccepted: record.search?.atlasAccepted ?? 0,
      evaluations: record.search?.evaluations ?? 0,
      milliseconds: (record.search?.milliseconds ?? 0) + assembly.milliseconds.total,
      refineMilliseconds: assembly.milliseconds.refine,
      penetrationFlag,
      penetrations,
      maxPenetration: assembly.refined.parameters.maxPenetration ?? 0,
      components: assembly.refined.components,
      cavities: assembly.refined.cavities,
      growthChecks: assembly.growth.filter((step) => step.hostInstanceId).map((step) => {
        const hostTile = record.tiles.find((tile) => tile.instanceId === step.hostInstanceId);
        const guestTile = record.tiles.find((tile) => tile.instanceId === step.instanceId);
        const hostPose = seated.get(step.hostInstanceId!) ?? hostTile?.pose;
        const guestPose = seated.get(step.instanceId) ?? guestTile?.pose;
        if (!hostTile || !guestTile || !hostPose || !guestPose) return "missing tile";
        return growthRejection(poseBounds(byId.get(hostTile.archetypeId)!.tight, hostPose), poseBounds(byId.get(guestTile.archetypeId)!.tight, guestPose), SKILL6_GROWTH_DIRECTIONS);
      }),
    });
    console.log("  stored", primary.join(" "), penetrationFlag ? `PENETRATION ${penetrations}` : "clear", "height", extent[2].toFixed(1));
  }
  const groups = new Map<string, string[]>();
  for (const row of rows) {
    const key = `${row.rootId}|${row.tiles}`;
    groups.set(key, [...(groups.get(key) ?? []), `${row.strategy} ${(row.directions ?? []).join(" ")}`]);
  }
  const distinct = [...groups.entries()].map(([key, lines]) => ({
    key,
    lines,
    different: new Set(lines.map((line) => line.split(" ").slice(1).join(" "))).size > 1,
  }));
  writeFileSync(path.join(DIRECTORY, "index.json"), JSON.stringify({
    version: 1,
    note: "Profile 2 ranks whole-cluster compact, branching, and vertical objectives. Atlas poses are revalidated. Not promoted. Thresholds, patching, and baseline refinement are unchanged.",
    atlas: "data/skill6/atlas/v1.json",
    atlasPosesOffered: atlas.offered,
    budget: BUDGET,
    seed: 101,
    rows,
    distinct,
  }, null, 1));
  console.log(JSON.stringify({ jobs: rows.length, accepted: rows.filter((row) => row.status === "accepted").length, penetrationFlags: rows.filter((row) => row.penetrationFlag).length, distinct }));
  console.log("organization v2 stored");
}

main();
