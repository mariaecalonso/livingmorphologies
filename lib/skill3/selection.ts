import type { Skill2Selection } from "@/lib/skill2/published-selection";

/**
 * Minimum identity for the Skill 2 → Skill 3 handoff.
 * The catalogue writes it. `/lab/vertical` reads it and passes it to the existing loader.
 */

export const VERTICAL_SELECTION_KEY = "lm-vertical-selection";

/** Demo identity used only when the Process page has no explicit or saved Skill 2 selection. */
export const DEFAULT_PROCESS_ARCHETYPE_ID = "vertical-void";
export const DEFAULT_PROCESS_CANDIDATE_ID = 351;

export type ResolvedProcessSource = {
  selection: Skill2Selection;
  archetypeName: string;
  handoff: "verified" | "pending";
  z0Iteration: number | null;
  checksum: string | null;
};

export type VerticalSelection = {
  archetypeId: string;
  candidateId: number;
};

const ARCHETYPE_ID = /^[a-z0-9-]+$/;

export function parseVerticalSelection(value: unknown): VerticalSelection | null {
  if (!value || typeof value !== "object") return null;
  const record = value as { archetypeId?: unknown; candidateId?: unknown };
  const candidateId = typeof record.candidateId === "number" ? record.candidateId : Number(record.candidateId);
  if (typeof record.archetypeId !== "string" || !ARCHETYPE_ID.test(record.archetypeId)) return null;
  if (!Number.isInteger(candidateId) || candidateId < 1) return null;
  return { archetypeId: record.archetypeId, candidateId };
}

export function readVerticalSelection(): VerticalSelection | null {
  if (typeof window === "undefined") return null;
  const raw = window.sessionStorage.getItem(VERTICAL_SELECTION_KEY);
  if (!raw) return null;
  try {
    return parseVerticalSelection(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function writeVerticalSelection(selection: VerticalSelection) {
  const parsed = parseVerticalSelection(selection);
  if (!parsed || typeof window === "undefined") return;
  window.sessionStorage.setItem(VERTICAL_SELECTION_KEY, JSON.stringify(parsed));
}

function queryValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

/** Query present and well formed, query absent, or query present but not a candidate identity. */
export function selectionFromQuery(query: {
  archetype?: string | string[];
  candidate?: string | string[];
}): { selection: VerticalSelection } | { missing: true } | { error: string } {
  const archetype = queryValue(query.archetype);
  const candidate = queryValue(query.candidate);
  if (archetype == null && candidate == null) return { missing: true };
  const selection = parseVerticalSelection({ archetypeId: archetype, candidateId: candidate });
  if (!selection) return { error: "The stored selection is not a Skill 2 candidate." };
  return { selection };
}
