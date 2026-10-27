"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import type { PlacedMesh } from "@/lib/skill4/draw-placed";
import {
  CATALOG_FILTERS,
  captureCatalogEntry,
  catalogBatch,
  catalogBucket,
  catalogCountLabel,
  catalogPreview,
  emptyCatalogLabel,
  filterCatalog,
  nextCatalogId,
  rerunEntries,
  siteLibraryEntries,
  type CatalogEntry,
  type CatalogFilter,
} from "@/lib/skill4/catalog";
import { catalogServerSnapshot, finalCatalogServerSnapshot, hiddenFinalServerSnapshot, hideFinalCatalog, readCatalog, readFinalCatalog, readHiddenFinal, subscribeCatalog, subscribeFinalCatalog, subscribeHiddenFinal, writeCatalog, writeFinalCatalog } from "@/lib/skill4/catalog-store";
import { CatalogInspect, catalogInspectionMeshes } from "./catalog-inspect";
import { MeshPreview } from "./mesh-preview";
import { useHybrid } from "./hybrid-state";
import { IDENTITY_BASIS, rotateByBasis } from "@/lib/skill4/tile-basis";
import { SyntheticTestToggle } from "./synthetic-test-toggle";

export function HybridCatalog({ final = false }: { final?: boolean }) {
  const { loaded, tiles, connections, count, arrangement, restoreAssembly, syntheticMode, ensureArchetypes, skillModules } = useHybrid();
  const entries = useSyncExternalStore(subscribeCatalog, readCatalog, catalogServerSnapshot);
  const finalEntries = useSyncExternalStore(subscribeFinalCatalog, readFinalCatalog, finalCatalogServerSnapshot);
  const hiddenFinal = useSyncExternalStore(subscribeHiddenFinal, readHiddenFinal, hiddenFinalServerSnapshot);
  const [filter, setFilter] = useState<CatalogFilter>(catalogBucket(tiles.length));
  const [scope, setScope] = useState<"iterations" | "selected" | "rerun">("iterations");
  const [batch, setBatch] = useState<"all" | "TEST_1" | "TEST_2" | "TEST_3" | "TEST_4" | "TEST_5" | "TEST_6" | "TEST_7" | "TEST_8" | "TEST_9" | "TEST_10" | "TEST_11" | "TEST_12">("all");
  const [error, setError] = useState<string | null>(null);
  const [inspectId, setInspectId] = useState<string | null>(null);
  const [published, setPublished] = useState<CatalogEntry[]>([]);
  const [filed, setFiled] = useState<CatalogEntry[]>([]);
  const router = useRouter();
  useEffect(() => {
    let cancel = false;
    const files = Array.from({ length: 12 }, (_, index) => {
      const number = String(index + 1).padStart(2, "0");
      return { batchId: `TEST_${index + 1}`, file: `/skill4/SKILL04-STRESS-TEST-${number}-catalog.json` };
    });
    void Promise.all(files.map(async ({ batchId, file }) => {
      try {
        const response = await fetch(file);
        if (!response.ok) return [];
        const rows: unknown = await response.json();
        if (!Array.isArray(rows)) return [];
        return rows.filter((entry): entry is CatalogEntry => belongsToBatch(entry, batchId));
      } catch {
        return [];
      }
    })).then((groups) => {
      if (!cancel) setPublished(groups.flat());
    });
    return () => {
      cancel = true;
    };
  }, []);
  useEffect(() => {
    let cancel = false;
    void fetch("/skill4/SKILL04-FINAL-CATALOG.json")
      .then(async (response) => {
        if (!response.ok) return [];
        const rows: unknown = await response.json();
        if (!Array.isArray(rows)) return [];
        return rows.filter((entry): entry is CatalogEntry => {
          if (!entry || typeof entry !== "object") return false;
          const record = entry as CatalogEntry;
          return typeof record.id === "string" && Array.isArray(record.tiles) && Array.isArray(record.connections);
        });
      })
      .then((rows) => {
        if (!cancel) setFiled(rows);
      })
      .catch(() => {
        if (!cancel) setFiled([]);
      });
    return () => {
      cancel = true;
    };
  }, []);
  useEffect(() => {
    const current = readCatalog();
    let changed = false;
    const next = current.map((entry) => {
      if (entry.batchId || !/^S04 TEST \d+$/.test(entry.id)) return entry;
      changed = true;
      return { ...entry, batchId: "TEST_1" };
    });
    if (changed) writeCatalog(next);
  }, []);
  const iterations = entries.filter((entry) => entry.rerunNeeded !== true);
  const storedIds = new Set(iterations.map((entry) => entry.id));
  const catalog = [...iterations, ...published.filter((entry) => !storedIds.has(entry.id))];
  const batchVisible = filterCatalog(catalog, filter).filter((entry) => batch === "all" || catalogBatch(entry) === batch);
  const filedFinal = filed.filter((entry) => !hiddenFinal.includes(entry.id));
  const filedIds = new Set(filedFinal.map((entry) => entry.id));
  const savedFinal = [...filedFinal, ...finalEntries.filter((entry) => !filedIds.has(entry.id) && !hiddenFinal.includes(entry.id))];
  const visible = final
    ? savedFinal
    : scope === "selected" ? siteLibraryEntries(entries) : scope === "rerun" ? rerunEntries(entries) : batchVisible;
  const moduleKey = useMemo(() => {
    const ids = new Set<string>();
    for (const entry of [...entries, ...published, ...finalEntries, ...filed]) {
      for (const tile of entry.tiles) if (tile.archetypeId) ids.add(tile.archetypeId);
    }
    return [...ids].sort().join("|");
  }, [entries, published, finalEntries, filed]);
  useEffect(() => {
    ensureArchetypes(moduleKey.split("|").filter(Boolean));
  }, [moduleKey, ensureArchetypes]);
  const inspected = (final ? savedFinal : catalog).find((entry) => entry.id === inspectId) ?? null;
  const savedIds = new Set([...finalEntries.map((entry) => entry.id), ...filed.map((entry) => entry.id)]);

  const saveToFinal = (entry: CatalogEntry) => {
    if (savedIds.has(entry.id)) return;
    try {
      writeFinalCatalog([entry, ...readFinalCatalog()]);
      setError(null);
    } catch {
      setError("The final catalog could not be saved in this browser.");
    }
  };

  const save = () => {
    const entry = captureCatalogEntry(nextCatalogId(readCatalog()), tiles, connections, count, arrangement, loaded, syntheticMode);
    try {
      writeCatalog([entry, ...readCatalog()]);
      setFilter(catalogBucket(entry.tileCount));
      setError(null);
    } catch {
      setError("The catalog could not be saved in this browser.");
    }
  };

  const remove = (id: string) => {
    writeCatalog(readCatalog().filter((entry) => entry.id !== id));
  };

  const selectForSite = (entry: CatalogEntry) => {
    writeCatalog(readCatalog().map((item) => item.id === entry.id ? { ...item, selected: item.selected !== true } : item));
  };

  const open = (entry: CatalogEntry) => {
    restoreAssembly(entry);
    const query = window.location.search;
    router.push(query ? `/lab/hybrid${query}` : "/lab/hybrid");
  };

  return (
    <main className="hybrid-view hybrid-catalog">
      <div className="hybrid-catalog-body">
      {final ? null : <aside className="hybrid-layout-controls hybrid-catalog-batches" role="group" aria-label="Stress test batch">
        <button type="button" data-active={batch === "all" || undefined} onClick={() => setBatch("all")}>All</button>
        <button type="button" data-active={batch === "TEST_1" || undefined} onClick={() => setBatch("TEST_1")}>Test 1</button>
        <button type="button" data-active={batch === "TEST_2" || undefined} onClick={() => setBatch("TEST_2")}>Test 2</button>
        <button type="button" data-active={batch === "TEST_3" || undefined} onClick={() => setBatch("TEST_3")}>Test 3</button>
        <button type="button" data-active={batch === "TEST_4" || undefined} onClick={() => setBatch("TEST_4")}>Test 4</button>
        <button type="button" data-active={batch === "TEST_5" || undefined} onClick={() => setBatch("TEST_5")}>Test 5</button>
        <button type="button" data-active={batch === "TEST_6" || undefined} onClick={() => setBatch("TEST_6")}>Test 6</button>
        <button type="button" data-active={batch === "TEST_7" || undefined} onClick={() => setBatch("TEST_7")}>Test 7</button>
        <button type="button" data-active={batch === "TEST_8" || undefined} onClick={() => setBatch("TEST_8")}>Test 8</button>
        <button type="button" data-active={batch === "TEST_9" || undefined} onClick={() => setBatch("TEST_9")}>Test 9</button>
        <button type="button" data-active={batch === "TEST_10" || undefined} onClick={() => setBatch("TEST_10")}>Test 10</button>
        <button type="button" data-active={batch === "TEST_11" || undefined} onClick={() => setBatch("TEST_11")}>Test 11</button>
        <button type="button" data-active={batch === "TEST_12" || undefined} onClick={() => setBatch("TEST_12")}>Test 12</button>
      </aside>}
      <div className="hybrid-catalog-main">
      <div className="hybrid-catalog-bar">
        {final ? null : <SyntheticTestToggle />}
        {final ? <p className="hybrid-identity">Final Catalog</p> : <div className="hybrid-layout-controls" role="group" aria-label="Catalog">
          <button type="button" data-active={scope === "iterations" || undefined} onClick={() => setScope("iterations")}>Iterations</button>
          <button type="button" data-active={scope === "selected" || undefined} onClick={() => setScope("selected")}>Selected</button>
          <button type="button" data-active={scope === "rerun" || undefined} onClick={() => setScope("rerun")}>Rerun needed</button>
        </div>}
        {!final && scope === "iterations" ? (
          <div className="hybrid-layout-controls" role="group" aria-label="Assembly size">
            {CATALOG_FILTERS.map((value) => (
              <button key={value} type="button" data-active={filter === value || undefined} onClick={() => setFilter(value)}>
                {value === "custom" ? "Custom" : value}
              </button>
            ))}
          </div>
        ) : null}
        <p className="hybrid-units">{final ? `${visible.length} saved` : scope === "iterations" ? catalogCountLabel(filter, visible.length) : scope === "selected" ? `${visible.length} selected for the site` : `${visible.length} awaiting a hybrid rerun`}</p>
        {final ? null : (
          <button type="button" className="hybrid-generate" onClick={save}>
            Save current assembly
          </button>
        )}
      </div>
      {error ? <p className="hybrid-pending">{error}</p> : null}
      {visible.length === 0 ? (
        <div className="hybrid-catalog-empty">
          <p className="hybrid-identity">{final ? "NO SAVED RESULTS" : scope === "selected" ? "NO SELECTED ASSEMBLIES" : scope === "rerun" ? "NO RERUNS" : emptyCatalogLabel(filter)}</p>
          <p className="hybrid-units">{final ? "Save a test result from the catalog." : scope === "selected" ? "Select a saved iteration to import it on the site." : scope === "rerun" ? "A site proposal sent back from Site Integration appears here. Connector generation does not run on its own." : "Save the current assembly to add it to the catalog."}</p>
        </div>
      ) : (
        <div className="hybrid-catalog-grid">
          {visible.map((entry) => (
            <CatalogCard
              key={entry.id}
              entry={entry}
              onOpen={() => open(entry)}
              onInspect={() => setInspectId(entry.id)}
              onDelete={() => {
                if (final) {
                  hideFinalCatalog(entry.id);
                  writeFinalCatalog(readFinalCatalog().filter((item) => item.id !== entry.id));
                } else remove(entry.id);
              }}
              onSelect={() => selectForSite(entry)}
              onSaveFinal={final || !isTestResult(entry) ? undefined : () => saveToFinal(entry)}
              saved={savedIds.has(entry.id)}
            />
          ))}
        </div>
      )}
      {inspected ? (
        <CatalogInspect
          entry={inspected}
          loaded={inspected.testData && syntheticMode ? loaded : skillModules}
          onClose={() => setInspectId(null)}
          onRestore={() => open(inspected)}
          onSaveFinal={final || !isTestResult(inspected) ? undefined : () => saveToFinal(inspected)}
          saved={savedIds.has(inspected.id)}
        />
      ) : null}
      </div>
      </div>
    </main>
  );
}

function catalogMeshes(entry: CatalogEntry, loaded: Parameters<typeof catalogPreview>[1], syntheticLoaded: boolean) {
  try {
    if (!(entry.testData && !syntheticLoaded)) {
      const viewed = catalogInspectionMeshes(entry, loaded);
      if (viewed.meshes.length > 0) return viewed.meshes;
    }
    return catalogPreview(entry, loaded);
  } catch {
    try {
      return catalogPreview(entry, loaded);
    } catch {
      return [];
    }
  }
}

function isTestResult(entry: CatalogEntry) {
  return entry.testData === true || catalogBatch(entry) !== null;
}

function belongsToBatch(entry: unknown, batchId: string): entry is CatalogEntry {
  if (!entry || typeof entry !== "object") return false;
  const record = entry as CatalogEntry;
  if (typeof record.id !== "string" || !Array.isArray(record.tiles)) return false;
  if (record.batchId === batchId) return true;
  return batchId === "TEST_1" && !record.batchId && /^S04 TEST \d+$/.test(record.id);
}

function CatalogCard({ entry, onOpen, onInspect, onDelete, onSelect, onSaveFinal, saved = false }: { entry: CatalogEntry; onOpen: () => void; onInspect: () => void; onDelete: () => void; onSelect: () => void; onSaveFinal?: () => void; saved?: boolean }) {
  const { loaded, skillModules, syntheticMode } = useHybrid();
  const cardRef = useRef<HTMLElement>(null);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const node = cardRef.current;
    if (!node) return;
    const observer = new IntersectionObserver((entries) => {
      setShown(entries.some((item) => item.isIntersecting));
    }, { rootMargin: "160px" });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  const syntheticLoaded = Boolean(syntheticMode && loaded.get(entry.tiles[0]?.archetypeId ?? "")?.moduleId.startsWith("synthetic-test:"));
  const modules = entry.testData && syntheticLoaded ? loaded : skillModules;
  const preview = shown ? catalogMeshes(entry, modules, syntheticLoaded) : [];
  const connected = preview.some((mesh) => mesh.kind === 1);
  return (
    <article ref={cardRef} className="hybrid-slot hybrid-catalog-card">
      <div className="hybrid-preview hybrid-catalog-preview" onClick={onInspect}>
        {shown && preview.length > 0 ? <MeshPreview placed={frameCatalog(preview)} contain turn fitScale={1.6} /> : shown ? <p className="hybrid-missing">{entry.testData && !syntheticLoaded ? "TEST DATA · synthetic modules are off" : "Geometry unavailable"}</p> : null}
      </div>
      {onSaveFinal ? (
        <div className="hybrid-final-save-anchor">
          <button type="button" className="hybrid-generate hybrid-final-save" disabled={saved} onClick={(event) => { event.stopPropagation(); onSaveFinal(); }}>
            {saved ? "Saved" : "Save to Final Catalog"}
          </button>
        </div>
      ) : null}
      <div className="hybrid-catalog-copy">
      <p className="hybrid-identity">{entry.id}</p>
      {shown && entry.batch?.status === "failed" && !connected ? <p className="hybrid-units">FAILED CONNECTION</p> : null}
      {entry.testData ? <p className="hybrid-units">TEST DATA</p> : null}
      {entry.rerunNeeded ? <p className="hybrid-units">Rerun needed{entry.parentAssemblyId ? ` · from ${entry.parentAssemblyId}` : ""}</p> : null}
      {entry.selected ? <p className="hybrid-units">Selected for the site</p> : null}
      <p className="hybrid-catalog-archetypes">
        {entry.tiles.map((tile, index) => (
          <span key={tile.instanceId}>
            {index > 0 ? <span className="hybrid-catalog-plus">+</span> : null}
            {tile.name}
          </span>
        ))}
      </p>
      <div className="hybrid-layout-controls">
        <button type="button" onClick={onOpen}>Open in Assembly</button>
        <button type="button" data-active={entry.selected || undefined} onClick={onSelect}>{entry.selected ? "Selected" : "Select for site"}</button>
        <button type="button" onClick={onDelete} aria-label={`Delete ${entry.id}`}>Delete</button>
      </div>
      </div>
    </article>
  );
}

function frameCatalog(instances: readonly PlacedMesh[]): PlacedMesh[] {
  const groups = new Map<boolean, { positions: number[]; normals: number[]; indices: number[] }>();
  const ensure = (palette: boolean) => {
    const found = groups.get(palette);
    if (found) return found;
    const next = { positions: [] as number[], normals: [] as number[], indices: [] as number[] };
    groups.set(palette, next);
    return next;
  };
  for (const instance of instances) {
    const source = instance.mesh;
    const palette = instance.palette === true || instance.kind === 1;
    const group = ensure(palette);
    const angle = instance.spin ?? 0;
    const cosine = Math.cos(angle);
    const sine = Math.sin(angle);
    const mirror = instance.mirror ?? 0;
    const base = group.positions.length / 3;
    for (let index = 0; index < source.positions.length; index += 3) {
      const turned = rotateByBasis(instance.basis ?? IDENTITY_BASIS, {
        x: source.positions[index],
        y: source.positions[index + 1],
        z: source.positions[index + 2],
      });
      const normal = rotateByBasis(instance.basis ?? IDENTITY_BASIS, {
        x: source.normals[index] ?? 0,
        y: source.normals[index + 1] ?? 1,
        z: source.normals[index + 2] ?? 0,
      });
      let x = turned.x;
      let y = turned.y;
      let z = turned.z;
      let nx = normal.x;
      let ny = normal.y;
      let nz = normal.z;
      if (mirror === 1) { x = -x; nx = -nx; }
      if (mirror === 2) { y = -y; ny = -ny; }
      if (mirror === 3) { z = -z; nz = -nz; }
      group.positions.push(x * cosine + z * sine + instance.translate.x, y + instance.translate.y, -x * sine + z * cosine + instance.translate.z);
      group.normals.push(nx * cosine + nz * sine, ny, -nx * sine + nz * cosine);
    }
    for (const index of source.indices) group.indices.push(index + base);
  }
  let cx = 0;
  let cy = 0;
  let cz = 0;
  let count = 0;
  for (const group of groups.values()) {
    for (let index = 0; index < group.positions.length; index += 3) {
      cx += group.positions[index];
      cy += group.positions[index + 1];
      cz += group.positions[index + 2];
      count += 1;
    }
  }
  if (count > 0) {
    cx /= count;
    cy /= count;
    cz /= count;
    for (const group of groups.values()) {
      for (let index = 0; index < group.positions.length; index += 3) {
        group.positions[index] -= cx;
        group.positions[index + 1] -= cy;
        group.positions[index + 2] -= cz;
      }
    }
  }
  const origin = { x: 0, y: 0, z: 0 };
  const packed: PlacedMesh[] = [];
  const parent = groups.get(false);
  const hybrid = groups.get(true);
  if (parent && parent.indices.length > 0) {
    packed.push({
      id: "preview",
      mesh: { positions: Float32Array.from(parent.positions), normals: Float32Array.from(parent.normals), indices: Uint32Array.from(parent.indices), triangles: parent.indices.length / 3 },
      translate: origin,
      selected: false,
      color: [1, 1, 1],
    });
  }
  if (hybrid && hybrid.indices.length > 0) {
    packed.push({
      id: "hybrid",
      mesh: { positions: Float32Array.from(hybrid.positions), normals: Float32Array.from(hybrid.normals), indices: Uint32Array.from(hybrid.indices), triangles: hybrid.indices.length / 3 },
      translate: origin,
      selected: false,
      kind: 1,
      palette: true,
    });
  }
  return packed;
}
