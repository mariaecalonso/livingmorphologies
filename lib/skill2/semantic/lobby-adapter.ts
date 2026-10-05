import {
  LOBBY_ARCHETYPE_IDS,
  LOBBY_ATTEMPT_SEARCH,
  LOBBY_FIELD_GUIDE,
  planLobby,
  repairLobbyPlan,
  type LobbyArchetypeId,
  type LobbyPlan,
  type LobbySalt,
} from "../../skill1/lobby-realization";
import { GALLERY_FAMILIES, GROWTH_MODES as GALLERY_GROWTHS } from "../../skill1/run-linear-gallery";
import { HALL_FAMILIES, HALL_GROWTHS } from "../../skill1/run-continuous-hall";
import {
  GROWTH_MODES as SEQUENCE_GROWTHS,
  HALO_VOICES,
  NECK_VOICES,
  ROOM_VOICES,
  SEQUENCE_FAMILIES,
} from "../../skill1/run-compressed-sequential";
import { VERTICAL_VOID_APPROACHES, VERTICAL_VOID_CORES, VERTICAL_VOID_RELATIONS } from "../../skill1/run-morphology";
import { GROUND_FIGURES, GROWTH_MODES as TERRAIN_GROWTHS, TERRAIN_FAMILIES } from "../../skill1/run-topographic-ground-field";
import type { ArchetypeSearchAdapter, SemanticGene } from "./adapter";
import type { RealizationState, SemanticPlan } from "./types";

/**
 * Lobby-only adapter. Gene names in this file belong to the five Lobby
 * archetypes and are not a template for Workspace or Gathering.
 * Provisional affinity follows the current field guide: numeric genes are
 * available to local refinement, discrete genes and the growth label are
 * available to morphological exploration. Derived and unused fields are not
 * mutated. Growth is not treated as an objective gene.
 */
export function createLobbyAdapter(archetypeId: string): ArchetypeSearchAdapter {
  if (!(LOBBY_ARCHETYPE_IDS as readonly string[]).includes(archetypeId)) {
    throw new Error(`${archetypeId} has no semantic Lobby adapter`);
  }
  const id = archetypeId as LobbyArchetypeId;
  const guide = LOBBY_FIELD_GUIDE.find((item) => item.archetypeId === id);
  if (!guide) throw new Error(`missing field guide for ${id}`);
  const sample = planLobby(id, { seed: 1, attempt: 0, index: 0 });
  if (!sample) throw new Error(`planner returned no sample for ${id}`);
  const genes = classify(guide, sample);
  const mutable = genes.filter((gene) => gene.kind !== "derived" && gene.kind !== "unused");
  return {
    id: "lobby",
    archetypeId: id,
    typologyId: "lobby",
    primaryFamilyGene: primaryFamilyGene(id),
    provisionalAffinity: {
      provisional: true,
      pareto: mutable.filter((gene) => gene.kind === "continuous").map((gene) => gene.name),
      diversity: mutable.filter((gene) => gene.kind === "discrete" || gene.kind === "growth").map((gene) => gene.name),
    },
    sampleExplorer(rng) {
      const salt = drawSalt(rng);
      const planned = planLobby(id, salt);
      if (!planned) throw new Error(`planner returned no explorer for ${id}`);
      return { plan: wrap(planned), state: salt };
    },
    genes: () => genes,
    repair(plan) {
      const stored = asLobby(plan);
      const result = repairLobbyPlan(stored);
      if (!result.ok) return result;
      return { ok: true, plan: wrap(result.plan), repairedFields: result.repaired };
    },
    readGene(plan, name) {
      return inner(asLobby(plan))[name];
    },
    writeGene(plan, name, value) {
      const stored = asLobby(plan);
      return wrap({ ...stored, plan: { ...stored.plan, [name]: value } } as LobbyPlan);
    },
  };
}

function primaryFamilyGene(archetypeId: LobbyArchetypeId) {
  if (archetypeId === "vertical-void") return "core";
  if (archetypeId === "continuous-hall") return "family";
  return "kind";
}

function classify(
  guide: (typeof LOBBY_FIELD_GUIDE)[number],
  sample: LobbyPlan,
): readonly SemanticGene[] {
  const record = inner(sample);
  const legal = legalValues(guide.archetypeId);
  const genes: SemanticGene[] = [];
  for (const name of guide.genes) {
    if (!(name in record)) throw new Error(`${guide.archetypeId} field guide lists ${name}, which the sample plan does not have`);
    const value = record[name];
    const kind = typeof value === "number" ? "continuous" : "discrete";
    if (kind === "discrete" && !legal[name]) throw new Error(`${guide.archetypeId} has no legal values for ${name}`);
    genes.push({ name, kind, legal: legal[name] });
  }
  if (guide.growthGene) {
    const name = guide.growthGene;
    if (!legal[name]) throw new Error(`${guide.archetypeId} has no legal values for growth gene ${name}`);
    genes.push({ name, kind: "growth", legal: legal[name] });
  }
  for (const name of guide.derived) genes.push({ name, kind: "derived" });
  for (const name of guide.unused) genes.push({ name, kind: "unused" });
  return genes;
}

function legalValues(archetypeId: LobbyArchetypeId): Record<string, readonly (string | boolean)[]> {
  if (archetypeId === "vertical-void") {
    return { core: VERTICAL_VOID_CORES, approach: VERTICAL_VOID_APPROACHES, relation: VERTICAL_VOID_RELATIONS };
  }
  if (archetypeId === "compressed-sequential") {
    return {
      kind: SEQUENCE_FAMILIES,
      roomVoice: ROOM_VOICES,
      neckVoice: NECK_VOICES,
      halo: HALO_VOICES,
      flip: [false, true],
      growth: SEQUENCE_GROWTHS,
    };
  }
  if (archetypeId === "continuous-hall") {
    return { family: HALL_FAMILIES, flip: [false, true], growth: HALL_GROWTHS };
  }
  if (archetypeId === "topographic-ground-field") {
    return { kind: TERRAIN_FAMILIES, figure: GROUND_FIGURES, flip: [false, true], growth: TERRAIN_GROWTHS };
  }
  return { kind: GALLERY_FAMILIES, flip: [false, true], growth: GALLERY_GROWTHS };
}

function drawSalt(rng: () => number): LobbySalt {
  return {
    seed: Math.floor(rng() * 0x7fffffff),
    attempt: Math.floor(rng() * LOBBY_ATTEMPT_SEARCH),
    index: Math.floor(rng() * 0x7fffffff),
  };
}

function wrap(plan: LobbyPlan): SemanticPlan {
  return { adapterId: "lobby", archetypeId: plan.archetypeId, body: plan };
}

function asLobby(plan: SemanticPlan): LobbyPlan {
  return plan.body as LobbyPlan;
}

function inner(plan: LobbyPlan): Record<string, unknown> {
  return plan.plan as unknown as Record<string, unknown>;
}

export function lobbyState(state: RealizationState): LobbySalt {
  return { seed: state.seed, attempt: state.attempt, index: state.index };
}
