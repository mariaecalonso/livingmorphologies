import context from "@/data/skill5/herald-site.json";
import type { SiteContext, XZ } from "@/lib/skill5/site-model";
import { assessNetworkDomain, rasterNetworkMask } from "./site-network-domain";
import { runNetworkIteration, SiteNetworkStudy } from "./site-network";
import { growthRing } from "./site-water-growth";

const site = context as SiteContext;
const parcel: XZ[] = [
  [0, 0],
  [200, 0],
  [200, 160],
  [0, 160],
];
const bay: XZ[] = [
  [200, -20],
  [320, -20],
  [320, 180],
  [200, 180],
];

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

function solve(seed: number, nodes: SiteNetworkStudy["edit"]["nodes"]) {
  const study = new SiteNetworkStudy(parcel, bay, { seed, nodes, persist: false });
  study.resume();
  let guard = 0;
  while (!study.settled && guard < 180) {
    study.step(4, false);
    guard += 1;
  }
  study.finish();
  return study;
}

async function main() {
  const closed = new SiteNetworkStudy(parcel, bay, { persist: false });
  assert(closed.canPlace("attractor", 230, 80), "A bay point inside the frame could not accept an attractor.");
  assert(closed.insideField(230, 80) === false, "The bay was open before a water attractor.");
  assert(closed.place("source", 230, 80) === false, "A source was placed on water.");
  assert(closed.place("attractor", 40, 80), "A land attractor was rejected.");
  const land = closed.edit.nodes[0];
  assert(land.surface !== "water", "A land attractor was marked as water.");
  assert(closed.place("source", 30, 40), "A source was rejected on open land.");
  assert(closed.place("attractor", 230, 80), "A water attractor was rejected.");
  const water = closed.edit.nodes.find((node) => node.surface === "water");
  assert(water?.water != null, "The water attractor did not open a growth zone.");
  assert(closed.insideField(230, 80), "The water attractor stayed outside its growth zone.");
  assert(closed.insideField(water.water.landX, water.water.landZ), "The growth zone missed the land contact.");
  assert(closed.onWater(230, 80) && closed.insideField(230, 80), "The zone did not open the water under the attractor.");
  assert(closed.insideField(238, 140) === false, "The growth zone opened water away from the attractor.");
  const ring = growthRing(water.x, water.z, water.water.landX, water.water.landZ, water.water.widthFt);
  assert(ring?.length === 4, "The growth zone is not a single region.");

  const invalid = assessNetworkDomain({ parcel, water: bay, overWaterZones: [[[0, 0]]] });
  const mask = rasterNetworkMask(closed.frame, invalid, 8);
  assert(invalid.overWaterZones.length === 0, "An invalid growth ring was accepted.");
  assert(mask.traversable > 0, "An invalid growth ring closed the land.");

  const kept = { ...land };
  assert(closed.remove(water.id) === undefined, "Removing a water attractor returned a value.");
  const survivor = closed.edit.nodes.find((node) => node.id === kept.id);
  assert(survivor?.x === kept.x && survivor.z === kept.z && survivor.surface !== "water", "Removing the water attractor changed a land node.");
  assert(closed.insideField(230, 80) === false, "Removing the water attractor left its bay corridor open.");
  assert(closed.place("attractor", 230, 80), "The water attractor could not be placed again.");

  const placed = closed.edit.nodes.find((node) => node.surface === "water");
  assert(placed?.water != null, "The replacement water attractor has no zone.");
  assert(closed.clearGrowth(placed.id), "The growth zone could not be removed.");
  assert(closed.edit.nodes.some((node) => node.id === placed.id && node.water === null), "Removing the zone deleted the attractor.");
  assert(closed.insideField(placed.x, placed.z) === false, "Removing the zone left the bay open.");
  closed.resume();
  closed.step(2, false);
  const opened = closed.flowReport();
  assert(opened.disconnected.includes(placed.id), "A water attractor without a zone was not reported as disconnected.");
  assert(closed.restoreGrowth(placed.id), "The growth zone could not be restored.");
  assert(closed.insideField(placed.x, placed.z), "The restored zone did not cover the attractor.");
  assert(closed.place("attractor", 120, 110), "A second land attractor was rejected.");

  const nodes = closed.edit.nodes.map((node) => ({ ...node, water: node.water ? { ...node.water } : node.water }));
  const seeds = [11, 29];
  const reports = seeds.map((seed) => {
    const study = solve(seed, nodes);
    const report = study.flowReport();
    const waterId = study.edit.nodes.find((node) => node.surface === "water")?.id;
    assert(report.maskBreaks === 0, `Seed ${seed} left ${report.maskBreaks} edges outside the open land and over-water zone.`);
    assert(report.step > 0, `Seed ${seed} did not run the flow solve.`);
    assert(waterId != null && (report.connected.includes(waterId) || report.disconnected.includes(waterId)), `Seed ${seed} omitted the water attractor from the solve.`);
    assert(study.edit.nodes.filter((node) => node.surface !== "water").every((node) => nodes.some((item) => item.id === node.id && item.x === node.x && item.z === node.z)), `Seed ${seed} moved an unrelated node.`);
    return report.signature;
  });
  console.log(`water attractor seeds ${seeds.join(", ")} signatures ${reports.join(" | ") || "empty"}`);

  const iteration = await runNetworkIteration(parcel, bay, nodes, 11);
  const replay = new SiteNetworkStudy(parcel, bay, { seed: 11, nodes: iteration.nodes, persist: false });
  const replayWater = replay.edit.nodes.find((node) => node.surface === "water");
  assert(replayWater?.water != null && replay.insideField(replayWater.x, replayWater.z), "A saved iteration dropped the over-water growth zone.");

  const miami = new SiteNetworkStudy(site.site.ring, site.water.ring, { persist: false, buildings: site.buildings });
  let bayPoint: { x: number; z: number } | null = null;
  const [px, pz] = site.site.ring.reduce((sum, point) => [sum[0] + point[0], sum[1] + point[1]], [0, 0]);
  const origin = { x: px / site.site.ring.length, z: pz / site.site.ring.length };
  for (let index = 0; index < site.site.ring.length && !bayPoint; index += 1) {
    const a = site.site.ring[index];
    const b = site.site.ring[(index + 1) % site.site.ring.length];
    const midX = (a[0] + b[0]) / 2;
    const midZ = (a[1] + b[1]) / 2;
    const dx = midX - origin.x;
    const dz = midZ - origin.z;
    const span = Math.hypot(dx, dz) || 1;
    for (const distance of [12, 24, 40, 70, 110]) {
      const x = midX + (dx / span) * distance;
      const z = midZ + (dz / span) * distance;
      if (miami.onWater(x, z) && miami.canPlace("attractor", x, z) && !miami.insideField(x, z)) {
        bayPoint = { x, z };
        break;
      }
    }
  }
  assert(bayPoint !== null, "No Biscayne Bay point inside the site frame could take an attractor.");
  assert(miami.place("source", origin.x, origin.z) || miami.place("source", origin.x + 40, origin.z), "No land source could be placed on the Miami parcel.");
  assert(miami.place("attractor", origin.x + 70, origin.z + 40) || miami.place("attractor", origin.x - 50, origin.z + 20), "No land attractor could be placed on the Miami parcel.");
  assert(miami.place("attractor", bayPoint.x, bayPoint.z), "The Biscayne Bay attractor was rejected.");
  const miamiWater = miami.edit.nodes.find((node) => node.surface === "water");
  assert(miamiWater?.water != null && miami.insideField(miamiWater.x, miamiWater.z), "The Miami growth zone did not reach the water attractor.");
  const distant = { x: bayPoint.x + (bayPoint.x - origin.x), z: bayPoint.z + (bayPoint.z - origin.z) };
  if (miami.onWater(distant.x, distant.z)) assert(miami.insideField(distant.x, distant.z) === false, "The Miami growth zone opened the bay beyond the attractor.");
  miami.resume();
  miami.step(12, false);
  const miamiReport = miami.flowReport();
  assert(miamiReport.maskBreaks === 0, `${miamiReport.maskBreaks} Miami edges leave the permitted domain.`);
  assert(miamiReport.connected.includes(miamiWater.id) || miamiReport.disconnected.includes(miamiWater.id), "The Miami water attractor was missing from the flow report.");
  console.log("water attractor checks passed");
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
