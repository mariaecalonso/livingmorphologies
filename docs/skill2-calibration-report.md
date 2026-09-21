# Skill 2 calibration report

This is an **evidence** report. It does not freeze calibration, search for high-scoring seeds, or change catalog ratings / Skill 1 translations.

Raw numbers: `calibration/skill2/summary.json` and `calibration/skill2/samples.json` (generated, gitignored). Methodology remains in `docs/skill2-evaluation-framework.md`.

## Protocol

| Item | Value |
| --- | --- |
| Engine | Skill 1 `createSimulation` + `stepMany` (same stepping and RNG mix as `runSimulation`) |
| Agents | 1000 |
| Max iterations | 600 |
| trailDecay | 0.986 (explicit `stepMany` argument; Skill 1 default) |
| Variation | **seed only** |
| Ratings / translation | catalog + `translateArchetype` / `toHandoff` (unchanged) |
| Extraction | default Skill 2 morphological extraction |
| Evaluation | current provisional peaks 0.20 / 0.50 / 0.80, tolerance 0.65, weights 1.0 / 1.15, overall 55, floor 30 |

**Seed formula (deterministic):**

`hashSeed(["skill2-calibration-v1", archetypeId, String(sampleIndex)])`

`sampleIndex` runs `0 … 19`. Skill 1 stepping still uses `mulberry32(seed ^ 0x9e3779b9)`, matching `runSimulation`.

Replay of the first sample reproduced the same measurements and scores (`deterministic: true`).

## Sample size and runtime

- **300** simulations (20 seeds × 15 archetypes) completed
- Sensitivity: **81** additional runs (first archetype of each typology × 3 seeds × 9 threshold pairs)
- Wall time: **573014 ms (~9.6 min)** for the main 300 plus sensitivity and replay
- Iterations: mean 596.6; P10–P90 = 600. A few `contained-room-within-volume` and similar runs stopped early at Skill 1 convergence (min 443)

## Measurement distributions (all 300)

Constants (no morphological information in this protocol):

- `field.size` = 20, `field.height` = 10 (metadata)
- `void.maxOpenSpan` = **20 always** (full field width)
- `void.boundaryOpenFraction` = **1 always**

Near-saturated / barely used:

- `activity.peakConcentration` ≈ 1.77 (Skill 1 trail cap ~1.8)
- `connection.meanPerimeterContact` mean 0.98, P10 0.92 (almost every concentration is fully wrapped by trails)
- `occupation.*` almost always 0 (support count mean 0.10; fraction ~0)
- `proportion.connectionThicknessVariation` P90 = 0 (few multi-bridge samples)

Varies and is usable:

- density / void fraction / enclosure / bbox fill / anisotropy / center proximity
- concentration count (1–7, mean 2.0)
- component count (1–44, mean 12.2) — fragmentation is common
- `connection.branching` mean **27**, max **244** (the complexity cap of 5 is far below observed)
- bridge count mostly 0–1 (mean 0.59)
- pair opportunity often 0 or 1 (P50 = 1, P10 = 0)

`connection.meanBridgeLength` in this run used cell-count × cell size as a length, which **overstates** long corridors (max 1074 on a 20-cell field). That is a Skill 2 computational bug; it was corrected after this run to axis-aligned bounding extent only. **Do not use the stored bridge-length distribution for calibration.** Other measurements are unaffected.

## Evaluation distributions

Observed axes that **barely move** (poor rating discrimination):

| Axis | mean | sd | range |
| --- | --- | --- | --- |
| receptivitySpatial | 0.57 | 0.025 | 0.53–0.65 |
| spatialImmersion | 0.49 | 0.051 | 0.39–0.61 |
| visibilityAmount | 0.70 | 0.043 | 0.61–0.83 |
| opennessAmount | 0.75 | 0.056 | 0.61–0.88 |

Because those sit near 0.5–0.8, **Medium/High correspondence looks “good” and Low looks “bad” regardless of archetype intent.** Example: Openness Low mean score **16.6**; Openness High **88.5**, while observed Low/High means are both ~0.75.

Axes that **do** move:

- `connectivityAmount` (0–0.95, but P50 = **0**)
- `proportionalVariation` (0–1)
- `modularityAmount` (often 0)
- `centralityAmount` (0.53–0.94) — tracks lobby High vs Low well
- `complexityAmount` (0.25–0.95) but Low-target archetypes still observe **high** complexity (Low obs mean 0.67)

Connectivity: High-target samples have observed mean **0.16** and score mean **20**; many have zero pair opportunities, so High Connectivity cannot correspond. Low-target mean score 54 (better, but noisy).

Void Field (targets Low complexity/proportion/connectivity/permanence/proximity, High openness/immersive/visibility, Medium circulation): **0/20 acceptable**, overall ~31–38. Spatial permanence observed ~0.88 (mixed) against a Low isolation target → scores near 0.

## Archetype differentiation

Skill 1 translations **do** separate populations on several measurements. Between/within stdev ratio (higher = clearer archetype signal):

**Lobby:** spatialSpread (5.6), voidFraction (4.7), dominantCenterProximity (4.5), boundingBoxFill (3.7), centerProximity (2.9)

**Workspace:** component count (3.6), residual gaps, mean open span; occupation metrics discriminate only because a few runs have rare supports

**Gathering:** voidFraction (7.2), boundingBoxFill (6.2), meanDensity (5.9), meanOpenSpan (5.4), mass fraction (4.4)

Fails to differentiate: boundary void, max open span, peak concentration, usually occupation, often bridge thickness.

**Do not change Skill 1** because some pairs look similar. Similarity is reported, not “fixed.”

## Typology-specific criteria (observed condition by archetype)

Weights unchanged: shared 1.0, specific **1.15 provisional**.

**Lobby / Centrality** — useful. High-catalog archetypes (continuous-hall 0.88, linear-gallery 0.85) vs Low (topographic 0.57, compressed-sequential 0.61). Scores: High mean 88, Low mean 40.

**Lobby / Directionality** — weak. All five sit ~0.20–0.32. High-target scores mean **25** because observed never approaches 0.80.

**Lobby / Receptivity** — almost no variation (0.56–0.59). Driven by always-open boundary. High vs Medium scores are an artifact of the peak location, not morphology.

**Workspace / Plate articulation** — moderate. Undulated 0.26 vs flat-deep-plan 0.59.

**Workspace / Modularity** — weak/zero-inflated. Many runs have one concentration → observed 0. High-target mean score 15.

**Workspace / Collaboration** — compressed around 0.50, so Medium scores ~94 and Low ~53 with little archetype spread.

**Gathering / Circulation integration** — high for everyone (0.70–0.92). Medium (void-field 0.90) is not “partial”; it is as mixed as High targets. Mean perimeter contact ≈ 1 by construction (dense core + surrounding trails).

**Gathering / Spatial permanence** — Void Field (Low / isolated) is the **most mixed** (0.88), so it fails isolation. High targets score well because the axis is saturated toward “constituted by circulation.”

**Gathering / Social proximity** — Void Field 0.78 (compressed) vs contained-room 0.53. Low-target Void Field scores **~13**, opposite of the generous-territory intent.

## Acceptability (provisional 55 / 30)

- **Overall: 16.3% (49 / 300)**
- All 251 rejects hit the **individual floor**; none failed on overall-only

| Archetype | Accept % |
| --- | --- |
| vertical-void | 55 |
| contained-room-within-volume | 50 |
| open-hall | 30 |
| void-edge | 30 |
| topographic-ground-field | 25 |
| linear-edge-gallery | 25 |
| terraced | 20 |
| undulated | 5 |
| inserted-horizontal-plate | 5 |
| compressed-sequential, continuous-hall, linear-gallery, flat-deep-plan, stepped-amphitheater, void-field | **0** |

Most common floor hits: **proportionality 158**, **connectivity 156**, complexity 65, modularity 55, then openness / directionality / visibility / social-proximity (39–40).

This pass rate is **not** a target. Do not raise floors or peaks to manufacture 50% pass.

## Extraction sensitivity

Subset: vertical-void, open-hall, stepped-amphitheater × 3 seeds × void ∈ {0.05, 0.08, 0.12} × mass ∈ {0.30, 0.40, 0.50} (n=9 per cell).

- **voidMaxRelative** moves void fraction (0.71 → 0.76 → 0.80) and significant void count (2.0 → 1.8 → 1.3). Linked pairs drop at 0.12 (thin trails fall into void).
- **massMinRelative** moves mass fraction (0.095 → 0.068 → 0.048) and slightly pair counts. Concentration count stays ~2.
- Occupation support stays 0 at all nine cells.
- Default 0.08 / 0.40 is not uniquely unstable; 0.12 starts deleting connections.

No threshold was chosen for scores.

## Skill 1 behavior that limits Skill 2

Not modified. Observed limits:

1. **Edge suppression** in the engine makes the boundary almost empty → `boundaryOpenFraction` and `maxOpenSpan` are constants; Receptivity/Visibility Low cannot be expressed.
2. **Trail value cap (~1.8)** saturates `peakConcentration`.
3. **Dense core + surrounding trails** is a common Skill 1 pattern, so perimeter contact ≈ 1 and circulation/permanence axes cannot represent “separated gathering.”
4. Many translations yield **one or two concentrations**, so High Connectivity / High Modularity have no morphological opportunity.
5. Early **convergence** on some contained-interior seeds shortens the run (443–600) but is seed-dependent, not a Skill 2 bug.

## Recommended changes before candidate search

Do **not** freeze peaks, weights, or acceptability gates yet.

1. **Rebuild Visibility / Openness / Receptivity axes** so they are not dominated by always-true full-width void and always-open boundary. Consider interior-only spans, ignoring the outer ring, or span relative to a non-boundary void mask.
2. **Log or raise `complexityBranchingCap`** (observed branching ~27 vs cap 5). As-is, complexityAmount saturates on branching for almost every live network.
3. **Treat pairOpportunityCount = 0 as a first-class Low-connectivity condition** (already done) but **do not expect High Connectivity** until Skill 2 generation can produce multiple concentrations; seed-only 2D runs rarely do.
4. **Drop or redesign occupation-support** for this 2D field: y is not a floor stack, and the detector almost never fires. Using it for Receptivity/Collaboration adds noise.
5. **Circulation mix / permanence:** meanPerimeterContact is not informative. Prefer interior overlap or network-vs-mass intensity contrast, or accept that Skill 1 around-absence still wraps mass with trails.
6. **Proportionality:** `overallVariation` often 0 or ~1 (zero-inflated / saturated). Require a minimum element count before scoring, or use a robust spread.
7. **Correspondence peaks:** several axes cluster at 0.5–0.8, so Medium/High are default winners. Recenter peaks on **empirical observed distributions by target**, or widen tolerance — only after axes are de-saturated. Do not do that in order to pass Void Field.
8. Keep typology weight at **1.15**. Specific criteria are not currently the main rejectors except modularity / social proximity / directionality.

## Limitations

- Seed-only; no agent-count or decay sweep
- Sensitivity used three archetypes × three seeds, not the full 300
- Bridge-length column in `samples.json` is the pre-fix quantity
- No images (by design)
- Acceptability uses unfrozen provisional gates

Calibration is **not frozen.**
