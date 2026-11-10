"use client";

import type { CSSProperties } from "react";
import { SITE_ARCHETYPES, SITE_PROGRAMS, PROGRAM_LABEL } from "@/lib/skill5/catalog";
import { ASSEMBLIES, CONFIGURATIONS, HYBRID, SITE } from "@/lib/demo-workflow/chapter-facts";
import { MODULE_STILLS } from "@/lib/demo-workflow/overview";
import { Caption, Chips, Img, Kicker, Missing } from "@/components/demo-workflow/chapter-kit";
import { HybridCatalogPage, HybridLabPage, HybridSitePage } from "@/components/demo-workflow/integration-run";
import { PresentationReel } from "@/components/demo-workflow/presentation-reel";
import type { ChapterContent } from "@/components/demo-workflow/demo-chapter";
import styles from "@/components/demo-workflow/integration-chapter.module.css";

/** Unit cells of each arrangement, on a 3 × 3 lattice. */
const ARRANGEMENT_CELLS: Record<(typeof ASSEMBLIES.arrangements)[number]["id"], readonly (readonly [number, number])[]> = {
  linear: [[0, 1], [1, 1], [2, 1]],
  grid: [[0, 0], [1, 0], [0, 1], [1, 1]],
  t: [[0, 0], [1, 0], [2, 0], [1, 1]],
  cross: [[1, 0], [0, 1], [1, 1], [2, 1], [1, 2]],
};

function ModuleFigure({ still }: { still: (typeof MODULE_STILLS)[number] }) {
  return (
    <figure>
      <Img className={styles.module} src={still.src} alt={`${still.name}, ${still.continuationId}`} />
      <figcaption>{still.continuationId}</figcaption>
    </figure>
  );
}

function Modules({ grouped }: { grouped?: boolean }) {
  if (!grouped) {
    return (
      <div className={styles.modules}>
        {MODULE_STILLS.map((still) => (
          <ModuleFigure key={still.moduleId} still={still} />
        ))}
      </div>
    );
  }
  return (
    <div className={styles.grouped}>
      {SITE_PROGRAMS.map((program) => (
        <div key={program}>
          <p>{PROGRAM_LABEL[program]}</p>
          <div className={styles.modules}>
            {MODULE_STILLS.filter((_, index) => SITE_ARCHETYPES[index]?.program === program).map((still) => (
              <ModuleFigure key={still.moduleId} still={still} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/** The 5 × 5 candidate field: columns move from parent A to parent B, rows raise the transformation. */
function CandidateField({ axes }: { axes?: boolean }) {
  const { selected, parentAWeights, intensity } = HYBRID;
  return (
    <div className={styles.fieldWrap} data-axes={axes || undefined}>
      {axes ? <span className={styles.axisTop}>Parent A weight · {parentAWeights.join(" · ")}</span> : null}
      {axes ? <span className={styles.axisSide}>Transformation · {intensity.join(" · ")}</span> : null}
      <ol className={styles.field} aria-label={`Candidate field, ${selected.id} selected`}>
        {intensity.map((_, row) =>
          parentAWeights.map((__, column) => {
            const id = `H${String(row * parentAWeights.length + column + 1).padStart(2, "0")}`;
            return (
              <li key={id} data-selected={id === selected.id || undefined}>
                {axes ? id : null}
              </li>
            );
          }),
        )}
      </ol>
    </div>
  );
}

function TileCounts() {
  const most = Math.max(...ASSEMBLIES.tiles.map((item) => item.count));
  return (
    <ul className={styles.bars}>
      {ASSEMBLIES.tiles.map((item) => (
        <li key={item.tiles} style={{ "--share": item.count / most } as CSSProperties}>
          <span>{item.tiles}</span>
          <i />
          <b>{item.count}</b>
        </li>
      ))}
    </ul>
  );
}

function Arrangements() {
  return (
    <ul className={styles.arrangements}>
      {ASSEMBLIES.arrangements.map((item) => (
        <li key={item.id}>
          <svg viewBox="0 0 30 30" aria-hidden="true">
            {ARRANGEMENT_CELLS[item.id].map(([x, y]) => (
              <rect key={`${x}-${y}`} x={x * 10 + 1} y={y * 10 + 1} width="8" height="8" />
            ))}
          </svg>
          <b>{item.count}</b>
          <span>{item.label}</span>
        </li>
      ))}
    </ul>
  );
}

/** Saved configurations. Occupation is computed live in Site Integration and is not stored on the record. */
function Comparison({ detail }: { detail?: boolean }) {
  if (CONFIGURATIONS.saved.length === 0) return <Missing>No configuration saved</Missing>;
  return (
    <div className={styles.sheet} data-detail={detail || undefined}>
      <span />
      {CONFIGURATIONS.compare.map((column) => (
        <span key={column} className={styles.sheetHead}>
          {column}
        </span>
      ))}
      {CONFIGURATIONS.saved.map((configuration) => (
        <div key={configuration.id} className={styles.sheetRow}>
          <span className={styles.sheetId}>
            <b>{configuration.id}</b>
            {configuration.name}
          </span>
          <span className={styles.sheetCell}>
            <b>{configuration.modules}</b>
            {configuration.placed}
            {detail ? ` · ${configuration.programSource} ${configuration.program}` : null}
          </span>
          <span className={styles.sheetCell} data-live="">Live</span>
          <span className={styles.sheetCell} data-live="">Live</span>
        </div>
      ))}
    </div>
  );
}

/** Chapter 05: selected modules joined into hybrids and assemblies, one saved site configuration, and the return to requirements. */
export const INTEGRATION_CONTENT: ChapterContent = {
  visuals: [
    {
      full: (
        <div className={styles.stack}>
          <Modules />
          <Caption>
            <b>{SITE_ARCHETYPES.length}</b> selected · five per program
            <br />
            Marked Validated · not a final approved set
          </Caption>
        </div>
      ),
    },
    {
      full: (
        <div className={styles.stack}>
          <Img className={styles.hybrid} src={HYBRID.stills[1]} />
          <CandidateField />
          <Caption>
            Two parents · one connector · <b>{HYBRID.selected.id}</b>
          </Caption>
        </div>
      ),
    },
    {
      full: (
        <div className={styles.stack}>
          <TileCounts />
          <Arrangements />
          <Caption>
            <b>{ASSEMBLIES.total}</b> assemblies · tiles per assembly
          </Caption>
        </div>
      ),
    },
    {
      full: (
        <div className={styles.stack}>
          <Img className={styles.plan} src={SITE.plan} />
          <Caption>
            <b>{CONFIGURATIONS.gridFeet} ft</b> grid · {SITE.address}
            <br />
            No configuration saved
          </Caption>
        </div>
      ),
    },
    {
      full: (
        <div className={styles.stack}>
          <Comparison />
        </div>
      ),
    },
  ],
  details: [
    <div key="modules" className={styles.column}>
      <Modules grouped />
    </div>,
    <div key="hybrid" className={styles.column}>
      <Kicker>
        {HYBRID.parents.join(" + ")} · faces {HYBRID.faces} · SOM-inspired field, not a trained map
      </Kicker>
      <div className={styles.hybridRow}>
        <CandidateField />
        <div className={styles.hybrids}>
          {HYBRID.stills.map((src, index) => (
            <Img key={src} className={styles.hybridThumb} src={src} alt={index === 4 ? HYBRID.selected.id : `Recorded hybrid still ${index + 1}`} />
          ))}
        </div>
      </div>
      <Caption align="start">{HYBRID.selected.id} is the stored example. Five stills are exported. The other twenty cells have no image, and the center is not scored as best.</Caption>
    </div>,
    <div key="assembly" className={`${styles.column} ${styles.assemblyBand}`}>
      <TileCounts />
      <Arrangements />
      <Missing>Parent bodies are not stored, so the {ASSEMBLIES.total} assemblies are not redrawn</Missing>
    </div>,
    <div key="site" className={styles.column}>
      <Img className={styles.plan} src={SITE.plan} />
      <Chips items={[`${CONFIGURATIONS.gridFeet} ft grid`, `Bay to the ${SITE.waterfront.toLowerCase()}`]} />
      <Missing>No configuration saved</Missing>
    </div>,
    <div key="evaluation" className={styles.column}>
      <Comparison detail />
    </div>,
  ],
  layout: styles.composed,
  boards: [
    { layout: styles.sheet, details: [<HybridLabPage key="lab" />] },
    { layout: styles.sheet, details: [<HybridCatalogPage key="catalog" />] },
    { layout: styles.sheet, details: [<HybridSitePage key="site" />] },
  ],
  loop: { from: 4, to: [1, 3], labels: ["Evaluation revises the hybrid", "Client and site set the next placement"] },
  feature: {
    operation: 4,
    action: "Watch the lab run",
    view: (
      <PresentationReel
        note="Replay of the stored hybrid stills and the empty site. No configuration is written, and no score is invented."
        beats={[
          { src: HYBRID.stills[0], caption: `${HYBRID.parents.join(" + ")} · faces ${HYBRID.faces}` },
          { src: HYBRID.stills[2], caption: "Candidate field · SOM-inspired, not a trained map" },
          { src: HYBRID.stills[4], caption: `${HYBRID.selected.id} is the stored example, not a scored center` },
          { src: SITE.plan, caption: "Site Integration · no configuration saved" },
        ]}
      />
    ),
  },
};
