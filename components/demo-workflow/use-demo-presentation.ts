"use client";

import { useCallback, useEffect, useReducer, useRef } from "react";
import { DEMO_CHAPTERS, DEMO_TIMING } from "@/lib/demo-workflow/chapters";

export type DemoPhase = "overview" | "focused";

/** `chapter: null` is the Full Process Overview. `sheet` is the open page of a chapter that has `pages`. */
export type DemoPosition = { chapter: number | null; phase: DemoPhase; sheet: number };

/**
 * `operation` is where the light sits in the chapter (on the Full Process Overview, which chapter), or null before it starts.
 * `reached` is the furthest operation the light has passed, so passed operations stay bright.
 * `feature` is a chapter's hand-opened demonstration; it is only open while paused.
 */
type DemoState = DemoPosition & { playing: boolean; epoch: number; operation: number | null; reached: number; feature: boolean };

type DemoAction =
  | { type: "toggle" }
  | { type: "restart" }
  | { type: "select"; chapter: number | null }
  | { type: "phase"; phase: DemoPhase }
  | { type: "sheet"; sheet: number }
  | { type: "operation"; operation: number }
  | { type: "feature"; open: boolean }
  | { type: "advance" };

const LAST = DEMO_CHAPTERS.length - 1;
const UNLIT = { operation: null, reached: -1, feature: false } as const;

function openingPhase(): DemoPhase {
  return "overview";
}

function nextPosition(position: DemoPosition): DemoPosition | null {
  if (position.chapter == null) return { chapter: 0, phase: openingPhase(), sheet: 0 };
  const current = DEMO_CHAPTERS[position.chapter];
  const pages = current?.pages;
  if (position.phase === "overview" && !current?.overviewOnly && (current?.sequence.length ?? 0) > 0) {
    return { chapter: position.chapter, phase: "focused", sheet: 0 };
  }
  if (pages && position.phase === "focused" && position.sheet < pages.length - 1) {
    return { chapter: position.chapter, phase: "focused", sheet: position.sheet + 1 };
  }
  if (position.chapter < LAST) return { chapter: position.chapter + 1, phase: openingPhase(), sheet: 0 };
  return null;
}

function reduce(state: DemoState, action: DemoAction): DemoState {
  switch (action.type) {
    case "toggle": {
      if (state.playing) return { ...state, playing: false };
      const ended = state.chapter === LAST && (state.phase === "focused" || DEMO_CHAPTERS[LAST]?.overviewOnly === true);
      return ended ? { chapter: null, phase: "overview", sheet: 0, playing: true, epoch: state.epoch + 1, ...UNLIT } : { ...state, playing: true, feature: false };
    }
    case "restart":
      return { ...state, phase: state.chapter == null ? "overview" : openingPhase(), sheet: 0, epoch: state.epoch + 1, ...UNLIT };
    case "select":
      return { ...state, chapter: action.chapter, phase: action.chapter == null ? "overview" : openingPhase(), sheet: 0, epoch: state.epoch + 1, ...UNLIT };
    case "phase": {
      const current = state.chapter == null ? undefined : DEMO_CHAPTERS[state.chapter];
      if (state.chapter == null || state.phase === action.phase || current?.overviewOnly || current?.sequence.length === 0) return state;
      return {
        ...state,
        phase: action.phase,
        sheet: 0,
        epoch: state.epoch + 1,
        operation: null,
        reached: current?.pages ? -1 : state.reached,
        feature: false,
      };
    }
    case "sheet": {
      const pages = state.chapter == null ? undefined : DEMO_CHAPTERS[state.chapter]?.pages;
      if (!pages || action.sheet === state.sheet || action.sheet < 0 || action.sheet >= pages.length) return state;
      return { ...state, sheet: action.sheet, phase: "focused", epoch: state.epoch + 1, operation: null, reached: -1, feature: false };
    }
    case "operation":
      if (state.operation === action.operation) return state;
      return { ...state, operation: action.operation, reached: Math.max(state.reached, action.operation) };
    case "feature":
      if (state.chapter == null) return state;
      if (state.phase !== "focused" && !DEMO_CHAPTERS[state.chapter]?.overviewOnly && !DEMO_CHAPTERS[state.chapter]?.pages) return state;
      return action.open ? { ...state, feature: true, playing: false } : { ...state, feature: false };
    case "advance": {
      const next = nextPosition(state);
      if (!next) return { ...state, playing: false };
      const sameChapter = next.chapter === state.chapter;
      const resetLight = !sameChapter || Boolean(DEMO_CHAPTERS[state.chapter ?? -1]?.pages);
      return { ...state, ...next, epoch: state.epoch + 1, operation: null, reached: resetLight ? -1 : state.reached, feature: false };
    }
  }
}

export function stepDuration(position: DemoPosition) {
  if (position.chapter == null) return DEMO_TIMING.processOverviewMs;
  if (DEMO_CHAPTERS[position.chapter]?.video) return DEMO_TIMING.videoMs;
  if (position.phase === "overview") return DEMO_TIMING.chapterOverviewMs;
  const page = DEMO_CHAPTERS[position.chapter]?.pages?.[position.sheet];
  if (page) return page.holdMs ?? DEMO_TIMING.chapterFocusedMs;
  return DEMO_TIMING.chapterFocusedMs;
}

/** The Full Process Overview's operations are its chapters. A chapter's step row uses its sequence; a page uses that page. */
function operationCount(chapter: number | null, phase: DemoPhase, sheet: number) {
  if (chapter == null) return DEMO_CHAPTERS.filter((item) => !item.video).length;
  if (phase === "overview") return DEMO_CHAPTERS[chapter].sequence.length;
  const pages = DEMO_CHAPTERS[chapter].pages;
  if (pages) return pages[sheet]?.sequence.length ?? 0;
  return DEMO_CHAPTERS[chapter].sequence.length;
}

/**
 * One state for playback and manual navigation.
 * `root` receives the current step's progress as `--demo-progress` without re-rendering.
 * The light crosses the step's operations once, so each one is lit for an equal share.
 */
export function useDemoPresentation() {
  const [state, dispatch] = useReducer(reduce, { chapter: null, phase: "overview", sheet: 0, playing: false, epoch: 0, ...UNLIT });
  const feature = state.feature;
  useEffect(() => {
    if (!feature) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") dispatch({ type: "feature", open: false });
    };
    const back = () => dispatch({ type: "feature", open: false });
    window.addEventListener("keydown", close);
    window.addEventListener("demo-feature-close", back);
    return () => {
      window.removeEventListener("keydown", close);
      window.removeEventListener("demo-feature-close", back);
    };
  }, [feature]);
  const root = useRef<HTMLDivElement>(null);
  const elapsed = useRef(0);

  useEffect(() => {
    elapsed.current = 0;
    root.current?.style.setProperty("--demo-progress", "0");
  }, [state.epoch]);

  useEffect(() => {
    if (!state.playing) return;
    const duration = stepDuration(state);
    const count = operationCount(state.chapter, state.phase, state.sheet);
    let frame = 0;
    let last = performance.now();
    const tick = (now: number) => {
      elapsed.current += Math.min(48, now - last);
      last = now;
      const amount = Math.min(1, elapsed.current / duration);
      root.current?.style.setProperty("--demo-progress", amount.toFixed(4));
      if (amount >= 1) {
        dispatch({ type: "advance" });
        return;
      }
      if (count > 0) {
        const operation = Math.min(count - 1, Math.floor(amount * count));
        if (operation !== state.operation) dispatch({ type: "operation", operation });
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [state]);

  const selectOperation = useCallback(
    (operation: number) => {
      const count = operationCount(state.chapter, state.phase, state.sheet);
      if (count === 0) return;
      const amount = (operation + 0.5) / count;
      elapsed.current = amount * stepDuration(state);
      root.current?.style.setProperty("--demo-progress", amount.toFixed(4));
      dispatch({ type: "operation", operation });
    },
    [state],
  );

  /** Opening a demonstration lights its operation and pauses there; `null` closes it. */
  const setFeature = useCallback(
    (operation: number | null) => {
      if (operation == null) {
        dispatch({ type: "feature", open: false });
        return;
      }
      selectOperation(operation);
      dispatch({ type: "feature", open: true });
    },
    [selectOperation],
  );

  return {
    state,
    root,
    toggle: useCallback(() => dispatch({ type: "toggle" }), []),
    restart: useCallback(() => dispatch({ type: "restart" }), []),
    select: useCallback((chapter: number | null) => dispatch({ type: "select", chapter }), []),
    setPhase: useCallback((phase: DemoPhase) => dispatch({ type: "phase", phase }), []),
    setSheet: useCallback((sheet: number) => dispatch({ type: "sheet", sheet }), []),
    selectOperation,
    setFeature,
  };
}
