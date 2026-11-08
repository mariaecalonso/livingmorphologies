"use client";

import { useEffect, useState } from "react";
import { Img } from "@/components/demo-workflow/chapter-kit";
import styles from "@/components/demo-workflow/presentation-reel.module.css";

export type ReelBeat = { src?: string; caption: string; zoom?: boolean };

/**
 * A presentation-native replay. It steps through verified stills with its own pause and replay.
 * Closing it returns to the chapter. It does not write to the Lab.
 */
export function PresentationReel({
  beats,
  note,
}: {
  beats: readonly ReelBeat[];
  note: string;
}) {
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(true);
  const beat = beats[index] ?? beats[0];
  useEffect(() => {
    if (!playing || beats.length < 2) return;
    const timer = window.setInterval(() => setIndex((current) => (current + 1) % beats.length), 1700);
    return () => window.clearInterval(timer);
  }, [playing, beats.length]);
  if (!beat) return null;
  return (
    <div className={styles.reel}>
      <div className={styles.stage}>
        {beat.src ? (
          <div className={styles.frame} data-zoom={beat.zoom || undefined}>
            <Img className={styles.still} src={beat.src} alt="" />
          </div>
        ) : (
          <p className={styles.empty}>{beat.caption}</p>
        )}
        <p className={styles.caption}>{beat.caption}</p>
      </div>
      <div className={styles.bar}>
        <p>{note}</p>
        <button type="button" onClick={() => setPlaying((value) => !value)}>{playing ? "Pause" : "Play"}</button>
        <button type="button" onClick={() => { setIndex(0); setPlaying(true); }}>Replay</button>
        <button type="button" onClick={() => window.dispatchEvent(new Event("demo-feature-close"))}>Back</button>
      </div>
    </div>
  );
}
