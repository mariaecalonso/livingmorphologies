"use client";

import { useSyncExternalStore } from "react";
import type { ModuleHandoff } from "@/lib/skill4/adapt";
import { connectClusterHybrid, hybridReady } from "@/lib/skill4/cluster-hybrids";
import { analyzeClusterVoid, placeTileMesh } from "@/lib/skill4/cluster-void";
import type { TileConnection } from "@/lib/skill4/connections";
import { areaStanding, type AreaStanding, programAreaRange } from "@/lib/skill4/program-area";
import { resolveTileModule, type TileInstance } from "@/lib/skill4/tiles";

export type CatalogIteration = {
  id: string;
  programId: string;
  programName: string;
  iteration: number;
  tiles: TileInstance[];
  connections: TileConnection[];
  validated: boolean;
  habitableArea: number;
  targetMin: number;
  targetMax: number;
  areaStatus: AreaStanding;
};

type SourceCluster = {
  id: string;
  tiles: TileInstance[];
  connections: TileConnection[];
};

let iterations: CatalogIteration[] = [];
let status = "";
let token = 0;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useCatalogIterations() {
  return useSyncExternalStore(subscribe, () => iterations, () => iterations);
}

export function useCatalogStatus() {
  return useSyncExternalStore(subscribe, () => status, () => status);
}

function pause() {
  return new Promise<void>((resolve) => window.setTimeout(resolve, 0));
}

function geometryReady(tiles: readonly TileInstance[], loaded: ReadonlyMap<string, ModuleHandoff>) {
  return tiles.every((tile) => resolveTileModule(tile.archetypeId, loaded).status === "ready");
}

/** Runs the existing hybrid, validation, shrinkwrap, and void steps. Catalog entries appear only when all of them finish. */
export function finishForCatalog(
  programId: string,
  programName: string,
  clusters: readonly SourceCluster[],
  getLoaded: () => ReadonlyMap<string, ModuleHandoff>,
) {
  const run = ++token;
  iterations = iterations.filter((item) => item.programId !== programId);
  status = "Preparing catalog iterations";
  emit();
  void (async () => {
    const ready: CatalogIteration[] = [];
    for (let index = 0; index < clusters.length; index += 1) {
      if (run !== token) return;
      const cluster = clusters[index];
      status = `Finishing iteration ${index + 1} of ${clusters.length}`;
      emit();
      let loaded = getLoaded();
      for (let attempt = 0; attempt < 40 && !geometryReady(cluster.tiles, loaded); attempt += 1) {
        await pause();
        loaded = getLoaded();
      }
      if (!geometryReady(cluster.tiles, loaded)) continue;
      let connections = cluster.connections.slice();
      let failed = false;
      for (let edge = 0; edge < connections.length; edge += 1) {
        if (run !== token) return;
        await pause();
        try {
          const next = connectClusterHybrid(connections[edge], cluster.tiles, getLoaded());
          connections = connections.map((item) => (item.id === next.id ? next : item));
        } catch {
          failed = true;
          break;
        }
      }
      if (failed || !connections.every(hybridReady)) continue;
      const solids = [
        ...cluster.tiles.flatMap((tile) => {
          const geometry = resolveTileModule(tile.archetypeId, getLoaded()).geometry;
          return geometry ? [placeTileMesh(tile, geometry)] : [];
        }),
        ...connections.flatMap((connection) => (
          connection.validatedHybrid && connection.validatedHybrid.triangles > 0 ? [connection.validatedHybrid] : []
        )),
      ];
      let area = 0;
      try {
        const range = programAreaRange(programId);
        const report = analyzeClusterVoid(cluster.tiles, connections, solids);
        area = Math.round(report.floorSquareFeet);
        ready.push({
          id: `${programId}:${cluster.id}`,
          programId,
          programName,
          iteration: ready.length + 1,
          tiles: cluster.tiles,
          connections,
          validated: true,
          habitableArea: area,
          targetMin: range.min,
          targetMax: range.max,
          areaStatus: areaStanding(report.floorSquareFeet, range),
        });
      } catch {
        continue;
      }
      iterations = [...iterations.filter((item) => item.programId !== programId), ...ready];
      emit();
    }
    if (run !== token) return;
    status = "";
    emit();
  })();
}
