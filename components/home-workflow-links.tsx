"use client";

import { useEffect, useState } from "react";

type Kind = "direct" | "reference" | "loop";

type Link = { from: string; to: string; kind: Kind; label?: string };

/** Verified transfers only. Direct is a handoff, reference is a methodological use, loop is the optimization cycle. */
const LINKS: readonly Link[] = [
  { from: "typology-study", to: "logic-study", kind: "direct" },
  { from: "typology-study", to: "search-study", kind: "reference" },
  { from: "typology-study", to: "vertical-study", kind: "reference" },
  { from: "logic-study", to: "stage-skill-1", kind: "direct" },
  { from: "stage-skill-1", to: "generative-out", kind: "direct" },
  { from: "stage-skill-1", to: "vertical-study", kind: "reference" },
  { from: "stage-skill-1", to: "hybrid-out", kind: "reference" },
  { from: "generative-out", to: "search-study", kind: "direct" },
  { from: "search-study", to: "optimization-out", kind: "loop", label: "4 generations" },
  { from: "optimization-out", to: "vertical-study", kind: "direct" },
  { from: "vertical-study", to: "vertical-out", kind: "direct" },
  { from: "vertical-out", to: "hybrid-out", kind: "direct" },
  { from: "stage-client", to: "hybrid-out", kind: "reference" },
  { from: "site-study", to: "hybrid-out", kind: "reference" },
];

type Box = { x: number; y: number; r: number; b: number; cx: number; cy: number };

type Drawn = { d: string; kind: Kind; label?: string; lx: number; ly: number };

function boxOf(node: Element, root: DOMRect): Box {
  const rect = node.getBoundingClientRect();
  const x = rect.left - root.left;
  const y = rect.top - root.top;
  return { x, y, r: x + rect.width, b: y + rect.height, cx: x + rect.width / 2, cy: y + rect.height / 2 };
}

function regionOf(box: Box, cards: Box[]) {
  const top = Math.min(...cards.map((card) => card.y));
  const bottom = Math.max(...cards.map((card) => card.b));
  if (box.cy < top) return "upper";
  if (box.cy > bottom) return "lower";
  return "stage";
}

function nearestGap(cards: Box[], x: number) {
  const sorted = [...cards].sort((a, b) => a.x - b.x);
  const gaps = [sorted[0].x - 8];
  for (let index = 0; index < sorted.length - 1; index += 1) {
    gaps.push((sorted[index].r + sorted[index + 1].x) / 2);
  }
  gaps.push(sorted[sorted.length - 1].r + 8);
  return gaps.reduce((best, gap) => (Math.abs(gap - x) < Math.abs(best - x) ? gap : best));
}

function route(from: Box, to: Box, kind: Kind, cards: Box[], lanes: { upper: number; lower: number }): { d: string; lx: number; ly: number } {
  const nudge = kind === "reference" ? 2 : kind === "loop" ? -2 : 0;
  const upperLane = lanes.upper + nudge;
  const lowerLane = lanes.lower + nudge;
  const fromRegion = regionOf(from, cards);
  const toRegion = regionOf(to, cards);
  if (fromRegion === "upper" && toRegion === "upper") {
    return {
      d: `M ${from.cx} ${from.b} L ${from.cx} ${upperLane} L ${to.cx} ${upperLane} L ${to.cx} ${to.b}`,
      lx: (from.cx + to.cx) / 2,
      ly: upperLane - 3,
    };
  }
  if (fromRegion === "lower" && toRegion === "lower") {
    return {
      d: `M ${from.cx} ${from.y} L ${from.cx} ${lowerLane} L ${to.cx} ${lowerLane} L ${to.cx} ${to.y}`,
      lx: (from.cx + to.cx) / 2,
      ly: lowerLane - 3,
    };
  }
  if (fromRegion === "stage" && toRegion === "lower") {
    return {
      d: `M ${from.cx} ${from.b} L ${from.cx} ${lowerLane} L ${to.cx} ${lowerLane} L ${to.cx} ${to.y}`,
      lx: (from.cx + to.cx) / 2,
      ly: lowerLane - 3,
    };
  }
  if (fromRegion === "upper" && toRegion === "stage") {
    return {
      d: `M ${from.cx} ${from.b} L ${from.cx} ${upperLane} L ${to.cx} ${upperLane} L ${to.cx} ${to.y}`,
      lx: (from.cx + to.cx) / 2,
      ly: upperLane - 3,
    };
  }
  const gap = nearestGap(cards, (from.cx + to.cx) / 2);
  const startY = fromRegion === "upper" ? from.b : from.y;
  const endY = toRegion === "lower" ? to.y : to.b;
  const startLane = fromRegion === "lower" ? lowerLane : upperLane;
  const endLane = toRegion === "lower" ? lowerLane : upperLane;
  return {
    d: `M ${from.cx} ${startY} L ${from.cx} ${startLane} L ${gap} ${startLane} L ${gap} ${endLane} L ${to.cx} ${endLane} L ${to.cx} ${endY}`,
    lx: gap + 4,
    ly: lowerLane - 4,
  };
}

export function WorkflowLinks() {
  const [links, setLinks] = useState<Drawn[]>([]);
  const [joints, setJoints] = useState<{ x: number; y: number }[]>([]);
  const [size, setSize] = useState({ w: 1, h: 1 });

  useEffect(() => {
    const proto = document.querySelector<HTMLElement>(".wf-proto");
    if (!proto) return;
    let frame = 0;
    const measure = () => {
      const root = proto.getBoundingClientRect();
      if (root.width < 2) return;
      const boxes = new Map<string, Box>();
      proto.querySelectorAll<HTMLElement>("[data-anchor]").forEach((node) => {
        const id = node.dataset.anchor;
        if (id) boxes.set(id, boxOf(node, root));
      });
      proto.querySelectorAll<HTMLElement>(".wf-proto-card[data-stage]").forEach((node) => {
        const id = node.dataset.stage;
        if (id) boxes.set(`stage-${id}`, boxOf(node, root));
      });
      const stageCards = ["decomposition", "generative-system", "skill-1", "skill-2", "skill-3", "client", "skill-5", "recombination"]
        .map((id) => boxes.get(`stage-${id}`))
        .filter((box): box is Box => Boolean(box));
      const upperBottoms = [...proto.querySelectorAll<HTMLElement>(".wf-band-upper [data-anchor]")].map((node) => boxOf(node, root).b);
      const lowerTops = [...proto.querySelectorAll<HTMLElement>(".wf-band-lower .wf-band-piece")].map((node) => boxOf(node, root).y);
      const lanes =
        stageCards.length === 8 && upperBottoms.length > 0 && lowerTops.length > 0
          ? {
              upper: (Math.max(...upperBottoms) + Math.min(...stageCards.map((card) => card.y))) / 2,
              lower: (Math.max(...stageCards.map((card) => card.b)) + Math.min(...lowerTops)) / 2,
            }
          : null;
      const next = LINKS.flatMap((link) => {
        const from = boxes.get(link.from);
        const to = boxes.get(link.to);
        if (!from || !to || !lanes) return [];
        const drawn = route(from, to, link.kind, stageCards, lanes);
        if (link.label) {
          drawn.lx = to.cx;
          drawn.ly = Math.max(...stageCards.map((card) => card.b)) + 9;
        }
        return [{ ...drawn, kind: link.kind, label: link.label }];
      });
      const exits = new Map<string, number>();
      LINKS.forEach((link) => exits.set(link.from, (exits.get(link.from) ?? 0) + 1));
      setLinks(next);
      setJoints(
        [...exits.entries()].flatMap(([id, count]) => {
          const box = boxes.get(id);
          if (!box || count < 2) return [];
          return [{ x: box.cx, y: box.b }];
        }),
      );
      setSize({ w: root.width, h: root.height });
    };
    const observer = new ResizeObserver(measure);
    observer.observe(proto);
    const world = proto.querySelector(".wf-proto-world");
    const mutations = new MutationObserver(measure);
    if (world) mutations.observe(world, { attributes: true, attributeFilter: ["style"] });
    frame = requestAnimationFrame(measure);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      mutations.disconnect();
    };
  }, []);

  return (
    <svg className="wf-links" viewBox={`0 0 ${size.w} ${size.h}`} preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <marker id="wf-link-arrow" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">
          <path d="M 0 0.5 L 6 3.5 L 0 6.5" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="1" />
        </marker>
      </defs>
      {joints.map((joint, index) => (
        <circle key={`joint-${index}`} cx={joint.x} cy={joint.y} r="1.6" />
      ))}
      {links.map((link, index) => (
        <g key={index} data-kind={link.kind}>
          <path d={link.d} markerEnd={link.kind === "direct" ? "url(#wf-link-arrow)" : undefined} />
          {link.label ? (
            <text x={link.lx} y={link.ly} textAnchor="middle">
              {link.label}
            </text>
          ) : null}
        </g>
      ))}
    </svg>
  );
}
