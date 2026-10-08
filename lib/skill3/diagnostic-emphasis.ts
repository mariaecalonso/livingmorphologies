import type { ArchitecturalIntentProfile } from "../architectural-intent";
import { BRANCHES } from "../catalog";
import { HAIR_CAP } from "../skill1/hair-ink";
import type { SimulationState } from "../skill1/types";
import { emphasisSchedule, modulateEmphasis, type EmphasisSchedule } from "./continuation-recipes";
import type { ContinuationTransform } from "./events";

/**
 * Diagnostic F+S+A continuation. Baseline ratings stay on, and the integrated
 * schedule modulates all three around that baseline. This is not the 24-branch
 * catalogue. It does not lock openings, components, or voids.
 */
const COARSE = 64;

function unit(profile: ArchitecturalIntentProfile, branch: "formal" | "spatial" | "atmospheric", id: string) {
  const found = profile[branch].criteria.find((item) => item.id === id);
  if (!found) throw new Error(`architectural intent is missing ${branch}.${id}`);
  return found.rating / 2;
}

/** Third criterion of a family. Lobby, Workspace, and Gathering each author a different id. */
function typologyCriterionId(profile: ArchitecturalIntentProfile, branchId: "formal" | "spatial" | "atmospheric") {
  const branch = BRANCHES.find((item) => item.id === branchId);
  const criterion = branch?.specific[profile.typologyId];
  if (!criterion) throw new Error(`architectural intent is missing ${branchId} typology criterion for ${profile.typologyId}`);
  return criterion.id;
}

function lerpAngle(a: number, b: number, t: number) {
  let delta = b - a;
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta < -Math.PI) delta += Math.PI * 2;
  return a + delta * t;
}

function varies(targets: readonly number[]) {
  return Math.max(...targets) - Math.min(...targets) > 0.2;
}

function blendHeading(heading: number, target: number, weight: number) {
  let delta = target - heading;
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta < -Math.PI) delta += Math.PI * 2;
  return heading + delta * weight;
}

type Shape = { cx: number; cy: number; n: number; radius: number; axis: number };

export type Z0Development = {
  /** Z0-empty interior pixels that are still empty. */
  open(trails: ArrayLike<number>): number;
  /** Direction, in degrees, of trail that was empty at Z0. Null when nothing has been added. */
  growthDirection(trails: ArrayLike<number>): number | null;
};

export function createIntegratedEmphasis(
  parent: SimulationState,
  profile: ArchitecturalIntentProfile,
  schedule: EmphasisSchedule = emphasisSchedule("formal+spatial+atmospheric", 0),
): {
  transform: ContinuationTransform;
  development: Z0Development;
} {
  const complexity = unit(profile, "formal", "complexity");
  const proportionality = unit(profile, "formal", "proportionality");
  const formalSpecific = unit(profile, "formal", typologyCriterionId(profile, "formal"));
  const openness = unit(profile, "spatial", "openness");
  const connectivity = unit(profile, "spatial", "connectivity");
  const spatialSpecific = unit(profile, "spatial", typologyCriterionId(profile, "spatial"));
  const immersive = unit(profile, "atmospheric", "immersive");
  const atmosphericSpecific = unit(profile, "atmospheric", typologyCriterionId(profile, "atmospheric"));
  const formalBlend = complexity * (0.26 + 0.4 * proportionality);
  const formalCore = 0.32 + 0.24 * formalSpecific;
  const spatialBlend = 0.22 + 0.46 * connectivity * (0.65 + 0.35 * spatialSpecific);
  const spatialGain = 1 + 0.55 * openness;
  const protectBlend = 0.3 + 0.4 * immersive;
  const redirectShare = 0.55 + 0.45 * atmosphericSpecific;
  const z0Iteration = parent.iteration;
  const z0Trails = parent.trails;
  const cell = parent.size / COARSE;

  const coarseOf = (trails: ArrayLike<number>) => {
    const values = new Float32Array(COARSE * COARSE);
    const scale = parent.trailSize / COARSE;
    for (let y = 0; y < COARSE; y += 1) {
      const y0 = Math.floor(y * scale);
      const y1 = Math.min(parent.trailSize, Math.floor((y + 1) * scale));
      for (let x = 0; x < COARSE; x += 1) {
        const x0 = Math.floor(x * scale);
        const x1 = Math.min(parent.trailSize, Math.floor((x + 1) * scale));
        let sum = 0;
        let count = 0;
        for (let yy = y0; yy < y1; yy += 4) {
          const row = yy * parent.trailSize;
          for (let xx = x0; xx < x1; xx += 4) {
            sum += trails[row + xx];
            count += 1;
          }
        }
        values[y * COARSE + x] = count ? sum / count : 0;
      }
    }
    return values;
  };

  const shapeOf = (mask: Uint8Array): Shape => {
    let n = 0;
    let sx = 0;
    let sy = 0;
    for (let y = 0; y < COARSE; y += 1) {
      for (let x = 0; x < COARSE; x += 1) {
        if (!mask[y * COARSE + x]) continue;
        n += 1;
        sx += (x + 0.5) * cell;
        sy += (y + 0.5) * cell;
      }
    }
    const cx = sx / Math.max(1, n);
    const cy = sy / Math.max(1, n);
    let sxx = 0;
    let syy = 0;
    let sxy = 0;
    let r2 = 0;
    for (let y = 0; y < COARSE; y += 1) {
      for (let x = 0; x < COARSE; x += 1) {
        if (!mask[y * COARSE + x]) continue;
        const dx = (x + 0.5) * cell - cx;
        const dy = (y + 0.5) * cell - cy;
        sxx += dx * dx;
        syy += dy * dy;
        sxy += dx * dy;
        r2 += dx * dx + dy * dy;
      }
    }
    return { cx, cy, n, radius: Math.sqrt(r2 / Math.max(1, n)), axis: 0.5 * Math.atan2(2 * sxy, sxx - syy) };
  };

  const z0Field = coarseOf(z0Trails);
  const occupied = new Uint8Array(COARSE * COARSE);
  for (let i = 0; i < z0Field.length; i += 1) if (z0Field[i] > 0.008) occupied[i] = 1;
  const body = shapeOf(occupied);
  const seal = new Uint8Array(occupied);
  for (let y = 3; y < COARSE - 3; y += 1) {
    for (let x = 3; x < COARSE - 3; x += 1) {
      if (!occupied[y * COARSE + x]) continue;
      seal[y * COARSE + x - 1] = 1;
      seal[y * COARSE + x + 1] = 1;
      seal[(y - 1) * COARSE + x] = 1;
      seal[(y + 1) * COARSE + x] = 1;
    }
  }
  const exterior = new Uint8Array(COARSE * COARSE);
  const flood: number[] = [];
  const push = (index: number) => {
    if (index < 0 || index >= seal.length || seal[index] || exterior[index]) return;
    exterior[index] = 1;
    flood.push(index);
  };
  for (let i = 0; i < COARSE; i += 1) {
    push(i);
    push((COARSE - 1) * COARSE + i);
    push(i * COARSE);
    push(i * COARSE + COARSE - 1);
  }
  while (flood.length) {
    const current = flood.pop() as number;
    const x = current % COARSE;
    const y = Math.floor(current / COARSE);
    if (x > 0) push(current - 1);
    if (x + 1 < COARSE) push(current + 1);
    if (y > 0) push(current - COARSE);
    if (y + 1 < COARSE) push(current + COARSE);
  }
  const interior = new Uint8Array(COARSE * COARSE);
  for (let i = 0; i < interior.length; i += 1) if (!occupied[i] && !exterior[i]) interior[i] = 1;
  const hole = shapeOf(interior);

  const openEnd = (angle: number) => {
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    let best = angle;
    let reach = Infinity;
    for (const sign of [1, -1]) {
      for (let step = 1; step <= 28; step += 1) {
        const x = body.cx + dx * sign * step * cell;
        const y = body.cy + dy * sign * step * cell;
        const outside = x < 0 || y < 0 || x >= parent.size || y >= parent.size
          || exterior[Math.min(COARSE - 1, Math.max(0, Math.floor(y / cell))) * COARSE + Math.min(COARSE - 1, Math.max(0, Math.floor(x / cell)))];
        if (!outside) continue;
        if (step < reach) {
          reach = step;
          best = Math.atan2(dy * sign, dx * sign);
        }
        break;
      }
    }
    return best;
  };
  const spatialAxes = [openEnd(body.axis), openEnd(body.axis + Math.PI / 2)];
  const visualAxis = hole.n > 12 ? hole.axis : body.axis;
  const spatialFocus = varies(schedule.spatial);
  const atmosFocus = varies(schedule.atmospheric);

  const coarseIndex = (trailIndex: number) => {
    const x = trailIndex % parent.trailSize;
    const y = Math.floor(trailIndex / parent.trailSize);
    return Math.min(COARSE - 1, Math.floor((y * COARSE) / parent.trailSize)) * COARSE
      + Math.min(COARSE - 1, Math.floor((x * COARSE) / parent.trailSize));
  };
  const trailAt = (state: SimulationState, x: number, y: number) => {
    const scale = state.trailSize / state.size;
    const ix = Math.max(0, Math.min(state.trailSize - 1, Math.floor(x * scale)));
    const iy = Math.max(0, Math.min(state.trailSize - 1, Math.floor(y * scale)));
    return state.trails[iy * state.trailSize + ix];
  };

  const development: Z0Development = {
    open(trails) {
      let open = 0;
      for (let i = 0; i < trails.length; i += 1) {
        if (!interior[coarseIndex(i)] || z0Trails[i] > 0.008) continue;
        if (trails[i] <= 0.008) open += 1;
      }
      return open;
    },
    growthDirection(trails) {
      let added = 0;
      let sgx = 0;
      let sgy = 0;
      const side = parent.trailSize;
      for (let i = 0; i < trails.length; i += 1) {
        if (z0Trails[i] > 0.003 || trails[i] <= 0.003) continue;
        added += 1;
        sgx += i % side;
        sgy += Math.floor(i / side);
      }
      if (!added) return null;
      const scale = parent.size / side;
      const gx = (sgx / added) * scale;
      const gy = (sgy / added) * scale;
      return (Math.atan2(gy - body.cy, gx - body.cx) * 180) / Math.PI;
    },
  };

  const transform: ContinuationTransform = (state) => {
    const offset = state.iteration - z0Iteration;
    const mF = modulateEmphasis(offset, schedule.formal);
    const mS = modulateEmphasis(offset, schedule.spatial);
    const mA = modulateEmphasis(offset, schedule.atmospheric);
    const t = offset / 64;
    const spatialAngle = lerpAngle(
      spatialAxes[0],
      spatialAxes[1],
      spatialFocus ? 0.5 - 0.5 * Math.cos(Math.PI * 2 * t) : 0.12 * Math.sin(Math.PI * 2 * t),
    );
    const flank = visualAxis + (atmosFocus ? 0.5 - 0.5 * Math.cos(Math.PI * 2 * t) : 0.15 * Math.sin(Math.PI * 2 * t)) * (Math.PI / 2) + Math.PI / 2;
    const sFloor = 0.016 - Math.min(1, Math.max(0, (mS - 0.75) / 0.75)) * 0.013;
    const gain = 1 + (spatialGain - 1) * 0.35 * mS;
    const redirect = Math.min(0.9, redirectShare * 0.55 * mA);
    const field = coarseOf(state.trails);
    for (const agent of state.agents) {
      const here = trailAt(state, agent.x, agent.y);
      let vx = 0;
      let vy = 0;
      let weight = 0;
      const dx = agent.x - body.cx;
      const dy = agent.y - body.cy;
      const dist = Math.hypot(dx, dy) || 1e-6;
      if (dist > body.radius * formalCore && here > 0.004 && here < 0.05) {
        const radial = Math.atan2(dy, dx);
        const w = formalBlend * mF;
        vx += Math.cos(radial + Math.PI / 2) * w;
        vy += Math.sin(radial + Math.PI / 2) * w;
        weight += w;
      }
      if (here > sFloor) {
        const w = spatialBlend * 0.72 * mS;
        vx += Math.cos(spatialAngle) * w;
        vy += Math.sin(spatialAngle) * w;
        weight += w;
      }
      const gx = Math.max(0, Math.min(COARSE - 1, Math.floor(agent.x / cell)));
      const gy = Math.max(0, Math.min(COARSE - 1, Math.floor(agent.y / cell)));
      const bin = gy * COARSE + gx;
      if (interior[bin] || (field[bin] < 0.012 && Math.hypot((gx + 0.5) * cell - hole.cx, (gy + 0.5) * cell - hole.cy) < hole.radius)) {
        const aim = Math.atan2(hole.cy - agent.y, hole.cx - agent.x) + Math.PI;
        const side = Math.abs(aim - flank) < 1 ? flank : aim;
        const w = protectBlend * 0.55 * mA;
        vx += Math.cos(side) * w;
        vy += Math.sin(side) * w;
        weight += w;
      }
      if (weight <= 0.08) continue;
      agent.heading = blendHeading(agent.heading, Math.atan2(vy, vx), Math.min(0.62, weight));
      agent.hold = 1;
    }
    const dx = Math.cos(spatialAngle);
    const dy = Math.sin(spatialAngle);
    const px = -dy;
    const py = dx;
    const half = 1.5 + 1.6 * connectivity;
    for (let i = 0; i < state.trails.length; i += 1) {
      const floor = z0Trails[i];
      if (state.trails[i] <= floor) continue;
      const x = ((i % parent.trailSize) + 0.5) * parent.size / parent.trailSize;
      const y = (Math.floor(i / parent.trailSize) + 0.5) * parent.size / parent.trailSize;
      const along = (x - body.cx) * dx + (y - body.cy) * dy;
      const across = Math.abs((x - body.cx) * px + (y - body.cy) * py);
      if (along <= 0.4 || across > half) continue;
      state.trails[i] = Math.min(HAIR_CAP, floor + (state.trails[i] - floor) * gain);
    }
    const occupiedNow = new Uint8Array(COARSE * COARSE);
    const nowField = coarseOf(state.trails);
    for (let i = 0; i < nowField.length; i += 1) if (nowField[i] > 0.02) occupiedNow[i] = 1;
    const target = new Int16Array(COARSE * COARSE);
    target.fill(-1);
    for (let y = 0; y < COARSE; y += 1) {
      for (let x = 0; x < COARSE; x += 1) {
        const index = y * COARSE + x;
        if (!interior[index]) continue;
        let best = 999;
        let at = -1;
        for (let oy = -8; oy <= 8; oy += 1) {
          for (let ox = -8; ox <= 8; ox += 1) {
            const nx = x + ox;
            const ny = y + oy;
            if (nx < 0 || ny < 0 || nx >= COARSE || ny >= COARSE) continue;
            const next = ny * COARSE + nx;
            if (!occupiedNow[next] || interior[next]) continue;
            const ang = Math.atan2((ny + 0.5) * cell - hole.cy, (nx + 0.5) * cell - hole.cx);
            let delta = ang - flank;
            while (delta > Math.PI) delta -= Math.PI * 2;
            while (delta < -Math.PI) delta += Math.PI * 2;
            const score = ox * ox + oy * oy + Math.abs(delta) * 6;
            if (score < best) {
              best = score;
              at = next;
            }
          }
        }
        target[index] = at;
      }
    }
    const extra = new Float64Array(COARSE * COARSE);
    for (let i = 0; i < state.trails.length; i += 1) {
      const bin = coarseIndex(i);
      if (!interior[bin] || state.trails[i] <= z0Trails[i]) continue;
      const to = target[bin];
      if (to < 0) continue;
      const excess = (state.trails[i] - z0Trails[i]) * redirect;
      state.trails[i] -= excess;
      extra[to] += excess;
    }
    const block = parent.trailSize / COARSE;
    for (let bin = 0; bin < extra.length; bin += 1) {
      if (extra[bin] <= 0) continue;
      const x0 = (bin % COARSE) * block;
      const y0 = Math.floor(bin / COARSE) * block;
      const share = extra[bin] / (block * block);
      for (let y = 0; y < block; y += 1) {
        for (let x = 0; x < block; x += 1) {
          const index = (y0 + y) * parent.trailSize + x0 + x;
          state.trails[index] = Math.min(HAIR_CAP, state.trails[index] + share);
        }
      }
    }
  };

  return { transform, development };
}
