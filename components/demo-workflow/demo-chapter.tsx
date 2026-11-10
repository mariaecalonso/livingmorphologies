"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { DEMO_TIMING, type DemoChapter as Chapter } from "@/lib/demo-workflow/chapters";
import { FeedbackLoop, type Loop } from "@/components/demo-workflow/feedback-loop";
import { LightLinks, lightState, useLinks, type Light } from "@/components/demo-workflow/light-links";
import type { DemoPhase } from "@/components/demo-workflow/use-demo-presentation";
import styles from "@/components/demo-workflow/demo-workflow.module.css";

/**
 * A chapter's own graphics: one overview diagram per operation, and one focused explanation per operation.
 * `layout` is a class that places the explanations; without it they sit in five equal columns.
 * `feature` is an optional hand-opened demonstration for one operation; it replaces the explanations.
 * `loop` is an optional feedback path back to earlier operations, drawn under both; the `layout` leaves room for it.
 */
export type ChapterFeature = { operation: number; action: string; view: ReactNode };

/** One focused page: its frames, in order, and an optional demonstration. */
export type ChapterBoard = {
  details: readonly ReactNode[];
  layout?: string;
  feature?: ChapterFeature;
};

export type ChapterContent = {
  visuals: readonly { full: ReactNode }[];
  details: readonly ReactNode[];
  layout?: string;
  feature?: ChapterFeature;
  loop?: Loop;
  /** When set with `chapter.pages`, these replace the overview and the explanation. */
  boards?: readonly ChapterBoard[];
};

/** The numbered chapters stay fully lit. They do not wait for the travelling light. */
function stillLit(chapter: Chapter) {
  return chapter.index === "01" || chapter.index === "02" || chapter.index === "03" || chapter.index === "04" || chapter.index === "05";
}

function frameLight(chapter: Chapter, light: Light, index: number, steady = false) {
  if (stillLit(chapter)) return "lit";
  return steady ? "current" : lightState(light, index);
}

/** The chapter's operations in order. Centred in overview; condensed at the top while focused. */
export function DemoChapterSummary({ chapter, light }: { chapter: Chapter; light: Light }) {
  const last = chapter.sequence.length - 1;
  const row = useRef<HTMLSpanElement>(null);
  const measured = useLinks(row, summaryCells);
  const links = measured ? { ...measured, grow: 1 } : null;
  return (
    <span ref={row} className={styles.summary}>
      {chapter.sequence.map((operation, index) => (
        <span key={operation.label} className={styles.summaryStep}>
          <span className={index === last ? `${styles.summaryCell} ${styles.outcome}` : styles.summaryCell} data-light={frameLight(chapter, light, index)}>
            <span className={styles.kicker}>{String(index + 1).padStart(2, "0")}</span>
            <span className={styles.summaryText}>{operation.label}</span>
            {operation.note ? <span className={styles.note}>{operation.note}</span> : null}
          </span>
        </span>
      ))}
      <LightLinks layout={links} light={light} count={chapter.sequence.length} />
    </span>
  );
}

/** The explanations, in order. */
const sections = (node: HTMLElement) => [...node.querySelectorAll<HTMLElement>(":scope > section")];

/** The opening step cells, in order. */
const summaryCells = (node: HTMLElement) => [...node.querySelectorAll<HTMLElement>(":scope > span > [data-light]")];

function VisualChapter({
  chapter,
  phase,
  light,
  content,
  feature,
  onOperation,
  onFeature,
}: {
  chapter: Chapter;
  phase: DemoPhase;
  light: Light;
  content: ChapterContent;
  feature: boolean;
  onOperation: (operation: number) => void;
  onFeature: (operation: number | null) => void;
}) {
  const focused = phase === "focused";
  const demo = content.feature;
  const open = Boolean(demo && feature);
  const detail = useRef<HTMLDivElement>(null);
  const measured = useLinks(detail, sections);
  // These frames stay at one size and one glow. The connectors still follow the light, but their ends do not move with a growth that is not happening.
  const links = stillLit(chapter) && measured ? { ...measured, grow: 1 } : measured;
  return (
    <>
      <div className={styles.detail} aria-hidden={!focused && !open} data-feature={open || undefined}>
        <div
          ref={detail}
          className={`${styles.detailColumns} ${content.layout ?? ""}`}
          data-layout={content.layout ? "" : undefined}
          aria-hidden={open || undefined}
        >
          {chapter.sequence.map((operation, index) => (
            <section key={operation.label} className={styles.detailColumn} data-light={frameLight(chapter, light, index)} aria-label={operation.label}>
              <div className={styles.detailHead}>
                <button
                  type="button"
                  className={styles.detailPick}
                  aria-current={light.operation === index ? "step" : undefined}
                  tabIndex={focused && !open ? 0 : -1}
                  onClick={() => onOperation(index)}
                >
                  <span className={styles.chapterIndex}>{String(index + 1).padStart(2, "0")}</span> {operation.label}
                </button>
                {demo?.operation === index ? (
                  <button type="button" className={styles.featureOpen} tabIndex={focused && !open ? 0 : -1} onClick={() => onFeature(index)}>
                    <svg viewBox="0 0 10 10" aria-hidden="true"><path d="M2 1v8l7-4z" /></svg>
                    {demo.action}
                  </button>
                ) : null}
              </div>
              <div className={styles.detailBody}>{content.details[index]}</div>
            </section>
          ))}
          <LightLinks layout={links} light={light} count={chapter.sequence.length} />
          {content.loop ? <FeedbackLoop layout={links} loop={content.loop} light={light} place="inside" /> : null}
        </div>
        {demo && open ? (
          <section className={styles.feature} aria-label={`${chapter.sequence[demo.operation]?.label} · ${chapter.sequence[demo.operation]?.feature ?? demo.action}`}>
            <div className={styles.detailHead}>
              <span className={styles.chapterIndex}>{String(demo.operation + 1).padStart(2, "0")}</span>
              <span>{chapter.sequence[demo.operation]?.label} · {chapter.sequence[demo.operation]?.feature ?? demo.action}</span>
              <button type="button" className={styles.featureClose} onClick={() => onFeature(null)}>
                Close
              </button>
            </div>
            <div className={styles.detailBody}>{demo.view}</div>
          </section>
        ) : null}
      </div>
    </>
  );
}

/** A chapter page made of focused frames. The travelling light connects them in order. */
function BoardChapter({
  chapter,
  sheet,
  light,
  content,
  feature,
  leaving = false,
  arrive = false,
  onOperation,
  onFeature,
}: {
  chapter: Chapter;
  sheet: number;
  light: Light;
  content: ChapterContent;
  feature: boolean;
  /** The page is rising off, the same motion as the opening step row. */
  leaving?: boolean;
  /** The page is arriving after a row has risen. */
  arrive?: boolean;
  onOperation: (operation: number) => void;
  onFeature: (operation: number | null) => void;
}) {
  const pageIndex = sheet;
  const page = chapter.pages?.[pageIndex];
  const board = content.boards?.[pageIndex];
  const detail = useRef<HTMLDivElement>(null);
  const measured = useLinks(detail, sections);
  const links = stillLit(chapter) && measured ? { ...measured, grow: 1 } : measured;
  if (!page || !board) return null;
  const demo = board.feature;
  const open = Boolean(demo && feature);
  const steady = page.sequence.length === 1;
  return (
    <div
      className={styles.detail}
      data-feature={open || undefined}
      data-steady={steady || undefined}
      data-arrive={arrive ? "" : undefined}
      data-leave={leaving ? "" : undefined}
      aria-hidden={leaving || undefined}
    >
      <div
        ref={detail}
        className={`${styles.detailColumns} ${board.layout ?? ""}`}
        data-layout={board.layout ? "" : undefined}
        aria-hidden={open || undefined}
      >
        {page.sequence.map((operation, index) => (
          <section key={operation.label} className={styles.detailColumn} data-light={frameLight(chapter, light, index, steady)} data-steady={steady || undefined} aria-label={operation.label}>
            <div className={styles.detailHead}>
              <button
                type="button"
                className={styles.detailPick}
                aria-current={steady || light.operation === index ? "step" : undefined}
                tabIndex={open ? -1 : 0}
                onClick={steady ? undefined : () => onOperation(index)}
              >
                {operation.mark === "" ? null : <span className={styles.chapterIndex}>{operation.mark ?? String(index + 1).padStart(2, "0")}</span>} {operation.label}
                {operation.locked ? (
                  <svg className={styles.lock} viewBox="0 0 12 12" aria-label="Locked">
                    <rect x="2.2" y="5.2" width="7.6" height="5.4" rx="0.8" fill="none" stroke="currentColor" strokeWidth="1" />
                    <path d="M4 5.2V3.6a2 2 0 0 1 4 0v1.6" fill="none" stroke="currentColor" strokeWidth="1" />
                  </svg>
                ) : null}
              </button>
              {demo?.operation === index ? (
                <button type="button" className={styles.featureOpen} tabIndex={open ? -1 : 0} onClick={() => onFeature(index)}>
                  <svg viewBox="0 0 10 10" aria-hidden="true"><path d="M2 1v8l7-4z" /></svg>
                  {demo.action}
                </button>
              ) : null}
            </div>
            <div className={styles.detailBody}>{board.details[index]}</div>
          </section>
        ))}
        <LightLinks layout={links} light={light} count={page.sequence.length} />
      </div>
      {demo && open ? (
        <section className={styles.feature} aria-label={`${page.sequence[demo.operation]?.label} · ${page.sequence[demo.operation]?.feature ?? demo.action}`}>
          <div className={styles.detailHead}>
            <span className={styles.chapterIndex}>{String(demo.operation + 1).padStart(2, "0")}</span>
            <span>{page.sequence[demo.operation]?.label} · {page.sequence[demo.operation]?.feature ?? demo.action}</span>
            <button type="button" className={styles.featureClose} onClick={() => onFeature(null)}>
              Close
            </button>
          </div>
          <div className={styles.detailBody}>{demo.view}</div>
        </section>
      ) : null}
    </div>
  );
}

export function DemoChapterView({
  chapter,
  phase,
  light,
  content,
  feature,
  sheet = 0,
  coverEpoch = 0,
  onPhase,
  onOperation,
  onFeature,
}: {
  chapter: Chapter;
  phase: DemoPhase;
  light: Light;
  content?: ChapterContent;
  feature: boolean;
  sheet?: number;
  /** Restarts the opening title light when playback restarts on the same chapter. */
  coverEpoch?: number;
  onPhase: (phase: DemoPhase) => void;
  onOperation: (operation: number) => void;
  onFeature: (operation: number | null) => void;
}) {
  const focused = phase === "focused";
  const paged = Boolean(chapter.pages && content?.boards);
  const page = paged ? chapter.pages?.[sheet] : undefined;
  const seenSheet = useRef(sheet);
  const [outgoing, setOutgoing] = useState<number | null>(null);
  const [leaving, setLeaving] = useState(false);
  if (focused && seenSheet.current !== sheet) {
    const from = seenSheet.current;
    seenSheet.current = sheet;
    setOutgoing(from);
    setLeaving(false);
  }
  if (!focused && (outgoing !== null || seenSheet.current !== sheet)) {
    seenSheet.current = sheet;
    if (outgoing !== null) setOutgoing(null);
    if (leaving) setLeaving(false);
  }
  useEffect(() => {
    if (outgoing == null) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setOutgoing(null);
      return;
    }
    const frame = requestAnimationFrame(() => setLeaving(true));
    const timer = window.setTimeout(() => {
      setOutgoing(null);
      setLeaving(false);
    }, DEMO_TIMING.transitionMs);
    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(timer);
    };
  }, [outgoing]);
  return (
    <article
      className={styles.chapter}
      data-phase={phase}
      data-visual={content ? "" : undefined}
      data-loop={content?.loop ? "" : undefined}
      data-feature={feature && (content?.feature || content?.boards?.[sheet]?.feature) ? "" : undefined}
      data-still={stillLit(chapter) ? "" : undefined}
      aria-label={focused && page ? `${chapter.index} ${chapter.title}, ${page.name}` : `${chapter.index} ${chapter.title}`}
    >
      {content && chapter.sequence.length > 0 ? (
        <>
          <div className={styles.stepField} data-bleed="steps" aria-hidden="true" />
          <button
            type="button"
            className={styles.stepRow}
            aria-label={`${chapter.index} ${chapter.title}`}
            tabIndex={focused ? -1 : 0}
            onClick={() => onPhase("focused")}
          >
            <span
              key={coverEpoch}
              className={styles.coverTitle}
              style={{ "--cover-chars": `${chapter.index} — ${chapter.title}`.length } as CSSProperties}
            >
              <span className={styles.coverInk}>{chapter.index} — {chapter.title}</span>
              <span className={styles.coverLight} aria-hidden="true">{chapter.index} — {chapter.title}</span>
            </span>
          </button>
        </>
      ) : null}
      {content?.boards && chapter.pages ? (
        focused ? (
          <>
            {outgoing != null ? (
              <BoardChapter
                key={outgoing}
                chapter={chapter}
                sheet={outgoing}
                light={light}
                content={content}
                feature={false}
                leaving={leaving}
                onOperation={onOperation}
                onFeature={onFeature}
              />
            ) : null}
            <BoardChapter
              key={sheet}
              chapter={chapter}
              sheet={sheet}
              light={light}
              content={content}
              feature={feature}
              arrive
              onOperation={onOperation}
              onFeature={onFeature}
            />
          </>
        ) : null
      ) : content ? (
        <VisualChapter
          chapter={chapter}
          phase={phase}
          light={light}
          content={content}
          feature={feature}
          onOperation={onOperation}
          onFeature={onFeature}
        />
      ) : (
        <>
          <button
            type="button"
            className={styles.summaryButton}
            onClick={() => onPhase(focused ? "overview" : "focused")}
            aria-label={focused ? `Return to the ${chapter.title} overview` : `Explain ${chapter.title}`}
          >
            <span className={styles.chapterTitle}>{chapter.title}</span>
            <DemoChapterSummary chapter={chapter} light={light} />
          </button>
          <div className={styles.detail} aria-hidden={!focused}>
            <div className={styles.detailSlots}>
              {chapter.stages.map((stage) => (
                <section key={stage} className={styles.detailSlot} aria-label={stage}>
                  <span className={styles.kicker}>{stage}</span>
                </section>
              ))}
            </div>
          </div>
        </>
      )}
    </article>
  );
}
