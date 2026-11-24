/** Second bounded Branching pass. Does not rerun the validated Compact cluster. */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { assembleCluster } from "../../../../lib/skill6/assembly";
import { SKILL6_GROWTH_DIRECTIONS, SKILL6_PARAMETERS, type ClusterRecord } from "../../../../lib/skill6/contract";
import { runRule } from "../../../../lib/skill6/engines/rule";
import { readShape, shapeSummary } from "../../../../lib/skill6/engines/morphology";
import { loadDockPool } from "../../../../lib/skill6/engines/pool";
import { loadArchetypeMeshes } from "../../../../lib/skill6/source";
import { STEP_COLORS, poseMesh, render } from "./measure-geometry-v1";

const ROOT = process.cwd();
const OUT = path.join(ROOT, "data", "skill6", "process-archive", "diagnostics", "rule-large-v1");
const COLLECTION = path.join(ROOT, "data", "skill6", "experiments", "clustering-rule-large-v1");
const ALLOWED = new Set<string>(SKILL6_GROWTH_DIRECTIONS);

function encode(mesh: { positions: Float32Array; indices: Uint32Array }) {
  return {
    positions: Buffer.from(mesh.positions.buffer, mesh.positions.byteOffset, mesh.positions.byteLength).toString("base64"),
    indices: Buffer.from(mesh.indices.buffer, mesh.indices.byteOffset, mesh.indices.byteLength).toString("base64"),
    triangles: mesh.indices.length / 3,
  };
}

async function main() {
  const meshes = loadArchetypeMeshes();
  const byId = new Map(meshes.map((mesh) => [mesh.archetypeId, mesh]));
  const pool = loadDockPool(meshes, { checked: true, perDirection: 3, cachePath: path.join(COLLECTION, "pair-checks.json") });
  const started = Date.now();
  const outcome = runRule(meshes, pool, {
    id: "rule-large-branching-24",
    seed: 101,
    tiles: 7,
    rootId: "open-hall",
    morphology: "branching",
    budget: 240 * 7,
    backtracks: 24,
  });
  const milliseconds = Date.now() - started;
  const found = [outcome.record, ...outcome.alternatives];
  const index = JSON.parse(readFileSync(path.join(COLLECTION, "index.json"), "utf8")) as { records: ClusterRecord[]; rows: object[]; validated: ClusterRecord[]; diagnostics: object[] };
  const candidates = JSON.parse(readFileSync(path.join(OUT, "candidates.json"), "utf8")) as object[];
  for (const record of found) {
    candidates.push({
      id: record.id,
      morphology: "branching",
      backtracks: 24,
      tiles: record.tiles.length,
      sequence: record.tiles.map((tile) => tile.name),
      trace: record.search?.trace ?? "",
      reason: record.reason,
    });
    if (record.tiles.length < 6) continue;
    const built = await assembleCluster(record, meshes, `data/skill6/experiments/clustering-rule-large-v1/${record.id}.mesh.json`);
    record.assembly = { ...built.assembly, meshFile: `data/skill6/experiments/clustering-rule-large-v1/${record.id}.mesh.json` };
    const reasons: string[] = [];
    if (record.tiles.length !== 7) reasons.push(`${record.tiles.length} of 7 tiles`);
    if (built.assembly.counts["failed-patch"] > 0) reasons.push("failed patch");
    if (record.contacts.length < record.tiles.length - 1) reasons.push("missing contacts");
    if (built.assembly.refined.status !== "NoError" || built.assembly.refined.components !== 1 || (built.assembly.refined.cavities ?? 0) > 0) reasons.push("refined mesh");
    const penetrations = built.assembly.refined.parameters.penetrations ?? 0;
    const maxPenetration = built.assembly.refined.parameters.maxPenetration ?? 0;
    if (penetrations > 0 || maxPenetration > SKILL6_PARAMETERS.maxPenetration) reasons.push(`penetration ${maxPenetration.toFixed(4)}`);
    if (built.assembly.ground.lift > 0.18 || built.assembly.ground.minZAfter < -1e-3) reasons.push("ground");
    for (const step of built.assembly.growth) if (step.direction && !ALLOWED.has(step.direction)) reasons.push(step.direction);
    const clean = reasons.length === 0;
    writeFileSync(path.join(COLLECTION, `${record.id}.mesh.json`), JSON.stringify({
      id: record.id,
      raw: built.meshes.raw ? encode(built.meshes.raw) : null,
      refined: built.meshes.refined ? encode(built.meshes.refined) : null,
      patches: built.meshes.patches.map((mesh) => encode(mesh)),
    }));
    const seated = new Map(built.assembly.seatedTiles.map((tile) => [tile.instanceId, tile.pose]));
    if (built.meshes.refined) render([{ positions: built.meshes.refined.positions, indices: built.meshes.refined.indices, color: [214, 214, 214] }], path.join(OUT, `${record.id}-refined.png`));
    render(record.tiles.map((tile, index) => ({ ...poseMesh(byId.get(tile.archetypeId)!, seated.get(tile.instanceId) ?? tile.pose), color: STEP_COLORS[index % STEP_COLORS.length] })), path.join(OUT, `${record.id}-rigid.png`));
    index.records.push(record);
    index.rows.push({
      id: record.id,
      engine: "rule",
      morphology: "branching",
      targetTiles: 7,
      tiles: record.tiles.length,
      status: record.status,
      stop: record.search?.stop ?? null,
      validated: clean,
      partial: !clean && reasons.every((reason) => reason.endsWith("of 7 tiles")),
      penetrations,
      maxPenetration,
      milliseconds,
      trace: record.search?.trace ?? "",
      reason: clean ? null : reasons.join("; "),
      shape: shapeSummary(readShape(record.tiles, record.contacts, byId)),
      lift: built.assembly.ground.lift,
      backtracks: 24,
      budget: 240 * 7,
    });
    if (clean) index.validated.push(record);
    index.diagnostics.push({ id: record.id, targetTiles: 7, rootId: "open-hall", seed: 101, status: record.status, tiles: record.tiles.length, reason: record.reason ?? "" });
  }
  writeFileSync(path.join(COLLECTION, "index.json"), JSON.stringify(index, null, 2));
  writeFileSync(path.join(OUT, "candidates.json"), JSON.stringify(candidates, null, 2));
  console.log("branching 24", found.map((record) => `${record.id} ${record.tiles.length}`).join(" | "), `${milliseconds}ms`);
}

void main();
