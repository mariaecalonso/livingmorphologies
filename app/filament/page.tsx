"use client";

import { useEffect, useState } from "react";

type FilamentCalibration = { white: number; black: number; organic: number; thickness: number };

type FilamentArchetypeStatus = {
  archetypeId: string;
  name: string;
  hasRun: boolean;
  sampleIds: number[];
  calibration: FilamentCalibration;
  saved: boolean;
};

type StatusResponse = { archetypes: FilamentArchetypeStatus[] };

export default function FilamentCalibrationPage() {
  const [archetypes, setArchetypes] = useState<FilamentArchetypeStatus[]>([]);
  const [archetypeId, setArchetypeId] = useState("");
  const [draft, setDraft] = useState<FilamentCalibration | null>(null);
  const [shown, setShown] = useState<FilamentCalibration | null>(null);
  const [savedNote, setSavedNote] = useState("");

  useEffect(() => {
    void fetch("/api/filament", { cache: "no-store" })
      .then((response) => response.json())
      .then((body: StatusResponse) => {
        setArchetypes(body.archetypes);
        const requested = new URLSearchParams(window.location.search).get("archetype");
        const first =
          body.archetypes.find((item) => item.archetypeId === requested) ??
          body.archetypes.find((item) => item.hasRun) ??
          body.archetypes[0];
        if (!first) return;
        setArchetypeId(first.archetypeId);
        setDraft(first.calibration);
        setShown(first.calibration);
      });
  }, []);

  useEffect(() => {
    if (!draft) return;
    const timer = window.setTimeout(() => setShown(draft), 160);
    return () => window.clearTimeout(timer);
  }, [draft]);

  const current = archetypes.find((item) => item.archetypeId === archetypeId);

  const choose = (id: string) => {
    const next = archetypes.find((item) => item.archetypeId === id);
    if (!next) return;
    setArchetypeId(id);
    setDraft(next.calibration);
    setShown(next.calibration);
    setSavedNote("");
  };

  const save = async () => {
    if (!draft || !archetypeId) return;
    const response = await fetch(`/api/filament/${archetypeId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(draft),
    });
    if (!response.ok) {
      setSavedNote("The calibration was not saved.");
      return;
    }
    const body = (await response.json()) as { calibration: FilamentCalibration };
    setArchetypes((items) =>
      items.map((item) => (item.archetypeId === archetypeId ? { ...item, calibration: body.calibration, saved: true } : item)),
    );
    setSavedNote("Saved. The catalog uses this ink.");
  };

  const query = shown
    ? `white=${shown.white.toFixed(3)}&black=${shown.black.toFixed(3)}&organic=${shown.organic.toFixed(3)}&thickness=${shown.thickness.toFixed(3)}`
    : "";

  return (
    <main className="filament-page">
      <header>
        <p className="filament-kicker">Filament calibration</p>
        <h1>Ink after the run</h1>
        <p>
          Set the black ground, the white hair, how far a corner turns, and how thick the stroke is. The catalog uses the saved setting for every
          iteration of that archetype. This page is not in the workflow navigation.
        </p>
      </header>
      {current && draft ? (
        <div className="filament-layout">
          <section className="filament-controls">
            <label>
              Archetype
              <select value={archetypeId} onChange={(event) => choose(event.target.value)}>
                {archetypes.map((item) => (
                  <option key={item.archetypeId} value={item.archetypeId}>
                    {item.name}
                    {item.hasRun ? "" : " — no run yet"}
                  </option>
                ))}
              </select>
            </label>
            <Slider label="White" hint="Brightness of the hair" value={draft.white} onChange={(white) => setDraft({ ...draft, white })} />
            <Slider label="Black" hint="Faint deposits return to the ground" value={draft.black} onChange={(black) => setDraft({ ...draft, black })} />
            <Slider label="Organic" hint="How far the line bends into a turn" value={draft.organic} onChange={(organic) => setDraft({ ...draft, organic })} />
            <Slider label="Thickness" hint="Width of the stroke, apart from the bend" value={draft.thickness} onChange={(thickness) => setDraft({ ...draft, thickness })} />
            <button type="button" onClick={() => void save()}>
              Save for this archetype
            </button>
            {savedNote ? <p className="filament-note">{savedNote}</p> : null}
            {current.saved ? <p className="filament-note">A calibration file is already saved.</p> : null}
          </section>
          {current.hasRun && shown ? (
            <section className="filament-grid" aria-label={`${current.name} sample drawings`}>
              {current.sampleIds.map((id) => (
                <figure key={id}>
                  {/* The query is the calibration being judged, so a slider change loads a new drawing. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={`/api/filament/${current.archetypeId}/${id}?${query}`} alt={`${current.name} iteration ${id}`} />
                  <figcaption>Iteration {id}</figcaption>
                </figure>
              ))}
            </section>
          ) : (
            <p className="filament-waiting">
              {current.name} has no finished run yet. Save the ink now, or wait until the run writes its drawings and then adjust them here.
            </p>
          )}
        </div>
      ) : (
        <p className="filament-waiting">Loading archetypes.</p>
      )}
      <style>{`
        .filament-page { min-height: 100vh; background: #000; color: #f2f2ee; padding: 28px 32px 48px; font-family: Helvetica, Arial, sans-serif; }
        .filament-kicker { margin: 0 0 8px; letter-spacing: 0.14em; text-transform: uppercase; font-size: 11px; color: #7db8b8; }
        h1 { margin: 0 0 8px; font-family: var(--font-orbitron), Helvetica, sans-serif; font-size: 22px; font-weight: 500; }
        header p { max-width: 68ch; color: #9b9b98; margin: 0; }
        .filament-layout { display: grid; grid-template-columns: 280px 1fr; gap: 28px; margin-top: 28px; align-items: start; }
        .filament-controls { display: flex; flex-direction: column; gap: 16px; }
        label { display: flex; flex-direction: column; gap: 6px; font-size: 13px; }
        select, button { background: #111; color: #f2f2ee; border: 1px solid rgba(242,242,238,0.28); padding: 8px 10px; font: inherit; }
        button { cursor: pointer; }
        input[type="range"] { width: 100%; accent-color: #0f7377; }
        .filament-hint { color: #9b9b98; font-size: 12px; }
        .filament-note, .filament-waiting { color: #9b9b98; }
        .filament-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px; }
        figure { margin: 0; }
        img { width: 100%; aspect-ratio: 1; object-fit: contain; background: #000; display: block; }
        figcaption { margin-top: 6px; color: #9b9b98; font-size: 12px; }
        @media (max-width: 900px) {
          .filament-layout, .filament-grid { grid-template-columns: 1fr; }
        }
      `}</style>
    </main>
  );
}

function Slider({
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
        {label} <strong>{value.toFixed(2)}</strong>
      </span>
      <input type="range" min={0} max={1} step={0.01} value={value} onChange={(event) => onChange(Number(event.target.value))} />
      <span className="filament-hint">{hint}</span>
    </label>
  );
}
