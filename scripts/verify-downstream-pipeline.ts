import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { deleteClusterAssembly, readClusterAssemblyDocument, writeSelectedAssemblyId } from "@/lib/skill5/cluster-assemblies";
import { placeOccupancyRecord } from "@/lib/skill5/occupancy-actions";
import { readPublishedSelectedNetwork } from "@/lib/skill5/selected-site-network";
import { readDesignerZoning } from "@/lib/skill5/designer-zoning";
import { createDrawingFromSlice, createSliceDefinition, stampEnclosureRevision } from "@/lib/skill5/downstream-pipeline";
const BASE = process.env.CHECKPOINT_BASE ?? "http://127.0.0.1:43141";
const PIPELINE = path.join(process.cwd(), "data", "skill5", "downstream-pipeline.json");

async function getJson(url: string) {
  const response = await fetch(url, { cache: "no-store" });
  const body = await response.json() as Record<string, unknown>;
  if (!response.ok) throw new Error(`${url} ${response.status} ${JSON.stringify(body)}`);
  return body;
}

async function sendJson(url: string, method: string, body: unknown = {}) {
  const response = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await response.json() as Record<string, unknown>;
  if (!response.ok) throw new Error(`${url} ${response.status} ${JSON.stringify(payload)}`);
  return payload;
}

const results: Record<string, string> = {};

async function main() {
  const pipelineBefore = readFileSync(PIPELINE, "utf8");
  const catalogBefore = readClusterAssemblyDocument();
  const interpretationSource = readFileSync(path.join(process.cwd(), "lib", "interpretation", "source.ts"), "utf8");
  const interpretationGenerate = readFileSync(path.join(process.cwd(), "lib", "interpretation", "generate.ts"), "utf8");
  const rank = readFileSync(path.join(process.cwd(), "lib", "skill4", "cluster-placement-rank.ts"), "utf8");
  try {
    const map = readFileSync(path.join(process.cwd(), "lib", "site-map.ts"), "utf8");
    results.A = map.includes('label: "Cluster Placement"') && map.includes('label: "Cluster Assembly Catalog"') && map.indexOf("Cluster Placement") < map.indexOf("Cluster Assembly Catalog") && map.indexOf("Cluster Assembly Catalog") < map.indexOf("Tile Assembly")
      ? "Cluster Integration tabs are Placement → Catalog, then Tile Assembly"
      : "A failed";

    const network = readPublishedSelectedNetwork();
    const zoning = readDesignerZoning();
    const zone = zoning.regions.find((item) => item.networkId === network.massingNetworkId);
    if (!zone) throw new Error("No designer zone on the selected network.");
    const catalog = await getJson(`${BASE}/api/skill4/finished-catalog?program=public-lobby&view=placement`) as { clusters?: { id: string }[] };
    const clusterA = catalog.clusters?.[0]?.id;
    const clusterB = catalog.clusters?.[1]?.id;
    if (!clusterA || !clusterB) throw new Error("Need two ranked clusters.");
    const occA = placeOccupancyRecord({ zoneId: zone.id, programId: "public-lobby", finishedClusterId: clusterA, provenance: "manual", networkId: network.massingNetworkId });
    const occB = placeOccupancyRecord({ zoneId: zone.id, programId: "public-lobby", finishedClusterId: clusterB, provenance: "manual", transform: occA.transform, networkId: network.massingNetworkId });
    const a01 = await sendJson(`${BASE}/api/site/cluster-assemblies`, "POST", {
      name: "Pipeline A01",
      selectedNetworkId: network.massingNetworkId,
      zoningSignature: occA.zoningSignature,
      occupancy: [occA],
    });
    const a02 = await sendJson(`${BASE}/api/site/cluster-assemblies`, "POST", {
      name: "Pipeline A02",
      selectedNetworkId: network.massingNetworkId,
      zoningSignature: occB.zoningSignature,
      occupancy: [occB],
    });

    await sendJson(`${BASE}/api/site/selected-assembly`, "PUT", { selectedAssemblyId: a01.assemblyId });
    const interpA = await getJson(`${BASE}/api/pipeline/interpretation`);
    results.B = interpA.sourceAssemblyId === a01.assemblyId && interpA.legacyImplementation === "skill6-assembled" && interpA.legacyMatchesProductionSource === false && interpA.productionImplementation === "selected-assembly-reading" && interpA.geometryStatus === "source-ready"
      ? "A01 is Interpretation production source without claiming Skill 6"
      : "B failed";

    await sendJson(`${BASE}/api/site/selected-assembly`, "PUT", { selectedAssemblyId: a02.assemblyId });
    const interpB = await getJson(`${BASE}/api/pipeline/interpretation`);
    results.C = interpB.sourceAssemblyId === a02.assemblyId && interpB.status !== "current-source"
      ? "A02 updates Interpretation source immediately"
      : "C failed";
    results.D = interpB.legacyImplementation === "skill6-assembled" && interpB.legacyMatchesProductionSource === false && interpB.sourceAssemblyId === a02.assemblyId
      ? "Skill 6 implementation remains unlabeled as A02-derived"
      : "D failed";

    await sendJson(`${BASE}/api/pipeline/interpretation`, "PUT");
    const afterInterp = await getJson(`${BASE}/api/pipeline/enclosure`);
    const enclosure = afterInterp.enclosure as { sourceInterpretationRevisionId?: string | null; status?: string; validInput?: boolean; inputGeometryStatus?: string };
    results.E = enclosure.validInput === false && !enclosure.sourceInterpretationRevisionId && enclosure.inputGeometryStatus === "working"
      ? "Enclosure rejects a null-geometry Interpretation stamp"
      : `E failed ${JSON.stringify(enclosure)}`;

    let enclosurePut: { error?: string } | null = null;
    try {
      await sendJson(`${BASE}/api/pipeline/enclosure`, "PUT");
    } catch (error) {
      enclosurePut = { error: error instanceof Error ? error.message : "failed" };
    }
    results.F = enclosurePut?.error && /complete Current Integrated Architectural Model/i.test(enclosurePut.error)
      ? "Enclosure PUT refuses a revision stamp without output geometry"
      : `F failed ${JSON.stringify(enclosurePut)}`;

    createSliceDefinition({ name: "Plan cut", type: "horizontal" });
    const drawingBefore = createDrawingFromSlice("S01");
    let stampError: string | null = null;
    try {
      stampEnclosureRevision();
    } catch (error) {
      stampError = error instanceof Error ? error.message : "failed";
    }
    const afterModel = await getJson(`${BASE}/api/pipeline`);
    const slicing = afterModel.slicing as { slices?: { sliceId: string; status: string }[] };
    const rendering = afterModel.rendering as { sourceFinalModelRevisionId?: string | null; siteContext?: { path?: string } };
    const drawing = afterModel.drawing as { drawings?: { drawingId: string; status: string }[] };
    const site = afterModel.siteContext as { path?: string };
    results.G = Boolean(stampError) && slicing.slices?.[0]?.status === "no-source" && !rendering.sourceFinalModelRevisionId
      ? "Enclosure stamp remains blocked and slices have no valid Final Enclosed Model"
      : `G failed ${JSON.stringify({ stampError, slicing: slicing.slices, rendering })}`;
    results.H = drawing.drawings?.[0]?.status === "no-source" && drawingBefore.drawing.drawings[0]?.drawingId === drawing.drawings?.[0]?.drawingId
      ? "Drawing records are preserved without a valid Final Enclosed Model"
      : `H failed ${JSON.stringify({ drawing: drawing.drawings, before: drawingBefore.drawing.drawings })}`;
    results.I = rendering.siteContext?.path === "data/skill5/herald-site.json" && site.path === "data/skill5/herald-site.json"
      ? "Drawing and Rendering share herald-site.json"
      : "I failed";

    const reloadInterp = await getJson(`${BASE}/api/pipeline/interpretation`);
    const reloadModel = await getJson(`${BASE}/api/pipeline/final-model`);
    results.J = reloadInterp.sourceAssemblyId === a02.assemblyId && reloadInterp.geometryStatus === "working" && !reloadModel.modelRevisionId
      ? "Disk-backed Interpretation source survives re-GET without a fake enclosed model"
      : `J failed ${JSON.stringify({ reloadInterp, reloadModel })}`;

    const interpretationSourceAfter = readFileSync(path.join(process.cwd(), "lib", "interpretation", "source.ts"), "utf8");
    const interpretationGenerateAfter = readFileSync(path.join(process.cwd(), "lib", "interpretation", "generate.ts"), "utf8");
    const rankAfter = readFileSync(path.join(process.cwd(), "lib", "skill4", "cluster-placement-rank.ts"), "utf8");
    results.K = interpretationSourceAfter === interpretationSource && interpretationGenerateAfter === interpretationGenerate && rankAfter === rank
      ? "Interpretation generate/source and ranking files unchanged"
      : "K failed";

    deleteClusterAssembly(String(a01.assemblyId));
    deleteClusterAssembly(String(a02.assemblyId));
    writeSelectedAssemblyId(catalogBefore.selectedAssemblyId);
    writeFileSync(PIPELINE, pipelineBefore, "utf8");
    console.log(JSON.stringify({ a01: a01.assemblyId, a02: a02.assemblyId, results }, null, 2));
  } catch (error) {
    writeFileSync(PIPELINE, pipelineBefore, "utf8");
    writeSelectedAssemblyId(catalogBefore.selectedAssemblyId);
    console.error(error instanceof Error ? error.stack ?? error.message : error);
    process.exitCode = 1;
  }
}

void main();
