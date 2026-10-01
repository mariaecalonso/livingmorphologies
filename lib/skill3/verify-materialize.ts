import { materializeOpenings, massVolume, openingMasks, type VoidSample } from "./materialize";

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

const dim = 0.2;
const bright = 1;
const body = massVolume([twoHoles(48, 0, false), twoHoles(48, 1, false)], 5);
const at = (layer: number, x: number, y: number) => body.field[(layer * 48 + y) * 48 + x];
assert(at(0, 16, 24) === 0, "cavity center is empty");
assert(at(2, 16, 24) === 0, "a cavity present at both samples stays open through Z");
assert(at(0, 23, 24) === 1, "the wall is mass");
assert(at(0, 24, 8) === 1 && at(0, 40, 24) === 1, "bright and dim tissue are both mass");
assert(bright !== dim, "the tissue samples differ in trail value");
assert(at(0, 0, 0) === 0, "exterior is not solid");
ok("mass is high around the cavities, independent of trail brightness");

const closing = massVolume([
  twoHoles(48, 0, false),
  plate(48, (x, y) => (x < 2 || y < 2 || x >= 46 || y >= 46 ? 0 : 0.4), 1),
], 5);
const midHole = closing.field[(2 * 48 + 24) * 48 + 16];
assert(midHole > 0.4 && midHole < 0.6, `a cavity that closes should be partial at mid Z, got ${midHole}`);
ok("void masks interpolate between accepted samples");

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

console.log("skill 3 opening-as-void materialization verified");
