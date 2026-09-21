import { measureMorphology, measureMorphologyDetailed } from "./measurements";
import type { MorphologicalMeasurements } from "./types";
import type { SimulationState } from "../skill1/types";

function makeState(trailSize: number, size: number, trails: number[]): SimulationState {
  return {
    size,
    trailSize,
    iteration: 0,
    maxIterations: 1,
    converged: false,
    streak: 0,
    totalDelta: 0,
    seed: 1,
    source: { x: 1, y: 1 },
    attractor: { x: size / 2, y: size / 2 },
    attraction: new Array(size * size).fill(0),
    permeabilityField: new Array(size * size).fill(1),
    occupancy: new Array(size * size).fill(0),
    trails,
    flow: new Array(size * size).fill(0),
    agents: [],
  };
}

function paintRect(
  trails: number[],
  width: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  value: number,
) {
  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) {
      trails[y * width + x] = value;
    }
  }
}

function walk(measurements: unknown, path: string, visit: (path: string, value: number) => void) {
  if (typeof measurements === "number") {
    visit(path, measurements);
    return;
  }
  if (measurements && typeof measurements === "object") {
    for (const [key, value] of Object.entries(measurements)) {
      walk(value, path ? `${path}.${key}` : key, visit);
    }
  }
}

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

function assertFinite(measurements: MorphologicalMeasurements) {
  walk(measurements, "", (path, value) => {
    assert(Number.isFinite(value), `${path} is not finite: ${value}`);
  });
}

const SIZE = 8;
const TRAIL = 32;

const empty = makeState(TRAIL, SIZE, new Array(TRAIL * TRAIL).fill(0));
const emptyA = measureMorphology(empty);
const emptyB = measureMorphology(empty);
assert(JSON.stringify(emptyA) === JSON.stringify(emptyB), "empty field is not deterministic");
assertFinite(emptyA);
assert(emptyA.mass.concentrationCount === 0, "empty field should have no concentrations");
assert(emptyA.void.voidFraction === 1, "empty field should be all void");
assert(emptyA.connection.pairOpportunityCount === 0, "empty field has no concentration pairs");
assert(emptyA.void.boundaryOpenFraction === 1, "empty field boundary should be fully void");
assert(emptyA.activity.centerProximity === 0, "empty field has no activity centroid");
assert(emptyA.topology.anisotropy === 0, "empty field has no anisotropy");
assert(emptyA.connection.continuity === 1, "continuity sentinel remains 1 when pairs are absent");

const denseTrails = new Array(TRAIL * TRAIL).fill(0.9);
const dense = makeState(TRAIL, SIZE, denseTrails);
const denseM = measureMorphology(dense);
assertFinite(denseM);
assert(denseM.mass.totalMassFraction === 1, "uniform dense field should be all mass");
assert(denseM.void.voidFraction === 0, "uniform dense field should have no void");
assert(denseM.topology.connectedComponentCount === 1, "uniform dense field should be one component");

const twoBlobTrails = new Array(TRAIL * TRAIL).fill(0);
paintRect(twoBlobTrails, TRAIL, 2, 2, 10, 10, 1);
paintRect(twoBlobTrails, TRAIL, 22, 22, 30, 30, 1);
const twoBlobs = measureMorphologyDetailed(makeState(TRAIL, SIZE, twoBlobTrails));
assertFinite(twoBlobs.measurements);
assert(
  twoBlobs.measurements.topology.connectedComponentCount === 2,
  `expected 2 morphological components, got ${twoBlobs.measurements.topology.connectedComponentCount}`,
);
assert(
  twoBlobs.measurements.connection.branching === 0 ||
    twoBlobs.measurements.connection.branching < 1,
  "disconnected blobs should not look highly branched",
);
assert(
  twoBlobs.measurements.mass.concentrationCount === 2,
  `expected 2 concentrations, got ${twoBlobs.measurements.mass.concentrationCount}`,
);
assert(
  twoBlobs.measurements.connection.continuity === 0,
  "disconnected concentrations should have continuity 0",
);

const yTrails = new Array(TRAIL * TRAIL).fill(0);
paintRect(yTrails, TRAIL, 14, 2, 18, 18, 1);
paintRect(yTrails, TRAIL, 4, 16, 14, 20, 1);
paintRect(yTrails, TRAIL, 18, 16, 28, 20, 1);
const yShape = measureMorphologyDetailed(makeState(TRAIL, SIZE, yTrails));
assertFinite(yShape.measurements);
assert(
  yShape.measurements.topology.connectedComponentCount === 1,
  `Y-network should be one component, got ${yShape.measurements.topology.connectedComponentCount}`,
);
assert(
  yShape.summary.skeletonJunctions >= 1,
  `Y-network should have at least one skeleton junction, got ${yShape.summary.skeletonJunctions}`,
);
assert(
  yShape.measurements.connection.branching >
    twoBlobs.measurements.connection.branching,
  "branching must be distinct from fragmentation: Y-network branching should exceed two-blob branching",
);

const platformTrails = new Array(TRAIL * TRAIL).fill(0);
paintRect(platformTrails, TRAIL, 4, 8, 28, 12, 1);
const platform = measureMorphology(makeState(TRAIL, SIZE, platformTrails));
assertFinite(platform);
assert(platform.occupation.supportCount >= 1, "horizontal bar with void above should yield support potential");

const dumbbellTrails = new Array(TRAIL * TRAIL).fill(0);
paintRect(dumbbellTrails, TRAIL, 2, 12, 10, 20, 1);
paintRect(dumbbellTrails, TRAIL, 22, 12, 30, 20, 1);
paintRect(dumbbellTrails, TRAIL, 10, 15, 22, 17, 0.2);
const dumbbell = measureMorphology(makeState(TRAIL, SIZE, dumbbellTrails));
assertFinite(dumbbell);
assert(
  dumbbell.mass.concentrationCount === 2,
  `dumbbell should have 2 concentrations, got ${dumbbell.mass.concentrationCount}`,
);
assert(dumbbell.connection.bridgeCount >= 1, "thin corridor between concentrations should be a bridge");
assert(dumbbell.connection.continuity === 1, "bridged concentrations should be continuous");
assert(
  dumbbell.topology.connectedComponentCount === 1,
  "bridged concentrations should be one morphological component",
);

const centerTrails = new Array(TRAIL * TRAIL).fill(0);
paintRect(centerTrails, TRAIL, 12, 12, 20, 20, 1);
const cornerTrails = new Array(TRAIL * TRAIL).fill(0);
paintRect(cornerTrails, TRAIL, 0, 0, 8, 8, 1);
const centerM = measureMorphology(makeState(TRAIL, SIZE, centerTrails));
const cornerM = measureMorphology(makeState(TRAIL, SIZE, cornerTrails));
assert(
  centerM.activity.centerProximity > cornerM.activity.centerProximity,
  "centered mass should have higher centerProximity than a corner mass",
);
assert(
  centerM.mass.dominantCenterProximity > cornerM.mass.dominantCenterProximity,
  "centered mass should have higher dominantCenterProximity",
);

const barTrails = new Array(TRAIL * TRAIL).fill(0);
paintRect(barTrails, TRAIL, 2, 14, 30, 18, 1);
const barM = measureMorphology(makeState(TRAIL, SIZE, barTrails));
assert(barM.topology.anisotropy > centerM.topology.anisotropy, "elongated bar should be more anisotropic than a compact square");
assert(barM.void.boundaryOpenFraction > denseM.void.boundaryOpenFraction, "open edges should exceed a fully dense field");

const unequalTrails = new Array(TRAIL * TRAIL).fill(0);
paintRect(unequalTrails, TRAIL, 1, 1, 6, 6, 1);
paintRect(unequalTrails, TRAIL, 18, 18, 30, 30, 1);
const unequal = measureMorphology(makeState(TRAIL, SIZE, unequalTrails));
assert(twoBlobs.measurements.mass.sizeRegularity > unequal.mass.sizeRegularity, "equal blobs should be more size-regular than unequal blobs");

const sameState = makeState(TRAIL, SIZE, yTrails);
assert(
  JSON.stringify(measureMorphology(sameState)) === JSON.stringify(measureMorphology(sameState)),
  "same SimulationState must produce the same measurements",
);

console.log("skill2 morphological measurements: ok");
console.log(
  [
    `empty voidFraction=${emptyA.void.voidFraction}`,
    `twoBlobs components=${twoBlobs.measurements.topology.connectedComponentCount} branching=${twoBlobs.measurements.connection.branching}`,
    `yShape components=${yShape.measurements.topology.connectedComponentCount} branching=${yShape.measurements.connection.branching} junctions=${yShape.summary.skeletonJunctions}`,
    `platform supports=${platform.occupation.supportCount}`,
    `dumbbell bridges=${dumbbell.connection.bridgeCount} continuity=${dumbbell.connection.continuity}`,
  ].join("\n"),
);
