import type { IsoMesh } from "../scan/isomesh";
import { tileBounds } from "./connections";
import type { TileInstance } from "./tiles";

export type AxisSpan = {
  x: number;
  y: number;
  z: number;
  balance: number;
  dispersion: number;
  boxVolume: number;
};

export type AssemblyMeasures = {
  registration: AxisSpan;
  morphologyMesh: AxisSpan | null;
  shrinkWrap: (AxisSpan & { enclosedVolume: number; enclosureRatio: number }) | null;
  notes: string[];
};

function round(value: number) {
  return Math.round(value * 1000) / 1000;
}

export function spanFromBounds(minX: number, minY: number, minZ: number, maxX: number, maxY: number, maxZ: number): AxisSpan {
  const x = Math.max(0, maxX - minX);
  const y = Math.max(0, maxY - minY);
  const z = Math.max(0, maxZ - minZ);
  const longest = Math.max(x, y, z);
  const shortest = Math.min(x, y, z);
  const mean = (x + y + z) / 3;
  const dispersion = Math.sqrt(((x - mean) ** 2 + (y - mean) ** 2 + (z - mean) ** 2) / 3);
  return {
    x: round(x),
    y: round(y),
    z: round(z),
    balance: round(longest > 0 ? shortest / longest : 0),
    dispersion: round(dispersion),
    boxVolume: round(x * y * z),
  };
}

function accumulate(positions: ArrayLike<number>, into: { minX: number; minY: number; minZ: number; maxX: number; maxY: number; maxZ: number }) {
  for (let index = 0; index < positions.length; index += 3) {
    const x = positions[index] ?? 0;
    const y = positions[index + 1] ?? 0;
    const z = positions[index + 2] ?? 0;
    into.minX = Math.min(into.minX, x);
    into.minY = Math.min(into.minY, y);
    into.minZ = Math.min(into.minZ, z);
    into.maxX = Math.max(into.maxX, x);
    into.maxY = Math.max(into.maxY, y);
    into.maxZ = Math.max(into.maxZ, z);
  }
}

export function meshSpan(mesh: Pick<IsoMesh, "positions"> | { positions: ArrayLike<number> }): AxisSpan {
  const box = { minX: Infinity, minY: Infinity, minZ: Infinity, maxX: -Infinity, maxY: -Infinity, maxZ: -Infinity };
  accumulate(mesh.positions, box);
  return spanFromBounds(box.minX, box.minY, box.minZ, box.maxX, box.maxY, box.maxZ);
}

/** Signed tetrahedron volume. A non-watertight shrink wrap can under- or over-count. */
export function signedMeshVolume(mesh: Pick<IsoMesh, "positions" | "indices">) {
  const { positions, indices } = mesh;
  let volume = 0;
  for (let index = 0; index < indices.length; index += 3) {
    const a = indices[index] * 3;
    const b = indices[index + 1] * 3;
    const c = indices[index + 2] * 3;
    const ax = positions[a] ?? 0;
    const ay = positions[a + 1] ?? 0;
    const az = positions[a + 2] ?? 0;
    const bx = positions[b] ?? 0;
    const by = positions[b + 1] ?? 0;
    const bz = positions[b + 2] ?? 0;
    const cx = positions[c] ?? 0;
    const cy = positions[c + 1] ?? 0;
    const cz = positions[c + 2] ?? 0;
    volume += ax * (by * cz - bz * cy) + bx * (cy * az - cz * ay) + cx * (ay * bz - az * by);
  }
  return round(Math.abs(volume) / 6);
}

export function registrationSpan(tiles: readonly TileInstance[]): AxisSpan {
  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;
  for (const tile of tiles) {
    const box = tileBounds(tile);
    minX = Math.min(minX, box.min.x);
    minY = Math.min(minY, box.min.y);
    minZ = Math.min(minZ, box.min.z);
    maxX = Math.max(maxX, box.max.x);
    maxY = Math.max(maxY, box.max.y);
    maxZ = Math.max(maxZ, box.max.z);
  }
  return spanFromBounds(minX, minY, minZ, maxX, maxY, maxZ);
}

export function measureAssembly(
  tiles: readonly TileInstance[],
  morphologyMeshes: readonly { positions: ArrayLike<number> }[],
  film: IsoMesh | null,
): AssemblyMeasures {
  const morphology = { minX: Infinity, minY: Infinity, minZ: Infinity, maxX: -Infinity, maxY: -Infinity, maxZ: -Infinity };
  for (const mesh of morphologyMeshes) accumulate(mesh.positions, morphology);
  const morphologyMesh = Number.isFinite(morphology.minX)
    ? spanFromBounds(morphology.minX, morphology.minY, morphology.minZ, morphology.maxX, morphology.maxY, morphology.maxZ)
    : null;
  const wrap = film && film.triangles > 0 ? meshSpan(film) : null;
  const enclosedVolume = film && film.triangles > 0 ? signedMeshVolume(film) : 0;
  return {
    registration: registrationSpan(tiles),
    morphologyMesh,
    shrinkWrap: wrap
      ? {
          ...wrap,
          enclosedVolume,
          enclosureRatio: round(wrap.boxVolume > 0 ? enclosedVolume / wrap.boxVolume : 0),
        }
      : null,
    notes: [
      "Registration dimensions use the module registration envelope, not the carved mesh.",
      "Morphology mesh dimensions are the union of seated source meshes, without connectors.",
      "Enclosed volume is the signed volume of the current Shrink Wrap. The wrap closes small gaps and can leave larger openings outside the volume.",
    ],
  };
}
