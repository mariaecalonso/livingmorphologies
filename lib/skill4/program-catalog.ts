import type { IsoMesh } from "@/lib/scan/isomesh";
import type { ModuleHandoff } from "./adapt";
import { connectClusterHybrid, hybridReady } from "./cluster-hybrids";
import { analyzeClusterVoid, placeTileMesh } from "./cluster-void";
import type { TileConnection } from "./connections";
import type { AreaStanding } from "./program-area";
import type { ProgramCluster } from "./program-cluster";
import { resolveTileModule, type TileInstance } from "./tiles";

export type StoredIteration = {
  id: string;
  iteration: number;
  tileCount: number;
  habitableArea: number;
  targetMin: number;
  targetMax: number;
  areaStatus: AreaStanding;
  validated: true;
  /** Saved Skill 04 connectors and the completed assembly validation. */
  savedAssembly?: { hybrids: number; expected: number; validated: boolean };
  tiles: TileInstance[];
  connections: TileConnection[];
};

export type StoredProgram = {
  programId: string;
  name: string;
  targetMin: number;
  targetMax: number;
  iterations: StoredIteration[];
  bestArea: number;
  reached: boolean;
  /** Set when this program cannot produce a structurally complete cluster. */
  reason?: string;
};

export type StoredProgramCatalog = {
  scale: "1 model unit = 1 foot";
  programs: StoredProgram[];
};

function restoreMesh(mesh: IsoMesh | null | undefined): IsoMesh | null {
  if (!mesh || mesh.triangles <= 0 || !mesh.positions) return null;
  return {
    positions: mesh.positions instanceof Float32Array ? mesh.positions : new Float32Array(mesh.positions),
    normals: mesh.normals instanceof Float32Array ? mesh.normals : new Float32Array(mesh.normals ?? []),
    indices: mesh.indices instanceof Uint32Array ? mesh.indices : new Uint32Array(mesh.indices ?? []),
    triangles: mesh.triangles,
  };
}

/**
 * The shrink-wrapped hybrid is about 100,000 triangles, roughly 20MB of JSON per cluster.
 * The saved record keeps the faces, tile pose, and the chosen candidate id.
 * Rebuilding with those inputs selects that same candidate and runs the same validation.
 */
function catalogConnection(connection: TileConnection): TileConnection {
  return {
    ...connection,
    rawHybrid: null,
    candidateField: null,
    generatedHybridField: null,
    validatedHybrid: null,
  };
}

/** Typed arrays for drawing. JSON stores the same vertices as plain number lists. */
export function restoreStoredCatalog(catalog: StoredProgramCatalog): StoredProgramCatalog {
  return {
    ...catalog,
    programs: catalog.programs.map((program) => ({
      ...program,
      iterations: program.iterations.map((iteration) => ({
        ...iteration,
        connections: iteration.connections.map((connection) => ({
          ...connection,
          validatedHybrid: restoreMesh(connection.validatedHybrid),
        })),
      })),
    })),
  };
}

/** Full Skill 04 assembly, then the existing void extraction and floor measurement. */
export function measureFinishedCluster(cluster: ProgramCluster, loaded: ReadonlyMap<string, ModuleHandoff>) {
  let connections = cluster.connections.slice();
  for (let index = 0; index < connections.length; index += 1) {
    const next = connectClusterHybrid(connections[index], cluster.tiles, loaded);
    connections = connections.map((item) => (item.id === next.id ? next : item));
  }
  if (!connections.every(hybridReady)) return null;
  const solids = [
    ...cluster.tiles.flatMap((tile) => {
      const geometry = resolveTileModule(tile.archetypeId, loaded).geometry;
      return geometry ? [placeTileMesh(tile, geometry)] : [];
    }),
    ...connections.flatMap((connection) => (
      connection.validatedHybrid && connection.validatedHybrid.triangles > 0 ? [connection.validatedHybrid] : []
    )),
  ];
  const report = analyzeClusterVoid(cluster.tiles, connections, solids);
  return {
    floorSquareFeet: report.floorSquareFeet,
    volumeCubicFeet: report.volumeCubicFeet,
    connections: connections.map(catalogConnection),
    tiles: cluster.tiles,
  };
}
