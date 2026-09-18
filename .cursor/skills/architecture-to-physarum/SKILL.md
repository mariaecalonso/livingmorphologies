---
name: architecture-to-physarum
description: >-
  Translates existing architectural criteria, Low / Medium / High ratings, and
  descriptors into explicit Physarum behaviors and simulation parameters. Use
  when working on Skill 1, architectural-to-Physarum translation, typology and
  archetype mapping, Formal / Spatial / Atmospheric criteria, or producing the
  Physarum rules handoff for Skill 2. Do not use for 2D generation, 2D
  evaluation, 2D selection, vertical propagation, or 3D geometry.
---

# Skill 1: Architectural-to-Physarum Translation

This is the project-level skill for Skill 1 in the shared repository `livingmorphologies`.

Apply this skill when translating existing architectural analysis into Physarum behavioral logic and parameters. Do not apply it to 2D section generation, 2D evaluation, 2D selection, vertical propagation, 3D geometry, modularization, or interlocking.

Current status: definition only. Do not implement algorithm or simulation code, create source files, generate 2D sections or 3D geometry, or install dependencies unless the user explicitly requests implementation.

## Purpose

Translate existing architectural criteria and descriptors into explicit Physarum behaviors and simulation parameters.

Preserve the architectural meaning of the original criteria and descriptors. Do not invent, rewrite, replace, or reinterpret those descriptors as new descriptors.

## Project Context

The project works with three architectural typologies:

- Lobby
- Workspace
- Gathering

Each typology contains five architectural subtypologies/archetypes, for a total of 15.

Each archetype has already been analyzed through three architectural categories:

- Formal
- Spatial
- Atmospheric

The architectural criteria, Low / Medium / High evaluations, and descriptors already exist from precedent analysis. They are predefined human-authored inputs.

This skill must not invent, rewrite, replace, or reinterpret those descriptors as new descriptors.

## Input

Skill 1 consumes existing architectural analysis for one archetype at a time. The input is given; it is not produced by this skill.

Each archetype contains:

### Formal

- shared Formal criteria
- typology-specific Formal criterion
- Low / Medium / High ratings
- Formal descriptor

### Spatial

- shared Spatial criteria
- typology-specific Spatial criterion
- Low / Medium / High ratings
- Spatial descriptor

### Atmospheric

- shared Atmospheric criteria
- typology-specific Atmospheric criterion
- Low / Medium / High ratings
- Atmospheric descriptor

The three analytical categories describe different aspects of the same architectural archetype. All three must contribute to the Physarum translation.

Do not invent missing criteria, ratings, or descriptors. If an input is absent, stop and ask for it rather than filling the gap.

## Responsibility

Determine how architectural conditions influence Physarum behavior.

Conceptual workflow:

```
TYPOLOGY
→ ARCHETYPE
→ EXISTING CRITERIA + RATINGS + DESCRIPTORS
→ PHYSARUM BEHAVIORAL LOGIC
→ PHYSARUM PARAMETERS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
HANDOFF TO SKILL 2
```

Every mapping must have an architectural reason.

Conceptually:

```
ARCHITECTURAL CONDITION
→ BEHAVIORAL EFFECT
→ PHYSARUM PARAMETER CHANGE
```

Examples (conceptual only — do not hard-code unless they are tested and intentionally accepted):

- architectural openness → greater spatial dispersion → modification of accessible field / obstacles / agent spread
- architectural centrality → stronger concentration around a spatial node → attractor location / strength

## Possible Physarum Variables

Mappings may eventually involve variables such as:

- attractor location
- attractor quantity
- attractor strength
- accessible growth area
- boundaries
- obstacles
- directional bias
- agent density
- sensor distance
- sensor angle
- turning angle
- trail deposition
- trail decay
- dispersion
- network density
- connectivity
- branching
- convergence
- divergence

This list is a vocabulary, not a required parameter set. Use only the variables needed to express a justified architectural-to-behavioral mapping. Do not assign values to unused variables for completeness.

## Translation Principles

The translation system must be:

- explicit
- traceable
- understandable
- reproducible
- adjustable

Avoid opaque mappings where architectural descriptors are converted into arbitrary numerical values without explanation.

The purpose is to preserve the architectural meaning of the original criteria and descriptors while translating them into computational behavior.

For each mapping, record:

1. the source architectural category (Formal, Spatial, or Atmospheric)
2. the existing criterion, rating, and descriptor used (quoted or referenced, not rewritten)
3. the intended Physarum behavioral effect
4. the parameter or rule that expresses that effect
5. the architectural reason for the mapping

Low / Medium / High ratings must remain the original evaluations. They may scale or select among behavioral intensities, but they must not be recoded into new architectural judgments.

Shared criteria and typology-specific criteria both participate in the translation. Do not drop typology-specific criteria, and do not treat one analytical category as a proxy for the others.

## Output

Skill 1 ends when it produces a structured set of Physarum rules and parameters that Skill 2 can use to generate 2D sectional outcomes.

Conceptual handoff:

```
ARCHITECTURAL INPUT
→ PHYSARUM RULES / PARAMETERS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
HANDOFF TO SKILL 2
```

The handoff should be sufficient for Skill 2 to run a simulation without reinterpreting architecture. Skill 2 should receive rules and parameters, not a redescribed architectural analysis.

Until implementation is requested, this skill's only deliverable is this definition.

## This Skill Must Not

- invent new architectural criteria
- invent new architectural descriptors
- modify existing Low / Medium / High evaluations
- generate final 2D sections
- evaluate generated 2D iterations
- select final 2D outcomes
- perform vertical propagation
- generate 3D geometry
- perform modularization or interlocking
- bypass Physarum with unrelated procedural geometry

## Agent Rules

- Treat all criteria, ratings, and descriptors as existing architectural input.
- Do not rewrite architectural analysis.
- Focus only on translating architecture into Physarum behavior.
- Keep mappings explicit and explainable.
- Preserve compatibility with Skill 2.
- Stay strictly inside Skill 1.
- Begin translation only from given architectural input, or when the user is defining this skill without requiring that input yet.
- When implementation is requested, implement only the architectural-to-Physarum translation and its Skill 2 handoff structure. Do not generate sections, score iterations, or leave this skill's boundary.
