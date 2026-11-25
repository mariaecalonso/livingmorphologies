"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import "@/app/lab/hybrid/skill4-interface.css";
import { ArchitecturalDna } from "@/components/site/architectural-dna";
import { CompatibilityOverview } from "@/components/site/client-compatibility-panel";
import { SITE_ARCHETYPES } from "@/lib/skill5/catalog";
import { drawPlacedMeshes } from "@/lib/skill4/draw-placed";
import type { TileConnection } from "@/lib/skill4/connections";
import { connectClusterHybrid, hybridReady, validateClusterAssembly } from "@/lib/skill4/cluster-hybrids";
import type { IsoMesh } from "@/lib/scan/isomesh";
import { allowedTypeLabel, CLUSTER_PROGRAMS, eligibleTiles, matchLabel } from "@/lib/skill4/program-tiles";
import { resolveTileModule } from "@/lib/skill4/tiles";
import { tileBasis } from "@/lib/skill4/tile-basis";
import { tileStep, type TileInstance } from "@/lib/skill4/tiles";
import { areaStandingLabel } from "@/lib/skill4/program-area";
import { restoreStoredCatalog, type StoredIteration, type StoredProgramCatalog } from "@/lib/skill4/program-catalog";
import { PROGRAM_CLUSTER_2_ARCHIVED } from "@/lib/site-map";
import { finishForCatalog, useCatalogIterations, useCatalogStatus } from "./cluster-catalog";
import { MorphologyReview } from "./morphology-review";
import { HybridAssembly } from "./hybrid-assembly";
import { HybridState, useHybrid } from "./hybrid-state";

const CLUSTER_STEPS = [
  { id: "compatibility", label: "Tile Compatibility" },
  { id: "placement", label: "Cluster Placement" },
  { id: "morphology", label: "Morphology Review" },
] as const;

export type ClusterStepId = (typeof CLUSTER_STEPS)[number]["id"];

function ClusterStepNav({ step, base = "/lab/site" }: { step: ClusterStepId; base?: string }) {
  const router = useRouter();
  const open = (id: ClusterStepId) => {
    if (id === step) return;
    const params = new URLSearchParams(window.location.search);
    params.set("sheet", id);
    router.push(`${base}?${params.toString()}`);
  };
  return (
    <nav className="site-workflow" aria-label="Program cluster">
      {CLUSTER_STEPS.map((item, index) => (
        <span key={item.id} className="site-workflow-step">
          {index > 0 ? <span className="site-workflow-arrow" aria-hidden="true">→</span> : null}
          <button type="button" role="tab" aria-selected={step === item.id} data-active={step === item.id || undefined} onClick={() => open(item.id)}>
            <span>{String(index + 1).padStart(2, "0")}</span>
            {item.label}
          </button>
        </span>
      ))}
    </nav>
  );
}

type ClusterCard = {
  id: string;
  status: "valid" | "failed";
  tiles: TileInstance[];
  connections: TileConnection[];
  names: string[];
  dominantUsed: boolean;
  spacings: number[];
};

type PackedMesh = { triangles: number; positions: string; normals: string; indices: string };

function unpackMesh(packed: PackedMesh | null): IsoMesh | null {
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

function ClusterThumb({ tiles, connections = [], film = null }: { tiles: readonly TileInstance[]; connections?: readonly TileConnection[]; film?: IsoMesh | null }) {
  const { loaded } = useHybrid();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const readyKey = tiles.map((tile) => {
    const handoff = resolveTileModule(tile.archetypeId, loaded);
    return handoff.status === "ready" && handoff.geometry ? tile.archetypeId : "";
  }).join("|");
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (film && film.triangles > 0) {
      const reach = tiles.reduce((max, tile) => Math.max(max, Math.abs(tile.transform.x), Math.abs(tile.transform.y), Math.abs(tile.transform.z)), 0);
      drawPlacedMeshes(canvas, [{
        id: "film-wrap",
        mesh: film,
        translate: { x: 0, y: 0, z: 0 },
        selected: false,
        color: [1, 1, 1] as [number, number, number],
        opacity: 1,
        plain: true,
      }], 0.8, -1.05, reach * 2 + tileStep(), false, 4.2, false, 1, undefined, false, false, undefined, 1, 480);
      return;
    }
    const tilesDrawn = tiles.flatMap((tile) => {
      const handoff = resolveTileModule(tile.archetypeId, loaded);
      if (handoff.status !== "ready" || !handoff.geometry) return [];
      return [{
        id: tile.instanceId,
        mesh: handoff.geometry,
        translate: tile.transform,
        selected: false,
        basis: tileBasis(tile),
        kind: 0 as const,
        color: [1, 1, 1] as [number, number, number],
      }];
    });
    const hybrids = connections.flatMap((connection) => (
      connection.validatedHybrid && connection.validatedHybrid.triangles > 0 ? [{
        id: connection.id,
        mesh: connection.validatedHybrid,
        translate: { x: 0, y: 0, z: 0 },
        selected: false,
        kind: 0 as const,
        color: [0.78, 0.49, 0.37] as [number, number, number],
      }] : []
    ));
    const instances = [...tilesDrawn, ...hybrids];
    if (instances.length === 0) return;
    const reach = tiles.reduce((max, tile) => Math.max(max, Math.abs(tile.transform.x), Math.abs(tile.transform.y), Math.abs(tile.transform.z)), 0);
    drawPlacedMeshes(canvas, instances, 0.8, -1.05, reach * 2 + tileStep(), false, 4.2, false, 1, undefined, false, false, undefined, 1, 480);
  }, [connections, film, readyKey, tiles]);
  return (
    <span className="cluster-thumb">
      <canvas ref={canvasRef} width={440} height={240} aria-hidden="true" />
    </span>
  );
}

type ProgramReadout = {
  ranked: { id: string; name: string; score: number | null }[];
  dominant: { name: string } | null;
  spacingRangeLabel: string;
  spacingBiasLabel: string;
};

/** Temporary program check and the first cluster iterations. Tile menus stay manual. */
function ProgramRuleReadout() {
  const { loadCluster, ensureArchetypes, loaded } = useHybrid();
  const loadedRef = useRef(loaded);
  loadedRef.current = loaded;
  const [programId, setProgramId] = useState("");
  const [clusters, setClusters] = useState<ClusterCard[]>([]);
  const [openId, setOpenId] = useState("");
  const [armId, setArmId] = useState("");
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState("");
  const [readout, setReadout] = useState<ProgramReadout | null>(null);
  const clustersRef = useRef(clusters);
  clustersRef.current = clusters;
  const tiles = programId ? eligibleTiles(programId) : [];
  const ranked = readout?.ranked ?? [];
  const dominant = readout?.dominant ?? null;
  const spacingRange = readout?.spacingRangeLabel ?? "unavailable";
  const spacingBias = readout?.spacingBiasLabel ?? "unavailable";

  useEffect(() => {
    if (!programId) {
      setReadout(null);
      return;
    }
    let cancelled = false;
    const load = () => {
      fetch(`/api/skill4/program-cluster?program=${encodeURIComponent(programId)}&view=readout`, { cache: "no-store" })
        .then(async (response) => {
          const body = await response.json() as ProgramReadout & { error?: string };
          if (!response.ok) throw new Error(body.error || "unread");
          return body;
        })
        .then((body) => {
          if (!cancelled) setReadout(body);
        })
        .catch((error: unknown) => {
          if (cancelled) return;
          setReadout(null);
          if (error instanceof Error && error.message && error.message !== "unread") setNotice(error.message);
        });
    };
    load();
    const onVisible = () => {
      if (document.visibilityState === "visible") load();
    };
    window.addEventListener("focus", load);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", load);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [programId]);

  const generate = () => {
    if (!programId || pending) return;
    setPending(true);
    setNotice("");
    setArmId("");
    void fetch(`/api/skill4/program-cluster?program=${encodeURIComponent(programId)}`, { cache: "no-store" })
      .then(async (response) => {
        const body = await response.json() as { clusters?: ClusterCard[]; error?: string };
        if (!response.ok) throw new Error(body.error || "unread");
        const next = (body.clusters ?? []).filter((cluster) => cluster.status === "valid" && cluster.tiles.length >= 2 && cluster.tiles.length <= 9);
        setClusters(next);
        ensureArchetypes(next.flatMap((cluster) => cluster.tiles.map((tile) => tile.archetypeId)));
        const program = CLUSTER_PROGRAMS.find((item) => item.id === programId);
        finishForCatalog(programId, program?.name ?? programId, next, () => loadedRef.current);
        setOpenId("");
      })
      .catch((error: unknown) => {
        setNotice(error instanceof Error && error.message && error.message !== "unread" ? error.message : "Cluster iterations could not be generated.");
      })
      .finally(() => setPending(false));
  };

  const openCluster = (cluster: ClusterCard) => {
    setOpenId(cluster.id);
    ensureArchetypes(cluster.tiles.map((tile) => tile.archetypeId));
    if (cluster.connections.every(hybridReady)) {
      setArmId("");
      loadCluster(cluster.tiles, cluster.connections);
      return;
    }
    setNotice("Generating hybrids");
    setArmId(cluster.id);
  };

  useEffect(() => {
    if (!armId) return;
    const cluster = clustersRef.current.find((item) => item.id === armId);
    if (!cluster) return;
    const geometryReady = cluster.tiles.every((tile) => resolveTileModule(tile.archetypeId, loaded).status === "ready");
    if (!geometryReady) return;
    let cancel = false;
    let connections = cluster.connections.slice();
    const step = (index: number) => {
      if (cancel) return;
      if (index >= cluster.connections.length) {
        setClusters((current) => current.map((item) => (item.id === cluster.id ? { ...item, connections } : item)));
        loadCluster(cluster.tiles, connections);
        setArmId("");
        setNotice("");
        return;
      }
      setNotice(`Validating connection ${index + 1} of ${cluster.connections.length}`);
      window.setTimeout(() => {
        if (cancel) return;
        try {
          const next = connectClusterHybrid(connections[index], cluster.tiles, loaded);
          connections = connections.map((item) => (item.id === next.id ? next : item));
          step(index + 1);
        } catch (error) {
          if (cancel) return;
          setArmId("");
          setNotice(error instanceof Error ? error.message : "Hybrid generation failed.");
        }
      }, 0);
    };
    step(0);
    return () => {
      cancel = true;
    };
  }, [armId, loadCluster, loaded]);

  return (
    <div className="hybrid-layout-controls" data-program-rule="">
      <label className="hybrid-field">
        <span className="eyebrow">Program</span>
        <select
          className="hybrid-face-select"
          aria-label="Program"
          value={programId}
          onChange={(event) => {
            setProgramId(event.target.value);
            setClusters([]);
            setOpenId("");
          }}
        >
          <option value="">Select a program</option>
          {CLUSTER_PROGRAMS.map((program) => (
            <option key={program.id} value={program.id}>{program.name}</option>
          ))}
        </select>
      </label>
      {programId ? (
        <div data-program-readout="">
          <p className="hybrid-units">
            Allowed tile types: {allowedTypeLabel(programId)} · {tiles.length} eligible tiles
          </p>
          <p className="hybrid-units" data-spacing-profile="">
            Spacing profile: {spacingRange}
            <br />
            Bias: {spacingBias}
          </p>
          <p className="hybrid-units" data-dominant-tile="">
            Dominant tile: {dominant?.name ?? "none"}
          </p>
          <details data-tile-rank-panel="">
            <summary className="hybrid-units">Tile ranking</summary>
            <p className="hybrid-units" data-tile-rank="">
              {ranked.map((tile, index) => (
                <span key={tile.id}>
                  {index > 0 ? <br /> : null}
                  {index + 1}. {tile.name} — {matchLabel(tile.score)}
                </span>
              ))}
            </p>
          </details>
          <button type="button" data-generate-clusters="" disabled={pending} onClick={generate}>
            {pending ? "Generating" : "Generate cluster iterations"}
          </button>
          {notice ? <p className="hybrid-units">{notice}</p> : null}
          {openId ? (
            <p className="hybrid-units" data-cluster-hybrids="">
              {hybridReport(clusters.find((cluster) => cluster.id === openId))}
            </p>
          ) : null}
          {clusters.length > 0 ? (
            <div data-cluster-iterations="">
              {clusters.map((cluster, index) => (
                <button
                  key={cluster.id}
                  type="button"
                  data-cluster-card=""
                  data-status={cluster.status}
                  data-active={cluster.id === openId || undefined}
                  onClick={() => openCluster(cluster)}
                >
                  <ClusterThumb tiles={cluster.tiles} />
                  <span className="hybrid-units" title={`${cluster.names.join(", ")} · Profile ${spacingRange} · ${spacingBias}`}>
                    {index + 1} · {cluster.tiles.length} tiles
                    <br />
                    {cluster.spacings.map((value) => Math.round(value)).join(" / ")}
                  </span>
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function hybridReport(cluster: ClusterCard | undefined) {
  if (!cluster) return "";
  const expected = cluster.connections.length;
  const raw = cluster.connections.filter((connection) => (connection.rawHybrid?.triangles ?? 0) > 0).length;
  const validated = cluster.connections.filter((connection) => (connection.validatedHybrid?.triangles ?? 0) > 0).length;
  return `${cluster.tiles.length} tiles | ${raw} raw hybrids | ${validated} validated hybrids | ${expected - validated} missing`;
}

function TileCompatibilityStep({ base = "/lab/site" }: { base?: string }) {
  const router = useRouter();
  const [entryId, setEntryId] = useState<string | null>(null);
  const [activityId, setActivityId] = useState("public-lobby");
  const entry = SITE_ARCHETYPES.find((item) => item.archetypeId === entryId) ?? null;
  if (entry) {
    return (
      <ArchitecturalDna
        entry={entry}
        preview={null}
        activityId={activityId}
        onActivity={setActivityId}
        onClose={() => setEntryId(null)}
        onOpenOverview={() => setEntryId(null)}
      />
    );
  }
  return (
    <CompatibilityOverview
      entry={null}
      onClose={() => {
        const params = new URLSearchParams(window.location.search);
        params.set("sheet", "placement");
        router.push(`${base}?${params.toString()}`);
      }}
      onInspect={(archetypeId, nextActivity) => {
        setActivityId(nextActivity);
        setEntryId(archetypeId);
      }}
    />
  );
}

function ClusterCatalog({ embedded = false }: { embedded?: boolean }) {
  const { loadCluster, ensureArchetypes, loaded } = useHybrid();
  const loadedRef = useRef(loaded);
  loadedRef.current = loaded;
  const session = useCatalogIterations();
  const status = useCatalogStatus();
  const [stored, setStored] = useState<StoredProgramCatalog | null>(null);
  const [catalogReady, setCatalogReady] = useState(false);
  const [programId, setProgramId] = useState("");
  const [openId, setOpenId] = useState("");
  const [notice, setNotice] = useState("");
  const [seated, setSeated] = useState<Record<string, TileConnection[]>>({});
  const [films, setFilms] = useState<Record<string, IsoMesh | null>>({});
  const [validatedIds, setValidatedIds] = useState<Record<string, boolean>>({});
  const [formedNote, setFormedNote] = useState("");
  const seatedRef = useRef(seated);
  seatedRef.current = seated;
  const filmsRef = useRef(films);
  filmsRef.current = films;
  const openIdRef = useRef(openId);
  openIdRef.current = openId;
  const itemsRef = useRef<StoredIteration[]>([]);
  const queueRef = useRef<string[]>([]);
  const pumping = useRef(false);
  const alive = useRef(true);
  useEffect(() => {
    const controller = new AbortController();
    let cancel = false;
    fetch("/api/skill4/program-catalog", { signal: controller.signal, cache: "no-store" })
      .then(async (response) => response.json() as Promise<StoredProgramCatalog>)
      .then((catalog) => {
        if (!cancel) setStored(restoreStoredCatalog(catalog));
      })
      .catch(() => {
        if (!cancel) setStored(null);
      })
      .finally(() => {
        if (!cancel) setCatalogReady(true);
      });
    return () => {
      cancel = true;
      controller.abort();
    };
  }, []);
  useEffect(() => {
    if (!stored) return;
    const program = stored.programs.find((item) => item.programId === programId && item.iterations.length > 0)
      ?? stored.programs.find((item) => item.iterations.length > 0);
    if (!program) return;
    ensureArchetypes(program.iterations.flatMap((item) => item.tiles.map((tile) => tile.archetypeId)));
  }, [ensureArchetypes, programId, stored]);
  const groups = useMemo(() => {
    const storedGroups = (stored?.programs ?? []).filter((program) => program.iterations.length > 0);
    if (storedGroups.length > 0) return storedGroups.map((program) => ({ id: program.programId, name: program.name, items: program.iterations }));
    const order: string[] = [];
    const byProgram = new Map<string, StoredIteration[]>();
    for (const item of session) {
      const card: StoredIteration = {
        id: item.id,
        iteration: item.iteration,
        tileCount: item.tiles.length,
        habitableArea: item.habitableArea,
        targetMin: item.targetMin,
        targetMax: item.targetMax,
        areaStatus: item.areaStatus,
        validated: true,
        tiles: item.tiles,
        connections: item.connections,
      };
      const list = byProgram.get(item.programId);
      if (list) list.push(card);
      else {
        order.push(item.programId);
        byProgram.set(item.programId, [card]);
      }
    }
    return order.map((id) => ({ id, name: session.find((item) => item.programId === id)?.programName ?? id, items: byProgram.get(id) ?? [] }));
  }, [session, stored]);
  const activeProgram = programId || groups[0]?.id || "";
  const visible = groups.find((group) => group.id === activeProgram);
  itemsRef.current = visible?.items ?? [];
  const groupsRef = useRef(groups);
  groupsRef.current = groups;
  const connectionsOf = (item: StoredIteration) => seated[item.id] ?? item.connections;
  const pumpRef = useRef<() => void>(() => {});
  pumpRef.current = () => {
    if (pumping.current) return;
    pumping.current = true;
    void (async () => {
      try {
        while (alive.current && queueRef.current.length > 0) {
          const id = queueRef.current.shift();
          if (!id) break;
          const item = itemsRef.current.find((entry) => entry.id === id);
          if (!item) continue;
          for (let attempt = 0; attempt < 40; attempt += 1) {
            if (item.tiles.every((tile) => resolveTileModule(tile.archetypeId, loadedRef.current).status === "ready")) break;
            await new Promise<void>((resolve) => window.setTimeout(resolve, 50));
          }
          let connections = (seatedRef.current[id] ?? item.connections).slice();
          for (let index = 0; index < connections.length; index += 1) {
            const preferred = queueRef.current[0];
            if (preferred && preferred === openIdRef.current && preferred !== id) {
              queueRef.current.unshift(id);
              connections = [];
              break;
            }
            if ((connections[index].validatedHybrid?.triangles ?? 0) > 0) continue;
            setNotice(`Iteration ${String(item.iteration).padStart(2, "0")}: seating connection ${index + 1} of ${connections.length}`);
            await new Promise<void>((resolve) => window.setTimeout(resolve, 30));
            try {
              const next = connectClusterHybrid(connections[index], item.tiles, loadedRef.current);
              connections = connections.map((connection) => (connection.id === next.id ? next : connection));
              const saved = { ...seatedRef.current, [id]: connections };
              seatedRef.current = saved;
              setSeated(saved);
              if (openIdRef.current === id) loadCluster(item.tiles, connections);
            } catch (error) {
              setNotice(error instanceof Error ? error.message : "A connection could not be seated.");
              return;
            }
          }
          const complete = connections.length === item.connections.length
            && connections.every((connection) => (connection.validatedHybrid?.triangles ?? 0) > 0);
          if (complete && !(id in filmsRef.current)) {
            setNotice(`Iteration ${String(item.iteration).padStart(2, "0")}: validating`);
            await new Promise<void>((resolve) => window.setTimeout(resolve, 30));
            const film = validateClusterAssembly(item.tiles, connections, loadedRef.current);
            const savedFilms = { ...filmsRef.current, [id]: film };
            filmsRef.current = savedFilms;
            setFilms(savedFilms);
          }
        }
        setNotice("");
      } finally {
        pumping.current = false;
        if (queueRef.current.length > 0) pumpRef.current();
      }
    })();
  };
  const enqueue = (ids: readonly string[], front = false) => {
    const pending = ids.filter((id) => {
      const item = itemsRef.current.find((entry) => entry.id === id);
      if (!item) return false;
      const connections = seatedRef.current[id] ?? item.connections;
      const seated = connections.length > 0 && connections.every((connection) => (connection.validatedHybrid?.triangles ?? 0) > 0);
      return !seated || !(id in filmsRef.current);
    });
    if (pending.length === 0) return;
    queueRef.current = front
      ? [...pending, ...queueRef.current.filter((id) => !pending.includes(id))]
      : [...queueRef.current, ...pending.filter((id) => !queueRef.current.includes(id))];
    pumpRef.current();
  };
  useEffect(() => {
    alive.current = false;
    queueRef.current = [];
    pumping.current = false;
  }, [embedded, programId, stored]);
  useEffect(() => {
    if (activeProgram !== "public-lobby" && activeProgram !== "private-staff-lobby") {
      setFormedNote("");
      return;
    }
    let cancel = false;
    let pulling = false;
    const pull = async () => {
      if (pulling) return;
      pulling = true;
      try {
        const index = await fetch(`/api/skill4/formed?program=${encodeURIComponent(activeProgram)}`, { cache: "no-store" }).then((response) => response.json() as Promise<{ ids?: string[] }>);
        if (cancel) return;
        const ids = index.ids ?? [];
        const total = groupsRef.current.find((group) => group.id === activeProgram)?.items.length ?? ids.length;
        setFormedNote(ids.length >= total && total > 0 ? "Clusters formed" : `Forming clusters · ${ids.length} of ${total}`);
        for (const id of ids) {
          if (cancel) return;
          const existing = seatedRef.current[id];
          if (existing?.some((connection) => (connection.validatedHybrid?.triangles ?? 0) > 0) && existing.every((connection) => (connection.validatedHybrid?.triangles ?? 0) > 0)) continue;
          const body = await fetch(`/api/skill4/formed?program=${encodeURIComponent(activeProgram)}&id=${encodeURIComponent(id)}`, { cache: "no-store" }).then((response) => response.json() as Promise<{
            validated?: boolean;
            connections?: { id: string; validatedHybrid: PackedMesh | null }[];
          } | null>);
          const item = itemsRef.current.find((entry) => entry.id === id);
          if (!item || !body?.connections) continue;
          const meshes = new Map(body.connections.map((connection) => [connection.id, unpackMesh(connection.validatedHybrid)]));
          const connections = item.connections.map((connection) => ({
            ...connection,
            validatedHybrid: meshes.get(connection.id) ?? connection.validatedHybrid ?? null,
          }));
          const saved = { ...seatedRef.current, [id]: connections };
          seatedRef.current = saved;
          setSeated(saved);
          setValidatedIds((current) => ({ ...current, [id]: Boolean(body.validated) }));
          if (openIdRef.current === id) loadCluster(item.tiles, connections);
        }
      } finally {
        pulling = false;
      }
    };
    void pull();
    const timer = window.setInterval(() => void pull(), 4000);
    return () => {
      cancel = true;
      window.clearInterval(timer);
    };
  }, [activeProgram, loadCluster]);
  const open = (item: StoredIteration) => {
    setOpenId(item.id);
    openIdRef.current = item.id;
    ensureArchetypes(item.tiles.map((tile) => tile.archetypeId));
    loadCluster(item.tiles, seatedRef.current[item.id] ?? item.connections);
  };
  return (
    <>
      <div data-cluster-catalog="">
        {status ? <p className="hybrid-units">{status}</p> : null}
        {notice ? <p className="hybrid-units">{notice}</p> : null}
        {groups.length === 0 && !catalogReady ? <p className="hybrid-units">Loading iterations</p> : null}
        {groups.length === 0 && catalogReady && !status ? <p className="hybrid-units">Finished clusters appear here after the assembly is complete.</p> : null}
        {groups.length > 0 ? (
          <div data-catalog-programs="">
            {groups.map((group) => (
              <button key={group.id} type="button" data-active={group.id === (programId || groups[0]?.id) || undefined} onClick={() => setProgramId(group.id)}>
                {group.name}
              </button>
            ))}
          </div>
        ) : null}
        {formedNote ? <p className="hybrid-units" data-formed-note="">{formedNote}</p> : null}
        {groups.filter((group) => group.id === activeProgram).map((group) => (
          <section key={group.id}>
            <h2 className="hybrid-units">{group.name}</h2>
            <div data-cluster-iterations="">
              {group.items.map((item) => {
                const shown = connectionsOf(item);
                const hybrids = shown.filter((connection) => (connection.validatedHybrid?.triangles ?? 0) > 0).length;
                return (
                <button key={item.id} type="button" data-catalog-card="" data-hybrids={hybrids} data-active={item.id === openId || undefined} onClick={() => open(item)}>
                  <ClusterThumb tiles={item.tiles} connections={shown} />
                  <span className="hybrid-units">
                    Iteration {String(item.iteration).padStart(2, "0")}
                    <br />
                    Tiles: {item.tileCount}
                    <br />
                    Habitable area: {item.habitableArea} sf
                    <br />
                    Target: {item.targetMin}–{item.targetMax} sf
                    <br />
                    {areaStandingLabel(item.areaStatus)}
                    {item.savedAssembly?.validated || validatedIds[item.id] ? <><br />Validated</> : null}
                  </span>
                </button>
                );
              })}
            </div>
          </section>
        ))}
        {(stored?.programs ?? []).filter((program) => program.iterations.length === 0 && program.reason).map((program) => (
          <p key={program.programId} className="hybrid-units">{program.name} | {program.reason}</p>
        ))}
      </div>
      {openId && !embedded ? (
        <div className="cluster-placement-work">
          <HybridAssembly frame="canvas" clusterValidated={validatedIds[openId] === true || visible?.items.find((item) => item.id === openId)?.savedAssembly?.validated === true} />
        </div>
      ) : null}
    </>
  );
}

/** Finished program-cluster catalog. Opened from the Archived pocket. The live bar does not mount this. */
export function FinishedProgramCatalog() {
  return (
    <HybridState>
      <div className="cluster-placement">
        <ClusterCatalog />
      </div>
    </HybridState>
  );
}

/** Program-cluster steps. Archived from the live bar when PROGRAM_CLUSTER_2_ARCHIVED. The Archived pocket passes base="/lab/archived". */
export function ClusterPlacement({ sheet = "placement", base = "/lab/site" }: { sheet?: ClusterStepId; base?: string }) {
  const router = useRouter();
  const pocket = base.startsWith("/lab/archived");
  useEffect(() => {
    if (PROGRAM_CLUSTER_2_ARCHIVED && !pocket) router.replace("/lab/site?sheet=cluster-assembly");
  }, [pocket, router]);
  if (PROGRAM_CLUSTER_2_ARCHIVED && !pocket) return null;
  return (
    <HybridState>
      <div className="cluster-placement">
        <ClusterStepNav step={sheet} base={base} />
        {sheet === "compatibility" ? <TileCompatibilityStep base={base} /> : null}
        {sheet === "placement" ? (
          <>
            <div className="cluster-catalog-band">
              <ProgramRuleReadout />
            </div>
            <div className="cluster-placement-work">
              <HybridAssembly view="process" />
            </div>
          </>
        ) : null}
        {sheet === "morphology" ? <MorphologyReview /> : null}
      </div>
    </HybridState>
  );
}
