"use client";

import { AnalysisAccuracy } from "./analysis-record";
import { ExploreSegment, ExploreSlider, RoadIcon, ViewsIcon } from "./explore-controls";
import { AnalysisColumnFrame, siteRecord, type SiteFinding, type SiteObservation } from "./site-inputs";
import {
  NOISE_LIMITS,
  VIEW_LIMITS,
  VIEW_POINT_IDS,
  VIEW_POINT_LABELS,
  bearingVector,
  type NoiseReading,
  type SightHit,
  type ViewPointId,
  type ViewReading,
} from "@/lib/skill5/views-noise";

export type ViewsMode = "views" | "proximity";

function feet(value: number | null) {
  return value === null ? "None" : `${Math.round(value).toLocaleString("en-US")} ft`;
}

function heightSource(source: SightHit["blockerSource"]) {
  if (source === "estimated") return "estimated height";
  if (source === "osm-levels") return "story count";
  if (source === "osm-height") return "tagged height";
  if (source === "county") return "county height";
  if (source === "published") return "published tower height";
  return "stored height";
}

function buildingName(name: string | null) {
  if (!name || /^unnamed$/i.test(name)) return "an unnamed building";
  return name;
}

function eastLine(ray: SightHit) {
  if (ray.shoreFeet === null) return "Due east does not meet the mapped coastline.";
  if (ray.open) return `Open sightline for ${feet(ray.shoreFeet)} to the mapped coastline. Not a verified view of a named place.`;
  return `Blocked by ${buildingName(ray.blockerName)}, ${Math.round(ray.blockerHeight ?? 0)} ft, ${heightSource(ray.blockerSource)}, ${feet(ray.blockerFeet)} away.`;
}

export function ViewsConfigure({
  mode,
  pointId,
  eyeHeight,
  onMode,
  onPoint,
  onEyeHeight,
}: {
  mode: ViewsMode;
  pointId: ViewPointId;
  eyeHeight: number;
  onMode: (mode: ViewsMode) => void;
  onPoint: (id: ViewPointId) => void;
  onEyeHeight: (value: number) => void;
}) {
  const pointMark: Record<ViewPointId, { x: number; y: number; label: string }> = {
    north: { x: 50, y: 16, label: "N" },
    west: { x: 16, y: 50, label: "W" },
    center: { x: 50, y: 50, label: "Mid" },
    waterfront: { x: 84, y: 50, label: "Bay" },
    south: { x: 50, y: 84, label: "S" },
  };
  return (
    <>
      <ExploreSegment
        label="Views or road proximity"
        value={mode}
        options={[
          { id: "views", label: "Views", title: "Views", icon: <ViewsIcon /> },
          { id: "proximity", label: "Roads", title: "Road proximity", icon: <RoadIcon /> },
        ]}
        onChange={onMode}
      />
      <div className="site-explore-plan" role="group" aria-label="Observation point">
        <svg viewBox="0 0 100 100" aria-hidden="true">
          <path d="M76 12c10 12 14 26 14 38s-4 26-14 38" />
          <path d="M86 20c6 10 8 20 8 30s-2 20-8 30" opacity="0.45" />
          <rect x="32" y="32" width="36" height="36" />
        </svg>
        {VIEW_POINT_IDS.map((id) => {
          const mark = pointMark[id];
          const active = pointId === id;
          return (
            <button
              key={id}
              type="button"
              data-active={active || undefined}
              aria-pressed={active}
              title={VIEW_POINT_LABELS[id]}
              aria-label={VIEW_POINT_LABELS[id]}
              style={{ left: `${mark.x}%`, top: `${mark.y}%` }}
              onClick={() => onPoint(id)}
            >
              <i />
              <span>{mark.label}</span>
            </button>
          );
        })}
      </div>
      {mode === "views" ? (
        <ExploreSlider label="Eye" valueLabel={`${eyeHeight.toFixed(1)} ft`} min={4} max={80} step={0.5} value={eyeHeight} ariaLabel="Eye height" onChange={onEyeHeight} />
      ) : null}
    </>
  );
}

function pointRecord(view: ViewReading): SiteFinding {
  const eye = view.eyeHeight.toFixed(1);
  return siteRecord({
    id: `views:point:${view.point.id}:${eye}`,
    study: "Views + Noise",
    kind: "view-point",
    title: `${view.point.label} observation point`,
    quantities: [
      { id: "eyeHeight", value: view.eyeHeight, unit: "ft" },
      { id: "openRays", value: view.openRays, unit: "count" },
      { id: "shoreRays", value: view.shoreRays, unit: "count" },
    ],
    geometry: { type: "point", x: view.point.x, y: view.eyeHeight, z: view.point.z },
    settings: [
      { id: "point", value: view.point.label },
      { id: "eyeHeight", value: eye },
    ],
    source: {
      name: "Parcel observation point",
      retrieved: null,
      detail: "Observation point placed inside the parcel and west of the mapped coastline.",
    },
    reliability: "A stored point. It is not a surveyed monument.",
    gaps: [],
  });
}

function rayRecords(view: ViewReading): SiteFinding[] {
  const eye = view.eyeHeight.toFixed(1);
  return view.rays.flatMap((ray) => {
    if (ray.shoreFeet === null) return [];
    const direction = bearingVector(ray.bearing);
    return [siteRecord({
      id: `views:bearing:${view.point.id}:${eye}:${ray.bearing}`,
      study: "Views + Noise",
      kind: "view-ray",
      title: `${view.point.label}, ${ray.bearing === 0 ? "due east" : ray.bearing > 0 ? `${ray.bearing}° north of east` : `${Math.abs(ray.bearing)}° south of east`}`,
      quantities: [
        { id: "shore", value: ray.shoreFeet, unit: "ft" },
        ...(ray.blockerHeight === null ? [] : [{ id: "blockerHeight", value: ray.blockerHeight, unit: "ft" as const }]),
        ...(ray.blockerFeet === null ? [] : [{ id: "blockerFeet", value: ray.blockerFeet, unit: "ft" as const }]),
      ],
      geometry: {
        type: "ray",
        origin: { x: view.point.x, y: view.eyeHeight, z: view.point.z },
        directionEast: direction.east,
        directionNorth: direction.north,
        bearingDegrees: ray.bearing,
        bearingFrom: "east",
        lengthFeet: ray.shoreFeet,
      },
      settings: [
        { id: "point", value: view.point.label },
        { id: "eyeHeight", value: eye },
        { id: "open", value: ray.open ? "yes" : "no" },
        { id: "blocker", value: buildingName(ray.blockerName) },
        { id: "blockerSource", value: heightSource(ray.blockerSource) },
      ],
      source: {
        name: "OpenStreetMap coastline",
        retrieved: null,
        detail: "OpenStreetMap coastline. Not a surveyed view of a named place.",
      },
      reliability: ray.blockerSource === "estimated" || ray.blockerSource === "osm-levels"
        ? "The blocking height is estimated or a story count."
        : "Mapped coastline. Not a verified view of a named destination.",
      gaps: ["The coastline intersection coordinate is not stored. The ray keeps its origin, direction, and length."],
    })];
  });
}

function roadRecords(noise: NoiseReading): SiteFinding[] {
  return [noise.macarthur, noise.expressway, noise.local].flatMap((source) => {
    if (source.feet === null || source.x === null || source.z === null) return [];
    return [siteRecord({
      id: `views:road:${noise.point.id}:${source.id}`,
      study: "Views + Noise",
      kind: "road",
      title: source.name ?? source.label,
      quantities: [{ id: "distance", value: source.feet, unit: "ft" }],
      geometry: {
        type: "segment",
        from: { role: "observation", x: noise.point.x, z: noise.point.z },
        to: { role: "centerline", x: source.x, z: source.z },
      },
      settings: [
        { id: "point", value: noise.point.label },
        { id: "road", value: source.id },
      ],
      source: { name: "Mapped road centerline", retrieved: null, detail: "Mapped road centerline." },
      reliability: "Not a decibel reading and not a ranking of loudness.",
      gaps: [],
    })];
  });
}

export function ViewsResults({
  mode,
  readings,
  noises,
  pointId,
  inputs,
  onPoint,
  onRetain,
  onLive,
}: {
  mode: ViewsMode;
  readings: readonly ViewReading[];
  noises: readonly NoiseReading[];
  pointId: ViewPointId;
  inputs: readonly SiteObservation[];
  onPoint: (id: ViewPointId) => void;
  onRetain: (finding: SiteFinding) => void;
  onLive: (findings: readonly SiteFinding[]) => void;
}) {
  const view = readings.find((item) => item.point.id === pointId) ?? readings[0] ?? null;
  const noise = noises.find((item) => item.point.id === pointId) ?? noises[0] ?? null;
  const findings = [
    ...readings.map(pointRecord),
    ...(view ? rayRecords(view) : []),
    ...(noise ? roadRecords(noise) : []),
  ];
  const unmeasured = view ? view.rays.length - view.rays.filter((ray) => ray.shoreFeet !== null).length : 0;
  const gap = view
    ? `${unmeasured === 0 ? "Every bearing in the selected fan meets the mapped coastline." : `${unmeasured} ${unmeasured === 1 ? "bearing does" : "bearings do"} not meet the mapped coastline.`} Road lengths are not decibels.`
    : "Select a point to read its sightlines.";
  return (
    <AnalysisColumnFrame findings={findings} gap={gap} inputs={inputs} onRetain={onRetain} onLive={onLive}>
      <section className="site-block">
        <h2 className="site-subtitle">Five observation points</h2>
        <div className="site-point-row" role="group" aria-label="Observation points">
          {readings.map((item) => {
            const roads = noises.find((entry) => entry.point.id === item.point.id);
            return (
              <button key={item.point.id} type="button" data-active={item.point.id === view?.point.id || undefined} aria-pressed={item.point.id === view?.point.id} onClick={() => onPoint(item.point.id)}>
                <span>{item.point.label}</span>
                <strong>{item.openRays}/{item.shoreRays}</strong>
                <em>{feet(roads?.macarthur.feet ?? null)}</em>
              </button>
            );
          })}
        </div>
        <p className="site-note">Open sightlines to the mapped coastline, at {view ? view.eyeHeight.toFixed(1) : "5.5"} ft. The lower figure is MacArthur.</p>
        {view && noise ? (
          <>
            <h2 className="site-subtitle">{view.point.label}</h2>
            <div className="site-sight-fan" aria-hidden="true">
              {view.rays.map((ray) => <i key={ray.bearing} data-open={ray.open ? "yes" : "no"} title={eastLine(ray)} />)}
            </div>
            <div className="site-sun-figures">
              <div>
                <span>Due east</span>
                <strong>{view.east.shoreFeet === null ? "None" : view.east.open ? "Open" : "Blocked"}</strong>
                <em>{view.east.shoreFeet === null ? "No coastline" : feet(view.east.shoreFeet)}</em>
              </div>
              <div>
                <span>MacArthur</span>
                <strong>{feet(noise.macarthur.feet)}</strong>
                <em>{noise.expressway.name ?? "Other expressway"} {feet(noise.expressway.feet)}</em>
              </div>
              <div>
                <span>Local street</span>
                <strong>{feet(noise.local.feet)}</strong>
                <em>{noise.local.name ?? "None mapped"}</em>
              </div>
            </div>
          </>
        ) : null}
        <AnalysisAccuracy limits={mode === "views" ? VIEW_LIMITS : NOISE_LIMITS} />
      </section>
      <section className="site-block">
        <h2 className="site-subtitle">Legend</h2>
        <ul className="site-analysis-legend">
          <li data-rank="primary"><i style={{ background: "#f4f4f0" }} /><span>{mode === "views" ? "Open sightline on the model" : "MacArthur centerline on the model"}</span></li>
          <li data-rank="quiet"><i style={{ background: "#5c5c5c" }} /><span>{mode === "views" ? "Stopped by a building or tower" : "Other centerline on the model"}</span></li>
        </ul>
      </section>
    </AnalysisColumnFrame>
  );
}
