import { mulberry32 } from "@/lib/physarum";
import { createSimulation, stepSimulation } from "@/lib/skill1/engine";
import { FIELD_SIZE } from "@/lib/skill1/maps";
import type { SlimeControls } from "@/lib/skill1/slime-controls";
import type { BiologicalTranslation, Point, SimulationState } from "@/lib/skill1/types";
import type { XZ } from "@/lib/skill5/site-model";
import { assessNetworkDomain, rasterNetworkMask, type NetworkDomain, type NetworkFootprint } from "./site-network-domain";
import { trailDisplayAlpha } from "./site-network-display";

const AGENT_COUNT = 720;
const SITE_TRAIL_SCALE = 32;
const SEED = 20261105;
/**
 * Connection radius in trail cells. A cell is 1.867 ft on the Miami field, so four cells is 7.5 ft.
 * That covers the cell under the attractor, the one-cell deposit around it, and the 1–7 ft approach of the narrow brush.
 */
export const REACH_CELLS = 4;
/**
 * Raw trail value that counts as a strong trail at an attractor.
 * A site deposit is 0.06, so 0.2 is repeated deposit, not one passing agent.
 */
export const REACH_TRAIL = 0.2;
/** Consecutive scans with a current connection before it counts as persistent. */
export const REACH_HOLDS = 3;

/** Site feet for a strong-trail connection on a grid whose cells are `cellFeet` on each side. */
export function reachFeet(cellFeet: number) {
  return REACH_CELLS * cellFeet;
}
const FIELD_PAD = 0.22;
const STORAGE_KEY = "living-morphologies.site-network-nodes";

/**
 * Site study controls passed into stepSimulation. The Physarum engine file is unchanged.
 * For this study's translation, stepSimulation without a slime record would use:
 * agents 1000; deposit (0.05 + flowCoupling * 0.1) * trailStrength, about 0.112 times that agent's strength;
 * depositWidth 1 (a one-pixel hair at this trail scale); diffusion off, because networkDensity is 0.22;
 * decay 0.986; trailInfluence 1; trailCap 1.8;
 * sensorAngle 0.509, sensorDistance 0.73, turnAngle 0.451, stepSize 0.268;
 * resistance, randomness, and persistence 0.
 * The record below keeps those sensor values and sets the site deposit, width, diffusion, decay, influence, cap, and agent count.
 * Width 1, diffusion 0.02, and randomness 0.08 are the site baseline from the equal-scale parameter study.
 * Width 1 and width 2 paint the same bilinear cell, because the engine scales width by 32/64 and treats 1.05 pixels or less as one cell.
 */
const SITE_SLIME: SlimeControls = {
  sensorAngle: 0.51,
  sensorDistance: 0.73,
  turnAngle: 0.45,
  stepSize: 0.27,
  deposit: 0.06,
  depositWidth: 1,
  diffusion: 0.02,
  decay: 0.99,
  trailInfluence: 1.15,
  resistance: 0,
  randomness: 0.08,
  persistence: 0,
  trailCap: 1.4,
  foodPoints: [],
  crowdingLimit: 24,
  voidElongation: 1,
  voidRotation: 0,
  voidLobes: 0,
  voidNotch: 0,
};

export type NetworkNodeKind = "source" | "attractor";

export type NetworkNode = {
  id: string;
  kind: NetworkNodeKind;
  x: number;
  z: number;
};

export type NetworkEdit = {
  nodes: readonly NetworkNode[];
  selectedId: string | null;
};

const EMPTY_EDIT: NetworkEdit = { nodes: [], selectedId: null };

export type NetworkStatus = {
  step: number;
  settled: boolean;
  reached: number;
  total: number;
  reachedIds: readonly string[];
  /** Attractors whose strong trail is inside the cell tolerance on the latest scan. */
  connected: number;
  connectedIds: readonly string[];
  /** Attractors with an agent inside the tolerance and no current strong trail. */
  visitIds: readonly string[];
  note: string | null;
};

const EMPTY_STATUS: NetworkStatus = {
  step: 0,
  settled: false,
  reached: 0,
  total: 0,
  reachedIds: [],
  connected: 0,
  connectedIds: [],
  visitIds: [],
  note: null,
};

type AttractorWatch = {
  best: number;
  still: number;
  holds: number;
  current: number;
  connected: boolean;
  reached: boolean;
  visiting: boolean;
};

type Frame = {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  width: number;
  depth: number;
};

export type NetworkFrame = Frame;

export const NETWORK_STEP_BUDGET = 1000;

export type NetworkIteration = {
  id: string;
  index: number;
  seed: number;
  nodes: NetworkNode[];
  step: number;
  settled: boolean;
  reached: number;
  total: number;
  reachedIds: string[];
  /** Attractors with a strong trail inside the tolerance at the end of the run. */
  connectedIds: string[];
  note: string | null;
  /** Raw engine trail values, one per trail cell, copied before any graphic mapping. */
  trails: Float32Array;
  inkSize: number;
  /** Open trail cells. Coverage uses this count, not the rectangular field. */
  traversable?: number;
  /** Site feet on each side of a trail cell. Both axes use this length. */
  cellFeet: number;
};

type StudyInit = {
  seed?: number;
  nodes?: readonly NetworkNode[];
  persist?: boolean;
  /** Verified existing footprints. Assemblies are not obstacles. */
  buildings?: readonly NetworkFootprint[];
  /** Opens water only when this ring is a valid polygon. Method 01 leaves it unset. */
  overWater?: readonly XZ[] | null;
  /** Replaces deposit, diffusion, or randomness for a controlled run. The live study leaves this unset. */
  slime?: Partial<SlimeControls>;
  /** Field-unit spread of every attractor. The live study uses the distance rule instead. */
  attractorSpread?: number;
};

/**
 * Site network study. Node positions are site feet, east and north.
 * The engine steps with SITE_SLIME. This wrapper places sources and attractors,
 * keeps growth on the parcel mask, and copies the raw trail field out.
 */
function attractorReach(point: Point, sources: readonly Point[]) {
  let nearest = FIELD_SIZE;
  for (const source of sources) nearest = Math.min(nearest, Math.hypot(point.x - source.x, point.y - source.y));
  if (!sources.length || nearest === FIELD_SIZE) return 2.6;
  return Math.min(7.5, Math.max(2.6, nearest * 0.62));
}

function studyTranslation(sources: readonly Point[], attractors: readonly Point[], spread?: number): BiologicalTranslation {
  const source = sources[0] ?? { x: FIELD_SIZE / 2, y: FIELD_SIZE / 2 };
  const primary = attractors[0] ?? source;
  return {
    archetypeId: "open-hall",
    archetypeName: "Site network study",
    typologyId: "workspace",
    topology: "open-network",
    descriptors: { formal: "", spatial: "", atmospheric: "" },
    ratings: { receptivity: 1, centrality: 1 },
    params: {
      geometryVariation: 0.42,
      scaleVariation: 0.35,
      flowCoupling: 0.62,
      permeability: 0.9,
      networkDensity: 0.22,
      directionalBias: 0.64,
      attractionStrength: 0.82,
      influenceRadius: 5.5,
      nodeSpacing: 0.48,
      persistence: 0.35,
      sourcePermeability: 0.55,
      nodeInteraction: 0.34,
      geometricDisplacement: 0.28,
      nodeRepetition: 0.18,
      gamma: 1,
      decay: 0.992,
      decayMode: "controlled",
      randomness: 0.32,
      randomnessMode: "medium",
    },
    recipe: {
      sourceCorner: "bottom-left",
      attractor: primary,
      attractorFixed: true,
      /** Every placed attractor, with the same strength. The radius rule is the distance to the nearest source. */
      attractors: (attractors.length ? attractors : [primary]).map((point) => ({
        kind: "point" as const,
        x: point.x,
        y: point.y,
        radius: spread ?? attractorReach(point, sources),
        strength: attractors.length ? 1 : 0,
      })),
      coreExposure: 0.5,
      enclosureCollar: 0,
      isolationRadius: 1.1,
      clustering: 0.15,
      approachWidth: 3,
    },
    traces: [],
    rankings: [],
    behavior: {
      exploration: "Medium",
      attraction: "High",
      trailFollowing: "High",
      reinforcement: "Medium",
      decay: "controlled",
      randomness: "medium",
    },
  };
}

function frameAround(ring: readonly XZ[]): Frame {
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const [x, z] of ring) {
    if (!Number.isFinite(x) || !Number.isFinite(z)) continue;
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minZ = Math.min(minZ, z);
    maxZ = Math.max(maxZ, z);
  }
  if (!Number.isFinite(minX)) return { minX: 0, maxX: 1, minZ: 0, maxZ: 1, width: 1, depth: 1 };
  const width = Math.max(1, maxX - minX);
  const depth = Math.max(1, maxZ - minZ);
  const padX = width * FIELD_PAD;
  const padZ = depth * FIELD_PAD;
  const paddedWidth = width + padX * 2;
  const paddedDepth = depth + padZ * 2;
  // The engine field is square. The longer site axis fills it, and the shorter axis is centered,
  // so one field step is the same number of site feet east and north. The parcel ring still chooses the open cells.
  const span = Math.max(paddedWidth, paddedDepth);
  const centerX = (minX + maxX) / 2;
  const centerZ = (minZ + maxZ) / 2;
  return {
    minX: centerX - span / 2,
    maxX: centerX + span / 2,
    minZ: centerZ - span / 2,
    maxZ: centerZ + span / 2,
    width: span,
    depth: span,
  };
}

/** Site feet to the square engine field. East and north use the same scale. */
export function siteToField(x: number, z: number, frame: Frame): Point {
  return {
    x: ((x - frame.minX) / frame.width) * FIELD_SIZE,
    y: ((z - frame.minZ) / frame.depth) * FIELD_SIZE,
  };
}

function fieldToSite(point: Point, frame: Frame) {
  return {
    x: frame.minX + (point.x / FIELD_SIZE) * frame.width,
    z: frame.minZ + (point.y / FIELD_SIZE) * frame.depth,
  };
}

/**
 * Attractor contours match the engine attraction field: gain 0.82, spread max(0.75, reach).
 * Source contours are conceptual. The engine does not deposit from a source field.
 */
export function influenceAt(frame: NetworkFrame, nodes: readonly NetworkNode[], east: number, north: number) {
  const point = siteToField(east, north, frame);
  const sources = nodes.filter((node) => node.kind === "source").map((node) => siteToField(node.x, node.z, frame));
  const attractors = nodes.filter((node) => node.kind === "attractor").map((node) => siteToField(node.x, node.z, frame));
  const pull = (origins: readonly Point[], others: readonly Point[]) => {
    let sum = 0;
    for (const origin of origins) {
      const spread = Math.max(0.75, attractorReach(origin, others.length ? others : origins));
      const distance = Math.hypot(point.x - origin.x, point.y - origin.y);
      sum += 0.82 * Math.exp(-(distance * distance) / (2 * spread * spread));
    }
    return sum;
  };
  return { source: pull(sources, attractors), attractor: pull(attractors, sources) };
}

function wrapAngle(angle: number) {
  const turn = Math.PI * 2;
  let next = angle % turn;
  if (next < 0) next += turn;
  return next;
}

/**
 * A visit is an agent inside the tolerance without a strong trail.
 * A connection is a strong trail inside the tolerance on this scan.
 * A persistent connection is that trail holding for REACH_HOLDS scans.
 * Between scans the last connection stands. This does not change the trail field.
 */
export function nextArrival(
  holds: number,
  trailFeet: number,
  agentFeet: number,
  scan: boolean,
  tolerance: number,
  wasConnected: boolean,
) {
  const agentHere = Number.isFinite(agentFeet) && agentFeet <= tolerance;
  if (!scan) {
    return {
      holds,
      connected: wasConnected,
      visiting: agentHere && !wasConnected,
      reached: wasConnected && holds >= REACH_HOLDS,
    };
  }
  const connected = Number.isFinite(trailFeet) && trailFeet <= tolerance;
  const nextHolds = connected ? holds + 1 : 0;
  return {
    holds: nextHolds,
    connected,
    visiting: agentHere && !connected,
    reached: connected && nextHolds >= REACH_HOLDS,
  };
}

/** Distance in site feet from a point to the nearest strong trail cell. Closed cells are ignored when a mask is passed. */
export function strongTrailFeet(
  trails: ArrayLike<number>,
  size: number,
  frame: NetworkFrame,
  east: number,
  north: number,
  open?: Uint8Array,
) {
  if (size < 1 || trails.length !== size * size) return Infinity;
  const feet = frame.width / size;
  let best = Infinity;
  for (let index = 0; index < trails.length; index += 1) {
    if (open && open[index] !== 1) continue;
    if (trails[index] < REACH_TRAIL - 1e-5) continue;
    const x = index % size;
    const y = (index / size) | 0;
    const siteEast = frame.minX + (x + 0.5) * feet;
    const siteNorth = frame.minZ + ((y + 0.5) / size) * frame.depth;
    const gap = Math.hypot(siteEast - east, siteNorth - north);
    if (gap < best) best = gap;
  }
  return best;
}

function readStored(inside: (x: number, z: number) => boolean): NetworkNode[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]") as unknown;
    if (!Array.isArray(parsed)) return [];
    const nodes: NetworkNode[] = [];
    for (const item of parsed) {
      if (!item || typeof item !== "object") continue;
      const record = item as Partial<NetworkNode>;
      if (record.kind !== "source" && record.kind !== "attractor") continue;
      if (typeof record.id !== "string" || typeof record.x !== "number" || typeof record.z !== "number") continue;
      if (!inside(record.x, record.z)) continue;
      nodes.push({ id: record.id, kind: record.kind, x: record.x, z: record.z });
    }
    return nodes;
  } catch {
    return [];
  }
}

export class SiteNetworkStudy {
  readonly frame: Frame;
  readonly domain: NetworkDomain;
  readonly land: XZ[];
  readonly pixels: Uint8Array;
  readonly inkSize: number;
  readonly traversable: number;
  revision = 0;
  settled = false;
  private statusState: NetworkStatus = EMPTY_STATUS;
  private editState: NetworkEdit = EMPTY_EDIT;
  private readonly listeners = new Set<() => void>();
  private readonly open: Uint8Array;
  private readonly closed: Uint32Array;
  private rng: () => number;
  private translation: BiologicalTranslation;
  private state!: SimulationState;
  private scannedAt = -1;
  private sourceFields: Point[] = [];
  private attractorFields: Point[] = [];
  private sourceCursor = 0;
  private attractorCursor = 0;
  private serial = 1;
  private hold = false;
  private readonly seed: number;
  private readonly persistEnabled: boolean;
  private mappingNote: string | null = null;
  private readonly domainNote: string | null;
  private readonly slime: SlimeControls;
  private readonly attractorSpread: number | undefined;
  private readonly watches = new Map<string, AttractorWatch>();
  private turnedAtBoundary = 0;
  private anchorX = new Float32Array(0);
  private anchorY = new Float32Array(0);

  constructor(parcel: readonly XZ[], water: readonly XZ[], init?: StudyInit) {
    this.persistEnabled = init?.persist !== false;
    this.seed = init?.seed ?? SEED;
    this.domain = assessNetworkDomain({
      parcel,
      water,
      buildings: init?.buildings,
      overWater: init?.overWater,
    });
    this.land = this.domain.boundary;
    this.frame = frameAround(parcel);
    this.rng = mulberry32(this.seed ^ 0x51e7);
    this.inkSize = FIELD_SIZE * SITE_TRAIL_SCALE;
    this.pixels = new Uint8Array(this.inkSize * this.inkSize * 4);
    const mask = rasterNetworkMask(this.frame, this.domain, this.inkSize);
    this.open = mask.open;
    this.closed = mask.closed;
    this.traversable = mask.traversable;
    this.domainNote = this.domain.valid ? null : this.domain.gaps.join(" ");
    this.slime = { ...SITE_SLIME, ...init?.slime };
    this.attractorSpread = init?.attractorSpread;
    const stored = init?.nodes
      ? init.nodes.filter((node) => this.insideField(node.x, node.z)).map((node) => ({ ...node }))
      : this.persistEnabled
        ? readStored((x, z) => this.insideField(x, z))
        : [];
    let serial = 1;
    for (const node of stored) {
      const match = /^n(\d+)$/.exec(node.id);
      if (match) serial = Math.max(serial, Number(match[1]) + 1);
    }
    this.serial = serial;
    this.editState = { nodes: stored, selectedId: null };
    this.translation = studyTranslation([], []);
    this.restart(false);
  }

  /** Rebuilds the seeded generator and the trail field. Reset and a new study share this sequence. */
  private restart(hold: boolean) {
    this.hold = hold;
    this.rng = mulberry32(this.seed ^ 0x51e7);
    this.watches.clear();
    this.settled = false;
    this.pixels.fill(0);
    this.sourceFields = [];
    this.attractorFields = [];
    this.sourceCursor = 0;
    this.attractorCursor = 0;
    this.scannedAt = -1;
    this.translation = studyTranslation([], []);
    this.state = this.boot();
    if (this.editState.nodes.length) this.applyTargets(false);
    else {
      this.publishStatus();
      this.revision += 1;
    }
  }

  get iteration() {
    return this.state.iteration;
  }

  /** Agents sent back from a closed cell since the study started. */
  get boundaryTurns() {
    return this.turnedAtBoundary;
  }

  /** Site feet represented by one trail cell, on both axes. */
  get cellFeet() {
    return this.frame.width / this.inkSize;
  }

  get edit() {
    return this.editState;
  }

  get canRun() {
    return this.sourceFields.length > 0 && this.attractorFields.length > 0;
  }

  get status() {
    return this.statusState;
  }

  subscribe(listener: () => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** Same cell the trail mask uses, so a placed node and the simulation agree. */
  insideField(x: number, z: number) {
    const size = this.inkSize;
    const px = Math.floor(((x - this.frame.minX) / this.frame.width) * size);
    const py = Math.floor(((z - this.frame.minZ) / this.frame.depth) * size);
    return px >= 0 && py >= 0 && px < size && py < size && this.open[py * size + px] === 1;
  }

  place(kind: NetworkNodeKind, x: number, z: number) {
    if (!this.insideField(x, z)) return false;
    const node: NetworkNode = { id: `n${this.serial}`, kind, x, z };
    this.serial += 1;
    this.replace([...this.editState.nodes, node], node.id);
    this.persist();
    this.applyTargets(this.iteration > 0);
    return true;
  }

  move(id: string, x: number, z: number) {
    if (!this.insideField(x, z)) return false;
    const nodes = this.editState.nodes.map((node) => node.id === id ? { ...node, x, z } : node);
    this.replace(nodes, id);
    return true;
  }

  commit() {
    this.persist();
    this.applyTargets(this.iteration > 0);
  }

  select(id: string | null) {
    if (id === this.editState.selectedId) return;
    if (id && !this.editState.nodes.some((node) => node.id === id)) return;
    this.replace(this.editState.nodes, id);
  }

  remove(id: string) {
    const nodes = this.editState.nodes.filter((node) => node.id !== id);
    if (nodes.length === this.editState.nodes.length) return;
    this.replace(nodes, this.editState.selectedId === id ? null : this.editState.selectedId);
    this.persist();
    this.applyTargets(this.iteration > 0);
  }

  clearNodes() {
    if (this.editState.nodes.length === 0) return;
    this.replace([], null);
    this.persist();
    this.applyTargets(this.iteration > 0);
  }

  step(times: number, paint = true) {
    if (this.hold || this.settled || this.sourceFields.length === 0 || this.attractorFields.length === 0) return;
    const before = this.state.iteration;
    for (let n = 0; n < times; n += 1) {
      if (this.state.converged) break;
      this.sourceCursor = (this.sourceCursor + 1) % this.sourceFields.length;
      this.state.source = { ...this.sourceFields[this.sourceCursor] };
      const attractorIndex = this.attractorCursor % this.attractorFields.length;
      this.state.attractor = { ...this.attractorFields[attractorIndex] };
      this.attractorCursor = (this.attractorCursor + 1) % this.attractorFields.length;
      stepSimulation(this.state, this.translation, this.rng, this.slime.decay, this.slime, true, false);
      this.confine();
    }
    this.settled = this.state.converged;
    const scan = Math.floor(this.state.iteration / 12) > Math.floor(before / 12);
    this.measureAttractors(scan);
    if (!paint) return;
    this.writeInk();
    this.publishStatus();
    this.revision += 1;
  }

  finish() {
    this.measureAttractors(true);
    this.writeInk();
    this.publishStatus();
    this.revision += 1;
  }

  resume() {
    this.hold = false;
    this.settled = false;
    this.state.converged = false;
    this.state.streak = 0;
    this.state.maxIterations = this.state.iteration + 1000;
  }

  reset() {
    this.restart(true);
  }

  private replace(nodes: readonly NetworkNode[], selectedId: string | null) {
    this.editState = { nodes, selectedId };
    for (const listener of this.listeners) listener();
  }

  private persist() {
    if (!this.persistEnabled || typeof localStorage === "undefined") return;
    const stored = this.editState.nodes.map((node) => ({ id: node.id, kind: node.kind, x: node.x, z: node.z }));
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
  }

  private applyTargets(keepTrails: boolean) {
    const sources: Point[] = [];
    const attractors: Point[] = [];
    for (const node of this.editState.nodes) {
      const field = siteToField(node.x, node.z, this.frame);
      if (node.kind === "source") sources.push(field);
      else attractors.push(field);
    }
    this.sourceFields = sources;
    this.attractorFields = attractors;
    this.translation = studyTranslation(sources, attractors, this.attractorSpread);
    this.watches.clear();
    this.checkMapping();
    const previous = this.state;
    const next = this.boot();
    if (keepTrails && previous.trailSize === next.trailSize) {
      next.trails = previous.trails;
      next.displayTrails = previous.displayTrails;
      next.iteration = previous.iteration;
      next.maxIterations = Math.max(previous.maxIterations, previous.iteration + 1000);
      next.agents = previous.agents;
      next.converged = false;
      next.streak = previous.streak;
    }
    this.state = next;
    this.rememberAnchors();
    this.settled = false;
    if (!keepTrails) this.pixels.fill(0);
    this.publishStatus();
    this.revision += 1;
  }

  private boot() {
    const primary = this.sourceFields[0] ?? { x: FIELD_SIZE / 2, y: FIELD_SIZE / 2 };
    const state = createSimulation(this.translation, this.seed, AGENT_COUNT, SITE_TRAIL_SCALE);
    state.source = { ...primary };
    state.attractor = { ...(this.attractorFields[0] ?? primary) };
    const sources = this.sourceFields;
    for (let index = 0; index < state.agents.length; index += 1) {
      const source = sources.length ? sources[index % sources.length] : primary;
      const attractor = this.nearestAttractor(source);
      const heading = Math.atan2(attractor.y - source.y, attractor.x - source.x);
      const angle = heading + (this.rng() - 0.5) * 1.1;
      const radius = sources.length ? this.rng() * 0.28 : 0;
      const agent = state.agents[index];
      agent.x = source.x + Math.cos(angle) * radius;
      agent.y = source.y + Math.sin(angle) * radius;
      agent.heading = heading + (this.rng() - 0.5) * 0.7;
      agent.pathX = [agent.x];
      agent.pathY = [agent.y];
    }
    this.state = state;
    this.rememberAnchors();
    return state;
  }

  /** The engine primary for this step. It rotates through every attractor. */
  primaryAttractor() {
    return { x: this.state.attractor.x, y: this.state.attractor.y };
  }

  /** Placed attractors as the engine receives them. */
  attractorMarks() {
    return (this.translation.recipe.attractors ?? []).map((item) => ({
      x: item.x,
      y: item.y,
      strength: item.strength ?? 1,
      radius: item.radius ?? 0,
    }));
  }

  /**
   * Current approach to each attractor. Distances are site feet.
   * `peak` is the strongest raw trail inside the connection tolerance.
   */
  approach() {
    const tolerance = reachFeet(this.cellFeet);
    const size = this.inkSize;
    const feet = this.cellFeet;
    const trails = this.state.trails;
    const open = this.open;
    return this.editState.nodes.filter((node) => node.kind === "attractor").map((node) => {
      let agentFeet = Infinity;
      for (const agent of this.state.agents) {
        const site = fieldToSite(agent, this.frame);
        agentFeet = Math.min(agentFeet, Math.hypot(site.x - node.x, site.z - node.z));
      }
      let peak = 0;
      let atCell = 0;
      const cx = Math.floor(((node.x - this.frame.minX) / this.frame.width) * size);
      const cy = Math.floor(((node.z - this.frame.minZ) / this.frame.depth) * size);
      const here = cy * size + cx;
      if (here >= 0 && here < trails.length && open[here] === 1) atCell = trails[here];
      const radius = Math.ceil(tolerance / feet);
      for (let y = Math.max(0, cy - radius); y <= Math.min(size - 1, cy + radius); y += 1) {
        for (let x = Math.max(0, cx - radius); x <= Math.min(size - 1, cx + radius); x += 1) {
          const index = y * size + x;
          if (open[index] !== 1) continue;
          const east = this.frame.minX + (x + 0.5) * feet;
          const north = this.frame.minZ + (y + 0.5) * feet;
          if (Math.hypot(east - node.x, north - node.z) > tolerance) continue;
          if (trails[index] > peak) peak = trails[index];
        }
      }
      return {
        id: node.id,
        agentFeet,
        trailFeet: this.trailGap(node.x, node.z),
        peak,
        atCell,
      };
    });
  }

  private nearestAttractor(from: Point) {
    if (this.attractorFields.length === 0) return from;
    let best = this.attractorFields[0];
    let bestDistance = Infinity;
    for (const attractor of this.attractorFields) {
      const distance = Math.hypot(attractor.x - from.x, attractor.y - from.y);
      if (distance < bestDistance) {
        best = attractor;
        bestDistance = distance;
      }
    }
    return best;
  }

  private cellOpen(x: number, y: number) {
    const scale = this.state.trailSize / FIELD_SIZE;
    const size = this.state.trailSize;
    const px = Math.floor(x * scale);
    const py = Math.floor(y * scale);
    return px >= 0 && py >= 0 && px < size && py < size && this.open[py * size + px] === 1;
  }

  private rememberAnchors() {
    const agents = this.state.agents;
    if (this.anchorX.length !== agents.length) {
      this.anchorX = new Float32Array(agents.length);
      this.anchorY = new Float32Array(agents.length);
    }
    for (let index = 0; index < agents.length; index += 1) {
      const agent = agents[index];
      if (!this.cellOpen(agent.x, agent.y)) continue;
      this.anchorX[index] = agent.x;
      this.anchorY[index] = agent.y;
    }
  }

  private confine() {
    const trails = this.state.trails;
    const display = this.state.displayTrails;
    const closed = this.closed;
    for (let n = 0; n < closed.length; n += 1) {
      const index = closed[n];
      if (trails[index] !== 0) trails[index] = 0;
      if (display && display[index] !== 0) display[index] = 0;
    }
    const agents = this.state.agents;
    if (this.anchorX.length !== agents.length) this.rememberAnchors();
    for (let index = 0; index < agents.length; index += 1) {
      const agent = agents[index];
      if (this.cellOpen(agent.x, agent.y)) {
        this.anchorX[index] = agent.x;
        this.anchorY[index] = agent.y;
        continue;
      }
      const ax = this.anchorX[index];
      const ay = this.anchorY[index];
      if ((ax !== 0 || ay !== 0) && this.cellOpen(ax, ay)) {
        agent.x = ax;
        agent.y = ay;
        agent.heading = wrapAngle(agent.heading + Math.PI + (this.rng() - 0.5) * 0.7);
        this.turnedAtBoundary += 1;
        continue;
      }
      if (this.sourceFields.length === 0) continue;
      const source = this.sourceFields[Math.floor(this.rng() * this.sourceFields.length)] ?? this.sourceFields[0];
      const attractor = this.nearestAttractor(source);
      const jitter = (this.rng() - 0.5) * 0.16;
      agent.x = source.x + jitter;
      agent.y = source.y + jitter;
      agent.heading = Math.atan2(attractor.y - source.y, attractor.x - source.x) + (this.rng() - 0.5) * 0.4;
      this.anchorX[index] = agent.x;
      this.anchorY[index] = agent.y;
    }
  }

  private checkMapping() {
    const problems: string[] = [];
    let sources = 0;
    let attractors = 0;
    for (const node of this.editState.nodes) {
      const field = siteToField(node.x, node.z, this.frame);
      const back = fieldToSite(field, this.frame);
      const drift = Math.hypot(back.x - node.x, back.z - node.z);
      const outside = field.x < 0.4 || field.y < 0.4 || field.x > FIELD_SIZE - 0.4 || field.y > FIELD_SIZE - 0.4;
      const number = node.kind === "source" ? (sources += 1) : (attractors += 1);
      const name = `${node.kind === "source" ? "Source" : "Attractor"} ${number}`;
      if (outside || drift > 1 || !this.insideField(node.x, node.z)) problems.push(name);
    }
    this.mappingNote = problems.length
      ? `${problems.join(", ")} ${problems.length === 1 ? "lies" : "lie"} outside the simulation field, so growth cannot use ${problems.length === 1 ? "that node" : "those nodes"}.`
      : null;
  }

  private agentGap(east: number, north: number) {
    let best = Infinity;
    for (const agent of this.state.agents) {
      const site = fieldToSite(agent, this.frame);
      best = Math.min(best, Math.hypot(site.x - east, site.z - north));
    }
    return best;
  }

  private trailGap(east: number, north: number) {
    return strongTrailFeet(this.state.trails, this.inkSize, this.frame, east, north, this.open);
  }

  private measureAttractors(scanTrails: boolean) {
    const scan = scanTrails && this.scannedAt !== this.state.iteration;
    if (scan) this.scannedAt = this.state.iteration;
    const tolerance = reachFeet(this.cellFeet);
    const live = new Set<string>();
    for (const node of this.editState.nodes) {
      if (node.kind !== "attractor") continue;
      live.add(node.id);
      const watch = this.watches.get(node.id) ?? { best: Infinity, still: 0, holds: 0, current: Infinity, connected: false, reached: false, visiting: false };
      const trailFeet = scan ? this.trailGap(node.x, node.z) : watch.current;
      const arrival = nextArrival(watch.holds, trailFeet, this.agentGap(node.x, node.z), scan, tolerance, watch.connected);
      watch.holds = arrival.holds;
      watch.connected = arrival.connected;
      watch.reached = arrival.reached;
      watch.visiting = arrival.visiting;
      if (scan) {
        watch.current = trailFeet;
        if (trailFeet < watch.best - this.cellFeet) {
          watch.best = trailFeet;
          watch.still = 0;
        } else watch.still += 1;
      }
      this.watches.set(node.id, watch);
    }
    for (const id of this.watches.keys()) {
      if (!live.has(id)) this.watches.delete(id);
    }
  }

  private publishStatus() {
    const reachedIds: string[] = [];
    const connectedIds: string[] = [];
    const visitIds: string[] = [];
    const short: string[] = [];
    let number = 0;
    let waiting = false;
    for (const node of this.editState.nodes) {
      if (node.kind !== "attractor") continue;
      number += 1;
      const watch = this.watches.get(node.id);
      if (watch?.connected) connectedIds.push(node.id);
      if (watch?.reached) reachedIds.push(node.id);
      if (watch?.visiting) visitIds.push(node.id);
      const feet = Math.round(watch?.current ?? Infinity);
      if (!watch?.connected && Number.isFinite(feet)) {
        short.push(`Attractor ${number} is ${Math.max(0, feet)} ft from the strong trail`);
        if ((watch?.still ?? 0) > 400) waiting = true;
      }
    }
    let note = this.domainNote ?? this.mappingNote;
    if (!note && short.length && (this.settled || (this.state.iteration > 200 && waiting))) {
      const reason = this.settled
        ? this.state.iteration >= this.state.maxIterations
          ? `The ${NETWORK_STEP_BUDGET}-step run finished before the network arrived.`
          : "Growth settled before the network arrived."
        : "The network has stopped moving closer.";
      note = `${short.join(". ")}. ${reason}`;
    }
    this.statusState = {
      step: this.state.iteration,
      settled: this.settled,
      reached: reachedIds.length,
      total: number,
      reachedIds,
      connected: connectedIds.length,
      connectedIds,
      visitIds,
      note,
    };
  }

  /** A copy of the engine trail field. Graphic mapping is not applied. */
  snapshotTrails(): Float32Array {
    return Float32Array.from(this.state.trails);
  }

  private writeInk() {
    const trails = this.state.trails;
    const open = this.open;
    const pixels = this.pixels;
    for (let index = 0; index < trails.length; index += 1) {
      const write = index * 4;
      const value = open[index] === 1 ? trails[index] : 0;
      pixels[write] = 255;
      pixels[write + 1] = 255;
      pixels[write + 2] = 255;
      pixels[write + 3] = trailDisplayAlpha(value);
    }
  }
}

export function createSiteNetworkStudy(parcel: readonly XZ[], water: readonly XZ[], init?: StudyInit) {
  return new SiteNetworkStudy(parcel, water, init);
}

function yieldToPaint() {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, 0);
  });
}

/** Runs one finished network from the given nodes and seed. The live study is not used. */
export async function runNetworkIteration(
  parcel: readonly XZ[],
  water: readonly XZ[],
  nodes: readonly NetworkNode[],
  seed: number,
  onStep?: (step: number) => void,
  buildings: readonly NetworkFootprint[] = [],
): Promise<NetworkIteration> {
  const study = new SiteNetworkStudy(parcel, water, { seed, nodes, persist: false, buildings });
  const copy = nodes.map((node) => ({ ...node }));
  if (!study.canRun) {
    return {
      id: `i${seed.toString(16)}`,
      index: 0,
      seed,
      nodes: copy,
      step: 0,
      settled: false,
      reached: 0,
      total: copy.filter((node) => node.kind === "attractor").length,
      reachedIds: [],
      connectedIds: [],
      note: study.status.note ?? "Place at least one source and one attractor on the land before an iteration can grow.",
      trails: new Float32Array(study.inkSize * study.inkSize),
      inkSize: study.inkSize,
      traversable: study.traversable,
      cellFeet: study.cellFeet,
    };
  }
  study.resume();
  while (!study.settled && study.iteration < NETWORK_STEP_BUDGET) {
    study.step(8, false);
    if (study.iteration % 40 === 0) {
      onStep?.(study.iteration);
      await yieldToPaint();
    }
  }
  study.finish();
  return {
    id: `i${seed.toString(16)}-${study.iteration}`,
    index: 0,
    seed,
    nodes: copy,
    step: study.status.step,
    settled: study.status.settled,
    reached: study.status.reached,
    total: study.status.total,
    reachedIds: [...study.status.reachedIds],
    connectedIds: [...study.status.connectedIds],
    note: study.status.note,
    trails: study.snapshotTrails(),
    inkSize: study.inkSize,
    traversable: study.traversable,
    cellFeet: study.cellFeet,
  };
}
