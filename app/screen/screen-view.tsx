"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { PRESENTATION_HEIGHT as SCREEN_HEIGHT, PRESENTATION_WIDTH as SCREEN_WIDTH } from "@/components/view-mode";

const MIN_ZOOM = 0.25;
const MAX_ZOOM = 6;

function clampZoom(value: number) {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value));
}

export default function ScreenView() {
  const viewportRef = useRef<HTMLElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const fitScaleRef = useRef(1);
  const zoomRef = useRef(1);
  const panRef = useRef({ x: 0, y: 0 });
  const [fitScale, setFitScale] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [frameSrc, setFrameSrc] = useState("/physarum?wall=1");

  const applyView = (nextZoom: number, nextPan: { x: number; y: number }) => {
    const clamped = clampZoom(nextZoom);
    zoomRef.current = clamped;
    panRef.current = nextPan;
    setZoom(clamped);
    setPan(nextPan);
  };

  const zoomAt = (factor: number, clientX: number, clientY: number) => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const rect = viewport.getBoundingClientRect();
    const px = clientX - rect.left - rect.width / 2;
    const py = clientY - rect.top - rect.height / 2;
    const prevZoom = zoomRef.current;
    const nextZoom = clampZoom(prevZoom * factor);
    const ratio = (fitScaleRef.current * nextZoom) / (fitScaleRef.current * prevZoom);
    const prevPan = panRef.current;
    applyView(nextZoom, {
      x: px - (px - prevPan.x) * ratio,
      y: py - (py - prevPan.y) * ratio,
    });
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("all") === "1" || params.get("runs") === "1") {
      const fresh = params.get("fresh") === "1" ? "&fresh=1" : "";
      setFrameSrc(`/physarum/runs?wall=1&all=1${fresh}`);
    }
  }, []);

  useEffect(() => {
    const fit = () => {
      const nextFit = Math.min(
        window.innerWidth / SCREEN_WIDTH,
        window.innerHeight / SCREEN_HEIGHT,
      );
      fitScaleRef.current = nextFit;
      setFitScale(nextFit);
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const factor = event.deltaY < 0 ? 1.12 : 1 / 1.12;
      zoomAt(factor, event.clientX, event.clientY);
    };

    viewport.addEventListener("wheel", onWheel, { passive: false });
    return () => viewport.removeEventListener("wheel", onWheel);
  }, []);

  useEffect(() => {
    const frame = iframeRef.current;
    if (!frame) return;

    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const iframeRect = frame.getBoundingClientRect();
      const parentX = iframeRect.left + (event.clientX / SCREEN_WIDTH) * iframeRect.width;
      const parentY = iframeRect.top + (event.clientY / SCREEN_HEIGHT) * iframeRect.height;
      const factor = event.deltaY < 0 ? 1.12 : 1 / 1.12;
      zoomAt(factor, parentX, parentY);
    };

    const attach = () => {
      frame.contentWindow?.addEventListener("wheel", onWheel, { passive: false });
    };
    const detach = () => {
      frame.contentWindow?.removeEventListener("wheel", onWheel);
    };

    frame.addEventListener("load", attach);
    attach();
    return () => {
      frame.removeEventListener("load", attach);
      detach();
    };
  }, []);

  const scale = fitScale * zoom;

  return (
    <main
      ref={viewportRef}
      style={{
        width: "100vw",
        height: "100dvh",
        overflow: "hidden",
        background: "#000000",
        position: "relative",
      }}
    >
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: "50%",
          width: SCREEN_WIDTH,
          height: SCREEN_HEIGHT,
          transform: `translate(calc(-50% + ${pan.x}px), calc(-50% + ${pan.y}px)) scale(${scale})`,
        }}
      >
        <iframe
          ref={iframeRef}
          src={frameSrc}
          title="Living Morphologies 7407 by 2160"
          style={{
            width: SCREEN_WIDTH,
            height: SCREEN_HEIGHT,
            border: 0,
            display: "block",
          }}
        />
      </div>
      <div
        style={{
          position: "fixed",
          right: 16,
          bottom: 16,
          zIndex: 20,
          display: "flex",
          gap: 6,
        }}
      >
        <button type="button" onClick={() => applyView(zoomRef.current / 1.25, panRef.current)} style={controlStyle}>
          −
        </button>
        <button type="button" onClick={() => applyView(1, { x: 0, y: 0 })} style={controlStyle}>
          {Math.round(zoom * 100)}%
        </button>
        <button type="button" onClick={() => applyView(zoomRef.current * 1.25, panRef.current)} style={controlStyle}>
          +
        </button>
      </div>
    </main>
  );
}

const controlStyle: CSSProperties = {
  minWidth: 42,
  height: 36,
  border: "1px solid rgba(242, 242, 238, 0.28)",
  background: "rgba(8, 8, 8, 0.92)",
  color: "#f2f2ee",
  fontSize: 14,
  letterSpacing: "0.08em",
  cursor: "pointer",
};
