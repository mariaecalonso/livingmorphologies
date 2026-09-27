"use client";

import { mulberry32 } from "@/lib/physarum";
import type { PhysarumParams } from "@/lib/types";

type Node = {
  x: number;
  y: number;
  hub: boolean;
  radius: number;
};

type Edge = {
  a: number;
  b: number;
  orange: boolean;
  curve: number;
};

function generateNetwork(params: PhysarumParams) {
  const rng = mulberry32(params.seed);
  const count = Math.round(90 + params.agentCount * 0.14);
  const nodes: Node[] = [];
  const cx = 400;
  const cy = 268;
  const spreadX = 148 + params.spread * 90 + params.elongate * 80;
  const spreadY = 118 + params.spread * 70 - params.elongate * 24;

  for (let i = 0; i < count; i += 1) {
    const angle = rng() * Math.PI * 2;
    const radius = Math.pow(rng(), 0.46 + params.centerPull * 0.2);
    const x = cx + Math.cos(angle) * radius * spreadX * 1.55 + (rng() - 0.5) * 22;
    const y = cy + Math.sin(angle) * radius * spreadY * 1.45 + (rng() - 0.5) * 16;
    const hub = rng() < 0.07 + params.hierarchy * 0.18;
    nodes.push({
      x: Math.round(x * 10) / 10,
      y: Math.round(y * 10) / 10,
      hub,
      radius: Math.round((hub ? 3.1 + rng() * 1.4 : 1.15 + rng() * 1.05) * 10) / 10,
    });
  }

  const k = 2 + Math.round(params.deposit * 8);
  const edges: Edge[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < nodes.length; i += 1) {
    const distances = nodes
      .map((node, index) => ({
        index,
        d: (node.x - nodes[i].x) ** 2 + (node.y - nodes[i].y) ** 2,
      }))
      .filter((item) => item.index !== i)
      .sort((a, b) => a.d - b.d)
      .slice(0, k);

    for (const near of distances) {
      const key = i < near.index ? `${i}-${near.index}` : `${near.index}-${i}`;
      if (seen.has(key)) continue;
      seen.add(key);
      edges.push({
        a: i,
        b: near.index,
        orange:
          nodes[i].hub ||
          nodes[near.index].hub ||
          rng() < params.contrast * 0.2,
        curve: Math.round((rng() - 0.5) * 36 * 10) / 10,
      });
    }
  }

  return { nodes, edges };
}

function quad(
  a: Node,
  b: Node,
  curve: number,
) {
  const mx = (a.x + b.x) / 2 + curve;
  const my = (a.y + b.y) / 2 - curve * 0.32;
  return `M ${a.x.toFixed(1)} ${a.y.toFixed(1)} Q ${mx.toFixed(1)} ${my.toFixed(1)} ${b.x.toFixed(1)} ${b.y.toFixed(1)}`;
}

export function PhysarumField({
  params,
  running,
}: {
  params: PhysarumParams;
  running: boolean;
}) {
  const network = generateNetwork(params);

  return (
    <svg
      viewBox="0 0 800 520"
      className="h-full w-full"
      preserveAspectRatio="xMidYMid slice"
      role="img"
      aria-label="Physarum emergent network"
    >
      <defs>
        <radialGradient id="field-glow" cx="50%" cy="52%" r="48%">
          <stop offset="0%" stopColor="rgba(0,90,120,0.35)" />
          <stop offset="100%" stopColor="rgba(2,8,14,0)" />
        </radialGradient>
        <filter id="soft-glow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="1.6" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <rect width="800" height="520" fill="#071018" />
      <rect width="800" height="520" fill="url(#field-glow)" />
      <g filter="url(#soft-glow)">
        {network.edges.map((edge, index) => {
          const a = network.nodes[edge.a];
          const b = network.nodes[edge.b];
          const d = quad(a, b, edge.curve);
          return (
            <path
              key={`e-${index}`}
              d={d}
              fill="none"
              stroke={edge.orange ? "#ff8a3d" : "#00e4ff"}
              strokeWidth={edge.orange ? 1.25 : 0.8}
              strokeOpacity={edge.orange ? 0.82 : 0.55}
            />
          );
        })}
        {network.nodes.map((node, index) => (
          <g key={`n-${index}`}>
            <circle
              cx={node.x}
              cy={node.y}
              r={node.radius * 2.8}
              fill={node.hub ? "rgba(255,140,60,0.22)" : "rgba(0,228,255,0.14)"}
            />
            <circle
              cx={node.x}
              cy={node.y}
              r={node.radius}
              fill={node.hub ? "#ffb067" : "#7af6ff"}
            >
              {running && node.hub ? (
                <animate
                  attributeName="opacity"
                  values="0.65;1;0.65"
                  dur="2.4s"
                  repeatCount="indefinite"
                />
              ) : null}
            </circle>
          </g>
        ))}
      </g>
    </svg>
  );
}
