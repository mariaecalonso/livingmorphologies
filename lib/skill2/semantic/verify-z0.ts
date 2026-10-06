import type { SlimeControls } from "../../skill1/slime-controls";
import type { BiologicalTranslation, SimulationState } from "../../skill1/types";
import { captureZ0, decodeZ0, z0Checksum } from "./z0-snapshot";

const assert = (condition: boolean, message: string) => {
  if (!condition) throw new Error(message);
};

const rules = {
  translation: { archetypeId: "vertical-void", typologyId: "lobby" } as BiologicalTranslation,
  slime: { decay: 0.99, deposit: 0.2, foodPoints: [] } as SlimeControls,
  trailDecay: 0.986,
};

const state: SimulationState = {
  size: 2,
  trailSize: 2,
  iteration: 600,
  maxIterations: 600,
  converged: true,
  streak: 0,
  totalDelta: 0,
  seed: 1,
  source: { x: 0.25, y: 0.5 },
  attractor: { x: 1.5, y: 1.25 },
  attraction: [0.25, 0.5, 0.75, 1],
  permeabilityField: [0, 0, 0, 0],
  occupancy: [0, 0, 0, 0],
  trails: [0.25, 0.5, 0.75, 1],
  flow: [0, 0, 0, 0],
  agents: [
    { x: 0.5, y: 1, heading: 0.25, speed: 0.5, trailStrength: 0.25, hold: 2, pathX: [1, 2, 3], pathY: [4] },
  ],
};

const capture = captureZ0(state, rules);
assert(z0Checksum(capture.bin, rules) === capture.meta.validation.checksum, "checksum matches the captured state");
const decoded = decodeZ0(capture.bin, rules.trailDecay);
assert(decoded.iteration === 600, "iteration is restored");
assert(decoded.agents[0].speed === 0.5, "speed is in the snapshot");
assert(decoded.agents[0].hold === 2, "hold is in the snapshot");
assert(decoded.agents[0].trailStrength === 0.25, "trail strength is in the snapshot");
assert(decoded.agents[0].pathX.length === 0, "path history is not handed off");
assert(decoded.attractor.x === 1.5 && decoded.attraction[3] === 1, "attractor and attraction field are restored");
assert(decoded.converged === false && decoded.maxIterations > decoded.iteration, "continuation is not stopped by the evaluation cap");
const broken = new Uint8Array(capture.bin);
broken[28] ^= 0xff;
assert(z0Checksum(broken, rules) !== capture.meta.validation.checksum, "a changed trail fails the checksum");
const otherRules = { ...rules, trailDecay: 0.5 };
assert(z0Checksum(capture.bin, otherRules) !== capture.meta.validation.checksum, "changed rules fail the checksum");
console.log("z0 snapshot checks passed");
