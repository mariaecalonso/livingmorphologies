"use client";

import { useEffect, useState } from "react";
import { DEFAULT_FILAMENT } from "@/lib/skill2/filament-draw";

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
      .then((body: StatusResponse & { shared?: FilamentCalibration }) => {
        setArchetypes(body.archetypes);
        const requested = new URLSearchParams(window.location.search).get("archetype");
        const first =
          body.archetypes.find((item) => item.archetypeId === requested) ??
          body.archetypes.find((item) => item.hasRun) ??
          body.archetypes[0];
        if (!first) return;
        const ink = {
          ...DEFAULT_FILAMENT,
          ...first.calibration,
        };
        setDraft(ink);
        setShown(ink);
        setArchetypeId(first.archetypeId);
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
    setDraft({ ...DEFAULT_FILAMENT, ...next.calibration });
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
    setSavedNote("Saved. Every catalogue uses this ink.");
  };

  const query = shown
    ? `white=${shown.white.toFixed(3)}&black=${shown.black.toFixed(3)}&organic=${shown.organic.toFixed(3)}&thickness=${shown.thickness.toFixed(3)}`
    : "";

  return (
    <main className="filament-page">
      <header className="filament-heading">
        <p className="eyebrow">Filament</p>
        <h1 className="display">Ink after the run</h1>
        <p>One ink for every catalogue. White lifts the hair. Black decides how much faint trail stays. Thickness and organic stay with the pen.</p>
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
            <p className="filament-note">Thickness {draft.thickness.toFixed(2)} and organic {draft.organic.toFixed(2)} stay with this archetype.</p>
            <button type="button" onClick={() => void save()}>
              Save for every catalogue
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
