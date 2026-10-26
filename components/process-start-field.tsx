"use client";

import { useEffect, useRef, useState } from "react";
import { CLEAN_CONTOUR_CUTOFF } from "@/components/vertical-render";

export type StartFieldView = "raw" | "contour" | "filled";

const VIEWS: { id: StartFieldView; label: string }[] = [
  { id: "raw", label: "Raw field" },
  { id: "contour", label: "Contour" },
  { id: "filled", label: "Filled" },
];

function paintPlate(
  canvas: HTMLCanvasElement,
  plate: { size: number; values: Uint8Array } | null,
  view: StartFieldView,
) {
  const parent = canvas.parentElement;
  if (!parent) return;
  const dpr = window.devicePixelRatio || 1;
  const width = Math.max(1, parent.clientWidth);
  const height = Math.max(1, parent.clientHeight);
  canvas.width = Math.floor(width * dpr);
  canvas.height = Math.floor(height * dpr);
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, width, height);
  const gutterX = 18;
  const gutterTop = 14;
  const gutterBottom = 16;
  const insetRight = 4;
  const availW = Math.max(1, width - gutterX - insetRight);
  const availH = Math.max(1, height - gutterTop - gutterBottom);
  const plateSize = plate?.size ?? 1;
  const fit = Math.min(availW / plateSize, availH / plateSize);
  const destW = plateSize * fit;
  const destH = plateSize * fit;
  const destX = gutterX + (availW - destW) / 2;
  const destY = gutterTop + (availH - destH) / 2;
  parent.parentElement?.style.setProperty("--plate-x", `${destX}px`);
  parent.parentElement?.style.setProperty("--plate-w", `${destW}px`);
  if (!plate) return;
  const size = plate.size;
  const image = document.createElement("canvas");
  image.width = size;
  image.height = size;
  const plateCtx = image.getContext("2d");
  if (!plateCtx) return;
  const pixels = plateCtx.createImageData(size, size);
  const data = pixels.data;
  const cutoff = CLEAN_CONTOUR_CUTOFF * 255;
  const occupied = (x: number, y: number) => plate.values[y * size + x] >= cutoff;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const value = plate.values[y * size + x] ?? 0;
      let tone = value;
      if (view !== "raw") {
        const on = value >= cutoff;
        if (!on) tone = 0;
        else if (view === "filled") tone = 255;
        else {
          const edge = x === 0 || y === 0 || x === size - 1 || y === size - 1
            || !occupied(x - 1, y) || !occupied(x + 1, y) || !occupied(x, y - 1) || !occupied(x, y + 1);
          tone = edge ? 255 : 0;
        }
      }
      const pixel = ((size - 1 - y) * size + x) * 4;
      const contour = view === "contour" && tone === 255;
      data[pixel] = contour ? 0x7e : tone;
      data[pixel + 1] = contour ? 0xc8 : tone;
      data[pixel + 2] = contour ? 0xc6 : tone;
      data[pixel + 3] = 255;
    }
  }
  plateCtx.putImageData(pixels, 0, 0);
  ctx.drawImage(image, 0, 0, size, size, destX, destY, destW, destH);
  ctx.strokeStyle = "rgba(242, 242, 238, 0.32)";
  ctx.lineWidth = 1;
  ctx.strokeRect(destX + 0.5, destY + 0.5, Math.max(0, destW - 1), Math.max(0, destH - 1));
  ctx.fillStyle = "rgba(242, 242, 238, 0.48)";
  ctx.font = "11px Helvetica, Arial, sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "bottom";
  ctx.fillText("Y", destX, destY - 2);
  ctx.textBaseline = "top";
  ctx.fillText("Z0", destX, destY + destH + 3);
  ctx.textAlign = "right";
  ctx.fillText("X", destX + destW, destY + destH + 3);
}

/** Static view of one stored Z0 plate. The values are not changed. */
export function ProcessStartField({ plate }: { plate: { size: number; values: Uint8Array } | null }) {
  const [view, setView] = useState<StartFieldView>("raw");
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    const parent = canvas?.parentElement;
    if (!canvas || !parent) return;
    const paint = () => paintPlate(canvas, plate, view);
    paint();
    const observer = new ResizeObserver(paint);
    observer.observe(parent);
    return () => observer.disconnect();
  }, [plate, view]);
  return (
    <div className="process-start-field">
      <div className="process-field-mode" role="group" aria-label="Z0 view">
        {VIEWS.map((item) => (
          <button
            key={item.id}
            type="button"
            className="process-read"
            data-active={view === item.id ? "true" : "false"}
            onClick={() => setView(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>
      <div className="process-start-view">
        <canvas ref={ref} aria-label="Stored Skill 2 Z0 field" />
      </div>
    </div>
  );
}
