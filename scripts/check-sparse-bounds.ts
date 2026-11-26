import { readFileSync } from "fs";
import { buildVeinChains } from "../components/site/site-network-vein-draw";

const raw = JSON.parse(readFileSync("data/skill5/herald-arrival-v1.json", "utf8")) as {
  iterations: {
    id: string;
    nodes: { kind: string; x: number; z: number; architecture?: { role?: string } }[];
    branches?: { x0: number; z0: number; x1: number; z1: number; conductivity: number }[];
  }[];
};
const it = raw.iterations.find((item) => item.id === "batch-mwwprevq-sparse-21000101");
if (!it?.branches) throw new Error("missing");
let minX = Infinity;
let maxX = -Infinity;
let minZ = Infinity;
let maxZ = -Infinity;
for (const branch of it.branches) {
  minX = Math.min(minX, branch.x0, branch.x1);
  maxX = Math.max(maxX, branch.x0, branch.x1);
  minZ = Math.min(minZ, branch.z0, branch.z1);
  maxZ = Math.max(maxZ, branch.z0, branch.z1);
}
console.log("branchBounds", { minX, maxX, minZ, maxZ });
console.log("nodes", it.nodes.map((node) => `${node.kind}:${node.architecture?.role}:${node.x.toFixed(0)},${node.z.toFixed(0)}`));
const chains = buildVeinChains(
  it.branches.map((branch) => ({
    x0: branch.x0,
    z0: branch.z0,
    x1: branch.x1,
    z1: branch.z1,
    conductivity: branch.conductivity,
  })),
  5.2,
  3,
);
let cMinX = Infinity;
let cMaxX = -Infinity;
let cMinZ = Infinity;
let cMaxZ = -Infinity;
for (const chain of chains) {
  for (const point of chain.points) {
    cMinX = Math.min(cMinX, point.x);
    cMaxX = Math.max(cMaxX, point.x);
    cMinZ = Math.min(cMinZ, point.z);
    cMaxZ = Math.max(cMaxZ, point.z);
  }
}
console.log("chainBounds", { cMinX, cMaxX, cMinZ, cMaxZ, chains: chains.length });
