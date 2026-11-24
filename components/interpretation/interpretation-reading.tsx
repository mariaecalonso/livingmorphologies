"use client";

import { useEffect, useMemo, useState } from "react";
import { InterpretationView, type Orbit, type ViewPart } from "@/components/interpretation/interpretation-view";
import { InterpretationSourcePanel } from "@/components/interpretation/interpretation-source-panel";
import { subscribePipeline } from "@/components/pipeline/pipeline-client";
import { decodeMesh } from "@/lib/interpretation/decode";
import type { ReadingCard, ReadingFixtureView, ReadingLabView } from "@/lib/interpretation/reading-view";
import styles from "./interpretation-reading.module.css";

const GROUPS = [
  { id: "geometry", index: "01", title: "Read building" },
  { id: "opportunity", index: "02", title: "Opportunities" },
  { id: "limit", index: "03", title: "Limits" },
] as const;

const TONE: Record<ReadingCard["tone"], string> = {
  measured: "Measured geometry",
  opportunity: "Potential opportunity",
  unsupported: "Unsupported interpretation",
};

function translate(positions: Float32Array, translation: [number, number, number]) {
  const out = new Float32Array(positions.length);
  for (let index = 0; index < positions.length; index += 3) {
    out[index] = positions[index] + translation[0];
    out[index + 1] = positions[index + 1] + translation[1];
    out[index + 2] = positions[index + 2] + translation[2];
  }
  return out;
}

function markIndices(indices: Uint32Array, triangleIds: number[]) {
  const out = new Uint32Array(triangleIds.length * 3);
  triangleIds.forEach((triangle, index) => {
    out[index * 3] = indices[triangle * 3];
    out[index * 3 + 1] = indices[triangle * 3 + 1];
    out[index * 3 + 2] = indices[triangle * 3 + 2];
  });
  return out;
}

function preferred(cards: ReadingCard[]) {
  const caps = cards.filter((card) => card.tone === "opportunity" && card.label.startsWith("Cap ·"));
  if (caps.length === 0) return cards[0]?.id ?? "";
  return caps.slice().sort((left, right) => {
    const area = (card: ReadingCard) => Number(card.evidence[0]?.replace(/[^\d.]/g, "") || 0);
    return area(right) - area(left);
  })[0].id;
}

export function InterpretationReading() {
  const [view, setView] = useState<ReadingLabView | null>(null);
  const [error, setError] = useState("");
  const [cardId, setCardId] = useState("");
  const [orbit, setOrbit] = useState<Orbit | null>(null);

  useEffect(() => {
    let live = true;
    const load = () => {
      fetch("/api/interpretation/reading", { cache: "no-store" })
        .then(async (response) => {
          const body = await response.json() as ReadingLabView & { error?: string };
          if (!response.ok) throw new Error(body.error ?? "The reading did not load.");
          if (!live) return;
          setView(body);
          setError("");
          setOrbit(null);
          setCardId("");
        })
        .catch((caught: unknown) => {
          if (live) setError(caught instanceof Error ? caught.message : "The reading did not load.");
        });
    };
    load();
    const unsubscribe = subscribePipeline(load);
    return () => {
      live = false;
      unsubscribe();
    };
  }, []);

  const fixture: ReadingFixtureView | null = view?.fixtures.selected ?? null;
  const card = fixture?.cards.find((item) => item.id === cardId) ?? fixture?.cards[0] ?? null;

  useEffect(() => {
    if (!fixture) return;
    if (fixture.cards.some((item) => item.id === cardId)) return;
    setCardId(preferred(fixture.cards));
  }, [fixture, cardId]);

  const meshes = useMemo(() => {
    if (!view) return [];
    return view.clusters.map((cluster) => ({ ...cluster, decoded: decodeMesh(cluster.mesh) }));
  }, [view]);

  const parts = useMemo<ViewPart[]>(() => {
    if (!fixture) return [];
    const placed = meshes.map((cluster) => {
      const placement = fixture.placements.find((item) => item.clusterId === cluster.id);
      const translation = placement?.translation ?? [0, 0, 0];
      return {
        id: cluster.id,
        positions: translate(cluster.decoded.positions, translation),
        indices: cluster.decoded.indices,
      };
    });
    const mass: ViewPart[] = placed.map((cluster) => ({
      id: cluster.id,
      positions: cluster.positions,
      indices: cluster.indices,
      color: "#d5d5d2",
      opacity: 1,
      selectable: true,
    }));
    const marks: ViewPart[] = (card?.marks ?? []).flatMap((mark) => {
      const cluster = placed.find((item) => item.id === mark.clusterId);
      if (!cluster || mark.triangleIds.length === 0) return [];
      return [{
        id: `${card?.id}:${mark.clusterId}`,
        positions: cluster.positions,
        indices: markIndices(cluster.indices, mark.triangleIds),
        color: "#49d7de",
        opacity: 1,
        selectable: false,
        mark: true,
      }];
    });
    return [...mass, ...marks];
  }, [meshes, fixture, card]);

  const source = view?.source;
  const boardProps = {
    "data-assembly-id": source?.assemblyId ?? "",
    "data-assembly-revision": source?.assemblyRevision ?? "",
    "data-geometry-status": source?.geometryStatus ?? "no-source",
    "data-source-ready": source?.sourceReady ? "true" : "false",
    "data-cluster-ids": (view?.clusters ?? []).map((cluster) => cluster.id).join(","),
    "data-finished-cluster-ids": (view?.clusters ?? []).map((cluster) => cluster.occupancy?.finishedClusterId ?? "").join(","),
    "data-reading-mode": view?.mode ?? "",
  };

  if (error) {
    return (
      <div className={styles.board} {...boardProps}>
        <div className={styles.sourceSlot}><InterpretationSourcePanel /></div>
        <p className={styles.wait}>{error}</p>
      </div>
    );
  }

  if (!view) {
    return (
      <div className={styles.board} {...boardProps}>
        <div className={styles.sourceSlot}><InterpretationSourcePanel /></div>
        <p className={styles.wait}>Reading the selected assembly</p>
      </div>
    );
  }

  if (!source?.sourceReady || !fixture || !card) {
    return (
      <div className={styles.board} {...boardProps}>
        <header className={styles.head}>
          <div>
            <h1>Architectural Interpretation</h1>
            <p>Geometry reading · Opportunities · No new solids</p>
          </div>
        </header>
        <aside className={styles.column}>
          <InterpretationSourcePanel />
        </aside>
        <p className={styles.wait}>No Selected Assembly for Development</p>
      </div>
    );
  }

  return (
    <div className={styles.board} {...boardProps}>
      <header className={styles.head}>
        <div>
          <h1>Architectural Interpretation</h1>
          <p>Geometry reading · Opportunities · No new solids</p>
        </div>
      </header>
      <aside className={styles.column}>
        <InterpretationSourcePanel />
        {GROUPS.map((group) => (
          <section className={styles.group} key={group.id}>
            <h2><i>{group.index}</i>{group.title}</h2>
            <div className={styles.list}>
              {fixture.cards.filter((item) => item.group === group.id).map((item) => (
                <button key={item.id} type="button" data-on={item.id === card.id} data-tone={item.tone} onClick={() => setCardId(item.id)}>
                  <span>{item.label}</span>
                </button>
              ))}
            </div>
          </section>
        ))}
      </aside>
      <div className={styles.stage}>
        <div className={styles.viewer}>
          <InterpretationView
            parts={parts}
            selectedId={null}
            tool="orbit"
            orbit={orbit}
            interactive
            floorPlane={0}
            revision={0}
            onSelect={(id) => {
              const match = fixture.cards.find((item) => item.id === `${id}:preserve`);
              if (match) setCardId(match.id);
            }}
            onOrbit={setOrbit}
          />
          <p className={styles.orbit}>Orbit</p>
        </div>
        <p className={styles.caption}>{fixture.note} Drag to orbit. Scroll to zoom. The mesh is not edited.</p>
      </div>
      <aside className={styles.detail}>
        <h2>Building summary</h2>
        <div className={styles.summary}>
          <div><span>Assembly</span><b>{source.assemblyId ?? "none"}</b></div>
          <div><span>Clusters</span><b>{fixture.summary.clusters}</b></div>
          <div><span>Candidate caps</span><b>{fixture.summary.caps}</b></div>
          <div><span>Shelter readings</span><b>{fixture.summary.shelters}</b></div>
          <div><span>Connectivity</span><b>{fixture.summary.connectivity}</b></div>
        </div>
        <h2>Selected finding</h2>
        <h3>{card.label}</h3>
        <p className={styles.kicker}>{TONE[card.tone]}</p>
        <h2>Measured</h2>
        <ul>
          {card.evidence.map((line) => <li key={line}>{line}</li>)}
        </ul>
        <h2>Reading</h2>
        <p>{card.interpretation}</p>
        <h2>Limits</h2>
        <ul>
          {card.limits.map((line) => <li key={line}>{line}</li>)}
          {card.marks.length === 0 ? <li>No surface region is painted for this finding.</li> : null}
        </ul>
      </aside>
    </div>
  );
}
