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
      attractors: [
        { kind: "ring", x: 10, y: 11, radius: 4.4, strength: 1.1, hole: true },
        { kind: "line", x: 2.2, y: 2.4, x2: 7.2, y2: 8.2, radius: 1.3, strength: 0.4 },
      ],
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
      attractor: { x: 10, y: 10 },
      attractors: [
        { kind: "point", x: 2.2, y: 4, radius: 2.4, strength: 0.85 },
        { kind: "point", x: 2.2, y: 10, radius: 2.2, strength: 0.7 },
        { kind: "point", x: 2.2, y: 16, radius: 2.4, strength: 0.85 },
        { kind: "ring", x: 6.2, y: 10, radius: 1.35, strength: 1.15, hole: true },
        { kind: "ring", x: 9.2, y: 10, radius: 0.78, strength: 1.2, hole: true },
        { kind: "ring", x: 12, y: 10, radius: 0.78, strength: 1.2, hole: true },
        { kind: "ring", x: 14.6, y: 10, radius: 1.35, strength: 1.15, hole: true },
        { kind: "point", x: 17.8, y: 4, radius: 2.4, strength: 0.85 },
        { kind: "point", x: 17.8, y: 10, radius: 2.2, strength: 0.7 },
        { kind: "point", x: 17.8, y: 16, radius: 2.4, strength: 0.85 },
      ],
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
      attractors: [
        { kind: "line", x: 2.5, y: 10, x2: 17.5, y2: 10, radius: 1.8, strength: 1 },
        { kind: "point", x: 5, y: 10, radius: 2.2, strength: 0.45 },
        { kind: "point", x: 15, y: 10, radius: 2.2, strength: 0.45 },
      ],
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
      attractors: [
        { kind: "point", x: 5, y: 6, radius: 3.4, strength: 0.4 },
        { kind: "point", x: 12, y: 8, radius: 3.6, strength: 0.45 },
        { kind: "point", x: 8, y: 14, radius: 3.2, strength: 0.35 },
        { kind: "point", x: 15, y: 13, radius: 2.8, strength: 0.35 },
      ],
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
      attractors: [
        { kind: "line", x: 3, y: 10, x2: 17, y2: 10, radius: 1.15, strength: 1 },
        { kind: "point", x: 6, y: 10, radius: 1.3, strength: 0.7 },
        { kind: "point", x: 11, y: 10, radius: 1.3, strength: 0.7 },
        { kind: "point", x: 15.5, y: 10, radius: 1.4, strength: 0.8 },
      ],
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
      attractors: [
        { kind: "point", x: 10, y: 10, radius: 5.5, strength: 0.45 },
        { kind: "point", x: 10, y: 10, radius: 2, strength: 0.85 },
        { kind: "ring", x: 10, y: 10, radius: 6.2, strength: 0.25 },
      ],
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
      attractors: [
        { kind: "line", x: 3, y: 6, x2: 17, y2: 6, radius: 1.1, strength: 0.7 },
        { kind: "line", x: 4, y: 10, x2: 16, y2: 10, radius: 1.15, strength: 0.9 },
        { kind: "line", x: 5, y: 14, x2: 15, y2: 14, radius: 1.2, strength: 1 },
        { kind: "point", x: 10, y: 14, radius: 1.6, strength: 0.5 },
      ],
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
      attractors: [
        { kind: "point", x: 9, y: 9, radius: 1.5, strength: 1 },
        { kind: "point", x: 11.5, y: 10.5, radius: 1.4, strength: 0.9 },
        { kind: "point", x: 10, y: 12, radius: 1.3, strength: 0.75 },
        { kind: "ring", x: 10, y: 10, radius: 3.4, strength: 0.35 },
      ],
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
      attractors: [
        { kind: "ring", x: 15.6, y: 10, radius: 3.6, strength: 1 },
        { kind: "line", x: 16.5, y: 3, x2: 16.5, y2: 17, radius: 1.2, strength: 0.55 },
        { kind: "point", x: 8, y: 10, radius: 2, strength: 0.4 },
      ],
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
      attractors: [
        { kind: "point", x: 4, y: 7, radius: 1.8, strength: 0.7 },
        { kind: "point", x: 8, y: 12, radius: 1.8, strength: 0.8 },
        { kind: "point", x: 12, y: 7.5, radius: 1.8, strength: 0.8 },
        { kind: "point", x: 16, y: 12.5, radius: 1.8, strength: 0.7 },
        { kind: "line", x: 3, y: 8, x2: 17, y2: 11, radius: 1.4, strength: 0.35 },
      ],
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
      sourceCorner: "bottom-left",
      attractor: { x: 10, y: 10.4 },
      attractorsOnly: true,
      attractors: [
        { kind: "ring", x: 10, y: 10.4, radius: 1.6, strength: 0.85, hole: true },
        { kind: "curve", x: 6.6, y: 10.4, x2: 13.4, y2: 10.4, cx: 10, cy: 6.9, radius: 0.55, strength: 1.22 },
        { kind: "curve", x: 6.6, y: 10.4, x2: 13.4, y2: 10.4, cx: 10, cy: 13.9, radius: 0.55, strength: 1.22 },
        { kind: "curve", x: 5.0, y: 10.4, x2: 15.0, y2: 10.4, cx: 10, cy: 5.4, radius: 0.6, strength: 1.12 },
        { kind: "curve", x: 5.0, y: 10.4, x2: 15.0, y2: 10.4, cx: 10, cy: 15.4, radius: 0.6, strength: 1.12 },
        { kind: "curve", x: 3.4, y: 10.4, x2: 16.6, y2: 10.4, cx: 10, cy: 3.8, radius: 0.65, strength: 1.02 },
        { kind: "curve", x: 3.4, y: 10.4, x2: 16.6, y2: 10.4, cx: 10, cy: 17.0, radius: 0.65, strength: 1.02 },
        { kind: "point", x: 6.2, y: 4.2, radius: 0.9, strength: 0.32 },
        { kind: "point", x: 13.8, y: 4.2, radius: 0.9, strength: 0.32 },
      ],
      coreExposure: 0.24,
      enclosureCollar: 3.55,
      isolationRadius: 2.55,
      clustering: 0.82,
      approachWidth: 1.65,
    },
    topology: "around-absence",
  },
  void_field: {
    id: "void-field",
    name: "Void Field",
    typologyId: "gathering",
    recipe: {
      sourceCorner: "bottom-left",
      attractor: { x: 10, y: 11 },
      attractors: [
        { kind: "ring", x: 10, y: 11, radius: 4.8, strength: 1 },
        { kind: "point", x: 4, y: 5, radius: 2.4, strength: 0.35 },
        { kind: "point", x: 16, y: 6, radius: 2.4, strength: 0.35 },
        { kind: "point", x: 10, y: 17, radius: 2.2, strength: 0.3 },
      ],
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
      attractors: [
        { kind: "line", x: 2, y: 10, x2: 18, y2: 10, radius: 1.35, strength: 1.15 },
        { kind: "point", x: 10, y: 10, radius: 2.4, strength: 0.4 },
        { kind: "point", x: 10, y: 4.5, radius: 2.6, strength: 0.25 },
        { kind: "point", x: 10, y: 15.5, radius: 2.6, strength: 0.25 },
      ],
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
      attractors: [
        { kind: "point", x: 9.2, y: 9.4, radius: 1.3, strength: 1 },
        { kind: "point", x: 11.2, y: 10.6, radius: 1.25, strength: 0.9 },
        { kind: "ring", x: 10, y: 10, radius: 3.1, strength: 0.55 },
      ],
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
      attractors: [
        { kind: "line", x: 16.2, y: 3, x2: 16.2, y2: 17, radius: 1.15, strength: 1 },
        { kind: "point", x: 16.2, y: 6, radius: 1.3, strength: 0.7 },
        { kind: "point", x: 16.2, y: 11, radius: 1.3, strength: 0.75 },
        { kind: "point", x: 16.2, y: 15, radius: 1.3, strength: 0.7 },
      ],
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
  return (PROTOTYPE_ARCHETYPE_IDS as readonly string[]).includes(archetypeId);
}