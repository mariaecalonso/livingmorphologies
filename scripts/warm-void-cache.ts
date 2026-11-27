import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { selectedClusterAssembly } from "../lib/skill5/cluster-assemblies";
import {
  generatePlacementNetworkVoid,
  NETWORK_LINE_OFFSET_FT,
  PLACEMENT_VOID_HUG_GAP_FT,
  PLACEMENT_VOID_MORPHOLOGY_REACH_FT,
  PLACEMENT_VOID_SOLID_CLEARANCE_CELLS,
} from "../lib/skill5/placement-network-void";

const assembly = selectedClusterAssembly();
if (!assembly) throw new Error("no assembly");
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
const report = generatePlacementNetworkVoid({ assembly, branches });
const bytes = (view: ArrayBufferView) => Buffer.from(view.buffer, view.byteOffset, view.byteLength).toString("base64");
const body = {
  contract: report.contract,
  assemblyId: report.assemblyId,
  selectedNetworkId: report.selectedNetworkId,
  solidCount: report.solidCount,
  pocketCount: report.pocketCount,
  offsetFt: report.offsetFt,
  cell: report.cell,
  shelter: report.shelter,
  minimumGap: report.minimumGap,
  voidCubicFeet: report.voidCubicFeet,
  occupiedCubicFeet: report.occupiedCubicFeet,
  voidComponents: report.voidComponents,
  minSolidGapFt: report.minSolidGapFt,
  processing: report.processing,
  elapsedMs: report.elapsedMs,
  voidMesh: {
    triangles: report.voidMesh.triangles,
    positions: bytes(report.voidMesh.positions),
    normals: bytes(report.voidMesh.normals),
    indices: bytes(report.voidMesh.indices),
  },
};
const cacheKey = createHash("sha1")
  .update(
    [
      assembly.assemblyId,
      assembly.selectedNetworkId,
      String(assembly.occupancy.length),
      String(NETWORK_LINE_OFFSET_FT),
      String(PLACEMENT_VOID_MORPHOLOGY_REACH_FT),
      String(PLACEMENT_VOID_HUG_GAP_FT),
      String(PLACEMENT_VOID_SOLID_CLEARANCE_CELLS),
      "shell-wall-v39",
    ].join("|"),
  )
  .digest("hex");
const dir = path.join("data/skill5/.void-cache");
mkdirSync(dir, { recursive: true });
const file = path.join(dir, `${cacheKey}.json`);
writeFileSync(file, JSON.stringify(body));
console.log(
  JSON.stringify(
    {
      file,
      tris: body.voidMesh.triangles,
      offset: body.offsetFt,
      gap: body.minSolidGapFt,
      ft3: body.voidCubicFeet,
      bytes: statSync(file).size,
    },
    null,
    2,
  ),
);
