import type { FaceProfile, ProfileLoop, ProfilePoint } from "./face-profile";

/**
 * Point correspondence between two face profiles.
 * Each side contributes its largest closed loop. Both loops are resampled
 * by perimeter and aligned in UV. Source profiles and meshes are not changed.
 */
export const PROFILE_CORRESPONDENCE_SETTINGS = {
  version: "skill4-profile-correspondence-v1",
  winding: "counterclockwise in face u/v",
  selection: "largest absolute shoelace area, then perimeter, then lowest loop index",
  resample: "equal steps along the closed perimeter",
  alignment: "cyclic offset of B that minimizes the sum of UV distances",
  areaEpsilon: 1e-8,
  perimeterEpsilon: 1e-8,
  minimumSamples: 3,
} as const;

export type CorrespondenceStatus = "ready" | "empty" | "blocked" | "invalid";

export type CorrespondenceSample = {
  u: number;
  v: number;
};

export type LoopRecord = {
  index: number;
  closed: boolean;
  pointCount: number;
  area: number;
  perimeter: number;
  usable: boolean;
};

export type ProfileCorrespondence = {
  version: typeof PROFILE_CORRESPONDENCE_SETTINGS.version;
  status: CorrespondenceStatus;
  sampleCount: number;
  profileA: FaceProfile | null;
  profileB: FaceProfile | null;
  alignedA: CorrespondenceSample[];
  alignedB: CorrespondenceSample[];
  offset: number | null;
  selectedLoopA: LoopRecord | null;
  selectedLoopB: LoopRecord | null;
  additionalLoopsA: LoopRecord[];
  additionalLoopsB: LoopRecord[];
  reason: string;
};

export function correspondProfiles(
  profileA: FaceProfile | null,
  profileB: FaceProfile | null,
  sampleCount: number,
): ProfileCorrespondence {
  if (!profileA || !profileB || !validSampleCount(sampleCount)) {
    return result("invalid", profileA, profileB, 0, null, null, null, null, null, [], [], "A profile or the sample count is missing.");
  }
  if (profileA.status === "invalid" || profileB.status === "invalid") {
    return result("invalid", profileA, profileB, sampleCount, null, null, null, null, null, [], [], "One or both face profiles are invalid.");
  }
  if (profileA.status === "empty" || profileB.status === "empty") {
    return result("empty", profileA, profileB, sampleCount, null, null, null, null, null, [], [], "One or both face profiles are empty.");
  }

  const loopsA = inspect(profileA.loops);
  const loopsB = inspect(profileB.loops);
  const selectedA = chooseLoop(loopsA);
  const selectedB = chooseLoop(loopsB);
  if (!selectedA || !selectedB) {
    return result(
      "blocked",
      profileA,
      profileB,
      sampleCount,
      null,
      null,
      null,
      null,
      null,
      loopsA,
      loopsB,
      "A profile has no closed loop with area.",
    );
  }

  const orientedA = orient(profileA.loops[selectedA.index].points);
  const orientedB = orient(profileB.loops[selectedB.index].points);
  const samplesA = resampleClosed(orientedA, sampleCount);
  const samplesB = resampleClosed(orientedB, sampleCount);
  const aligned = alignSamples(samplesA, samplesB);
  return result(
    "ready",
    profileA,
    profileB,
    sampleCount,
    samplesA,
    aligned.samples,
    selectedA,
    selectedB,
    aligned.offset,
    loopsA.filter((loop) => loop.index !== selectedA.index),
    loopsB.filter((loop) => loop.index !== selectedB.index),
    "",
  );
}

function validSampleCount(sampleCount: number) {
  return Number.isInteger(sampleCount) && sampleCount >= PROFILE_CORRESPONDENCE_SETTINGS.minimumSamples;
}

function inspect(loops: readonly ProfileLoop[]): LoopRecord[] {
  return loops.map((loop, index) => {
    const finite = loop.points.every((point) => Number.isFinite(point.u) && Number.isFinite(point.v));
    const area = finite && loop.closed && loop.points.length >= 3 ? Math.abs(signedArea(loop.points)) : 0;
    const perimeter = finite ? pathLength(loop.points, loop.closed) : 0;
    const usable = loop.closed
      && finite
      && loop.points.length >= 3
      && area > PROFILE_CORRESPONDENCE_SETTINGS.areaEpsilon
      && perimeter > PROFILE_CORRESPONDENCE_SETTINGS.perimeterEpsilon;
    return { index, closed: loop.closed, pointCount: loop.points.length, area, perimeter, usable };
  });
}

function chooseLoop(loops: readonly LoopRecord[]) {
  let selected: LoopRecord | null = null;
  for (const loop of loops) {
    if (!loop.usable) continue;
    if (!selected || prefers(loop, selected)) selected = loop;
  }
  return selected;
}

function prefers(candidate: LoopRecord, current: LoopRecord) {
  if (candidate.area !== current.area) return candidate.area > current.area;
  if (candidate.perimeter !== current.perimeter) return candidate.perimeter > current.perimeter;
  return candidate.index < current.index;
}

function orient(points: readonly ProfilePoint[]): CorrespondenceSample[] {
  const copy = points.map((point) => ({ u: point.u, v: point.v }));
  if (signedArea(copy) >= 0) return copy;
  return [copy[0], ...copy.slice(1).reverse()];
}

function resampleClosed(points: readonly CorrespondenceSample[], sampleCount: number): CorrespondenceSample[] {
  const count = points.length;
  const cumulative = [0];
  for (let index = 0; index < count; index += 1) {
    cumulative.push(cumulative[index] + distance(points[index], points[(index + 1) % count]));
  }
  const total = cumulative[count];
  const samples: CorrespondenceSample[] = [];
  for (let sample = 0; sample < sampleCount; sample += 1) {
    const target = (total * sample) / sampleCount;
    let edge = 0;
    while (edge < count - 1 && cumulative[edge + 1] < target) edge += 1;
    const span = cumulative[edge + 1] - cumulative[edge];
    const t = span <= 1e-12 ? 0 : Math.min(1, Math.max(0, (target - cumulative[edge]) / span));
    const from = points[edge];
    const to = points[(edge + 1) % count];
    samples.push({
      u: from.u + (to.u - from.u) * t,
      v: from.v + (to.v - from.v) * t,
    });
  }
  return samples;
}

function alignSamples(samplesA: readonly CorrespondenceSample[], samplesB: readonly CorrespondenceSample[]) {
  const count = samplesA.length;
  let offset = 0;
  let best = Number.POSITIVE_INFINITY;
  for (let shift = 0; shift < count; shift += 1) {
    let cost = 0;
    for (let index = 0; index < count; index += 1) {
      cost += distance(samplesA[index], samplesB[(index + shift) % count]);
    }
    if (cost < best) {
      best = cost;
      offset = shift;
    }
  }
  const samples = Array.from({ length: count }, (_, index) => {
    const point = samplesB[(index + offset) % count];
    return { u: point.u, v: point.v };
  });
  return { offset, samples };
}

function signedArea(points: readonly { u: number; v: number }[]) {
  let sum = 0;
  for (let index = 0; index < points.length; index += 1) {
    const next = points[(index + 1) % points.length];
    sum += points[index].u * next.v - next.u * points[index].v;
  }
  return sum / 2;
}

function pathLength(points: readonly { u: number; v: number }[], closed: boolean) {
  if (points.length < 2) return 0;
  let length = 0;
  const limit = closed ? points.length : points.length - 1;
  for (let index = 0; index < limit; index += 1) {
    length += distance(points[index], points[(index + 1) % points.length]);
  }
  return length;
}

function distance(a: { u: number; v: number }, b: { u: number; v: number }) {
  return Math.hypot(a.u - b.u, a.v - b.v);
}

function result(
  status: CorrespondenceStatus,
  profileA: FaceProfile | null,
  profileB: FaceProfile | null,
  sampleCount: number,
  alignedA: CorrespondenceSample[] | null,
  alignedB: CorrespondenceSample[] | null,
  selectedLoopA: LoopRecord | null,
  selectedLoopB: LoopRecord | null,
  offset: number | null,
  additionalLoopsA: LoopRecord[],
  additionalLoopsB: LoopRecord[],
  reason: string,
): ProfileCorrespondence {
  return {
    version: PROFILE_CORRESPONDENCE_SETTINGS.version,
    status,
    sampleCount,
    profileA,
    profileB,
    alignedA: alignedA ?? [],
    alignedB: alignedB ?? [],
    offset,
    selectedLoopA,
    selectedLoopB,
    additionalLoopsA,
    additionalLoopsB,
    reason,
  };
}
