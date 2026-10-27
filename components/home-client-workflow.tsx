"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import brief from "@/data/skill5/workplace-brief.json";
import { useMeshes } from "@/components/home-site-workflow";
import { ModuleGlassPreview, clayPreviewRadius } from "@/components/site/site-workspace";
import { useRevealed } from "@/components/workflow-present";
import { boardLayoutSignature } from "@/lib/home-workflow-camera";
import { PROGRAM_LABEL, SITE_ARCHETYPES, SITE_PROGRAMS } from "@/lib/skill5/catalog";
import "../app/lab/site/site-interface.css";

type Slot = { left: number; top: number; width: number; height: number };
type Layout = { width: number; height: number; slots: Slot[]; leaders: { x: number; top: number; bottom: number }[] };

const PROGRAM_ROWS = SITE_PROGRAMS.map((program) => ({
  program,
  modules: SITE_ARCHETYPES.filter((entry) => entry.program === program),
}));

const STUDIO = [
  { label: "Furniture", src: "/home/client/studio/furniture-main.png" },
  { label: "Fashion", src: "/home/client/studio/fashion-main.png" },
] as const;

const ACTIVITIES = [
  { label: "Focused work", tone: "copper" },
  { label: "Collaborative work", tone: "white" },
  { label: "Waterfront gathering", tone: "teal" },
] as const;

function useClientLayout(svgRef: React.RefObject<SVGSVGElement | null>) {
  const [layout, setLayout] = useState<Layout | null>(null);
  const [lit, setLit] = useState<number | null>(null);
  useEffect(() => {
    const board = svgRef.current?.parentElement;
    if (!board) return;
    const tracked = () => board.querySelectorAll<HTMLElement>(".wf-board > span.wf-frame[data-frame]");
    let signature = "";
    const measure = () => {
      signature = boardLayoutSignature(board, tracked());
      const width = board.clientWidth;
      const height = board.clientHeight;
      const box = board.getBoundingClientRect();
      if (width < 2 || height < 2 || box.width < 2) return;
      const scale = box.width / width;
      const frames = [...tracked()].map((node) => {
        const rect = node.getBoundingClientRect();
        const l = (rect.left - box.left) / scale;
        const t = (rect.top - box.top) / scale;
        const w = rect.width / scale;
        return { l, t, w, cx: l + w / 2 };
      });
      if (frames.length < 5) return;
      const ceiling = height * 0.06;
      const gap = height * 0.04;
      const room = Math.min(...frames.map((frame) => frame.t - gap - ceiling));
      const slotHeight = Math.max(36, Math.min(room, frames[0].w * 0.72));
      const slots = frames.map((frame) => ({ left: frame.l, top: frame.t - gap - slotHeight, width: frame.w, height: slotHeight }));
      setLayout({
        width,
        height,
        slots,
        leaders: frames.map((frame, index) => ({ x: frame.cx, top: slots[index].top + slotHeight, bottom: frame.t })),
      });
    };
    measure();
    void document.fonts.ready.then(measure);
    const resize = new ResizeObserver(measure);
    resize.observe(board);
    tracked().forEach((node) => resize.observe(node));
    const follow = window.setInterval(() => {
      if (boardLayoutSignature(board, tracked()) !== signature) measure();
    }, 150);
    const read = () => {
      const node = board.querySelector<HTMLElement>(".wf-frame.is-lit[data-frame]");
      const next = node ? Number(node.dataset.frame) : null;
      if (next != null && Number.isFinite(next)) setLit(next);
    };
    const watch = new MutationObserver(read);
    watch.observe(board, { subtree: true, attributes: true, attributeFilter: ["class"] });
    return () => {
      window.clearInterval(follow);
      resize.disconnect();
      watch.disconnect();
    };
  }, [svgRef]);
  return { layout, lit };
}

function ModuleGrid() {
  const meshes = useMeshes(SITE_ARCHETYPES);
  return (
    <div className="wf-cli-modules">
      {PROGRAM_ROWS.map((row) => (
        <div key={row.program} className="wf-cli-module-row">
          <span className="wf-cli-kicker">{PROGRAM_LABEL[row.program]}</span>
          {row.modules.map((entry) => {
            const stored = meshes[entry.moduleId];
            const mesh = stored && stored !== "missing" ? stored : null;
            return (
              <figure key={entry.moduleId} className="wf-site-glass" title={entry.name}>
                {mesh ? <ModuleGlassPreview mesh={mesh} fitRadius={clayPreviewRadius(mesh) * 0.86} /> : <span className="wf-cli-empty">{stored === "missing" ? "Not stored" : "Reading"}</span>}
              </figure>
            );
          })}
        </div>
      ))}
    </div>
  );
}

function StudioIdentity() {
  return (
    <div className="wf-cli-studio">
      <p className="wf-cli-kicker">Design focus · <b>Physarum</b></p>
      <div className="wf-cli-studio-row">
        {STUDIO.map((item) => (
          <figure key={item.label}>
            <img src={item.src} alt="" draggable={false} loading="lazy" decoding="async" />
            <figcaption>{item.label}</figcaption>
          </figure>
        ))}
      </div>
    </div>
  );
}

function ProgramDiagram() {
  return (
    <div className="wf-cli-program">
      <p className="wf-cli-kicker">Program</p>
      <ul className="wf-cli-chips">
        {brief.programs.map((program) => (
          <li key={program}>{program}</li>
        ))}
      </ul>
      <p className="wf-cli-kicker">Activity</p>
      <ul className="wf-cli-activities">
        {ACTIVITIES.map((item) => (
          <li key={item.label} data-tone={item.tone}>
            <i />
            {item.label}
          </li>
        ))}
      </ul>
    </div>
  );
}

function OccupancyDiagram() {
  const peak = 800;
  const top = 18;
  const base = 78;
  const rise = (count: number) => base - ((base - top) * count) / peak;
  return (
    <div className="wf-cli-occupancy">
      <svg viewBox="0 0 200 112" role="img" aria-label={`On site at the same time: ${brief.occupancy.daytimeWork} during the day, ${brief.occupancy.eveningGathering} in the evening. ${brief.occupancy.badgeHoldersAndVisitors} badge holders and visitors, not on site at the same time.`}>
        <text className="wf-cli-svg-kicker" x="4" y="8">On site at once</text>
        <rect className="wf-cli-bar is-day" x="8" y={rise(500)} width="86" height={base - rise(500)} />
        <rect className="wf-cli-bar-range" x="8" y={rise(500)} width="86" height={rise(400) - rise(500)} />
        <rect className="wf-cli-bar is-evening" x="106" y={rise(800)} width="86" height={base - rise(800)} />
        <text className="wf-cli-svg-value" x="51" y={rise(500) - 4} textAnchor="middle">{brief.occupancy.daytimeWork}</text>
        <text className="wf-cli-svg-value" x="149" y={rise(800) - 4} textAnchor="middle">{brief.occupancy.eveningGathering}</text>
        <path className="wf-cli-axis" d={`M 4 ${base} H 196`} />
        <text className="wf-cli-svg-label" x="8" y={base + 9}>8 AM · Day work</text>
        <text className="wf-cli-svg-label" x="192" y={base + 9} textAnchor="end">Evening gathering · 10 PM</text>
        <rect className="wf-cli-total" x="8" y="96" width="184" height="12" />
        <text className="wf-cli-svg-label" x="100" y="104.5" textAnchor="middle">{brief.occupancy.badgeHoldersAndVisitors} badge holders + visitors · not at once</text>
      </svg>
    </div>
  );
}

type FloorShare = { floor: number; start: number; span: number; program: "work" | "gathering" | "lobby" };

/** Five floors as ten half-floor units: Workspace 5 (50%), Gathering 4 (40%), Lobby 1 (10%). */
const FLOOR_SHARES: readonly FloorShare[] = [
  { floor: 1, start: 0, span: 0.5, program: "lobby" },
  { floor: 1, start: 0.5, span: 0.5, program: "gathering" },
  { floor: 2, start: 0, span: 1, program: "gathering" },
  { floor: 3, start: 0, span: 0.5, program: "work" },
  { floor: 3, start: 0.5, span: 0.5, program: "gathering" },
  { floor: 4, start: 0, span: 1, program: "work" },
  { floor: 5, start: 0, span: 1, program: "work" },
];

const SHARE_LEGEND = [
  { program: "work", label: "Workspace 50%" },
  { program: "gathering", label: "Gathering 40%" },
  { program: "lobby", label: "Lobby 10%" },
] as const;

function ImplicationsDiagram() {
  const stackX = 30;
  const stackW = 104;
  const floorY = (floor: number) => 16 + (5 - floor) * 14;
  return (
    <div className="wf-cli-implications">
      <svg viewBox="0 0 200 112" role="img" aria-label="Preliminary reading. Five floors at most. Workspace 50 percent on the upper floors, Gathering 40 percent toward the waterfront, Lobby 10 percent at the ground floor, one vertical core. Absolute areas are not in the brief.">
        <text className="wf-cli-svg-kicker" x="4" y="8">Preliminary · 5 floors max</text>
        {[5, 4, 3, 2, 1].map((floor) => (
          <text key={floor} className="wf-cli-svg-label" x="24" y={floorY(floor) + 7.5} textAnchor="end">{floor}</text>
        ))}
        {FLOOR_SHARES.map((share) => (
          <rect
            key={`${share.floor}-${share.start}`}
            className={`wf-cli-floor is-${share.program}`}
            x={stackX + share.start * stackW}
            y={floorY(share.floor)}
            width={share.span * stackW}
            height="10"
          />
        ))}
        <path className="wf-cli-core" d="M 44 14 V 88" />
        {SHARE_LEGEND.map((item, index) => (
          <g key={item.program}>
            <rect className={`wf-cli-floor is-${item.program}`} x="141" y={27 + index * 14} width="6" height="6" />
            <text className="wf-cli-svg-label" x="151" y={32 + index * 14}>{item.label}</text>
          </g>
        ))}
        <text className="wf-cli-svg-label" x="44" y="97" textAnchor="middle">Core</text>
        <text className="wf-cli-svg-label" x="134" y="97" textAnchor="end">Waterfront →</text>
        <text className="wf-cli-svg-flag" x="100" y="108" textAnchor="middle">Absolute areas are not in the brief</text>
      </svg>
    </div>
  );
}

const PREVIEWS: readonly ReactNode[] = [
  <ModuleGrid key="modules" />,
  <StudioIdentity key="studio" />,
  <ProgramDiagram key="program" />,
  <OccupancyDiagram key="occupancy" />,
  <ImplicationsDiagram key="implications" />,
];

export function ClientWorkflowLayer() {
  const svgRef = useRef<SVGSVGElement>(null);
  const { layout, lit } = useClientLayout(svgRef);
  const revealed = useRevealed(lit);
  return (
    <>
      <svg ref={svgRef} className="wf-site-links" viewBox={layout ? `0 0 ${layout.width} ${layout.height}` : undefined} aria-hidden="true">
        {layout?.leaders.map((leader, index) => (
          <path key={index} className="wf-opt-leader" data-on={revealed >= index || undefined} d={`M ${leader.x} ${leader.top} L ${leader.x} ${leader.bottom}`} />
        ))}
      </svg>
      {layout?.slots.map((slot, index) => (
        <div
          key={index}
          className="wf-opt-visual wf-cli-visual"
          data-on={revealed >= index || undefined}
          style={{
            left: `${(slot.left / layout.width) * 100}%`,
            top: `${(slot.top / layout.height) * 100}%`,
            width: `${(slot.width / layout.width) * 100}%`,
            height: `${(slot.height / layout.height) * 100}%`,
          }}
        >
          <div className="wf-opt-visual-play">{PREVIEWS[index]}</div>
        </div>
      ))}
    </>
  );
}
