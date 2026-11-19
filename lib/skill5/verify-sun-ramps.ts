import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { analysisRampRoads, elevatedDeckGeometry } from "@/components/site/site-geometry";
import context from "@/data/skill5/herald-site.json";
import { buildSiteAnalysisBundle, generatedBundleReady, rampExposureTriangles, writeSiteAnalysisBundle } from "@/lib/skill5/site-analysis-bundle";
import { representativeSolarDates, solarAt } from "@/lib/skill5/solar";
import type { ExposureTriangle } from "@/lib/skill5/sun-exposure";
import type { SiteContext } from "@/lib/skill5/site-model";
import { windSummary } from "@/lib/skill5/wind";

const site = context as SiteContext;
const started = performance.now();
const dates = representativeSolarDates(site.origin.lat, site.origin.lon, 2026);
const firstDates = performance.now() - started;
const cachedStart = performance.now();
const datesAgain = representativeSolarDates(site.origin.lat, site.origin.lon, 2026);
const secondDates = performance.now() - cachedStart;
assert.deepEqual(datesAgain, dates);
assert.equal(dates?.spring, "2026-03-20");
assert.equal(dates?.summer, "2026-06-21");
assert.equal(dates?.fall, "2026-09-22");
assert.equal(dates?.winter, "2026-12-21");

const bundleStart = performance.now();
const bundle = buildSiteAnalysisBundle(site, dates);
const bundleMs = performance.now() - bundleStart;
assert.equal(bundle.sun.scenarios.length, 12);
assert.equal(generatedBundleReady(bundle), true);
assert.equal(writeSiteAnalysisBundle(bundle), false);
assert.equal(generatedBundleReady({ ...bundle, sun: { ...bundle.sun, status: "error" } }), false);
assert.equal(generatedBundleReady({ ...bundle, wind: { ...bundle.wind, seasons: bundle.wind.seasons.slice(0, 3) } }), false);
assert.equal(generatedBundleReady({ ...bundle, views: { ...bundle.views, status: "unavailable" } }), false);
assert.equal(generatedBundleReady({ ...bundle, pedestrian: { ...bundle.pedestrian, records: [] } }), false);

for (const season of bundle.wind.seasons) {
  assert.equal(season.meanSpeedScope, "period-including-calm");
  const summary = windSummary(season.id, 0, "all");
  assert.equal(season.meanSpeed, summary.meanSpeed);
  assert.equal(season.prevailingMeanSpeed, summary.prevailing?.meanSpeed ?? null);
  assert.notEqual(season.meanSpeed, season.prevailingMeanSpeed);
}

function rayHit(
  ox: number,
  oy: number,
  oz: number,
  dx: number,
  dy: number,
  dz: number,
  triangle: ExposureTriangle,
) {
  const [a, b, c] = triangle;
  const e1x = b[0] - a[0];
  const e1y = b[1] - a[1];
  const e1z = b[2] - a[2];
  const e2x = c[0] - a[0];
  const e2y = c[1] - a[1];
  const e2z = c[2] - a[2];
  const px = dy * e2z - dz * e2y;
  const py = dz * e2x - dx * e2z;
  const pz = dx * e2y - dy * e2x;
  const det = e1x * px + e1y * py + e1z * pz;
  if (Math.abs(det) < 1e-8) return false;
  const inv = 1 / det;
  const tx = ox - a[0];
  const ty = oy - a[1];
  const tz = oz - a[2];
  const u = (tx * px + ty * py + tz * pz) * inv;
  if (u < -1e-5 || u > 1 + 1e-5) return false;
  const qx = ty * e1z - tz * e1y;
  const qy = tz * e1x - tx * e1z;
  const qz = tx * e1y - ty * e1x;
  const v = (dx * qx + dy * qy + dz * qz) * inv;
  if (v < -1e-5 || u + v > 1 + 1e-5) return false;
  const t = (e2x * qx + e2y * qy + e2z * qz) * inv;
  const horizontal = Math.hypot(dx, dz);
  return t > 0.05 && t * horizontal <= 2500;
}

const triangles = rampExposureTriangles(site.roads);
const geometry = elevatedDeckGeometry(analysisRampRoads(site.roads));
const index = geometry.getIndex();
assert.equal(index ? index.count / 3 : 0, triangles.length);
geometry.dispose();
assert.ok(triangles.length > 0);

let shadedCells = 0;
let checked = 0;
for (const scenario of bundle.sun.scenarios) {
  const sample = solarAt(site.origin.lat, site.origin.lon, scenario.date, scenario.clock);
  const length = Math.hypot(sample.toSun[0], sample.toSun[1], sample.toSun[2]) || 1;
  const dx = sample.toSun[0] / length;
  const dy = sample.toSun[1] / length;
  const dz = sample.toSun[2] / length;
  for (const cell of scenario.cells) {
    const hit = triangles.some((triangle) => rayHit(cell.x, 0, cell.z, dx, dy, dz, triangle));
    assert.equal(hit, !cell.exposed, `${scenario.season} ${scenario.time} ${cell.x.toFixed(1)},${cell.z.toFixed(1)}`);
    checked += 1;
  }
  shadedCells += scenario.shaded;
  console.log(`${scenario.season} ${scenario.time} ${scenario.date} ${scenario.clock} exposed ${scenario.exposed} shaded ${scenario.shaded}`);
}
assert.ok((bundle.sun.scenarios.find((item) => item.season === "spring" && item.time === "morning")?.shaded ?? 0) > 0);
assert.ok((bundle.sun.scenarios.find((item) => item.season === "winter" && item.time === "morning")?.shaded ?? 0) > 0);
console.log(`dates ${firstDates.toFixed(1)} ms, cached ${secondDates.toFixed(1)} ms, bundle ${bundleMs.toFixed(1)} ms, cells ${checked}, shaded ${shadedCells}, ramp triangles ${triangles.length}`);
