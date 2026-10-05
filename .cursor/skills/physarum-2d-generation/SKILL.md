---
name: physarum-2d-generation
description: >-
  Runs the Skill 2 evolutionary search on a Skill 1 semantic plan. Four
  generations, Formal / Spatial / Atmospheric Pareto, crowding, and phenotype
  Diversity. Specialists are off by default. Does not pick the one section
  that goes to vertical propagation. Use for Skill 2 search, evaluation, or
  the later handoff. Do not use for Skill 1 translation, vertical propagation,
  3D geometry, interlocking, or aggregation.
---

# Skill 2: 2D evolutionary search

This is the project-level skill for Skill 2 in the shared repository `livingmorphologies`.

The redesigned search is the semantic controller in `lib/skill2/semantic/`. It evolves a Skill 1 semantic plan. It does not pose one recipe with drift, radius scale, and orientation.

`lib/skill2/evolution.ts` is the legacy pose controller. It still reads historical version-2 runs. Do not use it for the five updated Lobby archetypes.

The search does not pick the section that goes to vertical propagation. A person selects one visible Combined Catalog candidate afterward.

## What is implemented

- Four generation slots. A production run evaluates 100 new candidates each generation, 400 per archetype. Carried parents are not re-simulated and do not count toward the 100.
- G01 is explorers from that archetype's own sampler. Lobby explorers call `planLobby`.
- Later generations use an explicit composition profile. There is no production percentage in the code.
- Objectives stay Formal, Spatial, and Atmospheric. Scoring peaks stay 0.20 / 0.50 / 0.80. Deferred criteria stay out of the means.
- Technical validity and archetype fidelity are separate. Fidelity is `uncalibrated`, `pass`, or `fail`. Uncalibrated is not pass. No floors are built in.
- After every generation the current Pareto set, its crowding, Diversity roles, and specialist roles (only if the experiment is on) are recomputed. Snapshots keep the earlier roles.
- Pareto parents are chosen by a crowding tournament. Crowding is not morphology.
- Diversity parent selection is explicit. `provisional-uniform` is only a named stand-in, not the research method.
- A development run may turn an empty parent slot into an explorer and records that change. A production run stops instead of changing the requested mix.
- Lobby calibration batches are separate from the pose catalog: `npx tsx scripts/semantic-lobby.ts calibrate --archetype <lobby-id> --count <n> --seed <n>`. Output is `data/semantic-runs/<archetypeId>/`. They are uncalibrated explorer evaluations, with previews, and they do not reproduce.
- Diversity uses an injected phenotype distance and a supplied threshold. Rescue is farthest-first and has no fixed cap. Tag and Rescue are stored separately. Both count as the Diversity role.
- A candidate is stored once and may sit in more than one parent pool. The selection event chooses the mutation intent. Extra roles do not add children.
- Orientation elites are not a preservation role.
- Specialists default off. The old qualification can run for a later comparison. Pose near-duplicates are not used. Objective-specific mutation throws until a mapping exists.
- The Combined Catalog is built after preservation. Phenotype dedup only hides a designer-facing duplicate. The hidden candidate stays in the research record and can still be a parent. More current roles wins the visible representative. A lower id breaks remaining ties; that is a temporary storage order, not a research rule.
- Handoff accepts any visible catalog candidate and replays the semantic plan. It does not accept pose genomes for Lobby.

## Still uncalibrated

Do not treat a development run as a research result. These values are not decided:

- fidelity floors, per archetype
- generation composition
- mutation amplitudes and which fields a role may change, beyond Lobby's provisional affinity
- phenotype distance, fingerprint comparison, Diversity threshold, and Diversity parent selection
- whether Specialists stay

Lobby's provisional affinity is local continuous fields versus discrete and growth fields. It is not a universal genome and it is not an objective map. Workspace and Gathering do not inherit Lobby field names.

## Legacy

Pose runs remain readable. Do not overwrite `data/evolution` history. Do not describe the pose archive, orientation elites, or the 80-candidate mix as the current method.

## Boundary

Skill 1 owns repair, realization, slime, and agent count. Skill 2 chooses parents, roles, and which exposed genes change. Do not edit raw biological parameters. Do not enable deferred criteria. Do not add a winner-selection step inside the search.
