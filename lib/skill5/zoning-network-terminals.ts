/**
 * Places network sources and attractors from designer zoning, plus the two
 * Herald Plaza street measured-access sources that paths must grow from.
 * Lobby regions → sources. Gathering and workspace regions → attractors.
 * Points are forced to zone extremes first so large waterfront lobbies cover
 * the north / east edges of the site, then filled by farthest-point sampling.
 */
import type { ArchitecturalRole, NetworkNode } from "@/components/site/site-network";
import { pedestrianCandidates, resolveCandidate } from "@/components/site/site-network-candidates";
import { FLOW_SPACING_FEET } from "@/components/site/site-network-flow";
import { readDesignerZoning } from "./designer-zoning";
import type { SiteContext, XZ } from "./site-model";
import {
  polygonCentroid,
  zoneFacing,
  type ZoneKind,
  type ZonePoint,
  type ZoningRegion,
} from "./zoning";

/** Site-analysis pedestrian access ids on Herald Plaza / NE 15th. */
export const HERALD_STREET_ACCESS_IDS = [
  "pedestrian:access:Potential City-Side Access",
  "pedestrian:access:Potential Northeast Access",
] as const;

/** Default lobby sources per zoning region. */
export const SOURCES_PER_REGION = 4;
/** Default gathering/workspace attractors per zoning region. */
export const ATTRACTORS_PER_REGION = 12;
/** @deprecated Prefer SOURCES_PER_REGION / ATTRACTORS_PER_REGION. */
export const POINTS_PER_REGION = SOURCES_PER_REGION;
/** Gallery / archive layout id for zoning-grown strategy networks. */
export const ZONING_TERMINALS_LAYOUT_ID = "zoning-terminals-v1";
export const ZONING_TERMINALS_LAYOUT_TITLE = "Zoning sources to attractors";
const SEPARATION_FT = 16;
const PROVENANCE = { class: "proposed" as const, unverified: false, evidenceId: null };

export type ZoningTerminalOptions = {
  sourcesPerRegion?: number;
  attractorsPerRegion?: number;
};

export type ZoningTerminalPlacement = {
  nodes: NetworkNode[];
  sources: number;
  attractors: number;
  skipped: string[];
};

function pointInPolygon(x: number, z: number, points: readonly ZonePoint[]) {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const xi = points[i].x;
    const zi = points[i].z;
    const xj = points[j].x;
    const zj = points[j].z;
    const crosses = zi > z !== zj > z;
    if (crosses && x < ((xj - xi) * (z - zi)) / ((zj - zi) || 1e-9) + xi) inside = !inside;
  }
  return inside;
}

function bounds(points: readonly ZonePoint[]) {
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const point of points) {
    minX = Math.min(minX, point.x);
    maxX = Math.max(maxX, point.x);
    minZ = Math.min(minZ, point.z);
    maxZ = Math.max(maxZ, point.z);
  }
  return { minX, maxX, minZ, maxZ };
}

function uniquePoints(points: readonly ZonePoint[], tol = 1.5): ZonePoint[] {
  const out: ZonePoint[] = [];
  for (const point of points) {
    if (out.some((item) => Math.hypot(item.x - point.x, item.z - point.z) < tol)) continue;
    out.push({ x: point.x, z: point.z });
  }
  return out;
}

/** Corner / edge extremes of a region so large zones cover the site edge. */
function regionExtremes(region: ZoningRegion): ZonePoint[] {
  const box = bounds(region.points);
  const picks: ZonePoint[] = [];
  const scores: Array<(point: ZonePoint) => number> = [
    (point) => -point.x,
    (point) => point.x,
    (point) => -point.z,
    (point) => point.z,
    (point) => point.x + point.z,
    (point) => point.x - point.z,
    (point) => -point.x + point.z,
    (point) => -point.x - point.z,
  ];
  for (const score of scores) {
    let best = region.points[0];
    let bestScore = score(best);
    for (const point of region.points) {
      const value = score(point);
      if (value > bestScore) {
        best = point;
        bestScore = value;
      }
    }
    picks.push({ x: best.x, z: best.z });
  }
  const corners = [
    { x: box.minX, z: box.minZ },
    { x: box.maxX, z: box.minZ },
    { x: box.minX, z: box.maxZ },
    { x: box.maxX, z: box.maxZ },
    { x: (box.minX + box.maxX) / 2, z: box.minZ },
    { x: (box.minX + box.maxX) / 2, z: box.maxZ },
    { x: box.minX, z: (box.minZ + box.maxZ) / 2 },
    { x: box.maxX, z: (box.minZ + box.maxZ) / 2 },
  ];
  for (const corner of corners) {
    if (!pointInPolygon(corner.x, corner.z, region.points)) continue;
    picks.push(corner);
  }
  return uniquePoints(picks, 2);
}

/** Dense candidate set inside a region for multi-point placement. */
function samplesInRegion(region: ZoningRegion, step = 5, want = 12): ZonePoint[] {
  const box = bounds(region.points);
  const out: ZonePoint[] = [
    polygonCentroid(region.points),
    ...regionExtremes(region),
  ];
  const spanX = Math.max(1, box.maxX - box.minX);
  const spanZ = Math.max(1, box.maxZ - box.minZ);
  const area = spanX * spanZ;
  const targetPitch = Math.sqrt(Math.max(area, 1) / Math.max(want * 3, 1));
  const pitch = Math.min(step, Math.max(3, Math.min(spanX, spanZ, targetPitch)));
  for (let z = box.minZ; z <= box.maxZ; z += pitch) {
    for (let x = box.minX; x <= box.maxX; x += pitch) {
      if (!pointInPolygon(x, z, region.points)) continue;
      out.push({ x, z });
    }
  }
  for (const point of region.points) out.push({ ...point });
  for (let index = 0; index < region.points.length; index += 1) {
    const a = region.points[index];
    const b = region.points[(index + 1) % region.points.length];
    out.push({ x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 });
    out.push({ x: a.x * 0.67 + b.x * 0.33, z: a.z * 0.67 + b.z * 0.33 });
    out.push({ x: a.x * 0.33 + b.x * 0.67, z: a.z * 0.33 + b.z * 0.67 });
  }
  return uniquePoints(out, 1);
}

/**
 * Extremes first (site edges), then farthest-point fill so points span the whole zone.
 */
function spreadPointsInRegion(region: ZoningRegion, count: number): ZonePoint[] {
  const candidates = samplesInRegion(region, 4, Math.max(count * 2, 16));
  if (candidates.length === 0) return [];
  const center = polygonCentroid(region.points);
  const chosen: ZonePoint[] = [];

  for (const extreme of regionExtremes(region)) {
    if (chosen.length >= count) break;
    if (chosen.some((point) => Math.hypot(point.x - extreme.x, point.z - extreme.z) < SEPARATION_FT * 0.45)) continue;
    chosen.push(extreme);
  }
  if (chosen.length === 0) chosen.push({ x: center.x, z: center.z });

  while (chosen.length < count) {
    let best: ZonePoint | null = null;
    let bestScore = -1;
    for (const candidate of candidates) {
      let nearest = Infinity;
      for (const point of chosen) {
        nearest = Math.min(nearest, Math.hypot(candidate.x - point.x, candidate.z - point.z));
      }
      if (nearest > bestScore) {
        bestScore = nearest;
        best = candidate;
      }
    }
    if (!best || bestScore < 0.75) {
      const angle = ((chosen.length - 1) / Math.max(1, count - 1)) * Math.PI * 2 * 1.7;
      const radius = Math.max(8, SEPARATION_FT * 0.5) * (0.6 + (chosen.length % 5) * 0.25);
      chosen.push({
        x: center.x + Math.cos(angle) * radius,
        z: center.z + Math.sin(angle) * radius,
      });
      continue;
    }
    chosen.push(best);
  }
  return chosen.slice(0, count);
}

/**
 * After per-region placement, push the most clustered terminals toward empty
 * extremes of their own zones so the set covers the full zoning footprint.
 */
function rebalanceAcrossSite(drafts: Draft[]) {
  const zoneSamples = new Map<string, ZonePoint[]>();
  for (const draft of drafts) {
    if (!zoneSamples.has(draft.region.id)) {
      zoneSamples.set(draft.region.id, samplesInRegion(draft.region, 4, 24));
    }
  }
  for (let pass = 0; pass < 4; pass += 1) {
    for (const draft of drafts) {
      let nearestSame = Infinity;
      for (const other of drafts) {
        if (other === draft) continue;
        nearestSame = Math.min(nearestSame, Math.hypot(other.x - draft.x, other.z - draft.z));
      }
      if (nearestSame >= SEPARATION_FT) continue;
      const samples = zoneSamples.get(draft.region.id) ?? [];
      let best: ZonePoint | null = null;
      let bestScore = -1;
      for (const sample of samples) {
        let nearest = Infinity;
        for (const other of drafts) {
          if (other === draft) continue;
          nearest = Math.min(nearest, Math.hypot(other.x - sample.x, other.z - sample.z));
        }
        // Prefer emptier site locations, especially farther north / east when tied.
        const score = nearest + sample.z * 0.02 + sample.x * 0.01;
        if (score > bestScore) {
          bestScore = score;
          best = sample;
        }
      }
      if (!best) continue;
      draft.x = best.x;
      draft.z = best.z;
      draft.note = `${draft.note.replace(/ · spread$/, "")} · spread`;
    }
  }
}

function kindRole(
  kind: ZoneKind,
  facing: ReturnType<typeof zoneFacing>,
  lobbyIndex: number,
  gatheringIndex: number,
): ArchitecturalRole {
  if (kind === "workspace") return "workspace";
  if (kind === "gathering") {
    if (gatheringIndex === 0) return "central-gathering";
    if (facing === "city") return "north-gathering";
    return "private-gathering";
  }
  if (lobbyIndex === 0) return "primary-lobby";
  if (lobbyIndex === 1) return "private-lobby";
  return "north-lobby";
}

function nodeKind(kind: ZoneKind): "source" | "attractor" {
  return kind === "lobby" ? "source" : "attractor";
}

/** Large waterfront lobbies get extra sources so the north / east edge stays populated. */
function sourcesForRegion(region: ZoningRegion, base: number) {
  const box = bounds(region.points);
  const span = Math.hypot(box.maxX - box.minX, box.maxZ - box.minZ);
  if (region.kind !== "lobby") return base;
  if (span > 180) return base + 2;
  if (span > 120) return base + 1;
  return base;
}

type Draft = {
  region: ZoningRegion;
  slot: number;
  kind: "source" | "attractor";
  role: ArchitecturalRole;
  x: number;
  z: number;
  note: string;
};

/**
 * The two Herald Plaza street access contacts from site analysis.
 * Paths grow from these sources into the zoning attractors.
 */
export function heraldPlazaStreetSources(
  site: SiteContext,
  openLand: (x: number, z: number) => boolean,
  cellFeet = FLOW_SPACING_FEET,
): NetworkNode[] {
  const toward = site.site.ring.reduce(
    (sum, point) => [sum[0] + point[0], sum[1] + point[1]],
    [0, 0] as [number, number],
  );
  const towardX = toward[0] / Math.max(1, site.site.ring.length);
  const towardZ = toward[1] / Math.max(1, site.site.ring.length);
  const wanted = new Set<string>(HERALD_STREET_ACCESS_IDS);
  const nodes: NetworkNode[] = [];

  for (const candidate of pedestrianCandidates()) {
    if (candidate.role !== "access" || !wanted.has(candidate.id)) continue;
    const resolved = resolveCandidate(candidate, openLand, cellFeet, towardX, towardZ);
    if (!resolved) continue;
    const city = /city-side|herald/i.test(`${candidate.title} ${candidate.sidewalk ?? ""} ${candidate.side ?? ""}`);
    const role: ArchitecturalRole = city ? "primary-lobby" : "north-lobby";
    nodes.push({
      id: candidate.id.includes("City-Side") ? "street-herald-plz" : "street-ne-15th",
      kind: "source",
      x: resolved.x,
      z: resolved.z,
      recordId: candidate.id,
      measuredX: candidate.measuredX,
      measuredZ: candidate.measuredZ,
      architecture: { role, provenance: { class: "measured", unverified: true, evidenceId: candidate.id } },
      strategy: {
        layoutId: ZONING_TERMINALS_LAYOUT_ID,
        origin: "measured-access",
        unverified: true,
        note: `${candidate.title} · ${candidate.sidewalk ?? "Herald Plaza street"} · measured access`,
        shoreFeet: null,
        waterfrontFeet: null,
        openRays: null,
        macarthurFeet: null,
        exposed: null,
        shaded: null,
      },
    });
  }
  return nodes;
}

/**
 * Build source/attractor terminals from designer zoning plus Herald Plaza street accesses.
 * `openLand` resolves the street contacts onto the same open mask the flow uses.
 */
export function terminalsFromDesignerZoning(
  site: SiteContext,
  options: ZoningTerminalOptions & {
    openLand?: (x: number, z: number) => boolean;
  } = {},
): ZoningTerminalPlacement {
  const sourcesPerRegion = Math.max(1, options.sourcesPerRegion ?? SOURCES_PER_REGION);
  const attractorsPerRegion = Math.max(1, options.attractorsPerRegion ?? ATTRACTORS_PER_REGION);
  const regions = readDesignerZoning().regions.filter((region) => region.points.length >= 3 && region.visible !== false);
  if (regions.length === 0) {
    return { nodes: [], sources: 0, attractors: 0, skipped: ["no designer zoning regions"] };
  }

  const parcel = site.site.ring as readonly XZ[];
  const water = site.water.ring as readonly XZ[];
  const drafts: Draft[] = [];
  let lobbyIndex = 0;
  let gatheringIndex = 0;
  const skipped: string[] = [];

  const ordered = [...regions].sort((a, b) => {
    const order: Record<ZoneKind, number> = { lobby: 0, gathering: 1, workspace: 2 };
    const byKind = order[a.kind] - order[b.kind];
    if (byKind !== 0) return byKind;
    const ca = polygonCentroid(a.points);
    const cb = polygonCentroid(b.points);
    return ca.z - cb.z || ca.x - cb.x;
  });

  for (const region of ordered) {
    const center = polygonCentroid(region.points);
    const facing = zoneFacing(center, parcel, water);
    const role = kindRole(
      region.kind,
      facing,
      region.kind === "lobby" ? lobbyIndex : 0,
      region.kind === "gathering" ? gatheringIndex : 0,
    );
    if (region.kind === "lobby") lobbyIndex += 1;
    if (region.kind === "gathering") gatheringIndex += 1;

    const perRegion = region.kind === "lobby"
      ? sourcesForRegion(region, sourcesPerRegion)
      : attractorsPerRegion;
    const points = spreadPointsInRegion(region, perRegion);
    points.forEach((point, slot) => {
      drafts.push({
        region,
        slot,
        kind: nodeKind(region.kind),
        role,
        x: point.x,
        z: point.z,
        note: `${region.name || region.id} · ${region.kind} zoning · ${facing ?? "site"} · point ${slot + 1}/${perRegion}`,
      });
    });
  }

  rebalanceAcrossSite(drafts);

  // When a source sits on top of an attractor, keep the attractor and push the source inside its lobby.
  const attractors = drafts.filter((item) => item.kind === "attractor");
  for (const draft of drafts) {
    if (draft.kind !== "source") continue;
    const clash = attractors.find((item) => Math.hypot(item.x - draft.x, item.z - draft.z) < SEPARATION_FT);
    if (!clash) continue;
    let best: ZonePoint | null = null;
    let bestDist = -1;
    for (const sample of samplesInRegion(draft.region, 4, 20)) {
      const away = Math.hypot(sample.x - clash.x, sample.z - clash.z);
      const selfClear = drafts
        .filter((item) => item !== draft && item.kind === "source" && item.region.id === draft.region.id)
        .every((item) => Math.hypot(sample.x - item.x, sample.z - item.z) >= SEPARATION_FT * 0.5);
      if (away < SEPARATION_FT || !selfClear) continue;
      // Prefer keeping northern / eastern coverage when separating.
      const score = away + sample.z * 0.05 + sample.x * 0.03;
      if (score > bestDist) {
        bestDist = score;
        best = sample;
      }
    }
    if (!best) {
      let far: ZonePoint | null = null;
      let farDist = -1;
      for (const corner of draft.region.points) {
        const dist = Math.hypot(corner.x - clash.x, corner.z - clash.z) + corner.z * 0.05;
        if (dist > farDist) {
          farDist = dist;
          far = corner;
        }
      }
      if (far) {
        const span = Math.hypot(far.x - clash.x, far.z - clash.z) || 1;
        best = {
          x: clash.x + ((far.x - clash.x) / span) * Math.min(span, SEPARATION_FT),
          z: clash.z + ((far.z - clash.z) / span) * Math.min(span, SEPARATION_FT),
        };
      }
    }
    if (best) {
      draft.x = best.x;
      draft.z = best.z;
      draft.note = `${draft.note} · offset from overlapping ${clash.region.id}`;
    } else {
      skipped.push(`${draft.region.id}#${draft.slot} could not separate from ${clash.region.id}`);
    }
  }

  const zoningNodes: NetworkNode[] = drafts.map((draft) => ({
    id: `z-${draft.region.id}-${draft.slot + 1}`,
    kind: draft.kind,
    x: draft.x,
    z: draft.z,
    architecture: { role: draft.role, provenance: PROVENANCE },
    strategy: {
      layoutId: ZONING_TERMINALS_LAYOUT_ID,
      origin: "internal" as const,
      unverified: false,
      note: draft.note,
      shoreFeet: null,
      waterfrontFeet: null,
      openRays: null,
      macarthurFeet: null,
      exposed: null,
      shaded: null,
    },
  }));

  // Street accesses lead the node list so growth starts from Herald Plaza / NE 15th.
  const street = options.openLand ? heraldPlazaStreetSources(site, options.openLand) : [];
  if (options.openLand && street.length < HERALD_STREET_ACCESS_IDS.length) {
    skipped.push(`Herald Plaza street sources resolved ${street.length}/${HERALD_STREET_ACCESS_IDS.length}`);
  }
  const nodes = [...street, ...zoningNodes];

  return {
    nodes,
    sources: nodes.filter((node) => node.kind === "source").length,
    attractors: nodes.filter((node) => node.kind === "attractor").length,
    skipped,
  };
}
