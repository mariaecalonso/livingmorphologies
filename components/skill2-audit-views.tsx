"use client";

import { useEffect, useRef } from "react";
import { drawPlanField } from "@/components/skill1-viz";
import { FIELD_SIZE } from "@/lib/skill1/maps";
import type { FieldSnapshot } from "@/lib/skill1/types";
import type { MorphologyOverlays } from "@/lib/skill2/measurements";
import type { ArchitecturalPlan } from "@/lib/skill2/plan-morphogenesis";
import type { PlanModel } from "@/lib/skill2/plan-model";
import type { SectionModel, SectionPrimitive } from "@/lib/skill2/section-translate";

export type Skill2OverlayFlags = {
  mass: boolean;
  void: boolean;
  network: boolean;
  interior: boolean;
  circulation: boolean;
  skeleton: boolean;
};

function useCanvas(
  draw: (ctx: CanvasRenderingContext2D, width: number, height: number) => void,
  deps: unknown[],
) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const parent = canvas.parentElement;
    if (!parent) return;
    const render = () => {
      const rect = parent.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const width = Math.max(1, Math.floor(rect.width));
      const height = Math.max(1, Math.floor(rect.height));
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      draw(ctx, width, height);
    };
    render();
    const observer = new ResizeObserver(render);
    observer.observe(parent);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return ref;
}

function fieldOrigin(width: number, height: number, cells: number) {
  const side = Math.min(width, height);
  return {
    side,
    ox: (width - side) / 2,
    oy: (height - side) / 2,
    cell: side / cells,
  };
}

export function Skill2RawField({ snapshot }: { snapshot: FieldSnapshot | null }) {
  const ref = useCanvas(
    (ctx, width, height) =>
      drawPlanField(ctx, snapshot, width, height, { showHud: true, fine: true, density: 5 }),
    [snapshot, snapshot?.iteration],
  );
  return (
    <div className="skill2-audit-canvas-host">
      <canvas ref={ref} className="h-full w-full" role="img" aria-label="Raw Skill 1 Physarum field" />
    </div>
  );
}

function mapPoint(
  x: number,
  y: number,
  cols: number,
  rows: number,
  side: number,
) {
  return {
    px: (x / cols) * side,
    py: ((rows - y) / rows) * side,
  };
}

function strokeChain(
  ctx: CanvasRenderingContext2D,
  primitive: SectionPrimitive,
  cols: number,
  rows: number,
  side: number,
  occupancySize: number,
  color: string,
) {
  const pts = primitive.polyline;
  if (pts.length < 2) return;
  const scale = side / Math.max(1, occupancySize);
  ctx.strokeStyle = color;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (let i = 1; i < pts.length; i += 1) {
    const a = mapPoint(pts[i - 1].x, pts[i - 1].y, cols, rows, side);
    const b = mapPoint(pts[i].x, pts[i].y, cols, rows, side);
    const r = primitive.radius[Math.min(i, primitive.radius.length - 1)] ?? 0.15;
    ctx.lineWidth = Math.max(1.2, 2 * r * scale);
    ctx.beginPath();
    ctx.moveTo(a.px, a.py);
    ctx.lineTo(b.px, b.py);
    ctx.stroke();
  }
}

function drawSectionModel(
  ctx: CanvasRenderingContext2D,
  section: SectionModel,
  ox: number,
  oy: number,
  side: number,
) {
  const { width: cols, height: rows, occupancySize } = section;
  ctx.save();
  ctx.translate(ox, oy);
  ctx.fillStyle = "#070707";
  ctx.fillRect(0, 0, side, side);

  for (let i = 0; i < section.protectedVoid.length; i += 1) {
    if (!section.protectedVoid[i]) continue;
    const x = i % cols;
    const y = (i - x) / cols;
    const p = mapPoint(x, y + 1, cols, rows, side);
    const cell = side / cols;
    ctx.fillStyle = "#050608";
    ctx.fillRect(p.px, p.py, cell + 0.4, cell + 0.4);
  }

  const cell = side / cols;
  for (const primitive of section.primitives) {
    if (primitive.kind === "solid-body" && primitive.cells) {
      ctx.fillStyle = "rgba(236, 232, 222, 0.92)";
      for (const i of primitive.cells) {
        if (section.protectedVoid[i]) continue;
        const x = i % cols;
        const y = Math.floor(i / cols);
        const p = mapPoint(x, y + 1, cols, rows, side);
        ctx.fillRect(p.px, p.py, cell + 0.35, cell + 0.35);
      }
      continue;
    }
    const color =
      primitive.kind === "mass-spine"
        ? "rgba(242, 242, 238, 0.92)"
        : primitive.kind === "enclosure-edge"
          ? "rgba(220, 224, 218, 0.88)"
          : primitive.kind === "span"
            ? "rgba(210, 214, 208, 0.78)"
            : "rgba(236, 232, 222, 0.7)";
    strokeChain(ctx, primitive, cols, rows, side, occupancySize, color);
  }
  ctx.restore();
}

function drawOverlays(
  ctx: CanvasRenderingContext2D,
  overlays: MorphologyOverlays,
  flags: Skill2OverlayFlags,
  ox: number,
  oy: number,
  cell: number,
) {
  const { width: cols, height: rows } = overlays;
  ctx.save();
  ctx.translate(ox, oy);
  if (flags.void) {
    for (let y = 0; y < rows; y += 1) {
      const py = (rows - 1 - y) * cell;
      for (let x = 0; x < cols; x += 1) {
        if (!overlays.significantVoid[y * cols + x]) continue;
        ctx.fillStyle = "rgba(15, 115, 119, 0.22)";
        ctx.fillRect(x * cell, py, cell + 0.4, cell + 0.4);
      }
    }
  }
  if (flags.mass) {
    for (let y = 0; y < rows; y += 1) {
      const py = (rows - 1 - y) * cell;
      for (let x = 0; x < cols; x += 1) {
        if (!overlays.mass[y * cols + x]) continue;
        ctx.strokeStyle = "rgba(199, 126, 95, 0.85)";
        ctx.lineWidth = 0.7;
        ctx.strokeRect(x * cell + 0.3, py + 0.3, cell - 0.4, cell - 0.4);
      }
    }
  }
  if (flags.network) {
    for (let y = 0; y < rows; y += 1) {
      const py = (rows - 1 - y) * cell;
      for (let x = 0; x < cols; x += 1) {
        if (!overlays.corridor[y * cols + x]) continue;
        ctx.fillStyle = "rgba(125, 184, 184, 0.85)";
        ctx.fillRect(x * cell + cell * 0.25, py + cell * 0.25, cell * 0.5, cell * 0.5);
      }
    }
  }
  if (flags.interior) {
    ctx.strokeStyle = "rgba(242, 242, 238, 0.45)";
    ctx.lineWidth = 1.2;
    let minX = cols;
    let maxX = -1;
    let minY = rows;
    let maxY = -1;
    for (let y = 0; y < rows; y += 1) {
      for (let x = 0; x < cols; x += 1) {
        if (!overlays.interior[y * cols + x]) continue;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
    if (maxX >= minX) {
      const top = (rows - 1 - maxY) * cell;
      ctx.strokeRect(minX * cell, top, (maxX - minX + 1) * cell, (maxY - minY + 1) * cell);
    }
  }
  if (flags.circulation) {
    for (let y = 0; y < rows; y += 1) {
      const py = (rows - 1 - y) * cell;
      for (let x = 0; x < cols; x += 1) {
        const cls = overlays.circulation[y * cols + x];
        if (!cls) continue;
        ctx.fillStyle =
          cls === 4
            ? "rgba(199, 126, 95, 0.78)"
            : cls === 3
              ? "rgba(217, 161, 141, 0.55)"
              : cls === 2
                ? "rgba(15, 115, 119, 0.62)"
                : "rgba(155, 155, 152, 0.45)";
        ctx.fillRect(x * cell, py, cell + 0.4, cell + 0.4);
      }
    }
  }
  if (flags.skeleton) {
    ctx.fillStyle = "rgba(242, 242, 238, 0.92)";
    for (let y = 0; y < rows; y += 1) {
      const py = (rows - 1 - y) * cell;
      for (let x = 0; x < cols; x += 1) {
        if (!overlays.skeleton[y * cols + x]) continue;
        ctx.fillRect(x * cell + cell * 0.28, py + cell * 0.28, cell * 0.44, cell * 0.44);
      }
    }
  }
  ctx.restore();
}

/**
 * Experimental carving view only. Solid FIELD_SIZE×FIELD_SIZE mass, then
 * subtract a binary mask of SimulationState.trails.
 * trailNorm = trail / maxTrail
 * carved = trailNorm >= carveThreshold
 */
export const DIRECT_CARVE_THRESHOLD = 0.15;

export function Skill2DirectInverseField({
  trails,
  trailSize,
  carveThreshold = DIRECT_CARVE_THRESHOLD,
  showCaption = true,
  revision = 0,
}: {
  trails: number[] | null;
  trailSize: number;
  carveThreshold?: number;
  showCaption?: boolean;
  /** Changes when the trail buffer is updated in place. */
  revision?: number;
}) {
  const ref = useCanvas(
    (ctx, width, height) => {
      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = "#070707";
      ctx.fillRect(0, 0, width, height);
      const scale = Math.min(width, height) / FIELD_SIZE;
      const fieldH = FIELD_SIZE * scale;
      const ox = (width - fieldH) / 2;
      const oy = (height - fieldH) / 2;
      ctx.save();
      ctx.translate(ox, oy);
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, fieldH, fieldH);
      if (trails && trailSize >= 1) {
        let maxTrail = 0;
        for (const value of trails) if (value > maxTrail) maxTrail = value;
        const cell = fieldH / trailSize;
        if (maxTrail > 0) {
          ctx.fillStyle = "#000000";
          for (let y = 0; y < trailSize; y += 1) {
            for (let x = 0; x < trailSize; x += 1) {
              const trailNorm = (trails[y * trailSize + x] ?? 0) / maxTrail;
              if (trailNorm < carveThreshold) continue;
              ctx.fillRect(x * cell, fieldH - (y + 1) * cell, cell, cell);
            }
          }
        }
      }
      ctx.restore();
      if (showCaption) {
        ctx.fillStyle = "rgba(150,184,196,0.9)";
        ctx.font = "500 10px Rajdhani, sans-serif";
        ctx.fillText("DIRECT CARVING  SOLID FIELD − PHYSARUM TRAILS", 10, height - 10);
      }
    },
    [trails, trailSize, carveThreshold, showCaption, revision],
  );
  return (
    <div className="skill2-audit-canvas-host">
      <canvas
        ref={ref}
        className="h-full w-full"
        role="img"
        aria-label="Direct carving: solid field minus Physarum trail network"
      />
    </div>
  );
}

export function Skill2InterpretedField({
  overlays,
  flags,
  section,
}: {
  overlays: MorphologyOverlays | null;
  flags: Skill2OverlayFlags;
  section: SectionModel | null;
}) {
  const ref = useCanvas(
    (ctx, width, height) => {
      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = "#050505";
      ctx.fillRect(0, 0, width, height);
      if (!overlays) return;
      const { width: cols } = overlays;
      const { ox, oy, side, cell } = fieldOrigin(width, height, cols);
      if (section) drawSectionModel(ctx, section, ox, oy, side);
      drawOverlays(ctx, overlays, flags, ox, oy, cell);
    },
    [overlays, section, flags.mass, flags.void, flags.network, flags.interior, flags.circulation, flags.skeleton],
  );
  return (
    <div className="skill2-audit-canvas-host">
      <canvas
        ref={ref}
        className="h-full w-full"
        role="img"
        aria-label="Skill 2 interpreted sectional morphology"
      />
    </div>
  );
}

export type PlanEvidenceFlags = {
  strong: boolean;
  connective: boolean;
  mass: boolean;
  void: boolean;
  skeleton: boolean;
  circulation: boolean;
  endpoints: boolean;
  branchPoints: boolean;
  source: boolean;
  attractor: boolean;
  interior: boolean;
};

export const DEFAULT_PLAN_EVIDENCE_FLAGS: PlanEvidenceFlags = {
  strong: true,
  connective: true,
  mass: false,
  void: true,
  skeleton: true,
  circulation: false,
  endpoints: true,
  branchPoints: true,
  source: true,
  attractor: true,
  interior: true,
};

const CIRCULATION_COLOR = [
  "",
  "rgba(90, 168, 176, 0.9)",
  "rgba(62, 200, 180, 0.9)",
  "rgba(210, 160, 90, 0.9)",
  "rgba(255, 122, 50, 0.95)",
];

function drawPlanEvidence(
  ctx: CanvasRenderingContext2D,
  plan: PlanModel,
  flags: PlanEvidenceFlags,
  width: number,
  height: number,
) {
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#050505";
  ctx.fillRect(0, 0, width, height);
  const columns = plan.domain.columns;
  const rows = plan.domain.rows;
  const { ox, oy, side, cell } = fieldOrigin(width, height, columns);
  ctx.save();
  ctx.translate(ox, oy);
  ctx.fillStyle = "#07090b";
  ctx.fillRect(0, 0, side, side);

  if (flags.interior) {
    ctx.strokeStyle = "rgba(242, 242, 238, 0.55)";
    ctx.lineWidth = 1;
    for (let y = 0; y < rows; y += 1) {
      const py = (rows - 1 - y) * cell;
      for (let x = 0; x < columns; x += 1) {
        const i = y * columns + x;
        if (!plan.domain.interior[i]) continue;
        const edge =
          x === 0 ||
          y === 0 ||
          x === columns - 1 ||
          y === rows - 1 ||
          !plan.domain.interior[i - 1] ||
          !plan.domain.interior[i + 1] ||
          !plan.domain.interior[i - columns] ||
          !plan.domain.interior[i + columns];
        if (!edge) continue;
        ctx.strokeRect(x * cell + 0.2, py + 0.2, Math.max(0.6, cell - 0.4), Math.max(0.6, cell - 0.4));
      }
    }
  }

  if (flags.void) {
    for (let y = 0; y < rows; y += 1) {
      const py = (rows - 1 - y) * cell;
      for (let x = 0; x < columns; x += 1) {
        if (!plan.void.significant[y * columns + x]) continue;
        ctx.fillStyle = "rgba(15, 115, 119, 0.55)";
        ctx.fillRect(x * cell, py, cell + 0.35, cell + 0.35);
      }
    }
  }

  if (flags.connective) {
    for (let y = 0; y < rows; y += 1) {
      const py = (rows - 1 - y) * cell;
      for (let x = 0; x < columns; x += 1) {
        if (!plan.reinforcement.connective[y * columns + x]) continue;
        ctx.fillStyle = "rgba(125, 184, 184, 0.8)";
        ctx.fillRect(x * cell, py, cell + 0.3, cell + 0.3);
      }
    }
  }

  if (flags.circulation) {
    for (let y = 0; y < rows; y += 1) {
      const py = (rows - 1 - y) * cell;
      for (let x = 0; x < columns; x += 1) {
        const code = plan.network.circulation[y * columns + x];
        if (!code) continue;
        ctx.fillStyle = CIRCULATION_COLOR[code] ?? "rgba(242,242,238,0.7)";
        ctx.fillRect(x * cell + cell * 0.2, py + cell * 0.2, cell * 0.6, cell * 0.6);
      }
    }
  }

  if (flags.strong) {
    for (let y = 0; y < rows; y += 1) {
      const py = (rows - 1 - y) * cell;
      for (let x = 0; x < columns; x += 1) {
        if (!plan.reinforcement.strong[y * columns + x]) continue;
        ctx.fillStyle = "rgba(210, 138, 48, 0.92)";
        ctx.fillRect(x * cell, py, cell + 0.35, cell + 0.35);
      }
    }
  }

  if (flags.mass) {
    for (let y = 0; y < rows; y += 1) {
      const py = (rows - 1 - y) * cell;
      for (let x = 0; x < columns; x += 1) {
        if (!plan.mass.mask[y * columns + x]) continue;
        ctx.strokeStyle = "rgba(242, 236, 220, 0.95)";
        ctx.lineWidth = 0.8;
        ctx.strokeRect(x * cell + 0.35, py + 0.35, Math.max(0.5, cell - 0.7), Math.max(0.5, cell - 0.7));
      }
    }
  }

  if (flags.skeleton) {
    ctx.fillStyle = "rgba(232, 244, 242, 0.95)";
    for (let y = 0; y < rows; y += 1) {
      const py = (rows - 1 - y) * cell;
      for (let x = 0; x < columns; x += 1) {
        if (!plan.network.skeleton[y * columns + x]) continue;
        ctx.fillRect(x * cell + cell * 0.35, py + cell * 0.35, Math.max(1, cell * 0.3), Math.max(1, cell * 0.3));
      }
    }
  }

  const mark = (index: number, fill: string) => {
    const x = index % columns;
    const y = (index - x) / columns;
    const py = (rows - 1 - y) * cell;
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.arc(x * cell + cell * 0.5, py + cell * 0.5, Math.max(1.6, cell * 0.85), 0, Math.PI * 2);
    ctx.fill();
  };
  if (flags.branchPoints) {
    for (const index of plan.network.branchPoints) mark(index, "rgba(255, 122, 50, 0.95)");
  }
  if (flags.endpoints) {
    for (const index of plan.network.endpoints) mark(index, "rgba(90, 220, 196, 0.95)");
  }

  const anchor = (point: { x: number; y: number }, stroke: string) => {
    const px = (point.x / plan.domain.occupancySize) * side;
    const py = side - (point.y / plan.domain.occupancySize) * side;
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(px, py, 6, 0, Math.PI * 2);
    ctx.stroke();
  };
  if (flags.source) anchor(plan.anchors.source, "rgba(90, 220, 196, 0.95)");
  if (flags.attractor) anchor(plan.anchors.attractor, "rgba(210, 138, 48, 0.95)");
  ctx.restore();
}

export function Skill2PlanEvidenceField({
  plan,
  flags,
}: {
  plan: PlanModel | null;
  flags: PlanEvidenceFlags;
}) {
  const ref = useCanvas(
    (ctx, width, height) => {
      if (!plan) {
        ctx.clearRect(0, 0, width, height);
        ctx.fillStyle = "#050505";
        ctx.fillRect(0, 0, width, height);
        return;
      }
      drawPlanEvidence(ctx, plan, flags, width, height);
    },
    [
      plan,
      flags.strong,
      flags.connective,
      flags.mass,
      flags.void,
      flags.skeleton,
      flags.circulation,
      flags.endpoints,
      flags.branchPoints,
      flags.source,
      flags.attractor,
      flags.interior,
    ],
  );
  return (
    <div className="skill2-audit-canvas-host">
      <canvas
        ref={ref}
        className="h-full w-full"
        role="img"
        aria-label="PlanModel XY evidence diagnostic"
      />
    </div>
  );
}

export function Skill2WhitePlanField({ plan }: { plan: ArchitecturalPlan | null }) {
  const ref = useCanvas(
    (ctx, width, height) => {
      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = "#000000";
      ctx.fillRect(0, 0, width, height);
      if (!plan) return;
      const { ox, oy, cell } = fieldOrigin(width, height, plan.columns);
      ctx.save();
      ctx.translate(ox, oy);
      ctx.fillStyle = "#ffffff";
      for (let y = 0; y < plan.rows; y += 1) {
        const py = (plan.rows - 1 - y) * cell;
        for (let x = 0; x < plan.columns; x += 1) {
          if (!plan.mass[y * plan.columns + x]) continue;
          ctx.fillRect(x * cell, py, cell + 0.35, cell + 0.35);
        }
      }
      ctx.restore();
    },
    [plan],
  );
  return (
    <div className="skill2-audit-canvas-host">
      <canvas ref={ref} className="h-full w-full" role="img" aria-label="White architectural plan" />
    </div>
  );
}
