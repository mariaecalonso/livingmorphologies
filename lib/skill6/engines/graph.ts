/**
 * Graph-Based engine. A connectivity plan is chosen first: how many nodes sit in
 * each generation. A node may attach to any tile of the previous generation.
 * Each plan is realized on the shared board with depth-first backtracking.
 * Edges into a node that must host later generations prefer guests with more
 * outgoing candidates in the pool graph. The realized plans are ranked by the
 * shared whole-cluster reading.
 */
import { SKILL6_GRAPH_ALGORITHM, type ClusterMorphology, type SearchStats } from "../contract";
import { finish, placementKey, type Board, type EngineJob, type EngineOutcome, type Placement } from "./board";
import type { DockCandidate, DockPool } from "./pool";

/** Generation of every node. Node 0 is the seed. */
type Plan = { name: string; generation: number[] };

const WIDTH = 8;

function plans(tiles: number, morphology: ClusterMorphology): Plan[] {
  const make = (name: string, sizes: (generation: number) => number): Plan => {
    const generation = [0];
    for (let level = 1; generation.length < tiles; level += 1) {
      for (let count = 0; count < sizes(level) && generation.length < tiles; count += 1) generation.push(level);
    }
    return { name, generation };
  };
  const wide = make("wide fan", (level) => (level === 1 ? 3 : 3));
  const paired = make("paired generations", () => 2);
  const widening = make("widening", (level) => level);
  const chain = make("chain", () => 1);
  if (morphology === "compact") return [wide, widening, paired, chain];
  if (morphology === "branching") return [paired, widening, wide, chain];
  if (morphology === "vertical") return [chain, paired, widening, wide];
  return [widening, paired, chain, wide];
}

export function runGraph(board: Board, pool: DockPool, job: EngineJob): EngineOutcome {
  const started = Date.now();
  const budget = job.budget ?? 120 * job.tiles;
  const root = board.seed(job.rootId);
  const degree = new Map<string, number>();
  for (const candidate of pool.candidates) degree.set(candidate.host, (degree.get(candidate.host) ?? 0) + 1);
  const found: Placement[] = [];
  const notes: string[] = [];
  const planByPlacement = new Map<string, { name: string; stop: "reached" | "budget" | "candidates"; rejection: string | null; tests: number }>();
  let evaluations = 0;
  let backtracks = 0;
  let reason: string | null = root.tiles.length === 0 ? `${job.rootId} is not in the archetype set.` : null;
  const list = plans(job.tiles, job.morphology);

  list.forEach((plan, planIndex) => {
    if (root.tiles.length === 0) return;
    const limit = board.tests + Math.floor((budget - board.tests) / (list.length - planIndex));
    const deepest = plan.generation[plan.generation.length - 1];
    const nextSize = (level: number) => plan.generation.filter((value) => value === level + 1).length;
    let best: Placement = root;
    let complete: Placement | null = null;

    const weight = (placement: Placement, node: number, hostSlot: number, candidate: DockCandidate) => {
      const parentTile = placement.tiles[hostSlot];
      const repeats = placement.tiles.filter((tile) => tile.archetypeId === candidate.guest).length;
      const siblings = placement.contacts.filter((contact) => contact.hostId === parentTile.instanceId);
      const sameFace = siblings.some((contact) => contact.searchNote.split(" ")[0] === candidate.direction);
      const level = plan.generation[node];
      const outgoing = degree.get(candidate.guest) ?? 0;
      let score = Math.min(candidate.area, 60) * 0.04 - repeats * 0.8 - (sameFace ? 1.5 : 0);
      if (level < deepest) score += Math.min(outgoing, 12) / 12 * 1.5 - (outgoing < 2 ? 2 : 0);
      if (job.morphology === "branching") score -= siblings.length * 0.6;
      if (job.morphology === "vertical" && candidate.direction === "+Z") score += 1.5;
      if (job.morphology === "compact") score -= Math.hypot(...candidate.pose.translation) * 0.02 - (hostSlot === 0 ? 0.5 : 0);
      return score;
    };

    let deviations = 0;
    let planStop: "reached" | "budget" | "candidates" = "candidates";
    let planReason: string | null = null;
    const testsBefore = board.tests;
    const realize = (placement: Placement, node: number, generationOf: number[]): boolean => {
      if (placement.tiles.length > best.tiles.length) best = placement;
      if (node >= job.tiles) {
        complete = placement;
        planStop = "reached";
        return true;
      }
      const level = plan.generation[node];
      const rank = (slots: number[]) => slots
        .flatMap((hostSlot) => pool.forHost(placement.tiles[hostSlot].archetypeId).map((candidate) => ({ hostSlot, candidate, score: weight(placement, node, hostSlot, candidate) })))
        .sort((left, right) => right.score - left.score)
        .slice(0, WIDTH + nextSize(level - 1));
      const planned = generationOf.map((value, slot) => (value === level - 1 ? slot : -1)).filter((slot) => slot >= 0);
      const deeper = generationOf.map((value, slot) => (value >= level ? slot : -1)).filter((slot) => slot >= 0);
      for (const [options, deviated] of [[rank(planned), false], [rank(deeper), true]] as const) {
        for (const option of options) {
          if (board.tests >= limit) {
            planStop = "budget";
            return false;
          }
          evaluations += 1;
          const result = board.tryAttach(placement, option.hostSlot, option.candidate);
          if (!result.ok) {
            planReason = result.reason;
            reason = result.reason;
            continue;
          }
          if (deviated) deviations += 1;
          if (realize(result.placement, node + 1, [...generationOf, generationOf[option.hostSlot] + 1])) return true;
          backtracks += 1;
        }
      }
      return false;
    };

    realize(root, 1, [0]);
    const done = complete as Placement | null;
    found.push(done ?? best);
    const placedTiles = done ?? best;
    const placed = placedTiles.tiles.length;
    if (placed >= job.tiles) planStop = "reached";
    planByPlacement.set(placementKey(placedTiles.tiles), { name: plan.name, stop: planStop, rejection: planReason, tests: board.tests - testsBefore });
    const rejection = planStop === "reached" ? "" : ` · last contact: ${planReason ?? "none"}`;
    notes.push(`${plan.name} ${placed}/${job.tiles}${deviations ? ` (${deviations} deeper)` : ""} · stop ${planStop} · ${board.tests - testsBefore} tests${rejection}`);
  });

  const search = (placement: Placement): SearchStats => {
    const reached = placement.tiles.length >= job.tiles;
    return {
      evaluations,
      acceptedPoses: Math.max(0, placement.tiles.length - 1),
      backtracks,
      milliseconds: Date.now() - started,
      exhausted: !reached,
      truncated: board.tests >= budget,
      untried: 0,
      geometricRejections: Math.max(0, evaluations - placement.tiles.length + 1),
      rejectionCounts: { intersection: 0, containment: 0, contact: Math.max(0, evaluations - placement.tiles.length + 1) },
      depthLimit: WIDTH,
      stop: reached ? "reached" : board.tests >= budget ? "exhausted" : "geometric",
      organization: job.morphology,
      engine: "graph-based",
      trace: `graph plans then realize, ${board.tests} tests, ${backtracks} backtracks: ${notes.join(" · ")}`,
    };
  };
  return finish(board, job, found, SKILL6_GRAPH_ALGORITHM, search, (placement) => {
    if (placement.tiles.length >= job.tiles) return null;
    const plan = planByPlacement.get(placementKey(placement.tiles));
    if (!plan) return `Graph realization stopped at ${placement.tiles.length} of ${job.tiles}.`;
    if (plan.stop === "budget") return `${plan.name} exhausted its search budget at ${placement.tiles.length} of ${job.tiles} after ${plan.tests} tests. Last contact rejection, not the reason the plan stopped: ${plan.rejection ?? "none"}.`;
    return `${plan.name} had no further accepted candidate at ${placement.tiles.length} of ${job.tiles}. Last contact rejection: ${plan.rejection ?? "none"}.`;
  });
}
