import type { Skill4ModuleRecord } from "@/lib/skill4/contract";

const cache = new Map<string, Promise<Skill4ModuleRecord | null>>();

/** One in-flight read per archetype. A failed read is not kept, so a later open can try again. */
export function loadSkill4Handoff(archetypeId: string): Promise<Skill4ModuleRecord | null> {
  const existing = cache.get(archetypeId);
  if (existing) return existing;
  const pending = fetch(`/api/skill4/handoff?archetype=${encodeURIComponent(archetypeId)}&cell=20`, { cache: "no-store" })
    .then(async (response) => (response.ok ? response.json() as Promise<Skill4ModuleRecord> : null))
    .then((record) => {
      if (!record?.geometry || record.archetypeId !== archetypeId) {
        cache.delete(archetypeId);
        return null;
      }
      return record;
    })
    .catch(() => {
      cache.delete(archetypeId);
      return null;
    });
  cache.set(archetypeId, pending);
  return pending;
}
