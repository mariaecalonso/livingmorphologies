"use client";

import { useEffect, useState, type RefObject } from "react";

export type SquareGridFit = { columns: number; rows: number; size: number };

/** Largest page of square cards (plus caption) that fits the element without scrolling. */
export function useSquareGridFit(
  ref: RefObject<HTMLElement | null>,
  {
    minimum,
    caption,
    gap,
    rows: fixedRows,
    count = 0,
    enabled = true,
  }: { minimum: number; caption: number; gap: number; rows?: number; count?: number; enabled?: boolean },
): SquareGridFit {
  const [fit, setFit] = useState<SquareGridFit>({ columns: 6, rows: fixedRows ?? 4, size: 140 });

  useEffect(() => {
    const node = ref.current;
    if (!enabled || !node) return;
    const measure = () => {
      const { width, height } = node.getBoundingClientRect();
      if (width < 40 || height < 40) return;
      if (fixedRows) {
        const rows = fixedRows;
        const rowHeight = Math.max(40, Math.floor((height - gap * (rows - 1)) / rows));
        const minCard = Math.max(40, minimum);
        const maxColumns = Math.max(1, Math.floor((width + gap) / (minCard + gap)));
        const columns =
          count > 0
            ? Math.min(maxColumns, Math.max(1, Math.ceil(count / rows)))
            : Math.max(1, Math.floor((width + gap) / (rowHeight + gap)));
        const fitted = Math.floor((width - gap * (columns - 1)) / columns);
        setFit({ columns, rows, size: Math.max(40, Math.min(fitted, rowHeight)) });
        return;
      }
      const columns = Math.max(1, Math.floor((width + gap) / (minimum + gap)));
      const rows = Math.max(1, Math.floor((height + gap) / (minimum + caption + gap)));
      const size = Math.floor(
        Math.min((width - gap * (columns - 1)) / columns, (height - gap * (rows - 1)) / rows - caption),
      );
      setFit({ columns, rows, size: Math.max(40, size) });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    const frame = requestAnimationFrame(measure);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [ref, minimum, caption, gap, fixedRows, count, enabled]);

  return fit;
}
