/**
 * Publish the 100-run Vertical Void and Continuous Hall catalogs.
 * Usage: node scripts/publish-lobby-runs.mjs [vertical-void|continuous-hall|all] [--from N]
 */
import { execSync } from "node:child_process";
import { mkdir, readdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import puppeteer from "puppeteer-core";

const root = process.cwd();
const ids = ["vertical-void", "continuous-hall"];
const arg = process.argv.find((item) => ids.includes(item) || item === "all") ?? "all";
const fromFlag = process.argv.indexOf("--from");
const fromIndex = fromFlag >= 0 ? Number(process.argv[fromFlag + 1]) : 0;
const only = arg === "all" ? ids : [arg];
const bundlePath = path.join(root, "scripts", ".lobby-catalog-bundle.js");
const chrome = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

function safeFileName(id) {
  return id.replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 180);
}

async function readJson(file, fallback) {
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch {
    return fallback;
  }
}

execSync(
  "npx --yes esbuild scripts/lobby-catalog-browser.ts --bundle --format=iife --platform=browser --target=es2022 --outfile=scripts/.lobby-catalog-bundle.js --alias:@=. --jsx=automatic --log-level=warning",
  { cwd: root, stdio: "inherit", shell: true },
);

const browser = await puppeteer.launch({
  executablePath: chrome,
  headless: true,
  args: ["--disable-dev-shm-usage"],
});
const page = await browser.newPage();
page.on("pageerror", (error) => console.error("pageerror", error));
page.on("console", (message) => {
  if (message.type() === "error") console.error("console", message.text());
});
await page.goto("about:blank");
await page.addScriptTag({ path: bundlePath });

for (const id of only) {
  const dir = path.join(root, "public", "shared-catalog", id);
  await mkdir(dir, { recursive: true });
  const entriesFile = path.join(dir, "entries.json");
  const stateFile = path.join(root, "scripts", `.lobby-catalog-state-${id}.json`);
  const existing = await readJson(entriesFile, []);
  const byRun = new Map((Array.isArray(existing) ? existing : []).map((item) => [item.run, item]));
  const prior = fromIndex > 0 ? await readJson(stateFile, null) : null;
  const savedAt = prior?.savedAt ?? Date.now();
  await page.evaluate(
    (archetypeId, stamp, start, features, hall) => window.resetCatalog(archetypeId, stamp, start, features, hall),
    id,
    savedAt,
    fromIndex,
    prior?.features ?? [],
    prior?.hall ?? [],
  );
  const started = Date.now();
  for (let cell = fromIndex; cell < 100; cell += 1) {
    const cellStarted = Date.now();
    const result = await page.evaluate(() => window.publishCell());
    if (!result?.png?.startsWith("data:image/png") || !result.entry) {
      throw new Error(`${id} run ${cell + 1} did not draw`);
    }
    const png = Buffer.from(result.png.slice(result.png.indexOf(",") + 1), "base64");
    if (png.length < 1500) throw new Error(`${id} run ${cell + 1} image is empty (${png.length} bytes)`);
    const image = `/shared-catalog/${id}/${safeFileName(result.entry.id)}.png`;
    const previous = byRun.get(result.entry.run);
    if (previous?.image && previous.image !== image) {
      await unlink(path.join(root, "public", previous.image.replace(/^\//, ""))).catch(() => undefined);
    }
    await writeFile(path.join(root, "public", image.replace(/^\//, "")), png);
    const { identity, attempt, ...meta } = result.entry;
    byRun.set(meta.run, { ...meta, image });
    const entries = [...byRun.values()].sort((a, b) => a.run - b.run);
    await writeFile(entriesFile, `${JSON.stringify(entries, null, 2)}\n`);
    await writeFile(
      stateFile,
      JSON.stringify({ savedAt, index: result.state.index, features: result.state.features, hall: result.state.hall }),
    );
    const seconds = ((Date.now() - cellStarted) / 1000).toFixed(1);
    console.log(
      `${id} ${cell + 1}/100 ${seconds}s attempt=${attempt} identity=${identity} agents=${meta.agents} bytes=${png.length}`,
    );
  }
  const names = await readdir(dir);
  const keep = new Set([...byRun.values()].map((item) => path.basename(String(item.image ?? ""))));
  for (const name of names) {
    if (!name.endsWith(".png") || keep.has(name)) continue;
    await unlink(path.join(dir, name));
  }
  await unlink(stateFile).catch(() => undefined);
  console.log(`${id} done in ${((Date.now() - started) / 1000).toFixed(0)}s count=${byRun.size}`);
}

await browser.close();
await unlink(bundlePath).catch(() => undefined);
console.log("published", only.join(", "));
