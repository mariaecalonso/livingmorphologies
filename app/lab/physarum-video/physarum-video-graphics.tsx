"use client";

import { memo, useEffect, useRef, useState } from "react";

export const liveTime = { current: 0 };
const frameListeners = new Set<(time: number) => void>();

export function bindPlayback(listener: (time: number) => void) {
  frameListeners.add(listener);
  return () => {
    frameListeners.delete(listener);
  };
}

export function pushPlayback(time: number) {
  liveTime.current = time;
  frameListeners.forEach((listener) => listener(time));
}

export function withSyncedFrame(paint: () => void) {
  paint();
}

export function growthMediaReady() {
  return Boolean(growthVideo && growthVideo.readyState >= 2);
}

const WORDS = ["EXPLORE", "SENSE", "MOVE", "REINFORCE", "ADAPT", "REPEAT"] as const;

export const SENTENCE_A = 2.2;
export const SENTENCE_B = 3.94;
export const TITLE_REVEAL = 4.65;
export const TITLE_EXIT = 8.25;
export const STEPS_START = 8.65;
export const STEP_ARRIVE = 1.15;
export const STEP_HOLD = 1.2;
export const STEP_LEAVE = 0.9;
export const STEP_SPAN = STEP_ARRIVE + STEP_HOLD;
export const STEPS_END = STEPS_START + (WORDS.length - 1) * STEP_SPAN + STEP_ARRIVE + STEP_HOLD + STEP_LEAVE;
export const VIDEOS_AT = STEPS_END - 0.2;

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

function openAmount(time: number, start: number, end: number) {
  return clamp01((time - start) / (end - start));
}

function arrive(amount: number) {
  const t = clamp01(amount);
  return 1 - (1 - t) * (1 - t);
}

export function BehaviorEvent({ part }: { part: "trail" | "word" }) {
  if (part === "trail") return <TrailStage />;
  return <WordEvent />;
}

function WordEvent() {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => bindPlayback((time) => {
    const node = root.current;
    if (!node) return;
    WORDS.forEach((word, index) => {
      const layer = node.children[index] as HTMLElement | undefined;
      const text = layer?.firstElementChild as HTMLElement | undefined;
      if (!layer || !text) return;
      const start = STEPS_START + index * STEP_SPAN;
      const enterEnd = start + (index === 0 ? 0.96 : STEP_ARRIVE);
      const holdEnd = start + STEP_ARRIVE + STEP_HOLD;
      const leaveEnd = holdEnd + STEP_LEAVE;
      if (time < start || time > leaveEnd) {
        layer.style.visibility = "hidden";
        return;
      }
      const enter = arrive(openAmount(time, start, enterEnd));
      const exit = arrive(openAmount(time, holdEnd, leaveEnd));
      const fadeIn = index === 0 ? 1 : openAmount(time, start, start + 0.12);
      const fade = fadeIn * (1 - openAmount(time, leaveEnd - 0.2, leaveEnd));
      layer.style.visibility = "";
      layer.style.opacity = String(fade);
      layer.style.transform = `translate3d(${48 * (1 - enter) - 54 * exit}vw, 0, 0)`;
      text.style.fontSize = `${4.6 + enter * 5.8}rem`;
      void word;
    });
  }), []);
  return (
    <div ref={root} className="pv-behavior">
      {WORDS.map((word) => (
        <div key={word} className="pv-behavior-layer" style={{ visibility: "hidden" }}>
          <p className="pv-word">{word}</p>
        </div>
      ))}
    </div>
  );
}

function TrailStage() {
  return null;
}

type Trace = {
  ax: number;
  ay: number;
  bx: number;
  by: number;
  stage: number;
  kind: "ghost" | "trace" | "hot";
  partial: number;
};

const SEEDS: Array<[number, number]> = [
  [280, 210],
  [520, 150],
  [760, 250],
  [1040, 140],
  [1280, 280],
  [360, 400],
  [690, 470],
  [980, 390],
  [1360, 460],
];

function unitHash(index: number) {
  const value = Math.sin(index * 127.1 + 311.7) * 43758.5453;
  return value - Math.floor(value);
}

function buildField(): Trace[] {
  const traces: Trace[] = [];
  SEEDS.forEach((seed, index) => {
    for (let arm = 0; arm < 3; arm += 1) {
      let x = seed[0];
      let y = seed[1];
      let direction = unitHash(index * 17 + arm) * Math.PI * 2;
      const steps = unitHash(index + arm * 4) > 0.55 ? 3 : 2;
      for (let step = 0; step < steps; step += 1) {
        direction += (unitHash(index * 30 + arm * 9 + step) - 0.48) * 1.15;
        const span = 46 + unitHash(index * 8 + arm + step) * 78;
        const nextX = x + Math.cos(direction) * span;
        const nextY = y + Math.sin(direction) * span * 0.58;
        if (nextX < 30 || nextX > 1570 || nextY < 24 || nextY > 530) break;
        traces.push({ ax: x, ay: y, bx: nextX, by: nextY, stage: 0, kind: "trace", partial: 0.42 + unitHash(index * 11 + step) * 0.5 });
        traces.push({ ax: x + 5, ay: y - 3, bx: nextX + 6, by: nextY - 2, stage: 0, kind: "ghost", partial: 0.28 + unitHash(step + 4) * 0.3 });
        if (step === 1 && arm !== 1) {
          const side = direction + (arm === 0 ? 0.7 : -0.8);
          traces.push({
            ax: nextX,
            ay: nextY,
            bx: nextX + Math.cos(side) * 34,
            by: nextY + Math.sin(side) * 22,
            stage: 0,
            kind: "trace",
            partial: 0.5,
          });
        }
        x = nextX;
        y = nextY;
      }
    }
  });
  SEEDS.forEach((seed, index) => {
    const radius = 16 + unitHash(index + 80) * 18;
    const start = unitHash(index + 3) * Math.PI * 2;
    const sweep = 0.7 + unitHash(index + 9) * 0.9;
    for (let step = 0; step < 3; step += 1) {
      const a0 = start + sweep * (step / 3);
      const a1 = start + sweep * ((step + 1) / 3);
      traces.push({
        ax: seed[0] + Math.cos(a0) * radius,
        ay: seed[1] + Math.sin(a0) * radius * 0.72,
        bx: seed[0] + Math.cos(a1) * radius,
        by: seed[1] + Math.sin(a1) * radius * 0.72,
        stage: 1,
        kind: "ghost",
        partial: 1,
      });
    }
    const probe = start + 0.4;
    traces.push({
      ax: seed[0] + Math.cos(probe) * radius,
      ay: seed[1] + Math.sin(probe) * radius * 0.72,
      bx: seed[0] + Math.cos(probe) * (radius + 22),
      by: seed[1] + Math.sin(probe) * (radius + 16),
      stage: 1,
      kind: "trace",
      partial: 0.8,
    });
  });
  for (let index = 0; index < SEEDS.length - 1; index += 2) {
    const from = SEEDS[index];
    const toward = SEEDS[index + 1];
    traces.push({ ax: from[0], ay: from[1], bx: (from[0] + toward[0]) / 2 + 18, by: (from[1] + toward[1]) / 2 - 12, stage: 2, kind: "trace", partial: 0.72 });
    traces.push({ ax: (from[0] + toward[0]) / 2 + 18, ay: (from[1] + toward[1]) / 2 - 12, bx: toward[0], by: toward[1], stage: 2, kind: "hot", partial: 0.66 });
  }
  SEEDS.forEach((seed, index) => {
    if (index % 2 !== 0) return;
    const next = SEEDS[(index + 3) % SEEDS.length];
    traces.push({ ax: seed[0], ay: seed[1], bx: next[0] + 10, by: next[1] - 8, stage: 3, kind: "hot", partial: 0.58 });
    traces.push({ ax: seed[0] + 3, ay: seed[1] + 3, bx: next[0] + 14, by: next[1] - 4, stage: 3, kind: "ghost", partial: 0.4 });
  });
  for (let index = 0; index < SEEDS.length; index += 1) {
    const from = SEEDS[index];
    const toward = SEEDS[(index + 2) % SEEDS.length];
    const bendX = (from[0] + toward[0]) / 2 + (index % 2 === 0 ? 30 : -24);
    const bendY = (from[1] + toward[1]) / 2 + (index % 2 === 0 ? -20 : 16);
    traces.push({ ax: from[0], ay: from[1], bx: bendX, by: bendY, stage: 4, kind: "trace", partial: 0.64 });
    traces.push({ ax: bendX, ay: bendY, bx: toward[0], by: toward[1], stage: 4, kind: "ghost", partial: 0.5 });
  }
  for (let index = 0; index < SEEDS.length; index += 1) {
    const from = SEEDS[index];
    const toward = SEEDS[(index + 1) % SEEDS.length];
    traces.push({ ax: from[0], ay: from[1], bx: toward[0], by: toward[1], stage: 5, kind: index % 3 === 0 ? "hot" : "ghost", partial: 0.36 });
  }
  return traces;
}

const FIELD = buildField();

function signalInk(kind: Trace["kind"]) {
  if (kind === "hot") return "#c77e5f";
  if (kind === "ghost") return "rgba(126,169,171,0.9)";
  return "rgba(244,244,240,0.82)";
}

const ORIGINS: Array<[number, number]> = [
  [220, 300],
  [460, 150],
  [740, 340],
  [1020, 160],
  [1280, 310],
  [560, 450],
];

type Arm = {
  ox: number;
  oy: number;
  angle: number;
  length: number;
  fork: number;
  side: number;
  strong: boolean;
  bend: number;
  neighbor: number;
  seed: number;
};

const ARMS: Arm[] = ORIGINS.flatMap((origin, index) =>
  Array.from({ length: 5 }, (_, arm) => ({
    ox: origin[0],
    oy: origin[1],
    angle: unitHash(index * 19 + arm * 5) * Math.PI * 2,
    length: 78 + unitHash(index * 3 + arm) * 150,
    fork: 0.4 + unitHash(arm + 8) * 0.18,
    side: arm % 2 === 0 ? 0.62 : -0.68,
    strong: (index + arm) % 3 !== 0,
    bend: (arm % 2 === 0 ? 1 : -1) * (0.42 + unitHash(index + arm) * 0.28),
    neighbor: (index + 1 + (arm % 2)) % ORIGINS.length,
    seed: unitHash(index * 11 + arm * 7),
  })),
);

function armPoint(arm: Arm, grow: number, bend: number) {
  const angle = arm.angle + arm.bend * bend;
  const length = arm.length * grow;
  return {
    x: arm.ox + Math.cos(angle) * length,
    y: arm.oy + Math.sin(angle) * length * 0.62,
    angle,
    length,
  };
}

function FieldEnergy({ time }: { time: number }) {
  const active = Math.min(5, Math.max(0, Math.floor((time - STEPS_START) / STEP_SPAN)));
  return (
    <g fill="none" strokeLinecap="square">
      {Array.from({ length: 6 }, (_, index) => (
        <path key={`tick-${index}`} d={`M ${640 + index * 36} 16 h ${index === active ? 22 : 10}`} stroke={index === active ? "#c77e5f" : "rgba(244,244,240,0.45)"} strokeWidth="1.6" />
      ))}
    </g>
  );
}

function Process({ time, stage, reveal }: { time: number; stage: number; reveal: number }) {
  let shown = stage;
  let stepReveal = reveal;
  let motion = time;
  if (stage >= 5) {
    const local = Math.max(0, time - (STEPS_START + 5 * STEP_SPAN));
    const loop = 1.05;
    const scaled = ((local % loop) / loop) * 5;
    shown = Math.min(4, Math.floor(scaled));
    stepReveal = Math.min(1, scaled - shown);
    motion = time * 2.8;
  }
  const grow = shown === 0 ? stepReveal : 1;
  const bend = shown < 4 ? 0 : stepReveal;
  const sense = shown >= 1 ? (shown === 1 ? stepReveal : 1) : 0;
  const flow = shown >= 2 ? (shown === 2 ? stepReveal : 1) : 0;
  const hold = shown >= 3 ? (shown === 3 ? stepReveal : 1) : 0;
  return (
    <g fill="none" strokeLinecap="square">
      {ARMS.map((arm, index) => {
        const armDelay = shown === 0 ? arm.seed * 0.34 : 0;
        const armGrow = shown === 0 ? clamp01((stepReveal - armDelay) / (1 - armDelay)) : grow;
        const forkMix = shown === 0 ? clamp01((armGrow - 0.32) / 0.68) : 1;
        const live = armPoint(arm, armGrow, bend);
        const former = armPoint(arm, 1, 0);
        const forkX = arm.ox + (live.x - arm.ox) * arm.fork;
        const forkY = arm.oy + (live.y - arm.oy) * arm.fork;
        const branchX = forkX + Math.cos(live.angle + arm.side) * live.length * 0.22 * forkMix;
        const branchY = forkY + Math.sin(live.angle + arm.side) * live.length * 0.14 * forkMix;
        const kept = arm.strong;
        const faded = kept ? 1 : 1 - hold * 0.72;
        const stroke = kept && hold > 0.05 ? "#c77e5f" : "rgba(244,244,240,0.84)";
        const width = kept ? 0.9 + hold * 0.85 : 0.85;
        const ping = ((motion * 1.6 + arm.seed) % 1);
        const detect = ping < 0.5 ? ping * 2 : (1 - ping) * 2;
        const along = flow > 0 ? ((motion * 0.72 + arm.seed) % 1) * flow : detect * 0.42 * sense;
        const showPacket = (sense > 0.05 || flow > 0.05) && (kept || hold < 0.4);
        const packetX = arm.ox + (live.x - arm.ox) * along;
        const packetY = arm.oy + (live.y - arm.oy) * along;
        return (
          <g key={`${arm.ox}-${index}`} opacity={(shown === 0 ? armGrow : 1) * (0.25 + faded * 0.75)}>
            {bend > 0.04 && kept ? (
              <path d={`M ${arm.ox} ${arm.oy} L ${former.x} ${former.y}`} stroke="rgba(244,244,240,0.28)" strokeWidth="0.7" strokeDasharray="5 8" />
            ) : null}
            <path d={`M ${arm.ox} ${arm.oy} L ${live.x} ${live.y}`} stroke={stroke} strokeWidth={width} />
            <path d={`M ${forkX} ${forkY} L ${branchX} ${branchY}`} stroke="#7ea9ab" strokeWidth="0.75" opacity={0.85} />
            {shown < 2 && armGrow > 0.2 ? <path d={`M ${live.x - 5} ${live.y} h 10 M ${live.x} ${live.y - 5} v 10`} stroke="#49d6de" strokeWidth="0.8" opacity={shown === 0 ? armGrow : 1} /> : null}
            {flow > 0.2 ? <path d={`M ${live.x - Math.cos(live.angle) * 10} ${live.y - Math.sin(live.angle) * 6} l ${Math.cos(live.angle) * 10} ${Math.sin(live.angle) * 6}`} stroke="#c77e5f" strokeWidth="1.1" /> : null}
            {showPacket ? <circle cx={packetX} cy={packetY} r={flow > 0.2 ? 2.1 : 1.5} fill={flow > 0.2 ? "#49d6de" : "#f4f4f0"} stroke="none" /> : null}
          </g>
        );
      })}
      {ORIGINS.map((origin, index) => {
        const radius = 16 + (((motion * 0.85 + index * 0.17) % 1) * 78);
        const sweep = motion * 2.1 + index;
        const emerging = shown === 0;
        return (
          <g key={`node-${origin[0]}`} opacity={emerging ? stepReveal : 0.2 + sense * 0.8}>
            {emerging ? null : <circle cx={origin[0]} cy={origin[1]} r={radius} stroke="#49d6de" strokeWidth="0.85" strokeDasharray="10 16" opacity={shown === 1 ? 0.95 : 0.35} />}
            {emerging ? null : <path d={`M ${origin[0]} ${origin[1]} L ${origin[0] + Math.cos(sweep) * (28 + sense * 36)} ${origin[1] + Math.sin(sweep) * (18 + sense * 24)}`} stroke="#f4f4f0" strokeWidth="1" />}
            <circle cx={origin[0]} cy={origin[1]} r={emerging ? 0.6 + stepReveal * 1.6 : 2.2} fill={shown >= 3 ? "#c77e5f" : "#f4f4f0"} stroke="none" />
          </g>
        );
      })}
    </g>
  );
}

function StepGraphics({ time, stage, reveal }: { time: number; stage: number; reveal: number }) {
  return (
    <g>
      <FieldEnergy time={time} />
      <Process time={time} stage={stage} reveal={reveal} />
    </g>
  );
}

type NetNode = {
  x: number;
  y: number;
  seed: number;
  delay: number;
  extend: boolean;
  retract: boolean;
  reroute: boolean;
};

type NetTube = {
  a: number;
  b: number;
  bow: number;
  offsets: number[];
  rank: number;
  preferred: boolean;
  delay: number;
  bridge: boolean;
  reroute: boolean;
};

type NetHair = {
  x: number;
  y: number;
  angle: number;
  length: number;
  delay: number;
  seed: number;
};

const ORGANISM = { x: 760, y: 286 };
const CONDITION = { x: 980, y: 168 };

function buildNetwork() {
  const nodes: NetNode[] = [{
    x: ORGANISM.x,
    y: ORGANISM.y,
    seed: 0.4,
    delay: 0,
    extend: false,
    retract: false,
    reroute: false,
  }];
  const fronts = [-1.35, -0.35, 0.55, 1.45, 2.35];
  for (let index = 0; index < 34; index += 1) {
    const front = fronts[index % fronts.length];
    const angle = front + (unitHash(index * 4) - 0.5) * 0.85;
    const radius = 34 + unitHash(index * 7) * 250;
    const x = ORGANISM.x + Math.cos(angle) * radius * (0.75 + unitHash(index + 2) * 0.55);
    const y = ORGANISM.y + Math.sin(angle) * radius * 0.62;
    nodes.push({
      x,
      y,
      seed: index * 1.37,
      delay: Math.min(0.42, 0.02 + (radius / 520) * 0.38),
      extend: index % 5 === 1,
      retract: index % 6 === 2,
      reroute: Math.hypot(x - CONDITION.x, y - CONDITION.y) < 190,
    });
  }
  const tubes: NetTube[] = [];
  const linked = new Set<string>();
  const link = (a: number, b: number, rank: number, preferred: boolean, bridge = false) => {
    if (a === b) return;
    const key = a < b ? `${a}-${b}` : `${b}-${a}`;
    if (linked.has(key)) return;
    linked.add(key);
    tubes.push({
      a,
      b,
      bow: (unitHash(a * 19 + b * 3) - 0.5) * 22,
      offsets: [0, 1, 2, 3].map((step) => (unitHash(a * 5 + b * 9 + step) - 0.5) * 34),
      rank,
      preferred,
      delay: bridge ? 0 : Math.max(nodes[a].delay, nodes[b].delay) * 0.85,
      bridge,
      reroute: nodes[a].reroute || nodes[b].reroute,
    });
  };
  for (let index = 1; index < nodes.length; index += 1) {
    const node = nodes[index];
    const reach = Math.hypot(node.x - ORGANISM.x, node.y - ORGANISM.y);
    const parent = nodes
      .map((other, nodeIndex) => ({
        nodeIndex,
        distance: Math.hypot(other.x - node.x, other.y - node.y),
        inward: Math.hypot(other.x - ORGANISM.x, other.y - ORGANISM.y) < reach - 12,
      }))
      .filter((item) => item.nodeIndex !== index && item.inward)
      .sort((left, right) => left.distance - right.distance)[0];
    const preferred = index % 4 === 0;
    link(index, parent ? parent.nodeIndex : 0, preferred ? 2 : 1, preferred);
    const side = nodes
      .map((other, nodeIndex) => ({ nodeIndex, distance: Math.hypot(other.x - node.x, other.y - node.y) }))
      .filter((item) => item.nodeIndex !== index && item.nodeIndex !== (parent ? parent.nodeIndex : 0) && item.distance > 40 && item.distance < 280)
      .sort((left, right) => left.distance - right.distance)[0];
    if (side && index % 3 === 0) link(index, side.nodeIndex, 0, false);
  }
  link(7, 24, 1, true, true);
  const hairs: NetHair[] = [];
  tubes.forEach((tube, index) => {
    if (tube.bridge || index % 2 !== 0) return;
    const from = nodes[tube.a];
    const to = nodes[tube.b];
    hairs.push({
      x: (from.x + to.x) / 2,
      y: (from.y + to.y) / 2,
      angle: Math.atan2(to.y - from.y, to.x - from.x) + (index % 4 === 0 ? 0.9 : -0.85),
      length: 12 + unitHash(index * 11) * 22,
      delay: tube.delay + 0.18,
      seed: index * 2.1,
    });
  });
  return { nodes, tubes, hairs };
}

const NETWORK = buildNetwork();

function fieldFrame(time: number) {
  const stepIn = smoothstep(openAmount(time, STEPS_START - 0.2, STEPS_START + 1.15));
  const immerse = smoothstep(openAmount(time, STEPS_START + 0.35, STEPS_START + 1.7));
  const handoff = smoothstep(openAmount(time, STEPS_END - 1.15, VIDEOS_AT + 0.75));
  const x = 240 + (600 - 240) * stepIn + (340 - 600) * handoff;
  const y = 300 + (290 - 300) * stepIn;
  const scale = 0.7 + stepIn * 0.95 + immerse * 0.4 + handoff * 0.65;
  return { x, y, scale, handoff };
}

function organismBehavior(time: number, stage: number, reveal: number) {
  if (time < STEPS_START) {
    return { grown: 0, sensing: 0, moving: 0, streaming: 0, reinforced: 0, adapting: 0 };
  }
  const grown = stage === 0 ? reveal : 1;
  if (stage >= 5) {
    const local = Math.max(0, time - (STEPS_START + 5 * STEP_SPAN));
    const cycle = (local % 1.05) / 1.05;
    return {
      grown: 1,
      sensing: cycle < 0.34 ? 1 : 0,
      moving: cycle > 0.26 && cycle < 0.72 ? 1 : 0,
      streaming: cycle > 0.26 && cycle < 0.52 ? 1 : 0,
      reinforced: cycle > 0.46 && cycle < 0.84 ? 1 : 0,
      adapting: cycle > 0.62 ? (cycle - 0.62) / 0.38 : 0,
    };
  }
  return {
    grown,
    sensing: stage === 1 ? 1 : stage === 2 ? 1 - reveal : 0,
    moving: stage >= 2 ? (stage === 2 ? reveal : 1) : 0,
    streaming: stage === 2 ? 0.4 + reveal * 0.6 : 0,
    reinforced: stage >= 3 ? (stage === 3 ? reveal : 1) : 0,
    adapting: stage === 4 ? reveal : 0,
  };
}

function placeNode(node: NetNode, time: number, moving: number, adapting: number) {
  const frame = fieldFrame(time);
  let x = frame.x + (node.x - ORGANISM.x) * frame.scale;
  let y = frame.y + (node.y - ORGANISM.y) * frame.scale;
  x += Math.sin(time * 0.33 + node.seed) * 4.5 * frame.scale * 0.35 + moving * 26;
  y += Math.cos(time * 0.27 + node.seed * 1.4) * 3.4 * frame.scale * 0.35 - moving * 10;
  if (node.extend) {
    x += moving * 36 * frame.scale * 0.35;
    y += Math.sin(node.seed) * moving * 14;
  }
  if (node.retract) {
    x += (frame.x - x) * moving * 0.34;
    y += (frame.y - y) * moving * 0.34;
  }
  const block = {
    x: frame.x + (CONDITION.x - ORGANISM.x) * frame.scale,
    y: frame.y + (CONDITION.y - ORGANISM.y) * frame.scale,
  };
  if (node.reroute && adapting > 0) {
    const dx = x - block.x;
    const dy = y - block.y;
    const dist = Math.hypot(dx, dy) || 1;
    const push = Math.max(0, 150 * frame.scale * 0.45 - dist) * adapting;
    x += (dx / dist) * push;
    y += (dy / dist) * push;
  }
  if (time > SENTENCE_A && time < STEPS_START - 0.15) {
    const focus = clamp01((time - SENTENCE_A) / 0.7) * (1 - clamp01((time - (STEPS_START - 0.7)) / 0.45));
    const dx = x - 820;
    const dy = y - 280;
    const dist = Math.hypot(dx, dy) || 1;
    const push = Math.max(0, 150 - dist) * 0.62 * focus;
    x += (dx / dist) * push;
    y += (dy / dist) * push;
  }
  return { x, y };
}

function sampleFilament(points: Array<{ x: number; y: number }>, reach: number) {
  const samples: Array<{ x: number; y: number }> = [];
  const steps = 10;
  for (let step = 0; step <= steps; step += 1) {
    samples.push(pointAlong(points, (step / steps) * reach));
  }
  return samples;
}

function fillTube(context: CanvasRenderingContext2D, points: Array<{ x: number; y: number }>, reach: number, width: number) {
  const samples = sampleFilament(points, reach);
  if (samples.length < 2) return;
  const left: Array<{ x: number; y: number }> = [];
  const right: Array<{ x: number; y: number }> = [];
  samples.forEach((point, index) => {
    const next = samples[Math.min(samples.length - 1, index + 1)];
    const prev = samples[Math.max(0, index - 1)];
    const dx = next.x - prev.x;
    const dy = next.y - prev.y;
    const span = Math.hypot(dx, dy) || 1;
    const taper = width * (1 - (index / (samples.length - 1)) * 0.72);
    left.push({ x: point.x + (-dy / span) * taper, y: point.y + (dx / span) * taper });
    right.push({ x: point.x - (-dy / span) * taper, y: point.y - (dx / span) * taper });
  });
  context.beginPath();
  context.moveTo(left[0].x, left[0].y);
  left.forEach((point) => context.lineTo(point.x, point.y));
  for (let index = right.length - 1; index >= 0; index -= 1) context.lineTo(right[index].x, right[index].y);
  context.closePath();
  context.fill();
}

function traceFilament(context: CanvasRenderingContext2D, points: Array<{ x: number; y: number }>, reach: number) {
  const last = Math.max(0.04, (points.length - 1) * reach);
  const whole = Math.min(points.length - 1, Math.floor(last));
  const frac = last - whole;
  context.beginPath();
  context.moveTo(points[0].x, points[0].y);
  for (let index = 1; index < whole; index += 1) {
    const midX = (points[index].x + points[index + 1].x) / 2;
    const midY = (points[index].y + points[index + 1].y) / 2;
    context.quadraticCurveTo(points[index].x, points[index].y, midX, midY);
  }
  const endIndex = Math.min(points.length - 1, whole + (frac > 0 ? 1 : 0));
  const from = points[Math.max(0, endIndex - 1)];
  const to = points[endIndex];
  context.quadraticCurveTo(from.x, from.y, from.x + (to.x - from.x) * (frac > 0 && whole < points.length - 1 ? frac : 1), from.y + (to.y - from.y) * (frac > 0 && whole < points.length - 1 ? frac : 1));
  context.stroke();
}

function pointAlong(points: Array<{ x: number; y: number }>, at: number) {
  const scaled = clamp01(at) * (points.length - 1);
  const index = Math.min(points.length - 2, Math.floor(scaled));
  const frac = scaled - index;
  return {
    x: points[index].x + (points[index + 1].x - points[index].x) * frac,
    y: points[index].y + (points[index + 1].y - points[index].y) * frac,
  };
}

function tubePoints(from: { x: number; y: number }, to: { x: number; y: number }, offsets: number[]) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const span = Math.hypot(dx, dy) || 1;
  const points = [from];
  offsets.forEach((offset, index) => {
    const at = (index + 1) / (offsets.length + 1);
    points.push({
      x: from.x + dx * at + (-dy / span) * offset,
      y: from.y + dy * at + (dx / span) * offset,
    });
  });
  points.push(to);
  return points;
}

function drawJunction(context: CanvasRenderingContext2D, x: number, y: number, radius: number, alpha: number) {
  const glow = context.createRadialGradient(x, y, 0, x, y, radius * 3.2);
  glow.addColorStop(0, `rgba(255,255,255,${(alpha * 0.9).toFixed(3)})`);
  glow.addColorStop(0.35, `rgba(255,255,255,${(alpha * 0.28).toFixed(3)})`);
  glow.addColorStop(1, "rgba(0,0,0,0)");
  context.fillStyle = glow;
  context.beginPath();
  context.arc(x, y, radius * 3.2, 0, Math.PI * 2);
  context.fill();
}

function drawLivingNetwork(context: CanvasRenderingContext2D, time: number, stage: number, reveal: number) {
  const frame = fieldFrame(time);
  const presence = 1 - frame.handoff * 0.42;
  const { grown, sensing, moving, streaming, reinforced, adapting } = organismBehavior(time, stage, reveal);
  const placed = NETWORK.nodes.map((node) => placeNode(node, time, moving, adapting));
  const block = {
    x: frame.x + (CONDITION.x - ORGANISM.x) * frame.scale,
    y: frame.y + (CONDITION.y - ORGANISM.y) * frame.scale,
  };
  context.save();
  context.lineCap = "round";
  context.lineJoin = "round";
  context.setLineDash([]);
  const voids = [
    { x: frame.x - 90 * frame.scale * 0.35 + Math.sin(time * 0.21) * 10, y: frame.y + 40, r: 34 * frame.scale * 0.35 },
    { x: frame.x + 70 * frame.scale * 0.35, y: frame.y - 50 + Math.cos(time * 0.18) * 8, r: 26 * frame.scale * 0.35 },
    { x: block.x, y: block.y + Math.sin(time * 0.16) * 6, r: (34 + adapting * 70) * frame.scale * 0.4 },
  ];
  voids.forEach((hole, index) => {
    const amount = index === 2 ? adapting : 0.35 + grown * 0.25;
    if (amount < 0.04) return;
    const shade = context.createRadialGradient(hole.x, hole.y, 2, hole.x, hole.y, hole.r);
    shade.addColorStop(0, `rgba(0,0,0,${(0.78 * amount).toFixed(3)})`);
    shade.addColorStop(1, "rgba(0,0,0,0)");
    context.fillStyle = shade;
    context.beginPath();
    context.arc(hole.x, hole.y, hole.r, 0, Math.PI * 2);
    context.fill();
  });
  NETWORK.tubes.forEach((tube, index) => {
    const opened = tube.bridge ? adapting : clamp01((grown - tube.delay) / Math.max(0.08, 1 - tube.delay));
    if (opened < 0.03) return;
    const from = placed[tube.a];
    const to = placed[tube.b];
    const shorten = !tube.preferred ? Math.max(moving * 0.22, reinforced * (tube.rank === 0 ? 0.82 : 0.58)) : 0;
    const reach = opened * (1 - shorten);
    const span = Math.hypot(to.x - from.x, to.y - from.y) || 1;
    const points = tubePoints(from, to, tube.offsets.map((offset) => (offset / 17) * span * 0.18));
    const fade = tube.preferred ? 1 : 1 - reinforced * (tube.rank === 0 ? 0.92 : 0.74);
    const width = (tube.rank === 2 ? 2.4 : tube.rank === 1 ? 1.25 : 0.62) * frame.scale * 0.55 * (tube.preferred ? 1 + reinforced * 1.8 : 1);
    const alpha = fade * (0.34 + opened * 0.66);
    if (tube.reroute && adapting > 0.08) {
      const ghostFrom = {
        x: frame.x + (NETWORK.nodes[tube.a].x - ORGANISM.x) * frame.scale,
        y: frame.y + (NETWORK.nodes[tube.a].y - ORGANISM.y) * frame.scale,
      };
      const ghostTo = {
        x: frame.x + (NETWORK.nodes[tube.b].x - ORGANISM.x) * frame.scale,
        y: frame.y + (NETWORK.nodes[tube.b].y - ORGANISM.y) * frame.scale,
      };
      context.globalAlpha = alpha * (1 - adapting) * 0.28 * presence;
      context.strokeStyle = "rgba(244,244,240,0.55)";
      context.lineWidth = 0.45;
      traceFilament(context, tubePoints(ghostFrom, ghostTo, tube.offsets), reach * (1 - adapting * 0.65));
    }
    context.globalAlpha = alpha * 0.42 * presence;
    context.fillStyle = "rgba(255,255,255,0.88)";
    fillTube(context, points, reach, width * 1.7);
    context.globalAlpha = alpha * 0.75 * presence;
    context.strokeStyle = "rgba(255,255,255,0.92)";
    context.lineWidth = Math.max(0.35, width * 0.28);
    traceFilament(context, points, reach);
    if (!tube.bridge && opened > 0.28 && reinforced < 0.85) {
      const mid = pointAlong(points, 0.42 * reach);
      const angle = Math.atan2(to.y - from.y, to.x - from.x) + (index % 4 === 0 ? 1.05 : -0.95);
      const sway = Math.sin(time * 0.4 + index) * 0.2;
      const length = (36 + (index % 5) * 18) * Math.min(1.5, frame.scale * 0.6);
      const x1 = mid.x + Math.cos(angle + sway) * length;
      const y1 = mid.y + Math.sin(angle + sway) * length * 0.7;
      context.globalAlpha = alpha * (1 - reinforced * 0.75) * 0.5 * presence;
      context.strokeStyle = "rgba(255,255,255,0.75)";
      context.lineWidth = 0.38;
      context.beginPath();
      context.moveTo(mid.x, mid.y);
      context.quadraticCurveTo((mid.x + x1) / 2 + 3, (mid.y + y1) / 2 - 2, x1, y1);
      context.stroke();
    }
    const flow = sensing * 0.9 + streaming;
    if (flow > 0.08 && !tube.bridge && tube.rank > 0) {
      const count = tube.preferred ? 2 : 1;
      for (let bead = 0; bead < count; bead += 1) {
        const at = ((time * (streaming > 0.4 ? 0.5 : 0.24) + index * 0.17 + bead * 0.46) % 1) * reach;
        const point = pointAlong(points, at);
        context.globalAlpha = alpha * flow * presence;
        context.fillStyle = "#ffffff";
        context.beginPath();
        context.arc(point.x, point.y, (tube.preferred ? 2.1 : 1.25) * frame.scale * 0.38, 0, Math.PI * 2);
        context.fill();
      }
    }
  });
  placed.forEach((point, index) => {
    const node = NETWORK.nodes[index];
    const opened = clamp01((grown - node.delay) / Math.max(0.08, 1 - node.delay));
    if (opened < 0.2) return;
    const bright = node.extend || index % 4 === 0;
    drawJunction(context, point.x, point.y, (bright ? 2.3 : 1.4) * frame.scale * 0.38 * (1 + (bright ? reinforced * 0.45 : 0)), presence * opened * (bright ? 0.85 : 0.45));
    if (sensing > 0.2 && index % 5 === 1) {
      context.globalAlpha = presence * sensing * 0.55;
      context.fillStyle = "rgba(255,255,255,0.9)";
      context.beginPath();
      context.arc(point.x, point.y, 2.2 * frame.scale * 0.4, 0, Math.PI * 2);
      context.fill();
      context.globalAlpha = presence * sensing * 0.18;
      context.strokeStyle = "rgba(255,255,255,0.8)";
      context.lineWidth = 0.6;
      context.beginPath();
      context.arc(point.x, point.y, 9 * frame.scale * 0.4, 0, Math.PI * 2);
      context.stroke();
    }
  });
  if (adapting > 0.08) {
    context.globalAlpha = presence * adapting * 0.7;
    context.strokeStyle = "rgba(255,255,255,0.55)";
    context.lineWidth = 1.1;
    context.beginPath();
    context.ellipse(block.x, block.y, 78 * frame.scale * 0.4, 46 * frame.scale * 0.4, -0.4, 0, Math.PI * 2);
    context.stroke();
  }
  context.restore();
}

type MoldNode = {
  x: number;
  y: number;
  delay: number;
  angle: number;
  dist: number;
  preferred: boolean;
  drop: boolean;
  fresh: boolean;
};

type MoldTube = {
  a: number;
  b: number;
  rank: number;
  bow: number;
  fresh: boolean;
  drop: boolean;
  path?: Array<{ x: number; y: number }>;
};

type MoldGraph = { nodes: MoldNode[]; tubes: MoldTube[] };

let moldGraph: MoldGraph | null = null;
let moldInk: HTMLCanvasElement | null = null;
let moldBody: HTMLCanvasElement | null = null;
let moldBodySoft: HTMLCanvasElement | null = null;
let moldFrame: HTMLCanvasElement | null = null;
let moldFrameKey = "";
let moldSlideKey = Number.NaN;

function physarumGraph() {
  if (moldGraph) return moldGraph;
  const rx = 700;
  const ry = 220;
  const nodes: MoldNode[] = [];
  const place = (angle: number, dist: number, preferred: boolean, drop: boolean, fresh: boolean, gap: number) => {
    const x = Math.cos(angle) * rx * dist;
    const y = Math.sin(angle) * ry * dist;
    if (nodes.some((node) => Math.hypot(node.x - x, node.y - y) < gap)) return;
    nodes.push({
      x,
      y,
      delay: fresh ? 0 : Math.max(0, (dist - 0.12) / 0.88) * 0.84,
      angle,
      dist,
      preferred,
      drop,
      fresh,
    });
  };
  for (let index = 0; index < 980; index += 1) {
    const angle = unitHash(index * 2.17) * Math.PI * 2;
    const dist = 0.05 + Math.pow(unitHash(index * 5.3 + 1.7), 0.48) * 0.95;
    const preferred = [-2.2, -0.95, 0.15, 1.15, 2.35].some((heading) => Math.abs(Math.atan2(Math.sin(angle - heading), Math.cos(angle - heading))) < 0.22);
    place(angle, dist, preferred, angle > -0.35 && angle < 0.7 && dist > 0.32, false, dist > 0.72 ? 9 : 12);
  }
  for (let index = 0; index < 22; index += 1) {
    const angle = -1.75 + (unitHash(index + 40) - 0.5) * 0.95;
    const dist = 0.28 + unitHash(index + 60) * 0.7;
    place(angle, dist, true, false, true, 10);
  }
  const tubes: MoldTube[] = [];
  const linked = new Set<string>();
  nodes.forEach((node, index) => {
    if (node.fresh) return;
    const near = nodes
      .map((other, otherIndex) => ({ otherIndex, distance: Math.hypot(other.x - node.x, other.y - node.y) }))
      .filter((item) => item.otherIndex > index && item.distance > 7 && item.distance < 34 && !nodes[item.otherIndex].fresh)
      .sort((left, right) => left.distance - right.distance)
      .slice(0, node.dist < 0.4 ? 3 : 2);
    near.forEach((item) => {
      const key = `${index}-${item.otherIndex}`;
      if (linked.has(key)) return;
      linked.add(key);
      const other = nodes[item.otherIndex];
      const preferred = node.preferred && other.preferred;
      const along = Math.abs(Math.atan2(Math.sin(other.angle - node.angle), Math.cos(other.angle - node.angle))) < 0.55;
      const fine = !preferred && (node.dist > 0.48 || other.dist > 0.48 || item.distance < 24);
      tubes.push({
        a: index,
        b: item.otherIndex,
        rank: preferred && along && item.distance > 22 ? 2 : fine ? 0 : 1,
        bow: (unitHash(index * 4.1 + item.otherIndex) - 0.5) * (10 + item.distance * 0.35),
        fresh: false,
        drop: node.drop || other.drop,
      });
    });
  });
  nodes.forEach((node, index) => {
    if (!node.fresh) return;
    const near = nodes
      .map((other, otherIndex) => ({ otherIndex, distance: Math.hypot(other.x - node.x, other.y - node.y) }))
      .filter((item) => item.otherIndex !== index && !nodes[item.otherIndex].drop && item.distance < 70)
      .sort((left, right) => left.distance - right.distance)
      .slice(0, 2);
    near.forEach((item) => {
      const key = index < item.otherIndex ? `${index}-${item.otherIndex}` : `${item.otherIndex}-${index}`;
      if (linked.has(key)) return;
      linked.add(key);
      tubes.push({
        a: index,
        b: item.otherIndex,
        rank: 2,
        bow: (unitHash(index * 3 + item.otherIndex) - 0.5) * 16,
        fresh: true,
        drop: false,
      });
    });
  });
  const baseCount = tubes.length;
  for (let index = 0; index < baseCount; index += 1) {
    const tube = tubes[index];
    if (tube.rank === 2 || tube.fresh || index % 3 === 0) continue;
    const from = nodes[tube.a];
    const to = nodes[tube.b];
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const span = Math.hypot(dx, dy) || 1;
    const side = index % 4 === 0 ? 1 : -1;
    const length = 8 + unitHash(index * 1.7) * 14;
    const x = (from.x + to.x) / 2 + (-dy / span) * side * length;
    const y = (from.y + to.y) / 2 + (dx / span) * side * length * 0.78;
    nodes.push({
      x,
      y,
      delay: Math.min(0.92, Math.max(from.delay, to.delay) + 0.1),
      angle: Math.atan2(y, x),
      dist: Math.max(from.dist, to.dist),
      preferred: false,
      drop: from.drop || to.drop,
      fresh: false,
    });
    tubes.push({
      a: tube.a,
      b: nodes.length - 1,
      rank: 0,
      bow: (unitHash(index + 8) - 0.5) * 14,
      fresh: false,
      drop: from.drop || to.drop,
    });
    if (index % 2 === 0) {
      const tip = nodes[nodes.length - 1];
      const fork = unitHash(index + 19) > 0.5 ? 0.7 : -0.8;
      const aim = Math.atan2(tip.y - from.y, tip.x - from.x) + fork;
      const forkLength = 10 + unitHash(index + 4) * 16;
      nodes.push({
        x: tip.x + Math.cos(aim) * forkLength,
        y: tip.y + Math.sin(aim) * forkLength * 0.78,
        delay: Math.min(0.96, tip.delay + 0.06),
        angle: aim,
        dist: tip.dist,
        preferred: false,
        drop: tip.drop,
        fresh: false,
      });
      tubes.push({
        a: nodes.length - 2,
        b: nodes.length - 1,
        rank: 0,
        bow: (unitHash(index + 2) - 0.5) * 8,
        fresh: false,
        drop: tip.drop,
      });
    }
  }
  tubes.forEach((tube) => {
    tube.path = moldTubePoints(nodes[tube.a], nodes[tube.b], tube.bow);
  });
  moldGraph = { nodes, tubes };
  return moldGraph;
}

function drawMoldRibbon(context: CanvasRenderingContext2D, points: Array<{ x: number; y: number }>, reach: number, widthAt: (at: number) => number) {
  if (reach < 0.03) return;
  const steps = 10;
  const samples: Array<{ x: number; y: number; w: number }> = [];
  for (let step = 0; step <= steps; step += 1) {
    const at = (step / steps) * reach;
    const point = pointAlong(points, at);
    samples.push({ x: point.x, y: point.y, w: Math.max(0.35, widthAt(at)) });
  }
  const left: Array<{ x: number; y: number }> = [];
  const right: Array<{ x: number; y: number }> = [];
  samples.forEach((point, index) => {
    const next = samples[Math.min(samples.length - 1, index + 1)];
    const prev = samples[Math.max(0, index - 1)];
    const dx = next.x - prev.x;
    const dy = next.y - prev.y;
    const span = Math.hypot(dx, dy) || 1;
    left.push({ x: point.x + (-dy / span) * point.w, y: point.y + (dx / span) * point.w });
    right.push({ x: point.x - (-dy / span) * point.w, y: point.y - (dx / span) * point.w });
  });
  context.beginPath();
  context.moveTo(left[0].x, left[0].y);
  for (let index = 1; index < left.length; index += 1) context.lineTo(left[index].x, left[index].y);
  for (let index = right.length - 1; index >= 0; index -= 1) context.lineTo(right[index].x, right[index].y);
  context.closePath();
  context.fill();
}

function sequenceState(stage: number, progress: number): { grown: number; sensing: number; senseAt: number; slide: number; streaming: number; reinforced: number; adapting: number } {
  const t = clamp01(progress);
  if (stage >= 5) {
    const slice = t * 5;
    return sequenceState(Math.min(4, Math.floor(slice)), slice - Math.floor(slice));
  }
  return {
    grown: stage === 0 ? t : 1,
    sensing: stage === 1 ? 1 : 0,
    senseAt: stage === 1 ? t : 0,
    slide: stage === 2 ? (0.5 - t) * 520 : 0,
    streaming: stage === 2 ? 1 : 0,
    reinforced: stage === 3 ? t : stage > 3 ? 1 : 0,
    adapting: stage === 4 ? t : 0,
  };
}

function senseWeight(heading: number, senseAt: number) {
  const sweep = -Math.PI * 0.9 + senseAt * Math.PI * 2.1;
  const delta = Math.atan2(Math.sin(heading - sweep), Math.cos(heading - sweep));
  return clamp01(1 - Math.abs(delta) / 0.62);
}

function nodeAmount(node: MoldNode, grown: number, adapting: number) {
  if (node.fresh) return adapting;
  const opened = clamp01((grown - node.delay) / Math.max(0.14, 1 - node.delay));
  return opened * (node.drop ? 1 - adapting * 0.96 : 1);
}

function moldTubePoints(from: MoldNode, to: MoldNode, bow: number) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const span = Math.hypot(dx, dy) || 1;
  const normalX = -dy / span;
  const normalY = dx / span;
  const points: Array<{ x: number; y: number }> = [];
  const steps = 6;
  for (let step = 0; step <= steps; step += 1) {
    const at = step / steps;
    const wave = Math.sin(at * Math.PI) * bow + Math.sin(at * 8.4 + bow) * Math.abs(bow) * 0.28;
    points.push({
      x: from.x + dx * at + normalX * wave,
      y: from.y + dy * at + normalY * wave,
    });
  }
  return points;
}

let massBrush: HTMLCanvasElement | null = null;

function massBrushCanvas() {
  if (massBrush) return massBrush;
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const brush = canvas.getContext("2d");
  if (!brush) return canvas;
  const glow = brush.createRadialGradient(size / 2, size / 2, size * 0.04, size / 2, size / 2, size / 2);
  glow.addColorStop(0, "rgba(244,244,240,1)");
  glow.addColorStop(0.38, "rgba(244,244,240,0.62)");
  glow.addColorStop(0.72, "rgba(244,244,240,0.22)");
  glow.addColorStop(1, "rgba(244,244,240,0)");
  brush.fillStyle = glow;
  brush.fillRect(0, 0, size, size);
  massBrush = canvas;
  return canvas;
}

function drawSoftMass(context: CanvasRenderingContext2D, x: number, y: number, radiusX: number, radiusY: number, rotation: number, alpha: number) {
  if (alpha < 0.015 || radiusX < 1) return;
  context.save();
  context.translate(x, y);
  context.rotate(rotation);
  context.globalAlpha = alpha;
  context.drawImage(massBrushCanvas(), -radiusX, -radiusY, radiusX * 2, radiusY * 2);
  context.restore();
}

function drawFanLobe(context: CanvasRenderingContext2D, x: number, y: number, angle: number, length: number, width: number, alpha: number) {
  if (alpha < 0.02 || length < 2) return;
  context.save();
  context.translate(x, y);
  context.rotate(angle);
  context.globalAlpha = alpha;
  context.fillStyle = "#f7f7f4";
  context.beginPath();
  context.moveTo(0, -width * 0.28);
  context.bezierCurveTo(length * 0.28, -width, length * 0.72, -width * 0.42, length, width * 0.04);
  context.bezierCurveTo(length * 0.7, width * 0.5, length * 0.26, width, 0, width * 0.28);
  context.closePath();
  context.fill();
  context.restore();
}

function drawPlasmodium(context: CanvasRenderingContext2D, graph: MoldGraph, open: number[], state: { grown: number; sensing: number; senseAt: number; reinforced: number }, presence: number) {
  graph.nodes.forEach((node, index) => {
    const amount = open[index];
    if (amount < 0.12) return;
    const weight = state.sensing > 0 ? 0.16 + senseWeight(node.angle, state.senseAt) * 0.84 : 1;
    const flesh = node.dist > 0.62 ? 1 - state.reinforced * 0.94 : 1 - state.reinforced * (node.preferred ? 0.15 : 0.45);
    const alpha = presence * amount * weight * flesh;
    if (alpha < 0.02) return;
    const spin = unitHash(index * 3.1) * Math.PI;
    const stretch = 0.55 + unitHash(index + 2) * 0.7;
    if ((index % 2 === 0 || node.dist > 0.72) && (node.dist < 0.78 || node.preferred)) {
      const radius = (node.dist < 0.35 ? 42 : node.dist < 0.62 ? 28 : 18) * (0.8 + unitHash(index + 6) * 0.45);
      drawSoftMass(context, node.x, node.y, radius, radius * stretch, spin, alpha * (node.dist < 0.4 ? 0.5 : 0.34));
    }
    if (node.dist > 0.78 && index % 3 === 0 && state.reinforced < 0.88) {
      const reach = (22 + unitHash(index + 11) * 24) * amount * (1 - state.reinforced * 0.85);
      const spread = 0.42 + unitHash(index + 4) * 0.36;
      drawFanLobe(context, node.x, node.y, node.angle - spread, reach, reach * 0.9, alpha * 0.62);
      drawFanLobe(context, node.x, node.y, node.angle, reach * 1.08, reach * 0.7, alpha * 0.5);
      drawFanLobe(context, node.x, node.y, node.angle + spread * 0.85, reach * 0.86, reach * 0.62, alpha * 0.4);
    }
  });
  for (let mass = 0; mass < 9; mass += 1) {
    const angle = unitHash(mass * 8.2) * Math.PI * 2;
    const dist = 0.18 + unitHash(mass + 3) * 0.42;
    if (state.grown < dist) continue;
    const weight = state.sensing > 0 ? 0.2 + senseWeight(angle > Math.PI ? angle - Math.PI * 2 : angle, state.senseAt) : 1;
    drawSoftMass(
      context,
      Math.cos(angle) * 640 * dist,
      Math.sin(angle) * 200 * dist,
      48 + unitHash(mass + 1) * 36,
      22 + unitHash(mass + 7) * 18,
      angle + 0.4,
      presence * weight * (1 - state.reinforced * 0.55) * 0.42,
    );
  }
}

function strokeReach(context: CanvasRenderingContext2D, points: Array<{ x: number; y: number }>, reach: number) {
  context.beginPath();
  for (let step = 0; step <= 4; step += 1) {
    const point = pointAlong(points, (step / 4) * reach);
    if (step === 0) context.moveTo(point.x, point.y);
    else context.lineTo(point.x, point.y);
  }
  context.stroke();
}

type WavePose = {
  layers: number;
  amp: number;
  freq: number;
  mesh: number;
  core: number;
  cross: number;
  rings: number;
  ripples: number;
  chevrons: number;
  calipers: number;
  bars: number;
  target: number;
  infinity: number;
  flow: number;
};

const WAVE_POSES: WavePose[] = [
  { layers: 1, amp: 58, freq: 0.0064, mesh: 0.35, core: 0.45, cross: 0, rings: 0, ripples: 0, chevrons: 0, calipers: 0, bars: 0, target: 0, infinity: 0, flow: 0.15 },
  { layers: 3.15, amp: 92, freq: 0.0076, mesh: 1, core: 1, cross: 0.9, rings: 0.22, ripples: 0, chevrons: 0, calipers: 0, bars: 0, target: 0, infinity: 0, flow: 0.32 },
  { layers: 3.2, amp: 98, freq: 0.0073, mesh: 1, core: 1, cross: 1, rings: 1, ripples: 1, chevrons: 0, calipers: 0, bars: 0, target: 0, infinity: 0, flow: 0.4 },
  { layers: 4, amp: 84, freq: 0.0086, mesh: 0.95, core: 1, cross: 0, rings: 0, ripples: 0, chevrons: 1, calipers: 0, bars: 0, target: 0, infinity: 0, flow: 1 },
  { layers: 2.35, amp: 76, freq: 0.0065, mesh: 0.82, core: 1, cross: 0, rings: 0, ripples: 0, chevrons: 0, calipers: 1, bars: 0, target: 0, infinity: 0, flow: 0.42 },
  { layers: 2.5, amp: 88, freq: 0.0068, mesh: 0.78, core: 1, cross: 1, rings: 0, ripples: 0, chevrons: 0, calipers: 0, bars: 1, target: 1, infinity: 0, flow: 0.36 },
  { layers: 1.15, amp: 70, freq: 0.0072, mesh: 1, core: 1, cross: 1, rings: 0, ripples: 0, chevrons: 0, calipers: 0, bars: 0, target: 0, infinity: 1, flow: 0.55 },
];

const WAVE_BIN_ALPHA = [0.08, 0.15, 0.24, 0.36, 0.52];
let waveLine: HTMLCanvasElement | null = null;
let waveSoft: HTMLCanvasElement | null = null;
const waveBinX: Float32Array[] = [];
const waveBinY: Float32Array[] = [];
const waveBinN = [0, 0, 0, 0, 0];

function resetWaveBins() {
  if (waveBinX.length === 0) {
    for (let bin = 0; bin < 5; bin += 1) {
      waveBinX.push(new Float32Array(16000));
      waveBinY.push(new Float32Array(16000));
    }
  }
  waveBinN.fill(0);
}

function putWaveDot(alpha: number, x: number, y: number) {
  if (alpha < 0.045) return;
  const bin = alpha < 0.12 ? 0 : alpha < 0.2 ? 1 : alpha < 0.32 ? 2 : alpha < 0.48 ? 3 : 4;
  const count = waveBinN[bin];
  if (count >= 16000) return;
  waveBinX[bin][count] = x;
  waveBinY[bin][count] = y;
  waveBinN[bin] = count + 1;
}

function lerpPose(from: WavePose, to: WavePose, amount: number): WavePose {
  const pose = {} as WavePose;
  (Object.keys(from) as Array<keyof WavePose>).forEach((key) => {
    pose[key] = from[key] + (to[key] - from[key]) * amount;
  });
  return pose;
}

function waveCrest(x: number, layer: number, phase: number, pose: WavePose) {
  const shift = layer * 1.9;
  const amp = pose.amp * (1 - layer * 0.2);
  let y = Math.sin(x * pose.freq + phase + shift) * amp + Math.sin(x * pose.freq * 0.46 - phase * 0.32 + shift * 0.7) * amp * 0.34;
  y += (layer - (pose.layers - 1) * 0.5) * 34;
  if (pose.target > 0.01) {
    const dx = x - 96;
    const hole = Math.exp(-(dx * dx) / (220 * 220)) * pose.target;
    y += (layer % 2 === 0 ? -1 : 1) * hole * hole * 108;
  }
  return y;
}

function infinityPoint(turn: number, thick: number) {
  const sine = Math.sin(turn);
  const cosine = Math.cos(turn);
  const denom = 1 + sine * sine;
  const x = 250 * cosine / denom;
  const y = 168 * sine * cosine / denom;
  const tx = -250 * sine * (1 + sine * sine) - 250 * cosine * 2 * sine * cosine;
  const ty = 168 * (cosine * cosine - sine * sine) * denom - 168 * sine * cosine * 2 * sine * cosine;
  const span = Math.hypot(tx, ty) || 1;
  return { x: x + (-ty / span) * thick, y: y + (tx / span) * thick };
}

function strokeCrest(context: CanvasRenderingContext2D, pose: WavePose, phase: number, layer: number, presence: number, width: number, strength: number) {
  const fade = Math.min(1, Math.max(0, pose.layers - layer));
  if (fade < 0.04) return;
  context.beginPath();
  for (let step = 0; step <= 120; step += 1) {
    const u = step / 120;
    const x = -1180 + u * 2360;
    const crest = waveCrest(x, layer, phase, pose);
    const loop = infinityPoint(u * Math.PI * 2, layer * 8);
    const px = crest === crest ? x * (1 - pose.infinity) + loop.x * pose.infinity : x;
    const py = crest * (1 - pose.infinity) + loop.y * pose.infinity;
    if (step === 0) context.moveTo(px, py);
    else context.lineTo(px, py);
  }
  context.lineCap = "round";
  context.lineJoin = "round";
  context.strokeStyle = "#ffffff";
  context.globalAlpha = presence * pose.core * fade * strength * (layer === 0 ? 1 : 0.5);
  context.lineWidth = width * (layer === 0 ? 1 : 0.55);
  context.stroke();
}

function drawWaveMark(context: CanvasRenderingContext2D, x: number, y: number, size: number, alpha: number) {
  if (alpha < 0.03) return;
  context.globalAlpha = alpha;
  context.lineWidth = 1.1;
  context.beginPath();
  context.moveTo(x - size, y);
  context.lineTo(x + size, y);
  context.moveTo(x, y - size);
  context.lineTo(x, y + size);
  context.stroke();
}

function drawWaveSequence(output: CanvasRenderingContext2D, time: number, stage: number, width: number, height: number) {
  const local = Math.max(0, time - (STEPS_START + stage * STEP_SPAN));
  const progress = clamp01(local / Math.max(0.2, STEP_SPAN));
  const presence = smoothstep(openAmount(time, STEPS_START - 0.12, STEPS_START + 0.4)) * (1 - smoothstep(openAmount(time, STEPS_END - 0.7, VIDEOS_AT + 0.3)));
  output.setTransform(1, 0, 0, 1, 0, 0);
  output.globalCompositeOperation = "source-over";
  output.filter = "none";
  if (presence < 0.02) {
    output.clearRect(0, 0, width, height);
    return;
  }
  const pose = lerpPose(WAVE_POSES[stage] ?? WAVE_POSES[0], WAVE_POSES[stage + 1] ?? WAVE_POSES[WAVE_POSES.length - 1], smoothstep(clamp01(progress / 0.46)));
  const phase = time * (0.38 + pose.flow * 0.8);
  const pixel = width / 1600;
  output.clearRect(0, 0, width, height);
  resetWaveBins();
  const layerCount = Math.min(4, Math.ceil(pose.layers));
  const columns = 176;
  const rows = 18;
  const dotLayers = Math.min(2, layerCount);
  for (let layer = 0; layer < dotLayers; layer += 1) {
    const layerFade = Math.min(1, Math.max(0, pose.layers - layer)) * (layer === 0 ? 1 : 1 - pose.infinity * 0.92) * (layer === 0 ? 1 : 0.72);
    if (layerFade < 0.04) continue;
    for (let row = 0; row < rows; row += 1) {
      const depth = row / (rows - 1);
      for (let column = 0; column < columns; column += 1) {
        const u = (column + (row % 2) * 0.5) / columns;
        const x = -1180 + u * 2360;
        const crest = waveCrest(x, layer, phase, pose);
        const y = crest + depth * depth * 132;
        const loop = infinityPoint((u + layer * 0.04) * Math.PI * 2, (depth - 0.08) * 36);
        const px = x * (1 - pose.infinity) + loop.x * pose.infinity;
        const py = y * (1 - pose.infinity) + loop.y * pose.infinity;
        const alpha = pose.mesh * layerFade * Math.pow(1 - depth, 1.15) * (0.55 + (row % 3) * 0.08);
        putWaveDot(alpha, px, py);
      }
    }
  }
  const glowWidth = Math.round(width / 4);
  const glowHeight = Math.round(height / 4);
  waveLine = scratchCanvas(waveLine, glowWidth, glowHeight);
  waveSoft = scratchCanvas(waveSoft, glowWidth, glowHeight);
  const line = waveLine.getContext("2d");
  const soft = waveSoft.getContext("2d");
  if (!line || !soft) return;
  line.setTransform(1, 0, 0, 1, 0, 0);
  line.globalCompositeOperation = "lighter";
  line.clearRect(0, 0, glowWidth, glowHeight);
  line.save();
  line.translate(glowWidth * 0.5, glowHeight * 0.5);
  line.scale(pixel / 1.28 / 4, pixel / 4);
  line.strokeStyle = "#ffffff";
  for (let layer = 0; layer < layerCount; layer += 1) strokeCrest(line, pose, phase, layer, 1, 9, 1);
  line.restore();
  soft.setTransform(1, 0, 0, 1, 0, 0);
  soft.globalCompositeOperation = "source-over";
  soft.clearRect(0, 0, glowWidth, glowHeight);
  soft.filter = "blur(9px)";
  soft.drawImage(waveLine, 0, 0);
  soft.filter = "none";
  output.globalCompositeOperation = "lighter";
  output.globalAlpha = presence * 0.4;
  output.drawImage(waveSoft, -width * 0.03, -height * 0.035, width * 1.06, height * 1.07);
  output.globalAlpha = presence;
  output.drawImage(waveSoft, 0, 0, width, height);
  output.globalCompositeOperation = "source-over";
  output.save();
  output.translate(width * 0.5, height * 0.5);
  output.scale(pixel / 1.28, pixel);
  output.strokeStyle = "#ffffff";
  output.lineCap = "round";
  output.lineJoin = "round";
  output.fillStyle = "#ffffff";
  for (let bin = 0; bin < 5; bin += 1) {
    const count = waveBinN[bin];
    if (count < 1) continue;
    output.globalAlpha = WAVE_BIN_ALPHA[bin] * presence;
    output.beginPath();
    const xs = waveBinX[bin];
    const ys = waveBinY[bin];
    for (let index = 0; index < count; index += 1) output.rect(xs[index], ys[index], 1.7, 1.7);
    output.fill();
  }
  for (let layer = 0; layer < layerCount; layer += 1) strokeCrest(output, pose, phase, layer, presence, 2.4, 0.95);
  const flareX = -80 + Math.sin(phase * 0.5) * 30;
  const flare = waveCrest(flareX, 0, phase, pose);
  const flareLoop = infinityPoint(0.5 * Math.PI, 0);
  const flarePoint = {
    x: flareX * (1 - pose.infinity) + flareLoop.x * pose.infinity,
    y: flare * (1 - pose.infinity) + flareLoop.y * pose.infinity,
  };
  output.fillStyle = "#ffffff";
  [[3.2, 0.9], [10, 0.28], [26, 0.08]].forEach(([radius, alpha]) => {
    output.globalAlpha = presence * pose.core * alpha;
    output.beginPath();
    output.arc(flarePoint.x, flarePoint.y, radius, 0, Math.PI * 2);
    output.fill();
  });
  const marks = [-300, -20, 250];
  marks.forEach((mark, index) => {
    const y = waveCrest(mark, index % 2, phase, pose);
    drawWaveMark(output, mark, y, 6.5, presence * pose.cross * (index === 1 ? 1 : 0.75));
    if (pose.rings > 0.02) {
      output.globalAlpha = presence * pose.rings * 0.55;
      output.lineWidth = 1;
      output.beginPath();
      output.arc(mark, y, 30 + index * 8, 0, Math.PI * 2);
      output.stroke();
      if (index !== 1) {
        output.globalAlpha = presence * pose.rings * 0.32;
        output.beginPath();
        output.arc(mark, y, 52 + index * 6, 0, Math.PI * 2);
        output.stroke();
      }
    }
    if (pose.ripples > 0.02) {
      const pulse = (time * 0.55 + index * 0.33) % 1;
      output.globalAlpha = presence * pose.ripples * (1 - pulse) * 0.45;
      output.lineWidth = 1;
      output.beginPath();
      output.arc(mark, y, 16 + pulse * 52, 0, Math.PI * 2);
      output.stroke();
    }
    if (pose.chevrons > 0.02) {
      const lift = index === 1 ? 42 : -36;
      output.globalAlpha = presence * pose.chevrons * 0.92;
      output.lineWidth = 1.45;
      output.beginPath();
      for (let chevron = 0; chevron < 3; chevron += 1) {
        const ox = mark - 10 + chevron * 12;
        output.moveTo(ox, y + lift - 8);
        output.lineTo(ox + 9, y + lift);
        output.lineTo(ox, y + lift + 8);
      }
      output.stroke();
    }
  });
  [-170, 70].forEach((x) => {
    if (pose.calipers < 0.02) return;
    const top = -132;
    const bottom = 132;
    output.globalAlpha = presence * pose.calipers * 0.75;
    output.lineWidth = 1.15;
    output.beginPath();
    output.moveTo(x, top);
    output.lineTo(x, bottom);
    output.stroke();
    output.globalAlpha = presence * pose.calipers;
    output.beginPath();
    output.arc(x, top, 2.6, 0, Math.PI * 2);
    output.arc(x, bottom, 2.6, 0, Math.PI * 2);
    output.fill();
  });
  if (pose.bars > 0.02) {
    output.globalAlpha = presence * pose.bars * 0.8;
    output.lineWidth = 1.2;
    output.beginPath();
    for (let bar = 0; bar < 17; bar += 1) {
      const x = -78 + bar * 7.2;
      const height = 16 + Math.abs(Math.sin(bar * 0.55)) * 34 + (bar > 6 && bar < 13 ? 24 : 0);
      output.moveTo(x, -height);
      output.lineTo(x, height);
    }
    output.stroke();
  }
  if (pose.target > 0.02) {
    output.globalAlpha = presence * pose.target * 0.7;
    output.lineWidth = 1.1;
    output.beginPath();
    output.arc(96, 0, 36, 0, Math.PI * 2);
    output.stroke();
    output.globalAlpha = presence * pose.target * 0.4;
    output.beginPath();
    output.arc(96, 0, 62, 0, Math.PI * 2);
    output.stroke();
    drawWaveMark(output, 96, 0, 7, presence * pose.target);
  }
  if (pose.infinity > 0.08) {
    output.globalAlpha = presence * pose.infinity * 0.75;
    output.lineWidth = 1.15;
    const spin = time * 0.45;
    [[-0.2, 1], [Math.PI + 0.2, -1]].forEach(([start, direction]) => {
      output.beginPath();
      const steps = 16;
      let tipX = 0;
      let tipY = 0;
      let prevX = 0;
      let prevY = 0;
      for (let step = 0; step <= steps; step += 1) {
        const turn = start + spin + direction * (step / steps) * 1.35;
        const point = infinityPoint(turn, direction * 52);
        if (step === 0) output.moveTo(point.x, point.y);
        else output.lineTo(point.x, point.y);
        prevX = tipX;
        prevY = tipY;
        tipX = point.x;
        tipY = point.y;
      }
      output.stroke();
      const angle = Math.atan2(tipY - prevY, tipX - prevX);
      output.beginPath();
      output.moveTo(tipX, tipY);
      output.lineTo(tipX - Math.cos(angle - 0.45) * 8, tipY - Math.sin(angle - 0.45) * 8);
      output.moveTo(tipX, tipY);
      output.lineTo(tipX - Math.cos(angle + 0.45) * 8, tipY - Math.sin(angle + 0.45) * 8);
      output.stroke();
    });
    drawWaveMark(output, -118, 2, 6.5, presence * pose.infinity * pose.cross);
    drawWaveMark(output, 118, -2, 6.5, presence * pose.infinity * pose.cross);
  }
  output.restore();
}

function drawPhysarumSequence(output: CanvasRenderingContext2D, time: number, stage: number, width: number, height: number) {
  drawWaveSequence(output, time, stage, width, height);
}

function drawDiagram(context: CanvasRenderingContext2D, time: number, stage: number, _reveal: number, width: number, height: number) {
  drawPhysarumSequence(context, time, stage, width, height);
}

type DiagramCache = {
  traces: SVGPathElement[];
  arms: Array<{ group: SVGGElement; former: SVGPathElement; live: SVGPathElement; branch: SVGPathElement; cross: SVGPathElement; flow: SVGPathElement; packet: SVGCircleElement }>;
  nodes: Array<{ group: SVGGElement; ring: SVGCircleElement; spoke: SVGPathElement; dot: SVGCircleElement }>;
  ticks: SVGPathElement[];
  steps: SVGGElement;
  carry: SVGGElement;
  head: SVGPathElement;
  tail: SVGPathElement;
  carryDot: SVGCircleElement;
  carryRing: SVGCircleElement;
};

const diagramCache = new WeakMap<HTMLElement, DiagramCache>();

function diagramNodes(root: HTMLElement) {
  const found = diagramCache.get(root);
  if (found) return found;
  const svg = root.querySelector("svg");
  if (!svg) return null;
  const part = (parent: Element, name: string) => parent.querySelector<SVGPathElement>(`[data-part="${name}"]`);
  const cache: DiagramCache = {
    traces: [...svg.querySelectorAll<SVGPathElement>("[data-trace]")],
    arms: [...svg.querySelectorAll<SVGGElement>("[data-arm]")].map((group) => ({
      group,
      former: part(group, "former") as SVGPathElement,
      live: part(group, "live") as SVGPathElement,
      branch: part(group, "branch") as SVGPathElement,
      cross: part(group, "cross") as SVGPathElement,
      flow: part(group, "flow") as SVGPathElement,
      packet: group.querySelector('[data-part="packet"]') as SVGCircleElement,
    })),
    nodes: [...svg.querySelectorAll<SVGGElement>("[data-node]")].map((group) => ({
      group,
      ring: group.querySelector('[data-part="ring"]') as SVGCircleElement,
      spoke: part(group, "spoke") as SVGPathElement,
      dot: group.querySelector('[data-part="dot"]') as SVGCircleElement,
    })),
    ticks: [...svg.querySelectorAll<SVGPathElement>("[data-tick]")],
    steps: svg.querySelector("[data-steps]") as SVGGElement,
    carry: svg.querySelector("[data-carry]") as SVGGElement,
    head: svg.querySelector('[data-carry] [data-part="head"]') as SVGPathElement,
    tail: svg.querySelector('[data-carry] [data-part="tail"]') as SVGPathElement,
    carryDot: svg.querySelector('[data-carry] [data-part="dot"]') as SVGCircleElement,
    carryRing: svg.querySelector('[data-carry] [data-part="ring"]') as SVGCircleElement,
  };
  diagramCache.set(root, cache);
  return cache;
}

function paintDiagram(root: HTMLElement, time: number, stage: number, reveal: number) {
  const drawn = diagramNodes(root);
  if (!drawn) return;
  const stepExit = openAmount(time, STEPS_END - STEP_LEAVE, STEPS_END);
  drawn.steps.setAttribute("opacity", String(time < STEPS_END ? 1 - stepExit : 0));
  drawn.steps.setAttribute("transform", `translate(${-stepExit * 1900} 0)`);
  const traces = FIELD.filter((trace) => trace.stage === 0);
  traces.forEach((trace, index) => {
    const path = drawn.traces[index];
    if (!path) return;
    const draw = stage === 0 ? trace.partial * reveal : trace.partial;
    const weakened = stage >= 3 && trace.kind === "trace" && index % 4 === 1;
    const flicker = trace.kind === "hot" && Math.floor(time * 16 + index) % 8 === 0 ? 0.3 : 1;
    const emerge = stage === 0 ? reveal : 1;
    const opacity = (trace.kind === "ghost" ? 0.2 : trace.kind === "hot" ? 0.72 : 0.5) * (weakened ? 0.34 : 1) * flicker * 0.2 * emerge;
    const width = trace.kind === "hot" && stage >= 3 ? 1.65 : trace.kind === "hot" ? 1.15 : 0.85;
    const speed = stage === 0 ? 26 : 9;
    path.setAttribute("opacity", String(opacity));
    path.setAttribute("stroke-width", String(width));
    path.setAttribute("stroke-dasharray", `${Math.max(0.08, draw) * 100} 70`);
    path.setAttribute("stroke-dashoffset", String(-((time * speed) % 100)));
  });
  const active = Math.min(5, Math.max(0, Math.floor((time - STEPS_START) / STEP_SPAN)));
  drawn.ticks.forEach((tick, index) => {
    tick.setAttribute("d", `M ${640 + index * 36} 16 h ${index === active ? 22 : 10}`);
    tick.setAttribute("stroke", index === active ? "#c77e5f" : "rgba(244,244,240,0.45)");
  });
  let shown = stage;
  let stepReveal = reveal;
  let motion = time;
  if (stage >= 5) {
    const local = Math.max(0, time - (STEPS_START + 5 * STEP_SPAN));
    const scaled = ((local % 1.05) / 1.05) * 5;
    shown = Math.min(4, Math.floor(scaled));
    stepReveal = Math.min(1, scaled - shown);
    motion = time * 2.8;
  }
  const grow = shown === 0 ? stepReveal : 1;
  const bend = shown < 4 ? 0 : stepReveal;
  const sense = shown >= 1 ? (shown === 1 ? stepReveal : 1) : 0;
  const flow = shown >= 2 ? (shown === 2 ? stepReveal : 1) : 0;
  const hold = shown >= 3 ? (shown === 3 ? stepReveal : 1) : 0;
  ARMS.forEach((arm, index) => {
    const item = drawn.arms[index];
    if (!item) return;
    const armDelay = shown === 0 ? arm.seed * 0.34 : 0;
    const armGrow = shown === 0 ? clamp01((stepReveal - armDelay) / (1 - armDelay)) : grow;
    const forkMix = shown === 0 ? clamp01((armGrow - 0.32) / 0.68) : 1;
    const live = armPoint(arm, armGrow, bend);
    const former = armPoint(arm, 1, 0);
    const forkX = arm.ox + (live.x - arm.ox) * arm.fork;
    const forkY = arm.oy + (live.y - arm.oy) * arm.fork;
    const branchX = forkX + Math.cos(live.angle + arm.side) * live.length * 0.22 * forkMix;
    const branchY = forkY + Math.sin(live.angle + arm.side) * live.length * 0.14 * forkMix;
    const faded = arm.strong ? 1 : 1 - hold * 0.72;
    const stroke = arm.strong && hold > 0.05 ? "#c77e5f" : "rgba(244,244,240,0.84)";
    const width = arm.strong ? 0.9 + hold * 0.85 : 0.85;
    const ping = (motion * 1.6 + arm.seed) % 1;
    const detect = ping < 0.5 ? ping * 2 : (1 - ping) * 2;
    const along = flow > 0 ? ((motion * 0.72 + arm.seed) % 1) * flow : detect * 0.42 * sense;
    const showPacket = (sense > 0.05 || flow > 0.05) && (arm.strong || hold < 0.4);
    item.group.setAttribute("opacity", String((shown === 0 ? armGrow : 1) * (0.25 + faded * 0.75)));
    item.former.setAttribute("d", `M ${arm.ox} ${arm.oy} L ${former.x} ${former.y}`);
    item.former.setAttribute("opacity", bend > 0.04 && arm.strong ? "1" : "0");
    item.live.setAttribute("d", `M ${arm.ox} ${arm.oy} L ${live.x} ${live.y}`);
    item.live.setAttribute("stroke", stroke);
    item.live.setAttribute("stroke-width", String(width));
    item.branch.setAttribute("d", `M ${forkX} ${forkY} L ${branchX} ${branchY}`);
    item.cross.setAttribute("d", `M ${live.x - 5} ${live.y} h 10 M ${live.x} ${live.y - 5} v 10`);
    item.cross.setAttribute("opacity", String(shown < 2 && armGrow > 0.2 ? (shown === 0 ? armGrow : 1) : 0));
    item.flow.setAttribute("d", `M ${live.x - Math.cos(live.angle) * 10} ${live.y - Math.sin(live.angle) * 6} l ${Math.cos(live.angle) * 10} ${Math.sin(live.angle) * 6}`);
    item.flow.setAttribute("opacity", flow > 0.2 ? "1" : "0");
    const packetX = arm.ox + (live.x - arm.ox) * along;
    const packetY = arm.oy + (live.y - arm.oy) * along;
    item.packet.setAttribute("cx", String(packetX));
    item.packet.setAttribute("cy", String(packetY));
    item.packet.setAttribute("r", flow > 0.2 ? "2.1" : "1.5");
    item.packet.setAttribute("fill", flow > 0.2 ? "#49d6de" : "#f4f4f0");
    item.packet.setAttribute("opacity", showPacket ? "1" : "0");
  });
  ORIGINS.forEach((origin, index) => {
    const item = drawn.nodes[index];
    if (!item) return;
    const radius = 16 + (((motion * 0.85 + index * 0.17) % 1) * 78);
    const sweep = motion * 2.1 + index;
    const emerging = shown === 0;
    item.group.setAttribute("opacity", String(emerging ? stepReveal : 0.2 + sense * 0.8));
    item.ring.setAttribute("r", String(radius));
    item.ring.setAttribute("opacity", emerging ? "0" : shown === 1 ? "0.95" : "0.35");
    item.spoke.setAttribute("d", `M ${origin[0]} ${origin[1]} L ${origin[0] + Math.cos(sweep) * (28 + sense * 36)} ${origin[1] + Math.sin(sweep) * (18 + sense * 24)}`);
    item.spoke.setAttribute("opacity", emerging ? "0" : "1");
    item.dot.setAttribute("r", String(emerging ? 0.6 + stepReveal * 1.6 : 2.2));
    item.dot.setAttribute("fill", shown >= 3 ? "#c77e5f" : "#f4f4f0");
  });
  const carry = openAmount(time, STEPS_END + 0.2, VIDEOS_AT + 11);
  const head = 180 + carry * 1560;
  const headY = 286 + Math.sin(time * 1.7) * 10;
  drawn.carry.setAttribute("opacity", carry > 0.01 ? "1" : "0");
  drawn.head.setAttribute("d", `M 40 300 Q 420 250 ${head} ${headY}`);
  drawn.tail.setAttribute("d", `M 70 318 Q 460 286 ${Math.max(70, head - 40)} ${headY + 12}`);
  drawn.carryDot.setAttribute("cx", String(head));
  drawn.carryDot.setAttribute("cy", String(headY));
  drawn.carryRing.setAttribute("cx", String(head));
  drawn.carryRing.setAttribute("cy", String(headY));
}

function diagramSvg(time: number, stage: number, reveal: number) {
  const stepExit = openAmount(time, STEPS_END - STEP_LEAVE, STEPS_END);
  const carry = openAmount(time, STEPS_END + 0.2, VIDEOS_AT + 11);
  const head = 180 + carry * 1560;
  const headY = 286 + Math.sin(time * 1.7) * 10;
  const traces = time >= STEPS_END ? [] : FIELD.filter((trace) => trace.stage === 0);
  const traceMarkup = traces.map((trace, index) => {
    const draw = stage === 0 ? trace.partial * reveal : trace.partial;
    const weakened = stage >= 3 && trace.kind === "trace" && index % 4 === 1;
    const flicker = trace.kind === "hot" && Math.floor(time * 16 + index) % 8 === 0 ? 0.3 : 1;
    const emerge = stage === 0 ? reveal : 1;
    const opacity = (trace.kind === "ghost" ? 0.2 : trace.kind === "hot" ? 0.72 : 0.5) * (weakened ? 0.34 : 1) * flicker * 0.2 * emerge;
    const width = trace.kind === "hot" && stage >= 3 ? 1.65 : trace.kind === "hot" ? 1.15 : 0.85;
    const midX = (trace.ax + trace.bx) / 2 + (trace.ay - trace.by) * 0.22;
    const midY = (trace.ay + trace.by) / 2 + (trace.bx - trace.ax) * 0.1;
    const speed = stage === 0 ? 26 : 9;
    return `<path data-trace="${index}" d="M ${trace.ax} ${trace.ay} Q ${midX} ${midY} ${trace.bx} ${trace.by}" stroke="${signalInk(trace.kind)}" stroke-width="${width}" opacity="${opacity}" pathLength="100" stroke-dasharray="${Math.max(0.08, draw) * 100} 70" stroke-dashoffset="${-((time * speed) % 100)}" />`;
  }).join("");
  const steps = `<g data-steps="1" opacity="${time < STEPS_END ? 1 - stepExit : 0}" transform="translate(${-stepExit * 1900} 0)">${fieldEnergyMarkup(time)}${processMarkup(time, stage, reveal)}</g>`;
  const carryMarkup = `<g data-carry="1" opacity="${carry > 0.01 ? 1 : 0}"><path data-part="head" d="M 40 300 Q 420 250 ${head} ${headY}" stroke="rgba(126,169,171,0.85)" stroke-width="0.9" /><path data-part="tail" d="M 70 318 Q 460 286 ${Math.max(70, head - 40)} ${headY + 12}" stroke="rgba(199,126,95,0.55)" stroke-width="0.7" /><circle data-part="dot" cx="${head}" cy="${headY}" r="2.2" fill="#f4f4f0" stroke="none" /><circle data-part="ring" cx="${head}" cy="${headY}" r="5.5" fill="none" stroke="#49d6de" stroke-width="0.7" opacity="0.7" /></g>`;
  return `<svg class="pv-diagram" viewBox="0 0 1600 560" aria-hidden="true"><g fill="none" stroke-linecap="square">${traceMarkup}${steps}${carryMarkup}</g></svg>`;
}

function fieldEnergyMarkup(time: number) {
  const active = Math.min(5, Math.max(0, Math.floor((time - STEPS_START) / STEP_SPAN)));
  return Array.from({ length: 6 }, (_, index) => `<path data-tick="${index}" d="M ${640 + index * 36} 16 h ${index === active ? 22 : 10}" stroke="${index === active ? "#c77e5f" : "rgba(244,244,240,0.45)"}" stroke-width="1.6" />`).join("");
}

function processMarkup(time: number, stage: number, reveal: number) {
  let shown = stage;
  let stepReveal = reveal;
  let motion = time;
  if (stage >= 5) {
    const local = Math.max(0, time - (STEPS_START + 5 * STEP_SPAN));
    const loop = 1.05;
    const scaled = ((local % loop) / loop) * 5;
    shown = Math.min(4, Math.floor(scaled));
    stepReveal = Math.min(1, scaled - shown);
    motion = time * 2.8;
  }
  const grow = shown === 0 ? stepReveal : 1;
  const bend = shown < 4 ? 0 : stepReveal;
  const sense = shown >= 1 ? (shown === 1 ? stepReveal : 1) : 0;
  const flow = shown >= 2 ? (shown === 2 ? stepReveal : 1) : 0;
  const hold = shown >= 3 ? (shown === 3 ? stepReveal : 1) : 0;
  const arms = ARMS.map((arm, index) => {
    const armDelay = shown === 0 ? arm.seed * 0.34 : 0;
    const armGrow = shown === 0 ? clamp01((stepReveal - armDelay) / (1 - armDelay)) : grow;
    const forkMix = shown === 0 ? clamp01((armGrow - 0.32) / 0.68) : 1;
    const live = armPoint(arm, armGrow, bend);
    const former = armPoint(arm, 1, 0);
    const forkX = arm.ox + (live.x - arm.ox) * arm.fork;
    const forkY = arm.oy + (live.y - arm.oy) * arm.fork;
    const branchX = forkX + Math.cos(live.angle + arm.side) * live.length * 0.22 * forkMix;
    const branchY = forkY + Math.sin(live.angle + arm.side) * live.length * 0.14 * forkMix;
    const faded = arm.strong ? 1 : 1 - hold * 0.72;
    const stroke = arm.strong && hold > 0.05 ? "#c77e5f" : "rgba(244,244,240,0.84)";
    const width = arm.strong ? 0.9 + hold * 0.85 : 0.85;
    const ping = (motion * 1.6 + arm.seed) % 1;
    const detect = ping < 0.5 ? ping * 2 : (1 - ping) * 2;
    const along = flow > 0 ? ((motion * 0.72 + arm.seed) % 1) * flow : detect * 0.42 * sense;
    const showPacket = (sense > 0.05 || flow > 0.05) && (arm.strong || hold < 0.4);
    const packetX = arm.ox + (live.x - arm.ox) * along;
    const packetY = arm.oy + (live.y - arm.oy) * along;
    const formerPath = `<path data-part="former" d="M ${arm.ox} ${arm.oy} L ${former.x} ${former.y}" stroke="rgba(244,244,240,0.28)" stroke-width="0.7" stroke-dasharray="5 8" opacity="${bend > 0.04 && arm.strong ? 1 : 0}" />`;
    const cross = `<path data-part="cross" d="M ${live.x - 5} ${live.y} h 10 M ${live.x} ${live.y - 5} v 10" stroke="#49d6de" stroke-width="0.8" opacity="${shown < 2 && armGrow > 0.2 ? (shown === 0 ? armGrow : 1) : 0}" />`;
    const arrow = `<path data-part="flow" d="M ${live.x - Math.cos(live.angle) * 10} ${live.y - Math.sin(live.angle) * 6} l ${Math.cos(live.angle) * 10} ${Math.sin(live.angle) * 6}" stroke="#c77e5f" stroke-width="1.1" opacity="${flow > 0.2 ? 1 : 0}" />`;
    const packet = `<circle data-part="packet" cx="${packetX}" cy="${packetY}" r="${flow > 0.2 ? 2.1 : 1.5}" fill="${flow > 0.2 ? "#49d6de" : "#f4f4f0"} stroke="none" opacity="${showPacket ? 1 : 0}" />`;
    return `<g data-arm="${index}" opacity="${(shown === 0 ? armGrow : 1) * (0.25 + faded * 0.75)}">${formerPath}<path data-part="live" d="M ${arm.ox} ${arm.oy} L ${live.x} ${live.y}" stroke="${stroke}" stroke-width="${width}" /><path data-part="branch" d="M ${forkX} ${forkY} L ${branchX} ${branchY}" stroke="#7ea9ab" stroke-width="0.75" opacity="0.85" />${cross}${arrow}${packet}</g>`;
  }).join("");
  const nodes = ORIGINS.map((origin, index) => {
    const radius = 16 + (((motion * 0.85 + index * 0.17) % 1) * 78);
    const sweep = motion * 2.1 + index;
    const emerging = shown === 0;
    const ring = `<circle data-part="ring" cx="${origin[0]}" cy="${origin[1]}" r="${radius}" stroke="#49d6de" stroke-width="0.85" stroke-dasharray="10 16" opacity="${emerging ? 0 : (shown === 1 ? 0.95 : 0.35)}" />`;
    const spoke = `<path data-part="spoke" d="M ${origin[0]} ${origin[1]} L ${origin[0] + Math.cos(sweep) * (28 + sense * 36)} ${origin[1] + Math.sin(sweep) * (18 + sense * 24)}" stroke="#f4f4f0" stroke-width="1" opacity="${emerging ? 0 : 1}" />`;
    return `<g data-node="${index}" opacity="${emerging ? stepReveal : 0.2 + sense * 0.8}">${ring}${spoke}<circle data-part="dot" cx="${origin[0]}" cy="${origin[1]}" r="${emerging ? 0.6 + stepReveal * 1.6 : 2.2}" fill="${shown >= 3 ? "#c77e5f" : "#f4f4f0"} stroke="none" /></g>`;
  }).join("");
  return `<g fill="none" stroke-linecap="square">${arms}${nodes}</g>`;
}

function SignalField({ time, stage, reveal, boot }: { time: number; stage: number; reveal: number; boot: number }) {
  if (time < STEPS_START) return null;
  const live = FIELD.filter((trace, index) => {
    if (boot < 1 && trace.stage > 0) return false;
    if (boot < 1 && unitHash(index + 19) > boot) return false;
    if (time >= STEPS_END) return false;
    if (boot >= 1) return trace.stage === 0;
    return trace.stage < stage || (trace.stage === stage && reveal > 0.02);
  });
  const stepExit = openAmount(time, STEPS_END - STEP_LEAVE, STEPS_END);
  const carry = openAmount(time, STEPS_END + 0.2, VIDEOS_AT + 11);
  const head = 180 + carry * 1560;
  const headY = 286 + Math.sin(time * 1.7) * 10;
  return (
    <svg className="pv-diagram" viewBox="0 0 1600 560" aria-hidden="true">
      <g fill="none" strokeLinecap="square">
        {live.map((trace, index) => {
          const draw = trace.stage < stage || boot < 1 ? (boot < 1 ? boot * trace.partial : trace.partial) : trace.partial * reveal;
          const weakened = stage >= 3 && trace.stage === 0 && trace.kind === "trace" && index % 4 === 1;
          const flicker = trace.kind === "hot" && Math.floor(time * 16 + index) % 8 === 0 ? 0.3 : 1;
          const emerge = stage === 0 ? reveal : 1;
          const opacity = (trace.kind === "ghost" ? 0.2 : trace.kind === "hot" ? 0.72 : 0.5) * (weakened ? 0.34 : 1) * flicker * (boot >= 1 ? 0.2 : 1) * emerge;
          return (
            <path
              key={`${trace.ax}-${trace.ay}-${trace.bx}-${index}`}
              d={`M ${trace.ax} ${trace.ay} Q ${(trace.ax + trace.bx) / 2 + (trace.ay - trace.by) * 0.22} ${(trace.ay + trace.by) / 2 + (trace.bx - trace.ax) * 0.1} ${trace.bx} ${trace.by}`}
              stroke={signalInk(trace.kind)}
              strokeWidth={trace.kind === "hot" && stage >= 3 ? 1.65 : trace.kind === "hot" ? 1.15 : 0.85}
              opacity={opacity}
              pathLength={100}
              strokeDasharray={`${Math.max(0.08, draw) * 100} 70`}
              strokeDashoffset={-((time * (trace.stage === stage ? 26 : 9)) % 100)}
            />
          );
        })}
        {boot < 1 ? SEEDS.map((seed, index) => (
          <circle key={`seed-${seed[0]}`} cx={seed[0]} cy={seed[1]} r="1.45" fill="#f4f4f0" opacity={boot > 0.2 && index <= stage + 4 ? 0.85 : 0} stroke="none" />
        )) : null}
        {boot >= 1 && time < STEPS_END ? (
          <g opacity={1 - stepExit} transform={`translate(${-stepExit * 1900} 0)`}>
            <StepGraphics time={time} stage={stage} reveal={reveal} />
          </g>
        ) : null}
        {carry > 0.01 ? (
          <g>
            <path d={`M 40 300 Q 420 250 ${head} ${headY}`} stroke="rgba(126,169,171,0.85)" strokeWidth="0.9" />
            <path d={`M 70 318 Q 460 286 ${Math.max(70, head - 40)} ${headY + 12}`} stroke="rgba(199,126,95,0.55)" strokeWidth="0.7" />
            <circle cx={head} cy={headY} r="2.2" fill="#f4f4f0" stroke="none" />
            <circle cx={head} cy={headY} r="5.5" fill="none" stroke="#49d6de" strokeWidth="0.7" opacity="0.7" />
          </g>
        ) : null}
      </g>
    </svg>
  );
}

export function stepFieldOpacity(time: number) {
  const fadeIn = openAmount(time, 0.05, 0.7);
  const settle = openAmount(time, VIDEOS_AT + 2.4, VIDEOS_AT + 8);
  return fadeIn * (1 - settle * 0.22);
}

let growthVideo: HTMLVideoElement | null = null;
let detailVideo: HTMLVideoElement | null = null;

export function rememberGrowth(video: HTMLVideoElement) {
  growthVideo = video;
}

export function rememberDetail(video: HTMLVideoElement) {
  detailVideo = video;
}

export function StepField() {
  const plateRef = useRef<HTMLCanvasElement>(null);
  const ref = useRef<HTMLCanvasElement>(null);
  const [plateReady, setPlateReady] = useState(false);
  useEffect(() => {
    const ready = () => setPlateReady(true);
    const redraw = () => {
      growthStamp = "";
      pushPlayback(liveTime.current);
    };
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    video.src = "/physarum-forage.mp4?v=3";
    rememberGrowth(video);
    video.addEventListener("loadeddata", ready);
    video.addEventListener("seeked", redraw);
    video.load();
    return () => {
      video.removeEventListener("loadeddata", ready);
    };
  }, []);
  useEffect(() => {
    const plateCanvas = plateRef.current;
    const plateContext = plateCanvas?.getContext("2d", { alpha: false });
    const canvas = ref.current;
    const context = canvas?.getContext("2d", { alpha: true, desynchronized: true });
    if (!plateCanvas || !plateContext || !canvas || !context) return;
    const width = 3200;
    const height = 1120;
    plateCanvas.width = width;
    plateCanvas.height = height;
    canvas.width = 3200;
    canvas.height = 1120;
    const draw = (time: number) => {
      const opacity = stepFieldOpacity(time);
      plateCanvas.style.opacity = String(opacity);
      canvas.style.opacity = String(opacity);
      if (opacity <= 0.001) return;
      plateCanvas.style.filter = "none";
      drawPhysarumLayer(plateContext, width, height, time);
      drawStepField(context, 3200, 1120, time);
    };
    draw(liveTime.current);
    return bindPlayback(draw);
  }, [plateReady]);
  return (
    <>
      <canvas ref={plateRef} className="pv-step-field" aria-hidden="true" />
      <canvas ref={ref} className="pv-step-field" aria-hidden="true" />
    </>
  );
}

type Strand = {
  points: Array<[number, number]>;
  color: string;
  width: number;
  alpha: number;
  glow: number;
  speed: number;
  dash: number;
};

const STRAND_COLORS = ["#49d6de", "#7ee7ee", "#e3946a", "#c77e5f", "#f6f1e8"];

function buildStrands(): Strand[] {
  const strands: Strand[] = [];
  for (let index = 0; index < 22; index += 1) {
    const points: Array<[number, number]> = [];
    let x = -0.08;
    let y = 0.04 + unitHash(index * 7) * 0.92;
    const wave = 1.6 + unitHash(index * 5) * 4.2;
    const lift = (unitHash(index * 9) - 0.5) * 0.16;
    while (x < 1.16) {
      points.push([x, Math.max(0.02, Math.min(0.98, y))]);
      x += 0.028 + unitHash(index * 13 + points.length) * 0.02;
      y += Math.sin(x * wave + index * 0.7) * 0.018 + lift * 0.01;
    }
    const fine = unitHash(index * 11) > 0.62;
    strands.push({
      points,
      color: STRAND_COLORS[Math.floor(unitHash(index * 17) * STRAND_COLORS.length)],
      width: fine ? 0.7 + unitHash(index * 19) * 0.6 : 1.6 + unitHash(index * 23) * 1.8,
      alpha: fine ? 0.22 + unitHash(index * 29) * 0.2 : 0.34 + unitHash(index * 29) * 0.28,
      glow: fine ? 8 + unitHash(index * 31) * 8 : 16 + unitHash(index * 31) * 16,
      speed: 28 + unitHash(index * 37) * 70,
      dash: 12 + unitHash(index * 41) * 16,
    });
  }
  return strands;
}

const STRANDS = buildStrands();

function smoothstep(amount: number) {
  const t = clamp01(amount);
  return t * t * (3 - 2 * t);
}

function flowDistance(time: number, speed: number) {
  const start = 1.7;
  const end = 9.4;
  const span = end - start;
  const crawl = speed * Math.min(time, start) * 0.1;
  if (time <= start) return crawl;
  const u = Math.min(1, (time - start) / span);
  const integral = u * u * u - 0.5 * u * u * u * u;
  return crawl + speed * (integral * span + Math.max(0, time - end));
}

let coverPlate: HTMLImageElement | null = null;
let coverBuffer: HTMLCanvasElement | null = null;

export function rememberCoverPlate(image: HTMLImageElement) {
  coverPlate = image;
  coverBuffer = null;
}

function coverBitmap(width: number, height: number) {
  const plate = coverPlate;
  if (!plate || plate.naturalWidth === 0) return null;
  if (coverBuffer && coverBuffer.width === width && coverBuffer.height === height) return coverBuffer;
  const buffer = document.createElement("canvas");
  buffer.width = width;
  buffer.height = height;
  const ctx = buffer.getContext("2d");
  if (!ctx) return null;
  const stretch = (7407 / 1600) / (2024 / 560);
  const aspect = plate.naturalWidth / plate.naturalHeight;
  const dw = width;
  const dh = dw / (aspect / stretch);
  ctx.drawImage(plate, (width - dw) / 2, (height - dh) / 2, dw, dh);
  coverBuffer = buffer;
  return buffer;
}

function fieldFocus(time: number) {
  const focusIn = openAmount(time, STEPS_START - 0.15, STEPS_START + 0.45);
  const focusOut = openAmount(time, STEPS_END - STEP_LEAVE, STEPS_END + 0.15);
  const textIn = openAmount(time, SENTENCE_A - 0.15, SENTENCE_A + 0.45);
  const textOut = openAmount(time, STEPS_START - 0.4, STEPS_START + 0.1);
  const textFocus = textIn * (1 - textOut);
  const stepFocus = focusIn * (1 - focusOut);
  const focus = Math.max(textFocus, stepFocus);
  const band = 4.4 - textFocus * 1.7;
  return { focus, band, stepFocus };
}

function placeFieldPoint(x: number, y: number, width: number, height: number, focus: number, band: number) {
  const dx = (x - width * 0.5) / width;
  const dy = (y - height * 0.48) / height;
  const weight = Math.max(0, 1 - (dx * dx * 2.2 + dy * dy * band));
  const bent = y + Math.sign(y - height * 0.48 || 1) * weight * focus * height * 0.2;
  return { x, y: bent, presence: 1 - weight * focus * 0.92 };
}

let plateFrame: HTMLCanvasElement | null = null;
let strandMask: HTMLCanvasElement | null = null;

function scratchCanvas(current: HTMLCanvasElement | null, width: number, height: number) {
  if (current && current.width === width && current.height === height) return current;
  const next = document.createElement("canvas");
  next.width = width;
  next.height = height;
  return next;
}

function traceStrand(context: CanvasRenderingContext2D, strand: Strand, offset: number, width: number, height: number, focus: number, band: number, gather?: { bunch: number; into: number; x: number; y: number }) {
  const placed = strand.points.map((point) => placeFieldPoint(point[0] * width + offset, point[1] * height, width, height, focus, band));
  const bunch = gather?.bunch ?? 0;
  const into = gather?.into ?? 0;
  const midY = height * 0.48;
  const aimX = gather?.x ?? width * 0.5;
  const aimY = gather?.y ?? midY;
  const settle = (point: { x: number; y: number }) => {
    const bundledX = point.x + (width * 0.5 - point.x) * bunch * 0.42;
    const bundledY = point.y + (midY - point.y) * bunch;
    return {
      x: bundledX + (aimX - bundledX) * into,
      y: bundledY + (aimY - bundledY) * into,
    };
  };
  context.beginPath();
  let drawing = false;
  for (let pointIndex = 1; pointIndex < placed.length; pointIndex += 1) {
    const from = placed[pointIndex - 1];
    const to = placed[pointIndex];
    const presence = Math.min(from.presence, to.presence);
    const sourceSpan = Math.abs(strand.points[pointIndex][1] - strand.points[pointIndex - 1][1]) * height;
    if (presence < 0.08 || Math.abs(from.y - to.y) > sourceSpan + 28) {
      drawing = false;
      continue;
    }
    const start = settle(from);
    const end = settle(to);
    if (!drawing) {
      context.moveTo(start.x, start.y);
      drawing = true;
    }
    context.lineTo(end.x, end.y);
  }
}

function middleLineDim(strand: Strand, stepFocus: number) {
  const mid = strand.points[Math.floor(strand.points.length / 2)][1];
  const central = Math.max(0, 1 - Math.abs(mid - 0.46) / 0.3);
  return 1 - central * stepFocus * 0.84;
}

const GROWTH_END = 8.4;
const COLONY_DELAY = 0.45;
const GROWTH_ARRIVE = STEPS_START - COLONY_DELAY - 0.9;

function growthTime(time: number) {
  const start = 0.15;
  const end = GROWTH_ARRIVE;
  if (time <= start) return 0.04;
  if (time >= end) return 3.7;
  return 0.04 + ((time - start) / (end - start)) * 3.66;
}

const GROWTH_RATE = (3.7 - 0.04) / (GROWTH_ARRIVE - 0.15);
let growthStamp = "";
let growthTimeline = -1;
let growthPlayBlocked = false;
let detailPlayBlocked = false;
const DETAIL_END = 2.48;

const DETAIL_START = 0.42;

function detailTime(time: number) {
  if (time <= 0.2) return DETAIL_START;
  if (time >= GROWTH_END) return DETAIL_END;
  return DETAIL_START + ((time - 0.2) / (GROWTH_END - 0.2)) * (DETAIL_END - DETAIL_START);
}

const DETAIL_RATE = (DETAIL_END - DETAIL_START) / (GROWTH_END - 0.2);

function followGrowth(time: number) {
  const video = growthVideo;
  if (!video || video.readyState < 2) return;
  const local = time - COLONY_DELAY;
  const target = Math.min((video.duration || 4) - 0.04, growthTime(Math.max(0, local)));
  const forward = time > growthTimeline + 0.0005;
  if (!forward || local < 0.15 || local >= GROWTH_ARRIVE) {
    if (!video.paused) video.pause();
    if (!video.seeking && Math.abs(video.currentTime - target) > 0.08) video.currentTime = target;
    return;
  }
  if (Math.abs(video.playbackRate - GROWTH_RATE) > 0.02) video.playbackRate = GROWTH_RATE;
  if (video.seeking) return;
  if (Math.abs(video.currentTime - target) > 0.2) {
    video.currentTime = target;
    return;
  }
  if (!video.paused) return;
  if (!growthPlayBlocked) void video.play().catch(() => { growthPlayBlocked = true; });
  if (growthPlayBlocked && Math.abs(video.currentTime - target) > 0.045) video.currentTime = target;
}

function followDetail(time: number) {
  const video = detailVideo;
  if (!video || video.readyState < 2) return;
  const target = Math.min((video.duration || DETAIL_END) - 0.04, detailTime(time));
  const forward = time > growthTimeline + 0.0005;
  if (!forward || time < 0.2 || time >= GROWTH_END) {
    if (!video.paused) video.pause();
    if (!video.seeking && Math.abs(video.currentTime - target) > 0.08) video.currentTime = target;
    return;
  }
  if (Math.abs(video.playbackRate - DETAIL_RATE) > 0.02) video.playbackRate = DETAIL_RATE;
  if (video.seeking) return;
  if (Math.abs(video.currentTime - target) > 0.12) {
    video.currentTime = target;
    return;
  }
  if (!video.paused) return;
  if (!detailPlayBlocked) void video.play().catch(() => { detailPlayBlocked = true; });
  if (detailPlayBlocked && Math.abs(video.currentTime - target) > 0.04) video.currentTime = target;
}

function colonyReach(time: number) {
  const arrive = TITLE_REVEAL - COLONY_DELAY + 0.15;
  return smoothstep(clamp01((time - 0.15) / Math.max(0.2, arrive - 0.15)));
}

function centerSpread(time: number) {
  return smoothstep(clamp01((time - 0.3) / 5.2));
}

let originFrame: HTMLCanvasElement | null = null;
let diagramFrame: HTMLCanvasElement | null = null;
let colonyPlate: HTMLCanvasElement | null = null;
let colonyCache: HTMLCanvasElement | null = null;
let colonyCacheKey = "";
let plateHeld = false;
function drawColony(plate: CanvasRenderingContext2D, source: CanvasImageSource, width: number, height: number, edge: "top" | "bottom", reach: number, fade = 1, drop = 0, strength = 1) {
  if (edge !== "top" || fade <= 0.01 || reach <= 0.01 || strength <= 0.01) return;
  const sourceWidth = "videoWidth" in source ? source.videoWidth : source.width;
  const sourceHeight = "videoHeight" in source ? source.videoHeight : source.height;
  if (sourceWidth < 2 || sourceHeight < 2) return;
  const stretch = 3.658 / (width / height);
  const aspect = (sourceWidth / sourceHeight) / stretch;
  const fitted = width * 0.92;
  const dh = fitted / aspect;
  const dw = width * 1.34;
  const top = height * 0.3 - dh * 0.5 + height * drop;
  const paint = (filter: string, alpha: number, composite: GlobalCompositeOperation) => {
    plate.save();
    plate.imageSmoothingEnabled = true;
    plate.imageSmoothingQuality = "high";
    plate.filter = filter;
    plate.globalCompositeOperation = composite;
    plate.globalAlpha = fade * alpha * strength;
    plate.translate(width, top);
    plate.scale(-1, 1);
    plate.drawImage(source, 0, 0, dw, dh);
    plate.restore();
  };
  paint("grayscale(1) contrast(1.55) brightness(2.5) blur(22px)", 0.9, "screen");
  paint("grayscale(1) contrast(1.8) brightness(1.72)", 1, "lighten");
}

function colonyPose(time: number) {
  return smoothstep(openAmount(time, STEPS_START - 0.2, STEPS_START + 0.35));
}

let stepMask: HTMLCanvasElement | null = null;

function paintCapturedMold(plate: CanvasRenderingContext2D, width: number, height: number, options: { scale: number; shift: number; lift: number; alpha: number; contrast: number; bright: number; turn: number; mask?: (layer: CanvasRenderingContext2D, width: number, height: number) => void }) {
  if (!diagramFrame || options.alpha <= 0.02) return;
  const dw = width * options.scale;
  const dh = height * options.scale * 0.98;
  const paint = (target: CanvasRenderingContext2D) => {
    target.save();
    target.filter = `grayscale(1) brightness(${options.bright.toFixed(2)}) contrast(${options.contrast.toFixed(2)})`;
    target.globalCompositeOperation = "source-over";
    target.globalAlpha = 1;
    target.translate(width * (0.5 + options.shift), height * (0.48 + options.lift));
    target.rotate(options.turn);
    target.drawImage(diagramFrame as HTMLCanvasElement, -dw * 0.72, -dh * 0.5, dw, dh);
    target.restore();
  };
  if (!options.mask) {
    plate.save();
    plate.filter = `grayscale(1) brightness(${options.bright.toFixed(2)}) contrast(${options.contrast.toFixed(2)})`;
    plate.globalCompositeOperation = "screen";
    plate.globalAlpha = options.alpha;
    plate.imageSmoothingEnabled = true;
    plate.imageSmoothingQuality = "high";
    plate.translate(width * (0.5 + options.shift), height * (0.48 + options.lift));
    plate.rotate(options.turn);
    plate.drawImage(diagramFrame, -dw * 0.72, -dh * 0.5, dw, dh);
    plate.restore();
    return;
  }
  stepMask = scratchCanvas(stepMask, width, height);
  const layer = stepMask.getContext("2d");
  if (!layer) return;
  layer.setTransform(1, 0, 0, 1, 0, 0);
  layer.globalCompositeOperation = "source-over";
  layer.globalAlpha = 1;
  layer.filter = "none";
  layer.clearRect(0, 0, width, height);
  paint(layer);
  layer.globalCompositeOperation = "destination-in";
  layer.filter = "none";
  options.mask(layer, width, height);
  plate.save();
  plate.filter = "none";
  plate.globalCompositeOperation = "screen";
  plate.globalAlpha = options.alpha;
  plate.drawImage(stepMask, 0, 0);
  plate.restore();
}

function playMoldBehavior(plate: CanvasRenderingContext2D, width: number, height: number, stage: number, progress: number, presence: number) {
  const t = clamp01(progress);
  if (stage === 0) {
    paintCapturedMold(plate, width, height, { scale: 0.16 + t * 1.02, shift: 0, lift: 0, alpha: presence * (0.28 + t * 0.72), contrast: 1.35, bright: 1.22, turn: 0 });
    return;
  }
  if (stage === 1) {
    paintCapturedMold(plate, width, height, { scale: 1.08, shift: 0, lift: 0, alpha: presence * 0.06, contrast: 1.05, bright: 0.7, turn: 0 });
    const angle = -0.4 + t * Math.PI * 2.2;
    const cx = width * (0.5 + Math.cos(angle) * 0.12);
    const cy = height * (0.48 + Math.sin(angle) * 0.18);
    const radius = height * 0.36;
    paintCapturedMold(plate, width, height, {
      scale: 1.08, shift: 0, lift: 0, alpha: presence, contrast: 1.7, bright: 1.7, turn: 0,
      mask: (layer, maskWidth, maskHeight) => {
        const glow = layer.createRadialGradient(cx, cy, radius * 0.05, cx, cy, radius);
        glow.addColorStop(0, "rgba(255,255,255,1)");
        glow.addColorStop(0.55, "rgba(255,255,255,0.85)");
        glow.addColorStop(1, "rgba(255,255,255,0)");
        layer.fillStyle = glow;
        layer.fillRect(0, 0, maskWidth, maskHeight);
      },
    });
    return;
  }
  if (stage === 2) {
    const shift = 0.32 - t * 0.64;
    paintCapturedMold(plate, width, height, { scale: 0.92, shift, lift: 0, alpha: presence * 0.22, contrast: 1.1, bright: 0.85, turn: 0 });
    const front = width * (0.78 - t * 0.56);
    paintCapturedMold(plate, width, height, {
      scale: 0.92, shift, lift: 0, alpha: presence, contrast: 1.65, bright: 1.55, turn: 0,
      mask: (layer, maskWidth, maskHeight) => {
        const flow = layer.createLinearGradient(front - width * 0.07, 0, front + width * 0.05, 0);
        flow.addColorStop(0, "rgba(255,255,255,0)");
        flow.addColorStop(0.35, "rgba(255,255,255,1)");
        flow.addColorStop(1, "rgba(255,255,255,0)");
        layer.fillStyle = flow;
        layer.fillRect(0, 0, maskWidth, maskHeight);
      },
    });
    return;
  }
  if (stage === 3) {
    paintCapturedMold(plate, width, height, { scale: 1.05, shift: 0, lift: 0, alpha: presence * 0.05, contrast: 0.8, bright: 0.45, turn: 0 });
    paintCapturedMold(plate, width, height, { scale: 1.05, shift: 0, lift: 0, alpha: presence, contrast: 1.85, bright: 3.8, turn: 0 });
    return;
  }
  if (stage === 4) {
    paintCapturedMold(plate, width, height, { scale: 0.95, shift: 0.16, lift: 0.04, alpha: presence * (1 - t) * 0.9, contrast: 1.8, bright: 1.25, turn: -0.38 });
    paintCapturedMold(plate, width, height, { scale: 0.28 + t * 0.78, shift: -0.16, lift: -0.1, alpha: presence * (0.15 + t * 0.85), contrast: 1.45, bright: 1.3, turn: 0.46 });
    return;
  }
  const slice = (t % 1) * 5;
  playMoldBehavior(plate, width, height, Math.min(4, Math.floor(slice)), slice - Math.floor(slice), presence);
}

function drawStepOrganism(plate: CanvasRenderingContext2D, source: CanvasImageSource, width: number, height: number, time: number) {
  const pose = colonyPose(time);
  const leave = smoothstep(openAmount(time, STEPS_END - 0.85, VIDEOS_AT + 0.4));
  const presence = pose * (1 - leave);
  if (presence < 0.02) return;
  const sourceWidth = "videoWidth" in source ? source.videoWidth : source.width;
  const sourceHeight = "videoHeight" in source ? source.videoHeight : source.height;
  const stage = time < STEPS_START ? 0 : Math.min(5, Math.floor((time - STEPS_START) / STEP_SPAN));
  const local = Math.max(0, time - (STEPS_START + stage * STEP_SPAN));
  if (diagramFrame) {
    const progress = stage === 5 ? (local % 1.05) / 1.05 : clamp01(local / STEP_SPAN);
    playMoldBehavior(plate, width, height, stage, progress, presence);
    return;
  }
  const travel = clamp01(local / STEP_SPAN);
  const paintBranch = (upper: boolean) => {
    plate.save();
    plate.filter = "grayscale(1) contrast(1.25) brightness(1.12)";
    plate.globalCompositeOperation = "screen";
    plate.globalAlpha = presence * (upper ? 0.92 : 0.8);
    plate.imageSmoothingEnabled = true;
    plate.imageSmoothingQuality = "high";
    const dw = width * (upper ? 0.5 + travel * 0.28 : 0.42 + travel * 0.24);
    const dh = height * (upper ? 0.58 + travel * 0.16 : 0.48 + travel * 0.16);
    plate.translate(width * (0.62 + (stage === 2 ? travel * 0.12 : 0)), height * (upper ? 0.12 : 0.34));
    plate.rotate(upper ? -0.04 : 0.07 + (stage === 4 ? travel * 0.2 : 0));
    plate.scale(-1, 1);
    if (upper) plate.drawImage(source, 0, sourceHeight * 0.04, sourceWidth, sourceHeight * 0.42, 0, 0, dw, dh);
    else plate.drawImage(source, sourceWidth * 0.08, sourceHeight * 0.4, sourceWidth * 0.92, sourceHeight * 0.48, 0, 0, dw, dh);
    plate.restore();
  };
  paintBranch(true);
  paintBranch(false);
}

const MOLD_W = 1280;
const MOLD_H = 448;
const MOLD_STRETCH = 3.66 / (3200 / 1120);

type MoldField = {
  canvas: HTMLCanvasElement;
  context: CanvasRenderingContext2D;
  image: ImageData;
  veins: Float32Array;
  built: number;
  painted: number;
};

let moldField: MoldField | null = null;

function moldHash(ix: number, iy: number) {
  let n = Math.imul(ix, 374761393) ^ Math.imul(iy, 668265263);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
}

function moldNoise(x: number, y: number) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const a = moldHash(ix, iy);
  const b = moldHash(ix + 1, iy);
  const c = moldHash(ix, iy + 1);
  const d = moldHash(ix + 1, iy + 1);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}

function moldFbm(x: number, y: number) {
  let value = 0;
  let amplitude = 0.5;
  let frequency = 1;
  for (let octave = 0; octave < 4; octave += 1) {
    value += amplitude * moldNoise(x * frequency, y * frequency);
    frequency *= 2.03;
    amplitude *= 0.5;
  }
  return value;
}

function moldRidge(x: number, y: number) {
  let value = 0;
  let amplitude = 0.66;
  let frequency = 1;
  let weight = 1;
  for (let octave = 0; octave < 5; octave += 1) {
    let sample = moldNoise(x * frequency, y * frequency);
    sample = 1 - Math.abs(sample * 2 - 1);
    sample *= sample * weight;
    weight = Math.min(1, sample * 2);
    value += sample * amplitude;
    frequency *= 2.12;
    amplitude *= 0.52;
  }
  return value;
}

function fillVeinRows(count: number) {
  if (!moldField || moldField.built >= MOLD_H) return;
  const { veins, built } = moldField;
  const cx = MOLD_W * 0.5;
  const cy = MOLD_H * 0.5;
  const end = Math.min(MOLD_H, built + count);
  for (let y = built; y < end; y += 1) {
    for (let x = 0; x < MOLD_W; x += 1) {
      const nx = (x - cx) * 0.02;
      const ny = (y - cy) * 0.02 * MOLD_STRETCH;
      const warp = moldFbm(nx * 0.55 + 1.3, ny * 0.55);
      const coarse = moldRidge(nx * 1.35 + warp * 1.6, ny * 1.35 + warp * 1.3);
      const fine = moldRidge(nx * 2.8 + warp * 0.8 + 4.4, ny * 2.8 + warp);
      veins[y * MOLD_W + x] = coarse * 0.58 + fine * 0.72;
    }
  }
  moldField.built = end;
}

function resetMold() {
  const canvas = document.createElement("canvas");
  canvas.width = MOLD_W;
  canvas.height = MOLD_H;
  const context = canvas.getContext("2d", { alpha: true });
  if (!context) return;
  moldField = {
    canvas,
    context,
    image: context.createImageData(MOLD_W, MOLD_H),
    veins: new Float32Array(MOLD_W * MOLD_H),
    built: 0,
    painted: -1,
  };
}

function lobeRadius(angle: number, growth: number, time: number) {
  const crawl = time * 0.08;
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  const broad = moldFbm(cosine * 1.55 + crawl, sine * 1.55 - crawl * 0.6);
  const fine = moldFbm(cosine * 6.2 + 5.1, sine * 6.2 + crawl);
  const left = Math.pow(Math.max(0, Math.cos(angle - Math.PI)), 0.8) * 1.08;
  const up = Math.pow(Math.max(0, Math.cos(angle + 1.12)), 1.25) * 0.74;
  const lowRight = Math.pow(Math.max(0, Math.cos(angle - 0.72)), 1.35) * 0.66;
  const lobe = Math.max(left, up, lowRight, 0.2);
  const scallop = 0.78 + (broad - 0.5) * 0.5 + (fine - 0.5) * 0.24;
  return Math.max(8, growth * lobe * scallop);
}

function paintPlasmodium(time: number) {
  if (!moldField) return;
  const { veins, image, context } = moldField;
  const spread = smoothstep(clamp01((time - 0.25) / 5.05));
  const growth = MOLD_W * (0.05 + spread * 0.44);
  const radii = new Float32Array(720);
  for (let i = 0; i < radii.length; i += 1) {
    radii[i] = lobeRadius((i / radii.length) * Math.PI * 2 - Math.PI, growth, time);
  }
  const cx = MOLD_W * 0.5;
  const cy = MOLD_H * 0.5;
  const pixels = image.data;
  for (let y = 0; y < MOLD_H; y += 1) {
    const sy = (y - cy) * MOLD_STRETCH;
    for (let x = 0; x < MOLD_W; x += 1) {
      const sx = x - cx;
      const dist = Math.hypot(sx, sy);
      const angle = Math.atan2(sy, sx);
      const slot = ((angle + Math.PI) / (Math.PI * 2)) * radii.length;
      const index = Math.floor(slot) % radii.length;
      const next = (index + 1) % radii.length;
      const front = radii[index] + (radii[next] - radii[index]) * (slot - Math.floor(slot));
      const pixel = (y * MOLD_W + x) * 4;
      const depth = 1 - dist / front;
      if (depth <= 0) {
        pixels[pixel + 3] = 0;
        continue;
      }
      const lace = veins[y * MOLD_W + x];
      const fuse = depth < 0.03 ? 1 : depth < 0.055 ? (0.055 - depth) / 0.025 : 0;
      const cut = 0.76 - fuse * 0.48;
      let light = smoothstep(clamp01((lace - cut) / 0.08));
      if (fuse > 0) light = Math.max(light, fuse * 0.95);
      if (light < 0.28 && fuse < 0.15) light = 0;
      const tone = Math.min(255, light * 255);
      pixels[pixel] = tone;
      pixels[pixel + 1] = tone;
      pixels[pixel + 2] = tone;
      pixels[pixel + 3] = tone > 10 ? Math.min(255, 28 + tone) : 0;
    }
  }
  context.putImageData(image, 0, 0);
}

function advanceMold(time: number) {
  if (!moldField) resetMold();
  if (!moldField) return;
  if (moldField.built < MOLD_H) fillVeinRows(18);
  if (time < 0.2) {
    moldField.painted = -1;
    return;
  }
  if (moldField.built < MOLD_H) return;
  const stamp = Math.round(time * 24) / 24;
  if (moldField.painted === stamp) return;
  paintPlasmodium(time);
  moldField.painted = stamp;
}

let detailClock = 0;
const WRITING_END = SENTENCE_B + 14 * 0.29 + 0.2;

function organismPresence(time: number) {
  const whisper = smoothstep(clamp01((time - 0.3) / (SENTENCE_A - 0.3)));
  const writing = smoothstep(clamp01((time - SENTENCE_A) / (WRITING_END - SENTENCE_A)));
  return {
    opacity: whisper * 0.11 + writing * 0.77,
    scale: 0.32 + whisper * 0.08 + writing * 0.78,
  };
}

function drawDetailOrganism(plate: CanvasRenderingContext2D, width: number, height: number) {
  const video = detailVideo;
  if (!video || video.readyState < 2 || video.seeking) return;
  const presence = organismPresence(detailClock);
  if (presence.opacity <= 0.008) return;
  const sourceWidth = video.videoWidth || 3840;
  const sourceHeight = video.videoHeight || 1992;
  const stretch = 3.66 / (width / height);
  const frameAspect = (sourceWidth / sourceHeight) / stretch;
  let dh = height * 0.98;
  let dw = dh * frameAspect;
  if (dw > width * 0.7) {
    dw = width * 0.7;
    dh = dw / frameAspect;
  }
  const anchorX = width * 0.5;
  const anchorY = height * 0.48;
  plate.save();
  plate.filter = "grayscale(1)";
  plate.globalCompositeOperation = "screen";
  const stepAway = smoothstep(openAmount(detailClock, STEPS_START - 0.4, STEPS_START + 0.2));
  plate.globalAlpha = presence.opacity * (1 - stepAway);
  plate.imageSmoothingEnabled = true;
  plate.imageSmoothingQuality = "high";
  plate.translate(anchorX, anchorY);
  plate.scale(presence.scale, presence.scale);
  plate.drawImage(video, -dw / 2, -dh / 2 + height * 0.02, dw, dh);
  plate.restore();
}

function drawGrownMold(plate: CanvasRenderingContext2D, width: number, height: number) {
  if (!moldField || moldField.painted < 0) return;
  plate.save();
  plate.filter = "none";
  plate.globalCompositeOperation = "screen";
  plate.globalAlpha = 0.9;
  plate.imageSmoothingEnabled = true;
  plate.imageSmoothingQuality = "high";
  plate.drawImage(moldField.canvas, 0, 0, width, height);
  plate.restore();
}

function paintPhysarum(plate: CanvasRenderingContext2D, width: number, height: number, textFocus: number, titleFocus: number, reach: number, spread: number) {
  plate.setTransform(1, 0, 0, 1, 0, 0);
  plate.globalAlpha = 1;
  plate.globalCompositeOperation = "source-over";
  plate.filter = "none";
  plate.fillStyle = "#000000";
  plate.fillRect(0, 0, width, height);
  const video = growthVideo;
  if (video && video.readyState >= 2 && !video.seeking) {
    const fade = 1 - colonyPose(detailClock);
    if (originFrame && fade > 0.01) {
      plate.save();
      plate.globalCompositeOperation = "screen";
      plate.globalAlpha = fade;
      plate.drawImage(originFrame, 0, 0, width, height);
      plate.restore();
    }
    drawColony(plate, video, width, height, "top", reach, fade);
    drawColony(plate, video, width, height, "bottom", reach, fade);
  }
  plate.filter = "none";
  plate.globalCompositeOperation = "source-over";
  if (textFocus > 0.04) {
    plate.save();
    plate.globalCompositeOperation = "destination-out";
    const sentences = plate.createRadialGradient(width * 0.5, height * 0.5, height * 0.015, width * 0.5, height * 0.5, width * 0.055);
    sentences.addColorStop(0, `rgba(0,0,0,${(0.5 * textFocus).toFixed(3)})`);
    sentences.addColorStop(0.55, `rgba(0,0,0,${(0.16 * textFocus).toFixed(3)})`);
    sentences.addColorStop(1, "rgba(0,0,0,0)");
    plate.fillStyle = sentences;
    plate.fillRect(0, 0, width, height);
    plate.restore();
    const behind = (cx: number, cy: number, rx: number, ry: number, alpha: number) => {
      plate.save();
      plate.globalCompositeOperation = "destination-out";
      plate.translate(cx, cy);
      plate.scale(rx / ry, 1);
      const glow = plate.createRadialGradient(0, 0, ry * 0.25, 0, 0, ry);
      glow.addColorStop(0, `rgba(0,0,0,${alpha.toFixed(3)})`);
      glow.addColorStop(0.7, `rgba(0,0,0,${(alpha * 0.22).toFixed(3)})`);
      glow.addColorStop(1, "rgba(0,0,0,0)");
      plate.fillStyle = glow;
      plate.fillRect(-ry, -ry, ry * 2, ry * 2);
      plate.restore();
    };
    behind(width * 0.2, height * 0.3, width * 0.16, height * 0.055, 0.16 * textFocus);
    behind(width * 0.32, height * 0.45, width * 0.15, height * 0.04, 0.12 * textFocus);
  }
  if (titleFocus > 0.04) {
    const behindTitle = (cx: number, cy: number, rx: number, ry: number, alpha: number) => {
      plate.save();
      plate.globalCompositeOperation = "destination-out";
      plate.translate(cx, cy);
      plate.scale(rx / ry, 1);
      const glow = plate.createRadialGradient(0, 0, ry * 0.2, 0, 0, ry);
      glow.addColorStop(0, `rgba(0,0,0,${alpha.toFixed(3)})`);
      glow.addColorStop(1, "rgba(0,0,0,0)");
      plate.fillStyle = glow;
      plate.fillRect(-ry, -ry, ry * 2, ry * 2);
      plate.restore();
    };
    behindTitle(width * 0.22, height * 0.3, width * 0.18, height * 0.06, 0.14 * titleFocus);
    behindTitle(width * 0.34, height * 0.46, width * 0.16, height * 0.045, 0.1 * titleFocus);
  }
}

function drawPhysarumPlate(width: number, height: number, textFocus: number, titleFocus: number, reach: number, spread: number) {
  plateFrame = scratchCanvas(plateFrame, width, height);
  const plate = plateFrame.getContext("2d");
  if (!plate) return null;
  paintPhysarum(plate, width, height, textFocus, titleFocus, reach, spread);
  return plateFrame;
}

function drawCoverField(context: CanvasRenderingContext2D, width: number, height: number, time: number, focus: number, band: number) {
  const source = coverBitmap(width, height);
  if (!source) return;
  const grow = smoothstep(openAmount(time, 0.04, 0.85));
  const become = smoothstep(openAmount(time, 7.15, 8.85));
  const release = smoothstep(openAmount(time, 8.5, 9.2));
  const show = grow * (1 - release);
  if (show < 0.02) return;
  plateFrame = scratchCanvas(plateFrame, width, height);
  const plate = plateFrame.getContext("2d");
  if (!plate) return;
  plate.setTransform(1, 0, 0, 1, 0, 0);
  plate.globalCompositeOperation = "source-over";
  plate.globalAlpha = 1;
  plate.clearRect(0, 0, width, height);
  const step = 2;
  const crop = 36;
  for (let y = 0; y < height; y += step) {
    const v = y / height;
    const dx = Math.sin(time * 0.62 + v * 2.5) * 22 + Math.sin(time * 1.05 + v * 5.8) * 8;
    const sy = Math.max(0, Math.min(height - step, y + Math.sin(time * 0.5 + v * 2.1) * 9));
    plate.drawImage(source, crop + dx, sy, width - crop * 2, step, 0, y, width, step);
  }
  if (become > 0.012) {
    strandMask = scratchCanvas(strandMask, width, height);
    const mask = strandMask.getContext("2d");
    if (mask) {
      mask.setTransform(1, 0, 0, 1, 0, 0);
      mask.clearRect(0, 0, width, height);
      mask.lineJoin = "round";
      mask.lineCap = "round";
      mask.strokeStyle = "#ffffff";
      const spare = (1 - become) * (1 - become) * 560;
      const feather = (1 - become) * 90;
      STRANDS.forEach((strand) => {
        const shift = flowDistance(time, strand.speed) % width;
        [shift - width, shift].forEach((offset) => {
          traceStrand(mask, strand, offset, width, height, focus, band);
          mask.globalAlpha = 0.2 + (1 - become) * 0.45;
          mask.lineWidth = strand.width * 5.2 + spare + feather;
          mask.stroke();
          mask.globalAlpha = 1;
          mask.lineWidth = strand.width * 5.2 + spare * 0.42;
          mask.stroke();
        });
      });
      plate.globalCompositeOperation = "destination-in";
      plate.drawImage(strandMask, 0, 0);
      plate.globalCompositeOperation = "source-over";
    }
  }
  if (become > 0.04) {
    plate.save();
    plate.globalCompositeOperation = "destination-out";
    const edge = plate.createLinearGradient(0, 0, width, 0);
    const fade = become;
    edge.addColorStop(0, `rgba(0,0,0,${fade.toFixed(3)})`);
    edge.addColorStop(0.14, `rgba(0,0,0,${(fade * 0.92).toFixed(3)})`);
    edge.addColorStop(0.28, `rgba(0,0,0,${(fade * 0.45).toFixed(3)})`);
    edge.addColorStop(0.4, "rgba(0,0,0,0)");
    edge.addColorStop(0.6, "rgba(0,0,0,0)");
    edge.addColorStop(0.72, `rgba(0,0,0,${(fade * 0.45).toFixed(3)})`);
    edge.addColorStop(0.86, `rgba(0,0,0,${(fade * 0.92).toFixed(3)})`);
    edge.addColorStop(1, `rgba(0,0,0,${fade.toFixed(3)})`);
    plate.fillStyle = edge;
    plate.fillRect(0, 0, width, height);
    plate.restore();
  }
  if (focus > 0.04) {
    plate.save();
    plate.globalCompositeOperation = "destination-out";
    const veil = plate.createRadialGradient(width * 0.5, height * 0.48, width * 0.16, width * 0.5, height * 0.48, width * 0.4);
    veil.addColorStop(0, `rgba(0,0,0,${(0.94 * focus).toFixed(3)})`);
    veil.addColorStop(0.7, `rgba(0,0,0,${(0.55 * focus).toFixed(3)})`);
    veil.addColorStop(1, "rgba(0,0,0,0)");
    plate.fillStyle = veil;
    plate.fillRect(0, 0, width, height);
    plate.restore();
  }
  if (show > 0.02) {
    context.save();
    context.globalAlpha = show;
    context.drawImage(plateFrame, 0, 0);
    context.restore();
  }
}

function punchReadability(plate: CanvasRenderingContext2D, width: number, height: number, textFocus: number, titleFocus: number) {
  plate.setTransform(1, 0, 0, 1, 0, 0);
  plate.filter = "none";
  plate.globalCompositeOperation = "source-over";
  if (textFocus > 0.04) {
    plate.save();
    plate.globalCompositeOperation = "destination-out";
    const sentences = plate.createRadialGradient(width * 0.5, height * 0.5, height * 0.015, width * 0.5, height * 0.5, width * 0.055);
    sentences.addColorStop(0, `rgba(0,0,0,${(0.5 * textFocus).toFixed(3)})`);
    sentences.addColorStop(0.55, `rgba(0,0,0,${(0.16 * textFocus).toFixed(3)})`);
    sentences.addColorStop(1, "rgba(0,0,0,0)");
    plate.fillStyle = sentences;
    plate.fillRect(0, 0, width, height);
    plate.restore();
  }
  if (titleFocus > 0.04) {
    const behindTitle = (cx: number, cy: number, rx: number, ry: number, alpha: number) => {
      plate.save();
      plate.globalCompositeOperation = "destination-out";
      plate.translate(cx, cy);
      plate.scale(rx / ry, 1);
      const glow = plate.createRadialGradient(0, 0, ry * 0.2, 0, 0, ry);
      glow.addColorStop(0, `rgba(0,0,0,${alpha.toFixed(3)})`);
      glow.addColorStop(1, "rgba(0,0,0,0)");
      plate.fillStyle = glow;
      plate.fillRect(-ry, -ry, ry * 2, ry * 2);
      plate.restore();
    };
    behindTitle(width * 0.22, height * 0.3, width * 0.18, height * 0.06, 0.14 * titleFocus);
    behindTitle(width * 0.34, height * 0.46, width * 0.16, height * 0.045, 0.1 * titleFocus);
  }
}

function paintColonyBase(plate: CanvasRenderingContext2D, width: number, height: number, reach: number, showColony: boolean) {
  plate.setTransform(1, 0, 0, 1, 0, 0);
  plate.globalAlpha = 1;
  plate.globalCompositeOperation = "source-over";
  plate.filter = "none";
  plate.fillStyle = "#000000";
  plate.fillRect(0, 0, width, height);
  const video = growthVideo;
  if (!showColony || !video || video.readyState < 2) return;
  if (originFrame) {
    plate.save();
    plate.globalCompositeOperation = "screen";
    plate.drawImage(originFrame, 0, 0, width, height);
    plate.restore();
  }
  drawColony(plate, video, width, height, "top", reach);
  drawColony(plate, video, width, height, "top", reach, 1, 0.3, 0.42);
  drawColony(plate, video, width, height, "bottom", reach);
}

function drawPhysarumLayer(context: CanvasRenderingContext2D, width: number, height: number, time: number) {
  const jumped = growthTimeline >= 0 && time + 0.15 < growthTimeline;
  const colonyLocal = time - COLONY_DELAY;
  if (colonyLocal < 0.2) {
    originFrame = null;
    diagramFrame = null;
  }
  followGrowth(time);
  followDetail(time);
  growthTimeline = time;
  detailClock = time;
  const video = growthVideo;
  if (!originFrame && colonyLocal >= 1.5 && colonyLocal <= 2.35 && video && video.readyState >= 2 && !video.seeking) {
    const snap = document.createElement("canvas");
    snap.width = width;
    snap.height = height;
    const snapContext = snap.getContext("2d", { alpha: false });
    if (snapContext) {
      snapContext.fillStyle = "#000000";
      snapContext.fillRect(0, 0, width, height);
      drawColony(snapContext, video, width, height, "top", 0);
      drawColony(snapContext, video, width, height, "bottom", 0);
      originFrame = snap;
    }
  }
  const textFocus = openAmount(time, SENTENCE_A - 0.1, SENTENCE_A + 0.4) * (1 - openAmount(time, STEPS_START - 0.35, STEPS_START + 0.15));
  const titleFocus = openAmount(time, TITLE_REVEAL, TITLE_REVEAL + 0.85) * (1 - openAmount(time, TITLE_EXIT, TITLE_EXIT + 0.55));
  const showColony = colonyLocal >= 0.15;
  const reach = showColony ? colonyReach(colonyLocal) : 0;
  if (!diagramFrame && colonyLocal >= 2.4 && colonyLocal <= 4.2 && video && video.readyState >= 2 && !video.seeking) {
    const snap = document.createElement("canvas");
    snap.width = width;
    snap.height = height;
    const snapContext = snap.getContext("2d", { alpha: false });
    if (snapContext) {
      snapContext.fillStyle = "#000000";
      snapContext.fillRect(0, 0, width, height);
      drawColony(snapContext, video, width, height, "top", reach);
      drawColony(snapContext, video, width, height, "bottom", reach);
      diagramFrame = snap;
    }
  }
  const spread = centerSpread(time);
  const lastStepStart = STEPS_START + 5 * STEP_SPAN;
  const bunch = smoothstep(openAmount(time, lastStepStart + 0.25, STEPS_END - 0.6));
  const into = smoothstep(openAmount(time, STEPS_END - 0.55, VIDEOS_AT + 0.7));
  const frame = video && !video.seeking ? Math.round(video.currentTime * 30) : -1;
  if (jumped) colonyCacheKey = "";
  const colonyKey = `${frame}|${reach.toFixed(2)}|${textFocus.toFixed(2)}|${titleFocus.toFixed(2)}|${bunch.toFixed(2)}|${into.toFixed(2)}|${originFrame ? 1 : 0}|${showColony ? 1 : 0}`;
  const seeking = Boolean((video && video.seeking) || (detailVideo && detailVideo.seeking));
  if (seeking && !jumped && (video?.readyState ?? 0) < 2) return;
  const gathering = bunch > 0.01 || into > 0.01;
  if (gathering) {
    const stamp = `${colonyKey}|gather`;
    if (!jumped && stamp === growthStamp) return;
    growthStamp = stamp;
    const plate = drawPhysarumPlate(width, height, textFocus, titleFocus, reach, spread);
    if (!plate) return;
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.globalAlpha = 1;
    context.globalCompositeOperation = "source-over";
    context.filter = "none";
    context.fillStyle = "#000000";
    context.fillRect(0, 0, width, height);
    context.save();
    const pivotX = width * (0.4 + (0.212 - 0.4) * into);
    const pivotY = height * (0.46 + (0.427 - 0.46) * into);
    context.globalAlpha = 1 - into;
    context.translate(pivotX, pivotY);
    context.scale(Math.max(0.06, 1 - into * 0.82), Math.max(0.08, 1 - bunch * 0.72 - into * 0.12));
    context.translate(-width * 0.4, -height * 0.46);
    context.drawImage(plate, 0, 0);
    context.restore();
    return;
  }
  const pose = colonyPose(time);
  if (pose > 0.985) {
    if (!plateHeld) {
      context.setTransform(1, 0, 0, 1, 0, 0);
      context.globalAlpha = 1;
      context.globalCompositeOperation = "source-over";
      context.filter = "none";
      context.fillStyle = "#000000";
      context.fillRect(0, 0, width, height);
      plateHeld = true;
    }
    return;
  }
  plateHeld = false;
  if (colonyKey !== colonyCacheKey || !colonyCache) {
    colonyCache = scratchCanvas(colonyCache, width, height);
    const cached = colonyCache.getContext("2d", { alpha: false });
    if (!cached) return;
    paintColonyBase(cached, width, height, reach, showColony);
    colonyCacheKey = colonyKey;
  }
  growthStamp = colonyKey;
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.globalAlpha = 1;
  context.globalCompositeOperation = "source-over";
  context.filter = "none";
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.fillStyle = "#000000";
  context.fillRect(0, 0, width, height);
  context.globalAlpha = 1 - pose;
  context.drawImage(colonyCache, 0, 0);
  context.globalAlpha = 1;
  punchReadability(context, width, height, textFocus, titleFocus);
}

function drawStepField(context: CanvasRenderingContext2D, width: number, height: number, time: number) {
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.globalAlpha = 1;
  context.globalCompositeOperation = "source-over";
  context.filter = "none";
  paintBehavior(context, width, height, time);
}

function paintBehavior(context: CanvasRenderingContext2D, width: number, height: number, time: number) {
  if (time < STEPS_START - 0.08 || time > VIDEOS_AT + 1.6) return;
  const stage = time < STEPS_START ? 0 : Math.min(WORDS.length - 1, Math.floor((time - STEPS_START) / STEP_SPAN));
  const revealSpan = stage === 0 ? 0.96 : 0.42;
  const localStart = STEPS_START + stage * STEP_SPAN;
  const reveal = time < STEPS_START ? 0 : openAmount(time, localStart, localStart + revealSpan);
  context.save();
  context.globalCompositeOperation = "source-over";
  drawDiagram(context, time, stage, reveal, width, height);
  context.restore();
}

const MODULES: Record<string, { tab: number; accent: string; breakAt: number; rail: "left" | "right" }> = {
  field: { tab: 48, accent: "#c77e5f", breakAt: 430, rail: "left" },
  bark: { tab: 690, accent: "#49d6de", breakAt: 240, rail: "right" },
  vein: { tab: 120, accent: "#c77e5f", breakAt: 610, rail: "left" },
  web: { tab: 520, accent: "#7ea9ab", breakAt: 180, rail: "right" },
  spore: { tab: 760, accent: "#c77e5f", breakAt: 500, rail: "right" },
};

export const ClipFrame = memo(function ClipFrame({ id, open }: { id: string; open: number }) {
  const module = MODULES[id] ?? MODULES.field;
  const { tab, accent, breakAt, rail } = module;
  return (
    <svg className="pv-frame-svg" viewBox="-70 -56 1140 750" preserveAspectRatio="none" aria-hidden="true" style={{ opacity: open }}>
      <g fill="none" strokeLinecap="square">
        <rect x={tab} y="-32" width="188" height="18" fill={accent} stroke="none" />
        <path d={`M ${tab} -32 h -26 M ${tab + 188} -32 h 34`} stroke="#f4f4f0" strokeWidth="1.5" />
        <path d={`M ${tab + 16} -24 h 28 M ${tab + 16} -20 h 18`} stroke="#000" strokeWidth="1.2" />
        <path d={`M 0 70 V 0 H ${breakAt - 70} M ${breakAt + 80} 0 H 1000 V 210 M 1000 290 V 640 H ${breakAt + 160} M ${breakAt - 20} 640 H 0 V 240 M 0 160 V 70`} stroke="rgba(244,244,240,0.9)" strokeWidth="2.4" />
        <path d={`M 18 86 V 18 H ${breakAt - 90} M ${breakAt + 96} 18 H 982 V 196 M 982 274 V 622 H ${breakAt + 140} M ${breakAt - 4} 622 H 18 V 250 M 18 176 V 86`} stroke="rgba(126,169,171,0.75)" strokeWidth="1.15" />
        <path d="M 0 54 V 0 H 54 M 10 44 V 10 H 44" stroke="#f4f4f0" strokeWidth="1.7" />
        <path d="M 946 0 H 1000 V 54 M 990 10 H 956 V 44" stroke={accent} strokeWidth="1.7" />
        <path d="M 0 586 V 640 H 54 M 10 630 V 596 H 44" stroke="#f4f4f0" strokeWidth="1.7" />
        <path d="M 946 640 H 1000 V 586 M 990 630 H 956 V 596" stroke="#49d6de" strokeWidth="1.6" />
        {Array.from({ length: 14 }, (_, index) => {
          const y = 88 + index * 38;
          const x = rail === "left" ? 0 : 1000;
          const direction = rail === "left" ? 1 : -1;
          const length = index % 3 === 0 ? 22 : 11;
          return <path key={y} d={`M ${x} ${y} h ${length * direction}`} stroke="rgba(244,244,240,0.55)" strokeWidth="1.15" />;
        })}
        <path d={`M ${rail === "left" ? -48 : 1000} 160 h ${rail === "left" ? 32 : 46} v 110 h ${rail === "left" ? -14 : -18}`} stroke="#49d6de" strokeWidth="1.45" />
        <path d={`M ${tab + 8} 28 h 54 M ${tab + 8} 38 h 36 M ${tab + 8} 48 h 22`} stroke="#c77e5f" strokeWidth="1.35" />
        <path d={`M ${breakAt} 0 v -18 h 46`} stroke="#7ea9ab" strokeWidth="1.3" />
        <path d={`M 70 640 v 28 h 90 M 250 668 h 40`} stroke="rgba(244,244,240,0.55)" strokeWidth="1.25" />
        <circle cx={tab + 8} cy="-23" r="2.2" fill="#f4f4f0" stroke="none" />
        <circle cx="28" cy="28" r="2" fill="#49d6de" stroke="none" />
        <circle cx="972" cy="612" r="2" fill="#c77e5f" stroke="none" />
        <circle cx={breakAt + 24} cy="28" r="1.6" fill="#f4f4f0" stroke="none" />
      </g>
    </svg>
  );
});
