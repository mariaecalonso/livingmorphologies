/**
 * Prototype Skill 3 module. Every future is placed in the same 20×20×20 frame
 * so morphologies can be compared directly. Sample Z stays a normalized
 * fraction of that fixed height.
 */

export const MODULE_SIZE_X = 20;
export const MODULE_SIZE_Y = 20;
export const MODULE_SIZE_Z = 20;
export const MODULE_Z_INCREMENT = MODULE_SIZE_Z;

/** Fixed prototype height. The vertical viewer always uses this. */
export const DEFAULT_MODULE_Z = MODULE_SIZE_Z;

export type ModuleEnvelope = {
  sizeX: typeof MODULE_SIZE_X;
  sizeY: typeof MODULE_SIZE_Y;
  sizeZ: number;
  zIncrement: typeof MODULE_Z_INCREMENT;
};

export function moduleEnvelope(sizeZ: number): ModuleEnvelope {
  if (!Number.isInteger(sizeZ) || sizeZ < MODULE_Z_INCREMENT || sizeZ % MODULE_Z_INCREMENT !== 0) {
    throw new Error(`sizeZ ${sizeZ} must be a multiple of ${MODULE_Z_INCREMENT}`);
  }
  return {
    sizeX: MODULE_SIZE_X,
    sizeY: MODULE_SIZE_Y,
    sizeZ,
    zIncrement: MODULE_Z_INCREMENT,
  };
}

/** Normalized u, v, w in [0, 1], with w the temporal sample height, to physical module coordinates. */
export function modulePoint(envelope: ModuleEnvelope, u: number, v: number, w: number): [number, number, number] {
  return [u * envelope.sizeX, v * envelope.sizeY, w * envelope.sizeZ];
}

/**
 * Accepted-sample Z is already normalized: 0 at the first sample, 1 at the last,
 * with the event gaps kept as fractions. Physical Z multiplies those fractions by the module height.
 */
export function physicalSampleZ(normalizedZ: readonly number[], sizeZ: number): number[] {
  const envelope = moduleEnvelope(sizeZ);
  return normalizedZ.map((z) => {
    if (!(z >= 0) || z > 1) throw new Error(`normalized Z ${z} is outside 0–1`);
    return z * envelope.sizeZ;
  });
}

/**
 * Column passed to the existing mesh camera so a module of this size stays in frame
 * when the view is tilted. The factor matches the fit term in the current isomesh viewer.
 */
export function moduleViewColumn(envelope: ModuleEnvelope) {
  return Math.max(envelope.sizeX, envelope.sizeY, envelope.sizeZ) * 4;
}
