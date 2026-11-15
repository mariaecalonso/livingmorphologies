/**
 * Small connection sample. Uses the stored meshes and proposeDirectJoin.
 * Does not write the live configuration store.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { decodeSolidifiedMesh } from "../../lib/skill3/solidified-mesh";
import { readSolidifiedMesh } from "../../lib/skill3/solidified-catalogue";
import { SITE_ARCHETYPES } from "../../lib/skill5/catalog";
import { proposeDirectJoin } from "../../lib/skill5/direct-join";
import { MODULE_GROUND_Y, MODULE_HEIGHT_FT, type PlacedModule } from "../../lib/skill5/placement";

function entry(id: string) {
  const found = SITE_ARCHETYPES.find((item) => item.archetypeId === id);
  if (!found?.program) throw new Error(id);
  return found;
}

function mesh(id: string) {
  const item = entry(id);
  const stored = readSolidifiedMesh(item.archetypeId, item.candidateId, item.continuationId);
  if (!stored) throw new Error(`missing ${id}`);
  return decodeSolidifiedMesh(stored.geometry).positions;
}

function tile(id: string, archetypeId: string, x: number, y: number, z: number, rotationY: number): PlacedModule {
  const item = entry(archetypeId);
  return {
    instanceId: id,
    kind: "archetype",
    name: item.name,
    status: item.status,
    geometryState: "available",
    program: item.program ?? "unassigned",
    programSource: "suggested",
    provenance: { moduleId: item.moduleId, archetypeId, source: "skill3", candidateId: item.candidateId, continuationId: item.continuationId },
    transform: { position: { x, y, z }, rotationY },
  };
}

function summarize(label: string, a: PlacedModule, b: PlacedModule, meshA: Float32Array, meshB: Float32Array) {
  const result = proposeDirectJoin(a, b, meshA, meshB);
  return {
    label,
    tiles: [a.provenance.archetypeId, b.provenance.archetypeId],
    programs: [a.program, b.program],
    faces: `${result.faceA ?? "-"}/${result.faceB ?? "-"}`,
    rotations: [a.transform.rotationY, b.transform.rotationY],
    method: "direct",
    valid: result.valid,
    traversable: result.traversable,
    integrity: result.integrity,
    alignment: result.alignment,
    floorDelta: result.floorDelta,
    passageVertices: result.passage ? result.passage.positions.length / 3 : 0,
    issues: result.issues,
    passage: result.passage,
    a,
    b,
  };
}

const voidMesh = mesh("void-field");
const plateMesh = mesh("inserted-horizontal-plate");
const edgeMesh = mesh("linear-edge-gallery");
const terraceMesh = mesh("terraced");
const turn = Math.PI;

const pair = summarize(
  "horizontal void-field",
  tile("a", "void-field", 0, MODULE_GROUND_Y, 0, turn),
  tile("b", "void-field", MODULE_HEIGHT_FT, MODULE_GROUND_Y, 0, 0),
  voidMesh,
  voidMesh,
);
const third = summarize(
  "third void-field",
  tile("b", "void-field", MODULE_HEIGHT_FT, MODULE_GROUND_Y, 0, 0),
  tile("c", "void-field", MODULE_HEIGHT_FT * 2, MODULE_GROUND_Y, 0, turn),
  voidMesh,
  voidMesh,
);
const stack = summarize(
  "vertical void-field",
  tile("a", "void-field", 0, MODULE_GROUND_Y, 0, turn),
  tile("up", "void-field", 0, MODULE_GROUND_Y + MODULE_HEIGHT_FT, 0, 0),
  voidMesh,
  voidMesh,
);
const bottoms = summarize(
  "vertical bottoms",
  tile("edge", "linear-edge-gallery", 0, MODULE_GROUND_Y, 0, 0),
  tile("plate", "inserted-horizontal-plate", 0, MODULE_GROUND_Y + MODULE_HEIGHT_FT, 0, 0),
  edgeMesh,
  plateMesh,
);
const mixed = summarize(
  "mixed void-field and terraced",
  tile("a", "void-field", 0, MODULE_GROUND_Y, 0, turn),
  tile("t", "terraced", MODULE_HEIGHT_FT, MODULE_GROUND_Y, 0, 0),
  voidMesh,
  terraceMesh,
);

function project(positions: ArrayLike<number>, origin: { x: number; y: number; z: number }, rotationY: number, layout: "mesh" | "world") {
  const points: { x: number; y: number }[] = [];
  const cos = Math.cos(rotationY);
  const sin = Math.sin(rotationY);
  for (let index = 0; index < positions.length; index += 9) {
    const lx = positions[index];
    const up = layout === "mesh" ? positions[index + 2] : positions[index + 1];
    const north = layout === "mesh" ? positions[index + 1] : positions[index + 2];
    const x = origin.x + lx * cos + north * sin;
    const z = origin.z - lx * sin + north * cos;
    points.push({ x: 160 + x * 4.2 - z * 1.6, y: 430 - (origin.y + up) * 4.2 - z * 0.7 });
  }
  return points;
}

const clouds = [
  project(voidMesh, pair.a.transform.position, pair.a.transform.rotationY, "mesh"),
  project(voidMesh, pair.b.transform.position, pair.b.transform.rotationY, "mesh"),
];
const passage = pair.passage
  ? project(Float32Array.from(pair.passage.positions), { x: 0, y: 0, z: 0 }, 0, "world")
  : [];
const dots = (points: { x: number; y: number }[], color: string) => points.filter((_, index) => index % 4 === 0).map((point) => `<circle cx="${point.x.toFixed(1)}" cy="${point.y.toFixed(1)}" r="0.6" fill="${color}"/>`).join("");
const html = `<!doctype html><html><head><meta charset="utf-8"><title>Connection sample</title><style>body{margin:0;background:#000;color:#fff;font:13px ui-sans-serif,sans-serif}h1{font-weight:500;letter-spacing:.12em;text-transform:uppercase;font-size:13px;padding:24px 24px 0}p{color:#bbb;padding:0 24px}</style></head><body><h1>Direct join sample · void field to void field</h1><p>Points are vertices of the stored meshes. Copper is the passage returned by the direct join. ${pair.valid ? "The join validated." : "The join did not validate."}</p><svg viewBox="0 0 700 520" width="700" height="520"><rect width="100%" height="100%" fill="#000"/>${dots(clouds[0], "#5d7c79")}${dots(clouds[1], "#8aa09d")}${dots(passage, "#c77e5f")}</svg></body></html>`;

const out = join(process.cwd(), "data", "skill5", "autonomous-test", "repair-02");
mkdirSync(out, { recursive: true });
const report = [pair, third, stack, bottoms, mixed].map(({ passage: _passage, a: _a, b: _b, ...item }) => item);
writeFileSync(join(out, "sample.json"), JSON.stringify(report, null, 2));
writeFileSync(join(out, "sample.html"), html);
console.log(JSON.stringify(report, null, 2));
