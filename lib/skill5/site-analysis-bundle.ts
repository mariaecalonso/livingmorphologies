import { analysisRampRoads, elevatedDeckGeometry, inStudy } from "@/components/site/site-geometry";
import { mappedLinks, pedestrianStudy } from "@/lib/skill5/pedestrian";
import { solarAt, representativeSolarDates, type SolarSeasonId } from "@/lib/skill5/solar";
import { analysisTowers } from "@/lib/skill5/sun-analysis";
import { parcelSunExposure, type ExposureCell, type ExposureMass, type ExposureTriangle } from "@/lib/skill5/sun-exposure";
import type { SiteContext, XZ } from "@/lib/skill5/site-model";
import { noiseReading, observationPoints, viewReading, bearingVector } from "@/lib/skill5/views-noise";
import { WIND_HISTORY_NOTE, WIND_SOURCE, travelVector, windSummary } from "@/lib/skill5/wind";

export const SITE_ANALYSIS_GENERATED_KEY = "lm.site-analysis.generated.v1";
export const SITE_ANALYSIS_GENERATED_CONTRACT = "site-analysis-generated-v1";

const SUN_TIMES = [
  { id: "morning", clock: "09:00" },
  { id: "noon", clock: "12:30" },
  { id: "afternoon", clock: "15:00" },
] as const;

const WIND_IDS = ["spring", "summer", "autumn", "winter"] as const;

export type GeneratedStatus = "generated" | "pending" | "unavailable" | "error";

export type SunScenarioRecord = {
  season: SolarSeasonId;
  time: (typeof SUN_TIMES)[number]["id"];
  date: string;
  clock: string;
  altitude: number;
  azimuth: number;
  shadowPerFoot: number | null;
  above: boolean;
  cells: ExposureCell[];
  exposed: number;
  shaded: number;
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  spacingFeet: number;
};

export type HandoffRecord = {
  id: string;
  kind: string;
  title: string;
  quantities: { id: string; value: number; unit: string }[];
  geometry: Record<string, unknown>;
  settings: { id: string; value: string }[];
  reliability: string;
  gaps: string[];
};

export type SiteAnalysisBundle = {
  contract: typeof SITE_ANALYSIS_GENERATED_CONTRACT;
  approved: false;
  generatedAt: string;
  frame: {
    axes: { x: "east"; y: "up"; z: "north" };
    linearUnit: "international feet";
    angularUnit: "degrees clockwise from north";
    parcel: { x: number; z: number }[];
  };
  handoff: {
    consumer: "Site Integration";
    reads: string;
    doesNotRead: string;
    frozenFile: "data/skill5/site-inputs-v1.json";
  };
  sun: {
    status: GeneratedStatus;
    detail: string;
    scenarios: SunScenarioRecord[];
    assumptions: string[];
  };
  wind: {
    status: GeneratedStatus;
    detail: string;
    seasons: {
      id: (typeof WIND_IDS)[number];
      label: string;
      prevailing: string | null;
      fromDegrees: number | null;
      travelEast: number | null;
      travelNorth: number | null;
      /** Period mean, including calm hours. This is not the prevailing-wedge mean. */
      meanSpeed: number;
      meanSpeedScope: "period-including-calm";
      /** Mean speed inside the fullest 22.5° wedge. Null when that wedge is missing. */
      prevailingMeanSpeed: number | null;
      frequency: number;
      uniformField: true;
    }[];
    source: string;
    uncertainty: "Airport composite. The direction does not vary across the parcel. Not airflow around the buildings.";
  };
  views: {
    status: GeneratedStatus;
    detail: string;
    eyeHeightFeet: number;
    records: HandoffRecord[];
    uncertainty: string;
  };
  pedestrian: {
    status: GeneratedStatus;
    detail: string;
    records: HandoffRecord[];
    uncertainty: string;
  };
};

/** Triangles of the same elevated ramp decks that cast the study shadows. */
export function rampExposureTriangles(roads: SiteContext["roads"]): ExposureTriangle[] {
  const geometry = elevatedDeckGeometry(analysisRampRoads(roads));
  const position = geometry.getAttribute("position");
  const index = geometry.getIndex();
  const triangles: ExposureTriangle[] = [];
  if (position && index) {
    for (let cursor = 0; cursor < index.count; cursor += 3) {
      const corners = [index.getX(cursor), index.getX(cursor + 1), index.getX(cursor + 2)].map((vertex) => (
        [position.getX(vertex), position.getY(vertex), position.getZ(vertex)] as const
      ));
      triangles.push([corners[0], corners[1], corners[2]]);
    }
  }
  geometry.dispose();
  return triangles;
}

function massesOf(site: SiteContext): ExposureMass[] {
  const towers = analysisTowers(site.buildings);
  const masses: ExposureMass[] = [];
  for (const building of site.buildings) {
    if (building.heightFeet === null || building.heightFeet <= 0 || building.ring.length < 3) continue;
    let x = 0;
    let z = 0;
    for (const point of building.ring) {
      x += point[0];
      z += point[1];
    }
    if (!inStudy(x / building.ring.length, z / building.ring.length)) continue;
    masses.push({ ring: building.ring, heightFeet: building.heightFeet });
  }
  for (const tower of towers) {
    if (tower.heightFeet > 0 && tower.ring.length >= 3) masses.push({ ring: tower.ring, heightFeet: tower.heightFeet });
  }
  return masses;
}

function sunLayer(site: SiteContext, masses: ExposureMass[], triangles: readonly ExposureTriangle[], dates: Record<SolarSeasonId, string> | null): SiteAnalysisBundle["sun"] {
  if (!dates) {
    return { status: "unavailable", detail: "Representative solar dates could not be calculated.", scenarios: [], assumptions: [] };
  }
  const scenarios: SunScenarioRecord[] = [];
  for (const season of Object.keys(dates) as SolarSeasonId[]) {
    for (const time of SUN_TIMES) {
      const sample = solarAt(site.origin.lat, site.origin.lon, dates[season], time.clock);
      const grid = parcelSunExposure(site.site.ring, masses, sample.toSun, 40, triangles);
      if (!grid) continue;
      scenarios.push({
        season,
        time: time.id,
        date: dates[season],
        clock: time.clock,
        altitude: sample.altitude,
        azimuth: sample.azimuth,
        shadowPerFoot: sample.shadowPerFoot,
        above: sample.above,
        cells: grid.cells,
        exposed: grid.exposed,
        shaded: grid.shaded,
        bounds: grid.bounds,
        spacingFeet: grid.spacingFeet,
      });
    }
  }
  if (scenarios.length !== 12) {
    return {
      status: "error",
      detail: `${scenarios.length} of 12 sun and shade grids were calculated.`,
      scenarios,
      assumptions: ["A missing grid is not filled with an assumed exposure."],
    };
  }
  return {
    status: "generated",
    detail: "12 representative date and time grids on the open parcel.",
    scenarios,
    assumptions: [
      "Each date is one equinox or solstice, not average sunlight for the season.",
      "Shade is a geometric test against stored building heights, tower heights, and the elevated ramp decks drawn on the model.",
      "A ramp shades a sample only when the ray meets that drawn deck. The open space under the deck stays open.",
      "Cells inside a building footprint are omitted.",
      "Estimated and story-count heights remain in the masses.",
      "A cell is shaded only when the ray meets a stored mass or ramp deck. A fully exposed grid is kept as calculated.",
    ],
  };
}

function windLayer(): SiteAnalysisBundle["wind"] {
  const seasons = WIND_IDS.map((id) => {
    const summary = windSummary(id, 0, "all");
    const moving = summary.hours - summary.calmHours;
    const frequency = summary.prevailing && moving > 0 ? (100 * summary.prevailing.hours) / moving : 0;
    return {
      id,
      label: id === "autumn" ? "Fall" : summary.season === "autumn" ? "Fall" : id.charAt(0).toUpperCase() + id.slice(1),
      prevailing: summary.prevailing?.name ?? null,
      fromDegrees: summary.prevailing?.meanFrom ?? null,
      travelEast: summary.prevailing ? travelVector(summary.prevailing.meanFrom).east : null,
      travelNorth: summary.prevailing ? travelVector(summary.prevailing.meanFrom).north : null,
      meanSpeed: summary.meanSpeed,
      meanSpeedScope: "period-including-calm" as const,
      prevailingMeanSpeed: summary.prevailing?.meanSpeed ?? null,
      frequency,
      uniformField: true as const,
    };
  });
  const ready = seasons.every((season) => season.prevailing && season.fromDegrees !== null);
  return {
    status: ready ? "generated" : "unavailable",
    detail: ready
      ? "Four seasonal directions from the airport record. meanSpeed is the period mean, including calm hours. prevailingMeanSpeed is the mean inside the fullest wedge. The field is uniform because the source has no position on the parcel."
      : "A seasonal prevailing direction is missing, so that field is not invented.",
    seasons,
    source: `${WIND_SOURCE.dataset}, ${WIND_SOURCE.station}. ${WIND_HISTORY_NOTE}`,
    uncertainty: "Airport composite. The direction does not vary across the parcel. Not airflow around the buildings.",
  };
}

function viewsLayer(site: SiteContext): SiteAnalysisBundle["views"] {
  const points = observationPoints(site.site.ring, site.coastline.path, site.water.ring);
  const towers = analysisTowers(site.buildings);
  const eyeHeightFeet = 5.5;
  const records: HandoffRecord[] = [];
  for (const point of points) {
    const view = viewReading(point, eyeHeightFeet, site.buildings, site.coastline.path, inStudy, towers);
    const noise = noiseReading(point, site.roads);
    records.push({
      id: `views:point:${point.id}:${eyeHeightFeet.toFixed(1)}`,
      kind: "view-point",
      title: `${point.label} observation point`,
      quantities: [
        { id: "eyeHeight", value: eyeHeightFeet, unit: "ft" },
        { id: "openRays", value: view.openRays, unit: "count" },
        { id: "shoreRays", value: view.shoreRays, unit: "count" },
      ],
      geometry: { type: "point", x: point.x, y: eyeHeightFeet, z: point.z },
      settings: [
        { id: "point", value: point.label },
        { id: "eyeHeight", value: eyeHeightFeet.toFixed(1) },
      ],
      reliability: "A stored point. It is not a surveyed monument.",
      gaps: [],
    });
    for (const ray of view.rays) {
      const length = ray.blockerFeet ?? ray.shoreFeet;
      if (length === null) continue;
      const direction = bearingVector(ray.bearing);
      records.push({
        id: `views:ray:${point.id}:${ray.bearing}`,
        kind: "view-ray",
        title: `${point.label} bearing ${ray.bearing}°`,
        quantities: [
          { id: "bearing", value: ray.bearing, unit: "deg" },
          { id: "length", value: length, unit: "ft" },
        ],
        geometry: {
          type: "segment",
          from: { role: "observation", x: point.x, y: eyeHeightFeet, z: point.z },
          to: {
            role: ray.open ? "coastline" : "blocker",
            x: point.x + direction.east * length,
            z: point.z + direction.north * length,
          },
        },
        settings: [
          { id: "point", value: point.label },
          { id: "open", value: ray.open ? "yes" : "no" },
          { id: "eyeHeight", value: eyeHeightFeet.toFixed(1) },
        ],
        reliability: ray.open
          ? "Open means the bearing meets the mapped coastline. It is not a verified view of a named place."
          : "The block is the first stored mass in front of the coastline.",
        gaps: ray.blockerSource === "estimated" || ray.blockerSource === "osm-levels" ? ["The blocking height is estimated or a story count."] : [],
      });
    }
    for (const source of [noise.macarthur, noise.expressway, noise.local]) {
      if (source.feet === null || source.x === null || source.z === null) continue;
      records.push({
        id: `views:road:${point.id}:${source.id}`,
        kind: "road",
        title: source.name ?? source.label,
        quantities: [{ id: "distance", value: source.feet, unit: "ft" }],
        geometry: {
          type: "segment",
          from: { role: "observation", x: point.x, z: point.z },
          to: { role: "centerline", x: source.x, z: source.z },
        },
        settings: [
          { id: "point", value: point.label },
          { id: "road", value: source.id },
        ],
        reliability: "Not a decibel reading and not a ranking of loudness.",
        gaps: [],
      });
    }
  }
  return {
    status: records.some((record) => record.kind === "view-point") ? "generated" : "unavailable",
    detail: records.length > 0 ? `${points.length} observation points at ${eyeHeightFeet.toFixed(1)} ft, with mapped road distances.` : "No observation points were calculated.",
    eyeHeightFeet,
    records,
    uncertainty: "Sightlines use stored heights. Road distances are to mapped centerlines, not decibels.",
  };
}

function pedestrianLayer(parcel: readonly XZ[], shore: readonly XZ[]): SiteAnalysisBundle["pedestrian"] {
  const study = pedestrianStudy(parcel, shore);
  const records: HandoffRecord[] = [];
  for (const contact of [...study.waterfrontAccess, ...study.cityAccess]) {
    records.push({
      id: `pedestrian:access:${contact.label}`,
      kind: "access",
      title: contact.label,
      quantities: [{ id: "gap", value: contact.gapFeet, unit: "ft" }],
      geometry: {
        type: "segment",
        from: { role: "sidewalk", x: contact.walkX, z: contact.walkZ },
        to: { role: "parcel-edge", x: contact.boundaryX, z: contact.boundaryZ },
      },
      settings: [
        { id: "mode", value: "Parcel contacts" },
        { id: "sidewalk", value: contact.name },
        { id: "side", value: contact.side },
      ],
      reliability: "Unverified. A gap is not a built path or a confirmed entrance.",
      gaps: ["The sidewalk feature id is not stored on the contact."],
    });
  }
  const baywalkPaths = mappedLinks.filter((link) => link.name.toLowerCase() === "baywalk").map((link) => link.path.map(([x, z]) => ({ x, z })));
  records.push({
    id: "pedestrian:baywalk:named",
    kind: "baywalk",
    title: "Named Baywalk",
    quantities: [
      { id: "length", value: study.namedBaywalkFeet, unit: "ft" },
      ...(study.namedBaywalkParcelFeet === null ? [] : [{ id: "parcelDistance", value: study.namedBaywalkParcelFeet, unit: "ft" }]),
    ],
    geometry: {
      type: "polyline",
      featureIds: mappedLinks.filter((link) => link.name.toLowerCase() === "baywalk").map((link) => link.id),
      paths: baywalkPaths,
    },
    settings: [{ id: "mode", value: "Shoreline proximity" }],
    reliability: "Mapped, not a county survey. Buffer length is not Baywalk continuity.",
    gaps: [
      "The named Baywalk does not touch the parcel.",
      "This is not a verified continuous connection.",
    ],
  });
  return {
    status: records.some((record) => record.kind === "access") ? "generated" : "unavailable",
    detail: "Sidewalk contacts and the named Baywalk. Access gaps are potential, not entrances.",
    records,
    uncertainty: "Access gaps are potential, not entrances. The named Baywalk does not touch the parcel.",
  };
}

export function buildSiteAnalysisBundle(site: SiteContext, dates: Record<SolarSeasonId, string> | null = null): SiteAnalysisBundle {
  const masses = massesOf(site);
  const triangles = rampExposureTriangles(site.roads);
  const solarDates = dates ?? representativeSolarDates(site.origin.lat, site.origin.lon, 2026);
  return {
    contract: SITE_ANALYSIS_GENERATED_CONTRACT,
    approved: false,
    generatedAt: new Date().toISOString(),
    frame: {
      axes: { x: "east" as const, y: "up" as const, z: "north" as const },
      linearUnit: "international feet" as const,
      angularUnit: "degrees clockwise from north" as const,
      parcel: site.site.ring.map(([x, z]) => ({ x, z })),
    },
    handoff: {
      consumer: "Site Integration",
      reads: "The network study loads sun grids, wind directions, sightlines, road distances, access gaps, and the named Baywalk from this record.",
      doesNotRead: "Nothing in this record is approved or turned into an attraction or repulsion weight.",
      frozenFile: "data/skill5/site-inputs-v1.json",
    },
    sun: sunLayer(site, masses, triangles, solarDates),
    wind: windLayer(),
    views: viewsLayer(site),
    pedestrian: pedestrianLayer(site.site.ring, site.coastline.path),
  };
}

export type SiteAnalysisStoreState = "pending" | "stored" | "incomplete" | "failed";

/** All four layers have to be generated before the browser record can be trusted. */
export function generatedBundleReady(bundle: SiteAnalysisBundle) {
  return bundle.contract === SITE_ANALYSIS_GENERATED_CONTRACT
    && bundle.approved === false
    && bundle.sun.status === "generated"
    && bundle.sun.scenarios.length === 12
    && bundle.wind.status === "generated"
    && bundle.wind.seasons.length === 4
    && bundle.wind.seasons.every((season) => season.prevailing !== null && season.fromDegrees !== null && season.meanSpeedScope === "period-including-calm")
    && bundle.views.status === "generated"
    && bundle.views.records.length > 0
    && bundle.pedestrian.status === "generated"
    && bundle.pedestrian.records.some((record) => record.kind === "access")
    && bundle.pedestrian.records.some((record) => record.kind === "baywalk");
}

export function datasetStorageSentence(state: SiteAnalysisStoreState, storedSentence: string) {
  if (state === "stored") return storedSentence;
  if (state === "incomplete") return "The dataset is incomplete, so it was not stored.";
  if (state === "failed") return "The dataset was calculated, but the browser did not store it.";
  return "The dataset has not been stored yet.";
}

export function writeSiteAnalysisBundle(bundle: SiteAnalysisBundle) {
  if (typeof window === "undefined" || !generatedBundleReady(bundle)) return false;
  try {
    const payload = JSON.stringify(bundle);
    window.localStorage.setItem(SITE_ANALYSIS_GENERATED_KEY, payload);
    if (window.localStorage.getItem(SITE_ANALYSIS_GENERATED_KEY) !== payload) {
      window.localStorage.removeItem(SITE_ANALYSIS_GENERATED_KEY);
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

export function readSiteAnalysisBundle(): SiteAnalysisBundle | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(SITE_ANALYSIS_GENERATED_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SiteAnalysisBundle;
    if (!generatedBundleReady(parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
}
