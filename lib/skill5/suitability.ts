import type { CriterionDefinition } from "@/lib/types";
import type { ClientActivity, CompatibilityResult, CriterionMatch } from "./client-compatibility";

export type SuitabilityNote = {
  criterionId: string | null;
  title: string;
  text: string;
};

export type SuitabilityReading = {
  works: SuitabilityNote[];
  conflicts: SuitabilityNote[];
  checks: SuitabilityNote[];
};

type Relation = "fit" | "short" | "over";

type ActivityUse = {
  name: string;
  work: string;
  access: string;
};

function activityUse(activity: ClientActivity): ActivityUse {
  return {
    name: activity.name,
    work: activity.spaces.replace(/\.\s*$/, ""),
    access: activity.access,
  };
}

function consequence(id: string, relation: Relation, use: ActivityUse): string {
  const { name, work, access } = use;
  const lines: Record<string, Record<Relation, string>> = {
    complexity: {
      fit: `${name} can use that kind of figure for ${work}, because the room stays legible while the tasks are underway.`,
      short: `${name} is looking for more geometric variation than this body provides. ${work} could be harder to tell apart inside a simpler figure.`,
      over: `The figure is more intersected than ${name} needs. ${work} could lose a clear place to stand, because the room keeps changing shape.`,
    },
    proportionality: {
      fit: `That scale relationship could support ${work}, giving ${name} both a larger register and a smaller one in the same body.`,
      short: `${name} is looking for a stronger change of scale than this body sets up. ${work} may have to share one size of room.`,
      over: `The contrast of scale is stronger than ${name} is asking for. ${work} could be split between a long dimension and a tight one, which may not suit every task equally.`,
    },
    openness: {
      fit: access.toLowerCase().includes("restricted") || access.toLowerCase().includes("separation")
        ? `That degree of enclosure could let ${work} proceed with the access described for ${name}: ${access}.`
        : `That degree of opening could let people reach ${work} in the way ${name} describes, with access stored as ${access}.`,
      short: `${name} needs easier passage to adjacent space than this body offers. ${work} could end up held inside, away from the rooms they depend on.`,
      over: `${name} is stored with access “${access}.” A more open body could make it harder to keep ${work} from merging with the rooms beside them.`,
    },
    connectivity: {
      fit: `Those relationships could let people move between ${work} and the neighboring rooms without the interior becoming only a corridor.`,
      short: `${name} depends on more links to adjacent rooms than this body shows. Moving between ${work} and the next room could mean leaving the figure entirely.`,
      over: `The interior is tied to more adjacent rooms than ${name} is set up for. ${work} could be interrupted by through-movement.`,
    },
    immersive: {
      fit: `That atmosphere could leave attention on ${work}, which is the working mode stored for ${name}. Light and sound are not in the mesh.`,
      short: `${name} is asking for a more enveloping room than this body provides. ${work} could remain detached from the enclosure, with little of the spatial surround the activity is looking for.`,
      over: `The room may absorb attention more than ${name} wants. ${work} could become secondary to the spatial experience, and that reading is not a measured light or acoustic condition.`,
    },
    visibility: {
      fit: `People working on ${work} could see one another across part of the tile, and still have places where the body interrupts the view. This is not a view to Biscayne Bay or the city.`,
      short: `Sightlines inside the tile are more broken than ${name} is asking for. People moving through ${work} may lose sight of one another. This is not a view to Biscayne Bay or the city.`,
      over: `Sightlines run further than ${name} wants for ${work}. Work that should stay visually contained could be read through the tile. This is not a view to Biscayne Bay or the city.`,
    },
    centrality: {
      fit: `Arrival for ${name} — ${work} — could be organized from this figure.`,
      short: `${name} needs a figure that organizes arrival. This one could leave ${work} off the main sequence of entry.`,
      over: `The figure takes a more central role than ${name} requires, and could pull movement through ${work} that was meant to stay at the edge.`,
    },
    "plate-articulation": {
      fit: `The plate could give ${work} distinct places to occupy, which is the zoning ${name} is asking the workspace to provide.`,
      short: `${name} needs clearer zones for ${work}. A more continuous plate could leave those tasks sharing one undifferentiated surface.`,
      over: `The plate is broken into more zones than ${name} describes. ${work} could be split across recesses that the activity does not ask to separate.`,
    },
    "circulation-integration": {
      fit: `Movement and occupation could share the room in the way ${name} uses it: ${work}.`,
      short: `Passage stays outside the occupied area, while ${name} wants movement involved in ${work}. Events and the route could miss each other.`,
      over: `The route takes more of the room than ${name} describes. ${work} could be reduced to the edges of a path.`,
    },
    directionality: {
      fit: `Someone arriving for ${work} could tell which way to go, which is what ${name} uses the room to do.`,
      short: `${name} relies on a clearer direction from entry toward the rooms beyond. This figure could leave that orientation open.`,
      over: `One axis dominates more than ${name} needs. People using ${work} could be led through before they have a place to stop.`,
    },
    modularity: {
      fit: `Repeated or divisible positions could let ${work} be rearranged without rebuilding the figure, which is the flexibility ${name} is asking for.`,
      short: `${name} needs positions that can change as ${work} changes. A single fixed body would make a new layout a change to the whole tile.`,
      over: `The body is more subdivided than ${name} asks. ${work} could be broken into units that the activity treats as one room.`,
    },
    "spatial-permanence": {
      fit: `Occupation and movement relate in the way ${name} describes for ${work}.`,
      short: `${name} wants gathering produced with the path, or at least beside it. Here ${work} could sit apart from how people arrive.`,
      over: `Movement defines the room more than ${name} requires. ${work} could exist only where people are already passing through.`,
    },
    receptivity: {
      fit: `The threshold could support ${work}, with access stored as ${access}.`,
      short: `${name} depends on an inviting approach for ${work}. A guarded threshold could hold people outside the sequence the lobby is meant to start.`,
      over: `The approach is more open than ${name} is using it for. ${work} could lose the degree of control the arrival sequence is meant to keep.`,
    },
    collaboration: {
      fit: `People could work near one another on ${work}, which is the social arrangement stored for ${name}.`,
      short: `${name} is organized around shared occupation. This body offers less proximity, so ${work} could stay as separate tasks with little exchange.`,
      over: `The room presses people together more than ${name} describes. ${work} that needs an individual position could be difficult to separate from the shared floor.`,
    },
    "social-proximity": {
      fit: `The distance between people could suit ${work}, without assuming a crowd count for this tile.`,
      short: `People are held further apart than ${name} wants for ${work}. Exchange could depend on crossing a separation the figure builds in.`,
      over: `The figure compresses people more than ${name} is asking. ${work} could become overstimulating once the room is occupied, and the project-wide evening count is not this tile’s load.`,
    },
  };
  return lines[id]?.[relation] ?? `${name} uses this room for ${work}. The fit of that use would still need to be judged in plan.`;
}

function relationOf(match: CriterionMatch): Relation {
  if (match.similarity === 1) return "fit";
  if ((match.actual ?? 0) < match.desired) return "short";
  return "over";
}

function titleFrom(justification: string | undefined, fallback: string): string {
  const sentence = justification?.trim().split(/(?<=\.)\s/)[0]?.replace(/\.$/, "") ?? "";
  if (sentence.length >= 12 && sentence.length <= 88) return sentence;
  if (sentence.length > 88) {
    const cut = sentence.slice(0, 84);
    const space = cut.lastIndexOf(" ");
    return `${space > 40 ? cut.slice(0, space) : cut}…`;
  }
  return fallback;
}

function observation(
  match: CriterionMatch,
  activity: ClientActivity,
  definition: CriterionDefinition | undefined,
  justification: string | undefined,
): SuitabilityNote {
  const qualifier = match.basis === "review"
    ? "Requires review, so it is not verified geometry."
    : match.basis === "manual"
      ? "This reading was adjusted by hand."
      : match.actual === null
        ? "No reading is stored for this condition."
        : null;
  const text = [qualifier, consequence(match.criterionId, relationOf(match), activityUse(activity))].filter((part): part is string => Boolean(part)).join(" ");
  return {
    criterionId: match.criterionId,
    title: titleFrom(justification, definition?.label ?? match.criterionId),
    text,
  };
}

function checksFor(activity: ClientActivity): SuitabilityNote[] {
  const use = activityUse(activity);
  const byActivity: Record<string, SuitabilityNote[]> = {
    "public-lobby": [
      {
        criterionId: null,
        title: "Visitor arrival",
        text: `${use.work} A door, a threshold, and a route that can carry visitors are not measured. Direction and openness describe the form of movement, not the width of an entry.`,
      },
      {
        criterionId: null,
        title: "Public programs",
        text: `${activity.operations} The ratings do not show where this entrance hands visitors on to the public programs.`,
      },
    ],
    "private-staff-lobby": [
      {
        criterionId: null,
        title: "Employee entrance",
        text: `Access is stored as ${use.access}. ${use.work} The body does not confirm a controlled door or a smaller footprint than the public lobby.`,
      },
      {
        criterionId: null,
        title: "What stays outside",
        text: `${activity.operations} A security checkpoint is not established by the ratings.`,
      },
    ],
    "architecture-design-studio": [
      {
        criterionId: null,
        title: "Design workspace",
        text: `${use.work} Desk depth, screens, and a place to review a drawing are not measured.`,
      },
      {
        criterionId: null,
        title: "Computational work",
        text: `${activity.operations} Collaboration describes how the room is organized. It does not place a shared table.`,
      },
    ],
    "product-design-studio": [
      {
        criterionId: null,
        title: "Product and furniture",
        text: `${use.work} The ratings do not measure clearance to move a piece or to stand back and review it.`,
      },
      {
        criterionId: null,
        title: "Same requirements as architecture",
        text: `${activity.operations} A material library and the path to making are not in the mesh.`,
      },
    ],
    "prototyping-fabrication-lab": [
      {
        criterionId: null,
        title: "Making and testing",
        text: `${use.work} Equipment zones and working clearance are not in the mesh. Access is stored as ${use.access}.`,
      },
      {
        criterionId: null,
        title: "Glazed observation",
        text: `${activity.operations} The mesh does not establish a glazed wall.`,
      },
    ],
    "biological-research-lab": [
      {
        criterionId: null,
        title: "Cultivation and observation",
        text: `${use.work} Environmental control, benches, and servicing for cultivation and sample preparation are not shown by the mesh.`,
      },
      {
        criterionId: null,
        title: "Controlled room",
        text: `Access is stored as ${use.access}. ${activity.operations} The body does not confirm a controlled entry.`,
      },
    ],
    "interdisciplinary-collaboration-hub": [
      {
        criterionId: null,
        title: "Between the studios",
        text: `${use.work} Seats, a table, and the path between Architecture and Product Design are not measured.`,
      },
      {
        criterionId: null,
        title: "Shared gathering",
        text: `${activity.operations} The ratings do not show how the two studios meet.`,
      },
    ],
    "public-exhibition-gallery": [
      {
        criterionId: null,
        title: "What is exhibited",
        text: `${use.work} Wall or floor area for biological research, products, and installations is not measured.`,
      },
      {
        criterionId: null,
        title: "Connection to fabrication",
        text: `${activity.operations} The mesh does not establish an opening toward the fabrication room.`,
      },
    ],
    "indoor-public-gathering": [
      {
        criterionId: null,
        title: "Social commons",
        text: `${use.work} How many people can gather, and how the public activities connect through this room, is not calculated. Occupancy stays a project-wide figure.`,
      },
      {
        criterionId: null,
        title: "Indoor gathering",
        text: `${activity.operations} Openness does not count the people in the room.`,
      },
    ],
    "waterfront-gathering": [
      {
        criterionId: "visibility",
        title: "The bay",
        text: `${use.work} Biscayne Bay is east of the parcel. Visibility inside the tile is not a measured view to the water.`,
      },
      {
        criterionId: null,
        title: "Toward the water",
        text: `${activity.operations} Extending over the bay is a program intention, not a measured deck.`,
      },
    ],
    "public-restaurant": [
      {
        criterionId: null,
        title: "Public dining",
        text: `${use.work} Seating and service are not established by the ratings.`,
      },
      {
        criterionId: "visibility",
        title: "Commons and waterfront",
        text: `${activity.operations} Visibility inside the tile is not a measured view to the water.`,
      },
    ],
    "staff-dining": [
      {
        criterionId: null,
        title: "Employee dining",
        text: `Access is stored as ${use.access}. ${use.work} A kitchen, seats, and a private enclosure are not sized.`,
      },
      {
        criterionId: null,
        title: "Rest and talk",
        text: `${activity.operations} Informal interaction is a use of the room, not a result of the ratings.`,
      },
    ],
  };
  return byActivity[activity.id] ?? [
    {
      criterionId: null,
      title: "What the ratings leave out",
      text: `${use.work} still need usable area, clearance, and a confirmed means of access (${use.access}). The geometric reading does not establish those conditions.`,
    },
  ];
}

export function readSuitability(
  activity: ClientActivity,
  result: CompatibilityResult,
  definitions: ReadonlyMap<string, CriterionDefinition>,
  justifications: ReadonlyMap<string, string>,
): SuitabilityReading {
  if (!result.applicable) return { works: [], conflicts: [], checks: [] };
  const named = result.matches.filter((match) => match.similarity !== null && match.actual !== null);
  const byImportance = (left: CriterionMatch, right: CriterionMatch) => {
    const gap = (match: CriterionMatch) => (1 - (match.similarity ?? 1)) * match.weight;
    return gap(right) - gap(left) || right.weight - left.weight || left.criterionId.localeCompare(right.criterionId);
  };
  const exact = named.filter((match) => match.similarity === 1).sort((a, b) => b.weight - a.weight || a.criterionId.localeCompare(b.criterionId));
  const differed = named.filter((match) => (match.similarity ?? 1) < 1).sort(byImportance);

  const works = exact.slice(0, 3).map((match) => observation(match, activity, definitions.get(match.criterionId), justifications.get(match.criterionId)));
  if (works.length === 0) {
    works.push({
      criterionId: null,
      title: "No supporting alignment",
      text: `None of the compared conditions lines up with the organization ${activity.name} is asking for. ${activity.spaces} There is not a geometric agreement strong enough to claim the tile supports that work.`,
    });
  }

  const conflicts = differed.slice(0, 3).map((match) => observation(match, activity, definitions.get(match.criterionId), justifications.get(match.criterionId)));
  if (conflicts.length === 0) {
    conflicts.push({
      criterionId: null,
      title: "No geometric conflict",
      text: `The compared conditions agree with what ${activity.name} asks of the room. That agreement does not decide whether ${activity.spaces.replace(/\.\s*$/, "")} can actually be carried out.`,
    });
  }

  return { works, conflicts, checks: checksFor(activity) };
}
