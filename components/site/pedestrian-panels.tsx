"use client";

import { AccessIcon, BaywalkIcon, ExploreSegment, NetworkIcon } from "./explore-controls";
import { roadSummary } from "./movement-layer";
import { AnalysisColumnFrame, siteRecord, type SiteFinding, type SiteObservation } from "./site-inputs";
import { AnalysisReadout } from "./analysis-readout";
import {
  PEDESTRIAN_MODES,
  PEDESTRIAN_SOURCES,
  mappedLinks,
  type LineApproach,
  type LineHit,
  type PedestrianMode,
  type PedestrianStudy,
} from "@/lib/skill5/pedestrian";
import type { SiteRoad } from "@/lib/skill5/site-model";

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

function pathLength(path: readonly (readonly [number, number])[]) {
  let length = 0;
  for (let index = 1; index < path.length; index += 1) length += Math.hypot(path[index][0] - path[index - 1][0], path[index][1] - path[index - 1][1]);
  return length;
}

function sourceName(name: string) {
  if (/HERALD/i.test(name)) return "Herald Plaza";
  if (/15/.test(name)) return "NE 15th Street";
  return name;
}

function authorityLabel(authorityName: string) {
  return authorityName === "county" ? "County" : "OSM mapped";
}

export function PedestrianResults({
  mode,
  study,
  roads,
  approaches,
  probe,
  inputs,
  onRetain,
  onRemove,
  onLive,
}: {
  mode: PedestrianMode;
  study: PedestrianStudy;
  roads: readonly SiteRoad[];
  approaches: readonly LineApproach[];
  probe: LineHit | null;
  inputs: readonly SiteObservation[];
  onRetain: (finding: SiteFinding) => void;
  onRemove?: (id: string) => void;
  onLive: (findings: readonly SiteFinding[]) => void;
}) {
  const countyRoutes = study.stations.filter((station) => station.routeFeet !== null);
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
  const findings = [networkFinding, ...accessFindings, baywalkFinding];
  const roadsNow = roadSummary(roads);
  const mappedFeet = mappedLinks.reduce((sum, link) => sum + pathLength(link.path), 0);
  const roadScale = Math.max(roadsNow.local.feet, roadsNow.causeway.feet, roadsNow.expressway.feet, roadsNow.ramp.feet, 1);
  const roadBars = [
    { label: "Local streets", feet: roadsNow.local.feet, tone: "local" },
    { label: "Causeways", feet: roadsNow.causeway.feet, tone: "causeway" },
    { label: "Expressways", feet: roadsNow.expressway.feet, tone: "expressway" },
    { label: "Ramps", feet: roadsNow.ramp.feet, tone: "ramp" },
  ];
  const otherApproaches = approaches.filter((approach) => approach.authority !== "county");
  const title = mode === "access" ? "Pedestrian Access · Results" : mode === "baywalk" ? "Baywalk · Results" : "Circulation · Results";
  return (
    <AnalysisColumnFrame title={title} findings={findings} gap={null} inputs={inputs} onRetain={onRetain} onRemove={onRemove} onLive={onLive}>
      <div className="site-walk-results">
        {mode === "network" ? (
          <>
            <p className="site-walk-summary">
              <strong>{roadsNow.count.toLocaleString("en-US")}</strong>
              <span>road centerlines</span>
              <strong>{feet(roadsNow.feet)}</strong>
              <span>stored centerline length</span>
            </p>
            <AnalysisReadout
              titles={["/ Vehicular network", "/ Pedestrian network", "/ Transit"]}
              condition={(
                <ul className="site-walk-bars">
                  {roadBars.map((bar) => (
                    <li key={bar.tone}>
                      <span>{bar.label}</span>
                      <span className="site-walk-track" aria-hidden="true"><i data-tone={bar.tone} style={{ width: `${(bar.feet / roadScale) * 100}%` }} /></span>
                      <span>{feet(bar.feet)}</span>
                    </li>
                  ))}
                </ul>
              )}
              input={(
                <div className="site-walk-pair" data-contrast="sources">
                  <p>
                    <span>County sidewalks</span>
                    <strong>{study.countyCount.toLocaleString("en-US")}</strong>
                    <em>{feet(study.countyFeet)}</em>
                    <small>Existing inventory</small>
                  </p>
                  <p>
                    <span>OSM mapped</span>
                    <strong>{mappedLinks.length.toLocaleString("en-US")}</strong>
                    <em>{feet(mappedFeet)}</em>
                    <small>Mapped, not surveyed</small>
                  </p>
                </div>
              )}
              response={(
                <>
                  <p className="site-walk-hero"><strong>{study.stations.length}</strong><span>stored Metromover station locations</span></p>
                  <p className="site-view-caption">No transit route alignment or bicycle infrastructure stored.</p>
                </>
              )}
            />
            <p className="site-walk-foot">Full source inventories · Network classes, not traffic volumes.</p>
          </>
        ) : mode === "access" ? (
          <AnalysisReadout
            titles={["/ Parcel approaches", "/ Distance probe", "/ Network connectivity"]}
            condition={(
              <>
                <div className="site-walk-pair">
                  <p>
                    <span>{northeast ? sourceName(northeast.name) : "Northeast"}</span>
                    <strong>{northeast ? feet(northeast.gapFeet) : "—"}</strong>
                    <small>Measured separation</small>
                  </p>
                  <p>
                    <span>{city ? sourceName(city.name) : "City side"}</span>
                    <strong>{city ? feet(city.gapFeet) : "—"}</strong>
                    <small>Measured separation</small>
                  </p>
                </div>
                <p className="site-view-caption">Separations to stored sidewalk lines. Not confirmed entrances.</p>
                {otherApproaches.length > 0 ? (
                  <ul className="site-walk-list">
                    {otherApproaches.map((approach) => (
                      <li key={approach.id}>
                        <span>{feet(approach.feet)}</span>
                        <span>{approach.name}</span>
                        <span>{authorityLabel(approach.authority)}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </>
            )}
            input={probe ? (
              <>
                <p className="site-walk-hero"><strong>{feet(probe.feet)}</strong><span>to the nearest stored line</span></p>
                <p className="site-walk-probe"><span>{probe.name}</span><span>{authorityLabel(probe.authority)}</span></p>
              </>
            ) : (
              <p className="site-view-caption">Turn on Distance to mapped line, then choose a point inside the parcel.</p>
            )}
            response={(
              <>
                <div className="site-walk-pair">
                  <p>
                    <span>County components</span>
                    <strong>{study.countyComponents}</strong>
                  </p>
                  <p>
                    <span>Parcel-side</span>
                    <strong>{feet(study.parcelComponentFeet)}</strong>
                    <small>{study.parcelComponentLinks} sidewalks</small>
                  </p>
                </div>
                <p className="site-view-caption">{study.parcelComponentSnap ? "Joins of up to 12 ft are a modeling assumption." : "The parcel-side joins are shared vertices."} Proximity does not confirm pedestrian access.</p>
              </>
            )}
          />
        ) : (
          <AnalysisReadout
            titles={["/ Mapped Baywalk", "/ Spatial separations", "/ Mapping status"]}
            condition={(
              <p className="site-walk-hero"><strong>{feet(study.namedBaywalkFeet)}</strong><span>named mapped segment</span></p>
            )}
            input={(
              <div className="site-walk-pair">
                <p>
                  <span>From parcel</span>
                  <strong>{study.namedBaywalkParcelFeet === null ? "—" : feet(study.namedBaywalkParcelFeet)}</strong>
                  <small>Measured separation</small>
                </p>
                <p>
                  <span>Next mapped line</span>
                  <strong>{study.namedBaywalkGapFeet === null ? "—" : feet(study.namedBaywalkGapFeet)}</strong>
                  <small>Not a confirmed connection</small>
                </p>
              </div>
            )}
            response={(
              <p className="site-view-caption">A continuous Baywalk connection to the parcel is not documented. The I-395 pedestrian bridge has no stored alignment.</p>
            )}
          />
        )}
      </div>
    </AnalysisColumnFrame>
  );
}
