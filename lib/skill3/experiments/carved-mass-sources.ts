export type CarvedMassCategory = "lobby" | "workspace" | "gathering";

export type CarvedMassSource = {
  category: CarvedMassCategory;
  categoryLabel: "Lobby" | "Workspace" | "Gathering";
  archetypeId: string;
  archetypeName: string;
  candidateId: number;
};

/** The 15 verified Skill 2 states. Order is the catalogue order. */
export const CARVED_MASS_SOURCES: readonly CarvedMassSource[] = [
  { category: "lobby", categoryLabel: "Lobby", archetypeId: "vertical-void", archetypeName: "Vertical Void", candidateId: 351 },
  { category: "lobby", categoryLabel: "Lobby", archetypeId: "compressed-sequential", archetypeName: "Compressed Sequential", candidateId: 205 },
  { category: "lobby", categoryLabel: "Lobby", archetypeId: "continuous-hall", archetypeName: "Continuous Hall", candidateId: 237 },
  { category: "lobby", categoryLabel: "Lobby", archetypeId: "topographic-ground-field", archetypeName: "Topographic Ground Field", candidateId: 49 },
  { category: "lobby", categoryLabel: "Lobby", archetypeId: "linear-gallery", archetypeName: "Linear Gallery", candidateId: 263 },
  { category: "workspace", categoryLabel: "Workspace", archetypeId: "open-hall", archetypeName: "Open Hall", candidateId: 333 },
  { category: "workspace", categoryLabel: "Workspace", archetypeId: "terraced", archetypeName: "Terraced", candidateId: 46 },
  { category: "workspace", categoryLabel: "Workspace", archetypeId: "flat-deep-plan", archetypeName: "Flat Deep Plan", candidateId: 83 },
  { category: "workspace", categoryLabel: "Workspace", archetypeId: "void-edge", archetypeName: "Void Edge", candidateId: 86 },
  { category: "workspace", categoryLabel: "Workspace", archetypeId: "undulated", archetypeName: "Undulated", candidateId: 71 },
  { category: "gathering", categoryLabel: "Gathering", archetypeId: "stepped-amphitheater", archetypeName: "Stepped Amphitheater", candidateId: 374 },
  { category: "gathering", categoryLabel: "Gathering", archetypeId: "void-field", archetypeName: "Void Field", candidateId: 270 },
  { category: "gathering", categoryLabel: "Gathering", archetypeId: "inserted-horizontal-plate", archetypeName: "Inserted Horizontal Plate", candidateId: 265 },
  { category: "gathering", categoryLabel: "Gathering", archetypeId: "contained-room-within-volume", archetypeName: "Contained Room Within Volume", candidateId: 42 },
  { category: "gathering", categoryLabel: "Gathering", archetypeId: "linear-edge-gallery", archetypeName: "Linear Edge Gallery", candidateId: 121 },
];

export function carvedMassSource(archetypeId: string, candidateId: number) {
  const source = CARVED_MASS_SOURCES.find((item) => item.archetypeId === archetypeId && item.candidateId === candidateId);
  if (!source) throw new Error(`no carved-mass source for ${archetypeId} ${candidateId}`);
  return source;
}
