"use client";

import { useEffect, useRef, useState } from "react";

const PRESENT_MS = 9000;

export function markManualHold(board: HTMLElement) {
  delete board.dataset.heldFrame;
  board.dataset.manual = "1";
  board.dataset.hold = "1";
}

/** An automatic visit leaves from the frame exit. A manual visit continues where the light stopped. */
export function closeWorkflowPanel(board: HTMLElement | null) {
  if (!board) return;
  if (board.dataset.heldFrame && board.dataset.manual !== "1") board.dataset.release = "exit";
  else {
    delete board.dataset.hold;
    delete board.dataset.manual;
  }
}

/** Furthest frame the light has reached. Restart clears it. A backward pass does not. */
export function useRevealed(lit: number | null) {
  const [mark, setMark] = useState(-1);
  useEffect(() => {
    const board = document.querySelector<HTMLElement>(".wf-board");
    if (!board) return;
    const onRestart = () => setMark(-1);
    board.addEventListener("wf-restart", onRestart);
    return () => board.removeEventListener("wf-restart", onRestart);
  }, []);
  useEffect(() => {
    if (lit == null || !Number.isFinite(lit)) return;
    setMark((value) => Math.max(value, lit));
  }, [lit]);
  return mark;
}

export function usePresentClock(run: boolean, onDone: () => void) {
  const bar = useRef<HTMLElement>(null);
  const [paused, setPaused] = useState(false);
  const pausedRef = useRef(false);
  const doneRef = useRef(onDone);
  const spent = useRef(0);
  const budget = useRef(PRESENT_MS);
  const idleUntil = useRef(0);
  doneRef.current = onDone;
  pausedRef.current = paused;
  useEffect(() => {
    const board = document.querySelector<HTMLElement>(".wf-board");
    if (!board) return;
    const onRestart = () => doneRef.current();
    board.addEventListener("wf-restart", onRestart);
    return () => board.removeEventListener("wf-restart", onRestart);
  }, []);
  useEffect(() => {
    if (!run) return;
    spent.current = 0;
    budget.current = PRESENT_MS;
    let frame = 0;
    let last = performance.now();
    const loop = (now: number) => {
      const dt = Math.min(48, now - last);
      last = now;
      const board = bar.current?.closest<HTMLElement>(".wf-board");
      const held = pausedRef.current || board?.dataset.paused === "1";
      if (!held && now >= idleUntil.current) spent.current += dt;
      const amount = Math.min(1, spent.current / budget.current);
      bar.current?.style.setProperty("--progress", amount.toFixed(4));
      if (amount >= 1 && !held && now >= idleUntil.current) {
        doneRef.current();
        return;
      }
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [run]);
  return {
    bar,
    paused,
    toggle: () => setPaused((value) => !value),
    extend: () => {
      budget.current += PRESENT_MS;
    },
    hold: () => {
      idleUntil.current = performance.now() + 4000;
    },
  };
}

export function PresentationTransport() {
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    const board = document.querySelector<HTMLElement>(".wf-board");
    const sync = () => setPaused(board?.dataset.paused === "1");
    sync();
    if (!board) return;
    const watch = new MutationObserver(sync);
    watch.observe(board, { attributes: true, attributeFilter: ["data-paused"] });
    board.addEventListener("wf-transport", sync);
    return () => {
      watch.disconnect();
      board.removeEventListener("wf-transport", sync);
    };
  }, []);
  const pause = () => {
    const board = document.querySelector<HTMLElement>(".wf-board");
    if (!board) return;
    if (board.dataset.paused === "1") delete board.dataset.paused;
    else board.dataset.paused = "1";
    setPaused(board.dataset.paused === "1");
  };
  const restart = () => {
    const board = document.querySelector<HTMLElement>(".wf-board");
    if (!board) return;
    delete board.dataset.paused;
    board.dispatchEvent(new CustomEvent("wf-transport", { detail: { action: "restart" } }));
    board.dispatchEvent(new Event("wf-restart"));
    setPaused(false);
  };
  return (
    <div className="wf-proto-transport">
      <button type="button" aria-label={paused ? "Resume presentation" : "Pause presentation"} aria-pressed={paused} onClick={pause}>
        {paused ? (
          <svg viewBox="0 0 12 12" aria-hidden="true"><path d="M3 1.5v9l7-4.5z" /></svg>
        ) : (
          <svg viewBox="0 0 12 12" aria-hidden="true"><path d="M2.5 1.5h2.2v9H2.5zm4.8 0h2.2v9H7.3z" /></svg>
        )}
      </button>
      <button type="button" aria-label="Restart presentation" onClick={restart}>
        <svg viewBox="0 0 12 12" aria-hidden="true"><path d="M9.6 3.2A4.2 4.2 0 1 0 10.4 7" /><path d="M9.5 1.2v2.4H7.1" /></svg>
      </button>
    </div>
  );
}

/** Every expandable panel returns to the workflow that opened it. The name comes from that workflow. */
export function PresentControls({
  run,
  clock,
  onClose,
  open,
}: {
  run: boolean;
  clock: ReturnType<typeof usePresentClock>;
  onClose: () => void;
  open: boolean;
}) {
  const [backLabel, setBackLabel] = useState("Back");
  useEffect(() => {
    const name = document.querySelector(".wf-board")?.getAttribute("aria-label")?.trim();
    if (name) setBackLabel(`Back to ${name}`);
  }, [open]);
  return (
    <div className="wf-opt-present">
      <button type="button" className="wf-board-exit wf-opt-back" onClick={onClose} tabIndex={open ? 0 : -1}>
        <span aria-hidden="true">←</span> {backLabel}
      </button>
      <PresentationTransport />
      {run ? <i ref={clock.bar} className="wf-opt-present-line" aria-hidden="true" /> : null}
    </div>
  );
}
