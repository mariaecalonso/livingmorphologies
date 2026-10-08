/**
 * Homepage Results preview.
 * A later merge should only need to change a skill's route, status, or preview source.
 * `href` points at the existing catalogue route. Leave `previews` empty until real catalogue images exist — the section keeps the frames.
 */

export type HomeResultStatus = "ready" | "pending";

export type HomeResultPreview = {
  id: string;
  src: string;
  alt: string;
};

export type HomeResultSkill = {
  id: "skill-1" | "skill-2" | "skill-3";
  number: string;
  name: string;
  catalogueTitle: string;
  status: HomeResultStatus;
  href: string | null;
  previews: readonly HomeResultPreview[];
};

export const HOME_RESULTS: readonly HomeResultSkill[] = [
  {
    id: "skill-1",
    number: "01",
    name: "Translation",
    catalogueTitle: "Physarum Catalog",
    status: "ready",
    href: "/lab/physarum/catalog",
    previews: [],
  },
  {
    id: "skill-2",
    number: "02",
    name: "2D Evolution",
    catalogueTitle: "Pareto Catalog",
    status: "ready",
    href: "/evolution/pareto-catalog",
    previews: [],
  },
  {
    id: "skill-3",
    number: "03",
    name: "Vertical Propagation",
    catalogueTitle: "Final Morphology Catalogue",
    status: "ready",
    href: "/lab/vertical/final",
    previews: [],
  },
];
