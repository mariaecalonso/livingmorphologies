/**
 * Verified material for Chapters 01, 03, 04, and 05.
 * Stills in `/demo/chapters/` come from `scripts/export-demo-chapter-stills.mjs`; figures name their source file.
 */
const STILL = "/demo/chapters";

export const archetypePlate = (archetypeId: string) => `${STILL}/archetype-${archetypeId}.webp`;

/** Chapter 01. Precedent plates and wording from the Typology Analysis board (`components/home-precedent.tsx`). */
export const PRECEDENT = {
  name: "Axel Springer",
  reading: ["Overlap", "Interconnected", "Mixed"],
  photos: [`${STILL}/precedent-photo-lattice.webp`, `${STILL}/precedent-photo-slabs.webp`, `${STILL}/precedent-photo-atrium.webp`],
  axon: `${STILL}/precedent-axon.webp`,
  traces: `${STILL}/precedent-graph-traces.webp`,
  mesh: `${STILL}/precedent-graph-mesh.webp`,
} as const;

/** The Generative System board (`public/assets/skill0/generative-system.svg`): three systems compared, Stigmergy carried forward. */
export const GENERATIVE_SYSTEMS = [
  {
    id: "ca",
    name: "Cellular Automata",
    src: `${STILL}/system-ca.webp`,
    traits: ["Cells", "Local rules", "Neighborhoods", "Iterative state change", "Emergent pattern"],
  },
  {
    id: "wfc",
    name: "Wave Function Collapse",
    src: `${STILL}/system-wfc.webp`,
    traits: ["Compatible states", "Constraint propagation", "Local adjacency", "Observation / collapse"],
  },
  {
    id: "stigmergy",
    name: "Stigmergy",
    src: `${STILL}/system-stigmergy.webp`,
    traits: ["Disturbed agents", "Environmental traces", "Indirect coordination", "Feedback through environment"],
    selected: true,
  },
] as const;

export const FILTERED_INTERESTS = [
  "Emergence",
  "Feedback loop",
  "Distributed organization",
  "Spatial network",
  "Environmental responsiveness",
  "Decentralized adaptive behavior",
] as const;

export const PHYSARUM = {
  src: `${STILL}/physarum-behavior.webp`,
  strengths: ["Form-finding processes", "Multi-criteria networks"],
  behavior: ["Explore", "Sense", "Move", "Reinforcement", "Adapt", "Repeat"],
  question: "How are descriptors and criteria translated into behavioral language?",
} as const;

/** Chapter 03. The published Vertical Void example (`scripts/export-skill3-workflow-summary.ts`). */
export const VERTICAL = {
  summary: "/demo/skill3/vertical-void/351-workflow.json",
  checks: ["One component", "Watertight", "Manifold"],
} as const;

/** Chapter 04. Studio material from `components/home-client.tsx`. The studio site is `data/skill5/workplace-brief.json`. The parcel is `data/skill5/herald-site.json`, kept for the drawn geometry. */
export const STUDIO = {
  name: "Living Morphologies Studio",
  focus: "Physarum",
  character: "Work + Leisure",
  disciplines: [
    { label: "Furniture", main: "/home/client/studio/furniture-main.png", details: ["/home/client/studio/furniture-detail-1.png", "/home/client/studio/furniture-detail-2.png"] },
    { label: "Fashion", main: "/home/client/studio/fashion-main.png", details: ["/home/client/studio/fashion-detail-1.png", "/home/client/studio/fashion-detail-2.png"] },
  ],
  process: ["Observe", "Simulate", "Design", "Fabricate"],
} as const;

export const ACTIVITIES = [
  { label: "Focused work", tone: "copper" },
  { label: "Collaborative work", tone: "white" },
  { label: "Waterfront gathering", tone: "teal" },
] as const;

export const SITE = {
  address: "1 Herald Plaza, Miami",
  /** Studio brief. Not the drawn parcel (`data/skill5/workplace-brief.json`). */
  brief: { widthFeet: 330, depthFeet: 820, areaSqFt: "270,600" },
  /** Parcel bounding box and county lot. The ring area is the drawn boundary (`data/skill5/herald-site.json`). */
  parcel: { widthFeet: 331, depthFeet: 830, lotSqFt: "246,390", ringSqFt: "254,251" },
  /** Biscayne Bay lies east of the parcel. The water polygon's west edge is the coastline; its east edge is a map closure. */
  waterfront: "East",
  axes: "X east · Z north · plan north up",
  plan: "/demo/overview/site-plan.webp",
  aerial: `${STILL}/herald-aerial.webp`,
} as const;

export type FloorProgram = "work" | "gathering" | "lobby";

/** The Client workflow's preliminary reading: five floors as ten half-floor units (`components/home-client-workflow.tsx`). */
export const FLOOR_SHARES: readonly { floor: number; start: number; span: number; program: FloorProgram }[] = [
  { floor: 1, start: 0, span: 0.5, program: "lobby" },
  { floor: 1, start: 0.5, span: 0.5, program: "gathering" },
  { floor: 2, start: 0, span: 1, program: "gathering" },
  { floor: 3, start: 0, span: 0.5, program: "work" },
  { floor: 3, start: 0.5, span: 0.5, program: "gathering" },
  { floor: 4, start: 0, span: 1, program: "work" },
  { floor: 5, start: 0, span: 1, program: "work" },
];

export const SHARE_LEGEND: readonly { program: FloorProgram; label: string; share: number }[] = [
  { program: "work", label: "Workspace", share: 50 },
  { program: "gathering", label: "Gathering", share: 40 },
  { program: "lobby", label: "Lobby", share: 10 },
];

/** Chapter 05. The Hybrid Connection example (`data/skill4/s04-test12-006.json`) and its 5 × 5 field (`lib/skill4/candidate-field.ts`). */
export const HYBRID = {
  id: "S04 TEST12 006",
  parents: ["Void Field", "Inserted Horizontal Plate"],
  faces: "N ↔ S",
  selected: { id: "H10", row: 1, column: 4 },
  parentAWeights: [0.95, 0.75, 0.5, 0.25, 0.05],
  intensity: [0.16, 0.34, 0.52, 0.74, 1],
  stills: Array.from({ length: 5 }, (_, index) => `/demo/overview/hybrid-${index + 1}.webp`),
} as const;

/**
 * Counted from `public/skill4/SKILL04-FINAL-CATALOG.json` (batch TEST_12).
 * Every entry stores a connector mesh. Parent bodies are not in that file. None of the 50 is marked selected.
 */
export const ASSEMBLIES = {
  total: 50,
  tiles: [
    { tiles: 2, count: 10 },
    { tiles: 4, count: 18 },
    { tiles: 5, count: 1 },
    { tiles: 6, count: 11 },
    { tiles: 8, count: 10 },
  ],
  arrangements: [
    { id: "linear", label: "Linear", count: 26 },
    { id: "grid", label: "Grid", count: 19 },
    { id: "t", label: "T", count: 4 },
    { id: "cross", label: "Cross", count: 1 },
  ],
} as const;

/**
 * Saved Site Integration configurations (`data/skill5/configurations.json`).
 * The exploratory C01 "Spatial check" record was removed. The schema and the next-id counter stay, so a later save can be stored.
 * Its render, `public/demo/overview/site-configuration.webp`, is not a shared module and is no longer shown.
 */
export const CONFIGURATIONS = {
  gridFeet: 20,
  saved: [] as readonly {
    id: string;
    name: string;
    role: string;
    modules: number;
    placed: string;
    program: string;
    programSource: string;
    assemblies: number;
    annotation: string;
  }[],
  compare: ["Module distribution", "Site occupation", "Vertical occupation"],
} as const;

/** Carved-mass set is N01–N24 for every archetype. Inserted Horizontal Plate's open criteria-hybrid set continues through N48, and N47 is the selected handoff. */
export const CONTINUATION_COUNTS = {
  carvedMass: 24,
  insertedHorizontalPlateOpen: 48,
  selectedOutsideCarvedMass: "N47",
} as const;
