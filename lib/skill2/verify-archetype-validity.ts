import {
  evaluateArchetypeValidity,
  ARCHETYPE_VALIDITY_THRESHOLDS,
  detectValidPlates,
  closedFormDiagnostic,
} from "./archetype-validity";
import type { SectionModel, SectionPoint } from "./section-translate";

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
  const pts: SectionPoint[] = [];
  for (let i = 0; i < n; i += 1) {
    const a = (i / n) * Math.PI * 2;
    pts.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) });
  }
  return pts;
}

const empty = evaluateArchetypeValidity("vertical-void", emptySection());
assert(!empty.valid, "empty section is not a vertical void");
assert(
  empty.checks.some((item) => !item.passed),
  "empty vertical void must expose failed checks",
);

const tall = emptySection();
for (let y = 4; y < 28; y += 1) {
  for (let x = 12; x < 18; x += 1) tall.protectedVoid[y * 32 + x] = 1;
}
tall.primitives.push({
  kind: "mass-spine",
  evidence: "test",
  polyline: [
    { x: 10, y: 4 },
    { x: 10, y: 28 },
  ],
  radius: [0.4, 0.4],
});
tall.primitives.push({
  kind: "mass-spine",
  evidence: "test",
  polyline: [
    { x: 20, y: 4 },
    { x: 20, y: 28 },
  ],
  radius: [0.4, 0.4],
});
const vv = evaluateArchetypeValidity("vertical-void", tall);
assert(vv.checks.length === 4, "vertical void has four geometric checks");

const before = JSON.stringify(tall.primitives);
evaluateArchetypeValidity("vertical-void", tall);
assert(JSON.stringify(tall.primitives) === before, "validity must not mutate SectionModel");

const unknown = evaluateArchetypeValidity("not-an-archetype", emptySection());
assert(!unknown.valid, "unknown archetype is invalid");

const plates: SectionModel = {
  ...emptySection(),
  primitives: [6, 12, 18].map((y, i) => ({
    kind: "ledge" as const,
    evidence: "test",
    polyline: line(4 + i * 3, y, 24 + i * 2, y, 12),
    radius: Array.from({ length: 12 }, () => 0.3),
  })),
};
assert(detectValidPlates(plates).length >= 3, "synthetic terraces must pass the plate detector");
const terr = evaluateArchetypeValidity("terraced", plates);
const amph = evaluateArchetypeValidity("stepped-amphitheater", plates);
assert(terr.valid, "three offset straight plates are a terrace");
assert(
  amph.checks.length > terr.checks.length,
  "amphitheater must add focal checks beyond terraced",
);
assert(
  amph.checks.some((item) => item.id.startsWith("sa-")),
  "amphitheater focus checks present",
);

const loopSection: SectionModel = {
  ...emptySection(),
  primitives: [
    {
      kind: "mass-spine",
      evidence: "test-loop",
      polyline: circle(16, 16, 11, 36),
      radius: Array.from({ length: 36 }, () => 0.25),
    },
  ],
};
const loopDiag = closedFormDiagnostic(loopSection);
assert(loopDiag.closed, "uniform ring must trigger closed-form diagnostic");
assert(detectValidPlates(loopSection).length === 0, "a closed ring is not a plate");
const loopTerr = evaluateArchetypeValidity("terraced", loopSection);
assert(!loopTerr.valid, "closed loop must not pass terraced");
const loopFlat = evaluateArchetypeValidity("flat-deep-plan", loopSection);
assert(!loopFlat.valid, "closed loop must not pass flat deep plan");
const loopPlate = evaluateArchetypeValidity("inserted-horizontal-plate", loopSection);
assert(!loopPlate.valid, "closed loop must not pass inserted plate");

const gallery = evaluateArchetypeValidity("linear-gallery", emptySection());
const edge = evaluateArchetypeValidity("linear-edge-gallery", emptySection());
assert(edge.checks.length > gallery.checks.length, "edge gallery adds asymmetry checks");

assert(ARCHETYPE_VALIDITY_THRESHOLDS.plateCount === 3, "document plate count threshold");
assert(ARCHETYPE_VALIDITY_THRESHOLDS.verticalAspect === 1.25, "document vertical aspect");
assert(ARCHETYPE_VALIDITY_THRESHOLDS.plateElongation === 2.2, "document plate elongation");
assert(ARCHETYPE_VALIDITY_THRESHOLDS.plateMaxTotalTurning === 0.7, "document plate turning cap");
assert(ARCHETYPE_VALIDITY_THRESHOLDS.closedGapRatio === 0.14, "document closed-gap ratio");

console.log("skill2 archetype validity: ok");
console.log(
  `vertical-void empty valid=${empty.valid} tall checks=${vv.checks.filter((c) => c.passed).length}/${vv.checks.length}`,
);
console.log(`terraced synthetic valid=${terr.valid} loop valid=${loopTerr.valid}`);
