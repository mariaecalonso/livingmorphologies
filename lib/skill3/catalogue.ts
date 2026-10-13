import type { NaturalContinuation } from "./continuations";

/** One field for the full continuation set. Six by four keeps the previews larger than an eight-by-three row on this wide view. */
export const CATALOGUE_COLUMNS = 6;
export const CATALOGUE_ROWS = 4;

/** World spacing between module centers. Wider than the 20 module so envelopes do not meet. */
export const CATALOGUE_PITCH = 23;
export const MODULE_HALF = 10;

/** Every continuation, in id order. This does not rank or drop any branch. */
export function catalogueSlots(continuations: readonly NaturalContinuation[]) {
  return [...continuations].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/** Module center in the shared catalogue world. Index 0 is the left of the back row. */
export function catalogueOrigin(index: number, pitch = CATALOGUE_PITCH): [number, number, number] {
  const col = index % CATALOGUE_COLUMNS;
  const row = Math.floor(index / CATALOGUE_COLUMNS);
  const x = (col - (CATALOGUE_COLUMNS - 1) / 2) * pitch;
  const z = (row - (CATALOGUE_ROWS - 1) / 2) * pitch;
  return [x, 0, z];
}
