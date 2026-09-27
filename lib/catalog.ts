import type {
  ArchetypeRecord,
  BranchSchema,
  CriterionDefinition,
  CriterionGroup,
  CriterionInstance,
  GroupId,
  Rating,
  RatingsMap,
  TypologyId,
  TypologyRecord,
} from "./types";

const LOW = 0 as const;
const MEDIUM = 1 as const;
const HIGH = 2 as const;

const levels = (
  low: string,
  medium: string,
  high: string,
): CriterionDefinition["levels"] => [
  { value: LOW, label: "Low", description: low },
  { value: MEDIUM, label: "Medium", description: medium },
  { value: HIGH, label: "High", description: high },
];

const criterion = (
  id: string,
  label: string,
  shared: boolean,
  low: string,
  medium: string,
  high: string,
): CriterionDefinition => ({
  id,
  label,
  shared,
  levels: levels(low, medium, high),
});

export const CRITERION_LEVELS = [
  { value: LOW, label: "Low" as const },
  { value: MEDIUM, label: "Medium" as const },
  { value: HIGH, label: "High" as const },
];

const COMPLEXITY = criterion(
  "complexity",
  "Complexity",
  true,
  "A simple formal organization with few geometric elements, limited variation, and a clear overall configuration.",
  "A moderately varied formal organization with multiple geometric elements or relationships, while maintaining a recognizable overall configuration.",
  "A highly varied formal organization with numerous geometric elements, transformations, intersections, or layered relationships that produce a complex configuration.",
);

const PROPORTIONALITY = criterion(
  "proportionality",
  "Proportionality",
  true,
  "Spaces and elements have relatively uniform dimensions and proportions, with limited variation between their size relationships.",
  "Spaces and elements have noticeable variations in dimension and proportion, creating multiple but relatively balanced relationships.",
  "Spaces and elements have strongly differentiated dimensions and proportions, creating deliberate relationships between contrasting scales and spatial dimensions.",
);

const OPENNESS = criterion(
  "openness",
  "Openness",
  true,
  "The space is predominantly enclosed, with limited openings and restricted visual or physical access to adjacent spaces.",
  "The space combines enclosed and open conditions, providing moderate visual and physical access to adjacent spaces.",
  "The space is predominantly open, with extensive visual and physical access to surrounding spaces and limited enclosure.",
);

const CONNECTIVITY = criterion(
  "connectivity",
  "Connectivity",
  true,
  "The space has few direct relationships with adjacent spaces, with limited movement, visibility, or interaction between them.",
  "The space has multiple relationships with adjacent spaces, providing moderate opportunities for movement, visibility, or interaction.",
  "The space is highly interconnected, with numerous direct relationships to surrounding spaces through movement, visibility, and spatial overlap.",
);

const IMMERSIVE = criterion(
  "immersive",
  "Immersive",
  true,
  "The atmosphere is minimally immersive. Sensory conditions remain neutral, predictable, and visually or spatially detached, allowing the user to remain primarily aware of the surrounding environment rather than the atmospheric experience.",
  "The atmosphere is moderately immersive. Sensory qualities such as light, material, sound, scale, and enclosure begin to shape the user’s perception and encourage a stronger awareness of the space.",
  "The atmosphere is deeply immersive. Multiple sensory and spatial qualities are deliberately integrated to envelop the user, intensify perception, and create a strong sense of being absorbed within the environment.",
);

const VISIBILITY = criterion(
  "visibility",
  "Visibility",
  true,
  "Visual access is limited, with frequent interruptions to sightlines between spaces or areas.",
  "Visual access is moderate, combining open sightlines with areas of visual obstruction or interruption.",
  "Visual access is extensive, with long sightlines and minimal obstruction between spaces or areas.",
);

const CENTRALITY = criterion(
  "centrality",
  "Centrality",
  false,
  "The lobby occupies a peripheral or secondary position and has limited influence on access to surrounding spaces.",
  "The lobby occupies a partially central position and provides access to or organizes several surrounding spaces.",
  "The lobby occupies a central position and functions as a primary spatial node from which multiple surrounding spaces are accessed or organized.",
);

const PLATE_ARTICULATION = criterion(
  "plate-articulation",
  "Plate Articulation",
  false,
  "The workspace plate is predominantly continuous and uniform, with minimal changes in its geometric configuration.",
  "The workspace plate contains noticeable shifts, divisions, offsets, or variations that create distinct spatial zones.",
  "The workspace plate is strongly articulated through significant shifts, projections, recesses, rotations, or subdivisions that actively define the spatial organization.",
);

const CIRCULATION_INTEGRATION = criterion(
  "circulation-integration",
  "Circulation Integration",
  false,
  "Circulation is primarily separated from the gathering area, occurring around or outside the space.",
  "Circulation partially overlaps or passes through the gathering area, creating some interaction between movement and occupation.",
  "Circulation is embedded within the gathering area, with movement paths actively shaping, connecting, or activating gathering zones.",
);

const DIRECTIONALITY = criterion(
  "directionality",
  "Directionality",
  false,
  "No dominant directional axis is established. Movement and visual orientation are distributed across multiple directions.",
  "A discernible primary direction organizes movement or visual orientation, while secondary directions remain present.",
  "A strong directional axis clearly organizes movement, orientation, and visual focus through the lobby.",
);

const MODULARITY = criterion(
  "modularity",
  "Modularity",
  false,
  "The workspace is primarily continuous or fixed, with limited repetition, subdivision, or ability to reorganize spatial units.",
  "The workspace is organized through identifiable repeated or divisible units, allowing some degree of spatial flexibility.",
  "The workspace is strongly organized through repeated, interchangeable, or reconfigurable units that allow multiple spatial configurations.",
);

const SPATIAL_PERMANENCE = criterion(
  "spatial-permanence",
  "Spatial Permanence",
  false,
  "Gathering is isolated from the circulation paths. It exists wholly on its own.",
  "Gathering and circulation are parallel to each other but do not co-exist.",
  "Circulation is within the gathering space. Gathering happens because of circulation.",
);

const RECEPTIVITY = criterion(
  "receptivity",
  "Receptivity",
  false,
  "The lobby conveys a limited sense of invitation. The space feels formal, guarded, or psychologically distant, discouraging entry or prolonged occupation.",
  "The lobby conveys a moderate sense of invitation. The space feels accessible and comfortable, while maintaining a degree of formality or control.",
  "The lobby conveys a strong sense of invitation. The space feels welcoming, comfortable, and accessible, encouraging entry, interaction, and occupation.",
);

const COLLABORATION = criterion(
  "collaboration",
  "Collaboration",
  false,
  "The workspace is primarily configured for individual occupation, with limited spatial proximity or opportunities for interaction.",
  "The workspace combines individual and shared areas, providing moderate opportunities for interaction and collaborative activity.",
  "The workspace is strongly configured around shared areas, proximity, visual interaction, and spatial conditions that support collaborative activity.",
);

const SOCIAL_PROXIMITY = criterion(
  "social-proximity",
  "Social Proximity",
  false,
  "Gathering space offers multiple paths or big spaces with things like foliage or tables to separate the experience between people, which makes this a very low stimulating experience and more private.",
  "Gathering space offers some private/open spaces to relax in but is part of a series of identical spaces that are close together.",
  "The gathering space offers very compressed paths or open spaces. Therefore, if a high amount of people circulate the space, it would be a highly overstimulating experience.",
);

export const BRANCHES: BranchSchema[] = [
  {
    id: "formal",
    title: "Formal",
    subtitle: "Geometry / Massing / Organization",
    shared: [COMPLEXITY, PROPORTIONALITY],
    specific: {
      lobby: CENTRALITY,
      workspace: PLATE_ARTICULATION,
      gathering: CIRCULATION_INTEGRATION,
    },
  },
  {
    id: "spatial",
    title: "Spatial",
    subtitle: "Space / Connections / Experience",
    shared: [OPENNESS, CONNECTIVITY],
    specific: {
      lobby: DIRECTIONALITY,
      workspace: MODULARITY,
      gathering: SPATIAL_PERMANENCE,
    },
  },
  {
    id: "atmospheric",
    title: "Atmospheric",
    subtitle: "Light / Sensory / Environment",
    shared: [IMMERSIVE, VISIBILITY],
    specific: {
      lobby: RECEPTIVITY,
      workspace: COLLABORATION,
      gathering: SOCIAL_PROXIMITY,
    },
  },
];

const archetype = (
  id: string,
  name: string,
  ratings: Record<string, Rating>,
  descriptors: Record<GroupId, string>,
): ArchetypeRecord => ({ id, name, ratings, descriptors });

export const TYPOLOGIES: TypologyRecord[] = [
  {
    id: "lobby",
    label: "Lobby",
    definition:
      "A threshold between exterior and interior. A public arrival and transition space that receives people, orients, and distributes movement towards the rest of the building.",
    archetypes: [
      archetype(
        "vertical-void",
        "Vertical Void",
        {
          complexity: HIGH,
          proportionality: MEDIUM,
          centrality: HIGH,
          openness: HIGH,
          connectivity: MEDIUM,
          directionality: MEDIUM,
          immersive: HIGH,
          visibility: HIGH,
          receptivity: MEDIUM,
        },
        {
          formal: "Dynamic Core",
          spatial: "Open Threshold",
          atmospheric: "Visual Immersion",
        },
      ),
      archetype(
        "compressed-sequential",
        "Compressed Sequential",
        {
          complexity: HIGH,
          proportionality: MEDIUM,
          centrality: LOW,
          openness: LOW,
          connectivity: MEDIUM,
          directionality: MEDIUM,
          immersive: HIGH,
          visibility: HIGH,
          receptivity: MEDIUM,
        },
        {
          formal: "Geometry Compression",
          spatial: "Sequential Release",
          atmospheric: "Immersive Transition",
        },
      ),
      archetype(
        "continuous-hall",
        "Continuous Hall",
        {
          complexity: HIGH,
          proportionality: LOW,
          centrality: HIGH,
          openness: HIGH,
          connectivity: HIGH,
          directionality: HIGH,
          immersive: HIGH,
          visibility: MEDIUM,
          receptivity: HIGH,
        },
        {
          formal: "Radial Convergence",
          spatial: "Integrated Form",
          atmospheric: "Dynamic Engagement",
        },
      ),
      archetype(
        "topographic-ground-field",
        "Topographic Ground Field",
        {
          complexity: HIGH,
          proportionality: HIGH,
          centrality: LOW,
          openness: HIGH,
          connectivity: HIGH,
          directionality: MEDIUM,
          immersive: HIGH,
          visibility: HIGH,
          receptivity: HIGH,
        },
        {
          formal: "Sculpted Ground",
          spatial: "Distributed Flow",
          atmospheric: "Shared Engagement",
        },
      ),
      archetype(
        "linear-gallery",
        "Linear Gallery",
        {
          complexity: HIGH,
          proportionality: MEDIUM,
          centrality: HIGH,
          openness: MEDIUM,
          connectivity: HIGH,
          directionality: HIGH,
          immersive: MEDIUM,
          visibility: MEDIUM,
          receptivity: MEDIUM,
        },
        {
          formal: "Linear Fragmentation",
          spatial: "Connected Progression",
          atmospheric: "Intuitive Guidance",
        },
      ),
    ],
  },
  {
    id: "workspace",
    label: "Workspace",
    definition:
      "A workspace is a space designed to support work and productivity, accommodating different ways of working, from individual to shared activities.",
    archetypes: [
      archetype(
        "open-hall",
        "Open Hall",
        {
          complexity: MEDIUM,
          proportionality: MEDIUM,
          "plate-articulation": LOW,
          openness: HIGH,
          connectivity: MEDIUM,
          modularity: HIGH,
          immersive: MEDIUM,
          visibility: HIGH,
          collaboration: MEDIUM,
        },
        {
          formal: "Orthogonal Balance",
          spatial: "Adaptive Module",
          atmospheric: "Engaging",
        },
      ),
      archetype(
        "terraced",
        "Terraced",
        {
          complexity: MEDIUM,
          proportionality: MEDIUM,
          "plate-articulation": HIGH,
          openness: HIGH,
          connectivity: HIGH,
          modularity: MEDIUM,
          immersive: HIGH,
          visibility: HIGH,
          collaboration: MEDIUM,
        },
        {
          formal: "Articulated",
          spatial: "Connected Module",
          atmospheric: "Immersive",
        },
      ),
      archetype(
        "flat-deep-plan",
        "Flat Deep Plan",
        {
          complexity: LOW,
          proportionality: LOW,
          "plate-articulation": LOW,
          openness: MEDIUM,
          connectivity: LOW,
          modularity: HIGH,
          immersive: HIGH,
          visibility: LOW,
          collaboration: LOW,
        },
        {
          formal: "Restrained",
          spatial: "Rigid Module",
          atmospheric: "Introspective",
        },
      ),
      archetype(
        "void-edge",
        "Void Edge",
        {
          complexity: MEDIUM,
          proportionality: MEDIUM,
          "plate-articulation": LOW,
          openness: MEDIUM,
          connectivity: MEDIUM,
          modularity: MEDIUM,
          immersive: HIGH,
          visibility: HIGH,
          collaboration: MEDIUM,
        },
        {
          formal: "Radial Balance",
          spatial: "Integrated Module",
          atmospheric: "Partially Engaging",
        },
      ),
      archetype(
        "undulated",
        "Undulated",
        {
          complexity: HIGH,
          proportionality: MEDIUM,
          "plate-articulation": HIGH,
          openness: HIGH,
          connectivity: HIGH,
          modularity: LOW,
          immersive: HIGH,
          visibility: HIGH,
          collaboration: MEDIUM,
        },
        {
          formal: "Dynamic",
          spatial: "Collective Modules",
          atmospheric: "Interactive",
        },
      ),
    ],
  },
  {
    id: "gathering",
    label: "Gathering",
    definition:
      "A designed common space for employees to socialize, collaborate, and hold large events outside their individual desks.",
    archetypes: [
      archetype(
        "stepped-amphitheater",
        "Stepped Amphitheater",
        {
          complexity: LOW,
          proportionality: MEDIUM,
          "circulation-integration": HIGH,
          openness: LOW,
          connectivity: LOW,
          "spatial-permanence": HIGH,
          immersive: LOW,
          visibility: LOW,
          "social-proximity": MEDIUM,
        },
        {
          formal: "Enclosed Threshold",
          spatial: "Incidental Threshold",
          atmospheric: "Contained Commons",
        },
      ),
      archetype(
        "void-field",
        "Void Field",
        {
          complexity: LOW,
          proportionality: LOW,
          "circulation-integration": MEDIUM,
          openness: HIGH,
          connectivity: LOW,
          "spatial-permanence": LOW,
          immersive: HIGH,
          visibility: HIGH,
          "social-proximity": LOW,
        },
        {
          formal: "Visually Exposed Core",
          spatial: "Isolated Anchor",
          atmospheric: "Expansive Commons",
        },
      ),
      archetype(
        "inserted-horizontal-plate",
        "Inserted Horizontal Plate",
        {
          complexity: LOW,
          proportionality: LOW,
          "circulation-integration": HIGH,
          openness: HIGH,
          connectivity: HIGH,
          "spatial-permanence": HIGH,
          immersive: MEDIUM,
          visibility: HIGH,
          "social-proximity": LOW,
        },
        {
          formal: "Modular Nodes",
          spatial: "Visually Disturbed Nodes",
          atmospheric: "Distributed Retreat",
        },
      ),
      archetype(
        "contained-room-within-volume",
        "Contained Room Within Volume",
        {
          complexity: HIGH,
          proportionality: HIGH,
          "circulation-integration": HIGH,
          openness: HIGH,
          connectivity: LOW,
          "spatial-permanence": HIGH,
          immersive: HIGH,
          visibility: HIGH,
          "social-proximity": HIGH,
        },
        {
          formal: "Magnetic Enclosed Core",
          spatial: "Isolated Attractor",
          atmospheric: "Immersive Core",
        },
      ),
      archetype(
        "linear-edge-gallery",
        "Linear Edge Gallery",
        {
          complexity: LOW,
          proportionality: MEDIUM,
          "circulation-integration": MEDIUM,
          openness: MEDIUM,
          connectivity: LOW,
          "spatial-permanence": HIGH,
          immersive: MEDIUM,
          visibility: HIGH,
          "social-proximity": HIGH,
        },
        {
          formal: "Porous Spine",
          spatial: "Integrated Nodes",
          atmospheric: "Social Commons",
        },
      ),
    ],
  },
];

export const WORKFLOW_STEPS = [
  "Typology",
  "Archetype",
  "Criteria",
  "Descriptors",
  "Physarum",
  "2D Section",
  "3D Model",
  "Evaluation",
  "Iteration",
] as const;

export const PHYSARUM_STEPS = [
  { n: 1, title: "Analysis", caption: "Criteria Input" },
  { n: 2, title: "Descriptor", caption: "Spatial Intent" },
  { n: 3, title: "Physarum", caption: "Emergent System" },
  { n: 4, title: "Generation", caption: "Spatial Translation" },
  { n: 5, title: "Output", caption: "Architectural Form" },
] as const;

export function findTypology(id: TypologyId): TypologyRecord {
  const found = TYPOLOGIES.find((item) => item.id === id);
  if (!found) throw new Error(`Unknown typology: ${id}`);
  return found;
}

export function findArchetype(
  typology: TypologyRecord,
  archetypeId: string,
): ArchetypeRecord {
  return (
    typology.archetypes.find((item) => item.id === archetypeId) ??
    typology.archetypes[0]
  );
}

export function criteriaForTypology(typologyId: TypologyId): CriterionDefinition[] {
  return BRANCHES.flatMap((branch) => [
    ...branch.shared,
    branch.specific[typologyId],
  ]);
}

export function criteriaIdsForBranch(
  typologyId: TypologyId,
  branchId: GroupId,
): string[] {
  const branch = BRANCHES.find((item) => item.id === branchId);
  if (!branch) return [];
  return [...branch.shared.map((item) => item.id), branch.specific[typologyId].id];
}

export function defaultRatings(archetype: ArchetypeRecord): RatingsMap {
  return { ...archetype.ratings };
}

export function groupsForArchetype(
  typologyId: TypologyId,
  archetype: ArchetypeRecord,
  ratings: RatingsMap,
): CriterionGroup[] {
  return BRANCHES.map((branch) => {
    const definitions = [...branch.shared, branch.specific[typologyId]];
    const criteria: CriterionInstance[] = definitions.map((definition) => ({
      id: definition.id,
      label: definition.label,
      rating: ratings[definition.id] ?? archetype.ratings[definition.id] ?? 1,
      definition,
    }));
    return {
      id: branch.id,
      title: branch.title,
      subtitle: branch.subtitle,
      criteria,
      descriptor: archetype.descriptors[branch.id],
    };
  });
}

export function ratingDescription(
  definition: CriterionDefinition,
  value: Rating,
): string {
  return definition.levels[value].description;
}
