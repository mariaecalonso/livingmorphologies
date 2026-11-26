/**
 * Keep land terminals from the all-connected run; add waterfront gathering
 * attractors in the water; grow + Physarum refine; publish live.
 */
import { readFile, writeFile } from "fs/promises";
import path from "path";
import context from "../data/skill5/herald-site.json";
import { NETWORK_STEP_BUDGET, SiteNetworkStudy, type NetworkNode } from "../components/site/site-network";
import { FLOW_SPACING_FEET, measurePhysarumMetrics } from "../components/site/site-network-flow";
import { GROWTH_WIDTH_DEFAULT, shoreLanding } from "../components/site/site-water-growth";
import { serializeArchiveIteration, STRATEGY_ARCHIVE_ID } from "../lib/skill5/strategy-archive";
import type { SiteContext, XZ } from "../lib/skill5/site-model";

const ARCHIVE = path.join(process.cwd(), "data", "skill5", "herald-arrival-v1.json");
const SOURCE_ID = "batch-mwwuikdb-all-connected-22010011";
const SEED = 22010011;
const ON_NETWORK_FT = 16;

type Branch = { x0: number; z0: number; x1: number; z1: number; conductivity: number };

function cloneNodes(nodes: readonly NetworkNode[]): NetworkNode[] {
  return nodes.map((node) => ({
    ...node,
    architecture: node.architecture
      ? { ...node.architecture, provenance: { ...node.architecture.provenance } }
      : undefined,
    water: node.water ? { ...node.water } : undefined,
    strategy: node.strategy ? { ...node.strategy } : undefined,
  }));
}

function pointInWater(x: number, z: number, ring: readonly XZ[]) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, zi] = ring[i];
    const [xj, zj] = ring[j];
    const crosses = zi > z !== zj > z;
    if (crosses && x < ((xj - xi) * (z - zi)) / ((zj - zi) || 1e-9) + xi) inside = !inside;
  }
  return inside;
}

function nearAny(x: number, z: number, nodes: readonly NetworkNode[], feet: number) {
  return nodes.some((node) => Math.hypot(node.x - x, node.z - z) < feet);
}

function distToBranch(x: number, z: number, edge: Branch) {
  const dx = edge.x1 - edge.x0;
  const dz = edge.z1 - edge.z0;
  const length = dx * dx + dz * dz;
  const t = length < 1e-8 ? 0 : Math.max(0, Math.min(1, ((x - edge.x0) * dx + (z - edge.z0) * dz) / length));
  return Math.hypot(x - (edge.x0 + dx * t), z - (edge.z0 + dz * t));
}

function nearestBranch(x: number, z: number, branches: readonly Branch[]) {
  let best = Infinity;
  for (const edge of branches) best = Math.min(best, distToBranch(x, z, edge));
  return best;
}

function stitchOrphans(nodes: readonly NetworkNode[], branches: Branch[]) {
  const next = branches.map((edge) => ({ ...edge }));
  const added: string[] = [];
  for (const node of nodes) {
    if (nearestBranch(node.x, node.z, next) <= ON_NETWORK_FT) continue;
    let best: { x: number; z: number; dist: number } | null = null;
    for (const edge of next) {
      for (const point of [
        { x: edge.x0, z: edge.z0 },
        { x: edge.x1, z: edge.z1 },
      ]) {
        const dist = Math.hypot(node.x - point.x, node.z - point.z);
        if (!best || dist < best.dist) best = { ...point, dist };
      }
    }
    if (!best) continue;
    next.push({ x0: node.x, z0: node.z, x1: best.x, z1: best.z, conductivity: 1 });
    added.push(`${node.id}@${best.dist.toFixed(0)}ft`);
  }
  return { branches: next, added };
}

/**
 * Place several waterfront gathering attractors along the bay edge facing the parcel.
 * Northern / central / southern gathering places in the water.
 */
function waterfrontAttractors(site: SiteContext, existing: readonly NetworkNode[]): NetworkNode[] {
  const [px, pz] = site.site.ring.reduce((sum, point) => [sum[0] + point[0], sum[1] + point[1]], [0, 0] as [number, number]);
  const origin = { x: px / site.site.ring.length, z: pz / site.site.ring.length };
  type Candidate = { x: number; z: number; landX: number; landZ: number; shoreT: number; distance: number };
  const candidates: Candidate[] = [];

  for (let index = 0; index < site.site.ring.length; index += 1) {
    const a = site.site.ring[index];
    const b = site.site.ring[(index + 1) % site.site.ring.length];
    const midX = (a[0] + b[0]) / 2;
    const midZ = (a[1] + b[1]) / 2;
    const dx = midX - origin.x;
    const dz = midZ - origin.z;
    const span = Math.hypot(dx, dz) || 1;
    // Prefer edges that face the bay (midpoint moves away from parcel center into water).
    for (const distance of [45, 70, 95]) {
      const x = midX + (dx / span) * distance;
      const z = midZ + (dz / span) * distance;
      if (!pointInWater(x, z, site.water.ring)) continue;
      const landing = shoreLanding(x, z, site.site.ring, site.water.ring);
      if (!landing) continue;
      // Parametrize along coast by angle from parcel center for north/mid/south picks.
      const shoreT = Math.atan2(midZ - origin.z, midX - origin.x);
      candidates.push({ x, z, landX: landing.x, landZ: landing.z, shoreT, distance });
    }
  }
  if (candidates.length === 0) throw new Error("No waterfront water landings found.");

  candidates.sort((left, right) => left.shoreT - right.shoreT);
  const picks: { id: string; role: NetworkNode["architecture"] extends infer A ? A extends { role: infer R } ? R : never : never; note: string; at: number }[] = [
    { id: "n-water-north", role: "north-gathering", note: "Northern waterfront gathering in the bay", at: 0.18 },
    { id: "n-water-central", role: "central-gathering", note: "Central waterfront gathering in the bay", at: 0.5 },
    { id: "n-water-south", role: "private-gathering", note: "Southern waterfront gathering in the bay", at: 0.82 },
  ];

  const added: NetworkNode[] = [];
  const provenance = { class: "proposed" as const, unverified: false, evidenceId: null };
  for (const pick of picks) {
    const index = Math.min(candidates.length - 1, Math.max(0, Math.round(pick.at * (candidates.length - 1))));
    // Search nearby candidates for one that is not too close to an existing node.
    let chosen: Candidate | null = null;
    for (let offset = 0; offset < candidates.length; offset += 1) {
      const tryIndex = (index + offset) % candidates.length;
      const candidate = candidates[tryIndex];
      if (nearAny(candidate.x, candidate.z, [...existing, ...added], 36)) continue;
      chosen = candidate;
      break;
    }
    if (!chosen) continue;
    added.push({
      id: pick.id,
      kind: "attractor",
      x: chosen.x,
      z: chosen.z,
      surface: "water",
      water: { widthFt: GROWTH_WIDTH_DEFAULT, landX: chosen.landX, landZ: chosen.landZ },
      architecture: { role: pick.role, provenance },
      strategy: { note: pick.note, waterfrontFeet: chosen.distance },
    });
  }
  return added;
}

async function main() {
  const site = context as SiteContext;
  const raw = JSON.parse(await readFile(ARCHIVE, "utf8")) as {
    iterations: Array<Record<string, unknown> & { id: string; seed: number; index: number; nodes: NetworkNode[] }>;
  };
  const source = raw.iterations.find((item) => item.id === SOURCE_ID)
    ?? raw.iterations.find((item) => item.id === raw.iterations.at(-1)?.id);
  if (!source) throw new Error("Source iteration missing.");

  // Keep land terminals exactly; drop prior single bay attractor so the new waterfront set replaces it.
  const land = cloneNodes(source.nodes).filter((node) => node.surface !== "water");
  const water = waterfrontAttractors(site, land);
  if (water.length === 0) throw new Error("No waterfront attractors could be placed.");
  const nodes = [...land, ...water];
  console.log(`land=${land.length} water=${water.length}`);
  for (const node of water) {
    console.log(`  water ${node.id} ${node.architecture?.role} @ ${node.x.toFixed(1)},${node.z.toFixed(1)}`);
  }

  const study = new SiteNetworkStudy(site.site.ring, site.water.ring, {
    seed: SEED,
    nodes,
    persist: false,
    buildings: site.buildings,
    overWater: null,
  });
  // Confirm water attractors open their growth zones.
  for (const node of water) {
    if (!study.insideField(node.x, node.z)) {
      throw new Error(`${node.id} water attractor is not inside an open growth zone`);
    }
  }
  if (!study.canRun) throw new Error(study.status.note ?? "cannot run");
  study.resume();
  while (!study.settled && study.iteration < NETWORK_STEP_BUDGET) study.step(8, false);
  study.finish();

  const flow = (study as unknown as { flow: Parameters<typeof measurePhysarumMetrics>[0] | null }).flow;
  if (!flow) throw new Error("flow missing");
  const metrics = measurePhysarumMetrics(flow);
  console.log(`metrics ${metrics.terminalsConnected}/${metrics.terminalsTotal} components=${metrics.components} length=${Math.round(metrics.totalNetworkLength)} ok=${metrics.ok}`);

  let branches = study.flowAppearance().map((edge) => ({ ...edge }));
  const stitch = stitchOrphans(nodes, branches);
  branches = stitch.branches;
  if (stitch.added.length) console.log(`stitched ${stitch.added.join(", ")}`);

  const missed = nodes.filter((node) => nearestBranch(node.x, node.z, branches) > ON_NETWORK_FT);
  if (missed.length) {
    throw new Error(`Off-network: ${missed.map((node) => `${node.id}@${nearestBranch(node.x, node.z, branches).toFixed(0)}ft`).join(", ")}`);
  }

  const stamp = Date.now().toString(36);
  const index = Math.max(...raw.iterations.map((item) => item.index), 0) + 1;
  const iteration = {
    id: `batch-${stamp}-waterfront-${SEED}`,
    index,
    seed: SEED,
    nodes,
    step: study.status.step,
    settled: study.status.settled,
    reached: study.status.reached,
    total: study.status.total,
    reachedIds: [...study.status.reachedIds],
    connectedIds: [...study.status.connectedIds],
    note: `Land terminals unchanged. Added ${water.length} waterfront water gatherings. Physarum refine. ${metrics.terminalsConnected}/${metrics.terminalsTotal} · ${branches.length} branches.`,
    trails: study.snapshotTrails(),
    inkSize: study.inkSize,
    traversable: study.traversable,
    cellFeet: study.cellFeet,
    generator: "flow" as const,
    branches,
    layoutId: typeof source.layoutId === "string" ? source.layoutId : undefined,
    layoutTitle: "City-side experimental lobby · waterfront gatherings",
    layoutFamily: "strategy" as const,
    spacingFeet: FLOW_SPACING_FEET,
    architectureRecord: source.architectureRecord,
  };

  const record = serializeArchiveIteration(iteration);
  const priorIds = raw.iterations.flatMap((item) => (typeof item.id === "string" ? [item.id] : []));
  const shortlist = [record.id, ...priorIds.filter((id) => id !== record.id)].slice(0, 3);
  await writeFile(ARCHIVE, `${JSON.stringify({
    strategyId: STRATEGY_ARCHIVE_ID,
    massingNetworkId: record.id,
    zoningShortlist: shortlist.length === 3 ? shortlist : [record.id, record.id, record.id],
    iterations: [...raw.iterations, record],
  }, null, 2)}\n`, "utf8");
  console.log(`published ${record.id} index=${index} branches=${branches.length} nodes=${nodes.length}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
