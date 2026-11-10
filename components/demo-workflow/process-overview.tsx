"use client";

import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import picks from "@/public/demo/skill2/picks.json";
import { DEMO_BOARD } from "@/lib/demo-workflow/chapters";
import { GENERATIVE_SYSTEMS } from "@/lib/demo-workflow/chapter-facts";
import { ContextWorkflow } from "@/components/demo-workflow/context-chapter";
import { HybridLabPage } from "@/components/demo-workflow/integration-run";
import { ProcessDemonstration } from "@/components/demo-workflow/vertical-demonstration";
import { OVERVIEW_FACTS as FACTS, OVERVIEW_STILLS as STILLS } from "@/lib/demo-workflow/overview";
import "@/components/demo-workflow/vertical-lab-embed.css";
import styles from "@/components/demo-workflow/process-overview.module.css";

/**
 * Full Process Overview on a 1622 × 429 stage.
 * The chain, the human-evaluation loop, and the validated-module handoff sit in the open bands.
 */
/** Territories follow the reference board: five phases, titles on one line, graphics below. */
const ZONES = [
  { x: 0, w: 300, head: 12, y: 94 },
  { x: 300, w: 330, head: 8, y: 94 },
  { x: 630, w: 400, head: 38, y: 94 },
  { x: 1030, w: 292, head: -20, y: 94 },
  { x: 1322, w: 300, head: 8, y: 94 },
] as const;

const CHAPTER_MATERIAL: readonly ((props: { onOpen: () => void }) => ReactNode)[] = [
  () => <Research />,
  Generative,
  () => <Vertical />,
  () => <Context />,
  () => <Integration />,
];

function place(x: number, y: number, w?: number, h?: number, extra?: Record<string, number>): CSSProperties {
  return { "--x": x, "--y": y, ...(w != null ? { "--w": w } : null), ...(h != null ? { "--h": h } : null), ...extra } as CSSProperties;
}

function At({ x, y, className, children, vars, bare, onOpen }: { x: number; y: number; className?: string; children?: ReactNode; vars?: Record<string, number>; bare?: boolean; onOpen?: () => void }) {
  return (
    <div className={className ? `${styles.at} ${className}` : styles.at} style={place(x, y, undefined, undefined, vars)} data-bare={bare || undefined} data-hit={onOpen ? "" : undefined} onClick={onOpen}>
      {children}
    </div>
  );
}

function Still({ src, x, y, w, h = w, contain, bare, onOpen }: { src: string; x: number; y: number; w: number; h?: number; contain?: boolean; bare?: boolean; onOpen?: () => void }) {
  return (
    <div className={`${styles.at} ${styles.still}`} style={place(x, y, w, h)} data-bare={bare || undefined} data-hit={onOpen ? "" : undefined} onClick={onOpen}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="" loading="lazy" decoding="async" data-contain={contain || undefined} />
    </div>
  );
}

function Plates({ srcs, alts, x, y, cols, cell, height = cell, contain, selected, bare, onOpen, className }: {
  srcs: readonly string[];
  alts?: readonly string[];
  x: number;
  y: number;
  cols: number;
  cell: number;
  height?: number;
  contain?: boolean;
  selected?: number;
  bare?: boolean;
  onOpen?: () => void;
  className?: string;
}) {
  return (
    <At x={x} y={y} className={className ? `${styles.plates} ${className}` : styles.plates} vars={{ "--cols": cols, "--cell": cell, "--cell-h": height }} bare={bare} onOpen={onOpen}>
      {srcs.map((src, index) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img key={src} src={src} alt={alts?.[index] ?? ""} loading="lazy" decoding="async" data-contain={contain || undefined} data-selected={index === selected || undefined} />
      ))}
    </At>
  );
}

function Caption({ x, y, value, lines, tone, width }: { x: number; y: number; value?: ReactNode; lines: readonly ReactNode[]; tone?: "teal" | "copper"; width?: number }) {
  return (
    <At x={x} y={y} className={width ? `${styles.caption} ${styles.wrap}` : styles.caption} vars={width ? { "--cap": width } : undefined}>
      {lines.map((line, index) => (
        <span key={index} data-tone={tone}>
          {index === 0 && value != null ? <b>{value}</b> : null}
          {line}
        </span>
      ))}
    </At>
  );
}

function PhaseList({ x, y, names, tone, width }: { x: number; y: number; names: readonly string[]; tone?: "copper" | "glow" | "copperGlow"; width?: number }) {
  const toneClass = tone === "copper" ? styles.phaseListCopper : tone === "glow" ? styles.phaseListGlow : tone === "copperGlow" ? styles.phaseListCopperGlow : "";
  return (
    <At x={x} y={y} className={toneClass ? `${styles.phaseList} ${toneClass}` : styles.phaseList} vars={width ? { "--list": width } : undefined}>
      {names.map((name) => (
        <span key={name}>{name}</span>
      ))}
    </At>
  );
}

function steps(index: number) {
  return DEMO_BOARD[index].chapter.sequence.map((step) => step.label);
}

type VoidPoint = { id: number; generation: number; formal: number; spatial: number; pareto: boolean; image: string | null };

type VoidBoard = {
  status: "loading" | "ready" | "error";
  points: VoidPoint[];
  pickId: number | null;
  generationOne: string | null;
};

const VOID_EMPTY: VoidBoard = { status: "loading", points: [], pickId: null, generationOne: null };

/** Vertical Void plates and scores from the same catalogue and pick the Optimization workflow reads. */
function useVoidBoard(): VoidBoard {
  const [board, setBoard] = useState<VoidBoard>(VOID_EMPTY);
  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      try {
        const [catalog, picks] = await Promise.all([
          fetch("/demo/skill2/catalog.json", { signal: controller.signal }).then((response) => {
            if (!response.ok) throw new Error(String(response.status));
            return response.json() as Promise<{ archetypes: { archetypeId: string; candidates: VoidPoint[] }[] }>;
          }),
          fetch("/demo/skill2/picks.json", { signal: controller.signal }).then((response) => {
            if (!response.ok) throw new Error(String(response.status));
            return response.json() as Promise<{ archetypeId: string; candidateId: number }[]>;
          }),
        ]);
        const archetype = catalog.archetypes.find((item) => item.archetypeId === "vertical-void");
        if (!archetype) throw new Error("missing archetype");
        const pickId = picks.find((item) => item.archetypeId === "vertical-void")?.candidateId ?? null;
        const pictured = archetype.candidates.filter((item): item is VoidPoint & { image: string } => Boolean(item.image));
        const firstGeneration = Math.min(...pictured.map((item) => item.generation));
        const generationOne = pictured.filter((item) => item.generation === firstGeneration).sort((a, b) => a.id - b.id)[0]?.image ?? null;
        setBoard({
          status: "ready",
          points: archetype.candidates,
          pickId,
          generationOne,
        });
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setBoard((current) => ({ ...current, status: "error" }));
      }
    };
    void load();
    return () => controller.abort();
  }, []);
  return board;
}

/** Formal × Spatial scores for Vertical Void. Pareto candidates are marked; the propagation pick is ringed. */
function Pareto({ x, y, w, h, points, pickId }: { x: number; y: number; w: number; h: number; points: readonly VoidPoint[]; pickId: number | null }) {
  if (points.length === 0) return null;
  const xs = points.map((item) => item.formal);
  const ys = points.map((item) => item.spatial);
  const x0 = Math.min(...xs);
  const y0 = Math.min(...ys);
  const spanX = Math.max(...xs) - x0 || 1;
  const spanY = Math.max(...ys) - y0 || 1;
  const width = 160;
  const height = 96;
  const pad = 16;
  const X = (value: number) => pad + ((value - x0) / spanX) * (width - pad * 1.7);
  const Y = (value: number) => height - pad - ((value - y0) / spanY) * (height - pad * 1.8);
  const pick = points.find((item) => item.id === pickId);
  const front = points.filter((item) => item.pareto);
  const nearest = Math.min(2, Math.max(0, front.length - 1));
  const links: [number, number][] = [];
  const seen = new Set<string>();
  front.forEach((item, index) => {
    front
      .map((other, otherIndex) => ({
        otherIndex,
        distance: index === otherIndex ? Infinity : (item.formal - other.formal) ** 2 + (item.spatial - other.spatial) ** 2,
      }))
      .sort((a, b) => a.distance - b.distance)
      .slice(0, nearest)
      .forEach(({ otherIndex }) => {
        const key = index < otherIndex ? `${index}-${otherIndex}` : `${otherIndex}-${index}`;
        if (seen.has(key)) return;
        seen.add(key);
        links.push([index, otherIndex]);
      });
  });
  const ordered = [...points.filter((item) => !item.pareto), ...front];
  return (
    <svg className={`${styles.at} ${styles.pareto}`} style={place(x, y, w, h)} viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Vertical Void candidates by Formal and Spatial score">
      <path d={`M ${pad} 4 V ${height - pad} H ${width - 2}`} />
      <text x={width - 2} y={height - 4} textAnchor="end">Formal</text>
      <text x={pad + 3} y={11}>Spatial</text>
      {links.map(([from, to]) => (
        <line key={`${front[from].id}-${front[to].id}`} x1={X(front[from].formal).toFixed(1)} y1={Y(front[from].spatial).toFixed(1)} x2={X(front[to].formal).toFixed(1)} y2={Y(front[to].spatial).toFixed(1)} />
      ))}
      {ordered.map((item) => (
        <circle key={item.id} cx={X(item.formal).toFixed(1)} cy={Y(item.spatial).toFixed(1)} r={item.pareto ? 3.1 : 2} data-pareto={item.pareto || undefined} />
      ))}
      {pick ? <circle className={styles.paretoPick} cx={X(pick.formal)} cy={Y(pick.spatial)} r={6.4} /> : null}
    </svg>
  );
}

const PICK_TYPES = ["lobby", "workspace", "gathering"] as const;

/** One selected 2D candidate from each typology, in catalogue order. The count is the full handoff. */
const REPRESENTATIVE_PICKS = PICK_TYPES.flatMap((typologyId) => {
  const index = picks.findIndex((item) => item.typologyId === typologyId);
  if (index < 0) return [];
  return [STILLS.picks[index]];
});

function Research() {
  return (
    <>
      <PhaseList x={12} y={128} names={["Typology Analysis", "Criteria + Descriptors", "Physarum Selection"]} tone="glow" />
      <Plates srcs={STILLS.typologies} x={12} y={160} cols={3} cell={76} height={76} contain bare className={styles.mono} />
      <At x={12} y={248} className={styles.chain} vars={{ "--w": 276 }}>
        <span><b>{FACTS.archetypes}</b> Archetypes</span>
        <em>→</em>
        <span>Criteria + Descriptors</span>
        <em>→</em>
        <span>Physarum Logic</span>
      </At>
      <At x={12} y={266} className={styles.systems}>
        {GENERATIVE_SYSTEMS.map((system) => (
          <figure key={system.id} data-selected={"selected" in system && system.selected ? "" : undefined}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={system.src} alt="" />
            <figcaption>{{ ca: "Cellular", wfc: "Wave", stigmergy: "Stigmergy" }[system.id]}</figcaption>
          </figure>
        ))}
      </At>
    </>
  );
}

function Generative() {
  const board = useVoidBoard();
  return (
    <>
      <PhaseList x={312} y={128} names={steps(1)} tone="glow" width={300} />
      <div className={`${styles.at} ${styles.rules}`} style={place(312, 172, 300, 24)}>
        <p><span>Criteria</span><em>→</em><span>Growth instinct</span></p>
        <p><span>Descriptors</span><em>→</em><span>Spatial recipe</span></p>
      </div>
      {board.generationOne ? <Still src={board.generationOne} x={312} y={208} w={130} h={48} contain bare /> : null}
      <Pareto x={452} y={208} w={120} h={44} points={board.points} pickId={board.pickId} />
      {board.status === "error" ? <Caption x={452} y={220} lines={["Catalog unavailable"]} /> : null}
      <Plates srcs={REPRESENTATIVE_PICKS} x={312} y={260} cols={3} cell={40} height={40} contain bare />
      <Caption x={446} y={266} width={140} value={FACTS.picks} lines={["selected", "2D candidates"]} />
    </>
  );
}

function Vertical() {
  return (
    <>
      <PhaseList x={670} y={128} names={steps(2)} tone="glow" width={280} />
      <div className={`${styles.at} ${styles.verticalLab}`} style={place(670, 176, 250, 108)}>
        <div data-vertical-process="">
          <ProcessDemonstration />
        </div>
      </div>
    </>
  );
}

function Context() {
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  return (
    <>
      <PhaseList x={1014} y={128} names={steps(3)} tone="copperGlow" width={250} />
      {ready ? (
        <div className={`${styles.at} ${styles.contextLab}`} style={place(1014, 176, 250, 108)}>
          <div data-context-analysis="">
            <ContextWorkflow part="analysis" />
          </div>
        </div>
      ) : null}
    </>
  );
}

function Integration() {
  return (
    <>
      <PhaseList x={1334} y={128} names={steps(4)} tone="glow" width={270} />
      <div className={`${styles.at} ${styles.integrationLab}`} style={place(1334, 176, 250, 108)}>
        <HybridLabPage />
      </div>
    </>
  );
}

/** The reference relationship: 01 → 05, human evaluation back to Context, validated modules into Integration. */
function Relationship() {
  return (
    <svg className={styles.relation} viewBox="0 0 1622 429" preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <marker id="overview-teal" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
          <path d="M0 0 L8 4 L0 8 Z" />
        </marker>
        <marker id="overview-copper" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
          <path d="M0 0 L8 4 L0 8 Z" />
        </marker>
        <marker id="overview-step-teal" markerWidth="6" markerHeight="6" refX="5.2" refY="3" orient="auto">
          <path d="M0 0 L6 3 L0 6 Z" />
        </marker>
        <marker id="overview-step-copper" markerWidth="6" markerHeight="6" refX="5.2" refY="3" orient="auto">
          <path d="M0 0 L6 3 L0 6 Z" />
        </marker>
      </defs>
      <g data-kind="step" markerEnd="url(#overview-step-teal)">
        <path d="M226 107 H264" />
        <path d="M552 107 H590" />
        <path d="M885 107 H923" />
      </g>
      <path data-kind="step" data-tone="copper" markerEnd="url(#overview-step-copper)" d="M1198 107 H1236" />
      <g data-kind="feedback">
        <path markerEnd="url(#overview-step-copper)" d="M1411 92 V80 H1057 V92" />
        <text x="1234" y="74" textAnchor="middle">Human evaluation</text>
      </g>
      <g data-kind="handoff">
        <path markerEnd="url(#overview-step-teal)" d="M858 312 V330 H1472 V310" />
        <text x="1165" y="322" textAnchor="middle">Validated 3D modules</text>
      </g>
    </svg>
  );
}

export function ProcessOverview({ label, onSelect }: { label: string; onSelect: (chapter: number) => void }) {
  return (
    <div className={styles.overview} role="group" aria-label={label}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className={styles.ground} src="/demo/chapter-steps-membrane.png?v=3" alt="" draggable={false} />
      <Relationship />
      <ol className={styles.zones}>
        {DEMO_BOARD.map(({ chapter, index }, zoneIndex) => {
          const zone = ZONES[zoneIndex];
          return (
            <li key={chapter.id}>
              <button
                type="button"
                className={`${styles.at} ${styles.zone}`}
                style={place(zone.x, 0, zone.w, undefined, { "--head": zone.head, "--label-y": zone.y })}
                onClick={() => onSelect(index)}
                aria-label={chapter.title}
              >
                <span className={styles.head}>
                  <span className={styles.index}>{chapter.index}</span>
                  <span className={styles.title}>{chapter.title}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>

      <div className={styles.layer}>
        {CHAPTER_MATERIAL.map((Material, index) => (
          <div key={DEMO_BOARD[index].chapter.id} className={styles.material}>
            <Material onOpen={() => onSelect(DEMO_BOARD[index].index)} />
          </div>
        ))}
      </div>
    </div>
  );
}
