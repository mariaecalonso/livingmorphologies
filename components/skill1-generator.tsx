"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Skill1ArchitectureSection,
  Skill1Longitudinal,
  Skill1SectionView,
  Skill1Timeline,
} from "@/components/skill1-viz";
import { findArchetype, findTypology } from "@/lib/catalog";
import { mulberry32 } from "@/lib/physarum";
import { PROTOTYPE_ARCHETYPE_IDS } from "@/lib/skill1/archetypes";
import {
  captureSnapshot,
  createSimulation,
  stepMany,
} from "@/lib/skill1/engine";
import {
  DEFAULT_AGENT_COUNT,
  DEFAULT_DENSITY,
  DISPLAY_ITERATIONS,
  FIELD_SIZE,
  MAX_AGENT_COUNT,
  MAX_DENSITY,
  MIN_AGENT_COUNT,
  MIN_DENSITY,
  SECTION_HEIGHT,
  SNAPSHOT_ITERATIONS,
} from "@/lib/skill1/maps";
import { buildSectionModel, snapshotFromState } from "@/lib/skill1/section-view";
import { translateArchetype } from "@/lib/skill1/translate";
import type { FieldSnapshot, SimulationState, VizSettings } from "@/lib/skill1/types";
import type { GroupId } from "@/lib/types";

const GROUP_TITLE: Record<GroupId, string> = {
  formal: "Formal",
  spatial: "Spatial",
  atmospheric: "Atmospheric",
};

function sourceLabel(corner: string) {
  if (corner === "bottom-left") return "Bottom left";
  if (corner === "bottom-right") return "Bottom right";
  return corner.replace("-", " ");
}

function collectSnapshots(
  existing: Partial<Record<number, FieldSnapshot>>,
  state: SimulationState,
) {
  const next = { ...existing };
  for (const mark of SNAPSHOT_ITERATIONS) {
    if (next[mark]) continue;
    if (state.iteration >= mark) next[mark] = captureSnapshot(state);
  }
  return next;
}

export function Skill1Generator() {
  const [archetypeId, setArchetypeId] = useState<string>(PROTOTYPE_ARCHETYPE_IDS[0]);
  const [run, setRun] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [state, setState] = useState<SimulationState | null>(null);
  const [snapshots, setSnapshots] = useState<Partial<Record<number, FieldSnapshot>>>({});
  const [viz, setViz] = useState<VizSettings>({
    agentCount: DEFAULT_AGENT_COUNT,
    density: DEFAULT_DENSITY,
    speed: 3,
    trailDecay: 0.986,
    showField: true,
    showAgents: true,
    showTrails: true,
    showAttraction: true,
  });
  const translation = useMemo(() => translateArchetype(archetypeId), [archetypeId]);
  const typology = findTypology("gathering");
  const archetype = findArchetype(typology, translation.archetypeId);
  const rngRef = useRef<() => number>(() => 0.5);
  const translationRef = useRef(translation);
  const vizRef = useRef(viz);
  const snapshotsRef = useRef(snapshots);

  useEffect(() => {
    translationRef.current = translation;
  }, [translation]);

  useEffect(() => {
    vizRef.current = viz;
  }, [viz]);

  useEffect(() => {
    snapshotsRef.current = snapshots;
  }, [snapshots]);

  const seedFor = (id: string, nextRun: number) =>
    (0x51c11 ^ (nextRun * 9973) ^ id.length * 131) >>> 0;

  const seed = seedFor(archetypeId, run);

  useEffect(() => {
    if (!playing) return;
    const id = window.setInterval(() => {
      setState((current) => {
        if (!current || current.converged) return current;
        const settings = vizRef.current;
        const next = stepMany(
          current,
          translationRef.current,
          rngRef.current,
          settings.speed,
          settings.trailDecay,
        );
        const marks = collectSnapshots(snapshotsRef.current, next);
        snapshotsRef.current = marks;
        if (next.converged) window.setTimeout(() => setPlaying(false), 0);
        return { ...next };
      });
      setSnapshots({ ...snapshotsRef.current });
    }, 50);
    return () => window.clearInterval(id);
  }, [playing]);

  const generate = (id = archetypeId, nextRun = run) => {
    const nextSeed = seedFor(id, nextRun);
    const nextTranslation = translateArchetype(id);
    rngRef.current = mulberry32(nextSeed ^ 0x9e3779b9);
    translationRef.current = nextTranslation;
    const sim = createSimulation(nextTranslation, nextSeed, vizRef.current.agentCount);
    sim.maxIterations = DISPLAY_ITERATIONS;
    const first = captureSnapshot(sim);
    const initial = { 0: first };
    snapshotsRef.current = initial;
    setSnapshots(initial);
    setState(sim);
    setPlaying(true);
  };

  const reset = () => {
    setPlaying(false);
    setState(null);
    snapshotsRef.current = {};
    setSnapshots({});
  };

  const regenerate = () => {
    const next = run + 1;
    setRun(next);
    generate(archetypeId, next);
  };

  const selectArchetype = (id: string) => {
    setArchetypeId(id);
    setRun(0);
    setPlaying(false);
    setState(null);
    snapshotsRef.current = {};
    setSnapshots({});
  };

  const liveSnapshot = useMemo(
    () => (state ? snapshotFromState(state) : null),
    [state],
  );
  const sectionModel = useMemo(
    () => (liveSnapshot ? buildSectionModel(liveSnapshot, translation) : null),
    [liveSnapshot, translation],
  );
  const iteration = state?.iteration ?? 0;
  const recipe = translation.recipe;
  const behavior = translation.behavior;

  return (
    <div className="flex min-h-dvh flex-col bg-[#05080d] px-2 py-2 text-[13px] md:px-3 md:py-2.5">
      <header className="mb-2 border border-[rgba(0,228,255,0.16)] bg-[#071018] px-3 py-2">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="eyebrow">Living Morphologies · Skill 1</p>
            <h1 className="display mt-1 text-[1.02rem] text-white cyan-glow md:text-[1.18rem]">
              Physarum Architectural Generator
            </h1>
            <p className="mt-1 text-[0.62rem] uppercase tracking-[0.18em] text-[var(--muted)]">
              {translation.archetypeName} — Iteration {String(iteration).padStart(3, "0")}
              {state?.converged ? " · converged" : playing ? " · running" : ""}
            </p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <p className="eyebrow">Architecture / Biology / Emergence</p>
            <span className="border border-[var(--cyan)] bg-[rgba(0,228,255,0.12)] px-4 py-1.5 text-[0.72rem] tracking-[0.22em] uppercase text-[var(--cyan-hot)]">
              Gathering
            </span>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          {PROTOTYPE_ARCHETYPE_IDS.map((id) => {
            const item = translateArchetype(id);
            const active = id === archetypeId;
            return (
              <button
                key={id}
                type="button"
                onClick={() => selectArchetype(id)}
                className={`border px-3 py-2 text-left text-[0.68rem] tracking-[0.14em] uppercase transition ${
                  active
                    ? "border-[var(--orange)] bg-[rgba(255,122,50,0.14)] text-[var(--orange-hot)]"
                    : "border-[rgba(0,228,255,0.18)] text-[var(--muted)] hover:text-[var(--text)]"
                }`}
              >
                {item.archetypeName}
              </button>
            );
          })}
          <div className="ml-auto flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => generate(archetypeId, run)}
              className="border border-[var(--orange)] bg-[rgba(255,122,50,0.14)] px-3 py-2 text-[0.62rem] tracking-[0.12em] uppercase text-[var(--orange-hot)] hover:bg-[rgba(255,122,50,0.22)]"
            >
              Generate
            </button>
            <button
              type="button"
              onClick={reset}
              className="border border-[var(--cyan-dim)] px-3 py-2 text-[0.62rem] tracking-[0.12em] uppercase text-[var(--cyan)] hover:bg-[rgba(0,228,255,0.08)]"
            >
              Reset
            </button>
            <button
              type="button"
              onClick={regenerate}
              className="border border-[var(--cyan-dim)] px-3 py-2 text-[0.62rem] tracking-[0.12em] uppercase text-[var(--cyan)] hover:bg-[rgba(0,228,255,0.08)]"
            >
              Regenerate
            </button>
          </div>
        </div>
      </header>

      <Skill1Timeline snapshots={snapshots} currentIteration={iteration} density={viz.density} />

      <div className="mt-2 grid min-h-0 flex-1 grid-cols-1 gap-2 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)_minmax(19rem,24rem)]">
        <section className="flex min-h-[22rem] flex-col border border-[rgba(0,228,255,0.16)] bg-[#071018]">
          <header className="flex items-start justify-between gap-3 px-3 pt-3">
            <div>
              <p className="eyebrow">Section view — emergent field</p>
              <h2 className="panel-title cyan-glow mt-1">Iteration {iteration}</h2>
            </div>
            <p className="text-[0.58rem] uppercase tracking-[0.14em] text-[var(--muted)]">
              {FIELD_SIZE} × {FIELD_SIZE} × {SECTION_HEIGHT}
            </p>
          </header>
          <div className="relative min-h-[20rem] w-full flex-1">
            <Skill1SectionView snapshot={liveSnapshot} translation={translation} model={sectionModel} />
          </div>
        </section>

        <section className="flex min-h-[22rem] flex-col border border-[rgba(0,228,255,0.16)] bg-[#071018]">
          <header className="px-3 pt-3">
            <p className="eyebrow">Section render — architectural interpretation</p>
            <h2 className="panel-title cyan-glow mt-1">Generated from the final network</h2>
          </header>
          <div className="relative min-h-[20rem] w-full flex-1">
            <Skill1ArchitectureSection
              snapshot={liveSnapshot}
              translation={translation}
              model={sectionModel}
            />
          </div>
        </section>

        <aside className="flex min-h-0 flex-col border border-[rgba(0,228,255,0.16)] bg-[#071018]">
          <div className="instrument-scroll min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-3">
            <div>
              <p className="eyebrow">Archetype</p>
              <h2 className="display mt-1 text-[1.05rem] text-white">{translation.archetypeName}</h2>
              <p className="mt-1 text-[0.68rem] text-[var(--muted)]">{typology.definition}</p>
            </div>

            <div>
              <p className="eyebrow mb-1.5">Descriptors</p>
              <dl className="space-y-1 text-[0.68rem] uppercase tracking-[0.08em]">
                {(Object.keys(GROUP_TITLE) as GroupId[]).map((group) => (
                  <div key={group} className="flex items-baseline justify-between gap-3">
                    <dt className="text-[var(--muted)]">{GROUP_TITLE[group]}</dt>
                    <dd className="text-right text-[var(--text)]">{translation.descriptors[group]}</dd>
                  </div>
                ))}
              </dl>
            </div>

            <div>
              <p className="eyebrow mb-1.5">Biological behavior</p>
              <dl className="space-y-1 text-[0.68rem] uppercase tracking-[0.08em]">
                <BehaviorRow label="Exploration" value={behavior.exploration} />
                <BehaviorRow label="Attraction" value={behavior.attraction} />
                <BehaviorRow label="Trail following" value={behavior.trailFollowing} />
                <BehaviorRow label="Reinforcement" value={behavior.reinforcement} />
                <BehaviorRow label="Decay" value={behavior.decay} />
              </dl>
            </div>

            <CriteriaRanking translation={translation} />

            <div>
              <p className="eyebrow mb-1.5">Simulation settings</p>
              <dl className="space-y-1 text-[0.68rem] uppercase tracking-[0.08em]">
                <SettingRow label="Agents" value={String(viz.agentCount)} />
                <SettingRow label="Density" value={String(viz.density)} />
                <SettingRow
                  label="Field size"
                  value={`${FIELD_SIZE} × ${FIELD_SIZE} × ${SECTION_HEIGHT}`}
                />
                <SettingRow label="Source" value={sourceLabel(recipe.sourceCorner)} />
                <SettingRow
                  label="Attractor"
                  value={`Center (${recipe.attractor.x}, ${recipe.attractor.y})`}
                />
                <SettingRow label="Randomness" value={behavior.randomness} />
                <SettingRow label="Iterations" value={String(DISPLAY_ITERATIONS)} />
                <SettingRow label="Seed" value={seed.toString(16)} />
              </dl>
              <label className="mt-2 flex flex-col gap-1 text-[0.58rem] uppercase tracking-[0.12em] text-[var(--muted)]">
                Agents {viz.agentCount}
                <input
                  className="range-hud"
                  type="range"
                  min={MIN_AGENT_COUNT}
                  max={MAX_AGENT_COUNT}
                  step={1}
                  value={viz.agentCount}
                  onChange={(event) =>
                    setViz((current) => ({
                      ...current,
                      agentCount: Number(event.target.value),
                    }))
                  }
                />
              </label>
              <label className="mt-2 flex flex-col gap-1 text-[0.58rem] uppercase tracking-[0.12em] text-[var(--muted)]">
                Density {viz.density}
                <input
                  className="range-hud"
                  type="range"
                  min={MIN_DENSITY}
                  max={MAX_DENSITY}
                  step={1}
                  value={viz.density}
                  onChange={(event) =>
                    setViz((current) => ({
                      ...current,
                      density: Number(event.target.value),
                    }))
                  }
                />
              </label>
              <label className="mt-2 flex flex-col gap-1 text-[0.58rem] uppercase tracking-[0.12em] text-[var(--muted)]">
                Speed {viz.speed}
                <input
                  className="range-hud"
                  type="range"
                  min={1}
                  max={8}
                  step={1}
                  value={viz.speed}
                  onChange={(event) =>
                    setViz((current) => ({
                      ...current,
                      speed: Number(event.target.value),
                    }))
                  }
                />
              </label>
            </div>

            <div>
              <p className="eyebrow mb-1.5">Visual legend</p>
              <ul className="space-y-1 text-[0.62rem] uppercase tracking-[0.1em] text-[var(--muted)]">
                <LegendDot color="#ffe45a" label="Strong trail / path" />
                <LegendDot color="#b4d046" label="Secondary path" />
                <LegendDot color="#3f6a4a" label="Weak path" />
                <LegendDot color="#fff3b0" label="Agent" />
                <LegendDot color="#78e6ff" label="Source" ring />
                <LegendDot color="#ffd646" label="Attractor" />
              </ul>
            </div>

            <div>
              <p className="eyebrow mb-1.5">Architectural layers</p>
              <ul className="space-y-1 text-[0.62rem] uppercase tracking-[0.1em] text-[var(--muted)]">
                {translation.topology === "around-absence" ? (
                  <>
                    <LegendDot color="#d6d6d2" label="Mass / built form" />
                    <LegendDot color="#0b0d10" label="Void / open space" />
                    <LegendDot color="#6f7a80" label="Transition / circulation" />
                  </>
                ) : (
                  <>
                    <LegendDot color="#b0764e" label="Mass / outer volume" />
                    <LegendDot color="#f0a45a" label="Contained room" />
                    <LegendDot color="#6f7a80" label="Transition / circulation" />
                  </>
                )}
              </ul>
            </div>
          </div>
        </aside>
      </div>

      <section className="mt-2 border border-[rgba(0,228,255,0.16)] bg-[#071018]">
        <header className="flex items-center justify-between px-3 pt-2">
          <p className="eyebrow">Longitudinal section</p>
          <p className="text-[0.58rem] uppercase tracking-[0.14em] text-[var(--muted)]">
            Seed {seed.toString(16)} · {archetype.name}
          </p>
        </header>
        <div className="h-28 w-full md:h-32">
          <Skill1Longitudinal snapshot={liveSnapshot} translation={translation} model={sectionModel} />
        </div>
      </section>
    </div>
  );
}

function CriteriaRanking({
  translation,
}: {
  translation: ReturnType<typeof translateArchetype>;
}) {
  const groups: GroupId[] = ["formal", "spatial", "atmospheric"];
  return (
    <div>
      <p className="eyebrow mb-1.5">Criteria → agent behavior</p>
      <p className="mb-2 text-[0.62rem] leading-relaxed text-[var(--muted)]">
        Each catalog criterion is ranked Low / Medium / High against its descriptor set, then mapped to agent behavior.
      </p>
      <div className="space-y-3">
        {groups.map((group) => {
          const rows = translation.rankings
            .filter((row) => row.category === group)
            .sort((a, b) => b.rating - a.rating);
          return (
            <div key={group} className="border border-[rgba(0,228,255,0.12)] px-2 py-2">
              <p className="text-[0.58rem] uppercase tracking-[0.16em] text-[var(--muted)]">
                {GROUP_TITLE[group]}
              </p>
              <p className="mt-0.5 text-[0.72rem] uppercase tracking-[0.08em] text-[var(--text)]">
                {translation.descriptors[group]}
              </p>
              <ul className="mt-1.5 space-y-1.5">
                {rows.map((row) => (
                  <li key={row.criterionId} className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-[0.62rem] uppercase tracking-[0.08em] text-[var(--text)]">
                        {row.criterion}
                      </p>
                      <p className="text-[0.58rem] normal-case tracking-normal text-[var(--muted)]">
                        {row.biologicalLabel}
                      </p>
                    </div>
                    <span className={`shrink-0 text-[0.62rem] uppercase ${rankClass(row.ratingLabel)}`}>
                      {row.ratingLabel}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function rankClass(label: string) {
  if (label === "High") return "text-[var(--orange-hot)]";
  if (label === "Medium") return "text-[var(--cyan-hot)]";
  return "text-[var(--muted)]";
}

function BehaviorRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-[var(--muted)]">{label}</dt>
      <dd className={rankClass(value === "controlled" ? "Medium" : value)}>{value}</dd>
    </div>
  );
}

function SettingRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-[var(--muted)]">{label}</dt>
      <dd className="text-right text-[var(--text)]">{value}</dd>
    </div>
  );
}

function LegendDot({
  color,
  label,
  ring = false,
}: {
  color: string;
  label: string;
  ring?: boolean;
}) {
  return (
    <li className="flex items-center gap-2">
      <span
        className="inline-block h-2.5 w-2.5 rounded-full"
        style={
          ring
            ? { boxShadow: `0 0 0 1.5px ${color} inset`, background: "transparent" }
            : { background: color }
        }
      />
      {label}
    </li>
  );
}
