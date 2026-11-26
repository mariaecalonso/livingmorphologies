"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { drawPlacedMeshes } from "@/lib/skill4/draw-placed";
import type { FinalClusterStats } from "@/lib/skill4/final-cluster-stats";
import {
  FINAL_CLUSTER_GENERATOR,
  type FinalClusterSummary,
  type FinalClusterTilePose,
  type FinalClustersCatalogDocument,
} from "@/lib/skill4/final-cluster-pairs";
import { tileBasis } from "@/lib/skill4/tile-basis";
import { resolveTileModule, type TileInstance } from "@/lib/skill4/tiles";
import { useHybrid } from "./hybrid-state";
import styles from "./final-cluster-method.module.css";

/** Workspace white, lobby orange, gathering teal. The Skill 4 typology tokens. */
const PROGRAM_COLOR = {
  workspace: "#f2f2ee",
  lobby: "#c77e5f",
  gathering: "#7db8b8",
} as const;

const PRODUCTION = ["H08", "H13", "H18"] as const;
const GROWTH = ["linear", "angular", "branching", "vertical"] as const;
const BIASES = ["linear", "angular", "branching", "vertical", "compact"] as const;
const FIELD = Array.from({ length: 25 }, (_, index) => `H${String(index + 1).padStart(2, "0")}`);

/**
 * Catalog ids whose realized primary was read with readGrowth from the stored
 * pair record. The stored character field is the growth intent, not this class.
 */
const GROWTH_REPS = {
  linear: "lobby-lobby:0",
  angular: "workspace-workspace:4",
  branching: "mixed:10",
  vertical: "workspace-lobby:1",
} as const;

const SIZE_REPS = [
  { size: 2, id: "workspace-workspace:0" },
  { size: 3, id: "lobby-lobby:3" },
  { size: 4, id: "workspace-gathering:6" },
  { size: 5, id: "lobby-lobby:9" },
  { size: 6, id: "lobby-gathering:12" },
  { size: 7, id: "gathering-gathering:15" },
  { size: 8, id: "mixed:17" },
] as const;

/** Clusters whose stored connections are only this production connector. */
const CONNECTOR_REPS = {
  H08: "lobby-gathering:0",
  H13: "workspace-lobby:3",
  H18: "gathering-gathering:0",
} as const;

type Stats = FinalClusterStats;
type ProgramName = keyof typeof PROGRAM_COLOR;
type Pose = FinalClusterTilePose;
type PackedHybrid = { id: string; triangles: number; positions: string; normals: string; indices: string };
type ViewName = "methodology" | "analysis";

function isProgram(value: string | null | undefined): value is ProgramName {
  return value === "lobby" || value === "workspace" || value === "gathering";
}

function rgb(hex: string): [number, number, number] {
  const parts = hex.slice(1).match(/../g)?.map((part) => parseInt(part, 16) / 255);
  return parts?.length === 3 ? [parts[0], parts[1], parts[2]] : [1, 1, 1];
}

function tileColor(archetypeId: string, morphologies: Stats["morphologies"]): [number, number, number] {
  const program = morphologies.find((item) => item.id === archetypeId)?.program;
  return rgb(isProgram(program) ? PROGRAM_COLOR[program] : "#ffffff");
}

function asTile(tile: Pose): TileInstance {
  return {
    instanceId: tile.instanceId,
    archetypeId: tile.archetypeId,
    moduleId: "",
    transform: { ...tile.transform },
    rotationQuarter: tile.rotationQuarter as TileInstance["rotationQuarter"],
    mirror: tile.mirror,
    rotation: tile.rotation ? (tile.rotation as unknown as TileInstance["rotation"]) : undefined,
  };
}

function unpack(packed: PackedHybrid) {
  if (packed.triangles < 1) return null;
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

function isPacked(value: unknown): value is Omit<PackedHybrid, "id"> {
  if (!value || typeof value !== "object") return false;
  const record = value as Omit<PackedHybrid, "id">;
  return typeof record.triangles === "number"
    && typeof record.positions === "string"
    && typeof record.normals === "string"
    && typeof record.indices === "string";
}

function findCluster(catalog: FinalClustersCatalogDocument | null, id: string) {
  return catalog?.clusters.find((cluster) => cluster.id === id) ?? null;
}

function sizeRepresentatives(catalog: FinalClustersCatalogDocument | null) {
  if (!catalog) return [];
  return SIZE_REPS.flatMap((spec) => {
    const chosen = catalog.clusters.find((cluster) => cluster.id === spec.id && cluster.tileCount === spec.size);
    const fallback = catalog.clusters.find((cluster) => cluster.tileCount === spec.size);
    const cluster = chosen ?? fallback;
    return cluster ? [cluster] : [];
  });
}

function useLinks(pairId: string, id: string, enabled: boolean) {
  const pack = useConnectorPack(pairId, id, enabled);
  return pack.links;
}

const connectorPackCache = new Map<string, { links: PackedHybrid[]; cells: string[] }>();

function useConnectorPack(pairId: string, id: string, enabled: boolean) {
  const key = `${pairId}:${id}`;
  const [pack, setPack] = useState<{ links: PackedHybrid[]; cells: string[] }>(
    () => connectorPackCache.get(key) ?? { links: [], cells: [] },
  );
  useEffect(() => {
    if (!enabled || !pairId || !id) return;
    const cached = connectorPackCache.get(key);
    if (cached) {
      setPack(cached);
      return;
    }
    let alive = true;
    void fetch(`/api/skill4/final-clusters?pair=${encodeURIComponent(pairId)}&id=${encodeURIComponent(id)}&connectors=1`)
      .then((response) => response.json() as Promise<{ connections?: { id: string; selectedMockId?: string; validatedHybrid: unknown }[] }>)
      .then((body) => {
        const connections = body.connections ?? [];
        const next = {
          links: connections.flatMap((connection) => (
            isPacked(connection.validatedHybrid) ? [{ id: connection.id, ...connection.validatedHybrid }] : []
          )),
          cells: connections.map((connection) => connection.selectedMockId || "").filter((cell) => cell.startsWith("H")),
        };
        connectorPackCache.set(key, next);
        if (alive) setPack(next);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [enabled, id, key, pairId]);
  return pack;
}

function releaseCanvas(canvas: HTMLCanvasElement) {
  canvas.style.width = "100%";
  canvas.style.height = "100%";
}

/**
 * The presentation iframe scales the sheet. Chrome composites that WebGL canvas
 * as black. drawPlacedMeshes only copies oversized frames, so every method
 * preview keeps its own 2D copy on top of the WebGL canvas.
 */
function releaseGl(canvas: HTMLCanvasElement) {
  canvas.dataset.glReleased = "1";
  const gl = canvas.getContext("webgl2");
  gl?.getExtension("WEBGL_lose_context")?.loseContext();
}

function presentMesh(canvas: HTMLCanvasElement) {
  const parent = canvas.parentElement;
  if (!parent || canvas.width < 2 || canvas.height < 2) return;
  let presenter = canvas.nextElementSibling;
  if (!(presenter instanceof HTMLCanvasElement) || presenter.dataset.methodPresent !== "1") {
    presenter = document.createElement("canvas");
    presenter.dataset.methodPresent = "1";
    canvas.insertAdjacentElement("afterend", presenter);
  }
  presenter.style.cssText = "position:absolute;inset:0;width:100%;height:100%;z-index:4;pointer-events:none;";
  if (presenter.width !== canvas.width || presenter.height !== canvas.height) {
    presenter.width = canvas.width;
    presenter.height = canvas.height;
  }
  const context = presenter.getContext("2d");
  if (!context) return;
  context.clearRect(0, 0, presenter.width, presenter.height);
  context.drawImage(canvas, 0, 0);
  // The WebGL layer stays in the tree so it can redraw, and stays out of the
  // composite. Chrome paints that layer black over the scaled presentation sheet.
  canvas.style.position = "absolute";
  canvas.style.inset = "0";
  canvas.style.opacity = "0";
  canvas.style.pointerEvents = "none";
}

function usePaint(
  canvasRef: { current: HTMLCanvasElement | null },
  paint: () => boolean,
  signature: string,
) {
  useEffect(() => {
    const canvas = canvasRef.current;
    const parent = canvas?.parentElement;
    if (!canvas || !parent) return;
    let alive = true;
    let timer = 0;
    let tries = 0;
    const attempt = (fromResize = false) => {
      if (!alive) return;
      const fitted = paint();
      if (fitted) return;
      if (!fromResize) tries += 1;
      if (tries < 48) timer = window.setTimeout(() => attempt(false), 200);
    };
    attempt(false);
    const observer = new ResizeObserver(() => attempt(true));
    observer.observe(parent);
    return () => {
      alive = false;
      window.clearTimeout(timer);
      observer.disconnect();
    };
  }, [canvasRef, paint, signature]);
}

function MorphologyCell({ item }: { item: Stats["morphologies"][number] }) {
  const { loaded, ensureArchetypes } = useHybrid();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const handoff = resolveTileModule(item.id, loaded);
  const ready = handoff.status === "ready" && handoff.geometry ? "1" : "0";

  useEffect(() => {
    ensureArchetypes([item.id]);
  }, [ensureArchetypes, item.id]);

  const paint = useMemo(() => () => {
    const canvas = canvasRef.current;
    const parent = canvas?.parentElement;
    if (!canvas || !parent || parent.clientWidth < 2 || parent.clientHeight < 2) return false;
    if (handoff.status !== "ready" || !handoff.geometry) return false;
    releaseCanvas(canvas);
    drawPlacedMeshes(canvas, [{
      id: item.id,
      mesh: handoff.geometry,
      translate: { x: 0, y: 0, z: 0 },
      selected: false,
      color: rgb(isProgram(item.program) ? PROGRAM_COLOR[item.program] : "#ffffff"),
    }], 0.85, -0.55, 8, false, 4.2, false, 0.9, undefined, true, true);
    releaseCanvas(canvas);
    presentMesh(canvas);
    releaseGl(canvas);
    return canvas.width >= parent.clientWidth * 0.7 && canvas.height >= parent.clientHeight * 0.7;
  }, [handoff, item.id, item.program]);

  usePaint(canvasRef, paint, ready);

  return (
    <figure className={styles.morph}>
      <div className={styles.stage}><canvas ref={canvasRef} /></div>
      <figcaption style={{ color: isProgram(item.program) ? PROGRAM_COLOR[item.program] : "#fff" }}>{item.name}</figcaption>
    </figure>
  );
}

function ProgramMeshes({ items }: { items: Stats["morphologies"] }) {
  const program = items[0]?.program;
  return (
    <div className={styles.program}>
      <b style={{ color: isProgram(program) ? PROGRAM_COLOR[program] : "#fff" }}>{program ?? "program"}</b>
      <div className={styles.morphRow}>
        {items.map((item) => <MorphologyCell key={item.id} item={item} />)}
      </div>
    </div>
  );
}

function MeshCanvas({
  tiles,
  morphologies,
  links,
  label,
  captionId,
  keepContext = false,
}: {
  tiles: readonly Pose[];
  morphologies: Stats["morphologies"];
  links?: readonly PackedHybrid[];
  label: string;
  captionId?: string;
  keepContext?: boolean;
}) {
  const { loaded, ensureArchetypes } = useHybrid();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ids = tiles.map((tile) => tile.archetypeId).join("|");
  const ready = tiles.map((tile) => {
    const handoff = resolveTileModule(tile.archetypeId, loaded);
    return handoff.status === "ready" && handoff.geometry ? "1" : "0";
  }).join("");
  const linkKey = (links ?? []).map((link) => link.id).join("|");

  useEffect(() => {
    ensureArchetypes(tiles.map((tile) => tile.archetypeId));
  }, [ensureArchetypes, ids, tiles]);

  const paint = useMemo(() => () => {
    const canvas = canvasRef.current;
    const parent = canvas?.parentElement;
    if (!canvas || !parent || parent.clientWidth < 2 || parent.clientHeight < 2) return false;
    releaseCanvas(canvas);
    const drawnTiles = tiles.flatMap((tile) => {
      const handoff = resolveTileModule(tile.archetypeId, loaded);
      if (handoff.status !== "ready" || !handoff.geometry) return [];
      return [{
        id: tile.instanceId,
        mesh: handoff.geometry,
        translate: tile.transform,
        selected: false,
        basis: tileBasis(asTile(tile)),
        color: tileColor(tile.archetypeId, morphologies),
      }];
    });
    if (drawnTiles.length < tiles.length) return false;
    const drawnLinks = (links ?? []).flatMap((hybrid) => {
      const mesh = unpack(hybrid);
      if (!mesh) return [];
      return [{
        id: hybrid.id,
        mesh,
        translate: { x: 0, y: 0, z: 0 },
        selected: false,
        color: [0.78, 0.49, 0.37] as [number, number, number],
        plain: true,
      }];
    });
    drawPlacedMeshes(canvas, [...drawnTiles, ...drawnLinks], 0.85, -0.95, 80, false, 4.4, false, 0.8, undefined, true, true);
    releaseCanvas(canvas);
    presentMesh(canvas);
    if (!keepContext) releaseGl(canvas);
    return canvas.width >= parent.clientWidth * 0.85 && canvas.height >= parent.clientHeight * 0.85;
  }, [links, loaded, morphologies, tiles, keepContext]);

  usePaint(canvasRef, paint, `${ready}:${linkKey}`);

  return (
    <figure className={styles.cell} data-cluster={captionId}>
      <div className={styles.stage}><canvas ref={canvasRef} /></div>
      <figcaption className={styles.caption}>{label}</figcaption>
    </figure>
  );
}

function ConnectorPreview({
  connectorId,
  cluster,
  morphologies,
}: {
  connectorId: string;
  cluster: FinalClusterSummary;
  morphologies: Stats["morphologies"];
}) {
  const links = useLinks(cluster.pairId, cluster.id, true);
  return (
    <MeshCanvas
      tiles={cluster.tiles}
      morphologies={morphologies}
      links={links}
      captionId={cluster.id}
      label={`${connectorId} · ${cluster.id}`}
    />
  );
}

function AssemblyPreview({
  example,
  morphologies,
  connectors,
  label,
}: {
  example: NonNullable<Stats["example"]>;
  morphologies: Stats["morphologies"];
  connectors: boolean;
  label: string;
}) {
  const links = useLinks(example.pairId, example.id, connectors);
  return (
    <MeshCanvas
      tiles={example.tiles}
      morphologies={morphologies}
      links={connectors ? links : undefined}
      captionId={example.id}
      label={label}
      keepContext
    />
  );
}

function Track({
  rows,
  max,
}: {
  rows: { id: string; label: string; value: number; color: string }[];
  max: number;
}) {
  return (
    <div className={styles.track}>
      {rows.map((row) => (
        <div key={row.id} className={styles.trackRow} data-class={row.id}>
          <span>{row.label}</span>
          <i><b style={{ width: `${(row.value / Math.max(1, max)) * 100}%`, background: row.color }} /></i>
          <em>{row.value}</em>
        </div>
      ))}
    </div>
  );
}

const PAIR_CHIPS: { id: string; label: string; rule: string; colors: (keyof typeof PROGRAM_COLOR)[] }[] = [
  { id: "lobby-lobby", label: "Lobby", rule: "One family", colors: ["lobby", "lobby"] },
  { id: "workspace-workspace", label: "Workspace", rule: "One family", colors: ["workspace", "workspace"] },
  { id: "gathering-gathering", label: "Gathering", rule: "One family", colors: ["gathering", "gathering"] },
  { id: "workspace-lobby", label: "Lobby + Workspace", rule: "Both required", colors: ["lobby", "workspace"] },
  { id: "workspace-gathering", label: "Workspace + Gathering", rule: "Both required", colors: ["workspace", "gathering"] },
  { id: "lobby-gathering", label: "Lobby + Gathering", rule: "Both required", colors: ["lobby", "gathering"] },
  { id: "mixed", label: "Mixed", rule: "All three · min 3", colors: ["workspace", "lobby", "gathering"] },
];

const GROWTH_CUBES: Record<(typeof BIASES)[number], Array<[number, number, number]>> = {
  linear: [[0, 0, 0], [1, 0, 0], [2, 0, 0], [3, 0, 0]],
  angular: [[0, 0, 0], [1, 0, 0], [2, 0, 0], [2, 0, 1]],
  branching: [[1, 0, 1], [0, 0, 1], [2, 0, 1], [1, 0, 0], [1, 0, 2]],
  vertical: [[0, 0, 0], [0, 1, 0], [0, 2, 0], [0, 3, 0]],
  compact: [[0, 0, 0], [1, 0, 0], [0, 0, 1], [1, 0, 1], [0, 1, 0], [1, 1, 0], [0, 1, 1], [1, 1, 1]],
};

function PairingSquares({ counts }: { counts: Map<string, number> }) {
  return (
    <div className={styles.pairBoard}>
      {PAIR_CHIPS.map((chip) => (
        <div key={chip.id} className={styles.pairChip} data-pair={chip.id}>
          <span className={styles.squares}>
            {chip.colors.map((color, index) => (
              <i key={`${chip.id}:${index}`} style={{ background: PROGRAM_COLOR[color] }} />
            ))}
          </span>
          <span>{chip.label}</span>
          <span className={styles.pairRule}>{chip.rule}</span>
          <em>{counts.get(chip.id) ?? ""}</em>
        </div>
      ))}
    </div>
  );
}

function CubeMark({ cells }: { cells: Array<[number, number, number]> }) {
  const placed = cells.map(([x, y, z]) => {
    const sx = (x - z) * 13;
    const sy = (x + z) * 6.5 - y * 15;
    return { x, y, z, sx, sy };
  }).sort((a, b) => (a.x + a.z + a.y) - (b.x + b.z + b.y));
  const minX = Math.min(...placed.map((item) => item.sx)) - 16;
  const maxX = Math.max(...placed.map((item) => item.sx)) + 16;
  const minY = Math.min(...placed.map((item) => item.sy)) - 18;
  const maxY = Math.max(...placed.map((item) => item.sy)) + 16;
  return (
    <svg viewBox={`${minX} ${minY} ${maxX - minX} ${maxY - minY}`} aria-hidden="true">
      {placed.map((item) => {
        const { sx, sy } = item;
        const w = 12;
        const h = 6;
        return (
          <g key={`${item.x}:${item.y}:${item.z}`}>
            <polygon points={`${sx},${sy} ${sx + w},${sy + h} ${sx},${sy + h * 2} ${sx - w},${sy + h}`} fill="#d7d7d2" />
            <polygon points={`${sx - w},${sy + h} ${sx},${sy + h * 2} ${sx},${sy + h * 2 + 14} ${sx - w},${sy + h + 14}`} fill="#7db8b8" />
            <polygon points={`${sx + w},${sy + h} ${sx},${sy + h * 2} ${sx},${sy + h * 2 + 14} ${sx + w},${sy + h + 14}`} fill="#c77e5f" />
          </g>
        );
      })}
    </svg>
  );
}

function SlidingPair({
  morphologies,
  strength,
}: {
  morphologies: Stats["morphologies"];
  strength: number;
}) {
  const hostId = "open-hall";
  const guestId = "vertical-void";
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { loaded, ensureArchetypes } = useHybrid();
  const loadedRef = useRef(loaded);
  const strengthRef = useRef(strength);
  loadedRef.current = loaded;
  strengthRef.current = strength;

  useEffect(() => {
    ensureArchetypes([hostId, guestId]);
  }, [ensureArchetypes]);

  useEffect(() => {
    let alive = true;
    let timer = 0;
    let lastReach = -1;
    const paint = () => {
      const canvas = canvasRef.current;
      const parent = canvas?.parentElement;
      if (!canvas || !parent || parent.clientWidth < 2 || parent.clientHeight < 2) return false;
      const host = resolveTileModule(hostId, loadedRef.current);
      const guest = resolveTileModule(guestId, loadedRef.current);
      if (host.status !== "ready" || !host.geometry || guest.status !== "ready" || !guest.geometry) return false;
      const reach = 7 + (1 - strengthRef.current) * 6;
      if (Math.abs(reach - lastReach) < 0.35) return true;
      lastReach = reach;
      releaseCanvas(canvas);
      drawPlacedMeshes(canvas, [
        {
          id: hostId,
          mesh: host.geometry,
          translate: { x: -reach, y: 0, z: 0 },
          selected: false,
          color: tileColor(hostId, morphologies),
        },
        {
          id: guestId,
          mesh: guest.geometry,
          translate: { x: reach, y: 0, z: 0 },
          selected: false,
          color: tileColor(guestId, morphologies),
        },
      ], 0.45, -0.25, 36, false, 5.4, false, 1, { x: 0, y: 0, z: 0 }, false, false);
      releaseCanvas(canvas);
      presentMesh(canvas);
      return canvas.width >= parent.clientWidth * 0.7 && canvas.height >= parent.clientHeight * 0.7;
    };
    const loop = () => {
      if (!alive) return;
      const fitted = paint();
      timer = window.setTimeout(loop, fitted ? 90 : 200);
    };
    loop();
    const parent = canvasRef.current?.parentElement;
    const observer = new ResizeObserver(() => paint());
    if (parent) observer.observe(parent);
    return () => {
      alive = false;
      window.clearTimeout(timer);
      observer.disconnect();
    };
  }, [morphologies]);

  const hostName = morphologies.find((item) => item.id === hostId)?.name ?? "Open Hall";
  const guestName = morphologies.find((item) => item.id === guestId)?.name ?? "Vertical Void";
  return (
    <div className={styles.compatStage}>
      <canvas ref={canvasRef} />
      <div className={styles.compatNames}>
        <span>{hostName}</span>
        <span>{guestName}</span>
      </div>
    </div>
  );
}

function CompatibilityDiagram({
  distance,
  morphologies,
}: {
  distance: Stats["distance"];
  morphologies: Stats["morphologies"];
}) {
  const [strength, setStrength] = useState(0);
  useEffect(() => {
    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const turn = ((now - start) / 5200) % 2;
      const wave = turn <= 1 ? turn : 2 - turn;
      setStrength((1 - Math.cos(wave * Math.PI)) / 2);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, []);
  const span = 4.4 + (1 - strength) * 12.6;
  const recorded = 20 + span;
  const label = strength < 0.34 ? "Extended separation" : strength > 0.72 ? "Close separation" : "Closing";
  return (
    <div className={styles.compatPlay} aria-label="Relative compatibility changes the recorded separation">
      <div className={styles.compatHead}>
        <span>Relative compatibility</span>
        <b>{Math.round(strength * 100)}%</b>
      </div>
      <div className={styles.compatSlider}>
        <i style={{ width: `${strength * 100}%` }} />
        <em style={{ left: `${strength * 100}%` }} />
      </div>
      <div className={styles.compatEnds}>
        <span>Low compatibility</span>
        <span>High compatibility</span>
      </div>
      <SlidingPair morphologies={morphologies} strength={strength} />
      <div className={styles.compatRead}>
        <span>{label}</span>
        <span>{recorded.toFixed(1)}</span>
      </div>
      {distance ? (
        <div className={styles.compatEnds}>
          <span>Catalog {distance.min.toFixed(1)}</span>
          <span>mean {distance.mean.toFixed(1)}</span>
          <span>{distance.max.toFixed(1)}</span>
        </div>
      ) : null}
    </div>
  );
}

function GrowthCubes() {
  return (
    <div className={styles.cubeRow}>
      {BIASES.map((key) => (
        <figure key={key} className={styles.cube} data-class={key}>
          <CubeMark cells={GROWTH_CUBES[key]} />
          <figcaption>{key}</figcaption>
        </figure>
      ))}
    </div>
  );
}

function RunSimulation({
  example,
  morphologies,
}: {
  example: NonNullable<Stats["example"]>;
  morphologies: Stats["morphologies"];
}) {
  const total = example.tiles.length;
  const pack = useConnectorPack(example.pairId, example.id, true);
  const cells = pack.cells.length > 0 ? pack.cells : [...PRODUCTION];
  const cycle = Math.max(1, total + cells.length);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const timer = window.setInterval(() => setTick((current) => current + 1), 420);
    return () => window.clearInterval(timer);
  }, []);
  const step = tick % cycle;
  const seating = step < total;
  const count = seating ? step + 1 : total;
  const active = seating ? "" : cells[step - total] ?? "";
  const edge = seating ? 0 : step - total + 1;
  return (
    <div className={styles.run}>
      <AssemblyPreview
        example={{ ...example, tiles: example.tiles.slice(0, count) }}
        morphologies={morphologies}
        connectors={!seating}
        label={seating ? `Seating ${count} of ${total}` : active}
      />
      <div className={styles.somStage}>
        <div className={styles.field} data-running={seating ? "seat" : "som"}>
          {FIELD.map((id) => (
            <span
              key={id}
              data-production={PRODUCTION.includes(id as typeof PRODUCTION[number]) || undefined}
              data-active={id === active || undefined}
            >
              {id}
            </span>
          ))}
        </div>
        <div className={styles.somCopy}>
          <p>Columns move from one parent toward the other. The center column holds the two parents equal.</p>
          <p>Rows raise the transformation. Production tests only that center: H08, H13, and H18. The other cells stay empty.</p>
          <p data-live="true">
            {seating
              ? `Seat ${count} of ${total}. The tree finishes before a connector is chosen.`
              : `Connector ${edge} of ${cells.length}. The field seals ${active}.`}
          </p>
        </div>
      </div>
    </div>
  );
}

function Group({
  kicker,
  output,
  children,
}: {
  kicker: string;
  output?: boolean;
  children: ReactNode;
}) {
  return (
    <section className={styles.group} data-output={output ? "true" : undefined}>
      <p className={styles.groupKicker}>{kicker}</p>
      <div className={styles.groupSplit}>{children}</div>
    </section>
  );
}

function Step({
  n,
  title,
  sentence,
  className,
  children,
}: {
  n: string;
  title: string;
  sentence: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={`${styles.frame}${className ? ` ${className}` : ""}`}>
      <header className={styles.stepLabel}>
        <p className={styles.eyebrow}>{n}</p>
        <h2>{title}</h2>
      </header>
      <p className={styles.sentence}>{sentence}</p>
      <div className={styles.body}>{children}</div>
    </section>
  );
}

function MiniBar({ value, max, color, classId }: { value: number; max: number; color: string; classId: string }) {
  return (
    <span className={styles.matrixCell} data-class={classId}>
      <span className={styles.barTrack}>
        <b style={{ width: `${(value / Math.max(1, max)) * 100}%`, background: color }} />
      </span>
      <em>{value}</em>
    </span>
  );
}

export function FinalClusterMethod() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [catalog, setCatalog] = useState<FinalClustersCatalogDocument | null>(null);
  const [error, setError] = useState("");
  const [view, setView] = useState<ViewName>("methodology");
  const { ensureArchetypes } = useHybrid();

  useEffect(() => {
    let alive = true;
    void fetch("/api/skill4/final-cluster-stats", { cache: "no-store" })
      .then((response) => response.json() as Promise<Stats>)
      .then((body) => {
        if (alive) setStats(body);
      })
      .catch(() => {
        if (alive) setError("The production catalog could not be read.");
      });
    void fetch("/api/skill4/final-clusters", { cache: "no-store" })
      .then((response) => response.json() as Promise<FinalClustersCatalogDocument>)
      .then((body) => {
        if (alive) setCatalog(body);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!stats) return;
    ensureArchetypes(stats.morphologies.map((item) => item.id));
  }, [ensureArchetypes, stats]);

  if (error) {
    return <main className={`${styles.finalClusterMethod} hybrid-view`}><p className={styles.note}>{error}</p></main>;
  }
  if (!stats) {
    return <main className={`${styles.finalClusterMethod} hybrid-view`}><p className={styles.note}>Reading the production catalog</p></main>;
  }

  const groups = (["lobby", "workspace", "gathering"] as const).map((program) => ({
    program,
    items: stats.morphologies.filter((item) => item.program === program),
  }));
  const growthMax = Math.max(1, ...stats.categoriesDetail.flatMap((category) => GROWTH.map((key) => category.realized[key] ?? 0)));
  const connectorMax = Math.max(1, ...stats.categoriesDetail.flatMap((category) => PRODUCTION.map((key) => category.connectors[key] ?? 0)));
  const archetypeMax = Math.max(1, ...stats.archetypeFrequency.map((item) => item.count));
  const sizeMax = Math.max(1, ...stats.sizes.map((item) => item.count));
  const primaryMax = Math.max(1, ...GROWTH.map((key) => stats.realized[key] ?? 0));
  const secondaryMax = Math.max(1, ...GROWTH.map((key) => stats.secondary[key] ?? 0));
  const sizes = sizeRepresentatives(catalog);
  const growthReps = GROWTH.map((key) => ({ key, cluster: findCluster(catalog, GROWTH_REPS[key]) }));
  const connectorReps = PRODUCTION.map((key) => ({ key, cluster: findCluster(catalog, CONNECTOR_REPS[key]) }));
  const near = stats.nearMatches[0];
  const nearClusters = (near?.ids ?? []).map((id) => findCluster(catalog, id));
  const perCategory = stats.perCategory[0];
  const evenCategories = stats.perCategory.every((count) => count === perCategory);

  return (
    <main className={`${styles.finalClusterMethod} hybrid-view`}>
      <header className={styles.bar}>
        <div className={styles.identity}>
          <p className={styles.kicker}>Method</p>
          <p>
            {stats.validated}/{stats.clusters} validated · {stats.categories} categories · {stats.edges} connections
          </p>
        </div>
        <div className={styles.switch}>
          <button type="button" data-active={view === "methodology"} onClick={() => setView("methodology")}>Methodology</button>
          <button type="button" data-active={view === "analysis"} onClick={() => setView("analysis")}>Analysis</button>
        </div>
      </header>

      {view === "methodology" ? (
        <div className={`${styles.board} ${styles.methodology}`} data-sheet="methodology">
          <Group kicker="Inputs">
            <Step n="01" title="Morphologies" sentence="Available modules. Workspace white, lobby orange, gathering teal." className={styles.source}>
              <div className={styles.programs}>
                {groups.map((group) => <ProgramMeshes key={group.program} items={group.items} />)}
              </div>
            </Step>
            <hr className={styles.groupRule} />
            <Step n="02" title="Compositions" sentence="A program pool. A module may repeat once. An offer must exist." className={styles.compositions}>
              <PairingSquares counts={new Map(stats.categoriesDetail.map((category) => [category.id, category.count]))} />
            </Step>
          </Group>

          <Group kicker="Assembly logic">
            <Step n="03" title="Compatibility" sentence="Higher contact shortens the span, from 17 to 4.4." className={styles.engine}>
              <CompatibilityDiagram distance={stats.distance} morphologies={stats.morphologies} />
            </Step>
            <hr className={styles.groupRule} />
            <Step n="04" title="Tree" sentence="Assembly arrangements. These biases are not stored clusters." className={styles.tree}>
              <GrowthCubes />
            </Step>
          </Group>

          <Group kicker="Generated output" output>
            <Step n="05" title="Run" sentence="Actual cluster formation." className={`${styles.simulation} ${styles.stageStep}`}>
              {stats.example ? (
                <RunSimulation example={stats.example} morphologies={stats.morphologies} />
              ) : <div className={styles.missing}>No example in the catalog</div>}
            </Step>
            <hr className={styles.groupRule} />
            <Step n="06" title="Catalog" sentence="Stored resulting assemblies. Sizes 2–8, and the recorded near pair." className={`${styles.variety} ${styles.stageStep}`}>
              <div className={styles.cells}>
                {sizes.length > 0 ? sizes.map((cluster) => (
                  <MeshCanvas
                    key={cluster.id}
                    tiles={cluster.tiles}
                    morphologies={stats.morphologies}
                    captionId={cluster.id}
                    label={`${cluster.tileCount} · ${cluster.label}`}
                  />
                )) : <div className={styles.missing}>Catalog geometries are still loading</div>}
              </div>
              <div className={styles.pair}>
                {(near?.ids ?? []).map((id, index) => {
                  const cluster = nearClusters[index];
                  return cluster ? (
                    <MeshCanvas key={id} tiles={cluster.tiles} morphologies={stats.morphologies} captionId={id} label={id} />
                  ) : <div key={id} className={styles.missing}>{id} not in catalog</div>;
                })}
              </div>
            </Step>
          </Group>
        </div>
      ) : (
        <div className={`${styles.board} ${styles.analysis}`} data-sheet="analysis">
          <Step n="01" title="Production" sentence={`${stats.clusters} configurations · ${stats.categories} categories${evenCategories ? ` · ${perCategory} each` : ""}.`} className={styles.reading}>
            <div className={styles.figures}>
              <div className={styles.figure}><b>{stats.validated}</b><span>validated</span></div>
              <div className={styles.figure}><b>{stats.archetypeCoverage}</b><span>archetypes</span></div>
              <div className={styles.figure}><b>{stats.instances}</b><span>instances</span></div>
              <div className={styles.figure}><b>{stats.edges}</b><span>connections</span></div>
            </div>
            <Track
              max={sizeMax}
              rows={stats.sizes.map((item) => ({
                id: `size-${item.size}`,
                label: `${item.size} tiles`,
                value: item.count,
                color: "#c77e5f",
              }))}
            />
            {stats.distance ? (
              <div className={styles.distance}>
                <div className={styles.ruler}>
                  <span className={styles.cellMark} style={{ width: `${(20 / stats.distance.max) * 100}%` }} />
                  <span className={styles.gapMark} style={{ left: `${(20 / stats.distance.max) * 100}%`, width: `${((stats.distance.max - 20) / stats.distance.max) * 100}%` }} />
                  <i className={styles.tick} style={{ left: `${(stats.distance.min / stats.distance.max) * 100}%` }} data-kind="min" />
                  <i className={styles.tick} style={{ left: `${(stats.distance.mean / stats.distance.max) * 100}%` }} data-kind="mean" />
                  <i className={styles.tick} style={{ left: "100%" }} data-kind="max" />
                </div>
                <div className={styles.rulerLabels}>
                  <span>0</span>
                  <span>20-unit cell</span>
                  <span>min {stats.distance.min.toFixed(1)}</span>
                  <span>mean {stats.distance.mean.toFixed(2)}</span>
                  <span>max {stats.distance.max.toFixed(1)}</span>
                </div>
                <p className={styles.note}>{stats.distance.count} measured distances. The stored number is the cell plus the surface gap. One unit is one foot.</p>
              </div>
            ) : null}
            <div className={styles.freq}>
              {stats.archetypeFrequency.map((item) => (
                <div key={item.id} className={styles.freqRow} data-archetype={item.id}>
                  <img src={`/demo/chapters/archetype-${item.id}.webp`} alt="" />
                  <span style={{ color: isProgram(item.program) ? PROGRAM_COLOR[item.program] : "#fff" }}>{item.name}</span>
                  <i className={styles.barTrack}>
                    <b style={{ width: `${(item.count / archetypeMax) * 100}%`, background: isProgram(item.program) ? PROGRAM_COLOR[item.program] : "#fff" }} />
                  </i>
                  <em>{item.count}</em>
                </div>
              ))}
            </div>
          </Step>

          <Step n="02" title="Size" sentence="One assembly for each cluster size, from two tiles to eight." className={styles.sizes}>
            <div className={styles.cells}>
              {sizes.length > 0 ? sizes.map((cluster) => (
                <MeshCanvas
                  key={cluster.id}
                  tiles={cluster.tiles}
                  morphologies={stats.morphologies}
                  captionId={cluster.id}
                  label={`${cluster.tileCount} · ${cluster.label}`}
                />
              )) : <div className={styles.missing}>Catalog geometries are still loading</div>}
            </div>
          </Step>

          <Step n="03" title="Growth" sentence={`Mean dimensional balance ${stats.balance.mean} across ${stats.balance.count} clusters. Shortest registration side divided by the longest.`} className={styles.growth}>
            <Track
              max={Math.max(1, ...BIASES.map((key) => stats.assigned[key] ?? 0))}
              rows={BIASES.map((key) => ({ id: `bias-${key}`, label: key, value: stats.assigned[key] ?? 0, color: "#49d7de" }))}
            />
            <Track
              max={primaryMax}
              rows={GROWTH.map((key) => ({ id: `primary-${key}`, label: key, value: stats.realized[key] ?? 0, color: "#49d7de" }))}
            />
            <Track
              max={secondaryMax}
              rows={GROWTH.map((key) => ({ id: `secondary-${key}`, label: key, value: stats.secondary[key] ?? 0, color: "#c77e5f" }))}
            />
            <div className={styles.cells}>
              {growthReps.map((item) => item.cluster ? (
                <MeshCanvas
                  key={item.key}
                  tiles={item.cluster.tiles}
                  morphologies={stats.morphologies}
                  captionId={item.cluster.id}
                  label={item.key}
                />
              ) : <div key={item.key} className={styles.missing}>{GROWTH_REPS[item.key]}</div>)}
            </div>
          </Step>

          <Step n="04" title="Connectors" sentence="The three production connectors, each shown on an assembly that uses only that connector." className={styles.connectors}>
            <div className={styles.counts}>
              {PRODUCTION.map((key) => (
                <div key={key} data-connector={key}><b>{stats.connectors[key] ?? 0}</b><span>{key}</span></div>
              ))}
            </div>
            <div className={styles.cells}>
              {connectorReps.map((item) => item.cluster ? (
                <ConnectorPreview key={item.key} connectorId={item.key} cluster={item.cluster} morphologies={stats.morphologies} />
              ) : <div key={item.key} className={styles.missing}>{item.key} · {CONNECTOR_REPS[item.key]} not in catalog</div>)}
            </div>
          </Step>

          <Step n="05" title="Categories" sentence="Cyan is realized growth. Copper is the production connectors. Balance is separate from both." className={styles.matrixFrame}>
            <div className={styles.matrix}>
              <div className={styles.matrixHead}>
                <span>category</span>
                {GROWTH.map((key) => <span key={key}>{key}</span>)}
                <span />
                {PRODUCTION.map((key) => <span key={key}>{key}</span>)}
              </div>
              {stats.categoriesDetail.map((category) => (
                <div key={category.id} className={styles.matrixRow} data-category={category.id}>
                  <span>{category.label}</span>
                  {GROWTH.map((key) => (
                    <MiniBar key={key} classId={`${category.id}:${key}`} value={category.realized[key] ?? 0} max={growthMax} color="#49d7de" />
                  ))}
                  <span />
                  {PRODUCTION.map((key) => (
                    <MiniBar key={key} classId={`${category.id}:${key}`} value={category.connectors[key] ?? 0} max={connectorMax} color="#c77e5f" />
                  ))}
                </div>
              ))}
            </div>
            <p className={styles.note}>
              {stats.categoriesDetail.map((category) => `${category.label} ${category.balanceMean}`).join(" · ")}
            </p>
          </Step>

          <Step n="06" title="Near-match" sentence={near?.accepted ? near.note : "No accepted near-match."} className={styles.diversity}>
            <div className={styles.pair}>
              {(near?.ids ?? []).map((id, index) => {
                const cluster = nearClusters[index];
                return cluster ? (
                  <MeshCanvas key={id} tiles={cluster.tiles} morphologies={stats.morphologies} captionId={id} label={id} />
                ) : <div key={id} className={styles.missing}>{id} not in catalog</div>;
              })}
            </div>
            <p className={styles.note}>
              {near ? `${near.ids.join(" and ")}. ` : ""}
              Exact pose duplicates {stats.exactDuplicateGroups.length}. Assessment {stats.diversityStatus || "recorded"}.
              {" "}{FINAL_CLUSTER_GENERATOR}. One seating framework. Connector sampling and the diversity rule were refined between batches. Those batches are one cumulative exploration, not one identical parameter set. The stored geometry was not regenerated to make the batches match.
              {catalog?.generatedAt ? ` Catalog ${catalog.generatedAt}.` : ""}
            </p>
          </Step>
        </div>
      )}
    </main>
  );
}
