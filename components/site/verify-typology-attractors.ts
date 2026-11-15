import { readFileSync } from "node:fs";
import { createTypologyAttractor, parseTypologyOverlay } from "./typology-attractors";

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

const parsed = parseTypologyOverlay({
  visible: false,
  types: { lobby: false, gathering: true, workspace: "no" },
  points: [
    { id: "a", typology: "lobby", x: 10, z: 20 },
    { id: "a", typology: "workspace", x: 1, z: 1 },
    { id: "b", typology: "gathering", x: 4, z: 8 },
    { id: "c", typology: "kitchen", x: 1, z: 1 },
    { id: "d", typology: "workspace", x: Number.NaN, z: 2 },
    { kind: "source", x: 3, z: 3 },
  ],
});
assert(parsed.visible === false, "The layer visibility was not kept.");
assert(parsed.types.lobby === false && parsed.types.gathering === true && parsed.types.workspace === true, "Typology visibility did not fall back cleanly.");
assert(parsed.points.length === 2 && parsed.points[0].id === "a" && parsed.points[1].typology === "gathering", "Invalid or duplicate markers were kept.");
assert(!parsed.points.some((point) => "kind" in point), "A simulation node kind entered the overlay.");

const made = createTypologyAttractor("workspace", 12, 18);
assert(made.typology === "workspace" && made.x === 12 && made.z === 18 && made.id.startsWith("intent-"), "A marker was not created as an overlay point.");

const layer = readFileSync(new URL("./typology-attractor-layer.tsx", import.meta.url), "utf8");
const panel = readFileSync(new URL("./site-strategy.tsx", import.meta.url), "utf8");
assert(!/study\.(place|move|commit|applyTargets|restart|step)\(/.test(layer), "The marker layer calls the simulation.");
assert(!/study\.(place|move|commit)\(/.test(panel), "The marker panel calls the simulation.");
assert(!layer.includes("living-morphologies.site-network"), "The marker layer writes the network store.");
console.log("typology attractors ok");
