/**
 * Grow until every attractor in the field is reached.
 * Streams live SVG frames to %TEMP%/strategy-grow-board so you can watch connectivity.
 */
import { mkdir, readFile, writeFile } from "fs/promises";
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
const BOARD = path.join(process.env.TEMP || process.env.TMP || ".", "strategy-grow-board");
const SEEDS = [21300101, 21344721, 21388203, 21411009, 21455677, 21500133] as const;
const NEAR_FT = 14;
const ON_NETWORK_FT = 18;

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
  for (const branch of branches) {
    if (pointOnBranch(x, z, branch) <= ON_NETWORK_FT) return true;
  }
  return false;
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
  if (zoning.length === 0) throw new Error("Designer zoning is empty.");

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
    const lobby = region.kind === "lobby";
    nodes.push({
      id: `n-zone-${region.id}`,
      kind: lobby ? "source" : "attractor",
      x: center.x,
      z: center.z,
      architecture: roleForZone(region.kind),
      strategy: { note: `Zoning ${region.name || region.id} · ${region.kind ?? "region"}`, layoutId: arrangement.arrangementId },
    });
    zoningAdded += 1;
  }

  const water = bayAttractor(site);
  if (water && !nearAny(water.x, water.z, nodes, NEAR_FT)) nodes.push(water);

  return { arrangement, zoning, nodes, zoningAdded, water: Boolean(water) };
}

function boundsOf(
  parcel: readonly XZ[],
  _water: readonly XZ[],
  nodes: readonly NetworkNode[],
  branches: readonly { x0: number; z0: number; x1: number; z1: number }[],
) {
  // Frame the parcel + network, not the full bay — water extent collapsed the veins to a smudge.
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  const push = (x: number, z: number) => {
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minZ = Math.min(minZ, z);
    maxZ = Math.max(maxZ, z);
  };
  for (const [x, z] of parcel) push(x, z);
  for (const node of nodes) push(node.x, node.z);
  for (const edge of branches) {
    push(edge.x0, edge.z0);
    push(edge.x1, edge.z1);
  }
  const pad = 28;
  return { minX: minX - pad, maxX: maxX + pad, minZ: minZ - pad, maxZ: maxZ + pad };
}

function svgFrame(opts: {
  step: number;
  seed: number;
  note: string;
  nodes: readonly NetworkNode[];
  branches: readonly { x0: number; z0: number; x1: number; z1: number; conductivity?: number }[];
  parcel: readonly XZ[];
  water: readonly XZ[];
  reachedIds: ReadonlySet<string>;
}) {
  const box = boundsOf(opts.parcel, opts.water, opts.nodes, opts.branches);
  const width = 1920;
  const height = 560;
  const spanX = Math.max(1, box.maxX - box.minX);
  const spanZ = Math.max(1, box.maxZ - box.minZ);
  const scale = Math.min(width / spanZ, height / spanX) * 0.9;
  const ox = (width - spanZ * scale) / 2;
  const oy = (height - spanX * scale) / 2;
  const map = (x: number, z: number) => ({
    x: ox + (z - box.minZ) * scale,
    y: oy + (x - box.minX) * scale,
  });
  const poly = (ring: readonly XZ[]) => ring.map(([x, z]) => {
    const p = map(x, z);
    return `${p.x.toFixed(1)},${p.y.toFixed(1)}`;
  }).join(" ");

  const lines = opts.branches.map((edge) => {
    const a = map(edge.x0, edge.z0);
    const b = map(edge.x1, edge.z1);
    const tone = Math.min(1, Math.max(0.55, edge.conductivity ?? 0.6));
    return `<line x1="${a.x.toFixed(1)}" y1="${a.y.toFixed(1)}" x2="${b.x.toFixed(1)}" y2="${b.y.toFixed(1)}" stroke="rgba(255,255,255,${(0.6 + tone * 0.35).toFixed(2)})" stroke-width="${(1.8 + tone * 2.4).toFixed(2)}" stroke-linecap="round"/>`;
  }).join("\n");

  const marks = opts.nodes.map((node) => {
    const p = map(node.x, node.z);
    const reached = node.kind === "source" || opts.reachedIds.has(node.id) || onNetwork(node.x, node.z, opts.branches);
    const fill = node.kind === "source"
      ? "#c77e5f"
      : node.surface === "water"
        ? "#e2c27a"
        : reached
          ? "#49d7de"
          : "#ff4d4d";
    const label = node.architecture?.role ?? node.kind;
    return `<g>
      <circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="${reached ? 7 : 9}" fill="${fill}" stroke="${reached ? "none" : "#fff"}" stroke-width="1.5"/>
      <text x="${(p.x + 10).toFixed(1)}" y="${(p.y - 8).toFixed(1)}" fill="${reached ? "#9a9a9a" : "#ff8a8a"}" font-size="10">${node.id} · ${label}${reached ? "" : " · MISS"}</text>
    </g>`;
  }).join("\n");

  const attractors = opts.nodes.filter((node) => node.kind === "attractor");
  const hit = attractors.filter((node) => opts.reachedIds.has(node.id) || onNetwork(node.x, node.z, opts.branches)).length;

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"/><title>Reach-all Strategy Growth</title>
<style>
  html,body{margin:0;background:#000;color:#c8c8c8;font:12px/1.4 ui-monospace,Consolas,monospace}
  .board{width:1920px;height:560px;margin:24px auto;border:1px solid #2a2a2a;position:relative;background:#000}
  .label{position:absolute;left:20px;top:14px;letter-spacing:.12em;text-transform:uppercase;font-size:11px;color:#49d7de}
  .meta{position:absolute;left:20px;bottom:14px;color:#888;max-width:1600px}
  .tag{color:#c77e5f}
  .ok{color:#49d7de}
  .bad{color:#ff4d4d}
</style></head>
<body>
  <div class="board">
    <div class="label">Zoning + arrival · every attractor must be reached · <span class="tag">live</span></div>
    <svg width="1920" height="560" viewBox="0 0 1920 560">
      <polygon points="${poly(opts.water)}" fill="rgba(226,194,122,0.07)" stroke="rgba(226,194,122,0.3)" stroke-width="1"/>
      <polygon points="${poly(opts.parcel)}" fill="none" stroke="rgba(73,215,222,0.4)" stroke-width="1.2"/>
      ${lines}
      ${marks}
    </svg>
    <div class="meta">${opts.note} · seed ${opts.seed} · step ${opts.step} · branches ${opts.branches.length} · attractors <span class="${hit === attractors.length ? "ok" : "bad"}">${hit}/${attractors.length}</span></div>
  </div>
  <script>setTimeout(()=>location.reload(),900)</script>
</body></html>`;
}

async function writeBoard(html: string) {
  await mkdir(BOARD, { recursive: true });
  await writeFile(path.join(BOARD, "index.html"), html, "utf8");
}

async function growUntilAllReached(site: SiteContext, nodes: NetworkNode[], seed: number) {
  const study = new SiteNetworkStudy(site.site.ring, site.water.ring, {
    seed,
    nodes,
    persist: false,
    buildings: site.buildings,
    overWater: null,
  });
  const copy = nodes.map((node) => ({ ...node }));
  if (!study.canRun) throw new Error(study.status.note ?? "Study cannot run.");
  study.resume();
  while (!study.settled && study.iteration < NETWORK_STEP_BUDGET) {
    study.step(8, false);
    if (study.iteration % 40 === 0) {
      const branches = study.flowAppearance();
      const reachedIds = new Set(study.status.reachedIds);
      await writeBoard(svgFrame({
        step: study.iteration,
        seed,
        note: "Growing — red = attractor not yet on the network",
        nodes: copy,
        branches,
        parcel: site.site.ring,
        water: site.water.ring,
        reachedIds,
      }));
      process.stdout.write(`seed ${seed} step ${study.iteration} branches=${branches.length} reached=${study.status.reached}/${study.status.total}\n`);
    }
  }
  study.finish();
  const branches = stitchNodesToBranches(copy, study.flowAppearance());
  const reachedIds = new Set(study.status.reachedIds);
  // Every field point — sources and attractors — must sit on the drawn network.
  const missed = copy.filter((node) => !onNetwork(node.x, node.z, branches));
  await writeBoard(svgFrame({
    step: study.iteration,
    seed,
    note: missed.length === 0 ? "All field points on the network" : `Missed ${missed.map((node) => node.id).join(", ")}`,
    nodes: copy,
    branches,
    parcel: site.site.ring,
    water: site.water.ring,
    reachedIds,
  }));

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
    branches: branches.map((edge) => ({ ...edge })),
  };
  return { iteration, missed, branches };
}

/** Guarantee every field point sits on a visible branch (sources and attractors). */
function stitchNodesToBranches(
  nodes: readonly NetworkNode[],
  branches: { x0: number; z0: number; x1: number; z1: number; conductivity: number }[],
) {
  const next = branches.map((edge) => ({ ...edge }));
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
    next.push({
      x0: node.x,
      z0: node.z,
      x1: best.x,
      z1: best.z,
      conductivity: 1.05,
    });
  }
  return next;
}

async function main() {
  const site = context as SiteContext;
  const built = buildNodes(site);
  console.log(`board=${path.join(BOARD, "index.html")}`);
  console.log(`nodes=${built.nodes.length} zoningAdded=${built.zoningAdded}/${built.zoning.length} water=${built.water}`);
  await writeBoard(svgFrame({
    step: 0,
    seed: SEEDS[0],
    note: `Seeded ${built.nodes.length} points from arrival + zoning — waiting to grow`,
    nodes: built.nodes,
    branches: [],
    parcel: site.site.ring,
    water: site.water.ring,
    reachedIds: new Set(),
  }));

  let chosen: Awaited<ReturnType<typeof growUntilAllReached>> | null = null;
  for (const seed of SEEDS) {
    console.log(`trying seed ${seed}`);
    const result = await growUntilAllReached(site, built.nodes, seed);
    if (result.missed.length === 0 && result.iteration.reached >= result.iteration.total) {
      chosen = result;
      console.log(`seed ${seed} FULL REACH attractors=${result.iteration.reached}/${result.iteration.total} field=all`);
      break;
    }
    console.log(`seed ${seed} incomplete missed=${result.missed.map((node) => node.id).join(",") || "none"} reached=${result.iteration.reached}/${result.iteration.total}`);
  }
  if (!chosen) throw new Error("No seed put every field point on the network. Open the board to inspect misses.");

  const raw = JSON.parse(await readFile(ARCHIVE, "utf8")) as {
    strategyId?: string;
    massingNetworkId?: string | null;
    zoningShortlist?: string[];
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
  iteration.id = `batch-${stamp}-reach-${iteration.seed}`;
  iteration.layoutId = built.arrangement.arrangementId;
  iteration.layoutTitle = `${built.arrangement.title} · zoning reach-all`;
  iteration.layoutFamily = "strategy";
  iteration.spacingFeet = FLOW_SPACING_FEET;
  iteration.architectureRecord = {
    strategyId: built.arrangement.strategyId,
    arrangementId: built.arrangement.arrangementId,
    relationships: built.arrangement.relationships,
    northLobby: built.arrangement.northLobby,
    parameters: built.arrangement.parameters,
  };
  iteration.note = `Every attractor reached. Arrival + ${built.zoningAdded} zoning points.`;
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

  await writeBoard(svgFrame({
    step: iteration.step,
    seed: iteration.seed,
    note: `DONE ${record.id} · ${iteration.reached}/${iteration.total} attractors · branches ${chosen.branches.length}`,
    nodes: built.nodes,
    branches: chosen.branches,
    parcel: site.site.ring,
    water: site.water.ring,
    reachedIds: new Set(iteration.reachedIds),
  }));
  console.log(`wrote ${record.id} index=${iteration.index} branches=${chosen.branches.length} reached=${iteration.reached}/${iteration.total}`);
  console.log(`board=${path.join(BOARD, "index.html")}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
