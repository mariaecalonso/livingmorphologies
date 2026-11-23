import { assessNetworkDomain, rasterNetworkMask } from "@/components/site/site-network-domain";
import { FLOW_MAX_STEPS, FLOW_SURVIVE } from "@/components/site/site-network-flow";
import { createSiteNetworkStudy, reachFeet, type NetworkFrame, type NetworkIteration } from "@/components/site/site-network";
import { detectPockets, readPockets, type PocketReading } from "@/lib/skill5/pockets";
import type { SiteContext, XZ } from "@/lib/skill5/site-model";

export type NetworkRunStatus = "connected" | "disconnected" | "unconverged" | "failed";

export type AttractorReading = {
  id: string;
  connected: boolean;
  /** Nearest coastline distance, in feet. */
  waterfrontFeet: number | null;
  /** Nearest open sightline, in feet. */
  shoreFeet: number | null;
  openRays: number | null;
  /** Distance to the MacArthur centerline, in feet. */
  macarthurFeet: number | null;
  exposed: boolean | null;
  shaded: boolean | null;
};

export type NetworkEvaluation = {
  id: string;
  layoutId: string | null;
  layoutTitle: string | null;
  layoutFamily: NetworkIteration["layoutFamily"] | null;
  status: NetworkRunStatus;
  statusNote: string;
  sources: number;
  attractors: number;
  connectedAttractors: number;
  /** Open land cells within network reach of a surviving branch. */
  reachedCells: number;
  openCells: number;
  /** Share of open land inside the network reach. This is not site occupation. */
  reachShare: number;
  reachFeet: number;
  components: number;
  branchFeet: number;
  junctions: number;
  northFeet: number;
  southFeet: number;
  cityFeet: number;
  waterSideFeet: number;
  attractorReadings: AttractorReading[];
  sunMeasured: boolean;
  windFromDegrees: number | null;
  /** Enclosed faces of the surviving branches. Separate from reach and connection. */
  pockets: PocketEvaluation;
};

export type PocketEvaluation = {
  count: number;
  areaSqFt: number;
  north: number;
  central: number;
  south: number;
  /** Smallest gap from a face to the eastern parcel edge. Null when no face exists. */
  eastGapFt: number | null;
  readings: PocketReading[];
};

export type MetricSpread = { min: number; median: number; max: number };

export type LayoutEvaluation = {
  layoutId: string;
  title: string;
  family: NonNullable<NetworkIteration["layoutFamily"]> | "manual";
  runs: number;
  connectedRuns: number;
  failedRuns: number;
  disconnectedRuns: number;
  unconvergedRuns: number;
  reachShare: MetricSpread;
  /** Connected attractors divided by that run's attractor count. */
  connectedShare: MetricSpread;
  branchFeet: MetricSpread;
  junctions: MetricSpread;
  components: MetricSpread;
};

export type NetworkField = {
  frame: NetworkFrame;
  open: Uint8Array;
  inkSize: number;
  cellFeet: number;
  centerX: number;
  centerZ: number;
  parcel: readonly XZ[];
};

function ringCenter(ring: readonly XZ[]) {
  let x = 0;
  let z = 0;
  for (const point of ring) {
    x += point[0];
    z += point[1];
  }
  const count = Math.max(1, ring.length);
  return { x: x / count, z: z / count };
}

/** Open trail field for reach. Built once and reused across iterations. */
export function openNetworkField(site: SiteContext): NetworkField {
  const buildings = site.buildings.map((building) => ({ id: building.id, ring: building.ring, holes: building.holes }));
  const study = createSiteNetworkStudy(site.site.ring, site.water.ring, { persist: false, buildings, nodes: [] });
  const domain = assessNetworkDomain({ parcel: site.site.ring, water: site.water.ring, buildings });
  const mask = rasterNetworkMask(study.frame, domain, study.inkSize);
  const center = ringCenter(site.site.ring);
  return { frame: study.frame, open: mask.open, inkSize: study.inkSize, cellFeet: study.cellFeet, centerX: center.x, centerZ: center.z, parcel: site.site.ring };
}

function segmentDistance(px: number, pz: number, x0: number, z0: number, x1: number, z1: number) {
  const dx = x1 - x0;
  const dz = z1 - z0;
  const length = dx * dx + dz * dz;
  const t = length === 0 ? 0 : Math.max(0, Math.min(1, ((px - x0) * dx + (pz - z0) * dz) / length));
  return Math.hypot(px - (x0 + dx * t), pz - (z0 + dz * t));
}

function surviving(iteration: NetworkIteration) {
  return (iteration.branches ?? []).filter((edge) => edge.conductivity >= FLOW_SURVIVE);
}

function reachOf(iteration: NetworkIteration, field: NetworkField) {
  const branches = surviving(iteration);
  const reach = reachFeet(field.cellFeet);
  const size = field.inkSize;
  const marked = new Uint8Array(field.open.length);
  for (const edge of branches) {
    const minX = Math.min(edge.x0, edge.x1) - reach;
    const maxX = Math.max(edge.x0, edge.x1) + reach;
    const minZ = Math.min(edge.z0, edge.z1) - reach;
    const maxZ = Math.max(edge.z0, edge.z1) + reach;
    const x0 = Math.max(0, Math.floor(((minX - field.frame.minX) / field.frame.width) * size));
    const x1 = Math.min(size - 1, Math.ceil(((maxX - field.frame.minX) / field.frame.width) * size));
    const y0 = Math.max(0, Math.floor(((minZ - field.frame.minZ) / field.frame.depth) * size));
    const y1 = Math.min(size - 1, Math.ceil(((maxZ - field.frame.minZ) / field.frame.depth) * size));
    for (let y = y0; y <= y1; y += 1) {
      for (let x = x0; x <= x1; x += 1) {
        const index = y * size + x;
        if (field.open[index] !== 1 || marked[index]) continue;
        const east = field.frame.minX + ((x + 0.5) / size) * field.frame.width;
        const north = field.frame.minZ + ((y + 0.5) / size) * field.frame.depth;
        if (segmentDistance(east, north, edge.x0, edge.z0, edge.x1, edge.z1) <= reach) marked[index] = 1;
      }
    }
  }
  let openCells = 0;
  let reachedCells = 0;
  for (let index = 0; index < field.open.length; index += 1) {
    if (field.open[index] !== 1) continue;
    openCells += 1;
    if (marked[index]) reachedCells += 1;
  }
  return { openCells, reachedCells, reachFeet: reach, reachShare: openCells === 0 ? 0 : reachedCells / openCells };
}

function branchGraph(branches: NetworkIteration["branches"]) {
  const edges = surviving({ branches } as NetworkIteration);
  const key = (x: number, z: number) => `${Math.round(x * 2) / 2}:${Math.round(z * 2) / 2}`;
  const parent = new Map<string, string>();
  const find = (id: string): string => {
    const next = parent.get(id) ?? id;
    if (next === id) return id;
    const root = find(next);
    parent.set(id, root);
    return root;
  };
  const join = (a: string, b: string) => {
    const left = find(a);
    const right = find(b);
    if (left !== right) parent.set(right, left);
  };
  const degree = new Map<string, number>();
  let length = 0;
  for (const edge of edges) {
    const a = key(edge.x0, edge.z0);
    const b = key(edge.x1, edge.z1);
    parent.set(a, parent.get(a) ?? a);
    parent.set(b, parent.get(b) ?? b);
    join(a, b);
    degree.set(a, (degree.get(a) ?? 0) + 1);
    degree.set(b, (degree.get(b) ?? 0) + 1);
    length += Math.hypot(edge.x1 - edge.x0, edge.z1 - edge.z0);
  }
  return { parent, find, degree, length, edges };
}

function splitLength(edges: ReturnType<typeof surviving>, centerX: number, centerZ: number) {
  let northFeet = 0;
  let southFeet = 0;
  let cityFeet = 0;
  let waterSideFeet = 0;
  for (const edge of edges) {
    const length = Math.hypot(edge.x1 - edge.x0, edge.z1 - edge.z0);
    const midX = (edge.x0 + edge.x1) / 2;
    const midZ = (edge.z0 + edge.z1) / 2;
    if (midZ >= centerZ) northFeet += length;
    else southFeet += length;
    if (midX >= centerX) waterSideFeet += length;
    else cityFeet += length;
  }
  return { northFeet, southFeet, cityFeet, waterSideFeet };
}

function statusOf(iteration: NetworkIteration, attractors: number, connected: number, branches: number): { status: NetworkRunStatus; statusNote: string } {
  if (attractors === 0 || iteration.nodes.every((node) => node.kind !== "source") || (iteration.step === 0 && branches === 0)) {
    return { status: "failed", statusNote: iteration.note ?? "The run did not grow a network." };
  }
  if (connected === attractors && branches > 0) {
    return { status: "connected", statusNote: "Every attractor is on a surviving branch." };
  }
  if (iteration.step >= FLOW_MAX_STEPS) {
    return { status: "unconverged", statusNote: `${connected} of ${attractors} attractors connected at the step limit.` };
  }
  return { status: "disconnected", statusNote: `${connected} of ${attractors} attractors are on a surviving branch.` };
}

/** Measures one saved run. It does not start the solver or combine the readings. */
export function evaluateNetwork(iteration: NetworkIteration, field: NetworkField): NetworkEvaluation {
  const sources = iteration.nodes.filter((node) => node.kind === "source");
  const attractors = iteration.nodes.filter((node) => node.kind === "attractor");
  const connectedIds = new Set(iteration.connectedIds);
  const connectedAttractors = attractors.filter((node) => connectedIds.has(node.id)).length;
  const graph = branchGraph(iteration.branches);
  const roots = new Set([...graph.parent.keys()].map((id) => graph.find(id)));
  const reach = reachOf(iteration, field);
  const split = splitLength(graph.edges, field.centerX, field.centerZ);
  const status = statusOf(iteration, attractors.length, connectedAttractors, graph.edges.length);
  const faces = detectPockets(iteration.branches ?? [], field.parcel);
  const pocketReadings = readPockets(faces.pockets, field.parcel, iteration.nodes);
  const pockets: PocketEvaluation = {
    count: pocketReadings.length,
    areaSqFt: pocketReadings.reduce((sum, item) => sum + item.areaSqFt, 0),
    north: pocketReadings.filter((item) => item.band === "north").length,
    central: pocketReadings.filter((item) => item.band === "central").length,
    south: pocketReadings.filter((item) => item.band === "south").length,
    eastGapFt: pocketReadings.length === 0 ? null : Math.min(...pocketReadings.map((item) => item.eastGapFt)),
    readings: pocketReadings,
  };
  const readings: AttractorReading[] = attractors.map((node) => ({
    id: node.id,
    connected: connectedIds.has(node.id),
    waterfrontFeet: node.strategy?.waterfrontFeet ?? null,
    shoreFeet: node.strategy?.shoreFeet ?? null,
    openRays: node.strategy?.openRays ?? null,
    macarthurFeet: node.strategy?.macarthurFeet ?? null,
    exposed: node.strategy?.exposed ?? null,
    shaded: node.strategy?.shaded ?? null,
  }));
  return {
    id: iteration.id,
    layoutId: iteration.layoutId ?? null,
    layoutTitle: iteration.layoutTitle ?? null,
    layoutFamily: iteration.layoutFamily ?? null,
    status: status.status,
    statusNote: status.statusNote,
    sources: sources.length,
    attractors: attractors.length,
    connectedAttractors,
    reachedCells: reach.reachedCells,
    openCells: reach.openCells,
    reachShare: reach.reachShare,
    reachFeet: reach.reachFeet,
    components: graph.edges.length === 0 ? 0 : roots.size,
    branchFeet: graph.length,
    junctions: [...graph.degree.values()].filter((count) => count >= 3).length,
    ...split,
    attractorReadings: readings,
    sunMeasured: readings.some((item) => item.exposed !== null),
    windFromDegrees: iteration.windFromDegrees ?? null,
    pockets,
  };
}

export function metricSpread(values: readonly number[]): MetricSpread {
  if (values.length === 0) return { min: 0, median: 0, max: 0 };
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  return { min: sorted[0], median, max: sorted[sorted.length - 1] };
}

/** Min, median, and max across a layout's runs. The runs stay available on their own. */
export function evaluateLayouts(iterations: readonly NetworkIteration[], evaluations: readonly NetworkEvaluation[]): LayoutEvaluation[] {
  const groups = new Map<string, { iteration: NetworkIteration; evaluation: NetworkEvaluation }[]>();
  for (const evaluation of evaluations) {
    if (!evaluation.layoutId) continue;
    const iteration = iterations.find((item) => item.id === evaluation.id);
    if (!iteration) continue;
    const list = groups.get(evaluation.layoutId) ?? [];
    list.push({ iteration, evaluation });
    groups.set(evaluation.layoutId, list);
  }
  return [...groups.entries()].map(([layoutId, runs]) => {
    const first = runs[0].iteration;
    return {
      layoutId,
      title: first.layoutTitle ?? layoutId,
      family: first.layoutFamily ?? "manual",
      runs: runs.length,
      connectedRuns: runs.filter((item) => item.evaluation.status === "connected").length,
      failedRuns: runs.filter((item) => item.evaluation.status === "failed").length,
      disconnectedRuns: runs.filter((item) => item.evaluation.status === "disconnected").length,
      unconvergedRuns: runs.filter((item) => item.evaluation.status === "unconverged").length,
      reachShare: metricSpread(runs.map((item) => item.evaluation.reachShare)),
      connectedShare: metricSpread(runs.map((item) => item.evaluation.attractors === 0 ? 0 : item.evaluation.connectedAttractors / item.evaluation.attractors)),
      branchFeet: metricSpread(runs.map((item) => item.evaluation.branchFeet)),
      junctions: metricSpread(runs.map((item) => item.evaluation.junctions)),
      components: metricSpread(runs.map((item) => item.evaluation.components)),
    };
  });
}
