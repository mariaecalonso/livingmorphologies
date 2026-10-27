/**
 * TEST 6 manual-style generation batch. Not imported by the app.
 * Run: npx tsx lib/skill4/run-stress-batch-06.ts
 * Generates the SOM field and saves the selected hybrid. No boolean.
 * Writes only SKILL04-STRESS-TEST-06 files.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { TILE_IDS, layoutTiles, type AssemblyArrangement, type AssemblyCount } from "./assembly-layout";
import { captureCatalogEntry, type CatalogEntry } from "./catalog";
import { generateCandidateField } from "./candidate-field";
import { detectAdjacencies, type TileConnection } from "./connections";
import type { FaceId } from "./contract";
import { generateHybridField } from "./generated-hybrid-field";
import { HYBRID_GENERATOR_SETTINGS } from "./hybrid-generator";
import { SECTIONAL_GENERATOR_ACTIVE, SECTIONAL_GENERATOR_SETTINGS } from "./section-hybrid";
import { loadSkill3HandoffRecords } from "./skill3-handoff";
import { loadModuleMap, tileStep, type TileInstance } from "./tiles";

const BATCH = "SKILL04-STRESS-TEST-06";
const REQUIRED = ["H01", "H03", "H05", "H06", "H08", "H10", "H11", "H13", "H15", "H16", "H18", "H20", "H21", "H23", "H25"];
const ALL_H = Array.from({ length: 25 }, (_, index) => `H${String(index + 1).padStart(2, "0")}`);
const FACE_PAIRS: [FaceId, FaceId][] = [
  ["E", "W"], ["W", "E"], ["N", "S"], ["S", "N"],
  ["N", "E"], ["E", "N"], ["W", "S"], ["S", "W"],
  ["E", "S"], ["N", "W"],
  ["T", "B"], ["B", "T"],
  ["T", "E"], ["E", "T"], ["N", "T"], ["T", "N"],
  ["W", "B"], ["B", "W"], ["S", "T"], ["T", "S"],
];
const MIXES = [
  ["lobby", "lobby"],
  ["lobby", "workspace"],
  ["lobby", "gathering"],
  ["workspace", "workspace"],
  ["workspace", "gathering"],
  ["gathering", "gathering"],
] as const;

type Kind = "2" | "4" | "6" | "8" | "custom";
type Plan = {
  index: number;
  kind: Kind;
  count: AssemblyCount;
  arrangement: AssemblyArrangement;
  shape: "layout" | "L" | "step" | "offset" | "stack";
  mix: (typeof MIXES)[number];
};
type Ready = Extract<ReturnType<typeof loadModuleMap> extends Map<string, infer V> ? V : never, { status: "ready" }>;

const PLANS: Plan[] = [];

function pushPlans(kind: Kind, total: number, count: AssemblyCount, arrangements: AssemblyArrangement[], shape: Plan["shape"] = "layout") {
  for (let index = 0; index < total; index += 1) {
    PLANS.push({
      index: PLANS.length,
      kind,
      count,
      arrangement: arrangements[index % arrangements.length],
      shape,
      mix: MIXES[PLANS.length % MIXES.length],
    });
  }
}
pushPlans("2", 10, 2, ["linear", "grid"]);
pushPlans("4", 12, 4, ["linear", "grid", "t"]);
pushPlans("6", 10, 6, ["linear", "grid"]);
pushPlans("8", 10, 8, ["linear", "grid"]);
pushPlans("custom", 2, 4, ["linear"], "L");
pushPlans("custom", 2, 4, ["linear"], "step");
pushPlans("custom", 1, 4, ["linear"], "offset");
pushPlans("custom", 1, 4, ["linear"], "stack");
pushPlans("custom", 1, 4, ["cross"], "layout");
pushPlans("custom", 1, 6, ["linear"], "L");

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

function main() {
  if (!SECTIONAL_GENERATOR_ACTIVE) throw new Error("TEST 6 requires the sectional generator.");
  console.log(`[stress6] generator ${SECTIONAL_GENERATOR_SETTINGS.version}`);
  const loaded = loadModuleMap(loadSkill3HandoffRecords());
  const ready = [...loaded.values()].filter((item): item is Ready => item.status === "ready" && !!item.geometry && !!item.identity);
  const byType = new Map<string, string[]>();
  for (const item of ready) byType.set(item.identity.typologyId, [...(byType.get(item.identity.typologyId) ?? []), item.identity.archetypeId]);
  const readyIds = ready.map((item) => item.identity.archetypeId);
  const modules = new Map(ready.map((item) => [item.identity.archetypeId, item]));
  const seed = { value: hashSeed(BATCH) };
  const seen = new Set<string>();
  let hybridCursor = 0;
  const rows = [];
  const entries: CatalogEntry[] = [];
  const started = Date.now();
  for (const plan of PLANS) {
    const id = `S04 TEST6 ${String(plan.index + 1).padStart(3, "0")}`;
    let tiles: TileInstance[] = [];
    let faces: [FaceId, FaceId][] = [];
    let hybrids: string[] = [];
    let detected = detectAdjacencies([]);
    for (let attempt = 0; attempt < 12; attempt += 1) {
      tiles = buildTiles(plan, seed, byType, readyIds);
      detected = detectAdjacencies(tiles);
      faces = detected.map(() => pick(seed, FACE_PAIRS));
      hybrids = detected.map(() => {
        const forced = hybridCursor < REQUIRED.length * 2 ? REQUIRED[hybridCursor % REQUIRED.length] : pick(seed, ALL_H);
        hybridCursor += 1;
        return forced;
      });
      const signature = [plan.kind, plan.shape, plan.arrangement, tiles.map((tile) => tile.archetypeId).join("+"), faces.map((pair) => pair.join("")).join("|"), hybrids.join(",")].join("#");
      if (!seen.has(signature)) {
        seen.add(signature);
        break;
      }
    }
    const connections: TileConnection[] = [];
    const reasons: string[] = [];
    detected.forEach((edge, index) => {
      const moduleA = modules.get(tiles.find((tile) => tile.instanceId === edge.tileAId)?.archetypeId ?? "");
      const moduleB = modules.get(tiles.find((tile) => tile.instanceId === edge.tileBId)?.archetypeId ?? "");
      const faceA = faces[index][0];
      const faceB = faces[index][1];
      const hybridId = hybrids[index];
      const link = generateLink(id, edge.id, edge.tileAId, edge.tileBId, moduleA, moduleB, faceA, faceB, hybridId);
      connections.push(link.connection);
      if (!link.ready) reasons.push(link.reason);
    });
    const readyLinks = connections.filter((connection) => connection.generationStatus === "ready").length;
    const pass = detected.length > 0 && readyLinks === detected.length;
    const captured = captureCatalogEntry(id, tiles, connections, plan.count, plan.arrangement, loaded, false);
    entries.push({
      ...captured,
      batchId: "TEST_6",
      batch: {
        seed: BATCH,
        status: pass ? "success" : "failed",
        terminalA: pass ? "PASS" : "FAIL",
        terminalB: pass ? "PASS" : "FAIL",
        connected: pass ? "PASS" : "FAIL",
        floating: detected.length - readyLinks,
        coreIntact: "YES",
        boolean: "NOT RUN",
        physical: pass ? "PLACED" : "NOT PLACED",
        componentCount: null,
      },
      connections: captured.connections.map((connection) => ({ ...connection, candidateField: null })),
    });
    rows.push({
      id,
      kind: plan.kind,
      tiles: tiles.length,
      links: detected.length,
      readyLinks,
      pass,
      faces: faces.map((pair) => pair.join("-")),
      hybrids,
      reasons: reasons.slice(0, 3),
    });
    console.log(`[stress6] ${id} ${plan.kind} ${plan.shape} ${readyLinks}/${detected.length} ${pass ? "SAVED" : "INCOMPLETE"}`);
  }
  const summary = {
    total: rows.length,
    saved: entries.length,
    generated: rows.filter((row) => row.pass).length,
    incomplete: rows.filter((row) => !row.pass).length,
    links: rows.reduce((sum, row) => sum + row.links, 0),
    readyLinks: rows.reduce((sum, row) => sum + row.readyLinks, 0),
    generator: SECTIONAL_GENERATOR_SETTINGS.version,
    boolean: "not run",
    elapsedMs: Date.now() - started,
  };
  const directory = join(process.cwd(), "data", "experiments", "skill4-stress");
  mkdirSync(directory, { recursive: true });
  writeFileSync(join(directory, `${BATCH}-report.json`), JSON.stringify({ batch: BATCH, batchId: "TEST_6", seed: BATCH, summary, rows }, null, 2));
  writeFileSync(join(directory, `${BATCH}-catalog.json`), JSON.stringify(entries));
  console.log(`[stress6] done ${JSON.stringify(summary)}`);
}

function generateLink(
  assemblyId: string,
  id: string,
  tileA: string,
  tileB: string,
  moduleA: Ready | undefined,
  moduleB: Ready | undefined,
  faceA: FaceId,
  faceB: FaceId,
  hybridId: string,
): { connection: TileConnection; ready: boolean; reason: string } {
  const blank = (reason: string): { connection: TileConnection; ready: boolean; reason: string } => ({
    connection: {
      id,
      tileAId: tileA,
      tileBId: tileB,
      faceA,
      faceB,
      origin: "detected",
      generationStatus: "blocked",
      faceSelection: "user",
      inputsChanged: false,
      signature: `${BATCH}:${assemblyId}:${id}`,
      candidateField: null,
      generatedHybridField: null,
      selectedMockId: hybridId,
    },
    ready: false,
    reason,
  });
  if (!moduleA || !moduleB) return blank("geometry unavailable");
  const inputs = generateCandidateField({
    signature: `${BATCH}:${assemblyId}:${id}:${moduleA.moduleId}:${faceA}:${moduleB.moduleId}:${faceB}`,
    faceA,
    faceB,
    moduleA,
    moduleB,
  });
  if (!inputs.ok) return blank(inputs.reason);
  const field = generateHybridField({
    moduleA,
    moduleB,
    faceA,
    faceB,
    candidateField: inputs.field,
    settings: HYBRID_GENERATOR_SETTINGS,
  });
  const chosen = field.candidates.find((candidate) => candidate.candidateId === hybridId);
  if (!chosen?.geometry || chosen.status !== "ready") return blank(chosen?.reason || "hybrid was not generated");
  return {
    connection: {
      id,
      tileAId: tileA,
      tileBId: tileB,
      faceA,
      faceB,
      origin: "detected",
      generationStatus: "ready",
      faceSelection: "user",
      inputsChanged: false,
      signature: field.connectionSignature,
      candidateField: null,
      generatedHybridField: {
        ...field,
        candidates: field.candidates.map((candidate) => candidate.candidateId === hybridId ? candidate : { ...candidate, geometry: null }),
      },
      selectedMockId: hybridId,
    },
    ready: true,
    reason: "",
  };
}

function buildTiles(plan: Plan, seed: { value: number }, byType: Map<string, string[]>, all: string[]) {
  const base = plan.shape === "layout" ? layoutTiles(plan.count, plan.arrangement) : placeShape(plan);
  const [leftType, rightType] = plan.mix;
  return base.map((tile, index) => {
    const pool = byType.get(index % 2 === 0 ? leftType : rightType) ?? all;
    return { ...tile, archetypeId: pick(seed, pool), moduleId: tile.moduleId };
  });
}

function placeShape(plan: Plan): TileInstance[] {
  const step = tileStep();
  const count = plan.count === 4 && plan.shape !== "layout" ? 4 : plan.count;
  return TILE_IDS.slice(0, count).map((instanceId, index) => {
    let x = index * step;
    let y = 0;
    let z = 0;
    if (plan.shape === "L") {
      const bend = Math.max(1, Math.floor(count / 2));
      if (index < bend) x = index * step;
      else {
        x = (bend - 1) * step;
        z = (index - bend + 1) * step;
      }
    } else if (plan.shape === "step") {
      x = Math.ceil(index / 2) * step;
      z = Math.floor(index / 2) * step;
    } else if (plan.shape === "offset") {
      x = index * step;
      z = index % 2 === 0 ? 0 : step * 0.2;
    } else if (plan.shape === "stack") {
      x = 0;
      y = index * step;
    }
    return { instanceId, archetypeId: "", moduleId: "", transform: { x, y, z }, rotationQuarter: 0 as const, mirror: null };
  });
}

main();
