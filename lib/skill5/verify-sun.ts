import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { analysisTowers, casterBox, groundShadow, heightAccount, keepRuns, storedShadowPoints, sunRunRecord } from "./sun-analysis";
import { MIAMI_TIME_ZONE, missingClockNote, monthlySolarNoon, resolveZonedClock, solarPosition, zonedInstant } from "./solar";
import type { SiteBuilding } from "./site-model";

const latitude = 25.78887982474338;
const longitude = -80.18621229910427;

const november = zonedInstant("2026-11-05", "15:00", MIAMI_TIME_ZONE);
assert.equal(november.toISOString(), "2026-11-05T20:00:00.000Z");
const novemberSun = solarPosition(latitude, longitude, november);
assert.ok(Math.abs(novemberSun.altitude - 30.322) < 0.001, novemberSun.altitude.toFixed(3));
assert.ok(Math.abs(novemberSun.azimuth - 230.629) < 0.001, novemberSun.azimuth.toFixed(3));

const june = zonedInstant("2026-06-21", "13:30", MIAMI_TIME_ZONE);
assert.equal(june.toISOString(), "2026-06-21T17:30:00.000Z");
const juneSun = solarPosition(latitude, longitude, june);
assert.ok(Math.abs(juneSun.altitude - 87.112) < 0.001, juneSun.altitude.toFixed(3));
assert.ok(Math.abs(juneSun.azimuth - 215.896) < 0.001, juneSun.azimuth.toFixed(3));

const winter = resolveZonedClock("2026-11-05", "15:00");
assert.equal(winter.status, "unique");
if (winter.status === "unique") {
  assert.equal(winter.occurrence.offsetMinutes, -300);
  assert.equal(winter.occurrence.name, "Eastern Standard Time");
  assert.equal(winter.occurrence.instant.toISOString(), november.toISOString());
}
const summer = resolveZonedClock("2026-06-21", "13:30");
assert.equal(summer.status, "unique");
if (summer.status === "unique") {
  assert.equal(summer.occurrence.offsetMinutes, -240);
  assert.equal(summer.occurrence.name, "Eastern Daylight Time");
}

const gap = resolveZonedClock("2026-03-08", "02:30");
assert.equal(gap.status, "missing");
assert.match(missingClockNote("2026-03-08"), /does not occur/);
assert.match(missingClockNote("2026-03-08"), /Eastern Standard Time/);
assert.match(missingClockNote("2026-03-08"), /Eastern Daylight Time/);

const repeated = resolveZonedClock("2026-11-01", "01:30");
assert.equal(repeated.status, "ambiguous");
if (repeated.status === "ambiguous") {
  assert.equal(repeated.occurrences.length, 2);
  assert.equal(repeated.occurrences[0].instant.toISOString(), "2026-11-01T05:30:00.000Z");
  assert.equal(repeated.occurrences[0].name, "Eastern Daylight Time");
  assert.equal(repeated.occurrences[1].instant.toISOString(), "2026-11-01T06:30:00.000Z");
  assert.equal(repeated.occurrences[1].name, "Eastern Standard Time");
  const first = solarPosition(latitude, longitude, repeated.occurrences[0].instant);
  const second = solarPosition(latitude, longitude, repeated.occurrences[1].instant);
  assert.ok(Math.abs(first.altitude - second.altitude) > 0.5);
}

const low = solarPosition(latitude, longitude, zonedInstant("2026-11-05", "07:00", MIAMI_TIME_ZONE));
const far = groundShadow(0, 530, 0, low.toSun);
assert.ok(far);
assert.ok(far.horizontalFeet > 4200, far.horizontalFeet.toFixed(1));
assert.equal(far.y, 0);
const ratio = 1 / Math.tan((low.altitude * Math.PI) / 180);
assert.ok(Math.abs(far.horizontalFeet - 530 * ratio) < 0.05);

const level = groundShadow(10, 100, -20, novemberSun.toSun);
assert.ok(level);
assert.ok(Math.abs(level.horizontalFeet - 100 * novemberSun.shadowPerFoot!) < 0.05);
const points = storedShadowPoints({ minX: 0, minY: 0, minZ: 0, maxX: 1, maxY: 530, maxZ: 1 }, low.toSun);
const farthest = Math.max(...points.filter((point) => point[1] === 0).map((point) => Math.hypot(point[0], point[2])));
assert.ok(farthest > 4200, farthest.toFixed(1));

const site = JSON.parse(readFileSync(new URL("../../data/skill5/herald-site.json", import.meta.url), "utf8")) as { buildings: SiteBuilding[] };
const account = heightAccount(site.buildings);
assert.equal(account.drawn, 49);
assert.equal(account.estimated, 32);
assert.equal(account.stories, 1);
assert.equal(account.tagged, 16);

const hilton = site.buildings.find((building) => building.name === "Hilton Miami Downtown");
const quantum = site.buildings.find((building) => building.name === "Quantum on the Bay");
assert.ok(hilton && quantum);
const before = { hilton: hilton.heightFeet, quantum: quantum.heightFeet };
const towers = analysisTowers(site.buildings);
assert.equal(hilton.heightFeet, before.hilton);
assert.equal(quantum.heightFeet, before.quantum);
assert.equal(before.hilton, 90);
assert.equal(before.quantum, 130);
const byId = Object.fromEntries(towers.map((tower) => [tower.id, tower]));
assert.equal(byId.hilton.heightFeet, 299);
assert.equal(byId.hilton.baseFeet, 90);
assert.equal(byId["quantum-north"].heightFeet, 536);
assert.equal(byId["quantum-north"].baseFeet, 130);
assert.equal(byId["quantum-south"].heightFeet, 554);
assert.equal(byId["quantum-south"].baseFeet, 130);

function contains(ring: readonly (readonly [number, number])[], x: number, z: number) {
  let inside = false;
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index, index += 1) {
    const [xi, zi] = ring[index];
    const [xj, zj] = ring[previous];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}
function centroid(ring: readonly (readonly [number, number])[]) {
  let x = 0;
  let z = 0;
  for (const point of ring) {
    x += point[0];
    z += point[1];
  }
  return [x / ring.length, z / ring.length] as const;
}
for (const tower of towers) {
  const host = tower.hostName === "Hilton Miami Downtown" ? hilton : quantum;
  const [x, z] = centroid(tower.ring);
  assert.ok(contains(host.ring, x, z), tower.id);
  assert.ok(tower.ring.length >= 4);
}
const box = casterBox(site.buildings, towers);
assert.ok(box.maxY >= 554);

const record = sunRunRecord(0, "2026-11-05", "15:00", "Eastern Standard Time", -300, novemberSun);
assert.equal(record.date, "2026-11-05");
assert.equal(record.time, "15:00");
assert.equal(record.zoneName, "Eastern Standard Time");
assert.equal(record.offsetMinutes, -300);
assert.equal(record.altitude, novemberSun.altitude);
assert.equal(record.azimuth, novemberSun.azimuth);
assert.equal(record.shadowPerFoot, novemberSun.shadowPerFoot);
assert.equal(record.above, true);
const kept = keepRuns(keepRuns(keepRuns([], "one"), "two"), "three");
assert.deepEqual(kept, ["two", "three"]);

const noons = monthlySolarNoon(latitude, longitude, 2026);
assert.equal(noons.length, 12);
for (const row of noons) {
  assert.equal(row.date.endsWith("-21"), true, row.date);
  const clock = resolveZonedClock(row.date, row.time);
  assert.equal(clock.status, "unique", row.date);
  if (clock.status !== "unique") continue;
  const sample = solarPosition(latitude, longitude, clock.occurrence.instant);
  assert.equal(row.altitude, sample.altitude);
  assert.equal(row.azimuth, sample.azimuth);
  assert.equal(row.shadowPerFoot, sample.shadowPerFoot);
  const [hour, minute] = row.time.split(":").map(Number);
  const adjacent = (delta: number) => {
    const total = hour * 60 + minute + delta;
    return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
  };
  const earlier = solarPosition(latitude, longitude, zonedInstant(row.date, adjacent(-1), MIAMI_TIME_ZONE));
  const later = solarPosition(latitude, longitude, zonedInstant(row.date, adjacent(1), MIAMI_TIME_ZONE));
  assert.ok(row.altitude >= earlier.altitude, row.date);
  assert.ok(row.altitude >= later.altitude, row.date);
}
assert.ok(noons[5].altitude > noons[11].altitude, "June noon is higher than December noon");
assert.equal(noons.every((row) => row.shadowPerFoot !== null), true);

console.log("sun study checks passed");
