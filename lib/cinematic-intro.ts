/** Presentation film. The earlier introduction stays at /lab/physarum-video. */
export const CINEMATIC_INTRO = {
  href: "/lab/physarum-cinematic",
  label: "CINEMATIC",
} as const;

/** Retired composed sequence. It is not part of the organism introduction. */
export const FILM_SECONDS = 43;

/** Completed organism film. This is the cinematic introduction. */
export const ORGANISM_INTRO_SECONDS = 25.3;

export const FILM_WORDS = [
  { word: "EXPLORE", at: 11.15, tone: 392 },
  { word: "SENSE", at: 12.25, tone: 440 },
  { word: "MOVE", at: 13.35, tone: 494 },
  { word: "REINFORCE", at: 14.5, tone: 523 },
  { word: "ADAPT", at: 15.7, tone: 349 },
  { word: "REPEAT", at: 16.95, tone: 392 },
] as const;

/** Authentic project media. Drawn networks are a reading of the behavior, not saved simulation frames. */
export const FILM_MEDIA = {
  organism: "/demo/chapters/physarum-behavior.webp",
  colony: "/demo/overview/physarum-colony.webp",
  opening: "/physarum-organism-intro-candidate.mp4",
  forage: "/physarum-forage.mp4",
  detail: "/physarum-detail.mp4",
  lab: "/demo/overview/lab-run-vertical-void.webp",
  section: "/demo/overview/pick-01.webp",
  depth: "/demo/overview/z0-vertical-void.webp",
  form: "/demo/overview/vertical-form-plain.webp",
  lobby: "/demo/overview/typology-lobby.webp",
  workspace: "/demo/overview/typology-workspace.webp",
  gathering: "/demo/overview/typology-gathering.webp",
  tiles: [
    "/demo/overview/module-11.webp",
    "/demo/overview/module-01.webp",
    "/demo/overview/module-06.webp",
  ],
} as const;
