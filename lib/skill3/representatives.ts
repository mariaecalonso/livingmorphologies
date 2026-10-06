import type { NaturalContinuation } from "./continuations";

/**
 * How many continuations the catalogue shows.
 * The selector itself takes this as an argument, so a later count does not need a new algorithm.
 */
export const DISPLAY_COUNT = 12;

/** Coarse XY planes sampled across each continuation's own normalized height. */
const SPATIAL_PLANES = 4;
const SPATIAL_GRID = 8;
/** Bins of accepted-event delta across the shared iteration span, plus sample count. */
const TEMPORAL_BINS = 8;

/**
 * Coverage subset of an existing continuation list.
 * Distance describes difference, not quality. The other continuations stay on the source list.
 */
export function representativeContinuations(
  continuations: readonly NaturalContinuation[],
  count = DISPLAY_COUNT,
) {
  if (count <= 0 || continuations.length === 0) return [];
  const ordered = [...continuations].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  if (count >= ordered.length) return ordered;

  const spatial = ordered.map(spatialDescriptor);
  const temporal = temporalDescriptors(ordered);
  const distance = (left: number, right: number) =>
    rms(spatial[left], spatial[right]) + rms(temporal[left], temporal[right]);

  let medoid = 0;
  let medoidSum = Number.POSITIVE_INFINITY;
  for (let index = 0; index < ordered.length; index += 1) {
    let sum = 0;
    for (let other = 0; other < ordered.length; other += 1) {
      if (other !== index) sum += distance(index, other);
    }
    if (sum < medoidSum) {
      medoidSum = sum;
      medoid = index;
    }
  }

  const selected = [medoid];
  const chosen = new Set([medoid]);
  while (selected.length < count) {
    let farthest = -1;
    let farthestGap = -1;
    for (let index = 0; index < ordered.length; index += 1) {
      if (chosen.has(index)) continue;
      let nearest = Number.POSITIVE_INFINITY;
      for (const picked of selected) nearest = Math.min(nearest, distance(index, picked));
      if (nearest > farthestGap) {
        farthestGap = nearest;
        farthest = index;
      }
    }
    if (farthest < 0) break;
    selected.push(farthest);
    chosen.add(farthest);
  }

  return selected.map((index) => ordered[index]);
}

function spatialDescriptor(continuation: NaturalContinuation) {
  const out = new Float64Array(SPATIAL_PLANES * SPATIAL_GRID * SPATIAL_GRID);
  const slices = continuation.field.slices;
  if (slices.length === 0) return out;
  for (let plane = 0; plane < SPATIAL_PLANES; plane += 1) {
    const planeCount: number = SPATIAL_PLANES;
    const target = planeCount === 1 ? 0 : plane / (planeCount - 1);
    let slice = slices[0];
    let best = Math.abs(slice.z - target);
    for (let index = 1; index < slices.length; index += 1) {
      const gap = Math.abs(slices[index].z - target);
      if (gap < best) {
        slice = slices[index];
        best = gap;
      }
    }
    const size = Math.max(1, slice.trailSize);
    const base = plane * SPATIAL_GRID * SPATIAL_GRID;
    let peak = 0;
    for (let gy = 0; gy < SPATIAL_GRID; gy += 1) {
      const y0 = Math.floor((gy * size) / SPATIAL_GRID);
      const y1 = Math.max(y0 + 1, Math.min(size, Math.floor(((gy + 1) * size) / SPATIAL_GRID)));
      for (let gx = 0; gx < SPATIAL_GRID; gx += 1) {
        const x0 = Math.floor((gx * size) / SPATIAL_GRID);
        const x1 = Math.max(x0 + 1, Math.min(size, Math.floor(((gx + 1) * size) / SPATIAL_GRID)));
        let sum = 0;
        let cells = 0;
        for (let y = y0; y < y1; y += 1) {
          const row = y * size;
          for (let x = x0; x < x1; x += 1) {
            sum += slice.trails[row + x] ?? 0;
            cells += 1;
          }
        }
        const value = cells ? sum / cells : 0;
        out[base + gy * SPATIAL_GRID + gx] = value;
        if (value > peak) peak = value;
      }
    }
    if (peak > 0) {
      for (let cell = 0; cell < SPATIAL_GRID * SPATIAL_GRID; cell += 1) out[base + cell] /= peak;
    }
  }
  return out;
}

function temporalDescriptors(continuations: readonly NaturalContinuation[]) {
  let span = 1;
  let maxSamples = 1;
  for (const continuation of continuations) {
    const last = continuation.acceptedIterations[continuation.acceptedIterations.length - 1] ?? continuation.z0Iteration;
    span = Math.max(span, last - continuation.z0Iteration);
    maxSamples = Math.max(maxSamples, continuation.sampleCount);
  }
  return continuations.map((continuation) => {
    const out = new Float64Array(TEMPORAL_BINS + 1);
    const counts = new Float64Array(TEMPORAL_BINS);
    for (const event of continuation.events) {
      if (event.reason === "z0") continue;
      const position = Math.min(1, Math.max(0, (event.iteration - continuation.z0Iteration) / span));
      const bin = Math.min(TEMPORAL_BINS - 1, Math.floor(position * TEMPORAL_BINS));
      out[bin] += event.delta;
      counts[bin] += 1;
    }
    for (let bin = 0; bin < TEMPORAL_BINS; bin += 1) {
      if (counts[bin] > 0) out[bin] /= counts[bin];
    }
    out[TEMPORAL_BINS] = continuation.sampleCount / maxSamples;
    return out;
  });
}

function rms(left: Float64Array, right: Float64Array) {
  let sum = 0;
  for (let index = 0; index < left.length; index += 1) {
    const delta = left[index] - right[index];
    sum += delta * delta;
  }
  return Math.sqrt(sum / left.length);
}
