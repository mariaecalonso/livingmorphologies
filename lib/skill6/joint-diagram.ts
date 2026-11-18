/**
 * Writes the joint refinement diagram record for one assembled cluster.
 * Run: npx tsx lib/skill6/joint-diagram.ts [clusterId]
 * Plates are rendered separately from one fixed camera and stored in public/clustering/joint.
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { collectInterface } from "./patch";
import { SKILL6_PATCH_DEFAULTS } from "./contract";
import { loadArchetypeMeshes } from "./source";

const id = process.argv[2] ?? "assembled-flat-plate";
const directory = path.join(process.cwd(), "data", "skill6", "assembled");
const index = JSON.parse(readFileSync(path.join(directory, "index.json"), "utf8"));
const cluster = index.clusters.find((item: { id: string }) => item.id === id);
if (!cluster?.assembly) throw new Error(`${id} has no assembly`);
const joint = cluster.assembly.joints[0];
const host = cluster.tiles.find((tile: { instanceId: string }) => tile.instanceId === joint.hostInstanceId);
const guest = cluster.tiles.find((tile: { instanceId: string }) => tile.instanceId === joint.guestInstanceId);
const meshes = new Map(loadArchetypeMeshes().map((mesh) => [mesh.archetypeId, mesh]));
const samples = collectInterface(meshes.get(host.archetypeId)!, meshes.get(guest.archetypeId)!, host.pose, guest.pose, SKILL6_PATCH_DEFAULTS.regionMinArea);
const normal = samples.reduce((sum, sample) => sum.map((value, axis) => value + Math.abs(sample.guest[axis] - sample.host[axis])), [0, 0, 0]);
const across = normal.indexOf(Math.max(...normal));
const [u, v] = [0, 1, 2].filter((axis) => axis !== across);
const round = (value: number) => Math.round(value * 1000) / 1000;

writeFileSync(path.join(directory, "joint-diagram.json"), `${JSON.stringify({
  clusterId: id,
  host: host.archetypeId,
  guest: guest.archetypeId,
  direction: joint.direction,
  placement: joint.placement,
  classification: joint.classification,
  residualGap: round(joint.contact.residualGap),
  contactArea: round(joint.contact.contactArea),
  plane: ["XYZ"[u], "XYZ"[v]],
  sampleCount: samples.length,
  patch: {
    radius: joint.patch.radius,
    cell: joint.patch.cell,
    extent: joint.patch.footprint.extent.map(round),
    volume: round(joint.patch.volume),
    bodies: joint.patch.components,
  },
  union: { solids: cluster.assembly.union.components, cavities: cluster.assembly.union.cavities },
  refined: {
    solids: cluster.assembly.refined.components,
    seamCreasesBefore: cluster.assembly.refined.seamSharpEdgesBefore,
    seamCreasesAfter: cluster.assembly.refined.seamSharpEdgesAfter,
  },
  lift: round(cluster.assembly.ground.lift),
}, null, 2)}\n`);
console.log(`${id}: ${samples.length} samples`);
