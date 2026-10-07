import { existsSync } from "node:fs";
import { join } from "node:path";

/** Skill 2 catalogs. Skill 3 reads one chosen candidate from here. */
export const SEMANTIC_RUN_ROOT = "data/semantic-runs";

/** Local runs first. The set-aside folder is the kept copy from the other machine. */
export function semanticRunRoots() {
  const roots = [SEMANTIC_RUN_ROOT];
  const home = process.env.USERPROFILE || process.env.HOME || "";
  const aside = join(home, "Desktop", "living-morphologies-set-aside", "data", "semantic-runs");
  if (existsSync(aside)) roots.push(aside);
  return roots;
}

export function semanticRunFile(...parts: string[]) {
  for (const root of semanticRunRoots()) {
    const path = join(root, ...parts);
    if (existsSync(path)) return path;
  }
  return null;
}
