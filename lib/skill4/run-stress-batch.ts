/**
 * Explicit Skill 04 stress batch. Not imported by the app.
 * Run: npx tsx lib/skill4/run-stress-batch.ts
 * Uses the current generator, placement, and catalog snapshot. Does not retry failures.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { catalogIdentity } from "./adapt";
import { placedFaceFrame } from "./assembly-hybrid";
import { TILE_IDS, layoutTiles, type AssemblyArrangement, type AssemblyCount } from "./assembly-layout";
import { diagnoseTopology } from "./boolean-conditioning";
import { captureCatalogEntry, type CatalogEntry } from "./catalog";
import { generateCandidateField } from "./candidate-field";
import { CONNECTION_DEBUG_STAGE } from "./connection-debug";
import {
  connectionInputSignature,
  detectAdjacencies,
  reconcileConnections,
  type TileConnection,
} from "./connections";
import type { FaceId } from "./contract";
import { faceAttachmentField } from "./face-field";
import { faceSurfaceHighlight } from "./face-outline";
import { generateHybridField } from "./generated-hybrid-field";
import { HYBRID_GENERATOR_SETTINGS } from "./hybrid-generator";
import { assembleIntactHybrid, hybridFaceTargets } from "./hybrid-attachment";
import { loadSkill3HandoffRecords } from "./skill3-handoff";
import { liftConnectedToGround, meshAttachment, orientTiles, placedBoundsMinY } from "./tile-orientation";
import { rotateByBasis, tileBasis } from "./tile-basis";
import { HYBRID_GAP, loadModuleMap, resolveTileModule, tileStep, type TileInstance } from "./tiles";

const BATCH = "SKILL04-STRESS-TEST-02";
/** Existing rigid-contact allowance. A larger gap is an air gap. */
const CONTACT_TOLERANCE = 0.75;
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

type Row = {
  id: string;
  kind: Kind;
  tileCount: number;
  arrangement: string;
  shape: string;
  connections: number;
  geometries: string[];
  typologies: string[];
  faces: string[];
  hybrids: string[];
  som: "PASS" | "FAIL";
  placement: "PASS" | "FAIL";
  integrity: "PASS" | "FAIL";
  faceConnection: "PASS" | "FAIL";
  boolean: "READY" | "UNRESOLVED" | "FAILED";
  physical: "READY" | "NOT READY";
  catalogSaved: "YES" | "NO";
  failureStage: string;
  failureReason: string;
  categories: string[];
  coverage: number[];
  terminalDistance: number[];
  coreChanged: "YES" | "NO";
  planar: "YES" | "NO";
  boundaryEdges: number;
  components: number;
  unresolved: string[];
  terminalA: "PASS" | "FAIL";
  terminalB: "PASS" | "FAIL";
  connected: "PASS" | "FAIL";
  floating: number;
};

function main() {
  const records = loadSkill3HandoffRecords();
  const loaded = loadModuleMap(records);
  const ready = [...loaded.values()].filter((item) => item.status === "ready" && item.geometry && item.identity);
  const readyIds = ready.flatMap((item) => item.identity ? [item.identity.archetypeId] : []);
  const byType = new Map<string, string[]>();
  for (const item of ready) {
    if (!item.identity) continue;
    const type = item.identity.typologyId ?? "unknown";
    byType.set(type, [...(byType.get(type) ?? []), item.identity.archetypeId]);
  }
  if (ready.length < 2) throw new Error("Fewer than two Skill 03 modules are ready.");
  const seed = { value: hashSeed(BATCH) };
  const seen = new Set<string>();
  let hybridCursor = 0;
  const rows: Row[] = [];
  const entries: CatalogEntry[] = [];
  const started = Date.now();
  for (const plan of PLANS) {
    const id = `S04 TEST2 ${String(plan.index + 1).padStart(3, "0")}`;
    let signature = "";
    let tiles: TileInstance[] = [];
    let faces: [FaceId, FaceId][] = [];
    let hybrids: string[] = [];
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const built = buildTiles(plan, seed, byType, readyIds);
      tiles = built;
      const detected = detectAdjacencies(tiles);
      faces = detected.map(() => pick(seed, FACE_PAIRS));
      hybrids = detected.map(() => {
        const forced = hybridCursor < REQUIRED.length * 2 ? REQUIRED[hybridCursor % REQUIRED.length] : pick(seed, ALL_H);
        hybridCursor += 1;
        return forced;
      });
      signature = [plan.kind, plan.shape, plan.arrangement, built.map((tile) => tile.archetypeId).join("+"), faces.map((pair) => pair.join("")).join("|"), hybrids.join(",")].join("#");
      if (!seen.has(signature)) break;
    }
    seen.add(signature);
    console.log(`[stress] ${id} ${plan.kind} ${plan.shape} ${plan.arrangement}`);
    try {
      const result = runOne(id, plan, tiles, faces, hybrids, loaded);
      rows.push(result.row);
      if (result.entry) entries.push(result.entry);
      console.log(`[stress] ${id} som=${result.row.som} placement=${result.row.placement} face=${result.row.faceConnection} ${result.row.failureReason}`);
    } catch (error) {
      const reason = error instanceof Error ? error.message : "The test threw.";
      rows.push(failedRow(id, plan, tiles, faces, hybrids, reason));
      console.log(`[stress] ${id} threw ${reason}`);
    }
  }
  const directory = join(process.cwd(), "data", "experiments", "skill4-stress");
  mkdirSync(directory, { recursive: true });
  const summary = {
    total: rows.length,
    fullConnectionSuccess: rows.filter((row) => row.connected === "PASS").length,
    partial: rows.filter((row) => row.connected === "FAIL" && (row.terminalA === "PASS" || row.terminalB === "PASS")).length,
    failed: rows.filter((row) => row.terminalA === "FAIL" && row.terminalB === "FAIL").length,
    catalogSaved: rows.filter((row) => row.catalogSaved === "YES").length,
    floatingAssemblies: rows.filter((row) => row.floating > 0).length,
    terminalFailures: rows.filter((row) => row.terminalA === "FAIL" || row.terminalB === "FAIL").length,
    disconnected: rows.filter((row) => row.connected === "FAIL").length,
  };
  writeFileSync(join(directory, `${BATCH}-report.json`), JSON.stringify({ batch: BATCH, batchId: "TEST_2", generator: HYBRID_GENERATOR_SETTINGS.version, contactTolerance: CONTACT_TOLERANCE, elapsedMs: Date.now() - started, summary, rows }, null, 2));
  writeFileSync(join(directory, `${BATCH}-catalog.json`), JSON.stringify(entries));
  console.log(`[stress] done ${JSON.stringify(summary)} ${Math.round((Date.now() - started) / 1000)}s`);
}

function buildTiles(plan: Plan, seed: { value: number }, byType: Map<string, string[]>, all: string[]) {
  const base = plan.shape === "layout"
    ? layoutTiles(plan.count, plan.arrangement)
    : placeShape(plan);
  const [leftType, rightType] = plan.mix;
  return base.map((tile, index) => {
    const type = index % 2 === 0 ? leftType : rightType;
    const pool = byType.get(type) ?? all;
    const archetypeId = pick(seed, pool);
    const handoff = catalogIdentity(archetypeId);
    return {
      ...tile,
      archetypeId,
      moduleId: "",
      manualQuarter: 0 as const,
      manualMirror: null,
      rotationQuarter: 0 as const,
      mirror: null,
      nameHint: handoff?.name ?? archetypeId,
    };
  });
}

function placeShape(plan: Plan): TileInstance[] {
  const step = tileStep();
  const count = plan.count === 4 && plan.shape !== "layout" ? 4 : plan.count;
  const ids = TILE_IDS.slice(0, count);
  return ids.map((instanceId, index) => {
    let x = index * step;
    let y = 0;
    let z = 0;
    if (plan.shape === "L") {
      const bend = Math.max(1, Math.floor(count / 2));
      if (index < bend) {
        x = index * step;
        z = 0;
      } else {
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
      z = 0;
    }
    return {
      instanceId,
      archetypeId: "",
      moduleId: "",
      transform: { x, y, z },
      rotationQuarter: 0 as const,
      mirror: null,
    };
  });
}

function runOne(
  id: string,
  plan: Plan,
  initial: TileInstance[],
  facePairs: [FaceId, FaceId][],
  hybrids: string[],
  loaded: ReturnType<typeof loadModuleMap>,
): { row: Row; entry: CatalogEntry | null } {
  const layout = initial.map((tile) => {
    const copy = { ...tile } as TileInstance & { nameHint?: string };
    delete copy.nameHint;
    return copy;
  });
  let connections = reconcileConnections([], layout, loaded, layout);
  connections = connections.map((connection, index) => {
    const pair = facePairs[index] ?? [connection.faceA, connection.faceB];
    const next: TileConnection = { ...connection, faceA: pair[0], faceB: pair[1], faceSelection: "user" };
    next.signature = connectionInputSignature(next, layout, loaded);
    next.selectedMockId = hybrids[index] ?? connection.selectedMockId;
    return next;
  });
  let tiles = seat(layout, connections, loaded);
  connections = refresh(connections, tiles, layout, loaded);
  const categories = new Set<string>();
  const reasons: string[] = [];
  let somPass = true;
  let placementPass = true;
  let integrityPass = true;
  let facePass = true;
  const coverage: number[] = [];
  const terminalDistance: number[] = [];
  let boundaryEdges = 0;
  let components = 0;
  let planar = false;
  let coreChanged = false;
  const unresolved = new Set<string>();
  const links: { id: string; tileA: string; tileB: string; touchA: boolean; touchB: boolean }[] = [];
  for (let index = 0; index < connections.length; index += 1) {
    const connection = connections[index];
    const requested = hybrids[index] ?? connection.selectedMockId;
    const tileA = tiles.find((tile) => tile.instanceId === connection.tileAId);
    const tileB = tiles.find((tile) => tile.instanceId === connection.tileBId);
    const moduleA = tileA ? resolveTileModule(tileA.archetypeId, loaded) : null;
    const moduleB = tileB ? resolveTileModule(tileB.archetypeId, loaded) : null;
    if (!moduleA || !moduleB || moduleA.status !== "ready" || moduleB.status !== "ready" || !moduleA.geometry || !moduleB.geometry) {
      somPass = false;
      categories.add("FACE SAMPLING FAILURE");
      reasons.push(`${connection.id} geometry unavailable`);
      links.push({ id: connection.id, tileA: connection.tileAId, tileB: connection.tileBId, touchA: false, touchB: false });
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
      somPass = false;
      categories.add("FACE SAMPLING FAILURE");
      reasons.push(`${connection.id} ${inputs.reason}`);
      links.push({ id: connection.id, tileA: connection.tileAId, tileB: connection.tileBId, touchA: false, touchB: false });
      continue;
    }
    let field;
    try {
      field = generateHybridField({
        moduleA,
        moduleB,
        faceA: connection.faceA,
        faceB: connection.faceB,
        candidateField: inputs.field,
        settings: HYBRID_GENERATOR_SETTINGS,
      });
    } catch (error) {
      somPass = false;
      categories.add("SOM COLLAPSE");
      reasons.push(`${connection.id} ${error instanceof Error ? error.message : "SOM threw"}`);
      links.push({ id: connection.id, tileA: connection.tileAId, tileB: connection.tileBId, touchA: false, touchB: false });
      continue;
    }
    connection.candidateField = inputs.field;
    connection.generatedHybridField = field;
    connection.selectedMockId = requested;
    connection.generationStatus = field.status;
    const chosen = field.candidates.find((item) => item.candidateId === requested);
    if (!chosen || chosen.status !== "ready" || !chosen.geometry) {
      somPass = false;
      categories.add(field.status === "blocked" ? "SOM COLLAPSE" : "CONNECTOR FAILURE");
      reasons.push(`${connection.id} ${requested} ${chosen?.status ?? "missing"} ${chosen?.reason ?? field.status}`);
      links.push({ id: connection.id, tileA: connection.tileAId, tileB: connection.tileBId, touchA: false, touchB: false });
      continue;
    }
    tiles = seat(tiles, connections, loaded);
    const seated = tiles.find((tile) => tile.instanceId === connection.tileAId);
    const seatedB = tiles.find((tile) => tile.instanceId === connection.tileBId);
    const oriented = orientTiles(tiles, connections);
    if (oriented.unresolved.has(connection.id)) {
      placementPass = false;
      unresolved.add(connection.id);
      categories.add("PLACEMENT FAILURE");
      reasons.push(`${connection.id} unresolved orientation`);
    }
    if (!seated || !seatedB) {
      links.push({ id: connection.id, tileA: connection.tileAId, tileB: connection.tileBId, touchA: false, touchB: false });
      continue;
    }
    const frameA = moduleA.faces[connection.faceA];
    const frameB = moduleB.faces[connection.faceB];
    const placedA = placedFaceFrame(frameA, seated);
    const placedB = placedFaceFrame(frameB, seatedB);
    const assembled = assembleIntactHybrid({
      mesh: chosen.geometry,
      parentA: moduleA.geometry,
      parentB: moduleB.geometry,
      frameA,
      frameB,
      placedA,
      placedB,
      tileA: seated,
      tileB: seatedB,
    });
    if (!assembled) {
      integrityPass = false;
      coreChanged = true;
      categories.add("HYBRID DEFORMATION");
      reasons.push(`${connection.id} hybrid core changed`);
      links.push({ id: connection.id, tileA: connection.tileAId, tileB: connection.tileBId, touchA: false, touchB: false });
      continue;
    }
    const topology = diagnoseTopology(assembled.mesh);
    boundaryEdges += topology.boundaryEdgeCount;
    components = Math.max(components, topology.componentCount);
    if (topology.boundaryEdgeCount > 0 || topology.componentCount !== 1) categories.add("MANIFOLD FAILURE");
    const size = extents(assembled.mesh.positions);
    const thin = size.smallest / Math.max(size.largest, 1e-6);
    if (thin < 0.04) {
      planar = true;
      categories.add("PLANAR COLLAPSE");
    }
    const samples = Math.min(96, assembled.mesh.positions.length / 3);
    const endA = ringCentroid(assembled.mesh.positions, 0, samples);
    const endB = ringCentroid(assembled.mesh.positions, assembled.mesh.positions.length / 3 - samples, samples);
    const coverA = coverFace(moduleA.geometry, frameA, seated, endA);
    const coverB = coverFace(moduleB.geometry, frameB, seatedB, endB);
    coverage.push(coverA.ratio, coverB.ratio);
    terminalDistance.push(coverA.terminalDistance, coverB.terminalDistance);
    const touchA = coverA.terminalDistance <= CONTACT_TOLERANCE;
    const touchB = coverB.terminalDistance <= CONTACT_TOLERANCE;
    links.push({ id: connection.id, tileA: connection.tileAId, tileB: connection.tileBId, touchA, touchB });
    if (!touchA || !touchB) {
      facePass = false;
      categories.add("TERMINAL-TO-FACE FAILURE");
      reasons.push(`${connection.id} terminal distance ${coverA.terminalDistance.toFixed(2)} / ${coverB.terminalDistance.toFixed(2)}`);
    }
    if (!coverA.accepted || !coverB.accepted) {
      reasons.push(`${connection.id} coverage ${coverA.ratio.toFixed(2)} / ${coverB.ratio.toFixed(2)}`);
    }
  }
  const assembly = assemblyComponents(tiles.map((tile) => tile.instanceId), links);
  const terminalA = links.length > 0 && links.every((link) => link.touchA) ? "PASS" : "FAIL";
  const terminalB = links.length > 0 && links.every((link) => link.touchB) ? "PASS" : "FAIL";
  if (unresolved.size > 0) placementPass = false;
  if (boundaryEdges > 0 || components > 1 || planar) integrityPass = false;
  const connectedPass = somPass && placementPass && integrityPass && facePass && assembly.components === 1 && assembly.floating === 0;
  if (assembly.floating > 0) {
    categories.add("FLOATING COMPONENT");
    reasons.push(`${assembly.floating} floating component${assembly.floating === 1 ? "" : "s"}`);
  }
  const names = layout.map((tile) => resolveTileModule(tile.archetypeId, loaded).identity?.name ?? tile.archetypeId);
  const types = layout.map((tile) => resolveTileModule(tile.archetypeId, loaded).identity?.typologyLabel ?? "");
  const captured = captureCatalogEntry(id, tiles, connections, plan.count, plan.arrangement, loaded, false);
  const renderable = captured.tiles.length > 0 && captured.connections.some((connection) => connection.selectedHybrid);
  const entry: CatalogEntry = {
    ...captured,
    batchId: "TEST_2",
    batch: {
      seed: BATCH,
      status: connectedPass ? "success" : "failed",
      terminalA,
      terminalB,
      connected: connectedPass ? "PASS" : "FAIL",
      floating: assembly.floating,
      coreIntact: coreChanged ? "NO" : "YES",
      boolean: CONNECTION_DEBUG_STAGE >= 5 ? "FAILED" : "UNRESOLVED",
      physical: connectedPass ? "READY" : "NOT READY",
    },
    connections: captured.connections.map((connection) => ({ ...connection, candidateField: null })),
  };
  const row: Row = {
    id,
    kind: plan.kind,
    tileCount: tiles.length,
    arrangement: `${plan.arrangement}/${plan.shape}`,
    shape: plan.shape,
    connections: connections.length,
    geometries: names,
    typologies: types,
    faces: connections.map((connection) => `${connection.faceA}-${connection.faceB}`),
    hybrids,
    som: somPass ? "PASS" : "FAIL",
    placement: placementPass ? "PASS" : "FAIL",
    integrity: integrityPass ? "PASS" : "FAIL",
    faceConnection: facePass ? "PASS" : "FAIL",
    boolean: CONNECTION_DEBUG_STAGE >= 5 ? "FAILED" : "UNRESOLVED",
    physical: connectedPass ? "READY" : "NOT READY",
    catalogSaved: renderable ? "YES" : "NO",
    failureStage: categories.size === 0 ? "" : [...categories][0],
    failureReason: reasons.join(" | "),
    categories: [...categories],
    coverage,
    terminalDistance,
    coreChanged: coreChanged ? "YES" : "NO",
    planar: planar ? "YES" : "NO",
    boundaryEdges,
    components,
    unresolved: [...unresolved],
    terminalA,
    terminalB,
    connected: connectedPass ? "PASS" : "FAIL",
    floating: assembly.floating,
  };
  if (!somPass || !placementPass || !integrityPass || !facePass) {
    if (categories.size === 0) categories.add("OTHER");
  }
  row.categories = [...categories];
  if (!row.failureStage && row.categories.length > 0) row.failureStage = row.categories[0];
  return { row, entry: renderable ? entry : null };
}

function seat(tiles: TileInstance[], connections: TileConnection[], loaded: ReturnType<typeof loadModuleMap>) {
  const oriented = orientTiles(tiles, connections, undefined, (tileId, face) => {
    const tile = tiles.find((item) => item.instanceId === tileId);
    if (!tile) return null;
    const handoff = resolveTileModule(tile.archetypeId, loaded);
    if (handoff.status !== "ready" || !handoff.geometry) return null;
    return meshAttachment(handoff.geometry.positions, handoff.faces[face]);
  }, (connection) => spanOf(connection, tiles, loaded));
  return liftConnectedToGround(oriented.tiles, connections, (tile) => {
    const handoff = resolveTileModule(tile.archetypeId, loaded);
    const positions = handoff.status === "ready" ? handoff.geometry?.positions : undefined;
    return placedBoundsMinY(tile, positions);
  }).map((tile) => ({
    ...tile,
    moduleId: tile.moduleId || resolveTileModule(tile.archetypeId, loaded).moduleId,
  }));
}

function refresh(connections: TileConnection[], tiles: TileInstance[], layout: TileInstance[], loaded: ReturnType<typeof loadModuleMap>) {
  return reconcileConnections(connections, tiles, loaded, layout).map((connection) => ({
    ...connection,
    orientation: orientTiles(tiles, connections).unresolved.has(connection.id) ? "unresolved" as const : "ready" as const,
  }));
}

function spanOf(connection: TileConnection, tiles: TileInstance[], loaded: ReturnType<typeof loadModuleMap>) {
  const selected = connection.generatedHybridField?.candidates.find((item) => item.candidateId === connection.selectedMockId);
  const mesh = selected?.status === "ready" ? selected.geometry : null;
  const tileA = tiles.find((tile) => tile.instanceId === connection.tileAId);
  const tileB = tiles.find((tile) => tile.instanceId === connection.tileBId);
  if (!mesh || !tileA || !tileB) return HYBRID_GAP;
  const moduleA = resolveTileModule(tileA.archetypeId, loaded);
  const moduleB = resolveTileModule(tileB.archetypeId, loaded);
  if (moduleA.status !== "ready" || moduleB.status !== "ready" || !moduleA.geometry || !moduleB.geometry) return HYBRID_GAP;
  return hybridFaceTargets(mesh, moduleA.geometry, moduleA.faces[connection.faceA], moduleB.geometry, moduleB.faces[connection.faceB]) ?? HYBRID_GAP;
}

function coverFace(
  mesh: import("../scan/isomesh").IsoMesh,
  frame: import("./contract").FaceFrame,
  tile: TileInstance,
  terminal: { x: number; y: number; z: number },
) {
  const coat = faceSurfaceHighlight(mesh, frame);
  const basis = tileBasis(tile);
  const place = (point: { x: number; y: number; z: number }) => {
    const turned = rotateByBasis(basis, point);
    return { x: turned.x + tile.transform.x, y: turned.y + tile.transform.y, z: turned.z + tile.transform.z };
  };
  if (!coat) return { ratio: 0, terminalDistance: Infinity, accepted: false };
  const field = faceAttachmentField(coat, place, terminal);
  return field.report;
}

function ringCentroid(positions: Float32Array, start: number, count: number) {
  let x = 0;
  let y = 0;
  let z = 0;
  const safe = Math.max(1, count);
  for (let index = 0; index < safe; index += 1) {
    const offset = (start + index) * 3;
    x += positions[offset] ?? 0;
    y += positions[offset + 1] ?? 0;
    z += positions[offset + 2] ?? 0;
  }
  return { x: x / safe, y: y / safe, z: z / safe };
}

function extents(positions: Float32Array) {
  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;
  for (let index = 0; index < positions.length; index += 3) {
    minX = Math.min(minX, positions[index]);
    minY = Math.min(minY, positions[index + 1]);
    minZ = Math.min(minZ, positions[index + 2]);
    maxX = Math.max(maxX, positions[index]);
    maxY = Math.max(maxY, positions[index + 1]);
    maxZ = Math.max(maxZ, positions[index + 2]);
  }
  const size = [maxX - minX, maxY - minY, maxZ - minZ].sort((a, b) => a - b);
  return { smallest: size[0], largest: size[2] };
}

function failedRow(id: string, plan: Plan, tiles: TileInstance[], faces: [FaceId, FaceId][], hybrids: string[], reason: string): Row {
  return {
    id,
    kind: plan.kind,
    tileCount: tiles.length,
    arrangement: `${plan.arrangement}/${plan.shape}`,
    shape: plan.shape,
    connections: faces.length,
    geometries: tiles.map((tile) => tile.archetypeId),
    typologies: [],
    faces: faces.map((pair) => pair.join("-")),
    hybrids,
    som: "FAIL",
    placement: "FAIL",
    integrity: "FAIL",
    faceConnection: "FAIL",
    boolean: "UNRESOLVED",
    physical: "NOT READY",
    catalogSaved: "NO",
    failureStage: "OTHER",
    failureReason: reason,
    categories: ["OTHER"],
    coverage: [],
    terminalDistance: [],
    coreChanged: "NO",
    planar: "NO",
    boundaryEdges: 0,
    components: 0,
    unresolved: [],
    terminalA: "FAIL",
    terminalB: "FAIL",
    connected: "FAIL",
    floating: tiles.length,
  };
}

function assemblyComponents(
  tileIds: string[],
  links: { id: string; tileA: string; tileB: string; touchA: boolean; touchB: boolean }[],
) {
  const parent = new Map<string, string>();
  const find = (id: string): string => {
    const current = parent.get(id) ?? id;
    if (current === id) return id;
    const root = find(current);
    parent.set(id, root);
    return root;
  };
  const unite = (left: string, right: string) => {
    const a = find(left);
    const b = find(right);
    if (a !== b) parent.set(a, b);
  };
  for (const id of tileIds) parent.set(id, id);
  for (const link of links) {
    const hybrid = `hybrid:${link.id}`;
    parent.set(hybrid, hybrid);
    if (link.touchA) unite(link.tileA, hybrid);
    if (link.touchB) unite(hybrid, link.tileB);
  }
  const groups = new Set([...parent.keys()].map((id) => find(id)));
  return { components: groups.size, floating: Math.max(0, groups.size - 1) };
}

main();
