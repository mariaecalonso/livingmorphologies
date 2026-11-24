import { readFileSync } from "node:fs";
import path from "node:path";
import type { FaceId } from "./contract";

export const HYBRID_CONNECTABLE_PATH = path.join(process.cwd(), "data", "skill6", "hybrid-connectable.json");

export type HybridConnectablePair = {
  archetypeA: string;
  archetypeB: string;
  faceA: FaceId;
  faceB: FaceId;
  approach: string;
  spacingProgram: string;
  spacing: number;
  validation: true;
  shrinkwrap: true;
  triangles: number;
};

export type HybridConnectableFile = {
  version: 1;
  pairs: HybridConnectablePair[];
  /** Workspace Top/Bottom bridges. Direct Skill 6 poses stay in the compatibility cache. */
  workspaceVertical: HybridConnectablePair[];
};

export function readHybridConnectable(file = HYBRID_CONNECTABLE_PATH): HybridConnectableFile {
  try {
    const parsed = JSON.parse(readFileSync(file, "utf8")) as HybridConnectableFile;
    if (parsed.version !== 1 || !Array.isArray(parsed.pairs)) return { version: 1, pairs: [], workspaceVertical: [] };
    return {
      version: 1,
      pairs: parsed.pairs,
      workspaceVertical: Array.isArray(parsed.workspaceVertical) ? parsed.workspaceVertical : [],
    };
  } catch {
    return { version: 1, pairs: [], workspaceVertical: [] };
  }
}
