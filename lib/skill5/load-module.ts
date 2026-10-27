import { decodeSolidifiedMesh, type EncodedSolidifiedMesh } from "@/lib/skill3/solidified-mesh";
import type { IsoMesh } from "@/lib/scan/isomesh";
/** Reads one stored Skill 3 module through the existing solidified route. The ids are the saved reference, not a later final selection. */
export async function loadArchetypeMesh(entry: {
  archetypeId: string;
  candidateId: number;
  continuationId: string;
  moduleId: string;
}, signal: AbortSignal): Promise<IsoMesh | null> {
  const params = new URLSearchParams({
    archetype: entry.archetypeId,
    candidate: String(entry.candidateId),
    continuation: entry.continuationId,
  });
  const response = await fetch(`/api/vertical/solidified?${params}`, { signal });
  if (!response.ok) return null;
  const body = await response.json() as {
    source?: string;
    moduleId?: string;
    geometry?: EncodedSolidifiedMesh;
  };
  if (body.source !== "carved-mass-solidified" || body.moduleId !== entry.moduleId || !body.geometry) return null;
  if (body.geometry.triangles < 1) return null;
  return decodeSolidifiedMesh(body.geometry);
}
