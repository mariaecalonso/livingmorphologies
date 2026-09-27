import { buildArchitecturalFields } from "./topology";
import type {
  ArchitectureReading,
  BiologicalTranslation,
  CellClass,
  Point,
  SimulationState,
} from "./types";

const idx = (x: number, y: number, size: number) => y * size + x;

function flood(
  size: number,
  start: Point,
  enter: (x: number, y: number) => boolean,
) {
  const seen = new Array<boolean>(size * size).fill(false);
  const sx = Math.max(0, Math.min(size - 1, Math.round(start.x)));
  const sy = Math.max(0, Math.min(size - 1, Math.round(start.y)));
  const stack: Point[] = [{ x: sx, y: sy }];
  if (!enter(sx, sy)) return seen;
  seen[idx(sx, sy, size)] = true;
  while (stack.length > 0) {
    const cell = stack.pop();
    if (!cell) break;
    for (const [ox, oy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      const x = cell.x + ox;
      const y = cell.y + oy;
      if (x < 0 || y < 0 || x >= size || y >= size) continue;
      const i = idx(x, y, size);
      if (seen[i] || !enter(x, y)) continue;
      seen[i] = true;
      stack.push({ x, y });
    }
  }
  return seen;
}

function neighbors(x: number, y: number, size: number) {
  const cells: Point[] = [];
  for (const [ox, oy] of [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ] as const) {
    const nx = x + ox;
    const ny = y + oy;
    if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
    cells.push({ x: nx, y: ny });
  }
  return cells;
}

/**
 * Layer 4: architectural topology.
 * The Physarum skeleton informs occupancy; occupancy becomes mass, void, room, wall.
 */
export function readArchitecture(
  state: SimulationState,
  translation: BiologicalTranslation,
): ArchitectureReading {
  const size = state.size;
  const fields = buildArchitecturalFields(state, translation);
  const cells = new Array<CellClass>(size * size).fill("void");
  const floors: Point[] = [];
  const voids: Point[] = [];
  const rooms: Point[] = [];
  const primaryVoids: Point[] = [];
  const strong: Point[] = [];
  const secondary: Point[] = [];
  const weak: Point[] = [];
  const walls: ArchitectureReading["walls"] = [];

  if (fields.kind === "around-absence") {
    const maxCore = translation.recipe.isolationRadius * 1.4;
    const core = flood(size, state.attractor, (x, y) => {
      const i = idx(x, y, size);
      const dist = Math.hypot(x - state.attractor.x, y - state.attractor.y);
      return dist <= maxCore && fields.voidField[i] >= 0.46 && fields.massField[i] < 0.34;
    });
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const i = idx(x, y, size);
        const point = { x, y };
        if (core[i]) {
          cells[i] = "primary-void";
          primaryVoids.push(point);
          voids.push(point);
          continue;
        }
        if (fields.massField[i] >= 0.22) {
          cells[i] = "mass";
          floors.push(point);
          strong.push(point);
        } else if (fields.massField[i] >= 0.14 || fields.trailNorm[i] >= 0.18) {
          cells[i] = "circulation";
          secondary.push(point);
        } else if (fields.massField[i] >= 0.1) {
          cells[i] = "secondary";
          weak.push(point);
        } else {
          voids.push(point);
        }
      }
    }
  } else if (fields.kind === "contained-interior") {
    const interior = flood(size, state.attractor, (x, y) => {
      const i = idx(x, y, size);
      return fields.interiorField[i] >= 0.52;
    });
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const i = idx(x, y, size);
        const point = { x, y };
        if (interior[i] || (fields.interiorField[i] >= 0.62 && fields.massField[i] < 0.35)) {
          cells[i] = "room";
          rooms.push(point);
          continue;
        }
        if (fields.massField[i] >= 0.36) {
          cells[i] = "mass";
          floors.push(point);
          strong.push(point);
        } else if (fields.trailNorm[i] >= 0.2 || fields.massField[i] >= 0.24) {
          cells[i] = "circulation";
          secondary.push(point);
        } else if (fields.massField[i] >= 0.12) {
          cells[i] = "secondary";
          weak.push(point);
        } else {
          voids.push(point);
        }
      }
    }
  } else {
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const i = idx(x, y, size);
        const point = { x, y };
        if (fields.massField[i] >= 0.28) {
          cells[i] = "mass";
          floors.push(point);
          strong.push(point);
        } else if (fields.trailNorm[i] >= 0.16 || fields.massField[i] >= 0.16) {
          cells[i] = "circulation";
          secondary.push(point);
        } else if (fields.massField[i] >= 0.08) {
          cells[i] = "secondary";
          weak.push(point);
        } else {
          voids.push(point);
        }
      }
    }
  }

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const i = idx(x, y, size);
      const kind = cells[i];
      const edgeOf =
        fields.kind === "around-absence"
          ? kind === "mass" || kind === "circulation"
          : fields.kind === "contained-interior"
            ? kind === "mass" || kind === "circulation" || kind === "secondary"
            : false;
      if (!edgeOf) continue;
      const touchesCore = neighbors(x, y, size).some((cell) => {
        const neighbor = cells[idx(cell.x, cell.y, size)];
        return fields.kind === "around-absence"
          ? neighbor === "primary-void"
          : neighbor === "room";
      });
      if (!touchesCore) continue;
      cells[i] = "wall";
      walls.push({
        x1: x + 0.5,
        y1: y + 0.5,
        x2: x + 0.5,
        y2: y + 0.5,
      });
    }
  }

  const sourceX = Math.round(state.source.x);
  const sourceY = Math.round(state.source.y);
  if (sourceX >= 0 && sourceY >= 0 && sourceX < size && sourceY < size) {
    const i = idx(sourceX, sourceY, size);
    if (cells[i] !== "primary-void" && cells[i] !== "room") cells[i] = "source";
  }

  return {
    kind: fields.kind,
    occupancy: fields.occupancy,
    voidField: fields.voidField,
    massField: fields.massField,
    cells,
    walls,
    floors,
    voids,
    rooms,
    primaryVoids,
    strong,
    secondary,
    weak,
  };
}
