import { CLIENT_ACTIVITY_SEED, UNIVERSAL_CRITERIA } from "@/lib/skill5/client-compatibility";
import { moduleLength } from "./contract";
import { modelUnitsToFeet } from "./scale";

/**
 * Gap between connected tiles, in model units.
 * One module is the 20 ft registration cell, and 1 model unit is 1 foot.
 * The current connector still uses its own gap. This profile does not move tiles.
 */
const STEP = moduleLength(0.12);
const MIN_GAP = moduleLength(0.15);
const MIN_SPAN = moduleLength(0.08);

/** Room-type starting gap. The six shared ratings move this. It is not the final distance. */
const TENDENCY = {
  open: { center: moduleLength(0.85), variability: moduleLength(0.18) },
  shared: { center: moduleLength(0.8), variability: moduleLength(0.22) },
  medium: { center: moduleLength(0.6), variability: moduleLength(0.15) },
  controlled: { center: moduleLength(0.5), variability: moduleLength(0.1) },
  tight: { center: moduleLength(0.4), variability: moduleLength(0.08) },
} as const;

export type SpacingTendency = keyof typeof TENDENCY;

const PROGRAM_TENDENCY: Record<string, SpacingTendency> = {
  "public-lobby": "open",
  "private-staff-lobby": "tight",
  "architecture-design-studio": "medium",
  "product-design-studio": "medium",
  "prototyping-fabrication-lab": "controlled",
  "biological-research-lab": "controlled",
  "interdisciplinary-collaboration-hub": "shared",
  "public-exhibition-gallery": "open",
  "indoor-public-gathering": "open",
  "waterfront-gathering": "open",
  "public-restaurant": "open",
  "staff-dining": "open",
};

export type SpacingBias = "open" | "medium" | "tight";
export type VariabilityLabel = "low" | "medium" | "high";

export type SpacingModifiers = {
  /** Higher openness widens the gap. */
  openness: number;
  /** Higher visibility widens the gap and raises the minimum. */
  visibility: number;
  /** Higher connectivity narrows the gap. */
  connectivity: number;
  /** Higher immersive narrows the gap. */
  immersive: number;
  /** Higher complexity widens the range between near and far gaps. */
  complexity: number;
  /** Higher proportionality narrows that range. */
  proportionality: number;
};

export type SpacingProfile = {
  programId: string;
  baseline: SpacingTendency;
  baseCenter: number;
  min: number;
  max: number;
  variability: number;
  modifiers: SpacingModifiers;
  bias: SpacingBias;
  variabilityLabel: VariabilityLabel;
};

function pull(value: number, weight: number) {
  return (value - 1) * (weight / 2);
}

function biasFor(center: number): SpacingBias {
  if (center >= moduleLength(0.75)) return "open";
  if (center >= moduleLength(0.52)) return "medium";
  return "tight";
}

function variabilityLabel(variability: number, center: number): VariabilityLabel {
  const share = variability / Math.max(center, STEP);
  if (share < 0.22) return "low";
  if (share < 0.4) return "medium";
  return "high";
}

/** Spacing behavior for one program, from its room type and the six shared desires. */
export function spacingProfile(programId: string): SpacingProfile | null {
  const tendency = PROGRAM_TENDENCY[programId];
  const activity = CLIENT_ACTIVITY_SEED.activities.find((item) => item.id === programId);
  if (!tendency || !activity) return null;
  const baseline = TENDENCY[tendency];
  const desire = new Map(activity.desires.map((item) => [item.criterionId, item]));
  const shared = Object.fromEntries(UNIVERSAL_CRITERIA.map((id) => {
    const row = desire.get(id);
    return [id, row ? pull(row.value, row.weight) : 0];
  })) as Record<(typeof UNIVERSAL_CRITERIA)[number], number>;

  const modifiers: SpacingModifiers = {
    openness: shared.openness * STEP,
    visibility: shared.visibility * STEP,
    connectivity: -shared.connectivity * STEP,
    immersive: -shared.immersive * STEP,
    complexity: shared.complexity * STEP,
    proportionality: -shared.proportionality * STEP,
  };
  const center = baseline.center + modifiers.openness + modifiers.visibility + modifiers.connectivity + modifiers.immersive;
  const variability = Math.max(MIN_SPAN, baseline.variability + modifiers.complexity + modifiers.proportionality);
  const visibilityFloor = Math.max(0, shared.visibility) * STEP * 0.35;
  let min = center - variability + visibilityFloor;
  let max = center + variability;
  if (min < MIN_GAP) min = MIN_GAP;
  if (max < min + MIN_SPAN) max = min + MIN_SPAN;
  return {
    programId,
    baseline: tendency,
    baseCenter: baseline.center,
    min,
    max,
    variability,
    modifiers,
    bias: biasFor(center),
    variabilityLabel: variabilityLabel(variability, center),
  };
}

export function spacingRangeLabel(profile: SpacingProfile | null) {
  if (!profile) return "unavailable";
  return `${Math.round(modelUnitsToFeet(profile.min))}–${Math.round(modelUnitsToFeet(profile.max))} ft`;
}

export function spacingBiasLabel(profile: SpacingProfile | null) {
  if (!profile) return "unavailable";
  return `${profile.bias} / ${profile.variabilityLabel} variability`;
}
