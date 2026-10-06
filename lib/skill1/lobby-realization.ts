/**
 * Lobby handoff for Skill 2.
 * A semantic plan plus a salt (`seed`, `attempt`, `index`) realizes attractors,
 * slime, and agent count. Fresh plans still come from the existing planners.
 * Realization does not call those planners again, so a stored Linear Gallery
 * `kind` or `growth` is not rewritten from `index`.
 * Pose-genome evolution does not use this module.
 */

import { FIELD_SIZE, MIN_AGENT_COUNT } from "./maps";
import { agentCountFromDensity, densityFromTranslation, type SlimeControls } from "./slime-controls";
import { mulberry32 } from "../physarum";
import { runAttractorsFor } from "./run-variants";
import {
  agentsFromCompressedSequential,
  attractorsFromCompressedSequential,
  foodFromAttractors,
  GROWTH_MODES as SEQUENCE_GROWTHS,
  HALO_VOICES,
  NECK_VOICES,
  paramsFromCompressedSequential,
  planCompressedSequential,
  recipeFromCompressedSequential,
  ROOM_VOICES,
  SEQUENCE_FAMILIES,
  slimeFromCompressedSequential,
  type CompressedSequentialPlan,
  type GrowthMode,
  type HaloVoice,
  type NeckVoice,
  type RoomVoice,
  type SequenceKind,
} from "./run-compressed-sequential";
import {
  agentsFromContinuousHall,
  attractorsFromContinuousHall,
  continuousHallBands,
  figureOf,
  HALL_FAMILIES,
  HALL_GROWTHS,
  paramsFromContinuousHall,
  planContinuousHall,
  recipeFromContinuousHall,
  slimeFromContinuousHall,
  type ContinuousHallPlan,
  type HallFamily,
  type HallGrowth,
} from "./run-continuous-hall";
import {
  agentsFromLinearGallery,
  attractorsFromLinearGallery,
  GALLERY_FAMILIES,
  GROWTH_MODES as GALLERY_GROWTHS,
  paramsFromLinearGallery,
  planLinearGallery,
  recipeFromLinearGallery,
  slimeFromLinearGallery,
  type GalleryKind,
  type GalleryPlan,
  type GrowthKind as GalleryGrowth,
} from "./run-linear-gallery";
import {
  attractorsFromVerticalVoidPlan,
  planVerticalVoid,
  slimeFromVerticalVoidPlan,
  VERTICAL_VOID_APPROACHES,
  VERTICAL_VOID_CORES,
  VERTICAL_VOID_RELATIONS,
  verticalVoidAspectBand,
  type MorphPlan,
} from "./run-morphology";
import {
  agentsFromTopographic,
  attractorsFromTopographic,
  GROUND_FIGURES,
  GROWTH_MODES as TERRAIN_GROWTHS,
  paramsFromTopographic,
  planTopographicGroundField,
  recipeFromTopographic,
  slimeFromTopographic,
  TERRAIN_FAMILIES,
  type GroundFigure,
  type GrowthKind as TerrainGrowth,
  type TerrainKind,
  type TopographicPlan,
} from "./run-topographic-ground-field";
import type { BiologicalTranslation, FieldAttractor, Point } from "./types";

export const LOBBY_ARCHETYPE_IDS = [
  "vertical-void",
  "compressed-sequential",
  "continuous-hall",
  "topographic-ground-field",
  "linear-gallery",
] as const;

export type LobbyArchetypeId = (typeof LOBBY_ARCHETYPE_IDS)[number];

/** Realization key. Held constant when one semantic field changes. Not a gene. */
export type LobbySalt = {
  seed: number;
  attempt: number;
  index: number;
};

export type LobbyPlan =
  | { archetypeId: "vertical-void"; plan: MorphPlan }
  | { archetypeId: "compressed-sequential"; plan: CompressedSequentialPlan }
  | { archetypeId: "continuous-hall"; plan: ContinuousHallPlan }
  | { archetypeId: "topographic-ground-field"; plan: TopographicPlan }
  | { archetypeId: "linear-gallery"; plan: GalleryPlan };

export type LobbyFieldGuide = {
  archetypeId: LobbyArchetypeId;
  /** Discrete and numeric choices the drawer reads. */
  genes: readonly string[];
  /**
   * Present only when that label also selects slime and agent count.
   * The number of agents and the slime ranges belong to the label.
   */
  growthGene: string | null;
  /** Written from another field before simulation. */
  derived: readonly string[];
  /** Still on the struct. The drawer does not read them. Do not evolve them. */
  unused: readonly string[];
  /**
   * Fields the second random stream also hashes, besides the salt.
   * `index` is the salt's index copied onto the plan.
   * Gallery and topographic slime also hash `growth.length`, so two growth
   * labels of different length do not share a slime stream.
   */
  streamKeys: readonly string[];
};

export const LOBBY_FIELD_GUIDE: readonly LobbyFieldGuide[] = [
  {
    archetypeId: "vertical-void",
    genes: ["core", "approach", "relation", "cx", "cy", "axis", "aspect"],
    growthGene: null,
    derived: [],
    unused: ["span"],
    streamKeys: [],
  },
  {
    archetypeId: "compressed-sequential",
    genes: ["kind", "roomVoice", "neckVoice", "halo", "flip", "scale", "originX", "originY", "twist", "openLo"],
    growthGene: "growth",
    derived: ["attractorsOnly", "openHi"],
    unused: ["fill", "neckW"],
    streamKeys: ["index"],
  },
  {
    archetypeId: "continuous-hall",
    genes: ["family", "cx", "cy", "length", "width", "pinch", "twist", "flip"],
    growthGene: "growth",
    derived: ["figure"],
    unused: [],
    streamKeys: ["index"],
  },
  {
    archetypeId: "topographic-ground-field",
    genes: ["kind", "figure", "scale", "originX", "originY", "twist", "flip"],
    growthGene: "growth",
    derived: [],
    unused: [],
    streamKeys: ["index", "growth.length"],
  },
  {
    archetypeId: "linear-gallery",
    genes: ["kind", "scale", "originX", "originY", "twist", "flip"],
    growthGene: "growth",
    derived: [],
    unused: [],
    streamKeys: ["index", "growth.length"],
  },
];

/** How many attempts the run grid searches. Recovery of an older catalog row stops here. */
export const LOBBY_ATTEMPT_SEARCH = 6;

export function isLobbyArchetype(archetypeId: string): archetypeId is LobbyArchetypeId {
  return (LOBBY_ARCHETYPE_IDS as readonly string[]).includes(archetypeId);
}

export function planLobby(archetypeId: string, salt: LobbySalt): LobbyPlan | null {
  if (archetypeId === "vertical-void") {
    return { archetypeId, plan: planVerticalVoid(salt.seed, salt.attempt, salt.index) };
  }
  if (archetypeId === "compressed-sequential") {
    return { archetypeId, plan: planCompressedSequential(salt.seed, salt.attempt, salt.index) };
  }
  if (archetypeId === "continuous-hall") {
    return { archetypeId, plan: planContinuousHall(salt.seed, salt.attempt, salt.index) };
  }
  if (archetypeId === "topographic-ground-field") {
    return { archetypeId, plan: planTopographicGroundField(salt.seed, salt.attempt, salt.index) };
  }
  if (archetypeId === "linear-gallery") {
    return { archetypeId, plan: planLinearGallery(salt.seed, salt.attempt, salt.index) };
  }
  return null;
}

const finite = (value: number) => Number.isFinite(value);

function oneOf<T extends string>(value: string, legal: readonly T[], field: string, reasons: string[]): value is T {
  if ((legal as readonly string[]).includes(value)) return true;
  reasons.push(field);
  return false;
}

function clampInto(value: number, band: readonly [number, number]) {
  if (value < band[0]) return band[0];
  if (value > band[1]) return band[1];
  return value;
}

function placement(value: number) {
  if (!finite(value)) return value;
  if (value < 0) return 0;
  if (value > FIELD_SIZE - 1) return FIELD_SIZE - 1;
  return value;
}

export type LobbyRepair =
  | { ok: true; plan: LobbyPlan; repaired: string[] }
  | { ok: false; reasons: string[] };

/** Legal plan, or a rejection. Derived ties are rewritten. Unused fields are left in place. */
export function repairLobbyPlan(stored: LobbyPlan): LobbyRepair {
  const reasons: string[] = [];
  if (stored.archetypeId === "vertical-void") {
    const plan = stored.plan;
    if (!oneOf(plan.core, VERTICAL_VOID_CORES, "core", reasons)) return { ok: false, reasons };
    if (!oneOf(plan.approach, VERTICAL_VOID_APPROACHES, "approach", reasons)) return { ok: false, reasons };
    if (!oneOf(plan.relation, VERTICAL_VOID_RELATIONS, "relation", reasons)) return { ok: false, reasons };
    if (![plan.cx, plan.cy, plan.axis, plan.aspect].every(finite)) return { ok: false, reasons: ["non-finite"] };
    const band = verticalVoidAspectBand(plan.core);
    const aspect = clampInto(plan.aspect, band);
    const cx = placement(plan.cx);
    const cy = placement(plan.cy);
    const repaired: string[] = [];
    if (aspect !== plan.aspect) repaired.push("aspect");
    if (cx !== plan.cx) repaired.push("cx");
    if (cy !== plan.cy) repaired.push("cy");
    if (!repaired.length) return { ok: true, plan: stored, repaired };
    return { ok: true, plan: { archetypeId: stored.archetypeId, plan: { ...plan, aspect, cx, cy } }, repaired };
  }
  if (stored.archetypeId === "compressed-sequential") {
    const plan = stored.plan;
    if (!oneOf<SequenceKind>(plan.kind, SEQUENCE_FAMILIES, "kind", reasons)) return { ok: false, reasons };
    if (!oneOf<GrowthMode>(plan.growth, SEQUENCE_GROWTHS, "growth", reasons)) return { ok: false, reasons };
    if (!oneOf<RoomVoice>(plan.roomVoice, ROOM_VOICES, "roomVoice", reasons)) return { ok: false, reasons };
    if (!oneOf<NeckVoice>(plan.neckVoice, NECK_VOICES, "neckVoice", reasons)) return { ok: false, reasons };
    if (!oneOf<HaloVoice>(plan.halo, HALO_VOICES, "halo", reasons)) return { ok: false, reasons };
    if (typeof plan.flip !== "boolean") return { ok: false, reasons: ["flip"] };
    if (![plan.scale, plan.originX, plan.originY, plan.twist, plan.openLo, plan.openHi].every(finite)) {
      return { ok: false, reasons: ["non-finite"] };
    }
    const attractorsOnly = plan.halo !== "overgrown";
    const openHi = plan.openHi > plan.openLo ? plan.openHi : plan.openLo + 0.5;
    const originX = placement(plan.originX);
    const originY = placement(plan.originY);
    const repaired: string[] = [];
    if (attractorsOnly !== plan.attractorsOnly) repaired.push("attractorsOnly");
    if (openHi !== plan.openHi) repaired.push("openHi");
    if (originX !== plan.originX) repaired.push("originX");
    if (originY !== plan.originY) repaired.push("originY");
    if (!repaired.length) return { ok: true, plan: stored, repaired };
    return {
      ok: true,
      plan: { archetypeId: stored.archetypeId, plan: { ...plan, attractorsOnly, openHi, originX, originY } },
      repaired,
    };
  }
  if (stored.archetypeId === "continuous-hall") {
    const plan = stored.plan;
    if (!oneOf<HallFamily>(plan.family, HALL_FAMILIES, "family", reasons)) return { ok: false, reasons };
    if (!oneOf<HallGrowth>(plan.growth, HALL_GROWTHS, "growth", reasons)) return { ok: false, reasons };
    if (typeof plan.flip !== "boolean") return { ok: false, reasons: ["flip"] };
    if (![plan.cx, plan.cy, plan.length, plan.width, plan.pinch, plan.twist].every(finite)) {
      return { ok: false, reasons: ["non-finite"] };
    }
    const figure = figureOf(plan.family);
    const bands = continuousHallBands(plan.family, plan.growth, figure);
    const length = clampInto(plan.length, bands.length);
    const width = clampInto(plan.width, bands.width);
    const cx = placement(plan.cx);
    const cy = placement(plan.cy);
    const repaired: string[] = [];
    if (figure !== plan.figure) repaired.push("figure");
    if (length !== plan.length) repaired.push("length");
    if (width !== plan.width) repaired.push("width");
    if (cx !== plan.cx) repaired.push("cx");
    if (cy !== plan.cy) repaired.push("cy");
    if (!repaired.length) return { ok: true, plan: stored, repaired };
    return {
      ok: true,
      plan: { archetypeId: stored.archetypeId, plan: { ...plan, figure, length, width, cx, cy } },
      repaired,
    };
  }
  if (stored.archetypeId === "topographic-ground-field") {
    const plan = stored.plan;
    if (!oneOf<TerrainKind>(plan.kind, TERRAIN_FAMILIES, "kind", reasons)) return { ok: false, reasons };
    if (!oneOf<TerrainGrowth>(plan.growth, TERRAIN_GROWTHS, "growth", reasons)) return { ok: false, reasons };
    if (!oneOf<GroundFigure>(plan.figure, GROUND_FIGURES, "figure", reasons)) return { ok: false, reasons };
    if (typeof plan.flip !== "boolean") return { ok: false, reasons: ["flip"] };
    if (![plan.scale, plan.originX, plan.originY, plan.twist].every(finite)) return { ok: false, reasons: ["non-finite"] };
    const originX = placement(plan.originX);
    const originY = placement(plan.originY);
    const repaired: string[] = [];
    if (originX !== plan.originX) repaired.push("originX");
    if (originY !== plan.originY) repaired.push("originY");
    if (!repaired.length) return { ok: true, plan: stored, repaired };
    return { ok: true, plan: { archetypeId: stored.archetypeId, plan: { ...plan, originX, originY } }, repaired };
  }
  const plan = stored.plan;
  if (!oneOf<GalleryKind>(plan.kind, GALLERY_FAMILIES, "kind", reasons)) return { ok: false, reasons };
  if (!oneOf<GalleryGrowth>(plan.growth, GALLERY_GROWTHS, "growth", reasons)) return { ok: false, reasons };
  if (typeof plan.flip !== "boolean") return { ok: false, reasons: ["flip"] };
  if (![plan.scale, plan.originX, plan.originY, plan.twist].every(finite)) return { ok: false, reasons: ["non-finite"] };
  const originX = placement(plan.originX);
  const originY = placement(plan.originY);
  const repaired: string[] = [];
  if (originX !== plan.originX) repaired.push("originX");
  if (originY !== plan.originY) repaired.push("originY");
  if (!repaired.length) return { ok: true, plan: stored, repaired };
  return { ok: true, plan: { archetypeId: stored.archetypeId, plan: { ...plan, originX, originY } }, repaired };
}

function translationFromRun(base: BiologicalTranslation, salt: LobbySalt): BiologicalTranslation {
  const attractors = runAttractorsFor(base.archetypeId, salt.seed, base.recipe.attractors ?? [], undefined, salt.attempt, salt.index);
  const first = attractors[0] ?? { x: 10, y: 10, kind: "point" as const, radius: 1.4, strength: 1 };
  return {
    ...base,
    recipe: {
      ...base.recipe,
      attractorFixed: true,
      attractorsOnly: true,
      attractor: { x: first.x, y: first.y },
      attractors,
    },
  };
}

function pinIndex<T extends { index: number }>(plan: T, salt: LobbySalt): T {
  return plan.index === salt.index ? plan : { ...plan, index: salt.index };
}

/** Diffusion the run grid actually steps. Vertical Void is capped. The other four Lobby archetypes are not. */
export function lobbySimulationSlime(archetypeId: string, slime: SlimeControls): SlimeControls {
  if (
    archetypeId === "continuous-hall" ||
    archetypeId === "compressed-sequential" ||
    archetypeId === "topographic-ground-field" ||
    archetypeId === "linear-gallery"
  ) {
    return slime;
  }
  return { ...slime, diffusion: Math.min(slime.diffusion, 0.04) };
}

function clampAgents(value: number) {
  return Math.round(Math.min(600, Math.max(MIN_AGENT_COUNT, value)));
}

export type LobbyRealization = {
  ok: true;
  plan: LobbyPlan;
  salt: LobbySalt;
  agents: number;
  slime: SlimeControls;
  /** Slime the run grid passes to the stepper. */
  simulationSlime: SlimeControls;
  translation: BiologicalTranslation;
  attractors: FieldAttractor[];
  foodPoints: Point[];
  repaired: string[];
};

export type LobbyRejection = { ok: false; reasons: string[] };

/**
 * Attractors, slime, and agent count for a stored plan and salt.
 * Same plan and same salt return the same three. Does not read ratings or rewrite descriptors.
 */
export function realizeLobbyPlan(
  base: BiologicalTranslation,
  slimeBase: SlimeControls,
  stored: LobbyPlan,
  salt: LobbySalt,
): LobbyRealization | LobbyRejection {
  if (stored.archetypeId !== base.archetypeId) return { ok: false, reasons: ["archetype"] };
  if (![salt.seed, salt.attempt, salt.index].every(finite)) return { ok: false, reasons: ["salt"] };
  const repaired = repairLobbyPlan(stored);
  if (!repaired.ok) return repaired;
  const { seed, attempt } = salt;
  const slimeSalt = seed ^ (attempt * 131);
  const agentSalt = seed ^ attempt;

  if (repaired.plan.archetypeId === "vertical-void") {
    const plan = repaired.plan.plan;
    const marks = attractorsFromVerticalVoidPlan(plan, seed, attempt);
    const first = marks[0] ?? { x: plan.cx, y: plan.cy, kind: "ring" as const, radius: 1.4, strength: 1 };
    const translation: BiologicalTranslation = {
      ...base,
      recipe: {
        ...base.recipe,
        attractorFixed: true,
        attractorsOnly: true,
        attractor: { x: first.x, y: first.y },
        attractors: marks,
      },
    };
    const slime = {
      ...slimeFromVerticalVoidPlan(slimeBase, plan, slimeSalt),
      foodPoints: [],
    };
    const rng = mulberry32(seed ^ 0x6d2b79f5 ^ attempt);
    const agents = clampAgents(agentCountFromDensity(densityFromTranslation(base)) + (rng() - 0.5) * 36);
    return pack(repaired.plan, salt, repaired.repaired, agents, slime, translation);
  }

  const runTranslation = translationFromRun(base, salt);

  if (repaired.plan.archetypeId === "compressed-sequential") {
    const plan = pinIndex(repaired.plan.plan, salt);
    const nextPlan: LobbyPlan = plan === repaired.plan.plan ? repaired.plan : { archetypeId: "compressed-sequential", plan };
    const marks = attractorsFromCompressedSequential(plan, seed, attempt);
    const translation: BiologicalTranslation = {
      ...runTranslation,
      params: paramsFromCompressedSequential(base.params, plan),
      recipe: {
        ...recipeFromCompressedSequential(runTranslation.recipe, plan, slimeSalt),
        attractors: marks,
        attractorFixed: true,
        attractorsOnly: plan.attractorsOnly,
      },
    };
    const slime = {
      ...slimeFromCompressedSequential(slimeBase, plan, slimeSalt),
      foodPoints: foodFromAttractors(marks),
    };
    const agents = clampAgents(agentsFromCompressedSequential(plan, agentSalt));
    return pack(nextPlan, salt, repaired.repaired, agents, slime, translation);
  }

  if (repaired.plan.archetypeId === "continuous-hall") {
    const plan = pinIndex(repaired.plan.plan, salt);
    const nextPlan: LobbyPlan = plan === repaired.plan.plan ? repaired.plan : { archetypeId: "continuous-hall", plan };
    const marks = attractorsFromContinuousHall(plan, seed, attempt);
    const translation: BiologicalTranslation = {
      ...runTranslation,
      topology: "open-network",
      params: paramsFromContinuousHall(base.params, plan),
      recipe: {
        ...recipeFromContinuousHall(runTranslation.recipe, plan, slimeSalt),
        attractors: marks,
      },
    };
    const slime = {
      ...slimeFromContinuousHall(slimeBase, plan, slimeSalt),
      foodPoints: [],
    };
    const agents = clampAgents(agentsFromContinuousHall(plan, agentSalt));
    return pack(nextPlan, salt, repaired.repaired, agents, slime, translation);
  }

  if (repaired.plan.archetypeId === "topographic-ground-field") {
    const plan = pinIndex(repaired.plan.plan, salt);
    const nextPlan: LobbyPlan = plan === repaired.plan.plan ? repaired.plan : { archetypeId: "topographic-ground-field", plan };
    const marks = attractorsFromTopographic(plan, seed, attempt);
    const translation: BiologicalTranslation = {
      ...runTranslation,
      params: paramsFromTopographic(base.params, slimeSalt),
      recipe: {
        ...recipeFromTopographic(runTranslation.recipe, slimeSalt),
        attractors: marks,
        attractorFixed: true,
        attractorsOnly: true,
      },
    };
    const slime = {
      ...slimeFromTopographic(slimeBase, plan, slimeSalt),
      foodPoints: [],
    };
    const agents = clampAgents(agentsFromTopographic(plan, agentSalt));
    return pack(nextPlan, salt, repaired.repaired, agents, slime, translation);
  }

  const plan = pinIndex(repaired.plan.plan, salt);
  const nextPlan: LobbyPlan = plan === repaired.plan.plan ? repaired.plan : { archetypeId: "linear-gallery", plan };
  const marks = attractorsFromLinearGallery(plan, seed, attempt);
  const translation: BiologicalTranslation = {
    ...runTranslation,
    params: paramsFromLinearGallery(base.params, slimeSalt),
    recipe: {
      ...recipeFromLinearGallery(runTranslation.recipe, slimeSalt),
      attractors: marks,
      attractorFixed: true,
      attractorsOnly: true,
    },
  };
  const slime = {
    ...slimeFromLinearGallery(slimeBase, plan, slimeSalt),
    foodPoints: [],
  };
  const agents = clampAgents(agentsFromLinearGallery(plan, agentSalt));
  return pack(nextPlan, salt, repaired.repaired, agents, slime, translation);
}

function pack(
  plan: LobbyPlan,
  salt: LobbySalt,
  repaired: string[],
  agents: number,
  slime: SlimeControls,
  translation: BiologicalTranslation,
): LobbyRealization {
  return {
    ok: true,
    plan,
    salt,
    agents,
    slime,
    simulationSlime: lobbySimulationSlime(plan.archetypeId, slime),
    translation,
    attractors: translation.recipe.attractors ?? [],
    foodPoints: slime.foodPoints,
    repaired,
  };
}
