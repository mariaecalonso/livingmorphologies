import context from "@/data/skill5/herald-site.json";
import { pointInRing } from "@/lib/skill5/placement";
import type { SiteContext, XZ } from "@/lib/skill5/site-model";
import { STUDY_LIMIT } from "./site-geometry";
import { analyzeNetwork, countTrailComponents, networkFigures, reinforcedCut } from "./site-network-analysis";
import { FLOW_SURVIVE } from "./site-network-flow";
import { trailDisplayAlpha } from "./site-network-display";
import { SOURCE_CONTOUR_NOTE } from "./site-network-contours";
import { influenceAt, NETWORK_STEP_BUDGET, nextArrival, REACH_HOLDS, reachFeet, siteToField, strongTrailFeet, SiteNetworkStudy, type NetworkIteration, type NetworkNode } from "./site-network";

const site = context as SiteContext;
const parcel: XZ[] = [
  [0, 0],
  [200, 0],
  [200, 200],
  [0, 200],
];
const water: XZ[] = [
  [1000, 1000],
  [1200, 1000],
  [1200, 1200],
  [1000, 1200],
];
const nodes: NetworkNode[] = [
  { id: "n1", kind: "source", x: 40, z: 70 },
  { id: "n2", kind: "attractor", x: 150, z: 130 },
];
const seed = 20261105;
const steps = 4;

function same(left: Float32Array, right: Float32Array) {
  if (left.length !== right.length) return false;
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return false;
  }
  return true;
}

function grow(studySeed: number) {
  const study = new SiteNetworkStudy(parcel, water, { seed: studySeed, nodes, persist: false });
  if (!study.canRun) throw new Error("The test nodes are outside the land.");
  study.resume();
  study.step(steps, false);
  return study;
}

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function cellCenter(study: SiteNetworkStudy, x: number, y: number): XZ {
  const size = study.inkSize;
  return [
    study.frame.minX + ((x + 0.5) / size) * study.frame.width,
    study.frame.minZ + ((y + 0.5) / size) * study.frame.depth,
  ];
}

const first = grow(seed);
const repeat = grow(seed);
const snapshot = first.snapshotTrails();
assert(same(snapshot, repeat.snapshotTrails()), "The same seed and nodes produced different trail fields.");

first.reset();
first.resume();
first.step(steps, false);
assert(same(snapshot, first.snapshotTrails()), "Reset did not replay the seeded trail field.");

const other = grow(seed + 1);
assert(!same(snapshot, other.snapshotTrails()), "A different seed produced the same trail field.");

let rawSample = false;
for (let index = 0; index < snapshot.length; index += 1) {
  const value = snapshot[index];
  if (value > 0 && value < 1 && value !== trailDisplayAlpha(value)) rawSample = true;
}
assert(rawSample, "The stored field matches display alpha instead of raw trail values.");

const copy = first.snapshotTrails();
copy[0] = 99;
assert(first.snapshotTrails()[0] !== 99, "snapshotTrails returned the live trail array.");
assert(first.insideField(-20, 100) === false, "The padded rectangle outside the parcel is traversable.");
assert(first.traversable < first.inkSize * first.inkSize, "Every rectangular cell was opened.");

const shore: XZ[] = [
  [150, 150],
  [210, 150],
  [210, 210],
  [150, 210],
];
const dry = new SiteNetworkStudy(parcel, shore, { persist: false });
assert(dry.domain.valid, "A closed water polygon was rejected.");
assert(dry.insideField(180, 180) === false, "Water inside the parcel stayed open.");
assert(dry.insideField(40, 70) === true, "Dry parcel land was closed.");
const overWater = new SiteNetworkStudy(parcel, shore, { persist: false, overWater: shore });
assert(overWater.insideField(180, 180) === true, "An explicit over-water zone stayed closed.");
const unnamedZone = new SiteNetworkStudy(parcel, shore, { persist: false, overWater: [[0, 0]] });
assert(unnamedZone.insideField(180, 180) === false, "An invalid over-water zone opened the water.");
assert(unnamedZone.domain.gaps.some((gap) => gap.includes("over-water")), "An invalid over-water zone was not reported.");

const blocked = new SiteNetworkStudy(parcel, water, {
  persist: false,
  buildings: [{ id: "existing", ring: [[20, 20], [40, 20], [40, 40], [20, 40]] }],
});
assert(blocked.insideField(30, 30) === false, "An existing footprint stayed traversable.");
assert(blocked.insideField(100, 100) === true, "Land beside an existing footprint was closed.");

const missingWater = new SiteNetworkStudy(parcel, [[0, 0]], { persist: false });
assert(missingWater.domain.valid === false, "A broken water ring was accepted.");
assert(missingWater.traversable === 0, "Missing water fell back to an open rectangle.");
assert(missingWater.insideField(100, 100) === false, "Missing water allowed growth.");
assert((missingWater.status.note ?? "").includes("water"), "Missing water was not reported.");

const frame = { minX: 0, maxX: 200, minZ: 0, maxZ: 200, width: 200, depth: 200 };
const trails = new Float32Array(4);
trails[0] = 0.5;
trails[3] = 0;
const iteration: NetworkIteration = {
  id: "metric",
  index: 1,
  seed,
  nodes,
  step: steps,
  settled: false,
  reached: 0,
  total: 1,
  reachedIds: [],
  connectedIds: [],
  note: null,
  trails,
  inkSize: 2,
  traversable: 2,
  cellFeet: 1,
};
const density = analyzeNetwork("density", [iteration], frame);
const peak = density?.metrics.find((item) => item.label === "Peak strength")?.value;
const coverage = density?.metrics.find((item) => item.label === "Trail coverage")?.value;
assert(peak === "0.50", `Peak strength was ${peak}, expected the raw trail value 0.50.`);
assert(coverage === "50%", `Trail coverage was ${coverage}, expected 50% of the traversable cells.`);
const faintTrails = new Float32Array(4);
faintTrails[0] = FLOW_SURVIVE * 0.5;
faintTrails[1] = FLOW_SURVIVE;
const faint: NetworkIteration = { ...iteration, id: "faint", generator: "flow", trails: faintTrails };
const faintDensity = analyzeNetwork("density", [faint], frame);
assert(faintDensity?.metrics.find((item) => item.label === "Tube coverage")?.value === "50%", "Conductivity below the survival value was counted as a tube.");
assert(faintDensity?.metrics.some((item) => item.label === "Mean conductivity"), "Density still labels conductivity as strength.");
assert(faintDensity?.legend.includes("conductivity") === true, "The density legend still describes agent trail.");

const regions = new Float32Array(16);
regions[0] = 0.05;
regions[1] = 0.02;
regions[8] = 0.019;
regions[15] = 0.05;
assert(countTrailComponents(regions, 4) === 2, "Separate raw trails were counted as one region.");
regions[2] = 0.02;
regions[3] = 0.02;
regions[7] = 0.02;
regions[11] = 0.02;
assert(countTrailComponents(regions, 4) === 1, "An edge of raw trail did not join the regions.");

const occupied = new Float32Array(11);
occupied.fill(0.05);
occupied[10] = 1;
const cut = reinforcedCut(occupied);
assert(Math.abs(cut - 0.05) < 1e-4, `The hierarchy cut was ${cut}, expected the raw trail value 0.05.`);

const chartTrails = new Float32Array(16);
chartTrails[0] = 0.5;
chartTrails[1] = 0.5;
chartTrails[15] = 0.5;
const chart: NetworkIteration = {
  id: "chart",
  index: 1,
  seed,
  nodes,
  step: 1,
  settled: false,
  reached: 0,
  total: 1,
  reachedIds: [],
  connectedIds: [],
  note: null,
  trails: chartTrails,
  inkSize: 4,
  traversable: 16,
  cellFeet: 1,
};
const chartFrame = { minX: 0, maxX: 40, minZ: 0, maxZ: 40, width: 40, depth: 40 };
const drawn = networkFigures(chart, chartFrame);
const drawnAgain = networkFigures(chart, chartFrame);
assert(drawn !== null && drawnAgain !== null, "The chart did not draw.");
assert(drawn.components === 2, `The chart reported ${drawn?.components} regions.`);
assert(drawn.connectivity.some((value) => value > 0), "The connected trail plate is empty.");
let plateMatch = true;
for (let index = 0; index < drawn.connectivity.length; index += 1) {
  if (drawn.connectivity[index] !== drawnAgain.connectivity[index]) plateMatch = false;
}
assert(plateMatch, "The same raw trail produced a different connectivity plate.");
const firstMetrics = analyzeNetwork("connectivity", [chart], chartFrame)?.metrics.map((item) => `${item.label}:${item.value}`).join("|");
const secondMetrics = analyzeNetwork("connectivity", [chart], chartFrame)?.metrics.map((item) => `${item.label}:${item.value}`).join("|");
assert(firstMetrics === secondMetrics && Boolean(firstMetrics?.includes("Components")), "Connectivity metrics were not reproducible.");

const tolerance = reachFeet(1.867);
const visit = nextArrival(0, 80, 4, true, tolerance, false);
assert(visit.visiting && !visit.connected && !visit.reached && visit.holds === 0, "An agent visit was marked as a trail connection.");
const once = nextArrival(0, 5, 90, true, tolerance, false);
assert(once.connected && !once.reached && once.holds === 1, "One trail scan was enough to mark an attractor persistent.");
const stable = nextArrival(REACH_HOLDS - 1, 5, 90, true, tolerance, false);
assert(stable.reached && stable.connected && !stable.visiting, "A strong trail inside the cell tolerance was not persistent.");
const left = nextArrival(REACH_HOLDS, 12, 4, true, tolerance, true);
assert(!left.reached && !left.connected && left.visiting && left.holds === 0, "A trail outside the tolerance stayed marked as connected.");
const held = nextArrival(REACH_HOLDS, 80, 40, false, tolerance, true);
assert(held.reached && held.connected && !held.visiting, "A persistent connection was cleared between scans.");
const near = nextArrival(0, tolerance - 0.1, 40, true, tolerance, false);
const far = nextArrival(0, tolerance + 0.5, 40, true, tolerance, false);
assert(near.connected && !far.connected, "The connection tolerance did not follow the cell scale.");

const gridFeet = 1.867;
const grid = 8;
const gridFrame = { minX: 0, maxX: grid * gridFeet, minZ: 0, maxZ: grid * gridFeet, width: grid * gridFeet, depth: grid * gridFeet };
const gridTrails = new Float32Array(grid * grid);
gridTrails[4 * grid + 4] = 0.2;
const cellEast = gridFrame.minX + 4.5 * gridFeet;
const cellNorth = gridFrame.minZ + 4.5 * gridFeet;
const closeGap = strongTrailFeet(gridTrails, grid, gridFrame, cellEast + 6, cellNorth);
const farGap = strongTrailFeet(gridTrails, grid, gridFrame, cellEast + 12, cellNorth);
assert(Math.abs(closeGap - 6) < 0.05, `A trail 6 ft away measured ${closeGap} ft.`);
assert(closeGap <= tolerance && farGap > tolerance, "A trail within four cells was treated like one outside them.");
const again = strongTrailFeet(gridTrails, grid, gridFrame, cellEast + 6, cellNorth);
assert(again === closeGap, "The same trail field produced a different connection distance.");

const pair = new SiteNetworkStudy(parcel, water, {
  persist: false,
  seed,
  generator: "agents",
  nodes: [
    { id: "s", kind: "source", x: 100, z: 100 },
    { id: "a", kind: "attractor", x: 40, z: 100 },
    { id: "b", kind: "attractor", x: 160, z: 100 },
  ],
});
pair.resume();
pair.step(1, false);
const primaryA = pair.primaryAttractor();
pair.step(1, false);
const primaryB = pair.primaryAttractor();
assert(primaryA.x !== primaryB.x || primaryA.y !== primaryB.y, "The engine primary stayed on the first attractor.");
const marks = pair.attractorMarks();
assert(marks.length === 2 && marks[0].strength === marks[1].strength, "The attractors were not given the same deposit strength.");
const field = { minX: 0, maxX: 200, minZ: 0, maxZ: 200, width: 200, depth: 200 };
const atA = influenceAt(field, pair.edit.nodes, 40, 100).attractor;
const atB = influenceAt(field, pair.edit.nodes, 160, 100).attractor;
assert(Math.abs(atA - atB) < 1e-6, "The attraction field peaks are not equal at the two attractors.");
assert(SOURCE_CONTOUR_NOTE.includes("conceptual source influence"), "Source contours are not labeled as conceptual.");

const miami = new SiteNetworkStudy(site.site.ring, site.water.ring, { buildings: site.buildings, persist: false });
const access = miami.edit.candidates.filter((item) => item.role === "access");
const baywalk = miami.edit.candidates.find((item) => item.id === "pedestrian:baywalk:named");
assert(access.length === 2, "The handoff does not have two pedestrian access contacts.");
assert(baywalk != null && baywalk.approvable === false && baywalk.path.length > 1, "The named Baywalk was turned into a traversable node.");
const northeast = access.find((item) => item.id === "pedestrian:access:Potential Northeast Access");
const citySide = access.find((item) => item.id === "pedestrian:access:Potential City-Side Access");
if (!northeast || !citySide) throw new Error("A pedestrian access contact is missing.");
assert(Math.abs(northeast.measuredX - 207.26446453046862) < 1e-9 && Math.abs(northeast.measuredZ - 235.00419299870347) < 1e-9, "The northeast contact moved off its measured coordinate.");
assert(Math.abs(citySide.measuredX - 32.30052205108297) < 1e-9 && Math.abs(citySide.measuredZ - 225.95792350123355) < 1e-9, "The city-side contact moved off its measured coordinate.");
for (const candidate of access) {
  const resolvedX = candidate.resolvedX;
  const resolvedZ = candidate.resolvedZ;
  if (resolvedX == null || resolvedZ == null || !miami.insideField(resolvedX, resolvedZ)) throw new Error(`${candidate.id} did not resolve to an open cell.`);
  assert(Math.hypot(resolvedX - candidate.measuredX, resolvedZ - candidate.measuredZ) <= 30, `${candidate.id} jumped more than 30 ft inside.`);
}
assert(miami.edit.nodes.length === 0, "An unapproved access contact entered the growth.");
assert(miami.approveCandidate(northeast.id, "source"), "The northeast contact could not be approved.");
assert(miami.edit.nodes.some((node) => node.id === northeast.id && node.kind === "source" && node.measuredX === northeast.measuredX), "Approval dropped the measured coordinate.");
const approvedNodes = miami.edit.nodes.slice();
assert(approvedNodes.length === 1, "Approval replaced the manual nodes.");
miami.remove(northeast.id);
assert(miami.edit.nodes.length === 0, "Removing an approved contact left it in the growth.");
assert(miami.domain.valid, `The Miami parcel or water could not be used. ${miami.domain.gaps.join(" ")}`);
assert(miami.frame.width === miami.frame.depth, "The simulation frame still stretches the parcel.");
assert(Math.abs(miami.cellFeet - miami.frame.depth / miami.inkSize) < 1e-9, "Trail cells are not square in site feet.");
const origin = siteToField(90, -180, miami.frame);
const east = siteToField(190, -180, miami.frame);
const north = siteToField(90, -80, miami.frame);
const eastSpan = Math.hypot(east.x - origin.x, east.y - origin.y);
const northSpan = Math.hypot(north.x - origin.x, north.y - origin.y);
assert(Math.abs(eastSpan - northSpan) < 1e-6, "One hundred site feet east and north do not match in the engine field.");
assert(miami.domain.boundary.length === site.site.ring.length, "The mask boundary is not the parcel ring.");
assert(miami.domain.obstacles.length === 0, "A footprint was treated as an obstacle without intersecting the parcel.");
assert(miami.traversable > 0 && miami.traversable < miami.inkSize * miami.inkSize, "The Miami mask is empty or the whole rectangle.");
assert(miami.insideField(-100, 0) === false, "A point outside the parcel and inside the old study window is open.");
assert(miami.insideField(STUDY_LIMIT.minX + 10, 0) === false, "The display study window is still the simulation boundary.");

let openOutside = 0;
let openWater = 0;
let waterOnParcel = 0;
for (let y = 0; y < miami.inkSize; y += 1) {
  for (let x = 0; x < miami.inkSize; x += 1) {
    const [east, north] = cellCenter(miami, x, y);
    const open = miami.insideField(east, north);
    const onParcel = pointInRing(east, north, site.site.ring);
    const onWater = pointInRing(east, north, site.water.ring);
    if (open && !onParcel) openOutside += 1;
    if (open && onWater) openWater += 1;
    if (!open && onParcel && onWater) waterOnParcel += 1;
  }
}
assert(openOutside === 0, `${openOutside} open cells sit outside the parcel.`);
assert(openWater === 0, `${openWater} open cells sit in the water.`);
assert(waterOnParcel > 0, "The water cut through the parcel was not closed.");

function distanceToRing(x: number, z: number, ring: readonly XZ[]) {
  if (pointInRing(x, z, ring)) return 0;
  let best = Infinity;
  for (let index = 0; index < ring.length; index += 1) {
    const [ax, az] = ring[index];
    const [bx, bz] = ring[(index + 1) % ring.length];
    const dx = bx - ax;
    const dz = bz - az;
    const length = dx * dx + dz * dz;
    const t = length === 0 ? 0 : Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / length));
    best = Math.min(best, Math.hypot(x - (ax + dx * t), z - (az + dz * t)));
  }
  return best;
}

const roadsTouching = site.roads.filter((road) => road.path.some((point, index) => {
  const half = road.halfWidthFeet?.[index] ?? road.displayHalfWidthFeet;
  return distanceToRing(point[0], point[1], site.site.ring) <= half;
}));
const coastClosed = site.coastline.path.length >= 3 && site.coastline.path[0][0] === site.coastline.path.at(-1)?.[0] && site.coastline.path[0][1] === site.coastline.path.at(-1)?.[1];

console.log(JSON.stringify({
  traversable: miami.traversable,
  fieldCells: miami.inkSize * miami.inkSize,
  waterCellsOnParcel: waterOnParcel,
  obstacles: miami.domain.obstacles.length,
  roadsTouchingParcel: roadsTouching.map((road) => road.name),
  coastlineIsClosedRing: coastClosed,
  overWaterZone: miami.domain.overWater,
}, null, 2));
console.log("site network integrity checks passed");

const savedNodes: NetworkNode[] = [
  { id: "n31", kind: "attractor", x: 242.85386580789668, z: 27.96876095461367 },
  { id: "n32", kind: "attractor", x: 230.2983329190226, z: -357.2578163176486 },
  { id: "n33", kind: "attractor", x: 246.84880809072, z: -182.05106191381975 },
  { id: "n34", kind: "source", x: -72.17586849475359, z: 215.16034220691296 },
  { id: "n35", kind: "source", x: -60.88672487901309, z: -214.81188848404946 },
  { id: "n36", kind: "source", x: 96.06946645045241, z: 225.89246632376518 },
  { id: "n37", kind: "source", x: 92.69870850635843, z: -160.8291032062915 },
  { id: "n38", kind: "source", x: 148.61934710445308, z: -539.8993589356688 },
  { id: "n39", kind: "source", x: 81.12982964734204, z: -454.8484301522941 },
  { id: "n40", kind: "source", x: 84.91990202587289, z: -563.2710977774504 },
  { id: "n41", kind: "source", x: 83.08682446965467, z: -561.4380202212323 },
];
const connectionReport: unknown[] = [];
const routeBook: { seed: number; branches: number; routes: { id: string; length: number; points: { x: number; z: number }[] }[]; cloud: { x: number; z: number }[] }[] = [];
const flowIterations: NetworkIteration[] = [];
for (const connectionSeed of [20365834, 20470563, 20575292]) {
  const study = new SiteNetworkStudy(site.site.ring, site.water.ring, {
    seed: connectionSeed,
    nodes: savedNodes,
    persist: false,
    buildings: site.buildings,
  });
  study.resume();
  while (!study.settled && study.iteration < NETWORK_STEP_BUDGET) study.step(8, false);
  study.finish();
  const trails = study.snapshotTrails();
  study.finish();
  const after = study.snapshotTrails();
  assert(trails.length === after.length && trails.every((value, index) => value === after[index]), "Connection measurement changed the conductivity field.");
  const report = study.flowReport();
  assert(report.maskBreaks === 0, `${report.maskBreaks} surviving edges leave the open mask.`);
  assert(study.generator === "flow", "The live generator is not adaptive flow.");
  assert(report.branches >= 1, "The surviving network has no junction.");
  assert(report.stable, "The surviving edges were still changing at the end of the run.");
  assert(report.disconnected.length === 0, `Disconnected attractors: ${report.disconnected.join(", ") || "none"}.`);
  let covered = 0;
  let closedInk = 0;
  for (let index = 0; index < trails.length; index += 1) {
    if (trails[index] >= FLOW_SURVIVE - 1e-5) covered += 1;
    if (trails[index] > 0 && study.insideField(
      study.frame.minX + ((index % study.inkSize) + 0.5) / study.inkSize * study.frame.width,
      study.frame.minZ + (Math.floor(index / study.inkSize) + 0.5) / study.inkSize * study.frame.depth,
    ) === false) closedInk += 1;
  }
  assert(closedInk === 0, `${closedInk} conductivity samples sit outside the open parcel.`);
  const attractors = study.edit.nodes.filter((node) => node.kind === "attractor");
  for (const node of attractors) {
    const linked = report.connected.includes(node.id);
    const reported = study.status.connectedIds.includes(node.id);
    assert(linked === reported, `${node.id} conductivity link and status disagree.`);
  }
  const routes = study.flowRoutes();
  for (const route of routes) {
    assert(Number.isFinite(route.length) && route.points.length > 1, `${route.id} has no surviving route to a source.`);
  }
  routeBook.push({ seed: connectionSeed, branches: report.branches, routes, cloud: study.flowPoints() });
  const flowIteration: NetworkIteration = {
    id: `flow-${connectionSeed}`,
    index: 0,
    seed: connectionSeed,
    nodes: study.edit.nodes.map((node) => ({ ...node })),
    step: study.status.step,
    settled: study.status.settled,
    reached: study.status.reached,
    total: study.status.total,
    reachedIds: [...study.status.reachedIds],
    connectedIds: [...study.status.connectedIds],
    note: study.status.note,
    trails,
    inkSize: study.inkSize,
    traversable: study.traversable,
    cellFeet: study.cellFeet,
    generator: "flow",
  };
  flowIterations.push(flowIteration);
  const agentWords = /trail ink|raw trail|mean strength|peak strength|trail samples|reinforced cells|separate light cells|persistent/i;
  for (const mode of ["density", "connectivity", "branching", "direction"] as const) {
    const analysis = analyzeNetwork(mode, [flowIteration], study.frame);
    assert(analysis !== null, `${mode} did not read the conductivity field.`);
    const text = `${analysis.legend} ${analysis.metrics.map((item) => item.label).join(" ")}`;
    assert(!agentWords.test(text), `${mode} still describes conductivity as agent ink: ${text}`);
  }
  const tubes = analyzeNetwork("connectivity", [flowIteration], study.frame);
  const onTube = tubes?.metrics.find((item) => item.label === "Attractors on a tube")?.value;
  assert(onTube === `${report.connected.length} / ${attractors.length}`, `Attractors on a tube was ${onTube}.`);
  const bearing = analyzeNetwork("direction", [flowIteration], study.frame)?.metrics.find((item) => item.label === "Tube samples")?.value;
  assert(bearing !== "0" && bearing !== undefined, "Direction found no tube samples.");
  connectionReport.push({
    seed: connectionSeed,
    steps: study.status.step,
    settled: study.status.settled,
    coverage: Math.round((covered / study.traversable) * 1000) / 10,
    nodes: report.nodes,
    edges: report.edges,
    surviving: report.surviving,
    branches: report.branches,
    stable: report.stable,
    connected: report.connected,
    disconnected: report.disconnected,
    maskBreaks: report.maskBreaks,
    note: study.status.note,
    signature: report.signature,
  });
}
function edgeSet(signature: string) {
  return new Set(signature ? signature.split(",") : []);
}
function jaccard(left: Set<string>, right: Set<string>) {
  let shared = 0;
  for (const item of left) if (right.has(item)) shared += 1;
  const union = left.size + right.size - shared;
  return union === 0 ? 1 : shared / union;
}
const overlap = [];
for (let index = 1; index < connectionReport.length; index += 1) {
  const previous = connectionReport[index - 1] as { seed: number; signature: string };
  const current = connectionReport[index] as { seed: number; signature: string };
  const score = jaccard(edgeSet(previous.signature), edgeSet(current.signature));
  overlap.push({ seeds: [previous.seed, current.seed], jaccard: Math.round(score * 1000) / 1000, lowDiversity: score > 0.95 });
}
console.log(JSON.stringify(connectionReport.map((item) => {
  const row = item as { signature?: string };
  const { signature: _signature, ...rest } = row;
  return rest;
}), null, 2));
function routeGap(left: { x: number; z: number }[], right: { x: number; z: number }[]) {
  const directed = (from: { x: number; z: number }[], to: { x: number; z: number }[]) => {
    let worst = 0;
    for (const point of from) {
      let best = Infinity;
      for (const other of to) best = Math.min(best, Math.hypot(point.x - other.x, point.z - other.z));
      worst = Math.max(worst, best);
    }
    return worst;
  };
  if (left.length === 0 || right.length === 0) return Infinity;
  return Math.max(directed(left, right), directed(right, left));
}
function corridorShare(left: { x: number; z: number }[], right: { x: number; z: number }[], feet: number) {
  if (left.length === 0) return 0;
  let near = 0;
  for (const point of left) {
    let best = Infinity;
    for (const other of right) best = Math.min(best, Math.hypot(point.x - other.x, point.z - other.z));
    if (best <= feet) near += 1;
  }
  return near / left.length;
}
const geometry = [];
for (let index = 0; index < routeBook.length; index += 1) {
  for (let other = index + 1; other < routeBook.length; other += 1) {
    const left = routeBook[index];
    const right = routeBook[other];
    const pairs = left.routes.map((route) => {
      const match = right.routes.find((item) => item.id === route.id);
      if (!match) return null;
      const gap = routeGap(route.points, match.points);
      const share = (corridorShare(route.points, match.points, 22) + corridorShare(match.points, route.points, 22)) / 2;
      return {
        id: route.id,
        hausdorffFt: Math.round(gap),
        withinOneSample: Math.round(share * 1000) / 1000,
        lengthA: Math.round(route.length),
        lengthB: Math.round(match.length),
      };
    }).filter((item) => item !== null);
    const networkGap = routeGap(left.cloud, right.cloud);
    const networkShare = (corridorShare(left.cloud, right.cloud, 22) + corridorShare(right.cloud, left.cloud, 22)) / 2;
    geometry.push({
      seeds: [left.seed, right.seed],
      branches: [left.branches, right.branches],
      networkHausdorffFt: Math.round(networkGap),
      networkWithinOneSample: Math.round(networkShare * 1000) / 1000,
      pairs,
    });
  }
}
const separated = geometry.filter((item) => item.pairs.some((pair) => pair.hausdorffFt > 45 && pair.withinOneSample < 0.75));
assert(separated.length > 0, "Every seed pair stays within one lattice step of the same routes.");
const compared = analyzeNetwork("overlay", flowIterations, miami.frame);
assert(compared !== null && compared.legend.includes("conductivity"), "Iteration comparison does not describe conductivity.");
assert(!/raw trail|trail ink/i.test(compared.legend), "Iteration comparison still calls conductivity agent ink.");
console.log(JSON.stringify({ overlap, geometry }, null, 2));
console.log("adaptive-flow connection checks passed");
