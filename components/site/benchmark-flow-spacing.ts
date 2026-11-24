import context from "@/data/skill5/herald-site.json";
import { mulberry32 } from "@/lib/physarum";
import { pointInRing } from "@/lib/skill5/placement";
import type { SiteContext, XZ } from "@/lib/skill5/site-model";
import { detectPockets } from "@/lib/skill5/pockets";
import { assessNetworkDomain, rasterNetworkMask } from "./site-network-domain";
import { createSiteNetworkStudy } from "./site-network";
import { FLOW_SURVIVE, createFlowGraph, createFlowState, adaptFlow, flowSettled } from "./site-network-flow";

const site = context as SiteContext;
const buildings = site.buildings.map((building) => ({ id: building.id, ring: building.ring, holes: building.holes }));
const study = createSiteNetworkStudy(site.site.ring, site.water.ring, { persist: false, buildings, nodes: [] });
const domain = assessNetworkDomain({ parcel: site.site.ring, water: site.water.ring, buildings });
const mask = rasterNetworkMask(study.frame, domain, study.inkSize);

function open(x: number, z: number) {
  if (!pointInRing(x, z, site.site.ring) || pointInRing(x, z, site.water.ring)) return false;
  return !domain.obstacles.some((obstacle) => pointInRing(x, z, obstacle.ring) && !obstacle.holes.some((hole) => pointInRing(x, z, hole)));
}

const found: { x: number; z: number }[] = [];
let minX = Infinity;
let maxX = -Infinity;
let minZ = Infinity;
let maxZ = -Infinity;
for (const [x, z] of site.site.ring) {
  minX = Math.min(minX, x);
  maxX = Math.max(maxX, x);
  minZ = Math.min(minZ, z);
  maxZ = Math.max(maxZ, z);
}
for (let z = minZ; z <= maxZ && found.length < 3; z += 20) {
  for (let x = minX; x <= maxX && found.length < 3; x += 20) {
    if (!open(x, z)) continue;
    if (found.some((point) => Math.hypot(point.x - x, point.z - z) < 120)) continue;
    found.push({ x, z });
  }
}
if (found.length < 3) throw new Error(`Need 3 open nodes, found ${found.length}`);
const terminals = [
  { id: "source", kind: "source" as const, x: found[0].x, z: found[0].z },
  { id: "attractor-a", kind: "attractor" as const, x: found[1].x, z: found[1].z },
  { id: "attractor-b", kind: "attractor" as const, x: found[2].x, z: found[2].z },
];
const seeds = [20261105, (20261105 + 104729) >>> 0, (20261105 + 209458) >>> 0];
const parcel = site.site.ring as XZ[];

const rows: unknown[] = [];
for (const spacing of [10, 15, 20]) {
  for (const seed of seeds) {
    const started = performance.now();
    const graph = createFlowGraph(terminals, spacing, study.cellFeet, study.frame, study.inkSize, mask.open, mulberry32(seed ^ 0xF10C));
    const state = createFlowState(graph);
    while (!flowSettled(state)) adaptFlow(state);
    const seconds = (performance.now() - started) / 1000;
    let length = 0;
    const branches = [];
    for (const edge of graph.edges) {
      if (edge.conductivity < FLOW_SURVIVE) continue;
      length += edge.length;
      branches.push({
        x0: graph.east[edge.a],
        z0: graph.north[edge.a],
        x1: graph.east[edge.b],
        z1: graph.north[edge.b],
        conductivity: edge.conductivity,
      });
    }
    const pockets = detectPockets(branches, parcel);
    rows.push({
      spacing,
      seed,
      seconds: Number(seconds.toFixed(2)),
      steps: state.step,
      settled: flowSettled(state),
      feeding: state.feeding,
      connected: state.connected.length,
      attractors: graph.attractorIds.length,
      surviving: state.surviving,
      branchFeet: Number(length.toFixed(1)),
      pockets: pockets.pockets.length,
      openSegments: pockets.openSegments,
      nodes: graph.east.length,
      edges: graph.edges.length,
    });
    console.log(JSON.stringify(rows[rows.length - 1]));
  }
}
console.log(JSON.stringify({ nodes: terminals, rows }, null, 2));
