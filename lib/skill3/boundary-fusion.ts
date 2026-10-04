import type { FieldAttractor } from "../skill1/types";

/**
 * Post-Z0 field transform for F02. It reads the posed opening disks and relaxes
 * only the trail wall between disks that already sit near each other.
 * Distant disks are skipped. The recipe, attractors, and Z0 parent are not written.
 *
 * Subtle and strong stay as inactive comparison presets. The live path is Medium.
 */
export const BOUNDARY_FUSION_PRESETS = {
  subtle: { proximity: 1.5, relaxationRadius: 1.7, blendStrength: 1 },
  medium: { proximity: 1.8, relaxationRadius: 2.4, blendStrength: 1 },
  strong: { proximity: 2.4, relaxationRadius: 3.4, blendStrength: 1 },
} as const satisfies Record<string, BoundaryFusionConfig>;

/** Locked F02 Boundary Fusion. Same values as the medium test preset. */
export const DEFAULT_BOUNDARY_FUSION: BoundaryFusionConfig = BOUNDARY_FUSION_PRESETS.medium;

export type BoundaryFusionPresetName = keyof typeof BOUNDARY_FUSION_PRESETS;

export type BoundaryFusionConfig = {
  proximity: number;
  relaxationRadius: number;
  blendStrength: number;
};

export type CircularOpening = {
  x: number;
  y: number;
  radius: number;
};

export type BoundaryFusionReport = {
  pairsConsidered: number;
  pairsFused: number;
  cellsRelaxed: number;
};

/** Same disk rule the stepper uses for an attractor hole. Lines and curves are not openings. */
export function circularOpenings(marks: readonly FieldAttractor[]): CircularOpening[] {
  const openings: CircularOpening[] = [];
  for (const mark of marks) {
    if (mark.kind === "line" || mark.kind === "curve") continue;
    const radius = Math.max(0.2, mark.radius ?? (mark.kind === "ring" ? 4 : 1.6));
    if (!(radius > 0)) continue;
    openings.push({ x: mark.x, y: mark.y, radius });
  }
  return openings;
}

/** Edge-to-edge gap. Negative means the disks overlap. */
export function openingGap(a: CircularOpening, b: CircularOpening) {
  return Math.hypot(a.x - b.x, a.y - b.y) - a.radius - b.radius;
}

/** Pairs whose edge gap is within the proximity threshold. */
export function fusedOpeningPairCount(openings: readonly CircularOpening[], config: BoundaryFusionConfig) {
  let count = 0;
  for (let a = 0; a < openings.length; a += 1) {
    for (let b = a + 1; b < openings.length; b += 1) {
      if (openingGap(openings[a], openings[b]) <= config.proximity) count += 1;
    }
  }
  return count;
}

export function assertBoundaryFusionConfig(config: BoundaryFusionConfig) {
  if (!Number.isFinite(config.proximity) || config.proximity <= 0) {
    throw new Error(`proximity ${config.proximity} must be a positive number`);
  }
  if (!Number.isFinite(config.relaxationRadius) || config.relaxationRadius <= 0) {
    throw new Error(`relaxationRadius ${config.relaxationRadius} must be a positive number`);
  }
  if (!Number.isFinite(config.blendStrength) || config.blendStrength <= 0 || config.blendStrength > 1) {
    throw new Error(`blendStrength ${config.blendStrength} must be in (0, 1]`);
  }
}

/**
 * Lowers trail values on the shared wall between nearby openings.
 * Cells inside an opening, and cells that are not close to both edges, stay as they are.
 */
export function fuseOpeningBoundaries(
  trails: number[],
  trailSize: number,
  fieldSize: number,
  openings: readonly CircularOpening[],
  config: BoundaryFusionConfig = DEFAULT_BOUNDARY_FUSION,
): BoundaryFusionReport {
  assertBoundaryFusionConfig(config);
  const report: BoundaryFusionReport = { pairsConsidered: 0, pairsFused: 0, cellsRelaxed: 0 };
  if (openings.length < 2 || trailSize < 2 || fieldSize <= 0) return report;
  const scale = trailSize / fieldSize;
  const keep = 1 - config.blendStrength;
  for (let a = 0; a < openings.length; a += 1) {
    for (let b = a + 1; b < openings.length; b += 1) {
      report.pairsConsidered += 1;
      const left = openings[a];
      const right = openings[b];
      if (openingGap(left, right) > config.proximity) continue;
      report.pairsFused += 1;
      const reach = config.relaxationRadius;
      const minX = Math.max(0, Math.floor((Math.min(left.x - left.radius, right.x - right.radius) - reach) * scale));
      const maxX = Math.min(trailSize - 1, Math.ceil((Math.max(left.x + left.radius, right.x + right.radius) + reach) * scale));
      const minY = Math.max(0, Math.floor((Math.min(left.y - left.radius, right.y - right.radius) - reach) * scale));
      const maxY = Math.min(trailSize - 1, Math.ceil((Math.max(left.y + left.radius, right.y + right.radius) + reach) * scale));
      for (let y = minY; y <= maxY; y += 1) {
        const fy = y / scale;
        const row = y * trailSize;
        for (let x = minX; x <= maxX; x += 1) {
          const fx = x / scale;
          const fromLeft = Math.hypot(fx - left.x, fy - left.y) - left.radius;
          const fromRight = Math.hypot(fx - right.x, fy - right.y) - right.radius;
          if (fromLeft < 0 || fromRight < 0) continue;
          if (fromLeft > reach || fromRight > reach) continue;
          const index = row + x;
          const current = trails[index];
          if (current <= 0) continue;
          trails[index] = current * keep;
          report.cellsRelaxed += 1;
        }
      }
    }
  }
  return report;
}
