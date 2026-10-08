"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { DisplayMode } from "@/components/display-mode-toggle";

export const PRESENTATION_WIDTH = 7407;
export const PRESENTATION_HEIGHT = 2160;

const VIEW_MODE_KEY = "lm-view-mode";
const VIEW_MODE_EVENT = "lm-view-mode-change";

function subscribeViewMode(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(VIEW_MODE_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(VIEW_MODE_EVENT, onChange);
  };
}

function readViewMode(): DisplayMode {
  return window.localStorage.getItem(VIEW_MODE_KEY) === "presentation" ? "presentation" : "desktop";
}

const subscribeNever = () => () => {};

/** Null until the client has read the stored mode. */
export function useViewMode(): DisplayMode | null {
  return useSyncExternalStore(subscribeViewMode, readViewMode, () => null);
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
  window.dispatchEvent(new Event(VIEW_MODE_EVENT));
  if (returnPath && window.top && window.top !== window.self) window.top.location.assign(returnPath);
}

const ZOOM_MIN = 0.5;
const ZOOM_MAX = 8;
const ZOOM_STEP = 1.25;

function fittedScale() {
  return Math.min(window.innerWidth / PRESENTATION_WIDTH, window.innerHeight / PRESENTATION_HEIGHT);
}

function clampZoom(zoom: number) {
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoom));
}

function clampPan(pan: { x: number; y: number }, scale: number) {
  const maxX = Math.max(0, (PRESENTATION_WIDTH * scale - window.innerWidth) / 2);
  const maxY = Math.max(0, (PRESENTATION_HEIGHT * scale - window.innerHeight) / 2);
  return {
    x: Math.min(maxX, Math.max(-maxX, pan.x)),
    y: Math.min(maxY, Math.max(-maxY, pan.y)),
  };
}

/** Renders the current route on the ultra-wide canvas, fitted to the window. */
export function PresentationFrame() {
  const pathname = usePathname();
  const skill4 = pathname.startsWith("/hybrid");
  const [src] = useState(() => `${pathname}?wall=1&frame=1${window.location.hash}`);
  const [scale, setScale] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const frameRef = useRef<HTMLIFrameElement>(null);
  const viewRef = useRef({ fit: 1, zoom: 1, pan: { x: 0, y: 0 } });
  viewRef.current = { fit: scale, zoom: skill4 ? zoom : 1, pan: skill4 ? pan : { x: 0, y: 0 } };

  useEffect(() => {
    const fit = () => {
      const next = fittedScale();
      setScale(next);
      if (!skill4) return;
      setPan((current) => clampPan(current, next * viewRef.current.zoom));
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [skill4]);

  useEffect(() => {
    if (!skill4) return;
    const iframe = frameRef.current;
    if (!iframe) return;
    let space = false;
    let drag: { x: number; y: number } | null = null;

    const applyZoom = (nextZoom: number, cursorX: number, cursorY: number) => {
      const { fit, zoom: currentZoom, pan: currentPan } = viewRef.current;
      const current = fit * currentZoom;
      const zoomTo = clampZoom(nextZoom);
      const next = fit * zoomTo;
      if (current <= 0) return;
      const originX = window.innerWidth / 2 + currentPan.x;
      const originY = window.innerHeight / 2 + currentPan.y;
      const localX = (cursorX - originX) / current;
      const localY = (cursorY - originY) / current;
      const nextPan = clampPan(
        {
          x: cursorX - localX * next - window.innerWidth / 2,
          y: cursorY - localY * next - window.innerHeight / 2,
        },
        next,
      );
      viewRef.current = { fit, zoom: zoomTo, pan: nextPan };
      setZoom(zoomTo);
      setPan(nextPan);
    };

    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const frame = frameRef.current?.getBoundingClientRect();
      const width = event.view?.innerWidth || PRESENTATION_WIDTH;
      const height = event.view?.innerHeight || PRESENTATION_HEIGHT;
      const cursorX = frame ? frame.left + (event.clientX / width) * frame.width : window.innerWidth / 2;
      const cursorY = frame ? frame.top + (event.clientY / height) * frame.height : window.innerHeight / 2;
      const factor = Math.exp(-event.deltaY * 0.0015);
      applyZoom(viewRef.current.zoom * factor, cursorX, cursorY);
    };

    const onKey = (event: KeyboardEvent) => {
      if (event.code === "Space") space = event.type === "keydown";
    };

    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 1 && !event.altKey && !space) return;
      event.preventDefault();
      event.stopPropagation();
      drag = { x: event.screenX, y: event.screenY };
    };

    const onPointerMove = (event: PointerEvent) => {
      if (!drag) return;
      const dx = event.screenX - drag.x;
      const dy = event.screenY - drag.y;
      drag = { x: event.screenX, y: event.screenY };
      const { fit, zoom: currentZoom, pan: currentPan } = viewRef.current;
      const nextPan = clampPan({ x: currentPan.x + dx, y: currentPan.y + dy }, fit * currentZoom);
      viewRef.current = { fit, zoom: currentZoom, pan: nextPan };
      setPan(nextPan);
    };

    const endDrag = () => {
      drag = null;
    };

    const bind = () => {
      unbind();
      const child = iframe.contentWindow;
      if (!child) return;
      child.addEventListener("wheel", onWheel, { passive: false });
      child.addEventListener("keydown", onKey);
      child.addEventListener("keyup", onKey);
      child.addEventListener("pointerdown", onPointerDown, true);
      child.addEventListener("pointermove", onPointerMove);
      child.addEventListener("pointerup", endDrag);
      child.addEventListener("pointercancel", endDrag);
    };
    const unbind = () => {
      const child = iframe.contentWindow;
      if (!child) return;
      child.removeEventListener("wheel", onWheel);
      child.removeEventListener("keydown", onKey);
      child.removeEventListener("keyup", onKey);
      child.removeEventListener("pointerdown", onPointerDown, true);
      child.removeEventListener("pointermove", onPointerMove);
      child.removeEventListener("pointerup", endDrag);
      child.removeEventListener("pointercancel", endDrag);
    };

    iframe.addEventListener("load", bind);
    bind();
    return () => {
      iframe.removeEventListener("load", bind);
      unbind();
    };
  }, [skill4]);

  const shown = skill4 ? scale * zoom : scale;
  const fitted = !skill4 || (zoom === 1 && pan.x === 0 && pan.y === 0);
  const transform = fitted
    ? `translate(-50%, -50%) scale(${shown})`
    : `translate(calc(-50% + ${pan.x}px), calc(-50% + ${pan.y}px)) scale(${shown})`;

  return (
    <div className="presentation-stage">
      <iframe
        ref={frameRef}
        src={src}
        title="Living Morphologies presentation canvas"
        className="presentation-canvas"
        style={{
          width: PRESENTATION_WIDTH,
          height: PRESENTATION_HEIGHT,
          transform,
        }}
      />
      {skill4 ? (
        <div className="presentation-zoom">
          <button type="button" onClick={() => applyButtonZoom(viewRef, setZoom, setPan, 1 / ZOOM_STEP)}>Zoom Out</button>
          <button type="button" onClick={() => applyButtonZoom(viewRef, setZoom, setPan, ZOOM_STEP)}>Zoom In</button>
          <button
            type="button"
            onClick={() => {
              viewRef.current = { ...viewRef.current, zoom: 1, pan: { x: 0, y: 0 } };
              setZoom(1);
              setPan({ x: 0, y: 0 });
            }}
          >
            Reset
          </button>
        </div>
      ) : null}
    </div>
  );
}

function applyButtonZoom(
  viewRef: { current: { fit: number; zoom: number; pan: { x: number; y: number } } },
  setZoom: (zoom: number) => void,
  setPan: (pan: { x: number; y: number }) => void,
  factor: number,
) {
  const { fit, zoom, pan } = viewRef.current;
  const current = fit * zoom;
  const zoomTo = clampZoom(zoom * factor);
  const next = fit * zoomTo;
  const ratio = current > 0 ? next / current : 1;
  const nextPan = clampPan({ x: pan.x * ratio, y: pan.y * ratio }, next);
  viewRef.current = { fit, zoom: zoomTo, pan: nextPan };
  setZoom(zoomTo);
  setPan(nextPan);
}
