"use client";

import { useState, type ReactNode } from "react";
import { useViewMode } from "@/components/view-mode";
import { formatMatch } from "@/components/evolution/format-match";
import { MetricInfo, type ExplainSection } from "@/components/evolution/metric-info";
import type { GenerationAnalytics, Turnover, TurnoverKind } from "@/lib/skill2/pareto-analytics";

const formatGeneration = (index: number) => `G${String(index).padStart(2, "0")}`;
const formatNumber = (value: number | null | undefined, digits = 2) => (value == null ? "—" : value.toFixed(digits));

type Membership = { generation: number; kind: TurnoverKind } | null;

type Props = {
  series: GenerationAnalytics[];
  turnovers: Turnover[];
  focus: number | null;
  membership: Membership;
  onFocus: (index: number | null) => void;
  onPick: (index: number) => void;
  onMembership: (generation: number, kind: TurnoverKind, ids: number[]) => void;
};

function domain(values: number[], floor: boolean) {
  if (values.length === 0) return { min: 0, max: 1 };
  let min = Math.min(...values);
  let max = Math.max(...values);
  const span = Math.max(max - min, 1e-6);
  if (floor) {
    min = 0;
    max += span * 0.12;
  } else {
    const pad = Math.max(span * 0.45, 0.0015);
    min = Math.max(0, min - pad);
    max += pad;
  }
  return { min, max };
}

function slotX(index: number, count: number) {
  return count <= 1 ? 50 : 14 + (index * 72) / (count - 1);
}

function valueY(value: number, min: number, max: number) {
  const span = max - min || 1;
  return 30 - ((value - min) / span) * 24;
}

const EXPLANATIONS: Record<string, ExplainSection[]> = {
  hypervolume: [
    {
      label: "Measures",
      text: "How much of the Formal × Spatial × Atmospheric unit cube the unweighted archive covers after each generation.",
    },
    {
      label: "Why it matters",
      text: "It is a single measure of whether the non-dominated set has moved into a stronger region of objective space.",
    },
    {
      label: "How to read it",
      text: "A rise means the archive reaches farther from the origin. It does not mean every objective improved. The axis is tightened around the observed values so a small rise stays visible; the number is the actual volume.",
    },
    {
      label: "Method",
      text: "Three-objective hypervolume for maximization, with a fixed reference at (0, 0, 0). The volume is the union of the boxes from that point to each archive member. Duplicate and dominated vectors add nothing.",
    },
  ],
  progression: [
    {
      label: "Measures",
      text: "The median Formal, Spatial, and Atmospheric match of each generation’s unweighted archive. The wash behind a line is that objective’s lowest to highest archive member.",
    },
    {
      label: "Why it matters",
      text: "Medians describe the archive as a set. The single best candidate would overstate how the search is moving.",
    },
    {
      label: "How to read it",
      text: "The three scores are not expected to rise together. A median can fall while hypervolume rises, when the front trades one objective for another. A wider wash means that objective is more spread across the archive.",
    },
    {
      label: "Method",
      text: "Median of the saved archive. With an even count, the two central values are averaged.",
    },
  ],
  turnover: [
    {
      label: "Measures",
      text: "Who stayed in the unweighted archive, who entered, and who was displaced since the previous generation.",
    },
    {
      label: "Why it matters",
      text: "It shows whether later generations are changing the tradeoff set, rather than repeating the first archive.",
    },
    {
      label: "How to read it",
      text: "Entered members are new non-dominated solutions. Displaced members were removed because a newer candidate dominated them. A large retained share means the front is stable. Click a point to highlight those candidates in the objective space.",
    },
    {
      label: "Method",
      text: "Set difference of the archive id lists saved after each generation. Mutant success, when shown with the chart, is the share of offspring that are worse in no objective and better in at least one, and the share that appear in the archive of the generation in which they were born.",
    },
  ],
  spread: [
    {
      label: "Measures",
      text: "How widely the unweighted archive is spread. Solid lines are each objective’s range. Neighbor is how close archive members sit to one another.",
    },
    {
      label: "Why it matters",
      text: "A search can raise hypervolume while collapsing the front into one tight cluster. Spread checks that variation remains.",
    },
    {
      label: "How to read it",
      text: "Ranges or neighbor distance falling toward zero means the archive is bunching. A steady spread with rising hypervolume means the front is moving without collapsing.",
    },
    {
      label: "Method",
      text: "Range is maximum minus minimum on that objective. Neighbor is the mean Euclidean distance from each archive member to its nearest other member. It is omitted when the archive has fewer than two members.",
    },
  ],
};

function ChartFrame({
  title,
  info,
  note,
  onLeave,
  children,
}: {
  title: string;
  info: ReactNode;
  note: string;
  onLeave: () => void;
  children: ReactNode;
}) {
  return (
    <article className="pareto-chart" onMouseLeave={onLeave}>
      <header className="pareto-chart-head">
        <div className="pareto-chart-title">
          <h3>{title}</h3>
          {info}
        </div>
        <p>{note}</p>
      </header>
      {children}
    </article>
  );
}

function FocusRule({ count, focusIndex }: { count: number; focusIndex: number }) {
  if (focusIndex < 0) return null;
  const x = slotX(focusIndex, count);
  return <line className="pareto-chart-rule" x1={x} x2={x} y1={3} y2={30} />;
}

function GenerationHits({
  generations,
  focus,
  onFocus,
  onPick,
}: {
  generations: number[];
  focus: number | null;
  onFocus: (index: number | null) => void;
  onPick: (index: number) => void;
}) {
  if (generations.length === 0) return null;
  return (
    <>
      {generations.map((generation, index) => {
        return (
          <rect
            key={generation}
            x={slotX(index, generations.length) - 8}
            y={0}
            width={16}
            height={36}
            className="pareto-chart-hit"
            data-hot={focus === generation || undefined}
            onMouseEnter={() => onFocus(generation)}
            onMouseLeave={() => onFocus(null)}
            onClick={() => onPick(generation)}
          >
            <title>{formatGeneration(generation)}</title>
          </rect>
        );
      })}
    </>
  );
}

function polyline(values: (number | null)[], min: number, max: number) {
  const usable = values.flatMap((value, index) => (value == null ? [] : [{ index, value }]));
  if (usable.length === 0) return "";
  return usable
    .map((point, index) => `${index === 0 ? "M" : "L"}${slotX(point.index, values.length).toFixed(2)} ${valueY(point.value, min, max).toFixed(2)}`)
    .join(" ");
}

function bandPath(lows: (number | null)[], highs: (number | null)[], min: number, max: number) {
  const forward: string[] = [];
  const back: string[] = [];
  lows.forEach((low, index) => {
    const high = highs[index];
    if (low == null || high == null) return;
    const x = slotX(index, lows.length).toFixed(2);
    forward.push(`${forward.length === 0 ? "M" : "L"}${x} ${valueY(high, min, max).toFixed(2)}`);
    back.push(`${x} ${valueY(low, min, max).toFixed(2)}`);
  });
  if (forward.length === 0) return "";
  return `${forward.join(" ")} L${[...back].reverse().join(" L")} Z`;
}

function Dots({
  values,
  generations,
  min,
  max,
  tone,
  focus,
  onSelect,
}: {
  values: (number | null)[];
  generations: number[];
  min: number;
  max: number;
  tone: string;
  focus: number | null;
  onSelect?: (index: number) => void;
}) {
  return (
    <>
      {values.map((value, index) =>
        value == null ? null : (
          <circle
            key={`${tone}-${generations[index]}`}
            className="pareto-chart-dot"
            data-tone={tone}
            data-pick={onSelect ? true : undefined}
            data-hot={focus === generations[index] || undefined}
            cx={slotX(index, values.length)}
            cy={valueY(value, min, max)}
            r={focus === generations[index] ? 1.15 : 0.85}
            onClick={onSelect ? () => onSelect(index) : undefined}
          />
        ),
      )}
    </>
  );
}

function Labels({ labels }: { labels: string[] }) {
  return (
    <g className="pareto-chart-labels">
      {labels.map((label, index) => (
        <text key={label} x={slotX(index, labels.length)} y={35.2} textAnchor="middle">
          {label}
        </text>
      ))}
    </g>
  );
}

export function ParetoAnalyticsBand({ series, turnovers, focus, membership, onFocus, onPick, onMembership }: Props) {
  const presentation = useViewMode() === "presentation";
  const [pointerGeneration, setPointerGeneration] = useState<number | null>(null);
  const pointAt = (index: number | null) => {
    setPointerGeneration(index);
    onFocus(index);
  };
  const leaveChart = () => {
    setPointerGeneration(null);
    onFocus(null);
  };
  const labels = series.map((item) => formatGeneration(item.index));
  const generations = series.map((item) => item.index);
  const focusIndex = series.findIndex((item) => item.index === focus);
  const pointed = series.find((item) => item.index === pointerGeneration);
  const pinned = presentation ? (pointed ?? series[series.length - 1]) : pointed;
  const hyper = series.map((item) => item.hypervolume);
  const hyperDomain = domain(
    hyper.filter((value): value is number => value != null),
    false,
  );
  const medianValues = series.flatMap((item) =>
    [
      item.medians.formal,
      item.medians.spatial,
      item.medians.atmospheric,
      item.bounds?.formal.min,
      item.bounds?.formal.max,
      item.bounds?.spatial.min,
      item.bounds?.spatial.max,
      item.bounds?.atmospheric.min,
      item.bounds?.atmospheric.max,
    ].filter((value): value is number => value != null),
  );
  const medianDomain = domain(medianValues, false);
  const spreadValues = series.flatMap((item) =>
    item.spread
      ? [item.spread.formal, item.spread.spatial, item.spread.atmospheric, item.spread.nearestNeighbor].filter(
          (value): value is number => value != null,
        )
      : [],
  );
  const spreadDomain = domain(spreadValues, true);
  const turnoverCount = (pick: (item: (typeof turnovers)[number]) => number) =>
    series.map((item) => {
      const step = turnovers.find((entry) => entry.to === item.index);
      return step ? pick(step) : null;
    });
  const retainedLine = turnoverCount((item) => item.retained);
  const entrantLine = turnoverCount((item) => item.entrants);
  const displacedLine = turnoverCount((item) => item.displaced);
  const turnoverDomain = domain(
    [...retainedLine, ...entrantLine, ...displacedLine].filter((value): value is number => value != null),
    true,
  );
  const pickTurnover = (index: number, kind: TurnoverKind) => {
    const step = turnovers.find((entry) => entry.to === series[index]?.index);
    if (!step) return;
    const ids = kind === "retained" ? step.retainedIds : kind === "entrants" ? step.entrantIds : step.displacedIds;
    if (ids.length === 0) return;
    onMembership(step.to, kind, ids);
  };
  const turnoverReadout = turnovers.find((item) => item.to === pinned?.index) ?? (presentation ? turnovers[turnovers.length - 1] : undefined);
  const hyperNote = pinned ? `${formatGeneration(pinned.index)} ${formatNumber(pinned.hypervolume, 3)}` : "\u00a0";
  const progressionNote = pinned
    ? `${formatGeneration(pinned.index)} F ${formatMatch(pinned.medians.formal)} · S ${formatMatch(pinned.medians.spatial)} · A ${formatMatch(pinned.medians.atmospheric)}`
    : "\u00a0";
  const turnoverNote = turnoverReadout
    ? `${formatGeneration(turnoverReadout.from)}→${formatGeneration(turnoverReadout.to)} ${turnoverReadout.retained} retained · ${turnoverReadout.entrants} entered · ${turnoverReadout.displaced} displaced`
    : pinned
      ? `${formatGeneration(pinned.index)} starting archive`
      : "\u00a0";
  const spreadNote = pinned?.spread
    ? `${formatGeneration(pinned.index)} F ${formatNumber(pinned.spread.formal)} · S ${formatNumber(pinned.spread.spatial)} · A ${formatNumber(pinned.spread.atmospheric)} · NN ${formatNumber(pinned.spread.nearestNeighbor)}`
    : "\u00a0";

  return (
    <section className="pareto-analytics" aria-label="Search evidence">
      <ChartFrame
        title="Pareto hypervolume"
        note={hyperNote}
        info={<MetricInfo label="Pareto hypervolume" sections={EXPLANATIONS.hypervolume} />}
        onLeave={leaveChart}
      >
        <svg viewBox="0 0 100 36" role="img" aria-label="Hypervolume of the unweighted archive by generation">
          <text className="pareto-chart-axis" x="1" y="7">
            {hyperDomain.max.toFixed(3)}
          </text>
          <text className="pareto-chart-axis" x="1" y="33">
            {hyperDomain.min.toFixed(3)}
          </text>
          <FocusRule count={series.length} focusIndex={focusIndex} />
          <path d={polyline(hyper, hyperDomain.min, hyperDomain.max)} className="pareto-chart-line" data-tone="volume" />
          <Dots values={hyper} min={hyperDomain.min} max={hyperDomain.max} tone="volume" focus={focus} generations={generations} />
          <GenerationHits generations={generations} focus={focus} onFocus={pointAt} onPick={onPick} />
          <Labels labels={labels} />
        </svg>
        <p className="pareto-chart-key">
          <span data-tone="volume">Volume</span>
        </p>
      </ChartFrame>

      <ChartFrame
        title="Objective progression"
        note={progressionNote}
        info={<MetricInfo label="Objective progression" sections={EXPLANATIONS.progression} />}
        onLeave={leaveChart}
      >
        <svg viewBox="0 0 100 36" role="img" aria-label="Median Formal, Spatial, and Atmospheric match of each archive, with min to max">
          <FocusRule count={series.length} focusIndex={focusIndex} />
          <path
            d={bandPath(
              series.map((item) => item.bounds?.formal.min ?? null),
              series.map((item) => item.bounds?.formal.max ?? null),
              medianDomain.min,
              medianDomain.max,
            )}
            className="pareto-chart-band"
            data-tone="formal"
          />
          <path
            d={bandPath(
              series.map((item) => item.bounds?.spatial.min ?? null),
              series.map((item) => item.bounds?.spatial.max ?? null),
              medianDomain.min,
              medianDomain.max,
            )}
            className="pareto-chart-band"
            data-tone="spatial"
          />
          <path
            d={bandPath(
              series.map((item) => item.bounds?.atmospheric.min ?? null),
              series.map((item) => item.bounds?.atmospheric.max ?? null),
              medianDomain.min,
              medianDomain.max,
            )}
            className="pareto-chart-band"
            data-tone="atmospheric"
          />
          <path d={polyline(series.map((item) => item.medians.formal), medianDomain.min, medianDomain.max)} className="pareto-chart-line" data-tone="formal" />
          <path d={polyline(series.map((item) => item.medians.spatial), medianDomain.min, medianDomain.max)} className="pareto-chart-line" data-tone="spatial" />
          <path d={polyline(series.map((item) => item.medians.atmospheric), medianDomain.min, medianDomain.max)} className="pareto-chart-line" data-tone="atmospheric" />
          <Dots values={series.map((item) => item.medians.formal)} min={medianDomain.min} max={medianDomain.max} tone="formal" focus={focus} generations={generations} />
          <Dots values={series.map((item) => item.medians.spatial)} min={medianDomain.min} max={medianDomain.max} tone="spatial" focus={focus} generations={generations} />
          <Dots values={series.map((item) => item.medians.atmospheric)} min={medianDomain.min} max={medianDomain.max} tone="atmospheric" focus={focus} generations={generations} />
          <GenerationHits generations={generations} focus={focus} onFocus={pointAt} onPick={onPick} />
          <Labels labels={labels} />
        </svg>
        <p className="pareto-chart-key">
          <span data-tone="formal">Formal</span>
          <span data-tone="spatial">Spatial</span>
          <span data-tone="atmospheric">Atmospheric</span>
        </p>
      </ChartFrame>

      <ChartFrame
        title="Archive turnover"
        note={turnoverNote}
        info={<MetricInfo label="Archive turnover" sections={EXPLANATIONS.turnover} />}
        onLeave={leaveChart}
      >
        {turnovers.length === 0 ? (
          <p className="pareto-chart-empty">A second generation is required.</p>
        ) : (
          <svg viewBox="0 0 100 36" role="img" aria-label="Archive members retained, entered, and displaced between generations">
            <FocusRule count={series.length} focusIndex={focusIndex} />
            <path d={polyline(retainedLine, turnoverDomain.min, turnoverDomain.max)} className="pareto-chart-line" data-tone="retained" />
            <path d={polyline(entrantLine, turnoverDomain.min, turnoverDomain.max)} className="pareto-chart-line" data-tone="entrants" />
            <path d={polyline(displacedLine, turnoverDomain.min, turnoverDomain.max)} className="pareto-chart-line" data-tone="displaced" />
            <GenerationHits generations={generations} focus={focus} onFocus={pointAt} onPick={onPick} />
            <Dots values={retainedLine} min={turnoverDomain.min} max={turnoverDomain.max} tone="retained" focus={focus} generations={generations} onSelect={(index) => pickTurnover(index, "retained")} />
            <Dots values={entrantLine} min={turnoverDomain.min} max={turnoverDomain.max} tone="entrants" focus={focus} generations={generations} onSelect={(index) => pickTurnover(index, "entrants")} />
            <Dots values={displacedLine} min={turnoverDomain.min} max={turnoverDomain.max} tone="displaced" focus={focus} generations={generations} onSelect={(index) => pickTurnover(index, "displaced")} />
            <Labels labels={labels} />
          </svg>
        )}
        <p className="pareto-chart-key">
          <span data-tone="retained">Retained</span>
          <span data-tone="entrants">Entered</span>
          <span data-tone="displaced">Displaced</span>
        </p>
      </ChartFrame>

      <ChartFrame
        title="Objective spread"
        note={spreadNote}
        info={<MetricInfo label="Objective spread" sections={EXPLANATIONS.spread} />}
        onLeave={leaveChart}
      >
        <svg viewBox="0 0 100 36" role="img" aria-label="Objective ranges and mean nearest-neighbor distance of each archive">
          <FocusRule count={series.length} focusIndex={focusIndex} />
          <path d={polyline(series.map((item) => item.spread?.formal ?? null), spreadDomain.min, spreadDomain.max)} className="pareto-chart-line" data-tone="formal" />
          <path d={polyline(series.map((item) => item.spread?.spatial ?? null), spreadDomain.min, spreadDomain.max)} className="pareto-chart-line" data-tone="spatial" />
          <path d={polyline(series.map((item) => item.spread?.atmospheric ?? null), spreadDomain.min, spreadDomain.max)} className="pareto-chart-line" data-tone="atmospheric" />
          <path
            d={polyline(series.map((item) => item.spread?.nearestNeighbor ?? null), spreadDomain.min, spreadDomain.max)}
            className="pareto-chart-line"
            data-tone="neighbor"
          />
          <Dots values={series.map((item) => item.spread?.formal ?? null)} min={spreadDomain.min} max={spreadDomain.max} tone="formal" focus={focus} generations={generations} />
          <Dots values={series.map((item) => item.spread?.spatial ?? null)} min={spreadDomain.min} max={spreadDomain.max} tone="spatial" focus={focus} generations={generations} />
          <Dots values={series.map((item) => item.spread?.atmospheric ?? null)} min={spreadDomain.min} max={spreadDomain.max} tone="atmospheric" focus={focus} generations={generations} />
          <Dots values={series.map((item) => item.spread?.nearestNeighbor ?? null)} min={spreadDomain.min} max={spreadDomain.max} tone="neighbor" focus={focus} generations={generations} />
          <GenerationHits generations={generations} focus={focus} onFocus={pointAt} onPick={onPick} />
          <Labels labels={labels} />
        </svg>
        <p className="pareto-chart-key">
          <span data-tone="formal">F</span>
          <span data-tone="spatial">S</span>
          <span data-tone="atmospheric">A</span>
          <span data-tone="neighbor">Neighbor</span>
        </p>
      </ChartFrame>
    </section>
  );
}
