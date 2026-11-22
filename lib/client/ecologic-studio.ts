/**
 * ecoLogicStudio client record for Living Morphologies.
 *
 * Living Morphologies is the architectural project. ecoLogicStudio is the client.
 * The proposed building is the ecoLogicStudio Miami Bio-Computational Design Hub
 * at One Herald Plaza.
 *
 * `documented` is a company fact with a public source, or a fact supplied in the
 * November 2026 client brief when no public staff page was found.
 * `proposed` is our architectural reading for the Miami hub.
 * `unverified-assumption` is a planning figure, not the studio's actual capacity.
 *
 * Panels are separate so Profile, Design Disciplines, Organization, Operations,
 * Space Program, and Project Precedents can be selected independently later.
 */
import brief from "@/data/skill5/workplace-brief.json";

export type ClientClaim = "documented" | "proposed" | "unverified-assumption";

export type ClientSource = {
  label: string;
  url: string;
};

export type ClientPanelId =
  | "profile"
  | "disciplines"
  | "organization"
  | "operations"
  | "space-program"
  | "precedents";

export const ARCHITECTURAL_PROJECT = "Living Morphologies";

export const PROPOSED_BUILDING = {
  name: "ecoLogicStudio Miami Bio-Computational Design Hub",
  site: "One Herald Plaza",
  city: "Miami",
  status: "proposed" as const,
};

export const CLIENT_PROFILE = {
  id: "profile" as const,
  status: "documented" as const,
  name: "ecoLogicStudio",
  founded: { year: 2005, city: "London" },
  cofounders: ["Dr Claudia Pasquero", "Dr Marco Poletto"],
  focus: "Biotechnology for the built environment",
  summary:
    "Architecture and design innovation firm specializing in biotechnology for the built environment.",
  expertise: ["Systemic thinking", "Computational design", "Biotechnology", "Digital prototyping"],
  work: [
    "Biophilic sculptures",
    "Living architecture",
    "Experimental pavilions",
    "Architectural projects",
    "Blue-green urban planning",
  ],
  logo: { src: "/ecologicstudio-logo.png", alt: "ecoLogicStudio" },
  sources: [
    {
      label: "PhotoSynthetica — ecoLogicStudio",
      url: "https://www.photosynthetica.co.uk/ecologicstudio",
    },
  ] satisfies ClientSource[],
};

export type PracticeTone = "teal" | "copper";

/**
 * Areas of practice for architectural programming. Not official company departments.
 * Each summary restates the profile and the documented precedents below.
 * `example` names one precedent and the area it links to; the pair must be a documented entry in `PRACTICE_EXCHANGES`.
 */
export const PRACTICE_AREAS = [
  {
    id: "bio",
    label: "Biotechnology + Bio Research",
    short: "Bio Research",
    tone: "teal",
    summary: "Living photosynthetic organisms, such as microalgae and cyanobacteria, cultivated as a design material.",
    example: { precedent: "hortus-xl", with: "fabrication" },
  },
  {
    id: "computation",
    label: "Computational Design + AI",
    short: "Computation + AI",
    tone: "teal",
    summary: "Computational design and artificial intelligence that learn from biological intelligence.",
    example: { precedent: "gan-physarum", with: "bio" },
  },
  {
    id: "urban",
    label: "Architecture + Urban Systems",
    short: "Urban Systems",
    tone: "copper",
    summary: "Living architecture and blue-green urban planning, including photosynthetic building cladding.",
    example: { precedent: "photosynthetica-venture", with: "computation" },
  },
  {
    id: "product",
    label: "Bio-Design + Product Development",
    short: "Bio-Design",
    tone: "copper",
    summary: "Biophilic design products made with re-metabolised algal biomass.",
    example: { precedent: "photosynthetica-collection", with: "fabrication" },
  },
  {
    id: "fabrication",
    label: "Digital Fabrication + Prototyping",
    short: "Fabrication",
    tone: "copper",
    summary: "3D printing and digital prototyping, from bio-sculpture cells to design products.",
    example: { precedent: "hortus-xl", with: "bio" },
  },
] as const satisfies readonly {
  id: string;
  label: string;
  short: string;
  tone: PracticeTone;
  summary: string;
  example: { precedent: string; with: string };
}[];

export type PracticeAreaId = (typeof PRACTICE_AREAS)[number]["id"];

export const DESIGN_DISCIPLINES = {
  id: "disciplines" as const,
  status: "proposed" as const,
  note: "Areas of practice for the Miami hub. Not verified as official ecoLogicStudio departments.",
  areas: PRACTICE_AREAS,
};

/**
 * Named roster supplied in the client brief.
 * No current public staff page was found, so these names are not independently verified here.
 * They are not the professional categories in `PROFESSIONAL_CATEGORIES`.
 */
export const ORGANIZATION = {
  id: "organization" as const,
  status: "documented" as const,
  verification: "Supplied in the Living Morphologies client brief. A current public staff page was not found.",
  sourceNote: "Team roster supplied in client brief; current status not independently verified.",
  directors: ["Dr Claudia Pasquero", "Dr Marco Poletto"],
  team: {
    name: "Bio-Computational Design Team",
    members: ["Eirini Tsomokou", "Korbinian Enzinger", "Claudia Handler", "Oscar Villarreal", "Terezia Greskova"],
  },
  officeManager: "Alessandra Poletto",
  activities: ["Research", "Design"],
  collaborationNetwork: {
    note: "Collaboration network, including PhotoSynthetica and documented research partnerships.",
    partners: [
      {
        name: "PhotoSynthetica",
        note: "Innovation venture of ecoLogicStudio, launched in 2018 by Claudia Pasquero and Marco Poletto.",
        url: "https://www.photosynthetica.co.uk/about",
      },
      {
        name: "Urban Morphogenesis Lab, Bartlett School of Architecture, UCL",
        note: "Documented academic research partnership.",
        url: "https://www.photosynthetica.co.uk/about",
      },
      {
        name: "Synthetic Landscape Lab, University of Innsbruck",
        note: "Documented academic research partnership.",
        url: "https://www.uibk.ac.at/staedtebau/landscape-architecture/projects/h.o.r.t.u.s.-xl-astaxanthin.g.html",
      },
    ],
  },
  fabrication: {
    label: "Fabrication + Prototyping",
    note: "A shared practice activity. Not a verified independent department.",
  },
};

export const WORKING_MODES = [
  {
    id: "focused",
    label: "Focused",
    activities: ["Biological research", "Computational modeling", "Environmental analysis", "Individual design development"],
  },
  {
    id: "collaborative",
    label: "Collaborative",
    activities: ["Cross-disciplinary exchange between biotechnology, computational design, architecture, and product development"],
  },
  {
    id: "experimental",
    label: "Experimental",
    activities: ["Living-material cultivation", "Ecological testing", "Digital fabrication", "Physical prototyping"],
  },
  {
    id: "social",
    label: "Social",
    activities: ["Knowledge exchange", "Exhibitions", "Educational activities", "Informal interaction", "Waterfront gatherings"],
  },
] as const;

export const OPERATIONS = {
  id: "operations" as const,
  status: "proposed" as const,
  note: "Proposed working modes for the Miami hub. Not a record of how the London studio is organized today.",
  modes: WORKING_MODES,
};

/** Professional categories for the proposed hub. Not the named employee roster. */
export const PROFESSIONAL_CATEGORIES = [
  "Architects + Urban Designers",
  "Bio-Computational Designers",
  "Biotechnology Researchers",
  "Digital Fabrication Specialists",
  "External Research Collaborators",
  "Studio Management",
] as const;

export const PLANNING_CAPACITY = {
  status: "unverified-assumption" as const,
  daytimeOccupants: brief.occupancy.daytimeWork,
  eventAttendees: brief.occupancy.eveningGathering,
  hours: brief.operations.hours,
  note: "Unverified architectural planning assumptions for the proposed Miami hub. Not ecoLogicStudio's actual employee count or event capacity.",
  shortNote: "Planning assumption, not staff or event capacity",
  retiredBadgeHolders: {
    value: brief.occupancy.badgeHoldersAndVisitors,
    note: "Earlier brief figure. It is not a current requirement and is not shown.",
  },
};

export const SPACE_PROGRAM = {
  id: "space-program" as const,
  status: "proposed" as const,
  building: PROPOSED_BUILDING,
  project: ARCHITECTURAL_PROJECT,
  workLeisure: {
    label: "Work–leisure integration",
    summary:
      "Interdisciplinary collaboration, adaptable shared spaces, public engagement, controlled laboratory access, and a continuous relationship with Biscayne Bay.",
  },
  scenarios: {
    daytime: ["Research laboratories", "Interdisciplinary design studios", "Shared collaboration spaces", "Public waterfront"],
    evening: ["Secured laboratories", "Secured studios", "Exhibitions and workshops", "Public waterfront"],
  },
  capacity: PLANNING_CAPACITY,
  whoWorksHere: {
    note: "Professional categories for the proposed hub. Distinct from the named employee roster.",
    categories: PROFESSIONAL_CATEGORIES,
  },
  programs: brief.programs,
};

export type ClientPrecedent = {
  id: string;
  title: string;
  officialTitle: string;
  shortLabel: string;
  year: string;
  description: string;
  sources: ClientSource[];
  /** Image paths stored in this repo. None are verified project assets yet. */
  assets: readonly string[];
  /** Proposed architectural reading. Kept empty until a reading is written apart from the official record. */
  interpretation: string | null;
};

export const PRECEDENTS: readonly ClientPrecedent[] = [
  {
    id: "gan-physarum",
    title: "GAN-Physarum: La Dérive Numérique",
    officialTitle: "La Dérive Numérique [GAN Physarum Paris]",
    shortLabel: "GAN-Physarum",
    year: "2021",
    description:
      "Video artwork in which a generative adversarial network trained to behave like Physarum polycephalum traces a computational dérive across Paris. Made with the Synthetic Landscape Lab, University of Innsbruck, and the Urban Morphogenesis Lab, Bartlett, UCL.",
    sources: [
      {
        label: "Centre Pompidou — La Dérive Numérique [GAN Physarum Paris]",
        url: "https://www.centrepompidou.fr/en/ressources/oeuvre/HJXJLjF",
      },
    ],
    assets: [],
    interpretation: null,
  },
  {
    id: "hortus-xl",
    title: "H.O.R.T.U.S. XL Astaxanthin.g",
    officialTitle: "H.O.R.T.U.S. XL Astaxanthin.g",
    shortLabel: "H.O.R.T.U.S. XL",
    year: "2019",
    description:
      "Large-scale 3D-printed bio-sculpture conceived by Claudia Pasquero and Marco Poletto with the Synthetic Landscape Lab at the University of Innsbruck. Photosynthetic cyanobacteria are inoculated into a biogel in the printed cells.",
    sources: [
      {
        label: "University of Innsbruck — H.O.R.T.U.S. XL Astaxanthin.g",
        url: "https://www.uibk.ac.at/staedtebau/landscape-architecture/projects/h.o.r.t.u.s.-xl-astaxanthin.g.html",
      },
    ],
    assets: [],
    interpretation: null,
  },
  {
    id: "photosynthetica-collection",
    title: "PhotoSynthetica Collection",
    officialTitle: "PhotoSynthetica Collection",
    shortLabel: "PhotoSynthetica Collection",
    year: "2024",
    description:
      "First collection of biophilic design products from the PhotoSynthetica research, including a desktop biotechnological air purifier, a compostable stool, and a 3D-printed jewel made with re-metabolised algal biomass. A dedicated page on the studio's own site was not verified; the citation is a published account of the collection.",
    sources: [
      {
        label: "Arkitera — PhotoSynthetica Collection by ecoLogicStudio",
        url: "https://www.arkitera.com/en/news-en/photosynthetica-collection-by-ecologicstudio-biophilic-design-products-for-collective-cyber-gardening/",
      },
    ],
    assets: [],
    interpretation: null,
  },
  {
    id: "photosynthetica-venture",
    title: "PhotoSynthetica venture",
    officialTitle: "PhotoSynthetica",
    shortLabel: "PhotoSynthetica",
    year: "2018",
    description:
      "Innovation venture of ecoLogicStudio, launched in 2018 by Claudia Pasquero and Marco Poletto. It develops photosynthetic cladding and related bio-digital systems with the Urban Morphogenesis Lab at UCL and the Synthetic Landscape Lab at the University of Innsbruck.",
    sources: [
      { label: "PhotoSynthetica — About", url: "https://www.photosynthetica.co.uk/about" },
      { label: "PhotoSynthetica — System", url: "https://www.photosynthetica.co.uk/system" },
    ],
    assets: [],
    interpretation: null,
  },
];

/** The collaborator node in the exchange diagram. Its documented members are `ORGANIZATION.collaborationNetwork.partners`. */
export const EXTERNAL_COLLABORATORS = {
  id: "external" as const,
  label: PROFESSIONAL_CATEGORIES[4],
  short: "External",
  tone: "teal" as const,
};

export type ExchangeNodeId = PracticeAreaId | typeof EXTERNAL_COLLABORATORS.id;

export type PracticeExchange = {
  between: readonly [ExchangeNodeId, ExchangeNodeId];
  /** `documented` cites a precedent below. `proposed` is a working mode for the Miami hub, not a record of the studio. */
  claim: "documented" | "proposed";
  note: string;
  precedent?: ClientPrecedent["id"];
  mode?: (typeof WORKING_MODES)[number]["id"];
};

/** Exchanges between areas of practice. Not reporting lines, teams, or institutional agreements. */
export const PRACTICE_EXCHANGES: readonly PracticeExchange[] = [
  {
    between: ["bio", "fabrication"],
    claim: "documented",
    note: "Photosynthetic cyanobacteria inoculated into a biogel in 3D-printed cells.",
    precedent: "hortus-xl",
  },
  {
    between: ["bio", "external"],
    claim: "documented",
    note: "Conceived with the Synthetic Landscape Lab, University of Innsbruck.",
    precedent: "hortus-xl",
  },
  {
    between: ["bio", "computation"],
    claim: "documented",
    note: "A generative adversarial network trained to behave like Physarum polycephalum.",
    precedent: "gan-physarum",
  },
  {
    between: ["computation", "external"],
    claim: "documented",
    note: "Made with the Synthetic Landscape Lab, Innsbruck, and the Urban Morphogenesis Lab, UCL.",
    precedent: "gan-physarum",
  },
  {
    between: ["bio", "product"],
    claim: "documented",
    note: "Biophilic products made with re-metabolised algal biomass.",
    precedent: "photosynthetica-collection",
  },
  {
    between: ["product", "fabrication"],
    claim: "documented",
    note: "A 3D-printed jewel made with algal biomass.",
    precedent: "photosynthetica-collection",
  },
  {
    between: ["urban", "bio"],
    claim: "documented",
    note: "Photosynthetic cladding for buildings.",
    precedent: "photosynthetica-venture",
  },
  {
    between: ["urban", "computation"],
    claim: "documented",
    note: "Photosynthetic cladding developed with related bio-digital systems.",
    precedent: "photosynthetica-venture",
  },
  {
    between: ["urban", "external"],
    claim: "documented",
    note: "Developed with the Urban Morphogenesis Lab, UCL, and the Synthetic Landscape Lab, Innsbruck.",
    precedent: "photosynthetica-venture",
  },
  {
    between: ["computation", "product"],
    claim: "proposed",
    note: "Cross-disciplinary exchange in shared studios.",
    mode: "collaborative",
  },
  {
    between: ["urban", "product"],
    claim: "proposed",
    note: "Cross-disciplinary exchange in shared studios.",
    mode: "collaborative",
  },
  {
    between: ["bio", "fabrication"],
    claim: "proposed",
    note: "Living-material cultivation and ecological testing beside digital fabrication and physical prototyping.",
    mode: "experimental",
  },
  {
    between: ["external", "urban"],
    claim: "proposed",
    note: "Knowledge exchange, exhibitions, and educational activities.",
    mode: "social",
  },
];

export const PROJECT_PRECEDENTS = {
  id: "precedents" as const,
  status: "documented" as const,
  note: "Official titles, descriptions, and source URLs. Architectural interpretations stay in `interpretation` and are empty until written.",
  items: PRECEDENTS,
};

export const CLIENT_PANELS = {
  profile: CLIENT_PROFILE,
  disciplines: DESIGN_DISCIPLINES,
  organization: ORGANIZATION,
  operations: OPERATIONS,
  "space-program": SPACE_PROGRAM,
  precedents: PROJECT_PRECEDENTS,
} as const satisfies Record<ClientPanelId, { id: ClientPanelId }>;

/** Short lines for the existing workflow diagram, which has fixed caption slots. */
export const WORKFLOW_CAPTIONS = {
  client: CLIENT_PROFILE.name,
  focus: "Biotechnology",
  disciplines: "Bio-design, computation",
  character: "Work–leisure, proposed",
  program: "Workspace, lobby, gathering",
} as const;
