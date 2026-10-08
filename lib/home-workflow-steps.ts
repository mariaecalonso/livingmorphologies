/** Titles and descriptions for the Skill 1 and Skill 2 website workflow frames. */

export type WorkflowStep = {
  title: string;
  body: string;
  cycle?: string;
};

export const SKILL_WORKFLOW_STEPS: Record<string, readonly WorkflowStep[]> = {
  "skill-1": [
    {
      title: "Architectural Input",
      body: "Precedent criteria and descriptors establish the spatial qualities the system should preserve, including openness, connectivity, centrality, visibility, and social proximity.",
    },
    {
      title: "Criteria → Growth Instincts",
      body: "Low, Medium, and High criteria ratings control behavioral tendencies such as spreading, concentrating, connecting, branching, following trails, and avoiding areas.",
    },
    {
      title: "Descriptors → Spatial Recipe",
      body: "Descriptors organize the simulation field through attractors, voids, boundaries, directional conditions, and spatial nodes, creating an archetype-specific environment.",
    },
    {
      title: "Translation → Simulation Parameters",
      body: "Growth instincts and spatial conditions are translated into parameters controlling sensing, movement, attraction, diffusion, trail reinforcement, agent concentration, branching, and merging.",
    },
    {
      title: "Physarum Executes the Rules",
      body: "The system repeatedly senses, moves, deposits, reinforces, and adapts. These local behaviors collectively produce an emergent network reflecting the original architectural criteria.",
      cycle: "Sense → Move → Deposit → Reinforce → Adapt → Repeat",
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
      title: "Diversity Preservation + Selection",
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
      title: "Start — Verified Z0",
      body: "Begin from the exact 2D morphology selected in Skill 2 and load its verified simulation state, establishing the inherited starting condition for Skill 3.",
    },
    {
      title: "Inherit — Descriptors",
      body: "Carry the Formal, Spatial, and Atmospheric descriptor priorities from Skill 2 forward as the baseline for post-Z0 temporal development.",
    },
    {
      title: "Evolve — 24 Temporal Behaviors",
      body: "Continue the verified Z0 into 24 different temporal futures by varying when and how strongly the inherited descriptors influence the simulation.",
    },
    {
      title: "Sample — Adaptive Evolution",
      body: "Allow each continuation to evolve for as long as needed and retain only meaningful moments of change, such as merges, splits, openings, or directional shifts.",
    },
    {
      title: "Stack — XYT Construction",
      body: "Stack the accepted 2D temporal states vertically, mapping T → Z, to transform the evolving morphology into a 20×20×20 space-time volume.",
    },
    {
      title: "Curate — Diversity Selection",
      body: "Compare the 24 resulting 3D temporal morphologies and reduce them to 12 representative outcomes for the 3D Catalogue and final selection.",
    },
  ],
  recombination: [
    {
      title: "Tile Selection",
      body: "Tiles are selected from the Skill 03 output, along with the two faces that will be used for morphological connection.",
    },
    {
      title: "Hybrid SOM Matrices",
      body: "Each connector is generated through a 5×5 SOM matrix that explores possible hybrid geometries aligned with the spatial characteristics of both tiles.",
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
};
