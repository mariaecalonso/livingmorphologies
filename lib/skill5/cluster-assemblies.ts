import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { SKILL5_SITE_ID } from "./contract";
import { designerZoningForNetwork, designerZoningSignature } from "./designer-zoning";
import {
  assemblySourceIds,
  CLUSTER_ASSEMBLY_CONTRACT,
  readConnectionList,
  readOccupancyList,
  type AssemblyConnectionRecord,
  type ClusterAssemblyDocument,
  type ClusterAssemblyRecord,
  type OccupancyProvenance,
  type PlacedCluster,
} from "./placed-cluster";
import { readZoningList, type ZoningRegion } from "./zoning";

/**
 * Dedicated Cluster Assembly catalog.
 * Node-only — do not import from client components.
 * Historical Configurations (C01–C08 and later C## records) are not this catalog
 * and must not write selectedAssemblyId.
 */
const FILE = path.join(process.cwd(), "data", "skill5", "cluster-assemblies.json");

export class ClusterAssemblyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ClusterAssemblyError";
  }
}

export type { ClusterAssemblyDocument, ClusterAssemblyRecord };

function emptyDocument(): ClusterAssemblyDocument {
  return {
    contract: CLUSTER_ASSEMBLY_CONTRACT,
    siteId: SKILL5_SITE_ID,
    selectedAssemblyId: null,
    assemblies: [],
  };
}

function readAssembly(value: unknown): ClusterAssemblyRecord | null {
  if (!value || typeof value !== "object") return null;
  const body = value as Record<string, unknown>;
  if (typeof body.assemblyId !== "string" || typeof body.name !== "string") return null;
  if (typeof body.selectedNetworkId !== "string") return null;
  const occupancy = readOccupancyList(body.occupancy);
  const ids = assemblySourceIds(occupancy);
  const provenance = body.provenance && typeof body.provenance === "object"
    ? body.provenance as { modes?: unknown; savedFrom?: unknown }
    : {};
  const savedFrom = provenance.savedFrom === "auto-initial" || provenance.savedFrom === "catalog" || provenance.savedFrom === "placement"
    ? provenance.savedFrom
    : "placement";
  const modes = Array.isArray(provenance.modes)
    ? provenance.modes.filter((item): item is OccupancyProvenance => item === "manual" || item === "assisted" || item === "automatic-initial")
    : ids.modes;
  return {
    assemblyId: body.assemblyId,
    name: body.name,
    createdAt: typeof body.createdAt === "string" ? body.createdAt : new Date().toISOString(),
    updatedAt: typeof body.updatedAt === "string" ? body.updatedAt : new Date().toISOString(),
    selectedNetworkId: body.selectedNetworkId,
    zoningSignature: typeof body.zoningSignature === "string" ? body.zoningSignature : "",
    zones: readZoningList(body.zones),
    occupancy,
    sourceFinishedClusterIds: Array.isArray(body.sourceFinishedClusterIds)
      ? body.sourceFinishedClusterIds.filter((item): item is string => typeof item === "string")
      : ids.sourceFinishedClusterIds,
    sourceModuleIds: Array.isArray(body.sourceModuleIds)
      ? body.sourceModuleIds.filter((item): item is string => typeof item === "string")
      : ids.sourceModuleIds,
    connections: readConnectionList(body.connections),
    provenance: { modes, savedFrom },
  };
}

export function readClusterAssemblyDocument(): ClusterAssemblyDocument {
  try {
    const body = JSON.parse(readFileSync(FILE, "utf8")) as unknown;
    if (!body || typeof body !== "object") return emptyDocument();
    const record = body as { contract?: unknown; siteId?: unknown; selectedAssemblyId?: unknown; assemblies?: unknown };
    if (record.contract !== CLUSTER_ASSEMBLY_CONTRACT) return emptyDocument();
    const assemblies = Array.isArray(record.assemblies) ? record.assemblies.flatMap((item) => {
      const assembly = readAssembly(item);
      return assembly ? [assembly] : [];
    }) : [];
    const selected = typeof record.selectedAssemblyId === "string" ? record.selectedAssemblyId : null;
    return {
      contract: CLUSTER_ASSEMBLY_CONTRACT,
      siteId: typeof record.siteId === "string" ? record.siteId : SKILL5_SITE_ID,
      selectedAssemblyId: selected && assemblies.some((item) => item.assemblyId === selected) ? selected : null,
      assemblies,
    };
  } catch {
    return emptyDocument();
  }
}

function writeDocument(document: ClusterAssemblyDocument) {
  writeFileSync(FILE, `${JSON.stringify(document, null, 2)}\n`, "utf8");
  return document;
}

export function nextAssemblyId(assemblies: readonly ClusterAssemblyRecord[]) {
  let max = 0;
  for (const item of assemblies) {
    const match = /^A(\d+)$/.exec(item.assemblyId);
    if (match) max = Math.max(max, Number(match[1]));
  }
  return `A${String(max + 1).padStart(2, "0")}`;
}

export type SaveClusterAssemblyInput = {
  name?: string;
  selectedNetworkId: string;
  zoningSignature: string;
  zones: readonly ZoningRegion[];
  occupancy: readonly PlacedCluster[];
  connections?: readonly AssemblyConnectionRecord[];
  savedFrom?: ClusterAssemblyRecord["provenance"]["savedFrom"];
};

export function saveClusterAssembly(input: SaveClusterAssemblyInput): ClusterAssemblyRecord {
  if (typeof input.selectedNetworkId !== "string" || input.selectedNetworkId.length === 0) {
    throw new ClusterAssemblyError("A selected Site Strategy network is required.");
  }
  const occupancy = readOccupancyList(input.occupancy);
  if (occupancy.length === 0) {
    throw new ClusterAssemblyError("A Cluster Assembly needs at least one zone occupancy.");
  }
  const ids = assemblySourceIds(occupancy);
  const document = readClusterAssemblyDocument();
  const now = new Date().toISOString();
  const assemblyId = nextAssemblyId(document.assemblies);
  const zones = readZoningList(input.zones);
  const snapshot = zones.length > 0 ? zones : designerZoningForNetwork(input.selectedNetworkId);
  const record: ClusterAssemblyRecord = {
    assemblyId,
    name: (input.name?.trim() || assemblyId),
    createdAt: now,
    updatedAt: now,
    selectedNetworkId: input.selectedNetworkId,
    zoningSignature: input.zoningSignature || designerZoningSignature(input.selectedNetworkId),
    zones: snapshot,
    occupancy,
    sourceFinishedClusterIds: ids.sourceFinishedClusterIds,
    sourceModuleIds: ids.sourceModuleIds,
    connections: readConnectionList(input.connections),
    provenance: {
      modes: ids.modes,
      savedFrom: input.savedFrom ?? "placement",
    },
  };
  document.assemblies.push(record);
  writeDocument(document);
  return record;
}

export function readClusterAssembly(assemblyId: string): ClusterAssemblyRecord | null {
  return readClusterAssemblyDocument().assemblies.find((item) => item.assemblyId === assemblyId) ?? null;
}

export function writeSelectedAssemblyId(assemblyId: string | null) {
  const document = readClusterAssemblyDocument();
  if (assemblyId !== null && !document.assemblies.some((item) => item.assemblyId === assemblyId)) {
    throw new ClusterAssemblyError("That Cluster Assembly is not in the catalog.");
  }
  if (document.selectedAssemblyId === assemblyId) return { ...document, changed: false as const };
  document.selectedAssemblyId = assemblyId;
  writeDocument(document);
  return { ...document, changed: true as const };
}

export function deleteClusterAssembly(assemblyId: string) {
  const document = readClusterAssemblyDocument();
  const next = document.assemblies.filter((item) => item.assemblyId !== assemblyId);
  if (next.length === document.assemblies.length) {
    throw new ClusterAssemblyError("That Cluster Assembly is not in the catalog.");
  }
  document.assemblies = next;
  if (document.selectedAssemblyId === assemblyId) document.selectedAssemblyId = null;
  writeDocument(document);
  return document;
}

export function selectedClusterAssembly(): ClusterAssemblyRecord | null {
  const document = readClusterAssemblyDocument();
  if (!document.selectedAssemblyId) return null;
  return document.assemblies.find((item) => item.assemblyId === document.selectedAssemblyId) ?? null;
}
