"use client";

import { useEffect, useMemo, useState } from "react";
import { Panel, PanelHeader } from "@/components/hud";
import type { IsoMesh } from "@/lib/scan/isomesh";
import type { TileConnection } from "@/lib/skill4/connections";
import { FINAL_CLUSTER_PAIRS, type FinalClusterPairId } from "@/lib/skill4/final-cluster-pairs";
import { GENERATED_HYBRID_FIELD_SETTINGS, type GeneratedHybridField } from "@/lib/skill4/generated-hybrid-field";
import { envelopeWidth, resolveTileModule, type TileInstance } from "@/lib/skill4/tiles";
import { tileBasis } from "@/lib/skill4/tile-basis";
import { AggregationView } from "./aggregation-view";
import { HybridAssembly } from "./hybrid-assembly";
import { useHybrid } from "./hybrid-state";
import { MockMatrix } from "./mock-matrix";
import { ProcessRow } from "./process-row";
import { SomCandidateFacts } from "./som-inspect";

const PRODUCTION = ["H08", "H13", "H18"];

type PackedMesh = { triangles: number; positions: string; normals: string; indices: string };

type PackedField = Omit<GeneratedHybridField, "candidates"> & {
  candidates: Array<GeneratedHybridField["candidates"][number] & { geometry: PackedMesh | null }>;
};

type ExperimentEdge = {
  id: string;
  tileAId: string;
  tileBId: string;
  faceA: TileConnection["faceA"];
  faceB: TileConnection["faceB"];
  separation: number | null;
  signature: string;
  selectedMockId: string | null;
  connectorSealed: boolean;
  triangles: number;
  validatedHybrid: PackedMesh | null;
  field: PackedField | null;
  parentSections: { a: { label: string }[]; b: { label: string }[] } | null;
};

type Experiment = {
  ok: boolean;
  seed: number;
  character: string;
  intent?: string;
  names: string[];
  structure: string;
  root?: { name: string; archetypeId: string; quarterTurn: number };
  tiles: TileInstance[];
  realized: { primary: string; secondary: string[] };
  edges: ExperimentEdge[];
  assembly: { adopted: boolean; triangles: number; film: PackedMesh | null };
  elapsedMs: number;
  reason?: string;
  catalogWritten?: boolean;
};

export function FinalClusterProcess() {
  const { loaded, ensureArchetypes } = useHybrid();
  const [research, setResearch] = useState(false);
  const [pairId, setPairId] = useState<FinalClusterPairId>("workspace-workspace");
  const [size, setSize] = useState(4);
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState("");
  const [experiment, setExperiment] = useState<Experiment | null>(null);
  const [edgeId, setEdgeId] = useState("");
  const [cellId, setCellId] = useState("");
  const [showFilm, setShowFilm] = useState(false);
  const pair = FINAL_CLUSTER_PAIRS.find((item) => item.id === pairId) ?? FINAL_CLUSTER_PAIRS[0];

  useEffect(() => {
    if (!experiment?.tiles) return;
    ensureArchetypes(experiment.tiles.map((tile) => tile.archetypeId));
  }, [ensureArchetypes, experiment]);

  const edge = experiment?.edges?.find((item) => item.id === edgeId) ?? experiment?.edges?.[0] ?? null;
  const inspectedId = cellId || edge?.selectedMockId || "";

  const run = (connect: boolean) => {
    setBusy(connect ? "Generating H08 · H13 · H18" : "Growing the tree");
    setShowFilm(false);
    void fetch("/api/skill4/process-experiment", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ pairId, size, attempt, connect }),
    })
      .then((response) => response.json() as Promise<Experiment>)
      .then((body) => {
        setExperiment(body);
        setEdgeId(body.edges?.[0]?.id ?? "");
        setCellId(body.edges?.[0]?.selectedMockId ?? "");
      })
      .catch(() => setExperiment(null))
      .finally(() => setBusy(""));
  };

  const span = useMemo(() => {
    const width = envelopeWidth();
    const tiles = experiment?.tiles ?? [];
    if (tiles.length === 0) return width;
    return Math.max(width, ...tiles.flatMap((tile) => [Math.abs(tile.transform.x), Math.abs(tile.transform.y), Math.abs(tile.transform.z)])) * 2 + width;
  }, [experiment]);

  const film = experiment?.assembly?.adopted ? unpackMesh(experiment.assembly.film) : null;
  const instances = useMemo(() => {
    if (!experiment?.tiles) return [];
    if (showFilm && film) {
      return [{
        id: "assembly-film",
        mesh: film,
        translate: { x: 0, y: 0, z: 0 },
        selected: false,
        plain: true,
        color: [0.78, 0.8, 0.82] as [number, number, number],
      }];
    }
    const parents = experiment.tiles.flatMap((tile) => {
      const handoff = resolveTileModule(tile.archetypeId, loaded);
      if (handoff.status !== "ready" || !handoff.geometry) return [];
      return [{
        id: tile.instanceId,
        mesh: handoff.geometry,
        translate: tile.transform,
        selected: false,
        basis: tileBasis(tile),
        color: [1, 1, 1] as [number, number, number],
        opacity: 0.72,
      }];
    });
    const connectors = (experiment.edges ?? []).flatMap((item) => {
      const mesh = unpackMesh(item.validatedHybrid);
      if (!mesh) return [];
      return [{
        id: item.id,
        mesh,
        translate: { x: 0, y: 0, z: 0 },
        selected: item.id === edge?.id,
        plain: true,
        color: [0.78, 0.49, 0.37] as [number, number, number],
      }];
    });
    return [...parents, ...connectors];
  }, [edge?.id, experiment, film, loaded, showFilm]);

  const links = useMemo(() => (experiment?.edges ?? []).flatMap((item) => {
    const tileA = experiment?.tiles.find((tile) => tile.instanceId === item.tileAId);
    const tileB = experiment?.tiles.find((tile) => tile.instanceId === item.tileBId);
    if (!tileA || !tileB) return [];
    return [{
      id: item.id,
      label: `${item.faceA}–${item.faceB}`,
      point: {
        x: (tileA.transform.x + tileB.transform.x) / 2,
        y: (tileA.transform.y + tileB.transform.y) / 2,
        z: (tileA.transform.z + tileB.transform.z) / 2,
      },
      active: item.id === edge?.id,
    }];
  }), [edge?.id, experiment]);

  const field = useMemo(() => unpackField(edge), [edge]);
  const connection = useMemo(() => (edge && experiment ? toConnection(edge, field, inspectedId) : null), [edge, experiment, field, inspectedId]);
  const nameOf = (id: string) => {
    const index = experiment?.tiles.findIndex((tile) => tile.instanceId === id) ?? -1;
    return index >= 0 ? experiment?.names[index] ?? id : id;
  };

  if (research) {
    return (
      <div className="hybrid-process-research">
        <button type="button" className="hybrid-generate" onClick={() => setResearch(false)}>Back to production process</button>
        <HybridAssembly view="process" />
      </div>
    );
  }

  return (
    <main className="hybrid-view hybrid-assembly">
      <Panel className="hybrid-tile major-section-frame">
        <PanelHeader mark="01" title="Generation" />
        <label>Category
          <select value={pairId} onChange={(event) => setPairId(event.target.value as FinalClusterPairId)}>
            {FINAL_CLUSTER_PAIRS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select>
        </label>
        <label>Target size
          <select value={size} onChange={(event) => setSize(Number(event.target.value))}>
            {(pair.id === "mixed" ? [3, 4, 5, 6, 7, 8] : [2, 3, 4, 5, 6, 7, 8]).map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
        </label>
        <p className="hybrid-units">Attempt {attempt}. Seed {experiment?.seed ?? "pending"}. The seed is the production FNV-1a. It is not a catalog slot.</p>
        <p className="hybrid-identity">Root</p>
        <p className="hybrid-units">{experiment?.root ? `${experiment.root.name} · quarter-turn ${experiment.root.quarterTurn * 90}°` : "The category pool supplies the root. Its only rotation is a quarter-turn about world up."}</p>
        <p className="hybrid-identity">Assigned bias</p>
        <p className="hybrid-units">{experiment?.ok ? experiment.character : "Assigned by the production slot rule when the tree is grown."} The bias is computational provenance. The realized primary and secondary characteristics classify the completed cluster.</p>
        <div className="hybrid-layout-controls">
          <button type="button" className="hybrid-generate" disabled={Boolean(busy)} onClick={() => run(false)}>{busy && !busy.startsWith("Generating") ? busy : "Grow tree"}</button>
          <button type="button" onClick={() => setAttempt((value) => value + 1)}>Next attempt</button>
        </div>
        {experiment?.ok ? (
          <>
            <p className="hybrid-units">{experiment.names.join(" · ")}</p>
            <p className="hybrid-units">Realized {experiment.realized.primary}{experiment.realized.secondary.length ? `, secondary ${experiment.realized.secondary.join(", ")}` : ""}. {experiment.elapsedMs} ms.</p>
            <p className="hybrid-units">{experiment.structure}</p>
            <p className="hybrid-units">{experiment.edges.filter((item) => item.connectorSealed).length}/{experiment.edges.length} connectors sealed. {experiment.assembly.adopted ? `Assembly film adopted, ${experiment.assembly.triangles} triangles.` : "Assembly film was not adopted."}</p>
            <p className="hybrid-units">Geometric diversity is read from the frozen catalog, not from this experiment.</p>
          </>
        ) : <p className="hybrid-units">{experiment?.reason || "Grow a tree to seat the morphologies."}</p>}
        <button type="button" onClick={() => setResearch(true)}>Research: 25-cell two-parent field</button>
      </Panel>
      <Panel className="hybrid-canvas major-section-frame">
        <PanelHeader mark="02" title="Aggregation Canvas" />
        <div className="hybrid-stage">
          <AggregationView
            instances={instances}
            selectedId={edge?.id ?? ""}
            onSelect={() => undefined}
            links={links}
            onSelectConnection={(id) => {
              setEdgeId(id);
              const next = experiment?.edges?.find((item) => item.id === id);
              setCellId(next?.selectedMockId ?? "");
            }}
            span={span}
            tone="hybrid"
            anchorIds={showFilm ? undefined : experiment?.tiles.map((tile) => tile.instanceId)}
          />
          {film ? (
            <div className="hybrid-layout-controls hybrid-stage-save">
              <button type="button" data-active={showFilm || undefined} onClick={() => setShowFilm((value) => !value)}>{showFilm ? "Seated assembly" : "Assembly film"}</button>
              <p className="hybrid-validate-badge" data-state="clear">FILM ADOPTED</p>
            </div>
          ) : null}
          <div className="hybrid-stage-keys">
            {(experiment?.edges ?? []).map((item, index) => (
              <button key={item.id} type="button" data-active={item.id === edge?.id || undefined} onClick={() => { setEdgeId(item.id); setCellId(item.selectedMockId ?? ""); }}>
                <span>Edge {index + 1}</span>
                <span>{item.faceA}–{item.faceB}</span>
                <span>{item.connectorSealed ? item.selectedMockId : "open"}</span>
              </button>
            ))}
          </div>
        </div>
      </Panel>
      <Panel className="hybrid-som major-section-frame hybrid-production-field">
        <PanelHeader mark="03" title="SOM-inspired parametric connector field" />
        <p className="hybrid-units">The field is 5 × 5. It is not a trained map and it is not an optimization. Production evaluates H08, H13, and H18. The other cells stay empty.</p>
        <button type="button" className="hybrid-generate" disabled={Boolean(busy) || !experiment?.ok} onClick={() => run(true)}>{busy.startsWith("Generating") ? busy : "Generate H08 · H13 · H18"}</button>
        {edge && field ? (
          <MockMatrix
            signature={field.connectionSignature}
            selectedId={inspectedId}
            generatedField={field}
            onSelect={(id) => setCellId(id)}
          />
        ) : <p className="hybrid-missing">Grow a tree, then choose an edge.</p>}
        {edge && field ? (
          <SomCandidateFacts
            connection={{
              id: edge.id,
              signature: field.connectionSignature,
              faceA: edge.faceA,
              faceB: edge.faceB,
              tileAId: edge.tileAId,
              tileBId: edge.tileBId,
              parentAName: nameOf(edge.tileAId),
              parentBName: nameOf(edge.tileBId),
              selectedId: inspectedId,
              generatedField: field,
            }}
          />
        ) : null}
        {edge ? <p className="hybrid-units">{edge.parentSections ? `Parent sections ${edge.parentSections.a.length} and ${edge.parentSections.b.length}.` : "Parent sections are not available for this edge."} {edge.connectorSealed ? `${edge.selectedMockId} is sealed, ${edge.triangles} triangles.` : "This edge has no sealed connector."}</p> : null}
      </Panel>
      <ProcessRow
        key={`${edge?.id ?? "none"}:${inspectedId}`}
        connection={connection}
        tiles={experiment?.tiles ?? []}
        loaded={loaded}
        syntheticMode={false}
        growth={null}
      />
    </main>
  );
}

function toConnection(edge: ExperimentEdge, field: GeneratedHybridField, inspectedId: string): TileConnection {
  const chosen = field.candidates.find((candidate) => candidate.candidateId === inspectedId);
  const hasMesh = Boolean(chosen?.geometry && chosen.geometry.triangles > 0);
  return {
    id: edge.id,
    tileAId: edge.tileAId,
    tileBId: edge.tileBId,
    faceA: edge.faceA,
    faceB: edge.faceB,
    origin: "explicit",
    generationStatus: hasMesh ? "generating" : edge.field ? "ready" : "not-generated",
    faceSelection: "user",
    inputsChanged: false,
    signature: field.connectionSignature,
    candidateField: null,
    generatedHybridField: field,
    selectedMockId: inspectedId,
    connectionKind: "hybrid",
    separation: edge.separation ?? undefined,
    validatedHybrid: unpackMesh(edge.validatedHybrid),
  };
}

function unpackField(edge: ExperimentEdge | null): GeneratedHybridField {
  const signature = edge?.field?.connectionSignature || edge?.signature || `pending:${edge?.id ?? "edge"}`;
  if (!edge?.field) {
    return {
      version: GENERATED_HYBRID_FIELD_SETTINGS.version,
      status: "empty",
      connectionSignature: signature,
      candidates: [],
      readyCount: 0,
      blockedCount: 0,
      emptyCount: 25,
      invalidCount: 0,
    };
  }
  return {
    ...edge.field,
    connectionSignature: signature,
    candidates: edge.field.candidates.map((candidate) => ({
      ...candidate,
      geometry: unpackMesh(candidate.geometry),
    })),
  };
}

function unpackMesh(packed: PackedMesh | null | undefined): IsoMesh | null {
  if (!packed || packed.triangles < 1) return null;
  const view = (value: string) => {
    const binary = atob(value);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return bytes.buffer;
  };
  return {
    triangles: packed.triangles,
    positions: new Float32Array(view(packed.positions)),
    normals: new Float32Array(view(packed.normals)),
    indices: new Uint32Array(view(packed.indices)),
  };
}
