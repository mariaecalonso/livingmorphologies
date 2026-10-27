/**
 * White colonization loop for the Rules preview.
 * Reveals the natural Physarum photograph along its own branches,
 * from the core outward. Does not change the simulation or the catalog.
 */
import { writeFileSync } from "node:fs";
import { GIFEncoder } from "gifenc";
import sharp from "sharp";

const SIZE = 400;
const FRAMES = 20;
const DELAY = 120;
const SOURCE = "public/assets/skill0/physarum-colony.png";
const OUTPUT = "public/assets/skill0/physarum-growth.gif";

async function main() {
const { data, info } = await sharp(SOURCE)
  .resize(SIZE, SIZE, { fit: "contain", background: "#000000" })
  .removeAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });

const width = info.width;
const height = info.height;
const count = width * height;
const on = new Uint8Array(count);
for (let i = 0; i < count; i += 1) {
  const red = data[i * 3];
  const green = data[i * 3 + 1];
  const blue = data[i * 3 + 2];
  const luminance = red * 0.299 + green * 0.587 + blue * 0.114;
  const yellow = Math.max(red, green, blue) - Math.min(red, green, blue) > 46;
  on[i] = luminance > 85 && yellow ? 1 : 0;
}

const open = on;

const dist = new Int32Array(count).fill(-1);
const queue: number[] = [];
const centerX = (width - 1) / 2;
const centerY = (height - 1) / 2;
const seed = Math.min(width, height) * 0.07;
for (let y = 0; y < height; y += 1) {
  for (let x = 0; x < width; x += 1) {
    const index = y * width + x;
    if (!open[index]) continue;
    if ((x - centerX) ** 2 + (y - centerY) ** 2 > seed * seed) continue;
    dist[index] = 0;
    queue.push(index);
  }
}

const stepX = [1, -1, 0, 0, 1, 1, -1, -1];
const stepY = [0, 0, 1, -1, 1, -1, 1, -1];
let head = 0;
let max = 0;
while (head < queue.length) {
  const index = queue[head];
  head += 1;
  const next = dist[index] + 1;
  const x = index % width;
  const y = Math.floor(index / width);
  for (let dir = 0; dir < 8; dir += 1) {
    const nx = x + stepX[dir];
    const ny = y + stepY[dir];
    if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
    const neighbor = ny * width + nx;
    if (!open[neighbor] || dist[neighbor] !== -1) continue;
    dist[neighbor] = next;
    if (next > max) max = next;
    queue.push(neighbor);
  }
}
const palette = [[0, 0, 0], [255, 255, 255]];
const gif = GIFEncoder();
for (let frame = 0; frame < FRAMES; frame += 1) {
  const cutoff = Math.round(max * ((frame + 1) / FRAMES));
  const index = new Uint8Array(count);
  for (let i = 0; i < count; i += 1) {
    if (on[i] && dist[i] >= 0 && dist[i] <= cutoff) index[i] = 1;
  }
  gif.writeFrame(index, width, height, { palette: frame === 0 ? palette : undefined, delay: frame === FRAMES - 1 ? DELAY * 4 : DELAY, repeat: 0 });
}
gif.finish();
writeFileSync(OUTPUT, Buffer.from(gif.bytes()));
console.log(OUTPUT, `${width}x${height}`, `reach ${max}`);
}

main();
