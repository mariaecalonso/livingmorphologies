import type { IsoMesh } from "../scan/isomesh";
import { faceFrames, type FaceFrame, type FaceId, type Vec3 } from "./contract";
import { FACE_PROFILE_SETTINGS, extractFaceProfile, type FaceProfile, type ProfileLoop, type ProfilePoint } from "./face-profile";
import { correspondProfiles } from "./profile-correspondence";
import { loftProfiles, type ProfileLoftRequest } from "./profile-loft";

const assert = (condition: boolean, message: string) => {
  if (!condition) throw new Error(message);
};

const near = (a: number, b: number, eps = 1e-4) => Math.abs(a - b) <= eps;

function point(u: number, v: number): ProfilePoint {
  return { u, v, position: { x: u, y: 0, z: v } };
}

function square(size: number): ProfilePoint[] {
  const half = size / 2;
  return [point(half, half), point(-half, half), point(-half, -half), point(half, -half)];
}

function loop(points: ProfilePoint[], closed = true): ProfileLoop {
  return { closed, points };
}

function profile(status: FaceProfile["status"], loops: ProfileLoop[]): FaceProfile {
  return {
    version: FACE_PROFILE_SETTINGS.version,
    status,
    face: "E",
    depth: 0,
    frame: null,
    planeOrigin: null,
    inward: null,
    loops,
    segments: [],
    bounds: null,
  };
}

function frame(id: FaceId, origin: Vec3, normal: Vec3, u: Vec3, v: Vec3): FaceFrame {
  return { id, origin, normal, u, v, extent: { u: 2, v: 2 } };
}

const alongX = {
  a: frame("E", { x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }, { x: 0, y: 0, z: 1 }),
  b: frame("E", { x: 5, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }, { x: 0, y: 0, z: 1 }),
};

const alongZ = {
  a: frame("N", { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 }, { x: 1, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }),
  b: frame("N", { x: 0, y: 1, z: 4 }, { x: 0, y: 0, z: 1 }, { x: 1, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }),
};

function request(
  sizeA: number,
  sizeB: number,
  frames: { a: FaceFrame; b: FaceFrame },
  steps: number,
): { loftRequest: ProfileLoftRequest; profileA: FaceProfile; profileB: FaceProfile } {
  const profileA = profile("ready", [loop(square(sizeA))]);
  const profileB = profile("ready", [loop(square(sizeB))]);
  const correspondence = correspondProfiles(profileA, profileB, 4);
  return {
    profileA,
    profileB,
    loftRequest: {
      correspondence,
      frameA: frames.a,
      frameB: frames.b,
      depthA: 0,
      depthB: 0,
      steps,
    },
  };
}

function sameGeometry(a: IsoMesh, b: IsoMesh) {
  if (a.triangles !== b.triangles || a.positions.length !== b.positions.length || a.indices.length !== b.indices.length) return false;
  for (let index = 0; index < a.positions.length; index += 1) {
    if (a.positions[index] !== b.positions[index] || a.normals[index] !== b.normals[index]) return false;
  }
  for (let index = 0; index < a.indices.length; index += 1) {
    if (a.indices[index] !== b.indices[index]) return false;
  }
  return true;
}

function ringBox(mesh: IsoMesh, ring: number, sampleCount: number) {
  let minY = Infinity;
  let maxY = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  let x = 0;
  let y = 0;
  let z = 0;
  for (let sample = 0; sample < sampleCount; sample += 1) {
    const offset = (ring * sampleCount + sample) * 3;
    const px = mesh.positions[offset];
    const py = mesh.positions[offset + 1];
    const pz = mesh.positions[offset + 2];
    minY = Math.min(minY, py);
    maxY = Math.max(maxY, py);
    minZ = Math.min(minZ, pz);
    maxZ = Math.max(maxZ, pz);
    x += px;
    y += py;
    z += pz;
  }
  return { widthY: maxY - minY, widthZ: maxZ - minZ, x: x / sampleCount, y: y / sampleCount, z: z / sampleCount };
}

const built = request(4, 1, alongX, 5);
const beforeA = JSON.stringify(built.profileA);
const beforeB = JSON.stringify(built.profileB);
const beforeCorrespondence = JSON.stringify(built.loftRequest.correspondence);
const frameAX = built.loftRequest.frameA?.origin.x;
const loft = loftProfiles(built.loftRequest);
const again = loftProfiles(built.loftRequest);
assert(loft.status === "ready" && loft.geometry !== null, "two squares loft into a mesh");
if (!loft.geometry || !again.geometry) throw new Error("unreachable");
assert(loft.sampleCount === 4 && loft.longitudinalSteps === 5, "sample and ring counts are recorded");
assert(loft.vertexCount === 20 && loft.triangleCount === 32, "counts follow the ring formula");
assert(loft.geometry.triangles === 32, "the mesh triangle count matches");
assert(loft.geometry.positions.length === 60 && loft.geometry.normals.length === 60 && loft.geometry.indices.length === 96, "buffers have the formula length");
assert(sameGeometry(loft.geometry, again.geometry), "a second loft is identical");
assert(loft.geometry.positions !== again.geometry.positions && loft.geometry.indices !== again.geometry.indices, "each loft allocates new buffers");
assert(JSON.stringify(built.profileA) === beforeA && JSON.stringify(built.profileB) === beforeB, "face profiles are not rewritten");
assert(JSON.stringify(built.loftRequest.correspondence) === beforeCorrespondence, "correspondence is not rewritten");
assert(built.loftRequest.frameA?.origin.x === frameAX, "face frames are not rewritten");

for (let index = 0; index < loft.geometry.positions.length; index += 1) {
  assert(Number.isFinite(loft.geometry.positions[index]), "positions are finite");
  assert(Number.isFinite(loft.geometry.normals[index]), "normals are finite");
}
for (let index = 0; index < loft.geometry.indices.length; index += 1) {
  const vertex = loft.geometry.indices[index];
  assert(vertex >= 0 && vertex < loft.vertexCount, "triangle indices address a vertex");
}
for (let triangle = 0; triangle < loft.triangleCount; triangle += 1) {
  const rings = [0, 1, 2].map((corner) => Math.floor(loft.geometry!.indices[triangle * 3 + corner] / loft.sampleCount));
  const low = Math.min(...rings);
  const high = Math.max(...rings);
  assert(high - low === 1, "every triangle joins two consecutive rings");
}

const first = ringBox(loft.geometry, 0, 4);
const middle = ringBox(loft.geometry, 2, 4);
const last = ringBox(loft.geometry, 4, 4);
assert(near(first.widthY, 4) && near(first.widthZ, 4), "the wide profile keeps its size");
assert(near(last.widthY, 1) && near(last.widthZ, 1), "the narrow profile keeps its size");
assert(middle.widthY < first.widthY - 0.5 && middle.widthY > last.widthY + 0.5, "the connector tapers between the two sizes");
assert(near(first.x, 0) && near(last.x, 5), "the connector travels from the first profile to the second");

const shifted = request(2, 2, { a: alongX.a, b: frame("W", { x: 5, y: 2, z: 0 }, { x: -1, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }, { x: 0, y: 0, z: -1 }) }, 3);
const moved = loftProfiles(shifted.loftRequest);
assert(moved.status === "ready" && moved.geometry !== null, "a moved end frame still lofts");
if (!moved.geometry) throw new Error("unreachable");
const movedEnd = ringBox(moved.geometry, moved.longitudinalSteps - 1, moved.sampleCount);
assert(near(movedEnd.x, 5) && near(movedEnd.y, 2), "the end ring sits on the second profile");

const vertical = request(2, 2, alongZ, 4);
const risen = loftProfiles(vertical.loftRequest);
assert(risen.status === "ready" && risen.geometry !== null, "a north-facing pair still lofts");
if (!risen.geometry) throw new Error("unreachable");
const risenEnd = ringBox(risen.geometry, risen.longitudinalSteps - 1, risen.sampleCount);
assert(near(risenEnd.z, 4) && near(risenEnd.y, 1), "the transition follows the profile centers rather than a fixed axis");

for (let vertex = 0; vertex < loft.vertexCount; vertex += 1) {
  const offset = vertex * 3;
  const normal = {
    x: loft.geometry.normals[offset],
    y: loft.geometry.normals[offset + 1],
    z: loft.geometry.normals[offset + 2],
  };
  const length = Math.hypot(normal.x, normal.y, normal.z);
  assert(near(length, 1, 1e-3), "normals are unit length");
  const ring = Math.floor(vertex / loft.sampleCount);
  const t = ring / (loft.longitudinalSteps - 1);
  const radialY = loft.geometry.positions[offset + 1] - (first.y + (last.y - first.y) * t);
  const radialZ = loft.geometry.positions[offset + 2] - (first.z + (last.z - first.z) * t);
  assert(normal.y * radialY + normal.z * radialZ > 0.2, "normals point away from the transition");
}

const blocked = loftProfiles({
  ...built.loftRequest,
  correspondence: correspondProfiles(profile("ready", [loop([point(0, 0), point(1, 0)], false)]), built.profileB, 4),
});
assert(blocked.status === "blocked" && blocked.geometry === null && blocked.triangleCount === 0, "a blocked correspondence creates no mesh");

const empty = loftProfiles({
  ...built.loftRequest,
  correspondence: correspondProfiles(profile("empty", []), built.profileB, 4),
});
assert(empty.status === "empty" && empty.geometry === null, "an empty correspondence creates no mesh");

assert(loftProfiles({ ...built.loftRequest, steps: 1 }).status === "invalid", "one loft ring is invalid");
assert(loftProfiles({ ...built.loftRequest, steps: 2.5 }).status === "invalid", "a fractional ring count is invalid");
assert(loftProfiles({ ...built.loftRequest, depthA: -0.2 }).status === "invalid", "an outward section depth is invalid");

const coincident = loftProfiles({
  ...built.loftRequest,
  frameB: alongX.a,
});
assert(coincident.status === "blocked" && coincident.geometry === null, "coincident profile centers do not invent a direction");

function boxMesh(): IsoMesh {
  const coordinates = [
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
    positions: Float32Array.from(coordinates),
    normals: new Float32Array(coordinates.length),
    indices: Uint32Array.from(faces.flat()),
    triangles: 12,
  };
}

const meshA = boxMesh();
const meshB = boxMesh();
const frames = faceFrames({ min: { x: -1, y: -1, z: -1 }, max: { x: 1, y: 1, z: 1 } });
const sectionA = extractFaceProfile(meshA, frames.E, 0.5);
const sectionB = extractFaceProfile(meshB, frames.N, 0.5);
const positionsA = Float32Array.from(meshA.positions);
const indicesA = Uint32Array.from(meshA.indices);
const positionsB = Float32Array.from(meshB.positions);
const indicesB = Uint32Array.from(meshB.indices);
const profileJsonA = JSON.stringify(sectionA);
const profileJsonB = JSON.stringify(sectionB);
const linked = correspondProfiles(sectionA, sectionB, 8);
const linkedJson = JSON.stringify(linked);
const fromMeshes = loftProfiles({
  correspondence: linked,
  frameA: frames.E,
  frameB: frames.N,
  depthA: 0.5,
  depthB: 0.5,
  steps: 4,
});
assert(fromMeshes.status === "ready" && fromMeshes.geometry !== null, "extracted sections loft");
for (let index = 0; index < positionsA.length; index += 1) {
  assert(meshA.positions[index] === positionsA[index], "source mesh A was written");
  assert(meshB.positions[index] === positionsB[index], "source mesh B was written");
}
for (let index = 0; index < indicesA.length; index += 1) {
  assert(meshA.indices[index] === indicesA[index], "source mesh A indices were written");
  assert(meshB.indices[index] === indicesB[index], "source mesh B indices were written");
}
assert(JSON.stringify(sectionA) === profileJsonA && JSON.stringify(sectionB) === profileJsonB, "extracted profiles stay unchanged");
assert(JSON.stringify(linked) === linkedJson, "the mesh correspondence stays unchanged");

console.log(`skill4 profile loft ok · vertices ${loft.vertexCount} · triangles ${loft.triangleCount} · span ${loft.span}`);
