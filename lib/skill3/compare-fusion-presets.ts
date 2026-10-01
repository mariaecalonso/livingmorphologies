import { extractIsomesh, extractVoxels, sliceSpacing } from "../scan/isomesh";
import type { ScanSlice } from "../scan/volume";
import { stateChecksum } from "../skill2/handoff";
import {
  BOUNDARY_FUSION_PRESETS,
  circularOpenings,
  fusedOpeningPairCount,
  fuseOpeningBoundaries,
  openingGap,
  type BoundaryFusionPresetName,
} from "./boundary-fusion";
import { DEFAULT_EVENT_CONFIG, futureContinuationSeed, sampleFromParent } from "./events";
import { loadSkill2Handoff } from "./source";
import { toVerticalViewerField } from "./viewer-field";
import { replayZ0 } from "./z0";

const FIXTURE = { archetypeId: "void-field", runKey: "void-field@20260928", candidateId: 39 };
const ISO = 0.48;
const SPACING = 0.1;
const YAW = 0.86;

function viewerMesh(field: ReturnType<typeof toVerticalViewerField>) {
  const slices: ScanSlice[] = field.slices.map((slice) => ({
    index: slice.index,
    iteration: slice.iteration,
    trails: Float32Array.from(slice.trails),
    trailSize: slice.trailSize,
    peak: slice.peak,
    source: { ...slice.source },
    attractor: { ...slice.attractor },
  }));
  const pitch = sliceSpacing(SPACING, YAW);
  const meshZ = field.slices.map((slice) => slice.z * Math.max(1, field.slices.length - 1) * pitch);
  return {
    isomesh: extractIsomesh(slices, ISO, SPACING, YAW, meshZ).triangles,
    voxels: extractVoxels(slices, ISO, SPACING, YAW, meshZ).triangles,
  };
}

function changedShare(left: readonly number[], right: readonly number[]) {
  let changed = 0;
  for (let i = 0; i < left.length; i += 1) if (left[i] !== right[i]) changed += 1;
  return changed / left.length;
}

const record = loadSkill2Handoff(FIXTURE);
const handoff = replayZ0(record);
const z0 = handoff.selected.simulationState;
const parentChecksum = stateChecksum(z0);
const openings = circularOpenings(handoff.selected.source.recipe.attractors ?? []);
const gaps = openings.flatMap((opening, index) => openings.slice(index + 1).map((other) => openingGap(opening, other)));
const seed = futureContinuationSeed(record, 1);
const plain = sampleFromParent(z0, handoff, record, seed, DEFAULT_EVENT_CONFIG);
if (stateChecksum(z0) !== parentChecksum) throw new Error("Z0 changed");

const names = Object.keys(BOUNDARY_FUSION_PRESETS) as BoundaryFusionPresetName[];
for (const name of names) {
  const config = BOUNDARY_FUSION_PRESETS[name];
  const pairs = fusedOpeningPairCount(openings, config);
  const distant = gaps.filter((gap) => gap > config.proximity).length;
  const sampling = sampleFromParent(z0, handoff, record, seed, DEFAULT_EVENT_CONFIG, (state) => {
    fuseOpeningBoundaries(state.trails, state.trailSize, state.size, openings, config);
  });
  if (sampling.samples[0].iteration !== plain.samples[0].iteration) throw new Error(`${name} left Z0`);
  if (stateChecksum(z0) !== parentChecksum) throw new Error(`${name} changed Z0`);
  const field = toVerticalViewerField(sampling, "F02");
  const mesh = viewerMesh(field);
  const share = changedShare(sampling.future.trails, plain.future.trails);
  console.log(
    [
      name,
      `proximity=${config.proximity}`,
      `radius=${config.relaxationRadius}`,
      `blend=${config.blendStrength}`,
      `pairs=${pairs}`,
      `distantUntouched=${distant}`,
      `samples=${sampling.samples.map((sample) => sample.iteration).join(",")}`,
      `isomesh=${mesh.isomesh}`,
      `voxels=${mesh.voxels}`,
      `changed=${share.toFixed(4)}`,
    ].join("  "),
  );
}

if (stateChecksum(z0) !== parentChecksum) throw new Error("Z0 changed after presets");
console.log(`gaps ${gaps.map((gap) => gap.toFixed(2)).join(", ")}`);
console.log("compare-fusion-presets: done");
