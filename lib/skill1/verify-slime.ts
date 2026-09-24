import { createSimulation, stepMany } from "./engine";
import { slimeControlsFromTranslation, type SlimeControls } from "./slime-controls";
import { translateArchetype } from "./translate";
import { mulberry32 } from "../physarum";

const translation = translateArchetype("vertical-void");
const base = slimeControlsFromTranslation(translation);

function signature(patch: Partial<SlimeControls>) {
  const slime = { ...base, ...patch };
  const seed = 11;
  const rng = mulberry32(seed ^ 0x9e3779b9);
  const state = createSimulation(translation, seed, 180);
  state.maxIterations = 70;
  stepMany(state, translation, rng, 70, slime.decay, slime);
  let sum = 0;
  let peak = 0;
  let cx = 0;
  let cy = 0;
  const ts = state.trailSize;
  for (let y = 0; y < ts; y += 1) {
    for (let x = 0; x < ts; x += 1) {
      const value = state.trails[y * ts + x];
      sum += value;
      if (value > peak) peak = value;
      cx += value * x;
      cy += value * y;
    }
  }
  return { sum, peak, cx: sum > 0 ? cx / sum : 0, cy: sum > 0 ? cy / sum : 0 };
}

function differs(a: ReturnType<typeof signature>, b: ReturnType<typeof signature>) {
  const sumGap = Math.abs(a.sum - b.sum) / Math.max(1, a.sum, b.sum);
  const peakGap = Math.abs(a.peak - b.peak) / Math.max(0.01, a.peak, b.peak);
  const shift = Math.hypot(a.cx - b.cx, a.cy - b.cy);
  return sumGap > 0.04 || peakGap > 0.04 || shift > 1.5;
}

const cases: Array<[string, Partial<SlimeControls>, Partial<SlimeControls>]> = [
  ["sensorAngle", { sensorAngle: 0.05 }, { sensorAngle: 1.4 }],
  ["sensorDistance", { sensorDistance: 0.2 }, { sensorDistance: 2.4 }],
  ["turnAngle", { turnAngle: 0.02 }, { turnAngle: 1.3 }],
  ["stepSize", { stepSize: 0.05 }, { stepSize: 0.55 }],
  ["deposit", { deposit: 0.01 }, { deposit: 0.25 }],
  ["depositWidth", { depositWidth: 1 }, { depositWidth: 4 }],
  ["diffusion", { diffusion: 0 }, { diffusion: 0.45 }],
  ["decay", { decay: 0.9 }, { decay: 0.998 }],
  ["randomness", { randomness: 0 }, { randomness: 1.4 }],
  ["persistence", { persistence: 0 }, { persistence: 0.95 }],
  ["trailCap", { trailCap: 0.15 }, { trailCap: 1.8 }],
  ["crowdingLimit", { crowdingLimit: 2 }, { crowdingLimit: 80 }],
  ["foodPoints", { foodPoints: [{ x: 10, y: 10 }] }, { foodPoints: [{ x: 10, y: 10 }, { x: 3, y: 16 }] }],
];

let failed = 0;
for (const [name, low, high] of cases) {
  const a = signature(low);
  const b = signature(high);
  const ok = differs(a, b);
  if (!ok) failed += 1;
  console.log(
    `${ok ? "PASS" : "FAIL"} ${name} sum ${a.sum.toFixed(1)}→${b.sum.toFixed(1)} peak ${a.peak.toFixed(3)}→${b.peak.toFixed(3)} shift ${Math.hypot(a.cx - b.cx, a.cy - b.cy).toFixed(2)}`,
  );
}
if (failed > 0) {
  console.error(`${failed} slime controls did not change the trail field`);
  process.exit(1);
}
console.log(`All ${cases.length} slime controls change the trail field`);
