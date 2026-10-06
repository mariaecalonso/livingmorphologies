import { FACE_IDS, SKILL4_MODULE_CONTRACT, registrationEnvelope, VIEW_SCAN, type FaceId, type Vec3 } from "./contract";
import { resolveTileModule, type TileInstance } from "./tiles";
import type { ModuleHandoff } from "./adapt";
import { CANDIDATE_FIELD_SETTINGS, type CandidateField } from "./candidate-field";
import { FACE_SAMPLE_SETTINGS } from "./face-sample";
import { HYBRID_GENERATOR_SETTINGS } from "./hybrid-generator";

/**
 * Gap, in registration units, that still counts as face contact.
 * 1e-4 is far below one field cell (the plan envelope is 20 cells wide).
 */
export const ADJACENCY_TOLERANCE = 1e-4;

export const SKILL4_CONNECTION_CONTRACT = "skill4-connection-v1" as const;

export const CONNECTION_GENERATION_SETTINGS = {
  contract: SKILL4_CONNECTION_CONTRACT,
  moduleContract: SKILL4_MODULE_CONTRACT,
  status: "not-generated",
  faceAnalysis: FACE_SAMPLE_SETTINGS.version,
  candidateField: CANDIDATE_FIELD_SETTINGS.version,
  hybridGenerator: HYBRID_GENERATOR_SETTINGS.version,
} as const;

export type ConnectionOrigin = "detected" | "explicit";
export type GenerationStatus = "not-generated";
export type FaceSelection = "suggested" | "user";

export type TileConnection = {
  id: string;
  tileAId: string;
  tileBId: string;
  faceA: FaceId;
  faceB: FaceId;
  origin: ConnectionOrigin;
  generationStatus: GenerationStatus;
  faceSelection: FaceSelection;
  inputsChanged: boolean;
  signature: string;
  candidateField: CandidateField | null;
  selectedMockId: string;
};

type Axis = "x" | "y" | "z";

type Bounds = { min: Vec3; max: Vec3 };

const AXES: Axis[] = ["x", "y", "z"];

export function tileBounds(
  tile: TileInstance,
  registration = registrationEnvelope(VIEW_SCAN.spacing, VIEW_SCAN.yaw),
): Bounds {
  return {
    min: {
      x: registration.min.x + tile.transform.x,
      y: registration.min.y + tile.transform.y,
      z: registration.min.z + tile.transform.z,
    },
    max: {
      x: registration.max.x + tile.transform.x,
      y: registration.max.y + tile.transform.y,
      z: registration.max.z + tile.transform.z,
    },
  };
}

function overlap(a0: number, a1: number, b0: number, b1: number) {
  return Math.min(a1, b1) - Math.max(a0, b0);
}

function suggestedFaces(axis: Axis, a: Bounds, b: Bounds): { faceA: FaceId; faceB: FaceId } {
  if (axis === "x") {
    return a.max.x <= b.min.x + ADJACENCY_TOLERANCE
      ? { faceA: "E", faceB: "W" }
      : { faceA: "W", faceB: "E" };
  }
  if (axis === "z") {
    return a.max.z <= b.min.z + ADJACENCY_TOLERANCE
      ? { faceA: "N", faceB: "S" }
      : { faceA: "S", faceB: "N" };
  }
  return a.max.y <= b.min.y + ADJACENCY_TOLERANCE
    ? { faceA: "T", faceB: "B" }
    : { faceA: "B", faceB: "T" };
}

export function connectionId(tileAId: string, tileBId: string) {
  return `connection:${tileAId}:${tileBId}`;
}

export type DetectedAdjacency = {
  id: string;
  tileAId: string;
  tileBId: string;
  faceA: FaceId;
  faceB: FaceId;
  marker: Vec3;
};

/**
 * Face neighbors from transformed registration envelopes.
 * One axis may touch within ADJACENCY_TOLERANCE. The other two must overlap by more than that,
 * so edges and corners are not connections. A tile is not paired with itself.
 */
export function detectAdjacencies(tiles: readonly TileInstance[]): DetectedAdjacency[] {
  const found: DetectedAdjacency[] = [];
  for (let i = 0; i < tiles.length; i += 1) {
    for (let j = i + 1; j < tiles.length; j += 1) {
      const left = tiles[i];
      const right = tiles[j];
      if (left.instanceId === right.instanceId) continue;
      const [tileA, tileB] = left.instanceId < right.instanceId ? [left, right] : [right, left];
      const boxA = tileBounds(tileA);
      const boxB = tileBounds(tileB);
      const spans = {
        x: overlap(boxA.min.x, boxA.max.x, boxB.min.x, boxB.max.x),
        y: overlap(boxA.min.y, boxA.max.y, boxB.min.y, boxB.max.y),
        z: overlap(boxA.min.z, boxA.max.z, boxB.min.z, boxB.max.z),
      };
      const contact = AXES.filter((axis) => Math.abs(spans[axis]) <= ADJACENCY_TOLERANCE);
      const broad = AXES.filter((axis) => spans[axis] > ADJACENCY_TOLERANCE);
      if (contact.length !== 1 || broad.length !== 2) continue;
      const axis = contact[0];
      const faces = suggestedFaces(axis, boxA, boxB);
      found.push({
        id: connectionId(tileA.instanceId, tileB.instanceId),
        tileAId: tileA.instanceId,
        tileBId: tileB.instanceId,
        faceA: faces.faceA,
        faceB: faces.faceB,
        marker: contactMarker(boxA, boxB),
      });
    }
  }
  return found;
}

function contactMarker(a: Bounds, b: Bounds): Vec3 {
  const center = (axis: Axis) => {
    const start = Math.max(a.min[axis], b.min[axis]);
    const end = Math.min(a.max[axis], b.max[axis]);
    return (start + end) / 2;
  };
  return { x: center("x"), y: center("y"), z: center("z") };
}

function tileRecord(tiles: readonly TileInstance[], instanceId: string) {
  const tile = tiles.find((item) => item.instanceId === instanceId);
  if (!tile) throw new Error(`missing tile ${instanceId}`);
  return tile;
}

export function connectionInputSignature(
  connection: Pick<TileConnection, "tileAId" | "tileBId" | "faceA" | "faceB">,
  tiles: readonly TileInstance[],
  loaded: ReadonlyMap<string, ModuleHandoff>,
) {
  const ordered = [connection.tileAId, connection.tileBId]
    .map((instanceId) => {
      const tile = tileRecord(tiles, instanceId);
      const handoff = resolveTileModule(tile.archetypeId, loaded);
      const face = instanceId === connection.tileAId ? connection.faceA : connection.faceB;
      return {
        instanceId: tile.instanceId,
        archetypeId: tile.archetypeId,
        moduleId: handoff.moduleId,
        revision: handoff.revision,
        face,
      };
    })
    .sort((a, b) => (a.instanceId < b.instanceId ? -1 : 1));
  return JSON.stringify({
    contract: SKILL4_CONNECTION_CONTRACT,
    generation: CONNECTION_GENERATION_SETTINGS,
    faceAnalysis: FACE_SAMPLE_SETTINGS,
    candidateField: CANDIDATE_FIELD_SETTINGS,
    hybridGenerator: HYBRID_GENERATOR_SETTINGS,
    tiles: ordered,
  });
}

export function reconcileConnections(
  previous: readonly TileConnection[],
  tiles: readonly TileInstance[],
  loaded: ReadonlyMap<string, ModuleHandoff>,
): TileConnection[] {
  return detectAdjacencies(tiles).map((pair) => {
    const existing = previous.find((item) => item.id === pair.id);
    if (!existing) {
      const created: TileConnection = {
        id: pair.id,
        tileAId: pair.tileAId,
        tileBId: pair.tileBId,
        faceA: pair.faceA,
        faceB: pair.faceB,
        origin: "detected",
        generationStatus: "not-generated",
        faceSelection: "suggested",
        inputsChanged: false,
        signature: "",
        candidateField: null,
        selectedMockId: "H13",
      };
      created.signature = connectionInputSignature(created, tiles, loaded);
      return created;
    }
    const kept: TileConnection = {
      ...existing,
      faceA: existing.faceA,
      faceB: existing.faceB,
      origin: existing.origin,
      generationStatus: existing.generationStatus,
      faceSelection: existing.faceSelection,
      selectedMockId: existing.selectedMockId || "H13",
    };
    const signature = connectionInputSignature(kept, tiles, loaded);
    return {
      ...kept,
      signature,
      candidateField: existing.candidateField?.signature === signature ? existing.candidateField : null,
      inputsChanged: existing.inputsChanged || signature !== existing.signature,
    };
  });
}

export function connectionBlocked(
  connection: TileConnection,
  tiles: readonly TileInstance[],
  loaded: ReadonlyMap<string, ModuleHandoff>,
) {
  const tileA = tileRecord(tiles, connection.tileAId);
  const tileB = tileRecord(tiles, connection.tileBId);
  return resolveTileModule(tileA.archetypeId, loaded).status !== "ready"
    || resolveTileModule(tileB.archetypeId, loaded).status !== "ready";
}

export function connectionPairLabel(connection: Pick<TileConnection, "tileAId" | "tileBId" | "faceA" | "faceB">) {
  return `${connection.tileAId}:${connection.faceA} ↔ ${connection.tileBId}:${connection.faceB}`;
}

export function connectionSummaryLabel(connection: TileConnection, blocked: boolean) {
  const ready = connection.candidateField?.signature === connection.signature;
  const state = blocked
    ? "blocked · geometry unavailable"
    : ready
      ? "25 candidate inputs · geometry pending"
      : "pending hybrid";
  return `${connection.tileAId}:${connection.faceA} → ${state} → ${connection.tileBId}:${connection.faceB}`;
}

export function adjacencyMarker(tiles: readonly TileInstance[], connection: TileConnection) {
  return detectAdjacencies(tiles).find((item) => item.id === connection.id)?.marker ?? null;
}

export function isFaceId(value: string): value is FaceId {
  return (FACE_IDS as readonly string[]).includes(value);
}
