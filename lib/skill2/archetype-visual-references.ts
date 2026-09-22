import type { TypologyId } from "../types";

/**
 * Visual morphology references only.
 * Ratings and descriptors stay in lib/catalog.ts.
 * Not imported by generation, measurement, or evaluation.
 */
export type ArchetypeVisualReference = {
  sequence: number;
  archetypeId: string;
  name: string;
  typologyId: TypologyId;
  /** Public URL path. File lives under public/references/archetypes/. */
  imagePath: string;
};

export const ARCHETYPE_VISUAL_REFERENCE_DIR = "/references/archetypes" as const;

export const ARCHETYPE_VISUAL_REFERENCES: readonly ArchetypeVisualReference[] = [
  { sequence: 1, archetypeId: "vertical-void", name: "Vertical Void", typologyId: "lobby", imagePath: `${ARCHETYPE_VISUAL_REFERENCE_DIR}/01-vertical-void-reference.png` },
  { sequence: 2, archetypeId: "compressed-sequential", name: "Compressed Sequential", typologyId: "lobby", imagePath: `${ARCHETYPE_VISUAL_REFERENCE_DIR}/02-compressed-sequential-reference.png` },
  { sequence: 3, archetypeId: "continuous-hall", name: "Continuous Hall", typologyId: "lobby", imagePath: `${ARCHETYPE_VISUAL_REFERENCE_DIR}/03-continuous-hall-reference.png` },
  { sequence: 4, archetypeId: "topographic-ground-field", name: "Topographic Ground Field", typologyId: "lobby", imagePath: `${ARCHETYPE_VISUAL_REFERENCE_DIR}/04-topographic-ground-field-reference.png` },
  { sequence: 5, archetypeId: "linear-gallery", name: "Linear Gallery", typologyId: "lobby", imagePath: `${ARCHETYPE_VISUAL_REFERENCE_DIR}/05-linear-gallery-reference.png` },
  { sequence: 6, archetypeId: "open-hall", name: "Open Hall", typologyId: "workspace", imagePath: `${ARCHETYPE_VISUAL_REFERENCE_DIR}/06-open-hall-reference.png` },
  { sequence: 7, archetypeId: "terraced", name: "Terraced", typologyId: "workspace", imagePath: `${ARCHETYPE_VISUAL_REFERENCE_DIR}/07-terraced-reference.png` },
  { sequence: 8, archetypeId: "flat-deep-plan", name: "Flat Deep Plan", typologyId: "workspace", imagePath: `${ARCHETYPE_VISUAL_REFERENCE_DIR}/08-flat-deep-plan-reference.png` },
  { sequence: 9, archetypeId: "void-edge", name: "Void Edge", typologyId: "workspace", imagePath: `${ARCHETYPE_VISUAL_REFERENCE_DIR}/09-void-edge-reference.png` },
  { sequence: 10, archetypeId: "undulated", name: "Undulated", typologyId: "workspace", imagePath: `${ARCHETYPE_VISUAL_REFERENCE_DIR}/10-undulated-reference.png` },
  { sequence: 11, archetypeId: "stepped-amphitheater", name: "Stepped Amphitheater", typologyId: "gathering", imagePath: `${ARCHETYPE_VISUAL_REFERENCE_DIR}/11-stepped-amphitheater-reference.png` },
  { sequence: 12, archetypeId: "void-field", name: "Void Field", typologyId: "gathering", imagePath: `${ARCHETYPE_VISUAL_REFERENCE_DIR}/12-void-field-reference.png` },
  { sequence: 13, archetypeId: "inserted-horizontal-plate", name: "Inserted Horizontal Plate", typologyId: "gathering", imagePath: `${ARCHETYPE_VISUAL_REFERENCE_DIR}/13-inserted-horizontal-plate-reference.png` },
  { sequence: 14, archetypeId: "contained-room-within-volume", name: "Contained Room Within Volume", typologyId: "gathering", imagePath: `${ARCHETYPE_VISUAL_REFERENCE_DIR}/14-contained-room-within-volume-reference.png` },
  { sequence: 15, archetypeId: "linear-edge-gallery", name: "Linear Edge Gallery", typologyId: "gathering", imagePath: `${ARCHETYPE_VISUAL_REFERENCE_DIR}/15-linear-edge-gallery-reference.png` },
] as const;
