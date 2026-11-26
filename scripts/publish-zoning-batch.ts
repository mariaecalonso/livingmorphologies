/**
 * Grow zoning-terminal networks with different seeds and publish them all.
 * Sources / attractors stay on designer zoning; only the path morphology changes.
 *
 * Usage:
 *   npx tsx scripts/publish-zoning-batch.ts
 *   npx tsx scripts/publish-zoning-batch.ts --runs=10 --attractors=12 --sources=3
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
const BASE_SEED = 66340001;

function argNumber(name: string, fallback: number) {
  const match = process.argv.find((item) => item.startsWith(`--${name}=`));
  if (!match) return fallback;
  const value = Number(match.slice(name.length + 3));
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

const RUNS = argNumber("runs", 10);
const SOURCES = argNumber("sources", SOURCES_PER_REGION);
const ATTRACTORS = argNumber("attractors", ATTRACTORS_PER_REGION);

type Branch = { x0: number; z0: number; x1: number; z1: number; conductivity: number };

function cloneNodes(nodes: readonly NetworkNode[]): NetworkNode[] {
  return nodes.map((node) => ({
    ...node,
    architecture: node.architecture
      ? { ...node.architecture, provenance: { ...node.architecture.provenance } }
      : undefined,
    strategy: node.strategy ? { ...node.strategy } : undefined,
  }));
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

function snapToOpenLand(study: SiteNetworkStudy, nodes: NetworkNode[]) {
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
    node.x = best.x;
    node.z = best.z;
  }
}

function isStreetSource(node: NetworkNode) {
  return node.strategy?.origin === "measured-access" || Boolean(node.recordId?.startsWith("pedestrian:access:"));
}

function separateClosePairs(nodes: NetworkNode[]) {
  const min = ATTRACTORS >= 8 ? 12 : 24;
  for (let i = 0; i < nodes.length; i += 1) {
    for (let j = i + 1; j < nodes.length; j += 1) {
      const a = nodes[i];
      const b = nodes[j];
      const dist = Math.hypot(a.x - b.x, a.z - b.z);
      if (dist >= min) continue;
      // Never move Herald Plaza street accesses — move the other terminal away.
      const move = isStreetSource(a) ? b : isStreetSource(b) ? a : a.kind === "source" ? a : b.kind === "source" ? b : a;
      const keep = move === a ? b : a;
      if (isStreetSource(move)) continue;
      const span = dist < 1e-3 ? 1 : dist;
      const push = (min - dist) / 2 + 2;
      move.x += ((move.x - keep.x) / span) * push;
      move.z += ((move.z - keep.z) / span) * push;
    }
  }
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

function attachThroughTerminals(
  study: SiteNetworkStudy,
  nodes: readonly NetworkNode[],
  branches: Branch[],
) {
  const next = branches.map((edge) => ({ ...edge }));

  // Walk from Herald Plaza / NE 15th into the site so street sources visibly feed the network.
  for (const node of nodes) {
    if (!isStreetSource(node)) continue;
    let target: NetworkNode | null = null;
    let best = Infinity;
    for (const attractor of nodes) {
      if (attractor.kind !== "attractor") continue;
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
    const tipHit = closestOnBranches(tip.x, tip.z, next);
    if (tipHit && tipHit.dist > 0.75) steps.push({ x: tipHit.x, z: tipHit.z });
    for (let index = 0; index < steps.length - 1; index += 1) {
      const a = steps[index];
      const b = steps[index + 1];
      if (Math.hypot(a.x - b.x, a.z - b.z) < 1) continue;
      next.push({ x0: a.x, z0: a.z, x1: b.x, z1: b.z, conductivity: 1 });
    }
  }

  for (const node of nodes) {
    const hit = closestOnBranches(node.x, node.z, next);
    if (!hit || hit.dist <= 0.75) continue;
    next.push({ x0: node.x, z0: node.z, x1: hit.x, z1: hit.z, conductivity: 1 });
  }
  return next;
}

/** Seed-stable jitter so each run places terminals slightly differently inside the same zones. */
function jitterNodes(nodes: NetworkNode[], seed: number) {
  let state = seed >>> 0;
  const next = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
  // Dense attractor fields need smaller jitter so points stay inside their zones.
  const span = ATTRACTORS >= 8 ? 7 : 14;
  const base = ATTRACTORS >= 8 ? 2 : 4;
  for (const node of nodes) {
    if (isStreetSource(node)) continue;
    const angle = next() * Math.PI * 2;
    const radius = base + next() * span;
    node.x += Math.cos(angle) * radius;
    node.z += Math.sin(angle) * radius;
  }
}

function architectureRecord(seed: number) {
  return {
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
      seeds: [seed],
    },
  };
}

async function growOne(
  site: SiteContext,
  baseNodes: readonly NetworkNode[],
  seed: number,
  index: number,
  stamp: string,
) {
  const nodes = cloneNodes(baseNodes);
  jitterNodes(nodes, seed);
  const probe = new SiteNetworkStudy(site.site.ring, site.water.ring, {
    seed,
    nodes: [],
    persist: false,
    buildings: site.buildings,
    overWater: null,
  });
  snapToOpenLand(probe, nodes);
  separateClosePairs(nodes);
  snapToOpenLand(probe, nodes);

  const study = new SiteNetworkStudy(site.site.ring, site.water.ring, {
    seed,
    nodes,
    persist: false,
    buildings: site.buildings,
    overWater: null,
  });
  for (const node of nodes) {
    if (!study.onOpenLand(node.x, node.z)) throw new Error(`${node.id} off open land (seed ${seed})`);
  }
  if (!study.canRun) throw new Error(study.status.note ?? `cannot run seed ${seed}`);

  study.resume();
  while (!study.settled && study.iteration < NETWORK_STEP_BUDGET) study.step(8, false);
  study.finish();

  const flow = (study as unknown as { flow: Parameters<typeof measurePhysarumMetrics>[0] | null }).flow;
  if (!flow) throw new Error(`flow missing seed ${seed}`);
  const metrics = measurePhysarumMetrics(flow);
  let branches = attachThroughTerminals(study, nodes, study.flowAppearance().map((edge) => ({ ...edge })));
  const missed = nodes.filter((node) => nearestBranch(node.x, node.z, branches) > 1.5);
  if (missed.length) {
    throw new Error(`seed ${seed} off-network: ${missed.map((n) => n.id).join(",")}`);
  }
  const streetMiss = nodes.filter((node) => isStreetSource(node) && nearestBranch(node.x, node.z, branches) > 1.5);
  if (streetMiss.length) {
    throw new Error(`Herald Plaza street sources off-path: ${streetMiss.map((node) => node.id).join(",")}`);
  }

  return {
    id: `batch-${stamp}-zoning-r${String(index).padStart(2, "0")}-${seed}`,
    index,
    seed,
    nodes,
    step: study.status.step,
    settled: study.status.settled,
    reached: study.status.reached,
    total: study.status.total,
    reachedIds: [...study.status.reachedIds],
    connectedIds: [...study.status.connectedIds],
    note:
      `Herald Plaza street sources + zoning · ${SOURCES} src / ${ATTRACTORS} attr per region · run ${index} · seed ${seed}. `
      + `${metrics.terminalsConnected}/${metrics.terminalsTotal} · ${branches.length} branches · ${Math.round(metrics.totalNetworkLength)} ft.`,
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
    architectureRecord: architectureRecord(seed),
    metrics,
  };
}

async function main() {
  const site = context as SiteContext;
  const probe = new SiteNetworkStudy(site.site.ring, site.water.ring, {
    seed: BASE_SEED,
    nodes: [],
    persist: false,
    buildings: site.buildings,
    overWater: null,
  });
  const placement = terminalsFromDesignerZoning(site, {
    sourcesPerRegion: SOURCES,
    attractorsPerRegion: ATTRACTORS,
    openLand: (x, z) => probe.onOpenLand(x, z),
  });
  if (placement.nodes.length === 0) throw new Error("No zoning terminals");
  const street = placement.nodes.filter((node) => isStreetSource(node));
  if (street.length < 2) {
    throw new Error(`Herald Plaza street sources missing: found ${street.map((node) => node.id).join(",") || "none"}`);
  }
  console.log(
    `base terminals sources=${placement.sources} attractors=${placement.attractors} `
    + `(${SOURCES} / ${ATTRACTORS} per region) street=${street.length} runs=${RUNS}`,
  );
  for (const node of street) {
    console.log(`  street ${node.id} @ ${node.x.toFixed(1)},${node.z.toFixed(1)} · ${node.strategy?.note ?? ""}`);
  }
  if (placement.skipped.length) console.log(`skipped: ${placement.skipped.join("; ")}`);

  const raw = JSON.parse(await readFile(ARCHIVE, "utf8")) as {
    iterations: Array<Record<string, unknown> & { id: string; index: number }>;
  };
  let nextIndex = Math.max(...raw.iterations.map((item) => item.index), 0) + 1;
  const stamp = Date.now().toString(36);
  const published: Array<{ id: string; seed: number; branches: number; length: number; ok: boolean }> = [];
  const records = [];

  for (let run = 1; run <= RUNS; run += 1) {
    const seed = BASE_SEED + run * 7919 + ((run * 104729) % 9973);
    process.stdout.write(`run ${run}/${RUNS} seed=${seed}… `);
    const grown = await growOne(site, placement.nodes, seed, nextIndex, stamp);
    nextIndex += 1;
    const record = serializeArchiveIteration(grown);
    records.push(record);
    published.push({
      id: grown.id,
      seed,
      branches: grown.branches.length,
      length: Math.round(grown.metrics.totalNetworkLength),
      ok: grown.metrics.ok,
    });
    console.log(
      `${grown.metrics.ok ? "ok" : "partial"} `
      + `${grown.metrics.terminalsConnected}/${grown.metrics.terminalsTotal} `
      + `branches=${grown.branches.length} length=${Math.round(grown.metrics.totalNetworkLength)}ft`,
    );
  }

  // Prefer the densest fully-connected run as the live massing network; shortlist the top three.
  const ranked = [...published].sort((a, b) => Number(b.ok) - Number(a.ok) || b.branches - a.branches || b.length - a.length);
  const massingNetworkId = ranked[0].id;
  const shortlist = ranked.slice(0, 3).map((item) => item.id);
  while (shortlist.length < 3) shortlist.push(massingNetworkId);

  await writeFile(ARCHIVE, `${JSON.stringify({
    strategyId: STRATEGY_ARCHIVE_ID,
    massingNetworkId,
    zoningShortlist: shortlist,
    iterations: [...raw.iterations, ...records],
  }, null, 2)}\n`, "utf8");

  console.log(`published ${records.length} runs`);
  console.log(`massing ${massingNetworkId}`);
  console.log(`shortlist ${shortlist.join(", ")}`);
  for (const row of published) {
    console.log(`  ${row.id} seed=${row.seed} branches=${row.branches} length=${row.length} ok=${row.ok}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
