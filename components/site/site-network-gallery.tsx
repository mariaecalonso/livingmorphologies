"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import type { NetworkFrame, NetworkIteration, SiteNetworkStudy } from "./site-network";
import { trailDisplayAlpha } from "./site-network-display";

const EMPTY_NODES = { nodes: [] as NetworkIteration["nodes"], selectedId: null as string | null };

const BATCHES = [10, 20, 30] as const;

export type IterationBatch = {
  done: number;
  total: number;
  step: number;
};

function paintIteration(canvas: HTMLCanvasElement, iteration: NetworkIteration, frame: NetworkFrame) {
  const size = 180;
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const span = Math.max(frame.width, frame.depth);
  const field = iteration.inkSize;
  const source = document.createElement("canvas");
  source.width = field;
  source.height = field;
  const sourceCtx = source.getContext("2d");
  if (!sourceCtx) return;
  const image = sourceCtx.createImageData(field, field);
  const trails = iteration.trails;
  if (trails.length !== field * field) return;
  const rank = new Uint8ClampedArray(field * field);
  for (let index = 0; index < trails.length; index += 1) {
    const value = trailDisplayAlpha(trails[index] ?? 0);
    if (value < 12) continue;
    rank[index] = value < 150 ? Math.round(value * 0.28) : Math.min(255, Math.round(30 + (value - 150) * 1.7));
  }
  const drawn = rank.slice();
  for (let index = 0; index < rank.length; index += 1) {
    if (rank[index] < 170) continue;
    const x = index % field;
    const y = Math.floor(index / field);
    for (let oy = -4; oy <= 4; oy += 1) {
      const ny = y + oy;
      if (ny < 0 || ny >= field) continue;
      for (let ox = -4; ox <= 4; ox += 1) {
        const nx = x + ox;
        if (nx < 0 || nx >= field) continue;
        const falloff = 1 - Math.hypot(ox, oy) / 4.6;
        if (falloff <= 0) continue;
        const next = Math.round(rank[index] * falloff);
        const at = ny * field + nx;
        if (next > drawn[at]) drawn[at] = next;
      }
    }
  }
  for (let y = 0; y < field; y += 1) {
    const from = y * field;
    const to = (field - 1 - y) * field;
    for (let x = 0; x < field; x += 1) {
      const write = (to + x) * 4;
      image.data[write] = 255;
      image.data[write + 1] = 255;
      image.data[write + 2] = 255;
      image.data[write + 3] = drawn[from + x];
    }
  }
  sourceCtx.putImageData(image, 0, 0);
  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, size, size);
  ctx.drawImage(source, 0, 0, size, size);
  for (const node of iteration.nodes) {
    const across = (node.x - frame.minX) / span;
    const up = (node.z - frame.minZ) / span;
    ctx.fillStyle = node.kind === "source" ? "#c77e5f" : "#49d7de";
    ctx.beginPath();
    ctx.arc(across * size, (1 - up) * size, 4.5, 0, Math.PI * 2);
    ctx.fill();
  }
}

function IterationCanvas({
  iteration,
  frame,
  label,
}: {
  iteration: NetworkIteration;
  frame: NetworkFrame;
  label: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (canvas) paintIteration(canvas, iteration, frame);
  }, [iteration, frame]);
  return <canvas ref={ref} aria-label={label} />;
}

export function SiteNetworkIterations({
  study,
  iterations,
  viewId,
  compareIds,
  batch,
  onGenerate,
  onView,
  onToggleCompare,
  onRegenerate,
  onClear,
}: {
  study: SiteNetworkStudy;
  iterations: readonly NetworkIteration[];
  viewId: string | null;
  compareIds: readonly string[];
  batch: IterationBatch | null;
  onGenerate: (count: 10 | 20 | 30) => void;
  onView: (id: string | null) => void;
  onToggleCompare: (id: string) => void;
  onRegenerate: (id: string) => void;
  onClear: () => void;
}) {
  const edit = useSyncExternalStore(
    (listener) => study.subscribe(listener),
    () => study.edit,
    () => EMPTY_NODES,
  );
  const frame: NetworkFrame = study.frame;
  const ready = edit.nodes.some((node) => node.kind === "source") && edit.nodes.some((node) => node.kind === "attractor");
  const compared = iterations.filter((item) => compareIds.includes(item.id));
  const showing = iterations.find((item) => item.id === viewId) ?? null;
  return (
    <section className="site-block site-specs" aria-label="Network iterations">
      <h2 className="site-subtitle">Iterations {iterations.length > 0 ? <span>{iterations.length}</span> : null}</h2>
      <div className="site-modes site-network-controls" role="group" aria-label="Iteration batch">
        {BATCHES.map((count) => (
          <button key={count} type="button" disabled={!ready || batch !== null} onClick={() => onGenerate(count)}>
            {count}
          </button>
        ))}
      </div>
      {batch ? (
        <p className="site-note" role="status">
          {batch.done + 1}/{batch.total} · step {batch.step}
        </p>
      ) : null}
      {!ready ? (
        <p className="site-note">Place a source and an attractor.</p>
      ) : null}
      <div className="site-modes site-network-controls">
        <button type="button" data-active={viewId === null || undefined} onClick={() => onView(null)}>Live</button>
        <button type="button" disabled={!showing || batch !== null} onClick={() => showing && onRegenerate(showing.id)}>Regenerate</button>
        <button type="button" disabled={iterations.length === 0 || batch !== null} onClick={onClear}>Clear</button>
      </div>
      {showing ? (
        <p className="site-note">
          {showing.index} · seed {showing.seed} · {showing.reached}/{showing.total} · step {showing.step}
          {showing.note ? ` · ${showing.note}` : ""}
        </p>
      ) : (
        <p className="site-note">Live</p>
      )}
      {iterations.length > 0 ? (
        <div className="site-iteration-grid">
          {iterations.map((item) => {
            const short = item.total > 0 && item.reached < item.total;
            return (
              <article key={item.id} className="site-iteration-card" data-active={item.id === viewId || undefined}>
                <button type="button" aria-pressed={item.id === viewId} onClick={() => onView(item.id)}>
                  <IterationCanvas iteration={item} frame={frame} label={`Iteration ${item.index}`} />
                  <span className="site-iteration-meta" data-short={short || undefined}>
                    <b>{item.index}</b>
                    <b>{item.reached}/{item.total}</b>
                  </span>
                </button>
                <button type="button" data-active={compareIds.includes(item.id) || undefined} onClick={() => onToggleCompare(item.id)}>
                  Compare
                </button>
              </article>
            );
          })}
        </div>
      ) : (
        <p className="site-note">None saved.</p>
      )}
      {compared.length >= 2 ? (
        <div className="site-iteration-compare" aria-label="Compared iterations">
          {compared.map((item) => (
            <figure key={item.id}>
              <IterationCanvas iteration={item} frame={frame} label={`Compare iteration ${item.index}`} />
              <figcaption className="site-note">
                {item.index} · {item.reached}/{item.total}
              </figcaption>
            </figure>
          ))}
        </div>
      ) : null}
    </section>
  );
}
