---
name: physarum-2d-generation
description: >-
  Generates multiple abstract 2D protoarchitectural sections from Skill 1
  Physarum rules, evaluates them against original architectural criteria, and
  selects one final 2D outcome per archetype. Use when working on Skill 2, 2D
  Physarum generation, iteration, architectural evaluation, final 2D selection,
  or the Skill 3 handoff of 15 selected sections. Do not use for Skill 1
  translation, vertical propagation, 3D geometry, interlocking, or aggregation.
---
# Skill 2: 2D Physarum Generation, Iteration, Architectural Evaluation, and Final Selection
This is the project-level skill for Skill 2 in the shared repository `livingmorphologies`.
Apply this skill when generating, iterating, evaluating, and selecting 2D Physarum sections from a Skill 1 translation. Do not apply it to architectural-to-Physarum translation, vertical 3D development, 3D form-making, interlocking, or module aggregation.
Current status: Skill 1 translation is complete and handed off. Skill 2 generation, evaluation, and selection are not implemented yet. Begin from a `Skill1Handoff`. Do not rewrite Skill 1 translation, edit `lib/catalog.ts`, or implement Skill 3 vertical propagation.
## Purpose
Receive the architectural-to-Physarum translation produced by Skill 1 and use it to generate multiple abstract 2D protoarchitectural sections.
Evaluate those iterations architecturally. Select one final 2D outcome for each of the 15 architectural archetypes.
Final target: 15 final selected 2D sections.
## Input
For each archetype, Skill 2 receives a `Skill1Handoff` (`toHandoff(translateArchetype(id))` in `lib/skill1/`):
- typology and archetype ids and name
- topology kind (`around-absence` | `contained-interior` | `open-network`)
- existing Formal, Spatial, and Atmospheric criteria ratings (locked catalog values)
- existing Formal, Spatial, and Atmospheric descriptors
- criterion traces and descriptor rankings
- Physarum behavioral rules (`behavior`)
- Physarum parameters (`params`)
- spatial recipe (`recipe`: source corner, attractor, isolation, clustering, enclosure)
- field size (20×20 plan, section height 10)
The official Skill 1 board is `LivingInstrument`. Do not unlock or rewrite catalog ratings. Do not invent missing Skill 1 output. If a field is absent from `Skill1Handoff`, stop and ask rather than reconstructing Skill 1.
## Generation
Conceptual workflow:
```
ARCHITECTURAL INPUT
+
PHYSARUM TRANSLATION
        ↓
2D PHYSARUM SIMULATION
        ↓
PHYSARUM NETWORK / FIELD
        ↓
ABSTRACT SECTIONAL INTERPRETATION
        ↓
2D PROTOARCHITECTURAL SECTION
```
The output should remain abstract. It does not need to immediately represent conventional architectural spaces, rooms, furniture, or program.
The goal is to generate sectional spatial conditions through Physarum behavior.
## Iterations
For each archetype, generate multiple controlled iterations.
Conceptually:
```
SAME ARCHITECTURAL CONDITION
        ↓
Iteration 01
Iteration 02
Iteration 03
Iteration 04
Iteration 05
...
```
Iterations may vary geometrically but must remain based on the same underlying architectural criteria, descriptors, and Physarum translation.
Variation may result from:
- random seed
- local growth
- branching
- trail evolution
- attractor interaction
- field variation
- convergence
- divergence
- density variation
The iterations must not become arbitrary unrelated geometry. Keep the Skill 1 rules and parameters fixed for a given archetype; vary only the controls that produce alternative realizations of the same translation.
## 2D Section Interpretation
The Physarum output may need to be interpreted as sectional geometry.
Possible relationships may eventually include:
- trail concentration
- density
- void
- mass
- opening
- connection
- branching
- spatial node
- boundary
Do not assume conventional architectural meanings automatically. The interpretation should remain protoarchitectural.
Do not turn the field into rooms, furniture, or labeled program in order to make it look like architecture.
## Architectural Evaluation
Generated iterations must be evaluated against the original architectural condition.
Evaluation should refer back to:
- typology
- archetype
- Formal criteria
- Spatial criteria
- Atmospheric criteria
- Low / Medium / High values
- Formal descriptor
- Spatial descriptor
- Atmospheric descriptor
The goal is not simply to select the most visually attractive result.
The goal is to select the iteration that most successfully expresses the architectural characteristics that produced it.
Keep evaluation explicit and traceable: state which original criteria the iteration satisfies, weakens, or fails. Do not introduce new architectural criteria in order to score the drawings.
## Final Selection
For each archetype:
```
MULTIPLE 2D ITERATIONS
        ↓
ARCHITECTURAL EVALUATION
        ↓
ONE FINAL SELECTED 2D SECTION
```
Repeat across all archetypes:
```
5 Lobby
+
5 Workspace
+
5 Gathering
=
15 FINAL SELECTED 2D SECTIONS
```
Select exactly one final 2D section per archetype. Do not merge iterations into a composite unless the user explicitly requests that, and even then stay inside this skill's 2D boundary.
## Handoff to Skill 3
Skill 2 ends after the 15 final 2D outcomes have already been generated, evaluated, and selected.
Whenever possible, Skill 2 should preserve the underlying generative information that produced the selected outcome.
The Skill 3 handoff may eventually contain:
- selected 2D section
- underlying Physarum state
- simulation parameters
- random seed
- trail information
- density information
- attractors
- boundaries
- dimensions
- architectural source information
Do not reduce the handoff to only a static image when richer generative state information is available.
Conceptual threshold:
```
PHYSARUM RULES
→ ITERATIONS
→ ARCHITECTURAL EVALUATION
→ 15 FINAL 2D SECTIONS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
HANDOFF TO SKILL 3
```
Until implementation is requested, this skill's only deliverable is this definition.
## This Skill Must Not
- redefine the architectural criteria
- rewrite descriptors
- perform Skill 1's translation work
- perform vertical 3D development
- create final 3D forms
- define interlocking systems
- perform module aggregation
- replace Physarum with unrelated procedural geometry
## Agent Rules
- Treat architectural analysis as existing input.
- Use the Physarum translation provided by Skill 1.
- Generate controlled variation rather than arbitrary random forms.
- Keep 2D outcomes abstract and protoarchitectural.
- Evaluate results against their original architectural inputs.
- Select one final outcome per archetype.
- Preserve enough generative information for Skill 3 whenever possible.
- Stay strictly inside Skill 2.
- Begin generation only from a Skill 1 handoff, or when the user is defining this skill without requiring that input yet.
- When implementation is requested, implement only 2D generation, iteration, architectural evaluation, final selection, and the Skill 3 handoff structure. Do not translate architecture, extrude into 3D, or leave this skill's boundary.
