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
