"use client";

import { useLayoutEffect, useRef, useState } from "react";
import styles from "@/components/home-client.module.css";

const FIELD = { width: 7407, height: 2160 } as const;

/** Centers of the four circles in the background image, as fractions of that image. */
const CIRCLES = [
  { x: 6115 / FIELD.width, y: 301 / FIELD.height },
  { x: 6339 / FIELD.width, y: 754 / FIELD.height },
  { x: 6345 / FIELD.width, y: 1215 / FIELD.height },
  { x: 6193 / FIELD.width, y: 1655 / FIELD.height },
] as const;

const RING = 136;

const STUDIES = [
  {
    label: "Furniture",
    src: "/home/client/studio/furniture-main.png",
    alt: "Conceptual study of a biomorphic copper chair. Not a completed piece.",
  },
  {
    label: "Fashion",
    src: "/home/client/studio/fashion-main.png",
    alt: "Conceptual study of a ruffled garment. Not a completed piece.",
  },
  {
    label: "Bio Intelligence",
    src: "/home/client/study-lattice.jpg",
    alt: "Conceptual study of a living copper network. Not a completed piece.",
  },
] as const;

const MODES = [
  { label: "Focused", place: "n", tone: "copper" },
  { label: "Collaborative", place: "e", tone: "paper" },
  { label: "Experimental", place: "w", tone: "teal" },
  { label: "Social", place: "s", tone: "copper" },
] as const;

const PROCESS = [
  { label: "Bio Intelligence", mark: "network" },
  { label: "Computational Translation", mark: "sheet" },
  { label: "Design Realization", mark: "shell" },
] as const;

const DISCIPLINES = [
  { label: "Bio Research", tone: "teal" },
  { label: "Computation", tone: "teal" },
  { label: "Furniture", tone: "copper" },
  { label: "Fashion", tone: "copper" },
  { label: "Prototyping", tone: "copper" },
] as const;

const SPINE = [
  { title: "Bio Intelligence", mark: "network" },
  { title: "Computational Translation", mark: "sheet" },
  { title: "Interdisciplinary Design", mark: "fields" },
  { title: "Physical Prototyping", mark: "shell" },
] as const;

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
          <span>Living</span>
          <span>Morphologies</span>
          <span className={styles.studio}>Studio</span>
        </h2>
        <p className={styles.lede}>
          An interdisciplinary design and research studio exploring biological intelligence, particularly{" "}
          <em>Physarum polycephalum</em>, through computational design, furniture, fashion, and physical prototyping.
        </p>
      </header>

      <div className={styles.work}>
        <div className={styles.renders} aria-label="Conceptual studies">
          {STUDIES.map((study) => (
            <figure key={study.label} className={styles.panel}>
              <div className={styles.frame}>
                <img src={study.src} alt={study.alt} draggable={false} />
              </div>
              <figcaption>
                <StudyIcon label={study.label} />
                <span>{study.label}</span>
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
              {MODES.map((mode) => (
                <span key={mode.label} className={styles.mode} data-place={mode.place} data-tone={mode.tone}>
                  <ModeIcon label={mode.label} />
                  {mode.label}
                </span>
              ))}
            </div>
          </section>

          <section className={styles.diagram} aria-label="Design process">
            <h3>Design Process</h3>
            <ol className={styles.flow}>
              {PROCESS.map((step, index) => (
                <li key={step.label}>
                  <ProcessMark kind={step.mark} />
                  <span className={styles.flowLabel}>
                    {step.label.split(" ").map((word) => (
                      <span key={word}>{word}</span>
                    ))}
                  </span>
                  {index < PROCESS.length - 1 ? <FlowArrow /> : null}
                </li>
              ))}
            </ol>
          </section>

          <section className={styles.diagram} aria-label="Organizational structure">
            <h3>Organizational Structure</h3>
            <div className={styles.org}>
              <div className={styles.orgLead}>
                <span className={styles.node} data-tone="teal">
                  Studio Leadership
                </span>
              </div>
              <svg className={styles.orgBranches} viewBox="0 0 500 28" preserveAspectRatio="none" aria-hidden="true">
                <path d="M142 0 V8 H50 V28 M142 8 H150 V28 M142 8 H250 V28 M142 8 H350 V28 M142 8 H450 V28" />
              </svg>
              <div className={styles.orgDisciplines}>
                {DISCIPLINES.map((node) => (
                  <span key={node.label} className={styles.node} data-tone={node.tone}>
                    {node.label}
                  </span>
                ))}
              </div>
              <p className={styles.orgNotes}>
                <span>Shared research</span>
                <span>Interdisciplinary development</span>
              </p>
            </div>
          </section>
        </div>
      </div>

      {anchors ? (
        <ol className={styles.spine}>
          {SPINE.map((stage, index) => {
            const anchor = anchors[index];
            const fieldWidth = fieldRef.current?.clientWidth ?? 0;
            const shift = Math.round(anchor.r + 12);
            const room = Math.max(88, Math.floor(fieldWidth - anchor.x * fieldWidth - shift - 12));
            return (
              <li
                key={stage.title}
                className={styles.pin}
                data-tone={index === 0 ? "teal" : index === SPINE.length - 1 ? "copper" : "paper"}
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
                  <CircleGlyph kind={stage.mark} />
                </span>
                <div className={styles.stage} style={{ transform: `translate(${shift}px, -50%)`, width: `${room}px` }}>
                  <p>{stage.title}</p>
                </div>
              </li>
            );
          })}
        </ol>
      ) : null}
    </div>
  );
}

function StudyIcon({ label }: { label: (typeof STUDIES)[number]["label"] }) {
  if (label === "Furniture") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M6 15.5 V9.2 C6 7.4 7.6 6 9.4 6 H14.6 C16.4 6 18 7.4 18 9.2 V15.5" />
        <path d="M4.5 14.5 H19.5 V16.2 C19.5 17.2 18.7 18 17.7 18 H6.3 C5.3 18 4.5 17.2 4.5 16.2 Z" />
        <path d="M7.5 18 V20 M16.5 18 V20" />
      </svg>
    );
  }
  if (label === "Fashion") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M9 4.5 L12 7.2 L15 4.5 L18 8.2 L15.2 9.4 V19.5 H8.8 V9.4 L6 8.2 Z" />
        <path d="M10.2 4.8 C10.6 5.8 11.2 6.4 12 6.4 C12.8 6.4 13.4 5.8 13.8 4.8" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="1.5" />
      <path d="M12 3.8 V7.6 M12 16.4 V20.2 M3.8 12 H7.6 M16.4 12 H20.2" />
      <path d="M6.2 6.2 L8.8 8.8 M15.2 15.2 L17.8 17.8 M17.8 6.2 L15.2 8.8 M8.8 15.2 L6.2 17.8" />
    </svg>
  );
}

function ModeIcon({ label }: { label: (typeof MODES)[number]["label"] }) {
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

function CircleGlyph({ kind }: { kind: (typeof SPINE)[number]["mark"] }) {
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

function ProcessMark({ kind }: { kind: (typeof PROCESS)[number]["mark"] }) {
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
