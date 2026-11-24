/**
 * Read-only view of a Milestone 2 reading for the lab.
 * It does not generate architecture and does not change the analysis.
 */
import { encodeMesh } from "./mesh-codec";
import { loadControlBuilding, loadProximityBuilding } from "./fixtures";
import { readAssembly, type AssemblyReading, type Opportunity } from "./opportunities";
import type { OccupancyHandoff } from "./building";
import { loadSelectedAssemblyBuilding } from "./selected-assembly";
import type { GeometryStatus } from "@/lib/skill5/downstream-pipeline";
import { resolveDownstreamPipeline } from "@/lib/skill5/downstream-pipeline";
import type { SurfaceRegion } from "./regions";
import type { EncodedMesh } from "./types";

export type ReadingTone = "measured" | "opportunity" | "unsupported";

export type ReadingMark = {
  clusterId: string;
  triangleIds: number[];
};

export type ReadingCard = {
  id: string;
  group: "geometry" | "opportunity" | "limit";
  label: string;
  tone: ReadingTone;
  clusterIds: string[];
  evidence: string[];
  interpretation: string;
  limits: string[];
  marks: ReadingMark[];
};

export type ReadingFixtureView = {
  id: "control" | "proximity" | "selected";
  label: string;
  note: string;
  placements: { clusterId: string; translation: [number, number, number] }[];
  summary: {
    clusters: number;
    caps: number;
    shelters: number;
    connectivity: string;
    unsupported: string;
  };
  cards: ReadingCard[];
};

export type ReadingClusterView = {
  id: string;
  label: string;
  meshFile: string;
  tiles: string[];
  mesh: EncodedMesh;
  occupancy?: OccupancyHandoff;
};

export type ReadingSourceView = {
  assemblyId: string | null;
  assemblyRevision: string | null;
  networkId: string | null;
  occupancyCount: number;
  occupancy: OccupancyHandoff[];
  geometryStatus: GeometryStatus;
  sourceReady: boolean;
};

export type ReadingLabView = {
  contract: "architectural-interpretation-lab-v1";
  generatesGeometry: false;
  mode: "production" | "legacy-fixture";
  source: ReadingSourceView;
  clusters: ReadingClusterView[];
  fixtures: {
    selected?: ReadingFixtureView;
    control?: ReadingFixtureView;
    proximity?: ReadingFixtureView;
  };
};

function shortLabel(id: string, reading?: AssemblyReading): string {
  if (id === "assembled-flat-self") return "Flat Self";
  if (id === "assembled-flat-plate") return "Flat Plate";
  if (id === "assembled-rule-small-02") return "Rule 02";
  const source = reading?.analysis.sources.find((item) => item.id === id);
  const name = source?.tiles[0]?.name;
  if (name) return name;
  return id.replace(/^occ-/, "") || id;
}

function num(item: Opportunity, key: string): number | null {
  const value = item.measurements[key];
  return typeof value === "number" ? value : null;
}

function marksFor(regions: readonly SurfaceRegion[], ids: readonly string[]): ReadingMark[] {
  const grouped = new Map<string, number[]>();
  for (const id of ids) {
    const region = regions.find((item) => item.id === id);
    if (!region || region.triangleIds.length === 0) continue;
    const list = grouped.get(region.clusterId) ?? [];
    list.push(...region.triangleIds);
    grouped.set(region.clusterId, list);
  }
  return [...grouped.entries()].map(([clusterId, triangleIds]) => ({ clusterId, triangleIds }));
}

function card(partial: Omit<ReadingCard, "marks"> & { marks?: ReadingMark[] }): ReadingCard {
  return { ...partial, marks: partial.marks ?? [] };
}

function measuredCards(reading: AssemblyReading): ReadingCard[] {
  const sources = reading.analysis.sources;
  const up = reading.regions.filter((region) => region.facing === "up" && region.area >= 12);
  return [
    card({
      id: "geometry",
      group: "geometry",
      label: "Geometry",
      tone: "measured",
      clusterIds: sources.map((source) => source.id),
      evidence: sources.map((source) => {
        const span = source.worldBounds.max.map((value, axis) => value - source.worldBounds.min[axis]);
        return `${shortLabel(source.id, reading)} · ${span.map((value) => value.toFixed(1)).join(" × ")} ft · ground Z ${source.worldBounds.min[2].toFixed(2)}`;
      }),
      interpretation: reading.analysis.role === "upstream"
        ? "Selected Assembly occupancies in the Interpretation analysis frame. X and Y are horizontal, Z is up, and one unit is one foot. Site yaw is baked into each occupancy mesh. Clusters are not merged."
        : "Three stored Skill 6 meshes in one analysis frame. X and Y are horizontal, Z is up, and one unit is one foot. The placement is a temporary fixture.",
      limits: reading.analysis.role === "upstream"
        ? ["The source is the Selected Assembly for Development. Cluster meshes are not merged and stored Skill 4 files are not rewritten. This reading is not a Current Integrated Architectural Model."]
        : ["The assembly is not the site building. Cluster meshes are not merged and are not rescaled."],
    }),
    card({
      id: "surfaces",
      group: "geometry",
      label: "Surfaces",
      tone: "measured",
      clusterIds: sources.map((source) => source.id),
      evidence: sources.map((source) => {
        const slope = reading.analysis.findings.find((item) => item.id === `${source.id}:slope`);
        const upArea = slope?.values.upArea;
        const oblique = slope?.values.obliqueArea;
        return `${shortLabel(source.id, reading)} · upward ${upArea ?? "—"} sq ft · oblique ${oblique ?? "—"} sq ft`;
      }),
      interpretation: "Connected upward patches are edge-linked and stay inside one facing class. An upward normal is a measurement, not a floor.",
      limits: ["Patches that only share a height are kept apart. Small fragments stay out of this list."],
      marks: marksFor(up, up.map((region) => region.id)),
    }),
    card({
      id: "void",
      group: "geometry",
      label: "Void & Clearance",
      tone: "measured",
      clusterIds: sources.map((source) => source.id),
      evidence: [
        ...sources.map((source) => {
          const overhang = reading.analysis.findings.find((item) => item.id === `${source.id}:void`);
          return `${shortLabel(source.id, reading)} · cover ${overhang?.values.overhangMedianFeet ?? "—"} ft · enclosed cells ${overhang?.values.enclosedCells ?? "—"}`;
        }),
        ...reading.analysis.findings.filter((item) => item.topic === "clearance" && item.support === "measured").map((item) => {
          const names = item.clusterIds.map((id) => shortLabel(id, reading)).join(" → ");
          return item.values.openInterval === 1
            ? `${names} · open ${item.values.lowerFeet}–${item.values.upperFeet ?? "—"} ft`
            : `${names} · interval occupied`;
        }),
      ],
      interpretation: "Cover is open air under a surface. An occupied interval is not a passage. Empty bounding-box space is not a room.",
      limits: ["Probe cells are not a surface, so this finding is not painted on the mesh."],
    }),
  ];
}

function opportunityCards(reading: AssemblyReading): ReadingCard[] {
  const cards: ReadingCard[] = [];
  for (const item of reading.opportunities) {
    if (item.type === "preserve" && item.status === "candidate" && item.featureId.endsWith(":morphology")) {
      const name = shortLabel(item.clusterIds[0] ?? "", reading);
      cards.push(card({
        id: item.id,
        group: "opportunity",
        label: `Preserve · ${name}`,
        tone: "opportunity",
        clusterIds: item.clusterIds,
        evidence: [
          `Oblique area ${item.measurements.obliqueArea ?? "—"} sq ft`,
          `Upward area ${item.measurements.upArea ?? "—"} sq ft`,
          `Height ${item.measurements.heightFeet ?? "—"} ft`,
        ],
        interpretation: item.effect,
        limits: item.limitations,
      }));
    }
    if (item.type === "partial-platform" && item.status === "candidate") {
      const name = shortLabel(item.clusterIds[0] ?? "", reading);
      cards.push(card({
        id: item.id,
        group: "opportunity",
        label: `Cap · ${name} · ${Math.round(num(item, "area") ?? 0)} sq ft`,
        tone: "opportunity",
        clusterIds: item.clusterIds,
        evidence: [
          `${num(item, "area") ?? "—"} sq ft`,
          `Slope ${num(item, "slopeDeg") ?? "—"}°`,
          `Z ${num(item, "minZ") ?? "—"}–${num(item, "maxZ") ?? "—"} ft`,
        ],
        interpretation: `${item.effect} This is a reading, not a validated floor.`,
        limits: [...item.limitations, ...item.unsuitableBecause],
        marks: marksFor(reading.regions, item.regionIds),
      }));
    }
    if (item.type === "sheltered-overhang" && item.status === "candidate") {
      cards.push(card({
        id: item.id,
        group: "opportunity",
        label: `Shelter · ${shortLabel(item.clusterIds[0] ?? "", reading)}`,
        tone: "opportunity",
        clusterIds: item.clusterIds,
        evidence: [
          `Median cover ${num(item, "coverMedianFeet") ?? "—"} ft`,
          `Minimum kept ${num(item, "coverMinFeet") ?? "—"} ft`,
          `Solid thickness ${num(item, "thicknessMedianFeet") ?? "—"} ft`,
        ],
        interpretation: item.effect,
        limits: [...item.limitations, ...item.unsuitableBecause],
      }));
    }
    if (item.type === "lateral-connection" && item.status === "candidate") {
      cards.push(card({
        id: item.id,
        group: "opportunity",
        label: `Open gap · ${item.clusterIds.map((id) => shortLabel(id, reading)).join(" / ")}`,
        tone: "opportunity",
        clusterIds: item.clusterIds,
        evidence: [
          `Bounds gap ${num(item, "lowerFeet") ?? "—"} ft`,
          `Vertex interval to ${num(item, "upperFeet") ?? "—"} ft`,
        ],
        interpretation: `${item.effect} Nothing joins the clusters.`,
        limits: [...item.limitations, "The gap is not drawn as a bridge."],
      }));
    }
  }
  const order = ["Preserve", "Cap", "Shelter", "Open gap"];
  return cards.sort((left, right) => order.findIndex((item) => left.label.startsWith(item)) - order.findIndex((item) => right.label.startsWith(item)));
}

function evidenceLines(item: Opportunity): string[] {
  const lines: string[] = [];
  const add = (label: string, key: string, unit: string) => {
    const value = num(item, key);
    if (value != null) lines.push(`${label} ${value} ${unit}`.trim());
  };
  add("Rise", "riseFeet", "ft");
  add("Plan overlap", "planOverlap", "sq ft");
  add("Area", "area", "sq ft");
  add("Slope", "slopeDeg", "°");
  add("Cover", "coverMedianFeet", "ft");
  add("Height", "clusterHeightFeet", "ft");
  add("Gap", "lowerFeet", "ft");
  return lines.length > 0 ? lines : ["The rejection stands on the missing condition, not on a new measurement."];
}

function limitCards(reading: AssemblyReading): ReadingCard[] {
  const cards: ReadingCard[] = [];
  const rejected = reading.opportunities.filter((item) => item.status === "rejected");
  const labelOf = (item: Opportunity) => {
    if (item.type === "stepped-landscape") return "Terrace rejected";
    if (item.type === "mezzanine") return "Mezzanine rejected";
    if (item.type === "lateral-connection" && item.id.endsWith(":corridor")) return "Corridor rejected";
    if (item.type === "lateral-connection") return "Link rejected";
    if (item.type === "multi-height-volume") return "Hall rejected";
    if (item.type === "vertical-connection") return "Vertical link rejected";
    if (item.type === "partial-platform" && item.id.includes("infill")) return "Infill rejected";
    if (item.type === "partial-platform") return "Cap rejected";
    return "Rejected";
  };
  const seenMezzanine = new Set<string>();
  for (const item of rejected) {
    if (item.type === "preserve") continue;
    if (item.type === "mezzanine") {
      const key = item.clusterIds.join();
      if (seenMezzanine.has(key)) continue;
      seenMezzanine.add(key);
    }
    const name = item.clusterIds.map((id) => shortLabel(id, reading)).join(" / ");
    const area = item.type === "partial-platform" && !item.id.includes("infill") ? num(item, "area") : null;
    cards.push(card({
      id: item.id,
      group: "limit",
      label: `${labelOf(item)} · ${name}${area != null ? ` · ${Math.round(area)} sq ft` : ""}`,
      tone: "unsupported",
      clusterIds: item.clusterIds,
      evidence: evidenceLines(item),
      interpretation: item.unsuitableBecause[0] ?? item.effect,
      limits: item.limitations,
      marks: item.type === "partial-platform" || item.type === "stepped-landscape" ? marksFor(reading.regions, item.regionIds) : [],
    }));
  }
  return cards;
}

function fixtureView(id: "control" | "proximity" | "selected", reading: AssemblyReading): ReadingFixtureView {
  const cards = [...measuredCards(reading), ...opportunityCards(reading), ...limitCards(reading)];
  const caps = cards.filter((item) => item.label.startsWith("Cap ·") && item.tone === "opportunity").length;
  const shelters = cards.filter((item) => item.label.startsWith("Shelter")).length;
  const openGaps = cards.filter((item) => item.label.startsWith("Open gap")).length;
  const unsupported = [...new Set(cards.filter((item) => item.tone === "unsupported").map((item) => item.label.split(" · ")[0]))];
  return {
    id,
    label: id === "control" ? "Control" : id === "proximity" ? "Proximity" : "Selected Assembly",
    note: id === "control"
      ? "Clusters stay 20 feet apart. That gap is the module registration, not a site measurement."
      : id === "proximity"
        ? "Clusters are separated by the smaller measured thickness of each pair. The gap is not a joint."
        : "Occupancies from the Selected Assembly for Development. Site poses and yaw are baked. No new solids.",
    placements: reading.analysis.placements.map((placement) => ({
      clusterId: placement.clusterId,
      translation: placement.translation,
    })),
    summary: {
      clusters: reading.analysis.sources.length,
      caps,
      shelters,
      connectivity: openGaps > 0 ? "Open gaps only" : "No open link",
      unsupported: unsupported.join(" · ") || "None",
    },
    cards,
  };
}

function emptySource(geometryStatus: GeometryStatus = "no-source"): ReadingSourceView {
  return {
    assemblyId: null,
    assemblyRevision: null,
    networkId: null,
    occupancyCount: 0,
    occupancy: [],
    geometryStatus,
    sourceReady: false,
  };
}

/** Both temporary Skill 6 fixtures. Not the production source. */
export function buildReadingLabView(): ReadingLabView {
  const controlRequest = loadControlBuilding();
  const proximityRequest = loadProximityBuilding();
  const control = readAssembly(controlRequest);
  const proximity = readAssembly(proximityRequest);
  const clusters = control.analysis.sources.map((source) => {
    const cluster = controlRequest.clusters.find((item) => item.id === source.id);
    if (!cluster) throw new Error(`Missing mesh for ${source.id}.`);
    return {
      id: source.id,
      label: shortLabel(source.id, control),
      meshFile: source.meshFile,
      tiles: source.tiles.map((tile) => tile.name),
      mesh: encodeMesh(cluster.positions, cluster.indices),
    };
  });
  return {
    contract: "architectural-interpretation-lab-v1",
    generatesGeometry: false,
    mode: "legacy-fixture",
    source: emptySource("no-source"),
    clusters,
    fixtures: {
      control: fixtureView("control", control),
      proximity: fixtureView("proximity", proximity),
    },
  };
}

/** Production reading. Null selected assembly returns no-source and does not load Skill 6 fixtures. */
export function buildProductionReadingView(): ReadingLabView {
  const interpretation = resolveDownstreamPipeline().interpretation;
  const source: ReadingSourceView = {
    assemblyId: interpretation.sourceAssemblyId,
    assemblyRevision: interpretation.sourceAssemblyRevision,
    networkId: interpretation.sourceNetworkId,
    occupancyCount: interpretation.occupancyCount,
    occupancy: [],
    geometryStatus: interpretation.geometryStatus,
    sourceReady: interpretation.sourceReady,
  };
  const request = loadSelectedAssemblyBuilding();
  if (!request) {
    return {
      contract: "architectural-interpretation-lab-v1",
      generatesGeometry: false,
      mode: "production",
      source,
      clusters: [],
      fixtures: {},
    };
  }
  const reading = readAssembly(request);
  source.occupancy = request.origin?.occupancy ?? [];
  const clusters = request.clusters.map((cluster) => ({
    id: cluster.id,
    label: shortLabel(cluster.id, reading),
    meshFile: cluster.meshFile,
    tiles: cluster.tiles.map((tile) => tile.name),
    mesh: encodeMesh(cluster.positions, cluster.indices),
    occupancy: cluster.occupancy,
  }));
  return {
    contract: "architectural-interpretation-lab-v1",
    generatesGeometry: false,
    mode: "production",
    source,
    clusters,
    fixtures: {
      selected: fixtureView("selected", reading),
    },
  };
}
