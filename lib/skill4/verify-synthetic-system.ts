import { columnHeight } from "../scan/isomesh";
import { evaluateAggregation } from "./aggregation";
import { layoutTiles, worldFace } from "./assembly-layout";
import { placedFaceFrame, resolveAssemblyHybrid, sectionCenter } from "./assembly-hybrid";
import { connectorFrame } from "./hybrid-deformation";
import { buildBooleanPlan } from "./boolean-plan";
import { executeBooleanAssembly } from "./boolean-execution";
import { generateCandidateField } from "./candidate-field";
import { FACE_IDS, VIEW_SCAN, type FaceId } from "./contract";
import {
  connectionInputSignature,
  detectAdjacencies,
  generateConnectionHybridField,
  reconcileConnections,
  syncConnectionInputs,
  type TileConnection,
} from "./connections";
import { extractFaceProfile } from "./face-profile";
import { HYBRID_GENERATOR_SETTINGS } from "./hybrid-generator";
import { evaluatePhysicalHandoff } from "./handoff-contract";
import { buildInterlocks } from "./interlock";
import { captureCatalogEntry } from "./catalog";
import { loadSyntheticTestRecords, SYNTHETIC_MODULE_A, SYNTHETIC_MODULE_B, SYNTHETIC_TEST_LABEL } from "./synthetic-modules";
import { envelopeWidth, loadModuleMap, type TileInstance } from "./tiles";
import type { ModuleHandoff, ReadyModule } from "./adapt";

const failures: string[] = [];
const notes: string[] = [];

function check(condition: boolean, message: string) {
  if (!condition) failures.push(message);
}

function loftAxisDot(
  connection: TileConnection,
  tiles: readonly TileInstance[],
  loaded: ReadonlyMap<string, ModuleHandoff>,
  mesh: { positions: Float32Array } | null,
) {
  if (!mesh) return "";
  const steps = HYBRID_GENERATOR_SETTINGS.loftSteps;
  const count = mesh.positions.length / 3;
  if (count % steps !== 0) return " loft-size";
  const sampleCount = count / steps;
  const centroid = (ring: number) => {
    let x = 0;
    let y = 0;
    let z = 0;
    for (let sample = 0; sample < sampleCount; sample += 1) {
      const offset = (ring * sampleCount + sample) * 3;
      x += mesh.positions[offset];
      y += mesh.positions[offset + 1];
      z += mesh.positions[offset + 2];
    }
    return { x: x / sampleCount, y: y / sampleCount, z: z / sampleCount };
  };
  const tileA = tiles.find((item) => item.instanceId === connection.tileAId);
  const tileB = tiles.find((item) => item.instanceId === connection.tileBId);
  const moduleA = tileA ? loaded.get(tileA.archetypeId) : undefined;
  const moduleB = tileB ? loaded.get(tileB.archetypeId) : undefined;
  if (!tileA || !tileB || moduleA?.status !== "ready" || moduleB?.status !== "ready") return "";
  const source = connectorFrame(centroid(0), centroid(steps - 1));
  const face = connectorFrame(
    sectionCenter(moduleA.faces[connection.faceA], HYBRID_GENERATOR_SETTINGS.sectionDepth),
    sectionCenter(moduleB.faces[connection.faceB], HYBRID_GENERATOR_SETTINGS.sectionDepth),
  );
  if (!source || !face) return " no-axis";
  const dot = source.direction.x * face.direction.x + source.direction.y * face.direction.y + source.direction.z * face.direction.z;
  return ` axis-dot ${dot.toFixed(4)}`;
}

function tile(id: string, archetypeId: string, x: number, z: number, moduleId: string, y = 0): TileInstance {
  return {
    instanceId: id,
    archetypeId,
    moduleId,
    transform: { x, y, z },
    rotationQuarter: 0,
    mirror: null,
  };
}

async function runArrangement(
  label: string,
  tiles: TileInstance[],
  loaded: ReadonlyMap<string, ModuleHandoff>,
  expectedFaces: string[],
) {
  const detected = detectAdjacencies(tiles);
  const facePairs = detected.map((item) => `${item.tileAId}:${item.faceA}-${item.tileBId}:${item.faceB}`).sort();
  check(facePairs.join(" | ") === [...expectedFaces].sort().join(" | "), `${label} adjacency ${facePairs.join(" | ")} expected ${expectedFaces.join(" | ")}`);
  let connections = reconcileConnections([], tiles, loaded);
  for (const connection of connections) {
    const before = connection.faceA;
    const nextFace = FACE_IDS.find((face) => face !== before) ?? "N";
    const changed = syncConnectionInputs(
      { ...connection, faceA: nextFace, faceSelection: "user" },
      connectionInputSignature({ ...connection, faceA: nextFace }, tiles, loaded),
    );
    check(changed.faceA === nextFace && changed.faceSelection === "user" && changed.signature !== connection.signature, `${label} ${connection.id} face button did not change ${before}`);
    const still = detectAdjacencies(tiles).find((item) => item.id === connection.id);
    check(still?.faceA === connection.faceA && still.faceB === connection.faceB, `${label} ${connection.id} adjacency changed when only the selected face changed`);
    const moduleA = loaded.get(tiles.find((item) => item.instanceId === connection.tileAId)?.archetypeId ?? "");
    if (moduleA?.status === "ready") {
      const profile = extractFaceProfile(moduleA.geometry, moduleA.faces[nextFace], HYBRID_GENERATOR_SETTINGS.sectionDepth);
      check(profile.status === "ready" && profile.segments.length > 0, `${label} ${connection.id} selected face ${nextFace} profile ${profile.status}`);
    }
  }
  connections = reconcileConnections([], tiles, loaded);
  const prepared: TileConnection[] = [];
  for (const connection of connections) {
    const tileA = tiles.find((item) => item.instanceId === connection.tileAId);
    const tileB = tiles.find((item) => item.instanceId === connection.tileBId);
    const moduleA = tileA ? loaded.get(tileA.archetypeId) : undefined;
    const moduleB = tileB ? loaded.get(tileB.archetypeId) : undefined;
    if (!moduleA || !moduleB) {
      failures.push(`${label} ${connection.id} missing module`);
      continue;
    }
    const inputs = generateCandidateField({
      signature: connection.signature,
      faceA: connection.faceA,
      faceB: connection.faceB,
      moduleA,
      moduleB,
    });
    check(inputs.ok, `${label} ${connection.id} candidate field failed`);
    if (!inputs.ok) continue;
    const ids = inputs.field.candidates.map((item) => item.id).join(",");
    check(ids === Array.from({ length: 25 }, (_, index) => `H${String(index + 1).padStart(2, "0")}`).join(","), `${label} ${connection.id} candidates are not H01–H25`);
    const generated = generateConnectionHybridField({ ...connection, candidateField: inputs.field, selectedMockId: "H05" }, tiles, loaded);
    check(generated.ok, `${label} ${connection.id} hybrid generation failed${generated.ok ? "" : `: ${generated.reason}`}`);
    if (!generated.ok) continue;
    const field = generated.connection.generatedHybridField;
    const selected = field?.candidates.find((item) => item.candidateId === "H05");
    check(field?.status === "ready" && selected?.status === "ready" && (selected.geometry?.triangles ?? 0) > 0, `${label} ${connection.id} selected hybrid ${field?.status}/${selected?.status}`);
    const placed = resolveAssemblyHybrid(generated.connection, tiles, loaded);
    const axis = loftAxisDot(generated.connection, tiles, loaded, selected?.geometry ?? null);
    check(placed.source === "real" && placed.geometry !== null, `${label} ${connection.id} placement ${placed.source}/${placed.status}${axis}`);
    prepared.push(generated.connection);
  }
  if (prepared.length !== connections.length) {
    notes.push(`${label} stopped before boolean: ${prepared.length}/${connections.length} connections generated`);
    return;
  }
  const aggregation = evaluateAggregation(prepared, tiles, loaded);
  check(aggregation.status === "ready", `${label} aggregation ${aggregation.status} ${aggregation.connections.map((item) => `${item.connectionId}:${item.status} err ${item.attachmentErrorA?.toFixed(4) ?? "-"}/${item.attachmentErrorB?.toFixed(4) ?? "-"}`).join(" ")}`);
  const interlocks = buildInterlocks(aggregation, tiles);
  check(interlocks.status === "ready" && interlocks.connections.every((item) => item.insertionA && item.insertionB), `${label} interlock ${interlocks.status}`);
  const plan = buildBooleanPlan(interlocks);
  check(plan.status === "ready", `${label} boolean plan ${plan.status}`);
  const execution = await executeBooleanAssembly(plan, tiles, loaded);
  check(execution.status === "ready", `${label} boolean execution ${execution.status} ${execution.connections.map((item) => `${item.connectionId}:${item.status}:${item.reason}:${item.connectorConditionReason}:kernel ${item.kernelStatus ?? "-"}`).join(" | ")} tiles ${execution.tiles.map((item) => `${item.tileId}:${item.status}:${item.cuts.map((cut) => cut.reason).join(",")}`).join(" ")}`);
  notes.push(`${label} connections ${connections.length} boolean ${execution.status}`);
}

async function main() {
  const records = await loadSyntheticTestRecords();
  const loaded = loadModuleMap(records);
  const moduleA = loaded.get(SYNTHETIC_MODULE_A.archetypeId);
  const moduleB = loaded.get(SYNTHETIC_MODULE_B.archetypeId);
  check(moduleA?.status === "ready" && moduleA.moduleId === SYNTHETIC_MODULE_A.moduleId, "module A did not adapt");
  check(moduleB?.status === "ready" && moduleB.moduleId === SYNTHETIC_MODULE_B.moduleId, "module B did not adapt");
  check(records.every((record) => record.provenance.note.includes(SYNTHETIC_TEST_LABEL)), "synthetic records are not marked test data");
  if (moduleA?.status !== "ready" || moduleB?.status !== "ready") {
    console.log(failures.join("\n"));
    process.exit(1);
  }
  const readyA = moduleA as ReadyModule;
  const readyB = moduleB as ReadyModule;
  const physicalA = await evaluatePhysicalHandoff(readyA);
  const physicalB = await evaluatePhysicalHandoff(readyB);
  check(physicalA.accepted && physicalA.readiness?.componentCount === 1, `module A physical ${physicalA.reason}`);
  check(physicalB.accepted && physicalB.readiness?.componentCount === 1, `module B physical ${physicalB.reason}`);
  const sections: string[] = [];
  for (const [name, ready] of [["A", readyA], ["B", readyB]] as const) {
    for (const face of FACE_IDS) {
      const profile = extractFaceProfile(ready.geometry, ready.faces[face], HYBRID_GENERATOR_SETTINGS.sectionDepth);
      const bounds = profile.bounds;
      sections.push(`${name}:${face}:${profile.status}:${profile.segments.length}:${bounds ? `${bounds.minU.toFixed(3)},${bounds.maxU.toFixed(3)},${bounds.minV.toFixed(3)},${bounds.maxV.toFixed(3)}` : "none"}`);
      check(profile.status === "ready" && profile.segments.length > 0, `${name} face ${face} section ${profile.status}`);
    }
  }
  const eastA = sections.find((item) => item.startsWith("A:E"));
  const westA = sections.find((item) => item.startsWith("A:W"));
  const eastB = sections.find((item) => item.startsWith("B:E"));
  const topB = sections.find((item) => item.startsWith("B:T"));
  const bottomB = sections.find((item) => item.startsWith("B:B"));
  check(eastA !== westA, "module A east and west sections are identical");
  check(eastA !== eastB, "module A and module B east sections are identical");
  check(topB !== bottomB, "module B top and bottom sections are identical");
  notes.push(...sections);

  const width = envelopeWidth();
  const idA = readyA.moduleId;
  const idB = readyB.moduleId;
  const withIds = (tiles: TileInstance[]) => tiles.map((item) => ({
    ...item,
    moduleId: loaded.get(item.archetypeId)?.moduleId ?? item.moduleId,
  }));
  await runArrangement("linear", withIds(layoutTiles(4, "linear")), loaded, [
    "A:E-B:W",
    "B:E-C:W",
    "C:E-D:W",
  ]);
  await runArrangement("grid", withIds(layoutTiles(4, "grid")), loaded, [
    "A:E-B:W",
    "A:N-C:S",
    "B:N-D:S",
    "C:E-D:W",
  ]);
  await runArrangement("t-junction", [
    tile("A", SYNTHETIC_MODULE_A.archetypeId, 0, 0, idA),
    tile("B", SYNTHETIC_MODULE_B.archetypeId, width, 0, idB),
    tile("C", SYNTHETIC_MODULE_A.archetypeId, width * 2, 0, idA),
    tile("D", SYNTHETIC_MODULE_B.archetypeId, width, width, idB),
  ], loaded, ["A:E-B:W", "B:E-C:W", "B:N-D:S"]);
  await runArrangement("cross", [
    tile("A", SYNTHETIC_MODULE_A.archetypeId, -width, 0, idA),
    tile("B", SYNTHETIC_MODULE_B.archetypeId, 0, 0, idB),
    tile("C", SYNTHETIC_MODULE_A.archetypeId, 0, width, idA),
    tile("D", SYNTHETIC_MODULE_B.archetypeId, width, 0, idB),
    tile("E", SYNTHETIC_MODULE_A.archetypeId, 0, -width, idA),
  ], loaded, ["A:E-B:W", "B:E-D:W", "B:N-C:S", "B:S-E:N"]);

  const pair = withIds(layoutTiles(2, "linear"));
  const turned = pair.map((item) => item.instanceId === "A"
    ? { ...item, rotationQuarter: 1 as const }
    : { ...item, mirror: "x" as const });
  const unturnedFrame = placedFaceFrame(readyA.faces.E, pair[0]);
  const turnedFrame = placedFaceFrame(readyA.faces.E, turned[0]);
  const mirroredFrame = placedFaceFrame(readyB.faces.E, turned[1]);
  const plainMirror = placedFaceFrame(readyB.faces.E, pair[1]);
  check(worldFace("E", turned[0]) === "N", "a quarter turn does not move the east face");
  check(turnedFrame.normal.z !== unturnedFrame.normal.z || turnedFrame.normal.x !== unturnedFrame.normal.x, "rotation did not move the placed east frame");
  check(mirroredFrame.normal.x === -plainMirror.normal.x, "mirror X did not flip the east normal");
  await runArrangement("rotation-mirror", turned, loaded, ["A:E-B:W"]);

  const height = columnHeight(VIEW_SCAN.spacing, VIEW_SCAN.yaw);
  const stacked = [
    tile("A", SYNTHETIC_MODULE_A.archetypeId, 0, 0, idA, 0),
    tile("B", SYNTHETIC_MODULE_B.archetypeId, 0, 0, idB, height),
  ];
  await runArrangement("vertical", stacked, loaded, ["A:T-B:B"]);

  const sample = withIds(layoutTiles(2, "grid"));
  const saved = captureCatalogEntry("H01", sample, reconcileConnections([], sample, loaded), 2, "grid", loaded, true);
  check(saved.testData === true, "a synthetic save is not marked test data");
  const plain = captureCatalogEntry("H02", sample, [], 2, "grid", loaded, false);
  check(plain.testData !== true, "a provisional save was marked test data");

  console.log(notes.join("\n"));
  if (failures.length > 0) {
    console.error(failures.join("\n"));
    process.exit(1);
  }
  console.log("skill4 synthetic system ok");
}

void main();
