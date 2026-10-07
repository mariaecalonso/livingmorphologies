import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { ARCHETYPES } from "../skill1/archetypes";
import type { TypologyId } from "../types";
import type { EvolutionRun } from "./evolution";
import type { Genome } from "./genome";
import type { CatalogIndex, PublishedCatalog } from "./semantic/publish-catalog";

export type EvolutionCandidateView = {
  key: string;
  archetypeId: string;
  id: number;
  generation: number;
  formal: number;
  spatial: number;
  atmospheric: number;
  /** Rank 1 inside this candidate's own generation. Distinct from the global archive. */
  pareto: boolean;
  paretoRank: number;
  archived: boolean;
  /** Preference direction when this candidate is in the specialist catalog. */
  specialist: "formal" | "spatial" | "atmospheric" | null;
  /** Best of its legal orientation, shown when it is not already in the Pareto archive. */
  orientationElite: boolean;
  image: string | null;
  observed: Record<string, number>;
  parentId: number | null;
  genome: Genome | null;
  schema: "pose" | "semantic";
  preservationRoles?: string[];
  diversity?: "none" | "tag" | "rescue";
  fidelity?: string;
  provisional?: boolean;
  catalogVisible?: boolean;
};

export type EvolutionGenerationView = {
  id: string;
  index: number;
  status: "done" | "waiting";
  evaluated: number;
  feasible: number;
  pareto: number;
  archived: number;
  /** Unweighted global archive after this generation. Empty when the generation is not saved. */
  archiveIds: number[];
};

export type EvolutionArchetypeView = {
  archetypeId: string;
  name: string;
  typologyId: TypologyId;
  completedGenerations: number;
  generationCount: number;
  populationSize: number;
  generations: EvolutionGenerationView[];
  candidates: EvolutionCandidateView[];
  archiveCount: number;
  specialists: {
    formal: number[];
    spatial: number[];
    atmospheric: number[];
  };
};

export type EvolutionCatalog = {
  archetypes: EvolutionArchetypeView[];
};

const TYPOLOGY_ORDER = ["lobby", "workspace", "gathering"];

export function evolutionDir() {
  return join(process.cwd(), "data", "evolution");
}

export function semanticRunDir() {
  return join(process.cwd(), "data", "semantic-runs");
}

export function loadEvolutionCatalog(): EvolutionCatalog {
  const pose = loadRunDir(evolutionDir(), "pose");
  const semantic = loadRunDir(semanticRunDir(), "semantic");
  const byId = new Map<string, EvolutionArchetypeView>();
  for (const archetype of pose) byId.set(archetype.archetypeId, archetype);
  for (const archetype of semantic) byId.set(archetype.archetypeId, archetype);
  for (const archetype of publishedCatalogViews()) {
    const existing = byId.get(archetype.archetypeId);
    const hasDrawing = existing?.candidates.some((candidate) => candidate.image) ?? false;
    if (!existing || !hasDrawing) byId.set(archetype.archetypeId, archetype);
  }
  const archetypes = [...byId.values()].sort(
    (a, b) =>
      TYPOLOGY_ORDER.indexOf(a.typologyId) - TYPOLOGY_ORDER.indexOf(b.typologyId) || a.name.localeCompare(b.name),
  );
  return { archetypes };
}

function publishedCatalogViews(): EvolutionArchetypeView[] {
  const root = join(process.cwd(), "data", "semantic-catalogs");
  const indexPath = join(root, "index.json");
  if (!existsSync(indexPath)) return [];
  const index = JSON.parse(readFileSync(indexPath, "utf8")) as CatalogIndex;
  const views: EvolutionArchetypeView[] = [];
  for (const [archetypeId, entry] of Object.entries(index.archetypes)) {
    if (entry.status === "blocked") continue;
    if (entry.status !== "complete" && entry.fidelity !== "warn") continue;
    const file = join(root, archetypeId, "catalog.json");
    if (!existsSync(file)) continue;
    const catalog = JSON.parse(readFileSync(file, "utf8")) as PublishedCatalog;
    if (catalog.archetypeId !== archetypeId) continue;
    const source = Object.values(ARCHETYPES).find((item) => item.id === archetypeId);
    const candidates = catalog.candidates.map((candidate) => {
      const preview = join(root, archetypeId, "previews", `${candidate.id}.png`);
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
        archived: candidate.current.pareto,
        specialist: candidate.current.specialist,
        orientationElite: false,
        image: existsSync(preview) ? `/api/semantic-catalog/${archetypeId}/${candidate.id}` : null,
        observed: candidate.observed,
        parentId: candidate.lineage.parentId,
        genome: null,
        schema: "semantic" as const,
        preservationRoles: [
          candidate.current.pareto ? "pareto" : null,
          candidate.current.specialist ? `specialist-${candidate.current.specialist}` : null,
          candidate.current.diversity !== "none" ? "diversity" : null,
        ].filter((role): role is string => role != null),
        diversity: candidate.current.diversity,
        fidelity: candidate.fidelity.status,
        catalogVisible: true,
      };
    });
    const specialists = { formal: [] as number[], spatial: [] as number[], atmospheric: [] as number[] };
    for (const candidate of candidates) {
      if (candidate.specialist) specialists[candidate.specialist].push(candidate.id);
    }
    views.push({
      archetypeId,
      name: source?.name ?? archetypeId,
      typologyId: (source?.typologyId ?? "lobby") as TypologyId,
      completedGenerations: catalog.completedGenerations,
      generationCount: catalog.completedGenerations,
      populationSize: catalog.evaluations,
      generations: [],
      candidates,
      archiveCount: candidates.filter((candidate) => candidate.pareto).length,
      specialists,
    });
  }
  return views;
}

function loadRunDir(dir: string, kind: "pose" | "semantic"): EvolutionArchetypeView[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && /^[a-z0-9-]+$/.test(entry.name))
    .map((entry) => loadArchetype(entry.name, dir, kind))
    .filter((item): item is EvolutionArchetypeView => item !== null);
}

function loadArchetype(archetypeId: string, dir: string, kind: "pose" | "semantic"): EvolutionArchetypeView | null {
  const file = join(dir, archetypeId, "run.json");
  if (!existsSync(file)) return null;
  let run: EvolutionRun | SemanticRun;
  try {
    run = JSON.parse(readFileSync(file, "utf8")) as EvolutionRun | SemanticRun;
  } catch {
    return null;
  }
  if (run.archetypeId !== archetypeId) return null;
  if (kind === "semantic" || ("schemaVersion" in run && run.schemaVersion === 3)) return loadSemanticArchetype(run as SemanticRun);
  const pose = run as EvolutionRun;
  const name = Object.values(ARCHETYPES).find((item) => item.id === archetypeId)?.name ?? archetypeId;
  const generations: EvolutionGenerationView[] = [];
  for (let index = 1; index <= pose.config.generations; index += 1) {
    const record = pose.generations.find((item) => item.generation === index);
    generations.push({
      id: `G${String(index).padStart(2, "0")}`,
      index,
      status: record ? "done" : "waiting",
      evaluated: record?.evaluated ?? 0,
      feasible: record?.feasible ?? 0,
      pareto: record?.frontIds.length ?? 0,
      archived: record?.archiveIds.length ?? 0,
      archiveIds: record?.archiveIds ?? [],
    });
  }
  const root = join(evolutionDir(), archetypeId);
  const specialists = pose.specialistIds ?? { formal: [], spatial: [], atmospheric: [] };
  const orientationElites = new Set(pose.orientationEliteIds ?? []);
  const specialistOf = (id: number) =>
    (["formal", "spatial", "atmospheric"] as const).find((emphasis) => specialists[emphasis].includes(id)) ?? null;
  const candidates = pose.candidates.map((candidate) => {
    const rel = candidate.preview.file;
    const emphasis = specialistOf(candidate.id);
    const orientationElite = orientationElites.has(candidate.id);
    const kept = candidate.archived || emphasis != null || orientationElite;
    const hasImage = kept && rel.startsWith("archive/") && existsSync(join(root, rel));
    return {
      key: `${archetypeId}:${candidate.id}`,
      archetypeId,
      id: candidate.id,
      generation: candidate.generation,
      formal: candidate.objectives.formal,
      spatial: candidate.objectives.spatial,
      atmospheric: candidate.objectives.atmospheric,
      pareto: candidate.rank === 1,
      paretoRank: candidate.rank,
      archived: candidate.archived,
      specialist: emphasis,
      orientationElite,
      image: hasImage ? `/api/evolution/${archetypeId}/${candidate.id}` : null,
      observed: candidate.observed,
      parentId: candidate.parentId,
      genome: candidate.genome,
      schema: "pose" as const,
    };
  });
  return {
    archetypeId,
    name,
    typologyId: pose.typologyId,
    completedGenerations: pose.completedGenerations,
    generationCount: pose.config.generations,
    populationSize: pose.config.populationSize,
    generations,
    candidates,
    archiveCount: pose.archiveIds.length,
    specialists,
  };
}

function loadSemanticArchetype(run: SemanticRun): EvolutionArchetypeView {
  const name = Object.values(ARCHETYPES).find((item) => item.id === run.archetypeId)?.name ?? run.archetypeId;
  const visible = new Set(run.catalog.entries.map((entry) => entry.representativeId));
  const generations: EvolutionGenerationView[] = [];
  for (let index = 1; index <= run.config.generations; index += 1) {
    const record = run.generations.find((item) => item.generation === index);
    generations.push({
      id: `G${String(index).padStart(2, "0")}`,
      index,
      status: record ? "done" : "waiting",
      evaluated: record?.newCandidateIds.length ?? 0,
      feasible: record?.technicallyValidIds.length ?? 0,
      pareto: record?.paretoIds.length ?? 0,
      archived: record?.paretoIds.length ?? 0,
      archiveIds: record?.paretoIds ?? [],
    });
  }
  const latest = run.generations[run.generations.length - 1];
  const specialists = latest?.specialistIds ?? { formal: [], spatial: [], atmospheric: [] };
  const candidates = run.candidates.map((candidate) => {
    const roles = [
      candidate.current.pareto ? "pareto" : null,
      candidate.current.specialist ? `specialist-${candidate.current.specialist}` : null,
      candidate.current.diversity !== "none" ? "diversity" : null,
    ].filter((role): role is string => role != null);
    const preview = candidate.preview?.file
      ? join(process.cwd(), "data", "semantic-runs", run.archetypeId, candidate.preview.file)
      : null;
    const published = join(process.cwd(), "data", "semantic-catalogs", run.archetypeId, "previews", `${candidate.id}.png`);
    const image = preview && existsSync(preview)
      ? `/api/evolution/${run.archetypeId}/${candidate.id}`
      : existsSync(published)
        ? `/api/semantic-catalog/${run.archetypeId}/${candidate.id}`
        : null;
    return {
      key: `${run.archetypeId}:${candidate.id}`,
      archetypeId: run.archetypeId,
      id: candidate.id,
      generation: candidate.generation,
      formal: candidate.objectives.formal,
      spatial: candidate.objectives.spatial,
      atmospheric: candidate.objectives.atmospheric,
      pareto: candidate.current.pareto,
      paretoRank: candidate.current.pareto ? 1 : 0,
      archived: candidate.current.pareto,
      specialist: candidate.current.specialist,
      orientationElite: false,
      image,
      observed: candidate.observed,
      parentId: candidate.lineage.parentId,
      genome: null,
      schema: "semantic" as const,
      preservationRoles: roles,
      diversity: candidate.current.diversity,
      fidelity: candidate.fidelity.status,
      provisional: run.provisional,
      catalogVisible: visible.has(candidate.id),
    };
  });
  return {
    archetypeId: run.archetypeId,
    name,
    typologyId: run.typologyId as TypologyId,
    completedGenerations: run.completedGenerations,
    generationCount: run.config.generations,
    populationSize: run.config.populationSize,
    generations,
    candidates,
    archiveCount: latest?.paretoIds.length ?? 0,
    specialists,
  };
}

export function archiveImagePath(archetypeId: string, id: string) {
  if (!/^[a-z0-9-]+$/.test(archetypeId) || !/^\d+$/.test(id)) return null;
  const semantic = join(process.cwd(), "data", "semantic-runs", archetypeId, "previews", `${id}.png`);
  if (existsSync(semantic)) return semantic;
  const path = join(evolutionDir(), archetypeId, "archive", `${id}.png`);
  return existsSync(path) ? path : null;
}
