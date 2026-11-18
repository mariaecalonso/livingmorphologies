/**
 * Skill 6 cluster contract.
 * Source meshes stay in the isomesh frame: X plan, Y up, Z plan-north.
 * Skill 6 reads that frame and converts it. X and Y are horizontal. Z is vertical.
 * The 20×20×20 registration cell is metadata. It does not decide a connection.
 */

export const SKILL6_CONTRACT = "skill6-cluster-v1" as const;

export const SKILL6_ALGORITHM = "rule-based-envelope-v1" as const;

/** Same seating grid as v1, plus tangent slides and bounded backtracking. */
export const SKILL6_SHIFT_ALGORITHM = "rule-based-envelope-v2" as const;

/** v2 pose library with full per-depth coverage and a world-space collision cache. */
export const SKILL6_COVERAGE_ALGORITHM = "rule-based-envelope-v2.1" as const;

/** Optional comparison. The catalog does not use this as its placement method. */
export const SKILL6_PLANAR_ALGORITHM = "rule-based-surface-v2" as const;

/** Initial Clustering Lab. These call the shared geometry path. They are not catalog methods. */
export const SKILL6_GRAPH_ALGORITHM = "graph-based-v1" as const;
export const SKILL6_WFC_ALGORITHM = "wave-function-collapse-v1" as const;
export const SKILL6_EVOLUTION_ALGORITHM = "evolutionary-search-v1" as const;

export type Skill6Algorithm =
  | typeof SKILL6_ALGORITHM
  | typeof SKILL6_SHIFT_ALGORITHM
  | typeof SKILL6_COVERAGE_ALGORITHM
  | typeof SKILL6_PLANAR_ALGORITHM
  | typeof SKILL6_GRAPH_ALGORITHM
  | typeof SKILL6_WFC_ALGORITHM
  | typeof SKILL6_EVOLUTION_ALGORITHM;

/** Shared morphological objective. Integrated is the sum of the other three, not a fourth engine. */
export type ClusterMorphology = "compact" | "branching" | "vertical" | "integrated";

export type ClusterEngine = "rule-based" | "graph-based" | "wave-function-collapse" | "evolutionary-search";

export type SearchStats = {
  evaluations: number;
  acceptedPoses: number;
  backtracks: number;
  milliseconds: number;
  exhausted: boolean;
  /** A depth stopped before every stored pose was tried. */
  truncated: boolean;
  /** Poses still queued when the search stopped. A reached target can leave some untried. */
  untried: number;
  geometricRejections: number;
  rejectionCounts: { intersection: number; containment: number; contact: number };
  /** Null means every pose at a depth is eligible. v2 uses 20. */
  depthLimit: number | null;
  stop: "reached" | "exhausted" | "geometric";
  /** Candidates skipped because their growth direction is not allowed. Present only when a direction rule was set. */
  directionRejections?: number;
  /** Scored selection only. The chosen placement and the other poses that also passed. */
  placements?: { step: number; chosen: string; score: number; world: string; alternatives: { world: string; score: number; note: string }[] }[];
  /** Experimental ranking profile. Absent on the baseline search. */
  organization?: ClusterMorphology;
  /** Initial Clustering Lab engine. Absent on catalog and earlier experiments. */
  engine?: ClusterEngine;
  /** Which generation procedure produced this record. */
  trace?: string;
  /** Present when Spatial Organization uses an experimental profile past the first ranking. */
  profile?: 2 | 3;
  /** Directions among poses that passed revalidation. Present on profile 2 and 3. */
  passedDirections?: Partial<Record<GrowthDirection, number>>;
  /** Poses that passed and came from the compatibility atlas. */
  atlasAccepted?: number;
  /** Upright surface poses that passed. Profile 3. */
  uprightAccepted?: number;
  /** Slides that passed against two tiles at once. Profile 3. */
  dualAccepted?: number;
};

/** Names reserved before the Initial Clustering Lab. The lab runs them as separate engines. The catalog does not. */
export const SKILL6_LATER_ALGORITHMS = ["graph-growth", "wave-function-collapse", "evolutionary-search"] as const;

export const REGISTRATION_CELL = 20;

export const REGISTRATION_HALF = REGISTRATION_CELL / 2;

export const REGISTRATION_VOLUME = REGISTRATION_CELL ** 3;

/** Bands written into generated records and the catalog rebuild. The lab does not display these. */
export const SIZE_BANDS = {
  small: { min: 2, max: 6 },
  medium: { min: 7, max: 10 },
  large: { min: 11, max: null },
} as const;

/** Lab classification from tiles placed. Stored record labels keep SIZE_BANDS. */
export const DISPLAY_SIZE_BANDS = {
  small: { min: 2, max: 3 },
  medium: { min: 4, max: 6 },
  large: { min: 7, max: null },
} as const;

export type ClusterSize = keyof typeof SIZE_BANDS;

export type Vec3 = [number, number, number];

/** Column-major. Columns are the images of local X, Y, and Z. */
export type Mat3 = readonly [
  number, number, number,
  number, number, number,
  number, number, number,
];

export type Quarter = 0 | 1 | 2 | 3;

export type Skill6Pose = {
  quarterZ: Quarter;
  mirrorX: boolean;
  basis: Mat3;
  translation: Vec3;
};

/** Region id. Built from a continuous patch of similar normals, not from a bounding-box face. */
export type PatchId = string;

export type ContactVerdict =
  | "surface-contact"
  | "near-contact"
  | "point-contact"
  | "scattered"
  | "gap"
  | "bbox-only"
  | "intersection"
  | "containment";

export type ContactSample = {
  host: Vec3;
  guest: Vec3;
  gap: number;
};

export type RejectedAttachment = {
  reason: string;
  point: Vec3;
  normal: Vec3;
  area: number;
  residualGap: number | null;
};

export type ContactRelation = {
  hostId: string;
  guestId: string;
  hostPatch: PatchId;
  guestPatch: PatchId;
  verdict: ContactVerdict;
  /** Closest sample on the coherent region. Not sufficient by itself. */
  minSurfaceDistance: number | null;
  /** Farthest in-tolerance sample on that same region. */
  residualGap: number | null;
  /** Area of one connected region. Disconnected proximity is not added in. */
  contactArea: number;
  coherentRegions: number;
  /** Dot product of the posed patch normals. External contact is negative. */
  normalAlignment: number;
  hostNormal: Vec3;
  guestNormal: Vec3;
  samples: ContactSample[];
  rejected: RejectedAttachment[];
  intersectingTriangles: number;
  /** Deepest triangle crossing. A value at or below maxPenetration is seating, not a rejected bite. */
  deepestCrossing: number;
  /** Manifold boolean overlap when it was run. Null when the kernel was not used. */
  overlapVolume: number | null;
  attachment: "envelope" | "planar";
  searchNote: string;
  registrationOverlap: boolean;
  tightBox: "separated" | "touch" | "overlap";
  tolerance: number;
};

export type ClusterTile = {
  instanceId: string;
  archetypeId: string;
  moduleId: string;
  typologyId: string;
  name: string;
  pose: Skill6Pose;
};

export type MetricAvailability = "measured" | "derived" | "unavailable";

export type ClusterMetrics = {
  tileCount: number;
  size: ClusterSize | null;
  typologyDistribution: Record<string, number>;
  dominantTypology: string | null;
  dominantTied: boolean;
  archetypeDiversity: number;
  uniqueArchetypes: number;
  /** Mean of each tile's void inside its own 20-cell. Stored fraction, or mesh volume / 8000 when the report omitted it. */
  tileCellVoidFraction: number | null;
  tileCellVoidFractionAvailability: MetricAvailability;
  /** 1 − combinedSolid / tight bounding volume of the posed cluster. */
  clusterVoidFraction: number | null;
  clusterVoidFractionAvailability: MetricAvailability;
  solidVolume: number;
  solidVolumeAvailability: MetricAvailability;
  overlapVolume: number;
  boundingVolume: number;
  surfaceExposure: number;
  surfaceExposureAvailability: MetricAvailability;
  components: number;
  contactEdges: number;
  connected: boolean;
  /** Mean absolute difference of normalized box proportions between unique archetypes. 0 when only one archetype is present. */
  geometricDiversity: number;
};

export type ClusterStatus = "accepted" | "unsuccessful";

export type ClusterRecord = {
  contract: typeof SKILL6_CONTRACT;
  id: string;
  status: ClusterStatus;
  reason: string | null;
  algorithm: Skill6Algorithm;
  seed: number;
  parameters: Skill6Parameters;
  tiles: ClusterTile[];
  contacts: ContactRelation[];
  components: string[][];
  metrics: ClusterMetrics | null;
  search?: SearchStats;
  /** Present only on newly generated or explicitly regenerated clusters. */
  assembly?: ClusterAssembly;
};

export const SKILL6_ASSEMBLY_CONTRACT = "skill6-assembly-v1" as const;

/** Allowed growth for assembled clusters. Downward growth is not a step; a stack only rises. */
export const SKILL6_GROWTH_DIRECTIONS = ["+X", "-X", "+Y", "-Y", "+Z"] as const;

export type GrowthDirection = "+X" | "-X" | "+Y" | "-Y" | "+Z" | "-Z";

/** Validated implicit-blend prototype for near-contact joints. Only the connected bridge body is kept. */
export const SKILL6_PATCH_DEFAULTS = { radius: 0.32, cell: 0.12, maxCells: 168, largestOnly: true, spacingReach: true, bodyFraction: 0.15, regionMinArea: 1 } as const;

export type JointClassification = "direct-contact" | "patched-near-contact" | "failed-patch";

export type JointBounds = { min: Vec3; max: Vec3; extent: Vec3; center: Vec3 };

export type ClusterJoint = {
  id: string;
  hostInstanceId: string;
  guestInstanceId: string;
  hostArchetypeId: string;
  guestArchetypeId: string;
  /** The growth edge that placed the guest. Secondary contacts are false. */
  primary: boolean;
  direction: GrowthDirection;
  placement: "stacked" | "lateral";
  classification: JointClassification;
  contact: {
    verdict: ContactVerdict;
    residualGap: number | null;
    contactArea: number;
    normalAlignment: number;
    deepestCrossing: number;
    overlapVolume: number | null;
  };
  patch: {
    method: "implicit-blend";
    radius: number;
    cell: number;
    /** Index into the stored patch meshes. Null when the blend did not produce a mesh. */
    meshIndex: number | null;
    samples: number;
    triangles: number;
    volume: number | null;
    hostOverlap: number | null;
    guestOverlap: number | null;
    /** Seated footprint of the patch, after the ground lift. */
    footprint: JointBounds | null;
    status: string;
    components: number | null;
    cavities: number | null;
    selfIntersections: number;
    oneSolid: boolean;
    buildMilliseconds: number;
    validationMilliseconds: number;
  } | null;
  note: string;
};

export type GrowthStep = {
  step: number;
  instanceId: string;
  archetypeId: string;
  hostInstanceId: string | null;
  direction: GrowthDirection | null;
  placement: "seed" | "stacked" | "lateral";
  depth: number;
};

export type ClusterGraph = {
  nodes: { instanceId: string; parent: string | null; children: string[]; depth: number; degree: number }[];
  edges: { host: string; guest: string; primary: boolean; classification: JointClassification }[];
  branchPoints: string[];
  leaves: string[];
  maxDepth: number;
};

export type SolidSummary = {
  status: string;
  /** Solid bodies. A sealed pocket of air inside a body is counted in `cavities`, not here. */
  components: number | null;
  cavities: number | null;
  volume: number | null;
  triangles: number;
  minZ: number;
};

export type ClusterAssembly = {
  contract: typeof SKILL6_ASSEMBLY_CONTRACT;
  sourceClusterId: string;
  patchSettings: { radius: number; cell: number; maxCells: number; largestOnly: boolean; spacingReach?: boolean; bodyFraction?: number; regionMinArea?: number };
  ground: { lift: number; minZBefore: number; minZAfter: number };
  /** Original poses stay on `tiles`. These are the same poses plus the one ground lift. */
  seatedTiles: { instanceId: string; pose: Skill6Pose }[];
  growth: GrowthStep[];
  joints: ClusterJoint[];
  graph: ClusterGraph;
  counts: Record<JointClassification, number>;
  union: SolidSummary;
  refined: SolidSummary & {
    method: string;
    parameters: Record<string, number>;
    /** Sealed pockets under the fill volume, removed before smoothing. */
    cavitiesFilled: number;
    maxShift: number;
    meanShift: number;
    sharpEdgesBefore: number;
    sharpEdgesAfter: number;
    seamSharpEdgesBefore: number;
    seamSharpEdgesAfter: number;
  };
  /** Relative path of the stored meshes: raw union, refined union, and patches. */
  meshFile: string;
  milliseconds: { patches: number; union: number; refine: number; total: number };
};

export type Skill6Parameters = {
  /** Maximum residual gap across one coherent attachment region. */
  contactTolerance: number;
  /** Minimum area of that one region. Scattered samples are not summed. */
  minContactArea: number;
  /** Seating gap the search aims for. Residual at or below this is surface contact; up to contactTolerance is near contact. */
  targetGap: number;
  /** Outward patch normals must oppose by at least this much (dot product <= -value). */
  normalOpposition: number;
  /** Smallest continuous region kept as an attachment candidate. */
  minPatchArea: number;
  /** A triangle crossing shallower than this is seating noise. Deeper crossings are penetration. */
  maxPenetration: number;
  maxIntersectingTriangles: number;
  sizeBands: typeof SIZE_BANDS;
};

export const SKILL6_PARAMETERS: Skill6Parameters = {
  contactTolerance: 0.18,
  minContactArea: 3.2,
  targetGap: 0.05,
  normalOpposition: 0.82,
  minPatchArea: 2.8,
  maxPenetration: 0.02,
  maxIntersectingTriangles: 0,
  sizeBands: SIZE_BANDS,
};

/** Isomesh display point to Skill 6. Source Y (up) becomes Z. Source Z (north) becomes Y. */
export function sourcePointToSkill6(x: number, y: number, z: number): Vec3 {
  return [x, z, y];
}

export function sizeOfCount(count: number, bands = SIZE_BANDS): ClusterSize | null {
  if (count >= bands.large.min) return "large";
  if (count >= bands.medium.min && count <= (bands.medium.max ?? count)) return "medium";
  if (count >= bands.small.min && count <= (bands.small.max ?? count)) return "small";
  return null;
}

/** Size shown in the lab. Uses the tiles placed, not the size stored on the record. */
export function displaySizeOfCount(count: number): ClusterSize | null {
  const bands = DISPLAY_SIZE_BANDS;
  if (count >= bands.large.min) return "large";
  if (count >= bands.medium.min && count <= (bands.medium.max ?? count)) return "medium";
  if (count >= bands.small.min && count <= (bands.small.max ?? count)) return "small";
  return null;
}

export function displaySizeLabel(size: ClusterSize): string {
  const band = DISPLAY_SIZE_BANDS[size];
  return band.max == null ? `${band.min}+` : `${band.min}–${band.max}`;
}
