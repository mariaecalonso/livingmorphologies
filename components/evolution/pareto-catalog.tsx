"use client";

import { useEffect, useRef, useState } from "react";
import { Panel, PanelHeader } from "@/components/hud";
import {
  ArchetypeSwitch,
  EvolutionImage,
  formatCandidateId,
  formatGeneration,
  useEvolutionCatalog,
  useSelectedArchetype,
} from "@/components/evolution/evolution-data";
import { EvolutionHeader } from "@/components/evolution/evolution-header";
import { ObjectiveBars } from "@/components/evolution/pareto-space";
import { useSquareGridFit } from "@/components/use-square-grid-fit";
import { useViewMode } from "@/components/view-mode";
import { BRANCHES } from "@/lib/catalog";
import type { EvolutionCatalog } from "@/lib/skill2/evolution-index";

export function ParetoCatalog({ initial }: { initial: EvolutionCatalog }) {
  const catalog = useEvolutionCatalog(initial);
  const { archetype, select } = useSelectedArchetype(catalog);
  const presentation = useViewMode() === "presentation";
  const gridRef = useRef<HTMLDivElement>(null);
  const fit = useSquareGridFit(gridRef, {
    minimum: presentation ? 340 : 150,
    caption: presentation ? 104 : 50,
    gap: presentation ? 20 : 8,
  });
  const [page, setPage] = useState(0);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const appliedFocus = useRef<string | null>(null);
  const archive = archetype?.candidates.filter((candidate) => candidate.archived && candidate.image) ?? [];
  const selected = archive.find((candidate) => candidate.key === selectedKey) ?? null;
  const pageSize = Math.max(1, fit.columns * fit.rows);

  useEffect(() => {
    const stored = window.sessionStorage.getItem("lm-pareto-candidate");
    const token = `${stored}:${pageSize}`;
    if (!stored || appliedFocus.current === token) return;
    const index = archive.findIndex((candidate) => candidate.key === stored);
    if (index < 0) return;
    appliedFocus.current = token;
    setSelectedKey(stored);
    setPage(Math.floor(index / Math.max(1, pageSize)));
  }, [archive, pageSize]);
  const pageCount = Math.max(1, Math.ceil(archive.length / pageSize));
  const current = Math.min(page, pageCount - 1);
  const visible = archive.slice(current * pageSize, current * pageSize + pageSize);

  return (
    <main className="evo-page">
      <EvolutionHeader
        title="Pareto Catalog"
        detail={
          archetype
            ? `${archetype.name} · non-dominated archive · ${archive.length} alternatives`
            : "No completed searches yet"
        }
        aside={<ArchetypeSwitch catalog={catalog} archetypeId={archetype?.archetypeId ?? null} onChange={(id) => { setPage(0); setSelectedKey(null); select(id); }} />}
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
            {archive.length === 0 ? (
              <p className="evo-empty">This archetype has no archive images yet. A finished generation adds its nondominated set here.</p>
            ) : (
              <ul
                className="archive-grid"
                style={{ gridTemplateColumns: `repeat(${fit.columns}, ${fit.size}px)`, gap: presentation ? 20 : 8 }}
              >
                {visible.map((candidate) => (
                  <li key={candidate.key}>
                    <button
                      type="button"
                      className="archive-card"
                      data-active={candidate.key === selectedKey || undefined}
                      onClick={() => setSelectedKey((key) => (key === candidate.key ? null : candidate.key))}
                    >
                      <span className="archive-card-image">
                        <EvolutionImage src={candidate.image} />
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
            )}
          </div>
        </section>

        <Panel className="archive-detail">
          {selected ? (
            <>
              <PanelHeader
                kicker={archetype?.name ?? "Candidate"}
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
                <EvolutionImage src={selected.image} />
              </div>
              <div className="archive-detail-data">
                <ObjectiveBars candidate={selected} />
                <div className="archive-criteria">
                  <p className="eyebrow">Observed criteria</p>
                  <table>
                    <thead>
                      <tr>
                        <th>Criterion</th>
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
                            <td>{selected.observed[criterion.id]?.toFixed(2) ?? "—"}</td>
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
                    <dd>Non-dominated archive</dd>
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
