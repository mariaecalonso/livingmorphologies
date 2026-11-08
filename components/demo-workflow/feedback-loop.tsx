"use client";

import { useId, type CSSProperties } from "react";
import type { Layout, Light } from "@/components/demo-workflow/light-links";
import styles from "@/components/demo-workflow/demo-workflow.module.css";

/** A path that returns from a later operation to earlier ones, drawn under the sequence. `labels` sit along it, from its start. */
export type Loop = { from: number; to: readonly number[]; labels: readonly string[] };

/** Clearance between the container's foot (`after`) or the items' foot (`inside`, past the current item's growth) and the loop. */
const DROP = { after: 14, inside: 22 } as const;
const TICK = 4;

/**
 * `after` runs the loop beneath the container, under the operation labels; `inside` runs it in the space the layout leaves
 * below its items. The loop lights once the light has reached its start.
 */
export function FeedbackLoop({ layout, loop, light, place }: { layout: Layout | null; loop: Loop; light: Light; place: "after" | "inside" }) {
  const marker = useId();
  if (!layout) return null;
  const from = layout.items[loop.from];
  const targets = loop.to.map((index) => layout.items[index]).filter((item) => item != null);
  if (!from || targets.length === 0) return null;
  const centre = (index: number) => {
    const { box } = layout.items[index];
    return (box.l + box.r) / 2;
  };
  const foot = Math.max(...layout.items.map((item) => item.box.b));
  const y = (place === "after" ? layout.height : foot) + DROP[place];
  const rise = (index: number) => (place === "after" ? layout.height + TICK : layout.items[index].box.b + TICK);
  const start = centre(loop.from);
  const ends = loop.to.map(centre);
  const far = Math.min(...ends);
  const run = `M ${start} ${rise(loop.from)} V ${y} H ${far}`;
  const returns = loop.to.map((index) => `M ${centre(index)} ${y} V ${rise(index) + 3}`);
  const span = start - far;
  return (
    <div className={styles.loop} data-lit={light.reached >= loop.from || undefined} aria-hidden="true">
      <svg viewBox={`0 0 ${layout.width} ${layout.height}`}>
        <defs>
          <marker id={marker} viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto">
            <path d="M0 0L8 4L0 8" />
          </marker>
        </defs>
        <path d={run} />
        {returns.map((d) => (
          <path key={d} d={d} markerEnd={`url(#${marker})`} />
        ))}
      </svg>
      {loop.labels.map((label, index) => (
        <span
          key={label}
          className={styles.loopLabel}
          style={{ left: `${start - (span * (index + 0.5)) / loop.labels.length}px`, top: `${y}px` } as CSSProperties}
        >
          {label}
        </span>
      ))}
    </div>
  );
}
