import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { ARCHETYPES } from "../skill1/archetypes";
import type { EvolutionArchetypeView, EvolutionCandidateView, EvolutionCatalog } from "./evolution-index";
import type { CatalogIndex, PublishedCandidate, PublishedCatalog } from "./semantic/publish-catalog";

const TYPOLOGY_ORDER = ["lobby", "workspace", "gathering"];

/**
 * A published catalogue can be shown when its index status is complete, or when
 * its stored fidelity is warn. A blocked status stays unavailable either way.
 * This reads the index as stored. It does not recompute fidelity.
 */
export function isPublishedCatalogUsable(entry: { status: string; fidelity: string | null }) {
  if (entry.status === "blocked") return false;
  return entry.status === "complete" || entry.fidelity === "warn";
}

export function semanticCatalogRoot() {
  return join(process.cwd(), "data", "semantic-catalogs");
}

/** Preview PNG from the Skill 2 catalog pushed on main. */
export function semanticPreviewPath(archetypeId: string, id: string) {
  if (!/^[a-z0-9-]+$/.test(archetypeId) || !/^\d+$/.test(id)) return null;
  const path = join(semanticCatalogRoot(), archetypeId, "previews", `${id}.png`);
  return existsSync(path) ? path : null;
}

export function loadPublishedSemanticCatalog(): EvolutionCatalog {
  const indexPath = join(semanticCatalogRoot(), "index.json");
  if (!existsSync(indexPath)) return { archetypes: [] };
  const index = JSON.parse(readFileSync(indexPath, "utf8")) as CatalogIndex;
  const archetypes = Object.entries(index.archetypes)
    .filter(([, entry]) => isPublishedCatalogUsable(entry))
    .map(([archetypeId]) => loadArchetype(archetypeId))
    .filter((item): item is EvolutionArchetypeView => item !== null)
    .sort(
      (a, b) =>
        TYPOLOGY_ORDER.indexOf(a.typologyId) - TYPOLOGY_ORDER.indexOf(b.typologyId) || a.name.localeCompare(b.name),
    );
  return { archetypes };
}

/** The Pareto Catalog screen. Reads only data/semantic-catalogs from the main push. */
export function loadShownCatalog(): EvolutionCatalog {
  return loadPublishedSemanticCatalog();
}

function loadArchetype(archetypeId: string): EvolutionArchetypeView | null {
  const file = join(semanticCatalogRoot(), archetypeId, "catalog.json");
  if (!existsSync(file)) return null;
  const catalog = JSON.parse(readFileSync(file, "utf8")) as PublishedCatalog;
  if (catalog.archetypeId !== archetypeId || !isPublishedCatalogUsable({ status: catalog.status, fidelity: catalog.fidelity.status })) return null;
  const source = Object.values(ARCHETYPES).find((item) => item.id === archetypeId);
  const candidates = storedOrder(catalog).map((candidate) => toView(archetypeId, candidate));
  const specialists = { formal: [] as number[], spatial: [] as number[], atmospheric: [] as number[] };
  for (const candidate of candidates) {
    if (candidate.specialist) specialists[candidate.specialist].push(candidate.id);
  }
  return {
    archetypeId,
    name: source?.name ?? archetypeId,
    typologyId: source?.typologyId ?? "lobby",
    completedGenerations: catalog.completedGenerations,
    generationCount: catalog.completedGenerations,
    populationSize: catalog.evaluations,
    generations: [],
    candidates,
    archiveCount: candidates.filter((candidate) => candidate.pareto).length,
    specialists,
  };
}

/** Combined Catalog entry order, then any published candidate the entry list omitted. */
function storedOrder(catalog: PublishedCatalog) {
  const byId = new Map(catalog.candidates.map((candidate) => [candidate.id, candidate]));
  const ordered: PublishedCandidate[] = [];
  const seen = new Set<number>();
  for (const entry of catalog.catalog.entries) {
    const candidate = byId.get(entry.representativeId);
    if (!candidate || seen.has(candidate.id)) continue;
    ordered.push(candidate);
    seen.add(candidate.id);
  }
  for (const candidate of catalog.candidates) {
    if (seen.has(candidate.id)) continue;
    ordered.push(candidate);
    seen.add(candidate.id);
  }
  return ordered;
}

function toView(archetypeId: string, candidate: PublishedCandidate): EvolutionCandidateView {
  const previewFile = `previews/${candidate.id}.png`;
  const hasPreview = candidate.preview?.file === previewFile && semanticPreviewPath(archetypeId, String(candidate.id)) !== null;
  return {
    key: `${archetypeId}:${candidate.id}`,
    archetypeId,
    id: candidate.id,
    generation: candidate.generation,
    formal: candidate.objectives.formal,
    spatial: candidate.objectives.spatial,
    atmospheric: candidate.objectives.atmospheric,
    pareto: candidate.current.pareto,
    paretoRank: candidate.current.pareto ? 1 : 0,
    archived: hasPreview,
    specialist: candidate.current.specialist,
    diversity: candidate.current.diversity,
    orientationElite: false,
    image: hasPreview ? `/api/semantic-catalog/${archetypeId}/${candidate.id}` : null,
    observed: candidate.observed,
    parentId: candidate.lineage.parentId,
    genome: null,
    schema: "semantic",
    preservationRoles: [
      candidate.current.pareto ? "pareto" : null,
      candidate.current.specialist ? `specialist-${candidate.current.specialist}` : null,
      candidate.current.diversity !== "none" ? "diversity" : null,
    ].filter((role): role is string => role != null),
    fidelity: candidate.fidelity.status,
    catalogVisible: true,
  };
}
