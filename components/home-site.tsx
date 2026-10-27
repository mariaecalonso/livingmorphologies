"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import context from "@/data/skill5/herald-site.json";
import type { SitePlacementModel } from "@/components/site/module-field";
import { SiteViewport, type SiteFit, type SiteReadout, type SiteViewMode } from "@/components/site/site-viewport";
import type { IsoMesh } from "@/lib/scan/isomesh";
import { assemblyWorldModules } from "@/lib/skill5/assembly";
import type { SiteConfiguration } from "@/lib/skill5/configurations";
import { designSiteFromParcel } from "@/lib/skill5/design-site";
import { loadArchetypeMesh } from "@/lib/skill5/load-module";
import type { SiteContext } from "@/lib/skill5/site-model";

const site = context as SiteContext;
const design = designSiteFromParcel(site.site.ring);

function latestConfiguration(list: readonly SiteConfiguration[]) {
  return [...list].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0] ?? null;
}

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
  const [saved, setSaved] = useState<SiteConfiguration | null>(null);
  const [meshes, setMeshes] = useState<Record<string, IsoMesh>>({});
  const onReadout = useCallback((next: SiteReadout) => setReadout(next), []);
  const placed = useMemo(
    () => (saved ? [...saved.modules, ...saved.assemblies.flatMap((assembly) => assemblyWorldModules(assembly))] : []),
    [saved],
  );

  useEffect(() => {
    if (!live) return;
    const controller = new AbortController();
    const load = () => {
      fetch("/api/site/configurations", { signal: controller.signal })
        .then((response) => {
          if (!response.ok) throw new Error("The saved site configuration could not be read.");
          return response.json() as Promise<{ configurations?: SiteConfiguration[] }>;
        })
        .then((body) => {
          if (controller.signal.aborted) return;
          const next = latestConfiguration(body.configurations ?? []);
          setSaved((current) => (current && next && current.id === next.id && current.updatedAt === next.updatedAt ? current : next));
        })
        .catch(() => undefined);
    };
    load();
    const timer = window.setInterval(load, 5000);
    return () => {
      controller.abort();
      window.clearInterval(timer);
    };
  }, [live]);

  useEffect(() => {
    if (!live || placed.length === 0) return;
    const controller = new AbortController();
    const seen = new Set<string>();
    for (const item of placed) {
      const provenance = item.provenance;
      if (!provenance.moduleId || provenance.candidateId == null || !provenance.continuationId || seen.has(provenance.moduleId)) continue;
      seen.add(provenance.moduleId);
      loadArchetypeMesh({
        archetypeId: provenance.archetypeId,
        candidateId: provenance.candidateId,
        continuationId: provenance.continuationId,
        moduleId: provenance.moduleId,
      }, controller.signal)
        .then((mesh) => {
          if (controller.signal.aborted || !mesh) return;
          setMeshes((current) => (current[provenance.moduleId] ? current : { ...current, [provenance.moduleId]: mesh }));
        })
        .catch(() => undefined);
    }
    return () => controller.abort();
  }, [live, placed]);

  const placement = useMemo<SitePlacementModel | null>(() => {
    if (!saved) return null;
    const idle = () => undefined;
    return {
      ring: design.ring,
      armedModuleId: null,
      canPlace: false,
      meshes,
      instances: placed,
      selectedId: null,
      snap: true,
      showEnvelope: false,
      display: "original",
      displayShift: {},
      links: [],
      previewParts: null,
      previewBridge: null,
      demonstration: [],
      tool: "move",
      warnings: {},
      annotations: [],
      onPlace: idle,
      onAnnotate: idle,
      onSelect: idle,
      onTranslate: idle,
      onRotate: idle,
      onGestureStart: idle,
      onGestureEnd: idle,
      memberEditId: null,
      viewMode: mode,
    };
  }, [meshes, mode, placed, saved]);

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
            showAerial={false}
            frameToken={frameToken}
            placement={placement}
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
