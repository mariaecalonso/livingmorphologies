import { detectPockets } from "../../lib/skill5/pockets";
import { polygonAreaSqFt } from "../../lib/skill5/zoning";

const parcel: [number, number][] = [[0, 0], [100, 0], [100, 100], [0, 100]];
const split = detectPockets([{ x0: 0, z0: 50, x1: 100, z1: 50, conductivity: 1 }], parcel);
const areas = split.pockets.map((pocket) => Math.round(polygonAreaSqFt(pocket.points))).sort((a, b) => a - b);
if (split.pockets.length !== 2 || areas[0] !== 5000 || areas[1] !== 5000) {
  throw new Error(`parcel split failed ${JSON.stringify(areas)} open ${split.openSegments}`);
}
if (!split.pockets.every((pocket) => pocket.touchesParcel)) throw new Error("split should meet the parcel");

const loop = detectPockets([
  { x0: 20, z0: 20, x1: 80, z1: 20, conductivity: 1 },
  { x0: 80, z0: 20, x1: 80, z1: 80, conductivity: 1 },
  { x0: 80, z0: 80, x1: 20, z1: 80, conductivity: 1 },
  { x0: 20, z0: 80, x1: 20, z1: 20, conductivity: 1 },
], parcel);
const loopAreas = loop.pockets.map((pocket) => Math.round(polygonAreaSqFt(pocket.points)));
if (loop.pockets.length !== 1 || loopAreas[0] !== 3600) {
  throw new Error(`loop failed ${JSON.stringify(loopAreas)} open ${loop.openSegments}`);
}
if (loop.pockets[0].touchesParcel) throw new Error("interior loop should not use the parcel");

const again = detectPockets([{ x0: 0, z0: 50, x1: 100, z1: 50, conductivity: 1 }], parcel);
if (again.pockets.map((pocket) => pocket.id).sort().join() !== split.pockets.map((pocket) => pocket.id).sort().join()) {
  throw new Error("pocket ids changed");
}

const open = detectPockets([{ x0: 20, z0: 20, x1: 80, z1: 20, conductivity: 1 }], parcel);
if (open.pockets.length !== 0 || open.openSegments < 1) throw new Error(`open branch was closed ${JSON.stringify(open)}`);

console.log("pocket checks passed");
