/**
 * Profile 3 small clusters, compared with organization-v2.
 * The Field vertical four-tile result is diagnosed and is not treated as validated.
 * Run: npx tsx lib/skill6/organization-v3.ts
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { assembleCluster, encodeMesh } from "./assembly";
import { candidatePoses, readAtlas, sourceRevision } from "./atlas";
import type { KnownAttachment } from "./compatibility";
import { SKILL6_GROWTH_DIRECTIONS, SKILL6_PARAMETERS, type Skill6Pose, type Vec3 } from "./contract";
import { scanCrossings } from "./envelope";
import { poseBounds } from "./geometry";
import { aggregateCoverage } from "./grow";
import { crossingReport } from "./refine-mesh";
import { loadTranslatedTable } from "./shifts";
import { loadArchetypeMeshes } from "./source";
import { buildUprightLibrary } from "./upright-dock";

const DIRECTORY = path.join(process.cwd(), "data", "skill6", "experiments", "organization-v3");
const PRIOR = path.join(process.cwd(), "data", "skill6", "experiments", "organization-v2", "index.json");
const BUDGET = { evaluations: 700, backtracks: 12, triesPerDepth: 64 };
const STRATEGIES = ["compact", "branching", "vertical"] as const;
type Strategy = (typeof STRATEGIES)[number];

const JOBS: { id: string; strategy: Strategy; rootId: string; seed: number; tiles: number }[] = [];
for (const strategy of STRATEGIES) {
  for (const root of [
    { key: "hall", rootId: "open-hall" },
    { key: "field", rootId: "topographic-ground-field" },
  ]) {
    for (const tiles of [3, 4]) JOBS.push({ id: `org3-${strategy}-${root.key}-${tiles}-101`, strategy, rootId: root.rootId, seed: 101, tiles });
  }
}

function atlasOf(meshes: ReturnType<typeof loadArchetypeMeshes>) {
  const atlas = readAtlas();
  if (!atlas) throw new Error("Compatibility atlas is missing.");
  const revision = sourceRevision(meshes);
  if (atlas.sourceRevision !== revision) throw new Error(`Atlas revision ${atlas.sourceRevision} does not match the source meshes ${revision}.`);
  const sample = atlas.entries.find((entry) => entry.outcome === "accepted");
  if (!sample || candidatePoses(atlas, sample.host, sample.guest).some((pose) => pose.revalidate !== true)) throw new Error("Atlas candidates are not marked for revalidation.");
  const grouped = new Map<string, KnownAttachment[]>();
  for (const entry of atlas.entries) {
    if (entry.outcome !== "accepted" || entry.sourceRevision !== revision) continue;
    const pose: Skill6Pose = { quarterZ: entry.pose.quarterZ, mirrorX: entry.pose.mirrorX, basis: entry.pose.basis as Skill6Pose["basis"], translation: entry.pose.translation as Vec3 };
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
    grouped.set(key, [...(grouped.get(key) ?? []), known]);
  }
  return { revision, poses: (hostId: string, guestId: string) => grouped.get(`${hostId}|${guestId}`) ?? [] };
}

async function diagnoseField(meshes: ReturnType<typeof loadArchetypeMeshes>, table: ReturnType<typeof loadTranslatedTable>, atlas: ReturnType<typeof atlasOf>) {
  const byId = new Map(meshes.map((mesh) => [mesh.archetypeId, mesh]));
  const record = aggregateCoverage(meshes, {
    id: "diagnose-org2-vertical-field-4",
    seed: 101,
    tiles: 4,
    rootId: "topographic-ground-field",
    compatibility: table,
    atlas,
    triesPerDepth: BUDGET.triesPerDepth,
    budget: { evaluations: BUDGET.evaluations, backtracks: BUDGET.backtracks },
    directions: SKILL6_GROWTH_DIRECTIONS,
    order: "spread",
    aims: true,
    select: "scored",
    organization: "vertical",
    profile: 2,
  });
  const built = await assembleCluster(record, meshes, "data/skill6/experiments/organization-v3/diagnose-field-vertical.mesh.json");
  const pairs = [];
  for (let later = 1; later < record.tiles.length; later += 1) {
    for (let earlier = 0; earlier < later; earlier += 1) {
      const host = byId.get(record.tiles[earlier].archetypeId);
      const guest = byId.get(record.tiles[later].archetypeId);
      if (!host || !guest) continue;
      const hit = scanCrossings(host, guest, record.tiles[earlier].pose, record.tiles[later].pose);
      pairs.push({ host: record.tiles[earlier].archetypeId, guest: record.tiles[later].archetypeId, count: hit.count, deepest: Number(hit.deepest.toFixed(3)) });
    }
  }
  const raw = built.meshes.raw ? crossingReport(built.meshes.raw) : null;
  const refined = built.meshes.refined ? crossingReport(built.meshes.refined) : null;
  return {
    classified: "not-validated",
    reason: "The refined surface exceeds the penetration limit. The search acceptance is not a validated cluster.",
    sequence: record.tiles.map((tile) => {
      const contact = record.contacts.find((item) => item.guestId === tile.instanceId);
      return { archetypeId: tile.archetypeId, up: Number(tile.pose.basis[8].toFixed(3)), note: contact?.searchNote ?? "seed" };
    }),
    tilePairs: pairs,
    rawPenetrations: raw?.penetrations ?? null,
    rawMax: raw ? Number(raw.maxPenetration.toFixed(3)) : null,
    refinedPenetrations: refined?.penetrations ?? null,
    refinedMax: refined ? Number(refined.maxPenetration.toFixed(3)) : null,
    assemblyPenetrations: built.assembly.refined.parameters.penetrations ?? 0,
    assemblyMax: built.assembly.refined.parameters.maxPenetration ?? 0,
  };
}

async function main() {
  const meshes = loadArchetypeMeshes();
  const byId = new Map(meshes.map((mesh) => [mesh.archetypeId, mesh]));
  const table = loadTranslatedTable();
  const atlas = atlasOf(meshes);
  mkdirSync(DIRECTORY, { recursive: true });
  console.log("diagnosing organization-v2 field vertical");
  const fieldVertical = await diagnoseField(meshes, table, atlas);
  console.log("field vertical", fieldVertical.rawPenetrations, fieldVertical.refinedPenetrations, fieldVertical.tilePairs.map((pair) => `${pair.host}/${pair.guest} ${pair.deepest}`).join(" "));
  const upright = await buildUprightLibrary(meshes, atlas.revision, path.join(DIRECTORY, "upright-poses.json"));
  console.log("upright offered", upright.offered, upright.directions);
  const poses = {
    poses: (hostId: string, guestId: string) => [...atlas.poses(hostId, guestId), ...upright.poses(hostId, guestId)],
  };
  const rows = [];
  for (const job of JOBS) {
    const record = aggregateCoverage(meshes, {
      id: job.id,
      seed: job.seed,
      tiles: job.tiles,
      rootId: job.rootId,
      compatibility: table,
      atlas: poses,
      triesPerDepth: BUDGET.triesPerDepth,
      budget: BUDGET,
      directions: SKILL6_GROWTH_DIRECTIONS,
      order: "spread",
      aims: true,
      select: "scored",
      organization: job.strategy,
      profile: 3,
    });
    console.log(job.id, record.status, record.tiles.map((tile) => tile.archetypeId).join(" "), record.search?.evaluations, "upright", record.search?.uprightAccepted, "dual", record.search?.dualAccepted);
    if (record.status !== "accepted") {
      rows.push({ id: job.id, strategy: job.strategy, rootId: job.rootId, tiles: job.tiles, status: record.status, validated: false, reason: record.reason, search: record.search });
      continue;
    }
    const { assembly, meshes: built } = await assembleCluster(record, meshes, `data/skill6/experiments/organization-v3/${job.id}.mesh.json`);
    const penetrations = assembly.refined.parameters.penetrations ?? 0;
    const penetrationFlag = penetrations > 0;
    const solid = assembly.counts["failed-patch"] === 0 && assembly.union.components === 1 && assembly.refined.status === "NoError" && assembly.refined.components === 1 && (assembly.refined.cavities ?? 0) === 0;
    const validated = solid && !penetrationFlag && Boolean(built.refined);
    if (validated && built.refined) {
      writeFileSync(path.join(DIRECTORY, `${job.id}.mesh.json`), JSON.stringify({ id: job.id, raw: encodeMesh(built.raw), refined: encodeMesh(built.refined), patches: built.patches.map((mesh) => encodeMesh(mesh)) }));
    }
    const seated = new Map(assembly.seatedTiles.map((tile) => [tile.instanceId, tile.pose]));
    const placed = record.tiles.map((tile) => {
      const pose = seated.get(tile.instanceId) ?? tile.pose;
      const box = poseBounds(byId.get(tile.archetypeId)!.tight, pose);
      const contact = record.contacts.find((item) => item.guestId === tile.instanceId);
      return { archetypeId: tile.archetypeId, up: Number(pose.basis[8].toFixed(3)), tilt: Number(((Math.acos(Math.max(-1, Math.min(1, pose.basis[8]))) * 180) / Math.PI).toFixed(1)), note: contact?.searchNote ?? "seed", box };
    });
    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];
    for (const tile of placed) for (let axis = 0; axis < 3; axis += 1) {
      min[axis] = Math.min(min[axis], tile.box.min[axis]);
      max[axis] = Math.max(max[axis], tile.box.max[axis]);
    }
    const extent = [max[0] - min[0], max[1] - min[1], max[2] - min[2]];
    const boxVolume = extent[0] * extent[1] * extent[2];
    const volume = placed.reduce((sum, tile) => sum + Math.abs(byId.get(tile.archetypeId)?.solidVolume ?? 0), 0);
    rows.push({
      id: job.id,
      strategy: job.strategy,
      rootId: job.rootId,
      tiles: job.tiles,
      status: record.status,
      validated,
      penetrationFlag,
      penetrations,
      maxPenetration: assembly.refined.parameters.maxPenetration ?? 0,
      directions: assembly.growth.map((step) => step.direction ?? "seed"),
      sequence: placed.map((tile) => `${tile.archetypeId} ${tile.note.split(" ")[0]} up ${tile.up}`),
      hosts: new Set(assembly.growth.filter((step) => step.hostInstanceId).map((step) => step.hostInstanceId)).size,
      contacts: record.contacts.length,
      multiContact: record.contacts.length > record.tiles.length - 1,
      height: Number(extent[2].toFixed(1)),
      footprint: Number(Math.hypot(extent[0], extent[1]).toFixed(1)),
      occupancy: boxVolume > 0 ? Number((volume / boxVolume).toFixed(3)) : null,
      maxTilt: Number(Math.max(...placed.map((tile) => tile.tilt)).toFixed(1)),
      uprightTiles: placed.filter((tile) => tile.up >= 0.7).length,
      invertedTiles: placed.filter((tile) => tile.up < 0).length,
      atlasJoints: record.contacts.filter((contact) => contact.searchNote.startsWith("atlas ")).length,
      uprightJoints: record.contacts.filter((contact) => contact.searchNote.startsWith("upright ")).length,
      dualJoints: record.contacts.filter((contact) => contact.searchNote.includes(" dual")).length,
      passedDirections: record.search?.passedDirections ?? {},
      uprightAccepted: record.search?.uprightAccepted ?? 0,
      dualAccepted: record.search?.dualAccepted ?? 0,
      milliseconds: (record.search?.milliseconds ?? 0) + assembly.milliseconds.total,
    });
    console.log(" ", validated ? "validated" : "not validated", penetrationFlag ? `PENETRATION ${penetrations}` : "clear", "tilt", rows[rows.length - 1].maxTilt);
  }
  const prior = JSON.parse(readFileSync(PRIOR, "utf8")) as { rows: { id: string; strategy: string; rootId: string; tiles: number; directions?: string[]; height?: number; maxTilt?: number; occupancy?: number; hosts?: number; penetrationFlag?: boolean; contacts?: number }[] };
  const comparison = rows.map((row) => {
    const before = prior.rows.find((item) => item.strategy === row.strategy && item.rootId === row.rootId && item.tiles === row.tiles);
    return {
      id: row.id,
      before: before ? { directions: before.directions, height: before.height, maxTilt: before.maxTilt, occupancy: before.occupancy, hosts: before.hosts, contacts: before.contacts, penetrationFlag: before.penetrationFlag, validated: before.penetrationFlag !== true } : null,
      after: { directions: row.directions, height: row.height, maxTilt: row.maxTilt, occupancy: row.occupancy, hosts: row.hosts, contacts: row.contacts, uprightTiles: row.uprightTiles, invertedTiles: row.invertedTiles, penetrationFlag: row.penetrationFlag, validated: row.validated },
    };
  });
  writeFileSync(path.join(DIRECTORY, "index.json"), JSON.stringify({
    version: 1,
    note: "Profile 3 adds upright surface seats and dual-tile slides, then rescores cohesion. Compared with organization-v2. Integrated is not implemented. Not promoted.",
    fieldVerticalDiagnosis: fieldVertical,
    upright: { offered: upright.offered, stack: upright.stack, side: upright.side, directions: upright.directions },
    budget: BUDGET,
    rows,
    comparison,
    validated: rows.filter((row) => row.validated).length,
  }, null, 1));
  console.log(JSON.stringify({ validated: rows.filter((row) => row.validated).length, flagged: rows.filter((row) => row.penetrationFlag).length, upright: upright.offered }));
  console.log("organization v3 stored");
}

main();
