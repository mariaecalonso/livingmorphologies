import { readFileSync } from "node:fs";
import path from "node:path";
import {
  DRAWING_LAB_CONTRACT,
  ENCLOSURE_LAB_CONTRACT,
  FINAL_ENCLOSED_MODEL_CHECKPOINT,
  INTERPRETATION_LAB_CONTRACT,
  LAB_AUTHORITIES,
  LAB_COMPUTATIONAL_EDGES,
  LAB_CONTRACTS,
  LAB_CONTRACT_REGISTRY,
  RENDERING_LAB_CONTRACT,
  SITE_CONTEXT_SOURCE,
  SLICING_LAB_CONTRACT,
  geometryOutputSatisfied,
  labContract,
  labContractDocument,
} from "@/lib/lab-contracts";
import { CLIENT_CONTRACT } from "@/lib/skill5/client-compatibility";
import { CLUSTER_ASSEMBLY_CONTRACT } from "@/lib/skill5/placed-cluster";
import { DESIGNER_ZONING_CONTRACT } from "@/lib/skill5/designer-zoning";
import { DEVELOPMENT_CHECKPOINT_CONTRACT } from "@/lib/skill5/development-checkpoint";
import {
  DRAWING_CONTRACT,
  ENCLOSURE_AUTHORITY_CONTRACT,
  FINAL_ENCLOSED_MODEL_CONTRACT,
  INTERPRETATION_AUTHORITY_CONTRACT,
  RENDERING_CONTRACT,
  SLICING_CONTRACT,
} from "@/lib/skill5/downstream-pipeline";
import { SITE_CONTEXT_PATH } from "@/lib/skill5/site-context-source";

const ROOT = process.cwd();
const results: Record<string, string> = {};

function read(rel: string) {
  return readFileSync(path.join(ROOT, rel), "utf8");
}

function fail(id: string, reason: string) {
  results[id] = reason;
}

function pass(id: string, note: string) {
  results[id] = note;
}

const document = labContractDocument();
const ids = LAB_CONTRACTS.map((item) => item.id);
const required = [
  "cluster-placement",
  "cluster-assembly-catalog",
  "interpretation",
  "enclosure",
  "slicing",
  "drawing",
  "rendering",
];

if (document.contract === LAB_CONTRACT_REGISTRY && required.every((id) => ids.includes(id)) && required.every((id) => {
  const item = labContract(id);
  return item.inputs.length > 0 && Boolean(item.output.type);
})) {
  pass("A", "Every downstream Lab has one declared input/output contract");
} else fail("A", "A failed");

const authorityMatch =
  LAB_AUTHORITIES.designerZoning === DESIGNER_ZONING_CONTRACT
  && LAB_AUTHORITIES.clusterAssemblies === CLUSTER_ASSEMBLY_CONTRACT
  && LAB_AUTHORITIES.selectedAssembly === DEVELOPMENT_CHECKPOINT_CONTRACT
  && LAB_AUTHORITIES.interpretation === INTERPRETATION_AUTHORITY_CONTRACT
  && LAB_AUTHORITIES.enclosure === ENCLOSURE_AUTHORITY_CONTRACT
  && LAB_AUTHORITIES.finalEnclosedModel === FINAL_ENCLOSED_MODEL_CONTRACT
  && LAB_AUTHORITIES.slicing === SLICING_CONTRACT
  && LAB_AUTHORITIES.drawing === DRAWING_CONTRACT
  && LAB_AUTHORITIES.rendering === RENDERING_CONTRACT
  && LAB_AUTHORITIES.clientRanking.startsWith(CLIENT_CONTRACT)
  && SITE_CONTEXT_SOURCE.source.includes(SITE_CONTEXT_PATH)
  && !LAB_CONTRACTS.some((item) => item.inputs.some((input) => input.source.includes("assembled-flat-self")));

if (authorityMatch) pass("B", "Contracts reference existing production authorities");
else fail("B", "B failed");

if (
  INTERPRETATION_LAB_CONTRACT.inputs.length === 1
  && INTERPRETATION_LAB_CONTRACT.inputs[0].type === "Selected Assembly for Development"
  && INTERPRETATION_LAB_CONTRACT.inputs[0].source === DEVELOPMENT_CHECKPOINT_CONTRACT
) pass("C", "Architectural Interpretation input is Selected Assembly for Development");
else fail("C", "C failed");

if (INTERPRETATION_LAB_CONTRACT.output.type === "Current Integrated Architectural Model") {
  pass("D", "Architectural Interpretation expected output is Current Integrated Architectural Model");
} else fail("D", "D failed");

const interpretationPanel = read("components/interpretation/interpretation-source-panel.tsx");
const interpretationContract = read("components/pipeline/lab-contract-panel.tsx");
if (
  interpretationPanel.includes('variant="interpretation"')
  && interpretationContract.includes("readings are not this output")
  && interpretationContract.includes("Live geometry reading")
  && INTERPRETATION_LAB_CONTRACT.output.implemented === "partial"
  && INTERPRETATION_LAB_CONTRACT.methodologyNote?.includes("Readings")
  && !geometryOutputSatisfied({ geometryRequired: true, outputGeometryRef: null, lineageMatches: true })
) pass("E", "Interpretation readings are not labeled as the Integrated Architectural Model");
else fail("E", "E failed");

const enclosureText = JSON.stringify(ENCLOSURE_LAB_CONTRACT);
const forbidden = ["facade", "glass", "opaque", "skin", "panel", "physarum", "structure", "material", "environmental", "carve", "floor plate"];
if (!ENCLOSURE_LAB_CONTRACT.methodologyNote && !forbidden.some((word) => enclosureText.toLowerCase().includes(word))) {
  pass("F", "Enclosure contract contains no future methodology assumptions");
} else fail("F", "F failed");

if (ENCLOSURE_LAB_CONTRACT.output.type === "Final Enclosed Model") pass("G", "Enclosure output is Final Enclosed Model");
else fail("G", "G failed");

const femConsumers = FINAL_ENCLOSED_MODEL_CHECKPOINT.consumers.join(",");
const graphFromFem = LAB_COMPUTATIONAL_EDGES.filter((edge) => edge.from === "final-enclosed-model").map((edge) => edge.to);
if (
  femConsumers === "slicing,drawing,rendering"
  && graphFromFem.includes("slicing")
  && graphFromFem.includes("rendering")
  && graphFromFem.includes("drawing")
  && !LAB_COMPUTATIONAL_EDGES.some((edge) => edge.from === "drawing" && edge.to === "rendering")
) pass("H", "Final Enclosed Model is the branching checkpoint for Slicing and Rendering");
else fail("H", "H failed");

if (SLICING_LAB_CONTRACT.kind === "multi-output" && SLICING_LAB_CONTRACT.output.type.includes("Slice")) {
  pass("I", "Slicing supports a multi-output contract");
} else fail("I", "I failed");

if (
  DRAWING_LAB_CONTRACT.inputs.some((item) => item.type === "Slice sent from Slicing")
  && DRAWING_LAB_CONTRACT.inputs.some((item) => item.type === "Authoritative Site / Urban Context")
  && DRAWING_LAB_CONTRACT.inputs.some((item) => item.source === LAB_AUTHORITIES.siteContext)
  && SITE_CONTEXT_SOURCE.consumers.includes("drawing")
) pass("J", "Drawing resolves slice + shared Site Context");
else fail("J", "J failed");

if (
  RENDERING_LAB_CONTRACT.inputs.some((item) => item.type === "Final Enclosed Model")
  && RENDERING_LAB_CONTRACT.inputs.some((item) => item.source === LAB_AUTHORITIES.siteContext)
  && RENDERING_LAB_CONTRACT.inputs.every((item) => item.type !== "Technical Architectural Drawing")
  && SITE_CONTEXT_SOURCE.consumers.includes("rendering")
  && !LAB_COMPUTATIONAL_EDGES.some((edge) => edge.from === "drawing" && edge.to === "rendering")
) pass("K", "Rendering resolves Final Enclosed Model + the same Site Context");
else fail("K", "K failed");

const siteMap = read("lib/site-map.ts");
const nav = [
  siteMap.indexOf('label: "Physarum Logic"'),
  siteMap.indexOf('label: "Optimization"'),
  siteMap.indexOf('label: "Vertical Propagation"'),
  siteMap.indexOf('label: "Initial Cluster"'),
  siteMap.indexOf('label: "Site Integration"'),
  siteMap.indexOf('label: "Hybrid Cluster"'),
  siteMap.indexOf('label: "Cluster Integration"'),
  siteMap.indexOf('label: "Cluster Placement"'),
  siteMap.indexOf('label: "Cluster Assembly Catalog"'),
  siteMap.indexOf('label: "Architectural Interpretation"'),
  siteMap.indexOf('label: "Enclosure"'),
  siteMap.indexOf('label: "Slicing"'),
  siteMap.indexOf('label: "Drawing"'),
  siteMap.indexOf('label: "Rendering"'),
];
if (nav.every((index) => index >= 0) && nav.every((index, i) => i === 0 || index > nav[i - 1])) {
  pass("L", "Navigation order in lib/site-map.ts is unchanged");
} else fail("L", "L failed");

const generate = read("lib/interpretation/generate.ts");
const analyze = read("lib/interpretation/analyze-building.ts");
const adapter = read("lib/interpretation/selected-assembly.ts");
const readingView = read("lib/interpretation/reading-view.ts");
const readingRoute = read("app/api/interpretation/reading/route.ts");
if (
  generate.includes("export async function buildInterpretation")
  && analyze.includes("export function analyzeBuilding")
  && adapter.includes('role: "upstream"')
  && readingView.includes("loadSelectedAssemblyBuilding")
  && readingRoute.includes("buildProductionReadingView")
  && !readingRoute.includes("loadTemporaryBuilding")
) pass("M", "Existing generation / analysis algorithms remain unchanged");
else fail("M", "M failed");

if (
  adapter.includes("loadSelectedAssemblyBuilding")
  && adapter.includes("buildingRequestFromAssembly")
  && readingRoute.includes("assemblyRevisionSignature")
  && interpretationPanel.includes("data-production-implementation=\"selected-assembly-reading\"")
) pass("N", "Selected Assembly → Interpretation Phase 1 wiring is still present");
else fail("N", "N failed");

const failed = Object.entries(results).filter(([, value]) => value.includes("failed"));
console.log(JSON.stringify({ results, failed: failed.length }, null, 2));
if (failed.length) process.exitCode = 1;
