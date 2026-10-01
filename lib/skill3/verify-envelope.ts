import type { IsoMesh } from "@/lib/scan/isomesh";
import { DEFAULT_MODULE_Z, MODULE_SIZE_Z, moduleEnvelope, modulePoint, physicalSampleZ } from "./envelope";
import { materializeOpenings, type VoidSample } from "./materialize";
import { branchSampledFutures } from "./futures";
import { toVerticalViewerField } from "./viewer-field";

const assert = (condition: boolean, message: string) => {
  if (!condition) throw new Error(message);
};
const ok = (message: string) => console.log(`ok  ${message}`);
const HEIGHTS = [20, 40, 60] as const;

function plate(size: number, z: number): VoidSample {
  const trails = new Array<number>(size * size).fill(0.4);
  let peak = 0.4;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const border = x < 2 || y < 2 || x >= size - 2 || y >= size - 2;
      const hole = (x - 16) ** 2 + (y - 16) ** 2 <= 36;
      const value = border || hole ? 0 : 0.4;
      trails[y * size + x] = value;
      if (value > peak) peak = value;
    }
  }
  return { z, trails, trailSize: size, peak };
}

function bounds(mesh: IsoMesh) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < mesh.positions.length; i += 3) {
    for (let axis = 0; axis < 3; axis += 1) {
      min[axis] = Math.min(min[axis], mesh.positions[i + axis]);
      max[axis] = Math.max(max[axis], mesh.positions[i + axis]);
    }
  }
  return { min, max };
}

function sameIndices(left: IsoMesh, right: IsoMesh) {
  if (left.indices.length !== right.indices.length) return false;
  for (let i = 0; i < left.indices.length; i += 1) if (left.indices[i] !== right.indices[i]) return false;
  return true;
}

function scaledVertically(base: IsoMesh, taller: IsoMesh, factor: number) {
  if (base.positions.length !== taller.positions.length) return false;
  for (let i = 0; i < base.positions.length; i += 3) {
    if (Math.abs(taller.positions[i] - base.positions[i]) > 1e-4) return false;
    if (Math.abs(taller.positions[i + 2] - base.positions[i + 2]) > 1e-4) return false;
    if (Math.abs(taller.positions[i + 1] - base.positions[i + 1] * factor) > 1e-3) return false;
  }
  return true;
}

function insideEnvelope(mesh: IsoMesh, sizeZ: number) {
  const box = bounds(mesh);
  const limit = 1e-3;
  return box.min[0] >= -10 - limit && box.max[0] <= 10 + limit
    && box.min[2] >= -10 - limit && box.max[2] <= 10 + limit
    && box.min[1] >= -sizeZ / 2 - limit && box.max[1] <= sizeZ / 2 + limit;
}

let rejected = false;
try {
  moduleEnvelope(30);
} catch {
  rejected = true;
}
assert(rejected, "sizeZ 30 should be rejected");
assert(moduleEnvelope(20).sizeX === 20 && moduleEnvelope(20).sizeY === 20, "XY is 20");
assert(MODULE_SIZE_Z === 20 && DEFAULT_MODULE_Z === 20, "prototype Z is 20");
assert(moduleEnvelope(40).zIncrement === 20, "Z increment is 20");
ok("prototype envelope is 20×20×20");

const normalized = [0, 15 / 63, 34 / 63, 49 / 63, 1];
const placed = HEIGHTS.map((height) => physicalSampleZ(normalized, height));
assert(placed[0][0] === 0 && placed[0][4] === 20, "20-high module starts at 0 and ends at 20");
assert(placed[1][4] === 40 && placed[2][4] === 60, "40 and 60 keep the same end");
for (let i = 1; i < normalized.length; i += 1) {
  const gap20 = placed[0][i] - placed[0][i - 1];
  const gap40 = placed[1][i] - placed[1][i - 1];
  const gap60 = placed[2][i] - placed[2][i - 1];
  assert(Math.abs(gap40 / gap20 - 2) < 1e-9 && Math.abs(gap60 / gap20 - 3) < 1e-9, "temporal gaps scale with height");
}
const corner = modulePoint(moduleEnvelope(60), 1, 1, 1);
assert(corner[0] === 20 && corner[1] === 20 && corner[2] === 60, "normalized corner maps to the module corner");
ok("normalized event gaps stay proportional inside the fixed module");

const samples = [plate(48, 0), plate(48, 15 / 63), plate(48, 34 / 63), plate(48, 1)];
const options = { iso: 0.48, spacing: 0.1, yaw: 0.86 };
for (const mode of ["isomesh", "voxel"] as const) {
  const meshes = HEIGHTS.map((sizeZ) => materializeOpenings(samples, { ...options, mode, sizeZ }));
  assert(meshes.every((mesh) => mesh.triangles > 0), `${mode} produced a mesh`);
  assert(sameIndices(meshes[0], meshes[1]) && sameIndices(meshes[0], meshes[2]), `${mode} topology changed with height`);
  assert(scaledVertically(meshes[0], meshes[1], 2) && scaledVertically(meshes[0], meshes[2], 3), `${mode} did not scale only in Z`);
  assert(HEIGHTS.every((sizeZ, index) => insideEnvelope(meshes[index], sizeZ)), `${mode} left the envelope`);
  ok(`${mode} keeps one topology in the 20×20×20 module`);
}

const isoField = materializeOpenings(samples, { ...options, mode: "isomesh", sizeZ: 20 });
const voxelField = materializeOpenings(samples, { ...options, mode: "voxel", sizeZ: 20 });
assert(insideEnvelope(isoField, 20) && insideEnvelope(voxelField, 20), "both modes share the 20×20×20 frame");
ok("isomesh and voxels occupy the same module");

const branched = branchSampledFutures({ runKey: "void-field@20260928", candidateId: 39 }, 1);
const future = branched.futures[0];
assert(future.iterations.join(",") === "600,615,634,649,663", `F01 iterations changed: ${future.iterations.join(",")}`);
const viewer = toVerticalViewerField(future.sampling, "F01");
const sampleZ = viewer.slices.map((slice) => slice.z);
const physical = HEIGHTS.map((height) => physicalSampleZ(sampleZ, height));
for (let i = 1; i < sampleZ.length; i += 1) {
  const gap = physical[0][i] - physical[0][i - 1];
  assert(Math.abs((physical[1][i] - physical[1][i - 1]) / gap - 2) < 1e-9, "F01 gap did not double at 40");
  assert(Math.abs((physical[2][i] - physical[2][i - 1]) / gap - 3) < 1e-9, "F01 gap did not triple at 60");
}
const f01 = HEIGHTS.map((sizeZ) => materializeOpenings(viewer.slices, { ...options, mode: "isomesh", sizeZ }));
const f01Voxels = HEIGHTS.map((sizeZ) => materializeOpenings(viewer.slices, { ...options, mode: "voxel", sizeZ }));
assert(sameIndices(f01[0], f01[1]) && sameIndices(f01[0], f01[2]), "F01 isomesh topology changed with height");
assert(sameIndices(f01Voxels[0], f01Voxels[1]) && sameIndices(f01Voxels[0], f01Voxels[2]), "F01 voxel topology changed with height");
assert(scaledVertically(f01[0], f01[1], 2) && scaledVertically(f01[0], f01[2], 3), "F01 isomesh Z scale drifted");
assert(scaledVertically(f01Voxels[0], f01Voxels[1], 2) && scaledVertically(f01Voxels[0], f01Voxels[2], 3), "F01 voxel Z scale drifted");
assert(HEIGHTS.every((sizeZ, index) => insideEnvelope(f01[index], sizeZ) && insideEnvelope(f01Voxels[index], sizeZ)), "F01 left the envelope");
ok(`F01 ${future.iterations.join(",")} maps into the 20×20×20 module (${f01[0].triangles} triangles)`);

console.log("skill 3 module envelope verified");
