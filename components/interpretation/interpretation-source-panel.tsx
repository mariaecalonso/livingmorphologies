"use client";

import { useEffect, useState } from "react";
import { LabContractPanel } from "@/components/pipeline/lab-contract-panel";
import type { ResolvedInterpretation } from "@/lib/skill5/downstream-pipeline";
import { loadPipeline, statusLabel, subscribePipeline } from "@/components/pipeline/pipeline-client";
import styles from "./interpretation-lab.module.css";

export function InterpretationSourcePanel() {
  const [source, setSource] = useState<ResolvedInterpretation | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    const load = () => {
      void loadPipeline().then((body) => {
        if (!live) return;
        setSource(body.interpretation);
        setError(null);
      }).catch((reason: unknown) => {
        if (live) setError(reason instanceof Error ? reason.message : "The development checkpoint could not be read.");
      });
    };
    load();
    return subscribePipeline(load);
  }, []);

  const geometryStatus = source?.geometryStatus ?? "no-source";
  const occupancyCount = source?.occupancyCount ?? 0;

  return (
    <section
      className={styles.source}
      data-production-assembly={source?.sourceAssemblyId ?? ""}
      data-source-revision={source?.sourceAssemblyRevision ?? ""}
      data-source-network={source?.sourceNetworkId ?? ""}
      data-zoning-signature={source?.sourceZoningSignature ?? ""}
      data-occupancy-ids={(source?.sourceOccupancyIds ?? []).join(",")}
      data-occupancy-count={String(occupancyCount)}
      data-source-ready={source?.sourceReady ? "true" : "false"}
      data-interpretation-status={source?.status ?? "no-source"}
      data-geometry-status={geometryStatus}
      data-interpretation-revision={source?.interpretationRevisionId ?? ""}
      data-output-geometry-ref={source?.outputGeometryRef ?? ""}
      data-production-implementation="selected-assembly-reading"
      data-legacy-implementation="skill6-assembled"
      data-legacy-matches-source="false"
    >
      <h2>Production source</h2>
      <p className={styles.note}>
        Selected Assembly for Development {source?.sourceAssemblyId ?? "none"} · {statusLabel(geometryStatus)}.
        {source?.sourceAssemblyRevision ? ` Revision ${source.sourceAssemblyRevision.split("|")[0]}.` : ""}
        {source?.sourceNetworkId ? ` Network ${source.sourceNetworkId}.` : ""}
        {occupancyCount ? ` ${occupancyCount} occupied zone${occupancyCount === 1 ? "" : "s"}.` : " No occupied zones."}
      </p>
      <p className={styles.note}>
        Geometry {statusLabel(geometryStatus)}. Current Integrated Architectural Model is not generated.
        Skill 6 carving remains unused.
      </p>
      <LabContractPanel
        labId="interpretation"
        variant="interpretation"
        liveStatus={statusLabel(geometryStatus)}
        outputFulfilled={geometryStatus === "complete" && Boolean(source?.outputGeometryRef)}
      />
      {error ? <p className={styles.note}>{error}</p> : null}
    </section>
  );
}
