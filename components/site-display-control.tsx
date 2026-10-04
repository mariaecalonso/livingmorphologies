"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

type SiteDisplay = "laptop" | "classroom";

const STORAGE_KEY = "lm-site-display";
const MIN_ZOOM = 0.4;
const MAX_ZOOM = 4;
const INTERACTIVE = "a, button, input, textarea, select, label, summary, [contenteditable='true']";

type View = { scale: number; x: number; y: number };
type PinchEvent = Event & { scale: number; clientX: number; clientY: number };

const IDENTITY: View = { scale: 1, x: 0, y: 0 };

function clampZoom(value: number) {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value));
}

function isInteractive(target: EventTarget | null) {
  return target instanceof Element && Boolean(target.closest(INTERACTIVE));
}

/**
 * Editor viewport only. Scale and pan live on the canvas transform and are
 * never written into layout, stored positions, or the classroom frame size.
 */
function applyView(canvas: HTMLElement, view: View, resetButton: HTMLButtonElement | null) {
  const identity = view.scale === 1 && view.x === 0 && view.y === 0;
  canvas.style.transform = identity ? "" : `translate(${view.x}px, ${view.y}px) scale(${view.scale})`;
  if (resetButton) {
    if (identity) resetButton.removeAttribute("data-active");
    else resetButton.dataset.active = "true";
  }
}

function zoomAt(canvas: HTMLElement, view: View, clientX: number, clientY: number, nextScale: number) {
  const next = clampZoom(nextScale);
  const rect = canvas.getBoundingClientRect();
  if (view.scale <= 0 || rect.width < 1 || rect.height < 1) return;
  const px = clientX - rect.left;
  const py = clientY - rect.top;
  view.x += px * (1 - next / view.scale);
  view.y += py * (1 - next / view.scale);
  view.scale = next;
}

export function SiteDisplayControl() {
  const pathname = usePathname();
  const [mode, setMode] = useState<SiteDisplay>("laptop");
  const [editing, setEditing] = useState(false);
  const viewRef = useRef<View>({ ...IDENTITY });
  const resetRef = useRef<HTMLButtonElement>(null);
  const onLab = pathname.startsWith("/lab");
  const classroom = !onLab && mode === "classroom";
  const editActive = classroom && editing;

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === "classroom" || stored === "laptop") setMode(stored);
  }, []);

  useEffect(() => {
    const shell = document.querySelector<HTMLElement>(".site-shell");
    if (!shell) return;
    if (onLab) {
      shell.removeAttribute("data-site-display");
      return;
    }
    shell.dataset.siteDisplay = mode;
  }, [mode, onLab]);

  useEffect(() => {
    if (!classroom) setEditing(false);
  }, [classroom]);

  useEffect(() => {
    const shell = document.querySelector<HTMLElement>(".site-shell");
    const canvas = shell?.querySelector<HTMLElement>(":scope > .site-edit-canvas");
    if (!shell || !canvas) return;

    const clear = () => {
      const kept = shell.scrollTop;
      shell.removeAttribute("data-site-edit");
      shell.removeAttribute("data-panning");
      canvas.style.transform = "";
      viewRef.current = { ...IDENTITY };
      resetRef.current?.removeAttribute("data-active");
      shell.scrollTop = kept;
    };

    if (!editActive) {
      clear();
      return;
    }

    const kept = shell.scrollTop;
    shell.dataset.siteEdit = "on";
    shell.scrollTop = kept;
    const hold = window.requestAnimationFrame(() => {
      shell.scrollTop = kept;
    });

    let drag: { id: number; x: number; y: number; ox: number; oy: number } | null = null;
    let pinchBase = viewRef.current.scale;
    let gesturing = false;

    const paint = () => applyView(canvas, viewRef.current, resetRef.current);

    const onWheel = (event: WheelEvent) => {
      if (!shell.contains(event.target as Node)) return;
      event.preventDefault();
      if (event.ctrlKey && gesturing) return;
      const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? window.innerHeight : 1;
      const view = viewRef.current;
      zoomAt(canvas, view, event.clientX, event.clientY, view.scale * Math.exp(-event.deltaY * unit * 0.0015));
      paint();
    };

    const onGestureStart = (event: Event) => {
      if (!shell.contains(event.target as Node)) return;
      event.preventDefault();
      gesturing = true;
      pinchBase = viewRef.current.scale;
    };

    const onGestureChange = (event: Event) => {
      if (!shell.contains(event.target as Node)) return;
      event.preventDefault();
      const pinch = event as PinchEvent;
      zoomAt(canvas, viewRef.current, pinch.clientX, pinch.clientY, pinchBase * pinch.scale);
      paint();
    };

    const onGestureEnd = (event: Event) => {
      if (!shell.contains(event.target as Node)) return;
      event.preventDefault();
      gesturing = false;
    };

    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0 && event.button !== 1) return;
      if (!shell.contains(event.target as Node)) return;
      if (event.button === 0 && isInteractive(event.target)) return;
      event.preventDefault();
      drag = { id: event.pointerId, x: event.clientX, y: event.clientY, ox: viewRef.current.x, oy: viewRef.current.y };
      try {
        shell.setPointerCapture(event.pointerId);
      } catch {
        // Synthetic or already-released pointers can reject capture. Drag still tracks the shell.
      }
      shell.dataset.panning = "on";
    };

    const onPointerMove = (event: PointerEvent) => {
      if (!drag || drag.id !== event.pointerId) return;
      viewRef.current.x = drag.ox + (event.clientX - drag.x);
      viewRef.current.y = drag.oy + (event.clientY - drag.y);
      paint();
    };

    const endPan = (event: PointerEvent) => {
      if (!drag || drag.id !== event.pointerId) return;
      drag = null;
      shell.removeAttribute("data-panning");
    };

    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
      setEditing(false);
    };

    window.addEventListener("wheel", onWheel, { capture: true, passive: false });
    shell.addEventListener("pointerdown", onPointerDown);
    shell.addEventListener("pointermove", onPointerMove);
    shell.addEventListener("pointerup", endPan);
    shell.addEventListener("pointercancel", endPan);
    shell.addEventListener("gesturestart", onGestureStart);
    shell.addEventListener("gesturechange", onGestureChange);
    shell.addEventListener("gestureend", onGestureEnd);
    window.addEventListener("keydown", onKey);
    paint();

    return () => {
      window.cancelAnimationFrame(hold);
      window.removeEventListener("wheel", onWheel, { capture: true });
      shell.removeEventListener("pointerdown", onPointerDown);
      shell.removeEventListener("pointermove", onPointerMove);
      shell.removeEventListener("pointerup", endPan);
      shell.removeEventListener("pointercancel", endPan);
      shell.removeEventListener("gesturestart", onGestureStart);
      shell.removeEventListener("gesturechange", onGestureChange);
      shell.removeEventListener("gestureend", onGestureEnd);
      window.removeEventListener("keydown", onKey);
      shell.removeAttribute("data-panning");
    };
  }, [editActive]);

  if (onLab) return null;

  const next = mode === "laptop" ? "classroom" : "laptop";
  const label = mode === "laptop" ? "Laptop" : "Classroom";

  return (
    <div className="site-display-tools">
      {editActive ? (
        <button
          ref={resetRef}
          type="button"
          className="site-edit-reset"
          title="Reset view to 100%"
          aria-label="Reset classroom view to 100%"
          onClick={() => {
            viewRef.current.scale = 1;
            viewRef.current.x = 0;
            viewRef.current.y = 0;
            const canvas = document.querySelector<HTMLElement>(".site-shell > .site-edit-canvas");
            if (canvas) applyView(canvas, viewRef.current, resetRef.current);
          }}
        >
          100%
        </button>
      ) : null}
      {classroom ? (
        <button
          type="button"
          className="site-edit-toggle"
          aria-pressed={editing}
          aria-label={editing ? "Exit classroom edit mode" : "Edit classroom canvas"}
          onClick={() => setEditing((value) => !value)}
        >
          Edit
        </button>
      ) : null}
      <button
        type="button"
        className="site-display-control"
        aria-pressed={mode === "classroom"}
        aria-label={`${label} resolution. Switch to ${next} resolution`}
        onClick={() => {
          const following = mode === "laptop" ? "classroom" : "laptop";
          setMode(following);
          window.localStorage.setItem(STORAGE_KEY, following);
        }}
      >
        {mode === "laptop" ? (
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <rect x="5" y="5" width="14" height="10" rx="1" fill="none" stroke="currentColor" strokeWidth="1.2" />
            <path d="M3 18.5h18" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <rect x="2" y="6" width="20" height="11" rx="1" fill="none" stroke="currentColor" strokeWidth="1.2" />
            <path d="M9 20h6" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
          </svg>
        )}
      </button>
    </div>
  );
}
