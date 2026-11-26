import { adaptModule, type ReadyModule } from "@/lib/skill4/adapt";
import { hybridReady, validateClusterAssembly } from "@/lib/skill4/cluster-hybrids";
import { connectAdaptive } from "@/lib/skill4/connector-select";
import type { FaceId } from "@/lib/skill4/contract";
import { FINAL_CLUSTER_PAIRS, type FinalClusterPairId } from "@/lib/skill4/final-cluster-pairs";
import { experimentGrowthCharacter, growDirectCluster, PROCESS_EXPERIMENT_INDEX, seedFor } from "@/lib/skill4/final-clusters";
import type { GeneratedHybridField } from "@/lib/skill4/generated-hybrid-field";
import { readGrowth } from "@/lib/skill4/growth-reading";
import type { IsoMesh } from "@/lib/scan/isomesh";
import { connectionProcess } from "@/lib/skill4/section-hybrid";
import { loadSkill3HandoffRecords } from "@/lib/skill4/skill3-handoff";
import type { TileConnection } from "@/lib/skill4/connections";
import type { TileInstance } from "@/lib/skill4/tiles";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const EXPERIMENT_SLOT = PROCESS_EXPERIMENT_INDEX;

/**
 * Runs the production tree and, when asked, H08, H13, and H18 only.
 * Nothing is written to the frozen catalog or the site authorities.
 */
export async function POST(request: Request) {
  const body = await request.json() as {
    pairId?: string;
    size?: number;
    attempt?: number;
    connect?: boolean;
  };
  const pair = FINAL_CLUSTER_PAIRS.find((item) => item.id === body.pairId);
  if (!pair) return NextResponse.json({ error: "unknown category" }, { status: 400 });
  const size = Math.round(body.size ?? 4);
  if (size < 2 || size > 8) return NextResponse.json({ error: "size must be 2 through 8" }, { status: 400 });
  const attempt = Math.max(0, Math.round(body.attempt ?? 0));
  const character = experimentGrowthCharacter(attempt);
  const seedIndex = EXPERIMENT_SLOT * 1000 + attempt + 17;
  const seed = seedFor(pair.id as FinalClusterPairId, seedIndex);
  const started = Date.now();
  const grown = growDirectCluster(pair, size, seed, character === "compact" ? "linear" : character, new Map(), character === "compact" ? "compact" : null);
  if (!grown) {
    return NextResponse.json({ ok: false, seed, character, elapsedMs: Date.now() - started, reason: "The production grower returned no seated tree for this seed." });
  }
  const realized = readGrowth(grown.tiles, grown.connections);
  const loaded = new Map(loadSkill3HandoffRecords().map((record) => [record.archetypeId, adaptModule(record)] as const));
  if (!body.connect) {
    return NextResponse.json({
      ok: true,
      catalogWritten: false,
      seed,
      seedIndex,
      character,
      intent: grown.intent,
      realized,
      names: grown.names,
      structure: grown.structure,
      root: rootOf(grown.tiles, grown.names),
      tiles: grown.tiles,
      edges: grown.connections.map((connection) => edgePayload(connection, grown.tiles, loaded, null)),
      assembly: { adopted: false, triangles: 0, film: null },
      elapsedMs: Date.now() - started,
    });
  }
  const connected = grown.connections.map((connection) => connectAdaptive(
    connection,
    grown.tiles,
    loaded,
    connection.separation ?? 29,
    { retainCandidateMeshes: true },
  ));
  const sealed = connected.filter((connection): connection is TileConnection => Boolean(connection && hybridReady(connection)));
  const film = sealed.length === grown.connections.length
    ? validateClusterAssembly(grown.tiles, sealed, loaded)
    : null;
  return NextResponse.json({
    ok: sealed.length === grown.connections.length,
    catalogWritten: false,
    seed,
    seedIndex,
    character,
    intent: grown.intent,
    realized,
    names: grown.names,
    structure: grown.structure,
    root: rootOf(grown.tiles, grown.names),
    tiles: grown.tiles,
    edges: grown.connections.map((connection, index) => edgePayload(connected[index] ?? connection, grown.tiles, loaded, connected[index])),
    assembly: { adopted: Boolean(film), triangles: film?.triangles ?? 0, film: packMesh(film) },
    elapsedMs: Date.now() - started,
  });
}

function rootOf(tiles: readonly TileInstance[], names: readonly string[]) {
  const root = tiles[0];
  return {
    name: names[0] ?? root?.archetypeId ?? "",
    archetypeId: root?.archetypeId ?? "",
    quarterTurn: root?.rotationQuarter ?? 0,
  };
}

function edgePayload(
  connection: TileConnection,
  tiles: readonly TileInstance[],
  loaded: ReadonlyMap<string, ReturnType<typeof adaptModule>>,
  seated: TileConnection | null,
) {
  const source = seated ?? connection;
  const ready = seated ? hybridReady(seated) : false;
  return {
    id: source.id,
    tileAId: source.tileAId,
    tileBId: source.tileBId,
    faceA: source.faceA,
    faceB: source.faceB,
    separation: source.separation ?? null,
    signature: source.signature,
    selectedMockId: source.selectedMockId || null,
    connectorSealed: ready,
    triangles: source.validatedHybrid?.triangles ?? 0,
    validatedHybrid: packMesh(source.validatedHybrid),
    field: packField(source.generatedHybridField),
    parentSections: parentSections(source, tiles, loaded),
  };
}

function parentSections(
  connection: TileConnection,
  tiles: readonly TileInstance[],
  loaded: ReadonlyMap<string, ReturnType<typeof adaptModule>>,
) {
  const tileA = tiles.find((tile) => tile.instanceId === connection.tileAId);
  const tileB = tiles.find((tile) => tile.instanceId === connection.tileBId);
  const moduleA = tileA ? loaded.get(tileA.archetypeId) : undefined;
  const moduleB = tileB ? loaded.get(tileB.archetypeId) : undefined;
  if (!moduleA || moduleA.status !== "ready" || !moduleB || moduleB.status !== "ready") return null;
  const process = connectionProcess(moduleA as ReadyModule, connection.faceA as FaceId, moduleB as ReadyModule, connection.faceB as FaceId);
  if (!process) return null;
  const pack = (section: { label: string; worldContour: { x: number; y: number; z: number }[] }) => ({
    label: section.label,
    outer: section.worldContour,
  });
  return { a: process.a.map(pack), b: process.b.map(pack) };
}

function packField(field: GeneratedHybridField | null) {
  if (!field) return null;
  return {
    version: field.version,
    status: field.status,
    connectionSignature: field.connectionSignature,
    readyCount: field.readyCount,
    blockedCount: field.blockedCount,
    emptyCount: field.emptyCount,
    invalidCount: field.invalidCount,
    candidates: field.candidates.map((candidate) => {
      const { growth: _growth, geometry, ...rest } = candidate;
      return { ...rest, geometry: packMesh(geometry) };
    }),
  };
}

function packMesh(mesh: IsoMesh | null | undefined) {
  if (!mesh || mesh.triangles < 1 || !mesh.positions || !mesh.normals || !mesh.indices) return null;
  const bytes = (view: ArrayBufferView) => Buffer.from(view.buffer, view.byteOffset, view.byteLength).toString("base64");
  return {
    triangles: mesh.triangles,
    positions: bytes(mesh.positions),
    normals: bytes(mesh.normals),
    indices: bytes(mesh.indices),
  };
}
