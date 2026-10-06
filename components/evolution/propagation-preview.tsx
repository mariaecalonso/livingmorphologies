"use client";

import { useEffect, useState } from "react";

export function PropagationPreview({ archetypeId, candidateId }: { archetypeId: string; candidateId: number }) {
  const [slices, setSlices] = useState<string[] | null>(null);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    let cancel = false;
    setSlices(null);
    setNote(null);
    fetch(`/api/evolution/${archetypeId}/${candidateId}/propagation`)
      .then((response) => response.json())
      .then((body: { ready?: boolean; reason?: string; slices?: string[] }) => {
        if (cancel) return;
        if (!body.ready || !body.slices?.length) setNote(body.reason ?? "This drawing has no saved vertical state yet.");
        else setSlices(body.slices);
      })
      .catch(() => {
        if (!cancel) setNote("The preview could not be drawn.");
      });
    return () => {
      cancel = true;
    };
  }, [archetypeId, candidateId]);

  if (note) return <p className="evo-empty">{note}</p>;
  if (!slices) return <p className="evo-empty">Growing a few vertical states…</p>;
  return (
    <div className="propagation-preview" aria-label="Vertical propagation preview">
      {slices.map((src, index) => (
        <img key={index} src={src} alt={`Vertical state ${index + 1}`} />
      ))}
    </div>
  );
}
