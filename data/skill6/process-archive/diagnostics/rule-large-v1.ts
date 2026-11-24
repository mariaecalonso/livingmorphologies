/**
 * Seven-tile Rule experiment. Doubles the evaluation budget and the backtrack
 * cap for this collection only. Does not rewrite overnight results.
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { assembleCluster } from "../../../../lib/skill6/assembly";
import { SKILL6_GROWTH_DIRECTIONS, SKILL6_PARAMETERS, displaySizeOfCount, type ClusterMorphology, type ClusterRecord } from "../../../../lib/skill6/contract";
import { runRule } from "../../../../lib/skill6/engines/rule";
import { readShape, shapeSummary } from "../../../../lib/skill6/engines/morphology";
import { loadDockPool } from "../../../../lib/skill6/engines/pool";
import { loadArchetypeMeshes } from "../../../../lib/skill6/source";
import { STEP_COLORS, poseMesh, render } from "./measure-geometry-v1";

const ROOT = process.cwd();
const OUT = path.join(ROOT, "data", "skill6", "process-archive", "diagnostics", "rule-large-v1");
const COLLECTION = path.join(ROOT, "data", "skill6", "experiments", "clustering-rule-large-v1");
const OVERNIGHT = path.join(ROOT, "data", "skill6", "experiments", "clustering-overnight-v1");
const ALLOWED = new Set<string>(SKILL6_GROWTH_DIRECTIONS);

function encode(mesh: { positions: Float32Array; indices: Uint32Array }) {
  return {
    positions: Buffer.from(mesh.positions.buffer, mesh.positions.byteOffset, mesh.positions.byteLength).toString("base64"),
    indices: Buffer.from(mesh.indices.buffer, mesh.indices.byteOffset, mesh.indices.byteLength).toString("base64"),
    triangles: mesh.indices.length / 3,
  };
}

function reasonsFor(record: ClusterRecord, assembly: Awaited<ReturnType<typeof assembleCluster>>["assembly"]) {
  const reasons: string[] = [];
  if (record.tiles.length !== 7) reasons.push(`${record.tiles.length} of 7 tiles`);
  if (assembly.counts["failed-patch"] > 0) reasons.push(`${assembly.counts["failed-patch"]} failed patches`);
  if (record.contacts.length < record.tiles.length - 1) reasons.push("missing contacts");
  if (assembly.union.components !== 1) reasons.push(`union bodies ${assembly.union.components}`);
  if (assembly.refined.status !== "NoError") reasons.push(`refined ${assembly.refined.status}`);
  if (assembly.refined.components !== 1) reasons.push(`refined bodies ${assembly.refined.components}`);
  if ((assembly.refined.cavities ?? 0) > 0) reasons.push(`${assembly.refined.cavities} cavities`);
  const penetrations = assembly.refined.parameters.penetrations ?? 0;
  const maxPenetration = assembly.refined.parameters.maxPenetration ?? 0;
  if (penetrations > 0 || maxPenetration > SKILL6_PARAMETERS.maxPenetration) reasons.push(`${penetrations} penetrations, max ${maxPenetration.toFixed(4)}`);
  if (assembly.ground.lift > 0.18) reasons.push(`lift ${assembly.ground.lift.toFixed(3)}`);
  if (assembly.ground.minZAfter < -1e-3) reasons.push("below ground");
  for (const step of assembly.growth) if (step.direction && !ALLOWED.has(step.direction)) reasons.push(`direction ${step.direction}`);
  return reasons;
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  mkdirSync(COLLECTION, { recursive: true });
  const cachePath = path.join(COLLECTION, "pair-checks.json");
  if (!existsSync(cachePath)) copyFileSync(path.join(OVERNIGHT, "pair-checks.json"), cachePath);
  const meshes = loadArchetypeMeshes();
  const byId = new Map(meshes.map((mesh) => [mesh.archetypeId, mesh]));
  const pool = loadDockPool(meshes, { checked: true, perDirection: 3, cachePath });
  const runs: { morphology: ClusterMorphology; backtracks: number; outcome: ReturnType<typeof runRule>; milliseconds: number }[] = [];

  const search = (morphology: ClusterMorphology, backtracks: number) => {
    const started = Date.now();
    console.log("search", morphology, backtracks);
    const outcome = runRule(meshes, pool, {
      id: `rule-large-${morphology}-${backtracks}`,
      seed: 101,
      tiles: 7,
      rootId: "open-hall",
      morphology,
      budget: 240 * 7,
      backtracks,
    });
    const milliseconds = Date.now() - started;
    console.log(morphology, backtracks, outcome.record.tiles.length, `${milliseconds}ms`);
    runs.push({ morphology, backtracks, outcome, milliseconds });
    return outcome.record.tiles.length >= 7;
  };

  const compactReached = search("compact", 16) || search("compact", 24);
  const cap = [...runs].reverse().find((run) => run.morphology === "compact" && run.outcome.record.tiles.length >= 7)?.backtracks ?? 24;
  search("branching", cap);

  const records: ClusterRecord[] = [];
  const rows = [];
  const candidates = [];
  for (const run of runs) {
    const found = [run.outcome.record, ...run.outcome.alternatives];
    for (const record of found) {
      candidates.push({
        id: record.id,
        morphology: run.morphology,
        backtracks: run.backtracks,
        tiles: record.tiles.length,
        sequence: record.tiles.map((tile) => tile.name),
        trace: record.search?.trace ?? "",
        reason: record.reason,
      });
      if (record.tiles.length < 6) continue;
      let validation: string[] = record.tiles.length === 7 ? ["not assembled"] : [`${record.tiles.length} of 7 tiles`];
      console.log("assemble", record.id);
        const built = await assembleCluster(record, meshes, `data/skill6/experiments/clustering-rule-large-v1/${record.id}.mesh.json`);
        record.assembly = { ...built.assembly, meshFile: `data/skill6/experiments/clustering-rule-large-v1/${record.id}.mesh.json` };
        validation = reasonsFor(record, built.assembly);
        writeFileSync(path.join(COLLECTION, `${record.id}.mesh.json`), JSON.stringify({
          id: record.id,
          raw: built.meshes.raw ? encode(built.meshes.raw) : null,
          refined: built.meshes.refined ? encode(built.meshes.refined) : null,
          patches: built.meshes.patches.map((mesh) => encode(mesh)),
        }));
        const seated = new Map(built.assembly.seatedTiles.map((tile) => [tile.instanceId, tile.pose]));
        if (built.meshes.refined) render([{ positions: built.meshes.refined.positions, indices: built.meshes.refined.indices, color: [214, 214, 214] }], path.join(OUT, `${record.id}-refined.png`));
        render(record.tiles.map((tile, index) => ({ ...poseMesh(byId.get(tile.archetypeId)!, seated.get(tile.instanceId) ?? tile.pose), color: STEP_COLORS[index % STEP_COLORS.length] })), path.join(OUT, `${record.id}-rigid.png`));
      const clean = validation.length === 0;
      const shape = record.tiles.length > 0 ? shapeSummary(readShape(record.tiles, record.contacts, byId)) : null;
      records.push(record);
      rows.push({
        id: record.id,
        engine: "rule",
        morphology: run.morphology,
        targetTiles: 7,
        tiles: record.tiles.length,
        status: record.status,
        stop: record.search?.stop ?? null,
        validated: clean,
        partial: !clean && validation.every((reason) => reason.endsWith("of 7 tiles")) && record.assembly != null,
        penetrations: record.assembly?.refined.parameters.penetrations ?? null,
        maxPenetration: record.assembly?.refined.parameters.maxPenetration ?? null,
        milliseconds: run.milliseconds,
        trace: record.search?.trace ?? "",
        reason: clean ? null : validation.join("; "),
        shape,
        lift: record.assembly?.ground.lift ?? null,
        backtracks: run.backtracks,
        budget: 240 * 7,
      });
    }
  }

  const overnight = JSON.parse(readFileSync(path.join(OVERNIGHT, "index.json"), "utf8")) as { rows: { id: string; engine: string; morphology: string; targetTiles: number; tiles: number; validated: boolean; partial: boolean; stop: string | null; milliseconds: number; maxPenetration: number | null; shape?: { compact: number; branching: number; vertical: number; unique: number; branchPoints: number; minJointArea: number; directions: string[]; depth: number }; trace: string }[] };
  const engines = ["rule", "graph", "wfc"] as const;
  const sizes = ["small", "medium", "large"] as const;
  const coverage = engines.map((engine) => ({
    engine,
    sizes: sizes.map((size) => {
      const band = overnight.rows.filter((row) => row.engine === engine && displaySizeOfCount(row.tiles) === size);
      const validated = band.filter((row) => row.validated);
      return {
        size,
        validated: validated.length,
        partial: band.filter((row) => row.partial).length,
        ids: validated.map((row) => row.id),
      };
    }),
    largeTarget: overnight.rows.filter((row) => row.engine === engine && row.targetTiles === 7).map((row) => ({ id: row.id, tiles: row.tiles, validated: row.validated, partial: row.partial, stop: row.stop, milliseconds: row.milliseconds })),
  }));
  const representatives = engines.flatMap((engine) => sizes.flatMap((size) => {
    const found = overnight.rows.filter((row) => row.engine === engine && row.validated && displaySizeOfCount(row.tiles) === size);
    const most = Math.max(0, ...found.map((row) => row.tiles));
    return found.filter((row) => row.tiles === most).map((row) => ({
      engine,
      size,
      id: row.id,
      morphology: row.morphology,
      tiles: row.tiles,
      milliseconds: row.milliseconds,
      maxPenetration: row.maxPenetration,
      shape: row.shape ?? null,
      trace: row.trace,
    }));
  }));

  writeFileSync(path.join(OUT, "candidates.json"), JSON.stringify(candidates, null, 2));
  writeFileSync(path.join(COLLECTION, "index.json"), JSON.stringify({
    version: "clustering-rule-large-v1",
    note: "Rule-Based seven-tile experiment. 240 evaluations per tile and a raised backtrack cap, for this collection only. Scoring, thresholds, patching, and refinement are unchanged. Not promoted.",
    budget: { evaluationsPerTile: 240, defaultEvaluationsPerTile: 120, backtracks: runs.map((run) => ({ morphology: run.morphology, backtracks: run.backtracks })), seed: 101, rootId: "open-hall" },
    attempted: rows.length,
    validated: records.filter((record) => rows.find((row) => row.id === record.id)?.validated),
    records,
    diagnostics: records.map((record) => ({ id: record.id, targetTiles: 7, rootId: "open-hall", seed: 101, status: record.status, tiles: record.tiles.length, reason: record.reason ?? "" })),
    validation: {},
    rows,
    provisional: [],
  }, null, 2));
  writeFileSync(path.join(OUT, "comparison.json"), JSON.stringify({ prior: "clustering-overnight-v1", added: "clustering-rule-large-v1", coverage, representatives, ruleLarge: rows }, null, 2));
  writeFileSync(path.join(OUT, "index.json"), JSON.stringify({
    id: "rule-large-v1",
    collection: "data/skill6/experiments/clustering-rule-large-v1",
    diagnosis: "The stored compact seven-tile search placed 6 and stopped at 8 backtracks after 588 evaluations. The remaining budget produced a 3-tile tabu set. This run doubles the evaluation allowance to 240 per tile and raises the backtrack cap.",
    reached: rows.some((row) => row.validated),
  }, null, 2));
  console.log("rule large", rows.map((row) => `${row.id} ${row.tiles} ${row.validated ? "validated" : row.reason}`).join(" | "));
  console.log("rule large done");
}

void main();
