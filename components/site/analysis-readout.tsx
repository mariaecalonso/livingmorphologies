"use client";

import type { ReactNode } from "react";

export function AnalysisReadout({
  condition,
  input,
  response,
  titles = ["Analyzed condition", "Generated site input", "Potential design response"],
}: {
  condition: ReactNode;
  input: ReactNode;
  response: ReactNode;
  titles?: readonly [string, string, string];
}) {
  return (
    <div className="site-readout">
      <section className="site-readout-section">
        <h3><span>01</span> {titles[0]}</h3>
        {condition}
      </section>
      <section className="site-readout-section">
        <h3><span>02</span> {titles[1]}</h3>
        {input}
      </section>
      <section className="site-readout-section">
        <h3><span>03</span> {titles[2]}</h3>
        {response}
      </section>
    </div>
  );
}

export function ConceptFigure({ caption, children }: { caption: string; children: ReactNode }) {
  return (
    <figure className="site-concept">
      <svg viewBox="0 0 120 64" aria-hidden="true">{children}</svg>
      <figcaption>CONCEPTUAL / NOT GENERATED. {caption}</figcaption>
    </figure>
  );
}

export function ExposureMap({
  cells,
  bounds,
}: {
  cells: readonly { x: number; z: number; exposed: boolean }[];
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
}) {
  const width = Math.max(1, bounds.maxX - bounds.minX);
  const depth = Math.max(1, bounds.maxZ - bounds.minZ);
  const pad = 4;
  const plotW = 112;
  const plotH = 56;
  const scale = Math.min(plotW / width, plotH / depth);
  const ox = pad + (plotW - width * scale) / 2;
  const oz = pad + (plotH - depth * scale) / 2;
  const step = Math.max(1.1, Math.min(width, depth) * scale / 14);
  return (
    <svg className="site-exposure-map" viewBox="0 0 120 64" role="img" aria-label="Parcel sun and shade samples">
      {cells.map((cell) => (
        <rect
          key={`${cell.x.toFixed(1)}:${cell.z.toFixed(1)}`}
          x={ox + (cell.x - bounds.minX) * scale - step / 2}
          y={oz + (bounds.maxZ - cell.z) * scale - step / 2}
          width={step}
          height={step}
          data-exposed={cell.exposed ? "yes" : "no"}
        />
      ))}
    </svg>
  );
}
