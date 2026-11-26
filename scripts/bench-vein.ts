import { readFileSync } from "fs";
import { buildVeinChains } from "../components/site/site-network-vein-draw";

const raw = JSON.parse(readFileSync("data/skill5/herald-arrival-v1.json", "utf8")) as {
  iterations: { id: string; branches?: { x0: number; z0: number; x1: number; z1: number; conductivity: number }[] }[];
};
const it = raw.iterations.find((item) => item.id === "batch-mwwprevq-sparse-21000101");
if (!it?.branches) throw new Error("missing");
const edges = it.branches.map((branch) => ({
  x0: branch.x0,
  z0: branch.z0,
  x1: branch.x1,
  z1: branch.z1,
  conductivity: branch.conductivity,
}));
console.log("edges", edges.length);
const t0 = performance.now();
const chains = buildVeinChains(edges, 5.2);
console.log("chains", chains.length, "ms", (performance.now() - t0).toFixed(1));
console.log("points", chains.reduce((sum, chain) => sum + chain.points.length, 0));
