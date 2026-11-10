import type { SiteBuilding, XZ } from "@/lib/skill5/site-model";

export const URBAN_RETRIEVED = "2026-11-05";
export const DRAW_FEET = 1400;

export const URBAN_LIMITS = [
  "Miami-Dade existing land use is an area classification. It is not a survey of the business inside each building.",
  "A study group follows the county description. Mixed code 180 stays mixed. Private recreation code 517 is not a municipal park.",
  "Vacant land, streets, parking, water, and major approved projects are not residential, commercial, office, cultural, hospitality, or public space.",
  "ParkFinder distances are to the published point. The county park-boundary layer returned no features in this window. ParkFinder still names Bicentennial Park; OpenStreetMap names Maurice A. Ferré Park. Those records are not merged.",
  "OpenStreetMap destinations are mapped tags. A stored footprint name is not a land-use class. City Cementary is the county spelling.",
  "No activity intensity, pedestrian demand, or program location is calculated. No Physarum network is generated.",
] as const;

export const URBAN_MODES = [
  { id: "land-use", label: "Land Use" },
  { id: "generators", label: "Activity Generators" },
  { id: "relationships", label: "Urban Relationships" },
  { id: "program", label: "Program Relevance" },
] as const;

export const URBAN_GROUPS = [
  { id: "residential", label: "Residential" },
  { id: "commercial", label: "Commercial" },
  { id: "office", label: "Office" },
  { id: "cultural", label: "Cultural" },
  { id: "hospitality", label: "Hospitality" },
  { id: "public", label: "Public space" },
  { id: "mixed", label: "Mixed county class" },
  { id: "other", label: "Other verified" },
] as const;

export const GENERATOR_FILTERS = [
  { id: "park", label: "Parks" },
  { id: "cultural", label: "Cultural" },
  { id: "hotel", label: "Hotels" },
  { id: "transit", label: "Transit" },
  { id: "education", label: "Education" },
  { id: "other", label: "Other mapped" },
] as const;

export type UrbanMode = (typeof URBAN_MODES)[number]["id"];
export type UrbanGroup = (typeof URBAN_GROUPS)[number]["id"];
export type GeneratorFilter = (typeof GENERATOR_FILTERS)[number]["id"];
export type UrbanTone = UrbanGroup | "leader" | "marker";

export const DEFAULT_URBAN_GROUPS: UrbanGroup[] = ["residential", "commercial", "office", "cultural", "hospitality", "public"];
export const DEFAULT_GENERATOR_FILTERS: GeneratorFilter[] = ["park", "cultural", "hotel", "transit"];

const GROUP_BY_CODE: Record<number, UrbanGroup> = {
  10: "residential",
  11: "residential",
  20: "residential",
  30: "residential",
  35: "residential",
  110: "commercial",
  112: "commercial",
  113: "office",
  200: "hospitality",
  420: "cultural",
  510: "public",
  180: "mixed",
};

const COUNTY_GENERATOR: Record<number, GeneratorFilter> = {
  510: "park",
  420: "cultural",
  200: "hotel",
  414: "education",
  411: "education",
  412: "education",
  115: "other",
};

export type UrbanRecord = {
  retrieved: string;
  landUse: { title: string; url: string; window: string; note: string };
  parks: { title: string; url: string; countyBoundaries: string; note: string };
  osm: { title: string; url: string; note: string };
  polygons: { id: string; code: number; description: string; rings: XZ[][] }[];
  parkPoints: { id: string; name: string; address: string; className: string; acres: number; x: number; z: number }[];
  stations: { id: string; name: string; x: number; z: number; open: number | null }[];
  destinations: { id: string; name: string; kind: string; x: number; z: number }[];
};

export type UseArea = {
  id: string;
  code: number;
  description: string;
  group: UrbanGroup;
  rings: XZ[][];
  distanceFeet: number;
  containsCentroid: boolean;
  boundaryVertices: number;
  names: string[];
};

export type ActivityPoint = {
  id: string;
  name: string;
  filter: GeneratorFilter;
  kind: string;
  authority: "parkfinder" | "openstreetmap" | "county-transit" | "county-land-use";
  status: "verified" | "mapped";
  x: number;
  z: number;
  distanceFeet: number;
  county: string | null;
  note: string;
};

export type UseRelation = {
  label: string;
  distanceFeet: number;
  ax: number;
  az: number;
  bx: number;
  bz: number;
};

export type ProgramLink = {
  program: string;
  text: string;
};

export type UrbanStudy = {
  areas: UseArea[];
  points: ActivityPoint[];
  parcelUses: UseArea[];
  relations: UseRelation[];
  programs: ProgramLink[];
};

export type UseSegment = {
  ax: number;
  az: number;
  bx: number;
  bz: number;
  tone: UrbanTone;
};

export type UrbanRun = {
  mode: UrbanMode;
  title: string;
  primary: string;
  secondary: string;
  metrics: readonly { label: string; value: string }[];
};

export function groupOf(code: number): UrbanGroup {
  return GROUP_BY_CODE[code] ?? "other";
}

export function groupLabel(group: UrbanGroup) {
  return URBAN_GROUPS.find((item) => item.id === group)?.label ?? group;
}

function centroid(ring: readonly XZ[]) {
  const closed = ring.length > 1 && ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1];
  const count = closed ? ring.length - 1 : ring.length;
  let x = 0;
  let z = 0;
  for (let index = 0; index < count; index += 1) {
    x += ring[index][0];
    z += ring[index][1];
  }
  return { x: x / count, z: z / count };
}

function inside(x: number, z: number, rings: readonly (readonly XZ[])[]) {
  let contained = false;
  for (const ring of rings) {
    for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index, index += 1) {
      const ay = ring[index][1];
      const by = ring[previous][1];
      if ((ay > z) === (by > z)) continue;
      const ax = ring[index][0];
      const bx = ring[previous][0];
      if (x < ((bx - ax) * (z - ay)) / (by - ay) + ax) contained = !contained;
    }
  }
  return contained;
}

function segmentGap(
  ax: number, az: number, bx: number, bz: number,
  cx: number, cz: number, dx: number, dz: number,
) {
  const rx = bx - ax;
  const rz = bz - az;
  const sx = dx - cx;
  const sz = dz - cz;
  const qx = ax - cx;
  const qz = az - cz;
  const rr = rx * rx + rz * rz;
  const ss = sx * sx + sz * sz;
  const rs = rx * sx + rz * sz;
  const qr = qx * rx + qz * rz;
  const qs = qx * sx + qz * sz;
  let t = 0;
  let u = 0;
  const denom = rr * ss - rs * rs;
  if (denom > 1e-6 && rr > 1e-6 && ss > 1e-6) t = Math.max(0, Math.min(1, (rs * qs - ss * qr) / denom));
  u = ss > 1e-6 ? Math.max(0, Math.min(1, (rs * t + qs) / ss)) : 0;
  t = rr > 1e-6 ? Math.max(0, Math.min(1, (rs * u - qr) / rr)) : 0;
  u = ss > 1e-6 ? Math.max(0, Math.min(1, (rs * t + qs) / ss)) : 0;
  const px = ax + rx * t;
  const pz = az + rz * t;
  const qx2 = cx + sx * u;
  const qz2 = cz + sz * u;
  return { feet: Math.hypot(px - qx2, pz - qz2), ax: px, az: pz, bx: qx2, bz: qz2 };
}

export function pointDistance(x: number, z: number, ring: readonly XZ[]) {
  let feet = Infinity;
  let nearX = ring[0][0];
  let nearZ = ring[0][1];
  for (let index = 0; index < ring.length - 1; index += 1) {
    const gap = segmentGap(x, z, x, z, ring[index][0], ring[index][1], ring[index + 1][0], ring[index + 1][1]);
    if (gap.feet < feet) {
      feet = gap.feet;
      nearX = gap.bx;
      nearZ = gap.bz;
    }
  }
  return { feet, x: nearX, z: nearZ };
}

function polygonDistance(parcel: readonly XZ[], rings: readonly (readonly XZ[])[]) {
  let feet = Infinity;
  let ax = parcel[0][0];
  let az = parcel[0][1];
  let bx = rings[0][0][0];
  let bz = rings[0][0][1];
  for (let index = 0; index < parcel.length - 1; index += 1) {
    for (const ring of rings) {
      for (let step = 0; step < ring.length - 1; step += 1) {
        const gap = segmentGap(
          parcel[index][0], parcel[index][1], parcel[index + 1][0], parcel[index + 1][1],
          ring[step][0], ring[step][1], ring[step + 1][0], ring[step + 1][1],
        );
        if (gap.feet < feet) {
          feet = gap.feet;
          ax = gap.ax;
          az = gap.az;
          bx = gap.bx;
          bz = gap.bz;
        }
      }
    }
  }
  return { feet, ax, az, bx, bz };
}

function namesInside(rings: readonly (readonly XZ[])[], buildings: readonly SiteBuilding[]) {
  const names: string[] = [];
  for (const building of buildings) {
    if (!building.name) continue;
    const center = centroid(building.ring);
    if (inside(center.x, center.z, rings)) names.push(building.name);
  }
  return names;
}

function filterOf(kind: string, name: string): GeneratorFilter {
  if (name.toLowerCase().includes("historical")) return "other";
  if (kind === "park") return "park";
  if (kind === "museum" || kind === "gallery" || kind === "theatre" || kind === "attraction") return kind === "attraction" ? "other" : "cultural";
  if (kind === "hotel") return "hotel";
  if (kind === "college" || kind === "library" || kind === "school") return "education";
  return "other";
}

function countyAt(x: number, z: number, areas: readonly UseArea[]) {
  const hits = areas.filter((area) => inside(x, z, area.rings));
  if (hits.length === 0) return null;
  return hits.map((area) => `${area.code} ${area.description.replace(/\.$/, "")}`).join("; ");
}

function mappedNote(kind: string, filter: GeneratorFilter, name: string, county: string | null) {
  if (name.toLowerCase().includes("historical")) return "OpenStreetMap name marks this feature as historical. It is not counted as a current park.";
  const expected = kind === "hotel" ? "200" : filter === "park" ? "510" : filter === "cultural" ? "420" : null;
  if (expected && county && !county.startsWith(expected)) {
    return `OpenStreetMap tags this as ${kind}. The county class at the point is not code ${expected}.`;
  }
  return "OpenStreetMap tag. This is not a county land-use class.";
}

function nearestArea(areas: readonly UseArea[], group: UrbanGroup) {
  return areas.filter((area) => area.group === group).sort((a, b) => a.distanceFeet - b.distanceFeet)[0] ?? null;
}

function nearestPoint(points: readonly ActivityPoint[], filter: GeneratorFilter) {
  return points.filter((point) => point.filter === filter).sort((a, b) => a.distanceFeet - b.distanceFeet)[0] ?? null;
}

function programText(label: string, parts: string[]) {
  return `${parts.join(" ")} This could inform a ${label} attractor. Nothing is placed on the parcel, and no Physarum network is generated.`;
}

export function urbanReading(parcel: readonly XZ[], buildings: readonly SiteBuilding[], record: UrbanRecord): UrbanStudy {
  const center = centroid(parcel);
  const areas: UseArea[] = record.polygons.map((polygon) => {
    const measured = polygonDistance(parcel, polygon.rings);
    const containsCentroid = inside(center.x, center.z, polygon.rings);
    const boundaryVertices = parcel.filter((point, index) => index < parcel.length - 1 && inside(point[0], point[1], polygon.rings)).length;
    const overlaps = containsCentroid || boundaryVertices > 0;
    return {
      id: polygon.id,
      code: polygon.code,
      description: polygon.description,
      group: groupOf(polygon.code),
      rings: polygon.rings,
      distanceFeet: overlaps ? 0 : measured.feet,
      containsCentroid,
      boundaryVertices,
      names: [],
    };
  });

  for (const area of areas) {
    if (area.containsCentroid || area.boundaryVertices > 0 || area.group === "cultural" || area.group === "hospitality" || area.group === "office" || area.group === "public") {
      area.names = namesInside(area.rings, buildings);
    }
  }

  const points: ActivityPoint[] = [];
  for (const park of record.parkPoints) {
    const gap = pointDistance(park.x, park.z, parcel);
    points.push({
      id: park.id,
      name: park.name,
      filter: "park",
      kind: park.className,
      authority: "parkfinder",
      status: "verified",
      x: park.x,
      z: park.z,
      distanceFeet: gap.feet,
      county: countyAt(park.x, park.z, areas),
      note: `${park.className} park record at ${park.address}. Distance is to the ParkFinder point, not a park boundary.`,
    });
  }
  for (const station of record.stations) {
    const gap = pointDistance(station.x, station.z, parcel);
    points.push({
      id: station.id,
      name: station.name,
      filter: "transit",
      kind: "metromover",
      authority: "county-transit",
      status: "verified",
      x: station.x,
      z: station.z,
      distanceFeet: gap.feet,
      county: countyAt(station.x, station.z, areas),
      note: station.open === 0 || station.open === 1
        ? `Metromover station from the county layer. The stored open flag is ${station.open}. That flag is not a live operating check.`
        : "Metromover station from the county layer. No open flag was stored.",
    });
  }
  for (const place of record.destinations) {
    const gap = pointDistance(place.x, place.z, parcel);
    const filter = filterOf(place.kind, place.name);
    points.push({
      id: place.id,
      name: place.name,
      filter,
      kind: place.kind,
      authority: "openstreetmap",
      status: "mapped",
      x: place.x,
      z: place.z,
      distanceFeet: gap.feet,
      county: countyAt(place.x, place.z, areas),
      note: mappedNote(place.kind, filter, place.name, countyAt(place.x, place.z, areas)),
    });
  }
  for (const area of areas) {
    const filter = COUNTY_GENERATOR[area.code];
    if (!filter) continue;
    const measured = polygonDistance(parcel, area.rings);
    points.push({
      id: `${area.id}-area`,
      name: area.names.length > 0 ? `${area.description.replace(/\.$/, "")}. Footprint name: ${area.names.slice(0, 2).join(", ")}` : area.description.replace(/\.$/, ""),
      filter,
      kind: `county-${area.code}`,
      authority: "county-land-use",
      status: "verified",
      x: measured.bx,
      z: measured.bz,
      distanceFeet: area.distanceFeet,
      county: `${area.code} ${area.description.replace(/\.$/, "")}`,
      note: "County land-use polygon. A footprint name on it is not a separate use.",
    });
  }

  const parcelUses = areas.filter((area) => area.containsCentroid || area.boundaryVertices > 0).sort((a, b) => a.code - b.code);
  const publicArea = nearestArea(areas, "public");
  const culturalArea = nearestArea(areas, "cultural");
  const officeArea = nearestArea(areas, "office");
  const researchArea = areas.filter((area) => area.code === 414).sort((a, b) => a.distanceFeet - b.distanceFeet)[0] ?? null;
  const privateOpen = areas.filter((area) => area.code === 517).sort((a, b) => a.distanceFeet - b.distanceFeet)[0] ?? null;
  const mixedArea = nearestArea(areas, "mixed");
  const parkPoint = nearestPoint(points.filter((point) => point.authority !== "county-land-use"), "park");
  const culturalPoint = nearestPoint(points.filter((point) => point.authority === "openstreetmap"), "cultural");
  const collegePoint = points.filter((point) => point.authority === "openstreetmap" && (point.kind === "college" || point.kind === "library")).sort((a, b) => a.distanceFeet - b.distanceFeet)[0] ?? null;

  const programs: ProgramLink[] = [
    {
      program: "Public gathering",
      text: programText("public gathering", [
        publicArea ? `Nearest municipal-park land use is code ${publicArea.code}, ${areaPlace(publicArea)}.` : "No municipal-park land use falls in this extract.",
        parkPoint ? `Nearest ParkFinder or mapped park point is ${parkPoint.name}, ${Math.round(parkPoint.distanceFeet)} ft to the point (${parkPoint.authority}).` : "No park point falls in this extract.",
      ]),
    },
    {
      program: "Gallery",
      text: programText("gallery", [
        culturalArea ? `Nearest cultural land use is code ${culturalArea.code}, ${areaPlace(culturalArea)}.` : "No cultural land use falls in this extract.",
        culturalPoint ? `Nearest mapped museum, gallery, or theatre is ${culturalPoint.name}, ${Math.round(culturalPoint.distanceFeet)} ft.` : "No mapped museum, gallery, or theatre falls in this extract.",
      ]),
    },
    {
      program: "Workspace",
      text: programText("workspace", [
        officeArea ? `Nearest office land use is code ${officeArea.code}, ${areaPlace(officeArea)}.` : "No office land use falls in this extract.",
        mixedArea ? `Code 180 is a mixed county class at ${Math.round(mixedArea.distanceFeet)} ft. It is not counted as office.` : "No mixed code 180 falls in this extract.",
      ]),
    },
    {
      program: "Research",
      text: programText("research", [
        researchArea ? `Nearest college or research land use is code 414, ${areaPlace(researchArea)}.` : "No code 414 college or research land use falls in this extract.",
        collegePoint ? `Nearest mapped college or library is ${collegePoint.name}, ${Math.round(collegePoint.distanceFeet)} ft.` : "No mapped college or library falls in this extract.",
      ]),
    },
    {
      program: "Leisure",
      text: programText("leisure", [
        publicArea ? `Nearest municipal-park land use is ${Math.round(publicArea.distanceFeet)} ft from the parcel.` : "No municipal-park land use falls in this extract.",
        privateOpen ? `Nearest private recreation is code 517, ${Math.round(privateOpen.distanceFeet)} ft away. That is not a public park.` : "No private-recreation code 517 falls in this extract.",
      ]),
    },
  ];

  const relations: UseRelation[] = [];
  for (const group of URBAN_GROUPS) {
    const area = nearestArea(areas, group.id);
    if (!area) continue;
    const measured = polygonDistance(parcel, area.rings);
    relations.push({
      label: `${groupLabel(group.id)} · ${area.code}`,
      distanceFeet: area.distanceFeet,
      ax: measured.ax,
      az: measured.az,
      bx: measured.bx,
      bz: measured.bz,
    });
  }

  return { areas, points, parcelUses, relations, programs };
}

function areaPlace(area: UseArea) {
  if (area.containsCentroid) return "containing the parcel centroid";
  if (area.boundaryVertices > 0) return `containing ${area.boundaryVertices} parcel-boundary vertices`;
  return `${Math.round(area.distanceFeet)} ft from the parcel`;
}

function outline(area: UseArea, tone: UrbanTone, segments: UseSegment[]) {
  for (const ring of area.rings) {
    for (let index = 0; index < ring.length - 1; index += 1) {
      segments.push({ ax: ring[index][0], az: ring[index][1], bx: ring[index + 1][0], bz: ring[index + 1][1], tone });
    }
  }
}

function marker(point: ActivityPoint, segments: UseSegment[]) {
  segments.push(
    { ax: point.x - 16, az: point.z, bx: point.x + 16, bz: point.z, tone: "marker" },
    { ax: point.x, az: point.z - 16, bx: point.x, bz: point.z + 16, tone: "marker" },
  );
}

function leader(relation: UseRelation, segments: UseSegment[]) {
  if (relation.distanceFeet < 1) return;
  segments.push({ ax: relation.ax, az: relation.az, bx: relation.bx, bz: relation.bz, tone: "leader" });
}

export function urbanSegments(
  mode: UrbanMode,
  groups: readonly UrbanGroup[],
  filters: readonly GeneratorFilter[],
  study: UrbanStudy,
): UseSegment[] {
  const segments: UseSegment[] = [];
  const selected = new Set(groups);
  const active = new Set(filters);
  if (mode === "land-use") {
    for (const area of study.areas) {
      if (!selected.has(area.group) || (area.boundaryVertices === 0 && !area.containsCentroid && area.distanceFeet > DRAW_FEET)) continue;
      outline(area, area.group, segments);
    }
  }
  if (mode === "generators") {
    for (const area of study.areas) {
      const filter = COUNTY_GENERATOR[area.code];
      if (!filter || !active.has(filter) || (area.boundaryVertices === 0 && !area.containsCentroid && area.distanceFeet > DRAW_FEET)) continue;
      outline(area, area.group === "other" ? "other" : area.group, segments);
    }
    for (const point of study.points) {
      if (point.authority === "county-land-use" || !active.has(point.filter) || point.distanceFeet > DRAW_FEET) continue;
      marker(point, segments);
    }
  }
  if (mode === "relationships") {
    for (const relation of study.relations) {
      const group = URBAN_GROUPS.find((item) => relation.label.startsWith(item.label));
      if (!group || !selected.has(group.id)) continue;
      leader(relation, segments);
    }
  }
  if (mode === "program") {
    for (const group of ["public", "cultural", "office"] as const) {
      const relation = study.relations.find((item) => item.label.startsWith(groupLabel(group)));
      if (relation) leader(relation, segments);
    }
  }
  return segments;
}

function feetLabel(value: number) {
  if (value < 1) return "meets the parcel";
  if (value < 10) return `${value.toFixed(1)} ft`;
  return `${Math.round(value).toLocaleString("en-US")} ft`;
}

export function urbanRun(
  mode: UrbanMode,
  groups: readonly UrbanGroup[],
  filters: readonly GeneratorFilter[],
  study: UrbanStudy,
): UrbanRun {
  if (mode === "land-use") {
    const nearest = study.areas
      .filter((area) => groups.includes(area.group))
      .sort((a, b) => a.distanceFeet - b.distanceFeet)[0] ?? null;
    const centroid = study.parcelUses.filter((area) => area.containsCentroid).map((area) => `${area.code} ${area.description.replace(/\.$/, "")}`).join("; ");
    const boundary = study.parcelUses.filter((area) => !area.containsCentroid && area.boundaryVertices > 0).map((area) => `${area.code} touches ${area.boundaryVertices} boundary vertices`).join("; ");
    return {
      mode,
      title: "Land use",
      primary: nearest ? `${groupLabel(nearest.group)} · ${nearest.code} · ${feetLabel(nearest.distanceFeet)}` : "No group selected",
      secondary: `Centroid: ${centroid || "none"}. ${boundary || "No other polygon contains a boundary vertex."}`,
      metrics: [
        { label: "Nearest", value: nearest ? `${nearest.code} · ${feetLabel(nearest.distanceFeet)}` : "None" },
        { label: "Centroid", value: study.parcelUses.find((area) => area.containsCentroid)?.code.toString() ?? "None" },
        { label: "Boundary", value: study.parcelUses.filter((area) => !area.containsCentroid && area.boundaryVertices > 0).map((area) => String(area.code)).join(", ") || "None" },
      ],
    };
  }
  if (mode === "generators") {
    const nearest = study.points
      .filter((point) => filters.includes(point.filter))
      .sort((a, b) => a.distanceFeet - b.distanceFeet)[0] ?? null;
    const count = study.points.filter((point) => filters.includes(point.filter)).length;
    return {
      mode,
      title: "Activity generators",
      primary: nearest ? `${nearest.name} · ${feetLabel(nearest.distanceFeet)}` : "No generator selected",
      secondary: `${count} documented points or areas`,
      metrics: [
        { label: "Distance", value: nearest ? feetLabel(nearest.distanceFeet) : "None" },
        { label: "Count", value: String(count) },
        { label: "Status", value: nearest?.status ?? "None" },
      ],
    };
  }
  if (mode === "relationships") {
    const visible = study.relations.filter((relation) => {
      const group = URBAN_GROUPS.find((item) => relation.label.startsWith(item.label));
      return group ? groups.includes(group.id) : false;
    }).sort((a, b) => a.distanceFeet - b.distanceFeet);
    return {
      mode,
      title: "Urban relationships",
      primary: visible[0] ? `${visible[0].label} · ${feetLabel(visible[0].distanceFeet)}` : "No group selected",
      secondary: visible[1] ? `${visible[1].label} · ${feetLabel(visible[1].distanceFeet)}` : "No second relationship",
      metrics: [
        { label: "Nearest", value: visible[0] ? feetLabel(visible[0].distanceFeet) : "None" },
        { label: "Next", value: visible[1] ? feetLabel(visible[1].distanceFeet) : "None" },
        { label: "Groups", value: String(visible.length) },
      ],
    };
  }
  const gathering = study.areas.filter((area) => area.group === "public").sort((a, b) => a.distanceFeet - b.distanceFeet)[0];
  const gallery = study.areas.filter((area) => area.group === "cultural").sort((a, b) => a.distanceFeet - b.distanceFeet)[0];
  const workspace = study.areas.filter((area) => area.group === "office").sort((a, b) => a.distanceFeet - b.distanceFeet)[0];
  return {
    mode,
    title: "Program relevance",
    primary: study.programs[0]?.text.split(". ")[0] ?? "No gathering relationship",
    secondary: study.programs[1]?.text.split(". ")[0] ?? "No gallery relationship",
    metrics: [
      { label: "Gathering", value: gathering ? feetLabel(gathering.distanceFeet) : "None" },
      { label: "Gallery", value: gallery ? feetLabel(gallery.distanceFeet) : "None" },
      { label: "Workspace", value: workspace ? feetLabel(workspace.distanceFeet) : "None" },
    ],
  };
}
