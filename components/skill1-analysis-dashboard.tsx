"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Panel, PanelHeader } from "@/components/hud";
import {
  ANALYSIS_DEFINITIONS,
  ANALYSIS_TABS,
  concentrationHistogram,
  dominantBinLabel,
  evenSamples,
  exportAnalysisPayload,
  fieldToDisplayRow,
  frameForTab,
  gridStats,
  type AnalysisSession,
  type AnalysisTabId,
  type DnaAxis,
  type GrowthSample,
} from "@/lib/skill1/analysis";

const ANALYSIS_TAB_ITEMS = ANALYSIS_TABS.filter((item) => item.id !== "growth");

type DensityMode = "trail" | "occupancy" | "intensity";
type TopologyMode = "overview" | "metrics" | "hierarchy" | "circulation" | "export";
type DirectionMode = "accumulated" | "instantaneous";

function heatColor(t: number) {
  const clamped = Math.max(0, Math.min(1, t));
  if (clamped < 0.45) {
    const u = clamped / 0.45;
    return `rgb(${Math.round(8 + u * 7)}, ${Math.round(18 + u * 97)}, ${Math.round(20 + u * 99)})`;
  }
  if (clamped < 0.78) {
    const u = (clamped - 0.45) / 0.33;
    return `rgb(${Math.round(15 + u * 227)}, ${Math.round(115 + u * 127)}, ${Math.round(119 + u * 119)})`;
  }
  const u = (clamped - 0.78) / 0.22;
  return `rgb(${Math.round(242 - u * 43)}, ${Math.round(242 - u * 116)}, ${Math.round(238 - u * 143)})`;
}

function useFieldCanvas(
  draw: (ctx: CanvasRenderingContext2D, width: number, height: number) => void,
  deps: unknown[],
) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const paint = () => {
      const rect = canvas.getBoundingClientRect();
      const width = Math.max(1, Math.floor(rect.width));
      const height = Math.max(1, Math.floor(rect.height));
      const dpr = window.devicePixelRatio || 1;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);
      draw(ctx, width, height);
    };
    paint();
    const observer = new ResizeObserver(paint);
    observer.observe(canvas);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return ref;
}

function polar(index: number, count: number, radius: number, value: number) {
  const angle = -Math.PI / 2 + (index * Math.PI * 2) / count;
  return [Math.cos(angle) * radius * value, Math.sin(angle) * radius * value];
}

function clampUnit(value: number) {
  return Math.max(0, Math.min(1, value));
}

function dnaNumber(value: number | null, display: string) {
  if (value == null) return display === "value" ? "—" : display;
  return value.toFixed(2);
}

function presentNumber(value: number | null, display: string) {
  if (value == null) return display === "Not available" ? "N/A" : "—";
  return value.toFixed(2);
}

function dnaDelta(value: number | null) {
  if (value == null) return null;
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}`;
}

const PRESENTATION_CAPTION: Record<string, string> = {
  centrality: "Global Integration",
  connectivity: "Spatial Links",
  openness: "Spatial Release",
  directionality: "Movement Bias",
  visibility: "Visual Exposure",
};

function radarRuns(values: Array<number | null>, radius: number) {
  const paths: string[] = [];
  let run = "";
  const flush = () => {
    if (run) paths.push(run.trim());
    run = "";
  };
  values.forEach((value, index) => {
    if (value == null) {
      flush();
      return;
    }
    const [x, y] = polar(index, values.length, radius, clampUnit(value));
    run += `${run ? "L" : "M"}${x.toFixed(2)},${y.toFixed(2)} `;
  });
  flush();
  if (values.every((value) => value != null) && paths.length === 1) paths[0] += " Z";
  return paths;
}

function RadarChart({ axes }: { axes: DnaAxis[] }) {
  const radius = 168;
  const rings = [0.2, 0.4, 0.6, 0.8, 1];
  const target = axes.map((axis) => axis.target);
  const generated = axes.map((axis) => axis.generated);
  const ringPoints = (ring: number) =>
    axes.map((_, index) => polar(index, axes.length, radius, ring).map((coord) => coord.toFixed(2)).join(",")).join(" ");
  const runs = (values: Array<number | null>) => {
    const paths: string[] = [];
    let run = "";
    const flush = () => {
      if (run) paths.push(run.trim());
      run = "";
    };
    values.forEach((value, index) => {
      if (value == null) {
        flush();
        return;
      }
      const [x, y] = polar(index, values.length, radius, clampUnit(value));
      run += `${run ? "L" : "M"}${x.toFixed(2)},${y.toFixed(2)} `;
    });
    flush();
    if (values.every((value) => value != null) && paths.length === 1) paths[0] += " Z";
    return paths;
  };
  const labelAnchor = (index: number) => {
    const [x] = polar(index, axes.length, radius, 1);
    if (Math.abs(x) < radius * 0.45) return "middle";
    return x > 0 ? "start" : "end";
  };
  return (
    <svg viewBox="-500 -330 1000 660" className="s1a-radar" role="img" aria-label="Architectural target and generated network" preserveAspectRatio="xMidYMid meet">
      <defs>
        <filter id="s1a-dna-glow-target" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="1.2" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <filter id="s1a-dna-glow-generated" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="1.2" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      {[
        [-470, -300],
        [470, -300],
        [470, 300],
        [-470, 300],
      ].map(([x, y]) => {
        const sx = x < 0 ? 1 : -1;
        const sy = y < 0 ? 1 : -1;
        return (
          <path
            key={`${x}${y}`}
            d={`M${x + sx * 28},${y} H${x} V${y + sy * 28}`}
            fill="none"
            stroke="rgba(242,242,238,0.55)"
            strokeWidth="1.6"
          />
        );
      })}
      {rings.map((ring) => (
        <polygon key={ring} fill="none" stroke={ring === 1 ? "rgba(242,242,238,0.38)" : "rgba(242,242,238,0.2)"} strokeWidth={ring === 1 ? 1.4 : 1} points={ringPoints(ring)} />
      ))}
      {axes.map((axis, index) => {
        const [x, y] = polar(index, axes.length, radius, 1);
        return <line key={axis.id} x1="0" y1="0" x2={x} y2={y} stroke="rgba(242,242,238,0.22)" strokeWidth="1" />;
      })}
      {rings.map((ring) => (
        <text key={`scale-${ring}`} x="12" y={-radius * ring + 5} className="s1a-dna-scale" fontSize="15">
          {ring.toFixed(1)}
        </text>
      ))}
      {runs(target).map((path) => (
        <path key={`t-${path}`} d={path} fill={path.endsWith("Z") ? "rgba(199,126,95,0.16)" : "none"} stroke="#c77e5f" strokeWidth="2.4" strokeLinejoin="round" strokeLinecap="round" filter="url(#s1a-dna-glow-target)" />
      ))}
      {runs(generated).map((path) => (
        <path key={`g-${path}`} d={path} fill={path.endsWith("Z") ? "rgba(15,115,119,0.22)" : "none"} stroke="#0f7377" strokeWidth="2.4" strokeLinejoin="round" strokeLinecap="round" filter="url(#s1a-dna-glow-generated)" />
      ))}
      {axes.map((axis, index) =>
        (
          [
            [axis.target, "#c77e5f"],
            [axis.generated, "#0f7377"],
          ] as const
        ).map(([value, color], series) => {
          if (value == null) return null;
          const [x, y] = polar(index, axes.length, radius, clampUnit(value));
          return (
            <g key={`${axis.id}-${series}`} filter={series === 0 ? "url(#s1a-dna-glow-target)" : "url(#s1a-dna-glow-generated)"}>
              <circle cx={x} cy={y} r="6.5" fill="#000" stroke={color} strokeWidth="1.6" />
              <circle cx={x} cy={y} r="2.6" fill={color} />
            </g>
          );
        }),
      )}
      {axes.map((axis, index) => {
        const [lx, ly] = polar(index, axes.length, radius + 78, 1);
        const anchor = labelAnchor(index);
        const shown = axis.generated == null ? "n/a" : axis.generated.toFixed(2);
        return (
          <text key={axis.id} x={lx} y={ly} textAnchor={anchor} className="s1a-dna-axis" fontSize="20">
            <tspan x={lx} dy="-0.35em">{axis.label}</tspan>
            <tspan x={lx} dy="1.35em" className={axis.generated == null ? "s1a-dna-axis-missing" : "s1a-dna-axis-value"} fontSize="24">
              {shown}
            </tspan>
          </text>
        );
      })}
    </svg>
  );
}

function MiniField({ grid, size }: { grid: number[]; size: number }) {
  const ref = useFieldCanvas((ctx, width, height) => {
    const max = grid.reduce((peak, value) => Math.max(peak, value), 0);
    const cellW = width / size;
    const cellH = height / size;
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const value = grid[y * size + x] ?? 0;
        ctx.fillStyle = max > 0 ? heatColor(value / max) : "#000";
        ctx.fillRect(x * cellW, fieldToDisplayRow(y, size) * cellH, cellW + 0.5, cellH + 0.5);
      }
    }
  }, [grid, size]);
  return <canvas ref={ref} className="s1a-mini" />;
}

function FieldCanvas({
  draw,
  deps,
  label,
  className = "s1a-field",
}: {
  draw: (ctx: CanvasRenderingContext2D, width: number, height: number) => void;
  deps: unknown[];
  label: string;
  className?: string;
}) {
  const ref = useFieldCanvas(draw, deps);
  return <canvas ref={ref} className={className} role="img" aria-label={label} />;
}

function paintGrid(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  values: ArrayLike<number>,
  size: number,
  mask?: ArrayLike<number> | null,
) {
  const max = Array.from(values).reduce((peak, value) => Math.max(peak, value), 0);
  const cellW = width / size;
  const cellH = height / size;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const index = y * size + x;
      if (mask && mask[index] === 0) continue;
      const value = values[index] ?? 0;
      ctx.fillStyle = max > 0 ? heatColor(value / max) : "#050505";
      ctx.fillRect(x * cellW, fieldToDisplayRow(y, size) * cellH, cellW + 0.5, cellH + 0.5);
    }
  }
}

function usePresentationSurface() {
  const ref = useRef<HTMLElement>(null);
  const [presentation, setPresentation] = useState(false);
  useLayoutEffect(() => {
    const node = ref.current?.closest("[data-display-mode]");
    if (!node) return;
    const read = () => setPresentation(node.getAttribute("data-display-mode") === "presentation");
    read();
    const observer = new MutationObserver(read);
    observer.observe(node, { attributes: true, attributeFilter: ["data-display-mode"] });
    return () => observer.disconnect();
  }, []);
  return { ref, presentation };
}

export function Skill1AnalysisDashboard({
  session,
  simulating,
}: {
  session: AnalysisSession | null;
  simulating: boolean;
  sampleInterval?: number;
  onSampleInterval?: (value: number) => void;
}) {
  const { ref: surfaceRef, presentation } = usePresentationSurface();
  const [tab, setTab] = useState<AnalysisTabId>("dna");
  const [densityMode, setDensityMode] = useState<DensityMode>("trail");
  const [topologyMode, setTopologyMode] = useState<TopologyMode>("overview");
  const [directionMode, setDirectionMode] = useState<DirectionMode>("accumulated");
  const frame = frameForTab(session, tab);
  const shownSnapshots = useMemo(() => {
    const recorded = session?.samples.filter((sample) => sample.meanGrid.some((value) => value > 0)) ?? [];
    const live = session?.latest?.growth;
    const series =
      live && live.meanGrid.some((value) => value > 0) && recorded.every((sample) => sample.iteration !== live.iteration)
        ? recorded.concat(live)
        : recorded;
    return evenSamples(series, 8);
  }, [session]);

  const download = () => {
    const payload = exportAnalysisPayload(session);
    if (!payload) return;
    const blob = new Blob([JSON.stringify(payload)], { type: "application/json" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `${payload.archetypeId}-${payload.simulationId.replace(/[^\w.-]+/g, "_")}-i${payload.iteration}.json`;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  return (
    <section ref={surfaceRef} className="skill1-analysis-region min-h-0">
      <Panel padded={false} className="s1a-panel flex min-h-0 flex-col">
        <div className="px-3 pt-3">
          <PanelHeader
            kicker="Analysis"
            title="Physarum Logic"
            aside={
              <span className="border border-[rgba(242,242,238,0.24)] px-1.5 py-0.5 text-[0.5rem] tracking-[0.14em] uppercase text-[var(--muted)]">
                {simulating ? "Live" : frame ? "Held" : "Idle"}
              </span>
            }
          />
        </div>
        <div className="s1a-tabs px-3" role="tablist" aria-label="Simulation analysis">
          {ANALYSIS_TAB_ITEMS.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              id={`s1a-tab-${item.id}`}
              aria-selected={tab === item.id}
              aria-controls={`s1a-panel-${item.id}`}
              className="s1a-tab"
              onClick={() => setTab(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>
        <div
          className="s1a-body min-h-0 flex-1 overflow-auto px-3 pb-3"
          role="tabpanel"
          id={`s1a-panel-${tab}`}
          aria-labelledby={`s1a-tab-${tab}`}
        >
          {!frame || !session ? (
            <p className="s1a-empty">Generate a field to compute analysis from the simulation.</p>
          ) : tab === "dna" ? (
            <DnaTab
              axes={frame.dna}
              snapshots={shownSnapshots}
              fieldSize={frame.density.size}
              presentation={presentation}
            />
          ) : tab === "topology" ? (
            <TopologyTab session={session} mode={topologyMode} onMode={setTopologyMode} onExport={download} presentation={presentation} />
          ) : tab === "density" ? (
            <DensityTab session={session} mode={densityMode} onMode={setDensityMode} presentation={presentation} />
          ) : (
            <DirectionTab session={session} mode={directionMode} onMode={setDirectionMode} presentation={presentation} />
          )}
        </div>
      </Panel>
    </section>
  );
}

function MetaLine({ session, frameIteration }: { session: AnalysisSession; frameIteration: number }) {
  return (
    <p className="s1a-meta">
      {session.archetypeName} · seed {session.seed} · sample {frameIteration} · {session.simulationId}
    </p>
  );
}

function DnaMeter({ value, tone }: { value: number | null; tone: "target" | "generated" }) {
  const placed = value == null ? null : clampUnit(value);
  return (
    <span className={`s1a-dna-track s1a-dna-track-${tone}`}>
      <i />
      {placed == null ? null : (
        <>
          <b style={{ width: `${placed * 100}%` }} />
          <em style={{ left: `${placed * 100}%` }} />
        </>
      )}
    </span>
  );
}

function PresentationRadar({ axes }: { axes: DnaAxis[] }) {
  const radius = 168;
  const rings = [0.2, 0.4, 0.6, 0.8, 1];
  const labelAnchor = (index: number) => {
    const [x] = polar(index, axes.length, radius, 1);
    if (Math.abs(x) < radius * 0.35) return "middle";
    return x > 0 ? "start" : "end";
  };
  const labelText = (axis: DnaAxis) => {
    if (axis.target == null) return axis.targetDisplay === "Not available" ? "N/A" : "—";
    return axis.target.toFixed(2);
  };
  return (
    <svg viewBox="-390 -290 780 590" className="s1a-p-chart" role="img" aria-label="Architectural target and generated network" preserveAspectRatio="xMidYMid meet">
      {rings.map((ring) => (
        <circle
          key={ring}
          r={radius * ring}
          fill="none"
          stroke={ring === 1 ? "rgba(242,242,238,0.42)" : "rgba(242,242,238,0.22)"}
          strokeWidth={ring === 1 ? 1.3 : 0.85}
        />
      ))}
      {axes.map((axis, index) => {
        const [x, y] = polar(index, axes.length, radius, 1);
        return <line key={axis.id} x1="0" y1="0" x2={x} y2={y} stroke="rgba(242,242,238,0.28)" strokeWidth="0.9" />;
      })}
      {rings.map((ring) => (
        <text key={`scale-${ring}`} x="22" y={-radius * ring + 18} className="s1a-p-scale" fontSize="12">
          {ring.toFixed(1)}
        </text>
      ))}
      {radarRuns(axes.map((axis) => axis.target), radius).map((path) => (
        <path key={`t-${path}`} d={path} fill={path.endsWith("Z") ? "rgba(199,126,95,0.16)" : "none"} stroke="#c77e5f" strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round" />
      ))}
      {radarRuns(axes.map((axis) => axis.generated), radius).map((path) => (
        <path key={`g-${path}`} d={path} fill={path.endsWith("Z") ? "rgba(15,115,119,0.18)" : "none"} stroke="#0f7377" strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round" />
      ))}
      {axes.map((axis, index) =>
        (
          [
            [axis.target, "#c77e5f"],
            [axis.generated, "#0f7377"],
          ] as const
        ).map(([value, color], series) => {
          if (value == null) return null;
          const [x, y] = polar(index, axes.length, radius, clampUnit(value));
          return (
            <g key={`${axis.id}-${series}`}>
              <circle cx={x} cy={y} r="5.2" fill="#000" stroke={color} strokeWidth="1.6" />
              <circle cx={x} cy={y} r="2.2" fill={color} />
            </g>
          );
        }),
      )}
      {axes.map((axis, index) => {
        const [lx, ly] = polar(index, axes.length, radius + 46, 1);
        const anchor = labelAnchor(index);
        const missing = axis.target == null;
        return (
          <text key={axis.id} x={lx} y={ly} textAnchor={anchor} className="s1a-p-axis" fontSize="16">
            <tspan x={lx} dy="-0.2em">{axis.label}</tspan>
            <tspan x={lx} dy="1.35em" className={missing ? "s1a-p-axis-missing" : "s1a-p-axis-value"} fontSize="18">
              {labelText(axis)}
            </tspan>
          </text>
        );
      })}
    </svg>
  );
}

function ComparisonBar({ target, generated }: { target: number | null; generated: number | null }) {
  const mark = (value: number | null, tone: "target" | "generated") => {
    if (value == null) return null;
    return <i className={`s1a-p-mark s1a-p-mark-${tone}`} style={{ left: `${clampUnit(value) * 100}%` }} />;
  };
  return (
    <span className="s1a-p-bar">
      <b />
      {mark(target, "target")}
      {mark(generated, "generated")}
    </span>
  );
}

function GenerationProgression({ snapshots, fieldSize }: { snapshots: GrowthSample[]; fieldSize: number }) {
  return (
    <section className="s1a-dna-progress" aria-label="Generation progression">
      <h3>Generation progression</h3>
      {snapshots.length ? (
        <div className="s1a-g-morph">
          {snapshots.map((sample) => (
            <figure key={sample.iteration} className="s1a-g-snap">
              <MiniField grid={sample.meanGrid} size={fieldSize} />
              <span>{sample.iteration}</span>
            </figure>
          ))}
        </div>
      ) : (
        <p className="s1a-note">Not yet computed. Snapshots are stored from analysis samples of the trail field.</p>
      )}
    </section>
  );
}

function PresentationDna({
  axes,
  snapshots,
  fieldSize,
}: {
  axes: DnaAxis[];
  snapshots: GrowthSample[];
  fieldSize: number;
}) {
  return (
    <div className="s1a-dna-present">
      <div className="s1a-p-radar">
        <PresentationRadar axes={axes} />
        <div className="s1a-p-legend">
          <span><i className="s1a-p-key s1a-p-key-target" /> Target (archetype)</span>
          <span><i className="s1a-p-key s1a-p-key-generated" /> Generated (simulation)</span>
        </div>
      </div>
      <section className="s1a-p-compare" aria-label="Metric comparison">
        <h3>Metric comparison</h3>
        <div className="s1a-p-head">
          <span>Metric</span>
          <span>Target</span>
          <span>Generated</span>
          <span>Difference</span>
          <span>Bar</span>
        </div>
        <div className="s1a-p-rows">
          {axes.map((axis) => {
            const delta = dnaDelta(axis.difference);
            const caption = PRESENTATION_CAPTION[axis.id];
            return (
              <div key={axis.id} className="s1a-p-row">
                <div className="s1a-p-metric">
                  <p>
                    <span>{axis.label}</span>
                    {caption ? <small>{caption}</small> : null}
                  </p>
                </div>
                <span className="s1a-p-target" title={axis.targetReason}>{presentNumber(axis.target, axis.targetDisplay)}</span>
                <span className="s1a-p-generated" title={axis.generatedReason}>{presentNumber(axis.generated, axis.generatedDisplay)}</span>
                <span className="s1a-p-delta" title="Generated minus target">{delta ?? "—"}</span>
                <ComparisonBar target={axis.target} generated={axis.generated} />
              </div>
            );
          })}
        </div>
      </section>
      <GenerationProgression snapshots={snapshots} fieldSize={fieldSize} />
    </div>
  );
}

function DnaTab({
  axes,
  snapshots,
  fieldSize,
  presentation = false,
}: {
  axes: DnaAxis[];
  snapshots: GrowthSample[];
  fieldSize: number;
  presentation?: boolean;
}) {
  if (presentation) return <PresentationDna axes={axes} snapshots={snapshots} fieldSize={fieldSize} />;
  const mid = Math.ceil(axes.length / 2);
  const columns = [axes.slice(0, mid), axes.slice(mid)];
  return (
    <div className="s1a-stack s1a-dna">
      <div className="s1a-dna-radar">
        <RadarChart axes={axes} />
        <div className="s1a-dna-legend">
          <span><i className="s1a-dna-key s1a-dna-key-target" /> Target (archetype)</span>
          <span><i className="s1a-dna-key s1a-dna-key-generated" /> Generated (simulation)</span>
        </div>
      </div>
      <section className="s1a-dna-compare" aria-label="Metric comparison">
        <header className="s1a-dna-compare-head">
          <h3>Metric comparison</h3>
          <p>Target is the locked rating divided by 2. Generated is the simulation measurement. Difference is generated minus target.</p>
        </header>
        <div className="s1a-dna-grid">
          {columns.map((column) => (
            <div key={column[0]?.id ?? "empty"} className="s1a-dna-column">
              {column.map((axis) => {
                const delta = dnaDelta(axis.difference);
                return (
                  <div key={axis.id} className="s1a-dna-row">
                    <p className="s1a-dna-name">{axis.label}</p>
                    <div className="s1a-dna-meters">
                      <DnaMeter value={axis.target} tone="target" />
                      <DnaMeter value={axis.generated} tone="generated" />
                    </div>
                    <div className="s1a-dna-nums">
                      <span className="s1a-dna-num-target" title={axis.targetReason}>{dnaNumber(axis.target, axis.targetDisplay)}</span>
                      <span className="s1a-dna-num-generated" title={axis.generatedReason}>{dnaNumber(axis.generated, axis.generatedDisplay)}</span>
                      <span className="s1a-dna-num-delta" title="Generated minus target">{delta ?? "—"}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </section>
      <GenerationProgression snapshots={snapshots} fieldSize={fieldSize} />
    </div>
  );
}

function mutedHeat(t: number) {
  const clamped = Math.max(0, Math.min(1, t));
  const stops: Array<[number, [number, number, number]]> = [
    [0, [8, 10, 10]],
    [0.5, [15, 115, 119]],
    [1, [199, 126, 95]],
  ];
  const lower = clamped < 0.5 ? stops[0] : stops[1];
  const upper = clamped < 0.5 ? stops[1] : stops[2];
  const span = upper[0] - lower[0];
  const u = span === 0 ? 0 : (clamped - lower[0]) / span;
  const rgb = lower[1].map((channel, index) => Math.round(channel + (upper[1][index] - channel) * u));
  return `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`;
}

function paintMutedGrid(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  values: ArrayLike<number>,
  size: number,
  mask?: ArrayLike<number> | null,
) {
  const max = Array.from(values).reduce((peak, value) => Math.max(peak, value), 0);
  const cellW = width / size;
  const cellH = height / size;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const index = y * size + x;
      if (mask && mask[index] === 0) continue;
      const value = values[index] ?? 0;
      ctx.fillStyle = max > 0 ? mutedHeat(value / max) : "#050505";
      ctx.fillRect(x * cellW, fieldToDisplayRow(y, size) * cellH, cellW + 0.5, cellH + 0.5);
    }
  }
}

const CHART_CYAN = "#49d7de";
const CHART_COPPER = "#c77e5f";

function drawPolarFrame(ctx: CanvasRenderingContext2D, width: number, height: number) {
  const cx = width / 2;
  const cy = height / 2;
  const radius = Math.min(width, height) * 0.46;
  const hair = Math.max(1, Math.min(width, height) * 0.0014);
  ctx.save();
  ctx.strokeStyle = "rgba(73, 215, 222, 0.11)";
  ctx.lineWidth = hair;
  for (let ring = 1; ring <= 4; ring += 1) {
    ctx.beginPath();
    ctx.arc(cx, cy, (radius * ring) / 4, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.beginPath();
  for (let spoke = 0; spoke < 8; spoke += 1) {
    const angle = (spoke / 8) * Math.PI * 2;
    ctx.moveTo(cx + Math.cos(angle) * radius * 0.08, cy + Math.sin(angle) * radius * 0.08);
    ctx.lineTo(cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius);
  }
  ctx.stroke();
  ctx.strokeStyle = "rgba(242, 242, 238, 0.16)";
  ctx.beginPath();
  ctx.moveTo(cx - 7, cy);
  ctx.lineTo(cx + 7, cy);
  ctx.moveTo(cx, cy - 7);
  ctx.lineTo(cx, cy + 7);
  ctx.stroke();
  ctx.restore();
}

function sampleGrid(values: ArrayLike<number>, size: number, x: number, y: number) {
  const cx = Math.min(size - 1.0001, Math.max(0, x));
  const cy = Math.min(size - 1.0001, Math.max(0, y));
  const x0 = Math.floor(cx);
  const y0 = Math.floor(cy);
  const x1 = Math.min(size - 1, x0 + 1);
  const y1 = Math.min(size - 1, y0 + 1);
  const tx = cx - x0;
  const ty = cy - y0;
  const at = (px: number, py: number) => values[py * size + px] ?? 0;
  const top = at(x0, y0) * (1 - tx) + at(x1, y0) * tx;
  const bottom = at(x0, y1) * (1 - tx) + at(x1, y1) * tx;
  return top * (1 - ty) + bottom * ty;
}

function fieldInk(t: number): [number, number, number, number] {
  if (t <= 0.015) return [0, 0, 0, 0];
  const teal: [number, number, number] = [14, 78, 84];
  const pale: [number, number, number] = [198, 214, 212];
  const white: [number, number, number] = [242, 242, 238];
  const mix = (a: [number, number, number], b: [number, number, number], u: number): [number, number, number] => [
    Math.round(a[0] + (b[0] - a[0]) * u),
    Math.round(a[1] + (b[1] - a[1]) * u),
    Math.round(a[2] + (b[2] - a[2]) * u),
  ];
  const rgb = t < 0.62 ? mix(teal, pale, t / 0.62) : mix(pale, white, (t - 0.62) / 0.38);
  return [rgb[0], rgb[1], rgb[2], Math.round(Math.min(168, 18 + t * 150))];
}

function paintSoftField(
  ctx: CanvasRenderingContext2D,
  values: ArrayLike<number>,
  size: number,
  left: number,
  top: number,
  plotW: number,
  plotH: number,
  max: number,
) {
  const resolution = size * 8;
  const field = document.createElement("canvas");
  field.width = resolution;
  field.height = resolution;
  const pen = field.getContext("2d");
  if (!pen || max <= 0) return;
  const image = pen.createImageData(resolution, resolution);
  const span = Math.max(1, resolution - 1);
  for (let py = 0; py < resolution; py += 1) {
    const fieldY = ((size - 1) * (span - py)) / span;
    for (let px = 0; px < resolution; px += 1) {
      const fieldX = ((size - 1) * px) / span;
      const t = sampleGrid(values, size, fieldX, fieldY) / max;
      const [red, green, blue, alpha] = fieldInk(t);
      const index = (py * resolution + px) * 4;
      image.data[index] = red;
      image.data[index + 1] = green;
      image.data[index + 2] = blue;
      image.data[index + 3] = alpha;
    }
  }
  pen.putImageData(image, 0, 0);
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(field, left, top, plotW, plotH);
  ctx.restore();
}

function paintContours(
  ctx: CanvasRenderingContext2D,
  values: ArrayLike<number>,
  size: number,
  left: number,
  top: number,
  plotW: number,
  plotH: number,
  max: number,
) {
  if (max <= 0) return;
  const steps = size * 4;
  const levels = [0.3, 0.55, 0.8];
  const cellW = plotW / (steps - 1);
  const cellH = plotH / (steps - 1);
  const at = (ix: number, iy: number) => {
    const fieldX = (ix / (steps - 1)) * (size - 1);
    const fieldY = ((steps - 1 - iy) / (steps - 1)) * (size - 1);
    return sampleGrid(values, size, fieldX, fieldY) / max;
  };
  const cell = Math.min(plotW, plotH) / size;
  ctx.save();
  ctx.lineWidth = Math.max(0.8, cell * 0.028);
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  for (const level of levels) {
    ctx.strokeStyle = level >= 0.8 ? "rgba(199, 126, 95, 0.7)" : "rgba(73, 215, 222, 0.42)";
    ctx.beginPath();
    for (let iy = 0; iy < steps - 1; iy += 1) {
      for (let ix = 0; ix < steps - 1; ix += 1) {
        const corners = [at(ix, iy), at(ix + 1, iy), at(ix + 1, iy + 1), at(ix, iy + 1)];
        const x = left + ix * cellW;
        const y = top + iy * cellH;
        const points = [
          [x, y, x + cellW, y],
          [x + cellW, y, x + cellW, y + cellH],
          [x + cellW, y + cellH, x, y + cellH],
          [x, y + cellH, x, y],
        ];
        const pairs = [
          [0, 1],
          [1, 2],
          [2, 3],
          [3, 0],
        ];
        const hits: Array<[number, number]> = [];
        for (const [a, b] of pairs) {
          const v0 = corners[a];
          const v1 = corners[b];
          if ((v0 < level && v1 >= level) || (v1 < level && v0 >= level)) {
            const u = (level - v0) / (v1 - v0 || 1);
            const [x0, y0, x1, y1] = points[a];
            hits.push([x0 + (x1 - x0) * u, y0 + (y1 - y0) * u]);
          }
        }
        if (hits.length >= 2) {
          ctx.moveTo(hits[0][0], hits[0][1]);
          ctx.lineTo(hits[1][0], hits[1][1]);
        }
      }
    }
    ctx.stroke();
  }
  ctx.restore();
}

function skeletonSegments(skeleton: number[], size: number) {
  const on = (x: number, y: number) => x >= 0 && y >= 0 && x < size && y < size && skeleton[y * size + x] > 0;
  const segments: Array<[number, number, number, number]> = [];
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      if (!on(x, y)) continue;
      for (const [ox, oy] of [
        [1, 0],
        [0, 1],
      ] as const) {
        if (on(x + ox, y + oy)) segments.push([x, y, x + ox, y + oy]);
      }
      for (const [ox, oy] of [
        [1, 1],
        [1, -1],
      ] as const) {
        if (!on(x + ox, y + oy)) continue;
        if (on(x + ox, y) || on(x, y + oy)) continue;
        segments.push([x, y, x + ox, y + oy]);
      }
    }
  }
  return segments;
}

function paintOccupancyField(ctx: CanvasRenderingContext2D, mask: ArrayLike<number>, size: number, width: number, height: number) {
  const cell = Math.min(width, height) / size;
  const field = document.createElement("canvas");
  field.width = Math.max(1, Math.ceil(width));
  field.height = Math.max(1, Math.ceil(height));
  const pen = field.getContext("2d");
  if (!pen) return;
  const cellW = width / size;
  const cellH = height / size;
  pen.fillStyle = "rgba(16, 104, 110, 1)";
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      if (!mask[y * size + x]) continue;
      pen.fillRect(x * cellW, fieldToDisplayRow(y, size) * cellH, cellW, cellH);
    }
  }
  ctx.save();
  ctx.filter = `blur(${Math.max(2, cell * 0.55)}px)`;
  ctx.globalAlpha = 0.42;
  ctx.drawImage(field, 0, 0, width, height);
  ctx.filter = `blur(${Math.max(1, cell * 0.16)}px)`;
  ctx.globalAlpha = 0.28;
  ctx.drawImage(field, 0, 0, width, height);
  ctx.restore();
}

function paintTopologyNetwork(ctx: CanvasRenderingContext2D, width: number, height: number, mask: number[], skeleton: number[], endpoints: number[], branches: number[], size: number) {
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, width, height);
  paintOccupancyField(ctx, mask, size, width, height);
  drawPolarFrame(ctx, width, height);
  const cellW = width / size;
  const cellH = height / size;
  const cell = Math.min(cellW, cellH);
  const point = (x: number, y: number) => ({
    x: (x + 0.5) * cellW,
    y: (fieldToDisplayRow(y, size) + 0.5) * cellH,
  });
  ctx.save();
  ctx.shadowColor = "rgba(73, 215, 222, 0.55)";
  ctx.shadowBlur = cell * 0.12;
  ctx.strokeStyle = "rgba(226, 242, 240, 0.94)";
  ctx.lineWidth = Math.max(1.2, cell * 0.07);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  for (const [x0, y0, x1, y1] of skeletonSegments(skeleton, size)) {
    const start = point(x0, y0);
    const end = point(x1, y1);
    ctx.moveTo(start.x, start.y);
    ctx.lineTo(end.x, end.y);
  }
  ctx.stroke();
  ctx.restore();
  const branchSet = new Set(branches);
  for (const index of endpoints) {
    if (branchSet.has(index)) continue;
    const x = index % size;
    const y = (index - x) / size;
    const center = point(x, y);
    ctx.strokeStyle = CHART_COPPER;
    ctx.lineWidth = Math.max(1, cell * 0.028);
    ctx.beginPath();
    ctx.arc(center.x, center.y, cell * 0.13, 0, Math.PI * 2);
    ctx.stroke();
  }
  for (const index of branches) {
    const x = index % size;
    const y = (index - x) / size;
    const center = point(x, y);
    ctx.strokeStyle = "rgba(186, 236, 236, 0.85)";
    ctx.lineWidth = Math.max(1, cell * 0.02);
    ctx.beginPath();
    ctx.arc(center.x, center.y, cell * 0.2, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = "#f2f2ee";
    ctx.beginPath();
    ctx.arc(center.x, center.y, cell * 0.055, 0, Math.PI * 2);
    ctx.fill();
  }
}

function paintCellQuilt(
  ctx: CanvasRenderingContext2D,
  values: ArrayLike<number>,
  size: number,
  left: number,
  top: number,
  plotW: number,
  plotH: number,
  max: number,
) {
  const cellW = plotW / size;
  const cellH = plotH / size;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const value = values[y * size + x] ?? 0;
      if (value <= 0 || max <= 0) continue;
      const t = value / max;
      ctx.fillStyle = `rgba(15, 115, 119, ${0.05 + t * 0.16})`;
      ctx.fillRect(left + x * cellW, top + fieldToDisplayRow(y, size) * cellH, cellW, cellH);
    }
  }
}

function paintPeak(ctx: CanvasRenderingContext2D, values: ArrayLike<number>, size: number, left: number, top: number, plotW: number, plotH: number) {
  let peak = 0;
  let index = 0;
  for (let i = 0; i < values.length; i += 1) {
    if (values[i] > peak) {
      peak = values[i];
      index = i;
    }
  }
  if (peak <= 0) return;
  const x = index % size;
  const y = (index - x) / size;
  const cell = Math.min(plotW, plotH) / size;
  const cx = left + (x + 0.5) * (plotW / size);
  const cy = top + (fieldToDisplayRow(y, size) + 0.5) * (plotH / size);
  ctx.save();
  ctx.strokeStyle = "rgba(199, 126, 95, 0.8)";
  ctx.lineWidth = Math.max(1, cell * 0.035);
  ctx.beginPath();
  ctx.arc(cx, cy, cell * 0.72, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = "rgba(242, 242, 238, 0.55)";
  ctx.beginPath();
  ctx.arc(cx, cy, cell * 0.38, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = "#f2f2ee";
  ctx.beginPath();
  ctx.arc(cx, cy, Math.max(1.5, cell * 0.07), 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function paintPlotGrid(ctx: CanvasRenderingContext2D, left: number, top: number, plotW: number, plotH: number, size: number) {
  const cellW = plotW / size;
  const cellH = plotH / size;
  const cell = Math.min(plotW, plotH) / size;
  ctx.save();
  ctx.lineWidth = Math.max(0.6, cell * 0.012);
  ctx.strokeStyle = "rgba(73, 215, 222, 0.14)";
  ctx.beginPath();
  for (let i = 0; i <= size; i += 1) {
    ctx.moveTo(left + i * cellW, top);
    ctx.lineTo(left + i * cellW, top + plotH);
    ctx.moveTo(left, top + i * cellH);
    ctx.lineTo(left + plotW, top + i * cellH);
  }
  ctx.stroke();
  ctx.restore();
}

function paintDensityChart(
  ctx: CanvasRenderingContext2D,
  values: ArrayLike<number>,
  size: number,
  left: number,
  top: number,
  plotW: number,
  plotH: number,
  max: number,
) {
  paintCellQuilt(ctx, values, size, left, top, plotW, plotH, max);
  paintSoftField(ctx, values, size, left, top, plotW, plotH, max);
  paintContours(ctx, values, size, left, top, plotW, plotH, max);
  paintPlotGrid(ctx, left, top, plotW, plotH, size);
  paintPeak(ctx, values, size, left, top, plotW, plotH);
}

function topoText(value: number | null, reason: string) {
  if (value == null) return reason.startsWith("Not yet") ? "Not yet computed" : "Not available";
  return value.toFixed(3);
}

function PresentationTopology({
  session,
  mode,
  onMode,
  onExport,
}: {
  session: AnalysisSession;
  mode: TopologyMode;
  onMode: (mode: TopologyMode) => void;
  onExport: () => void;
}) {
  const frame = session.latest;
  if (!frame) return null;
  const topology = frame.topology;
  const size = topology.size;
  const modes: { id: TopologyMode; label: string }[] = [
    { id: "overview", label: "Topology overview" },
    { id: "metrics", label: "Metrics" },
    { id: "hierarchy", label: "Hierarchy" },
    { id: "circulation", label: "Circulation" },
    { id: "export", label: "Export" },
  ];
  const groups: { title: string; rows: Array<[string, number | null, string]> }[] = [
    {
      title: "Structure",
      rows: [
        ["Branch count", topology.branchCount, topology.reasons.branchCount ?? ANALYSIS_DEFINITIONS.branchCount],
        ["Endpoint count", topology.endpointCount, topology.reasons.endpointCount ?? ANALYSIS_DEFINITIONS.endpointCount],
        ["Connected components", topology.componentCount, topology.reasons.componentCount ?? ANALYSIS_DEFINITIONS.components],
      ],
    },
    {
      title: "Connectivity",
      rows: [
        ["Connectivity", topology.connectivity, topology.reasons.connectivity ?? ANALYSIS_DEFINITIONS.connectivity],
        ["Cycle rank", topology.cycleRank, topology.reasons.cycleRank ?? ANALYSIS_DEFINITIONS.cycleRank],
      ],
    },
    {
      title: "Distance",
      rows: [
        ["Average path length", topology.averagePathLength, topology.reasons.averagePathLength ?? ANALYSIS_DEFINITIONS.averagePathLength],
        ["Network diameter", topology.diameter, topology.reasons.diameter ?? ANALYSIS_DEFINITIONS.diameter],
      ],
    },
  ];
  const blocked =
    mode === "circulation" && !frame.flow
      ? frame.flowReason
      : mode === "hierarchy" && topology.reasons.hierarchy
        ? topology.reasons.hierarchy
        : null;
  return (
    <div className="s1a-topo-present">
      <div className="s1a-topo-tabs" role="group" aria-label="Topology views">
        {modes.map((item) => (
          <button key={item.id} type="button" aria-pressed={mode === item.id} onClick={() => onMode(item.id)}>
            {item.label}
          </button>
        ))}
      </div>
      <div className="s1a-topo-body">
        <div className="s1a-topo-stage">
          {mode === "export" ? (
            <div className="s1a-topo-export">
              <p>Export writes the current analysis snapshot for this simulation id. It does not start a new simulation.</p>
              <button type="button" onClick={onExport}>Download analysis JSON</button>
              <span>{frame.simulationId} · iteration {frame.iteration}</span>
            </div>
          ) : mode === "metrics" ? (
            <div className="s1a-topo-metrics s1a-topo-metrics-main">
              {groups.map((group) => (
                <section key={group.title}>
                  <h3>{group.title}</h3>
                  {group.rows.map(([label, value, reason]) => (
                    <div key={label} title={reason}>
                      <dt>{label}</dt>
                      <dd>{topoText(value, reason)}</dd>
                    </div>
                  ))}
                </section>
              ))}
            </div>
          ) : blocked ? (
            <p className="s1a-topo-blocked">{blocked}</p>
          ) : (
            <FieldCanvas
              className="s1a-topo-canvas"
              label="Network extracted from the trail field"
              deps={[mode, frame.iteration, frame.simulationId, topology.thresholdValue]}
              draw={(ctx, width, height) => {
                ctx.fillStyle = "#000";
                ctx.fillRect(0, 0, width, height);
                if (mode === "overview") {
                  paintTopologyNetwork(ctx, width, height, topology.mask, topology.skeleton, topology.endpoints, topology.branches, size);
                  return;
                }
                if (mode === "circulation" && frame.flow) {
                  paintMutedGrid(ctx, width, height, frame.flow, size);
                  drawPolarFrame(ctx, width, height);
                  return;
                }
                if (mode === "hierarchy") {
                  paintMutedGrid(ctx, width, height, topology.hierarchy.map((value) => (value < 0 ? 0 : value + 1)), size, topology.skeleton);
                  drawPolarFrame(ctx, width, height);
                }
              }}
            />
          )}
        </div>
        <aside className="s1a-topo-metrics" aria-label="Topology metrics">
          {groups.map((group) => (
            <section key={group.title}>
              <h3>{group.title}</h3>
              {group.rows.map(([label, value, reason]) => (
                <div key={label} title={reason}>
                  <dt>{label}</dt>
                  <dd>{topoText(value, reason)}</dd>
                </div>
              ))}
            </section>
          ))}
        </aside>
      </div>
      <div className="s1a-topo-legend">
        {mode === "hierarchy" || (mode === "circulation" && !blocked) ? (
          <>
            <span><i className="s1a-topo-swatch s1a-topo-skeleton" /> Low</span>
            <span><i className="s1a-topo-swatch s1a-topo-endpoint" /> High</span>
            <span>{mode === "hierarchy" ? "Skeleton distance from an endpoint" : "Agents in the last recorded step"}</span>
          </>
        ) : (
          <>
            <span><i className="s1a-topo-swatch s1a-topo-occupied" /> Occupancy (field)</span>
            <span><i className="s1a-topo-swatch s1a-topo-skeleton" /> Skeleton (centerline)</span>
            <span><i className="s1a-topo-swatch s1a-topo-branch" /> Branch node</span>
            <span><i className="s1a-topo-swatch s1a-topo-endpoint" /> Endpoint</span>
          </>
        )}
        <p>
          Threshold {topology.thresholdRatio.toFixed(2)} × peak mean
          {topology.occupiedCells ? ` (${topology.thresholdValue.toFixed(4)})` : ""}. Skeleton cells are a subset of occupied cells.
        </p>
      </div>
    </div>
  );
}

function TopologyTab({
  session,
  mode,
  onMode,
  onExport,
  presentation = false,
}: {
  session: AnalysisSession;
  mode: TopologyMode;
  onMode: (mode: TopologyMode) => void;
  onExport: () => void;
  presentation?: boolean;
}) {
  if (presentation) {
    return <PresentationTopology session={session} mode={mode} onMode={onMode} onExport={onExport} />;
  }
  const frame = session.latest;
  if (!frame) return null;
  const topology = frame.topology;
  const size = topology.size;
  const modes: { id: TopologyMode; label: string }[] = [
    { id: "overview", label: "Topology overview" },
    { id: "metrics", label: "Metrics" },
    { id: "hierarchy", label: "Hierarchy" },
    { id: "circulation", label: "Circulation" },
    { id: "export", label: "Export" },
  ];
  return (
    <div className="s1a-stack">
      <MetaLine session={session} frameIteration={frame.iteration} />
      <div className="s1a-subtabs">
        {modes.map((item) => (
          <button key={item.id} type="button" aria-pressed={mode === item.id} onClick={() => onMode(item.id)}>
            {item.label}
          </button>
        ))}
      </div>
      {mode === "metrics" ? (
        <MetricList
          rows={[
            ["Branch count", topology.branchCount, topology.reasons.branchCount ?? ANALYSIS_DEFINITIONS.branchCount],
            ["Endpoint count", topology.endpointCount, topology.reasons.endpointCount ?? ANALYSIS_DEFINITIONS.endpointCount],
            ["Connected components", topology.componentCount, topology.reasons.componentCount ?? ANALYSIS_DEFINITIONS.components],
            ["Cycle rank", topology.cycleRank, topology.reasons.cycleRank ?? ANALYSIS_DEFINITIONS.cycleRank],
            ["Connectivity", topology.connectivity, topology.reasons.connectivity ?? ANALYSIS_DEFINITIONS.connectivity],
            ["Average path length", topology.averagePathLength, topology.reasons.averagePathLength ?? ANALYSIS_DEFINITIONS.averagePathLength],
            ["Network diameter", topology.diameter, topology.reasons.diameter ?? ANALYSIS_DEFINITIONS.diameter],
          ]}
        />
      ) : mode === "export" ? (
        <div className="s1a-stack">
          <p className="s1a-note">Export writes the current analysis snapshot for this simulation id. It does not start a new simulation.</p>
          <button type="button" className="s1a-export" onClick={onExport}>
            Download analysis JSON
          </button>
          <p className="s1a-meta">{frame.simulationId} · iteration {frame.iteration}</p>
        </div>
      ) : mode === "circulation" && !frame.flow ? (
        <p className="s1a-note">{frame.flowReason}</p>
      ) : mode === "hierarchy" && topology.reasons.hierarchy ? (
        <p className="s1a-note">{topology.reasons.hierarchy}</p>
      ) : (
        <FieldCanvas
          label="Network extracted from the trail field"
          deps={[mode, frame.iteration, frame.simulationId, topology.thresholdValue]}
          draw={(ctx, width, height) => {
            ctx.fillStyle = "#000";
            ctx.fillRect(0, 0, width, height);
            const cellW = width / size;
            const cellH = height / size;
            if (mode === "circulation" && frame.flow) {
              paintGrid(ctx, width, height, frame.flow, size);
              return;
            }
            if (mode === "hierarchy") {
              paintGrid(ctx, width, height, topology.hierarchy.map((value) => (value < 0 ? 0 : value + 1)), size, topology.skeleton);
              return;
            }
            for (let y = 0; y < size; y += 1) {
              for (let x = 0; x < size; x += 1) {
                const index = y * size + x;
                if (!topology.mask[index] && !topology.skeleton[index]) continue;
                ctx.fillStyle = topology.skeleton[index] ? "rgba(127,208,207,0.9)" : "rgba(242,242,238,0.16)";
                ctx.fillRect(x * cellW, fieldToDisplayRow(y, size) * cellH, cellW + 0.5, cellH + 0.5);
              }
            }
            const mark = (indices: number[], color: string) => {
              ctx.fillStyle = color;
              for (const index of indices) {
                const x = index % size;
                const y = (index - x) / size;
                ctx.fillRect(x * cellW, fieldToDisplayRow(y, size) * cellH, Math.max(2, cellW), Math.max(2, cellH));
              }
            };
            mark(topology.endpoints, "#c77e5f");
            mark(topology.branches, "#f2f2ee");
          }}
        />
      )}
      <p className="s1a-note">
        Threshold {topology.thresholdRatio.toFixed(2)} × peak mean
        {topology.occupiedCells ? ` (${topology.thresholdValue.toFixed(4)})` : ""}. Skeleton cells are a subset of occupied cells. Endpoints are orange. Branch pixels are white.
      </p>
    </div>
  );
}

function MetricList({ rows }: { rows: Array<[string, number | null, string]> }) {
  return (
    <dl className="s1a-metrics">
      {rows.map(([label, value, reason]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd title={reason}>{value == null ? (reason.startsWith("Not yet") ? "Not yet computed" : "Not available") : value.toFixed(3)}</dd>
        </div>
      ))}
    </dl>
  );
}

function PresentationDensity({
  session,
  mode,
  onMode,
}: {
  session: AnalysisSession;
  mode: DensityMode;
  onMode: (mode: DensityMode) => void;
}) {
  const frame = session.latest;
  if (!frame) return null;
  const grids = frame.density;
  const values = mode === "occupancy" ? grids.occupancy : mode === "intensity" ? grids.intensity : grids.trailDensity;
  const definition =
    mode === "occupancy"
      ? ANALYSIS_DEFINITIONS.occupancyView
      : mode === "intensity"
        ? ANALYSIS_DEFINITIONS.intensity
        : ANALYSIS_DEFINITIONS.trailDensity;
  const stats = values ? gridStats(values) : null;
  const histogram = values ? concentrationHistogram(values) : null;
  const maxCount = histogram ? Math.max(...histogram.counts, 1) : 1;
  const size = grids.size;
  const modes: { id: DensityMode; label: string }[] = [
    { id: "trail", label: "Trail density" },
    { id: "occupancy", label: "Occupancy" },
    { id: "intensity", label: "Trail intensity" },
  ];
  const title = modes.find((item) => item.id === mode)?.label ?? "Spatial density";
  const occupiedCount = values && stats ? Math.round(stats.occupiedFraction * values.length) : 0;
  return (
    <div className="s1a-dens-present">
      <div className="s1a-dens-tabs" role="group" aria-label="Density views">
        {modes.map((item) => (
          <button key={item.id} type="button" aria-pressed={mode === item.id} onClick={() => onMode(item.id)}>
            {item.label}
          </button>
        ))}
      </div>
      {!values || !stats || !histogram ? (
        <div className="s1a-dens-body">
          <div className="s1a-dens-stage">
            <header>
              <h3>{title}</h3>
              <span>Field X → · Field Y ↑ · iteration {frame.iteration}</span>
            </header>
            <p className="s1a-dens-missing">{definition}</p>
          </div>
          <aside className="s1a-dens-side">
            <p className="s1a-dens-note">This simulation has no stored grid for the selected view, so the heatmap and its statistics are not shown.</p>
          </aside>
        </div>
      ) : (
        <div className="s1a-dens-body">
          <div className="s1a-dens-stage">
            <header>
              <h3>{title}</h3>
              <span>Field X → · Field Y ↑ · iteration {frame.iteration}</span>
            </header>
            <FieldCanvas
              className="s1a-dens-canvas"
              label={definition}
              deps={[mode, frame.iteration, frame.simulationId, stats.max, stats.threshold]}
              draw={(ctx, width, height) => {
                ctx.fillStyle = "#000";
                ctx.fillRect(0, 0, width, height);
                const left = Math.max(44, width * 0.07);
                const bottom = Math.max(36, height * 0.06);
                const top = 10;
                const right = 10;
                const plotW = width - left - right;
                const plotH = height - top - bottom;
                const cellW = plotW / size;
                const cellH = plotH / size;
                const max = stats.max;
                paintDensityChart(ctx, values, size, left, top, plotW, plotH, max);
                if (mode === "trail") {
                  ctx.save();
                  ctx.strokeStyle = "rgba(242, 242, 238, 0.82)";
                  ctx.lineWidth = Math.max(1, Math.min(cellW, cellH) * 0.045);
                  ctx.lineCap = "round";
                  ctx.lineJoin = "round";
                  ctx.beginPath();
                  for (const [x0, y0, x1, y1] of skeletonSegments(frame.topology.skeleton, size)) {
                    ctx.moveTo(left + (x0 + 0.5) * cellW, top + (fieldToDisplayRow(y0, size) + 0.5) * cellH);
                    ctx.lineTo(left + (x1 + 0.5) * cellW, top + (fieldToDisplayRow(y1, size) + 0.5) * cellH);
                  }
                  ctx.stroke();
                  ctx.restore();
                }
                ctx.fillStyle = "rgba(242,242,238,0.78)";
                const font = Math.max(13, Math.round(height * 0.028));
                ctx.font = `${font}px sans-serif`;
                ctx.textAlign = "center";
                ctx.textBaseline = "top";
                for (const tick of [0, Math.floor(size / 2), size - 1]) {
                  ctx.fillText(String(tick), left + (tick + 0.5) * cellW, top + plotH + 6);
                }
                ctx.textAlign = "right";
                ctx.textBaseline = "middle";
                for (const tick of [0, Math.floor(size / 2), size - 1]) {
                  ctx.fillText(String(tick), left - 8, top + (fieldToDisplayRow(tick, size) + 0.5) * cellH);
                }
              }}
            />
          </div>
          <aside className="s1a-dens-side" aria-label={`${title} measurements`}>
            {mode === "occupancy" ? (
              <div className="s1a-dens-mask" aria-hidden="true">
                <span><i /> Below {stats.threshold.toFixed(4)}</span>
                <span><i /> At or above {stats.threshold.toFixed(4)}</span>
              </div>
            ) : (
              <div className="s1a-dens-legend" aria-hidden="true">
                <i />
                <div>
                  <span>{stats.max.toFixed(4)}</span>
                  <span>{(stats.max * 0.74).toFixed(4)}</span>
                  <span>{(stats.max * 0.42).toFixed(4)}</span>
                  <span>0</span>
                </div>
              </div>
            )}
            <p className="s1a-dens-scale">
              {mode === "occupancy"
                ? `Mask uses 12% of this grid’s maximum (${stats.max.toFixed(4)}).`
                : `Color is linear from 0 to this grid’s maximum (${stats.max.toFixed(4)}). White is that maximum.`}
            </p>
            <dl>
              {mode === "occupancy" ? (
                <>
                  <div><dt>Occupied cells</dt><dd>{occupiedCount}</dd></div>
                  <div><dt>Occupied</dt><dd>{(stats.occupiedFraction * 100).toFixed(1)}%</dd></div>
                  <div><dt>Threshold</dt><dd>{stats.threshold.toFixed(4)}</dd></div>
                </>
              ) : mode === "intensity" ? (
                <>
                  <div><dt>Maximum intensity</dt><dd>{stats.max.toFixed(4)}</dd></div>
                  <div><dt>Mean peak intensity</dt><dd>{stats.mean.toFixed(4)}</dd></div>
                </>
              ) : (
                <>
                  <div><dt>Mean density</dt><dd>{stats.mean.toFixed(4)}</dd></div>
                  <div><dt>Maximum density</dt><dd>{stats.max.toFixed(4)}</dd></div>
                </>
              )}
            </dl>
            <div className="s1a-dens-hist" aria-label="Distribution across this grid’s own maximum">
              {histogram.counts.map((count, index) => (
                <span
                  key={index}
                  className={index === histogram.counts.length - 1 ? "s1a-hist-peak" : index === histogram.counts.length - 2 ? "s1a-hist-mid" : undefined}
                  style={{ height: `${Math.max(count > 0 ? 4 : 0, (count / maxCount) * 100)}%` }}
                  title={`${count} cells`}
                />
              ))}
            </div>
            <p className="s1a-dens-note">
              {mode === "intensity"
                ? "Each cell is the maximum trail sample in that 20×20 block. The field color follows that value, linearly, and does not rise above the recorded maximum."
                : mode === "occupancy"
                  ? "Stored simulator occupancy. Occupied cells are those at or above the same 12% of peak used by this view. The mask does not recompute occupancy."
                  : "Each cell is the mean trail in that 20×20 block."}
              {mode === "trail" && grids.occupancyAligned != null
                ? ` Trail density ${grids.occupancyAligned ? "matches" : "does not match"} the stored occupancy grid.`
                : ""}
              {" "}Distribution bins split 0 to this view’s maximum into {histogram.counts.length} equal parts.
            </p>
          </aside>
        </div>
      )}
    </div>
  );
}

function DensityTab({
  session,
  mode,
  onMode,
  presentation = false,
}: {
  session: AnalysisSession;
  mode: DensityMode;
  onMode: (mode: DensityMode) => void;
  presentation?: boolean;
}) {
  if (presentation) {
    return <PresentationDensity session={session} mode={mode} onMode={onMode} />;
  }
  const frame = session.latest;
  if (!frame) return null;
  const grids = frame.density;
  const values =
    mode === "occupancy" ? grids.occupancy : mode === "intensity" ? grids.intensity : grids.trailDensity;
  const definition =
    mode === "occupancy"
      ? ANALYSIS_DEFINITIONS.occupancyView
      : mode === "intensity"
        ? ANALYSIS_DEFINITIONS.intensity
        : ANALYSIS_DEFINITIONS.trailDensity;
  const stats = values ? gridStats(values) : null;
  const histogram = values ? concentrationHistogram(values) : null;
  const maxCount = histogram ? Math.max(...histogram.counts, 1) : 1;
  return (
    <div className="s1a-stack">
      <MetaLine session={session} frameIteration={frame.iteration} />
      <div className="s1a-subtabs">
        {(
          [
            ["trail", "Trail density"],
            ["occupancy", "Occupancy"],
            ["intensity", "Trail intensity"],
          ] as const
        ).map(([id, label]) => (
          <button key={id} type="button" aria-pressed={mode === id} onClick={() => onMode(id)}>
            {label}
          </button>
        ))}
      </div>
      {!values || !stats || !histogram ? (
        <p className="s1a-note">{definition}</p>
      ) : (
        <>
          <FieldCanvas
            label={definition}
            deps={[mode, frame.iteration, frame.simulationId, stats.max]}
            draw={(ctx, width, height) => {
              ctx.fillStyle = "#000";
              ctx.fillRect(0, 0, width, height);
              paintGrid(ctx, width, height, values, grids.size);
            }}
          />
          <div className="s1a-scale" aria-hidden="true">
            <span>0</span>
            <i />
            <span>{stats.max.toFixed(3)}</span>
          </div>
          <dl className="s1a-metrics">
            <div>
              <dt>Mean density</dt>
              <dd>{stats.mean.toFixed(4)}</dd>
            </div>
            <div>
              <dt>Maximum density</dt>
              <dd>{stats.max.toFixed(4)}</dd>
            </div>
            <div>
              <dt>Occupied cells</dt>
              <dd>{(stats.occupiedFraction * 100).toFixed(1)}%</dd>
            </div>
          </dl>
          <div className="s1a-hist" aria-label="Concentration distribution">
            {histogram.counts.map((count, index) => (
              <span key={index} style={{ height: `${Math.max(4, (count / maxCount) * 100)}%` }} title={`${count} cells`} />
            ))}
          </div>
          <p className="s1a-note">
            {definition} Occupied percentage counts displayed cells at or above {stats.threshold.toFixed(4)}, which is 12% of this view&apos;s maximum.
            {mode === "trail" && grids.occupancyAligned != null
              ? ` Trail density ${grids.occupancyAligned ? "matches" : "does not match"} the stored occupancy grid.`
              : ""}
          </p>
        </>
      )}
    </div>
  );
}

const COMPASS_LABELS = ["W", "WSW", "SW", "SSW", "S", "SSE", "SE", "ESE", "E", "ENE", "NE", "NNE", "N", "NNW", "NW", "WNW"];

function directionBin(angle: number, count: number) {
  let turns = (angle + Math.PI) / (Math.PI * 2);
  if (turns >= 1) turns -= 1;
  return Math.min(count - 1, Math.max(0, Math.floor(turns * count)));
}

function binCenterDegrees(index: number, count: number) {
  return -180 + (index + 0.5) * (360 / count);
}

function compassWedge(index: number, count: number, inner: number, outer: number) {
  const step = (Math.PI * 2) / count;
  const start = -Math.PI + index * step;
  const point = (angle: number, radius: number) => `${(Math.cos(angle) * radius).toFixed(2)},${(-Math.sin(angle) * radius).toFixed(2)}`;
  const slices = 8;
  let path = `M ${point(start, inner)} L ${point(start, outer)}`;
  for (let i = 1; i <= slices; i += 1) path += ` L ${point(start + (step * i) / slices, outer)}`;
  path += ` L ${point(start + step, inner)}`;
  for (let i = slices - 1; i >= 0; i -= 1) path += ` L ${point(start + (step * i) / slices, inner)}`;
  return `${path} Z`;
}

function PresentationDirection({
  session,
  mode,
  onMode,
}: {
  session: AnalysisSession;
  mode: DirectionMode;
  onMode: (mode: DirectionMode) => void;
}) {
  const frame = session.latest;
  if (!frame) return null;
  const report = frame.direction;
  const accumulated = mode === "accumulated";
  const bins = accumulated ? report.accumulatedBins : report.instantaneousBins;
  const coherence = accumulated ? report.accumulatedCoherence : report.instantaneousCoherence;
  const bias = accumulated ? report.accumulatedBias : report.instantaneousBias;
  const dominant = dominantBinLabel(bins);
  const missing = accumulated ? report.reasons.accumulated : report.reasons.instantaneous;
  const samples = bins.reduce((sum, count) => sum + count, 0);
  const maxBin = Math.max(...bins, 0);
  const counts = accumulated ? report.sumCount : report.instantaneousCount;
  let vectorCells = 0;
  for (const count of counts) if (count > 0) vectorCells += 1;
  const lengthValue = accumulated ? report.meanSegmentLength : report.latestStepLength;
  const unavailable = Boolean(missing) && (accumulated ? report.accumulatedSegments === 0 : frame.agentCount === 0);
  const modes: { id: DirectionMode; label: string }[] = [
    { id: "accumulated", label: "Accumulated directionality" },
    { id: "instantaneous", label: "Instantaneous directionality" },
  ];
  return (
    <div className="s1a-dir-present">
      <div className="s1a-dir-tabs" role="group" aria-label="Directionality views">
        {modes.map((item) => (
          <button key={item.id} type="button" aria-pressed={mode === item.id} onClick={() => onMode(item.id)}>
            {item.label}
          </button>
        ))}
      </div>
      {unavailable ? (
        <div className="s1a-dir-body">
          <div className="s1a-dir-stage">
            <p className="s1a-dir-missing">{missing}</p>
          </div>
          <aside className="s1a-dir-side">
            <p className="s1a-dir-note">No recorded samples are available for this mode, so no vectors or distribution are shown.</p>
          </aside>
        </div>
      ) : (
        <div className="s1a-dir-body">
          <div className="s1a-dir-stage">
            <header>
              <h3>{accumulated ? "Accumulated paths" : "Instantaneous headings"}</h3>
              <span>Field X → · Field Y ↑ · iteration {frame.iteration}</span>
            </header>
            <FieldCanvas
              className="s1a-dir-canvas"
              label={accumulated ? ANALYSIS_DEFINITIONS.accumulatedDirection : ANALYSIS_DEFINITIONS.instantaneousDirection}
              deps={[mode, frame.iteration, frame.simulationId, report.accumulatedSegments, frame.agentCount]}
              draw={(ctx, width, height) => {
                ctx.fillStyle = "#000";
                ctx.fillRect(0, 0, width, height);
                const size = frame.density.size;
                const xs = accumulated ? report.sumX : report.instantaneousX;
                const ys = accumulated ? report.sumY : report.instantaneousY;
                const left = Math.max(44, width * 0.07);
                const bottom = Math.max(36, height * 0.06);
                const top = 10;
                const plotW = width - left - 10;
                const plotH = height - top - bottom;
                const cellW = plotW / size;
                const cellH = plotH / size;
                paintPlotGrid(ctx, left, top, plotW, plotH, size);
                let maxMag = 0;
                const mags = counts.map((count, index) => {
                  if (!count) return 0;
                  const mag = Math.hypot(xs[index], ys[index]) / count;
                  if (mag > maxMag) maxMag = mag;
                  return mag;
                });
                const span = Math.min(cellW, cellH);
                ctx.save();
                ctx.strokeStyle = "rgba(15, 115, 119, 0.34)";
                ctx.lineWidth = Math.max(1, span * 0.08);
                ctx.lineCap = "round";
                for (let y = 0; y < size; y += 1) {
                  for (let x = 0; x < size; x += 1) {
                    const index = y * size + x;
                    if (!counts[index] || maxMag <= 0 || mags[index] <= 0) continue;
                    const cx = left + (x + 0.5) * cellW;
                    const cy = top + (fieldToDisplayRow(y, size) + 0.5) * cellH;
                    const dx = xs[index] / counts[index];
                    const dy = ys[index] / counts[index];
                    const mag = Math.hypot(dx, dy) || 1;
                    const length = span * 0.72 * Math.sqrt(mags[index] / maxMag);
                    ctx.beginPath();
                    ctx.moveTo(cx, cy);
                    ctx.lineTo(cx + (dx / mag) * length, cy - (dy / mag) * length);
                    ctx.stroke();
                  }
                }
                ctx.restore();
                for (let y = 0; y < size; y += 1) {
                  for (let x = 0; x < size; x += 1) {
                    const index = y * size + x;
                    if (!counts[index] || maxMag <= 0 || mags[index] <= 0) continue;
                    const cx = left + (x + 0.5) * cellW;
                    const cy = top + (fieldToDisplayRow(y, size) + 0.5) * cellH;
                    const dx = xs[index] / counts[index];
                    const dy = ys[index] / counts[index];
                    const mag = Math.hypot(dx, dy) || 1;
                    const length = span * (0.22 + 0.28 * Math.sqrt(mags[index] / maxMag));
                    const ex = cx + (dx / mag) * length;
                    const ey = cy - (dy / mag) * length;
                    const dominantCell = dominant != null && directionBin(Math.atan2(dy, dx), bins.length) === dominant.index;
                    ctx.save();
                    ctx.globalAlpha = dominantCell ? 0.95 : 0.55;
                    ctx.strokeStyle = dominantCell ? CHART_COPPER : CHART_CYAN;
                    ctx.fillStyle = ctx.strokeStyle;
                    ctx.lineWidth = dominantCell ? Math.max(1.1, span * 0.045) : Math.max(0.8, span * 0.028);
                    ctx.lineCap = "round";
                    ctx.beginPath();
                    ctx.moveTo(cx, cy);
                    ctx.lineTo(ex, ey);
                    ctx.stroke();
                    const head = Math.max(2.4, Math.min(span * 0.16, length * 0.38));
                    const ang = Math.atan2(ey - cy, ex - cx);
                    ctx.beginPath();
                    ctx.moveTo(ex, ey);
                    ctx.lineTo(ex - head * Math.cos(ang - 0.4), ey - head * Math.sin(ang - 0.4));
                    ctx.lineTo(ex - head * Math.cos(ang + 0.4), ey - head * Math.sin(ang + 0.4));
                    ctx.closePath();
                    ctx.fill();
                    ctx.restore();
                  }
                }
                ctx.fillStyle = "rgba(242,242,238,0.78)";
                ctx.font = `${Math.max(13, Math.round(height * 0.028))}px sans-serif`;
                ctx.textAlign = "center";
                ctx.textBaseline = "top";
                for (const tick of [0, Math.floor(size / 2), size - 1]) {
                  ctx.fillText(String(tick), left + (tick + 0.5) * cellW, top + plotH + 6);
                }
                ctx.textAlign = "right";
                ctx.textBaseline = "middle";
                for (const tick of [0, Math.floor(size / 2), size - 1]) {
                  ctx.fillText(String(tick), left - 8, top + (fieldToDisplayRow(tick, size) + 0.5) * cellH);
                }
              }}
            />
            <p className="s1a-dir-key">
              <i className="s1a-dir-teal" /> Recorded direction
              <i className="s1a-dir-terra" /> Dominant bin
              <span>Empty cells have no sample. Arrow length follows the cell mean, from 22% to 50% of the cell. Dominant arrows keep that length and are marked in terracotta.</span>
            </p>
          </div>
          <aside className="s1a-dir-side" aria-label="Direction measurements">
            <svg className="s1a-dir-compass" viewBox="-120 -120 240 240" role="img" aria-label="Directional compass">
              <circle cx="0" cy="0" r="104" fill="none" stroke="rgba(73,215,222,0.28)" strokeWidth="0.6" />
              <circle cx="0" cy="0" r="82" fill="none" stroke="rgba(73,215,222,0.16)" strokeWidth="0.5" />
              <circle cx="0" cy="0" r="58" fill="none" stroke="rgba(73,215,222,0.12)" strokeWidth="0.5" />
              <circle cx="0" cy="0" r="34" fill="none" stroke="rgba(73,215,222,0.1)" strokeWidth="0.5" />
              {Array.from({ length: 32 }, (_, index) => {
                const angle = (index / 32) * Math.PI * 2;
                const inner = index % 4 === 0 ? 86 : 96;
                return (
                  <line
                    key={`tick-${index}`}
                    x1={Math.cos(angle) * inner}
                    y1={Math.sin(angle) * inner}
                    x2={Math.cos(angle) * 104}
                    y2={Math.sin(angle) * 104}
                    stroke="rgba(73,215,222,0.7)"
                    strokeWidth={index % 4 === 0 ? 1.4 : 0.7}
                  />
                );
              })}
              {dominant && maxBin > 0 ? (
                <path
                  d={compassWedge(dominant.index, bins.length, 18, 100)}
                  fill="rgba(199,126,95,0.28)"
                  stroke="#c77e5f"
                  strokeWidth="1"
                />
              ) : null}
              <circle cx="0" cy="0" r="3.5" fill="#f2f2ee" />
              {bins.map((count, index) => {
                if (count <= 0 || maxBin <= 0) return null;
                const angle = -Math.PI + (index + 0.5) * ((Math.PI * 2) / bins.length);
                const len = 28 + (count / maxBin) * 68;
                const x2 = Math.cos(angle) * len;
                const y2 = -Math.sin(angle) * len;
                const marked = dominant != null && index === dominant.index;
                return <line key={index} x1="0" y1="0" x2={x2} y2={y2} stroke={marked ? "#c77e5f" : "rgba(73,215,222,0.8)"} strokeWidth={marked ? 1.6 : 0.7} />;
              })}
              <text x="0" y="-108" textAnchor="middle" fill="#f2f2ee">N</text>
              <text x="108" y="5" textAnchor="middle" fill="#f2f2ee">E</text>
              <text x="0" y="116" textAnchor="middle" fill="#f2f2ee">S</text>
              <text x="-108" y="5" textAnchor="middle" fill="#f2f2ee">W</text>
            </svg>
            <div className="s1a-dir-hist" aria-label="Directional distribution">
              <div className="s1a-dir-hist-scale">
                <span>{maxBin}</span>
                <span>0</span>
              </div>
              <div className="s1a-dir-hist-bars">
                {bins.map((count, index) => (
                  <span
                    key={index}
                    className={dominant != null && index === dominant.index && count > 0 ? "s1a-dir-dominant" : undefined}
                    style={{ height: maxBin > 0 ? `${(count / maxBin) * 100}%` : "0%" }}
                    title={`${COMPASS_LABELS[index] ?? index} · ${binCenterDegrees(index, bins.length).toFixed(1)}° · ${count} samples`}
                  />
                ))}
              </div>
            </div>
            <div className="s1a-dir-degrees" aria-hidden="true">
              {bins.map((_, index) => (
                <span key={index}>{index % 4 === 0 ? `${Math.round(binCenterDegrees(index, bins.length))}°` : ""}</span>
              ))}
            </div>
            <dl>
              <div>
                <dt>Dominant direction</dt>
                <dd title={dominant ? `${dominant.count} of ${samples} samples` : missing ?? "Not yet computed"}>
                  {dominant ? `${dominant.label} · ${binCenterDegrees(dominant.index, bins.length).toFixed(1)}°` : "N/A"}
                </dd>
              </div>
              <div>
                <dt>Directional coherence</dt>
                <dd title="0–1 resultant length">{coherence == null ? "N/A" : coherence.toFixed(3)}</dd>
              </div>
              <div>
                <dt>Directional bias</dt>
                <dd title="−1 to 1. Dominant bin minus the opposite bin, divided by the sample count.">{bias == null ? "N/A" : bias.toFixed(3)}</dd>
              </div>
              <div>
                <dt>Movement samples</dt>
                <dd>{samples}</dd>
              </div>
              <div>
                <dt>{accumulated ? "Mean segment length" : "Latest step length"}</dt>
                <dd>{lengthValue == null ? "N/A" : lengthValue.toFixed(3)}</dd>
              </div>
            </dl>
            <p className="s1a-dir-note">
              {accumulated
                ? "Accumulated from path segments still in the 80-point agent history when each sample was taken. Segments already shifted out of that buffer are not reconstructed, so this is not the entire run."
                : "Headings of the agents present at this iteration. These are directions, not accumulated paths."}
              {" "}{vectorCells} of {frame.density.size * frame.density.size} cells contain a recorded vector.
              {" "}0° is east and 90° is north, from atan2 of field Y and field X. Coherence is 0–1. Bias is −1 to 1.
            </p>
          </aside>
        </div>
      )}
    </div>
  );
}

function DirectionTab({
  session,
  mode,
  onMode,
  presentation = false,
}: {
  session: AnalysisSession;
  mode: DirectionMode;
  onMode: (mode: DirectionMode) => void;
  presentation?: boolean;
}) {
  if (presentation) {
    return <PresentationDirection session={session} mode={mode} onMode={onMode} />;
  }
  const frame = session.latest;
  if (!frame) return null;
  const report = frame.direction;
  const accumulated = mode === "accumulated";
  const bins = accumulated ? report.accumulatedBins : report.instantaneousBins;
  const coherence = accumulated ? report.accumulatedCoherence : report.instantaneousCoherence;
  const bias = accumulated ? report.accumulatedBias : report.instantaneousBias;
  const dominant = dominantBinLabel(bins);
  const missing = accumulated ? report.reasons.accumulated : report.reasons.instantaneous;
  const maxBin = Math.max(...bins, 1);
  return (
    <div className="s1a-stack">
      <MetaLine session={session} frameIteration={frame.iteration} />
      <div className="s1a-subtabs">
        <button type="button" aria-pressed={mode === "accumulated"} onClick={() => onMode("accumulated")}>
          Accumulated paths
        </button>
        <button type="button" aria-pressed={mode === "instantaneous"} onClick={() => onMode("instantaneous")}>
          Instantaneous headings
        </button>
      </div>
      {missing && (accumulated ? report.accumulatedSegments === 0 : frame.agentCount === 0) ? (
        <p className="s1a-note">{missing}</p>
      ) : (
        <>
          <FieldCanvas
            label={accumulated ? ANALYSIS_DEFINITIONS.accumulatedDirection : ANALYSIS_DEFINITIONS.instantaneousDirection}
            deps={[mode, frame.iteration, frame.simulationId, report.accumulatedSegments]}
            draw={(ctx, width, height) => {
              ctx.fillStyle = "#000";
              ctx.fillRect(0, 0, width, height);
              const size = frame.density.size;
              const xs = accumulated ? report.sumX : report.instantaneousX;
              const ys = accumulated ? report.sumY : report.instantaneousY;
              const counts = accumulated ? report.sumCount : report.instantaneousCount;
              let maxMag = 0;
              const mags = counts.map((count, index) => {
                if (!count) return 0;
                const mag = Math.hypot(xs[index], ys[index]) / count;
                if (mag > maxMag) maxMag = mag;
                return mag;
              });
              const cellW = width / size;
              const cellH = height / size;
              ctx.strokeStyle = "#7fd0cf";
              ctx.lineWidth = 1;
              for (let y = 0; y < size; y += 1) {
                for (let x = 0; x < size; x += 1) {
                  const index = y * size + x;
                  if (!counts[index] || maxMag <= 0) continue;
                  const cx = (x + 0.5) * cellW;
                  const cy = (fieldToDisplayRow(y, size) + 0.5) * cellH;
                  const scale = (mags[index] / maxMag) * Math.min(cellW, cellH) * 0.42;
                  const dx = xs[index] / counts[index];
                  const dy = ys[index] / counts[index];
                  const mag = Math.hypot(dx, dy) || 1;
                  const ex = cx + (dx / mag) * scale;
                  const ey = cy - (dy / mag) * scale;
                  ctx.beginPath();
                  ctx.moveTo(cx, cy);
                  ctx.lineTo(ex, ey);
                  ctx.stroke();
                }
              }
            }}
          />
          <div className="s1a-compass" aria-label="Orientation histogram">
            {bins.map((count, index) => (
              <span key={index} style={{ height: `${Math.max(3, (count / maxBin) * 100)}%` }} title={`${count}`} />
            ))}
          </div>
          <dl className="s1a-metrics">
            <div>
              <dt>Dominant direction</dt>
              <dd>{dominant ? `${dominant.label} ${(dominant.share * 100).toFixed(1)}%` : "Not yet computed"}</dd>
            </div>
            <div>
              <dt>Coherence</dt>
              <dd>{coherence == null ? "Not yet computed" : coherence.toFixed(3)}</dd>
            </div>
            <div>
              <dt>Directional bias</dt>
              <dd>{bias == null ? "Not yet computed" : bias.toFixed(3)}</dd>
            </div>
            <div>
              <dt>{accumulated ? "Mean segment length" : "Latest step length"}</dt>
              <dd>
                {accumulated
                  ? report.meanSegmentLength == null
                    ? "Not yet computed"
                    : report.meanSegmentLength.toFixed(3)
                  : report.latestStepLength == null
                    ? "Not yet computed"
                    : report.latestStepLength.toFixed(3)}
              </dd>
            </div>
          </dl>
        </>
      )}
      <p className="s1a-note">
        {accumulated ? ANALYSIS_DEFINITIONS.accumulatedDirection : ANALYSIS_DEFINITIONS.instantaneousDirection}{" "}
        {ANALYSIS_DEFINITIONS.coherence} {ANALYSIS_DEFINITIONS.bias} Screen north is increasing field Y, matching the generator.
      </p>
    </div>
  );
}
