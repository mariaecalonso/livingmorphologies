# Skill 2 evaluation framework

This is the master Skill 2 methodology reference. It explains how generated 2D Physarum morphology is compared with the **existing catalog**, not how to invent new architecture.

```
ARCHITECTURAL SOURCE (lib/catalog.ts)
        ↓
SKILL 1 biological translation
        ↓
Physarum simulation
        ↓
SKILL 2 neutral morphology measurement
        ↓
rating-specific architectural evaluation
        ↓
candidate correspondence (human still selects)
```

## Rules that do not change

- The catalog is the only architectural source of truth for criterion names, Low / Medium / High meanings, and each archetype’s selected ratings.
- Skill 2 does not invent architectural criteria and does not rewrite catalog descriptions.
- **Measurement** reports what emerged. It does not know whether a value is good.
- **Evaluation** asks whether that observed condition corresponds to **this archetype’s selected** Low, Medium, or High condition.
- The same measurement can score well against Low and poorly against High.
- Shared criteria use **one** reusable evaluator. Archetype identity supplies the selected rating and catalog text, not a second scoring system.
- Typology-specific weight is **1.15** (PROVISIONAL / CALIBRATABLE). Shared weight is **1.0**. Do not treat 1.15 as final calibration.
- Overall acceptability requires **both** a provisional overall minimum (55) **and** a provisional individual floor (30). These are not scientifically frozen.
- Final 2D selection remains **human**. Scores explain correspondence; they do not auto-pick a Skill 3 handoff.

## Rating-specific correspondence

Each mapped criterion has a morphological **observed condition** on `[0, 1]`. Zero and one are defined per criterion below. They are **not** universally “less / more.”

Correspondence to the selected rating is triangular distance to a provisional peak:

| Selected rating | Peak (PROVISIONAL) |
| --- | --- |
| Low | 0.20 |
| Medium | 0.50 |
| High | 0.80 |

`score = 100 × (1 − |observed − peak| / 0.65)`, clamped to 0–100.

A result always carries: evaluation question, observed condition, target rating, **catalog target description**, measurement evidence, and limitations.

Void Field keeps archetype-specific question wording as a prototype overlay. Every other archetype uses the reusable question template for that criterion plus its own catalog rating.

## Connectivity sentinel

`connection.continuity` is `1` when fewer than two concentrations exist. Evaluation **does not** treat that as High Connectivity. Compact undivided bodies (`branchCount < 2`, `skeletonEndpoints ≤ 2`, no mass pairs) score **0**. Otherwise Connectivity is `0.4×massRel + 0.4×networkRel + 0.2×bridgeRel`. `concentrationCount < 2` does not force 0. `connection.cycleDensity` / `cycleRank` remain **diagnostic only** (8-connected skeleton density saturates on live trails).

## Interior analysis domain

Skill 1 suppresses deposits within **2.6 occupancy cells** of the field edge. That empty ring is a **simulation boundary condition**. Skill 2 measurements that speak to openness, visibility, receptivity, or enclosure use an **interior analysis domain**: trail cells whose occupancy-mapped distance to the border is ≥ 2.6.

- The ring is **not** counted as architectural openness, visibility, or receptivity.
- Axis-aligned open spans are clipped to the interior; they cannot equal the full field width just because the perimeter is empty.
- Enclosure is the fraction of **interior** void that cannot reach the interior-domain perimeter (courtyards). Touching the suppressed ring does not count as “exposed.”
- `void.boundaryOpenFraction` is the void fraction of the **inner perimeter of the interior domain**, not the raw field edge.
- Morphology extraction (concentrations, bridges, skeleton) still sees the full trail field; only the architectural void/approach metrics neutralize the ring.

`connection.branching` is skeleton junctions **per occupancy-unit of skeleton length** (scale-aware). The complexity branching cap stays **5**; the cap is not raised to match raw junction counts.

Occupation-support remains measured (horizontal mass with true void in +y) but is **retired from evaluators**. It is typically 0 because dense cores are wrapped by connection-band, not void.

Circulation / spatial permanence classify interior corridor cells with exclusive precedence: **through (N4 sandwich) > around/wrap (N4 mass contact) > zone (inside concentration AABB, not wrap) > far**. Mix = `through + 0.5×zone`. Perimeter contact is diagnostic only. AABB overlap alone cannot promote a wrap to zone.

Proportionality: CV is family-wise (mass areas, void areas, thicknesses). n&lt;2 omits a family; no valid family → observed 0.5.

---

## Unique catalog criteria

There are **15 unique criteria**: 6 shared + 3 Lobby-specific + 3 Workspace-specific + 3 Gathering-specific.

### Formal — shared

#### Complexity

- **Low (catalog):** A simple formal organization with few geometric elements, limited variation, and a clear overall configuration.
- **Medium (catalog):** A moderately varied formal organization with multiple geometric elements or relationships, while maintaining a recognizable overall configuration.
- **High (catalog):** A highly varied formal organization with numerous geometric elements, transformations, intersections, or layered relationships that produce a complex configuration.
- **Question:** Does the morphology correspond to the catalog's {{Low/Medium/High}} Complexity condition?
- **Measurements:** `mass.concentrationCount`, scale-aware `connection.branching`, `topology.connectedComponentCount`, `proportion.overallVariation`, `activity.densityVariation`
- **Axis 0:** few masses, little branching/fragmentation, limited variation
- **Axis 1:** many masses, high branching/fragmentation, high variation
- **Correspondence:** `complexityAmount` vs selected peak
- **Limits:** Not program, not layered architectural drawings.

#### Proportionality

- **Low:** Spaces and elements have relatively uniform dimensions and proportions, with limited variation between their size relationships.
- **Medium:** Noticeable variations in dimension and proportion, creating multiple but relatively balanced relationships.
- **High:** Strongly differentiated dimensions and proportions; contrasting scales.
- **Question:** Does the morphology correspond to the catalog's {{rating}} Proportionality condition?
- **Measurements:** family CVs of concentration areas, void areas, and bridge thicknesses separately; `insufficientElements`
- **Limits:** Not classical proportion. Area is never mixed with thickness. n<2 omits a family; all omitted → observed 0.5.
- **Axis 0:** uniform dimensional relationships
- **Axis 1:** strongly differentiated dimensional relationships
- **Correspondence:** `proportionalVariation` vs selected peak (uniform is **not** universally good)
- **Limits:** Not classical proportion or human-scale dimensions.

### Formal — Lobby-specific

#### Centrality

- **Low:** The lobby occupies a peripheral or secondary position and has limited influence on access to surrounding spaces.
- **Medium:** Partially central; provides access to or organizes several surrounding spaces.
- **High:** Central primary spatial node from which surrounding spaces are accessed or organized.
- **Question:** Does the morphology correspond to the catalog's {{rating}} Centrality condition?
- **Measurements:** `mass.dominantCenterProximity`, `activity.centerProximity`, concentration and pair counts
- **Axis 0:** dominant mass/activity toward the field periphery
- **Axis 1:** dominant mass/activity at the field center
- **Correspondence:** `centralityAmount` vs selected peak
- **Limits:** Geometric field-center only. Not lobby program, access control, or actual distribution of people.

### Formal — Workspace-specific

#### Plate Articulation

- **Low:** Workspace plate predominantly continuous and uniform, minimal geometric change.
- **Medium:** Noticeable shifts, divisions, offsets, or variations that create distinct zones.
- **High:** Strongly articulated through shifts, projections, recesses, rotations, or subdivisions.
- **Question:** Does the morphology correspond to the catalog's {{rating}} Plate Articulation condition?
- **Measurements:** `topology.boundingBoxFill`, concentration count, component count, overall variation, branching
- **Axis 0:** compact, filled, lightly subdivided body
- **Axis 1:** offset/recessed/subdivided body with distinct zones
- **Correspondence:** `articulationAmount` vs selected peak
- **Limits:** 2D silhouette and subdivision, not a literal 3D floor plate, projection, or rotation.

### Formal — Gathering-specific

#### Circulation Integration

- **Low:** Circulation primarily separated from the gathering area, around or outside the space.
- **Medium:** Circulation partially overlaps or passes through the gathering area.
- **High:** Circulation embedded within the gathering area; movement paths shape gathering zones.
- **Question:** Does the morphology correspond to the catalog's {{rating}} Circulation Integration condition?
- **Measurements:** far / around / zone / through network fractions
- **Axis 0:** connective trails far from or wrapping concentrations
- **Axis 1:** connective trails organizing or passing through concentration territory
- **Correspondence:** `circulationMix` vs selected peak
- **Limits:** Thin-trail geometry, not designed pedestrian circulation. Wrap-around is Low (around/outside), not Medium or High. AABB overlap without N4 sandwich is not through.

### Spatial — shared

#### Openness

- **Low:** Predominantly enclosed; limited openings; restricted visual or physical access.
- **Medium:** Mix of enclosed and open conditions; moderate access.
- **High:** Predominantly open; extensive access; limited enclosure.
- **Question:** Does the morphology correspond to the catalog's {{rating}} Openness condition?
- **Measurements:** interior void fraction, largest interior void, interior enclosure, interior open spans
- **Limits:** 2D interior domain only; empty Skill 1 perimeter cannot create High.

#### Connectivity

- **Low:** Few direct relationships with adjacent spaces; limited movement, visibility, or interaction.
- **Medium:** Multiple relationships; moderate opportunities.
- **High:** Highly interconnected; numerous direct relationships through movement, visibility, and overlap.
- **Question:** Does the morphology correspond to the catalog's {{rating}} Connectivity condition?
- **Measurements:** pair counts when present, scale-aware branching, skeleton endpoints, bridges
- **Correspondence:** `connectivityAmount` vs selected peak; compact undivided body → 0; **concentration count does not veto**; **cycleDensity is diagnostic only**
- **Limits:** Not a door/room graph. High needs multiple meaningful relationships, not skeleton noise.

### Spatial — Lobby-specific

#### Directionality

- **Low:** No dominant directional axis. Movement and visual orientation distributed across multiple directions.
- **Medium:** A discernible primary direction, while secondary directions remain present.
- **High:** A strong directional axis clearly organizes movement, orientation, and visual focus.
- **Question:** Does the morphology correspond to the catalog's {{rating}} Directionality condition?
- **Measurements:** `topology.anisotropy`, `activity.spatialSpread`, `connection.meanBridgeLength`
- **Axis 0:** isotropic morphology
- **Axis 1:** strongly anisotropic / one dominant axis
- **Correspondence:** `directionalityAmount` vs selected peak
- **Limits:** Covariance of 2D morphology, not signage or intended sequence.

### Spatial — Workspace-specific

#### Modularity

- **Low:** Primarily continuous or fixed; limited repetition, subdivision, or ability to reorganize.
- **Medium:** Identifiable repeated or divisible units; some flexibility.
- **High:** Strongly organized through repeated, interchangeable, or reconfigurable units.
- **Question:** Does the morphology correspond to the catalog's {{rating}} Modularity condition?
- **Measurements:** concentration regularity when ≥2 masses; otherwise skeleton branch count and branch-length regularity
- **Limits:** Cannot evaluate interchangeability. One undivided body is Low; noisy branching is not High.

### Spatial — Gathering-specific

#### Spatial Permanence

- **Low:** Gathering is isolated from circulation paths. It exists wholly on its own.
- **Medium:** Gathering and circulation are parallel but do not co-exist.
- **High:** Circulation is within the gathering space. Gathering happens because of circulation.
- **Question:** Does the morphology correspond to the catalog's {{rating}} Spatial Permanence condition?
- **Measurements:** through / zone / around network fractions, hierarchy
- **Limits:** Mixing in the trail field, not time or material durability. Wrap with a distinguishable core is Low.

### Atmospheric — shared

#### Immersive

- **Low:** Minimally immersive. Sensory conditions neutral, predictable, detached; user remains aware of the surrounding environment.
- **Medium:** Moderately immersive. Light, material, sound, scale, and enclosure begin to shape perception.
- **High:** Deeply immersive. Multiple sensory and spatial qualities envelop the user.
- **Question:** Does the **spatially measurable** morphology correspond to the catalog's {{rating}} Immersive condition?
- **Measurements:** directional surround, morphological depth, layering, density variation, spread; courtyard enclosure optional and not required
- **Limits:** **Does not fabricate** material, sound, light. Solid fill is not High. Empty boundary ring cannot create immersion.

#### Visibility

- **Low:** Visual access limited; frequent interruptions to sightlines.
- **Medium:** Moderate visual access; open sightlines mixed with obstruction.
- **High:** Extensive visual access; long sightlines; minimal obstruction.
- **Question:** Does the morphology correspond to the catalog's {{rating}} Visibility condition?
- **Measurements:** interior mean/max open span, interior enclosure
- **Limits:** Axis-aligned interior spans, **not** full angular isovists. Empty boundary ring cannot create High.

### Atmospheric — Lobby-specific

#### Receptivity

- **Low:** Limited invitation. Formal, guarded, or psychologically distant; discourages entry or occupation.
- **Medium:** Moderate invitation. Accessible and comfortable, with some formality or control.
- **High:** Strong invitation. Welcoming, comfortable, accessible; encourages entry, interaction, occupation.
- **Question:** Does the spatially measurable morphology correspond to the catalog's {{rating}} Receptivity condition?
- **Measurements:** interior `void.boundaryOpenFraction`, enclosure, interior void fraction
- **Limits:** **Psychological invitation is not observed.** Spatial approachability of the interior domain only. Occupation-support is not used. Empty outer ring cannot create High.

### Atmospheric — Workspace-specific

#### Collaboration

- **Low:** Primarily configured for individual occupation; limited proximity or interaction.
- **Medium:** Individual and shared areas; moderate interaction.
- **High:** Strongly configured around shared areas, proximity, visual interaction, and spatial conditions that support collaboration.
- **Question:** Does the spatially measurable morphology correspond to the catalog's {{rating}} Collaboration condition?
- **Measurements:** `mass.clusteredness`, centroid separation, linked/pair counts, interior mean open span
- **Limits:** Not desks, teams, or actual interaction. Occupation-support is not used.

### Atmospheric — Gathering-specific

#### Social Proximity

- **Low:** Multiple paths or big spaces (catalog examples: foliage or tables) that separate experience; more private.
- **Medium:** Some private/open spaces in a series of identical spaces close together.
- **High:** Very compressed paths or open spaces; high people-load would be overstimulating.
- **Question:** Does the morphology correspond to the catalog's {{rating}} Social Proximity condition?
- **Measurements:** interior void fraction and open span; nearest-neighbor gap when several territories exist
- **Limits:** **No furniture or foliage.** Compact mass in a large void is Low, not High.

---

## Coverage

The current catalog has 3 typologies × 5 archetypes × 9 criteria = **135** evaluation targets. Each target must have a registered spec, a catalog rating, a catalog description, valid measurement evidence, and a deterministic result. None may silently score 0 for lack of mapping.

## Prototype note

Void Field was the first fully worded prototype. The library above is the reusable criterion layer for every catalog criterion. Candidate search, the nine-candidate matrix, UI, frozen calibration, and Skill 3 are out of scope for this document’s implementation status.

## Post-calibration evidence refinement

The first 300-simulation calibration (`docs/skill2-calibration-report.md`) is **preserved**. It found 49/300 provisional accepts (16.3%), all 251 rejects hitting the individual floor, and saturated/constant measurements (`void.maxOpenSpan=20`, `boundaryOpenFraction=1`, perimeter contact ≈ 0.98, occupation ≈ 0, branching mean 27 vs cap 5).

This revision repairs **evidence** (interior domain, branching scale, circulation embedding, occupation retirement, proportionality sampling) **before** any retuning of peaks or gates.

**Unchanged:** Low 0.20 / Medium 0.50 / High 0.80; shared weight 1.0; typology-specific 1.15; overallMinimum 55; individualFloor 30; `complexityBranchingCap` 5.

Recalibration uses the same protocol. Results: `docs/skill2-post-calibration-refinement.md`. Do not treat a new accept rate as a target.

## Final pre-freeze evaluator refinement

A second, diagnosis-driven pass (`docs/skill2-final-evaluator-refinement.md`) corrects six remaining methodological errors without changing peaks, weights, floors, the interior domain, or Skill 1:

1. Proportionality: within-family CV only; mixed area/thickness pool removed.
2. Circulation / permanence: far / around / zone / through; wrap is Low.
3. Immersive: surround, depth, layering; courtyard not required; solid fill not High.
4. Social proximity: intervening void and NN spacing; compact blob in generous void is Low.
5. Connectivity: no concentration-pair veto; mass pairs plus skeleton relationships/loops.
6. Modularity: no concentration veto; similar repeated units (masses or branches).

## Classifier freeze correction (final pre-candidate)

`docs/skill2-classifier-freeze-correction.md`: wrap N4 before AABB zone; `cycleDensity` removed from Connectivity scoring. Fourth calibration **56/300 = 18.7%**, deterministic. Methodology **FREEZE** for candidate generation. Earlier reports are not rewritten.
