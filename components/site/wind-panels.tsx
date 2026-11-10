"use client";

import { AnalysisAccuracy } from "./analysis-record";
import { AutumnIcon, ExploreSegment, ExploreSlider, SpringIcon, SunIcon, WinterIcon, YearIcon } from "./explore-controls";
import { AnalysisColumnFrame, siteRecord, type SiteFinding, type SiteObservation } from "./site-inputs";
import { WindRose } from "@/components/site/wind-rose";
import {
  MONTH_NAMES,
  WIND_CALM_NOTE,
  WIND_CONDITIONS,
  WIND_DIRECTION_NOTE,
  WIND_HISTORY_NOTE,
  WIND_SEASONS,
  WIND_SOURCE,
  conditionLabel,
  displayedMph,
  periodLabel,
  windSeason,
  type WindCondition,
  type WindSummary,
} from "@/lib/skill5/wind";

function speedMph(speed: number) {
  return `${displayedMph(speed).toFixed(1)} mph`;
}

export function WindConfigure({
  season,
  month,
  condition,
  medianSpeed,
  density,
  motion,
  onSeason,
  onMonth,
  onCondition,
  onDensity,
  onMotion,
}: {
  season: string;
  month: number;
  condition: WindCondition;
  medianSpeed: number;
  density: number;
  motion: number;
  onSeason: (value: string) => void;
  onMonth: (value: number) => void;
  onCondition: (value: WindCondition) => void;
  onDensity: (value: number) => void;
  onMotion: (value: number) => void;
}) {
  const months = windSeason(season).months;
  const seasonIcon = {
    winter: <WinterIcon />,
    spring: <SpringIcon />,
    summer: <SunIcon />,
    autumn: <AutumnIcon />,
    year: <YearIcon />,
  } as const;
  return (
    <>
      <ExploreSegment
        label="Season"
        value={season}
        options={WIND_SEASONS.map((item) => ({
          id: item.id,
          label: item.id === "year" ? "Year" : item.label.slice(0, 3),
          title: item.label,
          icon: seasonIcon[item.id],
        }))}
        onChange={onSeason}
      />
      <div className="site-explore-months" role="group" aria-label="Month">
        <button type="button" data-active={month === 0 || undefined} aria-pressed={month === 0} aria-label={season === "year" ? "Whole year" : "Whole season"} title={season === "year" ? "Whole year" : "Whole season"} onClick={() => onMonth(0)}>All</button>
        {months.map((value) => (
          <button key={value} type="button" data-active={month === value || undefined} aria-pressed={month === value} aria-label={MONTH_NAMES[value - 1]} title={MONTH_NAMES[value - 1]} onClick={() => onMonth(value)}>
            {MONTH_NAMES[value - 1].slice(0, 3)}
          </button>
        ))}
      </div>
      <ExploreSegment
        label="Condition"
        value={condition}
        options={WIND_CONDITIONS.map((item) => ({
          id: item.id,
          label: item.id === "all" ? "All" : item.id === "day" ? "Day" : "Strong",
          title: item.label,
        }))}
        onChange={(id) => onCondition(id)}
      />
      {condition === "day" ? <p className="site-explore-hint">7:01–19:00</p> : condition === "strong" ? <p className="site-explore-hint">≥ {medianSpeed.toFixed(1)} m/s</p> : null}
      <ExploreSlider label="Density" valueLabel={String(density)} min={1} max={6} step={1} value={density} ariaLabel="Arrow density" onChange={onDensity} />
      <ExploreSlider label="Motion" valueLabel={motion.toFixed(1)} min={0} max={2} step={0.1} value={motion} ariaLabel="Arrow motion" onChange={onMotion} />
    </>
  );
}

export function WindResults({
  summary,
  year,
  seasons,
  sector,
  distanceKm,
  inputs,
  onRetain,
  onLive,
  onSeason,
  onSector,
}: {
  summary: WindSummary;
  year: WindSummary | null;
  seasons: ReadonlyArray<{ id: string; label: string; summary: WindSummary }>;
  sector: number | null;
  distanceKm: number;
  inputs: readonly SiteObservation[];
  onRetain: (finding: SiteFinding) => void;
  onLive: (findings: readonly SiteFinding[]) => void;
  onSeason: (value: string) => void;
  onSector: (index: number | null) => void;
}) {
  const drawn = sector === null ? summary.prevailing : summary.sectors[sector] ?? null;
  const moving = summary.hours - summary.calmHours;
  const share = summary.prevailing && moving > 0 ? Math.round((100 * summary.prevailing.hours) / moving) : 0;
  const sources = [
    WIND_HISTORY_NOTE,
    `${WIND_SOURCE.dataset}, WMO ${WIND_SOURCE.wmo}, ${WIND_SOURCE.station}`,
    `${WIND_SOURCE.lat.toFixed(2)}° N, ${Math.abs(WIND_SOURCE.lon).toFixed(2)}° W, ${WIND_SOURCE.elevationMeters} m, ${distanceKm.toFixed(1)} km from this site`,
    WIND_CALM_NOTE,
    WIND_DIRECTION_NOTE,
    "Speed in m/s. Direction is where the wind comes from.",
    "Hours under 0.5 m/s are calm and leave the rose.",
    `${summary.hours.toLocaleString("en-US")} hours, ${summary.calmHours.toLocaleString("en-US")} calm.`,
    "One direction across the model. Not airflow around buildings.",
  ];
  const studyName = "Wind";
  const period = periodLabel(summary.season, summary.month);
  const condition = conditionLabel(summary.condition);
  const windSource = {
    name: WIND_SOURCE.dataset,
    retrieved: null,
    detail: `${WIND_SOURCE.dataset}, ${WIND_SOURCE.station}, ${distanceKm.toFixed(1)} km from this site. ${WIND_HISTORY_NOTE}`,
  };
  const reliability = "Historical airport composite. One direction across the model. Not airflow around the buildings and not a live forecast.";
  const windSettings = [
    { id: "period", value: period },
    { id: "condition", value: condition },
    { id: "season", value: summary.season },
    { id: "month", value: String(summary.month) },
  ];
  const findings: SiteFinding[] = [];
  const sectorFinding = (item: NonNullable<WindSummary["prevailing"]>, role: "prevailing" | "selected") => siteRecord({
    id: `wind:${summary.season}:${summary.month}:${summary.condition}:${role}:${item.index}`,
    study: studyName,
    kind: "wind-sector",
    title: role === "prevailing" ? `Prevailing ${item.name}` : `Selected ${item.name}`,
    quantities: [
      { id: "from", value: item.meanFrom, unit: "deg" },
      { id: "speed", value: item.meanSpeed, unit: "m/s" },
      { id: "sectorHours", value: item.hours, unit: "count" },
      { id: "movingHours", value: moving, unit: "count" },
      { id: "center", value: item.center, unit: "deg" },
    ],
    geometry: { type: "direction", fromDegrees: item.meanFrom, from: "north" },
    settings: [...windSettings, { id: "role", value: role }, { id: "sector", value: item.name }],
    source: windSource,
    reliability,
    gaps: ["No location on the parcel is stored. The direction is one airport composite across the model."],
  });
  if (summary.prevailing && moving > 0) findings.push(sectorFinding(summary.prevailing, "prevailing"));
  const selectedSector = sector === null ? null : summary.sectors[sector] ?? null;
  if (selectedSector && selectedSector.hours > 0 && selectedSector.index !== summary.prevailing?.index && moving > 0) {
    findings.push(sectorFinding(selectedSector, "selected"));
  }
  if (summary.vectorFrom !== null) {
    findings.push(siteRecord({
      id: `wind:${summary.season}:${summary.month}:${summary.condition}:vector`,
      study: studyName,
      kind: "wind-vector",
      title: "Vector mean",
      quantities: [{ id: "from", value: summary.vectorFrom, unit: "deg" }],
      geometry: { type: "direction", fromDegrees: summary.vectorFrom, from: "north" },
      settings: windSettings,
      source: windSource,
      reliability,
      gaps: ["The vector mean has a direction and no location on the parcel."],
    }));
  }
  const gap = selectedSector && selectedSector.hours === 0
    ? "The selected wedge has no moving hours, so it is not offered."
    : "Wind is one airport direction across the model. No shaded or exposed location on the parcel is stored.";
  return (
    <AnalysisColumnFrame findings={findings} gap={gap} inputs={inputs} onRetain={onRetain} onLive={onLive}>
      <section className="site-block">
        <p className="site-sun-when">{periodLabel(summary.season, summary.month)}<br />{conditionLabel(summary.condition)}</p>
        <WindRose sectors={summary.sectors} selected={sector} onSelect={onSector} />
        <p className="site-note">{drawn && drawn.hours > 0 ? `${drawn.name} from ${drawn.meanFrom.toFixed(0)}°, ${drawn.meanSpeed.toFixed(1)} m/s in that wedge.` : "This selection has no direction to draw."}</p>
        <div className="site-sun-figures">
          <div className="site-sun-figure-lead">
            <span>Most frequent</span>
            <strong>{summary.prevailing ? summary.prevailing.name : "None"}</strong>
            <em>{summary.prevailing ? `from ${summary.prevailing.meanFrom.toFixed(0)}°, ${share}% of moving hours` : "No moving hours"}</em>
          </div>
          <div>
            <span>Average speed</span>
            <strong>{summary.meanSpeed.toFixed(1)}</strong>
            <em>m/s, including calm, {speedMph(summary.meanSpeed)}</em>
          </div>
          <div>
            <span>Vector mean</span>
            <strong>{summary.vectorFrom === null ? "None" : `${summary.vectorFrom.toFixed(0)}°`}</strong>
            <em>speed-weighted</em>
          </div>
        </div>
        {summary.condition === "strong" ? <p className="site-note">Median threshold {summary.medianSpeed.toFixed(1)} m/s.</p> : null}
        <div className="site-wind-seasons" data-layout="strip" role="group" aria-label="Year and seasons">
          {year ? (
            <button type="button" data-active={summary.season === "year" && summary.month === 0 || undefined} onClick={() => onSeason("year")}>
              <span>Year</span>
              <span>{year.prevailing?.name ?? "—"}</span>
              <span>{year.meanSpeed.toFixed(1)}</span>
            </button>
          ) : null}
          {seasons.map((row) => (
            <button key={row.id} type="button" data-active={summary.season === row.id || undefined} onClick={() => onSeason(row.id)}>
              <span>{row.label}</span>
              <span>{row.summary.prevailing?.name ?? "—"}</span>
              <span>{row.summary.meanSpeed.toFixed(1)}</span>
            </button>
          ))}
        </div>
        <AnalysisAccuracy limits={sources} />
      </section>
      <section className="site-block">
        <h2 className="site-subtitle">Legend</h2>
        <ul className="site-analysis-legend">
          <li data-rank="primary"><i style={{ background: "#f2f2ee" }} /><span>Arrow, the way the wind moves</span></li>
          <li data-rank="support"><i style={{ background: "#8d8d8d" }} /><span>Longer wedge, more hours</span></li>
          <li data-rank="support"><i style={{ background: "#d8d8d8" }} /><span>Brighter wedge, higher speed</span></li>
        </ul>
      </section>
    </AnalysisColumnFrame>
  );
}
