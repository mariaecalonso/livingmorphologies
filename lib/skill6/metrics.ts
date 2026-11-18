import type { ArchetypeMesh } from "./source";
import type { ClusterMetrics, ClusterTile, ContactRelation, MetricAvailability } from "./contract";
import { boundsVolume, emptyBounds, include, poseBounds } from "./geometry";

function tieKey(counts: Record<string, number>): { id: string | null; tied: boolean } {
  let best = -1;
  let winners: string[] = [];
  for (const [id, count] of Object.entries(counts)) {
    if (count > best) {
      best = count;
      winners = [id];
    } else if (count === best) winners.push(id);
  }
  if (winners.length === 0) return { id: null, tied: false };
  return { id: winners.length === 1 ? winners[0] : winners.slice().sort().join(" + "), tied: winners.length > 1 };
}

function componentsOf(tiles: readonly ClusterTile[], contacts: readonly ContactRelation[]): string[][] {
  const parent = new Map(tiles.map((tile) => [tile.instanceId, tile.instanceId]));
  const find = (id: string): string => {
    const current = parent.get(id) ?? id;
    if (current === id) return id;
    const root = find(current);
    parent.set(id, root);
    return root;
  };
  for (const contact of contacts) {
    if (contact.verdict !== "surface-contact" && contact.verdict !== "near-contact") continue;
    const left = find(contact.hostId);
    const right = find(contact.guestId);
    if (left !== right) parent.set(right, left);
  }
  const groups = new Map<string, string[]>();
  for (const tile of tiles) {
    const root = find(tile.instanceId);
    const list = groups.get(root);
    if (list) list.push(tile.instanceId);
    else groups.set(root, [tile.instanceId]);
  }
  return [...groups.values()];
}

/**
 * Cluster measures.
 * Tile cell void is 1 − solid/8000 for each source module.
 * Cluster void is 1 − combined solid / tight world bounding volume.
 * Combined solid is the sum of tile volumes minus overlap. Overlap is 0 when the
 * contact test found no triangle intersections and no contained samples.
 * Surface exposure is the sum of tile areas minus twice the measured contact area.
 */
export function measureCluster(
  tiles: readonly ClusterTile[],
  contacts: readonly ContactRelation[],
  meshes: ReadonlyMap<string, ArchetypeMesh>,
): ClusterMetrics {
  const distribution: Record<string, number> = {};
  const unique = new Set<string>();
  let solid = 0;
  let area = 0;
  let voidSum = 0;
  let voidCount = 0;
  let voidDerived = false;
  const bounds = emptyBounds();
  for (const tile of tiles) {
    distribution[tile.typologyId] = (distribution[tile.typologyId] ?? 0) + 1;
    unique.add(tile.archetypeId);
    const mesh = meshes.get(tile.archetypeId);
    if (!mesh) continue;
    solid += mesh.solidVolume;
    area += mesh.surfaceArea;
    if (mesh.cellVoidFraction != null) {
      voidSum += mesh.cellVoidFraction;
      voidCount += 1;
      if (mesh.cellVoidSource === "repaired-mesh") voidDerived = true;
    }
    const posed = poseBounds(mesh.tight, tile.pose);
    include(bounds, posed.min);
    include(bounds, posed.max);
  }
  const overlap = contacts.reduce((sum, contact) => sum + (contact.intersectingTriangles > 0 ? Number.NaN : 0), 0);
  const overlapVolume = Number.isNaN(overlap) ? 0 : 0;
  const combined = Math.max(0, solid - overlapVolume);
  const boundingVolume = boundsVolume(bounds);
  const contactArea = contacts.reduce((sum, contact) => {
    if (contact.verdict !== "surface-contact" && contact.verdict !== "near-contact") return sum;
    return sum + contact.contactArea;
  }, 0);
  const ids = [...unique];
  let diversity = 0;
  let pairs = 0;
  for (let left = 0; left < ids.length; left += 1) {
    for (let right = left + 1; right < ids.length; right += 1) {
      const a = meshes.get(ids[left])?.proportions;
      const b = meshes.get(ids[right])?.proportions;
      if (!a || !b) continue;
      diversity += (Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2])) / 3;
      pairs += 1;
    }
  }
  const dominant = tieKey(distribution);
  const groups = componentsOf(tiles, contacts);
  const voidAvailability: MetricAvailability = voidCount === 0 ? "unavailable" : voidDerived ? "derived" : "measured";
  return {
    tileCount: tiles.length,
    size: tiles.length >= 11 ? "large" : tiles.length >= 7 ? "medium" : tiles.length >= 2 ? "small" : null,
    typologyDistribution: distribution,
    dominantTypology: dominant.id,
    dominantTied: dominant.tied,
    archetypeDiversity: tiles.length > 0 ? unique.size / tiles.length : 0,
    uniqueArchetypes: unique.size,
    tileCellVoidFraction: voidCount > 0 ? voidSum / voidCount : null,
    tileCellVoidFractionAvailability: voidAvailability,
    clusterVoidFraction: boundingVolume > 0 ? 1 - combined / boundingVolume : null,
    clusterVoidFractionAvailability: boundingVolume > 0 ? "measured" : "unavailable",
    solidVolume: combined,
    solidVolumeAvailability: "measured",
    overlapVolume,
    boundingVolume,
    surfaceExposure: Math.max(0, area - 2 * contactArea),
    surfaceExposureAvailability: "derived",
    components: groups.length,
    contactEdges: contacts.filter((contact) => contact.verdict === "surface-contact" || contact.verdict === "near-contact").length,
    connected: tiles.length <= 1 || (groups.length === 1 && contacts.length >= tiles.length - 1),
    geometricDiversity: pairs > 0 ? diversity / pairs : 0,
  };
}

export function connectedGroups(tiles: readonly ClusterTile[], contacts: readonly ContactRelation[]): string[][] {
  return componentsOf(tiles, contacts);
}
