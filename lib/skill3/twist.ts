import { MODULE_SIZE_X, MODULE_SIZE_Y } from "./envelope";
import type { AcceptedSample } from "./events";

/**
 * Post-Z0 rotation of one future's stored samples.
 * The live continuation is not rotated, so event decisions stay on the unrotated field.
 */
export type TwistConfig = {
  /** Radians reached at the end of the continuation horizon. */
  maxTwistAngle: number;
};

/** One-third turn across the horizon. Visible in the stack, and the openings stay recognizable. */
export const DEFAULT_MAX_TWIST_ANGLE = Math.PI / 3;

export const DEFAULT_TWIST: TwistConfig = {
  maxTwistAngle: DEFAULT_MAX_TWIST_ANGLE,
};

export function assertTwistConfig(config: TwistConfig) {
  if (!Number.isFinite(config.maxTwistAngle) || config.maxTwistAngle <= 0 || config.maxTwistAngle > Math.PI) {
    throw new Error(`maxTwistAngle ${config.maxTwistAngle} must be in (0, π]`);
  }
}

/** 0 at Z0, `maxTwistAngle` at the horizon. Intermediate samples keep their iteration fraction. */
export function twistAngle(iteration: number, z0Iteration: number, horizon: number, maxTwistAngle = DEFAULT_MAX_TWIST_ANGLE) {
  const span = Math.max(1, horizon);
  const progress = Math.min(1, Math.max(0, (iteration - z0Iteration) / span));
  return maxTwistAngle * progress;
}

/** Center of the 20×20 module, in trail pixels. The field maps uniformly onto that module. */
export function modulePivot(trailSize: number, fieldSize = MODULE_SIZE_X) {
  const scale = trailSize / fieldSize;
  return { x: (fieldSize / 2) * scale, y: (MODULE_SIZE_Y / 2) * scale };
}

function bilinear(trails: ArrayLike<number>, size: number, x: number, y: number) {
  if (x < 0 || y < 0 || x > size - 1 || y > size - 1) return 0;
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = Math.min(size - 1, x0 + 1);
  const y1 = Math.min(size - 1, y0 + 1);
  const tx = x - x0;
  const ty = y - y0;
  const row0 = y0 * size;
  const row1 = y1 * size;
  const a = trails[row0 + x0];
  const b = trails[row0 + x1];
  const c = trails[row1 + x0];
  const d = trails[row1 + x1];
  return a * (1 - tx) * (1 - ty) + b * tx * (1 - ty) + c * (1 - tx) * ty + d * tx * ty;
}

/**
 * Rotates field content counterclockwise around the pivot by `angle` radians.
 * Each output cell is one sample of the source, so the turn is not accumulated.
 */
export function rotateTrail(
  trails: ArrayLike<number>,
  trailSize: number,
  angle: number,
  pivot = modulePivot(trailSize),
) {
  const out = new Array<number>(trailSize * trailSize);
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  for (let y = 0; y < trailSize; y += 1) {
    const dy = y - pivot.y;
    const row = y * trailSize;
    for (let x = 0; x < trailSize; x += 1) {
      const dx = x - pivot.x;
      const sx = pivot.x + cos * dx + sin * dy;
      const sy = pivot.y - sin * dx + cos * dy;
      out[row + x] = bilinear(trails, trailSize, sx, sy);
    }
  }
  return out;
}

/** Rewrites a post-Z0 sample's trail. Z0 is left at 0°. Does not write the live simulation. */
export function twistSample(sample: AcceptedSample, z0Iteration: number, horizon: number, config: TwistConfig = DEFAULT_TWIST) {
  assertTwistConfig(config);
  if (sample.iteration <= z0Iteration) return;
  const angle = twistAngle(sample.iteration, z0Iteration, horizon, config.maxTwistAngle);
  sample.trails = rotateTrail(sample.trails, sample.trailSize, angle, modulePivot(sample.trailSize));
}
