import { loadArchitecturalDnaRecord, loadClientActivitiesRecord } from "@/lib/skill5/load-client-documents";
import { allowedTypeLabel, dominantTile, eligibleTiles, rankedEligibleTiles } from "./program-tiles";
import { spacingBiasLabel, spacingProfile, spacingRangeLabel } from "./program-spacing";

/** Live Program Cluster rules from the current Client and DNA files. Does not generate geometry. */
export function readProgramClusterRules(programId: string) {
  const activities = loadClientActivitiesRecord();
  const dna = loadArchitecturalDnaRecord();
  const documents = { dna: dna.document, activities: activities.document };
  const ranked = rankedEligibleTiles(programId, documents);
  const spacing = spacingProfile(programId, activities.document);
  return {
    programId,
    allowedTypeLabel: allowedTypeLabel(programId),
    eligible: eligibleTiles(programId),
    eligibleCount: eligibleTiles(programId).length,
    ranked,
    dominant: dominantTile(programId, documents),
    spacing,
    spacingRangeLabel: spacingRangeLabel(spacing),
    spacingBiasLabel: spacingBiasLabel(spacing),
    clientActivitiesHash: activities.hash,
    architecturalDnaHash: dna.hash,
  };
}
