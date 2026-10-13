import type { IsoMesh } from "@/lib/scan/isomesh";
import { implicitInfluenceField, refineRepresentativeField } from "@/lib/skill3/final-refinement";
import {
  meshFromOpeningVolume,
  openingFieldVolume,
  type OpeningField,
  type VoidSample,
} from "@/lib/skill3/materialize";

const volumes = new Map<string, ReturnType<typeof openingFieldVolume>>();
const surfaces = new Map<string, IsoMesh>();

const stats = {
  volumeBuilds: 0,
  volumeHits: 0,
  surfaceBuilds: 0,
  surfaceHits: 0,
};

/** Field identity. Module size and threshold are not part of this key. */
export function openingVolumeKey(identity: string, field: OpeningField, sequence: string) {
  return `${identity}:${field}:${sequence}`;
}

/** Surface identity. Threshold and placement live here, not on the volume. */
export function openingSurfaceKey(volumeKey: string, mode: "isomesh" | "voxel", iso: number, sizeZ: number) {
  return `${volumeKey}:${mode}:${iso}:${sizeZ}`;
}

export function readOpeningMeshCache() {
  return { ...stats };
}

/**
 * Shared by Single and Compare. The volume is reused across thresholds.
 * Each view keeps its own threshold state and only asks for a surface.
 */
export function cachedOpeningMesh(
  samples: readonly VoidSample[],
  options: {
    identity: string;
    sequence: string;
    field: OpeningField;
    mode: "isomesh" | "voxel";
    iso: number;
    sizeZ: number;
    /** Derived preview. The raw surface for this identity stays cached beside it. */
    refine?: boolean;
  },
): IsoMesh {
  const volumeKey = openingVolumeKey(options.identity, options.field, options.sequence);
  let volume = volumes.get(volumeKey);
  if (volume) stats.volumeHits += 1;
  else {
    volume = openingFieldVolume(samples, options.field);
    volumes.set(volumeKey, volume);
    stats.volumeBuilds += 1;
  }
  const implicit = Boolean(options.refine && options.identity.includes(":vertical-void:"));
  const surfaceKey = `${openingSurfaceKey(volumeKey, options.mode, options.iso, options.sizeZ)}${options.refine ? (implicit ? ":refine-implicit-v3" : ":refine-v5") : ""}`;
  const cached = surfaces.get(surfaceKey);
  if (cached) {
    stats.surfaceHits += 1;
    return cached;
  }
  const source = !options.refine ? volume : implicit ? implicitInfluenceField(volume) : refineRepresentativeField(volume);
  const mesh = meshFromOpeningVolume(source, { mode: options.mode, iso: options.iso, sizeZ: options.sizeZ });
  surfaces.set(surfaceKey, mesh);
  stats.surfaceBuilds += 1;
  return mesh;
}
