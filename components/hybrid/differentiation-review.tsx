"use client";

import { useEffect, useState } from "react";
import { AggregationView } from "@/components/hybrid/aggregation-view";
import type { IsoMesh } from "@/lib/scan/isomesh";
import "@/app/lab/hybrid/skill4-interface.css";

type PackedMesh = { triangles: number; positions: string; normals: string; indices: string };

type Card = {
  programId: string;
  name: string;
  iteration: {
    id: string;
    tiles: number;
    size: string;
    spread: number;
    branches: number;
    levels: number;
    regions: number;
    void: number;
    transitions: number;
    singleStem: boolean;
    rise: string;
  } | null;
};

function unpackMesh(packed: PackedMesh | null): IsoMesh | null {
  if (!packed || packed.triangles < 1 || !packed.positions || !packed.indices) return null;
  const view = (value: string) => {
    const binary = atob(value);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return bytes.buffer;
  };
  return {
    triangles: packed.triangles,
    positions: new Float32Array(view(packed.positions)),
    normals: new Float32Array(view(packed.normals || "")),
    indices: new Uint32Array(view(packed.indices)),
  };
}

function spanOf(mesh: IsoMesh) {
  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;
  for (let index = 0; index < mesh.positions.length; index += 3) {
    const x = mesh.positions[index] ?? 0;
    const y = mesh.positions[index + 1] ?? 0;
    const z = mesh.positions[index + 2] ?? 0;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    minZ = Math.min(minZ, z);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
    maxZ = Math.max(maxZ, z);
  }
  return Math.max(maxX - minX, maxY - minY, maxZ - minZ, 8);
}

function ReviewCard({ card }: { card: Card }) {
  const [mesh, setMesh] = useState<IsoMesh | null>(null);
  useEffect(() => {
    if (!card.iteration) return;
    const controller = new AbortController();
    void fetch(`/api/skill4/differentiation-test?program=${encodeURIComponent(card.programId)}&id=${encodeURIComponent(card.iteration.id)}`, { signal: controller.signal, cache: "no-store" })
      .then((response) => response.json() as Promise<{ mesh?: PackedMesh } | null>)
      .then((body) => setMesh(unpackMesh(body?.mesh ?? null)))
      .catch(() => setMesh(null));
    return () => controller.abort();
  }, [card.programId, card.iteration]);
  const reading = card.iteration;
  return (
    <figure>
      <figcaption>
        <b>{card.name}</b>
        {reading ? <span>{reading.size} ft · {reading.tiles} tiles · {reading.levels} levels · {reading.rise} · void {reading.void.toLocaleString("en-US")} sf</span> : <span>Not saved</span>}
      </figcaption>
      <div className="hybrid-stage">
        {mesh ? (
          <AggregationView
            instances={[{ id: card.programId, mesh, translate: { x: 0, y: 0, z: 0 }, selected: false, plain: true, color: [1, 1, 1] }]}
            selectedId=""
            onSelect={() => undefined}
            links={[]}
            onSelectConnection={() => undefined}
            span={spanOf(mesh)}
            initialPitch={-0.48}
          />
        ) : null}
      </div>
    </figure>
  );
}

export function DifferentiationReview() {
  const [cards, setCards] = useState<Card[] | null>(null);
  useEffect(() => {
    let cancel = false;
    void fetch("/api/skill4/differentiation-test", { cache: "no-store" })
      .then((response) => response.json() as Promise<{ programs: Card[] }>)
      .then((body) => {
        if (!cancel) setCards(body.programs ?? []);
      })
      .catch(() => {
        if (!cancel) setCards([]);
      });
    return () => {
      cancel = true;
    };
  }, []);
  return (
    <div className="diff-review">
      {cards === null ? <p className="diff-review-wait">Loading the differentiation test</p> : null}
      {cards?.map((card) => <ReviewCard key={card.programId} card={card} />)}
    </div>
  );
}
