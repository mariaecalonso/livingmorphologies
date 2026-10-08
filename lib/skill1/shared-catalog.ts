/** Repo-backed catalog so saved iterations can be pulled from git. */

export type SharedCatalogEntry = {
  id: string;
  archetypeId: string;
  run: number;
  seed: number;
  image?: string;
  [key: string]: unknown;
};

function imagePath(archetypeId: string, entryId: string) {
  return `/demo/skill1/${archetypeId}/${safeFileName(entryId)}.webp`;
}

function safeFileName(id: string) {
  return id.replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 180);
}

export async function readSharedCatalog<T extends SharedCatalogEntry>(archetypeId: string): Promise<T[]> {
  if (typeof fetch === "undefined") return [];
  try {
    const response = await fetch(`/demo/skill1/${archetypeId}/entries.json`, { cache: "no-store" });
    if (!response.ok) return [];
    const parsed = (await response.json()) as unknown;
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

export async function shareCatalogEntries<T extends SharedCatalogEntry>(
  _archetypeId: string,
  _incoming: Array<T & { imageBlob?: Blob }>,
): Promise<boolean> {
  return false;
}

export async function clearSharedCatalog(_archetypeId: string): Promise<boolean> {
  return false;
}

export function sharedImageFor(archetypeId: string, entryId: string) {
  return imagePath(archetypeId, entryId);
}
