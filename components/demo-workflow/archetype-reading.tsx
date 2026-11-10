"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { TYPOLOGIES } from "@/lib/catalog";
import { propagatedCandidate, propagatedPreview } from "@/lib/demo-workflow/propagated-candidates";
import styles from "@/components/demo-workflow/archetype-reading.module.css";

type Mode =
  | "void-core"
  | "sequence"
  | "continuity"
  | "field"
  | "spine"
  | "open-field"
  | "steps"
  | "plate"
  | "edge-void"
  | "wave"
  | "bowl"
  | "openings"
  | "separator"
  | "inner-room"
  | "edge-spine";

type Point = { x: number; y: number };
type Blob = { x: number; y: number; r: number; n: number; outline: Point[]; x0: number; y0: number; x1: number; y1: number };
type Span = { x1: number; y: number; x2: number };
type Opening = { x: number; y: number; rx: number; ry: number; n: number; edge: number; outline: Point[]; shore: Point[] };
type Line = { x1: number; y1: number; x2: number; y2: number };

type Figure = {
  openings: Opening[];
  cores: Blob[];
  axis: Line | null;
  spans: Span[];
  shelves: Span[];
  body: Point[];
  plateTrace: Point[];
  plateSpan: Line | null;
  waveTrace: Point[];
  openTrace: Point[];
  edgeTrace: Point[];
  voidTrace: Point[];
  route: Point[];
  bands: Span[];
  mask: Uint8Array;
  firm: Uint8Array;
  maskSize: number;
  special: Special;
};

type GapTick = { x: number; y0: number; y1: number };
type Special = {
  gapEdges: Point[][];
  gapTicks: GapTick[];
  galleries: Point[][];
  terraces: Point[][];
  plateUpper: Point[];
  plateLower: Point[];
  plateDiffuse: Point[];
  upperVoid: Point[];
  voidSeed: Point | null;
  voidMass: Point | null;
  crossH: Point[];
  crossV: Point[];
  crossBars: Point[][];
  outerRoom: Point[];
  innerRoom: Point[];
  edgeVoids: Point[][];
  edgeLines: Point[][];
};

type Mark = { role: "Primary" | "Secondary" | "Tertiary"; text: string };

const READINGS: Record<string, { mode: Mode; caption: string; note: string; marks: Mark[] }> = {
  "vertical-void": {
    mode: "void-core",
    caption: "Emphasize the void as the organizing core.",
    note: "The dark opening inside the mass is the organizing void. Nested contours describe that 2D region. The arrow is the intended vertical reading, not a measured section.",
    marks: [
      { role: "Primary", text: "Boundary of the void" },
      { role: "Secondary", text: "Nested contours and an outer ring" },
      { role: "Tertiary", text: "Vertical arrow through the void" },
    ],
  },
  "compressed-sequential": {
    mode: "sequence",
    caption: "Trace the compression opening into release.",
    note: "A wave runs through the opening between the two masses. A node sits on the wave, and a double arrow under each node marks the width.",
    marks: [
      { role: "Primary", text: "Wave through the opening" },
      { role: "Secondary", text: "Width arrows under each node" },
    ],
  },
  "continuous-hall": {
    mode: "continuity",
    caption: "Trace the continuous route through the body.",
    note: "One line follows the brightest continuous run through the figure. The nodes mark stations on that route. No second path is drawn unless the figure itself splits.",
    marks: [
      { role: "Primary", text: "Continuous route" },
      { role: "Secondary", text: "Stations along the route" },
      { role: "Tertiary", text: "Direction of travel" },
    ],
  },
  "topographic-ground-field": {
    mode: "field",
    caption: "A distributed field, not a single center.",
    note: "Each bright cluster is a separate ground. The links join neighboring clusters. There is no single center.",
    marks: [
      { role: "Primary", text: "Contour of each cluster" },
      { role: "Secondary", text: "Link to the nearest neighbor" },
      { role: "Tertiary", text: "Node at the cluster" },
    ],
  },
  "linear-gallery": {
    mode: "spine",
    caption: "Mark the linear spine that organizes movement.",
    note: "Three ribbons run with the diagonal galleries. Each has a dashed companion and an arrow in the direction of the run.",
    marks: [
      { role: "Primary", text: "Ribbon along each gallery" },
      { role: "Secondary", text: "Dashed companion and direction arrow" },
    ],
  },
  "open-hall": {
    mode: "open-field",
    caption: "Highlight the broad open interior.",
    note: "The tint and the outer line mark the dark interior held inside the network. The inner line, in the expanded view, is that same region pulled inward.",
    marks: [
      { role: "Primary", text: "Boundary of the open interior" },
      { role: "Secondary", text: "Inset of the same region" },
    ],
  },
  terraced: {
    mode: "steps",
    caption: "Trace the stepped progression across the figure.",
    note: "A line follows each terrace and ends in a node. A thinner line joins those nodes.",
    marks: [
      { role: "Primary", text: "Line along each terrace" },
      { role: "Secondary", text: "Node at the end, joined to the next" },
    ],
  },
  "flat-deep-plan": {
    mode: "plate",
    caption: "Show the deep plate across the figure.",
    note: "Two waves cross the figure. The upper wave is continuous. The lower wave is broken.",
    marks: [
      { role: "Primary", text: "Upper wave" },
      { role: "Secondary", text: "Lower broken wave" },
    ],
  },
  "void-edge": {
    mode: "edge-void",
    caption: "Reveal the edge opening at the boundary.",
    note: "A ring sits in the upper-right opening.",
    marks: [
      { role: "Primary", text: "Ring in the upper-right void" },
    ],
  },
  undulated: {
    mode: "wave",
    caption: "Show the repeated wave of compartments.",
    note: "The dashed line follows one continuous strand as it changes side. A ring sits where that strand turns. The arrow gives the direction of the run.",
    marks: [
      { role: "Primary", text: "Sinuous path through the figure" },
      { role: "Secondary", text: "Ring at each change of direction" },
      { role: "Tertiary", text: "Direction of the run" },
    ],
  },
  "stepped-amphitheater": {
    mode: "bowl",
    caption: "Identify the enclosed bowl.",
    note: "The nested lines follow the outline of the gathered mass, pulled toward its center. The steps are short lines on the lower tissue inside that mass, an architectural reading rather than a measured section.",
    marks: [
      { role: "Primary", text: "Outline of the gathered mass" },
      { role: "Secondary", text: "Nested lines toward the center" },
      { role: "Tertiary", text: "Step mark for the intended gathering" },
    ],
  },
  "void-field": {
    mode: "openings",
    caption: "Mark the openings distributed across the field.",
    note: "Each outline is a separate dark opening in the field. The nodes locate them. They are not joined into one center.",
    marks: [
      { role: "Primary", text: "Outline of each opening" },
      { role: "Tertiary", text: "Node at each opening" },
    ],
  },
  "inserted-horizontal-plate": {
    mode: "separator",
    caption: "Show the plate that separates the masses.",
    note: "A cross with four arrows sits in the opening between the four masses.",
    marks: [
      { role: "Primary", text: "Cross in the opening" },
      { role: "Secondary", text: "Arrow at each end" },
    ],
  },
  "contained-room-within-volume": {
    mode: "inner-room",
    caption: "Identify the room inside the volume.",
    note: "A dotted line follows the outer silhouette. A solid line follows the inner void.",
    marks: [
      { role: "Primary", text: "Solid line around the inner void" },
      { role: "Secondary", text: "Dotted silhouette of the volume" },
    ],
  },
  "linear-edge-gallery": {
    mode: "edge-spine",
    caption: "Mark the edge spine and its side distribution.",
    note: "A ring marks each opening. A solid line and a dotted line follow the gallery along those openings, with arrows for direction.",
    marks: [
      { role: "Primary", text: "Ring on each opening" },
      { role: "Secondary", text: "Gallery lines and direction arrows" },
    ],
  },
};

function hull(points: Point[]) {
  const sorted = points.slice().sort((a, b) => a.x - b.x || a.y - b.y);
  if (sorted.length < 3) return sorted;
  const cross = (o: Point, a: Point, b: Point) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const build = (source: Point[]) => {
    const edge: Point[] = [];
    for (const point of source) {
      while (edge.length >= 2 && cross(edge[edge.length - 2], edge[edge.length - 1], point) <= 0) edge.pop();
      edge.push(point);
    }
    edge.pop();
    return edge;
  };
  return build(sorted).concat(build(sorted.slice().reverse()));
}

function contains(poly: Point[], x: number, y: number) {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i, i += 1) {
    const a = poly[i];
    const b = poly[j];
    if ((a.y > y) !== (b.y > y) && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) hit = !hit;
  }
  return hit;
}

function smoothOnce(points: Point[]) {
  const next: Point[] = [];
  for (let index = 0; index < points.length; index += 1) {
    const start = points[index];
    const end = points[(index + 1) % points.length];
    next.push({ x: start.x * 0.75 + end.x * 0.25, y: start.y * 0.75 + end.y * 0.25 });
    next.push({ x: start.x * 0.25 + end.x * 0.75, y: start.y * 0.25 + end.y * 0.75 });
  }
  return next;
}

function smoothClosed(points: Point[]) {
  let current = points;
  for (let pass = 0; pass < 2; pass += 1) {
    const next: Point[] = [];
    for (let index = 0; index < current.length; index += 1) {
      const start = current[index];
      const end = current[(index + 1) % current.length];
      next.push({ x: start.x * 0.75 + end.x * 0.25, y: start.y * 0.75 + end.y * 0.25 });
      next.push({ x: start.x * 0.25 + end.x * 0.75, y: start.y * 0.25 + end.y * 0.75 });
    }
    current = next;
  }
  return current;
}

function pullIn(points: Point[], origin: Point, amount = 0.84) {
  return points.map((point) => ({
    x: origin.x + (point.x - origin.x) * amount,
    y: origin.y + (point.y - origin.y) * amount,
  }));
}

function radialOutline(points: Point[], origin: Point, sectors = 16): Point[] {
  const bins: Point[] = [];
  for (let index = 0; index < sectors; index += 1) bins.push({ x: 0, y: 0 });
  const used = new Array<boolean>(sectors).fill(false);
  const best = new Array<number>(sectors).fill(-1);
  for (const point of points) {
    const angle = Math.atan2(point.y - origin.y, point.x - origin.x);
    const bin = Math.min(sectors - 1, Math.floor(((angle + Math.PI) / (Math.PI * 2)) * sectors));
    const radius = (point.x - origin.x) ** 2 + (point.y - origin.y) ** 2;
    if (radius > best[bin]) {
      best[bin] = radius;
      bins[bin] = point;
      used[bin] = true;
    }
  }
  const outline = bins.filter((_, index) => used[index]);
  return outline.length >= 5 ? outline : [];
}

function components(mask: Uint8Array, size: number, minimum: number): Blob[] {
  const seen = new Uint8Array(size * size);
  const found: Blob[] = [];
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const start = y * size + x;
      if (!mask[start] || seen[start]) continue;
      const queue = [start];
      seen[start] = 1;
      let count = 0;
      let sx = 0;
      let sy = 0;
      let minX = x;
      let maxX = x;
      let minY = y;
      let maxY = y;
      const boundary: Point[] = [];
      while (queue.length) {
        const index = queue.pop() ?? 0;
        const px = index % size;
        const py = (index / size) | 0;
        count += 1;
        sx += px;
        sy += py;
        if (px < minX) minX = px;
        if (px > maxX) maxX = px;
        if (py < minY) minY = py;
        if (py > maxY) maxY = py;
        let rim = false;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
          const nx = px + dx;
          const ny = py + dy;
          if (nx < 0 || ny < 0 || nx >= size || ny >= size || !mask[ny * size + nx]) {
            rim = true;
            continue;
          }
          const next = ny * size + nx;
          if (seen[next]) continue;
          seen[next] = 1;
          queue.push(next);
        }
        if (rim && boundary.length < 240) boundary.push({ x: px / size, y: py / size });
      }
      if (count < minimum) continue;
      const center = { x: sx / count / size, y: sy / count / size };
      const raw = radialOutline(boundary, center, 18);
      found.push({
        x: center.x,
        y: center.y,
        r: Math.max((maxX - minX) / 2, (maxY - minY) / 2) / size,
        n: count,
        outline: raw.length ? smoothOnce(raw) : [],
        x0: minX / size,
        y0: minY / size,
        x1: maxX / size,
        y1: maxY / size,
      });
    }
  }
  return found.sort((a, b) => b.n - a.n);
}

function axisOf(points: Point[]): Line | null {
  if (points.length < 8) return null;
  let sx = 0;
  let sy = 0;
  for (const point of points) {
    sx += point.x;
    sy += point.y;
  }
  const cx = sx / points.length;
  const cy = sy / points.length;
  let xx = 0;
  let yy = 0;
  let xy = 0;
  for (const point of points) {
    const dx = point.x - cx;
    const dy = point.y - cy;
    xx += dx * dx;
    yy += dy * dy;
    xy += dx * dy;
  }
  const angle = 0.5 * Math.atan2(2 * xy, xx - yy);
  const ux = Math.cos(angle);
  const uy = Math.sin(angle);
  const projection = points.map((point) => (point.x - cx) * ux + (point.y - cy) * uy).sort((a, b) => a - b);
  const start = projection[Math.floor(projection.length * 0.12)] ?? 0;
  const end = projection[Math.floor(projection.length * 0.88)] ?? 0;
  if (end - start < 0.12) return null;
  return { x1: cx + ux * start, y1: cy + uy * start, x2: cx + ux * end, y2: cy + uy * end };
}

/** Reads the plate once: openings, bright cores, the long axis, horizontal spans, and the body edge. */
function readFigure(img: HTMLImageElement): Figure | null {
  const size = 72;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx || !img.naturalWidth) return null;
  ctx.drawImage(img, 0, 0, size, size);
  const pixels = ctx.getImageData(0, 0, size, size).data;
  const occupied = new Uint8Array(size * size);
  const soft = new Uint8Array(size * size);
  const firm = new Uint8Array(size * size);
  const bright = new Uint8Array(size * size);
  const samples: Point[] = [];
  const brightPoints: Point[] = [];
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const pixel = (y * size + x) * 4;
      const tone = pixels[pixel] + pixels[pixel + 1] + pixels[pixel + 2];
      const index = y * size + x;
      if (tone > 40) soft[index] = 1;
      if (tone > 240) firm[index] = 1;
      if (tone <= 96) continue;
      occupied[index] = 1;
      if (x % 2 === 0 && y % 2 === 0) samples.push({ x: x / size, y: y / size });
      if (tone > 460) {
        bright[index] = 1;
        brightPoints.push({ x: x / size, y: y / size });
      }
    }
  }
  if (samples.length < 12) return null;
  const poly = hull(samples);
  const pocket = new Uint8Array(size * size);
  for (let y = 1; y < size - 1; y += 1) {
    for (let x = 1; x < size - 1; x += 1) {
      if (!occupied[y * size + x] && contains(poly, x / size, y / size)) pocket[y * size + x] = 1;
    }
  }
  const seen = new Uint8Array(size * size);
  const openings: Opening[] = [];
  for (let y = 1; y < size - 1; y += 1) {
    for (let x = 1; x < size - 1; x += 1) {
      const start = y * size + x;
      if (!pocket[start] || seen[start]) continue;
      const queue = [start];
      seen[start] = 1;
      let count = 0;
      let sx = 0;
      let sy = 0;
      let minX = x;
      let maxX = x;
      let minY = y;
      let maxY = y;
      const boundary: Point[] = [];
      while (queue.length) {
        const index = queue.pop() ?? 0;
        const px = index % size;
        const py = (index / size) | 0;
        count += 1;
        sx += px;
        sy += py;
        if (px < minX) minX = px;
        if (px > maxX) maxX = px;
        if (py < minY) minY = py;
        if (py > maxY) maxY = py;
        let rim = false;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
          const nx = px + dx;
          const ny = py + dy;
          if (nx <= 0 || ny <= 0 || nx >= size - 1 || ny >= size - 1) {
            rim = true;
            continue;
          }
          const next = ny * size + nx;
          if (occupied[next]) rim = true;
          if (!pocket[next] || seen[next]) continue;
          seen[next] = 1;
          queue.push(next);
        }
        if (rim && boundary.length < 400) boundary.push({ x: px / size, y: py / size });
      }
      if (count < 24) continue;
      const center = { x: sx / count / size, y: sy / count / size };
      const edge = Math.min(center.x, center.y, 1 - center.x, 1 - center.y);
      const raw = radialOutline(boundary, center, 28);
      openings.push({
        x: center.x,
        y: center.y,
        rx: Math.max((maxX - minX) / 2 / size, 0.045),
        ry: Math.max((maxY - minY) / 2 / size, 0.045),
        n: count,
        edge,
        outline: raw.length ? pullIn(smoothClosed(raw), center) : [],
        shore: boundary.filter((_, index) => index % 3 === 0),
      });
    }
  }
  openings.sort((a, b) => b.n - a.n);
  const shelves: Span[] = [];
  const rowCount = new Float64Array(size);
  const rowStart = new Int16Array(size).fill(size);
  const rowEnd = new Int16Array(size);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      if (!bright[y * size + x]) continue;
      rowCount[y] += 1;
      if (x < rowStart[y]) rowStart[y] = x;
      if (x > rowEnd[y]) rowEnd[y] = x;
    }
  }
  const rowSmooth = rowCount.map((_, y) => {
    let sum = 0;
    let count = 0;
    for (let offset = -2; offset <= 2; offset += 1) {
      const row = y + offset;
      if (row < 0 || row >= size) continue;
      sum += rowCount[row];
      count += 1;
    }
    return count ? sum / count : 0;
  });
  const shelfRows: number[] = [];
  const peaks: number[] = [];
  for (let y = 3; y < size - 3; y += 1) {
    if (rowSmooth[y] < size * 0.035) continue;
    const peak = rowSmooth[y] >= rowSmooth[y - 1] && rowSmooth[y] >= rowSmooth[y + 1] && rowSmooth[y] >= rowSmooth[y - 2] && rowSmooth[y] >= rowSmooth[y + 2];
    if (peak) peaks.push(y);
  }
  for (const y of peaks.sort((a, b) => rowSmooth[b] - rowSmooth[a])) {
    if (shelfRows.some((row) => Math.abs(row - y) < 8)) continue;
    shelfRows.push(y);
  }
  shelfRows
    .sort((a, b) => rowSmooth[b] - rowSmooth[a])
    .slice(0, 3)
    .sort((a, b) => a - b)
    .forEach((y) => {
      if (rowStart[y] > rowEnd[y]) return;
      shelves.push({ x1: rowStart[y] / size, y: y / size, x2: rowEnd[y] / size });
    });
  const spans: Span[] = [];
  for (let y = 0; y < size; y += 1) {
    let run = 0;
    let best = 0;
    let x1 = 0;
    let bestX = 0;
    for (let x = 0; x <= size; x += 1) {
      if (x < size && occupied[y * size + x]) {
        if (run === 0) x1 = x;
        run += 1;
      } else if (run > best) {
        best = run;
        bestX = x1;
        run = 0;
      } else {
        run = 0;
      }
    }
    if (best > size * 0.22) spans.push({ x1: bestX / size, y: y / size, x2: (bestX + best) / size });
  }
  let bodyOriginX = 0;
  let bodyOriginY = 0;
  for (const point of samples) {
    bodyOriginX += point.x;
    bodyOriginY += point.y;
  }
  const bodyCenter = { x: bodyOriginX / samples.length, y: bodyOriginY / samples.length };
  const bodyHull = hull(samples.filter((_, index) => index % 2 === 0));
  const cores = components(bright, size, 6).slice(0, 5);
  const axis = axisOf(brightPoints.length > 24 ? brightPoints : samples);
  return {
    openings: openings.slice(0, 4),
    cores,
    axis,
    spans,
    shelves,
    body: bodyHull.length >= 4 ? pullIn(smoothClosed(bodyHull), bodyCenter, 0.94) : [],
    ...tracePlate(firm, size),
    waveTrace: traceWave(occupied, size),
    openTrace: traceOpen(occupied, size),
    edgeTrace: traceEdge(firm, size),
    voidTrace: traceVoidEdge(firm, size),
    route: traceRoute(soft, size, components(firm, size, 4).slice(0, 4), axis),
    bands: traceBands(occupied, size),
    mask: occupied,
    firm,
    maskSize: size,
    special: readSpecial(img),
  };
}

function smoothOpen(points: Point[]) {
  let current = points;
  for (let pass = 0; pass < 2; pass += 1) {
    if (current.length < 5) return current;
    const next = [current[0]];
    for (let index = 1; index < current.length - 1; index += 1) {
      const previous = current[index - 1];
      const point = current[index];
      const following = current[index + 1];
      next.push({
        x: previous.x * 0.25 + point.x * 0.5 + following.x * 0.25,
        y: previous.y * 0.25 + point.y * 0.5 + following.y * 0.25,
      });
    }
    next.push(current[current.length - 1]);
    current = next;
  }
  return current;
}

/** The lowest continuous band, as the region between its upper and lower edges. */
function tracePlate(soft: Uint8Array, size: number): { plateTrace: Point[]; plateSpan: Line | null } {
  const counts = new Int16Array(size);
  let minY = size;
  let maxY = 0;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) if (soft[y * size + x]) counts[y] += 1;
    if (!counts[y]) continue;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  if (maxY <= minY) return { plateTrace: [], plateSpan: null };
  let peakRow = 0;
  let peak = 0;
  for (let y = 0; y < size; y += 1) {
    if (counts[y] <= peak) continue;
    peak = counts[y];
    peakRow = y;
  }
  if (peak < size * 0.08) return { plateTrace: [], plateSpan: null };
  let top = peakRow;
  let bottom = peakRow;
  while (top > minY && counts[top - 1] >= peak * 0.4) top -= 1;
  while (bottom < maxY && counts[bottom + 1] >= peak * 0.4) bottom += 1;
  const maxBand = Math.round(size * 0.22);
  while (bottom - top > maxBand) {
    if (peakRow - top >= bottom - peakRow) top += 1;
    else bottom -= 1;
  }
  const upper: Point[] = [];
  const lower: Point[] = [];
  for (let x = 0; x < size; x += 1) {
    let y0 = -1;
    let y1 = -1;
    for (let y = top; y <= bottom; y += 1) {
      if (!soft[y * size + x]) continue;
      if (y0 < 0) y0 = y;
      y1 = y;
    }
    if (y0 < 0) continue;
    upper.push({ x: x / size, y: y0 / size });
    lower.push({ x: x / size, y: y1 / size });
  }
  const ceiling = smoothOpen(longestRun(upper));
  const bed = smoothOpen(longestRun(lower));
  if (ceiling.length < 6 || bed.length < 6) return { plateTrace: [], plateSpan: null };
  const end = ceiling[ceiling.length - 1];
  const before = ceiling[Math.max(0, ceiling.length - 2)];
  return {
    plateTrace: [...ceiling, ...bed.slice().reverse()],
    plateSpan: { x1: before.x, y1: (before.y + bed[Math.min(bed.length - 1, Math.max(0, ceiling.length - 2))].y) / 2, x2: end.x, y2: (end.y + bed[bed.length - 1].y) / 2 },
  };
}

/** Follows one continuous strand as it changes side, instead of averaging a whole row. */
function traceWave(occupied: Uint8Array, size: number) {
  const points: Point[] = [];
  let previous: number | null = null;
  for (let y = 0; y < size; y += 2) {
    const runs: Array<[number, number]> = [];
    let run = 0;
    let start = 0;
    for (let x = 0; x <= size; x += 1) {
      if (x < size && occupied[y * size + x]) {
        if (run === 0) start = x;
        run += 1;
      } else if (run) {
        runs.push([start, start + run - 1]);
        run = 0;
      }
    }
    if (!runs.length) continue;
    const anchor = previous ?? 0;
    const chosen: [number, number] = previous == null
      ? runs.slice().sort((a, b) => (b[1] - b[0]) - (a[1] - a[0]))[0]
      : runs.slice().sort((a, b) => Math.abs((a[0] + a[1]) / 2 - anchor) - Math.abs((b[0] + b[1]) / 2 - anchor))[0];
    const center = (chosen[0] + chosen[1]) / 2;
    if (previous != null && Math.abs(center - previous) > size * 0.28) continue;
    previous = center;
    points.push({ x: center / size, y: y / size });
  }
  return smoothOpen(points);
}

/** The dark region held inside the figure, outlined where the morphology bounds it. */
function traceOpen(occupied: Uint8Array, size: number) {
  const inside = new Uint8Array(size * size);
  for (let y = 0; y < size; y += 1) {
    let left = -1;
    let right = -1;
    for (let x = 0; x < size; x += 1) {
      if (!occupied[y * size + x]) continue;
      if (left < 0) left = x;
      right = x;
    }
    if (left < 0) continue;
    for (let x = left; x <= right; x += 1) if (!occupied[y * size + x]) inside[y * size + x] = 1;
  }
  const seen = new Uint8Array(size * size);
  let best: number[] = [];
  for (let y = 1; y < size - 1; y += 1) {
    for (let x = 1; x < size - 1; x += 1) {
      const start = y * size + x;
      if (!inside[start] || seen[start]) continue;
      const queue = [start];
      seen[start] = 1;
      const component: number[] = [];
      while (queue.length) {
        const index = queue.pop() ?? 0;
        component.push(index);
        const px = index % size;
        const py = (index / size) | 0;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
          const nx = px + dx;
          const ny = py + dy;
          if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
          const next = ny * size + nx;
          if (!inside[next] || seen[next]) continue;
          seen[next] = 1;
          queue.push(next);
        }
      }
      if (component.length > best.length) best = component;
    }
  }
  if (best.length < 36) return [];
  const grown = new Uint8Array(size * size);
  for (const index of best) {
    const px = index % size;
    const py = (index / size) | 0;
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        const nx = px + dx;
        const ny = py + dy;
        if (nx < 1 || ny < 1 || nx >= size - 1 || ny >= size - 1) continue;
        if (occupied[ny * size + nx]) continue;
        grown[ny * size + nx] = 1;
      }
    }
  }
  best = [];
  for (let index = 0; index < grown.length; index += 1) if (grown[index]) best.push(index);
  const boundary: Point[] = [];
  let sx = 0;
  let sy = 0;
  for (const index of best) {
    const px = index % size;
    const py = (index / size) | 0;
    sx += px;
    sy += py;
    let rim = false;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const nx = px + dx;
      const ny = py + dy;
      if (nx < 0 || ny < 0 || nx >= size || ny >= size || occupied[ny * size + nx]) rim = true;
    }
    if (rim) boundary.push({ x: px / size, y: py / size });
  }
  const center = { x: sx / best.length / size, y: sy / best.length / size };
  const raw = radialOutline(boundary, center, 42);
  return raw.length ? smoothOnce(raw) : [];
}

/** The outer edge of the right-hand mass, kept on that mass when hairs reach farther. */
function traceEdge(firm: Uint8Array, size: number) {
  const points: Point[] = [];
  let previous: number | null = null;
  for (let y = 0; y < size; y += 2) {
    const runs: Array<{ end: number; length: number }> = [];
    let run = 0;
    let start = 0;
    for (let x = 0; x <= size; x += 1) {
      if (x < size && firm[y * size + x]) {
        if (run === 0) start = x;
        run += 1;
      } else if (run) {
        runs.push({ end: start + run - 1, length: run });
        run = 0;
      }
    }
    const solid = runs.filter((item) => item.length >= 3);
    if (!solid.length) continue;
    const outer = solid[solid.length - 1];
    const near: { end: number; length: number } | undefined = previous == null ? outer : solid.filter((item) => Math.abs(item.end - (previous ?? outer.end)) <= size * 0.12).sort((a, b) => b.end - a.end)[0];
    const chosen: { end: number; length: number } | null = near ?? null;
    if (!chosen) continue;
    previous = chosen.end;
    points.push({ x: Math.max(0, chosen.end - 1.5) / size, y: y / size });
  }
  const thinned = points.filter((_, index) => index % 2 === 0);
  return smoothOpen(smoothOpen(thinned.length > 5 ? thinned : points));
}

/** A flat base, a clear arch over the edge void, then the rise of the mass. */
function traceVoidEdge(firm: Uint8Array, size: number) {
  const points: Point[] = [];
  let previous = -1;
  for (let x = 0; x < size; x += 1) {
    let last = -1;
    for (let y = size - 1; y >= 0; y -= 1) {
      if (!firm[y * size + x]) continue;
      last = y;
      break;
    }
    if (last < 0) continue;
    if (previous >= 0 && Math.abs(last - previous) > size * 0.16) continue;
    previous = last;
    points.push({ x: x / size, y: last / size });
  }
  const run = longestRun(points).filter((point) => point.y > 0.45);
  return run.length >= 8 ? smoothOpen(run) : [];
}

/** Horizontal masses separated by a real gap, so a terrace is a band and not the brightest row. */
function traceBands(occupied: Uint8Array, size: number): Span[] {
  const counts = new Float64Array(size);
  const start = new Int16Array(size).fill(size);
  const end = new Int16Array(size);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      if (!occupied[y * size + x]) continue;
      counts[y] += 1;
      if (x < start[y]) start[y] = x;
      if (x > end[y]) end[y] = x;
    }
  }
  const smooth = counts.map((_, y) => {
    let sum = 0;
    let count = 0;
    for (let offset = -1; offset <= 1; offset += 1) {
      const row = y + offset;
      if (row < 0 || row >= size) continue;
      sum += counts[row];
      count += 1;
    }
    return count ? sum / count : 0;
  });
  const threshold = size * 0.07;
  const bands: Span[] = [];
  let y = 0;
  while (y < size) {
    if (smooth[y] < threshold) {
      y += 1;
      continue;
    }
    const y0 = y;
    let peak = smooth[y];
    while (y < size && smooth[y] >= threshold * 0.6) {
      if (smooth[y] > peak) peak = smooth[y];
      y += 1;
    }
    let x1 = size;
    let x2 = 0;
    for (let row = y0; row < y; row += 1) {
      if (smooth[row] < peak * 0.55 || start[row] >= size) continue;
      if (start[row] < x1) x1 = start[row];
      if (end[row] > x2) x2 = end[row];
    }
    if (y - y0 >= 3 && x2 > x1) {
      bands.push({ x1: x1 / size, y: (y0 + y - 1) / 2 / size, x2: x2 / size });
    }
  }
  return bands.filter((band, index) => index === 0 || band.y - bands[index - 1].y > 0.06).slice(0, 4);
}

function cellOf(point: Point, size: number) {
  return { x: Math.max(0, Math.min(size - 1, Math.round(point.x * (size - 1)))), y: Math.max(0, Math.min(size - 1, Math.round(point.y * (size - 1)))) };
}

function nearestOccupied(mask: Uint8Array, size: number, point: Point) {
  const origin = cellOf(point, size);
  if (mask[origin.y * size + origin.x]) return origin;
  for (let radius = 1; radius <= 5; radius += 1) {
    for (let dy = -radius; dy <= radius; dy += 1) {
      for (let dx = -radius; dx <= radius; dx += 1) {
        const x = origin.x + dx;
        const y = origin.y + dy;
        if (x < 0 || y < 0 || x >= size || y >= size) continue;
        if (mask[y * size + x]) return { x, y };
      }
    }
  }
  return null;
}

/** A path that stays on the tissue between bright stations. A failed leg is omitted rather than bridged. */
function traceRoute(occupied: Uint8Array, size: number, cores: Blob[], axis: Line | null): Point[] {
  const ordered = cores.slice().sort((a, b) => {
    if (!axis) return a.x - b.x || a.y - b.y;
    const dx = axis.x2 - axis.x1;
    const dy = axis.y2 - axis.y1;
    return (a.x * dx + a.y * dy) - (b.x * dx + b.y * dy);
  });
  if (ordered.length < 2) return [];
  const points: Point[] = [];
  for (let index = 0; index < ordered.length - 1; index += 1) {
    const start = nearestOccupied(occupied, size, ordered[index]);
    const goal = nearestOccupied(occupied, size, ordered[index + 1]);
    if (!start || !goal) break;
    const parent = new Int32Array(size * size).fill(-1);
    const queue = [start.y * size + start.x];
    parent[start.y * size + start.x] = start.y * size + start.x;
    let found = -1;
    let head = 0;
    while (head < queue.length) {
      const current = queue[head];
      head += 1;
      if (current === goal.y * size + goal.x) {
        found = current;
        break;
      }
      const px = current % size;
      const py = (current / size) | 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const nx = px + dx;
        const ny = py + dy;
        if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
        const next = ny * size + nx;
        if (parent[next] >= 0 || !occupied[next]) continue;
        parent[next] = current;
        queue.push(next);
      }
    }
    if (found < 0) break;
    const leg: Point[] = [];
    let cursor = found;
    while (parent[cursor] !== cursor) {
      leg.push({ x: (cursor % size) / size, y: ((cursor / size) | 0) / size });
      cursor = parent[cursor];
    }
    leg.push({ x: (cursor % size) / size, y: ((cursor / size) | 0) / size });
    leg.reverse();
    points.push(...(index === 0 ? leg : leg.slice(1)));
  }
  if (points.length < 6) return [];
  const thinned = points.filter((_, index) => index % 2 === 0);
  return smoothOpen(thinned.length > 5 ? thinned : points);
}

function measureReach(mask: Uint8Array, size: number, point: Point, px: number, py: number, sign: number) {
  const step = 1 / size;
  let last = 0;
  for (let distance = step; distance < 0.42; distance += step) {
    const x = point.x + px * sign * distance;
    const y = point.y + py * sign * distance;
    const ix = Math.round(x * (size - 1));
    const iy = Math.round(y * (size - 1));
    if (ix < 0 || iy < 0 || ix >= size || iy >= size || !mask[iy * size + ix]) break;
    last = distance;
  }
  return last;
}

function turnsOf(points: Point[]) {
  const found: Point[] = [];
  for (let index = 1; index < points.length - 1; index += 1) {
    const before = points[index].x - points[index - 1].x;
    const after = points[index + 1].x - points[index].x;
    if (before * after < 0 && Math.abs(before) + Math.abs(after) > 0.012) found.push(points[index]);
  }
  return found.slice(0, 4);
}

function longestRun(points: Point[]) {
  let best: Point[] = [];
  let current: Point[] = [];
  for (const point of points) {
    const previous = current[current.length - 1];
    if (previous && point.x - previous.x > 0.06) {
      if (current.length > best.length) best = current;
      current = [];
    }
    current.push(point);
  }
  if (current.length > best.length) best = current;
  return best;
}

function draw(points: Point[], close = true) {
  if (points.length < 2) return "";
  const command = points.map((point) => `${(point.x * 100).toFixed(1)} ${(point.y * 100).toFixed(1)}`).join(" L ");
  return `M ${command}${close ? " Z" : ""}`;
}

function Spine({ line, glow = true }: { line: Line; glow?: boolean }) {
  const x1 = line.x1 * 100;
  const y1 = line.y1 * 100;
  const x2 = line.x2 * 100;
  const y2 = line.y2 * 100;
  return (
    <>
      {glow ? <line className={styles.glow} x1={x1} y1={y1} x2={x2} y2={y2} /> : null}
      <line className={styles.primary} x1={x1} y1={y1} x2={x2} y2={y2} />
    </>
  );
}

function stations(line: Line, count: number) {
  return Array.from({ length: count }, (_, index) => {
    const t = count === 1 ? 0.5 : index / (count - 1);
    return { x: line.x1 + (line.x2 - line.x1) * t, y: line.y1 + (line.y2 - line.y1) * t, t };
  });
}

function centroid(points: Point[]) {
  const sum = points.reduce((acc, point) => ({ x: acc.x + point.x, y: acc.y + point.y }), { x: 0, y: 0 });
  return { x: sum.x / points.length, y: sum.y / points.length };
}

function Head({ x, y, dx, dy }: { x: number; y: number; dx: number; dy: number }) {
  const length = Math.hypot(dx, dy) || 1;
  const ux = (dx / length) * 3.4;
  const uy = (dy / length) * 3.4;
  const px = (-dy / length) * 1.45;
  const py = (dx / length) * 1.45;
  const tipX = x * 100;
  const tipY = y * 100;
  return <polyline className={styles.arrow} points={`${tipX - ux + px},${tipY - uy + py} ${tipX},${tipY} ${tipX - ux - px},${tipY - uy - py}`} />;
}

function offsetOpen(points: Point[], amount: number) {
  return points.map((point, index) => {
    const previous = points[Math.max(0, index - 1)];
    const next = points[Math.min(points.length - 1, index + 1)];
    const dx = next.x - previous.x;
    const dy = next.y - previous.y;
    const length = Math.hypot(dx, dy) || 1;
    return { x: point.x + (-dy / length) * amount, y: point.y + (dx / length) * amount };
  });
}

function along(points: Point[], count: number) {
  if (points.length <= count) return points;
  return Array.from({ length: count }, (_, index) => points[Math.round((index / (count - 1)) * (points.length - 1))]);
}

function normalOf(line: Line) {
  const dx = line.x2 - line.x1;
  const dy = line.y2 - line.y1;
  const length = Math.hypot(dx, dy) || 1;
  return { dx, dy, length, px: -dy / length, py: dx / length };
}

/** Side lines along the bright spine, widening only where the tissue does. */
function spineEdges(line: Line, mask: Uint8Array, size: number) {
  const { px, py } = normalOf(line);
  const runs: Array<{ left: Point[]; right: Point[] }> = [];
  let left: Point[] = [];
  let right: Point[] = [];
  let missed = 0;
  const flush = () => {
    if (left.length > 3) runs.push({ left: left.slice(), right: right.slice() });
    left = [];
    right = [];
  };
  for (let index = 0; index <= 20; index += 1) {
    const t = index / 20;
    const point = { x: line.x1 + (line.x2 - line.x1) * t, y: line.y1 + (line.y2 - line.y1) * t };
    const cell = nearestOccupied(mask, size, point);
    const snapped = cell ? { x: cell.x / (size - 1), y: cell.y / (size - 1) } : null;
    const near = snapped != null && Math.hypot(snapped.x - point.x, snapped.y - point.y) <= 0.045;
    if (!near || !snapped) {
      missed += 1;
      if (missed > 1) flush();
      continue;
    }
    missed = 0;
    const negative = Math.max(measureReach(mask, size, snapped, px, py, -1), 0.012);
    const positive = Math.max(measureReach(mask, size, snapped, px, py, 1), 0.012);
    left.push({ x: snapped.x - px * negative, y: snapped.y - py * negative });
    right.push({ x: snapped.x + px * positive, y: snapped.y + py * positive });
  }
  flush();
  runs.sort((a, b) => b.left.length - a.left.length);
  const best = runs[0];
  if (!best) return { left: [] as Point[], right: [] as Point[] };
  return { left: smoothOpen(best.left), right: smoothOpen(best.right) };
}

/** Short lines on occupied tissue inside the mass, kept in its lower portion. */
function tissueChords(mask: Uint8Array, size: number, body: Point[]): Span[] {
  if (body.length < 4) return [];
  const ys = body.map((point) => point.y);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const lines: Span[] = [];
  for (let index = 1; index <= 3; index += 1) {
    const y = minY + (maxY - minY) * (0.58 + 0.1 * index);
    const iy = Math.max(0, Math.min(size - 1, Math.round(y * (size - 1))));
    let best: { x1: number; x2: number; len: number } | null = null;
    let run = 0;
    let start = 0;
    for (let x = 0; x <= size; x += 1) {
      const on = x < size && mask[iy * size + x] === 1 && contains(body, x / size, y);
      if (on) {
        if (run === 0) start = x;
        run += 1;
      } else if (run) {
        if (!best || run > best.len) best = { x1: start, x2: start + run - 1, len: run };
        run = 0;
      }
    }
    if (best && best.len > 5) lines.push({ x1: best.x1 / size, y, x2: best.x2 / size });
  }
  return lines;
}

function separatingGap(cores: Blob[]) {
  let best: { gap: number; y: number; x1: number; x2: number; top: number; bottom: number } | null = null;
  for (let index = 0; index < cores.length; index += 1) {
    for (let other = index + 1; other < cores.length; other += 1) {
      const upper = cores[index].y0 <= cores[other].y0 ? cores[index] : cores[other];
      const lower = upper === cores[index] ? cores[other] : cores[index];
      const gap = lower.y0 - upper.y1;
      const x1 = Math.max(upper.x0, lower.x0);
      const x2 = Math.min(upper.x1, lower.x1);
      if (gap < 0.025 || x2 - x1 < 0.05) continue;
      if (!best || gap > best.gap) best = { gap, y: (upper.y1 + lower.y0) / 2, x1, x2, top: upper.y1, bottom: lower.y0 };
    }
  }
  return best;
}

const EMPTY_SPECIAL: Special = {
  gapEdges: [],
  gapTicks: [],
  galleries: [],
  terraces: [],
  plateUpper: [],
  plateLower: [],
  plateDiffuse: [],
  upperVoid: [],
  voidSeed: null,
  voidMass: null,
  crossH: [],
  crossV: [],
  crossBars: [],
  outerRoom: [],
  innerRoom: [],
  edgeVoids: [],
  edgeLines: [],
};

function fieldOf(img: HTMLImageElement, size: number) {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx || !img.naturalWidth) return null;
  ctx.drawImage(img, 0, 0, size, size);
  const pixels = ctx.getImageData(0, 0, size, size).data;
  const tone = new Float32Array(size * size);
  const occupied = new Uint8Array(size * size);
  const firm = new Uint8Array(size * size);
  for (let index = 0; index < size * size; index += 1) {
    const value = pixels[index * 4] + pixels[index * 4 + 1] + pixels[index * 4 + 2];
    tone[index] = value;
    if (value > 90) occupied[index] = 1;
    if (value > 200) firm[index] = 1;
  }
  return { tone, occupied, firm, size };
}

function traceCompression(firm: Uint8Array, size: number): { edges: Point[][]; ticks: GapTick[] } {
  const masses = components(firm, size, 18).slice(0, 2);
  if (masses.length < 2) return { edges: [], ticks: [] };
  const upper = masses[0].y <= masses[1].y ? masses[0] : masses[1];
  const lower = upper === masses[0] ? masses[1] : masses[0];
  const mid = ((upper.y + lower.y) / 2) * size;
  const x0 = Math.max(0, Math.floor(Math.min(upper.x0, lower.x0) * size));
  const x1 = Math.min(size - 1, Math.ceil(Math.max(upper.x1, lower.x1) * size));
  const topEdge: Point[] = [];
  const bottomEdge: Point[] = [];
  for (let x = x0; x <= x1; x += 1) {
    let topY = -1;
    let bottomY = -1;
    for (let y = 0; y < size; y += 1) {
      if (!firm[y * size + x]) continue;
      if (y <= mid) topY = y;
      else if (bottomY < 0) bottomY = y;
    }
    if (topY < 0 || bottomY < 0 || bottomY - topY < 2) continue;
    topEdge.push({ x: x / size, y: topY / size });
    bottomEdge.push({ x: x / size, y: bottomY / size });
  }
  const top = smoothOpen(longestRun(topEdge));
  const bottom = smoothOpen(longestRun(bottomEdge));
  const count = Math.min(top.length, bottom.length);
  if (count < 8) return { edges: [], ticks: [] };
  const pairedTop = top.slice(0, count);
  const pairedBottom = bottom.slice(0, count);
  const widthAt = (index: number) => pairedBottom[index].y - pairedTop[index].y;
  let narrow = 0;
  for (let index = 1; index < count; index += 1) if (widthAt(index) < widthAt(narrow)) narrow = index;
  const stations = [Math.round(count * 0.16), narrow, Math.round(count * 0.84)];
  const ticks = stations.map((index) => ({
    x: pairedTop[index].x,
    y0: pairedTop[index].y,
    y1: pairedBottom[index].y,
  }));
  return { edges: [pairedTop, pairedBottom], ticks };
}

function traceGalleries(occupied: Uint8Array, size: number): Point[][] {
  const chains: Array<{ points: Point[]; x: number; open: boolean }> = [];
  for (let y = 1; y < size - 1; y += 1) {
    const runs: Array<[number, number]> = [];
    let run = 0;
    let start = 0;
    for (let x = 0; x <= size; x += 1) {
      if (x < size && occupied[y * size + x]) {
        if (run === 0) start = x;
        run += 1;
      } else if (run) {
        runs.push([start, start + run - 1]);
        run = 0;
      }
    }
    const gaps: Array<{ x: number; y: number }> = [];
    for (let index = 0; index < runs.length - 1; index += 1) {
      const gap = runs[index + 1][0] - runs[index][1] - 1;
      const left = runs[index][1] - runs[index][0] + 1;
      const right = runs[index + 1][1] - runs[index + 1][0] + 1;
      if (gap < 2 || gap > size * 0.24 || left < 1 || right < 1) continue;
      gaps.push({ x: (runs[index][1] + runs[index + 1][0]) / 2 / size, y: y / size });
    }
    const used = new Set<number>();
    for (const chain of chains) {
      if (!chain.open) continue;
      if (chain.points.length && y / size - chain.points[chain.points.length - 1].y > 0.045) {
        chain.open = false;
        continue;
      }
      let best = -1;
      let distance = size * 0.11;
      gaps.forEach((gap, index) => {
        const delta = Math.abs(gap.x - chain.x) * size;
        if (used.has(index) || delta >= distance) return;
        distance = delta;
        best = index;
      });
      if (best < 0) {
        chain.open = false;
        continue;
      }
      used.add(best);
      chain.points.push(gaps[best]);
      chain.x = gaps[best].x;
    }
    gaps.forEach((gap, index) => {
      if (used.has(index)) return;
      chains.push({ points: [gap], x: gap.x, open: true });
    });
  }
  return chains
    .map((chain) => smoothOpen(chain.points.filter((_, index) => index % 2 === 0)))
    .filter((points) => points.length > size * 0.08)
    .sort((a, b) => b.length - a.length)
    .slice(0, 4);
}

function traceTerraces(firm: Uint8Array, size: number): Point[][] {
  const counts = new Float64Array(size);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) if (firm[y * size + x]) counts[y] += 1;
  }
  const smooth = counts.map((_, y) => {
    let sum = 0;
    let count = 0;
    for (let offset = -2; offset <= 2; offset += 1) {
      const row = y + offset;
      if (row < 0 || row >= size) continue;
      sum += counts[row];
      count += 1;
    }
    return count ? sum / count : 0;
  });
  const peaks: number[] = [];
  for (let y = 3; y < size - 3; y += 1) {
    if (smooth[y] < size * 0.06) continue;
    const peak = smooth[y] >= smooth[y - 1] && smooth[y] >= smooth[y + 1] && smooth[y] >= smooth[y - 2] && smooth[y] >= smooth[y + 2];
    if (!peak || peaks.some((row) => Math.abs(row - y) < size * 0.1)) continue;
    peaks.push(y);
  }
  const lines: Point[][] = [];
  for (const peak of peaks) {
    const segments: Point[][] = [];
    let current: Point[] = [];
    let gap = 0;
    for (let x = 0; x < size; x += 1) {
      let sum = 0;
      let count = 0;
      for (let y = Math.max(0, peak - 4); y <= Math.min(size - 1, peak + 4); y += 1) {
        if (!firm[y * size + x]) continue;
        sum += y;
        count += 1;
      }
      if (!count) {
        gap += 1;
        if (gap > 3 && current.length) {
          segments.push(current);
          current = [];
        }
        continue;
      }
      gap = 0;
      current.push({ x: x / size, y: sum / count / size });
    }
    if (current.length) segments.push(current);
    for (const segment of segments) {
      const line = smoothOpen(segment.filter((_, index) => index % 2 === 0));
      if (line.length > 6) lines.push(line);
    }
  }
  return lines.sort((a, b) => b.length - a.length).slice(0, 4).sort((a, b) => a[0].y - b[0].y);
}

function columnRidge(tone: Float32Array, size: number, threshold: number, yStart: number, yEnd: number) {
  const ridge: Array<Point | null> = [];
  for (let x = 0; x < size; x += 1) {
    let best = threshold;
    let yBest = -1;
    for (let y = yStart; y < yEnd; y += 1) {
      const value = tone[y * size + x];
      if (value < best) continue;
      best = value;
      yBest = y;
    }
    ridge.push(yBest < 0 ? null : { x: x / size, y: yBest / size });
  }
  return ridge;
}

function ribbonFromRidge(tone: Float32Array, size: number, ridge: Array<Point | null>, threshold: number): Point[] {
  const runs: Point[][][] = [];
  let upper: Point[] = [];
  let lower: Point[] = [];
  let gap = 0;
  const flush = () => {
    if (upper.length > 8) runs.push([upper, lower]);
    upper = [];
    lower = [];
  };
  ridge.forEach((point) => {
    if (!point) {
      gap += 1;
      if (gap > 8) flush();
      return;
    }
    gap = 0;
    const x = Math.round(point.x * (size - 1));
    const y0 = Math.round(point.y * (size - 1));
    let top = y0;
    let bottom = y0;
    const reach = Math.round(size * 0.07);
    while (top > Math.max(1, y0 - reach) && tone[(top - 1) * size + x] > threshold) top -= 1;
    while (bottom < Math.min(size - 2, y0 + reach) && tone[(bottom + 1) * size + x] > threshold) bottom += 1;
    upper.push({ x: point.x, y: top / size });
    lower.push({ x: point.x, y: bottom / size });
  });
  flush();
  runs.sort((a, b) => b[0].length - a[0].length);
  const best = runs[0];
  if (!best) return [];
  const ceiling = smoothOpen(best[0].filter((_, index) => index % 2 === 0));
  const bed = smoothOpen(best[1].filter((_, index) => index % 2 === 0));
  if (ceiling.length < 8 || bed.length < 8) return [];
  return [...ceiling, ...bed.slice().reverse()];
}

function traceDeepBands(tone: Float32Array, size: number) {
  const bright = columnRidge(tone, size, 120, Math.round(size * 0.42), Math.round(size * 0.86));
  const soft = columnRidge(tone, size, 38, Math.round(size * 0.12), Math.round(size * 0.5));
  const lower = ribbonFromRidge(tone, size, bright, 90);
  const upper = ribbonFromRidge(tone, size, soft, 36);
  let diffuse: Point[] = [];
  if (upper.length > 8 && lower.length > 8) {
    const upperBed = upper.slice(Math.floor(upper.length / 2)).reverse();
    const lowerCeiling = lower.slice(0, Math.floor(lower.length / 2));
    const count = Math.min(upperBed.length, lowerCeiling.length);
    if (count > 6) diffuse = [...upperBed.slice(0, count), ...lowerCeiling.slice(0, count).reverse()];
  }
  const upperFirst = (upper[0]?.y ?? 1) <= (lower[0]?.y ?? 0);
  return {
    upper: upperFirst ? upper : lower,
    lower: upperFirst ? lower : upper,
    diffuse,
  };
}

function traceUpperVoid(occupied: Uint8Array, firm: Uint8Array, size: number) {
  let seed: { x: number; y: number; room: number } | null = null;
  for (let y = Math.round(size * 0.08); y < size * 0.58; y += 2) {
    for (let x = Math.round(size * 0.42); x < size * 0.9; x += 2) {
      if (occupied[y * size + x]) continue;
      let room = 0;
      for (let radius = 1; radius <= 14; radius += 1) {
        const nx = x + radius;
        if (nx >= size || occupied[y * size + nx] || occupied[Math.max(0, y - radius) * size + x]) break;
        room = radius;
      }
      if (room < 4) continue;
      if (!seed || room > seed.room) seed = { x, y, room };
    }
  }
  if (!seed) return { outline: [] as Point[], seed: null, mass: null };
  const limit = seed.room + Math.round(size * 0.16);
  const seen = new Uint8Array(size * size);
  const queue = [seed.y * size + seed.x];
  seen[seed.y * size + seed.x] = 1;
  const cells: number[] = [];
  while (queue.length) {
    const index = queue.pop() ?? 0;
    cells.push(index);
    const px = index % size;
    const py = (index / size) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const nx = px + dx;
      const ny = py + dy;
      if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
      if (Math.hypot(nx - seed.x, ny - seed.y) > limit) continue;
      const next = ny * size + nx;
      if (seen[next] || occupied[next]) continue;
      seen[next] = 1;
      queue.push(next);
    }
  }
  const boundary: Point[] = [];
  let massX = 0;
  let massY = 0;
  let massCount = 0;
  for (const index of cells) {
    const px = index % size;
    const py = (index / size) | 0;
    let rim = false;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const nx = px + dx;
      const ny = py + dy;
      if (nx < 0 || ny < 0 || nx >= size || ny >= size || occupied[ny * size + nx]) rim = true;
      if (nx >= 0 && ny >= 0 && nx < size && ny < size && firm[ny * size + nx]) {
        massX += nx;
        massY += ny;
        massCount += 1;
      }
    }
    if (rim) boundary.push({ x: px / size, y: py / size });
  }
  const origin = { x: seed.x / size, y: seed.y / size };
  const raw = radialOutline(boundary, origin, 36);
  return {
    outline: raw.length ? smoothClosed(raw) : [],
    seed: origin,
    mass: massCount ? { x: massX / massCount / size, y: massY / massCount / size } : { x: origin.x - 0.2, y: origin.y + 0.25 },
  };
}

function splitMass(mask: Uint8Array, size: number, mass: Blob): Blob[] {
  const height = mass.y1 - mass.y0;
  const width = mass.x1 - mass.x0;
  if (height < width * 1.25) return [mass];
  const yStart = Math.round((mass.y0 + height * 0.28) * size);
  const yEnd = Math.round((mass.y1 - height * 0.22) * size);
  const xStart = Math.max(0, Math.round(mass.x0 * size));
  const xEnd = Math.min(size - 1, Math.round(mass.x1 * size));
  let narrow = yStart;
  let narrowCount = size;
  for (let y = yStart; y <= yEnd; y += 1) {
    let count = 0;
    for (let x = xStart; x <= xEnd; x += 1) if (mask[y * size + x]) count += 1;
    if (count < narrowCount) {
      narrowCount = count;
      narrow = y;
    }
  }
  if (narrowCount > Math.max(1, xEnd - xStart) * 0.55) return [mass];
  const y = narrow / size;
  return [
    { ...mass, y1: y, y: (mass.y0 + y) / 2 },
    { ...mass, y0: y, y: (y + mass.y1) / 2 },
  ];
}

function traceCross(mask: Uint8Array, size: number) {
  const masses = components(mask, size, 24).slice(0, 4).flatMap((mass) => splitMass(mask, size, mass));
  if (masses.length < 3) return [] as Point[][];
  const midX = masses.reduce((sum, mass) => sum + mass.x, 0) / masses.length;
  const left = masses.filter((mass) => mass.x <= midX).sort((a, b) => a.y - b.y);
  const right = masses.filter((mass) => mass.x > midX).sort((a, b) => a.y - b.y);
  const bars: Point[][] = [];
  if (left.length && right.length) {
    const x0 = Math.max(...left.map((mass) => mass.x1));
    const x1 = Math.min(...right.map((mass) => mass.x0));
    const y0 = Math.max(Math.min(...left.map((mass) => mass.y0)), Math.min(...right.map((mass) => mass.y0)));
    const y1 = Math.min(Math.max(...left.map((mass) => mass.y1)), Math.max(...right.map((mass) => mass.y1)));
    const vertical = ribbonBetween(x0, x1, y0, y1, true);
    if (vertical.length) bars.push(vertical);
  }
  for (const side of [left, right]) {
    if (side.length < 2) continue;
    const upper = side[0];
    const lower = side[side.length - 1];
    const horizontal = ribbonBetween(Math.max(upper.x0, lower.x0), Math.min(upper.x1, lower.x1), upper.y1, lower.y0, false);
    if (horizontal.length) bars.push(horizontal);
  }
  return bars;
}

function ribbonBetween(x0: number, x1: number, y0: number, y1: number, vertical: boolean): Point[] {
  if (!vertical && y1 - y0 < 0.02 && x1 - x0 > 0.05) {
    const middle = (y0 + y1) / 2;
    y0 = middle - 0.016;
    y1 = middle + 0.016;
  }
  if (vertical) {
    if (x1 - x0 < 0.015 || y1 - y0 < 0.04) return [];
    const inset = Math.min(0.012, (x1 - x0) * 0.2);
    return [
      { x: x0 + inset, y: y0 },
      { x: x1 - inset, y: y0 },
      { x: x1 - inset, y: y1 },
      { x: x0 + inset, y: y1 },
    ];
  }
  if (y1 - y0 < 0.015 || x1 - x0 < 0.04) return [];
  const inset = Math.min(0.012, (y1 - y0) * 0.2);
  return [
    { x: x0, y: y0 + inset },
    { x: x1, y: y0 + inset },
    { x: x1, y: y1 - inset },
    { x: x0, y: y1 - inset },
  ];
}

function traceRoomPair(occupied: Uint8Array, firm: Uint8Array, size: number) {
  const voids = enclosedOutlines(occupied, size, 1);
  const inner = voids[0] ?? [];
  if (inner.length < 8) return { outer: [] as Point[], inner: [] as Point[] };
  const origin = centroid(inner);
  const sectors = 48;
  const points: Point[] = [];
  const cx = origin.x * (size - 1);
  const cy = origin.y * (size - 1);
  for (let sector = 0; sector < sectors; sector += 1) {
    const angle = (sector / sectors) * Math.PI * 2;
    let hit: Point | null = null;
    for (let radius = 2; radius < size * 0.46; radius += 1) {
      const x = Math.round(cx + Math.cos(angle) * radius);
      const y = Math.round(cy + Math.sin(angle) * radius);
      if (x < 2 || y < 2 || x >= size - 2 || y >= size - 2) break;
      let neighbors = 0;
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) if (firm[(y + dy) * size + (x + dx)]) neighbors += 1;
      }
      if (neighbors >= 3) hit = { x: x / size, y: y / size };
    }
    if (hit) points.push(hit);
  }
  return { outer: points.length > 12 ? smoothClosed(smoothClosed(points)) : [], inner };
}

function enclosedOutlines(occupied: Uint8Array, size: number, count: number): Point[][] {
  const seen = new Uint8Array(size * size);
  const found: Array<{ outline: Point[]; n: number }> = [];
  for (let y = 1; y < size - 1; y += 1) {
    for (let x = 1; x < size - 1; x += 1) {
      const start = y * size + x;
      if (occupied[start] || seen[start]) continue;
      const queue = [start];
      seen[start] = 1;
      const cells: number[] = [];
      let border = 0;
      let tissue = 0;
      let perimeter = 0;
      while (queue.length) {
        const index = queue.pop() ?? 0;
        cells.push(index);
        const px = index % size;
        const py = (index / size) | 0;
        if (px === 0 || py === 0 || px === size - 1 || py === size - 1) border += 1;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
          const nx = px + dx;
          const ny = py + dy;
          if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
          const next = ny * size + nx;
          if (occupied[next]) {
            tissue += 1;
            perimeter += 1;
            continue;
          }
          if (seen[next]) continue;
          seen[next] = 1;
          queue.push(next);
        }
      }
      if (cells.length < 24 || cells.length > size * size * 0.28) continue;
      if (border > cells.length * 0.08) continue;
      if (tissue < perimeter * 0.45 && tissue < 12) continue;
      const sx = cells.reduce((sum, index) => sum + (index % size), 0) / cells.length;
      const sy = cells.reduce((sum, index) => sum + ((index / size) | 0), 0) / cells.length;
      const boundary = cells.filter((index) => {
        const px = index % size;
        const py = (index / size) | 0;
        return [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => {
          const nx = px + dx;
          const ny = py + dy;
          return nx < 0 || ny < 0 || nx >= size || ny >= size || occupied[ny * size + nx];
        });
      }).map((index) => ({ x: (index % size) / size, y: ((index / size) | 0) / size }));
      const raw = radialOutline(boundary, { x: sx / size, y: sy / size }, 32);
      if (raw.length > 6) found.push({ outline: smoothClosed(raw), n: cells.length });
    }
  }
  return found.sort((a, b) => b.n - a.n).slice(0, count).map((item) => item.outline);
}

function traceEdgeSpaces(occupied: Uint8Array, size: number) {
  const voids = enclosedOutlines(occupied, size, 2);
  const lines = voids.flatMap((outline) => {
    const origin = centroid(outline);
    const ordered = outline.slice().sort((a, b) => a.y - b.y);
    const left = smoothOpen(ordered.filter((point) => point.x <= origin.x).filter((_, index) => index % 2 === 0));
    const right = smoothOpen(ordered.filter((point) => point.x > origin.x).filter((_, index) => index % 2 === 0));
    return [left, right].filter((points) => points.length > 5);
  });
  return { voids, lines };
}

function readSpecial(img: HTMLImageElement): Special {
  const field = fieldOf(img, 96);
  if (!field) return EMPTY_SPECIAL;
  const strand = new Uint8Array(field.size * field.size);
  for (let index = 0; index < strand.length; index += 1) if (field.tone[index] > 70) strand[index] = 1;
  const gap = traceCompression(field.firm, field.size);
  const deep = traceDeepBands(field.tone, field.size);
  const upper = traceUpperVoid(field.occupied, field.firm, field.size);
  const mass = new Uint8Array(field.size * field.size);
  for (let index = 0; index < mass.length; index += 1) if (field.tone[index] > 160) mass[index] = 1;
  const crossBars = traceCross(mass, field.size);
  const room = traceRoomPair(field.occupied, field.firm, field.size);
  const edges = traceEdgeSpaces(field.occupied, field.size);
  return {
    gapEdges: gap.edges,
    gapTicks: gap.ticks,
    galleries: traceGalleries(strand, field.size),
    terraces: traceTerraces(field.firm, field.size),
    plateUpper: deep.upper,
    plateLower: deep.lower,
    plateDiffuse: deep.diffuse,
    upperVoid: upper.outline,
    voidSeed: upper.seed,
    voidMass: upper.mass,
    crossH: crossBars.find((bar) => bar.length > 3 && Math.abs(bar[0].y - bar[2].y) < Math.abs(bar[0].x - bar[2].x)) ?? [],
    crossV: crossBars.find((bar) => bar.length > 3 && Math.abs(bar[0].x - bar[2].x) <= Math.abs(bar[0].y - bar[2].y)) ?? [],
    crossBars,
    outerRoom: room.outer,
    innerRoom: room.inner,
    edgeVoids: edges.voids,
    edgeLines: edges.lines,
  };
}

function Diagram({ mode, figure, detail }: { mode: Mode; figure: Figure; detail: boolean }) {
  const opening = figure.openings[0];
  const steps = figure.bands.length >= 2 ? figure.bands : figure.shelves.length >= 2 ? figure.shelves : [];

  if (mode === "void-core" && opening) {
    const points = smoothClosed(opening.outline.length ? opening.outline : ellipse(opening));
    const origin = { x: opening.x, y: opening.y };
    const top = Math.min(...points.map((point) => point.y));
    return (
      <>
        {detail ? <path className={styles.dotted} d={draw(pullIn(points, origin, 1.55))} /> : null}
        <path className={styles.fill} d={draw(points)} />
        <path className={styles.primary} d={draw(points)} />
        {detail ? <path className={styles.guide} d={draw(pullIn(points, origin, 0.38))} /> : null}
        {detail ? <line className={styles.guide} x1={origin.x * 100} y1={(top + 0.01) * 100} x2={origin.x * 100} y2={(top - 0.028) * 100} /> : null}
        {detail ? <Head x={origin.x} y={top - 0.028} dx={0} dy={-1} /> : null}
      </>
    );
  }
  if (mode === "openings") {
    const marks = figure.openings.filter((item) => item.n > (opening?.n ?? 0) * 0.18).slice(0, 3);
    if (!marks.length) return null;
    return (
      <>
        {marks.map((item) => <path key={`${item.x}-${item.y}`} className={styles.bay} d={draw(smoothClosed(item.outline.length ? item.outline : ellipse(item)))} />)}
        {detail ? marks.map((item) => <circle key={`dot-${item.x}`} className={styles.node} cx={item.x * 100} cy={item.y * 100} r={1.7} />) : null}
      </>
    );
  }
  if (mode === "edge-void" && figure.special.upperVoid.length > 6 && figure.special.voidSeed && figure.special.voidMass) {
    const seed = figure.special.voidSeed;
    const mass = figure.special.voidMass;
    return (
      <>
        <defs>
          <linearGradient id="void-edge-wash" gradientUnits="userSpaceOnUse" x1={seed.x * 100} y1={seed.y * 100} x2={mass.x * 100} y2={mass.y * 100}>
            <stop offset="0%" stopColor="rgb(73, 215, 222)" stopOpacity="0.2" />
            <stop offset="100%" stopColor="rgb(73, 215, 222)" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={draw(figure.special.upperVoid)} fill="url(#void-edge-wash)" stroke="none" />
        <path className={styles.primary} d={draw(figure.special.upperVoid)} />
      </>
    );
  }
  if (mode === "inner-room" && (figure.special.innerRoom.length > 6 || opening)) {
    const points = figure.special.innerRoom.length > 6 ? figure.special.innerRoom : opening?.outline.length ? opening.outline : opening ? ellipse(opening) : [];
    const rim = figure.special.outerRoom;
    if (points.length < 6) return null;
    return (
      <>
        {rim.length > 6 ? <path className={styles.guide} d={draw(rim)} /> : null}
        <path className={styles.fill} d={draw(points)} />
        <path className={styles.primary} d={draw(points)} />
      </>
    );
  }
  if (mode === "bowl" && figure.body.length) {
    const body = smoothClosed(figure.body);
    const origin = centroid(body);
    return (
      <>
        {detail ? <path className={styles.fill} d={draw(body)} /> : null}
        <path className={styles.primary} d={draw(body)} />
        {detail ? <path className={styles.guide} d={draw(pullIn(body, origin, 0.38))} /> : null}
        {detail ? tissueChords(figure.mask, figure.maskSize, body).map((span) => (
          <line key={span.y} className={styles.guide} x1={span.x1 * 100} y1={span.y * 100} x2={span.x2 * 100} y2={span.y * 100} />
        )) : null}
      </>
    );
  }
  if (mode === "field" && figure.cores.length) {
    const pockets = figure.cores.filter((core) => core.n > 8).slice(0, 4);
    if (!pockets.length) return null;
    const seen = new Set<string>();
    const bonds: Line[] = [];
    for (const core of pockets) {
      const nearest = pockets.filter((item) => item !== core).sort((a, b) => Math.hypot(a.x - core.x, a.y - core.y) - Math.hypot(b.x - core.x, b.y - core.y))[0];
      if (!nearest) continue;
      const key = [core.x, nearest.x, core.y, nearest.y].sort().join(":");
      if (seen.has(key)) continue;
      seen.add(key);
      bonds.push({ x1: core.x, y1: core.y, x2: nearest.x, y2: nearest.y });
    }
    return (
      <>
        {detail ? bonds.map((line) => <line key={`${line.x1}-${line.y1}`} className={styles.guide} x1={line.x1 * 100} y1={line.y1 * 100} x2={line.x2 * 100} y2={line.y2 * 100} />) : null}
        {pockets.map((core) => core.outline.length > 4
          ? <path key={`fill-${core.x}`} className={styles.fill} d={draw(smoothClosed(core.outline))} />
          : <circle key={`fill-${core.x}`} className={styles.fill} cx={core.x * 100} cy={core.y * 100} r={Math.max(4.2, Math.min(6.4, core.r * 22))} />)}
        {pockets.map((core) => core.outline.length > 4
          ? <path key={`island-${core.x}`} className={styles.primary} d={draw(smoothClosed(core.outline))} />
          : <circle key={`island-${core.x}`} className={styles.primary} cx={core.x * 100} cy={core.y * 100} r={Math.max(4.2, Math.min(6.4, core.r * 22))} />)}
        {detail ? pockets.map((core) => core.outline.length > 4
          ? <path key={`inner-${core.x}`} className={styles.guide} d={draw(pullIn(smoothClosed(core.outline), core, 0.55))} />
          : <circle key={`inner-${core.x}`} className={styles.guide} cx={core.x * 100} cy={core.y * 100} r={Math.max(2.4, Math.min(3.8, core.r * 12))} />) : null}
        {detail ? pockets.map((core) => <circle key={`node-${core.x}`} className={styles.node} cx={core.x * 100} cy={core.y * 100} r={1.7} />) : null}
      </>
    );
  }
  if (mode === "open-field") {
    const points = figure.openTrace.length > 6 ? figure.openTrace : opening?.outline ?? [];
    if (points.length > 6) {
      const closed = smoothClosed(points);
      return (
        <>
          <path className={styles.fill} d={draw(points)} />
          <path className={styles.primary} d={draw(closed)} />
          {detail ? <path className={styles.guide} d={draw(pullIn(closed, centroid(points), 0.62))} /> : null}
        </>
      );
    }
  }
  if (mode === "steps" && (figure.special.terraces.length || steps.length)) {
    if (figure.special.terraces.length) {
      return (
        <>
          {figure.special.terraces.map((line) => (
            <g key={`${line[0].x}-${line[0].y}`}>
              <path className={styles.ink} d={draw(line, false)} />
              <path className={styles.primary} d={draw(line, false)} />
            </g>
          ))}
        </>
      );
    }
    return (
      <>
        {steps.map((span) => (
          <g key={span.y}>
            <line className={styles.ink} x1={span.x1 * 100} y1={span.y * 100} x2={span.x2 * 100} y2={span.y * 100} />
            <line className={styles.primary} x1={span.x1 * 100} y1={span.y * 100} x2={span.x2 * 100} y2={span.y * 100} />
          </g>
        ))}
      </>
    );
  }
  if (mode === "plate" && (figure.special.plateLower.length > 6 || figure.plateTrace.length > 6)) {
    const upper = figure.special.plateUpper;
    const lower = figure.special.plateLower;
    if (upper.length > 6 || lower.length > 6) {
      return (
        <>
          {detail && figure.special.plateDiffuse.length > 6 ? <path className={styles.haze} d={draw(figure.special.plateDiffuse)} /> : null}
          {upper.length > 6 ? <path className={styles.ribbon} d={draw(upper)} /> : null}
          {lower.length > 6 ? <path className={styles.ribbon} d={draw(lower)} /> : null}
          {upper.length > 6 ? <path className={styles.primary} d={draw(upper)} /> : null}
          {lower.length > 6 ? <path className={styles.primary} d={draw(lower)} /> : null}
        </>
      );
    }
  }
  if (mode === "separator") {
    const bars = figure.special.crossBars;
    if (bars.length) {
      return (
        <>
          {bars.map((bar) => {
            const center = centroid(bar);
            const horizontal = Math.abs(bar[0].x - bar[2].x) >= Math.abs(bar[0].y - bar[2].y);
            return (
              <g key={`${bar[0].x}-${bar[0].y}`}>
                <path className={styles.ribbon} d={draw(bar)} />
                {detail && horizontal ? <Head x={bar[0].x} y={center.y} dx={bar[0].x - bar[2].x} dy={0} /> : null}
                {detail && horizontal ? <Head x={bar[2].x} y={center.y} dx={bar[2].x - bar[0].x} dy={0} /> : null}
                {detail && !horizontal ? <Head x={center.x} y={bar[0].y} dx={0} dy={bar[0].y - bar[2].y} /> : null}
                {detail && !horizontal ? <Head x={center.x} y={bar[2].y} dx={0} dy={bar[2].y - bar[0].y} /> : null}
              </g>
            );
          })}
        </>
      );
    }
    const gap = separatingGap(figure.cores);
    if (!gap) return null;
    return <path className={styles.ribbon} d={`M ${gap.x1 * 100} ${(gap.y - gap.gap * 0.22) * 100} L ${gap.x2 * 100} ${(gap.y - gap.gap * 0.22) * 100} L ${gap.x2 * 100} ${(gap.y + gap.gap * 0.22) * 100} L ${gap.x1 * 100} ${(gap.y + gap.gap * 0.22) * 100} Z`} />;
  }
  if (mode === "continuity" && figure.route.length > 6) {
    const route = figure.route;
    const end = route[route.length - 1];
    const before = route[Math.max(0, route.length - 2)];
    const marks = along(route, 4);
    return (
      <>
        {detail ? <path className={styles.glow} d={draw(route, false)} /> : null}
        <path className={styles.primary} d={draw(route, false)} />
        {detail ? marks.map((point) => <circle key={`${point.x}-${point.y}`} className={styles.node} cx={point.x * 100} cy={point.y * 100} r={1.8} />) : null}
        {detail ? <Head x={end.x} y={end.y} dx={end.x - before.x} dy={end.y - before.y} /> : null}
      </>
    );
  }
  if (mode === "sequence" && figure.special.gapEdges.length === 2) {
    const [topEdge, bottomEdge] = figure.special.gapEdges;
    return (
      <>
        <path className={styles.primary} d={draw(topEdge, false)} />
        <path className={styles.primary} d={draw(bottomEdge, false)} />
        {detail ? figure.special.gapTicks.map((tick) => (
          <line key={tick.x} className={styles.guide} x1={tick.x * 100} y1={tick.y0 * 100} x2={tick.x * 100} y2={tick.y1 * 100} />
        )) : null}
      </>
    );
  }
  if (mode === "spine" && figure.special.galleries.length) {
    return (
      <>
        {figure.special.galleries.map((line) => {
          const band = detail ? [...offsetOpen(line, -0.012), ...offsetOpen(line, 0.012).reverse()] : [];
          return (
            <g key={`${line[0].x}-${line[0].y}`}>
              {band.length > 4 ? <path className={styles.ribbon} d={draw(band)} /> : null}
              <path className={styles.ink} d={draw(line, false)} />
              <path className={styles.primary} d={draw(line, false)} />
            </g>
          );
        })}
      </>
    );
  }
  if ((mode === "spine" || mode === "sequence") && figure.axis) {
    const line = figure.axis;
    const { dx, dy, length, px, py } = normalOf(line);
    const envelope = mode === "spine" ? spineEdges(line, figure.mask, figure.maskSize) : { left: [] as Point[], right: [] as Point[] };
    const samples = mode === "sequence" ? [0.18, 0.5, 0.82] : [0.5];
    const reachMask = mode === "sequence" ? figure.firm : figure.mask;
    const cap = mode === "sequence" ? 0.08 : 1;
    const sides = samples.map((t) => {
      const point = { x: line.x1 + (line.x2 - line.x1) * t, y: line.y1 + (line.y2 - line.y1) * t };
      const cell = nearestOccupied(reachMask, figure.maskSize, point);
      const snapped = cell ? { x: cell.x / (figure.maskSize - 1), y: cell.y / (figure.maskSize - 1) } : null;
      if (!snapped || Math.hypot(snapped.x - point.x, snapped.y - point.y) > 0.05) {
        return { point, negative: 0, positive: 0 };
      }
      return {
        point: snapped,
        negative: Math.min(cap, measureReach(reachMask, figure.maskSize, snapped, px, py, -1)),
        positive: Math.min(cap, measureReach(reachMask, figure.maskSize, snapped, px, py, 1)),
      };
    }).filter((side) => side.negative + side.positive > 0.02);
    const mid = stations(line, 1)[0];
    const midSide = sides[0];
    return (
      <>
        {detail && envelope.left.length > 2 ? <path className={styles.guide} d={draw(envelope.left, false)} /> : null}
        {detail && envelope.right.length > 2 ? <path className={styles.guide} d={draw(envelope.right, false)} /> : null}
        {mode === "spine" ? <line className={styles.ink} x1={line.x1 * 100} y1={line.y1 * 100} x2={line.x2 * 100} y2={line.y2 * 100} /> : null}
        <Spine line={line} glow={false} />
        {detail && mode === "sequence" ? sides.map((side) => {
          const x1 = (side.point.x - px * side.negative) * 100;
          const y1 = (side.point.y - py * side.negative) * 100;
          const x2 = (side.point.x + px * side.positive) * 100;
          const y2 = (side.point.y + py * side.positive) * 100;
          const cap = 1.4;
          return (
            <g key={`${side.point.x}-${side.point.y}`}>
              <line className={styles.tick} x1={x1} y1={y1} x2={x2} y2={y2} />
              <line className={styles.tick} x1={x1 - (dx / length) * cap} y1={y1 - (dy / length) * cap} x2={x1 + (dx / length) * cap} y2={y1 + (dy / length) * cap} />
              <line className={styles.tick} x1={x2 - (dx / length) * cap} y1={y2 - (dy / length) * cap} x2={x2 + (dx / length) * cap} y2={y2 + (dy / length) * cap} />
            </g>
          );
        }) : null}
        {detail && mode === "spine" && midSide ? (
          <line className={styles.tick} x1={(mid.x - px * midSide.negative) * 100} y1={(mid.y - py * midSide.negative) * 100} x2={(mid.x + px * midSide.positive) * 100} y2={(mid.y + py * midSide.positive) * 100} />
        ) : null}
        {detail ? <Head x={line.x2} y={line.y2} dx={dx} dy={dy} /> : null}
      </>
    );
  }
  if (mode === "wave" && (figure.waveTrace.length > 6 || figure.cores.length > 1)) {
    const ordered = figure.waveTrace.length > 6 ? figure.waveTrace : [];
    if (ordered.length < 2) return null;
    const rings = turnsOf(ordered);
    const end = ordered[0];
    const next = ordered[Math.min(1, ordered.length - 1)];
    return (
      <>
        <path className={styles.inkDash} d={draw(ordered, false)} />
        <path className={styles.dashed} d={draw(ordered, false)} />
        {detail ? (rings.length ? rings : along(ordered, 3)).map((point) => <circle key={`${point.x}-${point.y}`} className={styles.guide} cx={point.x * 100} cy={point.y * 100} r={2.6} />) : null}
        {detail ? <Head x={end.x} y={end.y} dx={end.x - next.x} dy={end.y - next.y} /> : null}
      </>
    );
  }
  if (mode === "edge-spine" && (figure.special.edgeVoids.length || figure.edgeTrace.length > 6)) {
    if (figure.special.edgeVoids.length) {
      return (
        <>
          {figure.special.edgeVoids.map((outline) => (
            <g key={`${outline[0].x}-${outline[0].y}`}>
              <path className={styles.fill} d={draw(outline)} />
              <path className={styles.primary} d={draw(outline)} />
            </g>
          ))}
          {figure.special.edgeLines.map((line) => (
            <path key={`${line[0].x}-${line[0].y}`} className={styles.guide} d={draw(line, false)} />
          ))}
        </>
      );
    }
  }
  return null;
}

function ellipse(opening: Opening): Point[] {
  return Array.from({ length: 16 }, (_, index) => {
    const angle = (index / 16) * Math.PI * 2;
    return { x: opening.x + Math.cos(angle) * opening.rx, y: opening.y + Math.sin(angle) * opening.ry };
  });
}

const CLEAN_MODES = new Set<Mode>(["sequence", "spine", "steps", "plate", "edge-void", "separator", "inner-room", "edge-spine"]);

function soften(points: Array<[number, number]>, closed = false) {
  let current = points.map((point) => [point[0], point[1]] as [number, number]);
  for (let pass = 0; pass < 2; pass += 1) {
    const next: Array<[number, number]> = [];
    const count = current.length;
    const limit = closed ? count : count - 1;
    if (!closed) next.push(current[0]);
    for (let index = 0; index < limit; index += 1) {
      const start = current[index];
      const end = current[(index + 1) % count];
      next.push([start[0] * 0.75 + end[0] * 0.25, start[1] * 0.75 + end[1] * 0.25]);
      next.push([start[0] * 0.25 + end[0] * 0.75, start[1] * 0.25 + end[1] * 0.75]);
    }
    if (!closed) next.push(current[count - 1]);
    current = next;
  }
  return current;
}

function curve(points: Array<[number, number]>, closed = false) {
  const drawn = soften(points, closed);
  return `M ${drawn.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join(" L ")}${closed ? " Z" : ""}`;
}

function Mark({ d, kind = "primary" }: { d: string; kind?: "primary" | "dashed" | "dotted" | "guide" }) {
  return (
    <>
      {kind === "primary" ? <path className={styles.glow} d={d} /> : null}
      <path className={styles[kind]} d={d} />
    </>
  );
}

function Tip({ x, y, dx, dy }: { x: number; y: number; dx: number; dy: number }) {
  const length = Math.hypot(dx, dy) || 1;
  const ux = (dx / length) * 4.2;
  const uy = (dy / length) * 4.2;
  const px = (-dy / length) * 1.7;
  const py = (dx / length) * 1.7;
  return <polyline className={styles.arrow} points={`${(x - ux + px).toFixed(1)},${(y - uy + py).toFixed(1)} ${x.toFixed(1)},${y.toFixed(1)} ${(x - ux - px).toFixed(1)},${(y - uy - py).toFixed(1)}`} />;
}

function Directed({ x1, y1, x2, y2, kind = "primary" }: { x1: number; y1: number; x2: number; y2: number; kind?: "primary" | "dashed" }) {
  return (
    <>
      <Mark d={`M ${x1} ${y1} L ${x2} ${y2}`} kind={kind} />
      <Tip x={x2} y={y2} dx={x2 - x1} dy={y2 - y1} />
    </>
  );
}

function WidthMark({ x, y, width }: { x: number; y: number; width: number }) {
  return (
    <>
      <Mark d={`M ${x - width} ${y} L ${x + width} ${y}`} kind="guide" />
      <Tip x={x - width} y={y} dx={-1} dy={0} />
      <Tip x={x + width} y={y} dx={1} dy={0} />
    </>
  );
}

function CleanDiagram({ mode }: { mode: Mode }) {
  if (mode === "sequence") {
    const samples: Array<[number, number]> = [[18, 68], [26, 66], [34, 62], [42, 60], [50, 63], [58, 67], [66, 68]];
    const nodes: Array<[number, number]> = [[26, 66], [42, 60], [58, 67]];
    return (
      <>
        <Mark d={curve(samples)} />
        {nodes.map(([x, y]) => <circle key={x} className={styles.node} cx={x} cy={y} r={2.1} />)}
        {nodes.map(([x, y]) => <WidthMark key={`w-${x}`} x={x} y={y + 6} width={6} />)}
      </>
    );
  }
  if (mode === "spine") {
    const ribbons: Array<[number, number, number, number]> = [[19, 42, 60, 92], [33, 39, 74, 92], [64, 47, 94, 85]];
    return (
      <>
        {ribbons.map(([x1, y1, x2, y2]) => {
          const dx = x2 - x1;
          const dy = y2 - y1;
          const length = Math.hypot(dx, dy) || 1;
          const ox = (-dy / length) * 4.2;
          const oy = (dx / length) * 4.2;
          return (
            <g key={`${x1}-${y1}`}>
              <Directed x1={x1} y1={y1} x2={x2} y2={y2} />
              <Mark d={`M ${x1 + ox} ${y1 + oy} L ${x2 + ox} ${y2 + oy}`} kind="dashed" />
            </g>
          );
        })}
      </>
    );
  }
  if (mode === "steps") {
    const shelves: Array<Array<[number, number]>> = [
      [[46, 14], [62, 10], [78, 16]],
      [[16, 30], [30, 26], [44, 34]],
      [[20, 48], [38, 46], [56, 54]],
      [[34, 68], [56, 72], [80, 82]],
    ];
    const nodes = shelves.map((shelf) => shelf[shelf.length - 1]);
    return (
      <>
        {shelves.map((shelf) => <Mark key={shelf[0].join("-")} d={curve(shelf)} />)}
        <Mark d={curve(nodes)} kind="dashed" />
        {nodes.map(([x, y]) => <circle key={`${x}-${y}`} className={styles.node} cx={x} cy={y} r={1.8} />)}
      </>
    );
  }
  if (mode === "plate") {
    const band = (offset: number, phase: number) => Array.from({ length: 42 }, (_, index) => {
      const t = index / 41;
      return [3 + t * 94, offset + Math.sin(t * Math.PI * 2.2 + phase) * 5] as [number, number];
    });
    return (
      <>
        <Mark d={curve(band(34, 0.2))} />
        <Mark d={curve(band(62, 1.1))} kind="dotted" />
      </>
    );
  }
  if (mode === "edge-void") {
    return (
      <>
        <ellipse className={styles.fill} cx={76} cy={22} rx={14} ry={16} />
        <ellipse className={styles.primary} cx={76} cy={22} rx={14} ry={16} />
      </>
    );
  }
  if (mode === "separator") {
    const x1 = 14;
    const y1 = 34;
    const x2 = 50;
    const y2 = 52;
    return (
      <>
        <Mark d="M 44 10 L 44 90" />
        <Mark d={`M ${x1} ${y1} L ${x2} ${y2}`} />
        <Tip x={44} y={10} dx={0} dy={-1} />
        <Tip x={44} y={90} dx={0} dy={1} />
        <Tip x={x1} y={y1} dx={x1 - x2} dy={y1 - y2} />
        <Tip x={x2} y={y2} dx={x2 - x1} dy={y2 - y1} />
      </>
    );
  }
  if (mode === "inner-room") {
    const outer: Array<[number, number]> = [[18, 30], [28, 16], [48, 18], [62, 32], [84, 48], [78, 72], [52, 88], [24, 80], [12, 58], [14, 40]];
    const inner: Array<[number, number]> = [[26, 40], [34, 30], [48, 34], [52, 48], [44, 62], [30, 60], [24, 48]];
    return (
      <>
        <Mark d={curve(outer, true)} kind="dotted" />
        <path className={styles.fill} d={curve(inner, true)} />
        <Mark d={curve(inner, true)} />
      </>
    );
  }
  if (mode === "edge-spine") {
    const gallery = [[12, 18], [18, 36], [22, 58], [30, 74], [48, 86], [70, 90]];
    const offset = [[20, 14], [26, 34], [30, 54], [40, 70], [58, 80], [78, 82]];
    return (
      <>
        <ellipse className={styles.fill} cx={48} cy={20} rx={16} ry={15} />
        <ellipse className={styles.primary} cx={48} cy={20} rx={16} ry={15} />
        <ellipse className={styles.fill} cx={74} cy={74} rx={12} ry={11} />
        <ellipse className={styles.primary} cx={74} cy={74} rx={12} ry={11} />
        <Mark d={curve(gallery)} />
        <Mark d={curve(offset)} kind="dashed" />
        <Tip x={12} y={18} dx={-0.3} dy={-1} />
        <Tip x={70} y={90} dx={1} dy={0.35} />
      </>
    );
  }
  return null;
}

function ReadingPlate({ src, mode, detail = false }: { src: string; mode: Mode; detail?: boolean }) {
  const imageRef = useRef<HTMLImageElement>(null);
  const [figure, setFigure] = useState<Figure | null>(null);
  useEffect(() => {
    const image = imageRef.current;
    if (!image) return;
    const read = () => {
      if (!image.complete || !image.naturalWidth) return;
      const next = readFigure(image);
      if (next) setFigure(next);
    };
    read();
    image.addEventListener("load", read);
    return () => image.removeEventListener("load", read);
  }, [src]);
  return (
    <span className={styles.plate}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        ref={imageRef}
        src={src}
        alt=""
        decoding="async"
      />
      {CLEAN_MODES.has(mode) || figure ? (
        <svg viewBox="0 0 100 100" data-detail={detail ? "full" : "brief"} data-mode={mode} aria-hidden="true">
          {CLEAN_MODES.has(mode)
            ? <CleanDiagram mode={mode} />
            : figure ? <Diagram mode={mode} figure={figure} detail={detail} /> : null}
        </svg>
      ) : null}
    </span>
  );
}

/** The propagated candidates again, each plate read for the spatial condition its archetype asks for. */
export function ArchetypeReading() {
  const groups = useMemo(() => TYPOLOGIES.map((typology) => ({
    label: typology.label,
    plates: typology.archetypes.map((archetype) => {
      const pick = propagatedCandidate(archetype.id);
      const reading = READINGS[archetype.id];
      return {
        id: archetype.id,
        typology: typology.label,
        name: archetype.name,
        caption: reading?.caption ?? archetype.descriptors.spatial,
        note: reading?.note ?? archetype.descriptors.spatial,
        marks: reading?.marks ?? [],
        mode: reading?.mode ?? "spine" as Mode,
        candidateId: pick?.candidateId ?? null,
        continuationId: pick?.continuationId ?? null,
        image: propagatedPreview(archetype.id),
      };
    }),
  })), []);
  const plates = groups.flatMap((group) => group.plates);
  const [groupIndex, setGroupIndex] = useState<number | null>(null);
  const selected = groupIndex == null ? null : groups[groupIndex] ?? null;
  const ready = plates.every((plate) => plate.candidateId != null);

  return (
    <section className={styles.frame} aria-label="Archetype reading">
      <header>
        <div>
          <h3>{selected ? selected.label : "Archetype reading"}</h3>
          <p>
            {selected
              ? "Five candidates, read together"
              : ready ? "Each propagated candidate, and the spatial condition it holds" : "The propagated candidates are not stored."}
          </p>
        </div>
        {selected ? (
          <div className={styles.pager}>
            <button type="button" className={styles.back} onClick={() => setGroupIndex(((groupIndex ?? 0) + groups.length - 1) % groups.length)}>Previous</button>
            <button type="button" className={styles.back} onClick={() => setGroupIndex(((groupIndex ?? 0) + 1) % groups.length)}>Next</button>
            <button type="button" className={styles.back} onClick={() => setGroupIndex(null)}>Back to catalog</button>
          </div>
        ) : null}
      </header>
      {selected ? (
        <div className={styles.row}>
          {selected.plates.map((plate) => (
            <figure key={plate.id}>
              {plate.image ? <ReadingPlate src={plate.image} mode={plate.mode} detail /> : <span className={styles.missing}>Not stored</span>}
              <figcaption>
                <b>{plate.name}</b>
                <em>{plate.candidateId ?? "Not stored"}{plate.continuationId ? ` · ${plate.continuationId}` : ""}</em>
              </figcaption>
            </figure>
          ))}
        </div>
      ) : groups.map((group, index) => (
        <div key={group.label} className={styles.group}>
          <h4>{group.label}</h4>
          <div className={styles.plates}>
            {group.plates.map((plate) => (
              <figure key={plate.id}>
                <button type="button" className={styles.open} onClick={() => setGroupIndex(index)}>
                  {plate.image ? <ReadingPlate src={plate.image} mode={plate.mode} /> : <span className={styles.missing}>Not stored</span>}
                  <figcaption>
                    <b>{plate.name}</b>
                  </figcaption>
                </button>
              </figure>
            ))}
          </div>
        </div>
      ))}
    </section>
  );
}
