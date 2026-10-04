import { drawPlanField } from "@/components/skill1-viz";
import { FIELD_SIZE, trailMaskCutoff } from "@/lib/skill1/maps";
import type { FieldSnapshot } from "@/lib/skill1/types";
import { drawSlimeFieldGl } from "@/lib/render/slime-field-gl";

/**
 * Gray trail plate. `size` is 512 in Single and 320 in Compare.
 * Source and attractor are only used by the canvas fallback.
 */
export function rasterTrailPlate(
  trails: ArrayLike<number>,
  trailSize: number,
  peak: number,
  iteration: number,
  size: number,
  source: { x: number; y: number },
  attractor: { x: number; y: number },
) {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, size, size);
  const painted = drawSlimeFieldGl(
    ctx,
    trails,
    trailSize,
    Math.max(peak, 0.0001),
    size,
    size,
    trailMaskCutoff(5),
  );
  if (!painted) {
    const snapshot: FieldSnapshot = {
      iteration,
      size: FIELD_SIZE,
      trailSize,
      trails: Array.from(trails),
      occupancy: [],
      agents: [],
      source,
      attractor,
    };
    drawPlanField(ctx, snapshot, size, size, {
      showHud: false,
      fine: true,
      density: 5,
      showAttractors: false,
    });
  }
  const image = ctx.getImageData(0, 0, size, size);
  const data = image.data;
  let inkPeak = 0;
  for (let i = 0; i < data.length; i += 4) inkPeak = Math.max(inkPeak, data[i], data[i + 1], data[i + 2]);
  const gain = inkPeak > 8 ? 1 / inkPeak : 0;
  for (let i = 0; i < data.length; i += 4) {
    const ink = Math.max(data[i], data[i + 1], data[i + 2]);
    if (ink < 8 || gain === 0) {
      data[i + 3] = 0;
      continue;
    }
    const value = Math.round(255 * Math.pow(ink * gain, 0.72));
    data[i] = value;
    data[i + 1] = value;
    data[i + 2] = value;
    data[i + 3] = value < 8 ? 0 : 255;
  }
  ctx.putImageData(image, 0, 0);
  return canvas;
}
