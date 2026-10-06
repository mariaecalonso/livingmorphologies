/**
 * Which trail the inspection plate records.
 * The filament drawing is a later step. Scores and the phenotype grid keep the live trail.
 */

/**
 * Use the peak record when decay has left a much thinner picture than the
 * run actually deposited. A few leftover dots are not a drawing.
 */
const PEAK_GAIN = 1.65;
const PEAK_FLOOR = 0.008;

export function trailsForPreview(trails: ArrayLike<number>, displayTrails?: ArrayLike<number>) {
  if (!displayTrails || displayTrails.length !== trails.length) return trails;
  let live = 0;
  let peak = 0;
  for (let index = 0; index < trails.length; index += 1) {
    if (trails[index] > 1e-4) live += 1;
    if (displayTrails[index] > 1e-4) peak += 1;
  }
  if (peak > live * PEAK_GAIN && peak > trails.length * PEAK_FLOOR) return displayTrails;
  return trails;
}
