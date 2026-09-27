# Skill 2 post-calibration evidence refinement

This report is **additive**. The first 300-run calibration findings in `docs/skill2-calibration-report.md` are unchanged and remain the baseline (49/300 = 16.3% provisional accept; 251 floor rejects; Proportionality 158, Connectivity 156, Complexity 65, Modularity 55).

This pass **repairs measurements** so they describe interior morphology rather than Skill 1 boundary artifacts. Peaks, weights, and acceptability gates were **not** retuned to recover the old accept rate.

## What was repaired (analysis only)

| Problem (first calibration) | Repair |
| --- | --- |
| `void.maxOpenSpan` always 20 | Interior-domain axis-aligned spans only |
| `void.boundaryOpenFraction` always 1 | Inner perimeter of interior domain, not field edge |
| Enclosure treated field edge as “exposed” | Enclosure = interior void that cannot reach the interior perimeter (courtyards) |
| Branching mean 27, max 244 vs cap 5 | Junctions per occupancy-unit of skeleton length; cap stays 5 |
| Perimeter contact ≈ 0.98 → circulation/permanence High | Embedded vs separated network; perimeter contact diagnostic only |
| Occupation ≈ 0 in evaluators | Still measured; **retired** from Receptivity and Collaboration |
| Proportionality CV sentinel / too few elements | Mixed element sizes; `insufficientElements` → observed 0.5, not Low-uniform |
| One concentration treated as connected network | Still observed 0 for Connectivity if `< 2` concentrations |

**Unchanged:** Low 0.20, Medium 0.50, High 0.80; shared 1.0; typology-specific 1.15; overallMinimum 55; individualFloor 30; `complexityBranchingCap` 5. `meanBridgeLength` remains bounding extent.

## Recalibration protocol

Same as the first pass: 15 archetypes × 20 seeds, 1000 agents, 600 max iter, `trailDecay` 0.986, `hashSeed(["skill2-calibration-v1", archetypeId, String(sampleIndex)])`. Replay deterministic.

- **300** simulations
- Wall time **810867 ms (~13.5 min)** plus sensitivity
- `deterministic: true`

## Measurement distributions (after repair)

No longer constant:

- `void.maxOpenSpan` **7.5–14.67** (mean 13.35). Interior extent is 14.67 occupancy units (field 20 minus two 2.6-cell rings). Full-field 20 is gone.
- `void.boundaryOpenFraction` **0.22–0.96** (mean 0.60, sd 0.15)
- `void.voidFraction` (interior) **0.15–0.91** (mean 0.49)
- `topology.enclosure` **0–0.90** (mean 0.11; most morphologies are not courtyards)
- `connection.branching` **0.66–4.16** (mean 2.66) — under the unchanged cap of 5
- `void.meanOpenSpan` **1.11–9.19** (mean 3.07)

Still (correctly) uninformative or diagnostic-only:

- `connection.meanPerimeterContact` mean **0.98** (kept; not used in evaluators)
- `connection.embeddedNetworkFraction` mean **0.0075**, max 0.043 — Skill 1 almost never threads connection-band *through* mass
- `connection.separatedNetworkFraction` mean **0.033** — corridors usually touch masses
- `occupation.*` still ~0 (support count mean 0.10). Detector requires true void in +y; cores are wrapped by connection-band (0.08–0.40). Not forced nonzero.
- `proportion.insufficientElements` **always 0** on live runs (mixed sizes always ≥ 2)
- Analysis domain sizes are constant for the 20×20 occupancy field (expected metadata)

## Observed axes

| Axis | mean | sd | range | Note vs first pass |
| --- | --- | --- | --- | --- |
| opennessAmount | 0.75 | 0.14 | 0.36–0.97 | Wider range; no longer glued to ~0.75±0.06 |
| visibilityAmount | 0.63 | 0.11 | 0.30–0.85 | Was 0.70±0.04; interior spans move it |
| receptivitySpatial | 0.73 | 0.14 | 0.17–0.98 | Was 0.57±0.025, driven by always-open field edge |
| spatialImmersion | 0.33 | 0.06 | 0.19–0.60 | Was 0.49; enclosure now courtyards, usually low |
| circulationMix | 0.39 | 0.03 | 0.22–0.42 | Was 0.70–0.92; wrap is no longer High |
| circulationConstitution | 0.41 | 0.04 | 0.27–0.46 | Was ~0.88; Void Field Low permanence is no longer “most mixed” |
| connectivityAmount | 0.33 | 0.37 | 0–0.95 | High-target mean still **0.17**, P50 **0** (too few concentrations) |
| proportionalVariation | 0.85 | 0.16 | 0.24–1 | Mixed-size CV; Low targets still observe high variation |
| complexityAmount | 0.53 | 0.14 | 0.13–0.95 | Branching no longer saturates the cap |

Void Field spatial permanence observed mean **0.42** (was 0.88). Catalog Low isolation is still not reached (peak 0.20), but the axis is no longer saturated toward “constituted by circulation.”

## Acceptability (same 55 / 30 gates)

- **22 / 300 = 7.3%** provisional accept
- **278** floor rejects; **0** overall-only rejects
- This **drop from 16.3% is expected**: false High openness/visibility/circulation from the empty ring and wrap-around trails was removed. **Do not lower floors or peaks to recover 16.3%.**

Top floor hits: Connectivity 154, Immersive 147, Proportionality 130, Modularity 55, Complexity 43, Social proximity 40, Directionality 39, Visibility 29, Openness 22, Plate articulation 19, Spatial permanence 12.

Archetype accept rates (n=20): vertical-void 35%; open-hall 20%; contained-room-within-volume 20%; void-edge 15%; linear-edge-gallery 15%; terraced 5%; all others 0% (including void-field).

Immersive High is now a major floor hit because interior enclosure is usually low (open field around islands). That is a real morphological reading, not a scoring trick.

## Remaining structural limits (Skill 1, unmodified)

1. Edge suppression still exists; it is now **excluded**, not scored as openness.
2. Trail wrapping of dense cores still yields perimeter contact ≈ 1 and almost no embedded corridors. Gathering High circulation/permanence is rare because the engine does not thread trails through masses.
3. One or two concentrations remain common → High Connectivity / High Modularity still lack opportunity.
4. Occupation-support is the wrong geometric primitive for this 2D trail field.
5. Proportionality Low is still hard: live morphologies have high mixed-size CV.

Calibration remains **not frozen.** Candidate search, ranking, matrix, UI, and Skill 3 are out of scope.
