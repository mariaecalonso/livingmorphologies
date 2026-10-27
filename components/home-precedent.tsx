"use client";

import { useEffect, useRef, useState } from "react";
import { PresentControls, usePresentClock } from "@/components/workflow-present";
import { beginWorkflowLights, WorkflowLightFilter, WorkflowPathLight } from "@/components/workflow-light";
import { WORKFLOW_TRACK_TAIL } from "@/lib/home-workflow-camera";

/** A little faster than the shared track. All three lights use this one clock. */
const ONE_WAY = 62;

const COPPER = "#c77e5f";
const WHITE = "#f4f1ec";
const TEAL = "#0f7377";
type Box = { x: number; y: number; w: number; h: number };
/**
 * Optimization frames land between 12px and 16px. 14px on this board
 * (the 7407 sheet fitted at 1681px) is 61.7 sheet units.
 * Name plates stay tighter so the short ones remain rectangles.
 */
const FRAME_R = 61.7;
const PILL_R = 24;
/** Sheet units that match the optimization type on this board: 9.5, 8.5, 8, and 6.5px. */
const TYPE_TITLE = 41.9;
const TYPE_BODY = 37.5;
const TYPE_QUESTION = 41;
const TYPE_CAPTION = 35.3;
const TYPE_PLATE = 33.6;
const TYPE_ITEM = 28;
const TYPE_NOTE = 24;

function n(value: number) {
  return Number(value.toFixed(2));
}

/** Down the left side, across the bottom, and up onto the top edge. */
function aroundBottom(box: Box, r: number) {
  const right = n(box.x + box.w);
  const bottom = n(box.y + box.h);
  const top = n(box.y);
  return `L${n(box.x)} ${n(bottom - r)} A${r} ${r} 0 0 0 ${n(box.x + r)} ${bottom} L${n(right - r)} ${bottom} A${r} ${r} 0 0 0 ${right} ${n(bottom - r)} L${right} ${n(top + r)} A${r} ${r} 0 0 0 ${n(right - r)} ${top}`;
}

function alongBottom(box: Box, r: number) {
  const right = n(box.x + box.w);
  const bottom = n(box.y + box.h);
  return `L${n(box.x)} ${n(bottom - r)} A${r} ${r} 0 0 0 ${n(box.x + r)} ${bottom} L${n(right - r)} ${bottom} A${r} ${r} 0 0 0 ${right} ${n(bottom - r)}`;
}

/** Clockwise lap of the question frame, starting and ending on the left edge at mid-height. */
function questionPerimeter(box: Box, r: number) {
  const left = n(box.x);
  const right = n(box.x + box.w);
  const top = n(box.y);
  const bottom = n(box.y + box.h);
  const mid = n(box.y + box.h / 2);
  return `L${left} ${n(bottom - r)} A${r} ${r} 0 0 0 ${n(left + r)} ${bottom} L${n(right - r)} ${bottom} A${r} ${r} 0 0 0 ${right} ${n(bottom - r)} L${right} ${n(top + r)} A${r} ${r} 0 0 0 ${n(right - r)} ${top} L${n(left + r)} ${top} A${r} ${r} 0 0 0 ${left} ${n(top + r)} L${left} ${mid}`;
}

/** Open corners on the routes use the same fillet as the frames. */
const LINE_FILLET = FRAME_R;

type Draw =
  | { kind: "M"; x: number; y: number }
  | { kind: "L"; x0: number; y0: number; x: number; y: number }
  | { kind: "A"; rx: number; ry: number; rot: number; large: number; sweep: number; x: number; y: number };

/** Round a sharp line-to-line turn. Frame arcs already in the path are left as they are. */
function fillet(d: string, radius = LINE_FILLET) {
  const tokens = d.match(/[MLA]|-?\d*\.?\d+/g) ?? [];
  const ops: Draw[] = [];
  let i = 0;
  let x = 0;
  let y = 0;
  while (i < tokens.length) {
    const t = tokens[i++];
    if (t === "M") {
      x = Number(tokens[i++]);
      y = Number(tokens[i++]);
      ops.push({ kind: "M", x, y });
    } else if (t === "L") {
      const nx = Number(tokens[i++]);
      const ny = Number(tokens[i++]);
      if (Math.hypot(nx - x, ny - y) >= 0.4) ops.push({ kind: "L", x0: x, y0: y, x: nx, y: ny });
      x = nx;
      y = ny;
    } else if (t === "A") {
      const rx = Number(tokens[i++]);
      const ry = Number(tokens[i++]);
      const rot = Number(tokens[i++]);
      const large = Number(tokens[i++]);
      const sweep = Number(tokens[i++]);
      x = Number(tokens[i++]);
      y = Number(tokens[i++]);
      ops.push({ kind: "A", rx, ry, rot, large, sweep, x, y });
    }
  }

  const trimIn = ops.map(() => 0);
  const trimOut = ops.map(() => 0);
  const arcAt = new Map<number, { r: number; sweep: number }>();

  for (let k = 0; k < ops.length - 1; k++) {
    const a = ops[k];
    const b = ops[k + 1];
    if (a.kind !== "L" || b.kind !== "L") continue;
    const len1 = Math.hypot(a.x - a.x0, a.y - a.y0);
    const len2 = Math.hypot(b.x - b.x0, b.y - b.y0);
    const d1x = (a.x - a.x0) / len1;
    const d1y = (a.y - a.y0) / len1;
    const d2x = (b.x - b.x0) / len2;
    const d2y = (b.y - b.y0) / len2;
    const dot = Math.min(1, Math.max(-1, d1x * d2x + d1y * d2y));
    const turn = Math.acos(dot);
    if (turn < 0.2) continue;
    const tanHalf = Math.tan(turn / 2);
    const budget = Math.min(len1 - trimIn[k], len2, len1 * 0.46, len2 * 0.46);
    let r = radius;
    let trim = r * tanHalf;
    if (trim > budget) {
      trim = budget;
      r = trim / tanHalf;
    }
    if (r < 12 || trim < 1) continue;
    trimOut[k] = trim;
    trimIn[k + 1] = trim;
    const cross = d1x * d2y - d1y * d2x;
    arcAt.set(k, { r, sweep: cross > 0 ? 1 : 0 });
  }

  let out = "";
  for (let k = 0; k < ops.length; k++) {
    const op = ops[k];
    if (op.kind === "M") {
      out += `M${n(op.x)} ${n(op.y)}`;
      continue;
    }
    if (op.kind === "A") {
      out += `A${n(op.rx)} ${n(op.ry)} ${op.rot} ${op.large} ${op.sweep} ${n(op.x)} ${n(op.y)}`;
      continue;
    }
    const len = Math.hypot(op.x - op.x0, op.y - op.y0);
    const dx = (op.x - op.x0) / len;
    const dy = (op.y - op.y0) / len;
    const x2 = op.x - dx * trimOut[k];
    const y2 = op.y - dy * trimOut[k];
    const x1 = op.x0 + dx * trimIn[k];
    const y1 = op.y0 + dy * trimIn[k];
    if (Math.hypot(x2 - x1, y2 - y1) > 0.2) out += `L${n(x2)} ${n(y2)}`;
    const arc = arcAt.get(k);
    if (!arc) continue;
    const next = ops[k + 1];
    if (next.kind !== "L") continue;
    const nlen = Math.hypot(next.x - next.x0, next.y - next.y0);
    const ndx = (next.x - next.x0) / nlen;
    const ndy = (next.y - next.y0) / nlen;
    out += `A${n(arc.r)} ${n(arc.r)} 0 0 ${arc.sweep} ${n(next.x0 + ndx * trimIn[k + 1])} ${n(next.y0 + ndy * trimIn[k + 1])}`;
  }
  return out;
}

/** Four stages. Decomposition and archetype analysis share one frame. */
const MAINS = [
  { title: "INITIAL PRECEDENT  —  AXEL SPRINGER", x: 80, y: 160, w: 1380, h: 1620 },
  { title: "TYPOLOGY DECOMPOSITION  +  ARCHETYPE ANALYSIS", x: 1848, y: 160, w: 2911, h: 1880 },
  { title: "CRITERIA + DESCRIPTOR DEVELOPMENT", x: 5028, y: 220, w: 1130, h: 1820 },
] as const;

/** Centers the precedent plates, and pulls the archetype row toward the family frames. */
const PRECEDENT_NUDGE = 44.13;
const ARCHETYPE_NUDGE = 200;
const ANALYSIS_SHIFT = 140;

function shiftPathX(x: number, snap: boolean) {
  if (x >= 5080) return x;
  if (x >= 2700) return n(x - ARCHETYPE_NUDGE - ANALYSIS_SHIFT);
  if (snap && x >= 2600) return n(2568 - ANALYSIS_SHIFT);
  if (x >= 2000) return n(x - ANALYSIS_SHIFT);
  return x;
}

function nudgeArchetypeRow(d: string) {
  return d
    .replace(/L(-?\d*\.?\d+) (-?\d*\.?\d+)/g, (_match, x, y) => `L${shiftPathX(Number(x), true)} ${y}`)
    .replace(/A(-?\d*\.?\d+) (-?\d*\.?\d+) (-?\d*\.?\d+) (-?\d*\.?\d+) (-?\d*\.?\d+) (-?\d*\.?\d+) (-?\d*\.?\d+)/g, (_match, rx, ry, rot, large, sweep, x, y) => `A${rx} ${ry} ${rot} ${large} ${sweep} ${shiftPathX(Number(x), false)} ${y}`);
}

const LOBBY_DECOMP = { x: 2097.64, y: 408.25, w: 493.47, h: 176.51 };
const WORK_DECOMP = { x: 2103.84, y: 933.12, w: 485.63, h: 175.38 };
const GATH_DECOMP = { x: 2101.99, y: 1512.87, w: 485.63, h: 175.38 };
function shiftAnalysis(box: Box): Box {
  return { ...box, x: n(box.x - ANALYSIS_SHIFT) };
}
const LOBBY_CRITERIA = { x: 5132, y: 378, w: 922, h: 450 };
const WORK_CRITERIA = { x: 5132, y: 918, w: 922, h: 450 };
const GATH_CRITERIA = { x: 5132, y: 1458, w: 922, h: 450 };
const IDENTITY = { x: 6311.45, y: 907.62, w: 1000, h: 480 };
const MEET_X = 6181.61;
const MEET_Y = 1147.62;

function approach(x: number, y: number) {
  return `L${n(x - 24)} ${n(y)} L${n(x)} ${n(y)}`;
}

function frameExit(box: Box, y: number) {
  return `L${n(box.x + box.w)} ${n(y)}`;
}

/** Same 90° trim fillet() uses, so the convergence corners match the other routes. */
function cornerTrim(lenA: number, lenB: number) {
  const budget = Math.min(lenA, lenB, lenA * 0.46, lenB * 0.46);
  return Math.min(FRAME_R, budget);
}

const LOBBY_EXIT_Y = 750.19;
const GATHER_EXIT_Y = 1586.46;
/** The lobby climb up the frame edge is shorter than a full corner, so the fillet is the smaller trim. */
const LOBBY_LEAVE = n(cornerTrim(LOBBY_CRITERIA.y + LOBBY_CRITERIA.h - FRAME_R - LOBBY_EXIT_Y, MEET_X - (LOBBY_CRITERIA.x + LOBBY_CRITERIA.w)));

/** Shared clock. A light that pulls ahead eases off instead of stopping, and all three still arrive together. */
const LIGHT_TIMES = "0;0.02;0.04;0.07;0.1;0.13;0.15;0.17;0.2;0.23;0.25;0.27;0.3;0.33;0.35;0.38;0.41;0.44;0.47;0.5;0.53;0.56;0.59;0.62;0.65;0.68;0.71;0.73;0.75;0.77;0.79;0.81;0.83;0.86;0.89;0.92;0.94;0.96;0.98;1";

function ride(stem: string, exit: string, branch: string, routeExit = exit) {
  const loop = questionPerimeter(IDENTITY, FRAME_R);
  const route = fillet(nudgeArchetypeRow(`${stem} ${routeExit}`));
  const toQuestion = fillet(nudgeArchetypeRow(`${stem} ${exit} ${branch}`));
  const path = fillet(nudgeArchetypeRow(`${stem} ${exit} ${branch} ${loop}`));
  return { route, toQuestion, path };
}

/**
 * Each color runs through its own elbow and stops on the shared centerline.
 * One horizontal stroke then carries the question gradient to the frame.
 */
function convergeGeometry() {
  const right = n(LOBBY_CRITERIA.x + LOBBY_CRITERIA.w);
  const qx = n(IDENTITY.x);
  const span = MEET_X - right;
  const elbow = n(cornerTrim(span, 397));
  const into = n(cornerTrim(397, qx - MEET_X));
  const leave = n(cornerTrim(160, span));
  const yL = LOBBY_EXIT_Y;
  const yG = GATHER_EXIT_Y;
  const joinX = n(MEET_X + into);
  const legX = n(MEET_X - elbow);
  return {
    x1: joinX,
    x2: qx,
    y: MEET_Y,
    legs: [
      {
        id: "lobby",
        tone: "copper",
        d: [
          `M${right} ${n(yL + LOBBY_LEAVE)}`,
          `A${LOBBY_LEAVE} ${LOBBY_LEAVE} 0 0 1 ${n(right + LOBBY_LEAVE)} ${yL}`,
          `L${legX} ${yL}`,
          `A${elbow} ${elbow} 0 0 1 ${MEET_X} ${n(yL + elbow)}`,
          `L${MEET_X} ${n(MEET_Y - into)}`,
          `A${into} ${into} 0 0 0 ${joinX} ${MEET_Y}`,
        ].join(" "),
      },
      {
        id: "workspace",
        tone: "white",
        d: [`M${right} ${n(MEET_Y + leave)}`, `A${leave} ${leave} 0 0 1 ${n(right + leave)} ${MEET_Y}`, `L${joinX} ${MEET_Y}`].join(" "),
      },
      {
        id: "gathering",
        tone: "teal",
        d: [
          `M${right} ${n(yG + leave)}`,
          `A${leave} ${leave} 0 0 1 ${n(right + leave)} ${yG}`,
          `L${legX} ${yG}`,
          `A${elbow} ${elbow} 0 0 0 ${MEET_X} ${n(yG - elbow)}`,
          `L${MEET_X} ${n(MEET_Y + into)}`,
          `A${into} ${into} 0 0 1 ${joinX} ${MEET_Y}`,
        ].join(" "),
      },
    ],
    merge: `M${joinX} ${MEET_Y} L${qx} ${MEET_Y}`,
  };
}

const CONVERGE = convergeGeometry();

const TRACK_STEMS = [
  {
    id: "lobby",
    color: COPPER,
    keyPoints: "0;0.0403;0.0761;0.1026;0.1291;0.1556;0.1702;0.1778;0.1977;0.2228;0.2465;0.2639;0.2901;0.324;0.3466;0.373;0.3995;0.4259;0.4524;0.4789;0.5043;0.5307;0.5572;0.5837;0.6101;0.6366;0.6631;0.6871;0.7212;0.7389;0.7608;0.7896;0.8073;0.8326;0.8591;0.8856;0.9144;0.9426;0.9806;1",
    ...ride(
      `M${n(954.45 + PRECEDENT_NUDGE)} 1041.8 L${n(954.45 + PRECEDENT_NUDGE)} 500.95 L2096.84 500.95 L2097.64 501.54 ${aroundBottom(LOBBY_DECOMP, FRAME_R)} L2784.23 408.25 L2841.8 408.25 L3032.88 408.25 L3090.45 408.25 L3281.53 408.25 L3339.1 408.25 L3530.18 408.25 L3587.75 408.25 L3778.82 408.25 L3836.4 408.25 L4027.47 408.25 L4085.05 408.25 L4276.12 408.25 L4333.7 408.25 L4524.77 408.25 L4582.35 408.25 L4773.42 408.25 L4831 408.25 L5022.07 408.25 L5037.11 429.72 L5037.11 620.8 L5037.11 651.99 L5037.11 720.59 ${approach(LOBBY_CRITERIA.x, 720.59)} ${alongBottom(LOBBY_CRITERIA, FRAME_R)}`,
      frameExit(LOBBY_CRITERIA, LOBBY_EXIT_Y),
      `L${MEET_X} ${LOBBY_EXIT_Y} L${MEET_X} ${MEET_Y} L${n(IDENTITY.x)} ${MEET_Y}`,
      frameExit(LOBBY_CRITERIA, LOBBY_EXIT_Y + LOBBY_LEAVE),
    ),
  },
  {
    id: "workspace",
    color: WHITE,
    keyPoints: "0;0.0112;0.0213;0.0356;0.0499;0.0656;0.0784;0.0878;0.1055;0.1332;0.1546;0.1822;0.2131;0.2441;0.2822;0.3129;0.3437;0.3747;0.4057;0.4381;0.4692;0.5003;0.5314;0.5625;0.5936;0.626;0.6571;0.6774;0.7022;0.7395;0.7611;0.7866;0.8162;0.8457;0.8762;0.907;0.9285;0.9608;0.9859;1",
    ...ride(
      `M${n(1213.1 + PRECEDENT_NUDGE)} 1012.8 L2103.84 1012.8 ${aroundBottom(WORK_DECOMP, FRAME_R)} L2600.84 932.49 L2791.91 932.49 L2849.49 932.49 L3040.56 932.49 L3098.14 932.49 L3289.21 932.49 L3346.79 932.49 L3537.86 932.49 L3595.44 932.49 L3786.51 932.49 L3844.08 932.49 L4035.16 932.49 L4092.73 932.49 L4283.81 932.49 L4341.38 932.49 L4532.46 932.49 L4590.03 932.49 L4781.11 932.49 L4838.68 932.49 L5029.76 932.49 L5044.8 953.96 L5044.8 1145.04 L5051.48 1174.25 ${approach(WORK_CRITERIA.x, 1174.25)} ${alongBottom(WORK_CRITERIA, FRAME_R)}`,
      frameExit(WORK_CRITERIA, MEET_Y),
      `L${MEET_X} ${MEET_Y} L${n(IDENTITY.x)} ${MEET_Y}`,
      frameExit(WORK_CRITERIA, MEET_Y + cornerTrim(160, MEET_X - (WORK_CRITERIA.x + WORK_CRITERIA.w))),
    ),
  },
  {
    id: "gathering",
    color: TEAL,
    keyPoints: "0;0.012;0.0206;0.0336;0.057;0.0927;0.133;0.1627;0.1908;0.2189;0.2376;0.2629;0.2898;0.3181;0.3501;0.3782;0.4051;0.4332;0.4613;0.4893;0.5163;0.5444;0.5724;0.5994;0.6274;0.6555;0.6836;0.7012;0.7207;0.7359;0.7621;0.7849;0.8015;0.8274;0.855;0.8829;0.911;0.9424;0.9817;1",
    ...ride(
      `M${n(1010.7 + PRECEDENT_NUDGE)} 1066.5 L1536.48 1066.5 L1536.48 1604.85 L2101.99 1604.85 L2101.99 1605.57 ${aroundBottom(GATH_DECOMP, FRAME_R)} L2601.78 1515.31 L2792.85 1515.31 L2850.43 1515.31 L3041.5 1515.31 L3099.07 1515.31 L3290.15 1515.31 L3347.72 1515.31 L3538.8 1515.31 L3596.37 1515.31 L3787.45 1515.31 L3845.02 1515.31 L4036.1 1515.31 L4093.67 1515.31 L4284.75 1515.31 L4342.32 1515.31 L4533.39 1515.31 L4590.97 1515.31 L4782.04 1515.31 L4839.62 1515.31 L5030.69 1515.31 L5045.73 1536.79 L5045.73 1536.78 ${approach(GATH_CRITERIA.x, 1536.78)} ${alongBottom(GATH_CRITERIA, FRAME_R)}`,
      frameExit(GATH_CRITERIA, 1586.46),
      `L${MEET_X} 1586.46 L${MEET_X} ${MEET_Y} L${n(IDENTITY.x)} ${MEET_Y}`,
      frameExit(GATH_CRITERIA, 1586.46 + cornerTrim(160, MEET_X - (GATH_CRITERIA.x + GATH_CRITERIA.w))),
    ),
  },
] as const;

function glass(color: string) {
  if (color === COPPER) return "url(#precedent-glass-copper)";
  if (color === TEAL) return "url(#precedent-glass-teal)";
  return "url(#precedent-glass-white)";
}

function tone(color: string) {
  if (color === COPPER) return "copper";
  if (color === TEAL) return "teal";
  return "white";
}

function pathSamples(d: string) {
  const tokens = d.match(/[MLA]|-?\d*\.?\d+/g) ?? [];
  const pts: { x: number; y: number }[] = [];
  let i = 0;
  let x = 0;
  let y = 0;
  while (i < tokens.length) {
    const command = tokens[i++];
    if (command === "M") {
      x = Number(tokens[i++]);
      y = Number(tokens[i++]);
      pts.push({ x, y });
    } else if (command === "L" || command === "A") {
      if (command === "A") i += 5;
      const nx = Number(tokens[i++]);
      const ny = Number(tokens[i++]);
      const steps = command === "A" ? 4 : 1;
      for (let step = 1; step <= steps; step++) {
        pts.push({ x: x + ((nx - x) * step) / steps, y: y + ((ny - y) * step) / steps });
      }
      x = nx;
      y = ny;
    }
  }
  let length = 0;
  const walked = pts.map((point, index) => {
    if (index) length += Math.hypot(point.x - pts[index - 1].x, point.y - pts[index - 1].y);
    return length;
  });
  const total = length || 1;
  return { pts: pts.map((point, index) => ({ ...point, u: walked[index] / total })), length: total };
}

function roundTrip(points: number[], times: number[]) {
  const kp = points.slice();
  const kt = times.map((time) => time * 0.5);
  for (let index = points.length - 2; index >= 0; index -= 1) {
    kp.push(points[index]);
    kt.push(1 - times[index] * 0.5);
  }
  return {
    keyPoints: kp.map((point) => point.toFixed(4)).join(";"),
    keyTimes: kt.map((time) => time.toFixed(4)).join(";"),
  };
}

const TRACK_LENGTHS = TRACK_STEMS.map((track) => ({
  stem: pathSamples(track.toQuestion).length,
  full: pathSamples(track.path).length,
}));
const PERIM_SECONDS = TRACK_LENGTHS.reduce((sum, track) => sum + (track.full - track.stem) / (track.stem / ONE_WAY), 0) / TRACK_LENGTHS.length;
const FORWARD_SECONDS = ONE_WAY + PERIM_SECONDS;
const CYCLE_SECONDS = FORWARD_SECONDS * 2;
const CYCLE = `${CYCLE_SECONDS.toFixed(2)}s`;
const STEM_PORTION = ONE_WAY / FORWARD_SECONDS;

const TRACKS = TRACK_STEMS.map((track, index) => {
  const scale = TRACK_LENGTHS[index].stem / TRACK_LENGTHS[index].full;
  const oldPoints = track.keyPoints.split(";").map(Number);
  const oldTimes = LIGHT_TIMES.split(";").map(Number);
  const points = oldPoints.map((point) => point * scale);
  const times = oldTimes.map((time) => time * STEM_PORTION);
  points.push(1);
  times.push(1);
  return { ...track, forwardPoints: points, forwardTimes: times, motion: roundTrip(points, times) };
});

const TRACK_SAMPLES = TRACKS.map((track) => ({
  pts: pathSamples(track.path).pts,
  points: track.forwardPoints,
  times: track.forwardTimes,
}));

const LIT_TRACKS = TRACKS.map((track) => ({
  ...track,
  ...mergeLight(track.color, joinU(track.path), track.forwardPoints, track.forwardTimes, track.id === "workspace"),
}));

function joinU(d: string) {
  const joinX = MEET_X + cornerTrim(397, IDENTITY.x - MEET_X) - 2;
  const hit = pathSamples(d).pts.find((point) => point.x >= joinX && Math.abs(point.y - MEET_Y) < 40);
  return hit ? hit.u : 0.75;
}

/** Copper and teal leave once the stroke is the shared gradient, so one white light continues. */
function mergeLight(color: string, reached: number, points: number[], times: number[], hold: boolean) {
  if (hold) return { opacityValues: "1;1", opacityTimes: "0;1", fillValues: undefined, fillTimes: undefined };
  const arrive = clockAt(reached, points, times) * 0.5;
  const back = 1 - arrive;
  const keys = [0, Math.max(0.001, arrive - 0.01), Math.min(back - 0.03, arrive + 0.012), Math.max(arrive + 0.02, back - 0.012), Math.min(0.999, back + 0.01), 1];
  for (let index = 1; index < keys.length; index += 1) keys[index] = Math.max(keys[index], keys[index - 1] + 0.001);
  keys[keys.length - 1] = 1;
  const stamp = keys.map((key) => key.toFixed(4)).join(";");
  return {
    opacityValues: "1;1;0;0;1;1",
    opacityTimes: stamp,
    fillValues: `${color};${color};${WHITE};${WHITE};${color};${color}`,
    fillTimes: stamp,
  };
}

function clockAt(progress: number, points: number[], times: number[]) {
  let index = 1;
  while (index < points.length - 1 && points[index] < progress) index += 1;
  const span = points[index] - points[index - 1] || 1;
  const blend = Math.min(1, Math.max(0, (progress - points[index - 1]) / span));
  return times[index - 1] + (times[index] - times[index - 1]) * blend;
}

/** Times the traveling light is inside this frame, on the shared cycle. */
function glowFor(rect: Box) {
  const pad = 16;
  const spans: [number, number][] = [];
  for (const track of TRACK_SAMPLES) {
    let open: number | null = null;
    track.pts.forEach((point, index) => {
      const on = point.x >= rect.x - pad && point.x <= rect.x + rect.w + pad && point.y >= rect.y - pad && point.y <= rect.y + rect.h + pad;
      const time = clockAt(point.u, track.points, track.times);
      if (on && open == null) open = time;
      if (!on && open != null) {
        spans.push([open, time]);
        open = null;
      }
      if (on && index === track.pts.length - 1 && open != null) spans.push([open, Math.max(time, 0.99)]);
    });
  }
  spans.sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const span of spans) {
    const last = merged[merged.length - 1];
    if (!last || span[0] > last[1] + 0.025) merged.push([span[0], span[1]]);
    else last[1] = Math.max(last[1], span[1]);
  }
  if (!merged.length) return null;
  const fade = 0.008;
  const keys: { t: number; on: boolean }[] = [{ t: 0, on: false }];
  for (const [start, end] of merged) {
    const on = Math.min(0.99, Math.max(0, start));
    const off = Math.min(1, Math.max(on + fade * 2, end));
    keys.push({ t: on, on: false }, { t: on + fade, on: true }, { t: Math.max(on + fade, off - fade), on: true }, { t: off, on: false });
  }
  keys.push({ t: 1, on: false });
  keys.sort((a, b) => a.t - b.t);
  const ordered: { t: number; on: boolean }[] = [];
  for (const key of keys) {
    const prev = ordered[ordered.length - 1];
    const t = prev && key.t <= prev.t ? Math.min(1, prev.t + 0.001) : key.t;
    if (t >= 1 && ordered.length) continue;
    ordered.push({ t, on: key.on });
  }
  ordered[0] = { t: 0, on: ordered[0]?.on ?? false };
  ordered.push({ t: 1, on: false });
  return {
    keyTimes: ordered.map((key) => key.t.toFixed(3)).join(";"),
    values: ordered.map((key) => (key.on ? "1" : "0")).join(";"),
  };
}

/** The halo clock runs out and back, so each forward span also plays in reverse. */
function mirrorGlow(glow: { keyTimes: string; values: string }) {
  const times = glow.keyTimes.split(";").map(Number);
  const values = glow.values.split(";");
  const kt: number[] = [];
  const kv: string[] = [];
  const push = (time: number, value: string) => {
    const prev = kt[kt.length - 1];
    const next = prev != null && time <= prev ? Math.min(1, prev + 0.001) : time;
    if (prev != null && next >= 1 && prev >= 0.999) return;
    kt.push(Math.min(1, next));
    kv.push(value);
  };
  times.forEach((time, index) => push(time * 0.5, values[index]));
  for (let index = times.length - 2; index >= 0; index -= 1) push(1 - times[index] * 0.5, values[index]);
  if (kt[kt.length - 1] < 1) push(1, kv[0] ?? "0");
  return { keyTimes: kt.map((time) => time.toFixed(3)).join(";"), values: kv.join(";") };
}

function QuestionFrame({ box }: { box: Box }) {
  const glow = glowFor(box);
  const halo = glow ? mirrorGlow(glow) : null;
  const r = FRAME_R;
  return (
    <g>
      {halo ? (
        <rect className="precedent-frame-halo" x={box.x} y={box.y} width={box.w} height={box.h} rx={r} ry={r} stroke="#f4f1ec" filter="url(#precedent-frame-glow)" opacity="0">
          <animate attributeName="opacity" begin="indefinite" dur={CYCLE} repeatCount="indefinite" calcMode="linear" values={halo.values} keyTimes={halo.keyTimes} />
        </rect>
      ) : null}
      <rect className="precedent-live-frame" data-role="question" x={box.x} y={box.y} width={box.w} height={box.h} rx={r} ry={r} stroke="url(#precedent-wf-frame)" />
    </g>
  );
}

function LitFrame({ box, rx, stroke, role, toneName }: { box: Box; rx: number; stroke: string; role: string; toneName: string }) {
  const glow = glowFor(box);
  const halo = glow ? mirrorGlow(glow) : null;
  return (
    <g>
      {halo ? (
        <rect className="precedent-frame-halo" x={box.x} y={box.y} width={box.w} height={box.h} rx={rx} ry={rx} stroke={stroke} filter="url(#precedent-frame-glow)" opacity="0">
          <animate attributeName="opacity" begin="indefinite" dur={CYCLE} repeatCount="indefinite" calcMode="linear" values={halo.values} keyTimes={halo.keyTimes} />
        </rect>
      ) : null}
      <rect className="precedent-live-frame" data-role={role} data-tone={toneName} x={box.x} y={box.y} width={box.w} height={box.h} rx={rx} ry={rx} stroke={stroke} />
    </g>
  );
}

function GlassEdges() {
  return (
    <defs>
      <linearGradient id="precedent-glass-white" x1="0" y1="0" x2="0.2" y2="1">
        <stop offset="0" stopColor="#f4f1ec" stopOpacity="0.72" />
        <stop offset="0.5" stopColor="#f4f1ec" stopOpacity="0.34" />
        <stop offset="1" stopColor="#f4f1ec" stopOpacity="0.55" />
      </linearGradient>
      <linearGradient id="precedent-glass-copper" x1="0" y1="0" x2="0.2" y2="1">
        <stop offset="0" stopColor="#e0a48c" stopOpacity="0.8" />
        <stop offset="0.5" stopColor="#c77e5f" stopOpacity="0.4" />
        <stop offset="1" stopColor="#c77e5f" stopOpacity="0.62" />
      </linearGradient>
      <linearGradient id="precedent-glass-teal" x1="0" y1="0" x2="0.2" y2="1">
        <stop offset="0" stopColor="#7db8b8" stopOpacity="0.8" />
        <stop offset="0.5" stopColor="#0f7377" stopOpacity="0.42" />
        <stop offset="1" stopColor="#0f7377" stopOpacity="0.66" />
      </linearGradient>
      <linearGradient id="precedent-wf-frame" gradientUnits="objectBoundingBox" x1="0.329" y1="0.03" x2="0.671" y2="0.97">
        <stop offset="0" stopColor="#49d7de" stopOpacity="0.55" />
        <stop offset="0.48" stopColor="#ffffff" stopOpacity="0.16" />
        <stop offset="1" stopColor="#c77e5f" stopOpacity="0.42" />
      </linearGradient>
      <filter id="precedent-frame-glow" filterUnits="userSpaceOnUse" x="-200" y="-200" width="7800" height="2600">
        <feMorphology in="SourceAlpha" operator="erode" radius="10" result="inset" />
        <feComposite in="SourceAlpha" in2="inset" operator="out" result="rim" />
        <feGaussianBlur in="rim" stdDeviation="22" result="blur" />
        <feFlood floodColor="#49d7de" floodOpacity="0.22" result="teal" />
        <feFlood floodColor="#c77e5f" floodOpacity="0.16" result="copper" />
        <feComposite in="teal" in2="blur" operator="in" result="tealGlow" />
        <feComposite in="copper" in2="blur" operator="in" result="copperGlow" />
        <feMerge>
          <feMergeNode in="tealGlow" />
          <feMergeNode in="copperGlow" />
        </feMerge>
      </filter>
    </defs>
  );
}

const LOBBY_NAMES = [
  ["VERTICAL", "VOID"],
  ["COMPRESSED", "SEQUENTIAL"],
  ["CONTINUOUS", "HALL"],
  ["TOPOGRAPHIC", "GROUND FIELD"],
  ["LINEAR", "GALLERY"],
];
const WORK_NAMES = [
  ["FLAT DEEP", "PLAN"],
  ["OPEN", "HALL"],
  ["UNDULATED"],
  ["TERRACE"],
  ["VOID", "EDGE"],
];
const GATHER_NAMES = [
  ["VOID | FIELD"],
  ["INSERTED", "HORIZONTAL PLATE"],
  ["AMPHITHEATER"],
  ["CONTAINED ROOM", "WITHIN VOLUME"],
  ["LINEAR EDGE", "GALLERY"],
];

const FIELD_ROWS = [
  { label: "LOBBY", y: 447, h: 107, xs: [2931, 3358, 3784, 4211, 4638].map((x) => x - ARCHETYPE_NUDGE - ANALYSIS_SHIFT), color: COPPER, names: LOBBY_NAMES, frame: shiftAnalysis(LOBBY_DECOMP) },
  { label: "WORKSPACE", y: 966, h: 104, xs: [2931, 3358, 3784, 4211, 4638].map((x) => x - ARCHETYPE_NUDGE - ANALYSIS_SHIFT), color: WHITE, names: WORK_NAMES, frame: shiftAnalysis(WORK_DECOMP) },
  { label: "GATHERING", y: 1548, h: 106, xs: [2939, 3366, 3792, 4219, 4645].map((x) => x - ARCHETYPE_NUDGE - ANALYSIS_SHIFT), color: TEAL, names: GATHER_NAMES, frame: shiftAnalysis(GATH_DECOMP) },
] as const;

const CRITERIA = [
  {
    rect: LOBBY_CRITERIA,
    color: COPPER,
    title: "FORMAL / GEOMETRICAL",
    global: ["COMPLEXITY", "PROPORTIONALITY"],
    specific: ["CENTRALITY", "PLATE ARTICULATION", "CIRCULATION\nINTEGRATION"],
  },
  {
    rect: WORK_CRITERIA,
    color: WHITE,
    title: "ORGANIZATIONAL / SPATIAL",
    global: ["OPENNESS", "CONNECTIVITY"],
    specific: ["DIRECTIONALITY", "MODULARITY", "SPATIAL PERMANENCE"],
  },
  {
    rect: GATH_CRITERIA,
    color: TEAL,
    title: "EXPERIENTIAL / ATMOSPHERIC",
    global: ["VISIBILITY", "IMMERSIVE"],
    specific: ["RECEPTIVITY", "COLLABORATION", "SOCIAL PROXIMITY"],
  },
] as const;

const PLATES: { href: string; x: number; y: number; w: number; h: number }[] = [
  { href: "/assets/skill0/precedent/photo-lattice.jpg", x: 151.11, y: 292.62, w: 257.69, h: 191.63 },
  { href: "/assets/skill0/precedent/photo-slabs.png", x: 595.27, y: 292.52, w: 260.2, h: 191.93 },
  { href: "/assets/skill0/precedent/photo-atrium.jpg", x: 1042.09, y: 292.52, w: 258.55, h: 191.93 },
  { href: "/assets/skill0/precedent/axon.png", x: 156.95, y: 515.85, w: 1116.3, h: 620.3 },
  { href: "/assets/skill0/precedent/graph-traces.png", x: 179.1, y: 1225.14, w: 536.19, h: 344.75 },
  { href: "/assets/skill0/precedent/graph-mesh.png", x: 762.53, y: 1225.13, w: 509.64, h: 345.36 },
  { href: "/assets/skill0/precedent/lobby-vertical-void.png", x: 3059.57, y: 560, w: 86.85, h: 250 },
  { href: "/assets/skill0/precedent/lobby-compressed-sequential.png", x: 3370, y: 563.59, w: 320, h: 242.82 },
  { href: "/assets/skill0/precedent/lobby-continuous-hall.png", x: 3791.78, y: 560, w: 328.43, h: 250 },
  { href: "/assets/skill0/precedent/lobby-topographic-ground-field.png", x: 4203, y: 642.28, w: 360, h: 85.45 },
  { href: "/assets/skill0/precedent/lobby-linear-gallery.png", x: 4650, y: 597.46, w: 320, h: 175.07 },
  { href: "/assets/skill0/precedent/workspace-flat-deep-plan.jpg", x: 2938, y: 1104.72, w: 330, h: 230.56 },
  { href: "/assets/skill0/precedent/workspace-open-hall.png", x: 3391.87, y: 1095, w: 276.26, h: 250 },
  { href: "/assets/skill0/precedent/workspace-undulated.png", x: 3806, y: 1121.86, w: 300, h: 196.29 },
  { href: "/assets/skill0/precedent/workspace-terrace.jpg", x: 4213, y: 1097.69, w: 340, h: 244.61 },
  { href: "/assets/skill0/precedent/workspace-void-edge.jpg", x: 4648.07, y: 1090, w: 323.87, h: 260 },
  { href: "/assets/skill0/precedent/gathering-void-field.png", x: 3016.14, y: 1680, w: 189.72, h: 260 },
  { href: "/assets/skill0/precedent/gathering-inserted-plate.png", x: 3497.06, y: 1670, w: 81.88, h: 280 },
  { href: "/assets/skill0/precedent/gathering-amphitheater.png", x: 3822.91, y: 1685, w: 282.18, h: 250 },
  { href: "/assets/skill0/precedent/gathering-contained-room.png", x: 4221, y: 1706.48, w: 340, h: 207.04 },
  { href: "/assets/skill0/precedent/gathering-linear-edge.png", x: 4721.17, y: 1675, w: 191.66, h: 270 },
].map((plate) => ({ ...plate, x: n(plate.x + (plate.x < 2000 ? PRECEDENT_NUDGE : -ARCHETYPE_NUDGE - ANALYSIS_SHIFT)) }));

const QUESTION = [
  "WHAT KIND OF GENERATIVE SYSTEM CAN",
  "TRANSLATE PRECEDENT-DERIVED",
  "MORPHOLOGICAL CHARACTERISTICS INTO",
  "NEW SPATIAL ORGANIZATIONS WITHOUT",
  "REPETITION OF PRECEDENT GEOMETRY?",
];

const ARCHETYPE_RUNS = [
  { family: "lobby", y: 408.25, xs: [2931, 3358, 3784, 4211, 4638].map((x) => x - ARCHETYPE_NUDGE - ANALYSIS_SHIFT) },
  { family: "workspace", y: 932.49, xs: [2931, 3358, 3784, 4211, 4638].map((x) => x - ARCHETYPE_NUDGE - ANALYSIS_SHIFT) },
  { family: "gathering", y: 1515.31, xs: [2939, 3366, 3792, 4219, 4645].map((x) => x - ARCHETYPE_NUDGE - ANALYSIS_SHIFT) },
] as const;

function archetypeOn(href: string) {
  const runIndex = ARCHETYPE_RUNS.findIndex((item) => href.includes(`/${item.family}-`));
  if (runIndex < 0) return null;
  const run = ARCHETYPE_RUNS[runIndex];
  const index = PLATES.filter((plate) => plate.href.includes(`/${run.family}-`)).findIndex((plate) => plate.href === href);
  const track = TRACK_SAMPLES[runIndex];
  const x0 = run.xs[index] ?? 0;
  const hit = track.pts.find((point) => Math.abs(point.y - run.y) < 80 && point.x >= x0 - 24 && point.x <= x0 + 368);
  if (!hit) return null;
  return clockAt(hit.u, track.points, track.times).toFixed(3);
}

function hotSpan(box: Box) {
  const glow = glowFor(box);
  if (!glow) return "";
  const times = glow.keyTimes.split(";").map(Number);
  const values = glow.values.split(";").map(Number);
  let start = 1;
  let end = 0;
  times.forEach((time, index) => {
    if (values[index] < 0.5) return;
    start = Math.min(start, time);
    end = Math.max(end, time);
  });
  return start <= end ? `${start.toFixed(3)},${end.toFixed(3)}` : "";
}

function Lines({ x, y, w, h, lines, size, body = false }: { x: number; y: number; w: number; h: number; lines: readonly string[]; size: number; body?: boolean }) {
  const rows = lines.flatMap((line) => line.split("\n"));
  const gap = size * (body ? 1.35 : 1.15);
  const start = y + h / 2 - ((rows.length - 1) * gap) / 2;
  return (
    <text className={body ? "precedent-live-type is-body" : "precedent-live-type"} x={x + w / 2} y={start} fontSize={size}>
      {rows.map((line, index) => (
        <tspan key={`${line}-${index}`} x={x + w / 2} dy={index === 0 ? 0 : gap}>{line}</tspan>
      ))}
    </text>
  );
}

function PrecedentCopy() {
  return (
    <svg className="home-precedent-copy" viewBox="0 0 7407 2160" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
      <GlassEdges />
      {MAINS.map((frame) => (
        <LitFrame key={frame.title} box={frame} rx={FRAME_R} stroke="url(#precedent-glass-white)" role="main" toneName="white" />
      ))}
      {PLATES.map((plate) => {
        const on = archetypeOn(plate.href);
        return (
          <image
            key={plate.href}
            className={on ? "precedent-archetype" : "precedent-context"}
            data-on={on ?? undefined}
            data-hot={on ? undefined : hotSpan(MAINS[0])}
            href={plate.href}
            x={plate.x}
            y={plate.y}
            width={plate.w}
            height={plate.h}
          />
        );
      })}
      {MAINS.map((frame) => (
        <Lines key={frame.title} x={frame.x} y={frame.y + 28} w={frame.w} h={56} lines={[frame.title]} size={TYPE_TITLE} />
      ))}

      {FIELD_ROWS.map((row) => (
        <g key={row.label}>
          <LitFrame box={row.frame} rx={FRAME_R} stroke={row.color === TEAL ? "#7db8b8" : row.color} role="family" toneName={tone(row.color)} />
          <text className="precedent-live-type is-start" x={2200 - ANALYSIS_SHIFT} y={row.y + row.h / 2} fontSize={TYPE_TITLE}>{row.label}</text>
          {row.names.map((lines, index) => {
            const x = row.xs[index];
            const width = 344;
            return (
              <g key={lines.join(" ")}>
                <rect className="precedent-live-frame" data-role="archetype" data-tone={tone(row.color)} x={x} y={row.y} width={width} height={row.h} rx={PILL_R} stroke={glass(row.color)} />
                <Lines x={x} y={row.y} w={width} h={row.h} lines={lines} size={TYPE_PLATE} />
              </g>
            );
          })}
        </g>
      ))}

      {CRITERIA.map((group) => {
        const { x, y, w, h } = group.rect;
        const inset = 36;
        const gap = 18;
        const innerW = (w - inset * 2 - gap) / 2;
        const innerY = y + 132;
        const innerH = 240;
        return (
          <g key={group.title}>
            <LitFrame box={group.rect} rx={FRAME_R} stroke={group.color === TEAL ? "#7db8b8" : group.color} role="mid" toneName={tone(group.color)} />
            <Lines x={x} y={y + 22} w={w} h={70} lines={[group.title]} size={TYPE_TITLE} />
            <rect className="precedent-live-frame" data-role="quiet" data-tone={tone(group.color)} x={x + inset} y={innerY} width={innerW} height={innerH} rx={FRAME_R} stroke={glass(group.color)} />
            <rect className="precedent-live-frame" data-role="quiet" data-tone={tone(group.color)} x={x + inset + innerW + gap} y={innerY} width={innerW} height={innerH} rx={FRAME_R} stroke={glass(group.color)} />
            <Lines x={x + inset} y={innerY} w={innerW} h={innerH - 84} lines={group.global} size={TYPE_ITEM} body />
            <Lines x={x + inset + innerW + gap} y={innerY} w={innerW} h={innerH - 84} lines={group.specific} size={TYPE_ITEM} body />
            <text className="precedent-live-note is-criteria" x={x + inset + innerW / 2} y={innerY + innerH - 46} fontSize={TYPE_NOTE}>
              <tspan x={x + inset + innerW / 2}>GLOBAL CRITERIA</tspan>
            </text>
            <text className="precedent-live-note is-criteria" x={x + inset + innerW + gap + innerW / 2} y={innerY + innerH - 58} fontSize={TYPE_NOTE}>
              <tspan x={x + inset + innerW + gap + innerW / 2}>TYPOLOGY SPECIFIC</tspan>
              <tspan x={x + inset + innerW + gap + innerW / 2} dy={TYPE_NOTE * 1.2}>CRITERIA</tspan>
            </text>
          </g>
        );
      })}

      <QuestionFrame box={IDENTITY} />
      <Lines x={IDENTITY.x + 64} y={IDENTITY.y} w={IDENTITY.w - 128} h={IDENTITY.h} lines={QUESTION} size={TYPE_QUESTION} body />

      <Lines x={80} y={1620} w={1380} h={70} lines={["OVERLAP  —  INTERCONNECTED  —  MIXED"]} size={TYPE_CAPTION} />
    </svg>
  );
}

export function PrecedentDiagram() {
  const rootRef = useRef<HTMLDivElement>(null);
  const [criteriaOpen, setCriteriaOpen] = useState(false);
  const [criteriaOrigin, setCriteriaOrigin] = useState<{ x: number; y: number } | null>(null);
  const criteriaClock = usePresentClock(false, () => setCriteriaOpen(false));
  const criteriaFrame = MAINS[2];

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const sheets = [...root.querySelectorAll<SVGSVGElement>(".home-precedent-copy, .home-precedent-tracks")];
    const motion = sheets[1];
    const rides = sheets.flatMap((sheet) => [...sheet.querySelectorAll<SVGAnimationElement>("animateMotion, animate")]);
    if (!motion || rides.length === 0) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let started = false;
    let origin = 0;
    let frame = 0;
    const board = root.closest<HTMLElement>(".wf-board");
    const held = () => board?.dataset.paused === "1";
    const paint = () => {
      const elapsed = Math.max(0, motion.getCurrentTime() - origin);
      const anim = (elapsed % CYCLE_SECONDS) / CYCLE_SECONDS;
      const t = anim <= 0.5 ? anim * 2 : (1 - anim) * 2;
      root.querySelectorAll<SVGElement>(".precedent-archetype").forEach((node) => {
        const on = Number(node.dataset.on);
        node.classList.toggle("is-on", Number.isFinite(on) && t >= on);
      });
      root.querySelectorAll<SVGElement>(".precedent-context").forEach((node) => {
        const [start, end] = (node.dataset.hot ?? "").split(",").map(Number);
        node.classList.toggle("is-hot", Number.isFinite(start) && t >= start && t <= end);
      });
      frame = window.requestAnimationFrame(paint);
    };
    const observer = new IntersectionObserver(
      ([entry]) => {
        const active = entry.isIntersecting;
        root.dataset.active = active ? "true" : "false";
        if (!active || held()) {
          sheets.forEach((sheet) => sheet.pauseAnimations());
          return;
        }
        if (!started) {
          origin = motion.getCurrentTime();
          rides.forEach((ride) => ride.beginElement());
          started = true;
          frame = window.requestAnimationFrame(paint);
          return;
        }
        sheets.forEach((sheet) => sheet.unpauseAnimations());
      },
      { threshold: 0.2 },
    );
    observer.observe(root);
    const syncHold = () => {
      sheets.forEach((sheet) => (held() ? sheet.pauseAnimations() : sheet.unpauseAnimations()));
    };
    const onTransport = (event: Event) => {
      if ((event as CustomEvent<{ action?: string }>).detail?.action !== "restart") return;
      sheets.forEach((sheet) => sheet.setCurrentTime(0));
      rides.forEach((ride) => ride.beginElement());
      origin = motion.getCurrentTime();
      started = true;
      syncHold();
    };
    const watch = board ? new MutationObserver(syncHold) : null;
    if (board) {
      watch?.observe(board, { attributes: true, attributeFilter: ["data-paused"] });
      board.addEventListener("wf-transport", onTransport);
    }
    return () => {
      observer.disconnect();
      watch?.disconnect();
      board?.removeEventListener("wf-transport", onTransport);
      window.cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <div className="home-precedent-stage" ref={rootRef}>
      <PrecedentCopy />
      <svg className="home-precedent-tracks" viewBox="0 0 7407 2160" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
        <defs>
          {TRACKS.map((track) => (
            <WorkflowLightFilter key={track.id} id={`precedent-${track.id}-glow`} artboard scale={0.8} />
          ))}
          <linearGradient id="precedent-converge" gradientUnits="userSpaceOnUse" x1={CONVERGE.x1} y1={CONVERGE.y} x2={CONVERGE.x2} y2={CONVERGE.y}>
            <stop offset="0" stopColor="#49d7de" />
            <stop offset="0.48" stopColor="#ffffff" />
            <stop offset="1" stopColor="#c77e5f" />
          </linearGradient>
          <mask id="precedent-family-open" maskUnits="userSpaceOnUse" x="0" y="0" width="7407" height="2160">
            <rect width="7407" height="2160" fill="#fff" />
            {[LOBBY_DECOMP, WORK_DECOMP, GATH_DECOMP].map(shiftAnalysis).map((box) => (
              <rect key={`${box.x}-${box.y}`} x={box.x - 5} y={box.y - 5} width={box.w + 10} height={box.h + 10} rx={FRAME_R + 5} fill="#000" />
            ))}
          </mask>
        </defs>
        {TRACKS.map((track) => (
          <path key={track.id} className="precedent-route" data-tone={tone(track.color)} d={track.route} stroke={track.color} mask="url(#precedent-family-open)" />
        ))}
        <path className="precedent-converge" d={CONVERGE.merge} stroke="url(#precedent-converge)" />
        {CONVERGE.legs.map((leg) => (
          <path key={leg.id} className="precedent-route is-join" data-tone={leg.tone} d={leg.d} />
        ))}
        {LIT_TRACKS.map((track) => (
          <WorkflowPathLight
            key={track.id}
            id={`precedent-${track.id}`}
            color={track.color}
            scale={0.8}
            motion={{
              path: track.path,
              dur: CYCLE,
              calcMode: "linear",
              keyPoints: track.motion.keyPoints,
              keyTimes: track.motion.keyTimes,
              opacityValues: track.opacityValues,
              opacityTimes: track.opacityTimes,
              fillValues: track.fillValues,
              fillTimes: track.fillTimes,
              trailScale: WORKFLOW_TRACK_TAIL,
            }}
          />
        ))}
      </svg>
      <button
        type="button"
        className="precedent-criteria-open"
        aria-label="Open criteria"
        style={{
          left: `${((criteriaFrame.x + criteriaFrame.w) / 7407) * 100}%`,
          top: `${(criteriaFrame.y / 2160) * 100}%`,
        }}
        onClick={() => {
          const stage = rootRef.current;
          if (stage) {
            setCriteriaOrigin({
              x: ((criteriaFrame.x + criteriaFrame.w / 2) / 7407) * stage.clientWidth,
              y: ((criteriaFrame.y + criteriaFrame.h / 2) / 2160) * stage.clientHeight,
            });
          }
          setCriteriaOpen(true);
        }}
      >
        <span aria-hidden="true">+</span>
      </button>
      <section
        className="wf-opt-zoom"
        data-criteria=""
        data-open={criteriaOpen || undefined}
        aria-hidden={!criteriaOpen}
        style={criteriaOrigin ? { transformOrigin: `${criteriaOrigin.x}px ${criteriaOrigin.y}px` } : undefined}
      >
        <p className="wf-opt-trail">
          Typology Analysis <span aria-hidden="true">›</span> Criteria
        </p>
        <div className="wf-phy-panel">
          <div className="precedent-criteria-diagram" aria-label="Criteria and descriptors">
            {CRITERIA.map((group, index) => (
              <div key={group.title} className="precedent-criteria-map" data-tone={tone(group.color)}>
                <ul>
                  {[...group.global, ...group.specific].map((item) => (
                    <li key={item}>
                      <span>{item.replace("\n", " ")}</span>
                      <i aria-hidden="true"><b /></i>
                    </li>
                  ))}
                </ul>
                <span className="precedent-criteria-join" aria-hidden="true" />
                <p>{["Formal", "Spatial", "Atmospheric"][index]} Descriptor</p>
              </div>
            ))}
          </div>
        </div>
        <PresentControls run={false} clock={criteriaClock} onClose={() => setCriteriaOpen(false)} open={criteriaOpen} />
      </section>
    </div>
  );
}

export function HomePrecedent() {
  return (
    <div className="home-precedent">
      <PrecedentDiagram />
    </div>
  );
}
