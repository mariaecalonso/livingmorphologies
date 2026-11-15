import documentJson from "@/data/skill5/architectural-dna.json";
import { criteriaForTypology } from "@/lib/catalog";
import { SITE_ARCHETYPES } from "@/lib/skill5/catalog";
import { parseArchitecturalDna, withRating } from "@/lib/skill5/architectural-dna";

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

const document = parseArchitecturalDna(documentJson);
assert(document !== null, "The architectural DNA record did not parse.");
assert(document.profiles.length === 15, `Expected 15 archetypes, found ${document.profiles.length}.`);
assert(SITE_ARCHETYPES.length === 15, `The tile library has ${SITE_ARCHETYPES.length} archetypes.`);

for (const entry of SITE_ARCHETYPES) {
  const profile = document.profiles.find((item) => item.archetypeId === entry.archetypeId);
  assert(profile != null, `${entry.archetypeId} has no DNA profile.`);
  assert(profile.moduleId === entry.moduleId, `${entry.archetypeId} is tied to the wrong module.`);
  assert(profile.program === entry.program, `${entry.archetypeId} has the wrong typology.`);
  const expected = criteriaForTypology(profile.program).map((item) => item.id);
  assert(expected.length === 9, `${entry.archetypeId} was not given nine criteria.`);
  assert(profile.ratings.map((score) => score.criterionId).join() === expected.join(), `${entry.archetypeId} uses the wrong nine criteria.`);
  for (const score of profile.ratings) {
    assert(score.value === 0 || score.value === 1 || score.value === 2, `${entry.name} ${score.criterionId} is outside 0–2.`);
    assert(score.justification.length > 20, `${entry.name} ${score.criterionId} has no architectural justification.`);
    assert(score.basis === "geometry" || score.basis === "review", `${entry.name} ${score.criterionId} started as a hand adjustment.`);
    assert(score.analyzed.value === score.value && score.analyzed.basis === score.basis, `${entry.name} ${score.criterionId} does not match its recorded analysis.`);
  }
  const changed = withRating(document, entry.archetypeId, profile.ratings[0].criterionId, profile.ratings[0].value === 2 ? 0 : 2);
  const edited = changed.profiles.find((item) => item.archetypeId === entry.archetypeId)?.ratings[0];
  assert(edited?.basis === "manual", `${entry.name} did not record a hand adjustment.`);
  const restored = withRating(changed, entry.archetypeId, profile.ratings[0].criterionId, profile.ratings[0].analyzed.value);
  const back = restored.profiles.find((item) => item.archetypeId === entry.archetypeId)?.ratings[0];
  assert(back?.basis === profile.ratings[0].analyzed.basis && back.value === profile.ratings[0].analyzed.value, `${entry.name} did not return to the mesh reading.`);
}

console.log("architectural DNA checks passed");
