"use client";

import { useEffect, useState } from "react";

/** Secondary network. Coordinates are percentages of the overview, clear of the eight-stage route. */

type Point = { x: number; y: number };

/** The optimization loop draws in board pixels: 1px stroke, 2px dash, 4px gap. */
function vertices(d: string, w: number, h: number): Point[] {
  const sx = w / 100;
  const sy = h / 100;
  const tokens = d.trim().split(/\s+/);
  let cmd = "";
  let x = 0;
  let y = 0;
  let pair = 0;
  const pts: Point[] = [];
  for (const token of tokens) {
    if (/^[MLHV]$/.test(token)) {
      cmd = token;
      pair = 0;
      continue;
    }
    const n = Number(token);
    if (cmd === "H") {
      x = n * sx;
      pts.push({ x, y });
    } else if (cmd === "V") {
      y = n * sy;
      pts.push({ x, y });
    } else if (pair % 2 === 0) {
      x = n * sx;
      pair += 1;
    } else {
      y = n * sy;
      pair += 1;
      pts.push({ x, y });
    }
  }
  return pts;
}

function scalePath(d: string, w: number, h: number) {
  const sx = w / 100;
  const sy = h / 100;
  const tokens = d.trim().split(/\s+/);
  let cmd = "";
  let pair = 0;
  return tokens
    .map((token) => {
      if (/^[MLHV]$/.test(token)) {
        cmd = token;
        pair = 0;
        return token;
      }
      const n = Number(token);
      if (cmd === "H") return (n * sx).toFixed(2);
      if (cmd === "V") return (n * sy).toFixed(2);
      const value = pair % 2 === 0 ? n * sx : n * sy;
      pair += 1;
      return value.toFixed(2);
    })
    .join(" ");
}

const LINES = [
  { d: "M 7.5 9.6 V 8.4", tone: "copper", rank: "local", head: true },
  { d: "M 7.5 20.4 V 18.6", tone: "copper", rank: "local", head: true },
  { d: "M 7.5 31.2 V 29.4", tone: "copper", rank: "local", head: true },
  { d: "M 2.65 50.94 H 0.7 V 4.5 H 1.6", tone: "copper", rank: "major", head: true },
  { d: "M 13.4 4.5 H 19.6 V 12.5 H 29 V 15", tone: "copper", rank: "depend", head: true },
  { d: "M 31.8 15 V 11.2", tone: "copper", rank: "local", head: true },
  { d: "M 31.8 22.2 V 28", tone: "copper", rank: "local", head: true },
  { d: "M 38.1 6.05 H 39.22", tone: "teal", rank: "depend", head: false },
  { d: "M 38.66 6.05 V 71.2", tone: "teal", rank: "depend", head: false },
  { d: "M 35.69 71.2 H 40.12", tone: "teal", rank: "depend", head: false },
  { d: "M 13.4 4.5 H 13.65 V 41.3 H 48.7 V 34.1 H 51.25", tone: "copper", rank: "inform", head: true },
  { d: "M 43.62 11.8 V 15.4", tone: "copper", rank: "major", head: true },
  { d: "M 43.62 25.2 V 25.9", tone: "teal", rank: "local", head: true },
  { d: "M 43.62 29.7 V 30.4", tone: "copper", rank: "local", head: true },
  { d: "M 43.62 34.2 V 34.9", tone: "copper", rank: "local", head: true },
  { d: "M 46.72 36.8 H 48.0 V 23.3 H 46.72", tone: "teal", rank: "loop", head: true },
  { d: "M 43.62 40.2 V 43.25", tone: "copper", rank: "major", head: true },
  { d: "M 43.62 54.01 V 68", tone: "copper", rank: "major", head: true },
  { d: "M 24.06 33.7 H 26.1", tone: "teal", rank: "major", head: true },
  { d: "M 19.66 39.4 V 43.63", tone: "teal", rank: "major", head: true },
  { d: "M 31.79 39.4 V 45.94", tone: "teal", rank: "major", head: true },
  { d: "M 31.79 56.71 V 68", tone: "teal", rank: "major", head: true },
  { d: "M 43.62 74.4 V 82.7 H 45.44", tone: "copper", rank: "depend", head: true },
  { d: "M 54.24 82.7 H 56.05 V 74.4", tone: "teal", rank: "depend", head: true },
  { d: "M 54.24 82.7 H 62.2 V 27.9 H 60.85", tone: "teal", rank: "depend", head: false },
  { d: "M 56.05 9.2 V 10.2", tone: "teal", rank: "local", head: true },
  { d: "M 56.05 24.2 V 25.2", tone: "teal", rank: "local", head: true },
  { d: "M 56.05 30.6 V 31.4", tone: "teal", rank: "local", head: true },
  { d: "M 56.05 36.8 V 37.6", tone: "copper", rank: "local", head: true },
  { d: "M 56.05 43.0 V 45.85", tone: "teal", rank: "drop", head: true },
  { d: "M 56.05 56.71 V 68", tone: "teal", rank: "major", head: true },
  { d: "M 68.0 9.6 V 10.4", tone: "white", rank: "local", head: true },
  { d: "M 68.0 15.2 V 15.9", tone: "white", rank: "local", head: true },
  { d: "M 68.0 20.7 V 21.4", tone: "white", rank: "local", head: true },
  { d: "M 68.0 26.2 V 26.9", tone: "white", rank: "local", head: true },
  { d: "M 72.5 9.6 V 33.1 H 68.52 V 43.63", tone: "white", rank: "drop", head: true },
  { d: "M 79.9 9.6 V 10.4", tone: "white", rank: "local", head: true },
  { d: "M 79.9 18.8 V 19.4", tone: "white", rank: "local", head: true },
  { d: "M 84.4 9.6 V 24.6 H 80.3 V 45.94", tone: "white", rank: "drop", head: true },
  { d: "M 92.45 22.8 V 23.9", tone: "teal", rank: "local", head: true },
  { d: "M 92.45 28.9 V 29.8", tone: "white", rank: "local", head: true },
  { d: "M 92.45 35.6 V 36.5", tone: "copper", rank: "local", head: true },
  { d: "M 92.45 41.5 V 43.46", tone: "teal", rank: "drop", head: true },
  { d: "M 92.45 54.4 V 66.8", tone: "teal", rank: "major", head: true },
  { d: "M 60.25 71.2 H 87.25", tone: "white", rank: "depend", head: true },
  { d: "M 85.8 8.6 H 87.9", tone: "white", rank: "depend", head: true },
  { d: "M 97 8.6 H 98.6 V 71.2 H 97.65", tone: "white", rank: "loop", head: true },
  { d: "M 7.53 56.32 V 66.8", tone: "white", rank: "depend", head: false },
  { d: "M 19.66 54.4 V 66.8", tone: "white", rank: "depend", head: false },
] as const;

export function WorkflowBands() {
  const [size, setSize] = useState({ w: 1741, h: 490 });
  useEffect(() => {
    const svg = document.querySelector<SVGSVGElement>(".wf-relations-lines");
    if (!svg) return;
    const read = () => {
      const w = svg.clientWidth;
      const h = svg.clientHeight;
      if (w < 2 || h < 2) return;
      setSize((prev) => (prev.w === w && prev.h === h ? prev : { w, h }));
    };
    read();
    const resize = new ResizeObserver(read);
    resize.observe(svg);
    return () => resize.disconnect();
  }, []);

  return (
    <div className="wf-band wf-relations" aria-hidden="true">
      <svg className="wf-relations-lines" viewBox={`0 0 ${size.w} ${size.h}`} preserveAspectRatio="none">
        <defs>
          <marker id="wf-rel-cu" markerUnits="strokeWidth" markerWidth="4.2" markerHeight="4.2" refX="3.6" refY="2.1" orient="auto">
            <path d="M0,0.35 L4.2,2.1 L0,3.85 Z" fill="#c77e5f" />
          </marker>
          <marker id="wf-rel-te" markerUnits="strokeWidth" markerWidth="4.2" markerHeight="4.2" refX="3.6" refY="2.1" orient="auto">
            <path d="M0,0.35 L4.2,2.1 L0,3.85 Z" fill="#49d7de" />
          </marker>
          <marker id="wf-rel-wh" markerUnits="strokeWidth" markerWidth="4.2" markerHeight="4.2" refX="3.6" refY="2.1" orient="auto">
            <path d="M0,0.35 L4.2,2.1 L0,3.85 Z" fill="rgba(255,255,255,0.78)" />
          </marker>
        </defs>
        {LINES.map((line) => {
          const dashed = line.rank === "depend" || line.rank === "loop" || line.rank === "inform";
          const pts = vertices(line.d, size.w, size.h);
          return (
            <g key={line.d}>
              <path
                className={`is-${line.tone} is-${line.rank}`}
                d={scalePath(line.d, size.w, size.h)}
                markerEnd={
                  line.head && (!dashed || line.rank === "inform")
                    ? line.tone === "copper"
                      ? "url(#wf-rel-cu)"
                      : line.tone === "teal"
                        ? "url(#wf-rel-te)"
                        : "url(#wf-rel-wh)"
                    : undefined
                }
              />
              {dashed
                ? pts.slice(0, -1).map((dot) => (
                    <circle key={`${dot.x}-${dot.y}`} className={`is-${line.tone} is-dash-dot`} cx={dot.x} cy={dot.y} r={2.4} />
                  ))
                : null}
            </g>
          );
        })}
      </svg>

      <section className="wf-rel-source is-input" data-tone="copper" style={{ left: "1.6%", top: "0.6%", width: "11.8%", height: "7.8%" }}>
        <span className="wf-rel-index">01</span>
        <span className="wf-rel-title">Architectural Input</span>
        <p className="wf-rel-anno">9 Criteria + 3 Descriptors per Archetype</p>
      </section>
      <section className="wf-rel-source is-child" data-tone="copper" style={{ left: "2.4%", top: "9.6%", width: "10.2%", height: "9%" }}>
        <span className="wf-rel-title">Formal / Geometrical</span>
        <p className="wf-rel-anno">
          Complexity, Proportionality, and one typology-specific criterion <span className="wf-rel-arrow">→</span> Formal Descriptor.
        </p>
      </section>
      <section className="wf-rel-source is-child" data-tone="copper" style={{ left: "2.4%", top: "20.4%", width: "10.2%", height: "9%" }}>
        <span className="wf-rel-title">Organizational / Spatial</span>
        <p className="wf-rel-anno">
          Openness, Connectivity, and one typology-specific criterion <span className="wf-rel-arrow">→</span> Spatial Descriptor.
        </p>
      </section>
      <section className="wf-rel-source is-child" data-tone="copper" style={{ left: "2.4%", top: "31.2%", width: "10.2%", height: "9%" }}>
        <span className="wf-rel-title">Experiential / Atmospheric</span>
        <p className="wf-rel-anno">
          Immersive, Visibility, and one typology-specific criterion <span className="wf-rel-arrow">→</span> Atmospheric Descriptor.
        </p>
      </section>

      <section className="wf-rel-source" data-tone="teal" style={{ left: "15.26%", top: "28%", width: "8.8%", height: "11.4%" }}>
        <span className="wf-rel-index">02</span>
        <span className="wf-rel-title">Comparative Overview</span>
        <p className="wf-rel-anno">
          Cellular Automata, Wave Function Collapse, and <span className="wf-rel-mark">Stigmergy</span>
        </p>
      </section>
      <section className="wf-rel-source" data-tone="teal" style={{ left: "25.5%", top: "0.6%", width: "12.6%", height: "10.6%" }}>
        <span className="wf-rel-title">Generation</span>
        <p className="wf-rel-anno">Biological Behaviour-Based Iteration Process</p>
      </section>
      <section className="wf-rel-group is-rules" style={{ left: "25.8%", top: "15%", width: "12%", height: "7.2%" }}>
        <p className="wf-rel-rules">
          <span>Criteria <span className="wf-rel-arrow">→</span> Growth Instinct</span>
          <span>Descriptors <span className="wf-rel-arrow">→</span> Spatial Recipe</span>
        </p>
      </section>
      <section className="wf-rel-source" data-tone="teal" style={{ left: "26.1%", top: "28%", width: "11.4%", height: "11.4%" }}>
        <span className="wf-rel-index">03</span>
        <span className="wf-rel-title">Biological Behaviour Research</span>
        <p className="wf-rel-anno">Physarum polycephalum translating logic</p>
      </section>

      <section className="wf-rel-source" data-tone="copper" style={{ left: "39.22%", top: "0.6%", width: "8.8%", height: "11.2%" }}>
        <span className="wf-rel-index">04</span>
        <span className="wf-rel-title">Objective Evaluation</span>
        <p className="wf-rel-anno">Each plate, read against the criteria.</p>
      </section>
      <section className="wf-rel-group is-loop-group" style={{ left: "40.02%", top: "15.4%", width: "7.2%", height: "24.8%" }}>
        <span className="wf-rel-group-title">Optimization Loop</span>
        <p className="wf-rel-anno">Runs Four Times.</p>
      </section>
      <section className="wf-rel-source is-child" data-tone="teal" style={{ left: "40.52%", top: "21.4%", width: "6.2%", height: "3.8%" }}>
        <span className="wf-rel-title">Population</span>
      </section>
      <section className="wf-rel-source is-child" data-tone="copper" style={{ left: "40.52%", top: "25.9%", width: "6.2%", height: "3.8%" }}>
        <span className="wf-rel-title">Evaluation</span>
      </section>
      <section className="wf-rel-source is-child" data-tone="copper" style={{ left: "40.52%", top: "30.4%", width: "6.2%", height: "3.8%" }}>
        <span className="wf-rel-title">Pareto</span>
      </section>
      <section className="wf-rel-source is-child" data-tone="teal" style={{ left: "40.52%", top: "34.9%", width: "6.2%", height: "3.8%" }}>
        <span className="wf-rel-title">Next Generation</span>
      </section>

      <section className="wf-rel-group" style={{ left: "62.8%", top: "0.6%", width: "23%", height: "32%" }}>
        <span className="wf-rel-group-title">Design Context</span>
      </section>
      <section className="wf-rel-source is-context" data-tone="white" style={{ left: "63.8%", top: "4.4%", width: "9.4%", height: "5.2%" }}>
        <span className="wf-rel-index">06</span>
        <span className="wf-rel-title">Living Morphology Studio</span>
      </section>
      <section className="wf-rel-source is-child is-rule" data-tone="white" style={{ left: "64.2%", top: "10.4%", width: "7.6%", height: "4.8%" }}>
        <span className="wf-rel-title">Design focus</span>
        <p className="wf-rel-anno">Physarum</p>
      </section>
      <section className="wf-rel-source is-child is-rule" data-tone="white" style={{ left: "64.2%", top: "15.9%", width: "7.6%", height: "4.8%" }}>
        <span className="wf-rel-title">Disciplines</span>
        <p className="wf-rel-anno">Fashion, furniture</p>
      </section>
      <section className="wf-rel-source is-child is-rule" data-tone="white" style={{ left: "64.2%", top: "21.4%", width: "7.6%", height: "4.8%" }}>
        <span className="wf-rel-title">Character</span>
        <p className="wf-rel-anno">Work + leisure</p>
      </section>
      <section className="wf-rel-source is-child is-rule" data-tone="white" style={{ left: "64.2%", top: "26.9%", width: "7.6%", height: "4.8%" }}>
        <span className="wf-rel-title">Program</span>
        <p className="wf-rel-anno">Workspace, lobby, gathering</p>
      </section>
      <section className="wf-rel-source is-context" data-tone="white" style={{ left: "75.6%", top: "4.4%", width: "9.4%", height: "5.2%" }}>
        <span className="wf-rel-index">07</span>
        <span className="wf-rel-title">1 Herald Plaza, Miami</span>
      </section>
      <section className="wf-rel-source is-child is-rule" data-tone="white" style={{ left: "76.1%", top: "10.4%", width: "7.6%", height: "8.4%" }}>
        <span className="wf-rel-title">Site extent</span>
        <p className="wf-rel-anno">Brief 330 × 820 ft, 270,600 sq ft.</p>
        <p className="wf-rel-anno">Parcel 331 × 830 ft, lot 246,390 sq ft.</p>
      </section>
      <section className="wf-rel-source is-child is-rule" data-tone="white" style={{ left: "76.1%", top: "19.4%", width: "7.6%", height: "4.6%" }}>
        <span className="wf-rel-title">Waterfront</span>
        <p className="wf-rel-anno">West edge on the coastline.</p>
      </section>
      <section className="wf-rel-source is-op is-assembly" data-tone="white" style={{ left: "87.9%", top: "5.3%", width: "9.1%", height: "6.6%" }}>
        <span className="wf-rel-title">Assembly Refinement</span>
      </section>

      <section className="wf-rel-source" data-tone="teal" style={{ left: "49.95%", top: "0.6%", width: "12.2%", height: "8.6%" }}>
        <span className="wf-rel-title">Vertical Growth</span>
        <p className="wf-rel-anno">Inherited Physarum Behaviour</p>
      </section>
      <section className="wf-rel-group is-process" style={{ left: "49.95%", top: "10.2%", width: "12.2%", height: "14%" }}>
        <span className="wf-rel-group-title">Archetype Generation Process</span>
        <div className="wf-rel-runs">
          <span>Formal</span><span>3</span>
          <span>Formal + Spatial</span><span>3</span>
          <span>Spatial</span><span>3</span>
          <span>Formal + Atmospheric</span><span>3</span>
          <span>Atmospheric</span><span>3</span>
          <span>Spatial + Atmospheric</span><span>3</span>
          <span className="is-wide">Formal + Spatial + Atmospheric</span><span>6</span>
          <span className="is-total">24 runs per archetype</span>
        </div>
      </section>
      <section className="wf-rel-source is-child is-step" data-tone="teal" style={{ left: "51.25%", top: "25.2%", width: "9.6%", height: "5.4%" }}>
        <span className="wf-rel-index">01</span>
        <span className="wf-rel-title">Slice Evolution</span>
      </section>
      <section className="wf-rel-source is-child is-step" data-tone="copper" style={{ left: "51.25%", top: "31.4%", width: "9.6%", height: "5.4%" }}>
        <span className="wf-rel-index">02</span>
        <span className="wf-rel-title">Slice Selection</span>
      </section>
      <section className="wf-rel-source is-child is-step" data-tone="teal" style={{ left: "51.25%", top: "37.6%", width: "9.6%", height: "5.4%" }}>
        <span className="wf-rel-index">03</span>
        <span className="wf-rel-title">Volumetric Reconstruction</span>
      </section>

      <section className="wf-rel-source" data-tone="teal" style={{ left: "87.25%", top: "13.4%", width: "10.4%", height: "9.4%" }}>
        <span className="wf-rel-title">Hybrid Generation</span>
        <p className="wf-rel-anno">Physarum-Based Transitional Connection</p>
      </section>
      <section className="wf-rel-source is-child" data-tone="white" style={{ left: "87.95%", top: "23.9%", width: "9%", height: "5%" }}>
        <span className="wf-rel-title">Face Sampling</span>
      </section>
      <section className="wf-rel-source is-child" data-tone="copper" style={{ left: "87.95%", top: "29.8%", width: "9%", height: "5.8%" }}>
        <span className="wf-rel-title">5 × 5 Candidate Field</span>
      </section>
      <section className="wf-rel-source is-child" data-tone="teal" style={{ left: "87.95%", top: "36.5%", width: "9%", height: "5%" }}>
        <span className="wf-rel-title">Connector Growth</span>
      </section>

      <section className="wf-rel-source is-op" data-tone="teal" style={{ left: "27.89%", top: "68%", width: "7.8%", height: "6.4%" }}>
        <span className="wf-rel-index">03–04</span>
        <span className="wf-rel-title">2D Iteration Catalog</span>
      </section>
      <section className="wf-rel-source is-op" data-tone="copper" style={{ left: "40.12%", top: "68%", width: "7%", height: "6.4%" }}>
        <span className="wf-rel-index">04</span>
        <span className="wf-rel-title">2D Final Catalog</span>
      </section>
      <section className="wf-rel-source is-child is-decision" data-tone="white" style={{ left: "45.44%", top: "79.6%", width: "8.8%", height: "6.2%" }}>
        <span className="wf-rel-title">Archetype Candidate Selection</span>
      </section>
      <span className="wf-rel-tag" style={{ left: "62.35%", top: "33.4%" }}>Z0</span>
      <section className="wf-rel-source is-op" data-tone="teal" style={{ left: "51.85%", top: "68%", width: "8.4%", height: "6.4%" }}>
        <span className="wf-rel-index">05</span>
        <span className="wf-rel-title">3D Archetype Modules</span>
      </section>
      <section className="wf-rel-source is-child is-decision" data-tone="white" style={{ left: "69.35%", top: "68%", width: "8.8%", height: "6.4%" }}>
        <span className="wf-rel-title">Archetype Candidate Selection</span>
      </section>
      <section className="wf-rel-source is-context" data-tone="teal" style={{ left: "87.25%", top: "66.8%", width: "10.4%", height: "8.8%" }}>
        <span className="wf-rel-index">08</span>
        <span className="wf-rel-title">Hybrid Connection</span>
        <p className="wf-rel-anno">Face registration, 5×5 field, connector growth.</p>
      </section>
      <section className="wf-rel-source wf-rel-question" style={{ left: "4.6%", top: "66.8%", width: "18%", height: "8.8%" }}>
        <span className="wf-rel-title">Research Question</span>
        <p className="wf-rel-anno">How can precedent-derived morphology generate new spatial organizations without reproducing precedent geometry?</p>
      </section>

    </div>
  );
}
