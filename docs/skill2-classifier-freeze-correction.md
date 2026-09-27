# Skill 2 classifier freeze correction

Fourth evidence stage. **Final pre-candidate calibration.** Does not replace earlier reports:

1. `docs/skill2-calibration-report.md` — first calibration **49/300 = 16.3%**
2. `docs/skill2-post-calibration-refinement.md` — interior-domain **22/300 = 7.3%**
3. `docs/skill2-final-evaluator-refinement.md` — evaluator refinement **35/300 = 11.7%**
4. This pass — classifier freeze **56/300 = 18.7%**

Accept rate is **not** a success criterion. Peaks, weights, floors, Skill 1, catalog, UI, candidate generation, and the simulation protocol are unchanged.

## Protocol (unchanged)

15 archetypes × 20 seeds = 300 simulations. 1000 agents, 600 max iterations, `trailDecay` 0.986, `hashSeed(["skill2-calibration-v1", archetypeId, String(sampleIndex)])`.

- Runtime **616904 ms (~10.3 min)**
- `deterministic: true`
- n = 300

## Two corrections only

### 1. Wrap / around classification precedence

A concentration AABB is a fat box. Live wrap trails often sit *inside* that box without sandwiching mass. Classifying AABB overlap as ZONE before N4 boundary contact turned catalog Low wrap into Medium-like mix (Void Field around ≈ 0.013, zone ≈ 0.54, permanence ≈ 0.44).

AABB overlap is **not** architectural through-territory. N4 contact without sandwich is wrap.

**Exclusive corridor-cell precedence (deterministic, archetype-neutral):**

1. **THROUGH** — 4-neighbor sandwich: mass on opposite sides (left+right or up+down).
2. **AROUND / WRAP** — not sandwich, but N4-adjacent to a concentration.
3. **ZONE / PARTIAL** — not 1–2, but inside a concentration AABB.
4. **FAR** — none of the above.

Observed mix for Circulation Integration and Spatial Permanence remains:

`throughNetworkFraction + 0.5 × zoneNetworkFraction`

Far and around contribute 0. A wrap that lies inside an AABB stays **around**, not zone.

Synthetic verification: far → Low; N4 wrap → Low; inner-edge wrap inside AABB stays around; zone → Medium-like (0.5); through/bisect → High-like.

Void Field is a validation case (catalog Low Spatial Permanence), not a tuning target.

### 2. cycleDensity removed from Connectivity scoring

Live `connection.cycleDensity` mean ≈ **0.992** (min 0.676, p25–p90 = 1). 8-connected skeleton cycle rank saturates and does not discriminate architecture.

It is **not rescaled**. It is **not replaced** with another graph metric.

**Final Connectivity formula:**

```
massRel = pairOpportunityCount < 1 ? 0 : linkedPairCount / pairOpportunityCount
compact = branchCount < 2 AND skeletonEndpoints ≤ 2
if compact AND massRel === 0 → 0
networkRel = 0.5 × saturate(skeletonEndpoints, 8) + 0.5 × saturate(branching, 3)
bridgeRel = saturate(bridgeCount, connectivityBridgeCap=6)
connectivityAmount = 0.4×massRel + 0.4×networkRel + 0.2×bridgeRel
```

`concentrationCount < 2` does not force 0. Compact undivided body remains Low. `cycleRank` / `cycleDensity` stay measured and listed as evidence diagnostics; they **do not enter** `connectivityAmount`.

## This-pass calibration

Overall **56/300 = 18.7%**. Floor rejects **241**. Overall-only rejects **3**.

### Acceptance by archetype (20 samples each)

| Archetype | Accept | Rate |
| --- | ---: | ---: |
| vertical-void | 15 | 75% |
| compressed-sequential | 11 | 55% |
| topographic-ground-field | 10 | 50% |
| void-edge | 7 | 35% |
| open-hall | 6 | 30% |
| linear-edge-gallery | 3 | 15% |
| terraced | 2 | 10% |
| linear-gallery | 1 | 5% |
| void-field | 1 | 5% |
| continuous-hall | 0 | 0% |
| flat-deep-plan | 0 | 0% |
| undulated | 0 | 0% |
| stepped-amphitheater | 0 | 0% |
| inserted-horizontal-plate | 0 | 0% |
| contained-room-within-volume | 0 | 0% |

Zero-accept archetypes are **not** a reason to unfreeze.

### Floor-failure counts (among floor rejects)

| Criterion | Hits |
| --- | ---: |
| proportionality | 99 |
| connectivity | 75 |
| spatial-permanence | 63 |
| modularity | 55 |
| circulation-integration | 47 |
| directionality | 39 |
| social-proximity | 38 |
| complexity | 35 |
| visibility | 29 |
| openness | 22 |
| plate-articulation | 21 |
| centrality | 3 |
| immersive | 3 |

### Observed axes (all 15)

| Axis | mean | sd | min | max |
| --- | --- | --- | --- | --- |
| complexityAmount | 0.490 | 0.134 | 0.033 | 0.888 |
| proportionalVariation | 0.699 | 0.224 | 0.003 | 1.000 |
| centralityAmount | 0.742 | 0.101 | 0.527 | 0.941 |
| articulationAmount | 0.506 | 0.137 | 0.108 | 0.823 |
| circulationMix / circulationConstitution | 0.217 | 0.127 | 0.000 | 0.439 |
| opennessAmount | 0.751 | 0.136 | 0.362 | 0.972 |
| connectivityAmount | 0.530 | 0.231 | 0.094 | 0.967 |
| directionalityAmount | 0.256 | 0.122 | 0.021 | 0.798 |
| modularityAmount | 0.244 | 0.250 | 0.000 | 0.764 |
| spatialImmersion | 0.483 | 0.069 | 0.320 | 0.666 |
| visibilityAmount | 0.626 | 0.105 | 0.304 | 0.851 |
| receptivitySpatial | 0.732 | 0.141 | 0.169 | 0.978 |
| collaborationAmount | 0.483 | 0.116 | 0.135 | 0.776 |
| proximityAmount | 0.678 | 0.102 | 0.300 | 0.862 |

Corridor bins (all 300): far **0.443**, around **0.131**, zone **0.418**, through **0.0075**. Around rose from 0.013 after wrap precedence.

### Void Field (n=20)

| Bin | mean |
| --- | --- |
| far | 0.131 |
| around | 0.209 |
| zone | 0.646 |
| through | 0.015 |

Spatial Permanence observed mean **0.337** (was 0.44). Low correspondence mean **78.9** (range 71.2–87.2). Catalog target Low. Remaining zone is AABB-without-N4 (partial influence), not wrap mislabeled as zone.

### Connectivity

Observed 0.094–0.967, mean **0.530**, p50 **0.40** (was mean 0.76 with saturated cycles).

| Target | n | observed mean | correspondence mean |
| --- | ---: | ---: | ---: |
| Low | 100 | 0.584 | 42.0 |
| Medium | 80 | 0.623 | 59.4 |
| High | 120 | 0.423 | 41.6 |

cycleDensity remains ~0.992 and **does not drive** the axis (synthetic cycleDensity 1 vs 0: identical observed Connectivity).

High Connectivity is still structurally hard: live High-target morphologies often lack several mass-pair + bridge relationships. That is representational, not a saturated-metric scoring bug.

## Remaining representational limitations (not freeze blockers)

- **High Directionality** — High-target observed mean 0.311 vs peak 0.80; correspondence mean 24.8.
- **High Modularity** — live max 0.764; branchLengthRegularity near 0 on noisy skeletons.
- **Through-core circulation / High Spatial Permanence** — through fraction mean 0.0075; High permanence correspondence mean 16.3. Skill 1 through-core is rare.
- **Low Proportionality** — family CVs often high (overallVariation mean 0.70); Low target correspondence mean 17.4.
- **High Connectivity** — High-target observed mean 0.42 vs peak 0.80.
- Six archetypes with 0/20 accepts.

## Saturated / constant measurements

**Still used in scoring (with known limits):**

- `connection.throughNetworkFraction` — near-zero on live fields; used in circulation/permanence mix.
- `connection.branchLengthRegularity` — saturates ~0; used only in single-mass modularity branch path.
- Family CVs / `proportionalVariation` can saturate at 1.
- `proportion.insufficientElements` — sentinel 0.5 when no family has n≥2.

**Measured, not used in scoring:** `cycleDensity`, `cycleRank` (diagnostic), occupation support, meanPerimeterContact, embeddedNetworkFraction (diagnostic alongside bins), Skill 1 edge-ring constants (`analysis.*`, field size).

## Freeze decision

No remaining Skill 2 defect comparable to a constant used as major evidence, inverted classification, invalid comparison, or broken sentinel.

**FREEZE** Skill 2 evaluation methodology and begin candidate generation.

Do not refine further because acceptance is 18.7%, some archetypes have 0 accepts, or High Modularity / High Directionality / through-core remain rare.
