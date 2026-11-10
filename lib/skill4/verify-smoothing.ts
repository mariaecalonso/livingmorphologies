import { revealSmooth, validateMeshes } from "./assembly-validation";
import type { IsoMesh } from "../scan/isomesh";

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const STATIONS = 24;
const SAMPLES = 36;

function tube(shape: (station: number) => { rx: number; ry: number; spin: number; bump: number }): IsoMesh {
  const positions: number[] = [];
  const indices: number[] = [];
  for (let station = 0; station < STATIONS; station += 1) {
    const t = station / (STATIONS - 1);
    const { rx, ry, spin, bump } = shape(station);
    for (let sample = 0; sample < SAMPLES; sample += 1) {
      const angle = (sample / SAMPLES) * Math.PI * 2;
      const localY = Math.cos(angle) * rx + (sample === 4 && bump !== 0 ? bump : 0);
      const localZ = Math.sin(angle) * ry;
      const y = localY * Math.cos(spin) - localZ * Math.sin(spin);
      const z = localY * Math.sin(spin) + localZ * Math.cos(spin);
      positions.push(t * 40, y, z);
    }
  }
  for (let station = 0; station < STATIONS - 1; station += 1) {
    for (let sample = 0; sample < SAMPLES; sample += 1) {
      const a = station * SAMPLES + sample;
      const b = station * SAMPLES + ((sample + 1) % SAMPLES);
      const c = (station + 1) * SAMPLES + sample;
      const d = (station + 1) * SAMPLES + ((sample + 1) % SAMPLES);
      indices.push(a, c, b, b, c, d);
    }
  }
  const positionData = Float32Array.from(positions);
  return {
    positions: positionData,
    normals: new Float32Array(positionData.length),
    indices: Uint32Array.from(indices),
    triangles: indices.length / 3,
  };
}

/** Coarse loft from a soft hexagon into a stepped right-angle profile. */
function steppedAmphitheater(): IsoMesh {
  const stations = 36;
  const step = [
    [1.7, 1.5],
    [1.7, -0.35],
    [0.35, -0.35],
    [0.35, -1.55],
    [-1.7, -1.55],
    [-1.7, 1.5],
  ];
  const hex = step.map((_, index) => {
    const angle = (index / step.length) * Math.PI * 2 - Math.PI / 2;
    return [Math.cos(angle) * 1.8, Math.sin(angle) * 1.15];
  });
  const positions: number[] = [];
  const indices: number[] = [];
  for (let station = 0; station < stations; station += 1) {
    const t = station / (stations - 1);
    const blend = t < 0.18 ? 0 : t > 0.42 ? 1 : (t - 0.18) / 0.24;
    step.forEach((corner, index) => {
      const soft = hex[index];
      const y = soft[0] * (1 - blend) + corner[0] * blend;
      const z = soft[1] * (1 - blend) + corner[1] * blend;
      positions.push(t * 28, y * 2.2, z * 2.2);
    });
  }
  for (let station = 0; station < stations - 1; station += 1) {
    for (let sample = 0; sample < step.length; sample += 1) {
      const a = station * step.length + sample;
      const b = station * step.length + ((sample + 1) % step.length);
      const c = (station + 1) * step.length + sample;
      const d = (station + 1) * step.length + ((sample + 1) % step.length);
      indices.push(a, c, b, b, c, d);
    }
  }
  const positionData = Float32Array.from(positions);
  return {
    positions: positionData,
    normals: new Float32Array(positionData.length),
    indices: Uint32Array.from(indices),
    triangles: indices.length / 3,
  };
}

function middleRadius(mesh: IsoMesh) {
  const start = 12 * SAMPLES * 3;
  let total = 0;
  for (let sample = 0; sample < SAMPLES; sample += 1) {
    const offset = start + sample * 3;
    total += Math.hypot(mesh.positions[offset + 1], mesh.positions[offset + 2]);
  }
  return total / SAMPLES;
}

function endDrift(before: Float32Array, after: Float32Array) {
  let end = 0;
  const shared = Math.min(before.length, after.length) / 3;
  for (let index = 0; index < shared; index += 1) {
    const station = Math.floor(index / SAMPLES);
    if (station !== 0 && station !== STATIONS - 1) continue;
    const offset = index * 3;
    end = Math.max(end, Math.hypot(after[offset] - before[offset], after[offset + 1] - before[offset + 1], after[offset + 2] - before[offset + 2]));
  }
  return end;
}

function manifold(indices: Uint32Array) {
  const counts = new Map<string, number>();
  for (let triangle = 0; triangle < indices.length; triangle += 3) {
    const ids = [indices[triangle], indices[triangle + 1], indices[triangle + 2]];
    assert(new Set(ids).size === 3, "collapsed face");
    for (let edge = 0; edge < 3; edge += 1) {
      const a = ids[edge];
      const b = ids[(edge + 1) % 3];
      const key = a < b ? `${a}:${b}` : `${b}:${a}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  for (const count of counts.values()) assert(count === 1 || count === 2, "nonmanifold edge");
}

const smooth = tube(() => ({ rx: 6, ry: 2.6, spin: 0, bump: 0 }));
const twisted = tube((station) => {
  const t = station / (STATIONS - 1);
  const band = Math.exp(-((t - 0.5) ** 2) / 0.02);
  return { rx: 6, ry: 2.6, spin: band * 1.15, bump: 0 };
});
const pinched = tube((station) => {
  const t = station / (STATIONS - 1);
  const tight = t >= 0.5 && t < 0.583;
  return { rx: tight ? 1.7 : 6, ry: tight ? 0.75 : 2.6, spin: 0, bump: 0 };
});
const stepped = steppedAmphitheater();

function untouched(mesh: IsoMesh, original: Float32Array) {
  assert(mesh.positions.length === original.length, "source mesh was replaced");
  for (let index = 0; index < original.length; index += 1) {
    assert(mesh.positions[index] === original[index], "source mesh was edited");
  }
}

const smoothOriginal = new Float32Array(smooth.positions);
const smoothResult = validateMeshes([smooth]);
assert(smoothResult != null, `smooth tube: ${smoothResult?.verdict} ${smoothResult?.note}`);
assert(smoothResult.verdict === "clear", `smooth tube: ${smoothResult.verdict} ${smoothResult.note}`);
assert(smoothResult.meshes[0].smoothed.positions.length === smooth.positions.length, "smooth tube was refined");
assert(smoothResult.displacement === 0, "smooth tube moved");
untouched(smooth, smoothOriginal);

const twistOriginal = new Float32Array(twisted.positions);
const twistResult = validateMeshes([twisted]);
assert(twistResult != null, `twisted: ${twistResult?.verdict} ${twistResult?.note}`);
assert(twistResult.verdict === "corrected", `twisted: ${twistResult.verdict} ${twistResult.note}`);
assert(twistResult.meshes[0].smoothed.positions.length === twisted.positions.length, "twist was refined");
assert(endDrift(twistOriginal, twistResult.meshes[0].smoothed.positions) < 1e-3, "twist moved an end");
untouched(twisted, twistOriginal);
manifold(twistResult.meshes[0].smoothed.indices);

const pinchOriginal = new Float32Array(pinched.positions);
const pinchResult = validateMeshes([pinched]);
assert(pinchResult != null, `pinched: ${pinchResult?.verdict} ${pinchResult?.note}`);
assert(pinchResult.verdict === "corrected", `pinched: ${pinchResult.verdict} ${pinchResult.note}`);
assert(middleRadius(pinchResult.meshes[0].smoothed) > middleRadius(pinched) + 0.4, "pinch was not opened");
assert(pinchResult.meshes[0].smoothed.positions.length === pinched.positions.length, "pinch was refined");
untouched(pinched, pinchOriginal);

const stepOriginal = new Float32Array(stepped.positions);
const stepResult = validateMeshes([stepped]);
assert(stepResult != null, "stepped connection produced no result");
assert(stepResult.verdict === "corrected", `${stepResult.verdict}: ${stepResult.note}`);
assert(stepResult.meshes[0].smoothed.positions.length > stepped.positions.length, "stepped connection was not refined");
assert(stepResult.meshes[0].rest != null, "stepped refinement has no rest pose");
assert(stepResult.before.smoothness < stepResult.after.smoothness, "stepped smoothness did not rise");
assert(stepResult.note.toLowerCase().includes("sharp"), stepResult.note);
untouched(stepped, stepOriginal);
manifold(stepResult.meshes[0].smoothed.indices);
const preview = stepResult.meshes[0];
const shown = revealSmooth(preview, 1);
assert(shown.positions.length === preview.smoothed.positions.length, "preview dropped the refined mesh");
assert(shown.indices.length === preview.smoothed.indices.length, "preview dropped the refined faces");
const midway = revealSmooth(preview, 0.5);
assert(midway.positions.length === shown.positions.length, "scan blend changed the vertex count");
let previewMove = 0;
for (let index = 0; index < shown.positions.length; index += 1) {
  previewMove = Math.max(previewMove, Math.abs(shown.positions[index] - preview.rest!.positions[index]));
}
assert(previewMove > 0.05, "refined preview is still on the coarse surface");

console.log(JSON.stringify({
  smooth: smoothResult.verdict,
  twisted: twistResult.verdict,
  pinched: pinchResult.verdict,
  stepped: {
    verdict: stepResult.verdict,
    before: stepResult.before.smoothness,
    after: stepResult.after.smoothness,
    verts: [stepped.positions.length / 3, stepResult.meshes[0].smoothed.positions.length / 3],
    note: stepResult.note,
  },
}, null, 2));
