import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import puppeteer from "puppeteer-core";

const base = process.env.EXPORT_BASE ?? "http://127.0.0.1:43141";
const width = 7407;
const height = 2160;
const outDir = path.resolve("exports/presentation");

const tabs = [
  ["01-workflow", "/"],
  ["02-physarum-translation", "/physarum"],
  ["03-physarum-runs", "/physarum/runs"],
  ["04-physarum-catalog", "/physarum/catalog"],
  ["05-evolution-process", "/evolution/process"],
  ["06-evolution", "/evolution"],
  ["07-evolution-pareto", "/evolution/pareto"],
  ["08-evolution-pareto-catalog", "/evolution/pareto-catalog"],
  ["09-vertical-stack", "/vertical#stack"],
  ["10-vertical-isomesh", "/vertical#isomesh"],
  ["11-vertical-voxels", "/vertical#voxels"],
];

function pageUrl(href) {
  const hash = href.includes("#") ? href.slice(href.indexOf("#")) : "";
  const pathOnly = hash ? href.slice(0, href.indexOf("#")) : href;
  const joiner = pathOnly.includes("?") ? "&" : "?";
  return `${base}${pathOnly}${joiner}wall=1&export=1${hash}`;
}

const browser = await puppeteer.launch({
  executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  headless: true,
  args: [`--window-size=${width},${height}`, "--force-device-scale-factor=1"],
});

await mkdir(outDir, { recursive: true });
const page = await browser.newPage();
await page.setViewport({ width, height, deviceScaleFactor: 1 });
await page.evaluateOnNewDocument(() => {
  localStorage.setItem("lm-view-mode", "presentation");
});

for (const [name, href] of tabs) {
  const url = pageUrl(href);
  process.stdout.write(`${name} `);
  await page.goto(url, { waitUntil: "networkidle0", timeout: 120000 });
  await page.waitForSelector(".stage-nav", { timeout: 30000 });
  await new Promise((resolve) => setTimeout(resolve, 1800));
  await page.emulateMediaType("screen");
  await page.pdf({
    path: path.join(outDir, `${name}.pdf`),
    width: `${width}px`,
    height: `${height}px`,
    printBackground: true,
    margin: { top: 0, right: 0, bottom: 0, left: 0 },
    pageRanges: "1",
  });
  const png = await page.screenshot({ type: "png" });
  await writeFile(path.join(outDir, `${name}.png`), png);
  process.stdout.write("ok\n");
}

await browser.close();
console.log(outDir);
