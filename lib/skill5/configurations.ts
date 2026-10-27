import type { SiteAnnotation } from "./annotations";
import { CONNECTOR_UNAVAILABLE, type AssemblyBaseline, type AssemblyMember, type RerunDecision, type SiteAssembly } from "./assembly";
import { SKILL5_SITE_ID, type Skill5Program, type Skill5ProgramSource } from "./contract";
import { boundsOfCorners, nominalEnvelopeSqFt, nominalUnionSqFt, placedCorners, programDistribution, scenePlaced } from "./metrics";
import { measureSite, type MeasureSet } from "./relations";
import type { SiteContext } from "./site-model";
import type { PlacedModule } from "./placement";
import type { XZ } from "./site-model";

export const CONFIGURATION_CONTRACT = "skill5-configurations-v2" as const;
const PRIOR_CONTRACT = "skill5-configurations-v1";

export type PrioritySense = "minimize" | "maximize" | "target";

export const COMPARISON_METRICS = [
  { id: "modules", label: "Modules", unit: "modules" },
  { id: "assemblies", label: "Assemblies", unit: "assemblies" },
  { id: "workspace", label: "Workspace", unit: "modules" },
  { id: "lobby", label: "Lobby", unit: "modules" },
  { id: "gathering", label: "Gathering", unit: "modules" },
  { id: "unassigned", label: "Unassigned", unit: "modules" },
  { id: "occupied", label: "Occupied", unit: "sq ft" },
  { id: "parcel", label: "Of parcel", unit: "%" },
  { id: "envelope", label: "Envelope sum", unit: "sq ft" },
  { id: "connectorsAvailable", label: "Connectors available", unit: "connectors" },
  { id: "connectorsUnresolved", label: "Connectors unresolved", unit: "connectors" },
  { id: "meanEast", label: "Mean center east", unit: "ft" },
  { id: "meanNorth", label: "Mean center north", unit: "ft" },
  { id: "bay", label: "Bay", unit: "ft" },
  { id: "macarthur", label: "MacArthur", unit: "ft" },
  { id: "highway", label: "Highways", unit: "ft" },
  { id: "streets", label: "Streets", unit: "ft" },
  { id: "entrances", label: "Entrances", unit: "ft" },
] as const;

export type ComparisonMetricId = (typeof COMPARISON_METRICS)[number]["id"];

export type ComparisonPriority = {
  id: string;
  label: string;
  metric: ComparisonMetricId | null;
  weight: number;
  sense: PrioritySense;
  target: number | null;
};

export function normalizedWeights(priorities: readonly ComparisonPriority[]) {
  const active = priorities.reduce((sum, item) => sum + (item.weight > 0 ? item.weight : 0), 0);
  return priorities.map((item) => ({
    ...item,
    share: item.weight > 0 && active > 0 ? item.weight / active : 0,
  }));
}

export type SiteConfiguration = {
  id: string;
  name: string;
  parentConfigurationId: string | null;
  createdAt: string;
  updatedAt: string;
  modules: PlacedModule[];
  assemblies: SiteAssembly[];
  annotations: SiteAnnotation[];
};

export type ConfigurationDocument = {
  contract: typeof CONFIGURATION_CONTRACT;
  siteId: typeof SKILL5_SITE_ID;
  configurations: SiteConfiguration[];
  priorities: ComparisonPriority[];
};

export function emptyConfigurationDocument(): ConfigurationDocument {
  return { contract: CONFIGURATION_CONTRACT, siteId: SKILL5_SITE_ID, configurations: [], priorities: [] };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

function isProgram(value: unknown): value is Skill5Program {
  return value === "workspace" || value === "lobby" || value === "gathering" || value === "unassigned";
}

function memberStatus(value: unknown): AssemblyMember["status"] {
  return value === "Validated" || value === "Review" || value === "Unavailable" ? value : "Unavailable";
}

function memberMirror(value: unknown): AssemblyMember["mirror"] {
  return value === "x" || value === "y" || value === "z" ? value : null;
}

function geometryOf(value: unknown, addressable: boolean): "available" | "pending" | "unavailable" | "invalid" {
  if (value === "available" || value === "pending" || value === "unavailable" || value === "invalid") return value;
  return addressable ? "pending" : "unavailable";
}

function prioritySense(value: unknown): PrioritySense {
  return value === "minimize" || value === "maximize" || value === "target" ? value : "maximize";
}

function priorityMetric(value: unknown): ComparisonMetricId | null {
  return COMPARISON_METRICS.some((metric) => metric.id === value) ? value as ComparisonMetricId : null;
}

function priorityTarget(value: unknown): number | null {
  if (typeof value !== "number" && typeof value !== "string") return null;
  if (value === "") return null;
  const target = typeof value === "number" ? value : Number(value);
  return Number.isFinite(target) ? target : null;
}

function isSource(value: unknown): value is Skill5ProgramSource {
  return value === "suggested" || value === "assigned";
}

function normalizeModule(value: unknown): PlacedModule | null {
  if (!isRecord(value) || typeof value.instanceId !== "string" || !isRecord(value.provenance) || !isRecord(value.transform)) return null;
  const provenance = value.provenance;
  const transform = value.transform;
  const position = isRecord(transform.position) ? transform.position : null;
  if (typeof provenance.moduleId !== "string" || typeof provenance.archetypeId !== "string" || !position) return null;
  const addressable = typeof provenance.candidateId === "number" && typeof provenance.continuationId === "string";
  return {
    instanceId: value.instanceId,
    kind: "archetype",
    name: typeof value.name === "string" ? value.name : provenance.archetypeId,
    status: value.status === "Validated" || value.status === "Review" || value.status === "Unavailable" ? value.status : "Unavailable",
    geometryState: geometryOf(value.geometryState, addressable),
    program: isProgram(value.program) ? value.program : "unassigned",
    programSource: isSource(value.programSource) ? value.programSource : "suggested",
    provenance: {
      moduleId: provenance.moduleId,
      archetypeId: provenance.archetypeId,
      source: provenance.source === "skill4" ? "skill4" : "skill3",
      candidateId: typeof provenance.candidateId === "number" ? provenance.candidateId : null,
      continuationId: typeof provenance.continuationId === "string" ? provenance.continuationId : null,
    },
    transform: {
      position: {
        x: Number(position.x) || 0,
        y: Number(position.y) || 0,
        z: Number(position.z) || 0,
      },
      rotationY: Number(transform.rotationY) || 0,
    },
    assemblyPlacementId: typeof value.assemblyPlacementId === "string" ? value.assemblyPlacementId : undefined,
    mirror: value.mirror === "x" || value.mirror === "y" || value.mirror === "z" ? value.mirror : null,
  };
}

function normalizeAssembly(value: unknown): SiteAssembly | null {
  if (!isRecord(value) || typeof value.placementId !== "string" || !Array.isArray(value.members) || !isRecord(value.transform)) return null;
  const position = isRecord(value.transform.position) ? value.transform.position : null;
  if (!position) return null;
  const members = value.members.flatMap((member) => {
    if (!isRecord(member) || typeof member.instanceId !== "string" || !isRecord(member.local) || !isRecord(member.provenance)) return [];
    const provenance = member.provenance;
    if (typeof provenance.moduleId !== "string" || typeof provenance.archetypeId !== "string") return [];
    const addressable = typeof provenance.candidateId === "number" && typeof provenance.continuationId === "string";
    return [{
      instanceId: member.instanceId,
      tileId: typeof member.tileId === "string" ? member.tileId : member.instanceId,
      name: typeof member.name === "string" ? member.name : provenance.archetypeId,
      status: memberStatus(member.status),
      geometryState: geometryOf(member.geometryState, addressable),
      program: isProgram(member.program) ? member.program : "unassigned" as const,
      programSource: isSource(member.programSource) ? member.programSource : "suggested" as const,
      provenance: {
        moduleId: provenance.moduleId,
        archetypeId: provenance.archetypeId,
        source: provenance.source === "skill3" ? "skill3" as const : "skill4" as const,
        candidateId: typeof provenance.candidateId === "number" ? provenance.candidateId : null,
        continuationId: typeof provenance.continuationId === "string" ? provenance.continuationId : null,
      },
      catalogModuleId: typeof member.catalogModuleId === "string" ? member.catalogModuleId : provenance.moduleId,
      meshModuleId: addressable ? provenance.moduleId : null,
      local: {
        x: Number(member.local.x) || 0,
        y: Number(member.local.y) || 0,
        z: Number(member.local.z) || 0,
        rotationY: Number(member.local.rotationY) || 0,
      },
      mirror: memberMirror(member.mirror),
    }];
  });
  const connectors = Array.isArray(value.connectors) ? value.connectors.flatMap((connector) => {
    if (!isRecord(connector) || typeof connector.id !== "string") return [];
    return [{
      id: connector.id,
      tileAId: typeof connector.tileAId === "string" ? connector.tileAId : "",
      tileBId: typeof connector.tileBId === "string" ? connector.tileBId : "",
      faceA: typeof connector.faceA === "string" ? connector.faceA : "",
      faceB: typeof connector.faceB === "string" ? connector.faceB : "",
      geometryState: "unavailable" as const,
      status: "unavailable" as const,
      invalidated: connector.invalidated === true,
      reason: typeof connector.reason === "string" ? connector.reason : CONNECTOR_UNAVAILABLE,
    }];
  }) : [];
  const baseline = normalizeBaseline(value.baseline, value.assemblyId, value.arrangement, value.regenerationRequired === true, members);
  return {
    placementId: value.placementId,
    assemblyId: typeof value.assemblyId === "string" ? value.assemblyId : value.placementId,
    parentAssemblyId: typeof value.parentAssemblyId === "string" ? value.parentAssemblyId : null,
    name: typeof value.name === "string" ? value.name : value.placementId,
    arrangement: typeof value.arrangement === "string" ? value.arrangement : "",
    tileCount: typeof value.tileCount === "number" ? value.tileCount : members.length,
    regenerationRequired: value.regenerationRequired === true,
    possibleRerunNeeded: value.possibleRerunNeeded === true,
    rerunDecision: rerunDecisionOf(value.rerunDecision),
    rerunAssemblyId: typeof value.rerunAssemblyId === "string" ? value.rerunAssemblyId : null,
    testData: value.testData === true,
    transform: {
      position: { x: Number(position.x) || 0, y: Number(position.y) || 0, z: Number(position.z) || 0 },
      rotationY: Number(value.transform.rotationY) || 0,
    },
    baseline,
    members,
    connectors,
  };
}

function rerunDecisionOf(value: unknown): RerunDecision | null {
  return value === "pending" || value === "keep" || value === "sent" ? value : null;
}

function normalizeBaseline(value: unknown, assemblyId: unknown, arrangement: unknown, regenerationRequired: boolean, members: AssemblyMember[]): AssemblyBaseline {
  const fallback = {
    assemblyId: typeof assemblyId === "string" ? assemblyId : "",
    arrangement: typeof arrangement === "string" ? arrangement : "",
    regenerationRequired,
    members: members.map((member) => ({ tileId: member.tileId, local: { ...member.local } })),
  };
  if (!isRecord(value) || !Array.isArray(value.members)) return fallback;
  const sourceMembers = value.members.flatMap((member) => {
    if (!isRecord(member) || typeof member.tileId !== "string" || !isRecord(member.local)) return [];
    return [{
      tileId: member.tileId,
      local: {
        x: Number(member.local.x) || 0,
        y: Number(member.local.y) || 0,
        z: Number(member.local.z) || 0,
        rotationY: Number(member.local.rotationY) || 0,
      },
    }];
  });
  if (sourceMembers.length === 0) return fallback;
  return {
    assemblyId: typeof value.assemblyId === "string" ? value.assemblyId : fallback.assemblyId,
    arrangement: typeof value.arrangement === "string" ? value.arrangement : fallback.arrangement,
    regenerationRequired: value.regenerationRequired === true,
    members: sourceMembers,
  };
}

function normalizeAnnotation(value: unknown): SiteAnnotation | null {
  if (!isRecord(value) || typeof value.id !== "string" || !isRecord(value.position)) return null;
  const kind = value.kind === "circulation" ? "circulation" : value.kind === "entrance" ? "entrance" : null;
  if (!kind) return null;
  const end = isRecord(value.end) ? { x: Number(value.end.x) || 0, z: Number(value.end.z) || 0 } : null;
  return {
    id: value.id,
    kind,
    attachment: value.attachment === "assembly" ? "assembly" : "site",
    assemblyPlacementId: typeof value.assemblyPlacementId === "string" ? value.assemblyPlacementId : null,
    label: typeof value.label === "string" ? value.label : kind === "entrance" ? "Entrance" : "Circulation",
    position: { x: Number(value.position.x) || 0, z: Number(value.position.z) || 0 },
    end: kind === "circulation" ? end : null,
  };
}

export function parseConfigurationDocument(value: unknown): ConfigurationDocument {
  if (!isRecord(value) || (value.contract !== CONFIGURATION_CONTRACT && value.contract !== PRIOR_CONTRACT) || !Array.isArray(value.configurations)) {
    return emptyConfigurationDocument();
  }
  const configurations = value.configurations.flatMap((entry) => {
    if (!isRecord(entry) || typeof entry.id !== "string" || typeof entry.name !== "string") return [];
    if (!Array.isArray(entry.modules) || !Array.isArray(entry.assemblies)) return [];
    return [{
      id: entry.id,
      name: entry.name,
      parentConfigurationId: typeof entry.parentConfigurationId === "string" ? entry.parentConfigurationId : null,
      createdAt: typeof entry.createdAt === "string" ? entry.createdAt : new Date(0).toISOString(),
      updatedAt: typeof entry.updatedAt === "string" ? entry.updatedAt : new Date(0).toISOString(),
      modules: entry.modules.flatMap((item) => {
        const placed = normalizeModule(item);
        return placed ? [placed] : [];
      }),
      assemblies: entry.assemblies.flatMap((item) => {
        const assembly = normalizeAssembly(item);
        return assembly ? [assembly] : [];
      }),
      annotations: Array.isArray(entry.annotations) ? entry.annotations.flatMap((item) => {
        const note = normalizeAnnotation(item);
        return note ? [note] : [];
      }) : [],
    }];
  });
  const priorities = Array.isArray(value.priorities) ? value.priorities.flatMap((item) => {
    if (!isRecord(item) || typeof item.id !== "string" || typeof item.label !== "string") return [];
    const weight = Number(item.weight);
    return [{
      id: item.id,
      label: item.label,
      metric: priorityMetric(item.metric),
      weight: Number.isFinite(weight) ? weight : 1,
      sense: prioritySense(item.sense),
      target: priorityTarget(item.target),
    }];
  }) : [];
  return { contract: CONFIGURATION_CONTRACT, siteId: SKILL5_SITE_ID, configurations, priorities };
}

export function nextConfigurationId(configurations: readonly SiteConfiguration[]) {
  let max = 0;
  for (const entry of configurations) {
    const match = /^C(\d+)$/.exec(entry.id);
    if (match) max = Math.max(max, Number(match[1]));
  }
  return `C${String(max + 1).padStart(2, "0")}`;
}

export function configurationStats(entry: SiteConfiguration, ring: readonly XZ[], ringAreaSqFt: number) {
  const placed = scenePlaced(entry.modules, entry.assemblies);
  const corners = placed.flatMap((item) => placedCorners(item));
  const bounds = boundsOfCorners(corners);
  const occupied = nominalUnionSqFt(placed, ring);
  const connectors = entry.assemblies.reduce((sum, assembly) => sum + assembly.connectors.length, 0);
  const unresolved = entry.assemblies.reduce((sum, assembly) => sum + assembly.connectors.filter((connector) => connector.geometryState !== "available").length, 0);
  return {
    modules: placed.length,
    assemblies: entry.assemblies.length,
    connectors,
    unresolved,
    width: bounds.width,
    depth: bounds.depth,
    area: occupied,
    envelope: nominalEnvelopeSqFt(placed.length),
    percent: ringAreaSqFt > 0 ? occupied / ringAreaSqFt * 100 : 0,
  };
}

export type ComparisonRow = {
  id: string;
  name: string;
  modules: number;
  assemblies: number;
  connectorsAvailable: number;
  connectorsUnresolved: number;
  program: Record<Skill5Program, number>;
  nominalEnvelopeSqFt: number;
  occupiedSqFt: number;
  occupiedPercent: number;
  meanEast: number | null;
  meanNorth: number | null;
  bay: MeasureSet;
  macarthur: MeasureSet;
  highway: MeasureSet;
  urban: MeasureSet;
  entranceAccess: MeasureSet;
};

export function comparisonRow(entry: SiteConfiguration, ring: readonly XZ[], ringAreaSqFt: number, context: SiteContext): ComparisonRow {
  const placed = scenePlaced(entry.modules, entry.assemblies);
  const spatial = measureSite(placed, entry.annotations, entry.assemblies, context);
  const stats = configurationStats(entry, ring, ringAreaSqFt);
  const connectors = entry.assemblies.flatMap((assembly) => assembly.connectors);
  let east = 0;
  let north = 0;
  for (const item of placed) {
    east += item.transform.position.x;
    north += item.transform.position.z;
  }
  return {
    id: entry.id,
    name: entry.name,
    modules: stats.modules,
    assemblies: entry.assemblies.length,
    connectorsAvailable: connectors.filter((connector) => connector.geometryState === "available").length,
    connectorsUnresolved: connectors.filter((connector) => connector.geometryState !== "available").length,
    program: programDistribution(placed),
    nominalEnvelopeSqFt: nominalEnvelopeSqFt(placed.length),
    occupiedSqFt: stats.area,
    occupiedPercent: stats.percent,
    meanEast: placed.length ? east / placed.length : null,
    meanNorth: placed.length ? north / placed.length : null,
    bay: spatial.bay,
    macarthur: spatial.macarthur,
    highway: spatial.highway,
    urban: spatial.urban,
    entranceAccess: spatial.entranceAccess,
  };
}

function nearestFeet(measure: MeasureSet): number | null {
  if (!measure.available || measure.nearestFeet === null || !Number.isFinite(measure.nearestFeet)) return null;
  return measure.nearestFeet;
}

export function comparisonMetricValue(row: ComparisonRow, metric: ComparisonMetricId): number | null {
  switch (metric) {
    case "modules": return row.modules;
    case "assemblies": return row.assemblies;
    case "workspace": return row.program.workspace;
    case "lobby": return row.program.lobby;
    case "gathering": return row.program.gathering;
    case "unassigned": return row.program.unassigned;
    case "occupied": return row.occupiedSqFt;
    case "parcel": return row.occupiedPercent;
    case "envelope": return row.nominalEnvelopeSqFt;
    case "connectorsAvailable": return row.connectorsAvailable;
    case "connectorsUnresolved": return row.connectorsUnresolved;
    case "meanEast": return row.meanEast;
    case "meanNorth": return row.meanNorth;
    case "bay": return nearestFeet(row.bay);
    case "macarthur": return nearestFeet(row.macarthur);
    case "highway": return nearestFeet(row.highway);
    case "streets": return nearestFeet(row.urban);
    case "entrances": return nearestFeet(row.entranceAccess);
  }
}

export type PreferenceStatus = "scored" | "equal" | "zero-weight" | "no-metric" | "no-target" | "missing";

export type PreferenceContribution = {
  configurationId: string;
  value: number | null;
  criterion: number | null;
  contribution: number | null;
};

export type PreferenceTerm = {
  id: string;
  label: string;
  metric: ComparisonMetricId | null;
  unit: string | null;
  sense: PrioritySense;
  weight: number;
  share: number;
  target: number | null;
  status: PreferenceStatus;
  contributions: PreferenceContribution[];
};

export type PreferenceResult = {
  terms: PreferenceTerm[];
  placements: {
    configurationId: string;
    name: string;
    score: number | null;
    rank: number | null;
  }[];
};

function scaleCriteria(values: readonly number[], sense: PrioritySense, target: number | null): number[] {
  if (sense === "target") {
    const distances = values.map((value) => Math.abs(value - (target ?? 0)));
    const worst = Math.max(...distances);
    if (worst === 0) return values.map(() => 1);
    return distances.map((distance) => 1 - distance / worst);
  }
  const low = Math.min(...values);
  const high = Math.max(...values);
  if (high === low) return values.map(() => 1);
  if (sense === "minimize") return values.map((value) => (high - value) / (high - low));
  return values.map((value) => (value - low) / (high - low));
}

export function preferenceRanking(rows: readonly ComparisonRow[], priorities: readonly ComparisonPriority[]): PreferenceResult {
  const drafts = priorities.map((priority) => {
    const metric = COMPARISON_METRICS.find((item) => item.id === priority.metric) ?? null;
    const values = rows.map((row) => metric ? comparisonMetricValue(row, metric.id) : null);
    let status: PreferenceStatus = "scored";
    let criteria: number[] = [];
    if (!(priority.weight > 0)) status = "zero-weight";
    else if (!metric) status = "no-metric";
    else if (values.some((value) => value === null || !Number.isFinite(value))) status = "missing";
    else if (priority.sense === "target" && (priority.target === null || !Number.isFinite(priority.target))) status = "no-target";
    else {
      criteria = scaleCriteria(values as number[], priority.sense, priority.target);
      if (criteria.every((score) => score === criteria[0])) status = "equal";
    }
    return { priority, metric, values, status, criteria };
  });
  const activeWeight = drafts.reduce((sum, item) => sum + (item.status === "scored" || item.status === "equal" ? item.priority.weight : 0), 0);
  const terms: PreferenceTerm[] = drafts.map((item) => {
    const included = item.status === "scored" || item.status === "equal";
    const share = included && activeWeight > 0 ? item.priority.weight / activeWeight : 0;
    return {
      id: item.priority.id,
      label: item.priority.label,
      metric: item.metric?.id ?? null,
      unit: item.metric?.unit ?? null,
      sense: item.priority.sense,
      weight: item.priority.weight,
      share,
      target: item.priority.target,
      status: item.status,
      contributions: rows.map((row, index) => ({
        configurationId: row.id,
        value: item.values[index],
        criterion: included ? item.criteria[index] ?? null : null,
        contribution: included ? share * item.criteria[index] : null,
      })),
    };
  });
  const placements = rows.map((row) => {
    const scored = terms.some((term) => term.status === "scored" || term.status === "equal");
    const score = scored ? terms.reduce((sum, term) => {
      const part = term.contributions.find((item) => item.configurationId === row.id);
      return sum + (part?.contribution ?? 0);
    }, 0) : null;
    return { configurationId: row.id, name: row.name, score, rank: null as number | null };
  });
  const ordered = placements.filter((item) => item.score !== null).sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  let previous: number | null = null;
  let rank = 0;
  ordered.forEach((item, index) => {
    if (previous === null || item.score !== previous) rank = index + 1;
    previous = item.score;
    const place = placements.find((entry) => entry.configurationId === item.configurationId);
    if (place) place.rank = rank;
  });
  return { terms, placements };
}

export function referenceForModule(moduleId: string, archetypeId: string, candidateId: number | null, continuationId: string | null) {
  if (candidateId === null || continuationId === null) return null;
  return { archetypeId, candidateId, continuationId, moduleId };
}
