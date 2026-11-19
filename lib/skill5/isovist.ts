import { STUDY_LIMIT } from "@/components/site/site-geometry";
import { pointInRing } from "@/lib/skill5/placement";
import type { SiteBuilding, SiteHeightSource, XZ } from "@/lib/skill5/site-model";
import type { AnalysisTower } from "@/lib/skill5/sun-analysis";

/** Horizontal eye used by the Views isovist. The coastal sightline test is separate. */
export const ISOVIST_EYE_FEET = 5.5;
const SAMPLE_DEGREES = 2;
/** Lateral offset, in feet, for the rays placed to either side of a corner. */
const CORNER_OFFSET_FEET = 0.5;
const SEPARATION_DEGREES = 24;
const WATERFRONT_MIN_DEGREES = 8;
const OPEN_MIN_DEGREES = 20;

export type IsovistSource = SiteHeightSource | "published";

export type IsovistKind = "obstacle" | "waterfront" | "open";

export type IsovistSample = {
  /** Radians in [0, 2π). Zero is east. North is positive. */
  radians: number;
  /** Signed degrees, −180 to 180. */
  bearing: number;
  distance: number;
  x: number;
  z: number;
  kind: IsovistKind;
  solidId: string | null;
};

export type IsovistHighlight = {
  id: string;
  /** Stable building or tower id. Null for open and waterfront highlights. */
  targetId: string | null;
  bearing: number;
  distance: number;
  x: number;
  z: number;
  kind: IsovistKind;
  title: string;
  note: string;
  source: IsovistSource | null;
};

export type Isovist = {
  eyeHeight: number;
  origin: { x: number; z: number };
  samples: IsovistSample[];
  visibleArea: number;
  windowArea: number;
  window: { minX: number; maxX: number; minZ: number; maxZ: number };
  highlights: IsovistHighlight[];
  estimatedSamples: number;
};

type Solid = {
  id: string;
  name: string | null;
  heightFeet: number;
  source: IsovistSource;
  ring: readonly XZ[];
  holes: readonly (readonly XZ[])[];
  edges: { ax: number; az: number; bx: number; bz: number }[];
  vertices: { x: number; z: number }[];
};

export type IsovistIndex = { solids: Solid[] };

type Box = { minX: number; maxX: number; minZ: number; maxZ: number };

function centroid(ring: readonly XZ[]) {
  let x = 0;
  let z = 0;
  for (const [px, pz] of ring) {
    x += px;
    z += pz;
  }
  return { x: x / ring.length, z: z / ring.length };
}

function inBox(x: number, z: number, box: Box) {
  return x >= box.minX && x <= box.maxX && z >= box.minZ && z <= box.maxZ;
}

function ringInStudy(ring: readonly XZ[], box: Box) {
  const center = centroid(ring);
  if (inBox(center.x, center.z, box)) return true;
  return ring.some(([x, z]) => inBox(x, z, box));
}

function edgesOf(rings: readonly (readonly XZ[])[]) {
  const edges: Solid["edges"] = [];
  const vertices: Solid["vertices"] = [];
  for (const ring of rings) {
    for (let index = 0; index < ring.length; index += 1) {
      const [ax, az] = ring[index];
      const [bx, bz] = ring[(index + 1) % ring.length];
      edges.push({ ax, az, bx, bz });
      vertices.push({ x: ax, z: az });
    }
  }
  return { edges, vertices };
}

function solidFrom(id: string, name: string | null, heightFeet: number, source: IsovistSource, ring: readonly XZ[], holes: readonly (readonly XZ[])[]): Solid {
  const { edges, vertices } = edgesOf([ring, ...holes]);
  return { id, name, heightFeet, source, ring, holes, edges, vertices };
}

/** Footprints at or above eye height inside the study window. Decks are not occluders. */
export function buildIsovistIndex(buildings: readonly SiteBuilding[], towers: readonly AnalysisTower[], box: Box = STUDY_LIMIT): IsovistIndex {
  const solids: Solid[] = [];
  for (const building of buildings) {
    if (building.heightFeet === null || building.heightFeet < ISOVIST_EYE_FEET || building.ring.length < 3) continue;
    if (!ringInStudy(building.ring, box)) continue;
    solids.push(solidFrom(`building:${building.id}`, building.name, building.heightFeet, building.heightSource ?? "estimated", building.ring, building.holes ?? []));
  }
  for (const tower of towers) {
    if (tower.heightFeet < ISOVIST_EYE_FEET || tower.ring.length < 3) continue;
    if (!ringInStudy(tower.ring, box)) continue;
    solids.push(solidFrom(`tower:${tower.id}`, tower.name, tower.heightFeet, "published", tower.ring, []));
  }
  return { solids };
}

function rayEdge(ox: number, oz: number, dx: number, dz: number, ax: number, az: number, bx: number, bz: number) {
  const sx = bx - ax;
  const sz = bz - az;
  const den = dx * sz - dz * sx;
  if (Math.abs(den) < 1e-8) return null;
  const t = ((ax - ox) * sz - (az - oz) * sx) / den;
  const u = ((ax - ox) * dz - (az - oz) * dx) / den;
  if (t > 0.05 && u >= -1e-6 && u <= 1 + 1e-6) return t;
  return null;
}

function insideSolid(x: number, z: number, solid: Solid) {
  if (!pointInRing(x, z, solid.ring)) return false;
  return !solid.holes.some((hole) => hole.length >= 3 && pointInRing(x, z, hole));
}

function boxExit(ox: number, oz: number, dx: number, dz: number, box: Box) {
  let travel = Infinity;
  if (dx > 1e-9) travel = Math.min(travel, (box.maxX - ox) / dx);
  else if (dx < -1e-9) travel = Math.min(travel, (box.minX - ox) / dx);
  if (dz > 1e-9) travel = Math.min(travel, (box.maxZ - oz) / dz);
  else if (dz < -1e-9) travel = Math.min(travel, (box.minZ - oz) / dz);
  return travel;
}

function coastHit(ox: number, oz: number, dx: number, dz: number, coast: readonly XZ[], limit: number) {
  let best: number | null = null;
  for (let index = 0; index < coast.length - 1; index += 1) {
    const [ax, az] = coast[index];
    const [bx, bz] = coast[index + 1];
    const t = rayEdge(ox, oz, dx, dz, ax, az, bx, bz);
    if (t === null || t > limit) continue;
    if (best === null || t < best) best = t;
  }
  return best;
}

function firstSolid(ox: number, oz: number, dx: number, dz: number, solids: readonly Solid[], limit: number) {
  let best: { solid: Solid; feet: number } | null = null;
  for (const solid of solids) {
    if (insideSolid(ox, oz, solid)) return { solid, feet: 0 };
    for (const edge of solid.edges) {
      const t = rayEdge(ox, oz, dx, dz, edge.ax, edge.az, edge.bx, edge.bz);
      if (t === null || t >= limit) continue;
      if (!insideSolid(ox + dx * (t + 0.35), oz + dz * (t + 0.35), solid)) continue;
      if (!best || t < best.feet) best = { solid, feet: t };
    }
  }
  return best;
}

function wrap(radians: number) {
  const turn = Math.PI * 2;
  return ((radians % turn) + turn) % turn;
}

function signedDegrees(radians: number) {
  const degrees = (radians * 180) / Math.PI;
  return degrees > 180 ? degrees - 360 : degrees;
}

function bearingsFor(origin: { x: number; z: number }, solids: readonly Solid[]) {
  const values: number[] = [];
  for (let degrees = 0; degrees < 360; degrees += SAMPLE_DEGREES) values.push((degrees * Math.PI) / 180);
  for (const solid of solids) {
    for (const vertex of solid.vertices) {
      const dx = vertex.x - origin.x;
      const dz = vertex.z - origin.z;
      const distance = Math.hypot(dx, dz);
      if (distance < 1) continue;
      const bearing = Math.atan2(dz, dx);
      const delta = Math.atan(CORNER_OFFSET_FEET / distance);
      values.push(wrap(bearing - delta), wrap(bearing + delta));
    }
  }
  values.sort((a, b) => a - b);
  const unique: number[] = [];
  for (const value of values) {
    const previous = unique[unique.length - 1];
    if (previous === undefined || value - previous > 1e-4) unique.push(value);
  }
  if (unique.length > 1 && unique[0] + Math.PI * 2 - unique[unique.length - 1] < 1e-4) unique.pop();
  return unique;
}

function forward(from: number, to: number) {
  let delta = to - from;
  if (delta < 0) delta += Math.PI * 2;
  return delta;
}

function spanDegrees(run: readonly IsovistSample[]) {
  if (run.length < 2) return SAMPLE_DEGREES;
  let span = 0;
  for (let index = 1; index < run.length; index += 1) span += forward(run[index - 1].radians, run[index].radians);
  return (span * 180) / Math.PI;
}

function runsOf(samples: readonly IsovistSample[]) {
  if (samples.length === 0) return [];
  const key = (sample: IsovistSample) => (sample.kind === "obstacle" ? `obstacle:${sample.solidId}` : sample.kind);
  let start = 0;
  for (let index = 1; index < samples.length; index += 1) {
    if (key(samples[index]) !== key(samples[0])) {
      start = index;
      break;
    }
  }
  const ordered = start === 0 && key(samples[samples.length - 1]) === key(samples[0])
    ? samples
    : [...samples.slice(start), ...samples.slice(0, start)];
  const groups: IsovistSample[][] = [];
  let current: IsovistSample[] = [ordered[0]];
  for (let index = 1; index < ordered.length; index += 1) {
    if (key(ordered[index]) === key(current[0])) current.push(ordered[index]);
    else {
      groups.push(current);
      current = [ordered[index]];
    }
  }
  groups.push(current);
  return groups;
}

function massTitle(name: string | null) {
  if (!name || /^unnamed$/i.test(name)) return "Unnamed building";
  return name;
}

function sourceNote(source: IsovistSource) {
  if (source === "estimated") return "estimated height";
  if (source === "osm-levels") return "story count";
  if (source === "osm-height") return "tagged height";
  if (source === "county") return "county height";
  return "published tower height";
}

type Candidate = {
  sample: IsovistSample;
  span: number;
  rank: number;
  solidId: string | null;
  title: string;
  note: string;
  source: IsovistSource | null;
};

function selectHighlights(samples: readonly IsovistSample[], solids: readonly Solid[]) {
  const byId = new Map(solids.map((solid) => [solid.id, solid]));
  const candidates: Candidate[] = [];
  for (const run of runsOf(samples)) {
    const span = spanDegrees(run);
    const kind = run[0].kind;
    if (kind === "waterfront" && span < WATERFRONT_MIN_DEGREES) continue;
    if (kind === "open" && span < OPEN_MIN_DEGREES) continue;
    if (kind === "obstacle") {
      const sample = run.reduce((best, item) => (item.distance < best.distance ? item : best));
      const solid = sample.solidId ? byId.get(sample.solidId) : undefined;
      if (!solid) continue;
      const tagged = solid.source === "published" || solid.source === "osm-height" || solid.source === "county";
      candidates.push({
        sample,
        span,
        rank: (tagged ? 500 : solid.name ? 320 : 240) + Math.min(span, 80),
        solidId: solid.id,
        title: massTitle(solid.name),
        note: sourceNote(solid.source),
        source: solid.source,
      });
      continue;
    }
    const sample = kind === "open"
      ? run.reduce((best, item) => (item.distance > best.distance ? item : best))
      : run[Math.floor(run.length / 2)];
    candidates.push({
      sample,
      span,
      rank: (kind === "waterfront" ? 380 : 120) + Math.min(span, 60),
      solidId: null,
      title: kind === "waterfront" ? "Open waterfront" : "Open to the study boundary",
      note: kind === "waterfront" ? "The mapped coastline is crossed before the study window." : "No stored obstacle before the study window.",
      source: null,
    });
  }
  candidates.sort((a, b) => b.rank - a.rank || a.sample.bearing - b.sample.bearing);
  const picked: Candidate[] = [];
  for (const candidate of candidates) {
    if (picked.length >= 5) break;
    if (candidate.solidId && picked.some((item) => item.solidId === candidate.solidId)) continue;
    const crowded = picked.some((item) => {
      const delta = Math.abs(item.sample.bearing - candidate.sample.bearing);
      return Math.min(delta, 360 - delta) < SEPARATION_DEGREES;
    });
    if (crowded) continue;
    picked.push(candidate);
  }
  return picked
    .sort((a, b) => a.sample.radians - b.sample.radians)
    .map((candidate) => ({
      id: `${candidate.sample.kind}:${candidate.sample.bearing.toFixed(2)}:${candidate.sample.distance.toFixed(1)}`,
      targetId: candidate.solidId,
      bearing: candidate.sample.bearing,
      distance: candidate.sample.distance,
      x: candidate.sample.x,
      z: candidate.sample.z,
      kind: candidate.sample.kind,
      title: candidate.title,
      note: candidate.note,
      source: candidate.source,
    }));
}

function polygonArea(samples: readonly IsovistSample[]) {
  let sum = 0;
  for (let index = 0; index < samples.length; index += 1) {
    const next = samples[(index + 1) % samples.length];
    sum += samples[index].x * next.z - next.x * samples[index].z;
  }
  return Math.abs(sum) / 2;
}

/** Horizontal 360° visibility at 5.5 ft. Recalculate only when the observer or the index changes. */
export function isovistAt(index: IsovistIndex, origin: { x: number; z: number }, coast: readonly XZ[], box: Box = STUDY_LIMIT): Isovist {
  const samples: IsovistSample[] = [];
  let estimatedSamples = 0;
  for (const radians of bearingsFor(origin, index.solids)) {
    const east = Math.cos(radians);
    const north = Math.sin(radians);
    const limit = boxExit(origin.x, origin.z, east, north, box);
    if (!Number.isFinite(limit) || limit <= 0.05) continue;
    const hit = firstSolid(origin.x, origin.z, east, north, index.solids, limit);
    const coastFeet = coastHit(origin.x, origin.z, east, north, coast, limit);
    const blocked = hit !== null && hit.feet < limit;
    const kind: IsovistKind = blocked ? "obstacle" : coastFeet !== null ? "waterfront" : "open";
    const distance = blocked ? hit.feet : limit;
    if (blocked && (hit.solid.source === "estimated" || hit.solid.source === "osm-levels")) estimatedSamples += 1;
    samples.push({
      radians,
      bearing: signedDegrees(radians),
      distance,
      x: origin.x + east * distance,
      z: origin.z + north * distance,
      kind,
      solidId: blocked ? hit.solid.id : null,
    });
  }
  const windowArea = (box.maxX - box.minX) * (box.maxZ - box.minZ);
  return {
    eyeHeight: ISOVIST_EYE_FEET,
    origin,
    samples,
    visibleArea: polygonArea(samples),
    windowArea,
    window: box,
    highlights: selectHighlights(samples, index.solids),
    estimatedSamples,
  };
}
