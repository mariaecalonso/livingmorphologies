# Living Morphologies — Chapters 01–03 Methodological and Visual Audit

Audit date: 21 November 2026.  
Scope: the Workflow presentation for Chapters 01, 02, and 03 as implemented in the repository. No presentation, Lab, data, or algorithm was changed for this audit.

This report distinguishes four kinds of statement:

- **Verified implementation** — behavior or numbers present in code or stored records.
- **Architectural interpretation** — a design reading that the presentation labels, or should label, as a reading.
- **Presentation simplification** — a schematic stand-in for a more specific process.
- **Missing evidence** — a claim or a diagram that the available sources do not support.

---

## A. Executive Assessment

The three chapters already have a readable spine. Chapter 01 names the precedent, the three typologies, the criteria families, and the choice of stigmergy. Chapter 02 then shows a real Vertical Void translation, a recorded Physarum run, saved Skill 1 plates, a four-generation search, a catalog replay, and the fifteen candidates that Skill 3 actually continues. Chapter 03 replays one real vertical process, opens a continuation catalog, and shows the fifteen solidified modules, including a human-scale reading of the mesh.

The weaknesses are not missing pages. They are places where a true mechanism is replaced by a slogan, a schematic, or a single example that is allowed to stand for all fifteen archetypes.

The highest-value refinements are:

1. Separate **criteria ratings → biological parameters** from **archetype configuration → spatial recipe**. The presentation still inherits the slogan “Criteria → Growth Instinct / Descriptors → Spatial Recipe.” The translator maps ratings onto parameters. Descriptors are names. The spatial recipe is authored per archetype.
2. Replace the Multiobjective Optimization introduction’s invented generation mix with the implemented schedule: 80 candidates a generation, generation 1 all explorers, then 24/56, 40/40, and 56/24 mutants and explorers. State that crowding is recorded and is not what chooses parents or the archive.
3. Say, on the vertical process page, that the replay is **Vertical Void, candidate 351, continuation N24**. The generator does build N01–N24, but the stored selections use different continuation ids (N03, N15, N19, and others).
4. On the catalog-selection and selected-candidate pages, show scores and images, and say plainly that a written reason for choosing that candidate is not in the handoff.
5. Keep the human-scale reading, and label every line as a geometric suggestion. The code already says the line is not a use. The expanded view can still be read as a floor plan.
6. Add one agent diagram — sensor angle, sensor distance, turn, deposit, decay — because the parameter map never draws that loop, and the engine does.
7. Give Chapter 01’s criteria block a full-height frame. It currently sits in the shorter row under the archetype plates, so nine ratings and three descriptors compete with the plates.
8. Decide whether clustering belongs inside Chapter 03. The process page ends with “ready for the next skill,” and the next three pages are Skill 6 clustering experiments. That jump is not explained.

---

## B. Current Presentation Inventory

Chapter 01 has no separate page list. Playback opens one focused board. The five sequence labels are five regions of that board. A video sits between Chapters 01 and 02 and is not a process-overview cluster. Chapters 02 and 03 are page sequences. Holds are the playback durations in `lib/demo-workflow/chapters.ts`.

| Chapter | Page or region | Purpose | Graphical content | Animation or interaction | Lab or research source |
| --- | --- | --- | --- | --- | --- |
| 01 | Cover | Names the chapter | Title only | Cover light | `DEMO_CHAPTERS` research |
| 01 | Precedents | One precedent and a three-word reading | Photos, axon, trace graph, mesh | Still | `PRECEDENT` in `lib/demo-workflow/chapter-facts.ts`, stills from the typology board |
| 01 | Typology Analysis | Show 3 × 5 archetypes | Named plates | Still | `TYPOLOGIES` in `lib/catalog.ts`, `archetypePlate()` |
| 01 | Criteria + Descriptors | Show Low / Medium / High becoming descriptors | Nine meters for Vertical Void, cursor drag | Loops while the chapter is focused | `groupsForArchetype`, `ratingLabel` |
| 01 | Generative System Research | Compare three systems and carry stigmergy forward | Three plates and trait lists | Still, stigmergy marked selected | `GENERATIVE_SYSTEMS` |
| 01 | Physarum Selection | Name the interests kept from stigmergy | Organism plate, six chips, one question | Still | `PHYSARUM`, `FILTERED_INTERESTS` |
| — | Video | Bridge between 01 and 02 | Lab video scaled into the sheet | Playback, 40000 ms | `PhysarumVideoPage` |
| 02 | Parameter Map | Show how Vertical Void ratings write parameters | Canvas, 1760 × 496 design, nine parameter simulations | 8 s cycle; recorded growth GIF when frames decode | `translateArchetype("vertical-void")`, `lib/skill1/maps.ts` |
| 02 | Lab Simulation | Replay a saved Lab run | Criteria configuration, recorded field, analysis tabs | Cursor aims, presses, drags, then plays frames and tabs | `components/demo-workflow/lab-run.tsx`, `LAB_RUN_FILE` |
| 02 | First Population | Show saved Skill 1 plates before optimization | Plate sheet, 20 columns, one archetype at a time | Advances every 3.4 s; click holds an archetype | `/demo/skill1/{id}/entries.json` |
| 02 | Multiobjective Optimization | Introduce the search | Six steps, four reasons, a 2D front, generation bars | ~70 s explain clock | Drawn in `moo-intro.tsx`; not read from a run file |
| 02 | Optimization | Play four generations and a Pareto view | Candidate plates and a projected front | Beats through evaluate, rank, select; front is triangulated from loaded points | `/demo/skill2` catalog consumed by `optimization-stage.tsx` |
| 02 | Catalog Selection | Replay reading one archetype’s optimization catalog | Vertical Void candidates, scores, diversity tags | Cursor moves, click focuses, does not write a selection | `/demo/skill2/catalog.json` |
| 02 | Selected Candidates | Show the fifteen plates Skill 3 continues | Three typology rows, candidate id under each plate | Still | `data/skill3/final-selection.json` via `propagated-candidates.ts` |
| 02 | Archetype Reading | Read each selected plate | Contours, arrows, and captions drawn on the plate | Per-archetype figure | `archetype-reading.tsx`; notes mark some arrows as readings, not sections |
| 03 | Process | Replay vertical propagation for one module | Ten lab steps: Start through Hand off | Cursor and playback on the Vertical Void N24 record | `vertical-demonstration.tsx`, `data/skill3/process-replay/vertical-void-351-N24.json` |
| 03 | Catalog | Inspect continuation alternatives | Vertical catalogue UI | Lab-style catalogue interaction | Skill 3 catalogue |
| 03 | Final View | Show the fifteen solidified modules | Rotating wire meshes; click opens a typology of five | Orbit; expanded panel | `final-selection.json`, `FinalMorphologyCatalogue` |
| 03 | Final View, expanded | Human scale inside the typology spread | Mesh, 6 ft figures, one line | Orbit | `readHumanScale` in `human-scale-reading.ts`; cube is 20 ft (`HALF = 10`) |
| 03 | Clustering development | Show stored cluster builds | Placed, patched, union, smoothed | View switching | Skill 6 `clustering-overnight-v1` |
| 03 | Graph and WFC | Compare graph and wave-function-collapse cluster searches | Two engines on stored clusters | View switching | `lib/skill6` contract |
| 03 | Cluster catalog | Browse stored clusters by size and morphology | Compact and branching, sizes 2–7 | Catalog browsing | Same collection |

Chapter 01 playback uses the shared focused duration (`chapterFocusedMs`, 18000 ms) because that chapter has no `pages` array. The five regions are visible together, not in sequence.

---

## C. Chapter-by-Chapter Methodological Audit

### Chapter 01 — Research + System Definition

The board is `RESEARCH_CONTENT` in `components/demo-workflow/research-chapter.tsx`.

#### Precedents

**Communicates.** One building, Axel Springer, with the reading Overlap — Interconnected — Mixed, plus photos, an axon, a trace drawing, and a mesh.

**Does not communicate.** How that building produced Lobby, Workspace, and Gathering. How fifteen archetypes were split. The typology definitions that do exist in `lib/catalog.ts` (Lobby as a threshold that receives and distributes, and the matching Workspace and Gathering definitions) are not rendered here. The plates are unnamed in the overview visual and named only in the focused column.

**Accuracy.** The stills are a presentation of existing typology-board material (`chapter-facts.ts` cites `components/home-precedent.tsx`). They are not evidence that the fifteen names were derived by a documented comparison. **Missing evidence** for the derivation. **Architectural interpretation** for the three-word reading, which is fair if it stays a reading.

#### Typology Analysis

**Communicates.** Three rows of five plates.

**Does not communicate.** The formal, spatial, or atmospheric difference between Vertical Void and Compressed Sequential, or between any other pair. No shared trait, no contrast, no link to the next criteria block other than proximity.

The definitions and the nine ratings per archetype are in `lib/catalog.ts`. Using them would be verified. Inventing a new comparison diagram from the photos would be interpretation and should be labeled as such.

#### Criteria + Descriptors

**Communicates.** For Vertical Void only, a cursor sets Complexity, Proportionality, Centrality, Openness, Connectivity, Directionality, Immersive, Visibility, and Receptivity, then reveals Dynamic Core, Open Threshold, and Visual Immersion. A note on the extract says two criteria are shared and the third changes with the typology.

**Does not communicate.**

- The other fourteen rating sets.
- That descriptors are stored names, not values computed from the ratings. In `translateArchetype`, the descriptor string is copied from the archetype record. The rating changes the biological number.
- The quantitative maps. Low / Medium / High are `ratingLabel` of 0 / 1 / 2. The parameter numbers live in `INTENSITY_MAP`, `RADIUS_MAP`, and `DIRECTIONALITY_MAP`.
- Which criterion is typology-specific. For Lobby the third formal criterion is Centrality, the third spatial is Directionality, the third atmospheric is Receptivity (`BRANCHES` in `lib/catalog.ts`). Workspace and Gathering swap those thirds (Plate Articulation, Modularity, Collaboration, Circulation Integration, Spatial Permanence, Social Proximity). The extract lists all three specific names in one line, which is easy to miss under the plates.

**Accuracy.** The Vertical Void ratings in `lib/catalog.ts` are Complexity High, Proportionality Medium, Centrality High, Openness High, Connectivity Medium, Directionality Medium, Immersive High, Visibility High, Receptivity Medium. The meter animation passes through intermediate labels. A paused frame can show Centrality as Medium before the drag finishes. That is a **presentation simplification** of a discrete stored rating, and it can be misread as the stored value.

The closing question on the Physarum region — “How are descriptors and criteria translated into behavioral language?” — is the right question. This page does not answer it. Chapter 02’s parameter map answers only the criteria half, and only for Vertical Void.

#### Generative system research

**Communicates.** Cellular Automata, Wave Function Collapse, and Stigmergy, each with a short trait list. Stigmergy is marked selected. Traits match `GENERATIVE_SYSTEMS`: cells and neighborhoods; constraint propagation and collapse; traces and indirect coordination.

**Does not communicate.** Why the other two were set aside for *this* project, or that Wave Function Collapse returns later as a clustering search (Chapter 03, Graph and WFC). The comparison is a research plate, not a description of `lib/skill1/engine.ts`. That distinction is correct and should stay visible: these three plates are **architectural interpretation / research comparison**, not the agent implementation.

#### Physarum selection

**Communicates.** Six filtered interests and the behavior chain Explore, Sense, Move, Reinforcement, Adapt, Repeat.

**Does not communicate.** Which of those words are implemented. The engine does sense, turn, move, deposit, and decay (`stepSimulation` in `lib/skill1/engine.ts`). “Adapt” and “Repeat” are not separate operations. The six interests are not wired to metrics.

**Balance.** The chapter spends its largest column on precedent images and its shortest row on the criteria that actually enter the generator. Computational background is thin, which is appropriate, but the architectural reasoning that would justify the fifteen names is also thin. Both gaps are in the same board.

### Chapter 02 — Generative Development

The current chapter title is **Generative Development**, not “2D Generative Development” (`lib/demo-workflow/chapters.ts`).

#### Parameter Map

`SimulationParameters` in `components/demo-workflow/simulation-logic.tsx` calls `translateArchetype("vertical-void")` and draws one cell per trace.

**Verified.** Each Vertical Void criterion writes one biological target through `CRITERION_TARGETS` in `lib/skill1/translate.ts`:

| Criterion | Target | Role in the engine |
| --- | --- | --- |
| Complexity | `geometryVariation` | Heading wander; also scales default sensor angle and turn angle |
| Proportionality | `scaleVariation` | Attraction-field scale; also part of default sensor distance |
| Centrality | attractor position | Attractor between source and field center |
| Openness | `permeability` | How freely agents move |
| Connectivity | `networkDensity` | How strongly agents join trails |
| Directionality | `directionalBias` | Preference toward the attractor |
| Immersive | `attractionStrength` | Pull of the attractor |
| Visibility | `influenceRadius` | Reach of attraction; also part of default sensor distance |
| Receptivity | `sourcePermeability` | Ease of leaving the source |

The Low / Medium / High numbers in the rating cells come from the same maps as the Lab (`RADIUS_MAP`, `DIRECTIONALITY_MAP`, `INTENSITY_MAP`).

**Missing from this page, and implemented:**

- Sensor angle defaults to `0.32 + geometryVariation * 0.45`.
- Sensor distance defaults to `0.45 + influenceRadius * 0.035 + scaleVariation * 0.25`.
- Turn angle defaults to `0.22 + geometryVariation * 0.55`.
- Deposit amount is tied to `flowCoupling` and trail strength, then reduced by several gates (attractor hole, distance, structure).
- Trail decay defaults near `0.986`, and the Lab can override it (`trailDecay` / slime `decay`).
- Deposit diffusion is a stamp along the step (`depositSegment`), not a separate slider on this page.
- The spatial recipe (`SpatialRecipe` in `lib/skill1/types.ts`): source corner, fixed attractors, core exposure, enclosure collar, isolation radius, clustering, approach width, and archetype-specific fields such as `saField`. Those come from `configForArchetype` and the `recipeFrom*` functions, not from the descriptor string.

**Presentation simplification.** If the recorded GIF `/assets/skill0/void-growth-2.gif` decodes, every behavior cell draws that same growth, and the caption says the behaviour is the parameter. The GIF is one run (the code comments “analysis run 23”), not nine isolated parameter effects. When the GIF is absent, the page falls back to schematic drawings (`wander`, `scaleField`, `placeAttractor`, and the others). Those drawings are not the engine.

**Misleading if left unlabeled.** “Descriptors → Spatial Recipe” appears in the older workflow graphics (`components/home-workflow-bands.tsx`, `lib/home-workflow-steps.ts`). It is not what `translateArchetype` does. Descriptor text is attached to the trace for display. The recipe is a separate authored object. Chapter 02’s parameter map does not repeat the slogan in its canvas title, but it also never shows the recipe, so a viewer who remembers the slogan will think the descriptors were translated. They were not.

#### Lab Simulation

`LabRun` replays a saved recording: cursor, parameter drag, run frames, then analysis tabs. Analysis colors and tab copy come from `lib/skill1/analysis.ts` (`ANALYSIS_TABS`, occupancy threshold, regime tones Exploration / Reinforcement / Convergence).

**Verified.** This is a presentation of one stored run, not a live call to `stepSimulation`. The cursor is a simulation of using the Lab.

**Does not communicate.** Which archetype and which saved file are on screen, in a sentence a viewer can read without opening `LAB_RUN_FILE`. The relationship “this slider value produced this network” is only as clear as the recording’s order. Analysis categories are visited, not defined, except by whatever label the Lab frame already carries.

This page should stay a replay. It should not be rebuilt as a second Lab. It does need a one-line identity (archetype, run, what the three analysis tabs measure) and a visible link back to the parameter map: the sliders are the translated parameters, not a new set of controls.

#### First Population

`FirstPopulation` loads `/demo/skill1/{archetype}/entries.json` and shows every image in that file, then advances through `CATALOG_ORDER`.

**Communicates.** A candidate here is a saved Skill 1 plate. There are many plates per archetype. The fifteen archetypes take turns.

**Does not communicate.** That these plates are not yet the optimization population. Skill 2’s generation 1 is a new set of 80 genomes sampled around the translated behavior (`sampleInitialGenomes`, generation 1 flags are `explorer` in `lib/skill2/evolution.ts`). The page title in the sequence is “First Population,” which is the optimization term for generation 1. Using it for the Skill 1 catalog is **misleading**. The code comment in `generative-chapter.tsx` is more accurate: “The Physarum Logic catalog: every saved Skill 1 iteration.”

The handoff into optimization is a jump. Nothing says which of these plates, if any, is the canonical genome that generation 1 varies.

#### Multiobjective Optimization

`moo-intro.tsx` states six steps: three objectives, a population, three scores, a nondominated front, variation with diversity, several generations, no single optimum. It also says a person selects afterward. The front is a hand-placed set of dots. The comment in the file calls the glyphs “diagrams from a standard multiobjective explanation.” Atmospheric is explicitly not an axis of that plot. The generation mix drawn on the page is:

- G1: 1 / 0 / 0
- G2: 0.7 / 0.22 / 0.08
- G3: 0.5 / 0.37 / 0.13
- G4: 0.3 / 0.52 / 0.18

**Verified from the controller, and different from those bars:**

- 4 generations, 80 new evaluations each (`EVOLUTION_CONFIG` in `lib/skill2/evolution.ts`).
- Objectives are Formal, Spatial, and Atmospheric, maximized independently. A feasible candidate dominates an infeasible one (`dominates` in `lib/skill2/nsga.ts`).
- `newGenerationMix` in `lib/skill2/specialists.ts`: generation 1 is 0 mutants and 80 explorers; generation 2 is 24 mutants and 56 explorers; generation 3 is 40 and 40; generation 4 is 56 and 24.
- Crowding is stored on the rank and “the controller does not use it to choose parents or the global archive” (`lib/skill2/nsga.ts`).
- Diversity in the implementation is explorer injection, specialist parents, and orientation elites, not a crowding sort.
- The archive is the unweighted nondominated set. Rank 1 at birth is not the same thing as still being archived (`lib/skill2/verify-evolution.ts`).

**Classification.** The six step names are a fair **presentation simplification**. The dot plot and the G1–G4 bars are **not** the run. The bars are the most important inaccuracy in Chapter 02, because they look like data.

#### Optimization process and Pareto space

`optimization-stage.tsx` loads catalog candidates, separates nondominated and diversity-tagged plates, and draws a Pareto field.

**Verified.** `paretoField` projects each nondominated point onto the plane perpendicular to Formal + Spatial + Atmospheric and triangulates that projection. The vertices are the loaded points. The triangles are a viewing surface, not extra candidates and not a fitted performance model. The component’s own comment says the front is “one field rather than a set of nearest-neighbor links.”

**Risk.** Without a sentence on the drawing, the mesh reads as a continuous landscape. It should be labeled as a view of the recorded nondominated points.

**Does not communicate.** The 80-per-generation count, the explorer/mutant schedule, specialists, or the difference between “nondominated in this generation” and “still in the global archive.” Human selection is a later page, which is the right split, but this page’s select beat can look like the decision.

#### Catalog selection

`CatalogSelection` replays Vertical Void only, from `/demo/skill2/catalog.json`. It shows Formal, Spatial, and Atmospheric numbers, and tags: Diversity tag, Diversity rescue, Nondominated, Evaluated. The comment says it does not write a lab selection.

**Communicates.** How a designer can inspect one archetype’s alternatives.

**Does not communicate.** Why candidate 351, rather than another nondominated or diversity-tagged plate, is the one in `data/skill3/final-selection.json`. No rationale string is in that handoff. Showing the scores of the chosen id next to two rejected neighbors would be verified comparison. Inventing a sentence about why it was chosen would be **missing evidence**.

#### Selected candidates

`SelectedCatalog` lists one plate per archetype from `propagatedCandidate`, which reads `data/skill3/final-selection.json`, and images from `/demo/skill2/previews/{archetype}/{candidateId}.webp`.

**Verified ids** include Vertical Void 351, Compressed Sequential 205, Continuous Hall 237, Topographic Ground Field 49, Linear Gallery 263, Open Hall 333, Terraced 46, Flat Deep Plan 83, Void Edge 86, and the remaining gathering archetypes in the same file. The file’s `purpose` is: “Current working Skill 3 handoff for Skill 4. Not a final approved geometry set.” The page says “carried into vertical propagation,” which matches the code comment in `propagated-candidates.ts`. It should not be read as a signed architectural approval. The status field on each row is `"Validated"`, which is a geometry status, not a statement that the design is finished.

#### Archetype reading

`archetype-reading.tsx` draws a different figure per archetype. The Vertical Void note is explicit: “The dark opening inside the mass is the organizing void. Nested contours describe that 2D region. The arrow is the intended vertical reading, not a measured section.”

**Classification.** These are **architectural interpretations** of the selected 2D plates. They are useful if the caption stays in that register. They do not explain the selection, and they do not report Formal, Spatial, or Atmospheric scores. Positive and negative space are inferred from the plate mask in this component, not from a stored occupancy analysis. Where the note already says “not a measured section,” keep that standard for every archetype whose arrow is a reading.

### Chapter 03 — Vertical Propagation

#### Process

`ProcessDemonstration` is a Lab replay, not a second generator. The steps and the sentences now on screen are:

| Step | Sentence |
| --- | --- |
| Start | A verified Skill 2 state begins the sequence. |
| Inherit | Architectural criteria arrive as three families. |
| Continue | Twenty-four continuations grow from one verified state. |
| Sample | Significant moments are retained from the evolving 2D system. |
| Develop | A retained pattern changes into the next, and that change becomes the surface. |
| Form | The processed field produces the final Open morphology. |
| Cap | The Open form closes into a continuous mass. |
| Choose | One continuation is chosen from the field. |
| Solidify | The selected mesh becomes a validated module. |
| Hand off | The validated module is ready for the next skill. |

The replay identity in the component is Vertical Void, candidate `CANDIDATE`, continuation N24, including the solidified before/after fetch. The cue line shows `N24`, a retained count, and the play iteration. Develop’s own note says the first change is three horizontal sections of the stored XYT field, and that macro is the outline while processed is the boundary the surface is drawn from. It also says generation data and the Open morphology are unchanged by that drawing. That is one of the clearest methodological sentences in the chapter.

**Verified about “24”.** `NATURAL_CONTINUATION_COUNT` in `lib/skill3/continuations.ts` is 24. `emphasis-schedule.ts` authors recipes only for N01–N24. `carved-mass-dataset.ts` throws if a set is not 24 long. So 24 is the generator’s set size, not a number that changes per archetype.

**Also verified, and easy to miss.** The fifteen stored selections do not all keep N24. From `data/skill3/final-selection.json`: Vertical Void N24, Compressed Sequential N03, Continuous Hall N15, Topographic Ground Field N09, Linear Gallery N19, Open Hall N08, Terraced N06, Flat Deep Plan N16, Void Edge N19, and the other gathering rows in that file. The process page is one case. The sentence “twenty-four continuations” is true of the generator. It is not true that every selected module is N24.

**Inherit** shows three family scores for this example (the live board shows values such as formal 0.83 High). Those are summary ratings for the replay, not the nine criterion-to-parameter traces from Chapter 02. The link back to the translated genome is implied.

**Choose** shows continuation thumbnails for this archetype. It does not show a table of the fifteen chosen continuation ids. **Solidify** shows a before and after for N24 and says the mesh “becomes a validated module.” The checks named in chapter facts are one component, watertight, and manifold (`VERTICAL.checks`). The page does not show those three results as a checklist. **Hand off** does not say what the next skill receives: a module id of the form `carved-mass:{archetype}:{candidate}:{continuation}`, status Validated, geometry under `data/experiments/carved-mass-solidified`.

**Z0.** “A verified Skill 2 state” is the right idea. The page never uses the label Z0 in the visible sentence, while the chapter sequence still lists “Verified Z0.” The selected 2D candidate id (351 for this replay) should be on the Start frame so the viewer can match it to the Chapter 02 plate.

#### Catalog

The catalogue page is the Skill 3 catalogue embedded for the presentation (`CatalogDemonstration`). It can show continuation alternatives for an archetype. This audit did not click through all fifteen archetypes in the catalogue. The risk, from the process page, is that a viewer leaves believing every archetype’s chosen branch is N24.

#### Final View

`FinalMorphologyCatalogue` is given the fifteen handoff rows, all marked Validated in the JSON, with `wireframe`, `spread`, and `scale`. The main view rotates the fifteen meshes. A click opens one typology, five modules, and the human-scale model when `scale` is on.

The contract line in the JSON — not a final approved geometry set — is not on the page. The view is titled as a final morphology catalogue. **Presentation simplification** of a working handoff. The geometry is the solidified carved-mass meshes. The approval status is narrower than the title.

#### Human scale

There is no separate Human Scale page in `DEMO_CHAPTERS`. The reading is `HumanScaleModel` inside the expanded typology spread (`components/final-morphology-catalogue.tsx`, `scale` prop).

`readHumanScale` (`lib/demo-workflow/human-scale-reading.ts`):

- Treats the module as a 20 ft cube (`HALF = 10`).
- Uses a body height of about 6 ft (`BODY = 6.05`).
- Samples the mesh on a 16 × 16 column grid.
- Stands a figure on the mesh or on the cube’s ground plane.
- The file header says: “The line names what that void suggests. It is not a use.”

The lines the function can emit include “Plate overhead,” “Mass above open ground,” “Full-height opening,” “Covered surface,” “Low surface,” and “Open volume,” plus a fallback “No clear standing room.” Those phrases are geometric categories (clearance, cover, rim, visibility). They are not verified floors, steps, or circulation.

**Risk.** “Plate overhead · N ft clear” and a standing figure photograph as occupiable space. The code’s own disclaimer is not the sentence on the canvas; the canvas sentence is the category line. This audit did not visually check all fifteen figure placements against the meshes. A figure can also be placed on the cube’s ground plane (`mesh: false`), which is outside the solid and easy to read as a lobby floor.

#### Clustering pages inside Chapter 03

Clustering development, Graph and WFC, and Cluster catalog are implemented (`components/demo-workflow/clustering-pages.tsx`). They read stored Skill 6 experiments (`clustering-overnight-v1`), including rule-based, graph, and wave-function-collapse engines, and the states Placed, Patched, Union, and Smoothed.

They are **verified displays of stored cluster records**, not a new explanation of vertical propagation. They sit in Chapter 03 after the module catalogue. The process page has already said the module is ready for “the next skill,” without naming clustering. Chapter 01 has also set Wave Function Collapse aside. Its return here is unexplained.

This audit does not evaluate whether those cluster experiments are methodologically complete.

### Relationships between chapters

**01 → 02.** The question at the end of Chapter 01 is the right hinge. Chapter 02 answers it only for Vertical Void’s nine ratings, and never shows the spatial recipe. The video between the chapters is a Lab recording (`PhysarumVideoPage` scales the Lab sheet, including its 135 px bar, into the workflow). It does not state the translation rule. The biological choice is clear. The rule that follows from it is not.

**02 → 03.** The selected-candidate page and the vertical Start step use the same handoff file, which is the right link. The Start sentence does not repeat the candidate id. Inherit shows family scores, not the parameter map. A viewer can believe the 2D plate is extruded. Develop’s section sentence is the correction, and it is buried in the Lab frame.

**03 → later work.** The handoff sentence is generic. The JSON says the rows are a working handoff for Skill 4, not a finished set. The next pages in the same chapter are clustering, which is a different operation: modules combined by surface, not a taller single module. The presentation does not say which of those two futures the validated mesh is for. Both are in the project. Only one is named, and it is named as “the next skill.”

---

## D. Visual and Animation Audit

Judged from the live workflow DOM on 21 November 2026 and from the layout code. Not every page was re-measured pixel by pixel at 1920 × 560 in this pass.

**Chapter 01.** One sheet, four columns (`research-chapter.module.css`). Column 1 is the precedent, full height. Column 2 is archetypes on a 1.42 fraction row and criteria on a 0.78 fraction row. Columns 3 and 4 are the system comparison and the Physarum plate, full height. The criteria interaction — the only instrument on the board — is in the short cell. Nine labels, three tracks, and three descriptor lines cannot sit at the same size as the precedent photographs. The system traits are readable as chips. The precedent photographs dominate. That hierarchy makes the chapter look like a research essay and makes the input to Chapter 02 look like a footnote.

The criteria cursor is worth keeping. It should run in a frame that can show the track and the resulting descriptor at the same time, without the plates eating the height.

**Chapter 02 parameter map.** The canvas is designed at 1760 × 496 and letterboxed into the page (`paint` in `simulation-logic.tsx`). That is the right use of the classroom width: nine parameters in a row, not a Lab chrome. The risk is sameness. If the growth GIF replaces every behavior cell, the row no longer shows that permeability and influence radius do different things. Prefer the schematic, or the GIF in one reference cell, and the parameter’s own drawing in the others.

**Lab simulation.** The replay is dense in the way the Lab is dense. That is acceptable because it is one page with a cursor. Analysis tabs at the end need their definitions to remain on screen after the cursor leaves, or the visit reads as a tour.

**First population.** A 20-column sheet of small plates is the right image for “many alternatives.” It is the wrong image for “why these enter optimization,” because nothing is singled out. One plate at the scale of the later selected catalog, with the rest as a field, would match the decision the next pages make.

**MOO introduction.** The layout is three bands (what, why, front) plus a step strip. The front is only 90 px tall in the design coordinates (`PLOT.h`). A schematic front that small cannot teach dominance. The generation bars are large enough to be remembered, which is why their numbers have to be the real schedule or be removed.

**Optimization.** Plates plus a triangulated front is the right pair. The front should stay a drawing of points, with the triangles lighter than the points. Timing already spends 72000 ms here. The missing piece is a caption, not a slower beat.

**Catalog selection and selected candidates.** The replay is Vertical Void only, then the next page shows all fifteen. That cut is good. The fifteen plates are still small. The archetype-reading page then redraws them with marks. The two pages can share one plate size so the reading looks like an annotation of the selection, not a new illustration.

**Archetype reading.** The Vertical Void caption already separates a reading from a section. Other archetypes need the same restraint. Marks that are not aligned to the mask should be dropped rather than decorated. This page is interpretation. It should not grow a score dashboard unless the scores are the stored objectives for that candidate id.

**Chapter 03 process.** Ten Lab steps on one page is the densest board in the three chapters. The cursor makes it legible as a demonstration and illegible as a reference. Sample, Develop, Form, and Cap are the geometric argument. Start, Inherit, and Continue are the methodological argument. They are the same size. The Develop section note is the one that explains 2D to 3D, and it sits in body copy inside the Lab frame.

**Final view.** Fifteen rotating meshes communicate difference. They do not communicate which continuation or which candidate. The expanded typology is the right place for human scale. The back control label is “Back,” not the workflow name.

**Human scale.** The 20 ft cube and 6 ft body are the right comparison, and they are implemented. The line of type is the problem. A short geometric label (“clearance,” “cover,” “ground plane”) should be as prominent as the suggestive sentence. Figures on the ground plane should be visually distinct from figures standing on the mesh.

**Clustering pages.** They are full of real models, which is appropriate for a catalog and abrupt after the module handoff. No new diagram is recommended here until the chapter boundary is decided.

**Pacing.** Chapter 01’s entire argument is one 18 s focused hold. Chapter 02 then spends 48–72 s on single pages. The criteria-to-parameter idea is the hinge and gets the least time.

**Repetition.** Vertical Void is the worked example on the criteria meters, the parameter map, the lab replay, the optimization catalog, and the vertical process. That repetition is useful if each page adds a layer. It becomes redundant where the parameter map and the lab replay both show the same growth without saying they are the same run. The fifteen-plate grid appears as the first population (many plates), the selected set (one each), and the archetype reading (one each, marked). The middle grid is the one to keep large. The first should stay a field. The reading should annotate the middle grid rather than restage it.

---

## E. Proposed New Diagrams and Visualizations

### E1. Agent loop, one cell on the Parameter Map

**Where.** Chapter 02, Parameter Map, a reference cell before the nine parameters, or a single shared diagram above them.

**Explains.** How a local step makes a network: sense forward, left, and right; turn; move; deposit along the step; decay the field.

**Composition.** Black ground. One agent as a short white segment. Three thin cyan sensor rays using the Vertical Void defaults from `stepSimulation` (angles and distances computed from that archetype’s `geometryVariation`, `influenceRadius`, and `scaleVariation`). A copper trail behind the agent. A dim previous trail fading by the decay factor.

**Behavior.** One loop, about four seconds: sense, turn toward the stronger side, step, stamp deposit, decay. No second organism, no extra environment.

**Data.** Existing formulas in `lib/skill1/engine.ts`. No new experimental record. Label the numbers as defaults for this translation, and note that a Lab slime override can replace them.

**Priority context.** This is the diagram the current page does not have. The nine parameter cells stay.

### E2. Two-column translation, Vertical Void, with the recipe called out as authored

**Where.** Chapter 02, Parameter Map, replacing the slogan rather than adding a page.

**Explains.** Ratings write `BiologicalParams`. The descriptor is a name. The spatial recipe is the archetype’s source, attractor, and collar, from `configForArchetype` / `SpatialRecipe`.

**Composition.** Left: the nine ratings already drawn. Right: the recipe fields that are actually set for Vertical Void (source corner, attractor, whether it is fixed). A third line, smaller: “Descriptor: Dynamic Core / Open Threshold / Visual Immersion” with no arrow into the recipe.

**Data.** `translateArchetype("vertical-void")` and that archetype’s config. Do not draw recipe fields that are undefined for this archetype.

### E3. Generation schedule as counts, not a schematic stack

**Where.** Chapter 02, Multiobjective Optimization, in place of the current G1–G4 bars.

**Explains.** 80 evaluations a generation. Explorers versus mutants: 80/0, 56/24, 40/40, 24/56 in explorer/mutant order matching `newGenerationMix`.

**Composition.** Four rows. Each row is 80 small marks, copper for mutants and white for explorers, in the true counts. A caption: crowding is stored and is not the parent rule. Parents and the archive are the nondominated set, specialists, and orientation elites (`evolution.ts`).

**Data.** `lib/skill2/specialists.ts` and `lib/skill2/nsga.ts`. No new run.

### E4. Pareto points with a quiet triangulation

**Where.** Chapter 02, Optimization. Change the existing drawing; do not add a page.

**Explains.** The mesh is a view of recorded nondominated points.

**Composition.** Points at full value. Triangle edges at low opacity. One sentence: “A view of the recorded nondominated points, projected. Not a fitted surface.”

**Data.** The points already loaded by `optimization-stage.tsx`.

### E5. Selection pair

**Where.** Chapter 02, Catalog Selection, still on Vertical Void.

**Explains.** What was continued, and that a written reason is not stored.

**Composition.** The continued candidate (351) at the size of its neighbors, with its three scores. Two other visible catalog plates beside it. Caption: “351 is the candidate in the Skill 3 handoff. A selection note is not stored.”

**Data.** `/demo/skill2/catalog.json` and `final-selection.json`. If 351 is absent from the visible catalog filter, say so instead of substituting another id.

### E6. Case-study banner on the vertical process

**Where.** Chapter 03, Process, on Start and Continue.

**Explains.** This replay is Vertical Void 351, continuation N24. The generator builds N01–N24 for a verified Z0. The other archetypes in the handoff keep different continuation ids.

**Composition.** One line on Start: “Vertical Void · candidate 351 · this replay follows N24.” On Continue, keep “twenty-four continuations,” and add “the handoff’s other archetypes use other ids from that set.”

**Data.** `final-selection.json`, `NATURAL_CONTINUATION_COUNT`.

### E7. Section strip for Develop

**Where.** Chapter 03, Process, Develop frame. The sentence is already there.

**Explains.** Two retained plates, three horizontal sections, the section becoming the surface.

**Composition.** Use the stored XYT frames this replay already loads. Draw them in a row: plate, section, plate, then the surface. Do not invent a new section. If the stored frames are the stack, show those frames larger and move the Lab chrome down.

**Data.** The process-replay JSON and the frames `ProcessDemonstration` already fetches.

### E8. Human-scale legend

**Where.** The expanded Final View, not a new page.

**Explains.** 20 ft cube, 6 ft body, line is a geometric suggestion.

**Composition.** A thin legend: cube edge, body, “on the mesh” versus “on the cube ground,” and the category word (clearance, cover, opening, ground). Keep the current sentence, prefixed so it cannot be read as a program.

**Data.** `readHumanScale` output. No new measurement.

---

## F. Recommended Revised Presentation Structure

A new page is not justified for the agent loop, the recipe, the generation counts, or the human-scale legend. Those belong on the pages that already claim to explain them.

One structural change is worth making, and it is a clarification rather than a new chapter.

| Current | Proposed | Why |
| --- | --- | --- |
| 01, five regions at once | Keep one board. Swap visual weight: criteria full height, precedent images sharing a column with the typology plates | The input to Chapter 02 is the part that is now smallest |
| Video between 01 and 02 | Keep | It is a bridge, not a method page. It should not be asked to explain translation |
| 02 Parameter Map | Keep, add E1 and E2 on this page | The page’s job is the translation |
| 02 Lab Simulation | Keep | Replay, not a second explanation |
| 02 First Population | Rename in the interface to the Skill 1 catalog, or retitle the sequence label so it is not “First Population” | The name collides with optimization generation 1 |
| 02 MOO, Optimization, Catalog Selection, Selected Candidates, Archetype Reading | Keep the order | The order is the right chain. Correct the drawings in place |
| 03 Process, Catalog, Final View | Keep as the Skill 3 ending | This is the handoff |
| 03 Clustering development, Graph and WFC, Cluster catalog | Keep the pages, and decide whether they stay in Chapter 03 | They are a different method. If they stay, the Hand off line has to name them. If they move, Chapter 03 can end on the module |

No page in Chapters 01–03 should be deleted for being empty. The MOO schematic front can be deleted as a drawing and replaced by E3 without removing the page.

---

## G. Prioritized Improvement Matrix

| Chapter | Page | Issue | Recommendation | Priority | Complexity | Source |
| --- | --- | --- | --- | --- | --- | --- |
| 02 | Multiobjective Optimization | G1–G4 bars do not match the controller | Draw 80/56/40/24 explorers against 0/24/40/56 mutants. Say crowding is recorded and not used to pick parents | High | Small | `lib/skill2/specialists.ts`, `lib/skill2/nsga.ts` |
| 02 | Parameter Map | Descriptor-to-recipe slogan is not the translator; sensor loop is absent | Show ratings → parameters, name the recipe as authored, add the sense/turn/deposit/decay loop | High | Moderate | `lib/skill1/translate.ts`, `lib/skill1/engine.ts` `stepSimulation` |
| 03 | Process | N24 reads as the universal selected continuation | Banner: Vertical Void 351 N24; 24 is the set size; other handoff rows use other ids | High | Small | `data/skill3/final-selection.json`, `lib/skill3/continuations.ts` |
| 02 | Catalog Selection | Scores are shown; the reason for 351 is not | Show 351 beside neighbors and state that a selection note is not stored | High | Small | `/demo/skill2/catalog.json`, `final-selection.json` |
| 03 | Final View, expanded | Human-scale lines read as occupancy | Legend: 20 ft, 6 ft, mesh versus ground plane, “not a use” | High | Small | `lib/demo-workflow/human-scale-reading.ts` |
| 02 | First Population | Name collides with generation 1 | Rename the page to the Skill 1 catalog and say optimization samples a new population of 80 | High | Small | `generative-chapter.tsx`, `lib/skill2/evolution.ts` |
| 01 | Criteria + Descriptors | Only Vertical Void, in the short row, and the drag passes through false labels | Give the meters the tall cell; snap labels to Low, Medium, High; note that the other archetypes use other thirds | High | Moderate | `research-chapter.module.css`, `lib/catalog.ts` |
| 02 | Optimization | Triangulated front can be read as a fitted surface | Keep the points, fade the triangles, add the one-sentence caption | Medium | Small | `paretoField` in `optimization-stage.tsx` |
| 03 | Process | 2D-to-3D explanation is body copy inside a crowded Lab | Enlarge the stored section frames already loaded for Develop | Medium | Moderate | `vertical-demonstration.tsx` |
| 03 | Process, Hand off | “Next skill” is unnamed, then clustering pages appear | Name the handoff (module id, validated mesh) and say clustering is a later combination | Medium | Small | `final-selection.json`, `clustering-pages.tsx` |
| 01 | Typology Analysis | Plates without the definitions that are already written | Add each typology’s definition from `TYPOLOGIES` under the row. Do not invent archetype comparisons | Medium | Small | `lib/catalog.ts` |
| 02 | Archetype Reading | Readings can be taken as measurements | Keep the Vertical Void disclaimer pattern on every arrow that is not a stored section | Medium | Moderate | `archetype-reading.tsx` |
| 03 | Final View | Title says final; the file says a working handoff | Use the contract sentence, or “working selection,” beside the catalogue title | Medium | Small | `final-selection.json` `purpose` |
| 01 | Generative systems | Trait lists do not say this is research, not the engine | One line: the agent implementation is Chapter 02, not these plates | Low | Small | `GENERATIVE_SYSTEMS`, `engine.ts` |
| 02 | Lab Simulation | Run identity is easy to miss | One line: archetype, recording, what the analysis tabs are | Low | Small | `lab-run.tsx` |
| 03 | Final View | Back control says “Back” | Use the workflow name if this panel is meant to match the other expandable panels | Low | Small | `final-morphology-catalogue.tsx` |

---

## H. Methodology and Evidence Questions

These should be decided before implementation. They are not resolved here.

1. Is there a written record, outside `lib/catalog.ts`, of how Axel Springer produced the three typologies and the fifteen archetype names? The presentation does not contain one. The catalog contains definitions and ratings, not a derivation.
2. Should the interface retire “Criteria → Growth Instinct” and “Descriptors → Spatial Recipe”? Those phrases are in the older workflow components. The translator does not implement the second arrow.
3. For human scale, is the 20 ft cube an agreed module size for all fifteen meshes, or only a viewing convention? The reader assumes it (`HALF = 10`). This audit did not find a second source that measures each mesh’s real bounding box in feet.
4. Are the human-scale category lines allowed to stay suggestive (“plate overhead,” “full-height opening”), or should they be limited to clearance and cover? The code computes clearance and cover, then chooses a suggestive sentence.
5. Is a selection rationale for the fifteen candidate ids stored anywhere other than the ids themselves? It is not in `final-selection.json`.
6. Should Chapter 03 end at the solidified module, with clustering presented later? The pages exist in Chapter 03 now. Moving them is a structural decision, not a correction of a false number.
7. The optimization catalog replay and the Pareto drawing were checked against the controller’s rules, not against every plotted point in `/demo/skill2/catalog.json`. If a point on the front is not `pareto` in that file, that is a separate bug and was not exhaustively tested.
8. Continuation count 24 is taken from the generator and the dataset assertion. This audit did not recount mesh files on disk for all fifteen archetypes.

---

## I. Overall Recommendation

Implement the high-priority corrections before any new animation. They are mostly captions, counts, and one renamed page: the generation mix, the N24 case-study line, the missing selection note, the human-scale disclaimer, and the Skill 1 catalog name. Those change what a viewer is entitled to believe.

Next, revise the Parameter Map in place: the agent loop and the split between ratings, descriptor names, and the authored recipe. That is the methodological hole between Chapter 01 and Chapter 02.

Then adjust layout where the argument is currently the smallest thing on the sheet: Chapter 01 criteria, and the Develop sections inside the Chapter 03 Lab frame.

Defer a new chapter structure for clustering until you decide whether Chapter 03 is “the module” or “the module plus the first assemblies.” Defer new archetype-comparison illustrations until you are willing to label them as readings. Defer rebuilding the Lab replay.

Essential corrections are the ones that make a schematic look like a measurement: the MOO bars, the descriptor arrow, the universal N24, and the human-scale sentence. Everything else is presentation quality, and it is worth doing after those four are honest.
