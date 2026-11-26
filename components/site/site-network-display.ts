/**
 * Graphic alpha for one raw trail sample.
 * Metrics never read this. The shader and the iteration thumbnails do.
 * Soft porous film: bright cores, faint secondary filaments, open black pockets.
 */
export function trailDisplayAlpha(value: number): number {
  const cap = 0.9;
  const norm = value <= 0.014 ? 0 : Math.min(1, value / cap);
  if (norm === 0) return 0;
  const filament = norm < 0.12 ? 0.03 + norm * 0.55 : 0;
  const vein = norm >= 0.12 ? Math.min(1, 0.12 + Math.pow((norm - 0.12) / 0.88, 1.35) * 0.95) : 0;
  return Math.round(Math.max(filament, vein) * 255);
}
