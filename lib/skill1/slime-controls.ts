import { mulberry32 } from "../physarum";
import { FIELD_SIZE } from "./maps";
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

export function slimeControlsFromTranslation(translation: BiologicalTranslation): SlimeControls {
  const { params } = translation;
  const attractor = attractorFromRatings(translation, FIELD_SIZE);
  const leak = 0.03 + params.networkDensity * 0.12;
  const pack = clamp(1 - params.nodeSpacing, 0, 1);
  const diffusion =
    params.networkDensity > 0.35 ? leak : pack > 0.55 ? 0.018 + pack * 0.025 : 0;

  return {
    sensorAngle: 0.32 + params.geometryVariation * 0.45,
    sensorDistance: 0.45 + params.influenceRadius * 0.035 + params.scaleVariation * 0.25,
    turnAngle: 0.22 + params.geometryVariation * 0.55,
    stepSize: (0.12 + params.permeability * 0.16) * (0.7 + params.permeability * 0.35),
    deposit: (0.05 + params.flowCoupling * 0.1) * (0.38 + params.flowCoupling * 0.42),
    depositWidth: 1,
    diffusion,
    decay: clamp(1 - params.decay, 0.9, 0.998),
    randomness: params.randomness,
    persistence: params.persistence,
    trailCap: 1.8,
    foodPoints: [{ ...attractor }],
    crowdingLimit: 48,
    voidElongation: 1,
    voidRotation: 0,
    voidLobes: 0,
    voidNotch: 0,
  };
}

/** Spread one archetype across distinct growth settings. The seed picks the variant. */
export function varySlimeControls(base: SlimeControls, seed: number): SlimeControls {
  const rng = mulberry32(seed ^ 0x51c0de);
  const jitter = (value: number, spread: number, min: number, max: number) =>
    clamp(value + (rng() - 0.5) * 2 * spread, min, max);
  const origin = base.foodPoints[0] ?? { x: FIELD_SIZE / 2, y: FIELD_SIZE / 2 };
  const foodCount = 1 + Math.floor(rng() * 3);
  const foodPoints: Point[] = [
    {
      x: clamp(origin.x + (rng() - 0.5) * 6, 2, FIELD_SIZE - 3),
      y: clamp(origin.y + (rng() - 0.5) * 6, 2, FIELD_SIZE - 3),
    },
  ];
  for (let i = 1; i < foodCount; i += 1) {
    foodPoints.push({
      x: 2 + rng() * (FIELD_SIZE - 4),
      y: 2 + rng() * (FIELD_SIZE - 4),
    });
  }
  return {
    sensorAngle: jitter(base.sensorAngle, 0.5, 0.08, 1.35),
    sensorDistance: jitter(base.sensorDistance, 0.75, 0.25, 2.2),
    turnAngle: jitter(base.turnAngle, 0.45, 0.05, 1.2),
    stepSize: jitter(base.stepSize, 0.14, 0.08, 0.5),
    deposit: jitter(base.deposit, 0.07, 0.02, 0.22),
    depositWidth: jitter(base.depositWidth, 1.1, 1, 3.4),
    diffusion: jitter(base.diffusion, 0.2, 0, 0.42),
    decay: jitter(base.decay, 0.045, 0.91, 0.996),
    randomness: jitter(base.randomness, 0.5, 0, 1.15),
    persistence: jitter(base.persistence, 0.4, 0, 0.9),
    trailCap: jitter(base.trailCap, 0.8, 0.3, 1.8),
    crowdingLimit: Math.round(jitter(base.crowdingLimit, 28, 4, 80)),
    foodPoints,
    voidElongation: jitter(1, 0.85, 0.38, 2.7),
    voidRotation: rng() * Math.PI,
    voidLobes: rng() * 0.62,
    voidNotch: (rng() - 0.5) * 0.9,
  };
}
