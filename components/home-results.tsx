"use client";

import Link from "next/link";
import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { HOME_RESULTS, type HomeResultPreview, type HomeResultSkill } from "@/lib/home-results";

type HomeResultPlates = Partial<Record<HomeResultSkill["id"], readonly HomeResultPreview[]>>;

type Grid = { cols: number; rows: number; gap: number; cell: number };

/** Physarum shows two runs for each archetype. Optimization and Vertical show the fifteen chosen. */
function plateGrid(skillId: HomeResultSkill["id"]) {
  return skillId === "skill-1" ? { cols: 6, rows: 5 } : { cols: 5, rows: 3 };
}

function squareCell(width: number, height: number, cols: number, rows: number, gap: number) {
  const byWidth = (width - gap * (cols - 1)) / cols;
  const byHeight = (height - gap * (rows - 1)) / rows;
  return Math.max(0, Math.floor(Math.min(byWidth, byHeight)));
}

function classroomGrid(skillId: HomeResultSkill["id"], width: number, height: number): Grid {
  const { cols, rows } = plateGrid(skillId);
  if (width < 48 || height < 48) return { cols, rows, gap: 12, cell: 0 };
  const gap = Math.round(Math.min(rows > 3 ? 16 : 28, Math.max(8, Math.min(width, height) * 0.02)));
  return {
    cols,
    rows,
    gap,
    cell: squareCell(width, height, cols, rows, gap),
  };
}

/** Squares shrink to fit the catalog frame. Counts stay with the skill. */
export function resultsPreviewGrid(skillId: HomeResultSkill["id"], width: number, height: number): Grid {
  return classroomGrid(skillId, width, height);
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
  const [grid, setGrid] = useState<Grid>(() => ({ ...plateGrid(skill.id), gap: 12, cell: 0 }));

  useLayoutEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const measure = () => {
      const classroom = stage.closest<HTMLElement>(".site-shell")?.dataset.siteDisplay === "classroom";
      const next = classroom
        ? classroomGrid(skill.id, stage.clientWidth, stage.clientHeight)
        : resultsPreviewGrid(skill.id, stage.clientWidth, stage.clientHeight);
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
