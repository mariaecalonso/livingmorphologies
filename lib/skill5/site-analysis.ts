import { designSiteFromParcel } from "./design-site";
import type { SiteContext, SiteRoad, XZ } from "./site-model";

/** Diagram marks for the website Site page. Geometry comes from the stored site record. */
export type AnalysisTone = "paper" | "teal" | "copper";

export type AnalysisMark = {
  id: string;
  label: string;
  tone: AnalysisTone;
  lines: XZ[][];
  labelAt: XZ;
};

export type SiteAnalysisDiagram = {
  access: AnalysisMark[];
  sunWind: AnalysisMark[];
  viewsNoise: AnalysisMark[];
  opportunities: AnalysisMark[];
};

type Edge = { a: XZ; b: XZ; mid: XZ };

const ACCESS_REACH_FEET = 180;
const ARROW_FEET = 120;
const HEAD_FEET = 26;

function hypot(a: XZ, b: XZ) {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

function edgesOf(ring: readonly XZ[]): Edge[] {
  return ring.map((a, index) => {
    const b = ring[(index + 1) % ring.length];
    return { a, b, mid: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] as XZ };
  });
}

function pointOnSegment(point: XZ, a: XZ, b: XZ): XZ {
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  const length = dx * dx + dz * dz;
  const t = length === 0 ? 0 : Math.max(0, Math.min(1, ((point[0] - a[0]) * dx + (point[1] - a[1]) * dz) / length));
  return [a[0] + dx * t, a[1] + dz * t];
}

function nearestOnRing(point: XZ, ring: readonly XZ[]) {
  let best = ring[0];
  let bestDistance = Infinity;
  for (let index = 0; index < ring.length; index += 1) {
    const hit = pointOnSegment(point, ring[index], ring[(index + 1) % ring.length]);
    const distance = hypot(point, hit);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = hit;
    }
  }
  return { point: best, feet: bestDistance };
}

function nearestOnPaths(point: XZ, paths: readonly (readonly XZ[])[]) {
  let best: XZ | null = null;
  let bestDistance = Infinity;
  for (const path of paths) {
    for (let index = 1; index < path.length; index += 1) {
      const hit = pointOnSegment(point, path[index - 1], path[index]);
      const distance = hypot(point, hit);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = hit;
      }
    }
  }
  return best ? { point: best, feet: bestDistance } : null;
}

function nearestEdge(point: XZ, edges: readonly Edge[]) {
  let best = edges[0];
  let bestDistance = Infinity;
  for (const edge of edges) {
    const distance = hypot(point, edge.mid);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = edge;
    }
  }
  return best;
}

function unit(from: XZ, to: XZ): XZ {
  const dx = to[0] - from[0];
  const dz = to[1] - from[1];
  const length = Math.hypot(dx, dz) || 1;
  return [dx / length, dz / length];
}

function add(point: XZ, direction: XZ, feet: number): XZ {
  return [point[0] + direction[0] * feet, point[1] + direction[1] * feet];
}

function arrow(from: XZ, to: XZ): XZ[][] {
  const [ux, uz] = unit(from, to);
  const base: XZ = [to[0] - ux * HEAD_FEET, to[1] - uz * HEAD_FEET];
  const px = -uz;
  const pz = ux;
  const wing = HEAD_FEET * 0.46;
  return [
    [from, to],
    [to, [base[0] + px * wing, base[1] + pz * wing]],
    [to, [base[0] - px * wing, base[1] - pz * wing]],
  ];
}

function outward(edge: Edge, center: XZ): XZ {
  const along = unit(edge.a, edge.b);
  const left: XZ = [-along[1], along[0]];
  const right: XZ = [along[1], -along[0]];
  const leftPoint = add(edge.mid, left, 1);
  return hypot(leftPoint, center) > hypot(add(edge.mid, right, 1), center) ? left : right;
}

function roadsNamed(roads: readonly SiteRoad[], pattern: RegExp) {
  return roads.filter((road) => pattern.test(road.name));
}

function pathsOf(roads: readonly SiteRoad[]) {
  return roads.map((road) => road.path);
}

/** Lines and arrows from the parcel rectangle, mapped streets, mapped shore, and geographic north. */
export function siteAnalysis(context: SiteContext): SiteAnalysisDiagram {
  const design = designSiteFromParcel(context.site.ring);
  const ring = design.ring;
  const edges = edgesOf(ring);
  const center = [(ring[0][0] + ring[2][0]) / 2, (ring[0][1] + ring[2][1]) / 2] as XZ;
  const locals = context.roads.filter((road) => road.kind === "local" && road.path.length > 1);
  const byName = new Map<string, SiteRoad[]>();
  for (const road of locals) {
    const list = byName.get(road.name) ?? [];
    list.push(road);
    byName.set(road.name, list);
  }

  const access: AnalysisMark[] = [];
  for (const [name, roads] of byName) {
    const hit = nearestOnPaths(center, pathsOf(roads));
    const edgeHit = hit ? nearestOnRing(hit.point, ring) : null;
    if (!hit || !edgeHit || edgeHit.feet > ACCESS_REACH_FEET) continue;
    const towardStreet = unit(edgeHit.point, hit.point);
    const start = add(edgeHit.point, towardStreet, Math.min(ARROW_FEET, Math.max(18, edgeHit.feet * 0.85)));
    access.push({
      id: `access-${name}`,
      label: name,
      tone: "paper",
      lines: arrow(start, edgeHit.point),
      labelAt: add(start, outward(nearestEdge(edgeHit.point, edges), center), 90),
    });
  }
  access.sort((a, b) => b.labelAt[1] - a.labelAt[1]);
  access.forEach((mark, index) => {
    const shift = (index - (access.length - 1) / 2) * 360;
    mark.labelAt = [mark.labelAt[0], mark.labelAt[1] + shift];
  });

  const northTip = add(center, [0, 1], 150);
  const sunWind: AnalysisMark[] = [{
    id: "north",
    label: "North",
    tone: "teal",
    lines: arrow(add(center, [0, 1], 16), northTip),
    labelAt: add(northTip, [0, 1], 48),
  }];

  const shore = context.coastline.path.length > 1 ? nearestOnPaths(center, [context.coastline.path]) : null;
  const viewsNoise: AnalysisMark[] = [];
  if (shore) {
    const edge = nearestOnRing(shore.point, ring);
    const away = unit(center, shore.point);
    const tip = add(edge.point, away, 90);
    viewsNoise.push({
      id: "shore",
      label: "Shore",
      tone: "paper",
      lines: arrow(edge.point, tip),
      labelAt: add(tip, away, 70),
    });
  }
  const roadway = context.roads.filter((road) => road.kind === "causeway" || road.kind === "expressway");
  const namedCauseway = roadsNamed(roadway, /macarthur/i);
  const noiseRoads = namedCauseway.length > 0 ? namedCauseway : roadway;
  const noiseHit = nearestOnPaths(center, pathsOf(noiseRoads));
  if (noiseHit) {
    const name = namedCauseway[0]?.name ?? noiseRoads[0]?.name ?? "Roadway";
    const edge = nearestOnRing(noiseHit.point, ring);
    const away = unit(center, noiseHit.point);
    const tip = add(edge.point, away, 90);
    viewsNoise.push({
      id: "roadway",
      label: name,
      tone: "copper",
      lines: arrow(edge.point, tip),
      labelAt: add(tip, away, 70),
    });
  }

  const opportunities: AnalysisMark[] = [];
  if (shore) {
    const edge = nearestEdge(shore.point, edges);
    const out = outward(edge, center);
    opportunities.push({
      id: "shore-edge",
      label: "Shore edge",
      tone: "paper",
      lines: [[edge.a, edge.b]],
      labelAt: add(edge.mid, out, 80),
    });
  }
  const streetHits = [...byName.entries()].flatMap(([name, roads]) => {
    const hit = nearestOnPaths(center, pathsOf(roads));
    return hit ? [{ name, feet: nearestOnRing(hit.point, ring).feet, point: hit.point }] : [];
  }).filter((item) => item.feet <= ACCESS_REACH_FEET);
  streetHits.sort((a, b) => a.feet - b.feet);
  const nearestStreet = streetHits[0];
  if (nearestStreet) {
    const edge = nearestEdge(nearestStreet.point, edges);
    const out = outward(edge, center);
    const sameAsShore = opportunities[0] && hypot(opportunities[0].labelAt, add(edge.mid, out, 24)) < 8;
    if (!sameAsShore) {
      opportunities.push({
        id: "street-edge",
        label: nearestStreet.name,
        tone: "paper",
        lines: [[edge.a, edge.b]],
        labelAt: add(edge.mid, out, 80),
      });
    }
  }

  return { access, sunWind, viewsNoise, opportunities };
}
