/**
 * Shared catalog color for the live Skill 1 hair.
 * Search, vein, and core are one warm body. Terracotta and teal stay on the interface.
 */
export type PhysarumInk = {
  /** 0 holds the thin threads dim. 1 lifts them toward warm white. */
  search: number;
  /** 0 keeps reinforced trails near the search color. 1 deepens that same body. */
  vein: number;
  /** 0 leaves dense nodes at the vein. 1 brightens them in that same body. */
  core: number;
};

export const DEFAULT_PHYSARUM_INK: PhysarumInk = {
  search: 0.72,
  vein: 0.55,
  core: 0.62,
};

let active: PhysarumInk = { ...DEFAULT_PHYSARUM_INK };

export function activePhysarumInk() {
  return active;
}

export function usePhysarumInk(ink: Partial<PhysarumInk>) {
  active = {
    search: clamp01(ink.search ?? active.search),
    vein: clamp01(ink.vein ?? active.vein),
    core: clamp01(ink.core ?? active.core),
  };
  return active;
}

function clamp01(value: number) {
  return Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));
}
