# Skill 2 final pre-freeze evaluator refinement

Historical stages (not rewritten):

1. First calibration: `docs/skill2-calibration-report.md` — **49/300 = 16.3%**
2. Interior-domain repair: `docs/skill2-post-calibration-refinement.md` — **22/300 = 7.3%**
3. This pass — **35/300 = 11.7%**

Accept rate is **not** a success criterion. Peaks/weights/floors unchanged. Interior domain unchanged. Skill 1 unchanged.

## Protocol

Same as both earlier passes: 15 × 20 seeds, 1000 agents, 600 iter, `trailDecay` 0.986, `hashSeed(["skill2-calibration-v1", archetypeId, String(sampleIndex)])`.

- Runtime **676653 ms (~11.3 min)**
- `deterministic: true`
- n = 300

## Six corrections (catalog-based)

1. **Proportionality** — family-wise CV only (mass areas, void areas, thicknesses). n&lt;2 omits family. No valid family → observed 0.5. Mixed-unit pool removed.
2. **Circulation / permanence** — far / around / zone / through. Mix = `through + 0.5×zone`. Wrap intended as Low.
3. **Immersive** — surround, depth, layering, density gradient, spread; enclosure 4% only. Solid fill and empty ring cannot create High.
4. **Social proximity** — intervening void / NN; not inverse spatialSpread.
5. **Connectivity** — no pair veto. Compact undivided body → 0. Else mass pairs + skeleton endpoints/nodes/branching + cycle density.
6. **Modularity** — no concentration veto. ≥2 masses use size/spacing regularity; else similar skeleton branches (`branchLengthRegularity`). Undivided body → 0.

## This-pass calibration (summary)

Overall **35/300 = 11.7%**. Floor rejects 265; overall-only 0.

Immersive floors **3** (were 147). Connectivity floors **96** (were 154 then still pair-gated). Proportionality floors **99** (were 158 / 130).

### Live-field caveats (not frozen)

- **`connection.cycleDensity` mean 0.99** — 8-connected skeleton cycle rank is saturated. Connectivity observed **0.49–1.00**, mean 0.76, so Low-target connectivity is no longer 0 but is biased high. Compact-body Low still holds in synthetic tests.
- **`aroundNetworkFraction` mean 0.013** — wrap cells often fall **inside irregular concentration AABBs** and are classed as **zone** (mean 0.54), so live wrap is Medium-like (~0.44), not Low. Synthetic wrap (outside AABB) is correctly Low. Void Field permanence observed mean **0.44** (scores ~63 vs Low peak 0.20) — better than 0.88, not yet catalog Low.

These two are Skill 2 classification issues, not Skill 1. Do not freeze until around-vs-zone uses perimeter contact *before* AABB, and cycle rank is dropped or replaced with a conservative loop test.

## Observed axes (all 15)

| Axis | mean | sd | min | max |
| --- | --- | --- | --- | --- |
| complexityAmount | 0.49 | 0.13 | 0.03 | 0.89 |
| proportionalVariation | 0.70 | 0.22 | 0.00 | 1.00 |
| centralityAmount | 0.74 | 0.10 | 0.53 | 0.94 |
| articulationAmount | 0.51 | 0.14 | 0.11 | 0.82 |
| circulationMix | 0.28 | 0.15 | 0.00 | 0.51 |
| opennessAmount | 0.75 | 0.14 | 0.36 | 0.97 |
| connectivityAmount | 0.76 | 0.17 | 0.49 | 1.00 |
| directionalityAmount | 0.26 | 0.12 | 0.02 | 0.80 |
| modularityAmount | 0.24 | 0.25 | 0.00 | 0.76 |
| circulationConstitution | 0.28 | 0.15 | 0.00 | 0.51 |
| spatialImmersion | 0.48 | 0.07 | 0.32 | 0.67 |
| visibilityAmount | 0.63 | 0.11 | 0.30 | 0.85 |
| receptivitySpatial | 0.73 | 0.14 | 0.17 | 0.98 |
| collaborationAmount | 0.48 | 0.12 | 0.14 | 0.78 |
| proximityAmount | 0.68 | 0.10 | 0.30 | 0.86 |
