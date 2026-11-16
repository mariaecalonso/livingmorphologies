"use client";

import { useEffect, useRef, useState } from "react";
import { BRANCHES } from "@/lib/catalog";
import { formatCandidateId, formatGeneration } from "@/components/evolution/evolution-data";
import { formatMatch } from "@/components/evolution/format-match";
import { useExplainTime } from "@/components/demo-workflow/explain-clock";
import styles from "@/components/demo-workflow/catalog-selection.module.css";

const ARCHETYPE = "vertical-void";
const COLUMNS = 6;
const ROWS = 4;
const PAGE_SIZE = COLUMNS * ROWS;
const DURATION = 44;

type Aim =
  | { kind: "enter" }
  | { kind: "card"; id: number }
  | { kind: "next" }
  | { kind: "prev" }
  | { kind: "commit" };

type Step = {
  at: number;
  page: number;
  focus: number | null;
  chosen: boolean;
  aim: Aim;
  press: boolean;
};

type Candidate = {
  id: number;
  generation: number;
  formal: number;
  spatial: number;
  atmospheric: number;
  pareto: boolean;
  diversity: string;
  image: string;
  observed: Record<string, number>;
};

type View = { page: number; focus: number | null; chosen: boolean };

const STEPS: Step[] = [
  { at: 0.3, page: 0, focus: null, chosen: false, aim: { kind: "enter" }, press: false },
  { at: 1.6, page: 0, focus: null, chosen: false, aim: { kind: "card", id: 83 }, press: false },
  { at: 2.8, page: 0, focus: null, chosen: false, aim: { kind: "card", id: 83 }, press: true },
  { at: 3.1, page: 0, focus: 83, chosen: false, aim: { kind: "card", id: 83 }, press: false },
  { at: 9.6, page: 0, focus: 83, chosen: false, aim: { kind: "next" }, press: false },
  { at: 10.3, page: 0, focus: 83, chosen: false, aim: { kind: "next" }, press: true },
  { at: 10.55, page: 1, focus: 83, chosen: false, aim: { kind: "next" }, press: false },
  { at: 11.2, page: 1, focus: 83, chosen: false, aim: { kind: "next" }, press: true },
  { at: 11.45, page: 2, focus: 83, chosen: false, aim: { kind: "next" }, press: false },
  { at: 12.1, page: 2, focus: 83, chosen: false, aim: { kind: "next" }, press: true },
  { at: 12.35, page: 3, focus: 83, chosen: false, aim: { kind: "card", id: 363 }, press: false },
  { at: 13.5, page: 3, focus: 83, chosen: false, aim: { kind: "card", id: 363 }, press: true },
  { at: 13.8, page: 3, focus: 363, chosen: false, aim: { kind: "card", id: 363 }, press: false },
  { at: 20.4, page: 3, focus: 363, chosen: false, aim: { kind: "prev" }, press: false },
  { at: 21.1, page: 3, focus: 363, chosen: false, aim: { kind: "prev" }, press: true },
  { at: 21.35, page: 2, focus: 363, chosen: false, aim: { kind: "card", id: 351 }, press: false },
  { at: 22.6, page: 2, focus: 363, chosen: false, aim: { kind: "card", id: 351 }, press: true },
  { at: 22.9, page: 2, focus: 351, chosen: false, aim: { kind: "card", id: 351 }, press: false },
  { at: 30.6, page: 2, focus: 351, chosen: false, aim: { kind: "commit" }, press: false },
  { at: 31.4, page: 2, focus: 351, chosen: false, aim: { kind: "commit" }, press: true },
  { at: 31.7, page: 2, focus: 351, chosen: true, aim: { kind: "commit" }, press: false },
];

const CRITERIA = BRANCHES.flatMap((branch) =>
  [...branch.shared, branch.specific.lobby].map((criterion) => ({
    id: criterion.id,
    label: criterion.label,
    branch: branch.title,
  })),
);

function stepAt(time: number) {
  let index = 0;
  for (let i = 0; i < STEPS.length; i += 1) {
    if (STEPS[i].at <= time) index = i;
  }
  return { step: STEPS[index], next: STEPS[index + 1] ?? null };
}

function aimPoint(board: HTMLElement, aim: Aim) {
  if (aim.kind === "enter") return { x: 28, y: board.clientHeight * 0.46 };
  const selector = aim.kind === "card" ? `[data-card="${aim.id}"]` : `[data-aim="${aim.kind}"]`;
  const node = board.querySelector<HTMLElement>(selector);
  if (!node) return null;
  const host = board.getBoundingClientRect();
  const rect = node.getBoundingClientRect();
  return {
    x: rect.left - host.left + rect.width * (aim.kind === "card" ? 0.62 : 0.45),
    y: rect.top - host.top + rect.height * (aim.kind === "card" ? 0.4 : 0.55),
  };
}

function roleLabel(candidate: Candidate) {
  if (candidate.diversity === "tag") return "Diversity tag";
  if (candidate.diversity === "rescue") return "Diversity rescue";
  if (candidate.pareto) return "Nondominated";
  return "Evaluated";
}

/** A replay of reading the Vertical Void catalog. It does not write a lab selection. */
export function CatalogSelection() {
  const [candidates, setCandidates] = useState<Candidate[] | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "missing">("loading");
  const [view, setView] = useState<View>({ page: 0, focus: null, chosen: false });
  const shown = useRef("");

  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      try {
        const response = await fetch("/demo/skill2/catalog.json", { signal: controller.signal });
        if (!response.ok) throw new Error(String(response.status));
        const catalog = (await response.json()) as {
          archetypes: { archetypeId: string; candidates: (Candidate & { catalogVisible?: boolean; image: string | null; observed?: Record<string, number> })[] }[];
        };
        const archetype = catalog.archetypes.find((item) => item.archetypeId === ARCHETYPE);
        const visible = (archetype?.candidates ?? []).filter((item) => item.catalogVisible !== false && item.image);
        if (!visible.length) {
          setStatus("missing");
          return;
        }
        setCandidates(visible.map((item) => ({
          id: item.id,
          generation: item.generation,
          formal: item.formal,
          spatial: item.spatial,
          atmospheric: item.atmospheric,
          pareto: Boolean(item.pareto),
          diversity: item.diversity || "none",
          image: item.image,
          observed: item.observed ?? {},
        })));
        setStatus("ready");
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setStatus("missing");
      }
    };
    void load();
    return () => controller.abort();
  }, []);

  const ref = useExplainTime(DURATION, (time, board) => {
    const { step, next } = stepAt(time);
    const key = `${step.page}:${step.focus ?? ""}:${step.chosen}`;
    if (shown.current !== key) {
      shown.current = key;
      setView({ page: step.page, focus: step.focus, chosen: step.chosen });
    }
    const cursor = board.querySelector<HTMLElement>("[data-pointer]");
    if (!cursor) return;
    const from = aimPoint(board, step.aim) ?? { x: 28, y: board.clientHeight * 0.46 };
    const to = next ? aimPoint(board, next.aim) ?? from : from;
    const span = next ? Math.max(0.05, next.at - step.at) : 1;
    const glide = next ? Math.max(0, Math.min(1, (time - step.at) / span)) : 1;
    const eased = glide * glide * (3 - 2 * glide);
    cursor.style.transform = `translate(${from.x + (to.x - from.x) * eased}px, ${from.y + (to.y - from.y) * eased}px)`;
    cursor.dataset.press = step.press ? "true" : "false";
    cursor.dataset.hidden = time < 0.25 ? "true" : "false";
  });

  return (
    <article ref={ref} className={styles.board} data-explain="">
      <CatalogView candidates={candidates} status={status} view={view} />
      <span className={styles.cursor} data-pointer="" data-hidden="true" aria-hidden="true">
        <svg viewBox="0 0 12 16"><path d="M1 1 L1 13 L4.2 10.2 L7.2 15 L9 14.2 L6 9.4 L11 9.2 Z" /></svg>
      </span>
    </article>
  );
}

function CatalogView({
  candidates,
  status,
  view,
}: {
  candidates: Candidate[] | null;
  status: "loading" | "ready" | "missing";
  view: View;
}) {
  const list = candidates ?? [];
  const pageCount = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
  const page = Math.min(view.page, pageCount - 1);
  const visible = list.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);
  const focus = list.find((item) => item.id === view.focus) ?? null;

  return (
    <>
      <header className={styles.head}>
        <p>Vertical Void catalog</p>
        <p>The search ranks alternatives. The designer selects one.</p>
      </header>
      <div className={styles.split}>
        <section className={styles.catalog} aria-label="Optimized candidates">
          <div className={styles.catalogHead}>
            <p>
              Catalog
              <span>{status === "ready" ? `${list.length} drawings` : status === "missing" ? "Catalog missing" : "Loading"}</span>
            </p>
            <div className={styles.pager}>
              <button type="button" data-aim="prev" aria-label="Previous page" tabIndex={-1}>‹</button>
              <span>{page + 1} / {pageCount}</span>
              <button type="button" data-aim="next" aria-label="Next page" tabIndex={-1}>›</button>
            </div>
          </div>
          <div className={styles.grid}>
            {visible.map((candidate) => (
              <button
                key={candidate.id}
                type="button"
                className={styles.card}
                data-card={candidate.id}
                data-active={candidate.id === view.focus || undefined}
                data-chosen={view.chosen && candidate.id === 351 ? "" : undefined}
                tabIndex={-1}
              >
                {view.chosen && candidate.id === 351 ? <span className={styles.badge}>Selected</span> : null}
                <span className={styles.image}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={candidate.image} alt="" />
                </span>
                <span className={styles.meta}>
                  <span>F {formatMatch(candidate.formal)} · S {formatMatch(candidate.spatial)} · A {formatMatch(candidate.atmospheric)}</span>
                  <span>{formatGeneration(candidate.generation)} · {formatCandidateId(candidate.id)}</span>
                </span>
              </button>
            ))}
          </div>
        </section>
        <Inspection candidate={focus} chosen={view.chosen && focus?.id === 351} />
      </div>
    </>
  );
}

function Inspection({ candidate, chosen }: { candidate: Candidate | null; chosen: boolean }) {
  return (
    <section className={styles.detail} aria-label="Inspected candidate">
      <header>
        <p>{chosen ? "Selected for propagation" : "Candidate"}</p>
        <p>{candidate ? `Vertical Void · ${formatCandidateId(candidate.id)} · ${formatGeneration(candidate.generation)}` : "Vertical Void"}</p>
      </header>
      {candidate ? (
        <>
          <div className={styles.preview} data-chosen={chosen || undefined}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={candidate.image} alt="" />
          </div>
          <ul className={styles.scores}>
            {(
              [
                ["Formal", candidate.formal],
                ["Spatial", candidate.spatial],
                ["Atmospheric", candidate.atmospheric],
              ] as const
            ).map(([name, value]) => (
              <li key={name}>
                <b>{name}</b>
                <i style={{ width: `${Math.round(value * 100)}%` }} />
                <em>{formatMatch(value)}</em>
              </li>
            ))}
          </ul>
          <p className={styles.role}>{roleLabel(candidate)}</p>
          <dl className={styles.criteria}>
            {CRITERIA.map((criterion) => (
              <div key={criterion.id}>
                <dt>{criterion.label}</dt>
                <dd>{formatMatch(candidate.observed[criterion.id])}</dd>
              </div>
            ))}
          </dl>
          <button type="button" className={styles.commit} data-aim="commit" data-chosen={chosen || undefined} tabIndex={-1}>
            {chosen ? "Selected" : "Select morphology"}
          </button>
          {chosen ? <p className={styles.note}>Passed to vertical propagation. The search did not make this choice.</p> : null}
        </>
      ) : (
        <p className={styles.empty}>Choose an alternative to inspect it. The catalog holds competing tradeoffs.</p>
      )}
    </section>
  );
}
