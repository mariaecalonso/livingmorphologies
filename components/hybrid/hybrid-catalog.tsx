"use client";

import { useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import type { IsoMesh } from "@/lib/scan/isomesh";
import type { PlacedMesh } from "@/lib/skill4/draw-placed";
import {
  CATALOG_FILTERS,
  captureCatalogEntry,
  catalogBucket,
  catalogCountLabel,
  catalogPreview,
  emptyCatalogLabel,
  filterCatalog,
  nextCatalogId,
  type CatalogEntry,
  type CatalogFilter,
} from "@/lib/skill4/catalog";
import { catalogServerSnapshot, readCatalog, subscribeCatalog, writeCatalog } from "@/lib/skill4/catalog-store";
import { MeshPreview } from "./mesh-preview";
import { useHybrid } from "./hybrid-state";
import { SyntheticTestToggle } from "./synthetic-test-toggle";

export function HybridCatalog() {
  const { loaded, tiles, connections, count, arrangement, restoreAssembly, syntheticMode } = useHybrid();
  const entries = useSyncExternalStore(subscribeCatalog, readCatalog, catalogServerSnapshot);
  const [filter, setFilter] = useState<CatalogFilter>(catalogBucket(tiles.length));
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const visible = filterCatalog(entries, filter);

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

  const open = (entry: CatalogEntry) => {
    restoreAssembly(entry);
    const query = window.location.search;
    router.push(query ? `/lab/hybrid${query}` : "/lab/hybrid");
  };

  return (
    <main className="hybrid-view hybrid-catalog">
      <div className="hybrid-catalog-bar">
        <SyntheticTestToggle />
        <div className="hybrid-layout-controls" role="group" aria-label="Assembly size">
          {CATALOG_FILTERS.map((value) => (
            <button key={value} type="button" data-active={filter === value || undefined} onClick={() => setFilter(value)}>
              {value === "custom" ? "Custom" : value}
            </button>
          ))}
        </div>
        <p className="hybrid-units">{catalogCountLabel(filter, visible.length)}</p>
        <button type="button" className="hybrid-generate" onClick={save}>
          Save current assembly
        </button>
      </div>
      {error ? <p className="hybrid-pending">{error}</p> : null}
      {visible.length === 0 ? (
        <div className="hybrid-catalog-empty">
          <p className="hybrid-identity">{emptyCatalogLabel(filter)}</p>
          <p className="hybrid-units">Save the current assembly to add it to the catalog.</p>
        </div>
      ) : (
        <div className="hybrid-catalog-grid">
          {visible.map((entry) => (
            <CatalogCard key={entry.id} entry={entry} onOpen={() => open(entry)} onDelete={() => remove(entry.id)} />
          ))}
        </div>
      )}
    </main>
  );
}

function CatalogCard({ entry, onOpen, onDelete }: { entry: CatalogEntry; onOpen: () => void; onDelete: () => void }) {
  const { loaded, syntheticMode } = useHybrid();
  const syntheticLoaded = syntheticMode && loaded.get(entry.tiles[0]?.archetypeId ?? "")?.moduleId.startsWith("synthetic-test:");
  const preview = entry.testData && !syntheticLoaded ? [] : catalogPreview(entry, loaded);
  return (
    <article className="hybrid-slot hybrid-catalog-card">
      <div className="hybrid-preview hybrid-catalog-preview">
        {preview.length > 0 ? <MeshPreview mesh={frameAssembly(preview)} kind={0} contain /> : <p className="hybrid-missing">{entry.testData && !syntheticLoaded ? "TEST DATA · synthetic modules are off" : "Geometry unavailable"}</p>}
      </div>
      <p className="hybrid-identity">{entry.id}</p>
      {entry.testData ? <p className="hybrid-units">TEST DATA</p> : null}
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
        <button type="button" onClick={onDelete} aria-label={`Delete ${entry.id}`}>Delete</button>
      </div>
    </article>
  );
}

function frameAssembly(instances: readonly PlacedMesh[]): IsoMesh {
  const positions: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];
  let offset = 0;
  for (const instance of instances) {
    const source = instance.mesh;
    const angle = instance.spin ?? 0;
    const cosine = Math.cos(angle);
    const sine = Math.sin(angle);
    const mirror = instance.mirror ?? 0;
    for (let index = 0; index < source.positions.length; index += 3) {
      let x = source.positions[index];
      let y = source.positions[index + 1];
      let z = source.positions[index + 2];
      if (mirror === 1) x = -x;
      if (mirror === 2) y = -y;
      if (mirror === 3) z = -z;
      const spunX = x * cosine + z * sine;
      const spunZ = -x * sine + z * cosine;
      positions.push(spunX + instance.translate.x, y + instance.translate.y, spunZ + instance.translate.z);
      normals.push(source.normals[index], source.normals[index + 1], source.normals[index + 2]);
    }
    for (const index of source.indices) indices.push(index + offset);
    offset += source.positions.length / 3;
  }
  let cx = 0;
  let cy = 0;
  let cz = 0;
  const count = positions.length / 3;
  for (let index = 0; index < positions.length; index += 3) {
    cx += positions[index];
    cy += positions[index + 1];
    cz += positions[index + 2];
  }
  if (count > 0) {
    cx /= count;
    cy /= count;
    cz /= count;
    for (let index = 0; index < positions.length; index += 3) {
      positions[index] -= cx;
      positions[index + 1] -= cy;
      positions[index + 2] -= cz;
    }
  }
  return {
    positions: Float32Array.from(positions),
    normals: Float32Array.from(normals),
    indices: Uint32Array.from(indices),
    triangles: indices.length / 3,
  };
}
