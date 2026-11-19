"use client";

import { useEffect, useRef } from "react";
import { AnalysisColumnFrame, siteRecord, type SiteFinding, type SiteObservation } from "./site-inputs";
import { AnalysisReadout } from "./analysis-readout";
import { datasetStorageSentence, type SiteAnalysisBundle, type SiteAnalysisStoreState } from "@/lib/skill5/site-analysis-bundle";
import type { Isovist } from "@/lib/skill5/isovist";
import type { ViewPhoto } from "@/lib/skill5/view-imagery";
import { photoReview } from "@/lib/skill5/view-photo-reviews";
import type { RoadDistanceField } from "@/lib/skill5/road-distance-field";
import type { XZ } from "@/lib/skill5/site-model";
import {
  VIEW_POINT_IDS,
  type NoiseReading,
  type NoiseSource,
  type SightHit,
  type ViewPoint,
  type ViewPointId,
  type ViewReading,
} from "@/lib/skill5/views-noise";

export type ViewsMode = "views" | "proximity";

const CLASS_LABEL: Record<NoiseSource["id"], string> = {
  macarthur: "Causeway",
  expressway: "Expressway, causeway, or ramp",
  local: "Local street",
};

const CLASS_CHOICE: { id: NoiseSource["id"]; label: string; name: string }[] = [
  { id: "macarthur", label: "MacArthur", name: "MacArthur Causeway" },
  { id: "expressway", label: "Other roads", name: "Other expressway, causeway, or ramp" },
  { id: "local", label: "Local streets", name: "Local street" },
];

function feet(value: number | null) {
  return value === null ? "None" : `${Math.round(value).toLocaleString("en-US")} ft`;
}

function bearingLabel(bearing: number) {
  if (bearing > 0) return `+${bearing}`;
  return String(bearing);
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
  if (!name || /^unnamed$/i.test(name)) return "Unnamed building";
  return name;
}

function maxDistance(noises: readonly NoiseReading[]) {
  let max = 0;
  for (const noise of noises) {
    for (const source of [noise.macarthur, noise.expressway, noise.local]) {
      if (source.feet !== null) max = Math.max(max, source.feet);
    }
  }
  return max;
}

export function ViewsControls({
  mode,
  pointId,
  points,
  ring,
  noise,
  isovist,
  placing,
  measure,
  roadClass,
  field,
  onMode,
  onPoint,
  onPlace,
  onRoadClass,
}: {
  mode: ViewsMode;
  pointId: ViewPointId;
  points: readonly ViewPoint[];
  ring: readonly XZ[];
  view: ViewReading | null;
  noise: NoiseReading | null;
  isovist: Isovist | null;
  placing: boolean;
  measure: NoiseReading | null;
  roadClass: NoiseSource["id"];
  field: RoadDistanceField | null;
  onMode: (mode: ViewsMode) => void;
  onPoint: (id: ViewPointId) => void;
  onPlace: () => void;
  onRoadClass: (id: NoiseSource["id"]) => void;
}) {
  return (
    <div className="site-sun-controls site-view-controls">
      <div className="site-context-field">
        <span>Analysis mode</span>
        <div className="site-sun-seasons" role="group" aria-label="Analysis mode">
          <button type="button" aria-pressed={mode === "views"} onClick={() => onMode("views")}>Views</button>
          <button type="button" aria-pressed={mode === "proximity"} onClick={() => onMode("proximity")}>Road proximity</button>
        </div>
      </div>
      {mode === "views" ? (
        <>
          <div className="site-context-field">
            <span>Observer</span>
            <div className="site-sun-seasons" role="group" aria-label="Observer">
              <button type="button" aria-pressed={placing} onClick={onPlace}>Place on Site</button>
            </div>
          </div>
          <dl className="site-view-metrics">
            <div>
              <dt>Analysis</dt>
              <dd>360° Isovist</dd>
            </div>
            <div>
              <dt>Highlights</dt>
              <dd>Auto, up to 5</dd>
            </div>
            <div>
              <dt>Observer</dt>
              <dd>{isovist ? `${Math.round(isovist.origin.x)} ft, ${Math.round(isovist.origin.z)} ft` : "—"}</dd>
            </div>
          </dl>
          <ul className="site-view-key">
            <li><i data-swatch="visible" />Visible region</li>
            <li><i data-swatch="obstacle" />Obstacle</li>
            <li><i data-swatch="observer" />Observer</li>
            <li><i data-swatch="highlight" />Highlighted view</li>
          </ul>
          {placing ? <p className="site-view-caption">Click inside the parcel.</p> : null}
        </>
      ) : (
        <>
          <div className="site-context-field">
            <span>Measurement</span>
            <div className="site-sun-seasons" role="group" aria-label="Measurement">
              <button type="button" aria-pressed={placing} onClick={onPlace}>Place on Site</button>
            </div>
            {placing ? <p className="site-view-caption">Click inside the parcel. Right-drag still moves the camera.</p> : null}
          </div>
          <div className="site-context-field">
            <span>Road class</span>
            <div className="site-sun-seasons" role="group" aria-label="Road class">
              {CLASS_CHOICE.map((choice) => (
                <button key={choice.id} type="button" aria-pressed={roadClass === choice.id} aria-label={choice.name} onClick={() => onRoadClass(choice.id)}>{choice.label}</button>
              ))}
            </div>
          </div>
          {field ? (
            <div className="site-context-field">
              <span>Sampled grid</span>
              <div style={{ height: 8, marginTop: 6, background: "linear-gradient(90deg, #c77e5f 0%, #101416 100%)" }} />
              <p className="site-view-caption">Near {feet(field.minimum)}. Far {feet(field.maximum)}. Contours every {field.contourFeet} ft. Minimum and maximum are 8 ft sample centers.</p>
            </div>
          ) : null}
        </>
      )}
      {mode === "proximity" && (measure ?? noise) ? (
        <dl className="site-view-metrics site-view-metrics-roads">
          {[(measure ?? noise)!.macarthur, (measure ?? noise)!.expressway, (measure ?? noise)!.local].map((source) => (
            <div key={source.id} data-active={source.id === roadClass ? "true" : undefined}>
              <dt>{source.name ?? source.label}<em>{CLASS_LABEL[source.id]}</em></dt>
              <dd style={source.id === roadClass ? { color: "#14999e" } : undefined}>{feet(source.feet)}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      {mode === "proximity" ? <p className="site-view-caption">The mark is the mapped centerline. The drawn road can sit off that line. Not a sound level.</p> : <p className="site-view-eye">Eye height 5.5 ft</p>}
    </div>
  );
}

function pointRecord(view: ViewReading): SiteFinding {
  const eye = view.eyeHeight.toFixed(1);
  return siteRecord({
    id: `views:point:${view.point.id}:${eye}`,
    study: "Views + Road Proximity",
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

function roadRecords(noise: NoiseReading): SiteFinding[] {
  return [noise.macarthur, noise.expressway, noise.local].flatMap((source) => {
    if (source.feet === null || source.x === null || source.z === null) return [];
    return [siteRecord({
      id: `views:road:${noise.point.label === "Measurement" ? `measure:${noise.point.x.toFixed(1)}:${noise.point.z.toFixed(1)}` : noise.point.id}:${source.id}`,
      study: "Views + Road Proximity",
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

function blockerLine(ray: SightHit) {
  return `${bearingLabel(ray.bearing)}° · ${buildingName(ray.blockerName)}, ${Math.round(ray.blockerHeight ?? 0)} ft ${heightSource(ray.blockerSource)}, ${feet(ray.blockerFeet)} away`;
}

function DistanceBars({ noise, scale }: { noise: NoiseReading; scale: number }) {
  return (
    <div className="site-view-bars">
      {[noise.macarthur, noise.expressway, noise.local].map((source) => (
        <div key={source.id}>
          <span>
            {source.name ?? source.label}
            <em>{CLASS_LABEL[source.id]}</em>
          </span>
          <i>
            <b data-class={source.id} style={{ width: source.feet === null || scale <= 0 ? "0%" : `${(100 * source.feet) / scale}%` }} />
          </i>
          <strong>{feet(source.feet)}</strong>
        </div>
      ))}
      <p>Bar length is divided by {feet(scale)}, the sampled maximum of the active class.</p>
    </div>
  );
}

function isovistFinding(isovist: Isovist): SiteFinding {
  return siteRecord({
    id: `views:isovist:${isovist.origin.x.toFixed(1)}:${isovist.origin.z.toFixed(1)}`,
    study: "Views + Road Proximity",
    kind: "view-point",
    title: "360° isovist",
    quantities: [
      { id: "eyeHeight", value: isovist.eyeHeight, unit: "ft" },
      { id: "highlights", value: isovist.highlights.length, unit: "count" },
    ],
    geometry: { type: "point", x: isovist.origin.x, y: isovist.eyeHeight, z: isovist.origin.z },
    settings: [
      { id: "analysis", value: "horizontal-isovist" },
      { id: "eyeHeight", value: isovist.eyeHeight.toFixed(1) },
      { id: "visibleAreaSqFt", value: String(Math.round(isovist.visibleArea)) },
      { id: "windowShare", value: windowShare(isovist) },
    ],
    source: {
      name: "Study-window isovist",
      retrieved: null,
      detail: "Horizontal visibility at 5.5 ft inside the modeled study window.",
    },
    reliability: "A ground-projected horizontal field. It is not a 3D viewshed or a photograph.",
    gaps: isovist.estimatedSamples > 0 ? ["Some blocking heights are estimated or a story count."] : [],
  });
}

function windowShare(isovist: Isovist) {
  if (isovist.windowArea <= 0) return "0%";
  return `${(100 * isovist.visibleArea / isovist.windowArea).toFixed(1)}%`;
}

export function ViewsResults({
  mode,
  readings,
  noises,
  pointId,
  isovist,
  measure,
  roadClass,
  field,
  analysisBundle,
  bundleStored,
  inputs,
  onRetain,
  onRemove,
  onLive,
  photos,
  onOpenPhoto,
  openPhotoId,
  onSelectHighlight,
  selectedHighlightId,
}: {
  mode: ViewsMode;
  readings: readonly ViewReading[];
  noises: readonly NoiseReading[];
  pointId: ViewPointId;
  isovist: Isovist | null;
  measure: NoiseReading | null;
  roadClass: NoiseSource["id"];
  field: RoadDistanceField | null;
  analysisBundle: SiteAnalysisBundle | null;
  bundleStored: SiteAnalysisStoreState;
  inputs: readonly SiteObservation[];
  onRetain: (finding: SiteFinding) => void;
  onRemove?: (id: string) => void;
  onLive: (findings: readonly SiteFinding[]) => void;
  photos?: Record<string, ViewPhoto | null>;
  onOpenPhoto?: (id: string | null) => void;
  openPhotoId?: string | null;
  onSelectHighlight?: (id: string) => void;
  selectedHighlightId?: string | null;
}) {
  const view = readings.find((item) => item.point.id === pointId) ?? readings[0] ?? null;
  const stored = noises.find((item) => item.point.id === pointId) ?? noises[0] ?? null;
  const noise = mode === "proximity" ? measure ?? stored : stored;
  const findings = mode === "views"
    ? (isovist ? [isovistFinding(isovist)] : [])
    : (noise ? roadRecords(noise) : []);
  const blocked = view ? view.rays.filter((ray) => !ray.open && ray.shoreFeet !== null) : [];
  const otherBlocked = blocked.filter((ray) => ray.bearing !== 0);
  const east = view?.east ?? null;
  const scale = maxDistance(noises);
  const record = analysisBundle
    ? datasetStorageSentence(bundleStored, `Five points and their sightlines and centerline distances are stored at ${analysisBundle.views.eyeHeightFeet.toFixed(1)} ft.`)
    : "The dataset has not been generated yet.";
  const openPhoto = mode === "views" && openPhotoId ? photos?.[openPhotoId] : null;
  const openHighlight = openPhoto && isovist ? isovist.highlights.find((item) => item.id === openPhotoId) : null;
  const closePhoto = useRef(onOpenPhoto);
  closePhoto.current = onOpenPhoto;
  useEffect(() => {
    if (!selectedHighlightId) return;
    document.querySelector(`.site-view-compare-photos li[data-highlight="${CSS.escape(selectedHighlightId)}"]`)?.scrollIntoView({ block: "nearest" });
  }, [selectedHighlightId]);
  useEffect(() => {
    if (!openPhoto?.imageUrl) return;
    const onPointer = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (target instanceof Element && target.closest(".site-view-photo-frame, .site-view-thumb")) return;
      closePhoto.current?.(null);
    };
    window.addEventListener("pointerdown", onPointer);
    return () => window.removeEventListener("pointerdown", onPointer);
  }, [openPhoto?.imageUrl]);
  return (
    <AnalysisColumnFrame title={mode === "views" ? "Views : Results" : "Road Proximity : Results"} findings={findings} gap={null} inputs={inputs} onRetain={onRetain} onRemove={onRemove} onLive={onLive} overlay={openPhoto?.imageUrl ? (
      <div className="site-view-photo">
        <figure className="site-view-photo-frame">
          <img src={openPhoto.imageUrl} alt={openHighlight?.title ?? openPhoto.title ?? ""} />
          <figcaption>
            <strong>{openHighlight?.title ?? openPhoto.title ?? "Photograph"}</strong>
            <span>{openPhoto.role === "viewpoint" ? "Viewpoint" : openPhoto.role === "historical" ? "Historical reference" : "Reference"}</span>
            <span>{openPhoto.author}, {openPhoto.license}</span>
            <a href={openPhoto.pageUrl} target="_blank" rel="noreferrer">{openPhoto.source}</a>
          </figcaption>
        </figure>
      </div>
    ) : null}>
      <div className="site-view-study" data-mode={mode}>
        {mode === "views" && isovist ? (
          <AnalysisReadout
            titles={["/ Observer", "/ Visible area", "/ Highlights"]}
            condition={(
              <>
                <p className="site-view-count">{Math.round(isovist.origin.x).toLocaleString("en-US")} ft east, {Math.round(isovist.origin.z).toLocaleString("en-US")} ft north.</p>
                <p className="site-view-caption">Horizontal isovist at {isovist.eyeHeight.toFixed(1)} ft. Ground projection. Not a 3D viewshed and not a photograph.</p>
              </>
            )}
            input={(
              <>
                <p className="site-view-count">{Math.round(isovist.visibleArea).toLocaleString("en-US")} sq ft. {windowShare(isovist)} of the study window.</p>
                <p className="site-view-caption">The window runs from {Math.round(isovist.window.minX).toLocaleString("en-US")} to {Math.round(isovist.window.maxX).toLocaleString("en-US")} ft east and {Math.round(isovist.window.minZ).toLocaleString("en-US")} to {Math.round(isovist.window.maxZ).toLocaleString("en-US")} ft north. Beyond it is unknown. {isovist.estimatedSamples.toLocaleString("en-US")} samples stop on an estimated or story-count height.</p>
              </>
            )}
            response={(
              <>
                <ul className="site-view-compare site-view-compare-photos">
                  <li className="site-view-compare-head" aria-hidden="true">
                    <span>Bearing</span>
                    <span>Distance</span>
                    <span>Target</span>
                    <span>Photograph</span>
                  </li>
                  {isovist.highlights.map((highlight) => {
                    const photo = photos?.[highlight.id];
                    const review = photoReview(highlight.targetId, highlight.kind);
                    const role = photo?.role === "viewpoint" ? "Viewpoint" : review?.summary || (photo ? "Reference" : "");
                    return (
                      <li key={highlight.id} data-highlight={highlight.id} data-active={selectedHighlightId === highlight.id ? "true" : undefined} onClick={() => onSelectHighlight?.(highlight.id)}>
                        <span>{bearingLabel(Math.round(highlight.bearing))}°</span>
                        <span>{feet(highlight.distance)}</span>
                        <span>{highlight.title}{highlight.note ? <em>{highlight.note}</em> : null}{role ? <em>{role}</em> : null}</span>
                        {photo?.imageUrl ? (
                          <button type="button" className="site-view-thumb" onClick={(event) => { event.stopPropagation(); onSelectHighlight?.(highlight.id); onOpenPhoto?.(openPhotoId === highlight.id ? null : highlight.id); }} aria-label={`Open photograph of ${highlight.title}`}>
                            <img src={photo.imageUrl} alt="" />
                          </button>
                        ) : <span className="site-view-thumb-empty">No photograph</span>}
                      </li>
                    );
                  })}
                </ul>
                {isovist.highlights.length === 0 ? <p className="site-view-caption">No distinct highlight is supported at this point.</p> : null}
              </>
            )}
          />
        ) : noise ? (
          <AnalysisReadout
            titles={["/ Distances", "/ Field", "/ Five points"]}
            condition={(
              <>
                <DistanceBars noise={noise} scale={field && field.maximum > 0 ? field.maximum : scale} />
              </>
            )}
            input={field ? (
              <>
                <p className="site-view-count">{CLASS_CHOICE.find((choice) => choice.id === roadClass)?.name}</p>
                <p className="site-view-caption">8 ft sample centers inside the parcel. Not area-weighted. Minimum {feet(field.minimum)}. Median {feet(field.median)}. Maximum {feet(field.maximum)}. Contours every {field.contourFeet} ft.</p>
              </>
            ) : (
              <p className="site-view-caption">The parcel field has not been calculated.</p>
            )}
            response={(
              <>
              <ul className="site-view-compare site-view-compare-roads">
                <li className="site-view-compare-head" aria-hidden="true">
                  <span>Point</span>
                  <span>MacArthur</span>
                  <span>Other road</span>
                  <span>Local</span>
                </li>
                {VIEW_POINT_IDS.map((id) => {
                  const item = noises.find((reading) => reading.point.id === id);
                  if (!item) return null;
                  const same = Math.hypot(item.point.x - noise.point.x, item.point.z - noise.point.z) < 0.5;
                  return (
                    <li key={id} data-active={same ? "true" : undefined}>
                      <span>{item.point.label}</span>
                      <span><strong>{feet(item.macarthur.feet)}</strong><em>{item.macarthur.name ?? "—"}</em></span>
                      <span><strong>{feet(item.expressway.feet)}</strong><em>{item.expressway.name ?? "—"}</em></span>
                      <span><strong>{feet(item.local.feet)}</strong><em>{item.local.name ?? "—"}</em></span>
                    </li>
                  );
                })}
              </ul>
              <p className="site-view-caption">{record} Horizontal distances to mapped road centerlines. Not a sound level.</p>
              </>
            )}
          />
        ) : null}
      </div>
    </AnalysisColumnFrame>
  );
}
