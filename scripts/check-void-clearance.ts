import { readFileSync } from "node:fs";
import {
  generatePlacementNetworkVoid,
  PLACEMENT_VOID_HUG_GAP_FT,
} from "../lib/skill5/placement-network-void";
import { selectedClusterAssembly } from "../lib/skill5/cluster-assemblies";

const assembly = selectedClusterAssembly();
if (!assembly) throw new Error("No selected cluster assembly.");

const raw = JSON.parse(readFileSync("data/skill5/herald-arrival-v1.json", "utf8")) as {
  iterations?: { id?: string; branches?: { x0: number; z0: number; x1: number; z1: number; conductivity?: number }[] }[];
};
const iteration = raw.iterations?.find((item) => item.id === assembly.selectedNetworkId);
const branches = (iteration?.branches ?? []).map((branch) => ({
  x0: branch.x0,
  z0: branch.z0,
  x1: branch.x1,
  z1: branch.z1,
  conductivity: typeof branch.conductivity === "number" ? branch.conductivity : 1,
}));

const t0 = Date.now();
const report = generatePlacementNetworkVoid({ assembly, branches });
const ok = report.minSolidGapFt + 1e-6 >= PLACEMENT_VOID_HUG_GAP_FT;

console.log(
  JSON.stringify(
    {
      ms: Date.now() - t0,
      hugGapFt: PLACEMENT_VOID_HUG_GAP_FT,
      minSolidGapFt: report.minSolidGapFt,
      ok,
      tris: report.voidMesh.triangles,
      voidCubicFeet: report.voidCubicFeet,
      voidComponents: report.voidComponents,
    },
    null,
    2,
  ),
);

if (!ok) {
  process.exitCode = 1;
}
