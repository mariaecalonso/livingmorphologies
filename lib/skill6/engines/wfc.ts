/**
 * Wave Function Collapse over discrete docking candidates.
 * Each later tile is a slot. Its domain is (host slot, candidate) options.
 * Propagation keeps the domains consistent after every collapse:
 * host support between slots, one child per host face, an archetype cardinality
 * cap, and a forward check of the predicted bounds against the growth rule and
 * the placed tiles. The lowest weighted entropy slot collapses next.
 * A failed seating or an emptied domain restores the last snapshot and records
 * that choice as a nogood. The search continues past a solution to collect alternatives.
 */
import { SKILL6_GROWTH_DIRECTIONS, SKILL6_WFC_ALGORITHM, type SearchStats } from "../contract";
import { composePose } from "../envelope";
import { poseBounds } from "../geometry";
import { growthRejection } from "../grow";
import { finish, type Board, type EngineJob, type EngineOutcome, type Placement } from "./board";
import { preference, type DockCandidate, type DockPool } from "./pool";

type Option = { hostSlot: number; candidate: DockCandidate };
type Box = { min: number[]; max: number[] };
type State = { placement: Placement; domains: Option[][]; assigned: (Option | null)[]; tileOf: number[] };

const SOLUTIONS = 6;
const TEMPERATURE = 2;
const OVERLAP_SHARE = 0.4;

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

function overlapShare(left: Box, right: Box): number {
  let shared = 1;
  for (let axis = 0; axis < 3; axis += 1) {
    const span = Math.min(left.max[axis], right.max[axis]) - Math.max(left.min[axis], right.min[axis]);
    if (span <= 0) return 0;
    shared *= span;
  }
  const volume = (box: Box) => (box.max[0] - box.min[0]) * (box.max[1] - box.min[1]) * (box.max[2] - box.min[2]);
  return shared / Math.max(1e-6, Math.min(volume(left), volume(right)));
}

export function runWfc(board: Board, pool: DockPool, job: EngineJob): EngineOutcome {
  const started = Date.now();
  const budget = job.budget ?? 120 * job.tiles;
  const random = randomOf(job.seed + 17 + job.morphology.length * 101);
  const root = board.seed(job.rootId);
  const cap = Math.max(2, Math.ceil(job.tiles / 3));
  const guests = [...new Set(pool.candidates.map((item) => item.guest))];
  const pruned = { support: 0, socket: 0, cardinality: 0, spatial: 0 };
  let evaluations = 0;
  let backtracks = 0;
  let propagations = 0;
  let steps = 0;
  let reason: string | null = root.tiles.length === 0 ? `${job.rootId} is not in the archetype set.` : null;
  const found: Placement[] = [];
  let best: Placement = root;
  const nogoods = new Set<string>();

  const domains: Option[][] = [[]];
  for (let slot = 1; slot < job.tiles; slot += 1) {
    const options: Option[] = [];
    for (let hostSlot = 0; hostSlot < slot; hostSlot += 1) {
      const hosts = hostSlot === 0 ? [root.tiles[0]?.archetypeId].filter((id): id is string => Boolean(id)) : guests;
      for (const host of hosts) for (const candidate of pool.forHost(host)) options.push({ hostSlot, candidate });
    }
    domains.push(options);
  }
  let state: State = {
    placement: root,
    domains,
    assigned: Array.from({ length: job.tiles }, () => null),
    tileOf: [0, ...Array.from({ length: job.tiles - 1 }, () => -1)],
  };
  const stack: { state: State; slot: number; option: Option }[] = [];
  const archetypeOf = (current: State, slot: number) => (slot === 0 ? root.tiles[0]?.archetypeId ?? null : current.assigned[slot]?.candidate.guest ?? null);
  const signature = (current: State, slot: number, option: Option) => `${current.tileOf.map((index, at) => (index >= 0 ? `${at}:${current.assigned[at]?.candidate.id ?? "r"}` : "")).join(",")}|${slot}|${option.hostSlot}:${option.candidate.id}`;

  const propagate = (current: State): boolean => {
    propagations += 1;
    const counts = new Map<string, number>();
    for (let slot = 0; slot < job.tiles; slot += 1) {
      const id = archetypeOf(current, slot);
      if (id) counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    const sockets = new Set<string>();
    for (let slot = 1; slot < job.tiles; slot += 1) {
      const option = current.assigned[slot];
      if (option && option.candidate.direction !== "other") sockets.add(`${option.hostSlot}|${option.candidate.direction}`);
    }
    const boxes = current.placement.tiles.map((tile) => poseBounds(board.byId.get(tile.archetypeId)!.tight, tile.pose));
    let changed = true;
    while (changed) {
      changed = false;
      const offered = current.domains.map((list) => new Set(list.map((item) => item.candidate.guest)));
      for (let slot = 1; slot < job.tiles; slot += 1) {
        if (current.assigned[slot]) continue;
        const next = current.domains[slot].filter((option) => {
          const host = archetypeOf(current, option.hostSlot);
          if (host != null && host !== option.candidate.host) return false;
          if (host == null && !offered[option.hostSlot].has(option.candidate.host)) {
            pruned.support += 1;
            return false;
          }
          if (sockets.has(`${option.hostSlot}|${option.candidate.direction}`)) {
            pruned.socket += 1;
            return false;
          }
          if ((counts.get(option.candidate.guest) ?? 0) >= cap) {
            pruned.cardinality += 1;
            return false;
          }
          const tileIndex = current.tileOf[option.hostSlot];
          if (tileIndex >= 0) {
            const hostTile = current.placement.tiles[tileIndex];
            const guestBox = poseBounds(board.byId.get(option.candidate.guest)!.tight, composePose(hostTile.pose, option.candidate.pose));
            const blocked = growthRejection(boxes[tileIndex], guestBox, SKILL6_GROWTH_DIRECTIONS) != null
              || boxes.some((box, index) => index !== tileIndex && overlapShare(box, guestBox) > OVERLAP_SHARE);
            if (blocked) {
              pruned.spatial += 1;
              return false;
            }
          }
          return true;
        });
        if (next.length !== current.domains[slot].length) {
          current.domains[slot] = next;
          changed = true;
        }
        if (next.length === 0) return false;
      }
    }
    return true;
  };

  const clone = (current: State): State => ({
    placement: current.placement,
    domains: current.domains.map((list) => list.slice()),
    assigned: current.assigned.slice(),
    tileOf: current.tileOf.slice(),
  });

  const weightOf = (current: State, option: Option) => {
    const used = new Set(current.placement.contacts.map((contact) => contact.searchNote.split(" ")[0]));
    const hostTile = current.placement.tiles[current.tileOf[option.hostSlot]];
    const children = current.placement.contacts.filter((contact) => contact.hostId === hostTile.instanceId).length;
    return Math.exp((preference(job.morphology, option.candidate, used, children) + Math.min(option.candidate.area, 40) * 0.05) / TEMPERATURE);
  };

  /** Restore the latest snapshot and forbid the choice made there. False when nothing is left to undo. */
  const undo = (): boolean => {
    while (stack.length > 0) {
      const prior = stack.pop()!;
      backtracks += 1;
      const restored = clone(prior.state);
      nogoods.add(signature(prior.state, prior.slot, prior.option));
      restored.domains[prior.slot] = restored.domains[prior.slot].filter((option) => !(option.hostSlot === prior.option.hostSlot && option.candidate.id === prior.option.candidate.id));
      if (propagate(restored)) {
        state = restored;
        return true;
      }
    }
    return false;
  };

  if (root.tiles.length > 0 && !propagate(state)) reason = "Propagation emptied a slot before the first collapse.";
  else if (root.tiles.length > 0) {
    const initial = clone(state);
    while (board.tests < budget && steps < budget * 6 && found.length < SOLUTIONS) {
      steps += 1;
      if (state.placement.tiles.length > best.tiles.length) best = state.placement;
      if (state.placement.tiles.length >= job.tiles) {
        found.push(state.placement);
        state = clone(initial);
        stack.length = 0;
        continue;
      }
      let slot = -1;
      let lowest = Infinity;
      let ready: Option[] = [];
      for (let candidateSlot = 1; candidateSlot < job.tiles; candidateSlot += 1) {
        if (state.assigned[candidateSlot]) continue;
        const options = state.domains[candidateSlot].filter((option) => state.tileOf[option.hostSlot] >= 0 && !nogoods.has(signature(state, candidateSlot, option)));
        if (options.length === 0) continue;
        const weights = options.map((option) => weightOf(state, option));
        const total = weights.reduce((sum, value) => sum + value, 0);
        const entropy = Math.log(total) - weights.reduce((sum, value) => sum + value * Math.log(value), 0) / total;
        if (entropy < lowest) {
          lowest = entropy;
          slot = candidateSlot;
          ready = options;
        }
      }
      if (slot < 0) {
        reason = reason ?? "No slot has an option whose host is placed.";
        if (!undo()) break;
        continue;
      }
      const weights = ready.map((option) => weightOf(state, option));
      let roll = random() * weights.reduce((sum, value) => sum + value, 0);
      let pick = ready[ready.length - 1];
      for (let index = 0; index < ready.length; index += 1) {
        roll -= weights[index];
        if (roll <= 0) {
          pick = ready[index];
          break;
        }
      }
      evaluations += 1;
      const result = board.tryAttach(state.placement, state.tileOf[pick.hostSlot], pick.candidate);
      if (!result.ok) {
        reason = result.reason;
        nogoods.add(signature(state, slot, pick));
        state.domains[slot] = state.domains[slot].filter((option) => option !== pick);
        if (!propagate(state) && !undo()) break;
        continue;
      }
      stack.push({ state: clone(state), slot, option: pick });
      state.assigned[slot] = pick;
      state.tileOf[slot] = state.placement.tiles.length;
      state.placement = result.placement;
      reason = null;
      if (!propagate(state) && !undo()) break;
    }
  }
  if (found.length === 0) found.push(best);

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
      depthLimit: null,
      stop: reached ? "reached" : board.tests >= budget ? "exhausted" : "geometric",
      organization: job.morphology,
      engine: "wave-function-collapse",
      trace: `wfc weighted-entropy collapse with restarts, ${found.filter((item) => item.tiles.length >= job.tiles).length} solutions, ${propagations} propagations, ${backtracks} backtracks, ${board.tests} tests; pruned support ${pruned.support}, socket ${pruned.socket}, cardinality ${pruned.cardinality}, spatial ${pruned.spatial}`,
    };
  };
  return finish(board, job, found, SKILL6_WFC_ALGORITHM, search, (placement) => (
    placement.tiles.length >= job.tiles ? null : `WFC stopped at ${placement.tiles.length} of ${job.tiles}. ${reason ?? ""}`.trim()
  ));
}
