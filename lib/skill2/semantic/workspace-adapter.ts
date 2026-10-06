/**
 * Workspace adapter. Planners are the Skill 1 files from origin/main.
 * No proportion span is declared here. Pareto slots stay explorers until a Skill 1 band exists.
 * Inspection drawings use the shared Skill 2 ink.
 */
import { agentsFromFlatDeep, attractorsFromFlatDeep, FLAT_DEEP_CYCLES, ORGANIC_KINDS, PLATE_KINDS, planFlatDeepPlan, slimeFromFlatDeep, translationFromFlatDeep, type FlatDeepPlan } from "../../skill1/run-flat-deep-plan";
import { agentsFromOpenHall, attractorsFromOpenHall, OPEN_HALL_FAMILIES, OPEN_HALL_GROWTHS, planOpenHall, slimeFromOpenHall, type OpenHallPlan } from "../../skill1/run-open-hall";
import { agentsFromTerraced, attractorsFromTerraced, planTerraced, slimeFromTerraced, TERRACE_FAMILIES, TERRACE_GROWTHS, type TerracePlan } from "../../skill1/run-terraced";
import { attractorsFromUndulated, planUndulated, tuneUndulatedSlime, undulatedAgentCount, UNDULATED_GROWTH, UNDULATED_INKS, UNDULATED_KINDS, UNDULATED_WEIGHTS, type UndulatedPlan } from "../../skill1/run-undulated";
import { agentsFromVoidEdge, attractorsFromVoidEdge, EDGE_FAMILIES, EDGE_GROWTHS, EDGE_SIDES, planVoidEdge, slimeFromVoidEdge, type VoidEdgePlan } from "../../skill1/run-void-edge";
import { slimeControlsFromTranslation } from "../../skill1/slime-controls";
import { translateArchetype } from "../../skill1/translate";
import type { FieldAttractor } from "../../skill1/types";
import type { ArchetypeSearchAdapter, SemanticGene } from "./adapter";
import type { RealizationState, SemanticPlan } from "./types";

export const WORKSPACE_ARCHETYPE_IDS = ["open-hall", "terraced", "flat-deep-plan", "void-edge", "undulated"] as const;

export type WorkspaceArchetypeId = (typeof WORKSPACE_ARCHETYPE_IDS)[number];

export function isWorkspaceArchetype(archetypeId: string): archetypeId is WorkspaceArchetypeId {
  return (WORKSPACE_ARCHETYPE_IDS as readonly string[]).includes(archetypeId);
}

export function createWorkspaceAdapter(archetypeId: string): ArchetypeSearchAdapter {
  if (!isWorkspaceArchetype(archetypeId)) throw new Error(`${archetypeId} has no semantic Workspace adapter`);
  const id = archetypeId;
  const genes = workspaceGenes(id);
  return {
    id: "workspace",
    archetypeId: id,
    typologyId: "workspace",
    primaryFamilyGene: "kind",
    sampleExplorer(rng) {
      const state = drawSalt(rng);
      return { plan: wrap(id, samplePlan(id, state)), state };
    },
    genes: () => genes,
    span() {
      return null;
    },
    repair(plan) {
      return repairWorkspace(id, asRecord(plan));
    },
    readGene(plan, name) {
      return asRecord(plan)[name];
    },
    realize(plan, state) {
      return realizeWorkspace(id, plan, state);
    },
    writeGene(plan, name, value) {
      return wrap(id, { ...asRecord(plan), [name]: value });
    },
  };
}

function workspaceGenes(id: WorkspaceArchetypeId): readonly SemanticGene[] {
  if (id === "open-hall") {
    return [
      { name: "kind", kind: "discrete", legal: OPEN_HALL_FAMILIES, mutationRole: "explore" },
      { name: "growth", kind: "growth", legal: OPEN_HALL_GROWTHS, mutationRole: "explore" },
      { name: "driftX", kind: "continuous", mutationRole: "place" },
      { name: "driftY", kind: "continuous", mutationRole: "place" },
      { name: "flip", kind: "discrete", legal: [false, true] },
    ];
  }
  if (id === "terraced") {
    return [
      { name: "kind", kind: "discrete", legal: TERRACE_FAMILIES, mutationRole: "explore" },
      { name: "growth", kind: "growth", legal: TERRACE_GROWTHS, mutationRole: "explore" },
      { name: "originX", kind: "continuous", mutationRole: "place" },
      { name: "originY", kind: "continuous", mutationRole: "place" },
      { name: "flip", kind: "discrete", legal: [false, true] },
    ];
  }
  if (id === "flat-deep-plan") {
    return [
      { name: "kind", kind: "discrete", legal: [...PLATE_KINDS, ...ORGANIC_KINDS], mutationRole: "explore" },
      { name: "cycle", kind: "growth", legal: FLAT_DEEP_CYCLES, mutationRole: "explore" },
      { name: "x0", kind: "continuous", mutationRole: "place" },
      { name: "y0", kind: "continuous", mutationRole: "place" },
      { name: "x1", kind: "continuous", mutationRole: "place" },
      { name: "y1", kind: "continuous", mutationRole: "place" },
    ];
  }
  if (id === "void-edge") {
    return [
      { name: "kind", kind: "discrete", legal: EDGE_FAMILIES, mutationRole: "explore" },
      { name: "side", kind: "discrete", legal: EDGE_SIDES, mutationRole: "explore" },
      { name: "growth", kind: "growth", legal: EDGE_GROWTHS, mutationRole: "explore" },
    ];
  }
  return [
    { name: "kind", kind: "discrete", legal: UNDULATED_KINDS, mutationRole: "explore" },
    { name: "growth", kind: "growth", legal: UNDULATED_GROWTH, mutationRole: "explore" },
    { name: "weight", kind: "discrete", legal: UNDULATED_WEIGHTS },
    { name: "ink", kind: "discrete", legal: UNDULATED_INKS },
    { name: "anchorX", kind: "continuous", mutationRole: "place" },
    { name: "anchorY", kind: "continuous", mutationRole: "place" },
  ];
}

function samplePlan(id: WorkspaceArchetypeId, state: RealizationState): Record<string, unknown> {
  const seed = numberField(state, "seed");
  const attempt = numberField(state, "attempt");
  const index = numberField(state, "index");
  if (id === "open-hall") return { ...planOpenHall(seed, attempt, index) };
  if (id === "terraced") return { ...planTerraced(seed, attempt, index) };
  if (id === "flat-deep-plan") return { ...planFlatDeepPlan(seed, attempt, index) };
  if (id === "void-edge") return { ...planVoidEdge(seed, attempt, index) };
  return { ...planUndulated(seed, attempt, index) };
}

function repairWorkspace(id: WorkspaceArchetypeId, body: Record<string, unknown>) {
  const gene = (name: string, legal: readonly (string | boolean)[]) => legal.map(String).includes(String(body[name]));
  if (id === "open-hall" && (!gene("kind", OPEN_HALL_FAMILIES) || !gene("growth", OPEN_HALL_GROWTHS))) return { ok: false as const, reasons: ["kind"] };
  if (id === "terraced" && (!gene("kind", TERRACE_FAMILIES) || !gene("growth", TERRACE_GROWTHS))) return { ok: false as const, reasons: ["kind"] };
  if (id === "void-edge" && (!gene("kind", EDGE_FAMILIES) || !gene("side", EDGE_SIDES) || !gene("growth", EDGE_GROWTHS))) return { ok: false as const, reasons: ["kind"] };
  if (id === "undulated" && (!gene("kind", UNDULATED_KINDS) || !gene("growth", UNDULATED_GROWTH))) return { ok: false as const, reasons: ["kind"] };
  if (id === "flat-deep-plan" && !gene("kind", [...PLATE_KINDS, ...ORGANIC_KINDS])) return { ok: false as const, reasons: ["kind"] };
  if (id === "flat-deep-plan" && body.cycle != null && !(FLAT_DEEP_CYCLES as readonly string[]).includes(String(body.cycle))) {
    return { ok: false as const, reasons: ["cycle"] };
  }
  const next = id === "flat-deep-plan"
    ? {
        ...body,
        organic: (ORGANIC_KINDS as readonly string[]).includes(String(body.kind)),
        cycle: (FLAT_DEEP_CYCLES as readonly string[]).includes(String(body.cycle))
          ? String(body.cycle)
          : String(Math.floor(Number(body.index) / PLATE_KINDS.length) % 7),
      }
    : body;
  return { ok: true as const, plan: wrap(id, next), repairedFields: [] as string[] };
}

function realizeWorkspace(id: WorkspaceArchetypeId, plan: SemanticPlan, state: RealizationState) {
  const base = translateArchetype(id);
  const slimeBase = slimeControlsFromTranslation(base);
  const seed = numberField(state, "seed");
  const attempt = numberField(state, "attempt");
  const body = asRecord(plan);
  const marks = workspaceMarks(id, body, seed, attempt);
  const first = marks[0];
  const translation = id === "flat-deep-plan"
    ? translationFromFlatDeep(base, body as FlatDeepPlan, marks)
    : {
        ...base,
        recipe: {
          ...base.recipe,
          attractors: marks,
          attractorFixed: true,
          attractorsOnly: true,
          attractor: first ? { x: first.x, y: first.y } : base.recipe.attractor,
        },
      };
  return {
    ok: true as const,
    agents: workspaceAgents(id, body, seed),
    slime: workspaceSlime(id, body, slimeBase, seed),
    translation,
  };
}

function workspaceMarks(id: WorkspaceArchetypeId, body: Record<string, unknown>, seed: number, attempt: number): FieldAttractor[] {
  if (id === "open-hall") return attractorsFromOpenHall(body as OpenHallPlan, seed, attempt);
  if (id === "terraced") return attractorsFromTerraced(body as TerracePlan, seed);
  if (id === "flat-deep-plan") return attractorsFromFlatDeep(body as FlatDeepPlan);
  if (id === "void-edge") return attractorsFromVoidEdge(body as VoidEdgePlan, seed, attempt);
  return attractorsFromUndulated(body as UndulatedPlan);
}

function workspaceAgents(id: WorkspaceArchetypeId, body: Record<string, unknown>, seed: number) {
  if (id === "open-hall") return agentsFromOpenHall(body as OpenHallPlan, seed);
  if (id === "terraced") return agentsFromTerraced(body as TerracePlan);
  if (id === "flat-deep-plan") return agentsFromFlatDeep(body as FlatDeepPlan);
  if (id === "void-edge") return agentsFromVoidEdge(body as VoidEdgePlan, seed);
  return undulatedAgentCount(body as UndulatedPlan, seed);
}

function workspaceSlime(id: WorkspaceArchetypeId, body: Record<string, unknown>, slimeBase: ReturnType<typeof slimeControlsFromTranslation>, seed: number) {
  if (id === "open-hall") return slimeFromOpenHall(slimeBase, body as OpenHallPlan, seed);
  if (id === "terraced") return slimeFromTerraced(slimeBase, body as TerracePlan, seed);
  if (id === "flat-deep-plan") return slimeFromFlatDeep(slimeBase, body as FlatDeepPlan, seed);
  if (id === "void-edge") return slimeFromVoidEdge(slimeBase, body as VoidEdgePlan, seed);
  return tuneUndulatedSlime(slimeBase, body as UndulatedPlan);
}

function wrap(archetypeId: WorkspaceArchetypeId, body: Record<string, unknown>): SemanticPlan {
  return { adapterId: "workspace", archetypeId, body };
}

function asRecord(plan: SemanticPlan) {
  return plan.body as Record<string, unknown>;
}

function drawSalt(rng: () => number): RealizationState {
  return {
    seed: Math.floor(rng() * 0x7fffffff),
    attempt: Math.floor(rng() * 6),
    index: Math.floor(rng() * 100),
  };
}

function numberField(record: Record<string, unknown> | RealizationState, name: string) {
  const value = record[name];
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}
