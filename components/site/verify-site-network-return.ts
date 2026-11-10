/**
 * Compares site-local return rules on the Miami parcel.
 * The live Site Network study is not switched over to this stepper.
 */
import context from "@/data/skill5/herald-site.json";
import { FIELD_SIZE } from "@/lib/skill1/maps";
import type { BiologicalTranslation, Point, SimulationState } from "@/lib/skill1/types";
import type { SlimeControls } from "@/lib/skill1/slime-controls";
import type { SiteContext } from "@/lib/skill5/site-model";
import { NETWORK_TRAIL } from "./site-network-analysis";
import {
  SiteNetworkStudy,
  nextArrival,
  REACH_TRAIL,
  reachFeet,
  type NetworkFrame,
  type NetworkNode,
} from "./site-network";
import { stepSiteNetwork, type ShuttleTune, type SiteShuttle } from "./site-network-step";

const site = context as SiteContext;
const SEEDS = [20365834, 20470563, 20575292];
const STEPS = 1000;
const NODES: NetworkNode[] = [
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

const MODES: { name: string; tune?: ShuttleTune }[] = [
  { name: "prototype" },
  { name: "steady", tune: { quiet: true, steady: true } },
  { name: "steady-repeat", tune: { quiet: true, steady: true, repeat: true } },
  { name: "guided", tune: { quiet: true, steady: true, narrow: true, lock: 0.85, repeat: true } },
  { name: "retrace", tune: { retrace: true, repeat: true, steady: true } },
  { name: "crumbs", tune: { crumbs: true, steady: true } },
  { name: "collective", tune: { collective: true } },
  { name: "relay", tune: { relay: true } },
  { name: "relay-hold", tune: { relay: true, steady: true, preferForward: true } },
  { name: "traffic", tune: { traffic: true } },
];

type Core = {
  state: SimulationState;
  translation: BiologicalTranslation;
  rng: () => number;
  slime: SlimeControls;
  sourceFields: Point[];
  attractorFields: Point[];
  sourceCursor: number;
  attractorCursor: number;
  frame: NetworkFrame;
  open: Uint8Array;
  confine: () => void;
};

const HISTORY = 120;
const LEAVE_FIELD = 0.4;

function makeShuttle(agents: SimulationState["agents"], sources: readonly Point[], attractors: readonly Point[], reach: number, tune?: ShuttleTune): SiteShuttle {
  const homeX = new Float64Array(agents.length);
  const homeY = new Float64Array(agents.length);
  for (let index = 0; index < agents.length; index += 1) {
    let best = 0;
    let bestDistance = Infinity;
    for (let source = 0; source < sources.length; source += 1) {
      const distance = Math.hypot(agents[index].x - sources[source].x, agents[index].y - sources[source].y);
      if (distance < bestDistance) {
        best = source;
        bestDistance = distance;
      }
    }
    homeX[index] = sources[best]?.x ?? agents[index].x;
    homeY[index] = sources[best]?.y ?? agents[index].y;
  }
  return {
    returning: agents.map(() => false),
    homeX,
    homeY,
    attractors,
    reach,
    homeReach: reach,
    tune,
    outbound: tune?.repeat ? agents.map(() => false) : undefined,
    course: tune ? new Float64Array(agents.length) : undefined,
    caughtX: tune?.lock || tune?.repeat ? new Float64Array(agents.length) : undefined,
    caughtY: tune?.lock || tune?.repeat ? new Float64Array(agents.length) : undefined,
    lost: tune?.repeat || tune?.retrace ? new Uint8Array(agents.length) : undefined,
    crumbs: tune?.crumbs || tune?.collective
      ? {
          x: new Float32Array(agents.length * 96),
          y: new Float32Array(agents.length * 96),
          count: new Uint16Array(agents.length),
          cursor: new Uint16Array(agents.length),
          forward: new Uint8Array(agents.length),
          laps: new Uint8Array(agents.length),
        }
      : undefined,
    relay: tune?.relay
      ? { duty: Uint8Array.from({ length: agents.length }, (_, index) => index % Math.max(1, attractors.length)) }
      : undefined,
    traffic: tune?.traffic
      ? { duty: Uint8Array.from({ length: agents.length }, (_, index) => index % Math.max(1, attractors.length)) }
      : undefined,
    collective: tune?.collective
      ? {
          sources,
          sourceReach: 0.67,
          routes: [],
          adopted: new Int16Array(agents.length).fill(-1),
          cursor: new Uint16Array(agents.length),
          forward: new Uint8Array(agents.length),
          atHome: new Uint8Array(agents.length).fill(1),
        }
      : undefined,
  };
}

function disk(size: number, frame: NetworkFrame, points: readonly { x: number; z: number }[], open: Uint8Array, limit: number) {
  const cells: number[] = [];
  const feet = frame.width / size;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const index = y * size + x;
      if (open[index] !== 1) continue;
      const east = frame.minX + (x + 0.5) * feet;
      const north = frame.minZ + (y + 0.5) * feet;
      for (const point of points) {
        if (Math.hypot(east - point.x, north - point.z) <= limit) {
          cells.push(index);
          break;
        }
      }
    }
  }
  return cells;
}

function linkedIds(
  trails: ArrayLike<number>,
  size: number,
  open: Uint8Array,
  sources: readonly number[],
  attractors: readonly { id: string; cells: number[] }[],
  threshold: number,
) {
  const seen = new Uint8Array(trails.length);
  const stack: number[] = [];
  for (const index of sources) {
    if (trails[index] < threshold) continue;
    seen[index] = 1;
    stack.push(index);
  }
  while (stack.length > 0) {
    const current = stack.pop() as number;
    const x = current % size;
    const y = (current / size) | 0;
    const nexts = [x > 0 ? current - 1 : -1, x + 1 < size ? current + 1 : -1, y > 0 ? current - size : -1, y + 1 < size ? current + size : -1];
    for (const next of nexts) {
      if (next < 0 || seen[next] || open[next] !== 1 || trails[next] < threshold) continue;
      seen[next] = 1;
      stack.push(next);
    }
  }
  return attractors.filter((attractor) => attractor.cells.some((cell) => seen[cell] === 1)).map((attractor) => attractor.id);
}

function branchPoints(trails: ArrayLike<number>, size: number) {
  const active = (value: number) => value >= NETWORK_TRAIL - 1e-5;
  const labels = new Int32Array(trails.length);
  const sizes: number[] = [];
  const stack: number[] = [];
  for (let index = 0; index < trails.length; index += 1) {
    if (!active(trails[index]) || labels[index] !== 0) continue;
    const label = sizes.length + 1;
    let count = 0;
    labels[index] = label;
    stack.push(index);
    while (stack.length > 0) {
      const current = stack.pop() as number;
      count += 1;
      const x = current % size;
      const y = (current / size) | 0;
      const nexts = [x > 0 ? current - 1 : -1, x + 1 < size ? current + 1 : -1, y > 0 ? current - size : -1, y + 1 < size ? current + size : -1];
      for (const next of nexts) {
        if (next < 0 || labels[next] !== 0 || !active(trails[next])) continue;
        labels[next] = label;
        stack.push(next);
      }
    }
    sizes.push(count);
  }
  const large = new Set(sizes.map((count, index) => count >= 40 ? index + 1 : 0).filter((label) => label > 0));
  const points: { x: number; y: number; value: number }[] = [];
  const around = [
    [0, 1], [1, 1], [1, 0], [1, -1], [0, -1], [-1, -1], [-1, 0], [-1, 1],
  ];
  for (let index = 0; index < trails.length; index += 1) {
    if (!large.has(labels[index]) || !active(trails[index])) continue;
    const x = index % size;
    const y = (index / size) | 0;
    let ridge = true;
    const flags: boolean[] = [];
    for (const [ox, oy] of around) {
      const nx = x + ox;
      const ny = y + oy;
      const inside = nx >= 0 && ny >= 0 && nx < size && ny < size;
      const cell = inside ? ny * size + nx : -1;
      if (cell >= 0 && trails[cell] > trails[index]) ridge = false;
      flags.push(cell >= 0 && active(trails[cell]));
    }
    if (!ridge) continue;
    let changes = 0;
    for (let step = 0; step < 8; step += 1) if (flags[step] !== flags[(step + 1) % 8]) changes += 1;
    if (changes / 2 < 3) continue;
    points.push({ x, y, value: trails[index] });
  }
  const kept: { x: number; y: number }[] = [];
  points.sort((a, b) => b.value - a.value);
  for (const point of points) {
    if (kept.some((other) => Math.hypot(other.x - point.x, other.y - point.y) < 18)) continue;
    kept.push(point);
  }
  return kept.length;
}

function jaccard(left: ArrayLike<number>, right: ArrayLike<number>, threshold: number) {
  let shared = 0;
  let either = 0;
  for (let index = 0; index < left.length; index += 1) {
    const a = left[index] >= threshold;
    const b = right[index] >= threshold;
    if (!a && !b) continue;
    either += 1;
    if (a && b) shared += 1;
  }
  return either === 0 ? 1 : shared / either;
}

function run(seed: number, tune: ShuttleTune | undefined) {
  const study = new SiteNetworkStudy(site.site.ring, site.water.ring, {
    seed,
    nodes: NODES,
    persist: false,
    buildings: site.buildings,
  });
  const core = study as unknown as Core;
  study.resume();
  const feetPerField = study.cellFeet * (study.inkSize / FIELD_SIZE);
  const reach = reachFeet(study.cellFeet) / feetPerField;
  const shuttle = makeShuttle(core.state.agents, core.sourceFields, core.attractorFields, reach, tune);
  shuttle.homeReach = 40 / feetPerField;
  if (shuttle.collective) shuttle.collective.sourceReach = 40 / feetPerField;
  const attractorNodes = study.edit.nodes.filter((node) => node.kind === "attractor");
  const sourceNodes = study.edit.nodes.filter((node) => node.kind === "source");
  const limit = reachFeet(study.cellFeet);
  const sourceCells = disk(study.inkSize, core.frame, sourceNodes, core.open, limit);
  const attractorCells = attractorNodes.map((node) => ({
    id: node.id,
    cells: disk(study.inkSize, core.frame, [node], core.open, limit),
  }));
  const watches = new Map<string, { holds: number; connected: boolean }>();
  const historyX = core.state.agents.map(() => new Float64Array(HISTORY));
  const historyY = core.state.agents.map(() => new Float64Array(HISTORY));
  const historyCount = new Uint16Array(core.state.agents.length);
  const historyWrite = new Uint16Array(core.state.agents.length);
  const frozen: ({ x: Float64Array; y: Float64Array; count: number } | null)[] = core.state.agents.map(() => null);
  const leftAt = new Int16Array(core.state.agents.length).fill(-1);
  const episodeStep = new Int16Array(core.state.agents.length);
  let returnSteps = 0;
  let completed = 0;
  let jumps = 0;
  let episodes = 0;
  let stayed = 0;
  let left = 0;
  const leaveSteps: number[] = [];
  const leaveFeet: number[] = [];
  let onRoute = 0;
  for (let step = 0; step < STEPS; step += 1) {
    const before = study.iteration;
    core.sourceCursor = (core.sourceCursor + 1) % core.sourceFields.length;
    core.state.source = { ...core.sourceFields[core.sourceCursor] };
    const attractorIndex = core.attractorCursor % core.attractorFields.length;
    core.state.attractor = { ...core.attractorFields[attractorIndex] };
    core.attractorCursor = (core.attractorCursor + 1) % core.attractorFields.length;
    const agents = core.state.agents;
    for (let index = 0; index < agents.length; index += 1) {
      const slot = historyWrite[index] % HISTORY;
      historyX[index][slot] = agents[index].x;
      historyY[index][slot] = agents[index].y;
      historyWrite[index] += 1;
      historyCount[index] = Math.min(HISTORY, historyCount[index] + 1);
    }
    const wasReturning = shuttle.returning.slice();
    const wasOutbound = shuttle.outbound ? shuttle.outbound.slice() : null;
    const fromX = Float64Array.from(agents, (agent) => agent.x);
    const fromY = Float64Array.from(agents, (agent) => agent.y);
    stepSiteNetwork(core.state, core.translation, core.rng, core.slime, shuttle);
    core.confine();
    for (let index = 0; index < agents.length; index += 1) {
      const jumped = Math.hypot(agents[index].x - fromX[index], agents[index].y - fromY[index]) > 40 / feetPerField;
      if (jumped) jumps += 1;
      if (!wasReturning[index]) continue;
      returnSteps += 1;
      const path = frozen[index];
      if (path) {
        let nearest = Infinity;
        for (let sample = 0; sample < path.count; sample += 1) {
          nearest = Math.min(nearest, Math.hypot(agents[index].x - path.x[sample], agents[index].y - path.y[sample]));
        }
        if (nearest <= LEAVE_FIELD) onRoute += 1;
        else if (leftAt[index] < 0) {
          leftAt[index] = episodeStep[index];
          leaveSteps.push(episodeStep[index]);
          let attractorFeet = Infinity;
          for (const attractor of core.attractorFields) {
            attractorFeet = Math.min(attractorFeet, Math.hypot(agents[index].x - attractor.x, agents[index].y - attractor.y) * feetPerField);
          }
          leaveFeet.push(attractorFeet);
        }
      }
      episodeStep[index] += 1;
      const home = Math.hypot(agents[index].x - shuttle.homeX[index], agents[index].y - shuttle.homeY[index]);
      const finished = !shuttle.returning[index] || (wasOutbound !== null && !wasOutbound[index] && shuttle.outbound?.[index] === true);
      if (finished && !jumped && home <= shuttle.homeReach) {
        completed += 1;
        if (leftAt[index] < 0) stayed += 1;
        else left += 1;
      } else if (!shuttle.returning[index]) {
        if (leftAt[index] < 0) stayed += 1;
        else left += 1;
      }
      if (!shuttle.returning[index]) {
        frozen[index] = null;
        leftAt[index] = -1;
        episodeStep[index] = 0;
      }
    }
    for (let index = 0; index < agents.length; index += 1) {
      if (wasReturning[index] || !shuttle.returning[index]) continue;
      episodes += 1;
      const count = historyCount[index];
      const pathX = new Float64Array(count);
      const pathY = new Float64Array(count);
      const start = historyWrite[index] - count;
      for (let sample = 0; sample < count; sample += 1) {
        const slot = (start + sample) % HISTORY;
        pathX[sample] = historyX[index][slot];
        pathY[sample] = historyY[index][slot];
      }
      frozen[index] = { x: pathX, y: pathY, count };
      leftAt[index] = -1;
      episodeStep[index] = 0;
    }
    const scan = Math.floor(study.iteration / 12) > Math.floor(before / 12);
    if (!scan) continue;
    for (const row of study.approach()) {
      const watch = watches.get(row.id) ?? { holds: 0, connected: false };
      const arrival = nextArrival(watch.holds, row.trailFeet, row.agentFeet, true, limit, watch.connected);
      watches.set(row.id, { holds: arrival.holds, connected: arrival.connected });
    }
  }
  for (const row of study.approach()) {
    const watch = watches.get(row.id) ?? { holds: 0, connected: false };
    const arrival = nextArrival(watch.holds, row.trailFeet, row.agentFeet, true, limit, watch.connected);
    watches.set(row.id, { holds: arrival.holds, connected: arrival.connected });
  }
  const trails = study.snapshotTrails();
  let covered = 0;
  let strong = 0;
  let peak = 0;
  for (let index = 0; index < trails.length; index += 1) {
    if (core.open[index] !== 1) continue;
    if (trails[index] > peak) peak = trails[index];
    if (trails[index] >= NETWORK_TRAIL - 1e-5) covered += 1;
    if (trails[index] >= REACH_TRAIL - 1e-5) strong += 1;
  }
  const lightIds = linkedIds(trails, study.inkSize, core.open, sourceCells, attractorCells, NETWORK_TRAIL - 1e-5);
  const strongIds = linkedIds(trails, study.inkSize, core.open, sourceCells, attractorCells, REACH_TRAIL - 1e-5);
  const persistent = attractorNodes.filter((node) => (watches.get(node.id)?.holds ?? 0) >= 3 && watches.get(node.id)?.connected).map((node) => node.id);
  const gaps = attractorNodes.map((node) => {
    const row = study.approach().find((item) => item.id === node.id);
    return { id: node.id, feet: Math.round((row?.trailFeet ?? Infinity) * 10) / 10, peak: Math.round((row?.peak ?? 0) * 100) / 100 };
  });
  leaveSteps.sort((a, b) => a - b);
  leaveFeet.sort((a, b) => a - b);
  const mid = (values: number[]) => values.length === 0 ? null : values[Math.floor(values.length / 2)];
  const within = (values: number[], limitFeet: number) => values.filter((value) => value <= limitFeet).length;
  return {
    seed,
    gaps,
    lightIds,
    strongIds,
    persistent,
    coverage: covered / study.traversable,
    strongCoverage: strong / study.traversable,
    peak: Math.round(peak * 100) / 100,
    branches: branchPoints(trails, study.inkSize),
    completed,
    returnSteps,
    stillReturning: shuttle.returning.filter(Boolean).length,
    jumps,
    episodes,
    stayed,
    left,
    onRoute: returnSteps === 0 ? 0 : onRoute / returnSteps,
    leaveStepMedian: mid(leaveSteps),
    leaveFeetMedian: mid(leaveFeet) === null ? null : Math.round((mid(leaveFeet) as number) * 10) / 10,
    leftWithin60Ft: within(leaveFeet, 60),
    leftWithin150Ft: within(leaveFeet, 150),
    sharedRoutes: shuttle.collective?.routes.length ?? 0,
    sharedPairs: shuttle.collective
      ? new Set(shuttle.collective.routes.map((route) => `${route.source}:${route.attractor}`)).size
      : 0,
    trails,
  };
}

const selected = process.argv.slice(2);
const modes = selected.length ? MODES.filter((mode) => selected.includes(mode.name)) : MODES;
const reports: { name: string; runs: ReturnType<typeof run>[] }[] = [];
for (const mode of modes) {
  const runs = [];
  for (const seed of SEEDS) {
    const started = Date.now();
    const result = run(seed, mode.tune);
    const { trails, ...printed } = result;
    console.log(JSON.stringify({ mode: mode.name, seconds: Math.round((Date.now() - started) / 100) / 10, ...printed }));
    runs.push(result);
  }
  const overlap = [
    jaccard(runs[0].trails, runs[1].trails, REACH_TRAIL - 1e-5),
    jaccard(runs[0].trails, runs[2].trails, REACH_TRAIL - 1e-5),
    jaccard(runs[1].trails, runs[2].trails, REACH_TRAIL - 1e-5),
  ];
  console.log(JSON.stringify({
    mode: mode.name,
    strongJaccard: overlap.map((value) => Math.round(value * 1000) / 1000),
    persistent: runs.map((item) => item.persistent),
    strongLinks: runs.map((item) => item.strongIds),
    lightLinks: runs.map((item) => item.lightIds),
  }));
  reports.push({ name: mode.name, runs });
}
if (reports.length > 1) {
  const baseline = reports[0];
  for (const mode of reports.slice(1)) {
    const against = mode.runs.map((run, index) => Math.round(jaccard(baseline.runs[index].trails, run.trails, REACH_TRAIL - 1e-5) * 1000) / 1000);
    console.log(JSON.stringify({ mode: mode.name, strongJaccardVersusPrototype: against }));
  }
}
