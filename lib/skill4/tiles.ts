import { registrationEnvelope, VIEW_SCAN, type Skill4ModuleRecord, type Vec3 } from "./contract";
import { adaptModule, catalogIdentity, type ModuleHandoff } from "./adapt";

export type TileId = "A" | "B";

export type TileInstance = {
  instanceId: string;
  archetypeId: string;
  moduleId: string;
  transform: Vec3;
  rotationQuarter: 0 | 1 | 2 | 3;
  mirror: "x" | "y" | "z" | null;
};

export const DEFAULT_TILE_ARCHETYPES: Record<TileId, string> = {
  A: "topographic-ground-field",
  B: "linear-gallery",
};

export function envelopeWidth() {
  const box = registrationEnvelope(VIEW_SCAN.spacing, VIEW_SCAN.yaw);
  return box.max.x - box.min.x;
}

/** A stays on the registration origin. B occupies the next envelope to the east. */
export function placedTransforms(width = envelopeWidth()): Record<TileId, Vec3> {
  return {
    A: { x: 0, y: 0, z: 0 },
    B: { x: width, y: 0, z: 0 },
  };
}

export function loadModuleMap(records: readonly Skill4ModuleRecord[]) {
  const loaded = new Map<string, ModuleHandoff>();
  for (const record of records) loaded.set(record.archetypeId, adaptModule(record));
  return loaded;
}

export function unavailableModule(archetypeId: string): ModuleHandoff {
  const identity = catalogIdentity(archetypeId);
  if (!identity) throw new Error(`unknown archetype: ${archetypeId}`);
  return adaptModule({
    contract: "skill4-module-v1",
    moduleId: `skill03:${archetypeId}@0`,
    revision: 1,
    archetypeId,
    source: "skill03",
    provisional: true,
    selectedFinal: false,
    scan: {
      seed: VIEW_SCAN.seed,
      iso: VIEW_SCAN.iso,
      spacing: VIEW_SCAN.spacing,
      yaw: VIEW_SCAN.yaw,
      slices: 24,
      stepsBetweenSlices: 22,
      stoppedOnConverged: false,
    },
    registration: registrationEnvelope(VIEW_SCAN.spacing, VIEW_SCAN.yaw),
    geometry: null,
    provenance: {
      role: "skill03-output",
      note: "No Skill 03 module is stored for this archetype.",
    },
  });
}

/** Uses a loaded fixture when one exists. Never copies another archetype's mesh. */
export function resolveTileModule(archetypeId: string, loaded: ReadonlyMap<string, ModuleHandoff>) {
  return loaded.get(archetypeId) ?? unavailableModule(archetypeId);
}

export function initialTiles(loaded: ReadonlyMap<string, ModuleHandoff>): TileInstance[] {
  const place = placedTransforms();
  return (["A", "B"] as const).map((instanceId) => {
    const archetypeId = DEFAULT_TILE_ARCHETYPES[instanceId];
    const handoff = resolveTileModule(archetypeId, loaded);
    return {
      instanceId,
      archetypeId,
      moduleId: handoff.moduleId,
      transform: place[instanceId],
      rotationQuarter: 0,
      mirror: null,
    };
  });
}
