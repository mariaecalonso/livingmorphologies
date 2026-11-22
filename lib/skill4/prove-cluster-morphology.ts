import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { adaptModule } from "./adapt";
import { runAssemblyShrinkwrap } from "./assembly-shrinkwrap";
import { evaluateClusterMorphology, type MorphologyReport } from "./cluster-morphology";
import { connectClusterHybrid } from "./cluster-hybrids";
import { placeTileMesh } from "./cluster-void";
import { generateSizedCluster, MAX_CLUSTER_TILES } from "./program-cluster";
import { loadSkill3HandoffRecords } from "./skill3-handoff";
import { resolveTileModule } from "./tiles";

const ROOT = path.join(process.cwd(), "data", "skill4", "morphology-test");
const TARGET = 10;
const ATTEMPT_LIMIT = 36;

type Row = {
  iteration: number;
  seed: number;
  tiles: number;
  size: string;
  verticalLevels: number;
  branchNodes: number;
  directions: number;
  voidDefinition: number;
  linearity: number;
  score: number;
  pass: boolean;
  flags: string[];
  reasons: string[];
  points: { x: number; y: number; z: number }[];
  links: { ax: number; ay: number; az: number; bx: number; by: number; bz: number }[];
};

function line(programId: string, row: Row) {
  return [
    programId,
    `iteration ${String(row.iteration).padStart(2, "0")}`,
    `tiles ${row.tiles}`,
    row.size,
    `levels ${row.verticalLevels}`,
    `branches ${row.branchNodes}`,
    `directions ${row.directions}`,
    `void ${row.voidDefinition}`,
    `linearity ${row.linearity}`,
    `score ${row.score}`,
    row.pass ? "PASS" : "FAIL",
    row.flags.join(", "),
  ].join(" | ");
}

function prove(programId: string, loaded: Map<string, ReturnType<typeof adaptModule>>) {
  const rows: Row[] = [];
  const failures: { seed: number; flags: string[]; reasons: string[] }[] = [];
  let attempt = 0;
  let skipped = 0;
  while (rows.filter((row) => row.pass).length < TARGET && attempt < ATTEMPT_LIMIT) {
    const seed = attempt;
    const size = 4 + (attempt % (MAX_CLUSTER_TILES - 4 + 1));
    attempt += 1;
    const cluster = generateSizedCluster(programId, size, seed);
    if (!cluster) {
      skipped += 1;
      continue;
    }
    let connections = cluster.connections.slice();
    let hybrids = true;
    for (const connection of connections) {
      try {
        const next = connectClusterHybrid(connection, cluster.tiles, loaded);
        connections = connections.map((item) => item.id === next.id ? next : item);
        if ((next.validatedHybrid?.triangles ?? 0) < 1) hybrids = false;
      } catch {
        hybrids = false;
      }
      if (!hybrids) break;
    }
    if (!hybrids) {
      failures.push({ seed, flags: ["HYBRID"], reasons: ["A hybrid did not seat."] });
      console.log(`${programId} | seed ${seed} | hybrid did not seat`);
      continue;
    }
    const solids = [
      ...cluster.tiles.flatMap((tile) => {
        const geometry = resolveTileModule(tile.archetypeId, loaded).geometry;
        return geometry ? [placeTileMesh(tile, geometry)] : [];
      }),
      ...connections.flatMap((connection) => connection.validatedHybrid ? [connection.validatedHybrid] : []),
    ];
    const worlds = solids.map((mesh) => ({ positions: mesh.positions, indices: mesh.indices }));
    const film = runAssemblyShrinkwrap(worlds);
    if (!film) {
      failures.push({ seed, flags: ["SHRINKWRAP"], reasons: ["Shrinkwrap was not adopted."] });
      console.log(`${programId} | seed ${seed} | shrinkwrap was not adopted`);
      continue;
    }
    const report: MorphologyReport = evaluateClusterMorphology(cluster.tiles, connections, programId, solids);
    const byId = new Map(cluster.tiles.map((tile) => [tile.instanceId, tile.transform]));
    const row: Row = {
      iteration: rows.filter((item) => item.pass).length + (report.pass ? 1 : 0),
      seed,
      tiles: cluster.tiles.length,
      size: `${report.width}' × ${report.depth}' × ${report.height}'`,
      verticalLevels: report.verticalLevels,
      branchNodes: report.branchNodes,
      directions: report.directions,
      voidDefinition: report.voidDefinition,
      linearity: report.linearity,
      score: report.score,
      pass: report.pass,
      flags: report.flags,
      reasons: report.reasons,
      points: cluster.tiles.map((tile) => ({ x: tile.transform.x, y: tile.transform.y, z: tile.transform.z })),
      links: connections.flatMap((connection) => {
        const a = byId.get(connection.tileAId);
        const b = byId.get(connection.tileBId);
        return a && b ? [{ ax: a.x, ay: a.y, az: a.z, bx: b.x, by: b.y, bz: b.z }] : [];
      }),
    };
    if (!report.pass) {
      failures.push({ seed, flags: report.flags, reasons: report.reasons });
      console.log(line(programId, { ...row, iteration: failures.length }));
      continue;
    }
    rows.push(row);
    console.log(line(programId, row));
  }
  const passed = rows.filter((row) => row.pass);
  const body = { programId, requested: TARGET, passed: passed.length, skippedChains: skipped, failures, iterations: passed };
  mkdirSync(ROOT, { recursive: true });
  writeFileSync(path.join(ROOT, `${programId}.json`), JSON.stringify(body));
  console.log(`${programId} passed ${passed.length} of ${TARGET} | chain rejects ${skipped} | scored failures ${failures.length}`);
  return body;
}

const requested = process.argv.slice(2);
const programs = requested.length > 0 ? requested : ["public-lobby", "interdisciplinary-collaboration-hub"];
const records = loadSkill3HandoffRecords();
const loaded = new Map(records.map((record) => [record.archetypeId, adaptModule(record)] as const));
const boards = programs.map((programId) => prove(programId, loaded));
const cards = boards.flatMap((board) => board.iterations.map((row) => ({ programId: board.programId, ...row })));
const svg = cards.map((card, index) => {
  const column = index % 5;
  const row = Math.floor(index / 5);
  const ox = 40 + column * 360;
  const oy = 70 + row * 280;
  const scale = 1.6;
  const circles = card.points.map((point) => `<circle cx="${ox + point.x * scale}" cy="${oy + point.z * scale}" r="8" fill="none" stroke="#49d7de" />`).join("");
  const lines = card.links.map((link) => `<line x1="${ox + link.ax * scale}" y1="${oy + link.az * scale}" x2="${ox + link.bx * scale}" y2="${oy + link.bz * scale}" stroke="#c77e5f" />`).join("");
  const section = card.points.map((point) => `<circle cx="${ox + 170 + point.x * scale}" cy="${oy + 130 - point.y * scale}" r="8" fill="none" stroke="#49d7de" />`).join("");
  const sectionLines = card.links.map((link) => `<line x1="${ox + 170 + link.ax * scale}" y1="${oy + 130 - link.ay * scale}" x2="${ox + 170 + link.bx * scale}" y2="${oy + 130 - link.by * scale}" stroke="#c77e5f" />`).join("");
  return `<g><text x="${ox}" y="${oy - 28}" fill="#fff" font-size="12">${card.programId} ${String(card.iteration).padStart(2, "0")} ${card.size}</text><text x="${ox}" y="${oy - 12}" fill="#49d7de" font-size="11">plan</text><text x="${ox + 170}" y="${oy + 118}" fill="#49d7de" font-size="11">section</text>${circles}${lines}${section}${sectionLines}</g>`;
}).join("");
writeFileSync(path.join(ROOT, "index.html"), `<!doctype html><html><body style="margin:0;background:#000"><svg xmlns="http://www.w3.org/2000/svg" width="1900" height="${160 + Math.ceil(cards.length / 5) * 280}" style="background:#000">${svg}</svg></body></html>`);
