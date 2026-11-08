/**
 * One saved Vertical Void catalog run as the Physarum Logic Lab shows it: its locked settings and the
 * Lab's own analysis of that run at its final iteration. Written by `scripts/export-run-analysis.ts`.
 */
export const LAB_RUN_FILE = "/demo/skill1/vertical-void/analysis-run-23.json";

export type LabRunAxis = {
  id: string;
  label: string;
  target: number | null;
  generated: number | null;
  difference: number | null;
};

export type LabRunSample = {
  iteration: number;
  occupied: number | null;
  branches: number | null;
  meanTrail: number;
  stabilization: number | null;
  regime: string;
};

export type LabRunMark = {
  kind: string;
  x: number;
  y: number;
  x2?: number;
  y2?: number;
  radius?: number;
};

export type LabRunData = {
  run: number;
  seed: number;
  agents: number;
  iterations: number;
  archetypeName: string;
  plate: string;
  recording: string;
  settings: {
    sensorDistance: number;
    sensorAngle: number;
    turnAngle: number;
    moveDistance: number;
    deposit: number;
    diffusion: number;
    /** Catalog runs cap trail diffusion; this is the value the run used. */
    diffusionUsed: number;
    trailInfluence: number;
    resistance: number;
    fieldSize: number;
    attractors: string[];
  };
  /** The attractors this saved run used, in field coordinates. */
  marks: LabRunMark[];
  sampleInterval: number;
  dna: LabRunAxis[];
  growth: LabRunSample[];
  topology: {
    size: number;
    mask: number[];
    skeleton: number[];
    endpoints: number[];
    branches: number[];
    branchCount: number | null;
    endpointCount: number | null;
    componentCount: number | null;
    connectivity: number | null;
    cycleRank: number | null;
    averagePathLength: number | null;
    diameter: number | null;
  };
  density: { size: number; trail: number[] };
  direction: {
    bins: number[];
    coherence: number | null;
    bias: number | null;
    meanSegmentLength: number | null;
    x: number[];
    y: number[];
    count: number[];
  };
};
