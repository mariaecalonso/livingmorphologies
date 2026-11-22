import { FILM_MEDIA, FILM_SECONDS, FILM_WORDS, ORGANISM_INTRO_SECONDS } from "@/lib/cinematic-intro";

export const FRAME_W = 1920;
export const FRAME_H = 525;

const GOLD = [224, 184, 90];
const PAPER = [244, 241, 234];
const COPPER = "#c77e5f";
const TEAL = "rgba(120, 196, 190, 0.9)";

export type Plate = { image: CanvasImageSource | null; missing: boolean };

export type FilmPlates = {
  organism: Plate;
  colony: Plate;
  opening: HTMLVideoElement | null;
  forage: HTMLVideoElement | null;
  detail: HTMLVideoElement | null;
  lab: Plate;
  section: Plate;
  depth: Plate;
  form: Plate;
  lobby: Plate;
  workspace: Plate;
  gathering: Plate;
  tiles: Plate[];
};

type Point = { x: number; y: number };
type Vein = { pts: Point[]; ghost: Point[]; born: number; mass: number; persist: number };
type Graph = { veins: Vein[]; attractors: Array<Point & { delay: number }> };

const clamp = (value: number, min = 0, max = 1) => Math.max(min, Math.min(max, value));
const lerp = (from: number, to: number, amount: number) => from + (to - from) * amount;
const smooth = (amount: number) => {
  const t = clamp(amount);
  return t * t * (3 - 2 * t);
};
const open = (time: number, start: number, end: number) => smooth((time - start) / (end - start));
const span = (time: number, enter: number, hold: number, leave: number, out: number) => open(time, enter, hold) * (1 - open(time, leave, out));

function hash(index: number) {
  const value = Math.sin(index * 127.1 + 311.7) * 43758.5453;
  return value - Math.floor(value);
}

function offsetLine(points: Point[], distance: number) {
  return points.map((point, index) => {
    const previous = points[Math.max(0, index - 1)];
    const next = points[Math.min(points.length - 1, index + 1)];
    const dx = next.x - previous.x;
    const dy = next.y - previous.y;
    const length = Math.hypot(dx, dy) || 1;
    return { x: point.x + (-dy / length) * distance, y: point.y + (dx / length) * distance };
  });
}

function insideEllipse(point: Point, center: Point, rx: number, ry: number) {
  const dx = (point.x - center.x) / rx;
  const dy = (point.y - center.y) / ry;
  return dx * dx + dy * dy < 1;
}

function growFree(seed: number, center: Point, rx: number, ry: number, count: number): Graph {
  const veins: Vein[] = [];
  const fronts = [
    { x: center.x, y: center.y, angle: -0.9, born: 0.04, mass: 1, life: 1 },
    { x: center.x, y: center.y, angle: 0.35, born: 0.08, mass: 0.92, life: 1 },
    { x: center.x, y: center.y, angle: 2.2, born: 0.06, mass: 0.84, life: 1 },
    { x: center.x, y: center.y, angle: 3.4, born: 0.12, mass: 0.78, life: 1 },
  ];
  let cursor = seed;
  while (fronts.length && veins.length < count) {
    const front = fronts.shift();
    if (!front) break;
    const pts: Point[] = [{ x: front.x, y: front.y }];
    let x = front.x;
    let y = front.y;
    let angle = front.angle;
    const steps = 6 + Math.floor(hash(cursor++) * 4);
    for (let step = 0; step < steps; step += 1) {
      angle += (hash(cursor++) - 0.48) * 1.05;
      const length = (11 + hash(cursor++) * 16) * (rx / 620);
      const next = { x: x + Math.cos(angle) * length, y: y + Math.sin(angle) * length * (ry / rx) * 1.15 };
      if (!insideEllipse(next, center, rx, ry)) break;
      pts.push(next);
      x = next.x;
      y = next.y;
    }
    if (pts.length > 1) {
      const persist = front.mass > 0.62 ? 0.85 + hash(cursor++) * 0.15 : hash(cursor++);
      veins.push({ pts, ghost: offsetLine(pts, 1.5), born: front.born, mass: front.mass, persist });
    }
    if (front.life > 0.34 && veins.length < count && pts.length > 2) {
      const tip = pts[pts.length - 1];
      fronts.push({
        x: tip.x,
        y: tip.y,
        angle: angle + 0.55,
        born: Math.min(0.9, front.born + 0.07 + hash(cursor++) * 0.08),
        mass: front.mass * (0.62 + hash(cursor++) * 0.28),
        life: front.life * 0.74,
      });
      if (hash(cursor++) > 0.42) {
        fronts.push({
          x: tip.x,
          y: tip.y,
          angle: angle - 0.72,
          born: Math.min(0.94, front.born + 0.11),
          mass: front.mass * 0.48,
          life: front.life * 0.62,
        });
      }
    }
  }
  const attractors = veins
    .filter((vein, index) => vein.mass > 0.55 && index % 3 === 0)
    .slice(0, 7)
    .map((vein, index) => {
      const tip = vein.pts[vein.pts.length - 1];
      return { x: tip.x, y: tip.y, delay: 0.15 * index };
    });
  return { veins, attractors };
}

function growToward(seed: number, origin: Point, targets: Point[], count: number): Graph {
  const veins: Vein[] = [];
  let cursor = seed;
  targets.forEach((target, index) => {
    const shots = 3;
    for (let shot = 0; shot < shots && veins.length < count; shot += 1) {
      const pts: Point[] = [{ ...origin }];
      let x = origin.x;
      let y = origin.y;
      let angle = Math.atan2(target.y - y, target.x - x) + (hash(cursor++) - 0.5) * 1.3;
      for (let step = 0; step < 8; step += 1) {
        const aim = Math.atan2(target.y - y, target.x - x);
        angle += (aim - angle) * 0.16 + (hash(cursor++) - 0.5) * 0.85;
        const length = 18 + hash(cursor++) * 22;
        x += Math.cos(angle) * length;
        y += Math.sin(angle) * length * 0.82;
        pts.push({ x, y });
        if (Math.hypot(target.x - x, target.y - y) < 16) break;
      }
      const reached = Math.hypot(target.x - x, target.y - y) < 28;
      veins.push({
        pts,
        ghost: offsetLine(pts, 1.2),
        born: 0.08 + index * 0.07 + shot * 0.05,
        mass: reached ? 0.78 : 0.42,
        persist: reached ? 1 : 0.2 + hash(cursor++) * 0.25,
      });
    }
  });
  return {
    veins,
    attractors: targets.map((target, index) => ({ ...target, delay: index * 0.12 })),
  };
}

const MAIN = growFree(4, { x: 960, y: 228 }, 640, 175, 72);
const LOBBY = growToward(20, { x: 360, y: 300 }, [
  { x: 360, y: 188 },
  { x: 360, y: 250 },
  { x: 334, y: 214 },
  { x: 388, y: 236 },
], 14);
const WORK = growToward(40, { x: 960, y: 340 }, [
  { x: 860, y: 210 },
  { x: 960, y: 196 },
  { x: 1060, y: 210 },
  { x: 890, y: 268 },
  { x: 1030, y: 268 },
], 16);
const GATHER = growToward(70, { x: 1560, y: 250 }, [
  { x: 1468, y: 214 },
  { x: 1520, y: 188 },
  { x: 1576, y: 196 },
  { x: 1636, y: 230 },
  { x: 1604, y: 278 },
], 16);

const COLUMNS = [
  { graph: LOBBY, plate: "lobby" as const, label: "LOBBY", x: 360 },
  { graph: WORK, plate: "workspace" as const, label: "WORKSPACE", x: 960 },
  { graph: GATHER, plate: "gathering" as const, label: "GATHERING", x: 1560 },
];

function rgb(channels: number[], alpha = 1) {
  return `rgba(${channels[0]}, ${channels[1]}, ${channels[2]}, ${alpha})`;
}

function ink(time: number) {
  const white = open(time, 10.4, 12.3);
  return GOLD.map((channel, index) => Math.round(lerp(channel, PAPER[index], white)));
}

function growth(time: number) {
  if (time < 4.5) return 0;
  if (time < 11) return lerp(0.05, 0.64, open(time, 4.5, 11));
  return lerp(0.64, 1, open(time, 11, 17.6));
}

function wordAlpha(time: number, index: number) {
  const start = FILM_WORDS[index].at;
  const end = index === FILM_WORDS.length - 1 ? 18.05 : FILM_WORDS[index + 1].at;
  return span(time, start, start + 0.22, end - 0.18, end + 0.02);
}

function sourceSize(source: CanvasImageSource) {
  if (source instanceof HTMLVideoElement) return { width: source.videoWidth, height: source.videoHeight };
  if (source instanceof HTMLImageElement) return { width: source.naturalWidth, height: source.naturalHeight };
  if (source instanceof HTMLCanvasElement) return { width: source.width, height: source.height };
  return { width: 0, height: 0 };
}

function drawContain(context: CanvasRenderingContext2D, source: CanvasImageSource, x: number, y: number, width: number, height: number) {
  const size = sourceSize(source);
  if (!size.width || !size.height) return false;
  const scale = Math.min(width / size.width, height / size.height);
  const w = size.width * scale;
  const h = size.height * scale;
  context.drawImage(source, x + (width - w) / 2, y + (height - h) / 2, w, h);
  return true;
}

function drawSoftPlate(context: CanvasRenderingContext2D, plate: Plate, x: number, y: number, width: number, height: number, alpha: number, slot: string) {
  if (alpha <= 0.01) return;
  if (plate.image) {
    context.save();
    context.globalAlpha = alpha;
    const drew = drawFeathered(context, plate.image, x, y, width, height, 0.5, 0.45);
    context.restore();
    if (drew) return;
  }
  drawPlate(context, plate, x, y, width, height, alpha, slot);
}

function drawPlate(context: CanvasRenderingContext2D, plate: Plate, x: number, y: number, width: number, height: number, alpha: number, slot: string) {
  if (alpha <= 0.01) return;
  context.save();
  context.globalAlpha = alpha;
  if (plate.image && drawContain(context, plate.image, x, y, width, height)) {
    context.restore();
    return;
  }
  if (plate.missing) {
    context.strokeStyle = "rgba(255,255,255,0.45)";
    context.lineWidth = 1;
    context.strokeRect(x, y, width, height);
    context.fillStyle = "#ffffff";
    context.font = "16px Helvetica, Arial, sans-serif";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText("MEDIA SLOT", x + width / 2, y + height / 2 - 12);
    context.font = "13px Helvetica, Arial, sans-serif";
    context.fillText(slot, x + width / 2, y + height / 2 + 12);
  }
  context.restore();
}

function trackedWidth(context: CanvasRenderingContext2D, text: string, tracking: number) {
  return [...text].reduce((sum, glyph, index) => sum + context.measureText(glyph).width + (index ? tracking : 0), 0);
}

function drawTracked(context: CanvasRenderingContext2D, text: string, x: number, y: number, font: string, size: number, alpha: number, tracking: number, maxWidth: number) {
  if (alpha <= 0.01) return;
  let next = size;
  context.font = `${next}px ${font}`;
  let gap = next * tracking;
  while (next > 14 && trackedWidth(context, text, gap) > maxWidth) {
    next -= 1;
    context.font = `${next}px ${font}`;
    gap = next * tracking;
  }
  const glyphs = [...text];
  const widths = glyphs.map((glyph) => context.measureText(glyph).width);
  const total = widths.reduce((sum, width) => sum + width, 0) + gap * Math.max(0, glyphs.length - 1);
  let cursor = x - total / 2;
  context.save();
  context.globalAlpha = alpha;
  context.fillStyle = "#f7f4ee";
  context.textAlign = "left";
  context.textBaseline = "middle";
  glyphs.forEach((glyph, index) => {
    context.fillText(glyph, cursor, y);
    cursor += widths[index] + gap;
  });
  context.restore();
}

function drawPlain(context: CanvasRenderingContext2D, text: string, x: number, y: number, size: number, alpha: number) {
  if (alpha <= 0.01) return;
  context.save();
  context.globalAlpha = alpha;
  context.fillStyle = "rgba(244,241,234,0.82)";
  context.font = `${size}px Helvetica, Arial, sans-serif`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(text, x, y);
  context.restore();
}

function scrim(context: CanvasRenderingContext2D, alpha: number) {
  if (alpha <= 0.01) return;
  const gradient = context.createLinearGradient(0, 330, 0, 470);
  gradient.addColorStop(0, "rgba(0,0,0,0)");
  gradient.addColorStop(1, `rgba(0,0,0,${0.78 * alpha})`);
  context.fillStyle = gradient;
  context.fillRect(0, 360, FRAME_W, FRAME_H - 360);
}

function strokeVein(context: CanvasRenderingContext2D, points: Point[], reach: number, width: number, color: string, alpha: number) {
  if (reach <= 0.02 || alpha <= 0.02 || points.length < 2 || width <= 0) return;
  const last = reach * (points.length - 1);
  const whole = Math.floor(last);
  context.beginPath();
  context.moveTo(points[0].x, points[0].y);
  for (let index = 1; index <= whole; index += 1) context.lineTo(points[index].x, points[index].y);
  if (whole < points.length - 1) {
    const amount = last - whole;
    const from = points[whole];
    const to = points[whole + 1];
    context.lineTo(from.x + (to.x - from.x) * amount, from.y + (to.y - from.y) * amount);
  }
  context.strokeStyle = color;
  context.globalAlpha = alpha;
  context.lineWidth = width;
  context.lineCap = "round";
  context.lineJoin = "round";
  context.stroke();
}

function pointAlong(points: Point[], amount: number) {
  const last = clamp(amount) * (points.length - 1);
  const index = Math.floor(last);
  const next = points[Math.min(points.length - 1, index + 1)];
  const from = points[index];
  const local = last - index;
  return { x: from.x + (next.x - from.x) * local, y: from.y + (next.y - from.y) * local };
}

function drawGraph(context: CanvasRenderingContext2D, graph: Graph, time: number, amount: number, alpha: number, color: number[], showBehavior: boolean) {
  if (alpha <= 0.01 || amount <= 0) return;
  context.save();
  const adapt = showBehavior ? open(time, 15.55, 16.7) : open(time, 21.6, 23.4) * 0.65;
  const reinforce = showBehavior ? span(time, 14.35, 14.7, 16.3, 17.4) : 0;
  const sense = showBehavior
    ? Math.max(span(time, 6.15, 7.1, 10.4, 11.2) * 0.75, span(time, 12.15, 12.45, 13.55, 14.2))
    : span(time, 18.7, 19.5, 25.4, 26.6);
  graph.veins.forEach((vein) => {
    const reveal = clamp((amount - vein.born) / 0.12);
    if (reveal <= 0) return;
    const faded = lerp(1, vein.persist, adapt);
    const width = (1.15 + vein.mass * 2.1) * (1 + reinforce * (vein.mass > 0.7 ? 0.7 : 0));
    const line = vein.mass > 0.72 && reinforce > 0.2 ? TEAL : rgb(color, 0.92);
    strokeVein(context, vein.ghost, reveal, Math.max(0.35, width * 0.45), rgb(color, 0.7), alpha * faded * 0.35);
    strokeVein(context, vein.pts, reveal, width, line, alpha * faded);
  });
  const hold = showBehavior ? 1 - open(time, 18.4, 19.2) : 1;
  graph.attractors.forEach((attractor, index) => {
    const appear = sense * hold * alpha;
    const pulse = 0.65 + 0.35 * Math.sin(time * 2.4 + index);
    context.beginPath();
    context.arc(attractor.x, attractor.y, 4.5 + pulse * 2.2, 0, Math.PI * 2);
    context.strokeStyle = COPPER;
    context.lineWidth = 1.1;
    context.globalAlpha = appear * (0.45 + 0.55 * pulse);
    context.stroke();
  });
  if (!showBehavior) {
    context.restore();
    return;
  }
  const moving = span(time, 13.25, 13.55, 16.8, 18);
  const traveler = MAIN.veins.reduce((best, vein) => (vein.pts.length > best.pts.length ? vein : best), MAIN.veins[0]);
  if (!traveler || moving <= 0) {
    context.restore();
    return;
  }
  const head = pointAlong(traveler.pts, (0.15 + 0.8 * ((time - 13.2) / 4.6)) % 1);
  context.beginPath();
  context.arc(head.x, head.y, 2.4, 0, Math.PI * 2);
  context.fillStyle = "#ffffff";
  context.globalAlpha = moving;
  context.fill();
  context.restore();
}

let feather: HTMLCanvasElement | null = null;

function drawFeathered(context: CanvasRenderingContext2D, source: CanvasImageSource, x: number, y: number, width: number, height: number, biasX: number, biasY: number) {
  const size = sourceSize(source);
  if (!size.width || !size.height) return false;
  if (!feather) feather = document.createElement("canvas");
  const pw = Math.max(2, Math.ceil(width));
  const ph = Math.max(2, Math.ceil(height));
  if (feather.width !== pw || feather.height !== ph) {
    feather.width = pw;
    feather.height = ph;
  }
  const plate = feather.getContext("2d");
  if (!plate) return false;
  plate.setTransform(1, 0, 0, 1, 0, 0);
  plate.clearRect(0, 0, pw, ph);
  plate.globalCompositeOperation = "source-over";
  const scale = Math.max(pw / size.width, ph / size.height);
  const sw = pw / scale;
  const sh = ph / scale;
  const sx = clamp(biasX) * (size.width - sw);
  const sy = clamp(biasY) * (size.height - sh);
  plate.drawImage(source, sx, sy, sw, sh, 0, 0, pw, ph);
  plate.globalCompositeOperation = "destination-in";
  const fade = plate.createRadialGradient(pw * 0.5, ph * 0.48, Math.min(pw, ph) * 0.18, pw * 0.5, ph * 0.48, Math.max(pw, ph) * 0.52);
  fade.addColorStop(0, "rgba(0,0,0,1)");
  fade.addColorStop(0.72, "rgba(0,0,0,0.85)");
  fade.addColorStop(1, "rgba(0,0,0,0)");
  plate.fillStyle = fade;
  plate.fillRect(0, 0, pw, ph);
  plate.globalCompositeOperation = "source-over";
  context.drawImage(feather, x, y, width, height);
  return true;
}

function videoReady(video: HTMLVideoElement | null): video is HTMLVideoElement {
  return Boolean(video && video.readyState >= 2 && video.videoWidth > 0 && !video.seeking);
}

function organismSource(plates: FilmPlates): CanvasImageSource | null {
  if (videoReady(plates.forage)) return plates.forage;
  return plates.organism.image;
}

function fitFrame(width: number, height: number) {
  const scale = Math.min(width / FRAME_W, height / FRAME_H);
  return { scale, ox: (width - FRAME_W * scale) / 2, oy: (height - FRAME_H * scale) / 2 };
}

type OpeningBox = { minX: number; minY: number; maxX: number; maxY: number; textY: number };

type OpeningMask = {
  canvas: HTMLCanvasElement;
  context: CanvasRenderingContext2D;
  mask: Uint8Array;
  width: number;
  height: number;
  box: OpeningBox | null;
};

let openingMask: OpeningMask | null = null;

function openingSeed(r: number, g: number, b: number) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const sat = max === 0 ? 0 : (max - min) / max;
  if (sat < 0.28 || r < 60 || b > r * 0.62 || r <= b + 36 || g + 6 <= b) return 0;
  return 255;
}

function openingPlate(video: HTMLVideoElement, quick: boolean) {
  const width = quick ? Math.max(2, video.videoWidth >> 1) : video.videoWidth;
  const height = quick ? Math.max(2, video.videoHeight >> 1) : video.videoHeight;
  if (openingMask && openingMask.width === width && openingMask.height === height) return openingMask;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return null;
  const count = width * height;
  openingMask = {
    canvas,
    context,
    mask: new Uint8Array(count),
    width,
    height,
    box: null,
  };
  return openingMask;
}

function isolateOrganism(plate: OpeningMask, time: number) {
  const { context, mask, width, height } = plate;
  const image = context.getImageData(0, 0, width, height);
  const data = image.data;
  for (let i = 0; i < mask.length; i += 1) {
    const p = i * 4;
    mask[i] = openingSeed(data[p], data[p + 1], data[p + 2]);
  }
  const columns = new Uint16Array(width);
  const rows = new Uint16Array(height);
  let textY = 0;
  for (let i = 0; i < mask.length; i += 1) {
    const p = i * 4;
    const r = data[p];
    const g = data[p + 1];
    const b = data[p + 2];
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const text = time > ORGANISM_INTRO_SECONDS - 6 && min > 186 && max - min < 28 && max > 200;
    data[p + 3] = text || mask[i] ? 255 : 0;
    const x = i % width;
    const y = (i / width) | 0;
    if (text && y > textY) textY = y;
    if (!mask[i]) continue;
    columns[x] += 1;
    rows[y] += 1;
  }
  context.putImageData(image, 0, 0);
  let minX = 0;
  let maxX = width - 1;
  let minY = 0;
  let maxY = height - 1;
  const least = Math.max(4, Math.round(height / 135));
  while (minX < maxX && columns[minX] < least) minX += 1;
  while (maxX > minX && columns[maxX] < least) maxX -= 1;
  while (minY < maxY && rows[minY] < least) minY += 1;
  while (maxY > minY && rows[maxY] < least) maxY -= 1;
  if (maxX <= minX || maxY <= minY) return;
  const next = { minX, minY, maxX, maxY, textY };
  const previous = plate.box;
  if (!previous) {
    plate.box = next;
    return;
  }
  const jump = Math.abs(next.minX - previous.minX) + Math.abs(next.maxX - previous.maxX) > width * 0.2;
  const blend = jump ? 1 : 0.2;
  plate.box = {
    minX: previous.minX + (next.minX - previous.minX) * blend,
    minY: previous.minY + (next.minY - previous.minY) * blend,
    maxX: previous.maxX + (next.maxX - previous.maxX) * blend,
    maxY: previous.maxY + (next.maxY - previous.maxY) * blend,
    textY: next.textY || previous.textY,
  };
}

function drawOpening(context: CanvasRenderingContext2D, video: HTMLVideoElement, time: number, quick: boolean) {
  const plate = openingPlate(video, quick);
  if (!plate) return;
  plate.context.drawImage(video, 0, 0, plate.width, plate.height);
  isolateOrganism(plate, time);
  const box = plate.box;
  if (!box) return;
  const spanX = Math.max(1, box.maxX - box.minX);
  const spanY = Math.max(1, box.maxY - box.minY);
  const scale = Math.max(FRAME_W / spanX, FRAME_H / spanY);
  let centerX = (box.minX + box.maxX) / 2;
  let centerY = (box.minY + box.maxY) / 2;
  if (box.minX < plate.width * 0.08) {
    centerX += spanX * 0.14;
    centerY -= spanY * 0.12;
  }
  if (box.textY > plate.height * 0.7) {
    const visible = FRAME_H / scale;
    const low = box.minY + visible / 2;
    const high = box.maxY - visible / 2;
    centerY = Math.min(high, Math.max(low, box.textY - visible * 0.28));
  }
  context.drawImage(
    plate.canvas,
    FRAME_W / 2 - centerX * scale,
    FRAME_H / 2 - centerY * scale,
    plate.width * scale,
    plate.height * scale,
  );
}

export function paintFilm(context: CanvasRenderingContext2D, width: number, height: number, time: number, plates: FilmPlates, displayFont: string, quick = false) {
  const fit = fitFrame(width, height);
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.clearRect(0, 0, width, height);
  context.fillStyle = "#000000";
  context.fillRect(0, 0, width, height);
  context.setTransform(fit.scale, 0, 0, fit.scale, fit.ox, fit.oy);
  if (time < ORGANISM_INTRO_SECONDS) {
    if (videoReady(plates.opening)) drawOpening(context, plates.opening, time, quick);
    return;
  }
  const film = clamp(time - ORGANISM_INTRO_SECONDS, 0, FILM_SECONDS);
  context.lineCap = "round";
  context.lineJoin = "round";
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";

  const organism = span(film, 0.25, 1.7, 8.7, 10.6);
  const colony = span(film, 6.4, 7.6, 8.6, 10);
  const network = span(film, 9.2, 10.8, 18.1, 19.5);
  const sentence = span(film, 18.15, 19.1, 25.5, 26.5);
  const columns = 1 - open(film, 25.7, 27.15);
  const dip = film < 27.42 ? Math.sin(clamp((film - 26.72) / 0.7) * Math.PI) : 0;
  const lab = span(film, 27.35, 27.85, 28.35, 29.15);
  const section = span(film, 28.2, 28.9, 29.7, 30.7);
  const depth = span(film, 29.85, 30.7, 31.35, 32.45);
  const form = span(film, 31.45, 32.55, 33.35, 34.55);
  const tiles = open(film, 33.5, 35.7) * (film < 36 ? 1 : lerp(1, 0.72, open(film, 36.2, 37.6)));
  const title = open(film, 36.25, 37.55);
  const pull = lerp(1, 0.84, open(film, 35.8, 40.2));

  context.save();
  context.translate(960, 230);
  context.scale(lerp(1.08, 1, open(film, 0.2, 5)), lerp(1.08, 1, open(film, 0.2, 5)));
  context.translate(-960, -230);
  const live = organismSource(plates);
  context.save();
  context.globalAlpha = organism;
  if (live && organism > 0) {
    drawFeathered(context, live, 460, 8, 1000, 470, videoReady(plates.forage) ? 0.78 : 0.5, 0.46);
  } else if (plates.organism.missing && organism > 0.2) {
    drawPlate(context, plates.organism, 610, 28, 700, 430, 1, FILM_MEDIA.organism);
  }
  if (!videoReady(plates.forage) && plates.colony.image && colony > 0) {
    context.globalAlpha = colony;
    drawFeathered(context, plates.colony.image, 560, 30, 800, 420, 0.5, 0.5);
  }
  context.restore();
  context.restore();

  const vignette = context.createRadialGradient(960, 230, 120, 960, 250, 780);
  vignette.addColorStop(0, "rgba(0,0,0,0)");
  vignette.addColorStop(1, "rgba(0,0,0,0.62)");
  context.fillStyle = vignette;
  context.fillRect(0, 0, FRAME_W, FRAME_H);

  drawGraph(context, MAIN, film, growth(film), network, ink(film), true);

  const gather = open(film, 25.6, 27.1);
  COLUMNS.forEach((column, index) => {
    const appear = open(film, 18.1 + index * 0.22, 19.25 + index * 0.22) * columns;
    if (appear <= 0.01) return;
    const shift = lerp(0, 960 - column.x, gather);
    context.save();
    context.translate(shift, lerp(0, -20, gather));
    context.globalAlpha = appear;
    drawPlate(context, plates[column.plate], column.x - 70, 92, 140, 78, 1, FILM_MEDIA[column.plate]);
    drawGraph(context, column.graph, film, open(film, 18.3 + index * 0.2, 22.4), 1, PAPER, false);
    drawTracked(context, column.label, column.x, 402, displayFont, 18, 1, 0.16, 420);
    context.restore();
  });

  scrim(context, Math.max(
    span(film, 2.5, 3.1, 4.7, 5.3),
    span(film, 5.7, 6.4, 10, 10.8),
    Math.max(...FILM_WORDS.map((_, index) => wordAlpha(film, index))),
    sentence,
    title,
  ));

  drawTracked(context, "PHYSARUM POLYCEPHALUM", 960, 392, displayFont, 34, span(film, 2.55, 3.25, 4.55, 5.15), 0.14, 1500);
  drawPlain(context, "A living network that explores and adapts.", 960, 432, 18, span(film, 3.15, 3.7, 4.45, 5.05));
  drawTracked(context, "EXPLORATION BECOMES CONNECTION", 960, 418, displayFont, 28, span(film, 5.85, 6.55, 8.8, 9.7), 0.12, 1600);
  FILM_WORDS.forEach((entry, index) => {
    drawTracked(context, entry.word, 960, 420, displayFont, 40, wordAlpha(film, index), 0.18, 1200);
  });
  drawTracked(context, "ARCHITECTURAL RELATIONSHIPS BECOME RULES OF GROWTH", 960, 42, displayFont, 24, sentence, 0.1, 1680);
  drawPlain(context, "FORMAL    ·    SPATIAL    ·    ATMOSPHERIC", 960, 78, 14, sentence * 0.9);

  if (dip > 0.02 && film < 28) {
    context.fillStyle = `rgba(0,0,0,${dip * 0.72})`;
    context.fillRect(0, 0, FRAME_W, FRAME_H);
  }

  drawSoftPlate(context, plates.lab, 660, 40, 600, 420, lab, FILM_MEDIA.lab);
  drawSoftPlate(context, plates.section, 620, 20, 680, 460, section, FILM_MEDIA.section);
  drawSoftPlate(context, plates.depth, 660, 30, 600, 440, depth, FILM_MEDIA.depth);

  context.save();
  context.translate(960, 210);
  context.scale(pull, pull);
  context.translate(-960, -210);
  const formScale = lerp(1.06, 1, open(film, 31.5, 33.2));
  context.save();
  context.translate(960, 230);
  context.scale(formScale, formScale);
  context.translate(-960, -230);
  drawSoftPlate(context, plates.form, 700, 20, 520, 420, form, FILM_MEDIA.form);
  context.restore();
  const tileBoxes = [
    { x: 470, y: 120, w: 250, h: 250, at: 34.55 },
    { x: 835, y: 78, w: 280, h: 280, at: 33.55 },
    { x: 1210, y: 120, w: 250, h: 250, at: 34.15 },
  ];
  plates.tiles.forEach((plate, index) => {
    const box = tileBoxes[index];
    const arrive = open(film, box.at, box.at + 0.95);
    if (arrive <= 0 || tiles <= 0) return;
    context.save();
    context.globalAlpha = tiles;
    context.translate(0, lerp(28, 0, arrive));
    drawPlate(context, plate, box.x, box.y, box.w, box.h, arrive, FILM_MEDIA.tiles[index] ?? "tile");
    context.restore();
  });
  context.restore();

  if (title > 0) {
    const band = context.createLinearGradient(0, 300, 0, FRAME_H);
    band.addColorStop(0, "rgba(0,0,0,0)");
    band.addColorStop(0.45, `rgba(0,0,0,${0.55 * title})`);
    band.addColorStop(1, `rgba(0,0,0,${0.78 * title})`);
    context.fillStyle = band;
    context.fillRect(0, 300, FRAME_W, 225);
    drawTracked(context, "LIVING MORPHOLOGIES", 960, 368, displayFont, 42, title, 0.16, 1500);
    drawPlain(context, "BIOLOGICAL BEHAVIOR  →  ARCHITECTURAL GENERATION", 960, 418, 18, title);
  }
}

export function mediaTime(video: HTMLVideoElement, time: number) {
  const duration = video.duration;
  if (!Number.isFinite(duration) || duration <= 0) return 0;
  const rate = Math.min(1, Math.max(0.25, duration / 11));
  return Math.min(duration - 0.05, Math.max(0, time) * rate);
}
