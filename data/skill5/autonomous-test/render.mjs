import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const dir = dirname(fileURLToPath(import.meta.url));
const report = JSON.parse(readFileSync(join(dir, "report.json"), "utf8"));
const scenario = JSON.parse(readFileSync(join(dir, "scenario.json"), "utf8"));
const seating = JSON.parse(readFileSync(join(dir, "assembly-seating.json"), "utf8"));
const parcel = scenario.iteration ? null : null;
const site = JSON.parse(readFileSync(join(dir, "..", "herald-site.json"), "utf8"));

const branches = scenario.iteration.branches ?? [];
const zones = scenario.zones;
const instances = scenario.instances;
const color = { lobby: "#a07a68", workspace: "#7f96a8", gathering: "#5d7c79" };

let minX = Infinity;
let maxX = -Infinity;
let minZ = Infinity;
let maxZ = -Infinity;
for (const [x, z] of [...site.site.ring, ...site.water.ring]) {
  minX = Math.min(minX, x);
  maxX = Math.max(maxX, x);
  minZ = Math.min(minZ, z);
  maxZ = Math.max(maxZ, z);
}
const pad = 40;
minX -= pad;
maxX += pad;
minZ -= pad;
maxZ += pad;
const W = 1100;
const H = 780;
const sx = (x) => ((x - minX) / (maxX - minX)) * (W - 80) + 40;
const sy = (z) => H - 40 - ((z - minZ) / (maxZ - minZ)) * (H - 80);
const ring = (points) => points.map((point) => Array.isArray(point) ? `${sx(point[0]).toFixed(1)},${sy(point[1]).toFixed(1)}` : `${sx(point.x).toFixed(1)},${sy(point.z).toFixed(1)}`).join(" ");

let zminX = Infinity;
let zmaxX = -Infinity;
let zminZ = Infinity;
let zmaxZ = -Infinity;
for (const edge of branches) {
  zminX = Math.min(zminX, edge.x0, edge.x1);
  zmaxX = Math.max(zmaxX, edge.x0, edge.x1);
  zminZ = Math.min(zminZ, edge.z0, edge.z1);
  zmaxZ = Math.max(zmaxZ, edge.z0, edge.z1);
}
const zpad = 30;
zminX -= zpad;
zmaxX += zpad;
zminZ -= zpad;
zmaxZ += zpad;
const zx = (x) => ((x - zminX) / (zmaxX - zminX)) * (W - 80) + 40;
const zy = (z) => H - 40 - ((z - zminZ) / (zmaxZ - zminZ)) * (H - 80);
const zring = (points) => points.map((point) => Array.isArray(point) ? `${zx(point[0]).toFixed(1)},${zy(point[1]).toFixed(1)}` : `${zx(point.x).toFixed(1)},${zy(point.z).toFixed(1)}`).join(" ");
const zoomBase = `<rect width="100%" height="100%" fill="#000"/><polygon points="${zring(site.site.ring)}" fill="none" stroke="#777"/>`;
const zoomNetwork = branches.map((edge) => `<line x1="${zx(edge.x0)}" y1="${zy(edge.z0)}" x2="${zx(edge.x1)}" y2="${zy(edge.z1)}" stroke="#f3f3ee" stroke-width="0.8"/>`).join("");
const zoomNodes = report.nodes.map((node) => {
  const fill = node.surface === "water" ? "#e2c27a" : node.kind === "source" ? "#c77e5f" : "#49d7de";
  const failed = node.kind === "attractor" && !report.iteration.reachedIds.includes(node.id) ? `<circle cx="${zx(node.x)}" cy="${zy(node.z)}" r="11" fill="none" stroke="#c77e5f"/>` : "";
  return `${failed}<circle cx="${zx(node.x)}" cy="${zy(node.z)}" r="5" fill="${fill}"/>`;
}).join("");
const zoomMarkers = report.markers.map((marker) => `<circle cx="${zx(marker.x)}" cy="${zy(marker.z)}" r="8" fill="none" stroke="${color[marker.typology]}"/><circle cx="${zx(marker.x)}" cy="${zy(marker.z)}" r="2" fill="${color[marker.typology]}"/>`).join("");
const zoomZones = zones.map((zone) => `<polygon points="${zring(zone.points)}" fill="${color[zone.kind]}33" stroke="${color[zone.kind]}" stroke-width="0.7"/>`).join("");
const zoomTiles = instances.map((item) => {
  const upper = item.transform.position.y > 1;
  return `<rect x="${zx(item.transform.position.x) - 8}" y="${zy(item.transform.position.z) - 8}" width="16" height="16" fill="none" stroke="${color[item.program] ?? "#fff"}" stroke-width="${upper ? 1.8 : 0.9}" stroke-dasharray="${upper ? "2 1.5" : "none"}"/>`;
}).join("");
const frame = (title, body) => `<section><h2>${title}</h2>${body}</section>`;
const base = `<rect width="100%" height="100%" fill="#000"/><polygon points="${ring(site.water.ring)}" fill="none" stroke="#3a4446"/><polygon points="${ring(site.site.ring)}" fill="#0c0c0c" stroke="#777"/>`;
const nodes = report.nodes.map((node) => {
  const fill = node.surface === "water" ? "#e2c27a" : node.kind === "source" ? "#c77e5f" : "#49d7de";
  const failed = report.iteration.reachedIds.includes(node.id) ? "" : node.kind === "attractor" ? `<circle cx="${sx(node.x)}" cy="${sy(node.z)}" r="9" fill="none" stroke="#c77e5f"/>` : "";
  return `${failed}<circle cx="${sx(node.x)}" cy="${sy(node.z)}" r="4" fill="${fill}"/>`;
}).join("");
const markers = report.markers.map((marker) => `<circle cx="${sx(marker.x)}" cy="${sy(marker.z)}" r="7" fill="none" stroke="${color[marker.typology]}"/><circle cx="${sx(marker.x)}" cy="${sy(marker.z)}" r="1.8" fill="${color[marker.typology]}"/>`).join("");
const network = branches.map((edge) => `<line x1="${sx(edge.x0)}" y1="${sy(edge.z0)}" x2="${sx(edge.x1)}" y2="${sy(edge.z1)}" stroke="#f3f3ee" stroke-width="0.7"/>`).join("");
const zoneShapes = zones.map((zone) => `<polygon points="${ring(zone.points)}" fill="${color[zone.kind]}22" stroke="${color[zone.kind]}" stroke-width="0.6"/>`).join("");
const tiles = instances.map((item) => {
  const tone = color[item.program] ?? "#fff";
  const upper = item.transform.position.y > 1;
  return `<rect x="${sx(item.transform.position.x) - 7}" y="${sy(item.transform.position.z) - 7}" width="14" height="14" fill="none" stroke="${tone}" stroke-width="${upper ? 1.6 : 0.8}" stroke-dasharray="${upper ? "2 1.5" : "none"}"/>`;
}).join("");
const axon = instances.map((item) => {
  const x = item.transform.position.x;
  const y = item.transform.position.y;
  const z = item.transform.position.z;
  const px = 80 + ((x - zminX) / (zmaxX - zminX)) * 720 - ((z - zminZ) / (zmaxZ - zminZ)) * 180;
  const py = 560 - y * 4.2 - ((z - zminZ) / (zmaxZ - zminZ)) * 160;
  return `<rect x="${px.toFixed(1)}" y="${py.toFixed(1)}" width="18" height="14" fill="#050505" stroke="${color[item.program] ?? "#fff"}" stroke-width="0.8"/>`;
}).join("");

const html = `<!doctype html><html><head><meta charset="utf-8"><title>Autonomous Site Strategy test</title>
<style>
  body{margin:0;background:#000;color:#fff;font:13px/1.45 ui-sans-serif,sans-serif}
  section{padding:28px 36px 8px}
  h1,h2{font-weight:500;letter-spacing:.14em;text-transform:uppercase;font-size:13px}
  p,li{color:#c8c8c8;max-width:1080px}
  .legend{display:flex;gap:18px;color:#bbb;letter-spacing:.08em;text-transform:uppercase;font-size:11px}
  i{display:inline-block;width:9px;height:9px;margin-right:6px;vertical-align:-1px}
</style></head><body>
<h1 style="padding:28px 36px 0">Autonomous test · seed ${report.seed} · not loaded into the live site</h1>
<p style="padding:0 36px">One Herald Plaza. Biological nodes and the Physarum network are the solver output. Architectural markers were not inputs. No connector lines are drawn: direct joins did not validate, and hybrid meshes were seated only for a 24-pair sample.</p>
<div class="legend" style="padding:0 36px 12px">
  <span><i style="background:#c77e5f"></i>Source</span>
  <span><i style="background:#49d7de"></i>Land attractor</span>
  <span><i style="background:#e2c27a"></i>Water attractor</span>
  <span><i style="background:${color.lobby}"></i>Lobby</span>
  <span><i style="background:${color.gathering}"></i>Gathering</span>
  <span><i style="background:${color.workspace}"></i>Workspace</span>
</div>
${frame("01 Site plan · network, sources, attractors, typology markers", `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">${base}${network}${markers}${nodes}</svg>`)}
${frame("01b Network extent", `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">${zoomBase}${zoomNetwork}${zoomMarkers}${zoomNodes}</svg>`)}
${frame("02 Zoning · every detected pocket", `<p>887 pockets. 788 are smaller than one 20 ft tile. The drawing below is cropped to the network.</p><svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">${zoomBase}${zoomZones}</svg>`)}
${frame("03 Tile placement · solid ground, dashed upper", `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">${zoomBase}${zoomTiles}</svg>`)}
${frame("04 Axonometric · placed tiles, no invented connectors", `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}"><rect width="100%" height="100%" fill="#000"/>${axon}</svg>`)}
${frame("05 Diagnostics", `<ul>
<li>Network settled at step ${report.iteration.step} of budget ${report.stepBudget}. Reached ${report.iteration.reached} of ${report.iteration.total}. ${report.iteration.note}</li>
<li>Branches ${report.iteration.branchCount}. Open segments ${report.iteration.openSegments}.</li>
<li>Zones: lobby ${report.zones.filter((z)=>z.kind==="lobby").length}, workspace ${report.zones.filter((z)=>z.kind==="workspace").length}, gathering ${report.zones.filter((z)=>z.kind==="gathering").length}.</li>
<li>Tiles placed ${report.placedCount}. Placement rejected ${report.selections.filter((s)=>s.warning).length}. Upper tiles with no zone link: 476. Typology mismatches: 66. Unsupported stacks: 0 by the bounding-box check.</li>
<li>Direct joins valid: 0 of 3594. Hybrid seating sample: ${seating.summary.seated} of ${seating.summary.adjacentAttempts + seating.summary.separatedSample}. Closed shells in that sample: 24. Section correspondence failed on all 8 vertical samples. Mesh verdicts were unresolved or corrected, not clean.</li>
<li>The earlier one-component count counted hybrid offers before seating. It is not a connected building.</li>
</ul>`)}
</body></html>`;
writeFileSync(join(dir, "index.html"), html);
console.log("wrote index", html.length);
