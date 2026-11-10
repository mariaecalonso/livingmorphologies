"use client";

import { useEffect, useRef } from "react";
import type { NetworkFigures } from "./site-network-analysis";

function Plate({ pixels, size, label }: { pixels: Uint8ClampedArray; size: number; label: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext("2d");
    if (!context) return;
    context.imageSmoothingEnabled = false;
    const image = context.createImageData(size, size);
    image.data.set(pixels);
    context.putImageData(image, 0, 0);
  }, [pixels, size]);
  return <canvas ref={ref} className="site-figure-plate" aria-label={label} />;
}

function Profile({ values }: { values: readonly number[] }) {
  const width = 220;
  const height = 120;
  const left = 28;
  const right = 12;
  const top = 16;
  const bottom = 22;
  const plotW = width - left - right;
  const plotH = height - top - bottom;
  const step = plotW / Math.max(1, values.length - 1);
  const line = values.map((value, index) => `${left + index * step},${top + (1 - value) * plotH}`).join(" ");
  const area = `${left},${top + plotH} ${line} ${left + plotW},${top + plotH}`;
  const ticks = [0, 0.5, 1];
  return (
    <svg className="site-figure-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="East west density profile">
      {ticks.map((tick) => {
        const y = top + (1 - tick) * plotH;
        return <line key={tick} x1={left} y1={y} x2={left + plotW} y2={y} stroke="rgba(242,242,238,0.16)" strokeWidth="0.6" />;
      })}
      <line x1={left} y1={top} x2={left} y2={top + plotH} stroke="rgba(242,242,238,0.45)" strokeWidth="0.7" />
      <line x1={left} y1={top + plotH} x2={left + plotW} y2={top + plotH} stroke="rgba(242,242,238,0.45)" strokeWidth="0.7" />
      {ticks.map((tick) => (
        <text key={tick} x={left - 4} y={top + (1 - tick) * plotH + 3} textAnchor="end">{tick === 0 ? "0" : tick === 1 ? "1" : ".5"}</text>
      ))}
      <polygon points={area} fill="rgba(15,115,119,0.22)" />
      <polyline points={line} fill="none" stroke="#f2f2ee" strokeWidth="1.15" />
      <text x={left} y={height - 4}>W</text>
      <text x={left + plotW} y={height - 4} textAnchor="end">E</text>
    </svg>
  );
}

function Rose({ bins }: { bins: readonly number[] }) {
  const peak = Math.max(...bins, 1);
  const cx = 70;
  const cy = 62;
  const rings = [16, 32, 46];
  const spokes = bins.map((value, index) => {
    const angle = (-Math.PI / 2) + (index / bins.length) * Math.PI;
    const length = (value / peak) * 46;
    const x2 = cx + Math.cos(angle) * length;
    const y2 = cy + Math.sin(angle) * length;
    const ox = cx - Math.cos(angle) * length;
    const oy = cy - Math.sin(angle) * length;
    return `${ox},${oy} ${x2},${y2}`;
  });
  return (
    <svg className="site-figure-chart" viewBox="0 0 140 120" role="img" aria-label="Directional distribution">
      {rings.map((ring) => <circle key={ring} cx={cx} cy={cy} r={ring} fill="none" stroke="rgba(242,242,238,0.16)" strokeWidth="0.6" />)}
      <line x1={cx} y1={cy - 46} x2={cx} y2={cy + 46} stroke="rgba(242,242,238,0.2)" strokeWidth="0.5" />
      <line x1={cx - 46} y1={cy} x2={cx + 46} y2={cy} stroke="rgba(242,242,238,0.2)" strokeWidth="0.5" />
      {spokes.map((points) => <polyline key={points} points={points} fill="none" stroke="#49d7de" strokeWidth="0.9" />)}
      <text x={cx} y="12" textAnchor="middle">N</text>
      <text x={cx + 52} y={cy + 3} textAnchor="start">E</text>
      <text x={cx - 52} y={cy + 3} textAnchor="end">W</text>
    </svg>
  );
}

export function SiteNetworkFigures({ figures }: { figures: NetworkFigures }) {
  const directed = figures.rose.some((value) => value > 0);
  const flow = figures.measure === "conductivity";
  return (
    <div className="site-figure-board">
      <figure>
        <figcaption>Density</figcaption>
        <Plate pixels={figures.density} size={figures.size} label={flow ? "Conductivity" : "Density"} />
        <p>{figures.peaks} {flow ? "conductivity peaks" : "peaks"}</p>
      </figure>
      <figure>
        <figcaption>Profile</figcaption>
        <Profile values={figures.profile} />
      </figure>
      <figure>
        <figcaption>Direction</figcaption>
        {directed ? <Rose bins={figures.rose} /> : <p>{flow ? "No direction in this network." : "No direction in this trail."}</p>}
      </figure>
      <figure>
        <figcaption>Connectivity</figcaption>
        <Plate pixels={figures.connectivity} size={figures.size} label={flow ? "Connected conductivity" : "Connected trail regions"} />
        <p>{figures.components === 0 ? (flow ? "No conductivity" : "No trail") : `${figures.components} connected`}</p>
      </figure>
      <figure>
        <figcaption>Hierarchy</figcaption>
        <Plate pixels={figures.hierarchy} size={figures.size} label="Hierarchy" />
        <p>{flow ? "White higher conductivity · teal lighter" : "White reinforced · teal lighter"}</p>
      </figure>
    </div>
  );
}
