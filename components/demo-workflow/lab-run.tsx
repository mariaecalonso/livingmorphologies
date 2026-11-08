"use client";

import { useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState, type CSSProperties } from "react";
import { ANALYSIS_TABS, OCCUPANCY_THRESHOLD_RATIO, fieldToDisplayRow } from "@/lib/skill1/analysis";
import { LAB_RUN_FILE, type LabRunData, type LabRunMark } from "@/lib/demo-workflow/lab-run";
import styles from "@/components/demo-workflow/lab-run.module.css";

const FRAME_DELAY = 480;
const RECORDED_FRAMES = 18;
const SAVED_HOLD = 1600;
const AIM = 800;
const PRESS = 350;
const TAB_HOLD = 3400;
const ATTRACTOR_NAMES: Record<string, string> = { point: "Point", line: "Line", ring: "Circle", curve: "Curvy line" };
const COMPASS = ["W", "WSW", "SW", "SSW", "S", "SSE", "SE", "ESE", "E", "ENE", "NE", "NNE", "N", "NNW", "NW", "WNW"];
const REGIME_TONE: Record<string, string> = { Exploration: "#0f7377", Reinforcement: "#c77e5f", Convergence: "#f2f2ee" };
const DENSITY_STOPS: Array<[number, [number, number, number]]> = [
  [0, [0, 0, 0]],
  [0.42, [15, 115, 119]],
  [0.74, [199, 126, 95]],
  [1, [242, 242, 238]],
];

type Load<T> = { status: "loading" } | { status: "error" } | { status: "ready"; value: T };
type Recording = { frames: ImageBitmap[]; delays: number[] };
type Frame = number | "saved";
/** One step of the playback: where the cursor points, whether it is holding a control, and what is on screen. */
type Aim = "run" | number | `s${number}` | null;
type Beat = { aim: Aim; press: boolean; drag: boolean; frame: Frame; tab: number | null; ms: number };
type Playback = { index: number; manual: number | null };
type PlaybackAction = { type: "next" } | { type: "run" } | { type: "tab"; tab: number };

function useLabRun(): Load<LabRunData> {
  const [state, setState] = useState<Load<LabRunData>>({ status: "loading" });
  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      try {
        const response = await fetch(LAB_RUN_FILE, { signal: controller.signal });
        if (!response.ok) throw new Error(String(response.status));
        setState({ status: "ready", value: (await response.json()) as LabRunData });
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setState({ status: "error" });
      }
    };
    void load();
    return () => controller.abort();
  }, []);
  return state;
}

/** Every frame of the recorded replay with its own delay; null when the browser cannot decode GIF frames. */
function useRecording(src: string | null) {
  const [recording, setRecording] = useState<Recording | null | "loading">("loading");
  useEffect(() => {
    if (!src) return;
    const controller = new AbortController();
    const frames: ImageBitmap[] = [];
    const load = async () => {
      let decoder: ImageDecoder | null = null;
      try {
        if (typeof ImageDecoder === "undefined") throw new Error("no GIF decoding");
        const response = await fetch(src, { signal: controller.signal });
        if (!response.ok) throw new Error(String(response.status));
        decoder = new ImageDecoder({ data: await response.arrayBuffer(), type: "image/gif" });
        await decoder.tracks.ready;
        const count = decoder.tracks.selectedTrack?.frameCount ?? 0;
        const delays: number[] = [];
        for (let frameIndex = 0; frameIndex < count; frameIndex += 1) {
          const { image } = await decoder.decode({ frameIndex });
          delays.push(image.duration ? image.duration / 1000 : FRAME_DELAY);
          frames.push(await createImageBitmap(image));
          image.close();
        }
        if (!controller.signal.aborted) setRecording({ frames, delays });
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setRecording(null);
      } finally {
        decoder?.close();
        if (controller.signal.aborted) frames.forEach((frame) => frame.close());
      }
    };
    void load();
    return () => {
      controller.abort();
      frames.forEach((frame) => frame.close());
    };
  }, [src]);
  return recording;
}

const SLIDERS = 8;
const SLIDER_BEAT = 1500;
const WATCH_AIM = 1400;

function script(delays: number[], watch: boolean): Beat[] {
  const aim = watch ? WATCH_AIM : AIM;
  const sliders: Beat[] = watch
    ? Array.from({ length: SLIDERS }, (_, slider) => [
        { aim: `s${slider}` as const, press: false, drag: false, frame: 0 as Frame, tab: null, ms: 900 },
        { aim: `s${slider}` as const, press: true, drag: true, frame: 0 as Frame, tab: null, ms: SLIDER_BEAT },
      ]).flat()
    : Array.from({ length: SLIDERS }, (_, slider): Beat => ({ aim: `s${slider}`, press: false, drag: false, frame: 0, tab: null, ms: 420 }));
  const beats: Beat[] = [
    ...sliders,
    { aim: "run", press: false, drag: false, frame: 0, tab: null, ms: aim },
    { aim: "run", press: true, drag: false, frame: 0, tab: null, ms: PRESS },
    ...delays.map((ms, frame): Beat => ({ aim: null, press: false, drag: false, frame, tab: null, ms })),
    { aim: null, press: false, drag: false, frame: "saved", tab: null, ms: SAVED_HOLD },
  ];
  ANALYSIS_TABS.forEach((_, tab) => {
    beats.push({ aim: tab, press: false, drag: false, frame: "saved", tab: tab ? tab - 1 : null, ms: aim });
    beats.push({ aim: tab, press: true, drag: false, frame: "saved", tab, ms: TAB_HOLD });
  });
  return beats;
}

function playback(state: Playback, action: PlaybackAction): Playback {
  if (action.type === "next") return { ...state, index: state.index + 1 };
  if (action.type === "run") return { index: 0, manual: null };
  return { ...state, manual: action.tab };
}

const fixed = (value: number | null, digits = 3) => (value == null ? "N/A" : value.toFixed(digits));

function densityRamp(t: number) {
  const clamped = Math.max(0, Math.min(1, t));
  for (let i = 0; i < DENSITY_STOPS.length - 1; i += 1) {
    const [from, low] = DENSITY_STOPS[i];
    const [to, high] = DENSITY_STOPS[i + 1];
    if (clamped > to) continue;
    const u = to === from ? 0 : (clamped - from) / (to - from);
    return `rgb(${low.map((channel, k) => Math.round(channel + (high[k] - channel) * u)).join(",")})`;
  }
  return "rgb(242,242,238)";
}

function Slider({ label, value, min, max, digits, note, aim }: { label: string; value: number; min: number; max: number; digits: number; note?: string; aim?: string }) {
  const span = max - min;
  const share = span === 0 ? 0 : Math.max(0, Math.min(100, ((value - min) / span) * 100));
  return (
    <div className={styles.slider} data-aim={aim} style={{ "--share": `${share}%` } as CSSProperties}>
      <span>{label}</span>
      <b>{value.toFixed(digits)}</b>
      <i aria-hidden="true" />
      {note ? <small>{note}</small> : null}
    </div>
  );
}

/** The Lab's Agent / Simulation groups with this run's saved values, read only. Ranges are the Lab's slider ranges. */
function Settings({ data, amount }: { data: LabRunData; amount: (index: number) => number }) {
  const s = data.settings;
  const slider = (index: number, label: string, value: number, min: number, max: number, digits: number, note?: string) => (
    <Slider key={label} aim={`s${index}`} label={label} value={value * amount(index)} min={min} max={max} digits={digits} note={note} />
  );
  return (
    <section className={styles.area} aria-label="Simulation settings">
      <header className={styles.areaHead}>
        <p className={styles.title}>Simulation settings</p>
      </header>
      <div className={styles.settings}>
        <div className={styles.group}>
          <p>Agent</p>
          <div className={styles.slider}>
            <span>Agents</span>
            <b>{data.agents.toLocaleString("en-US")}</b>
          </div>
          {slider(0, "Sensor distance", s.sensorDistance, 0.25, 2.2, 2)}
          {slider(1, "Sensor angle", s.sensorAngle, 0.08, 1.35, 2)}
          {slider(2, "Turn / rotation angle", s.turnAngle, 0.05, 1.2, 2)}
          {slider(3, "Move distance", s.moveDistance, 0.08, 0.5, 2)}
        </div>
        <div className={styles.group}>
          <p>Stigmergy</p>
          {slider(4, "Deposit strength", s.deposit, 0.02, 0.22, 3)}
          {slider(5, "Trail diffusion", s.diffusion, 0, 0.42, 2, s.diffusionUsed !== s.diffusion ? `Catalog runs use ${s.diffusionUsed.toFixed(2)}` : undefined)}
          {slider(6, "Trail influence", s.trailInfluence, 0, 2, 2)}
          <p>Environment</p>
          {slider(7, "Environmental resistance", s.resistance, 0, 1, 2)}
        </div>
        <dl className={styles.simulation}>
          <div>
            <dt>Field size</dt>
            <dd>
              {s.fieldSize} × {s.fieldSize}
            </dd>
          </div>
          <div>
            <dt>Iterations</dt>
            <dd>{data.iterations}</dd>
          </div>
          <div>
            <dt>Attractors</dt>
            <dd>{s.attractors.map((kind) => ATTRACTOR_NAMES[kind] ?? kind).join(" · ")}</dd>
          </div>
          <div>
            <dt>Seed</dt>
            <dd>{data.seed.toLocaleString("en-US")}</dd>
          </div>
        </dl>
      </div>
    </section>
  );
}

/** The run's attractors, in the same field orientation as the Lab plan. Shown before generation starts. */
function AttractorField({ marks, size }: { marks: LabRunMark[]; size: number }) {
  const names = marks.map((mark) => ATTRACTOR_NAMES[mark.kind] ?? mark.kind).join(" and ");
  return (
    <svg className={styles.marks} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`Attractors for this run: ${names}`}>
      <g transform={`translate(0 ${size}) scale(1 -1)`}>
        {marks.map((mark, index) => {
          if (mark.kind === "line" || mark.kind === "curve") {
            const x2 = mark.x2 ?? mark.x;
            const y2 = mark.y2 ?? mark.y;
            return (
              <g key={`${mark.kind}-${index}`}>
                <line x1={mark.x} y1={mark.y} x2={x2} y2={y2} />
                <circle className={styles.end} cx={mark.x} cy={mark.y} r={0.16} />
                <circle className={styles.end} cx={x2} cy={y2} r={0.16} />
              </g>
            );
          }
          return (
            <g key={`${mark.kind}-${index}`}>
              <circle cx={mark.x} cy={mark.y} r={mark.kind === "ring" ? mark.radius ?? 4 : mark.radius ?? 1.6} />
              <circle className={styles.end} cx={mark.x} cy={mark.y} r={0.16} />
            </g>
          );
        })}
      </g>
    </svg>
  );
}

function RecordingCanvas({ recording, frame }: { recording: Recording; frame: number }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const node = canvas.current;
    const image = recording.frames[Math.min(frame, recording.frames.length - 1)];
    if (!node || !image) return;
    node.width = image.width;
    node.height = image.height;
    node.getContext("2d")?.drawImage(image, 0, 0);
  }, [recording, frame]);
  return <canvas ref={canvas} className={styles.fieldImage} />;
}

/** Fills a canvas once per data change at the device's pixel ratio. */
function useGridCanvas(draw: (ctx: CanvasRenderingContext2D, size: number) => void) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const size = node.clientWidth;
    const ratio = window.devicePixelRatio || 1;
    node.width = Math.round(size * ratio);
    node.height = Math.round(size * ratio);
    const ctx = node.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.fillStyle = "#000000";
    ctx.fillRect(0, 0, size, size);
    draw(ctx, size);
  }, [draw]);
  return ref;
}

function DnaRadar({ data }: { data: LabRunData }) {
  const radius = 92;
  const axes = data.dna;
  const polar = (index: number, value: number, r = radius) => {
    const angle = -Math.PI / 2 + (index * Math.PI * 2) / axes.length;
    return [Math.cos(angle) * r * value, Math.sin(angle) * r * value] as const;
  };
  const outline = (read: (axis: LabRunData["dna"][number]) => number | null) => {
    const points = axes.map((axis, index) => {
      const value = read(axis);
      return value == null ? null : polar(index, Math.max(0, Math.min(1, value)));
    });
    const drawn = points.filter((point): point is readonly [number, number] => point !== null);
    const path = drawn.map(([x, y], index) => `${index ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
    return drawn.length === points.length ? `${path} Z` : path;
  };
  return (
    <svg className={styles.diagram} viewBox="-150 -140 300 290" role="img" aria-label="Architectural target and generated network">
      {[0.2, 0.4, 0.6, 0.8, 1].map((ring) => (
        <circle key={ring} r={radius * ring} className={ring === 1 ? styles.ringOuter : styles.ring} />
      ))}
      {axes.map((axis, index) => {
        const [x, y] = polar(index, 1);
        return <line key={axis.id} x2={x} y2={y} className={styles.ring} />;
      })}
      <path d={outline((axis) => axis.target)} className={styles.target} />
      <path d={outline((axis) => axis.generated)} className={styles.generated} />
      {axes.map((axis, index) => {
        const [x, y] = polar(index, 1, radius + 22);
        const anchor = Math.abs(x) < 20 ? "middle" : x > 0 ? "start" : "end";
        return (
          <text key={axis.id} x={x} y={y} textAnchor={anchor} className={styles.axis}>
            {axis.label.toUpperCase()}
            <tspan x={x} dy="11" className={axis.generated == null ? styles.axisMissing : styles.axisValue}>
              {axis.generated == null ? "n/a" : axis.generated.toFixed(2)}
            </tspan>
          </text>
        );
      })}
    </svg>
  );
}

const GROWTH_SERIES = [
  { id: "occupied", label: "Occupied area", color: "#0f7377", absolute: true, read: (s: LabRunData["growth"][number]) => s.occupied },
  { id: "branches", label: "Branch count", color: "#c77e5f", absolute: false, read: (s: LabRunData["growth"][number]) => s.branches },
  { id: "trail", label: "Mean trail density", color: "#f2f2ee", absolute: false, read: (s: LabRunData["growth"][number]) => s.meanTrail },
  { id: "stable", label: "Network stabilization", color: "#b7b7b2", absolute: true, dash: "5 4", read: (s: LabRunData["growth"][number]) => s.stabilization },
] as const;

function GrowthChart({ data }: { data: LabRunData }) {
  const [width, height, left, right, top, bottom] = [300, 300, 28, 8, 14, 26];
  const plotW = width - left - right;
  const plotH = height - top - bottom;
  const samples = data.growth;
  const x = (index: number) => left + (samples.length > 1 ? index / (samples.length - 1) : 0.5) * plotW;
  return (
    <svg className={styles.diagram} viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Recorded growth metrics by iteration">
      {[0, 0.25, 0.5, 0.75, 1].map((tick) => {
        const y = top + (1 - tick) * plotH;
        return (
          <g key={tick}>
            <line x1={left} x2={width - right} y1={y} y2={y} className={styles.gridLine} />
            <text x={left - 4} y={y + 3} textAnchor="end" className={styles.tick}>
              {tick.toFixed(2)}
            </text>
          </g>
        );
      })}
      {[0, Math.floor((samples.length - 1) / 2), samples.length - 1].map((index) => (
        <text key={index} x={x(index)} y={height - 10} textAnchor="middle" className={styles.tick}>
          {samples[index]?.iteration}
        </text>
      ))}
      {GROWTH_SERIES.map((series) => {
        const values = samples.map(series.read);
        const numbers = values.filter((value): value is number => value != null);
        const min = Math.min(...numbers);
        const span = Math.max(...numbers) - min || 1;
        const paths: string[] = [];
        let run = "";
        values.forEach((value, index) => {
          if (value == null) {
            if (run) paths.push(run);
            run = "";
            return;
          }
          const share = series.absolute ? Math.max(0, Math.min(1, value)) : (value - min) / span;
          const point = `${x(index).toFixed(1)},${(top + (1 - share) * plotH).toFixed(1)}`;
          run += `${run ? "L" : "M"}${point}`;
        });
        if (run) paths.push(run);
        return paths.map((path) => <path key={`${series.id}-${path}`} d={path} fill="none" stroke={series.color} strokeWidth="1.6" strokeDasharray={"dash" in series ? series.dash : undefined} />);
      })}
    </svg>
  );
}

function TopologyField({ data }: { data: LabRunData }) {
  const ref = useGridCanvas(
    useMemo(
      () => (ctx: CanvasRenderingContext2D, size: number) => {
        const t = data.topology;
        const cell = size / t.size;
        ctx.strokeStyle = "rgba(242,242,238,0.08)";
        for (const ring of [0.34, 0.67, 1]) {
          ctx.beginPath();
          ctx.arc(size / 2, size / 2, size * 0.46 * ring, 0, Math.PI * 2);
          ctx.stroke();
        }
        for (let y = 0; y < t.size; y += 1) {
          for (let x = 0; x < t.size; x += 1) {
            const index = y * t.size + x;
            if (!t.mask[index] && !t.skeleton[index]) continue;
            ctx.fillStyle = t.skeleton[index] ? "rgba(127,208,207,0.9)" : "rgba(242,242,238,0.16)";
            ctx.fillRect(x * cell, fieldToDisplayRow(y, t.size) * cell, cell + 0.5, cell + 0.5);
          }
        }
        const mark = (indices: number[], color: string) => {
          ctx.fillStyle = color;
          for (const index of indices) {
            const x = index % t.size;
            ctx.fillRect(x * cell, fieldToDisplayRow((index - x) / t.size, t.size) * cell, cell, cell);
          }
        };
        mark(t.endpoints, "#c77e5f");
        mark(t.branches, "#f2f2ee");
      },
      [data],
    ),
  );
  return <canvas ref={ref} className={styles.diagram} role="img" aria-label="Network extracted from the trail field" />;
}

function DensityField({ data }: { data: LabRunData }) {
  const ref = useGridCanvas(
    useMemo(
      () => (ctx: CanvasRenderingContext2D, size: number) => {
        const { size: n, trail } = data.density;
        const cell = size / n;
        const max = Math.max(...trail);
        for (let y = 0; y < n; y += 1) {
          for (let x = 0; x < n; x += 1) {
            ctx.fillStyle = max > 0 ? densityRamp(trail[y * n + x] / max) : "#000000";
            ctx.fillRect(x * cell, fieldToDisplayRow(y, n) * cell, cell + 0.5, cell + 0.5);
          }
        }
        ctx.strokeStyle = "rgba(242,242,238,0.18)";
        ctx.lineWidth = 0.5;
        ctx.beginPath();
        for (let i = 0; i <= n; i += 1) {
          ctx.moveTo(i * cell, 0);
          ctx.lineTo(i * cell, size);
          ctx.moveTo(0, i * cell);
          ctx.lineTo(size, i * cell);
        }
        ctx.stroke();
      },
      [data],
    ),
  );
  return <canvas ref={ref} className={styles.diagram} role="img" aria-label="Mean trail in each field cell" />;
}

function dominantBin(bins: number[]) {
  const peak = Math.max(...bins);
  return peak > 0 ? bins.indexOf(peak) : null;
}

function DirectionField({ data }: { data: LabRunData }) {
  const ref = useGridCanvas(
    useMemo(
      () => (ctx: CanvasRenderingContext2D, size: number) => {
        const d = data.direction;
        const n = data.density.size;
        const cell = size / n;
        const dominant = dominantBin(d.bins);
        let maxMag = 0;
        const mags = d.count.map((count, index) => {
          if (!count) return 0;
          const mag = Math.hypot(d.x[index], d.y[index]) / count;
          maxMag = Math.max(maxMag, mag);
          return mag;
        });
        ctx.lineWidth = 1.3;
        ctx.lineCap = "round";
        for (let y = 0; y < n; y += 1) {
          for (let x = 0; x < n; x += 1) {
            const index = y * n + x;
            if (!d.count[index] || !mags[index] || maxMag <= 0) continue;
            const dx = d.x[index] / d.count[index];
            const dy = d.y[index] / d.count[index];
            const mag = Math.hypot(dx, dy) || 1;
            const length = cell * (0.38 + 0.44 * Math.sqrt(mags[index] / maxMag));
            const cx = (x + 0.5) * cell;
            const cy = (fieldToDisplayRow(y, n) + 0.5) * cell;
            const ex = cx + (dx / mag) * length;
            const ey = cy - (dy / mag) * length;
            let turns = (Math.atan2(dy, dx) + Math.PI) / (Math.PI * 2);
            if (turns >= 1) turns -= 1;
            ctx.strokeStyle = ctx.fillStyle = Math.min(d.bins.length - 1, Math.floor(turns * d.bins.length)) === dominant ? "#c77e5f" : "#0f7377";
            ctx.beginPath();
            ctx.moveTo(cx, cy);
            ctx.lineTo(ex, ey);
            ctx.stroke();
            const angle = Math.atan2(ey - cy, ex - cx);
            const head = Math.min(length * 0.42, 4);
            ctx.beginPath();
            ctx.moveTo(ex, ey);
            ctx.lineTo(ex - head * Math.cos(angle - 0.42), ey - head * Math.sin(angle - 0.42));
            ctx.lineTo(ex - head * Math.cos(angle + 0.42), ey - head * Math.sin(angle + 0.42));
            ctx.fill();
          }
        }
      },
      [data],
    ),
  );
  return <canvas ref={ref} className={styles.diagram} role="img" aria-label="Accumulated movement direction in each field cell" />;
}

function Legend({ items }: { items: Array<[string, string]> }) {
  return (
    <p className={styles.legend}>
      {items.map(([color, label]) => (
        <span key={label}>
          <i style={{ background: color }} />
          {label}
        </span>
      ))}
    </p>
  );
}

/** A string starts a new titled group; pairs are label and value. */
function Metrics({ rows }: { rows: Array<[string, string] | string> }) {
  const groups = rows.reduce<Array<{ title: string; rows: Array<[string, string]> }>>((list, row) => {
    if (typeof row === "string") list.push({ title: row, rows: [] });
    else list[list.length - 1]?.rows.push(row);
    return list;
  }, []);
  return (
    <div className={styles.metrics}>
      {groups.map((group) => (
        <div key={group.title} className={styles.metricBlock}>
          <p className={styles.metricGroup}>{group.title}</p>
          <dl>
            {group.rows.map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        </div>
      ))}
    </div>
  );
}

function AnalysisView({ data, tab }: { data: LabRunData; tab: number }) {
  const id = ANALYSIS_TABS[tab]?.id;
  if (id === "dna") {
    return (
      <>
        <DnaRadar data={data} />
        <div>
          <Metrics
            rows={[
              "Target · generated · difference",
              ...data.dna.map((axis): [string, string] => [
                axis.label,
                `${fixed(axis.target, 2)} · ${fixed(axis.generated, 2)} · ${axis.difference == null ? "—" : `${axis.difference > 0 ? "+" : ""}${axis.difference.toFixed(2)}`}`,
              ]),
            ]}
          />
          <Legend items={[["#c77e5f", "Target (archetype)"], ["#0f7377", "Generated (simulation)"]]} />
        </div>
      </>
    );
  }
  if (id === "growth") {
    const last = data.growth[data.growth.length - 1];
    return (
      <>
        <GrowthChart data={data} />
        <div>
          <Metrics
            rows={[
              `Iteration ${last.iteration} · sampled every ${data.sampleInterval}`,
              ["Occupied area", fixed(last.occupied)],
              ["Branch count", last.branches == null ? "N/A" : String(last.branches)],
              ["Mean trail density", fixed(last.meanTrail)],
              ["Network stabilization", fixed(last.stabilization)],
              ["Regime", last.regime],
            ]}
          />
          <Legend items={GROWTH_SERIES.map((series): [string, string] => [series.color, series.label])} />
        </div>
      </>
    );
  }
  if (id === "topology") {
    const t = data.topology;
    return (
      <>
        <TopologyField data={data} />
        <div>
          <Metrics
            rows={[
              "Structure",
              ["Branch count", fixed(t.branchCount)],
              ["Endpoint count", fixed(t.endpointCount)],
              ["Connected components", fixed(t.componentCount)],
              "Connectivity",
              ["Connectivity", fixed(t.connectivity)],
              ["Cycle rank", fixed(t.cycleRank)],
              "Distance",
              ["Average path length", fixed(t.averagePathLength)],
              ["Network diameter", fixed(t.diameter)],
            ]}
          />
          <Legend items={[["rgba(242,242,238,0.3)", "Occupied"], ["rgba(127,208,207,0.9)", "Skeleton"], ["#c77e5f", "Endpoints"], ["#f2f2ee", "Branch pixels"]]} />
        </div>
      </>
    );
  }
  if (id === "density") {
    const trail = data.density.trail;
    const max = Math.max(...trail);
    const mean = trail.reduce((sum, value) => sum + value, 0) / trail.length;
    const occupied = max > 0 ? trail.filter((value) => value >= max * OCCUPANCY_THRESHOLD_RATIO).length / trail.length : 0;
    return (
      <>
        <DensityField data={data} />
        <div>
          <Metrics
            rows={[
              `Trail density · iteration ${data.iterations}`,
              ["Mean density", mean.toFixed(4)],
              ["Maximum density", max.toFixed(4)],
              ["Occupied · 12% of peak", `${(occupied * 100).toFixed(1)}%`],
            ]}
          />
          <div className={styles.ramp} aria-hidden="true" />
          <p className={styles.rampScale}>
            <span>0</span>
            <span>{max.toFixed(4)}</span>
          </p>
        </div>
      </>
    );
  }
  const d = data.direction;
  const dominant = dominantBin(d.bins);
  return (
    <>
      <DirectionField data={data} />
      <div>
        <Metrics
          rows={[
            "Accumulated directionality",
            ["Dominant direction", dominant == null ? "N/A" : `${COMPASS[dominant]} · ${(-180 + (dominant + 0.5) * (360 / d.bins.length)).toFixed(1)}°`],
            ["Directional coherence", fixed(d.coherence)],
            ["Directional bias", fixed(d.bias)],
            ["Mean segment length", fixed(d.meanSegmentLength)],
          ]}
        />
        <Legend items={[["#0f7377", "Recorded direction"], ["#c77e5f", "Dominant bin"]]} />
      </div>
    </>
  );
}

/**
 * A simplified Physarum Logic Lab for one saved run: locked settings, the existing recording of the
 * run, and the Lab's analysis of its saved iteration. In the chapter, the cursor sets each saved slider.
 * `recorder` keeps the field, the frame ticks, and the saved plate, for a chapter frame.
 * `stage` fits the same demonstration into the chapter page: settings, a large viewer, then analysis.
 */
export function LabRun({ recorder = false, stage = false, watch = false }: { recorder?: boolean; stage?: boolean; watch?: boolean }) {
  const load = useLabRun();
  const data = load.status === "ready" ? load.value : null;
  const recording = useRecording(data?.recording ?? null);
  const decoded = recording !== "loading" && recording !== null ? recording : null;
  const beats = useMemo(
    () => script(decoded ? decoded.delays : Array.from({ length: RECORDED_FRAMES }, () => FRAME_DELAY), watch),
    [decoded, watch],
  );
  const [state, dispatch] = useReducer(playback, null, (): Playback => ({
    index: typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches ? Number.MAX_SAFE_INTEGER : 0,
    manual: null,
  }));
  const ready = data !== null && recording !== "loading";
  const index = Math.min(state.index, beats.length - 1);
  const beat = beats[index];
  const manual = state.manual;
  const frame: Frame = manual != null ? "saved" : beat.frame;
  const tab = manual ?? beat.tab;
  const sliderBeat = typeof beat.aim === "string" && beat.aim.startsWith("s") ? Number(beat.aim.slice(1)) : null;
  const [drag, setDrag] = useState({ index: -1, amount: 0 });
  useEffect(() => {
    if (!watch || !beat.drag) return;
    const started = performance.now();
    const duration = beats[index]?.ms ?? SLIDER_BEAT;
    let frameId = 0;
    const step = (now: number) => {
      const next = Math.min(1, (now - started) / duration);
      setDrag({ index, amount: next });
      if (next < 1) frameId = requestAnimationFrame(step);
    };
    frameId = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frameId);
  }, [watch, beat.drag, index, beats]);
  const amount = (slider: number) => {
    if (!watch || manual != null) return 1;
    if (sliderBeat == null) return 1;
    if (slider < sliderBeat) return 1;
    if (slider > sliderBeat || !beat.drag) return 0;
    return drag.index === index ? drag.amount : 0;
  };

  const root = useRef<HTMLDivElement>(null);
  const cursor = useRef<HTMLSpanElement>(null);
  const runButton = useRef<HTMLButtonElement>(null);
  const tabButtons = useRef<Array<HTMLButtonElement | null>>([]);

  useEffect(() => {
    if (!ready || manual != null || index >= beats.length - 1) return;
    const id = window.setTimeout(() => dispatch({ type: "next" }), beats[index].ms);
    return () => window.clearTimeout(id);
  }, [ready, manual, index, beats]);

  /* The cursor glides to a control, then follows that control's thumb while it is held. */
  useLayoutEffect(() => {
    const node = cursor.current;
    const frameNode = root.current;
    if (!node || !frameNode) return;
    const sliderRow = typeof beat.aim === "string" ? frameNode.querySelector<HTMLElement>(`[data-aim="${beat.aim}"]`) : null;
    const track = sliderRow?.querySelector("i") ?? null;
    const target = beat.aim === "run" ? runButton.current : typeof beat.aim === "number" ? tabButtons.current[beat.aim] : track ?? sliderRow;
    node.dataset.hidden = manual != null || !ready ? "true" : "false";
    node.dataset.idle = target ? "false" : "true";
    node.style.transitionDuration = beat.drag ? "0ms" : "";
    if (!target) return;
    const box = frameNode.getBoundingClientRect();
    const scale = box.width / frameNode.offsetWidth || 1;
    const rect = target.getBoundingClientRect();
    const share = sliderRow ? Number.parseFloat(getComputedStyle(sliderRow).getPropertyValue("--share")) / 100 : 0.5;
    const along = sliderRow ? Math.max(0, Math.min(1, Number.isFinite(share) ? share : 0)) : 0.5;
    const x = (rect.left - box.left + rect.width * (sliderRow ? along : 0.5)) / scale;
    const y = (rect.top - box.top + rect.height * (sliderRow ? 0.5 : 0.55)) / scale;
    node.style.transform = `translate(${x}px, ${y}px)`;
  }, [beat, manual, ready, drag]);

  if (!data) {
    return <p className={styles.unavailable}>{load.status === "loading" ? "Loading the run" : "The run analysis could not be loaded"}</p>;
  }

  const recorded = data.growth.map((sample) => sample.regime);
  const regimes = recorded.reduce<Array<{ regime: string; count: number }>>((runs, regime) => {
    const last = runs[runs.length - 1];
    if (last?.regime === regime) last.count += 1;
    else runs.push({ regime, count: 1 });
    return runs;
  }, []);
  const saved = frame === "saved";
  const running = !saved && beat.aim === null && typeof frame === "number";
  const frameCount = decoded?.frames.length ?? RECORDED_FRAMES;
  const shownFrames = typeof frame === "number" ? frame + 1 : frameCount;

  return (
    <div ref={root} className={watch ? styles.watch : stage ? styles.stage : recorder ? styles.recorder : styles.lab}>
      {recorder ? null : <Settings data={data} amount={amount} />}

      <section className={styles.area} aria-label="Physarum field">
        <header className={styles.areaHead}>
          <p className={styles.title}>Physarum field</p>
          <span className={styles.kicker}>
            {data.archetypeName} · run {data.run}
          </span>
          <button ref={runButton} type="button" className={styles.run} data-pressed={(beat.aim === "run" && beat.press && manual == null) || undefined} onClick={() => dispatch({ type: "run" })}>
            <svg viewBox="0 0 10 10" aria-hidden="true">
              <path d="M2 1v8l7-4z" />
            </svg>
            Run generation
          </button>
        </header>
        <div className={styles.fieldRow}>
          <div className={styles.field} data-saved={saved || undefined}>
            {saved ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img className={styles.fieldImage} src={data.plate} alt={`${data.archetypeName} run ${data.run} at iteration ${data.iterations}`} decoding="async" />
            ) : decoded ? (
              <RecordingCanvas recording={decoded} frame={frame} />
            ) : running ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img className={styles.fieldImage} src={data.recording} alt="" decoding="async" />
            ) : null}
            {!saved && !running && data.marks?.length ? <AttractorField marks={data.marks} size={data.settings.fieldSize} /> : null}
          </div>
          <div className={styles.fieldSide}>
            <p className={styles.readout}>
              {saved ? data.iterations : running ? "Running" : "Ready"}
              <small>{saved ? `Saved · iteration ${data.iterations}` : running ? "Recording · this run" : "Press Run generation"}</small>
            </p>
            <div>
              <p className={styles.kicker}>Recording</p>
              <div className={styles.ticks} aria-hidden="true">
                {Array.from({ length: frameCount }, (_, tick) => (
                  <i key={tick} data-on={(running || saved) && tick < shownFrames ? "" : undefined} />
                ))}
                <i className={styles.jump} />
                <i data-on={saved ? "" : undefined} />
              </div>
            </div>
            <div data-shown={saved || undefined} className={styles.regimes}>
              <p className={styles.kicker}>Growth regime</p>
              <div className={styles.regimeBar} aria-hidden="true">
                {regimes.map((run, position) => (
                  <i key={`${run.regime}-${position}`} style={{ flexGrow: run.count, background: REGIME_TONE[run.regime] ?? "rgba(242,242,238,0.28)" }} />
                ))}
              </div>
              <p className={styles.note}>{[...new Set(recorded)].filter((regime) => regime !== "Unlabeled").join(" → ")}</p>
            </div>
            {recorder ? null : <p className={styles.note}>The existing recording of this run, then its saved plate. Nothing is simulated here.</p>}
          </div>
        </div>
      </section>

      {recorder ? null : <section className={styles.area} aria-label="Analysis">
        <header className={styles.areaHead}>
          <p className={styles.title}>Analysis · Physarum logic</p>
          <span className={styles.badge}>{saved ? `Held · iteration ${data.iterations}` : "Idle"}</span>
        </header>
        <div className={styles.tabs} role="tablist" aria-label="Simulation analysis">
          {ANALYSIS_TABS.map((item, position) => (
            <button
              key={item.id}
              ref={(node) => {
                tabButtons.current[position] = node;
              }}
              type="button"
              role="tab"
              aria-selected={tab === position}
              data-pressed={(beat.aim === position && beat.press && manual == null) || undefined}
              className={styles.tab}
              onClick={() => dispatch({ type: "tab", tab: position })}
            >
              {item.label}
            </button>
          ))}
        </div>
        <div className={styles.view} role="tabpanel">
          {tab == null || !saved ? (
            <p className={styles.waiting}>The Lab&apos;s analysis of this run appears when the field reaches iteration {data.iterations}.</p>
          ) : (
            <AnalysisView key={tab} data={data} tab={tab} />
          )}
        </div>
      </section>}

      {recorder ? null : (
      <span ref={cursor} className={styles.cursor} aria-hidden="true">
        <svg viewBox="0 0 18 22">
          <path d="M1 1v17l4.6-4.2 3.2 7 3-1.4-3.2-6.8 6.4-.2z" />
        </svg>
      </span>
      )}
    </div>
  );
}
