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
    const image = context.createImageData(size, size);
    image.data.set(pixels);
    context.putImageData(image, 0, 0);
  }, [pixels, size]);
  return <canvas ref={ref} className="site-figure-plate" aria-label={label} />;
}

function Profile({ values }: { values: readonly number[] }) {
  const width = 160;
  const height = 64;
  const step = width / Math.max(1, values.length - 1);
  const line = values.map((value, index) => `${index * step},${height - value * (height - 8) - 4}`).join(" ");
  const area = `0,${height} ${line} ${width},${height}`;
  return (
    <svg className="site-figure-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="East west density profile">
      <polygon points={area} fill="rgba(15, 115, 119, 0.35)" />
      <polyline points={line} fill="none" stroke="#49d7de" strokeWidth="1.4" />
      <text x="2" y="14">W</text>
      <text x={width - 14} y="14">E</text>
    </svg>
  );
}

function Rose({ bins }: { bins: readonly number[] }) {
  const peak = Math.max(...bins, 1);
  const cx = 50;
  const cy = 50;
  const spokes = bins.map((value, index) => {
    const angle = (-Math.PI / 2) + (index / bins.length) * Math.PI;
    const length = 8 + (value / peak) * 34;
    const x2 = cx + Math.cos(angle) * length;
    const y2 = cy + Math.sin(angle) * length;
    const ox = cx - Math.cos(angle) * length;
    const oy = cy - Math.sin(angle) * length;
    return `${ox},${oy} ${x2},${y2}`;
  });
  return (
    <svg className="site-figure-chart" viewBox="0 0 100 100" role="img" aria-label="Directional distribution">
      <circle cx={cx} cy={cy} r="36" fill="none" stroke="rgba(73, 215, 222, 0.25)" />
      <circle cx={cx} cy={cy} r="18" fill="none" stroke="rgba(73, 215, 222, 0.18)" />
      {spokes.map((points) => <polyline key={points} points={points} fill="none" stroke="#49d7de" strokeWidth="1.6" />)}
      <text x="44" y="14">N</text>
    </svg>
  );
}

export function SiteNetworkFigures({ figures }: { figures: NetworkFigures }) {
  const directed = figures.rose.some((value) => value > 0);
  return (
    <div className="site-figure-board">
      <figure>
        <figcaption>Density</figcaption>
        <Plate pixels={figures.density} size={figures.size} label="Density" />
        <p>{figures.peaks} peaks</p>
      </figure>
      <figure>
        <figcaption>Profile</figcaption>
        <Profile values={figures.profile} />
      </figure>
      <figure>
        <figcaption>Direction</figcaption>
        {directed ? <Rose bins={figures.rose} /> : <p>No direction in this trail.</p>}
      </figure>
      <figure>
        <figcaption>Connectivity</figcaption>
        <Plate pixels={figures.connectivity} size={figures.size} label="Connected trail regions" />
        <p>{figures.components === 0 ? "No trail" : `${figures.components} connected`}</p>
      </figure>
      <figure>
        <figcaption>Hierarchy</figcaption>
        <Plate pixels={figures.hierarchy} size={figures.size} label="Hierarchy" />
        <p>White reinforced · teal lighter</p>
      </figure>
    </div>
  );
}
