"use client";

import type { AttractorKind, BiologicalBehavior, BiologicalTranslation, FieldAttractor, VizSettings } from "@/lib/skill1/types";
import {
  DISPLAY_ITERATIONS,
  FIELD_SIZE,
  MAX_AGENT_COUNT,
  MAX_DENSITY,
  MAX_ITERATIONS,
  MIN_AGENT_COUNT,
  MIN_DENSITY,
} from "@/lib/skill1/maps";

function sourceLabel(corner: string) {
  if (corner === "bottom-left") return "Bottom left";
  if (corner === "bottom-right") return "Bottom right";
  return corner.replace("-", " ");
}

function rankClass(label: string) {
  if (label === "High") return "text-[var(--orange-hot)]";
  if (label === "Medium") return "text-[var(--cyan-hot)]";
  return "text-[var(--muted)]";
}

function BehaviorRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="archetype-info-row archetype-behavior-row flex items-baseline justify-between gap-3">
      <dt className="archetype-info-label text-[var(--muted)]">{label}</dt>
      <dd className={`archetype-info-value ${rankClass(value === "controlled" ? "Medium" : value)}`}>
        {value}
      </dd>
    </div>
  );
}

function SettingRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="archetype-info-row archetype-setting-row flex items-baseline justify-between gap-3">
      <dt className="archetype-info-label text-[var(--muted)]">{label}</dt>
      <dd className="archetype-info-value text-right text-[var(--text)]">{value}</dd>
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
    <li className="archetype-legend-item flex items-center gap-2">
      <span
        className="archetype-legend-dot inline-block h-2.5 w-2.5 rounded-full"
        style={
          ring
            ? { boxShadow: `0 0 0 1.5px ${color} inset`, background: "transparent" }
            : { background: color }
        }
      />
      <span className="archetype-legend-label">{label}</span>
    </li>
  );
}

export function ArchetypeBehaviorPanel({ behavior }: { behavior: BiologicalBehavior }) {
  return (
    <div className="archetype-info-section archetype-behavior-panel">
      <p className="eyebrow archetype-info-kicker mb-1.5">Biological behavior</p>
      <dl className="archetype-info-list space-y-1 text-[0.68rem] uppercase tracking-[0.08em]">
        <BehaviorRow label="Exploration" value={behavior.exploration} />
        <BehaviorRow label="Attraction" value={behavior.attraction} />
        <BehaviorRow label="Trail following" value={behavior.trailFollowing} />
        <BehaviorRow label="Reinforcement" value={behavior.reinforcement} />
        <BehaviorRow label="Decay" value={behavior.decay} />
      </dl>
    </div>
  );
}

export function ArchetypeSimulationSettings({
  behavior,
  translation,
  viz,
  seed,
  iterations = DISPLAY_ITERATIONS,
  onAgentCount,
  onDensity,
  onSpeed,
  onIterations,
  onTrailDecay,
  showAttractors,
  onShowAttractors,
}: {
  behavior: BiologicalBehavior;
  translation: BiologicalTranslation | null;
  viz: VizSettings;
  seed: number;
  iterations?: number;
  onAgentCount: (value: number) => void;
  onDensity: (value: number) => void;
  onSpeed: (value: number) => void;
  onIterations?: (value: number) => void;
  onTrailDecay?: (value: number) => void;
  showAttractors?: boolean;
  onShowAttractors?: (value: boolean) => void;
}) {
  const recipe = translation?.recipe;
  return (
    <div className="archetype-info-section archetype-simulation-settings">
      <p className="eyebrow archetype-info-kicker mb-1.5">Simulation settings</p>
      <dl className="archetype-info-list space-y-1 text-[0.68rem] uppercase tracking-[0.08em]">
        <SettingRow label="Agents" value={String(viz.agentCount)} />
        <SettingRow label="Density" value={String(viz.density)} />
        <SettingRow
          label="Field size"
          value={`${FIELD_SIZE} × ${FIELD_SIZE}`}
        />
        <SettingRow
          label="Source"
          value={recipe ? sourceLabel(recipe.sourceCorner) : "—"}
        />
        <SettingRow
          label="Attractor"
          value={recipe ? `Center (${recipe.attractor.x}, ${recipe.attractor.y})` : "—"}
        />
        <SettingRow label="Randomness" value={behavior.randomness} />
        <SettingRow label="Iterations" value={String(iterations)} />
        <SettingRow label="Trail decay" value={viz.trailDecay.toFixed(3)} />
        <SettingRow label="Seed" value={seed.toString(16)} />
      </dl>
      {onShowAttractors ? (
        <button
          type="button"
          onClick={() => onShowAttractors(!showAttractors)}
          className="mt-2 flex w-full items-center justify-between border border-[rgba(242,242,238,0.28)] px-2 py-1 text-[0.68rem] uppercase tracking-[0.08em] text-[var(--text)]"
        >
          <span>Attractor</span>
          <span>{showAttractors ? "On" : "Off"}</span>
        </button>
      ) : null}

      <label className="archetype-control archetype-control-agents mt-2 flex flex-col gap-1 text-[0.58rem] uppercase tracking-[0.12em] text-[var(--muted)]">
        <span className="archetype-control-label">Agents {viz.agentCount}</span>
        <input
          className="range-hud archetype-control-input"
          type="range"
          min={MIN_AGENT_COUNT}
          max={MAX_AGENT_COUNT}
          step={1}
          value={viz.agentCount}
          onChange={(event) => onAgentCount(Number(event.target.value))}
        />
      </label>

      <label className="archetype-control archetype-control-density mt-2 flex flex-col gap-1 text-[0.58rem] uppercase tracking-[0.12em] text-[var(--muted)]">
        <span className="archetype-control-label">Density {viz.density}</span>
        <input
          className="range-hud archetype-control-input"
          type="range"
          min={MIN_DENSITY}
          max={MAX_DENSITY}
          step={1}
          value={viz.density}
          onChange={(event) => onDensity(Number(event.target.value))}
        />
      </label>

      <label className="archetype-control archetype-control-speed mt-2 flex flex-col gap-1 text-[0.58rem] uppercase tracking-[0.12em] text-[var(--muted)]">
        <span className="archetype-control-label">Speed {viz.speed}</span>
        <input
          className="range-hud archetype-control-input"
          type="range"
          min={1}
          max={8}
          step={1}
          value={viz.speed}
          onChange={(event) => onSpeed(Number(event.target.value))}
        />
      </label>

      {onIterations ? (
        <label className="archetype-control archetype-control-iterations mt-2 flex flex-col gap-1 text-[0.58rem] uppercase tracking-[0.12em] text-[var(--muted)]">
          <span className="archetype-control-label">Iterations {iterations}</span>
          <input
            className="range-hud archetype-control-input"
            type="range"
            min={1}
            max={MAX_ITERATIONS}
            step={1}
            value={iterations}
            onChange={(event) => onIterations(Number(event.target.value))}
          />
        </label>
      ) : null}

      {onTrailDecay ? (
        <label className="archetype-control archetype-control-decay mt-2 flex flex-col gap-1 text-[0.58rem] uppercase tracking-[0.12em] text-[var(--muted)]">
          <span className="archetype-control-label">Trail decay {viz.trailDecay.toFixed(3)}</span>
          <input
            className="range-hud archetype-control-input"
            type="range"
            min={0.96}
            max={0.998}
            step={0.001}
            value={viz.trailDecay}
            onChange={(event) => onTrailDecay(Number(event.target.value))}
          />
        </label>
      ) : null}
    </div>
  );
}

function ParameterSlider({
  label,
  value,
  min,
  max,
  step,
  display,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  display: string;
  onChange: (value: number) => void;
}) {
  return (
    <label className="archetype-control mt-2 flex flex-col gap-1 text-[0.58rem] uppercase tracking-[0.12em] text-[var(--muted)]">
      <span className="archetype-control-label">
        {label} {display}
      </span>
      <input
        className="range-hud archetype-control-input"
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}

export { agentCountFromDensity } from "@/lib/skill1/slime-controls";

export function PhysarumParameterPanel({
  sensorDistance,
  sensorAngle,
  turnAngle,
  moveDistance,
  deposit,
  diffusion,
  trailInfluence,
  resistance,
  agentDensity,
  agentCount,
  iterations,
  onSensorDistance,
  onSensorAngle,
  onTurnAngle,
  onMoveDistance,
  onDeposit,
  onDiffusion,
  onTrailInfluence,
  onResistance,
  onAgentDensity,
  onIterations,
  showAttractors,
  onShowAttractors,
  attractors,
  onAttractorsEdit,
  selectedIndices = [0],
  onSelectedIndices,
}: {
  sensorDistance: number;
  sensorAngle: number;
  turnAngle: number;
  moveDistance: number;
  deposit: number;
  diffusion: number;
  trailInfluence: number;
  resistance: number;
  agentDensity: number;
  agentCount: number;
  iterations: number;
  onSensorDistance: (value: number) => void;
  onSensorAngle: (value: number) => void;
  onTurnAngle: (value: number) => void;
  onMoveDistance: (value: number) => void;
  onDeposit: (value: number) => void;
  onDiffusion: (value: number) => void;
  onTrailInfluence: (value: number) => void;
  onResistance: (value: number) => void;
  onAgentDensity: (value: number) => void;
  onIterations: (value: number) => void;
  showAttractors: boolean;
  onShowAttractors: (value: boolean) => void;
  attractors?: FieldAttractor[];
  onAttractorsEdit?: (next: FieldAttractor[]) => void;
  selectedIndices?: number[];
  onSelectedIndices?: (indices: number[]) => void;
}) {
  const marks = attractors ?? [];
  const selection = (selectedIndices.length ? selectedIndices : [0])
    .map((item) => Math.min(item, Math.max(0, marks.length - 1)))
    .filter((item, itemIndex, all) => marks.length > 0 && all.indexOf(item) === itemIndex);
  const index = selection.length ? selection[selection.length - 1] : 0;
  const selected = marks[index];
  const setSelection = (next: number[]) => onSelectedIndices?.(next);
  const chooseAttractor = (itemIndex: number, shift: boolean) => {
    if (!shift) {
      setSelection([itemIndex]);
      return;
    }
    if (selection.includes(itemIndex)) {
      const next = selection.filter((item) => item !== itemIndex);
      setSelection(next.length ? next : [itemIndex]);
      return;
    }
    setSelection([...selection, itemIndex]);
  };
  const editSelected = (patch: Partial<FieldAttractor>) => {
    if (!selected || !onAttractorsEdit) return;
    onAttractorsEdit(marks.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item)));
  };
  const deleteAttractor = (itemIndex: number) => {
    if (!onAttractorsEdit) return;
    const next = marks.filter((_, markIndex) => markIndex !== itemIndex);
    const nextSelection = selection
      .filter((item) => item !== itemIndex)
      .map((item) => (item > itemIndex ? item - 1 : item));
    setSelection(nextSelection.length ? nextSelection : [Math.max(0, next.length - 1)]);
    onAttractorsEdit(next);
  };
  const setAttractorKind = (kind: AttractorKind) => {
    if (!selected || !onAttractorsEdit || selected.kind === kind) return;
    const x2 = selected.x2 ?? Math.min(19.6, selected.x + 3);
    const y2 = selected.y2 ?? selected.y;
    const next: FieldAttractor = { ...selected, kind };
    if (kind === "point") {
      next.x2 = undefined;
      next.y2 = undefined;
      next.cx = undefined;
      next.cy = undefined;
    } else if (kind === "ring") {
      next.radius = selected.radius ?? 1.6;
      next.hole = true;
    } else if (kind === "line") {
      next.x2 = x2;
      next.y2 = y2;
      next.cx = undefined;
      next.cy = undefined;
    } else {
      next.x2 = x2;
      next.y2 = y2;
      next.cx = selected.cx ?? (selected.x + x2) / 2;
      next.cy = selected.cy ?? Math.min(19.6, (selected.y + y2) / 2 + 1.6);
    }
    editSelected(next);
  };
  const addAttractor = () => {
    if (!onAttractorsEdit) return;
    const last = marks[marks.length - 1];
    onAttractorsEdit([
      ...marks,
      {
        kind: "point",
        x: Math.min(19.6, (last?.x ?? 10) + 1.2),
        y: last?.y ?? 10,
        radius: 1.6,
      },
    ]);
    setSelection([marks.length]);
  };
  return (
    <div className="physarum-param-groups">
      <section className="physarum-param-section">
        <p className="eyebrow archetype-info-kicker">Agent</p>
        <ParameterSlider label="Agent density" value={agentDensity} min={MIN_DENSITY} max={MAX_DENSITY} step={1} display={String(agentDensity)} onChange={onAgentDensity} />
        <ParameterSlider label="Sensor distance" value={sensorDistance} min={0.25} max={2.2} step={0.01} display={sensorDistance.toFixed(2)} onChange={onSensorDistance} />
        <ParameterSlider label="Sensor angle" value={sensorAngle} min={0.08} max={1.35} step={0.01} display={sensorAngle.toFixed(2)} onChange={onSensorAngle} />
        <ParameterSlider label="Turn / rotation angle" value={turnAngle} min={0.05} max={1.2} step={0.01} display={turnAngle.toFixed(2)} onChange={onTurnAngle} />
        <ParameterSlider label="Move distance" value={moveDistance} min={0.08} max={0.5} step={0.01} display={moveDistance.toFixed(2)} onChange={onMoveDistance} />
      </section>
      <section className="physarum-param-section">
        <p className="eyebrow archetype-info-kicker">Stigmergy</p>
        <ParameterSlider label="Deposit strength" value={deposit} min={0.02} max={0.22} step={0.001} display={deposit.toFixed(3)} onChange={onDeposit} />
        <ParameterSlider label="Trail diffusion" value={diffusion} min={0} max={0.42} step={0.01} display={diffusion.toFixed(2)} onChange={onDiffusion} />
        <ParameterSlider label="Trail influence" value={trailInfluence} min={0} max={2} step={0.01} display={trailInfluence.toFixed(2)} onChange={onTrailInfluence} />
      </section>
      <section className="physarum-param-section">
        <p className="eyebrow archetype-info-kicker">Environment</p>
        <ParameterSlider label="Environmental resistance" value={resistance} min={0} max={1} step={0.01} display={resistance.toFixed(2)} onChange={onResistance} />
      </section>
      <section className="physarum-param-section">
        <p className="eyebrow archetype-info-kicker">Simulation settings</p>
        <dl className="archetype-info-list space-y-1 text-[0.68rem] uppercase tracking-[0.08em]">
          <SettingRow label="Agents" value={String(agentCount)} />
          <SettingRow label="Field size" value={`${FIELD_SIZE} × ${FIELD_SIZE}`} />
        </dl>
        <ParameterSlider label="Iterations" value={iterations} min={1} max={MAX_ITERATIONS} step={1} display={String(iterations)} onChange={onIterations} />
        <button
          type="button"
          onClick={() => onShowAttractors(!showAttractors)}
          className="mt-2 flex items-center justify-between border border-[rgba(242,242,238,0.28)] px-2 py-1 text-[0.68rem] uppercase tracking-[0.08em] text-[var(--text)]"
        >
          <span>Attractor</span>
          <span>{showAttractors ? "On" : "Off"}</span>
        </button>
        {selected && onAttractorsEdit ? (
          <>
            <div className="mt-2 flex items-center justify-between gap-2 text-[0.68rem] uppercase tracking-[0.08em] text-[var(--text)]">
              <button type="button" onClick={() => setSelection([(index - 1 + marks.length) % marks.length])} className="border border-[rgba(242,242,238,0.28)] px-2 py-1">Prev</button>
              <span>Attractor {index + 1} / {marks.length}</span>
              <button type="button" onClick={() => setSelection([(index + 1) % marks.length])} className="border border-[rgba(242,242,238,0.28)] px-2 py-1">Next</button>
            </div>
            <ul className="mt-2 space-y-1">
              {marks.map((item, itemIndex) => (
                <li key={`${item.kind}-${itemIndex}`} className="flex items-center justify-between gap-2 text-[0.68rem] uppercase tracking-[0.08em] text-[var(--text)]">
                  <button
                    type="button"
                    onClick={(event) => chooseAttractor(itemIndex, event.shiftKey)}
                    className="px-2 py-1 text-left"
                    style={selection.includes(itemIndex) ? { background: "linear-gradient(90deg, #0f7377 0%, #8faaa8 52%, #c77e5f 100%)", color: "#f2f2ee" } : undefined}
                  >
                    Attractor {itemIndex + 1}
                  </button>
                  <button type="button" onClick={() => deleteAttractor(itemIndex)} className="border border-[rgba(242,242,238,0.28)] px-2 py-1">
                    Delete
                  </button>
                </li>
              ))}
            </ul>
            <button
              type="button"
              onClick={addAttractor}
              className="mt-2 border border-[rgba(242,242,238,0.28)] px-2 py-1 text-left text-[0.68rem] uppercase tracking-[0.08em] text-[var(--text)]"
            >
              Add
            </button>
            <div className="mt-2 flex flex-wrap gap-2">
              {(
                [
                  ["point", "Point"],
                  ["line", "Line"],
                  ["ring", "Circle"],
                  ["curve", "Curvy line"],
                ] as const
              ).map(([kind, label]) => (
                <button
                  key={kind}
                  type="button"
                  onClick={() => setAttractorKind(kind)}
                  className="border border-[rgba(242,242,238,0.28)] px-2 py-1 text-[0.68rem] uppercase tracking-[0.08em] text-[var(--text)]"
                  style={selected.kind === kind ? { background: "linear-gradient(90deg, #0f7377 0%, #8faaa8 52%, #c77e5f 100%)", color: "#f2f2ee" } : undefined}
                >
                  {label}
                </button>
              ))}
            </div>
            <ParameterSlider label="Location X" value={selected.x} min={0.4} max={19.6} step={0.1} display={selected.x.toFixed(1)} onChange={(x) => editSelected({ x })} />
            <ParameterSlider label="Location Y" value={selected.y} min={0.4} max={19.6} step={0.1} display={selected.y.toFixed(1)} onChange={(y) => editSelected({ y })} />
            <ParameterSlider label="Size" value={selected.radius ?? 1.6} min={0.35} max={8} step={0.05} display={(selected.radius ?? 1.6).toFixed(2)} onChange={(radius) => editSelected({ radius })} />
          </>
        ) : null}
      </section>
    </div>
  );
}

export function ArchetypeVisualLegend() {
  return (
    <div className="archetype-info-section archetype-visual-legend">
      <p className="eyebrow archetype-info-kicker mb-1.5">Visual legend</p>
      <ul className="archetype-legend-list space-y-1 text-[0.62rem] uppercase tracking-[0.1em] text-[var(--muted)]">
        <LegendDot color="#d28a30" label="Strong trail / path" />
        <LegendDot color="#3ec8b4" label="Secondary path" />
        <LegendDot color="#12d0ba" label="Weak path" />
        <LegendDot color="#5ad6ba" label="Agent" />
        <LegendDot color="#5ad6ba" label="Source" ring />
        <LegendDot color="#d28a30" label="Attractor" />
      </ul>
    </div>
  );
}

export function ArchetypeArchitecturalLayers({
  topology,
}: {
  topology?: BiologicalTranslation["topology"];
}) {
  return (
    <div className="archetype-info-section archetype-architectural-layers">
      <p className="eyebrow archetype-info-kicker mb-1.5">Architectural layers</p>
      <ul className="archetype-legend-list archetype-layer-list space-y-1 text-[0.62rem] uppercase tracking-[0.1em] text-[var(--muted)]">
        {topology === "contained-interior" ? (
          <>
            <LegendDot color="#b0764e" label="Mass / outer volume" />
            <LegendDot color="#f0a45a" label="Contained room" />
            <LegendDot color="#6f7a80" label="Transition / circulation" />
          </>
        ) : topology === "open-network" ? (
          <>
            <LegendDot color="#d6d6d2" label="Trail mass / occupation" />
            <LegendDot color="#6f7a80" label="Circulation / connection" />
            <LegendDot color="#0b0d10" label="Open field" />
          </>
        ) : (
          <>
            <LegendDot color="#d6d6d2" label="Mass / built form" />
            <LegendDot color="#0b0d10" label="Void / open space" />
            <LegendDot color="#6f7a80" label="Transition / circulation" />
          </>
        )}
      </ul>
    </div>
  );
}
