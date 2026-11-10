"use client";

import { AnalysisAccuracy } from "./analysis-record";
import { AccessIcon, BaywalkIcon, ExploreSegment, NetworkIcon } from "./explore-controls";
import { AnalysisColumnFrame, siteRecord, type SiteFinding, type SiteObservation } from "./site-inputs";
import {
  PEDESTRIAN_LIMITS,
  PEDESTRIAN_MODES,
  PEDESTRIAN_SOURCES,
  mappedLinks,
  type PedestrianMode,
  type PedestrianStudy,
} from "@/lib/skill5/pedestrian";

function feet(value: number) {
  if (value < 10) return `${value.toFixed(1)} ft`;
  return `${Math.round(value).toLocaleString("en-US")} ft`;
}

export function PedestrianConfigure({
  mode,
  onMode,
}: {
  mode: PedestrianMode;
  onMode: (mode: PedestrianMode) => void;
}) {
  const icon = {
    network: <NetworkIcon />,
    baywalk: <BaywalkIcon />,
    access: <AccessIcon />,
  } as const;
  const short = { network: "Network", baywalk: "Shore", access: "Access" } as const;
  return (
    <ExploreSegment
      label="Pedestrian mode"
      value={mode}
      options={PEDESTRIAN_MODES.map((item) => ({
        id: item.id,
        label: short[item.id],
        title: item.id === "baywalk" ? "Shore" : item.label,
        icon: icon[item.id],
      }))}
      onChange={onMode}
    />
  );
}

export function PedestrianResults({
  mode,
  study,
  inputs,
  onRetain,
  onLive,
}: {
  mode: PedestrianMode;
  study: PedestrianStudy;
  inputs: readonly SiteObservation[];
  onRetain: (finding: SiteFinding) => void;
  onLive: (findings: readonly SiteFinding[]) => void;
}) {
  const countyRoutes = study.stations.filter((station) => station.routeFeet !== null);
  const mappedOpenings = study.stations.filter((station) => station.mappedReach === "opening");
  const city = study.cityAccess[0];
  const northeast = study.waterfrontAccess[0];
  const studyName = "Pedestrian Mobility + Baywalk";
  const accessFindings = [...study.waterfrontAccess, ...study.cityAccess].map((contact) => siteRecord({
        id: `pedestrian:access:${contact.label}`,
        study: studyName,
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
        source: {
          name: "Miami-Dade DTPW sidewalk inventory",
          retrieved: PEDESTRIAN_SOURCES.retrieved,
          detail: `Miami-Dade DTPW sidewalk inventory, retrieved ${PEDESTRIAN_SOURCES.retrieved}. The gap is the measured distance to the parcel boundary.`,
        },
        reliability: "Unverified. A gap is not a built path or a confirmed entrance.",
        gaps: ["The sidewalk feature id is not stored on the contact."],
      }));
  const stationFindings = study.stations.filter((station) => station.routeFeet === null || station.mappedReach !== "absent" || station.mappedGapFeet !== null || (station.offsetFeet !== null && station.offsetFeet > 0)).map((station) => siteRecord({
          id: `pedestrian:gap:${station.name}`,
          study: studyName,
          kind: "station-gap",
          title: station.name,
          quantities: [
            ...(station.routeFeet === null ? [] : [{ id: "countyRoute", value: station.routeFeet, unit: "ft" as const }]),
            ...(station.offsetFeet === null ? [] : [{ id: "sidewalkOffset", value: station.offsetFeet, unit: "ft" as const }]),
            ...(station.mappedGapFeet === null ? [] : [{ id: "mappedGap", value: station.mappedGapFeet, unit: "ft" as const }]),
            { id: "openFlag", value: station.openFlag, unit: "count" as const },
          ],
          geometry: { type: "point", x: station.x, z: station.z },
          settings: [
            { id: "mode", value: "County sidewalk network" },
            { id: "mappedReach", value: station.mappedReach },
          ],
          source: {
            name: "Miami-Dade DTPW sidewalk inventory and county Metromover stations",
            retrieved: PEDESTRIAN_SOURCES.retrieved,
            detail: "County sidewalk routes and stored Metromover stations. The open flag is the stored county attribute, not a live operating check.",
          },
          reliability: station.mappedReach === "opening"
            ? "A mapped join of up to 11.9 ft is unverified. A larger gap stays open."
            : station.routeFeet === null
              ? "No county sidewalk route is stored from the parcel to this station."
              : "The county route is from the stored sidewalk inventory. Mapped gaps stay open.",
          gaps: [
            ...(station.routeFeet === null ? ["No county sidewalk route is stored from the parcel to this station."] : []),
            "The route geometry between the parcel and the station is not stored on this gap.",
          ],
        }));
  const baywalkFinding = siteRecord({
          id: "pedestrian:baywalk:named",
          study: studyName,
          kind: "baywalk",
          title: "Named Baywalk",
          quantities: [
            { id: "length", value: study.namedBaywalkFeet, unit: "ft" },
            ...(study.namedBaywalkParcelFeet === null ? [] : [{ id: "parcelDistance", value: study.namedBaywalkParcelFeet, unit: "ft" as const }]),
          ],
          geometry: {
            type: "polyline",
            featureIds: mappedLinks.filter((link) => link.name.toLowerCase() === "baywalk").map((link) => link.id),
            paths: mappedLinks.filter((link) => link.name.toLowerCase() === "baywalk").map((link) => link.path.map(([x, z]) => ({ x, z }))),
          },
          settings: [{ id: "mode", value: "Shoreline proximity" }],
          source: {
            name: "OpenStreetMap named Baywalk",
            retrieved: PEDESTRIAN_SOURCES.retrieved,
            detail: "OpenStreetMap named Baywalk segment. County sidewalks that meet the buffer remain street sidewalks.",
          },
          reliability: "Mapped, not a county survey. Buffer length is not Baywalk continuity.",
          gaps: [
            "The point on the parcel used for the named-segment distance is not stored.",
            "Individual county sidewalks inside the 80 ft buffer are not stored as separate contacts.",
            "Proposed I-395 has no published line.",
          ],
        });
  const networkFinding = siteRecord({
    id: "pedestrian:network:county",
    study: studyName,
    kind: "network",
    title: "County sidewalk network",
    quantities: [
      { id: "length", value: study.countyFeet, unit: "ft" },
      { id: "sidewalks", value: study.countyCount, unit: "count" },
      { id: "routes", value: countyRoutes.length, unit: "count" },
    ],
    geometry: { type: "none", reason: "The county total is the length of many sidewalks. It is not one path." },
    settings: [{ id: "mode", value: "County sidewalk network" }],
    source: {
      name: "Miami-Dade DTPW sidewalk inventory",
      retrieved: PEDESTRIAN_SOURCES.retrieved,
      detail: `Miami-Dade DTPW sidewalk inventory, retrieved ${PEDESTRIAN_SOURCES.retrieved}.`,
    },
    reliability: "County lines are verified. The total is not a route to one station.",
    gaps: ["No single path is stored for the county total."],
  });
  const findings = [networkFinding, ...accessFindings, baywalkFinding, ...(mode === "network" ? stationFindings : [])];
  const gap = `The 80 ft buffer holds ${feet(study.coastCountyNearFeet)}. The meeting sidewalks total ${feet(study.coastCountyFeet)}. Those totals are not the named Baywalk.`;
  return (
    <AnalysisColumnFrame findings={findings} gap={gap} inputs={inputs} onRetain={onRetain} onLive={onLive}>
      <section className="site-block">
        <div className="site-sun-figures">
          <div>
            <span>County network</span>
            <strong>{feet(study.countyFeet)}</strong>
            <em>{countyRoutes.length} routes, {study.mappedCrossings} mapped crossings</em>
          </div>
          <div>
            <span>Northeast access</span>
            <strong>{northeast ? feet(northeast.gapFeet) : "None"}</strong>
            <em>{northeast ? northeast.name : "No contact within 40 ft"}</em>
          </div>
          <div>
            <span>City-side access</span>
            <strong>{city ? feet(city.gapFeet) : "None"}</strong>
            <em>{city ? city.name : "No contact within 40 ft"}</em>
          </div>
        </div>
        <div className="site-sun-figures">
          <div>
            <span>Named Baywalk</span>
            <strong>{feet(study.namedBaywalkFeet)}</strong>
            <em>{study.namedBaywalkParcelFeet === null ? "No named segment" : `${feet(study.namedBaywalkParcelFeet)} from the parcel`}</em>
          </div>
          <div>
            <span>Buffer length</span>
            <strong>{feet(study.coastCountyNearFeet)}</strong>
            <em>inside 80 ft, not Baywalk</em>
          </div>
          <div>
            <span>Museum Park</span>
            <strong>{study.museumConnected ? "Route" : "No route"}</strong>
            <em>{mappedOpenings.length} mapped joins stay unverified</em>
          </div>
        </div>
        {mode === "network" ? (
          <div className="site-meter-list" aria-label="Stations">
            {study.stations.map((station) => (
              <div key={station.name}>
                <span>{station.name}</span>
                <span className="site-evaluate-track"><i style={{ width: station.routeFeet === null ? "8%" : "100%" }} /></span>
                <em>{station.routeFeet === null ? "No route" : feet(station.routeFeet)}</em>
              </div>
            ))}
          </div>
        ) : null}
        <AnalysisAccuracy limits={PEDESTRIAN_LIMITS} />
      </section>
      <section className="site-block">
        <h2 className="site-subtitle">Legend</h2>
        <ul className="site-analysis-legend">
          <li data-rank="primary"><i style={{ background: "#f4f4f0" }} /><span>{mode === "baywalk" ? "County sidewalk in the buffer. The stroke is not a surveyed width." : "County sidewalk or station. The stroke is not a surveyed width."}</span></li>
          {mode === "baywalk" ? <li data-rank="support"><i style={{ background: "#d0d0d0" }} /><span>Named Baywalk segment, separate from the parcel</span></li> : null}
          <li data-rank="mapped"><i style={{ background: "#7a7a7a" }} /><span>{mode === "baywalk" ? "Other mapped shoreline line, not a county survey" : "Mapped, not a county survey"}</span></li>
          {mode === "access" ? <li data-rank="support"><i style={{ background: "#bdbdbd" }} /><span>Gap to the parcel. Unverified, not a path</span></li> : null}
          {mode === "baywalk" ? <li data-rank="marker"><i /><span>Proposed I-395 connection is not drawn</span></li> : null}
        </ul>
      </section>
    </AnalysisColumnFrame>
  );
}
