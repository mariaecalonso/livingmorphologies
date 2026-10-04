import { mulberry32 } from "../physarum";
import { FIELD_SIZE } from "./maps";
import type { SlimeControls } from "./slime-controls";
import type { BiologicalParams, FieldAttractor, FieldSnapshot, SpatialRecipe } from "./types";
import type { MorphFeatures } from "./run-morphology";

const CENTER = (FIELD_SIZE - 1) / 2;
const EDGE = 1.35;
const lim = (value: number) => Math.min(FIELD_SIZE - EDGE, Math.max(EDGE, value));

type Rng = () => number;
type Pair = [number, number];

export type SequenceKind =
  | "dumbbell-h"
  | "dumbbell-v"
  | "dumbbell-d"
  | "beads-diag"
  | "beads-vert"
  | "zigzag-h"
  | "zigzag-v"
  | "serpentine"
  | "y-axis"
  | "l-path"
  | "wide-stretch"
  | "corner-span";

export type GrowthMode =
  | "mass-beads"
  | "filament-web"
  | "soft-bloom"
  | "sharp-trace"
  | "heavy-mass"
  | "line-rooms"
  | "curve-rooms"
  | "point-cluster"
  | "mixed-marks"
  | "sparse-field"
  | "dense-pack"
  | "wander"
  | "committed"
  | "weak-pull"
  | "strong-pull"
  | "wide-sensors"
  | "micro-step"
  | "decay-fast"
  | "decay-slow"
  | "asymmetric-mix";

export const SEQUENCE_FAMILIES: SequenceKind[] = [
  "dumbbell-h",
  "dumbbell-v",
  "dumbbell-d",
  "zigzag-h",
  "zigzag-v",
  "serpentine",
  "beads-diag",
  "beads-vert",
  "y-axis",
  "y-axis",
  "l-path",
];

export const GROWTH_MODES: GrowthMode[] = [
  "mass-beads",
  "filament-web",
  "soft-bloom",
  "sharp-trace",
  "heavy-mass",
  "line-rooms",
  "curve-rooms",
  "point-cluster",
  "mixed-marks",
  "sparse-field",
  "dense-pack",
  "wander",
  "committed",
  "weak-pull",
  "strong-pull",
  "wide-sensors",
  "micro-step",
  "decay-fast",
  "decay-slow",
  "asymmetric-mix",
];

type ChamberStyle = "point" | "cluster" | "stroke" | "arc" | "mixed";
type NeckStyle = "line" | "curve" | "dots" | "mixed";

type GrowthSpec = {
  chamber: ChamberStyle;
  neck: NeckStyle;
  agents: Pair;
  origin: Pair;
  scale: Pair;
  clustering: Pair;
  isolation: Pair;
  approach: Pair;
  exposure: Pair;
  slime: {
    persistence: Pair;
    trailInfluence: Pair;
    sensorAngle: Pair;
    sensorDistance: Pair;
    turnAngle: Pair;
    stepSize: Pair;
    deposit: Pair;
    depositWidth: Pair;
    diffusion: Pair;
    decay: Pair;
    resistance: Pair;
    randomness: Pair;
    trailCap: Pair;
  };
  params: Partial<BiologicalParams>;
};

const GROWTH_SPECS: Record<GrowthMode, GrowthSpec> = {
  "mass-beads": {
    chamber: "point",
    neck: "line",
    agents: [380, 460],
    origin: [-1.2, 1.2],
    scale: [0.97, 1.03],
    clustering: [0.55, 0.72],
    isolation: [2.2, 3.2],
    approach: [1.1, 1.6],
    exposure: [0.28, 0.45],
    slime: {
      persistence: [0.7, 0.84],
      trailInfluence: [1.2, 1.6],
      sensorAngle: [0.16, 0.28],
      sensorDistance: [0.45, 0.75],
      turnAngle: [0.14, 0.24],
      stepSize: [0.12, 0.17],
      deposit: [0.07, 0.11],
      depositWidth: [0.9, 1.15],
      diffusion: [0.006, 0.014],
      decay: [0.978, 0.988],
      resistance: [0.14, 0.26],
      randomness: [0.05, 0.12],
      trailCap: [1.1, 1.4],
    },
    params: { attractionStrength: 0.72, networkDensity: 0.48, permeability: 0.42, flowCoupling: 0.55 },
  },
  "filament-web": {
    chamber: "point",
    neck: "curve",
    agents: [460, 520],
    origin: [-2.4, 2.4],
    scale: [0.92, 1.06],
    clustering: [0.18, 0.34],
    isolation: [3.4, 5.2],
    approach: [2.4, 3.6],
    exposure: [0.62, 0.88],
    slime: {
      persistence: [0.22, 0.42],
      trailInfluence: [0.35, 0.7],
      sensorAngle: [0.55, 0.95],
      sensorDistance: [0.9, 1.5],
      turnAngle: [0.45, 0.85],
      stepSize: [0.2, 0.32],
      deposit: [0.03, 0.06],
      depositWidth: [0.85, 1.05],
      diffusion: [0.02, 0.05],
      decay: [0.96, 0.975],
      resistance: [0.02, 0.12],
      randomness: [0.42, 0.78],
      trailCap: [0.7, 1.05],
    },
    params: { attractionStrength: 0.38, networkDensity: 0.72, permeability: 0.78, geometryVariation: 0.82, randomness: 0.22 },
  },
  "soft-bloom": {
    chamber: "point",
    neck: "curve",
    agents: [240, 320],
    origin: [-1.8, 1.8],
    scale: [0.88, 1.02],
    clustering: [0.6, 0.82],
    isolation: [2.8, 4],
    approach: [2, 3.2],
    exposure: [0.7, 0.92],
    slime: {
      persistence: [0.4, 0.62],
      trailInfluence: [0.8, 1.2],
      sensorAngle: [0.28, 0.5],
      sensorDistance: [0.7, 1.2],
      turnAngle: [0.22, 0.4],
      stepSize: [0.16, 0.24],
      deposit: [0.1, 0.16],
      depositWidth: [2.1, 3.2],
      diffusion: [0.12, 0.24],
      decay: [0.984, 0.994],
      resistance: [0.04, 0.16],
      randomness: [0.12, 0.28],
      trailCap: [1.3, 1.7],
    },
    params: { attractionStrength: 0.58, networkDensity: 0.36, permeability: 0.7, scaleVariation: 0.78 },
  },
  "sharp-trace": {
    chamber: "point",
    neck: "line",
    agents: [180, 260],
    origin: [-2.8, 2.8],
    scale: [0.9, 1.05],
    clustering: [0.22, 0.4],
    isolation: [3.6, 5.4],
    approach: [0.8, 1.3],
    exposure: [0.2, 0.38],
    slime: {
      persistence: [0.8, 0.9],
      trailInfluence: [1.5, 1.9],
      sensorAngle: [0.08, 0.16],
      sensorDistance: [0.28, 0.48],
      turnAngle: [0.06, 0.14],
      stepSize: [0.09, 0.13],
      deposit: [0.028, 0.05],
      depositWidth: [0.82, 0.98],
      diffusion: [0, 0.004],
      decay: [0.948, 0.962],
      resistance: [0.22, 0.4],
      randomness: [0.02, 0.07],
      trailCap: [0.55, 0.85],
    },
    params: { attractionStrength: 0.82, networkDensity: 0.22, permeability: 0.28, directionalBias: 0.78 },
  },
  "heavy-mass": {
    chamber: "point",
    neck: "line",
    agents: [480, 560],
    origin: [-1, 1],
    scale: [0.98, 1.06],
    clustering: [0.7, 0.9],
    isolation: [1.8, 2.6],
    approach: [1.6, 2.4],
    exposure: [0.18, 0.34],
    slime: {
      persistence: [0.62, 0.8],
      trailInfluence: [1.4, 1.85],
      sensorAngle: [0.12, 0.22],
      sensorDistance: [0.4, 0.7],
      turnAngle: [0.1, 0.2],
      stepSize: [0.11, 0.16],
      deposit: [0.16, 0.22],
      depositWidth: [1.6, 2.4],
      diffusion: [0.01, 0.03],
      decay: [0.988, 0.996],
      resistance: [0.28, 0.5],
      randomness: [0.04, 0.1],
      trailCap: [1.5, 1.8],
    },
    params: { attractionStrength: 0.88, networkDensity: 0.62, flowCoupling: 0.82, permeability: 0.32 },
  },
  "line-rooms": {
    chamber: "stroke",
    neck: "line",
    agents: [320, 420],
    origin: [-2, 2],
    scale: [0.94, 1.04],
    clustering: [0.4, 0.6],
    isolation: [2.4, 3.6],
    approach: [1.2, 2],
    exposure: [0.34, 0.55],
    slime: {
      persistence: [0.66, 0.82],
      trailInfluence: [1.15, 1.55],
      sensorAngle: [0.14, 0.26],
      sensorDistance: [0.5, 0.85],
      turnAngle: [0.12, 0.22],
      stepSize: [0.12, 0.18],
      deposit: [0.08, 0.13],
      depositWidth: [1.05, 1.4],
      diffusion: [0.008, 0.02],
      decay: [0.976, 0.988],
      resistance: [0.12, 0.28],
      randomness: [0.06, 0.16],
      trailCap: [1.1, 1.45],
    },
    params: { attractionStrength: 0.68, directionalBias: 0.72, geometryVariation: 0.28, networkDensity: 0.4 },
  },
  "curve-rooms": {
    chamber: "arc",
    neck: "curve",
    agents: [300, 400],
    origin: [-2.2, 2.2],
    scale: [0.9, 1.05],
    clustering: [0.36, 0.58],
    isolation: [2.6, 4],
    approach: [1.5, 2.6],
    exposure: [0.4, 0.66],
    slime: {
      persistence: [0.55, 0.75],
      trailInfluence: [1.05, 1.5],
      sensorAngle: [0.22, 0.4],
      sensorDistance: [0.55, 1],
      turnAngle: [0.2, 0.36],
      stepSize: [0.13, 0.2],
      deposit: [0.07, 0.12],
      depositWidth: [1.1, 1.55],
      diffusion: [0.01, 0.028],
      decay: [0.974, 0.986],
      resistance: [0.08, 0.22],
      randomness: [0.1, 0.24],
      trailCap: [1.05, 1.4],
    },
    params: { attractionStrength: 0.64, geometryVariation: 0.7, geometricDisplacement: 0.62, directionalBias: 0.32 },
  },
  "point-cluster": {
    chamber: "point",
    neck: "dots",
    agents: [360, 460],
    origin: [-2.6, 2.6],
    scale: [0.93, 1.05],
    clustering: [0.48, 0.7],
    isolation: [2.2, 3.8],
    approach: [1.8, 3],
    exposure: [0.5, 0.75],
    slime: {
      persistence: [0.35, 0.58],
      trailInfluence: [0.7, 1.2],
      sensorAngle: [0.3, 0.55],
      sensorDistance: [0.6, 1.1],
      turnAngle: [0.24, 0.45],
      stepSize: [0.14, 0.22],
      deposit: [0.05, 0.09],
      depositWidth: [0.95, 1.3],
      diffusion: [0.015, 0.04],
      decay: [0.968, 0.982],
      resistance: [0.06, 0.2],
      randomness: [0.18, 0.38],
      trailCap: [0.9, 1.25],
    },
    params: { attractionStrength: 0.52, nodeRepetition: 0.78, networkDensity: 0.58, nodeSpacing: 0.32 },
  },
  "mixed-marks": {
    chamber: "mixed",
    neck: "mixed",
    agents: [340, 450],
    origin: [-2.8, 2.8],
    scale: [0.9, 1.06],
    clustering: [0.3, 0.62],
    isolation: [2.4, 4.4],
    approach: [1.2, 2.8],
    exposure: [0.32, 0.7],
    slime: {
      persistence: [0.4, 0.72],
      trailInfluence: [0.6, 1.5],
      sensorAngle: [0.18, 0.55],
      sensorDistance: [0.4, 1.2],
      turnAngle: [0.14, 0.5],
      stepSize: [0.11, 0.24],
      deposit: [0.05, 0.14],
      depositWidth: [0.9, 2.2],
      diffusion: [0.004, 0.08],
      decay: [0.96, 0.99],
      resistance: [0.05, 0.35],
      randomness: [0.08, 0.4],
      trailCap: [0.8, 1.55],
    },
    params: { attractionStrength: 0.6, geometryVariation: 0.74, scaleVariation: 0.7, networkDensity: 0.5 },
  },
  "sparse-field": {
    chamber: "point",
    neck: "line",
    agents: [140, 220],
    origin: [-3.2, 3.2],
    scale: [0.82, 0.98],
    clustering: [0.12, 0.28],
    isolation: [4.4, 6.2],
    approach: [0.7, 1.2],
    exposure: [0.55, 0.82],
    slime: {
      persistence: [0.72, 0.88],
      trailInfluence: [1.3, 1.8],
      sensorAngle: [0.1, 0.2],
      sensorDistance: [0.7, 1.3],
      turnAngle: [0.08, 0.18],
      stepSize: [0.14, 0.22],
      deposit: [0.06, 0.1],
      depositWidth: [1, 1.35],
      diffusion: [0.004, 0.016],
      decay: [0.97, 0.984],
      resistance: [0.08, 0.2],
      randomness: [0.04, 0.12],
      trailCap: [1, 1.35],
    },
    params: { attractionStrength: 0.9, networkDensity: 0.18, nodeSpacing: 0.78, permeability: 0.55 },
  },
  "dense-pack": {
    chamber: "point",
    neck: "curve",
    agents: [500, 580],
    origin: [-0.8, 0.8],
    scale: [1.0, 1.08],
    clustering: [0.78, 0.94],
    isolation: [1.4, 2.2],
    approach: [2.2, 3.6],
    exposure: [0.22, 0.4],
    slime: {
      persistence: [0.5, 0.7],
      trailInfluence: [1.1, 1.6],
      sensorAngle: [0.2, 0.36],
      sensorDistance: [0.4, 0.7],
      turnAngle: [0.16, 0.3],
      stepSize: [0.11, 0.16],
      deposit: [0.1, 0.16],
      depositWidth: [1.25, 1.8],
      diffusion: [0.02, 0.05],
      decay: [0.982, 0.992],
      resistance: [0.18, 0.36],
      randomness: [0.1, 0.22],
      trailCap: [1.25, 1.65],
    },
    params: { attractionStrength: 0.7, networkDensity: 0.86, nodeRepetition: 0.72, permeability: 0.36 },
  },
  wander: {
    chamber: "point",
    neck: "curve",
    agents: [380, 480],
    origin: [-2.6, 2.6],
    scale: [0.9, 1.06],
    clustering: [0.16, 0.36],
    isolation: [3.2, 5],
    approach: [2.6, 4],
    exposure: [0.6, 0.85],
    slime: {
      persistence: [0.12, 0.32],
      trailInfluence: [0.25, 0.65],
      sensorAngle: [0.75, 1.25],
      sensorDistance: [1.1, 2],
      turnAngle: [0.55, 1.05],
      stepSize: [0.22, 0.38],
      deposit: [0.04, 0.08],
      depositWidth: [1.1, 1.8],
      diffusion: [0.04, 0.1],
      decay: [0.955, 0.972],
      resistance: [0, 0.1],
      randomness: [0.55, 1.05],
      trailCap: [0.65, 1.05],
    },
    params: { attractionStrength: 0.32, geometryVariation: 0.9, geometricDisplacement: 0.82, randomness: 0.22, directionalBias: 0.18 },
  },
  committed: {
    chamber: "stroke",
    neck: "line",
    agents: [220, 320],
    origin: [-1.6, 1.6],
    scale: [0.95, 1.04],
    clustering: [0.52, 0.7],
    isolation: [2.6, 3.8],
    approach: [0.9, 1.5],
    exposure: [0.24, 0.42],
    slime: {
      persistence: [0.84, 0.9],
      trailInfluence: [1.6, 2],
      sensorAngle: [0.08, 0.14],
      sensorDistance: [0.32, 0.55],
      turnAngle: [0.05, 0.12],
      stepSize: [0.1, 0.15],
      deposit: [0.06, 0.1],
      depositWidth: [0.88, 1.15],
      diffusion: [0, 0.008],
      decay: [0.972, 0.986],
      resistance: [0.2, 0.38],
      randomness: [0.01, 0.06],
      trailCap: [1.05, 1.35],
    },
    params: { attractionStrength: 0.84, directionalBias: 0.88, persistence: 0.86, geometryVariation: 0.16 },
  },
  "weak-pull": {
    chamber: "point",
    neck: "curve",
    agents: [300, 400],
    origin: [-3, 3],
    scale: [0.88, 1.04],
    clustering: [0.14, 0.3],
    isolation: [4, 5.8],
    approach: [2.8, 4.2],
    exposure: [0.66, 0.9],
    slime: {
      persistence: [0.28, 0.5],
      trailInfluence: [0.15, 0.45],
      sensorAngle: [0.4, 0.75],
      sensorDistance: [0.8, 1.5],
      turnAngle: [0.3, 0.6],
      stepSize: [0.18, 0.3],
      deposit: [0.045, 0.08],
      depositWidth: [1.2, 2],
      diffusion: [0.03, 0.08],
      decay: [0.958, 0.976],
      resistance: [0.02, 0.12],
      randomness: [0.28, 0.55],
      trailCap: [0.6, 1],
    },
    params: { attractionStrength: 0.2, networkDensity: 0.34, permeability: 0.8, flowCoupling: 0.28 },
  },
  "strong-pull": {
    chamber: "point",
    neck: "line",
    agents: [360, 460],
    origin: [-1.4, 1.4],
    scale: [0.96, 1.04],
    clustering: [0.68, 0.88],
    isolation: [1.8, 2.8],
    approach: [1, 1.7],
    exposure: [0.2, 0.36],
    slime: {
      persistence: [0.7, 0.86],
      trailInfluence: [1.7, 2],
      sensorAngle: [0.1, 0.2],
      sensorDistance: [0.35, 0.6],
      turnAngle: [0.08, 0.18],
      stepSize: [0.11, 0.16],
      deposit: [0.09, 0.14],
      depositWidth: [1, 1.4],
      diffusion: [0.002, 0.012],
      decay: [0.98, 0.992],
      resistance: [0.24, 0.42],
      randomness: [0.03, 0.1],
      trailCap: [1.25, 1.6],
    },
    params: { attractionStrength: 0.96, networkDensity: 0.55, directionalBias: 0.8, flowCoupling: 0.74 },
  },
  "wide-sensors": {
    chamber: "stroke",
    neck: "curve",
    agents: [280, 380],
    origin: [-2.4, 2.4],
    scale: [0.9, 1.05],
    clustering: [0.28, 0.5],
    isolation: [3, 4.6],
    approach: [2.2, 3.5],
    exposure: [0.48, 0.72],
    slime: {
      persistence: [0.45, 0.68],
      trailInfluence: [0.9, 1.4],
      sensorAngle: [0.35, 0.6],
      sensorDistance: [1.5, 2.15],
      turnAngle: [0.25, 0.48],
      stepSize: [0.26, 0.42],
      deposit: [0.06, 0.11],
      depositWidth: [1.4, 2.2],
      diffusion: [0.025, 0.06],
      decay: [0.97, 0.984],
      resistance: [0.06, 0.18],
      randomness: [0.14, 0.3],
      trailCap: [1, 1.4],
    },
    params: { influenceRadius: 8.5, scaleVariation: 0.82, permeability: 0.68, attractionStrength: 0.5 },
  },
  "micro-step": {
    chamber: "point",
    neck: "dots",
    agents: [400, 500],
    origin: [-1.8, 1.8],
    scale: [0.94, 1.04],
    clustering: [0.58, 0.78],
    isolation: [2, 3.2],
    approach: [1.1, 1.8],
    exposure: [0.3, 0.5],
    slime: {
      persistence: [0.6, 0.78],
      trailInfluence: [1.2, 1.65],
      sensorAngle: [0.12, 0.22],
      sensorDistance: [0.25, 0.42],
      turnAngle: [0.1, 0.2],
      stepSize: [0.08, 0.11],
      deposit: [0.11, 0.17],
      depositWidth: [0.85, 1.1],
      diffusion: [0.004, 0.014],
      decay: [0.976, 0.988],
      resistance: [0.16, 0.3],
      randomness: [0.06, 0.16],
      trailCap: [1.15, 1.5],
    },
    params: { attractionStrength: 0.66, permeability: 0.24, flowCoupling: 0.7, networkDensity: 0.6 },
  },
  "decay-fast": {
    chamber: "point",
    neck: "line",
    agents: [260, 360],
    origin: [-2.2, 2.2],
    scale: [0.9, 1.04],
    clustering: [0.24, 0.44],
    isolation: [3.2, 4.8],
    approach: [1.4, 2.4],
    exposure: [0.42, 0.68],
    slime: {
      persistence: [0.5, 0.7],
      trailInfluence: [1, 1.45],
      sensorAngle: [0.2, 0.38],
      sensorDistance: [0.5, 0.9],
      turnAngle: [0.16, 0.3],
      stepSize: [0.13, 0.2],
      deposit: [0.08, 0.13],
      depositWidth: [0.95, 1.3],
      diffusion: [0.008, 0.02],
      decay: [0.912, 0.942],
      resistance: [0.1, 0.24],
      randomness: [0.1, 0.22],
      trailCap: [0.7, 1.05],
    },
    params: { decay: 0.09, decayMode: "aggressive", attractionStrength: 0.6, networkDensity: 0.3 },
  },
  "decay-slow": {
    chamber: "point",
    neck: "curve",
    agents: [340, 440],
    origin: [-1.6, 1.6],
    scale: [0.96, 1.05],
    clustering: [0.5, 0.72],
    isolation: [2.2, 3.4],
    approach: [1.6, 2.6],
    exposure: [0.28, 0.48],
    slime: {
      persistence: [0.58, 0.78],
      trailInfluence: [1.15, 1.6],
      sensorAngle: [0.18, 0.32],
      sensorDistance: [0.5, 0.85],
      turnAngle: [0.14, 0.26],
      stepSize: [0.12, 0.18],
      deposit: [0.07, 0.12],
      depositWidth: [1.2, 1.8],
      diffusion: [0.015, 0.04],
      decay: [0.992, 0.996],
      resistance: [0.12, 0.26],
      randomness: [0.08, 0.18],
      trailCap: [1.35, 1.7],
    },
    params: { decay: 0.02, decayMode: "controlled", attractionStrength: 0.62, flowCoupling: 0.68 },
  },
  "asymmetric-mix": {
    chamber: "mixed",
    neck: "mixed",
    agents: [280, 480],
    origin: [-3.2, 3.2],
    scale: [0.84, 1.08],
    clustering: [0.18, 0.8],
    isolation: [1.8, 5.6],
    approach: [0.8, 3.8],
    exposure: [0.18, 0.88],
    slime: {
      persistence: [0.18, 0.86],
      trailInfluence: [0.2, 1.9],
      sensorAngle: [0.1, 1.1],
      sensorDistance: [0.3, 1.9],
      turnAngle: [0.08, 0.9],
      stepSize: [0.09, 0.36],
      deposit: [0.03, 0.2],
      depositWidth: [0.85, 3],
      diffusion: [0, 0.16],
      decay: [0.92, 0.995],
      resistance: [0, 0.55],
      randomness: [0.04, 0.85],
      trailCap: [0.5, 1.75],
    },
    params: { attractionStrength: 0.45, geometryVariation: 0.86, scaleVariation: 0.8, networkDensity: 0.42, randomness: 0.18 },
  },
};

export type RoomVoice = "disk" | "cloud" | "swarm" | "shell" | "stroke";
export type NeckVoice = "hair" | "vein" | "corridor" | "steps" | "void";
export type HaloVoice = "bare" | "mist" | "overgrown";

const ROOM_VOICES: RoomVoice[] = ["disk", "cloud", "swarm", "shell", "stroke"];
const NECK_VOICES: NeckVoice[] = ["hair", "vein", "corridor", "steps", "void"];
const HALO_VOICES: HaloVoice[] = ["bare", "mist", "overgrown"];

export type CompressedSequentialPlan = {
  kind: SequenceKind;
  growth: GrowthMode;
  index: number;
  scale: number;
  fill: number;
  flip: boolean;
  originX: number;
  originY: number;
  twist: number;
  neckW: number;
  attractorsOnly: boolean;
  roomVoice: RoomVoice;
  neckVoice: NeckVoice;
  halo: HaloVoice;
  openLo: number;
  openHi: number;
};

type Frame = {
  r: (min: number, max: number) => number;
  int: (min: number, max: number) => number;
  chance: (p: number) => boolean;
  pick: <T>(items: readonly T[]) => T;
};

type Node = { x: number; y: number; r: number };
type Link = [number, number];

function frame(rng: Rng): Frame {
  return {
    r: (min, max) => min + rng() * (max - min),
    int: (min, max) => Math.floor(min + rng() * (max - min + 1)),
    chance: (p) => rng() < p,
    pick: (items) => items[Math.min(items.length - 1, Math.floor(rng() * items.length))],
  };
}

function at(x: number, y: number, r: number): Node {
  return { x: lim(x), y: lim(y), r };
}

function span(f: Frame, range: Pair) {
  return f.r(range[0], range[1]);
}

function rotate(x: number, y: number, originX: number, originY: number, twist: number) {
  const dx = x - originX;
  const dy = y - originY;
  const c = Math.cos(twist);
  const s = Math.sin(twist);
  return { x: originX + dx * c - dy * s, y: originY + dx * s + dy * c };
}

function fitSequence(nodes: Node[], plan: CompressedSequentialPlan): Node[] {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const node of nodes) {
    minX = Math.min(minX, node.x);
    minY = Math.min(minY, node.y);
    maxX = Math.max(maxX, node.x);
    maxY = Math.max(maxY, node.y);
  }
  const spanX = Math.max(0.01, maxX - minX);
  const spanY = Math.max(0.01, maxY - minY);
  const dest = (FIELD_SIZE - 3.2) * plan.scale;
  const destMin = (FIELD_SIZE - dest) / 2;
  const stretchX = spanX >= spanY * 0.55;
  const stretchY = spanY >= spanX * 0.55;
  const midX = (minX + maxX) / 2;
  const midY = (minY + maxY) / 2;
  return nodes.map((node) => {
    const x = stretchX ? destMin + ((node.x - minX) / spanX) * dest : CENTER + (node.x - midX);
    const y = stretchY ? destMin + ((node.y - minY) / spanY) * dest : CENTER + (node.y - midY);
    return at(x, y, node.r);
  });
}

function layout(nodes: Node[], plan: CompressedSequentialPlan): Node[] {
  const placed = nodes.map((node) => {
    const x = plan.originX + (node.x - CENTER) * plan.scale;
    const y = plan.originY + (node.y - CENTER) * (plan.flip ? -1 : 1) * plan.scale;
    const spun = rotate(x, y, plan.originX, plan.originY, plan.twist);
    return { x: spun.x, y: spun.y, r: node.r };
  });
  return fitSequence(placed, plan);
}

function openR(f: Frame, plan?: CompressedSequentialPlan) {
  return f.r(plan?.openLo ?? 1.7, plan?.openHi ?? 4.2);
}

function pinchR(f: Frame) {
  return f.r(0.38, 0.78);
}

function beadR(f: Frame) {
  return f.r(0.42, 0.72);
}

function familyNodes(kind: SequenceKind, f: Frame, plan: CompressedSequentialPlan): { nodes: Node[]; links: Link[]; axis: number } {
  const room = () => openR(f, plan);
  if (kind === "dumbbell-h") {
    const y0 = 10 + f.r(-1.2, 1.2);
    const y1 = 10 + f.r(-2.6, 2.6);
    return { nodes: [at(3.1, y0, room()), at(10, 10, pinchR(f)), at(16.9, y1, room())], links: [[0, 1], [1, 2]], axis: 0 };
  }
  if (kind === "dumbbell-v") {
    const x0 = 10 + f.r(-1.2, 1.2);
    const x1 = 10 + f.r(-2.6, 2.6);
    return { nodes: [at(x0, 3.1, room()), at(10, 10, pinchR(f)), at(x1, 16.9, room())], links: [[0, 1], [1, 2]], axis: Math.PI / 2 };
  }
  if (kind === "dumbbell-d") {
    return { nodes: [at(3.2, 3.4, room()), at(10, 10, pinchR(f)), at(16.8, 16.6, room())], links: [[0, 1], [1, 2]], axis: Math.PI / 4 };
  }
  if (kind === "beads-diag") {
    return {
      nodes: [at(2.6, 2.8, room()), at(6.2, 6.4, pinchR(f)), at(10, 10, room()), at(13.8, 13.6, pinchR(f)), at(17.4, 17.2, room())],
      links: [[0, 1], [1, 2], [2, 3], [3, 4]],
      axis: Math.PI / 4,
    };
  }
  if (kind === "beads-vert") {
    return {
      nodes: [at(10, 2.6, room()), at(10, 7.2, pinchR(f)), at(10, 12.8, pinchR(f)), at(10, 17.4, room())],
      links: [[0, 1], [1, 2], [2, 3]],
      axis: Math.PI / 2,
    };
  }
  if (kind === "zigzag-h") {
    const amp = f.r(1.6, 5.2);
    return {
      nodes: [at(2.4, 10 - amp, room()), at(6.1, 10, pinchR(f)), at(10, 10 + amp, room()), at(13.9, 10, pinchR(f)), at(17.6, 10 - amp, room())],
      links: [[0, 1], [1, 2], [2, 3], [3, 4]],
      axis: 0,
    };
  }
  if (kind === "zigzag-v") {
    const amp = f.r(1.6, 5.2);
    return {
      nodes: [at(10 - amp, 2.4, room()), at(10, 6.1, pinchR(f)), at(10 + amp, 10, room()), at(10, 13.9, pinchR(f)), at(10 - amp, 17.6, room())],
      links: [[0, 1], [1, 2], [2, 3], [3, 4]],
      axis: Math.PI / 2,
    };
  }
  if (kind === "serpentine") {
    return {
      nodes: [at(2.4, 3.8, room()), at(6.4, 3.6, pinchR(f)), at(10, 10, room()), at(13.6, 16.4, pinchR(f)), at(17.6, 16.2, room())],
      links: [[0, 1], [1, 2], [2, 3], [3, 4]],
      axis: 0.32,
    };
  }
  if (kind === "y-axis") {
    const armsN = f.chance(0.28) ? 4 : 3;
    const reach = f.r(5.4, 7.8);
    const start = f.r(0, Math.PI * 2);
    const hub = at(10, 10, pinchR(f));
    const arms = Array.from({ length: armsN }, (_, i) => {
      const a = start + (i / armsN) * Math.PI * 2 + f.r(-0.18, 0.18);
      return at(10 + Math.cos(a) * reach, 10 + Math.sin(a) * reach, room());
    });
    const beads = arms.map((arm) => at(10 + (arm.x - 10) * 0.46, 10 + (arm.y - 10) * 0.46, beadR(f)));
    const links: Link[] = arms.flatMap((_, i) => [[0, 1 + armsN + i], [1 + armsN + i, 1 + i]] as Link[]);
    return { nodes: [hub, ...arms, ...beads], links, axis: start };
  }
  return {
    nodes: [at(2.6, 2.6, room()), at(2.8, 10, pinchR(f)), at(3.0, 17.2, room()), at(10, 17.2, pinchR(f)), at(17.2, 17.0, room())],
    links: [[0, 1], [1, 2], [2, 3], [3, 4]],
    axis: Math.PI / 2,
  };
}

function chamberMarks(node: Node, voice: RoomVoice, f: Frame): FieldAttractor[] {
  const open = node.r >= 1.6;
  const strength = open ? f.r(1.05, 1.45) : f.r(0.45, 0.8);
  if (!open) {
    return [{ kind: "point", x: lim(node.x), y: lim(node.y), radius: node.r, strength }];
  }
  if (voice === "cloud") {
    return [{ kind: "point", x: lim(node.x), y: lim(node.y), radius: node.r * f.r(1.05, 1.35), strength: f.r(0.55, 0.85) }];
  }
  if (voice === "swarm") {
    const count = f.int(7, 13);
    return Array.from({ length: count }, () => {
      const a = f.r(0, Math.PI * 2);
      const d = node.r * f.r(0, 0.92);
      return {
        kind: "point" as const,
        x: lim(node.x + Math.cos(a) * d),
        y: lim(node.y + Math.sin(a) * d),
        radius: f.r(0.35, 0.7),
        strength: f.r(0.55, 1.05),
      };
    });
  }
  if (voice === "shell") {
    const count = f.int(8, 14);
    return Array.from({ length: count }, (_, i) => {
      const a = (i / count) * Math.PI * 2 + f.r(-0.08, 0.08);
      return {
        kind: "point" as const,
        x: lim(node.x + Math.cos(a) * node.r),
        y: lim(node.y + Math.sin(a) * node.r),
        radius: f.r(0.32, 0.62),
        strength: f.r(0.7, 1.15),
      };
    });
  }
  if (voice === "stroke") {
    const a = f.r(0, Math.PI);
    const half = node.r * f.r(0.7, 1.05);
    return [{
      kind: "line",
      x: lim(node.x - Math.cos(a) * half),
      y: lim(node.y - Math.sin(a) * half),
      x2: lim(node.x + Math.cos(a) * half),
      y2: lim(node.y + Math.sin(a) * half),
      radius: node.r * f.r(0.45, 0.75),
      strength,
    }];
  }
  return [{ kind: "point", x: lim(node.x), y: lim(node.y), radius: node.r, strength }];
}

function neckMarks(a: Node, b: Node, voice: NeckVoice, f: Frame): FieldAttractor[] {
  if (voice === "void") return [];
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const start = { x: lim(a.x + ux * Math.min(a.r * 0.82, len * 0.38)), y: lim(a.y + uy * Math.min(a.r * 0.82, len * 0.38)) };
  const end = { x: lim(b.x - ux * Math.min(b.r * 0.82, len * 0.38)), y: lim(b.y - uy * Math.min(b.r * 0.82, len * 0.38)) };
  if (voice === "steps") {
    const count = f.int(2, 4);
    return Array.from({ length: count }, (_, i) => {
      const t = (i + 1) / (count + 1);
      return {
        kind: "point" as const,
        x: lim(start.x + (end.x - start.x) * t + f.r(-0.22, 0.22)),
        y: lim(start.y + (end.y - start.y) * t + f.r(-0.22, 0.22)),
        radius: f.r(0.28, 0.55),
        strength: f.r(0.28, 0.52),
      };
    });
  }
  const width = voice === "hair" ? f.r(0.12, 0.22) : voice === "corridor" ? f.r(0.32, 0.52) : f.r(0.22, 0.4);
  const mark: FieldAttractor = {
    kind: voice === "vein" ? "curve" : "line",
    x: start.x,
    y: start.y,
    x2: end.x,
    y2: end.y,
    radius: width,
    strength: voice === "hair" ? f.r(0.22, 0.4) : f.r(0.4, 0.75),
  };
  if (voice === "vein") {
    mark.cx = lim((start.x + end.x) / 2 - uy * f.r(0.4, 1.6));
    mark.cy = lim((start.y + end.y) / 2 + ux * f.r(0.4, 1.6));
  }
  return [mark];
}

function thinNodes(built: { nodes: Node[]; links: Link[] }, growth: GrowthMode): { nodes: Node[]; links: Link[] } {
  if (growth !== "sparse-field" || built.nodes.length <= 3) return built;
  const nodes = [built.nodes[0], built.nodes[Math.floor(built.nodes.length / 2)], built.nodes[built.nodes.length - 1]];
  return { nodes, links: [[0, 1], [1, 2]] };
}

export function planCompressedSequential(seed: number, attempt = 0, index = 0): CompressedSequentialPlan {
  const rng = mulberry32(seed ^ 0xc0ffee ^ (attempt * 0x27d4eb2d) ^ (index * 0x9e3779b9));
  const f = frame(rng);
  const halo = f.pick(HALO_VOICES);
  const openLo = f.r(2.6, 3.4);
  return {
    kind: f.pick(SEQUENCE_FAMILIES),
    growth: f.pick(GROWTH_MODES),
    index,
    scale: f.r(0.72, 1.05),
    fill: f.r(0.55, 1),
    flip: f.chance(0.5),
    originX: CENTER + f.r(-1.4, 1.4),
    originY: CENTER + f.r(-1.4, 1.4),
    twist: f.r(-0.45, 0.45),
    neckW: f.r(0.1, 0.42),
    attractorsOnly: halo !== "overgrown",
    roomVoice: f.pick(ROOM_VOICES),
    neckVoice: f.pick(NECK_VOICES),
    halo,
    openLo,
    openHi: openLo + f.r(0.5, 1.3),
  };
}

export function attractorsFromCompressedSequential(plan: CompressedSequentialPlan, seed: number, attempt = 0): FieldAttractor[] {
  const rng = mulberry32(seed ^ 0x51f00d ^ (attempt * 0x85ebca6b) ^ (plan.index * 0x165667b1));
  const f = frame(rng);
  const built = thinNodes(familyNodes(plan.kind, f, plan), plan.growth);
  const jittered = built.nodes.map((node) => ({
    x: node.x + f.r(-0.2, 0.2),
    y: node.y + f.r(-0.2, 0.2),
    r: node.r >= 1.6 ? node.r * f.r(0.94, 1.08) : node.r * f.r(0.88, 1.05),
  }));
  const nodes = layout(jittered, plan);
  const marks: FieldAttractor[] = [];
  nodes.forEach((node) => {
    marks.push(...chamberMarks(node, plan.roomVoice, f));
  });
  built.links.forEach(([i, j]) => {
    if (!nodes[i] || !nodes[j]) return;
    marks.push(...neckMarks(nodes[i], nodes[j], plan.neckVoice, f));
  });
  return marks;
}

export function slimeFromCompressedSequential(base: SlimeControls, plan: CompressedSequentialPlan, seed: number): SlimeControls {
  const rng = mulberry32(seed ^ 0x51c0de ^ plan.index);
  const f = frame(rng);
  const spec = GROWTH_SPECS[plan.growth];
  const s = spec.slime;
  return {
    ...base,
    persistence: span(f, s.persistence),
    trailInfluence: span(f, s.trailInfluence),
    sensorAngle: span(f, s.sensorAngle),
    sensorDistance: span(f, s.sensorDistance),
    turnAngle: span(f, s.turnAngle),
    stepSize: span(f, s.stepSize),
    deposit: f.r(0.01, 0.28),
    depositWidth: f.r(0.28, 3.4),
    diffusion: f.r(0, 0.12),
    decay: f.r(0.92, 0.996),
    resistance: span(f, s.resistance),
    randomness: span(f, s.randomness),
    trailCap: f.r(0.2, 1.9),
    voidElongation: 1,
    voidRotation: 0,
    voidLobes: 0,
    voidNotch: 0,
    foodPoints: [{ x: plan.originX, y: plan.originY }],
  };
}

export function paramsFromCompressedSequential(base: BiologicalParams, plan: CompressedSequentialPlan): BiologicalParams {
  const extra = GROWTH_SPECS[plan.growth].params;
  const randomness = extra.randomness ?? base.randomness;
  const decay = extra.decay ?? base.decay;
  return {
    ...base,
    ...extra,
    randomnessMode: randomness > 0.16 ? "high" : randomness < 0.06 ? "low" : "medium",
    decayMode: decay > 0.07 ? "aggressive" : "controlled",
  };
}

export function recipeFromCompressedSequential(recipe: SpatialRecipe, plan: CompressedSequentialPlan, seed: number): SpatialRecipe {
  const rng = mulberry32(seed ^ 0x51ec1e);
  const f = frame(rng);
  const spec = GROWTH_SPECS[plan.growth];
  return {
    ...recipe,
    clustering: f.r(0.08, 0.94),
    isolationRadius: span(f, spec.isolation),
    approachWidth: span(f, spec.approach),
    coreExposure: span(f, spec.exposure),
  };
}

export function agentsFromCompressedSequential(plan: CompressedSequentialPlan, seed: number) {
  const rng = mulberry32(seed ^ 0x0a11ce);
  const [lo, hi] = GROWTH_SPECS[plan.growth].agents;
  return Math.round(Math.min(320, Math.max(70, lo + rng() * (hi - lo))));
}

export function foodFromAttractors(marks: FieldAttractor[]) {
  const points = marks.flatMap((mark) => {
    const mid = mark.x2 != null ? [{ x: (mark.x + mark.x2) / 2, y: (mark.y + (mark.y2 ?? mark.y)) / 2 }] : [];
    const end = mark.x2 != null ? [{ x: mark.x2, y: mark.y2 ?? mark.y }] : [];
    return [{ x: mark.x, y: mark.y }, ...end, ...mid];
  });
  return points.filter((point, index) => points.findIndex((other) => Math.hypot(other.x - point.x, other.y - point.y) < 0.35) === index);
}

function sequenceProfile(snapshot: FieldSnapshot, attractors: FieldAttractor[]) {
  let minX = FIELD_SIZE;
  let minY = FIELD_SIZE;
  let maxX = 0;
  let maxY = 0;
  for (const item of attractors) {
    minX = Math.min(minX, item.x);
    minY = Math.min(minY, item.y);
    maxX = Math.max(maxX, item.x);
    maxY = Math.max(maxY, item.y);
  }
  const spanX = maxX - minX;
  const spanY = maxY - minY;
  const bins = [0, 0, 0, 0, 0];
  const counts = [0, 0, 0, 0, 0];
  const alongX = spanX >= spanY;
  const trails = snapshot.trails;
  const ts = snapshot.trailSize;
  const scale = ts / FIELD_SIZE;
  let live = 0;
  let trailMinX = ts;
  let trailMinY = ts;
  let trailMaxX = 0;
  let trailMaxY = 0;
  for (let i = 0; i < trails.length; i += 1) {
    const value = trails[i];
    if (value < 0.012) continue;
    live += 1;
    const px = i % ts;
    const py = Math.floor(i / ts);
    trailMinX = Math.min(trailMinX, px);
    trailMaxX = Math.max(trailMaxX, px);
    trailMinY = Math.min(trailMinY, py);
    trailMaxY = Math.max(trailMaxY, py);
    const x = px / scale;
    const y = py / scale;
    const t = alongX ? (x - minX) / Math.max(0.01, spanX) : (y - minY) / Math.max(0.01, spanY);
    if (t < 0 || t > 1) continue;
    const bin = Math.min(4, Math.floor(t * 5));
    bins[bin] += value;
    counts[bin] += 1;
  }
  const means = bins.map((sum, i) => sum / Math.max(1, counts[i]));
  const ends = Math.max(means[0], means[4]);
  const mid = Math.min(means[1], means[2], means[3]);
  const occupied = live / Math.max(1, trails.length);
  const trailSpan = Math.max((trailMaxX - trailMinX) / scale, (trailMaxY - trailMinY) / scale);
  const pinched = ends > 0.025 && mid < ends * 0.74 && (spanX >= 7 || spanY >= 7);
  return { pinched, ends, mid, occupied, trailSpan, spanX, spanY };
}

export function compressedSequentialIdentity(features: MorphFeatures, attractors: FieldAttractor[], snapshot?: FieldSnapshot): boolean {
  if (attractors.some((item) => item.hole || item.kind === "ring")) return false;
  if (attractors.length < 3) return false;
  const radii = attractors.map((item) => item.radius ?? 1);
  const contrast = Math.max(...radii) / Math.max(0.12, Math.min(...radii));
  if (contrast < 1.2) return false;
  if (!snapshot) return true;
  const profile = sequenceProfile(snapshot, attractors);
  if (profile.occupied < 0.04 || profile.occupied > 0.88) return false;
  if (profile.trailSpan < 8) return false;
  return profile.pinched;
}

export function scoreCompressedSequential(
  snapshot: FieldSnapshot,
  attractors: FieldAttractor[],
  slime?: SlimeControls,
): number {
  if (attractors.some((item) => item.hole || item.kind === "ring") || attractors.length < 3) return 0;
  const profile = sequenceProfile(snapshot, attractors);
  const pinch = (profile.ends - profile.mid) / Math.max(0.001, profile.ends);
  const reach = profile.trailSpan / FIELD_SIZE;
  const width = slime?.depositWidth ?? 1.2;
  const thickFit =
    width < 0.75
      ? profile.occupied < 0.4
        ? 1
        : 0.15
      : width > 2
        ? profile.occupied > 0.18 && profile.occupied < 0.82
          ? 1
          : 0.2
        : profile.occupied > 0.08 && profile.occupied < 0.7
          ? 0.85
          : 0.35;
  const defined = profile.pinched ? 1.4 : 0.15;
  return pinch * 2.4 + reach + thickFit + defined;
}

export function sequenceSignature(
  attractors: FieldAttractor[],
  extra?: { slime?: SlimeControls; agents?: number; growth?: GrowthMode; kind?: SequenceKind },
): number[] {
  const points = attractors.filter((item) => item.kind === "point").length;
  const lines = attractors.filter((item) => item.kind === "line").length;
  const curves = attractors.filter((item) => item.kind === "curve").length;
  const radii = attractors.map((item) => item.radius ?? 1);
  const meanR = radii.reduce((sum, value) => sum + value, 0) / Math.max(1, radii.length);
  let minX = FIELD_SIZE;
  let minY = FIELD_SIZE;
  let maxX = 0;
  let maxY = 0;
  let sx = 0;
  let sy = 0;
  for (const item of attractors) {
    minX = Math.min(minX, item.x);
    minY = Math.min(minY, item.y);
    maxX = Math.max(maxX, item.x);
    maxY = Math.max(maxY, item.y);
    sx += item.x;
    sy += item.y;
  }
  const n = Math.max(1, attractors.length);
  const slime = extra?.slime;
  return [
    points / 16,
    lines / 10,
    curves / 10,
    attractors.length / 24,
    meanR / 4,
    (Math.max(...radii) - Math.min(...radii)) / 4,
    sx / n / FIELD_SIZE,
    sy / n / FIELD_SIZE,
    (maxX - minX) / FIELD_SIZE,
    (maxY - minY) / FIELD_SIZE,
    extra?.growth ? GROWTH_MODES.indexOf(extra.growth) / 20 : 0,
    extra?.kind ? SEQUENCE_FAMILIES.indexOf(extra.kind) / 20 : 0,
    extra?.agents ? extra.agents / 600 : 0,
    slime ? slime.deposit : 0,
    slime ? slime.diffusion : 0,
    slime ? slime.randomness / 1.2 : 0,
    slime ? slime.depositWidth / 3.4 : 0,
    slime ? slime.persistence : 0,
    slime ? slime.sensorAngle / 1.35 : 0,
    extra?.slime ? extra.slime.trailCap / 2 : 0,
    extra?.slime ? extra.slime.stepSize : 0,
  ];
}

export function isNovelSequence(signature: number[], previous: number[][]): boolean {
  if (!previous.length) return true;
  return previous.every((item) => {
    let sum = 0;
    const len = Math.min(signature.length, item.length);
    for (let i = 0; i < len; i += 1) {
      const d = signature[i] - item[i];
      sum += d * d;
    }
    return Math.sqrt(sum / Math.max(1, len)) >= 0.22;
  });
}
