import { FIELD_SIZE } from "../skill1/maps";
import { legalOrientationsFor } from "../skill1/run-variants";
import { attractorFromRatings } from "../skill1/translate";
import type { BiologicalTranslation, FieldAttractor, Point } from "../skill1/types";

/**
 * Realization genome. A legal pose of the canonical Skill 1
 * translation; every translated biological quantity stays locked.
 * Drift is in Skill 1 field units (FIELD_SIZE per side), the same units as
 * mark coordinates and the attractor.
 */
export type Genome = {
  driftX: number;
  driftY: number;
  uniformRadiusScale: number;
  /** Radians, from the archetype's legal set in lib/skill1/run-variants.ts. */
  orientation: number;
};

export const GENOME_BOUNDS = {
  driftMagnitude: 1.2,
  radiusScaleMin: 0.9,
  radiusScaleMax: 1.1,
} as const;

export const CANONICAL_GENOME: Genome = { driftX: 0, driftY: 0, uniformRadiusScale: 1, orientation: 0 };

const ORIENTATION_TOLERANCE = 1e-9;

function mapPoint(x: number, y: number, origin: Point, genome: Genome): Point {
  const dx = x - origin.x;
  const dy = y - origin.y;
  const cos = Math.cos(genome.orientation);
  const sin = Math.sin(genome.orientation);
  return {
    x: origin.x + dx * cos - dy * sin + genome.driftX,
    y: origin.y + dx * sin + dy * cos + genome.driftY,
  };
}

function mapMark(mark: FieldAttractor, origin: Point, genome: Genome): FieldAttractor {
  const a = mapPoint(mark.x, mark.y, origin, genome);
  const next: FieldAttractor = {
    ...mark,
    x: a.x,
    y: a.y,
    radius: mark.radius == null ? undefined : mark.radius * genome.uniformRadiusScale,
  };
  if (mark.x2 != null && mark.y2 != null) {
    const b = mapPoint(mark.x2, mark.y2, origin, genome);
    next.x2 = b.x;
    next.y2 = b.y;
  }
  if (mark.cx != null && mark.cy != null) {
    const c = mapPoint(mark.cx, mark.cy, origin, genome);
    next.cx = c.x;
    next.cy = c.y;
  }
  return next;
}

/** Poses the canonical marks and attractor about the rating-placed attractor. Nothing else changes. */
export function applyGenome(base: BiologicalTranslation, genome: Genome): BiologicalTranslation {
  const origin = attractorFromRatings(base, FIELD_SIZE);
  return {
    ...base,
    recipe: {
      ...base.recipe,
      attractor: mapPoint(origin.x, origin.y, origin, genome),
      attractors: (base.recipe.attractors ?? []).map((mark) => mapMark(mark, origin, genome)),
      attractorFixed: true,
    },
  };
}

const outside = (x: number, y: number) => x < 0 || y < 0 || x > FIELD_SIZE - 1 || y > FIELD_SIZE - 1;

/** Control points (attractor, mark ends, curve bends) that leave the field. */
function controlPointsOutside(placed: BiologicalTranslation) {
  const { attractor, attractors = [] } = placed.recipe;
  const flags: string[] = [];
  if (outside(attractor.x, attractor.y)) flags.push("attractor-out-of-field");
  for (const mark of attractors) {
    if (
      outside(mark.x, mark.y) ||
      (mark.x2 != null && mark.y2 != null && outside(mark.x2, mark.y2)) ||
      (mark.cx != null && mark.cy != null && outside(mark.cx, mark.cy))
    ) {
      flags.push("mark-out-of-field");
      break;
    }
  }
  return flags;
}

const sameAngle = (a: number, b: number) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b))) <= ORIENTATION_TOLERANCE;

/** The archetype's supported orientations that keep every control point inside the field at zero drift. */
export function legalOrientations(base: BiologicalTranslation): number[] {
  return legalOrientationsFor(base.archetypeId).filter(
    (orientation) => controlPointsOutside(applyGenome(base, { ...CANONICAL_GENOME, orientation })).length === 0,
  );
}

export function driftMagnitude(genome: Genome) {
  return Math.hypot(genome.driftX, genome.driftY);
}

/** Reasons the genome is not a legal v1 realization. Empty when legal. */
export function genomeViolations(base: BiologicalTranslation, genome: Genome, legal = legalOrientations(base)): string[] {
  const reasons: string[] = [];
  const values = [genome.driftX, genome.driftY, genome.uniformRadiusScale, genome.orientation];
  if (!values.every(Number.isFinite)) return ["non-finite"];
  if (driftMagnitude(genome) > GENOME_BOUNDS.driftMagnitude + 1e-12) reasons.push("drift-exceeds-bound");
  if (genome.uniformRadiusScale < GENOME_BOUNDS.radiusScaleMin || genome.uniformRadiusScale > GENOME_BOUNDS.radiusScaleMax) {
    reasons.push("radius-out-of-range");
  }
  if (!legal.some((angle) => sameAngle(angle, genome.orientation))) reasons.push("orientation-not-legal");
  reasons.push(...controlPointsOutside(applyGenome(base, genome)));
  return reasons;
}

export function isLegalGenome(base: BiologicalTranslation, genome: Genome, legal = legalOrientations(base)) {
  return genomeViolations(base, genome, legal).length === 0;
}

/** Informational: a point or ring disk that crosses the field edge. Also true for some canonical poses. */
export function genomeNotes(base: BiologicalTranslation, genome: Genome): string[] {
  for (const mark of applyGenome(base, genome).recipe.attractors ?? []) {
    if ((mark.kind === "point" || mark.kind === "ring") && mark.radius != null) {
      const r = mark.radius;
      if (mark.x - r < 0 || mark.y - r < 0 || mark.x + r > FIELD_SIZE - 1 || mark.y + r > FIELD_SIZE - 1) {
        return ["disk-crosses-boundary"];
      }
    }
  }
  return [];
}

/** Scales the drift vector back onto the legal disk when it is longer. */
export function projectDrift(driftX: number, driftY: number) {
  const length = Math.hypot(driftX, driftY);
  if (length <= GENOME_BOUNDS.driftMagnitude) return { driftX, driftY };
  const k = GENOME_BOUNDS.driftMagnitude / length;
  return { driftX: driftX * k, driftY: driftY * k };
}

export function clampRadiusScale(value: number) {
  return Math.min(GENOME_BOUNDS.radiusScaleMax, Math.max(GENOME_BOUNDS.radiusScaleMin, value));
}

export function genomeKey(genome: Genome) {
  const r = (value: number) => (Math.round(value * 1e6) / 1e6).toFixed(6);
  return `${r(genome.driftX)}|${r(genome.driftY)}|${r(genome.uniformRadiusScale)}|${r(genome.orientation)}`;
}
