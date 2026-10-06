"use client";

import Link from "next/link";
import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { HOME_RESULTS, type HomeResultPreview, type HomeResultSkill } from "@/lib/home-results";

type Grid = { cols: number; rows: number; gap: number; cell: number };

const INITIAL_GRID: Grid = { cols: 2, rows: 2, gap: 18, cell: 0 };

/** Classroom / presentation is a 4×3 exhibition. Twelve square plates per skill. */
const CLASSROOM_COLS = 4;
const CLASSROOM_ROWS = 3;

function squareCell(width: number, height: number, cols: number, rows: number, gap: number) {
  const byWidth = (width - gap * (cols - 1)) / cols;
  const byHeight = (height - gap * (rows - 1)) / rows;
  return Math.max(0, Math.floor(Math.min(byWidth, byHeight)));
}

function classroomGrid(width: number, height: number): Grid {
  const gap = Math.round(Math.min(40, Math.max(20, Math.min(width, height) * 0.016)));
  return {
    cols: CLASSROOM_COLS,
    rows: CLASSROOM_ROWS,
    gap,
    cell: squareCell(width, height, CLASSROOM_COLS, CLASSROOM_ROWS, gap),
  };
}

/**
 * Largest squares that still fit. Scale wins over adding another row or column.
 */
export function resultsPreviewGrid(width: number, height: number): Grid {
  if (width < 48 || height < 48) return INITIAL_GRID;
  const gap = Math.round(Math.min(28, Math.max(12, Math.min(width, height) * 0.045)));
  let best: Grid & { score: number } = { ...INITIAL_GRID, score: -1 };
  for (let cols = 1; cols <= 4; cols += 1) {
    for (let rows = 1; rows <= 4; rows += 1) {
      const count = cols * rows;
      if (count < 2) continue;
      const cell = squareCell(width, height, cols, rows, gap);
      if (cell < 168) continue;
      const score = cell * 1000 + count;
      if (score > best.score) best = { cols, rows, gap, cell, score };
    }
  }
  if (best.score < 0) {
    const cell = squareCell(width, height, 1, 2, gap);
    return { cols: 1, rows: 2, gap, cell };
  }
  return { cols: best.cols, rows: best.rows, gap: best.gap, cell: best.cell };
}

function slotsFor(skill: HomeResultSkill, count: number): (HomeResultPreview | null)[] {
  return Array.from({ length: count }, (_, index) => skill.previews[index] ?? null);
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
  const [grid, setGrid] = useState<Grid>(INITIAL_GRID);

  useLayoutEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const measure = () => {
      const classroom = stage.closest<HTMLElement>(".site-shell")?.dataset.siteDisplay === "classroom";
      const next = classroom
        ? classroomGrid(stage.clientWidth, stage.clientHeight)
        : resultsPreviewGrid(stage.clientWidth, stage.clientHeight);
      setGrid((current) =>
        current.cols === next.cols && current.rows === next.rows && current.gap === next.gap && current.cell === next.cell
          ? current
          : next,
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(stage);
    const shell = stage.closest<HTMLElement>(".site-shell");
    const displayObserver = new MutationObserver(measure);
    if (shell) displayObserver.observe(shell, { attributes: true, attributeFilter: ["data-site-display"] });
    return () => {
      observer.disconnect();
      displayObserver.disconnect();
    };
  }, []);

  const slots = slotsFor(skill, grid.cols * grid.rows);
  const pending = skill.status === "pending";

  return (
    <FieldFrame skill={skill}>
      <header className="home-results-head">
        <p className="home-results-skill">
          <span>{skill.number}</span>
          {skill.name}
        </p>
        <h3 className="home-results-title">{skill.catalogueTitle}</h3>
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
          } as CSSProperties
        }
      >
        {slots.map((preview, index) =>
          preview ? (
            <figure className="home-results-slot" key={preview.id}>
              <img src={preview.src} alt={preview.alt} />
            </figure>
          ) : (
            <div className="home-results-slot" key={`${skill.id}-reserved-${index}`} aria-hidden="true" />
          ),
        )}
      </div>
      <footer className="home-results-foot">
        <p className="home-results-status">{pending ? "Catalogue pending" : "Catalogue ready"}</p>
        <span className="home-results-action">
          View full catalogue
          <span aria-hidden="true">→</span>
        </span>
      </footer>
    </FieldFrame>
  );
}

export function HomeResults() {
  return (
    <div className="home-results">
      {HOME_RESULTS.map((skill) => (
        <SkillField key={skill.id} skill={skill} />
      ))}
    </div>
  );
}
