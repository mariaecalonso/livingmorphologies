/**
 * Five physical-connection proofs for TEST 3.
 * Run: npx tsx lib/skill4/run-merge-gate.ts
 * Exits 0 only when at least 4 of 5 cases are one solid.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { FaceId } from "./contract";
import { generateCandidateField } from "./candidate-field";
import { generateHybridField } from "./generated-hybrid-field";
import { physicalOperand } from "./geometry-preflight";
import { HYBRID_GENERATOR_SETTINGS } from "./hybrid-generator";
import { joinThreeBodies } from "./local-merge";
import { loadSkill3HandoffRecords } from "./skill3-handoff";
import { loadModuleMap } from "./tiles";

const BATCH = "SKILL04-STRESS-TEST-03";

type Ready = Extract<ReturnType<typeof loadModuleMap> extends Map<string, infer V> ? V : never, { status: "ready" }>;

async function main() {
  const loaded = loadModuleMap(loadSkill3HandoffRecords());
  const ready = [...loaded.values()].filter((item): item is Ready => item.status === "ready" && !!item.geometry && !!item.identity);
  const byName = (type: string) => ready.filter((item) => item.identity.typologyId === type).sort((a, b) => a.identity.name.localeCompare(b.identity.name));
  const lobby = byName("lobby");
  const workspace = byName("workspace");
  const gathering = byName("gathering");
  const area = (item: Ready, face: FaceId) => item.faces[face].extent.u * item.faces[face].extent.v;
  const largest = [...ready].sort((a, b) => area(b, "N") - area(a, "N"))[0];
  const smallest = [...ready].filter((item) => item.moduleId !== largest.moduleId).sort((a, b) => area(a, "E") - area(b, "E"))[0];
  const cases: { id: string; label: string; a: Ready; b: Ready; faceA: FaceId; faceB: FaceId; hybrid: string }[] = [
    { id: "A", label: "similar opposing faces", a: lobby[0], b: lobby[1], faceA: "E", faceB: "W", hybrid: "H13" },
    { id: "B", label: "different face sizes", a: largest, b: smallest, faceA: "N", faceB: "S", hybrid: "H05" },
    { id: "C", label: "different orientations", a: workspace[0], b: gathering[0], faceA: "N", faceB: "E", hybrid: "H18" },
    { id: "D", label: "large face to small face", a: largest, b: smallest, faceA: "E", faceB: "W", hybrid: "H09" },
    { id: "E", label: "top to side", a: lobby[2] ?? lobby[0], b: workspace[1] ?? workspace[0], faceA: "T", faceB: "E", hybrid: "H21" },
  ];
  const rows = [];
  for (const item of cases) {
    const started = Date.now();
    console.log(`[merge-gate] ${item.id} ${item.a.identity.name} ${item.faceA} / ${item.b.identity.name} ${item.faceB} ${item.hybrid}`);
    const row = await runCase(item);
    rows.push({ ...row, ms: Date.now() - started });
    console.log(`[merge-gate] ${item.id} ${row.pass ? "PASS" : "FAIL"} ${row.reason} components=${row.componentCount} floating=${row.floating} boolean=${row.boolean}`);
  }
  const passed = rows.filter((row) => row.pass).length;
  const directory = join(process.cwd(), "data", "experiments", "skill4-stress");
  mkdirSync(directory, { recursive: true });
  writeFileSync(join(directory, `${BATCH}-gate.json`), JSON.stringify({ batch: BATCH, passed, total: rows.length, rows }, null, 2));
  console.log(`[merge-gate] ${passed >= 4 ? "GATE PASS" : "GATE FAIL"} ${passed}/5`);
  process.exit(passed >= 4 ? 0 : 2);
}

async function runCase(item: { id: string; label: string; a: Ready; b: Ready; faceA: FaceId; faceB: FaceId; hybrid: string }) {
  const base = {
    id: item.id,
    label: item.label,
    parents: [item.a.identity.name, item.b.identity.name],
    faces: [item.faceA, item.faceB],
    hybrid: item.hybrid,
    pass: false,
    parentMergeA: "FAIL",
    mergeHybridA: "FAIL",
    hybridMergeB: "FAIL",
    mergeParentB: "FAIL",
    componentCount: null as number | null,
    floating: 3,
    coreIntact: false,
    boolean: "UNRESOLVED",
    reason: "",
  };
  try {
    const inputs = generateCandidateField({
      signature: `${BATCH}:${item.id}:${item.a.moduleId}:${item.faceA}:${item.b.moduleId}:${item.faceB}:${item.hybrid}`,
      faceA: item.faceA,
      faceB: item.faceB,
      moduleA: item.a,
      moduleB: item.b,
    });
    if (!inputs.ok) return { ...base, reason: inputs.reason };
    const field = generateHybridField({
      moduleA: item.a,
      moduleB: item.b,
      faceA: item.faceA,
      faceB: item.faceB,
      candidateField: inputs.field,
      settings: HYBRID_GENERATOR_SETTINGS,
    });
    const chosen = field.candidates.find((candidate) => candidate.candidateId === item.hybrid);
    if (!chosen || chosen.status !== "ready" || !chosen.geometry) return { ...base, reason: chosen?.reason || field.status };
    const parentA = await physicalOperand(item.a);
    const parentB = await physicalOperand(item.b);
    const join = await joinThreeBodies({
      parentA,
      parentB,
      frameA: item.a.faces[item.faceA],
      frameB: item.b.faces[item.faceB],
      hybrid: chosen.geometry,
    });
    return {
      ...base,
      pass: join.pass,
      parentMergeA: join.sideA.parentToMerge,
      mergeHybridA: join.sideA.mergeToHybrid,
      hybridMergeB: join.sideB.mergeToHybrid,
      mergeParentB: join.sideB.parentToMerge,
      parentOverlapA: join.sideA.parentOverlap,
      hybridOverlapA: join.sideA.hybridOverlap,
      hybridOverlapB: join.sideB.hybridOverlap,
      parentOverlapB: join.sideB.parentOverlap,
      componentCount: join.componentCount,
      floating: join.floating,
      coreIntact: join.coreIntact,
      boolean: join.boolean,
      reason: join.reason,
    };
  } catch (error) {
    return { ...base, reason: error instanceof Error ? error.message : "threw" };
  }
}

main();
