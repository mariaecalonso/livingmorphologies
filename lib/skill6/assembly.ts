/**
 * Assembled output for an accepted cluster.
 * The rigid record stays as it was. Patches, the union, and the refined surface are separate derivatives.
 */
import {
  SKILL6_ASSEMBLY_CONTRACT,
  SKILL6_PARAMETERS,
  SKILL6_PATCH_DEFAULTS,
  type ClusterAssembly,
  type ClusterGraph,
  type ClusterJoint,
  type ClusterRecord,
  type ContactRelation,
  type GrowthStep,
  type JointBounds,
  type JointClassification,
} from "./contract";
import { growthDirection } from "./grow";
import {
  blendPatch,
  collectInterface,
  elevatePose,
  measurePatch,
  posedMesh,
  solidSummary,
  translateMesh,
  unionSolids,
  type PatchMesh,
} from "./patch";
import { CLUSTER_REFINEMENT, refineClusterMesh } from "./refine-mesh";
import type { ArchetypeMesh } from "./source";

export type AssemblyMeshes = { raw: PatchMesh | null; refined: PatchMesh | null; patches: PatchMesh[] };

/** Direct contact needs the surface-contact residual and an overlap inside the Boolean allowance. Otherwise a patch is attempted. */
export function directContact(contact: ContactRelation): boolean {
  return contact.residualGap != null
    && contact.residualGap <= SKILL6_PARAMETERS.targetGap
    && Math.abs(contact.overlapVolume ?? 0) <= 0.05;
}

function boundsOf(mesh: PatchMesh): JointBounds {
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (let index = 0; index < mesh.positions.length; index += 3) {
    for (let axis = 0; axis < 3; axis += 1) {
      min[axis] = Math.min(min[axis], mesh.positions[index + axis]);
      max[axis] = Math.max(max[axis], mesh.positions[index + axis]);
    }
  }
  return {
    min,
    max,
    extent: [max[0] - min[0], max[1] - min[1], max[2] - min[2]],
    center: [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2],
  };
}

function lowestZ(meshes: readonly PatchMesh[]): number {
  let lowest = Infinity;
  for (const mesh of meshes) for (let index = 2; index < mesh.positions.length; index += 3) lowest = Math.min(lowest, mesh.positions[index]);
  return lowest;
}

function graphOf(record: ClusterRecord, joints: readonly ClusterJoint[]): { graph: ClusterGraph; growth: GrowthStep[] } {
  const parent = new Map<string, string | null>();
  const depth = new Map<string, number>();
  const children = new Map<string, string[]>();
  const degree = new Map<string, number>();
  for (const tile of record.tiles) {
    children.set(tile.instanceId, []);
    degree.set(tile.instanceId, 0);
  }
  for (const joint of joints) {
    degree.set(joint.hostInstanceId, (degree.get(joint.hostInstanceId) ?? 0) + 1);
    degree.set(joint.guestInstanceId, (degree.get(joint.guestInstanceId) ?? 0) + 1);
  }
  const growth: GrowthStep[] = record.tiles.map((tile, step) => {
    const joint = joints.find((item) => item.primary && item.guestInstanceId === tile.instanceId) ?? null;
    const host = joint?.hostInstanceId ?? null;
    parent.set(tile.instanceId, host);
    const level = host == null ? 0 : (depth.get(host) ?? 0) + 1;
    depth.set(tile.instanceId, level);
    if (host) children.get(host)?.push(tile.instanceId);
    return {
      step,
      instanceId: tile.instanceId,
      archetypeId: tile.archetypeId,
      hostInstanceId: host,
      direction: joint?.direction ?? null,
      placement: joint ? joint.placement : "seed",
      depth: level,
    };
  });
  const nodes = record.tiles.map((tile) => ({
    instanceId: tile.instanceId,
    parent: parent.get(tile.instanceId) ?? null,
    children: children.get(tile.instanceId) ?? [],
    depth: depth.get(tile.instanceId) ?? 0,
    degree: degree.get(tile.instanceId) ?? 0,
  }));
  return {
    growth,
    graph: {
      nodes,
      edges: joints.map((joint) => ({ host: joint.hostInstanceId, guest: joint.guestInstanceId, primary: joint.primary, classification: joint.classification })),
      branchPoints: nodes.filter((node) => node.children.length >= 2).map((node) => node.instanceId),
      leaves: nodes.filter((node) => node.children.length === 0).map((node) => node.instanceId),
      maxDepth: nodes.reduce((max, node) => Math.max(max, node.depth), 0),
    },
  };
}

export async function assembleCluster(
  record: ClusterRecord,
  meshes: readonly ArchetypeMesh[],
  meshFile: string,
  settings: { radius: number; cell: number; maxCells: number; largestOnly: boolean; spacingReach?: boolean; bodyFraction?: number; regionMinArea?: number } = SKILL6_PATCH_DEFAULTS,
): Promise<{ assembly: ClusterAssembly; meshes: AssemblyMeshes }> {
  const started = Date.now();
  const byId = new Map(meshes.map((mesh) => [mesh.archetypeId, mesh]));
  const tileOf = new Map(record.tiles.map((tile) => [tile.instanceId, tile]));
  const placed = record.tiles.map((tile) => {
    const mesh = byId.get(tile.archetypeId);
    if (!mesh) throw new Error(`Missing archetype ${tile.archetypeId}`);
    return posedMesh(mesh, tile.pose);
  });

  const joints: ClusterJoint[] = [];
  const patchMeshes: PatchMesh[] = [];
  const seenGuests = new Set<string>();
  for (const contact of record.contacts) {
    const host = tileOf.get(contact.hostId);
    const guest = tileOf.get(contact.guestId);
    const hostMesh = host ? byId.get(host.archetypeId) : undefined;
    const guestMesh = guest ? byId.get(guest.archetypeId) : undefined;
    if (!host || !guest || !hostMesh || !guestMesh) continue;
    const primary = !seenGuests.has(guest.instanceId);
    seenGuests.add(guest.instanceId);
    const direction = growthDirection(hostMesh, host.pose, guestMesh, guest.pose);
    const base = {
      id: `${host.instanceId}-${guest.instanceId}`,
      hostInstanceId: host.instanceId,
      guestInstanceId: guest.instanceId,
      hostArchetypeId: host.archetypeId,
      guestArchetypeId: guest.archetypeId,
      primary,
      direction,
      placement: direction === "+Z" || direction === "-Z" ? "stacked" as const : "lateral" as const,
      contact: {
        verdict: contact.verdict,
        residualGap: contact.residualGap,
        contactArea: contact.contactArea,
        normalAlignment: contact.normalAlignment,
        deepestCrossing: contact.deepestCrossing,
        overlapVolume: contact.overlapVolume,
      },
    };
    if (directContact(contact)) {
      joints.push({ ...base, classification: "direct-contact", patch: null, note: "Residual at or under 0.05 with overlap inside the Boolean allowance. No patch." });
      continue;
    }
    const samples = collectInterface(hostMesh, guestMesh, host.pose, guest.pose, settings.regionMinArea);
    const built = blendPatch(hostMesh, guestMesh, host.pose, guest.pose, samples, settings);
    const measure = built.mesh ? await measurePatch(hostMesh, guestMesh, host.pose, guest.pose, built.mesh) : null;
    const accepted = Boolean(built.mesh && measure?.oneSolid && measure.selfIntersections === 0);
    let meshIndex: number | null = null;
    if (accepted && built.mesh) {
      meshIndex = patchMeshes.length;
      patchMeshes.push(built.mesh);
    }
    joints.push({
      ...base,
      classification: accepted ? "patched-near-contact" : "failed-patch",
      patch: {
        method: "implicit-blend",
        radius: settings.radius,
        cell: settings.cell,
        meshIndex,
        samples: built.samples,
        triangles: measure?.triangles ?? 0,
        volume: measure?.volume ?? null,
        hostOverlap: measure?.hostOverlap ?? null,
        guestOverlap: measure?.guestOverlap ?? null,
        footprint: null,
        status: measure ? `${measure.patchStatus} / ${measure.joinedStatus}` : built.note,
        components: measure?.joinedComponents ?? null,
        cavities: measure?.joinedCavities ?? null,
        selfIntersections: measure?.selfIntersections ?? 0,
        oneSolid: measure?.oneSolid ?? false,
        buildMilliseconds: built.milliseconds,
        validationMilliseconds: measure?.milliseconds ?? 0,
      },
      note: accepted ? "Near-contact joined by a separate implicit patch. Not exact surface contact." : `Patch rejected: ${built.mesh ? "the blend did not join both tiles as one manifold solid" : built.note}`,
    });
  }
  const patchesDone = Date.now();

  const union = await unionSolids([...placed, ...patchMeshes]);
  const unionDone = Date.now();
  const minZBefore = union.mesh ? lowestZ([union.mesh]) : lowestZ([...placed, ...patchMeshes]);
  const lift = -minZBefore;
  const raw = union.mesh ? translateMesh(union.mesh, lift) : null;
  const seatedPatches = patchMeshes.map((mesh) => translateMesh(mesh, lift));
  for (const joint of joints) {
    if (joint.patch?.meshIndex != null) joint.patch.footprint = boundsOf(seatedPatches[joint.patch.meshIndex]);
  }
  const seatedParts = placed.map((mesh) => translateMesh(mesh, lift));
  const minZAfter = Math.min(raw ? lowestZ([raw]) : Infinity, lowestZ([...seatedParts, ...seatedPatches]));

  const refined = raw ? refineClusterMesh(raw, seatedPatches) : null;
  const refinedSolid = refined ? await solidSummary(refined.mesh) : { status: "not-run", components: null, cavities: null, volume: null };
  const refineDone = Date.now();

  const counts: Record<JointClassification, number> = { "direct-contact": 0, "patched-near-contact": 0, "failed-patch": 0 };
  for (const joint of joints) counts[joint.classification] += 1;
  const { graph, growth } = graphOf(record, joints);
  const assembly: ClusterAssembly = {
    contract: SKILL6_ASSEMBLY_CONTRACT,
    sourceClusterId: record.id,
    patchSettings: { ...settings },
    ground: { lift, minZBefore, minZAfter },
    seatedTiles: record.tiles.map((tile) => ({ instanceId: tile.instanceId, pose: elevatePose(tile.pose, lift) })),
    growth,
    joints,
    graph,
    counts,
    union: {
      status: union.rejected.length ? `${union.status}; ${union.rejected.length} parts refused` : union.status,
      components: union.components,
      cavities: union.cavities,
      volume: union.volume,
      triangles: raw ? raw.indices.length / 3 : 0,
      minZ: raw ? lowestZ([raw]) : minZAfter,
    },
    refined: {
      method: CLUSTER_REFINEMENT.method,
      parameters: {
        iterations: CLUSTER_REFINEMENT.iterations,
        lambda: CLUSTER_REFINEMENT.lambda,
        mu: CLUSTER_REFINEMENT.mu,
        seamReach: CLUSTER_REFINEMENT.seamReach,
        seamFade: CLUSTER_REFINEMENT.seamFade,
        baseWeight: CLUSTER_REFINEMENT.baseWeight,
        maxShift: CLUSTER_REFINEMENT.maxShift,
        floorShift: CLUSTER_REFINEMENT.floorShift,
        fillCavityVolume: CLUSTER_REFINEMENT.fillCavityVolume,
        penetrations: refined?.penetrations ?? 0,
        grazes: refined?.grazes ?? 0,
        maxPenetration: refined?.maxPenetration ?? 0,
        verticesRestored: refined?.verticesRestored ?? 0,
      },
      cavitiesFilled: refined?.cavitiesFilled ?? 0,
      status: refinedSolid.status,
      components: refinedSolid.components,
      cavities: refinedSolid.cavities,
      volume: refinedSolid.volume,
      triangles: refined ? refined.mesh.indices.length / 3 : 0,
      minZ: refined?.minZ ?? Infinity,
      maxShift: refined?.maxShift ?? 0,
      meanShift: refined?.meanShift ?? 0,
      sharpEdgesBefore: refined?.sharpEdgesBefore ?? 0,
      sharpEdgesAfter: refined?.sharpEdgesAfter ?? 0,
      seamSharpEdgesBefore: refined?.seamSharpEdgesBefore ?? 0,
      seamSharpEdgesAfter: refined?.seamSharpEdgesAfter ?? 0,
    },
    meshFile,
    milliseconds: { patches: patchesDone - started, union: unionDone - patchesDone, refine: refineDone - unionDone, total: refineDone - started },
  };
  return { assembly, meshes: { raw, refined: refined?.mesh ?? null, patches: seatedPatches } };
}

export function encodeMesh(mesh: PatchMesh | null) {
  if (!mesh) return null;
  return {
    positions: Buffer.from(mesh.positions.buffer, mesh.positions.byteOffset, mesh.positions.byteLength).toString("base64"),
    indices: Buffer.from(mesh.indices.buffer, mesh.indices.byteOffset, mesh.indices.byteLength).toString("base64"),
    triangles: mesh.indices.length / 3,
  };
}
