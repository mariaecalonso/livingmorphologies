import type { IsoMesh } from "@/lib/scan/isomesh";
import { filmWrapDistanceChunked } from "@/lib/skill4/film-wrap";
import type { ClusterSitePose } from "@/lib/skill5/placed-cluster";

/**
 * Network Constrained Void Generation.
 *
 * This is not a production building volume and it does not read Site Strategy,
 * Designer Zoning, or a Cluster Assembly. Those authorities stay with the
 * parallel site work. A caller passes solids that are already in site feet
 * and an explicit three-dimensional domain.
 *
 * A network centerline is not a domain. Plan pockets are not a domain.
 * Designer zoning can become one only after it supplies a plan ring and
 * vertical limits, and only when the caller passes that volume in.
 *
 * Accepted voids are empty architectural space. They are not construction
 * material. Solid, void, and the preliminary boundary stay separate layers.
 * The boundary is a handoff for a later exterior extraction. It is not the
 * Enclosure lab and it is not a shrink wrap of the clusters.
 */
export const NETWORK_VOID_CONTRACT = "skill5-network-constrained-void-v1" as const;

/**
 * Same grid rule as cluster-void.ts: target 0.32 ft, and never more than
 * 148 cells on an axis. Used only when a caller asks for that inherited
 * resolution. This module does not apply it silently.
 */
export const CLUSTER_VOID_TARGET_CELL = 0.32;
export const CLUSTER_VOID_MAX_AXIS = 148;

export type SitePoint = { x: number; y: number; z: number };

export type PositionedSolid = {
  id: string;
  positions: Float32Array;
  indices: Uint32Array;
};

/** A closed volume the caller supplies. This module does not invent one. */
export type VoidDomain = {
  kind: "bounds" | "plan-extrusion";
  min: SitePoint;
  max: SitePoint;
  /** Required for plan-extrusion. Ignored for bounds. Site plan, X east, Z north. */
  plan?: readonly { x: number; z: number }[];
  /** Air the domain must not claim. Voids are not accepted here. */
  exclusions?: readonly VoidDomain[];
  /** When set, a cell must fall in one of these volumes. The outer box is not itself the domain. */
  parts?: readonly VoidDomain[];
  /** Optional parcel or other hard limit. */
  siteLimit?: VoidDomain;
  /** Names the upstream record. Tests use a provisional label. */
  source: string;
  provisional: boolean;
};

export type VoidClearance = {
  /** Full width, in feet, below which a gap is not an architectural void. */
  minimumGap: number;
  /** Farthest an empty cell may sit from a solid and still be held between solids. */
  shelter: number;
};

export type NetworkVoidRequest = {
  solids: readonly PositionedSolid[];
  domain: VoidDomain;
  clearance: VoidClearance;
  /** Connected void components smaller than this, in cubic feet, are dropped. */
  minimumComponent: number;
  /** Required. Feet per cell. The cell is not coarsened to fit a grid cap. */
  cell: number;
  /** When true, also build a distance-field boundary. It does not alter the masks. */
  continuous?: boolean;
  /**
   * Rasterize every Nth triangle (N >= 1). Placement-scale runs use a stride so
   * dense shrink-wraps still cast a shell without visiting every face.
   */
  triangleStep?: number;
  /**
   * held-between: air sheltered between solids (default, provisional study).
   * open-domain: every empty cell inside the domain — the open mass of the pocket.
   */
  acceptance?: "held-between" | "open-domain";
  /**
   * When true with open-domain, void ceiling follows nearby solid tops.
   * The floor stays on the ground so overhangs fill from below.
   */
  followSolidHeights?: boolean;
  /**
   * Open-domain only. Advance the void into the solid shell by this many cells
   * so the gel sits closer and picks up ridge detail.
   */
  nibbleSolidCells?: number;
  /**
   * Open-domain only. Keep this many empty cells between void and solids so the
   * gel never touches or fills through cluster footprints.
   */
  solidClearanceCells?: number;
  /**
   * Open-domain only. Void may extend at most this many cells from a solid.
   * Network domain remains the hard stop; this envelope gives the void its own
   * morphology so it does not copy the outer network shell outline.
   */
  solidMorphologyCells?: number;
};

export type VoxelGrid = {
  origin: SitePoint;
  cell: number;
  nx: number;
  ny: number;
  nz: number;
};

export type NetworkVoidResult = {
  contract: typeof NETWORK_VOID_CONTRACT;
  provisional: boolean;
  domainSource: string;
  grid: VoxelGrid;
  /** Occupied by positioned solids. Not void. */
  occupied: Uint8Array;
  /** Accepted interstitial air. Not construction material. */
  void: Uint8Array;
  /** Inside the supplied domain. */
  domain: Uint8Array;
  occupiedCount: number;
  voidCount: number;
  domainCount: number;
  /** Empty domain cells that were not accepted. They are not building volume. */
  unclaimedDomain: number;
  voidComponents: number;
  voidCubicFeet: number;
  occupiedCubicFeet: number;
  /** Accepted void cells outside the domain. Must stay 0. */
  leaked: number;
  /** Occupied cells whose centers lie outside the domain. Solids are not clipped. */
  solidConflicts: number;
  processing: "dense" | "chunked";
  /** Preliminary exterior of the combined solid and void. Not an Enclosure product. */
  boundary: IsoMesh;
  boundaryRole: "preliminary-voxel-boundary";
  /** Accepted void cells only. Drawn as the habitable void volume. */
  voidMesh: IsoMesh;
  voidMeshRole: "accepted-void-volume";
  /** Distance-field surface. Null when not requested or when a chunk fails. */
  continuous: IsoMesh | null;
  continuousRole: "preliminary-continuous-boundary";
  continuousNote: string;
};

export function inheritedClusterCell(span: number) {
  return Math.max(CLUSTER_VOID_TARGET_CELL, span / (CLUSTER_VOID_MAX_AXIS - 6));
}

/** Copy a cluster-local solid into site feet. Yaw is degrees about up. There is no scale. */
export function placeSolidOnSite(
  id: string,
  mesh: { positions: Float32Array; indices: Uint32Array },
  pose: ClusterSitePose,
): PositionedSolid {
  const radians = pose.rotationY * Math.PI / 180;
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  const mirrorX = pose.mirror === "x" ? -1 : 1;
  const mirrorZ = pose.mirror === "z" ? -1 : 1;
  const positions = new Float32Array(mesh.positions.length);
  for (let index = 0; index < mesh.positions.length; index += 3) {
    const x = mesh.positions[index] * mirrorX;
    const y = mesh.positions[index + 1];
    const z = mesh.positions[index + 2] * mirrorZ;
    positions[index] = x * cosine + z * sine + pose.x;
    positions[index + 1] = y + pose.y;
    positions[index + 2] = -x * sine + z * cosine + pose.z;
  }
  return { id, positions, indices: new Uint32Array(mesh.indices) };
}

export function generateNetworkConstrainedVoid(request: NetworkVoidRequest): NetworkVoidResult {
  const { solids, domain, clearance, cell } = request;
  if (!(cell > 0)) throw new Error("network void cell must be a positive length in feet");
  if (!(clearance.minimumGap > 0) || !(clearance.shelter > 0)) throw new Error("network void clearance must be supplied");
  if (domain.max.x <= domain.min.x || domain.max.y <= domain.min.y || domain.max.z <= domain.min.z) {
    throw new Error("network void domain has no volume");
  }
  if (domain.kind === "plan-extrusion" && (domain.plan?.length ?? 0) < 3) {
    throw new Error("a plan extrusion needs a closed plan ring; a centerline is not a domain");
  }
  if (solids.length < 2) throw new Error("network void generation needs at least two positioned solids");

  const bounds = boundsOf(solids, domain);
  const spanX = bounds.maxX - bounds.minX;
  const spanY = bounds.maxY - bounds.minY;
  const spanZ = bounds.maxZ - bounds.minZ;
  const nx = Math.ceil(spanX / cell) + 3;
  const ny = Math.ceil(spanY / cell) + 3;
  const nz = Math.ceil(spanZ / cell) + 3;
  if (nx * ny * nz > 2_000_000) return generateChunked(request, bounds, cell);
  const origin = { x: bounds.minX - cell, y: bounds.minY - cell, z: bounds.minZ - cell };
  const count = nx * ny * nz;
  const surface = new Uint16Array(count);
  const occupied = new Uint8Array(count);
  const triangleStep = Math.max(1, Math.floor(request.triangleStep ?? 1));
  solids.forEach((solid, index) => rasterize(solid, surface, index + 1, origin, cell, nx, ny, nz, triangleStep));
  fillSolidInteriors(surface, occupied, nx, ny, nz);
  const domainMask = new Uint8Array(count);
  let domainCount = 0;
  for (let index = 0; index < count; index += 1) {
    const point = centerOf(index, origin, cell, nx, ny);
    if (!insideDomain(point, domain)) continue;
    domainMask[index] = 1;
    domainCount += 1;
  }
  const acceptance = request.acceptance ?? "held-between";
  const blocked = acceptance === "open-domain" && (request.solidClearanceCells ?? 0) > 0
    ? dilateMask(occupied, nx, ny, nz, request.solidClearanceCells ?? 0)
    : occupied;
  let voidMask = acceptance === "open-domain"
    ? openDomain(blocked, domainMask)
    : holdBetween(surface, occupied, domainMask, origin, cell, clearance, nx, ny, nz);
  if (acceptance === "open-domain" && (request.solidMorphologyCells ?? 0) > 0) {
    const envelope = dilateMask(occupied, nx, ny, nz, request.solidMorphologyCells ?? 0);
    voidMask = intersectMasks(voidMask, envelope);
  }
  if (acceptance === "open-domain" && (request.nibbleSolidCells ?? 0) > 0) {
    voidMask = nibbleSolidShell(voidMask, occupied, domainMask, nx, ny, nz, request.nibbleSolidCells ?? 0);
  }
  if (acceptance === "open-domain" && request.followSolidHeights) {
    voidMask = clipVoidToSolidHeights(voidMask, solids, origin, cell, nx, ny, nz);
  }
  const kept = dropSmall(voidMask, nx, ny, nz, cell, request.minimumComponent);
  let occupiedCount = 0;
  let voidCount = 0;
  let unclaimed = 0;
  let leaked = 0;
  let solidConflicts = 0;
  for (let index = 0; index < count; index += 1) {
    if (occupied[index]) {
      occupiedCount += 1;
      if (!domainMask[index]) solidConflicts += 1;
    }
    if (!kept[index]) {
      if (domainMask[index] && !occupied[index]) unclaimed += 1;
      continue;
    }
    voidCount += 1;
    if (!domainMask[index] || occupied[index]) leaked += 1;
  }
  const voxel = cell * cell * cell;
  const combined = new Uint8Array(count);
  for (let index = 0; index < count; index += 1) if (occupied[index] || kept[index]) combined[index] = 1;
  const voidMesh = boundaryOf(kept, origin, cell, nx, ny, nz);
  return {
    contract: NETWORK_VOID_CONTRACT,
    provisional: domain.provisional,
    domainSource: domain.source,
    grid: { origin, cell, nx, ny, nz },
    occupied,
    void: kept,
    domain: domainMask,
    occupiedCount,
    voidCount,
    domainCount,
    unclaimedDomain: unclaimed,
    voidComponents: components(kept, nx, ny, nz),
    voidCubicFeet: voidCount * voxel,
    occupiedCubicFeet: occupiedCount * voxel,
    leaked,
    solidConflicts,
    processing: "dense",
    boundary: boundaryOf(combined, origin, cell, nx, ny, nz),
    boundaryRole: "preliminary-voxel-boundary",
    voidMesh,
    voidMeshRole: "accepted-void-volume",
    ...continuousOf(request, boundaryOf(combined, origin, cell, nx, ny, nz)),
  };
}

function boundsOf(solids: readonly PositionedSolid[], domain: VoidDomain) {
  let minX = domain.min.x;
  let minY = domain.min.y;
  let minZ = domain.min.z;
  let maxX = domain.max.x;
  let maxY = domain.max.y;
  let maxZ = domain.max.z;
  solids.forEach((solid) => {
    for (let index = 0; index < solid.positions.length; index += 3) {
      minX = Math.min(minX, solid.positions[index]);
      minY = Math.min(minY, solid.positions[index + 1]);
      minZ = Math.min(minZ, solid.positions[index + 2]);
      maxX = Math.max(maxX, solid.positions[index]);
      maxY = Math.max(maxY, solid.positions[index + 1]);
      maxZ = Math.max(maxZ, solid.positions[index + 2]);
    }
  });
  return { minX, minY, minZ, maxX, maxY, maxZ };
}

function centerOf(index: number, origin: SitePoint, cell: number, nx: number, ny: number): SitePoint {
  const x = index % nx;
  const y = Math.floor(index / nx) % ny;
  const z = Math.floor(index / (nx * ny));
  return { x: origin.x + (x + 0.5) * cell, y: origin.y + (y + 0.5) * cell, z: origin.z + (z + 0.5) * cell };
}

function insideDomain(point: SitePoint, domain: VoidDomain) {
  if (point.x < domain.min.x || point.x > domain.max.x) return false;
  if (point.y < domain.min.y || point.y > domain.max.y) return false;
  if (point.z < domain.min.z || point.z > domain.max.z) return false;
  if (domain.kind === "plan-extrusion" && !pointInPlan(point.x, point.z, domain.plan ?? [])) return false;
  if (domain.siteLimit && !insideDomain(point, { ...domain.siteLimit, exclusions: [], parts: undefined, siteLimit: undefined })) return false;
  if (domain.parts && domain.parts.length > 0) {
    const covered = domain.parts.some((part) => insideDomain(point, { ...part, exclusions: [], parts: undefined, siteLimit: undefined }));
    if (!covered) return false;
  }
  return !(domain.exclusions ?? []).some((exclusion) => insideDomain(point, { ...exclusion, exclusions: [], parts: undefined, siteLimit: undefined }));
}

function pointInPlan(x: number, z: number, ring: readonly { x: number; z: number }[]) {
  let inside = false;
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index, index += 1) {
    const a = ring[index];
    const b = ring[previous];
    const crosses = a.z > z !== b.z > z;
    if (crosses && x < ((b.x - a.x) * (z - a.z)) / (b.z - a.z || 1e-9) + a.x) inside = !inside;
  }
  return inside;
}

function rasterize(
  solid: PositionedSolid,
  surface: Uint16Array,
  id: number,
  origin: SitePoint,
  cell: number,
  nx: number,
  ny: number,
  nz: number,
  triangleStep = 1,
) {
  const reach = cell * 0.87;
  const positions = solid.positions;
  const indices = solid.indices;
  const step = Math.max(1, Math.floor(triangleStep)) * 3;
  for (let triangle = 0; triangle < indices.length; triangle += step) {
    const a = corner(positions, indices[triangle]);
    const b = corner(positions, indices[triangle + 1]);
    const c = corner(positions, indices[triangle + 2]);
    const minX = Math.max(0, Math.floor((Math.min(a.x, b.x, c.x) - origin.x) / cell) - 1);
    const maxX = Math.min(nx - 1, Math.ceil((Math.max(a.x, b.x, c.x) - origin.x) / cell) + 1);
    const minY = Math.max(0, Math.floor((Math.min(a.y, b.y, c.y) - origin.y) / cell) - 1);
    const maxY = Math.min(ny - 1, Math.ceil((Math.max(a.y, b.y, c.y) - origin.y) / cell) + 1);
    const minZ = Math.max(0, Math.floor((Math.min(a.z, b.z, c.z) - origin.z) / cell) - 1);
    const maxZ = Math.min(nz - 1, Math.ceil((Math.max(a.z, b.z, c.z) - origin.z) / cell) + 1);
    for (let z = minZ; z <= maxZ; z += 1) {
      for (let y = minY; y <= maxY; y += 1) {
        const row = (z * ny + y) * nx;
        for (let x = minX; x <= maxX; x += 1) {
          const point = { x: origin.x + (x + 0.5) * cell, y: origin.y + (y + 0.5) * cell, z: origin.z + (z + 0.5) * cell };
          if (pointTriangle(point, a, b, c) > reach) continue;
          const index = row + x;
          if (surface[index] === 0) surface[index] = id;
        }
      }
    }
  }
}

/**
 * Fills each solid inside its own bounds. Air that reaches the bounds,
 * including an opening wider than a cell, stays empty.
 */
function fillSolidInteriors(surface: Uint16Array, occupied: Uint8Array, nx: number, ny: number, nz: number) {
  const boxes = new Map<number, { minX: number; minY: number; minZ: number; maxX: number; maxY: number; maxZ: number }>();
  for (let index = 0; index < surface.length; index += 1) {
    const id = surface[index];
    if (!id) continue;
    const x = index % nx;
    const y = Math.floor(index / nx) % ny;
    const z = Math.floor(index / (nx * ny));
    const box = boxes.get(id) ?? { minX: x, minY: y, minZ: z, maxX: x, maxY: y, maxZ: z };
    box.minX = Math.min(box.minX, x);
    box.minY = Math.min(box.minY, y);
    box.minZ = Math.min(box.minZ, z);
    box.maxX = Math.max(box.maxX, x);
    box.maxY = Math.max(box.maxY, y);
    box.maxZ = Math.max(box.maxZ, z);
    boxes.set(id, box);
  }
  boxes.forEach((box, id) => {
    const seen = new Uint8Array(surface.length);
    const queue: number[] = [];
    const push = (x: number, y: number, z: number) => {
      if (x < box.minX || x > box.maxX || y < box.minY || y > box.maxY || z < box.minZ || z > box.maxZ) return;
      const index = (z * ny + y) * nx + x;
      if (seen[index] || surface[index] === id) return;
      seen[index] = 1;
      queue.push(index);
    };
    for (let z = box.minZ; z <= box.maxZ; z += 1) {
      for (let y = box.minY; y <= box.maxY; y += 1) {
        push(box.minX, y, z);
        push(box.maxX, y, z);
      }
      for (let x = box.minX; x <= box.maxX; x += 1) {
        push(x, box.minY, z);
        push(x, box.maxY, z);
      }
    }
    for (let y = box.minY; y <= box.maxY; y += 1) {
      for (let x = box.minX; x <= box.maxX; x += 1) {
        push(x, y, box.minZ);
        push(x, y, box.maxZ);
      }
    }
    for (let head = 0; head < queue.length; head += 1) {
      const index = queue[head];
      const x = index % nx;
      const y = Math.floor(index / nx) % ny;
      const z = Math.floor(index / (nx * ny));
      push(x - 1, y, z);
      push(x + 1, y, z);
      push(x, y - 1, z);
      push(x, y + 1, z);
      push(x, y, z - 1);
      push(x, y, z + 1);
    }
    for (let z = box.minZ; z <= box.maxZ; z += 1) {
      for (let y = box.minY; y <= box.maxY; y += 1) {
        for (let x = box.minX; x <= box.maxX; x += 1) {
          const index = (z * ny + y) * nx + x;
          if (surface[index] === id || !seen[index]) occupied[index] = 1;
        }
      }
    }
  });
}

/** Every empty cell inside the domain. Open courtyards and corridors stay void. */
function openDomain(occupied: Uint8Array, domain: Uint8Array) {
  const voidMask = new Uint8Array(domain.length);
  for (let index = 0; index < domain.length; index += 1) {
    if (domain[index] && !occupied[index]) voidMask[index] = 1;
  }
  return voidMask;
}

function intersectMasks(a: Uint8Array, b: Uint8Array) {
  const out = new Uint8Array(a.length);
  for (let index = 0; index < a.length; index += 1) {
    if (a[index] && b[index]) out[index] = 1;
  }
  return out;
}

/** Expand a mask by neighbor layers — used to keep void clear of solid footprints. */
function dilateMask(mask: Uint8Array, nx: number, ny: number, nz: number, layers: number) {
  let current = mask;
  const neighbors = [
    [-1, 0, 0],
    [1, 0, 0],
    [0, -1, 0],
    [0, 1, 0],
    [0, 0, -1],
    [0, 0, 1],
  ] as const;
  for (let layer = 0; layer < layers; layer += 1) {
    const next = new Uint8Array(current);
    for (let index = 0; index < current.length; index += 1) {
      if (current[index]) continue;
      const x = index % nx;
      const y = Math.floor(index / nx) % ny;
      const z = Math.floor(index / (nx * ny));
      for (const [dx, dy, dz] of neighbors) {
        const nxv = x + dx;
        const nyv = y + dy;
        const nzv = z + dz;
        if (nxv < 0 || nyv < 0 || nzv < 0 || nxv >= nx || nyv >= ny || nzv >= nz) continue;
        if (current[(nzv * ny + nyv) * nx + nxv]) {
          next[index] = 1;
          break;
        }
      }
    }
    current = next;
  }
  return current;
}

/** Grow void one cell into solids per layer so the skin hugs ridges instead of standing off. */
function nibbleSolidShell(
  voidMask: Uint8Array,
  occupied: Uint8Array,
  domain: Uint8Array,
  nx: number,
  ny: number,
  nz: number,
  layers: number,
) {
  let current = voidMask;
  const neighbors = [
    [-1, 0, 0],
    [1, 0, 0],
    [0, -1, 0],
    [0, 1, 0],
    [0, 0, -1],
    [0, 0, 1],
  ] as const;
  for (let layer = 0; layer < layers; layer += 1) {
    const next = new Uint8Array(current);
    for (let index = 0; index < occupied.length; index += 1) {
      if (!occupied[index] || !domain[index] || current[index]) continue;
      const x = index % nx;
      const y = Math.floor(index / nx) % ny;
      const z = Math.floor(index / (nx * ny));
      let touchesVoid = false;
      for (const [dx, dy, dz] of neighbors) {
        const nxv = x + dx;
        const nyv = y + dy;
        const nzv = z + dz;
        if (nxv < 0 || nyv < 0 || nzv < 0 || nxv >= nx || nyv >= ny || nzv >= nz) continue;
        if (current[(nzv * ny + nyv) * nx + nxv]) {
          touchesVoid = true;
          break;
        }
      }
      if (touchesVoid) next[index] = 1;
    }
    current = next;
  }
  return current;
}

type HeightField = {
  cell: number;
  buckets: Map<string, { minY: number; maxY: number }>;
  fallback: { minY: number; maxY: number };
};

/**
 * Plan-grid of solid vertex heights so the void ceiling/floor follows ridges
 * instead of one flat AABB band per cluster.
 */
function buildSolidHeightField(solids: readonly PositionedSolid[], cell: number): HeightField {
  const buckets = new Map<string, { minY: number; maxY: number }>();
  let globalMin = Infinity;
  let globalMax = -Infinity;
  const step = Math.max(1, Math.floor(cell));
  for (const solid of solids) {
    const positions = solid.positions;
    for (let index = 0; index < positions.length; index += 3 * step) {
      const x = positions[index];
      const y = positions[index + 1];
      const z = positions[index + 2];
      const key = `${Math.round(x / cell)}:${Math.round(z / cell)}`;
      const bucket = buckets.get(key);
      if (bucket) {
        bucket.minY = Math.min(bucket.minY, y);
        bucket.maxY = Math.max(bucket.maxY, y);
      } else {
        buckets.set(key, { minY: y, maxY: y });
      }
      globalMin = Math.min(globalMin, y);
      globalMax = Math.max(globalMax, y);
    }
  }
  return {
    cell,
    buckets,
    fallback: {
      minY: Number.isFinite(globalMin) ? globalMin : 0,
      maxY: Number.isFinite(globalMax) ? globalMax : 24,
    },
  };
}

/**
 * Soft Gaussian blend of nearby solid tops for the ceiling.
 * Floor is always the global ground — void rises from the ground under overhangs
 * instead of trailing the solid underside.
 */
function heightBandAt(x: number, z: number, field: HeightField) {
  const ix = Math.round(x / field.cell);
  const iz = Math.round(z / field.cell);
  let weightSum = 0;
  let maxY = 0;
  /** Wide sigma so height rolls as soft hills instead of stepped plateaus. */
  const sigma = field.cell * 5.5;
  const radius = 12;
  for (let dz = -radius; dz <= radius; dz += 1) {
    for (let dx = -radius; dx <= radius; dx += 1) {
      const bucket = field.buckets.get(`${ix + dx}:${iz + dz}`);
      if (!bucket) continue;
      const dist = Math.hypot(dx, dz) * field.cell;
      const weight = Math.exp(-(dist * dist) / (2 * sigma * sigma));
      weightSum += weight;
      maxY += bucket.maxY * weight;
    }
  }
  const pad = field.cell * 0.75;
  const ground = Math.min(0, field.fallback.minY) - pad;
  if (!(weightSum > 0)) {
    return { minY: ground, maxY: field.fallback.maxY + pad };
  }
  return {
    minY: ground,
    maxY: maxY / weightSum + pad,
  };
}

function clipVoidToSolidHeights(
  voidMask: Uint8Array,
  solids: readonly PositionedSolid[],
  origin: SitePoint,
  cell: number,
  nx: number,
  ny: number,
  nz: number,
) {
  const field = buildSolidHeightField(solids, Math.max(2, cell));
  if (field.buckets.size === 0) return voidMask;
  const next = new Uint8Array(voidMask);
  for (let index = 0; index < voidMask.length; index += 1) {
    if (!voidMask[index]) continue;
    const point = centerOf(index, origin, cell, nx, ny);
    const band = heightBandAt(point.x, point.z, field);
    /** Only clip the ceiling — floor stays at ground so overhangs fill from below. */
    if (point.y < band.minY || point.y > band.maxY) next[index] = 0;
  }
  return next;
}

/**
 * The cluster-void holding rule, limited to the supplied domain.
 * A cell counts only when two different solids face each other across it.
 * Empty domain cells that fail that test stay unclaimed.
 */
function holdBetween(
  surface: Uint16Array,
  occupied: Uint8Array,
  domain: Uint8Array,
  origin: SitePoint,
  cell: number,
  clearance: VoidClearance,
  nx: number,
  ny: number,
  nz: number,
) {
  const count = surface.length;
  const bestId = new Uint16Array(count);
  const bestDist = new Float32Array(count);
  const secondId = new Uint16Array(count);
  const secondDist = new Float32Array(count);
  bestDist.fill(1e9);
  secondDist.fill(1e9);
  const maxSteps = Math.max(2, Math.ceil(clearance.shelter / cell));
  const ids = new Set<number>();
  for (let index = 0; index < count; index += 1) if (surface[index]) ids.add(surface[index]);
  ids.forEach((id) => {
    const seen = new Uint8Array(count);
    const queue = new Int32Array(count);
    const steps = new Uint16Array(count);
    let tail = 0;
    for (let index = 0; index < count; index += 1) {
      if (surface[index] !== id) continue;
      seen[index] = 1;
      steps[index] = 1;
      queue[tail] = index;
      tail += 1;
    }
    for (let head = 0; head < tail; head += 1) {
      const index = queue[head];
      const travelled = steps[index];
      const dist = (travelled - 1) * cell;
      if (dist <= clearance.shelter && !occupied[index]) note(bestId, bestDist, secondId, secondDist, index, id, dist);
      if (travelled >= maxSteps) continue;
      const x = index % nx;
      const y = Math.floor(index / nx) % ny;
      const z = Math.floor(index / (nx * ny));
      const neighbors = [
        x > 0 ? index - 1 : -1,
        x + 1 < nx ? index + 1 : -1,
        y > 0 ? index - nx : -1,
        y + 1 < ny ? index + nx : -1,
        z > 0 ? index - nx * ny : -1,
        z + 1 < nz ? index + nx * ny : -1,
      ];
      for (const next of neighbors) {
        if (next < 0 || seen[next] || occupied[next]) continue;
        seen[next] = 1;
        steps[next] = travelled + 1;
        queue[tail] = next;
        tail += 1;
      }
    }
  });
  const accepted = new Uint8Array(count);
  for (let index = 0; index < count; index += 1) {
    if (!domain[index] || occupied[index]) continue;
    if (!bestId[index] || !secondId[index] || bestId[index] === secondId[index]) continue;
    if (bestDist[index] > clearance.shelter || secondDist[index] > clearance.shelter) continue;
    if (bestDist[index] + secondDist[index] < clearance.minimumGap) continue;
    if (!opposed(index, bestId[index], secondId[index], surface, nx, ny, nz)) continue;
    accepted[index] = 1;
  }
  return accepted;
}

function note(
  bestId: Uint16Array,
  bestDist: Float32Array,
  secondId: Uint16Array,
  secondDist: Float32Array,
  index: number,
  id: number,
  dist: number,
) {
  if (bestId[index] === id) {
    if (dist < bestDist[index]) bestDist[index] = dist;
    return;
  }
  if (secondId[index] === id) {
    if (dist < secondDist[index]) secondDist[index] = dist;
    return;
  }
  if (dist < bestDist[index]) {
    secondId[index] = bestId[index];
    secondDist[index] = bestDist[index];
    bestId[index] = id;
    bestDist[index] = dist;
    return;
  }
  if (dist < secondDist[index]) {
    secondId[index] = id;
    secondDist[index] = dist;
  }
}

/** True when the nearest surface samples of the two solids sit on opposite sides of the cell. */
function opposed(index: number, first: number, second: number, surface: Uint16Array, nx: number, ny: number, nz: number) {
  const a = nearestSurface(index, first, surface, nx, ny, nz);
  const b = nearestSurface(index, second, surface, nx, ny, nz);
  if (!a || !b) return false;
  const ax = a[0];
  const ay = a[1];
  const az = a[2];
  const bx = b[0];
  const by = b[1];
  const bz = b[2];
  const la = Math.hypot(ax, ay, az) || 1;
  const lb = Math.hypot(bx, by, bz) || 1;
  return (ax * bx + ay * by + az * bz) / (la * lb) < -0.15;
}

function nearestSurface(index: number, id: number, surface: Uint16Array, nx: number, ny: number, nz: number) {
  const sx = index % nx;
  const sy = Math.floor(index / nx) % ny;
  const sz = Math.floor(index / (nx * ny));
  let best = 1e9;
  let found: [number, number, number] | null = null;
  const reach = 6;
  for (let z = Math.max(0, sz - reach); z <= Math.min(nz - 1, sz + reach); z += 1) {
    for (let y = Math.max(0, sy - reach); y <= Math.min(ny - 1, sy + reach); y += 1) {
      const row = (z * ny + y) * nx;
      for (let x = Math.max(0, sx - reach); x <= Math.min(nx - 1, sx + reach); x += 1) {
        if (surface[row + x] !== id) continue;
        const dx = x - sx;
        const dy = y - sy;
        const dz = z - sz;
        const dist = dx * dx + dy * dy + dz * dz;
        if (dist >= best) continue;
        best = dist;
        found = [dx, dy, dz];
      }
    }
  }
  return found;
}

function dropSmall(mask: Uint8Array, nx: number, ny: number, nz: number, cell: number, minimum: number) {
  const next = mask.slice();
  const seen = new Uint8Array(mask.length);
  const voxel = cell * cell * cell;
  for (let start = 0; start < mask.length; start += 1) {
    if (!mask[start] || seen[start]) continue;
    const cells: number[] = [];
    const queue = [start];
    seen[start] = 1;
    for (let cursor = 0; cursor < queue.length; cursor += 1) {
      const index = queue[cursor];
      cells.push(index);
      for (const neighbor of neighborsOf(index, nx, ny, nz)) {
        if (neighbor < 0 || seen[neighbor] || !mask[neighbor]) continue;
        seen[neighbor] = 1;
        queue.push(neighbor);
      }
    }
    if (cells.length * voxel >= minimum) continue;
    cells.forEach((index) => {
      next[index] = 0;
    });
  }
  return next;
}

function components(mask: Uint8Array, nx: number, ny: number, nz: number) {
  const seen = new Uint8Array(mask.length);
  let count = 0;
  for (let start = 0; start < mask.length; start += 1) {
    if (!mask[start] || seen[start]) continue;
    count += 1;
    const queue = [start];
    seen[start] = 1;
    for (let cursor = 0; cursor < queue.length; cursor += 1) {
      for (const neighbor of neighborsOf(queue[cursor], nx, ny, nz)) {
        if (neighbor < 0 || seen[neighbor] || !mask[neighbor]) continue;
        seen[neighbor] = 1;
        queue.push(neighbor);
      }
    }
  }
  return count;
}

function neighborsOf(index: number, nx: number, ny: number, nz: number) {
  const x = index % nx;
  const y = Math.floor(index / nx) % ny;
  const z = Math.floor(index / (nx * ny));
  return [
    x > 0 ? index - 1 : -1,
    x + 1 < nx ? index + 1 : -1,
    y > 0 ? index - nx : -1,
    y + 1 < ny ? index + nx : -1,
    z > 0 ? index - nx * ny : -1,
    z + 1 < nz ? index + nx * ny : -1,
  ];
}

function boundaryOf(combined: Uint8Array, origin: SitePoint, cell: number, nx: number, ny: number, nz: number): IsoMesh {
  const positions: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];
  const pushFace = (x: number, y: number, z: number, normal: [number, number, number]) => {
    const base = positions.length / 3;
    const corners = faceCorners(x, y, z, normal);
    corners.forEach((cornerPoint) => {
      positions.push(origin.x + cornerPoint[0] * cell, origin.y + cornerPoint[1] * cell, origin.z + cornerPoint[2] * cell);
      normals.push(normal[0], normal[1], normal[2]);
    });
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  };
  for (let z = 0; z < nz; z += 1) {
    for (let y = 0; y < ny; y += 1) {
      for (let x = 0; x < nx; x += 1) {
        const index = (z * ny + y) * nx + x;
        if (!combined[index]) continue;
        if (x === 0 || !combined[index - 1]) pushFace(x, y, z, [-1, 0, 0]);
        if (x + 1 === nx || !combined[index + 1]) pushFace(x, y, z, [1, 0, 0]);
        if (y === 0 || !combined[index - nx]) pushFace(x, y, z, [0, -1, 0]);
        if (y + 1 === ny || !combined[index + nx]) pushFace(x, y, z, [0, 1, 0]);
        if (z === 0 || !combined[index - nx * ny]) pushFace(x, y, z, [0, 0, -1]);
        if (z + 1 === nz || !combined[index + nx * ny]) pushFace(x, y, z, [0, 0, 1]);
      }
    }
  }
  return {
    positions: Float32Array.from(positions),
    normals: Float32Array.from(normals),
    indices: Uint32Array.from(indices),
    triangles: indices.length / 3,
  };
}

function faceCorners(x: number, y: number, z: number, normal: [number, number, number]): [number, number, number][] {
  if (normal[0] === -1) return [[x, y, z], [x, y, z + 1], [x, y + 1, z + 1], [x, y + 1, z]];
  if (normal[0] === 1) return [[x + 1, y, z], [x + 1, y + 1, z], [x + 1, y + 1, z + 1], [x + 1, y, z + 1]];
  if (normal[1] === -1) return [[x, y, z], [x + 1, y, z], [x + 1, y, z + 1], [x, y, z + 1]];
  if (normal[1] === 1) return [[x, y + 1, z], [x, y + 1, z + 1], [x + 1, y + 1, z + 1], [x + 1, y + 1, z]];
  if (normal[2] === -1) return [[x, y, z], [x, y + 1, z], [x + 1, y + 1, z], [x + 1, y, z]];
  return [[x, y, z + 1], [x + 1, y, z + 1], [x + 1, y + 1, z + 1], [x, y + 1, z + 1]];
}

function corner(positions: Float32Array, index: number) {
  return { x: positions[index * 3], y: positions[index * 3 + 1], z: positions[index * 3 + 2] };
}

function pointTriangle(
  point: SitePoint,
  a: SitePoint,
  b: SitePoint,
  c: SitePoint,
) {
  const ab = sub(b, a);
  const ac = sub(c, a);
  const ap = sub(point, a);
  const d1 = dot(ab, ap);
  const d2 = dot(ac, ap);
  if (d1 <= 0 && d2 <= 0) return length(ap);
  const bp = sub(point, b);
  const d3 = dot(ab, bp);
  const d4 = dot(ac, bp);
  if (d3 >= 0 && d4 <= d3) return length(bp);
  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) return length(sub(point, add(a, scale(ab, d1 / (d1 - d3)))));
  const cp = sub(point, c);
  const d5 = dot(ab, cp);
  const d6 = dot(ac, cp);
  if (d6 >= 0 && d5 <= d6) return length(cp);
  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) return length(sub(point, add(a, scale(ac, d2 / (d2 - d6)))));
  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) {
    const w = (d4 - d3) / ((d4 - d3) + (d5 - d6));
    return length(sub(point, add(b, scale(sub(c, b), w))));
  }
  const denom = 1 / (va + vb + vc);
  return length(sub(point, add(a, add(scale(ab, vb * denom), scale(ac, vc * denom)))));
}

function sub(a: SitePoint, b: SitePoint): SitePoint {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}
function add(a: SitePoint, b: SitePoint): SitePoint {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}
function scale(a: SitePoint, k: number): SitePoint {
  return { x: a.x * k, y: a.y * k, z: a.z * k };
}
function dot(a: SitePoint, b: SitePoint) {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}
function length(a: SitePoint) {
  return Math.hypot(a.x, a.y, a.z);
}

function continuousOf(
  request: NetworkVoidRequest,
  boundary: IsoMesh,
): { continuous: IsoMesh | null; continuousRole: "preliminary-continuous-boundary"; continuousNote: string } {
  if (!request.continuous || boundary.triangles < 4) {
    return { continuous: null, continuousRole: "preliminary-continuous-boundary", continuousNote: "Continuous boundary was not requested." };
  }
  const wrap = filmWrapDistanceChunked([{ positions: boundary.positions, indices: boundary.indices }], request.cell);
  if (!wrap) {
    return { continuous: null, continuousRole: "preliminary-continuous-boundary", continuousNote: "Distance-field reconstruction returned no surface. The voxel boundary is unchanged." };
  }
  return {
    continuous: wrap.mesh,
    continuousRole: "preliminary-continuous-boundary",
    continuousNote: `Distance field at ${request.cell} ft. Open edges ${wrap.openEdges}. Degenerate edges ${wrap.degenerateEdges}. ${wrap.chunks} chunk(s). The occupancy masks were not changed.`,
  };
}

/**
 * Same cell size as the request. Used when a dense grid would exceed two million cells.
 * Each solid is filled inside its own bounds. The site is not stored as one array.
 */
function generateChunked(
  request: NetworkVoidRequest,
  bounds: { minX: number; minY: number; minZ: number; maxX: number; maxY: number; maxZ: number },
  cell: number,
): NetworkVoidResult {
  const origin = { x: bounds.minX - cell, y: bounds.minY - cell, z: bounds.minZ - cell };
  const keyOf = (x: number, y: number, z: number) => `${x}:${y}:${z}`;
  const parse = (key: string) => key.split(":").map(Number) as [number, number, number];
  const world = (x: number, y: number, z: number): SitePoint => ({
    x: origin.x + (x + 0.5) * cell,
    y: origin.y + (y + 0.5) * cell,
    z: origin.z + (z + 0.5) * cell,
  });
  const occupied = new Set<string>();
  const surface = new Map<string, number>();
  const triangleStep = Math.max(1, Math.floor(request.triangleStep ?? 1));
  request.solids.forEach((solid, index) => {
    const id = index + 1;
    let minX = Infinity;
    let minY = Infinity;
    let minZ = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    let maxZ = -Infinity;
    for (let vertex = 0; vertex < solid.positions.length; vertex += 3) {
      minX = Math.min(minX, solid.positions[vertex]);
      minY = Math.min(minY, solid.positions[vertex + 1]);
      minZ = Math.min(minZ, solid.positions[vertex + 2]);
      maxX = Math.max(maxX, solid.positions[vertex]);
      maxY = Math.max(maxY, solid.positions[vertex + 1]);
      maxZ = Math.max(maxZ, solid.positions[vertex + 2]);
    }
    const nx = Math.ceil((maxX - minX) / cell) + 3;
    const ny = Math.ceil((maxY - minY) / cell) + 3;
    const nz = Math.ceil((maxZ - minZ) / cell) + 3;
    if (nx * ny * nz > 1_000_000) return;
    const localOrigin = { x: minX - cell, y: minY - cell, z: minZ - cell };
    const shell = new Uint16Array(nx * ny * nz);
    const filled = new Uint8Array(nx * ny * nz);
    rasterize(solid, shell, id, localOrigin, cell, nx, ny, nz, triangleStep);
    fillSolidInteriors(shell, filled, nx, ny, nz);
    for (let z = 0; z < nz; z += 1) {
      for (let y = 0; y < ny; y += 1) {
        for (let x = 0; x < nx; x += 1) {
          const local = (z * ny + y) * nx + x;
          if (!filled[local] && !shell[local]) continue;
          const point = { x: localOrigin.x + (x + 0.5) * cell, y: localOrigin.y + (y + 0.5) * cell, z: localOrigin.z + (z + 0.5) * cell };
          const gx = Math.round((point.x - origin.x) / cell - 0.5);
          const gy = Math.round((point.y - origin.y) / cell - 0.5);
          const gz = Math.round((point.z - origin.z) / cell - 0.5);
          const key = keyOf(gx, gy, gz);
          occupied.add(key);
          if (shell[local]) surface.set(key, id);
        }
      }
    }
  });
  const accepted = new Set<string>();
  if (request.acceptance === "open-domain") {
    const nx = Math.ceil((bounds.maxX - bounds.minX) / cell) + 3;
    const ny = Math.ceil((bounds.maxY - bounds.minY) / cell) + 3;
    const nz = Math.ceil((bounds.maxZ - bounds.minZ) / cell) + 3;
    const field = request.followSolidHeights
      ? buildSolidHeightField(request.solids, Math.max(2, cell))
      : null;
    const morphologyReach = Math.max(0, Math.floor(request.solidMorphologyCells ?? 0));
    const clearanceReach = Math.max(0, Math.floor(request.solidClearanceCells ?? 0));
    const nearSolid = morphologyReach > 0
      ? dilateKeySet(occupied, morphologyReach)
      : null;
    const blocked = clearanceReach > 0
      ? dilateKeySet(occupied, clearanceReach)
      : occupied;
    for (let z = 0; z < nz; z += 1) {
      for (let y = 0; y < ny; y += 1) {
        for (let x = 0; x < nx; x += 1) {
          const key = keyOf(x, y, z);
          if (blocked.has(key)) continue;
          const point = world(x, y, z);
          if (!insideDomain(point, request.domain)) continue;
          if (nearSolid && !nearSolid.has(key)) continue;
          if (field && field.buckets.size > 0) {
            const band = heightBandAt(point.x, point.z, field);
            if (point.y < band.minY || point.y > band.maxY) continue;
          }
          accepted.add(key);
        }
      }
    }
  } else {
    const steps = Math.max(2, Math.ceil(request.clearance.shelter / cell));
    const ids = new Set(surface.values());
    ids.forEach((id) => {
      const seen = new Set<string>();
      const queue: { key: string; step: number }[] = [];
      surface.forEach((solidId, key) => {
        if (solidId !== id || seen.has(key)) return;
        seen.add(key);
        queue.push({ key, step: 1 });
      });
      for (let head = 0; head < queue.length; head += 1) {
        const current = queue[head];
        if (current.step >= steps) continue;
        const [x, y, z] = parse(current.key);
        for (const [dx, dy, dz] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]] as const) {
          const next = keyOf(x + dx, y + dy, z + dz);
          if (seen.has(next) || occupied.has(next)) continue;
          seen.add(next);
          queue.push({ key: next, step: current.step + 1 });
          const point = world(x + dx, y + dy, z + dz);
          if (!insideDomain(point, request.domain)) continue;
          const other = [...ids].find((candidate) => candidate !== id && nearSurface(surface, keyOf(x + dx, y + dy, z + dz), candidate, steps));
          if (!other) continue;
          if (current.step * cell < request.clearance.minimumGap / 2) continue;
          accepted.add(next);
        }
      }
    });
  }
  let leaked = 0;
  let solidConflicts = 0;
  occupied.forEach((key) => {
    const [x, y, z] = parse(key);
    if (!insideDomain(world(x, y, z), request.domain)) solidConflicts += 1;
  });
  accepted.forEach((key) => {
    const [x, y, z] = parse(key);
    if (!insideDomain(world(x, y, z), request.domain) || occupied.has(key)) leaked += 1;
  });
  const voxel = cell * cell * cell;
  const boundary = boundaryFromKeys(occupied, accepted, origin, cell);
  const voidMesh = boundaryFromKeys(new Set(), accepted, origin, cell);
  return {
    contract: NETWORK_VOID_CONTRACT,
    provisional: request.domain.provisional,
    domainSource: request.domain.source,
    grid: { origin, cell, nx: Math.ceil((bounds.maxX - bounds.minX) / cell) + 3, ny: Math.ceil((bounds.maxY - bounds.minY) / cell) + 3, nz: Math.ceil((bounds.maxZ - bounds.minZ) / cell) + 3 },
    occupied: new Uint8Array(0),
    void: new Uint8Array(0),
    domain: new Uint8Array(0),
    occupiedCount: occupied.size,
    voidCount: accepted.size,
    domainCount: 0,
    unclaimedDomain: 0,
    voidComponents: componentCount(accepted),
    voidCubicFeet: accepted.size * voxel,
    occupiedCubicFeet: occupied.size * voxel,
    leaked,
    solidConflicts,
    processing: "chunked",
    boundary,
    boundaryRole: "preliminary-voxel-boundary",
    voidMesh,
    voidMeshRole: "accepted-void-volume",
    ...continuousOf(request, boundary),
  };
}

/** Expand a sparse key set by neighbor layers (chunked morphology / clearance). */
function dilateKeySet(seeds: Set<string>, layers: number) {
  let current = new Set(seeds);
  for (let layer = 0; layer < layers; layer += 1) {
    const next = new Set(current);
    current.forEach((key) => {
      const [x, y, z] = key.split(":").map(Number);
      for (const [dx, dy, dz] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]] as const) {
        next.add(`${x + dx}:${y + dy}:${z + dz}`);
      }
    });
    current = next;
  }
  return current;
}

function nearSurface(surface: Map<string, number>, key: string, id: number, reach: number) {
  const [x, y, z] = key.split(":").map(Number);
  for (let dz = -reach; dz <= reach; dz += 1) {
    for (let dy = -reach; dy <= reach; dy += 1) {
      for (let dx = -reach; dx <= reach; dx += 1) {
        if (surface.get(`${x + dx}:${y + dy}:${z + dz}`) === id) return true;
      }
    }
  }
  return false;
}

function componentCount(cells: Set<string>) {
  const seen = new Set<string>();
  let count = 0;
  cells.forEach((start) => {
    if (seen.has(start)) return;
    count += 1;
    const queue = [start];
    seen.add(start);
    for (let head = 0; head < queue.length; head += 1) {
      const [x, y, z] = queue[head].split(":").map(Number);
      for (const [dx, dy, dz] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]] as const) {
        const next = `${x + dx}:${y + dy}:${z + dz}`;
        if (!cells.has(next) || seen.has(next)) continue;
        seen.add(next);
        queue.push(next);
      }
    }
  });
  return count;
}

function boundaryFromKeys(occupied: Set<string>, voids: Set<string>, origin: SitePoint, cell: number): IsoMesh {
  const combined = new Set<string>(occupied);
  voids.forEach((key) => combined.add(key));
  const positions: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];
  combined.forEach((key) => {
    const [x, y, z] = key.split(":").map(Number);
    const faces: [number, number, number, string][] = [[-1, 0, 0, `${x - 1}:${y}:${z}`], [1, 0, 0, `${x + 1}:${y}:${z}`], [0, -1, 0, `${x}:${y - 1}:${z}`], [0, 1, 0, `${x}:${y + 1}:${z}`], [0, 0, -1, `${x}:${y}:${z - 1}`], [0, 0, 1, `${x}:${y}:${z + 1}`]];
    faces.forEach(([nx, ny, nz, neighbor]) => {
      if (combined.has(neighbor)) return;
      const base = positions.length / 3;
      const corners = faceCorners(x, y, z, [nx, ny, nz]);
      corners.forEach((cornerPoint) => {
        positions.push(origin.x + cornerPoint[0] * cell, origin.y + cornerPoint[1] * cell, origin.z + cornerPoint[2] * cell);
        normals.push(nx, ny, nz);
      });
      indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
    });
  });
  return {
    positions: Float32Array.from(positions),
    normals: Float32Array.from(normals),
    indices: Uint32Array.from(indices),
    triangles: indices.length / 3,
  };
}
