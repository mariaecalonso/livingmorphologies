/**
 * Reads the published Vertical Void 351 continuation bundle.
 * Writes a presentation summary without trail fields.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { encodeGrayPng } from "../lib/skill2/semantic/gray-png";
import { stackDisplayIndices } from "../lib/skill3/stack-display";

const VIEW = 36;
const archetypeId = "vertical-void";
const candidateId = 351;

type Slice = { iteration: number; trails: number[]; trailSize: number; peak: number; z: number };
type Event = { iteration: number; reason: string; delta: number };
type Continuation = {
  id: string;
  index: number;
  focus?: string;
  families?: string[];
  sampleCount: number;
  eventCount: number;
  z0Iteration: number;
  parentChecksum: string;
  acceptedIterations: number[];
  events: Event[];
  field?: { slices: Slice[] };
};

const sourcePath = join(process.cwd(), "public", "demo", "skill3", archetypeId, `${candidateId}.json`);
const bundle = JSON.parse(readFileSync(sourcePath, "utf8")) as {
  origin: string;
  archetypeId: string;
  archetypeName: string;
  candidateId: number;
  z0Iteration: number;
  parentChecksum: string;
  rules: {
    horizon: number;
    minGap: number;
    maxGap: number;
    deltaThreshold: number;
    envelope: { sizeX: number; sizeY: number; sizeZ: number };
  };
  continuations: Continuation[];
  fields?: { slices: Slice[] }[];
};

const handoff = JSON.parse(readFileSync(join(process.cwd(), "data", "skill3", "final-selection.json"), "utf8")) as {
  selections: { archetypeId: string; candidateId: number; continuationId: string }[];
};
const selected = handoff.selections.find((item) => item.archetypeId === archetypeId && item.candidateId === candidateId);
if (!selected) throw new Error("Vertical Void 351 is not in the Skill 3 handoff.");

function plate(slice: Slice) {
  const pixels = new Uint8Array(VIEW * VIEW);
  const scale = slice.trailSize / VIEW;
  for (let y = 0; y < VIEW; y += 1) {
    for (let x = 0; x < VIEW; x += 1) {
      let sum = 0;
      let count = 0;
      const y0 = Math.floor(y * scale);
      const y1 = Math.min(slice.trailSize, Math.floor((y + 1) * scale));
      const x0 = Math.floor(x * scale);
      const x1 = Math.min(slice.trailSize, Math.floor((x + 1) * scale));
      for (let py = y0; py < y1; py += 1) {
        for (let px = x0; px < x1; px += 1) {
          sum += slice.trails[py * slice.trailSize + px] ?? 0;
          count += 1;
        }
      }
      const value = count && slice.peak ? sum / count / slice.peak : 0;
      pixels[y * VIEW + x] = Math.max(0, Math.min(255, Math.round(value * 255)));
    }
  }
  return `data:image/png;base64,${encodeGrayPng(VIEW, pixels).toString("base64")}`;
}

const summary = {
  source: "public/demo/skill3/vertical-void/351.json",
  origin: bundle.origin,
  archetypeId: bundle.archetypeId,
  archetypeName: bundle.archetypeName,
  candidateId: bundle.candidateId,
  z0Iteration: bundle.z0Iteration,
  parentChecksum: bundle.parentChecksum,
  selectedContinuationId: selected.continuationId,
  rules: {
    horizon: bundle.rules.horizon,
    minGap: bundle.rules.minGap,
    maxGap: bundle.rules.maxGap,
    deltaThreshold: bundle.rules.deltaThreshold,
    envelope: bundle.rules.envelope,
  },
  continuations: bundle.continuations.map((continuation, index) => {
    const field = continuation.field ?? bundle.fields?.[index];
    const events = continuation.events.map((event) => ({
      iteration: event.iteration,
      reason: event.reason,
      delta: Number(event.delta.toFixed(4)),
    }));
    const plates = continuation.id === selected.continuationId && field
      ? stackDisplayIndices(field.slices.length).map((sliceIndex) => {
          const slice = field.slices[sliceIndex];
          return { iteration: slice.iteration, z: Number(slice.z.toFixed(4)), src: plate(slice) };
        })
      : [];
    return {
      id: continuation.id,
      index: continuation.index,
      focus: continuation.focus ?? null,
      families: continuation.families ?? [],
      sampleCount: continuation.sampleCount,
      eventCount: continuation.eventCount,
      z0Iteration: continuation.z0Iteration,
      parentChecksum: continuation.parentChecksum,
      acceptedIterations: continuation.acceptedIterations,
      events,
      plates,
    };
  }),
};

const out = join(process.cwd(), "public", "demo", "skill3", archetypeId, `${candidateId}-workflow.json`);
mkdirSync(join(out, ".."), { recursive: true });
writeFileSync(out, JSON.stringify(summary));
const selectedRow = summary.continuations.find((item) => item.id === selected.continuationId);
console.log(JSON.stringify({
  out,
  origin: summary.origin,
  continuations: summary.continuations.length,
  selected: selected.continuationId,
  plates: selectedRow?.plates.length ?? 0,
  samples: selectedRow?.sampleCount ?? null,
  bytes: Buffer.byteLength(JSON.stringify(summary)),
}));
