import { ENVELOPE_LEVEL, envelopeReference } from "../skill3/materialize";

export type FilamentCalibration = {
  /** 0 keeps the hair dim. 1 lifts it toward white. */
  white: number;
  /** 0 keeps faint deposits. 1 returns them to the black ground. */
  black: number;
  /** 0 leaves a drafted corner. 1 bends the line into a turn. */
  organic: number;
  /** 0 keeps a thin hair. 1 widens the stroke. */
  thickness: number;
};

/** Starting point for the reference drawing. A saved file replaces it for that archetype. */
export const DEFAULT_FILAMENT: FilamentCalibration = {
  white: 0.72,
  black: 0.34,
  organic: 0.62,
  thickness: 0.62,
};

const clamp01 = (value: number) => Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));

export function normalizeFilamentCalibration(value: Partial<FilamentCalibration> | null | undefined): FilamentCalibration {
  return {
    white: clamp01(value?.white ?? DEFAULT_FILAMENT.white),
    black: clamp01(value?.black ?? DEFAULT_FILAMENT.black),
    organic: clamp01(value?.organic ?? DEFAULT_FILAMENT.organic),
    thickness: clamp01(value?.thickness ?? value?.organic ?? DEFAULT_FILAMENT.thickness),
  };
}

/**
 * Pixel drawing for a filament plate.
 * `scale` is 1 for a full catalogue image. A live preview uses a smaller plate and the same scale,
 * so the stroke keeps the same proportion without redrawing the 1280px original on every slider move.
 */
export function filamentField(pixels: Uint8Array, calibration: FilamentCalibration, scale = 1) {
  const size = Math.round(Math.sqrt(pixels.length));
  const setting = normalizeFilamentCalibration(calibration);
  const radius = setting.thickness < 0.04 ? 1 : Math.max(1, Math.round((1 + setting.thickness * 16) * scale));
  const sigma = (0.45 + setting.thickness * 6.2) * scale;
  let field = gaussian(new Float32Array(pixels), size, radius, sigma);
  const bend = setting.organic * 46 * scale;
  if (bend > 1) field = bendLines(field, size, bend, scale);
  return field;
}

export function toneFilament(field: Float32Array, calibration: FilamentCalibration, scale = 1) {
  const size = Math.round(Math.sqrt(field.length));
  const setting = normalizeFilamentCalibration(calibration);
  const samples: number[] = [];
  for (const value of field) if (value > 0.8) samples.push(value);
  if (samples.length === 0) return new Uint8Array(field.length);
  const hairAt = 0.16 + setting.black * 0.66;
  const rank = Math.min(samples.length - 1, Math.floor(hairAt * (samples.length - 1)));
  const hair = nth(samples, rank) || 1;
  const cap = Math.round(96 + setting.white * 132);
  const gain = 1.05 + setting.white * 2.15;
  const out = new Uint8Array(field.length);
  for (let index = 0; index < field.length; index += 1) {
    const amount = field[index] / hair;
    if (amount <= 0) continue;
    const toned = cap * (1 - Math.exp(-gain * amount));
    if (toned < 1) continue;
    out[index] = Math.min(cap, Math.round(toned));
  }
  quietSquarePads(out, size, cap, scale);
  return out;
}

export function refineFilament(pixels: Uint8Array, calibration: FilamentCalibration, scale = 1) {
  const size = Math.round(Math.sqrt(pixels.length));
  if (size * size !== pixels.length) return pixels;
  let positive = 0;
  for (const value of pixels) if (value > 0) positive += 1;
  if (positive === 0) return pixels;
  return toneFilament(filamentField(pixels, calibration, scale), calibration, scale);
}

const GALLERY_BODY = 256;

/**
 * Linear gallery hair opens the solid stroke into trails that can leave the straight line.
 * The gallery stays. The hairs bow and wander, and only fray a short way past the mass.
 * The search trail is not resimulated.
 */
export function galleryPropagationPlate(pixels: Uint8Array) {
  const size = Math.round(Math.sqrt(pixels.length));
  if (size * size !== pixels.length || size < 32) return pixels;
  const reference = envelopeReference(pixels);
  if (!(reference > 0)) return pixels;
  const flat = markFlat(pixels, size, reference);
  const flow = gaussian(new Float32Array(pixels), size, 5, 2.6);
  const out = new Uint8Array(pixels.length);
  let flats = 0;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const index = y * size + x;
      if (flat[index]) {
        flats += 1;
        continue;
      }
      if (pixels[index] <= 8 || nearFlat(flat, size, x, y, 10)) continue;
      out[index] = pixels[index];
    }
  }
  if (flats < 24) return pixels;
  paintGalleryMass(flat, flow, out, size);
  let kept = 0;
  for (const cell of out) if (cell > 0) kept += 1;
  return kept < 24 ? pixels : out;
}

const HAIR_INK = new Set([
  "topographic-ground-field",
  "stepped-amphitheater",
  "continuous-hall",
  "void-edge",
  "flat-deep-plan",
  "inserted-horizontal-plate",
  "compressed-sequential",
  "linear-gallery",
]);

/** Passes that reach the cap. Matches 0.36 / 0.016. */
const INK_PASSES = 22;
/** One pass in display units. The cap is white; fewer passes stay gray. */
const INK_PASS = Math.round(255 / INK_PASSES);

/** Cache token for a plate redrawn with the hair pen. */
export function hairPlateStamp(archetypeId: string) {
  if (archetypeId === "compressed-sequential") return "hair-ink-2";
  if (archetypeId === "void-edge") return "hair-ink-void-2";
  if (archetypeId === "topographic-ground-field") return "hair-ink-topo-3";
  if (archetypeId === "linear-edge-gallery") return "edge-void-1";
  if (archetypeId === "continuous-hall") return "hall-hairs-3";
  if (archetypeId === "stepped-amphitheater") return "step-hairs-2";
  if (archetypeId === "linear-gallery") return "gallery-hairs-9";
  return HAIR_INK.has(archetypeId) ? "hair-ink-1" : "plate";
}

/**
 * Gallery ink sits between a solid bar and a loose cloud.
 * The bright figure is kept. Isolated loops are left out. Hairs follow that figure and stay apart.
 */
function galleryBetween(pixels: Uint8Array) {
  const size = Math.round(Math.sqrt(pixels.length));
  if (size * size !== pixels.length || size < 32) return pixels;
  const body = denseGalleryBody(pixels, size);
  let mass = 0;
  for (const cell of body) if (cell) mass += 1;
  if (mass < 24) return pixels;
  const flow = gaussian(new Float32Array(pixels), size, 5, 2.4);
  const out = new Uint8Array(pixels.length);
  const owner = new Int32Array(pixels.length);
  const gap = size < 400 ? 5 : 8;
  let walk = 1;
  for (let y = gap; y < size - gap; y += gap) {
    for (let x = gap; x < size - gap; x += gap) {
      const index = y * size + x;
      if (!body[index] || owner[index] !== 0) continue;
      if (hash2(x, y) > 0.86) continue;
      const sign = hash2(x + 2, y + 5) > 0.5 ? 1 : -1;
      walkGalleryHair(out, flow, body, owner, size, x, y, walk, sign);
      walk += 1;
    }
  }
  let kept = 0;
  for (const cell of out) if (cell > 0) kept += 1;
  return kept < 24 ? pixels : out;
}

function denseGalleryBody(pixels: Uint8Array, size: number) {
  const body = new Uint8Array(pixels.length);
  const radius = 3;
  for (let y = radius; y < size - radius; y += 1) {
    for (let x = radius; x < size - radius; x += 1) {
      let sum = 0;
      let bright = 0;
      let count = 0;
      for (let dy = -radius; dy <= radius; dy += 1) {
        const row = (y + dy) * size;
        for (let dx = -radius; dx <= radius; dx += 1) {
          const value = pixels[row + x + dx];
          sum += value;
          if (value > 72) bright += 1;
          count += 1;
        }
      }
      const mean = sum / count;
      if (pixels[y * size + x] > 110 || (mean > 34 && bright > 6)) body[y * size + x] = 1;
    }
  }
  return body;
}

function walkGalleryHair(
  out: Uint8Array,
  flow: Float32Array,
  body: Uint8Array,
  owner: Int32Array,
  size: number,
  x: number,
  y: number,
  walk: number,
  sign: number,
) {
  const tangent = flowTangent(flow, size, x, y, sign);
  let angle = Math.atan2(tangent.y, tangent.x) + (hash2(x * 3, y + sign) - 0.5) * 0.4;
  const length = Math.round(size * (0.07 + hash2(x + sign * 11, y) * 0.14));
  let px = x;
  let py = y;
  let outside = 0;
  for (let move = 0; move < length; move += 1) {
    const ix = Math.round(px);
    const iy = Math.round(py);
    if (ix < 1 || iy < 1 || ix >= size - 1 || iy >= size - 1) break;
    const index = iy * size + ix;
    const inside = body[index] === 1;
    if (!inside) {
      outside += 1;
      if (outside > 6) break;
    } else outside = 0;
    const tone = Math.min(255, 176 + Math.round((inside ? 70 : 28) * hash2(ix + move, iy)));
    if (tone > out[index]) out[index] = tone;
    owner[index] = walk;
    const sideX = -Math.sin(angle);
    const sideY = Math.cos(angle);
    reserveGutter(owner, size, ix + sideX, iy + sideY, walk);
    reserveGutter(owner, size, ix - sideX, iy - sideY, walk);
    const turn = (hash2(ix + move, iy + sign) - 0.5) * 0.16;
    const nextTangent = flowTangent(flow, size, ix, iy, sign);
    const follow = inside ? 0.4 : 0.08;
    const vx = Math.cos(angle + turn) * (1 - follow) + nextTangent.x * follow;
    const vy = Math.sin(angle + turn) * (1 - follow) + nextTangent.y * follow;
    angle = Math.atan2(vy, vx);
    px += Math.cos(angle);
    py += Math.sin(angle);
  }
}

/**
 * Hair ink for a finished search plate.
 * The pen is a thin persistent strand. Solid fills are replaced with those strands.
 * Void edge opens its existing black. Topographic circles gain bowing hairs across the empty ground.
 * The search is not rerun.
 */
export function exploratoryHairPlate(pixels: Uint8Array, archetypeId: string) {
  if (archetypeId === "linear-edge-gallery") return frayEdgeVoids(pixels);
  if (archetypeId === "linear-gallery") return galleryBetween(pixels);
  if (!HAIR_INK.has(archetypeId)) return pixels;
  const drawn = hairInkPlate(pixels, archetypeId === "compressed-sequential");
  if (archetypeId === "continuous-hall") return openHallPens(drawn);
  if (archetypeId === "void-edge") return openVoidThreshold(drawn);
  if (archetypeId === "topographic-ground-field") return weaveTopographic(drawn);
  return drawn;
}

/**
 * Packed hall ink becomes long trails along the same curve.
 * The space between trails stays black, so the stroke does not fuse into a pen.
 */
function openHallPens(pixels: Uint8Array, step = false) {
  const size = Math.round(Math.sqrt(pixels.length));
  if (size * size !== pixels.length || size < 32) return pixels;
  const body = new Uint8Array(pixels.length);
  let mass = 0;
  for (let index = 0; index < pixels.length; index += 1) {
    if (pixels[index] > 12) {
      body[index] = 1;
      mass += 1;
    }
  }
  if (mass < 24) return pixels;
  const flow = gaussian(new Float32Array(pixels), size, 6, 2.8);
  const out = new Uint8Array(pixels.length);
  const owner = new Int32Array(pixels.length);
  const gap = step ? (size < 400 ? 3 : 4) : size < 400 ? 4 : 6;
  const admit = step ? 0.94 : 0.82;
  let walk = 1;
  for (let y = gap; y < size - gap; y += gap) {
    for (let x = gap; x < size - gap; x += gap) {
      const index = y * size + x;
      if (!body[index] || owner[index] !== 0) continue;
      if (hash2(x, y) > admit) continue;
      const sign = hash2(x + 2, y + 5) > 0.5 ? 1 : -1;
      walkHall(out, pixels, flow, body, owner, size, x, y, walk, sign, step);
      walk += 1;
      if (!step) continue;
      walkHall(out, pixels, flow, body, owner, size, x, y, walk, -sign, step);
      walk += 1;
    }
  }
  let kept = 0;
  for (const cell of out) if (cell > 0) kept += 1;
  return kept < 24 ? pixels : out;
}

function walkHall(
  out: Uint8Array,
  source: Uint8Array,
  flow: Float32Array,
  body: Uint8Array,
  owner: Int32Array,
  size: number,
  x: number,
  y: number,
  walk: number,
  sign: number,
  step = false,
) {
  const stepped = step;
  const tangent = flowTangent(flow, size, x, y, sign);
  let angle = Math.atan2(tangent.y, tangent.x) + (hash2(x * 3, y + sign) - 0.5) * (stepped ? 0.18 : 0.55);
  let px = x;
  let py = y;
  const length = Math.round(size * ((stepped ? 0.04 : 0.1) + hash2(x + sign * 11, y) * (stepped ? 0.08 : 0.18)));
  let outside = 0;
  const fringe = stepped ? 5 : 8;
  for (let move = 0; move < length; move += 1) {
    const ix = Math.round(px);
    const iy = Math.round(py);
    if (ix < 1 || iy < 1 || ix >= size - 1 || iy >= size - 1) break;
    const index = iy * size + ix;
    const inside = body[index] === 1;
    if (!inside) {
      outside += 1;
      if (outside > fringe) break;
    } else outside = 0;
    const gutter = !stepped ? false : owner[index] < 0 && owner[index] !== -walk;
    if (!gutter) {
      const tone = Math.min(255, 168 + Math.round((source[index] / 255) * 70));
      if (tone > out[index]) out[index] = tone;
      owner[index] = walk;
      const sideX = -Math.sin(angle);
      const sideY = Math.cos(angle);
      reserveGutter(owner, size, ix + sideX, iy + sideY, walk);
      reserveGutter(owner, size, ix - sideX, iy - sideY, walk);
      if (!stepped) {
        reserveGutter(owner, size, ix + sideX * 2, iy + sideY * 2, walk);
        reserveGutter(owner, size, ix - sideX * 2, iy - sideY * 2, walk);
      }
    }
    const turn = (hash2(ix + move, iy + sign) - 0.5) * (stepped ? 0.1 : 0.14);
    const next = flowTangent(flow, size, ix, iy, sign);
    const follow = inside ? (stepped ? 0.46 : 0.22) : 0.06;
    const headingX = Math.cos(angle + turn);
    const headingY = Math.sin(angle + turn);
    const vx = headingX * (1 - follow) + next.x * follow;
    const vy = headingY * (1 - follow) + next.y * follow;
    angle = Math.atan2(vy, vx);
    px += Math.cos(angle);
    py += Math.sin(angle);
  }
}

function hairInkPlate(pixels: Uint8Array, curve: boolean) {
  const size = Math.round(Math.sqrt(pixels.length));
  if (size * size !== pixels.length || size < 16) return pixels;
  const reference = envelopeReference(pixels);
  if (!(reference > 0)) return pixels;
  const flat = markFlat(pixels, size, reference);
  const flow = gaussian(new Float32Array(pixels), size, 4, 2.2);
  const out = new Uint8Array(pixels.length);
  let flats = 0;
  for (let index = 0; index < pixels.length; index += 1) {
    if (flat[index]) {
      flats += 1;
      continue;
    }
    if (pixels[index] > 8) out[index] = pixels[index];
  }
  if (flats > 24) paintInkHairs(pixels, flat, flow, out, size, curve);
  let kept = 0;
  for (const cell of out) if (cell > 0) kept += 1;
  const drawn = kept < 24 ? pixels : out;
  return curve ? curveStrands(drawn) : drawn;
}

type HairMass = { x: number; y: number; r: number };

/**
 * Each pad links only to its nearest neighbor. A dense bundle of hairs fills that gap.
 */
function weaveTopographic(pixels: Uint8Array) {
  const size = Math.round(Math.sqrt(pixels.length));
  if (size * size !== pixels.length) return pixels;
  const masses = hairMasses(pixels, size);
  if (masses.length < 2) return pixels;
  const out = new Uint8Array(pixels);
  const used = new Set<string>();
  for (let index = 0; index < masses.length; index += 1) {
    let nearest = -1;
    let nearestGap = Infinity;
    for (let other = 0; other < masses.length; other += 1) {
      if (other === index) continue;
      const gap = rimGap(masses[index], masses[other]);
      if (gap < nearestGap) {
        nearestGap = gap;
        nearest = other;
      }
    }
    if (nearest < 0 || nearestGap < size * 0.015 || nearestGap > size * 0.55) continue;
    const from = Math.min(index, nearest);
    const to = Math.max(index, nearest);
    const key = `${from}-${to}`;
    if (used.has(key)) continue;
    used.add(key);
    weavePair(out, size, masses[from], masses[to], from * 17 + to);
  }
  return out;
}

function massDistance(a: HairMass, b: HairMass) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function rimGap(a: HairMass, b: HairMass) {
  return Math.max(0, massDistance(a, b) - a.r - b.r);
}

function weavePair(out: Uint8Array, size: number, a: HairMass, b: HairMass, salt: number) {
  const count = size < 400 ? 40 : 96;
  const aim = Math.atan2(b.y - a.y, b.x - a.x);
  for (let strand = 0; strand < count; strand += 1) {
    const start = bridgePoint(out, size, a, aim, salt + strand * 3);
    const end = bridgePoint(out, size, b, aim + Math.PI, salt + strand * 5 + 1);
    const arrive = hash2(salt, strand) > 0.12;
    paintLoose(out, size, start.x, start.y, end.x, end.y, salt + strand * 11, arrive);
  }
}

function bridgePoint(pixels: Uint8Array, size: number, mass: HairMass, aim: number, salt: number) {
  for (let tryAt = 0; tryAt < 10; tryAt += 1) {
    const angle = aim + (hash2(salt + tryAt, salt) - 0.5) * 1.8;
    const depth = 0.35 + hash2(salt, tryAt + 4) * 0.6;
    const x = Math.round(mass.x + Math.cos(angle) * mass.r * depth);
    const y = Math.round(mass.y + Math.sin(angle) * mass.r * depth);
    if (x < 1 || y < 1 || x >= size - 1 || y >= size - 1) continue;
    if (pixels[y * size + x] > 16) return { x, y };
  }
  return { x: mass.x, y: mass.y };
}

function paintLoose(out: Uint8Array, size: number, x0: number, y0: number, x1: number, y1: number, salt: number, arrive: boolean) {
  const span = Math.hypot(x1 - x0, y1 - y0);
  if (span < 4) return;
  let x = x0;
  let y = y0;
  let angle = Math.atan2(y1 - y0, x1 - x0) + (hash2(salt, 1) - 0.5) * 0.9;
  const drift = (hash2(salt, 2) - 0.5) * 0.03;
  const limit = Math.ceil(span * (arrive ? 1.15 : 0.4 + hash2(salt, 3) * 0.35));
  const extra = arrive ? 18 + Math.floor(hash2(salt, 5) * 36) : 0;
  let arrived = false;
  for (let step = 0; step < limit + extra; step += 1) {
    const dx = x1 - x;
    const dy = y1 - y;
    const remaining = Math.hypot(dx, dy);
    if (!arrived && remaining < 6) arrived = true;
    if (arrived && step > limit) {
      angle += drift + (fieldNoise(x + salt, y + step, 18) - 0.5) * 0.35;
    } else if (!arrived) {
      const aim = Math.atan2(dy, dx);
      const sway = (fieldNoise(x + salt, y, 22) - 0.5) * 0.28;
      angle = blendAngle(angle, aim, arrive ? 0.045 : 0.012) + drift + sway;
    } else break;
    x += Math.cos(angle);
    y += Math.sin(angle);
    const ix = Math.round(x);
    const iy = Math.round(y);
    if (ix < 1 || iy < 1 || ix >= size - 1 || iy >= size - 1) break;
    const index = iy * size + ix;
    const tone = Math.min(255, INK_PASS * (INK_PASSES - 3) + Math.round(hash2(ix, iy + salt) * INK_PASS * 2));
    if (tone > out[index]) out[index] = tone;
  }
}

function blendAngle(from: number, to: number, weight: number) {
  return Math.atan2(
    Math.sin(from) * (1 - weight) + Math.sin(to) * weight,
    Math.cos(from) * (1 - weight) + Math.cos(to) * weight,
  );
}

function hairMasses(pixels: Uint8Array, size: number) {
  const ink = new Uint8Array(pixels.length);
  for (let index = 0; index < pixels.length; index += 1) if (pixels[index] > 18) ink[index] = 1;
  const away = chamfer(ink, size);
  const radius = Math.max(6, size * 0.014);
  const filled = new Uint8Array(pixels.length);
  for (let index = 0; index < away.length; index += 1) if (away[index] <= radius) filled[index] = 1;
  const seen = new Uint8Array(filled.length);
  const stack = new Int32Array(filled.length);
  const members = new Int32Array(filled.length);
  const masses: HairMass[] = [];
  const minInk = Math.floor(size * size * 0.0015);
  for (let start = 0; start < filled.length; start += 1) {
    if (!filled[start] || seen[start]) continue;
    let top = 0;
    let count = 0;
    stack[top] = start;
    top += 1;
    seen[start] = 1;
    while (top > 0) {
      top -= 1;
      const index = stack[top];
      members[count] = index;
      count += 1;
      const x = index % size;
      const y = Math.floor(index / size);
      top = pushCore(filled, seen, stack, top, x > 0 ? index - 1 : -1);
      top = pushCore(filled, seen, stack, top, x + 1 < size ? index + 1 : -1);
      top = pushCore(filled, seen, stack, top, y > 0 ? index - size : -1);
      top = pushCore(filled, seen, stack, top, y + 1 < size ? index + size : -1);
    }
    let inkCount = 0;
    let sx = 0;
    let sy = 0;
    for (let index = 0; index < count; index += 1) {
      const at = members[index];
      if (!ink[at]) continue;
      inkCount += 1;
      sx += at % size;
      sy += Math.floor(at / size);
    }
    if (inkCount < minInk) continue;
    const x = sx / inkCount;
    const y = sy / inkCount;
    let reach = 0;
    let reachCount = 0;
    for (let index = 0; index < count; index += 1) {
      const at = members[index];
      if (!ink[at]) continue;
      reach += Math.hypot((at % size) - x, Math.floor(at / size) - y);
      reachCount += 1;
    }
    masses.push({ x, y, r: Math.max(size * 0.02, (reach / reachCount) * 1.35) });
  }
  return masses;
}

/**
 * Enclosed round voids stay in place. A packed rim is shortened by an uneven
 * amount so the circle ends in loose hairs instead of a cut edge.
 */
function frayEdgeVoids(pixels: Uint8Array) {
  const size = Math.round(Math.sqrt(pixels.length));
  if (size * size !== pixels.length || size < 32) return pixels;
  const holes = roundHoles(pixels, size);
  let any = false;
  for (let index = 0; index < holes.length; index += 1) {
    if (holes[index]) {
      any = true;
      break;
    }
  }
  if (!any) return pixels;
  const fromHole = chamfer(holes, size);
  const band = Math.max(10, size * 0.014);
  const cell = Math.max(18, size / 18);
  const out = new Uint8Array(pixels);
  for (let y = 4; y < size - 4; y += 1) {
    for (let x = 4; x < size - 4; x += 1) {
      const index = y * size + x;
      const dist = fromHole[index];
      if (dist <= 0 || dist > band || pixels[index] < 24) continue;
      if (!packedRim(pixels, size, x, y)) continue;
      const stream = fieldNoise(x, y, cell);
      const fine = fieldNoise(x + size * 0.17, y - size * 0.09, cell * 0.45);
      if (dist < band * (0.2 + stream * 0.55 + fine * 0.2)) out[index] = 0;
    }
  }
  return out;
}

function packedRim(pixels: Uint8Array, size: number, x: number, y: number) {
  let ink = 0;
  let count = 0;
  for (let dy = -4; dy <= 4; dy += 1) {
    const row = (y + dy) * size;
    for (let dx = -4; dx <= 4; dx += 1) {
      count += 1;
      if (pixels[row + x + dx] > 36) ink += 1;
    }
  }
  return ink > count * 0.58;
}

function roundHoles(pixels: Uint8Array, size: number) {
  const ink = new Uint8Array(pixels.length);
  for (let index = 0; index < pixels.length; index += 1) if (pixels[index] > 20) ink[index] = 1;
  const sealed = new Uint8Array(pixels.length);
  const seal = 4;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      if (!ink[y * size + x]) continue;
      const y0 = Math.max(0, y - seal);
      const y1 = Math.min(size - 1, y + seal);
      const x0 = Math.max(0, x - seal);
      const x1 = Math.min(size - 1, x + seal);
      for (let yy = y0; yy <= y1; yy += 1) {
        const row = yy * size;
        for (let xx = x0; xx <= x1; xx += 1) sealed[row + xx] = 1;
      }
    }
  }
  const dark = new Uint8Array(pixels.length);
  for (let index = 0; index < pixels.length; index += 1) if (!sealed[index]) dark[index] = 1;
  const seen = new Uint8Array(dark.length);
  const out = new Uint8Array(dark.length);
  const stack = new Int32Array(dark.length);
  const members = new Int32Array(dark.length);
  const minArea = Math.floor(size * size * 0.01);
  for (let start = 0; start < dark.length; start += 1) {
    if (!dark[start] || seen[start]) continue;
    let top = 0;
    let count = 0;
    let border = false;
    stack[top] = start;
    top += 1;
    seen[start] = 1;
    let sx = 0;
    let sy = 0;
    while (top > 0) {
      top -= 1;
      const index = stack[top];
      members[count] = index;
      count += 1;
      const x = index % size;
      const y = Math.floor(index / size);
      sx += x;
      sy += y;
      if (x === 0 || y === 0 || x === size - 1 || y === size - 1) border = true;
      top = pushCore(dark, seen, stack, top, x > 0 ? index - 1 : -1);
      top = pushCore(dark, seen, stack, top, x + 1 < size ? index + 1 : -1);
      top = pushCore(dark, seen, stack, top, y > 0 ? index - size : -1);
      top = pushCore(dark, seen, stack, top, y + 1 < size ? index + size : -1);
    }
    if (border || count < minArea || count > size * size * 0.4) continue;
    const cx = sx / count;
    const cy = sy / count;
    let radius = 0;
    for (let index = 0; index < count; index += 1) {
      const x = members[index] % size;
      const y = Math.floor(members[index] / size);
      radius += Math.hypot(x - cx, y - cy);
    }
    radius /= count;
    if (radius < size * 0.02) continue;
    let spread = 0;
    for (let index = 0; index < count; index += 1) {
      const x = members[index] % size;
      const y = Math.floor(members[index] / size);
      const delta = Math.hypot(x - cx, y - cy) - radius;
      spread += delta * delta;
    }
    if (Math.sqrt(spread / count) / radius > 0.42) continue;
    for (let index = 0; index < count; index += 1) out[members[index]] = 1;
  }
  return out;
}

function openVoidThreshold(pixels: Uint8Array) {
  const size = Math.round(Math.sqrt(pixels.length));
  if (size * size !== pixels.length) return pixels;
  const ink = new Uint8Array(pixels.length);
  let inkCount = 0;
  for (let index = 0; index < pixels.length; index += 1) {
    if (pixels[index] > 16) {
      ink[index] = 1;
      inkCount += 1;
    }
  }
  if (inkCount < 24) return pixels;
  const away = chamfer(ink, size);
  const coreAt = Math.max(8, size * 0.02);
  const core = new Uint8Array(pixels.length);
  for (let index = 0; index < away.length; index += 1) {
    if (away[index] > coreAt && away[index] < size) core[index] = 1;
  }
  const voids = keepLargeCores(core, size, Math.floor(size * size * 0.0035));
  let any = false;
  for (let index = 0; index < voids.length; index += 1) {
    if (voids[index]) {
      any = true;
      break;
    }
  }
  if (!any) return pixels;
  const fromVoid = chamfer(voids, size);
  let bandScale = 1;
  let out = pixels;
  const streamCell = Math.max(24, size / 7);
  for (let pass = 0; pass < 2; pass += 1) {
    out = new Uint8Array(pixels);
    let removed = 0;
    const inner = coreAt * 0.4;
    for (let y = 0; y < size; y += 1) {
      const row = y * size;
      for (let x = 0; x < size; x += 1) {
        const index = row + x;
        const tone = pixels[index];
        if (tone < 8) continue;
        const stream = fieldNoise(x, y, streamCell);
        const drift = fieldNoise(x + size * 0.2, y - size * 0.11, streamCell * 0.55);
        const band = size * (0.2 + stream * 0.06) * bandScale;
        const across = Math.min(1, Math.max(0, (fromVoid[index] - inner) / band));
        if (across >= 1) continue;
        const factor = Math.min(1, Math.max(0, (across * (0.7 + 0.55 * stream) - drift * 0.18) / 0.62));
        if (factor <= 0) {
          out[index] = 0;
          if (tone > 16) removed += 1;
          continue;
        }
        out[index] = Math.round(tone * (0.3 + 0.7 * factor));
      }
    }
    if (removed < inkCount * 0.38 || pass === 1) break;
    bandScale *= 0.6;
  }
  return out;
}

function fieldNoise(x: number, y: number, cell: number) {
  const x0 = Math.floor(x / cell);
  const y0 = Math.floor(y / cell);
  const fx = x / cell - x0;
  const fy = y / cell - y0;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const n00 = hash2(x0, y0);
  const n10 = hash2(x0 + 1, y0);
  const n01 = hash2(x0, y0 + 1);
  const n11 = hash2(x0 + 1, y0 + 1);
  const nx0 = n00 + (n10 - n00) * sx;
  const nx1 = n01 + (n11 - n01) * sx;
  return nx0 + (nx1 - nx0) * sy;
}

function chamfer(seed: Uint8Array, size: number) {
  const dist = new Float32Array(size * size);
  const far = size * 4;
  for (let index = 0; index < seed.length; index += 1) dist[index] = seed[index] ? 0 : far;
  const diagonal = 1.414;
  for (let y = 0; y < size; y += 1) {
    const row = y * size;
    for (let x = 0; x < size; x += 1) {
      const index = row + x;
      let next = dist[index];
      if (x > 0) next = Math.min(next, dist[index - 1] + 1);
      if (y > 0) next = Math.min(next, dist[index - size] + 1);
      if (x > 0 && y > 0) next = Math.min(next, dist[index - size - 1] + diagonal);
      if (x + 1 < size && y > 0) next = Math.min(next, dist[index - size + 1] + diagonal);
      dist[index] = next;
    }
  }
  for (let y = size - 1; y >= 0; y -= 1) {
    const row = y * size;
    for (let x = size - 1; x >= 0; x -= 1) {
      const index = row + x;
      let next = dist[index];
      if (x + 1 < size) next = Math.min(next, dist[index + 1] + 1);
      if (y + 1 < size) next = Math.min(next, dist[index + size] + 1);
      if (x + 1 < size && y + 1 < size) next = Math.min(next, dist[index + size + 1] + diagonal);
      if (x > 0 && y + 1 < size) next = Math.min(next, dist[index + size - 1] + diagonal);
      dist[index] = next;
    }
  }
  return dist;
}

function keepLargeCores(core: Uint8Array, size: number, minArea: number) {
  const seen = new Uint8Array(core.length);
  const out = new Uint8Array(core.length);
  const stack = new Int32Array(core.length);
  const members = new Int32Array(core.length);
  for (let start = 0; start < core.length; start += 1) {
    if (!core[start] || seen[start]) continue;
    let top = 0;
    let count = 0;
    stack[top] = start;
    top += 1;
    seen[start] = 1;
    while (top > 0) {
      top -= 1;
      const index = stack[top];
      members[count] = index;
      count += 1;
      const x = index % size;
      const y = Math.floor(index / size);
      top = pushCore(core, seen, stack, top, x > 0 ? index - 1 : -1);
      top = pushCore(core, seen, stack, top, x + 1 < size ? index + 1 : -1);
      top = pushCore(core, seen, stack, top, y > 0 ? index - size : -1);
      top = pushCore(core, seen, stack, top, y + 1 < size ? index + size : -1);
    }
    if (count < minArea) continue;
    for (let index = 0; index < count; index += 1) out[members[index]] = 1;
  }
  return out;
}

function pushCore(core: Uint8Array, seen: Uint8Array, stack: Int32Array, top: number, index: number) {
  if (index < 0 || !core[index] || seen[index]) return top;
  seen[index] = 1;
  stack[top] = index;
  return top + 1;
}

/** Long strands along the gallery. Each strand keeps the gallery line and bows off it. */
function paintGalleryMass(flat: Uint8Array, flow: Float32Array, out: Uint8Array, size: number) {
  const gap = size < 400 ? 4 : 7;
  const owner = new Int32Array(flat.length);
  let walk = 1;
  for (let y = 2; y < size - 2; y += gap) {
    for (let x = 2; x < size - 2; x += gap) {
      const index = y * size + x;
      if (!flat[index] || owner[index] !== 0) continue;
      if (hash2(x, y) > 0.72) continue;
      const sign = hash2(x + 4, y) > 0.5 ? 1 : -1;
      walkGallery(out, flow, flat, owner, size, x, y, walk, sign);
      walk += 1;
    }
  }
}

function nearFlat(flat: Uint8Array, size: number, x: number, y: number, radius: number) {
  const y0 = Math.max(0, y - radius);
  const y1 = Math.min(size - 1, y + radius);
  const x0 = Math.max(0, x - radius);
  const x1 = Math.min(size - 1, x + radius);
  for (let yy = y0; yy <= y1; yy += radius) {
    const row = yy * size;
    for (let xx = x0; xx <= x1; xx += radius) if (flat[row + xx]) return true;
  }
  return false;
}

function walkGallery(
  out: Uint8Array,
  flow: Float32Array,
  flat: Uint8Array,
  owner: Int32Array,
  size: number,
  x: number,
  y: number,
  walk: number,
  sign: number,
) {
  const tangent = flowTangent(flow, size, x, y, sign);
  let angle = Math.atan2(tangent.y, tangent.x);
  let sx = x;
  let sy = y;
  const length = Math.round(size * (0.1 + hash2(x + sign * 9, y) * 0.18));
  const reach = 10 + hash2(x + 7, y + sign) * Math.max(18, size * 0.028);
  const turns = 0.7 + hash2(x + 3, y + 11) * 0.8;
  const phase = hash2(x + sign, y + 5) * Math.PI * 2;
  let outside = 0;
  let lastX = x;
  let lastY = y;
  for (let step = 0; step < length; step += 1) {
    const along = step / Math.max(1, length - 1);
    const envelope = Math.sin(Math.PI * along) ** 0.55;
    const lateral = Math.sin(phase + along * Math.PI * 2 * turns) * envelope * reach;
    const px = sx - Math.sin(angle) * lateral;
    const py = sy + Math.cos(angle) * lateral;
    const six = Math.round(sx);
    const siy = Math.round(sy);
    if (six < 1 || siy < 1 || six >= size - 1 || siy >= size - 1) break;
    const spine = flat[siy * size + six] === 1;
    if (!spine) {
      outside += 1;
      if (outside > Math.max(16, Math.round(size * 0.02))) break;
    } else outside = 0;
    const span = Math.max(1, Math.ceil(Math.hypot(px - lastX, py - lastY)));
    for (let mark = 1; mark <= span; mark += 1) {
      const ix = Math.round(lastX + ((px - lastX) * mark) / span);
      const iy = Math.round(lastY + ((py - lastY) * mark) / span);
      if (ix < 1 || iy < 1 || ix >= size - 1 || iy >= size - 1) continue;
      const index = iy * size + ix;
      const gutter = owner[index] < 0 && owner[index] !== -walk;
      if (gutter) continue;
      const tone = Math.min(255, INK_PASS * (INK_PASSES - 3) + Math.round(hash2(ix + step, iy) * INK_PASS * 3));
      if (tone > out[index]) out[index] = tone;
      owner[index] = walk;
      reserveGutter(owner, size, ix - Math.sin(angle), iy + Math.cos(angle), walk);
    }
    lastX = px;
    lastY = py;
    const nextTangent = flowTangent(flow, size, six, siy, sign);
    const follow = 0.78;
    const vx = Math.cos(angle) * (1 - follow) + nextTangent.x * follow;
    const vy = Math.sin(angle) * (1 - follow) + nextTangent.y * follow;
    angle = Math.atan2(vy, vx);
    sx += Math.cos(angle);
    sy += Math.sin(angle);
  }
}

function paintInkHairs(gray: Uint8Array, flat: Uint8Array, flow: Float32Array, out: Uint8Array, size: number, curve: boolean) {
  const gap = size < 400 ? 3 : 4;
  const owner = new Int32Array(gray.length);
  let walk = 1;
  for (let y = 2; y < size - 2; y += gap) {
    for (let x = 2; x < size - 2; x += gap) {
      const index = y * size + x;
      if (!flat[index] || owner[index] !== 0) continue;
      const chance = 0.5 + (gray[index] / 255) * 0.5;
      if (hash2(x, y) > chance) continue;
      walkInk(out, flow, flat, owner, size, x, y, walk, 1, curve);
      walk += 1;
      walkInk(out, flow, flat, owner, size, x, y, walk, -1, curve);
      walk += 1;
    }
  }
}

function walkInk(
  out: Uint8Array,
  flow: Float32Array,
  flat: Uint8Array,
  owner: Int32Array,
  size: number,
  x: number,
  y: number,
  walk: number,
  sign: number,
  curve: boolean,
) {
  const tangent = flowTangent(flow, size, x, y, sign);
  let angle = hash2(x * 3 + sign, y * 5) * Math.PI * 2;
  const aim = Math.atan2(tangent.y, tangent.x);
  const aimWeight = curve ? 0.1 : 0.28;
  angle = Math.atan2(
    Math.sin(angle) * (1 - aimWeight) + Math.sin(aim) * aimWeight,
    Math.cos(angle) * (1 - aimWeight) + Math.cos(aim) * aimWeight,
  );
  const sway = curve ? (hash2(x + 4, y + sign) - 0.5) * 0.08 : 0;
  let px = x;
  let py = y;
  const length = curve ? 16 + Math.floor(hash2(x + sign * 9, y) * 36) : 36 + Math.floor(hash2(x + sign * 9, y) * 120);
  let outside = 0;
  for (let step = 0; step < length; step += 1) {
    const ix = Math.round(px);
    const iy = Math.round(py);
    if (ix < 1 || iy < 1 || ix >= size - 1 || iy >= size - 1) break;
    const index = iy * size + ix;
    const inside = flat[index] === 1;
    if (!inside) {
      outside += 1;
      if (outside > 6) break;
    } else outside = 0;
    const gutter = owner[index] < 0 && owner[index] !== -walk;
    if (!gutter) {
      const tone = Math.min(255, INK_PASS * (inside ? INK_PASSES - 4 : INK_PASSES - 10) + Math.round(hash2(ix + step, iy) * INK_PASS * 3));
      if (tone > out[index]) out[index] = tone;
      owner[index] = walk;
      if (inside) {
        const sideX = -Math.sin(angle);
        const sideY = Math.cos(angle);
        reserveGutter(owner, size, ix + sideX, iy + sideY, walk);
        reserveGutter(owner, size, ix + sideX * 2, iy + sideY * 2, walk);
        reserveGutter(owner, size, ix - sideX, iy - sideY, walk);
        reserveGutter(owner, size, ix - sideX * 2, iy - sideY * 2, walk);
      }
    }
    const turn = (hash2(ix + step, iy + sign) - 0.5) * (curve ? 0.28 : 0.42) + sway;
    const nextTangent = flowTangent(flow, size, ix, iy, sign);
    const headingX = Math.cos(angle + turn);
    const headingY = Math.sin(angle + turn);
    const follow = inside ? (curve ? 0.05 : 0.16) : 0.04;
    const vx = headingX * (1 - follow) + nextTangent.x * follow;
    const vy = headingY * (1 - follow) + nextTangent.y * follow;
    angle = Math.atan2(vy, vx);
    px += Math.cos(angle);
    py += Math.sin(angle);
  }
}

/** A small sideways wave along the sequence, so a straight run bends and stays in place. */
function curveStrands(pixels: Uint8Array) {
  const size = Math.round(Math.sqrt(pixels.length));
  let count = 0;
  let sx = 0;
  let sy = 0;
  let sxx = 0;
  let syy = 0;
  let sxy = 0;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      if (pixels[y * size + x] < 40) continue;
      count += 1;
      sx += x;
      sy += y;
      sxx += x * x;
      syy += y * y;
      sxy += x * y;
    }
  }
  if (count < 8) return pixels;
  const cx = sx / count;
  const cy = sy / count;
  const a = sxx / count - cx * cx;
  const b = sxy / count - cx * cy;
  const c = syy / count - cy * cy;
  const angle = 0.5 * Math.atan2(2 * b, a - c);
  const alongX = Math.cos(angle);
  const alongY = Math.sin(angle);
  const sideX = -alongY;
  const sideY = alongX;
  const field = new Float32Array(pixels);
  const out = new Uint8Array(pixels.length);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const along = x * alongX + y * alongY;
      const shift = Math.sin(along * 0.14) * 5.5 + Math.sin(along * 0.31 + 0.8) * 2.4;
      const fromX = Math.min(size - 1, Math.max(0, x - sideX * shift));
      const fromY = Math.min(size - 1, Math.max(0, y - sideY * shift));
      out[y * size + x] = Math.round(sample(field, size, fromX, fromY));
    }
  }
  return out;
}

function reserveGutter(owner: Int32Array, size: number, x: number, y: number, walk: number) {
  const ix = Math.round(x);
  const iy = Math.round(y);
  if (ix < 0 || iy < 0 || ix >= size || iy >= size) return;
  const index = iy * size + ix;
  if (owner[index] === 0) owner[index] = -walk;
}

function flowTangent(field: Float32Array, size: number, x: number, y: number, sign: number) {
  const index = Math.min(field.length - size - 2, Math.max(size + 1, y * size + x));
  const dx = field[index + 1] - field[index - 1];
  const dy = field[index + size] - field[index - size];
  const span = Math.hypot(dx, dy) || 1;
  return { x: (-dy / span) * sign, y: (dx / span) * sign };
}

function markFlat(gray: Uint8Array, size: number, reference: number) {
  const flat = new Uint8Array(gray.length);
  const meanAt = reference * 0.4;
  const varianceAt = reference * reference * 0.02;
  const radius = 2;
  for (let y = radius; y < size - radius; y += 1) {
    for (let x = radius; x < size - radius; x += 1) {
      let sum = 0;
      let sum2 = 0;
      let dark = 0;
      let count = 0;
      for (let dy = -radius; dy <= radius; dy += 1) {
        const row = (y + dy) * size;
        for (let dx = -radius; dx <= radius; dx += 1) {
          const value = gray[row + x + dx];
          sum += value;
          sum2 += value * value;
          if (value < 18) dark += 1;
          count += 1;
        }
      }
      const mean = sum / count;
      const variance = sum2 / count - mean * mean;
      const smooth = mean > meanAt && variance < varianceAt;
      const closed = mean > reference * 0.62 && dark < count * 0.08;
      if (smooth || closed) flat[y * size + x] = 1;
    }
  }
  absorbFillEdges(flat, gray, size);
  return flat;
}

function absorbFillEdges(flat: Uint8Array, gray: Uint8Array, size: number) {
  for (let step = 0; step < 4; step += 1) {
    const prior = flat.slice();
    for (let y = 1; y < size - 1; y += 1) {
      for (let x = 1; x < size - 1; x += 1) {
        const index = y * size + x;
        if (prior[index] || gray[index] < 28) continue;
        if (prior[index - 1] || prior[index + 1] || prior[index - size] || prior[index + size]) flat[index] = 1;
      }
    }
  }
}

/** Box-average a square gray plate down to a preview. */
export function downsampleGray(pixels: Uint8Array, size: number, next: number) {
  if (next >= size) return pixels;
  const out = new Uint8Array(next * next);
  for (let y = 0; y < next; y += 1) {
    const y0 = Math.floor((y * size) / next);
    const y1 = Math.max(y0 + 1, Math.floor(((y + 1) * size) / next));
    for (let x = 0; x < next; x += 1) {
      const x0 = Math.floor((x * size) / next);
      const x1 = Math.max(x0 + 1, Math.floor(((x + 1) * size) / next));
      let sum = 0;
      let count = 0;
      for (let yy = y0; yy < y1; yy += 1) {
        const row = yy * size;
        for (let xx = x0; xx < x1; xx += 1) {
          sum += pixels[row + xx];
          count += 1;
        }
      }
      out[y * next + x] = Math.round(sum / count);
    }
  }
  return out;
}

function combTrails(mask: Uint8Array, size: number, gap: number) {
  const hairs = new Uint8Array(mask.length);
  const seen = new Uint8Array(mask.length);
  const stack: number[] = [];
  const width = Math.max(1, Math.round(gap * 0.42));
  for (let start = 0; start < mask.length; start += 1) {
    if (!mask[start] || seen[start]) continue;
    const cells: number[] = [];
    seen[start] = 1;
    stack.push(start);
    let sx = 0;
    let sy = 0;
    let sxx = 0;
    let syy = 0;
    let sxy = 0;
    while (stack.length > 0) {
      const index = stack.pop() as number;
      cells.push(index);
      const x = index % size;
      const y = (index - x) / size;
      sx += x;
      sy += y;
      sxx += x * x;
      syy += y * y;
      sxy += x * y;
      const next = [x > 0 ? index - 1 : -1, x + 1 < size ? index + 1 : -1, y > 0 ? index - size : -1, y + 1 < size ? index + size : -1];
      for (const neighbor of next) {
        if (neighbor < 0 || seen[neighbor] || !mask[neighbor]) continue;
        seen[neighbor] = 1;
        stack.push(neighbor);
      }
    }
    const count = cells.length;
    const cx = sx / count;
    const cy = sy / count;
    const a = sxx / count - cx * cx;
    const b = sxy / count - cx * cy;
    const c = syy / count - cy * cy;
    const angle = 0.5 * Math.atan2(2 * b, a - c);
    const nx = -Math.sin(angle);
    const ny = Math.cos(angle);
    for (const index of cells) {
      const x = index % size;
      const y = (index - x) / size;
      const edge =
        x === 0 ||
        y === 0 ||
        x === size - 1 ||
        y === size - 1 ||
        !mask[index - 1] ||
        !mask[index + 1] ||
        !mask[index - size] ||
        !mask[index + size];
      const side = (x - cx) * nx + (y - cy) * ny;
      const band = ((side % gap) + gap) % gap;
      if (edge || band < width) hairs[index] = 1;
    }
  }
  return hairs;
}

function traceHairs(mask: Uint8Array, size: number, gap: number) {
  const angle = new Float32Array(mask.length);
  const ready = new Uint8Array(mask.length);
  const radius = 6;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const index = y * size + x;
      if (!mask[index]) continue;
      let count = 0;
      let sx = 0;
      let sy = 0;
      let sxx = 0;
      let syy = 0;
      let sxy = 0;
      const y0 = Math.max(0, y - radius);
      const y1 = Math.min(size - 1, y + radius);
      const x0 = Math.max(0, x - radius);
      const x1 = Math.min(size - 1, x + radius);
      for (let yy = y0; yy <= y1; yy += 1) {
        for (let xx = x0; xx <= x1; xx += 1) {
          if (!mask[yy * size + xx]) continue;
          count += 1;
          sx += xx;
          sy += yy;
          sxx += xx * xx;
          syy += yy * yy;
          sxy += xx * yy;
        }
      }
      if (count < 8) continue;
      const cx = sx / count;
      const cy = sy / count;
      const a = sxx / count - cx * cx;
      const b = sxy / count - cx * cy;
      const c = syy / count - cy * cy;
      angle[index] = 0.5 * Math.atan2(2 * b, a - c);
      ready[index] = 1;
    }
  }
  const hairs = new Uint8Array(mask.length);
  const taken = new Uint8Array(mask.length);
  const claim = (x: number, y: number) => {
    for (let dy = -gap; dy <= gap; dy += 1) {
      const yy = y + dy;
      if (yy < 0 || yy >= size) continue;
      for (let dx = -gap; dx <= gap; dx += 1) {
        const xx = x + dx;
        if (xx < 0 || xx >= size || dx * dx + dy * dy > gap * gap) continue;
        taken[yy * size + xx] = 1;
      }
    }
  };
  const trace = (x: number, y: number, sign: number) => {
    let px = x;
    let py = y;
    let vx = Math.cos(angle[y * size + x]) * sign;
    let vy = Math.sin(angle[y * size + x]) * sign;
    const reach = 6 + Math.floor(hash2(x * 3, y * 5) * 58);
    let leash = reach;
    const sway = (hash2(x, y) - 0.5) * 0.85;
    for (let step = 0; step < 720; step += 1) {
      const ix = Math.round(px);
      const iy = Math.round(py);
      if (ix < 1 || iy < 1 || ix >= size - 1 || iy >= size - 1) break;
      const index = iy * size + ix;
      const inside = mask[index] === 1;
      if (inside) leash = reach;
      else {
        leash -= 1;
        if (leash <= 0) break;
      }
      const fade = inside ? 1 : Math.max(0.35, leash / reach);
      const tone = Math.round((inside ? 196 : 168) * fade);
      if (tone > hairs[index]) hairs[index] = tone;
      claim(ix, iy);
      const turn = sway * 0.14 + (hash2(ix + step, iy) - 0.5) * (inside ? 0.34 : 0.62);
      const c = Math.cos(turn);
      const s = Math.sin(turn);
      const turnedX = vx * c - vy * s;
      const turnedY = vx * s + vy * c;
      vx = turnedX;
      vy = turnedY;
      if (ready[index]) {
        let nx = Math.cos(angle[index]);
        let ny = Math.sin(angle[index]);
        if (nx * vx + ny * vy < 0) {
          nx = -nx;
          ny = -ny;
        }
        const follow = inside ? 0.24 : 0.08;
        vx = vx * (1 - follow) + nx * follow;
        vy = vy * (1 - follow) + ny * follow;
      }
      const span = Math.hypot(vx, vy) || 1;
      vx /= span;
      vy /= span;
      px += vx;
      py += vy;
    }
  };
  for (let y = 1; y < size - 1; y += gap + 1) {
    for (let x = 1; x < size - 1; x += gap + 1) {
      const index = y * size + x;
      if (!ready[index] || taken[index]) continue;
      trace(x, y, 1);
      trace(x, y, -1);
    }
  }
  return hairs;
}

function nearbyHair(plate: Uint8Array, size: number, x: number, y: number) {
  let peak = 0;
  for (let dy = -2; dy <= 2; dy += 1) {
    const yy = y + dy;
    if (yy < 0 || yy >= size) continue;
    for (let dx = -2; dx <= 2; dx += 1) {
      const xx = x + dx;
      if (xx < 0 || xx >= size) continue;
      peak = Math.max(peak, plate[yy * size + xx]);
    }
  }
  return peak;
}

function largestComponent(mask: Uint8Array, size: number) {
  const seen = new Uint8Array(mask.length);
  const stack: number[] = [];
  let best: number[] = [];
  for (let start = 0; start < mask.length; start += 1) {
    if (!mask[start] || seen[start]) continue;
    const cells: number[] = [];
    seen[start] = 1;
    stack.push(start);
    while (stack.length > 0) {
      const index = stack.pop() as number;
      cells.push(index);
      const x = index % size;
      const y = (index - x) / size;
      const next = [x > 0 ? index - 1 : -1, x + 1 < size ? index + 1 : -1, y > 0 ? index - size : -1, y + 1 < size ? index + size : -1];
      for (const neighbor of next) {
        if (neighbor < 0 || seen[neighbor] || !mask[neighbor]) continue;
        seen[neighbor] = 1;
        stack.push(neighbor);
      }
    }
    if (cells.length > best.length) best = cells;
  }
  const out = new Uint8Array(mask.length);
  for (const cell of best) out[cell] = 1;
  return out;
}

function trailOccupancy(trails: Uint8Array, level = ENVELOPE_LEVEL) {
  const mask = new Uint8Array(trails.length);
  const reference = envelopeReference(trails);
  if (!(reference > 0)) return mask;
  const cutoff = reference * level;
  for (let i = 0; i < trails.length; i += 1) if (trails[i] >= cutoff) mask[i] = 1;
  return mask;
}

function spineAxis(mask: Uint8Array, size: number) {
  let count = 0;
  let sx = 0;
  let sy = 0;
  let sxx = 0;
  let syy = 0;
  let sxy = 0;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      if (!mask[y * size + x]) continue;
      count += 1;
      sx += x;
      sy += y;
      sxx += x * x;
      syy += y * y;
      sxy += x * y;
    }
  }
  if (count < 8) return { cx: size / 2, cy: size / 2, ux: 1, uy: 0 };
  const cx = sx / count;
  const cy = sy / count;
  const a = sxx / count - cx * cx;
  const b = sxy / count - cx * cy;
  const c = syy / count - cy * cy;
  const angle = 0.5 * Math.atan2(2 * b, a - c);
  return { cx, cy, ux: Math.cos(angle), uy: Math.sin(angle) };
}

function dilateAlong(
  mask: Uint8Array,
  size: number,
  spine: { ux: number; uy: number },
  along: number,
  across: number,
) {
  const out = new Uint8Array(mask.length);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      if (!mask[y * size + x]) continue;
      for (let t = -along; t <= along; t += 1) {
        for (let n = -across; n <= across; n += 1) {
          const xx = Math.round(x + spine.ux * t - spine.uy * n);
          const yy = Math.round(y + spine.uy * t + spine.ux * n);
          if (xx < 0 || yy < 0 || xx >= size || yy >= size) continue;
          out[yy * size + xx] = 1;
        }
      }
    }
  }
  return out;
}

function spreadAlong(pixels: Uint8Array, size: number, spine: { cx: number; cy: number; ux: number; uy: number }) {
  const bodyScale = size / GALLERY_BODY;
  const cx = spine.cx * bodyScale;
  const cy = spine.cy * bodyScale;
  let minAlong = Infinity;
  let maxAlong = -Infinity;
  let minSide = Infinity;
  let maxSide = -Infinity;
  let count = 0;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      if (pixels[y * size + x] <= 0) continue;
      count += 1;
      const dx = x - cx;
      const dy = y - cy;
      const along = dx * spine.ux + dy * spine.uy;
      const side = -dx * spine.uy + dy * spine.ux;
      if (along < minAlong) minAlong = along;
      if (along > maxAlong) maxAlong = along;
      if (side < minSide) minSide = side;
      if (side > maxSide) maxSide = side;
    }
  }
  if (count < 40) return pixels;
  const length = Math.max(1, maxAlong - minAlong);
  const width = Math.max(1, maxSide - minSide);
  const margin = Math.round(size * 0.04);
  const room = (distance: number, toward: number) => (distance <= 1 ? 2.2 : Math.max(1, toward / distance));
  const alongLimit = Math.min(room(-minAlong, cx - margin), room(maxAlong, size - margin - cx), room(-minAlong, cy - margin), room(maxAlong, size - margin - cy));
  const sideLimit = Math.min(room(-minSide, cx - margin), room(maxSide, size - margin - cx), room(-minSide, cy - margin), room(maxSide, size - margin - cy));
  const alongScale = Math.min(alongLimit, length < size * 0.72 ? Math.min(1.8, (size * 0.86) / length) : 1);
  const sideScale = Math.min(sideLimit, width < size * 0.5 ? Math.min(1.8, (size * 0.58) / width) : 1);
  if (alongScale < 1.05 && sideScale < 1.05) return pixels;
  const out = new Uint8Array(pixels.length);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const dx = x - cx;
      const dy = y - cy;
      const along = (dx * spine.ux + dy * spine.uy) / alongScale;
      const side = (-dx * spine.uy + dy * spine.ux) / sideScale;
      const sx = cx + spine.ux * along - spine.uy * side;
      const sy = cy + spine.uy * along + spine.ux * side;
      const x0 = Math.floor(sx);
      const y0 = Math.floor(sy);
      if (x0 < 0 || y0 < 0 || x0 >= size - 1 || y0 >= size - 1) continue;
      const fx = sx - x0;
      const fy = sy - y0;
      const value =
        pixels[y0 * size + x0] * (1 - fx) * (1 - fy) +
        pixels[y0 * size + x0 + 1] * fx * (1 - fy) +
        pixels[(y0 + 1) * size + x0] * (1 - fx) * fy +
        pixels[(y0 + 1) * size + x0 + 1] * fx * fy;
      if (value > 1) out[y * size + x] = Math.min(255, Math.round(value));
    }
  }
  return out;
}

function nth(values: number[], k: number) {
  let left = 0;
  let right = values.length - 1;
  while (left < right) {
    const pivot = values[left + Math.floor(Math.random() * (right - left + 1))];
    let i = left;
    let j = right;
    while (i <= j) {
      while (values[i] < pivot) i += 1;
      while (values[j] > pivot) j -= 1;
      if (i <= j) {
        const swap = values[i];
        values[i] = values[j];
        values[j] = swap;
        i += 1;
        j -= 1;
      }
    }
    if (k <= j) right = j;
    else if (k >= i) left = i;
    else return values[k];
  }
  return values[k];
}

function bendLines(field: Float32Array, size: number, amplitude: number, pixelScale: number) {
  const out = new Float32Array(field.length);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const index = y * size + x;
      const left = field[y * size + Math.max(0, x - 2)];
      const right = field[y * size + Math.min(size - 1, x + 2)];
      const up = field[Math.max(0, y - 2) * size + x];
      const down = field[Math.min(size - 1, y + 2) * size + x];
      const gx = right - left;
      const gy = down - up;
      const span = Math.hypot(gx, gy);
      if (span < 2) {
        out[index] = field[index];
        continue;
      }
      const wave = valueNoise(x / pixelScale, y / pixelScale) * 2 - 1;
      const shift = (wave * amplitude * span) / (span + 18);
      out[index] = sample(field, size, x + (-gy / span) * shift, y + (gx / span) * shift);
    }
  }
  return out;
}

function sample(field: Float32Array, size: number, x: number, y: number) {
  const x0 = Math.max(0, Math.min(size - 1, Math.floor(x)));
  const y0 = Math.max(0, Math.min(size - 1, Math.floor(y)));
  const x1 = Math.min(size - 1, x0 + 1);
  const y1 = Math.min(size - 1, y0 + 1);
  const tx = Math.max(0, Math.min(1, x - x0));
  const ty = Math.max(0, Math.min(1, y - y0));
  const row0 = y0 * size;
  const row1 = y1 * size;
  const top = field[row0 + x0] + (field[row0 + x1] - field[row0 + x0]) * tx;
  const bottom = field[row1 + x0] + (field[row1 + x1] - field[row1 + x0]) * tx;
  return top + (bottom - top) * ty;
}

function valueNoise(x: number, y: number) {
  const scale = 640;
  const x0 = Math.floor(x / scale);
  const y0 = Math.floor(y / scale);
  const fx = x / scale - x0;
  const fy = y / scale - y0;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const n00 = hash2(x0, y0);
  const n10 = hash2(x0 + 1, y0);
  const n01 = hash2(x0, y0 + 1);
  const n11 = hash2(x0 + 1, y0 + 1);
  const nx0 = n00 + (n10 - n00) * sx;
  const nx1 = n01 + (n11 - n01) * sx;
  return nx0 + (nx1 - nx0) * sy;
}

function hash2(x: number, y: number) {
  let hash = Math.imul(x * 374761393 + y * 668265263, 1274126177);
  hash = (hash ^ (hash >>> 13)) >>> 0;
  return (hash & 1023) / 1023;
}

function quietSquarePads(out: Uint8Array, size: number, cap: number, scale: number) {
  const hotAt = Math.max(40, cap * 0.9);
  const hot = new Uint8Array(out.length);
  for (let index = 0; index < out.length; index += 1) if (out[index] > hotAt) hot[index] = 1;
  const seen = new Uint8Array(out.length);
  const stack: number[] = [];
  const component: number[] = [];
  const areaMin = 90 * scale * scale;
  const areaMax = 14000 * scale * scale;
  const sideMin = 14 * scale;
  const sideMax = 180 * scale;
  for (let start = 0; start < hot.length; start += 1) {
    if (!hot[start] || seen[start]) continue;
    stack.length = 0;
    component.length = 0;
    stack.push(start);
    seen[start] = 1;
    let minX = size;
    let minY = size;
    let maxX = 0;
    let maxY = 0;
    while (stack.length > 0) {
      const index = stack.pop() as number;
      component.push(index);
      const x = index % size;
      const y = (index / size) | 0;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
      if (x > 0 && hot[index - 1] && !seen[index - 1]) {
        seen[index - 1] = 1;
        stack.push(index - 1);
      }
      if (x + 1 < size && hot[index + 1] && !seen[index + 1]) {
        seen[index + 1] = 1;
        stack.push(index + 1);
      }
      if (y > 0 && hot[index - size] && !seen[index - size]) {
        seen[index - size] = 1;
        stack.push(index - size);
      }
      if (y + 1 < size && hot[index + size] && !seen[index + size]) {
        seen[index + size] = 1;
        stack.push(index + size);
      }
    }
    const width = maxX - minX + 1;
    const height = maxY - minY + 1;
    const area = component.length;
    if (area < areaMin || area > areaMax) continue;
    if (width < sideMin || height < sideMin || width > sideMax || height > sideMax) continue;
    const aspect = width > height ? width / height : height / width;
    if (aspect > 1.35) continue;
    if (area / (width * height) < 0.78) continue;
    for (const index of component) out[index] = Math.round(out[index] * 0.34);
  }
}

function gaussian(pixels: Float32Array, size: number, radius: number, sigma: number) {
  const kernel = smoothKernel(radius, sigma);
  const horizontal = new Float32Array(pixels.length);
  const blurred = new Float32Array(pixels.length);
  for (let y = 0; y < size; y += 1) {
    const row = y * size;
    for (let x = 0; x < size; x += 1) {
      let sum = 0;
      for (let offset = -radius; offset <= radius; offset += 1) {
        const xx = Math.min(size - 1, Math.max(0, x + offset));
        sum += pixels[row + xx] * kernel[offset + radius];
      }
      horizontal[row + x] = sum;
    }
  }
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let sum = 0;
      for (let offset = -radius; offset <= radius; offset += 1) {
        const yy = Math.min(size - 1, Math.max(0, y + offset));
        sum += horizontal[yy * size + x] * kernel[offset + radius];
      }
      blurred[y * size + x] = sum;
    }
  }
  return blurred;
}

function smoothKernel(radius: number, sigma: number) {
  const kernel = new Float32Array(radius * 2 + 1);
  let sum = 0;
  for (let offset = -radius; offset <= radius; offset += 1) {
    const weight = Math.exp(-(offset * offset) / (2 * sigma * sigma));
    kernel[offset + radius] = weight;
    sum += weight;
  }
  for (let index = 0; index < kernel.length; index += 1) kernel[index] /= sum;
  return kernel;
}
