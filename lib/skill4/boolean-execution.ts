import type { IsoMesh } from "../scan/isomesh";
import type { ModuleHandoff } from "./adapt";
import {
  booleanIntersection,
  booleanMeshToIsoMesh,
  booleanUnion,
  booleanVolume,
  containedVolumeRatio,
  isoMeshToBooleanMesh,
  type BooleanAdapterStatus,
} from "./boolean-adapter";
import { closeConnectorLoft, diagnoseTopology, evaluateBooleanReadiness, seatLoftEnds, type BooleanReadiness } from "./boolean-conditioning";
import { physicalOperand } from "./geometry-preflight";
import type { BooleanAssemblyPlan, BooleanConnectionPlan, BooleanPlanStatus } from "./boolean-plan";
import { PROFILE_SAMPLES } from "./face-hybrid-profile";
import { HYBRID_GENERATOR_SETTINGS } from "./hybrid-generator";
import type { ErrorStatus } from "manifold-3d/manifold";
import type { Vec3 } from "./contract";
import { basisDeterminant, rotateByBasis, tileBasis } from "./tile-basis";
import type { TileInstance } from "./tiles";

/**
 * Joins a BooleanAssemblyPlan on derived copies.
 * Each ready connection unions physical Parent A, a closed copy of the selected hybrid, and physical Parent B.
 * A failed parent is never dropped from a ready result.
 */
export const BOOLEAN_EXECUTION_SETTINGS = {
  version: "skill4-boolean-execution-v5",
  unionOrder: ["parent-a", "closed-hybrid", "parent-b"],
  penetrationDepths: [0.4, 0.8, 1.2, 1.6, 2, 2.4, 3.2, 4],
  minimumOverlapVolume: 0.8,
  containedRatio: 0.9,
} as const;

export type JoinStrategy = "DIRECT UNION" | "ADAPTIVE OVERLAP" | "LOCAL TRANSITION" | "LOCAL REMESH";

export type ConnectorConditionStatus = "not-run" | "closed" | "failed";

export type BooleanExecutionStatus = "ready" | "partial" | "failed" | "unresolved";

export type BooleanTileExecution = {
  tileId: string;
  status: BooleanExecutionStatus;
  sourceGeometryId: string | null;
  placedSource: IsoMesh | null;
  derivedGeometry: IsoMesh | null;
  plannedCutCount: number;
  successfulCutCount: number;
  failedCutCount: number;
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
  overlapExtension: number | null;
  penetrationA: number | null;
  penetrationB: number | null;
  radialExtension: number | null;
  overlapVolumeA: number | null;
  overlapVolumeB: number | null;
  surfaceDistanceA: number | null;
  surfaceDistanceB: number | null;
  debugHybrid: IsoMesh | null;
  debugOverlapA: IsoMesh | null;
  debugOverlapB: IsoMesh | null;
  debugSurfaceA: IsoMesh | null;
  debugSurfaceB: IsoMesh | null;
  parentAPresent: boolean;
  hybridPresent: boolean;
  parentBPresent: boolean;
  stepAStatus: BooleanAdapterStatus | "not-run";
  stepBStatus: BooleanAdapterStatus | "not-run";
  joinStrategy: JoinStrategy | null;
};

export type BooleanAssemblyExecution = {
  status: BooleanExecutionStatus;
  mesh: IsoMesh | null;
  kernelStatus: ErrorStatus | null;
  reason: string;
  partCount: number;
  unitedPartCount: number;
  componentCount: number | null;
  boundaryEdgeCount: number | null;
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
      item.tileAId ?? "",
      item.tileBId ?? "",
      item.connectorGeometry?.triangles ?? 0,
    ].join(":")),
    ...tiles.map((tile) => [
      tile.instanceId,
      tile.moduleId,
      tile.rotationQuarter,
      tile.mirror ?? "",
      (tile.rotation ?? []).map((value) => Math.round(value * 10000) / 10000).join(","),
      tile.transform.x,
      tile.transform.y,
      tile.transform.z,
    ].join(":")),
  ].join("|");
}

/** Assembly-space copy. The tile basis, then translation. A reflected basis reverses winding so the solid stays outward. */
export function placeTileMesh(
  mesh: IsoMesh,
  tile: Pick<TileInstance, "transform" | "rotation" | "rotationQuarter" | "mirror">,
): IsoMesh | null {
  if (mesh.positions.length < 9 || mesh.positions.length % 3 !== 0) return null;
  if (mesh.indices.length < 3 || mesh.indices.length % 3 !== 0) return null;
  const basis = tileBasis(tile);
  const positions = new Float32Array(mesh.positions.length);
  const normals = new Float32Array(mesh.positions.length);
  for (let index = 0; index < mesh.positions.length; index += 3) {
    const placed = translate(rotateByBasis(basis, readVec(mesh.positions, index)), tile.transform);
    writeVec(positions, index, placed);
    if (index < mesh.normals.length) {
      writeVec(normals, index, rotateByBasis(basis, readVec(mesh.normals, index)));
    }
  }
  const indices = Uint32Array.from(mesh.indices);
  if (basisDeterminant(basis) < 0) {
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
  const tileIds = [...new Set(plan.connections.flatMap((item) => [item.tileAId, item.tileBId].filter((id): id is string => !!id)))].sort(compareId);
  const tileResults: BooleanTileExecution[] = [];
  for (const tileId of tileIds) tileResults.push(await prepareTile(tileId, tiles, loaded));
  const connections: BooleanConnectionExecution[] = [];
  for (const connection of [...plan.connections].sort((left, right) => compareId(left.connectionId, right.connectionId))) {
    connections.push(await executeConnection(connection, tileResults));
  }
  const assembly = await unionAssembly(plan, tileResults, connections);
  const warnings = [
    ...tileResults.flatMap((tile) => tile.warnings),
    ...connections.filter((item) => item.reason).map((item) => `${item.connectionId}:${item.reason}`),
    ...(assembly.reason ? [`assembly:${assembly.reason}`] : []),
  ];
  return {
    status: overallStatus(connections, assembly, plan),
    tiles: tileResults,
    connections,
    assembly,
    warnings,
  };
}

async function prepareTile(
  tileId: string,
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
    plannedCutCount: 0,
    successfulCutCount: 0,
    failedCutCount: 0,
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
  return {
    tileId,
    status: "ready",
    sourceGeometryId: handoff.moduleId,
    placedSource: placed,
    derivedGeometry: placed,
    plannedCutCount: 0,
    successfulCutCount: 0,
    failedCutCount: 0,
    warnings: [],
    kernelStatus: "NoError",
    readiness,
  };
}

async function executeConnection(
  connection: BooleanConnectionPlan,
  tiles: BooleanTileExecution[],
): Promise<BooleanConnectionExecution> {
  const idle = (status: BooleanExecutionStatus, reason: string): BooleanConnectionExecution => ({
    connectionId: connection.connectionId,
    candidateId: connection.candidateId,
    status,
    connectorGeometry: connection.connectorGeometry,
    connectorSourceOpen: null,
    connectorConditionStatus: "not-run",
    connectorConditionReason: "",
    derivedConnector: null,
    additionGeometry: null,
    unionStatus: "not-run",
    kernelStatus: null,
    reason,
    unitedPieceCount: 0,
    overlapExtension: null,
    penetrationA: null,
    penetrationB: null,
    radialExtension: null,
    overlapVolumeA: null,
    overlapVolumeB: null,
    surfaceDistanceA: null,
    surfaceDistanceB: null,
    debugHybrid: null,
    debugOverlapA: null,
    debugOverlapB: null,
    debugSurfaceA: null,
    debugSurfaceB: null,
    parentAPresent: false,
    hybridPresent: false,
    parentBPresent: false,
    stepAStatus: "not-run",
    stepBStatus: "not-run",
    joinStrategy: null,
  });
  if (connection.status !== "ready" || !connection.connectorGeometry || !connection.tileAId || !connection.tileBId) {
    return idle(idleStatus(connection.status), connection.status === "ready" ? "missing-connector" : connection.status);
  }
  const parentA = tiles.find((tile) => tile.tileId === connection.tileAId)?.derivedGeometry ?? null;
  const parentB = tiles.find((tile) => tile.tileId === connection.tileBId)?.derivedGeometry ?? null;
  if (!parentA || !parentB) return idle("unresolved", !parentA ? "PARENT A NON-MANIFOLD" : "PARENT B NON-MANIFOLD");
  const sampleCount = connectorSampleCount(connection.connectorGeometry);
  const steps = HYBRID_GENERATOR_SETTINGS.loftSteps;
  const sourceOpen = diagnoseTopology(connection.connectorGeometry).boundaryEdgeCount > 0;
  const source = connection.connectorGeometry;
  const direct = await joinAtOverlap(connection, parentA, parentB, sampleCount, steps, source, 0, 0, sourceOpen, "DIRECT UNION");
  if (joinReady(direct)) return direct;
  let adaptive = direct;
  for (const depth of BOOLEAN_EXECUTION_SETTINGS.penetrationDepths) {
    const seated = attachPhysicalHybrid(source, connection.inwardA, connection.inwardB, parentA, parentB, depth, depth);
    if (!seated) continue;
    const attempt = await joinAtOverlap(connection, parentA, parentB, sampleCount, steps, seated.mesh, depth, depth, sourceOpen, "ADAPTIVE OVERLAP");
    adaptive = {
      ...attempt,
      surfaceDistanceA: seated.distanceA,
      surfaceDistanceB: seated.distanceB,
      debugHybrid: attempt.debugHybrid ?? seated.mesh,
      debugSurfaceA: markerCloud(seated.hitsA),
      debugSurfaceB: markerCloud(seated.hitsB),
    };
    if (joinReady(adaptive)) return adaptive;
    if ((adaptive.overlapVolumeA ?? 0) >= BOOLEAN_EXECUTION_SETTINGS.minimumOverlapVolume && (adaptive.overlapVolumeB ?? 0) >= BOOLEAN_EXECUTION_SETTINGS.minimumOverlapVolume) break;
  }
  const transition = await joinWithTransitions(connection, parentA, parentB, sampleCount, steps, source, sourceOpen, "LOCAL TRANSITION");
  if (joinReady(transition)) return transition;
  const nudged = nudgeEnds(source, sampleCount, steps, connection.inwardA, connection.inwardB);
  const remesh = nudged
    ? await joinWithTransitions(connection, parentA, parentB, sampleCount, steps, nudged, sourceOpen, "LOCAL REMESH")
    : transition;
  if (joinReady(remesh)) return remesh;
  const last = remesh.reason ? remesh : transition.reason ? transition : adaptive;
  return {
    ...last,
    additionGeometry: null,
    status: "unresolved",
    parentAPresent: false,
    hybridPresent: false,
    parentBPresent: false,
    unitedPieceCount: 0,
    reason: failureReason(last),
  };
}

async function joinAtOverlap(
  connection: BooleanConnectionPlan,
  parentA: IsoMesh,
  parentB: IsoMesh,
  sampleCount: number,
  steps: number,
  openMesh: IsoMesh | null,
  penetrationA: number,
  penetrationB: number,
  sourceOpen: boolean,
  strategy: JoinStrategy,
): Promise<BooleanConnectionExecution> {
  const base = {
    connectionId: connection.connectionId,
    candidateId: connection.candidateId,
    connectorGeometry: connection.connectorGeometry,
    connectorSourceOpen: sourceOpen,
    overlapExtension: Math.max(penetrationA, penetrationB),
    penetrationA,
    penetrationB,
    radialExtension: 0,
    overlapVolumeA: null as number | null,
    overlapVolumeB: null as number | null,
    surfaceDistanceA: null as number | null,
    surfaceDistanceB: null as number | null,
    debugHybrid: null as IsoMesh | null,
    debugOverlapA: null as IsoMesh | null,
    debugOverlapB: null as IsoMesh | null,
    debugSurfaceA: null as IsoMesh | null,
    debugSurfaceB: null as IsoMesh | null,
    parentAPresent: false,
    hybridPresent: false,
    parentBPresent: false,
    stepAStatus: "not-run" as BooleanAdapterStatus | "not-run",
    stepBStatus: "not-run" as BooleanAdapterStatus | "not-run",
    unitedPieceCount: 0,
    additionGeometry: null as IsoMesh | null,
    derivedConnector: null as IsoMesh | null,
    unionStatus: "not-run" as BooleanAdapterStatus | "not-run",
    kernelStatus: null as ErrorStatus | null,
    joinStrategy: strategy,
  };
  const open = openMesh;
  if (!open) {
    return { ...base, status: "unresolved", connectorConditionStatus: "failed", connectorConditionReason: "end-offset", reason: "end-offset" };
  }
  const closed = sealConnector(open, sampleCount, steps);
  if (closed.status !== "ready" || !closed.mesh) {
    return {
      ...base,
      status: "unresolved",
      connectorConditionStatus: "failed",
      connectorConditionReason: closed.reason,
      reason: closed.reason,
    };
  }
  const volume = await booleanVolume(closed.mesh);
  const oriented = volume !== null && volume < 0 ? flipWinding(closed.mesh) : closed.mesh;
  const derivedProbe = await isoMeshToBooleanMesh(oriented);
  derivedProbe.mesh?.release();
  if (derivedProbe.status !== "ready") {
    return {
      ...base,
      status: "unresolved",
      connectorConditionStatus: "failed",
      connectorConditionReason: derivedProbe.reason || derivedProbe.status,
      derivedConnector: oriented,
      reason: `derived-connector:${derivedProbe.reason || derivedProbe.status}`,
    };
  }
  const closedTopology = diagnoseTopology(oriented);
  if (closedTopology.boundaryEdgeCount !== 0 || closedTopology.componentCount !== 1) {
    return {
      ...base,
      status: "unresolved",
      connectorConditionStatus: "failed",
      connectorConditionReason: `boundary:${closedTopology.boundaryEdgeCount};components:${closedTopology.componentCount}`,
      derivedConnector: oriented,
      reason: "closed-hybrid-topology",
    };
  }
  const resolvedProbe = await isoMeshToBooleanMesh(oriented);
  const resolvedIso = resolvedProbe.mesh ? await booleanMeshToIsoMesh(resolvedProbe.mesh) : null;
  resolvedProbe.mesh?.release();
  const physical = resolvedIso?.status === "ready" && resolvedIso.mesh ? resolvedIso.mesh : oriented;
  const gate = await overlapGate(parentA, parentB, physical);
  if (!gate.accepted) {
    return {
      ...base,
      status: "unresolved",
      connectorConditionStatus: "closed",
      connectorConditionReason: "",
      derivedConnector: physical,
      overlapVolumeA: gate.volumeA,
      overlapVolumeB: gate.volumeB,
      debugHybrid: physical,
      reason: `overlap:A ${gate.volumeA.toExponential(2)} B ${gate.volumeB.toExponential(2)}`,
    };
  }
  const stepA = await booleanUnion(parentA, physical);
  if (!unionOk(stepA) || !stepA.mesh) {
    return {
      ...base,
      status: "unresolved",
      connectorConditionStatus: "closed",
      connectorConditionReason: "",
      derivedConnector: oriented,
      stepAStatus: stepA.status,
      unionStatus: stepA.status,
      kernelStatus: stepA.kernelStatus,
      reason: `a-hybrid:${stepA.reason || stepA.status}`,
    };
  }
  const stepB = await booleanUnion(stepA.mesh, parentB);
  if (!unionOk(stepB) || !stepB.mesh) {
    return {
      ...base,
      status: "unresolved",
      connectorConditionStatus: "closed",
      connectorConditionReason: "",
      derivedConnector: oriented,
      stepAStatus: "ready",
      stepBStatus: stepB.status,
      unionStatus: stepB.status,
      kernelStatus: stepB.kernelStatus,
      reason: `result-b:${stepB.reason || stepB.status}`,
    };
  }
  const topology = diagnoseTopology(stepB.mesh);
  const readiness = await evaluateBooleanReadiness(stepB.mesh);
  if (topology.componentCount !== 1 || topology.boundaryEdgeCount !== 0 || !readiness.booleanReady || readiness.kernelStatus !== "NoError") {
    return {
      ...base,
      status: "unresolved",
      connectorConditionStatus: "closed",
      connectorConditionReason: "",
      derivedConnector: physical,
      stepAStatus: "ready",
      stepBStatus: "ready",
      unionStatus: "ready",
      kernelStatus: (readiness.kernelStatus as ErrorStatus | null),
      overlapVolumeA: gate.volumeA,
      overlapVolumeB: gate.volumeB,
      debugHybrid: physical,
      debugOverlapA: gate.meshA,
      debugOverlapB: gate.meshB,
      reason: `result-topology:components:${topology.componentCount};boundary:${topology.boundaryEdgeCount};kernel:${readiness.kernelStatus ?? readiness.reason}`,
    };
  }
  const parentAPresent = await containsSolid(stepB.mesh, parentA);
  const parentBPresent = await containsSolid(stepB.mesh, parentB);
  const hybridPresent = await containsSolid(stepB.mesh, physical);
  if (!parentAPresent || !parentBPresent || !hybridPresent) {
    return {
      ...base,
      status: "unresolved",
      connectorConditionStatus: "closed",
      connectorConditionReason: "",
      derivedConnector: oriented,
      stepAStatus: "ready",
      stepBStatus: "ready",
      unionStatus: "ready",
      kernelStatus: "NoError",
      parentAPresent,
      hybridPresent,
      parentBPresent,
      reason: "participant-missing",
    };
  }
  return {
    ...base,
    status: "ready",
    connectorConditionStatus: "closed",
    connectorConditionReason: "",
    derivedConnector: physical,
    additionGeometry: stepB.mesh,
    unionStatus: "ready",
    kernelStatus: "NoError",
    reason: "",
    unitedPieceCount: 3,
    parentAPresent: true,
    hybridPresent: true,
    parentBPresent: true,
    stepAStatus: "ready",
    stepBStatus: "ready",
    overlapVolumeA: gate.volumeA,
    overlapVolumeB: gate.volumeB,
    debugHybrid: physical,
    debugOverlapA: gate.meshA,
    debugOverlapB: gate.meshB,
  };
}

function joinReady(attempt: BooleanConnectionExecution) {
  return attempt.status === "ready" && !!attempt.additionGeometry && attempt.parentAPresent && attempt.hybridPresent && attempt.parentBPresent;
}

function failureReason(attempt: BooleanConnectionExecution) {
  const minimum = BOOLEAN_EXECUTION_SETTINGS.minimumOverlapVolume;
  const missing: string[] = [];
  if (attempt.overlapVolumeA !== null && attempt.overlapVolumeA < minimum) missing.push("NO A-SIDE OVERLAP");
  if (attempt.overlapVolumeB !== null && attempt.overlapVolumeB < minimum) missing.push("NO B-SIDE OVERLAP");
  if (missing.length > 0) return missing.join(" · ");
  if (attempt.reason.includes("components:") && !attempt.reason.includes("components:1")) return "MULTIPLE COMPONENTS AFTER UNION";
  if (attempt.joinStrategy === "LOCAL TRANSITION" || attempt.joinStrategy === "LOCAL REMESH") return attempt.reason || "TRANSITION UNION FAILED";
  return attempt.reason || "DIRECT UNION FAILED";
}

export type SurfaceAttachment = {
  mesh: IsoMesh;
  distanceA: number;
  distanceB: number;
  hitsA: Vec3[];
  hitsB: Vec3[];
  visibleA: Vec3;
  visibleB: Vec3;
  physicalA: Vec3;
  physicalB: Vec3;
};

const SURFACE_REACH = 1;

/**
 * Copies a connector and moves each end onto the parent mesh.
 * The search starts at the visible end and travels along the inward face normal.
 * The registration plane is only the direction. The displayed mesh is not written.
 */
export function attachPhysicalHybrid(
  mesh: IsoMesh,
  inwardA: Vec3 | null,
  inwardB: Vec3 | null,
  parentA: IsoMesh,
  parentB: IsoMesh,
  penetrationA: number,
  penetrationB: number,
): SurfaceAttachment | null {
  const directionA = unit(inwardA);
  const directionB = unit(inwardB);
  if (!directionA || !directionB) return null;
  const ends = endVertices(mesh, directionA, directionB);
  if (!ends) return null;
  const positions = Float32Array.from(mesh.positions);
  const seatedA = seatEnd(positions, ends.a, directionA, parentA, penetrationA);
  const seatedB = seatEnd(positions, ends.b, directionB, parentB, penetrationB);
  if (!seatedA || !seatedB) return null;
  return {
    mesh: {
      positions,
      normals: Float32Array.from(mesh.normals),
      indices: Uint32Array.from(mesh.indices),
      triangles: mesh.triangles,
    },
    distanceA: seatedA.distance,
    distanceB: seatedB.distance,
    hitsA: seatedA.hits,
    hitsB: seatedB.hits,
    visibleA: seatedA.visible,
    visibleB: seatedB.visible,
    physicalA: seatedA.physical,
    physicalB: seatedB.physical,
  };
}

function seatEnd(positions: Float32Array, indices: number[], inward: Vec3, parent: IsoMesh, penetration: number) {
  const found = indices.map((index) => localSurface(readVec(positions, index * 3), inward, parent));
  const known = found.flatMap((item) => (item ? [item.distance] : []));
  if (known.length === 0) return null;
  const fill = median(known);
  const hits: Vec3[] = [];
  let visible = { x: 0, y: 0, z: 0 };
  let physical = { x: 0, y: 0, z: 0 };
  let distance = 0;
  for (let sample = 0; sample < indices.length; sample += 1) {
    const index = indices[sample] ?? 0;
    const steps = HYBRID_GENERATOR_SETTINGS.loftSteps;
    const station = Math.floor(index / PROFILE_SAMPLES);
    if (index < PROFILE_SAMPLES * steps && station >= 2 && station <= steps - 3) continue;
    const point = readVec(positions, index * 3);
    const surface = found[sample];
    const hit = surface?.hit ?? add(point, scale(inward, fill));
    const travel = surface?.distance ?? fill;
    const placed = add(hit, scale(inward, penetration));
    writeVec(positions, index * 3, placed);
    hits.push(hit);
    visible = add(visible, point);
    physical = add(physical, placed);
    distance += travel;
  }
  const count = indices.length;
  return {
    hits,
    distance: distance / count,
    visible: scale(visible, 1 / count),
    physical: scale(physical, 1 / count),
  };
}

function endVertices(mesh: IsoMesh, inwardA: Vec3, inwardB: Vec3) {
  const sampleCount = connectorSampleCount(mesh);
  const steps = HYBRID_GENERATOR_SETTINGS.loftSteps;
  if (sampleCount >= 3) {
    const start: number[] = [];
    const end: number[] = [];
    for (let sample = 0; sample < sampleCount; sample += 1) {
      start.push(sample);
      end.push((steps - 1) * sampleCount + sample);
    }
    const startDot = dot(centroid(mesh, start), inwardA);
    const endDot = dot(centroid(mesh, end), inwardA);
    return startDot >= endDot ? { a: start, b: end } : { a: end, b: start };
  }
  const vertexCount = mesh.positions.length / 3;
  if (vertexCount < 6) return null;
  let maxA = -Infinity;
  let maxB = -Infinity;
  const dotsA: number[] = [];
  const dotsB: number[] = [];
  for (let index = 0; index < vertexCount; index += 1) {
    const point = atPoint(mesh, index);
    const towardA = dot(point, inwardA);
    const towardB = dot(point, inwardB);
    dotsA.push(towardA);
    dotsB.push(towardB);
    if (towardA > maxA) maxA = towardA;
    if (towardB > maxB) maxB = towardB;
  }
  const a: number[] = [];
  const b: number[] = [];
  for (let index = 0; index < vertexCount; index += 1) {
    if (maxA - (dotsA[index] ?? -Infinity) <= 0.02) a.push(index);
    if (maxB - (dotsB[index] ?? -Infinity) <= 0.02) b.push(index);
  }
  if (a.length < 3 || b.length < 3) return null;
  return { a, b };
}

function localSurface(point: Vec3, inward: Vec3, parent: IsoMesh) {
  if (pointInside(point, parent)) return { hit: point, distance: 0 };
  const ahead = rayHits(point, inward, parent, 1).find((value) => value <= SURFACE_REACH);
  if (ahead !== undefined) return { hit: add(point, scale(inward, ahead)), distance: ahead };
  const behind = rayHits(point, scale(inward, -1), parent, 1).find((value) => value <= 0.5);
  if (behind !== undefined) return { hit: add(point, scale(inward, -behind)), distance: 0 };
  let best: Vec3 | null = null;
  let bestScore = Infinity;
  for (let index = 0; index < parent.indices.length; index += 3) {
    const hit = closestOnTriangle(
      point,
      atPoint(parent, parent.indices[index] ?? 0),
      atPoint(parent, parent.indices[index + 1] ?? 0),
      atPoint(parent, parent.indices[index + 2] ?? 0),
    );
    const delta = sub(hit, point);
    const along = dot(delta, inward);
    if (along < -0.02 || along > SURFACE_REACH) continue;
    const lateral = length(sub(delta, scale(inward, along)));
    if (lateral > 0.4) continue;
    const score = along + lateral * 2;
    if (score < bestScore) {
      bestScore = score;
      best = hit;
    }
  }
  if (!best) return null;
  return { hit: best, distance: Math.max(0, dot(sub(best, point), inward)) };
}

function pointInside(point: Vec3, parent: IsoMesh) {
  if (!closedSolid(parent)) return false;
  return rayHits(point, { x: 1, y: 0, z: 0 }, parent, 64).length % 2 === 1;
}

const closedSolids = new WeakMap<IsoMesh, boolean>();

function closedSolid(mesh: IsoMesh) {
  const cached = closedSolids.get(mesh);
  if (cached !== undefined) return cached;
  const closed = diagnoseTopology(mesh).boundaryEdgeCount === 0;
  closedSolids.set(mesh, closed);
  return closed;
}

function closestOnTriangle(point: Vec3, a: Vec3, b: Vec3, c: Vec3) {
  const ab = sub(b, a);
  const ac = sub(c, a);
  const ap = sub(point, a);
  const d1 = dot(ab, ap);
  const d2 = dot(ac, ap);
  if (d1 <= 0 && d2 <= 0) return a;
  const bp = sub(point, b);
  const d3 = dot(ab, bp);
  const d4 = dot(ac, bp);
  if (d3 >= 0 && d4 <= d3) return b;
  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) return add(a, scale(ab, d1 / (d1 - d3)));
  const cp = sub(point, c);
  const d5 = dot(ab, cp);
  const d6 = dot(ac, cp);
  if (d6 >= 0 && d5 <= d6) return c;
  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) return add(a, scale(ac, d2 / (d2 - d6)));
  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) return add(b, scale(sub(c, b), (d4 - d3) / ((d4 - d3) + (d5 - d6))));
  const denom = 1 / (va + vb + vc);
  return add(a, add(scale(ab, vb * denom), scale(ac, vc * denom)));
}

export function markerCloud(points: readonly Vec3[]) {
  if (points.length === 0) return null;
  const positions: number[] = [];
  const indices: number[] = [];
  const radius = 0.035;
  for (const point of points) {
    const base = positions.length / 3;
    positions.push(
      point.x, point.y - radius, point.z,
      point.x, point.y + radius, point.z,
      point.x - radius, point.y, point.z,
      point.x + radius, point.y, point.z,
      point.x, point.y, point.z - radius,
      point.x, point.y, point.z + radius,
    );
    const corners: Array<[number, number, number]> = [
      [0, 2, 4], [0, 4, 3], [0, 3, 5], [0, 5, 2],
      [1, 4, 2], [1, 3, 4], [1, 5, 3], [1, 2, 5],
    ];
    for (const [i, j, k] of corners) indices.push(base + i, base + j, base + k);
  }
  const buffer = Uint32Array.from(indices);
  return {
    positions: Float32Array.from(positions),
    normals: new Float32Array(positions.length),
    indices: buffer,
    triangles: buffer.length / 3,
  };
}

function centroid(mesh: IsoMesh, indices: number[]) {
  let sum = { x: 0, y: 0, z: 0 };
  for (const index of indices) sum = add(sum, atPoint(mesh, index));
  return scale(sum, 1 / indices.length);
}

function unit(vector: Vec3 | null) {
  if (!vector) return null;
  const span = length(vector);
  if (span < 1e-8) return null;
  return scale(vector, 1 / span);
}

export function inwardSurfaceDistance(origin: Vec3, inward: Vec3, mesh: IsoMesh) {
  const direction = unit(inward);
  if (!direction) return null;
  return rayHits(origin, direction, mesh, 1).find((value) => value > 1e-4 && value <= SURFACE_REACH) ?? null;
}

function offsetEnds(
  mesh: IsoMesh,
  sampleCount: number,
  steps: number,
  inwardA: Vec3 | null,
  inwardB: Vec3 | null,
  depth: number,
) {
  if (!inwardA || !inwardB || sampleCount < 3) return null;
  return seatLoftEnds(mesh, sampleCount, steps, inwardA, inwardB, Array(sampleCount).fill(depth), Array(sampleCount).fill(depth));
}

function nudgeEnds(mesh: IsoMesh, sampleCount: number, steps: number, inwardA: Vec3 | null, inwardB: Vec3 | null) {
  if (!inwardA || !inwardB) return null;
  const shifted = offsetEnds(mesh, sampleCount, steps, unitPerp(inwardA), unitPerp(inwardB), 0.004);
  return shifted;
}

async function joinWithTransitions(
  connection: BooleanConnectionPlan,
  parentA: IsoMesh,
  parentB: IsoMesh,
  sampleCount: number,
  steps: number,
  openMesh: IsoMesh,
  sourceOpen: boolean,
  strategy: JoinStrategy,
): Promise<BooleanConnectionExecution> {
  const prepared = await prepareClosedHybrid(connection, openMesh, sampleCount, steps, sourceOpen, strategy);
  if (prepared.kind === "failed") return prepared.result;
  const hybrid = prepared.mesh;
  const bridgeA = await seatedBridge(ringPoints(openMesh, 0, sampleCount), connection.inwardA, parentA, hybrid);
  const bridgeB = await seatedBridge(ringPoints(openMesh, steps - 1, sampleCount), connection.inwardB, parentB, hybrid);
  const base = prepared.base;
  base.penetrationA = bridgeA?.depth ?? base.penetrationA;
  base.penetrationB = bridgeB?.depth ?? base.penetrationB;
  base.overlapExtension = Math.max(base.penetrationA ?? 0, base.penetrationB ?? 0);
  if (!bridgeA || !bridgeB) {
    return { ...base, status: "unresolved", connectorConditionStatus: "closed", derivedConnector: hybrid, reason: !bridgeA ? "NO A-SIDE OVERLAP" : "NO B-SIDE OVERLAP" };
  }
  base.overlapVolumeA = bridgeA?.parentOverlap ?? null;
  base.overlapVolumeB = bridgeB?.parentOverlap ?? null;
  const minimum = BOOLEAN_EXECUTION_SETTINGS.minimumOverlapVolume;
  if (!bridgeA || !bridgeB || bridgeA.parentOverlap < minimum || bridgeB.parentOverlap < minimum) {
    return { ...base, status: "unresolved", connectorConditionStatus: "closed", derivedConnector: hybrid, reason: failureReason({ ...base, status: "unresolved", reason: "" } as BooleanConnectionExecution) };
  }
  const chain = await unionChain([parentA, bridgeA.mesh, hybrid, bridgeB.mesh, parentB]);
  if (!chain.mesh) {
    return {
      ...base,
      status: "unresolved",
      connectorConditionStatus: "closed",
      derivedConnector: hybrid,
      unionStatus: chain.status,
      kernelStatus: chain.kernelStatus,
      reason: "TRANSITION UNION FAILED",
    };
  }
  return acceptUnion(base, chain.mesh, parentA, parentB, hybrid, "TRANSITION UNION FAILED");
}

async function prepareClosedHybrid(
  connection: BooleanConnectionPlan,
  openMesh: IsoMesh,
  sampleCount: number,
  steps: number,
  sourceOpen: boolean,
  strategy: JoinStrategy,
): Promise<{ kind: "ready"; mesh: IsoMesh; base: BooleanConnectionExecution } | { kind: "failed"; result: BooleanConnectionExecution }> {
  const base: BooleanConnectionExecution = {
    connectionId: connection.connectionId,
    candidateId: connection.candidateId,
    status: "unresolved",
    connectorGeometry: connection.connectorGeometry,
    connectorSourceOpen: sourceOpen,
    connectorConditionStatus: "not-run",
    connectorConditionReason: "",
    derivedConnector: null,
    additionGeometry: null,
    unionStatus: "not-run",
    kernelStatus: null,
    reason: "",
    unitedPieceCount: 0,
    overlapExtension: 0,
    penetrationA: null,
    penetrationB: null,
    radialExtension: 0,
    overlapVolumeA: null,
    overlapVolumeB: null,
    surfaceDistanceA: null,
    surfaceDistanceB: null,
    debugHybrid: null,
    debugOverlapA: null,
    debugOverlapB: null,
    debugSurfaceA: null,
    debugSurfaceB: null,
    parentAPresent: false,
    hybridPresent: false,
    parentBPresent: false,
    stepAStatus: "not-run",
    stepBStatus: "not-run",
    joinStrategy: strategy,
  };
  const closed = sealConnector(openMesh, sampleCount, steps);
  if (closed.status !== "ready" || !closed.mesh) {
    return { kind: "failed", result: { ...base, connectorConditionStatus: "failed", connectorConditionReason: closed.reason, reason: closed.reason } };
  }
  const volume = await booleanVolume(closed.mesh);
  const oriented = volume !== null && volume < 0 ? flipWinding(closed.mesh) : closed.mesh;
  const resolved = await kernelCopy(oriented);
  if (!resolved) {
    return { kind: "failed", result: { ...base, connectorConditionStatus: "failed", connectorConditionReason: "derived-connector", derivedConnector: oriented, reason: "derived-connector" } };
  }
  return { kind: "ready", mesh: resolved, base: { ...base, connectorConditionStatus: "closed", derivedConnector: resolved } };
}

async function acceptUnion(
  base: BooleanConnectionExecution,
  mesh: IsoMesh,
  parentA: IsoMesh,
  parentB: IsoMesh,
  hybrid: IsoMesh,
  unionFailure: string,
): Promise<BooleanConnectionExecution> {
  const topology = diagnoseTopology(mesh);
  const readiness = await evaluateBooleanReadiness(mesh);
  if (topology.componentCount !== 1 || topology.boundaryEdgeCount !== 0 || !readiness.booleanReady || readiness.kernelStatus !== "NoError") {
    const reason = topology.componentCount !== 1 ? "MULTIPLE COMPONENTS AFTER UNION" : unionFailure;
    return {
      ...base,
      status: "unresolved",
      additionGeometry: null,
      unionStatus: "ready",
      kernelStatus: (readiness.kernelStatus as ErrorStatus | null),
      debugHybrid: hybrid,
      reason: `${reason}:components:${topology.componentCount};boundary:${topology.boundaryEdgeCount}`,
    };
  }
  const parentAPresent = await containsSolid(mesh, parentA);
  const parentBPresent = await containsSolid(mesh, parentB);
  const hybridPresent = await containsSolid(mesh, hybrid);
  if (!parentAPresent || !parentBPresent || !hybridPresent) {
    return { ...base, status: "unresolved", unionStatus: "ready", kernelStatus: "NoError", parentAPresent, hybridPresent, parentBPresent, reason: "participant-missing" };
  }
  return {
    ...base,
    status: "ready",
    additionGeometry: mesh,
    unionStatus: "ready",
    kernelStatus: "NoError",
    reason: "",
    unitedPieceCount: 3,
    parentAPresent: true,
    hybridPresent: true,
    parentBPresent: true,
    stepAStatus: "ready",
    stepBStatus: "ready",
    debugHybrid: hybrid,
  };
}

async function unionChain(pieces: IsoMesh[]) {
  let acc = pieces[0] ?? null;
  let status: BooleanAdapterStatus | "not-run" = "not-run";
  let kernelStatus: ErrorStatus | null = null;
  for (let index = 1; index < pieces.length; index += 1) {
    const piece = pieces[index];
    if (!acc || !piece) return { mesh: null, status, kernelStatus };
    const step = await booleanUnion(acc, piece);
    status = step.status;
    kernelStatus = step.kernelStatus;
    if (!unionOk(step) || !step.mesh) return { mesh: null, status, kernelStatus };
    acc = step.mesh;
  }
  return { mesh: acc, status, kernelStatus };
}

async function seatedBridge(ring: Vec3[], inward: Vec3 | null, parent: IsoMesh, hybrid: IsoMesh) {
  const minimum = BOOLEAN_EXECUTION_SETTINGS.minimumOverlapVolume;
  for (const back of [0.04, 0.08, 0.12]) {
    const bridge = bridgeRing(ring, inward, parent, back);
    if (!bridge) continue;
    const volume = await booleanVolume(bridge.mesh);
    const mesh = volume !== null && volume < 0 ? flipWinding(bridge.mesh) : bridge.mesh;
    const parentOverlap = await overlapVolume(parent, mesh);
    const hybridOverlap = await overlapVolume(hybrid, mesh);
    if (parentOverlap >= minimum && hybridOverlap >= minimum) return { mesh, depth: bridge.depth, parentOverlap, hybridOverlap };
  }
  return null;
}

function bridgeRing(ring: Vec3[], inward: Vec3 | null, parent: IsoMesh, back: number) {
  if (!inward || ring.length < 3) return null;
  const extra = 0.04;
  const outer = ring.map((point) => add(point, scale(inward, -back)));
  const distances = outer.map((point) => firstHit(point, inward, parent) ?? firstHit(add(point, scale(inward, -0.5)), inward, parent));
  const known = distances.filter((value): value is number => value !== null && value > 0);
  if (known.length === 0) return null;
  const fill = median(known);
  const inner = outer.map((point, index) => add(point, scale(inward, (distances[index] ?? fill) + extra)));
  return { mesh: loftRings(outer, inner, inward), depth: fill + extra };
}

function firstHit(origin: Vec3, direction: Vec3, mesh: IsoMesh) {
  const hits = rayHits(origin, direction, mesh, 1);
  return hits.length > 0 && hits[0] < 1.5 ? hits[0] : null;
}

function loftRings(outer: readonly Vec3[], inner: readonly Vec3[], inward: Vec3): IsoMesh {
  const count = outer.length;
  const positions: number[] = [];
  for (const point of outer) positions.push(point.x, point.y, point.z);
  for (const point of inner) positions.push(point.x, point.y, point.z);
  const indices: number[] = [];
  for (let sample = 1; sample < count - 1; sample += 1) {
    indices.push(0, sample, sample + 1, count, count + sample + 1, count + sample);
  }
  for (let sample = 0; sample < count; sample += 1) {
    const next = (sample + 1) % count;
    indices.push(sample, count + next, next, sample, count + sample, count + next);
  }
  const normals = new Float32Array(positions.length);
  for (let sample = 0; sample < count; sample += 1) {
    writeVec(normals, sample * 3, scale(inward, -1));
    writeVec(normals, (count + sample) * 3, inward);
  }
  const indexBuffer = Uint32Array.from(indices);
  return { positions: Float32Array.from(positions), normals, indices: indexBuffer, triangles: indexBuffer.length / 3 };
}

async function kernelCopy(mesh: IsoMesh) {
  const probe = await isoMeshToBooleanMesh(mesh);
  const copy = probe.mesh ? await booleanMeshToIsoMesh(probe.mesh) : null;
  probe.mesh?.release();
  return copy?.status === "ready" && copy.mesh ? copy.mesh : null;
}

async function overlapVolume(parent: IsoMesh, piece: IsoMesh) {
  const hit = await booleanIntersection(parent, piece);
  return hit.mesh ? Math.abs(await booleanVolume(hit.mesh) ?? 0) : 0;
}

function unitPerp(direction: Vec3): Vec3 {
  const axis = Math.abs(direction.y) < 0.9 ? { x: 0, y: 1, z: 0 } : { x: 1, y: 0, z: 0 };
  const crossed = cross(direction, axis);
  const span = length(crossed) || 1;
  return scale(crossed, 1 / span);
}

function add(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

function scale(vector: Vec3, factor: number): Vec3 {
  return { x: vector.x * factor, y: vector.y * factor, z: vector.z * factor };
}

function length(vector: Vec3) {
  return Math.hypot(vector.x, vector.y, vector.z);
}

async function overlapGate(parentA: IsoMesh, parentB: IsoMesh, hybrid: IsoMesh) {
  const hitA = await booleanIntersection(parentA, hybrid);
  const hitB = await booleanIntersection(parentB, hybrid);
  const volumeA = hitA.mesh ? Math.abs(await booleanVolume(hitA.mesh) ?? 0) : 0;
  const volumeB = hitB.mesh ? Math.abs(await booleanVolume(hitB.mesh) ?? 0) : 0;
  const minimum = BOOLEAN_EXECUTION_SETTINGS.minimumOverlapVolume;
  return {
    accepted: volumeA >= minimum && volumeB >= minimum,
    volumeA,
    volumeB,
    meshA: hitA.mesh,
    meshB: hitB.mesh,
  };
}

async function unionAssembly(
  plan: BooleanAssemblyPlan,
  tiles: BooleanTileExecution[],
  connections: BooleanConnectionExecution[],
): Promise<BooleanAssemblyExecution> {
  const required = connections.filter((item) => plan.connections.find((planItem) => planItem.connectionId === item.connectionId)?.status === "ready");
  const empty = (reason: string, partCount = required.length): BooleanAssemblyExecution => ({
    status: "unresolved",
    mesh: null,
    kernelStatus: null,
    reason,
    partCount,
    unitedPartCount: 0,
    componentCount: null,
    boundaryEdgeCount: null,
  });
  if (plan.connections.length === 0 || plan.connections.some((item) => item.status !== "ready")) {
    return empty(plan.connections.length === 0 ? "no-ready-connections" : "plan-incomplete", plan.connections.length);
  }
  if (required.length !== plan.connections.length || required.some((item) => item.status !== "ready" || !item.additionGeometry || !item.derivedConnector || !item.parentAPresent || !item.hybridPresent || !item.parentBPresent)) {
    return empty("connection-unresolved");
  }
  const included = new Set<string>();
  let acc: IsoMesh | null = null;
  let united = 0;
  for (const connection of required) {
    const planItem = plan.connections.find((item) => item.connectionId === connection.connectionId);
    const hybrid = connection.derivedConnector;
    const result = connection.additionGeometry;
    if (!planItem?.tileAId || !planItem.tileBId || !hybrid || !result) return empty("missing-participant", required.length);
    if (!acc) {
      acc = result;
      included.add(planItem.tileAId);
      included.add(planItem.tileBId);
      united = 3;
      continue;
    }
    const withHybrid = await booleanUnion(acc, hybrid);
    if (!unionOk(withHybrid) || !withHybrid.mesh) return empty(`assembly-hybrid:${withHybrid.reason || withHybrid.status}`, required.length);
    acc = withHybrid.mesh;
    united += 1;
    for (const tileId of [planItem.tileAId, planItem.tileBId]) {
      if (included.has(tileId)) continue;
      const parent = tiles.find((tile) => tile.tileId === tileId)?.derivedGeometry;
      if (!parent) return empty("parent-missing-at-assembly", required.length);
      const withParent = await booleanUnion(acc, parent);
      if (!unionOk(withParent) || !withParent.mesh) return empty(`assembly-parent:${withParent.reason || withParent.status}`, required.length);
      acc = withParent.mesh;
      included.add(tileId);
      united += 1;
    }
  }
  if (!acc) return empty("no-derived-parts", required.length);
  const topology = diagnoseTopology(acc);
  const readiness = await evaluateBooleanReadiness(acc);
  if (topology.componentCount !== 1 || topology.boundaryEdgeCount !== 0 || !readiness.booleanReady || readiness.kernelStatus !== "NoError") {
    return {
      status: "unresolved",
      mesh: null,
      kernelStatus: (readiness.kernelStatus as ErrorStatus | null),
      reason: `assembly-topology:components:${topology.componentCount};boundary:${topology.boundaryEdgeCount}`,
      partCount: required.length,
      unitedPartCount: 0,
      componentCount: topology.componentCount,
      boundaryEdgeCount: topology.boundaryEdgeCount,
    };
  }
  for (const connection of required) {
    const planItem = plan.connections.find((item) => item.connectionId === connection.connectionId);
    const parentA = tiles.find((tile) => tile.tileId === planItem?.tileAId)?.derivedGeometry;
    const parentB = tiles.find((tile) => tile.tileId === planItem?.tileBId)?.derivedGeometry;
    if (!parentA || !parentB || !connection.derivedConnector) return empty("participant-missing", required.length);
    const present = await containsSolid(acc, parentA) && await containsSolid(acc, parentB) && await containsSolid(acc, connection.derivedConnector);
    if (!present) return empty("participant-missing", required.length);
  }
  return {
    status: "ready",
    mesh: acc,
    kernelStatus: "NoError",
    reason: "",
    partCount: required.length,
    unitedPartCount: united,
    componentCount: topology.componentCount,
    boundaryEdgeCount: topology.boundaryEdgeCount,
  };
}

function overallStatus(
  connections: BooleanConnectionExecution[],
  assembly: BooleanAssemblyExecution,
  plan: BooleanAssemblyPlan,
): BooleanExecutionStatus {
  if (plan.connections.length === 0 || plan.connections.some((item) => item.status !== "ready")) return "unresolved";
  const required = connections.filter((item) => plan.connections.some((planItem) => planItem.connectionId === item.connectionId));
  if (required.length !== plan.connections.length) return "unresolved";
  const complete = required.every((item) => item.status === "ready" && item.parentAPresent && item.hybridPresent && item.parentBPresent && item.unitedPieceCount === 3);
  if (complete && assembly.status === "ready" && assembly.kernelStatus === "NoError" && assembly.componentCount === 1 && assembly.boundaryEdgeCount === 0 && assembly.mesh) {
    return "ready";
  }
  return "unresolved";
}

async function containsSolid(container: IsoMesh, part: IsoMesh) {
  const ratio = await containedVolumeRatio(container, part);
  return ratio !== null && ratio >= BOOLEAN_EXECUTION_SETTINGS.containedRatio;
}

function unionOk(result: { status: BooleanAdapterStatus; kernelStatus: ErrorStatus | null; mesh: IsoMesh | null }) {
  return result.status === "ready" && result.kernelStatus === "NoError" && !!result.mesh && !derivedProblem(result.mesh);
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

function translate(vector: Vec3, shift: Vec3): Vec3 {
  return { x: vector.x + shift.x, y: vector.y + shift.y, z: vector.z + shift.z };
}

function ringPoints(mesh: IsoMesh, ring: number, sampleCount: number) {
  const points: Vec3[] = [];
  for (let sample = 0; sample < sampleCount; sample += 1) {
    const offset = (ring * sampleCount + sample) * 3;
    points.push({ x: mesh.positions[offset], y: mesh.positions[offset + 1], z: mesh.positions[offset + 2] });
  }
  return points;
}

function median(values: number[]) {
  const ordered = [...values].sort((a, b) => a - b);
  const mid = Math.floor(ordered.length / 2);
  return ordered.length % 2 === 1 ? ordered[mid] : (ordered[mid - 1] + ordered[mid]) / 2;
}

function rayHits(origin: Vec3, direction: Vec3, mesh: IsoMesh, limit: number) {
  const found: number[] = [];
  for (let index = 0; index < mesh.indices.length; index += 3) {
    const a = atPoint(mesh, mesh.indices[index]);
    const b = atPoint(mesh, mesh.indices[index + 1]);
    const c = atPoint(mesh, mesh.indices[index + 2]);
    const edge1 = sub(b, a);
    const edge2 = sub(c, a);
    const pvec = cross(direction, edge2);
    const det = dot(edge1, pvec);
    if (Math.abs(det) < 1e-12) continue;
    const inv = 1 / det;
    const tvec = sub(origin, a);
    const u = dot(tvec, pvec) * inv;
    if (u < 0 || u > 1) continue;
    const qvec = cross(tvec, edge1);
    const v = dot(direction, qvec) * inv;
    if (v < 0 || u + v > 1) continue;
    const t = dot(edge2, qvec) * inv;
    if (t > 1e-5) found.push(t);
  }
  found.sort((left, right) => left - right);
  const unique: number[] = [];
  for (const value of found) {
    if (unique.length === 0 || value - unique[unique.length - 1] > 1e-4) unique.push(value);
    if (unique.length >= limit) break;
  }
  return unique;
}

function atPoint(mesh: IsoMesh, index: number): Vec3 {
  return { x: mesh.positions[index * 3], y: mesh.positions[index * 3 + 1], z: mesh.positions[index * 3 + 2] };
}

function sub(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

function dot(a: Vec3, b: Vec3) {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return { x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x };
}

function flipWinding(mesh: IsoMesh): IsoMesh {
  const indices = Uint32Array.from(mesh.indices);
  for (let index = 0; index < indices.length; index += 3) {
    const swap = indices[index + 1];
    indices[index + 1] = indices[index + 2];
    indices[index + 2] = swap;
  }
  const normals = new Float32Array(mesh.normals.length);
  for (let index = 0; index < mesh.normals.length; index += 1) normals[index] = -(mesh.normals[index] ?? 0);
  return {
    positions: Float32Array.from(mesh.positions),
    normals,
    indices,
    triangles: mesh.triangles,
  };
}

function sealConnector(mesh: IsoMesh, sampleCount: number, steps: number) {
  const closed = closeConnectorLoft(mesh, sampleCount, steps);
  if (closed.status === "ready" && closed.mesh) return closed;
  const topology = diagnoseTopology(mesh);
  if (topology.closed && topology.boundaryEdgeCount === 0 && topology.componentCount >= 1) {
    return { status: "ready" as const, mesh, reason: "" };
  }
  return closed;
}

function connectorSampleCount(mesh: IsoMesh) {
  const steps = HYBRID_GENERATOR_SETTINGS.loftSteps;
  const vertexCount = mesh.positions.length / 3;
  const sampleCount = vertexCount / steps;
  if (sampleCount < 3) return 0;
  if (mesh.triangles !== 2 * sampleCount * (steps - 1)) return 0;
  return sampleCount;
}

function compareId(left: string, right: string) {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}
