"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import "@/app/lab/hybrid/skill4-interface.css";
import exampleJson from "@/data/skill4/s04-test12-006.json";
import { HybridAssembly, type HybridLabFrame } from "@/components/hybrid/hybrid-assembly";
import { HybridState, useHybrid } from "@/components/hybrid/hybrid-state";
import { ModuleGlassPreview, clayPreviewRadius } from "@/components/site/site-workspace";
import type { CatalogEntry } from "@/lib/skill4/catalog";
import { loadSkill4Handoff } from "@/lib/skill4/handoff-client";
import { resolveTileModule } from "@/lib/skill4/tiles";
import { SITE_ARCHETYPES, SITE_PROGRAMS } from "@/lib/skill5/catalog";
import { loadArchetypeMesh } from "@/lib/skill5/load-module";
import type { IsoMesh } from "@/lib/scan/isomesh";

const EXAMPLE = exampleJson as CatalogEntry;

/** Website step panels, in workflow order, and the Skill 4 frame each one opens. */
export const HYBRID_LAB_FRAMES = {
  parents: "tile",
  sections: "clipping",
  frames: "som",
  descendant: "descendant",
  assembly: "canvas",
} as const satisfies Record<string, HybridLabFrame>;

const GEOMETRIES = SITE_PROGRAMS.flatMap((program) => SITE_ARCHETYPES.filter((entry) => entry.program === program));
const GEOMETRY_PREVIEWS = SITE_PROGRAMS.map((program) => SITE_ARCHETYPES.find((entry) => entry.program === program)).filter((entry): entry is (typeof SITE_ARCHETYPES)[number] => entry != null);

const meshCache = new Map<string, Promise<IsoMesh | "missing">>();

function loadGeometry(entry: (typeof GEOMETRIES)[number]) {
  const existing = meshCache.get(entry.moduleId);
  if (existing) return existing;
  const pending = loadArchetypeMesh(entry, new AbortController().signal)
    .then((mesh) => mesh ?? "missing" as const)
    .catch(() => "missing" as const);
  meshCache.set(entry.moduleId, pending);
  return pending;
}

/** Starts the stored parent modules and the floating previews before a panel opens. */
export function warmHybridPresentation() {
  for (const tile of EXAMPLE.tiles) void loadSkill4Handoff(tile.archetypeId);
  for (const entry of GEOMETRY_PREVIEWS) void loadGeometry(entry);
}

function useGeometryMeshes(entries: readonly (typeof GEOMETRIES)[number][]) {
  const [meshes, setMeshes] = useState<Record<string, IsoMesh | "missing">>({});
  const key = entries.map((entry) => entry.moduleId).join("|");
  const list = useRef(entries);
  list.current = entries;
  useEffect(() => {
    let cancel = false;
    for (const entry of list.current) {
      loadGeometry(entry).then((mesh) => {
        if (cancel) return;
        setMeshes((current) => ({ ...current, [entry.moduleId]: mesh }));
      }).catch(() => undefined);
    }
    return () => {
      cancel = true;
    };
  }, [key]);
  return meshes;
}

function geometryFit(meshes: Record<string, IsoMesh | "missing">, ids: readonly string[]) {
  let radius = 0;
  for (const id of ids) {
    const mesh = meshes[id];
    if (mesh && mesh !== "missing") radius = Math.max(radius, clayPreviewRadius(mesh));
  }
  return radius > 0 ? radius : undefined;
}

/** The fifteen Skill 3 modules selected for Hybrid Connection. */
export function SelectedGeometries({ compact = false }: { compact?: boolean }) {
  const entries = compact ? GEOMETRY_PREVIEWS : GEOMETRIES;
  const meshes = useGeometryMeshes(entries);
  const fit = geometryFit(meshes, entries.map((entry) => entry.moduleId));
  return (
    <div className={compact ? "wf-hyb-geometry-row" : "wf-hyb-modules"}>
      {entries.map((entry) => {
        const stored = meshes[entry.moduleId];
        const mesh = stored && stored !== "missing" ? stored : null;
        return (
          <figure key={entry.moduleId} className="wf-site-glass">
            {mesh ? <ModuleGlassPreview mesh={mesh} spin fitRadius={fit} /> : <figcaption>{stored === "missing" ? "Mesh not stored" : "Reading"}</figcaption>}
            <figcaption>{entry.name}</figcaption>
          </figure>
        );
      })}
    </div>
  );
}

/** Keeps the stored assembly loaded for the whole workflow, so opening a panel does not fetch it again. */
export function HybridPresentation({ children, onReady }: { children: ReactNode; onReady: () => void }) {
  return (
    <HybridState syntheticStorage={false}>
      <RestoredExample onReady={onReady} />
      {children}
    </HybridState>
  );
}

function RestoredExample({ onReady }: { onReady: () => void }) {
  const { ensureArchetypes, loaded, restoreAssembly } = useHybrid();
  const restored = useRef(false);
  const ready = useRef(onReady);
  ready.current = onReady;
  useEffect(() => {
    ensureArchetypes(EXAMPLE.tiles.map((tile) => tile.archetypeId));
  }, [ensureArchetypes]);
  useEffect(() => {
    let cancel = false;
    Promise.all(EXAMPLE.tiles.map((tile) => loadSkill4Handoff(tile.archetypeId))).then((rows) => {
      if (cancel || restored.current) return;
      if (rows.some((row) => !row)) ready.current();
    }).catch(() => {
      if (!cancel && !restored.current) ready.current();
    });
    return () => {
      cancel = true;
    };
  }, []);
  useEffect(() => {
    if (restored.current) return;
    const prepared = EXAMPLE.tiles.every((tile) => resolveTileModule(tile.archetypeId, loaded).status === "ready");
    if (!prepared) return;
    restoreAssembly(EXAMPLE);
    restored.current = true;
    ready.current();
  }, [loaded, restoreAssembly]);
  return null;
}

export function HybridLabPanel({ frame }: { frame: HybridLabFrame }) {
  return (
    <div className="wf-hyb-lab">
      <HybridAssembly frame={frame} presentation />
    </div>
  );
}
