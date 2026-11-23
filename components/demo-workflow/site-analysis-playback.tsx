"use client";

import { useEffect, useRef, useState } from "react";
import { SiteAnalysisWorkspace } from "@/components/site/site-analysis-workspace";
import styles from "@/components/demo-workflow/context-chapter.module.css";

type Beat = {
  selector: string;
  text?: string;
  click?: boolean;
  optional?: boolean;
  wait?: number;
  ms: number;
};

/** The lab's own controls, in the order a demonstration would use them. */
const BEATS: Beat[] = [
  { selector: "#analysis-tab-sun-shadows", ms: 600 },
  { selector: '[aria-label="Season"] button', text: "Summer", click: true, ms: 1600 },
  { selector: '[aria-label="Season"] button', text: "Winter", click: true, ms: 1800 },
  { selector: "#analysis-tab-wind", click: true, ms: 1300 },
  { selector: '[aria-label="Season"] button', text: "Winter", click: true, ms: 1800 },
  { selector: "#analysis-tab-views-noise", click: true, ms: 1400 },
  { selector: 'button[aria-label^="Open photograph"]', click: true, optional: true, wait: 5000, ms: 2000 },
  { selector: 'button[aria-label^="Open photograph"]', click: true, optional: true, ms: 700 },
  { selector: "#analysis-tab-pedestrian-baywalk", click: true, ms: 1100 },
  { selector: '[aria-label="Mode"] button', text: "Circulation", click: true, ms: 2200 },
];

function find(root: ParentNode, beat: Beat) {
  const nodes = [...root.querySelectorAll<HTMLElement>(beat.selector)];
  if (!beat.text) return nodes[0] ?? null;
  return nodes.find((node) => node.textContent?.includes(beat.text ?? "")) ?? null;
}

function point(root: HTMLElement, target: HTMLElement) {
  const box = root.getBoundingClientRect();
  const scale = box.width / root.offsetWidth || 1;
  const rect = target.getBoundingClientRect();
  return {
    x: (rect.left - box.left + rect.width * 0.72) / scale,
    y: (rect.top - box.top + rect.height * 0.62) / scale,
  };
}

/** Drives the live Site Analysis lab with the chapter cursor. The lab's controls and records stay the source. */
export function SiteAnalysisPlayback() {
  const root = useRef<HTMLDivElement>(null);
  const [cursor, setCursor] = useState({ x: 36, y: 36, hidden: true });

  useEffect(() => {
    const host = root.current;
    if (!host) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let cancel = false;
    const sleep = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));
    const run = async () => {
      const started = performance.now();
      while (!cancel && performance.now() - started < 8000) {
        const date = host.querySelector(".site-representative-date");
        if (date && date.textContent && date.textContent !== "Date") break;
        await sleep(120);
      }
      setCursor((place) => ({ ...place, hidden: false }));
      for (const beat of BEATS) {
        if (cancel) return;
        let target = find(host, beat);
        if (!target && beat.optional) {
          const until = performance.now() + (beat.wait ?? 1600);
          while (!cancel && !target && performance.now() < until) {
            await sleep(150);
            target = find(host, beat);
          }
        }
        if (!target) continue;
        const next = point(host, target);
        setCursor({ ...next, hidden: false });
        if (!reduce) await sleep(680);
        if (cancel) return;
        if (beat.click) target.click();
        if (!reduce) await sleep(beat.ms);
      }
    };
    void run();
    return () => {
      cancel = true;
    };
  }, []);

  return (
    <div ref={root} className={styles.host} data-part="analysis">
      <SiteAnalysisWorkspace />
      <span className={styles.cursor} data-hidden={cursor.hidden ? "true" : "false"} aria-hidden="true" style={{ transform: `translate(${cursor.x}px, ${cursor.y}px)` }}>
        <svg viewBox="0 0 18 22">
          <path d="M1 1v17l4.6-4.2 3.2 7 3-1.4-3.2-6.8 6.4-.2z" />
        </svg>
      </span>
    </div>
  );
}
