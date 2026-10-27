"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type MouseEvent } from "react";
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

const INTERVALS = [4, 8, 16, 32];

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

function SeriesChart({
  samples,
  read,
  label,
  color,
}: {
  samples: GrowthSample[];
  read: (sample: GrowthSample) => number | null;
  label: string;
  color: string;
}) {
  const values = samples.map(read);
  const numbers = values.filter((value): value is number => value != null);
  const max = numbers.length ? Math.max(...numbers) : 0;
  const min = numbers.length ? Math.min(...numbers) : 0;
  const span = max - min || 1;
  const width = 320;
  const height = 92;
  let path = "";
  values.forEach((value, index) => {
    if (value == null) return;
    const x = samples.length === 1 ? width / 2 : (index / (samples.length - 1)) * width;
    const y = height - ((value - min) / span) * (height - 8) - 4;
    path += `${path ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)} `;
  });
  return (
    <figure className="s1a-chart">
      <figcaption>
        <span>{label}</span>
        <span>
          {numbers.length ? `${min.toFixed(3)} – ${max.toFixed(3)}` : "Not yet computed"}
        </span>
      </figcaption>
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label}>
        <path d={path.trim()} fill="none" stroke={color} strokeWidth="1.6" />
      </svg>
    </figure>
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
  sampleInterval,
  onSampleInterval,
}: {
  session: AnalysisSession | null;
  simulating: boolean;
  sampleInterval: number;
  onSampleInterval: (value: number) => void;
}) {
  const { ref: surfaceRef, presentation } = usePresentationSurface();
  const [tab, setTab] = useState<AnalysisTabId>("dna");
  const [densityMode, setDensityMode] = useState<DensityMode>("trail");
  const [topologyMode, setTopologyMode] = useState<TopologyMode>("overview");
  const [directionMode, setDirectionMode] = useState<DirectionMode>("accumulated");
  const frame = frameForTab(session, tab);
  const shownSnapshots = useMemo(
    () => evenSamples(session?.samples.filter((sample) => sample.meanGrid.some((value) => value > 0)) ?? [], 8),
    [session],
  );

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
          {ANALYSIS_TABS.map((item) => (
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
            <DnaTab axes={frame.dna} presentation={presentation} />
          ) : tab === "growth" ? (
            <GrowthTab
              session={session}
              snapshots={shownSnapshots}
              sampleInterval={sampleInterval}
              onSampleInterval={onSampleInterval}
              presentation={presentation}
              simulating={simulating}
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

function MetricGlyph() {
  return (
    <svg className="s1a-p-glyph" viewBox="-12 -12 24 24" aria-hidden="true">
      <circle r="10" fill="none" stroke="rgba(242,242,238,0.28)" strokeWidth="0.6" />
      <circle r="6" fill="none" stroke="rgba(242,242,238,0.16)" strokeWidth="0.5" />
      <path d="M0,-9.2 L8,4.6 L-8,4.6 Z" fill="rgba(199,126,95,0.12)" stroke="#c77e5f" strokeWidth="0.7" />
      <path d="M0,-4.2 L4.6,3.2 L-3.4,2.4 Z" fill="rgba(15,115,119,0.16)" stroke="#0f7377" strokeWidth="0.7" />
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

function PresentationDna({ axes }: { axes: DnaAxis[] }) {
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
                  <MetricGlyph />
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
    </div>
  );
}

function DnaTab({ axes, presentation = false }: { axes: DnaAxis[]; presentation?: boolean }) {
  if (presentation) return <PresentationDna axes={axes} />;
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
    </div>
  );
}

const GROWTH_PLOT = { width: 1000, height: 460, left: 72, right: 28, top: 20, bottom: 46 };

const GROWTH_SERIES = [
  {
    id: "occupied",
    label: "Occupied area",
    unit: "fraction of field cells",
    color: "#0F7377",
    dash: undefined,
    absolute: true,
    read: (sample: GrowthSample) => sample.occupiedFraction,
    format: (value: number) => value.toFixed(3),
  },
  {
    id: "branch",
    label: "Branch count",
    unit: "skeleton pixels",
    color: "#C77E5F",
    dash: undefined,
    absolute: false,
    read: (sample: GrowthSample) => sample.branchCount,
    format: (value: number) => String(Math.round(value)),
  },
  {
    id: "trail",
    label: "Mean trail density",
    unit: "mean of the trail grid",
    color: "#f2f2ee",
    dash: undefined,
    absolute: false,
    read: (sample: GrowthSample) => sample.meanTrail,
    format: (value: number) => value.toFixed(3),
  },
  {
    id: "stable",
    label: "Network stabilization",
    unit: "0–1 change score",
    color: "#b7b7b2",
    dash: "6 4",
    absolute: true,
    read: (sample: GrowthSample) => sample.stabilization,
    format: (value: number) => value.toFixed(3),
  },
] as const;

function growthExtent(samples: GrowthSample[], read: (sample: GrowthSample) => number | null) {
  const values = samples.map(read).filter((value): value is number => value != null);
  if (!values.length) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  return { min, max, span: max - min };
}

function growthNorm(value: number, extent: { min: number; span: number } | null, absolute: boolean) {
  if (absolute) return Math.max(0, Math.min(1, value));
  if (!extent || extent.span === 0) return 0;
  return (value - extent.min) / extent.span;
}

function growthPath(
  samples: GrowthSample[],
  read: (sample: GrowthSample) => number | null,
  extent: { min: number; span: number } | null,
  absolute: boolean,
) {
  const { width, height, left, right, top, bottom } = GROWTH_PLOT;
  const plotW = width - left - right;
  const plotH = height - top - bottom;
  const paths: string[] = [];
  let run = "";
  const flush = () => {
    if (run) paths.push(run.trim());
    run = "";
  };
  samples.forEach((sample, index) => {
    const value = read(sample);
    if (value == null) {
      flush();
      return;
    }
    const x = samples.length === 1 ? left + plotW / 2 : left + (index / (samples.length - 1)) * plotW;
    const y = top + (1 - growthNorm(value, extent, absolute)) * plotH;
    run += `${run ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)} `;
  });
  flush();
  return paths;
}

function growthX(index: number, count: number) {
  const { width, left, right } = GROWTH_PLOT;
  const plotW = width - left - right;
  if (count <= 1) return left + plotW / 2;
  return left + (index / (count - 1)) * plotW;
}

function regimeTone(regime: string) {
  if (regime === "Exploration") return "#0F7377";
  if (regime === "Reinforcement") return "#C77E5F";
  if (regime === "Convergence") return "#f2f2ee";
  return "rgba(242,242,238,0.28)";
}

function regimeRuns(samples: GrowthSample[]) {
  const runs: { regime: string; rule: string; start: number; count: number }[] = [];
  samples.forEach((sample, index) => {
    const last = runs[runs.length - 1];
    if (last && last.regime === sample.regime) last.count += 1;
    else runs.push({ regime: sample.regime, rule: sample.regimeRule, start: index, count: 1 });
  });
  return runs;
}

function PresentationGrowth({
  session,
  snapshots,
  sampleInterval,
  onSampleInterval,
  simulating,
}: {
  session: AnalysisSession;
  snapshots: GrowthSample[];
  sampleInterval: number;
  onSampleInterval: (value: number) => void;
  simulating: boolean;
}) {
  const samples = session.samples;
  const [enabled, setEnabled] = useState<Record<string, boolean>>({
    occupied: true,
    branch: true,
    trail: true,
    stable: true,
  });
  const [selectedIteration, setSelectedIteration] = useState<number | null>(null);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const inspected =
    (selectedIteration == null ? null : samples.find((sample) => sample.iteration === selectedIteration)) ??
    samples[samples.length - 1] ??
    null;
  const selectedIndex = inspected ? samples.findIndex((sample) => sample.iteration === inspected.iteration) : -1;
  const extents = GROWTH_SERIES.map((series) => growthExtent(samples, series.read));
  const runs = regimeRuns(samples);
  const hover = hoverIndex == null ? null : samples[hoverIndex] ?? null;
  const simulator = session.latest?.converged ? "Simulator converged" : simulating ? "Simulator running" : "Simulator held";

  const inspectPlot = (event: MouseEvent<SVGRectElement>, commit: boolean) => {
    if (samples.length === 0) return;
    const svg = event.currentTarget.ownerSVGElement;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const view = svg.viewBox.baseVal;
    const scale = Math.min(rect.width / view.width, rect.height / view.height);
    const offsetX = (rect.width - view.width * scale) / 2;
    const x = (event.clientX - rect.left - offsetX) / scale;
    const { width, left, right } = GROWTH_PLOT;
    const plotW = width - left - right;
    const ratio = plotW === 0 ? 0 : (x - left) / plotW;
    const index = samples.length === 1 ? 0 : Math.round(Math.max(0, Math.min(1, ratio)) * (samples.length - 1));
    setHoverIndex(index);
    if (commit) setSelectedIteration(samples[index]?.iteration ?? null);
  };

  return (
    <div className="s1a-growth-present">
      <div className="s1a-g-metrics">
        {GROWTH_SERIES.map((series) => {
          const value = inspected ? series.read(inspected) : null;
          const extent = extents[GROWTH_SERIES.indexOf(series)];
          return (
            <article key={series.id} className="s1a-g-metric" style={{ borderTopColor: series.color }}>
              <span>{series.label}</span>
              <strong title={ANALYSIS_DEFINITIONS[series.id === "occupied" ? "occupiedArea" : series.id === "branch" ? "branchCount" : series.id === "trail" ? "meanTrail" : "stabilization"]}>
                {value == null ? "—" : series.format(value)}
              </strong>
              <small>{series.unit}</small>
              <svg viewBox={`0 0 ${GROWTH_PLOT.width} ${GROWTH_PLOT.height}`} className="s1a-g-spark" aria-hidden="true">
                {growthPath(samples, series.read, extent, false).map((path) => (
                  <path key={path} d={path} fill="none" stroke={series.color} strokeWidth="8" strokeDasharray={series.dash} />
                ))}
              </svg>
            </article>
          );
        })}
      </div>
      <section className="s1a-g-graph" aria-label="Growth evolution">
        <div className="s1a-g-legend">
          {GROWTH_SERIES.map((series) => (
            <button
              key={series.id}
              type="button"
              aria-pressed={enabled[series.id]}
              onClick={() => setEnabled((current) => ({ ...current, [series.id]: !current[series.id] }))}
            >
              <i style={series.dash ? { background: `repeating-linear-gradient(90deg, ${series.color} 0 5px, transparent 5px 8px)` } : { background: series.color }} />
              {series.label}
            </button>
          ))}
          <p>Occupied area and stabilization use 0–1. Branch count and mean trail are scaled to their recorded range. Lines join recorded samples.</p>
        </div>
        <div className="s1a-g-plot">
          <svg viewBox={`0 0 ${GROWTH_PLOT.width} ${GROWTH_PLOT.height}`} role="img" aria-label="Recorded growth metrics by iteration" preserveAspectRatio="xMidYMid meet">
            {[0, 0.25, 0.5, 0.75, 1].map((tick) => {
              const y = GROWTH_PLOT.top + (1 - tick) * (GROWTH_PLOT.height - GROWTH_PLOT.top - GROWTH_PLOT.bottom);
              return (
                <g key={tick}>
                  <line x1={GROWTH_PLOT.left} x2={GROWTH_PLOT.width - GROWTH_PLOT.right} y1={y} y2={y} stroke="rgba(242,242,238,0.14)" strokeWidth="1" />
                  <text x={GROWTH_PLOT.left - 10} y={y + 5} textAnchor="end" className="s1a-g-axis" fontSize="16">
                    {tick.toFixed(2)}
                  </text>
                </g>
              );
            })}
            {samples.length > 1
              ? [0, Math.floor((samples.length - 1) / 2), samples.length - 1].filter((index, place, all) => all.indexOf(index) === place).map((index) => {
                  const x = growthX(index, samples.length);
                  return (
                    <g key={samples[index].iteration}>
                      <line x1={x} x2={x} y1={GROWTH_PLOT.top} y2={GROWTH_PLOT.height - GROWTH_PLOT.bottom} stroke="rgba(242,242,238,0.08)" strokeWidth="1" />
                      <text x={x} y={GROWTH_PLOT.height - 16} textAnchor="middle" className="s1a-g-axis" fontSize="16">
                        {samples[index].iteration}
                      </text>
                    </g>
                  );
                })
              : null}
            {selectedIndex >= 0 ? (
              <line
                x1={growthX(selectedIndex, samples.length)}
                x2={growthX(selectedIndex, samples.length)}
                y1={GROWTH_PLOT.top}
                y2={GROWTH_PLOT.height - GROWTH_PLOT.bottom}
                stroke="rgba(242,242,238,0.55)"
                strokeWidth="1.4"
              />
            ) : null}
            {GROWTH_SERIES.map((series, seriesIndex) =>
              enabled[series.id]
                ? growthPath(samples, series.read, extents[seriesIndex], series.absolute).map((path) => (
                    <path key={`${series.id}-${path}`} d={path} fill="none" stroke={series.color} strokeWidth="2.4" strokeDasharray={series.dash} strokeLinejoin="round" strokeLinecap="round" />
                  ))
                : null,
            )}
            {GROWTH_SERIES.map((series, seriesIndex) =>
              enabled[series.id]
                ? samples.map((sample, index) => {
                    const value = series.read(sample);
                    if (value == null) return null;
                    const y =
                      GROWTH_PLOT.top +
                      (1 - growthNorm(value, extents[seriesIndex], series.absolute)) * (GROWTH_PLOT.height - GROWTH_PLOT.top - GROWTH_PLOT.bottom);
                    return <circle key={`${series.id}-${sample.iteration}`} cx={growthX(index, samples.length)} cy={y} r="3.2" fill="#000" stroke={series.color} strokeWidth="1.5" />;
                  })
                : null,
            )}
            <rect
              x={GROWTH_PLOT.left}
              y={GROWTH_PLOT.top}
              width={GROWTH_PLOT.width - GROWTH_PLOT.left - GROWTH_PLOT.right}
              height={GROWTH_PLOT.height - GROWTH_PLOT.top - GROWTH_PLOT.bottom}
              fill="transparent"
              onMouseMove={(event) => inspectPlot(event, false)}
              onMouseLeave={() => setHoverIndex(null)}
              onClick={(event) => inspectPlot(event, true)}
            />
            <text x={GROWTH_PLOT.left} y={GROWTH_PLOT.height - 2} className="s1a-g-axis" fontSize="14">
              Iteration
            </text>
          </svg>
          {hover ? (
            <div className="s1a-g-tip" style={{ left: `${(growthX(hoverIndex ?? 0, samples.length) / GROWTH_PLOT.width) * 100}%` }}>
              <p>Iteration {hover.iteration}</p>
              {GROWTH_SERIES.map((series) => {
                const value = series.read(hover);
                return (
                  <span key={series.id}>
                    <i style={{ background: series.color }} />
                    {series.label} {value == null ? "—" : series.format(value)}
                  </span>
                );
              })}
            </div>
          ) : null}
        </div>
      </section>
      <section className="s1a-g-stage" aria-label="Measured growth stage">
        <div>
          <p>
            {inspected ? inspected.regime : "Unlabeled"}
            <small>{inspected?.regimeRule || "Not yet computed. A regime needs two samples with deposited trail."}</small>
          </p>
          <span>{simulator}. Stabilization is measured from trail change and is separate from simulator convergence.</span>
        </div>
        <div className="s1a-g-runs" aria-hidden={samples.length === 0}>
          {runs.map((run) => (
            <button
              key={`${run.regime}-${run.start}`}
              type="button"
              style={{ flexGrow: run.count, background: regimeTone(run.regime) }}
              title={`${run.regime}. ${run.rule}`}
              onClick={() => setSelectedIteration(samples[run.start + run.count - 1]?.iteration ?? null)}
            >
              {run.count > samples.length / 5 ? run.regime : ""}
            </button>
          ))}
        </div>
        <label className="s1a-g-interval">
          Sample every
          <select value={sampleInterval} onChange={(event) => onSampleInterval(Number(event.target.value))} aria-label="Analysis sample interval">
            {INTERVALS.map((value) => (
              <option key={value} value={value}>
                {value} iterations
              </option>
            ))}
          </select>
        </label>
      </section>
      <section className="s1a-g-morph" aria-label="Morphology snapshots">
        {snapshots.length ? (
          snapshots.map((sample) => {
            const size = session.latest?.density.size ?? sample.meanGrid.length ** 0.5;
            const selected = inspected?.iteration === sample.iteration;
            return (
              <button
                key={sample.iteration}
                type="button"
                className="s1a-g-snap"
                aria-pressed={selected}
                onClick={() => setSelectedIteration(sample.iteration)}
              >
                <MiniField grid={sample.meanGrid} size={size} />
                <span>{sample.iteration}</span>
              </button>
            );
          })
        ) : (
          <p>Not yet computed. Snapshots are stored from analysis samples of the trail field.</p>
        )}
      </section>
    </div>
  );
}

function GrowthTab({
  session,
  snapshots,
  sampleInterval,
  onSampleInterval,
  presentation = false,
  simulating = false,
}: {
  session: AnalysisSession;
  snapshots: GrowthSample[];
  sampleInterval: number;
  onSampleInterval: (value: number) => void;
  presentation?: boolean;
  simulating?: boolean;
}) {
  if (presentation) {
    return (
      <PresentationGrowth
        session={session}
        snapshots={snapshots}
        sampleInterval={sampleInterval}
        onSampleInterval={onSampleInterval}
        simulating={simulating}
      />
    );
  }
  const latest = session.latest?.growth;
  return (
    <div className="s1a-stack">
      {session.latest ? <MetaLine session={session} frameIteration={session.latest.iteration} /> : null}
      <label className="s1a-control">
        <span>Sample every</span>
        <select
          value={sampleInterval}
          onChange={(event) => onSampleInterval(Number(event.target.value))}
          aria-label="Analysis sample interval"
        >
          {INTERVALS.map((value) => (
            <option key={value} value={value}>
              {value} iterations
            </option>
          ))}
        </select>
      </label>
      <SeriesChart samples={session.samples} read={(sample) => sample.occupiedFraction} label="Occupied area" color="#7fd0cf" />
      <SeriesChart samples={session.samples} read={(sample) => sample.branchCount} label="Branch count" color="#c77e5f" />
      <SeriesChart samples={session.samples} read={(sample) => sample.meanTrail} label="Mean trail density" color="#f2f2ee" />
      <SeriesChart samples={session.samples} read={(sample) => sample.stabilization} label="Stabilization" color="#8faaa8" />
      <p className="s1a-note">
        {latest ? (
          <>
            <strong>{latest.regime}.</strong> {latest.regimeRule}
          </>
        ) : (
          "Not yet computed"
        )}
      </p>
      <div>
        <p className="s1a-kicker">Morphology snapshots</p>
        {snapshots.length ? (
          <div className="s1a-snaps">
            {snapshots.map((sample) => (
              <figure key={sample.iteration}>
                <MiniField grid={sample.meanGrid} size={session.latest?.density.size ?? sample.meanGrid.length ** 0.5} />
                <figcaption>{sample.iteration}</figcaption>
              </figure>
            ))}
          </div>
        ) : (
          <p className="s1a-note">Not yet computed. Snapshots are stored from analysis samples of the trail field.</p>
        )}
      </div>
      <p className="s1a-note">{ANALYSIS_DEFINITIONS.occupiedArea} {ANALYSIS_DEFINITIONS.stabilization}</p>
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
                  const cx = width / 2;
                  const cy = height / 2;
                  const radius = Math.min(width, height) * 0.46;
                  ctx.strokeStyle = "rgba(242,242,238,0.08)";
                  ctx.lineWidth = 1;
                  for (const ring of [0.34, 0.67, 1]) {
                    ctx.beginPath();
                    ctx.arc(cx, cy, radius * ring, 0, Math.PI * 2);
                    ctx.stroke();
                  }
                }
                const cellW = width / size;
                const cellH = height / size;
                if (mode === "circulation" && frame.flow) {
                  paintMutedGrid(ctx, width, height, frame.flow, size);
                  return;
                }
                if (mode === "hierarchy") {
                  paintMutedGrid(ctx, width, height, topology.hierarchy.map((value) => (value < 0 ? 0 : value + 1)), size, topology.skeleton);
                  return;
                }
                for (let y = 0; y < size; y += 1) {
                  for (let x = 0; x < size; x += 1) {
                    const index = y * size + x;
                    if (!topology.mask[index] && !topology.skeleton[index]) continue;
                    ctx.fillStyle = topology.skeleton[index] ? "#0F7377" : "rgba(242,242,238,0.16)";
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
                mark(topology.endpoints, "#C77E5F");
                mark(topology.branches, "#f2f2ee");
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
            <span><i className="s1a-topo-swatch s1a-topo-occupied" /> Occupied</span>
            <span><i className="s1a-topo-swatch s1a-topo-skeleton" /> Skeleton</span>
            <span><i className="s1a-topo-swatch s1a-topo-endpoint" /> Endpoints</span>
            <span><i className="s1a-topo-swatch s1a-topo-branch" /> Branch pixels</span>
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

const DENSITY_STOPS: Array<[number, [number, number, number]]> = [
  [0, [0, 0, 0]],
  [0.42, [15, 115, 119]],
  [0.74, [199, 126, 95]],
  [1, [242, 242, 238]],
];

function densityRamp(t: number) {
  const clamped = Math.max(0, Math.min(1, t));
  let lower = DENSITY_STOPS[0];
  let upper = DENSITY_STOPS[DENSITY_STOPS.length - 1];
  for (let i = 0; i < DENSITY_STOPS.length - 1; i += 1) {
    if (clamped >= DENSITY_STOPS[i][0] && clamped <= DENSITY_STOPS[i + 1][0]) {
      lower = DENSITY_STOPS[i];
      upper = DENSITY_STOPS[i + 1];
      break;
    }
  }
  const span = upper[0] - lower[0];
  const u = span === 0 ? 0 : (clamped - lower[0]) / span;
  const rgb = lower[1].map((channel, index) => Math.round(channel + (upper[1][index] - channel) * u));
  return `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`;
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
                for (let y = 0; y < size; y += 1) {
                  for (let x = 0; x < size; x += 1) {
                    const index = y * size + x;
                    const value = values[index] ?? 0;
                    const dx = left + x * cellW;
                    const dy = top + fieldToDisplayRow(y, size) * cellH;
                    if (mode === "occupancy") {
                      ctx.fillStyle = max > 0 && value >= stats.threshold ? "#C77E5F" : "#000";
                      ctx.fillRect(dx, dy, cellW, cellH);
                    } else if (mode === "intensity") {
                      const t = max > 0 ? value / max : 0;
                      if (t <= 0) continue;
                      const mark = Math.max(1.5, t * Math.min(cellW, cellH));
                      ctx.fillStyle = densityRamp(t);
                      ctx.fillRect(dx + (cellW - mark) / 2, dy + (cellH - mark) / 2, mark, mark);
                    } else {
                      ctx.fillStyle = max > 0 ? densityRamp(value / max) : "#000";
                      ctx.fillRect(dx, dy, cellW, cellH);
                    }
                  }
                }
                ctx.strokeStyle = "rgba(242,242,238,0.28)";
                ctx.lineWidth = 1;
                ctx.beginPath();
                for (let i = 0; i <= size; i += 1) {
                  const gx = left + i * cellW;
                  const gy = top + i * cellH;
                  ctx.moveTo(gx, top);
                  ctx.lineTo(gx, top + plotH);
                  ctx.moveTo(left, gy);
                  ctx.lineTo(left + plotW, gy);
                }
                ctx.stroke();
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
                <span key={index} style={{ height: `${Math.max(count > 0 ? 6 : 0, (count / maxCount) * 100)}%` }} title={`${count} cells`} />
              ))}
            </div>
            <p className="s1a-dens-note">
              {mode === "intensity"
                ? "Each cell is the maximum trail sample in that 20×20 block. Marker size and color both follow that value, linearly, and do not rise above the recorded maximum."
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
                ctx.strokeStyle = "rgba(242,242,238,0.22)";
                ctx.lineWidth = 1;
                ctx.beginPath();
                for (let i = 0; i <= size; i += 1) {
                  ctx.moveTo(left + i * cellW, top);
                  ctx.lineTo(left + i * cellW, top + plotH);
                  ctx.moveTo(left, top + i * cellH);
                  ctx.lineTo(left + plotW, top + i * cellH);
                }
                ctx.stroke();
                let maxMag = 0;
                const mags = counts.map((count, index) => {
                  if (!count) return 0;
                  const mag = Math.hypot(xs[index], ys[index]) / count;
                  if (mag > maxMag) maxMag = mag;
                  return mag;
                });
                const span = Math.min(cellW, cellH);
                for (let y = 0; y < size; y += 1) {
                  for (let x = 0; x < size; x += 1) {
                    const index = y * size + x;
                    if (!counts[index] || maxMag <= 0 || mags[index] <= 0) continue;
                    const cx = left + (x + 0.5) * cellW;
                    const cy = top + (fieldToDisplayRow(y, size) + 0.5) * cellH;
                    const dx = xs[index] / counts[index];
                    const dy = ys[index] / counts[index];
                    const mag = Math.hypot(dx, dy) || 1;
                    const length = span * (0.38 + 0.44 * Math.sqrt(mags[index] / maxMag));
                    const ex = cx + (dx / mag) * length;
                    const ey = cy - (dy / mag) * length;
                    const dominantCell = dominant != null && directionBin(Math.atan2(dy, dx), bins.length) === dominant.index;
                    ctx.strokeStyle = dominantCell ? "#C77E5F" : "#0F7377";
                    ctx.fillStyle = ctx.strokeStyle;
                    ctx.lineWidth = Math.max(2.5, span * 0.07);
                    ctx.lineCap = "round";
                    ctx.beginPath();
                    ctx.moveTo(cx, cy);
                    ctx.lineTo(ex, ey);
                    ctx.stroke();
                    const head = Math.min(length * 0.42, Math.max(7, span * 0.22));
                    const ang = Math.atan2(ey - cy, ex - cx);
                    ctx.beginPath();
                    ctx.moveTo(ex, ey);
                    ctx.lineTo(ex - head * Math.cos(ang - 0.42), ey - head * Math.sin(ang - 0.42));
                    ctx.lineTo(ex - head * Math.cos(ang + 0.42), ey - head * Math.sin(ang + 0.42));
                    ctx.closePath();
                    ctx.fill();
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
              <span>Empty cells have no sample. Length runs from 38% to 82% of the cell by the square root of the cell mean relative to the strongest cell. Direction is unchanged.</span>
            </p>
          </div>
          <aside className="s1a-dir-side" aria-label="Direction measurements">
            <svg className="s1a-dir-compass" viewBox="-120 -120 240 240" role="img" aria-label="Directional compass">
              <circle cx="0" cy="0" r="104" fill="none" stroke="rgba(242,242,238,0.28)" />
              <circle cx="0" cy="0" r="4" fill="#f2f2ee" />
              {bins.map((count, index) => {
                if (count <= 0 || maxBin <= 0) return null;
                const angle = (-Math.PI + (index + 0.5) * ((Math.PI * 2) / bins.length));
                const len = 34 + (count / maxBin) * 62;
                const x2 = Math.cos(angle) * len;
                const y2 = -Math.sin(angle) * len;
                const marked = dominant != null && index === dominant.index;
                return <line key={index} x1="0" y1="0" x2={x2} y2={y2} stroke={marked ? "#C77E5F" : "#0F7377"} strokeWidth={marked ? 4 : 2} />;
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
