import { envelopeWidth } from "./tiles";
import type { FaceId } from "./contract";
import type { TileInstance } from "./tiles";
import { connectionSummaryLabel, detectAdjacencies, type TileConnection } from "./connections";

export const MOCK_HYBRID_LABEL = "MOCK HYBRIDS · INTERFACE TEST";

export const TILE_IDS = ["A", "B", "C", "D", "E", "F", "G", "H"] as const;

export type AssemblyCount = 2 | 4 | 6 | 8;
export type AssemblyArrangement = "grid" | "linear";
export type MirrorAxis = "x" | "y" | "z";

export const MOCK_PREVIEW_SETTINGS = {
  version: "skill4-mock-hybrid-v2",
  depth: 0.35,
  placement: "centered-on-detected-contact",
  note: "Preview placement only. It does not set production connector depth.",
} as const;

const FIXTURES = ["topographic-ground-field", "linear-gallery"] as const;

export function gridShape(count: AssemblyCount, arrangement: AssemblyArrangement) {
  if (arrangement === "linear") return { columns: count, rows: 1 };
  if (count === 2) return { columns: 2, rows: 1 };
  if (count === 4) return { columns: 2, rows: 2 };
  if (count === 6) return { columns: 3, rows: 2 };
  return { columns: 4, rows: 2 };
}

export function layoutTiles(
  count: AssemblyCount,
  arrangement: AssemblyArrangement,
  previous: readonly TileInstance[] = [],
  width = envelopeWidth(),
): TileInstance[] {
  const { columns, rows } = gridShape(count, arrangement);
  const prior = new Map(previous.map((tile) => [tile.instanceId, tile]));
  const tiles: TileInstance[] = [];
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const instanceId = TILE_IDS[row * columns + column];
      const existing = prior.get(instanceId);
      const archetypeId = existing?.archetypeId ?? FIXTURES[(row * columns + column) % 2];
      tiles.push({
        instanceId,
        archetypeId,
        moduleId: existing?.moduleId ?? "",
        transform: { x: column * width, y: 0, z: row * width },
        rotationQuarter: existing?.rotationQuarter ?? 0,
        mirror: existing?.mirror ?? null,
      });
    }
  }
  return tiles;
}

const PLAN = ["E", "N", "W", "S"] as const;

export function worldFace(face: FaceId, tile: Pick<TileInstance, "rotationQuarter" | "mirror">): FaceId {
  let current = face;
  if (tile.mirror === "y" && (current === "T" || current === "B")) current = current === "T" ? "B" : "T";
  if (tile.mirror === "x" && (current === "E" || current === "W")) current = current === "E" ? "W" : "E";
  if (tile.mirror === "z" && (current === "N" || current === "S")) current = current === "N" ? "S" : "N";
  if (current === "T" || current === "B") return current;
  const index = PLAN.indexOf(current as (typeof PLAN)[number]);
  return PLAN[(index + tile.rotationQuarter) % 4];
}

export function mockPlacementSupported(connection: Pick<TileConnection, "id" | "faceA" | "faceB" | "tileAId" | "tileBId">, tiles: readonly TileInstance[]) {
  const detected = detectAdjacencies(tiles).find((item) => item.id === connection.id);
  if (!detected) return false;
  const tileA = tiles.find((tile) => tile.instanceId === connection.tileAId);
  const tileB = tiles.find((tile) => tile.instanceId === connection.tileBId);
  if (!tileA || !tileB) return false;
  if (detected.faceA === "T" || detected.faceA === "B") return false;
  return worldFace(connection.faceA, tileA) === detected.faceA && worldFace(connection.faceB, tileB) === detected.faceB;
}

export function mockSummary(connection: TileConnection, tiles: readonly TileInstance[], blocked: boolean) {
  if (blocked) return connectionSummaryLabel(connection, true);
  const placement = mockPlacementSupported(connection, tiles) ? "" : " · unsupported placement";
  return `${connection.tileAId}:${connection.faceA} → ${connection.selectedMockId} ${MOCK_HYBRID_LABEL} → ${connection.tileBId}:${connection.faceB}${placement}`;
}
