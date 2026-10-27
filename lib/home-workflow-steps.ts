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
      title: "Initial Population",
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
      title: "Selected 3D Candidates",
      body: "Fifteen modules, one per archetype.",
    },
    {
      title: "01 — Select Parent Geometries + Connection Faces",
      body: "Choose two modules from Vertical Propagation and identify the faces to connect, establishing their orientation and connection direction.",
    },
    {
      title: "02 — Extract Sectional Information",
      body: "Sample both parent geometries through successive sectional cuts to reveal how their spatial characteristics change through depth.",
    },
    {
      title: "03 — Generate Hybrid Possibilities",
      body: "Recombine sectional information from both parents to generate hybrid alternatives, each expressing a different relationship between the two geometries.",
    },
    {
      title: "04 — Select + Develop a Hybrid Descendant",
      body: "Select a hybrid candidate and develop its three-dimensional form through sectional evolution along the connection path.",
    },
    {
      title: "05 — Negotiate + Integrate the Hybrid Connection",
      body: "Adapt the selected hybrid to both parent geometries, integrating the three components into a continuous spatial assembly.",
    },
  ],
  client: [
    {
      title: "15 Selected Modules",
      body: "From Vertical Propagation. Five for each program.",
    },
    {
      title: "Client Identity",
      body: "Living Morphologies Studio. Physarum research for furniture and fashion.",
    },
    {
      title: "Work + Leisure",
      body: "Workspace, Lobby, and Gathering.",
    },
    {
      title: "Day + Evening Occupancy",
      body: "Open 8 AM to 10 PM.",
    },
    {
      title: "Design Implications",
      body: "Five floors at most. Work 50%, gathering 40%, lobby 10%.",
    },
  ],
  "skill-5": [
    {
      title: "Site Context",
      body: "The parcel, the water, the streets, and the surrounding buildings.",
    },
    {
      title: "Site Measurements",
      body: "East–west and north–south extents of the design site. North is up.",
    },
    {
      title: "Module Library",
      body: "Fifteen validated modules. One from each program stays above the stage.",
    },
    {
      title: "Assembly Library",
      body: "Skill 4 assemblies. A Hybrid Connection selection replaces the catalog.",
    },
    {
      title: "Grid Placement",
      body: "The parcel and the 20 ft grid.",
    },
    {
      title: "Comparison",
      body: "Saved configurations, shown side by side.",
    },
  ],
};
