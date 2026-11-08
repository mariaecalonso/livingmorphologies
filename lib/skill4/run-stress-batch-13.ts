/**
 * TEST 13. Not imported by the app.
 * Run: npx tsx lib/skill4/run-stress-batch-13.ts
 *
 * Each assembly follows the interface, not a separate generator:
 * layout button, archetype choice, detected meeting faces, Generate real hybrids, H13, then the same settle.
 * Writes only SKILL04-STRESS-TEST-13 files.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { layoutTiles, type AssemblyArrangement, type AssemblyCount } from "./assembly-layout";
import { captureCatalogEntry, type CatalogEntry } from "./catalog";
import { generateCandidateField } from "./candidate-field";
import {
  generateConnectionHybridField,
  reconcileConnections,
  type TileConnection,
} from "./connections";
import { hybridFaceTargets } from "./hybrid-attachment";
import { HYBRID_GENERATOR_SETTINGS } from "./hybrid-generator";
import { SECTIONAL_GENERATOR_SETTINGS } from "./section-hybrid";
import { loadSkill3HandoffRecords } from "./skill3-handoff";
import { HYBRID_GAP, loadModuleMap, resolveTileModule, type TileInstance } from "./tiles";
import { liftConnectedToGround, meshAttachment, orientTiles, placedBoundsMinY } from "./tile-orientation";
import type { ModuleHandoff } from "./adapt";

const BATCH = "SKILL04-STRESS-TEST-13";
const MIXES = [
  ["lobby", "lobby"],
  ["lobby", "workspace"],
  ["lobby", "gathering"],
  ["workspace", "workspace"],
  ["workspace", "gathering"],
  ["gathering", "gathering"],
] as const;

type Kind = "2" | "4" | "6" | "8";
type Plan = {
  index: number;
  kind: Kind;
  count: AssemblyCount;
  arrangement: AssemblyArrangement;
  mix: (typeof MIXES)[number];
};
type Loaded = ReturnType<typeof loadModuleMap>;

const PLANS: Plan[] = [];

function pushPlans(kind: Kind, total: number, count: AssemblyCount, arrangements: AssemblyArrangement[]) {
  for (let index = 0; index < total; index += 1) {
    PLANS.push({
      index: PLANS.length,
      kind,
      count,
      arrangement: arrangements[index % arrangements.length],
      mix: MIXES[PLANS.length % MIXES.length],
    });
  }
}
pushPlans("2", 10, 2, ["linear", "grid"]);
pushPlans("4", 12, 4, ["linear", "grid", "t"]);
pushPlans("4", 4, 4, ["cross"]);
pushPlans("6", 12, 6, ["linear", "grid"]);
pushPlans("8", 12, 8, ["linear", "grid"]);

function hashSeed(text: string) {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) hash = Math.imul(hash ^ text.charCodeAt(index), 16777619);
  return hash >>> 0;
}

function random(seed: { value: number }) {
  seed.value = (seed.value + 0x6d2b79f5) | 0;
  let value = Math.imul(seed.value ^ (seed.value >>> 15), 1 | seed.value);
  value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
  return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
}

function pick<T>(seed: { value: number }, items: readonly T[]) {
  return items[Math.floor(random(seed) * items.length)];
}

function layoutAdjacency(count: AssemblyCount, arrangement: AssemblyArrangement, tiles: readonly TileInstance[]) {
  return layoutTiles(count, arrangement, tiles).map((tile) => ({
    ...tile,
    rotationQuarter: 0 as const,
    mirror: null,
    rotation: undefined,
  }));
}

/** Same board update as choosing a layout or finishing Generate real hybrids. */
function settle(
  tiles: TileInstance[],
  connections: TileConnection[],
  count: AssemblyCount,
  arrangement: AssemblyArrangement,
  loaded: Loaded,
  focusConnectionId?: string,
) {
  const slots = layoutTiles(count, arrangement, tiles).map((tile) => {
    const prior = tiles.find((item) => item.instanceId === tile.instanceId);
    return {
      ...tile,
      moduleId: prior?.moduleId || tile.moduleId,
      manualQuarter: prior?.manualQuarter ?? 0,
      manualMirror: prior?.manualMirror ?? null,
    };
  });
  const oriented = orientTiles(slots, connections, focusConnectionId, (tileId, face) => {
    const tile = slots.find((item) => item.instanceId === tileId);
    if (!tile) return null;
    const handoff = resolveTileModule(tile.archetypeId, loaded);
    if (handoff.status !== "ready" || !handoff.geometry) return null;
    return meshAttachment(handoff.geometry.positions, handoff.faces[face]);
  }, (connection) => connectionSpan(connection, slots, loaded));
  const nextTiles = liftConnectedToGround(oriented.tiles, connections, (tile) => {
    const handoff = resolveTileModule(tile.archetypeId, loaded);
    const positions = handoff.status === "ready" ? handoff.geometry?.positions : undefined;
    return placedBoundsMinY({ ...tile, moduleId: tile.moduleId || handoff.moduleId }, positions);
  }).map((tile) => ({
    ...tile,
    moduleId: tile.moduleId || resolveTileModule(tile.archetypeId, loaded).moduleId,
  }));
  const adjacency = layoutAdjacency(count, arrangement, slots).filter((tile) => tile.archetypeId);
  const nextConnections = reconcileConnections(connections, nextTiles, loaded, adjacency).map((connection) => {
    const prior = connections.find((item) => item.id === connection.id);
    const kept = prior?.selectedMockId ? connection : { ...connection, selectedMockId: "" };
    return {
      ...kept,
      orientation: oriented.unresolved.has(connection.id) ? "unresolved" as const : "ready" as const,
    };
  });
  return { tiles: nextTiles, connections: nextConnections };
}

function connectionSpan(connection: TileConnection, slots: readonly TileInstance[], loaded: Loaded) {
  const selected = connection.generatedHybridField?.candidates.find((item) => item.candidateId === connection.selectedMockId);
  const mesh = selected?.status === "ready" ? selected.geometry : null;
  const tileA = slots.find((tile) => tile.instanceId === connection.tileAId);
  const tileB = slots.find((tile) => tile.instanceId === connection.tileBId);
  if (!mesh || !tileA || !tileB) return HYBRID_GAP;
  const moduleA = resolveTileModule(tileA.archetypeId, loaded);
  const moduleB = resolveTileModule(tileB.archetypeId, loaded);
  if (moduleA.status !== "ready" || moduleB.status !== "ready" || !moduleA.geometry || !moduleB.geometry) return HYBRID_GAP;
  return hybridFaceTargets(mesh, moduleA.geometry, moduleA.faces[connection.faceA], moduleB.geometry, moduleB.faces[connection.faceB]) ?? HYBRID_GAP;
}

function main() {
  console.log(`[stress13] interface generator ${SECTIONAL_GENERATOR_SETTINGS.version}`);
  const loaded = loadModuleMap(loadSkill3HandoffRecords());
  const ready = [...loaded.values()].filter((item): item is Extract<ModuleHandoff, { status: "ready" }> => item.status === "ready" && !!item.geometry && !!item.identity);
  const byType = new Map<string, string[]>();
  for (const item of ready) byType.set(item.identity.typologyId, [...(byType.get(item.identity.typologyId) ?? []), item.identity.archetypeId]);
  const readyIds = ready.map((item) => item.identity.archetypeId);
  const seed = { value: hashSeed(BATCH) };
  const rows = [];
  const entries: CatalogEntry[] = [];
  const started = Date.now();
  for (const plan of PLANS) {
    const id = `S04 TEST13 ${String(plan.index + 1).padStart(3, "0")}`;
    const [leftType, rightType] = plan.mix;
    let tiles = layoutTiles(plan.count, plan.arrangement).map((tile, index) => {
      const pool = byType.get(index % 2 === 0 ? leftType : rightType) ?? readyIds;
      const archetypeId = pick(seed, pool);
      return { ...tile, archetypeId, moduleId: resolveTileModule(archetypeId, loaded).moduleId };
    });
    let connections = reconcileConnections([], tiles, loaded, layoutAdjacency(plan.count, plan.arrangement, tiles));
    const reasons: string[] = [];
    for (const link of [...connections]) {
      const connection = connections.find((item) => item.id === link.id);
      const tileA = tiles.find((tile) => tile.instanceId === connection?.tileAId);
      const tileB = tiles.find((tile) => tile.instanceId === connection?.tileBId);
      if (!connection || !tileA || !tileB) {
        reasons.push(`${link.id} tiles missing`);
        continue;
      }
      const moduleA = resolveTileModule(tileA.archetypeId, loaded);
      const moduleB = resolveTileModule(tileB.archetypeId, loaded);
      if (moduleA.status !== "ready" || moduleB.status !== "ready") {
        reasons.push(`${connection.id} geometry unavailable`);
        continue;
      }
      const inputs = generateCandidateField({
        signature: connection.signature,
        faceA: connection.faceA,
        faceB: connection.faceB,
        moduleA,
        moduleB,
      });
      if (!inputs.ok) {
        reasons.push(`${connection.id} ${inputs.reason}`);
        continue;
      }
      const generated = generateConnectionHybridField(
        { ...connection, candidateField: inputs.field, inputsChanged: false },
        tiles,
        loaded,
      );
      if (!generated.ok) {
        reasons.push(`${connection.id} ${generated.reason}`);
        continue;
      }
      connections = connections.map((item) => item.id === connection.id ? generated.connection : item);
      const seated = settle(tiles, connections, plan.count, plan.arrangement, loaded, connection.id);
      tiles = seated.tiles;
      connections = seated.connections;
    }
    const readyLinks = connections.filter((connection) => {
      const selected = connection.generatedHybridField?.candidates.find((item) => item.candidateId === connection.selectedMockId);
      return connection.selectedMockId === "H13" && selected?.status === "ready" && selected.geometry;
    }).length;
    const pass = connections.length > 0 && readyLinks === connections.length;
    const captured = captureCatalogEntry(id, tiles, connections, plan.count, plan.arrangement, loaded, false);
    entries.push({
      ...captured,
      batchId: "TEST_13",
      batch: {
        seed: BATCH,
        status: pass ? "success" : "failed",
        terminalA: pass ? "PASS" : "FAIL",
        terminalB: pass ? "PASS" : "FAIL",
        connected: pass ? "PASS" : "FAIL",
        floating: connections.length - readyLinks,
        coreIntact: "YES",
        boolean: "NOT RUN",
        physical: pass ? "PLACED" : "NOT PLACED",
        componentCount: null,
      },
    });
    rows.push({
      id,
      kind: plan.kind,
      arrangement: plan.arrangement,
      tiles: tiles.length,
      links: connections.length,
      readyLinks,
      selected: "H13",
      pass,
      faces: connections.map((connection) => `${connection.faceA}-${connection.faceB}`),
      reasons: reasons.slice(0, 3),
    });
    console.log(`[stress13] ${id} ${plan.kind} ${plan.arrangement} ${readyLinks}/${connections.length} ${pass ? "SAVED" : "INCOMPLETE"}`);
  }
  const summary = {
    total: rows.length,
    saved: entries.length,
    generated: rows.filter((row) => row.pass).length,
    incomplete: rows.filter((row) => !row.pass).length,
    links: rows.reduce((sum, row) => sum + row.links, 0),
    readyLinks: rows.reduce((sum, row) => sum + row.readyLinks, 0),
    generator: SECTIONAL_GENERATOR_SETTINGS.version,
    generatorSettings: HYBRID_GENERATOR_SETTINGS.version,
    selection: "H13",
    boolean: "not run",
    elapsedMs: Date.now() - started,
  };
  const directory = join(process.cwd(), "data", "experiments", "skill4-stress");
  const published = join(process.cwd(), "public", "skill4");
  mkdirSync(directory, { recursive: true });
  mkdirSync(published, { recursive: true });
  const catalog = JSON.stringify(entries);
  writeFileSync(join(directory, `${BATCH}-report.json`), JSON.stringify({ batch: BATCH, batchId: "TEST_13", seed: BATCH, summary, rows }, null, 2));
  writeFileSync(join(directory, `${BATCH}-catalog.json`), catalog);
  writeFileSync(join(published, `${BATCH}-catalog.json`), catalog);
  console.log(`[stress13] done ${JSON.stringify(summary)}`);
}

main();
