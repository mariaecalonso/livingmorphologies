"use client";

import { Suspense, useMemo } from "react";
import handoff from "@/data/skill3/final-selection.json";
import { FinalMorphologyCatalogue, type FinalArchiveHandoff } from "@/components/final-morphology-catalogue";
import { CatalogDemonstration, ProcessDemonstration } from "@/components/demo-workflow/vertical-demonstration";
import type { ChapterContent } from "@/components/demo-workflow/demo-chapter";
import "@/components/final-catalogue-frame.css";
import "@/components/demo-workflow/vertical-lab-embed.css";
import styles from "@/components/demo-workflow/vertical-chapter.module.css";

const FINAL_HANDOFF: FinalArchiveHandoff[] = handoff.selections.map((entry) => ({
  archetypeId: entry.archetypeId,
  candidateId: entry.candidateId,
  continuationId: entry.continuationId,
  moduleId: entry.moduleId,
  status: entry.status === "Validated" ? "validated" : "review",
}));

/** Chapter 03: the lab replay, then the 24-model catalogue, then the final catalogue. */
export function useVerticalContent(): ChapterContent {
  return useMemo(() => ({
    visuals: [],
    details: [],
    boards: [
      {
        layout: styles.process,
        details: [<ProcessDemonstration key="process" />],
      },
      {
        layout: styles.catalog,
        details: [<CatalogDemonstration key="catalog" />],
      },
      {
        layout: styles.final,
        details: [
          <div key="catalogue" className={`${styles.catalogue} wf-vert-final`}>
            <Suspense fallback={null}>
              <FinalMorphologyCatalogue fixture={false} handoff={FINAL_HANDOFF} wireframe wireBright={1.15} wireLift={0.73} spread />
            </Suspense>
          </div>,
        ],
      },
    ],
  }), []);
}
