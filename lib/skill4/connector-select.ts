import type { ModuleHandoff } from "./adapt";
import { connectClusterHybrid } from "./cluster-hybrids";
import type { TileConnection } from "./connections";
import { attemptWasRecorded, recordHybridAttempt } from "./connection-pool";
import type { FaceId } from "./contract";
import type { TileInstance } from "./tiles";

/**
 * SOM-inspired parametric connector field.
 * A representative subset spans parent influence (columns) and transformation intensity (rows).
 * This is not a trained map and it is not an optimization process.
 */
export const CONNECTOR_FIELD_LABEL = "SOM-inspired parametric connector field";

/**
 * Research sampling of the 5 × 5 field. Used to explain the batches already stored.
 * New production connections do not use this wave.
 */
const REPRESENTATIVE_WAVE = ["H01", "H05", "H03", "H08", "H13", "H15", "H18", "H21", "H23", "H25"] as const;
/**
 * Production alternatives: equal parent influence (center column) at three transformation intensities.
 * H12 and H14 are not production candidates.
 */
const PRODUCTION_CONNECTORS = ["H08", "H13", "H18"] as const;
const EXTENDED_WAVE = ["H02", "H04", "H06", "H07", "H09", "H10", "H11", "H12", "H14", "H16", "H17", "H19", "H20", "H22", "H24"] as const;

function readyScore(connection: TileConnection, id: string, separation: number) {
  const field = connection.generatedHybridField;
  const candidate = field?.candidates.find((item) => item.candidateId === id);
  if (!candidate || candidate.status !== "ready" || !candidate.geometry || candidate.geometry.triangles < 8) return -1;
  const index = Math.max(0, Number(id.replace(/\D/g, "")) - 1);
  const row = Math.floor(index / 5);
  const column = index % 5;
  const wantedRow = separation > 34 ? 3 : separation > 28 ? 2 : separation > 22 ? 1 : 0;
  const rowFit = 1 - Math.min(1, Math.abs(row - wantedRow) / 4);
  const balance = 1 - Math.min(1, Math.abs(column - 2) / 2);
  const correspondence = candidate.sectionReport?.correspondence === "YES" ? 0.35 : 0;
  return candidate.geometry.triangles / 20000 + rowFit * 0.55 + balance * 0.35 + correspondence;
}

export function selectConnectorId(connection: TileConnection, separation: number) {
  const ids = connection.generatedHybridField?.candidates.map((candidate) => candidate.candidateId) ?? [];
  let best = "";
  let score = 0;
  for (const id of ids) {
    const next = readyScore(connection, id, separation);
    if (next > score) {
      score = next;
      best = id;
    }
  }
  return best;
}

export function connectAdaptive(
  connection: TileConnection,
  tiles: readonly TileInstance[],
  loaded: ReadonlyMap<string, ModuleHandoff>,
  separation: number,
  options?: { retainCandidateMeshes?: boolean },
): TileConnection | null {
  const evaluated = new Set<string>();
  const pickFrom = (wave: readonly string[], next: TileConnection) => {
    for (const id of wave) evaluated.add(id);
    return selectConnectorId(next, separation);
  };
  const seated = connectClusterHybrid(
    { ...connection, separation, connectionKind: "hybrid" },
    tiles,
    loaded,
    PRODUCTION_CONNECTORS,
    (next) => pickFrom(PRODUCTION_CONNECTORS, next),
    options,
  );
  const selected = selectConnectorId(seated, separation);
  if (!selected || !PRODUCTION_CONNECTORS.includes(selected as (typeof PRODUCTION_CONNECTORS)[number])) return null;
  evaluated.add(selected);
  return { ...seated, connectorsEvaluated: [...evaluated], selectedMockId: selected };
}

const PROBE_FACES: readonly { host: FaceId; guest: FaceId }[] = [
  { host: "E", guest: "W" },
  { host: "W", guest: "E" },
  { host: "N", guest: "S" },
  { host: "S", guest: "N" },
  { host: "T", guest: "B" },
  { host: "B", guest: "T" },
];
const PROBE_DISTANCES = [22, 26, 30, 34] as const;

export function probeHybridPair(
  hostId: string,
  guestId: string,
  hostInstance: string,
  guestInstance: string,
  loaded: ReadonlyMap<string, ModuleHandoff>,
  distance = 30,
): boolean {
  const host = loaded.get(hostId);
  const guest = loaded.get(guestId);
  if (!host || host.status !== "ready" || !guest || guest.status !== "ready") return false;
  for (const faces of PROBE_FACES) {
    if (attemptWasRecorded(hostId, guestId, faces.host, faces.guest)) continue;
    for (const gap of PROBE_DISTANCES) {
      const tiles = [
        { instanceId: hostInstance, archetypeId: hostId, moduleId: host.moduleId, transform: { x: 0, y: 0, z: 0 }, rotationQuarter: 0 as const, mirror: null },
        { instanceId: guestInstance, archetypeId: guestId, moduleId: guest.moduleId, transform: { x: gap, y: 0, z: 0 }, rotationQuarter: 0 as const, mirror: null },
      ];
      const connection: TileConnection = {
        id: `${hostInstance}:${guestInstance}`,
        tileAId: hostInstance < guestInstance ? hostInstance : guestInstance,
        tileBId: hostInstance < guestInstance ? guestInstance : hostInstance,
        faceA: hostInstance < guestInstance ? faces.host : faces.guest,
        faceB: hostInstance < guestInstance ? faces.guest : faces.host,
        origin: "explicit",
        generationStatus: "not-generated",
        faceSelection: "user",
        inputsChanged: false,
        signature: "",
        candidateField: null,
        generatedHybridField: null,
        selectedMockId: "",
        connectionKind: "hybrid",
        separation: gap,
      };
      const connected = connectAdaptive(connection, tiles, loaded, gap);
      const ok = Boolean(connected && selectConnectorId(connected, gap));
      recordHybridAttempt({
        archetypeA: hostId,
        archetypeB: guestId,
        faceA: faces.host,
        faceB: faces.guest,
        ok,
        distance: gap,
        candidateId: connected?.selectedMockId || "",
      });
      if (ok) return true;
    }
  }
  return false;
}