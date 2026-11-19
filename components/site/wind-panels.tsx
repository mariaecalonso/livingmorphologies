"use client";

import { AutumnIcon, ExploreSegment, ExploreSlider, SpringIcon, SunIcon, WinterIcon, YearIcon } from "./explore-controls";
import { AnalysisColumnFrame, siteRecord, type SiteFinding, type SiteObservation } from "./site-inputs";
import { AnalysisReadout } from "./analysis-readout";
import type { SiteAnalysisBundle, SiteAnalysisStoreState } from "@/lib/skill5/site-analysis-bundle";
import { WindRose, windSpeedColor } from "@/components/site/wind-rose";
import {
  MONTH_NAMES,
  WIND_CONDITIONS,
  WIND_HISTORY_NOTE,
  WIND_SEASONS,
  WIND_SOURCE,
  conditionLabel,
  displayedMph,
  periodLabel,
  seasonalComparison,
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
  sector,
  distanceKm,
  inputs,
  onRetain,
  onRemove,
  onLive,
}: {
  summary: WindSummary;
  sector: number | null;
  distanceKm: number;
  analysisBundle: SiteAnalysisBundle | null;
  bundleStored: SiteAnalysisStoreState;
  inputs: readonly SiteObservation[];
  onRetain: (finding: SiteFinding) => void;
  onRemove?: (id: string) => void;
  onLive: (findings: readonly SiteFinding[]) => void;
  onSector: (index: number | null) => void;
}) {
  const moving = summary.hours - summary.calmHours;
  const share = summary.prevailing && moving > 0 ? Math.round((100 * summary.prevailing.hours) / moving) : 0;
  const studyName = "Wind";
  const period = periodLabel(summary.season, summary.month).replace("Autumn", "Fall");
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
    { id: "seasonLabel", value: period },
    { id: "scenario", value: "regional airport composite" },
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
  const seasons = seasonalComparison(summary.condition);
  const speeds = seasons.flatMap((row) => row.summary.sectors.filter((item) => item.hours > 0).map((item) => item.meanSpeed));
  const slow = speeds.length > 0 ? Math.min(...speeds) : 0;
  const fast = speeds.length > 0 ? Math.max(...speeds) : 0;
  const seasonOrder = ["spring", "summer", "autumn", "winter"] as const;
  return (
    <AnalysisColumnFrame title="Wind : Results" findings={findings} inputs={inputs} onRetain={onRetain} onRemove={onRemove} onLive={onLive}>
      <div className="site-wind-study">
      <AnalysisReadout
        titles={["/ Wind rose", "/ This season", "/ Four seasons"]}
        condition={(
          <>
            <div className="site-wind-rose-row">
              <div className="site-wind-rose-slot">
                <WindRose sectors={summary.sectors} movingHours={moving} prevailingIndex={summary.prevailing?.index ?? null} slow={slow} fast={fast} />
              </div>
              <div className="site-sun-scale site-wind-speed" aria-hidden="true">
                <span>{speedMph(fast)}</span>
                <i style={{ background: `linear-gradient(180deg, ${windSpeedColor(fast, slow, fast)}, ${windSpeedColor(slow, slow, fast)})` }} />
                <span>{speedMph(slow)}</span>
              </div>
            </div>
            <div className="site-sun-scale site-wind-length" aria-hidden="true">
              <span>0%</span>
              <i />
              <span>30%</span>
            </div>
            <p className="site-sun-range">Length is the share of moving hours. Color is the wedge mean. Both scales stay fixed across seasons.</p>
          </>
        )}
        input={(
          <dl className="site-sun-measures">
            <div><dt>Prevailing</dt><dd>{summary.prevailing?.name ?? "—"}</dd></div>
            <div><dt>Bearing</dt><dd>{summary.prevailing ? `${Math.round(summary.prevailing.meanFrom)}°` : "—"}</dd></div>
            <div><dt>Frequency</dt><dd>{summary.prevailing ? `${share}%` : "—"}</dd></div>
            <div><dt>Wedge mean</dt><dd>{summary.prevailing ? speedMph(summary.prevailing.meanSpeed) : "—"}</dd></div>
            <div><dt>Seasonal mean</dt><dd>{speedMph(summary.meanSpeed)}</dd></div>
            <div><dt>Calm hours</dt><dd>{summary.calmHours}</dd></div>
          </dl>
        )}
        response={(
          <ul className="site-wind-compare">
            <li className="site-wind-compare-head" aria-hidden="true">
              <span>Season</span>
              <span>From</span>
              <span>Share</span>
              <span>Mean</span>
            </li>
            {seasonOrder.map((id) => {
              const row = seasons.find((item) => item.id === id);
              if (!row) return null;
              const rowMoving = row.summary.hours - row.summary.calmHours;
              const rowPrevailing = row.summary.prevailing;
              const rowShare = rowPrevailing && rowMoving > 0 ? Math.round((100 * rowPrevailing.hours) / rowMoving) : 0;
              const label = id === "autumn" ? "Fall" : row.label;
              return (
                <li key={id} data-active={id === summary.season ? "true" : undefined}>
                  <span>{label}</span>
                  <span>{rowPrevailing ? `${rowPrevailing.name} · ${Math.round(rowPrevailing.meanFrom)}°` : "—"}</span>
                  <span>{rowShare}%</span>
                  <span>{speedMph(row.summary.meanSpeed)}</span>
                </li>
              );
            })}
          </ul>
        )}
      />
      </div>
    </AnalysisColumnFrame>
  );
}
