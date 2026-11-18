/**
 * Rule-Based engine. The existing coverage solver chooses and validates poses.
 * Rule sets run in sequence on one evaluation budget. Each later set carries a
 * tabu list: the seed-to-first-guest pairs used by earlier sets are withheld, so
 * it must open a different valid placement. Distinct results are ranked by the
 * shared whole-cluster reading; Integrated cycles organization profiles and takes
 * their Pareto front. This file does not reimplement seating.
 */
import { SKILL6_COVERAGE_ALGORITHM, SKILL6_GROWTH_DIRECTIONS, type ClusterMorphology, type ClusterRecord } from "../contract";
import { aggregateCoverage } from "../grow";
import type { ArchetypeMesh } from "../source";
import { placementKey, type EngineJob, type EngineOutcome } from "./board";
import { rankReadings, readShape } from "./morphology";
import type { DockPool } from "./pool";

type RuleSet = { name: string; organization: ClusterMorphology };

const MIN_SHARE = 80;

function ruleSets(job: EngineJob): RuleSet[] {
  const cycle: ClusterMorphology[] = job.morphology === "integrated" ? ["integrated", "branching", "vertical", "compact"] : [job.morphology, job.morphology, job.morphology, job.morphology];
  return cycle.map((organization, index) => ({ name: index === 0 ? `${organization} rules` : `${organization} rules, tabu ${index}`, organization }));
}

export function runRule(meshes: readonly ArchetypeMesh[], pool: DockPool, job: EngineJob): EngineOutcome {
  const started = Date.now();
  const byId = new Map(meshes.map((mesh) => [mesh.archetypeId, mesh]));
  const sets = ruleSets(job);
  const budget = job.budget ?? 120 * job.tiles;
  const results: { set: RuleSet; record: ClusterRecord }[] = [];
  const tabu = new Set<string>();
  let evaluations = 0;
  for (const set of sets) {
    const left = budget - evaluations;
    if (left < MIN_SHARE) break;
    const record = aggregateCoverage(meshes, {
      id: job.id,
      seed: job.seed,
      tiles: job.tiles,
      rootId: job.rootId,
      compatibility: { poses: (hostId, guestId) => (hostId === job.rootId && tabu.has(guestId) ? [] : pool.knownFor(hostId, guestId)) },
      triesPerDepth: 96,
      budget: { evaluations: left, backtracks: job.backtracks ?? 8 },
      directions: SKILL6_GROWTH_DIRECTIONS,
      order: "spread",
      aims: false,
      select: "scored",
      organization: set.organization,
      profile: 2,
      algorithm: SKILL6_COVERAGE_ALGORITHM,
    });
    evaluations += record.search?.evaluations ?? 0;
    results.push({ set, record });
    const first = record.tiles[1];
    if (first) tabu.add(first.archetypeId);
  }
  const seen = new Set<string>();
  const distinct = results.filter((item) => {
    const key = placementKey(item.record.tiles);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const readings = distinct.map((item) => readShape(item.record.tiles, item.record.contacts, byId));
  const ranked = rankReadings(job.morphology, readings).map((index) => distinct[index]);
  const notes = results.map((item) => `${item.set.name} ${item.record.tiles.length}/${job.tiles}`).join(" · ");
  const records = ranked.slice(0, 4).map((item, rank) => {
    const record = item.record;
    record.id = rank === 0 ? job.id : `${job.id}-alt${rank}`;
    if (record.search) {
      record.search.engine = "rule-based";
      record.search.organization = job.morphology;
      record.search.milliseconds = Date.now() - started;
      record.search.trace = `aggregateCoverage portfolio on the checked pool, ${evaluations} evaluations, chosen ${item.set.name}: ${notes}`;
    }
    return record;
  });
  return { record: records[0], alternatives: records.slice(1) };
}
