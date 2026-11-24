/**
 * Usable habitable floor-area design targets, in square feet.
 * Each value is the floor area of the cluster void. It is not a bounding box,
 * site area, gross building area, solid tile area, or envelope area.
 * A void outside the range can still be saved. The range is a generation
 * influence where one is already used, an evaluation value, and a catalog label.
 */
export const PROGRAM_AREA_SF: Record<string, { min: number; max: number }> = {
  "experimental-lobby": { min: 1000, max: 1800 },
  "public-lobby": { min: 1200, max: 2400 },
  "private-staff-lobby": { min: 400, max: 800 },
  "architecture-design-studio": { min: 2000, max: 3200 },
  "product-design-studio": { min: 1800, max: 3000 },
  "prototyping-fabrication-lab": { min: 2000, max: 3500 },
  "biological-research-lab": { min: 2000, max: 3500 },
  "interdisciplinary-collaboration-hub": { min: 1500, max: 2500 },
  "public-exhibition-gallery": { min: 1500, max: 3000 },
  "indoor-public-gathering": { min: 1500, max: 2500 },
  "waterfront-gathering": { min: 1200, max: 2500 },
  "public-restaurant": { min: 1500, max: 2500 },
  "staff-dining": { min: 700, max: 1200 },
};

export function programAreaRange(programId: string) {
  const range = PROGRAM_AREA_SF[programId];
  if (!range) throw new Error(`No habitable floor-area target is recorded for ${programId}.`);
  return range;
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
