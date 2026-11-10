import assert from "node:assert/strict";
import { keepRuns } from "./sun-analysis";
import {
  CALM_METERS_PER_SECOND,
  displayedMph,
  isDaytimeHour,
  metersPerSecondToMph,
  seasonalComparison,
  stationDistanceKm,
  travelVector,
  WIND_CALM_NOTE,
  WIND_DIRECTION_NOTE,
  WIND_HISTORY_NOTE,
  WIND_SOURCE,
  windHours,
  windRunRecord,
  windSummary,
} from "./wind";

assert.equal(WIND_SOURCE.wmo, "722020");
assert.equal(WIND_SOURCE.dataset, "TMY3");
assert.equal(WIND_SOURCE.lat, 25.82);
assert.equal(WIND_SOURCE.lon, -80.3);
assert.equal(WIND_SOURCE.elevationMeters, 11);
assert.equal(WIND_SOURCE.speedUnit, "m/s");

const hours = windHours();
assert.equal(hours.length, 8760);
assert.equal(hours.filter((hour) => hour.speed === 0).length, 512);
assert.equal(Math.max(...hours.map((hour) => hour.speed)), 13.4);

const monthlyMean = [3.3, 5.5, 5.6, 4.7, 5.0, 3.9, 2.9, 3.5, 3.4, 3.7, 4.4, 3.7];
for (let month = 1; month <= 12; month += 1) {
  const rows = hours.filter((hour) => hour.month === month);
  const mean = rows.reduce((sum, hour) => sum + hour.speed, 0) / rows.length;
  assert.equal(mean.toFixed(1), monthlyMean[month - 1].toFixed(1), `month ${month}`);
}

const januaryNoon = hours.filter((hour) => hour.month === 1 && hour.hour === 12);
assert.equal(januaryNoon.length, 31);
const noonMean = januaryNoon.reduce((sum, hour) => sum + hour.speed, 0) / januaryNoon.length;
assert.equal(noonMean.toFixed(1), "4.7");

function share8(month: number, bin: number) {
  const rows = hours.filter((hour) => hour.month === month);
  const count = rows.filter((hour) => {
    const wrapped = ((hour.direction % 360) + 360) % 360;
    return Math.floor(((wrapped + 22.5) % 360) / 45) === bin;
  }).length;
  return Math.round((100 * count) / rows.length);
}

const statNorth = [41, 25, 8, 10, 5, 11, 11, 21, 24, 20, 14, 27];
const statNortheast = [6, 12, 5, 8, 4, 6, 5, 7, 9, 16, 13, 11];
for (let month = 1; month <= 12; month += 1) {
  assert.equal(share8(month, 0), statNorth[month - 1], `north ${month}`);
  assert.equal(share8(month, 1), statNortheast[month - 1], `northeast ${month}`);
}

const january = windSummary("winter", 1, "all");
assert.equal(january.hours, 744);
assert.equal(january.meanSpeed.toFixed(1), "3.3");
assert.equal(january.prevailing?.name, "NNW");
assert.ok(january.calmHours > 0);
assert.ok((january.prevailing?.hours ?? 0) > january.hours * 0.1);

const summer = windSummary("summer", 0, "all");
const winter = windSummary("winter", 0, "all");
assert.ok(summer.prevailing);
assert.ok(winter.prevailing);
assert.ok(winter.meanSpeed > summer.meanSpeed);
assert.notEqual(summer.prevailing.name, winter.prevailing.name);

const daytime = windSummary("year", 0, "day");
assert.ok(daytime.hours < 8760);
assert.ok(daytime.hours > 4000);
assert.ok(hours.filter((hour) => isDaytimeHour(hour.hour)).length === daytime.hours);

const strong = windSummary("summer", 0, "strong");
assert.ok(strong.hours > 0 && strong.hours < summer.hours);
assert.ok(strong.meanSpeed >= summer.meanSpeed);

const north = travelVector(0);
assert.ok(Math.abs(north.east) < 1e-12);
assert.ok(Math.abs(north.north + 1) < 1e-12);
const east = travelVector(90);
assert.ok(Math.abs(east.east + 1) < 1e-12);
assert.ok(Math.abs(east.north) < 1e-12);

const distance = stationDistanceKm(25.78887982474338, -80.18621229910427);
assert.ok(distance > 11.5 && distance < 12.2, distance.toFixed(2));

const comparison = seasonalComparison("all");
assert.equal(comparison.length, 4);
assert.ok(comparison.every((row) => row.summary.hours > 0 && row.summary.prevailing));

const run = windRunRecord(0, january);
assert.equal(run.prevailingName, "NNW");
assert.equal(run.prevailingFrom, january.prevailing?.meanFrom);
assert.equal(run.meanSpeed.toFixed(1), "3.3");
assert.equal(run.month, 1);
assert.ok(run.prevailingShare !== null && run.prevailingShare > 0 && run.prevailingShare <= 1);
assert.equal(keepRuns([run], windRunRecord(1, summer)).length, 2);
assert.ok(metersPerSecondToMph(1) > 2.23 && metersPerSecondToMph(1) < 2.24);
assert.equal(CALM_METERS_PER_SECOND, 0.5);

const autumn = windSummary("autumn", 0, "all");
assert.equal(autumn.prevailing?.name, "E");
assert.equal(autumn.meanSpeed.toFixed(1), "3.8");
assert.equal(displayedMph(autumn.meanSpeed).toFixed(1), "8.5");
assert.equal(metersPerSecondToMph(autumn.meanSpeed).toFixed(1), "8.6");
assert.equal(autumn.vectorFrom?.toFixed(0), "72");
assert.notEqual(autumn.vectorFrom?.toFixed(0), autumn.prevailing?.meanFrom.toFixed(0));
assert.equal(winter.vectorFrom?.toFixed(0), "49");
assert.equal(winter.prevailing?.name, "N");

const autumnStrong = windSummary("autumn", 0, "strong");
assert.equal(autumnStrong.medianSpeed.toFixed(1), "3.6");
assert.equal(autumn.medianSpeed.toFixed(1), "3.6");
assert.ok(autumnStrong.meanSpeed > autumn.meanSpeed);

const winterEast = winter.sectors.find((sector) => sector.name === "E");
assert.ok(winterEast && winterEast.hours > 0);
assert.notEqual(winterEast.name, winter.prevailing?.name);
const moving = winter.hours - winter.calmHours;
const selectedRun = windRunRecord(2, winter, winterEast.index);
assert.equal(selectedRun.prevailingName, "E");
assert.equal(selectedRun.prevailingFrom, winterEast.meanFrom);
assert.equal(selectedRun.prevailingShare, winterEast.hours / moving);
assert.equal(selectedRun.meanSpeed, winter.meanSpeed);
const prevailingRun = windRunRecord(3, winter, null);
assert.equal(prevailingRun.prevailingName, winter.prevailing?.name);
assert.equal(prevailingRun.prevailingShare, (winter.prevailing?.hours ?? 0) / moving);
const missingRun = windRunRecord(4, winter, 99);
assert.equal(missingRun.prevailingName, winter.prevailing?.name);

assert.match(WIND_HISTORY_NOTE, /1973–2005/);
assert.match(WIND_HISTORY_NOTE, /Miami International Airport/);
assert.match(WIND_HISTORY_NOTE, /One Herald Plaza/);
assert.match(WIND_HISTORY_NOTE, /not a live forecast/i);
assert.match(WIND_CALM_NOTE, /includes calm hours/);
assert.match(WIND_CALM_NOTE, /percentage leaves them out/);
assert.match(WIND_DIRECTION_NOTE, /Most frequent/);
assert.match(WIND_DIRECTION_NOTE, /Vector mean is speed-weighted/);

console.log("wind study checks passed");
console.log(`station ${distance.toFixed(1)} km`);
console.log(`winter ${winter.prevailing?.name} ${winter.meanSpeed.toFixed(1)} m/s`);
console.log(`summer ${summer.prevailing?.name} ${summer.meanSpeed.toFixed(1)} m/s`);
