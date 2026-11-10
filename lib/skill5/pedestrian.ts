import network from "@/data/skill5/pedestrian-network.json";
import type { XZ } from "@/lib/skill5/site-model";

export const JOIN_FEET = 12;
export const PARCEL_FEET = 40;
export const STATION_FEET = 80;
export const COAST_FEET = 80;
export const NEAR_PARCEL_FEET = 250;
export const CITY_ACCESS_LABEL = "Potential City-Side Access";
export const NORTHEAST_ACCESS_LABEL = "Potential Northeast Access";
/** Largest real opening joined in the mapped network for this extract. Locked by verify-pedestrian.ts. */
export const MAPPED_OPENING_FEET = 11.9;

export const PEDESTRIAN_MODES = [
  { id: "network", label: "Pedestrian Network" },
  { id: "baywalk", label: "Baywalk Connectivity" },
  { id: "access", label: "Access Points" },
] as const;

export type PedestrianMode = (typeof PEDESTRIAN_MODES)[number]["id"];

export type WalkLink = {
  id: string;
  name: string;
  status: "existing" | "mapped" | "proposed";
  authority: "county" | "osm" | "miami-dda";
  kind: "sidewalk" | "crossing" | "steps" | "pedestrian" | "path" | "bridge";
  path: XZ[];
};

export type TransitStop = {
  name: string;
  address: string;
  openFlag: number;
  x: number;
  z: number;
};

export type WalkAccess = {
  name: string;
  label: typeof CITY_ACCESS_LABEL | typeof NORTHEAST_ACCESS_LABEL;
  side: "city" | "waterfront";
  gapFeet: number;
  boundaryX: number;
  boundaryZ: number;
  walkX: number;
  walkZ: number;
};

export type StationWalk = {
  name: string;
  address: string;
  openFlag: number;
  x: number;
  z: number;
  routeFeet: number | null;
  offsetFeet: number | null;
  /** Separated mapped lines leave this distance. Null when no separation is stored. */
  mappedGapFeet: number | null;
  mappedReach: "opening" | "short" | "absent";
};

export type CirculationAttractor = {
  id: string;
  role: typeof CITY_ACCESS_LABEL | typeof NORTHEAST_ACCESS_LABEL | "transit";
  status: "unverified";
  name: string;
  x: number;
  z: number;
};

export type PedestrianStudy = {
  countyFeet: number;
  countyCount: number;
  mappedSidewalks: number;
  mappedCrossings: number;
  mappedSteps: number;
  cityAccess: WalkAccess[];
  waterfrontAccess: WalkAccess[];
  stations: StationWalk[];
  coastCountyFeet: number;
  coastMappedFeet: number;
  coastCountyCount: number;
  coastCountyNearFeet: number;
  coastMappedCount: number;
  namedBaywalkFeet: number;
  namedBaywalkParcelFeet: number | null;
  museumConnected: boolean;
  attractors: CirculationAttractor[];
};

export type PedestrianRun = {
  id: string;
  mode: PedestrianMode;
  title: string;
  primary: string;
  secondary: string;
  metrics: readonly { label: string; value: string }[];
};

export type WalkSegment = {
  ax: number;
  ay: number;
  az: number;
  bx: number;
  by: number;
  bz: number;
  tone: "county" | "mapped" | "named" | "gap" | "station";
};

type Graph = { nodes: XZ[]; next: Array<Array<[number, number]>> };

const countyLinks = network.sidewalks as WalkLink[];
const mappedLinks = network.mapped as WalkLink[];
const stops = network.stations as TransitStop[];

export const PEDESTRIAN_SOURCES = {
  county: network.county,
  osm: network.osm,
  transit: network.transit,
  proposed: network.proposed[0],
  retrieved: network.retrieved,
} as const;

export const PEDESTRIAN_LIMITS = [
  "County sidewalks are the Miami-Dade DTPW inventory, retrieved 2026-11-05. Width and ADA fields were empty on most features and are not used.",
  "OpenStreetMap sidewalks, crossings, steps, and named paths are mapped lines. They are not a county survey.",
  "A walking distance follows county sidewalks only. Endpoints within 12 ft are joined. A longer gap is not filled in.",
  "The distance from a sidewalk to the parcel boundary is a gap, not a path.",
  "Metromover OPEN_ is the county attribute retrieved with the stations. It is not a live operating check.",
  "The I-395 Baywalk bridge is a Miami DDA proposal. No alignment was published, so no line is drawn.",
  "A county sidewalk that meets the 80 ft coastline buffer is still a street sidewalk. Its full length is not the length inside the buffer, and that proximity is not Baywalk continuity.",
  "The mapped segment named Baywalk is separate from the parcel. Other shoreline-adjacent lines are not that segment.",
  "A mapped station connection that appears only after joining openings of up to 11.9 ft is unverified. A larger gap stays open.",
  "No pedestrian counts are stored. No accessibility compliance is calculated. The drawn stroke is not a surveyed sidewalk width.",
  "The two parcel contacts are potential Physarum attractors with unverified status. They are not confirmed entrances. This study does not generate a Physarum network.",
] as const;

function lengthOf(path: readonly XZ[]) {
  let length = 0;
  for (let index = 1; index < path.length; index += 1) length += Math.hypot(path[index][0] - path[index - 1][0], path[index][1] - path[index - 1][1]);
  return length;
}

/** Closest points and distance between two finite segments, in the same plane. */
export function segmentClosest(a: XZ, b: XZ, c: XZ, d: XZ) {
  const ux = b[0] - a[0];
  const uz = b[1] - a[1];
  const vx = d[0] - c[0];
  const vz = d[1] - c[1];
  const wx = a[0] - c[0];
  const wz = a[1] - c[1];
  const aa = ux * ux + uz * uz;
  const bb = ux * vx + uz * vz;
  const cc = vx * vx + vz * vz;
  const dd = ux * wx + uz * wz;
  const ee = vx * wx + vz * wz;
  const den = aa * cc - bb * bb;
  let sN: number;
  let sD = den;
  let tN: number;
  let tD = den;
  if (den < 1e-8) {
    sN = 0;
    sD = 1;
    tN = ee;
    tD = cc;
  } else {
    sN = bb * ee - cc * dd;
    tN = aa * ee - bb * dd;
    if (sN < 0) {
      sN = 0;
      tN = ee;
      tD = cc;
    } else if (sN > sD) {
      sN = sD;
      tN = ee + bb;
      tD = cc;
    }
  }
  if (tN < 0) {
    tN = 0;
    if (-dd < 0) sN = 0;
    else if (-dd > aa) sN = sD;
    else {
      sN = -dd;
      sD = aa;
    }
  } else if (tN > tD) {
    tN = tD;
    if (-dd + bb < 0) sN = 0;
    else if (-dd + bb > aa) sN = sD;
    else {
      sN = -dd + bb;
      sD = aa;
    }
  }
  const sc = Math.abs(sN) < 1e-8 || sD === 0 ? 0 : sN / sD;
  const tc = Math.abs(tN) < 1e-8 || tD === 0 ? 0 : tN / tD;
  const x1 = a[0] + sc * ux;
  const z1 = a[1] + sc * uz;
  const x2 = c[0] + tc * vx;
  const z2 = c[1] + tc * vz;
  return { feet: Math.hypot(x1 - x2, z1 - z2), x1, z1, x2, z2 };
}

export function segmentDistance(a: XZ, b: XZ, c: XZ, d: XZ) {
  return segmentClosest(a, b, c, d).feet;
}

function polylineDistance(path: readonly XZ[], ring: readonly XZ[]) {
  let best = { feet: Infinity, walkX: 0, walkZ: 0, boundaryX: 0, boundaryZ: 0 };
  for (let pathIndex = 1; pathIndex < path.length; pathIndex += 1) {
    for (let ringIndex = 1; ringIndex < ring.length; ringIndex += 1) {
      const hit = segmentClosest(path[pathIndex - 1], path[pathIndex], ring[ringIndex - 1], ring[ringIndex]);
      if (hit.feet >= best.feet) continue;
      best = { feet: hit.feet, walkX: hit.x1, walkZ: hit.z1, boundaryX: hit.x2, boundaryZ: hit.z2 };
    }
  }
  return best;
}

function coastDistance(path: readonly XZ[], shore: readonly XZ[]) {
  let best = Infinity;
  for (let pathIndex = 1; pathIndex < path.length; pathIndex += 1) {
    for (let shoreIndex = 1; shoreIndex < shore.length; shoreIndex += 1) {
      best = Math.min(best, segmentDistance(path[pathIndex - 1], path[pathIndex], shore[shoreIndex - 1], shore[shoreIndex]));
    }
  }
  return best;
}

function lengthWithin(path: readonly XZ[], shore: readonly XZ[], limit: number) {
  let length = 0;
  for (let index = 1; index < path.length; index += 1) {
    if (coastDistance([path[index - 1], path[index]], shore) > limit) continue;
    length += Math.hypot(path[index][0] - path[index - 1][0], path[index][1] - path[index - 1][1]);
  }
  return length;
}

function reached(graph: Graph, sources: readonly number[]) {
  const distance = new Array<number>(graph.nodes.length).fill(Infinity);
  const used = new Array<boolean>(graph.nodes.length).fill(false);
  for (const source of sources) distance[source] = 0;
  for (let step = 0; step < graph.nodes.length; step += 1) {
    let current = -1;
    for (let index = 0; index < distance.length; index += 1) {
      if (!used[index] && (current < 0 || distance[index] < distance[current])) current = index;
    }
    if (current < 0 || !Number.isFinite(distance[current])) break;
    used[current] = true;
    for (const [neighbor, weight] of graph.next[current]) {
      const nextDistance = distance[current] + weight;
      if (nextDistance < distance[neighbor]) distance[neighbor] = nextDistance;
    }
  }
  return distance;
}

function componentGap(graph: Graph, from: readonly number[], to: readonly number[]) {
  let best = Infinity;
  for (const source of from) {
    for (const target of to) {
      best = Math.min(best, Math.hypot(graph.nodes[source][0] - graph.nodes[target][0], graph.nodes[source][1] - graph.nodes[target][1]));
    }
  }
  return best;
}

function nearParcel(path: readonly XZ[], ring: readonly XZ[]) {
  return polylineDistance(path, ring).feet <= NEAR_PARCEL_FEET;
}

function buildGraph(links: readonly WalkLink[]): Graph {
  const nodes: XZ[] = [];
  const next: Array<Array<[number, number]>> = [];
  const ends: number[] = [];
  const add = (point: XZ) => {
    nodes.push(point);
    next.push([]);
    return nodes.length - 1;
  };
  const join = (a: number, b: number, feet: number) => {
    next[a].push([b, feet]);
    next[b].push([a, feet]);
  };
  for (const link of links) {
    let previous = add(link.path[0]);
    ends.push(previous);
    for (let index = 1; index < link.path.length; index += 1) {
      const current = add(link.path[index]);
      join(previous, current, Math.hypot(link.path[index][0] - link.path[index - 1][0], link.path[index][1] - link.path[index - 1][1]));
      previous = current;
    }
    ends.push(previous);
  }
  for (const end of ends) {
    for (let index = 0; index < nodes.length; index += 1) {
      if (index === end) continue;
      const feet = Math.hypot(nodes[end][0] - nodes[index][0], nodes[end][1] - nodes[index][1]);
      if (feet > 0.5 && feet <= JOIN_FEET) join(end, index, feet);
    }
  }
  return { nodes, next };
}

function routeFeet(graph: Graph, sources: readonly number[], target: number) {
  const distance = new Array<number>(graph.nodes.length).fill(Infinity);
  const used = new Array<boolean>(graph.nodes.length).fill(false);
  for (const source of sources) distance[source] = 0;
  for (let step = 0; step < graph.nodes.length; step += 1) {
    let current = -1;
    for (let index = 0; index < distance.length; index += 1) {
      if (!used[index] && (current < 0 || distance[index] < distance[current])) current = index;
    }
    if (current < 0 || !Number.isFinite(distance[current])) break;
    if (current === target) return distance[current];
    used[current] = true;
    for (const [neighbor, weight] of graph.next[current]) {
      const nextDistance = distance[current] + weight;
      if (nextDistance < distance[neighbor]) distance[neighbor] = nextDistance;
    }
  }
  return null;
}

function nearestNode(graph: Graph, x: number, z: number, limit: number) {
  let best: { index: number; feet: number } | null = null;
  for (let index = 0; index < graph.nodes.length; index += 1) {
    const feet = Math.hypot(graph.nodes[index][0] - x, graph.nodes[index][1] - z);
    if (feet <= limit && (!best || feet < best.feet)) best = { index, feet };
  }
  return best;
}

let cached: { key: string; study: PedestrianStudy; graph: Graph } | null = null;

export function pedestrianStudy(parcel: readonly XZ[], shore: readonly XZ[]): PedestrianStudy {
  const key = `${parcel.length}:${parcel[0]?.join(",")}:${shore.length}:${shore[0]?.join(",")}`;
  if (cached?.key === key) return cached.study;
  const graph = buildGraph(countyLinks);
  const sources: number[] = [];
  for (let index = 0; index < graph.nodes.length; index += 1) {
    const [x, z] = graph.nodes[index];
    if (polylineDistance([[x, z], [x, z]], parcel).feet <= PARCEL_FEET) sources.push(index);
  }
  const grouped = new Map<string, WalkAccess>();
  for (const link of countyLinks) {
    const hit = polylineDistance(link.path, parcel);
    if (hit.feet > PARCEL_FEET) continue;
    const side = coastDistance([[hit.walkX, hit.walkZ], [hit.walkX, hit.walkZ]], shore) <= COAST_FEET ? "waterfront" : "city";
    const current = grouped.get(`${side}:${link.name}`);
    if (current && current.gapFeet <= hit.feet) continue;
    grouped.set(`${side}:${link.name}`, {
      name: link.name,
      label: side === "city" ? CITY_ACCESS_LABEL : NORTHEAST_ACCESS_LABEL,
      side,
      gapFeet: hit.feet,
      boundaryX: hit.boundaryX,
      boundaryZ: hit.boundaryZ,
      walkX: hit.walkX,
      walkZ: hit.walkZ,
    });
  }
  const access = [...grouped.values()].sort((a, b) => a.gapFeet - b.gapFeet);
  const mappedGraph = buildGraph([...countyLinks, ...mappedLinks.filter((link) => link.kind !== "steps")]);
  const mappedSources: number[] = [];
  for (let index = 0; index < mappedGraph.nodes.length; index += 1) {
    const [x, z] = mappedGraph.nodes[index];
    if (polylineDistance([[x, z], [x, z]], parcel).feet <= PARCEL_FEET) mappedSources.push(index);
  }
  const fromParcel = reached(mappedGraph, mappedSources);
  const stations: StationWalk[] = stops.map((stop) => {
    const near = nearestNode(graph, stop.x, stop.z, STATION_FEET);
    const route = near && sources.length > 0 ? routeFeet(graph, sources, near.index) : null;
    const mappedNear = nearestNode(mappedGraph, stop.x, stop.z, STATION_FEET);
    if (!mappedNear) return { ...stop, routeFeet: route, offsetFeet: near ? near.feet : null, mappedGapFeet: null, mappedReach: "absent" as const };
    if (Number.isFinite(fromParcel[mappedNear.index])) {
      return { ...stop, routeFeet: route, offsetFeet: near ? near.feet : null, mappedGapFeet: null, mappedReach: "opening" as const };
    }
    const fromStation = reached(mappedGraph, [mappedNear.index]);
    const parcelNodes = fromParcel.flatMap((value, index) => (Number.isFinite(value) ? [index] : []));
    const stationNodes = fromStation.flatMap((value, index) => (Number.isFinite(value) ? [index] : []));
    const gap = componentGap(mappedGraph, parcelNodes, stationNodes);
    return { ...stop, routeFeet: route, offsetFeet: near ? near.feet : null, mappedGapFeet: Number.isFinite(gap) ? gap : null, mappedReach: "short" as const };
  });
  const museum = stations.find((station) => station.name === "MUSEUM PARK");
  const coastCounty = countyLinks.filter((link) => coastDistance(link.path, shore) <= COAST_FEET);
  const coastMapped = mappedLinks.filter((link) => coastDistance(link.path, shore) <= COAST_FEET);
  const namedBaywalk = mappedLinks.filter((link) => link.name.toLowerCase() === "baywalk");
  const attractors: CirculationAttractor[] = [
    ...access.map((item) => ({
      id: `${item.side}-${item.name}`,
      role: item.label,
      status: "unverified" as const,
      name: item.name,
      x: item.boundaryX,
      z: item.boundaryZ,
    })),
    ...stations.filter((station) => station.routeFeet !== null).map((station) => ({
      id: `transit-${station.name}`,
      role: "transit" as const,
      status: "unverified" as const,
      name: station.name,
      x: station.x,
      z: station.z,
    })),
  ];
  const study: PedestrianStudy = {
    countyFeet: countyLinks.reduce((sum, link) => sum + lengthOf(link.path), 0),
    countyCount: countyLinks.length,
    mappedSidewalks: mappedLinks.filter((link) => link.kind === "sidewalk").length,
    mappedCrossings: mappedLinks.filter((link) => link.kind === "crossing").length,
    mappedSteps: mappedLinks.filter((link) => link.kind === "steps").length,
    cityAccess: access.filter((item) => item.side === "city"),
    waterfrontAccess: access.filter((item) => item.side === "waterfront"),
    stations,
    coastCountyFeet: coastCounty.reduce((sum, link) => sum + lengthOf(link.path), 0),
    coastMappedFeet: coastMapped.reduce((sum, link) => sum + lengthOf(link.path), 0),
    coastCountyCount: coastCounty.length,
    coastCountyNearFeet: coastCounty.reduce((sum, link) => sum + lengthWithin(link.path, shore, COAST_FEET), 0),
    coastMappedCount: coastMapped.length,
    namedBaywalkFeet: namedBaywalk.reduce((sum, link) => sum + lengthOf(link.path), 0),
    namedBaywalkParcelFeet: namedBaywalk.length === 0 ? null : Math.min(...namedBaywalk.map((link) => polylineDistance(link.path, parcel).feet)),
    museumConnected: museum?.routeFeet !== null,
    attractors,
  };
  cached = { key, study, graph };
  return study;
}

export function pedestrianSegments(mode: PedestrianMode, parcel: readonly XZ[], shore: readonly XZ[]): WalkSegment[] {
  const study = pedestrianStudy(parcel, shore);
  const segments: WalkSegment[] = [];
  const pushPath = (path: readonly XZ[], y: number, tone: WalkSegment["tone"]) => {
    for (let index = 1; index < path.length; index += 1) {
      segments.push({ ax: path[index - 1][0], ay: y, az: path[index - 1][1], bx: path[index][0], by: y, bz: path[index][1], tone });
    }
  };
  if (mode === "network") {
    for (const link of countyLinks) pushPath(link.path, 3, "county");
    for (const link of mappedLinks) {
      if (link.kind !== "crossing" && link.kind !== "path" && link.kind !== "steps" && !nearParcel(link.path, parcel)) continue;
      pushPath(link.path, 3.4, "mapped");
    }
  } else if (mode === "baywalk") {
    for (const link of countyLinks) if (coastDistance(link.path, shore) <= COAST_FEET) pushPath(link.path, 3, "county");
    for (const link of mappedLinks) {
      if (coastDistance(link.path, shore) > COAST_FEET) continue;
      pushPath(link.path, 3.4, link.name.toLowerCase() === "baywalk" ? "named" : "mapped");
    }
  } else {
    for (const link of countyLinks) if (polylineDistance(link.path, parcel).feet <= PARCEL_FEET) pushPath(link.path, 3, "county");
    for (const item of [...study.cityAccess, ...study.waterfrontAccess]) {
      segments.push({ ax: item.boundaryX, ay: 6, az: item.boundaryZ, bx: item.walkX, by: 6, bz: item.walkZ, tone: "gap" });
    }
  }
  for (const station of study.stations) {
    segments.push(
      { ax: station.x - 18, ay: 14, az: station.z, bx: station.x + 18, by: 14, bz: station.z, tone: "station" },
      { ax: station.x, ay: 14, az: station.z - 18, bx: station.x, by: 14, bz: station.z + 18, tone: "station" },
    );
  }
  return segments;
}

export function pedestrianRun(index: number, mode: PedestrianMode, study: PedestrianStudy): PedestrianRun {
  if (mode === "baywalk") {
    const full = `${Math.round(study.coastCountyFeet).toLocaleString("en-US")} ft`;
    const buffer = `${Math.round(study.coastCountyNearFeet).toLocaleString("en-US")} ft`;
    const named = `${Math.round(study.namedBaywalkFeet).toLocaleString("en-US")} ft`;
    return {
      id: `baywalk-${index}`,
      mode,
      title: "Shoreline proximity",
      primary: `${full} full, ${buffer} in the buffer`,
      secondary: `${named} named Baywalk, separate from the parcel`,
      metrics: [
        { label: "Full", value: full },
        { label: "Buffer", value: buffer },
        { label: "Baywalk", value: named },
      ],
    };
  }
  if (mode === "access") {
    const city = study.cityAccess[0] ? `${study.cityAccess[0].gapFeet < 10 ? study.cityAccess[0].gapFeet.toFixed(1) : Math.round(study.cityAccess[0].gapFeet).toLocaleString("en-US")} ft` : "None";
    const northeast = study.waterfrontAccess[0] ? `${study.waterfrontAccess[0].gapFeet < 10 ? study.waterfrontAccess[0].gapFeet.toFixed(1) : Math.round(study.waterfrontAccess[0].gapFeet).toLocaleString("en-US")} ft` : "None";
    return {
      id: `access-${index}`,
      mode,
      title: "Unverified attractors",
      primary: CITY_ACCESS_LABEL,
      secondary: NORTHEAST_ACCESS_LABEL,
      metrics: [
        { label: "City-side", value: city },
        { label: "Northeast", value: northeast },
        { label: "Status", value: "Unverified" },
      ],
    };
  }
  const connected = study.stations.filter((station) => station.routeFeet !== null).length;
  const length = `${Math.round(study.countyFeet).toLocaleString("en-US")} ft`;
  return {
    id: `network-${index}`,
    mode,
    title: "Network",
    primary: length,
    secondary: `${connected} county routes; mapped joins stay unverified`,
    metrics: [
      { label: "Length", value: length },
      { label: "Routes", value: String(connected) },
      { label: "Joins", value: "Unverified" },
    ],
  };
}

export function linkedDistance(links: readonly WalkLink[], from: XZ, to: XZ) {
  const graph = buildGraph(links);
  const source = nearestNode(graph, from[0], from[1], 1);
  const target = nearestNode(graph, to[0], to[1], 1);
  if (!source || !target) return null;
  return routeFeet(graph, [source.index], target.index);
}

export function stationAccount(station: StationWalk) {
  const county = station.routeFeet === null
    ? "No county sidewalk route from the parcel."
    : `${Math.round(station.routeFeet).toLocaleString("en-US")} ft on county sidewalks.`;
  const offset = station.offsetFeet === null
    ? "No county sidewalk within 80 ft of the station."
    : `${Math.round(station.offsetFeet).toLocaleString("en-US")} ft from the station to the nearest county sidewalk.`;
  const mapped = station.mappedReach === "opening"
    ? `Mapped lines reach the station only through unverified gaps of up to ${MAPPED_OPENING_FEET} ft.`
    : station.mappedReach === "short" && station.mappedGapFeet !== null
      ? `Mapped lines stop ${Math.round(station.mappedGapFeet).toLocaleString("en-US")} ft short of the parcel. That gap stays open.`
      : "No mapped line within 80 ft of the station reaches the parcel.";
  return `${station.name}: ${county} ${offset} ${mapped} County open flag ${station.openFlag}.`;
}

export function attractorNote(study: PedestrianStudy) {
  const names = study.attractors.map((item) => item.role).join(" and ");
  return `${study.attractors.length} potential Physarum attractors, unverified: ${names}. They are not confirmed entrances. Northeast 15th Street is not a Baywalk connection. No Physarum network is generated.`;
}

export { countyLinks, mappedLinks };
