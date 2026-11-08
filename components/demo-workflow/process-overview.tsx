"use client";

import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import brief from "@/data/skill5/workplace-brief.json";
import picks from "@/public/demo/skill2/picks.json";
import { DEMO_BOARD } from "@/lib/demo-workflow/chapters";
import { ASSEMBLIES, CONFIGURATIONS, CONTINUATION_COUNTS, GENERATIVE_SYSTEMS, HYBRID, STUDIO } from "@/lib/demo-workflow/chapter-facts";
import { MODULE_STILLS, OVERVIEW_FACTS as FACTS, OVERVIEW_STILLS as STILLS, PROGRAM } from "@/lib/demo-workflow/overview";
import { SITE_ARCHETYPES, SITE_PROGRAMS } from "@/lib/skill5/catalog";
import styles from "@/components/demo-workflow/process-overview.module.css";

/**
 * Full Process Overview on a 1622 × 429 stage.
 * The travelling line, its path, and the human-evaluation loop are held until they are redrawn.
 */
/** Territories follow the reference board: five phases, titles on one line, graphics below. */
const ZONES = [
  { x: 0, w: 300, head: 12, y: 94 },
  { x: 300, w: 330, head: 8, y: 94 },
  { x: 630, w: 400, head: 10, y: 94 },
  { x: 1030, w: 292, head: 8, y: 94 },
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
  const ordered = [...points.filter((item) => !item.pareto), ...points.filter((item) => item.pareto)];
  return (
    <svg className={`${styles.at} ${styles.pareto}`} style={place(x, y, w, h)} viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Vertical Void candidates by Formal and Spatial score">
      <path d={`M ${pad} 4 V ${height - pad} H ${width - 2}`} />
      <text x={width - 2} y={height - 4} textAnchor="end">Formal</text>
      <text x={pad + 3} y={11}>Spatial</text>
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

/** First validated module of each program. Same order as the Skill 3 handoff. */
const REPRESENTATIVE_MODULES = SITE_PROGRAMS.flatMap((program) => {
  const index = SITE_ARCHETYPES.findIndex((item) => item.program === program);
  const still = MODULE_STILLS[index];
  return still ? [still.src] : [];
});

function moduleStill(archetypeId: string) {
  const index = SITE_ARCHETYPES.findIndex((item) => item.archetypeId === archetypeId);
  return index >= 0 ? MODULE_STILLS[index] : undefined;
}

function Research() {
  return (
    <>
      <PhaseList x={12} y={128} names={["Typology Analysis", "Criteria + Descriptors", "Physarum Selection"]} tone="glow" />
      <Plates srcs={STILLS.typologies} x={12} y={160} cols={3} cell={86} height={86} contain bare className={styles.mono} />
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
            <figcaption>{system.name}</figcaption>
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
      {board.generationOne ? <Still src={board.generationOne} x={312} y={208} w={148} h={54} contain bare /> : null}
      <Pareto x={470} y={208} w={136} h={50} points={board.points} pickId={board.pickId} />
      {board.status === "error" ? <Caption x={470} y={220} lines={["Catalog unavailable"]} /> : null}
      <Plates srcs={REPRESENTATIVE_PICKS} x={312} y={260} cols={3} cell={46} height={46} contain bare />
      <Caption x={460} y={266} width={140} value={FACTS.picks} lines={["selected", "2D candidates"]} />
    </>
  );
}

function FlowArrow({ x, y }: { x: number; y: number }) {
  return (
    <svg className={`${styles.at} ${styles.flowArrow}`} style={place(x, y, 16, 12)} viewBox="0 0 16 12" aria-hidden="true">
      <path d="M0 6h12M9 2l5 4-5 4" />
    </svg>
  );
}

function Vertical() {
  return (
    <>
      <PhaseList x={642} y={128} names={steps(2)} tone="glow" width={280} />
      <Still src={STILLS.z0} x={642} y={174} w={78} h={78} contain bare />
      <FlowArrow x={726} y={204} />
      <Still src={STILLS.stack} x={746} y={168} w={68} h={90} contain bare />
      <FlowArrow x={822} y={204} />
      <Still src={STILLS.form} x={842} y={164} w={148} h={96} contain bare />
      <Plates srcs={REPRESENTATIVE_MODULES} x={642} y={258} cols={3} cell={46} height={46} contain bare />
      <Caption x={792} y={262} width={160} value={FACTS.modules} lines={["validated modules", `${CONTINUATION_COUNTS.selectedOutsideCarvedMass} outside N01–N${CONTINUATION_COUNTS.carvedMass}`]} />
    </>
  );
}

function Context() {
  return (
    <>
      <PhaseList x={1042} y={128} names={steps(3)} tone="copperGlow" width={250} />
      <Still src={STILLS.siteModel} x={1042} y={174} w={200} h={84} contain bare />
      <Still src={STILLS.client[1]} x={1252} y={174} w={52} h={38} contain bare />
      <Still src={STILLS.client[0]} x={1252} y={214} w={52} h={38} contain bare />
      <At x={1042} y={258} className={styles.brief} vars={{ "--w": 260 }}>
        <b>{STUDIO.name}</b>
        <span>{brief.site} · north up · {PROGRAM.join(" · ")}</span>
        <span>{brief.plan.widthFeet} × {brief.plan.depthFeet} ft · {brief.occupancy.daytimeWork} day · {brief.occupancy.eveningGathering} evening</span>
      </At>
    </>
  );
}

/** The stored 5 × 5 field for the hybrid example. Columns move from parent A toward parent B. */
function CandidateField({ x, y, w, h }: { x: number; y: number; w: number; h: number }) {
  const { selected, parentAWeights, intensity } = HYBRID;
  return (
    <ol className={`${styles.at} ${styles.field}`} style={place(x, y, w, h)} aria-label={`Candidate field, ${selected.id} selected`}>
      {intensity.map((_, row) =>
        parentAWeights.map((__, column) => {
          const id = `H${String(row * parentAWeights.length + column + 1).padStart(2, "0")}`;
          return <li key={id} data-selected={id === selected.id || undefined} />;
        }),
      )}
    </ol>
  );
}

function Integration() {
  const parentA = moduleStill("void-field");
  const parentB = moduleStill("inserted-horizontal-plate");
  return (
    <>
      <PhaseList x={1334} y={128} names={steps(4)} tone="glow" width={270} />
      {parentA ? <Still src={parentA.src} x={1334} y={176} w={52} h={46} contain bare /> : null}
      <At x={1390} y={190} className={styles.plus}>+</At>
      {parentB ? <Still src={parentB.src} x={1406} y={176} w={52} h={46} contain bare /> : null}
      <FlowArrow x={1466} y={192} />
      <Still src={HYBRID.stills[1]} x={1486} y={170} w={112} h={58} contain bare />
      <Caption x={1334} y={228} width={250} lines={[`${HYBRID.parents[0]} + ${HYBRID.parents[1]}`]} />
      <CandidateField x={1334} y={246} w={62} h={52} />
      <At x={1406} y={246} className={styles.mix} vars={{ "--w": 108 }}>
        <span><b>{ASSEMBLIES.total}</b>assemblies</span>
        <span><b>{HYBRID.selected.id}</b>candidate field</span>
        <span>{CONFIGURATIONS.saved.length === 0 ? "No configuration saved" : `${CONFIGURATIONS.saved.length} saved`}</span>
      </At>
      <Still src={STILLS.siteModel} x={1518} y={246} w={88} h={44} contain bare />
    </>
  );
}

export function ProcessOverview({ label, onSelect }: { label: string; onSelect: (chapter: number) => void }) {
  return (
    <div className={styles.overview} role="group" aria-label={label}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className={styles.ground} src="/demo/overview/filament-ground-membrane.png" alt="" draggable={false} />
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
                <span className={zoneIndex >= 3 ? `${styles.head} ${styles.headCopper}` : styles.head}>
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
