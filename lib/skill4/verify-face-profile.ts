import type { IsoMesh } from "../scan/isomesh";
import { FACE_IDS, faceFrames, type FaceFrame, type Vec3 } from "./contract";
import { extractFaceProfile, profilePointToWorld, type FaceProfile, type ProfilePoint } from "./face-profile";
import { PROVISIONAL_MOCK_IDS, loadProvisionalMock } from "./fixtures";

const assert = (condition: boolean, message: string) => {
  if (!condition) throw new Error(message);
};

const near = (a: number, b: number, eps = 1e-5) => Math.abs(a - b) <= eps;

function boxMesh(): IsoMesh {
  const p = [
    -1, -1, -1, 1, -1, -1, 1, 1, -1, -1, 1, -1,
    -1, -1, 1, 1, -1, 1, 1, 1, 1, -1, 1, 1,
  ];
  const faces = [
    [0, 1, 2, 0, 2, 3],
    [4, 6, 5, 4, 7, 6],
    [0, 4, 5, 0, 5, 1],
    [1, 5, 6, 1, 6, 2],
    [2, 6, 7, 2, 7, 3],
    [3, 7, 4, 3, 4, 0],
  ];
  return {
    positions: Float32Array.from(p),
    normals: new Float32Array(p.length),
    indices: Uint32Array.from(faces.flat()),
    triangles: 12,
  };
}

function triangleMesh(verts: number[]): IsoMesh {
  const vertices = verts.length / 3;
  return {
    positions: Float32Array.from(verts),
    normals: new Float32Array(verts.length),
    indices: Uint32Array.from({ length: vertices }, (_, index) => index),
    triangles: vertices / 3,
  };
}

function snapshot(mesh: IsoMesh) {
  return {
    positions: mesh.positions,
    normals: mesh.normals,
    indices: mesh.indices,
    positionValues: Float32Array.from(mesh.positions),
    normalValues: Float32Array.from(mesh.normals),
    indexValues: Uint32Array.from(mesh.indices),
    triangles: mesh.triangles,
  };
}

function assertUntouched(mesh: IsoMesh, before: ReturnType<typeof snapshot>, label: string) {
  assert(mesh.positions === before.positions && mesh.normals === before.normals && mesh.indices === before.indices, `${label} buffers were replaced`);
  assert(mesh.triangles === before.triangles, `${label} triangle count changed`);
  for (let i = 0; i < before.positionValues.length; i += 1) {
    assert(mesh.positions[i] === before.positionValues[i], `${label} positions were written`);
  }
  for (let i = 0; i < before.normalValues.length; i += 1) {
    assert(mesh.normals[i] === before.normalValues[i], `${label} normals were written`);
  }
  for (let i = 0; i < before.indexValues.length; i += 1) {
    assert(mesh.indices[i] === before.indexValues[i], `${label} indices were written`);
  }
}

function axisOf(normal: Vec3): "x" | "y" | "z" {
  const ax = Math.abs(normal.x);
  const ay = Math.abs(normal.y);
  const az = Math.abs(normal.z);
  if (ax >= ay && ax >= az) return "x";
  if (ay >= az) return "y";
  return "z";
}

function assertFrame(profile: FaceProfile, frame: FaceFrame, depth: number) {
  assert(profile.face === frame.id, `${frame.id} keeps its face id`);
  assert(profile.frame === frame, `${frame.id} keeps its frame`);
  assert(profile.planeOrigin !== null && profile.inward !== null, `${frame.id} has a plane`);
  if (!profile.planeOrigin || !profile.inward) throw new Error("unreachable");
  assert(near(profile.planeOrigin.x, frame.origin.x - frame.normal.x * depth), `${frame.id} plane x`);
  assert(near(profile.planeOrigin.y, frame.origin.y - frame.normal.y * depth), `${frame.id} plane y`);
  assert(near(profile.planeOrigin.z, frame.origin.z - frame.normal.z * depth), `${frame.id} plane z`);
  assert(near(profile.inward.x, -frame.normal.x) && near(profile.inward.y, -frame.normal.y) && near(profile.inward.z, -frame.normal.z), `${frame.id} inward axis`);
  const axis = axisOf(frame.normal);
  const fixed = frame.origin[axis] - frame.normal[axis] * depth;
  const points = profile.segments.flatMap((segment) => [segment.a, segment.b]);
  assert(points.length > 0, `${frame.id} has intersection points`);
  for (const point of points) {
    assert(Number.isFinite(point.u) && Number.isFinite(point.v), `${frame.id} uv is finite`);
    assert(near(point.position[axis], fixed), `${frame.id} section stays on its plane`);
    const dx = point.position.x - frame.origin.x;
    const dy = point.position.y - frame.origin.y;
    const dz = point.position.z - frame.origin.z;
    const u = dx * frame.u.x + dy * frame.u.y + dz * frame.u.z;
    const v = dx * frame.v.x + dy * frame.v.y + dz * frame.v.z;
    assert(near(point.u, u) && near(point.v, v), `${frame.id} uv uses that face frame`);
    const world = profilePointToWorld(frame, depth, point.u, point.v);
    assert(near(world.x, point.position.x) && near(world.y, point.position.y) && near(world.z, point.position.z), `${frame.id} uv reconstructs the cut`);
  }
}

function hasPoint(points: ProfilePoint[], u: number, v: number) {
  return points.some((point) => near(point.u, u) && near(point.v, v));
}

const depth = 0.5;
const box = boxMesh();
const boxBefore = snapshot(box);
const frames = faceFrames({ min: { x: -1, y: -1, z: -1 }, max: { x: 1, y: 1, z: 1 } });

for (const face of FACE_IDS) {
  const profile = extractFaceProfile(box, frames[face], depth);
  const again = extractFaceProfile(box, frames[face], depth);
  assert(profile.status === "ready", `${face} cuts the box`);
  assert(profile.loops.length === 1 && profile.loops[0].closed, `${face} is one closed profile`);
  assert(profile.segments.length >= 4, `${face} has a polygonal cut`);
  assert(JSON.stringify(profile) === JSON.stringify(again), `${face} chaining is deterministic`);
  assertFrame(profile, frames[face], depth);
  assert(profile.bounds !== null, `${face} has bounds`);
}
assertUntouched(box, boxBefore, "box");

const east = frames.E;
const openMesh = triangleMesh([0, -1, -1, 0, 1, -1, 1, 0, 0]);
const openBefore = snapshot(openMesh);
const open = extractFaceProfile(openMesh, east, depth);
assert(open.status === "ready" && open.segments.length === 1, "one triangle produces one segment");
assert(open.loops.length === 1 && open.loops[0].closed === false && open.loops[0].points.length === 2, "a single cut stays open");
assert(hasPoint(open.loops[0].points, -0.5, -0.5) && hasPoint(open.loops[0].points, 0.5, -0.5), "open cut uses east u/v");
assert(JSON.stringify(open) === JSON.stringify(extractFaceProfile(openMesh, east, depth)), "open chaining is deterministic");
assertUntouched(openMesh, openBefore, "open triangle");

const splitMesh = triangleMesh([
  0, -1, -1, 0, 1, -1, 1, 0, 0,
  0, -1, 0, 0, 1, 0, 1, 0, 1,
]);
const split = extractFaceProfile(splitMesh, east, depth);
assert(split.status === "ready" && split.loops.length === 2, "separated triangles stay separate");
assert(split.loops.every((loop) => loop.closed === false && loop.points.length === 2), "each separated cut is an open segment");
assert(JSON.stringify(split) === JSON.stringify(extractFaceProfile(splitMesh, east, depth)), "split chaining is deterministic");

const missed = extractFaceProfile(box, east, 3);
assert(missed.status === "empty" && missed.segments.length === 0 && missed.loops.length === 0 && missed.bounds === null, "a plane past the mesh is empty");
assert(extractFaceProfile(openMesh, east, 5).status === "empty", "a missed triangle is empty");

assert(extractFaceProfile(null, east, depth).status === "invalid", "a missing mesh is invalid");
assert(extractFaceProfile(box, null, depth).status === "invalid", "a missing frame is invalid");
assert(extractFaceProfile(box, east, Number.NaN).status === "invalid", "a non-finite depth is invalid");
assert(extractFaceProfile(box, east, -0.2).status === "invalid", "an outward depth is invalid");
assertUntouched(box, boxBefore, "box after invalid calls");

const fixtureNotes: string[] = [];
for (const id of PROVISIONAL_MOCK_IDS) {
  const handoff = loadProvisionalMock(id);
  assert(handoff.status === "ready", `${id} fixture is readable`);
  if (handoff.status !== "ready") throw new Error("unreachable");
  const before = snapshot(handoff.geometry);
  let ready = 0;
  let empty = 0;
  for (const face of FACE_IDS) {
    const profile = extractFaceProfile(handoff.geometry, handoff.faces[face], 0.15);
    const again = extractFaceProfile(handoff.geometry, handoff.faces[face], 0.15);
    assert(profile.status === "ready" || profile.status === "empty", `${id} ${face} returns a section result`);
    assert(JSON.stringify(profile) === JSON.stringify(again), `${id} ${face} is deterministic`);
    if (profile.status === "empty") {
      empty += 1;
      assert(profile.segments.length === 0 && profile.loops.length === 0, `${id} ${face} empty section has no invented geometry`);
    } else {
      ready += 1;
      assertFrame(profile, handoff.faces[face], 0.15);
      assert(profile.loops.length > 0, `${id} ${face} chains its segments`);
    }
    const far = extractFaceProfile(handoff.geometry, handoff.faces[face], 25);
    assert(far.status === "empty", `${id} ${face} far plane is empty`);
  }
  assertUntouched(handoff.geometry, before, id);
  fixtureNotes.push(`${id} ready ${ready} empty ${empty}`);
}

const eastAgain = extractFaceProfile(box, east, depth);
const north = extractFaceProfile(box, frames.N, depth);
assert(eastAgain.planeOrigin?.x === 0.5 && north.planeOrigin?.z === 0.5, "east and north use different axes");
assert(eastAgain.face === "E" && north.face === "N", "face ids follow the selected frame");

console.log(`skill4 face profile ok · box closed 6 · open 1 · split 2 · ${fixtureNotes.join(" · ")}`);
