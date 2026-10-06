/**
 * Copies one finished Lobby catalog into the clean publishing worktree and pushes it.
 * Never stages unrelated files. Never force-pushes.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { loadSemanticRun } from "../lib/skill2/semantic/lobby-run";
import {
  blockedCatalogRecord,
  buildPublishedCatalog,
  publicationProblems,
  writePublishedCatalog,
  type CatalogIndex,
  type PublishedCatalogStatus,
} from "../lib/skill2/semantic/publish-catalog";

export function publishLobbyCatalog(options: { archetypeId: string; publishRoot: string; status: PublishedCatalogStatus }) {
  const run = loadSemanticRun(options.archetypeId);
  if (!run) throw new Error(`no local semantic run for ${options.archetypeId}`);
  if (options.status === "complete") {
    const problems = publicationProblems(run);
    if (problems.length) throw new Error(problems.join("; "));
  }
  syncPublishingBranch(options.publishRoot);
  const catalog = options.status === "complete" ? buildPublishedCatalog(run) : blockedCatalogRecord(run);
  const directory = join(options.publishRoot, "data", "semantic-catalogs", options.archetypeId);
  const previewSource = join("data", "semantic-runs", options.archetypeId, "previews");
  writePublishedCatalog(catalog, directory, options.status === "complete" ? previewSource : undefined);
  updateIndex(options.publishRoot, catalog);
  const paths = options.status === "complete"
    ? [`data/semantic-catalogs/${options.archetypeId}`, "data/semantic-catalogs/index.json"]
    : ["data/semantic-catalogs/index.json"];
  git(options.publishRoot, ["add", "--", ...paths]);
  const staged = git(options.publishRoot, ["diff", "--cached", "--name-only"]).split(/\r?\n/).filter(Boolean);
  const allowed = staged.every((file) => file === "data/semantic-catalogs/index.json" || file.startsWith(`data/semantic-catalogs/${options.archetypeId}/`));
  if (!staged.length || !allowed) {
    throw new Error(`refusing to commit unexpected files: ${staged.join(", ") || "(none)"}`);
  }
  const name = options.archetypeId.replace(/-/g, " ");
  const message = options.status === "complete" ? `data(skill2): publish ${name} catalog` : `data(skill2): record blocked ${name} catalog`;
  git(options.publishRoot, ["commit", "-m", message]);
  git(options.publishRoot, ["push", "origin", "HEAD:main"]);
  return staged;
}

function updateIndex(publishRoot: string, catalog: ReturnType<typeof buildPublishedCatalog>) {
  const indexPath = join(publishRoot, "data", "semantic-catalogs", "index.json");
  const index: CatalogIndex = existsIndex(indexPath)
    ? (JSON.parse(readFileSync(indexPath, "utf8")) as CatalogIndex)
    : { bundle: "lobby-semantic-catalog-v1", archetypes: {} };
  index.archetypes[catalog.archetypeId] = {
    status: catalog.status,
    fidelity: catalog.fidelity.status,
    warnings: catalog.fidelity.warnings,
    blocks: catalog.status === "blocked" ? catalog.fidelity.blocks : [],
    catalogCandidates: catalog.candidates.length,
  };
  mkdirSync(join(publishRoot, "data", "semantic-catalogs"), { recursive: true });
  writeFileSync(indexPath, JSON.stringify(index, null, 2));
}

function existsIndex(path: string) {
  try {
    readFileSync(path, "utf8");
    return true;
  } catch {
    return false;
  }
}

function syncPublishingBranch(publishRoot: string) {
  git(publishRoot, ["fetch", "origin", "main"]);
  const head = git(publishRoot, ["rev-parse", "HEAD"]);
  const origin = git(publishRoot, ["rev-parse", "origin/main"]);
  if (head === origin) return;
  try {
    git(publishRoot, ["merge", "--ff-only", "origin/main"]);
  } catch {
    throw new Error("origin/main moved and cannot be fast-forwarded into the publishing worktree. Publishing stopped.");
  }
}

function git(cwd: string, args: string[]) {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}
