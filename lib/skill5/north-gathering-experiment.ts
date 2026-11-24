import { mkdirSync, writeFileSync } from "node:fs";
import sharp from "sharp";
import context from "@/data/skill5/herald-site.json";
import { runNetworkIteration } from "@/components/site/site-network";
import { FLOW_SPACING_FEET } from "@/components/site/site-network-flow";
import { detectPockets, type NetworkPocket } from "@/lib/skill5/pockets";
import type { SiteContext, XZ } from "@/lib/skill5/site-model";
import { evaluateNetwork, openNetworkField } from "@/lib/skill5/strategy-evaluation";
import { SKETCH_RECESSION_FT, STRATEGY_LAYOUT_DEFAULTS, buildNorthGatheringLayouts, buildSketchLayouts, buildStrategyLayouts } from "@/lib/skill5/strategy-layouts";

const site = context as SiteContext;
const exploratory = buildStrategyLayouts(site, STRATEGY_LAYOUT_DEFAULTS);
if (exploratory.length !== 6) throw new Error("Exploratory layouts changed.");
const original = buildSketchLayouts(site, { recessionFt: SKETCH_RECESSION_FT, seedsPerLayout: 3 });
if (original.length !== 2 || original.some((layout) => layout.id.startsWith("sketch-north-"))) throw new Error("The first sketch layouts changed.");
const layouts = buildNorthGatheringLayouts(site, { recessionFt: SKETCH_RECESSION_FT, seedsPerLayout: 4 });
if (layouts.length !== 4) throw new Error(`Expected four northern layouts, got ${layouts.length}.`);
const seeds = layouts[0].seeds;
if (layouts.some((layout) => layout.seeds.join() !== seeds.join())) throw new Error("The four layouts do not share seeds.");

const outDir = "C:/Users/User/AppData/Local/Temp/north-gathering";
mkdirSync(outDir, { recursive: true });
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

function bandOf(z: number) {
  if (z >= minZ + (2 * span) / 3) return "north" as const;
  if (z >= minZ + span / 3) return "central" as const;
  return "south" as const;
}

function pointSeg(px: number, pz: number, x0: number, z0: number, x1: number, z1: number) {
  const dx = x1 - x0;
  const dz = z1 - z0;
  const length = dx * dx + dz * dz;
  const t = length === 0 ? 0 : Math.max(0, Math.min(1, ((px - x0) * dx + (pz - z0) * dz) / length));
  return Math.hypot(px - (x0 + dx * t), pz - (z0 + dz * t));
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

function roleOf(note: string | undefined) {
  if (note?.startsWith("Gathering.")) return "gathering";
  if (note?.startsWith("Workspace.")) return "workspace";
  return "plain";
}

function svgFor(title: string, branches: { x0: number; z0: number; x1: number; z1: number }[], pockets: NetworkPocket[], nodes: { kind: string; x: number; z: number; strategy?: { note?: string } | null }[]) {
  const scale = 1.35;
  const pad = 36;
  const width = (maxX - minX) * scale + pad * 2;
  const height = (maxZ - minZ) * scale + pad * 2 + 28;
  const X = (x: number) => pad + (x - minX) * scale;
  const Y = (z: number) => pad + 28 + (maxZ - z) * scale;
  const ring = (points: readonly XZ[]) => points.map(([x, z]) => `${X(x).toFixed(1)},${Y(z).toFixed(1)}`).join(" ");
  const faces = pockets.map((pocket) => {
    const d = pocket.points.map((point, index) => `${index === 0 ? "M" : "L"}${X(point.x).toFixed(1)} ${Y(point.z).toFixed(1)}`).join(" ");
    return `<path d="${d} Z" fill="#c77e5f" fill-opacity="0.28" stroke="#c77e5f" stroke-width="1.2"/>`;
  }).join("");
  const lines = branches.map((edge) => `<line x1="${X(edge.x0).toFixed(1)}" y1="${Y(edge.z0).toFixed(1)}" x2="${X(edge.x1).toFixed(1)}" y2="${Y(edge.z1).toFixed(1)}" stroke="#f2f2ee" stroke-width="1.15"/>`).join("");
  const marks = nodes.map((node) => {
    const role = node.kind === "source" ? "source" : roleOf(node.strategy?.note);
    const fill = role === "source" ? "#c77e5f" : role === "gathering" ? "#e7a0c0" : role === "workspace" ? "#6d97e0" : "#49d7de";
    return role === "source"
      ? `<circle cx="${X(node.x).toFixed(1)}" cy="${Y(node.z).toFixed(1)}" r="5.5" fill="${fill}"/>`
      : `<rect x="${(X(node.x) - 5).toFixed(1)}" y="${(Y(node.z) - 5).toFixed(1)}" width="10" height="10" fill="${fill}"/>`;
  }).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width.toFixed(0)}" height="${height.toFixed(0)}" viewBox="0 0 ${width.toFixed(1)} ${height.toFixed(1)}"><rect width="100%" height="100%" fill="#000"/><text x="${pad}" y="22" fill="#f2f2ee" font-family="Arial, sans-serif" font-size="16">${title}</text><polygon points="${ring(site.site.ring)}" fill="none" stroke="rgba(242,242,238,0.45)" stroke-width="1.2"/><polyline points="${ring(shore)}" fill="none" stroke="#49d7de" stroke-width="1.3"/>${faces}${lines}${marks}</svg>`;
}

async function main() {
  const runs = [];
  for (const layout of layouts) {
    const gathering = layout.nodes.filter((node) => node.kind === "attractor" && node.strategy?.note?.startsWith("Gathering."));
    const workspace = layout.nodes.filter((node) => node.kind === "attractor" && node.strategy?.note?.startsWith("Workspace."));
    if (workspace.length !== 3) throw new Error(`${layout.id} does not keep three workspace attractors.`);
    if (layout.id.includes("distinct") && gathering.length !== 3) throw new Error(`${layout.id} does not add the northern gathering.`);
    if (layout.id.includes("continuous") && gathering.length !== 2) throw new Error(`${layout.id} changed the gathering count.`);
    for (const seed of layout.seeds) {
      const id = `sketch-${layout.id}-${seed}`;
      const iteration = await runNetworkIteration(site.site.ring, site.water.ring, layout.nodes.map((node) => ({ ...node })), seed, undefined, site.buildings);
      iteration.id = id;
      iteration.layoutId = layout.id;
      iteration.layoutTitle = layout.title;
      iteration.layoutFamily = "sketch";
      iteration.spacingFeet = FLOW_SPACING_FEET;
      const evaluation = evaluateNetwork(iteration, field);
      const report = detectPockets(iteration.branches ?? [], site.site.ring);
      const faces = report.pockets.map((pocket) => {
        let area = 0;
        for (let index = 0; index < pocket.points.length; index += 1) {
          const from = pocket.points[index];
          const to = pocket.points[(index + 1) % pocket.points.length];
          area += from.x * to.z - to.x * from.z;
        }
        area = Math.abs(area) / 2;
        const chord = chordWidth(pocket);
        const center = pocket.points.reduce((sum, point) => ({ x: sum.x + point.x, z: sum.z + point.z }), { x: 0, z: 0 });
        center.x /= pocket.points.length;
        center.z /= pocket.points.length;
        const kind = area >= 80000 || chord.medianFt >= 200 ? "parcel" : chord.medianFt < 20 ? "narrow" : "cluster";
        return { band: bandOf(center.z), areaSqFt: Math.round(area), chordMinFt: Math.round(chord.minFt), chordMedianFt: Math.round(chord.medianFt), kind, touchesParcel: pocket.touchesParcel };
      });
      const countKind = (kind: string) => faces.filter((face) => face.kind === kind);
      const sources = iteration.nodes.filter((node) => node.kind === "source").map((node) => {
        let nearest = Infinity;
        for (const edge of iteration.branches ?? []) nearest = Math.min(nearest, pointSeg(node.x, node.z, edge.x0, edge.z0, edge.x1, edge.z1));
        return { id: node.id, recordId: node.recordId ?? null, x: Math.round(node.x), z: Math.round(node.z), nearestBranchFt: Math.round(nearest), participating: nearest <= 24 };
      });
      const waterfront = gathering.find((node) => node.strategy?.note?.includes("waterfront")) ?? gathering[0];
      let waterfrontBranchFt = Infinity;
      for (const edge of iteration.branches ?? []) waterfrontBranchFt = Math.min(waterfrontBranchFt, pointSeg(waterfront.x, waterfront.z, edge.x0, edge.z0, edge.x1, edge.z1));
      const byBand = (list: typeof faces) => ({
        north: list.filter((face) => face.band === "north").length,
        central: list.filter((face) => face.band === "central").length,
        south: list.filter((face) => face.band === "south").length,
      });
      const run = {
        id,
        layoutId: layout.id,
        title: layout.title,
        seed,
        status: evaluation.status,
        step: iteration.step,
        settled: iteration.settled,
        connectedAttractors: evaluation.connectedAttractors,
        attractors: evaluation.attractors,
        sourcesParticipating: sources.filter((source) => source.participating).length,
        sources: sources.length,
        sourceDetail: sources,
        waterfrontBranchFt: Math.round(waterfrontBranchFt),
        pockets: {
          count: faces.length,
          areaSqFt: faces.reduce((sum, face) => sum + face.areaSqFt, 0),
          byBand: byBand(faces),
          cluster: { count: countKind("cluster").length, areaSqFt: countKind("cluster").reduce((sum, face) => sum + face.areaSqFt, 0), byBand: byBand(countKind("cluster")) },
          narrow: { count: countKind("narrow").length, areaSqFt: countKind("narrow").reduce((sum, face) => sum + face.areaSqFt, 0) },
          parcel: { count: countKind("parcel").length, areaSqFt: countKind("parcel").reduce((sum, face) => sum + face.areaSqFt, 0) },
          faces,
        },
      };
      runs.push(run);
      const png = `${outDir}/${id}.png`;
      await sharp(Buffer.from(svgFor(`${layout.title} · ${seed}`, iteration.branches ?? [], report.pockets, iteration.nodes))).png().toFile(png);
      console.log(`${layout.id} ${seed} ${run.status} step ${run.step} attractors ${run.connectedAttractors}/${run.attractors} sources ${run.sourcesParticipating}/${run.sources} pockets ${run.pockets.count} cluster ${run.pockets.cluster.count} narrow ${run.pockets.narrow.count} parcel ${run.pockets.parcel.count} N/C/S ${run.pockets.byBand.north}/${run.pockets.byBand.central}/${run.pockets.byBand.south}`);
    }
  }
  writeFileSync("data/skill5/north-gathering-v1.json", JSON.stringify({
    recessionFt: SKETCH_RECESSION_FT,
    spacingFeet: FLOW_SPACING_FEET,
    strength: 1,
    seeds,
    preserved: ["iteration 7", "18 exploratory runs", "sketch-with-northeast", "sketch-without-northeast"],
    nodes: layouts.map((layout) => ({
      id: layout.id,
      title: layout.title,
      notes: layout.notes,
      nodes: layout.nodes.map((node) => ({ kind: node.kind, x: node.x, z: node.z, note: node.strategy?.note ?? null, recordId: node.recordId ?? null })),
    })),
    runs,
  }, null, 2));
  console.log(`wrote ${runs.length} runs`);
}

void main();
