"use client";

import Link from "next/link";
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { ModuleGlassPreview } from "@/components/site/site-workspace";
import { HOME_RESULTS, type HomeResultPreview, type HomeResultSkill } from "@/lib/home-results";
import { SITE_ARCHETYPES } from "@/lib/skill5/catalog";
import { loadArchetypeMesh } from "@/lib/skill5/load-module";
import type { IsoMesh } from "@/lib/scan/isomesh";

type HomeResultPlates = Partial<Record<HomeResultSkill["id"], readonly HomeResultPreview[]>>;

type Grid = { cols: number; rows: number; gap: number; cell: number; row: number };

/** Physarum is four rows of six. Optimization and Vertical are the fifteen chosen, five by three. */
function plateGrid(skillId: HomeResultSkill["id"]) {
  return skillId === "skill-1" ? { cols: 6, rows: 4 } : { cols: 5, rows: 3 };
}

function squareCell(width: number, height: number, cols: number, rows: number, gap: number) {
  const byWidth = (width - gap * (cols - 1)) / cols;
  const byHeight = (height - gap * (rows - 1)) / rows;
  return Math.max(0, Math.floor(Math.min(byWidth, byHeight)));
}

function classroomGrid(skillId: HomeResultSkill["id"], width: number, height: number): Grid {
  const { cols, rows } = plateGrid(skillId);
  if (width < 48) return { cols, rows, gap: 12, cell: 0, row: 0 };
  const gap = Math.round(Math.min(rows > 3 ? 16 : 28, Math.max(8, Math.min(width, height > 48 ? height : width) * 0.02)));
  const byWidth = Math.max(0, Math.floor((width - gap * (cols - 1)) / cols));
  if (height < 48) return { cols, rows, gap, cell: byWidth, row: byWidth };
  const cell = Math.min(byWidth, squareCell(width, height, cols, rows, gap));
  return { cols, rows, gap, cell, row: cell };
}

/** Optimization and Vertical Propagation grow just enough for their frames to meet the Physarum frame. */
function matchPhysarum(stage: HTMLElement, grid: Omit<Grid, "row">): Grid {
  const square = { ...grid, row: grid.cell };
  const field = stage.closest<HTMLElement>(".home-results-field");
  const physarum = stage.closest(".home-results")?.querySelector<HTMLElement>('[data-skill="skill-1"]');
  const target = physarum?.clientHeight ?? 0;
  const chrome = field ? Math.max(0, field.clientHeight - stage.clientHeight) : 0;
  if (grid.cell === 0 || target < 48) return square;
  const row = Math.max(grid.cell, Math.floor((target - chrome - grid.gap * (grid.rows - 1)) / grid.rows));
  return { ...grid, row };
}

/** Squares shrink to fit the catalog frame. Counts stay with the skill. */
export function resultsPreviewGrid(skillId: HomeResultSkill["id"], width: number, height: number): Grid {
  return classroomGrid(skillId, width, height);
}

function slotsFor(skill: HomeResultSkill, count: number): (HomeResultPreview | null)[] {
  return Array.from({ length: count }, (_, index) => skill.previews[index] ?? null);
}

function VerticalModules() {
  const [meshes, setMeshes] = useState<Record<string, IsoMesh | "missing" | undefined>>({});

  useEffect(() => {
    const controller = new AbortController();
    for (const entry of SITE_ARCHETYPES) {
      loadArchetypeMesh(entry, controller.signal)
        .then((mesh) => {
          if (controller.signal.aborted) return;
          setMeshes((current) => ({ ...current, [entry.moduleId]: mesh ?? "missing" }));
        })
        .catch(() => {
          if (controller.signal.aborted) return;
          setMeshes((current) => ({ ...current, [entry.moduleId]: "missing" }));
        });
    }
    return () => controller.abort();
  }, []);

  return SITE_ARCHETYPES.map((entry) => {
    const stored = meshes[entry.moduleId];
    const mesh = stored && stored !== "missing" ? stored : null;
    return (
      <figure className="home-results-slot" key={entry.moduleId} aria-label={`${entry.name}, ${entry.continuationId}`}>
        {mesh ? <ModuleGlassPreview mesh={mesh} /> : null}
      </figure>
    );
  });
}

function FieldFrame({ skill, children }: { skill: HomeResultSkill; children: ReactNode }) {
  if (skill.href) {
    return (
      <Link className="home-results-field" href={skill.href} data-status={skill.status} data-skill={skill.id}>
        {children}
      </Link>
    );
  }
  return (
    <article className="home-results-field" data-status={skill.status} data-skill={skill.id}>
      {children}
    </article>
  );
}

function SkillField({ skill }: { skill: HomeResultSkill }) {
  const stageRef = useRef<HTMLDivElement>(null);
  const [grid, setGrid] = useState<Grid>(() => ({ ...plateGrid(skill.id), gap: 12, cell: 0, row: 0 }));

  useLayoutEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const measure = () => {
      const classroom = stage.closest<HTMLElement>(".site-shell")?.dataset.siteDisplay === "classroom";
      const base = classroom
        ? classroomGrid(skill.id, stage.clientWidth, stage.clientHeight)
        : resultsPreviewGrid(skill.id, stage.clientWidth, stage.clientHeight);
      const next = skill.id === "skill-1" ? { ...base, row: base.cell } : matchPhysarum(stage, base);
      setGrid((current) =>
        current.cols === next.cols && current.rows === next.rows && current.gap === next.gap && current.cell === next.cell && current.row === next.row
          ? current
          : next,
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(stage);
    const results = stage.closest<HTMLElement>(".home-results");
    if (results) observer.observe(results);
    const shell = stage.closest<HTMLElement>(".site-shell");
    const displayObserver = new MutationObserver(measure);
    if (shell) displayObserver.observe(shell, { attributes: true, attributeFilter: ["data-site-display"] });
    return () => {
      observer.disconnect();
      displayObserver.disconnect();
    };
  }, [skill.id]);

  const slots = slotsFor(skill, grid.cols * grid.rows);

  return (
    <FieldFrame skill={skill}>
      <header className="home-results-head">
        <h3 className="home-results-title">{skill.name}</h3>
      </header>
      <div
        className="home-results-stage"
        ref={stageRef}
        style={
          {
            "--results-cols": grid.cols,
            "--results-rows": grid.rows,
            "--results-gap": `${grid.gap}px`,
            "--results-cell": grid.cell > 0 ? `${grid.cell}px` : undefined,
            "--results-row": grid.row > 0 ? `${grid.row}px` : undefined,
          } as CSSProperties
        }
      >
        {skill.id === "skill-3" ? (
          <VerticalModules />
        ) : (
          slots.map((preview, index) =>
            preview ? (
              <figure className="home-results-slot" key={preview.id}>
                <img src={preview.src} alt={preview.alt} />
              </figure>
            ) : (
              <div className="home-results-slot" key={`${skill.id}-reserved-${index}`} aria-hidden="true" />
            ),
          )
        )}
      </div>
      <footer className="home-results-foot">
        <span className="home-results-action">
          View full catalogue
          <span aria-hidden="true">→</span>
        </span>
      </footer>
    </FieldFrame>
  );
}

export function HomeResults({ plates = {} }: { plates?: HomeResultPlates }) {
  return (
    <div className="home-results">
      {HOME_RESULTS.map((skill) => (
        <SkillField key={skill.id} skill={{ ...skill, previews: plates[skill.id] ?? skill.previews }} />
      ))}
    </div>
  );
}
