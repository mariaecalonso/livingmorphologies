import { ARCHITECTURAL_ROLES, type ArchitecturalRecord, type ArchitecturalRole, type ArrangementParameters, type EvidenceProvenance, type ExperimentalLobbyCondition, type NetworkNode, type NodeArchitecture } from "@/components/site/site-network";
import { NORTH_GATHERING_SEEDS, SKETCH_RECESSION_FT, buildNorthGatheringLayouts } from "@/lib/skill5/strategy-layouts";
import type { SiteContext } from "@/lib/skill5/site-model";

/** One architectural strategy. The older layouts remain internal placement mechanisms. */
export const ARCHITECTURAL_STRATEGY_ID = "herald-arrival-v1";

/** Baseline arrangement. Experimental Lobby uses the unverified city-side contact. */
export const ARRIVAL_ARRANGEMENT_ID = "arrival-city-north-v1";

/** The same two seeds on every arrangement, so the arrangement can be compared apart from the seed. */
export const COMPARISON_SEEDS = NORTH_GATHERING_SEEDS.slice(0, 2);

const LOBBY_CONDITIONS: readonly ExperimentalLobbyCondition[] = ["city-side-measured", "northeast-measured", "northwest-proposed", "absent"];

export type { ArchitecturalRecord, ArchitecturalRole, NodeArchitecture };

export type StrategyRelationship = ArchitecturalRecord["relationships"][number];

export const ROLE_LABEL: Record<ArchitecturalRole, string> = {
  "primary-lobby": "Public Lobby",
  "private-lobby": "Private Lobby",
  "north-lobby": "Experimental Lobby",
  "central-gathering": "Central Gathering",
  "private-gathering": "Private Gathering",
  "north-gathering": "Northern Gathering",
  workspace: "Workspace",
};

export const STRATEGY_RELATIONSHIPS: ArchitecturalRecord["relationships"] = [
  { from: "primary-lobby", to: "central-gathering", statement: "Public Lobby leads to the central gathering system, which has the strongest waterfront projection." },
  { from: "private-lobby", to: "workspace", statement: "Private Lobby leads toward distributed workspace." },
  { from: "private-lobby", to: "private-gathering", statement: "Private Lobby leads toward smaller private gathering." },
  { from: "north-lobby", to: "north-gathering", statement: "Experimental Lobby leads toward the northern gathering." },
  { from: "north-gathering", to: "central-gathering", statement: "Northern gathering may connect to the central gathering." },
];

/** Shows the current names on records that were saved with the earlier lobby names. */
export function displayRelationship(statement: string) {
  return statement.replaceAll("Primary Lobby", "Public Lobby").replaceAll("North Lobby", "Experimental Lobby");
}

export type ArrivalArrangement = ArchitecturalRecord & {
  title: string;
  reason: string;
  nodes: NetworkNode[];
  seeds: number[];
};

type ArrangementSpec = {
  id: string;
  title: string;
  reason: string;
  experimental: ExperimentalLobbyCondition;
  publicLobby: ArrangementParameters["publicLobby"];
  privateLobby: ArrangementParameters["privateLobby"];
  gathering: ArrangementParameters["gathering"];
  workspace: ArrangementParameters["workspace"];
  recessionFt: number;
};

export const ARRANGEMENT_FAMILY: readonly Pick<ArrangementSpec, "id" | "title" | "reason">[] = [
  { id: "arrival-city-north-v1", title: "City-side experimental lobby", reason: "Experimental Lobby uses the unverified northern city-side contact." },
  { id: "arrival-northeast-v1", title: "Northeast experimental lobby", reason: "Experimental Lobby uses the northeast measured contact as a different northern access." },
  { id: "arrival-northwest-v1", title: "Northwest experimental lobby", reason: "Experimental Lobby is a proposed source on the northwest city edge." },
  { id: "arrival-no-experimental-v1", title: "No experimental lobby", reason: "The arrangement has Public and Private Lobby only." },
  { id: "arrival-public-north-v1", title: "Public lobby shifted north", reason: "Public Lobby moves to the north side of the central west range." },
  { id: "arrival-private-inset-v1", title: "Private lobby inset", reason: "Private Lobby steps north from the southwest end, still in the southwest range." },
  { id: "arrival-continuous-v1", title: "Continuous gathering", reason: "Northern and central gathering share one waterfront attractor." },
  { id: "arrival-workspace-single-v1", title: "Single southern workspace", reason: "One southern workspace stands in for the spread of workspaces." },
  { id: "arrival-recession-deep-v1", title: "Deeper inland rooms", reason: "Private gathering and workspace sit farther inland from the central waterfront." },
  { id: "arrival-waterfront-close-v1", title: "Closer waterfront rooms", reason: "Private gathering and workspace sit closer to the central waterfront." },
];

function distance(a: { x: number; z: number }, b: { x: number; z: number }) {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

function isRole(value: unknown): value is ArchitecturalRole {
  return typeof value === "string" && (ARCHITECTURAL_ROLES as readonly string[]).includes(value);
}

export function readNodeArchitecture(value: unknown): NodeArchitecture | undefined {
  if (!value || typeof value !== "object") return undefined;
  const record = value as { role?: unknown; provenance?: unknown };
  if (!isRole(record.role) || !record.provenance || typeof record.provenance !== "object") return undefined;
  const provenance = record.provenance as { class?: unknown; unverified?: unknown; evidenceId?: unknown };
  if (provenance.class !== "measured" && provenance.class !== "proposed") return undefined;
  return {
    role: record.role,
    provenance: {
      class: provenance.class,
      unverified: provenance.unverified === true,
      evidenceId: typeof provenance.evidenceId === "string" ? provenance.evidenceId : null,
    },
  };
}

function isLobbyCondition(value: unknown): value is ExperimentalLobbyCondition {
  return typeof value === "string" && (LOBBY_CONDITIONS as readonly string[]).includes(value);
}

function readParameters(value: unknown): ArrangementParameters | undefined {
  if (!value || typeof value !== "object") return undefined;
  const body = value as Partial<ArrangementParameters>;
  if (!isLobbyCondition(body.experimentalLobby)) return undefined;
  if (body.publicLobby !== "central-west" && body.publicLobby !== "central-west-north") return undefined;
  if (body.privateLobby !== "southwest-end" && body.privateLobby !== "southwest-inset") return undefined;
  if (body.gathering !== "distinct" && body.gathering !== "continuous") return undefined;
  if (body.workspace !== "spread" && body.workspace !== "single-south") return undefined;
  if (typeof body.recessionFt !== "number" || !Array.isArray(body.seeds)) return undefined;
  const seeds = body.seeds.filter((item): item is number => typeof item === "number" && Number.isFinite(item));
  if (seeds.length === 0) return undefined;
  return {
    experimentalLobby: body.experimentalLobby,
    publicLobby: body.publicLobby,
    privateLobby: body.privateLobby,
    gathering: body.gathering,
    workspace: body.workspace,
    recessionFt: body.recessionFt,
    seeds,
  };
}

export function readArchitecturalRecord(value: unknown): ArchitecturalRecord | undefined {
  if (!value || typeof value !== "object") return undefined;
  const record = value as { strategyId?: unknown; arrangementId?: unknown; relationships?: unknown; northLobby?: unknown; parameters?: unknown };
  if (record.strategyId !== ARCHITECTURAL_STRATEGY_ID || typeof record.arrangementId !== "string") return undefined;
  if (!isLobbyCondition(record.northLobby) || !Array.isArray(record.relationships)) return undefined;
  const relationships = record.relationships.flatMap((item): StrategyRelationship[] => {
    if (!item || typeof item !== "object") return [];
    const link = item as { from?: unknown; to?: unknown; statement?: unknown };
    if (!isRole(link.from) || !isRole(link.to) || typeof link.statement !== "string") return [];
    return [{ from: link.from, to: link.to, statement: link.statement }];
  });
  if (relationships.length === 0) return undefined;
  const parameters = readParameters(record.parameters);
  return { strategyId: ARCHITECTURAL_STRATEGY_ID, arrangementId: record.arrangementId, relationships, northLobby: record.northLobby, ...(parameters ? { parameters } : {}) };
}

export function programForRole(role: ArchitecturalRole): "lobby" | "gathering" | "workspace" {
  if (role.endsWith("lobby")) return "lobby";
  if (role.endsWith("gathering")) return "gathering";
  return "workspace";
}

function attractorRole(note: string): ArchitecturalRole | null {
  if (note.includes("Central waterfront") || note.includes("Northern waterfront")) return "central-gathering";
  if (note.includes("Northern destination")) return "north-gathering";
  if (note.includes("Southern destination")) return "private-gathering";
  if (note.startsWith("Workspace")) return "workspace";
  return null;
}

function withArchitecture(node: NetworkNode, role: ArchitecturalRole, provenance: EvidenceProvenance): NetworkNode {
  return { ...node, architecture: { role, provenance } };
}

const FAMILY_SPECS: readonly ArrangementSpec[] = [
  { id: "arrival-city-north-v1", title: "City-side experimental lobby", reason: ARRANGEMENT_FAMILY[0].reason, experimental: "city-side-measured", publicLobby: "central-west", privateLobby: "southwest-end", gathering: "distinct", workspace: "spread", recessionFt: SKETCH_RECESSION_FT },
  { id: "arrival-northeast-v1", title: "Northeast experimental lobby", reason: ARRANGEMENT_FAMILY[1].reason, experimental: "northeast-measured", publicLobby: "central-west", privateLobby: "southwest-end", gathering: "distinct", workspace: "spread", recessionFt: SKETCH_RECESSION_FT },
  { id: "arrival-northwest-v1", title: "Northwest experimental lobby", reason: ARRANGEMENT_FAMILY[2].reason, experimental: "northwest-proposed", publicLobby: "central-west", privateLobby: "southwest-end", gathering: "distinct", workspace: "spread", recessionFt: SKETCH_RECESSION_FT },
  { id: "arrival-no-experimental-v1", title: "No experimental lobby", reason: ARRANGEMENT_FAMILY[3].reason, experimental: "absent", publicLobby: "central-west", privateLobby: "southwest-end", gathering: "distinct", workspace: "spread", recessionFt: SKETCH_RECESSION_FT },
  { id: "arrival-public-north-v1", title: "Public lobby shifted north", reason: ARRANGEMENT_FAMILY[4].reason, experimental: "city-side-measured", publicLobby: "central-west-north", privateLobby: "southwest-end", gathering: "distinct", workspace: "spread", recessionFt: SKETCH_RECESSION_FT },
  { id: "arrival-private-inset-v1", title: "Private lobby inset", reason: ARRANGEMENT_FAMILY[5].reason, experimental: "city-side-measured", publicLobby: "central-west", privateLobby: "southwest-inset", gathering: "distinct", workspace: "spread", recessionFt: SKETCH_RECESSION_FT },
  { id: "arrival-continuous-v1", title: "Continuous gathering", reason: ARRANGEMENT_FAMILY[6].reason, experimental: "city-side-measured", publicLobby: "central-west", privateLobby: "southwest-end", gathering: "continuous", workspace: "spread", recessionFt: SKETCH_RECESSION_FT },
  { id: "arrival-workspace-single-v1", title: "Single southern workspace", reason: ARRANGEMENT_FAMILY[7].reason, experimental: "city-side-measured", publicLobby: "central-west", privateLobby: "southwest-end", gathering: "distinct", workspace: "single-south", recessionFt: SKETCH_RECESSION_FT },
  { id: "arrival-recession-deep-v1", title: "Deeper inland rooms", reason: ARRANGEMENT_FAMILY[8].reason, experimental: "city-side-measured", publicLobby: "central-west", privateLobby: "southwest-end", gathering: "distinct", workspace: "spread", recessionFt: 160 },
  { id: "arrival-waterfront-close-v1", title: "Closer waterfront rooms", reason: ARRANGEMENT_FAMILY[9].reason, experimental: "city-side-measured", publicLobby: "central-west", privateLobby: "southwest-end", gathering: "distinct", workspace: "spread", recessionFt: 40 },
];

function measuredSource(nodes: readonly NetworkNode[], kind: "city" | "northeast") {
  const pattern = kind === "city" ? /city-side/i : /northeast/i;
  return nodes.find((node) => node.kind === "source" && node.strategy?.origin === "measured-access" && pattern.test(node.strategy.note));
}

function edgeSources(nodes: readonly NetworkNode[]) {
  return nodes.filter((node) => node.kind === "source" && node.strategy?.origin === "city-edge");
}

function zSpan(nodes: readonly NetworkNode[]) {
  const min = Math.min(...nodes.map((node) => node.z));
  const max = Math.max(...nodes.map((node) => node.z));
  return { min, max, mid: (min + max) / 2, span: Math.max(1, max - min) };
}

function clearOf(node: NetworkNode, blocked: readonly NetworkNode[]) {
  return blocked.every((item) => distance(item, node) >= 40);
}

function pickPublic(edge: readonly NetworkNode[], mode: ArrangementParameters["publicLobby"], blocked: readonly NetworkNode[]) {
  const { mid, span } = zSpan(edge);
  let band = edge.filter((node) => Math.abs(node.z - mid) <= span * 0.2 && clearOf(node, blocked));
  if (band.length < 2) band = edge.filter((node) => Math.abs(node.z - mid) <= span * 0.34 && clearOf(node, blocked));
  if (band.length === 0) band = edge.filter((node) => clearOf(node, blocked));
  const central = [...band].sort((a, b) => Math.abs(a.z - mid) - Math.abs(b.z - mid) || a.x - b.x)[0];
  if (!central || mode === "central-west") return central ?? null;
  return [...band].filter((node) => node !== central).sort((a, b) => b.z - a.z || a.x - b.x)[0] ?? null;
}

function pickPrivate(edge: readonly NetworkNode[], mode: ArrangementParameters["privateLobby"], blocked: readonly NetworkNode[]) {
  const { min, span } = zSpan(edge);
  let band = edge.filter((node) => node.z <= min + span * 0.3 && clearOf(node, blocked));
  if (band.length < (mode === "southwest-inset" ? 2 : 1)) band = edge.filter((node) => clearOf(node, blocked));
  const ordered = [...band].sort((a, b) => a.z - b.z || a.x - b.x);
  return mode === "southwest-end" ? ordered[0] ?? null : ordered[1] ?? null;
}

function pickNorthwest(edge: readonly NetworkNode[], city: NetworkNode) {
  const { max, span } = zSpan(edge);
  const north = edge.filter((node) => node.z >= max - span * 0.3 && distance(node, city) >= 40);
  const pool = north.length > 0 ? north : edge.filter((node) => distance(node, city) >= 40);
  return [...pool].sort((a, b) => b.z - a.z || a.x - b.x)[0] ?? null;
}

function stamp(node: NetworkNode, role: ArchitecturalRole, provenance: EvidenceProvenance, arrangementId: string) {
  const strategy = node.strategy ? { ...node.strategy, layoutId: arrangementId } : node.strategy;
  return withArchitecture({ ...node, strategy }, role, provenance);
}

function buildSpec(site: SiteContext, spec: ArrangementSpec, cache: Map<number, ReturnType<typeof buildNorthGatheringLayouts>>): ArrivalArrangement | null {
  let layouts = cache.get(spec.recessionFt);
  if (!layouts) {
    layouts = buildNorthGatheringLayouts(site, { recessionFt: spec.recessionFt, seedsPerLayout: COMPARISON_SEEDS.length });
    cache.set(spec.recessionFt, layouts);
  }
  const stem = spec.gathering === "continuous" ? "sketch-north-continuous" : "sketch-north-distinct";
  const base = layouts.find((item) => item.id === `${stem}-without`);
  const withNortheast = layouts.find((item) => item.id === `${stem}-with`);
  if (!base) return null;
  const city = measuredSource(base.nodes, "city");
  const northeast = withNortheast ? measuredSource(withNortheast.nodes, "northeast") : undefined;
  if (!city) return null;
  if (base.nodes.some((node) => /northeast/i.test(node.strategy?.note ?? ""))) return null;
  const edge = edgeSources(base.nodes);
  if (edge.length < 2) return null;
  const proposed: EvidenceProvenance = { class: "proposed", unverified: false, evidenceId: null };
  let experimental: NetworkNode | null = null;
  if (spec.experimental === "city-side-measured") {
    experimental = stamp(city, "north-lobby", { class: "measured", unverified: true, evidenceId: city.recordId ?? null }, spec.id);
  } else if (spec.experimental === "northeast-measured") {
    if (!northeast) return null;
    experimental = stamp(northeast, "north-lobby", { class: "measured", unverified: true, evidenceId: northeast.recordId ?? null }, spec.id);
  } else if (spec.experimental === "northwest-proposed") {
    const northwest = pickNorthwest(edge, city);
    if (!northwest) return null;
    experimental = stamp(northwest, "north-lobby", proposed, spec.id);
  }
  const blocked = experimental ? [experimental] : [];
  const publicLobby = pickPublic(edge, spec.publicLobby, blocked);
  if (!publicLobby) return null;
  const privateLobby = pickPrivate(edge, spec.privateLobby, [...blocked, publicLobby]);
  if (!privateLobby || privateLobby === publicLobby) return null;
  let attractors = base.nodes.flatMap((node) => {
    if (node.kind !== "attractor") return [];
    const role = attractorRole(node.strategy?.note ?? "");
    return role ? [stamp(node, role, proposed, spec.id)] : [];
  });
  if (spec.workspace === "single-south") {
    const workspaces = attractors.filter((node) => node.architecture?.role === "workspace").sort((a, b) => a.z - b.z || a.x - b.x);
    const kept = workspaces[0];
    attractors = attractors.filter((node) => node.architecture?.role !== "workspace" || node === kept);
  }
  const roles = new Set(attractors.map((node) => node.architecture?.role));
  if (!roles.has("central-gathering") || !roles.has("private-gathering") || !roles.has("workspace")) return null;
  if (spec.gathering === "distinct" && !roles.has("north-gathering")) return null;
  if (spec.gathering === "continuous" && roles.has("north-gathering")) return null;
  const parameters: ArrangementParameters = {
    experimentalLobby: spec.experimental,
    publicLobby: spec.publicLobby,
    privateLobby: spec.privateLobby,
    gathering: spec.gathering,
    workspace: spec.workspace,
    recessionFt: spec.recessionFt,
    seeds: [...COMPARISON_SEEDS],
  };
  return {
    strategyId: ARCHITECTURAL_STRATEGY_ID,
    arrangementId: spec.id,
    title: spec.title,
    reason: spec.reason,
    relationships: STRATEGY_RELATIONSHIPS,
    northLobby: spec.experimental,
    parameters,
    nodes: [
      ...(experimental ? [experimental] : []),
      stamp(publicLobby, "primary-lobby", proposed, spec.id),
      stamp(privateLobby, "private-lobby", proposed, spec.id),
      ...attractors,
    ],
    seeds: [...COMPARISON_SEEDS],
  };
}

/** One-factor arrangements of the same strategy. Each changes one condition from the city-side baseline. */
export function buildArrivalFamily(site: SiteContext): ArrivalArrangement[] {
  const cache = new Map<number, ReturnType<typeof buildNorthGatheringLayouts>>();
  return FAMILY_SPECS.flatMap((spec) => {
    const arrangement = buildSpec(site, spec, cache);
    return arrangement ? [arrangement] : [];
  });
}

/** Baseline arrangement. Kept so earlier callers still receive the city-side experimental lobby. */
export function buildArrivalArrangement(site: SiteContext): ArrivalArrangement | null {
  return buildArrivalFamily(site).find((item) => item.arrangementId === ARRIVAL_ARRANGEMENT_ID) ?? null;
}
