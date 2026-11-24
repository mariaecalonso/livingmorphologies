import { mkdirSync, writeFileSync } from "node:fs";
import sharp from "sharp";
import context from "@/data/skill5/herald-site.json";
import { runNetworkIteration, type NetworkIteration } from "@/components/site/site-network";
import { FLOW_SPACING_FEET } from "@/components/site/site-network-flow";
import { detectPockets, readPockets, type NetworkPocket } from "@/lib/skill5/pockets";
import type { SiteContext, XZ } from "@/lib/skill5/site-model";
import { evaluateNetwork, openNetworkField } from "@/lib/skill5/strategy-evaluation";
import { SKETCH_RECESSION_FT, STRATEGY_LAYOUT_DEFAULTS, buildSketchLayouts, buildStrategyLayouts } from "@/lib/skill5/strategy-layouts";

const site = context as SiteContext;
const outDir = "C:/Users/User/AppData/Local/Temp/sketch-comparison";
mkdirSync(outDir, { recursive: true });

const KNOWN = new Set([
  "sketch-sketch-with-northeast-20365850",
  "sketch-sketch-with-northeast-20470579",
  "sketch-sketch-with-northeast-20575308",
  "sketch-sketch-without-northeast-20470579",
  "sketch-sketch-without-northeast-20575308",
  "sketch-sketch-without-northeast-20680037",
]);

function distanceToPath(x: number, z: number, path: readonly XZ[]) {
  let best = Infinity;
  for (let index = 1; index < path.length; index += 1) {
    const [ax, az] = path[index - 1];
    const [bx, bz] = path[index];
    const dx = bx - ax;
    const dz = bz - az;
    const length = dx * dx + dz * dz;
    const t = length === 0 ? 0 : Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / length));
    best = Math.min(best, Math.hypot(x - (ax + dx * t), z - (az + dz * t)));
  }
  return best;
}

function pointSeg(px: number, pz: number, x0: number, z0: number, x1: number, z1: number) {
  const dx = x1 - x0;
  const dz = z1 - z0;
  const length = dx * dx + dz * dz;
  const t = length === 0 ? 0 : Math.max(0, Math.min(1, ((px - x0) * dx + (pz - z0) * dz) / length));
  return Math.hypot(px - (x0 + dx * t), pz - (z0 + dz * t));
}

function bandOf(z: number, minZ: number, span: number) {
  if (z >= minZ + (2 * span) / 3) return "north" as const;
  if (z >= minZ + span / 3) return "central" as const;
  return "south" as const;
}

function chordWidth(pocket: NetworkPocket) {
  const zs = pocket.points.map((point) => point.z);
  const low = Math.min(...zs);
  const high = Math.max(...zs);
  const widths: number[] = [];
  for (let step = 1; step <= 5; step += 1) {
    const z = low + ((high - low) * step) / 6;
    const hits: number[] = [];
    for (let index = 0; index < pocket.points.length; index += 1) {
      const from = pocket.points[index];
      const to = pocket.points[(index + 1) % pocket.points.length];
      const crosses = (from.z <= z && to.z > z) || (to.z <= z && from.z > z);
      if (!crosses || from.z === to.z) continue;
      hits.push(from.x + ((to.x - from.x) * (z - from.z)) / (to.z - from.z));
    }
    if (hits.length >= 2) widths.push(Math.max(...hits) - Math.min(...hits));
  }
  if (widths.length === 0) return { minFt: 0, medianFt: 0 };
  const sorted = [...widths].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return { minFt: sorted[0], medianFt: sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2 };
}

type Role = "gathering" | "workspace" | "plain";

function roleOf(note: string | undefined): Role {
  if (note?.startsWith("Gathering.")) return "gathering";
  if (note?.startsWith("Workspace.")) return "workspace";
  return "plain";
}

type Drawn = {
  id: string;
  title: string;
  seed: number | null;
  iteration: NetworkIteration;
  newRun: boolean;
};

function svgFor(drawn: Drawn, pockets: NetworkPocket[], shore: readonly XZ[], minX: number, maxX: number, minZ: number, maxZ: number) {
  const scale = 1.35;
  const pad = 36;
  const width = (maxX - minX) * scale + pad * 2;
  const height = (maxZ - minZ) * scale + pad * 2 + 28;
  const X = (x: number) => pad + (x - minX) * scale;
  const Y = (z: number) => pad + 28 + (maxZ - z) * scale;
  const ring = (points: readonly XZ[]) => points.map(([x, z]) => `${X(x).toFixed(1)},${Y(z).toFixed(1)}`).join(" ");
  const pocketPaths = pockets.map((pocket) => {
    const d = pocket.points.map((point, index) => `${index === 0 ? "M" : "L"}${X(point.x).toFixed(1)} ${Y(point.z).toFixed(1)}`).join(" ");
    return `<path d="${d} Z" fill="#c77e5f" fill-opacity="0.28" stroke="#c77e5f" stroke-width="1.2"/>`;
  }).join("");
  const branches = (drawn.iteration.branches ?? []).map((edge) => `<line x1="${X(edge.x0).toFixed(1)}" y1="${Y(edge.z0).toFixed(1)}" x2="${X(edge.x1).toFixed(1)}" y2="${Y(edge.z1).toFixed(1)}" stroke="#f2f2ee" stroke-width="1.15"/>`).join("");
  const nodes = drawn.iteration.nodes.map((node) => {
    const role = node.kind === "source" ? "source" : roleOf(node.strategy?.note);
    const fill = role === "source" ? "#c77e5f" : role === "gathering" ? "#e7a0c0" : role === "workspace" ? "#6d97e0" : "#49d7de";
    const mark = role === "source"
      ? `<circle cx="${X(node.x).toFixed(1)}" cy="${Y(node.z).toFixed(1)}" r="5.5" fill="${fill}"/>`
      : `<rect x="${(X(node.x) - 5).toFixed(1)}" y="${(Y(node.z) - 5).toFixed(1)}" width="10" height="10" fill="${fill}"/>`;
    return mark;
  }).join("");
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width.toFixed(0)}" height="${height.toFixed(0)}" viewBox="0 0 ${width.toFixed(1)} ${height.toFixed(1)}">
  <rect width="100%" height="100%" fill="#000"/>
  <text x="${pad}" y="22" fill="#f2f2ee" font-family="Arial, sans-serif" font-size="16">${drawn.title}</text>
  <polygon points="${ring(site.site.ring)}" fill="none" stroke="rgba(242,242,238,0.45)" stroke-width="1.2"/>
  <polyline points="${ring(shore)}" fill="none" stroke="#49d7de" stroke-width="1.3"/>
  ${pocketPaths}
  ${branches}
  ${nodes}
</svg>`;
}

async function main() {
  const exploratory = buildStrategyLayouts(site, STRATEGY_LAYOUT_DEFAULTS);
  if (exploratory.length !== 6) throw new Error("Exploratory layouts changed.");
  const referenceLayout = exploratory.find((layout) => layout.id === "measured-both-waterfront");
  if (!referenceLayout?.seeds.includes(20575292)) throw new Error("Iteration 7 seed is not on the both-contacts layout.");
  const sketch = buildSketchLayouts(site, { recessionFt: SKETCH_RECESSION_FT, seedsPerLayout: 3 });
  const withLayout = sketch.find((layout) => layout.id === "sketch-with-northeast");
  const withoutLayout = sketch.find((layout) => layout.id === "sketch-without-northeast");
  if (!withLayout || !withoutLayout) throw new Error("Sketch alternatives are missing.");
  const seeds = [...new Set([...withLayout.seeds, ...withoutLayout.seeds])].sort((a, b) => a - b);
  const jobs = [
    { layout: withLayout, seeds },
    { layout: withoutLayout, seeds },
  ];
  const field = openNetworkField(site);
  const shore = site.coastline.path;
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
  const span = Math.max(1, maxZ - minZ);
  const drawn: Drawn[] = [];

  const reference = await runNetworkIteration(site.site.ring, site.water.ring, referenceLayout.nodes.map((node) => ({ ...node })), 20575292, undefined, site.buildings);
  reference.id = "layout-measured-both-waterfront-20575292";
  reference.layoutId = referenceLayout.id;
  reference.layoutTitle = referenceLayout.title;
  reference.layoutFamily = referenceLayout.family;
  reference.spacingFeet = FLOW_SPACING_FEET;
  drawn.push({ id: reference.id, title: "Iteration 7 · both contacts, waterfront", seed: 20575292, iteration: reference, newRun: false });

  for (const job of jobs) {
    for (const seed of job.seeds) {
      const storedId = `sketch-${job.layout.id}-${seed}`;
      const id = KNOWN.has(storedId) ? storedId : `sketch-pair-${job.layout.id}-${seed}`;
      const iteration = await runNetworkIteration(site.site.ring, site.water.ring, job.layout.nodes.map((node) => ({ ...node })), seed, undefined, site.buildings);
      iteration.id = id;
      iteration.layoutId = job.layout.id;
      iteration.layoutTitle = job.layout.title;
      iteration.layoutFamily = "sketch";
      iteration.spacingFeet = FLOW_SPACING_FEET;
      const withNortheast = job.layout.id === "sketch-with-northeast";
      drawn.push({ id, title: `${withNortheast ? "With northeast" : "Without northeast"} · seed ${seed}`, seed, iteration, newRun: !KNOWN.has(storedId) });
    }
  }

  const runs = [];
  for (const item of drawn) {
    const evaluation = evaluateNetwork(item.iteration, field);
    const report = detectPockets(item.iteration.branches ?? [], site.site.ring);
    const readings = readPockets(report.pockets, site.site.ring, item.iteration.nodes);
    const attractors = item.iteration.nodes.filter((node) => node.kind === "attractor");
    const gathering = attractors.filter((node) => roleOf(node.strategy?.note) === "gathering");
    const workspace = attractors.filter((node) => roleOf(node.strategy?.note) === "workspace");
    const central = gathering[0] ?? null;
    const northeast = item.iteration.nodes.find((node) => node.recordId === "pedestrian:access:Potential Northeast Access") ?? null;
    const bands = { north: { branchFt: 0, shoreFt: Infinity, eastGapFt: Infinity, pocketEdgeFt: 0 }, central: { branchFt: 0, shoreFt: Infinity, eastGapFt: Infinity, pocketEdgeFt: 0 }, south: { branchFt: 0, shoreFt: Infinity, eastGapFt: Infinity, pocketEdgeFt: 0 } };
    let centralBranchFt = Infinity;
    let northeastBranchFt = northeast ? Infinity : null;
    let northShoreAwayFromSource = Infinity;
    for (const edge of item.iteration.branches ?? []) {
      const length = Math.hypot(edge.x1 - edge.x0, edge.z1 - edge.z0);
      const midZ = (edge.z0 + edge.z1) / 2;
      const band = bandOf(midZ, minZ, span);
      bands[band].branchFt += length;
      if (central) centralBranchFt = Math.min(centralBranchFt, pointSeg(central.x, central.z, edge.x0, edge.z0, edge.x1, edge.z1));
      if (northeast) northeastBranchFt = Math.min(northeastBranchFt ?? Infinity, pointSeg(northeast.x, northeast.z, edge.x0, edge.z0, edge.x1, edge.z1));
      const boundsPocket = report.pockets.some((pocket) => pocket.points.some((point, index) => {
        const next = pocket.points[(index + 1) % pocket.points.length];
        return pointSeg((edge.x0 + edge.x1) / 2, midZ, point.x, point.z, next.x, next.z) < 8;
      }));
      if (boundsPocket) bands[band].pocketEdgeFt += length;
      for (let step = 0; step <= 4; step += 1) {
        const t = step / 4;
        const x = edge.x0 + (edge.x1 - edge.x0) * t;
        const z = edge.z0 + (edge.z1 - edge.z0) * t;
        const sampleBand = bandOf(z, minZ, span);
        const shoreFt = distanceToPath(x, z, shore);
        bands[sampleBand].shoreFt = Math.min(bands[sampleBand].shoreFt, shoreFt);
        bands[sampleBand].eastGapFt = Math.min(bands[sampleBand].eastGapFt, Math.max(0, maxX - x));
        if (sampleBand === "north" && (!northeast || Math.hypot(x - northeast.x, z - northeast.z) > 40)) northShoreAwayFromSource = Math.min(northShoreAwayFromSource, shoreFt);
      }
    }
    const pockets = readings.map((reading) => {
      const pocket = report.pockets.find((face) => face.id === reading.id);
      const chord = pocket ? chordWidth(pocket) : { minFt: 0, medianFt: 0 };
      const center = pocket ? pocket.points.reduce((sum, point) => ({ x: sum.x + point.x, z: sum.z + point.z }), { x: 0, z: 0 }) : { x: 0, z: 0 };
      if (pocket) {
        center.x /= pocket.points.length;
        center.z /= pocket.points.length;
      }
      const nearest = (nodes: typeof gathering) => nodes.length === 0 ? null : Math.min(...nodes.map((node) => Math.hypot(node.x - center.x, node.z - center.z)));
      return {
        band: reading.band,
        areaSqFt: Math.round(reading.areaSqFt),
        boundingEastFt: Math.round(reading.spanEastFt),
        boundingNorthFt: Math.round(reading.spanNorthFt),
        chordMinFt: Math.round(chord.minFt),
        chordMedianFt: Math.round(chord.medianFt),
        eastGapFt: Math.round(reading.eastGapFt),
        gatheringFt: nearest(gathering) === null ? null : Math.round(nearest(gathering) ?? 0),
        workspaceFt: nearest(workspace) === null ? null : Math.round(nearest(workspace) ?? 0),
      };
    });
    const finite = (value: number) => Number.isFinite(value) ? Math.round(value) : null;
    runs.push({
      id: item.id,
      title: item.title,
      seed: item.seed,
      newRun: item.newRun,
      status: evaluation.status,
      step: item.iteration.step,
      settled: item.iteration.settled,
      connectedAttractors: evaluation.connectedAttractors,
      attractors: evaluation.attractors,
      reachShare: evaluation.reachShare,
      pockets: {
        count: pockets.length,
        areaSqFt: Math.round(pockets.reduce((sum, pocket) => sum + pocket.areaSqFt, 0)),
        byBand: {
          north: pockets.filter((pocket) => pocket.band === "north").length,
          central: pockets.filter((pocket) => pocket.band === "central").length,
          south: pockets.filter((pocket) => pocket.band === "south").length,
        },
        faces: pockets,
      },
      branches: {
        north: { lengthFt: Math.round(bands.north.branchFt), shoreFt: finite(bands.north.shoreFt), eastGapFt: finite(bands.north.eastGapFt), pocketEdgeFt: Math.round(bands.north.pocketEdgeFt) },
        central: { lengthFt: Math.round(bands.central.branchFt), shoreFt: finite(bands.central.shoreFt), eastGapFt: finite(bands.central.eastGapFt), pocketEdgeFt: Math.round(bands.central.pocketEdgeFt) },
        south: { lengthFt: Math.round(bands.south.branchFt), shoreFt: finite(bands.south.shoreFt), eastGapFt: finite(bands.south.eastGapFt), pocketEdgeFt: Math.round(bands.south.pocketEdgeFt) },
      },
      centralAttractor: central ? {
        x: central.x,
        z: central.z,
        shoreFt: central.strategy?.waterfrontFeet ?? null,
        nearestBranchFt: finite(centralBranchFt),
      } : null,
      northeastSource: northeast ? {
        x: northeast.x,
        z: northeast.z,
        shoreFt: northeast.strategy?.waterfrontFeet ?? null,
        nearestBranchFt: northeastBranchFt === null ? null : finite(northeastBranchFt),
        northBranchShoreFtExcludingSource: finite(northShoreAwayFromSource),
      } : null,
    });
    const svg = svgFor(item, report.pockets, shore, minX, maxX, minZ, maxZ);
    const file = `${outDir}/${item.id}.png`;
    await sharp(Buffer.from(svg)).png().toFile(file);
    console.log(`${item.title}: ${evaluation.status} step ${item.iteration.step}, pockets ${pockets.length}, central branch ${finite(centralBranchFt)} ft, north shore ${finite(bands.north.shoreFt)} ft`);
  }

  writeFileSync("data/skill5/sketch-comparison-v1.json", `${JSON.stringify({ id: "sketch-comparison-v1", recessionFt: SKETCH_RECESSION_FT, seeds, added: runs.filter((run) => run.newRun).map((run) => run.id), runs }, null, 2)}\n`);
  console.log(`Wrote ${runs.length} drawings to ${outDir}`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
