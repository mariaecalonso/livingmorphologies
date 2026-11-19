"use client";

import { useMemo } from "react";
import type { SunScenarioRecord } from "@/lib/skill5/site-analysis-bundle";
import { daySunPath, type DaySunSample, type SolarSeasonId } from "@/lib/skill5/solar";
import type { XZ } from "@/lib/skill5/site-model";

const SEASONS: { id: SolarSeasonId; label: string }[] = [
  { id: "spring", label: "Spring" },
  { id: "summer", label: "Summer" },
  { id: "fall", label: "Fall" },
  { id: "winter", label: "Winter" },
];

const TIMES: { id: SunScenarioRecord["time"]; label: string }[] = [
  { id: "morning", label: "Morning" },
  { id: "noon", label: "Noon" },
  { id: "afternoon", label: "Afternoon" },
];

/** Same stops as the 0–100% legend. Alpha is part of the scale, so cells sample it in premultiplied sRGB, matching the CSS gradient. */
const EXPOSURE_STOPS: readonly { at: number; rgb: readonly [number, number, number]; alpha: number }[] = [
  { at: 0, rgb: [15, 115, 119], alpha: 0.82 },
  { at: 0.46, rgb: [255, 255, 255], alpha: 0.2 },
  { at: 1, rgb: [199, 126, 95], alpha: 0.78 },
];

const EXPOSURE_SCALE = `linear-gradient(90deg, ${EXPOSURE_STOPS.map((stop) => `rgba(${stop.rgb[0]}, ${stop.rgb[1]}, ${stop.rgb[2]}, ${stop.alpha}) ${stop.at * 100}%`).join(", ")})`;

type PlanFrame = ReturnType<typeof parcelFrame>;
type ShadeSample = { x: number; z: number; shaded: number; total: number };

function parcelFrame(ring: readonly XZ[]) {
  const xs = ring.map((point) => point[0]);
  const zs = ring.map((point) => point[1]);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minZ = Math.min(...zs);
  const maxZ = Math.max(...zs);
  const spanX = Math.max(1, maxX - minX);
  const spanZ = Math.max(1, maxZ - minZ);
  const pad = 6;
  const northRoom = 16;
  const northToTheRight = spanZ >= spanX;
  const along = northToTheRight ? spanZ : spanX;
  const across = northToTheRight ? spanX : spanZ;
  const viewW = 168;
  const innerW = viewW - pad - northRoom;
  const viewH = Math.round(innerW * (across / along)) + pad * 2;
  const scale = Math.min(innerW / along, (viewH - pad * 2) / across);
  const drawnAlong = along * scale;
  const drawnAcross = across * scale;
  const ox = pad + (innerW - drawnAlong) / 2;
  const oy = pad + (viewH - pad * 2 - drawnAcross) / 2;
  const at = (x: number, z: number) => northToTheRight
    ? { x: ox + (z - minZ) * scale, y: oy + (maxX - x) * scale }
    : { x: ox + (x - minX) * scale, y: oy + (maxZ - z) * scale };
  const northLen = 9;
  return {
    viewW,
    viewH,
    at,
    scale,
    northX: viewW - northRoom + 2,
    northY: viewH / 2,
    northLen,
    northRight: northToTheRight,
    outline: ring.map((point) => {
      const placed = at(point[0], point[1]);
      return `${placed.x.toFixed(2)},${placed.y.toFixed(2)}`;
    }).join(" "),
  };
}

function NorthMark({ frame }: { frame: PlanFrame }) {
  const head = 2.6;
  if (frame.northRight) {
    const y = frame.northY;
    const tail = frame.northX;
    const tip = tail + frame.northLen;
    return (
      <g className="site-sun-north">
        <line x1={tail} y1={y} x2={tip - 0.2} y2={y} />
        <polyline points={`${tip - head},${y - head * 0.62} ${tip},${y} ${tip - head},${y + head * 0.62}`} />
        <text x={(tail + tip) / 2} y={y - 3.4} textAnchor="middle" dominantBaseline="middle">N</text>
      </g>
    );
  }
  const x = frame.northX;
  const tip = frame.northY;
  const tail = tip + frame.northLen;
  return (
    <g className="site-sun-north">
      <line x1={x} y1={tail} x2={x} y2={tip + 0.2} />
      <polyline points={`${x - head * 0.62},${tip + head} ${x},${tip} ${x + head * 0.62},${tip + head}`} />
      <text x={x + 2.2} y={tip + frame.northLen * 0.55} textAnchor="start" dominantBaseline="middle">N</text>
    </g>
  );
}

function exposurePercent(scenario: SunScenarioRecord) {
  const total = scenario.exposed + scenario.shaded;
  return total > 0 ? (100 * scenario.exposed) / total : null;
}

function exposureFill(percent: number) {
  const mix = Math.min(1, Math.max(0, percent / 100));
  let left = EXPOSURE_STOPS[0];
  let right = EXPOSURE_STOPS[EXPOSURE_STOPS.length - 1];
  for (let index = 0; index < EXPOSURE_STOPS.length - 1; index += 1) {
    if (mix <= EXPOSURE_STOPS[index + 1].at) {
      left = EXPOSURE_STOPS[index];
      right = EXPOSURE_STOPS[index + 1];
      break;
    }
  }
  const span = right.at - left.at || 1;
  const t = (mix - left.at) / span;
  const alpha = left.alpha + (right.alpha - left.alpha) * t;
  const channel = (index: number) => {
    const from = left.rgb[index] * left.alpha;
    const to = right.rgb[index] * right.alpha;
    return Math.round((from + (to - from) * t) / alpha);
  };
  return `rgba(${channel(0)}, ${channel(1)}, ${channel(2)}, ${alpha.toFixed(3)})`;
}

function exposureInk() {
  return "rgba(255, 255, 255, 0.88)";
}

function shadeTone(count: number) {
  if (count <= 0) return "rgba(118, 120, 122, 0.34)";
  const mix = Math.min(1, Math.max(0, count / 12));
  const channel = (from: number, to: number) => Math.round(from + (to - from) * mix);
  return `rgb(${channel(28, 46)}, ${channel(112, 148)}, ${channel(110, 142)})`;
}

function shadeRadius(base: number, count: number) {
  const mix = Math.min(1, Math.max(0, count / 12));
  return base * (0.62 + mix * 0.28);
}

function cellKey(x: number, z: number) {
  return `${x.toFixed(4)}:${z.toFixed(4)}`;
}

function comparableShade(scenarios: readonly SunScenarioRecord[]): ShadeSample[] | null {
  if (scenarios.length === 0) return null;
  const maps = scenarios.map((scenario) => {
    const cells = new Map<string, SunScenarioRecord["cells"][number]>();
    for (const cell of scenario.cells) {
      const key = cellKey(cell.x, cell.z);
      if (cells.has(key)) return null;
      cells.set(key, cell);
    }
    return cells;
  });
  if (maps.some((cells) => cells === null)) return null;
  const located = maps as Map<string, SunScenarioRecord["cells"][number]>[];
  const keys = [...located[0].keys()];
  const aligned = located.every((cells) => cells.size === keys.length && keys.every((key) => cells.has(key)));
  if (!aligned) return null;
  return keys.map((key) => {
    const origin = located[0].get(key);
    if (!origin) return null;
    let shaded = 0;
    for (const cells of located) {
      const cell = cells.get(key);
      if (!cell) return null;
      if (!cell.exposed) shaded += 1;
    }
    return { x: origin.x, z: origin.z, shaded, total: located.length };
  }).filter((sample): sample is ShadeSample => sample !== null);
}

function domePath(samples: readonly DaySunSample[], x: (azimuth: number) => number, y: (altitude: number) => number) {
  const runs: string[] = [];
  let run: DaySunSample[] = [];
  const close = () => {
    if (run.length < 2) {
      run = [];
      return;
    }
    const line = run.map((sample, index) => `${index === 0 ? "M" : "L"}${x(sample.azimuth).toFixed(2)},${y(sample.altitude).toFixed(2)}`).join(" ");
    const ground = y(0).toFixed(2);
    runs.push(`${line} L${x(run[run.length - 1].azimuth).toFixed(2)},${ground} L${x(run[0].azimuth).toFixed(2)},${ground} Z`);
    run = [];
  };
  for (const sample of samples) {
    const previous = run[run.length - 1];
    if (previous && Math.abs(sample.azimuth - previous.azimuth) > 40) close();
    run.push(sample);
  }
  close();
  return runs.join(" ");
}

export function SolarPosition({
  scenario,
  seasonLabel,
  timeLabel,
  latitude,
  longitude,
}: {
  scenario: SunScenarioRecord;
  seasonLabel: string;
  timeLabel: string;
  latitude: number;
  longitude: number;
}) {
  const path = useMemo(
    () => daySunPath(latitude, longitude, scenario.date).filter((sample) => sample.above),
    [latitude, longitude, scenario.date],
  );
  const width = 320;
  const height = 126;
  const plot = { left: 28, right: 12, top: 10, bottom: 18 };
  const azimuths = [...path.map((sample) => sample.azimuth), scenario.azimuth];
  const azimuthMin = Math.min(...azimuths);
  const azimuthMax = Math.max(...azimuths);
  const azimuthPad = Math.max(6, (azimuthMax - azimuthMin) * 0.06);
  const azimuth0 = azimuthMin - azimuthPad;
  const azimuth1 = azimuthMax + azimuthPad;
  const x = (azimuth: number) => plot.left + ((azimuth - azimuth0) / Math.max(azimuth1 - azimuth0, 1)) * (width - plot.left - plot.right);
  const y = (altitude: number) => plot.top + (1 - Math.min(90, Math.max(0, altitude)) / 90) * (height - plot.top - plot.bottom);
  const dome = domePath(path, x, y);
  const marker = { x: x(scenario.azimuth), y: y(scenario.altitude) };
  const total = scenario.exposed + scenario.shaded;
  const exposure = total > 0 ? (100 * scenario.exposed) / total : 0;
  const caption = `${seasonLabel} ${timeLabel}. Solar altitude ${scenario.altitude.toFixed(1)} degrees at azimuth ${scenario.azimuth.toFixed(1)} degrees. ${scenario.exposed} exposed and ${scenario.shaded} shaded samples, ${exposure.toFixed(1)} percent exposed.`;
  return (
    <div className="site-sun-position">
      <svg className="site-sun-path" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMidYMid meet" role="img" aria-label={caption}>
        <defs>
          <linearGradient id="site-sun-arc-stroke" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#e4e2dc" />
            <stop offset="62%" stopColor="#cfd4d2" />
            <stop offset="100%" stopColor="#8fb8b6" />
          </linearGradient>
        </defs>
        {[0, 45, 90].map((altitude) => (
          <g key={altitude}>
            <line data-axis="yes" x1={plot.left} x2={width - plot.right} y1={y(altitude)} y2={y(altitude)} />
            <text x={plot.left - 4} y={y(altitude)} textAnchor="end" dominantBaseline="middle">{altitude}°</text>
          </g>
        ))}
        {dome ? <path data-dome="yes" d={dome} /> : null}
        <line data-ray="yes" x1={marker.x} x2={marker.x} y1={marker.y} y2={y(0)} />
        <circle cx={marker.x} cy={marker.y} r="3.4" />
        <text x={x(azimuth0)} y={height - 4} textAnchor="start">{Math.round(azimuth0)}°</text>
        <text x={x(azimuth1)} y={height - 4} textAnchor="end">{Math.round(azimuth1)}°</text>
      </svg>
      <dl className="site-sun-measures">
        <div><dt>Season</dt><dd>{seasonLabel}</dd></div>
        <div><dt>Time</dt><dd>{timeLabel}</dd></div>
        <div><dt>Altitude</dt><dd>{scenario.altitude.toFixed(1)}°</dd></div>
        <div><dt>Exposed</dt><dd>{scenario.exposed}</dd></div>
        <div><dt>Shaded</dt><dd>{scenario.shaded}</dd></div>
        <div><dt>Exposure</dt><dd>{exposure.toFixed(1)}%</dd></div>
      </dl>
    </div>
  );
}

export function ExposureComparison({
  scenarios,
  activeDate,
  activeTime,
}: {
  scenarios: readonly SunScenarioRecord[];
  activeDate: string;
  activeTime: string;
}) {
  const values = scenarios.flatMap((scenario) => {
    const percent = exposurePercent(scenario);
    return percent === null ? [] : [percent];
  });
  const low = values.length > 0 ? Math.min(...values) : null;
  const high = values.length > 0 ? Math.max(...values) : null;
  return (
    <div className="site-sun-heat">
      <div className="site-sun-heat-grid" role="img" aria-label="Exposure percentage for 12 season and time scenarios. The selected scenario is outlined.">
        <span />
        {TIMES.map((time) => (
          <span key={time.id} className="site-sun-matrix-label">{time.label}</span>
        ))}
        {SEASONS.map((season) => (
          [
            <span key={`${season.id}-label`} className="site-sun-matrix-label">{season.label}</span>,
            ...TIMES.map((time) => {
              const item = scenarios.find((scenario) => scenario.season === season.id && scenario.time === time.id);
              const percent = item ? exposurePercent(item) : null;
              const active = item ? item.date === activeDate && item.clock === activeTime : false;
              return (
                <span
                  key={`${season.id}-${time.id}`}
                  className="site-sun-heat-cell"
                  data-ready={percent === null ? "no" : "yes"}
                  data-active={active ? "true" : undefined}
                  style={percent === null ? undefined : { ["--heat" as string]: exposureFill(percent), color: exposureInk() }}
                >
                  {percent === null ? "—" : `${percent.toFixed(1)}%`}
                </span>
              );
            }),
          ]
        ))}
      </div>
      <div className="site-sun-scale" aria-hidden="true">
        <span>0%</span>
        <i style={{ background: EXPOSURE_SCALE }} />
        <span>100%</span>
      </div>
      {low !== null && high !== null ? (
        <p className="site-sun-range">Observed range {low.toFixed(1)}–{high.toFixed(1)}%</p>
      ) : null}
    </div>
  );
}

export function ShadeFrequency({
  ring,
  scenarios,
}: {
  ring: readonly XZ[];
  scenarios: readonly SunScenarioRecord[];
}) {
  const samples = useMemo(() => comparableShade(scenarios), [scenarios]);
  const frame = parcelFrame(ring);
  if (!samples) {
    return <p className="site-note">Sample locations are not the same across the 12 scenarios, so shade frequency is not aggregated.</p>;
  }
  const spacing = scenarios.find((scenario) => scenario.spacingFeet > 0)?.spacingFeet ?? 12;
  const base = Math.max(1.45, frame.scale * spacing * 0.2);
  const ordered = [...samples].sort((left, right) => left.shaded - right.shaded);
  const shadedAnywhere = samples.filter((sample) => sample.shaded > 0).length;
  const shadedAlways = samples.filter((sample) => sample.total > 0 && sample.shaded === sample.total).length;
  const scenarioCount = samples[0]?.total ?? scenarios.length;
  const caption = `Parcel samples colored by how many of ${scenarioCount} scenarios shade each location. ${shadedAnywhere} samples are shaded at least once. ${shadedAlways} are shaded in every scenario.`;
  return (
    <figure className="site-sun-frequency">
      <svg className="site-sun-map" viewBox={`0 0 ${frame.viewW} ${frame.viewH}`} preserveAspectRatio="xMidYMid meet" role="img" aria-label={caption}>
        <polygon points={frame.outline} />
        {ordered.map((sample) => (
          <circle
            key={cellKey(sample.x, sample.z)}
            cx={frame.at(sample.x, sample.z).x}
            cy={frame.at(sample.x, sample.z).y}
            r={shadeRadius(base, sample.shaded)}
            fill={shadeTone(sample.shaded)}
            data-prominent={sample.shaded > 0 ? "yes" : undefined}
          />
        ))}
        <polygon points={frame.outline} />
        <NorthMark frame={frame} />
      </svg>
      <div className="site-sun-scale" aria-hidden="true">
        <span>0</span>
        <i style={{ background: "linear-gradient(90deg, rgba(118, 120, 122, 0.4) 0%, #3ee0d8 100%)" }} />
        <span>12 scenarios</span>
      </div>
      <p className="site-sun-quiet">{shadedAnywhere} samples are shaded in at least one scenario. {shadedAlways} are shaded in all {scenarioCount}.</p>
    </figure>
  );
}
