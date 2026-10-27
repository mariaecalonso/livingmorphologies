import { moduleLength } from "./contract";
import { HYBRID_GAP } from "./tiles";

/**
 * Air between two connected faces, in module units.
 * The layout starts at HYBRID_GAP. A selected hybrid may move Parent B
 * inside this range when a different span seats the morphology better.
 */
export const CONNECTION_SPAN_MIN = moduleLength(0.22);
export const CONNECTION_SPAN_MAX = moduleLength(0.85);

const ROW_ROUTES = [0, 1, 2, 3, 4] as const;

/** Preferred surface-to-surface span for one SOM cell. Parent scale is not involved. */
export function preferredConnectionSpan(row: number, intensity: number, faceSpan: number, negotiation = 0) {
  const clampedRow = Math.min(ROW_ROUTES.length - 1, Math.max(0, Math.round(row)));
  const routes = ROW_ROUTES[clampedRow];
  const taper = Math.max(moduleLength(0.08), faceSpan * 0.18);
  const core = moduleLength(0.12 + clamp01(intensity) * 0.55);
  const branchRoom = routes * moduleLength(0.03) + clamp01(negotiation) * moduleLength(0.08);
  return clamp(taper + core * 0.5 + branchRoom, CONNECTION_SPAN_MIN, CONNECTION_SPAN_MAX);
}

/**
 * Keep the current gap unless a sampled spacing fits the hybrid clearly better.
 * Movement away from the layout gap is penalized.
 */
export function chooseConnectionSpan(preferred: number, current = HYBRID_GAP) {
  const samples = [current, preferred, current + (preferred - current) * 0.5];
  let best = clamp(current, CONNECTION_SPAN_MIN, CONNECTION_SPAN_MAX);
  let bestScore = spanScore(best, preferred, current);
  for (const sample of samples) {
    const span = clamp(sample, CONNECTION_SPAN_MIN, CONNECTION_SPAN_MAX);
    const score = spanScore(span, preferred, current);
    if (score > bestScore + 0.04) {
      best = span;
      bestScore = score;
    }
  }
  return best;
}

function spanScore(span: number, preferred: number, current: number) {
  const room = Math.max(1e-6, CONNECTION_SPAN_MAX - CONNECTION_SPAN_MIN);
  const fit = 1 - Math.abs(span - preferred) / room;
  const movement = Math.abs(span - current) / room;
  return fit * 0.8 - movement * 0.45;
}

function clamp01(value: number) {
  return Math.min(1, Math.max(0, value));
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

/** Matches the generator section depth: a fraction of the smaller face edge. */
export function sectionInset(extent: { u: number; v: number } | null | undefined, fraction = 0.15) {
  if (!extent || !Number.isFinite(extent.u) || !Number.isFinite(extent.v)) return 0;
  return fraction * Math.max(1e-6, Math.min(extent.u, extent.v));
}
