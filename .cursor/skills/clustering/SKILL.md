---
name: clustering
description: >-
  Aggregates the 15 selected Skill 3 tiles into clusters through ground seed,
  directional growth, spatial organization, geometric validation, generative
  patching, and refinement. Use when working on Skill 6, Clustering,
  /lab/clustering, cluster search, assembly, patches, or refined cluster
  meshes. Do not use for Skill 1 translation, Skill 2 generation, Skill 3
  vertical propagation, Skill 4 hybrid connection, or Skill 5 site placement.
---

# Skill 6: Clustering

This is the project-level skill for Skill 6 in the shared repository `livingmorphologies`.
Apply it when aggregating the 15 selected Skill 3 tiles. Do not apply it to translation, 2D generation, vertical propagation, hybrid connection, or site placement.

The lab is `/lab/clustering`. The work lives in `lib/skill6/`. Source meshes are read from Skill 3 and are not rewritten.

## Two clustering systems

System 01 is this Skill 6 lab. It stays complete and independently demonstrable: Rule-Based, Graph-Based, WFC, Compact and Branching, the current geometry and assembly path, the interface, the validated clusters, and the experiment records. It is the first computational clustering approach and remains in the research presentation. It is not replaced or retired.

System 02 is a later clustering system. It is not started. It may call the Graph-Based planner and the WFC propagator. It supplies its own candidate pool, compatibility checks, attachment tests, and spatial constraints. It does not use this lab or this assembly pipeline, and System 01 does not use its interface.

Shared code is limited to those two searches and the narrow operations they already need: list candidates, try one attachment, read the test counter, and, for WFC, preview a box. Skill 6’s `runGraph` and `runWfc` remain the System 01 entry points. They keep today’s seeds, budgets, preset order, ranking, and trace text. A move of the search loop is allowed only when those wrappers still call the current board and pool, so stored behavior does not change.

Record, when System 02 exists, which of these were retained, adapted, or replaced: Graph planning, WFC propagation, compatibility, attachment, and assembly. Do not rewrite System 01’s results to match System 02.

The retrieval reference for the two searches is `.cursor/skills/initial-clustering-logic/SKILL.md`. Ask to retrieve Initial Clustering logic. That reference points at `lib/skill6/engines/graph.ts` and `lib/skill6/engines/wfc.ts`. It does not replace them.

## Official workflow

Clustering is these six stages, in this order. There is no separate stage object. The live path is `loadArchetypeMeshes` → `aggregateCoverage` / `aggregateTranslated` → `assembleCluster`. Stages 1–3 run inside the search. Stages 4–6 are split between that search and the assembly.

### 1. Ground Seed — implemented

Select the initial archetype from the 15 Skill 3 tiles and place its actual geometry so the tight bounds sit at Z = 0. X and Y are horizontal. Z is up. `sourcePointToSkill6` in `lib/skill6/contract.ts` converts the isomesh frame. `loadArchetypeMeshes` in `lib/skill6/source.ts` reads the finals. The 20×20×20 registration cell is metadata. It does not decide a connection.

`aggregateTranslated` in `lib/skill6/grow.ts` grounds `t00` only when a direction list is set: identity basis, translation `[0, 0, -minZ]`. Experiments pin the archetype with `rootId`. Without a direction list, the seed stays at the origin.

The whole-cluster lift in `assembleCluster` is not this stage. It raises the finished union after patching. A grounded seed can still produce a nonzero lift if that union dips below 0.

### 2. Directional Growth — implemented constraint

Permitted aggregation is `+X`, `−X`, `+Y`, `−Y`, and `+Z`. `SKILL6_GROWTH_DIRECTIONS` in `lib/skill6/contract.ts` records that set. `−Z` is typed and is not permitted.

`growthRejection` in `lib/skill6/grow.ts` refuses a guest that passes below Z = 0, meets on a disallowed side, drops through the host’s lower quarter, or floats above the host by more than the contact tolerance. This is a spatial constraint. It does not choose the archetype, the pose, or the branch. Connections still have to pass geometric validation.

The direction label is the axis of least overlap between the two posed bounds, signed toward the guest. It is not the contact normal. A guest can be labeled `+X` while its measured face is oblique.

### 3. Spatial Organization — pending methodological definition

This stage decides how archetypes are selected, combined, repeated, positioned, oriented, branched, stacked, and organized. The methodology is not finalized. Do not treat first-accept or scored selection as the official method. Keep the current code as an experimental baseline. Do not change its rules until a method has been defined and evaluated.

The baseline, all in `lib/skill6/`:

- `aggregateRule` in `aggregate.ts`: first-accept envelope growth (`rule-based-envelope-v1`).
- `aggregateTranslated` in `grow.ts`: stored pose library, tangent slides, and backtracking (`rule-based-envelope-v2`). The default still accepts the first pose that passes.
- `aggregateCoverage` in `grow.ts`: that search with world collision and no 20-pose cap (`rule-based-envelope-v2.1`). The catalog and the small-ground experiments use it.
- Scored selection and world-axis reseating are opt-in. `PLACEMENT_WEIGHTS` scores contact area, a new direction, a new archetype, branching, compactness, an upright penalty, future hosts, and a per-job direction bias. The upright term only penalizes an upside-down axis. Small ground v2 used this path. It remains an experiment.
- `aggregatePlanar` is a comparison path. The catalog does not use it.
- `graph-growth`, `wave-function-collapse`, and `evolutionary-search` are named in `SKILL6_LATER_ALGORITHMS`. The Initial Clustering Lab runs working prototypes of those three beside the rule solver. The catalog does not.

`data/skill6/compatibility.json` and the slide file are a cache of pair poses. They supply candidates. They are not the organizer. Stored approaches are uneven: 106 on `−X`, 49 on `+Y`, 28 on `+X`, 1 on `−Z`, and none on `−Y` or `+Z`.

`organization-v1` compares three ranking profiles on that same pool: compact, branching, and vertical. `aggregateTranslated` applies one only when `organization` is set. The baseline score is unchanged when it is absent. The collection is `data/skill6/experiments/organization-v1/`. It is not promoted into the catalog. None of the three profiles is the finalized method.

`organization-v2` is a second experiment. It keeps the profile 1 scores. With `profile: 2` it adds accepted atlas poses, skips a pose that matches a library pose exactly, and revalidates every candidate against the cluster. The depth window round-robins host, direction, and guest. Compact, branching, and vertical then score the cluster that would result: massing and extra contacts, distinct paths and hosts, or supported height and upright orientation. Results are `data/skill6/experiments/organization-v2/`. They are not promoted.

`organization-v3` keeps those profiles. With `profile: 3` it also seats upright surface poses, tries a tangent slide that must meet two tiles, and adds contact quality, future hosts, and agreement of up-axes to the score. A bounds label of `+Z` is not treated as an upward face unless the contact normal agrees. Results are `data/skill6/experiments/organization-v3/`. They are not promoted. The organization-v2 Field vertical four-tile mesh exceeds the penetration limit and is not a validated cluster.

The Initial Clustering Lab compares four engines on the same morphologies. `lib/skill6/engines/` holds them. Rule-Based calls `aggregateCoverage` with profile 2. Graph-Based chooses a connectivity tree from the candidate graph, then realizes that tree. Wave Function Collapse keeps a domain of discrete docking candidates per slot, propagates host-archetype support, and backtracks when seating fails. Evolutionary Search keeps a population of docking genomes, mutates them, and scores fitness by replaying the shared board. Refinement runs once on a finished record, not on rejected individuals. Integrated is a morphology: the sum of the compact, branching, and vertical scores. It is not an engine. The first collection is `data/skill6/experiments/initial-clustering-lab/`. Every run there stopped at two tiles. It is not promoted.

`initial-clustering-coverage` is the later collection. The four engines read one pool: accepted atlas poses, including adaptive seating, compatibility poses, and directional reseats of those poses onto `+X`, `−X`, `+Y`, `−Y`, and `+Z`. A reseat is not accepted until `tryAttach` or `aggregateCoverage` revalidates it against the cluster. Stored poses are tried before reseats. Each engine keeps its own search and can leave a branch that cannot grow. Refinement runs only when a run places at least three tiles. The two-tile collection is not overwritten. Medium and large remain ungenerated. None of these engines replaces the baseline search.

`clustering-expansion-v1` is the expansion collection. It runs at five tiles first; six and seven run only where the previous size validated for that engine and morphology, and the rest are recorded as not attempted. The pool keeps only candidates whose pair contact and host crossing pass at identity (`loadDockPool` with `checked`, cached in `pair-checks.json`). Each candidate is still revalidated on the cluster. Every engine has the same budget of 120 geometric tests per tile. Rule-Based runs rule sets in sequence and withholds earlier first guests. Graph-Based plans generation profiles and realizes them with elastic deeper fallback. WFC propagates host, support, socket, cardinality, and spatial constraints, backtracks with nogoods, and restarts. Evolutionary Search uses tournament selection, five mutation operators, crossover, elitism, and duplicate replacement. `engines/morphology.ts` reads whole-cluster compact, branching, vertical, and joint-quality scores. Integrated takes the weakest of the three shape scores and a Pareto rank; it is not a sum. Final validation adds ground lift at or under 0.18 to the earlier mesh checks. Identical geometry is assembled once and marked as a duplicate. The collection is not promoted.

`clustering-overnight-v1` is the current engine lab. The directory keeps the name of the batch that wrote it. The lab opens on this collection. Expansion and the five-tile checkpoint stay as earlier collections. It finishes one tile count before the next. Exact 2-tile runs are generated. Exact 3- and 4-tile runs reuse a Coverage result only when that result still passes the current checks; the Coverage files stay as written. The six validated five-tile meshes are copied from the checkpoint and are not regenerated. Six tiles is searched for every active engine and morphology. Seven tiles is searched only after that same engine and morphology validated at six. The search still starts from the seed. The engines do not freeze a smaller assembly and add one tile.

`clustering-five-tile-v1` is the five-tile checkpoint. Compact copies the three validated Expansion meshes and rechecks them without regeneration. Branching is generated there for Rule-Based, Graph-Based, and WFC at five tiles, on the same pool, seed, and budget. The runner stops at five tiles. Expansion, the earlier collections, and the catalog are not overwritten.

Active generation is Rule-Based, Graph-Based, and WFC, asked for Compact or Branching. Growth stays `+X`, `−X`, `+Y`, `−Y`, and `+Z`. Vertical and Integrated remain in the code and in the earlier collections. The lab shows them when Historical is on. Evolutionary stays in the engine code and in the earlier collections, and the lab does not list it. Display size follows the tiles placed: Small 2–3, Medium 4–6, Large 7+. Stored size labels, requested targets, and experiment metadata stay as written. Pair measurements are cached by mesh and pose identity. A crossing test is skipped when the posed bounds cannot meet. The same pose still passes or fails the same thresholds.

`adaptive-seating-v1` is an experimental candidate generator. It does not rank clusters and it does not rewrite `compatibility.json`. For one orientation it searches the percentile-plane clearance: the fixed gap 0.1, then 0.14 to 0.50 by 0.04. A tangent slide is seated again along that axis. The kept clearance is the largest coherent contact that still passes the unchanged tests, including boolean overlap at or under 0.05. The bounds growth label stays as it is. The contact normal and the centroid displacement are stored beside it. Results are `data/skill6/experiments/adaptive-seating-v1/`. Preservation measurements on those assemblies are diagnostic. They add no acceptance threshold.

`proximity-dock-v1` seats those same clearances along a normal taken from the meshes. Exterior regions are paired by normal and curvature, then twisted in quarter turns. A curvature sum above 0.35 only skips a convex pair before testing. It is not an acceptance rule. Results are `data/skill6/experiments/proximity-dock-v1/`. They are not promoted.

`data/skill6/atlas/v1.json` is the compatibility atlas. It indexes tested directed pairs, mesh revisions, transforms, and outcomes from the fixed, adaptive, and docking records. An accepted pose may be reused as a candidate, and it must be revalidated against the assembled cluster. A rejection stays in the history and does not close the pair. The atlas is not the catalog.

Decisions required before a finalized method:

1. How the seed is chosen among the 15. Pinning a root and picking among the four most connected archetypes are both experimental.
2. Where candidates come from: the stored library, slides, reseating a valid attachment onto another world axis, or a later generator.
3. Which of contact, direction, archetype variety, branching, compactness, repetition, and orientation are preferences, and which, if any, become constraints.
4. The search shape: first valid pose, a scored window, backtracking, and the budget.
5. Whether the organizer reads direction from the attachment surface or keeps the bounds label.
6. What stays outside the organizer: validation thresholds, patch settings, refinement, and the post-union lift.

### 4. Geometric Validation — implemented

During placement, `validatePose`, `measureEnvelope`, and the world collision scan reject an invalid candidate before it is committed. The acceptance thresholds are `SKILL6_PARAMETERS` in `lib/skill6/contract.ts`: one coherent region, contact area at least 3.2, residual gap at most 0.18, opposed normals of at least 0.82, and no penetration deeper than 0.02. A crossing at or under 0.02 is a graze. Intersection and containment are counted separately. Do not change these thresholds while defining Spatial Organization.

After assembly, experiment checks confirm one solid, no remaining cavities, no penetration over 0.02, and a seating lift inside 0.18. Those checks use the same thresholds. They are not a second standard. The pair library was built with the same contact tests. It is an input cache, not this stage.

### 5. Generative Patching — implemented

`assembleCluster` in `lib/skill6/assembly.ts` poses the Skill 3 meshes and does not rewrite them. A joint with residual gap at or under 0.05 and overlap inside the Boolean allowance is direct contact and gets no patch. Every other accepted near-contact uses `blendPatch` in `lib/skill6/patch.ts`: implicit blend, radius 0.32, voxel 0.12, largest connected bridge only (`SKILL6_PATCH_DEFAULTS`). Patch meshes are stored separately. A blend that does not make one manifold solid is a failed patch.

### 6. Refinement — implemented

`unionSolids` Boolean-unions the posed tiles and the accepted patches. `refineClusterMesh` in `lib/skill6/refine-mesh.ts` then applies `CLUSTER_REFINEMENT`: Laplacian at the seams, Taubin elsewhere, then a rim pass. Small sealed cavities are filled before smoothing. The raw union, the refined surface, and the patches are separate meshes. The rigid tiles, poses, contacts, growth sequence, joints, and graph stay on the cluster record for diagrams.

`connection-refine-v1` compares that baseline with a joint-local pass. Vertices outside the seam fade stay on the union. A cavity under the existing volume limit is filled only when its centroid is inside that neighborhood and outside an original sealed void. `floorShift`, `baseWeight`, the patch radius, and the voxel size stay as they are. An opening sample that lands inside another archetype is occupied space, not an altered void. Results are `data/skill6/experiments/connection-refine-v1/`. They are not promoted.

## Process archive

`data/skill6/process-archive/v1.json` is a pointer ledger. It records methodology versions, where each collection lives, and which meshes and fields are actually stored. It does not copy geometry. Original labels and validation outcomes stay in the experiment files. A missing historical mesh is left missing. A later drawing made from stored poses is a reading of those poses; an intermediate union that was never written is not an original record.

Compact and Branching remain generation presets. A neutral five-tile portfolio, `clustering-open-v1`, is described in that ledger and has not been run.

`diagnostics/geometry-v1` records measured branch points, joint area, mass, and refinement separately from the requested preset. The renders there are views of stored meshes. They are not new clusters.

`diagnostics/troubleshooting-v1` keeps every Graph plan from one seven-tile Branching search and the reproduced Rule Branching four-tile failure. The lab shows the requested preset beside the measured branch-point count. A joint under area 8 whose guest is more than 15% of the solid is a warning. It does not reject the cluster. Ranking and thresholds are unchanged.

`diagnostics/troubleshooting-v2` assembles the two six-tile Graph plans from a repeated search. Both pass as six-tile geometry and remain incomplete seven-tile attempts because each plan's budget share ended. Validated Rule, Graph, and WFC clusters also have tiles-only and patched-union crossings; refinement clears those. The Rule failure keeps two refined crossings, max 0.0354. Ranking, thresholds, budgets, and refinement are unchanged.

`diagnostics/troubleshooting-v3` gives widening and wide fan 420 tests each. Both place a validated seven-tile assembly, and neither is the stored chain. The two remaining Rule crossings are on the two compressed-sequential tiles and are already present in the raw union. Default budgets and refinement are unchanged.

`clustering-graph-budget-v1` keeps those two seven-tile alternatives for comparison. The overnight chain and the 210-test share stay in place. `diagnostics/troubleshooting-v4` tests a local seam split on the stored Rule Branching 4 mesh. A 0.0022 centroid step clears the 0.0354 crossing. The 0.0256 crossing moves onto an adjacent triangle. The corrected mesh is not validated, and the split is not part of the shared refiner.

`clustering-rule-large-v1` is a separate seven-tile Rule search. The stored compact run had stopped at six tiles because its rule set hit 8 backtracks. This collection uses 240 evaluations per tile and 16 backtracks, and it holds one validated Compact cluster of seven tiles. Branching was tried at 16 and 24 backtracks and stayed at five tiles. The default caps and the overnight collection are unchanged.

## Boundaries

Do not modify Skills 0–5 or the Skill 3 source meshes. Do not delete or overwrite existing Skill 6 experiments, the catalog, or stored datasets while this workflow stands. The lab presents those records. It is not a seventh stage.

A new Spatial Organization method replaces the experimental search only after it has been defined and evaluated. It still has to pass Geometric Validation, and it does not change patch settings or refinement to force an arrangement.
