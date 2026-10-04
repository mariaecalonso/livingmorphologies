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
  return `/shared-catalog/${archetypeId}/${safeFileName(entryId)}.png`;
}

function safeFileName(id: string) {
  return id.replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 180);
}

export async function readSharedCatalog<T extends SharedCatalogEntry>(archetypeId: string): Promise<T[]> {
  if (typeof fetch === "undefined") return [];
  try {
    const response = await fetch(`/shared-catalog/${archetypeId}/entries.json`, { cache: "no-store" });
    if (!response.ok) return [];
    const parsed = (await response.json()) as unknown;
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

async function toDataUrl(image: string): Promise<string> {
  if (image.startsWith("data:")) return image;
  const response = await fetch(image);
  const blob = await response.blob();
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

export async function shareCatalogEntries<T extends SharedCatalogEntry>(
  archetypeId: string,
  incoming: Array<T & { imageBlob?: Blob }>,
): Promise<boolean> {
  if (typeof fetch === "undefined" || !incoming.length) return true;
  for (let index = 0; index < incoming.length; index += 2) {
    const batch = [];
    for (const item of incoming.slice(index, index + 2)) {
      try {
        const image = item.imageBlob
          ? await blobToDataUrl(item.imageBlob)
          : item.image
            ? await toDataUrl(item.image)
            : "";
        if (!image.startsWith("data:")) continue;
        const { imageBlob: _blob, ...meta } = item;
        batch.push({ ...meta, image });
      } catch {
        /* skip a frame that cannot be encoded */
      }
    }
    if (!batch.length) continue;
    const response = await fetch("/api/shared-catalog", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ archetypeId, entries: batch }),
    });
    if (!response.ok) return false;
  }
  return true;
}

export async function clearSharedCatalog(archetypeId: string): Promise<boolean> {
  if (typeof fetch === "undefined" || !archetypeId) return true;
  try {
    const response = await fetch(`/api/shared-catalog?archetypeId=${encodeURIComponent(archetypeId)}`, { method: "DELETE" });
    return response.ok;
  } catch {
    return false;
  }
}

export function sharedImageFor(archetypeId: string, entryId: string) {
  return imagePath(archetypeId, entryId);
}
