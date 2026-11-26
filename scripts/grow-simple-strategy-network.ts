/**
 * Grow one sparse Strategy network: a few sources + attractors only.
 * Bay stays open so growth can touch water without flooding the graph with zoning centroids.
 */
import { readFile, writeFile } from "fs/promises";
import path from "path";
import context from "../data/skill5/herald-site.json";
import { runNetworkIteration, type NetworkNode } from "../components/site/site-network";
import { FLOW_SPACING_FEET } from "../components/site/site-network-flow";
import { shoreLanding, GROWTH_WIDTH_DEFAULT } from "../components/site/site-water-growth";
import { buildArrivalArrangement } from "../lib/skill5/architectural-strategy";
import { serializeArchiveIteration, STRATEGY_ARCHIVE_ID } from "../lib/skill5/strategy-archive";
import type { SiteContext, XZ } from "../lib/skill5/site-model";

const ARCHIVE = path.join(process.cwd(), "data", "skill5", "herald-arrival-v1.json");
const SEED = 21155603;

function pointInWater(x: number, z: number, ring: readonly XZ[]) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, zi] = ring[i];
    const [xj, zj] = ring[j];
    const crosses = zi > z !== zj > z;
    if (crosses && x < ((xj - xi) * (z - zi)) / ((zj - zi) || 1e-9) + xi) inside = !inside;
  }
  return inside;
}

function bayAttractor(site: SiteContext): NetworkNode | null {
  const [px, pz] = site.site.ring.reduce((sum, point) => [sum[0] + point[0], sum[1] + point[1]], [0, 0] as [number, number]);
  const origin = { x: px / site.site.ring.length, z: pz / site.site.ring.length };
  for (let index = 0; index < site.site.ring.length; index += 1) {
    const a = site.site.ring[index];
    const b = site.site.ring[(index + 1) % site.site.ring.length];
    const midX = (a[0] + b[0]) / 2;
    const midZ = (a[1] + b[1]) / 2;
    const dx = midX - origin.x;
    const dz = midZ - origin.z;
    const span = Math.hypot(dx, dz) || 1;
    for (const distance of [40, 70, 100]) {
      const x = midX + (dx / span) * distance;
      const z = midZ + (dz / span) * distance;
      if (!pointInWater(x, z, site.water.ring)) continue;
      const landing = shoreLanding(x, z, site.site.ring, site.water.ring);
      if (!landing) continue;
      return {
        id: "n-water-bay",
        kind: "attractor",
        x,
        z,
        surface: "water",
        water: { widthFt: GROWTH_WIDTH_DEFAULT, landX: landing.x, landZ: landing.z },
        architecture: { role: "central-gathering", provenance: { class: "proposed", unverified: false, evidenceId: null } },
        strategy: { note: "Bay attractor", waterfrontFeet: distance },
      };
    }
  }
  return null;
}

async function main() {
  const site = context as SiteContext;
  const arrangement = buildArrivalArrangement(site);
  if (!arrangement) throw new Error("City-side arrival arrangement could not be placed.");

  // Keep only the core lobbies + a couple of rooms — not the full zoning dump.
  const keepRoles = new Set(["north-lobby", "primary-lobby", "private-lobby", "central-gathering", "workspace"]);
  const core = arrangement.nodes.filter((node) => {
    const role = node.architecture?.role;
    return role != null && keepRoles.has(role);
  });
  const sources = core.filter((node) => node.kind === "source");
  const attractors = core.filter((node) => node.kind === "attractor");
  // Cap: 3 sources max, 2 land attractors (central gathering + one workspace).
  const nodes: NetworkNode[] = [
    ...sources.slice(0, 3),
    ...attractors.filter((node) => node.architecture?.role === "central-gathering").slice(0, 1),
    ...attractors.filter((node) => node.architecture?.role === "workspace").slice(0, 1),
  ].map((node, index) => ({
    ...node,
    id: node.id || `n-${index}`,
    architecture: node.architecture
      ? { ...node.architecture, provenance: { ...node.architecture.provenance } }
      : undefined,
  }));
  const water = bayAttractor(site);
  if (water) nodes.push(water);

  console.log(`growing sparse network nodes=${nodes.length}`);
  for (const node of nodes) {
    console.log(`  ${node.kind} ${node.architecture?.role ?? "-"} ${node.surface ?? "land"}`);
  }

  // Do not open the whole bay — only the water attractor's local growth ring.
  // Full overWater floods the graph with thousands of branches.
  const iteration = await runNetworkIteration(
    site.site.ring,
    site.water.ring,
    nodes,
    SEED,
    (step, study) => {
      const branches = study?.generator === "flow" ? study.flowAppearance().length : 0;
      if (step % 80 === 0) console.log(`step ${step} branches=${branches}`);
    },
    site.buildings,
    null,
  );

  const raw = JSON.parse(await readFile(ARCHIVE, "utf8")) as {
    strategyId?: string;
    massingNetworkId?: string | null;
    zoningShortlist?: string[];
    iterations?: unknown[];
  };
  const existing = Array.isArray(raw.iterations) ? raw.iterations : [];
  const startIndex = existing.reduce((max, item) => {
    const index = item && typeof item === "object" && typeof (item as { index?: unknown }).index === "number"
      ? (item as { index: number }).index
      : 0;
    return Math.max(max, index);
  }, 0);
  const stamp = Date.now().toString(36);
  iteration.index = startIndex + 1;
  iteration.id = `batch-${stamp}-sparse-${SEED}`;
  iteration.layoutId = arrangement.arrangementId;
  iteration.layoutTitle = `${arrangement.title} · sparse`;
  iteration.layoutFamily = "strategy";
  iteration.spacingFeet = FLOW_SPACING_FEET;
  iteration.architectureRecord = {
    strategyId: arrangement.strategyId,
    arrangementId: arrangement.arrangementId,
    relationships: arrangement.relationships,
    northLobby: arrangement.northLobby,
    parameters: arrangement.parameters,
  };
  iteration.note = "Sparse: few sources and attractors, bay open.";
  const record = serializeArchiveIteration(iteration);
  const priorIds = existing.flatMap((item) => (
    item && typeof item === "object" && typeof (item as { id?: unknown }).id === "string"
      ? [(item as { id: string }).id]
      : []
  ));
  const shortlist = [record.id, ...priorIds.filter((id) => id !== record.id)].slice(0, 3);
  const next = {
    strategyId: STRATEGY_ARCHIVE_ID,
    massingNetworkId: record.id,
    zoningShortlist: shortlist.length === 3 ? shortlist : [record.id, record.id, record.id],
    iterations: [...existing, record],
  };
  await writeFile(ARCHIVE, `${JSON.stringify(next, null, 2)}\n`, "utf8");
  console.log(`wrote ${record.id} index=${iteration.index} branches=${iteration.branches?.length ?? 0} reached=${iteration.reached}/${iteration.total}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
