import type {
  Archetype,
  CriterionGroup,
  Rating,
  Typology,
  TypologyId,
} from "./types";

const FORMAL = (
  complexity: Rating,
  proportionality: Rating,
  directionality: Rating,
  descriptor: string,
): CriterionGroup => ({
  id: "formal",
  title: "Formal",
  subtitle: "Geometry / Massing / Organization",
  criteria: [
    { id: "complexity", label: "Complexity", rating: complexity },
    { id: "proportionality", label: "Proportionality", rating: proportionality },
    { id: "directionality", label: "Directionality", rating: directionality },
  ],
  descriptor,
});

const SPATIAL = (
  openness: Rating,
  connectivity: Rating,
  centrality: Rating,
  descriptor: string,
): CriterionGroup => ({
  id: "spatial",
  title: "Spatial",
  subtitle: "Space / Connections / Experience",
  criteria: [
    { id: "openness", label: "Openness", rating: openness },
    { id: "connectivity", label: "Connectivity", rating: connectivity },
    { id: "centrality", label: "Centrality", rating: centrality },
  ],
  descriptor,
});

const ATMOSPHERIC = (
  contrast: Rating,
  visibility: Rating,
  hierarchy: Rating,
  descriptor: string,
): CriterionGroup => ({
  id: "atmospheric",
  title: "Atmospheric",
  subtitle: "Light / Sensory / Environment",
  criteria: [
    { id: "contrast", label: "Contrast", rating: contrast },
    { id: "visibility", label: "Visibility", rating: visibility },
    { id: "hierarchy", label: "Hierarchy", rating: hierarchy },
  ],
  descriptor,
});

const archetype = (
  id: string,
  name: string,
  groups: CriterionGroup[],
  synthesis: string,
): Archetype => ({ id, name, groups, synthesis });

export const TYPOLOGIES: Typology[] = [
  {
    id: "lobby",
    label: "Lobby",
    tagline: "Threshold · arrival · vertical release",
    archetypes: [
      archetype(
        "vertical-void",
        "Vertical Void",
        [
          FORMAL(
            2,
            1,
            2,
            "An elongated massing sequence compresses at the threshold, then releases into a vertically expanding void. Proportion stays tight in plan and opens in section.",
          ),
          SPATIAL(
            1,
            2,
            1,
            "Circulation stays continuous through the sequence. Visual connections appear only through controlled openings rather than a single panoramic field.",
          ),
          ATMOSPHERIC(
            2,
            1,
            2,
            "Entry is dense and low-lit. Light and spatial release accumulate along the path into a layered experience of movement, brightness, and vertical air.",
          ),
        ],
        "An elongated spatial sequence organized through increasing directional compression, transitioning from a dense threshold into a vertically expanding void. Circulation remains continuous while visual connections emerge through controlled openings, creating a layered experience of movement, light, and spatial release.",
      ),
      archetype(
        "compressed-sequential",
        "Compressed Sequential",
        [
          FORMAL(
            1,
            2,
            2,
            "Repeated bays shorten in depth as they approach the interior. Massing is serial, tightly proportioned, and strongly directional.",
          ),
          SPATIAL(
            0,
            2,
            1,
            "Movement is a chain of compressed rooms. Connections are axial and frequent; openness is withheld until the last bay.",
          ),
          ATMOSPHERIC(
            2,
            0,
            1,
            "Light arrives as a series of slits. Contrast between bay and joint is high; long views are rare by intention.",
          ),
        ],
        "A serial threshold of compressed bays that tighten in depth, holding the body in a directional sequence until a late spatial release. Joints carry the connections; light is admitted as measured slits rather than a continuous wash.",
      ),
      archetype(
        "continuous-hall",
        "Continuous Hall",
        [
          FORMAL(
            1,
            2,
            2,
            "A long, even hall with a stable section. Complexity is low; proportion and direction dominate the geometry.",
          ),
          SPATIAL(
            2,
            1,
            0,
            "The hall is openly traversable along its length. Connectivity is linear rather than networked; no single center organizes the space.",
          ),
          ATMOSPHERIC(
            1,
            2,
            1,
            "A continuous luminous volume. Visibility is high along the axis; hierarchy appears only at the ends and at side alcoves.",
          ),
        ],
        "A long, even hall whose section stays calm while movement runs its full length. Openness and axial visibility replace a central gathering node; hierarchy collects only at the ends and in shallow alcoves.",
      ),
      archetype(
        "topographic-ground-field",
        "Topographic Ground Field",
        [
          FORMAL(
            2,
            0,
            1,
            "The ground itself is the massing: folded planes, stepped plates, and irregular edges. Proportion is uneven; direction is local rather than axial.",
          ),
          SPATIAL(
            2,
            1,
            0,
            "Occupation is a field, not a corridor. Paths branch across the topography; centrality is weak by design.",
          ),
          ATMOSPHERIC(
            1,
            1,
            0,
            "Light grazes the folded ground. Contrast is moderate; no single luminous event outranks the field.",
          ),
        ],
        "Arrival is distributed across a folded ground rather than a corridor. Occupation spreads as a field of stepped plates, with local direction, weak centrality, and light that grazes the topography instead of staging a single event.",
      ),
      archetype(
        "linear-gallery",
        "Linear Gallery",
        [
          FORMAL(
            1,
            2,
            2,
            "A calibrated linear envelope: even bays, thin wall, measured depth. Direction is the primary formal act.",
          ),
          SPATIAL(
            1,
            2,
            0,
            "The gallery connects as a measured path with side chambers. Openness is controlled; there is no central room.",
          ),
          ATMOSPHERIC(
            1,
            2,
            1,
            "Even, museum-like light along the wall. Views are sequential and clear; hierarchy is quiet.",
          ),
        ],
        "A measured linear envelope of even bays and side chambers. Direction and sequential views organize the gallery; openness is controlled and no central room is allowed to collect the sequence.",
      ),
    ],
  },
  {
    id: "workspace",
    label: "Workspace",
    tagline: "Studio · partition · working depth",
    archetypes: [
      archetype(
        "cellular-studio",
        "Cellular Studio",
        [
          FORMAL(
            2,
            2,
            1,
            "A pack of similar work cells with shared dimension. Complexity lives in the aggregate; each cell is proportionally calm.",
          ),
          SPATIAL(
            0,
            2,
            1,
            "Privacy is high inside the cell. Connectivity runs through a shared spine; a modest center holds service and critique.",
          ),
          ATMOSPHERIC(
            1,
            0,
            2,
            "Task light in the cell, brighter collective light at the spine. Hierarchy of illumination marks work versus gathering.",
          ),
        ],
        "Work is packed into similar cells along a shared spine. Proportion stays calm inside each room while connectivity and light hierarchy collect at the service and critique center.",
      ),
      archetype(
        "nested-atelier",
        "Nested Atelier",
        [
          FORMAL(
            2,
            1,
            0,
            "Rooms within rooms: inner enclosures sit inside a larger studio shell. Complexity is nested rather than linear.",
          ),
          SPATIAL(
            1,
            1,
            2,
            "The inner room is the working heart. Surrounding space is residual, wrapping, and only moderately open.",
          ),
          ATMOSPHERIC(
            2,
            1,
            2,
            "The nest is darker and more concentrated. The outer studio is brighter; contrast announces the working core.",
          ),
        ],
        "An inner working enclosure nested inside a brighter studio shell. Complexity is concentric: the core holds the work, the wrap holds movement, and contrast marks the difference.",
      ),
      archetype(
        "split-level-workshop",
        "Split-Level Workshop",
        [
          FORMAL(
            2,
            1,
            1,
            "Section is the project: two working datums offset by a short run of steps. Massing is split, not stacked as identical floors.",
          ),
          SPATIAL(
            1,
            2,
            1,
            "Visual and physical links run across the split. The lower and upper work zones stay connected without becoming one room.",
          ),
          ATMOSPHERIC(
            2,
            2,
            1,
            "Light drops into the lower datum and washes the upper slab. Cross-views are strong; hierarchy is sectional rather than axial.",
          ),
        ],
        "Two working datums offset in section, linked by a short run of steps and strong cross-views. The workshop stays one organism without collapsing into a single room.",
      ),
      archetype(
        "perimeter-loft",
        "Perimeter Loft",
        [
          FORMAL(
            1,
            1,
            1,
            "Occupation clings to the envelope. The center is left as a large void; the working ring is thin and continuous.",
          ),
          SPATIAL(
            2,
            1,
            0,
            "The loft looks inward across an open void. Connectivity follows the perimeter; centrality is inverted — the empty middle is the figure.",
          ),
          ATMOSPHERIC(
            1,
            2,
            0,
            "Even daylight from the void. Visibility across the floor is high; no inner room outranks the ring.",
          ),
        ],
        "Work occupies a thin continuous ring around a large inner void. Centrality is inverted: the empty middle is the figure, and visibility runs across the loft rather than into a core room.",
      ),
      archetype(
        "service-spine",
        "Service Spine",
        [
          FORMAL(
            1,
            2,
            2,
            "A thick linear core of service and a thin working plate beside it. Direction follows the spine; proportion is a clear thick/thin pair.",
          ),
          SPATIAL(
            1,
            2,
            2,
            "All rooms plug into the spine. Connectivity is high and explicit; the spine is the center of the plan.",
          ),
          ATMOSPHERIC(
            2,
            1,
            2,
            "The spine is darker, denser, equipment-lit. The working plate is clearer and more even. Hierarchy is infrastructural.",
          ),
        ],
        "A thick service spine with a thin working plate beside it. Every room plugs into the core; light and density announce infrastructure as the hierarchical center of the plan.",
      ),
    ],
  },
  {
    id: "gathering",
    label: "Gathering",
    tagline: "Assembly · overlap · collective field",
    archetypes: [
      archetype(
        "radial-forum",
        "Radial Forum",
        [
          FORMAL(
            1,
            2,
            0,
            "A centered assembly with radial bays. Geometry is simple, proportioned, and weakly directional except toward the middle.",
          ),
          SPATIAL(
            2,
            2,
            2,
            "All paths aim at the forum. Openness and connectivity are high; centrality is the spatial argument.",
          ),
          ATMOSPHERIC(
            1,
            2,
            2,
            "A shared luminous volume at the center, quieter bays around it. Visibility and hierarchy both point inward.",
          ),
        ],
        "A centered assembly whose radial bays aim at a shared luminous volume. Openness, connectivity, and hierarchy all argue for the middle as the collective room.",
      ),
      archetype(
        "overlapping-courts",
        "Overlapping Courts",
        [
          FORMAL(
            2,
            1,
            1,
            "Two or three court figures share edges and slip past one another. Complexity is in the overlap, not in the court itself.",
          ),
          SPATIAL(
            2,
            2,
            1,
            "Each court is open; the overlaps are the connections. Several mild centers rather than one.",
          ),
          ATMOSPHERIC(
            1,
            2,
            1,
            "Light is similar in each court, denser in the overlap. Visibility between courts is the atmospheric event.",
          ),
        ],
        "Two or three court figures share edges and slip past one another. Collective life happens in the overlaps — several mild centers rather than a single forum.",
      ),
      archetype(
        "processional-nave",
        "Processional Nave",
        [
          FORMAL(
            1,
            2,
            2,
            "A long nave with a stable, heightened section. Direction is ceremonial; proportion is tall and even.",
          ),
          SPATIAL(
            1,
            1,
            1,
            "Movement is one procession. Side aisles connect without breaking the axis; the liturgical center sits at the end, not the middle.",
          ),
          ATMOSPHERIC(
            2,
            1,
            2,
            "Light grades from dim entry to a brighter termination. Hierarchy is atmospheric and directional at once.",
          ),
        ],
        "A long, heightened nave that holds one procession. Light grades from dim entry to a brighter termination; the collective center sits at the end of the axis, not in the middle of the plan.",
      ),
      archetype(
        "clustered-chambers",
        "Clustered Chambers",
        [
          FORMAL(
            2,
            1,
            0,
            "A pack of gathering rooms of related but unequal size. Complexity is aggregative; direction is weak.",
          ),
          SPATIAL(
            0,
            2,
            1,
            "Chambers are discrete. Connectivity is through short joints and a small common; openness inside each room is withheld from the others.",
          ),
          ATMOSPHERIC(
            2,
            0,
            1,
            "Each chamber holds its own light. Contrast between rooms is high; long visibility is refused.",
          ),
        ],
        "A pack of discrete gathering rooms joined by short joints and a small common. Each chamber keeps its own light and size; the collective is an aggregate, not a single hall.",
      ),
      archetype(
        "open-agora",
        "Open Agora",
        [
          FORMAL(
            0,
            1,
            0,
            "A weakly enclosed field. Formal complexity is minimal; edges are the only massing.",
          ),
          SPATIAL(
            2,
            1,
            0,
            "Occupation is free across the field. Connectivity is informal; no architectural center is imposed.",
          ),
          ATMOSPHERIC(
            0,
            2,
            0,
            "Even outdoor light. Visibility is high in every direction; hierarchy is social rather than built.",
          ),
        ],
        "A weakly enclosed field whose only massing is the edge. Occupation is free, visibility is high, and any hierarchy is social rather than imposed by the architecture.",
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

export function findTypology(id: TypologyId): Typology {
  const found = TYPOLOGIES.find((item) => item.id === id);
  if (!found) throw new Error(`Unknown typology: ${id}`);
  return found;
}

export function defaultRatings(archetype: Archetype): Record<string, Rating> {
  const ratings: Record<string, Rating> = {};
  for (const group of archetype.groups) {
    for (const criterion of group.criteria) {
      ratings[criterion.id] = criterion.rating;
    }
  }
  return ratings;
}
