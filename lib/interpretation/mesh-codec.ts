import type { EncodedMesh } from "./types";

export function encodeMesh(positions: Float32Array, indices: Uint32Array): EncodedMesh {
  const bytes = (view: ArrayBufferView) => Buffer.from(view.buffer, view.byteOffset, view.byteLength).toString("base64");
  return {
    positions: bytes(positions),
    indices: bytes(indices),
    triangles: indices.length / 3,
  };
}
