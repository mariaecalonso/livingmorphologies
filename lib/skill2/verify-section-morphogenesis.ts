import { DEFAULT_MORPHOLOGICAL_EXTRACTION } from "./measurement-config";
import type { MorphologyMeasurementResult } from "./measurements";
import {
  ARCHETYPE_GRAMMARS,
  sectionMorphogenesis,
  toSectionModel,
  type OperationName,
} from "./section-morphogenesis";
import type { SectionModel, SectionPoint } from "./section-translate";

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

function line(x0: number, y0: number, x1: number, y1: number, n: number): SectionPoint[] {
  const pts: SectionPoint[] = [];
  for (let i = 0; i < n; i += 1) {
    const t = n === 1 ? 0 : i / (n - 1);
    pts.push({ x: x0 + (x1 - x0) * t, y: y0 + (y1 - y0) * t });
  }
  return pts;
}

function circle(cx: number, cy: number, r: number, n: number): SectionPoint[] {
  return Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2;
    return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
  });
}

function emptySection(): SectionModel {
  return {
    orientation: "source-bottom-up",
    width: 32,
    height: 32,
    occupancySize: 8,
    protectedVoid: new Uint8Array(32 * 32),
    primitives: [],
  };
}

function stubMorph(section: SectionModel, mass = new Uint8Array(section.width * section.height)): MorphologyMeasurementResult {
  const z = new Uint8Array(section.width * section.height);
  return {
    measurements: {} as MorphologyMeasurementResult["measurements"],
    summary: {
      trailPeak: 0,
      flowPeak: 0,
      massCells: 0,
      connectionCells: 0,
      voidCells: 0,
      skeletonJunctions: 0,
      skeletonLength: 0,
    },
    config: DEFAULT_MORPHOLOGICAL_EXTRACTION,
    overlays: {
      width: section.width,
      height: section.height,
      mass,
      corridor: z.slice(),
      significantVoid: section.protectedVoid,
      interior: z.slice(),
      skeleton: z.slice(),
      circulation: z.slice(),
    },
  };
}

const ALL_IDS = Object.keys(ARCHETYPE_GRAMMARS);
assert(ALL_IDS.length === 15, "grammar for all 15 archetypes");
for (const id of ALL_IDS) {
  const g = ARCHETYPE_GRAMMARS[id];
  assert(g.dominant.length > 0, `${id} has dominant ops`);
  assert(!g.invariant.includes("0,0"), `${id} has no coordinates in invariant`);
}

const vocab: OperationName[] = [
  "ground",
  "lift",
  "layer",
  "step",
  "orient",
  "extend",
  "thicken",
  "carve",
  "enclose",
  "nest",
  "span",
  "repeat",
  "separate",
  "merge",
  "undulate",
];
for (const id of ALL_IDS) {
  const g = ARCHETYPE_GRAMMARS[id];
  for (const op of [...g.dominant, ...g.secondary, ...g.prohibited]) {
    assert(vocab.includes(op), `${id} uses unknown op ${op}`);
  }
}

const plates: SectionModel = {
  ...emptySection(),
  primitives: [6, 14, 22].map((y, i) => ({
    kind: "ledge" as const,
    evidence: "test",
    polyline: line(3 + i * 2, y, 26 + i, y, 14),
    radius: Array.from({ length: 14 }, () => 0.25),
  })),
};
const morph = stubMorph(plates);
const before = JSON.stringify(plates.primitives);
const formed = sectionMorphogenesis({ archetypeId: "terraced", extracted: plates, morphology: morph });
assert(JSON.stringify(plates.primitives) === before, "morphogenesis must not mutate extracted SectionModel");
assert(formed.status === "formed", "three supported ledges must form terraces");
assert(formed.primitives.length >= 3, "terrace output has plates");
assert(formed.operations.some((op) => op.op === "orient"), "orient activated");
assert(formed.operations.some((op) => op.op === "layer"), "layer activated");
assert(formed.operations.some((op) => op.op === "step"), "step activated");
const asSection = toSectionModel(formed);
assert(asSection.primitives.length === formed.primitives.length, "section conversion preserves members");

const loop: SectionModel = {
  ...emptySection(),
  primitives: [
    {
      kind: "mass-spine",
      evidence: "loop",
      polyline: circle(16, 16, 10, 36),
      radius: Array.from({ length: 36 }, () => 0.2),
    },
  ],
};
const looped = sectionMorphogenesis({ archetypeId: "terraced", extracted: loop, morphology: stubMorph(loop) });
assert(looped.status === "insufficient-evidence", "a single loop must not invent three plates");
assert(looped.reasons.some((r) => r.includes("minimum 3") || r.includes("only")), looped.reasons.join("; "));

const empty = sectionMorphogenesis({
  archetypeId: "vertical-void",
  extracted: emptySection(),
  morphology: stubMorph(emptySection()),
});
assert(empty.status === "insufficient-evidence", "empty void cannot form vertical void");

console.log("skill2 section morphogenesis: ok");
console.log(`terraced formed=${formed.status} plates=${formed.primitives.length} ops=${formed.operations.map((o) => o.op).join(",")}`);
console.log(`loop status=${looped.status}`);
