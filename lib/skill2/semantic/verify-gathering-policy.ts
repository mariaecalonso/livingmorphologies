import { attractorsFromFlatDeep } from "../../skill1/run-flat-deep-plan";
import { attractorsFromInsertedPlate } from "../../skill1/run-inserted-horizontal-plate";
import { mulberry32 } from "../../physarum";
import { GATHERING_ARCHETYPE_IDS, createGatheringAdapter } from "./gathering-adapter";
import { archetypeHasRefineGene, diversityGenes, mutateByPolicy } from "./policy";
import { createSearchAdapter } from "./registry";
import { semanticProductionConfig } from "./lobby-semantic-v1";
import { WORKSPACE_ARCHETYPE_IDS } from "./workspace-adapter";

const assert = (condition: boolean, message: string) => {
  if (!condition) throw new Error(message);
};

for (const archetypeId of GATHERING_ARCHETYPE_IDS) {
  const adapter = createGatheringAdapter(archetypeId);
  const sampled = adapter.sampleExplorer(mulberry32(3));
  const repaired = adapter.repair(sampled.plan);
  assert(repaired.ok, `${archetypeId} sample does not repair`);
  const pareto = mutateByPolicy(adapter, sampled.plan, sampled.state, "local-refinement", mulberry32(9));
  const diversity = mutateByPolicy(adapter, sampled.plan, sampled.state, "morphological-exploration", mulberry32(11));
  if (archetypeId === "stepped-amphitheater") {
    assert(archetypeHasRefineGene(adapter), "stepped amphitheater refines its unscaled bands");
    assert(pareto.status === "changed", "stepped Pareto mutation changes a band");
    if (pareto.status === "changed") {
      assert(pareto.changes.length === 1, "stepped Pareto changes one gene");
      const span = adapter.span?.(pareto.plan, pareto.changes[0].field);
      const value = pareto.changes[0].repairedValue;
      assert(span != null && typeof value === "number" && value >= span.low && value <= span.high, "the repaired value stays inside the Skill 1 band");
    }
    assert(diversity.status === "rejected", "stepped amphitheater has no growth switch");
  } else if (archetypeId === "inserted-horizontal-plate") {
    assert(!archetypeHasRefineGene(adapter), "inserted plate has no refinement gene");
    assert(pareto.status === "rejected", "inserted plate proportion slots stay explorers");
    assert(diversity.status === "changed", "inserted plate diversity changes the arrangement");
    if (diversity.status === "changed") {
      assert(diversity.changes[0].field === "variant", "inserted plate diversity stays on the arrangement");
      assert(adapter.readGene(diversity.plan, "org") === adapter.readGene(sampled.plan, "org"), "inserted plate keeps the organization");
    }
  } else {
    assert(!archetypeHasRefineGene(adapter), `${archetypeId} does not invent a refinement span`);
    assert(diversity.status === "changed", `${archetypeId} diversity changes growth`);
    if (diversity.status === "changed") {
      const field = diversity.changes[0].field;
      assert(field === "growth", `${archetypeId} diversity stayed on ${field}`);
      assert(diversity.changes[0].oldValue !== diversity.changes[0].requestedValue, `${archetypeId} diversity value changes`);
      if (adapter.primaryFamilyGene) {
        assert(
          adapter.readGene(diversity.plan, adapter.primaryFamilyGene) === adapter.readGene(sampled.plan, adapter.primaryFamilyGene),
          `${archetypeId} keeps the sampled family`,
        );
      }
    }
  }
}

const edge = createGatheringAdapter("linear-edge-gallery");
const edgeSample = edge.sampleExplorer(mulberry32(1));
const nextKind = edge.genes().find((gene) => gene.name === "kind")?.legal?.find((value) => value !== edge.readGene(edgeSample.plan, "kind"));
const rewritten = edge.writeGene(edgeSample.plan, "kind", nextKind);
assert(edge.readGene(rewritten, "kind") === nextKind, "linear edge writes the family the realization reads");

const voidAdapter = createGatheringAdapter("void-field");
const voidSample = voidAdapter.sampleExplorer(mulberry32(2));
const nextMode = voidAdapter.genes().find((gene) => gene.name === "mode")?.legal?.find((value) => value !== voidAdapter.readGene(voidSample.plan, "mode"));
const voidRewritten = voidAdapter.writeGene(voidSample.plan, "mode", nextMode);
assert(voidAdapter.readGene(voidRewritten, "mode") === nextMode, "void field writes the mode");
assert(voidAdapter.readGene(voidRewritten, "growth") === voidAdapter.readGene(voidSample.plan, "growth"), "a family change keeps the growth gene");

for (const archetypeId of GATHERING_ARCHETYPE_IDS) {
  const adapter = createSearchAdapter(archetypeId);
  const sampled = adapter.sampleExplorer(mulberry32(4));
  const realized = adapter.realize?.(sampled.plan, sampled.state);
  assert(realized?.ok === true && realized.agents > 0, `${archetypeId} realization is ready for the shared scorer`);
  const config = semanticProductionConfig(archetypeId);
  assert(config.paretoMutation?.fieldCount === 1 && !config.paretoMutation.fields, `${archetypeId} uses the shared role policy`);
}

const plate = createGatheringAdapter("inserted-horizontal-plate");
const plateSample = plate.sampleExplorer(mulberry32(6));
const plateChild = mutateByPolicy(plate, plateSample.plan, plateSample.state, "morphological-exploration", mulberry32(7));
assert(plateChild.status === "changed", "inserted plate child changes");
if (plateChild.status === "changed") {
  const before = JSON.stringify(attractorsFromInsertedPlate(plateSample.plan.body as never));
  const after = JSON.stringify(attractorsFromInsertedPlate(plateChild.plan.body as never));
  assert(before !== after, "inserted plate arrangement changes the drawing");
}

const deep = createSearchAdapter("flat-deep-plan");
const deepSample = deep.sampleExplorer(mulberry32(8));
const deepChild = mutateByPolicy(deep, deepSample.plan, deepSample.state, "morphological-exploration", mulberry32(9));
assert(deepChild.status === "changed", "flat deep diversity changes the cycle");
if (deepChild.status === "changed") {
  assert(deepChild.changes[0].field === "cycle", "flat deep diversity stays on the cycle");
  assert(deep.readGene(deepChild.plan, "kind") === deep.readGene(deepSample.plan, "kind"), "flat deep keeps the kind");
  const before = JSON.stringify(attractorsFromFlatDeep(deepSample.plan.body as never));
  const after = JSON.stringify(attractorsFromFlatDeep(deepChild.plan.body as never));
  assert(before !== after, "flat deep cycle changes the section");
}

for (const archetypeId of WORKSPACE_ARCHETYPE_IDS) {
  const adapter = createSearchAdapter(archetypeId);
  const sampled = adapter.sampleExplorer(mulberry32(4));
  const realized = adapter.realize?.(sampled.plan, sampled.state);
  assert(realized?.ok === true && realized.agents > 0, `${archetypeId} realization is ready for the shared scorer`);
  assert(adapter.span?.(sampled.plan, "kind") == null, `${archetypeId} has no invented proportion span`);
  assert(semanticProductionConfig(archetypeId).populationSize === 100, `${archetypeId} already has the production config`);
}

console.log("gathering policy checks passed");
