import { hashSeed, mulberry32 } from "../physarum";
import { createSimulation, stepMany } from "../skill1/engine";
import { toHandoff, translateArchetype } from "../skill1/translate";
import type { BiologicalTranslation, SimulationState, Skill1Handoff } from "../skill1/types";
import type { TypologyId } from "../types";
import { EVALUATION_CALIBRATION } from "./evaluation-config";
import { evaluateMorphology } from "./evaluate";
import { measureMorphologyDetailed } from "./measurements";
import { buildPlanModel } from "./plan-model";
import { planMorphogenesis } from "./plan-morphogenesis";
import type { ArchitecturalPlan } from "./plan-morphogenesis";
import type { MorphologyMeasurementResult } from "./measurements";
import { evaluateArchetypeValidity } from "./archetype-validity";
import type { ArchetypeValidityResult } from "./archetype-validity";
import { sectionTranslate } from "./section-translate";
import type { SectionModel } from "./section-translate";
import { sectionMorphogenesis, toSectionModel } from "./section-morphogenesis";
import type { MorphogeneticSectionModel } from "./section-morphogenesis";
import type { CandidateEvaluation } from "./types";

/** Same realization protocol as frozen Skill 2 calibration. Values inlined so the UI bundle does not load Node calibration I/O. */
export const SKILL2_AUDIT_PROTOCOL = {
  name: "skill2-visual-audit",
  agentCount: 1000,
  maxIterations: 600,
  trailDecay: 0.986,
  seedNamespace: "skill2-calibration-v1",
  seedFormula: 'hashSeed(["skill2-calibration-v1", archetypeId, String(sampleIndex)])',
} as const;

export type Skill2AuditRealization = {
  seed: number;
  agentCount: number;
  maxIterations: number;
  trailDecay: number;
  baseline: boolean;
};

export type Skill2AuditResult = {
  typologyId: TypologyId;
  archetypeId: string;
  sampleIndex: number;
  seed: number;
  protocol: typeof SKILL2_AUDIT_PROTOCOL;
  realization: Skill2AuditRealization;
  translation: BiologicalTranslation;
  handoff: Skill1Handoff;
  state: SimulationState;
  morphology: MorphologyMeasurementResult;
  architecturalPlan: ArchitecturalPlan;
  evaluation: CandidateEvaluation;
  section: SectionModel;
  morphogenesis: MorphogeneticSectionModel;
  extractedValidity: ArchetypeValidityResult;
  validity: ArchetypeValidityResult;
  elapsedMs: number;
};

export function skill2AuditSeed(archetypeId: string, sampleIndex: number) {
  return hashSeed(["skill2-calibration-v1", archetypeId, String(sampleIndex)]);
}

export function runSkill2Audit(input: {
  typologyId: TypologyId;
  archetypeId: string;
  sampleIndex?: number;
  seed?: number;
  agentCount?: number;
  maxIterations?: number;
  trailDecay?: number;
}): Skill2AuditResult {
  const sampleIndex = input.sampleIndex ?? 0;
  const translation = translateArchetype(input.archetypeId);
  const handoff = toHandoff(translation);
  const seed =
    input.seed != null && Number.isFinite(input.seed)
      ? input.seed >>> 0
      : skill2AuditSeed(input.archetypeId, sampleIndex);
  const agentCount =
    input.agentCount != null && Number.isFinite(input.agentCount)
      ? Math.max(1, Math.min(2000, Math.round(input.agentCount)))
      : SKILL2_AUDIT_PROTOCOL.agentCount;
  const maxIterations =
    input.maxIterations != null && Number.isFinite(input.maxIterations)
      ? Math.max(1, Math.min(1000, Math.round(input.maxIterations)))
      : SKILL2_AUDIT_PROTOCOL.maxIterations;
  const trailDecay =
    input.trailDecay != null && Number.isFinite(input.trailDecay)
      ? Math.max(0.96, Math.min(0.998, input.trailDecay))
      : SKILL2_AUDIT_PROTOCOL.trailDecay;
  const defaultSeed = skill2AuditSeed(input.archetypeId, sampleIndex);
  const baseline =
    agentCount === SKILL2_AUDIT_PROTOCOL.agentCount &&
    maxIterations === SKILL2_AUDIT_PROTOCOL.maxIterations &&
    Math.abs(trailDecay - SKILL2_AUDIT_PROTOCOL.trailDecay) < 1e-9 &&
    seed === defaultSeed;
  const started = Date.now();
  const rng = mulberry32(seed ^ 0x9e3779b9);
  const state = createSimulation(translation, seed, agentCount);
  state.maxIterations = maxIterations;
  stepMany(state, translation, rng, maxIterations, trailDecay);
  const morphology = measureMorphologyDetailed(state);
  const architecturalPlan = planMorphogenesis(input.archetypeId, buildPlanModel(state, morphology));
  const evaluation = evaluateMorphology({
    typologyId: input.typologyId,
    archetypeId: input.archetypeId,
    measurements: morphology.measurements,
  });
  const section = sectionTranslate(state, morphology);
  const morphogenesis = sectionMorphogenesis({
    archetypeId: input.archetypeId,
    extracted: section,
    morphology,
    handoff,
    state,
  });
  const extractedValidity = evaluateArchetypeValidity(input.archetypeId, section);
  const validity = evaluateArchetypeValidity(input.archetypeId, toSectionModel(morphogenesis));
  return {
    typologyId: input.typologyId,
    archetypeId: input.archetypeId,
    sampleIndex,
    seed,
    protocol: SKILL2_AUDIT_PROTOCOL,
    realization: { seed, agentCount, maxIterations, trailDecay, baseline },
    translation,
    handoff,
    state,
    morphology,
    architecturalPlan,
    evaluation,
    section,
    morphogenesis,
    extractedValidity,
    validity,
    elapsedMs: Date.now() - started,
  };
}

export { EVALUATION_CALIBRATION };
