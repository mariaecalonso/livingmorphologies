import { generateCandidateField } from "../lib/skill4/candidate-field";
import { HYBRID_GENERATOR_SETTINGS } from "../lib/skill4/hybrid-generator";
import { generateHybridField } from "../lib/skill4/generated-hybrid-field";
import { SECTIONAL_GENERATOR_SETTINGS, connectionProcess } from "../lib/skill4/section-hybrid";
import { loadSkill3HandoffRecords } from "../lib/skill4/skill3-handoff";
import { loadModuleMap } from "../lib/skill4/tiles";

const loaded = loadModuleMap(loadSkill3HandoffRecords());
const ready = [...loaded.values()].filter((item) => item.status === "ready" && item.geometry);
const a = ready[0];
const b = ready[4];
if (a.status !== "ready" || b.status !== "ready") throw new Error("modules missing");
const process = connectionProcess(a, "N", b, "E");
if (!process) throw new Error("no sections");
const depths = (side: typeof process.a) => side.map((section) => Number(section.depth.toFixed(4)));
const gaps = (values: number[]) => values.slice(1).map((value, index) => Number((value - values[index]).toFixed(4)));
const inputs = generateCandidateField({
  signature: "eight-cut-check",
  faceA: "N",
  faceB: "E",
  moduleA: a,
  moduleB: b,
});
if (!inputs.ok) throw new Error(inputs.reason);
const field = generateHybridField({
  moduleA: a,
  moduleB: b,
  faceA: "N",
  faceB: "E",
  candidateField: inputs.field,
  settings: HYBRID_GENERATOR_SETTINGS,
});
const readyCount = field.candidates.filter((item) => item.status === "ready").length;
console.log(JSON.stringify({
  sections: SECTIONAL_GENERATOR_SETTINGS.sections,
  labelsA: process.a.map((section) => section.label),
  labelsB: process.b.map((section) => section.label),
  depthsA: depths(process.a),
  gapsA: gaps(depths(process.a)),
  depthsB: depths(process.b),
  gapsB: gaps(depths(process.b)),
  hybrids: readyCount,
  sample: field.candidates.find((item) => item.status === "ready")?.candidateId ?? field.candidates[0]?.reason,
}, null, 2));
