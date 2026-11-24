---
name: site-integration
description: >-
  Places selected modules and hybrid assemblies on the Herald Plaza site and
  reads the site through analysis, strategy, zoning, and placement. Use when
  working on Skill 5, Site Integration, /lab/site, site analysis, the site
  model, configurations, sun, wind, views, noise, walking, urban context, or
  zoning. Do not use for Skill 1 translation, Skill 2 generation, Skill 3
  vertical propagation, or Skill 4 connector generation.
---

# Skill 5: Site Integration

This is the project-level skill for Skill 5 in the shared repository `livingmorphologies`.
Apply it when placing work on the site or reading the site. Do not apply it to architectural translation, 2D generation, vertical propagation, or generating a new connector.

The lab is `/lab/site`. Site Analysis is `/lab/site/analysis`. Saved configurations are `/lab/site/configurations`. The work lives in `lib/skill5/` and `components/site/`.

## Purpose

Bring the selected modules and Skill 4 assemblies onto the Herald Plaza site. The site workflow, in order, is Site Analysis, Site Strategy, Zoning, Tile Placement, and Assembly. Site Analysis has its own workspace. The later steps stay on the site model.

## The site

The studio brief and the modeled parcel are different records. Use the brief for the program reading and the parcel model for the drawn geometry. Do not treat one as the other.

The plan reads north up. East is toward Biscayne Bay. Axes are X east, Y up, Z north, in feet.

## Boundaries

Place modules and assemblies that already exist. Do not create a new archetype, a new Skill 3 continuation, or a new Skill 4 connector from this skill.

A connection drawn here is either direct or hybrid. Its passage is not a Skill 4 connector mesh. When a proposal needs a new connector, send that record to Skill 4. Keeping it in Skill 5 leaves the Skill 4 source unchanged.

A configuration is saved only when `data/skill5/configurations.json` contains it. Do not mark a configuration final, validated, or selected unless that file says so. Do not invent a missing configuration.

Lab input and output names live in `lib/lab-contracts.ts`. Do not invent a second source of truth for those contracts.
