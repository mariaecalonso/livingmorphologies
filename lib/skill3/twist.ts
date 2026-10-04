import type { SimulationState } from "../skill1/types";
import { MODULE_SIZE_X, MODULE_SIZE_Y } from "./envelope";

/**
 * Live post-Z0 rotation for F03.
 * Each continuation step turns the clone by only the new fraction of the horizon.
 * Event sampling then reads that already turned state.
 */
export type TwistConfig = {
  /** Radians reached at the end of the continuation horizon. */
  maxTwistAngle: number;
};

/** Two-thirds of a turn across the horizon. */
export const DEFAULT_MAX_TWIST_ANGLE = (2 * Math.PI) / 3;

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

const TWO_PI = Math.PI * 2;

function wrapAngle(angle: number) {
  let next = angle % TWO_PI;
  if (next < 0) next += TWO_PI;
  return next;
}

/** Turns one point counterclockwise about the pivot, matching `rotateTrail`. */
export function rotateOffset(dx: number, dy: number, angle: number) {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return { x: cos * dx - sin * dy, y: sin * dx + cos * dy };
}

/**
 * Turns the live trail field, agent positions, headings, and stored path points
 * by `angle` radians. `angle` is the step increment, not the cumulative target.
 * Agents that leave the field are brought back onto the domain the stepper uses.
 */
export function applyLiveTwist(state: SimulationState, angle: number) {
  if (!Number.isFinite(angle) || angle === 0) return;
  state.trails = rotateTrail(state.trails, state.trailSize, angle, modulePivot(state.trailSize));
  const pivotX = state.size / 2;
  const pivotY = state.size / 2;
  const margin = 0.18;
  const limit = Math.max(margin, state.size - margin);
  for (const agent of state.agents) {
    const moved = rotateOffset(agent.x - pivotX, agent.y - pivotY, angle);
    agent.x = pivotX + moved.x;
    agent.y = pivotY + moved.y;
    agent.heading = wrapAngle(agent.heading + angle);
    for (let i = 0; i < agent.pathX.length; i += 1) {
      const path = rotateOffset(agent.pathX[i] - pivotX, agent.pathY[i] - pivotY, angle);
      agent.pathX[i] = pivotX + path.x;
      agent.pathY[i] = pivotY + path.y;
    }
    if (!Number.isFinite(agent.x) || !Number.isFinite(agent.y) || !Number.isFinite(agent.heading)) {
      throw new Error("live twist produced a non-finite agent");
    }
    agent.x = Math.min(limit, Math.max(margin, agent.x));
    agent.y = Math.min(limit, Math.max(margin, agent.y));
  }
}
