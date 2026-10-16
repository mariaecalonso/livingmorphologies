import { registrationEnvelope, VIEW_SCAN, type Skill4ModuleRecord, type Vec3 } from "./contract";
import type { Mat3 } from "./tile-basis";
import { adaptModule, catalogIdentity, type ModuleHandoff } from "./adapt";
import { scheduleSkill03Preflight } from "./geometry-preflight";

export type TileId = "A" | "B";

export type TileInstance = {
  instanceId: string;
  archetypeId: string;
  moduleId: string;
  transform: Vec3;
  rotationQuarter: 0 | 1 | 2 | 3;
  mirror: "x" | "y" | "z" | null;
  /** Full local-to-world rotation, including pitch and roll. Overrides quarter and mirror when set. */
  rotation?: Mat3;
  /** User Rotate 90, composed into rotationQuarter by face orientation. */
  manualQuarter?: 0 | 1 | 2 | 3;
  /** User mirror, composed into mirror by face orientation. */
  manualMirror?: "x" | "y" | "z" | null;
};

export const DEFAULT_TILE_ARCHETYPES: Record<TileId, string> = {
  A: "topographic-ground-field",
  B: "linear-gallery",
};

/**
 * Open distance between two connected registration faces.
 * The connector is generated across this gap. 0.45 is just under half a plan cell.
 */
export const HYBRID_GAP = 0.45;

export function envelopeWidth() {
  const box = registrationEnvelope(VIEW_SCAN.spacing, VIEW_SCAN.yaw);
  return box.max.x - box.min.x;
}

/** One registration cell plus the hybrid gap, so neighboring faces do not meet. */
export function tileStep(width = envelopeWidth()) {
  return width + HYBRID_GAP;
}

/** A stays on the registration origin. B occupies the next envelope to the east, across the hybrid gap. */
export function placedTransforms(width = envelopeWidth()): Record<TileId, Vec3> {
  return {
    A: { x: 0, y: 0, z: 0 },
    B: { x: tileStep(width), y: 0, z: 0 },
  };
}

export function loadModuleMap(records: readonly Skill4ModuleRecord[]) {
  const loaded = new Map<string, ModuleHandoff>();
  for (const record of records) loaded.set(record.archetypeId, adaptModule(record));
  scheduleSkill03Preflight(loaded);
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
