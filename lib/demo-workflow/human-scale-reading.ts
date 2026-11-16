import type { IsoMesh } from "@/lib/scan/isomesh";

/**
 * Reads a stored 20 ft module against a 6 ft body.
 * A figure stands on the top of the mesh or on the cube's ground plane.
 * The line names what that void suggests. It is not a use.
 */

const HALF = 10;
const N = 16;
const CELL = 20 / N;
const BODY = 6.05;

export type ScaleMark = "ground" | "shelter" | "height" | "passage" | "opening";

export type ScaleFigure = {
  x: number;
  z: number;
  floor: number;
  /** Feet on the mesh. False means the cube's ground plane. */
  mesh: boolean;
};

export type ScaleReading = {
  line: string;
  figures: ScaleFigure[];
  mark: ScaleMark;
  axis?: { x: number; z: number };
};

type HitMap = number[][];

type Place = {
  ix: number;
  iz: number;
  floor: number;
  clearance: number;
  cover: number | null;
  mesh: boolean;
  sides: number;
  opposite: boolean;
  rim: boolean;
};

function clampIndex(value: number) {
  return Math.min(N - 1, Math.max(0, value));
}

function cellCenter(index: number) {
  return -HALF + (index + 0.5) * CELL;
}

function emptyHits(): HitMap {
  return Array.from({ length: N * N }, () => []);
}

/** Triangle crossings of column centers, along one module axis. */
function collect(mesh: IsoMesh, axis: "x" | "y" | "z"): HitMap {
  const map = emptyHits();
  const p = mesh.positions;
  const index = mesh.indices;
  for (let i = 0; i < index.length; i += 3) {
    const a = index[i] * 3;
    const b = index[i + 1] * 3;
    const c = index[i + 2] * 3;
    const ax = p[a];
    const ay = p[a + 1];
    const az = p[a + 2];
    const bx = p[b];
    const by = p[b + 1];
    const bz = p[b + 2];
    const cx = p[c];
    const cy = p[c + 1];
    const cz = p[c + 2];
    const au = axis === "x" ? ay : ax;
    const av = axis === "x" ? az : axis === "y" ? az : ay;
    const bu = axis === "x" ? by : bx;
    const bv = axis === "x" ? bz : axis === "y" ? bz : by;
    const cu = axis === "x" ? cy : cx;
    const cv = axis === "x" ? cz : axis === "y" ? cz : cy;
    const ah = axis === "x" ? ax : axis === "y" ? ay : az;
    const bh = axis === "x" ? bx : axis === "y" ? by : bz;
    const ch = axis === "x" ? cx : axis === "y" ? cy : cz;
    const d1u = bu - au;
    const d1v = bv - av;
    const d2u = cu - au;
    const d2v = cv - av;
    const det = d1u * d2v - d2u * d1v;
    if (Math.abs(det) < 1e-5) continue;
    const i0 = clampIndex(Math.floor((Math.min(au, bu, cu) + HALF) / CELL));
    const i1 = clampIndex(Math.floor((Math.max(au, bu, cu) + HALF) / CELL));
    const j0 = clampIndex(Math.floor((Math.min(av, bv, cv) + HALF) / CELL));
    const j1 = clampIndex(Math.floor((Math.max(av, bv, cv) + HALF) / CELL));
    for (let iu = i0; iu <= i1; iu += 1) {
      for (let iv = j0; iv <= j1; iv += 1) {
        const pu = cellCenter(iu) - au;
        const pv = cellCenter(iv) - av;
        const s = (pu * d2v - d2u * pv) / det;
        const t = (d1u * pv - pu * d1v) / det;
        if (s < -1e-4 || t < -1e-4 || s + t > 1 + 1e-4) continue;
        map[iu * N + iv].push(ah + s * (bh - ah) + t * (ch - ah));
      }
    }
  }
  for (const hits of map) {
    hits.sort((left, right) => left - right);
    let write = 0;
    for (let read = 0; read < hits.length; read += 1) {
      if (write === 0 || hits[read] - hits[write - 1] > 0.2) hits[write++] = hits[read];
    }
    hits.length = write;
  }
  return map;
}

function oddAbove(hits: readonly number[], value: number) {
  let count = 0;
  for (let i = hits.length - 1; i >= 0; i -= 1) {
    if (hits[i] <= value + 0.05) break;
    count += 1;
  }
  return count % 2 === 1;
}

function massOf(alongX: HitMap, alongY: HitMap, alongZ: HitMap) {
  const mass = new Uint8Array(N * N * N);
  for (let iy = 0; iy < N; iy += 1) {
    for (let iz = 0; iz < N; iz += 1) {
      for (let ix = 0; ix < N; ix += 1) {
        const y = cellCenter(iy);
        const inside = oddAbove(alongY[ix * N + iz], y)
          || oddAbove(alongX[iy * N + iz], cellCenter(ix))
          || oddAbove(alongZ[ix * N + iy], cellCenter(iz));
        if (inside) mass[(iy * N + iz) * N + ix] = 1;
      }
    }
  }
  return mass;
}

function at(mass: Uint8Array, ix: number, iy: number, iz: number) {
  if (ix < 0 || iy < 0 || iz < 0 || ix >= N || iy >= N || iz >= N) return 0;
  return mass[(iy * N + iz) * N + ix];
}

function bodyClear(mass: Uint8Array, ix: number, iz: number, floor: number) {
  for (let y = floor + 0.45; y <= floor + BODY - 0.15; y += CELL * 0.5) {
    const iy = clampIndex(Math.floor((y + HALF) / CELL));
    if (at(mass, ix, iy, iz) === 1) return false;
  }
  return true;
}

function sidesAt(mass: Uint8Array, ix: number, iz: number, chest: number) {
  const iy = clampIndex(Math.floor((chest + HALF) / CELL));
  const blocked = (dx: number, dz: number) => {
    for (let step = 1; step <= 2; step += 1) {
      if (at(mass, ix + dx * step, iy, iz + dz * step) === 1) return true;
    }
    return false;
  };
  const north = blocked(0, -1);
  const south = blocked(0, 1);
  const west = blocked(-1, 0);
  const east = blocked(1, 0);
  return {
    count: Number(north) + Number(south) + Number(west) + Number(east),
    opposite: (north && south) || (west && east),
  };
}

function placesOf(mass: Uint8Array, alongY: HitMap): Place[] {
  const found: Place[] = [];
  for (let iz = 0; iz < N; iz += 1) {
    for (let ix = 0; ix < N; ix += 1) {
      const hits = alongY[ix * N + iz];
      const usable = hits.length % 2 === 0 ? hits : hits.slice(0, -1);
      const solids: Array<[number, number]> = [];
      for (let i = 0; i < usable.length; i += 2) {
        if (usable[i + 1] - usable[i] > 0.25) solids.push([usable[i], usable[i + 1]]);
      }
      const gaps: Array<{ floor: number; clearance: number; mesh: boolean }> = [];
      let cursor = -HALF;
      let meshCursor = false;
      for (const [start, end] of solids) {
        const clearance = start - cursor;
        if (clearance >= BODY) gaps.push({ floor: cursor, clearance, mesh: meshCursor });
        cursor = end;
        meshCursor = true;
      }
      if (HALF - cursor >= BODY) gaps.push({ floor: cursor, clearance: HALF - cursor, mesh: meshCursor });
      for (const gap of gaps) {
        if (gap.floor > 6) continue;
        if (!gap.mesh && gap.floor > -HALF + 0.4) continue;
        if (!bodyClear(mass, ix, iz, gap.floor)) continue;
        const coverHit = solids.find(([start]) => start > gap.floor + 1);
        const cover = coverHit ? coverHit[0] - gap.floor : null;
        const around = sidesAt(mass, ix, iz, gap.floor + 3.6);
        found.push({
          ix,
          iz,
          floor: gap.floor,
          clearance: gap.clearance,
          cover,
          mesh: gap.mesh,
          sides: around.count,
          opposite: around.opposite,
          rim: ix === 0 || iz === 0 || ix === N - 1 || iz === N - 1,
        });
      }
    }
  }
  return found;
}

function clusters(list: readonly Place[]) {
  const key = (place: Place) => place.ix * N + place.iz;
  const byCell = new Map(list.map((place) => [key(place), place]));
  const seen = new Set<number>();
  const groups: Place[][] = [];
  for (const place of list) {
    if (seen.has(key(place))) continue;
    const group: Place[] = [];
    const queue = [place];
    seen.add(key(place));
    while (queue.length > 0) {
      const current = queue.pop();
      if (!current) break;
      group.push(current);
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const next = byCell.get((current.ix + dx) * N + (current.iz + dz));
        if (!next || seen.has(key(next)) || Math.abs(next.floor - current.floor) > 1.6) continue;
        seen.add(key(next));
        queue.push(next);
      }
    }
    groups.push(group);
  }
  return groups.sort((left, right) => right.length - left.length);
}

function visible(mass: Uint8Array, place: Place) {
  const x = cellCenter(place.ix);
  const y = place.floor + 3.2;
  const z = cellCenter(place.iz);
    for (let step = 1; step <= 18; step += 1) {
    const t = step * 0.35;
    const px = x + t;
    const py = y - t;
    const pz = z - t;
    if (py < -HALF || Math.abs(px) > HALF || Math.abs(pz) > HALF) return true;
    const ix = clampIndex(Math.floor((px + HALF) / CELL));
    const iy = clampIndex(Math.floor((py + HALF) / CELL));
    const iz = clampIndex(Math.floor((pz + HALF) / CELL));
    if (at(mass, ix, iy, iz) === 1) return false;
  }
  return true;
}

function nearer(left: Place, right: Place) {
  const depth = (place: Place) => place.floor - cellCenter(place.ix) + cellCenter(place.iz);
  return depth(left) - depth(right);
}

function nearest(list: readonly Place[], mass: Uint8Array) {
  const open = list.filter((place) => visible(mass, place));
  if (open.length === 0) return undefined;
  return [...open].sort(nearer)[0];
}

function stand(preferred: readonly Place[], mass: Uint8Array, places: readonly Place[]) {
  return nearest(preferred, mass)
    ?? nearest(places.filter((place) => !place.mesh), mass)
    ?? preferred[0]
    ?? places[0];
}

function figureAt(place: Place): ScaleFigure {
  return { x: cellCenter(place.ix), z: cellCenter(place.iz), floor: place.floor, mesh: place.mesh };
}

function apart(left: Place, right: Place) {
  const dx = left.ix - right.ix;
  const dz = left.iz - right.iz;
  return dx * dx + dz * dz >= 16;
}

const GROUND: ScaleReading = {
  line: "No clear standing room",
  figures: [{ x: 0, z: 6, floor: -HALF, mesh: false }],
  mark: "ground",
};

function feet(value: number) {
  return Math.round(value);
}

function coverSpread(group: readonly Place[]) {
  let low = Infinity;
  let high = 0;
  for (const place of group) {
    const cover = place.cover ?? 0;
    low = Math.min(low, cover);
    high = Math.max(high, cover);
  }
  return high - low;
}

/** Where a 6 ft body can stand, and the void that placement makes legible. */
export function readHumanScale(mesh: IsoMesh | null): ScaleReading {
  if (!mesh || mesh.triangles < 1) return GROUND;
  const alongX = collect(mesh, "x");
  const alongY = collect(mesh, "y");
  const alongZ = collect(mesh, "z");
  const mass = massOf(alongX, alongY, alongZ);
  const places = placesOf(mass, alongY);
  if (places.length === 0) return GROUND;

  const tall = places.filter((place) => place.clearance >= 12 && place.sides >= 2 && !place.rim);
  const sheltered = places.filter((place) => place.cover !== null && place.cover >= 6.3 && place.cover <= 10.4);
  const shelterGroup = clusters(sheltered).find((group) => group.length >= 3) ?? [];
  const meshFloors = places.filter((place) => place.mesh);
  const floorMin = meshFloors.reduce((low, place) => Math.min(low, place.floor), HALF);
  const floorMax = meshFloors.reduce((high, place) => Math.max(high, place.floor), -HALF);
  const spot = shelterGroup.length ? stand(shelterGroup, mass, places) : null;
  const clear = feet(spot?.cover ?? 8);
  const rise = feet((spot?.floor ?? -HALF) + HALF);
  let bottom = HALF;
  for (let iy = 0; iy < N && bottom === HALF; iy += 1) {
    for (let i = 0; i < N * N; i += 1) {
      if (mass[iy * N * N + i] === 1) {
        bottom = cellCenter(iy);
        break;
      }
    }
  }

  if (floorMin > 0 && shelterGroup.length >= 12 && spot) {
    const top = [...meshFloors].filter((place) => place.floor > 0 && place.clearance >= BODY && visible(mass, place)).sort(nearer).find((place) => apart(place, spot));
    return {
      line: `Plate overhead · ${clear} ft clear`,
      figures: top ? [figureAt(spot), figureAt(top)] : [figureAt(spot)],
      mark: "shelter",
    };
  }

  if (bottom > -6 && meshFloors.length < 8) {
    const covered = places.filter((place) => !place.mesh && place.cover !== null);
    const under = stand(covered.length > 0 ? covered : places.filter((place) => !place.mesh), mass, places);
    return { line: "Mass above open ground", figures: [figureAt(under)], mark: "shelter" };
  }

  const full = tall.filter((place) => place.clearance >= 16);
  if (full.length >= 2) {
    const opening = stand(full, mass, places);
    const height = feet(opening.clearance);
    let line = `Full-height opening · ${height} ft`;
    if (shelterGroup.length >= 12) line = "Full-height gap beside covered ground";
    else if (shelterGroup.length >= 6) line = `Tall opening through the mass · ${height} ft`;
    else if (floorMax < 0) line = "Full-height opening beside a low mass";
    return { line, figures: [figureAt(opening)], mark: "height" };
  }

  if (spot?.mesh && shelterGroup.length >= 12) {
    const line = floorMax > 0 ? `Covered surface ${rise} ft up · mass above` : `Covered surface ${rise} ft up`;
    return { line, figures: [figureAt(spot)], mark: "shelter" };
  }

  if (spot && !spot.mesh && shelterGroup.length >= 10) {
    const line = coverSpread(shelterGroup) >= 2.2 ? "Clearance opens under the mass" : `Covered edge · ${clear} ft`;
    return { line, figures: [figureAt(spot)], mark: "shelter" };
  }

  if (spot?.mesh && shelterGroup.length >= 5) {
    const line = shelterGroup.length < 6 ? `Small covered patch · ${rise} ft up` : `Covered surface · ${rise} ft up`;
    return { line, figures: [figureAt(spot)], mark: "shelter" };
  }

  if (spot && !spot.mesh && shelterGroup.length >= 5) {
    return { line: `Short covered edge · ${clear} ft`, figures: [figureAt(spot)], mark: "shelter" };
  }

  if (meshFloors.length >= 3 && floorMax < -3 && shelterGroup.length < 5) {
    const low = stand(meshFloors, mass, places);
    return { line: "Low surface in the mass", figures: [figureAt(low)], mark: "ground" };
  }

  const ground = stand(places.filter((place) => !place.mesh), mass, places);
  return { line: "Open volume", figures: [figureAt(ground)], mark: "ground" };
}
