import { readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { deleteClusterAssembly, readClusterAssemblyDocument, writeSelectedAssemblyId } from "@/lib/skill5/cluster-assemblies";
import { placeOccupancyRecord } from "@/lib/skill5/occupancy-actions";
import { readPublishedSelectedNetwork } from "@/lib/skill5/selected-site-network";
import { readDesignerZoning } from "@/lib/skill5/designer-zoning";
import { loadFinishedOccupancyMesh, loadSelectedAssemblyBuilding } from "@/lib/interpretation/selected-assembly";

const BASE = process.env.CHECKPOINT_BASE ?? "http://127.0.0.1:43141";
const PIPELINE = path.join(process.cwd(), "data", "skill5", "downstream-pipeline.json");
const ASSEMBLIES = path.join(process.cwd(), "data", "skill5", "cluster-assemblies.json");

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

function includesSkill6Trio(value: unknown) {
  const raw = JSON.stringify(value);
  return raw.includes("assembled-flat-self") || raw.includes("assembled-flat-plate") || raw.includes("assembled-rule-small-02");
}

async function main() {
  const pipelineBefore = readFileSync(PIPELINE, "utf8");
  const catalogBefore = readClusterAssemblyDocument();
  const generateBefore = readFileSync(path.join(process.cwd(), "lib", "interpretation", "generate.ts"), "utf8");
  const sourceBefore = readFileSync(path.join(process.cwd(), "lib", "interpretation", "source.ts"), "utf8");
  const analyzeBefore = readFileSync(path.join(process.cwd(), "lib", "interpretation", "analyze-building.ts"), "utf8");
  const opportunitiesBefore = readFileSync(path.join(process.cwd(), "lib", "interpretation", "opportunities.ts"), "utf8");
  const regionsBefore = readFileSync(path.join(process.cwd(), "lib", "interpretation", "regions.ts"), "utf8");
  const enclosureRouteBefore = readFileSync(path.join(process.cwd(), "app", "api", "pipeline", "enclosure", "route.ts"), "utf8");
  const slicingPageBefore = readFileSync(path.join(process.cwd(), "app", "lab", "slicing", "page.tsx"), "utf8");
  const drawingPageBefore = readFileSync(path.join(process.cwd(), "app", "lab", "drawing", "page.tsx"), "utf8");
  const renderingPageBefore = readFileSync(path.join(process.cwd(), "app", "lab", "rendering", "page.tsx"), "utf8");
  const created: string[] = [];
  try {
    writeSelectedAssemblyId(null);
    const none = await getJson(`${BASE}/api/interpretation/reading`) as {
      source?: { sourceReady?: boolean; geometryStatus?: string; assemblyId?: string | null };
      clusters?: unknown[];
      mode?: string;
    };
    results.A = none.source?.sourceReady === false && none.source?.geometryStatus === "no-source" && !none.source?.assemblyId && (none.clusters?.length ?? 0) === 0 && none.mode === "production" && !includesSkill6Trio(none)
      ? "No selected assembly → production reading is no-source"
      : `A failed ${JSON.stringify(none.source)}`;

    const network = readPublishedSelectedNetwork();
    const zoning = readDesignerZoning();
    const zone = zoning.regions.find((item) => item.networkId === network.massingNetworkId && item.kind === "lobby")
      ?? zoning.regions.find((item) => item.networkId === network.massingNetworkId);
    if (!zone) throw new Error("No designer zone on the selected network.");
    const catalog = await getJson(`${BASE}/api/skill4/finished-catalog?program=public-lobby&view=placement`) as { clusters?: { id: string }[] };
    const ranked = (catalog.clusters ?? []).filter((item) => loadFinishedOccupancyMesh("public-lobby", item.id));
    const clusterA = ranked[0]?.id;
    const clusterB = ranked[1]?.id;
    if (!clusterA || !clusterB) throw new Error("Need two ranked public-lobby clusters with stored meshes.");
    const meshA = loadFinishedOccupancyMesh("public-lobby", clusterA);
    const meshB = loadFinishedOccupancyMesh("public-lobby", clusterB);
    if (!meshA || !meshB) throw new Error("Finished occupancy meshes are missing.");
    const meshABefore = statSync(meshA.file).mtimeMs;
    const meshBBefore = statSync(meshB.file).mtimeMs;

    const occA = placeOccupancyRecord({
      zoneId: zone.id,
      programId: "public-lobby",
      finishedClusterId: clusterA,
      provenance: "manual",
      networkId: network.massingNetworkId,
    });
    const occB = placeOccupancyRecord({
      zoneId: zone.id,
      programId: "public-lobby",
      finishedClusterId: clusterB,
      provenance: "manual",
      transform: { ...occA.transform, rotationY: 90 },
      networkId: network.massingNetworkId,
    });

    const a01 = await sendJson(`${BASE}/api/site/cluster-assemblies`, "POST", {
      name: "Interpretation Phase 1 A01 (test)",
      selectedNetworkId: network.massingNetworkId,
      zoningSignature: occA.zoningSignature,
      occupancy: [occA],
      savedFrom: "placement",
    });
    const a02 = await sendJson(`${BASE}/api/site/cluster-assemblies`, "POST", {
      name: "Interpretation Phase 1 A02 (test)",
      selectedNetworkId: network.massingNetworkId,
      zoningSignature: occB.zoningSignature,
      occupancy: [occB],
      savedFrom: "placement",
    });
    created.push(String(a01.assemblyId), String(a02.assemblyId));

    await sendJson(`${BASE}/api/site/selected-assembly`, "PUT", { selectedAssemblyId: a01.assemblyId });
    const readingA = await getJson(`${BASE}/api/interpretation/reading`) as {
      source?: { assemblyId?: string; geometryStatus?: string; occupancy?: { occupancyId: string; finishedClusterId: string; transform: { rotationY: number } }[] };
      clusters?: { id: string; occupancy?: { finishedClusterId: string; transform: { rotationY: number } } }[];
      mode?: string;
      generatesGeometry?: boolean;
    };
    const adapterA = loadSelectedAssemblyBuilding();
    results.B = readingA.source?.assemblyId === a01.assemblyId && readingA.mode === "production" && adapterA?.role === "upstream" && adapterA.id === a01.assemblyId
      ? "Send A01 for Development → Interpretation reads A01"
      : `B failed ${JSON.stringify({ assembly: readingA.source?.assemblyId, role: adapterA?.role })}`;
    results.C = readingA.clusters?.length === 1
      && readingA.clusters[0]?.occupancy?.finishedClusterId === clusterA
      && adapterA?.clusters[0]?.occupancy?.finishedClusterId === clusterA
      && adapterA?.clusters.length === 1
      ? "A01 occupancy resolves the correct finished cluster"
      : `C failed ${JSON.stringify(readingA.clusters)}`;
    results.D = adapterA?.clusters[0]?.occupancy?.transform.rotationY === occA.transform.rotationY
      && adapterA.clusters[0].occupancy.transform.x === occA.transform.x
      && adapterA.clusters[0].occupancy.transform.z === occA.transform.z
      && adapterA.frame.axisConversionApplied === true
      && adapterA.placements[0]?.translation.every((value) => value === 0)
      ? "A01 site pose is preserved and yaw is baked (identity analysis translation)"
      : `D failed ${JSON.stringify(adapterA?.clusters[0]?.occupancy?.transform)}`;
    results.E = !includesSkill6Trio(readingA) && readingA.clusters?.[0]?.id !== "assembled-flat-self" && adapterA?.role === "upstream"
      ? "Reading uses the selected assembly, not the Skill 6 trio"
      : "E failed";

    await sendJson(`${BASE}/api/pipeline/interpretation`, "PUT");
    const stamped = await getJson(`${BASE}/api/pipeline/interpretation`) as { geometryStatus?: string; outputGeometryRef?: string | null; sourceAssemblyId?: string };
    await sendJson(`${BASE}/api/site/selected-assembly`, "PUT", { selectedAssemblyId: a02.assemblyId });
    const readingB = await getJson(`${BASE}/api/interpretation/reading`) as {
      source?: { assemblyId?: string; geometryStatus?: string };
      clusters?: { occupancy?: { finishedClusterId: string; transform: { rotationY: number } } }[];
    };
    const adapterB = loadSelectedAssemblyBuilding();
    const interpB = await getJson(`${BASE}/api/pipeline/interpretation`) as { sourceAssemblyId?: string; geometryStatus?: string; outputGeometryRef?: string | null };
    results.F = readingB.source?.assemblyId === a02.assemblyId && adapterB?.id === a02.assemblyId && adapterB.clusters[0]?.occupancy?.finishedClusterId === clusterB && adapterB.clusters[0]?.occupancy?.transform.rotationY === 90
      ? "Switching to A02 updates Interpretation without relying on the previous reading"
      : `F failed ${JSON.stringify(readingB.source)}`;
    results.G = interpB.sourceAssemblyId === a02.assemblyId && interpB.geometryStatus === "stale-source" && stamped.sourceAssemblyId === a01.assemblyId
      ? "A01 Interpretation stamp is stale after A02 selection"
      : `G failed ${JSON.stringify({ stamped, interpB })}`;
    results.H = typeof readingB.clusters?.[0]?.occupancy?.finishedClusterId === "string"
      && adapterB?.clusters.length === 1
      && adapterB.clusters[0].triangles > 0
      && readingB.source?.assemblyId === a02.assemblyId
      ? "Existing reading analysis still runs on A02 occupancy meshes"
      : `H failed ${JSON.stringify(readingB.clusters)}`;

    results.I = statSync(meshA.file).mtimeMs === meshABefore && statSync(meshB.file).mtimeMs === meshBBefore
      ? "Stored Skill 4 mesh files were not rewritten"
      : "I failed";
    results.J = adapterA?.clusters.length === 1 && adapterB?.clusters.length === 1
      && adapterA.clusters[0].id === occA.occupancyId
      && adapterB.clusters[0].id === occB.occupancyId
      ? "No merged mesh was created"
      : "J failed";
    results.K = interpB.outputGeometryRef == null && stamped.outputGeometryRef == null
      ? "outputGeometryRef remains null"
      : "K failed";

    const enclosure = await getJson(`${BASE}/api/pipeline/enclosure`) as { enclosure?: { validInput?: boolean; sourceInterpretationRevisionId?: string | null; status?: string } };
    let enclosureError = "";
    try {
      await sendJson(`${BASE}/api/pipeline/enclosure`, "PUT");
    } catch (error) {
      enclosureError = error instanceof Error ? error.message : "failed";
    }
    results.L = enclosure.enclosure?.validInput === false && !enclosure.enclosure?.sourceInterpretationRevisionId && /complete Current Integrated Architectural Model/i.test(enclosureError)
      ? "Enclosure does not treat the reading or revision stamp as a valid Integrated Architectural Model"
      : `L failed ${JSON.stringify({ enclosure: enclosure.enclosure, enclosureError })}`;

    const generateAfter = readFileSync(path.join(process.cwd(), "lib", "interpretation", "generate.ts"), "utf8");
    const sourceAfter = readFileSync(path.join(process.cwd(), "lib", "interpretation", "source.ts"), "utf8");
    const analyzeAfter = readFileSync(path.join(process.cwd(), "lib", "interpretation", "analyze-building.ts"), "utf8");
    const opportunitiesAfter = readFileSync(path.join(process.cwd(), "lib", "interpretation", "opportunities.ts"), "utf8");
    const regionsAfter = readFileSync(path.join(process.cwd(), "lib", "interpretation", "regions.ts"), "utf8");
    const enclosureRouteAfter = readFileSync(path.join(process.cwd(), "app", "api", "pipeline", "enclosure", "route.ts"), "utf8");
    const slicingAfter = readFileSync(path.join(process.cwd(), "app", "lab", "slicing", "page.tsx"), "utf8");
    const drawingAfter = readFileSync(path.join(process.cwd(), "app", "lab", "drawing", "page.tsx"), "utf8");
    const renderingAfter = readFileSync(path.join(process.cwd(), "app", "lab", "rendering", "page.tsx"), "utf8");
    results.M = generateAfter === generateBefore && sourceAfter === sourceBefore && analyzeAfter === analyzeBefore && opportunitiesAfter === opportunitiesBefore && regionsAfter === regionsBefore && enclosureRouteAfter === enclosureRouteBefore && slicingAfter === slicingPageBefore && drawingAfter === drawingPageBefore && renderingAfter === renderingPageBefore
      ? "Carving, analysis, and downstream lab scaffolds otherwise unchanged"
      : "M failed";

    for (const id of created) deleteClusterAssembly(id);
    writeSelectedAssemblyId(catalogBefore.selectedAssemblyId);
    writeFileSync(PIPELINE, pipelineBefore, "utf8");
    console.log(JSON.stringify({ a01: a01.assemblyId, a02: a02.assemblyId, clusterA, clusterB, results }, null, 2));
  } catch (error) {
    writeFileSync(PIPELINE, pipelineBefore, "utf8");
    writeFileSync(ASSEMBLIES, JSON.stringify(catalogBefore, null, 2) + "\n", "utf8");
    console.error(error instanceof Error ? error.stack ?? error.message : error);
    process.exitCode = 1;
  }
}

void main();
