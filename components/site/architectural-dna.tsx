"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  applicableCriteria,
  criteriaMatrix,
  parseArchitecturalDna,
  ratingLabel,
  withRating,
  type ArchitecturalDnaDocument,
  type DnaScore,
} from "@/lib/skill5/architectural-dna";
import { TileCompatibility } from "@/components/site/tile-compatibility";
import type { SiteArchetype } from "@/lib/skill5/catalog";
import { PROGRAM_LABEL } from "@/lib/skill5/catalog";
import type { Rating } from "@/lib/types";

const RADAR_CENTER = { x: 170, y: 168 };
const RADAR_RADIUS = 78;

function radarPoints(values: readonly number[], scale: number) {
  const count = values.length;
  return values.map((value, index) => {
    const angle = -Math.PI / 2 + (index / count) * Math.PI * 2;
    const radius = RADAR_RADIUS * scale * (value / 2);
    return `${RADAR_CENTER.x + Math.cos(angle) * radius},${RADAR_CENTER.y + Math.sin(angle) * radius}`;
  }).join(" ");
}

function Radar({ ratings, activeId, labels }: { ratings: readonly DnaScore[]; activeId: string; labels: ReadonlyMap<string, string> }) {
  const count = ratings.length;
  return (
    <svg className="site-dna-radar" viewBox="0 0 340 336" role="img" aria-label="Architectural DNA radar">
      <defs>
        <filter id="site-dna-radar-glow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="2.4" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      {[0.34, 0.67, 1].map((scale) => (
        <polygon key={scale} points={radarPoints(ratings.map(() => 2), scale)} />
      ))}
      {ratings.map((score, index) => {
        const angle = -Math.PI / 2 + (index / count) * Math.PI * 2;
        const x = RADAR_CENTER.x + Math.cos(angle) * RADAR_RADIUS;
        const y = RADAR_CENTER.y + Math.sin(angle) * RADAR_RADIUS;
        const labelX = RADAR_CENTER.x + Math.cos(angle) * (RADAR_RADIUS + 36);
        const labelY = RADAR_CENTER.y + Math.sin(angle) * (RADAR_RADIUS + 36);
        const words = [(labels.get(score.criterionId) ?? "").split(" ")[0] ?? ""];
        return (
          <g key={score.criterionId}>
            <line x1={RADAR_CENTER.x} y1={RADAR_CENTER.y} x2={x} y2={y} data-active={score.criterionId === activeId || undefined} />
            <text x={labelX} y={labelY} textAnchor="middle" dominantBaseline="middle" data-active={score.criterionId === activeId || undefined}>
              {words.map((word, wordIndex) => (
                <tspan key={word} x={labelX} dy={wordIndex === 0 ? (words.length - 1) * -5.5 : 11}>{word}</tspan>
              ))}
            </text>
          </g>
        );
      })}
      <polygon className="site-dna-radar-value" filter="url(#site-dna-radar-glow)" points={radarPoints(ratings.map((score) => score.value), 1)} />
    </svg>
  );
}

export function ArchitecturalDna({
  entry,
  preview,
  studies,
  thumb,
  activityId,
  onActivity,
  onClose,
  onOpenOverview,
}: {
  entry: SiteArchetype;
  preview: ReactNode;
  studies?: ReactNode;
  thumb?: ReactNode;
  activityId: string;
  onActivity: (activityId: string) => void;
  onClose: () => void;
  onOpenOverview: () => void;
}) {
  const [document, setDocument] = useState<ArchitecturalDnaDocument | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const program = entry.program === "lobby" || entry.program === "workspace" || entry.program === "gathering" ? entry.program : null;
  const applicable = useMemo(() => program ? applicableCriteria(program) : [], [program]);
  const profile = document?.profiles.find((item) => item.archetypeId === entry.archetypeId) ?? null;
  const active = profile?.ratings.find((score) => score.criterionId === (activeId ?? profile.ratings[0]?.criterionId)) ?? null;
  const manual = profile?.ratings.some((score) => score.basis === "manual") ?? false;

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/site/architectural-dna", { signal: controller.signal })
      .then(async (response) => {
        const body = await response.json() as unknown;
        const parsed = parseArchitecturalDna(body);
        if (!response.ok || !parsed) throw new Error("unread");
        setDocument(parsed);
        setNotice(null);
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setNotice("The architectural DNA record could not be read.");
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    setActiveId(applicable[0]?.id ?? null);
  }, [entry.archetypeId, applicable]);

  async function save(next: ArchitecturalDnaDocument) {
    setDocument(next);
    setNotice(null);
    try {
      const response = await fetch("/api/site/architectural-dna", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(next),
      });
      const body = parseArchitecturalDna(await response.json() as unknown);
      if (!response.ok || !body) throw new Error("unwritten");
      setDocument(body);
    } catch {
      setNotice("The rating could not be saved.");
    }
  }

  function choose(criterionId: string, value: Rating) {
    if (!document) return;
    void save(withRating(document, entry.archetypeId, criterionId, value));
  }

  function restore() {
    if (!document || !profile) return;
    let next = document;
    for (const score of profile.ratings) {
      if (score.value !== score.analyzed.value) next = withRating(next, entry.archetypeId, score.criterionId, score.analyzed.value);
    }
    void save(next);
  }

  const labels = new Map(applicable.map((item) => [item.id, item.label]));
  return (
    <section className="site-dna" aria-label="Architectural DNA">
      <svg className="site-dna-flow" viewBox="0 0 1600 900" preserveAspectRatio="none" aria-hidden="true">
        <defs>
          <filter id="site-dna-vein" x="-8%" y="-120%" width="116%" height="340%">
            <feGaussianBlur stdDeviation="5" />
          </filter>
        </defs>
        <g filter="url(#site-dna-vein)" fill="none" strokeLinecap="round" opacity="0.95">
          <path stroke="#5d7c79" strokeWidth="16" d="M-60 -6 C 180 -18, 360 8, 560 -8 S 820 -20, 1040 4 S 1320 -10, 1680 -2" />
          <path stroke="#a07a68" strokeWidth="16" d="M 860 -16 C 1080 6, 1280 -18, 1480 4 S 1620 -8, 1760 -2" />
          <path stroke="#5d7c79" strokeWidth="16" d="M-60 906 C 220 888, 460 918, 700 900 S 980 884, 1240 916 S 1500 892, 1760 908" />
          <path stroke="#a07a68" strokeWidth="16" d="M 520 918 C 760 894, 1020 922, 1280 896 S 1560 878, 1780 910" />
        </g>
        <g fill="none" strokeLinecap="round">
          <path stroke="#8aa09d" strokeWidth="2.6" d="M-60 -6 C 180 -18, 360 8, 560 -8 S 820 -20, 1040 4 S 1320 -10, 1680 -2" />
          <path stroke="#c4a496" strokeWidth="2.6" d="M 860 -16 C 1080 6, 1280 -18, 1480 4 S 1620 -8, 1760 -2" />
          <path stroke="#8aa09d" strokeWidth="2.6" d="M-60 906 C 220 888, 460 918, 700 900 S 980 884, 1240 916 S 1500 892, 1760 908" />
          <path stroke="#c4a496" strokeWidth="2.6" d="M 520 918 C 760 894, 1020 922, 1280 896 S 1560 878, 1780 910" />
          <circle cx="560" cy="0" r="3.2" fill="#5d7c79" stroke="none" />
          <circle cx="1480" cy="4" r="3.2" fill="#a07a68" stroke="none" />
          <circle cx="700" cy="900" r="3.2" fill="#5d7c79" stroke="none" />
          <circle cx="1280" cy="896" r="3.2" fill="#a07a68" stroke="none" />
        </g>
      </svg>
      <header className="site-dna-bar">
        <button type="button" onClick={onClose}>Back to Tile Placement</button>
        <button type="button" onClick={onOpenOverview}>All tiles</button>
        <p>Architectural DNA × Client compatibility</p>
      </header>
      {notice ? <p className="site-dna-note">{notice}</p> : null}
      <div className="site-dna-body">
        <div className="site-dna-stage">
          <div className="site-dna-panel site-dna-preview">
            <p className="site-dna-kicker">Selected tile</p>
            <div className="site-dna-identity">
              <strong>{entry.name}</strong>
              <p>{program ? `${PROGRAM_LABEL[program]} archetype` : "Unassigned"}</p>
            </div>
            <div className="site-dna-mesh">{preview}</div>
            {studies ? <div className="site-dna-studies">{studies}</div> : null}
          </div>
          {profile ? (
            <div className="site-dna-panel site-dna-rating">
              <h2>Architectural DNA (rating)</h2>
              {manual ? <button type="button" className="site-dna-restore" onClick={restore}>Restore the mesh reading</button> : null}
              <div className="site-dna-rating-body">
                <Radar ratings={profile.ratings} activeId={active?.criterionId ?? ""} labels={labels} />
                <div className="site-dna-scores">
                  {criteriaMatrix().map((group) => {
                    const items = group.criteria.filter((item) => applicable.some((criterion) => criterion.id === item.id));
                    if (items.length === 0) return null;
                    return (
                      <section key={group.id} data-group={group.id}>
                        <h3>{group.title}</h3>
                        <div>
                          {items.map((item) => {
                            const score = profile.ratings.find((rating) => rating.criterionId === item.id);
                            if (!score) return null;
                            return (
                              <button key={item.id} type="button" data-active={score.criterionId === active?.criterionId || undefined} data-basis={score.basis} onClick={() => setActiveId(item.id)}>
                                <b>{item.label}</b>
                                <i aria-hidden="true"><em style={{ width: `${(score.value / 2) * 100}%` }} /></i>
                                <span>{ratingLabel(score.value)}</span>
                              </button>
                            );
                          })}
                        </div>
                      </section>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : <p className="site-dna-note">Reading the tile evaluation.</p>}
        </div>
        <TileCompatibility
          dna={document}
          entry={entry}
          activityId={activityId}
          onActivity={onActivity}
          activeId={active?.criterionId ?? null}
          onActive={setActiveId}
          onRate={choose}
          thumb={thumb}
        />
      </div>
    </section>
  );
}
