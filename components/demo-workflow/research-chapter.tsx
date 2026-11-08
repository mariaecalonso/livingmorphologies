"use client";

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { BRANCHES, TYPOLOGIES, findArchetype, findTypology, groupsForArchetype } from "@/lib/catalog";
import { ratingLabel } from "@/lib/physarum";
import { FILTERED_INTERESTS, GENERATIVE_SYSTEMS, PHYSARUM, PRECEDENT, archetypePlate } from "@/lib/demo-workflow/chapter-facts";
import { OVERVIEW_FACTS } from "@/lib/demo-workflow/overview";
import { Caption, Chips, Img, Kicker } from "@/components/demo-workflow/chapter-kit";
import type { ChapterContent } from "@/components/demo-workflow/demo-chapter";
import styles from "@/components/demo-workflow/research-chapter.module.css";

const VOID = findArchetype(findTypology("lobby"), "vertical-void");
const VOID_GROUPS = groupsForArchetype("lobby", VOID, VOID.ratings);
const VOID_TONE = { formal: "copper", spatial: "white", atmospheric: "teal" } as const;

/** Shared criteria, then the one criterion that belongs to the typology. No rating dots. */
function CriteriaExtract() {
  return (
    <div className={styles.extract}>
      {BRANCHES.map((branch) => (
        <div key={branch.id} className={styles.extractGroup} data-branch={branch.id}>
          <p>{branch.title}</p>
          <ul>
            {branch.shared.map((item) => (
              <li key={item.id}>{item.label}</li>
            ))}
            <li data-specific="">
              {branch.specific.lobby.label} · {branch.specific.workspace.label} · {branch.specific.gathering.label}
            </li>
          </ul>
        </div>
      ))}
      <p className={styles.extractNote}>Two criteria are shared in each group. The third changes with the typology. Each group names one descriptor.</p>
    </div>
  );
}

const START_MS = 6000;
const AIM_MS = 900;
const DRAG_MS = 1500;
const HOLD_MS = 1800;

/** Vertical Void ratings. A cursor sets each group's three ratings, then that descriptor appears. */
function CriteriaMeters() {
  const root = useRef<HTMLDivElement>(null);
  const cursor = useRef<HTMLSpanElement>(null);
  const [active, setActive] = useState(false);
  const [started, setStarted] = useState(false);
  const [index, setIndex] = useState(0);
  const [drag, setDrag] = useState(0);
  const [moving, setMoving] = useState(true);
  const count = VOID_GROUPS.reduce((sum, group) => sum + group.criteria.length, 0);

  useEffect(() => {
    const article = root.current?.closest("article");
    if (!article) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const sync = () => {
      const focused = article.getAttribute("data-phase") === "focused";
      setActive(focused && !reduced);
      if (!focused || reduced) {
        setIndex(reduced ? count : 0);
        setDrag(reduced ? 1 : 0);
        setMoving(true);
      }
    };
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(article, { attributes: true, attributeFilter: ["data-phase"] });
    return () => observer.disconnect();
  }, [count]);

  useEffect(() => {
    if (!active) {
      setStarted(false);
      return;
    }
    const wait = window.setTimeout(() => setStarted(true), START_MS);
    return () => window.clearTimeout(wait);
  }, [active]);

  useEffect(() => {
    if (!active || !started) return;
    if (index >= count) {
      const hold = window.setTimeout(() => {
        setIndex(0);
        setDrag(0);
        setMoving(true);
      }, HOLD_MS);
      return () => window.clearTimeout(hold);
    }
    if (moving) {
      const aim = window.setTimeout(() => {
        setMoving(false);
        setDrag(0);
      }, AIM_MS);
      return () => window.clearTimeout(aim);
    }
    const began = performance.now();
    let frame = 0;
    const step = (now: number) => {
      const next = Math.min(1, (now - began) / DRAG_MS);
      setDrag(next);
      if (next < 1) frame = requestAnimationFrame(step);
      else {
        setIndex((value) => value + 1);
        setDrag(0);
        setMoving(true);
      }
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [active, started, count, index, moving]);

  useLayoutEffect(() => {
    const node = cursor.current;
    const frame = root.current;
    if (!node || !frame) return;
    node.dataset.hidden = active && started && index < count ? "false" : "true";
    const row = frame.querySelector<HTMLElement>(`[data-aim="m${index}"]`);
    const track = row?.querySelector("i");
    if (!row || !track) return;
    const box = frame.getBoundingClientRect();
    const scale = box.width / frame.offsetWidth || 1;
    const rect = track.getBoundingClientRect();
    const share = Number.parseFloat(getComputedStyle(row).getPropertyValue("--share")) / 100;
    const along = Math.max(0, Math.min(1, Number.isFinite(share) ? share : 0));
    node.style.transitionDuration = moving ? "" : "0ms";
    node.style.transform = `translate(${(rect.left - box.left + rect.width * along) / scale}px, ${(rect.top - box.top + rect.height * 0.5) / scale}px)`;
  }, [active, started, count, drag, index, moving]);

  let cursorAt = 0;
  return (
    <div ref={root} className={styles.meters} aria-label="Vertical Void criteria and descriptors">
      {VOID_GROUPS.map((group, groupIndex) => {
        const groupDone = index > groupIndex * group.criteria.length + group.criteria.length - 1;
        return (
          <section key={group.id} data-tone={VOID_TONE[group.id]}>
            <p>{group.title}</p>
            <span>{group.subtitle}</span>
            <ul>
              {group.criteria.map((criterion) => {
                const at = cursorAt;
                cursorAt += 1;
                const progress = at < index ? 1 : at > index || moving ? 0 : drag;
                const share = (criterion.rating / 2) * progress * 100;
                const label = progress > 0 ? ratingLabel(Math.round(criterion.rating * progress) as 0 | 1 | 2) : "";
                return (
                  <li key={criterion.id} data-aim={`m${at}`} data-hot={at === index && active && started ? "" : undefined} style={{ "--share": `${share}%` } as CSSProperties}>
                    <span>{criterion.label}</span>
                    <em>{label}</em>
                    <i aria-hidden="true"><b /></i>
                  </li>
                );
              })}
            </ul>
            <p className={styles.meterScale}><span>Low</span><span>Medium</span><span>High</span></p>
            <strong data-shown={groupDone ? "" : undefined}>{group.descriptor}</strong>
          </section>
        );
      })}
      <span ref={cursor} className={styles.meterCursor} aria-hidden="true">
        <svg viewBox="0 0 18 22">
          <path d="M1 1v17l4.6-4.2 3.2 7 3-1.4-3.2-6.8 6.4-.2z" />
        </svg>
      </span>
    </div>
  );
}

function TypologyRows({ named }: { named?: boolean }) {
  return (
    <div className={styles.typologies} data-named={named || undefined}>
      {TYPOLOGIES.map((typology) => (
        <div key={typology.id} className={styles.typology} data-typology={typology.id}>
          <Kicker className={styles.typologyName}>{typology.label}</Kicker>
          <div className={styles.archetypes}>
            {typology.archetypes.map((archetype) => (
              <figure key={archetype.id}>
                <Img className={styles.archetype} src={archetypePlate(archetype.id)} />
                {named ? <figcaption>{archetype.name}</figcaption> : null}
              </figure>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function Systems({ traits }: { traits?: boolean }) {
  return (
    <div className={styles.systems} data-traits={traits || undefined}>
      {GENERATIVE_SYSTEMS.map((system) => (
        <figure key={system.id} className={styles.system} data-selected={("selected" in system && system.selected) || undefined}>
          <Img className={styles.systemPlate} src={system.src} />
          <figcaption>
            <span className={styles.systemName}>{system.name}</span>
            {traits ? (
              <span className={styles.traits}>
                {system.traits.map((trait) => (
                  <span key={trait}>{trait}</span>
                ))}
              </span>
            ) : null}
          </figcaption>
        </figure>
      ))}
    </div>
  );
}

const reading = PRECEDENT.reading.join(" — ");
const { archetypes, criteria, descriptors } = OVERVIEW_FACTS;

/** Chapter 01: from one precedent to the organism the generative system is built on. */
export const RESEARCH_CONTENT: ChapterContent = {
  visuals: [
    {
      full: (
        <div className={styles.precedent}>
          <div className={styles.photos}>
            {PRECEDENT.photos.map((src) => (
              <Img key={src} className={styles.photo} src={src} />
            ))}
          </div>
          <Img className={styles.axon} src={PRECEDENT.axon} />
          <Caption>
            <b>{PRECEDENT.name}</b> · {reading}
          </Caption>
        </div>
      ),
    },
    {
      full: (
        <div className={styles.stack}>
          <TypologyRows />
          <Caption>
            <b>3</b> typologies · <b>{archetypes}</b> archetypes
          </Caption>
        </div>
      ),
    },
    {
      full: (
        <div className={styles.stack}>
          <CriteriaExtract />
          <Caption>
            <b>{criteria}</b> criteria · <b>{descriptors}</b> descriptors per archetype
          </Caption>
        </div>
      ),
    },
    {
      full: (
        <div className={styles.stack}>
          <Systems />
          <Caption>Three systems compared · Stigmergy carried forward</Caption>
        </div>
      ),
    },
    {
      full: (
        <div className={styles.physarum}>
          <Img className={styles.organism} src={PHYSARUM.src} />
          <Chips items={PHYSARUM.behavior} />
        </div>
      ),
    },
  ],
  details: [
    <div key="precedent" className={styles.column}>
      <div className={styles.photos}>
        {PRECEDENT.photos.map((src) => (
          <Img key={src} className={styles.photo} src={src} />
        ))}
      </div>
      <Img className={styles.axon} src={PRECEDENT.axon} />
      <div className={styles.graphs}>
        <Img className={styles.photo} src={PRECEDENT.traces} />
        <Img className={styles.photo} src={PRECEDENT.mesh} />
      </div>
      <Kicker>{reading}</Kicker>
    </div>,
    <div key="typology" className={styles.column}>
      <TypologyRows named />
    </div>,
    <div key="criteria" className={styles.column}>
      <CriteriaMeters />
    </div>,
    <div key="systems" className={styles.column}>
      <Systems traits />
      <Kicker>Filtered interests</Kicker>
      <Chips items={FILTERED_INTERESTS} />
    </div>,
    <div key="physarum" className={styles.column}>
      <Img className={styles.organismDetail} src="/assets/skill0/physarum-growth.gif" />
      <Caption align="start">Project growth recording. It is not a separate documentary film.</Caption>
      <Chips items={PHYSARUM.strengths} tone="teal" />
      <ol className={styles.behavior}>
        {PHYSARUM.behavior.map((step, index) => (
          <li key={step}>
            <span>{String(index + 1).padStart(2, "0")}</span>
            {step}
          </li>
        ))}
      </ol>
      <p className={styles.question}>{PHYSARUM.question}</p>
    </div>,
  ],
  layout: styles.composed,
};
