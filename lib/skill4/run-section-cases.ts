/**
 * Three representative pairs for the sectional generator.
 * Run: npx tsx lib/skill4/run-section-cases.ts
 * Does not write Test 1, Test 2, or Test 3 records.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { diagnoseTopology } from "./boolean-conditioning";
import { generateCandidateField } from "./candidate-field";
import type { FaceId } from "./contract";
import { generateHybridField } from "./generated-hybrid-field";
import { physicalOperand } from "./geometry-preflight";
import { HYBRID_GENERATOR_SETTINGS } from "./hybrid-generator";
import { joinThreeBodies } from "./local-merge";
import { SECTIONAL_GENERATOR_SETTINGS } from "./section-hybrid";
import { loadSkill3HandoffRecords } from "./skill3-handoff";
import { loadModuleMap } from "./tiles";

type Ready = Extract<ReturnType<typeof loadModuleMap> extends Map<string, infer V> ? V : never, { status: "ready" }>;

async function main() {
  const loaded = loadModuleMap(loadSkill3HandoffRecords());
  const ready = [...loaded.values()].filter((item): item is Ready => item.status === "ready" && !!item.geometry && !!item.identity);
  const byName = (type: string) => ready.filter((item) => item.identity.typologyId === type).sort((a, b) => a.identity.name.localeCompare(b.identity.name));
  const lobby = byName("lobby");
  const area = (item: Ready, face: FaceId) => item.faces[face].extent.u * item.faces[face].extent.v;
  const largest = [...ready].sort((a, b) => area(b, "N") - area(a, "N"))[0];
  const smallest = [...ready].filter((item) => item.moduleId !== largest.moduleId).sort((a, b) => area(a, "E") - area(b, "E"))[0];
  const opened = findOpeningPair(ready) ?? { a: lobby[0], b: lobby[1] ?? lobby[0], faceA: "N" as FaceId, faceB: "E" as FaceId };
  const cases = [
    { id: "1", label: "similar faces", a: lobby[0], b: lobby[1] ?? lobby[0], faceA: "E" as FaceId, faceB: "W" as FaceId },
    { id: "2", label: "different face shapes", a: largest, b: smallest, faceA: "N" as FaceId, faceB: "S" as FaceId },
    { id: "3", label: "opening near the connection", a: opened.a, b: opened.b, faceA: opened.faceA, faceB: opened.faceB },
  ];
  const rows = [];
  for (const item of cases) {
    const inputs = generateCandidateField({
      signature: `${SECTIONAL_GENERATOR_SETTINGS.version}:${item.id}:${item.a.moduleId}:${item.faceA}:${item.b.moduleId}:${item.faceB}`,
      faceA: item.faceA,
      faceB: item.faceB,
      moduleA: item.a,
      moduleB: item.b,
    });
    if (!inputs.ok) {
      rows.push({ id: item.id, label: item.label, reason: inputs.reason });
      continue;
    }
    const field = generateHybridField({
      moduleA: item.a,
      moduleB: item.b,
      faceA: item.faceA,
      faceB: item.faceB,
      candidateField: inputs.field,
      settings: HYBRID_GENERATOR_SETTINGS,
    });
    const parentA = await physicalOperand(item.a);
    const parentB = await physicalOperand(item.b);
    const hybrids = [];
    for (const id of ["H01", "H13", "H25"]) {
      const chosen = field.candidates.find((candidate) => candidate.candidateId === id);
      const mesh = chosen?.geometry ?? null;
      const topology = mesh ? diagnoseTopology(mesh) : null;
      const join = mesh ? await joinThreeBodies({ parentA, parentB, frameA: item.a.faces[item.faceA], frameB: item.b.faces[item.faceB], hybrid: mesh }) : null;
      hybrids.push({
        id,
        status: chosen?.status ?? "missing",
        reason: chosen?.reason ?? "",
        report: chosen?.sectionReport ?? null,
        components: topology?.componentCount ?? null,
        boundary: topology?.boundaryEdgeCount ?? null,
        nonManifold: topology?.nonManifoldEdgeCount ?? null,
        physical: join?.pass ?? false,
        boolean: join?.boolean ?? "UNRESOLVED",
        joinComponents: join?.componentCount ?? null,
      });
    }
    const report = field.candidates.find((candidate) => candidate.sectionReport)?.sectionReport ?? null;
    rows.push({
      id: item.id,
      label: item.label,
      parents: [item.a.identity.name, item.b.identity.name],
      faces: [item.faceA, item.faceB],
      sections: report,
      ready: field.readyCount,
      hybrids,
    });
    console.log(`[section] ${item.id} ${item.a.identity.name} ${item.faceA} / ${item.b.identity.name} ${item.faceB} ready ${field.readyCount}/25`);
    for (const hybrid of hybrids) {
      console.log(`  ${hybrid.id} ${hybrid.status} correspondence ${hybrid.report?.correspondence ?? "-"} manifold components ${hybrid.components} physical ${hybrid.physical} ${hybrid.reason}`);
    }
  }
  const directory = join(process.cwd(), "data", "experiments", "skill4-stress");
  mkdirSync(directory, { recursive: true });
  writeFileSync(join(directory, "SKILL04-SECTIONAL-V1-cases.json"), JSON.stringify({ version: SECTIONAL_GENERATOR_SETTINGS.version, rows }, null, 2));
}

function findOpeningPair(ready: Ready[]) {
  for (const a of ready) {
    for (const faceA of ["N", "E", "T"] as FaceId[]) {
      const field = generateCandidateField({
        signature: `opening-scan:${a.moduleId}:${faceA}`,
        faceA,
        faceB: "S",
        moduleA: a,
        moduleB: ready.find((item) => item.moduleId !== a.moduleId) ?? a,
      });
      if (!field.ok) continue;
      const other = ready.find((item) => item.moduleId !== a.moduleId);
      if (!other) return null;
      const generated = generateHybridField({
        moduleA: a,
        moduleB: other,
        faceA,
        faceB: "W",
        candidateField: field.field,
        settings: HYBRID_GENERATOR_SETTINGS,
      });
      const report = generated.candidates.find((candidate) => candidate.sectionReport)?.sectionReport;
      if (report && report.nearOpeningsA > 0) return { a, b: other, faceA, faceB: "W" as FaceId };
    }
  }
  return null;
}

void main();
