import { ARCHETYPES } from "@/lib/skill1/archetypes";
import { readCatalogSelection, snapshotMatchesSelection } from "@/lib/skill2/read-published-selection";
import { loadVerifiedZ0 } from "@/lib/skill2/semantic/z0-snapshot";
import type { ResolvedProcessSource } from "@/lib/skill3/selection";

/**
 * Reads one published Skill 2 candidate and its stored Z0.
 * Does not replay, persist, or sample continuations.
 */
export function readProcessSource(archetypeId: string, candidateId: number): ResolvedProcessSource | null {
  const selection = readCatalogSelection(archetypeId, candidateId);
  if (!selection) return null;
  const authored = Object.values(ARCHETYPES).find((item) => item.id === archetypeId);
  const archetypeName = authored?.name ?? archetypeId;
  try {
    const loaded = loadVerifiedZ0(archetypeId, candidateId);
    if (
      !loaded
      || loaded.meta.validation.algorithm !== "z0-sha256-v1"
      || !snapshotMatchesSelection(loaded.meta, selection)
    ) {
      return { selection, archetypeName: loaded?.meta.identity.archetypeName ?? archetypeName, handoff: "pending", z0Iteration: null, checksum: null };
    }
    return {
      selection,
      archetypeName: loaded.meta.identity.archetypeName,
      handoff: "verified",
      z0Iteration: loaded.meta.z0.iteration,
      checksum: loaded.meta.validation.checksum,
    };
  } catch {
    return { selection, archetypeName, handoff: "pending", z0Iteration: null, checksum: null };
  }
}

const Z0_DISPLAY = 256;

/** Display plate of the stored Skill 2 trail. The snapshot is only read. */
export function readPublishedZ0Plate(archetypeId: string, candidateId: number): {
  size: number;
  plate: string;
  candidateId: number;
  iteration: number;
  checksum: string;
  archetypeName: string;
} | null {
  if (!/^[a-z0-9-]+$/.test(archetypeId) || !Number.isInteger(candidateId) || candidateId < 1) return null;
  const loaded = loadVerifiedZ0(archetypeId, candidateId);
  if (!loaded || loaded.meta.identity.candidateId !== candidateId) return null;
  if (loaded.meta.validation.algorithm !== "z0-sha256-v1") return null;
  const trails = loaded.state.trails;
  const trailSize = loaded.state.trailSize;
  if (!Number.isInteger(trailSize) || trailSize < 1 || trails.length < trailSize * trailSize) return null;
  let peak = 0;
  for (let index = 0; index < trailSize * trailSize; index += 1) peak = Math.max(peak, trails[index] ?? 0);
  const out = new Uint8Array(Z0_DISPLAY * Z0_DISPLAY);
  const gain = peak > 0 ? 1 / peak : 0;
  for (let y = 0; y < Z0_DISPLAY; y += 1) {
    const y0 = Math.floor((y * trailSize) / Z0_DISPLAY);
    const y1 = Math.max(y0 + 1, Math.floor(((y + 1) * trailSize) / Z0_DISPLAY));
    for (let x = 0; x < Z0_DISPLAY; x += 1) {
      const x0 = Math.floor((x * trailSize) / Z0_DISPLAY);
      const x1 = Math.max(x0 + 1, Math.floor(((x + 1) * trailSize) / Z0_DISPLAY));
      let sum = 0;
      let count = 0;
      for (let yy = y0; yy < y1; yy += 1) {
        const row = yy * trailSize;
        for (let xx = x0; xx < x1; xx += 1) {
          sum += trails[row + xx] ?? 0;
          count += 1;
        }
      }
      const norm = count ? Math.min(1, Math.max(0, (sum / count) * gain)) : 0;
      out[y * Z0_DISPLAY + x] = Math.round(norm * 255);
    }
  }
  return {
    size: Z0_DISPLAY,
    plate: Buffer.from(out).toString("base64"),
    candidateId,
    iteration: loaded.meta.z0.iteration,
    checksum: loaded.meta.validation.checksum,
    archetypeName: loaded.meta.identity.archetypeName,
  };
}
