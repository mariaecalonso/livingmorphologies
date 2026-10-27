import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { continuousDeck, elevatedDeckRoads, networkLinks } from "./deck-surface";
import { pavementSection } from "./pavement-edges";
import type { SiteRoad } from "./site-model";

function road(partial: Partial<SiteRoad> & Pick<SiteRoad, "path">): SiteRoad {
  return {
    name: "Test",
    kind: "causeway",
    displayHalfWidthFeet: 18,
    elevated: true,
    ...partial,
  };
}

const dipped = road({
  path: [[0, 0], [40, 0], [80, 0], [100, 0], [400, 0], [480, 0]],
  deckFeet: [20, null, 24, null, 30, 32],
});
const runs = elevatedDeckRoads([dipped]);
assert.equal(runs.length, 1, "a missing deck sample stays on the same road");
assert.equal(runs[0].deckFeet?.[1], 22);
assert.ok(Math.abs((runs[0].deckFeet?.[3] ?? 0) - 24.375) < 0.01);

const eastbound = road({
  name: "East",
  path: [[0, 0], [100, 0]],
  deckFeet: [18, 20],
});
const continued = road({
  name: "East",
  path: [[130, 2], [220, 2]],
  deckFeet: [21, 22],
});
const parallel = road({
  name: "West",
  path: [[100, 40], [0, 40]],
  deckFeet: [20, 18],
});
const linked = networkLinks([eastbound, continued, parallel]);
const stitches = linked.filter((item) => item.path.length === 2 && item.path[0][1] === 0 && item.path[1][0] === 130);
assert.equal(stitches.length, 1, "a continuing end is joined");
assert.equal(stitches[0].deckFeet?.[0], 20);
assert.equal(stitches[0].deckFeet?.[1], 21);
assert.ok(!linked.some((item) => item.path.length === 2 && item.path[0][1] === 0 && item.path[1][1] === 40), "a parallel carriageway is not stitched across the median");
const biscayneA = road({ name: "Biscayne Boulevard", kind: "local", elevated: false, path: [[0, 0], [80, 0]], deckFeet: undefined });
const biscayneB = road({ name: "Biscayne Boulevard", kind: "local", elevated: false, path: [[120, 0], [200, 0]] });
const highway = road({ name: "I 395", kind: "expressway", path: [[0, 80], [100, 80]], deckFeet: [40, 42] });
const street = road({ name: "Northeast 11th Street", kind: "local", elevated: false, path: [[140, 80], [220, 80]] });
const joined = networkLinks([biscayneA, biscayneB, highway, street]);
assert.equal(joined.filter((item) => item.name === "Biscayne Boulevard").length, 1, "a street continues across a short gap");
assert.equal(joined.filter((item) => item.name === "I 395" || item.name === "Northeast 11th Street").length, 0, "a local street is not joined to the elevated highway");

const gapped: SiteRoad = {
  name: "Gap",
  kind: "expressway",
  displayHalfWidthFeet: 12,
  elevated: true,
  path: [[0, 0], [40, 0], [80, 0], [400, 0], [440, 0]],
  deckFeet: [10, null, 12, 20, 22],
  halfWidthFeet: [15, 16, 17, 18, 19],
  centerShiftFeet: [1, 2, 3, 4, 5],
};
const kept = continuousDeck(gapped);
assert.deepEqual(kept.halfWidthFeet, [15, 16, 17, 18, 19]);
assert.deepEqual(kept.centerShiftFeet, [1, 2, 3, 4, 5]);
assert.equal(kept.deckFeet?.[1], 11);

const section = pavementSection([0, 0], [1, 0], [[[0, 20], [10, 20]], [[0, -10], [10, -10]]]);
assert.ok(section);
assert.equal(section?.half, 15);
assert.equal(section?.shift, 5);

const site = JSON.parse(readFileSync(new URL("../../data/skill5/herald-site.json", import.meta.url), "utf8"));
assert.equal(site.site.ring[0][0], 255.89);
assert.ok(!site.buildings.some((building: { id: number }) => building.id === 2227150 || building.id === 5653720));
const configurations = JSON.parse(readFileSync(new URL("../../data/skill5/configurations.json", import.meta.url), "utf8"));
const saved = configurations.configurations.find((item: { id: string }) => item.id === "C01");
assert.equal(saved.modules[0].transform.position.z, -120);
const herald = site.roads.filter((road: SiteRoad) => road.name === "Herald Plaza" && road.widthSource === "pavement-edge");
assert.ok(herald.length > 0, "Herald Plaza uses measured pavement edges");
const heraldWidths = herald.flatMap((road: SiteRoad) => (road.halfWidthFeet ?? []).filter((value): value is number => typeof value === "number")).map((value: number) => value * 2);
const heraldMean = heraldWidths.reduce((sum: number, value: number) => sum + value, 0) / heraldWidths.length;
assert.ok(heraldMean > 40 && heraldMean < 60, "Herald Plaza pavement is wider than the old 24-foot ribbon");
const marquis = site.buildings.find((building: { name: string | null }) => building.name === "Marquis Miami");
const quantum = site.buildings.find((building: { name: string | null }) => building.name === "Quantum on the Bay");
assert.equal(marquis.heightSource, "osm-height");
assert.equal(quantum.heightSource, "estimated");
assert.equal(quantum.heightFeet, 130);
assert.ok(site.buildings.every((building: { heightFeet: number | null }) => building.heightFeet != null));
assert.ok(site.roads.every((road: SiteRoad) => !road.halfWidthFeet || road.halfWidthFeet.every((value) => typeof value === "number")));

console.log("skill5 deck cleanup checks passed");
