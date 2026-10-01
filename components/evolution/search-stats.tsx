"use client";

import { MetricInfo, type ExplainSection } from "@/components/evolution/metric-info";
import { archiveTurnover } from "@/lib/skill2/pareto-analytics";
import type { EvolutionCandidateView, EvolutionGenerationView } from "@/lib/skill2/evolution-index";

type Tone = "cyan" | "orange" | "muted";

type Slice = {
  id: string;
  label: string;
  value: number;
  tone: Tone;
};

const EXPLANATIONS: Record<string, ExplainSection[]> = {
  archive: [
    {
      label: "Measures",
      text: "Two counts for every generation. Cyan is the unweighted archive after that generation. Orange is how many of that generation’s candidates sit on its own front.",
    },
    {
      label: "Why it matters",
      text: "The archive is what the search keeps for this archetype. The front is what that generation just produced. Together they show whether the run is accumulating alternatives or mostly repeating an earlier set.",
    },
    {
      label: "How to read it",
      text: "All generations stay visible. The bright pair is the generation the note, the rings, and the large morphology are describing. The archive can outgrow the front because it carries members from earlier generations. A front taller than the archive means this generation’s non-dominated set is larger than the set still kept.",
    },
    {
      label: "Method",
      text: "Archive height is the number of ids in the archive snapshot saved after the generation. Front height is the number of rank-1 candidates in that generation. Both bars are scaled to the larger of those two maxima in the run.",
    },
  ],
  population: [
    {
      label: "Measures",
      text: "How the evaluated candidates of each generation split: on that generation’s front, feasible but off the front, and infeasible.",
    },
    {
      label: "Why it matters",
      text: "A completed generation is always the full population. This split says whether that population produced a broad front or a few non-dominated candidates among many dominated ones.",
    },
    {
      label: "How to read it",
      text: "Each ring is one generation, with its id in the center. The bright ring is selected. Orange is the front, cyan is feasible and dominated, and gray is infeasible. The line under the rings is the selected generation’s counts.",
    },
    {
      label: "Method",
      text: "Front is the generation’s Pareto count. Infeasible is evaluated minus feasible. Off front is what remains.",
    },
  ],
  origin: [
    {
      label: "Measures",
      text: "Where each generation’s candidates came from: new genomes with no parent, offspring that improved on their parent, and the other offspring.",
    },
    {
      label: "Why it matters",
      text: "The first generation is a sample of the translation. Later generations are meant to vary what the archive already holds. This shows whether the population is still new draws or children, and whether those children actually improved.",
    },
    {
      label: "How to read it",
      text: "Each ring is one generation. Cyan is new samples. Orange is offspring that are worse in no objective and better in at least one. Gray is the other offspring. A cyan ring is a generation with no parents. The line under the rings also counts how many offspring entered the archive.",
    },
    {
      label: "Method",
      text: "A candidate with no parent is new. An offspring improves its parent when no Formal, Spatial, or Atmospheric score is worse and at least one is strictly better. Entered means the offspring’s id is in the archive snapshot of the generation in which it was born.",
    },
  ],
};

const RADIUS = 15.5;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

function ringArcs(slices: Slice[]) {
  const total = slices.reduce((sum, slice) => sum + slice.value, 0);
  const drawn = slices.filter((slice) => slice.value > 0);
  const gap = drawn.length > 1 ? 1.15 : 0;
  let cursor = 0;
  return drawn.map((slice) => {
    const share = total === 0 ? 0 : (slice.value / total) * CIRCUMFERENCE;
    const length = Math.max(0, share - gap);
    const arc = { ...slice, length, offset: cursor };
    cursor += share;
    return arc;
  });
}

function Ring({
  id,
  title,
  slices,
  pressed,
  onSelect,
}: {
  id: string;
  title: string;
  slices: Slice[];
  pressed: boolean;
  onSelect: () => void;
}) {
  const arcs = ringArcs(slices);
  return (
    <button type="button" className="evo-ring" aria-pressed={pressed} aria-label={`${id} ${title}`} onClick={onSelect}>
      <span className="evo-ring-plot">
        <svg viewBox="0 0 42 42" aria-hidden="true">
          <circle className="evo-donut-track" cx="21" cy="21" r={RADIUS} />
          {arcs.map((arc) => (
            <circle
              key={arc.id}
              cx="21"
              cy="21"
              r={RADIUS}
              data-tone={arc.tone}
              strokeDasharray={`${arc.length} ${CIRCUMFERENCE - arc.length}`}
              strokeDashoffset={-arc.offset}
            />
          ))}
        </svg>
        <span className="evo-ring-id">{id}</span>
      </span>
    </button>
  );
}

function generationNote(generation: EvolutionGenerationView, previous: EvolutionGenerationView | undefined) {
  const front = `${generation.pareto} on the front`;
  const archive = `${generation.archived} in the archive`;
  if (!previous) return `${generation.id} · ${front} · ${archive} · archive opened`;
  const turnover = archiveTurnover(previous.archiveIds, generation.archiveIds, previous.index, generation.index);
  return `${generation.id} · ${front} · ${archive} · ${turnover.retained} retained · ${turnover.entrants} entered · ${turnover.displaced} displaced`;
}

export function SearchStats({
  generations,
  candidates,
  selectedIndex,
  onSelect,
}: {
  generations: EvolutionGenerationView[];
  candidates: EvolutionCandidateView[];
  selectedIndex: number | null;
  onSelect: (index: number) => void;
}) {
  const completed = generations.filter((generation) => generation.status === "done");
  const selected = completed.find((generation) => generation.index === selectedIndex) ?? completed[completed.length - 1] ?? null;
  const max = Math.max(1, ...completed.map((generation) => Math.max(generation.archived, generation.pareto)));
  const byId = new Map(candidates.map((candidate) => [candidate.id, candidate]));
  const origin = (generation: EvolutionGenerationView | null) => {
    const cohort = generation ? candidates.filter((candidate) => candidate.generation === generation.index) : [];
    const archiveIds = new Set(generation?.archiveIds ?? []);
    let offspring = 0;
    let improved = 0;
    let entered = 0;
    for (const candidate of cohort) {
      if (candidate.parentId == null) continue;
      offspring += 1;
      if (archiveIds.has(candidate.id)) entered += 1;
      const parent = byId.get(candidate.parentId);
      if (!parent) continue;
      const worse =
        candidate.formal < parent.formal || candidate.spatial < parent.spatial || candidate.atmospheric < parent.atmospheric;
      const better =
        candidate.formal > parent.formal || candidate.spatial > parent.spatial || candidate.atmospheric > parent.atmospheric;
      if (!worse && better) improved += 1;
    }
    return { explorers: cohort.length - offspring, offspring, improved, entered };
  };

  if (!selected) {
    return <p className="evo-empty">Statistics appear here after a generation of this archetype is saved.</p>;
  }

  const population = (generation: EvolutionGenerationView): Slice[] => {
    const infeasible = Math.max(0, generation.evaluated - generation.feasible);
    const offFront = Math.max(0, generation.evaluated - generation.pareto - infeasible);
    return [
      { id: "front", label: "Front", value: generation.pareto, tone: "orange" },
      { id: "off", label: "Off front", value: offFront, tone: "cyan" },
      { id: "infeasible", label: "Infeasible", value: infeasible, tone: "muted" },
    ];
  };
  const previous = completed.find((generation) => generation.index === selected.index - 1);
  const pinned = origin(selected);
  const selectedPopulation = population(selected);

  return (
    <div className="evo-run-stats">
      <section className="evo-diagram">
      <div className="evo-diagram-title">
        <p className="evo-ring-title">Front and archive</p>
        <MetricInfo label="Front and archive" sections={EXPLANATIONS.archive} />
      </div>
      <div className="evo-run" role="group" aria-label="Generations in this run">
        {completed.map((generation) => (
          <button
            key={generation.id}
            type="button"
            aria-pressed={generation.index === selected.index}
            onClick={() => onSelect(generation.index)}
          >
            <span className="evo-run-pair" aria-hidden="true">
              <span className="evo-run-bar" data-tone="archive" style={{ height: `${(generation.archived / max) * 100}%` }} />
              <span className="evo-run-bar" data-tone="front" style={{ height: `${(generation.pareto / max) * 100}%` }} />
            </span>
            <span className="evo-run-label">{generation.id}</span>
          </button>
        ))}
      </div>
      <p className="evo-run-key">
        <span data-tone="front">Front</span>
        <span data-tone="archive">Archive</span>
      </p>
      <p className="evo-run-note">{generationNote(selected, previous)}</p>
      </section>
      <section className="evo-diagram evo-ring-block">
        <div className="evo-diagram-title">
          <p className="evo-ring-title">Population</p>
          <MetricInfo label="Population" sections={EXPLANATIONS.population} />
        </div>
        <div className="evo-rings" role="group" aria-label="Population by generation">
          {completed.map((generation) => (
            <Ring
              key={generation.id}
              id={generation.id}
              title="population"
              slices={population(generation)}
              pressed={generation.index === selected.index}
              onSelect={() => onSelect(generation.index)}
            />
          ))}
        </div>
        <p className="evo-run-key">
          <span className="evo-gen-id">{selected.id}</span>
          {selectedPopulation.map((slice) => (
            <span key={slice.id} data-tone={slice.tone}>
              {slice.label} {slice.value}
            </span>
          ))}
        </p>
      </section>
      <section className="evo-diagram evo-ring-block">
        <div className="evo-diagram-title">
          <p className="evo-ring-title">Origin</p>
          <MetricInfo label="Origin" sections={EXPLANATIONS.origin} />
        </div>
        <div className="evo-rings" role="group" aria-label="Origin by generation">
          {completed.map((generation) => {
            const mix = origin(generation);
            return (
              <Ring
                key={generation.id}
                id={generation.id}
                title="origin"
                pressed={generation.index === selected.index}
                onSelect={() => onSelect(generation.index)}
                slices={[
                  { id: "new", label: "New", value: mix.explorers, tone: "cyan" },
                  { id: "improved", label: "Improved", value: mix.improved, tone: "orange" },
                  { id: "other", label: "Other", value: Math.max(0, mix.offspring - mix.improved), tone: "muted" },
                ]}
              />
            );
          })}
        </div>
        <p className="evo-run-note">
          {pinned.offspring === 0
            ? `${selected.id} is a sample of new genomes.`
            : `${selected.id} · ${pinned.offspring} offspring · ${pinned.improved} improved on their parent · ${pinned.entered} entered the archive`}
        </p>
      </section>
    </div>
  );
}
