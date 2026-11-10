import { generateCandidateField } from "../lib/skill4/candidate-field";
import { HYBRID_GENERATOR_SETTINGS } from "../lib/skill4/hybrid-generator";
import { generateHybridField } from "../lib/skill4/generated-hybrid-field";
import { loadSkill3HandoffRecords } from "../lib/skill4/skill3-handoff";
import { loadModuleMap } from "../lib/skill4/tiles";

const loaded = loadModuleMap(loadSkill3HandoffRecords());
const ready = [...loaded.values()].filter((item) => item.status === "ready" && item.geometry);
const a = ready[0];
const b = ready[4];
if (a.status !== "ready" || b.status !== "ready") throw new Error("missing");
const inputs = generateCandidateField({
  signature: "time",
  faceA: "N",
  faceB: "E",
  moduleA: a,
  moduleB: b,
});
if (!inputs.ok) throw new Error(inputs.reason);
const started = Date.now();
const field = generateHybridField({
  moduleA: a,
  moduleB: b,
  faceA: "N",
  faceB: "E",
  candidateField: inputs.field,
  settings: HYBRID_GENERATOR_SETTINGS,
});
const readyCount = field.candidates.filter((item) => item.status === "ready").length;
console.log(JSON.stringify({ ms: Date.now() - started, readyCount, name: `${a.identity?.name} ${b.identity?.name}` }));
