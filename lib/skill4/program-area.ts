/** Usable habitable floor-area targets, in square feet. Edit the ranges here. */
export const PROGRAM_AREA_SF: Record<string, { min: number; max: number }> = {
  "public-lobby": { min: 1200, max: 2400 },
  "private-staff-lobby": { min: 400, max: 800 },
  "architecture-design-studio": { min: 1800, max: 3000 },
  "product-design-studio": { min: 1600, max: 2800 },
  "prototyping-fabrication-lab": { min: 1800, max: 3200 },
  "biological-research-lab": { min: 1800, max: 3000 },
  "interdisciplinary-collaboration-hub": { min: 1200, max: 2200 },
  "public-exhibition-gallery": { min: 1500, max: 3000 },
};

/** Gathering programs that are not named above. */
const GATHERING_DEFAULT_SF = { min: 900, max: 1800 };

export function programAreaRange(programId: string) {
  return PROGRAM_AREA_SF[programId] ?? GATHERING_DEFAULT_SF;
}

export type AreaStanding = "within" | "below" | "above";

/** Where a measured void sits against the program range. This does not accept or reject a cluster. */
export function areaStanding(squareFeet: number, range: { min: number; max: number }): AreaStanding {
  if (squareFeet < range.min) return "below";
  if (squareFeet > range.max) return "above";
  return "within";
}

export function areaStandingLabel(standing: AreaStanding) {
  if (standing === "below") return "Below Target";
  if (standing === "above") return "Above Target";
  return "Within Target";
}

/** Inside this band, or this close to it, the void is near the program target. */
export function areaNearTarget(squareFeet: number, range: { min: number; max: number }) {
  return squareFeet >= range.min * 0.9 && squareFeet <= range.max * 1.1;
}

export function areaFarAbove(squareFeet: number, range: { min: number; max: number }) {
  return squareFeet > range.max * 1.1;
}
