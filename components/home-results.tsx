"use client";

import Link from "next/link";
import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { HOME_RESULTS, type HomeResultPreview, type HomeResultSkill } from "@/lib/home-results";

type HomeResultPlates = Partial<Record<HomeResultSkill["id"], readonly HomeResultPreview[]>>;

type Grid = { cols: number; rows: number; gap: number; cell: number };

const INITIAL_GRID: Grid = { cols: 3, rows: 3, gap: 12, cell: 0 };

/** Classroom / presentation is a 4×3 exhibition. Twelve square plates per skill. */
const CLASSROOM_COLS = 4;
const CLASSROOM_ROWS = 3;
/** Desktop is a 3×3 exhibition. Nine square plates per skill. */
const DESKTOP_COLS = 3;
const DESKTOP_ROWS = 3;

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
 * Nine plates on desktop. The squares shrink to fit the catalog frame.
 */
export function resultsPreviewGrid(width: number, height: number): Grid {
  if (width < 48 || height < 48) return INITIAL_GRID;
  const gap = Math.round(Math.min(16, Math.max(8, Math.min(width, height) * 0.035)));
  return {
    cols: DESKTOP_COLS,
    rows: DESKTOP_ROWS,
    gap,
    cell: squareCell(width, height, DESKTOP_COLS, DESKTOP_ROWS, gap),
  };
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
