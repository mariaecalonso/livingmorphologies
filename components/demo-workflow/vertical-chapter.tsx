"use client";

import { Suspense, useEffect, useMemo, useRef } from "react";
import handoff from "@/data/skill3/final-selection.json";
import { ClusteringWorkspace } from "@/components/clustering/clustering-workspace";
import { JointDiagram } from "@/components/clustering/joint-diagram";
import { FinalMorphologyCatalogue, type FinalArchiveHandoff } from "@/components/final-morphology-catalogue";
import { takeCatalogHandoff, clearCatalogHandoff, catalogFlightActive, catalogFlightSettled } from "@/components/demo-workflow/catalog-inspection";
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

function FinalCatalogueBoard() {
  const board = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const node = board.current;
    if (!node || takeCatalogHandoff() !== "vertical-void") return;
    let timer = 0;
    const light = () => {
      node.dataset.handoff = "vertical-void";
      timer = window.setTimeout(() => {
        clearCatalogHandoff();
        delete node.dataset.handoff;
      }, 3600);
    };
    if (!catalogFlightActive() || catalogFlightSettled()) {
      light();
      return () => window.clearTimeout(timer);
    }
    const arrived = () => light();
    window.addEventListener("lm-catalog-arrived", arrived);
    return () => {
      window.removeEventListener("lm-catalog-arrived", arrived);
      window.clearTimeout(timer);
    };
  }, []);
  return (
    <div ref={board} className={`${styles.catalogue} wf-vert-final`}>
      <Suspense fallback={null}>
        <FinalMorphologyCatalogue fixture={false} handoff={FINAL_HANDOFF} wireframe wireBands={12} wireBright={0.58} wireLift={0.55} spread scale arriveId={takeCatalogHandoff() === "vertical-void" ? "vertical-void" : null} />
      </Suspense>
    </div>
  );
}

/** Chapter 03: the lab replay, the catalogues, then initial clustering. */
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
        details: [<FinalCatalogueBoard key="catalogue" />],
      },
      {
        layout: styles.cluster,
        details: [<ClusteringWorkspace key="clustering" tab="initial" />],
      },
      {
        layout: styles.cluster,
        details: [<JointDiagram key="joint" />],
      },
    ],
  }), []);
}
