/** Temporary lift diagnosis. Writes nothing. */
import { readFileSync } from "node:fs";
import path from "node:path";
import { poseBounds } from "../geometry";
import { posedMesh } from "../patch";
import { loadArchetypeMeshes } from "../source";

const directory = path.join(process.cwd(), "data/skill6/experiments/initial-clustering-coverage");
const report = JSON.parse(readFileSync(path.join(directory, "index.json"), "utf8"));
const byId = new Map(loadArchetypeMeshes().map((mesh) => [mesh.archetypeId, mesh]));
const minZ = (positions: Float32Array) => {
  let low = Infinity;
  for (let index = 2; index < positions.length; index += 3) low = Math.min(low, positions[index]);
  return low;
};
for (const id of process.argv.slice(2)) {
  const record = report.records.find((item: { id: string }) => item.id === id);
  const lift = record.assembly.ground.lift;
  console.log(id, "lift", lift.toFixed(3));
  for (const tile of record.tiles) {
    const mesh = byId.get(tile.archetypeId)!;
    const full = minZ(posedMesh(mesh, tile.pose).positions);
    const tight = poseBounds(mesh.tight, tile.pose).min[2];
    console.log(`  ${tile.instanceId} ${tile.name} full minZ ${full.toFixed(3)} tight minZ ${tight.toFixed(3)} up ${tile.pose.basis[8].toFixed(2)}`);
  }
  const stored = JSON.parse(readFileSync(path.join(directory, `${id}.mesh.json`), "utf8"));
  stored.patches.forEach((patch: { positions: string }, index: number) => {
    const bytes = new Uint8Array(Buffer.from(patch.positions, "base64"));
    const joint = record.assembly.joints.find((item: { patch: { meshIndex: number | null } | null }) => item.patch?.meshIndex === index);
    console.log(`  patch ${index} ${joint?.hostInstanceId}->${joint?.guestInstanceId} ${joint?.direction} minZ before lift ${(minZ(new Float32Array(bytes.buffer)) - lift).toFixed(3)}`);
  });
}
