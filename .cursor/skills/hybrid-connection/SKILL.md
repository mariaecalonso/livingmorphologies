---
name: hybrid-connection
description: >-
  Joins selected Skill 3 modules into hybrid assemblies through chosen faces
  and connector geometry. Use when working on Skill 4, Hybrid Connection,
  /lab/hybrid, the hybrid process, catalog, final catalog, connector meshes,
  or an assembly sent back from Site Integration. Do not use for Skill 1
  translation, Skill 2 generation, Skill 3 vertical propagation, or Skill 5
  site placement.
---

# Skill 4: Hybrid Connection

This is the project-level skill for Skill 4 in the shared repository `livingmorphologies`.
Apply it when joining already selected Skill 3 modules into an assembly. Do not apply it to architectural translation, 2D generation, vertical propagation, or placing modules on the site.

The lab is `/lab/hybrid`. Its tabs are Process, Catalog, and Final Catalog. The work lives in `lib/skill4/` and `components/hybrid/`.

## Purpose

Take Skill 3 modules and connect them. A connection chooses two faces. The hybrid grows between those faces. An assembly is the saved arrangement of those modules and their connections.

## Boundaries

Use the modules Skill 3 already selected. Do not reselect them, and do not change their geometry to make a connection succeed.

The catalog stores the assembly record. A connector mesh is present only when that record stores one. If it does not, the connection remains a relationship. Do not invent a mesh, and do not mark an assembly selected unless the catalog record says so.

A proposal returned from Site Integration appears as a rerun record. Connector generation does not start by itself. Saving that record does not rewrite the earlier Skill 4 assembly.

Stress-test catalogs stay off the published catalog. Do not commit them.

## Handoff

Skill 5 places these assemblies on the site. Skill 4 does not move them onto the parcel, assign program, or decide a site configuration.
