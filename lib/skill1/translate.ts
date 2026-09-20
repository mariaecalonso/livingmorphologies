import {
  findArchetype,
  findTypology,
  groupsForArchetype,
  ratingDescription,
} from "../catalog";
import type { GroupId, Rating, RatingsMap } from "../types";
import { configForArchetype } from "./archetypes";
import {
  DIRECTIONALITY_MAP,
  FIELD_SIZE,
  GAMMA_MEDIUM,
  INTENSITY_MAP,
  RADIUS_MAP,
  RATING_LABEL,
  SECTION_HEIGHT,
  SOCIAL_PROXIMITY_SPACING_MAP,
  asRatingIndex,
  DECAY_PRESETS,
  RANDOMNESS_PRESETS,
} from "./maps";
import type {
  BiologicalBehavior,
  BiologicalParams,
  BiologicalTranslation,
  CriterionDescriptorRanking,
  DescriptorRank,
  IntensityLabel,
  Skill1Handoff,
  TranslationTrace,
} from "./types";

const intensity = (rating: Rating | undefined, fallback: Rating = 1) =>
  INTENSITY_MAP[asRatingIndex(rating ?? fallback)];

const GROUPS: GroupId[] = ["formal", "spatial", "atmospheric"];

/**
 * Criterion id → biological target. Kept separate from the engine so the
 * mapping can be adjusted without changing flow / reinforcement math.
 */
export const CRITERION_TARGETS: Record<
  string,
  { target: keyof BiologicalParams | "attractorPosition"; label: string }
> = {
  complexity: { target: "geometryVariation", label: "environmental variation" },
  proportionality: { target: "scaleVariation", label: "spatial scale variation" },
  centrality: { target: "attractorPosition", label: "attractor location" },
  "plate-articulation": {
    target: "geometricDisplacement",
    label: "geometric displacement",
  },
  "circulation-integration": {
    target: "flowCoupling",
    label: "how strongly movement writes trails",
  },
  openness: { target: "permeability", label: "how freely agents move" },
  connectivity: { target: "networkDensity", label: "how strongly agents link areas" },
  directionality: { target: "directionalBias", label: "preferred movement direction" },
  modularity: { target: "nodeRepetition", label: "node repetition" },
  "spatial-permanence": {
    target: "persistence",
    label: "trail persistence",
  },
  immersive: { target: "attractionStrength", label: "strength of attraction" },
  visibility: { target: "influenceRadius", label: "how far attraction reaches" },
  receptivity: { target: "sourcePermeability", label: "source permeability" },
  collaboration: { target: "nodeInteraction", label: "node interaction strength" },
  "social-proximity": { target: "nodeSpacing", label: "how closely agents concentrate" },
};

const CRITERION_REASONS: Record<string, string> = {
  complexity: "Complexity sets how much agents wander and vary their heading.",
  proportionality: "Proportionality stretches how wide or peaked the attraction field is.",
  centrality: "Centrality places the attractor between the source and the field center.",
  "plate-articulation": "Plate articulation offsets local geometry so repeated units are not identical.",
  "circulation-integration":
    "Circulation integration sets how strongly movement writes trails into the field.",
  openness: "Openness sets how freely agents can move through the field.",
  connectivity: "Connectivity sets how strongly agents follow and join trails between areas.",
  directionality: "Directionality sets whether agents prefer a heading toward the attractor.",
  modularity: "Modularity repeats similar nodes so the network can subdivide without a new attractor.",
  "spatial-permanence":
    "Persistence lowers decay on occupied cells near the attractor so reinforced routes remain without deleting secondary paths.",
  immersive: "Immersion sets how strongly the attractor pulls agents.",
  visibility: "Visibility sets how far the attractor can influence agents.",
  receptivity: "Receptivity sets how easily agents leave the source into the field.",
  collaboration: "Collaboration sets how strongly nearby agents influence each other.",
  "social-proximity":
    "Higher social proximity packs agents closer; lower proximity lets them spread.",
};

function paramValue(
  params: BiologicalParams,
  target: keyof BiologicalParams | "attractorPosition",
): number {
  if (target === "attractorPosition") return 0;
  const value = params[target];
  return typeof value === "number" ? value : 0;
}

function intensityLabel(value: number): IntensityLabel {
  if (value >= 0.66) return "High";
  if (value >= 0.4) return "Medium";
  return "Low";
}

function ratingOf(ratings: RatingsMap, id: string, fallback: Rating = 1): Rating {
  const value = ratings[id];
  return value === 0 || value === 1 || value === 2 ? value : fallback;
}

export function paramsFromRatings(ratings: RatingsMap): BiologicalParams {
  const complexity = ratingOf(ratings, "complexity", 0);
  const proportionality = ratingOf(ratings, "proportionality", 0);
  const circulation = ratingOf(ratings, "circulation-integration", 1);
  const openness = ratingOf(ratings, "openness", 2);
  const connectivity = ratingOf(ratings, "connectivity", 0);
  const permanence = ratingOf(ratings, "spatial-permanence", 0);
  const immersive = ratingOf(ratings, "immersive", 2);
  const visibility = ratingOf(ratings, "visibility", 2);
  const proximity = ratingOf(ratings, "social-proximity", 0);
  const directionality = ratingOf(ratings, "directionality", 0);
  const plate = ratingOf(ratings, "plate-articulation", 1);
  const modularity = ratingOf(ratings, "modularity", 1);
  const receptivity = ratingOf(ratings, "receptivity", 1);
  const collaboration = ratingOf(ratings, "collaboration", 1);

  return {
    geometryVariation: intensity(complexity),
    scaleVariation: intensity(proportionality),
    flowCoupling: intensity(circulation),
    permeability: intensity(openness),
    networkDensity: intensity(connectivity),
    directionalBias: DIRECTIONALITY_MAP[directionality],
    attractionStrength: intensity(immersive),
    influenceRadius: RADIUS_MAP[visibility],
    nodeSpacing: SOCIAL_PROXIMITY_SPACING_MAP[proximity],
    persistence: intensity(permanence),
    sourcePermeability: intensity(receptivity),
    nodeInteraction: intensity(collaboration),
    geometricDisplacement: intensity(plate),
    nodeRepetition: intensity(modularity),
    gamma: GAMMA_MEDIUM,
    decay: DECAY_PRESETS.controlled,
    decayMode: "controlled",
    randomness: RANDOMNESS_PRESETS.medium,
    randomnessMode: "medium",
  };
}

export function behaviorFromRatings(ratings: RatingsMap): BiologicalBehavior {
  return buildBehavior(paramsFromRatings(ratings));
}

function buildBehavior(params: BiologicalParams): BiologicalBehavior {
  const trailFollow = 0.48 + params.networkDensity * 0.85;
  return {
    exploration: intensityLabel(params.permeability),
    attraction: intensityLabel(params.attractionStrength),
    trailFollowing: trailFollow >= 0.45 ? "High" : intensityLabel(trailFollow),
    reinforcement: intensityLabel(params.flowCoupling),
    decay: params.decayMode,
    randomness: params.randomnessMode,
  };
}

function buildRankings(
  traces: TranslationTrace[],
  descriptors: Record<GroupId, string>,
): CriterionDescriptorRanking[] {
  return traces
    .filter((trace): trace is TranslationTrace & { category: GroupId } =>
      GROUPS.includes(trace.category as GroupId),
    )
    .map((trace) => {
      const ranks = Object.fromEntries(
        GROUPS.map((category) => {
          const belongs = trace.category === category;
          const rank: DescriptorRank = {
            category,
            descriptor: descriptors[category],
            belongs,
            rating: belongs ? trace.rating : null,
            ratingLabel: belongs ? trace.ratingLabel : null,
          };
          return [category, rank];
        }),
      ) as Record<GroupId, DescriptorRank>;
      return {
        criterionId: trace.criterionId,
        criterion: trace.criterion,
        category: trace.category,
        rating: trace.rating,
        ratingLabel: trace.ratingLabel,
        ratingDescription: trace.ratingDescription,
        descriptor: trace.descriptor ?? descriptors[trace.category],
        ranks,
        target: trace.target,
        biologicalLabel: trace.biologicalLabel,
        biologicalValue: trace.biologicalValue,
        reason: trace.reason,
      };
    });
}

export function translateArchetype(archetypeId: string): BiologicalTranslation {
  const config = configForArchetype(archetypeId);
  const typology = findTypology(config.typologyId);
  const archetype = findArchetype(typology, config.id);
  const ratings = { ...archetype.ratings };
  const params = paramsFromRatings(ratings);

  const descriptors = archetype.descriptors;
  const groups = groupsForArchetype(config.typologyId, archetype, ratings);
  const traces: TranslationTrace[] = groups.flatMap((group) =>
    group.criteria.map((criterion) => {
      const mapping = CRITERION_TARGETS[criterion.id] ?? {
        target: "geometryVariation" as const,
        label: "agent behavior",
      };
      return {
        criterionId: criterion.id,
        criterion: criterion.label,
        category: group.id,
        rating: criterion.rating,
        ratingLabel: RATING_LABEL[criterion.rating],
        ratingDescription: ratingDescription(criterion.definition, criterion.rating),
        descriptor: group.descriptor,
        target: mapping.target,
        biologicalLabel: mapping.label,
        biologicalValue: paramValue(params, mapping.target),
        reason:
          CRITERION_REASONS[criterion.id] ??
          `${criterion.label} at ${RATING_LABEL[criterion.rating]} sets ${mapping.label} for ${group.descriptor}.`,
      };
    }),
  );

  return {
    archetypeId: config.id,
    archetypeName: config.name,
    typologyId: config.typologyId,
    topology: config.topology,
    descriptors,
    ratings,
    params,
    recipe: config.recipe,
    traces,
    rankings: buildRankings(traces, descriptors),
    behavior: buildBehavior(params),
  };
}

export function toHandoff(translation: BiologicalTranslation): Skill1Handoff {
  return {
    skill: 1,
    typologyId: translation.typologyId,
    archetypeId: translation.archetypeId,
    archetypeName: translation.archetypeName,
    topology: translation.topology,
    descriptors: translation.descriptors,
    ratings: translation.ratings,
    traces: translation.traces,
    rankings: translation.rankings,
    params: translation.params,
    recipe: translation.recipe,
    behavior: translation.behavior,
    field: {
      size: FIELD_SIZE,
      height: SECTION_HEIGHT,
      sourceCorner: translation.recipe.sourceCorner,
      attractor: { ...translation.recipe.attractor },
    },
  };
}

export function sourceFromCorner(
  corner: BiologicalTranslation["recipe"]["sourceCorner"],
  size: number,
) {
  const inset = 1;
  if (corner === "bottom-right") return { x: size - 1 - inset, y: inset };
  return { x: inset, y: inset };
}

/**
 * Centrality places the attractor. Gathering archetypes do not rank it,
 * so they keep the recipe location. Lobby ratings move it from edge to center.
 */
export function attractorFromRatings(translation: BiologicalTranslation, size: number) {
  const rating = translation.ratings.centrality;
  if (rating !== 0 && rating !== 1 && rating !== 2) {
    return { ...translation.recipe.attractor };
  }
  const source = sourceFromCorner(translation.recipe.sourceCorner, size);
  const center = { x: (size - 1) / 2, y: (size - 1) / 2 };
  const t = 0.28 + rating * 0.36;
  return {
    x: source.x + (center.x - source.x) * t,
    y: source.y + (center.y - source.y) * t,
  };
}
