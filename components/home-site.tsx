"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import context from "@/data/skill5/herald-site.json";
import type { SiteContext } from "@/lib/skill5/site-model";
import { SiteViewport, type SiteFit, type SiteReadout, type SiteViewMode } from "@/components/site/site-viewport";

const site = context as SiteContext;

const MODES: { id: SiteViewMode; label: string }[] = [
  { id: "perspective", label: "Perspective" },
  { id: "plan", label: "Plan" },
  { id: "axon", label: "Axonometric" },
];

export function HomeSite() {
  const frameRef = useRef<HTMLDivElement>(null);
  const [live, setLive] = useState(false);
  const [mode, setMode] = useState<SiteViewMode>("perspective");
  const [showGrid, setShowGrid] = useState(true);
  const [fit, setFit] = useState<SiteFit>("site");
  const [frameToken, setFrameToken] = useState(0);
  const [readout, setReadout] = useState<SiteReadout>({ northDeg: 0, scaleFeet: 100, scalePx: 96 });
  const onReadout = useCallback((next: SiteReadout) => setReadout(next), []);

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    const observer = new IntersectionObserver(
      ([entry]) => setLive(!!entry?.isIntersecting),
      { rootMargin: "15% 0px", threshold: 0.15 },
    );
    observer.observe(frame);
    return () => observer.disconnect();
  }, []);

  const frameTo = (next: SiteFit) => {
    setFit(next);
    setFrameToken((value) => value + 1);
  };

  return (
    <div className="home-site">
      <div className="home-site-frame" ref={frameRef}>
        {live ? (
          <SiteViewport
            context={site}
            mode={mode}
            fit={fit}
            showGrid={showGrid}
            showAerial
            frameToken={frameToken}
            onReadout={onReadout}
          />
        ) : null}
        <div className="home-site-orient">
          <div className="home-site-north" style={{ transform: `rotate(${readout.northDeg}deg)` }} aria-label="Geographic north">
            <svg viewBox="0 0 48 64" aria-hidden="true">
              <path d="M24 2 L34 30 H27 V60 H21 V30 H14 Z" />
            </svg>
            <span>N</span>
          </div>
          <div className="home-site-scale" aria-label={`${readout.scaleFeet} foot scale`}>
            <span style={{ width: `${Math.max(36, readout.scalePx)}px` }} />
            <p>{readout.scaleFeet.toLocaleString("en-US")} ft</p>
          </div>
        </div>
      </div>
      <div className="home-site-bar">
        <p className="home-site-identity">
          {site.site.address}, {site.site.city}
        </p>
        <div className="home-site-controls" role="group" aria-label="Site view">
          {MODES.map((item) => (
            <button
              key={item.id}
              type="button"
              className={mode === item.id ? "is-current" : undefined}
              onClick={() => setMode(item.id)}
            >
              {item.label}
            </button>
          ))}
          <button type="button" onClick={() => frameTo("site")}>
            Fit site
          </button>
          <button type="button" onClick={() => frameTo("context")}>
            Fit context
          </button>
          <button
            type="button"
            className={showGrid ? "is-current" : undefined}
            aria-pressed={showGrid}
            onClick={() => setShowGrid((value) => !value)}
          >
            Grid
          </button>
        </div>
      </div>
    </div>
  );
}
