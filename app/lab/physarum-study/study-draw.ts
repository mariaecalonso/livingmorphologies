/** Independent source previews. Yellow and white are never combined. */

export type PreviewSource = "yellow" | "white";

export function previewSeconds(source: PreviewSource) {
  return source === "white" ? 6 : 5;
}

export type StudyFrames = {
  bio: HTMLCanvasElement[];
  field: HTMLCanvasElement[];
};

const YELLOW_LAST = 34;

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

/** The biological clip, shown whole, with one fixed frame and no camera move. */
function drawYellow(context: CanvasRenderingContext2D, frame: HTMLCanvasElement, width: number, height: number) {
  const scale = Math.min(width / frame.width, height / frame.height);
  const dw = frame.width * scale;
  const dh = frame.height * scale;
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(frame, (width - dw) / 2, (height - dh) / 2, dw, dh);
}

/** The recorded trail field, fitted once so the network fills the frame and stays put. */
function drawWhite(context: CanvasRenderingContext2D, frame: HTMLCanvasElement, width: number, height: number) {
  const top = 0.36;
  const spanY = 1 - top;
  const scale = Math.min((width * 0.96) / frame.width, (height * 0.92) / (spanY * frame.height));
  const dw = frame.width * scale;
  const dh = frame.height * scale;
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(frame, (width - dw) / 2, (height - spanY * dh) / 2 - top * dh, dw, dh);
}

export function paintStudy(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  time: number,
  frames: StudyFrames | null,
  source: PreviewSource,
) {
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.globalAlpha = 1;
  context.globalCompositeOperation = "source-over";
  context.fillStyle = "#000000";
  context.fillRect(0, 0, width, height);
  if (!frames) return;

  if (source === "yellow") {
    if (frames.bio.length === 0) return;
    const last = Math.min(YELLOW_LAST, frames.bio.length - 1);
    const index = Math.min(last, Math.round(clamp01(time / previewSeconds("yellow")) * last));
    drawYellow(context, frames.bio[index], width, height);
    return;
  }

  if (frames.field.length === 0) return;
  const last = frames.field.length - 1;
  const position = clamp01(time / previewSeconds("white")) * last;
  const index = Math.min(last, Math.floor(position));
  const mix = index >= last ? 0 : position - index;
  drawWhite(context, frames.field[index], width, height);
  if (mix > 0.001 && frames.field[index + 1]) {
    context.save();
    context.globalAlpha = mix;
    drawWhite(context, frames.field[index + 1], width, height);
    context.restore();
  }
}
