import { BRANCHES, criteriaForTypology } from "@/lib/catalog";
import type { CriterionDefinition, Rating, TypologyId } from "@/lib/types";
import { SITE_ARCHETYPES } from "./catalog";

export const DNA_CONTRACT = "skill5-architectural-dna-v1";

export type DnaBasis = "geometry" | "review" | "manual";

export type DnaAnalysis = {
  value: Rating;
  basis: Exclude<DnaBasis, "manual">;
  justification: string;
};

export type DnaScore = {
  criterionId: string;
  value: Rating;
  basis: DnaBasis;
  justification: string;
  analyzed: DnaAnalysis;
};

export type ArchetypeDna = {
  archetypeId: string;
  moduleId: string;
  program: TypologyId;
  ratings: DnaScore[];
};

export type ArchitecturalDnaDocument = {
  contract: typeof DNA_CONTRACT;
  profiles: ArchetypeDna[];
};

export const RATING_LABEL = ["Low", "Medium", "High"] as const;

export function ratingLabel(value: Rating) {
  return RATING_LABEL[value];
}

export function criteriaMatrix(): { id: string; title: string; criteria: (CriterionDefinition & { typology: string | null })[] }[] {
  return BRANCHES.map((branch) => ({
    id: branch.id,
    title: branch.title,
    criteria: [
      ...branch.shared.map((item) => ({ ...item, typology: null })),
      { ...branch.specific.lobby, typology: "Lobby" },
      { ...branch.specific.workspace, typology: "Workspace" },
      { ...branch.specific.gathering, typology: "Gathering" },
    ],
  }));
}

export function applicableCriteria(program: TypologyId) {
  return criteriaForTypology(program);
}

function isRating(value: unknown): value is Rating {
  return value === 0 || value === 1 || value === 2;
}

function isProgram(value: unknown): value is TypologyId {
  return value === "lobby" || value === "workspace" || value === "gathering";
}

function readAnalysis(value: unknown): DnaAnalysis | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Partial<DnaAnalysis>;
  if (!isRating(record.value)) return null;
  if (record.basis !== "geometry" && record.basis !== "review") return null;
  if (typeof record.justification !== "string" || record.justification.trim().length < 12) return null;
  return { value: record.value, basis: record.basis, justification: record.justification.trim() };
}

function readScore(value: unknown, expectedId: string): DnaScore | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Partial<DnaScore>;
  if (record.criterionId !== expectedId || !isRating(record.value)) return null;
  if (record.basis !== "geometry" && record.basis !== "review" && record.basis !== "manual") return null;
  if (typeof record.justification !== "string" || record.justification.trim().length < 12) return null;
  const analyzed = readAnalysis(record.analyzed);
  if (!analyzed) return null;
  return {
    criterionId: expectedId,
    value: record.value,
    basis: record.basis,
    justification: record.justification.trim(),
    analyzed,
  };
}

/** Rejects a document that does not cover every archetype with its nine criteria. */
export function parseArchitecturalDna(value: unknown): ArchitecturalDnaDocument | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Partial<ArchitecturalDnaDocument>;
  if (record.contract !== DNA_CONTRACT || !Array.isArray(record.profiles)) return null;
  if (record.profiles.length !== SITE_ARCHETYPES.length) return null;
  const profiles: ArchetypeDna[] = [];
  for (const entry of SITE_ARCHETYPES) {
    const profile = record.profiles.find((item) => item && typeof item === "object" && (item as ArchetypeDna).archetypeId === entry.archetypeId) as Partial<ArchetypeDna> | undefined;
    if (!profile || profile.moduleId !== entry.moduleId || !isProgram(profile.program) || profile.program !== entry.program) return null;
    const expected = applicableCriteria(profile.program);
    if (!Array.isArray(profile.ratings) || profile.ratings.length !== expected.length) return null;
    const ratings: DnaScore[] = [];
    for (const criterion of expected) {
      const score = readScore(profile.ratings.find((item) => item && (item as DnaScore).criterionId === criterion.id), criterion.id);
      if (!score) return null;
      ratings.push(score);
    }
    profiles.push({ archetypeId: entry.archetypeId, moduleId: entry.moduleId, program: profile.program, ratings });
  }
  return { contract: DNA_CONTRACT, profiles };
}

export function withRating(document: ArchitecturalDnaDocument, archetypeId: string, criterionId: string, value: Rating): ArchitecturalDnaDocument {
  return {
    contract: DNA_CONTRACT,
    profiles: document.profiles.map((profile) => {
      if (profile.archetypeId !== archetypeId) return profile;
      return {
        ...profile,
        ratings: profile.ratings.map((score) => {
          if (score.criterionId !== criterionId) return score;
          const manual = value !== score.analyzed.value;
          return {
            ...score,
            value,
            basis: manual ? "manual" : score.analyzed.basis,
          };
        }),
      };
    }),
  };
}
