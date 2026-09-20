import { deflateSync } from "node:zlib";
import { readArchitecture } from "./architecture";
import { sampleField, trailPeak } from "./engine";
import { TRAIL_SCALE } from "./maps";
import type { ArchitectureReading, BiologicalTranslation, SimulationState } from "./types";

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

export type VoidScore = {
  seed: number;
  score: number;
  exposedCore: number;
  isolatedAnchor: number;
  expansiveCommons: number;
  corridor: number;
  doughnut: number;
  coreTrail: number;
  ringTrail: number;
  primaryVoids: number;
  satelliteVoids: number;
  mass: number;
  questions: {
    openCore: boolean;
    isolated: boolean;
    expansive: boolean;
  };
};

function meanAnnulus(
  field: number[],
  size: number,
  cx: number,
  cy: number,
  inner: number,
  outer: number,
) {
  let sum = 0;
  let count = 0;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const dist = Math.hypot(x - cx, y - cy);
      if (dist < inner || dist > outer) continue;
      sum += field[y * size + x];
      count += 1;
    }
  }
  return count ? sum / count : 0;
}

function ringContinuity(
  occupancy: number[],
  size: number,
  cx: number,
  cy: number,
  inner: number,
  outer: number,
) {
  const bins = 16;
  const filled = new Array<number>(bins).fill(0);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const dist = Math.hypot(x - cx, y - cy);
      if (dist < inner || dist > outer) continue;
      const angle = Math.atan2(y - cy, x - cx);
      const bin = Math.min(bins - 1, Math.floor(((angle + Math.PI) / (Math.PI * 2)) * bins));
      filled[bin] += occupancy[y * size + x];
    }
  }
  return filled.filter((value) => value > 0.55).length / bins;
}

function corridorRatio(state: SimulationState) {
  const peak = trailPeak(state);
  const size = state.size;
  let on = 0;
  let off = 0;
  let onN = 0;
  let offN = 0;
  const dx = state.attractor.x - state.source.x;
  const dy = state.attractor.y - state.source.y;
  const len = Math.hypot(dx, dy) || 1;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const t = ((x - state.source.x) * dx + (y - state.source.y) * dy) / (len * len);
      const px = state.source.x + dx * Math.min(1, Math.max(0, t));
      const py = state.source.y + dy * Math.min(1, Math.max(0, t));
      const d = Math.hypot(x - px, y - py);
      const v = (state.occupancy[y * size + x] ?? 0) / peak;
      if (d < 1.6) {
        on += v;
        onN += 1;
      } else {
        off += v;
        offN += 1;
      }
    }
  }
  const a = onN ? on / onN : 0;
  const b = offN ? off / offN : 0.0001;
  return a / (a + b);
}

export function scoreVoidField(
  state: SimulationState,
  translation: BiologicalTranslation,
): VoidScore {
  const reading = readArchitecture(state, translation);
  const peak = Math.max(trailPeak(state), 0.04);
  const occ = state.occupancy.map((value) => value / peak);
  const coreTrail = meanAnnulus(occ, state.size, state.attractor.x, state.attractor.y, 0, 2.1);
  const ringTrail = meanAnnulus(occ, state.size, state.attractor.x, state.attractor.y, 3.2, 6.8);
  const farTrail = meanAnnulus(occ, state.size, state.attractor.x, state.attractor.y, 7.2, 14);
  const coreMass = meanAnnulus(
    reading.occupancy,
    state.size,
    state.attractor.x,
    state.attractor.y,
    0,
    2.1,
  );
  const ringMass = meanAnnulus(
    reading.occupancy,
    state.size,
    state.attractor.x,
    state.attractor.y,
    3.0,
    6.5,
  );
  const doughnut = ringContinuity(
    reading.occupancy,
    state.size,
    state.attractor.x,
    state.attractor.y,
    3.0,
    6.4,
  );
  const corridor = corridorRatio(state);
  const primary = reading.primaryVoids.length;
  const satellite = Math.max(0, reading.voids.length - primary);
  const packed = reading.floors.length / (state.size * state.size);

  const exposedCore =
    clamp01(1 - coreMass * 3.2) *
    clamp01(1 - coreTrail * 2.2) *
    clamp01(primary / 18) *
    clamp01((160 - Math.abs(primary - 72)) / 160);

  const isolatedAnchor =
    clamp01(1 - coreMass * 4.2) *
    clamp01(ringMass / Math.max(0.05, coreMass + 0.05) / 3.2) *
    (primary > 12 ? 1 : 0.18);

  const expansiveCommons =
    clamp01(satellite / 90) *
    clamp01(1.08 - packed) *
    clamp01(1.15 - corridor) *
    clamp01(0.4 + farTrail * 2.8 + ringTrail * 0.35) *
    (reading.primaryVoids.length > 20 ? 1 : 0.4);

  const score =
    exposedCore * 34 +
    isolatedAnchor * 28 +
    expansiveCommons * 22 +
    (1 - corridor) * 10 +
    clamp01(satellite / 140) * 6;

  return {
    seed: state.seed,
    score: Number(score.toFixed(2)),
    exposedCore: Number(exposedCore.toFixed(3)),
    isolatedAnchor: Number(isolatedAnchor.toFixed(3)),
    expansiveCommons: Number(expansiveCommons.toFixed(3)),
    corridor: Number(corridor.toFixed(3)),
    doughnut: Number(doughnut.toFixed(3)),
    coreTrail: Number(coreTrail.toFixed(3)),
    ringTrail: Number(ringTrail.toFixed(3)),
    primaryVoids: primary,
    satelliteVoids: satellite,
    mass: reading.floors.length,
    questions: {
      openCore: exposedCore >= 0.38 && primary >= 16 && coreMass < 0.22,
      isolated: isolatedAnchor >= 0.4 && coreMass < 0.18,
      expansive: satellite >= 90 && packed < 0.58 && corridor < 0.6,
    },
  };
}

function crc32(buffer: Buffer) {
  let crc = 0xffffffff;
  for (let i = 0; i < buffer.length; i += 1) {
    crc ^= buffer[i];
    for (let j = 0; j < 8; j += 1) {
      const take = crc & 1;
      crc = take ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer) {
  const header = Buffer.from(type);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([header, data])), 0);
  return Buffer.concat([length, header, data, crc]);
}

export function encodePng(width: number, height: number, rgba: Uint8Array) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (width * 4 + 1)] = 0;
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 4;
      const o = y * (width * 4 + 1) + 1 + x * 4;
      raw[o] = rgba[i];
      raw[o + 1] = rgba[i + 1];
      raw[o + 2] = rgba[i + 2];
      raw[o + 3] = rgba[i + 3];
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 6 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function setPixel(
  rgba: Uint8Array,
  width: number,
  x: number,
  y: number,
  r: number,
  g: number,
  b: number,
  a = 255,
) {
  if (x < 0 || y < 0 || x >= width) return;
  const i = (y * width + x) * 4;
  if (i < 0 || i + 3 >= rgba.length) return;
  const na = a / 255;
  rgba[i] = Math.round(rgba[i] * (1 - na) + r * na);
  rgba[i + 1] = Math.round(rgba[i + 1] * (1 - na) + g * na);
  rgba[i + 2] = Math.round(rgba[i + 2] * (1 - na) + b * na);
  rgba[i + 3] = 255;
}

export function renderVoidFrame(
  state: SimulationState,
  _reading: ArchitectureReading,
  translation: BiologicalTranslation,
  width = 960,
  height = 480,
) {
  const rgba = new Uint8Array(width * height * 4);
  for (let i = 0; i < rgba.length; i += 4) {
    rgba[i] = 7;
    rgba[i + 1] = 16;
    rgba[i + 2] = 24;
    rgba[i + 3] = 255;
  }
  const half = Math.floor(width / 2);
  const peak = trailPeak(state);
  const ts = state.trailSize;
  const cell = Math.min(half, height) / ts;
  for (let y = 0; y < ts; y += 1) {
    for (let x = 0; x < ts; x += 1) {
      const n = Math.sqrt(state.trails[y * ts + x] / peak);
      if (n < 0.04) continue;
      const px = Math.floor(x * cell);
      const py = Math.floor((ts - 1 - y) * cell);
      const r = n > 0.46 ? 255 : 148;
      const g = n > 0.46 ? 224 : 196;
      const b = n > 0.46 ? 90 : 52;
      const a = Math.min(255, 36 + n * 220);
      const span = Math.max(1, Math.ceil(cell));
      for (let oy = 0; oy < span; oy += 1) {
        for (let ox = 0; ox < span; ox += 1) {
          setPixel(rgba, width, px + ox, py + oy, r, g, b, a);
        }
      }
    }
  }
  for (let i = 0; i < state.agents.length; i += 2) {
    const agent = state.agents[i];
    const px = Math.floor((agent.x / state.size) * half);
    const py = Math.floor((1 - agent.y / state.size) * height);
    setPixel(rgba, width, px, py, 255, 236, 140, 230);
  }
  const sx = Math.floor((state.source.x / state.size) * half);
  const sy = Math.floor((1 - state.source.y / state.size) * height);
  for (let a = 0; a < 40; a += 1) {
    const t = (a / 40) * Math.PI * 2;
    setPixel(
      rgba,
      width,
      Math.round(sx + Math.cos(t) * 5),
      Math.round(sy + Math.sin(t) * 5),
      180,
      230,
      255,
      220,
    );
  }

  const panel = Math.min(half, height);
  const keep = translation.recipe.isolationRadius;
  for (let py = 0; py < panel; py += 1) {
    for (let px = 0; px < panel; px += 1) {
      const fx = (px / panel) * state.size;
      const fy = (1 - py / panel) * state.size;
      const trail = sampleField(
        state.trails,
        { x: fx * TRAIL_SCALE, y: fy * TRAIL_SCALE },
        state.trailSize,
      );
      const n = Math.sqrt(Math.max(0, trail / peak));
      const dx = fx - state.attractor.x;
      const dy = fy - state.attractor.y;
      const dist = Math.hypot(dx, dy);
      const angle = Math.atan2(dy, dx);
      const wobble = 1 + 0.16 * Math.cos(angle * 2.15) + 0.09 * Math.cos(angle * 5.4 + 0.6);
      const coreR = keep * 0.5 * wobble;
      let r = 8;
      let g = 8;
      let b = 10;
      if (dist < coreR) {
        r = g = b = 4;
      } else if (n > 0.36) {
        const lit = Math.round(158 + Math.min(1, n) * 88);
        r = g = b = lit;
      } else if (n > 0.18) {
        r = g = b = 102;
      }
      setPixel(rgba, width, half + px, py, r, g, b, 255);
    }
  }
  for (let y = 0; y < height; y += 1) {
    setPixel(rgba, width, half, y, 18, 28, 36, 255);
  }
  return rgba;
}
