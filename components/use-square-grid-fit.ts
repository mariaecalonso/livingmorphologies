"use client";

import { useEffect, useState, type RefObject } from "react";

export type SquareGridFit = { columns: number; rows: number; size: number };

/** Largest page of square cards (plus caption) that fits the element without scrolling. */
export function useSquareGridFit(
  ref: RefObject<HTMLElement | null>,
  { minimum, caption, gap, enabled = true }: { minimum: number; caption: number; gap: number; enabled?: boolean },
): SquareGridFit {
  const [fit, setFit] = useState<SquareGridFit>({ columns: 6, rows: 4, size: 140 });

  useEffect(() => {
    const node = ref.current;
    if (!enabled || !node) return;
    const measure = () => {
      const { width, height } = node.getBoundingClientRect();
      const columns = Math.max(1, Math.floor((width + gap) / (minimum + gap)));
      const rows = Math.max(1, Math.floor((height + gap) / (minimum + caption + gap)));
      const size = Math.floor(
        Math.min((width - gap * (columns - 1)) / columns, (height - gap * (rows - 1)) / rows - caption),
      );
      setFit({ columns, rows, size: Math.max(40, size) });
    };
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [ref, minimum, caption, gap, enabled]);

  return fit;
}
