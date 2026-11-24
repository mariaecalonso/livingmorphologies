import fs from "node:fs";
import context from "@/data/skill5/herald-site.json";
import { anchorBasins, circulationPartition, type RegionExperiment, type SpatialRegion } from "@/lib/skill5/region-experiments";
import type { NetworkBranch } from "@/lib/skill5/pockets";
import type { SiteContext, XZ } from "@/lib/skill5/site-model";

type Row = {
  index: number;
  id: string;
  seed: number;
  title: string;
  nodes: { id: string; kind: string; x: number; z: number }[];
  branches: [number, number, number, number, number][];
};

const site = context as SiteContext;
const raw = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const rows = (raw.result?.value ?? raw) as Row[];
const parcel = site.site.ring;
let minX = Infinity;
let maxX = -Infinity;
let minZ = Infinity;
let maxZ = -Infinity;
for (const [x, z] of parcel) {
  minX = Math.min(minX, x);
  maxX = Math.max(maxX, x);
  minZ = Math.min(minZ, z);
  maxZ = Math.max(maxZ, z);
}
const buildings = site.buildings
  .map((building) => building.ring)
  .filter((ring) => ring.some(([x, z]) => x > minX - 250 && x < maxX + 250 && z > minZ - 250 && z < maxZ + 250));

function load(row: Row) {
  const branches: NetworkBranch[] = row.branches.map(([x0, z0, x1, z1, conductivity]) => ({ x0, z0, x1, z1, conductivity }));
  const nodes = row.nodes
    .filter((node) => node.kind === "source" || node.kind === "attractor")
    .map((node) => ({ id: node.id, kind: node.kind as "source" | "attractor", x: node.x, z: node.z }));
  return { branches, nodes };
}

function summarize(experiment: RegionExperiment) {
  const notable = (region: SpatialRegion) => region.areaSqFt >= 2000;
  const east = { north: Infinity, central: Infinity, south: Infinity };
  for (let index = 0; index < experiment.paint.cells.length; index += 1) {
    const id = experiment.paint.cells[index];
    if (id === 0) continue;
    const region = experiment.regions[id - 1];
    if (!region || region.kind === "narrow") continue;
    const col = index % experiment.paint.cols;
    const row = Math.floor(index / experiment.paint.cols);
    const x = experiment.paint.originX + (col + 0.5) * experiment.paint.cell;
    const z = experiment.paint.originZ + (row + 0.5) * experiment.paint.cell;
    const span = maxZ - minZ;
    const band = z >= minZ + (2 * span) / 3 ? "north" : z >= minZ + span / 3 ? "central" : "south";
    east[band] = Math.min(east[band], maxX - x);
  }
  return {
    cuts: experiment.cuts,
    guides: experiment.guides,
    enclosed: experiment.regions.filter((region) => region.kind === "enclosed").length,
    open: experiment.regions.filter((region) => region.kind === "open").length,
    narrow: experiment.regions.filter((region) => region.kind === "narrow").length,
    enclosedSqFt: experiment.regions.filter((region) => region.kind === "enclosed").reduce((sum, region) => sum + region.areaSqFt, 0),
    openSqFt: experiment.regions.filter((region) => region.kind === "open").reduce((sum, region) => sum + region.areaSqFt, 0),
    eastGapOfClaimedLand: {
      north: Number.isFinite(east.north) ? Math.round(east.north) : null,
      central: Number.isFinite(east.central) ? Math.round(east.central) : null,
      south: Number.isFinite(east.south) ? Math.round(east.south) : null,
    },
    large: experiment.regions.filter(notable).map((region) => ({
      id: region.id,
      kind: region.kind,
      area: region.areaSqFt,
      width: region.widthFt,
      length: region.lengthFt,
      inscribed: region.inscribedFt,
      band: region.band,
      eastGap: region.eastGapFt,
      west: region.touchesWest,
      east: region.touchesEast,
      branch: region.medianBranchFt,
      building: region.nearestBuildingFt,
      anchor: region.anchor,
    })),
  };
}

function svg(row: Row, experiment: RegionExperiment, branches: NetworkBranch[]) {
  const pad = 80;
  const width = 420;
  const height = 860;
  const scale = Math.min((width - 36) / (maxX - minX + pad * 2), (height - 70) / (maxZ - minZ + pad * 2));
  const project = (x: number, z: number) => {
    const px = 18 + (x - (minX - pad)) * scale;
    const py = 28 + ((maxZ + pad) - z) * scale;
    return [px, py];
  };
  const parts: string[] = [];
  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`);
  parts.push(`<rect width="100%" height="100%" fill="#050505"/>`);
  for (const ring of buildings) {
    const points = ring.map(([x, z]) => project(x, z).join(",")).join(" ");
    parts.push(`<polygon points="${points}" fill="#2c2c2c" stroke="#4a4a4a" stroke-width="1"/>`);
  }
  const cell = experiment.paint.cell * scale;
  for (let index = 0; index < experiment.paint.cells.length; index += 1) {
    const id = experiment.paint.cells[index];
    if (id === 0) continue;
    const region = experiment.regions[id - 1];
    const col = index % experiment.paint.cols;
    const rowIndex = Math.floor(index / experiment.paint.cols);
    const x = experiment.paint.originX + col * experiment.paint.cell;
    const z = experiment.paint.originZ + (rowIndex + 1) * experiment.paint.cell;
    const [px, py] = project(x, z);
    const fill = region.kind === "enclosed" ? "rgba(199,126,95,0.72)" : region.kind === "narrow" ? "rgba(255,255,255,0.08)" : `hsla(${180 + (id % 5) * 8}, 55%, ${42 + (id % 3) * 6}%, 0.55)`;
    parts.push(`<rect x="${px.toFixed(1)}" y="${py.toFixed(1)}" width="${(cell + 0.4).toFixed(1)}" height="${(cell + 0.4).toFixed(1)}" fill="${fill}"/>`);
  }
  for (const edge of branches) {
    if (edge.conductivity < 0.08) continue;
    const [x0, y0] = project(edge.x0, edge.z0);
    const [x1, y1] = project(edge.x1, edge.z1);
    parts.push(`<line x1="${x0.toFixed(1)}" y1="${y0.toFixed(1)}" x2="${x1.toFixed(1)}" y2="${y1.toFixed(1)}" stroke="#f4f4f4" stroke-width="1.1"/>`);
  }
  for (const node of row.nodes) {
    if (node.kind !== "source" && node.kind !== "attractor") continue;
    const [x, y] = project(node.x, node.z);
    const color = node.kind === "source" ? "#c77e5f" : "#49d7de";
    parts.push(`<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3.2" fill="${color}"/>`);
  }
  const outline = parcel.map(([x, z]) => project(x, z).join(",")).join(" ");
  parts.push(`<polygon points="${outline}" fill="none" stroke="#49d7de" stroke-width="1.4"/>`);
  for (const region of experiment.regions) {
    if (region.areaSqFt < 8000) continue;
    const [x, y] = project(region.centroid.x, region.centroid.z);
    const label = `${Math.round(region.areaSqFt / 1000)}k · ${region.kind}${region.eastGapFt === 0 ? " · shore" : ""}`;
    parts.push(`<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" fill="#111111" font-family="Segoe UI, sans-serif" font-size="10" text-anchor="middle">${label}</text>`);
  }
  parts.push(`<text x="16" y="18" fill="#eeeeee" font-family="Segoe UI, sans-serif" font-size="13">${row.index} · ${experiment.name}</text>`);
  parts.push(`<text x="16" y="${height - 28}" fill="#bbbbbb" font-family="Segoe UI, sans-serif" font-size="11">seed ${row.seed}</text>`);
  parts.push(`<text x="16" y="${height - 12}" fill="#8a8a8a" font-family="Segoe UI, sans-serif" font-size="11">N up · orange enclosed · cyan open · white narrow</text>`);
  parts.push(`</svg>`);
  return parts.join("");
}

const wanted = [7, 2, 3, 13];
const byMethod = new Map<string, string[]>();
const report: unknown[] = [];
for (const index of wanted) {
  const row = rows.find((item) => item.index === index);
  if (!row) throw new Error(`Missing saved iteration ${index}`);
  const input = load(row);
  const methods = [circulationPartition(parcel, input.branches, input.nodes, buildings), anchorBasins(parcel, input.branches, input.nodes, buildings, false)];
  const junction = anchorBasins(parcel, input.branches, input.nodes, buildings, true);
  report.push({ index, title: row.title, seed: row.seed, method: junction.name, diagram: false, ...summarize(junction) });
  for (const method of methods) {
    report.push({ index, title: row.title, seed: row.seed, method: method.name, diagram: true, ...summarize(method) });
    const list = byMethod.get(method.name) ?? [];
    list.push(`<figure>${svg(row, method, input.branches)}<figcaption>${row.index} · ${row.title}<br>seed ${row.seed}</figcaption></figure>`);
    byMethod.set(method.name, list);
  }
}
const sections = [...byMethod.entries()].map(([name, figures]) => `<h2>${name}</h2><section>${figures.join("")}</section>`).join("");
const html = `<!doctype html><meta charset="utf-8"><title>Spatial region experiments</title>
<style>
  body { margin: 0; background: #050505; color: #eee; font: 14px/1.4 Segoe UI, sans-serif; }
  main { padding: 20px 24px 40px; }
  h1, h2 { font-weight: 500; }
  h1 { font-size: 18px; }
  h2 { font-size: 15px; letter-spacing: 0.04em; text-transform: uppercase; }
  p { max-width: 1100px; color: #ccc; }
  section { display: grid; grid-template-columns: repeat(4, 420px); gap: 18px; }
  figure { margin: 0 0 28px; }
  figcaption { margin-top: 6px; }
</style>
<main>
  <h1>Spatial regions from the saved networks</h1>
  <p>The same north-up frame is used for every plan. East, toward the bay, is on the right. Orange is an enclosed graph face. Cyan is open parcel land. Dim white is narrower than the 20 ft module envelope. White lines are the saved branches. Program colors are not assigned.</p>
  ${sections}
</main>`;
const out = process.argv[3];
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(`${out}/index.html`, html);
fs.writeFileSync(`${out}/measurements.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
