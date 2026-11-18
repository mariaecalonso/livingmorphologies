/**
 * Direction experiment. Reseats stored contacts toward world Y and Z, then scores the poses that pass.
 * Writes data/skill6/experiments/small-ground-v2/. Does not touch the catalog or small-ground-v1.
 * Run: npx tsx lib/skill6/small-ground-v2.ts
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { assembleCluster, encodeMesh } from "./assembly";
import type { AssemblyValidation } from "./catalog";
import { SKILL6_GROWTH_DIRECTIONS, SKILL6_PARAMETERS, type ClusterRecord, type GrowthDirection } from "./contract";
import { SMALL_GROUND_V2 } from "./experiment-catalog";
import { poseBounds } from "./geometry";
import { aggregateCoverage, growthRejection, PLACEMENT_WEIGHTS, type PlacementWeights } from "./grow";
import { loadTranslatedTable } from "./shifts";
import { loadArchetypeMeshes } from "./source";

const BUDGET = { evaluations: 1600, backtracks: 48, triesPerDepth: 80 };
const DIRECTORY = path.join(process.cwd(), "data", "skill6", "experiments", SMALL_GROUND_V2);

const JOBS: { id: string; rootId: string; seed: number; tiles: number; bias: Partial<Record<GrowthDirection, number>>; aim: string }[] = [
  { id: "sg2-branch-101", rootId: "topographic-ground-field", seed: 101, tiles: 3, bias: { "+Y": 12, "-Y": 8 }, aim: "horizontal branch" },
  { id: "sg2-stack-101", rootId: "open-hall", seed: 101, tiles: 3, bias: { "+Z": 8 }, aim: "upward stack" },
  { id: "sg2-both-101", rootId: "open-hall", seed: 101, tiles: 4, bias: { "+Z": 8, "+Y": 8 }, aim: "stack plus another direction" },
  { id: "sg2-field-4-307", rootId: "topographic-ground-field", seed: 307, tiles: 4, bias: { "+Y": 6, "+X": 4, "-X": 2 }, aim: "four tiles from the Y-capable seed" },
  { id: "sg2-hall-5-307", rootId: "open-hall", seed: 307, tiles: 5, bias: { "+Z": 6, "+Y": 4, "-X": 2 }, aim: "five tiles from the stacking seed" },
  { id: "sg2-field-6-101", rootId: "topographic-ground-field", seed: 101, tiles: 6, bias: { "+Y": 4, "+X": 4, "+Z": 4 }, aim: "six tiles" },
];

function weightsFor(bias: Partial<Record<GrowthDirection, number>>): PlacementWeights {
  return { ...PLACEMENT_WEIGHTS, newDirection: 3, directionBias: bias };
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
  const meshes = loadArchetypeMeshes();
  const byId = new Map(meshes.map((mesh) => [mesh.archetypeId, mesh]));
  const table = loadTranslatedTable();
  mkdirSync(DIRECTORY, { recursive: true });
  const wasm = await (await import("manifold-3d/manifold")).default();
  wasm.setup();
  const validated: ClusterRecord[] = [];
  const validation: Record<string, AssemblyValidation> = {};
  const diagnostics: { id: string; targetTiles: number; rootId: string; seed: number; status: ClusterRecord["status"]; tiles: number; reason: string }[] = [];
  const review: { id: string; reading: string; directions: string[]; branchPoints: string[]; minContactArea: number; maxTilt: number }[] = [];

  for (const job of JOBS) {
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
      weights: weightsFor(job.bias),
    });
    const worlds = record.contacts.map((contact) => {
      const host = record.tiles.find((tile) => tile.instanceId === contact.hostId);
      const guest = record.tiles.find((tile) => tile.instanceId === contact.guestId);
      if (!host || !guest) return contact.searchNote.split(" ")[0];
      const hostBox = poseBounds(byId.get(host.archetypeId)!.tight, host.pose);
      const guestBox = poseBounds(byId.get(guest.archetypeId)!.tight, guest.pose);
      return growthRejection(hostBox, guestBox, SKILL6_GROWTH_DIRECTIONS) ?? contact.searchNote.split(" ")[0];
    });
    console.log(job.id, record.status, `${record.tiles.length}/${job.tiles}`, worlds.join(" "), record.search?.evaluations, "eval");
    if (record.status !== "accepted") {
      diagnostics.push({ id: job.id, targetTiles: job.tiles, rootId: job.rootId, seed: job.seed, status: record.status, tiles: record.tiles.length, reason: `${record.reason ?? "Unsuccessful search."} Contacts reached: ${worlds.join(", ") || "none"}.` });
      continue;
    }
    const meshFile = `data/skill6/experiments/${SMALL_GROUND_V2}/${job.id}.mesh.json`;
    const { assembly, meshes: built } = await assembleCluster(record, meshes, meshFile);
    const stored = { ...record, assembly };
    const fault = faultOf(stored);
    if (fault || !built.refined) {
      diagnostics.push({ id: job.id, targetTiles: job.tiles, rootId: job.rootId, seed: job.seed, status: "unsuccessful", tiles: record.tiles.length, reason: `${fault ?? "No refined mesh."} Rigid steps: ${worlds.join(", ") || "none"}.` });
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
    review.push({
      id: job.id,
      reading: `${job.aim}. Directions ${directions.join(" ")}.`,
      directions,
      branchPoints: assembly.graph.branchPoints,
      minContactArea: Number(Math.min(...areas).toFixed(1)),
      maxTilt: Number(Math.max(...tiles.map((tile) => tile.tiltDegrees)).toFixed(1)),
    });
    console.log(" validated", directions.join(" "), "lift", assembly.ground.lift.toFixed(3), "genus", genus, `${assembly.milliseconds.total}ms`);
  }

  writeFileSync(path.join(DIRECTORY, "index.json"), JSON.stringify({
    version: SMALL_GROUND_V2,
    note: "Stored contacts are reseated toward world ±X, ±Y, and +Z, then the poses that pass contact and collision are scored. Preferences never override a failed geometric test. small-ground-v1 is unchanged.",
    budget: BUDGET,
    seeds: [...new Set(JOBS.map((job) => job.seed))],
    order: "spread",
    attempted: JOBS.length,
    bySize: {},
    validated,
    diagnostics,
    validation,
    review,
    weights: PLACEMENT_WEIGHTS,
    jobs: JOBS,
  }, null, 1));
  console.log(`validated ${validated.length} of ${JOBS.length}`);
}

main();
