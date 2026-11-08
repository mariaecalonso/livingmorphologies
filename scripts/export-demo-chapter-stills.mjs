/**
 * Small WebP stills for the Demo Workflow chapters, exported from existing project material.
 * Generative systems: the Cellular Automata, Wave Function Collapse, and Stigmergy renders embedded in
 * `public/assets/skill0/generative-system.svg`. Precedents and archetype plates: `public/assets/skill0/precedent/`.
 * Run: `node scripts/export-demo-chapter-stills.mjs`
 */
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const ROOT = path.resolve(import.meta.dirname, "..");
const OUT = path.join(ROOT, "public/demo/chapters");
const PRECEDENT = path.join(ROOT, "public/assets/skill0/precedent");

/** Embedded renders are matched by their placement on the 7407 × 2160 board. */
const SYSTEMS = [
  { name: "system-ca", at: "translate(1169.97 831.97)" },
  { name: "system-wfc", at: "translate(2004.17 862.79)" },
  { name: "system-stigmergy", at: "translate(2973.24 814.23)" },
];

/** Catalogue archetype id → precedent plate. */
const ARCHETYPE_PLATES = {
  "vertical-void": "lobby-vertical-void.png",
  "compressed-sequential": "lobby-compressed-sequential.png",
  "continuous-hall": "lobby-continuous-hall.png",
  "topographic-ground-field": "lobby-topographic-ground-field.png",
  "linear-gallery": "lobby-linear-gallery.png",
  "open-hall": "workspace-open-hall.png",
  terraced: "workspace-terrace.jpg",
  "flat-deep-plan": "workspace-flat-deep-plan.jpg",
  "void-edge": "workspace-void-edge.jpg",
  undulated: "workspace-undulated.png",
  "stepped-amphitheater": "gathering-amphitheater.png",
  "void-field": "gathering-void-field.png",
  "inserted-horizontal-plate": "gathering-inserted-plate.png",
  "contained-room-within-volume": "gathering-contained-room.png",
  "linear-edge-gallery": "gathering-linear-edge.png",
};

const PRECEDENT_PLATES = ["photo-lattice.jpg", "photo-slabs.png", "photo-atrium.jpg", "axon.png", "graph-traces.png", "graph-mesh.png"];

const webp = (input, file, size) =>
  sharp(input)
    .resize(size, size, { fit: "inside", withoutEnlargement: true })
    .flatten({ background: "#000000" })
    .webp({ quality: 82 })
    .toFile(path.join(OUT, `${file}.webp`));

async function main() {
  await mkdir(OUT, { recursive: true });

  const board = await readFile(path.join(ROOT, "public/assets/skill0/generative-system.svg"), "utf8");
  for (const system of SYSTEMS) {
    const start = board.indexOf(`transform="${system.at}`);
    if (start < 0) throw new Error(`${system.name}: render not found on the board`);
    const data = /href="data:image\/png;base64,([^"]+)"/.exec(board.slice(start, start + 8_000_000));
    if (!data) throw new Error(`${system.name}: no embedded image`);
    await webp(Buffer.from(data[1], "base64"), system.name, 520);
  }

  for (const file of PRECEDENT_PLATES) await webp(path.join(PRECEDENT, file), `precedent-${path.parse(file).name}`, 640);
  for (const [id, file] of Object.entries(ARCHETYPE_PLATES)) await webp(path.join(PRECEDENT, file), `archetype-${id}`, 260);

  await webp(path.join(ROOT, "public/assets/skill0/physarum-behavior.jpg"), "physarum-behavior", 640);
  await webp(path.join(ROOT, "public/skill5/herald-aerial-2024.jpg"), "herald-aerial", 760);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
