import type { Skill1Handoff, SimulationState } from "../skill1/types";
import type { MorphologyMeasurementResult } from "./measurements";
import type { SectionModel, SectionPoint, SectionPrimitive } from "./section-translate";

export type MorphogenesisStatus = "formed" | "insufficient-evidence";

export type OperationName =
  | "ground"
  | "lift"
  | "layer"
  | "step"
  | "orient"
  | "extend"
  | "thicken"
  | "carve"
  | "enclose"
  | "nest"
  | "span"
  | "repeat"
  | "separate"
  | "merge"
  | "undulate";

export type OperationRecord = {
  op: OperationName;
  evidence: string;
  memberIds: string[];
};

export type MorphogeneticMember = SectionPrimitive & {
  id: string;
  sourceIds: string[];
  operations: OperationName[];
};

export type MorphogeneticSectionModel = {
  orientation: SectionModel["orientation"];
  width: number;
  height: number;
  occupancySize: number;
  protectedVoid: Uint8Array;
  primitives: MorphogeneticMember[];
  status: MorphogenesisStatus;
  reasons: string[];
  operations: OperationRecord[];
  extractedPrimitiveCount: number;
  grammarId: string;
};

export type ArchetypeGrammar = {
  archetypeId: string;
  invariant: string;
  dominant: OperationName[];
  secondary: OperationName[];
  prohibited: OperationName[];
  validityTarget: string;
};

export type MorphogenesisInput = {
  archetypeId: string;
  extracted: SectionModel;
  morphology: MorphologyMeasurementResult;
  handoff?: Skill1Handoff;
  state?: SimulationState;
};

export const ARCHETYPE_GRAMMARS: Record<string, ArchetypeGrammar> = {
  "vertical-void": {
    archetypeId: "vertical-void",
    invariant: "Dominant vertically continuous open zone with mass along meaningful sides.",
    dominant: ["carve", "orient", "enclose"],
    secondary: ["thicken", "separate"],
    prohibited: ["step", "layer", "undulate"],
    validityTarget: "vertical-void",
  },
  "compressed-sequential": {
    archetypeId: "compressed-sequential",
    invariant: "Recognizable progression with sequential clearance change between opposing boundaries.",
    dominant: ["orient", "separate", "extend"],
    secondary: ["thicken", "merge"],
    prohibited: ["undulate", "nest"],
    validityTarget: "compressed-sequential",
  },
  "continuous-hall": {
    archetypeId: "continuous-hall",
    invariant: "Continuous open passage across a substantial section length.",
    dominant: ["span", "carve", "merge"],
    secondary: ["orient", "extend"],
    prohibited: ["nest", "step"],
    validityTarget: "continuous-hall",
  },
  "topographic-ground-field": {
    archetypeId: "topographic-ground-field",
    invariant: "One connected lower ground-like field with vertical deformation.",
    dominant: ["ground", "merge", "lift", "undulate"],
    secondary: ["thicken", "extend"],
    prohibited: ["step", "layer", "nest"],
    validityTarget: "topographic-ground-field",
  },
  "linear-gallery": {
    archetypeId: "linear-gallery",
    invariant: "Dominant linear trajectory organizing the section.",
    dominant: ["orient", "merge", "extend"],
    secondary: ["thicken", "span"],
    prohibited: ["nest", "step"],
    validityTarget: "linear-gallery",
  },
  "open-hall": {
    archetypeId: "open-hall",
    invariant: "One dominant uninterrupted open sectional volume.",
    dominant: ["carve", "separate", "span"],
    secondary: ["merge", "enclose"],
    prohibited: ["step", "layer"],
    validityTarget: "open-hall",
  },
  terraced: {
    archetypeId: "terraced",
    invariant: "At least three supported plate-like levels with progressive recession; no focal requirement.",
    dominant: ["orient", "layer", "step", "extend"],
    secondary: ["thicken", "separate"],
    prohibited: ["nest", "undulate"],
    validityTarget: "terraced",
  },
  "flat-deep-plan": {
    archetypeId: "flat-deep-plan",
    invariant: "Strongly horizontal, shallow, elongated organization.",
    dominant: ["orient", "merge", "extend"],
    secondary: ["thicken", "ground"],
    prohibited: ["step", "layer", "carve"],
    validityTarget: "flat-deep-plan",
  },
  "void-edge": {
    archetypeId: "void-edge",
    invariant: "Primary organization along one edge of a major void.",
    dominant: ["carve", "enclose", "separate", "orient"],
    secondary: ["thicken", "extend"],
    prohibited: ["nest", "step"],
    validityTarget: "void-edge",
  },
  undulated: {
    archetypeId: "undulated",
    invariant: "One continuous supported band with repeated rise and fall, not stepped.",
    dominant: ["ground", "merge", "undulate", "extend"],
    secondary: ["thicken", "lift"],
    prohibited: ["step", "layer"],
    validityTarget: "undulated",
  },
  "stepped-amphitheater": {
    archetypeId: "stepped-amphitheater",
    invariant: "Terraced plate sequence plus a shared biological focal/open gathering territory.",
    dominant: ["orient", "layer", "step", "carve"],
    secondary: ["extend", "thicken", "enclose"],
    prohibited: ["undulate", "nest"],
    validityTarget: "stepped-amphitheater",
  },
  "void-field": {
    archetypeId: "void-field",
    invariant: "Multiple significant distributed voids with material between them.",
    dominant: ["carve", "separate", "span"],
    secondary: ["merge", "thicken"],
    prohibited: ["step", "layer"],
    validityTarget: "void-field",
  },
  "inserted-horizontal-plate": {
    archetypeId: "inserted-horizontal-plate",
    invariant: "One or more supported horizontal plates inserted into a larger vertical/open condition.",
    dominant: ["orient", "extend", "span"],
    secondary: ["thicken", "separate", "enclose"],
    prohibited: ["step", "ground"],
    validityTarget: "inserted-horizontal-plate",
  },
  "contained-room-within-volume": {
    archetypeId: "contained-room-within-volume",
    invariant: "Supported inner spatial region nested in a larger containing condition.",
    dominant: ["carve", "enclose", "nest", "thicken"],
    secondary: ["merge", "separate"],
    prohibited: ["step", "layer"],
    validityTarget: "contained-room-within-volume",
  },
  "linear-edge-gallery": {
    archetypeId: "linear-edge-gallery",
    invariant: "Dominant linear trajectory persistently associated with one boundary/edge.",
    dominant: ["orient", "enclose", "extend", "separate"],
    secondary: ["merge", "thicken"],
    prohibited: ["nest", "step"],
    validityTarget: "linear-edge-gallery",
  },
};

type Member = MorphogeneticMember & { strength: number };

type Doc = {
  width: number;
  height: number;
  occupancySize: number;
  protectedVoid: Uint8Array;
  members: Member[];
  operations: OperationRecord[];
  reasons: string[];
  failed: boolean;
};

const idx = (x: number, y: number, width: number) => y * width + x;

function pathLen(pts: SectionPoint[]) {
  let n = 0;
  for (let i = 1; i < pts.length; i += 1) n += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  return n;
}

function meanPt(pts: SectionPoint[]) {
  const n = Math.max(1, pts.length);
  return {
    x: pts.reduce((a, p) => a + p.x, 0) / n,
    y: pts.reduce((a, p) => a + p.y, 0) / n,
  };
}

function bbox(pts: SectionPoint[]) {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of pts) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, maxX, minY, maxY, w: maxX - minX, h: maxY - minY };
}

function meanRadius(radius: number[]) {
  if (!radius.length) return 0;
  return radius.reduce((a, b) => a + b, 0) / radius.length;
}

function dxShare(pts: SectionPoint[]) {
  let dx = 0;
  let dy = 0;
  for (let i = 1; i < pts.length; i += 1) {
    dx += Math.abs(pts[i].x - pts[i - 1].x);
    dy += Math.abs(pts[i].y - pts[i - 1].y);
  }
  const s = dx + dy;
  return s > 1e-6 ? dx / s : 0;
}

function clonePts(pts: SectionPoint[]) {
  return pts.map((p) => ({ x: p.x, y: p.y }));
}

function logOp(doc: Doc, op: OperationName, evidence: string, ids: string[]) {
  doc.operations.push({ op, evidence, memberIds: [...ids] });
  const set = new Set(ids);
  for (const m of doc.members) {
    if (set.has(m.id) && !m.operations.includes(op)) m.operations.push(op);
  }
}

function fail(doc: Doc, reason: string) {
  doc.failed = true;
  doc.reasons.push(reason);
}

function ingest(extracted: SectionModel): Member[] {
  return extracted.primitives.map((primitive, i) => {
    const id = `extracted:${i}`;
    const strength = pathLen(primitive.polyline) * Math.max(0.05, meanRadius(primitive.radius));
    return {
      ...primitive,
      polyline: clonePts(primitive.polyline),
      radius: [...primitive.radius],
      cells: primitive.cells ? [...primitive.cells] : undefined,
      id,
      sourceIds: [id],
      operations: [],
      strength,
    };
  });
}

/** Flatten toward horizontal or vertical while keeping biological x/y samples. */
export function orientMember(member: Member, axis: "horizontal" | "vertical", blend = 0.88): Member {
  const pts = clonePts(member.polyline);
  const c = meanPt(pts);
  const next = pts.map((p) =>
    axis === "horizontal"
      ? { x: p.x, y: p.y + (c.y - p.y) * blend }
      : { x: p.x + (c.x - p.x) * blend, y: p.y },
  );
  return {
    ...member,
    polyline: next,
    kind: axis === "horizontal" && member.kind !== "solid-body" ? "ledge" : member.kind,
    evidence: `${member.evidence}|orient:${axis}`,
  };
}

/** Extend along the dominant axis using biological path length as budget. */
export function extendMember(member: Member, width: number, height: number): Member {
  const pts = clonePts(member.polyline);
  if (pts.length < 2) return member;
  const box = bbox(pts);
  const budget = Math.max(box.w, pathLen(pts));
  const horizontal = dxShare(pts) >= 0.5 || box.w >= box.h;
  if (horizontal) {
    const extra = Math.max(0, Math.min(budget, width * 0.82) - box.w) / 2;
    const y = meanPt(pts).y;
    const left = { x: Math.max(1, box.minX - extra), y };
    const right = { x: Math.min(width - 2, box.maxX + extra), y };
    const n = Math.max(8, pts.length);
    const polyline: SectionPoint[] = [];
    for (let i = 0; i < n; i += 1) {
      const t = i / (n - 1);
      polyline.push({ x: left.x + (right.x - left.x) * t, y: y + (pts[Math.min(pts.length - 1, i)].y - y) * 0.12 });
    }
    return { ...member, polyline, radius: polyline.map((_, i) => member.radius[Math.min(i, member.radius.length - 1)] ?? 0.2) };
  }
  const extra = Math.max(0, Math.min(budget, height * 0.82) - box.h) / 2;
  const x = meanPt(pts).x;
  const n = Math.max(8, pts.length);
  const polyline: SectionPoint[] = [];
  for (let i = 0; i < n; i += 1) {
    const t = i / (n - 1);
    const y = Math.max(1, box.minY - extra) + (Math.min(height - 2, box.maxY + extra) - Math.max(1, box.minY - extra)) * t;
    polyline.push({ x: x + (pts[Math.min(pts.length - 1, i)].x - x) * 0.12, y });
  }
  return { ...member, polyline, radius: polyline.map((_, i) => member.radius[Math.min(i, member.radius.length - 1)] ?? 0.2) };
}

export function thickenMember(member: Member, scale: number): Member {
  const s = Math.max(1, scale);
  return { ...member, radius: member.radius.map((r) => Math.max(0.12, r * s)) };
}

function components(mask: Uint8Array, width: number, height: number) {
  const seen = new Uint8Array(mask.length);
  const out: Array<{ cells: number[]; minX: number; maxX: number; minY: number; maxY: number; cx: number; cy: number }> = [];
  const N4: Array<[number, number]> = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ];
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
    out.push({ cells, minX, maxX, minY, maxY, cx: sx / cells.length, cy: sy / cells.length });
  }
  out.sort((a, b) => b.cells.length - a.cells.length);
  return out;
}

/** Keep only the most vertical core of existing protected void (no new void cells). */
export function carveVerticalCore(voidMask: Uint8Array, width: number, height: number) {
  const next = new Uint8Array(voidMask.length);
  let bestRun = 0;
  const colRun = new Array(width).fill(0);
  for (let x = 0; x < width; x += 1) {
    let run = 0;
    let local = 0;
    for (let y = 0; y < height; y += 1) {
      if (voidMask[idx(x, y, width)]) {
        run += 1;
        if (run > local) local = run;
      } else run = 0;
    }
    colRun[x] = local;
    if (local > bestRun) bestRun = local;
  }
  if (bestRun < 4) return voidMask.slice();
  const keep = bestRun * 0.72;
  for (let x = 0; x < width; x += 1) {
    if (colRun[x] < keep) continue;
    for (let y = 0; y < height; y += 1) {
      const i = idx(x, y, width);
      if (voidMask[i]) next[i] = 1;
    }
  }
  if (next.reduce((a, b) => a + b, 0) < 8) return voidMask.slice();
  return next;
}

function plateCandidates(members: Member[], width: number, height: number) {
  const scored = members
    .filter((m) => m.polyline.length >= 4)
    .map((m) => {
      const box = bbox(m.polyline);
      const share = dxShare(m.polyline);
      const horiz = box.w / Math.max(1e-6, box.h);
      const usable = box.w >= 0.16 * width || share >= 0.48;
      const score = m.strength * (0.4 + 0.6 * Math.min(4, horiz) / 4) * (0.3 + 0.7 * share);
      return { m, usable, score, box, share, mean: meanPt(m.polyline) };
    })
    .filter((row) => row.usable)
    .sort((a, b) => b.score - a.score);

  const picked: typeof scored = [];
  for (const row of scored) {
    const dup = picked.some(
      (other) =>
        Math.abs(other.mean.y - row.mean.y) / height < 0.045 ||
        (Math.abs(other.mean.y - row.mean.y) / height < 0.035 &&
          Math.abs(other.mean.x - row.mean.x) / width < 0.08),
    );
    if (dup) continue;
    picked.push(row);
  }
  return picked;
}

function formTerraces(doc: Doc, minCount: number) {
  const cand = plateCandidates(doc.members, doc.width, doc.height);
  if (cand.length < minCount) {
    fail(
      doc,
      `only ${cand.length} defensible plate-supporting trajectories; requires minimum ${minCount}`,
    );
    return [];
  }
  const chosen = cand.slice(0, Math.max(minCount, Math.min(cand.length, minCount + 2)));
  chosen.sort((a, b) => a.mean.y - b.mean.y);
  const ySpan = (chosen[chosen.length - 1].mean.y - chosen[0].mean.y) / doc.height;
  if (ySpan < 0.08) {
    fail(doc, `plate evidence lacks distinct vertical levels (Δy/H=${ySpan.toFixed(3)})`);
    return [];
  }
  const xs = chosen.map((c) => c.mean.x);
  const ys = chosen.map((c) => c.mean.y);
  let corr = 0;
  const mx = xs.reduce((a, b) => a + b, 0) / xs.length;
  const my = ys.reduce((a, b) => a + b, 0) / ys.length;
  let vx = 0;
  let vy = 0;
  for (let i = 0; i < xs.length; i += 1) {
    corr += (xs[i] - mx) * (ys[i] - my);
    vx += (xs[i] - mx) ** 2;
    vy += (ys[i] - my) ** 2;
  }
  const sign = corr >= 0 ? 1 : -1;
  const xSorted = [...xs].sort((a, b) => (sign >= 0 ? a - b : b - a));
  const xSpread = (Math.max(...xs) - Math.min(...xs)) / doc.width;
  if (xSpread < 0.04) {
    fail(doc, `plate evidence lacks progressive horizontal recession (Δx/W=${xSpread.toFixed(3)})`);
    return [];
  }

  const formed: Member[] = [];
  chosen.forEach((row, i) => {
    let m = orientMember(row.m, "horizontal", 0.92);
    m = extendMember(m, doc.width, doc.height);
    const targetX = xSorted[i];
    const c = meanPt(m.polyline);
    const dx = targetX - c.x;
    m = {
      ...m,
      id: `plate:${i}`,
      sourceIds: [...row.m.sourceIds],
      polyline: m.polyline.map((p) => ({ x: p.x + dx * 0.85, y: p.y })),
      kind: "ledge",
      evidence: `${row.m.evidence}|terrace-from-spine`,
      strength: row.score,
    };
    m = thickenMember(m, 1.15);
    m.operations = ["orient", "layer", "step", "extend", "thicken"];
    formed.push(m);
  });
  const ids = formed.map((m) => m.id);
  doc.operations.push(
    { op: "orient", evidence: "near-horizontalizable spines / ledges / spans", memberIds: ids },
    { op: "layer", evidence: "biological mean y of selected members", memberIds: ids },
    { op: "step", evidence: `recession sign ${sign} from y–x correlation of evidence`, memberIds: ids },
    { op: "extend", evidence: "path length / bbox of source trajectories", memberIds: ids },
    { op: "thicken", evidence: "source member radius", memberIds: ids },
  );
  return formed;
}

function groundEnvelope(doc: Doc, morphology: MorphologyMeasurementResult) {
  const { width, height } = doc;
  const mass = morphology.overlays.mass;
  const runs: Array<{ pts: SectionPoint[]; radii: number[] }> = [];
  let cur: { pts: SectionPoint[]; radii: number[] } | null = null;
  let lastX = -99;
  for (let x = 0; x < width; x += 1) {
    let yLow: number | null = null;
    for (let y = 0; y < height; y += 1) {
      if (mass[idx(x, y, width)]) {
        yLow = y;
        break;
      }
    }
    if (yLow == null) {
      cur = null;
      continue;
    }
    const p = { x: x + 0.5, y: yLow + 0.4 };
    if (!cur || x - lastX > 2) {
      cur = { pts: [], radii: [] };
      runs.push(cur);
    }
    cur.pts.push(p);
    cur.radii.push(0.22);
    lastX = x;
  }
  runs.sort((a, b) => b.pts.length - a.pts.length);
  return runs[0] ?? { pts: [] as SectionPoint[], radii: [] as number[] };
}

function applyUndulate(pts: SectionPoint[], height: number) {
  if (pts.length < 8) return pts;
  const meanY = pts.reduce((a, p) => a + p.y, 0) / pts.length;
  return pts.map((p) => {
    const residual = p.y - meanY;
    return { x: p.x, y: meanY + residual * 1.35 };
  });
}

function linearPrimary(doc: Doc, edge: boolean) {
  if (!doc.members.length) {
    fail(doc, "no extracted members for a linear trajectory");
    return;
  }
  const ranked = [...doc.members].sort((a, b) => b.strength - a.strength);
  let primary = ranked[0];
  const box = bbox(primary.polyline);
  primary = orientMember(primary, box.w >= box.h ? "horizontal" : "vertical", 0.55);
  primary = extendMember(primary, doc.width, doc.height);
  primary = thickenMember(primary, 1.1);
  primary = { ...primary, id: "traj:0", sourceIds: [...primary.sourceIds] };
  const others = ranked.slice(1, 8).filter((m) => {
    const c = meanPt(m.polyline);
    const d = primary.polyline.some((p) => Math.hypot(p.x - c.x, p.y - c.y) < 8);
    return d;
  });
  logOp(doc, "orient", "dominant extracted trajectory", [primary.id]);
  logOp(doc, "extend", "source path length", [primary.id]);
  logOp(doc, "merge", "secondary members attached to trajectory", others.map((m) => m.id));
  if (edge) {
    const c = meanPt(primary.polyline);
    const left = c.x < doc.width / 2;
    const kept = [primary, ...others.filter((m) => (meanPt(m.polyline).x < doc.width / 2) === left)];
    logOp(doc, "enclose", "members on the persistent boundary side", kept.map((m) => m.id));
    logOp(doc, "separate", "drop members on the opposite side", []);
    doc.members = kept;
    return;
  }
  doc.members = [primary, ...others];
}

function specialize(archetypeId: string, doc: Doc, morphology: MorphologyMeasurementResult) {
  const grammar = ARCHETYPE_GRAMMARS[archetypeId];
  if (!grammar) {
    fail(doc, `unknown archetype ${archetypeId}`);
    return;
  }

  if (archetypeId === "terraced") {
    const plates = formTerraces(doc, 3);
    if (plates.length) doc.members = plates;
    return;
  }

  if (archetypeId === "stepped-amphitheater") {
    const voids = components(doc.protectedVoid, doc.width, doc.height);
    const focus = voids[0];
    const total = voids.reduce((a, v) => a + v.cells.length, 0);
    const share = focus && total ? focus.cells.length / total : 0;
    const compact = focus
      ? (focus.maxX - focus.minX + 1) * (focus.maxY - focus.minY + 1) / (doc.width * doc.height)
      : 1;
    if (!focus || share < 0.12 || compact > 0.85) {
      fail(doc, "no defensible shared focal/open gathering territory in protected void");
    }
    const plates = formTerraces(doc, 3);
    if (!plates.length) return;
    if (focus && !doc.failed) {
      const mx = plates.reduce((a, p) => a + meanPt(p.polyline).x, 0) / plates.length;
      const recede = focus.cx >= mx ? 1 : -1;
      plates.forEach((p, i) => {
        const c = meanPt(p.polyline);
        const want = c.x + recede * (i - (plates.length - 1) / 2) * Math.abs(c.x - focus.cx) * 0.08;
        const dx = want - c.x;
        p.polyline = p.polyline.map((pt) => ({ x: pt.x + dx, y: pt.y }));
      });
      logOp(doc, "carve", "largest protected-void component as gathering focus", plates.map((p) => p.id));
    }
    doc.members = plates;
    return;
  }

  if (archetypeId === "inserted-horizontal-plate") {
    const cand = plateCandidates(doc.members, doc.width, doc.height).filter(
      (row) => row.mean.y / doc.height > 0.14,
    );
    if (!cand.length) {
      fail(doc, "no inserted (non-ground) horizontalizable member with biological support");
      return;
    }
    let plate = orientMember(cand[0].m, "horizontal", 0.9);
    plate = extendMember(plate, doc.width, doc.height);
    plate = thickenMember(plate, 1.2);
    plate = { ...plate, id: "plate:0", kind: "ledge", sourceIds: [...cand[0].m.sourceIds] };
    const context = doc.members.filter((m) => m.id !== cand[0].m.id).slice(0, 12);
    if (!context.length) {
      fail(doc, "plate lacks surrounding sectional members");
      return;
    }
    logOp(doc, "orient", cand[0].m.evidence, [plate.id]);
    logOp(doc, "extend", "source span/path", [plate.id]);
    logOp(doc, "span", "remaining extracted members as host condition", context.map((m) => m.id));
    doc.members = [plate, ...context];
    return;
  }

  if (archetypeId === "vertical-void") {
    const before = doc.protectedVoid;
    doc.protectedVoid = carveVerticalCore(before, doc.width, doc.height);
    const voids = components(doc.protectedVoid, doc.width, doc.height);
    const v = voids[0];
    if (!v) {
      fail(doc, "no significant void evidence to carve");
      return;
    }
    const w = v.maxX - v.minX + 1;
    const h = v.maxY - v.minY + 1;
    if (h / Math.max(1, w) < 1.05) {
      fail(doc, `strongest void core is not vertically dominant (h/w=${(h / Math.max(1, w)).toFixed(2)})`);
    }
    logOp(doc, "carve", "vertical core of protected void (subset only)", []);
    const sides = doc.members
      .filter((m) => {
        const c = meanPt(m.polyline);
        return c.x <= v.minX + 2 || c.x >= v.maxX - 2 || Math.abs(c.x - v.cx) < w * 0.7;
      })
      .sort((a, b) => b.strength - a.strength)
      .slice(0, 6)
      .map((m) => thickenMember(orientMember(m, "vertical", 0.7), 1.1));
    if (sides.length < 1) fail(doc, "no mass evidence along the void sides");
    logOp(doc, "orient", "mass spines beside the void core", sides.map((m) => m.id));
    logOp(doc, "enclose", "side members retained from extraction", sides.map((m) => m.id));
    doc.members = sides.length ? sides : doc.members.slice(0, 4);
    return;
  }

  if (archetypeId === "topographic-ground-field") {
    const { pts, radii } = groundEnvelope(doc, morphology);
    if (pts.length < 12) {
      fail(doc, `lower envelope too sparse (${pts.length} samples) to form a ground field`);
      return;
    }
    const coverage = pts.length / doc.width;
    if (coverage < 0.4) fail(doc, `ground envelope coverage ${coverage.toFixed(2)} is insufficient`);
    const ys = pts.map((p) => p.y);
    const deform = (Math.max(...ys) - Math.min(...ys)) / doc.height;
    if (deform < 0.06) fail(doc, `envelope lacks vertical deformation (Δy/H=${deform.toFixed(3)})`);
    const lifted = applyUndulate(pts, doc.height);
    const band: Member = {
      id: "ground:0",
      kind: "mass-spine",
      evidence: "overlays.mass.lower-envelope",
      polyline: lifted,
      radius: radii,
      sourceIds: doc.members.map((m) => m.id).slice(0, 8),
      operations: ["ground", "merge", "lift", "undulate"],
      strength: pts.length,
    };
    logOp(doc, "ground", "lowest mass samples across x from overlays", [band.id]);
    logOp(doc, "merge", "adjacent envelope samples only (gaps not invented)", [band.id]);
    logOp(doc, "lift", "local envelope residual as fold amplitude", [band.id]);
    logOp(doc, "undulate", "amplify existing envelope residual; no terrace quantization", [band.id]);
    doc.members = [band];
    return;
  }

  if (archetypeId === "undulated") {
    const { pts, radii } = groundEnvelope(doc, morphology);
    const longest = [...doc.members].sort((a, b) => pathLen(b.polyline) - pathLen(a.polyline))[0];
    const use =
      longest && bbox(longest.polyline).w / doc.width >= 0.28
        ? longest.polyline
        : pts;
    if (use.length < 8) {
      fail(doc, "no continuous primary band long enough to undulate");
      return;
    }
    let turns = 0;
    let prev = 0;
    for (let i = 2; i < use.length; i += 1) {
      const dy = use[i].y - use[i - 1].y;
      const sign = dy > 0.4 ? 1 : dy < -0.4 ? -1 : 0;
      if (sign && prev && sign !== prev) turns += 1;
      if (sign) prev = sign;
    }
    if (turns < 3) {
      fail(doc, `band lacks repeated rise/fall (sign changes=${turns})`);
    }
    const wave = applyUndulate(use, doc.height);
    const band: Member = {
      id: "band:0",
      kind: "mass-spine",
      evidence: longest ? longest.evidence : "overlays.mass.lower-envelope",
      polyline: wave,
      radius: wave.map((_, i) => radii[i] ?? longest?.radius[0] ?? 0.2),
      sourceIds: longest ? [...longest.sourceIds] : ["envelope"],
      operations: ["merge", "undulate", "extend"],
      strength: wave.length,
    };
    logOp(doc, "merge", "continuous primary band from longest member or envelope", [band.id]);
    logOp(doc, "undulate", "amplify existing dy residuals; no new sinusoid", [band.id]);
    doc.members = [band];
    return;
  }

  if (archetypeId === "contained-room-within-volume") {
    const voids = components(doc.protectedVoid, doc.width, doc.height);
    const inner = voids[0];
    if (!inner) {
      fail(doc, "no inner void evidence to nest");
      return;
    }
    const near = doc.members.filter((m) =>
      m.polyline.some(
        (p) => p.x >= inner.minX - 4 && p.x <= inner.maxX + 4 && p.y >= inner.minY - 4 && p.y <= inner.maxY + 4,
      ),
    );
    if (!near.length) {
      fail(doc, "no surrounding mass/enclosure evidence around the inner void");
      return;
    }
    const shell = near.map((m) => thickenMember(m, 1.35));
    logOp(doc, "carve", "dominant protected void as inner room", []);
    logOp(doc, "enclose", "extracted members adjacent to inner void", shell.map((m) => m.id));
    logOp(doc, "nest", "inner void remains a subset of protected void; outer field is remainder", shell.map((m) => m.id));
    logOp(doc, "thicken", "biological radii of surrounding members", shell.map((m) => m.id));
    doc.members = shell;
    return;
  }

  if (archetypeId === "flat-deep-plan") {
    const horiz = doc.members
      .filter((m) => dxShare(m.polyline) >= 0.4 || bbox(m.polyline).w >= bbox(m.polyline).h)
      .sort((a, b) => b.strength - a.strength)
      .slice(0, 8)
      .map((m) => thickenMember(extendMember(orientMember(m, "horizontal", 0.8), doc.width, doc.height), 1.05));
    if (!horiz.length) fail(doc, "no horizontally elongated biological members");
    logOp(doc, "orient", "horizontalizable extracted members", horiz.map((m) => m.id));
    logOp(doc, "merge", "keep dominant elongated set", horiz.map((m) => m.id));
    doc.members = horiz.length ? horiz : doc.members;
    return;
  }

  if (archetypeId === "void-field") {
    const voids = components(doc.protectedVoid, doc.width, doc.height);
    if (voids.length < 3) fail(doc, `only ${voids.length} significant void components; field requires multiple`);
    logOp(doc, "carve", "keep existing protected-void components", []);
    logOp(doc, "separate", "retain extracted material between voids", doc.members.map((m) => m.id));
    doc.members = doc.members.slice(0, 24);
    return;
  }

  if (archetypeId === "open-hall" || archetypeId === "continuous-hall") {
    const spans = doc.members.filter((m) => m.kind === "span" || dxShare(m.polyline) > 0.55);
    const use = spans.length ? spans : doc.members;
    logOp(doc, "span", "extracted spans / elongated members as passage edges", use.map((m) => m.id));
    logOp(doc, "carve", "open remains unprotected occupancy / protected void", []);
    doc.members = use.slice(0, 16);
    return;
  }

  if (archetypeId === "void-edge") {
    const voids = components(doc.protectedVoid, doc.width, doc.height);
    const v = voids[0];
    if (!v) {
      fail(doc, "no major void for an edge relationship");
      return;
    }
    const cx = (v.minX + v.maxX) / 2;
    const left = doc.members.filter((m) => meanPt(m.polyline).x <= cx);
    const right = doc.members.filter((m) => meanPt(m.polyline).x > cx);
    const primary = left.length >= right.length ? left : right;
    if (!primary.length) fail(doc, "no mass evidence on a single void edge");
    logOp(doc, "carve", "dominant protected void", []);
    logOp(doc, "separate", "keep the stronger void-side mass set", primary.map((m) => m.id));
    logOp(doc, "enclose", "edge-associated members", primary.map((m) => m.id));
    doc.members = primary.slice(0, 12).map((m) => thickenMember(m, 1.1));
    return;
  }

  if (archetypeId === "linear-gallery") {
    linearPrimary(doc, false);
    return;
  }
  if (archetypeId === "linear-edge-gallery") {
    linearPrimary(doc, true);
    return;
  }

  if (archetypeId === "compressed-sequential") {
    const ordered = [...doc.members].sort((a, b) => meanPt(a.polyline).x - meanPt(b.polyline).x).slice(0, 10);
    if (ordered.length < 2) fail(doc, "insufficient members to form a sequential progression");
    logOp(doc, "orient", "members ordered by biological x", ordered.map((m) => m.id));
    logOp(doc, "separate", "keep the x-ordered supporting set", ordered.map((m) => m.id));
    doc.members = ordered.map((m) => thickenMember(m, 1.05));
  }
}

export function toSectionModel(model: MorphogeneticSectionModel): SectionModel {
  return {
    orientation: model.orientation,
    width: model.width,
    height: model.height,
    occupancySize: model.occupancySize,
    protectedVoid: model.protectedVoid,
    primitives: model.primitives.map((p) => ({
      kind: p.kind,
      evidence: p.evidence,
      polyline: p.polyline,
      radius: p.radius,
      concentrationIndex: p.concentrationIndex,
      cells: p.cells,
    })),
  };
}

export function sectionMorphogenesis(input: MorphogenesisInput): MorphogeneticSectionModel {
  const extracted = input.extracted;
  const grammar = ARCHETYPE_GRAMMARS[input.archetypeId];
  const doc: Doc = {
    width: extracted.width,
    height: extracted.height,
    occupancySize: extracted.occupancySize,
    protectedVoid: extracted.protectedVoid.slice(),
    members: ingest(extracted),
    operations: [],
    reasons: [],
    failed: false,
  };
  if (!grammar) fail(doc, `no grammar for ${input.archetypeId}`);
  else specialize(input.archetypeId, doc, input.morphology);

  const primitives: MorphogeneticMember[] = doc.members.map((m) => ({
    id: m.id,
    kind: m.kind,
    evidence: m.evidence,
    polyline: m.polyline,
    radius: m.radius,
    concentrationIndex: m.concentrationIndex,
    cells: m.cells,
    sourceIds: m.sourceIds,
    operations: m.operations,
  }));

  if (doc.failed && !doc.reasons.length) doc.reasons.push("insufficient biological evidence");

  return {
    orientation: extracted.orientation,
    width: extracted.width,
    height: extracted.height,
    occupancySize: extracted.occupancySize,
    protectedVoid: doc.protectedVoid,
    primitives,
    status: doc.failed ? "insufficient-evidence" : "formed",
    reasons: doc.reasons,
    operations: doc.operations,
    extractedPrimitiveCount: extracted.primitives.length,
    grammarId: input.archetypeId,
  };
}

export function assertGrammarComplete(ids: string[]) {
  for (const id of ids) {
    if (!ARCHETYPE_GRAMMARS[id]) throw new Error(`missing grammar ${id}`);
  }
}
