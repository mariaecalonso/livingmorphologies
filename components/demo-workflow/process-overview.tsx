"use client";

import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { ArchetypeReading } from "@/components/demo-workflow/archetype-reading";
import { ContextWorkflow, SiteSheet } from "@/components/demo-workflow/context-chapter";
import chapterStyles from "@/components/demo-workflow/demo-workflow.module.css";
import { RESEARCH_CONTENT } from "@/components/demo-workflow/research-chapter";
import researchStyles from "@/components/demo-workflow/research-chapter.module.css";
import { ProcessDemonstration } from "@/components/demo-workflow/vertical-demonstration";
import { DEMO_BOARD } from "@/lib/demo-workflow/chapters";
import "@/components/demo-workflow/vertical-lab-embed.css";
import styles from "@/components/demo-workflow/process-overview.module.css";

/**
 * Full Process Overview on a 1622 × 429 stage.
 * The chain, the human-evaluation loop, and the validated-module handoff sit in the open bands.
 */
/** Seven chapters across the 1622 × 429 stage. Titles sit on one line of zones, and the lists sit below. */
const ZONES = [
  { x: 0, w: 232, head: 6, y: 94 },
  { x: 232, w: 232, head: 6, y: 94 },
  { x: 464, w: 232, head: 8, y: 94 },
  { x: 696, w: 232, head: 6, y: 94 },
  { x: 928, w: 232, head: 6, y: 94 },
  { x: 1160, w: 232, head: 6, y: 94 },
  { x: 1392, w: 230, head: 6, y: 94 },
] as const;

const CHAPTER_MATERIAL: readonly ((props: { onOpen: () => void }) => ReactNode)[] = [
  () => <Research />,
  Generative,
  () => <Vertical />,
  () => <Context />,
  () => <Strategy />,
  () => <Integration />,
  () => <Approach />,
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

/** Chapter 01's focused workflow, scaled into the overview. The criteria cursor runs because this article is already focused. */
function ResearchWorkflow() {
  const chapter = DEMO_BOARD[0].chapter;
  return (
    <div data-research-process="">
      <article className={chapterStyles.chapter} data-phase="focused" data-visual="" data-still="">
        <div className={chapterStyles.detail}>
          <div className={`${chapterStyles.detailColumns} ${researchStyles.composed}`} data-layout="">
            {chapter.sequence.map((operation, index) => (
              <section key={operation.label} className={chapterStyles.detailColumn} data-light="lit" aria-label={operation.label}>
                <div className={`${chapterStyles.detailHead} ${styles.researchHead}`}>
                  <span className={chapterStyles.chapterIndex}>{String(index + 1).padStart(2, "0")}</span>
                  {operation.label}
                </div>
                <div className={chapterStyles.detailBody}>{RESEARCH_CONTENT.details[index]}</div>
              </section>
            ))}
          </div>
        </div>
      </article>
    </div>
  );
}

function Research() {
  return (
    <>
      <PhaseList x={8} y={122} names={steps(0)} tone="glow" width={210} />
      <div className={`${styles.at} ${styles.researchLab}`} style={place(12, 198, 210, 96)}>
        <ResearchWorkflow />
      </div>
    </>
  );
}

function Generative() {
  return (
    <>
      <PhaseList x={240} y={122} names={steps(1)} tone="glow" width={210} />
      <div className={`${styles.at} ${styles.readingLab}`} style={place(240, 198, 210, 96)}>
        <ArchetypeReading delayReading={false} />
      </div>
    </>
  );
}

function Vertical() {
  return (
    <>
      <PhaseList x={472} y={122} names={steps(2)} tone="glow" width={210} />
      <div className={`${styles.at} ${styles.verticalLab}`} style={place(472, 198, 210, 96)}>
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
      <PhaseList x={704} y={122} names={steps(3)} tone="copperGlow" width={210} />
      {ready ? (
        <div className={`${styles.at} ${styles.contextLab}`} style={place(704, 198, 210, 96)}>
          <div data-context-analysis="">
            <ContextWorkflow part="analysis" />
          </div>
        </div>
      ) : null}
    </>
  );
}

function Strategy() {
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  return (
    <>
      <PhaseList x={936} y={122} names={steps(4)} tone="glow" width={210} />
      {ready ? (
        <div className={`${styles.at} ${styles.contextLab}`} style={place(936, 198, 210, 96)}>
          <div data-context-analysis="">
            <SiteSheet sheet="strategy" />
          </div>
        </div>
      ) : null}
    </>
  );
}

function Integration() {
  return <PhaseList x={1168} y={122} names={steps(5)} tone="glow" width={210} />;
}

function Approach() {
  return <PhaseList x={1400} y={122} names={steps(6)} tone="copper" width={210} />;
}

/** Step marks between the seven chapters. */
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
        <path d="M192 107 H230" />
        <path d="M424 107 H462" />
        <path d="M656 107 H694" />
        <path d="M888 107 H926" />
        <path d="M1120 107 H1158" />
        <path d="M1352 107 H1390" />
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
