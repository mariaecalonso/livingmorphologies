/** Titles and descriptions for the Skill 1 and Skill 2 website workflow frames. */

export type WorkflowStep = {
  title: string;
  body: string;
  cycle?: string;
};

export const SKILL_WORKFLOW_STEPS: Record<string, readonly WorkflowStep[]> = {
  "skill-1": [
    {
      title: "Architecture Input",
      body: "Precedent criteria and descriptors establish the spatial qualities the system should preserve, including openness, connectivity, centrality, visibility, and social proximity.",
    },
    {
      title: "Rules",
      body: "Low, Medium, and High criteria ratings set growth instincts such as spreading, concentrating, connecting, branching, following trails, and avoiding areas. Descriptors organize the spatial recipe through attractors, voids, boundaries, directional conditions, and spatial nodes.",
    },
    {
      title: "Translation",
      body: "Growth instincts and spatial conditions are translated into parameters controlling sensing, movement, attraction, diffusion, trail reinforcement, agent concentration, branching, and merging.",
    },
    {
      title: "Rule-Based Generation",
      body: "The system repeatedly senses, moves, deposits, reinforces, and adapts. These local behaviors collectively produce an emergent network reflecting the original architectural criteria.",
    },
  ],
  "skill-2": [
    {
      title: "Population Initialization",
      body: "The initial population is loaded from the Physarum Logic Catalogue, establishing the seed population for the optimization process.",
    },
    {
      title: "Objective Evaluation",
      body: "Each candidate is evaluated across the defined objective functions, producing a multi objective performance profile for every individual.",
    },
    {
      title: "Non Dominated Sorting",
      body: "Candidates are ranked through Pareto dominance, retaining stronger tradeoff solutions without collapsing performance into a single aggregate score.",
    },
    {
      title: "Diversity Preservation",
      body: "Similarity and distribution are evaluated to reduce redundancy, preserve distinct solutions, and select candidates that continue into the next generation.",
    },
    {
      title: "Next Generation",
      body: "Selected candidates generate the next population, which reenters the evaluation and selection cycle across four generations.",
      cycle: "Evaluate → Rank → Diversify → Select → Generate → Repeat",
    },
  ],
  "skill-3": [
    {
      title: "01 Initialization",
      body: "Verified Z0 and the inherited descriptors.",
    },
    {
      title: "02 Continuations",
      body: "Twenty-four branches, then the samples kept from each.",
    },
    {
      title: "03 Stack",
      body: "Retained plates ordered into the XYT record.",
    },
    {
      title: "04 Geometry",
      body: "Open saddle-shell and capped mass of one continuation.",
    },
    {
      title: "05 Selection",
      body: "Hand selection, then the stored geometric checks.",
    },
    {
      title: "06 Selected for Hybrid Connection",
      body: "Fifteen modules, one per archetype.",
    },
  ],
  recombination: [
    {
      title: "Tile Selection",
      body: "Tiles are selected from the Skill 03 output, along with the two faces that will be used for morphological connection.",
    },
    {
      title: "Connector Candidate Field",
      body: "Two registered faces are sampled, then a 5×5 candidate field blends the parent modules and sets transformation intensity. The field is not a trained self-organizing map.",
    },
    {
      title: "Aggregation Operations",
      body: "The selected hybrid is positioned between the two faces, checked for fit, converted into an interlocking connection, and used to plan the required boolean cuts and final joining operations.",
    },
    {
      title: "Connection Summary",
      body: "The two tiles are joined through the selected hybrid, completing the morphological connection.",
    },
  ],
  client: [
    {
      title: "The Client",
      body: "",
    },
  ],
  "skill-5": [
    {
      title: "Site Context",
      body: "The One Herald Plaza parcel, its streets, and the surrounding buildings establish the ground the modules occupy.",
    },
    {
      title: "Module Library",
      body: "Fifteen Skill 3 modules are loaded, one for each archetype, each held in a 20 × 20 × 20 ft envelope.",
    },
    {
      title: "Grid Placement",
      body: "A chosen module is placed on the parcel, snapped to the 10 ft grid, then moved or rotated.",
    },
    {
      title: "Session Composition",
      body: "Placed modules form a composition for this session. Analysis, comparison, and saved configurations are not part of this phase.",
    },
  ],
};
