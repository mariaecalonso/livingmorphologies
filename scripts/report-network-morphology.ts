import { deflateSync } from "node:zlib";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { deriveAdaptiveScale } from "../lib/skill3/adaptive-scale";
import { materializeOpenings, type VoidSample } from "../lib/skill3/materialize";
import { buildNetworkVolume, networkMargin, networkMorphologyNotes } from "../lib/skill3/network-morphology";
import { branchSampledFutures } from "../lib/skill3/futures";
import { toVerticalViewerField, type VerticalViewerField } from "../lib/skill3/viewer-field";

const assert = (condition: boolean, message: string) => {
  if (!condition) throw new Error(message);
};

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

function bar(x: number, y: number, x0: number, x1: number, y0: number) {
  return x >= x0 && x <= x1 && y >= y0 && y <= y0 + 1 ? 1 : 0;
}

function fieldAt(field: Float32Array, grid: number, x: number, y: number, zNorm: number) {
  const margin = networkMargin();
  const span = grid - 1 - 2 * margin;
  const fx = Math.round(margin + (x / (grid - 1)) * span);
  const fy = Math.round(margin + (y / (grid - 1)) * span);
  const fz = Math.round(margin + zNorm * span);
  return field[(fz * grid + fy) * grid + fx];
}

function massCount(field: Float32Array, z0: number, z1: number, grid: number) {
  let count = 0;
  for (let z = z0; z <= z1; z += 1) {
    for (let i = 0; i < grid * grid; i += 1) if (field[z * grid * grid + i] >= 0.5) count += 1;
  }
  return count;
}

const grid = 64;
const shifted = buildNetworkVolume([
  plate(grid, (x, y) => bar(x, y, 10, 22, 32), 0),
  plate(grid, (x, y) => bar(x, y, 34, 46, 32), 1),
]);
assert(fieldAt(shifted.field, grid, 18, 32, 0.08) >= 0.5, "the lower bar is mass");
assert(fieldAt(shifted.field, grid, 40, 32, 0.92) >= 0.5, "the upper bar is mass");
assert(fieldAt(shifted.field, grid, 28, 32, 0.5) >= 0.5, "a shifted bar bridges diagonally through Z");
assert(shifted.stats.componentsAfter === 1, `shifted bar left ${shifted.stats.componentsAfter} bodies`);
console.log("ok  shifting activity connects diagonally");

const fading = buildNetworkVolume([
  plate(grid, (x, y) => bar(x, y, 16, 40, 20), 0),
  plate(grid, () => 0, 1),
]);
const lowMass = massCount(fading.field, 6, 18, grid);
const highMass = massCount(fading.field, 46, 57, grid);
assert(lowMass > 20, "a disappearing vein still has mass where it was active");
assert(highMass === 0, `a disappearing vein should taper out, high band has ${highMass}`);
console.log("ok  disappearing activity tapers");

const porous = buildNetworkVolume([
  plate(grid, (x, y) => bar(x, y, 12, 52, 16) + bar(x, y, 12, 52, 46), 0),
  plate(grid, (x, y) => bar(x, y, 12, 52, 16) + bar(x, y, 12, 52, 46), 1),
]);
assert(fieldAt(porous.field, grid, 32, 16, 0.5) >= 0.5, "each vein stays mass");
assert(fieldAt(porous.field, grid, 32, 31, 0.5) < 0.5, "the cavity between veins stays open");
assert(porous.stats.footprint < 0.2, `two veins filled ${porous.stats.footprint.toFixed(3)} of the plan`);
console.log("ok  separated veins keep a cavity");

const solid = buildNetworkVolume([
  plate(grid, (x, y) => {
    const dx = x - 32;
    const dy = y - 32;
    const radius = Math.hypot(dx, dy);
    return radius >= 8 && radius <= 13 ? 1 : 0;
  }, 0),
  plate(grid, (x, y) => {
    const dx = x - 32;
    const dy = y - 32;
    const radius = Math.hypot(dx, dy);
    return radius >= 8 && radius <= 13 ? 1 : 0;
  }, 1),
]);
assert(fieldAt(solid.field, grid, 32, 32, 0.5) < 0.5, "the chamber inside a trail ring stays open");
assert(fieldAt(solid.field, grid, 32, 43, 0.5) >= 0.5, "the trail ring itself stays mass");
console.log("ok  a trail chamber stays open");

const reinforced = buildNetworkVolume([
  plate(grid, (x, y) => (bar(x, y, 20, 44, 30) ? 1 : 0), 0),
  plate(grid, (x, y) => (bar(x, y, 20, 44, 30) ? 0.28 : 0), 1),
]);
const thick = massCount(reinforced.field, 8, 20, grid);
const thin = massCount(reinforced.field, 44, 56, grid);
assert(thick > thin, `reinforced activity should be thicker (${thick} vs ${thin})`);
console.log("ok  reinforced activity is thicker");

const mesh = materializeOpenings(
  [plate(grid, (x, y) => bar(x, y, 12, 50, 28), 0), plate(grid, (x, y) => bar(x, y, 12, 50, 36), 1)],
  { mode: "isomesh", iso: 0.48, spacing: 0.1, yaw: 0.86, sizeZ: 20, field: "network" },
);
let outside = 0;
let maxAbs = 0;
for (let i = 0; i < mesh.positions.length; i += 1) {
  maxAbs = Math.max(maxAbs, Math.abs(mesh.positions[i]));
  if (Math.abs(mesh.positions[i]) > 10.001) outside += 1;
}
assert(mesh.triangles > 100, "the isosurface should produce a mesh");
assert(outside === 0, `${outside} vertices fall outside the module`);
console.log(`ok  isosurface stays inside the module (${mesh.triangles} triangles, max ${maxAbs.toFixed(2)})`);

if (process.argv.includes("--synthetic")) {
  console.log("synthetic checks passed");
  process.exit(0);
}

const CACHE = "tmp/network-hall-300.json";
const PREVIEW = "tmp/network-hall-300";

function loadFields(): { fields: VerticalViewerField[]; scaleDirection: string; finalScale: number; scaleStrength: number } {
  if (existsSync(CACHE) && !process.argv.includes("--resimulate")) {
    return JSON.parse(readFileSync(CACHE, "utf8"));
  }
  const branched = branchSampledFutures({ archetypeId: "continuous-hall", candidateId: 300 });
  const source = branched.handoff.selected.source;
  const plan = deriveAdaptiveScale(source.typologyId, source.ratings);
  const payload = {
    fields: branched.futures.map((future) => toVerticalViewerField(future.sampling, future.id)),
    scaleDirection: plan.scaleDirection,
    finalScale: plan.finalScale,
    scaleStrength: plan.scaleStrength,
  };
  mkdirSync(dirname(CACHE), { recursive: true });
  writeFileSync(CACHE, JSON.stringify(payload));
  return payload;
}

function crc32(buffer: Buffer) {
  let crc = ~0;
  for (let i = 0; i < buffer.length; i += 1) {
    crc ^= buffer[i];
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return ~crc >>> 0;
}

function pngChunk(type: string, data: Buffer) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

function writePng(file: string, width: number, height: number, rgb: Uint8Array) {
  const raw = Buffer.alloc(height * (1 + width * 3));
  for (let y = 0; y < height; y += 1) {
    const row = y * (1 + width * 3);
    raw[row] = 0;
    for (let x = 0; x < width * 3; x += 1) raw[row + 1 + x] = rgb[(y * width) * 3 + x];
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const png = Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(raw)),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, png);
}

function writeProjections(file: string, field: Float32Array, resolution: number) {
  const scale = 4;
  const side = resolution * scale;
  const gap = 8;
  const width = side * 3 + gap * 2;
  const height = side;
  const rgb = new Uint8Array(width * height * 3);
  const shade = (solid: number, steps: number) => {
    const t = 1 - Math.exp(-solid / Math.max(1, steps) * 7.5);
    return Math.round(255 * Math.pow(t, 0.72));
  };
  const paint = (origin: number, sample: (x: number, y: number) => number) => {
    for (let py = 0; py < side; py += 1) {
      for (let px = 0; px < side; px += 1) {
        const gray = shade(sample(Math.min(resolution - 1, Math.floor(px / scale)), Math.min(resolution - 1, Math.floor((side - 1 - py) / scale))), resolution);
        const index = ((py * width) + origin + px) * 3;
        rgb[index] = Math.min(255, Math.round(gray * 1.02));
        rgb[index + 1] = Math.round(gray * 0.98);
        rgb[index + 2] = Math.round(gray * 0.9);
      }
    }
  };
  const at = (x: number, y: number, z: number) => (field[(z * resolution + y) * resolution + x] >= 0.5 ? 1 : 0);
  paint(0, (x, z) => {
    let solid = 0;
    for (let y = 0; y < resolution; y += 1) solid += at(x, y, z);
    return solid;
  });
  paint(side + gap, (y, z) => {
    let solid = 0;
    for (let x = 0; x < resolution; x += 1) solid += at(x, y, z);
    return solid;
  });
  paint(side * 2 + gap * 2, (x, y) => {
    let solid = 0;
    for (let z = 0; z < resolution; z += 1) solid += at(x, y, z);
    return solid;
  });
  writePng(file, width, height, rgb);
}

function wrapPi(delta: number) {
  let value = delta;
  while (value > Math.PI / 2) value -= Math.PI;
  while (value < -Math.PI / 2) value += Math.PI;
  return value;
}

function meshBands(positions: Float32Array) {
  const collect = (y0: number, y1: number) => {
    let count = 0;
    let x = 0;
    let z = 0;
    for (let i = 0; i < positions.length; i += 3) {
      const py = positions[i + 1];
      if (py < y0 || py > y1) continue;
      x += positions[i];
      z += positions[i + 2];
      count += 1;
    }
    if (!count) return { count: 0, angle: 0, radius: 0 };
    x /= count;
    z /= count;
    let xx = 0;
    let zz = 0;
    let xz = 0;
    let radius = 0;
    for (let i = 0; i < positions.length; i += 3) {
      const py = positions[i + 1];
      if (py < y0 || py > y1) continue;
      const dx = positions[i] - x;
      const dz = positions[i + 2] - z;
      xx += dx * dx;
      zz += dz * dz;
      xz += dx * dz;
      radius += positions[i] * positions[i] + positions[i + 2] * positions[i + 2];
    }
    return { count, angle: 0.5 * Math.atan2(2 * xz, xx - zz), radius: Math.sqrt(radius / count) };
  };
  return { low: collect(-8, -3), high: collect(3, 8) };
}

const loaded = loadFields();
const notes = networkMorphologyNotes();
console.log("\ncontinuous-hall candidate 300");
console.log(`F04 plan: ${loaded.scaleDirection}, strength ${loaded.scaleStrength.toFixed(3)}, final scale ${loaded.finalScale.toFixed(3)}`);
console.log(`activity: ${notes.activityRule}`);
console.log(`connection: ${notes.connection}`);
console.log(`thickening: ${notes.thickening}`);

const summaries: Array<Record<string, number | string>> = [];
for (const field of loaded.fields) {
  const built = buildNetworkVolume(field.slices);
  const started = Date.now();
  const iso = materializeOpenings(field.slices, {
    mode: "isomesh",
    iso: 0.48,
    spacing: 0.1,
    yaw: 0.86,
    sizeZ: 20,
    field: "network",
  });
  const meshMs = Date.now() - started;
  let outside = 0;
  let maxAbs = 0;
  for (let i = 0; i < iso.positions.length; i += 1) {
    maxAbs = Math.max(maxAbs, Math.abs(iso.positions[i]));
    if (Math.abs(iso.positions[i]) > 10.001) outside += 1;
  }
  const bands = meshBands(iso.positions);
  const first = built.stats.plates[0];
  const last = built.stats.plates[built.stats.plates.length - 1];
  const meanCoverage = built.stats.plates.reduce((sum, plate) => sum + plate.coverage, 0) / built.stats.plates.length;
  writeProjections(`${PREVIEW}/${field.lineage.futureId}.png`, built.field, built.nx);
  const summary = {
    future: field.lineage.futureId,
    samples: built.stats.acceptedSamples,
    iterations: field.slices.map((slice) => slice.iteration).join(","),
    reference: Number(built.stats.reference.toFixed(4)),
    meanCoverage: Number(meanCoverage.toFixed(3)),
    cores: built.stats.plates.map((plate) => plate.cores).join(","),
    segments: built.stats.segments,
    tapered: built.stats.tapered,
    triangles: iso.triangles,
    components: built.stats.componentsAfter,
    droppedFragments: built.stats.droppedFragments,
    outside,
    maxAbs: Number(maxAbs.toFixed(3)),
    occupancy: Number(built.stats.occupancy.toFixed(3)),
    footprint: Number(built.stats.footprint.toFixed(3)),
    columnFill: Number(built.stats.meanColumnFill.toFixed(3)),
    plateAngleDeg: Number((wrapPi(last.angle - first.angle) * 180 / Math.PI).toFixed(1)),
    meshAngleDeg: Number((wrapPi(bands.high.angle - bands.low.angle) * 180 / Math.PI).toFixed(1)),
    plateRadius: `${first.radius.toFixed(2)}→${last.radius.toFixed(2)}`,
    meshRadius: `${bands.low.radius.toFixed(2)}→${bands.high.radius.toFixed(2)}`,
    buildMs: built.stats.buildMs,
    meshMs,
  };
  summaries.push(summary);
  console.log(`\n${field.lineage.futureId}`);
  console.log(JSON.stringify(summary, null, 2));
}

const byId = Object.fromEntries(summaries.map((item) => [item.future, item]));
console.log("\ncomparison");
console.log(JSON.stringify({
  f01: byId.F01,
  f02triangles: byId.F02?.triangles,
  f03meshAngle: byId.F03?.meshAngleDeg,
  f01meshAngle: byId.F01?.meshAngleDeg,
  f04meshRadius: byId.F04?.meshRadius,
  f01meshRadius: byId.F01?.meshRadius,
  scaleDirection: loaded.scaleDirection,
  finalScale: loaded.finalScale,
}, null, 2));
