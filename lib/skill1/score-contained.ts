import { readArchitecture } from "./architecture";
import { sampleField, trailPeak } from "./engine";
import { TRAIL_SCALE } from "./maps";
import { encodePng } from "./score-void";
import type { ArchitectureReading, BiologicalTranslation, SimulationState } from "./types";

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

export type ContainedScore = {
  seed: number;
  score: number;
  magneticCore: number;
  isolatedAttractor: number;
  immersiveCore: number;
  corridor: number;
  coreTrail: number;
  ringTrail: number;
  farTrail: number;
  rooms: number;
  mass: number;
  questions: {
    enclosed: boolean;
    isolated: boolean;
    immersive: boolean;
  };
};

function meanAnnulus(
  field: number[],
  size: number,
  cx: number,
  cy: number,
  inner: number,
  outer: number,
  skip?: { x: number; y: number; r: number },
) {
  let sum = 0;
  let count = 0;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const dist = Math.hypot(x - cx, y - cy);
      if (dist < inner || dist > outer) continue;
      if (skip && Math.hypot(x - skip.x, y - skip.y) < skip.r) continue;
      sum += field[y * size + x];
      count += 1;
    }
  }
  return count ? sum / count : 0;
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
      if (Math.hypot(x - state.attractor.x, y - state.attractor.y) < 2.6) continue;
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

export function scoreContainedRoom(
  state: SimulationState,
  translation: BiologicalTranslation,
): ContainedScore {
  const reading = readArchitecture(state, translation);
  const peak = Math.max(trailPeak(state), 0.04);
  const occ = state.occupancy.map((value) => value / peak);
  const coreTrail = meanAnnulus(occ, state.size, state.attractor.x, state.attractor.y, 0, 2.2);
  const ringTrail = meanAnnulus(occ, state.size, state.attractor.x, state.attractor.y, 3.0, 6.2);
  const farTrail = meanAnnulus(occ, state.size, state.attractor.x, state.attractor.y, 7.0, 14, {
    x: state.source.x,
    y: state.source.y,
    r: 2.2,
  });
  const coreInterior = meanAnnulus(
    reading.occupancy,
    state.size,
    state.attractor.x,
    state.attractor.y,
    0,
    2.2,
  );
  const ringMass = meanAnnulus(
    reading.massField ?? reading.occupancy,
    state.size,
    state.attractor.x,
    state.attractor.y,
    3.0,
    6.5,
  );
  const farMass = meanAnnulus(
    reading.occupancy,
    state.size,
    state.attractor.x,
    state.attractor.y,
    7.0,
    14,
    { x: state.source.x, y: state.source.y, r: 2.2 },
  );
  const corridor = corridorRatio(state);
  const rooms = reading.rooms.length;
  const packed = rooms / (state.size * state.size);

  const magneticCore =
    clamp01(coreTrail * 2.4) *
    clamp01(coreInterior * 2.1) *
    clamp01(rooms / 12) *
    clamp01((70 - Math.abs(rooms - 28)) / 70);

  const isolatedAttractor =
    clamp01(0.2 + ringMass * 1.6) *
    clamp01(1.12 - packed * 2.2) *
    clamp01(coreInterior * 1.5) *
    (rooms > 8 && rooms < 80 ? 1 : 0.2);

  const immersiveCore =
    clamp01(0.35 + coreTrail * 1.8) *
    clamp01(1.05 - farTrail * 2.2) *
    clamp01(1.08 - Math.max(0, corridor - 0.55) * 1.1) *
    clamp01(coreInterior * 1.3);

  const score =
    magneticCore * 34 +
    isolatedAttractor * 28 +
    immersiveCore * 22 +
    clamp01(1.05 - Math.max(0, corridor - 0.5)) * 10 +
    clamp01(rooms / 36) * 6;

  return {
    seed: state.seed,
    score: Number(score.toFixed(2)),
    magneticCore: Number(magneticCore.toFixed(3)),
    isolatedAttractor: Number(isolatedAttractor.toFixed(3)),
    immersiveCore: Number(immersiveCore.toFixed(3)),
    corridor: Number(corridor.toFixed(3)),
    coreTrail: Number(coreTrail.toFixed(3)),
    ringTrail: Number(ringTrail.toFixed(3)),
    farTrail: Number(farTrail.toFixed(3)),
    rooms,
    mass: reading.floors.length,
    questions: {
      enclosed: magneticCore >= 0.32 && rooms >= 10 && coreTrail > 0.1,
      isolated: rooms >= 10 && rooms <= 70 && ringMass > 0.1 && packed < 0.28,
      immersive: immersiveCore >= 0.3 && coreTrail > 0.1,
    },
  };
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

export function renderContainedFrame(
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
      const angleW =
        1 + 0.22 * Math.cos(angle * 2.15 + 0.35) + 0.12 * Math.cos(angle * 5.0 + n * 7);
      const coreR = keep * (0.8 + n * 0.38) * angleW;
      const volR =
        (keep * 0.88 + translation.recipe.enclosureCollar * 0.68 + translation.recipe.clustering * 0.3) *
        angleW *
        (1.04 - n * 0.1);
      let r = 8;
      let g = 10;
      let b = 14;
      if (dist < coreR) {
        const glow = Math.min(1, 0.62 + n * 0.55);
        r = Math.round(236 + 19 * glow);
        g = Math.round(142 + 48 * glow);
        b = Math.round(62 + 28 * n);
      } else if (dist < volR) {
        const shell = Math.min(1, 0.4 + n * 0.7);
        r = Math.round(118 + shell * 92);
        g = Math.round(64 + shell * 48);
        b = Math.round(36 + shell * 22);
      } else if (n > 0.28) {
        r = 96;
        g = 58;
        b = 38;
      }
      setPixel(rgba, width, half + px, py, r, g, b, 255);
    }
  }
  for (let y = 0; y < height; y += 1) {
    setPixel(rgba, width, half, y, 18, 28, 36, 255);
  }
  return rgba;
}

export { encodePng };
