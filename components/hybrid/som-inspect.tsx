"use client";

import { useEffect, useState, type CSSProperties } from "react";
import type { IsoMesh } from "@/lib/scan/isomesh";
import { CANDIDATE_FIELD_SETTINGS, type HybridCandidate, type HybridCriterionValue } from "@/lib/skill4/candidate-field";
import type { GeneratedHybridCandidate, GeneratedHybridField } from "@/lib/skill4/generated-hybrid-field";
import { hybridDisplay } from "@/lib/skill4/hybrid-display";
import { NETWORK_VOLUME_SETTINGS } from "@/lib/skill4/network-volume";
import { HybridMatrixGrid } from "./mock-matrix";

export type SomInspectConnection = {
  id: string;
  signature: string;
  faceA: string;
  faceB: string;
  tileAId: string;
  tileBId: string;
  parentAName: string;
  parentBName: string;
  selectedId: string;
  generatedField: GeneratedHybridField | null;
};

type Mode = "profile" | "criteria" | "morphology" | "geometry";
type Lane = { row?: number | null; column?: number | null };

const STAGES = ["Sense", "Explore", "Branch", "Reinforce", "Merge", "Settle"] as const;

export function SomInspect({
  connection,
  colorA,
  colorB,
  onSelect,
  onClose,
}: {
  connection: SomInspectConnection;
  colorA: [number, number, number];
  colorB: [number, number, number];
  onSelect: (id: string) => void;
  onClose: () => void;
}) {
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [lane, setLane] = useState<Lane | null>(null);
  const [mode, setMode] = useState<Mode>("profile");
  const size = useInspectSquare();
  const display = hybridDisplay({
    signature: connection.signature,
    selectedMockId: connection.selectedId,
    generatedHybridField: connection.generatedField,
  });
  const selected = display.selected;
  const generated = connection.generatedField?.candidates.find((item) => item.candidateId === selected.id) ?? null;
  const position = cellPosition(selected.id);
  const hoverPosition = hoverId ? cellPosition(hoverId) : null;
  const emphasis = hoverPosition ?? lane ?? position;
  const columns = columnAxis(connection.generatedField);
  const rows = rowAxis(connection.generatedField);
  const weights = candidateWeights(generated?.candidate, position);
  const intensity = generated?.candidate?.transformationIntensity ?? (position ? CANDIDATE_FIELD_SETTINGS.transformationIntensity[position.row] : null);
  const tip = hoverId
    ? describeCell(hoverId, connection.generatedField)
    : lane?.column != null
      ? `A ${percent(columns[lane.column].parentA)} / B ${percent(columns[lane.column].parentB)}`
      : lane?.row != null
        ? `Transformation ${formatNumber(rows[lane.row].intensity)}`
        : "";

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="hybrid-som-inspect" data-som-inspect={connection.id} onClick={onClose}>
      <div className="hybrid-som-inspect-panel" role="dialog" aria-modal="true" aria-label="SOM inspection" style={{ "--som": `${size}px` } as CSSProperties} onClick={(event) => event.stopPropagation()}>
        <div className="hybrid-som-inspect-stage">
          <p className="hybrid-som-hover">{tip}</p>
          <div className="hybrid-som-inspect-body">
            <div className="hybrid-som-y-words" style={{ height: size }}>
              <span>Restrained</span>
              <span>Exploratory</span>
            </div>
            <div className="hybrid-som-y" style={{ height: size }}>
              {rows.map((row, index) => (
                <button
                  key={row.intensity}
                  type="button"
                  data-active={emphasis?.row === index || undefined}
                  aria-label={`Row ${index + 1}, intensity ${formatNumber(row.intensity)}`}
                  onMouseEnter={() => setLane({ row: index })}
                  onMouseLeave={() => setLane(null)}
                >
                  <i style={{ height: `${28 + index * 18}%` }} />
                </button>
              ))}
            </div>
            <div className="hybrid-som-square" style={{ width: size, height: size }}>
              <HybridMatrixGrid
                signature={connection.signature}
                selectedId={connection.selectedId}
                generatedField={connection.generatedField}
                onSelect={onSelect}
                onHover={setHoverId}
                emphasis={emphasis}
                colorA={colorA}
                colorB={colorB}
              />
            </div>
          </div>
          <div className="hybrid-som-inspect-body">
            <span />
            <span />
            <div className="hybrid-som-x" style={{ width: size }}>
              <div className="hybrid-som-x-words">
                <span>A dominant</span>
                <span>Balanced</span>
                <span>B dominant</span>
              </div>
              <div className="hybrid-som-x-bar">
                {columns.map((column, index) => (
                  <button
                    key={`${column.parentA}-${column.parentB}`}
                    type="button"
                    data-active={emphasis?.column === index || undefined}
                    aria-label={`Column ${index + 1}, A ${percent(column.parentA)}, B ${percent(column.parentB)}`}
                    onMouseEnter={() => setLane({ column: index })}
                    onMouseLeave={() => setLane(null)}
                  />
                ))}
              </div>
              <div className="hybrid-som-x-ratios">
                {columns.map((column) => (
                  <span key={`ratio-${column.parentA}`}>{Math.round(column.parentA * 100)}/{Math.round(column.parentB * 100)}</span>
                ))}
              </div>
            </div>
          </div>
        </div>
        <aside className="hybrid-som-info">
          <div className="hybrid-som-info-head">
            <p>{connection.tileAId}:{connection.faceA} ↔ {connection.tileBId}:{connection.faceB}</p>
            <button type="button" className="hybrid-som-close" onClick={onClose}>Close</button>
          </div>
          <p className="hybrid-som-id">{selected.id}</p>
          <p className="hybrid-som-character">{character(position)}</p>
          <p className="hybrid-som-parents">{connection.parentAName} · {connection.faceA}<span>{connection.parentBName} · {connection.faceB}</span></p>
          <Balance weights={weights} />
          <Meter label="Transformation" value={intensity} max={1} />
          <Sequence row={position?.row ?? 0} />
          <div className="hybrid-som-modes" role="group" aria-label="Inspection detail">
            {(["criteria", "morphology", "geometry"] as const).map((item) => (
              <button key={item} type="button" data-active={mode === item || undefined} onClick={() => setMode(mode === item ? "profile" : item)}>
                {item}
              </button>
            ))}
          </div>
          {mode === "criteria" ? <CriteriaMode candidate={generated?.candidate ?? null} /> : null}
          {mode === "morphology" ? <MorphologyMode candidate={generated?.candidate ?? null} row={position?.row ?? 0} steps={position ? rows[position.row]?.steps : null} /> : null}
          {mode === "geometry" ? <GeometryMode generated={generated} mesh={selected.mesh} status={selected.source} /> : null}
        </aside>
      </div>
    </div>
  );
}

function Balance({ weights }: { weights: { parentA: number; parentB: number } | null }) {
  return (
    <div className="hybrid-som-balance-block">
      <div className="hybrid-som-balance-labels"><span>A {weights ? percent(weights.parentA) : "--"}</span><span>B {weights ? percent(weights.parentB) : "--"}</span></div>
      <div className="hybrid-som-balance">
        {weights ? <b style={{ left: `${weights.parentB * 100}%` }} /> : null}
      </div>
    </div>
  );
}

function Meter({ label, value, max }: { label: string; value: number | null; max: number }) {
  const amount = value == null || max <= 0 ? 0 : Math.min(1, Math.max(0, value / max));
  return (
    <div className="hybrid-som-meter">
      <span>{label}</span>
      <i><b style={{ width: value == null ? "0%" : `${amount * 100}%` }} /></i>
      <em>{value == null ? "--" : formatNumber(value)}</em>
    </div>
  );
}

function Sequence({ row }: { row: number }) {
  const on = activeStages(row);
  return (
    <div className="hybrid-som-sequence" aria-label="Physarum sequence">
      {STAGES.map((stage) => (
        <span key={stage} data-on={on.has(stage) || undefined}>
          <StageIcon stage={stage} />
          {stage}
        </span>
      ))}
    </div>
  );
}

function CriteriaMode({ candidate }: { candidate: HybridCandidate | null }) {
  const [all, setAll] = useState(false);
  const criteria = orderedCriteria(candidate);
  const shown = all ? criteria : criteria.slice(0, 5);
  if (criteria.length === 0) return <p className="hybrid-som-empty">Criteria --</p>;
  return (
    <div className="hybrid-som-mode">
      <div className="hybrid-som-criteria-key"><span>A</span><span>Hybrid</span><span>B</span></div>
      {shown.map((item) => <CriterionTrack key={item.criterionId} item={item} />)}
      {criteria.length > 5 ? (
        <button type="button" className="hybrid-som-more" onClick={() => setAll((value) => !value)}>{all ? "Show less" : "Show all criteria"}</button>
      ) : null}
    </div>
  );
}

function CriterionTrack({ item }: { item: HybridCriterionValue }) {
  const hybrid = clamp01(item.value / 2);
  const left = item.catalogA == null ? null : clamp01(item.catalogA / 2);
  const right = item.catalogB == null ? null : clamp01(item.catalogB / 2);
  return (
    <div className="hybrid-som-track">
      <span>{label(item.criterionId)}</span>
      <svg viewBox="0 0 100 16" aria-hidden="true">
        <line x1="4" y1="8" x2="96" y2="8" />
        {left != null ? <circle cx={4 + left * 92} cy="8" r="2.2" /> : null}
        <circle className="hybrid-som-mark" cx={4 + hybrid * 92} cy="8" r="3.4" />
        {right != null ? <circle cx={4 + right * 92} cy="8" r="2.2" /> : null}
      </svg>
    </div>
  );
}

function MorphologyMode({ candidate, row, steps }: { candidate: HybridCandidate | null; row: number; steps: number | null }) {
  const axes = morphologyAxes(candidate);
  return (
    <div className="hybrid-som-mode">
      <div className="hybrid-som-glyph-row">
        <RouteGlyph row={row} />
        <p>{steps == null ? "Evolution --" : `${steps} steps`}</p>
      </div>
      {axes.map((axis) => <Meter key={axis.id} label={axis.label} value={axis.value} max={2} />)}
      {axes.length >= 3 ? <Radar axes={axes} /> : null}
      <div className="hybrid-som-legend">
        <span><RouteGlyph row={0} />Reinforced</span>
        <span><RouteGlyph row={2} />Branch / merge</span>
        <span><RouteGlyph row={4} />Open</span>
      </div>
    </div>
  );
}

function GeometryMode({
  generated,
  mesh,
  status,
}: {
  generated: GeneratedHybridCandidate | null;
  mesh: IsoMesh | null;
  status: string;
}) {
  const bounds = mesh ? extent(mesh) : null;
  const max = bounds ? Math.max(bounds.x, bounds.y, bounds.z, 1e-6) : 1;
  return (
    <div className="hybrid-som-mode hybrid-som-geometry">
      <p><span>Vertices</span><b>{generated ? generated.vertexCount : "--"}</b></p>
      <p><span>Triangles</span><b>{generated ? generated.triangleCount : "--"}</b></p>
      <p><span>Components</span><b>--</b></p>
      <p><span>Manifold</span><b>--</b></p>
      <p><span>Status</span><b>{generated?.status ?? status}</b></p>
      {bounds ? (
        <div className="hybrid-som-xyz">
          <Meter label="X" value={bounds.x} max={max} />
          <Meter label="Y" value={bounds.y} max={max} />
          <Meter label="Z" value={bounds.z} max={max} />
        </div>
      ) : <p><span>Bounds</span><b>--</b></p>}
    </div>
  );
}

function Radar({ axes }: { axes: { id: string; label: string; value: number }[] }) {
  const count = axes.length;
  const point = (index: number, scale: number) => {
    const angle = -Math.PI / 2 + (index / count) * Math.PI * 2;
    return [50 + Math.cos(angle) * 34 * scale, 50 + Math.sin(angle) * 34 * scale];
  };
  const ring = (scale: number) => axes.map((_, index) => point(index, scale).join(",")).join(" ");
  const shape = axes.map((axis, index) => point(index, clamp01(axis.value / 2)).join(",")).join(" ");
  return (
    <svg className="hybrid-som-radar" viewBox="0 0 100 100" role="img" aria-label="Criteria shape">
      <polygon points={ring(1)} />
      <polygon points={ring(0.5)} />
      <polygon className="hybrid-som-radar-fill" points={shape} />
    </svg>
  );
}

function RouteGlyph({ row }: { row: number }) {
  const open = row >= 4;
  const branch = row >= 2;
  const spur = row === 1;
  return (
    <svg className="hybrid-som-route" viewBox="0 0 48 28" aria-hidden="true">
      <path d={branch ? "M4 14 H18 L28 6 H44 M18 14 L28 22 H44" : "M4 14 H44"} />
      {spur ? <path d="M24 14 L36 6" /> : null}
      {open ? <circle cx="24" cy="14" r="4" /> : null}
    </svg>
  );
}

function StageIcon({ stage }: { stage: (typeof STAGES)[number] }) {
  const d = stage === "Sense" ? "M14 8 v12 M8 14 h12"
    : stage === "Explore" ? "M6 20 L14 8 L22 20"
    : stage === "Branch" ? "M6 22 L14 8 L22 22 M14 14 H22"
    : stage === "Reinforce" ? "M4 14 H24"
    : stage === "Merge" ? "M4 6 L14 14 L4 22 M14 14 H24"
    : "M6 14 H22";
  return (
    <svg viewBox="0 0 28 28" aria-hidden="true">
      <path d={d} strokeWidth={stage === "Reinforce" ? 4 : 1.6} />
    </svg>
  );
}

function useInspectSquare() {
  const [size, setSize] = useState(520);
  useEffect(() => {
    const measure = () => {
      const narrow = window.innerWidth < 980;
      const gutter = 78;
      if (narrow) {
        setSize(Math.max(220, Math.floor(Math.min(window.innerWidth - 36 - gutter, window.innerHeight * 0.58))));
        return;
      }
      const somWidth = (window.innerWidth - 40) * 0.72 - gutter;
      const somHeight = window.innerHeight * 0.74 - 92;
      setSize(Math.max(260, Math.floor(Math.min(somWidth, somHeight))));
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);
  return size;
}

function activeStages(row: number) {
  if (row <= 0) return new Set<(typeof STAGES)[number]>(["Sense", "Settle"]);
  if (row === 1) return new Set<(typeof STAGES)[number]>(["Sense", "Explore", "Settle"]);
  if (row === 2) return new Set<(typeof STAGES)[number]>(["Sense", "Explore", "Branch", "Merge", "Settle"]);
  if (row === 3) return new Set<(typeof STAGES)[number]>(["Sense", "Explore", "Branch", "Reinforce", "Merge", "Settle"]);
  return new Set<(typeof STAGES)[number]>(["Sense", "Explore", "Branch", "Reinforce", "Merge", "Settle"]);
}

function character(position: { row: number; column: number } | null) {
  if (!position) return "--";
  const side = position.column < 2 ? "A dominant" : position.column > 2 ? "B dominant" : "Balanced";
  const level = position.row === 0 ? "Restrained" : position.row === 4 ? "Exploratory" : position.row < 2 ? "Low change" : position.row > 2 ? "High change" : "Medium";
  return `${side} · ${level}`;
}

function morphologyAxes(candidate: HybridCandidate | null) {
  const wanted = ["complexity", "openness", "connectivity", "directionality", "visibility", "proportionality"];
  return orderedCriteria(candidate)
    .filter((item) => wanted.includes(item.criterionId))
    .map((item) => ({ id: item.criterionId, label: label(item.criterionId), value: item.value }));
}

function orderedCriteria(candidate: HybridCandidate | null) {
  const criteria = candidate?.criteria?.filter((item) => Number.isFinite(item.value)) ?? [];
  const rank = ["complexity", "openness", "connectivity", "directionality", "visibility", "proportionality"];
  return [...criteria].sort((a, b) => {
    const ar = rank.indexOf(a.criterionId);
    const br = rank.indexOf(b.criterionId);
    return (ar === -1 ? 99 : ar) - (br === -1 ? 99 : br);
  });
}

function columnAxis(field: GeneratedHybridField | null) {
  const columns = CANDIDATE_FIELD_SETTINGS.parentAWeights.map((parentA, index) => ({
    parentA,
    parentB: CANDIDATE_FIELD_SETTINGS.parentBWeights[index],
  }));
  for (const item of field?.candidates ?? []) {
    const candidate = item.candidate;
    if (!candidate || typeof candidate.parentAWeight !== "number" || typeof candidate.parentBWeight !== "number") continue;
    if (candidate.column < 0 || candidate.column >= columns.length) continue;
    columns[candidate.column] = { parentA: candidate.parentAWeight, parentB: candidate.parentBWeight };
  }
  return columns;
}

function rowAxis(field: GeneratedHybridField | null) {
  const rows = CANDIDATE_FIELD_SETTINGS.transformationIntensity.map((intensity, index) => ({
    intensity,
    steps: NETWORK_VOLUME_SETTINGS.rows[index] ?? 0,
  }));
  for (const item of field?.candidates ?? []) {
    const candidate = item.candidate;
    if (!candidate || typeof candidate.transformationIntensity !== "number") continue;
    if (candidate.row < 0 || candidate.row >= rows.length) continue;
    rows[candidate.row] = { ...rows[candidate.row], intensity: candidate.transformationIntensity };
  }
  return rows;
}

function describeCell(id: string, field: GeneratedHybridField | null) {
  const generated = field?.candidates.find((item) => item.candidateId === id);
  const position = cellPosition(id);
  const weights = candidateWeights(generated?.candidate, position);
  const intensity = generated?.candidate?.transformationIntensity ?? (position ? CANDIDATE_FIELD_SETTINGS.transformationIntensity[position.row] : null);
  if (!weights || intensity == null) return id;
  return `${id}  ·  A ${Math.round(weights.parentA * 100)} / B ${Math.round(weights.parentB * 100)}  ·  ${formatNumber(intensity)}`;
}

function candidateWeights(candidate: HybridCandidate | null | undefined, position: { row: number; column: number } | null) {
  if (candidate && typeof candidate.parentAWeight === "number" && typeof candidate.parentBWeight === "number") {
    return { parentA: candidate.parentAWeight, parentB: candidate.parentBWeight };
  }
  if (!position) return null;
  return {
    parentA: CANDIDATE_FIELD_SETTINGS.parentAWeights[position.column],
    parentB: CANDIDATE_FIELD_SETTINGS.parentBWeights[position.column],
  };
}

function cellPosition(id: string) {
  const number = Number(id.replace(/^\D+/, ""));
  if (!Number.isInteger(number) || number < 1 || number > CANDIDATE_FIELD_SETTINGS.count) return null;
  const index = number - 1;
  return { row: Math.floor(index / CANDIDATE_FIELD_SETTINGS.columns), column: index % CANDIDATE_FIELD_SETTINGS.columns };
}

function extent(mesh: IsoMesh) {
  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;
  for (let index = 0; index < mesh.positions.length; index += 3) {
    minX = Math.min(minX, mesh.positions[index]);
    minY = Math.min(minY, mesh.positions[index + 1]);
    minZ = Math.min(minZ, mesh.positions[index + 2]);
    maxX = Math.max(maxX, mesh.positions[index]);
    maxY = Math.max(maxY, mesh.positions[index + 1]);
    maxZ = Math.max(maxZ, mesh.positions[index + 2]);
  }
  if (!Number.isFinite(minX)) return null;
  return { x: maxX - minX, y: maxY - minY, z: maxZ - minZ };
}

function percent(weight: number) {
  return `${Math.round(weight * 100)}%`;
}

function formatNumber(value: number) {
  return Number(value.toFixed(2)).toString();
}

function label(id: string) {
  return id.replace(/[-_]/g, " ");
}

function clamp01(value: number) {
  return Math.min(1, Math.max(0, value));
}
