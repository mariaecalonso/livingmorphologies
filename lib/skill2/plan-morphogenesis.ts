import type { PlanModel } from "./plan-model";

/**
 * Archetype grammar applied to archetype-neutral PlanModel evidence.
 * References calibrate organization. They are not traced.
 * Output is a binary XY plan: 1 = white mass, 0 = black.
 */
export type ArchitecturalPlan = {
  archetypeId: string;
  columns: number;
  rows: number;
  mass: Uint8Array;
};

const REACH = 16;

const N4: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

type Pt = { x: number; y: number };

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

function supportOf(plan: PlanModel) {
  const n = plan.domain.columns * plan.domain.rows;
  const mask = new Uint8Array(n);
  for (let i = 0; i < n; i += 1) {
    if (plan.reinforcement.strong[i] || plan.reinforcement.connective[i] || plan.mass.mask[i]) {
      mask[i] = 1;
    }
  }
  return mask;
}

function distanceFrom(mask: Uint8Array, columns: number, rows: number) {
  const dist = new Int16Array(mask.length);
  dist.fill(32767);
  const queue: number[] = [];
  for (let i = 0; i < mask.length; i += 1) {
    if (!mask[i]) continue;
    dist[i] = 0;
    queue.push(i);
  }
  let head = 0;
  while (head < queue.length) {
    const i = queue[head];
    head += 1;
    const x = i % columns;
    const y = (i - x) / columns;
    const next = dist[i] + 1;
    for (const [ox, oy] of N4) {
      const nx = x + ox;
      const ny = y + oy;
      if (nx < 0 || ny < 0 || nx >= columns || ny >= rows) continue;
      const ni = ny * columns + nx;
      if (dist[ni] <= next) continue;
      dist[ni] = next;
      queue.push(ni);
    }
  }
  return dist;
}

function gridPoint(plan: PlanModel, point: { x: number; y: number }): Pt {
  return {
    x: (point.x / plan.domain.occupancySize) * plan.domain.columns,
    y: (point.y / plan.domain.occupancySize) * plan.domain.rows,
  };
}

function centroid(mask: Uint8Array, columns: number): Pt {
  let n = 0;
  let sx = 0;
  let sy = 0;
  for (let i = 0; i < mask.length; i += 1) {
    if (!mask[i]) continue;
    n += 1;
    sx += i % columns;
    sy += (i - (i % columns)) / columns;
  }
  if (!n) return { x: columns / 2, y: mask.length / columns / 2 };
  return { x: sx / n, y: sy / n };
}

function axisStats(mask: Uint8Array, columns: number) {
  const c = centroid(mask, columns);
  let xx = 0;
  let yy = 0;
  let xy = 0;
  let n = 0;
  for (let i = 0; i < mask.length; i += 1) {
    if (!mask[i]) continue;
    const x = i % columns;
    const y = (i - x) / columns;
    const dx = x - c.x;
    const dy = y - c.y;
    xx += dx * dx;
    yy += dy * dy;
    xy += dx * dy;
    n += 1;
  }
  const angle = n ? 0.5 * Math.atan2(2 * xy, xx - yy) : 0;
  return { cx: c.x, cy: c.y, angle, n, cos: Math.cos(angle), sin: Math.sin(angle) };
}

function project(x: number, y: number, axis: ReturnType<typeof axisStats>) {
  const dx = x - axis.cx;
  const dy = y - axis.cy;
  return {
    along: dx * axis.cos + dy * axis.sin,
    across: -dx * axis.sin + dy * axis.cos,
  };
}

function unproject(along: number, across: number, axis: ReturnType<typeof axisStats>): Pt {
  return {
    x: axis.cx + along * axis.cos - across * axis.sin,
    y: axis.cy + along * axis.sin + across * axis.cos,
  };
}

function paintDisc(ink: Float32Array, columns: number, rows: number, cx: number, cy: number, radius: number) {
  const r = Math.max(0.5, radius);
  const x0 = Math.max(0, Math.floor(cx - r));
  const x1 = Math.min(columns - 1, Math.ceil(cx + r));
  const y0 = Math.max(0, Math.floor(cy - r));
  const y1 = Math.min(rows - 1, Math.ceil(cy + r));
  const r2 = r * r;
  for (let y = y0; y <= y1; y += 1) {
    for (let x = x0; x <= x1; x += 1) {
      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - cy;
      if (dx * dx + dy * dy <= r2) ink[y * columns + x] = 1;
    }
  }
}

function paintCapsule(
  ink: Float32Array,
  columns: number,
  rows: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  radius: number,
) {
  const r = Math.max(0.5, radius);
  const x0 = Math.max(0, Math.floor(Math.min(ax, bx) - r));
  const x1 = Math.min(columns - 1, Math.ceil(Math.max(ax, bx) + r));
  const y0 = Math.max(0, Math.floor(Math.min(ay, by) - r));
  const y1 = Math.min(rows - 1, Math.ceil(Math.max(ay, by) + r));
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy || 1;
  const r2 = r * r;
  for (let y = y0; y <= y1; y += 1) {
    for (let x = x0; x <= x1; x += 1) {
      const px = x + 0.5 - ax;
      const py = y + 0.5 - ay;
      const t = clamp((px * dx + py * dy) / len2, 0, 1);
      const ex = px - dx * t;
      const ey = py - dy * t;
      if (ex * ex + ey * ey <= r2) ink[y * columns + x] = 1;
    }
  }
}

function fromInk(ink: Float32Array) {
  const mass = new Uint8Array(ink.length);
  for (let i = 0; i < ink.length; i += 1) if (ink[i] > 0) mass[i] = 1;
  return mass;
}

function dilate(mask: Uint8Array, columns: number, rows: number, radius: number) {
  const dist = distanceFrom(mask, columns, rows);
  const out = new Uint8Array(mask.length);
  for (let i = 0; i < mask.length; i += 1) if (dist[i] <= radius) out[i] = 1;
  return out;
}

function erode(mask: Uint8Array, columns: number, rows: number, radius: number) {
  const empty = new Uint8Array(mask.length);
  for (let i = 0; i < mask.length; i += 1) if (!mask[i]) empty[i] = 1;
  for (let x = 0; x < columns; x += 1) {
    empty[x] = 1;
    empty[(rows - 1) * columns + x] = 1;
  }
  for (let y = 0; y < rows; y += 1) {
    empty[y * columns] = 1;
    empty[y * columns + columns - 1] = 1;
  }
  const dist = distanceFrom(empty, columns, rows);
  const out = new Uint8Array(mask.length);
  for (let i = 0; i < mask.length; i += 1) if (mask[i] && dist[i] > radius) out[i] = 1;
  return out;
}

function closeMask(mask: Uint8Array, columns: number, rows: number, radius: number) {
  return erode(dilate(mask, columns, rows, radius), columns, rows, radius);
}

function clipToReach(mass: Uint8Array, dist: Int16Array, reach: number) {
  for (let i = 0; i < mass.length; i += 1) if (mass[i] && dist[i] > reach) mass[i] = 0;
}

function componentList(mask: Uint8Array, columns: number, rows: number) {
  const seen = new Uint8Array(mask.length);
  const groups: number[][] = [];
  for (let start = 0; start < mask.length; start += 1) {
    if (!mask[start] || seen[start]) continue;
    const cells: number[] = [];
    const stack = [start];
    seen[start] = 1;
    while (stack.length) {
      const i = stack.pop();
      if (i === undefined) break;
      cells.push(i);
      const x = i % columns;
      const y = (i - x) / columns;
      for (const [ox, oy] of N4) {
        const nx = x + ox;
        const ny = y + oy;
        if (nx < 0 || ny < 0 || nx >= columns || ny >= rows) continue;
        const ni = ny * columns + nx;
        if (!mask[ni] || seen[ni]) continue;
        seen[ni] = 1;
        stack.push(ni);
      }
    }
    groups.push(cells);
  }
  groups.sort((a, b) => b.length - a.length);
  return groups;
}

function keepLarge(mask: Uint8Array, columns: number, rows: number, minCells: number) {
  const groups = componentList(mask, columns, rows);
  mask.fill(0);
  for (const cells of groups) {
    if (cells.length < minCells && groups[0].length >= minCells) continue;
    for (const i of cells) mask[i] = 1;
  }
}

function interiorHoles(mass: Uint8Array, columns: number, rows: number) {
  const empty = new Uint8Array(mass.length);
  for (let i = 0; i < mass.length; i += 1) if (!mass[i]) empty[i] = 1;
  const seen = new Uint8Array(mass.length);
  const stack: number[] = [];
  for (let x = 0; x < columns; x += 1) {
    stack.push(x, (rows - 1) * columns + x);
  }
  for (let y = 0; y < rows; y += 1) {
    stack.push(y * columns, y * columns + columns - 1);
  }
  while (stack.length) {
    const i = stack.pop();
    if (i === undefined || seen[i] || !empty[i]) continue;
    seen[i] = 1;
    const x = i % columns;
    const y = (i - x) / columns;
    for (const [ox, oy] of N4) {
      const nx = x + ox;
      const ny = y + oy;
      if (nx < 0 || ny < 0 || nx >= columns || ny >= rows) continue;
      stack.push(ny * columns + nx);
    }
  }
  const holes: number[][] = [];
  for (let start = 0; start < empty.length; start += 1) {
    if (!empty[start] || seen[start]) continue;
    const cells: number[] = [];
    const pile = [start];
    seen[start] = 1;
    while (pile.length) {
      const i = pile.pop();
      if (i === undefined) break;
      cells.push(i);
      const x = i % columns;
      const y = (i - x) / columns;
      for (const [ox, oy] of N4) {
        const nx = x + ox;
        const ny = y + oy;
        if (nx < 0 || ny < 0 || nx >= columns || ny >= rows) continue;
        const ni = ny * columns + nx;
        if (!empty[ni] || seen[ni]) continue;
        seen[ni] = 1;
        pile.push(ni);
      }
    }
    holes.push(cells);
  }
  holes.sort((a, b) => b.length - a.length);
  return holes;
}

function fillHolesSmallerThan(mass: Uint8Array, columns: number, rows: number, minKeep: number) {
  for (const hole of interiorHoles(mass, columns, rows)) {
    if (hole.length >= minKeep) continue;
    for (const i of hole) mass[i] = 1;
  }
}

function subtractDisc(mass: Uint8Array, columns: number, rows: number, cx: number, cy: number, radius: number) {
  const r2 = radius * radius;
  const x0 = Math.max(0, Math.floor(cx - radius));
  const x1 = Math.min(columns - 1, Math.ceil(cx + radius));
  const y0 = Math.max(0, Math.floor(cy - radius));
  const y1 = Math.min(rows - 1, Math.ceil(cy + radius));
  for (let y = y0; y <= y1; y += 1) {
    for (let x = x0; x <= x1; x += 1) {
      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - cy;
      if (dx * dx + dy * dy <= r2) mass[y * columns + x] = 0;
    }
  }
}

function copyMask(mask: Uint8Array) {
  return mask.slice();
}

function count(mask: Uint8Array) {
  let n = 0;
  for (let i = 0; i < mask.length; i += 1) n += mask[i];
  return n;
}

function carveEnclosedDisc(mass: Uint8Array, columns: number, rows: number, center: Pt, maxRadius: number) {
  let best = copyMask(mass);
  let bestHole = 0;
  for (let radius = 4; radius <= maxRadius; radius += 2) {
    const trial = copyMask(mass);
    subtractDisc(trial, columns, rows, center.x, center.y, radius);
    const holes = interiorHoles(trial, columns, rows);
    const hole = holes[0]?.length ?? 0;
    if (hole < 12) continue;
    if (count(trial) < count(mass) * 0.28) break;
    if (hole >= bestHole) {
      best = trial;
      bestHole = hole;
    }
  }
  return best;
}

function relativeAt(plan: PlanModel, x: number, y: number) {
  const columns = plan.domain.columns;
  const ix = clamp(Math.round(x), 0, columns - 1);
  const iy = clamp(Math.round(y), 0, plan.domain.rows - 1);
  return plan.reinforcement.relative[iy * columns + ix] ?? 0;
}

function radiusFrom(plan: PlanModel, x: number, y: number, base: number) {
  return base * (0.72 + 0.55 * clamp(relativeAt(plan, x, y), 0, 1));
}

function supportPoints(mask: Uint8Array, columns: number): Pt[] {
  const pts: Pt[] = [];
  for (let i = 0; i < mask.length; i += 1) {
    if (mask[i]) pts.push({ x: i % columns, y: (i - (i % columns)) / columns });
  }
  return pts;
}

function finish(ink: Float32Array, supportDist: Int16Array, columns: number, rows: number, holeKeep: number) {
  const mass = fromInk(ink);
  clipToReach(mass, supportDist, REACH);
  const closed = closeMask(mass, columns, rows, 2);
  clipToReach(closed, supportDist, REACH + 2);
  keepLarge(closed, columns, rows, 10);
  fillHolesSmallerThan(closed, columns, rows, holeKeep);
  return closed;
}

function bandBy(points: Pt[], key: (p: Pt) => number, bands: number) {
  const sorted = points.slice().sort((a, b) => key(a) - key(b));
  const groups: Pt[][] = [];
  if (!sorted.length) return groups;
  const size = Math.ceil(sorted.length / bands);
  for (let i = 0; i < bands; i += 1) groups.push(sorted.slice(i * size, (i + 1) * size));
  return groups.filter((group) => group.length > 0);
}

function meanPt(points: Pt[]): Pt {
  let sx = 0;
  let sy = 0;
  for (const p of points) {
    sx += p.x;
    sy += p.y;
  }
  const n = Math.max(1, points.length);
  return { x: sx / n, y: sy / n };
}

function deepestInterior(mass: Uint8Array, columns: number, rows: number) {
  const empty = new Uint8Array(mass.length);
  for (let i = 0; i < mass.length; i += 1) if (!mass[i]) empty[i] = 1;
  for (let x = 0; x < columns; x += 1) {
    empty[x] = 1;
    empty[(rows - 1) * columns + x] = 1;
  }
  for (let y = 0; y < rows; y += 1) {
    empty[y * columns] = 1;
    empty[y * columns + columns - 1] = 1;
  }
  const dist = distanceFrom(empty, columns, rows);
  let best = -1;
  let depth = 0;
  for (let i = 0; i < mass.length; i += 1) {
    if (!mass[i] || dist[i] <= depth) continue;
    depth = dist[i];
    best = i;
  }
  if (best < 0) return null;
  return { x: best % columns, y: (best - (best % columns)) / columns, depth };
}

function cellDepth(mass: Uint8Array, columns: number, rows: number, pt: Pt) {
  const empty = new Uint8Array(mass.length);
  for (let i = 0; i < mass.length; i += 1) if (!mass[i]) empty[i] = 1;
  for (let x = 0; x < columns; x += 1) {
    empty[x] = 1;
    empty[(rows - 1) * columns + x] = 1;
  }
  for (let y = 0; y < rows; y += 1) {
    empty[y * columns] = 1;
    empty[y * columns + columns - 1] = 1;
  }
  const dist = distanceFrom(empty, columns, rows);
  const ix = clamp(Math.round(pt.x), 0, columns - 1);
  const iy = clamp(Math.round(pt.y), 0, rows - 1);
  return dist[iy * columns + ix];
}

function componentCentroid(cells: readonly number[], columns: number): Pt {
  return meanPt(cells.map((i) => ({ x: i % columns, y: (i - (i % columns)) / columns })));
}

function smoothMass(mask: Uint8Array, columns: number, rows: number) {
  const next = mask.slice();
  for (let y = 1; y < rows - 1; y += 1) {
    for (let x = 1; x < columns - 1; x += 1) {
      let n = 0;
      for (let oy = -1; oy <= 1; oy += 1) {
        for (let ox = -1; ox <= 1; ox += 1) n += mask[(y + oy) * columns + (x + ox)];
      }
      const i = y * columns + x;
      if (n >= 6) next[i] = 1;
      else if (n <= 2) next[i] = 0;
    }
  }
  return next;
}

function regularize(
  mass: Uint8Array,
  supportDist: Int16Array,
  columns: number,
  rows: number,
  holeKeep: number,
  closeRadius = 1,
) {
  clipToReach(mass, supportDist, REACH);
  let closed = closeRadius > 0 ? closeMask(mass, columns, rows, closeRadius) : mass.slice();
  clipToReach(closed, supportDist, REACH + 2);
  closed = smoothMass(closed, columns, rows);
  clipToReach(closed, supportDist, REACH + 2);
  keepLarge(closed, columns, rows, 8);
  fillHolesSmallerThan(closed, columns, rows, holeKeep);
  return closed;
}

function keepLargest(mask: Uint8Array, columns: number, rows: number) {
  const groups = componentList(mask, columns, rows);
  mask.fill(0);
  const cells = groups[0];
  if (!cells) return;
  for (const i of cells) mask[i] = 1;
}

function holeBuffer(mass: Uint8Array, hole: number[], columns: number, rows: number) {
  const exterior = new Uint8Array(mass.length);
  const holeMark = new Uint8Array(mass.length);
  for (const i of hole) holeMark[i] = 1;
  for (let i = 0; i < mass.length; i += 1) if (!mass[i] && !holeMark[i]) exterior[i] = 1;
  for (let x = 0; x < columns; x += 1) {
    exterior[x] = 1;
    exterior[(rows - 1) * columns + x] = 1;
  }
  for (let y = 0; y < rows; y += 1) {
    exterior[y * columns] = 1;
    exterior[y * columns + columns - 1] = 1;
  }
  const dist = distanceFrom(exterior, columns, rows);
  let buffer = 32767;
  for (const i of hole) buffer = Math.min(buffer, dist[i]);
  return buffer;
}

function carveEnclosed(
  mass: Uint8Array,
  columns: number,
  rows: number,
  center: Pt,
  maxRadius: number,
  minBuffer: number,
  minHole: number,
  minKeepFraction: number,
) {
  let best = copyMask(mass);
  let bestHole = 0;
  for (let radius = 3; radius <= maxRadius; radius += 1) {
    const trial = copyMask(mass);
    subtractDisc(trial, columns, rows, center.x, center.y, radius);
    const holes = interiorHoles(trial, columns, rows);
    const hole = holes[0];
    if (!hole || hole.length < minHole) continue;
    if (count(trial) < count(mass) * minKeepFraction) break;
    if (holeBuffer(trial, hole, columns, rows) < minBuffer) continue;
    if (hole.length >= bestHole) {
      best = trial;
      bestHole = hole.length;
    }
  }
  return best;
}

function shellFrom(support: Uint8Array, columns: number, rows: number, radius: number) {
  return dilate(support, columns, rows, radius);
}


const FILL_OPENINGS = 1_000_000;

function blankInk(length: number) {
  return new Float32Array(length);
}

function resolveEnclosedCenter(plan: PlanModel, mass: Uint8Array, columns: number, rows: number): Pt {
  const pocket = deepestInterior(mass, columns, rows);
  const interior = new Set(plan.void.interiorIds);
  const voids = plan.void.components.filter((component) => interior.has(component.id) && !component.touchesDomainBoundary);
  voids.sort((a, b) => b.cells.length - a.cells.length);
  if (voids[0]) {
    const center = componentCentroid(voids[0].cells, columns);
    if (cellDepth(mass, columns, rows, center) >= 5) return center;
  }
  const attractor = gridPoint(plan, plan.anchors.attractor);
  if (cellDepth(mass, columns, rows, attractor) >= 5) return attractor;
  if (pocket) return pocket;
  return centroid(mass, columns);
}

function withShell(
  support: Uint8Array,
  supportDist: Int16Array,
  columns: number,
  rows: number,
  radii: number[],
) {
  const shells: Uint8Array[] = [];
  for (const radius of radii) {
    let mass = shellFrom(support, columns, rows, radius);
    mass = regularize(mass, supportDist, columns, rows, FILL_OPENINGS, 2);
    keepLargest(mass, columns, rows);
    shells.push(mass);
  }
  return shells;
}

function makeVerticalVoid(
  plan: PlanModel,
  support: Uint8Array,
  supportDist: Int16Array,
  columns: number,
  rows: number,
) {
  let carved = support.slice();
  for (const mass of withShell(support, supportDist, columns, rows, [5, 8, 11])) {
    const center = resolveEnclosedCenter(plan, mass, columns, rows);
    const depth = cellDepth(mass, columns, rows, center);
    const next = carveEnclosed(
      mass,
      columns,
      rows,
      center,
      Math.min(15, Math.max(4, depth - 3)),
      3,
      70,
      0.32,
    );
    carved = next;
    if ((interiorHoles(next, columns, rows)[0]?.length ?? 0) >= 70) break;
  }
  return carved;
}

function makeOpenHall(
  plan: PlanModel,
  support: Uint8Array,
  supportDist: Int16Array,
  columns: number,
  rows: number,
) {
  let best = support.slice();
  let bestScore = 0;
  for (const shellRadius of [6, 9]) {
    let mass: Uint8Array = shellFrom(support, columns, rows, shellRadius);
    mass = regularize(mass, supportDist, columns, rows, FILL_OPENINGS, 1);
    keepLargest(mass, columns, rows);
    const center = resolveEnclosedCenter(plan, mass, columns, rows);
    const distances = supportPoints(support, columns)
      .map((p) => Math.hypot(p.x - center.x, p.y - center.y))
      .sort((a, b) => a - b);
    for (const fraction of [0.7, 0.5, 0.35]) {
      const outer = distances[Math.min(distances.length - 1, Math.floor(distances.length * fraction))] ?? 20;
      const trial = copyMask(mass);
      for (let i = 0; i < trial.length; i += 1) {
        if (!trial[i]) continue;
        const x = i % columns;
        const y = (i - x) / columns;
        if (Math.hypot(x + 0.5 - center.x, y + 0.5 - center.y) > outer + shellRadius * 0.35) trial[i] = 0;
      }
      keepLargest(trial, columns, rows);
      clipToReach(trial, supportDist, REACH + 2);
      const depth = cellDepth(trial, columns, rows, center);
      if (depth < 6) continue;
      const equiv = Math.sqrt(Math.max(1, count(trial)) / Math.PI);
      const carved = carveEnclosed(
        trial,
        columns,
        rows,
        center,
        Math.max(6, Math.min(depth - 2, equiv * 0.55)),
        2,
        80,
        0.2,
      );
      const hole = interiorHoles(carved, columns, rows)[0]?.length ?? 0;
      const white = count(carved);
      const score = white > 0 ? hole / white : 0;
      if (hole >= 80 && score > bestScore) {
        best = carved;
        bestScore = score;
      }
    }
  }
  return best;
}

function makeContained(
  plan: PlanModel,
  support: Uint8Array,
  supportDist: Int16Array,
  columns: number,
  rows: number,
) {
  let carved = support.slice();
  for (const mass of withShell(support, supportDist, columns, rows, [7, 10, 13])) {
    const center = resolveEnclosedCenter(plan, mass, columns, rows);
    const depth = cellDepth(mass, columns, rows, center);
    const next = carveEnclosed(
      mass,
      columns,
      rows,
      center,
      Math.min(9, Math.max(3, depth - 5)),
      5,
      28,
      0.5,
    );
    carved = next;
    if ((interiorHoles(next, columns, rows)[0]?.length ?? 0) >= 28) {
      const hole = interiorHoles(next, columns, rows)[0];
      if (hole && holeBuffer(next, hole, columns, rows) >= 5) break;
    }
  }
  return carved;
}

function makeSequential(
  plan: PlanModel,
  support: Uint8Array,
  supportDist: Int16Array,
  columns: number,
  rows: number,
) {
  const axis = axisStats(support, columns);
  const pts = supportPoints(support, columns);
  if (pts.length < 3) return support.slice();
  const projected = pts.map((p) => ({ p, q: project(p.x, p.y, axis) }));
  projected.sort((a, b) => a.q.along - b.q.along);
  const bins = 5;
  const size = Math.ceil(projected.length / bins);
  const groups: { p: Pt; q: { along: number; across: number } }[][] = [];
  for (let i = 0; i < bins; i += 1) {
    const group = projected.slice(i * size, (i + 1) * size);
    if (group.length) groups.push(group);
  }
  const t0 = projected[0].q.along;
  const t1 = projected[projected.length - 1].q.along;
  const span = Math.max(1, t1 - t0);
  const ink = blankInk(support.length);
  const centers: Pt[] = [];
  groups.forEach((group, index) => {
    const across = group.reduce((sum, item) => sum + item.q.across, 0) / group.length;
    const along = t0 + (span * (index + 0.5)) / groups.length;
    const center = unproject(along, across, axis);
    centers.push(center);
    const release = index % 2 === 0;
    const base = release ? clamp(span / 11, 5.5, 11) : clamp(span / 28, 2.4, 4.2);
    paintDisc(ink, columns, rows, center.x, center.y, radiusFrom(plan, center.x, center.y, base));
  });
  for (let i = 1; i < centers.length; i += 1) {
    const a = centers[i - 1];
    const b = centers[i];
    paintCapsule(ink, columns, rows, a.x, a.y, b.x, b.y, 2.2);
  }
  const mass = fromInk(ink);
  for (let i = 1; i < groups.length; i += 1) {
    const boundary = t0 + (span * i) / groups.length;
    const half = Math.max(1.5, span / groups.length / 5);
    for (let n = 0; n < mass.length; n += 1) {
      if (!mass[n]) continue;
      const x = n % columns;
      const y = (n - x) / columns;
      const q = project(x + 0.5, y + 0.5, axis);
      if (Math.abs(q.along - boundary) <= half && Math.abs(q.across) > 2.5) mass[n] = 0;
    }
  }
  return regularize(mass, supportDist, columns, rows, FILL_OPENINGS, 1);
}

function makeHall(
  plan: PlanModel,
  support: Uint8Array,
  supportDist: Int16Array,
  columns: number,
  rows: number,
  spine: number,
  pauses: boolean,
) {
  const axis = axisStats(support, columns);
  const pts = supportPoints(support, columns);
  if (!pts.length) return support.slice();
  const alongs = pts.map((p) => project(p.x, p.y, axis).along).sort((a, b) => a - b);
  const t0 = alongs[Math.floor(alongs.length * 0.04)] ?? alongs[0];
  const t1 = alongs[Math.floor(alongs.length * 0.96)] ?? alongs[alongs.length - 1];
  const ink = blankInk(support.length);
  const a = unproject(t0, 0, axis);
  const b = unproject(t1, 0, axis);
  paintCapsule(ink, columns, rows, a.x, a.y, b.x, b.y, spine);
  if (pauses) {
    for (const component of plan.mass.components.slice(0, 6)) {
      const c = componentCentroid(component.cells, columns);
      const across = Math.abs(project(c.x, c.y, axis).across);
      if (across < spine) continue;
      paintDisc(ink, columns, rows, c.x, c.y, radiusFrom(plan, c.x, c.y, 4.2 + Math.sqrt(component.cells.length) * 0.22));
      const foot = unproject(project(c.x, c.y, axis).along, 0, axis);
      paintCapsule(ink, columns, rows, c.x, c.y, foot.x, foot.y, 2);
    }
  } else {
    for (const component of plan.mass.components.slice(0, 5)) {
      const c = componentCentroid(component.cells, columns);
      if (Math.abs(project(c.x, c.y, axis).across) < spine * 0.45) continue;
      paintDisc(ink, columns, rows, c.x, c.y, radiusFrom(plan, c.x, c.y, 5 + Math.sqrt(component.cells.length) * 0.2));
    }
  }
  return regularize(fromInk(ink), supportDist, columns, rows, FILL_OPENINGS, 1);
}

function tryPunch(
  mass: Uint8Array,
  columns: number,
  rows: number,
  center: Pt,
  radius: number,
  minComponentFraction: number,
  maxHole: number,
) {
  const trial = copyMask(mass);
  subtractDisc(trial, columns, rows, center.x, center.y, radius);
  const groups = componentList(trial, columns, rows);
  if (!groups.length || groups[0].length < count(mass) * minComponentFraction) return mass;
  const holes = interiorHoles(trial, columns, rows);
  if ((holes[0]?.length ?? 0) > maxHole) return mass;
  return trial;
}

function lowSites(plan: PlanModel, mass: Uint8Array, columns: number, rows: number, step: number) {
  const sites: Pt[] = [];
  for (let y = 3; y < rows; y += step) {
    for (let x = 3; x < columns; x += step) {
      if (!mass[y * columns + x]) continue;
      sites.push({ x, y });
    }
  }
  sites.sort((a, b) => relativeAt(plan, a.x, a.y) - relativeAt(plan, b.x, b.y));
  return sites;
}

function makeTopographic(
  plan: PlanModel,
  support: Uint8Array,
  supportDist: Int16Array,
  columns: number,
  rows: number,
) {
  let mass: Uint8Array = shellFrom(support, columns, rows, 7);
  mass = regularize(mass, supportDist, columns, rows, FILL_OPENINGS, 2);
  keepLargest(mass, columns, rows);
  const chosen: Pt[] = [];
  for (const site of lowSites(plan, mass, columns, rows, 6)) {
    if (relativeAt(plan, site.x, site.y) > 0.2) break;
    if (cellDepth(mass, columns, rows, site) < 5) continue;
    if (chosen.some((q) => (site.x - q.x) ** 2 + (site.y - q.y) ** 2 < 14 * 14)) continue;
    const next = tryPunch(mass, columns, rows, site, 2.3, 0.9, 36);
    if (next === mass) continue;
    mass = next;
    chosen.push(site);
    if (chosen.length >= 8) break;
  }
  return mass;
}

function makeVoidField(
  plan: PlanModel,
  support: Uint8Array,
  supportDist: Int16Array,
  columns: number,
  rows: number,
) {
  let mass: Uint8Array = shellFrom(support, columns, rows, 6);
  mass = regularize(mass, supportDist, columns, rows, FILL_OPENINGS, 2);
  keepLargest(mass, columns, rows);
  const sites: { at: Pt; radius: number }[] = [];
  for (const component of plan.void.components) {
    sites.push({
      at: componentCentroid(component.cells, columns),
      radius: clamp(Math.sqrt(component.cells.length / Math.PI) * 0.42, 4.4, 8.2),
    });
  }
  for (const site of lowSites(plan, mass, columns, rows, 7)) {
    sites.push({ at: site, radius: 4.6 + 2.8 * (1 - clamp(relativeAt(plan, site.x, site.y), 0, 1)) });
  }
  const chosen: Pt[] = [];
  for (const site of sites) {
    if (cellDepth(mass, columns, rows, site.at) < 8) continue;
    if (chosen.some((q) => (site.at.x - q.x) ** 2 + (site.at.y - q.y) ** 2 < 16 * 16)) continue;
    const next = tryPunch(mass, columns, rows, site.at, site.radius, 0.72, 520);
    if (next === mass) continue;
    mass = next;
    chosen.push(site.at);
    if (interiorHoles(mass, columns, rows).length >= 4) break;
  }
  return mass;
}

function makeTerraces(
  plan: PlanModel,
  support: Uint8Array,
  supportDist: Int16Array,
  columns: number,
  rows: number,
) {
  const axis = axisStats(support, columns);
  const pts = supportPoints(support, columns);
  if (pts.length < 6) return support.slice();
  const located = pts.map((p) => ({ p, q: project(p.x, p.y, axis) }));
  located.sort((a, b) => a.q.across - b.q.across);
  const size = Math.ceil(located.length / 3);
  const groups = [0, 1, 2].map((index) => located.slice(index * size, (index + 1) * size)).filter((g) => g.length);
  const a0 = located[0].q.across;
  const a1 = located[located.length - 1].q.across;
  const span = Math.max(18, a1 - a0);
  const targets = groups.map((_, index) => a0 + (span * (index + 0.5)) / groups.length);
  const tube = clamp(span * 0.1, 2.8, 5.2);
  let minAlong = Infinity;
  let maxAlong = -Infinity;
  for (const item of located) {
    minAlong = Math.min(minAlong, item.q.along);
    maxAlong = Math.max(maxAlong, item.q.along);
  }
  const offset = clamp((maxAlong - minAlong) * 0.07, 4, 8);
  const ink = blankInk(support.length);
  const anchors: Pt[] = [];
  groups.forEach((group, index) => {
    let g0 = Infinity;
    let g1 = -Infinity;
    for (const item of group) {
      g0 = Math.min(g0, item.q.along);
      g1 = Math.max(g1, item.q.along);
    }
    const shift = (index - 1) * offset;
    const across = targets[index] ?? 0;
    const start = unproject(g0 + shift, across, axis);
    const end = unproject(g1 + shift, across, axis);
    const mid = unproject((g0 + g1) / 2, across, axis);
    paintCapsule(
      ink,
      columns,
      rows,
      start.x,
      start.y,
      end.x,
      end.y,
      radiusFrom(plan, mid.x, mid.y, tube),
    );
    anchors.push(unproject(g0 + shift, across, axis));
  });
  for (let i = 1; i < anchors.length; i += 1) {
    paintCapsule(ink, columns, rows, anchors[i - 1].x, anchors[i - 1].y, anchors[i].x, anchors[i].y, 2);
  }
  return regularize(fromInk(ink), supportDist, columns, rows, FILL_OPENINGS, 1);
}

function makeFlat(
  plan: PlanModel,
  support: Uint8Array,
  supportDist: Int16Array,
  columns: number,
  rows: number,
) {
  const axis = axisStats(support, columns);
  const pts = supportPoints(support, columns);
  let along = 1;
  let across = 1;
  for (const p of pts) {
    const q = project(p.x, p.y, axis);
    along = Math.max(along, Math.abs(q.along));
    across = Math.max(across, Math.abs(q.across));
  }
  const rx = Math.max(along, 8);
  const ry = clamp(Math.min(across * 0.58, rx * 0.42), 4, rx * 0.42);
  const ink = blankInk(support.length);
  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < columns; x += 1) {
      const q = project(x + 0.5, y + 0.5, axis);
      const stretch = 1 + 0.08 * (relativeAt(plan, x, y) - 0.5);
      if ((q.along * q.along) / (rx * rx) + (q.across * q.across) / ((ry * stretch) * (ry * stretch)) <= 1) {
        ink[y * columns + x] = 1;
      }
    }
  }
  const mass = regularize(fromInk(ink), supportDist, columns, rows, FILL_OPENINGS, 2);
  keepLargest(mass, columns, rows);
  fillHolesSmallerThan(mass, columns, rows, FILL_OPENINGS);
  return mass;
}

function nearestEdge(c: Pt, columns: number, rows: number) {
  const edges = [
    { edge: "left", d: c.x },
    { edge: "right", d: columns - 1 - c.x },
    { edge: "bottom", d: c.y },
    { edge: "top", d: rows - 1 - c.y },
  ];
  edges.sort((a, b) => a.d - b.d);
  return edges[0]?.edge ?? "left";
}

function makeVoidEdge(
  support: Uint8Array,
  supportDist: Int16Array,
  columns: number,
  rows: number,
) {
  let mass = shellFrom(support, columns, rows, 5);
  mass = regularize(mass, supportDist, columns, rows, FILL_OPENINGS, 1);
  keepLargest(mass, columns, rows);
  const c = centroid(support, columns);
  const edge = nearestEdge(c, columns, rows);
  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < columns; x += 1) {
      const drop =
        edge === "right"
          ? x > c.x
          : edge === "left"
            ? x < c.x
            : edge === "top"
              ? y > c.y
              : y < c.y;
      if (drop) mass[y * columns + x] = 0;
    }
  }
  const vx = edge === "right" ? columns * 0.8 : edge === "left" ? columns * 0.2 : c.x;
  const vy = edge === "top" ? rows * 0.8 : edge === "bottom" ? rows * 0.2 : c.y;
  subtractDisc(mass, columns, rows, vx, vy, Math.min(columns, rows) * 0.16);
  clipToReach(mass, supportDist, REACH + 2);
  keepLargest(mass, columns, rows);
  return mass;
}

function makeUndulated(
  plan: PlanModel,
  support: Uint8Array,
  supportDist: Int16Array,
  columns: number,
  rows: number,
) {
  const axis = axisStats(support, columns);
  const pts = supportPoints(support, columns);
  if (pts.length < 2) return support.slice();
  const bins = 18;
  const qs = pts.map((p) => project(p.x, p.y, axis));
  const tMin = Math.min(...qs.map((q) => q.along));
  const tMax = Math.max(...qs.map((q) => q.along));
  const span = Math.max(1, tMax - tMin);
  const acc = new Array(bins).fill(0);
  const n = new Array(bins).fill(0);
  for (const q of qs) {
    const bin = clamp(Math.floor(((q.along - tMin) / span) * (bins - 1)), 0, bins - 1);
    acc[bin] += q.across;
    n[bin] += 1;
  }
  let last = 0;
  const across = acc.map((sum, i) => {
    if (n[i]) last = sum / n[i];
    return last;
  });
  const width = n.map((count) => count);
  for (let pass = 0; pass < 4; pass += 1) {
    const nextA = across.slice();
    const nextW = width.slice();
    for (let i = 1; i < bins - 1; i += 1) {
      nextA[i] = (across[i - 1] + across[i] * 2 + across[i + 1]) / 4;
      nextW[i] = (width[i - 1] + width[i] * 2 + width[i + 1]) / 4;
    }
    for (let i = 0; i < bins; i += 1) {
      across[i] = nextA[i];
      width[i] = nextW[i];
    }
  }
  const maxW = Math.max(...width, 1);
  const ink = blankInk(support.length);
  for (let i = 0; i < bins; i += 1) {
    const t = tMin + (span * i) / (bins - 1);
    const p = unproject(t, across[i], axis);
    const radius = radiusFrom(plan, p.x, p.y, 4.8 + 4.2 * (width[i] / maxW));
    paintDisc(ink, columns, rows, p.x, p.y, radius);
  }
  return regularize(fromInk(ink), supportDist, columns, rows, FILL_OPENINGS, 1);
}

function makeAmphitheater(
  plan: PlanModel,
  support: Uint8Array,
  supportDist: Int16Array,
  columns: number,
  rows: number,
) {
  let shell = shellFrom(support, columns, rows, 4);
  shell = regularize(shell, supportDist, columns, rows, FILL_OPENINGS, 1);
  keepLargest(shell, columns, rows);
  const pocket = deepestInterior(shell, columns, rows);
  const focus = pocket ?? { ...centroid(support, columns), depth: 0 };
  const pts = supportPoints(support, columns);
  const ranked = pts
    .map((p) => ({ p, r: Math.hypot(p.x - focus.x, p.y - focus.y) }))
    .sort((a, b) => a.r - b.r);
  const size = Math.max(1, Math.ceil(ranked.length / 3));
  const groups = [0, 1, 2].map((index) => ranked.slice(index * size, (index + 1) * size)).filter((g) => g.length);
  const raw = groups.map((group) => group.reduce((sum, item) => sum + item.r, 0) / group.length);
  const radii = raw.slice();
  for (let i = 1; i < radii.length; i += 1) {
    if (radii[i] < radii[i - 1] + 8) radii[i] = radii[i - 1] + 8;
  }
  const ink = blankInk(support.length);
  groups.forEach((group, index) => {
    const angles = group.map((item) => Math.atan2(item.p.y - focus.y, item.p.x - focus.x)).sort((a, b) => a - b);
    const a0 = angles[0] ?? 0;
    const a1 = angles[angles.length - 1] ?? a0;
    const turn = Math.max(0.2, a1 - a0);
    const steps = Math.max(5, Math.ceil(turn / 0.16));
    const tube = radiusFrom(plan, focus.x, focus.y, 3.3);
    for (let s = 0; s <= steps; s += 1) {
      const angle = a0 + (turn * s) / steps;
      paintDisc(
        ink,
        columns,
        rows,
        focus.x + Math.cos(angle) * radii[index],
        focus.y + Math.sin(angle) * radii[index],
        tube,
      );
    }
    const mid = a0 + turn / 2;
    paintCapsule(
      ink,
      columns,
      rows,
      focus.x + Math.cos(mid) * 2,
      focus.y + Math.sin(mid) * 2,
      focus.x + Math.cos(mid) * radii[index],
      focus.y + Math.sin(mid) * radii[index],
      2.1,
    );
  });
  let mass = regularize(fromInk(ink), supportDist, columns, rows, FILL_OPENINGS, 1);
  const depth = cellDepth(mass, columns, rows, focus);
  if (depth >= 6) {
    mass = carveEnclosed(mass, columns, rows, focus, Math.min(11, depth - 3), 3, 24, 0.35);
  }
  return mass;
}

function makeInserted(
  plan: PlanModel,
  support: Uint8Array,
  supportDist: Int16Array,
  columns: number,
  rows: number,
) {
  const rowsCount = new Array(rows).fill(0);
  for (let i = 0; i < support.length; i += 1) {
    if (support[i]) rowsCount[(i - (i % columns)) / columns] += 1;
  }
  let best = 0;
  let bestY = Math.round(centroid(support, columns).y);
  for (let y = 0; y < rows; y += 1) {
    let sum = 0;
    for (let k = -3; k <= 3; k += 1) sum += rowsCount[clamp(y + k, 0, rows - 1)] ?? 0;
    if (sum > best) {
      best = sum;
      bestY = y;
    }
  }
  const pts = supportPoints(support, columns);
  let minX = Infinity;
  let maxX = -Infinity;
  for (const p of pts) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
  }
  const ink = blankInk(support.length);
  paintCapsule(ink, columns, rows, minX, bestY, maxX, bestY, radiusFrom(plan, (minX + maxX) / 2, bestY, 10));
  for (const component of plan.mass.components.slice(0, 5)) {
    const c = componentCentroid(component.cells, columns);
    if (Math.abs(c.y - bestY) < 8) continue;
    paintDisc(ink, columns, rows, c.x, c.y, radiusFrom(plan, c.x, c.y, 3.4));
    paintCapsule(ink, columns, rows, c.x, c.y, c.x, bestY, 2);
  }
  return regularize(fromInk(ink), supportDist, columns, rows, FILL_OPENINGS, 1);
}

function makeEdgeGallery(
  plan: PlanModel,
  support: Uint8Array,
  supportDist: Int16Array,
  columns: number,
  rows: number,
) {
  const c = centroid(support, columns);
  const edge = nearestEdge(c, columns, rows);
  const horizontal = edge === "top" || edge === "bottom";
  const pts = supportPoints(support, columns);
  if (!pts.length) return support.slice();
  let minA = Infinity;
  let maxA = -Infinity;
  for (const p of pts) {
    const a = horizontal ? p.x : p.y;
    minA = Math.min(minA, a);
    maxA = Math.max(maxA, a);
  }
  const bins = 24;
  const span = Math.max(1, maxA - minA);
  const frontier = new Array(bins).fill(edge === "left" || edge === "bottom" ? Infinity : -Infinity);
  const seen = new Array(bins).fill(0);
  for (const p of pts) {
    const a = horizontal ? p.x : p.y;
    const bin = clamp(Math.floor(((a - minA) / span) * (bins - 1)), 0, bins - 1);
    const inset = horizontal ? p.y : p.x;
    seen[bin] = 1;
    if (edge === "left" || edge === "bottom") frontier[bin] = Math.min(frontier[bin], inset);
    else frontier[bin] = Math.max(frontier[bin], inset);
  }
  let last = edge === "left" || edge === "bottom" ? 0 : horizontal ? rows - 1 : columns - 1;
  for (let i = 0; i < bins; i += 1) {
    if (seen[i]) last = frontier[i];
    else frontier[i] = last;
  }
  for (let pass = 0; pass < 3; pass += 1) {
    const next = frontier.slice();
    for (let i = 1; i < bins - 1; i += 1) next[i] = (frontier[i - 1] + frontier[i] * 2 + frontier[i + 1]) / 4;
    for (let i = 0; i < bins; i += 1) frontier[i] = next[i];
  }
  const ink = blankInk(support.length);
  const spine: Pt[] = [];
  for (let i = 0; i < bins; i += 1) {
    const a = minA + (span * i) / (bins - 1);
    const p = horizontal ? { x: a, y: frontier[i] } : { x: frontier[i], y: a };
    spine.push(p);
    paintDisc(ink, columns, rows, p.x, p.y, radiusFrom(plan, p.x, p.y, 5.4));
  }
  const spineInset =
    spine.reduce((sum, p) => sum + (horizontal ? p.y : p.x), 0) / Math.max(1, spine.length);
  for (const component of plan.mass.components.slice(0, 6)) {
    const p = componentCentroid(component.cells, columns);
    const inward =
      edge === "left"
        ? p.x > spineInset + 4
        : edge === "right"
          ? p.x < spineInset - 4
          : edge === "bottom"
            ? p.y > spineInset + 4
            : p.y < spineInset - 4;
    if (!inward) continue;
    paintDisc(ink, columns, rows, p.x, p.y, radiusFrom(plan, p.x, p.y, 3.8));
    const sx = horizontal ? p.x : spineInset;
    const sy = horizontal ? spineInset : p.y;
    paintCapsule(ink, columns, rows, sx, sy, p.x, p.y, 2);
  }
  return regularize(fromInk(ink), supportDist, columns, rows, FILL_OPENINGS, 1);
}

export function planMorphogenesis(archetypeId: string, plan: PlanModel): ArchitecturalPlan {
  const columns = plan.domain.columns;
  const rows = plan.domain.rows;
  const support = supportOf(plan);
  const supportDist = distanceFrom(support, columns, rows);
  let mass: Uint8Array;
  if (archetypeId === "vertical-void") mass = makeVerticalVoid(plan, support, supportDist, columns, rows);
  else if (archetypeId === "compressed-sequential") mass = makeSequential(plan, support, supportDist, columns, rows);
  else if (archetypeId === "continuous-hall") mass = makeHall(plan, support, supportDist, columns, rows, 10, false);
  else if (archetypeId === "topographic-ground-field") mass = makeTopographic(plan, support, supportDist, columns, rows);
  else if (archetypeId === "linear-gallery") mass = makeHall(plan, support, supportDist, columns, rows, 3.6, true);
  else if (archetypeId === "open-hall") mass = makeOpenHall(plan, support, supportDist, columns, rows);
  else if (archetypeId === "terraced") mass = makeTerraces(plan, support, supportDist, columns, rows);
  else if (archetypeId === "flat-deep-plan") mass = makeFlat(plan, support, supportDist, columns, rows);
  else if (archetypeId === "void-edge") mass = makeVoidEdge(support, supportDist, columns, rows);
  else if (archetypeId === "undulated") mass = makeUndulated(plan, support, supportDist, columns, rows);
  else if (archetypeId === "stepped-amphitheater") mass = makeAmphitheater(plan, support, supportDist, columns, rows);
  else if (archetypeId === "void-field") mass = makeVoidField(plan, support, supportDist, columns, rows);
  else if (archetypeId === "inserted-horizontal-plate") mass = makeInserted(plan, support, supportDist, columns, rows);
  else if (archetypeId === "contained-room-within-volume") mass = makeContained(plan, support, supportDist, columns, rows);
  else if (archetypeId === "linear-edge-gallery") mass = makeEdgeGallery(plan, support, supportDist, columns, rows);
  else mass = support.slice();

  if (count(mass) < 8) mass = support.slice();
  return { archetypeId, columns, rows, mass };
}
