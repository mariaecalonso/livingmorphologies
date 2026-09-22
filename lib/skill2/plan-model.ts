import type { SimulationState } from "../skill1/types";
import type { MorphologyMeasurementResult } from "./measurements";

/**
 * Archetype-neutral XY evidence from one biological realization.
 * Not a section, not an architectural grammar, not a score.
 */
export type PlanEvidenceSource =
  | "overlays.mass"
  | "overlays.significantVoid"
  | "overlays.corridor"
  | "overlays.skeleton"
  | "overlays.interior"
  | "overlays.circulation"
  | "state.trails"
  | "state.source"
  | "state.attractor"
  | "state.attraction"
  | "measurements.connection"
  | "measurements.void"
  | "measurements.analysis";

export type PlanPoint = { x: number; y: number };

export type PlanComponent = {
  id: number;
  cells: readonly number[];
  touchesDomainBoundary: boolean;
  source: PlanEvidenceSource;
};

export type PlanModel = {
  domain: {
    occupancySize: number;
    columns: number;
    rows: number;
    interior: Uint8Array;
    interiorCellCount: number;
    edgeSuppressionMargin: number;
    sources: readonly PlanEvidenceSource[];
  };
  reinforcement: {
    trailPeak: number;
    /** Peak-relative trail on the trail grid. */
    relative: Float32Array;
    /** Existing mass class: peak-relative trail at or above massMinRelative. */
    strong: Uint8Array;
    /** Existing thin-connection class: corridor cells that are not mass. */
    connective: Uint8Array;
    /**
     * The extractor supplies two cutoffs, not a third weak band.
     * Raw `relative` remains available for intensity order.
     */
    weakBandSupplied: false;
    voidMaxRelative: number;
    massMinRelative: number;
    sources: readonly PlanEvidenceSource[];
  };
  mass: {
    mask: Uint8Array;
    components: readonly PlanComponent[];
    /** Components whose area meets the measurement's own minConcentrationArea. */
    concentrationIds: readonly number[];
    source: PlanEvidenceSource;
  };
  void: {
    significant: Uint8Array;
    components: readonly PlanComponent[];
    /** Significant-void components that touch the analysis-domain boundary. */
    boundaryConnectedIds: readonly number[];
    interiorIds: readonly number[];
    significantVoidCount: number;
    residualGapCount: number;
    sources: readonly PlanEvidenceSource[];
  };
  network: {
    skeleton: Uint8Array;
    /** Skeleton pixels with N8 degree 1. Same test as measurement endpoints. */
    endpoints: readonly number[];
    /** Skeleton pixels with N8 degree >= 3. Same test as measurement junctions. */
    branchPoints: readonly number[];
    circulation: Uint8Array;
    bridgeCount: number;
    linkedPairCount: number;
    pairOpportunityCount: number;
    sources: readonly PlanEvidenceSource[];
  };
  edge: {
    boundaryTouchingMassIds: readonly number[];
    boundaryTouchingVoidIds: readonly number[];
    source: PlanEvidenceSource;
  };
  anchors: {
    source: PlanPoint;
    attractor: PlanPoint;
    attraction: {
      columns: number;
      rows: number;
      values: Float32Array;
    };
    sources: readonly PlanEvidenceSource[];
  };
};

const N4: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

const N8: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
];

function copyMask(mask: Uint8Array) {
  return mask.slice();
}

function componentsOf(mask: Uint8Array, columns: number, rows: number) {
  const seen = new Uint8Array(mask.length);
  const groups: number[][] = [];
  for (let start = 0; start < mask.length; start += 1) {
    if (!mask[start] || seen[start]) continue;
    const cells: number[] = [];
    const stack = [start];
    seen[start] = 1;
    while (stack.length > 0) {
      const i = stack.pop();
      if (i === undefined) break;
      cells.push(i);
      const x = i % columns;
      const y = (i - x) / columns;
      for (const [ox, oy] of N4) {
        const nx = x + ox;
        const ny = y + oy;
        if (nx < 0 || ny < 0 || nx >= columns || ny >= rows) continue;
        const ni = ny * columns + nx;
        if (!mask[ni] || seen[ni]) continue;
        seen[ni] = 1;
        stack.push(ni);
      }
    }
    cells.sort((a, b) => a - b);
    groups.push(cells);
  }
  groups.sort((a, b) => a[0] - b[0]);
  return groups;
}

function touchesBoundary(cells: readonly number[], interior: Uint8Array, columns: number, rows: number) {
  for (const i of cells) {
    const x = i % columns;
    const y = (i - x) / columns;
    if (!interior[i]) return true;
    for (const [ox, oy] of N4) {
      const nx = x + ox;
      const ny = y + oy;
      if (nx < 0 || ny < 0 || nx >= columns || ny >= rows) return true;
      if (!interior[ny * columns + nx]) return true;
    }
  }
  return false;
}

function skeletonDegree(skel: Uint8Array, columns: number, rows: number, i: number) {
  const x = i % columns;
  const y = (i - x) / columns;
  let neighbors = 0;
  for (const [ox, oy] of N8) {
    const nx = x + ox;
    const ny = y + oy;
    if (nx < 0 || ny < 0 || nx >= columns || ny >= rows) continue;
    if (skel[ny * columns + nx]) neighbors += 1;
  }
  return neighbors;
}

export function buildPlanModel(
  state: SimulationState,
  morphology: MorphologyMeasurementResult,
): PlanModel {
  const { overlays, measurements, summary, config } = morphology;
  const columns = overlays.width;
  const rows = overlays.height;
  if (columns !== state.trailSize || rows !== state.trailSize) {
    throw new Error("PlanModel grid does not match the simulation trail grid");
  }
  if (state.trails.length !== columns * rows) {
    throw new Error("PlanModel trail buffer does not match the trail grid");
  }

  const interior = copyMask(overlays.interior);
  const strong = copyMask(overlays.mass);
  const corridor = overlays.corridor;
  const connective = new Uint8Array(strong.length);
  for (let i = 0; i < connective.length; i += 1) {
    if (corridor[i] && !strong[i]) connective[i] = 1;
  }
  const significant = copyMask(overlays.significantVoid);
  const skeleton = copyMask(overlays.skeleton);
  const circulation = copyMask(overlays.circulation);

  const peak = summary.trailPeak > 0 ? summary.trailPeak : 1;
  const relative = new Float32Array(state.trails.length);
  for (let i = 0; i < state.trails.length; i += 1) relative[i] = (state.trails[i] ?? 0) / peak;

  const cell = state.size > 0 && columns > 0 ? state.size / columns : 1;
  const areaUnit = cell * cell;
  const massGroups = componentsOf(strong, columns, rows);
  const massComponents: PlanComponent[] = massGroups.map((cells, id) => ({
    id,
    cells,
    touchesDomainBoundary: touchesBoundary(cells, interior, columns, rows),
    source: "overlays.mass",
  }));
  const concentrationIds = massComponents
    .filter((component) => component.cells.length * areaUnit >= config.minConcentrationArea)
    .map((component) => component.id);

  const voidGroups = componentsOf(significant, columns, rows);
  const voidComponents: PlanComponent[] = voidGroups.map((cells, id) => ({
    id,
    cells,
    touchesDomainBoundary: touchesBoundary(cells, interior, columns, rows),
    source: "overlays.significantVoid",
  }));
  const boundaryConnectedIds = voidComponents
    .filter((component) => component.touchesDomainBoundary)
    .map((component) => component.id);
  const interiorIds = voidComponents
    .filter((component) => !component.touchesDomainBoundary)
    .map((component) => component.id);

  const endpoints: number[] = [];
  const branchPoints: number[] = [];
  for (let i = 0; i < skeleton.length; i += 1) {
    if (!skeleton[i]) continue;
    const degree = skeletonDegree(skeleton, columns, rows, i);
    if (degree === 1) endpoints.push(i);
    else if (degree >= 3) branchPoints.push(i);
  }

  const attractionValues = new Float32Array(state.attraction.length);
  for (let i = 0; i < state.attraction.length; i += 1) attractionValues[i] = state.attraction[i] ?? 0;

  return {
    domain: {
      occupancySize: state.size,
      columns,
      rows,
      interior,
      interiorCellCount: measurements.analysis.interiorCellCount,
      edgeSuppressionMargin: measurements.analysis.edgeSuppressionMargin,
      sources: ["overlays.interior", "measurements.analysis", "state.trails"],
    },
    reinforcement: {
      trailPeak: summary.trailPeak,
      relative,
      strong,
      connective,
      weakBandSupplied: false,
      voidMaxRelative: config.voidMaxRelative,
      massMinRelative: config.massMinRelative,
      sources: ["state.trails", "overlays.mass", "overlays.corridor"],
    },
    mass: {
      mask: copyMask(strong),
      components: massComponents,
      concentrationIds,
      source: "overlays.mass",
    },
    void: {
      significant,
      components: voidComponents,
      boundaryConnectedIds,
      interiorIds,
      significantVoidCount: measurements.void.significantVoidCount,
      residualGapCount: measurements.void.residualGapCount,
      sources: ["overlays.significantVoid", "overlays.interior", "measurements.void"],
    },
    network: {
      skeleton,
      endpoints,
      branchPoints,
      circulation,
      bridgeCount: measurements.connection.bridgeCount,
      linkedPairCount: measurements.connection.linkedPairCount,
      pairOpportunityCount: measurements.connection.pairOpportunityCount,
      sources: ["overlays.skeleton", "overlays.circulation", "measurements.connection"],
    },
    edge: {
      boundaryTouchingMassIds: massComponents
        .filter((component) => component.touchesDomainBoundary)
        .map((component) => component.id),
      boundaryTouchingVoidIds: boundaryConnectedIds,
      source: "overlays.interior",
    },
    anchors: {
      source: { x: state.source.x, y: state.source.y },
      attractor: { x: state.attractor.x, y: state.attractor.y },
      attraction: {
        columns: state.size,
        rows: state.size,
        values: attractionValues,
      },
      sources: ["state.source", "state.attractor", "state.attraction"],
    },
  };
}
