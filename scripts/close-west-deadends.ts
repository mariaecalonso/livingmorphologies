/**
 * Street network: close west / street-side cul-de-sac tips by linking them to
 * each other (or a nearby west junction). Links only — no other edits.
 * Then save as the Zoning massing network.
 */
import { readFile, writeFile } from "fs/promises";
import path from "path";
import {
  readArchiveIterationRecord,
  serializeArchiveIteration,
  STRATEGY_ARCHIVE_ID,
} from "../lib/skill5/strategy-archive";
import type { NetworkNode } from "../components/site/site-network";

const ARCHIVE = path.join(process.cwd(), "data", "skill5", "herald-arrival-v1.json");
const SOURCE_ID = "batch-mwwy05kf-street-66390011";
const MAX_PAIR_FT = 110;

type Branch = { x0: number; z0: number; x1: number; z1: number; conductivity: number };
type Pt = { x: number; z: number };

function keyOf(x: number, z: number) {
  return `${Math.round(x * 5) / 5}:${Math.round(z * 5) / 5}`;
}

function dist(a: Pt, b: Pt) {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

function alreadyLinked(branches: readonly Branch[], a: Pt, b: Pt) {
  return branches.some((edge) => {
    const d0 = Math.hypot(edge.x0 - a.x, edge.z0 - a.z) < 1.5 && Math.hypot(edge.x1 - b.x, edge.z1 - b.z) < 1.5;
    const d1 = Math.hypot(edge.x1 - a.x, edge.z1 - a.z) < 1.5 && Math.hypot(edge.x0 - b.x, edge.z0 - b.z) < 1.5;
    return d0 || d1;
  });
}

function buildGraph(branches: readonly Branch[]) {
  const degree = new Map<string, number>();
  const pointAt = new Map<string, Pt>();
  for (const edge of branches) {
    for (const point of [
      { x: edge.x0, z: edge.z0 },
      { x: edge.x1, z: edge.z1 },
    ]) {
      const key = keyOf(point.x, point.z);
      pointAt.set(key, point);
      degree.set(key, (degree.get(key) ?? 0) + 1);
    }
  }
  return { degree, pointAt };
}

async function main() {
  const raw = JSON.parse(await readFile(ARCHIVE, "utf8")) as {
    iterations: Array<Record<string, unknown> & { id: string; index: number; nodes: NetworkNode[]; branches: Branch[] }>;
    massingNetworkId: string | null;
    zoningShortlist: string[];
  };

  // Drop earlier west-closed copies so we only keep the street-based fix.
  raw.iterations = raw.iterations.filter((item) => !String(item.id).includes("west-closed"));

  const source = raw.iterations.find((item) => item.id === SOURCE_ID);
  if (!source?.branches?.length) throw new Error(`Missing ${SOURCE_ID}`);
  const parsed = readArchiveIterationRecord(source);
  if (!parsed) throw new Error("Could not read street iteration.");

  const streetCount = parsed.nodes.filter(
    (node) => String(node.id).startsWith("street-") || String(node.recordId || "").startsWith("pedestrian:access:"),
  ).length;
  if (streetCount < 2) throw new Error("Refusing to close ends on a non-street network.");

  console.log(`iteration ${source.index} · ${source.id}`);
  console.log(`nodes=${parsed.nodes.length} branches=${source.branches.length} streetSources=${streetCount}`);

  const branches = source.branches.map((edge) => ({ ...edge }));
  const xs = branches.flatMap((edge) => [edge.x0, edge.x1]);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const westLimit = minX + (maxX - minX) * 0.55;
  const northStreetZ = Math.max(...branches.flatMap((edge) => [edge.z0, edge.z1])) - 120;
  console.log(`westLimit x<=${westLimit.toFixed(1)} or northStreet z>=${northStreetZ.toFixed(1)}`);

  const inFocus = (point: Pt) => point.x <= westLimit || point.z >= northStreetZ;

  const { degree, pointAt } = buildGraph(branches);
  const tips: Pt[] = [];
  for (const [key, count] of degree) {
    if (count !== 1) continue;
    const point = pointAt.get(key);
    if (!point || !inFocus(point)) continue;
    tips.push(point);
  }
  console.log(`focus cul-de-sac tips=${tips.length}`);
  for (const tip of tips) {
    const terminal = parsed.nodes.find((node) => Math.hypot(node.x - tip.x, node.z - tip.z) < 10);
    console.log(`  ${tip.x.toFixed(1)},${tip.z.toFixed(1)}${terminal ? ` · ${terminal.kind} ${terminal.id}` : ""}`);
  }

  const added: Branch[] = [];
  const used = new Set<number>();
  const pairs = tips
    .flatMap((a, i) => tips.map((b, j) => ({ i, j, d: dist(a, b) })))
    .filter((pair) => pair.i < pair.j && pair.d > 3 && pair.d <= MAX_PAIR_FT)
    .sort((a, b) => a.d - b.d);

  for (const pair of pairs) {
    if (used.has(pair.i) || used.has(pair.j)) continue;
    const a = tips[pair.i];
    const b = tips[pair.j];
    if (alreadyLinked(branches, a, b)) continue;
    used.add(pair.i);
    used.add(pair.j);
    added.push({ x0: a.x, z0: a.z, x1: b.x, z1: b.z, conductivity: 1 });
    console.log(`pair ${a.x.toFixed(1)},${a.z.toFixed(1)} ↔ ${b.x.toFixed(1)},${b.z.toFixed(1)} (${pair.d.toFixed(1)} ft)`);
  }

  for (let index = 0; index < tips.length; index += 1) {
    if (used.has(index)) continue;
    const tip = tips[index];
    let best: { x: number; z: number; d: number } | null = null;
    for (const point of pointAt.values()) {
      if (!inFocus(point)) continue;
      const d = dist(tip, point);
      if (d < 8 || d > MAX_PAIR_FT) continue;
      const deg = degree.get(keyOf(point.x, point.z)) ?? 0;
      const score = d - (deg >= 2 ? 12 : 0);
      if (!best || score < best.d) best = { x: point.x, z: point.z, d: score };
    }
    if (!best) {
      console.log(`left open ${tip.x.toFixed(1)},${tip.z.toFixed(1)}`);
      continue;
    }
    if (alreadyLinked(branches, tip, best) || alreadyLinked(added, tip, best)) continue;
    used.add(index);
    added.push({ x0: tip.x, z0: tip.z, x1: best.x, z1: best.z, conductivity: 1 });
    console.log(`close ${tip.x.toFixed(1)},${tip.z.toFixed(1)} → ${best.x.toFixed(1)},${best.z.toFixed(1)}`);
  }

  const fixedBranches = [...branches, ...added];
  const after = buildGraph(fixedBranches);
  let still = 0;
  for (const [key, count] of after.degree) {
    if (count !== 1) continue;
    const point = after.pointAt.get(key);
    if (!point || !inFocus(point)) continue;
    still += 1;
  }
  console.log(`added=${added.length} focus tips still degree-1=${still}`);

  const stamp = Date.now().toString(36);
  const index = Math.max(...raw.iterations.map((item) => item.index), 0) + 1;
  const fixed = {
    ...parsed,
    id: `batch-${stamp}-west-closed-${parsed.seed}`,
    index,
    branches: fixedBranches,
    note:
      `Street network ${source.index} west/street-side cul-de-sacs closed for Zoning `
      + `(+${added.length} links only). From ${source.id}.`,
  };
  const record = serializeArchiveIteration(fixed);
  const shortlist = [record.id, SOURCE_ID, ...raw.zoningShortlist.filter((id) => id !== record.id && id !== SOURCE_ID)].slice(0, 3);
  while (shortlist.length < 3) shortlist.push(record.id);

  await writeFile(ARCHIVE, `${JSON.stringify({
    strategyId: STRATEGY_ARCHIVE_ID,
    massingNetworkId: record.id,
    zoningShortlist: shortlist,
    iterations: [...raw.iterations, record],
  }, null, 2)}\n`, "utf8");

  console.log(`saved for zoning · iteration ${index} · ${record.id}`);
  console.log(`original was street iteration ${source.index}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
