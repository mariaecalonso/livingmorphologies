"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { InterpretationView, type Orbit, type ViewPart } from "@/components/interpretation/interpretation-view";
import { liveElements, decodeMesh, type LiveElement } from "@/lib/interpretation/decode";
import { bakePositions, boundsOf, cleanEdits, identityEdit } from "@/lib/interpretation/edits";
import { INTERPRETATION_CONTRACT, INTERPRETATION_WORKFLOW, PROPOSALS, type ElementEdit, type ElementKind, type InterpretationModel, type ProposalId } from "@/lib/interpretation/types";
import styles from "./interpretation-lab.module.css";

const STORAGE_KEY = "lm-architectural-interpretation";

const COLOR: Record<ElementKind | "original", string> = {
  mass: "#d8d8d8",
  floor: "#49d7de",
  core: "#c77e5f",
  entrance: "#9adfe3",
  opening: "#f2f2ee",
  connector: "#7eb8c4",
  column: "#b5b5b5",
  envelope: "#f4f4f4",
  original: "#ffffff",
};

const OPACITY: Record<ElementKind | "original", number> = {
  mass: 0.82,
  floor: 1,
  core: 0.95,
  entrance: 0.4,
  opening: 0.5,
  connector: 0.92,
  column: 0.9,
  envelope: 0.5,
  original: 0.34,
};

type Tool = "orbit" | "move" | "rotate" | "scale";
type EditSection = "floors" | "circulation" | "envelope" | "structure" | "transform";

const EDIT_SECTIONS: { id: EditSection; label: string }[] = [
  { id: "floors", label: "Floors & Program" },
  { id: "circulation", label: "Circulation" },
  { id: "envelope", label: "Envelope & Openings" },
  { id: "structure", label: "Structure" },
  { id: "transform", label: "Transform" },
];

function Field({ label, value, disabled, onMinus, onPlus }: { label: string; value: string; disabled?: boolean; onMinus: () => void; onPlus: () => void }) {
  return (
    <label className={styles.field}>
      <span>{label}</span>
      <span className={styles.stepper}>
        <button type="button" disabled={disabled} onClick={onMinus} aria-label={`Decrease ${label}`}>−</button>
        <b>{value}</b>
        <button type="button" disabled={disabled} onClick={onPlus} aria-label={`Increase ${label}`}>+</button>
      </span>
    </label>
  );
}
type Stored = { sourceId: string; proposal: ProposalId; edits: Record<string, ElementEdit> };

function readStored(): Stored | null {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "") as Stored;
    if (!parsed || typeof parsed.sourceId !== "string" || !PROPOSALS.some((item) => item.id === parsed.proposal)) return null;
    return { sourceId: parsed.sourceId, proposal: parsed.proposal, edits: cleanEdits(parsed.edits) };
  } catch {
    return null;
  }
}

function writeStored(value: Stored) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
}

function combine(edits: Record<string, ElementEdit>, id: string, delta: ElementEdit): Record<string, ElementEdit> {
  const current = edits[id] ?? identityEdit();
  const next: ElementEdit = {
    translation: current.translation.map((value, index) => value + delta.translation[index]) as ElementEdit["translation"],
    rotation: current.rotation.map((value, index) => value + delta.rotation[index]) as ElementEdit["rotation"],
    scale: current.scale.map((value, index) => Math.min(4, Math.max(0.2, value * delta.scale[index]))) as ElementEdit["scale"],
  };
  return { ...edits, [id]: next };
}

function applyDelta(elements: LiveElement[], id: string, delta: ElementEdit): LiveElement[] {
  return elements.map((item) => {
    if (item.id !== id) return item;
    const positions = bakePositions(item.positions, item.origin, delta);
    const fitted = boundsOf(positions);
    return {
      ...item,
      positions,
      origin: fitted.origin,
      size: fitted.size,
      elevation: item.kind === "floor" ? fitted.max[2] : item.elevation,
    };
  });
}

function encodeBytes(view: ArrayBufferView) {
  const bytes = new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
  let binary = "";
  const size = 0x2000;
  for (let index = 0; index < bytes.length; index += size) {
    binary += String.fromCharCode(...bytes.subarray(index, index + size));
  }
  return btoa(binary);
}

function delta(partial: Partial<ElementEdit>): ElementEdit {
  return {
    translation: partial.translation ?? [0, 0, 0],
    rotation: partial.rotation ?? [0, 0, 0],
    scale: partial.scale ?? [1, 1, 1],
  };
}

export function InterpretationLab() {
  const [proposal, setProposal] = useState<ProposalId>("balanced");
  const [model, setModel] = useState<InterpretationModel | null>(null);
  const [elements, setElements] = useState<LiveElement[]>([]);
  const [original, setOriginal] = useState<ViewPart | null>(null);
  const [edits, setEdits] = useState<Record<string, ElementEdit>>({});
  const [past, setPast] = useState<Record<string, ElementEdit>[]>([]);
  const [future, setFuture] = useState<Record<string, ElementEdit>[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tool, setTool] = useState<Tool>("orbit");
  const [orbit, setOrbit] = useState<Orbit | null>(null);
  const [showOriginal, setShowOriginal] = useState(false);
  const [showMass, setShowMass] = useState(true);
  const [showFloors, setShowFloors] = useState(true);
  const [showCirculation, setShowCirculation] = useState(true);
  const [showStructure, setShowStructure] = useState(true);
  const [pickShell, setPickShell] = useState(false);
  const [section, setSection] = useState<EditSection>("floors");
  const [error, setError] = useState<string | null>(null);
  const [updating, setUpdating] = useState(false);
  const [revision, setRevision] = useState(0);
  const token = useRef(0);
  const editsRef = useRef(edits);
  editsRef.current = edits;

  const applyModel = useCallback((next: InterpretationModel) => {
    setModel(next);
    setElements(liveElements(next));
    const mesh = decodeMesh(next.original);
    setOriginal({ id: "original", positions: mesh.positions, indices: mesh.indices, color: COLOR.original, opacity: OPACITY.original, selectable: false });
    setRevision((value) => value + 1);
  }, []);

  const request = useCallback(async (nextProposal: ProposalId, nextEdits: Record<string, ElementEdit>) => {
    const current = ++token.current;
    setUpdating(true);
    setError(null);
    try {
      const response = await fetch("/api/interpretation", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ proposal: nextProposal, edits: nextEdits }),
      });
      const body = await response.json() as InterpretationModel & { error?: string };
      if (current !== token.current) return;
      if (!response.ok) throw new Error(body.error ?? "The interpretation did not load.");
      applyModel(body);
      writeStored({ sourceId: body.source.id, proposal: nextProposal, edits: nextEdits });
    } catch (caught) {
      if (current !== token.current) return;
      setError(caught instanceof Error ? caught.message : "The interpretation did not load.");
    } finally {
      if (current === token.current) setUpdating(false);
    }
  }, [applyModel]);

  useEffect(() => {
    const stored = readStored();
    const nextProposal = stored?.proposal ?? "balanced";
    setProposal(nextProposal);
    void request(nextProposal, stored?.edits ?? {});
  }, [request]);

  const commit = (id: string, change: ElementEdit, record = true) => {
    const previous = editsRef.current;
    const next = combine(previous, id, change);
    if (record) {
      setPast((items) => [...items.slice(-29), previous]);
      setFuture([]);
    }
    editsRef.current = next;
    setEdits(next);
    setElements((items) => applyDelta(items, id, change));
    setRevision((value) => value + 1);
    void request(proposal, next);
  };

  const restore = (next: Record<string, ElementEdit>, history: "undo" | "redo") => {
    const previous = editsRef.current;
    if (history === "undo") {
      setPast((items) => items.slice(0, -1));
      setFuture((items) => [previous, ...items]);
    } else {
      setFuture((items) => items.slice(1));
      setPast((items) => [...items, previous]);
    }
    editsRef.current = next;
    setEdits(next);
    void request(proposal, next);
  };

  const chooseProposal = (id: ProposalId) => {
    if (id === proposal) return;
    setPast((items) => [...items.slice(-29), editsRef.current]);
    setFuture([]);
    editsRef.current = {};
    setEdits({});
    setProposal(id);
    setSelectedId(null);
    void request(id, {});
  };

  const reset = () => {
    if (Object.keys(editsRef.current).length === 0) return;
    setPast((items) => [...items.slice(-29), editsRef.current]);
    setFuture([]);
    editsRef.current = {};
    setEdits({});
    void request(proposal, {});
  };

  const selected = elements.find((item) => item.id === selectedId) ?? null;

  const partFor = (item: LiveElement, selectable: boolean): ViewPart => ({
    id: item.id,
    positions: item.positions,
    indices: item.indices,
    color: COLOR[item.kind],
    opacity: OPACITY[item.kind],
    selectable,
  });

  const visible = (item: LiveElement) => {
    if (item.kind === "mass" || item.kind === "envelope") return showMass;
    if (item.kind === "floor") return showFloors;
    if (item.kind === "column") return showStructure;
    return showCirculation;
  };

  const mainParts = useMemo(() => {
    const parts: ViewPart[] = [];
    if (showOriginal && original) parts.push(original);
    for (const item of elements) {
      if (!visible(item)) continue;
      const shell = item.kind === "mass" || item.kind === "envelope";
      parts.push(partFor(item, item.editable && (!shell || pickShell)));
    }
    return parts;
  }, [elements, original, pickShell, showCirculation, showFloors, showMass, showOriginal, showStructure]);

  const interpretedParts = useMemo(
    () => elements.filter(visible).map((item) => partFor(item, false)),
    [elements, showCirculation, showFloors, showMass, showStructure],
  );

  const floor = model ? model.source.bounds.min[2] : 0;

  const download = () => {
    if (!model) return;
    const payload = {
      contract: INTERPRETATION_CONTRACT,
      units: model.units,
      axes: model.axes,
      source: model.source,
      proposal: model.proposal,
      edits,
      limitations: model.limitations,
      elements: elements.map((item) => ({
        id: item.id,
        kind: item.kind,
        label: item.label,
        positions: encodeBytes(item.positions),
        indices: encodeBytes(item.indices),
        triangles: item.indices.length / 3,
      })),
    };
    const blob = new Blob([JSON.stringify(payload)], { type: "application/json" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `${model.source.id}-${proposal}.interpretation.json`;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  const number = (value: number) => value.toFixed(2);
  const floors = elements.filter((item) => item.kind === "floor");
  const nudge = (id: string, change: ElementEdit) => commit(id, change);

  return (
    <div className={styles.board} data-interpretation={proposal}>
      <header className={styles.head}>
        <div>
          <h1>Architectural Interpretation</h1>
          <p>{INTERPRETATION_WORKFLOW}</p>
        </div>
        <div className={styles.headTools}>
          <button type="button" aria-label="Undo" disabled={past.length === 0} onClick={() => restore(past[past.length - 1], "undo")}>↩</button>
          <button type="button" aria-label="Redo" disabled={future.length === 0} onClick={() => restore(future[0], "redo")}>↪</button>
          <button type="button" aria-label="Reset" onClick={reset}>↻</button>
          <button type="button" className={styles.export} disabled={!model || updating} onClick={download}>{updating ? "Updating" : "Export"}</button>
        </div>
      </header>

      <aside className={styles.tools} aria-label="Generation and editing">
        <section>
          <h2><i>01</i> Generate interpretation</h2>
          {PROPOSALS.map((item) => (
            <button key={item.id} type="button" className={styles.proposal} data-on={proposal === item.id ? "true" : "false"} onClick={() => chooseProposal(item.id)}>
              <span aria-hidden="true" />
              {item.label}
            </button>
          ))}
          <p className={styles.note}>{PROPOSALS.find((item) => item.id === proposal)?.summary}</p>
        </section>
        <section>
          <h2><i>02</i> Edit building</h2>
          {EDIT_SECTIONS.map((item) => (
            <div key={item.id} className={styles.editBlock} data-open={section === item.id ? "true" : "false"}>
              <button type="button" className={styles.section} data-on={section === item.id ? "true" : "false"} onClick={() => setSection(item.id)}>
                {item.label}
              </button>
              {section === item.id && item.id !== "transform" ? (
                <div className={styles.sectionBody}>
                  {section === "floors" ? (
                    <button type="button" data-on={showFloors ? "true" : "false"} onClick={() => setShowFloors((value) => !value)}>Floors</button>
                  ) : null}
                  {section === "circulation" ? (
                    <button type="button" data-on={showCirculation ? "true" : "false"} onClick={() => setShowCirculation((value) => !value)}>Circulation</button>
                  ) : null}
                  {section === "envelope" ? (
                    <>
                      <button type="button" data-on={showMass ? "true" : "false"} onClick={() => setShowMass((value) => !value)}>Wall</button>
                      <button type="button" data-on={showOriginal ? "true" : "false"} onClick={() => setShowOriginal((value) => !value)}>Original</button>
                      <button type="button" data-on={pickShell ? "true" : "false"} onClick={() => setPickShell((value) => !value)}>Shell</button>
                    </>
                  ) : null}
                  {section === "structure" ? (
                    <button type="button" data-on={showStructure ? "true" : "false"} onClick={() => setShowStructure((value) => !value)}>Columns</button>
                  ) : null}
                </div>
              ) : null}
            </div>
          ))}
        </section>
      </aside>

      <div className={styles.center}>
        <div className={styles.stage}>
          <div className={styles.toolbar} role="toolbar" aria-label="View tools">
            {(["orbit", "move", "rotate", "scale"] as Tool[]).map((mode) => (
              <button key={mode} type="button" data-on={tool === mode ? "true" : "false"} onClick={() => setTool(mode)} aria-label={mode}>{mode === "orbit" ? "Orbit" : mode === "move" ? "Move" : mode === "rotate" ? "Rotate" : "Scale"}</button>
            ))}
          </div>
          {error ? <p className={styles.wait}>{error}</p> : mainParts.length === 0 ? <p className={styles.wait}>{updating ? "Reading the final cluster" : "No interpretation"}</p> : (
            <InterpretationView
              parts={mainParts}
              selectedId={selectedId}
              tool={tool}
              orbit={orbit}
              interactive
              floorPlane={floor}
              revision={revision}
              onSelect={setSelectedId}
              onOrbit={setOrbit}
              onCommit={(id, change) => commit(id, change)}
            />
          )}
        </div>
        <div className={styles.compare}>
          <div className={styles.pane} data-kind="original">
            <span>Original cluster</span>
            {original ? <InterpretationView parts={[original]} selectedId={null} tool="orbit" orbit={orbit} interactive={false} floorPlane={floor} revision={revision} /> : null}
          </div>
          <div className={styles.pane} data-kind="interpreted">
            <span>Interpreted building</span>
            {interpretedParts.length > 0 ? <InterpretationView parts={interpretedParts} selectedId={selectedId} tool="orbit" orbit={orbit} interactive={false} floorPlane={floor} revision={revision} /> : null}
          </div>
        </div>
      </div>

      <aside className={styles.info} aria-label="Building information">
        <section>
          <h2>Building summary</h2>
          <dl>
            <div><dt>Source</dt><dd>{model?.source.id ?? "—"}</dd></div>
            <div><dt>Tiles</dt><dd>{model ? model.source.tiles : "—"}</dd></div>
            <div><dt>Volume</dt><dd>{model ? number(model.source.volume) : "—"}</dd></div>
            <div><dt>Organizing box</dt><dd>{model ? `${number(model.source.bounds.max[0] - model.source.bounds.min[0])} × ${number(model.source.bounds.max[1] - model.source.bounds.min[1])} × ${number(model.source.bounds.max[2] - model.source.bounds.min[2])}` : "—"}</dd></div>
            <div><dt>Inserted floors</dt><dd>{floors.length}</dd></div>
          </dl>
        </section>
        <section>
          <h2>Selected element</h2>
          <select value={selectedId ?? ""} onChange={(event) => setSelectedId(event.target.value || null)} aria-label="Selected element">
            <option value="">None</option>
            {elements.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select>
          {selected?.kind === "floor" ? (
            <>
              <Field label="Elevation" value={number(selected.elevation ?? selected.origin[2])} onMinus={() => nudge(selected.id, delta({ translation: [0, 0, -0.5] }))} onPlus={() => nudge(selected.id, delta({ translation: [0, 0, 0.5] }))} />
              <Field label="Plate X" value={number(selected.size[0])} onMinus={() => nudge(selected.id, delta({ scale: [0.92, 1, 1] }))} onPlus={() => nudge(selected.id, delta({ scale: [1.08, 1, 1] }))} />
              <Field label="Plate Y" value={number(selected.size[1])} onMinus={() => nudge(selected.id, delta({ scale: [1, 0.92, 1] }))} onPlus={() => nudge(selected.id, delta({ scale: [1, 1.08, 1] }))} />
              <Field label="Thickness" value={number(selected.size[2])} onMinus={() => nudge(selected.id, delta({ scale: [1, 1, 0.88] }))} onPlus={() => nudge(selected.id, delta({ scale: [1, 1, 1.12] }))} />
            </>
          ) : selected ? (
            <>
              <Field label="X" value={number(selected.origin[0])} onMinus={() => nudge(selected.id, delta({ translation: [-0.5, 0, 0] }))} onPlus={() => nudge(selected.id, delta({ translation: [0.5, 0, 0] }))} />
              <Field label="Y" value={number(selected.origin[1])} onMinus={() => nudge(selected.id, delta({ translation: [0, -0.5, 0] }))} onPlus={() => nudge(selected.id, delta({ translation: [0, 0.5, 0] }))} />
              <Field label="Z" value={number(selected.origin[2])} onMinus={() => nudge(selected.id, delta({ translation: [0, 0, -0.5] }))} onPlus={() => nudge(selected.id, delta({ translation: [0, 0, 0.5] }))} />
              <Field label="Yaw" value="±15°" onMinus={() => nudge(selected.id, delta({ rotation: [0, 0, -15] }))} onPlus={() => nudge(selected.id, delta({ rotation: [0, 0, 15] }))} />
              <Field label="Scale" value={`${number(selected.size[0])} × ${number(selected.size[1])}`} onMinus={() => nudge(selected.id, delta({ scale: [0.92, 0.92, 1] }))} onPlus={() => nudge(selected.id, delta({ scale: [1.08, 1.08, 1] }))} />
            </>
          ) : <p className={styles.note}>Select an element in the view or the list.</p>}
        </section>
        <div className={styles.notice}>
          <p>The refined cluster is the exterior wall. The bounding box is the organizing volume. Boolean carving defines the interior, and the floor plates are inserted slabs.</p>
          <p>No real-world scale is established. Values are Skill 6 units.</p>
          <p>Columns are preliminary solids inside the bounding box, not a structural analysis.</p>
        </div>
      </aside>
    </div>
  );
}
