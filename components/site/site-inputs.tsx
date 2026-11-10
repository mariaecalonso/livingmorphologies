"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { stationAccount, type StationWalk } from "@/lib/skill5/pedestrian";

/**
 * One measured finding stored for later reading.
 * It is not an attractor, a program, a weight, or a growth rule.
 * X is east, Y is up, and Z is north. Lengths are international feet.
 * Y is omitted when the study did not measure a height.
 */
export const SITE_INPUT_AXES = { x: "east", y: "up", z: "north" } as const;
export const SITE_INPUT_LINEAR_UNIT = "international feet" as const;
export const SITE_INPUT_STORAGE_KEY = "lm.site-analysis.selected-inputs.v1";

export type SitePlanPoint = { x: number; z: number };
export type SiteQuantityUnit = "ft" | "ft/ft" | "deg" | "m/s" | "count";

export type SiteQuantity = {
  id: string;
  value: number;
  unit: SiteQuantityUnit;
};

export type SiteSetting = { id: string; value: string };

export type SiteSource = {
  name: string;
  retrieved: string | null;
  detail: string;
};

export type SiteGeometry =
  | { type: "none"; reason: string }
  | { type: "point"; x: number; z: number; y?: number }
  | { type: "segment"; from: SitePlanPoint & { role: string }; to: SitePlanPoint & { role: string } }
  | { type: "polyline"; featureIds: string[]; paths: SitePlanPoint[][] }
  | { type: "polygon"; featureId: string; rings: SitePlanPoint[][]; segment: { from: SitePlanPoint & { role: "parcel" }; to: SitePlanPoint & { role: "polygon" } } | null }
  | { type: "ray"; origin: { x: number; y: number; z: number }; directionEast: number; directionNorth: number; bearingDegrees: number; bearingFrom: "east"; lengthFeet: number }
  | { type: "direction"; fromDegrees: number; from: "north" };

export type SiteFinding = {
  id: string;
  study: string;
  kind: string;
  title: string;
  quantities: SiteQuantity[];
  geometry: SiteGeometry;
  settings: SiteSetting[];
  source: SiteSource;
  reliability: string;
  gaps: string[];
  axes: typeof SITE_INPUT_AXES;
  linearUnit: typeof SITE_INPUT_LINEAR_UNIT;
};

export type SiteObservation = SiteFinding;

const STUDY_ORDER = [
  "Sun + Shadows",
  "Wind",
  "Views + Noise",
  "Pedestrian Mobility + Baywalk",
  "Urban Context + Land Use",
];

const KINDS = new Set([
  "access",
  "station-gap",
  "baywalk",
  "centroid",
  "boundary",
  "neighbor",
  "destination",
  "view-point",
  "view-ray",
  "road",
  "sun",
  "wind-sector",
  "wind-vector",
  "network",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isPlanPoint(value: unknown): value is SitePlanPoint {
  return isRecord(value) && isFiniteNumber(value.x) && isFiniteNumber(value.z);
}

function isGeometry(value: unknown): value is SiteGeometry {
  if (!isRecord(value) || typeof value.type !== "string") return false;
  if (value.type === "none") return typeof value.reason === "string";
  if (value.type === "point") return isFiniteNumber(value.x) && isFiniteNumber(value.z) && (value.y === undefined || isFiniteNumber(value.y));
  if (value.type === "segment") {
    const from = value.from;
    const to = value.to;
    return isRecord(from) && isRecord(to)
      && isFiniteNumber(from.x) && isFiniteNumber(from.z) && typeof from.role === "string"
      && isFiniteNumber(to.x) && isFiniteNumber(to.z) && typeof to.role === "string";
  }
  if (value.type === "polyline") {
    return Array.isArray(value.featureIds) && value.featureIds.every((id) => typeof id === "string")
      && Array.isArray(value.paths) && value.paths.every((path) => Array.isArray(path) && path.every(isPlanPoint));
  }
  if (value.type === "polygon") {
    const segment = value.segment;
    const segmentOk = segment === null || (isRecord(segment) && isPlanPoint(segment.from) && isPlanPoint(segment.to));
    return typeof value.featureId === "string" && segmentOk
      && Array.isArray(value.rings) && value.rings.every((ring) => Array.isArray(ring) && ring.every(isPlanPoint));
  }
  if (value.type === "ray") {
    return isRecord(value.origin) && isFiniteNumber(value.origin.x) && isFiniteNumber(value.origin.y) && isFiniteNumber(value.origin.z)
      && isFiniteNumber(value.directionEast) && isFiniteNumber(value.directionNorth)
      && isFiniteNumber(value.bearingDegrees) && value.bearingFrom === "east" && isFiniteNumber(value.lengthFeet);
  }
  if (value.type === "direction") return isFiniteNumber(value.fromDegrees) && value.from === "north";
  return false;
}

export function isSiteFinding(value: unknown): value is SiteFinding {
  if (!isRecord(value)) return false;
  if (typeof value.id !== "string" || typeof value.study !== "string" || typeof value.title !== "string" || typeof value.reliability !== "string") return false;
  if (!KINDS.has(value.kind as string)) return false;
  if (!Array.isArray(value.quantities) || !value.quantities.every((item) => isRecord(item) && typeof item.id === "string" && isFiniteNumber(item.value) && typeof item.unit === "string")) return false;
  if (!Array.isArray(value.settings) || !value.settings.every((item) => isRecord(item) && typeof item.id === "string" && typeof item.value === "string")) return false;
  if (!Array.isArray(value.gaps) || !value.gaps.every((item) => typeof item === "string")) return false;
  if (!isRecord(value.source) || typeof value.source.name !== "string" || typeof value.source.detail !== "string") return false;
  if (value.source.retrieved !== null && typeof value.source.retrieved !== "string") return false;
  if (!isRecord(value.axes) || value.axes.x !== "east" || value.axes.y !== "up" || value.axes.z !== "north") return false;
  if (value.linearUnit !== SITE_INPUT_LINEAR_UNIT) return false;
  return isGeometry(value.geometry);
}

export function readStoredFindings(): SiteFinding[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(SITE_INPUT_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isSiteFinding);
  } catch {
    return [];
  }
}

export function writeStoredFindings(items: readonly SiteFinding[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(SITE_INPUT_STORAGE_KEY, JSON.stringify(items));
  } catch {
    // The in-memory selection still works when the browser refuses the write.
  }
}

export function siteRecord(item: Omit<SiteFinding, "axes" | "linearUnit">): SiteFinding {
  return { ...item, axes: SITE_INPUT_AXES, linearUnit: SITE_INPUT_LINEAR_UNIT };
}

export function observationKey(item: SiteFinding) {
  return JSON.stringify(item);
}

function setting(item: SiteFinding, id: string) {
  return item.settings.find((entry) => entry.id === id)?.value ?? "";
}

function quantity(item: SiteFinding, id: string) {
  return item.quantities.find((entry) => entry.id === id)?.value;
}

function feet(value: number) {
  if (value < 10) return `${value.toFixed(1)} ft`;
  return `${Math.round(value).toLocaleString("en-US")} ft`;
}

function urbanFeet(value: number) {
  if (value < 1) return "meets the parcel";
  return feet(value);
}

function viewFeet(value: number) {
  return `${Math.round(value).toLocaleString("en-US")} ft`;
}

function eastNorth(x: number, z: number) {
  return `${Math.round(x)} east, ${Math.round(z)} north`;
}

function formatDate(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

function formatTime(time: string) {
  const [hour, minute] = time.split(":").map(Number);
  const suffix = hour >= 12 ? "PM" : "AM";
  return `${hour % 12 || 12}:${String(minute).padStart(2, "0")} ${suffix}`;
}

function shortZone(name: string) {
  if (name === "Eastern Standard Time") return "EST";
  if (name === "Eastern Daylight Time") return "EDT";
  return name;
}

function bearingTitle(bearing: number) {
  if (bearing === 0) return "due east";
  if (bearing > 0) return `${bearing}° north of east`;
  return `${Math.abs(bearing)}° south of east`;
}

export function findingMeasurement(item: SiteFinding) {
  if (item.kind === "access") return `${feet(quantity(item, "gap") ?? 0)} from the sidewalk to the parcel boundary`;
  if (item.kind === "station-gap") {
    const point = item.geometry.type === "point" ? item.geometry : null;
    const station: StationWalk = {
      name: item.title,
      address: "",
      openFlag: quantity(item, "openFlag") ?? 0,
      x: point?.x ?? 0,
      z: point?.z ?? 0,
      routeFeet: quantity(item, "countyRoute") ?? null,
      offsetFeet: quantity(item, "sidewalkOffset") ?? null,
      mappedGapFeet: quantity(item, "mappedGap") ?? null,
      mappedReach: setting(item, "mappedReach") === "opening" || setting(item, "mappedReach") === "short" ? setting(item, "mappedReach") as "opening" | "short" : "absent",
    };
    return stationAccount(station);
  }
  if (item.kind === "baywalk") {
    const length = quantity(item, "length");
    const parcel = quantity(item, "parcelDistance");
    if (length === undefined) return "Named length is not stored.";
    return parcel === undefined
      ? `${feet(length)} mapped length. Distance from the parcel is not stored.`
      : `${feet(length)} mapped length, ${feet(parcel)} from the parcel`;
  }
  if (item.kind === "centroid" || item.kind === "boundary" || item.kind === "neighbor") {
    const description = setting(item, "description");
    if (item.kind === "boundary") return `${quantity(item, "boundaryVertices") ?? 0} parcel-boundary vertices. ${description}`;
    if (item.kind === "neighbor") return `${urbanFeet(quantity(item, "distance") ?? 0)}. ${description}`;
    return description;
  }
  if (item.kind === "destination") return `${urbanFeet(quantity(item, "distance") ?? 0)} from the parcel boundary`;
  if (item.kind === "view-point") {
    const open = quantity(item, "openRays");
    const shore = quantity(item, "shoreRays");
    const eye = (quantity(item, "eyeHeight") ?? 0).toFixed(1);
    return open !== undefined && shore !== undefined ? `${open} of ${shore} open at ${eye} ft eye height` : `Eye height ${eye} ft`;
  }
  if (item.kind === "view-ray") {
    const length = quantity(item, "shore");
    if (setting(item, "open") === "yes" && length !== undefined) return `Open for ${viewFeet(length)} to the mapped coastline`;
    return `Blocked by ${setting(item, "blocker")}, ${Math.round(quantity(item, "blockerHeight") ?? 0)} ft, ${setting(item, "blockerSource")}, ${viewFeet(quantity(item, "blockerFeet") ?? 0)} away`;
  }
  if (item.kind === "road") return `${viewFeet(quantity(item, "distance") ?? 0)} to the mapped centerline`;
  if (item.kind === "sun") {
    const shadow = quantity(item, "shadow");
    if (shadow === undefined) return "No shadow. The sun is below the horizon.";
    return `${shadow < 0.1 ? shadow.toFixed(2) : shadow.toFixed(1)} ft of shadow per ft of height`;
  }
  if (item.kind === "wind-sector") {
    const from = quantity(item, "from");
    const speed = quantity(item, "speed");
    const hours = quantity(item, "sectorHours");
    const moving = quantity(item, "movingHours");
    const share = hours !== undefined && moving ? Math.round((100 * hours) / moving) : 0;
    return `From ${(from ?? 0).toFixed(0)}°, ${(speed ?? 0).toFixed(1)} m/s, ${share}% of moving hours`;
  }
  if (item.kind === "wind-vector") return `From ${(quantity(item, "from") ?? 0).toFixed(0)}°`;
  if (item.kind === "network") return `${feet(quantity(item, "length") ?? 0)}, ${quantity(item, "sidewalks") ?? 0} sidewalks, ${quantity(item, "routes") ?? 0} county routes`;
  return item.title;
}

export function findingSpace(item: SiteFinding) {
  const geometry = item.geometry;
  if (item.kind === "access" && geometry.type === "segment") {
    return `${setting(item, "sidewalk")}. Parcel edge ${eastNorth(geometry.to.x, geometry.to.z)}. Sidewalk ${eastNorth(geometry.from.x, geometry.from.z)}.`;
  }
  if (item.kind === "station-gap" && geometry.type === "point") {
    return `Station at ${eastNorth(geometry.x, geometry.z)}. County open flag ${quantity(item, "openFlag") ?? 0}.`;
  }
  if (item.kind === "baywalk") return "Named mapped segment. Individual county sidewalks inside the 80 ft buffer are not stored as separate contacts.";
  if (item.kind === "centroid") return "County polygon that contains the parcel centroid. This is not a neighboring use.";
  if (item.kind === "boundary") return "This polygon contains stored parcel-boundary vertices. No separate distance point is stored for the contact.";
  if (item.kind === "neighbor" && geometry.type === "polygon" && geometry.segment) {
    const segment = geometry.segment;
    return `Measured from ${eastNorth(segment.from.x, segment.from.z)} on the parcel side to ${eastNorth(segment.to.x, segment.to.z)} on the county polygon.`;
  }
  if (item.kind === "neighbor") return `${urbanFeet(quantity(item, "distance") ?? 0)} from the parcel boundary. No measured endpoint is stored for this polygon.`;
  if (item.kind === "destination" && geometry.type === "point") return `Point at ${eastNorth(geometry.x, geometry.z)}. ${setting(item, "note")}`;
  if (item.kind === "view-point" && geometry.type === "point") {
    return `${eastNorth(geometry.x, geometry.z)}, eye height ${(quantity(item, "eyeHeight") ?? 0).toFixed(1)} ft, inside the parcel.`;
  }
  if (item.kind === "view-ray" && geometry.type === "ray") {
    return `From ${eastNorth(geometry.origin.x, geometry.origin.z)}, eye height ${geometry.origin.y.toFixed(1)} ft. Bearing ${geometry.bearingDegrees}° from east.`;
  }
  if (item.kind === "road" && geometry.type === "segment") {
    return `From the ${setting(item, "point")} point at ${eastNorth(geometry.from.x, geometry.from.z)} to ${eastNorth(geometry.to.x, geometry.to.z)} on the centerline.`;
  }
  if (item.kind === "sun" && geometry.type === "direction") {
    const altitude = quantity(item, "altitude");
    return `Azimuth ${geometry.fromDegrees.toFixed(1)}° from north, altitude ${(altitude ?? 0).toFixed(1)}°. The shadow length is a ratio on flat ground. No shaded edge of the parcel is stored.`;
  }
  if (item.kind === "wind-sector" && geometry.type === "direction") {
    return `Comes from ${geometry.fromDegrees.toFixed(0)}°. Rose center ${(quantity(item, "center") ?? 0)}°. No location on the parcel is stored.`;
  }
  if (item.kind === "wind-vector") return "Speed-weighted mean of moving hours. Not a sector and not a location on the parcel.";
  return geometry.type === "none" ? geometry.reason : "No spatial reference is stored.";
}

export function findingSettings(item: SiteFinding) {
  if (item.kind === "sun") return `${formatDate(setting(item, "date"))}, ${formatTime(setting(item, "time"))} ${shortZone(setting(item, "zone"))}`;
  if (item.kind === "wind-sector" || item.kind === "wind-vector") return `${setting(item, "period")}, ${setting(item, "condition")}`;
  if (item.kind === "view-point" || item.kind === "view-ray") return `${setting(item, "point")}, eye height ${Number(setting(item, "eyeHeight")).toFixed(1)} ft`;
  if (item.kind === "road") return `${setting(item, "point")}, road proximity`;
  return setting(item, "mode") || item.settings.map((entry) => entry.value).join(", ");
}

export function findingSource(item: SiteFinding) {
  return item.source.detail;
}

export function findingReliability(item: SiteFinding) {
  return item.reliability;
}

export function AnalysisColumnFrame({
  findings,
  gap,
  inputs,
  onRetain,
  onLive,
  children,
}: {
  findings: readonly SiteFinding[];
  gap?: string | null;
  inputs: readonly SiteObservation[];
  onRetain: (finding: SiteFinding) => void;
  onLive: (findings: readonly SiteFinding[]) => void;
  children: ReactNode;
}) {
  return (
    <aside className="site-panel site-panel-analysis site-analysis-panel site-analysis-column" aria-label="Analysis results">
      <div className="site-analysis-evaluate">
        <header className="site-analysis-head">
          <p><span>03</span> Evaluate</p>
        </header>
        {children}
      </div>
      <AnalysisSelect findings={findings} gap={gap ?? null} inputs={inputs} onRetain={onRetain} onLive={onLive} />
    </aside>
  );
}

export function AnalysisSelect({
  findings,
  gap,
  inputs,
  onRetain,
  onLive,
}: {
  findings: readonly SiteFinding[];
  gap: string | null;
  inputs: readonly SiteObservation[];
  onRetain: (finding: SiteFinding) => void;
  onLive: (findings: readonly SiteFinding[]) => void;
}) {
  const signature = findings.map(observationKey).join("\n");
  const findingsRef = useRef(findings);
  findingsRef.current = findings;
  useEffect(() => {
    onLive(findingsRef.current);
  }, [signature, onLive]);
  useEffect(() => () => onLive([]), [onLive]);
  return (
    <section className="site-analysis-select" aria-label="Select inputs">
      <header className="site-analysis-head">
        <p><span>04</span> Select inputs</p>
        <h2>Keep a measured finding</h2>
      </header>
      {findings.length === 0 ? <p className="site-note">{gap ?? "No individual finding is available for this reading."}</p> : (
        <ul className="site-analysis-findings">
          {findings.map((finding) => {
            const retained = inputs.find((item) => item.id === finding.id) ?? null;
            const same = Boolean(retained && observationKey(retained) === observationKey(finding));
            const label = same ? "Retained" : retained ? "Replace" : "Retain";
            return (
              <li key={finding.id}>
                <div>
                  <strong>{finding.title}</strong>
                  <span>{findingMeasurement(finding)}</span>
                  <em>{findingSpace(finding)}</em>
                </div>
                <button type="button" disabled={same} onClick={() => onRetain(finding)}>{label}</button>
              </li>
            );
          })}
        </ul>
      )}
      {findings.length > 0 && gap ? <p className="site-note">{gap}</p> : null}
    </section>
  );
}

export function SiteInputReview({
  open,
  inputs,
  live,
  onClose,
  onRemove,
  onReplace,
}: {
  open: boolean;
  inputs: readonly SiteObservation[];
  live: readonly SiteFinding[];
  onClose: () => void;
  onRemove: (id: string) => void;
  onReplace: (finding: SiteFinding) => void;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  const groups = new Map<string, SiteObservation[]>();
  for (const item of inputs) {
    const list = groups.get(item.study) ?? [];
    list.push(item);
    groups.set(item.study, list);
  }
  const ordered = [...groups.keys()].sort((a, b) => {
    const ai = STUDY_ORDER.indexOf(a);
    const bi = STUDY_ORDER.indexOf(b);
    return (ai === -1 ? STUDY_ORDER.length : ai) - (bi === -1 ? STUDY_ORDER.length : bi);
  });
  return (
    <div className="site-input-review" role="presentation" onClick={onClose}>
      <div
        className="site-input-sheet"
        role="dialog"
        aria-modal="true"
        aria-label="Selected site inputs"
        onClick={(event) => event.stopPropagation()}
      >
        <header>
          <div className="site-analysis-head">
            <p>Selected site inputs</p>
            <h2>{inputs.length === 0 ? "None retained" : `${inputs.length} retained`}</h2>
          </div>
          <button type="button" onClick={onClose}>Close</button>
        </header>
        <p className="site-note">Each card is one retained observation from the study on screen. Nothing here is an attractor, a program placement, a weight, or a growth rule.</p>
        {inputs.length === 0 ? <p className="site-note">Retain a finding from step 04 to keep it here.</p> : (
          <div className="site-input-list">
            {ordered.map((study) => (
              <section key={study}>
                <h3>{study}</h3>
                {(groups.get(study) ?? []).map((item) => {
                  const current = live.find((finding) => finding.id === item.id) ?? null;
                  const differs = Boolean(current && observationKey(current) !== observationKey(item));
                  return (
                    <article key={item.id}>
                      <header>
                        <span className="site-input-flag">Retained observation</span>
                        <strong>{item.title}</strong>
                      </header>
                      <p className="site-input-relation" data-state={current ? (differs ? "differs" : "same") : "other"}>
                        {current
                          ? differs
                            ? "Different from the finding now on screen."
                            : "Same as the finding now on screen."
                          : "Held aside. This finding is not in the current list."}
                      </p>
                      <p><span>Measurement</span>{findingMeasurement(item)}</p>
                      <p><span>Spatial reference</span>{findingSpace(item)}</p>
                      <p><span>Settings</span>{findingSettings(item)}</p>
                      <p><span>Source</span>{findingSource(item)}</p>
                      <p><span>Reliability</span>{findingReliability(item)}</p>
                      <div className="site-modes">
                        <button type="button" onClick={() => onRemove(item.id)}>Remove</button>
                        <button type="button" disabled={!differs || !current} onClick={() => current && onReplace(current)}>
                          {current ? (differs ? "Replace this finding" : "Matches the current finding") : "Not on screen"}
                        </button>
                      </div>
                    </article>
                  );
                })}
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
