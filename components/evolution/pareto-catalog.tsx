"use client";

import { useRef, useState } from "react";
import { Panel, PanelHeader } from "@/components/hud";
import { EvolutionHeader } from "@/components/evolution/evolution-header";
import { MockMorphology } from "@/components/evolution/mock-morphology";
import { ObjectiveBars } from "@/components/evolution/pareto-space";
import { useSquareGridFit } from "@/components/use-square-grid-fit";
import { useViewMode } from "@/components/view-mode";
import { BRANCHES } from "@/lib/catalog";
import { formatCandidateId, formatGeneration, MOCK_ARCHIVE } from "@/lib/ui-mock/evolution-mock";

export function ParetoCatalog() {
  const presentation = useViewMode() === "presentation";
  const gridRef = useRef<HTMLDivElement>(null);
  const fit = useSquareGridFit(gridRef, {
    minimum: presentation ? 340 : 150,
    caption: presentation ? 104 : 50,
    gap: presentation ? 20 : 8,
  });
  const [page, setPage] = useState(0);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const selected = MOCK_ARCHIVE.find((candidate) => candidate.id === selectedId) ?? null;

  const pageSize = fit.columns * fit.rows;
  const pageCount = Math.max(1, Math.ceil(MOCK_ARCHIVE.length / pageSize));
  const current = Math.min(page, pageCount - 1);
  const visible = MOCK_ARCHIVE.slice(current * pageSize, current * pageSize + pageSize);

  return (
    <main className="evo-page">
      <EvolutionHeader
        title="Pareto Catalog"
        detail={`Non-dominated archive · designer selection · ${MOCK_ARCHIVE.length} alternatives`}
      />

      <div className="archive-layout">
        <section className="archive-browser">
          <div className="archive-pager">
            <span className="eyebrow">No candidate is ranked as best</span>
            <button type="button" onClick={() => setPage(current - 1)} disabled={current === 0} aria-label="Previous page">
              ‹
            </button>
            <span>
              {current + 1} / {pageCount}
            </span>
            <button type="button" onClick={() => setPage(current + 1)} disabled={current >= pageCount - 1} aria-label="Next page">
              ›
            </button>
          </div>
          <div ref={gridRef} className="archive-grid-frame">
            <ul
              className="archive-grid"
              style={{ gridTemplateColumns: `repeat(${fit.columns}, ${fit.size}px)`, gap: presentation ? 20 : 8 }}
            >
              {visible.map((candidate) => (
                <li key={candidate.id}>
                  <button
                    type="button"
                    className="archive-card"
                    data-active={candidate.id === selectedId || undefined}
                    onClick={() => setSelectedId((id) => (id === candidate.id ? null : candidate.id))}
                  >
                    <span className="archive-card-image">
                      <MockMorphology seed={candidate.previewSeed} generation={candidate.generation} />
                    </span>
                    <span className="archive-card-scores">
                      <span>F {candidate.formal.toFixed(2)}</span>
                      <span>S {candidate.spatial.toFixed(2)}</span>
                      <span>A {candidate.atmospheric.toFixed(2)}</span>
                    </span>
                    <span className="archive-card-meta">
                      <span>{formatGeneration(candidate.generation)}</span>
                      <span>{formatCandidateId(candidate.id)}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <Panel className="archive-detail">
          {selected ? (
            <>
              <PanelHeader
                kicker="Candidate"
                title={formatCandidateId(selected.id)}
                aside={<span className="eyebrow">{formatGeneration(selected.generation)}</span>}
              />
              <div className="evo-segment archive-display" role="group" aria-label="Display">
                <button type="button" data-active>
                  Morphology
                </button>
                <button type="button" disabled title="Available once the vertical propagation handoff exists">
                  Propagation preview
                </button>
              </div>
              <div className="archive-detail-image">
                <MockMorphology seed={selected.previewSeed} generation={selected.generation} />
              </div>
              <div className="archive-detail-data">
                <ObjectiveBars candidate={selected} />
                <div className="archive-criteria">
                  <p className="eyebrow">Target vs observed criteria</p>
                  <table>
                    <thead>
                      <tr>
                        <th>Criterion</th>
                        <th>Target</th>
                        <th>Observed</th>
                      </tr>
                    </thead>
                    <tbody>
                      {BRANCHES.flatMap((branch) =>
                        branch.shared.map((criterion) => (
                          <tr key={criterion.id}>
                            <td>
                              <span className="archive-branch">{branch.title}</span> {criterion.label}
                            </td>
                            <td>—</td>
                            <td>—</td>
                          </tr>
                        )),
                      )}
                    </tbody>
                  </table>
                </div>
                <dl className="evo-meta">
                  <div>
                    <dt>Origin</dt>
                    <dd>{formatGeneration(selected.generation)}</dd>
                  </div>
                  <div>
                    <dt>Candidate</dt>
                    <dd>{formatCandidateId(selected.id)}</dd>
                  </div>
                  <div>
                    <dt>Pareto status</dt>
                    <dd>Non-dominated</dd>
                  </div>
                </dl>
                <button type="button" className="archive-handoff" disabled title="Available once vertical propagation is connected">
                  Select for vertical propagation
                </button>
              </div>
            </>
          ) : (
            <>
              <PanelHeader kicker="Candidate" title="None selected" />
              <p className="evo-empty">
                Choose an alternative to inspect it. The catalog holds non-dominated trade-offs; the designer selects
                which morphology proceeds.
              </p>
            </>
          )}
        </Panel>
      </div>
    </main>
  );
}
