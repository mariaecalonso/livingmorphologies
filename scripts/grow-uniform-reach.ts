/**
 * Grow a Strategy network that must hit every field point.
 * Keep one north source; convert every other source to an attractor so flow reaches them.
 * Stitch any leftover orphans. Publish as the live massing network.
 */
import { readFile, writeFile } from "fs/promises";
import path from "path";
import context from "../data/skill5/herald-site.json";
import {
  NETWORK_STEP_BUDGET,
  SiteNetworkStudy,
  type NetworkIteration,
  type NetworkNode,
} from "../components/site/site-network";
import { FLOW_SPACING_FEET } from "../components/site/site-network-flow";
import { shoreLanding, GROWTH_WIDTH_DEFAULT } from "../components/site/site-water-growth";
import { buildArrivalArrangement } from "../lib/skill5/architectural-strategy";
import { readDesignerZoning } from "../lib/skill5/designer-zoning";
import { polygonCentroid } from "../lib/skill5/zoning";
import { serializeArchiveIteration, STRATEGY_ARCHIVE_ID } from "../lib/skill5/strategy-archive";
import type { SiteContext, XZ } from "../lib/skill5/site-model";

const ARCHIVE = path.join(process.cwd(), "data", "skill5", "herald-arrival-v1.json");
const SEEDS = [22010011, 22044881, 22088221, 22110331] as const;
const NEAR_FT = 14;
const ON_NETWORK_FT = 16;

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

function pointOnBranch(x: number, z: number, branch: { x0: number; z0: number; x1: number; z1: number }) {
  const dx = branch.x1 - branch.x0;
  const dz = branch.z1 - branch.z0;
  const length = dx * dx + dz * dz;
  const t = length < 1e-8 ? 0 : Math.max(0, Math.min(1, ((x - branch.x0) * dx + (z - branch.z0) * dz) / length));
  return Math.hypot(x - (branch.x0 + dx * t), z - (branch.z0 + dz * t));
}

function onNetwork(x: number, z: number, branches: readonly { x0: number; z0: number; x1: number; z1: number }[]) {
  return branches.some((branch) => pointOnBranch(x, z, branch) <= ON_NETWORK_FT);
}

function bayAttractor(site: SiteContext): NetworkNode | null {
  const [px, pz] = site.site.ring.reduce((sum, point) => [sum[0] + point[0], sum[1] + point[1]], [0, 0] as [number, number]);
  const origin = { x: px / site.site.ring.length, z: pz / site.site.ring.length };
  for (let index = 0; index < site.site.ring.length; index += 1) {
    const a = site.site.ring[index];
    const b = site.site.ring[(index + 1) % site.site.ring.length];
    const midX = (a[0] + b[0]) / 2;
    const midZ = (a[1] + b[1]) / 2;
    const dx = midX - origin.x;
    const dz = midZ - origin.z;
    const span = Math.hypot(dx, dz) || 1;
    for (const distance of [40, 70, 100]) {
      const x = midX + (dx / span) * distance;
      const z = midZ + (dz / span) * distance;
      if (!pointInWater(x, z, site.water.ring)) continue;
      const landing = shoreLanding(x, z, site.site.ring, site.water.ring);
      if (!landing) continue;
      return {
        id: "n-water-bay",
        kind: "attractor",
        x,
        z,
        surface: "water",
        water: { widthFt: GROWTH_WIDTH_DEFAULT, landX: landing.x, landZ: landing.z },
        architecture: { role: "central-gathering", provenance: { class: "proposed", unverified: false, evidenceId: null } },
        strategy: { note: "Bay attractor", waterfrontFeet: distance },
      };
    }
  }
  return null;
}

function roleForZone(kind: string | null | undefined): NetworkNode["architecture"] {
  const provenance = { class: "proposed" as const, unverified: false, evidenceId: null };
  if (kind === "workspace") return { role: "workspace", provenance };
  if (kind === "gathering") return { role: "central-gathering", provenance };
  return { role: "primary-lobby", provenance };
}

function buildNodes(site: SiteContext) {
  const arrangement = buildArrivalArrangement(site);
  if (!arrangement) throw new Error("City-side arrival arrangement could not be placed.");
  const zoning = readDesignerZoning().regions;
  const nodes: NetworkNode[] = arrangement.nodes.map((node, index) => ({
    ...node,
    id: node.id || `n-arr-${index}`,
    architecture: node.architecture
      ? { ...node.architecture, provenance: { ...node.architecture.provenance } }
      : undefined,
  }));

  let zoningAdded = 0;
  for (const region of zoning) {
    if (region.points.length < 3) continue;
    const center = polygonCentroid(region.points);
    if (nearAny(center.x, center.z, nodes, NEAR_FT)) continue;
    nodes.push({
      id: `n-zone-${region.id}`,
      kind: "attractor",
      x: center.x,
      z: center.z,
      architecture: roleForZone(region.kind),
      strategy: { note: `Zoning ${region.name || region.id}`, layoutId: arrangement.arrangementId },
    });
    zoningAdded += 1;
  }

  const water = bayAttractor(site);
  if (water && !nearAny(water.x, water.z, nodes, NEAR_FT)) nodes.push(water);

  // Keep a single northern-most source; every other point must be reached as an attractor.
  let keep: NetworkNode | null = null;
  for (const node of nodes) {
    if (node.kind !== "source") continue;
    if (!keep || node.x > keep.x) keep = node;
  }
  for (const node of nodes) {
    if (node.kind !== "source") continue;
    if (keep && node.id === keep.id) continue;
    node.kind = "attractor";
  }

  return { arrangement, zoning, nodes, zoningAdded, water: Boolean(water), keepSource: keep?.id ?? null };
}

function stitch(nodes: readonly NetworkNode[], branches: { x0: number; z0: number; x1: number; z1: number; conductivity: number }[]) {
  const next = branches.map((edge) => ({ ...edge, conductivity: 1 }));
  for (const node of nodes) {
    if (onNetwork(node.x, node.z, next)) continue;
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
  }
  return next;
}

async function grow(site: SiteContext, nodes: NetworkNode[], seed: number) {
  const study = new SiteNetworkStudy(site.site.ring, site.water.ring, {
    seed,
    nodes,
    persist: false,
    buildings: site.buildings,
    overWater: null,
  });
  const copy = nodes.map((node) => ({ ...node }));
  if (!study.canRun) throw new Error(study.status.note ?? "cannot run");
  study.resume();
  while (!study.settled && study.iteration < NETWORK_STEP_BUDGET) {
    study.step(8, false);
    if (study.iteration % 80 === 0) {
      process.stdout.write(`seed ${seed} step ${study.iteration} reached=${study.status.reached}/${study.status.total}\n`);
    }
  }
  study.finish();
  const branches = stitch(copy, study.flowAppearance());
  const missed = copy.filter((node) => !onNetwork(node.x, node.z, branches));
  const iteration: NetworkIteration = {
    id: `i${seed.toString(16)}-${study.iteration}`,
    index: 0,
    seed,
    nodes: copy,
    step: study.status.step,
    settled: study.status.settled,
    reached: study.status.reached,
    total: study.status.total,
    reachedIds: [...study.status.reachedIds],
    connectedIds: [...study.status.connectedIds],
    note: study.status.note,
    trails: study.snapshotTrails(),
    inkSize: study.inkSize,
    traversable: study.traversable,
    cellFeet: study.cellFeet,
    generator: study.generator,
    branches,
  };
  return { iteration, missed, branches };
}

async function main() {
  const site = context as SiteContext;
  const built = buildNodes(site);
  console.log(`nodes=${built.nodes.length} source=${built.keepSource} zoningAdded=${built.zoningAdded} water=${built.water}`);
  for (const node of built.nodes) console.log(`  ${node.kind} ${node.id}`);

  let chosen: Awaited<ReturnType<typeof grow>> | null = null;
  for (const seed of SEEDS) {
    const result = await grow(site, built.nodes, seed);
    console.log(`seed ${seed} attractors ${result.iteration.reached}/${result.iteration.total} missed=${result.missed.map((n) => n.id).join(",") || "none"} branches=${result.branches.length}`);
    if (result.missed.length === 0 && result.iteration.reached >= result.iteration.total) {
      chosen = result;
      break;
    }
  }
  if (!chosen) throw new Error("No seed put every field point on the network.");

  const raw = JSON.parse(await readFile(ARCHIVE, "utf8")) as {
    iterations?: unknown[];
  };
  const existing = Array.isArray(raw.iterations) ? raw.iterations : [];
  const startIndex = existing.reduce((max, item) => {
    const index = item && typeof item === "object" && typeof (item as { index?: unknown }).index === "number"
      ? (item as { index: number }).index
      : 0;
    return Math.max(max, index);
  }, 0);
  const stamp = Date.now().toString(36);
  const iteration = chosen.iteration;
  iteration.index = startIndex + 1;
  iteration.id = `batch-${stamp}-uniform-${iteration.seed}`;
  iteration.layoutId = built.arrangement.arrangementId;
  iteration.layoutTitle = `${built.arrangement.title} · uniform reach-all`;
  iteration.layoutFamily = "strategy";
  iteration.spacingFeet = FLOW_SPACING_FEET;
  iteration.architectureRecord = {
    strategyId: built.arrangement.strategyId,
    arrangementId: built.arrangement.arrangementId,
    relationships: built.arrangement.relationships,
    northLobby: built.arrangement.northLobby,
    parameters: built.arrangement.parameters,
  };
  iteration.note = `Uniform veins. Every field point on network. One source (${built.keepSource}); all others attractors.`;
  const record = serializeArchiveIteration(iteration);
  const priorIds = existing.flatMap((item) => (
    item && typeof item === "object" && typeof (item as { id?: unknown }).id === "string"
      ? [(item as { id: string }).id]
      : []
  ));
  const shortlist = [record.id, ...priorIds.filter((id) => id !== record.id)].slice(0, 3);
  await writeFile(ARCHIVE, `${JSON.stringify({
    strategyId: STRATEGY_ARCHIVE_ID,
    massingNetworkId: record.id,
    zoningShortlist: shortlist.length === 3 ? shortlist : [record.id, record.id, record.id],
    iterations: [...existing, record],
  }, null, 2)}\n`, "utf8");
  console.log(`wrote ${record.id} index=${iteration.index} branches=${chosen.branches.length} reached=${iteration.reached}/${iteration.total}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
