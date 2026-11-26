/**
 * Re-grow from current street+zoning terminals with extra southward reinforcement
 * from Herald Plaza / NE 15th, then publish as the live massing network.
 */
import { readFile, writeFile } from "fs/promises";
import path from "path";
import context from "../data/skill5/herald-site.json";
import { NETWORK_STEP_BUDGET, SiteNetworkStudy, type NetworkNode } from "../components/site/site-network";
import { FLOW_SPACING_FEET, measurePhysarumMetrics } from "../components/site/site-network-flow";
import {
  ARCHITECTURAL_STRATEGY_ID,
  ARRIVAL_ARRANGEMENT_ID,
  STRATEGY_RELATIONSHIPS,
} from "../lib/skill5/architectural-strategy";
import { serializeArchiveIteration, STRATEGY_ARCHIVE_ID } from "../lib/skill5/strategy-archive";
import {
  ATTRACTORS_PER_REGION,
  SOURCES_PER_REGION,
  ZONING_TERMINALS_LAYOUT_ID,
  ZONING_TERMINALS_LAYOUT_TITLE,
  terminalsFromDesignerZoning,
} from "../lib/skill5/zoning-network-terminals";
import type { SiteContext } from "../lib/skill5/site-model";

const ARCHIVE = path.join(process.cwd(), "data", "skill5", "herald-arrival-v1.json");
const SEED = 66390011;

type Branch = { x0: number; z0: number; x1: number; z1: number; conductivity: number };

function isStreetSource(node: NetworkNode) {
  return node.strategy?.origin === "measured-access" || Boolean(node.recordId?.startsWith("pedestrian:access:"));
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

function closestOnBranches(x: number, z: number, branches: readonly Branch[]) {
  let best: { x: number; z: number; dist: number } | null = null;
  for (const edge of branches) {
    const dx = edge.x1 - edge.x0;
    const dz = edge.z1 - edge.z0;
    const length = dx * dx + dz * dz;
    const t = length < 1e-8 ? 0 : Math.max(0, Math.min(1, ((x - edge.x0) * dx + (z - edge.z0) * dz) / length));
    const px = edge.x0 + dx * t;
    const pz = edge.z0 + dz * t;
    const dist = Math.hypot(x - px, z - pz);
    if (!best || dist < best.dist) best = { x: px, z: pz, dist };
  }
  return best;
}

/** Walk south from each street source onto open land and stitch a corridor into the network. */
function extendStreetCorridors(
  study: SiteNetworkStudy,
  nodes: readonly NetworkNode[],
  branches: Branch[],
) {
  const next = branches.map((edge) => ({ ...edge }));
  const added: string[] = [];
  for (const node of nodes) {
    if (!isStreetSource(node)) continue;
    const attractors = nodes.filter((item) => item.kind === "attractor");
    let target = attractors[0];
    let best = Infinity;
    for (const attractor of attractors) {
      const dist = Math.hypot(attractor.x - node.x, attractor.z - node.z);
      if (dist < best) {
        best = dist;
        target = attractor;
      }
    }
    if (!target) continue;

    const steps: { x: number; z: number }[] = [{ x: node.x, z: node.z }];
    const span = Math.hypot(target.x - node.x, target.z - node.z) || 1;
    const ux = (target.x - node.x) / span;
    const uz = (target.z - node.z) / span;
    for (let distance = 18; distance <= Math.min(span, 220); distance += 18) {
      let placed: { x: number; z: number } | null = null;
      for (const side of [0, 12, -12, 24, -24, 36, -36]) {
        const px = node.x + ux * distance - uz * side;
        const pz = node.z + uz * distance + ux * side;
        if (!study.onOpenLand(px, pz)) continue;
        placed = { x: px, z: pz };
        break;
      }
      if (!placed) continue;
      steps.push(placed);
    }

    const tip = steps[steps.length - 1];
    const hit = closestOnBranches(tip.x, tip.z, next);
    if (hit && hit.dist > 0.75) steps.push({ x: hit.x, z: hit.z });

    for (let index = 0; index < steps.length - 1; index += 1) {
      const a = steps[index];
      const b = steps[index + 1];
      if (Math.hypot(a.x - b.x, a.z - b.z) < 1) continue;
      next.push({ x0: a.x, z0: a.z, x1: b.x, z1: b.z, conductivity: 1 });
    }
    added.push(`${node.id}:${steps.length}pts`);
  }

  for (const node of nodes) {
    const hit = closestOnBranches(node.x, node.z, next);
    if (!hit || hit.dist <= 0.75) continue;
    next.push({ x0: node.x, z0: node.z, x1: hit.x, z1: hit.z, conductivity: 1 });
  }
  return { branches: next, added };
}

async function main() {
  const site = context as SiteContext;
  const probe = new SiteNetworkStudy(site.site.ring, site.water.ring, {
    seed: SEED,
    nodes: [],
    persist: false,
    buildings: site.buildings,
    overWater: null,
  });
  const placement = terminalsFromDesignerZoning(site, {
    sourcesPerRegion: SOURCES_PER_REGION,
    attractorsPerRegion: ATTRACTORS_PER_REGION,
    openLand: (x, z) => probe.onOpenLand(x, z),
  });
  const nodes = placement.nodes.map((node) => ({
    ...node,
    architecture: node.architecture
      ? { ...node.architecture, provenance: { ...node.architecture.provenance } }
      : undefined,
    strategy: node.strategy ? { ...node.strategy } : undefined,
  }));
  const street = nodes.filter((node) => isStreetSource(node));
  if (street.length < 2) throw new Error("street sources missing");
  for (const node of street) console.log(`street ${node.id} @ ${node.x.toFixed(1)},${node.z.toFixed(1)}`);

  const study = new SiteNetworkStudy(site.site.ring, site.water.ring, {
    seed: SEED,
    nodes,
    persist: false,
    buildings: site.buildings,
    overWater: null,
  });
  if (!study.canRun) throw new Error(study.status.note ?? "cannot run");
  study.resume();
  while (!study.settled && study.iteration < NETWORK_STEP_BUDGET) study.step(8, false);
  study.finish();

  const flow = (study as unknown as { flow: Parameters<typeof measurePhysarumMetrics>[0] | null }).flow;
  if (!flow) throw new Error("flow missing");
  const metrics = measurePhysarumMetrics(flow);
  console.log(`metrics ${metrics.terminalsConnected}/${metrics.terminalsTotal} ok=${metrics.ok}`);

  let branches = study.flowAppearance().map((edge) => ({ ...edge }));
  const extended = extendStreetCorridors(study, nodes, branches);
  branches = extended.branches;
  console.log(`corridors ${extended.added.join(", ")}`);

  for (const node of street) {
    const near = branches.filter((edge) => distToBranch(node.x, node.z, edge) < 30);
    const south = near.filter((edge) => Math.min(edge.z0, edge.z1) < node.z - 25);
    console.log(`${node.id} near=${near.length} south=${south.length} onPath=${nearestBranch(node.x, node.z, branches).toFixed(2)}`);
  }

  const missed = nodes.filter((node) => nearestBranch(node.x, node.z, branches) > 1.5);
  if (missed.length) throw new Error(`off-network ${missed.map((node) => node.id).join(",")}`);

  const raw = JSON.parse(await readFile(ARCHIVE, "utf8")) as {
    iterations: Array<Record<string, unknown> & { id: string; index: number }>;
  };
  const stamp = Date.now().toString(36);
  const index = Math.max(...raw.iterations.map((item) => item.index), 0) + 1;
  const iteration = {
    id: `batch-${stamp}-street-${SEED}`,
    index,
    seed: SEED,
    nodes,
    step: study.status.step,
    settled: study.status.settled,
    reached: study.status.reached,
    total: study.status.total,
    reachedIds: [...study.status.reachedIds],
    connectedIds: [...study.status.connectedIds],
    note:
      `Herald Plaza + NE 15th street sources with southward corridors into zoning attractors. `
      + `${metrics.terminalsConnected}/${metrics.terminalsTotal} · ${branches.length} branches.`,
    trails: study.snapshotTrails(),
    inkSize: study.inkSize,
    traversable: study.traversable,
    cellFeet: study.cellFeet,
    generator: "flow" as const,
    branches,
    layoutId: ZONING_TERMINALS_LAYOUT_ID,
    layoutTitle: ZONING_TERMINALS_LAYOUT_TITLE,
    layoutFamily: "strategy" as const,
    spacingFeet: FLOW_SPACING_FEET,
    architectureRecord: {
      strategyId: ARCHITECTURAL_STRATEGY_ID,
      arrangementId: ARRIVAL_ARRANGEMENT_ID,
      relationships: [...STRATEGY_RELATIONSHIPS],
      northLobby: "city-side-measured" as const,
      parameters: {
        experimentalLobby: "city-side-measured" as const,
        publicLobby: "central-west" as const,
        privateLobby: "southwest-end" as const,
        gathering: "distinct" as const,
        workspace: "spread" as const,
        recessionFt: 80,
        seeds: [SEED],
      },
    },
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
  console.log(`published ${record.id} branches=${branches.length} nodes=${nodes.length} index=${index}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
