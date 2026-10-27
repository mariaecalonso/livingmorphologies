/**
 * Isolated SDF section prototype. Not imported by the app.
 * Does not replace the sectional generator and does not write catalog tests.
 * Run: npx tsx lib/skill4/run-sdf-prototype.ts
 */
import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { generateCandidateField } from "./candidate-field";
import type { FaceId } from "./contract";
import { extractFaceProfile } from "./face-profile";
import { generateHybridField } from "./generated-hybrid-field";
import { HYBRID_GENERATOR_SETTINGS } from "./hybrid-generator";
import { SECTIONAL_GENERATOR_SETTINGS } from "./section-hybrid";
import { loadSkill3HandoffRecords } from "./skill3-handoff";
import { loadModuleMap } from "./tiles";

type Ready = Extract<ReturnType<typeof loadModuleMap> extends Map<string, infer V> ? V : never, { status: "ready" }>;
type Loop = { u: number; v: number }[];
const GRID = 88;
const FACES: FaceId[] = ["N", "S", "E", "W", "T", "B"];

function largestLoop(module: Ready, face: FaceId, depth: number): Loop | null {
  const frame = module.faces[face];
  const profile = extractFaceProfile(module.geometry, frame, depth);
  const loop = profile.loops.filter((item) => item.closed && item.points.length >= 8)
    .sort((left, right) => right.points.length - left.points.length)[0];
  return loop ? loop.points.map((point) => ({ u: point.u, v: point.v })) : null;
}

function sectionDepths(module: Ready, face: FaceId): number[] | null {
  let far = 0;
  for (let depth = 0.12; depth < 22; depth += 0.28) {
    if (largestLoop(module, face, depth)) far = depth;
    else if (far > 0.4) break;
  }
  if (far < 0.5) return null;
  return [0, 1, 2, 3, 4].map((index) => 0.08 + (far - 0.08) * (index / 4));
}

function cuts(module: Ready, face: FaceId): Loop[] | null {
  const depths = sectionDepths(module, face);
  if (!depths) return null;
  const loops = depths.map((depth) => largestLoop(module, face, depth));
  return loops.every((loop): loop is Loop => loop !== null) ? loops : null;
}

function radial(loop: Loop, bins = 36): number[] {
  const center = centroid(loop);
  const values = Array.from({ length: bins }, () => 0);
  loop.forEach((point) => {
    const angle = Math.atan2(point.v - center.v, point.u - center.u);
    const bin = Math.round(((angle + Math.PI) / (Math.PI * 2)) * bins) % bins;
    values[bin] = Math.max(values[bin], Math.hypot(point.u - center.u, point.v - center.v));
  });
  return values;
}

function centroid(loop: Loop) {
  const count = Math.max(1, loop.length);
  return {
    u: loop.reduce((sum, point) => sum + point.u, 0) / count,
    v: loop.reduce((sum, point) => sum + point.v, 0) / count,
  };
}

function signatureDistance(left: number[], right: number[]) {
  let total = 0;
  for (let index = 0; index < left.length; index += 1) total += (left[index] - right[index]) ** 2;
  return Math.sqrt(total / left.length);
}

type Field = { values: Float32Array; minU: number; minV: number; span: number };

function boundsOf(loops: Loop[]) {
  let minU = Infinity;
  let minV = Infinity;
  let maxU = -Infinity;
  let maxV = -Infinity;
  loops.flat().forEach((point) => {
    minU = Math.min(minU, point.u);
    minV = Math.min(minV, point.v);
    maxU = Math.max(maxU, point.u);
    maxV = Math.max(maxV, point.v);
  });
  const pad = Math.max(0.4, (Math.max(maxU - minU, maxV - minV)) * 0.18);
  return { minU: minU - pad, minV: minV - pad, span: Math.max(maxU - minU, maxV - minV) + pad * 2 };
}

function raster(loop: Loop, box: { minU: number; minV: number; span: number }) {
  const inside = new Uint8Array(GRID * GRID);
  for (let y = 0; y < GRID; y += 1) {
    const v = box.minV + ((y + 0.5) / GRID) * box.span;
    const hits: number[] = [];
    for (let index = 0; index < loop.length; index += 1) {
      const a = loop[index];
      const b = loop[(index + 1) % loop.length];
      if ((a.v > v) === (b.v > v) || a.v === b.v) continue;
      const t = (v - a.v) / (b.v - a.v);
      if (t >= 0 && t <= 1) hits.push(a.u + (b.u - a.u) * t);
    }
    hits.sort((left, right) => left - right);
    for (let pair = 0; pair + 1 < hits.length; pair += 2) {
      const start = Math.max(0, Math.floor(((hits[pair] - box.minU) / box.span) * GRID));
      const end = Math.min(GRID - 1, Math.ceil(((hits[pair + 1] - box.minU) / box.span) * GRID));
      for (let x = start; x <= end; x += 1) inside[y * GRID + x] = 1;
    }
  }
  const boundary: { x: number; y: number }[] = [];
  for (let y = 1; y < GRID - 1; y += 1) {
    for (let x = 1; x < GRID - 1; x += 1) {
      const here = inside[y * GRID + x];
      if (here !== inside[y * GRID + x - 1] || here !== inside[y * GRID + x + 1] || here !== inside[(y - 1) * GRID + x] || here !== inside[(y + 1) * GRID + x]) {
        boundary.push({ x, y });
      }
    }
  }
  const values = new Float32Array(GRID * GRID);
  for (let y = 0; y < GRID; y += 1) {
    for (let x = 0; x < GRID; x += 1) {
      let best = 1e9;
      for (const point of boundary) best = Math.min(best, (point.x - x) ** 2 + (point.y - y) ** 2);
      const distance = Math.sqrt(best) * (box.span / GRID);
      values[y * GRID + x] = inside[y * GRID + x] ? -distance : distance;
    }
  }
  return { values, minU: box.minU, minV: box.minV, span: box.span } satisfies Field;
}

function extrapolate(sections: Field[], steps: number): Field {
  const recent = sections[0];
  const previous = sections[Math.min(1, sections.length - 1)];
  const values = new Float32Array(GRID * GRID);
  for (let index = 0; index < values.length; index += 1) {
    values[index] = recent.values[index] + (recent.values[index] - previous.values[index]) * steps;
  }
  return { ...recent, values };
}

function negotiate(left: Field, right: Field, keep: "union" | "average"): Field {
  const values = new Float32Array(GRID * GRID);
  for (let index = 0; index < values.length; index += 1) {
    values[index] = keep === "union"
      ? Math.min(left.values[index], right.values[index])
      : (left.values[index] + right.values[index]) * 0.5;
  }
  return { ...left, values };
}

function contour(field: Field): Loop {
  const points: Loop = [];
  const at = (x: number, y: number) => field.values[y * GRID + x];
  for (let y = 0; y < GRID - 1; y += 1) {
    for (let x = 0; x < GRID - 1; x += 1) {
      const a = at(x, y);
      const b = at(x + 1, y);
      const c = at(x + 1, y + 1);
      const d = at(x, y + 1);
      const edges: { u: number; v: number }[] = [];
      const cross = (value: number, next: number, x0: number, y0: number, x1: number, y1: number) => {
        if ((value < 0) === (next < 0)) return;
        const t = value / (value - next);
        edges.push({
          u: field.minU + ((x0 + (x1 - x0) * t) / GRID) * field.span,
          v: field.minV + ((y0 + (y1 - y0) * t) / GRID) * field.span,
        });
      };
      cross(a, b, x, y, x + 1, y);
      cross(b, c, x + 1, y, x + 1, y + 1);
      cross(c, d, x + 1, y + 1, x, y + 1);
      cross(d, a, x, y + 1, x, y);
      if (edges.length >= 2) points.push(edges[0], edges[1]);
    }
  }
  return points;
}

function paint(field: Field, tint: [number, number, number]) {
  const rgb = new Uint8Array(GRID * GRID * 3);
  rgb.fill(14);
  for (let index = 0; index < field.values.length; index += 1) {
    if (field.values[index] < 0) {
      rgb[index * 3] = tint[0];
      rgb[index * 3 + 1] = tint[1];
      rgb[index * 3 + 2] = tint[2];
    }
  }
  return rgb;
}

function blit(target: Uint8Array, targetWidth: number, source: Uint8Array, x: number, y: number) {
  for (let row = 0; row < GRID; row += 1) {
    for (let col = 0; col < GRID; col += 1) {
      const from = (row * GRID + col) * 3;
      const to = ((y + row) * targetWidth + (x + col)) * 3;
      target[to] = source[from];
      target[to + 1] = source[from + 1];
      target[to + 2] = source[from + 2];
    }
  }
}

function png(width: number, height: number, rgb: Uint8Array) {
  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const start = y * (width * 3 + 1);
    raw[start] = 0;
    rgb.subarray(y * width * 3, (y + 1) * width * 3).forEach((value, index) => { raw[start + 1 + index] = value; });
  }
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const chunk = (type: string, data: Buffer) => {
    const body = Buffer.concat([Buffer.from(type), data]);
    const head = Buffer.alloc(4);
    head.writeUInt32BE(data.length);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body) >>> 0);
    return Buffer.concat([head, body, crc]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 2;
  return Buffer.concat([signature, chunk("IHDR", header), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

function crc32(buffer: Buffer) {
  let crc = ~0;
  for (const value of buffer) {
    crc ^= value;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return ~crc;
}

function faceWeight() {
  const count = SECTIONAL_GENERATOR_SETTINGS.rings;
  let face = 0;
  for (let station = 0; station < count; station += 1) {
    const t = station / (count - 1);
    const edge = 0.24;
    const ramp = t <= 0.001 || t >= 0.999 ? 0 : t < edge ? t / edge : t > 1 - edge ? (1 - t) / edge : 1;
    const body = ramp * ramp * (3 - 2 * ramp);
    face += 1 - body;
  }
  return face / count;
}

function middleSignature(mesh: { positions: Float32Array }, samples: number, rings: number) {
  const station = Math.floor(rings / 2);
  const points: Loop = [];
  for (let index = 0; index < samples; index += 1) {
    const offset = (station * samples + index) * 3;
    points.push({ u: mesh.positions[offset], v: mesh.positions[offset + 2] });
  }
  return radial(points);
}

async function main() {
  const loaded = loadModuleMap(loadSkill3HandoffRecords());
  const ready = [...loaded.values()].filter((item): item is Ready => item.status === "ready" && !!item.geometry && !!item.identity);
  const options: { module: Ready; face: FaceId; loops: Loop[] }[] = [];
  ready.forEach((module) => {
    FACES.forEach((face) => {
      const loops = cuts(module, face);
      if (loops) options.push({ module, face, loops });
    });
  });
  let best: { a: typeof options[0]; b: typeof options[0]; score: number } | null = null;
  for (const a of options) {
    for (const b of options) {
      if (a.module.moduleId === b.module.moduleId) continue;
      const score = signatureDistance(radial(a.loops[0]), radial(b.loops[0])) + signatureDistance(radial(a.loops[0]), radial(a.loops[4])) + signatureDistance(radial(b.loops[0]), radial(b.loops[4]));
      if (!best || score > best.score) best = { a, b, score };
    }
  }
  if (!best) throw new Error("No section pair.");
  const box = boundsOf([...best.a.loops, ...best.b.loops]);
  const fieldsA = best.a.loops.map((loop) => raster(loop, box));
  const fieldsB = best.b.loops.map((loop) => raster(loop, box));
  const familyDistance = signatureDistance(radial(best.a.loops[0]), radial(medianLoop(best.a.loops)));
  const deepDistance = signatureDistance(radial(best.a.loops[0]), radial(best.a.loops[4]));
  const h01 = [0.25, 0.7, 1.15, 1.6].map((step) => extrapolate(fieldsA, step));
  const h25 = [0.25, 0.7, 1.15, 1.6].map((step) => extrapolate(fieldsB, step));
  const h13 = [
    extrapolate(fieldsA, 0.35),
    extrapolate(fieldsA, 0.9),
    negotiate(extrapolate(fieldsA, 0.7), extrapolate(fieldsB, 0.7), "union"),
    extrapolate(fieldsB, 0.9),
    extrapolate(fieldsB, 0.35),
  ];
  const averaged = [negotiate(extrapolate(fieldsA, 0.5), extrapolate(fieldsB, 0.5), "average")];
  const columns = 5;
  const rows = 6;
  const sheet = new Uint8Array(columns * GRID * rows * GRID * 3);
  sheet.fill(8);
  best.a.loops.forEach((_, index) => blit(sheet, columns * GRID, paint(fieldsA[index], [214, 214, 208]), index * GRID, 0));
  best.b.loops.forEach((_, index) => blit(sheet, columns * GRID, paint(fieldsB[index], [186, 186, 180]), index * GRID, GRID));
  h01.forEach((field, index) => blit(sheet, columns * GRID, paint(field, [46, 150, 146]), index * GRID, GRID * 2));
  h13.forEach((field, index) => blit(sheet, columns * GRID, paint(field, [120, 150, 130]), index * GRID, GRID * 3));
  h25.forEach((field, index) => blit(sheet, columns * GRID, paint(field, [198, 126, 92]), index * GRID, GRID * 4));
  blit(sheet, columns * GRID, paint(averaged[0], [120, 120, 120]), 0, GRID * 5);
  const inputs = generateCandidateField({
    signature: "sdf-prototype",
    faceA: best.a.face,
    faceB: best.b.face,
    moduleA: best.a.module,
    moduleB: best.b.module,
  });
  const production = inputs.ok ? generateHybridField({
    moduleA: best.a.module,
    moduleB: best.b.module,
    faceA: best.a.face,
    faceB: best.b.face,
    candidateField: inputs.field,
    settings: HYBRID_GENERATOR_SETTINGS,
  }) : null;
  const samples = SECTIONAL_GENERATOR_SETTINGS.samples;
  const rings = SECTIONAL_GENERATOR_SETTINGS.rings;
  const signatures = ["H01", "H13", "H25"].map((id) => {
    const chosen = production?.candidates.find((candidate) => candidate.candidateId === id);
    return chosen?.geometry ? middleSignature(chosen.geometry, samples, rings) : null;
  });
  const directory = join(process.cwd(), "data", "experiments", "skill4-sdf-prototype");
  mkdirSync(directory, { recursive: true });
  writeFileSync(join(directory, "comparison-sheet.png"), png(columns * GRID, rows * GRID, sheet));
  const report = {
    pair: {
      a: `${best.a.module.identity.name} ${best.a.face}`,
      b: `${best.b.module.identity.name} ${best.b.face}`,
    },
    activeGenerator: SECTIONAL_GENERATOR_SETTINGS.version,
    nearFaceWeightOfCurrentBody: Number(faceWeight().toFixed(3)),
    parentASection0ToDeepRadiusDistance: Number(deepDistance.toFixed(3)),
    parentASection0ToMedianRadiusDistance: Number(familyDistance.toFixed(3)),
    medianCapturesDeepChange: deepDistance > 1e-4 ? Number((familyDistance / deepDistance).toFixed(3)) : null,
    productionMiddleCorrelation: {
      h01h13: signatures[0] && signatures[1] ? Number(correlate(signatures[0], signatures[1]).toFixed(3)) : null,
      h13h25: signatures[1] && signatures[2] ? Number(correlate(signatures[1], signatures[2]).toFixed(3)) : null,
      h01h25: signatures[0] && signatures[2] ? Number(correlate(signatures[0], signatures[2]).toFixed(3)) : null,
    },
    sheet: "row1 A1→A5, row2 B1→B5, row3 H01 A-extrapolation, row4 H13 union negotiation, row5 H25 B-extrapolation, row6 early average",
  };
  writeFileSync(join(directory, "report.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}

function medianLoop(loops: Loop[]): Loop {
  const count = Math.min(...loops.map((loop) => loop.length));
  const result: Loop = [];
  for (let index = 0; index < count; index += 1) {
    const u = loops.map((loop) => loop[Math.floor((index / count) * loop.length)].u).sort((left, right) => left - right);
    const v = loops.map((loop) => loop[Math.floor((index / count) * loop.length)].v).sort((left, right) => left - right);
    result.push({ u: u[Math.floor(u.length / 2)], v: v[Math.floor(v.length / 2)] });
  }
  return result;
}

function correlate(left: number[], right: number[]) {
  const meanL = left.reduce((sum, value) => sum + value, 0) / left.length;
  const meanR = right.reduce((sum, value) => sum + value, 0) / right.length;
  let num = 0;
  let denL = 0;
  let denR = 0;
  for (let index = 0; index < left.length; index += 1) {
    const a = left[index] - meanL;
    const b = right[index] - meanR;
    num += a * b;
    denL += a * a;
    denR += b * b;
  }
  return denL > 1e-8 && denR > 1e-8 ? num / Math.sqrt(denL * denR) : 0;
}

void main();
