import { influenceAt, type NetworkFrame, type NetworkNode } from "./site-network";

const GRID = 56;

export const SOURCE_CONTOUR_NOTE = "Copper lines are conceptual source influence. Teal lines are the attraction field the simulation uses.";

export type ContourLines = {
  source: Float32Array;
  attractor: Float32Array;
};

function isoline(values: Float32Array, columns: number, level: number, siteAt: (column: number, row: number) => [number, number]) {
  const segments: number[] = [];
  const at = (column: number, row: number) => values[row * columns + column];
  const point = (column: number, row: number, nextColumn: number, nextRow: number) => {
    const start = at(column, row);
    const end = at(nextColumn, nextRow);
    const span = end - start;
    const t = span === 0 ? 0.5 : Math.min(1, Math.max(0, (level - start) / span));
    const [x0, z0] = siteAt(column, row);
    const [x1, z1] = siteAt(nextColumn, nextRow);
    return [x0 + (x1 - x0) * t, z0 + (z1 - z0) * t] as const;
  };
  for (let row = 0; row < columns - 1; row += 1) {
    for (let column = 0; column < columns - 1; column += 1) {
      let code = 0;
      if (at(column, row) >= level) code |= 1;
      if (at(column + 1, row) >= level) code |= 2;
      if (at(column + 1, row + 1) >= level) code |= 4;
      if (at(column, row + 1) >= level) code |= 8;
      if (code === 0 || code === 15) continue;
      const bottom = () => point(column, row, column + 1, row);
      const right = () => point(column + 1, row, column + 1, row + 1);
      const top = () => point(column, row + 1, column + 1, row + 1);
      const left = () => point(column, row, column, row + 1);
      const push = (a: readonly [number, number], b: readonly [number, number]) => {
        segments.push(a[0], a[1], b[0], b[1]);
      };
      if (code === 1 || code === 14) push(left(), bottom());
      else if (code === 2 || code === 13) push(bottom(), right());
      else if (code === 4 || code === 11) push(right(), top());
      else if (code === 8 || code === 7) push(top(), left());
      else if (code === 3 || code === 12) push(left(), right());
      else if (code === 6 || code === 9) push(bottom(), top());
      else if (code === 5) {
        push(left(), top());
        push(bottom(), right());
      } else if (code === 10) {
        push(left(), bottom());
        push(right(), top());
      }
    }
  }
  return segments;
}

export function influenceContours(
  frame: NetworkFrame,
  nodes: readonly NetworkNode[],
  inside: (east: number, north: number) => boolean,
): ContourLines {
  const columns = GRID;
  const source = new Float32Array(columns * columns);
  const attractor = new Float32Array(columns * columns);
  const siteAt = (column: number, row: number): [number, number] => [
    frame.minX + (column / (columns - 1)) * frame.width,
    frame.minZ + (row / (columns - 1)) * frame.depth,
  ];
  let sourcePeak = 0;
  let attractorPeak = 0;
  for (let row = 0; row < columns; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const [east, north] = siteAt(column, row);
      const index = row * columns + column;
      if (!inside(east, north)) continue;
      const sample = influenceAt(frame, nodes, east, north);
      source[index] = sample.source;
      attractor[index] = sample.attractor;
      if (sample.source > sourcePeak) sourcePeak = sample.source;
      if (sample.attractor > attractorPeak) attractorPeak = sample.attractor;
    }
  }
  const lines = (values: Float32Array, peak: number) => {
    if (peak < 0.04) return new Float32Array();
    const levels = [0.14, 0.24, 0.36, 0.48, 0.6, 0.72, 0.84].map((share) => peak * share);
    const positions: number[] = [];
    for (const level of levels) positions.push(...isoline(values, columns, level, siteAt));
    return new Float32Array(positions);
  };
  return { source: lines(source, sourcePeak), attractor: lines(attractor, attractorPeak) };
}
