/** Plates drawn in one Stack column. The accepted sequence itself is not trimmed to this. */
export const STACK_DISPLAY_PLATES = 6;

/**
 * Indices of the accepted samples to draw.
 * The first is Z0 and the last is the final accepted sample.
 * Interior picks step as evenly as possible through the sequence.
 * Shorter sequences are returned whole. Samples are never repeated.
 */
export function stackDisplayIndices(count: number, plates = STACK_DISPLAY_PLATES) {
  if (count <= 0) return [];
  if (count <= plates) return Array.from({ length: count }, (_, index) => index);
  const interiorSlots = plates - 2;
  const used = new Set<number>([0, count - 1]);
  const interior: number[] = [];
  for (let slot = 1; slot <= interiorSlots; slot += 1) {
    const ideal = (slot * (count - 1)) / (plates - 1);
    let best = -1;
    let bestDistance = Infinity;
    for (let index = 1; index < count - 1; index += 1) {
      if (used.has(index)) continue;
      const distance = Math.abs(index - ideal);
      if (distance < bestDistance) {
        best = index;
        bestDistance = distance;
      }
    }
    if (best < 0) break;
    used.add(best);
    interior.push(best);
  }
  return [0, ...interior.sort((a, b) => a - b), count - 1];
}

/** Stack plates only. `z` stays the sample's position in the full accepted span. */
export function stackDisplaySlices<T>(slices: readonly T[], plates = STACK_DISPLAY_PLATES) {
  return stackDisplayIndices(slices.length, plates).map((index) => slices[index]);
}
