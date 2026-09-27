import type { SectionModel, SectionPrimitive } from "./section-translate";

export type ValidityCheck = {
  id: string;
  label: string;
  passed: boolean;
  observed: number;
  required: string;
  evidence: string;
};

export type ArchetypeValidityResult = {
  archetypeId: string;
  valid: boolean;
  checks: ValidityCheck[];
};

/**
 * Provisional geometric thresholds for archetype section validity only.
 * Independent of frozen evaluator peaks / floors / weights.
 */
export const ARCHETYPE_VALIDITY_THRESHOLDS = {
  /** Dominant component / total, in [0, 1]. */
  dominantShare: 0.4,
  /** Second must be below this share of the largest (no single-void domination inverted). */
  voidNonDominance: 0.85,
  /** Void vertical/horizontal bbox ratio for a vertical void. */
  verticalAspect: 1.25,
  /** Minimum fraction of void bbox height that is actually void on the median column. */
  verticalContinuity: 0.55,
  /** Minimum distinct N4 sides of a void bbox that have nearby section material. */
  voidSidesWithMaterial: 2,
  /** Material within this trail-cell neighborhood of a void counts as adjacent. */
  voidAdjacency: 3,
  /** Ordered clearance samples along a sequence. */
  sequentialSamples: 3,
  /** Min relative drop in clearance to count as compression. */
  compressionDrop: 0.18,
  /** Min fraction of samples whose shrinking axis has opposing material. */
  opposingBoundaries: 0.5,
  /** Passage length / section width. */
  hallSpan: 0.45,
  /** Max blocking material fraction across a passage. */
  hallInterrupt: 0.18,
  /** Ground band width / section width. */
  groundWidth: 0.45,
  /** Ground band mean y below this fraction of section height (from bottom). */
  groundDatum: 0.55,
  /** Vertical range of a ground/undulated band / section height. */
  deformation: 0.08,
  /** Min polyline points for a continuous band. */
  bandPoints: 8,
  /** Length/width of a linear trajectory bbox. */
  linearAspect: 2.2,
  /** Fraction of secondary primitives that attach to the primary trajectory. */
  linearAttachment: 0.25,
  /** Open volume / section cells. */
  openHallFraction: 0.28,
  /** Longest axis-aligned open run / max(width,height). */
  openSpan: 0.35,
  /** Max internal material islands inside the dominant open region / open cells. */
  subdivision: 0.12,
  /** Terracing / amphitheater plate count. */
  plateCount: 3,
  /** Min normalized vertical separation between plate means. */
  plateLevelGap: 0.04,
  /** Min normalized horizontal offset of successive plate centroids. */
  plateOffset: 0.04,
  /** Amphitheater: min cosine of plate-to-focus directions (alignment). */
  focusAlignment: 0.35,
  /** Amphitheater: focus must be an open region with this share of all open. */
  focusShare: 0.2,
  /** Void-edge: material on the primary side / material near void. */
  edgeAsymmetry: 0.62,
  /** Edge relationship length / void bbox major side. */
  edgeLength: 0.3,
  /** Undulation: min signed slope sign changes along a band. */
  undulationTurns: 3,
  /** Undulation: slope changes that are not a single step (discrete stair). */
  stepJump: 0.12,
  /** Independent voids for a field. */
  voidFieldCount: 3,
  /** Largest void share of all significant void for a field (must be below). */
  voidFieldDominance: 0.62,
  /** Inserted-plate min bbox width / section width. */
  plateSpan: 0.35,
  /** Terrace/amphitheater plate min bbox width / section width. */
  plateMemberSpan: 0.22,
  /** Min polyline samples on a plate-like member. */
  plateMinPoints: 5,
  /** bbox width / height for an elongated-in-x plate. */
  plateElongation: 2.2,
  /** Mean |Δy/Δx| along a plate (near-horizontal). */
  plateMaxMeanAbsSlope: 0.28,
  /** RMS |Δy/Δx| along a plate. */
  plateMaxRmsSlope: 0.34,
  /** Chord length / path length (straightness). */
  plateMinChordPath: 0.78,
  /** Max accumulated heading change (radians) along a plate. */
  plateMaxTotalTurning: 0.7,
  /** Min path length / section width. */
  plateMinPathFrac: 0.2,
  /** Min mean occupancy radius (member thickness support). */
  plateMinRadius: 0.1,
  /** Fraction of successive terrace offsets sharing the dominant sign. */
  terraceCoherence: 0.6,
  /** Start–end gap / path length treating a polyline as closed. */
  closedGapRatio: 0.14,
  /** Min vertices before a closed-form test is meaningful. */
  closedMinPoints: 10,
  /** Min closed path length / min(section w,h). */
  closedMinPathFrac: 0.35,
  /** 4πA/P² circularity floor for closed-form. */
  closedCircularity: 0.32,
  /** |shoelace area| / bbox area for a filled loop. */
  closedAreaFill: 0.2,
  /** Columns with a lowest-material sample / width. */
  groundEnvelopeCoverage: 0.5,
  /** Longest consecutive envelope run / width. */
  groundEnvelopeContinuity: 0.42,
  /** Material cells near the lower envelope / all material. */
  groundSupport: 0.4,
  /** Max material share in islands that miss the envelope. */
  groundFloatMax: 0.55,
  /** Flat-deep-plan max material y-range / height. */
  flatDepth: 0.42,
  /** Open cells above and below a plate / section. */
  plateClearance: 0.04,
  /** Inner void enclosure: fraction of inner perimeter facing material. */
  innerEnclosure: 0.55,
  /** Buffer between inner void and exterior open, occupancy-normalized. */
  containBuffer: 0.04,
} as const;

type T = typeof ARCHETYPE_VALIDITY_THRESHOLDS;

const N4: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

type Region = {
  cells: number[];
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  cx: number;
  cy: number;
};

const check = (
  id: string,
  label: string,
  passed: boolean,
  observed: number,
  required: string,
  evidence: string,
): ValidityCheck => ({ id, label, passed, observed, required, evidence });

function idx(x: number, y: number, width: number) {
  return y * width + x;
}

function components(mask: Uint8Array, width: number, height: number): Region[] {
  const seen = new Uint8Array(mask.length);
  const out: Region[] = [];
  for (let s = 0; s < mask.length; s += 1) {
    if (!mask[s] || seen[s]) continue;
    const stack = [s];
    seen[s] = 1;
    const cells: number[] = [];
    let minX = width;
    let maxX = -1;
    let minY = height;
    let maxY = -1;
    let sx = 0;
    let sy = 0;
    while (stack.length) {
      const i = stack.pop()!;
      cells.push(i);
      const x = i % width;
      const y = (i - x) / width;
      sx += x;
      sy += y;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      for (const [ox, oy] of N4) {
        const nx = x + ox;
        const ny = y + oy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const ni = idx(nx, ny, width);
        if (!mask[ni] || seen[ni]) continue;
        seen[ni] = 1;
        stack.push(ni);
      }
    }
    const n = Math.max(1, cells.length);
    out.push({
      cells,
      minX,
      maxX,
      minY,
      maxY,
      cx: sx / n,
      cy: sy / n,
    });
  }
  out.sort((a, b) => b.cells.length - a.cells.length);
  return out;
}

function rasterize(section: SectionModel) {
  const { width, height, occupancySize } = section;
  const material = new Uint8Array(width * height);
  const trailPerOcc = width / Math.max(1, occupancySize);
  const stamp = (x: number, y: number, rTrail: number) => {
    const rad = Math.max(0.6, rTrail);
    const x0 = Math.max(0, Math.floor(x - rad));
    const x1 = Math.min(width - 1, Math.ceil(x + rad));
    const y0 = Math.max(0, Math.floor(y - rad));
    const y1 = Math.min(height - 1, Math.ceil(y + rad));
    const r2 = rad * rad;
    for (let yy = y0; yy <= y1; yy += 1) {
      for (let xx = x0; xx <= x1; xx += 1) {
        const dx = xx + 0.5 - x;
        const dy = yy + 0.5 - y;
        if (dx * dx + dy * dy <= r2) material[idx(xx, yy, width)] = 1;
      }
    }
  };
  for (const primitive of section.primitives) {
    if (primitive.kind === "solid-body" && primitive.cells) {
      for (const i of primitive.cells) {
        if (i >= 0 && i < material.length && !section.protectedVoid[i]) material[i] = 1;
      }
      continue;
    }
    const pts = primitive.polyline;
    for (let p = 0; p < pts.length; p += 1) {
      const rOcc = primitive.radius[Math.min(p, primitive.radius.length - 1)] ?? 0.2;
      stamp(pts[p].x, pts[p].y, rOcc * trailPerOcc);
    }
  }
  const open = new Uint8Array(width * height);
  for (let i = 0; i < open.length; i += 1) {
    if (!material[i]) open[i] = 1;
  }
  return { material, open };
}

function bboxAspect(region: Region) {
  const w = Math.max(1, region.maxX - region.minX + 1);
  const h = Math.max(1, region.maxY - region.minY + 1);
  return { w, h, vh: h / w, hv: w / h };
}

function verticalFill(region: Region, mask: Uint8Array, width: number) {
  const x = Math.round(region.cx);
  let filled = 0;
  const h = Math.max(1, region.maxY - region.minY + 1);
  for (let y = region.minY; y <= region.maxY; y += 1) {
    if (mask[idx(Math.max(region.minX, Math.min(region.maxX, x)), y, width)]) filled += 1;
  }
  return filled / h;
}

function sidesWithMaterial(
  region: Region,
  material: Uint8Array,
  width: number,
  height: number,
  reach: number,
) {
  const tests: Array<[number, number, number, number]> = [
    [region.minX, region.minY, region.minX, region.maxY],
    [region.maxX, region.minY, region.maxX, region.maxY],
    [region.minX, region.minY, region.maxX, region.minY],
    [region.minX, region.maxY, region.maxX, region.maxY],
  ];
  let hit = 0;
  for (const [x0, y0, x1, y1] of tests) {
    let found = false;
    const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
    for (let s = 0; s <= steps; s += 1) {
      const x = Math.round(x0 + ((x1 - x0) * s) / steps);
      const y = Math.round(y0 + ((y1 - y0) * s) / steps);
      for (let d = 1; d <= reach && !found; d += 1) {
        for (const [ox, oy] of N4) {
          const nx = x + ox * d;
          const ny = y + oy * d;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          if (material[idx(nx, ny, width)]) {
            found = true;
            break;
          }
        }
      }
    }
    if (found) hit += 1;
  }
  return hit;
}

function longestOpenRun(
  open: Uint8Array,
  width: number,
  height: number,
  axis: "x" | "y",
) {
  let best = 0;
  if (axis === "x") {
    for (let y = 0; y < height; y += 1) {
      let run = 0;
      for (let x = 0; x < width; x += 1) {
        if (open[idx(x, y, width)]) {
          run += 1;
          if (run > best) best = run;
        } else run = 0;
      }
    }
  } else {
    for (let x = 0; x < width; x += 1) {
      let run = 0;
      for (let y = 0; y < height; y += 1) {
        if (open[idx(x, y, width)]) {
          run += 1;
          if (run > best) best = run;
        } else run = 0;
      }
    }
  }
  return best;
}

function anisotropy(mask: Uint8Array, width: number) {
  let n = 0;
  let sx = 0;
  let sy = 0;
  for (let i = 0; i < mask.length; i += 1) {
    if (!mask[i]) continue;
    n += 1;
    sx += i % width;
    sy += (i - (i % width)) / width;
  }
  if (n < 8) return 0;
  const cx = sx / n;
  const cy = sy / n;
  let xx = 0;
  let yy = 0;
  let xy = 0;
  for (let i = 0; i < mask.length; i += 1) {
    if (!mask[i]) continue;
    const dx = (i % width) - cx;
    const dy = (i - (i % width)) / width - cy;
    xx += dx * dx;
    yy += dy * dy;
    xy += dx * dy;
  }
  xx /= n;
  yy /= n;
  xy /= n;
  const disc = Math.sqrt(Math.max(0, (xx - yy) * (xx - yy) + 4 * xy * xy));
  const l1 = 0.5 * (xx + yy + disc);
  const l2 = 0.5 * (xx + yy - disc);
  return l1 + l2 > 1e-9 ? (l1 - l2) / (l1 + l2) : 0;
}

function principalAxis(mask: Uint8Array, width: number): "x" | "y" {
  let n = 0;
  let sx = 0;
  let sy = 0;
  let xx = 0;
  let yy = 0;
  for (let i = 0; i < mask.length; i += 1) {
    if (!mask[i]) continue;
    n += 1;
    const x = i % width;
    const y = (i - x) / width;
    sx += x;
    sy += y;
  }
  if (n < 4) return "x";
  const cx = sx / n;
  const cy = sy / n;
  for (let i = 0; i < mask.length; i += 1) {
    if (!mask[i]) continue;
    const x = i % width;
    const y = (i - x) / width;
    xx += (x - cx) ** 2;
    yy += (y - cy) ** 2;
  }
  return xx >= yy ? "x" : "y";
}

function longestPrimitive(section: SectionModel, kinds?: SectionPrimitive["kind"][]) {
  let best: SectionPrimitive | null = null;
  let bestLen = -1;
  for (const primitive of section.primitives) {
    if (kinds && !kinds.includes(primitive.kind)) continue;
    const len = primitive.polyline.length;
    if (len > bestLen) {
      best = primitive;
      bestLen = len;
    }
  }
  return best;
}

function polylineBBox(primitive: SectionPrimitive) {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of primitive.polyline) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, maxX, minY, maxY, w: maxX - minX, h: maxY - minY };
}

export type PlateGeometry = {
  primitive: SectionPrimitive;
  points: number;
  pathLen: number;
  chord: number;
  chordPath: number;
  span: number;
  elongation: number;
  meanAbsSlope: number;
  rmsSlope: number;
  totalTurning: number;
  meanRadius: number;
  meanX: number;
  meanY: number;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  closed: boolean;
  valid: boolean;
  failReasons: string[];
};

export type ClosedFormDiagnostic = {
  closed: boolean;
  circularity: number;
  areaFill: number;
  gapRatio: number;
  pathLen: number;
  kind: string;
  evidence: string;
};

function polylinePathLen(pts: { x: number; y: number }[]) {
  let len = 0;
  for (let i = 1; i < pts.length; i += 1) len += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  return len;
}

function wrapPi(a: number) {
  while (a > Math.PI) a -= 2 * Math.PI;
  while (a < -Math.PI) a += 2 * Math.PI;
  return a;
}

function polylineTurning(pts: { x: number; y: number }[]) {
  if (pts.length < 3) return 0;
  let turn = 0;
  let prev = Math.atan2(pts[1].y - pts[0].y, pts[1].x - pts[0].x);
  for (let i = 2; i < pts.length; i += 1) {
    const h = Math.atan2(pts[i].y - pts[i - 1].y, pts[i].x - pts[i - 1].x);
    turn += Math.abs(wrapPi(h - prev));
    prev = h;
  }
  return turn;
}

function polylineSlopes(pts: { x: number; y: number }[]) {
  if (pts.length < 2) return { meanAbs: 0, rms: 0 };
  let abs = 0;
  let sq = 0;
  let n = 0;
  for (let i = 1; i < pts.length; i += 1) {
    const dx = pts[i].x - pts[i - 1].x;
    const dy = pts[i].y - pts[i - 1].y;
    const s = Math.abs(dy) / Math.max(1e-6, Math.abs(dx));
    abs += s;
    sq += s * s;
    n += 1;
  }
  return { meanAbs: abs / n, rms: Math.sqrt(sq / n) };
}

function shoelaceArea(pts: { x: number; y: number }[]) {
  if (pts.length < 3) return 0;
  let a = 0;
  for (let i = 0; i < pts.length; i += 1) {
    const j = (i + 1) % pts.length;
    a += pts[i].x * pts[j].y - pts[j].x * pts[i].y;
  }
  return 0.5 * a;
}

function primitiveClosed(pts: { x: number; y: number }[], pathLen: number, t: T) {
  if (pts.length < t.closedMinPoints || pathLen < 8) return { closed: false, gapRatio: 1 };
  const gap = Math.hypot(pts[0].x - pts[pts.length - 1].x, pts[0].y - pts[pts.length - 1].y);
  const gapRatio = gap / Math.max(pathLen, 1e-6);
  return { closed: gapRatio <= t.closedGapRatio, gapRatio };
}

/**
 * Reusable plate detector. Geometry-only; does not read archetype identity.
 * A plate is an elongated, near-horizontal, low-curvature, continuous member
 * with thickness — not a low-slope loop tangent or closed ring fragment.
 */
export function measurePlateGeometry(
  primitive: SectionPrimitive,
  section: SectionModel,
  t: T = ARCHETYPE_VALIDITY_THRESHOLDS,
): PlateGeometry {
  const pts = primitive.polyline;
  const box = polylineBBox(primitive);
  const pathLen = polylinePathLen(pts);
  const chord =
    pts.length >= 2 ? Math.hypot(pts[pts.length - 1].x - pts[0].x, pts[pts.length - 1].y - pts[0].y) : 0;
  const chordPath = pathLen > 1e-6 ? chord / pathLen : 0;
  const slopes = polylineSlopes(pts);
  const turning = polylineTurning(pts);
  const meanRadius =
    primitive.radius.length > 0
      ? primitive.radius.reduce((a, b) => a + b, 0) / primitive.radius.length
      : 0;
  const meanX = pts.reduce((a, p) => a + p.x, 0) / Math.max(1, pts.length);
  const meanY = pts.reduce((a, p) => a + p.y, 0) / Math.max(1, pts.length);
  const elongation = box.w / Math.max(1e-6, box.h);
  const span = box.w / Math.max(1, section.width);
  const { closed } = primitiveClosed(pts, pathLen, t);
  const failReasons: string[] = [];
  if (pts.length < t.plateMinPoints) failReasons.push("points");
  if (span < t.plateMemberSpan) failReasons.push("span");
  if (elongation < t.plateElongation) failReasons.push("elongation");
  if (slopes.meanAbs > t.plateMaxMeanAbsSlope) failReasons.push("slope");
  if (slopes.rms > t.plateMaxRmsSlope) failReasons.push("rms-slope");
  if (chordPath < t.plateMinChordPath) failReasons.push("straightness");
  if (turning > t.plateMaxTotalTurning) failReasons.push("curvature");
  if (pathLen / Math.max(1, section.width) < t.plateMinPathFrac) failReasons.push("path");
  if (meanRadius < t.plateMinRadius) failReasons.push("thickness");
  if (closed) failReasons.push("closed-form");
  return {
    primitive,
    points: pts.length,
    pathLen,
    chord,
    chordPath,
    span,
    elongation,
    meanAbsSlope: slopes.meanAbs,
    rmsSlope: slopes.rms,
    totalTurning: turning,
    meanRadius,
    meanX,
    meanY,
    minX: box.minX,
    maxX: box.maxX,
    minY: box.minY,
    maxY: box.maxY,
    closed,
    valid: failReasons.length === 0,
    failReasons,
  };
}

export function detectValidPlates(
  section: SectionModel,
  t: T = ARCHETYPE_VALIDITY_THRESHOLDS,
  minSpan: number = t.plateMemberSpan,
): PlateGeometry[] {
  const out: PlateGeometry[] = [];
  for (const primitive of section.primitives) {
    if (primitive.polyline.length < 2) continue;
    const geo = measurePlateGeometry(primitive, section, t);
    if (!geo.valid) continue;
    if (geo.span < minSpan) continue;
    out.push(geo);
  }
  out.sort((a, b) => b.span - a.span);
  return out;
}

/**
 * Closed / loop diagnostic from SectionModel polylines only (not cycleDensity).
 * Does not ban loops globally; callers decide whether a closed form contradicts the archetype.
 */
export function closedFormDiagnostic(
  section: SectionModel,
  t: T = ARCHETYPE_VALIDITY_THRESHOLDS,
): ClosedFormDiagnostic {
  let best: ClosedFormDiagnostic = {
    closed: false,
    circularity: 0,
    areaFill: 0,
    gapRatio: 1,
    pathLen: 0,
    kind: "none",
    evidence: "no closed polyline",
  };
  const minPath = t.closedMinPathFrac * Math.min(section.width, section.height);
  for (const primitive of section.primitives) {
    const pts = primitive.polyline;
    const pathLen = polylinePathLen(pts);
    const { closed, gapRatio } = primitiveClosed(pts, pathLen, t);
    const area = Math.abs(shoelaceArea(pts));
    const peri = pathLen + (pts.length >= 2 ? Math.hypot(pts[0].x - pts[pts.length - 1].x, pts[0].y - pts[pts.length - 1].y) : 0);
    const circularity = peri > 1e-6 ? (4 * Math.PI * area) / (peri * peri) : 0;
    const box = polylineBBox(primitive);
    const bboxArea = Math.max(1e-6, box.w * box.h);
    const areaFill = area / bboxArea;
    const loop =
      closed &&
      pathLen >= minPath &&
      (circularity >= t.closedCircularity || areaFill >= t.closedAreaFill);
    if (loop && pathLen >= best.pathLen) {
      best = {
        closed: true,
        circularity,
        areaFill,
        gapRatio,
        pathLen,
        kind: primitive.kind,
        evidence: `${primitive.kind} gapRatio=${gapRatio.toFixed(3)} circ=${circularity.toFixed(3)} fill=${areaFill.toFixed(3)}`,
      };
    } else if (pathLen > best.pathLen && !best.closed) {
      best = {
        closed: false,
        circularity,
        areaFill,
        gapRatio,
        pathLen,
        kind: primitive.kind,
        evidence: `${primitive.kind} gapRatio=${gapRatio.toFixed(3)} circ=${circularity.toFixed(3)}`,
      };
    }
  }
  return best;
}

function plateLevels(section: SectionModel, height: number, t: T) {
  const plates = detectValidPlates(section, t, t.plateMemberSpan);
  const means = plates.map((item) => ({
    y: item.meanY,
    x: item.meanX,
    minX: item.minX,
    item,
  }));
  means.sort((a, b) => a.y - b.y);
  const levels: typeof means = [];
  for (const row of means) {
    const last = levels[levels.length - 1];
    if (!last || (row.y - last.y) / height >= t.plateLevelGap) levels.push(row);
  }
  let offsets = 0;
  const signed: number[] = [];
  for (let i = 1; i < levels.length; i += 1) {
    const dx = (levels[i].x - levels[i - 1].x) / Math.max(1, section.width);
    signed.push(dx);
    if (Math.abs(dx) >= t.plateOffset) offsets += 1;
  }
  const pos = signed.filter((v) => v > 0).length;
  const neg = signed.filter((v) => v < 0).length;
  const dominant = pos >= neg ? 1 : -1;
  const coherent =
    signed.length === 0 ? 0 : signed.filter((v) => Math.sign(v) === dominant || v === 0).length / signed.length;
  return { plates, levels, offsets, coherent, signed };
}

function slopeSignChanges(primitive: SectionPrimitive, height: number, t: T) {
  const pts = primitive.polyline;
  if (pts.length < 4) return { turns: 0, maxJump: 0 };
  let turns = 0;
  let prev = 0;
  let maxJump = 0;
  for (let i = 2; i < pts.length; i += 1) {
    const dy = (pts[i].y - pts[i - 1].y) / height;
    maxJump = Math.max(maxJump, Math.abs(dy));
    const sign = dy > 0.002 ? 1 : dy < -0.002 ? -1 : 0;
    if (sign !== 0 && prev !== 0 && sign !== prev) turns += 1;
    if (sign !== 0) prev = sign;
  }
  return { turns, maxJump };
}

function clearanceSamples(
  open: Uint8Array,
  material: Uint8Array,
  width: number,
  height: number,
  axis: "x" | "y",
  count: number,
) {
  const samples: Array<{ pos: number; clear: number; opposing: boolean }> = [];
  for (let s = 0; s < count; s += 1) {
    const t = (s + 0.5) / count;
    if (axis === "x") {
      const x = Math.round(t * (width - 1));
      let clear = 0;
      let lo = height;
      let hi = -1;
      for (let y = 0; y < height; y += 1) {
        if (open[idx(x, y, width)]) {
          clear += 1;
          if (y < lo) lo = y;
          if (y > hi) hi = y;
        }
      }
      const opposing =
        lo < height &&
        hi >= 0 &&
        material[idx(x, Math.max(0, lo - 1), width)] === 1 &&
        material[idx(x, Math.min(height - 1, hi + 1), width)] === 1;
      samples.push({ pos: x, clear: clear / height, opposing });
    } else {
      const y = Math.round(t * (height - 1));
      let clear = 0;
      let lo = width;
      let hi = -1;
      for (let x = 0; x < width; x += 1) {
        if (open[idx(x, y, width)]) {
          clear += 1;
          if (x < lo) lo = x;
          if (x > hi) hi = x;
        }
      }
      const opposing =
        lo < width &&
        hi >= 0 &&
        material[idx(Math.max(0, lo - 1), y, width)] === 1 &&
        material[idx(Math.min(width - 1, hi + 1), y, width)] === 1;
      samples.push({ pos: y, clear: clear / width, opposing });
    }
  }
  return samples;
}

function allPass(checks: ValidityCheck[]) {
  return checks.length > 0 && checks.every((item) => item.passed);
}

function verticalVoid(section: SectionModel, t: T): ValidityCheck[] {
  const { width, height } = section;
  const { material } = rasterize(section);
  const voids = components(section.protectedVoid, width, height);
  const dominant = voids[0];
  const total = voids.reduce((acc, item) => acc + item.cells.length, 0);
  const share = total > 0 && dominant ? dominant.cells.length / total : 0;
  const aspect = dominant ? bboxAspect(dominant) : { w: 0, h: 0, vh: 0, hv: 0 };
  const cont = dominant ? verticalFill(dominant, section.protectedVoid, width) : 0;
  const sides = dominant
    ? sidesWithMaterial(dominant, material, width, height, t.voidAdjacency)
    : 0;
  return [
    check("vv-dominant", "One dominant significant void", share >= t.dominantShare, share, `share ≥ ${t.dominantShare}`, `${voids.length} void components`),
    check("vv-aspect", "Vertical extent exceeds horizontal", aspect.vh >= t.verticalAspect, aspect.vh, `h/w ≥ ${t.verticalAspect}`, `bbox ${aspect.w}×${aspect.h}`),
    check("vv-sides", "Material along ≥2 sides of the void", sides >= t.voidSidesWithMaterial, sides, `sides ≥ ${t.voidSidesWithMaterial}`, "N4 bbox adjacency"),
    check("vv-continuous", "Void remains vertically continuous", cont >= t.verticalContinuity, cont, `column fill ≥ ${t.verticalContinuity}`, "median-x void fill"),
  ];
}

function compressedSequential(section: SectionModel, t: T): ValidityCheck[] {
  const { width, height, material, open } = { ...rasterize(section), width: section.width, height: section.height };
  const axis = principalAxis(material, width);
  const samples = clearanceSamples(open, material, width, height, axis, t.sequentialSamples);
  const clears = samples.map((item) => item.clear);
  let drops = 0;
  for (let i = 1; i < clears.length; i += 1) {
    if (clears[i] <= clears[i - 1] - t.compressionDrop || clears[i - 1] <= clears[i] - t.compressionDrop) {
      drops += 1;
    }
  }
  const mono =
    clears.every((value, i) => i === 0 || value <= clears[i - 1] + 1e-6) ||
    clears.every((value, i) => i === 0 || value >= clears[i - 1] - 1e-6);
  const opposing = samples.filter((item) => item.opposing).length / Math.max(1, samples.length);
  const aniso = anisotropy(material, width);
  return [
    check("cs-direction", "Recognizable progression direction", aniso >= 0.18, aniso, "material anisotropy ≥ 0.18", `axis ${axis}`),
    check("cs-samples", "At least 3 ordered clearance samples", samples.length >= t.sequentialSamples, samples.length, `n ≥ ${t.sequentialSamples}`, "open-gap samples"),
    check("cs-compress", "Clearance changes sequentially", drops >= 1 && mono, drops, "monotonic change with drop ≥ 0.18", `clears ${clears.map((v) => v.toFixed(2)).join(",")}`),
    check("cs-oppose", "Compression from opposing boundaries", opposing >= t.opposingBoundaries, opposing, `opposing ≥ ${t.opposingBoundaries}`, "material on both sides of gap"),
  ];
}

function continuousHall(section: SectionModel, t: T): ValidityCheck[] {
  const { width, height, open, material } = { ...rasterize(section), width: section.width, height: section.height };
  const opens = components(open, width, height);
  const passage = opens[0];
  const span = passage ? bboxAspect(passage).w / width : 0;
  const interrupt = passage
    ? passage.cells.filter((i) => material[i]).length / Math.max(1, passage.cells.length)
    : 1;
  const run = longestOpenRun(open, width, height, "x") / width;
  return [
    check("ch-one", "One dominant continuous open passage", Boolean(passage) && (opens[0]?.cells.length ?? 0) / open.reduce((a, b) => a + b, 0) >= 0.3, passage ? passage.cells.length / Math.max(1, open.reduce((a, b) => a + b, 0)) : 0, "largest open share ≥ 0.3", `${opens.length} open components`),
    check("ch-span", "Passage spans substantial horizontal width", Math.max(span, run) >= t.hallSpan, Math.max(span, run), `span ≥ ${t.hallSpan}`, `bboxW/width=${span.toFixed(3)} run=${run.toFixed(3)}`),
    check("ch-open", "No major solid interruption of the passage", interrupt <= t.hallInterrupt, interrupt, `material in passage ≤ ${t.hallInterrupt}`, "open-component material leak"),
  ];
}

function topographic(section: SectionModel, t: T): ValidityCheck[] {
  const { width, height, material } = { ...rasterize(section), width: section.width, height: section.height };
  const envelope: Array<number | null> = [];
  let covered = 0;
  for (let x = 0; x < width; x += 1) {
    let yLow: number | null = null;
    for (let y = 0; y < height; y += 1) {
      if (material[idx(x, y, width)]) {
        yLow = y;
        break;
      }
    }
    envelope.push(yLow);
    if (yLow != null) covered += 1;
  }
  const coverage = covered / Math.max(1, width);
  let bestRun = 0;
  let run = 0;
  for (const y of envelope) {
    if (y != null) {
      run += 1;
      if (run > bestRun) bestRun = run;
    } else run = 0;
  }
  const continuity = bestRun / Math.max(1, width);
  const ys = envelope.filter((y): y is number => y != null);
  const meanY = ys.length ? ys.reduce((a, b) => a + b, 0) / ys.length : height;
  const minY = ys.length ? Math.min(...ys) : height;
  const maxY = ys.length ? Math.max(...ys) : 0;
  const deform = ys.length ? (maxY - minY) / height : 0;
  const low = meanY / height <= t.groundDatum;
  const margin = Math.max(3, 0.08 * height);
  let supportCells = 0;
  let materialCells = 0;
  for (let i = 0; i < material.length; i += 1) {
    if (!material[i]) continue;
    materialCells += 1;
    const x = i % width;
    const y = (i - x) / width;
    const env = envelope[x];
    if (env != null && y <= env + margin) supportCells += 1;
  }
  const support = materialCells ? supportCells / materialCells : 0;
  const islands = components(material, width, height);
  let envelopeIsland = 0;
  if (islands.length) {
    for (const island of islands) {
      let hit = 0;
      for (const i of island.cells) {
        const x = i % width;
        const y = (i - x) / width;
        const env = envelope[x];
        if (env != null && Math.abs(y - env) <= margin) hit += 1;
      }
      if (hit > envelopeIsland) envelopeIsland = island.cells.length;
    }
  }
  const floatShare = materialCells ? 1 - envelopeIsland / materialCells : 1;
  const widthShare = coverage;
  return [
    check(
      "tg-band",
      "Continuous lower envelope / ground-like support",
      coverage >= t.groundEnvelopeCoverage && low,
      coverage,
      `envelope columns ≥ ${t.groundEnvelopeCoverage}, meanY/H ≤ ${t.groundDatum}`,
      `meanY/H=${(meanY / height).toFixed(3)}`,
    ),
    check(
      "tg-width",
      "Envelope spans a meaningful width",
      widthShare >= t.groundWidth,
      widthShare,
      `coverage ≥ ${t.groundWidth}`,
      `run=${continuity.toFixed(3)}`,
    ),
    check(
      "tg-deform",
      "Vertical deformation along the envelope",
      deform >= t.deformation,
      deform,
      `Δy/height ≥ ${t.deformation}`,
      `range=${(maxY - minY).toFixed(1)}`,
    ),
    check(
      "tg-cont",
      "Envelope remains one connected field",
      continuity >= t.groundEnvelopeContinuity && support >= t.groundSupport && floatShare <= t.groundFloatMax,
      continuity,
      `run ≥ ${t.groundEnvelopeContinuity}, support ≥ ${t.groundSupport}`,
      `support=${support.toFixed(3)} float=${floatShare.toFixed(3)} islands=${islands.length}`,
    ),
  ];
}

function linearGallery(section: SectionModel, t: T, edge: boolean): ValidityCheck[] {
  const primary = longestPrimitive(section, ["mass-spine", "span", "enclosure-edge"]);
  const box = primary ? polylineBBox(primary) : { minX: 0, maxX: 0, minY: 0, maxY: 0, w: 0, h: 0 };
  const aspect = Math.max(box.w, box.h) / Math.max(1e-6, Math.min(box.w, box.h));
  const others = section.primitives.filter((item) => item !== primary);
  let attached = 0;
  if (primary) {
    for (const other of others) {
      const hit = other.polyline.some((p) =>
        primary.polyline.some((q) => Math.hypot(p.x - q.x, p.y - q.y) < 4),
      );
      if (hit) attached += 1;
    }
  }
  const attachFrac = others.length ? attached / others.length : 0;
  const { material } = rasterize(section);
  const aniso = anisotropy(material, section.width);
  const checks = [
    check("lg-traj", "Dominant elongated trajectory", aspect >= t.linearAspect || aniso >= 0.35, Math.max(aspect, aniso * 3), `bbox aspect ≥ ${t.linearAspect}`, `aspect=${aspect.toFixed(2)} aniso=${aniso.toFixed(2)}`),
    check("lg-aniso", "Linear organization dominates", aniso >= 0.22, aniso, "anisotropy ≥ 0.22", "material covariance"),
    check("lg-attach", "Secondary members connect to the trajectory", attachFrac >= t.linearAttachment || others.length === 0, attachFrac, `attachment ≥ ${t.linearAttachment}`, `${attached}/${others.length}`),
  ];
  if (!edge) return checks;
  const { open } = rasterize(section);
  let left = 0;
  let right = 0;
  if (primary) {
    const axisX = box.w >= box.h;
    for (const p of primary.polyline) {
      const x = Math.max(0, Math.min(section.width - 1, Math.floor(p.x)));
      const y = Math.max(0, Math.min(section.height - 1, Math.floor(p.y)));
      if (axisX) {
        if (open[idx(x, Math.max(0, y - 3), section.width)]) left += 1;
        if (open[idx(x, Math.min(section.height - 1, y + 3), section.width)]) right += 1;
      } else {
        if (open[idx(Math.max(0, x - 3), y, section.width)]) left += 1;
        if (open[idx(Math.min(section.width - 1, x + 3), y, section.width)]) right += 1;
      }
    }
  }
  const side = left + right;
  const asym = side > 0 ? Math.max(left, right) / side : 0;
  const edgeLen = primary ? Math.max(box.w, box.h) / Math.max(section.width, section.height) : 0;
  return [
    ...checks,
    check("leg-edge", "Persistent edge/boundary association", edgeLen >= t.edgeLength, edgeLen, `length ≥ ${t.edgeLength}`, "primary bbox / section"),
    check("leg-asym", "Asymmetric organization across the trajectory", asym >= t.edgeAsymmetry, asym, `side share ≥ ${t.edgeAsymmetry}`, `open L/R ${left}/${right}`),
  ];
}

function openHall(section: SectionModel, t: T): ValidityCheck[] {
  const { width, height, open, material } = { ...rasterize(section), width: section.width, height: section.height };
  const openFrac = open.reduce((a, b) => a + b, 0) / open.length;
  const run = Math.max(
    longestOpenRun(open, width, height, "x") / width,
    longestOpenRun(open, width, height, "y") / height,
  );
  const opens = components(open, width, height);
  const islands = components(material, width, height);
  const subdiv = islands.length > 1 ? islands.slice(1).reduce((a, r) => a + r.cells.length, 0) / Math.max(1, open.reduce((a, b) => a + b, 0)) : 0;
  return [
    check("oh-volume", "Dominant open sectional volume", openFrac >= t.openHallFraction, openFrac, `open ≥ ${t.openHallFraction}`, `${opens.length} open components`),
    check("oh-span", "Large uninterrupted clear span", run >= t.openSpan, run, `span ≥ ${t.openSpan}`, "longest open run"),
    check("oh-subdiv", "Limited major internal subdivision", subdiv <= t.subdivision && islands.length <= 6, subdiv, `secondary material / open ≤ ${t.subdivision}`, `${islands.length} material islands`),
  ];
}

function terraced(section: SectionModel, t: T, amphitheater: boolean): ValidityCheck[] {
  const loop = closedFormDiagnostic(section, t);
  const { levels, offsets, plates, coherent } = plateLevels(section, section.height, t);
  const ordered = levels.length >= 2 && levels.every((item, i) => i === 0 || item.y >= levels[i - 1].y);
  const spansOk = levels.length >= t.plateCount && levels.every((row) => row.item.span >= t.plateMemberSpan);
  const notLoop = !loop.closed;
  const base = [
    check(
      "tr-count",
      "At least 3 valid plate-like members",
      plates.length >= t.plateCount && levels.length >= t.plateCount,
      levels.length,
      `valid plates/levels ≥ ${t.plateCount}`,
      `${plates.length} plates passing detector; ${levels.length} levels`,
    ),
    check(
      "tr-levels",
      "Plates occupy distinct vertical levels",
      levels.length >= t.plateCount,
      levels.length,
      `gap ≥ ${t.plateLevelGap} of height`,
      "clustered mean y of valid plates",
    ),
    check(
      "tr-offset",
      "Successive plates are horizontally offset",
      offsets >= Math.max(1, t.plateCount - 2),
      offsets,
      `offset ≥ ${t.plateOffset} of width`,
      "centroid x of valid plates",
    ),
    check(
      "tr-order",
      "Ordered terrace sequence with coherent recession",
      ordered && coherent >= t.terraceCoherence && spansOk,
      coherent,
      `monotonic y and offset sign ≥ ${t.terraceCoherence}`,
      `spansOk=${spansOk}`,
    ),
    check(
      "tr-noloop",
      "Not a closed / looped morphology read as terraces",
      notLoop,
      loop.closed ? 1 : 0,
      "closed-form diagnostic false",
      loop.evidence,
    ),
  ];
  if (!amphitheater) return base;
  const { open } = rasterize(section);
  const focuses = components(open, section.width, section.height);
  const focus = focuses[0];
  const openTotal = open.reduce((a, b) => a + b, 0);
  const share = focus && openTotal ? focus.cells.length / openTotal : 0;
  let align = 0;
  let facing = 0;
  if (focus && levels.length >= 2) {
    const vx = focus.cx - levels.reduce((a, l) => a + l.x, 0) / levels.length;
    const vy = focus.cy - levels.reduce((a, l) => a + l.y, 0) / levels.length;
    const vlen = Math.hypot(vx, vy) || 1;
    let cosSum = 0;
    let faceHits = 0;
    for (const level of levels) {
      const dx = focus.cx - level.x;
      const dy = focus.cy - level.y;
      const len = Math.hypot(dx, dy) || 1;
      const cos = (dx * vx + dy * vy) / (len * vlen);
      cosSum += cos;
      if (cos >= t.focusAlignment) faceHits += 1;
    }
    align = cosSum / levels.length;
    facing = faceHits / levels.length;
  }
  return [
    ...base,
    check("sa-focus", "Shared open/focal gathering territory", share >= t.focusShare, share, `largest open share ≥ ${t.focusShare}`, "open components"),
    check("sa-converge", "Plate sequence converges toward that focus", align >= t.focusAlignment, align, `mean cosine ≥ ${t.focusAlignment}`, "plate centroids → focus"),
    check(
      "sa-face",
      "Orientation consistency toward the focus",
      facing >= 0.66 && share >= t.focusShare,
      facing,
      "≥2/3 plates aligned to shared focus vector",
      `facing=${facing.toFixed(3)}`,
    ),
  ];
}

function voidEdge(section: SectionModel, t: T): ValidityCheck[] {
  const { width, height, material } = { ...rasterize(section), width: section.width, height: section.height };
  const voids = components(section.protectedVoid, width, height);
  const v = voids[0];
  const total = voids.reduce((a, r) => a + r.cells.length, 0);
  const share = v && total ? v.cells.length / total : 0;
  let left = 0;
  let right = 0;
  let top = 0;
  let bot = 0;
  let near = 0;
  if (v) {
    const reach = t.voidAdjacency + 2;
    for (let i = 0; i < material.length; i += 1) {
      if (!material[i]) continue;
      const x = i % width;
      const y = (i - x) / width;
      const dx = x < v.minX ? v.minX - x : x > v.maxX ? x - v.maxX : 0;
      const dy = y < v.minY ? v.minY - y : y > v.maxY ? y - v.maxY : 0;
      if (Math.max(dx, dy) > reach) continue;
      near += 1;
      const cx = (v.minX + v.maxX) / 2;
      const cy = (v.minY + v.maxY) / 2;
      const ax = x - cx;
      const ay = y - cy;
      if (Math.abs(ax) >= Math.abs(ay)) {
        if (ax < 0) left += 1;
        else right += 1;
      } else if (ay < 0) bot += 1;
      else top += 1;
    }
  }
  const sides = [left, right, top, bot];
  const primary = Math.max(...sides, 0);
  const asym = near > 0 ? primary / near : 0;
  const edgeLen = v ? Math.max(v.maxX - v.minX, v.maxY - v.minY) / Math.max(width, height) : 0;
  return [
    check("ve-void", "One major void", share >= t.dominantShare, share, `share ≥ ${t.dominantShare}`, `${voids.length} voids`),
    check("ve-edge", "Material concentrated on one side", asym >= t.edgeAsymmetry, asym, `primary side ≥ ${t.edgeAsymmetry}`, `LRTB ${sides.join(",")}`),
    check("ve-asym", "Relationship is asymmetric, not surrounding", sides.filter((n) => n > near * 0.18).length <= 2, sides.filter((n) => n > near * 0.18).length, "≤2 active sides", "neighboring material"),
    check("ve-length", "Edge relationship persists", edgeLen >= t.edgeLength, edgeLen, `void bbox ≥ ${t.edgeLength}`, "normalized void extent"),
  ];
}

function undulated(section: SectionModel, t: T): ValidityCheck[] {
  const band = longestPrimitive(section, ["mass-spine", "ledge", "enclosure-edge", "span"]);
  const box = band ? polylineBBox(band) : { w: 0, h: 0, minY: 0, maxY: 0, minX: 0, maxX: 0 };
  const osc = band ? slopeSignChanges(band, section.height, t) : { turns: 0, maxJump: 0 };
  const connected = Boolean(band) && (band?.polyline.length ?? 0) >= t.bandPoints;
  const discrete = osc.maxJump >= t.stepJump && osc.turns < t.undulationTurns;
  const loop = band
    ? primitiveClosed(band.polyline, polylinePathLen(band.polyline), t)
    : { closed: false, gapRatio: 1 };
  const widthShare = box.w / section.width;
  return [
    check("un-band", "One continuous primary band/surface", connected && widthShare >= 0.3, band ? band.polyline.length : 0, `points ≥ ${t.bandPoints}, width ≥ 0.3`, band?.kind ?? "none"),
    check("un-turns", "Repeated rise and fall", osc.turns >= t.undulationTurns, osc.turns, `sign changes ≥ ${t.undulationTurns}`, "polyline dy signs"),
    check("un-cont", "Smooth changes, not discrete plate steps", !discrete && osc.maxJump < t.stepJump * 1.8, osc.maxJump, `max |Δy|/H < ${t.stepJump}`, `jump=${osc.maxJump.toFixed(3)}`),
    check("un-conn", "Connected morphology, not a closed ring", connected && !loop.closed, connected ? 1 : 0, "single longest primitive, not closed", `width ${box.w.toFixed(1)} gap=${loop.gapRatio.toFixed(3)}`),
  ];
}

function voidField(section: SectionModel, t: T): ValidityCheck[] {
  const voids = components(section.protectedVoid, section.width, section.height);
  const total = voids.reduce((a, r) => a + r.cells.length, 0);
  const share = total && voids[0] ? voids[0].cells.length / total : 1;
  const { material } = rasterize(section);
  const between = material.reduce((a, b) => a + b, 0) / material.length;
  const spread = voids.length >= 2 ? Math.hypot(voids[0].cx - voids[1].cx, voids[0].cy - voids[1].cy) / Math.hypot(section.width, section.height) : 0;
  return [
    check("vf-count", "Multiple significant independent voids", voids.length >= t.voidFieldCount, voids.length, `count ≥ ${t.voidFieldCount}`, "protectedVoid components"),
    check("vf-dist", "Voids distributed through the section", spread >= 0.12 || voids.length >= t.voidFieldCount, spread, "centroid spacing or count", `spread=${spread.toFixed(3)}`),
    check("vf-dom", "No single void completely dominates", share <= t.voidFieldDominance, share, `largest share ≤ ${t.voidFieldDominance}`, `share=${share.toFixed(3)}`),
    check("vf-mat", "Section material remains between voids", between >= 0.01, between, "material fraction ≥ 0.01", "rasterized primitives"),
  ];
}

function insertedPlate(section: SectionModel, t: T): ValidityCheck[] {
  const loop = closedFormDiagnostic(section, t);
  const plates = detectValidPlates(section, t, t.plateSpan);
  const plate = plates[0];
  const span = plate?.span ?? 0;
  const { open } = rasterize(section);
  let above = 0;
  let below = 0;
  if (plate) {
    const midY = (plate.minY + plate.maxY) / 2;
    for (let i = 0; i < open.length; i += 1) {
      if (!open[i]) continue;
      const y = Math.floor(i / section.width);
      if (y > midY + 1) above += 1;
      if (y < midY - 1) below += 1;
    }
  }
  const n = open.length;
  const groundish = plate ? plate.minY / section.height <= 0.12 : true;
  const others = section.primitives.filter((item) => item !== plate?.primitive).length;
  return [
    check("ip-plate", "Dominant valid horizontal plate", Boolean(plate) && span >= t.plateSpan, span, `detector span ≥ ${t.plateSpan}`, plate ? plate.primitive.kind : "none"),
    check("ip-insert", "Inserted, not the lowest ground band", Boolean(plate) && !groundish, plate ? plate.minY / section.height : 0, "minY/height > 0.12", plate ? `minY=${plate.minY.toFixed(1)}` : "none"),
    check("ip-clear", "Open sectional space above and/or below", above / n >= t.plateClearance || below / n >= t.plateClearance, Math.max(above, below) / n, `open ≥ ${t.plateClearance}`, `above=${(above / n).toFixed(3)} below=${(below / n).toFixed(3)}`),
    check("ip-part", "Plate inserted among other section members", others >= 1 && section.primitives.length >= 2, section.primitives.length, "≥2 primitives around the plate", `${section.primitives.length} members`),
    check("ip-noloop", "Not a loop tangent or closed ring", !loop.closed && !(plate?.closed ?? false), loop.closed ? 1 : 0, "closed-form diagnostic false", loop.evidence),
  ];
}

function containedRoom(section: SectionModel, t: T): ValidityCheck[] {
  const voids = components(section.protectedVoid, section.width, section.height);
  const inner = voids[0];
  const { material, open } = rasterize(section);
  const opens = components(open, section.width, section.height);
  const outer = opens[0];
  let enclosure = 0;
  if (inner) {
    let peri = 0;
    let hit = 0;
    for (const i of inner.cells) {
      const x = i % section.width;
      const y = (i - x) / section.width;
      for (const [ox, oy] of N4) {
        const nx = x + ox;
        const ny = y + oy;
        if (nx < 0 || ny < 0 || nx >= section.width || ny >= section.height) continue;
        const ni = idx(nx, ny, section.width);
        if (section.protectedVoid[ni]) continue;
        peri += 1;
        if (material[ni]) hit += 1;
      }
    }
    enclosure = peri ? hit / peri : 0;
  }
  let buffer = 0;
  if (inner) {
    let minD = 1e9;
    for (const i of inner.cells) {
      const x = i % section.width;
      const y = (i - x) / section.width;
      const dx = Math.min(x, section.width - 1 - x);
      const dy = Math.min(y, section.height - 1 - y);
      minD = Math.min(minD, Math.min(dx, dy));
    }
    buffer = minD / Math.max(section.width, section.height);
  }
  const innerShare = inner ? inner.cells.length / Math.max(1, section.width * section.height) : 0;
  return [
    check("cr-inner", "Identifiable inner open region", Boolean(inner) && innerShare > 0, innerShare, "protected void component exists", `${voids.length} voids`),
    check("cr-outer", "Larger containing field/volume", Boolean(outer) && (outer?.cells.length ?? 0) > (inner?.cells.length ?? 0), outer && inner ? outer.cells.length / Math.max(1, inner.cells.length) : 0, "open field > inner void", "open vs protected void"),
    check("cr-encl", "Inner region substantially enclosed", enclosure >= t.innerEnclosure, enclosure, `material on inner peri ≥ ${t.innerEnclosure}`, "N4 void-material"),
    check("cr-buf", "Buffer between inner and exterior", buffer >= t.containBuffer, buffer, `edge distance ≥ ${t.containBuffer}`, "min inner-to-frame"),
  ];
}

const SPECIALISTS: Record<string, (section: SectionModel, t: T) => ValidityCheck[]> = {
  "vertical-void": verticalVoid,
  "compressed-sequential": compressedSequential,
  "continuous-hall": continuousHall,
  "topographic-ground-field": topographic,
  "linear-gallery": (section, t) => linearGallery(section, t, false),
  "open-hall": openHall,
  terraced: (section, t) => terraced(section, t, false),
  "flat-deep-plan": (section, t) => {
    const { material } = rasterize(section);
    const hv = section.width / section.height;
    const aniso = anisotropy(material, section.width);
    const axis = principalAxis(material, section.width);
    let yVar = 0;
    let n = 0;
    let sy = 0;
    let minY = section.height;
    let maxY = 0;
    for (let i = 0; i < material.length; i += 1) {
      if (!material[i]) continue;
      n += 1;
      const y = (i - (i % section.width)) / section.width;
      sy += y;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
    const my = n ? sy / n : 0;
    if (n) {
      for (let i = 0; i < material.length; i += 1) {
        if (!material[i]) continue;
        const y = (i - (i % section.width)) / section.width;
        yVar += (y - my) ** 2;
      }
      yVar = Math.sqrt(yVar / n) / section.height;
    }
    const depth = n ? (maxY - minY) / section.height : 1;
    const islands = components(material, section.width, section.height);
    const dominantShare = n && islands[0] ? islands[0].cells.length / n : 0;
    const plates = detectValidPlates(section, t, t.plateMemberSpan);
    const voids = components(section.protectedVoid, section.width, section.height);
    const v0 = voids[0];
    const vAspect = v0 ? bboxAspect(v0).vh : 0;
    const loop = closedFormDiagnostic(section, t);
    return [
      check("fd-prop", "Dominant horizontally elongated organization", hv >= 1 || axis === "x", hv, "width ≥ height or x-principal", `W/H=${hv.toFixed(2)} axis=${axis}`),
      check("fd-flat", "Low vertical variation and shallow sectional depth", yVar <= 0.22 && depth <= t.flatDepth, yVar, `y stdev/H ≤ 0.22 and depth ≤ ${t.flatDepth}`, `depth=${depth.toFixed(3)}`),
      check("fd-elon", "Elongated continuous organization", aniso >= 0.2 && dominantShare >= 0.45, aniso, "anisotropy ≥ 0.2 and dominant material ≥ 0.45", `share=${dominantShare.toFixed(3)} islands=${islands.length}`),
      check("fd-step", "No strong repeated stepping", plates.length < t.plateCount, plates.length, `valid plates < ${t.plateCount}`, `${plates.length} plates`),
      check("fd-void", "No dominant vertical void", vAspect < t.verticalAspect, vAspect, `void h/w < ${t.verticalAspect}`, v0 ? `bbox ${v0.maxX - v0.minX + 1}×${v0.maxY - v0.minY + 1}` : "no void"),
      check("fd-loop", "Not a circular closed loop masquerading as depth", !loop.closed, loop.closed ? 1 : 0, "closed-form diagnostic false", loop.evidence),
    ];
  },
  "void-edge": voidEdge,
  undulated,
  "stepped-amphitheater": (section, t) => terraced(section, t, true),
  "void-field": voidField,
  "inserted-horizontal-plate": insertedPlate,
  "contained-room-within-volume": containedRoom,
  "linear-edge-gallery": (section, t) => linearGallery(section, t, true),
};

export function evaluateArchetypeValidity(archetypeId: string, section: SectionModel): ArchetypeValidityResult {
  const specialist = SPECIALISTS[archetypeId];
  if (!specialist) {
    const checks = [
      check("unknown", "Known archetype identity", false, 0, "registered archetype id", archetypeId),
    ];
    return { archetypeId, valid: false, checks };
  }
  const checks = specialist(section, ARCHETYPE_VALIDITY_THRESHOLDS);
  return { archetypeId, valid: allPass(checks), checks };
}
