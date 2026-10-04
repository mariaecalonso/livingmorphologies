import { mulberry32 } from "../physarum";
import { FIELD_SIZE, MAX_AGENT_COUNT, MAX_DENSITY, MIN_AGENT_COUNT, MIN_DENSITY } from "./maps";
import { attractorFromRatings } from "./translate";
import type { BiologicalTranslation, Point } from "./types";

/**
 * Jones-style controls the trail stepper reads directly.
 * Defaults are derived from the Skill 1 translation so each knob starts
 * from the current archetype, then can move on its own.
 */
export type SlimeControls = {
  sensorAngle: number;
  sensorDistance: number;
  turnAngle: number;
  stepSize: number;
  deposit: number;
  depositWidth: number;
  diffusion: number;
  decay: number;
  /** Multiplier on trail sensing. 1 keeps the translated response. */
  trailInfluence: number;
  /** 0 leaves movement unchanged. Higher values strengthen a spatial resistance field. */
  resistance: number;
  randomness: number;
  persistence: number;
  trailCap: number;
  foodPoints: Point[];
  crowdingLimit: number;
  /** 1 is a circle. Below 1 the void is taller than it is wide. */
  voidElongation: number;
  voidRotation: number;
  /** Three-lobe bulge. 0 keeps the outline smooth. */
  voidLobes: number;
  /** Two-sided pinch. Positive and negative flip which axis narrows. */
  voidNotch: number;
};

/** Polar radius of the absence. A circle is elongation 1 with lobes and notch at 0. */
export function voidRadius(angle: number, base: number, slime: Pick<SlimeControls, "voidElongation" | "voidRotation" | "voidLobes" | "voidNotch">) {
  const a = angle - slime.voidRotation;
  const harmonic = Math.max(0.42, 1 + slime.voidLobes * Math.cos(3 * a) + slime.voidNotch * Math.cos(2 * a));
  const elong = Math.max(0.35, slime.voidElongation);
  const stretch = Math.hypot(Math.cos(a) / elong, Math.sin(a));
  return (base * harmonic) / Math.max(0.35, stretch);
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const lerp = (min: number, max: number, t: number) => min + (max - min) * clamp(t, 0, 1);

/**
 * Maps Skill 1 ratings, recipe, and topology onto the 12 Physarum sliders.
 * Each archetype's catalog DNA lands in a different region of the ranges.
 */
export function slimeControlsFromTranslation(translation: BiologicalTranslation): SlimeControls {
  const { params, recipe, topology } = translation;
  const attractor = attractorFromRatings(translation, FIELD_SIZE);
  const enclosed = clamp(recipe.enclosureCollar / 3.7, 0, 1);
  const clustered = clamp(recipe.clustering, 0, 1);
  const approach = clamp(recipe.approachWidth / 4.7, 0, 1);
  const exposed = clamp(recipe.coreExposure, 0, 1);
  const isolated = clamp(recipe.isolationRadius / 6.5, 0, 1);
  const reach = clamp((params.influenceRadius - 3) / 7, 0, 1);
  const contained = topology === "contained-interior" ? 1 : 0;
  const absence = topology === "around-absence" ? 1 : 0;
  const openNet = topology === "open-network" ? 1 : 0;

  const next: SlimeControls = {
    sensorDistance: lerp(0.25, 2.2, reach * 0.34 + params.scaleVariation * 0.28 + approach * 0.22 + openNet * 0.16 - contained * 0.18),
    sensorAngle: lerp(0.08, 1.35, params.geometryVariation * 0.55 + (1 - params.directionalBias) * 0.25 + params.geometricDisplacement * 0.2),
    turnAngle: lerp(0.05, 1.2, params.geometryVariation * 0.5 + params.geometricDisplacement * 0.28 + (1 - clustered) * 0.22),
    stepSize: lerp(0.08, 0.5, params.permeability * 0.42 + params.sourcePermeability * 0.22 + openNet * 0.2 - contained * 0.18),
    deposit: lerp(0.02, 0.22, params.flowCoupling * 0.38 + params.attractionStrength * 0.32 + contained * 0.2 + clustered * 0.1),
    depositWidth: lerp(1, 3.4, isolated * 0.45 + params.scaleVariation * 0.35 + absence * 0.2),
    diffusion: lerp(0, 0.42, params.permeability * 0.32 + params.networkDensity * 0.22 + exposed * 0.28 - enclosed * 0.18),
    decay: clamp(1 - params.decay, 0.9, 0.998),
    trailInfluence: lerp(0, 2, params.networkDensity * 0.42 + clustered * 0.28 + params.attractionStrength * 0.18 + absence * 0.12),
    resistance: lerp(0, 1, enclosed * 0.38 + (1 - params.permeability) * 0.28 + (1 - exposed) * 0.18 + contained * 0.16),
    randomness: lerp(0, 1.15, params.randomness * 2.2 + params.geometryVariation * 0.35),
    persistence: lerp(0, 0.9, params.persistence * 0.7 + clustered * 0.3),
    trailCap: lerp(0.3, 1.8, params.attractionStrength * 0.45 + params.flowCoupling * 0.35 + contained * 0.2),
    foodPoints: [{ ...attractor }],
    crowdingLimit: Math.round(lerp(8, 72, (1 - params.nodeSpacing) * 0.55 + clustered * 0.45)),
    voidElongation: lerp(0.38, 2.7, 0.35 + params.scaleVariation * 0.4 + absence * 0.25),
    voidRotation: params.geometricDisplacement * Math.PI * 0.35,
    voidLobes: params.geometryVariation * 0.62,
    voidNotch: (params.geometricDisplacement - 0.5) * 0.9,
  };

  if (translation.archetypeId === "stepped-amphitheater") {
    return {
      ...next,
      sensorDistance: 1.18,
      sensorAngle: 0.4,
      turnAngle: 0.58,
      stepSize: 0.17,
      deposit: 0.085,
      depositWidth: 1.1,
      diffusion: 0.035,
      trailInfluence: 1.7,
      resistance: 0.06,
      randomness: 0.2,
      persistence: 0.74,
      trailCap: 1.55,
      crowdingLimit: 20,
      voidElongation: 1.7,
    };
  }
  return next;
}

/** Agent-density slider (1–10) from the same catalog DNA. */
export function densityFromTranslation(translation: BiologicalTranslation): number {
  if (translation.archetypeId === "stepped-amphitheater") return 7;
  const { params, topology } = translation;
  const contained = topology === "contained-interior" ? 0.12 : 0;
  return Math.round(lerp(1, 10, params.networkDensity * 0.38 + params.permeability * 0.28 + params.nodeRepetition * 0.22 + contained));
}

/** Agent count for a density slider value. */
export function agentCountFromDensity(density: number) {
  const span = MAX_DENSITY - MIN_DENSITY;
  const t = span === 0 ? 0 : (density - MIN_DENSITY) / span;
  return Math.round(MIN_AGENT_COUNT + Math.min(1, Math.max(0, t)) * (MAX_AGENT_COUNT - MIN_AGENT_COUNT));
}

/** Spread one archetype across distinct growth settings. The seed picks the variant. */
export function varySlimeControls(base: SlimeControls, seed: number, archetypeId?: string): SlimeControls {
  const rng = mulberry32(seed ^ 0x51c0de);
  const singleVoid = archetypeId === "vertical-void" || archetypeId === "void-edge";
  const isolatedVoid = archetypeId === "void-field";
  const linear = archetypeId === "linear-gallery" || archetypeId === "linear-edge-gallery" || archetypeId === "compressed-sequential";
  const contained = archetypeId === "contained-room-within-volume" || archetypeId === "flat-deep-plan" || archetypeId === "stepped-amphitheater";
  const openField = archetypeId === "topographic-ground-field" || archetypeId === "open-hall" || archetypeId === "undulated";
  const span = 0.62;
  const across = (value: number, min: number, max: number, local = span) =>
    clamp(value + (rng() - 0.5) * (max - min) * local, min, max);
  const origin = base.foodPoints[0] ?? { x: FIELD_SIZE / 2, y: FIELD_SIZE / 2 };
  const foodPoints: Point[] = [
    {
      x: clamp(origin.x + (rng() - 0.5) * (singleVoid || isolatedVoid ? 2.4 : 5.2), 2, FIELD_SIZE - 3),
      y: clamp(origin.y + (rng() - 0.5) * (singleVoid || isolatedVoid ? 2.4 : 5.2), 2, FIELD_SIZE - 3),
    },
  ];
  const next: SlimeControls = {
    sensorAngle: across(base.sensorAngle, 0.08, 1.35),
    sensorDistance: across(base.sensorDistance, 0.25, 2.2),
    turnAngle: across(base.turnAngle, 0.05, 1.2),
    stepSize: across(base.stepSize, 0.08, 0.5),
    deposit: across(base.deposit, 0.02, 0.22),
    depositWidth: across(base.depositWidth, 1, 3.4),
    diffusion: across(base.diffusion, 0, 0.42),
    decay: across(base.decay, 0.91, 0.996),
    trailInfluence: across(base.trailInfluence, 0, 2),
    resistance: across(base.resistance, 0, 1),
    randomness: across(base.randomness, 0, 1.15),
    persistence: across(base.persistence, 0, 0.9),
    trailCap: across(base.trailCap, 0.3, 1.8),
    crowdingLimit: Math.round(across(base.crowdingLimit, 4, 80)),
    foodPoints,
    voidElongation: across(base.voidElongation, 0.38, 2.7),
    voidRotation: across(base.voidRotation, 0, Math.PI),
    voidLobes: across(base.voidLobes, 0, singleVoid ? 0.22 : isolatedVoid ? 0.4 : 0.62),
    voidNotch: across(base.voidNotch, -0.9, 0.9),
  };
  if (linear) {
    next.persistence = clamp(next.persistence, 0.42, 0.9);
    next.sensorAngle = clamp(next.sensorAngle, 0.08, 0.95);
  }
  if (contained) {
    next.resistance = clamp(next.resistance, 0.18, 0.95);
    next.diffusion = clamp(next.diffusion, 0, 0.22);
    next.stepSize = clamp(next.stepSize, 0.08, 0.32);
  }
  if (openField) {
    next.resistance = clamp(next.resistance, 0, 0.45);
    next.trailInfluence = clamp(next.trailInfluence, 0.35, 1.7);
    next.diffusion = clamp(next.diffusion, 0.08, 0.42);
  }
  if (archetypeId === "continuous-hall") {
    next.trailInfluence = clamp(next.trailInfluence, 0.22, 2);
    next.persistence = clamp(next.persistence, 0.26, 0.95);
    next.sensorAngle = clamp(next.sensorAngle, 0.04, 0.62);
    next.turnAngle = clamp(next.turnAngle, 0.04, 0.4);
    next.diffusion = clamp(next.diffusion, 0, 0.14);
    next.randomness = clamp(next.randomness, 0.02, 0.45);
    next.resistance = clamp(next.resistance, 0.02, 0.5);
    next.trailCap = clamp(next.trailCap, 0.14, 2);
    next.deposit = clamp(next.deposit, 0.005, 0.3);
    next.depositWidth = clamp(next.depositWidth, 0.28, 3.5);
  }
  if (archetypeId === "void-field") {
    next.resistance = clamp(next.resistance, 0.08, 0.55);
    next.trailInfluence = clamp(next.trailInfluence, 0.25, 1.2);
  }
  if (archetypeId === "vertical-void") {
    next.trailInfluence = clamp(next.trailInfluence, 0.55, 2);
    next.voidElongation = clamp(next.voidElongation, 0.55, 2.2);
  }
  if (archetypeId === "compressed-sequential") {
    next.resistance = clamp(next.resistance, 0, 0.55);
    next.persistence = clamp(next.persistence, 0.12, 0.9);
    next.depositWidth = clamp(next.depositWidth, 0.26, 3.5);
    next.deposit = clamp(next.deposit, 0.008, 0.3);
    next.trailCap = clamp(next.trailCap, 0.18, 1.95);
    next.stepSize = clamp(next.stepSize, 0.08, 0.4);
    next.randomness = clamp(next.randomness, 0.02, 1.05);
    next.diffusion = clamp(next.diffusion, 0, 0.16);
  }
  if (archetypeId === "topographic-ground-field") {
    next.resistance = clamp(next.resistance, 0.02, 0.28);
    next.persistence = clamp(next.persistence, 0.26, 0.9);
    next.depositWidth = clamp(next.depositWidth, 0.65, 2.7);
    next.deposit = clamp(next.deposit, 0.035, 0.22);
    next.trailCap = clamp(next.trailCap, 0.45, 1.85);
    next.stepSize = clamp(next.stepSize, 0.1, 0.3);
    next.randomness = clamp(next.randomness, 0.04, 0.5);
    next.diffusion = clamp(next.diffusion, 0.03, 0.14);
    next.trailInfluence = clamp(next.trailInfluence, 0.4, 1.8);
  }
  if (archetypeId === "linear-gallery") {
    next.resistance = clamp(next.resistance, 0.02, 0.45);
    next.persistence = clamp(next.persistence, 0.18, 0.92);
    next.depositWidth = clamp(next.depositWidth, 0.22, 3.2);
    next.deposit = clamp(next.deposit, 0.008, 0.28);
    next.trailCap = clamp(next.trailCap, 0.22, 1.95);
    next.stepSize = clamp(next.stepSize, 0.1, 0.38);
    next.randomness = clamp(next.randomness, 0.02, 0.95);
    next.diffusion = clamp(next.diffusion, 0, 0.14);
    next.sensorAngle = clamp(next.sensorAngle, 0.08, 0.85);
    next.trailInfluence = clamp(next.trailInfluence, 0.28, 1.9);
  }
  if (archetypeId === "stepped-amphitheater") {
    next.trailInfluence = clamp(next.trailInfluence, 1.1, 2);
    next.resistance = clamp(next.resistance, 0.04, 0.28);
    next.randomness = clamp(next.randomness, 0.08, 0.45);
  }
  if (archetypeId === "contained-room-within-volume") {
    next.trailCap = clamp(next.trailCap, 0.9, 1.8);
    next.deposit = clamp(next.deposit, 0.06, 0.22);
  }
  if (archetypeId === "flat-deep-plan") {
    next.sensorDistance = clamp(next.sensorDistance, 0.25, 1.15);
    next.randomness = clamp(next.randomness, 0, 0.55);
  }
  return next;
}
