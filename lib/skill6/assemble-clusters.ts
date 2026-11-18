/**
 * Regenerate clusters and assemble them: patches, union, ground lift, refined surface.
 * Writes data/skill6/assembled/. Saved catalog, coverage, compatibility, and patch studies are read only.
 * Run with ids to regenerate only those entries; every other index entry is kept.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { assembleCluster, encodeMesh } from "./assembly";
import { CATALOG_TARGETS, readStoredAssemblies, supersedeStoredAssembly } from "./catalog";
import {
  SKILL6_CONTRACT,
  SKILL6_COVERAGE_ALGORITHM,
  SKILL6_GROWTH_DIRECTIONS,
  SKILL6_PARAMETERS,
  type ClusterRecord,
  type ContactRelation,
  type SearchStats,
  type Vec3,
} from "./contract";
import { measureEnvelope, validateSpec } from "./envelope";
import { poseOf } from "./geometry";
import { aggregateCoverage } from "./grow";
import { connectedGroups, measureCluster } from "./metrics";
import { loadTranslatedTable } from "./shifts";
import { loadArchetypeMeshes, type ArchetypeMesh } from "./source";

const DIRECTORY = path.join(process.cwd(), "data", "skill6", "assembled");
const BUDGET = { evaluations: 1600, backtracks: 48, triesPerDepth: 80 };

const PAIRS = [
  { id: "assembled-flat-self", hostId: "flat-deep-plan", guestId: "flat-deep-plan", spec: { yaw: 180, pitch: -40, roll: 0, axis: [-1, 0, 0] as Vec3, axisName: "-X", gap: 0.1, mirrorX: false } },
  { id: "assembled-flat-plate", hostId: "flat-deep-plan", guestId: "inserted-horizontal-plate", spec: { yaw: 180, pitch: 0, roll: 0, axis: [-1, 0, 0] as Vec3, axisName: "-X", gap: 0.1, mirrorX: false } },
];

function pairRecord(id: string, host: ArchetypeMesh, guest: ArchetypeMesh, spec: (typeof PAIRS)[number]["spec"]): ClusterRecord {
  const reading = validateSpec(host, guest, spec);
  if (!reading.accepted) throw new Error(`${id} lost its verified joint`);
  const home = poseOf(0, false, [0, 0, 0]);
  const measured = measureEnvelope(host, guest, home, reading.pose);
  const contact: ContactRelation = {
    hostId: "t00",
    guestId: "t01",
    hostPatch: "envelope",
    guestPatch: "envelope",
    verdict: reading.verdict === "surface-contact" ? "surface-contact" : "near-contact",
    minSurfaceDistance: reading.minSurfaceDistance,
    residualGap: reading.residualGap,
    contactArea: reading.contactArea,
    coherentRegions: reading.coherentRegions,
    normalAlignment: reading.normalAlignment ?? 0,
    hostNormal: [1, 0, 0],
    guestNormal: [-1, 0, 0],
    samples: measured.samples,
    rejected: [],
    intersectingTriangles: 0,
    deepestCrossing: reading.deepestCrossing,
    overlapVolume: reading.overlapVolume,
    attachment: "envelope",
    searchNote: `${spec.axisName} yaw ${spec.yaw} pitch ${spec.pitch} roll ${spec.roll} gap ${spec.gap}`,
    registrationOverlap: false,
    tightBox: "touch",
    tolerance: SKILL6_PARAMETERS.contactTolerance,
  };
  const tiles = [host, guest].map((mesh, index) => ({
    instanceId: `t0${index}`,
    archetypeId: mesh.archetypeId,
    moduleId: mesh.moduleId,
    typologyId: mesh.typologyId,
    name: mesh.name,
    pose: index === 0 ? home : reading.pose,
  }));
  const byId = new Map([host, guest].map((mesh) => [mesh.archetypeId, mesh]));
  const search: SearchStats = { evaluations: 1, acceptedPoses: 1, backtracks: 0, milliseconds: 0, exhausted: false, truncated: false, untried: 0, geometricRejections: 0, rejectionCounts: { intersection: 0, containment: 0, contact: 0 }, depthLimit: null, stop: "reached" };
  return {
    contract: SKILL6_CONTRACT,
    id,
    status: "accepted",
    reason: "Verified pair, rebuilt from its stored envelope specification.",
    algorithm: SKILL6_COVERAGE_ALGORITHM,
    seed: 0,
    parameters: SKILL6_PARAMETERS,
    tiles,
    contacts: [contact],
    components: connectedGroups(tiles, [contact]),
    metrics: measureCluster(tiles, [contact], byId),
    search,
  };
}

async function main() {
  const only = process.argv.slice(2);
  const meshes = loadArchetypeMeshes();
  const byId = new Map(meshes.map((mesh) => [mesh.archetypeId, mesh]));
  const table = loadTranslatedTable();
  mkdirSync(DIRECTORY, { recursive: true });
  let records: ClusterRecord[] = readStoredAssemblies();
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  /** A regenerated id replaces its entry in place. The replaced record and its mesh move to history first. */
  const store = (record: ClusterRecord) => {
    records = supersedeStoredAssembly(records, record, stamp);
  };
  const write = () => writeFileSync(path.join(DIRECTORY, "index.json"), JSON.stringify({
    version: 1,
    note: "Newly generated or explicitly regenerated clusters only. Saved catalog and coverage clusters are not patched. Tile poses are the rigid solver output; seatedTiles add one Z lift. Patches, union, and refined surface are derivatives stored in the mesh files.",
    growthDirections: SKILL6_GROWTH_DIRECTIONS,
    budget: BUDGET,
    clusters: records,
  }, null, 1));

  const jobs: { id: string; build: () => ClusterRecord }[] = [
    ...PAIRS.map((pair) => ({ id: pair.id, build: () => pairRecord(pair.id, byId.get(pair.hostId)!, byId.get(pair.guestId)!, pair.spec) })),
    ...CATALOG_TARGETS.map((target) => ({
      id: `assembled-${target.id}`,
      build: () => aggregateCoverage(meshes, {
        ...target,
        id: `assembled-${target.id}`,
        compatibility: table,
        triesPerDepth: BUDGET.triesPerDepth,
        budget: { evaluations: BUDGET.evaluations, backtracks: BUDGET.backtracks },
        directions: SKILL6_GROWTH_DIRECTIONS,
      }),
    })),
  ];

  for (const job of jobs) {
    if (only.length && !only.includes(job.id)) continue;
    const record = job.build();
    if (record.status !== "accepted") {
      console.log(`${job.id} ${record.status} ${record.tiles.length} tiles · not assembled · ${record.reason?.slice(0, 120)}`);
      store(record);
      write();
      continue;
    }
    const meshFile = `data/skill6/assembled/${job.id}.mesh.json`;
    const { assembly, meshes: built } = await assembleCluster(record, meshes, meshFile);
    store({ ...record, assembly });
    writeFileSync(path.join(process.cwd(), meshFile), JSON.stringify({
      id: job.id,
      raw: encodeMesh(built.raw),
      refined: encodeMesh(built.refined),
      patches: built.patches.map((mesh) => encodeMesh(mesh)),
    }));
    write();
    const a = assembly;
    console.log([
      job.id,
      `${record.tiles.length} tiles`,
      `joints ${a.joints.length} (direct ${a.counts["direct-contact"]}, patched ${a.counts["patched-near-contact"]}, failed ${a.counts["failed-patch"]})`,
      `union ${a.union.status} ${a.union.components} solid + ${a.union.cavities} cavities minZ ${a.union.minZ} vol ${a.union.volume?.toFixed(1)}`,
      `refined ${a.refined.status} ${a.refined.components} solid + ${a.refined.cavities} cavities (${a.refined.cavitiesFilled} filled) minZ ${a.refined.minZ} vol ${a.refined.volume?.toFixed(1)} shift ${a.refined.maxShift.toFixed(3)} mean ${a.refined.meanShift.toFixed(3)}`,
      `seam creases ${a.refined.seamSharpEdgesBefore}→${a.refined.seamSharpEdgesAfter}, all ${a.refined.sharpEdgesBefore}→${a.refined.sharpEdgesAfter}`,
      `lift ${a.ground.lift.toFixed(3)}`,
      `directions ${a.growth.map((step) => step.direction ?? "seed").join(" ")}`,
      `${a.milliseconds.total} ms`,
    ].join(" · "));
  }
  console.log("assembled clusters stored");
}

main();
