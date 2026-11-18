/**
 * Three experimental Spatial Organization rankings on one shared solver.
 * Compact, branching, and vertical reorder poses that already pass.
 * Writes data/skill6/experiments/organization-v1/. Does not touch the catalog or earlier experiments.
 * Run: npx tsx lib/skill6/organization-v1.ts
 * Optional size filter: npx tsx lib/skill6/organization-v1.ts 3
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { assembleCluster, encodeMesh } from "./assembly";
import type { AssemblyValidation } from "./catalog";
import { SKILL6_GROWTH_DIRECTIONS, SKILL6_PARAMETERS, type ClusterRecord, type GrowthDirection } from "./contract";
import { ORGANIZATION_EXPERIMENT } from "./experiment-catalog";
import { poseBounds } from "./geometry";
import { aggregateCoverage, growthDirection, growthRejection } from "./grow";
import { loadTranslatedTable } from "./shifts";
import { loadArchetypeMeshes } from "./source";

const BUDGET = { evaluations: 1600, backtracks: 48, triesPerDepth: 80 };
const DIRECTORY = path.join(process.cwd(), "data", "skill6", "experiments", ORGANIZATION_EXPERIMENT);
const STRATEGIES = ["compact", "branching", "vertical"] as const;
type Strategy = (typeof STRATEGIES)[number];

const ROOTS = [
  { key: "field", rootId: "topographic-ground-field" },
  { key: "hall", rootId: "open-hall" },
] as const;

const JOBS: { id: string; strategy: Strategy; rootId: string; seed: number; tiles: number }[] = [];
for (const strategy of STRATEGIES) {
  for (const root of ROOTS) {
    for (const tiles of [3, 4, 5, 6]) {
      JOBS.push({ id: `org-${strategy}-${root.key}-${tiles}-101`, strategy, rootId: root.rootId, seed: 101, tiles });
    }
    JOBS.push({ id: `org-${strategy}-${root.key}-3-307`, strategy, rootId: root.rootId, seed: 307, tiles: 3 });
  }
}

function faultOf(record: ClusterRecord): string | null {
  const assembly = record.assembly;
  if (!assembly) return "No assembly was built.";
  if (assembly.counts["failed-patch"] > 0) return `${assembly.counts["failed-patch"]} joint patch failed.`;
  if (assembly.union.components !== 1) return `Union is ${assembly.union.components ?? "no"} solid (${assembly.union.status}).`;
  if (assembly.refined.status !== "NoError" || assembly.refined.components !== 1) return `Refined surface is ${assembly.refined.components ?? "no"} solid (${assembly.refined.status}).`;
  if ((assembly.refined.cavities ?? 0) > 0) return `Refined surface has ${assembly.refined.cavities} cavities.`;
  if (assembly.refined.minZ < -1e-3) return `Refined surface reaches Z ${assembly.refined.minZ}.`;
  if ((assembly.refined.parameters.penetrations ?? 0) > 0) return `${assembly.refined.parameters.penetrations} refined self-intersections deeper than ${SKILL6_PARAMETERS.maxPenetration}.`;
  if (Math.abs(assembly.ground.lift) > SKILL6_PARAMETERS.contactTolerance) return `Ground lift ${assembly.ground.lift.toFixed(3)} is larger than the seating tolerance.`;
  return null;
}

async function main() {
  const onlySize = Number(process.argv[2]);
  const selected = Number.isFinite(onlySize) && onlySize > 0 ? JOBS.filter((job) => job.tiles === onlySize) : JOBS;
  const indexPath = path.join(DIRECTORY, "index.json");
  const prior = existsSync(indexPath) ? JSON.parse(readFileSync(indexPath, "utf8")) as { validated?: ClusterRecord[]; diagnostics?: { id: string }[] } : null;
  const done = new Set([...(prior?.validated ?? []).map((record) => record.id), ...(prior?.diagnostics ?? []).map((entry) => entry.id)]);
  const jobs = selected.filter((job) => !done.has(job.id));
  const meshes = loadArchetypeMeshes();
  const byId = new Map(meshes.map((mesh) => [mesh.archetypeId, mesh]));
  const table = loadTranslatedTable();
  mkdirSync(DIRECTORY, { recursive: true });
  const wasm = await (await import("manifold-3d/manifold")).default();
  wasm.setup();
  const priorBody = prior as { validated?: ClusterRecord[]; diagnostics?: typeof diagnostics; validation?: Record<string, AssemblyValidation>; review?: typeof review } | null;
  const validated: ClusterRecord[] = [...(priorBody?.validated ?? [])];
  const validation: Record<string, AssemblyValidation> = { ...(priorBody?.validation ?? {}) };
  const diagnostics: { id: string; strategy: Strategy; targetTiles: number; rootId: string; seed: number; status: ClusterRecord["status"]; tiles: number; reason: string; directions: string[] }[] = [...(priorBody?.diagnostics ?? [])];
  const review: { id: string; strategy: Strategy; rootId: string; seed: number; targetTiles: number; achievedTiles: number; reading: string; directions: string[]; branchPoints: string[]; minContactArea: number; maxTilt: number; height: number; longest: number; boundingVolume: number; uniqueArchetypes: number; evaluations: number; backtracks: number; milliseconds: number }[] = [...(priorBody?.review ?? [])];

  for (const job of jobs) {
    const record = aggregateCoverage(meshes, {
      id: job.id,
      seed: job.seed,
      tiles: job.tiles,
      rootId: job.rootId,
      compatibility: table,
      triesPerDepth: BUDGET.triesPerDepth,
      budget: { evaluations: BUDGET.evaluations, backtracks: BUDGET.backtracks },
      directions: SKILL6_GROWTH_DIRECTIONS,
      order: "spread",
      aims: true,
      select: "scored",
      organization: job.strategy,
    });
    const primary = record.tiles.slice(1).map((tile) => {
      const contact = record.contacts.find((item) => item.guestId === tile.instanceId);
      const host = record.tiles.find((item) => item.instanceId === contact?.hostId);
      const hostMesh = host ? byId.get(host.archetypeId) : undefined;
      const guestMesh = byId.get(tile.archetypeId);
      if (!host || !hostMesh || !guestMesh) return contact?.searchNote.split(" ")[0] ?? "?";
      return growthDirection(hostMesh, host.pose, guestMesh, tile.pose);
    });
    console.log(job.strategy, job.id, record.status, `${record.tiles.length}/${job.tiles}`, primary.join(" "), record.search?.evaluations, "eval", record.search?.backtracks, "back", `${record.search?.milliseconds}ms`);
    if (record.status !== "accepted") {
      diagnostics.push({ id: job.id, strategy: job.strategy, targetTiles: job.tiles, rootId: job.rootId, seed: job.seed, status: record.status, tiles: record.tiles.length, reason: `${record.reason ?? "Unsuccessful search."} Contacts reached: ${primary.join(", ") || "none"}.`, directions: primary });
      continue;
    }
    const meshFile = `data/skill6/experiments/${ORGANIZATION_EXPERIMENT}/${job.id}.mesh.json`;
    const { assembly, meshes: built } = await assembleCluster(record, meshes, meshFile);
    const stored = { ...record, assembly };
    const fault = faultOf(stored);
    if (fault || !built.refined) {
      diagnostics.push({ id: job.id, strategy: job.strategy, targetTiles: job.tiles, rootId: job.rootId, seed: job.seed, status: "unsuccessful", tiles: record.tiles.length, reason: `${fault ?? "No refined mesh."} Rigid steps: ${primary.join(", ") || "none"}.`, directions: primary });
      console.log(" ", fault);
      continue;
    }
    writeFileSync(path.join(process.cwd(), meshFile), JSON.stringify({ id: job.id, raw: encodeMesh(built.raw), refined: encodeMesh(built.refined), patches: built.patches.map((mesh) => encodeMesh(mesh)) }));
    const body = new wasm.Manifold(new wasm.Mesh({ numProp: 3, vertProperties: built.refined.positions, triVerts: built.refined.indices }));
    const genus = body.genus();
    body.delete();
    const seated = new Map(assembly.seatedTiles.map((tile) => [tile.instanceId, tile.pose]));
    const tiles = stored.tiles.map((tile) => {
      const pose = seated.get(tile.instanceId) ?? tile.pose;
      const box = poseBounds(byId.get(tile.archetypeId)!.tight, pose);
      return { instanceId: tile.instanceId, tiltDegrees: Number(((Math.acos(Math.max(-1, Math.min(1, pose.basis[8]))) * 180) / Math.PI).toFixed(1)), mirrored: pose.mirrorX, minZ: Number(box.min[2].toFixed(2)), maxZ: Number(box.max[2].toFixed(2)), box };
    });
    validation[job.id] = {
      meshFile,
      refinedTriangles: assembly.refined.triangles,
      lift: assembly.ground.lift,
      raw: { status: assembly.union.status, triangles: assembly.union.triangles, bodies: assembly.union.components ?? 0, cavities: assembly.union.cavities ?? 0, genus: 0, volume: Number((assembly.union.volume ?? 0).toFixed(1)), minZ: Number(assembly.union.minZ.toFixed(4)), penetrations: 0, grazes: 0, maxPenetration: 0 },
      refined: { status: assembly.refined.status, triangles: assembly.refined.triangles, bodies: assembly.refined.components ?? 0, cavities: assembly.refined.cavities ?? 0, genus, volume: Number((assembly.refined.volume ?? 0).toFixed(1)), minZ: Number(assembly.refined.minZ.toFixed(4)), penetrations: assembly.refined.parameters.penetrations ?? 0, grazes: assembly.refined.parameters.grazes ?? 0, maxPenetration: assembly.refined.parameters.maxPenetration ?? 0 },
      tiles: tiles.map(({ box: _box, ...tile }) => tile),
      growth: assembly.growth.filter((step) => step.hostInstanceId).map((step) => {
        const host = tiles.find((tile) => tile.instanceId === step.hostInstanceId)!;
        const guest = tiles.find((tile) => tile.instanceId === step.instanceId)!;
        return { instanceId: step.instanceId, hostInstanceId: step.hostInstanceId!, label: step.direction, baseChange: Number((guest.minZ - host.minZ).toFixed(1)), topChange: Number((guest.maxZ - host.maxZ).toFixed(1)), rejection: growthRejection(host.box, guest.box, SKILL6_GROWTH_DIRECTIONS) };
      }),
      seatedTilesMinZ: Math.min(...tiles.map((tile) => tile.minZ)),
      refinedToTilesOffset: Number((assembly.refined.minZ - Math.min(...tiles.map((tile) => tile.box.min[2]))).toFixed(4)),
    };
    validated.push(stored);
    const areas = stored.contacts.map((contact) => contact.contactArea);
    const directions = assembly.growth.map((step) => step.direction ?? "seed");
    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];
    for (const tile of tiles) for (let axis = 0; axis < 3; axis += 1) {
      min[axis] = Math.min(min[axis], tile.box.min[axis]);
      max[axis] = Math.max(max[axis], tile.box.max[axis]);
    }
    const extent = [max[0] - min[0], max[1] - min[1], max[2] - min[2]];
    review.push({
      id: job.id,
      strategy: job.strategy,
      rootId: job.rootId,
      seed: job.seed,
      targetTiles: job.tiles,
      achievedTiles: stored.tiles.length,
      reading: `${job.strategy}. Directions ${directions.join(" ")}.`,
      directions,
      branchPoints: assembly.graph.branchPoints,
      minContactArea: Number(Math.min(...areas).toFixed(1)),
      maxTilt: Number(Math.max(...tiles.map((tile) => tile.tiltDegrees)).toFixed(1)),
      height: Number((max[2] - min[2]).toFixed(1)),
      longest: Number(Math.max(...extent).toFixed(1)),
      boundingVolume: Number(stored.metrics?.boundingVolume.toFixed(0) ?? 0),
      uniqueArchetypes: stored.metrics?.uniqueArchetypes ?? 0,
      evaluations: stored.search?.evaluations ?? 0,
      backtracks: stored.search?.backtracks ?? 0,
      milliseconds: (stored.search?.milliseconds ?? 0) + assembly.milliseconds.total,
    });
    console.log(" validated", directions.join(" "), "lift", assembly.ground.lift.toFixed(3), "genus", genus, "height", (max[2] - min[2]).toFixed(1));
  }

  const groups = new Map<string, string[]>();
  for (const job of selected) {
    const key = `${job.rootId}|${job.seed}|${job.tiles}`;
    const found = review.find((item) => item.id === job.id) ?? diagnostics.find((item) => item.id === job.id);
    const line = `${job.strategy} ${found && "directions" in found ? found.directions.join(" ") : "missing"}`;
    groups.set(key, [...(groups.get(key) ?? []), line]);
  }
  const distinct = [...groups.entries()].map(([key, lines]) => ({ key, lines, different: new Set(lines.map((line) => line.split(" ").slice(1).join(" "))).size > 1 }));

  writeFileSync(path.join(DIRECTORY, "index.json"), JSON.stringify({
    version: ORGANIZATION_EXPERIMENT,
    note: "Three experimental rankings share the same reseated pose pool, budget, seeds, and geometric tests. Compact, branching, and vertical are not a finalized Spatial Organization method. Earlier experiments and the catalog are unchanged.",
    budget: BUDGET,
    seeds: [101, 307],
    strategies: STRATEGIES,
    order: "spread",
    attempted: selected.length,
    validated,
    diagnostics,
    validation,
    review,
    ranking: distinct,
    jobs,
  }, null, 1));
  console.log(`validated ${validated.length} of ${selected.length}`);
  for (const group of distinct) console.log(group.different ? "distinct" : "SAME", group.key, group.lines.join(" | "));
}

main();
