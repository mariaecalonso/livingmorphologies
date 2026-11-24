import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { readZoningList, type ZoningRegion } from "./zoning";

/**
 * Authoritative designer zoning.
 * Node-only — do not import from client components.
 * Network pockets are suggestions. These regions are the production zoning state.
 */
const FILE = path.join(process.cwd(), "data", "skill5", "designer-zoning.json");
export const DESIGNER_ZONING_CONTRACT = "skill5-designer-zoning-v1" as const;

export class DesignerZoningError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DesignerZoningError";
  }
}

export type DesignerZoningFile = {
  contract: typeof DESIGNER_ZONING_CONTRACT;
  regions: ZoningRegion[];
};

function emptyFile(): DesignerZoningFile {
  return { contract: DESIGNER_ZONING_CONTRACT, regions: [] };
}

export function readDesignerZoning(): DesignerZoningFile {
  try {
    const body = JSON.parse(readFileSync(FILE, "utf8")) as unknown;
    if (!body || typeof body !== "object") return emptyFile();
    const record = body as { contract?: unknown; regions?: unknown };
    if (record.contract !== DESIGNER_ZONING_CONTRACT) return emptyFile();
    return { contract: DESIGNER_ZONING_CONTRACT, regions: readZoningList(record.regions) };
  } catch {
    return emptyFile();
  }
}

export function writeDesignerZoning(regions: readonly ZoningRegion[]): DesignerZoningFile {
  const next: DesignerZoningFile = {
    contract: DESIGNER_ZONING_CONTRACT,
    regions: readZoningList(regions),
  };
  writeFileSync(FILE, `${JSON.stringify(next, null, 2)}\n`, "utf8");
  return next;
}

export function designerZoningForNetwork(networkId: string): ZoningRegion[] {
  if (!networkId) return [];
  return readDesignerZoning().regions.filter((region) => region.networkId === networkId);
}

export function designerZoningSignature(networkId: string) {
  return designerZoningForNetwork(networkId)
    .map((region) => `${region.id}:${region.kind}:${region.points.length}:${region.points[0]?.x ?? 0}:${region.points[0]?.z ?? 0}`)
    .join("|");
}
