import { faceBook, posePoint, type FaceHighlight, type FaceId, type TilePose } from "./face-match";
import { MODULE_HEIGHT_FT, type PlacedModule } from "./placement";

const GRID = 8;
const SIZE = MODULE_HEIGHT_FT;
const HALF = SIZE / 2;
const CELL = SIZE / GRID;
const STEP = SIZE;
const TOLERANCE = 3;
const THROAT = 0.45;

const FACE_IDS: FaceId[] = ["E", "W", "N", "S", "T", "B"];
const LABEL: Record<FaceId, string> = { E: "East", W: "West", N: "North", S: "South", T: "Top", B: "Bottom" };

export type PassageMesh = {
  positions: number[];
  indices: number[];
};

export type JoinProposal = {
  valid: boolean;
  issues: string[];
  faceA: FaceId | null;
  faceB: FaceId | null;
  type: "side" | "stack" | null;
  alignment: number;
  floorDelta: number;
  integrity: "closed" | "open" | "none";
  traversable: boolean;
  highlights: FaceHighlight[];
  passage: PassageMesh | null;
};

const LOCAL: Record<FaceId, { x: number; y: number; z: number }> = {
  E: { x: 1, y: 0, z: 0 },
  W: { x: -1, y: 0, z: 0 },
  N: { x: 0, y: 0, z: 1 },
  S: { x: 0, y: 0, z: -1 },
  T: { x: 0, y: 1, z: 0 },
  B: { x: 0, y: -1, z: 0 },
};

function poseOf(instance: PlacedModule): TilePose {
  const mirror = instance.mirror === "x" || instance.mirror === "z" ? instance.mirror : null;
  return { rotationY: instance.transform.rotationY, mirror };
}

function normalOf(id: FaceId, pose: TilePose) {
  const local = LOCAL[id];
  return posePoint(local.x, local.y, local.z, pose);
}

function faceToward(pose: TilePose, direction: { east: number; up: number; north: number }) {
  let best: FaceId | null = null;
  let score = 0.7;
  for (const id of FACE_IDS) {
    const normal = normalOf(id, pose);
    const dot = normal.east * direction.east + normal.up * direction.up + normal.north * direction.north;
    if (dot > score) {
      score = dot;
      best = id;
    }
  }
  return best;
}

function adjacency(a: PlacedModule, b: PlacedModule) {
  const dx = b.transform.position.x - a.transform.position.x;
  const dy = b.transform.position.y - a.transform.position.y;
  const dz = b.transform.position.z - a.transform.position.z;
  const on = (value: number, target: number) => Math.abs(value - target) <= TOLERANCE;
  const flat = (value: number) => Math.abs(value) <= TOLERANCE;
  if (on(dx, STEP) && flat(dy) && flat(dz)) return { east: 1, up: 0, north: 0, type: "side" as const };
  if (on(dx, -STEP) && flat(dy) && flat(dz)) return { east: -1, up: 0, north: 0, type: "side" as const };
  if (on(dz, STEP) && flat(dx) && flat(dy)) return { east: 0, up: 0, north: 1, type: "side" as const };
  if (on(dz, -STEP) && flat(dx) && flat(dy)) return { east: 0, up: 0, north: -1, type: "side" as const };
  if (on(dy, STEP) && flat(dx) && flat(dz)) return { east: 0, up: 1, north: 0, type: "stack" as const };
  if (on(dy, -STEP) && flat(dx) && flat(dz)) return { east: 0, up: -1, north: 0, type: "stack" as const };
  return null;
}

function axisOf(direction: { east: number; up: number; north: number }): "x" | "y" | "z" {
  if (Math.abs(direction.east) > 0.5) return "x";
  if (Math.abs(direction.up) > 0.5) return "y";
  return "z";
}

function bin(point: { east: number; up: number; north: number }, axis: "x" | "y" | "z", origin: { x: number; y: number; z: number }) {
  const a = axis === "y" ? point.east - origin.x + HALF : point.up - origin.y;
  const b = axis === "x" ? point.north - origin.z + HALF : axis === "z" ? point.east - origin.x + HALF : point.north - origin.z + HALF;
  const row = Math.max(0, Math.min(GRID - 1, Math.floor(a / CELL)));
  const col = Math.max(0, Math.min(GRID - 1, Math.floor(b / CELL)));
  return row * GRID + col;
}

function world(instance: PlacedModule, local: { x: number; y: number; z: number }, pose: TilePose) {
  const turned = posePoint(local.x, local.y, local.z, pose);
  return {
    east: instance.transform.position.x + turned.east,
    up: instance.transform.position.y + turned.up,
    north: instance.transform.position.z + turned.north,
  };
}

function empty(issues: string[]): JoinProposal {
  return {
    valid: false,
    issues,
    faceA: null,
    faceB: null,
    type: null,
    alignment: 0,
    floorDelta: 0,
    integrity: "none",
    traversable: false,
    highlights: [],
    passage: null,
  };
}

function box(center: { east: number; up: number; north: number }, axis: "x" | "y" | "z", positions: number[], indices: number[]) {
  const hx = axis === "x" ? THROAT : CELL * 0.46;
  const hy = axis === "y" ? THROAT : CELL * 0.46;
  const hz = axis === "z" ? THROAT : CELL * 0.46;
  const base = positions.length / 3;
  const corners = [
    [-hx, -hy, -hz], [hx, -hy, -hz], [hx, hy, -hz], [-hx, hy, -hz],
    [-hx, -hy, hz], [hx, -hy, hz], [hx, hy, hz], [-hx, hy, hz],
  ];
  for (const [x, y, z] of corners) positions.push(center.east + x, center.up + y, center.north + z);
  const faces = [
    [0, 2, 1], [0, 3, 2], [4, 5, 6], [4, 6, 7],
    [0, 1, 5], [0, 5, 4], [3, 6, 2], [3, 7, 6],
    [0, 4, 7], [0, 7, 3], [1, 2, 6], [1, 6, 5],
  ];
  for (const face of faces) indices.push(base + face[0], base + face[1], base + face[2]);
}

function integrity(mesh: PassageMesh) {
  if (mesh.indices.length < 12 || mesh.indices.length % 3 !== 0) return "open" as const;
  const edges = new Map<string, number>();
  for (let index = 0; index < mesh.indices.length; index += 3) {
    const tri = [mesh.indices[index], mesh.indices[index + 1], mesh.indices[index + 2]];
    const points = tri.map((vertex) => {
      const offset = vertex * 3;
      return { x: mesh.positions[offset], y: mesh.positions[offset + 1], z: mesh.positions[offset + 2] };
    });
    const ab = { x: points[1].x - points[0].x, y: points[1].y - points[0].y, z: points[1].z - points[0].z };
    const ac = { x: points[2].x - points[0].x, y: points[2].y - points[0].y, z: points[2].z - points[0].z };
    const area = Math.hypot(ab.y * ac.z - ab.z * ac.y, ab.z * ac.x - ab.x * ac.z, ab.x * ac.y - ab.y * ac.x);
    if (area < 1e-4) return "open" as const;
    for (const [from, to] of [[tri[0], tri[1]], [tri[1], tri[2]], [tri[2], tri[0]]]) {
      const key = from < to ? `${from}:${to}` : `${to}:${from}`;
      edges.set(key, (edges.get(key) ?? 0) + 1);
    }
  }
  for (const count of edges.values()) if (count !== 2) return "open" as const;
  return "closed" as const;
}

/** Reads the two meshes and proposes a passage. The source arrays are not written. */
export function proposeDirectJoin(
  tileA: PlacedModule,
  tileB: PlacedModule,
  meshA: ArrayLike<number> | null,
  meshB: ArrayLike<number> | null,
): JoinProposal {
  if (tileA.instanceId === tileB.instanceId) return empty(["Choose two different tiles."]);
  const shared = adjacency(tileA, tileB);
  if (!shared) return empty(["These tiles do not share an adjacent face."]);
  if (!meshA || !meshB) return empty(["One tile has no mesh, so its openings cannot be read."]);
  const beforeA = meshA.length;
  const beforeB = meshB.length;
  const bookA = faceBook(meshA);
  const bookB = faceBook(meshB);
  if (meshA.length !== beforeA || meshB.length !== beforeB) return empty(["The tile meshes were changed. The join stopped."]);
  const poseA = poseOf(tileA);
  const poseB = poseOf(tileB);
  const faceA = faceToward(poseA, shared);
  const faceB = faceToward(poseB, { east: -shared.east, up: -shared.up, north: -shared.north });
  if (!faceA || !faceB) return empty(["The shared side does not land on a module face."]);
  const axis = axisOf(shared);
  const openA = new Uint8Array(GRID * GRID);
  const solidA = new Uint8Array(GRID * GRID);
  const openB = new Uint8Array(GRID * GRID);
  const solidB = new Uint8Array(GRID * GRID);
  const origin = tileA.transform.position;
  for (const sample of bookA[faceA].samples) {
    const key = bin(world(tileA, sample, poseA), axis, origin);
    if (sample.opening) openA[key] = 1;
    else solidA[key] = 1;
  }
  for (const sample of bookB[faceB].samples) {
    const key = bin(world(tileB, sample, poseB), axis, origin);
    if (sample.opening) openB[key] = 1;
    else solidB[key] = 1;
  }
  const overlap: number[] = [];
  let obstruction = 0;
  let sillA = GRID;
  let sillB = GRID;
  for (let index = 0; index < GRID * GRID; index += 1) {
    if (openA[index] && openB[index]) overlap.push(index);
    if (openA[index] && solidB[index]) obstruction += 1;
    if (openB[index] && solidA[index]) obstruction += 1;
    if (openA[index]) sillA = Math.min(sillA, Math.floor(index / GRID));
    if (openB[index]) sillB = Math.min(sillB, Math.floor(index / GRID));
  }
  const floorDelta = sillA === GRID || sillB === GRID ? GRID : Math.abs(sillA - sillB);
  const issues: string[] = [];
  if (bookA[faceA].openings < 2 || bookB[faceB].openings < 2) issues.push(`${LABEL[faceA]} and ${LABEL[faceB]} do not both have an opening. No passage was cut.`);
  else if (overlap.length < 2) issues.push("The openings do not overlap. No passage was cut.");
  else if (obstruction > overlap.length) issues.push("A solid face blocks the opening. No passage was cut.");
  else if (floorDelta > 1) issues.push(`The opening floors differ by ${floorDelta} cells. No passage was cut.`);
  const positions: number[] = [];
  const indices: number[] = [];
  const highlights: FaceHighlight[] = [];
  if (issues.length === 0) {
    for (const index of overlap) {
      const row = Math.floor(index / GRID);
      const col = index % GRID;
      const center = cellCenter(origin, axis, shared, row, col);
      box(center, axis, positions, indices);
      highlights.push({ kind: "opening", east: center.east, up: center.up, north: center.north, width: CELL * 0.82, height: CELL * 0.82, axis, compatible: true });
    }
    highlights.unshift(faceMark(tileA, tileB, axis, true));
  } else {
    highlights.push(faceMark(tileA, tileB, axis, false));
  }
  const passage = positions.length > 0 ? { positions, indices } : null;
  const shell = passage ? integrity(passage) : "none";
  const span = openingSpan(overlap);
  const traversable = shared.type === "stack" ? span.a >= 2 && span.b >= 2 : span.a >= 2 && span.b >= 1;
  if (issues.length === 0 && !traversable) issues.push("The aligned opening is too small to walk through. No passage was cut.");
  if (issues.length === 0 && shell !== "closed") issues.push("The passage mesh is not closed. No join was stored.");
  const valid = issues.length === 0 && passage !== null && shell === "closed" && traversable;
  return {
    valid,
    issues,
    faceA,
    faceB,
    type: shared.type,
    alignment: overlap.length,
    floorDelta,
    integrity: shell,
    traversable,
    highlights: valid || issues.length > 0 ? highlights : [],
    passage: valid ? passage : null,
  };
}

function openingSpan(cells: readonly number[]) {
  if (cells.length === 0) return { a: 0, b: 0 };
  let minRow = GRID;
  let maxRow = 0;
  let minCol = GRID;
  let maxCol = 0;
  for (const index of cells) {
    const row = Math.floor(index / GRID);
    const col = index % GRID;
    minRow = Math.min(minRow, row);
    maxRow = Math.max(maxRow, row);
    minCol = Math.min(minCol, col);
    maxCol = Math.max(maxCol, col);
  }
  return { a: maxRow - minRow + 1, b: maxCol - minCol + 1 };
}

function cellCenter(origin: { x: number; y: number; z: number }, axis: "x" | "y" | "z", direction: { east: number; up: number; north: number }, row: number, col: number) {
  const along = (index: number) => index * CELL + CELL / 2;
  if (axis === "x") {
    return { east: origin.x + direction.east * HALF, up: origin.y + along(row), north: origin.z - HALF + along(col) };
  }
  if (axis === "z") {
    return { east: origin.x - HALF + along(col), up: origin.y + along(row), north: origin.z + direction.north * HALF };
  }
  return { east: origin.x - HALF + along(row), up: origin.y + Math.max(0, direction.up) * SIZE, north: origin.z - HALF + along(col) };
}

function faceMark(tileA: PlacedModule, tileB: PlacedModule, axis: "x" | "y" | "z", compatible: boolean): FaceHighlight {
  const a = tileA.transform.position;
  const b = tileB.transform.position;
  return {
    kind: "face",
    east: axis === "x" ? (a.x + b.x) / 2 : a.x,
    up: axis === "y" ? (a.y + b.y + SIZE) / 2 : a.y + HALF,
    north: axis === "z" ? (a.z + b.z) / 2 : a.z,
    width: SIZE * 0.92,
    height: SIZE * 0.92,
    axis,
    compatible,
  };
}

export type StoredDirectJoin = {
  id: string;
  tileA: string;
  tileB: string;
  faceA: string;
  faceB: string;
  joinType: "side" | "stack";
  alignment: number;
  floorDelta: number;
  integrity: "closed";
  passage: PassageMesh;
};

export function readStoredJoins(value: unknown): StoredDirectJoin[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const link = item as Record<string, unknown>;
    const passage = link.passage;
    if (!passage || typeof passage !== "object") return [];
    const body = passage as { positions?: unknown; indices?: unknown };
    if (!Array.isArray(body.positions) || !Array.isArray(body.indices)) return [];
    const positions = body.positions.filter((entry): entry is number => typeof entry === "number" && Number.isFinite(entry));
    const indices = body.indices.filter((entry): entry is number => typeof entry === "number" && Number.isInteger(entry) && entry >= 0);
    if (typeof link.id !== "string" || typeof link.tileA !== "string" || typeof link.tileB !== "string") return [];
    if (link.joinType !== "side" && link.joinType !== "stack") return [];
    if (typeof link.faceA !== "string" || typeof link.faceB !== "string") return [];
    if (positions.length < 9 || indices.length < 12) return [];
    return [{
      id: link.id,
      tileA: link.tileA,
      tileB: link.tileB,
      faceA: link.faceA,
      faceB: link.faceB,
      joinType: link.joinType,
      alignment: typeof link.alignment === "number" ? link.alignment : 0,
      floorDelta: typeof link.floorDelta === "number" ? link.floorDelta : 0,
      integrity: "closed" as const,
      passage: { positions, indices },
    }];
  });
}

export function joinSummary(proposal: JoinProposal) {
  if (proposal.valid && proposal.faceA && proposal.faceB) {
    return `${LABEL[proposal.faceA]} meets ${LABEL[proposal.faceB]}. ${proposal.alignment} opening cells align. Floor shift ${proposal.floorDelta}. The passage is closed and traversable.`;
  }
  return proposal.issues[0] ?? "Select two tiles that share a face.";
}
