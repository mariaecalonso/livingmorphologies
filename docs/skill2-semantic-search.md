# Skill 2 semantic search

This describes the controller in `lib/skill2/semantic/`. It is not a calibrated research result.

The legacy pose controller in `lib/skill2/evolution.ts` remains for historical runs. Updated Lobby archetypes do not use drift, radius scale, or orientation as their genome.

## Ownership

Skill 1 samples a legal plan, repairs it, and realizes attractors, slime, and agent count. Skill 2 chooses the generation, the parent, the preservation role, and which exposed genes change. Skill 2 does not edit raw biological parameters. A semantic gene such as a growth label may change those parameters inside Skill 1.

Each archetype supplies its own adapter: explorer sampler, gene metadata, repair, and realization state. Lobby field names are not a template for the other ten archetypes.

## Generations

A production run has four generations of 100 new evaluations, 400 per archetype. A carried Pareto, Diversity, or Specialist parent is not simulated again and does not count toward the 100. A technical failure counts. An exact repaired-plan duplicate is rejected before simulation and replaced, up to `duplicateAttemptBudget`. There is no production mix of explorers and parents in the code. G02–G04 require an explicit composition. Tests use small fixture budgets.

G01 asks the archetype adapter for independent legal plans. For Lobby that call is `planLobby` with a fresh salt. A mutant keeps the parent's salt and changes semantic fields.

The evaluation seed stays 1. It is not the realization salt.

## Preservation

After each generation, current roles are recomputed for every fidelity-eligible candidate so far. Snapshots keep the previous roles. Rank and crowding are not frozen at birth.

Pareto is the non-dominated Formal / Spatial / Atmospheric set. Parents are a crowding tournament on that front. Boundary points beat finite crowding. Equal crowding keeps the lower id. That tie-break is not a combined score.

Diversity parent selection is not settled. A generation that requests Diversity births must name a strategy. The built-in `provisional-uniform` draw gives every current Diversity parent an equal chance. It is a development stand-in, not the research method. Replace it with `{ kind: "custom", select }`.

A development run that asks for a parent from an empty pool reallocates that slot to an explorer and records `reallocatedPools`. The requested mix stays in the snapshot. A production run does not change the mix. It stops and names the empty pool.

## Fidelity from G01

Each archetype derives `g01-lower-mode-v1` once from its own 100 G01 explorers, after those explorers are stored. The profile then stays fixed for G02–G04. A blocked calibration stops before preservation and keeps the saved G01. Fidelity can be recomputed from that file with `recomputeStoredG01Fidelity` without simulating again.

Pareto keeps the stored Formal / Spatial / Atmospheric objectives. A fidelity category mean uses only the criteria still admitted to fidelity. If Receptivity is excluded, fidelity Atmospheric is Immersive plus Visibility, and the Pareto Atmospheric score is not rewritten.

The search writes `data/semantic-runs/<archetypeId>/run.json` after every completed evaluation, and `previews/<id>.png` beside it. Candidate ids, plans, and salts are assigned when the birth list is built. Later evaluations may finish out of order; checkpoint writes are serialized and the file keeps candidates in id order. Resume continues the saved birth list and evaluates only unfinished births.

The first five Lobby searches use the versioned profile `lobby-semantic-v1` in `lib/skill2/semantic/lobby-semantic-v1.ts`. It is not a Workspace or Gathering profile. One archetype runs at a time. `--workers` is how many of that archetype's candidates simulate at once. Launch is:

```
npx tsx scripts/lobby-semantic-v1.ts --workers 5 --publish
```

The batch order is topographic ground field, linear gallery, compressed sequential, continuous hall, then vertical void. Each archetype is verified, published, committed, and pushed before the next one starts.

G01 derives fidelity and `descriptor-v1`. The visual fingerprint is stored and not used for selection. Catalog dedup is off. Specialists are off. Diversity parents use the named provisional-uniform draw.

Diversity runs only on fidelity-eligible candidates. Rescue has no extra Formal / Spatial / Atmospheric floor and no fixed cap. It is farthest-first against the morphologies already preserved, and it stops at the supplied threshold. Tag marks an already preserved candidate that is also morphologically distinct. Both are the Diversity role. The distance function and the thresholds are injected. They are not chosen here. If no distance is supplied, Diversity stays uncalibrated and rescues nobody.

An empty preserved set does not rescue anyone. There is no morphology yet to be different from.

Fidelity states are `uncalibrated`, `pass`, and `fail`. A technical failure is `not-evaluated` rather than a fake pass. Development runs may preserve uncalibrated candidates so the controller can be exercised. Those runs are marked provisional. Production requires an explicit fidelity profile and does not treat a missing profile as pass. No archetype floors are stored in the code.

Specialists are off unless the run asks for them. The provisional rule is the previous one: not on the current Pareto front, mean at or above the eligible median, the other two objectives at or above the eligible 25th percentile, one emphasis, at most four. Exact semantic duplicates are skipped. Pose distance is not used. Births from a Specialist parent are refused until a gene-to-objective mapping exists.

Orientation elites are not produced.

## Catalog and handoff

Preservation is computed first. Catalog dedup then hides a near-duplicate from the designer. The hidden candidate remains in the run and in the parent pools. The visible representative is the one with more current roles. If the counts match, the lower id is shown. That id order is temporary. The Diversity threshold and the catalog threshold are separate settings.

Handoff accepts any visible catalog candidate, including a Diversity Rescue, and replays the stored plan and salt. A development or uncalibrated handoff is provisional and is rejected by `assertProductionHandoff`.

## Phenotype

Every evaluation stores the raw morphology measurements and a 20×20 occupancy grid in trail units. The grid is not cropped to each drawing. Skeleton and void rasters are not stored yet; the measurements and occupancy are enough to derive a later fingerprint. Distances are not stored.

## Not settled

Fidelity floors, generation composition, mutation amplitudes, phenotype distance, fingerprint comparison, Diversity threshold, Diversity parent selection, catalog threshold, the remaining catalog tie-break, and the Specialist decision.
