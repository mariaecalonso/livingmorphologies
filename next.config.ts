import type { NextConfig } from "next";
import { existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import selection from "./data/skill3/final-selection.json";

type SelectedRow = {
  archetypeId: string;
  candidateId: number;
  continuationId: string;
};

const selected = selection.selections as SelectedRow[];

/** Files the Lab reads at request time. Historical archives stay excluded. */
function productionDataFiles() {
  const files = [
    "data/skill2/pareto-catalog/selections.json",
    "data/skill3/process-replay/vertical-void-351-N24.json",
  ];
  for (const row of selected) {
    const mesh = `${row.archetypeId}-${row.candidateId}-${row.continuationId}.json`;
    files.push(
      `data/experiments/carved-mass-solidified/${mesh}`,
      `data/experiments/carved-mass-solidified/metrics/${mesh}`,
      `data/semantic-runs/${row.archetypeId}/z0/${row.candidateId}.bin`,
      `data/semantic-runs/${row.archetypeId}/z0/${row.candidateId}.json`,
      `data/semantic-catalogs/${row.archetypeId}/catalog.json`,
    );
  }
  return files;
}

/** Every solidified file except the 15 selected meshes and their metric records. */
function excludedSolidified() {
  const root = path.join(process.cwd(), "data", "experiments", "carved-mass-solidified");
  const keep = new Set(selected.map((row) => `${row.archetypeId}-${row.candidateId}-${row.continuationId}.json`));
  const excluded: string[] = [];
  if (!existsSync(root)) return excluded;
  for (const name of readdirSync(root)) {
    if (name === "metrics" || keep.has(name)) continue;
    const full = path.join(root, name);
    const suffix = statSync(full).isDirectory() ? "/**" : "";
    excluded.push(`data/experiments/carved-mass-solidified/${name}${suffix}`);
  }
  const metrics = path.join(root, "metrics");
  if (!existsSync(metrics)) return excluded;
  for (const name of readdirSync(metrics)) {
    if (!keep.has(name)) excluded.push(`data/experiments/carved-mass-solidified/metrics/${name}`);
  }
  return excluded;
}

const productionData = productionDataFiles();

function relative(full: string) {
  return path.relative(process.cwd(), full).replace(/\\/g, "/");
}

function listFiles(directory: string) {
  const root = path.join(process.cwd(), directory);
  const files: string[] = [];
  const walk = (dir: string) => {
    if (!existsSync(dir)) return;
    for (const name of readdirSync(dir)) {
      const full = path.join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else files.push(relative(full));
    }
  };
  walk(root);
  return files;
}

/** Stored Vertical Void 351 N24 generation replay. This folder has no other continuations. */
const generationFiles = listFiles("data/experiments/process-generation/vertical-void-351/N24");

/** Stored Vertical Void 351 N24 formation readings. The other archetypes have none. */
const formFiles = listFiles("data/experiments/process-form/vertical-void-351/N24");

/** Official open, capped, and the one adapted reading used by Form, Cap, Choose, and the catalogue. */
function officialHybridFiles() {
  const files: string[] = [];
  for (const row of selected) {
    const folder = `${row.archetypeId}-${row.candidateId}`;
    const name = `${row.continuationId}.json`;
    files.push(
      `data/experiments/criteria-hybrid/${folder}/${name}`,
      `data/experiments/criteria-hybrid-capped/${folder}/${name}`,
    );
    if (row.archetypeId === "inserted-horizontal-plate") {
      files.push(`data/experiments/criteria-hybrid-ihp-adapted/${folder}/${name}`);
    }
  }
  return files;
}

const hybridFiles = officialHybridFiles();

/** Files inside one reading tree that the Lab does not serve. */
function excludedExcept(directory: string, keep: Set<string>) {
  return listFiles(directory).filter((file) => !keep.has(file));
}

const hybridKeep = new Set(hybridFiles);

const nextConfig: NextConfig = {
  agentRules: false,
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  devIndicators: false,
  outputFileTracingIncludes: {
    "/lab/vertical": productionData,
    "/api/vertical/[[...path]]": productionData,
    "/api/vertical/z0": productionData,
    "/api/skill4/handoff": productionData,
    "/api/vertical/process-generation": generationFiles,
    "/api/vertical/process-form": formFiles,
    "/api/vertical/experiments/criteria-hybrid": hybridFiles,
  },
  outputFileTracingExcludes: {
    "*": [
      "data/**/*.png",
      "public/demo/**",
      "public/skill4/**",
      "public/shared-catalog/**",
      "public/assets/**",
      "public/references/**",
      "exports/**",
      "tmp/**",
      "config/**",
      "data/filament-cache/**",
      "data/analysis/**",
      "data/semantic-catalogs/**/previews/**",
      "data/semantic-catalogs/**/plates/**",
      "data/experiments/carved-mass/**",
      "data/experiments/criteria-hybrid-capped-audit/**",
      "data/experiments/criteria-hybrid-ihp-adapted-audit/**",
      ...excludedExcept("data/experiments/criteria-hybrid", hybridKeep),
      ...excludedExcept("data/experiments/criteria-hybrid-capped", hybridKeep),
      ...excludedExcept("data/experiments/criteria-hybrid-ihp-adapted", hybridKeep),
      "data/experiments/criteria-hybrid-shrinkwrapped/**",
      "data/experiments/criteria-hybrid-shrinkwrapped-audit/**",
      "data/experiments/criteria-hybrid-thickened/**",
      "data/experiments/criteria-hybrid-thickened-audit/**",
      "data/skill2/pareto-catalog/*/**",
      "data/skill3/published-lobby/**",
      ...excludedSolidified(),
    ],
    "/lab/vertical": [...generationFiles, ...formFiles, ...hybridFiles],
    "/api/vertical/[[...path]]": [...generationFiles, ...formFiles, ...hybridFiles],
    "...path": [...generationFiles, ...formFiles, ...hybridFiles],
    "/api/vertical/z0": [...generationFiles, ...formFiles, ...hybridFiles],
    "/api/vertical/experiments/criteria-hybrid": [...generationFiles, ...formFiles],
  },
};

export default nextConfig;
