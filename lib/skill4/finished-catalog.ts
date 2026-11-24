import type { IsoMesh } from "@/lib/scan/isomesh";
import type { TileConnection } from "./connections";
import type { AreaStanding } from "./program-area";
import type { TileInstance } from "./tiles";

export type FinishedIteration = {
  id: string;
  iteration: number;
  seed: number;
  status: "FINISHED";
  tileCount: number;
  habitableArea: number;
  targetMin: number;
  targetMax: number;
  areaStatus: AreaStanding;
  tiles: TileInstance[];
  connections: TileConnection[];
  validation: { executed: true; adopted: true; triangles: number; note: string };
  shrinkwrap: { executed: true; triangles: number };
  void: { floorSquareFeet: number; volumeCubicFeet: number; verticalExtent: number; clearance: number };
  review?: {
    clusterWidth: number;
    clusterDepth: number;
    clusterHeight: number;
    verticalLevels: number;
    planSpread: number;
    branches: number;
    morphologyScore: number;
    morphologyPass: boolean;
    regionsBefore: number;
    regionsRetained: number;
    voidHeight: number;
    voidWidth: number;
    voidDepth: number;
    verticalTransitionCount?: number;
    upperMassSupportedBySingleStem?: boolean;
  };
};

export type FinishedProgram = {
  programId: string;
  name: string;
  requested: number;
  finished: number;
  failed: number;
  validationRuns: number;
  shrinkwrapRuns: number;
  persisted: number;
  reason?: string;
  iterations: FinishedIteration[];
};

export type FinishedCatalog = {
  scale: "1 model unit = 1 foot";
  programs: FinishedProgram[];
  batch?: { running: boolean; phase: string };
};

export const FINISHED_REQUESTED = 10;
