/**
 * Small-cluster experiment, ground-first.
 * Writes data/skill6/experiments/small-ground-v1/. Does not read or write the catalog index.
 * Run: npx tsx lib/skill6/small-ground-experiment.ts
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { assembleCluster, encodeMesh } from "./assembly";
import type { AssemblyValidation } from "./catalog";
import { SKILL6_GROWTH_DIRECTIONS, SKILL6_PARAMETERS, type ClusterRecord, type Vec3 } from "./contract";
import { SMALL_GROUND_DIRECTORY, type ExperimentDiagnostic, type SmallGroundReport } from "./experiment-catalog";
import { poseBounds } from "./geometry";
import { aggregateCoverage, growthRejection } from "./grow";
import { loadTranslatedTable } from "./shifts";
import { loadArchetypeMeshes } from "./source";

const BUDGET = { evaluations: 1600, backtracks: 48, triesPerDepth: 80 };
const SEEDS = [101, 307];
const SIZES = [3, 4, 5, 6];
const SEATING = SKILL6_PARAMETERS.contactTolerance;
const VALIDATE_PER_SIZE = 3;
const ASSEMBLE_PER_SIZE = 6;

type Attempt = {
  id: string;
  targetTiles: number;
  rootId: string;
  seed: number;
  record: ClusterRecord;
};

function configurationKey(record: ClusterRecord): string {
  return record.tiles
    .map((tile) => `${tile.archetypeId}@${[...tile.pose.basis, ...tile.pose.translation].map((value) => value.toFixed(2)).join(",")}`)
    .sort()
    .join("|");
}

function directionsOf(record: ClusterRecord): string[] {
  return [...new Set(record.contacts.map((contact) => contact.searchNote.split(" ")[0]))];
}

function maxTilt(record: ClusterRecord): number {
  return Math.max(...record.tiles.map((tile) => (Math.acos(Math.max(-1, Math.min(1, tile.pose.basis[8]))) * 180) / Math.PI));
}

function preference(record: ClusterRecord): number {
  const children = new Map<string, number>();
  for (const contact of record.contacts) children.set(contact.hostId, (children.get(contact.hostId) ?? 0) + 1);
  const fullest = Math.max(0, ...children.values());
  const chain = [...children.values()].every((count) => count <= 1) ? 1 : 0;
  const unique = record.metrics?.uniqueArchetypes ?? 0;
  return fullest * 8 + directionsOf(record).length * 3 + unique * 2 - chain * 5 - (maxTilt(record) > 90 ? 4 : 0);
}

function groundFault(record: ClusterRecord, meshes: Map<string, ReturnType<typeof loadArchetypeMeshes>[number]>): string | null {
  const boxes = new Map(record.tiles.map((tile) => [tile.instanceId, poseBounds(meshes.get(tile.archetypeId)!.tight, tile.pose)]));
  for (const tile of record.tiles) {
    const box = boxes.get(tile.instanceId)!;
    if (box.min[2] < -1e-3) return `${tile.instanceId} passes below Z = 0 (${box.min[2].toFixed(3)}).`;
  }
  const seen = new Set<string>();
  for (const contact of record.contacts) {
    if (seen.has(contact.guestId)) continue;
    seen.add(contact.guestId);
    const host = boxes.get(contact.hostId);
    const guest = boxes.get(contact.guestId);
    if (!host || !guest) continue;
    const rejection = growthRejection(host, guest, SKILL6_GROWTH_DIRECTIONS);
    if (rejection) return `${contact.guestId}: ${rejection}`;
  }
  return null;
}

function diagnostic(attempt: Attempt, reason: string): ExperimentDiagnostic {
  return {
    id: attempt.id,
    targetTiles: attempt.targetTiles,
    rootId: attempt.rootId,
    seed: attempt.seed,
    status: attempt.record.status,
    tiles: attempt.record.tiles.length,
    reason,
  };
}

function readingOf(record: ClusterRecord, meshes: Map<string, ReturnType<typeof loadArchetypeMeshes>[number]>): Omit<AssemblyValidation, "raw" | "refined"> & { refined: AssemblyValidation["refined"]; raw: AssemblyValidation["raw"] } {
  const assembly = record.assembly!;
  const round = (value: number, digits = 2) => Number(value.toFixed(digits));
  const seated = new Map(assembly.seatedTiles.map((tile) => [tile.instanceId, tile.pose]));
  const boxes = record.tiles.map((tile) => {
    const pose = seated.get(tile.instanceId) ?? tile.pose;
    const box = poseBounds(meshes.get(tile.archetypeId)!.tight, pose);
    return {
      instanceId: tile.instanceId,
      tiltDegrees: round((Math.acos(Math.max(-1, Math.min(1, pose.basis[8]))) * 180) / Math.PI, 1),
      mirrored: pose.mirrorX,
      minZ: round(box.min[2], 2),
      maxZ: round(box.max[2], 2),
      box,
    };
  });
  const byId = new Map(boxes.map((tile) => [tile.instanceId, tile]));
  const growth = assembly.growth.filter((step) => step.hostInstanceId).map((step) => {
    const host = byId.get(step.hostInstanceId!)!;
    const guest = byId.get(step.instanceId)!;
    return {
      instanceId: step.instanceId,
      hostInstanceId: step.hostInstanceId!,
      label: step.direction,
      baseChange: round(guest.box.min[2] - host.box.min[2], 1),
      topChange: round(guest.box.max[2] - host.box.max[2], 1),
      rejection: growthRejection(
        { min: host.box.min as Vec3, max: host.box.max as Vec3 },
        { min: guest.box.min as Vec3, max: guest.box.max as Vec3 },
        SKILL6_GROWTH_DIRECTIONS,
      ),
    };
  });
  const solid = (source: "raw" | "refined"): AssemblyValidation["refined"] => {
    const body = source === "raw" ? assembly.union : assembly.refined;
    return {
      status: body.status,
      triangles: body.triangles,
      bodies: body.components ?? 0,
      cavities: body.cavities ?? 0,
      genus: 0,
      volume: round(body.volume ?? 0, 1),
      minZ: round(body.minZ, 4),
      penetrations: source === "refined" ? assembly.refined.parameters.penetrations ?? 0 : 0,
      grazes: source === "refined" ? assembly.refined.parameters.grazes ?? 0 : 0,
      maxPenetration: source === "refined" ? assembly.refined.parameters.maxPenetration ?? 0 : 0,
    };
  };
  return {
    meshFile: assembly.meshFile,
    refinedTriangles: assembly.refined.triangles,
    lift: assembly.ground.lift,
    raw: solid("raw"),
    refined: solid("refined"),
    tiles: boxes.map(({ box: _box, ...tile }) => tile),
    growth,
    seatedTilesMinZ: round(Math.min(...boxes.map((tile) => tile.minZ)), 4),
    refinedToTilesOffset: round(assembly.refined.minZ - Math.min(...boxes.map((tile) => tile.box.min[2])), 4),
  };
}

function acceptAssembly(record: ClusterRecord): string | null {
  const assembly = record.assembly;
  if (!assembly) return "No assembly was built.";
  if (assembly.counts["failed-patch"] > 0) return `${assembly.counts["failed-patch"]} joint patch failed.`;
  if (assembly.union.components !== 1) return `Union is ${assembly.union.components ?? "no"} solid (${assembly.union.status}).`;
  if (assembly.refined.status !== "NoError" || assembly.refined.components !== 1) return `Refined surface is ${assembly.refined.components ?? "no"} solid (${assembly.refined.status}).`;
  if ((assembly.refined.cavities ?? 0) > 0) return `Refined surface has ${assembly.refined.cavities} cavities.`;
  if (assembly.refined.minZ < -1e-3) return `Refined surface reaches Z ${assembly.refined.minZ}.`;
  if ((assembly.refined.parameters.penetrations ?? 0) > 0) return `${assembly.refined.parameters.penetrations} refined self-intersections deeper than ${SKILL6_PARAMETERS.maxPenetration}.`;
  if (Math.abs(assembly.ground.lift) > SEATING) return `Ground lift ${assembly.ground.lift.toFixed(3)} is larger than the seating tolerance ${SEATING}.`;
  return null;
}

function reviewLine(record: ClusterRecord): SmallGroundReport["review"][number] {
  const assembly = record.assembly!;
  const areas = record.contacts.map((contact) => contact.contactArea);
  const chain = assembly.graph.branchPoints.length === 0 && assembly.graph.maxDepth === record.tiles.length - 1;
  const narrow = Math.min(...areas);
  const reading = chain
    ? "Reads as a chain. Each tile continues the previous one."
    : narrow < 8
      ? "Branched, with at least one joint near the contact minimum."
      : "Branched mass. Joints are wider than the contact minimum.";
  return {
    id: record.id,
    reading,
    directions: assembly.growth.map((step) => step.direction ?? "seed"),
    branchPoints: assembly.graph.branchPoints,
    minContactArea: Number(narrow.toFixed(1)),
    maxTilt: Number(maxTilt(record).toFixed(1)),
  };
}

async function main() {
  const meshes = loadArchetypeMeshes();
  const byId = new Map(meshes.map((mesh) => [mesh.archetypeId, mesh]));
  const table = loadTranslatedTable();
  mkdirSync(SMALL_GROUND_DIRECTORY, { recursive: true });
  const attempts: Attempt[] = [];
  const started = Date.now();
  for (const tiles of SIZES) {
    for (const root of meshes) {
      for (const seed of SEEDS) {
        const id = `sg-${tiles}-${root.archetypeId}-${seed}`;
        const record = aggregateCoverage(meshes, {
          id,
          seed,
          tiles,
          rootId: root.archetypeId,
          compatibility: table,
          triesPerDepth: BUDGET.triesPerDepth,
          budget: { evaluations: BUDGET.evaluations, backtracks: BUDGET.backtracks },
          directions: SKILL6_GROWTH_DIRECTIONS,
          order: "spread",
        });
        attempts.push({ id, targetTiles: tiles, rootId: root.archetypeId, seed, record });
        const fault = record.status === "accepted" ? groundFault(record, byId) : null;
        console.log([
          id,
          record.status,
          `${record.tiles.length}/${tiles}`,
          `${record.search?.evaluations ?? 0} eval`,
          `${record.search?.directionRejections ?? 0} direction`,
          `${record.search?.geometricRejections ?? 0} geometric`,
          fault ?? record.reason?.slice(0, 90) ?? directionsOf(record).join(" "),
          `${Math.round((Date.now() - started) / 1000)}s`,
        ].join(" · "));
      }
    }
  }

  const diagnostics: ExperimentDiagnostic[] = [];
  const seen = new Set<string>();
  const chosen = new Map<number, Attempt[]>();
  for (const tiles of SIZES) {
    const pool = attempts
      .filter((attempt) => attempt.targetTiles === tiles && attempt.record.status === "accepted" && !groundFault(attempt.record, byId))
      .sort((left, right) => preference(right.record) - preference(left.record));
    const keep: Attempt[] = [];
    for (const attempt of pool) {
      const key = configurationKey(attempt.record);
      if (seen.has(key)) {
        diagnostics.push(diagnostic(attempt, "Same tiles and poses as an earlier candidate."));
        continue;
      }
      seen.add(key);
      keep.push(attempt);
    }
    chosen.set(tiles, keep);
    for (const attempt of attempts.filter((item) => item.targetTiles === tiles && item.record.status !== "accepted")) {
      diagnostics.push(diagnostic(attempt, attempt.record.reason ?? "Unsuccessful search."));
    }
    for (const attempt of attempts.filter((item) => item.targetTiles === tiles && item.record.status === "accepted" && groundFault(item.record, byId))) {
      diagnostics.push(diagnostic(attempt, groundFault(attempt.record, byId)!));
    }
  }

  const validated: ClusterRecord[] = [];
  const validation: Record<string, AssemblyValidation> = {};
  const assembledCounts = new Map<number, number>();
  for (const tiles of SIZES) {
    let kept = 0;
    let assembled = 0;
    for (const attempt of chosen.get(tiles) ?? []) {
      if (kept >= VALIDATE_PER_SIZE || assembled >= ASSEMBLE_PER_SIZE) {
        diagnostics.push(diagnostic(attempt, kept >= VALIDATE_PER_SIZE
          ? "Accepted rigidly. Not assembled: three validated clusters are already stored for this size."
          : "Accepted rigidly. Not assembled: this size reached its assembly cap before three passed validation."));
        continue;
      }
      assembled += 1;
      const meshFile = `data/skill6/experiments/small-ground-v1/${attempt.id}.mesh.json`;
      const { assembly, meshes: built } = await assembleCluster(attempt.record, meshes, meshFile);
      const stored = { ...attempt.record, assembly };
      const fault = acceptAssembly(stored);
      assembledCounts.set(tiles, (assembledCounts.get(tiles) ?? 0) + 1);
      if (fault) {
        diagnostics.push(diagnostic(attempt, fault));
        console.log(`${attempt.id} diagnostic · ${fault}`);
        continue;
      }
      writeFileSync(path.join(process.cwd(), meshFile), JSON.stringify({
        id: attempt.id,
        raw: encodeMesh(built.raw),
        refined: encodeMesh(built.refined),
        patches: built.patches.map((mesh) => encodeMesh(mesh)),
      }));
      validated.push(stored);
      validation[attempt.id] = readingOf(stored, byId);
      kept += 1;
      console.log(`${attempt.id} validated · lift ${assembly.ground.lift.toFixed(3)} · ${assembly.milliseconds.total} ms · ${directionsOf(stored).join(" ")}`);
    }
  }

  const bySize: SmallGroundReport["bySize"] = {};
  for (const tiles of SIZES) {
    const group = attempts.filter((attempt) => attempt.targetTiles === tiles);
    bySize[String(tiles)] = {
      attempted: group.length,
      rigid: group.filter((attempt) => attempt.record.status === "accepted" && !groundFault(attempt.record, byId)).length,
      assembled: assembledCounts.get(tiles) ?? 0,
      validated: validated.filter((record) => record.tiles.length === tiles).length,
    };
  }
  const report: SmallGroundReport = {
    version: "small-ground-v1",
    note: "Ground-first Small clusters. The seed sits on Z = 0 from its mesh bounds. Guests use the existing pose library, with a preference for a new host, an upright pose, and a new direction. Contact thresholds are unchanged. This collection is not the catalog.",
    budget: BUDGET,
    seeds: SEEDS,
    order: "spread",
    attempted: attempts.length,
    bySize,
    validated,
    diagnostics,
    validation,
    review: validated.map(reviewLine),
  };
  writeFileSync(path.join(SMALL_GROUND_DIRECTORY, "index.json"), JSON.stringify(report, null, 1));
  console.log(JSON.stringify(bySize));
}

main();
