/**
 * Skill 04 architectural scale.
 * Tiles are authored inside a 20 ft × 20 ft × 20 ft module.
 * Registered meshes already occupy that cube in model coordinates
 * (about −10 to 10 on each axis), so 1 model unit = 1 foot.
 */
export const MODULE_FEET = 20;
export const FEET_PER_MODEL_UNIT = 1;

export function modelUnitsToFeet(units: number) {
  return units * FEET_PER_MODEL_UNIT;
}

export function feetToModelUnits(feet: number) {
  return feet / FEET_PER_MODEL_UNIT;
}

export function squareModelUnitsToSquareFeet(area: number) {
  return area * FEET_PER_MODEL_UNIT * FEET_PER_MODEL_UNIT;
}

export function cubicModelUnitsToCubicFeet(volume: number) {
  return volume * FEET_PER_MODEL_UNIT * FEET_PER_MODEL_UNIT * FEET_PER_MODEL_UNIT;
}
