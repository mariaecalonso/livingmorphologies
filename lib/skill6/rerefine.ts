/**
 * Re-smooth stored assemblies in place. Placement, patches, and the raw union stay.
 * The previous mesh file is copied to data/skill6/assembled/history before the refined surface is replaced.
 * Run: npx tsx lib/skill6/rerefine.ts [clusterId ...]
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { ClusterRecord } from "./contract";
import { ASSEMBLY_DIRECTORY, readStoredAssemblies, supersedeStoredAssembly } from "./catalog";
import { encodeMesh } from "./assembly";
import { solidSummary, type PatchMesh } from "./patch";
import { refineClusterMesh } from "./refine-mesh";

function decode(encoded: { positions: string; indices: string }): PatchMesh {
  const positions = new Uint8Array(Buffer.from(encoded.positions, "base64"));
  const indices = new Uint8Array(Buffer.from(encoded.indices, "base64"));
  return { positions: new Float32Array(positions.buffer), indices: new Uint32Array(indices.buffer) };
}

async function main() {
  const only = process.argv.slice(2);
  if (only.length === 0) throw new Error("Name the clusters to re-refine.");
  let records = readStoredAssemblies();
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  for (const id of only) {
    const current = records.find((record) => record.id === id);
    if (!current?.assembly) throw new Error(`${id} has no stored assembly`);
    const file = path.join(process.cwd(), current.assembly.meshFile);
    const stored = JSON.parse(readFileSync(file, "utf8")) as { id: string; raw: { positions: string; indices: string }; refined: unknown; patches: { positions: string; indices: string }[] };
    const before = await solidSummary(decode(stored.refined as { positions: string; indices: string }));
    const refined = refineClusterMesh(decode(stored.raw), stored.patches.map((patch) => decode(patch)));
    const after = await solidSummary(refined.mesh);
    const replacement: ClusterRecord = {
      ...current,
      assembly: {
        ...current.assembly,
        refined: {
          ...current.assembly.refined,
          parameters: {
            ...current.assembly.refined.parameters,
            penetrations: refined.penetrations,
            grazes: refined.grazes,
            verticesRestored: refined.verticesRestored,
          },
          cavitiesFilled: refined.cavitiesFilled,
          status: after.status,
          components: after.components,
          cavities: after.cavities,
          volume: after.volume,
          triangles: refined.mesh.indices.length / 3,
          minZ: refined.minZ,
          maxShift: refined.maxShift,
          meanShift: refined.meanShift,
          sharpEdgesBefore: refined.sharpEdgesBefore,
          sharpEdgesAfter: refined.sharpEdgesAfter,
          seamSharpEdgesBefore: refined.seamSharpEdgesBefore,
          seamSharpEdgesAfter: refined.seamSharpEdgesAfter,
        },
      },
    };
    records = supersedeStoredAssembly(records, replacement, stamp);
    writeFileSync(file, JSON.stringify({ ...stored, refined: encodeMesh(refined.mesh) }));
    const index = JSON.parse(readFileSync(path.join(ASSEMBLY_DIRECTORY, "index.json"), "utf8")) as { clusters: ClusterRecord[] };
    writeFileSync(path.join(ASSEMBLY_DIRECTORY, "index.json"), JSON.stringify({ ...index, clusters: records }, null, 1));
    console.log([
      id,
      `volume ${before.volume?.toFixed(1)} → ${after.volume?.toFixed(1)}`,
      `${after.components} solid · ${after.cavities} cavities · ${after.status}`,
      `penetrations ${refined.penetrations} · grazes ${refined.grazes} · max ${refined.maxPenetration.toFixed(3)}`,
      `restored ${refined.verticesRestored} · seam creases ${refined.seamSharpEdgesBefore} → ${refined.seamSharpEdgesAfter}`,
      `min Z ${refined.minZ.toFixed(4)}`,
    ].join(" · "));
  }
}

main();
