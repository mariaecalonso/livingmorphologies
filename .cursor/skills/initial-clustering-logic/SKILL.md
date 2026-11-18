---
name: initial-clustering-logic
description: >-
  Retrieve Initial Clustering Logic: the Graph-Based connectivity planner and
  the WFC constraint propagator from Skill 6. Use when the user says retrieve
  Initial Clustering logic, Initial Clustering Logic, graph-based-v1, or
  wave-function-collapse-v1, or asks to reuse those two searches in another
  system. Read this file and the two source paths it names. Do not search the
  rest of Skill 6 first. Do not use for the Skill 6 lab, Rule-Based search,
  assembly, refinement, or for building System 02.
---

# Initial Clustering Logic

Reference only. The authoritative implementations stay in the source files below. Do not copy, extract, or rewrite them. System 01 is the Skill 6 lab and remains complete, including Rule-Based. System 02 is not started.

Stored overnight runs use seed `101`, root `open-hall`, and budget `120 × tiles`. Graph does not read the seed. WFC does.

## Authoritative sources

| Method | Algorithm id | Entry | File |
| --- | --- | --- | --- |
| Graph-Based | `graph-based-v1` | `runGraph` | `lib/skill6/engines/graph.ts` |
| WFC | `wave-function-collapse-v1` | `runWfc` | `lib/skill6/engines/wfc.ts` |

Ids are `SKILL6_GRAPH_ALGORITHM` and `SKILL6_WFC_ALGORITHM` in `lib/skill6/contract.ts`. System 01 calls both from `lib/skill6/engines/run.ts` after `createBoard`. Explain a method from its file. Do not reconstruct it from this note.

## What another system must supply

Both functions take `(board, pool, job)`.

- `pool.forHost(archetypeId)` lists discrete candidates. Graph also counts `pool.candidates` per host archetype as outgoing degree.
- `board.seed(rootId)` places the root. An unknown root returns no tiles and the search stops.
- `board.tryAttach(placement, hostIndex, candidate)` returns `{ ok: true, placement }` or `{ ok: false, reason }`. The host archetype must match `candidate.host`.
- `board.tests` counts uncached attachment tests. A repeated pose path and candidate does not increment it. The budget watches this counter, not the engines' own `evaluations` count.
- `job`: `id`, `seed`, `tiles`, `rootId`, `morphology` (`compact`, `branching`, `vertical`, or `integrated`). `budget` defaults to `120 * tiles`. `backtracks` is unused by these two.

A candidate, as `DockCandidate` in `lib/skill6/engines/pool.ts`, carries `id`, `host`, `guest`, `pose`, `area`, `direction` (`+X` `-X` `+Y` `-Y` `+Z` or `other`), `up`, and `note`.

WFC also reads `board.byId.get(id).tight` and calls `growthRejection`, `poseBounds`, and `composePose` inside `propagate`. That spatial preview is not yet a replaceable argument. Calling `runWfc` applies the current preview.

## Graph-Based

Sequence in `runGraph`:

1. Build four generation plans. Node 0 is the seed. Each later node belongs to a generation and may attach to the previous generation.
2. Plan order: Compact `wide fan`, `widening`, `paired generations`, `chain`. Branching `paired generations`, `widening`, `wide fan`, `chain`. Vertical `chain`, `paired generations`, `widening`, `wide fan`. Integrated and any other name use `widening`, `paired generations`, `chain`, `wide fan`.
3. Generation widths: wide fan 3, paired 2, widening equals the generation index, chain 1. `WIDTH` is 8.
4. Give each plan an equal share of the remaining test budget: `limit = tests + floor((budget - tests) / plans left)`.
5. Realize depth-first from node 1. Rank hosts in the planned previous generation, then hosts in a deeper generation. A deeper host is a deviation and is counted in the trace.
6. Score candidates, keep the top `WIDTH + size of the next generation`, and call `tryAttach`. The first complete placement ends that plan. Otherwise keep the deepest partial.
7. `finish` in `lib/skill6/engines/board.ts` drops duplicate `placementKey`s, ranks by tile count and then the morphology score, and returns one record plus up to three alternatives.

Edge weight, higher first: `min(area, 60) × 0.04`, minus `0.8` per repeat of that guest and `1.5` when a sibling already uses the same face. A node that must host a later generation adds up to `1.5` for outgoing degree and subtracts `2` when that degree is under 2. Branching subtracts `0.6` per sibling. Vertical adds `1.5` for `+Z`. Compact subtracts `0.02 ×` translation length and adds `0.5` when the host is the seed.

Trace prefix: `graph plans then realize, N tests, M backtracks:`. Each plan note is `name placed/target`, optional `(D deeper)`, `stop reached|budget|candidates`, test count, and on a short plan `last contact: …`. That last contact is the latest rejection. It is not why a `budget` stop happened. `search.depthLimit` is 8. `search.engine` is `graph-based`. Rejection tallies in `search` are not split by cause.

## WFC

Sequence in `runWfc`:

1. Random stream: `randomOf(seed + 17 + morphology.length * 101)`. Compact and branching are the same length, so they share a stream for one seed. Vertical and integrated do not.
2. Archetype cap: `max(2, ceil(tiles / 3))`.
3. Each later tile is a slot. Its domain is `(host slot, candidate)` pairs. Slot 0 is the seed. An unassigned host slot may be any guest archetype in the pool. The seed host may only be the root archetype.
4. Propagate until stable: the host archetype must match the candidate; an unassigned host must still offer that archetype (`support`); one child per host face, with `other` exempt (`socket`); guest count stays under the cap (`cardinality`); once the host tile is placed, reject a guest box that fails `growthRejection` against `SKILL6_GROWTH_DIRECTIONS` or overlaps another placed box by more than `OVERLAP_SHARE` `0.4` (`spatial`). An empty domain fails the propagation.
5. Collapse the open slot with the lowest weighted entropy whose host is already placed. Weight is `exp((preference + min(area, 40) × 0.05) / TEMPERATURE)` with `TEMPERATURE` `2`. `preference` in `pool.ts` is the pre-measurement score: Compact favors area and a short translation, Branching favors a new direction and a host that already has a child, Vertical favors `+Z`.
6. Draw one option and call `tryAttach`. A failure is a nogood. A success snapshots the state, assigns the slot, and propagates. Undo restores the snapshot, forbids that choice, and propagates again.
7. A complete placement is saved and the search restarts from the initial domains, up to `SOLUTIONS` `6`. The loop also stops when `tests` reach the budget or steps reach `budget × 6`. If nothing completed, the deepest partial is kept.
8. The same `finish` ranks those placements.

Trace prefix: `wfc weighted-entropy collapse with restarts,`. It then records solution count, propagations, backtracks, tests, and pruned `support`, `socket`, `cardinality`, and `spatial`. `search.depthLimit` is null. `search.engine` is `wave-function-collapse`. A short result uses `WFC stopped at A of B` plus the last reason. Constants: `SOLUTIONS` 6, `TEMPERATURE` 2, `OVERLAP_SHARE` 0.4.

## Skill 6 code that is not this logic

Leave these in System 01. Another system does not import them in order to run the searches, and it does not replace them inside these two files.

- Compatibility and the candidate pool: `loadDockPool` in `lib/skill6/engines/pool.ts`. The default keeps 2 poses per direction. The overnight collection passed 3. Atlas, reseat, and pair checks happen before either search.
- Attachment and geometric acceptance: `createBoard` in `lib/skill6/engines/board.ts`. A pass needs one coherent region, area at least `3.2`, residual at most `0.18`, normal alignment at most `-0.82`, and no triangle crossing deeper than `0.02`. The aimed seating gap is `0.05`. Allowed growth is `+X` `-X` `+Y` `-Y` `+Z`, from `growthRejection` in `lib/skill6/grow.ts`.
- Ranking and the cluster record: `finish`. Tile count outranks the morphology score.
- Assembly, patching, union, and refinement: `assembleCluster`. Neither search calls it.
- Rule-Based: `lib/skill6/engines/rule.ts`. The lab, catalog, and stored experiments.

## Reuse without a second copy

Import `runGraph` or `runWfc` and pass a board and pool that satisfy the calls above. Do not paste either file into another system.

`tryAttach`, `seed`, `tests`, and `forHost` are already arguments, so another board and pool can change listing and attachment without editing the searches. WFC's spatial preview, `preference`, the plan orders, the weights, and `finish` are inside the source. Changing those is a later edit of the authoritative file, not a fork. Until that edit exists, a caller of `runWfc` uses the growth rule, the `0.4` overlap test, and System 01 ranking.

Do not import `run-overnight.ts`, `run-five-tile.ts`, or `run-expansion.ts`. They start a generation when loaded. Do not rerun stored experiments to explain these methods.
