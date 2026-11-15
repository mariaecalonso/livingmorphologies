import dnaJson from "@/data/skill5/architectural-dna.json";
import activityJson from "@/data/skill5/client-activities.json";
import { criteriaMatrix, parseArchitecturalDna, withRating } from "@/lib/skill5/architectural-dna";
import { SITE_ARCHETYPES } from "@/lib/skill5/catalog";
import {
  CLIENT_ACTIVITY_SEED,
  UNIVERSAL_CRITERIA,
  compareDocument,
  compareTile,
  parseClientCompatibility,
  rankForActivity,
  similarity,
  withDesire,
  type ClientActivity,
  type CriterionMatch,
} from "@/lib/skill5/client-compatibility";
import { readSuitability } from "@/lib/skill5/suitability";

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

const dna = parseArchitecturalDna(dnaJson);
const activities = parseClientCompatibility(activityJson);
assert(dna !== null, "DNA record did not parse.");
assert(activities !== null, "Client activity record did not parse.");
assert(activities.activities.length === 12, "Expected twelve building spaces.");
assert(activities.client === "ecoLogicStudio", "The current program is not ecoLogicStudio.");
assert(activities.occupancy.daytime === "400–500" && activities.occupancy.evening === "800", "Occupancy figures changed.");

const APPROVED: Record<string, { program: "lobby" | "workspace" | "gathering"; pairs: string }> = {
  "public-lobby": { program: "lobby", pairs: "2/2, 0/2, 2/3, 2/3, 2/3, 2/2, 1/2, 2/3, 2/3" },
  "private-staff-lobby": { program: "lobby", pairs: "0/2, 0/2, 1/2, 1/1, 2/3, 2/3, 0/1, 0/2, 1/2" },
  "architecture-design-studio": { program: "workspace", pairs: "1/2, 0/2, 0/2, 1/2, 1/3, 2/2, 0/2, 1/2, 2/3" },
  "product-design-studio": { program: "workspace", pairs: "1/2, 0/2, 0/2, 1/2, 1/3, 2/2, 0/2, 1/2, 2/3" },
  "prototyping-fabrication-lab": { program: "workspace", pairs: "0/2, 0/2, 0/2, 1/3, 2/3, 2/2, 0/1, 2/3, 2/2" },
  "biological-research-lab": { program: "workspace", pairs: "1/2, 0/2, 0/2, 0/3, 1/3, 0/2, 0/2, 1/2, 1/2" },
  "interdisciplinary-collaboration-hub": { program: "gathering", pairs: "1/1, 1/2, 2/3, 1/3, 2/3, 1/2, 1/2, 1/2, 1/3" },
  "public-exhibition-gallery": { program: "gathering", pairs: "2/2, 1/2, 2/3, 1/2, 2/3, 2/2, 2/3, 2/3, 1/2" },
  "indoor-public-gathering": { program: "gathering", pairs: "1/1, 1/2, 2/3, 2/3, 2/3, 2/2, 2/2, 1/3, 1/3" },
  "waterfront-gathering": { program: "gathering", pairs: "1/2, 1/2, 2/3, 2/3, 2/3, 2/2, 2/2, 2/3, 1/2" },
  "public-restaurant": { program: "gathering", pairs: "1/1, 1/2, 1/2, 2/2, 2/3, 1/2, 1/2, 1/2, 1/3" },
  "staff-dining": { program: "gathering", pairs: "0/1, 0/1, 0/2, 1/2, 1/3, 0/2, 1/2, 1/2, 1/3" },
};
const ORDER: Record<"lobby" | "workspace" | "gathering", readonly string[]> = {
  lobby: ["complexity", "proportionality", "centrality", "openness", "connectivity", "directionality", "immersive", "visibility", "receptivity"],
  workspace: ["complexity", "proportionality", "plate-articulation", "openness", "connectivity", "modularity", "immersive", "visibility", "collaboration"],
  gathering: ["complexity", "proportionality", "circulation-integration", "openness", "connectivity", "spatial-permanence", "immersive", "visibility", "social-proximity"],
};
const retired = ["bio-research", "computation", "furniture-design", "fashion-design", "prototyping", "lobby-arrival", "exhibition", "collaborative-social"];
assert(retired.every((id) => !activities.activities.some((item) => item.id === id)), "A retired fictional activity is still selectable.");
assert(dna.profiles.length === 15 && SITE_ARCHETYPES.length === 15, "The fifteen original tiles are no longer intact.");
let pairCount = 0;
for (const activity of activities.activities) {
  const approved = APPROVED[activity.id];
  assert(approved != null, `${activity.id} is not an approved room.`);
  assert(activity.contexts.length === 1 && activity.contexts[0] === approved.program, `${activity.name} is in the wrong typology.`);
  assert(activity.desires.length === 9, `${activity.name} does not have nine criteria.`);
  const expected = ORDER[approved.program].map((criterionId, index) => {
    const [value, weight] = approved.pairs.split(",").map((item) => item.trim())[index].split("/").map(Number);
    return { criterionId, value, weight };
  });
  for (const item of expected) {
    const desire = activity.desires.find((row) => row.criterionId === item.criterionId);
    assert(desire != null && desire.value === item.value && desire.weight === item.weight, `${activity.name} ${item.criterionId} does not match the approved pair.`);
    assert(desire.value >= 0 && desire.value <= 2 && desire.weight >= 1 && desire.weight <= 3, `${activity.name} ${item.criterionId} is outside the rating or priority range.`);
    pairCount += 1;
  }
}
assert(pairCount === 108, `Expected 108 rating/priority pairs, found ${pairCount}.`);
const architecture = activities.activities.find((item) => item.id === "architecture-design-studio");
const product = activities.activities.find((item) => item.id === "product-design-studio");
assert(architecture != null && product != null, "The two design studios are missing.");
assert(architecture.desires.every((desire, index) => {
  const other = product.desires[index];
  return other.criterionId === desire.criterionId && other.value === desire.value && other.weight === desire.weight;
}), "Architecture and Product Design profiles are not identical.");
const counts = { lobby: 0, workspace: 0, gathering: 0 };
for (const activity of activities.activities) counts[activity.contexts[0]] += 1;
assert(counts.lobby === 2 && counts.workspace === 4 && counts.gathering === 6, "The typology counts are not 2 lobby, 4 workspace, and 6 gathering.");

function weighted(matches: readonly CriterionMatch[]) {
  const rows = matches.filter((match) => match.similarity !== null);
  const weight = rows.reduce((sum, match) => sum + match.weight, 0);
  const raw = rows.reduce((sum, match) => sum + match.weight * (match.similarity ?? 0), 0);
  return Math.round((raw / weight) * 100);
}

const results = compareDocument(dna, activities);
assert(results.length === 15 * 12, `Expected a result for every tile and room, found ${results.length}.`);
const valid = results.filter((result) => result.applicable);
assert(valid.length === 60, `Expected 60 same-typology comparisons, found ${valid.length}.`);
const compared = { lobby: 0, workspace: 0, gathering: 0 };
for (const result of results) {
  const universal = result.matches.filter((match) => match.scope === "universal");
  const specific = result.matches.filter((match) => match.scope === "specific");
  const profile = dna.profiles.find((item) => item.archetypeId === result.archetypeId);
  const activity = activities.activities.find((item) => item.id === result.activityId);
  assert(profile != null && activity != null, "A comparison lost its tile or activity.");
  const sameTypology = activity.contexts.includes(profile.program);
  assert(result.applicable === sameTypology, `${result.archetypeId} ${result.activityId} applied the wrong typology gate.`);
  if (!sameTypology) {
    assert(result.percent === null && result.universalPercent === null && result.specificPercent === null, `${result.archetypeId} ${result.activityId} scored a cross-typology pair.`);
    assert(result.matches.length === 0 && result.specificApplied === false && result.specificEvidence === null, `${result.archetypeId} ${result.activityId} kept cross-typology criteria.`);
    continue;
  }
  compared[profile.program] += 1;
  assert(universal.length === 6 && universal.every((match) => match.similarity !== null), `${result.archetypeId} ${result.activityId} did not use six universal criteria.`);
  assert(UNIVERSAL_CRITERIA.every((id) => universal.some((match) => match.criterionId === id)), `${result.archetypeId} ${result.activityId} is missing a universal criterion.`);
  assert(result.percent !== null && result.percent === result.universalPercent, `${result.archetypeId} ${result.activityId} does not rank on the universal match.`);
  assert(result.percent === weighted(universal), `${result.archetypeId} ${result.activityId} does not match the six-criterion formula.`);
  assert(specific.length === 3 && result.specificApplied && result.specificPercent === weighted(specific), `${result.archetypeId} ${result.activityId} typology score is not the three-criterion formula.`);
  assert(result.specificEvidence !== null, `${result.archetypeId} ${result.activityId} lost its typology evidence count.`);
  const counted = result.universalEvidence.geometry + result.universalEvidence.review + result.universalEvidence.manual;
  assert(counted === universal.filter((match) => match.similarity !== null).length, `${result.archetypeId} ${result.activityId} evidence count does not match the contributing criteria.`);
}
assert(compared.lobby === 10 && compared.workspace === 20 && compared.gathering === 30, "The typology comparison counts are not 5×2, 5×4, and 5×6.");

const lab = activities.activities.find((item) => item.id === "biological-research-lab") as ClientActivity;
const waterfront = activities.activities.find((item) => item.id === "waterfront-gathering") as ClientActivity;
const lobbyRoom = activities.activities.find((item) => item.id === "public-lobby") as ClientActivity;
const enclosed = dna.profiles.find((item) => item.archetypeId === "flat-deep-plan");
const openHall = dna.profiles.find((item) => item.archetypeId === "open-hall");
assert(enclosed != null && openHall != null, "The comparison tiles are missing.");
assert(enclosed.ratings.find((item) => item.criterionId === "openness")?.value === 0, "Flat Deep Plan is no longer the enclosed example.");
assert(openHall.ratings.find((item) => item.criterionId === "openness")?.value === 2, "Open Hall is no longer the open workspace example.");

const enclosedBefore = compareTile(enclosed, lab).percent ?? 0;
const openBefore = compareTile(openHall, lab).percent ?? 0;
const opened = withDesire(activities, "biological-research-lab", "openness", { value: 2 }).activities.find((item) => item.id === "biological-research-lab") as ClientActivity;
const enclosedAfter = compareTile(enclosed, opened).percent ?? 0;
const openAfter = compareTile(openHall, opened).percent ?? 0;
assert(enclosedAfter < enclosedBefore, "Raising desired Openness did not lower the enclosed tile.");
assert(openAfter > openBefore, "Raising desired Openness did not raise the open tile.");

const edited = withRating(dna, "flat-deep-plan", "openness", 2);
const editedProfile = edited.profiles.find((item) => item.archetypeId === "flat-deep-plan");
assert(editedProfile != null, "The edited tile disappeared.");
assert((compareTile(editedProfile, lab).percent ?? 0) < enclosedBefore, "Changing the tile Openness rating did not change the cultivation lab.");

const stripped = { ...enclosed, ratings: enclosed.ratings.filter((item) => item.criterionId !== "openness") };
const missing = compareTile(stripped, lab);
assert(missing.missing.includes("openness"), "A removed rating was not reported.");
assert(missing.percent !== null, "A profile with one missing rating produced no comparison.");
const asZero = compareTile({ ...stripped, ratings: [...stripped.ratings, { ...enclosed.ratings.find((item) => item.criterionId === "openness")!, value: 0 }] }, lab);
assert(missing.percent !== asZero.percent, "The missing Openness rating was treated as zero.");

assert(similarity(2, 0) === 0 && similarity(1, 1) === 1 && similarity(2, 1) === 0.5, "Similarity is not the absolute distance on a 0–2 scale.");
const lobbyTile = dna.profiles.find((item) => item.archetypeId === "continuous-hall");
assert(lobbyTile != null && lobbyTile.program === "lobby", "Continuous Hall is no longer the lobby example.");
const lobbyAgainstLab = compareTile(lobbyTile, lab);
const workspaceAgainstLobby = compareTile(enclosed, lobbyRoom);
assert(lobbyAgainstLab.applicable === false && lobbyAgainstLab.percent === null && lobbyAgainstLab.universalPercent === null && lobbyAgainstLab.matches.length === 0, "A lobby tile received a score against the cultivation lab.");
assert(workspaceAgainstLobby.applicable === false && workspaceAgainstLobby.percent === null, "A workspace tile received a score against the public lobby.");
assert(compareTile(lobbyTile, waterfront).applicable === false, "A lobby tile was ranked against Waterfront Gathering.");
const waterfrontRank = rankForActivity(results, "waterfront-gathering", dna.profiles.map((item) => item.archetypeId));
assert(waterfrontRank.length === 5 && waterfrontRank.every((id) => dna.profiles.find((item) => item.archetypeId === id)?.program === "gathering"), "Waterfront Gathering ranked a tile outside Gathering.");
assert(!waterfrontRank.includes("void-edge") && !waterfrontRank.includes("continuous-hall"), "An incompatible tile entered the Waterfront ranking.");
const lobbyCross = rankForActivity(results, "public-lobby", dna.profiles.filter((item) => item.program !== "lobby").map((item) => item.archetypeId));
assert(lobbyCross.length === 0, "Public Lobby ranked tiles outside Lobby.");
assert(results.some((result) => result.applicable && result.review.length > 0), "Review ratings no longer remain visible in a valid comparison.");

const names = new Map(SITE_ARCHETYPES.map((item) => [item.archetypeId, item.name]));
for (const activityId of ["biological-research-lab", "waterfront-gathering"] as const) {
  const ids = rankForActivity(results, activityId, dna.profiles.map((item) => item.archetypeId));
  const lines = ids.map((id, index) => {
    const score = results.find((item) => item.archetypeId === id && item.activityId === activityId);
    const program = dna.profiles.find((item) => item.archetypeId === id)?.program;
    const typology = score?.specificApplied ? `${score.specificPercent}%` : "not applicable";
    return `${index + 1}. ${names.get(id)} (${program}) universal ${score?.universalPercent}% · typology ${typology} · mesh ${score?.universalEvidence.geometry} · review ${score?.universalEvidence.review}`;
  });
  console.log(`\n${activityId}\n${lines.join("\n")}`);
}
for (const activity of activities.activities) {
  const program = activity.contexts[0];
  const ids = rankForActivity(results, activity.id, dna.profiles.filter((item) => item.program === program).map((item) => item.archetypeId));
  assert(ids.length === 5, `${activity.name} did not rank exactly its five tiles.`);
  const id = ids[0];
  const score = results.find((item) => item.archetypeId === id && item.activityId === activity.id);
  console.log(`${activity.name}: ${names.get(id)} universal ${score?.percent}% · typology ${score?.specificPercent}%`);
}

assert(CLIENT_ACTIVITY_SEED.activities.length === 12 && CLIENT_ACTIVITY_SEED.client === activities.client, "The seed no longer matches the twelve ecoLogicStudio rooms.");

const definitions = new Map(criteriaMatrix().flatMap((group) => group.criteria.map((item) => [item.id, item])));
function readingFor(archetypeId: string, activityId: string) {
  const tile = dna.profiles.find((item) => item.archetypeId === archetypeId);
  const chosen = activities.activities.find((item) => item.id === activityId);
  assert(tile != null && chosen != null, `${archetypeId} ${activityId} is missing.`);
  const score = compareTile(tile, chosen);
  const reading = readSuitability(chosen, score, definitions, new Map(tile.ratings.map((item) => [item.criterionId, item.justification])));
  return { score, reading, tile };
}
const undulatedLab = readingFor("undulated", "biological-research-lab");
const voidWater = readingFor("void-edge", "waterfront-gathering");
const edgeWater = readingFor("linear-edge-gallery", "waterfront-gathering");
assert(undulatedLab.score.applicable && undulatedLab.score.percent !== null && undulatedLab.score.specificPercent !== null, "Undulated × cultivation lab did not produce both scores.");
assert(voidWater.score.applicable === false && voidWater.score.percent === null && voidWater.reading.works.length === 0 && voidWater.reading.conflicts.length === 0 && voidWater.reading.checks.length === 0, "Void Edge still produced a Waterfront recommendation.");
assert(edgeWater.score.specificApplied && edgeWater.score.specificPercent !== null, "Linear Edge Gallery lost its gathering comparison.");
for (const sample of [undulatedLab, edgeWater]) {
  const prose = [...sample.reading.works, ...sample.reading.conflicts, ...sample.reading.checks].map((note) => note.text).join(" ");
  assert(!/bay view|view of the bay|overlooks the bay/i.test(prose), "An explanation granted a bay view.");
  for (const note of sample.reading.works) {
    if (note.criterionId === null) continue;
    const match = sample.score.matches.find((item) => item.criterionId === note.criterionId);
    assert(match?.similarity === 1, `${note.title} was listed as a match without an exact rating.`);
  }
  for (const note of sample.reading.conflicts) {
    if (note.criterionId === null) continue;
    const match = sample.score.matches.find((item) => item.criterionId === note.criterionId);
    assert(match != null && match.similarity !== 1, `${note.title} was listed as a conflict without a rating difference.`);
    assert(!/matches at|priority \d|rated \d|scores highly|good compatibility/i.test(note.text), `${note.title} restates the numerical rating.`);
    if (match.basis === "review") assert(/not verified geometry|requires review/i.test(note.text), `${note.title} presented a review rating as measured geometry.`);
  }
  for (const note of sample.reading.works) {
    if (note.criterionId === null) continue;
    assert(!/matches at|priority \d|rated \d|scores highly|good compatibility/i.test(note.text), `${note.title} restates the numerical rating.`);
  }
}
const flatLab = readingFor("flat-deep-plan", "biological-research-lab");
const undulatedProduct = readingFor("undulated", "product-design-studio");
const undulatedShop = readingFor("undulated", "prototyping-fabrication-lab");
assert(undulatedLab.reading.works.map((note) => note.text).join(" ") !== undulatedProduct.reading.works.map((note) => note.text).join(" "), "The same tile produced the same explanation for two rooms.");
assert(undulatedLab.reading.conflicts.map((note) => note.text).join(" ") !== flatLab.reading.conflicts.map((note) => note.text).join(" "), "Two tiles produced the same cultivation-lab conflict.");
assert(/cultivation|sample preparation/i.test([...undulatedLab.reading.works, ...undulatedLab.reading.conflicts, ...undulatedLab.reading.checks].map((note) => note.text).join(" ")), "Cultivation lab reasoning never names the room.");
assert(/clearance|material library/i.test(undulatedProduct.reading.checks.map((note) => note.text).join(" ")), "Product Design checks stayed generic.");
assert(/glazed wall/i.test(undulatedShop.reading.checks.map((note) => note.text).join(" ")), "Fabrication checks did not keep the glazed interface as unmeasured.");
assert(undulatedLab.reading.works.length >= 1 && undulatedLab.reading.works.length <= 3, "Why it might work should hold a few observations.");
assert(undulatedLab.reading.conflicts.length >= 1 && undulatedLab.reading.conflicts.length <= 3, "Potential conflicts should hold a few observations.");
assert(edgeWater.reading.checks.some((note) => /Biscayne Bay/i.test(note.text) && /not a measured view/i.test(note.text)), "Waterfront checking omitted the bay limit.");
assert(!/certif(y|ies) compliance|fire-safety compliance|laboratory compliance/i.test([...undulatedLab.reading.checks, ...edgeWater.reading.checks].map((note) => note.text).join(" ")), "A check claimed compliance.");
console.log("client compatibility ok");
