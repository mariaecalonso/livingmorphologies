import type { FaceId } from "./contract";

/** One ranked face pair from the Skill 6 compatibility cache. The score is that cache's contact area. */
export type CompatibleFacePair = {
  faceA: FaceId;
  faceB: FaceId;
  score: number;
};

export const FACE_WORD: Record<FaceId, string> = {
  N: "North",
  S: "South",
  E: "East",
  W: "West",
  T: "Top",
  B: "Bottom",
};
