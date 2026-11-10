/**
 * Graphic alpha for one raw trail sample.
 * Metrics never read this. The shader and the iteration thumbnails do.
 */
export function trailDisplayAlpha(value: number): number {
  const cap = 0.9;
  const norm = value <= 0.018 ? 0 : Math.min(1, value / cap);
  const shaped = norm === 0 ? 0 : norm < 0.16 ? 0.04 + norm * 0.7 : Math.min(1, 0.15 + (norm - 0.16) * 1.45);
  return Math.round(shaped * 255);
}
