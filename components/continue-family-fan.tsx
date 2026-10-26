"use client";

import { useEffect, useId, useRef, useState } from "react";

type FamilyGroup = {
  focus: string;
  start: number;
  end: number;
  count: number;
};

type Plate = { size: number; values: Uint8Array } | null;

const DISPLAY = [
  "Formal",
  "Spatial",
  "Atmospheric",
  "Formal + Spatial",
  "Formal + Atmospheric",
  "Spatial + Atmospheric",
  "Formal + Spatial + Atmospheric",
] as const;

const ACCENT: Record<string, string> = {
  Formal: "#7ec8c6",
  Spatial: "#e0a080",
  Atmospheric: "#f2f2ee",
  "Formal + Spatial": "#c4b6ac",
  "Formal + Atmospheric": "#d5e0dc",
  "Spatial + Atmospheric": "#e6d5c8",
  "Formal + Spatial + Atmospheric": "#f4f1ea",
};

function rangeLabel(group: FamilyGroup) {
  const from = `N${String(group.start).padStart(2, "0")}`;
  const to = `N${String(group.end).padStart(2, "0")}`;
  return `${from}–${to}`;
}

function flowGeometry(y0: number, y1: number, width: number) {
  const x0 = 10;
  const x1 = width;
  const c1x = x0 + width * 0.2;
  const c2x = x1 - width * 0.34;
  return `M ${x0} ${y0} C ${c1x} ${y0}, ${c2x} ${y1}, ${x1} ${y1}`;
}

function paintOrigin(canvas: HTMLCanvasElement, plate: Plate) {
  const parent = canvas.parentElement;
  if (!parent) return;
  const dpr = window.devicePixelRatio || 1;
  const width = Math.max(1, parent.clientWidth);
  const height = Math.max(1, parent.clientHeight);
  canvas.width = Math.floor(width * dpr);
  canvas.height = Math.floor(height * dpr);
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, width, height);
  if (!plate) return;
  const size = plate.size;
  const image = document.createElement("canvas");
  image.width = size;
  image.height = size;
  const plateCtx = image.getContext("2d");
  if (!plateCtx) return;
  const pixels = plateCtx.createImageData(size, size);
  const data = pixels.data;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const tone = plate.values[y * size + x] ?? 0;
      const pixel = ((size - 1 - y) * size + x) * 4;
      data[pixel] = tone;
      data[pixel + 1] = tone;
      data[pixel + 2] = tone;
      data[pixel + 3] = 255;
    }
  }
  plateCtx.putImageData(pixels, 0, 0);
  const fit = Math.min(width / size, height / size);
  const destW = size * fit;
  const destH = size * fit;
  const destX = (width - destW) / 2;
  const destY = (height - destH) / 2;
  ctx.drawImage(image, 0, 0, size, size, destX, destY, destW, destH);
}

/** Horizontal summary of the 24 continuations across seven behavior families. Display only. */
export function ContinueFamilyFan({
  groups,
  activeFocus = null,
  selectedId = null,
  plate = null,
}: {
  groups: readonly FamilyGroup[];
  activeFocus?: string | null;
  selectedId?: string | null;
  plate?: Plate;
}) {
  const filterId = useId().replace(/:/g, "");
  const svgRef = useRef<SVGSVGElement>(null);
  const rowsRef = useRef<HTMLDivElement>(null);
  const originRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [hover, setHover] = useState<string | null>(null);
  const [size, setSize] = useState({ w: 480, h: 240 });
  const [anchors, setAnchors] = useState({ originY: 120, rows: [] as number[] });
  const byFocus = new Map(groups.map((group) => [group.focus, group]));
  const rows = DISPLAY.map((focus) => byFocus.get(focus)).filter((group): group is FamilyGroup => Boolean(group));
  const selectedGroup = rows.find((group) => {
    const number = selectedId && /^N\d{2}$/.test(selectedId) ? Number(selectedId.slice(1)) : null;
    return number != null && number >= group.start && number <= group.end;
  }) ?? null;

  useEffect(() => {
    const canvas = canvasRef.current;
    const parent = canvas?.parentElement;
    if (!canvas || !parent) return;
    const paint = () => paintOrigin(canvas, plate);
    paint();
    const observer = new ResizeObserver(paint);
    observer.observe(parent);
    return () => observer.disconnect();
  }, [plate]);

  useEffect(() => {
    const svg = svgRef.current;
    const list = rowsRef.current;
    const origin = originRef.current;
    if (!svg || !list || !origin) return;
    const measure = () => {
      const svgBox = svg.getBoundingClientRect();
      const originBox = origin.getBoundingClientRect();
      const nextSize = { w: Math.max(1, svgBox.width), h: Math.max(1, svgBox.height) };
      const originY = originBox.top + originBox.height / 2 - svgBox.top;
      const rowYs = [...list.querySelectorAll<HTMLElement>(".continue-flow-row")].map((row) => {
        const box = row.getBoundingClientRect();
        return box.top + box.height / 2 - svgBox.top;
      });
      setSize((current) => (Math.abs(current.w - nextSize.w) < 0.5 && Math.abs(current.h - nextSize.h) < 0.5 ? current : nextSize));
      setAnchors((current) => {
        const sameOrigin = Math.abs(current.originY - originY) < 0.5;
        const sameRows = current.rows.length === rowYs.length && current.rows.every((y, index) => Math.abs(y - rowYs[index]) < 0.5);
        return sameOrigin && sameRows ? current : { originY, rows: rowYs };
      });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(svg);
    observer.observe(list);
    observer.observe(origin);
    return () => observer.disconnect();
  }, [rows.length]);

  return (
    <div className="continue-fan">
      <p className="continue-fan-kicker">One verified Z0, twenty-four continuations, one selected</p>
      {selectedId ? (
        <p className="continue-selected">Selected · <strong>{selectedId}</strong>{selectedGroup ? ` · ${selectedGroup.focus}` : " · Extended continuation"}</p>
      ) : null}
      <div className="continue-flow" data-focus={hover ?? undefined} onMouseLeave={() => setHover(null)}>
        <figure className="continue-origin">
          <div className="continue-origin-frame" ref={originRef}>
            <canvas ref={canvasRef} aria-label="Selected Skill 2 state" />
          </div>
          <p className="continue-origin-label">Selected state</p>
        </figure>
        <svg
          ref={svgRef}
          className="continue-flows"
          viewBox={`0 0 ${size.w} ${size.h}`}
          role="img"
          aria-label="Seven continuation families flowing from the selected state"
        >
          <defs>
            {rows.map((group) => {
              const accent = ACCENT[group.focus] ?? "#f2f2ee";
              const neutral = group.focus.includes("+");
              return (
                <linearGradient key={group.focus} id={`${filterId}-${group.start}`} gradientUnits="userSpaceOnUse" x1="0" y1="0" x2={size.w} y2="0">
                  <stop offset="0%" stopColor={neutral ? "#a3a39e" : accent} stopOpacity={neutral ? 0.28 : 0.22} />
                  <stop offset="58%" stopColor={neutral ? "#b7b7b2" : accent} stopOpacity={neutral ? 0.45 : 0.78} />
                  <stop offset="100%" stopColor={accent} stopOpacity={group.count > 3 ? 0.95 : 0.82} />
                </linearGradient>
              );
            })}
            <filter id={`${filterId}-glow`} filterUnits="userSpaceOnUse" x={-16} y={-20} width={size.w + 32} height={size.h + 40}>
              <feGaussianBlur stdDeviation="1.5" />
            </filter>
          </defs>
          {rows.map((group, index) => {
            const y1 = anchors.rows[index] ?? ((index + 0.5) / rows.length) * size.h;
            const path = flowGeometry(anchors.originY, y1, size.w);
            const broad = group.count > 3;
            const core = broad ? 3.1 : 2.15;
            const hot = hover === group.focus;
            return (
              <g
                key={group.focus}
                className="continue-flow-path"
                data-hot={hot ? "" : undefined}
                data-live={activeFocus === group.focus ? "true" : "false"}
                onMouseEnter={() => setHover(group.focus)}
              >
                <path d={path} fill="none" stroke="transparent" strokeWidth={16} />
                <path d={path} fill="none" stroke={`url(#${filterId}-${group.start})`} strokeWidth={broad ? 5.2 : 4} strokeLinecap="round" opacity={broad ? 0.28 : 0.16} filter={`url(#${filterId}-glow)`} />
                <path d={path} fill="none" stroke={`url(#${filterId}-${group.start})`} strokeWidth={core} strokeLinecap="round" />
              </g>
            );
          })}
          <circle className="continue-flow-origin" cx={10} cy={anchors.originY} r={3.1} />
          <circle className="continue-flow-origin-ring" cx={10} cy={anchors.originY} r={5.4} />
        </svg>
        <div className="continue-flow-rows" ref={rowsRef}>
          {rows.map((group) => (
            <div
              key={group.focus}
              className="continue-flow-row"
              data-hot={hover === group.focus ? "" : undefined}
              data-live={activeFocus === group.focus ? "true" : "false"}
              onMouseEnter={() => setHover(group.focus)}
              onFocus={() => setHover(group.focus)}
              onBlur={() => setHover((current) => (current === group.focus ? null : current))}
              tabIndex={0}
              role="group"
              aria-label={`${group.focus}, ${group.count} continuations, ${rangeLabel(group)}`}
            >
              <span className="continue-flow-name" data-family={group.focus.includes("+") ? "mixed" : group.focus.toLowerCase()}>
                {group.focus}
                {selectedGroup?.focus === group.focus ? (
                  <span className="continue-flow-ticks" aria-label={`${selectedId} in ${group.focus}`}>
                    {Array.from({ length: group.count }, (_, index) => {
                      const id = `N${String(group.start + index).padStart(2, "0")}`;
                      return <i key={id} data-selected={id === selectedId ? "" : undefined} />;
                    })}
                  </span>
                ) : null}
              </span>
              <span className="continue-flow-count">{group.count}</span>
              <p className="continue-flow-tip">{rangeLabel(group)}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
