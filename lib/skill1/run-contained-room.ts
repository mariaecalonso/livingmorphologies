/**
 * Contained Room Within Volume.
 * Magnetic Enclosed Core · Isolated Attractor · Immersive Core.
 *
 * An organic volume sits in the section. Inside it, a smaller chamber is
 * enclosed by a thicker Physarum wall and still has an interior. The black
 * ground around the volume is outside the architecture. The core is not a void.
 */

import { mulberry32 } from "../physarum";
import { FIELD_SIZE, MIN_AGENT_COUNT } from "./maps";
import type { SlimeControls } from "./slime-controls";
import type { BiologicalParams, FieldAttractor, SpatialRecipe } from "./types";

export const CONTAINED_ROOM_ID = "contained-room-within-volume";
export const CONTAINED_GENERATION = "volume-room-2";
export const CONTAINED_RUN_ITERATIONS = 280;
export const CONTAINED_TRAIL_SCALE = 16;
export const CONTAINED_STEP_BUDGET_MS = 16000;

const TWO_PI = Math.PI * 2;
const LO = 0.45;
const HI = FIELD_SIZE - 0.45;

type Rng = () => number;

export const CONTAINED_FAMILIES = [
  "nested",
  "offset",
  "pressed",
  "long-hall",
  "long-room",
  "lobed",
  "wrapped",
  "approach",
  "split",
  "pockets",
] as const;

export type ContainedRoomKind = (typeof CONTAINED_FAMILIES)[number];
export type ContainedRoomGrowth = "mesh" | "vein" | "braid" | "mass";
export const CONTAINED_GROWTHS: ContainedRoomGrowth[] = ["mesh", "vein", "braid", "mass"];

export type ContainedRoomPlan = {
  kind: ContainedRoomKind;
  growth: ContainedRoomGrowth;
  index: number;
  cycle: number;
  turn: number;
  driftX: number;
  driftY: number;
  roomU: number;
  roomV: number;
  openings: 0 | 1 | 2;
};

type Role = "core" | "wall" | "interior" | "volume" | "skin" | "path";

type Blob = {
  x: number;
  y: number;
  base: number;
  elong: number;
  rot: number;
  lobes: number;
  notch: number;
  notchAt: number;
  phase: number;
};

type Mark = { x: number; y: number; role: Role };

type Built = {
  kind: ContainedRoomKind;
  cycle: number;
  turn: number;
  room: Blob;
  volume: Blob;
  mouths: number;
  marks: Mark[];
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

function angDiff(a: number, b: number) {
  return Math.atan2(Math.sin(a - b), Math.cos(a - b));
}

function radiusAt(blob: Blob, angle: number) {
  const a = angle - blob.rot;
  const ellipse = blob.base / Math.hypot(Math.cos(a), Math.sin(a) / blob.elong);
  const lobe = 1 + blob.lobes * Math.cos(3 * a + blob.phase);
  const wobble = 1 + 0.07 * Math.sin(2 * a + blob.phase) + 0.04 * Math.sin(5 * a + 0.8);
  const bite = 1 - blob.notch * Math.exp(-(angDiff(angle, blob.notchAt) ** 2) / 0.22);
  return ellipse * Math.max(0.64, lobe) * wobble * bite;
}

function inside(blob: Blob, x: number, y: number, pad: number) {
  const angle = Math.atan2(y - blob.y, x - blob.x);
  return Math.hypot(x - blob.x, y - blob.y) < radiusAt(blob, angle) - pad;
}

function pointAt(blob: Blob, angle: number, scale: number) {
  const dist = radiusAt(blob, angle) * scale;
  return { x: blob.x + Math.cos(angle) * dist, y: blob.y + Math.sin(angle) * dist };
}

function fits(room: Blob, volume: Blob, pad: number) {
  if (!inside(volume, room.x, room.y, pad)) return false;
  for (let i = 0; i < 20; i += 1) {
    const angle = (i / 20) * TWO_PI;
    const dist = radiusAt(room, angle) + pad;
    const x = room.x + Math.cos(angle) * dist;
    const y = room.y + Math.sin(angle) * dist;
    if (!inside(volume, x, y, 0.15)) return false;
  }
  return true;
}

function settle(room: Blob, volume: Blob) {
  let guard = 0;
  while (!fits(room, volume, 0.4) && guard < 12) {
    guard += 1;
    room.base *= 0.93;
    if (guard > 5) {
      room.x = volume.x + (room.x - volume.x) * 0.88;
      room.y = volume.y + (room.y - volume.y) * 0.88;
    }
  }
}

function longAxis(blob: Blob) {
  return blob.rot + Math.PI / 2;
}

function blob(partial: Partial<Blob> & Pick<Blob, "x" | "y" | "base">): Blob {
  return {
    elong: 1,
    rot: 0,
    lobes: 0.08,
    notch: 0,
    notchAt: 0,
    phase: 0,
    ...partial,
  };
}

function layout(index: number): {
  kind: ContainedRoomKind;
  cycle: number;
  volume: Blob;
  rooms: Blob[];
  mouths: number[];
  fill: "solid" | "shell" | "arms";
  extras: Blob[];
} {
  const kind = CONTAINED_FAMILIES[index % CONTAINED_FAMILIES.length];
  const cycle = Math.floor(index / CONTAINED_FAMILIES.length);
  const rng = mulberry32((0xc0a1ed ^ (index + 1) * 0x9e3779b1) >>> 0);
  const phase = rng() * TWO_PI;
  const end = cycle % 2 === 0 ? 1 : -1;
  const aim = cycle * (TWO_PI / 5);
  const mouths: number[] = [];
  const extras: Blob[] = [];
  let fill: "solid" | "shell" | "arms" = "solid";
  let volume = blob({ x: 10, y: 10, base: 7.2, rot: aim, phase });
  let room = blob({ x: 10, y: 10, base: 2.2, rot: aim + 0.6, phase });

  if (kind === "nested") {
    const roomBase = [1.55, 2.15, 2.85, 3.45][cycle % 4];
    volume = blob({
      x: 10 + Math.cos(aim) * 0.8,
      y: 10 + Math.sin(aim) * 0.7,
      base: 7.2 + (cycle % 3) * 0.35,
      rot: aim,
      phase,
      elong: 1.05 + (cycle % 3) * 0.18,
      lobes: 0.12,
    });
    room = blob({
      x: volume.x,
      y: volume.y,
      base: roomBase,
      rot: aim + 0.8,
      phase,
      elong: 1.08,
      lobes: 0.16,
    });
  } else if (kind === "offset") {
    volume = blob({
      x: 10,
      y: 10,
      base: 8,
      rot: aim,
      phase,
      elong: 1.35,
      lobes: 0.1,
    });
    const dist = cycle % 2 === 0 ? 4.15 : 3.15;
    room = blob({
      x: volume.x + Math.cos(aim) * dist,
      y: volume.y + Math.sin(aim) * dist,
      base: 2.15 + (cycle % 3) * 0.2,
      rot: aim,
      phase,
      elong: 1.25,
      lobes: 0.18,
    });
  } else if (kind === "pressed") {
    volume = blob({
      x: 10,
      y: 10,
      base: 7.4,
      rot: aim,
      phase,
      elong: 1.4,
      lobes: 0.14,
      notch: 0.48,
      notchAt: aim,
    });
    room = blob({
      x: volume.x - Math.cos(aim) * 2.7,
      y: volume.y - Math.sin(aim) * 2.7,
      base: 2.55,
      rot: aim + Math.PI / 2,
      phase,
      elong: 1.35,
      lobes: 0.2,
    });
  } else if (kind === "long-hall") {
    const axis = cycle % 3;
    const rot = axis === 0 ? Math.PI / 2 : axis === 1 ? 0 : Math.PI / 4;
    const slot = Math.floor(cycle / 3);
    volume = blob({
      x: axis === 1 ? 5.6 + slot * 2.6 : 10,
      y: axis === 0 ? 5.6 + slot * 2.6 : 10,
      base: 2.85,
      elong: 3.05,
      rot,
      phase,
      lobes: 0.06,
    });
    const long = longAxis(volume);
    const along = end * radiusAt(volume, long) * 0.58;
    room = blob({
      x: volume.x + Math.cos(long) * along,
      y: volume.y + Math.sin(long) * along,
      base: 1.55,
      rot,
      phase,
      elong: 1.2,
      lobes: 0.1,
    });
  } else if (kind === "long-room") {
    const rot = cycle % 2 === 0 ? Math.PI / 2 : cycle % 3 === 0 ? Math.PI / 5 : 0;
    volume = blob({
      x: 10,
      y: rot === 0 ? 6.2 + (cycle % 4) * 2.2 : 10,
      base: 4.6,
      elong: 1.85,
      rot,
      phase,
      lobes: 0.1,
    });
    room = blob({
      x: volume.x,
      y: volume.y,
      base: 1.65,
      elong: 2.7,
      rot,
      phase,
      lobes: 0.08,
    });
  } else if (kind === "lobed") {
    volume = blob({
      x: 9.2 + (cycle % 3) * 0.8,
      y: 9.4 + ((cycle * 2) % 3) * 0.7,
      base: 6.9,
      rot: aim,
      phase,
      elong: 1.12,
      lobes: 0.16,
    });
    room = blob({
      x: volume.x,
      y: volume.y,
      base: 3.05 + (cycle % 3) * 0.15,
      rot: aim + cycle * 0.35,
      phase,
      elong: 1.05,
      lobes: 0.68,
    });
  } else if (kind === "wrapped") {
    volume = blob({
      x: 10 + Math.cos(aim) * 0.6,
      y: 10 + Math.sin(aim) * 0.5,
      base: 7.7,
      rot: aim,
      phase,
      elong: 1.05 + (cycle % 2) * 0.2,
      lobes: 0.1,
    });
    room = blob({
      x: volume.x + Math.cos(aim) * (cycle % 2) * 1.1,
      y: volume.y + Math.sin(aim) * (cycle % 2) * 1.1,
      base: 1.9 + (cycle % 3) * 0.15,
      rot: aim + 1.2,
      phase,
      elong: 1.3,
      lobes: 0.18,
    });
    fill = "shell";
  } else if (kind === "approach") {
    volume = blob({
      x: 10 - Math.cos(aim) * 1.4,
      y: 10 - Math.sin(aim) * 1.4,
      base: 5.4,
      rot: aim,
      phase,
      elong: 1.15,
      lobes: 0.12,
    });
    room = blob({
      x: volume.x - Math.cos(aim) * 0.8,
      y: volume.y - Math.sin(aim) * 0.8,
      base: 2.25,
      rot: aim,
      phase,
      elong: 1.15,
      lobes: 0.14,
    });
    extras.push(blob({
      x: volume.x + Math.cos(aim) * 4.6,
      y: volume.y + Math.sin(aim) * 4.6,
      base: 1.45,
      elong: 2.5,
      rot: aim + Math.PI / 2,
      phase,
      lobes: 0.05,
    }));
    mouths.push(aim);
    fill = "arms";
  } else if (kind === "split") {
    volume = blob({ x: 10, y: 10, base: 4.7, rot: aim, phase, elong: 1.15, lobes: 0.1 });
    room = blob({
      x: 10,
      y: 10,
      base: 2.15,
      rot: aim + Math.PI / 2,
      phase,
      elong: 1.35,
      lobes: 0.12,
    });
    for (const sign of [-1, 1]) {
      const ang = aim + sign * 0.15;
      extras.push(blob({
        x: 10 + Math.cos(ang) * sign * 4.8,
        y: 10 + Math.sin(ang) * sign * 4.8,
        base: 1.4,
        elong: 2.4,
        rot: ang + Math.PI / 2,
        phase,
        lobes: 0.05,
      }));
      mouths.push(sign > 0 ? ang : ang + Math.PI);
    }
    fill = "arms";
  } else {
    const rot = cycle % 2 === 0 ? Math.PI / 2 : Math.PI / 6;
    volume = blob({ x: 10, y: 10, base: 3.9, elong: 2.45, rot, phase, lobes: 0.08 });
    const long = longAxis(volume);
    room = blob({
      x: volume.x + Math.cos(long) * end * 1.2,
      y: volume.y + Math.sin(long) * end * 1.2,
      base: 2.15,
      rot,
      phase,
      elong: 1.15,
      lobes: 0.16,
    });
    for (const sign of [-1, 1]) {
      const pod = blob({
        x: volume.x + Math.cos(long) * sign * 6.2,
        y: volume.y + Math.sin(long) * sign * 6.2,
        base: 1.7,
        rot,
        phase,
        elong: 1.15,
        lobes: 0.12,
      });
      extras.push(pod);
    }
  }

  settle(room, volume);
  const rooms = [room];
  if (kind === "pockets") {
    for (const pod of extras) {
      settle(pod, volume);
      const clash = rooms.some((other) => Math.hypot(other.x - pod.x, other.y - pod.y) < other.base + pod.base + 1.4);
      if (!clash) rooms.push(pod);
    }
    extras.length = 0;
  }
  return { kind, cycle, volume, rooms, mouths, fill, extras };
}

function tooClose(marks: Mark[], x: number, y: number, gap: number) {
  return marks.some((mark) => mark.role !== "core" && Math.hypot(mark.x - x, mark.y - y) < gap);
}

function push(marks: Mark[], x: number, y: number, role: Role, gap: number) {
  if (x < LO || y < LO || x > HI || y > HI) return;
  if (tooClose(marks, x, y, gap)) return;
  marks.push({ x, y, role });
}

function wall(marks: Mark[], room: Blob, layers: number, mouths: number[], gapAngle: number, rng: Rng) {
  for (let layer = 0; layer < layers; layer += 1) {
    const count = Math.max(16, Math.round((room.base + layer * 0.4) * 3.4));
    for (let i = 0; i < count; i += 1) {
      const angle = room.rot + (i / count) * TWO_PI + (rng() - 0.5) * 0.18;
      if (mouths.some((mouth) => Math.abs(angDiff(angle, mouth)) < gapAngle) && layer === 0) continue;
      const scale = 1 + (0.08 + layer * 0.16) + (rng() - 0.5) * 0.08;
      const at = pointAt(room, angle, scale);
      push(marks, at.x, at.y, "wall", 0.42);
    }
  }
}

function interior(marks: Mark[], room: Blob, count: number, rng: Rng) {
  let guard = 0;
  let added = 0;
  while (added < count && guard < count * 40) {
    guard += 1;
    const angle = rng() * TWO_PI;
    const scale = 0.08 + rng() * 0.78;
    const at = pointAt(room, angle, scale);
    if (!inside(room, at.x, at.y, 0.15)) continue;
    const before = marks.length;
    push(marks, at.x, at.y, "interior", 0.95);
    if (marks.length > before) added += 1;
  }
}

function scatterVolume(marks: Mark[], volume: Blob, rooms: Blob[], count: number, gap: number, rng: Rng, band?: [number, number]) {
  let guard = 0;
  let added = 0;
  while (added < count && guard < count * 50) {
    guard += 1;
    const angle = rng() * TWO_PI;
    const scale = band ? band[0] + rng() * (band[1] - band[0]) : 0.2 + rng() * 0.78;
    const at = pointAt(volume, angle, scale);
    if (!inside(volume, at.x, at.y, 0.2)) continue;
    if (rooms.some((room) => inside(room, at.x, at.y, -0.35))) continue;
    const before = marks.length;
    push(marks, at.x, at.y, "volume", gap);
    if (marks.length > before) added += 1;
  }
}

function skin(marks: Mark[], volume: Blob, rng: Rng) {
  const count = 34;
  for (let i = 0; i < count; i += 1) {
    if (rng() < 0.22) continue;
    const angle = (i / count) * TWO_PI + (rng() - 0.5) * 0.2;
    const at = pointAt(volume, angle, 0.9 + rng() * 0.08);
    push(marks, at.x, at.y, "skin", 0.7);
  }
}

function bundle(marks: Mark[], volume: Blob, room: Blob, mouth: number, rng: Rng) {
  const strands = 3;
  for (let strand = 0; strand < strands; strand += 1) {
    const offset = (strand - 1) * 0.28;
    for (let step = 0; step < 8; step += 1) {
      const t = step / 7;
      const angle = mouth + offset * (1 - t) + (rng() - 0.5) * 0.08;
      const outer = pointAt(volume, angle, 0.9);
      const inner = pointAt(room, angle, 1.05);
      const x = outer.x + (inner.x - outer.x) * t + (rng() - 0.5) * 0.18;
      const y = outer.y + (inner.y - outer.y) * t + (rng() - 0.5) * 0.18;
      if (inside(room, x, y, 0.05)) continue;
      push(marks, x, y, "path", 0.38);
    }
  }
}

function arcs(marks: Mark[], volume: Blob, room: Blob, rng: Rng) {
  const loops = 2 + Math.floor(rng() * 2);
  for (let loop = 0; loop < loops; loop += 1) {
    const start = rng() * TWO_PI;
    const sweep = 1.6 + rng() * 1.4;
    const steps = 14;
    for (let i = 0; i < steps; i += 1) {
      const angle = start + (i / steps) * sweep;
      const at = pointAt(volume, angle, 0.58 + loop * 0.08);
      if (inside(room, at.x, at.y, -0.2)) continue;
      if (!inside(volume, at.x, at.y, 0.3)) continue;
      push(marks, at.x, at.y, "path", 0.4);
    }
  }
}

function build(index: number): Built {
  const { kind, cycle, volume, rooms, mouths, fill, extras } = layout(index);
  const rng = mulberry32((0x51ed ^ (index + 3) * 0x85ebca6b) >>> 0);
  const room = rooms[0];
  const marks: Mark[] = [{ x: room.x, y: room.y, role: "core" }];
  const gap = mouths.length ? 0.7 : 0;
  wall(marks, room, kind === "wrapped" || kind === "nested" ? 3 : 2, mouths, gap, rng);
  interior(marks, room, Math.round(10 + room.base * 2.4), rng);
  for (const pod of rooms.slice(1)) {
    wall(marks, pod, 2, [], 0, rng);
    interior(marks, pod, Math.round(6 + pod.base * 2), rng);
  }
  if (fill === "shell") {
    arcs(marks, volume, room, rng);
    scatterVolume(marks, volume, rooms, 44, 1.15, rng, [0.8, 0.98]);
  } else if (fill === "arms") {
    for (const mouth of mouths) bundle(marks, volume, room, mouth, rng);
    scatterVolume(marks, volume, rooms, 32, 1.25, rng);
    for (const extra of extras) scatterVolume(marks, extra, rooms, 22, 1.05, rng);
  } else if (kind === "long-hall") {
    scatterVolume(marks, volume, rooms, 48, 1.05, rng);
  } else {
    scatterVolume(marks, volume, rooms, 56, 1.28, rng);
  }
  skin(marks, volume, rng);
  return { kind, cycle, turn: volume.rot, room, volume, mouths: mouths.length, marks };
}

const STRENGTH: Record<Role, number> = {
  core: 0,
  wall: 0.9,
  interior: 0.42,
  volume: 0.5,
  skin: 0.58,
  path: 0.72,
};

export function planContainedRoom(seed: number, attempt = 0, index = 0): ContainedRoomPlan {
  const built = build(index);
  const rng = mulberry32(seed ^ 0xc0a1ed ^ (attempt * 0x27d4eb2d) ^ (index * 0x9e3779b9));
  return {
    kind: built.kind,
    growth: CONTAINED_GROWTHS[(built.cycle + attempt) % CONTAINED_GROWTHS.length],
    index,
    cycle: built.cycle,
    turn: built.turn,
    driftX: (rng() - 0.5) * 0.08,
    driftY: (rng() - 0.5) * 0.08,
    roomU: built.room.x,
    roomV: built.room.y,
    openings: (Math.min(2, built.mouths) as 0 | 1 | 2),
  };
}

export function attractorsFromContainedRoom(plan: ContainedRoomPlan): FieldAttractor[] {
  return build(plan.index).marks.map((mark) => ({
    kind: "point" as const,
    x: mark.x,
    y: mark.y,
    radius: mark.role === "wall" ? 0.7 : mark.role === "interior" ? 0.9 : 1.35,
    strength: STRENGTH[mark.role],
  }));
}

const GROWTH_SLIME: Record<ContainedRoomGrowth, Partial<SlimeControls>> = {
  mesh: { persistence: 0.62, trailInfluence: 1.05, deposit: 0.042, randomness: 0.08, sensorAngle: 0.2, stepSize: 0.16, crowdingLimit: 12 },
  vein: { persistence: 0.82, trailInfluence: 1.25, deposit: 0.046, randomness: 0.04, sensorAngle: 0.08, stepSize: 0.16, crowdingLimit: 16 },
  braid: { persistence: 0.72, trailInfluence: 1.15, deposit: 0.044, randomness: 0.06, sensorAngle: 0.12, stepSize: 0.16, crowdingLimit: 14 },
  mass: { persistence: 0.58, trailInfluence: 0.95, deposit: 0.05, randomness: 0.1, sensorAngle: 0.22, stepSize: 0.15, crowdingLimit: 10 },
};

export function slimeFromContainedRoom(base: SlimeControls, plan: ContainedRoomPlan, seed: number): SlimeControls {
  const rng = mulberry32(seed ^ 0x51c0de ^ plan.index);
  const growth = GROWTH_SLIME[plan.growth];
  return {
    ...base,
    ...growth,
    deposit: (growth.deposit ?? 0.04) + rng() * 0.004,
    depositWidth: 0.2,
    diffusion: 0,
    decay: 0.992,
    trailCap: 0.78,
    resistance: 0,
    foodPoints: [],
    voidElongation: 1,
    voidRotation: 0,
    voidLobes: 0,
    voidNotch: 0,
  };
}

export function paramsFromContainedRoom(base: BiologicalParams, seed: number): BiologicalParams {
  const rng = mulberry32(seed ^ 0xc0a1aa);
  return {
    ...base,
    attractionStrength: 0.7 + rng() * 0.18,
    networkDensity: 0.36,
    permeability: 0.88,
    directionalBias: 0.08 + rng() * 0.08,
    geometryVariation: 0.1 + rng() * 0.06,
    nodeSpacing: 0.9,
    randomness: 0.05,
    flowCoupling: 0.22,
  };
}

export function recipeFromContainedRoom(recipe: SpatialRecipe, plan: ContainedRoomPlan): SpatialRecipe {
  const built = build(plan.index);
  return {
    ...recipe,
    clustering: 0.74,
    isolationRadius: built.room.base,
    approachWidth: built.mouths ? 1.7 : 1.15,
    coreExposure: built.mouths ? 0.48 : 0.24,
    enclosureCollar: built.room.base + 1.6,
  };
}

export function agentsFromContainedRoom(plan: ContainedRoomPlan, seed: number) {
  const rng = mulberry32(seed ^ 0xc0aa22 ^ plan.index);
  const byGrowth: Record<ContainedRoomGrowth, [number, number]> = {
    mesh: [155, 180],
    vein: [145, 170],
    braid: [160, 185],
    mass: [170, 190],
  };
  const [min, max] = byGrowth[plan.growth];
  return Math.round(Math.min(190, Math.max(MIN_AGENT_COUNT, min + rng() * (max - min))));
}
