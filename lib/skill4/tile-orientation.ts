import type { FaceFrame, FaceId, Vec3 } from "./contract";
import { faceFrames, groundPlaneY, moduleLength, registrationEnvelope, VIEW_SCAN } from "./contract";
import type { TileConnection } from "./connections";
import { basisDeterminant, manualBasis, rotateByBasis, type Mat3 } from "./tile-basis";
import { CONNECTION_SPAN_MAX, CONNECTION_SPAN_MIN } from "./connection-span";
import { HYBRID_GAP, type TileInstance } from "./tiles";

/**
 * Turns placed tiles so the selected connection faces oppose across the hybrid gap.
 * The source mesh is not written. Manual Rotate 90 and Mirror stay on the tile
 * and are composed into the same yaw / mirror the canvas already draws.
 */
const LOCAL_NORMAL: Record<FaceId, Vec3> = {
  E: { x: 1, y: 0, z: 0 },
  W: { x: -1, y: 0, z: 0 },
  N: { x: 0, y: 0, z: 1 },
  S: { x: 0, y: 0, z: -1 },
  T: { x: 0, y: 1, z: 0 },
  B: { x: 0, y: -1, z: 0 },
};

const QUARTERS = [0, 1, 2, 3] as const;
type Quarter = (typeof QUARTERS)[number];
type Mirror = TileInstance["mirror"];

type Pose = {
  position: Vec3;
  quarter: Quarter;
  mirror: Mirror;
  rotation: Mat3;
};

export function faceWorldNormal(face: FaceId, tile: Pick<TileInstance, "rotation" | "rotationQuarter" | "mirror">): Vec3 {
  return rotateByBasis(tile.rotation ?? manualBasis(tile.mirror, tile.rotationQuarter), LOCAL_NORMAL[face]);
}

/** Local point on the mesh that actually forms this face. */
export function meshAttachment(positions: ArrayLike<number>, frame: FaceFrame): Vec3 | null {
  const count = Math.floor(positions.length / 3);
  if (count < 3) return null;
  let maxAlong = -Infinity;
  for (let index = 0; index < count; index += 1) {
    maxAlong = Math.max(maxAlong, faceAlong(positions, index, frame));
  }
  const span = Math.min(frame.extent.u, frame.extent.v);
  const band = Math.max(0.05, span * 0.08);
  return gatherCap(positions, count, frame, maxAlong - band, true) ?? gatherCap(positions, count, frame, maxAlong - band, false);
}

function faceAlong(positions: ArrayLike<number>, index: number, frame: FaceFrame) {
  const offset = index * 3;
  return (positions[offset] - frame.origin.x) * frame.normal.x
    + (positions[offset + 1] - frame.origin.y) * frame.normal.y
    + (positions[offset + 2] - frame.origin.z) * frame.normal.z;
}

function gatherCap(positions: ArrayLike<number>, count: number, frame: FaceFrame, limit: number, useExtent: boolean): Vec3 | null {
  const halfU = frame.extent.u * 0.5;
  const halfV = frame.extent.v * 0.5;
  let x = 0;
  let y = 0;
  let z = 0;
  let kept = 0;
  for (let index = 0; index < count; index += 1) {
    if (faceAlong(positions, index, frame) < limit) continue;
    const offset = index * 3;
    const dx = positions[offset] - frame.origin.x;
    const dy = positions[offset + 1] - frame.origin.y;
    const dz = positions[offset + 2] - frame.origin.z;
    if (useExtent) {
      const u = dx * frame.u.x + dy * frame.u.y + dz * frame.u.z;
      const v = dx * frame.v.x + dy * frame.v.y + dz * frame.v.z;
      if (Math.abs(u) > halfU || Math.abs(v) > halfV) continue;
    }
    x += positions[offset];
    y += positions[offset + 1];
    z += positions[offset + 2];
    kept += 1;
  }
  if (kept < 3) return null;
  return { x: x / kept, y: y / kept, z: z / kept };
}

type SpanPlan = {
  gap: number;
  localA: Vec3;
  localB: Vec3;
  travel: Vec3;
  forward: Vec3;
  principal: Vec3;
  faceU: Vec3;
  penetration: number;
};

export function orientTiles(
  slots: readonly TileInstance[],
  connections: readonly TileConnection[],
  focusConnectionId?: string,
  attachment?: (tileId: string, face: FaceId) => Vec3 | null,
  spanFor?: (connection: TileConnection) => number | SpanPlan,
): { tiles: TileInstance[]; unresolved: ReadonlySet<string> } {
  const slotAt = new Map(slots.map((tile) => [tile.instanceId, tile]));
  const placed = new Map<string, Pose>();
  const depth = new Map<string, number>();
  const root = [...slots].sort((a, b) => (a.instanceId < b.instanceId ? -1 : 1))[0];
  if (!root) return { tiles: [], unresolved: new Set() };

  const rootSpin = manualQuarter(root);
  const rootReqs = requirements(root.instanceId, connections, slotAt, rootSpin);
  const rootSolve = solvePrioritized(rootReqs, manualMirror(root), rootSpin, focusConnectionId);
  const rootQuarter = rootSolve?.quarter ?? rootSpin;
  const rootMirror = rootSolve?.mirror ?? manualMirror(root);
  placed.set(root.instanceId, poseOf({ ...root.transform }, rootQuarter, rootMirror));
  depth.set(root.instanceId, 0);

  const queue = [root.instanceId];
  const seenEdges = new Set<string>();
  while (queue.length > 0) {
    const parentId = queue.shift();
    if (!parentId) break;
    const parentPose = placed.get(parentId);
    if (!parentPose) continue;
    for (const connection of connectionsOf(parentId, connections, focusConnectionId)) {
      if (seenEdges.has(connection.id)) continue;
      seenEdges.add(connection.id);
      const childId = connection.tileAId === parentId ? connection.tileBId : connection.tileAId;
      const parentFace = connection.tileAId === parentId ? connection.faceA : connection.faceB;
      const childFace = connection.tileAId === parentId ? connection.faceB : connection.faceA;
      const child = slotAt.get(childId);
      if (!child || placed.has(childId)) continue;
      const gap = connectionGap(connection, spanFor);
      const plan = readSpan(connection, spanFor);
      if (isVertical(parentFace) || isVertical(childFace)) {
        const posed = placeByFrame(parentPose, parentFace, child, childFace, pointOn(attachment, parentId, parentFace), pointOn(attachment, childId, childFace), gap);
        if (!posed) continue;
        if (plan) posed.position = positionFromPlan(plan, parentId === connection.tileAId, parentPose, parentFace, posed.rotation);
        placed.set(childId, posed);
        depth.set(childId, (depth.get(parentId) ?? 0) + 1);
        queue.push(childId);
        continue;
      }
      const toward = directionToward(parentId, parentFace, childFace, childId, slotAt, rootSpin);
      const parentNormal = normalOf(parentPose, parentFace);
      if (!toward || dot(parentNormal, toward) < 0.999) continue;
      const solved = solveTile([{ face: childFace, direction: scale(toward, -1) }], manualMirror(child), manualQuarter(child));
      if (!solved) continue;
      const rotation = manualBasis(solved.mirror, solved.quarter);
      placed.set(childId, {
        position: plan
          ? positionFromPlan(plan, parentId === connection.tileAId, parentPose, parentFace, rotation)
          : seatPosition(parentPose, parentFace, pointOn(attachment, parentId, parentFace), rotation, pointOn(attachment, childId, childFace), gap),
        quarter: solved.quarter,
        mirror: solved.mirror,
        rotation,
      });
      depth.set(childId, (depth.get(parentId) ?? 0) + 1);
      queue.push(childId);
    }
  }

  enforceFocus(focusConnectionId, connections, slotAt, placed, depth, root.instanceId, rootSpin, attachment, spanFor);
  for (const tile of slots) {
    if (placed.has(tile.instanceId)) continue;
    placed.set(tile.instanceId, poseOf({ ...tile.transform }, manualQuarter(tile), manualMirror(tile)));
  }

  const tiles = slots.map((tile) => {
    const pose = placed.get(tile.instanceId) ?? poseOf({ ...tile.transform }, manualQuarter(tile), manualMirror(tile));
    return {
      ...tile,
      transform: pose.position,
      rotationQuarter: pose.quarter,
      mirror: pose.mirror,
      rotation: pose.rotation,
      manualQuarter: manualQuarter(tile),
      manualMirror: manualMirror(tile),
    };
  });
  return { tiles: liftConnectedToGround(tiles, connections, transformedMinY), unresolved: reviewConnections(connections, placed, attachment, spanFor) };
}

/**
 * After face alignment, lift each connected group by the same amount.
 * Every tile in the group stays on the grid and the face gap is unchanged.
 */
export function liftConnectedToGround(
  tiles: readonly TileInstance[],
  connections: readonly { tileAId: string; tileBId: string }[],
  lowestY: (tile: TileInstance) => number,
) {
  const groundY = groundPlaneY();
  const parent = new Map(tiles.map((tile) => [tile.instanceId, tile.instanceId]));
  const find = (id: string): string => {
    const current = parent.get(id) ?? id;
    if (current === id) return id;
    const root = find(current);
    parent.set(id, root);
    return root;
  };
  const unite = (a: string, b: string) => {
    const left = find(a);
    const right = find(b);
    if (left !== right) parent.set(right, left);
  };
  for (const connection of connections) unite(connection.tileAId, connection.tileBId);
  const liftByRoot = new Map<string, number>();
  for (const tile of tiles) {
    const deficit = groundY - lowestY(tile);
    if (deficit <= 1e-6) continue;
    const root = find(tile.instanceId);
    liftByRoot.set(root, Math.max(liftByRoot.get(root) ?? 0, deficit));
  }
  return tiles.map((tile) => {
    const lift = liftByRoot.get(find(tile.instanceId)) ?? 0;
    if (lift <= 1e-6) return tile;
    return { ...tile, transform: { ...tile.transform, y: tile.transform.y + lift } };
  });
}

/** Lowest world Y of the placed mesh. Without a mesh, the registration box is used. */
export function placedBoundsMinY(tile: TileInstance, positions?: ArrayLike<number>) {
  const basis = tile.rotation ?? manualBasis(tile.mirror, tile.rotationQuarter);
  if (positions && positions.length >= 3) {
    let minY = Infinity;
    for (let index = 0; index < positions.length; index += 3) {
      const world = rotateByBasis(basis, {
        x: positions[index] ?? 0,
        y: positions[index + 1] ?? 0,
        z: positions[index + 2] ?? 0,
      });
      minY = Math.min(minY, world.y + tile.transform.y);
    }
    return minY;
  }
  const box = registrationEnvelope(VIEW_SCAN.spacing, VIEW_SCAN.yaw);
  let minY = Infinity;
  for (const x of [box.min.x, box.max.x]) {
    for (const y of [box.min.y, box.max.y]) {
      for (const z of [box.min.z, box.max.z]) {
        minY = Math.min(minY, rotateByBasis(basis, { x, y, z }).y + tile.transform.y);
      }
    }
  }
  return minY;
}

function transformedMinY(tile: TileInstance) {
  return placedBoundsMinY(tile);
}

function solvePrioritized(
  reqs: { connectionId: string; face: FaceId; direction: Vec3 | null }[],
  mirror: Mirror,
  prefer: Quarter,
  focusConnectionId?: string,
) {
  const ordered = reqs
    .flatMap((item) => (item.direction ? [{ connectionId: item.connectionId, face: item.face, direction: item.direction }] : []))
    .sort((a, b) => rank(a.connectionId, b.connectionId, focusConnectionId));
  for (let count = ordered.length; count >= 1; count -= 1) {
    const solved = solveTile(ordered.slice(0, count), mirror, prefer);
    if (solved) return solved;
  }
  return null;
}

/** The edited connection wins over an older pose. Other edges are reviewed afterward. */
function enforceFocus(
  focusConnectionId: string | undefined,
  connections: readonly TileConnection[],
  slots: ReadonlyMap<string, TileInstance>,
  placed: Map<string, Pose>,
  depth: ReadonlyMap<string, number>,
  rootId: string,
  rootSpin: Quarter,
  attachment?: (tileId: string, face: FaceId) => Vec3 | null,
  spanFor?: (connection: TileConnection) => number | SpanPlan,
) {
  if (!focusConnectionId) return;
  const connection = connections.find((item) => item.id === focusConnectionId);
  if (!connection) return;
  const depthA = depth.get(connection.tileAId) ?? Number.POSITIVE_INFINITY;
  const depthB = depth.get(connection.tileBId) ?? Number.POSITIVE_INFINITY;
  const upstreamId = depthA <= depthB ? connection.tileAId : connection.tileBId;
  const downstreamId = upstreamId === connection.tileAId ? connection.tileBId : connection.tileAId;
  const upstreamFace = upstreamId === connection.tileAId ? connection.faceA : connection.faceB;
  const downstreamFace = upstreamId === connection.tileAId ? connection.faceB : connection.faceA;
  const toward = directionToward(upstreamId, upstreamFace, downstreamFace, downstreamId, slots, rootSpin);
  const upstream = slots.get(upstreamId);
  const downstream = slots.get(downstreamId);
  const upstreamPose = placed.get(upstreamId);
  if (!upstream || !downstream || !upstreamPose) return;
  if (isVertical(upstreamFace) || isVertical(downstreamFace)) {
    const posed = placeByFrame(upstreamPose, upstreamFace, downstream, downstreamFace, pointOn(attachment, upstreamId, upstreamFace), pointOn(attachment, downstreamId, downstreamFace), connectionGap(connection, spanFor));
    if (!posed) return;
    const plan = readSpan(connection, spanFor);
    if (plan) posed.position = positionFromPlan(plan, upstreamId === connection.tileAId, upstreamPose, upstreamFace, posed.rotation);
    placed.set(downstreamId, posed);
    return;
  }
  if (!toward) return;
  if (upstreamId !== rootId && dot(normalOf(upstreamPose, upstreamFace), toward) < 0.999) {
    const solved = solveTile([{ face: upstreamFace, direction: toward }], manualMirror(upstream), manualQuarter(upstream));
    if (!solved) return;
    placed.set(upstreamId, poseOf(upstreamPose.position, solved.quarter, solved.mirror));
  }
  const aimed = placed.get(upstreamId);
  if (!aimed || dot(normalOf(aimed, upstreamFace), toward) < 0.999) return;
  const parentNormal = normalOf(aimed, upstreamFace);
  const solved = solveTile([{ face: downstreamFace, direction: scale(parentNormal, -1) }], manualMirror(downstream), manualQuarter(downstream));
  if (!solved) return;
  const rotation = manualBasis(solved.mirror, solved.quarter);
  const focusPlan = readSpan(connection, spanFor);
  placed.set(downstreamId, {
    position: focusPlan
      ? positionFromPlan(focusPlan, upstreamId === connection.tileAId, aimed, upstreamFace, rotation)
      : seatPosition(aimed, upstreamFace, pointOn(attachment, upstreamId, upstreamFace), rotation, pointOn(attachment, downstreamId, downstreamFace), connectionGap(connection, spanFor)),
    quarter: solved.quarter,
    mirror: solved.mirror,
    rotation,
  });
}

function reviewConnections(
  connections: readonly TileConnection[],
  placed: ReadonlyMap<string, Pose>,
  attachment?: (tileId: string, face: FaceId) => Vec3 | null,
  spanFor?: (connection: TileConnection) => number | SpanPlan,
) {
  const unresolved = new Set<string>();
  for (const connection of connections) {
    const poseA = placed.get(connection.tileAId);
    const poseB = placed.get(connection.tileBId);
    const frameA = localFrame(connection.faceA);
    const frameB = localFrame(connection.faceB);
    if (!poseA || !poseB || !frameA || !frameB) {
      unresolved.add(connection.id);
      continue;
    }
    const normalA = rotateByBasis(poseA.rotation, frameA.normal);
    const normalB = rotateByBasis(poseB.rotation, frameB.normal);
    const plan = readSpan(connection, spanFor);
    if (plan) {
      const centerA = add(poseA.position, rotateByBasis(poseA.rotation, plan.localA));
      const centerB = add(poseB.position, rotateByBasis(poseB.rotation, plan.localB));
      const faceU = rotateByBasis(poseA.rotation, plan.faceU);
      const expected = sub(mapTravel(plan.travel, plan.forward, plan.principal, normalA, faceU), scale(normalA, plan.penetration * 2));
      if (dot(normalA, normalB) > -0.999 || length(sub(sub(centerB, centerA), expected)) > moduleLength(0.08)) unresolved.add(connection.id);
      continue;
    }
    const centerA = add(poseA.position, rotateByBasis(poseA.rotation, pointOn(attachment, connection.tileAId, connection.faceA)));
    const centerB = add(poseB.position, rotateByBasis(poseB.rotation, pointOn(attachment, connection.tileBId, connection.faceB)));
    const gap = sub(centerB, centerA);
    const along = dot(gap, normalA);
    const sideways = length(sub(gap, scale(normalA, along)));
    const tolerance = spanFor ? moduleLength(0.08) : 1e-3;
    if (dot(normalA, normalB) > -0.999 || Math.abs(along - connectionGap(connection, spanFor)) > tolerance || sideways > 1e-3) {
      unresolved.add(connection.id);
    }
  }
  return unresolved;
}

function poseOf(position: Vec3, quarter: Quarter, mirror: Mirror): Pose {
  return { position, quarter, mirror, rotation: manualBasis(mirror, quarter) };
}

/** Turns the child so its selected face opposes the parent's, then seats it across the hybrid gap. */
function placeByFrame(
  parent: Pose,
  parentFace: FaceId,
  child: TileInstance,
  childFace: FaceId,
  parentPoint: Vec3,
  childPoint: Vec3,
  gap = HYBRID_GAP,
): Pose | null {
  const parentFrame = localFrame(parentFace);
  const childFrame = localFrame(childFace);
  if (!parentFrame || !childFrame) return null;
  const parentN = rotateByBasis(parent.rotation, parentFrame.normal);
  const parentU = rotateByBasis(parent.rotation, parentFrame.u);
  const parentV = rotateByBasis(parent.rotation, parentFrame.v);
  const manual = manualBasis(manualMirror(child), manualQuarter(child));
  const localN = rotateByBasis(manual, childFrame.normal);
  const localU = rotateByBasis(manual, childFrame.u);
  const localV = rotateByBasis(manual, childFrame.v);
  const mirrored = basisDeterminant(manual) < 0;
  const extra = alignFrames(
    [localN, localU, localV],
    [scale(parentN, -1), mirrored ? scale(parentU, -1) : parentU, scale(parentV, -1)],
  );
  const rotation = multiply(extra, manual);
  return {
    position: seatPosition(parent, parentFace, parentPoint, rotation, childPoint, gap),
    quarter: manualQuarter(child),
    mirror: manualMirror(child),
    rotation,
  };
}

function pointOn(attachment: ((tileId: string, face: FaceId) => Vec3 | null) | undefined, tileId: string, face: FaceId) {
  return attachment?.(tileId, face) ?? localFrame(face).origin;
}

function seatPosition(parent: Pose, parentFace: FaceId, parentPoint: Vec3, childRotation: Mat3, childPoint: Vec3, gap = HYBRID_GAP) {
  const parentNormal = rotateByBasis(parent.rotation, localFrame(parentFace).normal);
  const parentWorld = add(parent.position, rotateByBasis(parent.rotation, parentPoint));
  return sub(add(parentWorld, scale(parentNormal, gap)), rotateByBasis(childRotation, childPoint));
}

/** Layout gap, or the hybrid's solved span when one was requested. */
function connectionGap(connection: TileConnection, spanFor?: (connection: TileConnection) => number | SpanPlan) {
  const requested = spanFor?.(connection);
  const gap = typeof requested === "number" ? requested : requested?.gap;
  if (typeof gap !== "number" || !Number.isFinite(gap)) return HYBRID_GAP;
  return Math.min(CONNECTION_SPAN_MAX, Math.max(CONNECTION_SPAN_MIN, gap));
}

function readSpan(connection: TileConnection, spanFor?: (connection: TileConnection) => number | SpanPlan) {
  const requested = spanFor?.(connection);
  if (!requested || typeof requested === "number") return null;
  return requested;
}

function positionFromPlan(plan: SpanPlan, parentIsA: boolean, parent: Pose, parentFace: FaceId, childRotation: Mat3) {
  const source = parentIsA ? plan.localA : plan.localB;
  const target = parentIsA ? plan.localB : plan.localA;
  const travel = parentIsA ? plan.travel : scale(plan.travel, -1);
  const forward = parentIsA ? plan.forward : scale(plan.forward, -1);
  const principal = parentIsA ? plan.principal : scale(plan.principal, -1);
  const normal = normalOf(parent, parentFace);
  const faceU = rotateByBasis(parent.rotation, plan.faceU);
  const surfaceDelta = sub(mapTravel(travel, forward, principal, normal, faceU), scale(normal, plan.penetration * 2));
  const parentWorld = add(parent.position, rotateByBasis(parent.rotation, source));
  return sub(add(parentWorld, surfaceDelta), rotateByBasis(childRotation, target));
}

function mapTravel(travel: Vec3, forward: Vec3, principal: Vec3, faceNormal: Vec3, faceU: Vec3) {
  void principal;
  void faceU;
  return turnFromTo(forward, faceNormal)(travel);
}

function turnFromTo(from: Vec3, to: Vec3) {
  const a = normalize(from);
  const b = normalize(to);
  const sine = cross(a, b);
  const sineLength = length(sine);
  const cosine = Math.min(1, Math.max(-1, dot(a, b)));
  if (sineLength < 1e-6) {
    if (cosine > 0) return (vector: Vec3) => vector;
    const helper = Math.abs(a.y) < 0.9 ? { x: 0, y: 1, z: 0 } : { x: 1, y: 0, z: 0 };
    return (vector: Vec3) => rotateAround(vector, normalize(cross(a, helper)), Math.PI);
  }
  return (vector: Vec3) => rotateAround(vector, scale(sine, 1 / sineLength), Math.acos(cosine));
}

function rotateAround(vector: Vec3, axis: Vec3, angle: number) {
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  const crossed = cross(axis, vector);
  return add(add(scale(vector, cosine), scale(crossed, sine)), scale(axis, dot(axis, vector) * (1 - cosine)));
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return { x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x };
}

function normalize(vector: Vec3) {
  return scale(vector, 1 / Math.max(1e-8, length(vector)));
}

function localFrame(face: FaceId) {
  return faceFrames(registrationEnvelope(VIEW_SCAN.spacing, VIEW_SCAN.yaw))[face];
}

function alignFrames(from: [Vec3, Vec3, Vec3], to: [Vec3, Vec3, Vec3]): Mat3 {
  return multiply(columnsOf(to), transposeOf(from));
}

function columnsOf(axes: [Vec3, Vec3, Vec3]): Mat3 {
  return [axes[0].x, axes[0].y, axes[0].z, axes[1].x, axes[1].y, axes[1].z, axes[2].x, axes[2].y, axes[2].z];
}

function transposeOf(axes: [Vec3, Vec3, Vec3]): Mat3 {
  return [axes[0].x, axes[1].x, axes[2].x, axes[0].y, axes[1].y, axes[2].y, axes[0].z, axes[1].z, axes[2].z];
}

function multiply(a: Mat3, b: Mat3): Mat3 {
  const out = [0, 0, 0, 0, 0, 0, 0, 0, 0];
  for (let column = 0; column < 3; column += 1) {
    for (let row = 0; row < 3; row += 1) {
      let sum = 0;
      for (let k = 0; k < 3; k += 1) sum += a[k * 3 + row] * b[column * 3 + k];
      out[column * 3 + row] = sum;
    }
  }
  return out as unknown as Mat3;
}

function normalOf(pose: Pose, face: FaceId) {
  return rotateByBasis(pose.rotation, LOCAL_NORMAL[face]);
}

function rank(a: string, b: string, focus?: string) {
  if (a === focus) return -1;
  if (b === focus) return 1;
  return a < b ? -1 : 1;
}

function requirements(
  tileId: string,
  connections: readonly TileConnection[],
  slots: ReadonlyMap<string, TileInstance>,
  spin: Quarter,
) {
  return connectionsOf(tileId, connections).map((connection) => {
    const otherId = connection.tileAId === tileId ? connection.tileBId : connection.tileAId;
    const face = connection.tileAId === tileId ? connection.faceA : connection.faceB;
    const otherFace = connection.tileAId === tileId ? connection.faceB : connection.faceA;
    return {
      connectionId: connection.id,
      face,
      direction: directionToward(tileId, face, otherFace, otherId, slots, spin),
    };
  });
}

function directionToward(
  tileId: string,
  face: FaceId,
  otherFace: FaceId,
  otherId: string,
  slots: ReadonlyMap<string, TileInstance>,
  spin: Quarter,
): Vec3 | null {
  const vertical = isVertical(face) && isVertical(otherFace);
  const horizontal = isHorizontal(face) && isHorizontal(otherFace);
  if (vertical) {
    if (face === "T") return { x: 0, y: 1, z: 0 };
    if (face === "B") return { x: 0, y: -1, z: 0 };
    return null;
  }
  if (!horizontal) return null;
  const here = slots.get(tileId);
  const there = slots.get(otherId);
  if (!here || !there) return null;
  const raw = { x: there.transform.x - here.transform.x, y: 0, z: there.transform.z - here.transform.z };
  const span = Math.hypot(raw.x, raw.z);
  if (span < 1e-6) return null;
  return yaw({ x: raw.x / span, y: 0, z: raw.z / span }, spin);
}

function solveTile(
  reqs: { face: FaceId; direction: Vec3 }[],
  mirror: Mirror,
  prefer: Quarter,
): { quarter: Quarter; mirror: Mirror } | null {
  const mirrors: Mirror[] = mirror ? [mirror] : [null];
  if (!mirror && reqs.some((req) => isVertical(req.face))) mirrors.push("y");
  for (const candidate of mirrors) {
    for (const quarter of [prefer, ...QUARTERS]) {
      const fits = reqs.every((req) => dot(yaw(mirrorVec(LOCAL_NORMAL[req.face], candidate), quarter), req.direction) > 0.999);
      if (fits) return { quarter, mirror: candidate };
    }
  }
  return null;
}

function connectionsOf(tileId: string, connections: readonly TileConnection[], focusConnectionId?: string) {
  return connections
    .filter((connection) => connection.tileAId === tileId || connection.tileBId === tileId)
    .slice()
    .sort((a, b) => rank(a.id, b.id, focusConnectionId));
}

function manualQuarter(tile: TileInstance): Quarter {
  return tile.manualQuarter ?? 0;
}

function manualMirror(tile: TileInstance): Mirror {
  return tile.manualMirror ?? null;
}

function isHorizontal(face: FaceId) {
  return face === "N" || face === "S" || face === "E" || face === "W";
}

function isVertical(face: FaceId) {
  return face === "T" || face === "B";
}

function yaw(vector: Vec3, quarter: Quarter): Vec3 {
  const angle = quarter * Math.PI / 2;
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  return { x: vector.x * cosine + vector.z * sine, y: vector.y, z: -vector.x * sine + vector.z * cosine };
}

function mirrorVec(vector: Vec3, axis: Mirror): Vec3 {
  if (axis === "x") return { x: -vector.x, y: vector.y, z: vector.z };
  if (axis === "y") return { x: vector.x, y: -vector.y, z: vector.z };
  if (axis === "z") return { x: vector.x, y: vector.y, z: -vector.z };
  return vector;
}

function add(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

function sub(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

function scale(vector: Vec3, factor: number): Vec3 {
  return { x: vector.x * factor, y: vector.y * factor, z: vector.z * factor };
}

function dot(a: Vec3, b: Vec3) {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function length(vector: Vec3) {
  return Math.hypot(vector.x, vector.y, vector.z);
}
