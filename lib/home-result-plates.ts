import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { TYPOLOGIES } from "@/lib/catalog";
import type { HomeResultPreview, HomeResultSkill } from "@/lib/home-results";
import { loadSavedPicks } from "@/lib/skill2/saved-picks";

/** Two saved runs from each of the fifteen archetypes. */
const PHYSARUM_PLATES = 30;
/** One saved selection for each archetype. Vertical Propagation draws its stored modules in the frame. */
const CHOSEN_PLATES = 15;

export type HomeResultPlates = Partial<Record<HomeResultSkill["id"], readonly HomeResultPreview[]>>;

function safeFileName(id: string) {
  return id.replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 180);
}

function physarumPlates(): HomeResultPreview[] {
  const root = join(process.cwd(), "public", "shared-catalog");
  const plates: HomeResultPreview[] = [];
  for (const typology of TYPOLOGIES) {
    for (const archetype of typology.archetypes) {
      const directory = join(root, archetype.id);
      const index = join(directory, "entries.json");
      if (!existsSync(index)) continue;
      const entries = JSON.parse(readFileSync(index, "utf8")) as { id?: string; run?: number }[];
      let taken = 0;
      for (const entry of entries) {
        if (!entry.id || !existsSync(join(directory, `${safeFileName(entry.id)}.png`))) continue;
        plates.push({
          id: entry.id,
          src: `/shared-catalog/${archetype.id}/${safeFileName(entry.id)}.png`,
          alt: `${archetype.name}${entry.run ? `, run ${entry.run}` : ""}`,
        });
        taken += 1;
        if (taken === 2 || plates.length >= PHYSARUM_PLATES) break;
      }
      if (plates.length >= PHYSARUM_PLATES) return plates;
    }
  }
  return plates;
}

function optimizationPlates(): HomeResultPreview[] {
  const picks = new Map(loadSavedPicks().map((pick) => [pick.archetypeId, pick]));
  const plates: HomeResultPreview[] = [];
  for (const typology of TYPOLOGIES) {
    for (const archetype of typology.archetypes) {
      const pick = picks.get(archetype.id);
      if (!pick) continue;
      const file = join(process.cwd(), "public", "demo", "skill2", "previews", archetype.id, `${pick.candidateId}.webp`);
      if (!existsSync(file)) continue;
      plates.push({
        id: `${archetype.id}-${pick.candidateId}`,
        src: `/demo/skill2/previews/${archetype.id}/${pick.candidateId}.webp`,
        alt: `${archetype.name} ${pick.candidateId}`,
      });
      if (plates.length >= CHOSEN_PLATES) return plates;
    }
  }
  return plates;
}

/** The Results frame draws the stored Skill 3 modules itself. These slices are sections, not the modules. */
function verticalPlates(): HomeResultPreview[] {
  return [];
}

/** Real plates for the Results preview. */
export function loadHomeResultPlates(): HomeResultPlates {
  return {
    "skill-1": physarumPlates(),
    "skill-2": optimizationPlates(),
    "skill-3": verticalPlates(),
  };
}
