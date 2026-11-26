/**
 * Place sources (lobby) and attractors (gathering + workspace) from designer zoning,
 * grow the Physarum flow from sources to attractors, refine, and publish live.
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
  POINTS_PER_REGION,
  ZONING_TERMINALS_LAYOUT_ID,
  ZONING_TERMINALS_LAYOUT_TITLE,
  terminalsFromDesignerZoning,
} from "../lib/skill5/zoning-network-terminals";
import type { SiteContext } from "../lib/skill5/site-model";

const ARCHIVE = path.join(process.cwd(), "data", "skill5", "herald-arrival-v1.json");
const SEED = 22010011;
const ON_NETWORK_FT = 16;

type Branch = { x0: number; z0: number; x1: number; z1: number; conductivity: number };

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

function snapToOpenLand(study: SiteNetworkStudy, nodes: NetworkNode[]) {
  const moved: string[] = [];
  const step = Math.max(2, study.cellFeet);

  for (const node of nodes) {
    if (node.surface === "water") continue;
    if (study.onOpenLand(node.x, node.z)) continue;
    let best: { x: number; z: number; dist: number } | null = null;
    for (let radius = step; radius <= 240 && !best; radius += step) {
      for (let angle = 0; angle < 48; angle += 1) {
        const theta = (angle / 48) * Math.PI * 2;
        const x = node.x + Math.cos(theta) * radius;
        const z = node.z + Math.sin(theta) * radius;
        if (!study.onOpenLand(x, z)) continue;
        const dist = Math.hypot(x - node.x, z - node.z);
        if (!best || dist < best.dist) best = { x, z, dist };
      }
    }
    if (!best) {
      const frame = study.frame;
      for (let z = frame.minZ; z <= frame.minZ + frame.depth; z += FLOW_SPACING_FEET) {
        for (let x = frame.minX; x <= frame.minX + frame.width; x += FLOW_SPACING_FEET) {
          if (!study.onOpenLand(x, z)) continue;
          const dist = Math.hypot(x - node.x, z - node.z);
          if (!best || dist < best.dist) best = { x, z, dist };
        }
      }
    }
    if (!best) throw new Error(`No open land near ${node.id}`);
    console.log(`snap ${node.id} ${best.dist.toFixed(1)}ft → ${best.x.toFixed(1)},${best.z.toFixed(1)}`);
    node.x = best.x;
    node.z = best.z;
    if (node.strategy) {
      node.strategy = {
        ...node.strategy,
        note: `${node.strategy.note} · snapped onto open land (${best.dist.toFixed(0)} ft)`,
      };
    }
    moved.push(`${node.id}@${best.dist.toFixed(0)}ft`);
  }
  return moved;
}

function separateClosePairs(nodes: NetworkNode[]) {
  const min = 24;
  for (let i = 0; i < nodes.length; i += 1) {
    for (let j = i + 1; j < nodes.length; j += 1) {
      const a = nodes[i];
      const b = nodes[j];
      const dist = Math.hypot(a.x - b.x, a.z - b.z);
      if (dist >= min) continue;
      // Prefer moving the source so attractors stay on their zoning centroid.
      const move = a.kind === "source" ? a : b.kind === "source" ? b : a;
      const keep = move === a ? b : a;
      const span = dist < 1e-3 ? 1 : dist;
      const push = (min - dist) / 2 + 2;
      const dx = (move.x - keep.x) / span;
      const dz = (move.z - keep.z) / span;
      move.x += dx * push;
      move.z += dz * push;
      console.log(`separate ${move.id} from ${keep.id} (+${push.toFixed(1)}ft)`);
    }
  }
}

/** Closest point on any branch segment (not only endpoints). */
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

/**
 * Every source and attractor becomes a vertex on the drawn network.
 * A short stub from the terminal into the nearest vein makes the path
 * visibly reach the point — not merely pass nearby on the flow grid.
 */
function attachThroughTerminals(nodes: readonly NetworkNode[], branches: Branch[]) {
  const next = branches.map((edge) => ({ ...edge }));
  const added: string[] = [];
  for (const node of nodes) {
    const hit = closestOnBranches(node.x, node.z, next);
    if (!hit) continue;
    if (hit.dist <= 0.75) continue;
    next.push({ x0: node.x, z0: node.z, x1: hit.x, z1: hit.z, conductivity: 1 });
    added.push(`${node.id}@${hit.dist.toFixed(1)}ft`);
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
    openLand: (x, z) => probe.onOpenLand(x, z),
  });
  if (placement.nodes.length === 0) throw new Error(`No zoning terminals: ${placement.skipped.join("; ")}`);
  console.log(`zoning terminals sources=${placement.sources} attractors=${placement.attractors}`);
  for (const node of placement.nodes) {
    console.log(
      `  ${node.id.padEnd(8)} ${node.kind.padEnd(10)} ${node.architecture?.role?.padEnd(18) ?? ""} `
      + `@ ${node.x.toFixed(1)},${node.z.toFixed(1)} · ${node.strategy?.note ?? ""}`,
    );
  }
  if (placement.skipped.length) console.log(`skipped: ${placement.skipped.join("; ")}`);

  const nodes = placement.nodes.map((node) => ({
    ...node,
    architecture: node.architecture
      ? { ...node.architecture, provenance: { ...node.architecture.provenance } }
      : undefined,
    strategy: node.strategy ? { ...node.strategy } : undefined,
    measuredX: node.measuredX,
    measuredZ: node.measuredZ,
    recordId: node.recordId,
  }));

  const snapped = snapToOpenLand(probe, nodes);
  if (snapped.length) console.log(`snapped ${snapped.join(", ")}`);
  separateClosePairs(nodes);

  const study = new SiteNetworkStudy(site.site.ring, site.water.ring, {
    seed: SEED,
    nodes,
    persist: false,
    buildings: site.buildings,
    overWater: null,
  });
  for (const node of nodes) {
    if (!study.onOpenLand(node.x, node.z)) {
      throw new Error(`${node.id} is not on open land after snap`);
    }
  }
  if (!study.canRun) throw new Error(study.status.note ?? "cannot run");

  console.log("growing from sources toward attractors…");
  study.resume();
  while (!study.settled && study.iteration < NETWORK_STEP_BUDGET) study.step(8, false);
  study.finish();

  const flow = (study as unknown as { flow: Parameters<typeof measurePhysarumMetrics>[0] | null }).flow;
  if (!flow) throw new Error("flow missing");
  const metrics = measurePhysarumMetrics(flow);
  console.log(
    `metrics ${metrics.terminalsConnected}/${metrics.terminalsTotal} components=${metrics.components} `
    + `length=${Math.round(metrics.totalNetworkLength)} ok=${metrics.ok}`,
  );

  let branches = study.flowAppearance().map((edge) => ({ ...edge }));
  const attached = attachThroughTerminals(nodes, branches);
  branches = attached.branches;
  if (attached.added.length) console.log(`attached ${attached.added.join(", ")}`);

  const missed = nodes.filter((node) => nearestBranch(node.x, node.z, branches) > 1.5);
  if (missed.length) {
    throw new Error(`Off-network: ${missed.map((node) => `${node.id}@${nearestBranch(node.x, node.z, branches).toFixed(0)}ft`).join(", ")}`);
  }
  console.log(`all ${nodes.length} terminals sit on the drawn paths`);

  const raw = JSON.parse(await readFile(ARCHIVE, "utf8")) as {
    iterations: Array<Record<string, unknown> & { id: string; index: number }>;
  };
  const stamp = Date.now().toString(36);
  const index = Math.max(...raw.iterations.map((item) => item.index), 0) + 1;
  const iteration = {
    id: `batch-${stamp}-zoning-${SEED}`,
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
      `Designer zoning terminals ×${POINTS_PER_REGION}: ${placement.sources} lobby sources → ${placement.attractors} gathering/workspace attractors. `
      + `Physarum grow + refine. ${metrics.terminalsConnected}/${metrics.terminalsTotal} · ${branches.length} branches.`,
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
  console.log(`published ${record.id} index=${index} branches=${branches.length} nodes=${nodes.length}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
