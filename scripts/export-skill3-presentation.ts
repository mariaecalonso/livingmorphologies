/**
 * Writes the real Vertical Void 351 continuation bundle the vertical API returns.
 * Reads research files. Writes only public/demo/skill3/vertical-void/351.json.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadVerifiedContinuations } from "../lib/skill3/semantic-handoff";

const archetypeId = "vertical-void";
const candidateId = 351;

const set = loadVerifiedContinuations({ archetypeId, candidateId });
const { continuations, ...source } = set;
const bundle = {
  ...source,
  continuations: continuations.map((continuation) => {
    const { field: _field, ...meta } = continuation;
    return meta;
  }),
  fields: continuations.map((continuation) => continuation.field),
};

const path = join(process.cwd(), "public", "demo", "skill3", archetypeId, `${candidateId}.json`);
mkdirSync(join(path, ".."), { recursive: true });
writeFileSync(path, JSON.stringify(bundle));
console.log(JSON.stringify({
  path,
  origin: bundle.origin,
  continuations: bundle.continuations.length,
  archetypeId: bundle.archetypeId,
  candidateId: bundle.candidateId,
  bytes: Buffer.byteLength(JSON.stringify(bundle)),
}));
