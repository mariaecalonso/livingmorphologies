import { connectorFrame, deformRing, type DeformationDna } from "./hybrid-deformation";
import type { Vec3 } from "./contract";

const assert = (condition: boolean, message: string) => {
  if (!condition) throw new Error(message);
};

const frame = connectorFrame({ x: 0, y: 0, z: 0 }, { x: 4, y: 0, z: 0 });
if (!frame) throw new Error("the test frame is defined");

const ring: Vec3[] = [
  { x: 2, y: 1, z: 1 },
  { x: 2, y: -1, z: 1 },
  { x: 2, y: -1, z: -1 },
  { x: 2, y: 1, z: -1 },
];

function dna(criteria: DeformationDna["criteria"]): DeformationDna {
  return { criteria };
}

function samePoints(a: readonly Vec3[], b: readonly Vec3[]) {
  return a.length === b.length && a.every((point, index) => point.x === b[index].x && point.y === b[index].y && point.z === b[index].z);
}

function displacement(before: readonly Vec3[], after: readonly Vec3[]) {
  return after.reduce((sum, point, index) => sum + Math.hypot(point.x - before[index].x, point.y - before[index].y, point.z - before[index].z), 0);
}

function finite(points: readonly Vec3[]) {
  return points.every((point) => Number.isFinite(point.x) && Number.isFinite(point.y) && Number.isFinite(point.z));
}

const high = dna([{ criterionId: "openness", value: 2 }]);
const ends = deformRing(ring, 0, high, frame);
const finalRing = deformRing(ring, 1, high, frame);
assert(samePoints(ring, ends), "t = 0 leaves the ring unchanged");
assert(samePoints(ring, finalRing), "t = 1 leaves the ring unchanged");

const middle = deformRing(ring, 0.5, high, frame);
assert(displacement(ring, middle) > 0.2, "a middle ring expands when openness is high");
assert(finite(middle), "deformed positions stay finite");

const low = deformRing(ring, 0.5, dna([{ criterionId: "openness", value: 0.4 }]), frame);
const none = deformRing(ring, 0.5, dna([{ criterionId: "openness", value: 0 }]), frame);
assert(samePoints(ring, none), "a zero criterion leaves the interpolated ring");
assert(displacement(ring, low) < displacement(ring, middle), "a lower value moves the ring less than a high value");

const again = deformRing(ring, 0.5, high, frame);
assert(samePoints(middle, again), "the same DNA produces the same ring");

const before = ring.map((point) => ({ ...point }));
deformRing(ring, 0.5, high, frame);
assert(samePoints(ring, before), "the input ring is not mutated");

const unused = deformRing(ring, 0.5, dna([{ criterionId: "immersive", value: 2 }]), frame);
assert(samePoints(ring, unused), "an unmapped criterion does not move the ring");

const plate = deformRing(ring, 0.5, dna([{ criterionId: "plate-articulation", value: 2 }]), frame);
assert(plate.every((point, index) => point.y !== ring[index].y && point.z === ring[index].z), "plate articulation offsets the section bitangent");

const proportional = deformRing(ring, 0.5, dna([{ criterionId: "proportionality", value: 2 }]), frame);
const width = (points: readonly Vec3[]) => Math.max(...points.map((point) => point.y)) - Math.min(...points.map((point) => point.y));
const depth = (points: readonly Vec3[]) => Math.max(...points.map((point) => point.z)) - Math.min(...points.map((point) => point.z));
assert(width(proportional) < width(ring) && depth(proportional) > depth(ring), "proportionality scales the two section axes differently");

console.log("skill4 hybrid deformation ok");
