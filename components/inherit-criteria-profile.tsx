"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { ArchitecturalIntentBranch, ArchitecturalIntentLevel, ArchitecturalIntentProfile } from "@/lib/architectural-intent";

const FAMILIES = ["formal", "spatial", "atmospheric"] as const;
const LEVELS = ["low", "medium", "high"] as const;
const COLUMN = [16, 50, 84];
const LABEL = { low: "Low", medium: "Medium", high: "High" } as const;

type FamilyId = (typeof FAMILIES)[number];

/** Mean of the stored 0–2 ratings, placed on the nearest Low / Medium / High column. */
function familySummary(branch: ArchitecturalIntentBranch | undefined) {
  const criteria = branch?.criteria ?? [];
  if (criteria.length === 0) return null;
  const mean = criteria.reduce((sum, criterion) => sum + criterion.rating, 0) / criteria.length;
  const level = LEVELS[Math.min(2, Math.max(0, Math.round(mean)))];
  return { level, score: mean / 2 };
}

/** One smooth spline through the selected points. Stroked, never filled. */
function glowSpline(points: { x: number; y: number }[]) {
  return points.slice(1).reduce((path, point, index) => {
    const from = points[index];
    const pull = Math.abs(point.x - from.x) * 0.55;
    const dir = point.x >= from.x ? 1 : -1;
    return `${path} C ${from.x + dir * pull} ${from.y}, ${point.x - dir * pull} ${point.y}, ${point.x} ${point.y}`;
  }, `M ${points[0].x} ${points[0].y}`);
}

function FamilyJoin({ points }: { points: { x: number; y: number }[] }) {
  const filterId = useId().replace(/:/g, "");
  const svgRef = useRef<SVGSVGElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const host = svgRef.current?.parentElement;
    if (!host) return;
    const measure = () => {
      const rect = host.getBoundingClientRect();
      setSize({ w: Math.max(1, rect.width), h: Math.max(1, rect.height) });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(host);
    return () => observer.disconnect();
  }, []);
  const pixels = size.w > 1 ? points.map((point) => ({ x: (point.x / 100) * size.w, y: (point.y / 100) * size.h })) : [];
  const ready = pixels.length > 1;
  const spline = ready ? glowSpline(pixels) : "";
  const pad = 140;
  return (
    <svg ref={svgRef} className="inherit-join" viewBox={`0 0 ${Math.max(1, size.w)} ${Math.max(1, size.h)}`} aria-hidden="true">
      {ready ? (
        <>
          <defs>
            <linearGradient id={`${filterId}-color`} gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2={size.h}>
              <stop offset="0%" stopColor="#02b3bb" />
              <stop offset="20%" stopColor="#02b3bb" />
              <stop offset="36%" stopColor="#f89762" />
              <stop offset="50%" stopColor="#ff8a45" />
              <stop offset="62%" stopColor="#f3c4ae" />
              <stop offset="76%" stopColor="#ffffff" />
              <stop offset="100%" stopColor="#ffffff" />
            </linearGradient>
            <linearGradient id={`${filterId}-hot`} gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2={size.h}>
              <stop offset="0%" stopColor="#d7ffff" />
              <stop offset="22%" stopColor="#d7ffff" />
              <stop offset="40%" stopColor="#fff1dc" />
              <stop offset="52%" stopColor="#fff6e8" />
              <stop offset="68%" stopColor="#fff7f4" />
              <stop offset="80%" stopColor="#ffffff" />
              <stop offset="100%" stopColor="#ffffff" />
            </linearGradient>
            <filter id={`${filterId}-outer`} filterUnits="userSpaceOnUse" x={-pad} y={-pad} width={size.w + pad * 2} height={size.h + pad * 2}>
              <feGaussianBlur stdDeviation="28" />
            </filter>
            <filter id={`${filterId}-mid`} filterUnits="userSpaceOnUse" x={-pad} y={-pad} width={size.w + pad * 2} height={size.h + pad * 2}>
              <feGaussianBlur stdDeviation="16" />
            </filter>
            <filter id={`${filterId}-core`} filterUnits="userSpaceOnUse" x={-pad} y={-pad} width={size.w + pad * 2} height={size.h + pad * 2}>
              <feGaussianBlur stdDeviation="6" />
            </filter>
          </defs>
          <path d={spline} fill="none" stroke={`url(#${filterId}-color)`} strokeWidth="110" strokeLinecap="round" strokeLinejoin="round" opacity="0.32" filter={`url(#${filterId}-outer)`} />
          <path d={spline} fill="none" stroke={`url(#${filterId}-color)`} strokeWidth="64" strokeLinecap="round" strokeLinejoin="round" opacity="0.42" filter={`url(#${filterId}-mid)`} />
          <path d={spline} fill="none" stroke={`url(#${filterId}-hot)`} strokeWidth="22" strokeLinecap="round" strokeLinejoin="round" opacity="0.24" filter={`url(#${filterId}-core)`} />
        </>
      ) : null}
    </svg>
  );
}

function FamilyChart({
  family,
  level,
}: {
  family: FamilyId;
  level: ArchitecturalIntentLevel | null;
}) {
  const selected = level == null ? -1 : LEVELS.indexOf(level);
  return (
    <div className="inherit-lane" data-family={family}>
      <i className="inherit-lane-line" />
      {LEVELS.map((step, index) => (
        index === selected ? (
          <i key={step} className="inherit-lane-node" style={{ left: `${COLUMN[index]}%` }} />
        ) : (
          <i key={step} className="inherit-lane-dot" style={{ left: `${COLUMN[index]}%` }} />
        )
      ))}
    </div>
  );
}

/** One summary position per family. Reads stored ratings and does not change them. */
export function InheritFamilySummary({ profile }: { profile: ArchitecturalIntentProfile | null }) {
  const rows = FAMILIES.map((family) => ({ family, summary: familySummary(profile?.[family]) }));
  return (
    <div className="inherit-summary">
      <div className="inherit-chart">
        <div className="inherit-chart-names">
          {rows.map((row) => (
            <span key={row.family} data-family={row.family}>{row.family}</span>
          ))}
        </div>
        <div className="inherit-chart-plot">
          <div className="inherit-chart-scale">
            {LEVELS.map((level, index) => (
              <span key={level} style={{ left: `${COLUMN[index]}%` }}>{LABEL[level]}</span>
            ))}
          </div>
          <div className="inherit-lanes">
            {COLUMN.map((column) => (
              <i key={column} className="inherit-guide" style={{ left: `${column}%` }} />
            ))}
            <FamilyJoin
              points={rows.flatMap((row, index) => {
                if (!row.summary) return [];
                return [{ x: COLUMN[LEVELS.indexOf(row.summary.level)], y: ((index + 0.5) / rows.length) * 100 }];
              })}
            />
            {rows.map((row) => (
              <FamilyChart key={row.family} family={row.family} level={row.summary?.level ?? null} />
            ))}
          </div>
        </div>
      </div>
      <aside className="inherit-meters" aria-label="Inherited criteria profile">
        {rows.map((row) => (
          <div key={row.family} className="inherit-meter" data-family={row.family}>
            <p className="inherit-meter-name"><i />{row.family}</p>
            <p className="inherit-meter-value">
              <span>{row.summary ? row.summary.score.toFixed(2) : "—"}</span>
              <span>{row.summary ? LABEL[row.summary.level] : ""}</span>
            </p>
            <span className="inherit-meter-track">
              <i style={{ width: row.summary ? `${row.summary.score * 100}%` : "0%" }} />
            </span>
          </div>
        ))}
      </aside>
    </div>
  );
}
