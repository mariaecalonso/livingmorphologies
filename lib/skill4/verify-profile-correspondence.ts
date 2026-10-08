import { FACE_PROFILE_SETTINGS, type FaceProfile, type ProfileLoop, type ProfilePoint } from "./face-profile";
import { correspondProfiles, type CorrespondenceSample } from "./profile-correspondence";

const assert = (condition: boolean, message: string) => {
  if (!condition) throw new Error(message);
};

const near = (a: number, b: number, eps = 1e-5) => Math.abs(a - b) <= eps;

function point(u: number, v: number): ProfilePoint {
  return { u, v, position: { x: u, y: 0, z: v } };
}

function circle(count: number, radius: number, turn = 0): ProfilePoint[] {
  return Array.from({ length: count }, (_, index) => {
    const angle = ((index + turn) / count) * Math.PI * 2;
    return point(Math.cos(angle) * radius, Math.sin(angle) * radius);
  });
}

function square(size: number, clockwise = false): ProfilePoint[] {
  const half = size / 2;
  const points = [point(half, half), point(-half, half), point(-half, -half), point(half, -half)];
  return clockwise ? [points[0], ...points.slice(1).reverse()] : points;
}

function loop(points: ProfilePoint[], closed = true): ProfileLoop {
  return { closed, points };
}

function profile(status: FaceProfile["status"], loops: ProfileLoop[]): FaceProfile {
  return {
    version: FACE_PROFILE_SETTINGS.version,
    status,
    face: "E",
    depth: 0.15,
    frame: null,
    planeOrigin: null,
    inward: null,
    loops,
    segments: [],
    bounds: null,
  };
}

function span(samples: CorrespondenceSample[]) {
  const u = samples.map((sample) => sample.u);
  const v = samples.map((sample) => sample.v);
  return { width: Math.max(...u) - Math.min(...u), height: Math.max(...v) - Math.min(...v) };
}

function signedArea(samples: readonly CorrespondenceSample[]) {
  let sum = 0;
  for (let index = 0; index < samples.length; index += 1) {
    const next = samples[(index + 1) % samples.length];
    sum += samples[index].u * next.v - next.u * samples[index].v;
  }
  return sum / 2;
}

function finiteSamples(samples: readonly CorrespondenceSample[], label: string) {
  assert(samples.every((sample) => Number.isFinite(sample.u) && Number.isFinite(sample.v)), `${label} samples are finite`);
}

const dense = profile("ready", [loop(circle(17, 1.5))]);
const sparse = profile("ready", [loop(circle(43, 1.5, 2))]);
const matched = correspondProfiles(dense, sparse, 32);
assert(matched.status === "ready", "different loop sizes correspond");
assert(matched.alignedA.length === 32 && matched.alignedB.length === 32, "both profiles resample to the requested count");
assert(matched.sampleCount === 32, "sample count is recorded");
finiteSamples(matched.alignedA, "A");
finiteSamples(matched.alignedB, "B");
assert(signedArea(matched.alignedA) > 0 && signedArea(matched.alignedB) > 0, "both resampled loops wind counterclockwise");
const matchedAgain = correspondProfiles(dense, sparse, 32);
assert(matched.offset === matchedAgain.offset, "cyclic alignment is stable");
assert(JSON.stringify(matched.alignedA) === JSON.stringify(matchedAgain.alignedA), "aligned A is deterministic");
assert(JSON.stringify(matched.alignedB) === JSON.stringify(matchedAgain.alignedB), "aligned B is deterministic");
const spacing = (Math.PI * 3) / 32;
const phaseError = matched.alignedA.reduce((sum, sample, index) => {
  const other = matched.alignedB[index];
  return sum + Math.hypot(sample.u - other.u, sample.v - other.v);
}, 0) / 32;
assert(phaseError < spacing * 0.5, "a shifted circle aligns within half a sample");

const clockwise = profile("ready", [loop(square(2, true))]);
const counterclockwise = profile("ready", [loop(square(2))]);
const wound = correspondProfiles(clockwise, counterclockwise, 4);
assert(wound.status === "ready", "opposite windings correspond");
assert(signedArea(wound.alignedA) > 0 && signedArea(wound.alignedB) > 0, "clockwise input is reversed onto the shared winding");
assert(wound.alignedA.every((sample, index) => near(sample.u, wound.alignedB[index].u) && near(sample.v, wound.alignedB[index].v)), "the same square meets after winding normalization");

const wide = profile("ready", [loop(square(4))]);
const narrow = profile("ready", [loop(square(0.5))]);
const scaled = correspondProfiles(wide, narrow, 8);
assert(scaled.status === "ready", "different sizes correspond");
const wideSpan = span(scaled.alignedA);
const narrowSpan = span(scaled.alignedB);
assert(near(wideSpan.width, 4) && near(wideSpan.height, 4), "the larger profile keeps its UV size");
assert(near(narrowSpan.width, 0.5) && near(narrowSpan.height, 0.5), "the smaller profile keeps its UV size");
assert(wideSpan.width / narrowSpan.width > 7, "the profiles are not scaled onto each other");

const corners = square(2);
const rotated = [corners[1], corners[2], corners[3], corners[0]];
const startA = profile("ready", [loop(corners)]);
const startB = profile("ready", [loop(rotated)]);
const shift = correspondProfiles(startA, startB, 4);
const shiftAgain = correspondProfiles(startA, startB, 4);
assert(shift.status === "ready" && shift.offset === 3 && shift.offset === shiftAgain.offset, "the vertex shift is a deterministic offset");
assert(shift.alignedA.every((sample, index) => near(sample.u, shift.alignedB[index].u) && near(sample.v, shift.alignedB[index].v)), "the offset brings matching corners together");

const diamond = [
  point(Math.SQRT2, 0),
  point(0, Math.SQRT2),
  point(-Math.SQRT2, 0),
  point(0, -Math.SQRT2),
];
const tied = correspondProfiles(profile("ready", [loop(square(2))]), profile("ready", [loop(diamond)]), 4);
const tiedAgain = correspondProfiles(profile("ready", [loop(square(2))]), profile("ready", [loop(diamond)]), 4);
assert(tied.offset === 0 && tiedAgain.offset === 0, "equal alignment costs keep the lowest offset");

const small = loop(square(0.4));
const large = loop(square(3));
const open = loop([point(0, 0), point(2, 0), point(2, 0.2)], false);
const many = profile("ready", [small, large, open]);
const single = profile("ready", [loop(square(3))]);
const beforeMany = JSON.stringify(many);
const beforeSingle = JSON.stringify(single);
const smallRef = many.loops[0].points;
const largeRef = many.loops[1].points;
const chosen = correspondProfiles(many, single, 8);
assert(JSON.stringify(many) === beforeMany && JSON.stringify(single) === beforeSingle, "source profiles are not rewritten");
assert(many.loops[0].points === smallRef && many.loops[1].points === largeRef, "source point arrays stay in place");
assert(chosen.selectedLoopA?.index === 1, "the largest loop is selected");
assert(chosen.additionalLoopsA.map((item) => item.index).join() === "0,2", "the other loops stay identified");
assert(chosen.additionalLoopsA.some((item) => item.index === 2 && item.closed === false), "the open loop is retained and not merged");
const chosenSpan = span(chosen.alignedA);
assert(near(chosenSpan.width, 3) && chosenSpan.width > 2, "samples come from the large loop");

const long = loop([point(2, 0.5), point(-2, 0.5), point(-2, -0.5), point(2, -0.5)]);
const compact = loop(square(2));
const tie = correspondProfiles(profile("ready", [compact, long]), single, 4);
assert(tie.selectedLoopA?.index === 1, "equal area prefers the longer perimeter");

const empty = profile("empty", []);
const absent = correspondProfiles(empty, single, 8);
assert(absent.status === "empty" && absent.alignedA.length === 0 && absent.alignedB.length === 0, "an empty profile does not invent samples");
assert(correspondProfiles(single, empty, 8).status === "empty", "an empty partner does not invent samples");

const invalid = correspondProfiles(profile("invalid", []), single, 8);
assert(invalid.status === "invalid" && invalid.alignedA.length === 0, "an invalid profile stays invalid");
assert(correspondProfiles(null, single, 8).status === "invalid", "a missing profile is invalid");
assert(correspondProfiles(single, single, 2).status === "invalid", "fewer than three samples is invalid");

const blocked = correspondProfiles(profile("ready", [open]), single, 8);
assert(blocked.status === "blocked" && blocked.alignedA.length === 0 && blocked.alignedB.length === 0, "an open-only profile does not invent a closed section");
assert(blocked.additionalLoopsA.length === 1 && blocked.additionalLoopsA[0].index === 0, "the unused open loop is still reported");
assert(correspondProfiles(profile("ready", [loop([point(0, 0), point(1, 0), point(2, 0)])]), single, 8).status === "blocked", "a loop with no area is not usable");

console.log(`skill4 profile correspondence ok · samples 32 · offset ${matched.offset} · selected ${chosen.selectedLoopA?.index}`);
