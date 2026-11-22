"use client";

import { useEffect, useRef, useState } from "react";
import type { IsoMesh } from "@/lib/scan/isomesh";
import { drawPlacedMeshes } from "@/lib/skill4/draw-placed";
import type { FinishedCatalog, FinishedIteration, FinishedProgram } from "@/lib/skill4/finished-catalog";
import { areaStandingLabel } from "@/lib/skill4/program-area";
import { tileStep } from "@/lib/skill4/tiles";
import { HybridAssembly } from "./hybrid-assembly";
import { useHybrid } from "./hybrid-state";

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

function FinishedThumb({ mesh }: { mesh: IsoMesh | null }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !mesh || mesh.triangles < 1) return;
    drawPlacedMeshes(canvas, [{
      id: "shrinkwrap",
      mesh,
      translate: { x: 0, y: 0, z: 0 },
      selected: false,
      color: [0.78, 0.94, 0.93] as [number, number, number],
    }], 0.8, -1.05, tileStep() * 8, false, 4.2, false, 1, undefined, false, false, undefined, 1, 480);
  }, [mesh]);
  return (
    <span className="cluster-thumb">
      <canvas ref={canvasRef} width={440} height={240} aria-hidden="true" />
    </span>
  );
}

/** Saved shrink-wrapped iterations. Choosing a program only reads them. */
export function FinishedCatalogView({ embedded = false }: { embedded?: boolean }) {
  const [source, setSource] = useState<"catalog" | "run2">("catalog");
  const [catalog, setCatalog] = useState<FinishedCatalog | null>(null);
  const [programId, setProgramId] = useState("");
  const [openId, setOpenId] = useState("");
  const [meshes, setMeshes] = useState<Record<string, IsoMesh | null>>({});
  const meshRef = useRef(meshes);
  meshRef.current = meshes;
  const sourceRef = useRef(source);
  const catalogUrl = source === "run2" ? "/api/skill4/iteration-run-2" : "/api/skill4/finished-catalog";
  const meshUrl = source === "run2" ? "/api/skill4/iteration-run-2-mesh" : "/api/skill4/finished-mesh";
  const running = catalog?.batch?.running === true;
  const { ensureArchetypes } = useHybrid();

  useEffect(() => {
    let cancel = false;
    const pull = async () => {
      const requested = sourceRef.current;
      const next = await fetch(catalogUrl, { cache: "no-store" }).then((response) => response.json() as Promise<FinishedCatalog>);
      if (cancel || sourceRef.current !== requested) return;
      setCatalog((current) => {
        if (!current || sourceRef.current !== requested) return next;
        return {
          ...next,
          programs: next.programs.map((program) => {
            const prior = current.programs.find((item) => item.programId === program.programId);
            if (!prior) return program;
            const detailed = new Map(prior.iterations.filter((item) => item.tiles?.length).map((item) => [item.id, item]));
            return {
              ...program,
              iterations: program.iterations.map((item) => detailed.get(item.id) ?? item),
            };
          }),
        };
      });
    };
    void pull();
    const timer = window.setInterval(() => {
      if (!cancel) void pull();
    }, 4000);
    return () => {
      cancel = true;
      window.clearInterval(timer);
    };
  }, [catalogUrl]);

  const programs = catalog?.programs ?? [];
  const active = programId || programs[0]?.programId || "";
  const program = programs.find((item) => item.programId === active);
  const iterations = (program?.iterations ?? []).filter((item) => item.status === "FINISHED" && item.validation.executed && item.validation.adopted && item.shrinkwrap.executed && item.shrinkwrap.triangles > 4);
  const iterationKey = iterations.map((item) => item.id).join("|");
  const openTiles = iterations.find((item) => item.id === openId)?.tiles;
  useEffect(() => {
    const ids = openTiles?.map((tile) => tile.archetypeId) ?? [];
    if (ids.length > 0) ensureArchetypes(ids);
  }, [ensureArchetypes, openTiles]);

  useEffect(() => {
    if (!active || !openId) return;
    let cancel = false;
    void fetch(`${catalogUrl}?program=${encodeURIComponent(active)}`, { cache: "no-store" })
      .then((response) => response.json() as Promise<FinishedProgram | null>)
      .then((program) => {
        if (cancel || !program?.iterations?.length) return;
        setCatalog((current) => {
          const prior = current?.programs.find((item) => item.programId === program.programId);
          if (prior?.iterations.some((item) => item.tiles?.length)) return current;
          return current ? {
            ...current,
            programs: current.programs.map((item) => item.programId === program.programId ? program : item),
          } : current;
        });
      })
      .catch(() => undefined);
    return () => {
      cancel = true;
    };
  }, [active, openId, catalogUrl]);
  useEffect(() => {
    if (!active || !iterationKey) return;
    let cancel = false;
    const ids = iterationKey.split("|");
    for (const id of ids) {
      if (meshRef.current[id]) continue;
      void fetch(`${meshUrl}?program=${encodeURIComponent(active)}&id=${encodeURIComponent(id)}`, { cache: "no-store" })
        .then((response) => response.json() as Promise<{ mesh?: PackedMesh | null } | null>)
        .then((body) => {
          if (cancel) return;
          const mesh = unpackMesh(body?.mesh ?? null);
          meshRef.current = { ...meshRef.current, [id]: mesh };
          setMeshes((current) => ({ ...current, [id]: mesh }));
        })
        .catch(() => undefined);
    }
    return () => {
      cancel = true;
    };
  }, [active, iterationKey, meshUrl]);

  const openMesh = meshes[openId] ?? null;
  const startBatch = () => {
    void fetch("/api/skill4/finished-catalog", { method: "POST" }).then(() => {
      void fetch("/api/skill4/finished-catalog", { cache: "no-store" }).then(async (response) => setCatalog(await response.json() as FinishedCatalog));
    });
  };

  return (
    <>
      <div data-cluster-catalog="">
        <div data-catalog-runs="">
          <button type="button" data-active={source === "catalog" || undefined} onClick={() => { sourceRef.current = "catalog"; setSource("catalog"); setCatalog(null); setMeshes({}); setOpenId(""); }}>Catalog</button>
          <button type="button" data-active={source === "run2" || undefined} onClick={() => { sourceRef.current = "run2"; setSource("run2"); setCatalog(null); setMeshes({}); setOpenId(""); }}>Run 2</button>
        </div>
        {source === "catalog" ? (
          <button type="button" onClick={startBatch} disabled={running}>
            {running ? (catalog?.batch?.phase || "Generating tiles") : "Generate all program iterations"}
          </button>
        ) : (
          <p className="hybrid-units">{running ? (catalog?.batch?.phase || "Generating tiles") : "Iteration run 2"}</p>
        )}
        {programs.length > 0 ? (
          <div data-catalog-programs="">
            {programs.map((item) => (
              <button key={item.programId} type="button" data-active={item.programId === active || undefined} onClick={() => { setProgramId(item.programId); setOpenId(""); }}>
                {item.name}
              </button>
            ))}
          </div>
        ) : null}
        {program ? (
          <section>
            <h2 className="hybrid-units">{program.name}</h2>
            {program.reason ? <p className="hybrid-units">{program.reason}</p> : null}
            <div data-cluster-iterations="">
              {iterations.map((item: FinishedIteration) => (
                <button key={item.id} type="button" data-catalog-card="" data-status="FINISHED" data-active={item.id === openId || undefined} onClick={() => setOpenId(item.id)}>
                  <FinishedThumb mesh={meshes[item.id] ?? null} />
                  <span className="hybrid-units">
                    {item.review ? (
                      <>
                        Iteration {String(item.iteration).padStart(2, "0")}
                        <br />
                        Tiles: {item.tileCount}
                        <br />
                        Cluster: {item.review.clusterWidth} × {item.review.clusterDepth} × {item.review.clusterHeight}
                        <br />
                        Void: {item.habitableArea} sf
                        <br />
                        Void height: {item.review.voidHeight} ft
                        <br />
                        Target: {item.targetMin}–{item.targetMax} sf
                        <br />
                        {areaStandingLabel(item.areaStatus)}
                        <br />
                        Morphology {item.review.morphologyPass ? "PASS" : "FAIL"}
                      </>
                    ) : (
                      <>
                        Iteration {String(item.iteration).padStart(2, "0")}
                        <br />
                        FINISHED
                        <br />
                        Tiles: {item.tileCount}
                        <br />
                        Habitable area: {item.habitableArea} sf
                        <br />
                        Target: {item.targetMin}–{item.targetMax} sf
                        <br />
                        {areaStandingLabel(item.areaStatus)}
                      </>
                    )}
                  </span>
                </button>
              ))}
            </div>
          </section>
        ) : null}
      </div>
      {openId && !embedded && openMesh ? (
        <div className="cluster-placement-work">
          <HybridAssembly frame="canvas" assemblyFilm={openMesh} assemblyTiles={iterations.find((item) => item.id === openId)?.tiles} assemblyConnections={iterations.find((item) => item.id === openId)?.connections} clusterValidated />
        </div>
      ) : null}
    </>
  );
}
