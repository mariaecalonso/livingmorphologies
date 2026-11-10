import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { SiteContext, XZ } from "./site-model";
import {
  CITY_ACCESS_LABEL,
  COAST_FEET,
  JOIN_FEET,
  MAPPED_OPENING_FEET,
  NORTHEAST_ACCESS_LABEL,
  PARCEL_FEET,
  PEDESTRIAN_LIMITS,
  PEDESTRIAN_SOURCES,
  attractorNote,
  countyLinks,
  linkedDistance,
  mappedLinks,
  pedestrianRun,
  pedestrianStudy,
  segmentDistance,
  stationAccount,
  type WalkLink,
} from "./pedestrian";
import { keepRuns } from "./sun-analysis";

const site = JSON.parse(readFileSync(new URL("../../data/skill5/herald-site.json", import.meta.url), "utf8")) as SiteContext;
const closed = [...site.site.ring, site.site.ring[0]] as XZ[];
const shore = site.coastline.path;

assert.equal(segmentDistance([0, 0], [10, 0], [0, 5], [10, 5]), 5);
assert.ok(segmentDistance([0, 0], [10, 0], [5, -1], [5, 4]) < 0.01);
assert.ok(Math.abs(segmentDistance([0, 0], [0, 0], [3, 4], [3, 4]) - 5) < 0.01);

assert.equal(PEDESTRIAN_SOURCES.proposed.geometry, null);
assert.equal(PEDESTRIAN_SOURCES.proposed.status, "proposed");
assert.ok(PEDESTRIAN_LIMITS.some((line) => /does not generate a Physarum network/.test(line)));
assert.ok(PEDESTRIAN_LIMITS.some((line) => /No pedestrian counts/.test(line)));
assert.equal(JSON.stringify(PEDESTRIAN_SOURCES).includes("ADA_Compliant"), false);

const study = pedestrianStudy(closed, shore);
assert.equal(study.countyCount, 95);
assert.equal(Math.round(study.countyFeet), 23524);
assert.equal(study.cityAccess.length, 1);
assert.equal(study.waterfrontAccess.length, 1);
assert.ok(Math.abs(study.cityAccess[0].gapFeet - 1.9) < 0.15);
assert.ok(study.waterfrontAccess[0].gapFeet < 0.05);
assert.equal(study.waterfrontAccess[0].name, "NE 15TH ST");
assert.equal(study.cityAccess[0].label, CITY_ACCESS_LABEL);
assert.equal(study.waterfrontAccess[0].label, NORTHEAST_ACCESS_LABEL);
assert.equal(Math.round(study.coastCountyFeet), 4458);
assert.equal(Math.round(study.coastCountyNearFeet), 799);
assert.equal(study.coastCountyCount, 4);
assert.ok(study.coastCountyFeet > study.coastCountyNearFeet);
assert.equal(Math.round(study.namedBaywalkFeet), 273);
assert.ok(study.namedBaywalkParcelFeet !== null && Math.abs(study.namedBaywalkParcelFeet - 856) < 2);
assert.equal(Math.round(study.coastMappedFeet), 18335);
assert.equal(study.museumConnected, false);
const arsht = study.stations.find((station) => station.name === "ADRIENNE ARSHT CENTER");
assert.ok(arsht);
assert.equal(arsht.routeFeet, null);
assert.ok(arsht.offsetFeet !== null && Math.abs(arsht.offsetFeet - 38) < 1);
assert.ok(study.mappedCrossings > 0);
assert.ok(study.cityAccess.some((item) => /HERALD/i.test(item.name)));
for (const item of [...study.cityAccess, ...study.waterfrontAccess]) {
  assert.ok(item.gapFeet <= PARCEL_FEET);
  assert.equal(item.gapFeet >= 0, true);
}
const connected = study.stations.filter((station) => station.routeFeet !== null);
for (const station of connected) {
  assert.ok((station.offsetFeet ?? 999) <= 80);
  assert.ok((station.routeFeet ?? -1) >= 0);
}
assert.equal(study.museumConnected, connected.some((station) => station.name === "MUSEUM PARK"));
assert.match(attractorNote(study), /No Physarum network is generated/);
assert.match(attractorNote(study), /not confirmed entrances/);
assert.match(attractorNote(study), /not a Baywalk connection/);
assert.match(attractorNote(study), new RegExp(CITY_ACCESS_LABEL));
assert.match(attractorNote(study), new RegExp(NORTHEAST_ACCESS_LABEL));
assert.equal(JSON.stringify(attractorNote(study)).includes("waterfront entry"), false);
assert.ok(study.attractors.every((item) => item.status === "unverified"));
assert.ok(study.attractors.every((item) => item.role === CITY_ACCESS_LABEL || item.role === NORTHEAST_ACCESS_LABEL || item.role === "transit"));
assert.ok(PEDESTRIAN_LIMITS.some((line) => /11\.9 ft/.test(line)));
assert.ok(PEDESTRIAN_LIMITS.some((line) => /not Baywalk continuity/.test(line)));
for (const station of study.stations) assert.equal(station.routeFeet, null);
const museum = study.stations.find((station) => station.name === "MUSEUM PARK");
assert.ok(museum);
assert.equal(museum.mappedReach, "short");
assert.ok(museum.mappedGapFeet !== null && Math.abs(museum.mappedGapFeet - 138) < 2);
assert.match(stationAccount(museum), /stop \d[\d,]* ft short/);
for (const name of ["ELEVENTH STREET", "SCHOOL BOARD", "ADRIENNE ARSHT CENTER"]) {
  const station = study.stations.find((item) => item.name === name);
  assert.ok(station);
  assert.equal(station.mappedReach, "opening");
  assert.match(stationAccount(station), /unverified gaps of up to 11\.9 ft/);
}
const baywalkRun = pedestrianRun(1, "baywalk", study);
assert.match(baywalkRun.primary, /4,458 ft full, 799 ft in the buffer/);
assert.match(baywalkRun.secondary, /273 ft named Baywalk, separate from the parcel/);
const accessRun = pedestrianRun(1, "access", study);
assert.equal(accessRun.primary, CITY_ACCESS_LABEL);
assert.equal(accessRun.secondary, NORTHEAST_ACCESS_LABEL);
assert.equal(accessRun.title, "Unverified attractors");

const joined = linkedDistance(
  [
    { id: "a", name: "A", status: "existing", authority: "county", kind: "sidewalk", path: [[0, 0], [100, 0]] },
    { id: "b", name: "B", status: "existing", authority: "county", kind: "sidewalk", path: [[105, 0], [105, 80]] },
  ],
  [0, 0],
  [105, 80],
);
assert.ok(joined !== null && Math.abs(joined - 185) < 0.1);
const separated = linkedDistance(
  [
    { id: "a", name: "A", status: "existing", authority: "county", kind: "sidewalk", path: [[0, 0], [100, 0]] },
    { id: "b", name: "B", status: "existing", authority: "county", kind: "sidewalk", path: [[140, 0], [140, 80]] },
  ],
  [0, 0],
  [140, 80],
);
assert.equal(separated, null);
assert.equal(JOIN_FEET, 12);
assert.equal(COAST_FEET, 80);

function lineGap(a: WalkLink, b: WalkLink) {
  let best = Infinity;
  for (let i = 1; i < a.path.length; i += 1) {
    for (let j = 1; j < b.path.length; j += 1) best = Math.min(best, segmentDistance(a.path[i - 1], a.path[i], b.path[j - 1], b.path[j]));
  }
  return best;
}
const parent: number[] = [];
const owner: WalkLink[] = [];
const nodes: XZ[] = [];
const ends: number[] = [];
const find = (index: number): number => (parent[index] === index ? index : (parent[index] = find(parent[index])));
for (const link of [...countyLinks, ...mappedLinks.filter((link) => link.kind !== "steps")]) {
  let previous = nodes.length;
  nodes.push(link.path[0]);
  owner.push(link);
  parent.push(previous);
  ends.push(previous);
  for (let index = 1; index < link.path.length; index += 1) {
    const current = nodes.length;
    nodes.push(link.path[index]);
    owner.push(link);
    parent.push(current);
    parent[find(previous)] = find(current);
    previous = current;
  }
  ends.push(previous);
}
let widestOpening = 0;
for (const end of ends) {
  for (let index = 0; index < nodes.length; index += 1) {
    if (owner[index] === owner[end]) continue;
    const feet = Math.hypot(nodes[end][0] - nodes[index][0], nodes[end][1] - nodes[index][1]);
    if (feet <= 0.5 || feet > JOIN_FEET || find(end) === find(index)) continue;
    widestOpening = Math.max(widestOpening, lineGap(owner[end], owner[index]));
    parent[find(end)] = find(index);
  }
}
assert.ok(Math.abs(widestOpening - MAPPED_OPENING_FEET) < 0.05);

const kept = keepRuns([], pedestrianRun(0, "network", study));
assert.equal(kept.length, 1);
assert.match(kept[0].primary, /ft/);

console.log("pedestrian checks passed");
console.log(`county ${study.countyCount} links, ${study.countyFeet.toFixed(0)} ft; crossings ${study.mappedCrossings}; steps ${study.mappedSteps}`);
console.log(`city ${study.cityAccess.map((item) => `${item.name} ${item.gapFeet.toFixed(1)}`).join(" | ")}`);
console.log(`waterfront ${study.waterfrontAccess.map((item) => `${item.name} ${item.gapFeet.toFixed(1)}`).join(" | ") || "none"}`);
console.log(study.stations.map((station) => `${station.name} route ${station.routeFeet === null ? "none" : station.routeFeet.toFixed(0)} offset ${station.offsetFeet === null ? "none" : station.offsetFeet.toFixed(0)} open ${station.openFlag}`).join(" | "));
console.log(`coast county ${study.coastCountyCount} ${study.coastCountyFeet.toFixed(0)} ft; mapped ${study.coastMappedCount} ${study.coastMappedFeet.toFixed(0)} ft; museum ${study.museumConnected}`);
console.log(`attractors ${study.attractors.length}`);
