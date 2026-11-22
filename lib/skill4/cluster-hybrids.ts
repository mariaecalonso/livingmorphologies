import type { ModuleHandoff } from "./adapt";
import { revealSmooth, validateMeshes } from "./assembly-validation";
import { resolveAssemblyHybrid } from "./assembly-hybrid";
import { generateCandidateField } from "./candidate-field";
import {
  connectionInputSignature,
  generateConnectionHybridField,
  type TileConnection,
} from "./connections";
import { placeTileMesh } from "./cluster-void";
import { filmWrapAssembly } from "./film-wrap";
import type { IsoMesh } from "../scan/isomesh";
import { resolveTileModule, type TileInstance } from "./tiles";

/**
 * Runs the existing Skill 04 candidate field and hybrid generator for one
 * cluster edge. The same faces and modules always return the stored field.
 */
export function connectClusterHybrid(
  connection: TileConnection,
  tiles: readonly TileInstance[],
  loaded: ReadonlyMap<string, ModuleHandoff>,
): TileConnection {
  const reusable = generateConnectionHybridField(connection, tiles, loaded);
  if (reusable.ok && reusable.reused) {
    const kept = keepChosenHybrid(reusable.connection);
    return hybridReady(kept) ? kept : sealConnection(kept, tiles, loaded);
  }

  const signature = connectionInputSignature(connection, tiles, loaded);
  const tileA = tiles.find((tile) => tile.instanceId === connection.tileAId);
  const tileB = tiles.find((tile) => tile.instanceId === connection.tileBId);
  if (!tileA || !tileB) return connection;
  const inputs = generateCandidateField({
    signature,
    faceA: connection.faceA,
    faceB: connection.faceB,
    moduleA: resolveTileModule(tileA.archetypeId, loaded),
    moduleB: resolveTileModule(tileB.archetypeId, loaded),
  });
  if (!inputs.ok) return { ...connection, signature };
  const seeded: TileConnection = {
    ...connection,
    signature,
    candidateField: inputs.field,
    inputsChanged: false,
  };
  const generated = generateConnectionHybridField(seeded, tiles, loaded);
  return generated.ok ? sealConnection(keepChosenHybrid(generated.connection), tiles, loaded) : seeded;
}

/** The full field is generated, then only the chosen candidate keeps its mesh. */
function keepChosenHybrid(connection: TileConnection): TileConnection {
  const field = connection.generatedHybridField;
  if (!field) return connection;
  const chosen = connection.selectedMockId;
  return {
    ...connection,
    generatedHybridField: {
      ...field,
      candidates: field.candidates.map((candidate) => (
        candidate.candidateId === chosen ? candidate : { ...candidate, geometry: null }
      )),
    },
  };
}

/**
 * Validation, then the existing shrink-wrap scan. The wrapped mesh is the
 * connection that enters the cluster. The raw hybrid stays for debugging.
 */
function sealConnection(
  connection: TileConnection,
  tiles: readonly TileInstance[],
  loaded: ReadonlyMap<string, ModuleHandoff>,
): TileConnection {
  if (connection.validatedHybrid && connection.validatedHybrid.triangles > 0 && connection.rawHybrid) return connection;
  const placed = resolveAssemblyHybrid(connection, tiles, loaded);
  if (placed.source !== "real" || !placed.geometry || placed.geometry.triangles < 4) return connection;
  const raw = placed.geometry;
  const validation = validateMeshes([raw]);
  const smoothed = validation ? revealSmooth(validation.meshes[0], 1) : raw;
  let validated = smoothed;
  try {
    const film = filmWrapAssembly([{ positions: smoothed.positions, indices: smoothed.indices }]);
    if (film?.mesh && film.mesh.triangles > 4) validated = film.mesh;
  } catch {
    validated = smoothed;
  }
  return { ...connection, rawHybrid: raw, validatedHybrid: validated };
}

/**
 * Last step of a finished cluster. Shrink-wraps the seated tiles and hybrids
 * with the same assembly validation used by the canvas. Returns the adopted
 * skin, or null when the wrap is not adopted.
 */
export function validateClusterAssembly(
  tiles: readonly TileInstance[],
  connections: readonly TileConnection[],
  loaded: ReadonlyMap<string, ModuleHandoff>,
): IsoMesh | null {
  const worlds = [
    ...tiles.flatMap((tile) => {
      const geometry = resolveTileModule(tile.archetypeId, loaded).geometry;
      if (!geometry) return [];
      const placed = placeTileMesh(tile, geometry);
      return [{ positions: placed.positions, indices: placed.indices }];
    }),
    ...connections.flatMap((connection) => (
      connection.validatedHybrid && connection.validatedHybrid.triangles > 0
        ? [{ positions: connection.validatedHybrid.positions, indices: connection.validatedHybrid.indices }]
        : []
    )),
  ];
  if (worlds.length < tiles.length + connections.length) return null;
  try {
    const film = filmWrapAssembly(worlds);
    if (film?.check.adopted && film.mesh && film.mesh.triangles > 4) return film.mesh;
  } catch {
    return null;
  }
  return null;
}

export function hybridReady(connection: TileConnection) {
  const field = connection.generatedHybridField;
  if (!field || field.connectionSignature !== connection.signature) return false;
  const chosen = field.candidates.find((candidate) => candidate.candidateId === connection.selectedMockId);
  return Boolean(chosen && chosen.status === "ready" && chosen.geometry && connection.validatedHybrid && connection.validatedHybrid.triangles > 0);
}
