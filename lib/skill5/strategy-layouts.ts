import { inStudy } from "@/components/site/site-geometry";
import { resolveCandidate, pedestrianCandidates } from "@/components/site/site-network-candidates";
import { FLOW_SPACING_FEET } from "@/components/site/site-network-flow";
import type { NetworkNode, StrategyNodeTrace, StrategyOrigin } from "@/components/site/site-network";
import inputs from "@/data/skill5/site-inputs-v1.json";
import { pointInRing } from "@/lib/skill5/placement";
import { closeApproaches } from "@/lib/skill5/pedestrian";
import { representativeSolarDates, solarAt } from "@/lib/skill5/solar";
import type { SiteContext, XZ } from "@/lib/skill5/site-model";
import { assessNetworkDomain } from "@/components/site/site-network-domain";
import { analysisTowers } from "@/lib/skill5/sun-analysis";
import { parcelSunExposure, type ExposureMass } from "@/lib/skill5/sun-exposure";
import { noiseReading, viewReading, type ViewPoint } from "@/lib/skill5/views-noise";
import { windSummary } from "@/lib/skill5/wind";

/** Existing trail reach. This is network reach, not architectural site occupation. */
export const NETWORK_REACH_FT = 7.5;

export const STRATEGY_LAYOUT_DEFAULTS = {
  cityEdgeSpacingFt: 180,
  mappedApproachFt: 15,
  includeMappedApproaches: false,
  /** 0 is the south end of the open land. 1 is the north end. */
  emphasisCenter: 0.5,
  emphasisExtentFt: 250,
  emphasisIntensity: 0.65,
  seedsPerLayout: 3,
  sun: false,
  wind: false,
} as const;

export type StrategyLayoutSettings = {
  cityEdgeSpacingFt: number;
  mappedApproachFt: number;
  includeMappedApproaches: boolean;
  emphasisCenter: number;
  emphasisExtentFt: number;
  emphasisIntensity: number;
  seedsPerLayout: number;
  sun: boolean;
  wind: boolean;
};

export type StrategyLayout = {
  id: string;
  title: string;
  family: "waterfront" | "internal" | "road-buffered" | "sketch";
  settings: StrategyLayoutSettings;
  seeds: number[];
  nodes: NetworkNode[];
  notes: string[];
  /** Published view stands reproduced by viewReading. */
  viewsChecked: boolean;
  windFromDegrees: number | null;
};

type Cell = {
  x: number;
  z: number;
  /** Nearest distance to the coastline polyline. */
  waterfrontFeet: number;
  /** Nearest open sightline. Null when the shore is blocked or out of range. */
  shoreFeet: number | null;
  openRays: number | null;
  macarthurFeet: number | null;
};

const SEED_BASE = 20261105;
const SEED_STEP = 104729;
const MIN_GAP_FT = 70;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function hypot(x: number, z: number, ox: number, oz: number) {
  return Math.hypot(x - ox, z - oz);
}

function publishedViewPoints() {
  const group = (inputs as { groups?: { id?: string; records?: { id?: string; geometry?: { x?: number; z?: number }; quantities?: { id?: string; value?: number }[] }[] }[] }).groups?.find((item) => item.id === "views-points-eye-5-5");
  return (group?.records ?? []).flatMap((record) => {
    const x = record.geometry?.x;
    const z = record.geometry?.z;
    const openRays = record.quantities?.find((item) => item.id === "openRays")?.value;
    const shoreRays = record.quantities?.find((item) => item.id === "shoreRays")?.value;
    if (typeof x !== "number" || typeof z !== "number" || typeof openRays !== "number" || typeof shoreRays !== "number") return [];
    return [{ id: record.id ?? "", x, z, openRays, shoreRays }];
  });
}

function openAt(domain: ReturnType<typeof assessNetworkDomain>, x: number, z: number) {
  if (domain.boundary.length < 3 || !pointInRing(x, z, domain.boundary)) return false;
  if (domain.water && pointInRing(x, z, domain.water)) return false;
  return !domain.obstacles.some((obstacle) => pointInRing(x, z, obstacle.ring) && !obstacle.holes.some((hole) => pointInRing(x, z, hole)));
}

function inward(x: number, z: number, towardX: number, towardZ: number, open: (x: number, z: number) => boolean) {
  if (open(x, z)) return { x, z };
  const dx = towardX - x;
  const dz = towardZ - z;
  const length = Math.hypot(dx, dz);
  if (length < 1e-6) return null;
  for (let distance = 1; distance <= 40; distance += 1) {
    const nextX = x + (dx / length) * distance;
    const nextZ = z + (dz / length) * distance;
    if (open(nextX, nextZ)) return { x: nextX, z: nextZ };
  }
  return null;
}

function westSamples(ring: readonly XZ[], spacing: number) {
  const west = Math.min(...ring.map((point) => point[0]));
  const points: { x: number; z: number }[] = [];
  for (let index = 0; index < ring.length; index += 1) {
    const a = ring[index];
    const b = ring[(index + 1) % ring.length];
    if (a[0] > west + 30 || b[0] > west + 30) continue;
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const count = Math.max(1, Math.round(length / spacing));
    for (let step = 0; step < count; step += 1) {
      const t = count === 1 ? 0.5 : step / count;
      points.push({ x: a[0] + (b[0] - a[0]) * t, z: a[1] + (b[1] - a[1]) * t });
    }
  }
  return points;
}

function sameCell(a: Cell, b: Cell) {
  return a.x === b.x && a.z === b.z;
}

function median(values: readonly number[]) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function distanceToPath(x: number, z: number, path: readonly XZ[]) {
  let best = Infinity;
  for (let index = 1; index < path.length; index += 1) {
    const [ax, az] = path[index - 1];
    const [bx, bz] = path[index];
    const dx = bx - ax;
    const dz = bz - az;
    const length = dx * dx + dz * dz;
    const t = length === 0 ? 0 : Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / length));
    best = Math.min(best, Math.hypot(x - (ax + dx * t), z - (az + dz * t)));
  }
  return best;
}

function farthest(pool: readonly Cell[], count: number, first: Cell) {
  const chosen = [first];
  while (chosen.length < count) {
    let best: Cell | null = null;
    let bestDistance = -1;
    for (const cell of pool) {
      if (chosen.some((item) => sameCell(item, cell))) continue;
      const distance = Math.min(...chosen.map((item) => hypot(cell.x, cell.z, item.x, item.z)));
      if (distance > bestDistance) {
        bestDistance = distance;
        best = cell;
      }
    }
    if (!best || bestDistance < MIN_GAP_FT) break;
    chosen.push(best);
  }
  return chosen;
}

/** Shore distance the emphasis curve asks for. Smaller means closer to the coastline. */
function targetShore(z: number, centerZ: number, extentFt: number, intensity: number, nearFeet: number, farFeet: number) {
  const half = extentFt / 2;
  const along = 1 - Math.min(1, Math.abs(z - centerZ) / Math.max(1, half));
  return farFeet - intensity * along * (farFeet - nearFeet);
}

function emphasisCells(pool: readonly Cell[], count: number, centerZ: number, extentFt: number, intensity: number) {
  const half = extentFt / 2;
  const band = pool.filter((cell) => Math.abs(cell.z - centerZ) <= half);
  const field = band.length >= Math.min(count, 3) ? band : pool;
  const nearFeet = Math.min(...field.map((cell) => cell.waterfrontFeet));
  const farFeet = Math.max(...field.map((cell) => cell.waterfrontFeet));
  const center = [...field].sort((a, b) => {
    const da = Math.abs(a.waterfrontFeet - targetShore(a.z, centerZ, extentFt, intensity, nearFeet, farFeet)) + Math.abs(a.z - centerZ) * 0.25;
    const db = Math.abs(b.waterfrontFeet - targetShore(b.z, centerZ, extentFt, intensity, nearFeet, farFeet)) + Math.abs(b.z - centerZ) * 0.25;
    return da - db;
  })[0];
  const chosen = [center];
  const fartherThanCenter = center.waterfrontFeet + Math.max(40, (farFeet - center.waterfrontFeet) * 0.35);
  const takeEnd = (direction: number) => {
    const candidates = field.filter((cell) => {
      if (chosen.some((item) => sameCell(item, cell))) return false;
      if ((cell.z - center.z) * direction < MIN_GAP_FT * 0.5) return false;
      return cell.waterfrontFeet > fartherThanCenter;
    });
    candidates.sort((a, b) => {
      const da = Math.abs(a.waterfrontFeet - targetShore(a.z, centerZ, extentFt, intensity, nearFeet, farFeet));
      const db = Math.abs(b.waterfrontFeet - targetShore(b.z, centerZ, extentFt, intensity, nearFeet, farFeet));
      return da - db || Math.abs(Math.abs(b.z - center.z) - half) - Math.abs(Math.abs(a.z - center.z) - half);
    });
    if (candidates[0]) chosen.push(candidates[0]);
  };
  takeEnd(-1);
  takeEnd(1);
  while (chosen.length < count) {
    let best: Cell | null = null;
    let bestDistance = -1;
    for (const cell of field) {
      if (chosen.some((item) => sameCell(item, cell))) continue;
      if (cell.waterfrontFeet <= fartherThanCenter) continue;
      const distance = Math.min(...chosen.map((item) => hypot(cell.x, cell.z, item.x, item.z)));
      if (distance > bestDistance) {
        bestDistance = distance;
        best = cell;
      }
    }
    if (!best || bestDistance < MIN_GAP_FT) break;
    chosen.push(best);
  }
  return chosen;
}

function inlandCells(pool: readonly Cell[], count: number, side: "south" | "north", centerZ: number) {
  const limit = median(pool.map((cell) => cell.waterfrontFeet));
  let inland = pool.filter((cell) => cell.waterfrontFeet >= limit && (side === "south" ? cell.z <= centerZ : cell.z >= centerZ));
  if (inland.length < count) inland = pool.filter((cell) => cell.waterfrontFeet >= limit);
  if (inland.length === 0) return pool.slice(0, count);
  const first = [...inland].sort((a, b) => b.waterfrontFeet - a.waterfrontFeet || (side === "south" ? a.z - b.z : b.z - a.z))[0];
  return farthest(inland, count, first);
}

function roadCells(pool: readonly Cell[], count: number, ends: boolean) {
  const measured = pool.filter((cell) => cell.macarthurFeet !== null);
  const field = measured.length > 0 ? measured : pool;
  const limit = median(field.map((cell) => cell.waterfrontFeet));
  const inland = field.filter((cell) => cell.waterfrontFeet >= limit);
  const quiet = inland.length > 0 ? inland : field;
  if (!ends) {
    const first = [...quiet].sort((a, b) => (b.macarthurFeet ?? -1) - (a.macarthurFeet ?? -1))[0];
    return farthest(quiet, count, first);
  }
  const south = Math.min(...quiet.map((cell) => cell.z));
  const north = Math.max(...quiet.map((cell) => cell.z));
  const span = Math.max(1, north - south);
  const pick = (low: number, high: number) => [...quiet]
    .filter((cell) => cell.z >= low && cell.z <= high)
    .sort((a, b) => (b.macarthurFeet ?? -1) - (a.macarthurFeet ?? -1))[0] ?? null;
  const chosen = [pick(south, south + span * 0.45), pick(north - span * 0.45, north)].filter((cell): cell is Cell => cell !== null)
    .filter((cell, index, list) => list.findIndex((other) => sameCell(other, cell)) === index);
  const first = chosen[0] ?? [...quiet].sort((a, b) => (b.macarthurFeet ?? -1) - (a.macarthurFeet ?? -1))[0];
  const spread = farthest(quiet, count, first);
  for (const cell of chosen) {
    if (!spread.some((item) => sameCell(item, cell)) && spread.length < count) spread.push(cell);
  }
  return spread.slice(0, count);
}

function trace(layoutId: string, origin: StrategyOrigin, unverified: boolean, note: string, cell: Cell, sun: { exposed: boolean | null; shaded: boolean | null }): StrategyNodeTrace {
  return {
    layoutId,
    origin,
    unverified,
    note,
    shoreFeet: cell.shoreFeet,
    waterfrontFeet: cell.waterfrontFeet,
    openRays: cell.openRays,
    macarthurFeet: cell.macarthurFeet,
    exposed: sun.exposed,
    shaded: sun.shaded,
  };
}

function measureCell(x: number, z: number, site: SiteContext, towers: ReturnType<typeof analysisTowers>, shorePath: readonly XZ[]): Cell {
  const point: ViewPoint = { id: "center", label: "Candidate", x, z };
  const view = viewReading(point, 5.5, site.buildings, site.coastline.path, inStudy, towers);
  const open = view.rays.filter((ray) => ray.open && ray.shoreFeet !== null);
  const shoreFeet = open.length === 0 ? null : Math.min(...open.map((ray) => ray.shoreFeet ?? Infinity));
  const noise = noiseReading(point, site.roads);
  const waterfrontFeet = distanceToPath(x, z, shorePath);
  return { x, z, waterfrontFeet, shoreFeet: Number.isFinite(shoreFeet ?? Infinity) ? shoreFeet : null, openRays: view.openRays, macarthurFeet: noise.macarthur.feet };
}

/**
 * Builds distinct source and attractor layouts from the published measurements
 * and the open parcel. It does not run the solver or write saved iterations.
 */
export function buildStrategyLayouts(site: SiteContext, settings: StrategyLayoutSettings = { ...STRATEGY_LAYOUT_DEFAULTS }): StrategyLayout[] {
  const citySpacing = clamp(settings.cityEdgeSpacingFt, 40, 400);
  const approachFt = clamp(settings.mappedApproachFt, 1, 80);
  const center = clamp(settings.emphasisCenter, 0, 1);
  const extentFt = clamp(settings.emphasisExtentFt, 40, 800);
  const intensity = clamp(settings.emphasisIntensity, 0, 1);
  const seedCount = clamp(Math.round(settings.seedsPerLayout), 1, 8);
  const domain = assessNetworkDomain({
    parcel: site.site.ring,
    water: site.water.ring,
    buildings: site.buildings.map((building) => ({ id: building.id, ring: building.ring, holes: building.holes })),
  });
  const open = (x: number, z: number) => openAt(domain, x, z);
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  let towardX = 0;
  let towardZ = 0;
  let count = 0;
  for (const [x, z] of site.site.ring) {
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minZ = Math.min(minZ, z);
    maxZ = Math.max(maxZ, z);
    towardX += x;
    towardZ += z;
    count += 1;
  }
  towardX /= Math.max(1, count);
  towardZ /= Math.max(1, count);
  const towers = analysisTowers(site.buildings);
  const viewsChecked = publishedViewPoints().every((point) => {
    const reading = viewReading({ id: "center", label: point.id, x: point.x, z: point.z }, 5.5, site.buildings, site.coastline.path, inStudy, towers);
    return reading.openRays === point.openRays && reading.shoreRays === point.shoreRays;
  });
  const shorePath = site.coastline.path.length > 1 ? site.coastline.path : site.water.ring;
  const cells: Cell[] = [];
  for (let z = minZ; z <= maxZ; z += FLOW_SPACING_FEET) {
    for (let x = minX; x <= maxX; x += FLOW_SPACING_FEET) {
      if (!open(x, z)) continue;
      cells.push(measureCell(x, z, site, towers, shorePath));
    }
  }
  if (cells.length === 0) return [];
  const openMinZ = Math.min(...cells.map((cell) => cell.z));
  const openMaxZ = Math.max(...cells.map((cell) => cell.z));
  const centerZ = openMinZ + center * (openMaxZ - openMinZ);

  const measured = pedestrianCandidates().filter((candidate) => candidate.role === "access").flatMap((candidate) => {
    const resolved = resolveCandidate(candidate, open, FLOW_SPACING_FEET, towardX, towardZ);
    if (!resolved) return [];
    return [{ candidate, resolved }];
  });

  const cityEdge = westSamples(site.site.ring, citySpacing).flatMap((point) => {
    const resolved = inward(point.x, point.z, towardX, towardZ, open);
    if (!resolved) return [];
    if (measured.some((item) => hypot(resolved.x, resolved.z, item.resolved.x, item.resolved.z) < 40)) return [];
    return [resolved];
  }).filter((point, index, list) => list.findIndex((other) => hypot(point.x, point.z, other.x, other.z) < 40) === index);

  const mapped = settings.includeMappedApproaches
    ? closeApproaches(site.site.ring, approachFt).flatMap((approach) => {
      const resolved = inward(approach.boundaryX, approach.boundaryZ, towardX, towardZ, open);
      if (!resolved) return [];
      if (measured.some((item) => hypot(resolved.x, resolved.z, item.resolved.x, item.resolved.z) < 40)) return [];
      return [{ approach, resolved }];
    }).filter((item, index, list) => list.findIndex((other) => hypot(item.resolved.x, item.resolved.z, other.resolved.x, other.resolved.z) < 40) === index)
    : [];

  let exposure: { exposed: boolean; x: number; z: number }[] | null = null;
  let windFromDegrees: number | null = null;
  if (settings.sun) {
    const dates = representativeSolarDates(site.origin.lat, site.origin.lon, 2026);
    const sample = dates ? solarAt(site.origin.lat, site.origin.lon, dates.spring, "12:30") : null;
    const masses: ExposureMass[] = [
      ...site.buildings.filter((building) => building.heightFeet !== null && building.heightFeet > 0).map((building) => ({ ring: building.ring, heightFeet: building.heightFeet ?? 0 })),
      ...towers.map((tower) => ({ ring: tower.ring, heightFeet: tower.heightFeet })),
    ];
    const grid = sample ? parcelSunExposure(site.site.ring, masses, sample.toSun, 40, []) : null;
    exposure = grid ? grid.cells.map((cell) => ({ x: cell.x, z: cell.z, exposed: cell.exposed })) : null;
  }
  if (settings.wind) {
    windFromDegrees = windSummary("year", 0, "all").prevailing?.meanFrom ?? null;
  }

  const sunAt = (x: number, z: number) => {
    if (!exposure) return { exposed: null, shaded: null };
    let nearest = exposure[0];
    let best = Infinity;
    for (const cell of exposure) {
      const distance = hypot(x, z, cell.x, cell.z);
      if (distance < best) {
        best = distance;
        nearest = cell;
      }
    }
    if (!nearest || best > 40) return { exposed: null, shaded: null };
    return { exposed: nearest.exposed, shaded: !nearest.exposed };
  };

  const sourceNode = (id: string, layoutId: string, origin: StrategyOrigin, unverified: boolean, note: string, x: number, z: number, recordId?: string): NetworkNode => {
    const cell = measureCell(x, z, site, towers, shorePath);
    return {
      id,
      kind: "source",
      x,
      z,
      recordId,
      measuredX: origin === "measured-access" ? x : undefined,
      measuredZ: origin === "measured-access" ? z : undefined,
      strategy: trace(layoutId, origin, unverified, note, cell, sunAt(x, z)),
    };
  };

  const shoreLimit = median(cells.map((cell) => cell.waterfrontFeet));
  const attractorOrigin = (cell: Cell, requested: StrategyLayout["family"], emphasis: boolean): StrategyOrigin => {
    if (requested === "road-buffered") return "road-buffered";
    if (emphasis && cell.waterfrontFeet <= shoreLimit) return "waterfront";
    return "internal";
  };
  const attractorNote = (cell: Cell, origin: StrategyOrigin) => {
    const sight = cell.openRays === null
      ? "Sightlines were not measured."
      : cell.shoreFeet === null
        ? `${cell.openRays} open sightlines. None reaches the coastline.`
        : `${cell.openRays} open sightlines. The nearest open shore is ${Math.round(cell.shoreFeet)} ft.`;
    if (origin === "waterfront") return `Near the coastline, ${Math.round(cell.waterfrontFeet)} ft. ${sight} The published stands are a check, not this position.`;
    if (origin === "road-buffered") return `Inland of the coastline, ${Math.round(cell.waterfrontFeet)} ft. Placed from MacArthur centerline distance. ${sight}`;
    return `Inland destination, ${Math.round(cell.waterfrontFeet)} ft from the coastline. ${sight} An open sightline does not make this a waterfront location.`;
  };
  const attractorNodes = (layoutId: string, family: StrategyLayout["family"], wanted: number, mode: "emphasis" | "inland-south" | "inland-north" | "road-spread" | "road-ends") => {
    const chosen = mode === "emphasis"
      ? emphasisCells(cells, wanted, centerZ, extentFt, intensity)
      : mode === "inland-south"
        ? inlandCells(cells, wanted, "south", centerZ)
        : mode === "inland-north"
          ? inlandCells(cells, wanted, "north", centerZ)
          : roadCells(cells, wanted, mode === "road-ends");
    return chosen.map((cell, index) => {
      const origin = attractorOrigin(cell, family, mode === "emphasis" && family === "waterfront");
      return {
        id: `a${index + 1}`,
        kind: "attractor" as const,
        x: cell.x,
        z: cell.z,
        strategy: trace(layoutId, origin, false, attractorNote(cell, origin), cell, sunAt(cell.x, cell.z)),
      };
    });
  };

  const specs: { id: string; title: string; family: StrategyLayout["family"]; sources: "herald" | "northeast" | "both" | "city" | "city-measured" | "mapped"; attractors: number; mode: "emphasis" | "inland-south" | "inland-north" | "road-spread" | "road-ends" }[] = [
    { id: "measured-herald-waterfront", title: "Herald contact, waterfront attractors", family: "waterfront", sources: "herald", attractors: 3, mode: "emphasis" },
    { id: "measured-northeast-internal", title: "Northeast contact, inland attractors", family: "internal", sources: "northeast", attractors: 3, mode: "inland-south" },
    { id: "measured-both-waterfront", title: "Both contacts, waterfront attractors", family: "waterfront", sources: "both", attractors: 4, mode: "emphasis" },
    { id: "city-edge-internal", title: "City-edge proposals, inland attractors", family: "internal", sources: "city", attractors: 2, mode: "inland-north" },
    { id: "city-edge-road", title: "City-edge proposals, road-buffered attractors", family: "road-buffered", sources: "city", attractors: 4, mode: "road-spread" },
    { id: "measured-both-road", title: "Both contacts, road-buffered attractors", family: "road-buffered", sources: "both", attractors: 2, mode: "road-ends" },
  ];
  if (settings.includeMappedApproaches) {
    specs.push({ id: "mapped-waterfront", title: "Mapped approaches, waterfront attractors", family: "waterfront", sources: "mapped", attractors: 3, mode: "emphasis" });
  }

  const layouts: StrategyLayout[] = [];
  specs.forEach((spec, index) => {
    const notes: string[] = [];
    if (!viewsChecked) notes.push("viewReading did not reproduce the published stands. Shore distance still uses the coastline polyline.");
    if (settings.wind) notes.push(windFromDegrees === null ? "The wind summary has no prevailing direction." : `Wind is evaluation-only. Airport direction ${windFromDegrees.toFixed(1)}° from north. It does not move nodes.`);
    if (settings.sun) notes.push(exposure ? "Sun reports exposure and shade at the nodes. Neither is preferred." : "The sun grid could not be calculated, so exposure is unmeasured.");
    const nodes: NetworkNode[] = [];
    const pushMeasured = (side: "city" | "waterfront") => {
      const found = measured.find((item) => item.candidate.side === side);
      if (!found) {
        notes.push(side === "city" ? "The city-side access contact did not resolve onto open land." : "The northeast access contact did not resolve onto open land.");
        return;
      }
      nodes.push(sourceNode(
        `s${nodes.length + 1}`,
        spec.id,
        "measured-access",
        true,
        `${found.candidate.title}. Unverified gap, not an entrance.`,
        found.resolved.x,
        found.resolved.z,
        found.candidate.id,
      ));
    };
    if (spec.sources === "herald" || spec.sources === "both" || spec.sources === "city-measured") pushMeasured("city");
    if (spec.sources === "northeast" || spec.sources === "both" || spec.sources === "city-measured") pushMeasured("waterfront");
    if (spec.sources === "city" || spec.sources === "city-measured") {
      for (const point of cityEdge) {
        nodes.push(sourceNode(`s${nodes.length + 1}`, spec.id, "city-edge", false, "Design proposal on the city edge. Not a measured entrance.", point.x, point.z));
      }
    }
    if (spec.sources === "mapped") {
      for (const item of mapped) {
        nodes.push(sourceNode(`s${nodes.length + 1}`, spec.id, "mapped-approach", false, `${item.approach.name}. Mapped line within ${approachFt} ft. Not an entrance.`, item.resolved.x, item.resolved.z, item.approach.id));
      }
    }
    const attractors = attractorNodes(spec.id, spec.family, spec.attractors, spec.mode);
    nodes.push(...attractors);
    if (!nodes.some((node) => node.kind === "source") || attractors.length === 0) {
      notes.push("This layout has no runnable source and attractor pair, so it was left out.");
      return;
    }
    const seeds = Array.from({ length: seedCount }, (_, seedIndex) => (SEED_BASE + (index + 1) * SEED_STEP + seedIndex * SEED_STEP) >>> 0);
    layouts.push({
      id: spec.id,
      title: spec.title,
      family: spec.family,
      settings: { ...settings, cityEdgeSpacingFt: citySpacing, mappedApproachFt: approachFt, emphasisCenter: center, emphasisExtentFt: extentFt, emphasisIntensity: intensity, seedsPerLayout: seedCount },
      seeds,
      nodes,
      notes,
      viewsChecked,
      windFromDegrees,
    });
  });
  return layouts;
}

/** Inland step of the north and south destinations behind the central waterfront attractor. */
export const SKETCH_RECESSION_FT = 80;

const SKETCH_SEED_BASE = 20261121;

export type SketchLayoutSettings = {
  recessionFt: number;
  seedsPerLayout: number;
};

/**
 * Two source alternatives for the sketch experiment. The northeast measured
 * access is included in one and left out of the other. The Site Analysis
 * contact is not changed. Attractors stay at equal strength because the
 * solver still splits flux by count.
 */
export function buildSketchLayouts(site: SiteContext, settings: SketchLayoutSettings = { recessionFt: SKETCH_RECESSION_FT, seedsPerLayout: 3 }): StrategyLayout[] {
  const recessionFt = clamp(settings.recessionFt, 0, 400);
  const seedCount = clamp(Math.round(settings.seedsPerLayout), 1, 8);
  const domain = assessNetworkDomain({
    parcel: site.site.ring,
    water: site.water.ring,
    buildings: site.buildings.map((building) => ({ id: building.id, ring: building.ring, holes: building.holes })),
  });
  const open = (x: number, z: number) => openAt(domain, x, z);
  let towardX = 0;
  let towardZ = 0;
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const [x, z] of site.site.ring) {
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minZ = Math.min(minZ, z);
    maxZ = Math.max(maxZ, z);
    towardX += x;
    towardZ += z;
  }
  towardX /= Math.max(1, site.site.ring.length);
  towardZ /= Math.max(1, site.site.ring.length);
  const towers = analysisTowers(site.buildings);
  const shorePath = site.coastline.path.length > 1 ? site.coastline.path : site.water.ring;
  const cells: Cell[] = [];
  for (let z = minZ; z <= maxZ; z += FLOW_SPACING_FEET) {
    for (let x = minX; x <= maxX; x += FLOW_SPACING_FEET) {
      if (!open(x, z)) continue;
      cells.push(measureCell(x, z, site, towers, shorePath));
    }
  }
  if (cells.length === 0) return [];
  const measured = pedestrianCandidates().filter((candidate) => candidate.role === "access").flatMap((candidate) => {
    const resolved = resolveCandidate(candidate, open, FLOW_SPACING_FEET, towardX, towardZ);
    if (!resolved) return [];
    return [{ candidate, resolved }];
  });
  const cityEdge = westSamples(site.site.ring, STRATEGY_LAYOUT_DEFAULTS.cityEdgeSpacingFt).flatMap((point) => {
    const resolved = inward(point.x, point.z, towardX, towardZ, open);
    return resolved ? [resolved] : [];
  }).filter((point, index, list) => list.findIndex((other) => hypot(point.x, point.z, other.x, other.z) < 40) === index);

  const openMinZ = Math.min(...cells.map((cell) => cell.z));
  const openMaxZ = Math.max(...cells.map((cell) => cell.z));
  const midZ = (openMinZ + openMaxZ) / 2;
  const span = Math.max(1, openMaxZ - openMinZ);
  const centralBand = cells.filter((cell) => Math.abs(cell.z - midZ) <= span * 0.16);
  const centralPool = centralBand.length > 0 ? centralBand : cells;
  const nearestShore = Math.min(...centralPool.map((cell) => cell.waterfrontFeet));
  const central = [...centralPool]
    .filter((cell) => cell.waterfrontFeet <= nearestShore + 20)
    .sort((a, b) => Math.abs(a.z - midZ) - Math.abs(b.z - midZ) || a.waterfrontFeet - b.waterfrontFeet)[0];
  const taken: Cell[] = [central];
  const southTarget = midZ - span * 0.2;
  const southern = cells.filter((cell) => cell.z <= midZ - span * 0.12 && cell.waterfrontFeet >= central.waterfrontFeet + recessionFt);
  const southernGathering = [...southern].sort((a, b) => Math.abs(a.z - southTarget) - Math.abs(b.z - southTarget) || a.waterfrontFeet - b.waterfrontFeet)[0] ?? null;
  if (southernGathering) taken.push(southernGathering);
  const workspaceField = southern.filter((cell) => taken.every((item) => hypot(cell.x, cell.z, item.x, item.z) >= MIN_GAP_FT));
  const workspaceFirst = [...workspaceField].sort((a, b) => a.z - b.z || b.waterfrontFeet - a.waterfrontFeet)[0] ?? null;
  const workspaces = workspaceFirst ? farthest(workspaceField, 3, workspaceFirst) : [];

  const attractorCell = (cell: Cell, role: "Gathering" | "Workspace", place: string) => ({ cell, role, place });
  const attractors = [
    attractorCell(central, "Gathering", "Central waterfront"),
    ...(southernGathering ? [attractorCell(southernGathering, "Gathering", "Southern destination")] : []),
    ...workspaces.map((cell) => attractorCell(cell, "Workspace", "Southern")),
  ];

  const sourceNode = (id: string, layoutId: string, origin: StrategyOrigin, unverified: boolean, note: string, x: number, z: number, recordId?: string): NetworkNode => {
    const cell = measureCell(x, z, site, towers, shorePath);
    return {
      id,
      kind: "source",
      x,
      z,
      recordId,
      measuredX: origin === "measured-access" ? x : undefined,
      measuredZ: origin === "measured-access" ? z : undefined,
      strategy: trace(layoutId, origin, unverified, note, cell, { exposed: null, shaded: null }),
    };
  };

  const configs: { id: string; title: string; northeast: boolean }[] = [
    { id: "sketch-with-northeast", title: "Sketch, with northeast access", northeast: true },
    { id: "sketch-without-northeast", title: "Sketch, without northeast access", northeast: false },
  ];
  return configs.flatMap((config, index) => {
    const notes: string[] = [];
    if (!southernGathering) notes.push(`No open cell sits ${Math.round(recessionFt)} ft inland of the central waterfront in the south.`);
    if (workspaces.length < 3) notes.push(`${workspaces.length} workspace attractors fit in the southern portion at this recession.`);
    const nodes: NetworkNode[] = [];
    const included = measured.filter((item) => config.northeast || item.candidate.side !== "waterfront");
    for (const item of included) {
      nodes.push(sourceNode(
        `s${nodes.length + 1}`,
        config.id,
        "measured-access",
        true,
        `${item.candidate.title}. Unverified gap, not an entrance.`,
        item.resolved.x,
        item.resolved.z,
        item.candidate.id,
      ));
    }
    for (const point of cityEdge) {
      if (nodes.some((node) => hypot(node.x, node.z, point.x, point.z) < 40)) continue;
      nodes.push(sourceNode(`s${nodes.length + 1}`, config.id, "city-edge", false, "Design proposal on the city edge. Not a measured entrance.", point.x, point.z));
    }
    attractors.forEach((item, attractorIndex) => {
      const cell = item.cell;
      nodes.push({
        id: `a${attractorIndex + 1}`,
        kind: "attractor",
        x: cell.x,
        z: cell.z,
        strategy: trace(
          config.id,
          cell.waterfrontFeet <= central.waterfrontFeet + 20 ? "waterfront" : "internal",
          false,
          `${item.role}. ${item.place}. Strength 1. ${Math.round(cell.waterfrontFeet)} ft from the coastline.`,
          cell,
          { exposed: null, shaded: null },
        ),
      });
    });
    if (!nodes.some((node) => node.kind === "source") || !nodes.some((node) => node.kind === "attractor")) return [];
    const seeds = Array.from({ length: seedCount }, (_, seedIndex) => (SKETCH_SEED_BASE + (index + 1) * SEED_STEP + seedIndex * SEED_STEP) >>> 0);
    return [{
      id: config.id,
      title: config.title,
      family: "sketch" as const,
      settings: { ...STRATEGY_LAYOUT_DEFAULTS, seedsPerLayout: seedCount },
      seeds,
      nodes,
      notes,
      viewsChecked: false,
      windFromDegrees: null,
    }];
  });
}

/** Seeds shared by the northern-gathering placements and the first Sketch comparison. */
export const NORTH_GATHERING_SEEDS = [20365850, 20470579, 20575308, 20680037] as const;

/**
 * Two northern organizations, each with and without the northeast contact.
 * Distinct adds one northern Gathering attractor. Continuous keeps two Gathering
 * attractors and shifts the waterfront one north along the shore.
 * Strength stays 1. The original sketch layouts are not replaced.
 */
export function buildNorthGatheringLayouts(site: SiteContext, settings: SketchLayoutSettings = { recessionFt: SKETCH_RECESSION_FT, seedsPerLayout: NORTH_GATHERING_SEEDS.length }): StrategyLayout[] {
  const recessionFt = clamp(settings.recessionFt, 0, 400);
  const domain = assessNetworkDomain({
    parcel: site.site.ring,
    water: site.water.ring,
    buildings: site.buildings.map((building) => ({ id: building.id, ring: building.ring, holes: building.holes })),
  });
  const open = (x: number, z: number) => openAt(domain, x, z);
  let towardX = 0;
  let towardZ = 0;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const [x, z] of site.site.ring) {
    minZ = Math.min(minZ, z);
    maxZ = Math.max(maxZ, z);
    towardX += x;
    towardZ += z;
  }
  towardX /= Math.max(1, site.site.ring.length);
  towardZ /= Math.max(1, site.site.ring.length);
  const towers = analysisTowers(site.buildings);
  const shorePath = site.coastline.path.length > 1 ? site.coastline.path : site.water.ring;
  const cells: Cell[] = [];
  for (let z = minZ; z <= maxZ; z += FLOW_SPACING_FEET) {
    for (let x = minXFrom(site); x <= maxXFrom(site); x += FLOW_SPACING_FEET) {
      if (!open(x, z)) continue;
      cells.push(measureCell(x, z, site, towers, shorePath));
    }
  }
  if (cells.length === 0) return [];
  const measured = pedestrianCandidates().filter((candidate) => candidate.role === "access").flatMap((candidate) => {
    const resolved = resolveCandidate(candidate, open, FLOW_SPACING_FEET, towardX, towardZ);
    if (!resolved) return [];
    return [{ candidate, resolved }];
  });
  const cityEdge = westSamples(site.site.ring, STRATEGY_LAYOUT_DEFAULTS.cityEdgeSpacingFt).flatMap((point) => {
    const resolved = inward(point.x, point.z, towardX, towardZ, open);
    return resolved ? [resolved] : [];
  }).filter((point, index, list) => list.findIndex((other) => hypot(point.x, point.z, other.x, other.z) < 40) === index);
  const openMinZ = Math.min(...cells.map((cell) => cell.z));
  const openMaxZ = Math.max(...cells.map((cell) => cell.z));
  const midZ = (openMinZ + openMaxZ) / 2;
  const span = Math.max(1, openMaxZ - openMinZ);
  const placed = placeSketchAttractors(cells, midZ, span, recessionFt, false);
  const continuous = placeSketchAttractors(cells, midZ, span, recessionFt, true);
  const northCut = openMinZ + (2 * span) / 3;
  const northern = northernGathering(cells, placed, northCut, openMaxZ);
  const distinct = northern ? [attractorCell(northern, "Gathering", "Northern destination"), ...placed] : placed;

  const sourceNode = (id: string, layoutId: string, origin: StrategyOrigin, unverified: boolean, note: string, x: number, z: number, recordId?: string): NetworkNode => {
    const cell = measureCell(x, z, site, towers, shorePath);
    return {
      id,
      kind: "source",
      x,
      z,
      recordId,
      measuredX: origin === "measured-access" ? x : undefined,
      measuredZ: origin === "measured-access" ? z : undefined,
      strategy: trace(layoutId, origin, unverified, note, cell, { exposed: null, shaded: null }),
    };
  };
  const seeds = NORTH_GATHERING_SEEDS.slice(0, clamp(Math.round(settings.seedsPerLayout), 1, NORTH_GATHERING_SEEDS.length));
  const organizations: { id: string; title: string; northeast: boolean; attractors: ReturnType<typeof attractorCell>[]; note: string }[] = [
    { id: "sketch-north-distinct-with", title: "Distinct northern gathering, with northeast", northeast: true, attractors: distinct, note: northern ? "A northern Gathering attractor is added. The central waterfront and southern attractors stay." : "No open northern cell was far enough from the other attractors." },
    { id: "sketch-north-distinct-without", title: "Distinct northern gathering, without northeast", northeast: false, attractors: distinct, note: northern ? "A northern Gathering attractor is added. The northeast contact is omitted." : "No open northern cell was far enough from the other attractors." },
    { id: "sketch-north-continuous-with", title: "Continuous gathering, with northeast", northeast: true, attractors: continuous, note: "The waterfront Gathering attractor is shifted north along the shore. No separate northern attractor is added." },
    { id: "sketch-north-continuous-without", title: "Continuous gathering, without northeast", northeast: false, attractors: continuous, note: "The waterfront Gathering attractor is shifted north along the shore. The northeast contact is omitted." },
  ];
  return organizations.flatMap((config) => {
    const nodes: NetworkNode[] = [];
    const included = measured.filter((item) => config.northeast || item.candidate.side !== "waterfront");
    for (const item of included) {
      nodes.push(sourceNode(`s${nodes.length + 1}`, config.id, "measured-access", true, `${item.candidate.title}. Unverified gap, not an entrance.`, item.resolved.x, item.resolved.z, item.candidate.id));
    }
    for (const point of cityEdge) {
      if (nodes.some((node) => hypot(node.x, node.z, point.x, point.z) < 40)) continue;
      nodes.push(sourceNode(`s${nodes.length + 1}`, config.id, "city-edge", false, "Design proposal on the city edge. Not a measured entrance.", point.x, point.z));
    }
    const waterfront = config.attractors.find((item) => item.place === "Central waterfront" || item.place === "Northern waterfront");
    const shoreMark = waterfront?.cell.waterfrontFeet ?? 0;
    config.attractors.forEach((item, attractorIndex) => {
      nodes.push({
        id: `a${attractorIndex + 1}`,
        kind: "attractor",
        x: item.cell.x,
        z: item.cell.z,
        strategy: trace(
          config.id,
          item.cell.waterfrontFeet <= shoreMark + 20 ? "waterfront" : "internal",
          false,
          `${item.role}. ${item.place}. Strength 1. ${Math.round(item.cell.waterfrontFeet)} ft from the coastline.`,
          item.cell,
          { exposed: null, shaded: null },
        ),
      });
    });
    if (!nodes.some((node) => node.kind === "source") || !nodes.some((node) => node.kind === "attractor")) return [];
    return [{
      id: config.id,
      title: config.title,
      family: "sketch" as const,
      settings: { ...STRATEGY_LAYOUT_DEFAULTS, seedsPerLayout: seeds.length },
      seeds: [...seeds],
      nodes,
      notes: [config.note],
      viewsChecked: false,
      windFromDegrees: null,
    }];
  });
}

function minXFrom(site: SiteContext) {
  return Math.min(...site.site.ring.map((point) => point[0]));
}

function maxXFrom(site: SiteContext) {
  return Math.max(...site.site.ring.map((point) => point[0]));
}

function attractorCell(cell: Cell, role: "Gathering" | "Workspace", place: string) {
  return { cell, role, place };
}

function placeSketchAttractors(cells: Cell[], midZ: number, span: number, recessionFt: number, shiftNorth: boolean) {
  const central = shiftNorth ? shiftedWaterfront(cells, midZ, span) : midpointWaterfront(cells, midZ, span);
  const taken: Cell[] = [central];
  const southTarget = midZ - span * 0.2;
  const southern = cells.filter((cell) => cell.z <= midZ - span * 0.12 && cell.waterfrontFeet >= central.waterfrontFeet + recessionFt);
  const southernGathering = [...southern].sort((a, b) => Math.abs(a.z - southTarget) - Math.abs(b.z - southTarget) || a.waterfrontFeet - b.waterfrontFeet)[0] ?? null;
  if (southernGathering) taken.push(southernGathering);
  const workspaceField = southern.filter((cell) => taken.every((item) => hypot(cell.x, cell.z, item.x, item.z) >= MIN_GAP_FT));
  const workspaceFirst = [...workspaceField].sort((a, b) => a.z - b.z || b.waterfrontFeet - a.waterfrontFeet)[0] ?? null;
  const workspaces = workspaceFirst ? farthest(workspaceField, 3, workspaceFirst) : [];
  return [
    attractorCell(central, "Gathering", shiftNorth ? "Northern waterfront" : "Central waterfront"),
    ...(southernGathering ? [attractorCell(southernGathering, "Gathering", "Southern destination")] : []),
    ...workspaces.map((cell) => attractorCell(cell, "Workspace", "Southern")),
  ];
}

function midpointWaterfront(cells: Cell[], midZ: number, span: number) {
  const centralBand = cells.filter((cell) => Math.abs(cell.z - midZ) <= span * 0.16);
  const centralPool = centralBand.length > 0 ? centralBand : cells;
  const nearestShore = Math.min(...centralPool.map((cell) => cell.waterfrontFeet));
  return [...centralPool]
    .filter((cell) => cell.waterfrontFeet <= nearestShore + 20)
    .sort((a, b) => Math.abs(a.z - midZ) - Math.abs(b.z - midZ) || a.waterfrontFeet - b.waterfrontFeet)[0];
}

function shiftedWaterfront(cells: Cell[], midZ: number, span: number) {
  const targetZ = midZ + span * 0.24;
  const pool = cells.filter((cell) => cell.z >= midZ && cell.z <= midZ + span * 0.34);
  const field = pool.length > 0 ? pool : cells;
  const nearestShore = Math.min(...field.map((cell) => cell.waterfrontFeet));
  return [...field]
    .filter((cell) => cell.waterfrontFeet <= nearestShore + 20)
    .sort((a, b) => Math.abs(a.z - targetZ) - Math.abs(b.z - targetZ) || a.waterfrontFeet - b.waterfrontFeet)[0];
}

function northernGathering(cells: Cell[], taken: { cell: Cell }[], northCut: number, openMaxZ: number) {
  const spanNorth = Math.max(1, openMaxZ - northCut);
  const targetZ = northCut + spanNorth * 0.42;
  const clear = cells.filter((cell) => cell.z >= northCut && taken.every((item) => hypot(cell.x, cell.z, item.cell.x, item.cell.z) >= MIN_GAP_FT));
  const inland = clear.filter((cell) => cell.waterfrontFeet >= 50 && cell.waterfrontFeet <= 140);
  const field = inland.length > 0 ? inland : clear.filter((cell) => cell.waterfrontFeet >= 40);
  const choice = field.length > 0 ? field : clear;
  return [...choice].sort((a, b) => Math.abs(a.z - targetZ) - Math.abs(b.z - targetZ) || Math.abs(a.waterfrontFeet - 90) - Math.abs(b.waterfrontFeet - 90))[0] ?? null;
}
