import { stateChecksum } from "../skill2/handoff";
import {
  DEFAULT_ADAPTIVE_HORIZON,
  developmentalKinds,
  directionDelta,
  horizonDecision,
  resolveAdaptiveHorizon,
  stabilizedHorizon,
  type AdaptiveHorizonSample,
} from "./adaptive-horizon";
import { MODULE_SIZE_X, MODULE_SIZE_Y, MODULE_SIZE_Z } from "./envelope";
import { openVerifiedSemanticHandoff } from "./semantic-handoff";

const assert = (condition: boolean, message: string) => {
  if (!condition) throw new Error(message);
};
const ok = (message: string) => console.log(`ok  ${message}`);

assert(MODULE_SIZE_X === 20 && MODULE_SIZE_Y === 20 && MODULE_SIZE_Z === 20, "the physical module stays 20×20×20");
assert(DEFAULT_ADAPTIVE_HORIZON.minimum === 64, "minimum horizon is 64");
assert(DEFAULT_ADAPTIVE_HORIZON.cap === 400, "diagnostic cap is 400");
assert(DEFAULT_ADAPTIVE_HORIZON.quietWindow === 24, "quiet window is the max-gap of 24");
assert(DEFAULT_ADAPTIVE_HORIZON.openChange === 800 && DEFAULT_ADAPTIVE_HORIZON.directionChange === 8, "event thresholds stay in one config");
assert(directionDelta(170, -170) === 20, "direction change wraps across ±180°");
assert(stabilizedHorizon(62, DEFAULT_ADAPTIVE_HORIZON) === 86, "a developmental offset of 62 plus one max-gap is 86");
assert(stabilizedHorizon(10, DEFAULT_ADAPTIVE_HORIZON) === 64, "the buffer never resolves below 64");

const previous: AdaptiveHorizonSample = {
  iteration: 600,
  offset: 0,
  reason: "z0",
  components: 2,
  open: 1000,
  growthDirection: null,
};
assert(developmentalKinds(previous, { reason: "max-gap", components: 1, open: 0, growthDirection: 90 }, DEFAULT_ADAPTIVE_HORIZON).length === 0, "a max-gap sample is not developmental");
assert(
  developmentalKinds(
    { ...previous, growthDirection: 0 },
    { reason: "threshold", components: 2, open: 1000, growthDirection: 7.9 },
    DEFAULT_ADAPTIVE_HORIZON,
  ).length === 0,
  "a threshold sample without a meaningful event is not developmental",
);
assert(
  developmentalKinds(previous, { reason: "threshold", components: 1, open: 1000, growthDirection: null }, DEFAULT_ADAPTIVE_HORIZON).join(",") === "components",
  "a component change on a threshold sample is developmental",
);
assert(
  developmentalKinds(previous, { reason: "threshold", components: 2, open: 199, growthDirection: null }, DEFAULT_ADAPTIVE_HORIZON).join(",") === "opening",
  "an interior change of 800 pixels is developmental",
);
assert(
  developmentalKinds(
    { ...previous, growthDirection: 0 },
    { reason: "threshold", components: 2, open: 1000, growthDirection: 8 },
    DEFAULT_ADAPTIVE_HORIZON,
  ).join(",") === "direction",
  "an 8° growth-direction change is developmental",
);

const quiet: AdaptiveHorizonSample[] = [
  previous,
  { iteration: 662, offset: 62, reason: "threshold", components: 1, open: 1000, growthDirection: -96 },
  { iteration: 695, offset: 95, reason: "threshold", components: 1, open: 1000, growthDirection: -90 },
];
const settled = horizonDecision(quiet, [{ iteration: 662, offset: 62, kind: "components" }], 95, DEFAULT_ADAPTIVE_HORIZON);
assert(settled.status === "STABILIZED" && settled.resolvedHorizon === 86 && settled.lastDevelopmentalOffset === 62, "a quiet window after offset 62 resolves to 86");
const active = horizonDecision(
  [...quiet, { iteration: 1000, offset: 400, reason: "threshold", components: 4, open: 1000, growthDirection: -120 }],
  [{ iteration: 997, offset: 397, kind: "components" }],
  400,
  DEFAULT_ADAPTIVE_HORIZON,
);
assert(active.status === "ACTIVE_AT_CAP" && active.resolvedHorizon === 400, "development inside the last max-gap stays at the cap");
ok("horizon decision");

function report(label: string, archetypeId: string, candidateId: number, expected: "STABILIZED" | "ACTIVE_AT_CAP") {
  const opened = openVerifiedSemanticHandoff({ archetypeId, candidateId });
  if (!opened) throw new Error(`missing ${label}`);
  const before = stateChecksum(opened.handoff.selected.simulationState);
  const result = resolveAdaptiveHorizon({ archetypeId, candidateId });
  const after = stateChecksum(opened.handoff.selected.simulationState);
  assert(after === before, `${label} changed verified Z0`);
  assert(result.status === expected, `${label} status ${result.status}`);
  assert(result.resolvedHorizon >= DEFAULT_ADAPTIVE_HORIZON.minimum && result.resolvedHorizon <= DEFAULT_ADAPTIVE_HORIZON.cap, `${label} horizon ${result.resolvedHorizon} is outside 64–400`);
  if (expected === "STABILIZED") {
    assert(result.resolvedHorizon < DEFAULT_ADAPTIVE_HORIZON.cap, `${label} stabilized at the cap`);
    assert(result.resolvedHorizon === stabilizedHorizon(result.lastDevelopmentalOffset, DEFAULT_ADAPTIVE_HORIZON), `${label} horizon is not the last event plus one max-gap`);
    assert(result.lastDevelopmentalOffset > 0 && result.lastDevelopmentalOffset + DEFAULT_ADAPTIVE_HORIZON.quietWindow <= result.resolvedHorizon, `${label} stopped before its developmental window`);
  } else {
    assert(result.resolvedHorizon === DEFAULT_ADAPTIVE_HORIZON.cap, `${label} did not stay at the cap`);
    assert(result.lastDevelopmentalOffset + DEFAULT_ADAPTIVE_HORIZON.quietWindow > DEFAULT_ADAPTIVE_HORIZON.cap, `${label} had room to stabilize inside the cap`);
  }
  const counts = { components: 0, opening: 0, direction: 0 };
  for (const event of result.developmentalEvents) counts[event.kind] += 1;
  const last = result.developmentalEvents[result.developmentalEvents.length - 1];
  console.log(JSON.stringify({
    label,
    z0Iteration: opened.handoff.selected.simulationState.iteration,
    checksum: before,
    resolvedHorizon: result.resolvedHorizon,
    status: result.status,
    lastDevelopmentalOffset: result.lastDevelopmentalOffset,
    lastDevelopmentalIteration: last?.iteration ?? opened.handoff.selected.simulationState.iteration,
    acceptedSamples: result.acceptedSamples.length,
    events: counts,
    module: [MODULE_SIZE_X, MODULE_SIZE_Y, MODULE_SIZE_Z],
  }));
  ok(label);
}

report("vertical-void 174", "vertical-void", 174, "STABILIZED");
report("compressed-sequential 4", "compressed-sequential", 4, "ACTIVE_AT_CAP");
ok("verified Z0 checksums held and no catalogue was written");
