import type { BiologicalBehavior, BiologicalTranslation, VizSettings } from "@/lib/skill1/types";
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
