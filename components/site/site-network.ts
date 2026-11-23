import { mulberry32 } from "@/lib/physarum";
import { createSimulation, stepSimulation } from "@/lib/skill1/engine";
import { FIELD_SIZE } from "@/lib/skill1/maps";
import type { SlimeControls } from "@/lib/skill1/slime-controls";
import type { BiologicalTranslation, Point, SimulationState } from "@/lib/skill1/types";
import { pointInRing } from "@/lib/skill5/placement";
import type { XZ } from "@/lib/skill5/site-model";
import { pedestrianCandidates, resolveCandidate, type PedestrianCandidate } from "./site-network-candidates";
import { assessNetworkDomain, rasterNetworkMask, type NetworkDomain, type NetworkFootprint } from "./site-network-domain";
import { trailDisplayAlpha } from "./site-network-display";
import {
  adaptFlow,
  attractorRoutes,
  survivingPoints,
  auditFlowMask,
  createFlowGraph,
  createFlowState,
  FLOW_SPACING_FEET,
  FLOW_SURVIVE,
  flowSettled,
  rasterFlow,
  type FlowState,
} from "./site-network-flow";
import {
  GROWTH_WIDTH_DEFAULT,
  clampGrowthWidth,
  growthRing,
  shoreLanding,
  type WaterGrowth,
} from "./site-water-growth";

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
  /** Handoff record id, when this node was approved from a pedestrian candidate. */
  recordId?: string;
  /** Original measured east. Growth uses `x`, which may be the interior cell. */
  measuredX?: number;
  /** Original measured north. */
  measuredZ?: number;
  /** Set when the attractor was placed on water. Land nodes leave this unset. */
  surface?: "water";
  /** Permitted growth region. Null means the zone was removed and the bay around this node stays closed. */
  water?: WaterGrowth | null;
  /** Provenance for a generated proposal. Manual nodes leave this unset. */
  strategy?: StrategyNodeTrace;
};

export type StrategyOrigin = "measured-access" | "city-edge" | "mapped-approach" | "waterfront" | "internal" | "road-buffered";

/** Measurements recorded with a generated node. They are not a combined score. */
export type StrategyNodeTrace = {
  layoutId: string;
  origin: StrategyOrigin;
  /** True for a measured access gap. A design proposal stays false. */
  unverified: boolean;
  note: string;
  /** Nearest open sightline to the coastline, in feet. Null when none is open. */
  shoreFeet: number | null;
  /** Nearest distance to the coastline, in feet. Null on records saved before this field. */
  waterfrontFeet: number | null;
  openRays: number | null;
  macarthurFeet: number | null;
  exposed: boolean | null;
  shaded: boolean | null;
};

export type NetworkCandidate = PedestrianCandidate & {
  resolvedX: number | null;
  resolvedZ: number | null;
  approvable: boolean;
};

export type NetworkEdit = {
  nodes: readonly NetworkNode[];
  selectedId: string | null;
  candidates: readonly NetworkCandidate[];
  selectedCandidateId: string | null;
};

const EMPTY_EDIT: NetworkEdit = { nodes: [], selectedId: null, candidates: [], selectedCandidateId: null };

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
  /** Flow conductivity is the live generator. Agents remain available for rollback. */
  generator: "flow" | "agents";
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
  generator: "flow",
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
  /** `flow` stores conductivity. `agents` stores raw engine deposits. */
  generator?: "flow" | "agents";
  /** Surviving adaptive-flow branches, in site feet. Absent on older saved iterations. */
  branches?: { x0: number; z0: number; x1: number; z1: number; conductivity: number }[];
  /** Generated layout that supplied the nodes. Manual runs leave this unset. */
  layoutId?: string;
  layoutTitle?: string;
  layoutFamily?: "waterfront" | "internal" | "road-buffered" | "sketch";
  /** Flow-graph spacing used for the run, in site feet. */
  spacingFeet?: number;
  /** Airport wind direction, stored only when the layout measured it. */
  windFromDegrees?: number | null;
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
  /** Flow-graph spacing in site feet. The live study keeps 15. */
  spacingFeet?: number;
  /** Adaptive flow is the live generator. `agents` keeps the previous stepper for rollback. */
  generator?: "flow" | "agents";
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

function readWater(value: unknown): WaterGrowth | null | undefined {
  if (value === null) return null;
  if (!value || typeof value !== "object") return undefined;
  const record = value as Partial<WaterGrowth>;
  if (typeof record.widthFt !== "number" || typeof record.landX !== "number" || typeof record.landZ !== "number") return undefined;
  if (!Number.isFinite(record.widthFt) || !Number.isFinite(record.landX) || !Number.isFinite(record.landZ)) return undefined;
  return { widthFt: clampGrowthWidth(record.widthFt), landX: record.landX, landZ: record.landZ };
}

function copyNode(node: NetworkNode): NetworkNode {
  return { ...node, water: node.water ? { ...node.water } : node.water, strategy: node.strategy ? { ...node.strategy } : node.strategy };
}

function readStrategy(value: unknown): StrategyNodeTrace | undefined {
  if (!value || typeof value !== "object") return undefined;
  const record = value as Partial<StrategyNodeTrace>;
  const origins: StrategyOrigin[] = ["measured-access", "city-edge", "mapped-approach", "waterfront", "internal", "road-buffered"];
  if (typeof record.layoutId !== "string" || typeof record.note !== "string") return undefined;
  if (!origins.includes(record.origin as StrategyOrigin)) return undefined;
  const numberOrNull = (item: unknown) => (typeof item === "number" && Number.isFinite(item) ? item : null);
  const booleanOrNull = (item: unknown) => (typeof item === "boolean" ? item : null);
  return {
    layoutId: record.layoutId,
    origin: record.origin as StrategyOrigin,
    unverified: record.unverified === true,
    note: record.note,
    shoreFeet: numberOrNull(record.shoreFeet),
    waterfrontFeet: numberOrNull(record.waterfrontFeet),
    openRays: numberOrNull(record.openRays),
    macarthurFeet: numberOrNull(record.macarthurFeet),
    exposed: booleanOrNull(record.exposed),
    shaded: booleanOrNull(record.shaded),
  };
}

/** Reads one stored node, including water and strategy fields when they are present. */
export function readNetworkNode(value: unknown): NetworkNode | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Partial<NetworkNode> & { water?: unknown; strategy?: unknown };
  if (record.kind !== "source" && record.kind !== "attractor") return null;
  if (typeof record.id !== "string" || typeof record.x !== "number" || typeof record.z !== "number") return null;
  if (!Number.isFinite(record.x) || !Number.isFinite(record.z)) return null;
  const node: NetworkNode = { id: record.id, kind: record.kind, x: record.x, z: record.z };
  if (typeof record.recordId === "string") node.recordId = record.recordId;
  if (typeof record.measuredX === "number" && typeof record.measuredZ === "number") {
    node.measuredX = record.measuredX;
    node.measuredZ = record.measuredZ;
  }
  const water = readWater(record.water);
  if (record.surface === "water" || water !== undefined) {
    if (node.kind === "attractor") node.surface = "water";
    if (water !== undefined) node.water = water;
  }
  const strategy = readStrategy(record.strategy);
  if (strategy) node.strategy = strategy;
  return node;
}

function readStored(): NetworkNode[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]") as unknown;
    if (!Array.isArray(parsed)) return [];
    const nodes: NetworkNode[] = [];
    for (const item of parsed) {
      const node = readNetworkNode(item);
      if (node) nodes.push(node);
    }
    return nodes;
  } catch {
    return [];
  }
}

export class SiteNetworkStudy {
  readonly frame: Frame;
  domain!: NetworkDomain;
  readonly land: XZ[];
  readonly pixels: Uint8Array;
  readonly inkSize: number;
  traversable!: number;
  revision = 0;
  settled = false;
  private statusState: NetworkStatus = EMPTY_STATUS;
  private editState: NetworkEdit = EMPTY_EDIT;
  private readonly listeners = new Set<() => void>();
  private open!: Uint8Array;
  private closed!: Uint32Array;
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
  private domainNote: string | null = null;
  private readonly slime: SlimeControls;
  private readonly attractorSpread: number | undefined;
  private readonly watches = new Map<string, AttractorWatch>();
  private turnedAtBoundary = 0;
  private anchorX = new Float32Array(0);
  private anchorY = new Float32Array(0);
  private flowRng: () => number = Math.random;
  private flow: FlowState | null = null;
  readonly generator: "flow" | "agents";
  private readonly parcelRing: readonly XZ[];
  private readonly waterRing: readonly XZ[];
  private readonly footprints: readonly NetworkFootprint[];
  private readonly legacyOverWater: readonly XZ[] | null;
  private readonly spacingFeet: number;

  constructor(parcel: readonly XZ[], water: readonly XZ[], init?: StudyInit) {
    this.persistEnabled = init?.persist !== false;
    this.seed = init?.seed ?? SEED;
    this.generator = init?.generator ?? "flow";
    this.parcelRing = parcel;
    this.waterRing = water;
    this.footprints = init?.buildings ?? [];
    this.legacyOverWater = init?.overWater ?? null;
    this.spacingFeet = init?.spacingFeet ?? FLOW_SPACING_FEET;
    this.frame = frameAround(parcel);
    this.rng = mulberry32(this.seed ^ 0x51e7);
    this.inkSize = FIELD_SIZE * SITE_TRAIL_SCALE;
    this.pixels = new Uint8Array(this.inkSize * this.inkSize * 4);
    this.installDomain([]);
    this.land = this.domain.boundary;
    this.slime = { ...SITE_SLIME, ...init?.slime };
    this.attractorSpread = init?.attractorSpread;
    const incoming = init?.nodes
      ? init.nodes.map((node) => copyNode(node))
      : this.persistEnabled
        ? readStored()
        : [];
    this.prepareIncoming(incoming);
    this.installDomain(incoming);
    const stored = incoming.filter((node) => this.keeps(node));
    let serial = 1;
    for (const node of stored) {
      const match = /^n(\d+)$/.exec(node.id);
      if (match) serial = Math.max(serial, Number(match[1]) + 1);
    }
    this.serial = serial;
    this.editState = { nodes: stored, selectedId: null, candidates: this.settleCandidates(parcel), selectedCandidateId: null };
    this.translation = studyTranslation([], []);
    this.restart(false);
  }

  /** Rebuilds the seeded generator and the trail field. Reset and a new study share this sequence. */
  private restart(hold: boolean) {
    this.hold = hold;
    this.rng = mulberry32(this.seed ^ 0x51e7);
    this.flowRng = mulberry32(this.seed ^ 0xF10C);
    this.flow = null;
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

  /** True when the point sits in the water ring. The rest of that ring stays closed until a growth zone covers it. */
  onWater(x: number, z: number) {
    return this.domain.water ? pointInRing(x, z, this.domain.water) : false;
  }

  /** Open land. Water, including a growth zone, does not count. */
  onOpenLand(x: number, z: number) {
    return this.insideField(x, z) && !this.onWater(x, z);
  }

  canPlace(kind: NetworkNodeKind, x: number, z: number) {
    if (kind === "source") return this.onOpenLand(x, z);
    return this.onOpenLand(x, z) || (this.onWater(x, z) && this.inFrame(x, z));
  }

  /**
   * Replaces the nodes in the editor with a generated layout.
   * Saved iterations and configurations are not touched.
   */
  installProposal(nodes: readonly NetworkNode[]) {
    const kept = nodes.map((node) => copyNode(node)).filter((node) => this.keeps(node));
    let serial = 1;
    for (const node of kept) {
      const match = /^n(\d+)$/.exec(node.id);
      if (match) serial = Math.max(serial, Number(match[1]) + 1);
    }
    this.serial = serial;
    this.installDomain(kept);
    this.replace(kept, null, null);
    this.persist();
    this.applyTargets(false);
    return kept.length;
  }

  place(kind: NetworkNodeKind, x: number, z: number) {
    if (kind === "attractor" && this.onWater(x, z)) return this.placeWater(x, z);
    if (!this.onOpenLand(x, z)) return false;
    const node: NetworkNode = { id: `n${this.serial}`, kind, x, z };
    this.serial += 1;
    this.replace([...this.editState.nodes, node], node.id, null);
    this.persist();
    this.applyTargets(this.iteration > 0);
    return true;
  }

  move(id: string, x: number, z: number) {
    const current = this.editState.nodes.find((node) => node.id === id);
    if (!current) return false;
    if (current.surface === "water") return this.moveWater(current, x, z);
    if (!this.onOpenLand(x, z)) return false;
    const nodes = this.editState.nodes.map((node) => node.id === id ? { ...node, x, z } : node);
    this.replace(nodes, id);
    return true;
  }

  setGrowthWidth(id: string, widthFt: number) {
    const current = this.editState.nodes.find((node) => node.id === id);
    if (!current?.water) return false;
    const nodes = this.editState.nodes.map((node) => node.id === id && node.water
      ? { ...node, water: { ...node.water, widthFt: clampGrowthWidth(widthFt) } }
      : node);
    if (!this.commitDomain(nodes)) return false;
    this.persist();
    this.applyTargets(this.iteration > 0);
    return true;
  }

  /** Moves the land contact of a water attractor's growth zone. The solve restarts on commit. */
  setGrowthLanding(id: string, landX: number, landZ: number) {
    const current = this.editState.nodes.find((node) => node.id === id);
    if (!current?.water || !this.inFrame(landX, landZ)) return false;
    const nodes = this.editState.nodes.map((node) => node.id === id && node.water
      ? { ...node, water: { ...node.water, landX, landZ } }
      : node);
    return this.commitDomain(nodes);
  }

  clearGrowth(id: string) {
    const current = this.editState.nodes.find((node) => node.id === id);
    if (!current || current.surface !== "water" || current.water === null) return false;
    const nodes = this.editState.nodes.map((node) => node.id === id ? { ...node, water: null } : node);
    this.installDomain(nodes);
    this.replace(nodes, this.editState.selectedId);
    this.persist();
    this.applyTargets(this.iteration > 0);
    return true;
  }

  restoreGrowth(id: string) {
    const current = this.editState.nodes.find((node) => node.id === id);
    if (!current || current.surface !== "water") return false;
    const landing = shoreLanding(current.x, current.z, this.land, this.domain.water);
    if (!landing) return false;
    const nodes = this.editState.nodes.map((node) => node.id === id
      ? { ...node, water: { widthFt: current.water?.widthFt ?? GROWTH_WIDTH_DEFAULT, landX: landing.x, landZ: landing.z } }
      : node);
    if (!this.commitDomain(nodes)) return false;
    this.persist();
    this.applyTargets(this.iteration > 0);
    return true;
  }

  commit() {
    this.persist();
    this.applyTargets(this.iteration > 0);
  }

  select(id: string | null) {
    if (id === this.editState.selectedId && this.editState.selectedCandidateId === null) return;
    if (id && !this.editState.nodes.some((node) => node.id === id)) return;
    const node = id ? this.editState.nodes.find((item) => item.id === id) : undefined;
    this.replace(this.editState.nodes, id, node?.recordId ?? null);
  }

  selectCandidate(id: string | null) {
    if (id && !this.editState.candidates.some((item) => item.id === id)) return;
    const approved = id != null && this.editState.nodes.some((node) => node.id === id);
    this.replace(this.editState.nodes, approved ? id : null, id);
  }

  /** Copies an approved candidate into the growth nodes. The measured coordinate stays on the record. */
  approveCandidate(id: string, kind: NetworkNodeKind) {
    const candidate = this.editState.candidates.find((item) => item.id === id);
    if (!candidate?.approvable || candidate.resolvedX == null || candidate.resolvedZ == null) return false;
    if (!this.onOpenLand(candidate.resolvedX, candidate.resolvedZ)) return false;
    const existing = this.editState.nodes.find((node) => node.id === id);
    const node: NetworkNode = {
      id,
      kind,
      x: existing?.x ?? candidate.resolvedX,
      z: existing?.z ?? candidate.resolvedZ,
      recordId: id,
      measuredX: candidate.measuredX,
      measuredZ: candidate.measuredZ,
    };
    if (!this.onOpenLand(node.x, node.z)) return false;
    const nodes = existing
      ? this.editState.nodes.map((item) => item.id === id ? node : item)
      : [...this.editState.nodes, node];
    this.replace(nodes, id, id);
    this.persist();
    this.applyTargets(this.iteration > 0);
    return true;
  }

  remove(id: string) {
    const nodes = this.editState.nodes.filter((node) => node.id !== id);
    if (nodes.length === this.editState.nodes.length) return;
    this.installDomain(nodes);
    this.replace(nodes, this.editState.selectedId === id ? null : this.editState.selectedId);
    this.persist();
    this.applyTargets(this.iteration > 0);
  }

  clearNodes() {
    if (this.editState.nodes.length === 0) return;
    this.installDomain([]);
    this.replace([], null);
    this.persist();
    this.applyTargets(this.iteration > 0);
  }

  /** True while the network is still growing or joining attractors. */
  get exploring() {
    return this.generator === "flow" && !this.flow?.feeding;
  }

  step(times: number, paint = true) {
    if (this.generator === "agents") this.stepAgents(times, paint);
    else this.stepFlow(times, paint);
  }

  /** Previous agent stepper. Kept so a study can be constructed with generator: "agents". */
  private stepAgents(times: number, paint: boolean) {
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

  private stepFlow(times: number, paint: boolean) {
    if (this.hold || this.settled || this.sourceFields.length === 0 || this.attractorFields.length === 0) return;
    const state = this.ensureFlow();
    for (let n = 0; n < times; n += 1) {
      if (flowSettled(state)) break;
      adaptFlow(state);
      this.state.iteration += 1;
      this.measureFlow();
      if (flowSettled(state)) break;
    }
    this.settled = flowSettled(state);
    rasterFlow(state, this.state.trails, this.frame, this.inkSize, this.open);
    auditFlowMask(state, this.frame, this.inkSize, this.open, this.cellFeet);
    if (!paint) {
      this.publishFlowStatus();
      return;
    }
    this.writeInk();
    this.publishFlowStatus();
    this.revision += 1;
  }

  private ensureFlow() {
    if (this.flow) return this.flow;
    const terminals = this.editState.nodes
      .filter((node) => this.insideField(node.x, node.z))
      .map((node) => ({ id: node.id, kind: node.kind, x: node.x, z: node.z }));
    const graph = createFlowGraph(terminals, this.spacingFeet, this.cellFeet, this.frame, this.inkSize, this.open, this.flowRng);
    this.flow = createFlowState(graph);
    return this.flow;
  }

  private measureFlow() {
    const flow = this.flow;
    if (!flow) return;
    for (const node of this.editState.nodes) {
      if (node.kind !== "attractor") continue;
      const watch = this.watches.get(node.id) ?? { best: Infinity, still: 0, holds: 0, current: Infinity, connected: false, reached: false, visiting: false };
      const connected = flow.connected.includes(node.id);
      watch.connected = connected;
      watch.visiting = false;
      watch.holds = connected ? watch.holds + 1 : 0;
      watch.reached = watch.holds >= REACH_HOLDS;
      watch.current = connected ? 0 : Infinity;
      this.watches.set(node.id, watch);
    }
  }

  flowRoutes() {
    return this.flow ? attractorRoutes(this.flow) : [];
  }

  flowPoints() {
    return this.flow ? survivingPoints(this.flow) : [];
  }

  /** Surviving edges for the display tubes. The conductivity field used by analysis is unchanged. */
  flowAppearance() {
    const flow = this.flow;
    if (!flow || this.generator !== "flow") return [];
    const graph = flow.graph;
    const edges: { x0: number; z0: number; x1: number; z1: number; conductivity: number }[] = [];
    for (const edge of graph.edges) {
      if (edge.conductivity < FLOW_SURVIVE) continue;
      edges.push({
        x0: graph.east[edge.a],
        z0: graph.north[edge.a],
        x1: graph.east[edge.b],
        z1: graph.north[edge.b],
        conductivity: edge.conductivity,
      });
    }
    return edges;
  }

  flowReport() {
    const flow = this.flow;
    return {
      connected: flow?.connected ?? [],
      disconnected: this.attractorGaps(),
      branches: flow?.branches ?? 0,
      surviving: flow?.surviving ?? 0,
      maskBreaks: flow?.maskBreaks ?? 0,
      stable: flow ? flow.stableFor >= 20 : false,
      step: flow?.step ?? 0,
      nodes: flow?.graph.east.length ?? 0,
      edges: flow?.graph.edges.length ?? 0,
      signature: flow?.signature ?? "",
    };
  }

  private publishFlowStatus() {
    const flow = this.flow;
    const reachedIds: string[] = [];
    const connectedIds = flow?.connected ?? [];
    for (const id of connectedIds) {
      if (this.watches.get(id)?.reached) reachedIds.push(id);
    }
    const total = this.editState.nodes.filter((node) => node.kind === "attractor").length;
    const gaps = this.attractorGaps();
    let note = this.domainNote ?? this.mappingNote;
    if (flow && flow.step > 0 && gaps.length) {
      const names = gaps.map((id) => this.attractorName(id));
      const sentence = `${names.join(", ")} ${names.length === 1 ? "has" : "have"} no surviving conductivity to a source.`;
      note = note ? `${note} ${sentence}` : sentence;
    }
    if (flow && flow.maskBreaks > 0) {
      const sentence = `${flow.maskBreaks} surviving ${flow.maskBreaks === 1 ? "edge leaves" : "edges leave"} the open land and over-water zones.`;
      note = note ? `${note} ${sentence}` : sentence;
    }
    this.statusState = {
      step: this.state.iteration,
      settled: this.settled,
      reached: reachedIds.length,
      total,
      reachedIds,
      connected: connectedIds.length,
      connectedIds,
      visitIds: [],
      note,
      generator: "flow",
    };
  }

  finish() {
    if (this.generator === "flow") {
      if (this.flow) {
        rasterFlow(this.flow, this.state.trails, this.frame, this.inkSize, this.open);
        auditFlowMask(this.flow, this.frame, this.inkSize, this.open, this.cellFeet);
      }
      this.writeInk();
      this.publishFlowStatus();
      this.revision += 1;
      return;
    }
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

  private settleCandidates(parcel: readonly XZ[]): NetworkCandidate[] {
    let towardX = 0;
    let towardZ = 0;
    for (const [x, z] of parcel) {
      towardX += x;
      towardZ += z;
    }
    const count = Math.max(1, parcel.length);
    towardX /= count;
    towardZ /= count;
    return pedestrianCandidates().map((candidate) => {
      const resolved = resolveCandidate(candidate, (x, z) => this.insideField(x, z), this.cellFeet, towardX, towardZ);
      return {
        ...candidate,
        resolvedX: resolved?.x ?? null,
        resolvedZ: resolved?.z ?? null,
        approvable: resolved !== null,
      };
    });
  }

  private inFrame(x: number, z: number) {
    return x >= this.frame.minX && z >= this.frame.minZ && x <= this.frame.maxX && z <= this.frame.maxZ;
  }

  private keeps(node: NetworkNode) {
    if (!this.inFrame(node.x, node.z)) return false;
    if (node.kind === "source") return this.onOpenLand(node.x, node.z);
    if (node.surface === "water") return this.onWater(node.x, node.z) || this.insideField(node.x, node.z);
    return this.onOpenLand(node.x, node.z);
  }

  private prepareIncoming(nodes: NetworkNode[]) {
    for (const node of nodes) {
      if (node.surface !== "water" || node.water !== undefined) continue;
      const landing = shoreLanding(node.x, node.z, this.land, this.domain.water);
      node.water = landing
        ? { widthFt: GROWTH_WIDTH_DEFAULT, landX: landing.x, landZ: landing.z }
        : null;
    }
  }

  private installDomain(nodes: readonly NetworkNode[]) {
    const zones: XZ[][] = [];
    for (const node of nodes) {
      if (!node.water) continue;
      const ring = growthRing(node.x, node.z, node.water.landX, node.water.landZ, node.water.widthFt);
      if (ring) zones.push(ring);
    }
    this.domain = assessNetworkDomain({
      parcel: this.parcelRing,
      water: this.waterRing,
      buildings: this.footprints,
      overWater: this.legacyOverWater,
      overWaterZones: zones,
    });
    const mask = rasterNetworkMask(this.frame, this.domain, this.inkSize);
    this.open = mask.open;
    this.closed = mask.closed;
    this.traversable = mask.traversable;
    this.domainNote = this.domain.valid ? null : this.domain.gaps.join(" ");
  }

  /** Installs the mask for these nodes and keeps them only when every water attractor stays inside its zone. */
  private commitDomain(nodes: readonly NetworkNode[]) {
    this.installDomain(nodes);
    const covered = nodes.every((node) => node.surface !== "water" || !node.water || this.insideField(node.x, node.z));
    if (!covered) {
      this.installDomain(this.editState.nodes);
      return false;
    }
    this.replace(nodes, this.editState.selectedId);
    return true;
  }

  private placeWater(x: number, z: number) {
    if (!this.inFrame(x, z)) return false;
    const landing = shoreLanding(x, z, this.land, this.domain.water);
    if (!landing) return false;
    const node: NetworkNode = {
      id: `n${this.serial}`,
      kind: "attractor",
      x,
      z,
      surface: "water",
      water: { widthFt: GROWTH_WIDTH_DEFAULT, landX: landing.x, landZ: landing.z },
    };
    const nodes = [...this.editState.nodes, node];
    this.installDomain(nodes);
    if (!this.insideField(x, z)) {
      this.installDomain(this.editState.nodes);
      return false;
    }
    this.serial += 1;
    this.replace(nodes, node.id, null);
    this.persist();
    this.applyTargets(this.iteration > 0);
    return true;
  }

  private moveWater(current: NetworkNode, x: number, z: number) {
    if (this.onWater(x, z)) {
      if (!this.inFrame(x, z)) return false;
      const landing = shoreLanding(x, z, this.land, this.domain.water);
      if (!landing) return false;
      const nodes = this.editState.nodes.map((node) => node.id === current.id
        ? {
          ...node,
          x,
          z,
          water: {
            widthFt: current.water?.widthFt ?? GROWTH_WIDTH_DEFAULT,
            landX: landing.x,
            landZ: landing.z,
          },
        }
        : node);
      this.installDomain(nodes);
      if (!this.insideField(x, z)) {
        this.installDomain(this.editState.nodes);
        return false;
      }
      this.replace(nodes, current.id);
      return true;
    }
    if (!this.onOpenLand(x, z)) return false;
    const nodes = this.editState.nodes.map((node) => node.id === current.id
      ? { ...node, x, z, surface: undefined, water: undefined }
      : node);
    this.installDomain(nodes);
    this.replace(nodes, current.id);
    return true;
  }

  private attractorName(id: string) {
    const attractors = this.editState.nodes.filter((node) => node.kind === "attractor");
    const index = attractors.findIndex((node) => node.id === id);
    const node = attractors[index];
    const label = node?.surface === "water" ? "Water attractor" : "Attractor";
    return index >= 0 ? `${label} ${index + 1}` : id;
  }

  /** Attractors with no surviving path, including water attractors the mask does not admit. */
  private attractorGaps() {
    const flow = this.flow;
    const attractors = this.editState.nodes.filter((node) => node.kind === "attractor");
    if (!flow) return attractors.map((node) => node.id);
    const connected = new Set(flow.connected);
    const listed = new Set(flow.disconnected);
    const admitted = new Set(flow.graph.attractorIds);
    const gaps: string[] = [];
    for (const node of attractors) {
      if (connected.has(node.id)) continue;
      if (listed.has(node.id) || !admitted.has(node.id) || !this.insideField(node.x, node.z)) gaps.push(node.id);
    }
    return gaps;
  }

  private replace(nodes: readonly NetworkNode[], selectedId: string | null, selectedCandidateId?: string | null) {
    this.editState = {
      nodes,
      selectedId,
      candidates: this.editState.candidates,
      selectedCandidateId: selectedCandidateId === undefined ? this.editState.selectedCandidateId : selectedCandidateId,
    };
    for (const listener of this.listeners) listener();
  }

  private persist() {
    if (!this.persistEnabled || typeof localStorage === "undefined") return;
    const stored = this.editState.nodes.map((node) => ({
      id: node.id,
      kind: node.kind,
      x: node.x,
      z: node.z,
      recordId: node.recordId,
      measuredX: node.measuredX,
      measuredZ: node.measuredZ,
      ...(node.surface === "water"
        ? { surface: "water" as const, water: node.water ? { ...node.water } : null }
        : {}),
      ...(node.strategy ? { strategy: { ...node.strategy } } : {}),
    }));
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
    this.flow = null;
    this.rememberAnchors();
    this.settled = false;
    if (!keepTrails) this.pixels.fill(0);
    if (this.generator === "flow") this.publishFlowStatus();
    else this.publishStatus();
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
      generator: "agents",
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

/** Copies the live study's current tubes and trail field. The solver is not run again. */
export function captureNetworkIteration(study: SiteNetworkStudy): NetworkIteration {
  const status = study.status;
  const seed = (study as unknown as { seed: number }).seed;
  return {
    id: "",
    index: 0,
    seed,
    nodes: study.edit.nodes.map((node) => copyNode(node)),
    step: status.step,
    settled: status.settled,
    reached: status.reached,
    total: status.total,
    reachedIds: [...status.reachedIds],
    connectedIds: [...status.connectedIds],
    note: status.note,
    trails: study.snapshotTrails(),
    inkSize: study.inkSize,
    traversable: study.traversable,
    cellFeet: study.cellFeet,
    generator: study.generator,
    branches: study.generator === "flow" ? study.flowAppearance().map((edge) => ({ ...edge })) : undefined,
  };
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
  const copy = nodes.map((node) => copyNode(node));
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
      note: study.status.note ?? "Place at least one source and one attractor before an iteration can grow.",
      trails: new Float32Array(study.inkSize * study.inkSize),
      inkSize: study.inkSize,
      traversable: study.traversable,
      cellFeet: study.cellFeet,
      generator: study.generator,
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
    generator: study.generator,
    branches: study.generator === "flow" ? study.flowAppearance().map((edge) => ({ ...edge })) : undefined,
  };
}
