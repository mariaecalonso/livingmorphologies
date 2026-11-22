/** Demo Workflow chapters and the methodological sequence each one presents. */

import { ORGANISM_INTRO_SECONDS } from "@/lib/cinematic-intro";

export type DemoOperation = {
  label: string;
  /** Short verified quantity under the operation. */
  note?: string;
  /** The link from the previous operation runs both ways, as in design feedback. */
  twoWay?: boolean;
  /** Name of a hand-opened demonstration for this operation, shown in the location line while open. */
  feature?: string;
  /** Numeral shown with the label. An empty string leaves the numeral off. */
  mark?: string;
  /** The values are already set for the demonstration. */
  locked?: boolean;
};

export type DemoChapter = {
  id: string;
  index: string;
  title: string;
  /** Workflow stages this chapter presents, in order. */
  stages: readonly string[];
  sequence: readonly DemoOperation[];
  /** The chapter stays on its overview. Playback does not open a second layout. */
  overviewOnly?: boolean;
  /** The chapter opens on its explanations. It has no separate overview. */
  focusedOnly?: boolean;
  /**
   * Focused pages in place of an overview and an explanation.
   * Playback opens the first, then each next page. `sequence` stays the Process Overview list.
   * `holdMs` is how long playback stays on that page.
   */
  pages?: readonly { name: string; sequence: readonly DemoOperation[]; holdMs?: number }[];
  /** A page between chapters. It is not a cluster on the Process Overview. */
  video?: boolean;
};

export const DEMO_CHAPTERS: readonly DemoChapter[] = [
  {
    id: "research",
    index: "01",
    title: "Research + System Definition",
    stages: ["Typology Analysis", "Generative System"],
    sequence: [
      { label: "Precedents" },
      { label: "Typology Analysis" },
      { label: "Criteria + Descriptors", feature: "Archetype analysis" },
      { label: "Generative System Research" },
      { label: "Physarum Selection" },
    ],
  },
  {
    id: "video",
    index: "",
    title: "Video",
    stages: [],
    sequence: [],
    overviewOnly: true,
    video: true,
  },
  {
    id: "generative",
    index: "02",
    title: "Generative Development",
    stages: ["Physarum Logic", "Optimization"],
    sequence: [
      { label: "Architectural Input + Physarum Behavior" },
      { label: "Rule Translation" },
      { label: "2D Generation", feature: "Lab run" },
      { label: "Optimization" },
      { label: "Selected 2D Candidates" },
    ],
    pages: [
      {
        name: "Parameter Map",
        holdMs: 48000,
        sequence: [{ label: "Parameter Map", mark: "" }],
      },
      {
        name: "Lab Simulation",
        holdMs: 64000,
        sequence: [
          { label: "Criteria Configuration", mark: "01", locked: true },
          { label: "Agent / Simulation", mark: "02" },
          { label: "Analysis", mark: "03" },
        ],
      },
      {
        name: "First Population",
        holdMs: 56000,
        sequence: [{ label: "First Population", mark: "03" }],
      },
      {
        name: "Multiobjective Optimization",
        holdMs: 64000,
        sequence: [{ label: "Multiobjective Optimization", mark: "" }],
      },
      {
        name: "Optimization",
        holdMs: 72000,
        sequence: [{ label: "Optimization", mark: "" }],
      },
      {
        name: "Catalog Selection",
        holdMs: 50000,
        sequence: [{ label: "Catalog selection", mark: "" }],
      },
      {
        name: "Selected Candidates",
        holdMs: 28000,
        sequence: [{ label: "Selected for vertical propagation", mark: "" }],
      },
      {
        name: "Archetype Reading",
        holdMs: 36000,
        sequence: [{ label: "Archetype reading", mark: "" }],
      },
    ],
  },
  {
    id: "vertical",
    index: "03",
    title: "Vertical Propagation",
    stages: ["Vertical Propagation"],
    sequence: [
      { label: "Verified Z0" },
      { label: "24 Continuations" },
      { label: "Sampling / XYT Stack" },
      { label: "3D Formation" },
      { label: "Selection / Validation", feature: "Lab run" },
      { label: "Clustering" },
      { label: "Joint Refinement" },
    ],
    pages: [
      {
        name: "Process",
        holdMs: 100000,
        sequence: [{ label: "Process", mark: "01" }],
      },
      {
        name: "Catalog",
        holdMs: 110000,
        sequence: [{ label: "Catalog", mark: "02" }],
      },
      {
        name: "Final View",
        sequence: [{ label: "Final Morphology Catalogue" }],
      },
      {
        name: "Clustering development",
        holdMs: 52000,
        sequence: [{ label: "Clustering development", mark: "" }],
      },
      {
        name: "Graph and WFC",
        holdMs: 48000,
        sequence: [{ label: "Graph and WFC", mark: "" }],
      },
      {
        name: "Cluster catalog",
        holdMs: 56000,
        sequence: [{ label: "Cluster catalog", mark: "" }],
      },
    ],
  },
  {
    id: "context",
    index: "04",
    title: "Design Context",
    stages: ["The Client", "Site Analysis", "Clustering"],
    sequence: [
      { label: "Client" },
      { label: "Site Analysis" },
      { label: "Design Context Conclusion" },
      { label: "Clustering Refinement" },
    ],
    pages: [
      {
        name: "Client",
        holdMs: 28000,
        sequence: [{ label: "Client", mark: "" }],
      },
      {
        name: "Site Analysis",
        holdMs: 42000,
        sequence: [{ label: "Site Analysis", mark: "" }],
      },
      {
        name: "Design Context Conclusion",
        holdMs: 28000,
        sequence: [{ label: "Design context conclusion", mark: "" }],
      },
      {
        name: "Clustering Refinement",
        holdMs: 36000,
        sequence: [{ label: "Clustering refinement", mark: "" }],
      },
    ],
  },
  {
    id: "strategy",
    index: "05",
    title: "Site Strategy",
    stages: ["Site Strategy", "Physarum Attractors", "Cluster Assembly"],
    sequence: [
      { label: "Site Strategy" },
      { label: "Physarum Attractors" },
      { label: "Cluster Assembly" },
    ],
    pages: [
      {
        name: "Site Strategy",
        holdMs: 42000,
        sequence: [{ label: "Site strategy", mark: "" }],
      },
      {
        name: "Attractors",
        holdMs: 42000,
        sequence: [{ label: "Physarum attractors", mark: "" }],
      },
      {
        name: "Cluster Assembly",
        holdMs: 36000,
        sequence: [{ label: "Cluster assembly", mark: "" }],
      },
    ],
  },
  {
    id: "integration",
    index: "06",
    title: "Cluster Connection",
    stages: ["Cluster Assemblies", "Cluster Connection"],
    sequence: [
      { label: "Cluster Assemblies" },
      { label: "Cluster Connection" },
    ],
    pages: [
      {
        name: "Cluster Assemblies",
        holdMs: 36000,
        sequence: [{ label: "Cluster assemblies", mark: "" }],
      },
      {
        name: "Cluster Connection",
        holdMs: 36000,
        sequence: [{ label: "Cluster connection", mark: "" }],
      },
    ],
  },
  {
    id: "approach",
    index: "07",
    title: "Architectural Approach",
    stages: ["Massing", "Sections and Plans", "Renders"],
    sequence: [
      { label: "Massing" },
      { label: "Sections and Plans" },
      { label: "Renders" },
    ],
    pages: [
      {
        name: "Massing",
        holdMs: 28000,
        sequence: [{ label: "Massing", mark: "" }],
      },
      {
        name: "Sections and Plans",
        holdMs: 28000,
        sequence: [{ label: "Sections and plans", mark: "" }],
      },
      {
        name: "Renders",
        holdMs: 28000,
        sequence: [{ label: "Renders", mark: "" }],
      },
    ],
  },
];

/** Process Overview clusters, in board order, with their index in `DEMO_CHAPTERS`. */
export const DEMO_BOARD = DEMO_CHAPTERS.flatMap((chapter, index) => (chapter.video ? [] : [{ chapter, index }]));

/** Every presentation duration, in milliseconds. Tune here. */
export const DEMO_TIMING = {
  /** Full Process Overview before Chapter 01. */
  processOverviewMs: 12000,
  /** A chapter's centred sequence. */
  chapterOverviewMs: 10000,
  /** A chapter's focused explanation. */
  chapterFocusedMs: 18000,
  /** Cinematic introduction between chapters 01 and 02. The organism film only. */
  videoMs: ORGANISM_INTRO_SECONDS * 1000,
  /** Overview-to-focused move and content reveal. */
  transitionMs: 700,
  /** An operation brightening and growing as the light reaches it, and settling after. */
  litMs: 450,
} as const;
