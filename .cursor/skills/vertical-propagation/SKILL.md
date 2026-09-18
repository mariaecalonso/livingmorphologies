---
name: vertical-propagation
description: >-
  Continues selected 2D Physarum outcomes vertically through the Z dimension
  into modular 3D protoarchitectural forms. Use when working on Skill 3,
  continuous vertical propagation, successive Z states, 3D Physarum morphology,
  modular protoarchitectural modules, interlocking, aggregation, or converting
  a selected 2D Physarum state into a 3D form.
---

# Skill 3: Continuous Vertical Propagation and Modular 3D Development

This is the project-level skill for Skill 3 in the shared repository `livingmorphologies`.

Apply this skill when continuing a final, already selected 2D Physarum outcome into the Z dimension. Do not apply it to 2D generation, 2D evaluation, 2D selection, architectural criteria, or final multi-module aggregation.

Current status: definition only. Do not implement algorithm or simulation code, create source files, or install dependencies unless the user explicitly requests implementation.

## Purpose

This skill takes final, already selected and evaluated 2D Physarum outcomes and continues their generative behavior vertically through the Z dimension to produce modular 3D protoarchitectural forms.

## Input

The input will eventually consist of 15 final selected 2D Physarum outcomes, one for each architectural subtypology.

These outcomes are generated and evaluated by another part of the system.

Whenever possible, the Skill 3 input should include the underlying Physarum state and generation data responsible for the selected 2D outcome, not only a static image or section outline.

This skill begins only after those final 2D outcomes exist.

## Responsibility

Take one selected 2D Physarum state as the initial condition and propagate its behavior continuously through successive vertical states.

Conceptual workflow:

```
SELECTED 2D PHYSARUM STATE
→ INITIAL Z CONDITION
→ CONTINUOUS VERTICAL PROPAGATION
→ SUCCESSIVE Z STATES
→ 3D PHYSARUM MORPHOLOGY
→ MODULAR 3D PROTOARCHITECTURAL FORM
→ FUTURE INTERLOCKING / AGGREGATION
```

## Vertical Propagation Requirements

The system should eventually support:

- inheritance from the previous vertical state
- controlled growth
- branching
- convergence
- divergence
- continuity between successive Z states
- traceability to the original 2D Physarum condition

Vertical development must continue the generative Physarum behavior. Do not replace that behavior with extrusion, lofting, or unrelated 3D modeling.

## Modularity Requirements

The resulting 3D forms must function as independent protoarchitectural modules that can later connect, interlock, or aggregate with other generated modules.

The system should eventually support:

- identifiable module boundaries
- compatible connection zones
- compatible or repeatable connection logic
- continuity between modules when connected
- future aggregation into larger spatial systems

Modularity should influence the development of the 3D morphology rather than simply being applied afterward as a separate post-processing operation.

The modular constraints must not replace the underlying Physarum growth behavior.

## This Skill Must Not

- generate the original 2D sections
- evaluate or select 2D iterations
- redefine architectural criteria or descriptors
- simply extrude the 2D geometry
- loft unrelated sections
- generate arbitrary 3D geometry unrelated to Physarum
- perform final multi-module aggregation yet

## Agent Rules

- Treat the selected 2D Physarum state as given. Do not regenerate, re-score, or re-select it.
- Use underlying Physarum state data as the basis for vertical propagation rather than extruding the visible section geometry.
- Begin only when a final 2D outcome exists, or when the user is defining this skill without requiring that input yet.
- Propagate one selected 2D state at a time into successive Z states.
- Preserve continuity and inheritance between successive vertical states.
- Keep each resulting 3D form an independent module, with modular constraints active during growth.
- Leave interlocking and aggregation as a future stage. Do not assemble multiple modules into a larger spatial system yet.
- When implementation is requested, implement only vertical propagation and modular 3D development. Stay inside this skill's boundary.
