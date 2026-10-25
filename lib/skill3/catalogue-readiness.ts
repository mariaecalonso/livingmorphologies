import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { CARVED_MASS_SOURCES } from "@/lib/skill3/experiments/carved-mass-sources";

/**
 * Catalogue materialization states.
 * A downstream state appears only when `data/experiments/<folder>/<archetype>-<candidate>/Nxx.json` exists.
 * Skill 4 readiness is read from `data/experiments/<folder>-audit/full-360.jsonl`
 * (or the summary `full-360.json`). A mesh file without an audit row is not READY.
 *
 * Shrinkwrapped meshes, once generated, belong in
 * `criteria-hybrid-shrinkwrapped/<archetypeId>-<candidateId>/`.
 * Their audit belongs in `criteria-hybrid-shrinkwrapped-audit/full-360.jsonl`.
 */
export const MATERIALIZATION_STATES = ["open", "capped", "adapted", "shrinkwrapped", "thickened"] as const;

export type MaterializationState = (typeof MATERIALIZATION_STATES)[number];

export type DownstreamState = Exclude<MaterializationState, "open">;

export type ReadinessVerdict = "ready" | "review" | "fail";

export const MATERIALIZATION_FOLDERS: Record<MaterializationState, string> = {
  open: "criteria-hybrid",
  capped: "criteria-hybrid-capped",
  adapted: "criteria-hybrid-ihp-adapted",
  shrinkwrapped: "criteria-hybrid-shrinkwrapped",
  thickened: "criteria-hybrid-thickened",
};

export type CandidateReadiness = {
  status: ReadinessVerdict;
  reasons: string[];
  facts?: Record<string, string>;
};

export type StateReadiness = {
  audited: boolean;
  ready: number;
  review: number;
  fail: number;
  candidates: Record<string, CandidateReadiness>;
};

export type CatalogueReadiness = {
  states: MaterializationState[];
  downstream: Partial<Record<DownstreamState, StateReadiness>>;
};

const DOWNSTREAM: readonly DownstreamState[] = ["capped", "adapted", "shrinkwrapped", "thickened"];

type AuditIndex = Map<string, Map<string, CandidateReadiness>>;

const auditCache = new Map<string, { key: string; index: AuditIndex }>();

function verdictOf(status: string): ReadinessVerdict | null {
  if (status === "READY") return "ready";
  if (status === "GEOMETRY_REVIEW" || status === "HANDOFF_REVIEW") return "review";
  if (status === "FAIL") return "fail";
  return null;
}

function reasonsOf(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.length > 0);
}

function factsOf(value: unknown) {
  if (!value || typeof value !== "object") return undefined;
  const facts: Record<string, string> = {};
  for (const [key, item] of Object.entries(value)) {
    if (typeof item === "string" || typeof item === "number") facts[key] = String(item);
  }
  return Object.keys(facts).length > 0 ? facts : undefined;
}

function remember(index: AuditIndex, archetypeId: string, continuationId: string, status: ReadinessVerdict, reasons: string[], facts?: Record<string, string>) {
  if (!/^N\d{2}$/.test(continuationId)) return;
  let family = index.get(archetypeId);
  if (!family) {
    family = new Map();
    index.set(archetypeId, family);
  }
  family.set(continuationId, { status, reasons: status === "ready" ? [] : reasons, ...(facts ? { facts } : {}) });
}

function indexFromJsonl(file: string): AuditIndex {
  const index: AuditIndex = new Map();
  const text = readFileSync(file, "utf8");
  for (const line of text.split(/\r?\n/)) {
    if (!line) continue;
    let row: { archetypeId?: unknown; continuationId?: unknown; status?: unknown; reasons?: unknown; facts?: unknown };
    try {
      row = JSON.parse(line) as typeof row;
    } catch {
      continue;
    }
    if (typeof row.archetypeId !== "string" || typeof row.continuationId !== "string" || typeof row.status !== "string") continue;
    const status = verdictOf(row.status);
    if (!status) continue;
    remember(index, row.archetypeId, row.continuationId, status, reasonsOf(row.reasons), factsOf(row.facts));
  }
  return index;
}

function indexFromSummary(file: string): AuditIndex {
  const index: AuditIndex = new Map();
  let summary: {
    byArchetype?: Record<string, { READY?: number; GEOMETRY_REVIEW?: number; HANDOFF_REVIEW?: number; FAIL?: number }>;
    notReady?: Array<{ archetypeId?: string; continuationId?: string; status?: string; reasons?: unknown }>;
  };
  try {
    summary = JSON.parse(readFileSync(file, "utf8")) as typeof summary;
  } catch {
    return index;
  }
  const notReady = new Map<string, { status: ReadinessVerdict; reasons: string[] }>();
  for (const row of summary.notReady ?? []) {
    if (!row.archetypeId || !row.continuationId || !row.status) continue;
    const status = verdictOf(row.status);
    if (!status || status === "ready") continue;
    notReady.set(`${row.archetypeId}:${row.continuationId}`, { status, reasons: reasonsOf(row.reasons) });
  }
  const continuations = Array.from({ length: 24 }, (_, slot) => `N${String(slot + 1).padStart(2, "0")}`);
  for (const [archetypeId, counts] of Object.entries(summary.byArchetype ?? {})) {
    const total = (counts.READY ?? 0) + (counts.GEOMETRY_REVIEW ?? 0) + (counts.HANDOFF_REVIEW ?? 0) + (counts.FAIL ?? 0);
    if (total !== continuations.length) {
      for (const continuationId of continuations) {
        const hit = notReady.get(`${archetypeId}:${continuationId}`);
        if (hit) remember(index, archetypeId, continuationId, hit.status, hit.reasons);
      }
      continue;
    }
    for (const continuationId of continuations) {
      const hit = notReady.get(`${archetypeId}:${continuationId}`);
      if (hit) remember(index, archetypeId, continuationId, hit.status, hit.reasons);
      else remember(index, archetypeId, continuationId, "ready", []);
    }
  }
  return index;
}

function auditIndex(state: DownstreamState): AuditIndex | null {
  const dir = path.join(process.cwd(), "data", "experiments", `${MATERIALIZATION_FOLDERS[state]}-audit`);
  const jsonl = path.join(dir, "full-360.jsonl");
  const summary = path.join(dir, "full-360.json");
  const file = existsSync(jsonl) ? jsonl : existsSync(summary) ? summary : null;
  if (!file) return null;
  const stat = statSync(file);
  const key = `${file}:${stat.mtimeMs}:${stat.size}`;
  const cached = auditCache.get(state);
  if (cached?.key === key) return cached.index;
  const index = file.endsWith(".jsonl") ? indexFromJsonl(file) : indexFromSummary(file);
  auditCache.set(state, { key, index });
  return index;
}

function meshCount(archetypeId: string, candidateId: number, state: MaterializationState) {
  const dir = path.join(process.cwd(), "data", "experiments", MATERIALIZATION_FOLDERS[state], `${archetypeId}-${candidateId}`);
  if (!existsSync(dir)) return 0;
  return readdirSync(dir).filter((name) => /^N\d{2}\.json$/.test(name)).length;
}

function readinessFrom(family: Map<string, CandidateReadiness> | undefined): StateReadiness {
  const candidates: Record<string, CandidateReadiness> = {};
  let ready = 0;
  let review = 0;
  let fail = 0;
  if (!family || family.size === 0) return { audited: false, ready, review, fail, candidates };
  for (const [id, entry] of family) {
    candidates[id] = entry;
    if (entry.status === "ready") ready += 1;
    else if (entry.status === "review") review += 1;
    else fail += 1;
  }
  return { audited: true, ready, review, fail, candidates };
}

export function catalogueReadiness(archetypeId: string): CatalogueReadiness {
  const source = CARVED_MASS_SOURCES.find((item) => item.archetypeId === archetypeId);
  const states: MaterializationState[] = ["open"];
  const downstream: CatalogueReadiness["downstream"] = {};
  if (!source) return { states, downstream };
  for (const state of DOWNSTREAM) {
    if (meshCount(source.archetypeId, source.candidateId, state) < 1) continue;
    states.push(state);
    downstream[state] = readinessFrom(auditIndex(state)?.get(source.archetypeId));
  }
  return { states, downstream };
}
