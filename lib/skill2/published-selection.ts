import type { RealizationState, SemanticPlan } from "@/lib/skill2/semantic/types";

/** One published Skill 2 candidate per archetype. Not a Skill 3 handoff. */
export const SKILL2_SELECTIONS_KEY = "lm-skill2-selections";
/** Previous single-candidate key. Read once so an existing session is kept. */
export const SKILL2_SELECTION_KEY = "lm-skill2-selection";
/** Archetype whose morphology Skill 3 is showing. Does not start propagation. */
export const SKILL3_ACTIVE_KEY = "lm-skill3-active";
export const SKILL2_ARCHETYPE_TOTAL = 15;

export type Skill2Selection = {
  archetypeId: string;
  typologyId: string;
  candidateId: number;
  objectives: { formal: number; spatial: number; atmospheric: number };
  pareto: boolean;
  specialist: "formal" | "spatial" | "atmospheric" | null;
  diversity: "none" | "tag" | "rescue";
  plan: SemanticPlan;
  state: RealizationState;
  previewFile: string | null;
};

const ARCHETYPE_ID = /^[a-z0-9-]+$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function isNumberRecord(value: unknown): value is RealizationState {
  if (!isRecord(value)) return false;
  return Object.values(value).every((item) => typeof item === "number" && Number.isFinite(item));
}

export function parseSkill2Selection(value: unknown): Skill2Selection | null {
  if (!isRecord(value)) return null;
  const candidateId = typeof value.candidateId === "number" ? value.candidateId : Number(value.candidateId);
  if (typeof value.archetypeId !== "string" || !ARCHETYPE_ID.test(value.archetypeId)) return null;
  if (!Number.isInteger(candidateId) || candidateId < 1) return null;
  if (typeof value.typologyId !== "string") return null;
  if (!isRecord(value.objectives)) return null;
  const { formal, spatial, atmospheric } = value.objectives;
  if (typeof formal !== "number" || typeof spatial !== "number" || typeof atmospheric !== "number") return null;
  if (typeof value.pareto !== "boolean") return null;
  if (value.specialist != null && value.specialist !== "formal" && value.specialist !== "spatial" && value.specialist !== "atmospheric") return null;
  if (value.diversity !== "none" && value.diversity !== "tag" && value.diversity !== "rescue") return null;
  if (!isRecord(value.plan) || typeof value.plan.adapterId !== "string" || value.plan.archetypeId !== value.archetypeId) return null;
  if (!isNumberRecord(value.state)) return null;
  if (value.previewFile != null && typeof value.previewFile !== "string") return null;
  return {
    archetypeId: value.archetypeId,
    typologyId: value.typologyId,
    candidateId,
    objectives: { formal, spatial, atmospheric },
    pareto: value.pareto,
    specialist: value.specialist ?? null,
    diversity: value.diversity,
    plan: { adapterId: value.plan.adapterId, archetypeId: value.plan.archetypeId, body: value.plan.body },
    state: value.state,
    previewFile: value.previewFile ?? null,
  };
}

export type Skill2Selections = Record<string, Skill2Selection>;

function parseSkill2Selections(value: unknown): Skill2Selections {
  if (!isRecord(value)) return {};
  const selections: Skill2Selections = {};
  for (const [archetypeId, entry] of Object.entries(value)) {
    const selection = parseSkill2Selection(entry);
    if (!selection || selection.archetypeId !== archetypeId) continue;
    selections[archetypeId] = selection;
  }
  return selections;
}

function readLegacySelection(): Skill2Selection | null {
  if (typeof window === "undefined") return null;
  const raw = window.sessionStorage.getItem(SKILL2_SELECTION_KEY);
  if (!raw) return null;
  try {
    return parseSkill2Selection(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function readSkill2Selections(): Skill2Selections {
  if (typeof window === "undefined") return {};
  const raw = window.sessionStorage.getItem(SKILL2_SELECTIONS_KEY);
  if (raw) {
    try {
      return parseSkill2Selections(JSON.parse(raw));
    } catch {
      return {};
    }
  }
  const legacy = readLegacySelection();
  if (!legacy) return {};
  const selections = { [legacy.archetypeId]: legacy };
  window.sessionStorage.setItem(SKILL2_SELECTIONS_KEY, JSON.stringify(selections));
  return selections;
}

/** Replaces only this archetype. Every other stored archetype stays. */
export function writeSkill2Selection(selection: Skill2Selection): Skill2Selections {
  const parsed = parseSkill2Selection(selection);
  if (!parsed || typeof window === "undefined") return readSkill2Selections();
  const selections = { ...readSkill2Selections(), [parsed.archetypeId]: parsed };
  window.sessionStorage.setItem(SKILL2_SELECTIONS_KEY, JSON.stringify(selections));
  return selections;
}

export function readActiveArchetype(): string | null {
  if (typeof window === "undefined") return null;
  const value = window.sessionStorage.getItem(SKILL3_ACTIVE_KEY);
  return value && ARCHETYPE_ID.test(value) ? value : null;
}

export function writeActiveArchetype(archetypeId: string) {
  if (typeof window === "undefined" || !ARCHETYPE_ID.test(archetypeId)) return;
  window.sessionStorage.setItem(SKILL3_ACTIVE_KEY, archetypeId);
}

export function selectionPreviewSrc(selection: Skill2Selection) {
  if (selection.previewFile !== `previews/${selection.candidateId}.png`) return null;
  return `/api/semantic-catalog/${selection.archetypeId}/${selection.candidateId}`;
}
