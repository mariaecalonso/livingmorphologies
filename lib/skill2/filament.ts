import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { inflateSync } from "node:zlib";
import { ARCHETYPE_VISUAL_REFERENCES } from "./archetype-visual-references";
import { encodeGrayPng } from "./semantic/gray-png";
import { SEMANTIC_RUN_ROOT } from "./semantic/run-root";
import { visibleIds } from "./semantic/catalog";
import type { SemanticRun } from "./semantic/types";

/**
 * Filament refinement sits after a Skill 2 run and before the catalog is shown.
 * The search stores the untoned plate. This file turns that plate into the
 * shared drawing: black ground, a white hair, and a corner that can soften.
 * One saved setting serves every iteration of one archetype.
 */

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

const CONFIG_DIR = join("config", "filament");
const CACHE_DIR = join("data", "filament-cache");

const clamp01 = (value: number) => Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));

export function isArchetypeId(value: string) {
  return /^[a-z0-9-]+$/.test(value);
}

export function normalizeFilamentCalibration(value: Partial<FilamentCalibration> | null | undefined): FilamentCalibration {
  return {
    white: clamp01(value?.white ?? DEFAULT_FILAMENT.white),
    black: clamp01(value?.black ?? DEFAULT_FILAMENT.black),
    organic: clamp01(value?.organic ?? DEFAULT_FILAMENT.organic),
    thickness: clamp01(value?.thickness ?? value?.organic ?? DEFAULT_FILAMENT.thickness),
  };
}

export function filamentConfigPath(archetypeId: string) {
  return join(CONFIG_DIR, `${archetypeId}.json`);
}

export function loadFilamentCalibration(archetypeId: string): FilamentCalibration {
  const path = filamentConfigPath(archetypeId);
  if (!existsSync(path)) return { ...DEFAULT_FILAMENT };
  try {
    return normalizeFilamentCalibration(JSON.parse(readFileSync(path, "utf8")) as Partial<FilamentCalibration>);
  } catch {
    return { ...DEFAULT_FILAMENT };
  }
}

export function saveFilamentCalibration(archetypeId: string, value: Partial<FilamentCalibration>) {
  if (!isArchetypeId(archetypeId)) throw new Error("archetype id is not valid");
  const calibration = normalizeFilamentCalibration(value);
  mkdirSync(CONFIG_DIR, { recursive: true });
  writeFileSync(filamentConfigPath(archetypeId), JSON.stringify(calibration, null, 2));
  const cache = join(CACHE_DIR, archetypeId);
  if (existsSync(cache)) rmSync(cache, { recursive: true, force: true });
  return calibration;
}

export type FilamentArchetypeStatus = {
  archetypeId: string;
  name: string;
  hasRun: boolean;
  sampleIds: number[];
  calibration: FilamentCalibration;
  saved: boolean;
};

export function filamentArchetypeStatus(): FilamentArchetypeStatus[] {
  return ARCHETYPE_VISUAL_REFERENCES.map((item) => {
    const sampleIds = filamentSampleIds(item.archetypeId);
    return {
      archetypeId: item.archetypeId,
      name: item.name,
      hasRun: sampleIds.length > 0,
      sampleIds,
      calibration: loadFilamentCalibration(item.archetypeId),
      saved: existsSync(filamentConfigPath(item.archetypeId)),
    };
  });
}

/** A few real drawings from the finished run, spread across the catalog when one exists. */
export function filamentSampleIds(archetypeId: string) {
  if (!isArchetypeId(archetypeId)) return [];
  const runFile = join(SEMANTIC_RUN_ROOT, archetypeId, "run.json");
  if (!existsSync(runFile)) return [];
  let run: SemanticRun;
  try {
    run = JSON.parse(readFileSync(runFile, "utf8")) as SemanticRun;
  } catch {
    return [];
  }
  const previewDir = join(SEMANTIC_RUN_ROOT, archetypeId, "previews");
  const ready = run.candidates.filter((candidate) => candidate.preview && existsSync(join(previewDir, `${candidate.id}.png`)));
  const visible = new Set(visibleIds(run.catalog));
  const catalog = ready.filter((candidate) => visible.has(candidate.id));
  const source = catalog.length >= 3 ? catalog : ready;
  if (source.length <= 6) return source.map((candidate) => candidate.id);
  const ids: number[] = [];
  for (let index = 0; index < 6; index += 1) {
    ids.push(source[Math.round((index * (source.length - 1)) / 5)].id);
  }
  return [...new Set(ids)];
}

export function semanticPreviewPath(archetypeId: string, id: string) {
  if (!isArchetypeId(archetypeId) || !/^\d+$/.test(id)) return null;
  const path = join(SEMANTIC_RUN_ROOT, archetypeId, "previews", `${id}.png`);
  return existsSync(path) ? path : null;
}

/** Catalog image. Uses the saved calibration and a disk cache so the page does not re-tone every request. */
export function readCatalogFilament(archetypeId: string, sourcePath: string, id: string) {
  const calibration = loadFilamentCalibration(archetypeId);
  const stamp = JSON.stringify(calibration);
  const dir = join(CACHE_DIR, archetypeId);
  const cache = join(dir, `${id}.png`);
  const mark = join(dir, `${id}.stamp`);
  const sourceTime = statSync(sourcePath).mtimeMs;
  if (existsSync(cache) && existsSync(mark) && readFileSync(mark, "utf8") === stamp && statSync(cache).mtimeMs >= sourceTime) {
    return readFileSync(cache);
  }
  const refined = refinePreviewPng(readFileSync(sourcePath), calibration);
  mkdirSync(dir, { recursive: true });
  writeFileSync(cache, refined);
  writeFileSync(mark, stamp);
  return refined;
}

export function refinePreviewPng(png: Buffer, calibration: FilamentCalibration) {
  const decoded = decodeGrayPng(png);
  if (!decoded) return png;
  return encodeGrayPng(decoded.size, refineFilament(decoded.pixels, calibration));
}

export function refineFilament(pixels: Uint8Array, calibration: FilamentCalibration) {
  const size = Math.round(Math.sqrt(pixels.length));
  if (size * size !== pixels.length) return pixels;
  const setting = normalizeFilamentCalibration(calibration);
  let positive = 0;
  for (const value of pixels) if (value > 0) positive += 1;
  if (positive === 0) return pixels;

  const radius = setting.thickness < 0.04 ? 1 : Math.round(1 + setting.thickness * 16);
  const sigma = 0.45 + setting.thickness * 6.2;
  let field = gaussian(new Float32Array(pixels), size, radius, sigma);
  const bend = setting.organic * 46;
  if (bend > 1) field = bendLines(field, size, bend);

  const samples: number[] = [];
  for (const value of field) if (value > 0.8) samples.push(value);
  if (samples.length === 0) return new Uint8Array(pixels.length);
  samples.sort((left, right) => left - right);
  const hairAt = 0.16 + setting.black * 0.66;
  const hair = samples[Math.min(samples.length - 1, Math.floor(hairAt * (samples.length - 1)))] || 1;
  const cap = Math.round(96 + setting.white * 132);
  const gain = 1.05 + setting.white * 2.15;
  const out = new Uint8Array(pixels.length);
  for (let index = 0; index < field.length; index += 1) {
    const amount = field[index] / hair;
    if (amount <= 0) continue;
    const toned = cap * (1 - Math.exp(-gain * amount));
    if (toned < 1) continue;
    out[index] = Math.min(cap, Math.round(toned));
  }
  quietSquarePads(out, size, cap);
  return out;
}

/** Our inspection PNGs are 8-bit gray with filter 0. Anything else is left untouched. */
export function decodeGrayPng(buffer: Buffer) {
  if (buffer.length < 8 || buffer[0] !== 137 || buffer[1] !== 80) return null;
  let offset = 8;
  let width = 0;
  let height = 0;
  const idat: Buffer[] = [];
  while (offset + 8 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString("ascii", offset + 4, offset + 8);
    const start = offset + 8;
    const end = start + length;
    if (end + 4 > buffer.length) return null;
    if (type === "IHDR") {
      width = buffer.readUInt32BE(start);
      height = buffer.readUInt32BE(start + 4);
      if (buffer[start + 8] !== 8 || buffer[start + 9] !== 0) return null;
    } else if (type === "IDAT") {
      idat.push(buffer.subarray(start, end));
    } else if (type === "IEND") {
      break;
    }
    offset = end + 4;
  }
  if (width < 2 || height < 2 || width !== height || idat.length === 0) return null;
  const inflated = inflateSync(Buffer.concat(idat));
  const stride = width + 1;
  if (inflated.length < stride * height) return null;
  const pixels = new Uint8Array(width * height);
  for (let y = 0; y < height; y += 1) {
    const row = y * stride;
    if (inflated[row] !== 0) return null;
    pixels.set(inflated.subarray(row + 1, row + 1 + width), y * width);
  }
  return { size: width, pixels };
}

function bendLines(field: Float32Array, size: number, amplitude: number) {
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
      const wave = valueNoise(x, y) * 2 - 1;
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

function quietSquarePads(out: Uint8Array, size: number, cap: number) {
  const hotAt = Math.max(40, cap * 0.9);
  const hot = new Uint8Array(out.length);
  for (let index = 0; index < out.length; index += 1) if (out[index] > hotAt) hot[index] = 1;
  const seen = new Uint8Array(out.length);
  const stack: number[] = [];
  const component: number[] = [];
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
    if (area < 90 || area > 14000) continue;
    if (width < 14 || height < 14 || width > 180 || height > 180) continue;
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
