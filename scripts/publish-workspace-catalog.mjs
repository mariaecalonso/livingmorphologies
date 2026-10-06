/**
 * Publish 100 current drawings for Open Hall, Terraced, and Undulated.
 * Usage: node scripts/publish-workspace-catalog.mjs [open-hall|terraced|undulated|all] [--from N]
 */
import { mkdir, readdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import * as esbuild from "esbuild";
import puppeteer from "puppeteer-core";

const root = process.cwd();
const ids = ["open-hall", "terraced", "undulated"];
const arg = process.argv.find((item) => ids.includes(item) || item === "all") ?? "all";
const fromFlag = process.argv.indexOf("--from");
const fromIndex = fromFlag >= 0 ? Number(process.argv[fromFlag + 1]) : 0;
const only = arg === "all" ? ids : [arg];
const probeOnly = process.argv.includes("--probe");
const bundlePath = path.join(root, "scripts", ".workspace-catalog-bundle.js");
const chrome = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

async function bundle() {
  await esbuild.build({
    absWorkingDir: root,
    entryPoints: ["scripts/workspace-catalog-browser.ts"],
    bundle: true,
    format: "iife",
    platform: "browser",
    target: "es2022",
    outfile: bundlePath,
    alias: { "@": root },
    jsx: "automatic",
    logLevel: "warning",
  });
}

function safeFileName(id) {
  return id.replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 180);
}

async function readEntries(file) {
  try {
    const parsed = JSON.parse(await readFile(file, "utf8"));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

await bundle();

const browser = await puppeteer.launch({
  executablePath: chrome,
  headless: true,
  args: [
    "--use-gl=angle",
    "--use-angle=swiftshader",
    "--enable-webgl",
    "--ignore-gpu-blocklist",
    "--enable-unsafe-swiftshader",
  ],
});

const page = await browser.newPage();
await page.setViewport({ width: 1400, height: 1400, deviceScaleFactor: 1 });
page.on("pageerror", (error) => console.error("pageerror", error));
page.on("console", (message) => {
  if (message.type() === "error") console.error("console", message.text());
});
await page.goto("about:blank");
await page.addScriptTag({ path: bundlePath });
const probe = await page.evaluate(() => window.probeGl());
console.log("gl", probe);
if (probe !== "webgl2-float") throw new Error(`WebGL float textures unavailable (${probe})`);

if (probeOnly) {
  const id = only[0];
  const entry = await page.evaluate((archetypeId, cell, stamp) => window.publishCell(archetypeId, cell, stamp), id, fromIndex, Date.now());
  const png = Buffer.from(entry.png.slice(entry.png.indexOf(",") + 1), "base64");
  const out = path.join(root, "scripts", `.probe-${id}-${fromIndex}.png`);
  await writeFile(out, png);
  console.log("probe", id, "run", entry.run, "lit", entry.lit, "iters", entry.iterations, "bytes", png.length, out);
  await browser.close();
  await unlink(bundlePath).catch(() => undefined);
  process.exit(0);
}

for (const id of only) {
  const dir = path.join(root, "public", "shared-catalog", id);
  await mkdir(dir, { recursive: true });
  const file = path.join(dir, "entries.json");
  const existing = await readEntries(file);
  const byRun = new Map(existing.map((item) => [item.run, item]));
  const savedAt = Date.now();
  const started = Date.now();
  for (let index = fromIndex; index < 100; index += 1) {
    const cellStarted = Date.now();
    const entry = await page.evaluate((archetypeId, cell, stamp) => window.publishCell(archetypeId, cell, stamp), id, index, savedAt);
    if (!entry?.png?.startsWith("data:image/png") || entry.lit < 80) {
      throw new Error(`${id} run ${index + 1} did not draw (lit ${entry?.lit ?? 0})`);
    }
    const png = Buffer.from(entry.png.slice(entry.png.indexOf(",") + 1), "base64");
    const image = `/shared-catalog/${id}/${safeFileName(entry.id)}.png`;
    const previous = byRun.get(entry.run);
    if (previous?.image && previous.image !== image) {
      await unlink(path.join(root, "public", previous.image.replace(/^\//, ""))).catch(() => undefined);
    }
    await writeFile(path.join(root, "public", image.replace(/^\//, "")), png);
    const { png: _png, lit: _lit, ...meta } = entry;
    byRun.set(entry.run, { ...meta, image });
    if ((index + 1) % 5 === 0 || index === 99) {
      const entries = [...byRun.values()].sort((a, b) => a.run - b.run);
      const body = `${JSON.stringify(entries, null, 2)}\n`;
      let wrote = false;
      for (let attempt = 0; attempt < 8 && !wrote; attempt += 1) {
        try {
          await writeFile(file, body);
          wrote = true;
        } catch (error) {
          if (attempt === 7) throw error;
          await new Promise((resolve) => setTimeout(resolve, 400 * (attempt + 1)));
        }
      }
    }
    const seconds = ((Date.now() - cellStarted) / 1000).toFixed(1);
    console.log(`${id} ${index + 1}/100 ${seconds}s lit=${entry.lit} iters=${entry.iterations} bytes=${png.length}`);
  }
  const names = await readdir(dir);
  const keep = new Set([...byRun.values()].map((item) => path.basename(String(item.image ?? ""))));
  for (const name of names) {
    if (!name.endsWith(".png") || keep.has(name)) continue;
    await unlink(path.join(dir, name));
  }
  console.log(`${id} done in ${((Date.now() - started) / 1000).toFixed(0)}s count=${byRun.size}`);
}

await browser.close();
await unlink(bundlePath).catch(() => undefined);
console.log("published", only.join(", "));
