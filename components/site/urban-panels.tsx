"use client";

import { AnalysisAccuracy } from "./analysis-record";
import { CultureIcon, EducationIcon, ExploreSegment, ExploreToggles, HotelIcon, LandIcon, LinkIcon, OtherIcon, ParkIcon, PinIcon, TransitIcon } from "./explore-controls";
import { AnalysisColumnFrame, siteRecord, type SiteFinding, type SiteObservation } from "./site-inputs";
import {
  DEFAULT_GENERATOR_FILTERS,
  DEFAULT_URBAN_GROUPS,
  GENERATOR_FILTERS,
  URBAN_GROUPS,
  URBAN_LIMITS,
  URBAN_MODES,
  URBAN_RETRIEVED,
  groupLabel,
  type ActivityPoint,
  type GeneratorFilter,
  type UrbanGroup,
  type UrbanMode,
  type UrbanStudy,
  type UseArea,
} from "@/lib/skill5/urban";

function countyText(description: string) {
  return description.replace(/\.$/, "");
}

function feet(value: number) {
  if (value < 1) return "meets the parcel";
  if (value < 10) return `${value.toFixed(1)} ft`;
  return `${Math.round(value).toLocaleString("en-US")} ft`;
}

const SWATCH: Record<string, string> = {
  residential: "#c8c8c8",
  commercial: "#848484",
  office: "#e4e4e0",
  cultural: "#686868",
  hospitality: "#a3a3a3",
  public: "#ffffff",
  mixed: "#909090",
  other: "#4e4e4e",
  park: "#ffffff",
  hotel: "#a3a3a3",
  transit: "#d0d0d0",
  education: "#848484",
  leader: "#f4f4f0",
  marker: "#ffffff",
};

export function UrbanConfigure({
  mode,
  groups,
  filters,
  onMode,
  onGroup,
  onFilter,
}: {
  mode: UrbanMode;
  groups: readonly UrbanGroup[];
  filters: readonly GeneratorFilter[];
  onMode: (mode: UrbanMode) => void;
  onGroup: (group: UrbanGroup) => void;
  onFilter: (filter: GeneratorFilter) => void;
}) {
  const modeIcon = {
    "land-use": <LandIcon />,
    generators: <PinIcon />,
    relationships: <LinkIcon />,
  } as const;
  const modeShort = {
    "land-use": "Use",
    generators: "Activity",
    relationships: "Near",
  } as const;
  const filterIcon = {
    park: <ParkIcon />,
    cultural: <CultureIcon />,
    hotel: <HotelIcon />,
    transit: <TransitIcon />,
    education: <EducationIcon />,
    other: <OtherIcon />,
  } as const;
  const groupShort: Record<UrbanGroup, string> = {
    residential: "Residential",
    commercial: "Commercial",
    office: "Office",
    cultural: "Cultural",
    hospitality: "Hospitality",
    public: "Public",
    mixed: "Mixed",
    other: "Other",
  };
  return (
    <>
      <ExploreSegment
        label="Drawing"
        value={mode === "program" ? "land-use" : mode}
        options={URBAN_MODES.filter((item) => item.id !== "program").map((item) => ({
          id: item.id,
          label: modeShort[item.id],
          title: item.label,
          icon: modeIcon[item.id],
        }))}
        onChange={onMode}
      />
      <ExploreToggles
        label="Land use"
        options={URBAN_GROUPS.map((item) => ({
          id: item.id,
          label: groupShort[item.id],
          title: item.label,
          swatch: SWATCH[item.id],
        }))}
        selected={groups}
        onToggle={onGroup}
      />
      <ExploreToggles
        label="Destinations"
        options={GENERATOR_FILTERS.map((item) => ({
          id: item.id,
          label: item.id === "other" ? "Other" : item.label,
          title: item.label,
          icon: filterIcon[item.id],
        }))}
        selected={filters}
        onToggle={onFilter}
      />
    </>
  );
}

function nearestAreas(study: UrbanStudy, groups: readonly UrbanGroup[]) {
  return URBAN_GROUPS
    .filter((group) => groups.includes(group.id))
    .map((group) => study.areas.filter((area) => area.group === group.id).sort((a, b) => a.distanceFeet - b.distanceFeet)[0] ?? null)
    .filter((area): area is UseArea => area !== null);
}

function nearestPoints(study: UrbanStudy, filters: readonly GeneratorFilter[]) {
  return GENERATOR_FILTERS
    .filter((filter) => filters.includes(filter.id))
    .map((filter) => study.points.filter((point) => point.filter === filter.id).sort((a, b) => a.distanceFeet - b.distanceFeet)[0] ?? null)
    .filter((point): point is ActivityPoint => point !== null);
}

function nameNote(area: UseArea) {
  if (area.names.length === 0) return null;
  const shown = area.names.slice(0, 3).join(", ");
  const extra = area.names.length > 3 ? ` and ${area.names.length - 3} more` : "";
  return `Stored footprint names on this polygon: ${shown}${extra}. A name is not a land-use class.`;
}

function shortLabel(value: string) {
  const clean = value.replace(/\.$/, "");
  return clean.length > 52 ? `${clean.slice(0, 49)}…` : clean;
}

function programMeasure(text: string) {
  return text.split(" This could inform")[0];
}

export function UrbanResults({
  mode,
  groups,
  filters,
  study,
  inputs,
  onRetain,
  onLive,
}: {
  mode: UrbanMode;
  groups: readonly UrbanGroup[];
  filters: readonly GeneratorFilter[];
  study: UrbanStudy;
  inputs: readonly SiteObservation[];
  onRetain: (finding: SiteFinding) => void;
  onLive: (findings: readonly SiteFinding[]) => void;
}) {
  const activeGroups = groups.length > 0 ? groups : DEFAULT_URBAN_GROUPS;
  const activeFilters = filters.length > 0 ? filters : DEFAULT_GENERATOR_FILTERS;
  const areas = nearestAreas(study, activeGroups);
  const points = nearestPoints(study, activeFilters);
  const otherCount = study.areas.filter((area) => area.group === "other" || area.group === "mixed").length;
  const legendGroups = URBAN_GROUPS.filter((group) => activeGroups.includes(group.id));
  const centroid = study.parcelUses.find((area) => area.containsCentroid) ?? null;
  const boundary = study.parcelUses.filter((area) => !area.containsCentroid && area.boundaryVertices > 0);
  const nearest = areas.slice().sort((a, b) => a.distanceFeet - b.distanceFeet)[0] ?? null;
  const namedPoints = GENERATOR_FILTERS
    .filter((filter) => activeFilters.includes(filter.id))
    .flatMap((filter) => study.points
      .filter((point) => point.filter === filter.id && point.authority !== "county-land-use")
      .sort((a, b) => a.distanceFeet - b.distanceFeet)
      .slice(0, filter.id === "transit" ? 4 : 3));
  const accuracy = [
    ...URBAN_LIMITS,
    ...study.parcelUses.map((area) => area.containsCentroid
      ? `Centroid code ${area.code}: ${countyText(area.description)}. ${nameNote(area) ?? "No footprint name is used as the use."}`
      : `Code ${area.code} contains ${area.boundaryVertices} parcel-boundary vertices: ${countyText(area.description)}.`),
    ...areas.map((area) => `${groupLabel(area.group)} code ${area.code}, ${feet(area.distanceFeet)}: ${countyText(area.description)}.`),
  ];
  const studyName = "Urban Context + Land Use";
  const landSource = {
    name: "Miami-Dade existing land use",
    retrieved: URBAN_RETRIEVED,
    detail: "Miami-Dade existing land use. A footprint name is not a class.",
  };
  const ringsOf = (area: UseArea) => area.rings.map((ring) => ring.map(([x, z]) => ({ x, z })));
  const neighborFindings = (selected: readonly UseArea[]): SiteFinding[] => selected.map((area) => {
    const relation = study.relations.find((item) => item.label === `${groupLabel(area.group)} · ${area.code}`);
    return siteRecord({
      id: `urban:neighbor:${area.group}:${area.code}`,
      study: studyName,
      kind: "neighbor",
      title: `${groupLabel(area.group)} ${area.code}`,
      quantities: [{ id: "distance", value: area.distanceFeet, unit: "ft" }, { id: "code", value: area.code, unit: "count" }],
      geometry: {
        type: "polygon",
        featureId: area.id,
        rings: ringsOf(area),
        segment: relation ? {
          from: { role: "parcel", x: relation.ax, z: relation.az },
          to: { role: "polygon", x: relation.bx, z: relation.bz },
        } : null,
      },
      settings: [
        { id: "mode", value: "Neighboring county land use" },
        { id: "group", value: area.group },
        { id: "description", value: countyText(area.description) },
      ],
      source: landSource,
      reliability: "County class. The distance is to the parcel boundary.",
      gaps: relation ? [] : ["No measured endpoint is stored for this polygon."],
    });
  });
  const destinationFindings = (): SiteFinding[] => {
    const seen = new Set<string>();
    return [...points, ...namedPoints].filter((point) => {
      if (seen.has(point.id)) return false;
      seen.add(point.id);
      return true;
    }).map((point) => siteRecord({
      id: `urban:destination:${point.id}`,
      study: studyName,
      kind: "destination",
      title: point.name.replace(/\.$/, ""),
      quantities: [{ id: "distance", value: point.distanceFeet, unit: "ft" }],
      geometry: { type: "point", x: point.x, z: point.z },
      settings: [
        { id: "mode", value: GENERATOR_FILTERS.find((item) => item.id === point.filter)?.label ?? point.filter },
        { id: "note", value: point.note },
        { id: "authority", value: point.authority },
        { id: "featureId", value: point.id },
      ],
      source: {
        name: point.authority,
        retrieved: URBAN_RETRIEVED,
        detail: point.county ? `County class at this point: ${point.county}` : `${point.authority}. No county polygon contains this point.`,
      },
      reliability: `${point.status === "verified" ? "Verified" : "Mapped"}, ${point.authority}. This is not a placed program.`,
      gaps: point.county ? [] : ["No county polygon contains this point."],
    }));
  };
  const parcelFindings: SiteFinding[] = [
        ...(centroid ? [siteRecord({
          id: `urban:centroid:${centroid.code}`,
          study: studyName,
          kind: "centroid",
          title: `Centroid ${centroid.code}`,
          quantities: [{ id: "code", value: centroid.code, unit: "count" }],
          geometry: { type: "polygon", featureId: centroid.id, rings: ringsOf(centroid), segment: null },
          settings: [
            { id: "mode", value: "Land use" },
            { id: "description", value: countyText(centroid.description) },
          ],
          source: landSource,
          reliability: "County class at the parcel centroid.",
          gaps: ["The parcel centroid coordinate is not stored on this polygon."],
        })] : []),
        ...boundary.map((area) => siteRecord({
          id: `urban:boundary:${area.code}`,
          study: studyName,
          kind: "boundary",
          title: `Boundary ${area.code}`,
          quantities: [
            { id: "boundaryVertices", value: area.boundaryVertices, unit: "count" },
            { id: "code", value: area.code, unit: "count" },
          ],
          geometry: { type: "polygon", featureId: area.id, rings: ringsOf(area), segment: null },
          settings: [
            { id: "mode", value: "Land use" },
            { id: "description", value: countyText(area.description) },
          ],
          source: landSource,
          reliability: "County class. The vertex count is not a distance.",
          gaps: ["No separate distance point is stored for this boundary contact."],
        })),
        ...neighborFindings(areas),
  ];
  const findings = [...parcelFindings, ...destinationFindings()];
  const farthest = Math.max(1, ...areas.map((area) => area.distanceFeet), ...points.map((point) => point.distanceFeet));
  const gap = "Program notes repeat these distances. They are not a separate location.";
  return (
    <AnalysisColumnFrame findings={findings} gap={gap} inputs={inputs} onRetain={onRetain} onLive={onLive}>
      <section className="site-block">
        <div className="site-sun-figures">
          <div>
            <span>Centroid</span>
            <strong>{centroid?.code ?? "—"}</strong>
            <em>{countyText(centroid?.description ?? "No containing polygon")}</em>
          </div>
          <div>
            <span>Boundary</span>
            <strong>{boundary.length > 0 ? boundary.map((area) => area.code).join(" · ") : "—"}</strong>
            <em>{boundary.length > 0 ? `${boundary.reduce((sum, area) => sum + area.boundaryVertices, 0)} vertices` : "No other contact"}</em>
          </div>
          <div>
            <span>Nearest use</span>
            <strong>{nearest ? feet(nearest.distanceFeet) : "—"}</strong>
            <em>{nearest ? `${groupLabel(nearest.group)} ${nearest.code}` : "No group selected"}</em>
          </div>
        </div>
        <div className="site-meter-list" aria-label="Neighboring land use">
          {areas.map((area) => (
            <div key={area.id}>
              <span>{groupLabel(area.group)}</span>
              <span className="site-evaluate-track"><i style={{ width: `${Math.max(6, (area.distanceFeet / farthest) * 100)}%`, background: SWATCH[area.group] }} /></span>
              <em>{feet(area.distanceFeet)}</em>
            </div>
          ))}
        </div>
        <div className="site-meter-list" aria-label="Destinations">
          {points.map((point) => (
            <div key={point.id}>
              <span>{GENERATOR_FILTERS.find((filter) => filter.id === point.filter)?.label ?? point.filter}</span>
              <span className="site-evaluate-track"><i style={{ width: `${Math.max(6, (point.distanceFeet / farthest) * 100)}%` }} /></span>
              <em>{feet(point.distanceFeet)}</em>
            </div>
          ))}
        </div>
        <p className="site-note">{otherCount} mixed or other county codes stay outside the selected groups.</p>
        <details className="site-sun-accuracy">
          <summary>Program notes</summary>
          {study.programs.map((item) => (
            <p key={item.program} className="site-note"><strong>{item.program}.</strong> {programMeasure(item.text)}</p>
          ))}
        </details>
        <AnalysisAccuracy limits={accuracy} />
      </section>
      <section className="site-block">
        <h2 className="site-subtitle">Legend</h2>
        <ul className="site-analysis-legend">
          {legendGroups.map((item) => (
            <li key={item.id} data-rank={item.id === "public" ? "primary" : item.id === "other" ? "mapped" : "support"}><i style={{ background: SWATCH[item.id] ?? "#f2f2ee" }} /><span>{item.label}</span></li>
          ))}
          <li data-rank="marker"><i /><span>{mode === "relationships" ? "Measured gap on the model" : mode === "generators" ? "Documented point on the model" : "Selected land use on the model"}</span></li>
        </ul>
      </section>
    </AnalysisColumnFrame>
  );
}
