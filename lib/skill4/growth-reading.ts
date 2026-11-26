/**
 * Read realized growth from stored tile poses and tree edges.
 * This does not relabel a cluster to match its intended preference.
 */

export type GrowthCharacter = "linear" | "angular" | "branching" | "vertical";

export type GrowthReading = {
  primary: GrowthCharacter;
  secondary: GrowthCharacter[];
  horizontalEdges: number;
  verticalEdges: number;
  turns: number;
  maxDegree: number;
  branchNodes: number;
  longestPath: number;
  extent: { x: number; y: number; z: number };
};

type Pose = { instanceId: string; transform: { x: number; y: number; z: number } };
type Edge = { tileAId: string; tileBId: string };

function axisOf(dx: number, dy: number, dz: number): "x" | "y" | "z" {
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  const az = Math.abs(dz);
  if (ay >= ax && ay >= az && ay > 4) return "y";
  return ax >= az ? "x" : "z";
}

export function readGrowth(tiles: readonly Pose[], connections: readonly Edge[]): GrowthReading {
  const byId = new Map(tiles.map((tile) => [tile.instanceId, tile]));
  const degree = new Map<string, number>();
  const edges: { a: string; b: string; axis: "x" | "y" | "z"; dir: { x: number; y: number; z: number } }[] = [];
  for (const connection of connections) {
    const a = byId.get(connection.tileAId);
    const b = byId.get(connection.tileBId);
    if (!a || !b) continue;
    const dx = b.transform.x - a.transform.x;
    const dy = b.transform.y - a.transform.y;
    const dz = b.transform.z - a.transform.z;
    const length = Math.hypot(dx, dy, dz) || 1;
    edges.push({
      a: connection.tileAId,
      b: connection.tileBId,
      axis: axisOf(dx, dy, dz),
      dir: { x: dx / length, y: dy / length, z: dz / length },
    });
    degree.set(connection.tileAId, (degree.get(connection.tileAId) ?? 0) + 1);
    degree.set(connection.tileBId, (degree.get(connection.tileBId) ?? 0) + 1);
  }
  const degrees = [...degree.values()];
  const maxDegree = degrees.length ? Math.max(...degrees) : 0;
  const branchNodes = degrees.filter((value) => value >= 3).length;
  const verticalEdges = edges.filter((edge) => edge.axis === "y").length;
  const horizontalEdges = edges.length - verticalEdges;
  const xs = tiles.map((tile) => tile.transform.x);
  const ys = tiles.map((tile) => tile.transform.y);
  const zs = tiles.map((tile) => tile.transform.z);
  const extent = {
    x: xs.length ? Math.max(...xs) - Math.min(...xs) : 0,
    y: ys.length ? Math.max(...ys) - Math.min(...ys) : 0,
    z: zs.length ? Math.max(...zs) - Math.min(...zs) : 0,
  };

  let turns = 0;
  for (const [id, count] of degree) {
    if (count !== 2) continue;
    const incident = edges.filter((edge) => edge.a === id || edge.b === id);
    if (incident.length !== 2) continue;
    const outward = incident.map((edge) => {
      const fromA = edge.a === id;
      return {
        axis: edge.axis,
        x: fromA ? edge.dir.x : -edge.dir.x,
        y: fromA ? edge.dir.y : -edge.dir.y,
        z: fromA ? edge.dir.z : -edge.dir.z,
      };
    });
    const [left, right] = outward;
    if (!left || !right) continue;
    if (left.axis === "y" || right.axis === "y") {
      if (left.axis !== right.axis) turns += 1;
      continue;
    }
    const dot = left.x * right.x + left.y * right.y + left.z * right.z;
    if (dot < 0.75) turns += 1;
  }

  let longestPath = tiles.length;
  if (connections.length > 0 && maxDegree <= 2) longestPath = tiles.length;
  if (branchNodes > 0) {
    const adj = new Map<string, string[]>();
    for (const edge of edges) {
      adj.set(edge.a, [...(adj.get(edge.a) ?? []), edge.b]);
      adj.set(edge.b, [...(adj.get(edge.b) ?? []), edge.a]);
    }
    const farthest = (start: string) => {
      const seen = new Set([start]);
      let layer = [start];
      let dist = 0;
      while (layer.length) {
        const next: string[] = [];
        for (const node of layer) {
          for (const other of adj.get(node) ?? []) {
            if (seen.has(other)) continue;
            seen.add(other);
            next.push(other);
          }
        }
        if (next.length === 0) break;
        layer = next;
        dist += 1;
      }
      return { node: layer[0] ?? start, dist };
    };
    const first = farthest(tiles[0]?.instanceId ?? "");
    longestPath = farthest(first.node).dist + 1;
  }

  const traits = new Set<GrowthCharacter>();
  if (branchNodes > 0) traits.add("branching");
  if (verticalEdges > 0 && extent.y >= 12) traits.add("vertical");
  if (turns > 0) traits.add("angular");
  if (turns === 0 && branchNodes === 0 && horizontalEdges >= verticalEdges) traits.add("linear");

  let primary: GrowthCharacter;
  if (tiles.length <= 2) {
    primary = verticalEdges > 0 ? "vertical" : "linear";
  } else if (branchNodes > 0) {
    primary = "branching";
  } else if (turns > 0 && horizontalEdges > 0) {
    primary = "angular";
  } else if (verticalEdges > horizontalEdges) {
    primary = "vertical";
  } else {
    primary = "linear";
  }
  traits.delete(primary);
  return {
    primary,
    secondary: [...traits],
    horizontalEdges,
    verticalEdges,
    turns,
    maxDegree,
    branchNodes,
    longestPath,
    extent,
  };
}
