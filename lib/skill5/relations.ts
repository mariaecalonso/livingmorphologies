import { worldAnnotations, type SiteAnnotation } from "./annotations";
import type { SiteAssembly } from "./assembly";
import { footprintCorners, type PlacedModule } from "./placement";
import type { SiteContext, SiteRoad, XZ } from "./site-model";

export type PlanPoint = { x: number; z: number };

export type MeasureProvenance = {
  source: string;
  retrieved: string;
  units: "international feet";
  geometry: string;
  method: string;
  limits: string;
};

export type MeasureRecord = {
  id: string;
  label: string;
  feet: number;
  from: PlanPoint;
  to: PlanPoint;
};

export type MeasureSet = {
  available: boolean;
  unavailableReason: string | null;
  nearestFeet: number | null;
  farthestFeet: number | null;
  meanFeet: number | null;
  records: MeasureRecord[];
  provenance: MeasureProvenance;
};

const EMPTY: MeasureSet = {
  available: false,
  unavailableReason: "The mapped geometry is not in the site record.",
  nearestFeet: null,
  farthestFeet: null,
  meanFeet: null,
  records: [],
  provenance: {
    source: "Not loaded",
    retrieved: "Not loaded",
    units: "international feet",
    geometry: "None",
    method: "Not calculated",
    limits: "No substitute score is used.",
  },
};

function sourceOf(context: SiteContext, id: string) {
  return context.sources.find((item) => item.id === id) ?? null;
}

function pointSegment(point: PlanPoint, a: XZ, b: XZ) {
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  const length = dx * dx + dz * dz;
  const t = length === 0 ? 0 : Math.max(0, Math.min(1, ((point.x - a[0]) * dx + (point.z - a[1]) * dz) / length));
  return { x: a[0] + dx * t, z: a[1] + dz * t };
}

function nearestOnPaths(point: PlanPoint, paths: readonly (readonly XZ[])[]) {
  let best: PlanPoint | null = null;
  let bestDistance = Infinity;
  for (const path of paths) {
    for (let index = 1; index < path.length; index += 1) {
      const hit = pointSegment(point, path[index - 1], path[index]);
      const distance = Math.hypot(point.x - hit.x, point.z - hit.z);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = hit;
      }
    }
  }
  return best ? { feet: bestDistance, to: best } : null;
}

function segmentsCross(a: PlanPoint, b: PlanPoint, c: XZ, d: XZ) {
  const cross = (x1: number, z1: number, x2: number, z2: number, x3: number, z3: number) => (z3 - z1) * (x2 - x1) - (x3 - x1) * (z2 - z1);
  const ab = cross(a.x, a.z, b.x, b.z, c[0], c[1]) * cross(a.x, a.z, b.x, b.z, d[0], d[1]);
  const cd = cross(c[0], c[1], d[0], d[1], a.x, a.z) * cross(c[0], c[1], d[0], d[1], b.x, b.z);
  return ab < 0 && cd < 0;
}

/** Minimum plan distance from a footprint edge to a mapped polyline. Intersection is zero. */
export function footprintToPaths(corners: readonly PlanPoint[], paths: readonly (readonly XZ[])[]) {
  if (corners.length === 0 || paths.every((path) => path.length < 2)) return null;
  let best = Infinity;
  let from = corners[0];
  let to = { x: corners[0].x, z: corners[0].z };
  for (let edge = 0; edge < corners.length; edge += 1) {
    const start = corners[edge];
    const end = corners[(edge + 1) % corners.length];
    for (const path of paths) {
      for (let index = 1; index < path.length; index += 1) {
        const a = path[index - 1];
        const b = path[index];
        if (segmentsCross(start, end, a, b)) return { feet: 0, from: start, to: { x: a[0], z: a[1] } };
        const hits = [
          { from: start, to: pointSegment(start, a, b) },
          { from: end, to: pointSegment(end, a, b) },
          { from: pointSegment({ x: a[0], z: a[1] }, [start.x, start.z], [end.x, end.z]), to: { x: a[0], z: a[1] } },
          { from: pointSegment({ x: b[0], z: b[1] }, [start.x, start.z], [end.x, end.z]), to: { x: b[0], z: b[1] } },
        ];
        for (const hit of hits) {
          const distance = Math.hypot(hit.from.x - hit.to.x, hit.from.z - hit.to.z);
          if (distance < best) {
            best = distance;
            from = hit.from;
            to = hit.to;
          }
        }
      }
    }
  }
  return { feet: best, from, to };
}

function summarize(records: MeasureRecord[], provenance: MeasureProvenance, geometryMissing: boolean): MeasureSet {
  if (geometryMissing) return { ...EMPTY, provenance: { ...provenance, method: "Not calculated", limits: "The required mapped geometry is absent, so no estimate is substituted." } };
  if (records.length === 0) {
    return { ...EMPTY, unavailableReason: "Nothing is placed to measure.", provenance };
  }
  const distances = records.map((record) => record.feet);
  const sum = distances.reduce((total, value) => total + value, 0);
  return {
    available: true,
    unavailableReason: null,
    nearestFeet: Math.min(...distances),
    farthestFeet: Math.max(...distances),
    meanFeet: sum / distances.length,
    records,
    provenance,
  };
}

function moduleRecords(placed: readonly PlacedModule[], paths: readonly (readonly XZ[])[]): MeasureRecord[] {
  return placed.flatMap((item) => {
    const hit = footprintToPaths(footprintCorners(item.transform.position, item.transform.rotationY), paths);
    if (!hit) return [];
    return [{ id: item.instanceId, label: item.name, feet: hit.feet, from: hit.from, to: hit.to }];
  });
}

function roadsNamed(roads: readonly SiteRoad[], pattern: RegExp) {
  return roads.filter((road) => pattern.test(road.name)).map((road) => road.path);
}

export function measureSite(
  placed: readonly PlacedModule[],
  annotations: readonly SiteAnnotation[],
  assemblies: readonly SiteAssembly[],
  context: SiteContext,
) {
  const osm = sourceOf(context, "osm");
  const streets = sourceOf(context, "osm-highways") ?? sourceOf(context, "mdc-streets");
  const bayPaths = context.coastline.path.length > 1 ? [context.coastline.path] : [];
  const macarthurPaths = roadsNamed(context.roads, /macarthur/i);
  const highwayPaths = context.roads.filter((road) => road.kind === "causeway" || road.kind === "expressway" || road.kind === "ramp").map((road) => road.path);
  const streetPaths = context.roads.filter((road) => road.kind === "local").map((road) => road.path);
  const bay = summarize(moduleRecords(placed, bayPaths), {
    source: osm ? `${osm.title}. ${osm.url}` : "OpenStreetMap coastline",
    retrieved: osm?.retrieved ?? context.retrieved,
    units: "international feet",
    geometry: `Coastline ways ${context.coastline.osmIds.join(", ")}, tag ${context.coastline.sourceTag}. The closed water polygon's east edge is not used.`,
    method: "Minimum plan distance from each 20 ft footprint edge to the mapped coastline.",
    limits: "This is distance to the mapped shoreline. It is not verified waterfront visibility. The coastline is OpenStreetMap, tagged PGS, not a surveyed shore.",
  }, bayPaths.length === 0);
  const macarthur = summarize(moduleRecords(placed, macarthurPaths), {
    source: streets ? `${streets.title}. ${streets.url}` : "OpenStreetMap highways",
    retrieved: streets?.retrieved ?? context.retrieved,
    units: "international feet",
    geometry: "Road centerlines whose name contains MacArthur. Distance uses the centerline, not the drawn pavement edge.",
    method: "Minimum plan distance from each 20 ft footprint edge to those centerlines.",
    limits: "This is proximity to the mapped roadway centerline. It is not acoustic exposure. No decibel value is calculated. Pavement width is a simplified surface around that centerline.",
  }, macarthurPaths.length === 0);
  const highway = summarize(moduleRecords(placed, highwayPaths), {
    source: streets ? `${streets.title}. ${streets.url}` : "OpenStreetMap highways",
    retrieved: streets?.retrieved ?? context.retrieved,
    units: "international feet",
    geometry: "Centerlines stored as causeway, expressway, or ramp, including MacArthur Causeway and its approaches where those ways are in the extract.",
    method: "Minimum plan distance from each 20 ft footprint edge to the nearest of those centerlines.",
    limits: "This is proximity to mapped roadway centerlines. It is not traffic noise or a performance score.",
  }, highwayPaths.length === 0);
  const urban = summarize(moduleRecords(placed, streetPaths), {
    source: streets ? `${streets.title}. ${streets.url}` : "OpenStreetMap highways",
    retrieved: streets?.retrieved ?? context.retrieved,
    units: "international feet",
    geometry: "Centerlines stored as local streets.",
    method: "Minimum plan distance from each 20 ft footprint edge to the nearest local-street centerline.",
    limits: "A centerline distance is not a verified pedestrian route and does not mean the street is accessible.",
  }, streetPaths.length === 0);
  const entrances = worldAnnotations(annotations, assemblies).filter((note) => note.kind === "entrance");
  const entranceRecords = entrances.flatMap((note) => {
    const hit = nearestOnPaths(note.world, streetPaths);
    if (!hit) return [];
    return [{ id: note.id, label: note.label, feet: hit.feet, from: note.world, to: hit.to }];
  });
  const entranceAccess = summarize(entranceRecords, {
    ...urban.provenance,
    geometry: "The same local-street centerlines, measured from designer-marked entrances.",
    method: "Plan distance from each entrance mark to the nearest local-street centerline.",
    limits: "Entrance marks are designer decisions. Their distance to a centerline is not an accessible pedestrian route.",
  }, streetPaths.length === 0);
  if (streetPaths.length > 0 && entrances.length === 0) {
    entranceAccess.unavailableReason = "No entrance marks are placed.";
  }
  return { bay, macarthur, highway, urban, entranceAccess, shorePath: context.coastline.path, macarthurPaths, highwayPaths, streetPaths };
}

export function formatFeet(value: number | null) {
  if (value === null || !Number.isFinite(value)) return "Unavailable";
  return `${Math.round(value).toLocaleString("en-US")} ft`;
}
