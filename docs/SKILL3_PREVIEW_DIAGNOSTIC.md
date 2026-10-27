# Skill 3 preview diagnostic

Commit `dc0f6f68369fae95e62064cb52c3ab8674a5b613` on `preview/vercel-packaging-repair`. Preview deployment `https://livingmorphologies-5a0o71ucs-malonso.vercel.app`.

This is a diagnosis of the remaining Process and Catalog failures. It does not change the packaging repair. Skill 3 Final, Skill 4 Hybrid Connection, and Skill 5 Site Integration read the selected solidified meshes, and those files are already in the function traces.

Authenticated requests to the preview returned HTTP 302, “Protected by Vercel Authentication.” The live response bodies were not read. The findings below are confirmed from the commit’s routes, the tracing rules, and the files on disk. Where a preview request could not be observed, that is stated.

## What still works

Sample reads `GET /api/vertical/process-replay`. That route is served by `lib/server-routes/vertical.ts` and is covered by the `/api/vertical/[[...path]]` include. The Vertical Void record `data/skill3/process-replay/vertical-void-351-N24.json` is in that include. Thirteen other selected continuations that already have replay files are traced with it because the reader addresses the directory. Inserted Horizontal Plate N47 has no replay file on disk.

Final, the Skill 4 handoff, and the Skill 5 module library read `GET /api/vertical/solidified` for one selected continuation. Those 15 meshes and their metric records are included. The Process page’s Solidify frame uses that same route, so it can show the final module even while Form, Cap, and Choose are empty.

## Pipeline

The Process page is `components/vertical-process-canvas.tsx`. The frames do not wait on one another. Cap and Choose render below Form. An empty Form does not block them in code. They look stuck because their own requests return nothing.

| Frame | Request | File the route reads | On the preview function |
| --- | --- | --- | --- |
| Sample | `GET /api/vertical/process-replay` | `data/skill3/process-replay/<archetype>-<candidate>-<continuation>.json` | Included for the stored records |
| Develop, Vertical Void N24 | `GET /api/vertical/process-generation` and `GET /api/vertical/process-generation/field` | `data/experiments/process-generation/vertical-void-351/N24/` | Excluded |
| Develop, body | `GET /api/vertical/process-form` | `data/experiments/process-form/<archetype>-<candidate>/<continuation>/` | Excluded. Only Vertical Void N24 exists |
| Form | `GET /api/vertical/experiments/criteria-hybrid?reading=open` | `data/experiments/criteria-hybrid/<archetype>-<candidate>/<continuation>.json` | Excluded |
| Cap | same route, `reading=open` and `reading=capped` | `criteria-hybrid` and `criteria-hybrid-capped` | Excluded |
| Cap, Inserted Horizontal Plate | `reading=adapted` | `criteria-hybrid-ihp-adapted` | Excluded |
| Choose preview | the official `reading=open` mesh | same open file | Excluded |
| Choose marks | `GET /api/vertical/solidified` without a continuation | metric files under `carved-mass-solidified/metrics` | Only the 15 selected metrics are included |

`next.config.ts` applies excludes after includes. A file matched by `outputFileTracingExcludes["*"]` is removed even if an include lists it. These globs are the removal:

- `data/experiments/process-generation/**`
- `data/experiments/process-form/**`
- `data/experiments/criteria-hybrid/**`
- `data/experiments/criteria-hybrid-capped/**`
- `data/experiments/criteria-hybrid-ihp-adapted/**`

The generation, form, and hybrid routes are also outside the include keys. Includes are only `/lab/vertical`, `/api/vertical/[[...path]]`, `/api/vertical/z0`, and `/api/skill4/handoff`.

## First failure in each frame

### Develop

Sample succeeds, so `retainedPlates` can be built from the replay. Develop then splits.

For Vertical Void 351 N24, `liveGeneration` is true only when `GET /api/vertical/process-generation` returns contract `process-generation-replay-v1` (`components/vertical-process-canvas.tsx`, the effect around the generation fetch, and `liveGeneration` just below it). The route reads one static manifest:

`data/experiments/process-generation/vertical-void-351/N24/manifest.json`

(`app/api/vertical/process-generation/route.ts`). The field view then requests `p02` through `p06` for stages `xyt`, `macro`, and `processed` (`app/api/vertical/process-generation/field/route.ts`). Those paths are excluded, so the manifest check fails, `generationReady` stays false, and the page uses `ProcessDevelop` instead of `ProcessGeneration`.

`ProcessDevelop` still draws the retained plates from the sampling record. The growing body comes from `developMeshes`, which is `GET /api/vertical/process-form`. That directory exists only for Vertical Void N24: `manifest.json` plus `p02.json` through `p05.json`, 3.14MB. The route returns 404 when the manifest is absent (`app/api/vertical/process-form/route.ts`). `ProcessDevelop` then shows “Development record unavailable.” (`components/process-develop-view.tsx`).

That is the partial Develop frame: the plates from Sample are visible, and the stored field and the stored body are not.

On localhost both directories exist, so N24 takes the generation view and can draw the field and the surface. The other 14 archetypes have no `process-form` directory and no generation record on disk either. Their Develop frame is plates only, locally and on the preview. That is missing source data, not a preview exclusion.

No server write is involved. Both routes are read-only.

### Form

Form renders `exploreOpen` from `reading=open`. `readMesh` turns any non-OK response into `null` (`components/vertical-process-canvas.tsx`). The hybrid route returns 404 when the JSON is not on the function filesystem (`app/api/vertical/experiments/criteria-hybrid/route.ts`). The frame then says “Not stored.”

The official open file exists locally for all 15 selected continuations. The largest is Void Field N19 at 0.75MB. The whole `criteria-hybrid` tree is 384 files and 155MB, and it must stay out.

### Cap

Cap asks for the official continuation, not the continuation being explored. It needs `reading=open` and `reading=capped`. Inserted Horizontal Plate also needs `reading=adapted`. All three trees are excluded. Both views fall through to the text placeholders “Open” and “Capped.”

The official capped file exists locally for all 15. Together they are 9.8MB. The adapted N47 file is 0.49MB. The full capped tree is 384 files and 209MB.

### Choose

Choose has two reads.

The preview figure is the same official open mesh as Cap. It stays empty for the same 404.

The marks come from `listSolidifiedCatalogue` (`lib/skill3/solidified-catalogue.ts`). It lists every metric file for that archetype and candidate. Locally each selected candidate has 24 metric files, and Inserted Horizontal Plate has 25. The preview function keeps one metric per candidate, the selected continuation, because `excludedSolidified()` drops the rest. The board therefore shows one mark. The catalogue link still works.

This sparse board is a consequence of the packaging repair. Putting all 361 metric files, and the meshes behind them, back into the function would undo that size limit. It is not required to show the selected module.

Readiness (`GET /api/vertical/catalogue-readiness`) reads the criteria-hybrid audit trees, which stay excluded. The client already substitutes an open-only readiness body when that request fails. The missing audit does not remove the meshes.

## Catalog geometry

The catalogue page opens because `firstVerifiedSavedPick()` can verify Vertical Void 351 from the included Z0 pair and `catalog.json`. Selecting an archetype does not consult that verification again.

`components/vertical-catalogue.tsx` shows `PLACEHOLDER_MODULES` while `set` is missing or belongs to another archetype. Those are the mock solids from `placeholderSolid` in `components/vertical-catalogue-scene.tsx`. Changing archetype makes `matches` false immediately, so the mock grid appears while `GET /api/vertical/solidified?archetype&candidate` is in flight.

All 15 saved candidates in `data/skill2/pareto-catalog/selections.json` match the final-selection candidates. Each has its selected metric in the function, so the index request succeeds. `modules` then replaces the placeholders. Every real slot sets:

`meshUrl: /api/vertical/experiments/criteria-hybrid?...&reading=<reading>`

The scene fetches that URL and calls `decodeSolidifiedMesh` only when the response is OK (`vertical-catalogue-scene.tsx`, `stepStored`). The hybrid file is excluded, the fetch fails, and `drawMesh` returns without drawing. The mock grid is gone because those modules are no longer placeholders, and the selected geometry never arrives.

This is the same excluded hybrid reading as Form and Choose. It is not a Three.js remount, a timeout, or a response-size failure. The official open files are all under 1MB. One solidified mesh response, which Final already returns, is larger than these readings.

The three candidates whose published `catalog.json` does not list the selected id — Continuous Hall 237, Linear Gallery 263, and Stepped Amphitheater 374 — do not take a different catalogue mesh path. Their open and capped readings exist locally and are excluded by the same globs. The catalog-verification gap does not explain the disappearing geometry.

`withStoredReadings` would add more slots only when the hybrid directory listing returns continuation ids. On the preview that listing is empty, so the field stays at the one solidified continuation.

## Localhost and the preview

| Data | Localhost | Preview function |
| --- | --- | --- |
| Sampling replay for stored continuations | Read from disk | Included. Sample works |
| Generation fields for Vertical Void N24 | 16 files, 21.4MB | Excluded. Develop does not enter the field view |
| Process-form frames for Vertical Void N24 | 3.14MB | Excluded. The body mesh is missing |
| Process-form for the other 14 | Not on disk | Same absence |
| Official open, capped, and the one adapted reading | 17.6MB | Excluded. Form, Cap, Choose preview, and the catalogue field are empty |
| Full hybrid trees | 155MB and 209MB | Correctly excluded |
| Selected solidified mesh | Present | Included. Final, Skill 4, Skill 5, and Solidify can draw it |
| Other solidified metrics | 24 or 25 per candidate | Excluded. Choose and the catalogue list only the selected continuation |
| Browser storage | Chosen morphology only | Does not supply meshes |

The routes do not write these readings. The lobby-cache guard in `vertical.ts` is unrelated.

## One cause or two

Form, Cap’s meshes, Choose’s preview, and the catalogue field are one failure: the official criteria-hybrid readings are removed by the exclude globs.

Develop is a second failure with the same mechanism and different files. Vertical Void N24 also loses `process-generation` and `process-form`. The other archetypes have no generation or form record to restore.

The unpublished catalog records are a third, already known data gap. They do not cause these two failures.

## Minimal correction

Do not include `criteria-hybrid/**`, `criteria-hybrid-capped/**`, or `process-generation/**` as directories. Next applies excludes after includes, so a blanket exclude would delete a new include.

Trace only these files, on the routes that read them:

- `app/api/vertical/process-generation/route.ts` and `app/api/vertical/process-generation/field/route.ts`: the 16 files in `data/experiments/process-generation/vertical-void-351/N24/` (21.4MB).
- `app/api/vertical/process-form/route.ts`: the 5 files in `data/experiments/process-form/vertical-void-351/N24/` (3.14MB).
- `app/api/vertical/experiments/criteria-hybrid/route.ts`: the 15 official `reading=open` files (7.3MB), the 15 official `reading=capped` files (9.8MB), and `criteria-hybrid-ihp-adapted/inserted-horizontal-plate-265/N47.json` (0.49MB).

Keep the excludes for every other file in those trees, including audits, shrinkwrapped, and thickened readings. Leave the selected solidified set as it is. Do not point the catalogue at the solidified mesh. That is a different geometry from the open reading the catalogue asks for.

The separate generation and form functions are about 1.7MB today. Adding their own files does not enlarge the 156MB vertical function. The hybrid route would carry about 18MB of official readings. That remains far under the 250MB function limit. The combined process-form response is about 3.1MB, and each official hybrid file is under 1MB, so the 4.5MB response limit is not the current obstacle.

Restoring the 24-mark Choose board is a separate decision. It needs the unselected metric files, and showing those modules would also need their hybrid readings. That is the archive this repair kept out.

## Regression checks

After a future packaging change, on an authenticated preview:

- `GET /api/vertical/process-replay?archetype=vertical-void&candidate=351&continuation=N24` returns `process-replay-v1`.
- `GET /api/vertical/process-generation` for that same continuation returns `process-generation-replay-v1`.
- `GET /api/vertical/process-generation/field` for retained `2` and stage `xyt` returns 373248 bytes.
- `GET /api/vertical/process-form` for Vertical Void N24 returns four frames. The same request for Compressed Sequential N03 stays 404, because that record is not on disk.
- `reading=open` and `reading=capped` return geometry for all 15 official continuations. `reading=adapted` returns geometry for Inserted Horizontal Plate N47.
- An unselected reading, such as Vertical Void N01, stays 404.
- The catalogue shows the placeholder grid only while the solidified index is loading. After it loads, the official continuation’s hybrid mesh stays visible.
- `GET /api/vertical/solidified` for each selected continuation still returns `isomesh-base64`, and Skill 4 and Skill 5 still resolve the same 15 module ids.
- The vertical function trace stays near 156MB. The new bytes stay on the generation, form, and hybrid routes.
