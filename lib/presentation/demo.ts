/** Static presentation files for the public demo. No research filesystem. */

export const PRESENTATION_ARCHETYPE = "vertical-void";
export const PRESENTATION_CANDIDATE = 351;

export function demoPreviewSrc(archetypeId: string, candidateId: number) {
  return `/demo/skill2/previews/${archetypeId}/${candidateId}.webp`;
}

export function presentationBundleUrl(archetypeId: string, candidateId: number) {
  if (archetypeId === PRESENTATION_ARCHETYPE && candidateId === PRESENTATION_CANDIDATE) {
    return `/demo/skill3/${archetypeId}/${candidateId}.json`;
  }
  return null;
}
