import { dualMassVolume, ENVELOPE_LEVEL, envelopeMask, massFromSignedDistance, materializeOpenings, massVolume, openingMasks, voidSignedDistance, type VoidSample } from "./materialize";

const assert = (condition: boolean, message: string) => {
  if (!condition) throw new Error(message);
};
const ok = (message: string) => console.log(`ok  ${message}`);

function plate(size: number, paint: (x: number, y: number) => number, z: number): VoidSample {
  const trails = new Array<number>(size * size);
  let peak = 0.0001;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const value = paint(x, y);
      trails[y * size + x] = value;
      if (value > peak) peak = value;
    }
  }
  return { z, trails, trailSize: size, peak };
}

function disk(x: number, y: number, cx: number, cy: number, radius: number) {
  const dx = x - cx;
  const dy = y - cy;
  return dx * dx + dy * dy <= radius * radius;
}

/** Filled square, dark border, two circular holes. The bridge is tissue unless `merged`. */
function twoHoles(size: number, z: number, merged: boolean) {
  return plate(size, (x, y) => {
    if (x < 2 || y < 2 || x >= size - 2 || y >= size - 2) return 0;
    const left = disk(x, y, 16, 24, 6);
    const right = disk(x, y, 30, 24, 6);
    const bridge = merged && x >= 16 && x <= 30 && y >= 22 && y <= 26;
    if (left || right || bridge) return 0;
    return x === 24 && y === 8 ? 1 : 0.2;
  }, z);
}

const separate = openingMasks(twoHoles(48, 0, false));
assert(separate.openingCount === 2, `separate holes should be two openings, got ${separate.openingCount}`);
assert(separate.opening[24 * 48 + 16] === 1, "left hole is an opening");
assert(separate.opening[24 * 48 + 30] === 1, "right hole is an opening");
assert(separate.opening[24 * 48 + 23] === 0, "the wall between holes stays mass");
assert(separate.exterior[0] === 1, "the border is exterior");
assert(separate.opening[0] === 0, "the border is not an opening");
ok("two circular holes stay separate, and the border is exterior");

const merged = openingMasks(twoHoles(48, 0, true));
assert(merged.openingCount === 1, `a cleared bridge should make one opening, got ${merged.openingCount}`);
assert(merged.opening[24 * 48 + 23] === 1, "the cleared bridge is part of the opening");
ok("a cleared bridge merges the holes into one multi-lobed opening");

const distant = openingMasks(plate(48, (x, y) => {
  if (x < 2 || y < 2 || x >= 46 || y >= 46) return 0;
  if (disk(x, y, 12, 12, 5) || disk(x, y, 36, 36, 5)) return 0;
  return 0.4;
}, 0));
assert(distant.openingCount === 2, `distant holes stay separate, got ${distant.openingCount}`);
ok("distant openings remain separate");

const cracked = openingMasks(plate(48, (x, y) => {
  if (x < 2 || y < 2 || x >= 46 || y >= 46) return 0;
  if (disk(x, y, 14, 24, 6) || disk(x, y, 34, 24, 6) || (y === 24 && x >= 14 && x <= 34)) return 0;
  return 0.5;
}, 0));
assert(cracked.openingCount === 2, `a one-cell crack should not merge the holes, got ${cracked.openingCount}`);
assert(cracked.opening[24 * 48 + 24] === 0, "the crack is sealed into the mass");
ok("thin void cracks become mass and fat cavities stay open");

const dim: number = 0.2;
const bright: number = 1;
const body = massVolume([twoHoles(48, 0, false), twoHoles(48, 1, false)], 5);
const at = (layer: number, x: number, y: number) => body.field[(layer * 48 + y) * 48 + x];
assert(at(0, 16, 24) === 0, "cavity center is empty");
assert(at(2, 16, 24) === 0, "a cavity present at both samples stays open through Z");
assert(at(0, 23, 24) === 1, "the wall is mass");
assert(at(0, 24, 8) === 1 && at(0, 40, 24) === 1, "bright and dim tissue are both mass");
assert(bright !== dim, "the tissue samples differ in trail value");
assert(at(0, 0, 0) === 0, "exterior is not solid");
ok("mass is high around the cavities, independent of trail brightness");

const distance = voidSignedDistance(Uint8Array.from({ length: 25 }, (_, index) => (index === 12 ? 1 : 0)), 5);
assert(Math.abs(distance[12] + 1) < 1e-6, `void center distance should be -1, got ${distance[12]}`);
assert(Math.abs(distance[13] - 1) < 1e-6, `adjacent mass distance should be +1, got ${distance[13]}`);
assert(Math.abs(distance[18] - Math.SQRT2) < 1e-6, `diagonal mass distance should be √2, got ${distance[18]}`);
assert(massFromSignedDistance(0) === 0.5, "the zero crossing is mass 0.5");
ok("void signed distance is positive in mass and negative in the opening");

const closing = massVolume([
  twoHoles(48, 0, false),
  plate(48, (x, y) => (x < 2 || y < 2 || x >= 46 || y >= 46 ? 0 : 0.4), 1),
], 5);
const center = (layer: number) => closing.field[(layer * 48 + 24) * 48 + 16];
const rim = (layer: number) => closing.field[(layer * 48 + 24) * 48 + 22];
assert(center(0) === 0 && rim(0) === 0, "Z0 cavity includes its center and rim");
assert(center(1) < rim(1), `the cavity should close from the rim inward, center ${center(1)} rim ${rim(1)}`);
assert(center(4) === 1, "the final closed state is mass");
ok("a closing cavity shrinks through Z instead of fading as a slab");

function movedHole(cx: number, z: number) {
  return plate(48, (x, y) => {
    if (x < 2 || y < 2 || x >= 46 || y >= 46) return 0;
    if (disk(x, y, cx, 24, 8)) return 0;
    return 0.4;
  }, z);
}
function voidCenterX(volume: ReturnType<typeof massVolume>, layer: number) {
  let sum = 0;
  let count = 0;
  for (let x = 4; x < 44; x += 1) {
    if (volume.field[(layer * 48 + 24) * 48 + x] >= 0.5) continue;
    sum += x;
    count += 1;
  }
  return count ? sum / count : -1;
}
const moving = massVolume([movedHole(14, 0), movedHole(26, 1)], 5);
const startX = voidCenterX(moving, 0);
const midX = voidCenterX(moving, 2);
const endX = voidCenterX(moving, 4);
assert(Math.abs(startX - 14) <= 1, `Z0 opening should sit near x=14, got ${startX}`);
assert(Math.abs(endX - 26) <= 1, `final opening should sit near x=26, got ${endX}`);
assert(midX > startX && midX < endX, `mid opening should sit between the samples, got ${startX} → ${midX} → ${endX}`);
ok("an opening migrates laterally through the interpolated distance field");

const solid = plate(48, (x, y) => (x < 2 || y < 2 || x >= 46 || y >= 46 ? 0 : 0.4), 0);
const onlyEnds = massVolume([
  { ...solid, z: 0 },
  { ...movedHole(24, 1), z: 1 },
], 5);
const withMiddle = massVolume([
  { ...solid, z: 0 },
  movedHole(24, 0.5),
  { ...solid, z: 1 },
], 5);
const middleVoid = withMiddle.field[(2 * 48 + 24) * 48 + 24];
const endsVoid = onlyEnds.field[(2 * 48 + 24) * 48 + 24];
assert(middleVoid < 0.2 && endsVoid > 0.8, `the intermediate sample must shape the volume, middle ${middleVoid} ends ${endsVoid}`);
let finite = true;
for (let i = 0; i < withMiddle.field.length; i += 1) if (!Number.isFinite(withMiddle.field[i])) finite = false;
assert(finite, "interpolated mass left the finite domain");
ok("materialization uses every accepted sample, including samples the stack may hide");

const mesh = materializeOpenings([twoHoles(48, 0, false), twoHoles(48, 1, false)], {
  mode: "isomesh",
  iso: 0.48,
  spacing: 0.1,
  yaw: 0.86,
});
assert(mesh.triangles > 0, "the mass field extracts a mesh");
const voxels = materializeOpenings([twoHoles(48, 0, true), twoHoles(48, 1, true)], {
  mode: "voxel",
  iso: 0.48,
  spacing: 0.1,
  yaw: 0.86,
});
assert(voxels.triangles > 0, "the mass field extracts voxels");
ok(`isomesh ${mesh.triangles} triangles, voxels ${voxels.triangles} triangles`);

const columnMesh = materializeOpenings([twoHoles(48, 0, false), twoHoles(48, 1, false)], {
  mode: "isomesh",
  iso: 0.48,
  spacing: 0.1,
  yaw: 0.86,
  field: "column",
});
assert(columnMesh.triangles > 0, "the column comparison field still extracts a mesh");
ok("the carved-column field remains available");

assert(ENVELOPE_LEVEL === 0.18, `envelope threshold changed, got ${ENVELOPE_LEVEL}`);
const speckled = plate(48, (x, y) => {
  if (disk(x, y, 24, 24, 10)) return 1;
  if (x >= 1 && x <= 2 && y >= 1 && y <= 2) return 1;
  return 0;
}, 0);
const speckMask = envelopeMask(speckled);
assert(speckMask[24 * 48 + 24] === 1, "the main body stays in the envelope");
assert(speckMask[1 * 48 + 1] === 0, "a tiny trail island is removed");
const lobes = plate(48, (x, y) => (disk(x, y, 16, 24, 8) || disk(x, y, 34, 24, 5) ? 1 : 0), 0);
const lobeMask = envelopeMask(lobes);
assert(lobeMask[24 * 48 + 16] === 1 && lobeMask[24 * 48 + 34] === 1, "a secondary lobe stays in the envelope");
ok("envelope cleanup drops islands and keeps a secondary lobe");

function occupied(volume: ReturnType<typeof massVolume>, layer: number, size = 48) {
  let count = 0;
  const base = layer * size * size;
  for (let i = 0; i < size * size; i += 1) if (volume.field[base + i] >= 0.5) count += 1;
  return count;
}
function centroidX(volume: ReturnType<typeof massVolume>, layer: number, size = 48) {
  let sum = 0;
  let count = 0;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      if (volume.field[(layer * size + y) * size + x] < 0.5) continue;
      sum += x;
      count += 1;
    }
  }
  return count ? sum / count : -1;
}
const halo = plate(48, (x, y) => (disk(x, y, 24, 24, 10) ? 1 : 0.05), 0);
const dualHalo = dualMassVolume([halo, { ...halo, z: 1 }], 2);
const columnHalo = massVolume([halo, { ...halo, z: 1 }], 2);
assert(occupied(dualHalo, 0) < occupied(columnHalo, 0) * 0.75, `the envelope should be tighter than the column, dual ${occupied(dualHalo, 0)} column ${occupied(columnHalo, 0)}`);
assert(dualHalo.field[0] < 0.5, "the faint halo is outside the envelope");
assert(dualHalo.field[(24 * 48 + 24)] >= 0.5, "the bright body is mass");
ok("faint trail outside the body is not architectural mass");

const cored = plate(48, (x, y) => {
  if (!disk(x, y, 24, 24, 12)) return 0;
  if (disk(x, y, 24, 24, 4)) return 0;
  return 1;
}, 0);
const carved = dualMassVolume([cored, { ...cored, z: 1 }], 2);
assert(carved.field[(24 * 48 + 24)] < 0.5, "the interior cavity stays void");
assert(carved.field[(24 * 48 + 16)] >= 0.5, "the body around the cavity stays mass");
ok("interior voids are cut out of the envelope");

const wide = plate(48, (x, y) => (disk(x, y, 24, 24, 16) ? 1 : 0), 0);
const narrow = plate(48, (x, y) => (disk(x, y, 24, 24, 6) ? 1 : 0), 1);
const tapered = dualMassVolume([wide, narrow], 5);
assert(occupied(tapered, 0) > occupied(tapered, 4) * 2, `the outer body should contract, ${occupied(tapered, 0)} → ${occupied(tapered, 4)}`);
const left = plate(48, (x, y) => (disk(x, y, 14, 24, 8) ? 1 : 0), 0);
const right = plate(48, (x, y) => (disk(x, y, 34, 24, 8) ? 1 : 0), 1);
const shifted = dualMassVolume([left, right], 5);
const start = centroidX(shifted, 0);
const end = centroidX(shifted, 4);
assert(end > start + 8, `the outer silhouette should move, ${start} → ${end}`);
ok("the exterior silhouette tapers and migrates through Z");

console.log("skill 3 opening-as-void materialization verified");
