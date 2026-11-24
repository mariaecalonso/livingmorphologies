"use client";

import { useEffect, useState } from "react";
import "@/app/lab/site/site-interface.css";
import type { ResolvedPipeline } from "@/lib/skill5/downstream-pipeline";
import { LabContractPanel } from "./lab-contract-panel";
import { loadPipeline, statusLabel, subscribePipeline } from "./pipeline-client";

type Stage = "enclosure" | "slicing" | "drawing" | "rendering";

function Row({ label, value }: { label: string; value: string }) {
  return (
    <p className="site-stat">
      <span>{label}</span>
      <strong>{value || "—"}</strong>
    </p>
  );
}

function liveStatusFor(stage: Stage, pipeline: ResolvedPipeline | null) {
  if (!pipeline) return "No source";
  if (stage === "enclosure") {
    if (!pipeline.enclosure.validInput) return "No valid Current Integrated Architectural Model";
    return statusLabel(pipeline.enclosure.status);
  }
  if (stage === "slicing") return statusLabel(pipeline.finalEnclosedModel.status);
  if (stage === "drawing") return statusLabel(pipeline.finalEnclosedModel.status);
  return statusLabel(pipeline.rendering.status);
}

export function DownstreamLab({ stage }: { stage: Stage }) {
  const [pipeline, setPipeline] = useState<ResolvedPipeline | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    const load = () => {
      void loadPipeline().then((body) => {
        if (!live) return;
        setPipeline(body);
        setError(null);
      }).catch((reason: unknown) => {
        if (live) setError(reason instanceof Error ? reason.message : "The pipeline could not be read.");
      });
    };
    load();
    return subscribePipeline(load);
  }, []);

  const interpretation = pipeline?.interpretation;
  const enclosure = pipeline?.enclosure;
  const model = pipeline?.finalEnclosedModel;
  const site = pipeline?.siteContext;
  const liveStatus = liveStatusFor(stage, pipeline);
  const outputFulfilled = stage === "enclosure"
    ? Boolean(model?.geometryRef) && enclosure?.status === "current-source"
    : false;

  return (
    <main className="site-view" data-panels="model" data-sheet={stage} data-pipeline-stage={stage} data-pipeline-status={stage === "enclosure" ? enclosure?.status : stage === "slicing" ? model?.status : stage === "drawing" ? model?.status : pipeline?.rendering.status}>
      <aside className="site-panel site-panel-library" aria-label={stage}>
        <section className="site-block">
          <h2 className="site-subtitle">{stage === "enclosure" ? "Enclosure" : stage === "slicing" ? "Slicing" : stage === "drawing" ? "Drawing" : "Rendering"}</h2>
          <LabContractPanel labId={stage} liveStatus={liveStatus} outputFulfilled={outputFulfilled} />
          {error ? <p className="site-note">{error}</p> : null}
        </section>
        <section className="site-block site-specs" aria-label="Live source">
          <h2 className="site-subtitle">Live source</h2>
          {stage === "enclosure" ? (
            <>
              <Row label="Interpretation revision" value={enclosure?.sourceInterpretationRevisionId ?? ""} />
              <Row label="Valid Integrated Model" value={enclosure?.validInput ? "Yes" : "No"} />
              <Row label="Interpretation geometry" value={statusLabel(enclosure?.inputGeometryStatus ?? "no-source")} />
              <Row label="Status" value={statusLabel(enclosure?.status ?? "no-source")} />
              <Row label="Enclosure revision" value={enclosure?.enclosureRevisionId ?? ""} />
              <Row label="Final Enclosed Model" value={model?.modelRevisionId ?? ""} />
              <Row label="Model geometry" value={model?.geometryRef ?? "null"} />
            </>
          ) : null}
          {stage === "slicing" ? (
            <>
              <Row label="Final Enclosed Model" value={model?.modelRevisionId ?? ""} />
              <Row label="Model geometry" value={model?.geometryRef ?? "null"} />
              <Row label="Model status" value={statusLabel(model?.status ?? "no-source")} />
              <Row label="Slice definitions" value={String(pipeline?.slicing.slices.length ?? 0)} />
            </>
          ) : null}
          {stage === "drawing" ? (
            <>
              <Row label="Final Enclosed Model" value={model?.modelRevisionId ?? ""} />
              <Row label="Site context" value={site?.path ?? ""} />
              <Row label="Site revision" value={site?.revision ?? ""} />
              <Row label="Drawings" value={String(pipeline?.drawing.drawings.length ?? 0)} />
            </>
          ) : null}
          {stage === "rendering" ? (
            <>
              <Row label="Final Enclosed Model" value={pipeline?.rendering.sourceFinalModelRevisionId ?? ""} />
              <Row label="Status" value={statusLabel(pipeline?.rendering.status ?? "no-source")} />
              <Row label="Site context" value={site?.path ?? ""} />
              <Row label="Site revision" value={site?.revision ?? ""} />
            </>
          ) : null}
        </section>
        {stage === "slicing" ? (
          <section className="site-block">
            <h2 className="site-subtitle">Slices</h2>
            {pipeline?.slicing.slices.length ? pipeline.slicing.slices.map((slice) => (
              <p key={slice.sliceId} className="site-note" data-slice-id={slice.sliceId} data-slice-status={slice.status}>
                {slice.sliceId} · {slice.name} · {slice.type} · {statusLabel(slice.status)} · geometry not implemented
              </p>
            )) : <p className="site-note">No slice definitions are stored.</p>}
          </section>
        ) : null}
        {stage === "drawing" ? (
          <section className="site-block">
            <h2 className="site-subtitle">Drawings</h2>
            {pipeline?.drawing.drawings.length ? pipeline.drawing.drawings.map((drawing) => (
              <p key={drawing.drawingId} className="site-note" data-drawing-id={drawing.drawingId} data-drawing-status={drawing.status}>
                {drawing.drawingId} · {drawing.drawingType} · slice {drawing.sourceSliceId} · {statusLabel(drawing.status)} · generation not implemented
              </p>
            )) : <p className="site-note">No drawings are stored. Send to Drawing is not implemented.</p>}
          </section>
        ) : null}
        {stage === "enclosure" && interpretation ? (
          <section className="site-block" data-enclosure-valid-input={enclosure?.validInput ? "true" : "false"} data-interpretation-geometry={interpretation.geometryStatus}>
            <h2 className="site-subtitle">Upstream Interpretation</h2>
            <Row label="Selected assembly" value={interpretation.sourceAssemblyId ?? ""} />
            <Row label="Interpretation status" value={statusLabel(interpretation.status)} />
            <Row label="Geometry" value={statusLabel(interpretation.geometryStatus)} />
            <p className="site-note">{enclosure?.validInput ? "Current Integrated Architectural Model is complete." : "Enclosure is awaiting a complete Current Integrated Architectural Model. A reading or revision stamp is not valid input."}</p>
          </section>
        ) : null}
      </aside>
      <section className="site-stage" aria-label={stage}>
        <div className="site-frame">
          <header className="site-frame-bar">
            <div className="site-frame-name">
              <h2 className="site-subtitle">{stage === "enclosure" ? "Enclosure" : stage === "slicing" ? "Slicing" : stage === "drawing" ? "Drawing" : "Rendering"}</h2>
              <p className="site-note">Methodology not implemented. The contract above is the input and output authority.</p>
            </div>
          </header>
        </div>
      </section>
    </main>
  );
}
