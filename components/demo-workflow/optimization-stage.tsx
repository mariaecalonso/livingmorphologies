"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import styles from "@/components/demo-workflow/optimization-stage.module.css";

const ARCHETYPE = "vertical-void";
const GENERATIONS = [1, 2, 3, 4] as const;
const OPERATIONS = ["evaluate", "rank", "select"] as const;
const LAST_BEAT = 1 + GENERATIONS.length * OPERATIONS.length;
const TIMELINE_PLATES = 8;
const READ_MS = 800;
const SCORED = 6;
const SETTLE_MS = 400;
const HOLD_MS = 1600;
const BIRTH_MS = 500;
const BIRTHS = 3;

type Operation = (typeof OPERATIONS)[number];
type Observed = Partial<Record<
  "complexity" | "proportionality" | "centrality" | "openness" | "connectivity" | "directionality" | "immersive" | "visibility" | "receptivity",
  number
>>;
type Candidate = {
  id: number;
  generation: number;
  formal: number;
  spatial: number;
  atmospheric: number;
  pareto: boolean;
  diversity: string;
  image: string | null;
  observed: Observed;
  parentId: number | null;
};
type RecordState = {
  status: "loading" | "ready" | "error";
  candidates: Candidate[];
  pickId: number | null;
};

const EMPTY: RecordState = { status: "loading", candidates: [], pickId: null };

type Bounds = { f0: number; f1: number; s0: number; s1: number; a0: number; a1: number };

const OPERATION_LABEL: Record<Operation, string> = {
  evaluate: "Evaluate",
  rank: "Rank",
  select: "Select",
};

function beatDuration(operation: Operation) {
  if (operation === "evaluate") return SCORED * READ_MS;
  if (operation === "rank") return SETTLE_MS + HOLD_MS + BIRTHS * BIRTH_MS + 300;
  return 1400;
}

const STEP_MS = OPERATIONS.map((operation) => beatDuration(operation));
const GENERATION_MS = STEP_MS.reduce((sum, ms) => sum + ms, 0);
const TOTAL_MS = GENERATION_MS * GENERATIONS.length;

/** Milliseconds already spent when this beat begins. The rail uses this so the marker keeps one speed. */
function elapsedAtBeat(beat: number) {
  if (beat <= 1) return 0;
  if (beat >= LAST_BEAT) return TOTAL_MS;
  const step = beat - 1;
  const generation = Math.floor(step / OPERATIONS.length);
  const operation = step % OPERATIONS.length;
  const earlier = STEP_MS.slice(0, operation).reduce((sum, ms) => sum + ms, 0);
  return generation * GENERATION_MS + earlier;
}

function beatState(beat: number) {
  if (beat <= 0) return { focus: "input" as const, generation: 1, operation: "evaluate" as const, hold: false, revealed: 0 };
  if (beat >= LAST_BEAT) return { focus: "pareto" as const, generation: 4, operation: "select" as const, hold: true, revealed: 4 };
  const step = beat - 1;
  const generation = Math.floor(step / OPERATIONS.length) + 1;
  const operation = OPERATIONS[step % OPERATIONS.length];
  return { focus: "process" as const, generation, operation, hold: false, revealed: generation };
}

function spread(items: Candidate[], count: number) {
  if (items.length <= count) return items;
  const sorted = [...items].sort((a, b) => a.formal - b.formal || a.id - b.id);
  const step = (sorted.length - 1) / (count - 1);
  const chosen = new Set<number>();
  return Array.from({ length: count }, (_, index) => sorted[Math.round(index * step)]).filter((item) => {
    if (chosen.has(item.id)) return false;
    chosen.add(item.id);
    return true;
  });
}

/** Atmospheric is the vertical axis. Formal and Spatial are the floor. */
function project(formal: number, spatial: number, atmospheric: number, yaw: number, bounds: Bounds) {
  const unit = (value: number, start: number, end: number) => (end === start ? 0.5 : (value - start) / (end - start));
  const x = unit(formal, bounds.f0, bounds.f1) - 0.5;
  const z = unit(spatial, bounds.s0, bounds.s1) - 0.5;
  const y = unit(atmospheric, bounds.a0, bounds.a1);
  const cos = Math.cos(yaw);
  const sin = Math.sin(yaw);
  const xr = x * cos - z * sin;
  const zr = x * sin + z * cos;
  return { left: 50 + xr * 42 + zr * 10, top: 70 - y * 44 - zr * 20, depth: zr + y };
}

type FrontPoint = { f: number; s: number; a: number; x: number; y: number; depth: number };

type PlaneSite = { index: number; x: number; y: number };
type PlaneTri = { a: number; b: number; c: number };

/** Circumcircle of a triangle in the trade-off plane. Collinear sites have none. */
function circumcircle(a: PlaneSite, b: PlaneSite, c: PlaneSite) {
  const d = 2 * (a.x * (b.y - c.y) + b.x * (c.y - a.y) + c.x * (a.y - b.y));
  if (Math.abs(d) < 1e-12) return null;
  const aa = a.x * a.x + a.y * a.y;
  const bb = b.x * b.x + b.y * b.y;
  const cc = c.x * c.x + c.y * c.y;
  const x = (aa * (b.y - c.y) + bb * (c.y - a.y) + cc * (a.y - b.y)) / d;
  const y = (aa * (c.x - b.x) + bb * (a.x - c.x) + cc * (b.x - a.x)) / d;
  return { x, y, r2: (x - a.x) ** 2 + (y - a.y) ** 2 };
}

/**
 * The Pareto surface. Every nondominated point is projected onto the plane
 * perpendicular to Formal + Spatial + Atmospheric and triangulated there,
 * so the front is one field rather than a set of nearest-neighbor links.
 */
function paretoField(points: FrontPoint[], bounds: Bounds) {
  const edges = new Set<string>();
  const addEdge = (left: number, right: number) => {
    if (left === right) return;
    edges.add(left < right ? `${left}-${right}` : `${right}-${left}`);
  };
  if (points.length < 2) return { edges: [] as [number, number][], faces: [] as [number, number, number][] };

  const span = (start: number, end: number) => (end === start ? 1 : end - start);
  const df = span(bounds.f0, bounds.f1);
  const ds = span(bounds.s0, bounds.s1);
  const da = span(bounds.a0, bounds.a1);
  const sites: PlaneSite[] = [];
  points.forEach((point, index) => {
    const formal = (point.f - bounds.f0) / df;
    const spatial = (point.s - bounds.s0) / ds;
    const atmospheric = (point.a - bounds.a0) / da;
    const x = formal * 0.70710678118 + spatial * -0.70710678118;
    const y = formal * 0.40824829046 + spatial * 0.40824829046 + atmospheric * -0.81649658092;
    const twin = sites.find((site) => (site.x - x) ** 2 + (site.y - y) ** 2 < 1e-10);
    if (twin) {
      addEdge(index, twin.index);
      return;
    }
    sites.push({ index, x, y });
  });

  const faces: [number, number, number][] = [];
  if (sites.length >= 3) {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    sites.forEach((site) => {
      minX = Math.min(minX, site.x);
      minY = Math.min(minY, site.y);
      maxX = Math.max(maxX, site.x);
      maxY = Math.max(maxY, site.y);
    });
    const midX = (minX + maxX) / 2;
    const midY = (minY + maxY) / 2;
    const delta = Math.max(maxX - minX, maxY - minY, 1) * 20;
    const all: PlaneSite[] = [
      { index: -1, x: midX - delta * 2, y: midY - delta },
      { index: -2, x: midX, y: midY + delta * 2 },
      { index: -3, x: midX + delta * 2, y: midY - delta },
      ...sites,
    ];
    let triangles: PlaneTri[] = [{ a: 0, b: 1, c: 2 }];
    for (let index = 3; index < all.length; index += 1) {
      const site = all[index];
      const cavity = new Map<string, { count: number; edge: [number, number] }>();
      const keep: PlaneTri[] = [];
      triangles.forEach((tri) => {
        const circle = circumcircle(all[tri.a], all[tri.b], all[tri.c]);
        const dx = site.x - (circle?.x ?? 0);
        const dy = site.y - (circle?.y ?? 0);
        const inside = circle ? dx * dx + dy * dy <= circle.r2 * (1 + 1e-9) : false;
        if (!inside) {
          keep.push(tri);
          return;
        }
        [[tri.a, tri.b], [tri.b, tri.c], [tri.c, tri.a]].forEach(([from, to]) => {
          const key = from < to ? `${from}:${to}` : `${to}:${from}`;
          const found = cavity.get(key);
          if (found) found.count += 1;
          else cavity.set(key, { count: 1, edge: [from, to] });
        });
      });
      cavity.forEach(({ count, edge }) => {
        if (count === 1) keep.push({ a: edge[0], b: edge[1], c: index });
      });
      triangles = keep;
    }
    triangles.forEach((tri) => {
      if (tri.a < 3 || tri.b < 3 || tri.c < 3) return;
      const face: [number, number, number] = [all[tri.a].index, all[tri.b].index, all[tri.c].index];
      faces.push(face);
      addEdge(face[0], face[1]);
      addEdge(face[1], face[2]);
      addEdge(face[2], face[0]);
    });
  }

  const covered = new Set<number>();
  edges.forEach((key) => key.split("-").forEach((index) => covered.add(Number(index))));
  const loose = sites.filter((site) => !covered.has(site.index));
  if (loose.length === sites.length) {
    const ordered = [...sites].sort((left, right) => left.x - right.x || left.y - right.y);
    ordered.slice(1).forEach((site, index) => addEdge(ordered[index].index, site.index));
  } else {
    loose.forEach((site) => {
      let nearest = -1;
      let nearestDistance = Infinity;
      sites.forEach((other) => {
        if (!covered.has(other.index)) return;
        const distance = (other.x - site.x) ** 2 + (other.y - site.y) ** 2;
        if (distance < nearestDistance) {
          nearestDistance = distance;
          nearest = other.index;
        }
      });
      if (nearest >= 0) addEdge(site.index, nearest);
    });
  }

  return {
    edges: [...edges].map((key) => key.split("-").map(Number) as [number, number]),
    faces,
  };
}

function Plate({ src }: { src: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt="" decoding="async" />
  );
}

function Reading({ plate }: { plate: Candidate }) {
  const rows = [
    ["Formal", plate.formal],
    ["Spatial", plate.spatial],
    ["Atmospheric", plate.atmospheric],
  ] as const;
  return (
    <div className={styles.scores}>
      <p>{plate.id}</p>
      {rows.map(([name, value]) => (
        <span key={name}>
          <b>{name}</b>
          <i style={{ "--level": `${Math.round(value * 100)}%` } as CSSProperties} />
          <em>{value.toFixed(2)}</em>
        </span>
      ))}
    </div>
  );
}

/** Replays the stored Vertical Void search. It does not rerun the optimizer. */
export function OptimizationStage() {
  const [record, setRecord] = useState<RecordState>(EMPTY);
  const [inputs, setInputs] = useState<string[]>([]);
  const [inputStatus, setInputStatus] = useState<"loading" | "ready" | "missing">("loading");
  const [beat, setBeat] = useState(1);
  const [reduced, setReduced] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const beatRef = useRef(beat);
  beatRef.current = beat;
  const story = beatState(beat);
  const revealed = record.candidates.filter((item) => item.generation <= story.revealed);
  const generation = record.candidates.filter((item) => item.generation === story.generation);

  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      try {
        const [catalog, picks, entries] = await Promise.all([
          fetch("/demo/skill2/catalog.json", { signal: controller.signal }).then((response) => {
            if (!response.ok) throw new Error(String(response.status));
            return response.json() as Promise<{ archetypes: { archetypeId: string; candidates: Candidate[] }[] }>;
          }),
          fetch("/demo/skill2/picks.json", { signal: controller.signal }).then((response) => {
            if (!response.ok) throw new Error(String(response.status));
            return response.json() as Promise<{ archetypeId: string; candidateId: number }[]>;
          }),
          fetch(`/demo/skill1/${ARCHETYPE}/entries.json`, { signal: controller.signal }).then((response) => {
            if (!response.ok) throw new Error(String(response.status));
            return response.json() as Promise<{ image?: string }[]>;
          }),
        ]);
        if (controller.signal.aborted) return;
        const archetype = catalog.archetypes.find((item) => item.archetypeId === ARCHETYPE);
        if (!archetype) throw new Error("missing archetype");
        const images = entries.map((entry) => entry.image).filter((src): src is string => Boolean(src));
        const count = Math.min(6, images.length);
        const step = Math.max(1, Math.floor(images.length / count));
        setInputs(Array.from({ length: count }, (_, index) => images[Math.min(images.length - 1, index * step)]));
        setInputStatus(images.length ? "ready" : "missing");
        setRecord({
          status: "ready",
          candidates: archetype.candidates.map((item) => ({
            id: item.id,
            generation: item.generation,
            formal: item.formal,
            spatial: item.spatial,
            atmospheric: item.atmospheric,
            pareto: Boolean(item.pareto),
            diversity: item.diversity || "none",
            image: item.image ?? null,
            observed: item.observed ?? {},
            parentId: item.parentId ?? null,
          })),
          pickId: picks.find((item) => item.archetypeId === ARCHETYPE)?.candidateId ?? null,
        });
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setRecord({ ...EMPTY, status: "error" });
        setInputStatus("missing");
      }
    };
    void load();
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const root = document.querySelector("#demo-workflow header")?.parentElement;
    if (!root) return;
    let last = root.style.getPropertyValue("--demo-progress");
    const observer = new MutationObserver(() => {
      const next = root.style.getPropertyValue("--demo-progress");
      if (next === last) return;
      const was = Number.parseFloat(last);
      last = next;
      if (next === "0" && was > 0) {
        setBeat(1);
        setSelectedId(null);
      }
    });
    observer.observe(root, { attributes: true, attributeFilter: ["style"] });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => {
      setReduced(media.matches);
      if (media.matches) setBeat(LAST_BEAT);
    };
    const timer = window.setTimeout(apply, 0);
    media.addEventListener("change", apply);
    return () => {
      window.clearTimeout(timer);
      media.removeEventListener("change", apply);
    };
  }, []);

  useEffect(() => {
    const node = trackRef.current;
    if (!node) return;
    if (reduced) {
      node.style.setProperty("--timeline", "1");
      return;
    }
    let frame = 0;
    let origin = performance.now();
    let originBeat = beatRef.current;
    const tick = (now: number) => {
      const currentBeat = beatRef.current;
      const current = beatState(currentBeat);
      if (current.hold) {
        node.style.setProperty("--timeline", "1");
      } else {
        if (currentBeat !== originBeat) {
          originBeat = currentBeat;
          origin = now;
        }
        const duration = beatDuration(current.operation);
        const elapsed = Math.min(duration, now - origin);
        const share = (elapsedAtBeat(currentBeat) + elapsed) / TOTAL_MS;
        node.style.setProperty("--timeline", String(share));
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [reduced]);

  useEffect(() => {
    if (reduced) return;
    const current = beatState(beat);
    const wait = !current.hold && current.operation === "evaluate"
      ? SCORED * READ_MS
      : !current.hold && current.operation === "rank"
        ? SETTLE_MS + HOLD_MS + BIRTHS * BIRTH_MS + 300
        : beatDuration(current.operation);
    const timer = window.setTimeout(() => {
      setBeat((value) => (value >= LAST_BEAT ? 1 : value + 1));
    }, wait);
    return () => window.clearTimeout(timer);
  }, [reduced, beat]);

  const jump = (generationNumber: number) => {
    setBeat(1 + (generationNumber - 1) * OPERATIONS.length);
    setSelectedId(null);
  };

  return (
    <div className={styles.stage} data-playing={reduced ? undefined : ""} data-focus={story.focus}>
      <section className={styles.input} aria-label="Initial population">
        <header>
          <h3>Input</h3>
        </header>
        <div className={styles.inputs}>
          {inputs.map((src) => <span key={src}><Plate src={src} /></span>)}
        </div>
        {inputStatus === "ready" ? null : <p>{inputStatus === "missing" ? "First-population plates are not stored." : "Loading."}</p>}
      </section>

      <section className={`${styles.panel} ${styles.work}`} data-focus={story.focus === "process" || story.revealed > 0 ? "" : undefined} aria-label="Evolutionary optimization">
        <header>
          <h3>Optimization</h3>
        </header>
        <Mechanism
          generation={generation}
          generationNumber={story.generation}
          operation={story.operation}
          hold={story.hold}
          reduced={reduced}
          status={record.status}
        />
      </section>

      <ParetoSpace
        candidates={revealed}
        activeGeneration={story.revealed}
        boundsCandidates={record.candidates}
        status={record.status}
        pickId={story.hold ? record.pickId : null}
        selectedId={selectedId}
        onSelect={setSelectedId}
        spin={!reduced && story.revealed > 0}
        focus={story.focus === "pareto"}
      />

      <section className={styles.progress} aria-label="Optimization timeline">
        <header className={styles.timelineHead}>
          <h3>Timeline</h3>
          <p>{story.hold ? "Through G04" : `Now · G${String(story.generation).padStart(2, "0")} · ${OPERATION_LABEL[story.operation]}`}</p>
        </header>
        <div className={styles.track} ref={trackRef}>
          <i className={styles.playhead} aria-hidden="true" />
          {GENERATIONS.map((generationNumber) => {
            const plates = record.candidates.filter((item) => item.generation === generationNumber && item.image);
            const shown = spread(plates, TIMELINE_PLATES);
            const state = generationNumber === story.generation && !story.hold ? "active" : generationNumber < story.generation || story.hold ? "done" : "waiting";
            return (
              <button
                key={generationNumber}
                type="button"
                data-state={state}
                aria-pressed={generationNumber === story.generation}
                aria-label={`Generation ${generationNumber}, ${shown.length} plates`}
                onClick={() => jump(generationNumber)}
              >
                <span>G{String(generationNumber).padStart(2, "0")}</span>
                <b className={styles.node} aria-hidden="true" />
                <span className={styles.stationPlates}>
                  {shown.map((item) => (
                    <Plate key={item.id} src={item.image as string} />
                  ))}
                </span>
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
}

type Spot = { x: number; y: number; opacity: number };
type Anchor = { x: number; y: number; span: number };
type Anchors = { evalY: number; evalLeft: number; evalSpan: number; groups: Anchor[] };

const FALLBACK_ANCHORS: Anchors = {
  evalY: 28,
  evalLeft: 2,
  evalSpan: 96,
  groups: [
    { x: 16, y: 78, span: 30 },
    { x: 48, y: 78, span: 30 },
    { x: 80, y: 78, span: 30 },
  ],
};

/** Centers `count` frames on one line, with the same gap at both ends and between them. */
function evenSpot(count: number, slot: number, anchor: Anchor, preferred: number): Spot {
  const countSafe = Math.max(count, 1);
  const left = anchor.x - anchor.span / 2;
  const minGap = 1.4;
  const maxSquare = Math.max(1, (anchor.span - (countSafe + 1) * minGap) / countSafe);
  const size = Math.min(preferred, maxSquare);
  const gap = (anchor.span - countSafe * size) / (countSafe + 1);
  return {
    x: left + gap + size / 2 + slot * (size + gap),
    y: anchor.y,
    opacity: 1,
  };
}

function Mechanism({
  generation,
  generationNumber,
  operation,
  hold,
  reduced,
  status,
}: {
  generation: Candidate[];
  generationNumber: number;
  operation: Operation;
  hold: boolean;
  reduced: boolean;
  status: RecordState["status"];
}) {
  const [cursor, setCursor] = useState(0);
  const [born, setBorn] = useState(0);
  const circuitRef = useRef<HTMLDivElement>(null);
  const [anchors, setAnchors] = useState<Anchors | null>(null);
  const [placed, setPlaced] = useState(false);
  const scene = useMemo(() => {
    const withImage = generation.filter((item) => item.image);
    const pareto = spread(withImage.filter((item) => item.pareto), 3);
    const diversity = spread(withImage.filter((item) => !item.pareto && item.diversity !== "none"), 3);
    const seen = new Set([...pareto, ...diversity].map((item) => item.id));
    const arrivals = spread(withImage.filter((item) => item.parentId == null && !seen.has(item.id)), 3);
    return { pareto, diversity, arrivals };
  }, [generation]);
  useEffect(() => {
    if (hold || reduced || operation !== "evaluate") return;
    const reset = window.setTimeout(() => setCursor(0), 0);
    const timer = window.setInterval(() => setCursor((value) => (value + 1) % SCORED), READ_MS);
    return () => {
      window.clearTimeout(reset);
      window.clearInterval(timer);
    };
  }, [hold, operation, reduced, generationNumber]);
  useEffect(() => {
    if (reduced) return;
    if (hold || operation === "select") {
      const show = window.setTimeout(() => setBorn(BIRTHS), 0);
      return () => window.clearTimeout(show);
    }
    if (operation !== "rank") {
      const hide = window.setTimeout(() => setBorn(0), 0);
      return () => window.clearTimeout(hide);
    }
    const reset = window.setTimeout(() => setBorn(0), 0);
    let count = 0;
    let interval = 0;
    const start = window.setTimeout(() => {
      count = 1;
      setBorn(1);
      interval = window.setInterval(() => {
        count += 1;
        setBorn(Math.min(BIRTHS, count));
        if (count >= BIRTHS) window.clearInterval(interval);
      }, BIRTH_MS);
    }, SETTLE_MS + HOLD_MS);
    return () => {
      window.clearTimeout(reset);
      window.clearTimeout(start);
      window.clearInterval(interval);
    };
  }, [hold, operation, reduced, generationNumber]);
  useLayoutEffect(() => {
    const circuit = circuitRef.current;
    if (!circuit) return;
    const measure = () => {
      const bounds = circuit.getBoundingClientRect();
      if (bounds.width < 1 || bounds.height < 1) return;
      const percent = (px: number, span: number, origin: number) => ((px - origin) / span) * 100;
      const centerX = (node: Element) => {
        const box = node.getBoundingClientRect();
        return percent(box.left + box.width / 2, bounds.width, bounds.left);
      };
      const bands = [...circuit.querySelectorAll("section")];
      const evalHeader = bands[0]?.querySelector("header")?.getBoundingClientRect();
      const evalBand = bands[0]?.getBoundingClientRect();
      const groupNodes = [...circuit.querySelectorAll<HTMLElement>("[data-group]")];
      const groupBoxes = groupNodes.map((node) => {
        const box = node.getBoundingClientRect();
        const label = node.querySelector("b")?.getBoundingClientRect();
        return { node, box, labelTop: label?.top ?? box.bottom };
      });
      const reference = groupBoxes.find((item) => item.node.dataset.role === "pareto") ?? groupBoxes[0];
      const alignedY = reference
        ? percent((reference.box.top + reference.labelTop) / 2, bounds.height, bounds.top)
        : 70;
      const groups = groupBoxes.map(({ node, box }) => ({
        x: centerX(node),
        y: alignedY,
        span: percent(box.right, bounds.width, bounds.left) - percent(box.left, bounds.width, bounds.left),
      }));
      if (!evalHeader || !evalBand || groups.length < 3) return;
      setAnchors({
        evalY: percent((evalHeader.bottom + evalBand.bottom) / 2, bounds.height, bounds.top),
        evalLeft: percent(evalBand.left, bounds.width, bounds.left),
        evalSpan: percent(evalBand.right, bounds.width, bounds.left) - percent(evalBand.left, bounds.width, bounds.left),
        groups,
      });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(circuit);
    return () => observer.disconnect();
  }, [status]);
  useEffect(() => {
    if (anchors) setPlaced(true);
  }, [anchors]);
  const hasNext = generationNumber < GENERATIONS.length;
  const descending = !hold && operation === "rank";
  const ascending = !hold && operation === "select" && hasNext;
  const frame = anchors ?? FALLBACK_ANCHORS;
  const spotFor = (role: "pareto" | "diversity", slot: number): Spot => {
    const kept = scene.pareto.length + scene.diversity.length;
    const index = role === "pareto" ? slot : scene.pareto.length + slot;
    if (!hold && operation === "evaluate") {
      return evenSpot(kept, index, { x: frame.evalLeft + frame.evalSpan / 2, y: frame.evalY, span: frame.evalSpan }, 14);
    }
    const group = role === "pareto" ? 0 : 1;
    const count = role === "pareto" ? scene.pareto.length : scene.diversity.length;
    return evenSpot(count, slot, frame.groups[group], 9);
  };
  if (status !== "ready") {
    return <p className={styles.operationNote}>{status === "loading" ? "Loading the published search." : "The published search could not be loaded."}</p>;
  }
  const scoring = !hold && operation === "evaluate";
  const compared = [...scene.pareto, ...scene.diversity];
  const reading = scoring ? compared[cursor % Math.max(compared.length, 1)] ?? null : null;
  return (
    <div className={styles.mechanism} data-op={hold ? "hold" : operation}>
      <div className={styles.circuit} ref={circuitRef} data-set={placed ? "" : undefined}>
        <section className={styles.band} data-on={!hold && operation === "evaluate" ? "" : undefined}>
          <header>
            <h4>Candidate evaluation</h4>
            {reading ? <Reading plate={reading} /> : null}
          </header>
        </section>
        <svg className={styles.exchange} viewBox="0 0 64 46" aria-hidden="true">
          <g data-way="down" data-on={descending ? "" : undefined}>
            <path className={styles.exchangeLine} d="M22 5 V34" />
            <path className={styles.exchangeHead} d="M16 28 L22 36 L28 28" />
          </g>
          <g data-way="up" data-on={ascending ? "" : undefined}>
            <path className={styles.exchangeLine} d="M42 41 V12" />
            <path className={styles.exchangeHead} d="M36 18 L42 10 L48 18" />
          </g>
        </svg>
        <section className={styles.band} data-on={!hold && (operation === "rank" || operation === "select") ? "" : undefined}>
          <header>
            <h4>Ranking and selection</h4>
          </header>
          <div className={styles.groups}>
            <span data-group="" data-role="pareto"><b>Nondominated</b></span>
            <span data-group="" data-role="diversity"><b>Diversity</b></span>
            <span data-group="" data-role="exploration"><b>Exploration</b><small>New iterations</small></span>
          </div>
        </section>
        {scene.pareto.map((item, slot) => {
          const spot = spotFor("pareto", slot);
          return (
            <figure key={`pareto-${slot}`} className={styles.mover} data-role="pareto" data-eval={scoring ? "" : undefined} data-read={reading?.id === item.id ? "" : undefined} data-grouped={!hold && (operation === "rank" || operation === "select") ? "" : undefined} style={{ left: `${spot.x}%`, top: `${spot.y}%`, opacity: spot.opacity }}>
              <Plate src={item.image!} />
            </figure>
          );
        })}
        {scene.diversity.map((item, slot) => {
          const spot = spotFor("diversity", slot);
          return (
            <figure key={`diversity-${slot}`} className={styles.mover} data-role="diversity" data-eval={scoring ? "" : undefined} data-read={reading?.id === item.id ? "" : undefined} data-grouped={!hold && (operation === "rank" || operation === "select") ? "" : undefined} style={{ left: `${spot.x}%`, top: `${spot.y}%`, opacity: spot.opacity }}>
              <Plate src={item.image!} />
            </figure>
          );
        })}
        {scene.arrivals.map((item, slot) => {
          const generated = hold || operation === "select" || (operation === "rank" && slot < born);
          const spot = { ...evenSpot(scene.arrivals.length, slot, frame.groups[2], 9), opacity: generated ? 1 : 0 };
          return (
            <figure key={`arrival-${slot}`} className={styles.mover} data-role="introduced" data-grouped={!hold && (operation === "rank" || operation === "select") ? "" : undefined} data-new={generated ? "" : undefined} data-emerging={operation === "rank" && slot === born - 1 ? "" : undefined} style={{ left: `${spot.x}%`, top: `${spot.y}%`, opacity: spot.opacity, visibility: spot.opacity === 0 ? "hidden" : "visible" }}>
              <Plate src={item.image!} />
            </figure>
          );
        })}
      </div>
    </div>
  );
}

function ParetoSpace({
  candidates,
  activeGeneration,
  boundsCandidates,
  status,
  pickId,
  selectedId,
  onSelect,
  spin,
  focus,
}: {
  candidates: Candidate[];
  activeGeneration: number;
  boundsCandidates: Candidate[];
  status: RecordState["status"];
  pickId: number | null;
  selectedId: number | null;
  onSelect: (id: number | null) => void;
  spin: boolean;
  focus: boolean;
}) {
  const field = useRef<HTMLDivElement>(null);
  const yaw = useRef(0.55);
  const bounds = useMemo<Bounds>(() => {
    if (boundsCandidates.length === 0) return { f0: 0, f1: 1, s0: 0, s1: 1, a0: 0, a1: 1 };
    const pad = 0.04;
    const formal = boundsCandidates.map((item) => item.formal);
    const spatial = boundsCandidates.map((item) => item.spatial);
    const atmospheric = boundsCandidates.map((item) => item.atmospheric);
    return {
      f0: Math.min(...formal) - pad,
      f1: Math.max(...formal) + pad,
      s0: Math.min(...spatial) - pad,
      s1: Math.max(...spatial) + pad,
      a0: Math.min(...atmospheric) - pad,
      a1: Math.max(...atmospheric) + pad,
    };
  }, [boundsCandidates]);
  const thumbs = useMemo(
    () => spread(candidates.filter((item) => item.generation === activeGeneration && item.pareto && item.image), 4).sort((a, b) => a.formal - b.formal),
    [candidates, activeGeneration],
  );
  const selected = candidates.find((item) => item.id === selectedId) ?? null;

  useEffect(() => {
    const node = field.current;
    if (!node) return;
    let frame = 0;
    const place = () => {
      const width = node.clientWidth || 1;
      const height = node.clientHeight || 1;
      const svgPoint = (formal: number, spatial: number, atmospheric: number) => {
        const point = project(formal, spatial, atmospheric, yaw.current, bounds);
        return { x: (point.left / 100) * width, y: (point.top / 100) * height, depth: point.depth };
      };
      const drawLine = (group: Element, from: { x: number; y: number }, to: { x: number; y: number }, axis?: string) => {
        const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
        line.setAttribute("x1", from.x.toFixed(1));
        line.setAttribute("y1", from.y.toFixed(1));
        line.setAttribute("x2", to.x.toFixed(1));
        line.setAttribute("y2", to.y.toFixed(1));
        if (axis) line.setAttribute("data-axis", axis);
        group.appendChild(line);
      };
      const grid = node.querySelector("[data-grid]");
      const mesh = node.querySelector("[data-mesh]");
      const axes = node.querySelector("[data-axes]");
      const leaders = node.querySelector("[data-leaders]");
      grid?.replaceChildren();
      mesh?.replaceChildren();
      axes?.replaceChildren();
      leaders?.replaceChildren();
      if (grid) {
        for (let step = 0; step <= 4; step += 1) {
          const formal = bounds.f0 + ((bounds.f1 - bounds.f0) * step) / 4;
          const spatial = bounds.s0 + ((bounds.s1 - bounds.s0) * step) / 4;
          drawLine(grid, svgPoint(formal, bounds.s0, bounds.a0), svgPoint(formal, bounds.s1, bounds.a0));
          drawLine(grid, svgPoint(bounds.f0, spatial, bounds.a0), svgPoint(bounds.f1, spatial, bounds.a0));
        }
      }
      const front: FrontPoint[] = [...node.querySelectorAll<HTMLElement>("[data-dot][data-pareto]")].map((mark) => {
        const f = Number(mark.dataset.f);
        const s = Number(mark.dataset.s);
        const a = Number(mark.dataset.a);
        return { f, s, a, ...svgPoint(f, s, a) };
      });
      if (mesh && front.length >= 2) {
        const fieldMesh = paretoField(front, bounds);
        const addLine = (from: FrontPoint, to: FrontPoint, glow: boolean) => {
          const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
          line.setAttribute("x1", from.x.toFixed(1));
          line.setAttribute("y1", from.y.toFixed(1));
          line.setAttribute("x2", to.x.toFixed(1));
          line.setAttribute("y2", to.y.toFixed(1));
          if (glow) line.setAttribute("data-glow", "");
          line.setAttribute("stroke", glow ? "#49d7de" : "#f4feff");
          line.setAttribute("stroke-width", glow ? "3.6" : "1.15");
          const lift = Math.max(0, Math.min(1, (from.depth + to.depth) / 2 + 0.35));
          line.setAttribute("stroke-opacity", (glow ? 0.16 + lift * 0.2 : 0.42 + lift * 0.4).toFixed(2));
          mesh.appendChild(line);
        };
        fieldMesh.faces.forEach(([a, b, c]) => {
          const polygon = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
          polygon.setAttribute("points", [front[a], front[b], front[c]].map((item) => `${item.x.toFixed(1)},${item.y.toFixed(1)}`).join(" "));
          const lift = Math.max(0, Math.min(1, (front[a].depth + front[b].depth + front[c].depth) / 3 + 0.35));
          polygon.setAttribute("fill", "#49d7de");
          polygon.setAttribute("fill-opacity", (0.08 + lift * 0.1).toFixed(2));
          polygon.setAttribute("stroke", "#9af7ff");
          polygon.setAttribute("stroke-width", "0.7");
          mesh.appendChild(polygon);
        });
        fieldMesh.edges.forEach(([a, b]) => {
          addLine(front[a], front[b], true);
          addLine(front[a], front[b], false);
        });
      }
      if (axes) {
        const origin = svgPoint(bounds.f0, bounds.s0, bounds.a0);
        const ends = [
          svgPoint(bounds.f1, bounds.s0, bounds.a0),
          svgPoint(bounds.f0, bounds.s1, bounds.a0),
          svgPoint(bounds.f0, bounds.s0, bounds.a1),
        ];
        const axisNames = ["formal", "spatial", "atmospheric"] as const;
        ends.forEach((tip, index) => {
          const axis = axisNames[index];
          drawLine(axes, origin, tip, axis);
          const angle = Math.atan2(tip.y - origin.y, tip.x - origin.x);
          const head = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
          const wing = (turn: number) => `${(tip.x - Math.cos(angle + turn) * 7).toFixed(1)},${(tip.y - Math.sin(angle + turn) * 7).toFixed(1)}`;
          head.setAttribute("points", `${tip.x.toFixed(1)},${tip.y.toFixed(1)} ${wing(-0.45)} ${wing(0.45)}`);
          head.setAttribute("data-axis", axis);
          axes.appendChild(head);
        });
      }
      const slots = [
        { x: 14, y: 16 },
        { x: 86, y: 70 },
        { x: 86, y: 16 },
        { x: 14, y: 70 },
      ];
      node.querySelectorAll<HTMLElement>("[data-f]").forEach((mark) => {
        const point = svgPoint(Number(mark.dataset.f), Number(mark.dataset.s), Number(mark.dataset.a));
        if (mark.hasAttribute("data-axis")) {
          const dx = point.x - width * 0.5;
          const dy = point.y - height * 0.5;
          const length = Math.hypot(dx, dy) || 1;
          const left = point.x + (dx / length) * 22;
          const top = point.y + (dy / length) * 18;
          mark.style.left = `${Math.min(97, Math.max(3, (left / width) * 100))}%`;
          mark.style.top = `${Math.min(96, Math.max(4, (top / height) * 100))}%`;
          return;
        }
        if (mark.hasAttribute("data-thumb")) {
          const slot = slots[Number(mark.dataset.slot)] ?? slots[0];
          if (leaders) drawLine(leaders, point, { x: (slot.x / 100) * width, y: (slot.y / 100) * height });
          mark.style.left = `${slot.x}%`;
          mark.style.top = `${slot.y}%`;
          mark.style.zIndex = "30";
          return;
        }
        mark.style.left = `${(point.x / width) * 100}%`;
        mark.style.top = `${(point.y / height) * 100}%`;
        mark.style.zIndex = String(12 + Math.round(point.depth * 8));
      });
    };
    place();
    if (!spin) return;
    let last = performance.now();
    const tick = (now: number) => {
      yaw.current += Math.min(48, now - last) * 0.0001;
      last = now;
      place();
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [spin, bounds, candidates, thumbs]);

  const tips = [
    { name: "Formal", letter: "F", f: bounds.f1, s: bounds.s0, a: bounds.a0 },
    { name: "Spatial", letter: "S", f: bounds.f0, s: bounds.s1, a: bounds.a0 },
    { name: "Atmospheric", letter: "A", f: bounds.f0, s: bounds.s0, a: bounds.a1 },
  ];

  return (
    <section className={`${styles.panel} ${styles.fieldPanel}`} data-focus={focus ? "" : undefined} aria-label="Pareto space">
      <header>
        <h3>Pareto Space</h3>
      </header>
      <div className={styles.field} ref={field}>
        <svg aria-hidden="true">
          <g data-grid="" />
          <g data-mesh="" />
          <g data-axes="" />
          <g data-leaders="" />
        </svg>
        {tips.map((tip) => <span key={tip.name} className={styles.axisName} data-axis={tip.name.toLowerCase()} data-f={tip.f} data-s={tip.s} data-a={tip.a} title={tip.name}>{tip.letter}</span>)}
        {status === "ready" ? candidates.map((item) => (
          <button
            key={item.id}
            type="button"
            className={styles.dot}
            data-dot=""
            data-f={item.formal}
            data-s={item.spatial}
            data-a={item.atmospheric}
            data-g={item.generation}
            data-pareto={item.pareto || undefined}
            data-active={item.generation === activeGeneration || undefined}
            data-pick={item.id === pickId || undefined}
            aria-label={`Candidate ${item.id}`}
            onClick={() => onSelect(selectedId === item.id ? null : item.id)}
          />
        )) : null}
        {thumbs.map((item, index) => (
          <button
            key={item.id}
            type="button"
            className={styles.thumb}
            data-thumb=""
            data-slot={index}
            data-f={item.formal}
            data-s={item.spatial}
            data-a={item.atmospheric}
            data-pick={item.id === pickId || undefined}
            aria-label={`Candidate ${item.id}`}
            onClick={() => onSelect(selectedId === item.id ? null : item.id)}
          >
            <Plate src={item.image!} />
          </button>
        ))}
        {selected ? (
          <article className={styles.card}>
            {selected.image ? <Plate src={selected.image} /> : null}
            <div>
              <h4>{selected.id}{selected.id === pickId ? " · Human pick" : ""}</h4>
              <p>Formal {selected.formal.toFixed(3)}</p>
              <p>Spatial {selected.spatial.toFixed(3)}</p>
              <p>Atmospheric {selected.atmospheric.toFixed(3)}</p>
              <p>{selected.pareto ? "Nondominated" : "Dominated"}{selected.diversity !== "none" ? " · Diversity" : ""}</p>
            </div>
          </article>
        ) : null}
      </div>
      <div className={styles.legend} aria-hidden="true">
        <span data-g="1">G1</span>
        <span data-g="2">G2</span>
        <span data-g="3">G3</span>
        <span data-g="4">G4</span>
        <span data-front="">Nondominated</span>
      </div>
      {status === "ready" ? null : <p>{status === "loading" ? "Loading stored scores." : "Stored scores could not be loaded."}</p>}
    </section>
  );
}
