"use client";

import { useEffect, useRef } from "react";

export type ExplainDraw = (ctx: CanvasRenderingContext2D, time: number, width: number, height: number) => void;

function demoNode(node: HTMLElement | null) {
  let current = node;
  while (current) {
    if (current.style.getPropertyValue("--demo-transition")) return current;
    current = current.parentElement;
  }
  return null;
}

function advance(node: HTMLElement | null, reduced: boolean, time: number, dt: number, duration: number, loop: boolean) {
  const transport = Boolean(node?.hasAttribute("data-playing"));
  if (node && transport) node.dataset.explainRan = "1";
  const held = Boolean(node && node.dataset.explainRan === "1" && !transport);
  if (reduced || held) return time;
  const next = time + dt;
  if (next < duration) return next;
  return loop ? next - duration : duration;
}

/** A presentation clock. It holds while the demo is paused and shows the finished frame when motion is reduced. */
export function useExplainFrame(draw: ExplainDraw, duration: number) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let frame = 0;
    let last = performance.now();
    let time = reduced ? Math.max(0, duration - 0.05) : 0;

    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      time = advance(demoNode(canvas), reduced, time, dt, duration, true);
      const bounds = canvas.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const width = Math.max(1, bounds.width);
      const height = Math.max(1, bounds.height);
      const bufferW = Math.round(width * dpr);
      const bufferH = Math.round(height * dpr);
      if (canvas.width !== bufferW || canvas.height !== bufferH) {
        canvas.width = bufferW;
        canvas.height = bufferH;
      }
      const ctx = canvas.getContext("2d");
      if (ctx && width > 2 && height > 2) {
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, width, height);
        draw(ctx, time, width, height);
      }
      frame = window.requestAnimationFrame(tick);
    };

    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, [draw, duration]);

  return ref;
}

/** The same clock for a DOM replay. It stays on the last frame instead of looping. */
export function useExplainTime(duration: number, onTime: (time: number, node: HTMLElement) => void) {
  const ref = useRef<HTMLElement>(null);
  const onTimeRef = useRef(onTime);

  useEffect(() => {
    onTimeRef.current = onTime;
  });

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let frame = 0;
    let last = performance.now();
    let time = reduced ? duration : 0;

    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      time = advance(demoNode(node), reduced, time, dt, duration, false);
      onTimeRef.current(time, node);
      frame = window.requestAnimationFrame(tick);
    };

    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, [duration]);

  return ref;
}

export function ramp(time: number, start: number, end: number) {
  if (time <= start) return 0;
  if (time >= end) return 1;
  const t = (time - start) / (end - start);
  return t * t * (3 - 2 * t);
}

export function phaseOn(time: number, start: number) {
  return time >= start ? 1 : 0;
}
