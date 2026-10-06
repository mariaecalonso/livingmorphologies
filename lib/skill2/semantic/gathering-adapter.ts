import { agentsFromContainedRoom, attractorsFromContainedRoom, CONTAINED_FAMILIES, CONTAINED_GROWTHS, planContainedRoom, slimeFromContainedRoom, type ContainedRoomPlan } from "../../skill1/run-contained-room";
import { attractorsFromInsertedPlate, insertedPlateAgentCount, planInsertedHorizontalPlate, PLATE_ORGS, PLATE_VARIANTS, tuneInsertedPlateSlime, type InsertedPlatePlan } from "../../skill1/run-inserted-horizontal-plate";
import { agentsFromLinearEdgeGallery, attractorsFromLinearEdgeGallery, EDGE_FAMILIES, EDGE_GROWTHS, planLinearEdgeGallery, slimeFromLinearEdgeGallery, type EdgePlan } from "../../skill1/run-linear-edge-gallery";
import { agentsFromSteppedAmphitheater, planSteppedAmphitheater, slimeFromSteppedAmphitheater, type SaField } from "../../skill1/run-stepped-amphitheater";
import { agentsFromVoidField, attractorsFromVoidField, planVoidField, slimeFromVoidField, VF_GROWTHS, VF_MODES, type VoidFieldPlan } from "../../skill1/run-void-field";
import { slimeControlsFromTranslation } from "../../skill1/slime-controls";
import { translateArchetype } from "../../skill1/translate";
import type { FieldAttractor } from "../../skill1/types";
import type { ArchetypeSearchAdapter, SearchRealization, SemanticGene } from "./adapter";
import type { RealizationState, SemanticPlan } from "./types";

export const GATHERING_ARCHETYPE_IDS = [
  "stepped-amphitheater",
  "void-field",
  "inserted-horizontal-plate",
  "contained-room-within-volume",
  "linear-edge-gallery",
] as const;

export type GatheringArchetypeId = (typeof GATHERING_ARCHETYPE_IDS)[number];

type Span = { low: number; high: number };

/**
 * Bands taken from `planSteppedAmphitheater`. `sample` stops at 0.999.
 * Scaled fields (pitch, span, gather, throat) stay derived.
 */
const STEPPED_SPANS: Record<string, Span> = {
  curve: { low: (0 - 0.48) * 2.4, high: (0.999 - 0.48) * 2.4 },
  asymmetry: { low: (0 - 0.5) * 1.35, high: (0.999 - 0.5) * 1.35 },
  flare: { low: (0 - 0.5) * 1.1, high: (0.999 - 0.5) * 1.1 },
  branch: { low: 0, high: 0.999 },
  branchAngle: { low: 0.35, high: 0.35 + 0.999 * 1.35 },
  porosity: { low: 0.12, high: 0.12 + 0.999 * 0.55 },
  enclosure: { low: 0, high: 0.999 },
  count: { low: 3, high: 8 },
};

const STEPPED_PLACE = ["gx", "gy", "ex", "ey"] as const;
const STEPPED_DERIVED = ["pitch", "span", "gatherU", "gatherV", "throat"] as const;

/**
 * Gathering adapter. Gene roles come from what each planner actually reads.
 * A numeric field without one Skill 1 band is exposed and not refined.
 */
export function createGatheringAdapter(archetypeId: string): ArchetypeSearchAdapter {
  if (!(GATHERING_ARCHETYPE_IDS as readonly string[]).includes(archetypeId)) {
    throw new Error(`${archetypeId} has no semantic Gathering adapter`);
  }
  const id = archetypeId as GatheringArchetypeId;
  const genes = gatheringGenes(id);
  return {
    id: "gathering",
    archetypeId: id,
    typologyId: "gathering",
    primaryFamilyGene: familyGene(id),
    sampleExplorer(rng) {
      const state = drawSalt(rng);
      return { plan: wrap(id, samplePlan(id, state)), state };
    },
    genes: () => genes,
    span(plan, name) {
      if (id !== "stepped-amphitheater") return null;
      return STEPPED_SPANS[name] ?? null;
    },
    repair(plan) {
      return repairGathering(id, asRecord(plan));
    },
    readGene(plan, name) {
      return asRecord(plan)[name];
    },
    realize(plan, state) {
      return realizeGathering(id, plan, state);
    },
    writeGene(plan, name, value) {
      return wrap(id, writeGathering(id, asRecord(plan), name, value));
    },
  };
}

function familyGene(id: GatheringArchetypeId) {
  if (id === "void-field") return "mode";
  if (id === "inserted-horizontal-plate") return "org";
  if (id === "contained-room-within-volume" || id === "linear-edge-gallery") return "kind";
  return null;
}

function gatheringGenes(id: GatheringArchetypeId): readonly SemanticGene[] {
  if (id === "stepped-amphitheater") {
    return [
      ...STEPPED_PLACE.map((name) => ({ name, kind: "continuous" as const, mutationRole: "place" as const })),
      { name: "axis", kind: "continuous" },
      { name: "phase", kind: "continuous" },
      ...Object.keys(STEPPED_SPANS).map((name) => ({ name, kind: "continuous" as const, mutationRole: "refine" as const })),
      ...STEPPED_DERIVED.map((name) => ({ name, kind: "derived" as const })),
    ];
  }
  if (id === "void-field") {
    return [
      { name: "mode", kind: "discrete", legal: VF_MODES, mutationRole: "explore" },
      { name: "growth", kind: "growth", legal: VF_GROWTHS, mutationRole: "explore" },
      { name: "fieldX", kind: "continuous", mutationRole: "place" },
      { name: "fieldY", kind: "continuous", mutationRole: "place" },
      { name: "rot", kind: "continuous" },
      { name: "elong", kind: "continuous" },
    ];
  }
  if (id === "contained-room-within-volume") {
    return [
      { name: "kind", kind: "discrete", legal: CONTAINED_FAMILIES, mutationRole: "explore" },
      { name: "growth", kind: "growth", legal: CONTAINED_GROWTHS, mutationRole: "explore" },
      { name: "driftX", kind: "continuous", mutationRole: "place" },
      { name: "driftY", kind: "continuous", mutationRole: "place" },
    ];
  }
  if (id === "linear-edge-gallery") {
    return [
      { name: "kind", kind: "discrete", legal: EDGE_FAMILIES, mutationRole: "explore" },
      { name: "growth", kind: "growth", legal: EDGE_GROWTHS, mutationRole: "explore" },
      { name: "flip", kind: "discrete", legal: [false, true], mutationRole: "explore" },
      { name: "turn", kind: "continuous" },
    ];
  }
  return [
    { name: "org", kind: "discrete", legal: PLATE_ORGS, mutationRole: "explore" },
    { name: "variant", kind: "growth", legal: PLATE_VARIANTS, mutationRole: "explore" },
    { name: "index", kind: "continuous" },
    { name: "seed", kind: "continuous" },
  ];
}

function samplePlan(id: GatheringArchetypeId, state: RealizationState): Record<string, unknown> {
  const seed = numberField(state, "seed");
  const attempt = numberField(state, "attempt");
  const index = numberField(state, "index");
  if (id === "stepped-amphitheater") return { ...planSteppedAmphitheater(seed, attempt, index) };
  if (id === "void-field") return { ...planVoidField(seed, attempt, index), seed, attempt };
  if (id === "contained-room-within-volume") return { ...planContainedRoom(seed, attempt, index) };
  if (id === "linear-edge-gallery") return { ...planLinearEdgeGallery(seed, attempt, index) };
  return { ...planInsertedHorizontalPlate(seed, attempt, index) };
}

function writeGathering(id: GatheringArchetypeId, body: Record<string, unknown>, name: string, value: unknown) {
  if (id === "void-field" && name === "mode") {
    const mode = String(value);
    const modeIndex = (VF_MODES as readonly string[]).indexOf(mode);
    if (modeIndex < 0) return { ...body, mode };
    const rebuilt = planVoidField(numberField(body, "seed"), numberField(body, "attempt"), modeIndex);
    return { ...rebuilt, seed: body.seed, attempt: body.attempt, growth: body.growth, mode };
  }
  if (id === "contained-room-within-volume" && name === "kind") {
    const kind = String(value);
    const index = (CONTAINED_FAMILIES as readonly string[]).indexOf(kind);
    return { ...body, kind, index: index < 0 ? body.index : index };
  }
  return { ...body, [name]: value };
}

function repairGathering(id: GatheringArchetypeId, body: Record<string, unknown>) {
  if (id === "stepped-amphitheater") return repairStepped(body);
  if (id === "void-field") {
    if (!(VF_MODES as readonly string[]).includes(String(body.mode))) return { ok: false as const, reasons: ["mode"] };
    if (!(VF_GROWTHS as readonly string[]).includes(String(body.growth))) return { ok: false as const, reasons: ["growth"] };
    return { ok: true as const, plan: wrap(id, body), repairedFields: [] as string[] };
  }
  if (id === "contained-room-within-volume") {
    if (!(CONTAINED_FAMILIES as readonly string[]).includes(String(body.kind))) return { ok: false as const, reasons: ["kind"] };
    if (!(CONTAINED_GROWTHS as readonly string[]).includes(String(body.growth))) return { ok: false as const, reasons: ["growth"] };
    return { ok: true as const, plan: wrap(id, body), repairedFields: [] as string[] };
  }
  if (id === "linear-edge-gallery") {
    if (!(EDGE_FAMILIES as readonly string[]).includes(String(body.kind))) return { ok: false as const, reasons: ["kind"] };
    if (!(EDGE_GROWTHS as readonly string[]).includes(String(body.growth))) return { ok: false as const, reasons: ["growth"] };
    return { ok: true as const, plan: wrap(id, body), repairedFields: [] as string[] };
  }
  if (!Number.isFinite(body.index) || !Number.isFinite(body.seed)) return { ok: false as const, reasons: ["index"] };
  const org = (PLATE_ORGS as readonly string[]).includes(String(body.org))
    ? String(body.org)
    : PLATE_ORGS[Number(body.index) % PLATE_ORGS.length];
  const variant = (PLATE_VARIANTS as readonly string[]).includes(String(body.variant))
    ? String(body.variant)
    : String(Math.floor(Number(body.index) / PLATE_ORGS.length));
  if (!(PLATE_ORGS as readonly string[]).includes(org) || !(PLATE_VARIANTS as readonly string[]).includes(variant)) {
    return { ok: false as const, reasons: ["org"] };
  }
  return { ok: true as const, plan: wrap(id, { ...body, org, variant }), repairedFields: [] as string[] };
}

function repairStepped(body: Record<string, unknown>) {
  const next = { ...body };
  const repairedFields: string[] = [];
  for (const [name, span] of Object.entries(STEPPED_SPANS)) {
    const value = next[name];
    if (typeof value !== "number" || !Number.isFinite(value)) return { ok: false as const, reasons: [name] };
    let clamped = Math.min(span.high, Math.max(span.low, value));
    if (name === "count") clamped = Math.round(clamped);
    if (clamped !== value) repairedFields.push(name);
    next[name] = clamped;
  }
  return { ok: true as const, plan: wrap("stepped-amphitheater", next), repairedFields };
}

function wrap(archetypeId: GatheringArchetypeId, body: Record<string, unknown>): SemanticPlan {
  return { adapterId: "gathering", archetypeId, body };
}

function asRecord(plan: SemanticPlan) {
  return plan.body as Record<string, unknown>;
}

function drawSalt(rng: () => number): RealizationState {
  return {
    seed: Math.floor(rng() * 0x7fffffff),
    attempt: Math.floor(rng() * 6),
    index: Math.floor(rng() * 0x7fffffff),
  };
}

function realizeGathering(id: GatheringArchetypeId, plan: SemanticPlan, state: RealizationState): SearchRealization {
  const base = translateArchetype(id);
  const slimeBase = slimeControlsFromTranslation(base);
  const seed = numberField(state, "seed");
  const body = asRecord(plan);
  if (id === "stepped-amphitheater") {
    const field = body as SaField;
    return {
      ok: true,
      agents: agentsFromSteppedAmphitheater(field, seed),
      slime: slimeFromSteppedAmphitheater(slimeBase, field, seed),
      translation: { ...base, recipe: { ...base.recipe, saField: field, attractors: [], attractorFixed: true } },
    };
  }
  const marks = gatheringMarks(id, body);
  const first = marks[0];
  return {
    ok: true,
    agents: gatheringAgents(id, body, seed),
    slime: gatheringSlime(id, body, slimeBase, seed),
    translation: {
      ...base,
      params:
        id === "linear-edge-gallery"
          ? { ...base.params, attractionStrength: Math.min(base.params.attractionStrength, 0.22), directionalBias: 0.04 }
          : base.params,
      recipe: {
        ...base.recipe,
        attractors: marks,
        attractorFixed: true,
        attractorsOnly: true,
        attractor: first ? { x: first.x, y: first.y } : base.recipe.attractor,
      },
    },
  };
}

function gatheringMarks(id: GatheringArchetypeId, body: Record<string, unknown>): FieldAttractor[] {
  if (id === "void-field") return attractorsFromVoidField(body as VoidFieldPlan);
  if (id === "contained-room-within-volume") return attractorsFromContainedRoom(body as ContainedRoomPlan);
  if (id === "linear-edge-gallery") return attractorsFromLinearEdgeGallery(body as EdgePlan);
  return attractorsFromInsertedPlate(body as InsertedPlatePlan);
}

function gatheringAgents(id: GatheringArchetypeId, body: Record<string, unknown>, seed: number) {
  if (id === "void-field") return agentsFromVoidField(body as VoidFieldPlan, seed);
  if (id === "contained-room-within-volume") return agentsFromContainedRoom(body as ContainedRoomPlan, seed);
  if (id === "linear-edge-gallery") return agentsFromLinearEdgeGallery(body as EdgePlan);
  return insertedPlateAgentCount(body as InsertedPlatePlan);
}

function gatheringSlime(id: GatheringArchetypeId, body: Record<string, unknown>, slimeBase: ReturnType<typeof slimeControlsFromTranslation>, seed: number) {
  if (id === "void-field") return slimeFromVoidField(slimeBase, body as VoidFieldPlan, seed);
  if (id === "contained-room-within-volume") return slimeFromContainedRoom(slimeBase, body as ContainedRoomPlan, seed);
  if (id === "linear-edge-gallery") return slimeFromLinearEdgeGallery(slimeBase, body as EdgePlan, seed);
  return tuneInsertedPlateSlime(slimeBase, body as InsertedPlatePlan);
}

function numberField(record: Record<string, unknown> | RealizationState, name: string) {
  const value = record[name];
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

export type { SaField, VoidFieldPlan, ContainedRoomPlan, EdgePlan, InsertedPlatePlan };
