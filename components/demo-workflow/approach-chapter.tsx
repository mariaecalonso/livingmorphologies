"use client";

import { PendingFrame } from "@/components/clustering/clustering-workspace";
import type { ChapterContent } from "@/components/demo-workflow/demo-chapter";
import styles from "@/components/demo-workflow/approach-chapter.module.css";

/** Chapter 07. The frames name the work. No massing, section, or render is stored. */
export const APPROACH_CONTENT: ChapterContent = {
  visuals: [],
  details: [],
  boards: [
    {
      layout: styles.sheet,
      details: [
        <PendingFrame
          key="massing"
          frame
          kicker="Chapter 07"
          title="Massing"
          body="The connected clusters are refined as one massing. No massing is drawn yet."
        />,
      ],
    },
    {
      layout: styles.sheet,
      details: [
        <PendingFrame
          key="sections"
          frame
          kicker="Chapter 07"
          title="Sections and Plans"
          body="Sections and plans are clipping planes through that massing. None are drawn yet."
        />,
      ],
    },
    {
      layout: styles.sheet,
      details: [
        <PendingFrame
          key="renders"
          frame
          kicker="Chapter 07"
          title="Renders"
          body="No renders are stored."
        />,
      ],
    },
  ],
};
