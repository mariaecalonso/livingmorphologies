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

The lab is `/lab/site`. Site Analysis is `/lab/site/analysis`. Cluster Assembly Catalog is `/lab/site?sheet=cluster-assembly`. The Assembly tab is tile joins, not the Cluster Assembly checkpoint. Historical Configurations remain `/lab/site?sheet=configurations` and `data/skill5/configurations.json`. The work lives in `lib/skill5/` and `components/site/`.

Program Cluster 2.0 is off the live pipeline (`PROGRAM_CLUSTER_2_ARCHIVED` in `lib/site-map.ts`): Tile Compatibility, Cluster Placement (program catalog), Morphology Review, and differentiation / finished program-cluster catalogs stay in the project. Their live routes still redirect to Cluster Assembly Catalog. They reopen only from the Archived stage after the Physarum video (`/lab/archived`). That pocket is Program Cluster 2.0 only. Hybrid Connection at `/lab/hybrid` is not archived. A later cluster generation logic will replace the archived catalog before site placement resumes.

Cluster Placement code remains the composition tool for when a new finished-cluster catalog is live: the designer selects a zoning region, chooses a compatible Hybrid cluster, and places another instance into that zone. A zone may hold several instances, including repeats of the same catalog cluster. Each instance keeps its own id and transform. Ranking is unchanged. Automatic initial placement is optional assistance; it writes the same occupancy records using the existing packing seats, then stops. Shrinkwrap, film wrap, and joined mass remain in `buildPublicLobbyAssembly` and are not occupancy or catalog state.

A Cluster Assembly is the situated composition: selected Site Strategy network, designer zoning, zone occupancy, transforms, source identities, and optional confirmed joins. It is stored in `data/skill5/cluster-assemblies.json`. Many assemblies may exist. Exactly one may be the Selected Assembly for Development (`selectedAssemblyId`). Preview does not change that id. Send for Development does. Historical Configurations C01–C08 and later C## records must not write `selectedAssemblyId`, the selected network, or designer zoning.

The Development checkpoint is `GET /api/site/development-checkpoint`. Architectural Interpretation resolves its production source from that checkpoint. Do not generate enclosure, floors, envelope, circulation, shrinkwrap, or architectural articulation from it. The historical Skill 6 Interpretation mesh is not derived from the selected Cluster Assembly.

Lab input and output names for Cluster Placement, Cluster Assembly Catalog, Architectural Interpretation, Enclosure, Slicing, Drawing, and Rendering live in `lib/lab-contracts.ts`. Do not invent a second source of truth for those contracts.

## Purpose

Bring selected finished clusters onto the Herald Plaza site. The live Cluster Integration entry is Cluster Assembly Catalog while Program Cluster 2.0 is archived. The full production path returns to Site Analysis, Site Strategy, Zoning, Cluster Placement, Cluster Assembly Catalog, Send for Development, then Architectural Interpretation once a new cluster catalog is active. Site Analysis has its own workspace. The later steps stay on the site model.

## The site

The studio brief and the modeled parcel are different records. Use the brief for the program reading and the parcel model for the drawn geometry. Do not treat one as the other.

The plan reads north up. East is toward Biscayne Bay. Axes are X east, Y up, Z north, in feet.

## Boundaries

Place modules and assemblies that already exist. Do not create a new archetype, a new Skill 3 continuation, or a new Skill 4 connector from this skill.

A connection drawn here is either direct or hybrid. Its passage is not a Skill 4 connector mesh. When a proposal needs a new connector, send that record to Skill 4. Keeping it in Skill 5 leaves the Skill 4 source unchanged.

A configuration is saved only when `data/skill5/configurations.json` contains it. Do not mark a configuration final, validated, or selected unless that file says so. Do not invent a missing configuration.
