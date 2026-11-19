"use client";

import { displayedMph, type WindSector } from "@/lib/skill5/wind";

/** Full wedge radius is this share of moving hours, in every season. */
export const WIND_ROSE_FULL_SHARE = 0.3;

const TEAL = [15, 115, 119] as const;
const COPPER = [199, 126, 95] as const;

function point(degrees: number, radius: number) {
  const radians = (degrees * Math.PI) / 180;
  return [100 + radius * Math.sin(radians), 100 - radius * Math.cos(radians)] as const;
}

/** Half of a 22.5° sector, held just inside the boundary so neighbors stay separate. */
const WEDGE_HALF = 11.05;
const ROSE_INNER = 1.5;
const ROSE_OUTER = 88;

function wedge(center: number, inner: number, outer: number) {
  const start = center - WEDGE_HALF;
  const end = center + WEDGE_HALF;
  const [x0, y0] = point(start, outer);
  const [x1, y1] = point(end, outer);
  const [ix0, iy0] = point(start, inner);
  const [ix1, iy1] = point(end, inner);
  return `M ${ix0} ${iy0} L ${x0} ${y0} A ${outer} ${outer} 0 0 1 ${x1} ${y1} L ${ix1} ${iy1} A ${inner} ${inner} 0 0 0 ${ix0} ${iy0} Z`;
}

export function windSpeedColor(speed: number, slow: number, fast: number) {
  const span = fast - slow;
  const t = span <= 0 ? 1 : Math.min(1, Math.max(0, (speed - slow) / span));
  const rgb = TEAL.map((channel, index) => Math.round(channel + (COPPER[index] - channel) * t));
  return `rgb(${rgb.join(", ")})`;
}

export function WindRose({
  sectors,
  movingHours,
  prevailingIndex,
  slow,
  fast,
}: {
  sectors: readonly WindSector[];
  movingHours: number;
  prevailingIndex: number | null;
  slow: number;
  fast: number;
}) {
  const radiusAt = (share: number) => ROSE_INNER + (Math.min(share, WIND_ROSE_FULL_SHARE) / WIND_ROSE_FULL_SHARE) * (ROSE_OUTER - ROSE_INNER);
  const labelRadius = ROSE_OUTER + 5.2;
  const labels = [
    ["N", 0],
    ["E", 90],
    ["S", 180],
    ["W", 270],
  ] as const;
  return (
    <svg className="site-wind-rose" viewBox="0 0 200 200" role="img" aria-label="Sixteen-direction wind rose. Wedge length is the share of moving hours. Color is the wedge mean speed.">
      {[0.15, WIND_ROSE_FULL_SHARE].map((share) => (
        <circle key={share} className="site-wind-rose-ring" data-outer={share === WIND_ROSE_FULL_SHARE || undefined} cx="100" cy="100" r={radiusAt(share)} />
      ))}
      {sectors.map((sector) => {
        if (sector.hours === 0 || movingHours <= 0) return null;
        const share = sector.hours / movingHours;
        const prevailing = sector.index === prevailingIndex;
        return (
          <path
            key={sector.index}
            d={wedge(sector.center, ROSE_INNER, radiusAt(share))}
            data-wedge="true"
            data-prevailing={prevailing || undefined}
            style={{ fill: windSpeedColor(sector.meanSpeed, slow, fast) }}
            aria-label={`${sector.name}, ${Math.round(share * 100)} percent of moving hours, ${displayedMph(sector.meanSpeed).toFixed(1)} miles per hour`}
          />
        );
      })}
      {labels.map(([label, bearing]) => {
        const [x, y] = point(bearing, labelRadius);
        return (
          <text key={label} x={x} y={y} dominantBaseline="middle">
            {label}
          </text>
        );
      })}
    </svg>
  );
}
