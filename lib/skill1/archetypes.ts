import type { ArchetypeConfig } from "./types";

/**
 * Spatial recipes for every catalog archetype.
 *
 * Scalar biological values still come from catalog ratings via translate.ts.
 * Recipes only locate WHERE those values act on the 20×20 field.
 * Do not invent descriptors here; catalog copy stays in lib/catalog.ts.
 */
export const ARCHETYPES: Record<string, ArchetypeConfig> = {
  vertical_void: {
    id: "vertical-void",
    name: "Vertical Void",
    typologyId: "lobby",
    recipe: {
      sourceCorner: "bottom-left",
      attractor: { x: 10, y: 11 },
      coreExposure: 0.9,
      enclosureCollar: 0.85,
      isolationRadius: 4.3,
      clustering: 0.16,
      approachWidth: 3.3,
    },
    topology: "around-absence",
  },
  compressed_sequential: {
    id: "compressed-sequential",
    name: "Compressed Sequential",
    typologyId: "lobby",
    recipe: {
      sourceCorner: "bottom-left",
      attractor: { x: 7, y: 6 },
      coreExposure: 0.38,
      enclosureCollar: 1.7,
      isolationRadius: 2.6,
      clustering: 0.64,
      approachWidth: 1.35,
    },
    topology: "open-network",
  },
  continuous_hall: {
    id: "continuous-hall",
    name: "Continuous Hall",
    typologyId: "lobby",
    recipe: {
      sourceCorner: "bottom-left",
      attractor: { x: 10, y: 10 },
      coreExposure: 0.8,
      enclosureCollar: 1.15,
      isolationRadius: 5.4,
      clustering: 0.26,
      approachWidth: 4.2,
    },
    topology: "open-network",
  },
  topographic_ground_field: {
    id: "topographic-ground-field",
    name: "Topographic Ground Field",
    typologyId: "lobby",
    recipe: {
      sourceCorner: "bottom-left",
      attractor: { x: 10, y: 9 },
      coreExposure: 0.92,
      enclosureCollar: 0.55,
      isolationRadius: 6.5,
      clustering: 0.08,
      approachWidth: 4.7,
    },
    topology: "open-network",
  },
  linear_gallery: {
    id: "linear-gallery",
    name: "Linear Gallery",
    typologyId: "lobby",
    recipe: {
      sourceCorner: "bottom-left",
      attractor: { x: 14, y: 10 },
      coreExposure: 0.52,
      enclosureCollar: 1.05,
      isolationRadius: 3.1,
      clustering: 0.44,
      approachWidth: 2.15,
    },
    topology: "open-network",
  },
  open_hall: {
    id: "open-hall",
    name: "Open Hall",
    typologyId: "workspace",
    recipe: {
      sourceCorner: "bottom-left",
      attractor: { x: 10, y: 10 },
      coreExposure: 0.84,
      enclosureCollar: 1.0,
      isolationRadius: 5.6,
      clustering: 0.2,
      approachWidth: 3.85,
    },
    topology: "open-network",
  },
  terraced: {
    id: "terraced",
    name: "Terraced",
    typologyId: "workspace",
    recipe: {
      sourceCorner: "bottom-left",
      attractor: { x: 10, y: 13 },
      coreExposure: 0.68,
      enclosureCollar: 1.85,
      isolationRadius: 4.35,
      clustering: 0.5,
      approachWidth: 2.95,
    },
    topology: "open-network",
  },
  flat_deep_plan: {
    id: "flat-deep-plan",
    name: "Flat Deep Plan",
    typologyId: "workspace",
    recipe: {
      sourceCorner: "bottom-right",
      attractor: { x: 10, y: 10 },
      coreExposure: 0.26,
      enclosureCollar: 3.7,
      isolationRadius: 2.35,
      clustering: 0.8,
      approachWidth: 1.35,
    },
    topology: "contained-interior",
  },
  void_edge: {
    id: "void-edge",
    name: "Void Edge",
    typologyId: "workspace",
    recipe: {
      sourceCorner: "bottom-left",
      attractor: { x: 15.6, y: 10 },
      coreExposure: 0.72,
      enclosureCollar: 1.15,
      isolationRadius: 3.7,
      clustering: 0.2,
      approachWidth: 2.75,
    },
    topology: "around-absence",
  },
  undulated: {
    id: "undulated",
    name: "Undulated",
    typologyId: "workspace",
    recipe: {
      sourceCorner: "bottom-left",
      attractor: { x: 10, y: 10 },
      coreExposure: 0.76,
      enclosureCollar: 1.45,
      isolationRadius: 4.7,
      clustering: 0.34,
      approachWidth: 3.25,
    },
    topology: "open-network",
  },
  stepped_amphitheater: {
    id: "stepped-amphitheater",
    name: "Stepped Amphitheater",
    typologyId: "gathering",
    recipe: {
      sourceCorner: "bottom-right",
      attractor: { x: 10, y: 9 },
      coreExposure: 0.24,
      enclosureCollar: 3.55,
      isolationRadius: 2.55,
      clustering: 0.82,
      approachWidth: 1.65,
    },
    topology: "contained-interior",
  },
  void_field: {
    id: "void-field",
    name: "Void Field",
    typologyId: "gathering",
    recipe: {
      sourceCorner: "bottom-left",
      attractor: { x: 10, y: 11 },
      coreExposure: 0.92,
      enclosureCollar: 0.8,
      isolationRadius: 4.6,
      clustering: 0.12,
      approachWidth: 3.4,
    },
    topology: "around-absence",
  },
  inserted_horizontal_plate: {
    id: "inserted-horizontal-plate",
    name: "Inserted Horizontal Plate",
    typologyId: "gathering",
    recipe: {
      sourceCorner: "bottom-left",
      attractor: { x: 10, y: 10 },
      coreExposure: 0.86,
      enclosureCollar: 0.7,
      isolationRadius: 5.9,
      clustering: 0.14,
      approachWidth: 3.7,
    },
    topology: "open-network",
  },
  contained_room_within_volume: {
    id: "contained-room-within-volume",
    name: "Contained Room Within Volume",
    typologyId: "gathering",
    recipe: {
      sourceCorner: "bottom-right",
      attractor: { x: 10, y: 10 },
      coreExposure: 0.34,
      enclosureCollar: 3.4,
      isolationRadius: 2.1,
      clustering: 0.86,
      approachWidth: 1.55,
    },
    topology: "contained-interior",
  },
  linear_edge_gallery: {
    id: "linear-edge-gallery",
    name: "Linear Edge Gallery",
    typologyId: "gathering",
    recipe: {
      sourceCorner: "bottom-left",
      attractor: { x: 16, y: 10 },
      coreExposure: 0.48,
      enclosureCollar: 1.35,
      isolationRadius: 2.75,
      clustering: 0.56,
      approachWidth: 1.8,
    },
    topology: "open-network",
  },
};

export const PROTOTYPE_ARCHETYPE_IDS = [
  "void-field",
  "contained-room-within-volume",
] as const;

export function configForArchetype(archetypeId: string): ArchetypeConfig {
  const found = Object.values(ARCHETYPES).find((item) => item.id === archetypeId);
  if (!found) {
    throw new Error(`Unknown archetype: ${archetypeId}`);
  }
  return found;
}

export function hasPrototypeConfig(archetypeId: string) {
  return Object.values(ARCHETYPES).some((item) => item.id === archetypeId);
}
