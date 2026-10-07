"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArchetypeRail } from "@/components/archetype-rail";
import { FilamentRefine } from "@/components/filament-refine";
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
import { BRANCHES } from "@/lib/catalog";
import { labWorkspace } from "@/lib/site-map";
import type { TypologyId } from "@/lib/types";
import type { EvolutionCandidateView, EvolutionCatalog } from "@/lib/skill2/evolution-index";
import type { SavedPick } from "@/lib/skill2/saved-picks";
import {
  readSkill2Selections,
  SKILL2_ARCHETYPE_TOTAL,
  writeSkill2Selection,
  type Skill2Selection,
  type Skill2Selections,
} from "@/lib/skill2/published-selection";

function isTypologyId(value: string | undefined): value is TypologyId {
  return value === "lobby" || value === "workspace" || value === "gathering";
}

function catalogDrawings(candidates: EvolutionCandidateView[]) {
  const hasHidden = candidates.some((candidate) => candidate.catalogVisible === false);
  return candidates.filter((candidate) => {
    if (!candidate.image) return false;
    if (hasHidden) return candidate.catalogVisible === true;
    return candidate.archived;
  });
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

function inkedCatalogImage(candidate: EvolutionCandidateView, inkRevision: number) {
  if (!candidate.image) return null;
  return inkRevision ? `${candidate.image}?v=${inkRevision}` : candidate.image;
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
  chosenKey,
  meta,
  columns,
  rows,
  cardSize,
  rowHeight,
  gap,
  inkRevision,
  onSelect,
}: {
  label: string;
  note: string;
  items: EvolutionCandidateView[];
  selectedKey: string | null;
  chosenKey: string | null;
  meta: (candidate: EvolutionCandidateView) => string;
  columns: number;
  rows: number;
  cardSize: number;
  rowHeight: number;
  gap: number;
  inkRevision: number;
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
            chosen={candidate.key === chosenKey}
            meta={meta(candidate)}
            width={cardSize}
            maxHeight={rowHeight}
            inkRevision={inkRevision}
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
  chosen,
  meta,
  width,
  maxHeight,
  inkRevision,
  onClick,
}: {
  candidate: EvolutionCandidateView;
  active: boolean;
  chosen: boolean;
  meta: string;
  width?: number;
  maxHeight?: number;
  inkRevision: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="runs-catalog-card"
      data-active={active || undefined}
      data-selected={chosen || undefined}
      aria-pressed={chosen}
      onClick={onClick}
      style={width ? { width, flexBasis: width, maxHeight } : undefined}
    >
      {chosen ? <span className="skill2-selected-badge">Selected</span> : null}
      <span className="runs-catalog-card-image">
        <EvolutionImage src={inkedCatalogImage(candidate, inkRevision)} />
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

export function ParetoCatalog({ initial, picks }: { initial: EvolutionCatalog; picks: SavedPick[] }) {
  const catalog = initial;
  const { archetype, select } = useSelectedArchetype(catalog);
  const [wall, setWall] = useState(false);
  const [inkRevision, setInkRevision] = useState(0);
  const stackRef = useRef<HTMLDivElement>(null);
  const archive = archetype ? catalogDrawings(archetype.candidates) : [];
  const showingCatalog = archetype?.candidates.some((candidate) => candidate.catalogVisible === false) ?? false;
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
  const [selections, setSelections] = useState<Skill2Selections>({});
  const [handoff, setHandoff] = useState<"verified" | "pending" | "preparing">("pending");
  const [prepareError, setPrepareError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const commitToken = useRef(0);
  const preparingKey = useRef<string | null>(null);
  const [selectionsReady, setSelectionsReady] = useState(false);
  const [display, setDisplay] = useState<"morphology" | "propagation">("morphology");
  useEffect(() => {
    setDisplay("morphology");
  }, [selectedKey]);
  const appliedFocus = useRef<string | null>(null);
  const selected = archetype?.candidates.find((candidate) => candidate.key === selectedKey) ?? null;
  const cardGap = wall ? 12 : 8;
  const onSaved = useCallback(() => setInkRevision(Date.now()), []);
  const pageSize = Math.max(1, fit.columns * archiveRows);

  const filed = archetype ? picks.find((pick) => pick.archetypeId === archetype.archetypeId) ?? null : null;
  const committed = archetype
    ? selections[archetype.archetypeId] ?? (filed ? { archetypeId: filed.archetypeId, candidateId: filed.candidateId } : null)
    : null;
  const chosenKey = committed ? `${committed.archetypeId}:${committed.candidateId}` : null;
  const chosenHere = committed != null && selected != null && selected.key === chosenKey;
  const selectedCount = Object.keys(selections).length;

  const restored = useRef(false);
  useEffect(() => {
    if (restored.current) return;
    restored.current = true;
    setSelections(readSkill2Selections());
    setSelectionsReady(true);
  }, []);

  const openedArchetype = useRef<string | null>(null);
  useEffect(() => {
    if (!selectionsReady || !archetype) return;
    if (openedArchetype.current === archetype.archetypeId) return;
    openedArchetype.current = archetype.archetypeId;
    const stored = selections[archetype.archetypeId];
    const filedPick = picks.find((pick) => pick.archetypeId === archetype.archetypeId);
    const candidateId = stored?.candidateId ?? filedPick?.candidateId;
    setSelectedKey(candidateId != null ? `${archetype.archetypeId}:${candidateId}` : null);
  }, [archetype, selections, selectionsReady, picks]);

  useEffect(() => {
    if (!committed) return;
    const controller = new AbortController();
    void fetch(`/api/semantic-catalog/${committed.archetypeId}/${committed.candidateId}/selection`, { signal: controller.signal })
      .then((response) => (response.ok ? response.json() : null))
      .then((body: { handoff?: string } | null) => {
        if (preparingKey.current === `${committed.archetypeId}:${committed.candidateId}`) return;
        setHandoff(body?.handoff === "verified" ? "verified" : "pending");
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [committed]);

  const commitSelection = () => {
    if (!selected) return;
    const token = ++commitToken.current;
    const archetypeId = selected.archetypeId;
    const candidateId = selected.id;
    setSaving(true);
    setPrepareError(null);
    const applySelection = (selection: Skill2Selection) => {
      setSelections((current) => {
        const existing = current[selection.archetypeId];
        if (token !== commitToken.current && existing && existing.candidateId !== selection.candidateId) return current;
        return writeSkill2Selection(selection);
      });
    };
    void fetch(`/api/semantic-catalog/${archetypeId}/${candidateId}/selection`)
      .then(async (response) => {
        const body = (await response.json()) as { selection?: Skill2Selection; handoff?: string };
        if (!response.ok || !body.selection) {
          if (token !== commitToken.current) return;
          setHandoff("pending");
          setPrepareError("This drawing could not be selected.");
          return;
        }
        applySelection(body.selection);
        if (token !== commitToken.current) return;
        if (body.handoff === "verified") {
          setHandoff("verified");
          setSaving(false);
          return;
        }
        setHandoff("preparing");
        preparingKey.current = `${archetypeId}:${candidateId}`;
        const prepared = await fetch(`/api/semantic-catalog/${archetypeId}/${candidateId}/selection`, { method: "POST" });
        const result = (await prepared.json()) as { selection?: Skill2Selection; handoff?: string; error?: string };
        if (result.selection) applySelection(result.selection);
        if (token !== commitToken.current) return;
        preparingKey.current = null;
        if (prepared.ok && result.handoff === "verified") {
          setHandoff("verified");
          setPrepareError(null);
        } else {
          setHandoff("pending");
          setPrepareError(result.error ?? "The Z0 could not be verified.");
        }
      })
      .catch(() => {
        if (token !== commitToken.current) return;
        preparingKey.current = null;
        setHandoff("pending");
        setPrepareError("The Z0 could not be verified.");
      })
      .finally(() => {
        if (token === commitToken.current) setSaving(false);
      });
  };

  useEffect(() => {
    const stored = chosenKey ?? window.sessionStorage.getItem("lm-pareto-candidate");
    const token = `${stored}:${pageSize}`;
    if (!stored || appliedFocus.current === token) return;
    const index = archive.findIndex((candidate) => candidate.key === stored);
    if (index < 0) return;
    appliedFocus.current = token;
    if (!chosenKey) setSelectedKey(stored);
    setPage(Math.floor(index / Math.max(1, pageSize)));
  }, [archive, pageSize, chosenKey]);
  const pageCount = Math.max(1, Math.ceil(archive.length / pageSize));
  const current = Math.min(page, pageCount - 1);
  const visible = archive.slice(current * pageSize, current * pageSize + pageSize);

  const choose = (id: string) => {
    const stored = selections[id];
    setPage(0);
    setSelectedKey(stored ? `${stored.archetypeId}:${stored.candidateId}` : null);
    select(id);
  };

  return (
    <main className={`pareto-catalog-page flex h-full flex-col bg-black text-[var(--text)]${wall ? " runs-wall" : ""}`}>
      <header className="runs-header border-b border-[var(--line)] px-3 py-2">
        <div className="flex items-center justify-between gap-3">
          <p className="display text-[0.72rem] text-white">{labWorkspace("optimization").tabs.find((tab) => "results" in tab && tab.results)?.label}</p>
          <p className="skill2-selection-progress">
            {String(selectedCount).padStart(2, "0")} / {String(SKILL2_ARCHETYPE_TOTAL).padStart(2, "0")} Selected
          </p>
          <Link href="/lab/vertical" className="skill2-vertical-link">
            Vertical propagation
          </Link>
        </div>
          <p className="eyebrow mt-0.5 min-w-0 truncate">
          {archetype
            ? `${archetype.name} · ${specialists.length} specialists · ${archive.length} ${showingCatalog ? "drawings" : "Pareto"}`
            : "No completed searches yet"}
        </p>
      </header>

      <div className="flex min-h-0 flex-1">
        <ArchetypeRail
          activeId={archetype?.archetypeId ?? null}
          onPick={choose}
          chosen={(id) => Boolean(selections[id])}
          disabled={(id) => !catalog.archetypes.some((entry) => entry.archetypeId === id)}
          note={(id) => {
            const run = catalog.archetypes.find((entry) => entry.archetypeId === id);
            if (!run) return "";
            if (run.completedGenerations < run.generationCount) return ` ${run.completedGenerations}/${run.generationCount}`;
            const count = catalogDrawings(run.candidates).length;
            return count ? ` · ${count}` : "";
          }}
        />

        <section className="runs-catalog panel m-2 ml-0 flex min-h-0 min-w-0 flex-1 flex-col" aria-label="Pareto catalog">
          <header className="panel-header">
            <div className="panel-header-content">
              <p className="hud-panel-kicker">Catalog</p>
              <h2 className="panel-title">{archetype?.name ?? "Archetype"}</h2>
            </div>
            {archetype ? (
              <FilamentRefine archetypeId={archetype.archetypeId} archetypeName={archetype.name} onSaved={onSaved} />
            ) : null}
          </header>
          <div ref={stackRef} className="pareto-catalog-stack">
          {specialists.length > 0 ? (
            <PagedStrip
              key={`${archetype?.archetypeId}-specialists`}
              label="Weighted · specialists"
              note="One objective preferred"
              items={specialists}
              selectedKey={selectedKey}
              chosenKey={chosenKey}
              meta={(candidate) => `${candidate.specialist} · ${formatCandidateId(candidate.id)}`}
              columns={fit.columns}
              rows={weightedRows}
              cardSize={fit.size}
              rowHeight={fit.row}
              gap={cardGap}
              inkRevision={inkRevision}
              onSelect={(key) => setSelectedKey((currentKey) => (currentKey === key ? null : key))}
            />
          ) : null}
          <div className="pareto-band-head pareto-archive-label">
            <p className="eyebrow pareto-band-label">
              {showingCatalog ? "Catalog" : "Unweighted archive"}
              <span>{showingCatalog ? "Finished drawings" : "No objective preferred"}</span>
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
                    chosen={candidate.key === chosenKey}
                    meta={`${formatGeneration(candidate.generation)} · ${formatCandidateId(candidate.id)}`}
                    width={fit.size}
                    maxHeight={fit.row}
                    inkRevision={inkRevision}
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
              <div className="archive-detail-image" data-chosen={chosenHere || undefined}>
                {display === "propagation" ? (
                  <PropagationPreview archetypeId={selected.archetypeId} candidateId={selected.id} />
                ) : (
                  <EvolutionImage src={inkedCatalogImage(selected, inkRevision)} />
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
                <button type="button" className="archive-handoff" disabled={saving} onClick={commitSelection}>
                  {chosenHere ? "Selected" : "Select morphology"}
                </button>
                {chosenHere && committed ? (
                  <p className="skill2-selection-note">
                    {handoff === "preparing" ? "Preparing Z0…" : handoff === "verified" ? "Ready" : prepareError ?? "Selected — Z0 handoff pending"}
                  </p>
                ) : null}
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
