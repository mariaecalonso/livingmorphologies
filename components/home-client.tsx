"use client";

import { useEffect, useState } from "react";
import styles from "@/components/home-client.module.css";
import {
  CLIENT_PROFILE,
  DESIGN_DISCIPLINES,
  OPERATIONS,
  ORGANIZATION,
  PRACTICE_AREAS,
  SPACE_PROGRAM,
} from "@/lib/client/ecologic-studio";

/** The classroom frame, so the field covers the whole client page. */
const FIELD = { width: 1920, height: 560 } as const;
const STEP = 54;
const ROW = STEP * (Math.sqrt(3) / 2);
const RADIUS = 20;
const NECK = 22;
const CHAMBER_SCALE = 1.6;
/** Kept dark behind the logo and the open section. */
const CLEARING = { x: FIELD.width / 2, y: FIELD.height / 2, rx: 230, ry: 130 } as const;

type Tone = "teal" | "copper" | "line";
type Node = { col: number; row: number };
type Cluster = { tone: Tone; nodes: Node[] };
type Point = { x: number; y: number };
type SectionId = "profile" | "disciplines" | "organization" | "operations" | "space-program";

/** Each category is one enlarged three-lobe cell from the pattern, with its title inside. */
const SECTIONS: readonly {
  id: SectionId;
  label: string;
  lines: readonly string[];
  x: number;
  y: number;
  tone: "teal" | "copper";
  flip?: boolean;
}[] = [
  { id: "profile", label: "Studio Profile", lines: ["Studio", "Profile"], x: 470, y: 150, tone: "teal" },
  { id: "disciplines", label: "Design + Research", lines: ["Design +", "Research"], x: 1450, y: 140, tone: "copper", flip: true },
  { id: "organization", label: "Organization + People", lines: ["Organization +", "People"], x: 1690, y: 310, tone: "teal" },
  { id: "operations", label: "Operations + Working Modes", lines: ["Operations +", "Working Modes"], x: 320, y: 400, tone: "copper", flip: true },
  { id: "space-program", label: "Spatial Requirements", lines: ["Spatial", "Requirements"], x: 1465, y: 430, tone: "teal", flip: true },
];

function chamberLobes(flip?: boolean): Point[] {
  const sign = flip ? -1 : 1;
  return [
    { x: -STEP / 2, y: (sign * ROW) / 3 },
    { x: STEP / 2, y: (sign * ROW) / 3 },
    { x: 0, y: (-sign * 2 * ROW) / 3 },
  ];
}

function openGround({ x, y }: Point) {
  const inClearing = ((x - CLEARING.x) / CLEARING.rx) ** 2 + ((y - CLEARING.y) / CLEARING.ry) ** 2 < 1;
  return !inClearing && SECTIONS.every((section) => Math.hypot(x - section.x, y - section.y) > 135);
}

function seeded(seed: number) {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function center({ col, row }: Node) {
  return { x: col * STEP + (row % 2 === 0 ? 0 : STEP / 2), y: row * ROW };
}

function neighbors({ col, row }: Node): Node[] {
  const shift = row % 2 === 0 ? -1 : 0;
  return [
    { col: col - 1, row },
    { col: col + 1, row },
    { col: col + shift, row: row - 1 },
    { col: col + shift + 1, row: row - 1 },
    { col: col + shift, row: row + 1 },
    { col: col + shift + 1, row: row + 1 },
  ];
}

/** Triangular lattice clusters of one to three nodes. Only nodes in the same cluster are bridged. */
function buildClusters(): Cluster[] {
  const random = seeded(17);
  const cols = Math.ceil(FIELD.width / STEP) + 1;
  const rows = Math.ceil(FIELD.height / ROW) + 1;
  const key = (node: Node) => `${node.col}:${node.row}`;
  const inField = (node: Node) => node.col >= -1 && node.col <= cols && node.row >= -1 && node.row <= rows;
  const taken = new Set<string>();
  const order: Node[] = [];
  for (let row = -1; row <= rows; row += 1) {
    for (let col = -1; col <= cols; col += 1) order.push({ col, row });
  }
  for (let index = order.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    [order[index], order[swap]] = [order[swap], order[index]];
  }
  const free = (node: Node, own: Set<string>) =>
    inField(node) && openGround(center(node)) && !own.has(key(node)) && !taken.has(key(node));
  const clusters: Cluster[] = [];
  for (const start of order) {
    if (random() < 0.22 || !free(start, new Set())) continue;
    const own = new Set([key(start)]);
    const nodes = [start];
    const size = random() < 0.3 ? 1 : random() < 0.55 ? 2 : 3;
    while (nodes.length < size) {
      const options = nodes.flatMap(neighbors).filter((node) => !own.has(key(node)) && free(node, own));
      if (options.length === 0) break;
      const next = options[Math.floor(random() * options.length)];
      own.add(key(next));
      nodes.push(next);
    }
    nodes.forEach((node) => taken.add(key(node)));
    const pick = random();
    clusters.push({ tone: pick < 0.42 ? "teal" : pick < 0.66 ? "copper" : "line", nodes });
  }
  return clusters;
}

const CLUSTERS = buildClusters();

function gridLines() {
  const lines: string[] = [];
  const reach = FIELD.width + FIELD.height * 2;
  for (let row = -1; row * ROW <= FIELD.height + ROW; row += 1) lines.push(`M-${STEP} ${row * ROW}H${FIELD.width + STEP}`);
  for (let offset = -reach; offset <= reach; offset += STEP) {
    const run = FIELD.height + ROW * 2;
    const dx = run / Math.sqrt(3);
    lines.push(`M${offset} ${-ROW}l${dx} ${run}`);
    lines.push(`M${offset} ${-ROW}l${-dx} ${run}`);
  }
  return lines.join("");
}

const GRID = gridLines();

function ShapeGeometry({ points, hit, grow = 0, fill = "#f4fffe" }: { points: Point[]; hit?: boolean; grow?: number; fill?: string }) {
  const near = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y) < STEP * 1.1;
  const closed = points.length === 3 && near(points[0], points[1]) && near(points[1], points[2]) && near(points[0], points[2]);
  const radius = hit ? RADIUS + 8 : RADIUS + grow;
  const neck = hit ? NECK + 12 : NECK + grow * 2;
  const paint = hit ? "transparent" : fill;
  return (
    <g fill={paint} stroke={paint} strokeWidth={neck} strokeLinecap="round">
      {points.map((point, index) => (
        <circle key={index} cx={point.x} cy={point.y} r={radius} />
      ))}
      {closed ? <polygon points={points.map((point) => `${point.x},${point.y}`).join(" ")} strokeWidth={neck} strokeLinejoin="round" /> : null}
      {points.flatMap((a, index) =>
        points.slice(index + 1).map((b, offset) =>
          near(a, b) ? <line key={`${index}-${offset}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} strokeWidth={neck} /> : null,
        ),
      )}
    </g>
  );
}

/** The homepage hero palette: a near-white core, the lit tone, and the tone it settles into. */
const PALETTE = {
  teal: { hot: "#e8feff", bright: "#3fd8e0", deep: "#0f7377" },
  copper: { hot: "#fff1e8", bright: "#ff7a45", deep: "#c77e5f" },
} as const;
type Hue = keyof typeof PALETTE;

/**
 * One shape read as a tensioned sheet. Light runs from `from` (lit, near-white edge) to `to` (dim, other tone).
 * `layers` are inner copies of the silhouette, shifted toward the lit side, so a second sheet shows through.
 */
type Sheet = { id: string; hue: Hue; strength: number; from: Point; to: Point; layers: string[] };

function sheet(id: string, points: Point[], hue: Hue, strength: number, layers: number, random: () => number): Sheet {
  const c = { x: points.reduce((sum, p) => sum + p.x, 0) / points.length, y: points.reduce((sum, p) => sum + p.y, 0) / points.length };
  const reach = Math.max(...points.map((p) => Math.hypot(p.x - c.x, p.y - c.y))) + RADIUS;
  const angle = random() * Math.PI * 2;
  const d = { x: Math.cos(angle) * reach, y: Math.sin(angle) * reach };
  const transforms = Array.from({ length: layers }, (_, index) => {
    const scale = index === 0 ? 0.74 : 0.52;
    const toward = angle + Math.PI + (random() - 0.5) * 1.4;
    const shift = RADIUS * (index === 0 ? 0.22 : 0.3);
    return `translate(${(c.x + Math.cos(toward) * shift).toFixed(1)} ${(c.y + Math.sin(toward) * shift).toFixed(1)}) scale(${scale}) translate(${(-c.x).toFixed(1)} ${(-c.y).toFixed(1)})`;
  });
  return { id, hue, strength, from: { x: c.x - d.x, y: c.y - d.y }, to: { x: c.x + d.x, y: c.y + d.y }, layers: transforms };
}

function SheetGradients({ sheet: s }: { sheet: Sheet }) {
  const own = PALETTE[s.hue];
  const other = PALETTE[s.hue === "teal" ? "copper" : "teal"];
  const line = { gradientUnits: "userSpaceOnUse", x1: s.from.x, y1: s.from.y, x2: s.to.x, y2: s.to.y } as const;
  return (
    <>
      <linearGradient id={`${s.id}-soft`} {...line}>
        <stop offset="0.1" stopColor={own.bright} stopOpacity={s.strength} />
        <stop offset="0.45" stopColor={own.deep} stopOpacity={s.strength * 0.5} />
        <stop offset="0.75" stopColor={other.bright} stopOpacity={s.strength * 0.12} />
        <stop offset="1" stopColor={other.deep} stopOpacity={s.strength * 0.03} />
      </linearGradient>
      <linearGradient id={`${s.id}-line`} {...line}>
        <stop offset="0.14" stopColor={own.hot} stopOpacity={s.strength} />
        <stop offset="0.32" stopColor={own.bright} stopOpacity={s.strength * 0.9} />
        <stop offset="0.6" stopColor={own.bright} stopOpacity={s.strength * 0.3} />
        <stop offset="0.85" stopColor={other.bright} stopOpacity={s.strength * 0.08} />
        <stop offset="1" stopColor={other.deep} stopOpacity="0" />
      </linearGradient>
    </>
  );
}

/** Luminance for a sheet mask: the silhouette in white, read through `filter`. Inner layers only add soft light, never a line. */
function SheetMaskShapes({ items, filter }: { items: { points: Point[]; sheet: Sheet }[]; filter: string }) {
  return (
    <>
      <g filter={`url(#${filter})`}>
        {items.map((item) => (
          <ShapeGeometry key={item.sheet.id} points={item.points} fill="#ffffff" />
        ))}
      </g>
      {filter === "eco-sheet-soft" ? (
        <g filter={`url(#${filter})`} opacity="0.4">
          {items.flatMap((item) =>
            item.sheet.layers.map((transform) => (
              <g key={`${item.sheet.id}-${transform}`} transform={transform}>
                <ShapeGeometry points={item.points} fill="#ffffff" />
              </g>
            )),
          )}
        </g>
      ) : null}
    </>
  );
}

/** Colour for each sheet, slightly larger than its silhouette so the mask alone sets the edge. */
function SheetPaint({ items, layer }: { items: { points: Point[]; sheet: Sheet }[]; layer: "soft" | "line" }) {
  return (
    <>
      {items.map((item) => (
        <ShapeGeometry key={item.sheet.id} points={item.points} grow={4} fill={`url(#${item.sheet.id}-${layer})`} />
      ))}
    </>
  );
}

/** Filters shared by the field and the chambers. They read white geometry and return a sheet's light. */
function SheetFilters() {
  const solid = (
    <>
      <feGaussianBlur in="SourceGraphic" stdDeviation="5" />
      <feColorMatrix values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 28 -13" result="solid" />
    </>
  );
  return (
    <>
      <filter id="eco-sheet-soft" x="-15%" y="-15%" width="130%" height="130%" colorInterpolationFilters="sRGB">
        {solid}
        <feGaussianBlur in="solid" stdDeviation="3.4" result="spread" />
        <feComposite in="solid" in2="spread" operator="out" result="rim" />
        <feGaussianBlur in="solid" stdDeviation="4.5" result="mass" />
        <feComposite in="rim" in2="mass" operator="arithmetic" k1="1.6" k2="0.5" result="tension" />
        <feComponentTransfer in="tension" result="edge">
          <feFuncA type="linear" slope="1.4" />
        </feComponentTransfer>
        <feComponentTransfer in="solid" result="body">
          <feFuncA type="linear" slope="0.045" />
        </feComponentTransfer>
        <feMerge>
          <feMergeNode in="body" />
          <feMergeNode in="edge" />
        </feMerge>
      </filter>
      <filter id="eco-sheet-line" x="-15%" y="-15%" width="130%" height="130%" colorInterpolationFilters="sRGB">
        {solid}
        <feMorphology in="solid" operator="erode" radius="1" result="core" />
        <feComposite in="solid" in2="core" operator="out" />
        <feGaussianBlur stdDeviation="0.35" />
      </filter>
      <filter id="eco-sheet-bloom" x="-25%" y="-25%" width="150%" height="150%" colorInterpolationFilters="sRGB">
        <feGaussianBlur in="SourceGraphic" stdDeviation="2" />
        <feComponentTransfer result="glow">
          <feFuncA type="linear" slope="0.6" />
        </feComponentTransfer>
        <feMerge>
          <feMergeNode in="glow" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
    </>
  );
}

const FIELD_SHEETS = CLUSTERS.map((cluster, index) => {
  const random = seeded(3000 + index);
  const points = cluster.nodes.map(center);
  const hue: Hue = cluster.tone === "line" ? (random() < 0.5 ? "teal" : "copper") : cluster.tone;
  const lit = cluster.tone !== "line" && random() < 0.42;
  const strength = lit ? 0.6 + random() * 0.4 : 0.12 + random() * 0.12;
  const layers = points.length === 1 ? 0 : points.length === 2 ? (random() < 0.5 ? 1 : 0) : 1;
  return { points, sheet: sheet(`eco-sheet-${index}`, points, hue, strength, layers, random) };
});

const CHAMBER_SHEETS = Object.fromEntries(
  SECTIONS.map((section, index) => {
    const points = chamberLobes(section.flip);
    return [section.id, { points, sheet: sheet(`eco-chamber-sheet-${section.id}`, points, section.tone, 1, 2, seeded(4000 + index)) }];
  }),
) as Record<SectionId, { points: Point[]; sheet: Sheet }>;

function StudioPattern() {
  const field = { maskUnits: "userSpaceOnUse", x: 0, y: 0, width: FIELD.width, height: FIELD.height } as const;
  return (
    <svg className={styles.pattern} viewBox={`0 0 ${FIELD.width} ${FIELD.height}`} preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs>
        <radialGradient id="eco-edge" cx="0.5" cy="0.5" r="0.62">
          <stop offset="0.5" stopColor="#ffffff" />
          <stop offset="0.82" stopColor="#8c8c8c" />
          <stop offset="1" stopColor="#000000" />
        </radialGradient>
        <radialGradient id="eco-clear" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#000000" stopOpacity="1" />
          <stop offset="0.55" stopColor="#000000" stopOpacity="0.75" />
          <stop offset="1" stopColor="#000000" stopOpacity="0" />
        </radialGradient>
        <mask id="eco-fade" maskUnits="userSpaceOnUse" x="0" y="0" width={FIELD.width} height={FIELD.height}>
          <rect width={FIELD.width} height={FIELD.height} fill="url(#eco-edge)" />
          <ellipse cx={CLEARING.x} cy={CLEARING.y} rx={CLEARING.rx * 2.4} ry={CLEARING.ry * 2.1} fill="url(#eco-clear)" />
        </mask>
        <SheetFilters />
        {FIELD_SHEETS.map((item) => (
          <SheetGradients key={item.sheet.id} sheet={item.sheet} />
        ))}
        <mask id="eco-field-soft" {...field}>
          <SheetMaskShapes items={FIELD_SHEETS} filter="eco-sheet-soft" />
        </mask>
        <mask id="eco-field-line" {...field}>
          <SheetMaskShapes items={FIELD_SHEETS} filter="eco-sheet-line" />
        </mask>
      </defs>
      <g mask="url(#eco-fade)">
        <path className={styles.grid} d={GRID} />
        <g filter="url(#eco-sheet-bloom)">
          <g mask="url(#eco-field-soft)">
            <SheetPaint items={FIELD_SHEETS} layer="soft" />
          </g>
          <g mask="url(#eco-field-line)">
            <SheetPaint items={FIELD_SHEETS} layer="line" />
          </g>
        </g>
      </g>
    </svg>
  );
}

function PatternNav({
  open,
  lit,
  onSelect,
  onLight,
}: {
  open: SectionId | null;
  lit: SectionId | null;
  onSelect: (id: SectionId) => void;
  onLight: (id: SectionId | null) => void;
}) {
  const choose = (id: SectionId) => onSelect(id);
  return (
    <svg
      className={styles.nav}
      viewBox={`0 0 ${FIELD.width} ${FIELD.height}`}
      preserveAspectRatio="xMidYMid slice"
      role="navigation"
      aria-label="ecoLogicStudio sections"
    >
      <defs>
        <radialGradient id="eco-label-hole" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#000000" stopOpacity="0.92" />
          <stop offset="0.6" stopColor="#000000" stopOpacity="0.7" />
          <stop offset="1" stopColor="#000000" stopOpacity="0" />
        </radialGradient>
        {SECTIONS.flatMap((section) => {
          const item = CHAMBER_SHEETS[section.id];
          const place = `translate(${section.x} ${section.y}) scale(${CHAMBER_SCALE})`;
          return [
            <SheetGradients key={`${section.id}-gradients`} sheet={item.sheet} />,
            ...(["soft", "line"] as const).map((layer) => (
              <mask
                key={`${section.id}-${layer}`}
                id={`${item.sheet.id}-${layer}-mask`}
                maskUnits="userSpaceOnUse"
                x="0"
                y="0"
                width={FIELD.width}
                height={FIELD.height}
              >
                <g transform={place}>
                  <SheetMaskShapes items={[item]} filter={`eco-sheet-${layer}`} />
                </g>
                <ellipse cx={section.x} cy={section.y} rx="78" ry="36" fill="url(#eco-label-hole)" />
              </mask>
            )),
          ];
        })}
      </defs>
      {SECTIONS.map((section) => {
        const selected = open === section.id;
        const active = selected || lit === section.id;
        const lobes = chamberLobes(section.flip);
        return (
          <g
            key={section.id}
            className={styles.hot}
            data-open={active || undefined}
            role="button"
            tabIndex={0}
            aria-label={section.label}
            aria-pressed={selected}
            aria-controls="client-section"
            onClick={() => choose(section.id)}
            onMouseEnter={() => onLight(section.id)}
            onMouseLeave={() => onLight(null)}
            onFocus={() => onLight(section.id)}
            onBlur={() => onLight(null)}
            onKeyDown={(event) => {
              if (event.key !== "Enter" && event.key !== " ") return;
              event.preventDefault();
              choose(section.id);
            }}
          >
            <g className={styles.membrane} filter="url(#eco-sheet-bloom)">
              {(["soft", "line"] as const).map((layer) => (
                <g key={layer} mask={`url(#${CHAMBER_SHEETS[section.id].sheet.id}-${layer}-mask)`}>
                  <g transform={`translate(${section.x} ${section.y}) scale(${CHAMBER_SCALE})`}>
                    <SheetPaint items={[CHAMBER_SHEETS[section.id]]} layer={layer} />
                  </g>
                </g>
              ))}
            </g>
            <g transform={`translate(${section.x} ${section.y}) scale(${CHAMBER_SCALE})`}>
              <ShapeGeometry points={lobes} hit />
            </g>
            <text className={styles.chamberLabel} x={section.x} y={section.y} aria-hidden="true">
              {section.lines.map((line, index) => (
                <tspan key={line} x={section.x} dy={index === 0 ? `${-(section.lines.length - 1) * 0.6 + 0.35}em` : "1.2em"}>
                  {line}
                </tspan>
              ))}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function ClientSection({ id }: { id: SectionId }) {
  if (id === "profile") {
    return (
      <>
        <p className={styles.claim}>Documented company</p>
        <h3>{CLIENT_PROFILE.name}</h3>
        <p>
          Founded in {CLIENT_PROFILE.founded.city} in {CLIENT_PROFILE.founded.year} by {CLIENT_PROFILE.cofounders.join(" and ")}.
        </p>
        <p>{CLIENT_PROFILE.summary}</p>
        <div className={styles.split}>
          <div>
            <h4>Expertise</h4>
            <ul>
              {CLIENT_PROFILE.expertise.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
          <div>
            <h4>Work</h4>
            <ul>
              {CLIENT_PROFILE.work.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        </div>
        <p className={styles.source}>{CLIENT_PROFILE.sources[0]?.label}</p>
      </>
    );
  }
  if (id === "disciplines") {
    return (
      <>
        <p className={styles.claim}>Proposed practice areas</p>
        <h3>Design + Research</h3>
        <p>{DESIGN_DISCIPLINES.note}</p>
        <ul className={styles.rows}>
          {PRACTICE_AREAS.map((area) => (
            <li key={area.id}>{area.label}</li>
          ))}
        </ul>
      </>
    );
  }
  if (id === "organization") {
    return (
      <>
        <p className={styles.claim}>Documented roster</p>
        <h3>Organization + People</h3>
        <p>{ORGANIZATION.verification}</p>
        <div className={styles.split}>
          <div>
            <h4>Directors</h4>
            <ul>
              {ORGANIZATION.directors.map((name) => (
                <li key={name}>{name}</li>
              ))}
            </ul>
            <h4>Office manager</h4>
            <ul>
              <li>{ORGANIZATION.officeManager}</li>
            </ul>
          </div>
          <div>
            <h4>{ORGANIZATION.team.name}</h4>
            <ul>
              {ORGANIZATION.team.members.map((name) => (
                <li key={name}>{name}</li>
              ))}
            </ul>
          </div>
        </div>
        <p className={styles.source}>Named staff. Not the proposed professional categories for the Miami hub.</p>
      </>
    );
  }
  if (id === "operations") {
    return (
      <>
        <p className={styles.claim}>Proposed for Miami</p>
        <h3>Operations + Working Modes</h3>
        <p>{OPERATIONS.note}</p>
        <ul className={styles.modes}>
          {OPERATIONS.modes.map((mode) => (
            <li key={mode.id}>
              <b>{mode.label}</b>
              <span>{mode.activities.join(", ")}</span>
            </li>
          ))}
        </ul>
        <h4>{SPACE_PROGRAM.workLeisure.label}</h4>
        <p>{SPACE_PROGRAM.workLeisure.summary}</p>
      </>
    );
  }
  return (
    <>
      <p className={styles.claim}>Proposed for Miami</p>
      <h3>Spatial Requirements</h3>
      <p>
        {SPACE_PROGRAM.building.name}, {SPACE_PROGRAM.building.site}. {SPACE_PROGRAM.project} is the architectural project.
      </p>
      <div className={styles.split}>
        <div>
          <h4>Proposed categories</h4>
          <ul>
            {SPACE_PROGRAM.whoWorksHere.categories.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          <p className={styles.source}>{SPACE_PROGRAM.whoWorksHere.note}</p>
        </div>
        <div>
          <h4>Daytime access</h4>
          <ul>
            {SPACE_PROGRAM.scenarios.daytime.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          <h4>Evening access</h4>
          <ul>
            {SPACE_PROGRAM.scenarios.evening.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      </div>
      <p className={styles.source}>
        {SPACE_PROGRAM.capacity.daytimeOccupants} daytime occupants, {SPACE_PROGRAM.capacity.eventAttendees} event attendees. {SPACE_PROGRAM.capacity.shortNote}.
      </p>
    </>
  );
}

/** ecoLogicStudio. The previous client page is stored in `components/stored/home-client.tsx`. */
export function HomeClient() {
  const [open, setOpen] = useState<SectionId | null>(null);
  const [shown, setShown] = useState<SectionId | null>(null);
  const [lit, setLit] = useState<SectionId | null>(null);

  const toggle = (id: SectionId) => {
    setOpen((current) => (current === id ? null : id));
    setShown(id);
  };

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if ((event.target as Element).closest(`.${styles.hot}`)) return;
      setOpen(null);
      setLit(null);
    };
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [open]);

  return (
    <div className={styles.page} data-open={open ? "true" : "false"}>
      <div className={styles.field}>
        <StudioPattern />
        <PatternNav open={open} lit={lit} onSelect={toggle} onLight={setLit} />
      </div>
      <div className={styles.stage} data-open={open ? "true" : "false"}>
        <h2 className={styles.title}>
          <img className={styles.logo} src={CLIENT_PROFILE.logo.src} alt={CLIENT_PROFILE.logo.alt} draggable={false} />
        </h2>
        <div
          className={styles.panel}
          id="client-section"
          role="region"
          aria-label={shown ? SECTIONS.find((section) => section.id === shown)?.label : undefined}
          data-open={open ? "true" : "false"}
        >
          {shown ? (
            <div className={styles.sheet} key={shown}>
              <ClientSection id={shown} />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
