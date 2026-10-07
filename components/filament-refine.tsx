"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { HAIR_CAP, HAIR_DECAY, HAIR_DEPOSIT, HAIR_WIDTH } from "@/lib/skill1/hair-ink";
import { filamentField, toneFilament, type FilamentCalibration } from "@/lib/skill2/filament-draw";

type Calibration = FilamentCalibration;

type Plate = {
  id: string;
  pixels: Uint8Array;
  size: number;
  scale: number;
};

type ArchetypeStatus = {
  archetypeId: string;
  name: string;
  hasRun: boolean;
  sampleIds: number[];
  calibration: Calibration;
  saved: boolean;
};

const HAIR = [
  ["Width", HAIR_WIDTH],
  ["Cap", HAIR_CAP],
  ["Deposit", HAIR_DEPOSIT],
  ["Decay", HAIR_DECAY],
] as const;

export function FilamentRefine({
  archetypeId,
  archetypeName,
  sampleIds = [],
  onSaved,
}: {
  archetypeId: string;
  archetypeName?: string;
  sampleIds?: string[];
  onSaved?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<ArchetypeStatus | null>(null);
  const [draft, setDraft] = useState<Calibration | null>(null);
  const [plates, setPlates] = useState<Plate[]>([]);
  const [note, setNote] = useState("");
  const canvasRefs = useRef<(HTMLCanvasElement | null)[]>([]);
  const fields = useRef(new Map<string, { key: string; field: Float32Array }>());

  useEffect(() => {
    setOpen(false);
    setStatus(null);
    setDraft(null);
    setPlates([]);
    setNote("");
    fields.current.clear();
  }, [archetypeId]);

  useEffect(() => {
    if (!open || !draft || plates.length === 0) return;
    const frame = window.requestAnimationFrame(() => {
      const key = `${draft.thickness.toFixed(2)}|${draft.organic.toFixed(2)}`;
      plates.forEach((plate, index) => {
        const canvas = canvasRefs.current[index];
        const ctx = canvas?.getContext("2d");
        if (!canvas || !ctx) return;
        let cached = fields.current.get(plate.id);
        if (!cached || cached.key !== key) {
          cached = { key, field: filamentField(plate.pixels, draft, plate.scale) };
          fields.current.set(plate.id, cached);
        }
        const out = toneFilament(cached.field, draft, plate.scale);
        const image = ctx.createImageData(plate.size, plate.size);
        const data = image.data;
        for (let pixel = 0; pixel < out.length; pixel += 1) {
          const offset = pixel * 4;
          const value = out[pixel];
          data[offset] = value;
          data[offset + 1] = value;
          data[offset + 2] = value;
          data[offset + 3] = 255;
        }
        ctx.putImageData(image, 0, 0);
      });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [open, draft, plates]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const openPanel = () => {
    setOpen(true);
    setNote("");
    void fetch("/api/filament", { cache: "no-store" })
      .then((response) => response.json())
      .then((body: { archetypes: ArchetypeStatus[] }) => {
        const match = body.archetypes.find((item) => item.archetypeId === archetypeId) ?? null;
        setStatus(match);
        setDraft(match?.calibration ?? null);
      })
      .catch(() => setNote("The drawing settings could not be loaded."));
  };

  const save = async () => {
    if (!draft) return;
    const response = await fetch(`/api/filament/${archetypeId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(draft),
    });
    if (!response.ok) {
      setNote("The calibration was not saved.");
      return;
    }
    const body = (await response.json()) as { calibration: Calibration };
    setDraft(body.calibration);
    setStatus((current) => (current ? { ...current, calibration: body.calibration, saved: true } : current));
    setNote("Saved. The catalogue uses this ink.");
    onSaved?.();
  };

  const name = archetypeName || status?.name || archetypeId;
  const drawingKey = useMemo(() => (sampleIds.length ? sampleIds.slice(0, 3) : (status?.sampleIds ?? []).slice(0, 3).map(String)).join(","), [sampleIds, status]);

  useEffect(() => {
    if (!open || !drawingKey) {
      setPlates([]);
      return;
    }
    let cancel = false;
    const ids = drawingKey.split(",");
    void Promise.all(
      ids.map(async (id) => {
        const response = await fetch(`/api/filament/plate/${archetypeId}/${id}`, { cache: "no-store" });
        if (!response.ok) return null;
        const full = Number(response.headers.get("X-Filament-Full")) || 1280;
        const bitmap = await createImageBitmap(await response.blob());
        const size = bitmap.width;
        const scratch = document.createElement("canvas");
        scratch.width = size;
        scratch.height = size;
        const ctx = scratch.getContext("2d", { willReadFrequently: true });
        if (!ctx || !size) return null;
        ctx.drawImage(bitmap, 0, 0);
        const data = ctx.getImageData(0, 0, size, size).data;
        const pixels = new Uint8Array(size * size);
        for (let pixel = 0; pixel < pixels.length; pixel += 1) pixels[pixel] = data[pixel * 4];
        bitmap.close();
        return { id, pixels, size, scale: size / full };
      }),
    ).then((loaded) => {
      if (cancel) return;
      fields.current.clear();
      setPlates(loaded.filter((plate): plate is Plate => plate !== null));
    });
    return () => {
      cancel = true;
    };
  }, [open, archetypeId, drawingKey]);

  return (
    <span className="filament-refine">
      <button
        type="button"
        className="filament-refine-mark"
        aria-label={`Refine the drawing for ${name}`}
        aria-expanded={open}
        onClick={() => (open ? setOpen(false) : openPanel())}
      >
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <path d="M2 12.5c2.2-4.2 3.2-6.2 5.2-6.2 1.6 0 2.1 2.4 3.6 2.4 1.2 0 2-.8 3.2-2.7" />
          <path d="M2.4 9.2c1.8-2.2 3-3.2 4.6-3.2 1.3 0 1.8 1.5 3.1 1.5" />
        </svg>
      </button>
      {open
        ? createPortal(
            <div className="filament-refine-veil" onClick={() => setOpen(false)}>
              <div
                className="filament-refine-window"
                role="dialog"
                aria-modal="true"
                aria-label={`Filament drawing for ${name}`}
                onClick={(event) => event.stopPropagation()}
              >
                <header className="filament-refine-head">
                  <div>
                    <p className="filament-refine-kicker">Filament</p>
                    <p className="filament-refine-title">{name}</p>
                  </div>
                  <button type="button" className="filament-refine-close" onClick={() => setOpen(false)} aria-label="Close filament window">
                    Close
                  </button>
                </header>
                <div className="filament-refine-body">
                  <div className="filament-refine-controls">
                    <p className="filament-refine-copy">
                      The archetype places the body. The pen is a hair, fixed in the run and shared by every catalogue. These three drawings follow the sliders. Save applies that ink to the whole catalogue.
                    </p>
                    <ul className="filament-refine-hair">
                      <li className="filament-refine-pen">Pen</li>
                      {HAIR.map(([label, value]) => (
                        <li key={label}>
                          <span>{label}</span>
                          <span>{value}</span>
                        </li>
                      ))}
                    </ul>
                    {draft ? (
                      <>
                        <RefineSlider label="White" hint="Lifts the hair toward white" value={draft.white} onChange={(white) => setDraft({ ...draft, white })} />
                        <RefineSlider label="Black" hint="How much faint trail stays" value={draft.black} onChange={(black) => setDraft({ ...draft, black })} />
                        <RefineSlider label="Organic" hint="Bends a corner into a turn" value={draft.organic} onChange={(organic) => setDraft({ ...draft, organic })} />
                        <RefineSlider label="Thickness" hint="Widens the stroke" value={draft.thickness} onChange={(thickness) => setDraft({ ...draft, thickness })} />
                        <button type="button" className="filament-refine-save" onClick={() => void save()}>
                          Save for this archetype
                        </button>
                      </>
                    ) : (
                      <p className="filament-refine-copy">{note || "Loading this archetype."}</p>
                    )}
                    {note ? <p className="filament-refine-copy">{note}</p> : null}
                  </div>
                    {plates.length ? (
                      <div className="filament-refine-samples">
                        {plates.map((plate, index) => (
                          <canvas
                            key={plate.id}
                            ref={(node) => {
                              canvasRefs.current[index] = node;
                            }}
                            width={plate.size}
                            height={plate.size}
                          />
                        ))}
                      </div>
                    ) : (
                      <p className="filament-refine-copy">{drawingKey ? "Loading these drawings." : ""}</p>
                    )}
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
      <style>{`
        .filament-refine { position: relative; display: inline-flex; align-items: center; }
        .filament-refine-mark {
          width: 22px;
          height: 22px;
          padding: 3px;
          border: 0;
          background: transparent;
          color: var(--text, #f2f2ee);
          opacity: 0.22;
          cursor: pointer;
        }
        .filament-refine-mark svg { display: block; width: 100%; height: 100%; }
        .filament-refine-mark path { fill: none; stroke: currentColor; stroke-width: 0.8; }
        .filament-refine-mark:hover,
        .filament-refine-mark:focus-visible,
        .filament-refine-mark[aria-expanded="true"] { opacity: 0.92; outline: none; }
        .filament-refine-veil {
          position: fixed;
          inset: 0;
          z-index: 90;
          display: grid;
          place-items: center;
          padding: 28px;
          background: rgba(0, 0, 0, 0.72);
        }
        .filament-refine-window {
          width: min(96vw, 1680px);
          height: min(92vh, 980px);
          display: flex;
          flex-direction: column;
          padding: 18px 20px 16px;
          background: rgba(0, 0, 0, 0.96);
          border: 1px solid rgba(242, 242, 238, 0.18);
          color: var(--text, #f2f2ee);
        }
        .filament-refine-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; margin-bottom: 12px; }
        .filament-refine-kicker {
          margin: 0;
          font-size: 0.5rem;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          color: var(--muted, #9b9b98);
        }
        .filament-refine-title {
          margin: 4px 0 0;
          font-size: 0.78rem;
          letter-spacing: 0.12em;
          text-transform: uppercase;
        }
        .filament-refine-close {
          border: 1px solid rgba(242, 242, 238, 0.2);
          background: transparent;
          color: inherit;
          font: inherit;
          font-size: 0.58rem;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          padding: 6px 10px;
          cursor: pointer;
        }
        .filament-refine-body {
          flex: 1;
          min-height: 0;
          display: flex;
          flex-direction: column;
          gap: 14px;
        }
        .filament-refine-controls {
          display: grid;
          grid-template-columns: minmax(180px, 1.3fr) repeat(4, minmax(0, 1fr)) auto;
          gap: 8px 16px;
          align-items: end;
        }
        .filament-refine-copy { margin: 0; color: var(--muted, #9b9b98); font-size: 0.68rem; line-height: 1.45; grid-column: 1 / -1; }
        .filament-refine-hair { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: 4px 14px; grid-column: 1 / -1; }
        .filament-refine-hair li { display: flex; gap: 8px; font-size: 0.62rem; letter-spacing: 0.08em; text-transform: uppercase; color: var(--muted, #9b9b98); }
        .filament-refine-pen { color: var(--text, #f2f2ee); }
        .filament-refine-hint { color: var(--muted, #9b9b98); font-size: 0.58rem; letter-spacing: 0.02em; line-height: 1.3; text-transform: none; }
        .filament-refine-controls label { display: flex; flex-direction: column; gap: 4px; margin: 0; font-size: 0.68rem; }
        .filament-refine-controls input[type="range"] { width: 100%; accent-color: #0f7377; }
        .filament-refine-save {
          border: 1px solid rgba(242, 242, 238, 0.2);
          background: transparent;
          color: inherit;
          font: inherit;
          font-size: 0.62rem;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          padding: 8px 12px;
          cursor: pointer;
          white-space: nowrap;
        }
        .filament-refine-samples {
          flex: 1;
          min-height: 0;
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 16px;
          align-content: center;
          justify-items: center;
        }
        .filament-refine-samples img,
        .filament-refine-samples canvas {
          width: min(100%, 42vh);
          aspect-ratio: 1;
          object-fit: contain;
          background: #000;
        }
        @media (max-width: 860px) {
          .filament-refine-window { height: min(94vh, 980px); }
          .filament-refine-controls { grid-template-columns: 1fr 1fr; }
          .filament-refine-save { grid-column: 1 / -1; }
          .filament-refine-samples img,
          .filament-refine-samples canvas { width: min(100%, 28vh); }
        }
      `}</style>
    </span>
  );
}

function RefineSlider({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <label>
      <span>
        {label} {value.toFixed(2)}
      </span>
      <input type="range" min={0} max={1} step={0.01} value={value} onChange={(event) => onChange(Number(event.target.value))} />
      <span className="filament-refine-hint">{hint}</span>
    </label>
  );
}
