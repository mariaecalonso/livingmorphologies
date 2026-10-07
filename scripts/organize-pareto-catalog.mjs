import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const out = join(root, "data", "skill2", "pareto-catalog");
const finishedRuns = new Set(["continuous-hall", "linear-gallery", "flat-deep-plan", "stepped-amphitheater"]);
const index = JSON.parse(readFileSync(join(root, "data", "semantic-catalogs", "index.json"), "utf8"));
const selections = JSON.parse(readFileSync(join(root, "data", "skill2-selections.json"), "utf8"));
const names = {
  "topographic-ground-field": "Topographic Ground Field",
  "linear-gallery": "Linear Gallery",
  "compressed-sequential": "Compressed Sequential",
  "continuous-hall": "Continuous Hall",
  "vertical-void": "Vertical Void",
  terraced: "Terraced",
  undulated: "Undulated",
  "contained-room-within-volume": "Contained Room Within Volume",
  "void-field": "Void Field",
  "open-hall": "Open Hall",
  "linear-edge-gallery": "Linear Edge Gallery",
  "flat-deep-plan": "Flat Deep Plan",
  "inserted-horizontal-plate": "Inserted Horizontal Plate",
  "stepped-amphitheater": "Stepped Amphitheater",
  "void-edge": "Void Edge",
};

function readJson(file) {
  return JSON.parse(readFileSync(file, "utf8"));
}

function drawingSource(archetypeId, id) {
  const candidates = [
    join(root, "data", "semantic-catalogs", archetypeId, "plates", `${id}.png`),
    join(root, "data", "semantic-runs", archetypeId, "previews", `${id}.png`),
    join(root, "data", "semantic-catalogs", archetypeId, "previews", `${id}.png`),
  ];
  return candidates.find((file) => existsSync(file)) ?? null;
}

function z0Pair(archetypeId, id) {
  const local = join(root, "data", "semantic-runs", archetypeId, "z0");
  const aside = join(process.env.USERPROFILE || "", "Desktop", "living-morphologies-set-aside", "data", "semantic-runs", archetypeId, "z0");
  for (const dir of [local, aside]) {
    const json = join(dir, `${id}.json`);
    const bin = join(dir, `${id}.bin`);
    if (existsSync(json) && existsSync(bin)) return { json, bin };
  }
  return null;
}

function shownCandidates(archetypeId) {
  if (finishedRuns.has(archetypeId)) {
    const runFile = join(root, "data", "semantic-runs", archetypeId, "run.json");
    if (existsSync(runFile)) {
      const run = readJson(runFile);
      if (run.completedGenerations >= run.config.generations && run.catalog.entries.length) {
        const visible = new Set(run.catalog.entries.map((entry) => entry.representativeId));
        const candidates = run.candidates.filter((candidate) => visible.has(candidate.id));
        return { source: "run", run, candidates };
      }
    }
  }
  const catalog = readJson(join(root, "data", "semantic-catalogs", archetypeId, "catalog.json"));
  const order = catalog.catalog.entries.map((entry) => entry.representativeId);
  const byId = new Map(catalog.candidates.map((candidate) => [candidate.id, candidate]));
  const candidates = order.map((id) => byId.get(id)).filter(Boolean);
  return { source: "published", catalog, candidates };
}

function candidateInfo(candidate) {
  return {
    id: candidate.id,
    generation: candidate.generation,
    formal: candidate.objectives.formal,
    spatial: candidate.objectives.spatial,
    atmospheric: candidate.objectives.atmospheric,
    pareto: candidate.current.pareto,
    specialist: candidate.current.specialist,
    diversity: candidate.current.diversity,
    fidelity: candidate.fidelity?.status ?? null,
    observed: candidate.observed,
  };
}

mkdirSync(out, { recursive: true });
const archetypes = [];
for (const archetypeId of Object.keys(index.archetypes)) {
  const shown = shownCandidates(archetypeId);
  const dir = join(out, archetypeId);
  const drawings = join(dir, "drawings");
  mkdirSync(drawings, { recursive: true });
  const records = [];
  for (const candidate of shown.candidates) {
    const source = drawingSource(archetypeId, candidate.id);
    if (!source) throw new Error(`missing drawing ${archetypeId} ${candidate.id}`);
    copyFileSync(source, join(drawings, `${candidate.id}.png`));
    records.push(candidateInfo(candidate));
  }
  const filamentFile = join(root, "config", "filament", `${archetypeId}.json`);
  const filament = existsSync(filamentFile) ? readJson(filamentFile) : null;
  if (filament) writeFileSync(join(dir, "filament.json"), `${JSON.stringify(filament, null, 2)}\n`);
  const selected = selections.selected[archetypeId] ?? null;
  let propagation = null;
  if (selected) {
    const pair = z0Pair(archetypeId, selected.candidateId);
    if (pair) {
      const propagationDir = join(dir, "propagation");
      mkdirSync(propagationDir, { recursive: true });
      copyFileSync(pair.json, join(propagationDir, `${selected.candidateId}.json`));
      copyFileSync(pair.bin, join(propagationDir, `${selected.candidateId}.bin`));
      propagation = { ready: true, files: [`${selected.candidateId}.json`, `${selected.candidateId}.bin`] };
    } else {
      propagation = { ready: false, files: [] };
    }
    writeFileSync(
      join(dir, "selection.json"),
      `${JSON.stringify({ archetypeId, candidateId: selected.candidateId, typologyId: selected.typologyId, objectives: selected.objectives, source: selected.source, propagation }, null, 2)}\n`,
    );
  }
  const info = {
    archetypeId,
    name: names[archetypeId] ?? archetypeId,
    typologyId: selected?.typologyId ?? shown.candidates[0]?.typologyId ?? null,
    source: shown.source,
    shown: records.length,
    filament,
    selection: selected ? { candidateId: selected.candidateId, propagationReady: propagation?.ready ?? false } : null,
    candidates: records,
  };
  writeFileSync(join(dir, "info.json"), `${JSON.stringify(info, null, 2)}\n`);
  archetypes.push({
    archetypeId,
    name: info.name,
    source: shown.source,
    shown: records.length,
    selection: info.selection,
  });
  console.log(`${archetypeId} ${shown.source} ${records.length}`);
}
writeFileSync(
  join(out, "index.json"),
  `${JSON.stringify({ catalog: "pareto-catalog", page: "/lab/evolution/pareto-catalog", archetypes }, null, 2)}\n`,
);
console.log(`organized ${archetypes.length} archetypes`);
