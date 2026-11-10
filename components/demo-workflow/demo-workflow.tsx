"use client";

import { useEffect, useRef, useState, type ComponentProps, type ComponentType, type CSSProperties } from "react";
import { CONTEXT_CONTENT } from "@/components/demo-workflow/context-chapter";
import { DemoChapterView } from "@/components/demo-workflow/demo-chapter";
import { useGenerativeContent } from "@/components/demo-workflow/generative-chapter";
import { INTEGRATION_CONTENT } from "@/components/demo-workflow/integration-chapter";
import { PhysarumVideoPage } from "@/components/demo-workflow/physarum-video-page";
import { ProcessOverview } from "@/components/demo-workflow/process-overview";
import { RESEARCH_CONTENT } from "@/components/demo-workflow/research-chapter";
import { useDemoPresentation, type DemoPhase } from "@/components/demo-workflow/use-demo-presentation";
import { useVerticalContent } from "@/components/demo-workflow/vertical-chapter";
import { DEMO_CHAPTERS, DEMO_TIMING } from "@/lib/demo-workflow/chapters";
import styles from "@/components/demo-workflow/demo-workflow.module.css";

const PROCESS_OVERVIEW = "Workflow";

type ChapterViewProps = Omit<ComponentProps<typeof DemoChapterView>, "content">;

function GenerativeChapter(props: ChapterViewProps) {
  const content = useGenerativeContent();
  return <DemoChapterView {...props} content={content} />;
}

function VerticalChapter(props: ChapterViewProps) {
  const content = useVerticalContent();
  return <DemoChapterView {...props} content={content} />;
}

const ResearchChapter = (props: ChapterViewProps) => <DemoChapterView {...props} content={RESEARCH_CONTENT} />;
const ContextChapter = (props: ChapterViewProps) => <DemoChapterView {...props} content={CONTEXT_CONTENT} />;
const IntegrationChapter = (props: ChapterViewProps) => <DemoChapterView {...props} content={INTEGRATION_CONTENT} />;

type StageLight = { operation: number | null; reached: number };

/** The stage as it was when a chapter change began, so the leaving chapter can finish its rise. */
type StageSnap = {
  chapter: number | null;
  phase: DemoPhase;
  sheet: number;
  light: StageLight;
  feature: boolean;
  progress: string;
};

/** Chapters with their own graphics. Any other keeps the sequence and labelled slots. */
const CHAPTER_VIEWS: Partial<Record<string, ComponentType<ChapterViewProps>>> = {
  research: ResearchChapter,
  generative: GenerativeChapter,
  vertical: VerticalChapter,
  context: ContextChapter,
  integration: IntegrationChapter,
};

function DemoTransport({ playing, onToggle, onRestart }: { playing: boolean; onToggle: () => void; onRestart: () => void }) {
  return (
    <>
      <button type="button" className={styles.control} aria-label={playing ? "Pause presentation" : "Play presentation"} aria-pressed={playing} onClick={onToggle}>
        {playing ? (
          <svg viewBox="0 0 12 12" aria-hidden="true"><path d="M2.5 1.5h2.2v9H2.5zm4.8 0h2.2v9H7.3z" /></svg>
        ) : (
          <svg viewBox="0 0 12 12" aria-hidden="true"><path d="M3 1.5v9l7-4.5z" /></svg>
        )}
      </button>
      <button type="button" className={styles.control} aria-label="Restart chapter" onClick={onRestart}>
        <svg viewBox="0 0 12 12" aria-hidden="true"><path d="M9.6 3.2A4.2 4.2 0 1 0 10.4 7" /><path d="M9.5 1.2v2.4H7.1" /></svg>
      </button>
    </>
  );
}

/** Down opens the chapter's explanations; up returns to its overview. It sits to the left of Overview, and stays hidden on the Full Process Overview. */
function PhaseToggle({ chapter, focused, single, forward, back, onToggle }: { chapter: string | null; focused: boolean; single?: boolean; forward?: string; back?: string; onToggle: () => void }) {
  if (single) return null;
  const label = chapter == null ? undefined : focused ? (back ?? `Back to ${chapter}`) : (forward ?? "Explain each step");
  return (
    <button type="button" className={styles.control} aria-label={label} title={label} aria-expanded={chapter == null ? undefined : focused} disabled={chapter == null} onClick={onToggle}>
      <svg viewBox="0 0 12 12" aria-hidden="true">
        <path d={focused ? "M2.5 7.75 6 4.25l3.5 3.5" : "M2.5 4.25 6 7.75l3.5-3.5"} />
      </svg>
    </button>
  );
}

function StageView({
  chapterIndex,
  phase,
  sheet,
  light,
  feature,
  coverEpoch = 0,
  onPhase,
  onOperation,
  onFeature,
  onSelect,
}: {
  chapterIndex: number | null;
  phase: DemoPhase;
  sheet: number;
  light: StageLight;
  feature: boolean;
  coverEpoch?: number;
  onPhase: (phase: DemoPhase) => void;
  onOperation: (operation: number) => void;
  onFeature: (operation: number | null) => void;
  onSelect: (chapter: number) => void;
}) {
  const chapter = chapterIndex == null ? null : DEMO_CHAPTERS[chapterIndex];
  if (!chapter) return <ProcessOverview label={PROCESS_OVERVIEW} onSelect={onSelect} />;
  if (chapter.video) {
    return (
      <div className={styles.videoPage} aria-label={chapter.title}>
        <PhysarumVideoPage />
      </div>
    );
  }
  const ChapterView = CHAPTER_VIEWS[chapter.id] ?? DemoChapterView;
  return (
    <ChapterView
      chapter={chapter}
      phase={phase}
      sheet={sheet}
      light={light}
      feature={feature}
      coverEpoch={coverEpoch}
      onPhase={onPhase}
      onOperation={onOperation}
      onFeature={onFeature}
    />
  );
}

function prefersReducedMotion() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function DemoWorkflow() {
  const { state, root, toggle, restart, select, setPhase, setSheet, selectOperation, setFeature } = useDemoPresentation();
  const chapter = state.chapter == null ? null : DEMO_CHAPTERS[state.chapter];
  const focused = state.phase === "focused";
  const title = chapter ? chapter.title : PROCESS_OVERVIEW;
  const light = { operation: state.operation, reached: state.reached };
  const seenChapter = useRef(state.chapter);
  const current = useRef<StageSnap>({ chapter: state.chapter, phase: state.phase, sheet: state.sheet, light, feature: state.feature, progress: "0" });
  const [outgoing, setOutgoing] = useState<StageSnap | null>(null);
  const [leaving, setLeaving] = useState(false);
  const [arrive, setArrive] = useState(false);
  if (seenChapter.current !== state.chapter) {
    const progress = root.current?.style.getPropertyValue("--demo-progress") || current.current.progress;
    const previous = { ...current.current, progress };
    seenChapter.current = state.chapter;
    if (prefersReducedMotion()) {
      if (outgoing) setOutgoing(null);
      if (leaving) setLeaving(false);
      if (arrive) setArrive(false);
    } else {
      setOutgoing(previous);
      setLeaving(false);
      setArrive(true);
    }
  }
  current.current = { chapter: state.chapter, phase: state.phase, sheet: state.sheet, light, feature: state.feature, progress: current.current.progress };
  useEffect(() => {
    if (!outgoing) return;
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
    <div
      ref={root}
      className={styles.demo}
      data-playing={state.playing || undefined}
      style={{ "--demo-transition": `${DEMO_TIMING.transitionMs}ms`, "--demo-lit": `${DEMO_TIMING.litMs}ms` } as CSSProperties}
    >
      <header className={styles.header}>
        <h2 className={`${styles.title} home-overview-title`} data-cover={chapter && !focused && chapter.sequence.length > 0 && !chapter.video ? "" : undefined} data-video={chapter?.video ? "" : undefined}>{title}</h2>
        <p className={styles.announce} aria-live="polite">{title}</p>
        <div className={styles.tools}>
          {focused && chapter?.pages && state.sheet > 0 ? (
            <button type="button" className={styles.control} aria-label={`Back to ${chapter.pages[state.sheet - 1].name}`} title={`Back to ${chapter.pages[state.sheet - 1].name}`} onClick={() => setSheet(state.sheet - 1)}>
              <svg viewBox="0 0 12 12" aria-hidden="true"><path d="M2.5 7.75 6 4.25l3.5 3.5" /></svg>
            </button>
          ) : (
          <PhaseToggle
            chapter={chapter?.title ?? null}
            focused={focused}
            single={chapter?.overviewOnly || chapter?.sequence.length === 0}
            forward={chapter?.pages?.[0]?.name ?? "Open the chapter"}
            back="Back to the steps"
            onToggle={() => (state.feature ? setFeature(null) : setPhase(focused ? "overview" : "focused"))}
          />
          )}
          {focused && chapter?.pages && state.sheet < chapter.pages.length - 1 ? (
            <button type="button" className={styles.control} aria-label={chapter.pages[state.sheet + 1].name} title={chapter.pages[state.sheet + 1].name} onClick={() => setSheet(state.sheet + 1)}>
              <svg viewBox="0 0 12 12" aria-hidden="true"><path d="M2.5 4.25 6 7.75l3.5-3.5" /></svg>
            </button>
          ) : null}
          <nav className={styles.nav} aria-label="Demo Workflow chapters">
          <button
            type="button"
            className={styles.navItem}
            aria-current={state.chapter == null ? "step" : undefined}
            onClick={() => select(null)}
          >
            Overview
          </button>
          {DEMO_CHAPTERS.map((item, index) => (
            <button
              key={item.id}
              type="button"
              className={item.video ? styles.navCircle : styles.navItem}
              aria-label={item.video ? item.title : `${item.index} ${item.title}`}
              title={item.title}
              aria-current={state.chapter === index ? "step" : undefined}
              onClick={() => select(index)}
            >
              {item.video ? null : <span className={styles.chapterIndex}>{item.index}</span>}
            </button>
          ))}
          </nav>
          <div className={styles.controls}>
            <DemoTransport playing={state.playing} onToggle={toggle} onRestart={restart} />
          </div>
        </div>
      </header>

      <div className={styles.stage}>
        <div className={styles.canvas}>
          <div
            key={state.chapter ?? "overview"}
            className={styles.stageFrame}
            data-arrive={arrive ? "" : undefined}
          >
            <StageView
              chapterIndex={state.chapter}
              phase={state.phase}
              sheet={state.sheet}
              light={light}
              feature={state.feature}
              coverEpoch={state.epoch}
              onPhase={setPhase}
              onOperation={selectOperation}
              onFeature={setFeature}
              onSelect={select}
            />
          </div>
          {outgoing ? (
            <div
              key={outgoing.chapter ?? "overview"}
              className={styles.stageFrame}
              data-leave={leaving ? "" : undefined}
              data-flat={outgoing.chapter != null && DEMO_CHAPTERS[outgoing.chapter]?.video ? "" : undefined}
              aria-hidden="true"
              style={{ "--demo-progress": outgoing.progress } as CSSProperties}
            >
              <StageView
                chapterIndex={outgoing.chapter}
                phase={outgoing.phase}
                sheet={outgoing.sheet}
                light={outgoing.light}
                feature={outgoing.feature}
                onPhase={setPhase}
                onOperation={selectOperation}
                onFeature={setFeature}
                onSelect={select}
              />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
