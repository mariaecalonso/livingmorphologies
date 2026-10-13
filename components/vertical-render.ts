import { DEFAULT_DENSITY, trailMaskCutoff } from "@/lib/skill1/maps";

/** How an accepted sample is drawn. The trail buffer is only read. */
export type SamplePresentation = "raw" | "contour";

/**
 * Peak-normalized cutoff for the presentation silhouette.
 * Cells stay independent, so holes and separate regions remain.
 */
export const CLEAN_CONTOUR_CUTOFF = trailMaskCutoff(DEFAULT_DENSITY);

/** Display tone for one peak-normalized cell. Contour is binary and does not fill holes. */
export function presentationTone(normalized: number, presentation: SamplePresentation) {
  const norm = Math.max(0, Math.min(1, normalized));
  if (presentation === "contour") return norm >= CLEAN_CONTOUR_CUTOFF ? 255 : 0;
  return Math.round(norm * 255);
}

/**
 * Native-resolution plate of one accepted sample.
 * Raw field is the continuous intensity. Clean contour is a binary reading of the same values.
 */
export function rasterTrailPlate(
  trails: ArrayLike<number>,
  trailSize: number,
  peak: number,
  presentation: SamplePresentation = "raw",
) {
  const size = Math.max(1, Math.floor(trailSize));
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d", { alpha: false });
  if (!ctx) return canvas;
  const image = ctx.createImageData(size, size);
  const data = image.data;
  const gain = peak > 0 ? 1 / peak : 0;
  const count = Math.min(trails.length, size * size);
  for (let i = 0; i < count; i += 1) {
    const x = i % size;
    const y = Math.floor(i / size);
    const tone = presentationTone((trails[i] ?? 0) * gain, presentation);
    const pixel = ((size - 1 - y) * size + x) * 4;
    data[pixel] = tone;
    data[pixel + 1] = tone;
    data[pixel + 2] = tone;
    data[pixel + 3] = 255;
  }
  ctx.putImageData(image, 0, 0);
  return canvas;
}

/** Native raster of a peak-normalized sample. The source array is only read. */
export function nativeSampleCanvas(values: ArrayLike<number>, presentation: SamplePresentation = "raw") {
  const size = Math.max(1, Math.round(Math.sqrt(values.length)));
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d", { alpha: false });
  if (!ctx) return canvas;
  const image = ctx.createImageData(size, size);
  const data = image.data;
  const count = Math.min(values.length, size * size);
  for (let i = 0; i < count; i += 1) {
    const tone = presentationTone(values[i] ?? 0, presentation);
    const pixel = i * 4;
    data[pixel] = tone;
    data[pixel + 1] = tone;
    data[pixel + 2] = tone;
    data[pixel + 3] = 255;
  }
  ctx.putImageData(image, 0, 0);
  return canvas;
}

/** Nearest-neighbor scale. Destination edges are snapped so samples do not blend across pixels. */
export function drawPixelPlate(
  ctx: CanvasRenderingContext2D,
  plate: CanvasImageSource,
  x: number,
  y: number,
  width: number,
  height: number,
) {
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(plate, Math.round(x), Math.round(y), Math.max(1, Math.round(width)), Math.max(1, Math.round(height)));
}
