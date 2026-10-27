/**
 * Four-phase emphasis curve. This spreads the phase targets.
 * It is not the continuation horizon. `resolveAdaptiveHorizon` chooses that later.
 */
const EMPHASIS_CURVE = 64;

export type EmphasisFamily = "formal" | "spatial" | "atmospheric";

export type ContinuationFocus =
  | "formal"
  | "spatial"
  | "atmospheric"
  | "formal+spatial"
  | "formal+atmospheric"
  | "spatial+atmospheric"
  | "formal+spatial+atmospheric";

/** Four phase multipliers around the authored baseline. 1 leaves that family at baseline. */
export type PhaseTargets = readonly [number, number, number, number];

export type EmphasisSchedule = {
  formal: PhaseTargets;
  spatial: PhaseTargets;
  atmospheric: PhaseTargets;
};

const BASELINE: PhaseTargets = [1, 1, 1, 1];

/**
 * Canonical four-phase targets from the temporal-emphasis diagnostic.
 * Unlisted families stay at the baseline. Variants rotate or reverse these rows.
 */
const CANONICAL: Record<ContinuationFocus, EmphasisSchedule> = {
  formal: {
    formal: [1, 1.5, 0.72, 1.42],
    spatial: BASELINE,
    atmospheric: BASELINE,
  },
  spatial: {
    formal: BASELINE,
    spatial: [1, 1.48, 0.7, 1.4],
    atmospheric: BASELINE,
  },
  atmospheric: {
    formal: BASELINE,
    spatial: BASELINE,
    atmospheric: [1, 1.48, 0.7, 1.42],
  },
  "formal+spatial": {
    formal: [1.42, 1.1, 0.78, 1.18],
    spatial: [0.82, 1.12, 1.48, 1.16],
    atmospheric: BASELINE,
  },
  "formal+atmospheric": {
    formal: [1.4, 1.05, 0.8, 1.15],
    spatial: BASELINE,
    atmospheric: [0.85, 1.15, 1.48, 1.18],
  },
  "spatial+atmospheric": {
    formal: BASELINE,
    spatial: [1.4, 0.85, 1.15, 1.2],
    atmospheric: [0.82, 1.45, 1.05, 1.22],
  },
  "formal+spatial+atmospheric": {
    formal: [1.45, 0.95, 0.8, 1.22],
    spatial: [0.8, 1.45, 1, 1.18],
    atmospheric: [0.85, 0.9, 1.48, 1.25],
  },
};

export const EMPHASIS_PLAN: readonly { focus: ContinuationFocus; count: number; families: readonly EmphasisFamily[] }[] = [
  { focus: "formal", count: 3, families: ["formal"] },
  { focus: "spatial", count: 3, families: ["spatial"] },
  { focus: "atmospheric", count: 3, families: ["atmospheric"] },
  { focus: "formal+spatial", count: 3, families: ["formal", "spatial"] },
  { focus: "formal+atmospheric", count: 3, families: ["formal", "atmospheric"] },
  { focus: "spatial+atmospheric", count: 3, families: ["spatial", "atmospheric"] },
  { focus: "formal+spatial+atmospheric", count: 6, families: ["formal", "spatial", "atmospheric"] },
];

export function modulateEmphasis(offset: number, targets: readonly number[]) {
  const t = offset / EMPHASIS_CURVE;
  const x = Math.min(targets.length - 1, Math.max(0, t * targets.length - 0.5));
  const i = Math.min(targets.length - 2, Math.floor(x));
  const u = x - i;
  const s = u * u * (3 - 2 * u);
  return targets[i] + (targets[i + 1] - targets[i]) * s;
}

function rotate(targets: PhaseTargets, shift: number): PhaseTargets {
  const steps = ((shift % targets.length) + targets.length) % targets.length;
  return targets.map((_, index) => targets[(index + steps) % targets.length]) as unknown as PhaseTargets;
}

function reverse(targets: PhaseTargets): PhaseTargets {
  return [...targets].reverse() as unknown as PhaseTargets;
}

/** Deterministic phase order for one focus variant. Integrated branches 4 and 5 reverse the canonical curve. */
export function emphasisSchedule(focus: ContinuationFocus, variant: number): EmphasisSchedule {
  const plan = EMPHASIS_PLAN.find((item) => item.focus === focus);
  if (!plan) throw new Error(`unknown continuation focus ${focus}`);
  if (!Number.isInteger(variant) || variant < 0 || variant >= plan.count) {
    throw new Error(`variant ${variant} is outside ${focus}`);
  }
  const canonical = CANONICAL[focus];
  const reversed = plan.count === 6 && variant >= 4;
  const shift = reversed ? variant - 4 : variant;
  const turn = (targets: PhaseTargets) => rotate(reversed ? reverse(targets) : targets, shift);
  return {
    formal: turn(canonical.formal),
    spatial: turn(canonical.spatial),
    atmospheric: turn(canonical.atmospheric),
  };
}

export type BranchEmphasis = {
  id: string;
  index: number;
  focus: ContinuationFocus;
  families: readonly EmphasisFamily[];
  variant: number;
  schedule: EmphasisSchedule;
};

/** The authored schedule for one N01–N24 branch. Branches outside that range have no descriptor recipe. */
export function branchEmphasis(branchIndex: number): BranchEmphasis | null {
  if (!Number.isInteger(branchIndex) || branchIndex < 1 || branchIndex > 24) return null;
  let cursor = 1;
  for (const group of EMPHASIS_PLAN) {
    if (branchIndex < cursor + group.count) {
      const variant = branchIndex - cursor;
      return {
        id: `N${String(branchIndex).padStart(2, "0")}`,
        index: branchIndex,
        focus: group.focus,
        families: group.families,
        variant,
        schedule: emphasisSchedule(group.focus, variant),
      };
    }
    cursor += group.count;
  }
  return null;
}
