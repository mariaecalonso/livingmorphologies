/**
 * How a program wants its cluster organized.
 * These biases steer attachment and the morphology score. They do not set a fixed shape.
 * Vertical is the model's up axis, the T/B direction (Y).
 */
export type VerticalBehavior = "strong" | "moderate" | "secondary" | "limited";

export type MorphologyProfile = {
  programId: string;
  vertical: VerticalBehavior;
  /** Distinct occupied height bands wanted once a cluster has several tiles. */
  minLevels: number;
  /** Major axis divided by the other two combined. Above this, elongation starts to hurt. */
  elongationTolerance: number;
  /** Meaningfully different connection directions wanted for a larger cluster. */
  minDirections: number;
  /**
   * Smaller plan principal spread divided by the larger one.
   * A line is near 0. A field of centers is near 1.
   */
  minPlanSpread: number;
  /** A narrow plan can pass when the void is held from the side and from above or below. */
  narrowIfSection: boolean;
  /** Plan directions that must meet the habitable void. */
  minEnclosureDirections: number;
  /** Branches that leave the longest path by more than a stub. */
  minMeaningfulBranches: number;
};

/**
 * Shape gates. These run before the 100-point score.
 * Plan axes are the model's horizontal X and Z. Y is up.
 */
export const SHAPE_GATES = {
  /** Short plan side at or under this multiple of the module is one module deep. */
  oneModuleDepth: 1.35,
  /** The long plan side must reach this multiple of the short side. */
  oneModuleLongFactor: 2.2,
  /** Longest path this close to every tile is the whole cluster. */
  spineShare: 0.84,
  /** A branch this many tiles off the path is still a stub. */
  shallowBranchDepth: 1,
} as const;

export const MORPHOLOGY_WEIGHTS = {
  enclosure: 30,
  planSpread: 20,
  branching: 15,
  direction: 10,
  vertical: 15,
  program: 10,
} as const;

/** Combined score, out of 100, required along with no hard failure flag. */
export const MORPHOLOGY_PASS = 62;

const PROFILES: Record<string, Omit<MorphologyProfile, "programId">> = {
  "public-lobby": { vertical: "strong", minLevels: 2, elongationTolerance: 1.55, minDirections: 3, minPlanSpread: 0.28, narrowIfSection: true, minEnclosureDirections: 2, minMeaningfulBranches: 1 },
  "private-staff-lobby": { vertical: "moderate", minLevels: 1, elongationTolerance: 1.7, minDirections: 2, minPlanSpread: 0.34, narrowIfSection: true, minEnclosureDirections: 2, minMeaningfulBranches: 1 },
  "architecture-design-studio": { vertical: "secondary", minLevels: 1, elongationTolerance: 1.85, minDirections: 3, minPlanSpread: 0.36, narrowIfSection: false, minEnclosureDirections: 2, minMeaningfulBranches: 1 },
  "product-design-studio": { vertical: "secondary", minLevels: 1, elongationTolerance: 1.75, minDirections: 3, minPlanSpread: 0.34, narrowIfSection: false, minEnclosureDirections: 2, minMeaningfulBranches: 1 },
  "prototyping-fabrication-lab": { vertical: "limited", minLevels: 1, elongationTolerance: 1.9, minDirections: 2, minPlanSpread: 0.32, narrowIfSection: false, minEnclosureDirections: 2, minMeaningfulBranches: 1 },
  "biological-research-lab": { vertical: "moderate", minLevels: 2, elongationTolerance: 1.6, minDirections: 3, minPlanSpread: 0.36, narrowIfSection: false, minEnclosureDirections: 2, minMeaningfulBranches: 1 },
  "interdisciplinary-collaboration-hub": { vertical: "strong", minLevels: 2, elongationTolerance: 1.35, minDirections: 4, minPlanSpread: 0.42, narrowIfSection: false, minEnclosureDirections: 3, minMeaningfulBranches: 1 },
  "public-exhibition-gallery": { vertical: "moderate", minLevels: 2, elongationTolerance: 2.6, minDirections: 2, minPlanSpread: 0.22, narrowIfSection: false, minEnclosureDirections: 2, minMeaningfulBranches: 1 },
  "indoor-public-gathering": { vertical: "moderate", minLevels: 1, elongationTolerance: 1.5, minDirections: 3, minPlanSpread: 0.4, narrowIfSection: false, minEnclosureDirections: 3, minMeaningfulBranches: 1 },
  "waterfront-gathering": { vertical: "moderate", minLevels: 1, elongationTolerance: 1.5, minDirections: 3, minPlanSpread: 0.4, narrowIfSection: false, minEnclosureDirections: 3, minMeaningfulBranches: 1 },
  "public-restaurant": { vertical: "moderate", minLevels: 1, elongationTolerance: 1.55, minDirections: 3, minPlanSpread: 0.38, narrowIfSection: false, minEnclosureDirections: 3, minMeaningfulBranches: 1 },
  "staff-dining": { vertical: "limited", minLevels: 1, elongationTolerance: 1.6, minDirections: 3, minPlanSpread: 0.36, narrowIfSection: false, minEnclosureDirections: 2, minMeaningfulBranches: 1 },
};

export function programMorphologyProfile(programId: string): MorphologyProfile {
  const profile = PROFILES[programId] ?? {
    vertical: "moderate" as const,
    minLevels: 1,
    elongationTolerance: 1.7,
    minDirections: 2,
    minPlanSpread: 0.34,
    narrowIfSection: false,
    minEnclosureDirections: 2,
    minMeaningfulBranches: 1,
  };
  return { programId, ...profile };
}
