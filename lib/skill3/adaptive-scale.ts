import { BRANCHES, groupsForArchetype } from "../catalog";
import type { SimulationState } from "../skill1/types";
import type { Rating, RatingsMap, TypologyId } from "../types";
import { MODULE_SIZE_X } from "./envelope";
import { modulePivot } from "./twist";

/**
 * F04 Adaptive Scale.
 * The signed response is read from the catalog's Formal / Spatial / Atmospheric
 * groups. The live continuation applies that scale one step at a time.
 */
export type ScaleDirection = "expansion" | "contraction" | "neutral";

export type AdaptiveScaleConfig = {
  /** Smallest scale at a full contraction response. */
  contractionFloor: number;
  /** Largest scale at a full expansion response. */
  expansionCeiling: number;
  /** Responses inside this band stay at scale 1. */
  neutralBand: number;
};

export type AdaptiveScalePlan = {
  scaleDirection: ScaleDirection;
  /** 0 at neutral, 1 at the configured floor or ceiling. */
  scaleStrength: number;
  /** Scale reached at the end of the horizon. Z0 is always 1. */
  finalScale: number;
};

/** Bounds the live continuation can reach. Proportionality decides how much of this span is used. */
export const DEFAULT_ADAPTIVE_SCALE: AdaptiveScaleConfig = {
  contractionFloor: 0.75,
  expansionCeiling: 1.25,
  neutralBand: 0.08,
};

/**
 * High rating's effect on opening size. Medium contributes 0. Low is the opposite.
 * Shared criteria use weight 1. The typology-specific criterion on each branch uses weight 0.5.
 * Signs follow the catalog wording and the existing Skill 1 reading of social proximity as compression.
 */
const SCALE_ROLES: Record<string, 1 | -1> = {
  openness: 1,
  immersive: -1,
  centrality: 1,
  directionality: -1,
  receptivity: 1,
  "plate-articulation": -1,
  modularity: -1,
  collaboration: 1,
  "circulation-integration": 1,
  "spatial-permanence": 1,
  "social-proximity": -1,
};

/** Low keeps the change small. High allows the full floor-to-ceiling span. */
const PROPORTIONALITY_EXTENT: Record<Rating, number> = {
  0: 0.45,
  1: 0.7,
  2: 1,
};

const SHARED_WEIGHT = 1;
const SPECIFIC_WEIGHT = 0.5;
const CONTENT_EPSILON = 0.003;

export function assertAdaptiveScaleConfig(config: AdaptiveScaleConfig) {
  if (!Number.isFinite(config.contractionFloor) || config.contractionFloor <= 0 || config.contractionFloor >= 1) {
    throw new Error(`contractionFloor ${config.contractionFloor} must be in (0, 1)`);
  }
  if (!Number.isFinite(config.expansionCeiling) || config.expansionCeiling <= 1 || config.expansionCeiling > 1.5) {
    throw new Error(`expansionCeiling ${config.expansionCeiling} must be in (1, 1.5]`);
  }
  if (!Number.isFinite(config.neutralBand) || config.neutralBand < 0 || config.neutralBand >= 1) {
    throw new Error(`neutralBand ${config.neutralBand} must be in [0, 1)`);
  }
}

function criterionWeight(id: string, typologyId: TypologyId) {
  for (const branch of BRANCHES) {
    if (branch.shared.some((item) => item.id === id)) return SHARED_WEIGHT;
    if (branch.specific[typologyId].id === id) return SPECIFIC_WEIGHT;
  }
  return 0;
}

/** Catalog ratings → one scale plan. The same ratings always return the same plan. */
export function deriveAdaptiveScale(
  typologyId: TypologyId,
  ratings: RatingsMap,
  config: AdaptiveScaleConfig = DEFAULT_ADAPTIVE_SCALE,
): AdaptiveScalePlan {
  assertAdaptiveScaleConfig(config);
  const groups = groupsForArchetype(typologyId, {
    id: "",
    name: "",
    ratings,
    descriptors: { formal: "", spatial: "", atmospheric: "" },
  }, ratings);
  let weighted = 0;
  let weightSum = 0;
  let proportionality: Rating = 1;
  for (const group of groups) {
    for (const criterion of group.criteria) {
      if (criterion.id === "proportionality") {
        proportionality = criterion.rating;
        continue;
      }
      const role = SCALE_ROLES[criterion.id];
      const weight = criterionWeight(criterion.id, typologyId);
      if (!role || weight === 0) continue;
      weighted += role * (criterion.rating - 1) * weight;
      weightSum += weight;
    }
  }
  const response = weightSum > 0 ? Math.max(-1, Math.min(1, weighted / weightSum)) : 0;
  const extent = PROPORTIONALITY_EXTENT[proportionality];
  if (Math.abs(response) <= config.neutralBand) {
    return { scaleDirection: "neutral", scaleStrength: 0, finalScale: 1 };
  }
  const scaleStrength = Math.min(1, Math.abs(response) * extent);
  if (response > 0) {
    return {
      scaleDirection: "expansion",
      scaleStrength,
      finalScale: 1 + scaleStrength * (config.expansionCeiling - 1),
    };
  }
  return {
    scaleDirection: "contraction",
    scaleStrength,
    finalScale: 1 - scaleStrength * (1 - config.contractionFloor),
  };
}

/** 1 at Z0, `finalScale` at the horizon. */
export function sampleScale(iteration: number, z0Iteration: number, horizon: number, finalScale: number) {
  const span = Math.max(1, horizon);
  const progress = Math.min(1, Math.max(0, (iteration - z0Iteration) / span));
  return 1 + (finalScale - 1) * progress;
}

function nearest(trails: ArrayLike<number>, size: number, x: number, y: number) {
  if (x < -0.5 || y < -0.5 || x >= size - 0.5 || y >= size - 0.5) return 0;
  const ix = Math.min(size - 1, Math.max(0, Math.round(x)));
  const iy = Math.min(size - 1, Math.max(0, Math.round(y)));
  return trails[iy * size + ix];
}

/** Largest expansion that keeps occupied cells inside the module. Never below 1. */
export function expansionLimit(trails: ArrayLike<number>, trailSize: number, fieldSize = MODULE_SIZE_X) {
  const pivot = modulePivot(trailSize, fieldSize);
  let maxDx = 0;
  let maxDy = 0;
  for (let y = 0; y < trailSize; y += 1) {
    const row = y * trailSize;
    const dy = Math.abs(y - pivot.y);
    for (let x = 0; x < trailSize; x += 1) {
      if (trails[row + x] <= CONTENT_EPSILON) continue;
      maxDx = Math.max(maxDx, Math.abs(x - pivot.x));
      maxDy = Math.max(maxDy, dy);
    }
  }
  const roomX = Math.max(1, pivot.x - 1);
  const roomY = Math.max(1, pivot.y - 1);
  const limitX = maxDx > 0 ? roomX / maxDx : Number.POSITIVE_INFINITY;
  const limitY = maxDy > 0 ? roomY / maxDy : Number.POSITIVE_INFINITY;
  return Math.max(1, Math.min(limitX, limitY));
}

/**
 * Scales field content about the module center by nearest sample.
 * Empty cells stay empty, so the opening changes size without a gray fringe.
 * Scale above 1 enlarges openings. Scale below 1 draws them inward.
 */
export function scaleTrail(trails: ArrayLike<number>, trailSize: number, scale: number) {
  if (scale === 1) return Array.from(trails);
  const pivot = modulePivot(trailSize);
  const out = new Array<number>(trailSize * trailSize);
  for (let y = 0; y < trailSize; y += 1) {
    const row = y * trailSize;
    for (let x = 0; x < trailSize; x += 1) {
      const sx = pivot.x + (x - pivot.x) / scale;
      const sy = pivot.y + (y - pivot.y) / scale;
      out[row + x] = nearest(trails, trailSize, sx, sy);
    }
  }
  return out;
}

/**
 * Scales the live trail field and agent positions about the module center by `factor`.
 * `factor` is this step's ratio, not the cumulative target. Headings stay put.
 * Agents that leave the field are brought back onto the domain the stepper uses.
 */
export function applyLiveScale(state: SimulationState, factor: number) {
  if (!Number.isFinite(factor) || factor === 1) return;
  if (factor <= 0) throw new Error(`live scale ${factor} is not positive`);
  state.trails = scaleTrail(state.trails, state.trailSize, factor);
  const pivotX = state.size / 2;
  const pivotY = state.size / 2;
  const margin = 0.18;
  const limit = Math.max(margin, state.size - margin);
  for (const agent of state.agents) {
    agent.x = pivotX + (agent.x - pivotX) * factor;
    agent.y = pivotY + (agent.y - pivotY) * factor;
    for (let i = 0; i < agent.pathX.length; i += 1) {
      agent.pathX[i] = pivotX + (agent.pathX[i] - pivotX) * factor;
      agent.pathY[i] = pivotY + (agent.pathY[i] - pivotY) * factor;
    }
    if (!Number.isFinite(agent.x) || !Number.isFinite(agent.y) || !Number.isFinite(agent.heading)) {
      throw new Error("live scale produced a non-finite agent");
    }
    agent.x = Math.min(limit, Math.max(margin, agent.x));
    agent.y = Math.min(limit, Math.max(margin, agent.y));
  }
}
