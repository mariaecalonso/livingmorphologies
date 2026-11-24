import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { DESIGNER_AUTHORITIES, HUMAN_AUTHORED_INPUTS, HUMAN_CHECKPOINTS, IMPLEMENTATION_EDGES, WORKFLOW_EDGES, WORKFLOW_IMPLEMENTATION_DETAILS, WORKFLOW_STAGES, computationalGraphMermaid, implementationGraphMermaid, navigationHierarchyMermaid } from "@/lib/computational-workflow";
import { PUBLICATION_SOURCES, publicationGraphMermaid } from "@/lib/publication-sources";
import { INTERPRETATION_LAB_CONTRACT, ENCLOSURE_LAB_CONTRACT, DRAWING_LAB_CONTRACT, SITE_CONTEXT_SOURCE } from "@/lib/lab-contracts";
import { readFinalSelection } from "@/lib/skill3/final-selection";
import { rankCompatibleFaces } from "@/lib/skill4/cluster-face-pair";
import { rankProgramClusters } from "@/lib/skill4/cluster-placement-rank";
import { loadClientActivitiesDocument } from "@/lib/skill5/load-client-documents";
import { readPublishedSelectedNetwork } from "@/lib/skill5/selected-site-network";
import { readDownstreamPipelineFile } from "@/lib/skill5/downstream-pipeline";
import { CLUSTER_PROGRAMS } from "@/lib/skill4/program-tiles";
import type { FinishedProgram } from "@/lib/skill4/finished-catalog";

const ROOT = process.cwd();
const BASE = process.env.CHECKPOINT_BASE ?? "http://127.0.0.1:43141";
const results: Record<string, string> = {};

function read(rel: string) {
  return readFileSync(path.join(ROOT, rel), "utf8");
}

function pass(id: string, note: string) {
  results[id] = note;
}

function fail(id: string, reason: string) {
  results[id] = `FAIL: ${reason}`;
}

function importsOf(file: string, needle: string) {
  return read(file).includes(needle);
}

const requiredStageIds = [
  "typology-analysis",
  "physarum-logic",
  "optimization",
  "selected-2d",
  "vertical-propagation",
  "selected-3d",
  "initial-cluster",
  "hybrid-cluster",
  "client",
  "finished-program-clusters",
  "site-model",
  "site-analysis",
  "verified-site-analysis-conclusions",
  "site-strategy",
  "selected-site-network",
  "designer-zoning",
  "cluster-placement",
  "cluster-assembly-catalog",
  "selected-assembly-for-development",
  "interpretation",
  "current-integrated-architectural-model",
  "enclosure",
  "final-enclosed-model",
  "slicing",
  "drawing",
  "rendering",
];
const hiddenFromMethodology = ["skill6-compatibility", "hybrid-connectable", "zone-occupancy", "site-strategy-inputs"];
const requiredDetails = ["skill6-compatibility", "hybrid-connectable", "zone-occupancy"];

const stageIds = WORKFLOW_STAGES.map((item) => item.id);
const detailIds = WORKFLOW_IMPLEMENTATION_DETAILS.map((item) => item.id);
if (
  requiredStageIds.every((id) => stageIds.includes(id))
  && hiddenFromMethodology.every((id) => !stageIds.includes(id))
  && requiredDetails.every((id) => detailIds.includes(id))
  && WORKFLOW_STAGES.every((item) => item.layer === "methodology")
) {
  pass("registry", "Methodology stages named; compatibility, hybrid-connectable, and occupancy kept as implementation details");
} else {
  fail("registry", `Missing ${requiredStageIds.filter((id) => !stageIds.includes(id)).join(",")} hidden=${hiddenFromMethodology.filter((id) => stageIds.includes(id)).join(",")} details=${detailIds.join(",")}`);
}

const selections = JSON.parse(read("data/skill2/pareto-catalog/selections.json")) as Record<string, unknown>;
const pickCount = Object.keys(selections).length;
const verticalUses2d = importsOf("lib/server-routes/vertical.ts", "data/skill2/pareto-catalog/selections.json")
  && importsOf("components/vertical-catalogue.tsx", "data/skill2/pareto-catalog/selections.json");
if (pickCount === 15 && verticalUses2d) {
  pass("A", `Final 2D disk checkpoint has ${pickCount} picks and feeds Vertical Propagation`);
} else fail("A", `A failed picks=${pickCount} vertical=${verticalUses2d}`);

const final = readFinalSelection();
const skill4Handoff = read("lib/skill4/skill3-handoff.ts");
const skill6Source = read("lib/skill6/source.ts");
if (
  final.selections.length === 15
  && skill4Handoff.includes("readFinalSelection")
  && skill4Handoff.includes("loadSkill3HandoffRecords")
  && skill6Source.includes("readFinalSelection")
) {
  pass("B", `Final 3D disk checkpoint has ${final.selections.length} modules and feeds Skill 4 / Skill 6`);
} else fail("B", `B failed final=${final.selections.length}`);

const assembledNotInterpretation = !read("lib/interpretation/selected-assembly.ts").includes("classifyStoredClusters")
  && !read("lib/interpretation/selected-assembly.ts").includes("assembled-flat-self")
  && read("lib/interpretation/reading-view.ts").includes("loadSelectedAssemblyBuilding")
  && read("lib/interpretation/building.ts").includes("TEMPORARY_CLUSTER_IDS");
const pair = rankCompatibleFaces("vertical-void", "stepped-amphitheater");
const hybridConnectable = read("lib/skill4/cluster-face-pair.ts").includes("readHybridConnectable")
  && read("lib/skill4/cluster-face-pair.ts").includes("readCompatibility");
const catalogStoreNotInProgram = !read("lib/skill4/program-cluster.ts").includes("catalog-store")
  && !read("lib/skill4/generate-finished-catalog.ts").includes("catalog-store");
const finishedUsesHybrid = read("lib/skill4/generate-finished-catalog.ts").includes("connectClusterHybrid")
  && read("lib/skill4/program-cluster.ts").includes("rankCompatibleFaces");
if (assembledNotInterpretation && pair.length >= 0 && hybridConnectable && catalogStoreNotInProgram && finishedUsesHybrid) {
  pass("C", "Finished Program Clusters use Hybrid Cluster machinery (connectClusterHybrid + rankCompatibleFaces); Skill 6 assembled catalog is not Interpretation production");
} else fail("C", `C failed assembled=${assembledNotInterpretation} hybridConnectable=${hybridConnectable} finishedUsesHybrid=${finishedUsesHybrid}`);

const hybridSystemToFinished = WORKFLOW_EDGES.some((edge) => edge.from === "hybrid-cluster" && edge.to === "finished-program-clusters" && edge.kind === "implemented-production");
if (hybridSystemToFinished && catalogStoreNotInProgram && hybridConnectable) {
  pass("D", "Hybrid Cluster SYSTEM feeds Finished Program Clusters; browser catalog-store is not consumed");
} else fail("D", "D failed: Hybrid Cluster system/catalog relationship is wrong");

const generationUsesClient = read("lib/skill4/program-cluster.ts").includes("loadClientActivitiesRecord")
  && read("lib/skill4/program-cluster.ts").includes("loadArchitecturalDnaRecord")
  && read("lib/skill4/program-cluster.ts").includes("rankedEligibleTiles")
  && read("lib/skill4/program-cluster.ts").includes("spacingProfile");
const rankingUsesClient = read("app/api/skill4/finished-catalog/route.ts").includes("loadClientActivitiesDocument")
  && read("lib/skill4/cluster-placement-rank.ts").includes("rankProgramClusters");
const clientNotInHybridPairing = !read("lib/skill4/cluster-face-pair.ts").includes("loadClient")
  && !read("lib/skill5/strategy-layouts.ts").includes("loadClient")
  && !read("lib/skill5/designer-zoning.ts").includes("loadClient");
if (generationUsesClient && rankingUsesClient && clientNotInHybridPairing) {
  pass("E", "Client/DNA used in finished-cluster generation (eligibility, spacing, hashes) and live Placement ranking; not Hybrid pairing, Strategy, or Zoning");
} else fail("E", "E failed client dependency mismatch");

const analysisBundleImporters = [
  "lib/skill5/strategy-layouts.ts",
  "components/site/site-network-candidates.ts",
  "lib/skill5/architectural-strategy.ts",
  "components/site/run-autonomous-strategy.ts",
].filter((file) => existsSync(path.join(ROOT, file)) && read(file).includes("readSiteAnalysisBundle"));
const strategyUsesFrozen = read("lib/skill5/strategy-layouts.ts").includes("site-inputs-v1.json")
  && read("components/site/site-network-candidates.ts").includes("site-inputs-v1.json");
const noAnalysisToStrategy = !WORKFLOW_EDGES.some((edge) => edge.from === "site-analysis" && edge.to === "site-strategy");
const analysisToConclusions = WORKFLOW_EDGES.some((edge) => edge.from === "site-analysis" && edge.to === "verified-site-analysis-conclusions");
const conclusionsToStrategy = WORKFLOW_EDGES.some((edge) => edge.from === "verified-site-analysis-conclusions" && edge.to === "site-strategy");
if (analysisBundleImporters.length === 0 && strategyUsesFrozen && noAnalysisToStrategy && analysisToConclusions && conclusionsToStrategy) {
  pass("F", "Site Analysis → verified site-inputs-v1.json → Site Strategy; live Analysis bundle is not a Strategy runtime input");
} else fail("F", `F failed importers=${analysisBundleImporters.join(",")}`);

const published = readPublishedSelectedNetwork();
const zoningUsesNetwork = read("lib/skill5/designer-zoning.ts").includes("networkId")
  && read("lib/skill5/occupancy-actions.ts").includes("massingNetworkId");
const placementUsesNetwork = read("lib/skill5/cluster-assembly.ts").includes("massingNetworkId");
if (published.massingNetworkId && zoningUsesNetwork && placementUsesNetwork && !read("lib/skill5/occupancy-actions.ts").includes("readSiteAnalysisBundle")) {
  pass("G", `Selected Network ${published.massingNetworkId} is the Strategy checkpoint consumed by Zoning/Placement`);
} else fail("G", "G failed selected-network consumption");

const programsDir = path.join(ROOT, "data", "skill4", "finished-programs");
const testDir = path.join(ROOT, "data", "skill4", "differentiation-test", "programs");
const productionIds: string[] = [];
for (const name of readdirSync(programsDir).filter((item) => item.endsWith(".json"))) {
  const program = JSON.parse(readFileSync(path.join(programsDir, name), "utf8")) as FinishedProgram;
  for (const item of program.iterations) productionIds.push(item.id);
}
const testIds: string[] = [];
if (existsSync(testDir)) {
  for (const name of readdirSync(testDir).filter((item) => item.endsWith(".json"))) {
    const program = JSON.parse(readFileSync(path.join(testDir, name), "utf8")) as FinishedProgram;
    program.iterations.forEach((item, index) => {
      testIds.push(`${program.programId}:test-${index}`);
    });
  }
}
const sourceLoader = read("lib/skill5/finished-cluster-source.ts");
const catalogRoute = read("app/api/skill4/finished-catalog/route.ts");
const productionOnly = !sourceLoader.includes("differentiation-test")
  && catalogRoute.includes('includeTest") === "1"')
  && productionIds.every((id) => !id.includes(":test-"));
if (productionOnly) {
  pass("H", `Production finished clusters ${productionIds.length}; excluded test ids ${testIds.length} (${testIds.slice(0, 6).join(", ")}…)`);
} else fail("H", `H failed production=${productionIds.length} test=${testIds.length}`);

const lobbyFile = path.join(programsDir, "public-lobby.json");
const lobby = JSON.parse(readFileSync(lobbyFile, "utf8")) as FinishedProgram;
const rank = rankProgramClusters(lobby.programId, lobby.name, lobby.iterations, loadClientActivitiesDocument());
const rankedIds = rank.clusters.map((item) => item.id);
const noTestInRank = rankedIds.every((id) => !id.includes(":test-"));
const recommended = rank.clusters.some((item) => item.recommended);
if (noTestInRank && recommended && rank.clusters.length === lobby.iterations.length && CLUSTER_PROGRAMS.length === 12) {
  pass("I", `Placement ranks ${rank.clusters.length} production ${lobby.programId} clusters; recommended=${rank.clusters.find((item) => item.recommended)?.id}`);
} else fail("I", `I failed count=${rank.clusters.length} noTest=${noTestInRank} recommended=${recommended}`);

const adapter = read("lib/interpretation/selected-assembly.ts");
const readingRoute = read("app/api/interpretation/reading/route.ts");
if (
  adapter.includes("architectural-interpretation-selected-assembly-v1")
  && adapter.includes("(x, y, z)")
  && readingRoute.includes("buildProductionReadingView")
  && INTERPRETATION_LAB_CONTRACT.output.implemented === "partial"
) {
  pass("J-static", "Phase 1 adapter and reading route remain in place");
} else fail("J-static", "J-static failed");

const authorityFiles = [
  "data/skill3/final-selection.json",
  "data/skill2/pareto-catalog/selections.json",
  "data/skill5/herald-site.json",
  "data/skill5/designer-zoning.json",
  "data/skill5/cluster-assemblies.json",
  "data/skill5/client-activities.json",
  "data/skill5/architectural-dna.json",
];
const before = Object.fromEntries(authorityFiles.map((file) => [file, statSync(path.join(ROOT, file)).mtimeMs]));
const lobbyCache = path.join(ROOT, "data", "skill3", "published-lobby");
const lobbyBefore = existsSync(lobbyCache)
  ? readdirSync(lobbyCache).map((name) => `${name}:${statSync(path.join(lobbyCache, name)).mtimeMs}`).join("|")
  : "";
const verticalNoWrite = !read("lib/server-routes/vertical.ts").includes("writeFile")
  && !read("lib/server-routes/vertical.ts").includes("rememberLobbyBundle")
  && read("lib/server-routes/vertical.ts").includes("GET handlers must not write");
if (!verticalNoWrite) fail("K-static", "vertical GET still has a write path");

const sourcesOk = PUBLICATION_SOURCES.length > 0
  && PUBLICATION_SOURCES.every((item) => item.mayWrite === false && typeof item.consumedByWebsite === "boolean")
  && ["live", "published-snapshot", "demo", "legacy"].every((kind) => PUBLICATION_SOURCES.some((item) => item.class === kind));
if (sourcesOk) pass("L", `${PUBLICATION_SOURCES.length} publication sources, all mayWrite=false, four classes present`);
else fail("L", "L failed publication convention");

const pipeline = readDownstreamPipelineFile();
const futureNotFake = ENCLOSURE_LAB_CONTRACT.output.implemented === "not-implemented"
  && DRAWING_LAB_CONTRACT.output.implemented === "not-implemented"
  && pipeline.interpretation.outputGeometryRef === null
  && pipeline.enclosure.finalEnclosedModelRef === null
  && pipeline.finalEnclosedModel.geometryRef === null
  && WORKFLOW_EDGES.filter((edge) => edge.kind === "declared-contract").length > 0
  && !WORKFLOW_EDGES.some((edge) => edge.kind === "implemented-production" && edge.to === "enclosure");
if (futureNotFake) pass("M", "Future contracts remain declared, not implemented production geometry");
else fail("M", "M failed future contracts look implemented");

const siteShared = SITE_CONTEXT_SOURCE.consumers.includes("site-analysis")
  && SITE_CONTEXT_SOURCE.consumers.includes("site-strategy")
  && SITE_CONTEXT_SOURCE.consumers.includes("cluster-placement")
  && SITE_CONTEXT_SOURCE.consumers.includes("drawing")
  && SITE_CONTEXT_SOURCE.consumers.includes("rendering")
  && DRAWING_LAB_CONTRACT.methodologyNote?.includes("supporting")
  && WORKFLOW_EDGES.some((edge) => edge.from === "site-model" && edge.to === "cluster-placement" && edge.kind === "supporting-input");
if (siteShared) pass("site-model", "Authoritative Site Model is shared Analysis / Strategy / Placement / Drawing / Rendering context");
else fail("site-model", "site-model consumers incomplete");

const expectedCheckpoints = [
  "selected-2d",
  "selected-3d",
  "selected-site-network",
  "selected-assembly-for-development",
  "final-enclosed-model",
];
const checkpoints = HUMAN_CHECKPOINTS.join(",");
const checkpointSet = HUMAN_CHECKPOINTS as readonly string[];
if (checkpoints === expectedCheckpoints.join(",") && !checkpointSet.includes("typology-analysis") && !checkpointSet.includes("client") && !checkpointSet.includes("designer-zoning")) {
  pass("checkpoints", "Explicit checkpoint list is selected 2D, selected 3D, selected Site Network, Selected Assembly, future Final Enclosed Model");
} else fail("checkpoints", checkpoints);

function stageOf(id: string) {
  return WORKFLOW_STAGES.find((item) => item.id === id);
}
const initial = stageOf("initial-cluster");
const hybrid = stageOf("hybrid-cluster");
const connectable = WORKFLOW_IMPLEMENTATION_DETAILS.find((item) => item.id === "hybrid-connectable");
const occupancy = WORKFLOW_IMPLEMENTATION_DETAILS.find((item) => item.id === "zone-occupancy");
const compatibility = WORKFLOW_IMPLEMENTATION_DETAILS.find((item) => item.id === "skill6-compatibility");
const typology = stageOf("typology-analysis");
const client = stageOf("client");
const zoning = stageOf("designer-zoning");
const siteAnalysisEdge = WORKFLOW_EDGES.find((edge) => edge.from === "site-model" && edge.to === "site-analysis");
const plates = PUBLICATION_SOURCES.find((item) => item.id === "presentation-plates-unused");
const mermaid = computationalGraphMermaid();
const implMermaid = implementationGraphMermaid();
const pubMermaid = publicationGraphMermaid();
if (
  initial?.role === "algorithm"
  && initial.checkpoint === false
  && WORKFLOW_EDGES.some((edge) => edge.from === "selected-3d" && edge.to === "initial-cluster" && edge.kind === "implemented-production")
  && WORKFLOW_EDGES.some((edge) => edge.from === "initial-cluster" && edge.to === "hybrid-cluster")
  && compatibility?.parentStage === "initial-cluster"
  && !mermaid.includes("Skill 6 compatibility")
) {
  pass("sem-A", "Initial Cluster is the Skill 6 clustering system on the production spine; compatibility is internal");
} else fail("sem-A", "Initial Cluster classification is wrong");
if (
  hybrid?.displayName === "Hybrid Cluster"
  && hybrid.role === "algorithm"
  && hybridSystemToFinished
  && catalogStoreNotInProgram
  && hybrid.note?.includes("catalog")
) {
  pass("sem-B", "Hybrid Cluster SYSTEM is production; browser catalog is not consumed");
} else fail("sem-B", `Hybrid Cluster classification is wrong (${hybrid?.displayName} ${hybrid?.role})`);
if (
  compatibility?.layer === "implementation-detail"
  && IMPLEMENTATION_EDGES.some((edge) => edge.from === "skill6-compatibility" && edge.to === "hybrid-cluster")
  && hybridConnectable
  && read("lib/skill6/engines/pool.ts").includes('source: "compatibility"')
) {
  pass("sem-C", "Compatibility / pair-pose is internal Initial Cluster infrastructure used by Hybrid Cluster pairing");
} else fail("sem-C", "Skill 6 compatibility detail edges are wrong");
if (typology?.role === "human-input" && typology.checkpoint === false && client?.role === "human-input" && client.checkpoint === false && HUMAN_AUTHORED_INPUTS.join(",") === "typology-analysis,client") {
  pass("sem-D", "Typology and Client are human-authored authoritative inputs, not checkpoints");
} else fail("sem-D", "Typology/Client classification is wrong");
if (zoning?.role === "designer-authority" && zoning.checkpoint === false && DESIGNER_AUTHORITIES.join(",") === "designer-zoning") {
  pass("sem-E", "Designer Zoning is durable designer-authored authority");
} else fail("sem-E", "Designer Zoning classification is wrong");
if (siteAnalysisEdge?.kind === "implemented-production") {
  pass("sem-G", "Site Model → Site Analysis is implemented computation");
} else fail("sem-G", `Site Analysis edge is ${siteAnalysisEdge?.kind}`);
if (
  connectable?.role === "derived-cache"
  && connectable.layer === "implementation-detail"
  && IMPLEMENTATION_EDGES.filter((edge) => edge.from === "hybrid-connectable" || edge.to === "hybrid-connectable").every((edge) => edge.kind === "derived-cache")
  && !mermaid.includes("hybrid-connectable")
  && occupancy?.layer === "implementation-detail"
  && !mermaid.includes("Zone Occupancy")
  && implMermaid.includes("PlacedCluster")
) {
  pass("sem-I", "hybrid-connectable and occupancy are implementation details, not methodology stages");
} else fail("sem-I", `hybrid-connectable role=${connectable?.role} occupancy=${occupancy?.layer}`);
if (plates?.consumedByWebsite === false && plates.class === "legacy" && !pubMermaid.includes("presentation-plates-unused --> website")) {
  pass("sem-J", "presentation.plates is legacy/orphaned with no Website consumption arrow");
} else fail("sem-J", "presentation.plates still implies Website consumption");
if (hybrid?.displayName === "Hybrid Cluster" && mermaid.includes("Hybrid Cluster") && !WORKFLOW_STAGES.some((item) => item.displayName === "Hybrid Connection")) {
  pass("sem-M", "Current workflow terminology uses Hybrid Cluster");
} else fail("sem-M", "Hybrid Connection still used as a current stage name");

async function get(url: string) {
  const response = await fetch(url, { cache: "no-store" });
  return { ok: response.ok, status: response.status, body: await response.text() };
}

async function main() {
  try {
    const home = await get(`${BASE}/`);
    const vertical = await get(`${BASE}/api/vertical?archetype=vertical-void&candidate=351`);
    const resultsPage = await get(`${BASE}/#results`);
    const placement = await get(`${BASE}/api/skill4/finished-catalog?program=public-lobby&view=placement`);
    const workflow = await get(`${BASE}/api/pipeline/workflow`);
    const publication = await get(`${BASE}/api/pipeline/publication`);
    const after = Object.fromEntries(authorityFiles.map((file) => [file, statSync(path.join(ROOT, file)).mtimeMs]));
    const mutated = authorityFiles.filter((file) => after[file] !== before[file]);
    const lobbyAfter = existsSync(lobbyCache)
      ? readdirSync(lobbyCache).map((name) => `${name}:${statSync(path.join(lobbyCache, name)).mtimeMs}`).join("|")
      : "";
    if (home.ok && vertical.ok && resultsPage.ok && workflow.ok && publication.ok && mutated.length === 0 && lobbyAfter === lobbyBefore && verticalNoWrite) {
      pass("K", "Website/Lab GETs did not mutate production Lab authorities or published-lobby");
    } else {
      fail("K", `K failed mutated=${mutated.join(",") || "none"} lobbyChanged=${lobbyAfter !== lobbyBefore} home=${home.status} vertical=${vertical.status} results=${resultsPage.status} workflow=${workflow.status} publication=${publication.status} verticalNoWrite=${verticalNoWrite}`);
    }
    const ranked = JSON.parse(placement.body) as { clusters?: { id: string }[] };
    const liveIds = ranked.clusters?.map((item) => item.id) ?? [];
    if (placement.ok && liveIds.length === 10 && liveIds.every((id) => !id.includes(":test-"))) {
      pass("I-http", `Live Placement ranking returns ${liveIds.length} production public-lobby clusters`);
    } else fail("I-http", `I-http failed ${liveIds.join(",")}`);
  } catch (error) {
    fail("K", `HTTP verification failed: ${error instanceof Error ? error.message : error}`);
  }

  const phase1 = spawnSync("npx", ["tsx", "scripts/verify-interpretation-phase1.ts"], {
    cwd: ROOT,
    encoding: "utf8",
    shell: true,
    env: { ...process.env, CHECKPOINT_BASE: BASE },
    timeout: 180000,
  });
  const phase1Out = `${phase1.stdout ?? ""}${phase1.stderr ?? ""}`;
  if (phase1.status === 0 && !/failed/i.test(phase1Out)) {
    pass("J", "Selected Assembly → Interpretation Phase 1 still passes");
  } else {
    fail("J", `Phase 1 verify exit ${phase1.status}: ${phase1Out.slice(-800) || phase1.error?.message || "no output"}`);
  }

  const geometryTouched = spawnSync("git", ["diff", "--name-only", "--", "data/skill4/finished", "data/skill6/assembled", "data/skill5/herald-site.json", "data/experiments/carved-mass-solidified"], {
    cwd: ROOT,
    encoding: "utf8",
  });
  const names = (geometryTouched.stdout ?? "").trim();
  if (!names) pass("N", "No stored coordinate system or source mesh was rewritten this pass (pre-existing dirty files outside those trees are retained)");
  else fail("N", `N failed dirty geometry files: ${names}`);

  const failed = Object.entries(results).filter(([, value]) => value.startsWith("FAIL:"));
  console.log(JSON.stringify({
    results,
    failed: failed.length,
    productionClusterCount: productionIds.length,
    excludedTestIds: testIds,
    mermaid: {
      computational: computationalGraphMermaid(),
      implementation: implementationGraphMermaid(),
      publication: publicationGraphMermaid(),
      navigation: navigationHierarchyMermaid(),
    },
  }, null, 2));
  if (failed.length) process.exitCode = 1;
}

void main();
