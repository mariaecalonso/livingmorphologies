"use client";

import { useState } from "react";
import { AxonModel, SectionDrawing } from "@/components/drawings";
import {
  IconAtmospheric,
  IconFormal,
  IconModel,
  IconSave,
  IconSection,
  IconSpatial,
  Panel,
  PanelHeader,
} from "@/components/hud";
import { PhysarumField } from "@/components/physarum-field";
import {
  PHYSARUM_STEPS,
  TYPOLOGIES,
  WORKFLOW_STEPS,
  defaultRatings,
  findTypology,
} from "@/lib/catalog";
import {
  criteriaFit,
  hashSeed,
  ratingLabel,
  simulationStats,
  toPhysarumParams,
} from "@/lib/physarum";
import type { GroupId, Rating, RatingsMap, TypologyId } from "@/lib/types";

const GROUP_ICON = {
  formal: IconFormal,
  spatial: IconSpatial,
  atmospheric: IconAtmospheric,
} as const;

export function LivingInstrument() {
  const [typologyId, setTypologyId] = useState<TypologyId>("lobby");
  const [archetypeId, setArchetypeId] = useState("vertical-void");
  const [ratings, setRatings] = useState<RatingsMap>(() =>
    defaultRatings(findTypology("lobby").archetypes[0]),
  );
  const [iteration, setIteration] = useState(1);
  const [saved, setSaved] = useState(0);
  const [simulating, setSimulating] = useState(true);
  const [focus, setFocus] = useState<(typeof WORKFLOW_STEPS)[number]>("Physarum");
  const [notice, setNotice] = useState<string | null>(null);

  const typology = findTypology(typologyId);
  const archetype =
    typology.archetypes.find((item) => item.id === archetypeId) ??
    typology.archetypes[0];
  const original = defaultRatings(archetype);

  const seed = hashSeed([typologyId, archetype.id, String(iteration)]);
  const params = toPhysarumParams(ratings, seed);
  const stats = simulationStats(params, iteration);
  const fit = criteriaFit(original, ratings);

  const pulse = (message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice(null), 1600);
  };

  const selectTypology = (id: TypologyId) => {
    const next = findTypology(id);
    const first = next.archetypes[0];
    setTypologyId(id);
    setArchetypeId(first.id);
    setRatings(defaultRatings(first));
    setIteration(1);
    setSimulating(true);
    setFocus("Typology");
  };

  const selectArchetype = (id: string) => {
    const next = typology.archetypes.find((item) => item.id === id);
    if (!next) return;
    setArchetypeId(id);
    setRatings(defaultRatings(next));
    setIteration(1);
    setSimulating(true);
    setFocus("Archetype");
  };

  const setRating = (id: string, value: Rating) => {
    setRatings((prev) => ({ ...prev, [id]: value }));
    setFocus("Criteria");
  };

  const regenerate = () => {
    setIteration((n) => n + 1);
    setSimulating(true);
    setFocus("Iteration");
    pulse("New iteration seeded from current criteria");
  };

  const saveIteration = () => {
    setSaved((n) => n + 1);
    setFocus("Iteration");
    pulse(`Iteration ${String(iteration).padStart(2, "0")} saved`);
  };

  return (
    <div className="flex min-h-dvh flex-col px-2 py-2 text-[13px] md:h-dvh md:overflow-hidden md:px-3 md:py-2.5">
      <header className="mb-2 flex flex-wrap items-center justify-between gap-3 border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2">
        <div>
          <p className="display text-[1.05rem] text-white cyan-glow md:text-[1.25rem]">
            Living Morphologies
          </p>
          <p className="eyebrow mt-0.5 text-[0.58rem]">Emergent Network</p>
        </div>
        <nav className="flex items-center gap-1" aria-label="Typology">
          {TYPOLOGIES.map((item) => {
            const active = item.id === typologyId;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => selectTypology(item.id)}
                className={`min-w-[7.5rem] border px-4 py-1.5 text-[0.72rem] tracking-[0.22em] uppercase transition ${
                  active
                    ? "border-[var(--cyan)] bg-[rgba(0,228,255,0.12)] text-[var(--cyan-hot)] cyan-glow"
                    : "border-[rgba(0,228,255,0.18)] text-[var(--muted)] hover:border-[var(--cyan-dim)] hover:text-[var(--text)]"
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </nav>
        <label className="flex items-center gap-2 text-[0.68rem] tracking-[0.18em] uppercase text-[var(--muted)]">
          <span className="inline-flex h-7 w-7 items-center justify-center border border-[var(--cyan-dim)]">
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.4">
              <rect x="3" y="5" width="18" height="14" />
              <path d="M3 9h18" />
            </svg>
          </span>
          <select
            defaultValue="screen"
            className="border border-[var(--cyan-dim)] bg-transparent px-2 py-1 text-[var(--text)]"
          >
            <option value="screen">Screen</option>
          </select>
        </label>
      </header>

      <ol className="mb-2 flex gap-1 overflow-x-auto instrument-scroll pb-1">
        {WORKFLOW_STEPS.map((step, index) => {
          const active = step === focus;
          return (
            <li key={step} className="flex items-center gap-1">
              <span
                className={`whitespace-nowrap border px-2 py-0.5 text-[0.58rem] tracking-[0.16em] uppercase ${
                  active
                    ? "border-[var(--orange)] text-[var(--orange-hot)] orange-glow"
                    : "border-[rgba(0,228,255,0.16)] text-[var(--muted)]"
                }`}
              >
                {String(index + 1).padStart(2, "0")} {step}
              </span>
              {index < WORKFLOW_STEPS.length - 1 ? (
                <span className="text-[var(--cyan-dim)]">›</span>
              ) : null}
            </li>
          );
        })}
      </ol>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-2 md:grid-cols-[12.2rem_minmax(17rem,20.5rem)_minmax(0,1.2fr)_minmax(20rem,26rem)] md:grid-rows-[minmax(0,1fr)]">
        <Panel className="flex flex-col">
          <PanelHeader kicker="Input" title="Archetype" />
          <div className="flex flex-1 flex-col gap-1.5">
            {typology.archetypes.map((item) => {
              const active = item.id === archetype.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => selectArchetype(item.id)}
                  className={`border px-2 py-2 text-left text-[0.64rem] leading-tight tracking-[0.1em] uppercase transition ${
                    active
                      ? "border-[var(--cyan)] bg-[rgba(0,228,255,0.16)] text-white"
                      : "border-[rgba(0,228,255,0.16)] text-[var(--muted)] hover:text-[var(--text)]"
                  }`}
                >
                  {item.name}
                </button>
              );
            })}
          </div>
          <p className="mt-3 text-[0.62rem] tracking-[0.12em] uppercase text-[var(--muted)]">
            {typology.tagline}
          </p>
          <button
            type="button"
            onClick={saveIteration}
            className="mt-3 inline-flex items-center justify-center gap-2 border border-[var(--cyan-dim)] px-3 py-2 text-[0.68rem] tracking-[0.22em] uppercase text-[var(--cyan)] hover:bg-[rgba(0,228,255,0.08)]"
          >
            <IconSave /> Save
          </button>
        </Panel>

        <Panel className="flex min-h-0 flex-col">
          <PanelHeader
            kicker="Analysis"
            title="Criteria Configuration"
            aside={
              <button
                type="button"
                className="text-[0.58rem] tracking-[0.16em] uppercase text-[var(--muted)]"
                onClick={() => {
                  setRatings(original);
                  setFocus("Criteria");
                  pulse("Ratings restored to precedent analysis");
                }}
              >
                Reset
              </button>
            }
          />
          <div className="instrument-scroll min-h-0 flex-1 space-y-1.5 overflow-y-auto pr-1">
            {archetype.groups.map((group) => {
              const Icon = GROUP_ICON[group.id as GroupId];
              return (
                <div
                  key={group.id}
                  className="border border-[rgba(0,228,255,0.14)] bg-[rgba(0,20,28,0.35)] px-2 py-1.5"
                >
                  <div className="mb-1 flex items-center gap-2 text-[var(--cyan)]">
                    <Icon />
                    <div>
                      <p className="text-[0.66rem] tracking-[0.18em] uppercase">
                        {group.title}
                      </p>
                      <p className="text-[0.5rem] tracking-[0.12em] uppercase text-[var(--muted)]">
                        {group.subtitle}
                      </p>
                    </div>
                  </div>
                  <div className="space-y-1">
                    {group.criteria.map((criterion) => {
                      const value = ratings[criterion.id] ?? criterion.rating;
                      return (
                        <label key={criterion.id} className="block">
                          <div className="flex items-center justify-between">
                            <span className="text-[0.64rem] tracking-[0.08em] uppercase text-[var(--text)]">
                              {criterion.label}
                            </span>
                            <span className="text-[0.66rem] text-[var(--orange-hot)]">
                              {value}
                            </span>
                          </div>
                          <input
                            className="range-hud"
                            data-high={value === 2 ? "true" : "false"}
                            type="range"
                            min={0}
                            max={2}
                            step={1}
                            value={value}
                            aria-valuetext={ratingLabel(value)}
                            onChange={(event) =>
                              setRating(
                                criterion.id,
                                Number(event.target.value) as Rating,
                              )
                            }
                          />
                        </label>
                      );
                    })}
                  </div>
                  <div className="mt-0.5 flex justify-between text-[0.48rem] tracking-[0.14em] uppercase text-[var(--muted)]">
                    <span>Low</span>
                    <span>Medium</span>
                    <span>High</span>
                  </div>
                  <p className="body-copy mt-1 line-clamp-2 border-t border-[rgba(0,228,255,0.12)] pt-1 text-[0.64rem] leading-snug text-[#b9d7e2]">
                    <span className="mr-1 text-[0.48rem] tracking-[0.14em] uppercase text-[var(--cyan)]">
                      {group.title}
                    </span>
                    {group.descriptor}
                  </p>
                </div>
              );
            })}
          </div>
          <div className="mt-1.5 border border-[rgba(0,228,255,0.2)] bg-[rgba(0,40,48,0.28)] p-2">
            <div className="mb-1 flex items-center justify-between">
              <p className="text-[0.58rem] tracking-[0.18em] uppercase text-[var(--cyan)]">
                Generated Descriptor
              </p>
              <span className="text-[0.5rem] text-[var(--muted)]">v1.0</span>
            </div>
            <p className="body-copy text-[0.68rem] leading-snug text-[#d5eef6]">
              {archetype.synthesis}
            </p>
          </div>
        </Panel>

        <Panel padded={false} className="flex min-h-[22rem] flex-col md:min-h-0">
          <div className="flex items-start justify-between gap-3 px-3 pt-3">
            <div>
              <p className="eyebrow">Physarum Workflow</p>
              <h2 className="panel-title cyan-glow mt-1">Emergent Spatial Logic</h2>
            </div>
            <div className="flex items-center gap-2">
              <span
                className={`border px-2 py-0.5 text-[0.58rem] tracking-[0.16em] uppercase ${
                  simulating
                    ? "border-[var(--orange)] text-[var(--orange-hot)]"
                    : "border-[var(--cyan-dim)] text-[var(--cyan)]"
                }`}
              >
                {simulating ? "Simulating" : "Stable"}
              </span>
              <span className="text-[0.62rem] tracking-[0.16em] uppercase text-[var(--muted)]">
                Iteration {String(iteration).padStart(2, "0")}
              </span>
            </div>
          </div>
          <ol className="mt-3 flex gap-1 overflow-x-auto px-3 instrument-scroll">
            {PHYSARUM_STEPS.map((step) => {
              const active = step.n === 3;
              return (
                <li
                  key={step.n}
                  className={`min-w-[6.4rem] flex-1 border px-2 py-1.5 ${
                    active
                      ? "border-[var(--orange)] bg-[rgba(255,122,50,0.1)]"
                      : "border-[rgba(0,228,255,0.16)]"
                  }`}
                >
                  <p className={`text-[0.62rem] tracking-[0.14em] uppercase ${active ? "text-[var(--orange-hot)]" : "text-[var(--cyan)]"}`}>
                    {step.n} {step.title}
                  </p>
                  <p className="text-[0.58rem] text-[var(--muted)]">{step.caption}</p>
                </li>
              );
            })}
          </ol>
          <div className="relative mt-2 min-h-[16rem] flex-1 bg-[#071018]">
            <PhysarumField params={params} running={simulating} />
            <div
              className="pointer-events-none absolute inset-0 opacity-40"
              style={{
                backgroundImage:
                  "linear-gradient(rgba(0,228,255,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(0,228,255,0.06) 1px, transparent 1px)",
                backgroundSize: "32px 32px",
              }}
            />
            <div className="pointer-events-none absolute inset-0 grid grid-cols-[auto_1fr_auto] p-3 text-[0.58rem] tracking-[0.14em] uppercase">
              <div className="space-y-3 text-[var(--muted)]">
                <Stat label="Input Nodes" value={stats.inputNodes} />
                <Stat label="Active Paths" value={stats.activePaths} />
                <Stat label="Convergence" value={`${stats.convergence}%`} />
              </div>
              <div />
              <div className="space-y-16 text-right text-[var(--muted)]">
                <p>Spatial Connections</p>
                <p className="pt-10">Emergent Geometry</p>
              </div>
              <p className="col-span-1 self-end text-[var(--muted)]">
                Programmatic Relationships
              </p>
              <p className="col-span-2 self-end text-right text-[var(--muted)]">
                Optimized Pathways
              </p>
            </div>
          </div>
          <div className="flex items-center justify-between border-t border-[rgba(0,228,255,0.16)] px-3 py-2 text-[0.62rem] tracking-[0.14em] uppercase text-[var(--muted)]">
            <span>Physarum interpreting criteria · generating spatial logic</span>
            <span>Iteration {String(iteration).padStart(2, "0")}</span>
          </div>
        </Panel>

        <div className="flex min-h-0 flex-col gap-2">
          <Panel className="flex min-h-0 flex-[1.15] flex-col">
            <PanelHeader
              kicker="Architectural Output"
              title="Generated From Emergent Logic"
            />
            <div className="mb-1 flex items-center justify-between text-[0.62rem] tracking-[0.16em] uppercase text-[var(--cyan)]">
              <span className="inline-flex items-center gap-1.5">
                <IconSection /> 2D Wall Section
              </span>
              <span className="text-[var(--muted)]">v1.0</span>
            </div>
            <div className="min-h-[9rem] flex-1 border border-[rgba(0,228,255,0.16)] bg-[#071018]">
              <SectionDrawing ratings={ratings} title={archetype.name} />
            </div>
          </Panel>

          <Panel className="flex min-h-0 flex-1 flex-col">
            <div className="mb-1 flex items-center justify-between text-[0.62rem] tracking-[0.16em] uppercase text-[var(--cyan)]">
              <span className="inline-flex items-center gap-1.5">
                <IconModel /> 2.5D Model
              </span>
              <span className="text-[var(--muted)]">v1.0</span>
            </div>
            <div className="min-h-[8rem] flex-1 border border-[rgba(0,228,255,0.16)] bg-[#071018]">
              <AxonModel ratings={ratings} />
            </div>
          </Panel>

          <Panel>
            <p className="eyebrow mb-2">Evaluation</p>
            <div className="space-y-1.5">
              <FitBar label="Formal" value={fit.formal} />
              <FitBar label="Spatial" value={fit.spatial} />
              <FitBar label="Atmospheric" value={fit.atmospheric} />
            </div>
            <p className="mt-2 text-[0.62rem] tracking-[0.12em] uppercase text-[var(--muted)]">
              Criteria fit {Math.round(fit.overall * 100)}% versus precedent ratings
            </p>
          </Panel>

          <Panel>
            <PanelHeader title="Iteration Controls" />
            <div className="grid grid-cols-3 gap-1.5">
              <button
                type="button"
                onClick={regenerate}
                className="border border-[var(--orange)] bg-[rgba(255,122,50,0.14)] px-2 py-2 text-[0.62rem] tracking-[0.12em] uppercase text-[var(--orange-hot)] hover:bg-[rgba(255,122,50,0.22)]"
              >
                Regenerate
              </button>
              <button
                type="button"
                onClick={() => {
                  setFocus("Criteria");
                  pulse("Adjust Formal, Spatial, or Atmospheric ratings");
                }}
                className="border border-[var(--cyan-dim)] px-2 py-2 text-[0.62rem] tracking-[0.12em] uppercase text-[var(--cyan)] hover:bg-[rgba(0,228,255,0.08)]"
              >
                Adjust Criteria
              </button>
              <button
                type="button"
                onClick={saveIteration}
                className="border border-[var(--cyan-dim)] px-2 py-2 text-[0.62rem] tracking-[0.12em] uppercase text-[var(--cyan)] hover:bg-[rgba(0,228,255,0.08)]"
              >
                Save Iteration
              </button>
            </div>
            <p className="mt-2 text-center text-[0.58rem] tracking-[0.18em] uppercase text-[var(--muted)]">
              Maria Alonso · Julieta Segura · Renata Maglino
            </p>
          </Panel>
        </div>
      </div>

      <footer className="mt-2 flex flex-wrap items-center justify-between gap-2 px-1 text-[0.58rem] tracking-[0.16em] uppercase text-[var(--muted)]">
        <span>Design 7 Prof. Daniel Bolojan</span>
        <span>
          {saved > 0 ? `${saved} saved · ` : ""}
          {archetype.name} / {typology.label}
        </span>
      </footer>

      {notice ? (
        <div className="pointer-events-none fixed bottom-4 left-1/2 z-20 -translate-x-1/2 border border-[var(--cyan)] bg-[var(--panel-strong)] px-4 py-2 text-[0.7rem] tracking-[0.16em] uppercase text-[var(--cyan-hot)]">
          {notice}
        </div>
      ) : null}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <p>{label}</p>
      <p className="text-[1.05rem] text-white">{value}</p>
    </div>
  );
}

function FitBar({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="mb-0.5 flex justify-between text-[0.58rem] tracking-[0.16em] uppercase text-[var(--muted)]">
        <span>{label}</span>
        <span>{Math.round(value * 100)}%</span>
      </div>
      <div className="h-1 bg-[rgba(0,228,255,0.12)]">
        <div
          className="h-1 bg-[linear-gradient(90deg,var(--cyan),var(--orange))]"
          style={{ width: `${Math.round(value * 100)}%` }}
        />
      </div>
    </div>
  );
}
