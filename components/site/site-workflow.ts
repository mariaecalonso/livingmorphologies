/**
 * Site Integration steps, in order.
 * Site Analysis opens its own workspace. The later steps stay on the site model.
 * Step numbers follow the list order.
 */

export const SITE_WORKFLOW = [
  { id: "analysis", label: "Site Analysis" },
  { id: "strategy", label: "Site Strategy" },
  { id: "zoning", label: "Zoning" },
  { id: "placement", label: "Cluster Placement" },
  { id: "assembly", label: "Assembly" },
  { id: "configurations", label: "Configurations" },
] as const;

export type SiteStepId = (typeof SITE_WORKFLOW)[number]["id"];
export type SiteWorkflowId = Exclude<SiteStepId, "analysis">;

export function siteStepHref(id: SiteStepId, search: string) {
  const params = new URLSearchParams(search);
  if (id === "analysis") {
    params.delete("sheet");
    const query = params.toString();
    return `/lab/site/analysis${query ? `?${query}` : ""}`;
  }
  params.set("sheet", id);
  const query = params.toString();
  return `/lab/site${query ? `?${query}` : ""}`;
}

import { readZoningList, ZONE_KIND_ORDER, type ZoningRegion } from "@/lib/skill5/zoning";

export type { ZoneKind as SiteZoneKind, ZonePoint, ZoningRegion as SiteZone } from "@/lib/skill5/zoning";

export type SiteConnectionMode = "direct" | "hybrid";

/** A confirmed relationship between two placed tiles. The passage is separate from both meshes. */
export type SiteConnection = {
  id: string;
  tileA: string;
  tileB: string;
  mode: SiteConnectionMode;
  faceA?: string;
  faceB?: string;
  joinType?: "side" | "stack";
  alignment?: number;
  floorDelta?: number;
  integrity?: "closed" | "open" | "none";
  passage?: { positions: number[]; indices: number[] } | null;
  candidateId?: string;
  note?: string;
  /** Set when a joined tile is transformed. The stored passage is kept until it is rebuilt. */
  review?: string;
};

export const ZONE_KINDS = ZONE_KIND_ORDER;

const STORAGE_KEY = "living-morphologies.site-workflow";

export type SiteWorkflowState = {
  zones: ZoningRegion[];
  connections: SiteConnection[];
  /**
   * Browser cache of the published Site Strategy selection.
   * Production authority is `data/skill5/herald-arrival-v1.json` `massingNetworkId`.
   * This cache must not silently override that selection.
   */
  massingNetworkId: string | null;
  /** Up to three networks held for Zoning investigation. This does not select the zoning network. */
  zoningShortlist: string[];
};

const EMPTY: SiteWorkflowState = { zones: [], connections: [], massingNetworkId: null, zoningShortlist: [] };

function readShortlist(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.length > 0).slice(0, 3);
}

function readPassage(value: unknown): SiteConnection["passage"] {
  if (!value || typeof value !== "object") return null;
  const body = value as { positions?: unknown; indices?: unknown };
  if (!Array.isArray(body.positions) || !Array.isArray(body.indices)) return null;
  const positions = body.positions.filter((item): item is number => typeof item === "number" && Number.isFinite(item));
  const indices = body.indices.filter((item): item is number => typeof item === "number" && Number.isInteger(item) && item >= 0);
  if (positions.length < 9 || indices.length < 3) return null;
  return { positions, indices };
}

function isMode(value: unknown): value is SiteConnectionMode {
  return value === "direct" || value === "hybrid";
}

export function readSiteWorkflowState(): SiteWorkflowState {
  if (typeof window === "undefined") return EMPTY;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY;
    const body = JSON.parse(raw) as { zones?: unknown; connections?: unknown; massingNetworkId?: unknown; zoningShortlist?: unknown };
    const zones = readZoningList(body.zones);
    const connections = Array.isArray(body.connections) ? body.connections.flatMap((item): SiteConnection[] => {
      if (!item || typeof item !== "object") return [];
      const link = item as { id?: unknown; tileA?: unknown; tileB?: unknown; mode?: unknown; faceA?: unknown; faceB?: unknown; joinType?: unknown; alignment?: unknown; floorDelta?: unknown; integrity?: unknown; passage?: unknown; candidateId?: unknown; note?: unknown; review?: unknown };
      if (typeof link.id !== "string" || typeof link.tileA !== "string" || typeof link.tileB !== "string" || !isMode(link.mode)) return [];
      const passage = readPassage(link.passage);
      return [{
        id: link.id,
        tileA: link.tileA,
        tileB: link.tileB,
        mode: link.mode,
        faceA: typeof link.faceA === "string" ? link.faceA : undefined,
        faceB: typeof link.faceB === "string" ? link.faceB : undefined,
        joinType: link.joinType === "side" || link.joinType === "stack" ? link.joinType : undefined,
        alignment: typeof link.alignment === "number" ? link.alignment : undefined,
        floorDelta: typeof link.floorDelta === "number" ? link.floorDelta : undefined,
        integrity: link.integrity === "closed" || link.integrity === "open" || link.integrity === "none" ? link.integrity : undefined,
        passage,
        candidateId: typeof link.candidateId === "string" ? link.candidateId : undefined,
        note: typeof link.note === "string" ? link.note : undefined,
        review: typeof link.review === "string" ? link.review : undefined,
      }];
    }) : [];
    return { zones, connections, massingNetworkId: typeof body.massingNetworkId === "string" ? body.massingNetworkId : null, zoningShortlist: readShortlist(body.zoningShortlist) };
  } catch {
    return EMPTY;
  }
}

export function writeSiteWorkflowState(state: SiteWorkflowState) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* The in-memory workspace still holds the step. */
  }
}
