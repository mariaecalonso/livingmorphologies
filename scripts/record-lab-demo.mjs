import { spawn } from "node:child_process";
import { mkdir, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import puppeteer from "puppeteer-core";

const require = createRequire(import.meta.url);
const ffmpeg = process.env.FFMPEG || require("ffmpeg-static");
const chrome = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const root = path.resolve(import.meta.dirname, "..");
const outDir = path.join(root, "public", "lab-demo");
const framesDir = path.join(tmpdir(), "lm-lab-demo-frames");
const base = "http://127.0.0.1:43141";
const width = 1920;
const height = 560;

const stops = [
  { id: "physarum", path: "/lab/physarum", hold: 11000 },
  { id: "physarum-runs", path: "/lab/physarum/runs", hold: 10000 },
  { id: "physarum-catalog", path: "/lab/physarum/catalog", hold: 10000 },
  { id: "optimization", path: "/lab/evolution", hold: 11000 },
  { id: "pareto", path: "/lab/evolution/pareto", hold: 10000 },
  { id: "optimization-catalog", path: "/lab/evolution/pareto-catalog", hold: 10000 },
  { id: "vertical", path: "/lab/vertical", hold: 11000 },
  { id: "vertical-catalog", path: "/lab/vertical/catalogue", hold: 10000 },
  { id: "vertical-final", path: "/lab/vertical/final", hold: 10000 },
  { id: "hybrid", path: "/lab/hybrid", hold: 11000 },
  { id: "hybrid-catalog", path: "/lab/hybrid/catalog", hold: 10000 },
];

const testOnly = process.argv.includes("--test");
const tour = testOnly ? [{ ...stops[0], hold: 4000 }] : stops;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: "inherit" });
    child.on("error", reject);
    child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`${command} exited ${code}`))));
  });
}

const browser = await puppeteer.launch({
  executablePath: chrome,
  headless: true,
  defaultViewport: { width, height, deviceScaleFactor: 1 },
  args: ["--hide-scrollbars", "--disable-dev-shm-usage", `--window-size=${width},${height}`],
});

const page = await browser.newPage();
await page.evaluateOnNewDocument(() => {
  localStorage.setItem("lm-view-mode", "presentation");
  localStorage.setItem("lm-site-display", "classroom");
});

await rm(framesDir, { recursive: true, force: true });
await mkdir(framesDir, { recursive: true });
await mkdir(outDir, { recursive: true });

const marks = [];
let filmed = 0;

async function shoot() {
  const shot = await page.screenshot({ type: "jpeg", quality: 68 });
  await writeFile(path.join(framesDir, `f${String(frameCount).padStart(5, "0")}.jpg`), shot);
  frameCount += 1;
}

async function hold(ms) {
  const until = Date.now() + ms;
  const beganHold = Date.now();
  while (Date.now() < until) {
    const began = Date.now();
    await shoot();
    const rest = 160 - (Date.now() - began);
    if (rest > 0) await sleep(rest);
  }
  filmed += Date.now() - beganHold;
}

async function show(stop) {
  await page.goto(`${base}${stop.path}`, { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForSelector("iframe.presentation-canvas", { timeout: 30000 });
  let frame = null;
  for (let attempt = 0; attempt < 40 && !frame; attempt += 1) {
    frame = page.frames().find((item) => item.url().includes("frame=1"));
    if (!frame) await sleep(250);
  }
  if (!frame) throw new Error(`No presentation frame for ${stop.path}`);
  await frame.waitForSelector(".stage-body", { timeout: 60000 });
  await sleep(1400);
  marks.push({ id: stop.id, path: stop.path, frame: frameCount });
  await hold(stop.hold);
}

let frameCount = 0;
try {
  for (const stop of tour) await show(stop);
} finally {
  await browser.close();
}

const files = (await readdir(framesDir)).filter((name) => name.endsWith(".jpg"));
if (files.length < 2) throw new Error("Recording produced no frames");
const span = Math.max(0.1, filmed / 1000);
const fps = Math.max(4, Math.min(12, (files.length - 1) / span));
const timed = marks.map((mark) => ({ ...mark, at: Number((mark.frame / fps).toFixed(2)) }));
console.log(JSON.stringify({ frames: files.length, fps: Number(fps.toFixed(3)), marks: timed }, null, 2));

if (testOnly) {
  console.log(path.join(framesDir, "f00000.jpg"));
  process.exit(0);
}

await run(ffmpeg, [
  "-y",
  "-framerate",
  String(fps),
  "-i",
  path.join(framesDir, "f%05d.jpg"),
  "-c:v",
  "libx264",
  "-pix_fmt",
  "yuv420p",
  "-movflags",
  "+faststart",
  path.join(outDir, "walk.mp4"),
]);
await run(ffmpeg, [
  "-y",
  "-ss",
  "1.5",
  "-i",
  path.join(outDir, "walk.mp4"),
  "-frames:v",
  "1",
  path.join(outDir, "poster.webp"),
]);
await writeFile(path.join(outDir, "marks.json"), JSON.stringify({ fps, marks: timed }, null, 2));
await rm(framesDir, { recursive: true, force: true });
