"use client";

import { useLayoutEffect, useRef, useState } from "react";
import styles from "@/components/demo-workflow/physarum-video-page.module.css";

/** The Lab presentation sheet. The video fills the stage beneath its 135px bar. */
const SHEET_W = 7407;
const SHEET_H = 2160;
const NAV_H = 135;
const STAGE_H = SHEET_H - NAV_H;

/**
 * The Lab video, at its own sheet size, scaled as one piece into the Workflow page.
 * Type, frames, and spacing stay in the proportion they have in the Lab.
 */
export function PhysarumVideoPage() {
  const host = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState({ scale: 1, left: 0, top: -NAV_H });

  useLayoutEffect(() => {
    const node = host.current;
    if (!node) return;
    const measure = () => {
      const scale = Math.min(node.clientWidth / SHEET_W, node.clientHeight / STAGE_H);
      const width = SHEET_W * scale;
      setFit({
        scale,
        left: (node.clientWidth - width) / 2,
        top: -NAV_H * scale - 1,
      });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={host} className={styles.host}>
      <iframe
        className={styles.sheet}
        title="Physarum video"
        src="/lab/physarum-video?wall=1&frame=1&embed=1"
        style={{ transform: `translate(${fit.left}px, ${fit.top}px) scale(${fit.scale})` }}
      />
    </div>
  );
}
