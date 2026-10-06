"use client";

import { useEffect, useRef } from "react";

const CYCLE = "28s";
const WHITE = "#f4f1ec";
const TEAL = "#0f7377";

const MOTION =
  "M 990.86 980.29 L 1282.49 980.29 L 1282.49 473.29 A 73.7 73.7 0 0 1 1356.19 399.59 L 1971.36 399.59 A 73.7 73.7 0 0 1 2045.06 473.29 L 2094.55 473.29 A 73.7 73.7 0 0 1 2168.25 399.59 L 2783.42 399.59 A 73.7 73.7 0 0 1 2857.12 473.29 L 2906.61 473.29 A 73.7 73.7 0 0 1 2980.31 399.59 L 3595.48 399.59 A 73.7 73.7 0 0 1 3669.18 473.29 L 3669.18 643.23 L 4142.51 643.23 L 4142.51 779.49 L 4142.51 781.15 L 4306.66 781.15 A 14.92 14.92 0 0 1 4321.58 796.07 L 4321.58 845.04 A 14.92 14.92 0 0 1 4306.66 859.96 L 4142.51 859.96 L 4142.51 862.46 L 4142.51 992.36 L 4142.51 993.66 L 4389.85 993.66 A 14.92 14.92 0 0 1 4404.77 1008.58 L 4404.77 1057.55 A 14.92 14.92 0 0 1 4389.85 1072.47 L 4142.51 1072.47 L 4142.51 1074.79 L 4142.51 1200.35 L 4142.51 1201.35 L 4306.66 1201.35 A 14.92 14.92 0 0 1 4321.58 1216.27 L 4321.58 1265.24 A 14.92 14.92 0 0 1 4306.66 1280.16 L 4142.51 1280.16 L 4142.51 1282.26 L 4142.51 1410.64 L 4142.51 1413.15 L 4451.48 1413.15 A 14.92 14.92 0 0 1 4466.4 1428.07 L 4466.4 1477.04 A 14.92 14.92 0 0 1 4451.48 1491.96 L 4142.51 1491.96 L 4142.51 1494.48 L 4142.51 1623.75 L 4142.51 1624.95 L 4462.46 1624.95 A 14.92 14.92 0 0 1 4477.38 1639.87 L 4477.38 1688.84 A 14.92 14.92 0 0 1 4462.46 1703.76 L 4142.51 1703.76 L 4477.38 1703.76 L 4585.08 1703.76 L 4585.08 439.27 A 73.7 73.7 0 0 1 4658.78 365.57 L 6116.97 365.57 A 73.7 73.7 0 0 1 6190.67 439.27 L 6190.67 1050.15 L 6270.47 1050.15";

type Seg = { x1: number; y1: number; x2: number; y2: number; w: number; color: string };
type Frame = { id: string; x: number; y: number; w: number; h: number; rx: number; sw: number; color: string; times: string; values: string };

const SPINE: Seg[] = [
  { x1: 990.86, y1: 980.29, x2: 1260.87, y2: 980.29, w: 1.19, color: WHITE },
  { x1: 4142.51, y1: 643.23, x2: 4142.51, y2: 779.49, w: 0.98, color: WHITE },
  { x1: 4142.51, y1: 862.46, x2: 4142.51, y2: 992.36, w: 1, color: WHITE },
  { x1: 4142.51, y1: 1074.79, x2: 4142.51, y2: 1200.35, w: 0.94, color: WHITE },
  { x1: 4142.51, y1: 1282.26, x2: 4142.51, y2: 1410.64, w: 0.95, color: WHITE },
  { x1: 4142.51, y1: 1494.48, x2: 4142.51, y2: 1623.75, w: 0.96, color: WHITE },
];

const FRAMES: Frame[] = [
  { id: "identity", x: 357.41, y: 658.96, w: 633.45, h: 601.45, rx: 73.7, sw: 1.19, color: WHITE, times: "0;0.06;0.12;1", values: "1;1;0.55;0.55" },
  { id: "cellular", x: 1282.49, y: 399.59, w: 762.57, h: 1589.54, rx: 73.7, sw: 2.13, color: WHITE, times: "0;0.04;0.07;0.15;0.2;1", values: "0.55;0.55;1;1;0.55;0.55" },
  { id: "column", x: 2094.55, y: 399.59, w: 762.57, h: 1589.54, rx: 73.7, sw: 2.13, color: WHITE, times: "0;0.13;0.16;0.23;0.28;1", values: "0.55;0.55;1;1;0.55;0.55" },
  { id: "stigmergy", x: 2906.61, y: 399.59, w: 762.57, h: 1589.54, rx: 73.7, sw: 2.13, color: TEAL, times: "0;0.21;0.24;0.34;0.4;1", values: "0.55;0.55;1;1;0.55;0.55" },
  { id: "behavior", x: 4585.08, y: 365.57, w: 1605.59, h: 1611.76, rx: 73.7, sw: 2, color: WHITE, times: "0;0.66;0.7;0.96;1", values: "0.55;0.55;1;1;0.55" },
  { id: "question", x: 6270.47, y: 661.23, w: 947.19, h: 777.85, rx: 73.7, sw: 2, color: WHITE, times: "0;0.94;0.98;1", values: "0.55;0.55;1;1" },
];

function Stroke({ seg }: { seg: Seg }) {
  const common = { x1: seg.x1, y1: seg.y1, x2: seg.x2, y2: seg.y2, fill: "none" as const, strokeMiterlimit: 10 };
  return (
    <>
      <line {...common} stroke={seg.color} strokeWidth={seg.w + 10} strokeOpacity="0.45" strokeLinecap="round" />
      <line {...common} stroke="#000" strokeWidth={seg.w + 1.2} />
      <line {...common} stroke={seg.color} strokeWidth={seg.w} />
    </>
  );
}

export function GenerativeSystemTracks() {
  const rootRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    const motion = rootRef.current;
    if (!motion) return;
    const rides = [...motion.querySelectorAll<SVGAnimationElement>("animateMotion, animate")];
    if (rides.length === 0) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let started = false;
    const observer = new IntersectionObserver(
      ([entry]) => {
        const active = entry.isIntersecting;
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
    observer.observe(motion);
    return () => observer.disconnect();
  }, []);

  return (
    <svg ref={rootRef} className="wf-system-tracks" viewBox="0 0 7407 2160" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
      <defs>
        <radialGradient id="wf-system-halo">
          <stop offset="0" stopColor="#ffffff" stopOpacity="1" />
          <stop offset="0.22" stopColor={TEAL} stopOpacity="0.9" />
          <stop offset="0.55" stopColor={TEAL} stopOpacity="0.45" />
          <stop offset="1" stopColor={TEAL} stopOpacity="0" />
        </radialGradient>
      </defs>
      {SPINE.map((seg, index) => (
        <Stroke key={index} seg={seg} />
      ))}
      {FRAMES.map((frame) => (
        <g key={frame.id}>
          <rect x={frame.x} y={frame.y} width={frame.w} height={frame.h} rx={frame.rx} ry={frame.rx} fill="none" stroke={frame.color} strokeWidth={frame.sw + 10} strokeOpacity="0.4" />
          <rect x={frame.x} y={frame.y} width={frame.w} height={frame.h} rx={frame.rx} ry={frame.rx} fill="none" stroke="#000" strokeWidth={frame.sw + 1.2} />
          <rect x={frame.x} y={frame.y} width={frame.w} height={frame.h} rx={frame.rx} ry={frame.rx} fill="none" stroke={frame.color} strokeWidth={frame.sw} strokeOpacity="0.55">
            <animate attributeName="stroke-opacity" begin="indefinite" dur={CYCLE} repeatCount="indefinite" calcMode="linear" values={frame.values} keyTimes={frame.times} />
          </rect>
        </g>
      ))}
      <g className="wf-system-node" opacity="0">
        <animate attributeName="opacity" begin="indefinite" dur={CYCLE} repeatCount="indefinite" calcMode="linear" values="0;0;1;1;0;0" keyTimes="0;0.03;0.08;0.96;0.99;1" />
        <circle r="42" fill="url(#wf-system-halo)" />
        <circle r="8" fill="#ffffff" />
        <animateMotion begin="indefinite" dur={CYCLE} repeatCount="indefinite" calcMode="linear" path={MOTION} />
      </g>
    </svg>
  );
}
