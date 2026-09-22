import { measureMorphologyDetailed } from "./measurements";
import { sectionTranslate } from "./section-translate";
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

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

const SIZE = 8;
const TRAIL = 32;

const empty = makeState(TRAIL, SIZE, new Array(TRAIL * TRAIL).fill(0));
const emptySection = sectionTranslate(empty, measureMorphologyDetailed(empty));
assert(emptySection.orientation === "source-bottom-up", "orientation convention");
assert(
  emptySection.primitives.every((item) => item.kind !== "solid-body"),
  "empty field must not create solid bodies",
);

const blobTrails = new Array(TRAIL * TRAIL).fill(0);
paintRect(blobTrails, TRAIL, 10, 10, 22, 22, 1);
const blob = sectionTranslate(makeState(TRAIL, SIZE, blobTrails), measureMorphologyDetailed(makeState(TRAIL, SIZE, blobTrails)));
assert(
  blob.primitives.some((item) => item.kind === "solid-body" || item.kind === "mass-spine"),
  "compact dense square should become mass, not disappear",
);
assert(
  blob.primitives.every((item) => item.kind !== "enclosure-edge" || (item.polyline?.length ?? 0) > 0),
  "enclosure polylines if present are traces",
);

const ringTrails = new Array(TRAIL * TRAIL).fill(0);
paintRect(ringTrails, TRAIL, 8, 8, 24, 24, 1);
paintRect(ringTrails, TRAIL, 12, 12, 20, 20, 0);
const ringMorph = measureMorphologyDetailed(makeState(TRAIL, SIZE, ringTrails));
const ring = sectionTranslate(makeState(TRAIL, SIZE, ringTrails), ringMorph);
assert(ringMorph.measurements.void.significantVoidCount >= 1, "ring must have interior void in measurements");
assert(
  !ring.primitives.some((item) => item.kind === "solid-body" && (item.cells?.length ?? 0) > ringMorph.overlays.mass.reduce((a, b) => a + b, 0)),
  "solid body cannot exceed mass cells",
);
for (const primitive of ring.primitives) {
  if (!primitive.cells) continue;
  for (const i of primitive.cells) {
    assert(!ring.protectedVoid[i], "solid body must not fill protected void");
  }
}

const barTrails = new Array(TRAIL * TRAIL).fill(0);
paintRect(barTrails, TRAIL, 4, 14, 28, 16, 1);
const bar = sectionTranslate(makeState(TRAIL, SIZE, barTrails), measureMorphologyDetailed(makeState(TRAIL, SIZE, barTrails)));
assert(
  bar.primitives.some((item) => item.kind === "mass-spine" || item.kind === "solid-body" || item.kind === "ledge"),
  "elongated bar should produce a member, not a filled field",
);

const throughTrails = new Array(TRAIL * TRAIL).fill(0);
paintRect(throughTrails, TRAIL, 8, 12, 24, 20, 1);
paintRect(throughTrails, TRAIL, 15, 4, 17, 28, 0.2);
const through = sectionTranslate(
  makeState(TRAIL, SIZE, throughTrails),
  measureMorphologyDetailed(makeState(TRAIL, SIZE, throughTrails)),
);
assert(
  through.primitives.every((item) => item.kind !== "span" || item.polyline.length >= 2),
  "spans are polylines",
);

const a = measureMorphologyDetailed(makeState(TRAIL, SIZE, blobTrails)).measurements;
const b = measureMorphologyDetailed(makeState(TRAIL, SIZE, blobTrails)).measurements;
assert(JSON.stringify(a) === JSON.stringify(b), "translation must not be required for measurement determinism");

console.log("skill2 section translation: ok");
console.log(
  `empty primitives=${emptySection.primitives.length} blob=${blob.primitives.map((p) => p.kind).join(",")} ring=${ring.primitives.map((p) => p.kind).join(",")}`,
);
