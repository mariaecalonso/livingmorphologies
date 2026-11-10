"use client";

import type { WindSector } from "@/lib/skill5/wind";

function point(degrees: number, radius: number) {
  const radians = (degrees * Math.PI) / 180;
  return [100 + radius * Math.sin(radians), 100 - radius * Math.cos(radians)] as const;
}

function wedge(center: number, inner: number, outer: number) {
  const start = center - 11.25;
  const end = center + 11.25;
  const [x0, y0] = point(start, outer);
  const [x1, y1] = point(end, outer);
  const [ix0, iy0] = point(start, inner);
  const [ix1, iy1] = point(end, inner);
  return `M ${ix0} ${iy0} L ${x0} ${y0} A ${outer} ${outer} 0 0 1 ${x1} ${y1} L ${ix1} ${iy1} A ${inner} ${inner} 0 0 0 ${ix0} ${iy0} Z`;
}

export function WindRose({
  sectors,
  selected,
  onSelect,
}: {
  sectors: readonly WindSector[];
  selected: number | null;
  onSelect: (index: number | null) => void;
}) {
  const peak = Math.max(1, ...sectors.map((sector) => sector.hours));
  const fastest = Math.max(1, ...sectors.map((sector) => sector.meanSpeed));
  return (
    <svg className="site-wind-rose" viewBox="0 0 200 200" role="group" aria-label="Wind rose">
      {[28, 52, 76].map((radius) => <circle key={radius} cx="100" cy="100" r={radius} />)}
      <path d="M100 18 V182 M18 100 H182" />
      {sectors.map((sector) => {
        if (sector.hours === 0) return null;
        const outer = 24 + (sector.hours / peak) * 62;
        const active = selected === sector.index;
        return (
          <path
            key={sector.index}
            d={wedge(sector.center, 16, outer)}
            data-active={active || undefined}
            style={{ opacity: 0.34 + 0.66 * (sector.meanSpeed / fastest) }}
            role="button"
            tabIndex={0}
            aria-pressed={active}
            aria-label={`${sector.name}, ${sector.hours} hours, ${sector.meanSpeed.toFixed(1)} meters per second`}
            onClick={() => onSelect(active ? null : sector.index)}
            onKeyDown={(event) => {
              if (event.key !== "Enter" && event.key !== " ") return;
              event.preventDefault();
              onSelect(active ? null : sector.index);
            }}
          />
        );
      })}
      <text x="100" y="16">N</text>
      <text x="184" y="104">E</text>
      <text x="100" y="194">S</text>
      <text x="16" y="104">W</text>
    </svg>
  );
}
