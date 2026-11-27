import { existsSync, readFileSync } from "node:fs";
import site from "@/data/skill5/herald-site.json";
import { alignRingToVeinPaths } from "@/components/site/site-network-vein-draw";
import type { IsoMesh } from "@/lib/scan/isomesh";
import { calmSurface } from "@/lib/skill4/cluster-void";
import { finalClusterMeshPath, isFinalClusterCategory } from "@/lib/skill4/final-cluster-placement";
import { selectedClusterAssembly, type ClusterAssemblyRecord } from "@/lib/skill5/cluster-assemblies";
import {
  generateNetworkConstrainedVoid,
  type PositionedSolid,
  type VoidDomain,
} from "@/lib/skill5/network-constrained-void";
import { buildNetworkDomain } from "@/lib/skill5/network-void-domain";
import { detectPockets, type NetworkBranch } from "@/lib/skill5/pockets";
import { poseFinishedMesh, type PlacedCluster } from "@/lib/skill5/placed-cluster";
import type { SiteContext, XZ } from "@/lib/skill5/site-model";
import { polygonAreaSqFt, polygonCentroid, type ZonePoint } from "@/lib/skill5/zoning";

const herald = site as SiteContext;

/**
 * Cluster Integration → Void.
 * Habitable open mass inside the selected network. The outer network shell
 * (aligned to the same drawn veins) is the physical plan boundary — void
 * cannot cross it. Interior network lines do not split the void.
 * Vertical extent follows local cluster heights — not one flat ceiling.
 */
export const PLACEMENT_VOID_CONTRACT = "skill5-placement-network-void-v1" as const;

/**
 * Keep-out from the drawn outer network ink. 0 = the outer shell itself is the
 * physical void wall (required — inset rings were drifting past the ink).
 */
export const NETWORK_LINE_OFFSET_FT = 0;

/** Finer cells keep ridge curves; 4–6 ft washed the void into one smooth blob. */
export const PLACEMENT_VOID_CELL_FT = 2.5;
/** Kept for the API contract; open-domain acceptance does not use shelter. */
export const PLACEMENT_VOID_SHELTER_FT = 12;
/** Clear air between void and solids — always a small gap, never contact. */
export const PLACEMENT_VOID_MIN_GAP_FT = 2.5;
/** Dense solid casting — sealed shells so void cannot leak into cluster interiors. */
export const PLACEMENT_VOID_TRIANGLE_STEP = 1;
/** Hard mesh clearance after calm — one cell of air; void skin must never touch solids. */
export const PLACEMENT_VOID_HUG_GAP_FT = 2.5;
/** Never nibble into solids — cavities must stay as solid footprints in the void. */
export const PLACEMENT_VOID_NIBBLE_CELLS = 0;
/** One cell (~2.5 ft) around solids in the voxel mask — first line of no-touch. */
export const PLACEMENT_VOID_SOLID_CLEARANCE_CELLS = 1;
/**
 * Extra solid-field limit inside the network stop.
 * 0 = fill every open cell in the domain (open courtyards stay void).
 */
export const PLACEMENT_VOID_MORPHOLOGY_REACH_FT = 0;

export type PlacementVoidReport = {
  contract: typeof PLACEMENT_VOID_CONTRACT;
  assemblyId: string;
  selectedNetworkId: string;
  solidCount: number;
  pocketCount: number;
  offsetFt: number;
  cell: number;
  shelter: number;
  minimumGap: number;
  voidCubicFeet: number;
  occupiedCubicFeet: number;
  voidComponents: number;
  /** Smallest measured distance from void skin to a solid sample after clearance. */
  minSolidGapFt: number;
  processing: "dense" | "chunked";
  elapsedMs: number;
  voidMesh: IsoMesh;
};

type PackedMesh = { triangles?: number; positions?: string; indices?: string } | null;

export function generatePlacementNetworkVoid(input?: {
  assembly?: ClusterAssemblyRecord | null;
  branches?: readonly NetworkBranch[];
  offsetFt?: number;
  cell?: number;
  shelter?: number;
  minimumGap?: number;
  triangleStep?: number;
}): PlacementVoidReport {
  const started = Date.now();
  const assembly = input?.assembly ?? selectedClusterAssembly();
  if (!assembly) throw new Error("No selected cluster assembly. Save one from Cluster Placement.");
  if (assembly.occupancy.length < 2) throw new Error("Network void needs at least two placed clusters.");

  const branches = input?.branches ?? [];
  if (branches.length === 0) throw new Error("The selected network has no branches.");

  const offsetFt = input?.offsetFt ?? NETWORK_LINE_OFFSET_FT;
  const cell = input?.cell ?? PLACEMENT_VOID_CELL_FT;
  const shelter = input?.shelter ?? PLACEMENT_VOID_SHELTER_FT;
  const minimumGap = input?.minimumGap ?? PLACEMENT_VOID_MIN_GAP_FT;
  const triangleStep = input?.triangleStep ?? PLACEMENT_VOID_TRIANGLE_STEP;

  const solids = assembly.occupancy.flatMap((record) => {
    const solid = loadPlacedSolid(record);
    return solid ? [solid] : [];
  });
  if (solids.length < 2) throw new Error("Fewer than two cluster meshes could be posed on site.");

  const { domain, boundaryRings } = buildInsetNetworkDomain(branches, solids, offsetFt, assembly.selectedNetworkId);
  const result = generateNetworkConstrainedVoid({
    solids,
    domain,
    clearance: { shelter, minimumGap },
    /** Keep tiny flecks out; the open pocket mass stays as one (or a few) large volumes. */
    minimumComponent: cell * cell * cell * 8,
    cell,
    triangleStep,
    acceptance: "open-domain",
    /** Void top and base follow nearby cluster heights — not one flat ceiling. */
    followSolidHeights: true,
    nibbleSolidCells: PLACEMENT_VOID_NIBBLE_CELLS,
    solidClearanceCells: PLACEMENT_VOID_SOLID_CLEARANCE_CELLS,
    /** Only when > 0 — otherwise open domain keeps every empty courtyard. */
    ...(PLACEMENT_VOID_MORPHOLOGY_REACH_FT > 0
      ? { solidMorphologyCells: Math.round(PLACEMENT_VOID_MORPHOLOGY_REACH_FT / cell) }
      : {}),
  });

  const voidMesh = fluidVoidMesh(result.voidMesh, cell, solids, boundaryRings);
  const minSolidGapFt = measureMinSolidGap(voidMesh, solids, cell);

  return {
    contract: PLACEMENT_VOID_CONTRACT,
    assemblyId: assembly.assemblyId,
    selectedNetworkId: assembly.selectedNetworkId,
    solidCount: solids.length,
    pocketCount: domain.parts?.length ?? 0,
    offsetFt,
    cell,
    shelter,
    minimumGap,
    voidCubicFeet: Math.round(result.voidCubicFeet),
    occupiedCubicFeet: Math.round(result.occupiedCubicFeet),
    voidComponents: result.voidComponents,
    minSolidGapFt,
    processing: result.processing,
    elapsedMs: Date.now() - started,
    voidMesh,
  };
}

/**
 * Weld → calm → solid repel → clip to network boundary (final).
 * The boundary ring is the physical plan wall from the outer network shell.
 */
function fluidVoidMesh(
  mesh: IsoMesh,
  cell: number,
  solids: readonly PositionedSolid[],
  boundaryRings: readonly (readonly ZonePoint[])[] = [],
): IsoMesh {
  if (!(mesh.triangles > 4)) return mesh;
  const welded = weldVoidVertices(mesh);
  if (!(welded.triangles > 4)) return mesh;
  const calmed = calmSurface(welded);
  if (!(calmed.triangles > 4)) return welded;
  const once = repelFromSolids(calmed, solids, cell);
  const twice = repelFromSolids(once, solids, cell);
  if (!boundaryRings.length) return twice;
  return clipToNetworkBoundary(twice, boundaryRings);
}

/**
 * Physical boundary clip against the drawn outer network shell.
 * Outside verts snap onto the ink; chords that bridge past concave bays are
 * collapsed; faces that still paint past the shell are dropped.
 */
function clipToNetworkBoundary(
  mesh: IsoMesh,
  boundaries: readonly (readonly ZonePoint[])[],
): IsoMesh {
  if (!boundaries.length) return mesh;
  const positions = new Float32Array(mesh.positions);
  /** Snap onto the shell, then a hair inside so we never rest past the ink. */
  const INSET_FT = 0.2;

  const projectInside = (x: number, z: number) => {
    let bestDist = Number.POSITIVE_INFINITY;
    let bestX = x;
    let bestZ = z;
    let bestRing: (readonly ZonePoint[]) | null = null;
    let bestEx = 1;
    let bestEz = 0;
    for (const ring of boundaries) {
      if (ring.length < 3) continue;
      const hit = closestOnRing(x, z, ring);
      if (hit.dist >= bestDist) continue;
      bestDist = hit.dist;
      bestX = hit.x;
      bestZ = hit.z;
      bestRing = ring;
      bestEx = hit.ex;
      bestEz = hit.ez;
    }
    if (!bestRing) return { x: bestX, z: bestZ };
    const insideOf = (px: number, pz: number) => {
      for (const ring of boundaries) {
        if (ring.length >= 3 && pointInRing(px, pz, ring)) return true;
      }
      return false;
    };
    /** Try both edge normals, then walk toward the ring centroid until inside. */
    const candidates: Array<{ x: number; z: number }> = [
      { x: bestX - bestEz * INSET_FT, z: bestZ + bestEx * INSET_FT },
      { x: bestX + bestEz * INSET_FT, z: bestZ - bestEx * INSET_FT },
    ];
    for (const candidate of candidates) {
      if (insideOf(candidate.x, candidate.z)) return candidate;
    }
    const center = polygonCentroid(bestRing);
    for (let t = 0.05; t <= 1; t += 0.05) {
      const px = bestX + (center.x - bestX) * t;
      const pz = bestZ + (center.z - bestZ) * t;
      if (insideOf(px, pz)) return { x: px, z: pz };
    }
    return { x: bestX, z: bestZ };
  };

  const snapOutside = (x: number, z: number) => {
    for (const ring of boundaries) {
      if (ring.length >= 3 && pointInRing(x, z, ring)) return null;
    }
    return projectInside(x, z);
  };

  const hardSnapAll = () => {
    for (let i = 0; i < positions.length; i += 3) {
      const snapped = snapOutside(positions[i]!, positions[i + 2]!);
      if (!snapped) continue;
      positions[i] = snapped.x;
      positions[i + 2] = snapped.z;
    }
  };

  const indices = mesh.indices;
  for (let pass = 0; pass < 6; pass += 1) {
    hardSnapAll();
    for (let t = 0; t < indices.length; t += 3) {
      const corners = [indices[t]! * 3, indices[t + 1]! * 3, indices[t + 2]! * 3];
      for (let e = 0; e < 3; e += 1) {
        const ia = corners[e]!;
        const ib = corners[(e + 1) % 3]!;
        const mx = (positions[ia]! + positions[ib]!) * 0.5;
        const mz = (positions[ia + 2]! + positions[ib + 2]!) * 0.5;
        const mid = snapOutside(mx, mz);
        if (!mid) continue;
        /** Chord across a concave bay — pull both ends onto the bay, then hard-snap. */
        for (const ix of [ia, ib]) {
          positions[ix] = positions[ix]! * 0.2 + mid.x * 0.8;
          positions[ix + 2] = positions[ix + 2]! * 0.2 + mid.z * 0.8;
          const snapped = snapOutside(positions[ix]!, positions[ix + 2]!);
          if (snapped) {
            positions[ix] = snapped.x;
            positions[ix + 2] = snapped.z;
          }
        }
      }
      const cx =
        (positions[corners[0]!]! + positions[corners[1]!]! + positions[corners[2]!]!) / 3;
      const cz =
        (positions[corners[0]! + 2]! + positions[corners[1]! + 2]! + positions[corners[2]! + 2]!) /
        3;
      const center = snapOutside(cx, cz);
      if (!center) continue;
      for (const ix of corners) {
        positions[ix] = positions[ix]! * 0.3 + center.x * 0.7;
        positions[ix + 2] = positions[ix + 2]! * 0.3 + center.z * 0.7;
        const snapped = snapOutside(positions[ix]!, positions[ix + 2]!);
        if (snapped) {
          positions[ix] = snapped.x;
          positions[ix + 2] = snapped.z;
        }
      }
    }
  }
  hardSnapAll();

  /**
   * Drop faces that still bridge past the ink — verts on the shell can leave a
   * triangle chord outside a concave network bay.
   */
  const kept: number[] = [];
  for (let t = 0; t < indices.length; t += 3) {
    const ia = indices[t]! * 3;
    const ib = indices[t + 1]! * 3;
    const ic = indices[t + 2]! * 3;
    const samples: Array<[number, number]> = [
      [
        (positions[ia]! + positions[ib]! + positions[ic]!) / 3,
        (positions[ia + 2]! + positions[ib + 2]! + positions[ic + 2]!) / 3,
      ],
      [(positions[ia]! + positions[ib]!) * 0.5, (positions[ia + 2]! + positions[ib + 2]!) * 0.5],
      [(positions[ib]! + positions[ic]!) * 0.5, (positions[ib + 2]! + positions[ic + 2]!) * 0.5],
      [(positions[ic]! + positions[ia]!) * 0.5, (positions[ic + 2]! + positions[ia + 2]!) * 0.5],
    ];
    let outside = false;
    for (const [sx, sz] of samples) {
      if (snapOutside(sx, sz)) {
        outside = true;
        break;
      }
    }
    if (outside) continue;
    kept.push(indices[t]!, indices[t + 1]!, indices[t + 2]!);
  }

  if (kept.length < indices.length * 0.5 || kept.length < 12) {
    return rebuildNormals(positions, mesh.indices, mesh.triangles);
  }
  const nextIndices = Uint32Array.from(kept);
  return rebuildNormals(positions, nextIndices, nextIndices.length / 3);
}

function closestOnRing(x: number, z: number, ring: readonly ZonePoint[]) {
  let best = Number.POSITIVE_INFINITY;
  let bx = x;
  let bz = z;
  let ex = 1;
  let ez = 0;
  for (let i = 0; i < ring.length; i += 1) {
    const a = ring[i]!;
    const b = ring[(i + 1) % ring.length]!;
    const abx = b.x - a.x;
    const abz = b.z - a.z;
    const len2 = abx * abx + abz * abz || 1;
    let t = ((x - a.x) * abx + (z - a.z) * abz) / len2;
    t = Math.max(0, Math.min(1, t));
    const px = a.x + abx * t;
    const pz = a.z + abz * t;
    const dist = Math.hypot(x - px, z - pz);
    if (dist < best) {
      best = dist;
      bx = px;
      bz = pz;
      const len = Math.hypot(abx, abz) || 1;
      ex = abx / len;
      ez = abz / len;
    }
  }
  return { x: bx, z: bz, dist: best, ex, ez };
}

/**
 * Push void-boundary verts back if they enter the solid clearance.
 * Two dense passes guarantee a small air gap — never contact.
 */
function repelFromSolids(mesh: IsoMesh, solids: readonly PositionedSolid[], cell: number): IsoMesh {
  if (!solids.length) return mesh;
  const leaveGap = PLACEMENT_VOID_HUG_GAP_FT;
  const maxReach = Math.max(cell * 5, leaveGap + cell * 2);
  const bucket = Math.max(cell * 1.5, 4);
  const grid = buildSolidSampleGrid(solids, bucket);
  if (!grid.size) return mesh;

  const positions = new Float32Array(mesh.positions);
  const sourceNormals = mesh.normals;
  const count = positions.length / 3;
  for (let i = 0; i < count; i += 1) {
    const at = i * 3;
    const x = positions[at];
    const y = positions[at + 1];
    const z = positions[at + 2];
    const nearest = nearestSolidSample(grid, x, y, z, bucket, maxReach);
    if (!nearest) continue;
    const dx = x - nearest.x;
    const dy = y - nearest.y;
    const dz = z - nearest.z;
    const dist = Math.hypot(dx, dy, dz);
    if (!(dist < leaveGap)) continue;
    if (dist < 1e-4) {
      /** Collapsed onto the solid — retract along the void outward normal. */
      const nx = sourceNormals[at] ?? 1;
      const ny = sourceNormals[at + 1] ?? 0;
      const nz = sourceNormals[at + 2] ?? 0;
      const nLen = Math.hypot(nx, ny, nz) || 1;
      positions[at] -= (nx / nLen) * leaveGap;
      positions[at + 1] -= (ny / nLen) * leaveGap;
      positions[at + 2] -= (nz / nLen) * leaveGap;
      continue;
    }
    /** Outside or grazing — project onto the clearance sphere around the solid sample. */
    const push = (leaveGap - dist) / dist;
    positions[at] += dx * push;
    positions[at + 1] += dy * push;
    positions[at + 2] += dz * push;
    /** If the void normal faces the solid, also retract along -normal so calm cannot leave a kiss. */
    const nx = sourceNormals[at] ?? 0;
    const ny = sourceNormals[at + 1] ?? 0;
    const nz = sourceNormals[at + 2] ?? 0;
    const toSolidX = nearest.x - positions[at];
    const toSolidY = nearest.y - positions[at + 1];
    const toSolidZ = nearest.z - positions[at + 2];
    const facing = nx * toSolidX + ny * toSolidY + nz * toSolidZ;
    if (facing > 0) {
      const nLen = Math.hypot(nx, ny, nz) || 1;
      const extra = Math.min(leaveGap * 0.25, leaveGap - dist);
      positions[at] -= (nx / nLen) * extra;
      positions[at + 1] -= (ny / nLen) * extra;
      positions[at + 2] -= (nz / nLen) * extra;
    }
  }

  return rebuildNormals(positions, mesh.indices, mesh.triangles);
}

function rebuildNormals(positions: Float32Array, indices: Uint32Array, triangles: number): IsoMesh {
  const normals = new Float32Array(positions.length);
  for (let i = 0; i < indices.length; i += 3) {
    const ia = indices[i]! * 3;
    const ib = indices[i + 1]! * 3;
    const ic = indices[i + 2]! * 3;
    const ax = positions[ib] - positions[ia];
    const ay = positions[ib + 1] - positions[ia + 1];
    const az = positions[ib + 2] - positions[ia + 2];
    const bx = positions[ic] - positions[ia];
    const by = positions[ic + 1] - positions[ia + 1];
    const bz = positions[ic + 2] - positions[ia + 2];
    const nx = ay * bz - az * by;
    const ny = az * bx - ax * bz;
    const nz = ax * by - ay * bx;
    for (const at of [ia, ib, ic]) {
      normals[at] += nx;
      normals[at + 1] += ny;
      normals[at + 2] += nz;
    }
  }
  for (let i = 0; i < normals.length; i += 3) {
    const length = Math.hypot(normals[i], normals[i + 1], normals[i + 2]) || 1;
    normals[i] /= length;
    normals[i + 1] /= length;
    normals[i + 2] /= length;
  }
  return { positions, normals, indices, triangles };
}

/** Smallest gap from any void vertex to the densest solid sample grid. */
function measureMinSolidGap(mesh: IsoMesh, solids: readonly PositionedSolid[], cell: number): number {
  if (!solids.length || !(mesh.positions.length >= 3)) return Number.POSITIVE_INFINITY;
  const bucket = Math.max(cell * 1.5, 4);
  const grid = buildSolidSampleGrid(solids, bucket);
  if (!grid.size) return Number.POSITIVE_INFINITY;
  const maxReach = Math.max(cell * 8, PLACEMENT_VOID_HUG_GAP_FT + cell * 3);
  const positions = mesh.positions;
  let min = Number.POSITIVE_INFINITY;
  for (let i = 0; i < positions.length; i += 3) {
    const nearest = nearestSolidSample(grid, positions[i]!, positions[i + 1]!, positions[i + 2]!, bucket, maxReach);
    if (!nearest) continue;
    const dist = Math.hypot(
      positions[i]! - nearest.x,
      positions[i + 1]! - nearest.y,
      positions[i + 2]! - nearest.z,
    );
    if (dist < min) min = dist;
  }
  return min;
}

type SolidSample = { x: number; y: number; z: number };

function buildSolidSampleGrid(solids: readonly PositionedSolid[], bucket: number): Map<string, SolidSample[]> {
  const grid = new Map<string, SolidSample[]>();
  const seen = new Set<string>();
  const pushSample = (x: number, y: number, z: number) => {
    const q = `${Math.round(x * 8)}:${Math.round(y * 8)}:${Math.round(z * 8)}`;
    if (seen.has(q)) return;
    seen.add(q);
    const key = `${Math.round(x / bucket)}:${Math.round(y / bucket)}:${Math.round(z / bucket)}`;
    const sample = { x, y, z };
    const list = grid.get(key);
    if (list) list.push(sample);
    else grid.set(key, [sample]);
  };
  for (const solid of solids) {
    const positions = solid.positions;
    const indices = solid.indices;
    /** Every solid vertex — no skipping — so thin ridges cannot be missed. */
    for (let v = 0; v < positions.length; v += 3) {
      pushSample(positions[v]!, positions[v + 1]!, positions[v + 2]!);
    }
    /** Centroids + edge midpoints cover the faces between vertices. */
    for (let t = 0; t < indices.length; t += 3) {
      const ia = indices[t]! * 3;
      const ib = indices[t + 1]! * 3;
      const ic = indices[t + 2]! * 3;
      const ax = positions[ia]!;
      const ay = positions[ia + 1]!;
      const az = positions[ia + 2]!;
      const bx = positions[ib]!;
      const by = positions[ib + 1]!;
      const bz = positions[ib + 2]!;
      const cx = positions[ic]!;
      const cy = positions[ic + 1]!;
      const cz = positions[ic + 2]!;
      pushSample((ax + bx + cx) / 3, (ay + by + cy) / 3, (az + bz + cz) / 3);
      pushSample((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2);
      pushSample((bx + cx) / 2, (by + cy) / 2, (bz + cz) / 2);
      pushSample((cx + ax) / 2, (cy + ay) / 2, (cz + az) / 2);
    }
  }
  return grid;
}

function nearestSolidSample(
  grid: Map<string, SolidSample[]>,
  x: number,
  y: number,
  z: number,
  bucket: number,
  maxReach: number,
): SolidSample | null {
  const bx = Math.round(x / bucket);
  const by = Math.round(y / bucket);
  const bz = Math.round(z / bucket);
  let best: SolidSample | null = null;
  let bestDist = maxReach;
  for (let dz = -1; dz <= 1; dz += 1) {
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        const list = grid.get(`${bx + dx}:${by + dy}:${bz + dz}`);
        if (!list) continue;
        for (const sample of list) {
          const dist = Math.hypot(sample.x - x, sample.y - y, sample.z - z);
          if (dist < bestDist) {
            bestDist = dist;
            best = sample;
          }
        }
      }
    }
  }
  return best;
}

/** Mild neighbor average — keeps cell-scale bumps and curves readable. */
function lightRelax(mesh: IsoMesh, passes: number, amount: number): IsoMesh {
  const count = mesh.positions.length / 3;
  const positions = new Float32Array(mesh.positions);
  const sums = new Float64Array(mesh.positions.length);
  const weights = new Float64Array(count);
  for (let pass = 0; pass < passes; pass += 1) {
    sums.fill(0);
    weights.fill(0);
    for (let i = 0; i < mesh.indices.length; i += 3) {
      const tri = [mesh.indices[i], mesh.indices[i + 1], mesh.indices[i + 2]];
      for (let a = 0; a < 3; a += 1) {
        const b = tri[(a + 1) % 3];
        const c = tri[(a + 2) % 3];
        const at = tri[a] * 3;
        sums[at] += positions[b * 3] + positions[c * 3];
        sums[at + 1] += positions[b * 3 + 1] + positions[c * 3 + 1];
        sums[at + 2] += positions[b * 3 + 2] + positions[c * 3 + 2];
        weights[tri[a]] += 2;
      }
    }
    for (let i = 0; i < count; i += 1) {
      if (!weights[i]) continue;
      const at = i * 3;
      positions[at] += (sums[at] / weights[i] - positions[at]) * amount;
      positions[at + 1] += (sums[at + 1] / weights[i] - positions[at + 1]) * amount;
      positions[at + 2] += (sums[at + 2] / weights[i] - positions[at + 2]) * amount;
    }
  }
  const normals = new Float32Array(positions.length);
  for (let i = 0; i < mesh.indices.length; i += 3) {
    const ia = mesh.indices[i] * 3;
    const ib = mesh.indices[i + 1] * 3;
    const ic = mesh.indices[i + 2] * 3;
    const ax = positions[ib] - positions[ia];
    const ay = positions[ib + 1] - positions[ia + 1];
    const az = positions[ib + 2] - positions[ia + 2];
    const bx = positions[ic] - positions[ia];
    const by = positions[ic + 1] - positions[ia + 1];
    const bz = positions[ic + 2] - positions[ia + 2];
    const nx = ay * bz - az * by;
    const ny = az * bx - ax * bz;
    const nz = ax * by - ay * bx;
    for (const at of [ia, ib, ic]) {
      normals[at] += nx;
      normals[at + 1] += ny;
      normals[at + 2] += nz;
    }
  }
  for (let i = 0; i < normals.length; i += 3) {
    const length = Math.hypot(normals[i], normals[i + 1], normals[i + 2]) || 1;
    normals[i] /= length;
    normals[i + 1] /= length;
    normals[i + 2] /= length;
  }
  return {
    positions,
    normals,
    indices: mesh.indices,
    triangles: mesh.triangles,
  };
}

function weldVoidVertices(mesh: IsoMesh): IsoMesh {
  const map = new Map<string, number>();
  const positions: number[] = [];
  const remapped: number[] = [];
  const quant = (value: number) => Math.round(value * 200);
  for (let index = 0; index < mesh.indices.length; index += 1) {
    const src = mesh.indices[index] * 3;
    const x = mesh.positions[src];
    const y = mesh.positions[src + 1];
    const z = mesh.positions[src + 2];
    const key = `${quant(x)}:${quant(y)}:${quant(z)}`;
    let next = map.get(key);
    if (next === undefined) {
      next = map.size;
      map.set(key, next);
      positions.push(x, y, z);
    }
    remapped.push(next);
  }
  const indices: number[] = [];
  for (let index = 0; index < remapped.length; index += 3) {
    const a = remapped[index];
    const b = remapped[index + 1];
    const c = remapped[index + 2];
    if (a === b || b === c || a === c) continue;
    const ax = positions[a * 3];
    const ay = positions[a * 3 + 1];
    const az = positions[a * 3 + 2];
    const bx = positions[b * 3] - ax;
    const by = positions[b * 3 + 1] - ay;
    const bz = positions[b * 3 + 2] - az;
    const cx = positions[c * 3] - ax;
    const cy = positions[c * 3 + 1] - ay;
    const cz = positions[c * 3 + 2] - az;
    const nx = by * cz - bz * cy;
    const ny = bz * cx - bx * cz;
    const nz = bx * cy - by * cx;
    if (nx * nx + ny * ny + nz * nz < 1e-8) continue;
    indices.push(a, b, c);
  }
  if (indices.length < 3) {
    return {
      positions: mesh.positions,
      normals: mesh.normals,
      indices: mesh.indices,
      triangles: mesh.triangles,
    };
  }
  const pos = new Float32Array(positions);
  const ind = new Uint32Array(indices);
  const normals = new Float32Array(positions.length);
  for (let index = 0; index < indices.length; index += 3) {
    const ia = indices[index] * 3;
    const ib = indices[index + 1] * 3;
    const ic = indices[index + 2] * 3;
    const ax = pos[ib] - pos[ia];
    const ay = pos[ib + 1] - pos[ia + 1];
    const az = pos[ib + 2] - pos[ia + 2];
    const bx = pos[ic] - pos[ia];
    const by = pos[ic + 1] - pos[ia + 1];
    const bz = pos[ic + 2] - pos[ia + 2];
    const nx = ay * bz - az * by;
    const ny = az * bx - ax * bz;
    const nz = ax * by - ay * bx;
    for (const at of [ia, ib, ic]) {
      normals[at] += nx;
      normals[at + 1] += ny;
      normals[at + 2] += nz;
    }
  }
  for (let index = 0; index < normals.length; index += 3) {
    const length = Math.hypot(normals[index], normals[index + 1], normals[index + 2]) || 1;
    normals[index] /= length;
    normals[index + 1] /= length;
    normals[index + 2] /= length;
  }
  return { positions: pos, normals, indices: ind, triangles: indices.length / 3 };
}

function buildInsetNetworkDomain(
  branches: readonly NetworkBranch[],
  solids: readonly PositionedSolid[],
  offsetFt: number,
  networkId: string,
): { domain: VoidDomain; boundaryRings: ZonePoint[][] } {
  const parcel = herald.site.ring as XZ[];
  const water = herald.water.ring as XZ[];
  const veinEdges = branches.map((branch) => ({
    x0: branch.x0,
    z0: branch.z0,
    x1: branch.x1,
    z1: branch.z1,
    conductivity: "conductivity" in branch && typeof branch.conductivity === "number" ? branch.conductivity : 1,
  }));
  const report = detectPockets(veinEdges, parcel, water);

  // Interior network faces only. Parcel-edged faces are the site fringe — not void domain.
  const networkPockets = report.pockets.filter((pocket) => !pocket.touchesParcel);
  // Drop shared interior edges so one outer shell remains; interior lines do not split the void.
  const shells = dissolveOuterShells(networkPockets.map((pocket) => pocket.points));
  const solidSpans = solids.map((solid) => solidVerticalSpan(solid));
  // Domain rises from ground; open-domain then clips only the ceiling to local solid tops.
  let globalMinY = 0;
  let globalMaxY = -Infinity;
  for (const span of solidSpans) {
    globalMinY = Math.min(globalMinY, span.minY);
    globalMaxY = Math.max(globalMaxY, span.maxY);
  }
  globalMinY = Math.min(0, globalMinY);
  if (!(globalMaxY > globalMinY)) {
    globalMinY = 0;
    globalMaxY = 24;
  }

  const alignedShells = shells
    .map((shell) => {
      /** Physical boundary = outer shell snapped to the drawn veins on this sheet. */
      const aligned = alignRingToVeinPaths(shell, veinEdges, [], 3);
      const boundary = (aligned.length >= 3 ? aligned : shell).map((point) => ({ x: point.x, z: point.z }));
      return boundary;
    })
    .filter((boundary) => boundary.length >= 3 && Math.abs(polygonAreaSqFt(boundary)) >= 80)
    .sort((a, b) => Math.abs(polygonAreaSqFt(b)) - Math.abs(polygonAreaSqFt(a)));

  /** One clip ring per distinct enclosure — never union near-duplicate outlines. */
  const boundaryRings: ZonePoint[][] = [];
  for (const boundary of alignedShells) {
    const area = Math.abs(polygonAreaSqFt(boundary));
    const center = polygonCentroid(boundary);
    const duplicate = boundaryRings.some((prior) => {
      const priorArea = Math.abs(polygonAreaSqFt(prior));
      const priorCenter = polygonCentroid(prior);
      const separation = Math.hypot(center.x - priorCenter.x, center.z - priorCenter.z);
      const areaRatio = area / Math.max(priorArea, 1);
      return separation < 60 && areaRatio > 0.5 && areaRatio < 1.5;
    });
    if (duplicate) continue;
    boundaryRings.push(boundary);
  }

  const zones = boundaryRings.map((boundary, index) => ({
    id: `network-shell-${index}`,
    plan: boundary,
    baseFt: globalMinY,
    heightFt: globalMaxY - globalMinY,
  }));

  if (zones.length === 0) {
    throw new Error("No network outer shell remained after the line offset. The void stays inside the network.");
  }

  const built = buildNetworkDomain({
    source: `placement-void:${networkId}`,
    provisional: false,
    zones,
  });
  if (!built.domain) throw new Error("The inset network domain could not be built.");
  return { domain: built.domain, boundaryRings };
}

/**
 * Union network-closed pocket rings by dropping edges that appear twice (interior
 * divisions). Remaining edges are the outer shell facing the site fringe.
 */
function dissolveOuterShells(pockets: readonly (readonly ZonePoint[])[]): ZonePoint[][] {
  const edgeCount = new Map<string, { ax: number; az: number; bx: number; bz: number; count: number }>();
  const edgeKey = (ax: number, az: number, bx: number, bz: number) => {
    const a = `${Math.round(ax * 20) / 20}:${Math.round(az * 20) / 20}`;
    const b = `${Math.round(bx * 20) / 20}:${Math.round(bz * 20) / 20}`;
    return a < b ? `${a}|${b}` : `${b}|${a}`;
  };
  for (const ring of pockets) {
    if (ring.length < 3) continue;
    for (let index = 0; index < ring.length; index += 1) {
      const from = ring[index];
      const to = ring[(index + 1) % ring.length];
      const key = edgeKey(from.x, from.z, to.x, to.z);
      const current = edgeCount.get(key);
      if (current) current.count += 1;
      else edgeCount.set(key, { ax: from.x, az: from.z, bx: to.x, bz: to.z, count: 1 });
    }
  }
  const boundary = [...edgeCount.values()].filter((edge) => edge.count === 1);
  if (boundary.length < 3) return [];

  const nodeKey = (x: number, z: number) => `${Math.round(x * 20) / 20}:${Math.round(z * 20) / 20}`;
  const adjacency = new Map<string, { x: number; z: number; links: { key: string; x: number; z: number }[] }>();
  const ensure = (x: number, z: number) => {
    const key = nodeKey(x, z);
    if (!adjacency.has(key)) adjacency.set(key, { x, z, links: [] });
    return key;
  };
  for (const edge of boundary) {
    const a = ensure(edge.ax, edge.az);
    const b = ensure(edge.bx, edge.bz);
    if (a === b) continue;
    adjacency.get(a)!.links.push({ key: b, x: edge.bx, z: edge.bz });
    adjacency.get(b)!.links.push({ key: a, x: edge.ax, z: edge.az });
  }

  const used = new Set<string>();
  const shells: ZonePoint[][] = [];
  const directed = (from: string, to: string) => `${from}>${to}`;

  for (const [startKey, startNode] of adjacency) {
    for (const first of startNode.links) {
      const open = directed(startKey, first.key);
      if (used.has(open)) continue;
      const ring: ZonePoint[] = [];
      let current = startKey;
      let next = first.key;
      let guard = 0;
      let closed = false;
      while (guard < boundary.length + 4) {
        guard += 1;
        const mark = directed(current, next);
        if (used.has(mark)) break;
        used.add(mark);
        const node = adjacency.get(current);
        if (!node) break;
        ring.push({ x: node.x, z: node.z });
        const arrival = adjacency.get(next);
        if (!arrival) break;
        const incoming = Math.atan2(node.z - arrival.z, node.x - arrival.x);
        let best = -1;
        let bestDelta = Infinity;
        arrival.links.forEach((link, index) => {
          if (link.key === current) return;
          const angle = Math.atan2(link.z - arrival.z, link.x - arrival.x);
          const delta = Math.atan2(Math.sin(angle - incoming), Math.cos(angle - incoming));
          // Left-most turn keeps the outer (CCW) contour when walking boundary edges.
          if (delta < bestDelta) {
            bestDelta = delta;
            best = index;
          }
        });
        const previous = current;
        current = next;
        if (best < 0) {
          const back = arrival.links.find((link) => link.key === previous);
          if (!back || arrival.links.length !== 1) break;
          next = back.key;
        } else {
          next = arrival.links[best].key;
        }
        if (current === startKey && next === first.key) {
          closed = true;
          break;
        }
      }
      if (!closed || ring.length < 3) continue;
      if (Math.abs(polygonAreaSqFt(ring)) < 80) continue;
      // Keep positive (CCW / interior-left) orientation for plan extrusions.
      const area = polygonAreaSqFt(ring);
      shells.push(area < 0 ? [...ring].reverse() : ring);
    }
  }

  // Prefer the largest shells; tiny residual loops from quantize noise drop out.
  // Near-equal traces of the same perimeter must not both stay — their union
  // crescent sits past the drawn veins and the gel follows it outside the ink.
  shells.sort((a, b) => Math.abs(polygonAreaSqFt(b)) - Math.abs(polygonAreaSqFt(a)));
  const kept: ZonePoint[][] = [];
  for (const shell of shells) {
    const area = Math.abs(polygonAreaSqFt(shell));
    if (area < 80) continue;
    if (kept.length === 0) {
      kept.push(shell);
      continue;
    }
    if (area < Math.abs(polygonAreaSqFt(kept[0]!)) * 0.08) continue;
    const center = polygonCentroid(shell);
    const duplicate = kept.some((prior) => {
      const priorArea = Math.abs(polygonAreaSqFt(prior));
      const priorCenter = polygonCentroid(prior);
      const separation = Math.hypot(center.x - priorCenter.x, center.z - priorCenter.z);
      const areaRatio = area / Math.max(priorArea, 1);
      return separation < 60 && areaRatio > 0.5 && areaRatio < 1.5;
    });
    if (duplicate) continue;
    kept.push(shell);
  }
  return kept;
}

type SolidSpan = {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
  cx: number;
  cz: number;
};

function solidVerticalSpan(solid: PositionedSolid): SolidSpan {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (let index = 0; index < solid.positions.length; index += 3) {
    minX = Math.min(minX, solid.positions[index]);
    maxX = Math.max(maxX, solid.positions[index]);
    minY = Math.min(minY, solid.positions[index + 1]);
    maxY = Math.max(maxY, solid.positions[index + 1]);
    minZ = Math.min(minZ, solid.positions[index + 2]);
    maxZ = Math.max(maxZ, solid.positions[index + 2]);
  }
  return {
    minX, maxX, minY, maxY, minZ, maxZ,
    cx: (minX + maxX) / 2,
    cz: (minZ + maxZ) / 2,
  };
}

/** Heights of clusters that sit in this pocket. Nearby clusters count when the pocket is empty. */
function pocketClusterSpan(pocket: readonly ZonePoint[], spans: readonly SolidSpan[]): { minY: number; maxY: number } | null {
  const inside = spans.filter((span) => pointInRing(span.cx, span.cz, pocket));
  const use = inside.length > 0 ? inside : nearestSpans(pocket, spans, 3);
  if (use.length === 0) return null;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const span of use) {
    minY = Math.min(minY, span.minY);
    maxY = Math.max(maxY, span.maxY);
  }
  return Number.isFinite(minY) && Number.isFinite(maxY) ? { minY, maxY } : null;
}

function nearestSpans(pocket: readonly ZonePoint[], spans: readonly SolidSpan[], count: number) {
  const center = polygonCentroid(pocket);
  return [...spans]
    .map((span) => ({ span, dist: Math.hypot(span.cx - center.x, span.cz - center.z) }))
    .sort((a, b) => a.dist - b.dist)
    .slice(0, count)
    .map((item) => item.span);
}

function pointInRing(x: number, z: number, ring: readonly ZonePoint[]) {
  let inside = false;
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index, index += 1) {
    const a = ring[index];
    const b = ring[previous];
    const crosses = a.z > z !== b.z > z;
    if (crosses && x < ((b.x - a.x) * (z - a.z)) / (b.z - a.z || 1e-9) + a.x) inside = !inside;
  }
  return inside;
}

/** Closed Chaikin pass so pocket edges read as fluid corridors, not chords. */
function smoothClosedRing(points: readonly ZonePoint[], passes: number): ZonePoint[] {
  let current = points.map((point) => ({ x: point.x, z: point.z }));
  if (current.length < 3) return current;
  for (let pass = 0; pass < passes; pass += 1) {
    const next: ZonePoint[] = [];
    for (let index = 0; index < current.length; index += 1) {
      const start = current[index];
      const end = current[(index + 1) % current.length];
      next.push({
        x: start.x * 0.75 + end.x * 0.25,
        z: start.z * 0.75 + end.z * 0.25,
      });
      next.push({
        x: start.x * 0.25 + end.x * 0.75,
        z: start.z * 0.25 + end.z * 0.75,
      });
    }
    current = next;
  }
  return current;
}

/**
 * True inward offset along vertex normals — uniform gap from the network ink,
 * not a centroid scale (scale left concave bays flush to the shell).
 */
export function insetRing(points: readonly ZonePoint[], offsetFt: number): ZonePoint[] {
  if (points.length < 3 || !(offsetFt > 0)) return points.map((point) => ({ x: point.x, z: point.z }));
  const ring = points.map((point) => ({ x: point.x, z: point.z }));
  const area = polygonAreaSqFt(ring);
  if (!(Math.abs(area) > 1)) return [];
  /** CCW rings: left normal points inward. CW: flip. */
  const inward = area > 0 ? 1 : -1;
  const out: ZonePoint[] = [];
  for (let index = 0; index < ring.length; index += 1) {
    const prev = ring[(index - 1 + ring.length) % ring.length]!;
    const curr = ring[index]!;
    const next = ring[(index + 1) % ring.length]!;
    const e0x = curr.x - prev.x;
    const e0z = curr.z - prev.z;
    const e1x = next.x - curr.x;
    const e1z = next.z - curr.z;
    const l0 = Math.hypot(e0x, e0z) || 1;
    const l1 = Math.hypot(e1x, e1z) || 1;
    const n0x = (-e0z / l0) * inward;
    const n0z = (e0x / l0) * inward;
    const n1x = (-e1z / l1) * inward;
    const n1z = (e1x / l1) * inward;
    let nx = n0x + n1x;
    let nz = n0z + n1z;
    const nLen = Math.hypot(nx, nz);
    if (nLen < 1e-6) {
      nx = n1x;
      nz = n1z;
    } else {
      nx /= nLen;
      nz /= nLen;
    }
    out.push({
      x: curr.x + nx * offsetFt,
      z: curr.z + nz * offsetFt,
    });
  }
  if (Math.abs(polygonAreaSqFt(out)) < 80) return [];
  return out;
}

function loadPlacedSolid(record: PlacedCluster): PositionedSolid | null {
  const packed = readFinishedMesh(record.programId, record.finishedClusterId);
  if (!packed?.positions || !packed.indices || !(packed.triangles && packed.triangles > 4)) return null;
  const positions = unpackF32(packed.positions);
  const indices = unpackU32(packed.indices);
  if (positions.length < 9 || indices.length < 12) return null;
  return {
    id: record.occupancyId,
    positions: poseFinishedMesh(positions, record.transform),
    indices,
  };
}

function readFinishedMesh(programId: string, clusterId: string): PackedMesh {
  const category = isFinalClusterCategory(programId)
    ? programId
    : isFinalClusterCategory(clusterId.split(":")[0] ?? "")
      ? clusterId.split(":")[0]
      : null;
  if (!category) return null;
  const file = finalClusterMeshPath(category, clusterId);
  if (!existsSync(file)) return null;
  const body = JSON.parse(readFileSync(file, "utf8")) as { mesh?: PackedMesh };
  return body.mesh ?? null;
}

function unpackF32(value: string) {
  const bytes = Buffer.from(value, "base64");
  const copy = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(copy).set(bytes);
  return new Float32Array(copy);
}

function unpackU32(value: string) {
  const bytes = Buffer.from(value, "base64");
  const copy = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(copy).set(bytes);
  return new Uint32Array(copy);
}
