import type { IsoMesh } from "../scan/isomesh";
import type { FaceId, Vec3 } from "./contract";
import type { InterlockConnection, InterlockResult } from "./interlock";

/**
 * A record of the direct-union steps a later stage would run.
 * Parent A, the selected hybrid, and Parent B are listed here.
 * Difference cuts are not part of this plan.
 */
export const BOOLEAN_PLAN_SETTINGS = {
  version: "skill4-boolean-plan-v2",
  execution: "record-only",
  connectionOrder: ["parent-a", "closed-hybrid", "parent-b"],
} as const;

export type BooleanPlanStatus = "ready" | "not-ready" | "blocked" | "invalid" | "unresolved";

export type BooleanAssemblyStatus = "ready" | "partial" | "not-ready";

export type BooleanParticipantRole = "parent-a" | "closed-hybrid" | "parent-b";

export type BooleanValidation = {
  accepted: boolean;
  failures: string[];
};

export type BooleanParticipant = {
  role: BooleanParticipantRole;
  id: string;
  required: true;
};

export type BooleanConnectionPlan = {
  connectionId: string;
  candidateId: string | null;
  status: BooleanPlanStatus;
  tileAId: string | null;
  tileBId: string | null;
  faceA: FaceId | null;
  faceB: FaceId | null;
  inwardA: Vec3 | null;
  inwardB: Vec3 | null;
  participants: BooleanParticipant[];
  connectorGeometry: IsoMesh | null;
  validation: BooleanValidation;
};

export type BooleanTilePlan = {
  tileId: string;
  connectionIds: string[];
};

export type BooleanAssemblyPlan = {
  connections: BooleanConnectionPlan[];
  tiles: BooleanTilePlan[];
  readyConnectionCount: number;
  failedConnectionCount: number;
  requiredParticipantCount: number;
  status: BooleanAssemblyStatus;
};

export function booleanPlanLabel(status: BooleanAssemblyStatus) {
  if (status === "ready") return "READY";
  if (status === "partial") return "PARTIAL";
  return "NOT READY";
}

export function buildBooleanPlan(interlocks: InterlockResult): BooleanAssemblyPlan {
  const connections = interlocks.connections.map(planConnection);
  const tiles = groupTiles(connections);
  const readyConnectionCount = connections.filter((plan) => plan.status === "ready").length;
  const failedConnectionCount = connections.length - readyConnectionCount;
  const requiredParticipantCount = connections.reduce((sum, plan) => sum + plan.participants.length, 0);
  const status: BooleanAssemblyStatus = connections.length > 0 && readyConnectionCount === connections.length
    ? "ready"
    : readyConnectionCount > 0
      ? "partial"
      : "not-ready";
  return { connections, tiles, readyConnectionCount, failedConnectionCount, requiredParticipantCount, status };
}

function planConnection(connection: InterlockConnection): BooleanConnectionPlan {
  const idle = (status: BooleanPlanStatus, failures: string[]): BooleanConnectionPlan => ({
    connectionId: connection.connectionId,
    candidateId: connection.candidateId,
    status,
    tileAId: null,
    tileBId: null,
    faceA: null,
    faceB: null,
    inwardA: null,
    inwardB: null,
    participants: [],
    connectorGeometry: null,
    validation: { accepted: false, failures },
  });
  if (connection.status === "blocked") return idle("blocked", ["interlock-blocked"]);
  if (connection.status === "invalid") return idle("invalid", ["interlock-invalid"]);
  if (connection.status === "unresolved") return idle("unresolved", ["interlock-unresolved"]);
  if (connection.status !== "ready") return idle("not-ready", ["interlock-not-ready"]);
  const failures = validateConnector(connection);
  if (failures.length > 0 || !connection.connectorGeometry || !connection.interfaceA || !connection.interfaceB) {
    return idle("unresolved", failures.length > 0 ? failures : ["missing-geometry"]);
  }
  const tileAId = connection.interfaceA.tileId;
  const tileBId = connection.interfaceB.tileId;
  return {
    connectionId: connection.connectionId,
    candidateId: connection.candidateId,
    status: "ready",
    tileAId,
    tileBId,
    faceA: connection.interfaceA.face,
    faceB: connection.interfaceB.face,
    inwardA: { ...connection.interfaceA.inward },
    inwardB: { ...connection.interfaceB.inward },
    participants: [
      { role: "parent-a", id: tileAId, required: true },
      { role: "closed-hybrid", id: connection.candidateId ?? "", required: true },
      { role: "parent-b", id: tileBId, required: true },
    ],
    connectorGeometry: connection.connectorGeometry,
    validation: { accepted: true, failures: [] },
  };
}

function validateConnector(connection: InterlockConnection) {
  const failures: string[] = [];
  const mesh = connection.connectorGeometry;
  if (!mesh || !connection.interfaceA || !connection.interfaceB) failures.push("geometry");
  if (!mesh || !finitePositions(mesh)) failures.push("finite");
  if (!mesh || !validIndices(mesh)) failures.push("indices");
  if (!connection.candidateId) failures.push("candidate");
  if (!connection.interfaceA?.tileId || !connection.interfaceB?.tileId) failures.push("parents");
  return failures;
}

function groupTiles(connections: BooleanConnectionPlan[]): BooleanTilePlan[] {
  const byTile = new Map<string, string[]>();
  for (const connection of connections) {
    if (connection.status !== "ready" || !connection.tileAId || !connection.tileBId) continue;
    for (const tileId of [connection.tileAId, connection.tileBId]) {
      const list = byTile.get(tileId) ?? [];
      list.push(connection.connectionId);
      byTile.set(tileId, list);
    }
  }
  return [...byTile.keys()].sort().map((tileId) => ({
    tileId,
    connectionIds: [...(byTile.get(tileId) ?? [])].sort(compareId),
  }));
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

function compareId(left: string, right: string) {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}
