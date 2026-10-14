import type { IsoMesh } from "@/lib/scan/isomesh";

export type EncodedSolidifiedMesh = {
  positions: string;
  normals: string;
  indices: string;
  triangles: number;
};

export function solidifiedModuleId(archetypeId: string, candidateId: number, continuationId: string) {
  return `carved-mass:${archetypeId}:${candidateId}:${continuationId}`;
}

/** Client decode of the stored repaired module. This does not build a mesh. */
export function decodeSolidifiedMesh(geometry: EncodedSolidifiedMesh): IsoMesh {
  const bytes = (value: string) => Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
  const floats = (value: string) => {
    const raw = bytes(value);
    const copy = new Uint8Array(raw.byteLength);
    copy.set(raw);
    return new Float32Array(copy.buffer);
  };
  const ints = (value: string) => {
    const raw = bytes(value);
    const copy = new Uint8Array(raw.byteLength);
    copy.set(raw);
    return new Uint32Array(copy.buffer);
  };
  return {
    positions: floats(geometry.positions),
    normals: floats(geometry.normals),
    indices: ints(geometry.indices),
    triangles: geometry.triangles,
  };
}
