/** Demo Workflow chapters and the methodological sequence each one presents. */

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
    title: "2D Generative Development",
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
        name: "Physarum Logic",
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
        name: "Optimization",
        holdMs: 72000,
        sequence: [{ label: "Optimization", mark: "" }],
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
    ],
    pages: [
      {
        name: "Process",
        holdMs: 100000,
        sequence: [{ label: "Process", mark: "01" }],
      },
      {
        name: "Catalog",
        holdMs: 78000,
        sequence: [{ label: "Catalog", mark: "02" }],
      },
      {
        name: "Final View",
        sequence: [{ label: "Final Morphology Catalogue" }],
      },
    ],
  },
  {
    id: "context",
    index: "04",
    title: "Design Context",
    stages: ["The Client", "Site Analysis", "Site Integration"],
    sequence: [
      { label: "Client" },
      { label: "Site Analysis" },
      { label: "Site Integration" },
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
        name: "Site Integration",
        holdMs: 52000,
        sequence: [{ label: "Site Integration", mark: "" }],
      },
    ],
  },
  {
    id: "integration",
    index: "05",
    title: "Architectural Integration",
    stages: ["Hybrid Connection", "Site Integration"],
    sequence: [
      { label: "Selected Modules" },
      { label: "Hybrid Generation" },
      { label: "Assembly Catalog" },
      { label: "Site Configuration", twoWay: true },
      { label: "Comparative Evaluation", feature: "Lab run" },
    ],
    pages: [
      {
        name: "Hybrid Connection",
        holdMs: 80000,
        sequence: [{ label: "Hybrid connection", mark: "" }],
      },
      {
        name: "Catalog",
        holdMs: 42000,
        sequence: [{ label: "Catalog", mark: "" }],
      },
      {
        name: "Site",
        holdMs: 48000,
        sequence: [{ label: "Site", mark: "" }],
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
  /** The Physarum video between chapters 01 and 02. */
  videoMs: 40000,
  /** Overview-to-focused move and content reveal. */
  transitionMs: 700,
  /** An operation brightening and growing as the light reaches it, and settling after. */
  litMs: 450,
} as const;
