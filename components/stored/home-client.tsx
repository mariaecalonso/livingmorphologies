"use client";

/** Previous client board. The demo workflow still shows it. Copy comes from `lib/client/ecologic-studio.ts`. */

import { useLayoutEffect, useRef, useState } from "react";
import styles from "@/components/stored/home-client.module.css";
import { CLIENT_PROFILE, ORGANIZATION, PRACTICE_AREAS, PRECEDENTS, WORKING_MODES } from "@/lib/client/ecologic-studio";

const FIELD = { width: 7407, height: 2160 } as const;

/** Centers of the four circles in the background image, as fractions of that image. */
const CIRCLES = [
  { x: 6115 / FIELD.width, y: 301 / FIELD.height },
  { x: 6339 / FIELD.width, y: 754 / FIELD.height },
  { x: 6345 / FIELD.width, y: 1215 / FIELD.height },
  { x: 6193 / FIELD.width, y: 1655 / FIELD.height },
] as const;

const RING = 136;

/** The board has three study frames. The fourth precedent stays in the client record. */
const STUDIES = PRECEDENTS.slice(0, 3);

/** Places belong to this diagram, not to the client record. */
const MODES = [
  { id: "focused", place: "n", tone: "copper" },
  { id: "collaborative", place: "e", tone: "paper" },
  { id: "experimental", place: "w", tone: "teal" },
  { id: "social", place: "s", tone: "copper" },
] as const;

/** Three marks in the existing row. The full practice list is the organization row. */
const PROCESS_MARKS = ["network", "sheet", "shell"] as const;

const SPINE_MARKS = ["network", "sheet", "fields", "shell"] as const;

type Anchor = { x: number; y: number; r: number };

function fieldAnchors(boxWidth: number, boxHeight: number): Anchor[] {
  const scale = Math.max(boxWidth / FIELD.width, boxHeight / FIELD.height);
  const drawnWidth = FIELD.width * scale;
  const drawnHeight = FIELD.height * scale;
  const offsetX = boxWidth - drawnWidth;
  const offsetY = (boxHeight - drawnHeight) / 2;
  const radius = (RING / FIELD.width) * drawnWidth;
  return CIRCLES.map((circle) => ({
    x: (offsetX + circle.x * drawnWidth) / boxWidth,
    y: (offsetY + circle.y * drawnHeight) / boxHeight,
    r: radius,
  }));
}

export function HomeClient() {
  const boardRef = useRef<HTMLDivElement>(null);
  const fieldRef = useRef<HTMLImageElement>(null);
  const [anchors, setAnchors] = useState<Anchor[] | null>(null);

  useLayoutEffect(() => {
    const field = fieldRef.current;
    const board = boardRef.current;
    if (!field || !board) return;
    const measure = () => {
      const width = field.clientWidth;
      const height = field.clientHeight;
      if (width < 2 || height < 2) return;
      const next = fieldAnchors(width, height);
      const stop = Math.min(...next.map((anchor) => anchor.x * width - anchor.r)) - anchorGap(width);
      const rail = Math.max(120, stop);
      board.style.setProperty("--client-rail", `${rail}px`);
      const left = Number.parseFloat(getComputedStyle(board).paddingLeft) || 0;
      board.dataset.stack = rail - left < 820 ? "true" : "false";
      setAnchors(next);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(field);
    return () => observer.disconnect();
  }, []);

  return (
    <div className={styles.board} ref={boardRef}>
      <img ref={fieldRef} className={styles.mesh} src="/home/client/studio-field-7407.png?v=6" alt="" draggable={false} />

      <header className={styles.identity}>
        <h2 className={styles.title}>
          <span>{CLIENT_PROFILE.name}</span>
        </h2>
        <p className={styles.lede}>
          Founded in {CLIENT_PROFILE.founded.city} in {CLIENT_PROFILE.founded.year} by {CLIENT_PROFILE.cofounders.join(" and ")}.{" "}
          {CLIENT_PROFILE.summary}
        </p>
      </header>

      <div className={styles.work}>
        <div className={styles.renders} aria-label="Project precedents">
          {STUDIES.map((study) => (
            <figure key={study.id} className={styles.panel}>
              <div className={styles.frame} />
              <figcaption>
                <StudyIcon />
                <span>{study.shortLabel}</span>
              </figcaption>
            </figure>
          ))}
        </div>
      </div>

      <div className={styles.diagrams}>
        <div className={styles.diagramGrid}>
          <section className={styles.diagram} aria-label="Operations">
            <h3>Operations — Working Modes</h3>
            <div className={styles.orbit}>
              <OperationsField />
              {MODES.map((mode) => {
                const record = WORKING_MODES.find((item) => item.id === mode.id);
                const label = record?.label ?? mode.id;
                return (
                  <span key={mode.id} className={styles.mode} data-place={mode.place} data-tone={mode.tone}>
                    <ModeIcon label={label} />
                    {label}
                  </span>
                );
              })}
            </div>
          </section>

          <section className={styles.diagram} aria-label="Design process">
            <h3>Areas of practice</h3>
            <ol className={styles.flow}>
              {PRACTICE_AREAS.slice(0, PROCESS_MARKS.length).map((area, index) => (
                <li key={area.id}>
                  <ProcessMark kind={PROCESS_MARKS[index]} />
                  <span className={styles.flowLabel}>
                    {area.short.split(" ").map((word) => (
                      <span key={word}>{word}</span>
                    ))}
                  </span>
                  {index < PROCESS_MARKS.length - 1 ? <FlowArrow /> : null}
                </li>
              ))}
            </ol>
          </section>

          <section className={styles.diagram} aria-label="Organizational structure">
            <h3>Organization</h3>
            <div className={styles.org}>
              <div className={styles.orgLead}>
                <span className={styles.node} data-tone="teal">
                  Directors
                </span>
              </div>
              <svg className={styles.orgBranches} viewBox="0 0 500 28" preserveAspectRatio="none" aria-hidden="true">
                <path d="M142 0 V8 H50 V28 M142 8 H150 V28 M142 8 H250 V28 M142 8 H350 V28 M142 8 H450 V28" />
              </svg>
              <div className={styles.orgDisciplines}>
                {PRACTICE_AREAS.map((area) => (
                  <span key={area.id} className={styles.node} data-tone={area.tone}>
                    {area.short}
                  </span>
                ))}
              </div>
              <p className={styles.orgNotes}>
                <span>{ORGANIZATION.directors.map((name) => name.replace("Dr ", "")).join(" · ")}</span>
                <span>{ORGANIZATION.fabrication.note}</span>
              </p>
            </div>
          </section>
        </div>
      </div>

      {anchors ? (
        <ol className={styles.spine}>
          {SPINE_MARKS.map((mark, index) => {
            const stage = PRACTICE_AREAS[index];
            const anchor = anchors[index];
            const fieldWidth = fieldRef.current?.clientWidth ?? 0;
            const shift = Math.round(anchor.r + 12);
            const room = Math.max(88, Math.floor(fieldWidth - anchor.x * fieldWidth - shift - 12));
            return (
              <li
                key={stage.id}
                className={styles.pin}
                data-tone={index === 0 ? "teal" : index === SPINE_MARKS.length - 1 ? "copper" : "paper"}
                style={{
                  left: `${anchor.x * 100}%`,
                  top: `${anchor.y * 100}%`,
                }}
              >
                <span
                  className={styles.glyph}
                  style={{
                    width: `${Math.round(anchor.r * 1.32)}px`,
                    height: `${Math.round(anchor.r * 1.32)}px`,
                  }}
                >
                  <CircleGlyph kind={mark} />
                </span>
                <div className={styles.stage} style={{ transform: `translate(${shift}px, -50%)`, width: `${room}px` }}>
                  <p>{stage.short}</p>
                </div>
              </li>
            );
          })}
        </ol>
      ) : null}
    </div>
  );
}

function StudyIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="1.5" />
      <path d="M12 3.8 V7.6 M12 16.4 V20.2 M3.8 12 H7.6 M16.4 12 H20.2" />
      <path d="M6.2 6.2 L8.8 8.8 M15.2 15.2 L17.8 17.8 M17.8 6.2 L15.2 8.8 M8.8 15.2 L6.2 17.8" />
    </svg>
  );
}

function ModeIcon({ label }: { label: string }) {
  if (label === "Focused") {
    return (
      <svg viewBox="0 0 16 16" aria-hidden="true">
        <circle cx="8" cy="8" r="2.1" />
        <path d="M8 1.8 V4.2 M8 11.8 V14.2 M1.8 8 H4.2 M11.8 8 H14.2" />
      </svg>
    );
  }
  if (label === "Experimental") {
    return (
      <svg viewBox="0 0 16 16" aria-hidden="true">
        <circle cx="5" cy="8" r="1.7" />
        <circle cx="11" cy="5.2" r="1.5" />
        <circle cx="11" cy="11" r="1.5" />
        <path d="M6.5 7.4 L9.6 5.8 M6.5 8.6 L9.6 10.2" />
      </svg>
    );
  }
  if (label === "Collaborative") {
    return (
      <svg viewBox="0 0 16 16" aria-hidden="true">
        <circle cx="5.2" cy="6" r="1.7" />
        <circle cx="10.8" cy="6" r="1.7" />
        <path d="M2.6 12.2 C3.2 10.1 4.2 9.2 5.6 9.2 H6.4 C7.6 9.2 8.3 9.8 8.8 10.8" />
        <path d="M7.4 10.6 C8 9.6 8.8 9.2 10 9.2 H10.6 C12.2 9.2 13.2 10.2 13.6 12.2" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <circle cx="8" cy="4.6" r="1.6" />
      <circle cx="4.2" cy="11.2" r="1.5" />
      <circle cx="11.8" cy="11.2" r="1.5" />
      <path d="M8 6.2 V8.2 L4.8 10 M8 8.2 L11.2 10" />
    </svg>
  );
}

const CIRCLE_ICONS = {
  network: "/home/client/icons/bio-intelligence.svg",
  sheet: "/home/client/icons/computational-translation.svg",
  fields: "/home/client/icons/interdisciplinary-design.svg",
  shell: "/home/client/icons/physical-prototyping.svg",
} as const;

function CircleGlyph({ kind }: { kind: (typeof SPINE_MARKS)[number] }) {
  return <img src={CIRCLE_ICONS[kind]} alt="" draggable={false} />;
}

function OperationsField() {
  return (
    <svg className={styles.orbitField} viewBox="0 0 320 200" aria-hidden="true">
      <defs>
        <linearGradient id="client-mode-stroke" x1="14" y1="14" x2="306" y2="190" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#8fd4d6" />
          <stop offset="0.5" stopColor="#e7fafa" />
          <stop offset="1" stopColor="#c77e5f" />
        </linearGradient>
        <marker id="client-mode-arrow" viewBox="0 0 10 10" markerWidth="6" markerHeight="6" refX="8" refY="5" orient="auto">
          <path d="M1.2 1.6 L8.2 5 L1.2 8.4" fill="none" stroke="#f0d8cc" strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round" />
        </marker>
      </defs>
      <g fill="none" stroke="url(#client-mode-stroke)" strokeWidth="1.2" strokeLinecap="round">
        <path d="M160 16 C160 46 62 48 16 100" markerEnd="url(#client-mode-arrow)" />
        <path d="M160 16 C160 46 258 48 304 100" markerEnd="url(#client-mode-arrow)" />
        <path d="M304 112 C258 156 204 178 160 190" markerStart="url(#client-mode-arrow)" markerEnd="url(#client-mode-arrow)" />
      </g>
      <g fill="none" stroke="rgba(226, 248, 248, 0.88)" strokeWidth="1.05" strokeLinejoin="round">
        <path d="M160 100 L160 52 M160 100 L232 100 M160 100 L160 148 M160 100 L88 100" />
        <path d="M160 52 L232 100 L160 148 L88 100 Z" />
        <path d="M124 76 L196 124 M196 76 L124 124" />
      </g>
      <g>
        <circle cx="160" cy="100" r="6.5" fill="rgba(143, 220, 222, 0.16)" />
        <circle cx="160" cy="52" r="5" fill="rgba(143, 220, 222, 0.12)" />
        <circle cx="232" cy="100" r="5" fill="rgba(199, 126, 95, 0.16)" />
        <circle cx="160" cy="148" r="5" fill="rgba(199, 126, 95, 0.14)" />
        <circle cx="88" cy="100" r="5" fill="rgba(143, 220, 222, 0.12)" />
      </g>
      <g fill="#e9fbfb">
        <circle cx="160" cy="100" r="2.6" />
        <circle cx="160" cy="52" r="2.1" />
        <circle cx="232" cy="100" r="2.1" />
        <circle cx="160" cy="148" r="2.1" />
        <circle cx="88" cy="100" r="2.1" />
        <circle cx="196" cy="76" r="1.45" fill="#e7b89f" />
        <circle cx="124" cy="124" r="1.45" fill="#e7b89f" />
      </g>
    </svg>
  );
}

function anchorGap(width: number) {
  return Math.max(18, width * 0.012);
}

function FlowArrow() {
  return (
    <svg className={styles.arrow} viewBox="0 0 28 10" aria-hidden="true">
      <path d="M0 5 H22" />
      <path d="M17 1.2 L25 5 L17 8.8" />
    </svg>
  );
}

function ProcessMark({ kind }: { kind: (typeof PROCESS_MARKS)[number] }) {
  if (kind === "network") {
    return (
      <svg className={styles.mark} viewBox="0 0 72 56" aria-hidden="true">
        <g fill="none" stroke="currentColor" strokeWidth="1.15">
          <path d="M36 28 L16 12 M36 28 L56 14 M36 28 L14 40 M36 28 L58 42 M36 28 L36 8 M16 12 L8 22 M56 14 L64 24" />
        </g>
        <g fill="currentColor">
          <circle cx="36" cy="28" r="2.4" />
          <circle cx="16" cy="12" r="1.8" />
          <circle cx="56" cy="14" r="1.8" />
          <circle cx="14" cy="40" r="1.6" />
          <circle cx="58" cy="42" r="1.6" />
          <circle cx="36" cy="8" r="1.4" />
          <circle cx="8" cy="22" r="1.2" />
          <circle cx="64" cy="24" r="1.2" />
        </g>
      </svg>
    );
  }
  if (kind === "sheet") {
    return (
      <svg className={styles.mark} viewBox="0 0 72 56" aria-hidden="true">
        <g fill="none" stroke="currentColor" strokeWidth="1.15">
          <path d="M8 20 C22 10, 34 30, 48 18 C58 11, 64 16, 66 20" />
          <path d="M8 30 C22 20, 34 40, 48 28 C58 21, 64 26, 66 30" />
          <path d="M8 40 C22 30, 34 50, 48 38 C58 31, 64 36, 66 40" />
        </g>
      </svg>
    );
  }
  return (
    <svg className={styles.mark} viewBox="0 0 72 56" aria-hidden="true">
      <path d="M36 8 L36 18" fill="none" stroke="currentColor" strokeWidth="1.15" />
      <path d="M36 18 C28 22, 20 24, 12 22 M36 18 C44 22, 52 24, 60 22" fill="none" stroke="currentColor" strokeWidth="1.15" />
      <path d="M22 24 C18 32, 16 36, 14 44 M50 24 C54 32, 56 36, 58 44 M36 20 V46" fill="none" stroke="currentColor" strokeWidth="1.15" />
      <circle cx="36" cy="8" r="1.6" fill="currentColor" />
      <circle cx="12" cy="22" r="1.4" fill="currentColor" />
      <circle cx="60" cy="22" r="1.4" fill="currentColor" />
    </svg>
  );
}
