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

`connection.continuity` is `1` when fewer than two concentrations exist. Evaluation **does not** treat that as High Connectivity. It uses `pairOpportunityCount` and `linkedPairCount`.

---

## Unique catalog criteria

There are **15 unique criteria**: 6 shared + 3 Lobby-specific + 3 Workspace-specific + 3 Gathering-specific.

### Formal — shared

#### Complexity

- **Low (catalog):** A simple formal organization with few geometric elements, limited variation, and a clear overall configuration.
- **Medium (catalog):** A moderately varied formal organization with multiple geometric elements or relationships, while maintaining a recognizable overall configuration.
- **High (catalog):** A highly varied formal organization with numerous geometric elements, transformations, intersections, or layered relationships that produce a complex configuration.
- **Question:** Does the morphology correspond to the catalog's {{Low/Medium/High}} Complexity condition?
- **Measurements:** `mass.concentrationCount`, `connection.branching`, `topology.connectedComponentCount`, `proportion.overallVariation`, `activity.densityVariation`
- **Axis 0:** few masses, little branching/fragmentation, limited variation
- **Axis 1:** many masses, high branching/fragmentation, high variation
- **Correspondence:** `complexityAmount` vs selected peak
- **Limits:** Not program, not layered architectural drawings.

#### Proportionality

- **Low:** Spaces and elements have relatively uniform dimensions and proportions, with limited variation between their size relationships.
- **Medium:** Noticeable variations in dimension and proportion, creating multiple but relatively balanced relationships.
- **High:** Strongly differentiated dimensions and proportions; contrasting scales.
- **Question:** Does the morphology correspond to the catalog's {{rating}} Proportionality condition?
- **Measurements:** `proportion.concentrationSizeVariation`, `voidSizeVariation`, `connectionThicknessVariation`, `overallVariation`
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
- **Measurements:** `connection.meanPerimeterContact`, `footprintOverlap`, continuity, bridges, concentration count
- **Axis 0:** connective trails outside / around concentrations
- **Axis 1:** connective trails embedded in concentration footprints
- **Correspondence:** `circulationMix` vs selected peak
- **Limits:** Thin-trail geometry, not designed pedestrian circulation.

### Spatial — shared

#### Openness

- **Low:** Predominantly enclosed; limited openings; restricted visual or physical access.
- **Medium:** Mix of enclosed and open conditions; moderate access.
- **High:** Predominantly open; extensive access; limited enclosure.
- **Question:** Does the morphology correspond to the catalog's {{rating}} Openness condition?
- **Measurements:** void fraction, largest void, void continuity, enclosure, open spans
- **Axis 0:** little continuous void; tight enclosure
- **Axis 1:** substantial continuous void; limited enclosure
- **Correspondence:** `opennessAmount` vs selected peak
- **Limits:** 2D field only; no rooms outside the simulation.

#### Connectivity

- **Low:** Few direct relationships with adjacent spaces; limited movement, visibility, or interaction.
- **Medium:** Multiple relationships; moderate opportunities.
- **High:** Highly interconnected; numerous direct relationships through movement, visibility, and overlap.
- **Question:** Does the morphology correspond to the catalog's {{rating}} Connectivity condition?
- **Measurements:** `pairOpportunityCount`, `linkedPairCount`, bridges, continuity (evidence only), bridge length, components
- **Axis 0:** no or few inter-concentration relationships
- **Axis 1:** many linked pairs and bridges
- **Correspondence:** `connectivityAmount` vs selected peak; **0 pairs → observed 0**, not High
- **Limits:** Not a door/room graph.

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
- **Measurements:** concentration count, `mass.sizeRegularity`, `mass.spacingRegularity`, component count
- **Axis 0:** one continuous body or unlike fragments; little repetition
- **Axis 1:** several similar, regularly spaced units
- **Correspondence:** `modularityAmount` vs selected peak (`< 2` concentrations → 0)
- **Limits:** Cannot evaluate interchangeability or actual reconfiguration.

### Spatial — Gathering-specific

#### Spatial Permanence

- **Low:** Gathering is isolated from circulation paths. It exists wholly on its own.
- **Medium:** Gathering and circulation are parallel but do not co-exist.
- **High:** Circulation is within the gathering space. Gathering happens because of circulation.
- **Question:** Does the morphology correspond to the catalog's {{rating}} Spatial Permanence condition?
- **Measurements:** footprint overlap, perimeter contact, hierarchy, concentration count, bridges
- **Axis 0:** distinguishable gathering apart from the connective network
- **Axis 1:** gathering mass constituted by / mixed with the network
- **Correspondence:** `circulationConstitution` vs selected peak
- **Limits:** Mixing in the trail field, not time or material durability.

### Atmospheric — shared

#### Immersive

- **Low:** Minimally immersive. Sensory conditions neutral, predictable, detached; user remains aware of the surrounding environment.
- **Medium:** Moderately immersive. Light, material, sound, scale, and enclosure begin to shape perception.
- **High:** Deeply immersive. Multiple sensory and spatial qualities envelop the user.
- **Question:** Does the **spatially measurable** morphology correspond to the catalog's {{rating}} Immersive condition?
- **Measurements:** enclosure, density variation, hierarchy, spatial spread, void continuity, largest void
- **Axis 0:** spatially detached field
- **Axis 1:** strong spatial field around void (enclosure, variation, hierarchy, spread)
- **Correspondence:** `spatialImmersion` vs selected peak
- **Limits:** **Does not fabricate** material, sound, light, or other sensory data. Spatial subset only.

#### Visibility

- **Low:** Visual access limited; frequent interruptions to sightlines.
- **Medium:** Moderate visual access; open sightlines mixed with obstruction.
- **High:** Extensive visual access; long sightlines; minimal obstruction.
- **Question:** Does the morphology correspond to the catalog's {{rating}} Visibility condition?
- **Measurements:** mean/max open span, void continuity, enclosure
- **Axis 0:** short interrupted void spans
- **Axis 1:** long continuous void spans
- **Correspondence:** `visibilityAmount` vs selected peak
- **Limits:** Axis-aligned open spans, **not** full angular isovists.

### Atmospheric — Lobby-specific

#### Receptivity

- **Low:** Limited invitation. Formal, guarded, or psychologically distant; discourages entry or occupation.
- **Medium:** Moderate invitation. Accessible and comfortable, with some formality or control.
- **High:** Strong invitation. Welcoming, comfortable, accessible; encourages entry, interaction, occupation.
- **Question:** Does the spatially measurable morphology correspond to the catalog's {{rating}} Receptivity condition?
- **Measurements:** `void.boundaryOpenFraction`, enclosure, occupation support, void fraction
- **Axis 0:** closed boundary, high enclosure, little occupation support
- **Axis 1:** open boundary, lower enclosure, occupation support
- **Correspondence:** `receptivitySpatial` vs selected peak
- **Limits:** **Psychological invitation is not observed.** Spatial approachability only.

### Atmospheric — Workspace-specific

#### Collaboration

- **Low:** Primarily configured for individual occupation; limited proximity or interaction.
- **Medium:** Individual and shared areas; moderate interaction.
- **High:** Strongly configured around shared areas, proximity, visual interaction, and spatial conditions that support collaboration.
- **Question:** Does the spatially measurable morphology correspond to the catalog's {{rating}} Collaboration condition?
- **Measurements:** `mass.clusteredness`, centroid separation, linked/pair counts, mean open span, occupation support
- **Axis 0:** separated territories, little shared occupation or visual continuity
- **Axis 1:** clustered territories, visual continuity, occupation support that could be shared
- **Correspondence:** `collaborationAmount` vs selected peak
- **Limits:** Not desks, teams, or actual interaction.

### Atmospheric — Gathering-specific

#### Social Proximity

- **Low:** Multiple paths or big spaces (catalog examples: foliage or tables) that separate experience; more private.
- **Medium:** Some private/open spaces in a series of identical spaces close together.
- **High:** Very compressed paths or open spaces; high people-load would be overstimulating.
- **Question:** Does the morphology correspond to the catalog's {{rating}} Social Proximity condition?
- **Measurements:** significant void area/count, centroid separation, spatial spread, concentration count
- **Axis 0:** generous or separated territories
- **Axis 1:** compressed territories / close zones
- **Correspondence:** `proximityAmount` vs selected peak
- **Limits:** **No furniture or foliage.** Spatial separation versus compression only.

---

## Coverage

The current catalog has 3 typologies × 5 archetypes × 9 criteria = **135** evaluation targets. Each target must have a registered spec, a catalog rating, a catalog description, valid measurement evidence, and a deterministic result. None may silently score 0 for lack of mapping.

## Prototype note

Void Field was the first fully worded prototype. The library above is the reusable criterion layer for every catalog criterion. Candidate search, the nine-candidate matrix, UI, frozen calibration, and Skill 3 are out of scope for this document’s implementation status.
