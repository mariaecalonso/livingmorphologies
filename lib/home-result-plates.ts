import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { ARCHETYPES } from "@/lib/skill1/archetypes";
import type { HomeResultPreview, HomeResultSkill } from "@/lib/home-results";
import { loadShownCatalog } from "@/lib/skill2/published-catalog-view";
import type { EvolutionCandidateView } from "@/lib/skill2/evolution-index";

/** Presentation shows twelve. Desktop shows the first nine. */
const PLATE_COUNT = 12;

export type HomeResultPlates = Partial<Record<HomeResultSkill["id"], readonly HomeResultPreview[]>>;

function safeFileName(id: string) {
  return id.replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 180);
}

function shownCatalog(candidates: readonly EvolutionCandidateView[]) {
  const hasHidden = candidates.some((candidate) => candidate.catalogVisible === false);
  return candidates.filter((candidate) => {
    if (!candidate.image) return false;
    if (hasHidden) return candidate.catalogVisible === true;
    return candidate.archived;
  });
}

function physarumPlates(): HomeResultPreview[] {
  const root = join(process.cwd(), "public", "shared-catalog");
  const plates: HomeResultPreview[] = [];
  for (const archetype of Object.values(ARCHETYPES)) {
    if (plates.length >= PLATE_COUNT) break;
    const directory = join(root, archetype.id);
    const index = join(directory, "entries.json");
    if (!existsSync(index)) continue;
    const entries = JSON.parse(readFileSync(index, "utf8")) as { id?: string; run?: number }[];
    const entry = entries.find((item) => item.id && existsSync(join(directory, `${safeFileName(item.id)}.png`)));
    if (!entry?.id) continue;
    plates.push({
      id: entry.id,
      src: `/shared-catalog/${archetype.id}/${safeFileName(entry.id)}.png`,
      alt: `${archetype.name}${entry.run ? `, run ${entry.run}` : ""}`,
    });
  }
  return plates;
}

function optimizationPlates(): HomeResultPreview[] {
  const columns = loadShownCatalog().archetypes.map((archetype) => ({
    name: archetype.name,
    candidates: shownCatalog(archetype.candidates),
  }));
  const plates: HomeResultPreview[] = [];
  let row = 0;
  while (plates.length < PLATE_COUNT) {
    let added = false;
    for (const column of columns) {
      const candidate = column.candidates[row];
      if (!candidate?.image) continue;
      plates.push({
        id: candidate.key,
        src: candidate.image,
        alt: `${column.name} ${candidate.id}`,
      });
      added = true;
      if (plates.length >= PLATE_COUNT) break;
    }
    if (!added) break;
    row += 1;
  }
  return plates;
}

/** Real plates for the Results preview. Vertical stays empty. */
export function loadHomeResultPlates(): HomeResultPlates {
  return {
    "skill-1": physarumPlates(),
    "skill-2": optimizationPlates(),
  };
}
