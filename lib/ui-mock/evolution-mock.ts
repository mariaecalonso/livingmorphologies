/**
 * UI demo data for the 2D Evolution interface only.
 * Not produced by the evaluator or any search code; replace with the
 * evolutionary controller's output once it exists.
 */

export type MockGenerationStatus = "done" | "running" | "waiting";

export type MockGeneration = {
  id: string;
  index: number;
  status: MockGenerationStatus;
  evaluated: number;
  feasible: number;
  pareto: number;
  archived: number;
};

export type MockCandidate = {
  id: number;
  generation: number;
  formal: number;
  spatial: number;
  atmospheric: number;
  pareto: boolean;
  paretoRank: number;
  archived: boolean;
  /** Seed for the placeholder morphology drawing. */
  previewSeed: number;
};

export const MOCK_GENERATION_COUNT = 6;
export const MOCK_POPULATION_SIZE = 80;

export const MOCK_OPERATIONS = ["Generating", "Measuring", "Evaluating", "Selecting", "Evolving"] as const;

export const MOCK_PROGRESS = {
  activeGeneration: 3,
  evaluated: 47,
  feasible: 42,
  paretoFront: 14,
  archive: 21,
  operation: "Measuring" as (typeof MOCK_OPERATIONS)[number],
  operationDetail: "Measuring morphology",
  currentCandidate: 207,
};

export const MOCK_GENERATIONS: MockGeneration[] = [
  { id: "G01", index: 1, status: "done", evaluated: 80, feasible: 61, pareto: 11, archived: 6 },
  { id: "G02", index: 2, status: "done", evaluated: 80, feasible: 69, pareto: 17, archived: 9 },
  { id: "G03", index: 3, status: "running", evaluated: 47, feasible: 42, pareto: 14, archived: 6 },
  { id: "G04", index: 4, status: "waiting", evaluated: 0, feasible: 0, pareto: 0, archived: 0 },
  { id: "G05", index: 5, status: "waiting", evaluated: 0, feasible: 0, pareto: 0, archived: 0 },
  { id: "G06", index: 6, status: "waiting", evaluated: 0, feasible: 0, pareto: 0, archived: 0 },
];

function seeded(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

const clamp01 = (value: number) => Math.min(0.99, Math.max(0.05, value));

/**
 * Mock objective-space points for a completed six-generation search.
 * Front / archive flags are assigned by hand-shaped sampling, not computed.
 */
function buildCandidates(): MockCandidate[] {
  const random = seeded(20260928);
  const perGeneration = 22;
  const list: MockCandidate[] = [];
  for (let generation = 1; generation <= MOCK_GENERATION_COUNT; generation += 1) {
    for (let index = 0; index < perGeneration; index += 1) {
      const theta = random() * Math.PI * 0.5;
      const phi = random() * Math.PI * 0.5;
      const front = generation >= 3 && random() < 0.12 + generation * 0.035;
      const reach = front ? 0.9 + random() * 0.08 : 0.35 + generation * 0.06 + random() * 0.28;
      const formal = clamp01(reach * Math.sin(phi) * Math.cos(theta) * 1.25 + 0.08);
      const spatial = clamp01(reach * Math.sin(phi) * Math.sin(theta) * 1.25 + 0.08);
      const atmospheric = clamp01(reach * Math.cos(phi) * 1.25 + 0.08);
      list.push({
        id: (generation - 1) * MOCK_POPULATION_SIZE + index * 3 + 1,
        generation,
        formal,
        spatial,
        atmospheric,
        pareto: front,
        paretoRank: front ? 1 : 2 + Math.floor(random() * 5),
        archived: false,
        previewSeed: Math.floor(random() * 1e9),
      });
    }
  }
  const front = list.filter((item) => item.pareto);
  front.forEach((item, index) => {
    item.archived = index % 5 !== 2;
  });
  return list;
}

export const MOCK_CANDIDATES: MockCandidate[] = buildCandidates();

export const MOCK_ARCHIVE: MockCandidate[] = MOCK_CANDIDATES.filter((item) => item.archived).slice(0, 18);

/** One placeholder lineage followed from G01 through the active generation. */
export const MOCK_LINEAGE = { seed: 734219, founder: 2 };

export const formatCandidateId = (id: number) => `#${String(id).padStart(3, "0")}`;
export const formatGeneration = (generation: number) => `G${String(generation).padStart(2, "0")}`;
