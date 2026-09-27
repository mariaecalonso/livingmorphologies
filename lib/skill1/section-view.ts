import { configForArchetype } from "./archetypes";
import { sampleField } from "./engine";
import { SECTION_HEIGHT, TRAIL_SCALE } from "./maps";
import type { BiologicalTranslation, FieldSnapshot, Point } from "./types";

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

export type SectionNode = { x: number; y: number; z: number; strength: number };
export type SectionEdge = { a: number; b: number; strength: number };

export type SectionModel = {
  size: number;
  height: number;
  mass: Float32Array;
  hollow: Float32Array;
  nodes: SectionNode[];
  edges: SectionEdge[];
  source: Point;
  attractor: Point;
  aroundAbsence: boolean;
};

const idx3 = (x: number, y: number, z: number, size: number) =>
  (z * size + y) * size + x;

function coreRadius(
  x: number,
  y: number,
  attractor: Point,
  translation: BiologicalTranslation,
) {
  const dx = x - attractor.x;
  const dy = y - attractor.y;
  const angle = Math.atan2(dy, dx);
  const wobble = 1 + 0.16 * Math.cos(angle * 2.15) + 0.09 * Math.cos(angle * 5.4 + 0.6);
  return translation.recipe.isolationRadius * 0.5 * wobble;
}

function trailAt(snapshot: FieldSnapshot, x: number, y: number, peak: number) {
  const trail = sampleField(
    snapshot.trails,
    { x: x * TRAIL_SCALE, y: y * TRAIL_SCALE },
    snapshot.trailSize,
  );
  return Math.sqrt(Math.max(0, trail / peak));
}

/**
 * Extrude the 20×20 trail field into a 20×20×10 section model for display.
 * This does not change the simulation; it only stacks occupancy for the drawing.
 */
export function buildSectionModel(
  snapshot: FieldSnapshot | null,
  translation: BiologicalTranslation,
): SectionModel | null {
  if (!snapshot) return null;
  const size = snapshot.size;
  const height = SECTION_HEIGHT;
  const mass = new Float32Array(size * size * height);
  const hollow = new Float32Array(size * size * height);
  const around = configForArchetype(translation.archetypeId).topology === "around-absence";
  let trailPeak = 0.0001;
  for (const value of snapshot.trails) if (value > trailPeak) trailPeak = value;
  let occPeak = 0.0001;
  for (const value of snapshot.occupancy) if (value > occPeak) occPeak = value;

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const trail = trailAt(snapshot, x + 0.5, y + 0.5, trailPeak);
      const occ = Math.sqrt(Math.max(0, (snapshot.occupancy[y * size + x] ?? 0) / occPeak));
      const dist = Math.hypot(x - snapshot.attractor.x, y - snapshot.attractor.y);
      const keep = coreRadius(x, y, snapshot.attractor, translation);
      const volumeR =
        translation.recipe.isolationRadius +
        translation.recipe.enclosureCollar * 0.85 +
        translation.recipe.clustering * 0.4;
      for (let z = 0; z < height; z += 1) {
        const i = idx3(x, y, z, size);
        const floorBand = z % 2 === 0;
        const mid = z > 1 && z < height - 1;
        if (around) {
          const inCore = dist < keep;
          const satellite = !inCore && occ < 0.16 && trail < 0.14 && dist > keep + 1.4 && mid;
          if (inCore) {
            hollow[i] = 1;
            continue;
          }
          if (satellite) {
            hollow[i] = 0.85;
            continue;
          }
          if (floorBand && (occ > 0.16 || trail > 0.18)) {
            mass[i] = 0.55 + Math.min(0.45, trail * 0.7);
          } else if (!floorBand && trail > 0.32) {
            mass[i] = 0.35 + trail * 0.4;
          }
        } else {
          const inRoom =
            dist < translation.recipe.isolationRadius * (1.15 + trail * 0.35) && mid;
          if (inRoom) {
            hollow[i] = 1;
            continue;
          }
          if (dist < volumeR && floorBand) {
            mass[i] = 0.7 + trail * 0.25;
          } else if (dist < volumeR && trail > 0.22) {
            mass[i] = 0.4 + trail * 0.35;
          } else if (occ > 0.28 && floorBand) {
            mass[i] = 0.45;
          }
        }
      }
    }
  }

  const nodes: SectionNode[] = [];
  const floors = [1.1, 4.6, 8.1];
  for (let y = 1; y < size - 1; y += 1) {
    for (let x = 1; x < size - 1; x += 1) {
      const trail = trailAt(snapshot, x, y, trailPeak);
      if (trail < 0.1) continue;
      const dist = Math.hypot(x - snapshot.attractor.x, y - snapshot.attractor.y);
      const keep = coreRadius(x, y, snapshot.attractor, translation);
      if (around && dist < keep * 0.92) continue;
      if (
        !around &&
        dist > translation.recipe.isolationRadius + translation.recipe.enclosureCollar + 1.2 &&
        trail < 0.28
      ) {
        continue;
      }
      if ((x + y) % 2 !== 0 && trail < 0.22) continue;
      const floorCount = trail > 0.32 ? floors.length : trail > 0.18 ? 2 : 1;
      for (let f = 0; f < floorCount; f += 1) {
        const jitter = Math.sin(x * 1.7 + y * 0.9 + f) * 0.28;
        nodes.push({
          x: x + jitter * 0.15,
          y,
          z: clamp(floors[f] + jitter, 0.4, height - 0.35),
          strength: trail * (0.72 + f * 0.04),
        });
      }
    }
  }

  const edges: SectionEdge[] = [];
  for (let i = 0; i < nodes.length; i += 1) {
    const a = nodes[i];
    let links = 0;
    for (let j = i + 1; j < nodes.length; j += 1) {
      const b = nodes[j];
      const d = Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
      const maxD = 1.15 + a.strength * 1.1;
      if (d > maxD) continue;
      edges.push({ a: i, b: j, strength: (a.strength + b.strength) * 0.5 });
      links += 1;
      if (links >= 3) break;
    }
  }

  return {
    size,
    height,
    mass,
    hollow,
    nodes,
    edges,
    source: snapshot.source,
    attractor: snapshot.attractor,
    aroundAbsence: around,
  };
}

export function snapshotFromState(state: {
  iteration: number;
  size: number;
  trailSize: number;
  trails: number[];
  occupancy: number[];
  agents: Array<Point & { pathX?: number[]; pathY?: number[] }>;
  source: Point;
  attractor: Point;
}): FieldSnapshot {
  return {
    iteration: state.iteration,
    size: state.size,
    trailSize: state.trailSize,
    trails: state.trails,
    occupancy: state.occupancy,
    agents: state.agents.map((agent) => ({ x: agent.x, y: agent.y })),
    paths: state.agents.map((agent) => ({
      x: agent.pathX ?? [agent.x],
      y: agent.pathY ?? [agent.y],
    })),
    source: state.source,
    attractor: state.attractor,
  };
}
