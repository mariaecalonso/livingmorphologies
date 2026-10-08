"use client";

import { useEffect, useRef, useState } from "react";
import { WORKFLOW_CYCLE_MS, WORKFLOW_LIGHT } from "@/lib/home-workflow-camera";
import { WorkflowLightCircles, WorkflowLightFilter } from "@/components/workflow-light";

type Point = { x: number; y: number };
type Phase = "analysis" | "shift" | "translation" | "output";
type Rank = "primary" | "support" | "micro";

type NodeDef = {
  id: string;
  phase: Phase;
  title: readonly string[];
  rank: Rank;
  slot?: boolean;
  wide?: boolean;
};

type Edge = {
  id: string;
  from: string;
  to: string;
  phase: Phase;
  via?: string;
};

const NODES: NodeDef[] = [
  { id: "axel", phase: "analysis", title: ["Axel Springer"], rank: "primary", slot: true },
  { id: "lobby", phase: "shift", title: ["Lobby"], rank: "primary", slot: true },
  { id: "workspace", phase: "shift", title: ["Workspace"], rank: "primary", slot: true },
  { id: "gathering", phase: "shift", title: ["Gathering"], rank: "primary", slot: true },
  { id: "archetypes", phase: "analysis", title: ["15", "Archetypes"], rank: "support" },
  { id: "criteria", phase: "analysis", title: ["Criteria"], rank: "micro" },
  { id: "descriptors", phase: "analysis", title: ["Descriptors"], rank: "micro" },
  { id: "identity", phase: "analysis", title: ["Morphological", "Identity"], rank: "primary", slot: true },
  { id: "search", phase: "translation", title: ["Behavioral", "Search"], rank: "micro" },
  { id: "physarum", phase: "translation", title: ["Physarum"], rank: "primary", slot: true },
  { id: "translation", phase: "translation", title: ["Translation"], rank: "support" },
  { id: "sim", phase: "translation", title: ["Simulation", "Input"], rank: "micro" },
  { id: "states", phase: "translation", title: ["2D States"], rank: "primary", slot: true },
  { id: "generate", phase: "translation", title: ["Generate"], rank: "micro" },
  { id: "evaluate", phase: "translation", title: ["Evaluate"], rank: "micro" },
  { id: "evolve", phase: "translation", title: ["Evolve"], rank: "micro" },
  { id: "select", phase: "translation", title: ["Select"], rank: "micro" },
  { id: "formal", phase: "translation", title: ["Formal"], rank: "micro", wide: true },
  { id: "spatial", phase: "translation", title: ["Spatial"], rank: "micro", wide: true },
  { id: "atmospheric", phase: "translation", title: ["Atmospheric"], rank: "micro", wide: true },
  { id: "pareto", phase: "output", title: ["Pareto", "Catalogue"], rank: "primary", slot: true },
  { id: "temporal", phase: "output", title: ["Temporal", "Continuation"], rank: "micro" },
  { id: "sampling", phase: "output", title: ["Sampling"], rank: "micro", wide: true },
  { id: "xyt", phase: "output", title: ["XYT", "Stacking"], rank: "micro" },
  { id: "proto", phase: "output", title: ["3D Proto-", "Condition"], rank: "primary", slot: true },
  { id: "fifteen", phase: "output", title: ["15 3D", "Proto-Conditions"], rank: "micro", wide: true },
  { id: "relational", phase: "output", title: ["Relational", "Field"], rank: "micro", wide: true },
  { id: "assembly", phase: "output", title: ["Future", "Assembly"], rank: "support" },
  { id: "system", phase: "output", title: ["New System"], rank: "primary", slot: true },
];

const EDGES: Edge[] = [
  { id: "axel-lobby", from: "axel", to: "lobby", phase: "shift" },
  { id: "axel-workspace", from: "axel", to: "workspace", phase: "shift" },
  { id: "axel-gathering", from: "axel", to: "gathering", phase: "shift" },
  { id: "lobby-archetypes", from: "lobby", to: "archetypes", phase: "shift" },
  { id: "workspace-archetypes", from: "workspace", to: "archetypes", phase: "shift" },
  { id: "gathering-archetypes", from: "gathering", to: "archetypes", phase: "shift" },
  { id: "archetypes-criteria", from: "archetypes", to: "criteria", phase: "analysis" },
  { id: "criteria-descriptors", from: "criteria", to: "descriptors", phase: "analysis" },
  { id: "descriptors-identity", from: "descriptors", to: "identity", phase: "analysis" },
  { id: "identity-search", from: "identity", to: "search", phase: "translation" },
  { id: "search-physarum", from: "search", to: "physarum", phase: "translation" },
  { id: "physarum-translation", from: "physarum", to: "translation", phase: "translation" },
  { id: "translation-sim", from: "translation", to: "sim", phase: "translation" },
  { id: "sim-states", from: "sim", to: "states", phase: "translation" },
  { id: "states-generate", from: "states", to: "generate", phase: "translation" },
  { id: "generate-evaluate", from: "generate", to: "evaluate", phase: "translation" },
  { id: "evaluate-evolve", from: "evaluate", to: "evolve", phase: "translation" },
  { id: "evolve-select", from: "evolve", to: "select", phase: "translation" },
  { id: "select-formal", from: "select", to: "formal", phase: "translation" },
  { id: "select-spatial", from: "select", to: "spatial", phase: "translation" },
  { id: "select-atmospheric", from: "select", to: "atmospheric", phase: "translation" },
  { id: "formal-pareto", from: "formal", to: "pareto", phase: "output" },
  { id: "spatial-pareto", from: "spatial", to: "pareto", phase: "output" },
  { id: "atmospheric-pareto", from: "atmospheric", to: "pareto", phase: "output" },
  { id: "pareto-temporal", from: "pareto", to: "temporal", phase: "output" },
  { id: "temporal-sampling", from: "temporal", to: "sampling", phase: "output" },
  { id: "sampling-xyt", from: "sampling", to: "xyt", phase: "output" },
  { id: "xyt-proto", from: "xyt", to: "proto", phase: "output" },
  { id: "proto-fifteen", from: "proto", to: "fifteen", phase: "output" },
  { id: "fifteen-relational", from: "fifteen", to: "relational", phase: "output" },
  { id: "relational-assembly", from: "relational", to: "assembly", phase: "output" },
  { id: "assembly-system", from: "assembly", to: "system", phase: "output" },
];

const BRIDGES: Edge[] = [
  { id: "select-pareto", from: "select", to: "pareto", via: "formal", phase: "output" },
  { id: "temporal-xyt", from: "temporal", to: "xyt", via: "sampling", phase: "output" },
  { id: "proto-assembly", from: "proto", to: "assembly", via: "fifteen", phase: "output" },
];

const BRANCHES = [
  ["axel-lobby", "lobby-archetypes"],
  ["axel-workspace", "workspace-archetypes"],
  ["axel-gathering", "gathering-archetypes"],
];
const SPINE = [
  "archetypes-criteria",
  "criteria-descriptors",
  "descriptors-identity",
  "identity-search",
  "search-physarum",
  "physarum-translation",
  "translation-sim",
  "sim-states",
  "states-generate",
  "generate-evaluate",
  "evaluate-evolve",
  "evolve-select",
];
const SPLIT = [
  ["select-formal", "formal-pareto"],
  ["select-spatial", "spatial-pareto"],
  ["select-atmospheric", "atmospheric-pareto"],
];
const OUTPUT = [
  "pareto-temporal",
  "temporal-sampling",
  "sampling-xyt",
  "temporal-xyt",
  "xyt-proto",
  "proto-fifteen",
  "fifteen-relational",
  "relational-assembly",
  "proto-assembly",
  "assembly-system",
];

const BRANCH_MS = 4800;
const SPINE_MS = 10800;
const SPLIT_MS = 3000;
const OUTPUT_MS = 8400;
const CYCLE_MS = BRANCH_MS + SPINE_MS + SPLIT_MS + OUTPUT_MS;

const LEGEND = [
  { phase: "analysis", label: "Analysis & Understanding" },
  { phase: "translation", label: "Translation & Generation" },
  { phase: "output", label: "Output & Scaling" },
] as const;

function smooth(t: number) {
  const x = Math.min(1, Math.max(0, t));
  return x * x * (3 - 2 * x);
}

function edgePath(a: Point, b: Point) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const adx = Math.abs(dx);
  const ady = Math.abs(dy);
  const p = (n: number) => n.toFixed(1);
  if (adx < 8 || ady < 8) {
    return `M ${p(a.x)} ${p(a.y)} L ${p(b.x)} ${p(b.y)}`;
  }
  const sx = Math.sign(dx);
  const sy = Math.sign(dy);
  const radius = Math.min(12, adx / 2.6, ady / 2.6);
  const midX = a.x + dx * 0.5;
  const sweep = sx * sy > 0 ? 1 : 0;
  return [
    `M ${p(a.x)} ${p(a.y)}`,
    `H ${p(midX - sx * radius)}`,
    `A ${p(radius)} ${p(radius)} 0 0 ${sweep} ${p(midX)} ${p(a.y + sy * radius)}`,
    `V ${p(b.y - sy * radius)}`,
    `A ${p(radius)} ${p(radius)} 0 0 ${sweep ? 0 : 1} ${p(midX + sx * radius)} ${p(b.y)}`,
    `H ${p(b.x)}`,
  ].join(" ");
}

function pointOnRoute(paths: SVGPathElement[], amount: number) {
  const count = paths.length;
  if (count === 0) return null;
  const scaled = Math.min(0.9999, Math.max(0, amount)) * count;
  const index = Math.min(count - 1, Math.floor(scaled));
  const path = paths[index];
  if (!path) return null;
  const length = path.getTotalLength();
  if (length <= 0) return null;
  const point = path.getPointAtLength(smooth(scaled - index) * length);
  return { x: point.x, y: point.y };
}

function earlierOnRoute(paths: SVGPathElement[], amount: number, back: number) {
  const count = paths.length;
  const shifted = amount * count - back;
  if (shifted <= 0) return null;
  return pointOnRoute(paths, shifted / count);
}

export function HomeWorkflow() {
  const netRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const pathRefs = useRef<Record<string, SVGPathElement | null>>({});
  const [lines, setLines] = useState<{ id: string; d: string; phase: Phase }[]>([]);
  const [size, setSize] = useState({ w: 0, h: 0 });

  useEffect(() => {
    const net = netRef.current;
    if (!net) return;

    const measure = () => {
      const root = net.getBoundingClientRect();
      const width = net.clientWidth;
      const height = net.clientHeight;
      if (width < 2 || height < 2) return;
      const centers: Record<string, Point> = {};
      net.querySelectorAll<HTMLElement>("[data-mark]").forEach((mark) => {
        const id = mark.dataset.mark;
        if (!id || mark.getClientRects().length === 0) return;
        const box = mark.getBoundingClientRect();
        if (box.width < 2 || box.height < 2) return;
        centers[id] = {
          x: box.left + box.width / 2 - root.left,
          y: box.top + box.height / 2 - root.top,
        };
      });
      const visible = new Set(Object.keys(centers));
      const active = [
        ...EDGES.filter((edge) => visible.has(edge.from) && visible.has(edge.to)),
        ...BRIDGES.filter((edge) => visible.has(edge.from) && visible.has(edge.to) && edge.via && !visible.has(edge.via)),
      ];
      const next = active.flatMap((edge) => {
        const from = centers[edge.from];
        const to = centers[edge.to];
        if (!from || !to) return [];
        return [{ id: edge.id, d: edgePath(from, to), phase: edge.phase }];
      });
      if (next.length === 0) return;
      const key = `${width}x${height}:${next.map((line) => line.d).join("|")}`;
      if (key === net.dataset.paths) return;
      net.dataset.paths = key;
      setSize({ w: width, h: height });
      setLines(next);
    };

    measure();
    const frame = requestAnimationFrame(measure);
    const observer = new ResizeObserver(measure);
    observer.observe(net);
    document.fonts?.ready.then(measure).catch(() => undefined);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    const net = netRef.current;
    const svg = svgRef.current;
    const section = net?.closest<HTMLElement>("#workflow");
    if (!net || !svg || !section || lines.length === 0) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const groups = [...svg.querySelectorAll<SVGGElement>("[data-pulse]")];
    const hold = new Map<string, number>();
    const shell = section.closest<HTMLElement>(".site-shell");
    let frame = 0;
    let startedAt = 0;
    let running = false;
    let inView = false;
    let observer: IntersectionObserver | null = null;

    const routes = (ids: string[]) =>
      ids
        .map((id) => pathRefs.current[id])
        .filter((path): path is SVGPathElement => !!path && path.getTotalLength() > 0);

    const place = (group: SVGGElement | undefined, route: SVGPathElement[], amount: number, scale: number) => {
      if (!group) return;
      const count = route.length;
      if (count > 0) {
        const scaled = Math.min(0.9999, Math.max(0, amount)) * count;
        const index = Math.min(count - 1, Math.floor(scaled));
        const phase = route[index]?.dataset.phase;
        if (phase) group.dataset.phase = phase;
      }
      const head = pointOnRoute(route, amount);
      const last = WORKFLOW_LIGHT.radii.length - 1;
      const circles = group.querySelectorAll("circle");
      circles.forEach((circle, index) => {
        const back = (WORKFLOW_LIGHT.trailMs[index] / WORKFLOW_CYCLE_MS) * count;
        const point = head ? earlierOnRoute(route, amount, back) : null;
        if (!point) {
          circle.setAttribute("opacity", "0");
          return;
        }
        circle.setAttribute("cx", point.x.toFixed(1));
        circle.setAttribute("cy", point.y.toFixed(1));
        circle.setAttribute("r", (scale * (WORKFLOW_LIGHT.radii[index] / WORKFLOW_LIGHT.radii[last])).toFixed(2));
        circle.setAttribute("opacity", String(WORKFLOW_LIGHT.opacity[index]));
      });
    };

    const hide = (group: SVGGElement | undefined) => {
      group?.querySelectorAll("circle").forEach((circle) => circle.setAttribute("opacity", "0"));
    };

    const clearLit = () => {
      hold.clear();
      net.querySelectorAll(".is-lit").forEach((node) => node.classList.remove("is-lit"));
    };

    const stop = () => {
      running = false;
      cancelAnimationFrame(frame);
      frame = 0;
      clearLit();
      groups.forEach(hide);
    };

    const tick = (now: number) => {
      if (!running) return;
      const elapsed = (now - startedAt) % CYCLE_MS;
      const active: Point[] = [];
      const scale = Math.max(3, Math.min(12, net.clientHeight / 120));
      const branches = BRANCHES.map((ids) => routes(ids));
      const spine = routes(SPINE);
      const split = SPLIT.map((ids) => routes(ids));
      const output = routes(OUTPUT);

      if (elapsed < BRANCH_MS) {
        const amount = elapsed / BRANCH_MS;
        branches.forEach((route, index) => {
          place(groups[index], route, amount, scale * 0.72);
          const head = pointOnRoute(route, amount);
          if (head) active.push(head);
        });
      } else if (elapsed < BRANCH_MS + SPINE_MS) {
        const amount = (elapsed - BRANCH_MS) / SPINE_MS;
        place(groups[0], spine, amount, scale);
        hide(groups[1]);
        hide(groups[2]);
        const head = pointOnRoute(spine, amount);
        if (head) active.push(head);
      } else if (elapsed < BRANCH_MS + SPINE_MS + SPLIT_MS) {
        const amount = (elapsed - BRANCH_MS - SPINE_MS) / SPLIT_MS;
        const branched = split.some((route) => route.length > 0);
        if (branched) {
          split.forEach((route, index) => {
            place(groups[index], route, amount, scale * 0.72);
            const head = pointOnRoute(route, amount);
            if (head) active.push(head);
          });
        } else {
          const bridge = routes(["select-pareto"]);
          place(groups[0], bridge, amount, scale);
          hide(groups[1]);
          hide(groups[2]);
          const head = pointOnRoute(bridge, amount);
          if (head) active.push(head);
        }
      } else {
        const amount = (elapsed - BRANCH_MS - SPINE_MS - SPLIT_MS) / OUTPUT_MS;
        place(groups[0], output, amount, scale);
        hide(groups[1]);
        hide(groups[2]);
        const head = pointOnRoute(output, amount);
        if (head) active.push(head);
      }

      net.querySelectorAll<HTMLElement>("[data-mark]").forEach((mark) => {
        const id = mark.dataset.mark;
        if (!id) return;
        const box = mark.getBoundingClientRect();
        const root = net.getBoundingClientRect();
        const center = {
          x: box.left + box.width / 2 - root.left,
          y: box.top + box.height / 2 - root.top,
        };
        const reach = Math.max(16, Math.min(box.width, box.height) * 0.42);
        const near = active.some((point) => Math.hypot(point.x - center.x, point.y - center.y) < reach);
        if (near) hold.set(id, now + 700);
        mark.parentElement?.classList.toggle("is-lit", (hold.get(id) ?? 0) > now);
      });

      if (!running) return;
      frame = requestAnimationFrame(tick);
    };

    const start = () => {
      if (running) return;
      running = true;
      startedAt = performance.now();
      clearLit();
      groups.forEach(hide);
      frame = requestAnimationFrame(tick);
    };

    const sync = () => {
      if (inView && !document.hidden) start();
      else stop();
    };

    const onIntersect: IntersectionObserverCallback = (entries) => {
      const entry = entries[entries.length - 1];
      const rootHeight = entry?.rootBounds?.height ?? 0;
      const visible = entry?.intersectionRect.height ?? 0;
      inView = rootHeight > 0 && visible / rootHeight >= 0.65;
      sync();
    };

    const connect = () => {
      observer?.disconnect();
      const root = shell?.dataset.siteDisplay === "classroom" ? shell : section.closest(".site-main");
      observer = new IntersectionObserver(onIntersect, {
        root,
        threshold: Array.from({ length: 21 }, (_, index) => index / 20),
      });
      observer.observe(section);
    };

    const onDisplay = () => connect();
    const onVisibility = () => sync();

    connect();
    const displayObserver = new MutationObserver(onDisplay);
    if (shell) displayObserver.observe(shell, { attributes: true, attributeFilter: ["data-site-display"] });
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stop();
      observer?.disconnect();
      displayObserver.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [lines]);

  return (
    <div className="home-workflow-board">
      <div className="home-workflow-net" ref={netRef}>
        <svg ref={svgRef} className="home-workflow-lines" width={size.w} height={size.h} aria-hidden="true">
          <defs>
            <WorkflowLightFilter id="home-workflow-glow" />
            <linearGradient id="home-workflow-shift" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="rgba(255,255,255,0.55)" />
              <stop offset="100%" stopColor="#0f7377" />
            </linearGradient>
          </defs>
          {lines.map((line) => (
            <path
              key={line.id}
              ref={(element) => {
                pathRefs.current[line.id] = element;
                if (element) element.setAttribute("data-phase", line.phase);
              }}
              className={`home-workflow-line is-${line.phase}`}
              d={line.d}
            />
          ))}
          {[0, 1, 2].map((index) => (
            <g key={index} data-pulse={index} data-phase="analysis" className="wf-proto-pulse" filter="url(#home-workflow-glow)">
              <WorkflowLightCircles />
            </g>
          ))}
        </svg>
        {NODES.map((node) => (
          <WorkflowNode key={node.id} node={node} />
        ))}
      </div>
      <ul className="home-workflow-legend">
        {LEGEND.map((item) => (
          <li key={item.phase} data-phase={item.phase}>
            {item.label}
          </li>
        ))}
      </ul>
    </div>
  );
}

function WorkflowNode({ node }: { node: NodeDef }) {
  return (
    <div
      className={node.wide ? `home-workflow-node is-${node.rank} is-wide` : `home-workflow-node is-${node.rank}`}
      data-id={node.id}
      data-phase={node.phase}
    >
      <div className="home-workflow-module" data-mark={node.id}>
        {node.slot ? <div className="home-workflow-slot" data-slot={node.id} /> : null}
        <p className="home-workflow-title">
          {node.title.map((line) => (
            <span key={line}>{line}</span>
          ))}
        </p>
      </div>
    </div>
  );
}
