"use client";

import { useEffect, useMemo, useState } from "react";
import { parseArchitecturalDna, type ArchitecturalDnaDocument } from "@/lib/skill5/architectural-dna";
import { PROGRAM_LABEL, SITE_ARCHETYPES, type SiteArchetype } from "@/lib/skill5/catalog";
import {
  compareDocument,
  parseClientCompatibility,
  rankForActivity,
  type ClientCompatibilityDocument,
} from "@/lib/skill5/client-compatibility";

const SHORT: Record<string, string> = {
  "public-lobby": "Lobby",
  "private-staff-lobby": "Staff Lobby",
  "architecture-design-studio": "Arch. Studio",
  "product-design-studio": "Product",
  "prototyping-fabrication-lab": "Fabrication",
  "biological-research-lab": "Cultivation",
  "interdisciplinary-collaboration-hub": "Hub",
  "public-exhibition-gallery": "Gallery",
  "indoor-public-gathering": "Commons",
  "waterfront-gathering": "Waterfront",
  "public-restaurant": "Dining",
  "staff-dining": "Staff Dining",
};

function fit(percent: number | null): "high" | "mid" | "low" | "missing" {
  if (percent === null) return "missing";
  if (percent >= 75) return "high";
  if (percent >= 50) return "mid";
  return "low";
}

export function ClientCompatibilityPanel({
  dna,
  entry,
  onInspect,
}: {
  dna: ArchitecturalDnaDocument | null;
  entry: SiteArchetype | null;
  onInspect: (archetypeId: string, activityId: string) => void;
}) {
  const [activities, setActivities] = useState<ClientCompatibilityDocument | null>(null);
  const [activityId, setActivityId] = useState("public-lobby");
  const [notice, setNotice] = useState<string | null>(null);
  const names = useMemo(() => new Map(SITE_ARCHETYPES.map((item) => [item.archetypeId, item.name])), []);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/site/client-activities", { signal: controller.signal })
      .then(async (response) => {
        const parsed = parseClientCompatibility(await response.json() as unknown);
        if (!response.ok || !parsed) throw new Error("unread");
        setActivities(parsed);
        setNotice(null);
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setNotice("The client activity record could not be read.");
      });
    return () => controller.abort();
  }, []);

  const results = useMemo(() => dna && activities ? compareDocument(dna, activities) : [], [activities, dna]);
  const groups = (["lobby", "workspace", "gathering"] as const).map((program) => {
    const rooms = activities?.activities.filter((item) => item.contexts.includes(program)) ?? [];
    const tileIds = SITE_ARCHETYPES.filter((item) => item.program === program).map((item) => item.archetypeId);
    const rankRoom = rooms.find((item) => item.id === activityId) ?? rooms[0] ?? null;
    return {
      program,
      rooms,
      ids: rankRoom ? rankForActivity(results, rankRoom.id, tileIds) : tileIds,
    };
  });
  const columnsFor = (count: number) => `minmax(8.5em, 1.15fr) repeat(${count}, minmax(0, 1fr))`;

  return (
    <div className="site-compat">
      <div className="site-compat-activities" role="listbox" aria-label="Building spaces">
        <div className="site-compat-kicker">
          <h2>Building spaces</h2>
          <p>{activities ? `${activities.occupancy.daytime} daytime · ${activities.occupancy.evening} evening · project-wide` : "Reading the studio brief."}</p>
        </div>
        <div>
          {activities?.activities.map((item) => (
            <button key={item.id} type="button" role="option" aria-selected={item.id === activityId} data-active={item.id === activityId || undefined} onClick={() => setActivityId(item.id)}>
              <span>{item.name}</span>
            </button>
          ))}
        </div>
      </div>
      {notice ? <p className="site-dna-note">{notice}</p> : null}
      <div className="site-compat-board">
        <div className="site-compat-matrix" role="grid" aria-label="Typology-specific compatibility">
          <h2>Universal DNA</h2>
          <p>Each tile is compared only with rooms of its own typology. Universal DNA and typology DNA stay separate scores.</p>
          {groups.map((group) => (
            <div className="site-compat-group" key={group.program}>
              <h3>{PROGRAM_LABEL[group.program]}</h3>
              <div>
                <div className="site-compat-row site-compat-head" role="row" style={{ gridTemplateColumns: columnsFor(group.rooms.length) }}>
                  <span role="columnheader">Tile</span>
                  {group.rooms.map((item) => (
                    <button key={item.id} type="button" role="columnheader" title={item.name} data-active={item.id === activityId || undefined} onClick={() => setActivityId(item.id)}>{SHORT[item.id] ?? item.name}</button>
                  ))}
                </div>
                {group.ids.map((id) => (
                  <div key={id} className="site-compat-row" role="row" data-active={id === entry?.archetypeId || undefined} style={{ gridTemplateColumns: columnsFor(group.rooms.length) }}>
                    <button type="button" onClick={() => onInspect(id, group.rooms.find((item) => item.id === activityId)?.id ?? group.rooms[0]?.id ?? activityId)}>{names.get(id)}</button>
                    {group.rooms.map((item) => {
                      const result = results.find((candidate) => candidate.archetypeId === id && candidate.activityId === item.id);
                      const percent = result?.applicable ? result.universalPercent : null;
                      return (
                        <button
                          key={item.id}
                          type="button"
                          role="gridcell"
                          data-fit={fit(percent)}
                          data-active={(id === entry?.archetypeId && item.id === activityId) || undefined}
                          style={percent === null ? undefined : { background: `linear-gradient(180deg, rgba(73, 215, 222, ${0.12 + percent / 160}), rgba(199, 126, 95, ${(100 - percent) / 260}))` }}
                          onClick={() => onInspect(id, item.id)}
                        >
                          {percent === null ? "—" : `${percent}%`}
                        </button>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function CompatibilityOverview({
  entry,
  onClose,
  onInspect,
}: {
  entry: SiteArchetype | null;
  onClose: () => void;
  onInspect: (archetypeId: string, activityId: string) => void;
}) {
  const [dna, setDna] = useState<ArchitecturalDnaDocument | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/site/architectural-dna", { signal: controller.signal })
      .then(async (response) => {
        const parsed = parseArchitecturalDna(await response.json() as unknown);
        if (!response.ok || !parsed) throw new Error("unread");
        setDna(parsed);
        setNotice(null);
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setNotice("The architectural DNA record could not be read.");
      });
    return () => controller.abort();
  }, []);

  return (
    <section className="site-dna" aria-label="Universal DNA overview">
      <header className="site-dna-bar">
        <button type="button" onClick={onClose}>Back to Cluster Placement</button>
        <p>Universal DNA Match · same typology</p>
      </header>
      {notice ? <p className="site-dna-note">{notice}</p> : null}
      <ClientCompatibilityPanel dna={dna} entry={entry} onInspect={onInspect} />
    </section>
  );
}
