import type { AcceptedSample, EventSamplingResult } from "./events";

/** Plate resolution handed to the viewer. Generators downsample, then drop the 1280 field. */
export const VIEWER_TRAIL_SIZE = 128;

export type ViewerPoint = { x: number; y: number };

export type ViewerLineage = {
  archetypeId: string;
  archetypeName: string;
  candidateId: number;
  z0Iteration: number;
  futureId: string;
};

/** One accepted sample, reduced to what Stack / Isomesh / Voxels draw. */
export type ViewerSlice = {
  index: number;
  iteration: number;
  /** 0 at the first accepted sample, 1 at the last. Spacing is iteration distance. */
  z: number;
  trails: number[];
  trailSize: number;
  peak: number;
  source: ViewerPoint;
  attractor: ViewerPoint;
};

/**
 * Viewer-ready stack. No engine state, checksums, or event internals.
 * `z` is normalized iteration distance, so the viewer can scale it.
 */
export type VerticalViewerField = {
  lineage: ViewerLineage;
  slices: ViewerSlice[];
};

export { STACK_DISPLAY_PLATES, stackDisplayIndices, stackDisplaySlices } from "./stack-display";

/** Normalized Z from simulation iterations. Equal indexes are not assumed. */
export function iterationSpanZ(iterations: readonly number[]) {
  if (iterations.length === 0) return [];
  const span = Math.max(1, iterations[iterations.length - 1] - iterations[0]);
  return iterations.map((iteration) => (iteration - iterations[0]) / span);
}

function downsample(trails: readonly number[], trailSize: number, outSize: number) {
  const out = new Array<number>(outSize * outSize);
  let peak = 0.0001;
  for (let y = 0; y < outSize; y += 1) {
    const y0 = Math.floor((y * trailSize) / outSize);
    const y1 = Math.max(y0 + 1, Math.min(trailSize, Math.floor(((y + 1) * trailSize) / outSize)));
    for (let x = 0; x < outSize; x += 1) {
      const x0 = Math.floor((x * trailSize) / outSize);
      const x1 = Math.max(x0 + 1, Math.min(trailSize, Math.floor(((x + 1) * trailSize) / outSize)));
      let sum = 0;
      let count = 0;
      for (let yy = y0; yy < y1; yy += 1) {
        const row = yy * trailSize;
        for (let xx = x0; xx < x1; xx += 1) {
          sum += trails[row + xx];
          count += 1;
        }
      }
      const value = count ? sum / count : 0;
      out[y * outSize + x] = value;
      if (value > peak) peak = value;
    }
  }
  return { trails: out, trailSize: outSize, peak };
}

function viewerSlice(sample: AcceptedSample, z: number): ViewerSlice {
  const plate = downsample(sample.trails, sample.trailSize, VIEWER_TRAIL_SIZE);
  return {
    index: sample.index,
    iteration: sample.iteration,
    z,
    trails: plate.trails,
    trailSize: plate.trailSize,
    peak: plate.peak,
    source: { x: 0, y: 0 },
    attractor: { ...sample.attractor },
  };
}

/** Maps one Skill 3 future onto the viewer contract. Does not simulate. */
export function toVerticalViewerField(result: EventSamplingResult, futureId = "F01"): VerticalViewerField {
  const z = iterationSpanZ(result.samples.map((sample) => sample.iteration));
  return {
    lineage: {
      archetypeId: result.record.identity.archetypeId,
      archetypeName: result.record.identity.archetypeName,
      candidateId: result.record.identity.candidateId,
      z0Iteration: result.samples[0]?.iteration ?? result.z0.iteration,
      futureId,
    },
    slices: result.samples.map((sample, index) => viewerSlice(sample, z[index] ?? 0)),
  };
}

