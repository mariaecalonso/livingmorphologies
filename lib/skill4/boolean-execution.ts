import type { IsoMesh } from "../scan/isomesh";
import type { ModuleHandoff } from "./adapt";
import {
  booleanDifference,
  booleanMeshToIsoMesh,
  booleanUnion,
  isoMeshToBooleanMesh,
  type BooleanAdapterStatus,
} from "./boolean-adapter";
import { closeConnectorLoft, diagnoseTopology, evaluateBooleanReadiness, type BooleanReadiness } from "./boolean-conditioning";
import { physicalOperand } from "./geometry-preflight";
import type { BooleanAssemblyPlan, BooleanConnectionPlan, BooleanCut, BooleanPlanStatus } from "./boolean-plan";
import { HYBRID_GENERATOR_SETTINGS } from "./hybrid-generator";
import type { ErrorStatus } from "manifold-3d/manifold";
import type { Vec3 } from "./contract";
import type { TileInstance } from "./tiles";

/**
 * Runs a BooleanAssemblyPlan on copies.
 * Source modules, stored hybrids, insertion volumes, and the plan meshes are read only.
 */
export const BOOLEAN_EXECUTION_SETTINGS = {
  version: "skill4-boolean-execution-v2",
  additionOrder: ["close-connector", "insertion-a", "insertion-b"],
  assemblyOrder: ["tiles-by-id", "connectors-by-connection-id"],
} as const;

export type ConnectorConditionStatus = "not-run" | "closed" | "failed";

export type BooleanExecutionStatus = "ready" | "partial" | "failed" | "unresolved";

export type BooleanCutExecution = {
  connectionId: string;
  sequence: number;
  tool: IsoMesh;
  inputTriangleCount: number;
  outputTriangleCount: number | null;
  adapterStatus: BooleanAdapterStatus | "not-run";
  kernelStatus: ErrorStatus | null;
  success: boolean;
  potentialCutConflict: boolean;
  warning: string | null;
  reason: string;
};

export type BooleanTileExecution = {
  tileId: string;
  status: BooleanExecutionStatus;
  sourceGeometryId: string | null;
  placedSource: IsoMesh | null;
  derivedGeometry: IsoMesh | null;
  plannedCutCount: number;
  successfulCutCount: number;
  failedCutCount: number;
  cuts: BooleanCutExecution[];
  warnings: string[];
  kernelStatus: ErrorStatus | null;
  readiness: BooleanReadiness | null;
};

export type BooleanConnectionExecution = {
  connectionId: string;
  candidateId: string | null;
  status: BooleanExecutionStatus;
  connectorGeometry: IsoMesh | null;
  connectorSourceOpen: boolean | null;
  connectorConditionStatus: ConnectorConditionStatus;
  connectorConditionReason: string;
  derivedConnector: IsoMesh | null;
  additionGeometry: IsoMesh | null;
  unionStatus: BooleanAdapterStatus | "not-run";
  kernelStatus: ErrorStatus | null;
  reason: string;
  unitedPieceCount: number;
};

export type BooleanAssemblyExecution = {
  status: BooleanExecutionStatus;
  mesh: IsoMesh | null;
  kernelStatus: ErrorStatus | null;
  reason: string;
  partCount: number;
  unitedPartCount: number;
};

export type BooleanExecutionResult = {
  status: BooleanExecutionStatus;
  tiles: BooleanTileExecution[];
  connections: BooleanConnectionExecution[];
  assembly: BooleanAssemblyExecution;
  warnings: string[];
};

export function booleanExecutionLabel(status: BooleanExecutionStatus) {
  if (status === "ready") return "READY";
  if (status === "partial") return "PARTIAL";
  if (status === "failed") return "FAILED";
  return "UNRESOLVED";
}

export function booleanExecutionKey(plan: BooleanAssemblyPlan, tiles: readonly TileInstance[]) {
  return [
    plan.status,
    plan.readyConnectionCount,
    ...plan.connections.map((item) => [
      item.connectionId,
      item.status,
      item.candidateId ?? "",
      item.tileAOperation?.volume.triangles ?? 0,
      item.tileBOperation?.volume.triangles ?? 0,
      item.connectorOperation?.connector.triangles ?? 0,
    ].join(":")),
    ...tiles.map((tile) => [
      tile.instanceId,
      tile.moduleId,
      tile.rotationQuarter,
      tile.mirror ?? "",
      tile.transform.x,
      tile.transform.y,
      tile.transform.z,
    ].join(":")),
  ].join("|");
}

/** Assembly-space copy. Mirror, then quarter-turn yaw, then translation. A mirror reverses winding so the solid stays outward. */
export function placeTileMesh(
  mesh: IsoMesh,
  tile: Pick<TileInstance, "transform" | "rotationQuarter" | "mirror">,
): IsoMesh | null {
  if (mesh.positions.length < 9 || mesh.positions.length % 3 !== 0) return null;
  if (mesh.indices.length < 3 || mesh.indices.length % 3 !== 0) return null;
  const positions = new Float32Array(mesh.positions.length);
  const normals = new Float32Array(mesh.positions.length);
  for (let index = 0; index < mesh.positions.length; index += 3) {
    const placed = translate(yaw(mirrorPoint(readVec(mesh.positions, index), tile.mirror), tile.rotationQuarter), tile.transform);
    writeVec(positions, index, placed);
    if (index < mesh.normals.length) {
      writeVec(normals, index, yaw(mirrorPoint(readVec(mesh.normals, index), tile.mirror), tile.rotationQuarter));
    }
  }
  const indices = Uint32Array.from(mesh.indices);
  if (tile.mirror) {
    for (let index = 0; index < indices.length; index += 3) {
      const swap = indices[index + 1];
      indices[index + 1] = indices[index + 2];
      indices[index + 2] = swap;
    }
  }
  return { positions, normals, indices, triangles: indices.length / 3 };
}

export async function executeBooleanAssembly(
  plan: BooleanAssemblyPlan,
  tiles: readonly TileInstance[],
  loaded: ReadonlyMap<string, ModuleHandoff>,
): Promise<BooleanExecutionResult> {
  const tileResults: BooleanTileExecution[] = [];
  for (const tilePlan of [...plan.tiles].sort((left, right) => compareId(left.tileId, right.tileId))) {
    tileResults.push(await executeTile(tilePlan.tileId, tilePlan.operations, tiles, loaded));
  }
  const connections = await Promise.all([...plan.connections].sort((left, right) => compareId(left.connectionId, right.connectionId)).map(executeConnection));
  const assembly = await unionAssembly(tileResults, connections);
  const warnings = [
    ...tileResults.flatMap((tile) => tile.warnings),
    ...connections.filter((item) => item.reason).map((item) => `${item.connectionId}:${item.reason}`),
    ...(assembly.reason ? [`assembly:${assembly.reason}`] : []),
  ];
  return {
    status: overallStatus(tileResults, connections, assembly, plan),
    tiles: tileResults,
    connections,
    assembly,
    warnings,
  };
}

async function executeTile(
  tileId: string,
  operations: BooleanCut[],
  tiles: readonly TileInstance[],
  loaded: ReadonlyMap<string, ModuleHandoff>,
): Promise<BooleanTileExecution> {
  const tile = tiles.find((item) => item.instanceId === tileId);
  const handoff = tile ? loaded.get(tile.archetypeId) : undefined;
  const blank = (status: BooleanExecutionStatus, reason: string, placedSource: IsoMesh | null, sourceGeometryId: string | null): BooleanTileExecution => ({
    tileId,
    status,
    sourceGeometryId,
    placedSource,
    derivedGeometry: null,
    plannedCutCount: operations.length,
    successfulCutCount: 0,
    failedCutCount: operations.length,
    cuts: operations.map((cut) => cutRecord(cut, placedSource?.triangles ?? 0, null, "not-run", null, false, reason)),
    warnings: [reason],
    kernelStatus: null,
    readiness: null,
  });
  if (!tile || !handoff || handoff.status !== "ready" || !handoff.geometry) {
    return blank("unresolved", tile ? "module-geometry-unavailable" : "tile-missing", null, tile?.moduleId ?? null);
  }
  const placed = placeTileMesh(await physicalOperand(handoff), tile);
  if (!placed) return blank("unresolved", "placed-copy-invalid", null, handoff.moduleId);
  const readiness = await evaluateBooleanReadiness(placed);
  if (!readiness.booleanReady) {
    return {
      ...blank("unresolved", readiness.reason, placed, handoff.moduleId),
      readiness,
      kernelStatus: (readiness.kernelStatus as ErrorStatus | null),
    };
  }
  let current = placed;
  let derived: IsoMesh | null = null;
  let kernelStatus: ErrorStatus | null = null;
  const cuts: BooleanCutExecution[] = [];
  for (const cut of operations) {
    const inputTriangles = current.triangles;
    const result = await booleanDifference(current, cut.volume);
    const problem = result.mesh ? derivedProblem(result.mesh) : "empty";
    const success = result.status === "ready" && result.kernelStatus === "NoError" && !!result.mesh && !problem;
    if (success && result.mesh) {
      current = result.mesh;
      derived = result.mesh;
      kernelStatus = result.kernelStatus;
    }
    cuts.push(cutRecord(
      cut,
      inputTriangles,
      success && result.mesh ? result.mesh.triangles : null,
      result.status,
      result.kernelStatus,
      success,
      success ? "" : problem || result.reason || result.status,
    ));
  }
  const successfulCutCount = cuts.filter((cut) => cut.success).length;
  const failedCutCount = cuts.length - successfulCutCount;
  const warnings = cuts.flatMap((cut) => (cut.warning ? [cut.warning] : []));
  const status: BooleanExecutionStatus = failedCutCount === 0
    ? "ready"
    : successfulCutCount > 0
      ? "partial"
      : "failed";
  return {
    tileId,
    status,
    sourceGeometryId: handoff.moduleId,
    placedSource: placed,
    derivedGeometry: derived,
    plannedCutCount: operations.length,
    successfulCutCount,
    failedCutCount,
    cuts,
    warnings,
    kernelStatus,
    readiness,
  };
}

async function executeConnection(connection: BooleanConnectionPlan): Promise<BooleanConnectionExecution> {
  if (connection.status !== "ready" || !connection.connectorOperation) {
    return {
      connectionId: connection.connectionId,
      candidateId: connection.candidateId,
      status: idleStatus(connection.status),
      connectorGeometry: connection.connectorGeometry,
      connectorSourceOpen: null,
      connectorConditionStatus: "not-run",
      connectorConditionReason: "",
      derivedConnector: null,
      additionGeometry: null,
      unionStatus: "not-run",
      kernelStatus: null,
      reason: connection.status === "ready" ? "missing-connector" : connection.status,
      unitedPieceCount: 0,
    };
  }
  const operation = connection.connectorOperation;
  const sourceOpen = diagnoseTopology(operation.connector).boundaryEdgeCount > 0;
  const sampleCount = connectorSampleCount(operation.connector);
  const closed = closeConnectorLoft(operation.connector, sampleCount, HYBRID_GENERATOR_SETTINGS.loftSteps);
  if (closed.status !== "ready" || !closed.mesh) {
    return {
      connectionId: connection.connectionId,
      candidateId: connection.candidateId,
      status: "unresolved",
      connectorGeometry: operation.connector,
      connectorSourceOpen: sourceOpen,
      connectorConditionStatus: "failed",
      connectorConditionReason: closed.reason,
      derivedConnector: null,
      additionGeometry: null,
      unionStatus: "not-run",
      kernelStatus: null,
      reason: closed.reason,
      unitedPieceCount: 0,
    };
  }
  const derivedProbe = await isoMeshToBooleanMesh(closed.mesh);
  derivedProbe.mesh?.release();
  if (derivedProbe.status !== "ready") {
    return {
      connectionId: connection.connectionId,
      candidateId: connection.candidateId,
      status: "unresolved",
      connectorGeometry: operation.connector,
      connectorSourceOpen: sourceOpen,
      connectorConditionStatus: "failed",
      connectorConditionReason: derivedProbe.reason || derivedProbe.status,
      derivedConnector: closed.mesh,
      additionGeometry: null,
      unionStatus: "not-run",
      kernelStatus: null,
      reason: `derived-connector:${derivedProbe.reason || derivedProbe.status}`,
      unitedPieceCount: 0,
    };
  }
  const pieces = [closed.mesh, operation.insertionA, operation.insertionB];
  const united = await unionMeshes(pieces);
  const status: BooleanExecutionStatus = united.failed === 0 && united.united >= pieces.length
    ? "ready"
    : united.mesh
      ? "partial"
      : united.adapterStatus === "non-manifold" || united.adapterStatus === "invalid-input"
        ? "unresolved"
        : "failed";
  return {
    connectionId: connection.connectionId,
    candidateId: connection.candidateId,
    status,
    connectorGeometry: operation.connector,
    connectorSourceOpen: sourceOpen,
    connectorConditionStatus: "closed",
    connectorConditionReason: "",
    derivedConnector: closed.mesh,
    additionGeometry: united.mesh,
    unionStatus: united.adapterStatus,
    kernelStatus: united.kernelStatus,
    reason: united.reason,
    unitedPieceCount: united.mesh ? united.united : 0,
  };
}

async function unionAssembly(tiles: BooleanTileExecution[], connections: BooleanConnectionExecution[]): Promise<BooleanAssemblyExecution> {
  const parts = [
    ...[...tiles].sort((left, right) => compareId(left.tileId, right.tileId)).flatMap((tile) => (tile.derivedGeometry ? [tile.derivedGeometry] : [])),
    ...[...connections].sort((left, right) => compareId(left.connectionId, right.connectionId)).flatMap((item) => (item.additionGeometry ? [item.additionGeometry] : [])),
  ];
  if (parts.length === 0) {
    return { status: "unresolved", mesh: null, kernelStatus: null, reason: "no-derived-parts", partCount: 0, unitedPartCount: 0 };
  }
  if (parts.length === 1) {
    return { status: "partial", mesh: null, kernelStatus: null, reason: "single-part", partCount: 1, unitedPartCount: 1 };
  }
  const united = await unionMeshes(parts);
  if (united.failed === 0 && united.mesh && united.united === parts.length) {
    return { status: "ready", mesh: united.mesh, kernelStatus: united.kernelStatus, reason: "", partCount: parts.length, unitedPartCount: united.united };
  }
  return {
    status: united.mesh ? "partial" : "unresolved",
    mesh: united.mesh,
    kernelStatus: united.kernelStatus,
    reason: united.reason || "assembly-union-failed",
    partCount: parts.length,
    unitedPartCount: united.mesh ? united.united : 0,
  };
}

async function unionMeshes(pieces: IsoMesh[]) {
  let acc: IsoMesh | null = null;
  let united = 0;
  let failed = 0;
  let adapterStatus: BooleanAdapterStatus | "not-run" = "not-run";
  let kernelStatus: ErrorStatus | null = null;
  let reason = "";
  let unionCount = 0;
  for (const piece of pieces) {
    if (!acc) {
      const probe = await isoMeshToBooleanMesh(piece);
      if (probe.status !== "ready" || !probe.mesh) {
        probe.mesh?.release();
        failed += 1;
        adapterStatus = probe.status;
        reason = probe.reason || probe.status;
        continue;
      }
      const iso = await booleanMeshToIsoMesh(probe.mesh);
      probe.mesh.release();
      if (iso.status !== "ready" || !iso.mesh || derivedProblem(iso.mesh)) {
        failed += 1;
        adapterStatus = iso.status;
        kernelStatus = iso.kernelStatus;
        reason = iso.reason || iso.status;
        continue;
      }
      acc = iso.mesh;
      united = 1;
      adapterStatus = "ready";
      kernelStatus = iso.kernelStatus;
      continue;
    }
    const result = await booleanUnion(acc, piece);
    unionCount += 1;
    const problem = result.mesh ? derivedProblem(result.mesh) : "empty";
    if (result.status === "ready" && result.kernelStatus === "NoError" && result.mesh && !problem) {
      acc = result.mesh;
      united += 1;
      adapterStatus = "ready";
      kernelStatus = result.kernelStatus;
    } else {
      failed += 1;
      adapterStatus = result.status;
      kernelStatus = result.kernelStatus;
      reason = problem || result.reason || result.status;
    }
  }
  return {
    mesh: unionCount > 0 && united >= 2 ? acc : null,
    united,
    failed,
    adapterStatus,
    kernelStatus,
    reason,
  };
}

function overallStatus(
  tiles: BooleanTileExecution[],
  connections: BooleanConnectionExecution[],
  assembly: BooleanAssemblyExecution,
  plan: BooleanAssemblyPlan,
): BooleanExecutionStatus {
  const requiredTiles = tiles.filter((tile) => tile.plannedCutCount > 0);
  const requiredConnections = connections.filter((item) => plan.connections.find((planItem) => planItem.connectionId === item.connectionId)?.status === "ready");
  if (requiredTiles.length === 0 && requiredConnections.length === 0) return "unresolved";
  const cutsReady = requiredTiles.every((tile) => tile.status === "ready");
  const additionsReady = requiredConnections.every((item) => item.status === "ready");
  if (cutsReady && additionsReady && assembly.status === "ready" && assembly.kernelStatus === "NoError") return "ready";
  const useful = requiredTiles.some((tile) => tile.derivedGeometry) || requiredConnections.some((item) => item.additionGeometry) || assembly.mesh;
  if (useful) return "partial";
  if (requiredTiles.some((tile) => tile.status === "unresolved") || requiredConnections.some((item) => item.status === "unresolved")) return "unresolved";
  return "failed";
}

function cutRecord(
  cut: BooleanCut,
  inputTriangleCount: number,
  outputTriangleCount: number | null,
  adapterStatus: BooleanAdapterStatus | "not-run",
  kernelStatus: ErrorStatus | null,
  success: boolean,
  reason: string,
): BooleanCutExecution {
  return {
    connectionId: cut.connectionId,
    sequence: cut.sequence,
    tool: cut.volume,
    inputTriangleCount,
    outputTriangleCount,
    adapterStatus,
    kernelStatus,
    success,
    potentialCutConflict: cut.potentialCutConflict,
    warning: cut.potentialCutConflict ? "potential-cut-conflict" : null,
    reason,
  };
}

function idleStatus(status: BooleanPlanStatus): BooleanExecutionStatus {
  if (status === "invalid") return "failed";
  return "unresolved";
}

function derivedProblem(mesh: IsoMesh) {
  if (mesh.positions.length < 9 || mesh.positions.length % 3 !== 0) return "positions";
  if (mesh.normals.length !== mesh.positions.length) return "normals";
  if (mesh.triangles < 1 || mesh.indices.length !== mesh.triangles * 3) return "triangles";
  const vertexCount = mesh.positions.length / 3;
  for (let index = 0; index < mesh.positions.length; index += 1) {
    if (!Number.isFinite(mesh.positions[index])) return "non-finite-position";
  }
  for (let index = 0; index < mesh.normals.length; index += 1) {
    if (!Number.isFinite(mesh.normals[index])) return "non-finite-normal";
  }
  for (let index = 0; index < mesh.indices.length; index += 3) {
    const corners = [mesh.indices[index], mesh.indices[index + 1], mesh.indices[index + 2]];
    if (new Set(corners).size !== 3) return "degenerate-triangle";
    if (corners.some((corner) => corner < 0 || corner >= vertexCount)) return "index";
  }
  return "";
}

function readVec(values: ArrayLike<number>, offset: number): Vec3 {
  return { x: values[offset] ?? 0, y: values[offset + 1] ?? 0, z: values[offset + 2] ?? 0 };
}

function writeVec(values: Float32Array, offset: number, vector: Vec3) {
  values[offset] = vector.x;
  values[offset + 1] = vector.y;
  values[offset + 2] = vector.z;
}

function mirrorPoint(vector: Vec3, axis: TileInstance["mirror"]): Vec3 {
  if (axis === "x") return { x: -vector.x, y: vector.y, z: vector.z };
  if (axis === "y") return { x: vector.x, y: -vector.y, z: vector.z };
  if (axis === "z") return { x: vector.x, y: vector.y, z: -vector.z };
  return vector;
}

function yaw(vector: Vec3, quarter: 0 | 1 | 2 | 3): Vec3 {
  const angle = quarter * Math.PI / 2;
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  return { x: vector.x * cosine + vector.z * sine, y: vector.y, z: -vector.x * sine + vector.z * cosine };
}

function translate(vector: Vec3, shift: Vec3): Vec3 {
  return { x: vector.x + shift.x, y: vector.y + shift.y, z: vector.z + shift.z };
}

function connectorSampleCount(mesh: IsoMesh) {
  const steps = HYBRID_GENERATOR_SETTINGS.loftSteps;
  const vertexCount = mesh.positions.length / 3;
  if (!Number.isInteger(vertexCount) || vertexCount % steps !== 0) return 0;
  return vertexCount / steps;
}

function compareId(left: string, right: string) {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}
