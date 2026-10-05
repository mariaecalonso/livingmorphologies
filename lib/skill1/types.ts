import type { GroupId, Rating, RatingsMap, TypologyId } from "../types";

export type SourceCorner = "bottom-left" | "bottom-right";
export type DecayMode = "controlled" | "aggressive";
export type RandomnessMode = "low" | "medium" | "high";
export type CellClass =
  | "void"
  | "primary-void"
  | "circulation"
  | "secondary"
  | "mass"
  | "wall"
  | "room"
  | "source";

/**
 * How an archetype turns the Physarum skeleton into spatial topology.
 * Recipes choose a kind; they do not hard-code a drawing.
 */
export type TopologyKind = "around-absence" | "contained-interior" | "open-network";

export type Point = { x: number; y: number };

export type IntensityLabel = "Low" | "Medium" | "High";

export type TranslationTrace = {
  criterionId: string;
  criterion: string;
  category: GroupId | "system";
  rating: Rating;
  ratingLabel: string;
  ratingDescription?: string;
  descriptor?: string;
  target: string;
  biologicalLabel: string;
  biologicalValue: number;
  reason: string;
};

export type DescriptorRank = {
  category: GroupId;
  descriptor: string;
  belongs: boolean;
  rating: Rating | null;
  ratingLabel: string | null;
};

export type CriterionDescriptorRanking = {
  criterionId: string;
  criterion: string;
  category: GroupId;
  rating: Rating;
  ratingLabel: string;
  ratingDescription?: string;
  descriptor: string;
  ranks: Record<GroupId, DescriptorRank>;
  target: string;
  biologicalLabel: string;
  biologicalValue: number;
  reason: string;
};

export type BiologicalBehavior = {
  exploration: IntensityLabel;
  attraction: IntensityLabel;
  trailFollowing: IntensityLabel;
  reinforcement: IntensityLabel;
  decay: DecayMode;
  randomness: RandomnessMode;
};

export type BiologicalParams = {
  geometryVariation: number;
  scaleVariation: number;
  flowCoupling: number;
  permeability: number;
  networkDensity: number;
  directionalBias: number;
  attractionStrength: number;
  influenceRadius: number;
  nodeSpacing: number;
  persistence: number;
  sourcePermeability: number;
  nodeInteraction: number;
  geometricDisplacement: number;
  nodeRepetition: number;
  gamma: number;
  decay: number;
  decayMode: DecayMode;
  randomness: number;
  randomnessMode: RandomnessMode;
};

/**
 * Spatial recipes that descriptors imply. These are not extra criteria.
 * They locate WHERE qualities act on the field; ratings still set HOW MUCH.
 */
export type AttractorKind = "point" | "ring" | "line" | "curve";

/** A pull on the field. Point, circle, line, and curvy line can share one generation. */
export type FieldAttractor = {
  kind: AttractorKind;
  x: number;
  y: number;
  /** Line or curve end. Ignored for point and ring. */
  x2?: number;
  y2?: number;
  /** Curve bend. Ignored for point, ring, and line. */
  cx?: number;
  cy?: number;
  /** Spread for a point or line. Ring radius for a ring. Bend amount is separate. */
  radius?: number;
  /** Multiplier on the translated attraction strength. */
  strength?: number;
  /** Terraced stroke width at the start of this mark, in deposit units. */
  stroke?: number;
  /** Terraced stroke width at the end of this mark. Falls back to `stroke`. */
  stroke2?: number;
  /** Terraced spawn weight and ink amount on this mark. */
  mass?: number;
  /** Fraction of this mark that receives ink. */
  cover?: number;
  /** Where that covered fraction starts, 0–1 along the mark. */
  coverAt?: number;
  /** Ring only. Keeps the interior empty so the network loops around it. */
  hole?: boolean;
};

export type SpatialRecipe = {
  sourceCorner: SourceCorner;
  attractor: Point;
  /** Extra pulls. The primary attractor stays the recipe point above. */
  attractors?: FieldAttractor[];
  /** When set, the placed point is the simulation attractor. */
  attractorFixed?: boolean;
  /** When set, the field pull comes only from the placed attractors. */
  attractorsOnly?: boolean;
  /** High D at the attractor = visually exposed; low D = more enclosed. */
  coreExposure: number;
  /** Width of a lower-permeability collar around the attractor. */
  enclosureCollar: number;
  /** Minimum distance of secondary nodes from the attractor. */
  isolationRadius: number;
  /** How strongly secondary nodes prefer the attractor neighborhood. */
  clustering: number;
  /** Corridor width (cells) of the controlled approach from source → attractor. */
  approachWidth: number;
  /**
   * Stepped Amphitheater only. A growth field, not a drawing.
   * Terraces are the level sets agents prefer while depositing.
   */
  saField?: SteppedGrowthField;
};

export type SteppedGrowthField = {
  gx: number;
  gy: number;
  ex: number;
  ey: number;
  axis: number;
  curve: number;
  pitch: number;
  count: number;
  span: number;
  asymmetry: number;
  branch: number;
  branchAngle: number;
  gatherU: number;
  gatherV: number;
  throat: number;
  porosity: number;
  enclosure: number;
  phase: number;
  flare: number;
};

export type ArchetypeConfig = {
  id: string;
  name: string;
  typologyId: TypologyId;
  recipe: SpatialRecipe;
  /** Spatial relationship the network should produce, not a drawn shape. */
  topology: TopologyKind;
};

export type BiologicalTranslation = {
  archetypeId: string;
  archetypeName: string;
  typologyId: TypologyId;
  topology: TopologyKind;
  descriptors: Record<GroupId, string>;
  ratings: RatingsMap;
  params: BiologicalParams;
  recipe: SpatialRecipe;
  traces: TranslationTrace[];
  rankings: CriterionDescriptorRanking[];
  behavior: BiologicalBehavior;
};

export type Skill1Handoff = {
  skill: 1;
  typologyId: TypologyId;
  archetypeId: string;
  archetypeName: string;
  topology: TopologyKind;
  descriptors: Record<GroupId, string>;
  ratings: RatingsMap;
  traces: TranslationTrace[];
  rankings: CriterionDescriptorRanking[];
  params: BiologicalParams;
  recipe: SpatialRecipe;
  behavior: BiologicalBehavior;
  field: {
    size: number;
    height: number;
    sourceCorner: SourceCorner;
    attractor: Point;
  };
};

export type FieldSnapshot = {
  iteration: number;
  size: number;
  trailSize: number;
  trails: number[];
  occupancy: number[];
  agents: Point[];
  paths?: Array<{ x: number[]; y: number[] }>;
  source: Point;
  attractor: Point;
};

export type SimAgent = {
  x: number;
  y: number;
  heading: number;
  speed: number;
  trailStrength: number;
  pathX: number[];
  pathY: number[];
  /** Steps left to hold the current heading before sensing again. */
  hold: number;
};

export type SimulationState = {
  size: number;
  trailSize: number;
  iteration: number;
  maxIterations: number;
  converged: boolean;
  streak: number;
  totalDelta: number;
  seed: number;
  source: Point;
  attractor: Point;
  attraction: number[];
  permeabilityField: number[];
  occupancy: number[];
  trails: number[];
  flow: number[];
  agents: SimAgent[];
};

export type ArchitectureReading = {
  kind: TopologyKind;
  occupancy: number[];
  voidField: number[];
  massField: number[];
  cells: CellClass[];
  walls: Array<{ x1: number; y1: number; x2: number; y2: number }>;
  floors: Point[];
  voids: Point[];
  rooms: Point[];
  primaryVoids: Point[];
  strong: Point[];
  secondary: Point[];
  weak: Point[];
};

export type VizSettings = {
  agentCount: number;
  density: number;
  speed: number;
  trailDecay: number;
  showField: boolean;
  showAgents: boolean;
  showTrails: boolean;
  showAttraction: boolean;
};
