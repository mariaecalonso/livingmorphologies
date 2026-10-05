import type { NaturalContinuation } from "./continuations";
import { DISPLAY_COUNT, representativeContinuations } from "./representatives";

/** Visible catalogue slots. The same count drives representative coverage. */
export const CATALOGUE_SLOT_COUNT = DISPLAY_COUNT;
export const CATALOGUE_COLUMNS = 4;
export const CATALOGUE_ROWS = 3;

/** World spacing between module centers. Wider than the 20 module so envelopes do not meet. */
export const CATALOGUE_PITCH = 23;
export const MODULE_HALF = 10;

export function catalogueSlots(continuations: readonly NaturalContinuation[], count = CATALOGUE_SLOT_COUNT) {
  return representativeContinuations(continuations, count);
}

/** Module center in the shared catalogue world. Index 0 is the near-left of a 4×3 field. */
export function catalogueOrigin(index: number, pitch = CATALOGUE_PITCH): [number, number, number] {
  const col = index % CATALOGUE_COLUMNS;
  const row = Math.floor(index / CATALOGUE_COLUMNS);
  const x = (col - (CATALOGUE_COLUMNS - 1) / 2) * pitch;
  const z = (row - (CATALOGUE_ROWS - 1) / 2) * pitch;
  return [x, 0, z];
}
