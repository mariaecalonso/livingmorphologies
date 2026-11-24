import assert from "node:assert/strict";
import context from "@/data/skill5/herald-site.json";
import { readNetworkNode } from "@/components/site/site-network";
import { pointInRing } from "@/lib/skill5/placement";
import type { SiteContext } from "@/lib/skill5/site-model";
import { FLOW_SPACING_FEET } from "@/components/site/site-network-flow";
import { NETWORK_REACH_FT, STRATEGY_LAYOUT_DEFAULTS, buildStrategyLayouts } from "@/lib/skill5/strategy-layouts";

const site = context as SiteContext;
assert.equal(FLOW_SPACING_FEET, 15);
assert.equal(NETWORK_REACH_FT, 7.5);

const layouts = buildStrategyLayouts(site, { ...STRATEGY_LAYOUT_DEFAULTS });
assert.ok(layouts.length >= 4, "expected several layouts");
const ids = new Set(layouts.map((layout) => layout.id));
assert.equal(ids.size, layouts.length);
assert.equal(layouts.some((layout) => layout.id === "mapped-waterfront"), false);

for (const layout of layouts) {
  assert.equal(layout.seeds.length, 3);
  assert.ok(layout.nodes.some((node) => node.kind === "source"));
  assert.ok(layout.nodes.some((node) => node.kind === "attractor"));
  for (const node of layout.nodes) {
    assert.equal(pointInRing(node.x, node.z, site.site.ring), true, `${layout.id} ${node.id} left the parcel`);
    assert.equal(pointInRing(node.x, node.z, site.water.ring), false, `${layout.id} ${node.id} entered the bay`);
    assert.ok(node.strategy);
    assert.equal(node.strategy.layoutId, layout.id);
    if (node.strategy.origin === "measured-access") {
      assert.equal(node.strategy.unverified, true);
      assert.match(node.strategy.note, /not an entrance/);
    }
    if (node.strategy.origin === "city-edge" || node.strategy.origin === "mapped-approach") {
      assert.equal(node.strategy.unverified, false);
      assert.match(node.strategy.note, /Not a measured entrance|Not an entrance/);
    }
  }
}

const measured = layouts.find((layout) => layout.id === "measured-both-waterfront");
assert.ok(measured);
assert.equal(measured.nodes.filter((node) => node.strategy?.origin === "measured-access").length, 2);

function attractorsOf(id: string) {
  const layout = layouts.find((item) => item.id === id);
  assert.ok(layout);
  return layout.nodes.filter((node) => node.kind === "attractor");
}

for (const id of ["measured-herald-waterfront", "measured-both-waterfront"]) {
  const attractors = attractorsOf(id);
  const closest = [...attractors].sort((a, b) => (a.strategy?.waterfrontFeet ?? Infinity) - (b.strategy?.waterfrontFeet ?? Infinity))[0];
  const south = [...attractors].sort((a, b) => a.z - b.z)[0];
  const north = [...attractors].sort((a, b) => b.z - a.z)[0];
  assert.ok(closest.strategy?.waterfrontFeet != null);
  assert.ok(closest.z > south.z && closest.z < north.z, `${id} closest shore point is not between the ends`);
  assert.ok(closest.strategy.waterfrontFeet < (south.strategy?.waterfrontFeet ?? 0), `${id} south end is closer to the water than the middle`);
  assert.ok(closest.strategy.waterfrontFeet < (north.strategy?.waterfrontFeet ?? 0), `${id} north end is closer to the water than the middle`);
  assert.equal(closest.strategy.origin, "waterfront");
  for (const node of attractors) {
    if (node.strategy?.origin === "waterfront") continue;
    assert.equal(node.strategy?.origin, "internal");
    assert.match(node.strategy?.note ?? "", /does not make this a waterfront location/);
  }
}

const inland = attractorsOf("measured-northeast-internal");
assert.ok(inland.every((node) => node.strategy?.origin === "internal"));
const near = attractorsOf("measured-herald-waterfront").find((node) => node.strategy?.origin === "waterfront");
assert.ok(near?.strategy?.waterfrontFeet != null);
assert.ok(inland.every((node) => (node.strategy?.waterfrontFeet ?? 0) > (near.strategy?.waterfrontFeet ?? Infinity)));

const sets = layouts.map((layout) => layout.nodes.filter((node) => node.kind === "attractor").map((node) => `${node.x.toFixed(1)},${node.z.toFixed(1)}`).sort().join("|"));
assert.equal(new Set(sets).size, sets.length, "attractor distributions repeat");

const strong = buildStrategyLayouts(site, { ...STRATEGY_LAYOUT_DEFAULTS, emphasisIntensity: 0.9 });
const gentle = buildStrategyLayouts(site, { ...STRATEGY_LAYOUT_DEFAULTS, emphasisIntensity: 0.3 });
const reach = (list: typeof layouts) => {
  const nodes = list.find((layout) => layout.id === "measured-herald-waterfront")?.nodes.filter((node) => node.kind === "attractor") ?? [];
  return Math.min(...nodes.map((node) => node.strategy?.waterfrontFeet ?? Infinity));
};
assert.ok(reach(strong) < reach(gentle), "A higher intensity did not reach closer to the coastline.");

const city = layouts.find((layout) => layout.id === "city-edge-internal");
assert.ok(city);
assert.ok(city.nodes.some((node) => node.strategy?.origin === "city-edge"));
assert.equal(city.nodes.some((node) => node.strategy?.origin === "measured-access"), false);

const wider = buildStrategyLayouts(site, { ...STRATEGY_LAYOUT_DEFAULTS, cityEdgeSpacingFt: 360 });
const wideCity = wider.find((layout) => layout.id === "city-edge-internal");
assert.ok(wideCity);
assert.ok(wideCity.nodes.filter((node) => node.strategy?.origin === "city-edge").length <= city.nodes.filter((node) => node.strategy?.origin === "city-edge").length);

const withMapped = buildStrategyLayouts(site, { ...STRATEGY_LAYOUT_DEFAULTS, includeMappedApproaches: true });
assert.ok(withMapped.some((layout) => layout.id === "mapped-waterfront"));

const kept = readNetworkNode({
  id: "n1",
  kind: "source",
  x: 1,
  z: 2,
  strategy: measured.nodes[0].strategy,
  surface: "water",
  water: { widthFt: 80, landX: 3, landZ: 4 },
});
assert.ok(kept);
assert.equal(kept.strategy?.layoutId, "measured-both-waterfront");
assert.equal(kept.water?.widthFt, 80);
const plain = readNetworkNode({ id: "old", kind: "attractor", x: 5, z: 6 });
assert.ok(plain);
assert.equal(plain.strategy, undefined);
assert.equal(plain.water, undefined);

for (const layout of layouts) {
  const rows = layout.nodes.filter((node) => node.kind === "attractor").map((node) => `${node.strategy?.origin} ${node.x.toFixed(0)},${node.z.toFixed(0)} shore ${node.strategy?.waterfrontFeet?.toFixed(0)} rays ${node.strategy?.openRays}`);
  console.log(`${layout.id}: ${rows.join(" | ")}`);
}
console.log(`strategy layouts ok ${layouts.length} views ${layouts[0].viewsChecked}`);
