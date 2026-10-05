import type { FidelityDetail, FidelityProfile, RunPurpose, SemanticCandidate } from "./types";

export function assignFidelity(
  technicalValid: boolean,
  objectives: { formal: number; spatial: number; atmospheric: number },
  criterionMatch: Readonly<Record<string, number>>,
  profile: FidelityProfile | null | undefined,
): FidelityDetail {
  if (!technicalValid) {
    return { status: "not-evaluated", profileId: profile?.id ?? null, categories: null, criteria: null, categoryValues: null };
  }
  if (!profile) {
    return { status: "uncalibrated", profileId: null, categories: null, criteria: null, categoryValues: null };
  }
  const categories = {
    formal: objectives.formal >= profile.categoryFloors.formal,
    spatial: objectives.spatial >= profile.categoryFloors.spatial,
    atmospheric: objectives.atmospheric >= profile.categoryFloors.atmospheric,
  };
  const criteria: Record<string, boolean> = {};
  for (const [id, floor] of Object.entries(profile.criterionFloors)) {
    criteria[id] = (criterionMatch[id] ?? 0) >= floor;
  }
  const pass = categories.formal && categories.spatial && categories.atmospheric && Object.values(criteria).every(Boolean);
  return { status: pass ? "pass" : "fail", profileId: profile.id, categories, criteria, categoryValues: null };
}

/**
 * Development runs may exercise preservation while fidelity is still uncalibrated.
 * That eligibility is not a fidelity pass. Production requires pass.
 */
export function preservationEligible(candidate: Pick<SemanticCandidate, "technicalValid" | "fidelity">, purpose: RunPurpose) {
  if (purpose === "calibration") return false;
  if (!candidate.technicalValid) return false;
  if (candidate.fidelity.status === "pass") return true;
  return purpose === "development" && candidate.fidelity.status === "uncalibrated";
}
