import type { IsoMesh } from "../scan/isomesh";
import type { FaceId } from "./contract";
import { HYBRID_GENERATOR_SETTINGS } from "./hybrid-generator";
import type { InterlockConnection, InterlockInterface, InterlockResult } from "./interlock";

/**
 * A record of the boolean steps a later stage would run.
 * Difference and union are described here and are not executed.
 */
export const BOOLEAN_PLAN_SETTINGS = {
  version: "skill4-boolean-plan-v1",
  execution: "record-only",
  tileOrder: ["difference", "preserve-tile", "union-connector-later"],
} as const;

export type BooleanPlanStatus = "ready" | "not-ready" | "blocked" | "invalid" | "unresolved";

export type BooleanAssemblyStatus = "ready" | "partial" | "not-ready";

export type BooleanValidation = {
  accepted: boolean;
  failures: string[];
};

export type BooleanCut = {
  connectionId: string;
  candidateId: string | null;
  tileId: string;
  face: FaceId;
  operation: "difference";
  sequence: number;
  volume: IsoMesh;
  potentialCutConflict: boolean;
};

export type BooleanConnectorOperation = {
  operation: "union-later";
  connectionId: string;
  candidateId: string | null;
  connector: IsoMesh;
  insertionA: IsoMesh;
  insertionB: IsoMesh;
  interfaceA: InterlockInterface;
  interfaceB: InterlockInterface;
};

export type BooleanConnectionPlan = {
  connectionId: string;
  candidateId: string | null;
  status: BooleanPlanStatus;
  tileAOperation: BooleanCut | null;
  tileBOperation: BooleanCut | null;
  connectorOperation: BooleanConnectorOperation | null;
  cutVolumeA: IsoMesh | null;
  cutVolumeB: IsoMesh | null;
  connectorGeometry: IsoMesh | null;
  validation: BooleanValidation;
};

export type BooleanTilePlan = {
  tileId: string;
  operations: BooleanCut[];
  order: readonly ["difference", "preserve-tile", "union-connector-later"];
};

export type BooleanAssemblyPlan = {
  connections: BooleanConnectionPlan[];
  tiles: BooleanTilePlan[];
  connectorAdditions: BooleanConnectorOperation[];
  readyConnectionCount: number;
  failedConnectionCount: number;
  status: BooleanAssemblyStatus;
};

export function booleanPlanLabel(status: BooleanAssemblyStatus) {
  if (status === "ready") return "READY";
  if (status === "partial") return "PARTIAL";
  return "NOT READY";
}

export function buildBooleanPlan(interlocks: InterlockResult): BooleanAssemblyPlan {
  const connections = interlocks.connections.map(planConnection);
  const cuts = connections.flatMap((plan) => [plan.tileAOperation, plan.tileBOperation].filter((cut): cut is BooleanCut => cut !== null));
  const tiles = groupCuts(cuts);
  const connectorAdditions = connections.flatMap((plan) => (plan.connectorOperation ? [plan.connectorOperation] : []));
  connectorAdditions.sort((left, right) => compareId(left.connectionId, right.connectionId));
  const readyConnectionCount = connections.filter((plan) => plan.status === "ready").length;
  const failedConnectionCount = connections.length - readyConnectionCount;
  const status: BooleanAssemblyStatus = connections.length > 0 && readyConnectionCount === connections.length
    ? "ready"
    : readyConnectionCount > 0
      ? "partial"
      : "not-ready";
  return { connections, tiles, connectorAdditions, readyConnectionCount, failedConnectionCount, status };
}

function planConnection(connection: InterlockConnection): BooleanConnectionPlan {
  const idle = (status: BooleanPlanStatus, failures: string[]): BooleanConnectionPlan => ({
    connectionId: connection.connectionId,
    candidateId: connection.candidateId,
    status,
    tileAOperation: null,
    tileBOperation: null,
    connectorOperation: null,
    cutVolumeA: null,
    cutVolumeB: null,
    connectorGeometry: null,
    validation: { accepted: false, failures },
  });
  if (connection.status === "blocked") return idle("blocked", ["interlock-blocked"]);
  if (connection.status === "invalid") return idle("invalid", ["interlock-invalid"]);
  if (connection.status === "unresolved") return idle("unresolved", ["interlock-unresolved"]);
  if (connection.status !== "ready") return idle("not-ready", ["interlock-not-ready"]);
  const failures = [...validateSide(connection, "A"), ...validateSide(connection, "B")];
  if (failures.length > 0 || !connection.insertionA || !connection.insertionB || !connection.connectorGeometry || !connection.interfaceA || !connection.interfaceB) {
    return idle("unresolved", failures.length > 0 ? failures : ["missing-geometry"]);
  }
  const tileAOperation = cut(connection, connection.insertionA, connection.interfaceA);
  const tileBOperation = cut(connection, connection.insertionB, connection.interfaceB);
  const connectorOperation: BooleanConnectorOperation = {
    operation: "union-later",
    connectionId: connection.connectionId,
    candidateId: connection.candidateId,
    connector: connection.connectorGeometry,
    insertionA: connection.insertionA,
    insertionB: connection.insertionB,
    interfaceA: connection.interfaceA,
    interfaceB: connection.interfaceB,
  };
  return {
    connectionId: connection.connectionId,
    candidateId: connection.candidateId,
    status: "ready",
    tileAOperation,
    tileBOperation,
    connectorOperation,
    cutVolumeA: connection.insertionA,
    cutVolumeB: connection.insertionB,
    connectorGeometry: connection.connectorGeometry,
    validation: { accepted: true, failures: [] },
  };
}

function cut(connection: InterlockConnection, volume: IsoMesh, face: InterlockInterface): BooleanCut {
  return {
    connectionId: connection.connectionId,
    candidateId: connection.candidateId,
    tileId: face.tileId,
    face: face.face,
    operation: "difference",
    sequence: 0,
    volume,
    potentialCutConflict: false,
  };
}

function validateSide(connection: InterlockConnection, side: "A" | "B") {
  const failures: string[] = [];
  const volume = side === "A" ? connection.insertionA : connection.insertionB;
  const face = side === "A" ? connection.interfaceA : connection.interfaceB;
  const depth = side === "A" ? connection.attachmentDepthA : connection.attachmentDepthB;
  const overlap = side === "A" ? connection.overlapA : connection.overlapB;
  const label = side === "A" ? "a" : "b";
  if (connection.status !== "ready") failures.push(`${label}-interlock`);
  if (!volume || !connection.connectorGeometry) failures.push(`${label}-geometry`);
  if (!volume || !finitePositions(volume)) failures.push(`${label}-finite`);
  if (!volume || !validIndices(volume)) failures.push(`${label}-indices`);
  if (!volume || !closedMesh(volume)) failures.push(`${label}-closed`);
  if (depth === null || depth <= 0) failures.push(`${label}-depth`);
  if (!overlap?.pointsIntoTile || !face || dot(face.inward, face.normal) >= -0.999) failures.push(`${label}-inward`);
  if (!volume || !connection.connectorGeometry || !startsAtRing(connection.connectorGeometry, volume, side)) failures.push(`${label}-ring`);
  return failures;
}

function groupCuts(cuts: BooleanCut[]): BooleanTilePlan[] {
  const byTile = new Map<string, BooleanCut[]>();
  for (const cut of cuts) {
    const list = byTile.get(cut.tileId) ?? [];
    list.push(cut);
    byTile.set(cut.tileId, list);
  }
  return [...byTile.keys()].sort().map((tileId) => {
    const operations = [...(byTile.get(tileId) ?? [])].sort((left, right) => compareId(left.connectionId, right.connectionId));
    operations.forEach((item, index) => {
      item.sequence = index;
    });
    for (let left = 0; left < operations.length; left += 1) {
      for (let right = left + 1; right < operations.length; right += 1) {
        if (boundsOverlap(operations[left].volume, operations[right].volume)) {
          operations[left].potentialCutConflict = true;
          operations[right].potentialCutConflict = true;
        }
      }
    }
    return { tileId, operations, order: BOOLEAN_PLAN_SETTINGS.tileOrder };
  });
}

function startsAtRing(connector: IsoMesh, insertion: IsoMesh, side: "A" | "B") {
  const steps = HYBRID_GENERATOR_SETTINGS.loftSteps;
  const connectorCount = connector.positions.length / 3;
  if (connectorCount % steps !== 0) return false;
  const sampleCount = connectorCount / steps;
  const ring = side === "A" ? 0 : steps - 1;
  if (insertion.positions.length / 3 < sampleCount) return false;
  for (let sample = 0; sample < sampleCount; sample += 1) {
    const source = (ring * sampleCount + sample) * 3;
    const target = sample * 3;
    for (let axis = 0; axis < 3; axis += 1) {
      if (Math.abs(connector.positions[source + axis] - insertion.positions[target + axis]) > 1e-5) return false;
    }
  }
  return true;
}

function finitePositions(mesh: IsoMesh) {
  for (let index = 0; index < mesh.positions.length; index += 1) {
    if (!Number.isFinite(mesh.positions[index])) return false;
  }
  return mesh.positions.length > 0;
}

function validIndices(mesh: IsoMesh) {
  if (mesh.triangles < 1 || mesh.indices.length !== mesh.triangles * 3) return false;
  const vertexCount = mesh.positions.length / 3;
  for (let index = 0; index < mesh.indices.length; index += 3) {
    const corners = [mesh.indices[index], mesh.indices[index + 1], mesh.indices[index + 2]];
    if (new Set(corners).size !== 3) return false;
    if (corners.some((corner) => corner < 0 || corner >= vertexCount)) return false;
  }
  return true;
}

function closedMesh(mesh: IsoMesh) {
  if (!validIndices(mesh)) return false;
  const edges = new Map<string, number>();
  for (let index = 0; index < mesh.indices.length; index += 3) {
    const corners = [mesh.indices[index], mesh.indices[index + 1], mesh.indices[index + 2]];
    for (let edge = 0; edge < 3; edge += 1) {
      const left = corners[edge];
      const right = corners[(edge + 1) % 3];
      const key = left < right ? `${left}:${right}` : `${right}:${left}`;
      edges.set(key, (edges.get(key) ?? 0) + 1);
    }
  }
  for (const count of edges.values()) {
    if (count !== 2) return false;
  }
  return edges.size > 0;
}

function boundsOverlap(left: IsoMesh, right: IsoMesh) {
  const a = bounds(left);
  const b = bounds(right);
  return a.min.x <= b.max.x && b.min.x <= a.max.x
    && a.min.y <= b.max.y && b.min.y <= a.max.y
    && a.min.z <= b.max.z && b.min.z <= a.max.z;
}

function bounds(mesh: IsoMesh) {
  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;
  for (let index = 0; index < mesh.positions.length; index += 3) {
    minX = Math.min(minX, mesh.positions[index]);
    minY = Math.min(minY, mesh.positions[index + 1]);
    minZ = Math.min(minZ, mesh.positions[index + 2]);
    maxX = Math.max(maxX, mesh.positions[index]);
    maxY = Math.max(maxY, mesh.positions[index + 1]);
    maxZ = Math.max(maxZ, mesh.positions[index + 2]);
  }
  return { min: { x: minX, y: minY, z: minZ }, max: { x: maxX, y: maxY, z: maxZ } };
}

function compareId(left: string, right: string) {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function dot(a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }) {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}
