"use client";

import { useEffect, useRef, useState } from "react";
import { Panel, PanelHeader } from "@/components/hud";
import {
  EvolutionImage,
  formatCandidateId,
  formatGeneration,
  useSelectedArchetype,
} from "@/components/evolution/evolution-data";
import { formatMatch } from "@/components/evolution/format-match";
import { ObjectiveBars } from "@/components/evolution/pareto-space";
import { PropagationPreview } from "@/components/evolution/propagation-preview";
import { BRANCHES, TYPOLOGIES } from "@/lib/catalog";
import type { TypologyId } from "@/lib/types";
import type { EvolutionCandidateView, EvolutionCatalog } from "@/lib/skill2/evolution-index";

function isTypologyId(value: string | undefined): value is TypologyId {
  return value === "lobby" || value === "workspace" || value === "gathering";
}

function observedCriteria(typologyId: string | undefined) {
  const typology = isTypologyId(typologyId) ? typologyId : null;
  return BRANCHES.flatMap((branch) =>
    [...branch.shared, ...(typology ? [branch.specific[typology]] : [])].map((criterion) => ({
      id: criterion.id,
      label: criterion.label,
      branch: branch.title,
    })),
  );
}

function StripPager({
  page,
  pageCount,
  onPage,
}: {
  page: number;
  pageCount: number;
  onPage: (page: number) => void;
}) {
  return (
    <div className="runs-catalog-pager">
      <button type="button" onClick={() => onPage(page - 1)} disabled={page === 0} aria-label="Previous page">
        ‹
      </button>
      <span>
        {page + 1} / {pageCount}
      </span>
      <button type="button" onClick={() => onPage(page + 1)} disabled={page >= pageCount - 1} aria-label="Next page">
        ›
      </button>
    </div>
  );
}

function PagedStrip({
  label,
  note,
  items,
  selectedKey,
  meta,
  columns,
  rows,
  cardSize,
  rowHeight,
  gap,
  onSelect,
}: {
  label: string;
  note: string;
  items: EvolutionCandidateView[];
  selectedKey: string | null;
  meta: (candidate: EvolutionCandidateView) => string;
  columns: number;
  rows: number;
  cardSize: number;
  rowHeight: number;
  gap: number;
  onSelect: (key: string) => void;
}) {
  const [page, setPage] = useState(0);
  const perPage = Math.max(1, columns * rows);
  const pageCount = Math.max(1, Math.ceil(items.length / perPage));
  const current = Math.min(page, pageCount - 1);
  const visible = items.slice(current * perPage, current * perPage + perPage);
  return (
    <div className="pareto-band">
      <div className="pareto-band-head">
        <p className="eyebrow pareto-band-label">
          {label}
          <span>{note}</span>
        </p>
        <StripPager page={current} pageCount={pageCount} onPage={setPage} />
      </div>
      <div
        className="pareto-specialist-row"
        aria-label={label}
        style={{
          gridTemplateColumns: `repeat(${columns}, ${cardSize}px)`,
          gridTemplateRows: `repeat(${rows}, ${rowHeight}px)`,
          gap,
        }}
      >
        {visible.map((candidate) => (
          <CandidateCard
            key={candidate.key}
            candidate={candidate}
            active={candidate.key === selectedKey}
            meta={meta(candidate)}
            width={cardSize}
            maxHeight={rowHeight}
            onClick={() => onSelect(candidate.key)}
          />
        ))}
      </div>
    </div>
  );
}

function CandidateCard({
  candidate,
  active,
  meta,
  width,
  maxHeight,
  onClick,
}: {
  candidate: EvolutionCandidateView;
  active: boolean;
  meta: string;
  width?: number;
  maxHeight?: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="runs-catalog-card"
      data-active={active || undefined}
      onClick={onClick}
      style={width ? { width, flexBasis: width, maxHeight } : undefined}
    >
      <span className="runs-catalog-card-image">
        <EvolutionImage src={candidate.image} />
      </span>
      <span className="pareto-catalog-copy">
        <span>
          F {formatMatch(candidate.formal)} · S {formatMatch(candidate.spatial)} · A {formatMatch(candidate.atmospheric)}
        </span>
        <span>{meta}</span>
      </span>
    </button>
  );
}

export function ParetoCatalog({ initial }: { initial: EvolutionCatalog }) {
  const catalog = initial;
  const { archetype, select } = useSelectedArchetype(catalog);
  const [wall, setWall] = useState(false);
  const stackRef = useRef<HTMLDivElement>(null);
  const archive = archetype?.candidates.filter((candidate) => candidate.archived && candidate.image) ?? [];
  const specialists = (["formal", "spatial", "atmospheric"] as const).flatMap((emphasis) =>
    archetype?.candidates.filter((candidate) => candidate.specialist === emphasis && candidate.image) ?? [],
  );
  const cardRows = wall ? 5 : 3;
  const weightedRows = specialists.length > 0 ? (wall ? 2 : 1) : 0;
  const archiveRows = Math.max(1, cardRows - weightedRows);
  const [fit, setFit] = useState({ columns: 6, size: 120, row: 156 });
  useEffect(() => {
    setWall(new URLSearchParams(window.location.search).get("wall") === "1");
  }, []);
  useEffect(() => {
    const node = stackRef.current;
    if (!node) return;
    const measure = () => {
      const { width, height } = node.getBoundingClientRect();
      if (width < 40 || height < 40) return;
      const gap = wall ? 12 : 8;
      const caption = wall ? 64 : 36;
      const labels = [...node.querySelectorAll<HTMLElement>(".pareto-band-head")];
      const labelH = labels.reduce((sum, label) => {
        const style = getComputedStyle(label);
        return sum + label.getBoundingClientRect().height + parseFloat(style.marginTop) + parseFloat(style.marginBottom);
      }, 0);
      const rows = cardRows;
      const usable = Math.max(rows * 48, height - labelH);
      const row = Math.max(48, Math.floor((usable - gap * (rows - 1)) / rows));
      const sizeFromHeight = Math.max(48, row - caption);
      const widthColumns = Math.max(1, Math.floor((width + gap) / (sizeFromHeight + gap)));
      const columns = wall ? Math.max(1, Math.floor((width + gap) / (row + gap))) : widthColumns;
      const fitted = Math.floor((width - gap * (columns - 1)) / columns);
      setFit({ columns, size: Math.max(48, fitted), row });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    const frame = requestAnimationFrame(measure);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [wall, cardRows, weightedRows, specialists.length, archive.length, archiveRows]);
  const [page, setPage] = useState(0);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [display, setDisplay] = useState<"morphology" | "propagation">("morphology");
  useEffect(() => {
    setDisplay("morphology");
  }, [selectedKey]);
  const appliedFocus = useRef<string | null>(null);
  const selected = [...specialists, ...archive].find((candidate) => candidate.key === selectedKey) ?? null;
  const cardGap = wall ? 12 : 8;
  const pageSize = Math.max(1, fit.columns * archiveRows);

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

  const choose = (id: string) => {
    setPage(0);
    setSelectedKey(null);
    select(id);
  };

  return (
    <main className={`pareto-catalog-page flex h-full flex-col bg-black text-[var(--text)]${wall ? " runs-wall" : ""}`}>
      <header className="runs-header border-b border-[var(--line)] px-3 py-2">
        <div className="flex items-center justify-between gap-3">
          <p className="display text-[0.72rem] text-white">Pareto Catalog</p>
          <p className="text-[0.58rem] tracking-[0.14em] uppercase text-[var(--muted)]">{archive.length} Pareto</p>
        </div>
        <p className="eyebrow mt-0.5 min-w-0 truncate">
          {archetype
            ? `${archetype.name} · ${specialists.length} specialists · no candidate is ranked as best`
            : "No completed searches yet"}
        </p>
      </header>

      <div className="flex min-h-0 flex-1">
        <aside className="runs-aside panel m-2 flex w-[15.5rem] shrink-0 flex-col" aria-label="Archetype catalog">
          <header className="panel-header">
            <div className="panel-header-content">
              <p className="hud-panel-kicker">Input</p>
              <h2 className="panel-title">Archetype</h2>
            </div>
          </header>
          <div className="flex min-h-0 flex-1 flex-col gap-2">
            {TYPOLOGIES.map((typology) => (
              <section key={typology.id} className="flex min-h-0 flex-1 flex-col gap-1.5">
                <p className="eyebrow shrink-0">{typology.label}</p>
                <div className="flex min-h-0 flex-1 flex-col gap-1.5">
                  {typology.archetypes.map((item) => {
                    const run = catalog.archetypes.find((entry) => entry.archetypeId === item.id);
                    const count = run?.candidates.filter((candidate) => candidate.archived && candidate.image).length ?? 0;
                    const active = item.id === archetype?.archetypeId;
                    const progress =
                      run && run.completedGenerations < run.generationCount
                        ? ` ${run.completedGenerations}/${run.generationCount}`
                        : count
                          ? ` · ${count}`
                          : "";
                    return (
                      <button
                        key={item.id}
                        type="button"
                        disabled={!run}
                        title={run ? undefined : "Search not run yet"}
                        onClick={() => run && choose(item.id)}
                        className={`flex min-h-0 flex-1 items-center border px-1.5 py-1.5 text-left text-[0.58rem] leading-tight tracking-[0.08em] uppercase transition disabled:opacity-30 ${
                          active
                            ? "border-[var(--cyan)] bg-[linear-gradient(90deg,rgba(15,115,119,0.14),rgba(199,126,95,0.14))] text-white"
                            : "border-[rgba(242,242,238,0.16)] text-[var(--muted)] hover:border-[rgba(242,242,238,0.32)] hover:text-[var(--text)]"
                        }`}
                      >
                        {item.name}
                        {progress}
                      </button>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        </aside>

        <section className="runs-catalog panel m-2 ml-0 flex min-h-0 min-w-0 flex-1 flex-col" aria-label="Pareto catalog">
          <header className="panel-header">
            <div className="panel-header-content">
              <p className="hud-panel-kicker">Catalog</p>
              <h2 className="panel-title">{archetype?.name ?? "Archetype"}</h2>
            </div>
          </header>
          <div ref={stackRef} className="pareto-catalog-stack">
          {specialists.length > 0 ? (
            <PagedStrip
              key={`${archetype?.archetypeId}-specialists`}
              label="Weighted · specialists"
              note="One objective preferred"
              items={specialists}
              selectedKey={selectedKey}
              meta={(candidate) => `${candidate.specialist} · ${formatCandidateId(candidate.id)}`}
              columns={fit.columns}
              rows={weightedRows}
              cardSize={fit.size}
              rowHeight={fit.row}
              gap={cardGap}
              onSelect={(key) => setSelectedKey((currentKey) => (currentKey === key ? null : key))}
            />
          ) : null}
          <div className="pareto-band-head pareto-archive-label">
            <p className="eyebrow pareto-band-label">
              Unweighted archive
              <span>No objective preferred</span>
            </p>
            <StripPager page={current} pageCount={pageCount} onPage={setPage} />
          </div>
          <div className="runs-catalog-body">
            {archive.length === 0 ? (
              <p className="flex flex-1 items-center justify-center text-[0.62rem] uppercase tracking-[0.16em] text-[var(--muted)]">
                This archetype has no archive images yet
              </p>
            ) : (
              <div
                className="runs-catalog-grid"
                style={{
                  gridTemplateColumns: `repeat(${fit.columns}, ${fit.size}px)`,
                  gridTemplateRows: `repeat(${archiveRows}, ${fit.row}px)`,
                  gap: cardGap,
                }}
              >
                {visible.map((candidate) => (
                  <CandidateCard
                    key={candidate.key}
                    candidate={candidate}
                    active={candidate.key === selectedKey}
                    meta={`${formatGeneration(candidate.generation)} · ${formatCandidateId(candidate.id)}`}
                    width={fit.size}
                    maxHeight={fit.row}
                    onClick={() => setSelectedKey((key) => (key === candidate.key ? null : candidate.key))}
                  />
                ))}
              </div>
            )}
          </div>
          </div>
        </section>

        <Panel className="archive-detail pareto-catalog-detail">
          {selected ? (
            <>
              <PanelHeader
                kicker={archetype?.name ?? "Candidate"}
                title={formatCandidateId(selected.id)}
                aside={<span className="eyebrow">{formatGeneration(selected.generation)}</span>}
              />
              <div className="evo-segment archive-display" role="group" aria-label="Display">
                <button type="button" data-active={display === "morphology" || undefined} onClick={() => setDisplay("morphology")}>
                  Morphology
                </button>
                <button type="button" data-active={display === "propagation" || undefined} onClick={() => setDisplay("propagation")}>
                  Propagation preview
                </button>
              </div>
              <div className="archive-detail-image">
                {display === "propagation" ? (
                  <PropagationPreview archetypeId={selected.archetypeId} candidateId={selected.id} />
                ) : (
                  <EvolutionImage src={selected.image} />
                )}
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
                      {observedCriteria(archetype?.typologyId).map((criterion) => (
                        <tr key={criterion.id}>
                          <td>
                            <span className="archive-branch">{criterion.branch}</span> {criterion.label}
                          </td>
                          <td>{formatMatch(selected.observed[criterion.id])}</td>
                        </tr>
                      ))}
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
                    <dd>
                      {selected.specialist ? `Specialist · ${selected.specialist}` : "Non-dominated archive"}
                    </dd>
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
