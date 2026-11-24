import { readFileSync } from "node:fs";
import path from "node:path";
import { deleteClusterAssembly, readClusterAssembly, readClusterAssemblyDocument, writeSelectedAssemblyId } from "@/lib/skill5/cluster-assemblies";
import { readDesignerZoning } from "@/lib/skill5/designer-zoning";
import { readDevelopmentCheckpoint } from "@/lib/skill5/development-checkpoint";
import { placeOccupancyRecord } from "@/lib/skill5/occupancy-actions";
import { replaceZoneOccupancy } from "@/lib/skill5/placed-cluster";
import { readPublishedSelectedNetwork } from "@/lib/skill5/selected-site-network";

const BASE = process.env.CHECKPOINT_BASE ?? "http://127.0.0.1:43141";

type Rank = { programId: string; clusters: { id: string; recommended?: boolean }[] };

async function getJson(url: string) {
  const response = await fetch(url, { cache: "no-store" });
  const body = await response.json() as Record<string, unknown>;
  if (!response.ok) throw new Error(`${url} ${response.status} ${JSON.stringify(body)}`);
  return body;
}

async function sendJson(url: string, method: string, body: unknown) {
  const response = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await response.json() as Record<string, unknown>;
  if (!response.ok) throw new Error(`${url} ${response.status} ${JSON.stringify(payload)}`);
  return payload;
}

function fingerprint(value: unknown) {
  return JSON.stringify(value);
}

const results: Record<string, string> = {};

async function main() {
try {
  const networkBefore = readPublishedSelectedNetwork();
  const zoningBefore = readDesignerZoning();
  const configurationsBefore = readFileSync(path.join(process.cwd(), "data", "skill5", "configurations.json"), "utf8");
  const interpretationBefore = readFileSync(path.join(process.cwd(), "lib", "interpretation", "source.ts"), "utf8");
  const catalogBefore = readClusterAssemblyDocument();

  const rank = await getJson(`${BASE}/api/skill4/finished-catalog?program=public-lobby&view=placement`) as Rank;
  if (!rank.clusters || rank.clusters.length < 2) throw new Error("Need two ranked public-lobby clusters.");
  const clusterA = rank.clusters[0].id;
  const clusterB = rank.clusters[1].id;
  const zone = zoningBefore.regions.find((item) => item.networkId === networkBefore.massingNetworkId);
  if (!zone) throw new Error("No designer zone on the selected network.");

  const occA = placeOccupancyRecord({
    zoneId: zone.id,
    programId: "public-lobby",
    finishedClusterId: clusterA,
    provenance: "manual",
    networkId: networkBefore.massingNetworkId,
  });
  const savedA = await sendJson(`${BASE}/api/site/cluster-assemblies`, "POST", {
    name: "Checkpoint A01",
    selectedNetworkId: networkBefore.massingNetworkId,
    zoningSignature: occA.zoningSignature,
    occupancy: [occA],
    savedFrom: "placement",
  });
  results.A = savedA.assemblyId === "A01" || typeof savedA.assemblyId === "string" ? `created ${savedA.assemblyId}` : "missing id";
  results.B = readClusterAssembly(String(savedA.assemblyId))?.occupancy[0]?.finishedClusterId === clusterA ? "saved occupancy matches C1" : "A01 occupancy mismatch";

  const occB = placeOccupancyRecord({
    zoneId: zone.id,
    programId: "public-lobby",
    finishedClusterId: clusterB,
    provenance: "manual",
    transform: occA.transform,
    networkId: networkBefore.massingNetworkId,
  });
  const replaced = replaceZoneOccupancy([occA], occB);
  if (replaced.length !== 1 || replaced[0].finishedClusterId !== clusterB) throw new Error("Per-zone replace failed.");
  const savedB = await sendJson(`${BASE}/api/site/cluster-assemblies`, "POST", {
    name: "Checkpoint A02",
    selectedNetworkId: networkBefore.massingNetworkId,
    zoningSignature: occB.zoningSignature,
    occupancy: replaced,
    savedFrom: "placement",
  });
  results.C = `replaced ${zone.id} ${clusterA} → ${clusterB}`;
  const aAfter = readClusterAssembly(String(savedA.assemblyId));
  results.D = aAfter?.occupancy[0]?.finishedClusterId === clusterA && aAfter.occupancy.length === 1
    ? "A01 unchanged after saving A02"
    : "A01 was overwritten";

  await sendJson(`${BASE}/api/site/selected-assembly`, "PUT", { selectedAssemblyId: savedB.assemblyId });
  const preview = await getJson(`${BASE}/api/site/cluster-assemblies/${savedA.assemblyId}`);
  const selectedWhilePreview = await getJson(`${BASE}/api/site/selected-assembly`);
  results.E = preview.assemblyId === savedA.assemblyId && selectedWhilePreview.selectedAssemblyId === savedB.assemblyId
    ? "preview A01 does not change development A02"
    : "preview mutated selectedAssemblyId";

  await sendJson(`${BASE}/api/site/selected-assembly`, "PUT", { selectedAssemblyId: savedA.assemblyId });
  const afterF = await getJson(`${BASE}/api/site/development-checkpoint`);
  results.F = afterF.selectedAssemblyId === savedA.assemblyId ? "selectedAssemblyId is A01 immediately" : "F failed";

  await sendJson(`${BASE}/api/site/selected-assembly`, "PUT", { selectedAssemblyId: savedB.assemblyId });
  const afterG = readDevelopmentCheckpoint();
  const afterGHttp = await getJson(`${BASE}/api/site/development-checkpoint`);
  results.G = afterG.selectedAssemblyId === savedB.assemblyId && afterGHttp.selectedAssemblyId === savedB.assemblyId
    ? "checkpoint consumers updated without reload"
    : "G failed";

  const afterH = await getJson(`${BASE}/api/site/selected-assembly`);
  results.H = afterH.selectedAssemblyId === savedB.assemblyId ? "reload authority remains A02" : "H failed";

  await sendJson(`${BASE}/api/site/selected-assembly`, "PUT", { selectedAssemblyId: savedA.assemblyId });
  const afterI = await getJson(`${BASE}/api/site/development-checkpoint`);
  results.I = afterI.selectedAssemblyId === savedA.assemblyId ? "switching back to A01 restores development" : "I failed";

  const networkAfter = readPublishedSelectedNetwork();
  const zoningAfter = readDesignerZoning();
  results.J = fingerprint(networkAfter) === fingerprint(networkBefore) && fingerprint(zoningAfter) === fingerprint(zoningBefore)
    ? "Site Strategy network and designer zoning unchanged"
    : "upstream zoning/network changed";

  const configurationsAfter = readFileSync(path.join(process.cwd(), "data", "skill5", "configurations.json"), "utf8");
  const interpretationAfter = readFileSync(path.join(process.cwd(), "lib", "interpretation", "source.ts"), "utf8");
  results.preservation = configurationsAfter === configurationsBefore && interpretationAfter === interpretationBefore
    ? "configurations.json and interpretation source unchanged"
    : "historical files changed";

  deleteClusterAssembly(String(savedA.assemblyId));
  deleteClusterAssembly(String(savedB.assemblyId));
  writeSelectedAssemblyId(catalogBefore.selectedAssemblyId);
  console.log(JSON.stringify({ clusterA, clusterB, zoneId: zone.id, networkId: networkBefore.massingNetworkId, results }, null, 2));
} catch (error) {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exitCode = 1;
}
}

void main();
