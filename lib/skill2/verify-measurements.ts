import { measureMorphology, measureMorphologyDetailed, buildInteriorMask } from "./measurements";
import { SKILL1_EDGE_SUPPRESSION_MARGIN } from "./measurement-config";
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

assert(emptyA.analysis.edgeSuppressionMargin === SKILL1_EDGE_SUPPRESSION_MARGIN, "analysis margin must match Skill 1 edge suppression");
assert(emptyA.void.maxOpenSpan <= emptyA.analysis.interiorExtent + 1e-6, "empty-field maxOpenSpan must not exceed interior extent");
assert(emptyA.proportion.insufficientElements === 1, "empty field has too few comparable elements for CV");

const ringFilledTrails = new Array(TRAIL * TRAIL).fill(0);
const interiorMask = buildInteriorMask(TRAIL, TRAIL, SIZE, SKILL1_EDGE_SUPPRESSION_MARGIN);
for (let i = 0; i < interiorMask.length; i += 1) {
  if (interiorMask[i]) ringFilledTrails[i] = 1;
}
const ringFilled = measureMorphology(makeState(TRAIL, SIZE, ringFilledTrails));
assert(ringFilled.void.maxOpenSpan < SIZE * 0.5, `filled interior must not inherit full-field void span, got ${ringFilled.void.maxOpenSpan}`);
assert(ringFilled.void.boundaryOpenFraction < 0.25, `filled interior inner perimeter must not be open from empty ring, got ${ringFilled.void.boundaryOpenFraction}`);
assert(ringFilled.void.voidFraction < 0.15, `filled interior voidFraction must be low, got ${ringFilled.void.voidFraction}`);
assert(
  ringFilled.void.maxOpenSpan < emptyA.void.maxOpenSpan,
  "empty outer ring must not create a longer open span than a truly empty interior",
);

const courtyardTrails = new Array(TRAIL * TRAIL).fill(0);
for (let i = 0; i < interiorMask.length; i += 1) {
  if (interiorMask[i]) courtyardTrails[i] = 1;
}
for (let y = 14; y < 18; y += 1) {
  for (let x = 14; x < 18; x += 1) courtyardTrails[y * TRAIL + x] = 0;
}
const courtyard = measureMorphology(makeState(TRAIL, SIZE, courtyardTrails));
assert(courtyard.topology.enclosure > ringFilled.topology.enclosure, "interior courtyard void should be more enclosed than a solid fill with no void");
assert(courtyard.topology.enclosure > 0.8, `courtyard should be interior-enclosed, got ${courtyard.topology.enclosure}`);

const wrapTrails = new Array(TRAIL * TRAIL).fill(0);
paintRect(wrapTrails, TRAIL, 12, 12, 20, 20, 1);
paintRect(wrapTrails, TRAIL, 10, 10, 22, 12, 0.2);
paintRect(wrapTrails, TRAIL, 10, 20, 22, 22, 0.2);
paintRect(wrapTrails, TRAIL, 10, 10, 12, 22, 0.2);
paintRect(wrapTrails, TRAIL, 20, 10, 22, 22, 0.2);
const wrappedMass = measureMorphology(makeState(TRAIL, SIZE, wrapTrails));
assert(
  wrappedMass.connection.meanPerimeterContact > 0.7,
  `wrap should still show high perimeter contact diagnostically, got ${wrappedMass.connection.meanPerimeterContact}`,
);
assert(
  wrappedMass.connection.embeddedNetworkFraction < 0.35,
  `wrap-around trails must not count as embedded network, got ${wrappedMass.connection.embeddedNetworkFraction}`,
);

const throughTrails = new Array(TRAIL * TRAIL).fill(0);
paintRect(throughTrails, TRAIL, 8, 12, 24, 20, 1);
paintRect(throughTrails, TRAIL, 15, 4, 16, 28, 0.2);
const through = measureMorphology(makeState(TRAIL, SIZE, throughTrails));
assert(
  through.connection.embeddedNetworkFraction > wrappedMass.connection.embeddedNetworkFraction,
  "a corridor crossing mass should embed more than a wrap-around ring",
);

const supportBandTrails = new Array(TRAIL * TRAIL).fill(0);
paintRect(supportBandTrails, TRAIL, 4, 8, 28, 12, 1);
paintRect(supportBandTrails, TRAIL, 4, 12, 28, 16, 0.2);
const banded = measureMorphology(makeState(TRAIL, SIZE, supportBandTrails));
assert(
  banded.occupation.supportCount === 0,
  `connection-band above mass is not void clearance; occupation should stay 0, got ${banded.occupation.supportCount}`,
);
assert(platform.occupation.supportCount >= 1, "true void above a bar still yields support");

const oneBlob = measureMorphology(makeState(TRAIL, SIZE, centerTrails));
assert(oneBlob.mass.concentrationCount === 1, "single blob should be one concentration");
assert(oneBlob.connection.pairOpportunityCount === 0, "one concentration has no pair opportunities");
assert(
  emptyA.proportion.insufficientElements === 1,
  "an empty field still has too few comparable elements for CV",
);
assert(
  yShape.measurements.connection.branching < 5,
  `normalized branching must stay below the unelevated cap of 5, got ${yShape.measurements.connection.branching}`,
);

assert(
  twoBlobs.measurements.proportion.overallVariation < 0.15,
  `equal same-family blobs should have low within-family variation, got ${twoBlobs.measurements.proportion.overallVariation}`,
);
assert(
  unequal.proportion.overallVariation > twoBlobs.measurements.proportion.overallVariation,
  "differentiated same-family sizes should raise overallVariation",
);
assert(
  oneBlob.proportion.insufficientElements === 1,
  "one concentration and one void family must be indeterminate, not mixed-unit CV",
);
assert(
  denseM.proportion.insufficientElements === 1,
  "a single solid mass has no comparable family members",
);
assert(
  wrappedMass.connection.aroundNetworkFraction > wrappedMass.connection.throughNetworkFraction,
  "wrap should classify as around, not through",
);
assert(
  through.connection.throughNetworkFraction > wrappedMass.connection.throughNetworkFraction,
  "crossing corridor should increase throughNetworkFraction",
);

const aabbWrapTrails = new Array(TRAIL * TRAIL).fill(0);
paintRect(aabbWrapTrails, TRAIL, 12, 12, 22, 22, 1);
paintRect(aabbWrapTrails, TRAIL, 12, 12, 22, 13, 0.2);
const aabbWrap = measureMorphology(makeState(TRAIL, SIZE, aabbWrapTrails));
assert(
  aabbWrap.connection.aroundNetworkFraction > aabbWrap.connection.zoneNetworkFraction,
  `N4 wrap inside a concentration AABB must stay AROUND not ZONE (around=${aabbWrap.connection.aroundNetworkFraction} zone=${aabbWrap.connection.zoneNetworkFraction})`,
);
assert(
  aabbWrap.connection.throughNetworkFraction < aabbWrap.connection.aroundNetworkFraction,
  "inner-edge wrap must not classify as through",
);
assert(
  denseM.topology.directionalSurround === 0,
  "solid fill has no interior void from which to measure surround",
);
assert(
  emptyA.topology.directionalSurround === 0,
  "empty field has no morphology to create immersion",
);
assert(
  courtyard.topology.layering > ringFilled.topology.layering,
  "courtyard should layer more than solid interior fill",
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
