import { MODULE_HEIGHT_FT } from "./placement";
import type { PlacedModule } from "./placement";

/** Rendered module axes: X east, Y up from the base, Z north. Same swap the site mesh uses. */
const GRID = 8;
const SIZE = MODULE_HEIGHT_FT;
const HALF = SIZE / 2;
const CELL = SIZE / GRID;
const BAND = 1.6;
const STEP = SIZE;
const CENTER_TOLERANCE = 3;
const SLOT_REACH = 18;

export type FaceId = "E" | "W" | "N" | "S" | "T" | "B";
export type FaceMirror = "x" | "z" | null;

export type TilePose = {
  rotationY: number;
  mirror: FaceMirror;
};

export type FaceHighlight = {
  kind: "face" | "opening";
  east: number;
  up: number;
  north: number;
  width: number;
  height: number;
  axis: "x" | "y" | "z";
  compatible: boolean;
};

export type FaceMatch = {
  pose: TilePose;
  x: number;
  y: number;
  z: number;
  valid: boolean;
  score: number;
  rank: number;
  total: number;
  neighborName: string | null;
  pair: string | null;
  warning: string | null;
  highlights: FaceHighlight[];
};

type Sample = { x: number; y: number; z: number; opening: boolean; row: number; col: number };

type FaceSheet = {
  id: FaceId;
  samples: Sample[];
  openings: number;
  sill: number;
};

type FaceBook = Record<FaceId, FaceSheet>;

type Slot = { x: number; y: number; z: number };

const FACES: FaceId[] = ["E", "W", "N", "S", "T", "B"];
const YAWS = [0, Math.PI / 2, Math.PI, Math.PI * 1.5];
const MIRRORS: FaceMirror[] = [null, "x", "z"];

const books = new WeakMap<object, FaceBook>();

function sheet(id: FaceId, fixed: "x" | "y" | "z", plane: number, sign: number, uKey: "x" | "y" | "z", vKey: "x" | "y" | "z", u0: number, v0: number): (point: { x: number; y: number; z: number }, solid: Uint8Array) => void {
  return (point, solid) => {
    const along = point[fixed];
    if (Math.abs(along - plane) > BAND) return;
    const u = point[uKey];
    const v = point[vKey];
    if (u < u0 - 0.2 || u > u0 + SIZE + 0.2 || v < v0 - 0.2 || v > v0 + SIZE + 0.2) return;
    const row = Math.max(0, Math.min(GRID - 1, Math.floor((u - u0) / CELL)));
    const col = Math.max(0, Math.min(GRID - 1, Math.floor((v - v0) / CELL)));
    solid[row * GRID + col] = 1;
    void sign;
  };
}

/** Reads openings from the mesh. An empty face stays empty; no opening is invented. */
export function faceBook(positions: ArrayLike<number>): FaceBook {
  const cached = books.get(positions);
  if (cached) return cached;
  let minUp = Infinity;
  const count = Math.floor(positions.length / 3);
  for (let index = 0; index < count; index += 1) minUp = Math.min(minUp, positions[index * 3 + 2]);
  if (!Number.isFinite(minUp)) minUp = 0;
  const points: { x: number; y: number; z: number }[] = [];
  for (let index = 0; index < count; index += 1) {
    points.push({
      x: positions[index * 3],
      y: positions[index * 3 + 2] - minUp,
      z: positions[index * 3 + 1],
    });
  }
  const painters = {
    E: sheet("E", "x", HALF, 1, "y", "z", 0, -HALF),
    W: sheet("W", "x", -HALF, -1, "y", "z", 0, -HALF),
    N: sheet("N", "z", HALF, 1, "y", "x", 0, -HALF),
    S: sheet("S", "z", -HALF, -1, "y", "x", 0, -HALF),
    T: sheet("T", "y", SIZE, 1, "x", "z", -HALF, -HALF),
    B: sheet("B", "y", 0, -1, "x", "z", -HALF, -HALF),
  };
  const book = {} as FaceBook;
  for (const id of FACES) {
    const solid = new Uint8Array(GRID * GRID);
    for (const point of points) painters[id](point, solid);
    const opening = openingsOf(solid);
    const samples: Sample[] = [];
    let sill = GRID;
    let holes = 0;
    for (let row = 0; row < GRID; row += 1) {
      for (let col = 0; col < GRID; col += 1) {
        const index = row * GRID + col;
        const isOpening = opening[index] === 1;
        const isSolid = solid[index] === 1;
        if (!isOpening && !isSolid) continue;
        if (isOpening) {
          holes += 1;
          sill = Math.min(sill, row);
        }
        samples.push({ ...cellPoint(id, row, col), opening: isOpening, row, col });
      }
    }
    book[id] = { id, samples, openings: holes, sill: holes > 0 ? sill : -1 };
  }
  books.set(positions, book);
  return book;
}

function openingsOf(solid: Uint8Array) {
  let filled = 0;
  for (const value of solid) filled += value;
  const opening = new Uint8Array(GRID * GRID);
  if (filled < 4) return opening;
  const exterior = new Uint8Array(GRID * GRID);
  const queue: number[] = [];
  const push = (index: number) => {
    if (index < 0 || index >= GRID * GRID || solid[index] || exterior[index]) return;
    exterior[index] = 1;
    queue.push(index);
  };
  for (let index = 0; index < GRID; index += 1) {
    push(index);
    push((GRID - 1) * GRID + index);
    push(index * GRID);
    push(index * GRID + GRID - 1);
  }
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const index = queue[cursor];
    const row = Math.floor(index / GRID);
    const col = index % GRID;
    if (col > 0) push(index - 1);
    if (col < GRID - 1) push(index + 1);
    if (row > 0) push(index - GRID);
    if (row < GRID - 1) push(index + GRID);
  }
  for (let index = 0; index < solid.length; index += 1) {
    if (solid[index] || exterior[index]) continue;
    opening[index] = 1;
  }
  for (let row = 0; row < GRID; row += 1) {
    for (let col = 0; col < GRID; col += 1) {
      const index = row * GRID + col;
      if (solid[index] || opening[index]) continue;
      const left = col > 0 && solid[index - 1] === 1;
      const right = col < GRID - 1 && solid[index + 1] === 1;
      const below = row > 0 && solid[index - GRID] === 1;
      const above = row < GRID - 1 && solid[index + GRID] === 1;
      if ((left && right) || (below && above)) opening[index] = 1;
    }
  }
  return opening;
}

function cellPoint(id: FaceId, row: number, col: number) {
  const u = row * CELL + CELL / 2;
  const v = col * CELL + CELL / 2;
  if (id === "E" || id === "W") return { x: id === "E" ? HALF : -HALF, y: u, z: v - HALF };
  if (id === "N" || id === "S") return { x: v - HALF, y: u, z: id === "N" ? HALF : -HALF };
  return { x: u - HALF, y: id === "T" ? SIZE : 0, z: v - HALF };
}

export function posePoint(x: number, y: number, z: number, pose: TilePose) {
  let east = x;
  let north = z;
  if (pose.mirror === "x") east = -east;
  if (pose.mirror === "z") north = -north;
  const cos = Math.cos(pose.rotationY);
  const sin = Math.sin(pose.rotationY);
  return {
    east: east * cos - north * sin,
    north: east * sin + north * cos,
    up: y,
  };
}

function worldOf(origin: Slot, local: { x: number; y: number; z: number }, pose: TilePose) {
  const turned = posePoint(local.x, local.y, local.z, pose);
  return { east: origin.x + turned.east, up: origin.y + turned.up, north: origin.z + turned.north };
}

function axisOf(normal: { east: number; up: number; north: number }): "x" | "y" | "z" | null {
  const ax = Math.abs(normal.east);
  const ay = Math.abs(normal.up);
  const az = Math.abs(normal.north);
  if (ax > ay && ax > az && ax > 0.7) return "x";
  if (ay > ax && ay > az && ay > 0.7) return "y";
  if (az > ax && az > ay && az > 0.7) return "z";
  return null;
}

function faceNormal(id: FaceId, pose: TilePose) {
  const local = id === "E" ? { x: 1, y: 0, z: 0 }
    : id === "W" ? { x: -1, y: 0, z: 0 }
      : id === "N" ? { x: 0, y: 0, z: 1 }
        : id === "S" ? { x: 0, y: 0, z: -1 }
          : id === "T" ? { x: 0, y: 1, z: 0 }
            : { x: 0, y: -1, z: 0 };
  return posePoint(local.x, local.y, local.z, pose);
}

const FACE_LABEL: Record<FaceId, string> = { E: "East", W: "West", N: "North", S: "South", T: "Top", B: "Bottom" };

function binKey(point: { east: number; up: number; north: number }, axis: "x" | "y" | "z", origin: Slot) {
  const a = axis === "y" ? point.east - origin.x + HALF : point.up - origin.y;
  const b = axis === "x" ? point.north - origin.z + HALF : axis === "z" ? point.east - origin.x + HALF : point.north - origin.z + HALF;
  const row = Math.max(0, Math.min(GRID - 1, Math.floor(a / CELL)));
  const col = Math.max(0, Math.min(GRID - 1, Math.floor(b / CELL)));
  return row * GRID + col;
}

function pairScore(
  guest: FaceSheet,
  host: FaceSheet,
  guestOrigin: Slot,
  hostOrigin: Slot,
  guestPose: TilePose,
  hostPose: TilePose,
  axis: "x" | "y" | "z",
) {
  const guestOpen = new Uint8Array(GRID * GRID);
  const guestSolid = new Uint8Array(GRID * GRID);
  const hostOpen = new Uint8Array(GRID * GRID);
  const hostSolid = new Uint8Array(GRID * GRID);
  for (const sample of guest.samples) {
    const key = binKey(worldOf(guestOrigin, sample, guestPose), axis, guestOrigin);
    if (sample.opening) guestOpen[key] = 1;
    else guestSolid[key] = 1;
  }
  for (const sample of host.samples) {
    const key = binKey(worldOf(hostOrigin, sample, hostPose), axis, guestOrigin);
    if (sample.opening) hostOpen[key] = 1;
    else hostSolid[key] = 1;
  }
  let overlap = 0;
  let obstruction = 0;
  let guestSill = GRID;
  let hostSill = GRID;
  for (let index = 0; index < GRID * GRID; index += 1) {
    if (guestOpen[index] && hostOpen[index]) overlap += 1;
    if (guestOpen[index] && hostSolid[index]) obstruction += 1;
    if (hostOpen[index] && guestSolid[index]) obstruction += 1;
    if (guestOpen[index]) guestSill = Math.min(guestSill, Math.floor(index / GRID));
    if (hostOpen[index]) hostSill = Math.min(hostSill, Math.floor(index / GRID));
  }
  if (overlap < 2 || guest.openings < 2 || host.openings < 2) return null;
  const floor = guestSill === GRID || hostSill === GRID ? GRID : Math.abs(guestSill - hostSill);
  const size = Math.abs(guest.openings - host.openings) / Math.max(guest.openings, host.openings);
  const score = overlap * 4 - obstruction * 2.5 - floor * 1.5 - size * 2;
  if (score <= 0 || obstruction > overlap * 1.5) return null;
  return { score, overlap, guestOpen, hostOpen, axis };
}

type Neighbor = { instance: PlacedModule; book: FaceBook; pose: TilePose };

function poseOf(instance: PlacedModule): TilePose {
  const mirror = instance.mirror === "x" || instance.mirror === "z" ? instance.mirror : null;
  return { rotationY: instance.transform.rotationY, mirror };
}

function neighborsOf(slot: Slot, placed: readonly Neighbor[]) {
  const found: { neighbor: Neighbor; towardGuest: FaceId }[] = [];
  for (const neighbor of placed) {
    const origin = neighbor.instance.transform.position;
    const dx = slot.x - origin.x;
    const dy = slot.y - origin.y;
    const dz = slot.z - origin.z;
    const near = Math.abs(Math.abs(dx) - STEP) <= CENTER_TOLERANCE || Math.abs(Math.abs(dy) - STEP) <= CENTER_TOLERANCE || Math.abs(Math.abs(dz) - STEP) <= CENTER_TOLERANCE;
    if (!near) continue;
    let toward: FaceId | null = null;
    if (Math.abs(dx - STEP) <= CENTER_TOLERANCE && Math.abs(dz) <= CENTER_TOLERANCE && Math.abs(dy) <= CENTER_TOLERANCE) toward = "E";
    else if (Math.abs(dx + STEP) <= CENTER_TOLERANCE && Math.abs(dz) <= CENTER_TOLERANCE && Math.abs(dy) <= CENTER_TOLERANCE) toward = "W";
    else if (Math.abs(dz - STEP) <= CENTER_TOLERANCE && Math.abs(dx) <= CENTER_TOLERANCE && Math.abs(dy) <= CENTER_TOLERANCE) toward = "N";
    else if (Math.abs(dz + STEP) <= CENTER_TOLERANCE && Math.abs(dx) <= CENTER_TOLERANCE && Math.abs(dy) <= CENTER_TOLERANCE) toward = "S";
    else if (Math.abs(dy - STEP) <= CENTER_TOLERANCE && Math.abs(dx) <= CENTER_TOLERANCE && Math.abs(dz) <= CENTER_TOLERANCE) toward = "T";
    else if (Math.abs(dy + STEP) <= CENTER_TOLERANCE && Math.abs(dx) <= CENTER_TOLERANCE && Math.abs(dz) <= CENTER_TOLERANCE) toward = "B";
    if (toward) found.push({ neighbor, towardGuest: toward });
  }
  return found;
}

function meetingFace(pose: TilePose, towardNeighbor: { east: number; up: number; north: number }) {
  let best: FaceId | null = null;
  let bestDot = 0.7;
  for (const id of FACES) {
    const normal = faceNormal(id, pose);
    const dot = normal.east * towardNeighbor.east + normal.up * towardNeighbor.up + normal.north * towardNeighbor.north;
    if (dot > bestDot) {
      bestDot = dot;
      best = id;
    }
  }
  return best;
}

const TOWARD: Record<FaceId, { east: number; up: number; north: number }> = {
  E: { east: 1, up: 0, north: 0 },
  W: { east: -1, up: 0, north: 0 },
  N: { east: 0, up: 0, north: 1 },
  S: { east: 0, up: 0, north: -1 },
  T: { east: 0, up: 1, north: 0 },
  B: { east: 0, up: -1, north: 0 },
};

function occupied(slot: Slot, instances: readonly PlacedModule[]) {
  return instances.some((instance) => {
    const point = instance.transform.position;
    return Math.abs(point.x - slot.x) <= CENTER_TOLERANCE && Math.abs(point.z - slot.z) <= CENTER_TOLERANCE && Math.abs(point.y - slot.y) <= CENTER_TOLERANCE;
  });
}

function slotsAround(pointer: Slot, instances: readonly PlacedModule[]) {
  const slots: Slot[] = [];
  const push = (slot: Slot) => {
    if (occupied(slot, instances)) return;
    if (slots.some((item) => Math.abs(item.x - slot.x) < 1 && Math.abs(item.y - slot.y) < 1 && Math.abs(item.z - slot.z) < 1)) return;
    slots.push(slot);
  };
  if (!occupied(pointer, instances)) push(pointer);
  for (const instance of instances) {
    const origin = instance.transform.position;
    const plan = Math.hypot(origin.x - pointer.x, origin.z - pointer.z);
    if (plan > STEP + SLOT_REACH && Math.abs(origin.y - pointer.y) > STEP + CENTER_TOLERANCE) continue;
    for (const id of FACES) {
      const step = TOWARD[id];
      const slot = { x: origin.x + step.east * STEP, y: origin.y + step.up * STEP, z: origin.z + step.north * STEP };
      const reach = Math.hypot(slot.x - pointer.x, slot.z - pointer.z);
      if (reach > SLOT_REACH && Math.abs(slot.y - pointer.y) > CENTER_TOLERANCE) continue;
      push(slot);
    }
  }
  return slots;
}

type Rated = {
  slot: Slot;
  pose: TilePose;
  score: number;
  neighborName: string | null;
  pair: string | null;
  highlights: FaceHighlight[];
};

function rateSlot(slot: Slot, guest: FaceBook, placed: readonly Neighbor[], poses: readonly TilePose[]) {
  const beside = neighborsOf(slot, placed);
  const rated: Rated[] = [];
  for (const pose of poses) {
    if (beside.length === 0) continue;
    let score = 0;
    let bestPair: { name: string; pair: string; score: number; highlights: FaceHighlight[] } | null = null;
    let blocked = false;
    for (const item of beside) {
      const hostFace = meetingFace(item.neighbor.pose, TOWARD[item.towardGuest]);
      const guestFace = meetingFace(pose, {
        east: -TOWARD[item.towardGuest].east,
        up: -TOWARD[item.towardGuest].up,
        north: -TOWARD[item.towardGuest].north,
      });
      if (!hostFace || !guestFace) {
        blocked = true;
        continue;
      }
      const axis = axisOf(faceNormal(hostFace, item.neighbor.pose));
      if (!axis) continue;
      const hostSheet = item.neighbor.book[hostFace];
      const guestSheet = guest[guestFace];
      if (hostSheet.openings < 2 || guestSheet.openings < 2) continue;
      const scored = pairScore(
        guestSheet,
        hostSheet,
        slot,
        { x: item.neighbor.instance.transform.position.x, y: item.neighbor.instance.transform.position.y, z: item.neighbor.instance.transform.position.z },
        pose,
        item.neighbor.pose,
        axis,
      );
      if (!scored) continue;
      score += scored.score;
      if (!bestPair || scored.score > bestPair.score) {
        bestPair = {
          name: item.neighbor.instance.name,
          pair: `${FACE_LABEL[guestFace]} · ${FACE_LABEL[hostFace]}`,
          score: scored.score,
          highlights: highlightsFor(slot, item.neighbor.instance.transform.position, guestSheet, pose, hostSheet, item.neighbor.pose, axis, scored.guestOpen, true),
        };
      }
    }
    if (blocked && !bestPair) continue;
    if (!bestPair) continue;
    rated.push({ slot, pose, score, neighborName: bestPair.name, pair: bestPair.pair, highlights: bestPair.highlights });
  }
  rated.sort((a, b) => b.score - a.score);
  return rated;
}

function highlightsFor(
  slot: Slot,
  host: { x: number; y: number; z: number },
  guest: FaceSheet,
  guestPose: TilePose,
  hostSheet: FaceSheet,
  hostPose: TilePose,
  axis: "x" | "y" | "z",
  guestOpen: Uint8Array,
  compatible: boolean,
) {
  const hostOpen = new Uint8Array(GRID * GRID);
  for (const sample of hostSheet.samples) {
    if (!sample.opening) continue;
    hostOpen[binKey(worldOf(host, sample, hostPose), axis, slot)] = 1;
  }
  const marks: FaceHighlight[] = [];
  const seen = new Set<number>();
  for (const sample of guest.samples) {
    if (!sample.opening) continue;
    const world = worldOf(slot, sample, guestPose);
    const key = binKey(world, axis, slot);
    if (!guestOpen[key] || !hostOpen[key] || seen.has(key)) continue;
    seen.add(key);
    marks.push({
      kind: "opening",
      east: axis === "x" ? (slot.x + host.x) / 2 : world.east,
      up: axis === "y" ? (slot.y + SIZE + host.y) / 2 : world.up,
      north: axis === "z" ? (slot.z + host.z) / 2 : world.north,
      width: CELL * 0.82,
      height: CELL * 0.82,
      axis,
      compatible,
    });
  }
  const faceCenter = {
    east: axis === "x" ? (slot.x + host.x) / 2 : slot.x,
    up: axis === "y" ? (slot.y + host.y + SIZE) / 2 : slot.y + HALF,
    north: axis === "z" ? (slot.z + host.z) / 2 : slot.z,
  };
  marks.unshift({
    kind: "face",
    east: faceCenter.east,
    up: faceCenter.up,
    north: faceCenter.north,
    width: SIZE * 0.92,
    height: SIZE * 0.92,
    axis,
    compatible,
  });
  return marks.slice(0, 18);
}

function idle(pointer: Slot, pose: TilePose, warning: string | null): FaceMatch {
  return {
    pose,
    x: pointer.x,
    y: pointer.y,
    z: pointer.z,
    valid: false,
    score: 0,
    rank: 0,
    total: 0,
    neighborName: null,
    pair: null,
    warning,
    highlights: [],
  };
}

export function matchTileFaces(input: {
  positions: ArrayLike<number> | null;
  pointer: Slot;
  instances: readonly PlacedModule[];
  meshes: Readonly<Record<string, { positions: ArrayLike<number> } | "missing" | undefined>>;
  auto: boolean;
  manual: TilePose | null;
  cycle: number;
}): FaceMatch {
  const pose = input.manual ?? { rotationY: 0, mirror: null };
  if (!input.positions) return idle(input.pointer, pose, "This tile has no mesh, so its faces cannot be matched.");
  const guest = faceBook(input.positions);
  const guestOpen = FACES.some((id) => guest[id].openings >= 2);
  const placed: Neighbor[] = [];
  for (const instance of input.instances) {
    const mesh = input.meshes[instance.provenance.moduleId];
    if (!mesh || mesh === "missing") continue;
    placed.push({ instance, book: faceBook(mesh.positions), pose: poseOf(instance) });
  }
  const besidePointer = neighborsOf(input.pointer, placed);
  if (!guestOpen) {
    return idle(input.pointer, pose, besidePointer.length > 0 ? "No opening on this tile meets the neighbor. Placement stays manual." : null);
  }
  const poses = input.auto ? YAWS.flatMap((rotationY) => MIRRORS.map((mirror) => ({ rotationY, mirror }))) : [pose];
  const slots = input.auto ? slotsAround(input.pointer, input.instances) : [input.pointer];
  let rated: Rated[] = [];
  for (const slot of slots) rated = rated.concat(rateSlot(slot, guest, placed, poses));
  rated.sort((a, b) => b.score - a.score || Math.hypot(a.slot.x - input.pointer.x, a.slot.z - input.pointer.z) - Math.hypot(b.slot.x - input.pointer.x, b.slot.z - input.pointer.z));
  const aimed = rated.filter((item) => Math.abs(item.slot.x - input.pointer.x) < 1 && Math.abs(item.slot.z - input.pointer.z) < 1 && Math.abs(item.slot.y - input.pointer.y) < 1);
  const pool = aimed.length > 0 ? aimed : rated.filter((item) => Math.hypot(item.slot.x - input.pointer.x, item.slot.z - input.pointer.z) <= SLOT_REACH);
  if (pool.length === 0) {
    const near = besidePointer.length > 0 || placed.some((item) => Math.hypot(item.instance.transform.position.x - input.pointer.x, item.instance.transform.position.z - input.pointer.z) < STEP + 2);
    return idle(input.pointer, pose, near ? "No face match. Openings were not invented. Place it by hand." : null);
  }
  const unique: Rated[] = [];
  for (const item of pool) {
    const key = `${item.slot.x.toFixed(1)}:${item.slot.y.toFixed(1)}:${item.slot.z.toFixed(1)}:${item.pose.rotationY.toFixed(3)}:${item.pose.mirror ?? ""}`;
    if (unique.some((other) => `${other.slot.x.toFixed(1)}:${other.slot.y.toFixed(1)}:${other.slot.z.toFixed(1)}:${other.pose.rotationY.toFixed(3)}:${other.pose.mirror ?? ""}` === key)) continue;
    unique.push(item);
  }
  const chosen = unique[Math.abs(input.cycle) % unique.length];
  return {
    pose: input.auto ? chosen.pose : pose,
    x: input.auto ? chosen.slot.x : input.pointer.x,
    y: input.auto ? chosen.slot.y : input.pointer.y,
    z: input.auto ? chosen.slot.z : input.pointer.z,
    valid: true,
    score: chosen.score,
    rank: unique.indexOf(chosen) + 1,
    total: unique.length,
    neighborName: chosen.neighborName,
    pair: chosen.pair,
    warning: null,
    highlights: chosen.highlights,
  };
}
