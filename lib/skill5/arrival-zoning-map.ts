/**
 * Visualization-only zoning regions derived from herald-arrival-v1 placement preferences.
 * Uses parcel bands (same ratios as the placement code). Keeps the strategy tab light.
 */
import type { ArchitecturalRole, ArrangementParameters } from "@/components/site/site-network";
import { ROLE_LABEL } from "@/lib/skill5/architectural-strategy";
import { pointInRing } from "@/lib/skill5/placement";
import type { SiteContext, XZ } from "@/lib/skill5/site-model";

/** Same default as SKETCH_RECESSION_FT — avoid importing strategy-layouts into this light path. */
const SKETCH_RECESSION_FT = 80;

export type ArrivalZoningRole = ArchitecturalRole;

export type ArrivalZoningRegion = {
  role: ArrivalZoningRole;
  pocketId: string;
  label: string;
  color: string;
  ring: readonly { x: number; z: number }[];
};

export type ArrivalZoningMap = {
  spacingFt: number;
  parameters: ArrangementParameters;
  regions: readonly ArrivalZoningRegion[];
};

export type ArrivalZoningCheck = {
  role: ArrivalZoningRole;
  label: string;
  regionLabel: string | null;
  terminal: { x: number; z: number } | null;
  inside: boolean | null;
};

export const ARRIVAL_ZONING_COLOR: Record<ArrivalZoningRole, string> = {
  "primary-lobby": "#c77e5f",
  "private-lobby": "#a86848",
  "north-lobby": "#d4a08a",
  "central-gathering": "#49d7de",
  "north-gathering": "#6eb8c0",
  "private-gathering": "#3aa8b0",
  workspace: "#2d8f9a",
};

const BASELINE_PARAMETERS: ArrangementParameters = {
  experimentalLobby: "city-side-measured",
  publicLobby: "central-west",
  privateLobby: "southwest-end",
  gathering: "distinct",
  workspace: "spread",
  recessionFt: SKETCH_RECESSION_FT,
  seeds: [20365850, 20470579],
};

const ARRANGEMENT_PARAMETERS: Record<string, ArrangementParameters> = {
  "arrival-city-north-v1": { ...BASELINE_PARAMETERS },
  "arrival-northeast-v1": { ...BASELINE_PARAMETERS, experimentalLobby: "northeast-measured" },
  "arrival-northwest-v1": { ...BASELINE_PARAMETERS, experimentalLobby: "northwest-proposed" },
  "arrival-no-experimental-v1": { ...BASELINE_PARAMETERS, experimentalLobby: "absent" },
  "arrival-public-north-v1": { ...BASELINE_PARAMETERS, publicLobby: "central-west-north" },
  "arrival-private-inset-v1": { ...BASELINE_PARAMETERS, privateLobby: "southwest-inset" },
  "arrival-continuous-v1": { ...BASELINE_PARAMETERS, gathering: "continuous" },
  "arrival-workspace-single-v1": { ...BASELINE_PARAMETERS, workspace: "single-south" },
  "arrival-recession-deep-v1": { ...BASELINE_PARAMETERS, recessionFt: 160 },
  "arrival-waterfront-close-v1": { ...BASELINE_PARAMETERS, recessionFt: 40 },
};

export function resolveArrivalParameters(
  parameters: ArrangementParameters | null | undefined,
  arrangementId: string | null | undefined,
): ArrangementParameters {
  if (parameters) return parameters;
  if (arrangementId && ARRANGEMENT_PARAMETERS[arrangementId]) return ARRANGEMENT_PARAMETERS[arrangementId];
  return BASELINE_PARAMETERS;
}

const mapCache = new Map<string, ArrivalZoningMap>();

function boundsOf(ring: readonly XZ[]) {
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const [x, z] of ring) {
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minZ = Math.min(minZ, z);
    maxZ = Math.max(maxZ, z);
  }
  return { minX, maxX, minZ, maxZ, midZ: (minZ + maxZ) / 2, span: Math.max(1, maxZ - minZ), width: Math.max(1, maxX - minX) };
}

/** Clip a world-axis box to the parcel polygon — few vertices, no site-wide raster. */
function boxRing(parcel: readonly XZ[], minX: number, maxX: number, minZ: number, maxZ: number) {
  const pad = 2;
  const candidates: { x: number; z: number }[] = [
    { x: minX, z: minZ },
    { x: maxX, z: minZ },
    { x: maxX, z: maxZ },
    { x: minX, z: maxZ },
  ];
  const inside = candidates.filter((point) => pointInRing(point.x, point.z, parcel));
  if (inside.length >= 3) return inside;
  // Fall back to the box itself when the parcel is larger than the band.
  return [
    { x: minX + pad, z: minZ + pad },
    { x: maxX - pad, z: minZ + pad },
    { x: maxX - pad, z: maxZ - pad },
    { x: minX + pad, z: maxZ - pad },
  ];
}

function region(
  role: ArrivalZoningRole,
  pocketId: string,
  ring: readonly { x: number; z: number }[],
  label = ROLE_LABEL[role],
): ArrivalZoningRegion | null {
  if (ring.length < 3) return null;
  return { role, pocketId, label, color: ARRIVAL_ZONING_COLOR[role], ring };
}

/** Fast band diagram of herald-arrival-v1 preferences on the parcel. */
export function buildArrivalZoningMap(site: SiteContext, parameters: ArrangementParameters): ArrivalZoningMap {
  const cacheKey = [
    parameters.experimentalLobby,
    parameters.publicLobby,
    parameters.privateLobby,
    parameters.gathering,
    parameters.workspace,
    parameters.recessionFt,
  ].join("|");
  const cached = mapCache.get(cacheKey);
  if (cached) return cached;

  const parcel = site.site.ring;
  const b = boundsOf(parcel);
  const westDepth = Math.min(100, b.width * 0.28);
  const eastShore = Math.min(90, b.width * 0.22);
  const recessionFt = Math.min(400, Math.max(0, parameters.recessionFt));
  const regions: ArrivalZoningRegion[] = [];
  const push = (item: ArrivalZoningRegion | null) => {
    if (item) regions.push(item);
  };

  const publicHalf = parameters.publicLobby === "central-west-north"
    ? { minZ: b.midZ, maxZ: b.midZ + b.span * 0.34 }
    : { minZ: b.midZ - b.span * 0.34, maxZ: b.midZ + b.span * 0.34 };
  push(region(
    "primary-lobby",
    "public-lobby",
    boxRing(parcel, b.minX, b.minX + westDepth, publicHalf.minZ, publicHalf.maxZ),
  ));

  push(region(
    "private-lobby",
    "private-lobby",
    boxRing(parcel, b.minX, b.minX + westDepth, b.minZ, b.minZ + b.span * 0.3),
  ));

  if (parameters.experimentalLobby === "city-side-measured") {
    push(region(
      "north-lobby",
      "experimental-city-side",
      boxRing(parcel, b.minX, b.minX + westDepth * 1.15, b.midZ + b.span * 0.15, b.maxZ - b.span * 0.05),
      "Experimental Lobby · city-side",
    ));
  } else if (parameters.experimentalLobby === "northeast-measured") {
    push(region(
      "north-lobby",
      "experimental-northeast",
      boxRing(parcel, b.maxX - eastShore * 1.2, b.maxX, b.midZ + b.span * 0.2, b.maxZ),
      "Experimental Lobby · northeast",
    ));
  } else if (parameters.experimentalLobby === "northwest-proposed") {
    push(region(
      "north-lobby",
      "experimental-northwest",
      boxRing(parcel, b.minX, b.minX + westDepth, b.maxZ - b.span * 0.3, b.maxZ),
      "Experimental Lobby · northwest",
    ));
  }

  if (parameters.gathering === "continuous") {
    push(region(
      "central-gathering",
      "central-gathering",
      boxRing(parcel, b.maxX - eastShore, b.maxX, b.midZ, b.midZ + b.span * 0.34),
      "Central Gathering · continuous waterfront",
    ));
  } else {
    push(region(
      "central-gathering",
      "central-gathering",
      boxRing(parcel, b.maxX - eastShore, b.maxX, b.midZ - b.span * 0.16, b.midZ + b.span * 0.16),
    ));
    push(region(
      "north-gathering",
      "northern-gathering",
      boxRing(parcel, b.minX + westDepth * 0.6, b.maxX - eastShore * 0.5, b.minZ + (2 * b.span) / 3, b.maxZ),
    ));
  }

  const southMax = b.midZ - b.span * 0.12;
  const inlandMinX = b.minX + Math.min(recessionFt * 0.35, b.width * 0.25);
  push(region(
    "private-gathering",
    "private-gathering",
    boxRing(parcel, inlandMinX, b.maxX - eastShore * 0.35, b.minZ, southMax),
  ));
  push(region(
    "workspace",
    "workspace",
    boxRing(parcel, inlandMinX, b.maxX - eastShore * 0.5, b.minZ, southMax),
    parameters.workspace === "single-south" ? "Workspace · southern field" : ROLE_LABEL.workspace,
  ));

  const built = { spacingFt: 45, parameters, regions };
  mapCache.set(cacheKey, built);
  return built;
}

export function pointInArrivalRegion(x: number, z: number, region: ArrivalZoningRegion) {
  if (region.ring.length < 3) return false;
  return pointInRing(x, z, region.ring.map((point) => [point.x, point.z] as XZ));
}

export function verifyArrivalZoning(
  map: ArrivalZoningMap,
  terminals: readonly { role: ArrivalZoningRole; x: number; z: number }[],
): ArrivalZoningCheck[] {
  const roles: ArrivalZoningRole[] = [
    "primary-lobby",
    "private-lobby",
    "north-lobby",
    "central-gathering",
    "north-gathering",
    "private-gathering",
    "workspace",
  ];
  return roles.map((role) => {
    const regionForRole = map.regions.find((item) => item.role === role) ?? null;
    const matches = terminals.filter((item) => item.role === role);
    if (matches.length === 0) {
      return { role, label: ROLE_LABEL[role], regionLabel: regionForRole?.label ?? null, terminal: null, inside: null };
    }
    const terminal = matches[0];
    return {
      role,
      label: ROLE_LABEL[role],
      regionLabel: regionForRole?.label ?? null,
      terminal: { x: terminal.x, z: terminal.z },
      inside: regionForRole ? pointInArrivalRegion(terminal.x, terminal.z, regionForRole) : false,
    };
  });
}
