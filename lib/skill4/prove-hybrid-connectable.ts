import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { readCompatibility } from "@/lib/skill6/compatibility";
import { adaptModule } from "./adapt";
import { runAssemblyShrinkwrap } from "./assembly-shrinkwrap";
import { facesFromApproach } from "./cluster-face-pair";
import { connectClusterHybrid } from "./cluster-hybrids";
import { placeTileMesh } from "./cluster-void";
import { connectionId, type TileConnection } from "./connections";
import { DEFAULT_SELECTED_HYBRID_ID } from "./connections";
import type { FaceId } from "./contract";
import { sampleFace } from "./face-sample";
import { HYBRID_CONNECTABLE_PATH, readHybridConnectable, type HybridConnectablePair } from "./hybrid-connectable";
import { spacingProfile } from "./program-spacing";
import { loadSkill3HandoffRecords } from "./skill3-handoff";
import { envelopeWidth, resolveTileModule, type TileInstance } from "./tiles";
import { faceWorldNormal, orientTiles } from "./tile-orientation";

const GATHERING = [
  "stepped-amphitheater",
  "void-field",
  "inserted-horizontal-plate",
  "contained-room-within-volume",
  "linear-edge-gallery",
];
const SPACING_PROGRAM = "public-exhibition-gallery";

function nearMisses(left: string, right: string) {
  const file = readCompatibility();
  const found: { host: string; guest: string; note: string; contact: number }[] = [];
  for (const pair of file?.pairs ?? []) {
    const match = (pair.left === left && pair.right === right) || (pair.left === right && pair.right === left);
    if (!match) continue;
    for (const direction of pair.directions) {
      if ((direction.poses?.length ?? 0) > 0 || !direction.nearMiss) continue;
      found.push({
        host: direction.host,
        guest: direction.guest,
        note: direction.nearMiss.pose,
        contact: direction.nearMiss.contactArea,
      });
    }
  }
  return found.sort((a, b) => b.contact - a.contact);
}

function directPoseCount(left: string, right: string) {
  const file = readCompatibility();
  let count = 0;
  for (const pair of file?.pairs ?? []) {
    const match = (pair.left === left && pair.right === right) || (pair.left === right && pair.right === left);
    if (!match) continue;
    for (const direction of pair.directions) count += direction.poses?.length ?? 0;
  }
  return count;
}

function separated(tiles: readonly TileInstance[], loaded: Map<string, ReturnType<typeof adaptModule>>) {
  const boxes = tiles.map((tile) => {
    const geometry = resolveTileModule(tile.archetypeId, loaded).geometry;
    if (!geometry) return null;
    const placed = placeTileMesh(tile, geometry);
    let minX = Infinity;
    let minY = Infinity;
    let minZ = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    let maxZ = -Infinity;
    for (let index = 0; index < placed.positions.length; index += 3) {
      minX = Math.min(minX, placed.positions[index]);
      minY = Math.min(minY, placed.positions[index + 1]);
      minZ = Math.min(minZ, placed.positions[index + 2]);
      maxX = Math.max(maxX, placed.positions[index]);
      maxY = Math.max(maxY, placed.positions[index + 1]);
      maxZ = Math.max(maxZ, placed.positions[index + 2]);
    }
    return { minX, minY, minZ, maxX, maxY, maxZ };
  });
  if (boxes.some((box) => !box)) return false;
  const [a, b] = boxes;
  if (!a || !b) return false;
  return a.maxX <= b.minX || b.maxX <= a.minX || a.maxY <= b.minY || b.maxY <= a.minY || a.maxZ <= b.minZ || b.maxZ <= a.minZ;
}

function placePair(hostId: string, guestId: string, hostFace: FaceId, guestFace: FaceId, spacing: number) {
  const hostInstance = "a";
  const guestInstance = "b";
  const archetypeA = hostId <= guestId ? hostId : guestId;
  const tileAId = hostId === archetypeA ? hostInstance : guestInstance;
  const tileBId = hostId === archetypeA ? guestInstance : hostInstance;
  const faceA = hostId === archetypeA ? hostFace : guestFace;
  const faceB = hostId === archetypeA ? guestFace : hostFace;
  const connection: TileConnection = {
    id: connectionId(tileAId, tileBId),
    tileAId,
    tileBId,
    faceA,
    faceB,
    origin: "explicit",
    generationStatus: "not-generated",
    faceSelection: "user",
    inputsChanged: false,
    signature: "",
    candidateField: null,
    generatedHybridField: null,
    selectedMockId: DEFAULT_SELECTED_HYBRID_ID,
    rawHybrid: null,
    validatedHybrid: null,
  };
  const host: TileInstance = {
    instanceId: hostInstance,
    archetypeId: hostId,
    moduleId: "",
    transform: { x: 0, y: 0, z: 0 },
    rotationQuarter: 0,
    mirror: null,
  };
  const normal = faceWorldNormal(hostFace, host);
  const step = envelopeWidth() + spacing;
  const guest: TileInstance = {
    instanceId: guestInstance,
    archetypeId: guestId,
    moduleId: "",
    transform: { x: normal.x * step, y: normal.y * step, z: normal.z * step },
    rotationQuarter: 0,
    mirror: null,
  };
  const oriented = orientTiles([host, guest], [connection]);
  if (oriented.unresolved.has(connection.id)) return null;
  const byId = new Map(oriented.tiles.map((tile) => [tile.instanceId, { ...tile }]));
  const root = byId.get(hostInstance);
  const child = byId.get(guestInstance);
  if (!root || !child) return null;
  const seatedNormal = faceWorldNormal(hostFace, root);
  child.transform = {
    x: root.transform.x + seatedNormal.x * step,
    y: root.transform.y + seatedNormal.y * step,
    z: root.transform.z + seatedNormal.z * step,
  };
  return { tiles: [root, child], connection, faceA, faceB };
}

function prove(
  hostArchetype: string,
  guestArchetype: string,
  loaded: Map<string, ReturnType<typeof adaptModule>>,
): HybridConnectablePair | null {
  const best = nearMisses(hostArchetype, guestArchetype)[0];
  if (!best) {
    console.log(`${hostArchetype} | ${guestArchetype} | no rejected orientation`);
    return null;
  }
  const faces = facesFromApproach(best.note.split(" ")[0] ?? "");
  if (!faces) {
    console.log(`${hostArchetype} | ${guestArchetype} | approach ${best.note} has no face`);
    return null;
  }
  const profile = spacingProfile(SPACING_PROGRAM);
  if (!profile) return null;
  const spacing = profile.min + 0.84 * (profile.max - profile.min);
  const placed = placePair(best.host, best.guest, faces.host, faces.guest, spacing);
  if (!placed) {
    console.log(`${hostArchetype} | ${guestArchetype} | orientation unresolved at program spacing`);
    return null;
  }
  if (!separated(placed.tiles, loaded)) {
    console.log(`${hostArchetype} | ${guestArchetype} | tile meshes still intersect`);
    return null;
  }
  const connected = connectClusterHybrid(placed.connection, placed.tiles, loaded);
  const hybridReady = (connected.validatedHybrid?.triangles ?? 0) > 4;
  if (!hybridReady || !connected.validatedHybrid) {
    console.log(`${hostArchetype} | ${guestArchetype} | hybrid did not seat`);
    return null;
  }
  const worlds = [
    ...placed.tiles.flatMap((tile) => {
      const geometry = resolveTileModule(tile.archetypeId, loaded).geometry;
      if (!geometry) return [];
      const mesh = placeTileMesh(tile, geometry);
      return [{ positions: mesh.positions, indices: mesh.indices }];
    }),
    { positions: connected.validatedHybrid.positions, indices: connected.validatedHybrid.indices },
  ];
  const film = worlds.length === 3 ? runAssemblyShrinkwrap(worlds) : null;
  const archetypeA = hostArchetype < guestArchetype ? hostArchetype : guestArchetype;
  const archetypeB = hostArchetype < guestArchetype ? guestArchetype : hostArchetype;
  const record: HybridConnectablePair = {
    archetypeA,
    archetypeB,
    faceA: placed.faceA,
    faceB: placed.faceB,
    approach: best.note,
    spacingProgram: SPACING_PROGRAM,
    spacing,
    validation: true,
    shrinkwrap: true,
    triangles: film?.mesh.triangles ?? 0,
  };
  console.log([
    `${archetypeA} | ${archetypeB}`,
    `direct ${directPoseCount(archetypeA, archetypeB)}`,
    film ? "hybrid-connectable" : "not bridged",
    `${record.faceA}/${record.faceB}`,
    hybridReady ? "validation" : "no validation",
    film ? `shrinkwrap ${film.mesh.triangles}` : "no shrinkwrap",
  ].join(" | "));
  return film ? record : null;
}

const WORKSPACE = [
  "open-hall",
  "terraced",
  "flat-deep-plan",
  "void-edge",
  "undulated",
];
const WORKSPACE_SPACING_PROGRAM = "biological-research-lab";

function usableVerticalFace(module: ReturnType<typeof adaptModule>, face: "T" | "B") {
  if (module.status !== "ready") return false;
  const sample = sampleFace(module.geometry, face, module.faces[face]);
  return sample.status === "occupied" && sample.sampleCount > 0;
}

function proveVertical(
  hostArchetype: string,
  guestArchetype: string,
  loaded: Map<string, ReturnType<typeof adaptModule>>,
  spacing: number,
): HybridConnectablePair | "orientation" | "intersect" | "validation" | "shrinkwrap" {
  const placed = placePair(hostArchetype, guestArchetype, "T", "B", spacing);
  if (!placed) return "orientation";
  if (!separated(placed.tiles, loaded)) return "intersect";
  const connected = connectClusterHybrid(placed.connection, placed.tiles, loaded);
  const hybridReady = (connected.validatedHybrid?.triangles ?? 0) > 4;
  if (!hybridReady || !connected.validatedHybrid) return "validation";
  const worlds = [
    ...placed.tiles.flatMap((tile) => {
      const geometry = resolveTileModule(tile.archetypeId, loaded).geometry;
      if (!geometry) return [];
      const mesh = placeTileMesh(tile, geometry);
      return [{ positions: mesh.positions, indices: mesh.indices }];
    }),
    { positions: connected.validatedHybrid.positions, indices: connected.validatedHybrid.indices },
  ];
  const film = worlds.length === 3 ? runAssemblyShrinkwrap(worlds) : null;
  if (!film) return "shrinkwrap";
  const archetypeA = hostArchetype < guestArchetype ? hostArchetype : guestArchetype;
  const archetypeB = hostArchetype < guestArchetype ? guestArchetype : hostArchetype;
  return {
    archetypeA,
    archetypeB,
    faceA: placed.faceA,
    faceB: placed.faceB,
    approach: "Top/Bottom",
    spacingProgram: WORKSPACE_SPACING_PROGRAM,
    spacing,
    validation: true,
    shrinkwrap: true,
    triangles: film.mesh.triangles,
  };
}

function proveWorkspaceVertical(loaded: Map<string, ReturnType<typeof adaptModule>>) {
  const profile = spacingProfile(WORKSPACE_SPACING_PROGRAM);
  if (!profile) return;
  const preferred = profile.min + 0.84 * (profile.max - profile.min);
  const saved = readHybridConnectable();
  const vertical: HybridConnectablePair[] = [];
  const pairs = WORKSPACE.flatMap((left, index) => WORKSPACE.slice(index).map((right) => [left, right] as const));
  for (const [left, right] of pairs) {
    const hostModule = loaded.get(left);
    const guestModule = loaded.get(right);
    const leftTop = hostModule ? usableVerticalFace(hostModule, "T") : false;
    const rightBottom = guestModule ? usableVerticalFace(guestModule, "B") : false;
    const rightTop = guestModule ? usableVerticalFace(guestModule, "T") : false;
    const leftBottom = hostModule ? usableVerticalFace(hostModule, "B") : false;
    const attempts: [string, string][] = [];
    if (leftTop && rightBottom) attempts.push([left, right]);
    if (left !== right && rightTop && leftBottom) attempts.push([right, left]);
    if (attempts.length === 0) {
      console.log(`${left} | ${right} | no | no Top/Bottom surface | no validation | no shrinkwrap`);
      continue;
    }
    let stored: HybridConnectablePair | null = null;
    let failure: "orientation" | "intersect" | "validation" | "shrinkwrap" = "validation";
    for (const [host, guest] of attempts) {
      let result = proveVertical(host, guest, loaded, preferred);
      if (result === "intersect") result = proveVertical(host, guest, loaded, profile.max);
      if (typeof result === "string") {
        failure = result;
        continue;
      }
      stored = result;
      break;
    }
    if (!stored) {
      const validation = failure === "shrinkwrap" ? "validation" : "no validation";
      console.log(`${left} | ${right} | no | Top/Bottom | ${validation} | no shrinkwrap | ${failure}`);
      continue;
    }
    vertical.push(stored);
    console.log(`${stored.archetypeA} | ${stored.archetypeB} | yes | Top/Bottom | validation | shrinkwrap ${stored.triangles}`);
    mkdirSync(path.dirname(HYBRID_CONNECTABLE_PATH), { recursive: true });
    writeFileSync(HYBRID_CONNECTABLE_PATH, JSON.stringify({
      version: 1,
      pairs: saved.pairs,
      workspaceVertical: vertical,
    }));
  }
  mkdirSync(path.dirname(HYBRID_CONNECTABLE_PATH), { recursive: true });
  writeFileSync(HYBRID_CONNECTABLE_PATH, JSON.stringify({
    version: 1,
    pairs: saved.pairs,
    workspaceVertical: vertical,
  }));
  console.log(`workspace vertical stored ${vertical.length}`);
}

const records = loadSkill3HandoffRecords();
const loaded = new Map(records.map((record) => [record.archetypeId, adaptModule(record)] as const));
if (process.argv.includes("--workspace-vertical")) {
  proveWorkspaceVertical(loaded);
} else {
  const pairs = GATHERING.flatMap((left, index) => GATHERING.slice(index).map((right) => [left, right] as const));
  const only = process.argv.includes("--all")
    ? pairs
    : process.argv.includes("--self")
      ? pairs.filter(([left, right]) => left === right)
      : [["stepped-amphitheater", "void-field"] as const];
  const saved = readHybridConnectable();
  const next = saved.pairs.slice();
  for (const [left, right] of only) {
    const record = prove(left, right, loaded);
    if (!record) continue;
    const index = next.findIndex((pair) => pair.archetypeA === record.archetypeA && pair.archetypeB === record.archetypeB);
    if (index >= 0) next[index] = record;
    else next.push(record);
  }
  mkdirSync(path.dirname(HYBRID_CONNECTABLE_PATH), { recursive: true });
  writeFileSync(HYBRID_CONNECTABLE_PATH, JSON.stringify({
    version: 1,
    pairs: next,
    workspaceVertical: saved.workspaceVertical,
  }));
  console.log(`stored ${next.length}`);
}
