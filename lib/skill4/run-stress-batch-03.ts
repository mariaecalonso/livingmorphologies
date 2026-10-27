/**
 * TEST 3 physical-merge stress batch. Not imported by the app.
 * Run: npx tsx lib/skill4/run-stress-batch-03.ts
 * Uses the current pair join once per planned adjacency. Does not retry.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { IsoMesh } from "../scan/isomesh";
import { catalogIdentity } from "./adapt";
import { TILE_IDS, layoutTiles, type AssemblyArrangement, type AssemblyCount } from "./assembly-layout";
import { captureCatalogEntry, type CatalogEntry } from "./catalog";
import { generateCandidateField } from "./candidate-field";
import { detectAdjacencies, type TileConnection } from "./connections";
import type { FaceId } from "./contract";
import { generateHybridField } from "./generated-hybrid-field";
import { placeTileMesh } from "./boolean-execution";
import { physicalOperand } from "./geometry-preflight";
import { HYBRID_GENERATOR_SETTINGS } from "./hybrid-generator";
import { joinThreeBodies, type ThreeBodyJoin } from "./local-merge";
import { loadSkill3HandoffRecords } from "./skill3-handoff";
import type { Mat3 } from "./tile-basis";
import { rotateByBasis, tileBasis } from "./tile-basis";
import { loadModuleMap, tileStep, type TileInstance } from "./tiles";

const BATCH = "SKILL04-STRESS-TEST-03";
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
type Pose = Pick<TileInstance, "transform" | "rotation" | "rotationQuarter" | "mirror">;
type Ready = Extract<ReturnType<typeof loadModuleMap> extends Map<string, infer V> ? V : never, { status: "ready" }>;

const IDENTITY: Pose = { transform: { x: 0, y: 0, z: 0 }, rotationQuarter: 0, mirror: null };
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

type Link = {
  id: string;
  tiles: [string, string];
  faces: string;
  hybrid: string;
  generated: "yes" | "no";
  manifold: "yes" | "no";
  parentMergeA: "PASS" | "FAIL";
  mergeHybridA: "PASS" | "FAIL";
  hybridMergeB: "PASS" | "FAIL";
  mergeParentB: "PASS" | "FAIL";
  coreIntact: "yes" | "no";
  componentCount: number | null;
  pass: boolean;
  categories: string[];
  reason: string;
  poseB?: Pose | null;
  display?: IsoMesh | null;
};

async function main() {
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
    const id = `S04 TEST3 ${String(plan.index + 1).padStart(3, "0")}`;
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
    console.log(`[stress3] ${id} ${plan.kind} ${plan.shape} ${detected.length} links`);
    try {
      const result = await runOne(id, plan, tiles, detected, faces, hybrids, modules, loaded);
      rows.push(result.row);
      if (result.entry) entries.push(result.entry);
      console.log(`[stress3] ${id} ${result.row.pass ? "PASS" : "FAIL"} ${result.row.categories.join(", ")} components=${result.row.componentCount}`);
    } catch (error) {
      const reason = error instanceof Error ? error.message : "threw";
      rows.push(failed(id, plan, tiles, reason));
      console.log(`[stress3] ${id} threw ${reason}`);
    }
  }
  const summary = summarize(rows);
  const directory = join(process.cwd(), "data", "experiments", "skill4-stress");
  mkdirSync(directory, { recursive: true });
  writeFileSync(join(directory, `${BATCH}-report.json`), JSON.stringify({ batch: BATCH, batchId: "TEST_3", seed: BATCH, elapsedMs: Date.now() - started, summary, rows }, null, 2));
  writeFileSync(join(directory, `${BATCH}-catalog.json`), JSON.stringify(entries));
  console.log(`[stress3] done ${JSON.stringify(summary)}`);
}

async function runOne(
  id: string,
  plan: Plan,
  tiles: TileInstance[],
  detected: ReturnType<typeof detectAdjacencies>,
  faces: [FaceId, FaceId][],
  hybrids: string[],
  modules: Map<string, Ready>,
  loaded: ReturnType<typeof loadModuleMap>,
) {
  const links: Link[] = [];
  const poses = new Map<string, Pose>();
  if (tiles[0]) poses.set(tiles[0].instanceId, IDENTITY);
  const connections: TileConnection[] = [];
  for (let index = 0; index < detected.length; index += 1) {
    const edge = detected[index];
    const faceA = faces[index][0];
    const faceB = faces[index][1];
    const hybridId = hybrids[index];
    const moduleA = modules.get(tiles.find((tile) => tile.instanceId === edge.tileAId)?.archetypeId ?? "");
    const moduleB = modules.get(tiles.find((tile) => tile.instanceId === edge.tileBId)?.archetypeId ?? "");
    const link = await joinEdge(edge.id, edge.tileAId, edge.tileBId, moduleA, moduleB, faceA, faceB, hybridId);
    links.push(link);
    connections.push(connectionRecord(edge.id, edge.tileAId, edge.tileBId, faceA, faceB, hybridId, link));
  }
  for (let pass = 0; pass < detected.length; pass += 1) {
    detected.forEach((edge, index) => {
      const poseB = links[index]?.poseB;
      if (!poseB || !poses.has(edge.tileAId) || poses.has(edge.tileBId)) return;
      poses.set(edge.tileBId, compose(poses.get(edge.tileAId) ?? IDENTITY, poseB));
    });
  }
  connections.forEach((connection, index) => {
    const display = links[index]?.display;
    const field = connection.generatedHybridField;
    if (!display || !field) return;
    const world = placeTileMesh(display, poses.get(connection.tileAId) ?? IDENTITY) ?? display;
    connection.generatedHybridField = {
      ...field,
      candidates: field.candidates.map((candidate) => candidate.candidateId === connection.selectedMockId ? { ...candidate, geometry: world } : candidate),
    };
  });
  const placed = tiles.map((tile) => {
    const pose = poses.get(tile.instanceId);
    return pose ? { ...tile, ...pose, moduleId: tile.moduleId } : tile;
  });
  const reached = reachedTiles(tiles.map((tile) => tile.instanceId), links);
  const floating = tiles.filter((tile) => !reached.has(tile.instanceId)).length + links.filter((link) => !link.pass).length;
  const categories = [...new Set(links.flatMap((link) => link.categories))];
  if (detected.length === 0) categories.push("OTHER");
  if (floating > 0 && !categories.includes("FLOATING GEOMETRY")) categories.push("FLOATING GEOMETRY");
  const pass = detected.length > 0 && links.every((link) => link.pass) && tiles.every((tile) => reached.has(tile.instanceId));
  const componentCount = links.length === 1 ? links[0].componentCount : (pass ? 1 : links.reduce((max, link) => Math.max(max, link.componentCount ?? 0), 0));
  const captured = captureCatalogEntry(id, placed, connections, plan.count, plan.arrangement, loaded, false);
  const entry: CatalogEntry = {
    ...captured,
    batchId: "TEST_3",
    batch: {
      seed: BATCH,
      status: pass ? "success" : "failed",
      terminalA: links.length > 0 && links.every((link) => link.parentMergeA === "PASS") ? "PASS" : "FAIL",
      terminalB: links.length > 0 && links.every((link) => link.mergeParentB === "PASS") ? "PASS" : "FAIL",
      connected: pass ? "PASS" : "FAIL",
      floating,
      coreIntact: links.length > 0 && links.every((link) => link.coreIntact === "yes") ? "YES" : "NO",
      boolean: links.some((link) => link.categories.includes("BOOLEAN MULTI-COMPONENT FAILURE")) ? "MULTI-COMPONENT" : (pass ? "READY" : "FAILED"),
      physical: pass ? "READY" : "NOT READY",
      manifold: links.length > 0 && links.every((link) => link.manifold === "yes") ? "YES" : "NO",
      componentCount,
    },
    connections: captured.connections.map((connection) => ({ ...connection, candidateField: null })),
  };
  return {
    entry,
    row: {
      id,
      kind: plan.kind,
      tileCount: tiles.length,
      arrangement: `${plan.arrangement}/${plan.shape}`,
      geometries: placed.map((tile) => modules.get(tile.archetypeId)?.identity.name ?? tile.archetypeId),
      typologies: placed.map((tile) => modules.get(tile.archetypeId)?.identity.typologyLabel ?? ""),
      faces: links.map((link) => link.faces),
      hybrids: links.map((link) => link.hybrid),
      pass,
      categories,
      componentCount,
      floating,
      catalogSaved: "YES",
      links,
    },
  };
}

async function joinEdge(
  id: string,
  tileA: string,
  tileB: string,
  moduleA: Ready | undefined,
  moduleB: Ready | undefined,
  faceA: FaceId,
  faceB: FaceId,
  hybridId: string,
): Promise<Link & { poseB: Pose | null; field: TileConnection["generatedHybridField"]; display: IsoMesh | null }> {
  const blank = (reason: string, categories: string[]): Link & { poseB: Pose | null; field: null; display: null } => ({
    id,
    tiles: [tileA, tileB],
    faces: `${faceA}-${faceB}`,
    hybrid: hybridId,
    generated: "no",
    manifold: "no",
    parentMergeA: "FAIL",
    mergeHybridA: "FAIL",
    hybridMergeB: "FAIL",
    mergeParentB: "FAIL",
    coreIntact: "no",
    componentCount: null,
    pass: false,
    categories,
    reason,
    poseB: null,
    field: null,
    display: null,
  });
  if (!moduleA || !moduleB) return blank("geometry unavailable", ["OTHER"]);
  const inputs = generateCandidateField({
    signature: `${BATCH}:${id}:${moduleA.moduleId}:${faceA}:${moduleB.moduleId}:${faceB}:${hybridId}`,
    faceA,
    faceB,
    moduleA,
    moduleB,
  });
  if (!inputs.ok) return blank(inputs.reason, ["H## GENERATION FAILURE"]);
  const field = generateHybridField({
    moduleA,
    moduleB,
    faceA,
    faceB,
    candidateField: inputs.field,
    settings: HYBRID_GENERATOR_SETTINGS,
  });
  const chosen = field.candidates.find((candidate) => candidate.candidateId === hybridId);
  if (!chosen?.geometry || chosen.status !== "ready") return blank(chosen?.reason || field.status, ["H## GENERATION FAILURE"]);
  const join = await joinThreeBodies({
    parentA: await physicalOperand(moduleA),
    parentB: await physicalOperand(moduleB),
    frameA: moduleA.faces[faceA],
    frameB: moduleB.faces[faceB],
    hybrid: chosen.geometry,
  });
  const categories = classify(join);
  const display = concat([join.hybrid, join.mergeA, join.mergeB].filter((mesh): mesh is IsoMesh => !!mesh));
  const stored = {
    ...field,
    candidates: field.candidates.map((candidate) => ({
      ...candidate,
      geometry: candidate.candidateId === hybridId ? display ?? candidate.geometry : null,
      growth: undefined,
    })),
  };
  return {
    id,
    tiles: [tileA, tileB],
    faces: `${faceA}-${faceB}`,
    hybrid: hybridId,
    generated: "yes",
    manifold: join.reason.includes("NotManifold") || join.reason.includes("hybrid-kernel") ? "no" : "yes",
    parentMergeA: join.sideA.parentToMerge,
    mergeHybridA: join.sideA.mergeToHybrid,
    hybridMergeB: join.sideB.mergeToHybrid,
    mergeParentB: join.sideB.parentToMerge,
    coreIntact: join.coreIntact ? "yes" : "no",
    componentCount: join.componentCount,
    pass: join.pass,
    categories,
    reason: join.reason,
    poseB: join.parentBPose,
    field: stored,
    display,
  };
}

function classify(join: ThreeBodyJoin) {
  const categories: string[] = [];
  if (join.reason.includes("NotManifold") || join.reason.includes("hybrid-kernel") || join.reason === "hybrid-not-solid") categories.push("H## NON-MANIFOLD");
  if (!join.coreIntact && !categories.includes("H## NON-MANIFOLD")) categories.push("HYBRID CORE MODIFIED");
  if (join.sideA.parentToMerge === "FAIL") categories.push("FACE A OVERLAP FAILURE");
  if (join.sideB.parentToMerge === "FAIL") categories.push("FACE B OVERLAP FAILURE");
  if (join.sideA.mergeToHybrid === "FAIL" || join.sideB.mergeToHybrid === "FAIL") categories.push("MERGE ↔ H## FAILURE");
  const overlaps = join.sideA.parentToMerge === "PASS" && join.sideA.mergeToHybrid === "PASS" && join.sideB.parentToMerge === "PASS" && join.sideB.mergeToHybrid === "PASS";
  if (overlaps && (join.componentCount ?? 0) > 1) categories.push("BOOLEAN MULTI-COMPONENT FAILURE");
  else if (join.boolean === "FAILED") categories.push("BOOLEAN FAILURE");
  if (!join.pass && categories.length === 0) categories.push("OTHER");
  return categories;
}

function connectionRecord(id: string, tileA: string, tileB: string, faceA: FaceId, faceB: FaceId, hybridId: string, link: Awaited<ReturnType<typeof joinEdge>>): TileConnection {
  const signature = link.field?.connectionSignature ?? `${BATCH}:${id}`;
  return {
    id,
    tileAId: tileA,
    tileBId: tileB,
    faceA,
    faceB,
    origin: "detected",
    generationStatus: link.generated === "yes" ? "ready" : "blocked",
    faceSelection: "user",
    inputsChanged: false,
    signature,
    candidateField: null,
    generatedHybridField: link.field,
    selectedMockId: hybridId,
  };
}

function reachedTiles(ids: string[], links: Link[]) {
  const parent = new Map(ids.map((id) => [id, id]));
  const find = (id: string): string => {
    const current = parent.get(id) ?? id;
    if (current === id) return id;
    const root = find(current);
    parent.set(id, root);
    return root;
  };
  for (const link of links) {
    if (!link.pass) continue;
    const a = find(link.tiles[0]);
    const b = find(link.tiles[1]);
    if (a !== b) parent.set(a, b);
  }
  const groups = new Map<string, number>();
  for (const id of ids) {
    const root = find(id);
    groups.set(root, (groups.get(root) ?? 0) + 1);
  }
  let largest = "";
  let size = 0;
  for (const [root, count] of groups) {
    if (count > size) {
      largest = root;
      size = count;
    }
  }
  return new Set(ids.filter((id) => find(id) === largest));
}

function compose(parent: Pose, local: Pose): Pose {
  const parentBasis = tileBasis(parent);
  const localBasis = tileBasis(local);
  const columns = [0, 1, 2].map((column) => rotateByBasis(parentBasis, {
    x: localBasis[column * 3],
    y: localBasis[column * 3 + 1],
    z: localBasis[column * 3 + 2],
  }));
  const rotation: Mat3 = [
    columns[0].x, columns[0].y, columns[0].z,
    columns[1].x, columns[1].y, columns[1].z,
    columns[2].x, columns[2].y, columns[2].z,
  ];
  const moved = rotateByBasis(parentBasis, local.transform);
  return {
    transform: { x: moved.x + parent.transform.x, y: moved.y + parent.transform.y, z: moved.z + parent.transform.z },
    rotation,
    rotationQuarter: 0,
    mirror: null,
  };
}

function concat(meshes: IsoMesh[]): IsoMesh | null {
  if (meshes.length === 0) return null;
  const positions: number[] = [];
  const indices: number[] = [];
  let vertex = 0;
  for (const mesh of meshes) {
    positions.push(...mesh.positions);
    for (const index of mesh.indices) indices.push(index + vertex);
    vertex += mesh.positions.length / 3;
  }
  const positionBuffer = Float32Array.from(positions);
  const indexBuffer = Uint32Array.from(indices);
  return { positions: positionBuffer, normals: new Float32Array(positionBuffer.length), indices: indexBuffer, triangles: indexBuffer.length / 3 };
}

function buildTiles(plan: Plan, seed: { value: number }, byType: Map<string, string[]>, all: string[]) {
  const base = plan.shape === "layout" ? layoutTiles(plan.count, plan.arrangement) : placeShape(plan);
  const [leftType, rightType] = plan.mix;
  return base.map((tile, index) => {
    const pool = byType.get(index % 2 === 0 ? leftType : rightType) ?? all;
    const archetypeId = pick(seed, pool);
    return {
      ...tile,
      archetypeId,
      moduleId: "",
      rotationQuarter: 0 as const,
      mirror: null,
      nameHint: catalogIdentity(archetypeId)?.name ?? archetypeId,
    };
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

function failed(id: string, plan: Plan, tiles: TileInstance[], reason: string) {
  return {
    id,
    kind: plan.kind,
    tileCount: tiles.length,
    arrangement: `${plan.arrangement}/${plan.shape}`,
    geometries: tiles.map((tile) => tile.archetypeId),
    typologies: [],
    faces: [],
    hybrids: [],
    pass: false,
    categories: ["OTHER"],
    componentCount: null,
    floating: tiles.length,
    catalogSaved: "NO",
    links: [] as Link[],
    reason,
  };
}

function summarize(rows: { pass: boolean; kind: string; categories: string[]; catalogSaved: string; floating: number }[]) {
  const count = (name: string) => rows.filter((row) => row.categories.includes(name)).length;
  const byKind = (kind: string) => {
    const group = rows.filter((row) => row.kind === kind);
    return { pass: group.filter((row) => row.pass).length, fail: group.filter((row) => !row.pass).length };
  };
  return {
    total: rows.length,
    fullPhysicalPass: rows.filter((row) => row.pass).length,
    failed: rows.filter((row) => !row.pass).length,
    catalogSaved: rows.filter((row) => row.catalogSaved === "YES").length,
    floatingAssemblies: rows.filter((row) => row.floating > 0).length,
    generationFailure: count("H## GENERATION FAILURE"),
    nonManifold: count("H## NON-MANIFOLD"),
    faceAOverlap: count("FACE A OVERLAP FAILURE"),
    faceBOverlap: count("FACE B OVERLAP FAILURE"),
    mergeHybrid: count("MERGE ↔ H## FAILURE"),
    booleanMultiComponent: count("BOOLEAN MULTI-COMPONENT FAILURE"),
    booleanFailure: count("BOOLEAN FAILURE"),
    floatingGeometry: count("FLOATING GEOMETRY"),
    coreModified: count("HYBRID CORE MODIFIED"),
    other: count("OTHER"),
    byTiles: { "2": byKind("2"), "4": byKind("4"), "6": byKind("6"), "8": byKind("8"), custom: byKind("custom") },
  };
}

main();
