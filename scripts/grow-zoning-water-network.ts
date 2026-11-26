/**
 * Grow one Strategy network from designer zoning + city-side arrival,
 * with the bay open so growth can reach into the water.
 * Writes live SVG frames for the visual board while it runs.
 */
import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import context from "../data/skill5/herald-site.json";
import { runNetworkIteration, type NetworkNode } from "../components/site/site-network";
import { FLOW_SPACING_FEET } from "../components/site/site-network-flow";
import { shoreLanding, GROWTH_WIDTH_DEFAULT } from "../components/site/site-water-growth";
import { buildArrivalArrangement } from "../lib/skill5/architectural-strategy";
import { readDesignerZoning } from "../lib/skill5/designer-zoning";
import { polygonCentroid } from "../lib/skill5/zoning";
import { serializeArchiveIteration, STRATEGY_ARCHIVE_ID } from "../lib/skill5/strategy-archive";
import type { SiteContext, XZ } from "../lib/skill5/site-model";

const ARCHIVE = path.join(process.cwd(), "data", "skill5", "herald-arrival-v1.json");
const BOARD = path.join(process.env.TEMP || process.env.TMP || ".", "strategy-grow-board");
const SEED = 20931417;

function roleForKind(kind: string | null | undefined): NetworkNode["architecture"] {
  if (kind === "workspace") return { role: "workspace", provenance: { class: "proposed", unverified: false, evidenceId: null } };
  if (kind === "gathering") return { role: "central-gathering", provenance: { class: "proposed", unverified: false, evidenceId: null } };
  return { role: "primary-lobby", provenance: { class: "proposed", unverified: false, evidenceId: null } };
}

function bayAttractor(site: SiteContext, serial: number): NetworkNode | null {
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
    for (const distance of [30, 50, 80, 120, 160]) {
      const x = midX + (dx / span) * distance;
      const z = midZ + (dz / span) * distance;
      if (!pointInWater(x, z, site.water.ring)) continue;
      const landing = shoreLanding(x, z, site.site.ring, site.water.ring);
      if (!landing) continue;
      return {
        id: `n-water-${serial}`,
        kind: "attractor",
        x,
        z,
        surface: "water",
        water: { widthFt: GROWTH_WIDTH_DEFAULT, landX: landing.x, landZ: landing.z },
        architecture: { role: "central-gathering", provenance: { class: "proposed", unverified: false, evidenceId: null } },
        strategy: { note: "Bay water attractor — growth reaches into the water", waterfrontFeet: distance, layoutId: "arrival-city-north-v1" },
      };
    }
  }
  return null;
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

function boundsOf(parcel: readonly XZ[], water: readonly XZ[], nodes: readonly NetworkNode[]) {
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const ring of [parcel, water]) {
    for (const [x, z] of ring) {
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minZ = Math.min(minZ, z);
      maxZ = Math.max(maxZ, z);
    }
  }
  for (const node of nodes) {
    minX = Math.min(minX, node.x);
    maxX = Math.max(maxX, node.x);
    minZ = Math.min(minZ, node.z);
    maxZ = Math.max(maxZ, node.z);
  }
  const pad = 40;
  return { minX: minX - pad, maxX: maxX + pad, minZ: minZ - pad, maxZ: maxZ + pad };
}

function svgFrame(opts: {
  step: number;
  branches: readonly { x0: number; z0: number; x1: number; z1: number; conductivity: number }[];
  nodes: readonly NetworkNode[];
  parcel: readonly XZ[];
  water: readonly XZ[];
  note: string;
}) {
  const box = boundsOf(opts.parcel, opts.water, opts.nodes);
  const width = 1920;
  const height = 560;
  const spanX = Math.max(1, box.maxX - box.minX);
  const spanZ = Math.max(1, box.maxZ - box.minZ);
  // West-up site plan: z → x screen, x → y screen
  const scale = Math.min(width / spanZ, height / spanX) * 0.92;
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
    const tone = Math.min(1, Math.max(0.35, edge.conductivity));
    return `<line x1="${a.x.toFixed(1)}" y1="${a.y.toFixed(1)}" x2="${b.x.toFixed(1)}" y2="${b.y.toFixed(1)}" stroke="rgba(255,255,255,${tone.toFixed(2)})" stroke-width="${(1.2 + tone * 2.4).toFixed(2)}" stroke-linecap="round"/>`;
  }).join("\n");
  const marks = opts.nodes.map((node) => {
    const p = map(node.x, node.z);
    const fill = node.kind === "source" ? "#c77e5f" : node.surface === "water" ? "#e2c27a" : "#49d7de";
    return `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="${node.surface === "water" ? 7 : 5}" fill="${fill}"/>`;
  }).join("\n");
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"/><title>Growing Strategy Network</title>
<style>
  html,body{margin:0;background:#000;color:#c8c8c8;font:12px/1.4 ui-monospace,Consolas,monospace}
  .board{width:1920px;height:560px;margin:24px auto;border:1px solid #2a2a2a;position:relative;background:#000}
  .label{position:absolute;left:20px;top:16px;letter-spacing:.12em;text-transform:uppercase;font-size:11px;color:#49d7de}
  .meta{position:absolute;left:20px;bottom:16px;color:#888}
  .tag{color:#c77e5f}
</style></head>
<body>
  <div class="board">
    <div class="label">Option A · Zoning + open bay growth · <span class="tag">live</span></div>
    <svg width="1920" height="560" viewBox="0 0 1920 560">
      <polygon points="${poly(opts.water)}" fill="rgba(226,194,122,0.08)" stroke="rgba(226,194,122,0.35)" stroke-width="1"/>
      <polygon points="${poly(opts.parcel)}" fill="none" stroke="rgba(73,215,222,0.45)" stroke-width="1.2"/>
      ${lines}
      ${marks}
    </svg>
    <div class="meta">${opts.note} · step ${opts.step} · branches ${opts.branches.length} · nodes ${opts.nodes.length}</div>
  </div>
  <script>setTimeout(()=>location.reload(),1200)</script>
</body></html>`;
}

async function writeBoard(html: string) {
  await mkdir(BOARD, { recursive: true });
  await writeFile(path.join(BOARD, "index.html"), html, "utf8");
}

async function main() {
  const site = context as SiteContext;
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

  let serial = nodes.length + 1;
  for (const region of zoning) {
    if (region.points.length < 3) continue;
    const center = polygonCentroid(region.points);
    const near = nodes.some((node) => Math.hypot(node.x - center.x, node.z - center.z) < 28);
    if (near) continue;
    nodes.push({
      id: `n-zone-${region.id}`,
      kind: "attractor",
      x: center.x,
      z: center.z,
      architecture: roleForKind(region.kind),
      strategy: { note: `Zoning ${region.name || region.id} · ${region.kind}`, layoutId: arrangement.arrangementId },
    });
    serial += 1;
  }

  const waterNode = bayAttractor(site, serial);
  if (waterNode) nodes.push(waterNode);

  await writeBoard(svgFrame({
    step: 0,
    branches: [],
    nodes,
    parcel: site.site.ring,
    water: site.water.ring,
    note: `Seeding ${nodes.length} nodes from arrival + ${zoning.length} zoning regions · bay open`,
  }));
  console.log(`board=${path.join(BOARD, "index.html")}`);
  console.log(`nodes=${nodes.length} zoning=${zoning.length} water=${waterNode ? "yes" : "no"}`);

  const iteration = await runNetworkIteration(
    site.site.ring,
    site.water.ring,
    nodes,
    SEED,
    async (step, study) => {
      if (!study) return;
      const branches = study.generator === "flow" ? study.flowAppearance() : [];
      await writeBoard(svgFrame({
        step,
        branches,
        nodes,
        parcel: site.site.ring,
        water: site.water.ring,
        note: study.settled ? "Settled" : "Growing into parcel + open bay",
      }));
      process.stdout.write(`step ${step} branches=${branches.length}\n`);
    },
    site.buildings,
    site.water.ring,
  );

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
  iteration.index = startIndex + 1;
  iteration.id = `batch-${stamp}-zoning-water-${SEED}`;
  iteration.layoutId = arrangement.arrangementId;
  iteration.layoutTitle = `${arrangement.title} · zoning + open bay`;
  iteration.layoutFamily = "strategy";
  iteration.spacingFeet = FLOW_SPACING_FEET;
  iteration.architectureRecord = {
    strategyId: arrangement.strategyId,
    arrangementId: arrangement.arrangementId,
    relationships: arrangement.relationships,
    northLobby: arrangement.northLobby,
    parameters: arrangement.parameters,
  };
  iteration.note = `Designer zoning (${zoning.length} regions) with bay open for water growth.`;
  const record = serializeArchiveIteration(iteration);
  const next = {
    strategyId: STRATEGY_ARCHIVE_ID,
    massingNetworkId: raw.massingNetworkId ?? record.id,
    zoningShortlist: raw.zoningShortlist ?? [],
    iterations: [...existing, record],
  };
  await writeFile(ARCHIVE, `${JSON.stringify(next, null, 2)}\n`, "utf8");
  await writeBoard(svgFrame({
    step: iteration.step,
    branches: iteration.branches ?? [],
    nodes,
    parcel: site.site.ring,
    water: site.water.ring,
    note: `Done · ${iteration.id} · branches ${iteration.branches?.length ?? 0} · reached ${iteration.reached}/${iteration.total}`,
  }));
  console.log(`wrote ${iteration.id} index=${iteration.index} branches=${iteration.branches?.length ?? 0}`);
  console.log(`board=${path.join(BOARD, "index.html")}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
