import { columnHeight } from "../scan/isomesh";
import type { IsoMesh } from "../scan/isomesh";
import { evaluateAggregation } from "./aggregation";
import { resolveAssemblyHybrid } from "./assembly-hybrid";
import { buildBooleanPlan } from "./boolean-plan";
import { executeBooleanAssembly } from "./boolean-execution";
import { generateCandidateField } from "./candidate-field";
import { registrationEnvelope, VIEW_SCAN, type Skill4ModuleRecord } from "./contract";
import {
  generateConnectionHybridField,
  reconcileConnections,
  type TileConnection,
} from "./connections";
import { loadProvisionalMock } from "./fixtures";
import { GENERATED_HYBRID_FIELD_SETTINGS, type GeneratedHybridField } from "./generated-hybrid-field";
import { evaluateDesignHandoff, evaluatePhysicalHandoff, PHYSICAL_HANDOFF_REQUIREMENT } from "./handoff-contract";
import { buildInterlocks } from "./interlock";
import { adaptModule, type ModuleHandoff } from "./adapt";
import { envelopeWidth, initialTiles, loadModuleMap, type TileInstance } from "./tiles";

const assert = (condition: boolean, message: string) => {
  if (!condition) throw new Error(message);
};

function box(min: [number, number, number], max: [number, number, number]): IsoMesh {
  const [x0, y0, z0] = min;
  const [x1, y1, z1] = max;
  const positions = [
    x0, y0, z0, x1, y0, z0, x1, y1, z0, x0, y1, z0,
    x0, y0, z1, x1, y0, z1, x1, y1, z1, x0, y1, z1,
  ];
  const quads = [[0, 3, 2, 1], [4, 5, 6, 7], [0, 1, 5, 4], [3, 7, 6, 2], [0, 4, 7, 3], [1, 2, 6, 5]];
  const indices = quads.flatMap(([a, b, c, d]) => [a, b, c, a, c, d]);
  return {
    positions: Float32Array.from(positions),
    normals: new Float32Array(positions.length),
    indices: Uint32Array.from(indices),
    triangles: indices.length / 3,
  };
}

function closedModule(archetypeId: string): Skill4ModuleRecord {
  const registration = registrationEnvelope(VIEW_SCAN.spacing, VIEW_SCAN.yaw);
  const mesh = box(
    [registration.min.x, registration.min.y, registration.min.z],
    [registration.max.x, registration.max.y, registration.max.z],
  );
  return {
    contract: "skill4-module-v1",
    moduleId: `synthetic-closed:${archetypeId}@1`,
    revision: 1,
    archetypeId,
    source: "skill03",
    provisional: false,
    selectedFinal: true,
    scan: { ...VIEW_SCAN, slices: 24, stepsBetweenSlices: 22, stoppedOnConverged: false },
    registration,
    geometry: mesh,
    provenance: { role: "skill03-output", note: "Synthetic closed solid for the Skill 04 physical check." },
  };
}

function same(left: ArrayLike<number>, right: ArrayLike<number>) {
  if (left.length !== right.length) return false;
  for (let index = 0; index < left.length; index += 1) if (left[index] !== right[index]) return false;
  return true;
}

async function prepare(connection: TileConnection, tiles: readonly TileInstance[], loaded: ReadonlyMap<string, ModuleHandoff>, selectedId: string) {
  const tileA = tiles.find((tile) => tile.instanceId === connection.tileAId);
  const tileB = tiles.find((tile) => tile.instanceId === connection.tileBId);
  if (!tileA || !tileB) throw new Error("connection tiles are missing");
  const inputs = generateCandidateField({
    signature: connection.signature,
    faceA: connection.faceA,
    faceB: connection.faceB,
    moduleA: loaded.get(tileA.archetypeId)!,
    moduleB: loaded.get(tileB.archetypeId)!,
  });
  assert(inputs.ok, "candidate inputs");
  if (!inputs.ok) throw new Error("unreachable");
  assert(inputs.field.candidates.map((item) => item.id).join(",") === Array.from({ length: 25 }, (_, index) => `H${String(index + 1).padStart(2, "0")}`).join(","), "candidates stay H01 through H25");
  const generated = generateConnectionHybridField({ ...connection, candidateField: inputs.field, selectedMockId: selectedId }, tiles, loaded);
  assert(generated.ok && generated.reused === false, "the hybrid field is generated for this connection");
  if (!generated.ok) throw new Error("unreachable");
  return generated.connection;
}

function failedField(signature: string, status: "blocked" | "empty" | "invalid"): GeneratedHybridField {
  const candidates = Array.from({ length: 25 }, (_, index) => ({
    candidateId: `H${String(index + 1).padStart(2, "0")}`,
    candidate: { id: `H${String(index + 1).padStart(2, "0")}` } as GeneratedHybridField["candidates"][number]["candidate"],
    status,
    geometry: null,
    vertexCount: 0,
    triangleCount: 0,
    reason: status,
  }));
  return {
    version: GENERATED_HYBRID_FIELD_SETTINGS.version,
    status,
    connectionSignature: signature,
    candidates,
    readyCount: 0,
    blockedCount: status === "blocked" ? 25 : 0,
    emptyCount: status === "empty" ? 25 : 0,
    invalidCount: status === "invalid" ? 25 : 0,
  };
}

async function main() {
  const records = [closedModule("topographic-ground-field"), closedModule("linear-gallery")];
  const loaded = loadModuleMap(records);
  const moduleA = loaded.get("topographic-ground-field");
  const moduleB = loaded.get("linear-gallery");
  if (!moduleA || !moduleB || moduleA.status !== "ready" || moduleB.status !== "ready") throw new Error("synthetic modules did not adapt");
  assert(evaluateDesignHandoff(moduleA).accepted && evaluateDesignHandoff(moduleB).accepted, "closed synthetic tiles pass the design handoff");
  const physicalA = await evaluatePhysicalHandoff(moduleA);
  const physicalB = await evaluatePhysicalHandoff(moduleB);
  assert(physicalA.accepted && physicalB.accepted && physicalA.readiness?.kernelStatus === "NoError", "closed synthetic tiles pass the physical handoff");
  assert(PHYSICAL_HANDOFF_REQUIREMENT.closed && PHYSICAL_HANDOFF_REQUIREMENT.components === 1 && PHYSICAL_HANDOFF_REQUIREMENT.kernel === "manifold-3d accepts the mesh", "physical handoff states the manifold requirement");

  const tiles = initialTiles(loaded);
  const detected = reconcileConnections([], tiles, loaded);
  const east = detected.find((item) => item.tileAId === "A" && item.tileBId === "B");
  if (!east || east.faceA !== "E" || east.faceB !== "W") throw new Error("A and B do not meet on E-W");
  const beforeA = Float32Array.from(moduleA.geometry.positions);
  const beforeB = Float32Array.from(moduleB.geometry.positions);
  const connected = await prepare(east, tiles, loaded, "H05");
  const northTiles = [
    tiles[0],
    { ...tiles[1], instanceId: "C", transform: { x: 0, y: 0, z: -(envelopeWidth()) } },
  ];
  const northDetected = reconcileConnections([], northTiles, loaded).find((item) => item.tileAId === "A" && item.tileBId === "C");
  if (!northDetected) throw new Error("the second pair was not detected");
  const north = await prepare(northDetected, northTiles, loaded, "H17");
  assert(connected.selectedMockId === "H05" && north.selectedMockId === "H17", "each connection keeps its own selected hybrid");
  assert(connected.generatedHybridField?.candidates[4]?.geometry !== north.generatedHybridField?.candidates[16]?.geometry, "connection fields do not share a selected mesh");
  const selected = connected.generatedHybridField?.candidates.find((item) => item.candidateId === "H05");
  if (!selected?.geometry) throw new Error("H05 did not generate");
  const beforeConnector = Float32Array.from(selected.geometry.positions);

  const aggregation = evaluateAggregation([connected], tiles, loaded);
  assert(aggregation.status === "ready" && aggregation.connections[0]?.status === "ready", "aggregation accepts the placed synthetic hybrid");
  const interlocks = buildInterlocks(aggregation, tiles);
  assert(interlocks.status === "ready" && interlocks.connections[0]?.insertionA != null && interlocks.connections[0].insertionB != null, "interlock builds both insertion volumes");
  const plan = buildBooleanPlan(interlocks);
  assert(plan.status === "ready" && plan.connections[0]?.connectorGeometry !== null && plan.connections[0].connectorGeometry !== selected.geometry, "the boolean plan records the placed connector, not the stored loft");
  const beforeInsertion = Float32Array.from(plan.connections[0].connectorOperation!.insertionA.positions);
  const beforePlaced = Float32Array.from(plan.connections[0].connectorGeometry!.positions);
  const execution = await executeBooleanAssembly(plan, tiles, loaded);
  assert(execution.status === "ready" && execution.assembly.kernelStatus === "NoError", "boolean execution joins the synthetic assembly");
  assert(execution.connections[0]?.connectorConditionStatus === "closed" && execution.connections[0].connectorSourceOpen === true, "execution closes a derived connector");
  assert(execution.tiles.every((tile) => tile.readiness?.booleanReady && tile.derivedGeometry && tile.derivedGeometry.positions !== moduleA.geometry.positions), "tile booleans use derived copies");
  assert(execution.connections[0]?.derivedConnector !== selected.geometry, "the closed connector is not the stored loft");
  assert(same(moduleA.geometry.positions, beforeA) && same(moduleB.geometry.positions, beforeB), "source module meshes stay unchanged");
  assert(same(selected.geometry.positions, beforeConnector) && same(plan.connections[0].connectorGeometry!.positions, beforePlaced) && same(plan.connections[0].connectorOperation!.insertionA.positions, beforeInsertion), "stored connector, placed connector, and insertion buffers stay unchanged");

  const turned = tiles.map((tile) => tile.instanceId === "A"
    ? { ...tile, rotationQuarter: 1 as const }
    : { ...tile, mirror: "x" as const });
  const turnedHybrid = resolveAssemblyHybrid(connected, turned, loaded);
  assert(turnedHybrid.source === "real" && turnedHybrid.geometry !== null && turnedHybrid.geometry.positions !== selected.geometry.positions, "rotated and mirrored placement writes a new mesh");
  const height = columnHeight(VIEW_SCAN.spacing, VIEW_SCAN.yaw);
  const stacked = [tiles[0], { ...tiles[1], transform: { x: 0, y: height, z: 0 } }];
  const vertical = reconcileConnections([], stacked, loaded)[0];
  if (!vertical || (vertical.faceA !== "T" && vertical.faceA !== "B")) throw new Error("stacked tiles do not meet on a vertical face");
  const verticalConnection = await prepare(vertical, stacked, loaded, "H13");
  const verticalHybrid = resolveAssemblyHybrid(verticalConnection, stacked, loaded);
  assert(verticalHybrid.source === "real" && verticalHybrid.geometry !== null, "vertical placement uses the generated hybrid");

  const unresolved = { ...connected, faceA: "N" as const };
  const unresolvedAggregation = evaluateAggregation([unresolved], tiles, loaded);
  assert(unresolvedAggregation.connections[0]?.status === "unresolved", "a face that does not meet stays unresolved");
  for (const status of ["empty", "blocked", "invalid"] as const) {
    const failed = { ...east, generatedHybridField: failedField(east.signature, status), generationStatus: status, candidateField: connected.candidateField };
    const failedAggregation = evaluateAggregation([failed], tiles, loaded);
    const failedInterlock = buildInterlocks(failedAggregation, tiles);
    const failedPlan = buildBooleanPlan(failedInterlock);
    const failedExecution = await executeBooleanAssembly(failedPlan, tiles, loaded);
    assert(failedAggregation.status !== "ready" && failedAggregation.connections[0]?.status === status, `${status} does not become an aggregation success`);
    assert(failedInterlock.status !== "ready" && failedPlan.status !== "ready" && failedExecution.status !== "ready", `${status} does not become a physical join`);
  }
  const notGenerated = evaluateAggregation([east], tiles, loaded);
  const notGeneratedExecution = await executeBooleanAssembly(buildBooleanPlan(buildInterlocks(notGenerated, tiles)), tiles, loaded);
  assert(notGenerated.connections[0]?.status === "not-generated" && notGeneratedExecution.status !== "ready", "a missing field does not become a physical join");
  const partialCandidates = failedField(east.signature, "invalid").candidates.map((candidate, index) => index === 0 ? { ...candidate, status: "ready" as const } : candidate);
  const partial = {
    ...east,
    selectedMockId: "H13",
    candidateField: connected.candidateField,
    generatedHybridField: { ...failedField(east.signature, "invalid"), status: "partial" as const, candidates: partialCandidates, readyCount: 1, invalidCount: 24 },
    generationStatus: "partial" as const,
  };
  const partialAggregation = evaluateAggregation([partial], tiles, loaded);
  const partialExecution = await executeBooleanAssembly(buildBooleanPlan(buildInterlocks(partialAggregation, tiles)), tiles, loaded);
  assert(partialAggregation.connections[0]?.status === "invalid" && partialExecution.status !== "ready", "a partial field does not promote an invalid selection");

  const ground = loadProvisionalMock("topographic-ground-field");
  const gallery = loadProvisionalMock("linear-gallery");
  if (ground.status !== "ready" || gallery.status !== "ready") throw new Error("provisional fixtures are not available");
  const groundPositions = Float32Array.from(ground.geometry.positions);
  const galleryPositions = Float32Array.from(gallery.geometry.positions);
  assert(evaluateDesignHandoff(ground).accepted && evaluateDesignHandoff(gallery).accepted, "provisional fixtures remain available for design");
  const groundPhysical = await evaluatePhysicalHandoff(ground);
  const galleryPhysical = await evaluatePhysicalHandoff(gallery);
  assert(groundPhysical.designAccepted && groundPhysical.accepted === false && groundPhysical.readiness?.status === "open" && groundPhysical.readiness.boundaryEdgeCount === 10 && groundPhysical.readiness.componentCount === 4, "Topographic Ground Field stays open with 10 boundary edges and 4 components");
  assert(galleryPhysical.accepted === false && galleryPhysical.readiness?.status === "non-manifold" && galleryPhysical.readiness.kernelStatus === "NotManifold", "Linear Gallery stays rejected by the manifold kernel");
  const provisionalLoaded = new Map<string, ModuleHandoff>([["topographic-ground-field", ground], ["linear-gallery", gallery]]);
  const provisionalTiles = initialTiles(provisionalLoaded);
  const provisionalEast = reconcileConnections([], provisionalTiles, provisionalLoaded).find((item) => item.tileAId === "A" && item.tileBId === "B");
  if (!provisionalEast) throw new Error("provisional tiles do not connect");
  const provisionalInputs = generateCandidateField({
    signature: provisionalEast.signature,
    faceA: provisionalEast.faceA,
    faceB: provisionalEast.faceB,
    moduleA: ground,
    moduleB: gallery,
  });
  assert(provisionalInputs.ok && provisionalInputs.field.candidates.length === 25, "provisional fixtures still produce candidate inputs");
  if (!provisionalInputs.ok) throw new Error("unreachable");
  const provisionalGenerated = generateConnectionHybridField({ ...provisionalEast, candidateField: provisionalInputs.field }, provisionalTiles, provisionalLoaded);
  assert(provisionalGenerated.ok, "provisional hybrid generation returns an explicit result");
  if (!provisionalGenerated.ok) throw new Error("unreachable");
  const provisionalAggregation = evaluateAggregation([provisionalGenerated.connection], provisionalTiles, provisionalLoaded);
  const provisionalPlan = buildBooleanPlan(buildInterlocks(provisionalAggregation, provisionalTiles));
  const provisionalExecution = await executeBooleanAssembly(provisionalPlan, provisionalTiles, provisionalLoaded);
  assert(provisionalExecution.status !== "ready", "provisional fixtures do not become a physical join");
  assert(same(ground.geometry.positions, groundPositions) && same(gallery.geometry.positions, galleryPositions), "provisional fixture meshes stay unchanged");

  console.log(`skill4 final ok · synthetic ${execution.status} · fixtures ${provisionalGenerated.connection.generationStatus} · execution ${provisionalExecution.status} · ground ${groundPhysical.readiness?.status} ${groundPhysical.readiness?.boundaryEdgeCount}/${groundPhysical.readiness?.componentCount} · gallery ${galleryPhysical.readiness?.kernelStatus}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
