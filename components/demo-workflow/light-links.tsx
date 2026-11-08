"use client";

import { useEffect, useState, type CSSProperties, type RefObject } from "react";
import styles from "@/components/demo-workflow/demo-workflow.module.css";

/** Where the travelling light is: the current operation (null before it starts) and the furthest one it has passed. */
export type Light = { operation: number | null; reached: number };

type Point = { x: number; y: number };
type Box = { l: number; t: number; r: number; b: number };
/** A linked item: its box, and the point its lit element grows from. */
type Item = { box: Box; origin: Point };
/** Items in the container's coordinates, and how much the current one grows (`--grow`). */
export type Layout = { width: number; height: number; grow: number; items: Item[] };

/** Share of each operation's time the light spends crossing the connector into the next one. */
const TRAVEL = 0.4;

export function lightState({ operation, reached }: Light, index: number) {
  if (operation === index) return "current";
  return index <= reached ? "reached" : "ahead";
}

/** An element's box in `node`'s coordinates, through any positioned ancestors in between. Transforms are ignored. */
function boxIn(item: HTMLElement, node: HTMLElement): Box {
  let l = 0;
  let t = 0;
  for (let at: Element | null = item; at instanceof HTMLElement && at !== node; at = at.offsetParent) {
    l += at.offsetLeft;
    t += at.offsetTop;
  }
  return { l, t, r: l + item.offsetWidth, b: t + item.offsetHeight };
}

/** The item's lit element (it carries `data-light`) grows about its transform origin. */
function measure(item: HTMLElement, node: HTMLElement): Item {
  const lit = item.closest<HTMLElement>("[data-light]") ?? item;
  const at = boxIn(lit, node);
  const [x = 0, y = 0] = getComputedStyle(lit).transformOrigin.split(" ").map(Number.parseFloat);
  return { box: boxIn(item, node), origin: { x: at.l + x, y: at.t + y } };
}

/** Measures the linked items in `ref`, in order. `pick` must be stable. */
export function useLinks(ref: RefObject<HTMLElement | null>, pick: (node: HTMLElement) => HTMLElement[]) {
  const [layout, setLayout] = useState<Layout | null>(null);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const update = () => {
      const grow = Number.parseFloat(getComputedStyle(node).getPropertyValue("--grow")) || 1;
      setLayout({ width: node.clientWidth, height: node.clientHeight, grow, items: pick(node).map((item) => measure(item, node)) });
    };
    const resize = new ResizeObserver(update);
    resize.observe(node);
    return () => resize.disconnect();
  }, [ref, pick]);
  return layout;
}

function grown(point: Point, item: Item, grow: number): Point {
  return { x: item.origin.x + (point.x - item.origin.x) * grow, y: item.origin.y + (point.y - item.origin.y) * grow };
}

/**
 * The link from one item to the next, drawn through the gap between them.
 * An end on the current item moves with its growth; the other end slides along its own edge so the link stays straight.
 */
function connect(from: Item, to: Item, current: { from: boolean; to: boolean }, grow: number) {
  const a = from.box;
  const b = to.box;
  if (b.l >= a.r - 1) {
    const y = (Math.max(a.t, b.t) + Math.min(a.b, b.b)) / 2;
    const start = current.from ? grown({ x: a.r, y }, from, grow) : { x: a.r, y };
    const end = current.to ? grown({ x: b.l, y }, to, grow) : { x: b.l, y };
    const level = current.from ? start.y : current.to ? end.y : y;
    return { start: { x: start.x, y: level }, end: { x: end.x, y: level } };
  }
  const x = (Math.max(a.l, b.l) + Math.min(a.r, b.r)) / 2;
  const start = current.from ? grown({ x, y: a.b }, from, grow) : { x, y: a.b };
  const end = current.to ? grown({ x, y: b.t }, to, grow) : { x, y: b.t };
  const level = current.from ? start.x : current.to ? end.x : x;
  return { start: { x: level, y: start.y }, end: { x: level, y: end.y } };
}

/**
 * Each connector fills as the light crosses it, driven by `--demo-progress`, so it follows Pause, Restart, and selection.
 * The light rests at the end of the last connector it crossed until the next crossing begins.
 * Ends ease with the current item's growth.
 */
export function LightLinks({ layout, light, count }: { layout: Layout | null; light: Light; count: number }) {
  if (!layout) return null;
  return (
    <svg
      className={styles.detailLinks}
      viewBox={`0 0 ${layout.width} ${layout.height}`}
      style={{ "--n": count, "--travel": TRAVEL } as CSSProperties}
      aria-hidden="true"
    >
      {layout.items.slice(1).map((to, index) => {
        const { start, end } = connect(layout.items[index], to, { from: light.operation === index, to: light.operation === index + 1 }, layout.grow);
        const d = `M ${start.x} ${start.y} L ${end.x} ${end.y}`;
        const line = { d: `path("${d}")` } as CSSProperties;
        return (
          <g
            key={index}
            data-lit={index < light.reached || undefined}
            style={{ "--i": index, "--ax": start.x, "--ay": start.y, "--bx": end.x, "--by": end.y } as CSSProperties}
          >
            <path d={d} style={line} />
            <path className={styles.linkTrail} d={d} style={line} pathLength={1} />
            <circle className={styles.junction} data-end="start" r={2.5} />
            <circle className={styles.junction} data-end="end" r={2.5} />
            {light.operation != null ? <circle className={styles.detailDot} r={4.5} /> : null}
          </g>
        );
      })}
    </svg>
  );
}
