import { faceBook, type FaceId } from "./face-match";

const FACES: FaceId[] = ["E", "W", "N", "S", "T", "B"];
const SIDES: FaceId[] = ["E", "W", "N", "S"];

/** Direct join refuses a face with fewer than two opening cells. This count is not a compatibility score. */
export const DIRECT_OPENING_MINIMUM = 2;

export function faceOpenings(positions: ArrayLike<number>) {
  const book = faceBook(positions);
  return FACES.map((id) => ({ id, openings: book[id].openings }));
}

export function facesMeetingJoin(positions: ArrayLike<number>) {
  return faceOpenings(positions).filter((face) => face.openings >= DIRECT_OPENING_MINIMUM);
}

export function hasSideOpening(positions: ArrayLike<number>) {
  const book = faceBook(positions);
  return SIDES.some((id) => book[id].openings >= DIRECT_OPENING_MINIMUM);
}

export function hasTopOpening(positions: ArrayLike<number>) {
  return faceBook(positions).T.openings >= DIRECT_OPENING_MINIMUM;
}

/**
 * Keeps the compatibility ranking. A tile with a side opening is preferred only when it is within `gap` points of the best score.
 * An opening is not a verified connection between two placed tiles.
 */
export function chooseByScoreAndOpening<T extends { archetypeId: string; universal: number }>(
  options: readonly T[],
  hasOpening: (archetypeId: string) => boolean,
  gap = 15,
) {
  if (options.length === 0) return null;
  const best = Math.max(...options.map((item) => item.universal));
  const near = options.filter((item) => best - item.universal <= gap);
  const connectable = near.filter((item) => hasOpening(item.archetypeId));
  const pool = connectable.length > 0 ? connectable : options;
  return [...pool].sort((left, right) => right.universal - left.universal || left.archetypeId.localeCompare(right.archetypeId))[0];
}
