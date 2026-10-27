import { existsSync, readFileSync, writeFileSync } from "node:fs";

const sourcePath = new URL("../data/skill5/herald-site.json", import.meta.url);
const existing = JSON.parse(readFileSync(sourcePath, "utf8"));
const origin = existing.origin;
const METERS_PER_FOOT = 0.3048;

function feetPerDegree(latDeg) {
  const phi = (latDeg * Math.PI) / 180;
  const metersLat = 111132.92 - 559.82 * Math.cos(2 * phi) + 1.175 * Math.cos(4 * phi) - 0.0023 * Math.cos(6 * phi);
  const metersLon = 111412.84 * Math.cos(phi) - 93.5 * Math.cos(3 * phi) + 0.118 * Math.cos(5 * phi);
  return { east: metersLon / METERS_PER_FOOT, north: metersLat / METERS_PER_FOOT };
}

const scale = feetPerDegree(origin.lat);
const project = (lon, lat) => [(lon - origin.lon) * scale.east, (lat - origin.lat) * scale.north];
const round = (value) => Math.round(value * 10) / 10;
const roundRing = (ring) => ring.map(([x, z]) => [round(x), round(z)]);

const buildingBox = { minX: -2100, maxX: 800, minZ: -1900, maxZ: 2400 };
const roadBox = { minX: -2300, maxX: 2400, minZ: -2100, maxZ: 2500 };
const south = origin.lat + (roadBox.minZ - 200) / scale.north;
const north = origin.lat + (roadBox.maxZ + 200) / scale.north;
const west = origin.lon + (roadBox.minX - 200) / scale.east;
const east = origin.lon + (roadBox.maxX + 200) / scale.east;

function inside(ring, x, z) {
  let odd = false;
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index, index += 1) {
    const [xi, zi] = ring[index];
    const [xj, zj] = ring[previous];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi + 0) + xi) odd = !odd;
  }
  return odd;
}

function signedArea(ring) {
  let area = 0;
  for (let index = 0; index < ring.length; index += 1) {
    const [x0, z0] = ring[index];
    const [x1, z1] = ring[(index + 1) % ring.length];
    area += x0 * z1 - x1 * z0;
  }
  return area / 2;
}

function centroid(ring) {
  let x = 0;
  let z = 0;
  for (const point of ring) {
    x += point[0];
    z += point[1];
  }
  return [x / ring.length, z / ring.length];
}

function simplify(points, epsilon) {
  const closed = points.length > 2 && points[0][0] === points[points.length - 1][0] && points[0][1] === points[points.length - 1][1];
  const open = closed ? points.slice(0, -1) : points.slice();
  if (open.length < 4) return open;
  const keep = new Array(open.length).fill(false);
  keep[0] = true;
  keep[open.length - 1] = true;
  const stack = [[0, open.length - 1]];
  while (stack.length > 0) {
    const [start, end] = stack.pop();
    const [x0, z0] = open[start];
    const [x1, z1] = open[end];
    const dx = x1 - x0;
    const dz = z1 - z0;
    const length = Math.hypot(dx, dz) || 1;
    let max = 0;
    let at = -1;
    for (let index = start + 1; index < end; index += 1) {
      const distance = Math.abs(dx * (z0 - open[index][1]) - (x0 - open[index][0]) * dz) / length;
      if (distance > max) {
        max = distance;
        at = index;
      }
    }
    if (max > epsilon && at !== -1) {
      keep[at] = true;
      stack.push([start, at], [at, end]);
    }
  }
  return open.filter((_, index) => keep[index]);
}

function lengthToFeet(raw, unit) {
  if (raw == null || raw === "") return null;
  const text = String(raw).trim().toLowerCase();
  const match = text.match(/[\d.]+/);
  if (!match) return null;
  const value = Number(match[0]);
  if (!Number.isFinite(value) || value <= 0) return null;
  if (text.includes("ft") || text.includes("'") || unit === "feet") return value;
  if (text.includes("mi")) return value * 5280;
  if (unit === "meters" || text.includes("m")) return value / METERS_PER_FOOT;
  return value / METERS_PER_FOOT;
}

async function readJson(url, options, label) {
  let last = "";
  for (let attempt = 0; attempt < 2; attempt += 1) {
    console.log(label, "attempt", attempt + 1);
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(90000), ...options });
      last = await response.text();
      if (response.ok && last.trim().startsWith("{")) return JSON.parse(last);
      console.error(label, response.status, last.slice(0, 180).replace(/\s+/g, " "));
    } catch (error) {
      last = error instanceof Error ? error.message : String(error);
      console.error(label, last);
    }
    await new Promise((resolve) => setTimeout(resolve, 2500 * (attempt + 1)));
  }
  throw new Error(`${label} failed: ${last.slice(0, 180)}`);
}

const layer = await readJson("https://services.arcgis.com/8Pc9XBTAsYuxx9Ny/ArcGIS/rest/services/BuildingFootprint2D_gdb/FeatureServer/0?f=pjson", undefined, "layer");
const spatial = layer.spatialReference ?? {};
const features = [];
let offset = 0;
while (offset < 20000) {
  const body = new URLSearchParams({
    f: "json",
    where: "1=1",
    geometry: `${west},${south},${east},${north}`,
    geometryType: "esriGeometryEnvelope",
    inSR: "4326",
    outSR: "4326",
    spatialRel: "esriSpatialRelIntersects",
    outFields: "OBJECTID,UNIQUEID,SOURCE,YEARUPDATE,TYPE,HEIGHT",
    returnGeometry: "true",
    resultRecordCount: "500",
    resultOffset: String(offset),
  });
  const page = await readJson("https://services.arcgis.com/8Pc9XBTAsYuxx9Ny/ArcGIS/rest/services/BuildingFootprint2D_gdb/FeatureServer/0/query", { method: "POST", body }, "buildings");
  if (page.error) throw new Error(JSON.stringify(page.error));
  const batch = page.features ?? [];
  features.push(...batch);
  offset += batch.length;
  if (!page.exceededTransferLimit || batch.length === 0) break;
}

const countyHeights = features.map((feature) => feature.attributes?.HEIGHT).filter((value) => typeof value === "number" && value > 0);
const countyUnit = countyHeights.length > 0 && Math.max(...countyHeights) > 80 ? "meters" : "feet";

const query = `[out:json][timeout:90];
(
  way["building"](${south},${west},${north},${east});
  way["highway"](${south},${west},${north},${east});
);
out tags geom;`;
const cachePath = new URL("./.overpass-cache.json", import.meta.url);
let overpass = null;
if (existsSync(cachePath)) {
  overpass = JSON.parse(readFileSync(cachePath, "utf8"));
  console.log("using cached overpass", overpass.elements?.length);
} else {
  const overpassEndpoints = [
    "https://overpass.kumi.systems/api/interpreter",
    "https://overpass.openstreetmap.fr/api/interpreter",
  ];
  let overpassError = "";
  for (const endpoint of overpassEndpoints) {
    try {
      overpass = await readJson(endpoint, {
        method: "POST",
        headers: { "content-type": "text/plain", "user-agent": "living-morphologies-skill5/1.0" },
        body: query,
        signal: AbortSignal.timeout(90000),
      }, endpoint);
      writeFileSync(cachePath, JSON.stringify(overpass));
      break;
    } catch (error) {
      overpassError = error instanceof Error ? error.message : String(error);
    }
  }
  if (!overpass) throw new Error(overpassError);
}
if (overpass.remark && !overpass.elements) throw new Error(overpass.remark);

const osmBuildings = [];
for (const element of overpass.elements ?? []) {
  if (element.type !== "way" || !element.tags?.building || !element.geometry) continue;
  const ring = element.geometry.map((point) => project(point.lon, point.lat));
  if (ring.length < 3) continue;
  const area = Math.abs(signedArea(ring));
  if (area < 80) continue;
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
  const levels = Number(String(element.tags["building:levels"] ?? "").split(";")[0]);
  osmBuildings.push({
    name: element.tags.name ?? null,
    heightFeet: lengthToFeet(element.tags.height, "meters"),
    levelsFeet: levels >= 1 && levels <= 120 ? levels * 10 : null,
    ring,
    area,
    minX,
    maxX,
    minZ,
    maxZ,
  });
}

const years = new Set();
const sources = new Set();
const buildings = [];
let omittedOnParcel = 0;
for (const feature of features) {
  const attributes = feature.attributes ?? {};
  if (attributes.YEARUPDATE != null) years.add(attributes.YEARUPDATE);
  if (attributes.SOURCE) sources.add(attributes.SOURCE);
  const rings = feature.geometry?.rings ?? [];
  const localRings = rings.map((ring) => ring.map(([lon, lat]) => project(lon, lat))).filter((ring) => ring.length >= 3);
  if (localRings.length === 0) continue;
  const groups = [];
  let current = null;
  for (const ring of localRings) {
    const sign = Math.sign(signedArea(ring)) || 1;
    if (!current || sign === current.sign) {
      current = { outer: ring, sign, holes: [] };
      groups.push(current);
    } else current.holes.push(ring);
  }
  groups.forEach((group, part) => {
    const outer = simplify(group.outer, 2);
    if (outer.length < 3) return;
    const area = Math.abs(signedArea(outer));
    if (area < 120) return;
    const [x, z] = centroid(outer);
    if (x < buildingBox.minX || x > buildingBox.maxX || z < buildingBox.minZ || z > buildingBox.maxZ) return;
    if (inside(existing.site.ring, x, z)) {
      omittedOnParcel += 1;
      return;
    }
    const holes = group.holes.map((hole) => simplify(hole, 2)).filter((hole) => hole.length >= 3 && Math.abs(signedArea(hole)) > 40);
    const countyFeet = lengthToFeet(attributes.HEIGHT, countyUnit);
    buildings.push({
      id: attributes.OBJECTID * 10 + part,
      name: null,
      heightFeet: countyFeet ? round(countyFeet) : null,
      heightSource: countyFeet ? "county" : null,
      ring: roundRing(outer),
      area,
      centroid: [x, z],
      ...(holes.length > 0 ? { holes: holes.map(roundRing) } : {}),
    });
  });
}

const added = [];
for (const item of osmBuildings) {
  const candidates = buildings.filter((building) => {
    if (!building.centroid) return false;
    const [x, z] = building.centroid;
    return x >= item.minX && x <= item.maxX && z >= item.minZ && z <= item.maxZ && inside(item.ring, x, z);
  });
  candidates.sort((a, b) => Math.abs(Math.log(a.area / item.area)) - Math.abs(Math.log(b.area / item.area)));
  const host = candidates.find((building) => building.area > item.area * 0.25) ?? null;
  if (host) {
    if (!host.name && item.name) host.name = item.name;
    if (host.heightSource !== "osm-height" && host.heightSource !== "county") {
      if (item.heightFeet) {
        host.heightFeet = round(item.heightFeet);
        host.heightSource = "osm-height";
      } else if (item.levelsFeet) {
        host.heightFeet = item.levelsFeet;
        host.heightSource = "osm-levels";
      }
    }
    continue;
  }
  const [x, z] = centroid(item.ring);
  if (x < buildingBox.minX || x > buildingBox.maxX || z < buildingBox.minZ || z > buildingBox.maxZ) continue;
  if (inside(existing.site.ring, x, z)) continue;
  const container = buildings.find((building) => building.centroid && inside(building.ring, x, z));
  if (container && container.area < item.area * 1.8) {
    if (!container.name && item.name) container.name = item.name;
    if (container.heightSource !== "osm-height" && container.heightSource !== "county") {
      if (item.heightFeet) {
        container.heightFeet = round(item.heightFeet);
        container.heightSource = "osm-height";
      } else if (item.levelsFeet) {
        container.heightFeet = item.levelsFeet;
        container.heightSource = "osm-levels";
      }
    }
    continue;
  }
  const ring = simplify(item.ring, 2);
  if (ring.length < 3 || Math.abs(signedArea(ring)) < 120) continue;
  added.push({
    id: 900000000 + added.length,
    name: item.name,
    heightFeet: item.heightFeet ? round(item.heightFeet) : item.levelsFeet,
    heightSource: item.heightFeet ? "osm-height" : item.levelsFeet ? "osm-levels" : null,
    ring: roundRing(ring),
    footprintSource: "osm",
  });
}
buildings.push(...added);
for (const building of buildings) {
  delete building.area;
  delete building.centroid;
}

const roadway = new Set(["motorway", "trunk", "primary", "secondary", "tertiary", "unclassified", "residential", "living_street", "road", "motorway_link", "trunk_link", "primary_link", "secondary_link", "tertiary_link", "service"]);

function clipSegment(start, end, box) {
  let x0 = start[0];
  let z0 = start[1];
  let x1 = end[0];
  let z1 = end[1];
  const code = (x, z) => (x < box.minX ? 1 : 0) | (x > box.maxX ? 2 : 0) | (z < box.minZ ? 4 : 0) | (z > box.maxZ ? 8 : 0);
  let c0 = code(x0, z0);
  let c1 = code(x1, z1);
  for (let step = 0; step < 12; step += 1) {
    if ((c0 | c1) === 0) return [[x0, z0], [x1, z1]];
    if (c0 & c1) return null;
    const out = c0 || c1;
    let x = x0;
    let z = z0;
    if (out & 8) {
      x = x0 + ((x1 - x0) * (box.maxZ - z0)) / (z1 - z0);
      z = box.maxZ;
    } else if (out & 4) {
      x = x0 + ((x1 - x0) * (box.minZ - z0)) / (z1 - z0);
      z = box.minZ;
    } else if (out & 2) {
      z = z0 + ((z1 - z0) * (box.maxX - x0)) / (x1 - x0);
      x = box.maxX;
    } else {
      z = z0 + ((z1 - z0) * (box.minX - x0)) / (x1 - x0);
      x = box.minX;
    }
    if (out === c0) {
      x0 = x;
      z0 = z;
      c0 = code(x0, z0);
    } else {
      x1 = x;
      z1 = z;
      c1 = code(x1, z1);
    }
  }
  return null;
}

function clipPath(path, box) {
  const parts = [];
  let current = [];
  const push = (point) => {
    const next = [round(point[0]), round(point[1])];
    const last = current[current.length - 1];
    if (!last || Math.hypot(last[0] - next[0], last[1] - next[1]) >= 1) current.push(next);
  };
  for (let index = 0; index < path.length - 1; index += 1) {
    const segment = clipSegment(path[index], path[index + 1], box);
    if (!segment) {
      if (current.length > 1) parts.push(current);
      current = [];
      continue;
    }
    if (current.length > 0) {
      const last = current[current.length - 1];
      if (Math.hypot(last[0] - segment[0][0], last[1] - segment[0][1]) > 2) {
        if (current.length > 1) parts.push(current);
        current = [];
      }
    }
    push(segment[0]);
    push(segment[1]);
  }
  if (current.length > 1) parts.push(current);
  return parts.filter((part) => {
    let length = 0;
    for (let index = 1; index < part.length; index += 1) length += Math.hypot(part[index][0] - part[index - 1][0], part[index][1] - part[index - 1][1]);
    return length >= 24;
  });
}

const roads = [];
const widthCounts = { "width-tag": 0, lanes: 0, display: 0 };
for (const element of overpass.elements ?? []) {
  const highway = element.tags?.highway;
  if (element.type !== "way" || !roadway.has(highway) || !element.geometry) continue;
  if (element.tags.tunnel === "yes" || element.tags.tunnel === "building_passage") continue;
  if (highway === "service" && !element.tags.name) continue;
  const label = element.tags.name || element.tags.ref || "Unnamed";
  const text = `${label} ${element.tags.ref ?? ""}`;
  let kind = "local";
  if (/macarthur|venetian/i.test(text)) kind = "causeway";
  else if (/causeway/i.test(label)) kind = "causeway";
  else if (highway === "motorway" || highway === "trunk") kind = "expressway";
  else if (highway.endsWith("_link")) kind = "ramp";
  const tagged = lengthToFeet(element.tags.width || element.tags.est_width, "meters");
  const lanes = Number(String(element.tags.lanes ?? "").split(";")[0]);
  let half = kind === "ramp" ? 14 : kind === "local" ? 16 : 24;
  let widthSource = "display";
  if (tagged && tagged >= 8 && tagged <= 240) {
    half = tagged / 2;
    widthSource = "width-tag";
  } else if (lanes >= 1 && lanes <= 10) {
    half = lanes * 6;
    widthSource = "lanes";
  }
  widthCounts[widthSource] += 1;
  const elevated = element.tags.bridge === "yes" || element.tags.bridge === "viaduct" || Number(element.tags.layer) > 0;
  const path = element.geometry.map((point) => project(point.lon, point.lat));
  for (const part of clipPath(path, roadBox)) {
    roads.push({
      name: label,
      kind,
      displayHalfWidthFeet: round(half),
      widthSource,
      elevated,
      path: part,
    });
  }
}

const keptNames = roads.map((road) => road.name.toLowerCase());
const needs = [
  [/herald/i, "HERALD PLZ"],
  [/15th/i, "NE 15TH ST"],
  [/macarthur/i, "MACARTHUR CSWY"],
];
for (const [pattern] of needs) {
  if (keptNames.some((name) => pattern.test(name))) continue;
  for (const road of existing.roads) {
    if (!pattern.test(road.name)) continue;
    const parts = clipPath(road.path, roadBox);
    for (const path of parts) {
      roads.push({
        name: road.name,
        kind: road.kind,
        displayHalfWidthFeet: road.kind === "local" ? 16 : road.kind === "ramp" ? 14 : 24,
        widthSource: "display",
        elevated: road.kind === "causeway" || road.kind === "expressway",
        path,
      });
    }
  }
}

const parcel = existing.sources.find((item) => item.id === "mdc-parcel");
const yearList = [...years].sort((a, b) => a - b);
const next = {
  ...existing,
  retrieved: "2026-10-20",
  buildings,
  roads,
  limitations: [
    existing.limitations[0],
    existing.limitations[1],
    "Building footprints are Miami-Dade BuildingFootprint2D. A footprint whose centroid is inside the parcel ring is left out, so an older mass is not drawn on the studio site.",
    `Heights marked osm-height are OpenStreetMap height tags converted from meters to international feet. Heights marked county use the county HEIGHT field as ${countyUnit}; the service does not publish a unit, and the populated values in this extract ${countyUnit === "feet" ? "are low-rise numbers, so they are drawn as feet" : "exceed 80 and are converted from meters"}. Heights marked osm-levels are provisional: the story count times 10 feet. Footprints with no height stay flat.`,
    "An OpenStreetMap name or height is joined to a county footprint only when that footprint's centroid falls inside the OpenStreetMap building and the county footprint is at least a quarter of its area. Otherwise the OpenStreetMap footprint is added and marked footprintSource osm, including a flat footprint when no height is tagged. A campus outline is not copied onto a small footprint inside it.",
    "Road surfaces follow OpenStreetMap highway centerlines clipped to the neighborhood window. Half-width is half of a width tag when present, otherwise the lane count times 6 feet, otherwise a class display width. These are not surveyed pavement edges.",
    "A way tagged as a bridge, or with a positive layer, is drawn 0.42 feet above the ground roads so the crossing reads. That offset is drawing order. No surveyed deck elevation was available.",
    "The water surface stays at local zero. No surveyed water elevation was loaded. The west edge is the existing OpenStreetMap coastline. The east edge is a map closure, not a far shore.",
    "Flood, storm surge, and topographic ground elevation were not loaded. Bridge deck elevations and LiDAR building heights were not available in the sources used here.",
  ],
  sources: [
    parcel,
    {
      id: "mdc-buildings",
      title: "Miami-Dade County building footprints, BuildingFootprint2D",
      url: "https://services.arcgis.com/8Pc9XBTAsYuxx9Ny/ArcGIS/rest/services/BuildingFootprint2D_gdb/FeatureServer/0",
      retrieved: "2026-10-20",
      note: `Service spatial reference wkid ${spatial.wkid ?? "unpublished"}, latest wkid ${spatial.latestWkid ?? "unpublished"}. Queried and returned in WGS84 (EPSG:4326), then placed with the site tangent-plane projection in international feet. Coverage is the neighborhood window around One Herald Plaza. Source codes in this extract: ${[...sources].join(", ") || "none"}. YEARUPDATE values: ${yearList.join(", ") || "none"}. HEIGHT is populated on only some features and its unit is not in the service metadata.`,
    },
    {
      id: "osm",
      title: "OpenStreetMap buildings and coastline",
      url: "https://www.openstreetmap.org/copyright",
      retrieved: "2026-10-20",
      note: `Building names, height tags, and building:levels in the same neighborhood window, retrieved from Overpass on 2026-10-20. Coastline ways ${existing.coastline.osmIds.join(" and ")} remain the waterfront edge used by the existing water polygon. Heights are meters unless the tag states feet. Story counts are not measurements.`,
    },
    {
      id: "osm-highways",
      title: "OpenStreetMap highways",
      url: "https://www.openstreetmap.org/copyright",
      retrieved: "2026-10-20",
      note: `Highway ways in longitude ${west.toFixed(5)} to ${east.toFixed(5)} and latitude ${south.toFixed(5)} to ${north.toFixed(5)}. Coordinate reference is WGS84. Width tags are treated as meters unless a unit is written. Lane width is an assumed 12 feet. Class display widths are 32 feet for a local street, 28 feet for a ramp, and 48 feet for a causeway or expressway, as total width. Miami-Dade StreetMaint centerlines were not redrawn; they have no pavement width.`,
    },
  ],
};

const counts = {
  countyFeatures: features.length,
  countyUnit,
  countyHeights: countyHeights.length,
  osmBuildings: osmBuildings.length,
  osmWithHeight: osmBuildings.filter((item) => item.heightFeet).length,
  buildings: buildings.length,
  omittedOnParcel,
  tagged: buildings.filter((item) => item.heightSource === "osm-height").length,
  county: buildings.filter((item) => item.heightSource === "county").length,
  levels: buildings.filter((item) => item.heightSource === "osm-levels").length,
  flat: buildings.filter((item) => item.heightFeet == null).length,
  roads: roads.length,
  elevated: roads.filter((road) => road.elevated).length,
  widthCounts,
  herald: roads.filter((road) => /herald/i.test(road.name)).length,
  fifteenth: roads.filter((road) => /15th/i.test(road.name)).length,
  macarthur: roads.filter((road) => /macarthur/i.test(road.name)).length,
  maxHeight: Math.max(0, ...buildings.map((item) => item.heightFeet ?? 0)),
  osmFootprints: buildings.filter((item) => item.footprintSource === "osm").length,
  names: buildings.filter((item) => item.name).map((item) => item.name),
};
console.log(JSON.stringify(counts, null, 2));
if (buildings.length < 80 || roads.length < 20 || counts.macarthur < 1) {
  throw new Error("Context extract is too thin to replace the site model.");
}
writeFileSync(sourcePath, JSON.stringify(next));
console.log("wrote", sourcePath.pathname);
