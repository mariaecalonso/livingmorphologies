import type { NetworkNode } from "@/components/site/site-network";
import type { TypologyAttractor } from "@/components/site/typology-attractors";
import { SKILL5_SITE_ID } from "./contract";

export const MASSING_CATALOG_CONTRACT = "skill5-massing-catalog-v1" as const;

export type MassingBranch = { x0: number; z0: number; x1: number; z1: number; conductivity: number };

export type MassingStudy = {
  id: string;
  name: string;
  configurationId: string;
  createdAt: string;
  seed: number;
  iterationId: string;
  step: number;
  reached: number;
  total: number;
  note: string | null;
  connectedIds: string[];
  nodes: NetworkNode[];
  markers: TypologyAttractor[];
  branches: MassingBranch[];
  tiles: number;
  levels: number;
  lobby: number;
  workspace: number;
  gathering: number;
};

export type MassingCatalogDocument = {
  contract: typeof MASSING_CATALOG_CONTRACT;
  siteId: typeof SKILL5_SITE_ID;
  studies: MassingStudy[];
};

export function emptyMassingCatalog(): MassingCatalogDocument {
  return { contract: MASSING_CATALOG_CONTRACT, siteId: SKILL5_SITE_ID, studies: [] };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

function readNodes(value: unknown): NetworkNode[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!isRecord(item) || (item.kind !== "source" && item.kind !== "attractor")) return [];
    if (typeof item.id !== "string" || typeof item.x !== "number" || typeof item.z !== "number") return [];
    return [{
      id: item.id,
      kind: item.kind,
      x: item.x,
      z: item.z,
      surface: item.surface === "water" ? "water" as const : undefined,
    }];
  });
}

function readMarkers(value: unknown): TypologyAttractor[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!isRecord(item) || typeof item.id !== "string") return [];
    if (item.typology !== "lobby" && item.typology !== "workspace" && item.typology !== "gathering") return [];
    if (typeof item.x !== "number" || typeof item.z !== "number") return [];
    return [{ id: item.id, typology: item.typology, x: item.x, z: item.z }];
  });
}

function readBranches(value: unknown): MassingBranch[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!isRecord(item)) return [];
    const x0 = Number(item.x0);
    const z0 = Number(item.z0);
    const x1 = Number(item.x1);
    const z1 = Number(item.z1);
    const conductivity = Number(item.conductivity);
    if (![x0, z0, x1, z1, conductivity].every(Number.isFinite)) return [];
    return [{ x0, z0, x1, z1, conductivity }];
  });
}

export function parseMassingCatalog(value: unknown): MassingCatalogDocument {
  if (!isRecord(value) || value.contract !== MASSING_CATALOG_CONTRACT || !Array.isArray(value.studies)) return emptyMassingCatalog();
  const studies = value.studies.flatMap((item): MassingStudy[] => {
    if (!isRecord(item) || typeof item.id !== "string" || typeof item.name !== "string" || typeof item.configurationId !== "string") return [];
    if (typeof item.seed !== "number" || typeof item.iterationId !== "string") return [];
    return [{
      id: item.id,
      name: item.name,
      configurationId: item.configurationId,
      createdAt: typeof item.createdAt === "string" ? item.createdAt : new Date(0).toISOString(),
      seed: item.seed,
      iterationId: item.iterationId,
      step: typeof item.step === "number" ? item.step : 0,
      reached: typeof item.reached === "number" ? item.reached : 0,
      total: typeof item.total === "number" ? item.total : 0,
      note: typeof item.note === "string" ? item.note : null,
      connectedIds: Array.isArray(item.connectedIds) ? item.connectedIds.filter((id): id is string => typeof id === "string") : [],
      nodes: readNodes(item.nodes),
      markers: readMarkers(item.markers),
      branches: readBranches(item.branches),
      tiles: typeof item.tiles === "number" ? item.tiles : 0,
      levels: typeof item.levels === "number" ? item.levels : 1,
      lobby: typeof item.lobby === "number" ? item.lobby : 0,
      workspace: typeof item.workspace === "number" ? item.workspace : 0,
      gathering: typeof item.gathering === "number" ? item.gathering : 0,
    }];
  });
  return { contract: MASSING_CATALOG_CONTRACT, siteId: SKILL5_SITE_ID, studies };
}
