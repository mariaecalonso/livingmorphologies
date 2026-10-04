"use client";

import { createContext, useContext, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import type { DisplayMode } from "@/components/display-mode-toggle";

export const PRESENTATION_WIDTH = 7407;
export const PRESENTATION_HEIGHT = 2160;

const VIEW_MODE_KEY = "lm-view-mode";
const VIEW_MODE_EVENT = "lm-view-mode-change";
const ViewModeContext = createContext<DisplayMode>("desktop");

function subscribeViewMode(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(VIEW_MODE_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(VIEW_MODE_EVENT, onChange);
  };
}

function writeViewModeCookie(mode: DisplayMode) {
  document.cookie = `${VIEW_MODE_KEY}=${mode}; path=/; max-age=31536000; SameSite=Lax`;
}

function readViewMode(): DisplayMode {
  if (typeof window === "undefined") return "desktop";
  return window.localStorage.getItem(VIEW_MODE_KEY) === "presentation" ? "presentation" : "desktop";
}

export function ViewModeProvider({
  initialMode,
  children,
}: {
  initialMode: DisplayMode;
  children: ReactNode;
}) {
  const [mode, setMode] = useState<DisplayMode>("desktop");
  useEffect(() => {
    writeViewModeCookie("desktop");
    try {
      window.localStorage.setItem(VIEW_MODE_KEY, "desktop");
    } catch {
      /* ignore */
    }
    return subscribeViewMode(() => setMode(readViewMode()));
  }, [initialMode]);
  return <ViewModeContext.Provider value={mode}>{children}</ViewModeContext.Provider>;
}

function subscribeNever() {
  return () => {};
}

export function useViewMode(): DisplayMode {
  return useContext(ViewModeContext);
}

function readExportSheet() {
  return new URLSearchParams(window.location.search).get("export") === "1";
}

/** True inside any frame; the presentation canvas also carries `frame=1`. `export=1` renders that canvas directly for PDF export. */
export function useFramed(): { framed: boolean; presentationFrame: boolean } | null {
  const framed = useSyncExternalStore(subscribeNever, () => window.self !== window.top || readExportSheet(), () => null);
  const presentationFrame = useSyncExternalStore(
    subscribeNever,
    () => new URLSearchParams(window.location.search).get("frame") === "1" || readExportSheet(),
    () => null,
  );
  if (framed === null || presentationFrame === null) return null;
  return { framed, presentationFrame: framed && presentationFrame };
}

export function setViewMode(mode: DisplayMode, returnPath?: string) {
  window.localStorage.setItem(VIEW_MODE_KEY, mode);
  writeViewModeCookie(mode);
  window.dispatchEvent(new Event(VIEW_MODE_EVENT));
  if (returnPath && window.top && window.top !== window.self) window.top.location.assign(returnPath);
}

const MIN_ZOOM = 0.25;
const MAX_ZOOM = 6;
const clampZoom = (value: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value));

/** Scales the live page onto the ultra-wide canvas. No second document. */
export function PresentationFrame({ children }: { children: ReactNode }) {
  const stageRef = useRef<HTMLDivElement>(null);
  const fitRef = useRef(1);
  const zoomRef = useRef(1);
  const panRef = useRef({ x: 0, y: 0 });
  const dragRef = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);
  const [fit, setFit] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });

  const applyView = (nextZoom: number, nextPan: { x: number; y: number }) => {
    const clamped = clampZoom(nextZoom);
    zoomRef.current = clamped;
    panRef.current = nextPan;
    setZoom(clamped);
    setPan(nextPan);
  };

  const zoomAt = (factor: number, clientX: number, clientY: number) => {
    const stage = stageRef.current;
    if (!stage) return;
    const rect = stage.getBoundingClientRect();
    const px = clientX - rect.left - rect.width / 2;
    const py = clientY - rect.top - rect.height / 2;
    const prevZoom = zoomRef.current;
    const nextZoom = clampZoom(prevZoom * factor);
    const ratio = nextZoom / prevZoom;
    const prevPan = panRef.current;
    applyView(nextZoom, {
      x: px - (px - prevPan.x) * ratio,
      y: py - (py - prevPan.y) * ratio,
    });
  };

  useEffect(() => {
    const measure = () => {
      const next = Math.min(window.innerWidth / PRESENTATION_WIDTH, window.innerHeight / PRESENTATION_HEIGHT);
      fitRef.current = next;
      setFit(next);
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;

    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      zoomAt(event.deltaY < 0 ? 1.12 : 1 / 1.12, event.clientX, event.clientY);
    };
    const onKey = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey)) return;
      if (event.key === "=" || event.key === "+") {
        event.preventDefault();
        applyView(zoomRef.current * 1.25, panRef.current);
      } else if (event.key === "-" || event.key === "_") {
        event.preventDefault();
        applyView(zoomRef.current / 1.25, panRef.current);
      } else if (event.key === "0") {
        event.preventDefault();
        applyView(1, { x: 0, y: 0 });
      }
    };
    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0 && event.button !== 1) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("button, a, input, textarea, select, [role='button']")) return;
      dragRef.current = { x: event.clientX, y: event.clientY, panX: panRef.current.x, panY: panRef.current.y };
    };
    const onPointerMove = (event: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      if (Math.hypot(event.clientX - drag.x, event.clientY - drag.y) < 4 && event.buttons) return;
      if (!event.buttons) {
        dragRef.current = null;
        return;
      }
      applyView(zoomRef.current, {
        x: drag.panX + (event.clientX - drag.x),
        y: drag.panY + (event.clientY - drag.y),
      });
    };
    const onPointerUp = () => {
      dragRef.current = null;
    };

    stage.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("keydown", onKey);
    stage.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    return () => {
      stage.removeEventListener("wheel", onWheel);
      window.removeEventListener("keydown", onKey);
      stage.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };
  }, []);

  const scale = fit * zoom;

  return (
    <div ref={stageRef} className="presentation-stage">
      <div
        className="presentation-canvas"
        style={{
          width: PRESENTATION_WIDTH,
          height: PRESENTATION_HEIGHT,
          transform: `translate(calc(-50% + ${pan.x}px), calc(-50% + ${pan.y}px)) scale(${scale})`,
        }}
      >
        {children}
      </div>
      <div className="presentation-zoom">
        <button type="button" onClick={() => applyView(zoomRef.current / 1.25, panRef.current)} aria-label="Zoom out">
          −
        </button>
        <button type="button" onClick={() => applyView(1, { x: 0, y: 0 })} aria-label="Reset zoom">
          {Math.round(zoom * 100)}%
        </button>
        <button type="button" onClick={() => applyView(zoomRef.current * 1.25, panRef.current)} aria-label="Zoom in">
          +
        </button>
      </div>
    </div>
  );
}
