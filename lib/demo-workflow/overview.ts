/**
 * Full Process Overview content. Stills in `/demo/overview/` are exported from the project:
 * Typology Analysis precedent diagrams, client studio, Lab and catalogue plates (`picks.json` order),
 * the Vertical Propagation Lab's Develop and Form panels, the Site Integration Lab plan (north up),
 * and frames of the live 3D renders (Results · Vertical Propagation, Hybrid final catalogue).
 *
 * `module-01.webp` through `module-15.webp` were written in one pass on 2026-10-28 by capturing
 * `figure.home-results-slot[aria-label] canvas` in DOM order. Only the Vertical Propagation figures
 * carry that label. `VerticalModules` in `components/home-results.tsx` renders `SITE_ARCHETYPES`,
 * which follows `data/skill3/final-selection.json`. That file is older than the stills, and all
 * fifteen canvases were present, so index 0 is the first validated handoff. The files are not renamed.
 */
import { SITE_ARCHETYPES } from "@/lib/skill5/catalog";

const STILL = "/demo/overview";

const numbered = (prefix: string, count: number) =>
  Array.from({ length: count }, (_, index) => `${STILL}/${prefix}-${String(index + 1).padStart(2, "0")}.webp`);

export const OVERVIEW_STILLS = {
  /** One precedent diagram per typology: Lobby Vertical Void, Workspace Open Hall, Gathering Amphitheater. */
  typologies: [`${STILL}/typology-lobby.webp`, `${STILL}/typology-workspace.webp`, `${STILL}/typology-gathering.webp`],
  colony: `${STILL}/physarum-colony.webp`,
  labRun: `${STILL}/lab-run-vertical-void.webp`,
  picks: numbered("pick", 15),
  /** `picks` index of the Vertical Void pick, the section that becomes Z0. */
  z0Pick: 0,
  z0: `${STILL}/z0-vertical-void.webp`,
  stack: `${STILL}/vertical-stack.webp`,
  /** Same Form model as `vertical-form.webp`, with the stage gradient removed. */
  form: `${STILL}/vertical-form-plain.webp`,
  modules: numbered("module", 15),
  /**
   * One still per Vertical Void continuation, N01–N24, from the open criteria-hybrid meshes.
   * Index 23 is N24, the handoff in `data/skill3/final-selection.json`.
   */
  voidContinuations: Array.from({ length: 24 }, (_, index) => `${STILL}/void-continuation-${String(index + 1).padStart(2, "0")}.png`),
  voidSelected: 23,
  client: [`${STILL}/client-fashion.webp`, `${STILL}/client-furniture.webp`],
  sitePlan: `${STILL}/site-plan.webp`,
  /** Site Integration lab model. The parcel outline and grid are picked out in copper. */
  siteModel: `${STILL}/site-model.png`,
  hybrids: Array.from({ length: 5 }, (_, index) => `${STILL}/hybrid-${index + 1}.webp`),
  /** Site Integration field. Not a saved module configuration. */
  siteField: `${STILL}/site-configuration.webp`,
} as const;

/** Validated handoff for each numbered module still. Same order as `SITE_ARCHETYPES`. */
export const MODULE_STILLS = OVERVIEW_STILLS.modules.map((src, index) => {
  const entry = SITE_ARCHETYPES[index];
  if (!entry) throw new Error(`module still ${index + 1} has no validated archetype`);
  return { src, name: entry.name, continuationId: entry.continuationId, moduleId: entry.moduleId };
});

/** Verified counts: archetype catalogue, Skill 2 catalogue and picks, Skill 3 runs and modules, Skill 4 final catalogue. */
export const OVERVIEW_FACTS = {
  archetypes: 15,
  criteria: 9,
  descriptors: 3,
  generations: 4,
  candidates: "1,285",
  picks: 15,
  /** Carved-mass continuations. Inserted Horizontal Plate's open set is N01–N48. */
  runsPerArchetype: 24,
  modules: 15,
  candidateField: "5 × 5",
  assemblies: 50,
  /** Studio site from `data/skill5/workplace-brief.json`. Not the parcel bounding box. */
  brief: "330 × 820",
  briefArea: "270,600",
} as const;

export const COMPARED_SYSTEMS = ["CA", "WFC", "Stigmergy"] as const;
export const PROGRAM = ["Workspace", "Lobby", "Gathering"] as const;
