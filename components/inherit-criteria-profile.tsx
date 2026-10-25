"use client";

import { useId } from "react";
import type { ArchitecturalIntentCriterion, ArchitecturalIntentLevel } from "@/lib/architectural-intent";

const LEVELS = ["low", "medium", "high"] as const;
const WORDS: Record<ArchitecturalIntentLevel, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
};

const ROW = 15;
const WIDTH = 66;
const X = [11, 33, 55];

function trace(criteria: readonly ArchitecturalIntentCriterion[]) {
  const points = criteria.map((criterion, index) => ({
    x: X[LEVELS.indexOf(criterion.level)],
    y: index * ROW + ROW / 2,
  }));
  if (points.length < 2) return "";
  const parts = [`M ${points[0].x} ${points[0].y}`];
  for (let index = 0; index < points.length - 1; index += 1) {
    const from = points[index];
    const to = points[index + 1];
    const span = (to.y - from.y) * 0.55;
    parts.push(`C ${from.x} ${from.y + span} ${to.x} ${to.y - span} ${to.x} ${to.y}`);
  }
  return parts.join(" ");
}

/** Display of the inherited ratings. Reads the stored levels and does not change them. */
export function InheritCriteriaProfile({
  family,
  criteria,
}: {
  family: "formal" | "spatial" | "atmospheric";
  criteria: readonly ArchitecturalIntentCriterion[];
}) {
  const filterId = useId().replace(/:/g, "");
  const path = trace(criteria);
  const height = Math.max(1, criteria.length) * ROW;
  return (
    <div className="inherit-profile" data-family={family}>
      <div className="inherit-board">
        <span className="inherit-scale-marks" aria-hidden="true">
          <span>Low</span>
          <span>Medium</span>
          <span>High</span>
        </span>
        <div className="inherit-names">
          {criteria.map((criterion) => (
            <span key={criterion.id}>{criterion.label}</span>
          ))}
        </div>
        <svg
          className="inherit-trace"
          viewBox={`0 0 ${WIDTH} ${height}`}
          role="img"
          aria-label={`${family} inherited profile`}
          style={{ aspectRatio: `${WIDTH} / ${height}` }}
        >
          <defs>
            <filter id={`${filterId}-wide`} x="-60%" y="-35%" width="220%" height="170%">
              <feGaussianBlur stdDeviation="4.2" />
            </filter>
            <filter id={`${filterId}-tight`} x="-40%" y="-25%" width="180%" height="150%">
              <feGaussianBlur stdDeviation="1.35" />
            </filter>
          </defs>
          {path ? (
            <>
              <path d={path} className="inherit-glow-wide" filter={`url(#${filterId}-wide)`} />
              <path d={path} className="inherit-glow-tight" filter={`url(#${filterId}-tight)`} />
              <path d={path} className="inherit-glow-core" />
            </>
          ) : null}
          {criteria.map((criterion, index) => {
            const y = index * ROW + ROW / 2;
            const selected = LEVELS.indexOf(criterion.level);
            return LEVELS.map((level, slot) => {
              const active = slot === selected;
              return (
                <g key={`${criterion.id}-${level}`}>
                  {active ? <circle className="inherit-point-halo" cx={X[slot]} cy={y} r="6.2" /> : null}
                  <circle
                    className={active ? "inherit-point-on" : "inherit-point-off"}
                    cx={X[slot]}
                    cy={y}
                    r={active ? 2.55 : 1.55}
                  />
                </g>
              );
            });
          })}
        </svg>
        <div className="inherit-values">
          {criteria.map((criterion) => (
            <span key={criterion.id}>{WORDS[criterion.level]}</span>
          ))}
        </div>
      </div>
    </div>
  );
}
