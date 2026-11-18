/**
 * Evolutionary search. A genome is a list of discrete docking choices (host slot, candidate).
 * Replay seats each gene on the shared board. A failed gene is repaired from the same
 * host or the genome is cut there. Five mutation operators and one-point crossover
 * make children. Tournament selection keeps two elites. Duplicate phenotypes are
 * replaced by random immigrants. Integrated uses non-dominated sorting and crowding
 * distance on compact, branching, and vertical. Refinement is not called here.
 */
import { SKILL6_EVOLUTION_ALGORITHM, type SearchStats } from "../contract";
import { finish, placementKey, type Board, type EngineJob, type EngineOutcome, type Placement } from "./board";
import { morphologyScore, paretoRanks, readShape, type ShapeReading } from "./morphology";
import { preference, spreadByDirection, type DockCandidate, type DockPool } from "./pool";

type Gene = { hostSlot: number; candidate: DockCandidate };
type Individual = { genes: Gene[]; placement: Placement; reading: ShapeReading; key: string; rank: number; crowd: number; score: number };

const POPULATION = 12;
const GENERATIONS = 10;
const TOURNAMENT = 3;
const ELITE = 2;
const REPAIR = 4;

function randomOf(seed: number) {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let next = state;
    next = Math.imul(next ^ (next >>> 15), next | 1);
    next ^= next + Math.imul(next ^ (next >>> 7), next | 61);
    return ((next ^ (next >>> 14)) >>> 0) / 4294967296;
  };
}

export function runEvolution(board: Board, pool: DockPool, job: EngineJob): EngineOutcome {
  const started = Date.now();
  const budget = job.budget ?? 120 * job.tiles;
  const random = randomOf(job.seed + [...job.morphology].reduce((sum, letter) => sum * 31 + letter.charCodeAt(0), 7));
  const root = board.seed(job.rootId);
  const pick = <T,>(list: readonly T[]): T | undefined => list[Math.floor(random() * list.length)];
  const stats = { replays: 0, repairs: 0, immigrants: 0, duplicates: 0, generations: 0 };
  const spent = () => board.tests >= budget;

  const evaluate = (placement: Placement, genes: Gene[]): Individual => {
    const reading = readShape(placement.tiles, placement.contacts, board.byId);
    return { genes, placement, reading, key: placementKey(placement.tiles), rank: 0, crowd: 0, score: morphologyScore(job.morphology, reading) };
  };

  const randomGene = (placement: Placement): Gene | null => {
    const hostSlot = Math.floor(random() * placement.tiles.length);
    const candidate = pick(pool.forHost(placement.tiles[hostSlot].archetypeId));
    return candidate ? { hostSlot, candidate } : null;
  };

  /** Seat genes in order. A failure is repaired from the same host slot, or the genome stops there. */
  const replay = (genes: readonly Gene[]): Individual => {
    stats.replays += 1;
    let placement = root;
    const kept: Gene[] = [];
    for (const gene of genes) {
      if (kept.length + 1 >= job.tiles || spent()) break;
      const hostSlot = Math.min(gene.hostSlot, placement.tiles.length - 1);
      let attempt: Gene | null = placement.tiles[hostSlot].archetypeId === gene.candidate.host ? { hostSlot, candidate: gene.candidate } : null;
      let seated = attempt ? board.tryAttach(placement, attempt.hostSlot, attempt.candidate) : null;
      for (let repair = 0; (!seated || !seated.ok) && repair < REPAIR && !spent(); repair += 1) {
        const candidate = pick(pool.forHost(placement.tiles[hostSlot].archetypeId));
        if (!candidate) break;
        attempt = { hostSlot, candidate };
        seated = board.tryAttach(placement, hostSlot, candidate);
        if (seated.ok) stats.repairs += 1;
      }
      if (!attempt || !seated || !seated.ok) break;
      kept.push(attempt);
      placement = seated.placement;
    }
    return evaluate(placement, kept);
  };

  /** Random growth to the target from a genome prefix. */
  const grow = (genes: readonly Gene[]): Gene[] => {
    const individual = replay(genes);
    let placement = individual.placement;
    const out = individual.genes.slice();
    while (placement.tiles.length < job.tiles && !spent()) {
      let placed = false;
      for (let attempt = 0; attempt < 8 && !spent(); attempt += 1) {
        const gene = randomGene(placement);
        if (!gene) continue;
        const result = board.tryAttach(placement, gene.hostSlot, gene.candidate);
        if (!result.ok) continue;
        out.push(gene);
        placement = result.placement;
        placed = true;
        break;
      }
      if (!placed) break;
    }
    return out;
  };

  /** Ordered growth by the morphology preference, entered at a different offset. */
  const guided = (offset: number): Gene[] => {
    let placement = root;
    const genes: Gene[] = [];
    while (placement.tiles.length < job.tiles && !spent()) {
      const used = new Set(placement.contacts.map((contact) => contact.searchNote.split(" ")[0]));
      const options = spreadByDirection(
        placement.tiles.flatMap((tile, hostSlot) => pool.forHost(tile.archetypeId).map((candidate) => ({
          hostSlot,
          candidate,
          score: preference(job.morphology, candidate, used, placement.contacts.filter((contact) => contact.hostId === tile.instanceId).length),
        }))).sort((left, right) => right.score - left.score),
        (option) => option.candidate.direction,
      );
      let placed = false;
      for (let attempt = 0; attempt < Math.min(options.length, 16) && !spent(); attempt += 1) {
        const option = options[(offset + attempt) % options.length];
        const result = board.tryAttach(placement, option.hostSlot, option.candidate);
        if (!result.ok) continue;
        genes.push({ hostSlot: option.hostSlot, candidate: option.candidate });
        placement = result.placement;
        placed = true;
        break;
      }
      if (!placed) break;
    }
    return genes;
  };

  const mutate = (parent: Individual): Gene[] => {
    const genes = parent.genes.map((gene) => ({ ...gene }));
    const roll = random();
    if (genes.length === 0 || roll < 0.15) return grow(genes);
    const index = Math.floor(random() * genes.length);
    if (roll < 0.35) {
      const alternative = pick(pool.forPair(genes[index].candidate.host, genes[index].candidate.guest));
      if (alternative) genes[index] = { ...genes[index], candidate: alternative };
      return genes;
    }
    if (roll < 0.55) {
      const alternative = pick(pool.forHost(genes[index].candidate.host));
      if (alternative) genes[index] = { ...genes[index], candidate: alternative };
      return genes;
    }
    if (roll < 0.75) {
      const hostSlot = Math.floor(random() * (index + 1));
      const host = parent.placement.tiles[hostSlot];
      const alternative = host ? pick(pool.forHost(host.archetypeId)) : undefined;
      if (alternative) genes[index] = { hostSlot, candidate: alternative };
      return genes;
    }
    return grow(genes.slice(0, index));
  };

  const crossover = (left: Individual, right: Individual): Gene[] => {
    const cut = Math.floor(random() * (Math.min(left.genes.length, right.genes.length) + 1));
    return [...left.genes.slice(0, cut), ...right.genes.slice(cut)];
  };

  /** Tiles first. Integrated then reads Pareto rank and crowding; the others read their morphology score. */
  const order = (population: Individual[]) => {
    if (job.morphology === "integrated") {
      const ranks = paretoRanks(population.map((item) => item.reading));
      population.forEach((item, index) => { item.rank = ranks[index]; item.crowd = 0; });
      for (const objective of ["compact", "branching", "vertical"] as const) {
        const sorted = population.slice().sort((left, right) => left.reading[objective] - right.reading[objective]);
        const span = Math.max(1e-6, sorted[sorted.length - 1].reading[objective] - sorted[0].reading[objective]);
        sorted[0].crowd = Infinity;
        sorted[sorted.length - 1].crowd = Infinity;
        for (let index = 1; index < sorted.length - 1; index += 1) sorted[index].crowd += (sorted[index + 1].reading[objective] - sorted[index - 1].reading[objective]) / span;
      }
    }
    population.sort((left, right) => right.placement.tiles.length - left.placement.tiles.length
      || left.rank - right.rank
      || (job.morphology === "integrated" ? right.crowd - left.crowd : 0)
      || right.score - left.score);
  };

  const tournament = (population: Individual[]): Individual => {
    let winner = pick(population)!;
    for (let round = 1; round < TOURNAMENT; round += 1) {
      const rival = pick(population)!;
      if (population.indexOf(rival) < population.indexOf(winner)) winner = rival;
    }
    return winner;
  };

  const distinct = (population: Individual[]): Individual[] => {
    const seen = new Set<string>();
    const out: Individual[] = [];
    for (const item of population) {
      if (seen.has(item.key)) {
        stats.duplicates += 1;
        if (spent()) continue;
        const immigrant = replay(grow([]));
        stats.immigrants += 1;
        if (seen.has(immigrant.key)) continue;
        seen.add(immigrant.key);
        out.push(immigrant);
        continue;
      }
      seen.add(item.key);
      out.push(item);
    }
    return out;
  };

  let population: Individual[] = [];
  if (root.tiles.length > 0) {
    for (let index = 0; index < POPULATION && !spent(); index += 1) {
      population.push(replay(index < 3 ? guided(index * 3) : grow([])));
    }
    population = distinct(population);
    order(population);
    for (let generation = 0; generation < GENERATIONS && !spent() && population.length > 0; generation += 1) {
      stats.generations += 1;
      const next = population.slice(0, ELITE);
      while (next.length < POPULATION && !spent()) {
        const parent = tournament(population);
        const genes = random() < 0.4 ? crossover(parent, tournament(population)) : mutate(parent);
        next.push(replay(genes));
      }
      population = distinct(next);
      order(population);
    }
  }
  const best = population[0];
  const reached = (best?.placement.tiles.length ?? 0) >= job.tiles;
  const search = (placement: Placement): SearchStats => ({
    evaluations: board.tests,
    acceptedPoses: Math.max(0, placement.tiles.length - 1),
    backtracks: 0,
    milliseconds: Date.now() - started,
    exhausted: placement.tiles.length < job.tiles,
    truncated: spent(),
    untried: 0,
    geometricRejections: 0,
    rejectionCounts: { intersection: 0, containment: 0, contact: 0 },
    depthLimit: null,
    stop: placement.tiles.length >= job.tiles ? "reached" : spent() ? "exhausted" : "geometric",
    organization: job.morphology,
    engine: "evolutionary-search",
    trace: `evolution population ${POPULATION}, ${stats.generations} generations, ${board.tests} tests, ${stats.repairs} repairs, ${stats.duplicates} duplicates replaced by ${stats.immigrants} immigrants${job.morphology === "integrated" ? ", non-dominated sorting" : ""}`,
  });
  return finish(board, job, population.map((item) => item.placement), SKILL6_EVOLUTION_ALGORITHM, search, (placement) => (
    placement.tiles.length >= job.tiles ? null : `Evolution's best individual placed ${placement.tiles.length} of ${job.tiles} tiles.${reached ? "" : " No individual reached the target."}`
  ));
}
