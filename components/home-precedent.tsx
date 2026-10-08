"use client";

import { useEffect, useRef } from "react";
import { beginWorkflowLights, WorkflowLightFilter, WorkflowPathLight } from "@/components/workflow-light";
import { WORKFLOW_TRACK_DUR, WORKFLOW_TRACK_TAIL } from "@/lib/home-workflow-camera";

const CYCLE = WORKFLOW_TRACK_DUR;

const COPPER = "#c77e5f";
const WHITE = "#f4f1ec";
const TEAL = "#0f7377";

type Seg = { x1: number; y1: number; x2: number; y2: number; w: number; color: string };
type Box = { x: number; y: number; w: number; h: number };
type Frame = {
  id: string;
  rect: Box;
  radius: number;
  color: string;
  bright: string;
  values: string;
};

const DECOMP_R = 18;
const CRITERIA_R = 36.92;
const IDENTITY_R = 73.7;

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

function dashes(pairs: [number, number][], y: number, w: number, color: string): Seg[] {
  return pairs.map(([x1, x2]) => ({ x1, y1: y, x2, y2: y, w, color }));
}
function verticals(x: number, spans: [number, number][], w: number, color: string): Seg[] {
  return spans.map(([y1, y2]) => ({ x1: x, y1, x2: x, y2, w, color }));
}

const SEGMENTS: Seg[] = [
  { x1: 954.45, y1: 500.95, x2: 2096.84, y2: 500.95, w: 1, color: COPPER },
  { x1: 1216.96, y1: 1020.25, x2: 2103.84, y2: 1020.25, w: 0.99, color: WHITE },
  { x1: 1536.48, y1: 1604.85, x2: 2101.99, y2: 1604.85, w: 1, color: TEAL },
  ...dashes(
    [[2593.15, 2784.23], [2841.8, 3032.88], [3090.45, 3281.53], [3339.1, 3530.18], [3587.75, 3778.82], [3836.4, 4027.47], [4085.05, 4276.12], [4333.7, 4524.77], [4582.35, 4773.42], [4831, 5022.07]],
    408.25, 2.36, COPPER,
  ),
  ...dashes(
    [[2316.46, 2507.53], [2565.11, 2756.18], [2813.76, 3004.83], [3062.41, 3253.48], [3311.06, 3502.13], [3559.7, 3750.78], [3808.35, 3999.43], [4057, 4248.08], [4305.65, 4496.73], [4554.3, 4745.38], [4802.95, 4994.03]],
    843.06, 2.36, COPPER,
  ),
  ...verticals(5037.11, [[429.72, 620.8], [651.99, 843.06]], 2.36, COPPER),
  ...dashes(
    [[2600.84, 2791.91], [2849.49, 3040.56], [3098.14, 3289.21], [3346.79, 3537.86], [3595.44, 3786.51], [3844.08, 4035.16], [4092.73, 4283.81], [4341.38, 4532.46], [4590.03, 4781.11], [4838.68, 5029.76]],
    932.49, 2.36, WHITE,
  ),
  ...dashes(
    [[2075.49, 2266.57], [2324.14, 2515.22], [2572.79, 2763.87], [2821.44, 3012.52], [3070.09, 3261.17], [3318.74, 3509.81], [3567.39, 3758.46], [3816.04, 4007.11], [4064.69, 4255.76], [4313.34, 4504.41], [4561.99, 4753.06], [4810.64, 5001.71]],
    1367.31, 2.36, WHITE,
  ),
  ...verticals(5044.8, [[953.96, 1145.04], [1176.23, 1367.31]], 2.36, WHITE),
  { x1: 5051.48, y1: 1174.25, x2: 5270.25, y2: 1174.25, w: 2.36, color: WHITE },
  ...dashes(
    [[2601.78, 2792.85], [2850.43, 3041.5], [3099.07, 3290.15], [3347.72, 3538.8], [3596.37, 3787.45], [3845.02, 4036.1], [4093.67, 4284.75], [4342.32, 4533.39], [4590.97, 4782.04], [4839.62, 5030.69]],
    1515.31, 2.36, TEAL,
  ),
  ...dashes(
    [[2076.43, 2267.51], [2325.08, 2516.15], [2573.73, 2764.8], [2822.38, 3013.45], [3071.03, 3262.1], [3319.68, 3510.75], [3568.33, 3759.4], [3816.98, 4008.05], [4065.63, 4256.7], [4314.28, 4505.35], [4562.92, 4754], [4811.57, 5002.65]],
    1950.13, 2.36, TEAL,
  ),
  ...verticals(5045.73, [[1536.79, 1727.86], [1759.06, 1950.13]], 2.36, TEAL),
  { x1: 5175.52, y1: 720.59, x2: 5270.25, y2: 720.59, w: 1, color: COPPER },
  { x1: 5175.52, y1: 1536.78, x2: 5270.25, y2: 1536.78, w: 1, color: TEAL },
  { x1: 5175.52, y1: 720.59, x2: 5175.52, y2: 1536.78, w: 1, color: WHITE },
  { x1: 5044.8, y1: 644.23, x2: 5080.78, y2: 644.23, w: 0.5, color: COPPER },
  { x1: 5080.78, y1: 644.23, x2: 5080.78, y2: 1759.51, w: 0.5, color: WHITE },
  { x1: 5053.79, y1: 1759.51, x2: 5080.78, y2: 1759.51, w: 0.5, color: TEAL },
  { x1: 6145.62, y1: 750.19, x2: 6181.61, y2: 750.19, w: 0.43, color: COPPER },
  { x1: 6181.61, y1: 750.19, x2: 6181.61, y2: 1586.46, w: 0.43, color: WHITE },
  { x1: 6154.61, y1: 1586.46, x2: 6181.61, y2: 1586.46, w: 0.43, color: TEAL },
  { x1: 6181.61, y1: 1147.62, x2: 6312.35, y2: 1147.62, w: 2.04, color: WHITE },
];

const LOBBY_DECOMP = { x: 2097.64, y: 408.25, w: 493.47, h: 176.51 };
const WORK_DECOMP = { x: 2103.84, y: 933.12, w: 485.63, h: 175.38 };
const GATH_DECOMP = { x: 2101.99, y: 1512.87, w: 485.63, h: 175.38 };
const LOBBY_CRITERIA = { x: 5295.68, y: 586.02, w: 825.23, h: 355.38 };
const WORK_CRITERIA = { x: 5295.68, y: 972.73, w: 825.23, h: 355.38 };
const GATH_CRITERIA = { x: 5295.68, y: 1359.45, w: 825.23, h: 355.38 };
const IDENTITY = { x: 6311.45, y: 709.28, w: 947.19, h: 777.85 };

const FRAMES: Frame[] = [
  { id: "lobby-decomp", rect: LOBBY_DECOMP, radius: DECOMP_R, color: COPPER, bright: "0;0.14;0.18;0.30;0.36;1", values: "0.55;0.55;1;1;0.55;0.55" },
  { id: "work-decomp", rect: WORK_DECOMP, radius: DECOMP_R, color: WHITE, bright: "0;0.14;0.18;0.30;0.36;1", values: "0.55;0.55;1;1;0.55;0.55" },
  { id: "gath-decomp", rect: GATH_DECOMP, radius: DECOMP_R, color: TEAL, bright: "0;0.14;0.18;0.30;0.36;1", values: "0.55;0.55;1;1;0.55;0.55" },
  { id: "lobby-criteria", rect: LOBBY_CRITERIA, radius: CRITERIA_R, color: COPPER, bright: "0;0.62;0.68;0.84;0.90;1", values: "0.55;0.55;1;1;0.55;0.55" },
  { id: "work-criteria", rect: WORK_CRITERIA, radius: CRITERIA_R, color: WHITE, bright: "0;0.62;0.68;0.84;0.90;1", values: "0.55;0.55;1;1;0.55;0.55" },
  { id: "gath-criteria", rect: GATH_CRITERIA, radius: CRITERIA_R, color: TEAL, bright: "0;0.62;0.68;0.84;0.90;1", values: "0.55;0.55;1;1;0.55;0.55" },
  { id: "identity", rect: IDENTITY, radius: IDENTITY_R, color: WHITE, bright: "0;0.88;0.94;0.99;1", values: "0.55;0.55;1;1;0.55" },
];

/** Shared clock. The last hold is the identity frame, where the three lights meet. */
const LIGHT_TIMES = "0;0.1193;0.1951;0.4315;0.5936;0.6742;0.73;1";

const TRACKS = [
  {
    id: "lobby",
    color: COPPER,
    keyPoints: "0;0.1825;0.2863;0.6438;0.8888;1;1;1",
    opacityTimes: "0;0.04;0.1;0.6742;0.72;1",
    path: `M954.45 500.95 L2096.84 500.95 L2097.64 501.54 ${aroundBottom(LOBBY_DECOMP, DECOMP_R)} L2784.23 408.25 L2841.8 408.25 L3032.88 408.25 L3090.45 408.25 L3281.53 408.25 L3339.1 408.25 L3530.18 408.25 L3587.75 408.25 L3778.82 408.25 L3836.4 408.25 L4027.47 408.25 L4085.05 408.25 L4276.12 408.25 L4333.7 408.25 L4524.77 408.25 L4582.35 408.25 L4773.42 408.25 L4831 408.25 L5022.07 408.25 L5037.11 429.72 L5037.11 620.8 L5037.11 651.99 L5037.11 720.59 L5175.52 720.59 L5270.25 720.59 L5295.68 720.59 ${alongBottom(LOBBY_CRITERIA, CRITERIA_R)} L6120.91 750.19 L6145.62 750.19 L6181.61 750.19 L6181.61 1147.62 L6311.45 1147.62`,
  },
  {
    id: "workspace",
    color: WHITE,
    keyPoints: "0;0.0963;0.18;0.4412;0.6038;0.64;0.64;1",
    opacityTimes: "0;0.04;0.1;0.9;0.97;1",
    path: `M1216.96 1020.25 L2103.84 1020.25 L2103.84 1025.82 ${aroundBottom(WORK_DECOMP, DECOMP_R)} L2600.84 932.49 L2791.91 932.49 L2849.49 932.49 L3040.56 932.49 L3098.14 932.49 L3289.21 932.49 L3346.79 932.49 L3537.86 932.49 L3595.44 932.49 L3786.51 932.49 L3844.08 932.49 L4035.16 932.49 L4092.73 932.49 L4283.81 932.49 L4341.38 932.49 L4532.46 932.49 L4590.03 932.49 L4781.11 932.49 L4838.68 932.49 L5029.76 932.49 L5044.8 953.96 L5044.8 1145.04 L5051.48 1174.25 L5270.25 1174.25 L5295.68 1174.25 ${alongBottom(WORK_CRITERIA, CRITERIA_R)} L6120.91 1147.62 L6137.53 1147.62 L6311.45 1147.62 L6311.45 1413.43 A73.7 73.7 0 0 0 6385.15 1487.13 L7184.94 1487.13 A73.7 73.7 0 0 0 7258.64 1413.43 L7258.64 782.98 A73.7 73.7 0 0 0 7184.94 709.28 L6385.15 709.28 A73.7 73.7 0 0 0 6311.45 782.98 L6311.45 1147.62`,
  },
  {
    id: "gathering",
    color: TEAL,
    keyPoints: "0;0.0978;0.2322;0.6478;0.8744;1;1;1",
    opacityTimes: "0;0.04;0.1;0.6742;0.72;1",
    path: `M1536.48 1604.85 L2101.99 1604.85 L2101.99 1605.57 ${aroundBottom(GATH_DECOMP, DECOMP_R)} L2601.78 1515.31 L2792.85 1515.31 L2850.43 1515.31 L3041.5 1515.31 L3099.07 1515.31 L3290.15 1515.31 L3347.72 1515.31 L3538.8 1515.31 L3596.37 1515.31 L3787.45 1515.31 L3845.02 1515.31 L4036.1 1515.31 L4093.67 1515.31 L4284.75 1515.31 L4342.32 1515.31 L4533.39 1515.31 L4590.97 1515.31 L4782.04 1515.31 L4839.62 1515.31 L5030.69 1515.31 L5045.73 1536.79 L5045.73 1536.78 L5175.52 1536.78 L5270.25 1536.78 L5295.68 1536.78 ${alongBottom(GATH_CRITERIA, CRITERIA_R)} L6120.91 1586.46 L6154.61 1586.46 L6181.61 1586.46 L6181.61 1147.62 L6311.45 1147.62`,
  },
] as const;

function Stroke({ seg }: { seg: Seg }) {
  return <line className="precedent-stroke" x1={seg.x1} y1={seg.y1} x2={seg.x2} y2={seg.y2} stroke={seg.color} />;
}

function FrameShape({ frame }: { frame: Frame }) {
  const { x, y, w, h } = frame.rect;
  return (
    <rect className="precedent-frame" x={x} y={y} width={w} height={h} rx={frame.radius} ry={frame.radius} stroke={frame.color}>
      <animate
        attributeName="stroke-opacity"
        begin="indefinite"
        dur={CYCLE}
        repeatCount="indefinite"
        calcMode="linear"
        values={frame.values}
        keyTimes={frame.bright}
      />
    </rect>
  );
}

export function PrecedentDiagram() {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const motion = root.querySelector<SVGSVGElement>(".home-precedent-tracks");
    const rides = [...(motion?.querySelectorAll<SVGAnimationElement>("animateMotion, animate") ?? [])];
    if (!motion || rides.length === 0) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let started = false;
    const observer = new IntersectionObserver(
      ([entry]) => {
        const active = entry.isIntersecting;
        root.dataset.active = active ? "true" : "false";
        if (!active) {
          motion.pauseAnimations();
          return;
        }
        if (!started) {
          rides.forEach((ride) => ride.beginElement());
          started = true;
          return;
        }
        motion.unpauseAnimations();
      },
      { threshold: 0.2 },
    );
    observer.observe(root);
    return () => observer.disconnect();
  }, []);

  return (
    <div className="home-precedent-stage" ref={rootRef}>
      <img
        className="home-precedent-sheet home-precedent-sheet-laptop"
        src="/assets/skill0/precedent-analysis.svg"
        alt="Precedent analysis diagram"
        draggable={false}
      />
      <img
        className="home-precedent-sheet home-precedent-sheet-classroom"
        src="/assets/skill0/precedent-analysis-classroom.svg"
        alt="Precedent analysis diagram"
        draggable={false}
      />
      <svg className="home-precedent-tracks" viewBox="0 0 7407 2160" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
        <defs>
          {TRACKS.map((track) => (
            <WorkflowLightFilter key={track.id} id={`precedent-${track.id}-glow`} artboard />
          ))}
        </defs>
        {SEGMENTS.map((seg, index) => (
          <Stroke key={index} seg={seg} />
        ))}
        {FRAMES.map((frame) => (
          <FrameShape key={frame.id} frame={frame} />
        ))}
        {TRACKS.map((track) => (
          <WorkflowPathLight
            key={track.id}
            id={`precedent-${track.id}`}
            color={track.color}
            motion={{
              path: track.path,
              dur: CYCLE,
              calcMode: "linear",
              keyPoints: track.keyPoints,
              keyTimes: LIGHT_TIMES,
              opacityValues: "0;0;1;1;0;0",
              opacityTimes: track.opacityTimes,
              trailScale: WORKFLOW_TRACK_TAIL,
            }}
          />
        ))}
      </svg>
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
