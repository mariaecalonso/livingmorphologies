"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
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
import { catalogServerSnapshot, readCatalog, subscribeCatalog, writeCatalog } from "@/lib/skill4/catalog-store";
import { CatalogInspect, catalogInspectionMeshes } from "./catalog-inspect";
import { MeshPreview } from "./mesh-preview";
import { useHybrid } from "./hybrid-state";
import { IDENTITY_BASIS, rotateByBasis } from "@/lib/skill4/tile-basis";
import { SyntheticTestToggle } from "./synthetic-test-toggle";

export function HybridCatalog() {
  const { loaded, tiles, connections, count, arrangement, restoreAssembly, syntheticMode } = useHybrid();
  const entries = useSyncExternalStore(subscribeCatalog, readCatalog, catalogServerSnapshot);
  const [filter, setFilter] = useState<CatalogFilter>(catalogBucket(tiles.length));
  const [scope, setScope] = useState<"iterations" | "selected" | "rerun">("iterations");
  const [batch, setBatch] = useState<"all" | "TEST_1" | "TEST_2" | "TEST_3" | "TEST_4" | "TEST_5" | "TEST_6" | "TEST_7" | "TEST_8" | "TEST_9" | "TEST_10" | "TEST_11">("all");
  const [error, setError] = useState<string | null>(null);
  const [inspectId, setInspectId] = useState<string | null>(null);
  const [published, setPublished] = useState<CatalogEntry[]>([]);
  const router = useRouter();
  useEffect(() => {
    let cancel = false;
    const files = Array.from({ length: 11 }, (_, index) => {
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
  const visible = scope === "selected" ? siteLibraryEntries(entries) : scope === "rerun" ? rerunEntries(entries) : batchVisible;
  const inspected = catalog.find((entry) => entry.id === inspectId) ?? null;

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
      <aside className="hybrid-layout-controls hybrid-catalog-batches" role="group" aria-label="Stress test batch">
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
      </aside>
      <div className="hybrid-catalog-main">
      <div className="hybrid-catalog-bar">
        <SyntheticTestToggle />
        <div className="hybrid-layout-controls" role="group" aria-label="Catalog">
          <button type="button" data-active={scope === "iterations" || undefined} onClick={() => setScope("iterations")}>Iterations</button>
          <button type="button" data-active={scope === "selected" || undefined} onClick={() => setScope("selected")}>Selected</button>
          <button type="button" data-active={scope === "rerun" || undefined} onClick={() => setScope("rerun")}>Rerun needed</button>
        </div>
        {scope === "iterations" ? (
          <div className="hybrid-layout-controls" role="group" aria-label="Assembly size">
            {CATALOG_FILTERS.map((value) => (
              <button key={value} type="button" data-active={filter === value || undefined} onClick={() => setFilter(value)}>
                {value === "custom" ? "Custom" : value}
              </button>
            ))}
          </div>
        ) : null}
        <p className="hybrid-units">{scope === "iterations" ? catalogCountLabel(filter, visible.length) : scope === "selected" ? `${visible.length} selected for the site` : `${visible.length} awaiting a hybrid rerun`}</p>
        <button type="button" className="hybrid-generate" onClick={save}>
          Save current assembly
        </button>
      </div>
      {error ? <p className="hybrid-pending">{error}</p> : null}
      {visible.length === 0 ? (
        <div className="hybrid-catalog-empty">
          <p className="hybrid-identity">{scope === "selected" ? "NO SELECTED ASSEMBLIES" : scope === "rerun" ? "NO RERUNS" : emptyCatalogLabel(filter)}</p>
          <p className="hybrid-units">{scope === "selected" ? "Select a saved iteration to import it on the site." : scope === "rerun" ? "A site proposal sent back from Site Integration appears here. Connector generation does not run on its own." : "Save the current assembly to add it to the catalog."}</p>
        </div>
      ) : (
        <div className="hybrid-catalog-grid">
          {visible.map((entry) => (
            <CatalogCard
              key={entry.id}
              entry={entry}
              onOpen={() => open(entry)}
              onInspect={() => setInspectId(entry.id)}
              onDelete={() => remove(entry.id)}
              onSelect={() => selectForSite(entry)}
            />
          ))}
        </div>
      )}
      {inspected ? (
        <CatalogInspect
          entry={inspected}
          loaded={loaded}
          onClose={() => setInspectId(null)}
          onRestore={() => open(inspected)}
        />
      ) : null}
      </div>
      </div>
    </main>
  );
}

function belongsToBatch(entry: unknown, batchId: string): entry is CatalogEntry {
  if (!entry || typeof entry !== "object") return false;
  const record = entry as CatalogEntry;
  if (typeof record.id !== "string" || !Array.isArray(record.tiles)) return false;
  if (record.batchId === batchId) return true;
  return batchId === "TEST_1" && !record.batchId && /^S04 TEST \d+$/.test(record.id);
}

function CatalogCard({ entry, onOpen, onInspect, onDelete, onSelect }: { entry: CatalogEntry; onOpen: () => void; onInspect: () => void; onDelete: () => void; onSelect: () => void }) {
  const { loaded, syntheticMode } = useHybrid();
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
  const syntheticLoaded = syntheticMode && loaded.get(entry.tiles[0]?.archetypeId ?? "")?.moduleId.startsWith("synthetic-test:");
  const viewed = shown && !(entry.testData && !syntheticLoaded) ? catalogInspectionMeshes(entry, loaded) : null;
  const preview = shown ? (viewed?.meshes.length ? viewed.meshes : catalogPreview(entry, loaded)) : [];
  const connected = preview.some((mesh) => mesh.kind === 1);
  return (
    <article ref={cardRef} className="hybrid-slot hybrid-catalog-card">
      <div className="hybrid-preview hybrid-catalog-preview" onClick={onInspect}>
        {shown && preview.length > 0 ? <MeshPreview placed={frameCatalog(preview)} contain turn fitScale={1.6} /> : shown ? <p className="hybrid-missing">{entry.testData && !syntheticLoaded ? "TEST DATA · synthetic modules are off" : "Geometry unavailable"}</p> : null}
      </div>
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
