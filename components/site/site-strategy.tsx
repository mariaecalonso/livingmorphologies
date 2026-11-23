"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import context from "@/data/skill5/herald-site.json";
import type { SiteContext } from "@/lib/skill5/site-model";
import { NETWORK_REACH_FT, SKETCH_RECESSION_FT, STRATEGY_LAYOUT_DEFAULTS, buildNorthGatheringLayouts, buildSketchLayouts, buildStrategyLayouts, type StrategyLayout, type StrategyLayoutSettings } from "@/lib/skill5/strategy-layouts";
import { pedestrianCandidates } from "./site-network-candidates";
import type { NetworkNodeKind, SiteNetworkStudy, StrategyOrigin } from "./site-network";
import { TYPOLOGY_INTENTS, type TypologyAttractor, type TypologyIntent } from "./typology-attractors";
import { TYPOLOGY_COLOR } from "./typology-attractor-layer";

export type StrategyMode = "site-network" | "assemblies-network";

export const STRATEGY_MODES: { id: StrategyMode; label: string; title: string; body: string }[] = [
  {
    id: "site-network",
    label: "Method 01",
    title: "Site → Network",
    body: "Sources stay on land. Attractors may sit on land or in a limited bay zone, and one branching network grows through the open region.",
  },
];

const EMPTY_EDIT = { nodes: [], selectedId: null, candidates: [], selectedCandidateId: null };

function WaterGrowthControls({ study, selectedId }: { study: SiteNetworkStudy; selectedId: string | null }) {
  const selected = study.edit.nodes.find((node) => node.id === selectedId);
  if (selected?.surface !== "water") return null;
  return (
    <div className="site-growth-zone">
      <h3>Over-water growth</h3>
      {selected.water ? (
        <>
          <label>
            Width, ft
            <input
              type="number"
              min={36}
              max={160}
              step={2}
              value={selected.water.widthFt}
              onChange={(event) => study.setGrowthWidth(selected.id, Number(event.target.value))}
            />
          </label>
          <button type="button" title="The bay stays closed outside this zone." onClick={() => study.clearGrowth(selected.id)}>Remove growth zone</button>
        </>
      ) : (
        <>
          <button type="button" title="No growth zone. The attractor stays disconnected from the land." onClick={() => study.restoreGrowth(selected.id)}>Open growth zone</button>
        </>
      )}
    </div>
  );
}

function feet(value: number) {
  return `${value.toFixed(1)} ft`;
}

export const STRATEGY_LAYOUT_KEY = "living-morphologies.site-strategy-layouts";
export const SKETCH_LAYOUT_KEY = "living-morphologies.site-sketch-layouts";
const site = context as SiteContext;

const ORIGIN_LABEL: Record<StrategyOrigin, string> = {
  "measured-access": "Measured access",
  "city-edge": "City-edge proposal",
  "mapped-approach": "Mapped approach",
  waterfront: "Waterfront",
  internal: "Inland",
  "road-buffered": "Road distance",
};

function originLabel(origin: StrategyOrigin) {
  return ORIGIN_LABEL[origin];
}

function nodeRecord(node: { strategy?: { origin: StrategyOrigin; unverified: boolean } | null }) {
  if (!node.strategy) return "placed" as const;
  if (node.strategy.unverified) return "unverified" as const;
  if (node.strategy.origin === "city-edge" || node.strategy.origin === "mapped-approach") return "proposed" as const;
  return "measured" as const;
}

const RECORD_LABEL = { unverified: "Unverified", measured: "Measured", proposed: "Proposed", placed: "Placed" };

function nodeEvidence(node: { strategy?: { unverified: boolean; waterfrontFeet: number | null; shoreFeet: number | null; openRays: number | null; macarthurFeet: number | null; exposed: boolean | null; shaded: boolean | null } | null }) {
  const trace = node.strategy;
  if (!trace) return "Placed by hand. No site-analysis record on this node.";
  const parts: string[] = [];
  if (trace.unverified) parts.push("Unverified access contact");
  if (typeof trace.waterfrontFeet === "number") parts.push(`${Math.round(trace.waterfrontFeet)} ft from the coastline`);
  if (trace.openRays === null) parts.push("Sightlines were not measured");
  else if (trace.shoreFeet === null) parts.push(`${trace.openRays} open sightlines, none to the shore`);
  else parts.push(`${trace.openRays} open sightlines, open shore ${Math.round(trace.shoreFeet)} ft`);
  if (typeof trace.macarthurFeet === "number") parts.push(`MacArthur ${Math.round(trace.macarthurFeet)} ft`);
  if (trace.exposed === true) parts.push("Sun exposed");
  if (trace.shaded === true) parts.push("Sun shaded");
  return parts.join(". ");
}

function readStoredLayouts(): StrategyLayout[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STRATEGY_LAYOUT_KEY) ?? "null") as { layouts?: StrategyLayout[] } | null;
    if (!parsed || !Array.isArray(parsed.layouts)) return [];
    return parsed.layouts.filter((layout) => layout && typeof layout.id === "string" && Array.isArray(layout.nodes) && Array.isArray(layout.seeds));
  } catch {
    return [];
  }
}

function GeneratedLayouts({ study }: { study: SiteNetworkStudy }) {
  const [settings, setSettings] = useState<StrategyLayoutSettings>({ ...STRATEGY_LAYOUT_DEFAULTS });
  const [layouts, setLayouts] = useState<StrategyLayout[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => {
    setLayouts(readStoredLayouts());
  }, []);
  const generate = () => {
    setBusy(true);
    setMessage("");
    window.setTimeout(() => {
      try {
        const next = buildStrategyLayouts(site, settings);
        setLayouts(next);
        window.localStorage.setItem(STRATEGY_LAYOUT_KEY, JSON.stringify({ layouts: next }));
        setMessage(next.length === 0 ? "No layout resolved onto open land." : `${next.length} layouts. Seeds are recorded. The solver has not been run.`);
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Layout generation failed.");
      } finally {
        setBusy(false);
      }
    }, 0);
  };
  const apply = (layout: StrategyLayout) => {
    if (!window.confirm("Replace the nodes in the strategy editor? Saved network iterations and configurations are not changed.")) return;
    const count = study.installProposal(layout.nodes);
    setMessage(`${layout.title}: ${count} nodes in the editor. Saved iterations were not changed.`);
  };
  const setNumber = (key: keyof StrategyLayoutSettings, value: string) => {
    const next = Number(value);
    if (!Number.isFinite(next)) return;
    setSettings((current) => ({ ...current, [key]: next }));
  };
  return (
    <section className="site-strategy-section site-growth-zone" aria-label="Generated layouts">
      <h3 title={`Graph spacing ${15} ft. Network reach ${NETWORK_REACH_FT} ft.`}>Generated layouts</h3>
      <label>
        City-edge spacing, ft
        <input type="number" min={40} max={400} step={10} value={settings.cityEdgeSpacingFt} onChange={(event) => setNumber("cityEdgeSpacingFt", event.target.value)} />
      </label>
      <label>
        <input type="checkbox" checked={settings.includeMappedApproaches} onChange={(event) => setSettings((current) => ({ ...current, includeMappedApproaches: event.target.checked }))} />
        Mapped approaches
      </label>
      <label>
        Approach search, ft
        <input type="number" min={1} max={80} step={1} value={settings.mappedApproachFt} disabled={!settings.includeMappedApproaches} onChange={(event) => setNumber("mappedApproachFt", event.target.value)} />
      </label>
      <div className="site-emphasis-grid">
        <label>
          Center
          <input aria-label="Waterfront emphasis center" title="0 is south, 1 is north. Used the next time layouts are generated." type="number" min={0} max={1} step={0.05} value={settings.emphasisCenter} onChange={(event) => setNumber("emphasisCenter", event.target.value)} />
        </label>
        <label>
          Extent, ft
          <input aria-label="Waterfront extent" type="number" min={40} max={800} step={10} value={settings.emphasisExtentFt} onChange={(event) => setNumber("emphasisExtentFt", event.target.value)} />
        </label>
        <label>
          Intensity
          <input aria-label="Waterfront intensity" type="number" min={0} max={1} step={0.05} value={settings.emphasisIntensity} onChange={(event) => setNumber("emphasisIntensity", event.target.value)} />
        </label>
      </div>
      <label>
        Seeds per layout
        <input type="number" min={1} max={8} step={1} value={settings.seedsPerLayout} onChange={(event) => setNumber("seedsPerLayout", event.target.value)} />
      </label>
      <div className="site-check-row">
        <label title="Reports exposure and shade. Neither is preferred.">
          <input type="checkbox" checked={settings.sun} onChange={(event) => setSettings((current) => ({ ...current, sun: event.target.checked }))} />
          Sun
        </label>
        <label title="Evaluation only. Wind does not move nodes.">
          <input type="checkbox" checked={settings.wind} onChange={(event) => setSettings((current) => ({ ...current, wind: event.target.checked }))} />
          Wind
        </label>
      </div>
      <button type="button" disabled={busy} onClick={generate}>{busy ? "Generating" : "Generate layouts"}</button>
      {message ? <p className="site-strategy-note">{message}</p> : null}
      <ul className="site-strategy-nodes">
        {layouts.map((layout) => (
          <li key={layout.id}>
            <button type="button" title={layout.notes.join(" ")} onClick={() => apply(layout)}>
              <i />
              <b>{layout.title}</b>
              <span>{layout.nodes.length} nodes · {layout.seeds.length} seeds</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function SketchLayouts({ study }: { study: SiteNetworkStudy }) {
  const [recessionFt, setRecessionFt] = useState(SKETCH_RECESSION_FT);
  const [layouts, setLayouts] = useState<StrategyLayout[]>([]);
  const [message, setMessage] = useState("");
  useEffect(() => {
    try {
      const parsed = JSON.parse(window.localStorage.getItem(SKETCH_LAYOUT_KEY) ?? "null") as { layouts?: StrategyLayout[]; recessionFt?: number } | null;
      if (parsed?.layouts?.length) setLayouts(parsed.layouts);
      if (typeof parsed?.recessionFt === "number") setRecessionFt(parsed.recessionFt);
    } catch {
      setLayouts([]);
    }
  }, []);
  const store = (next: StrategyLayout[], note: string) => {
    setLayouts(next);
    window.localStorage.setItem(SKETCH_LAYOUT_KEY, JSON.stringify({ layouts: next, recessionFt }));
    setMessage(note);
  };
  const generate = () => {
    const kept = layouts.filter((layout) => layout.id.startsWith("sketch-north-"));
    const next = [...buildSketchLayouts(site, { recessionFt, seedsPerLayout: 3 }), ...kept];
    store(next, next.some((layout) => layout.id === "sketch-with-northeast") ? "Two source alternatives are ready." : "The sketch alternatives could not be placed.");
  };
  const placeNorth = () => {
    const base = layouts.filter((layout) => !layout.id.startsWith("sketch-north-"));
    const north = buildNorthGatheringLayouts(site, { recessionFt, seedsPerLayout: 4 });
    const next = [...base, ...north];
    store(next, north.length === 4 ? "Four northern-gathering alternatives are ready." : "The northern gathering alternatives could not be placed.");
  };
  return (
    <section className="site-strategy-section site-growth-zone" aria-label="Sketch layouts">
      <h3 title="The northeast measured access is a source in one alternative and omitted in the other. Site Analysis keeps the contact.">Sketch</h3>
      <label>
        Recession, ft
        <input aria-label="North and south recession" title="How much farther inland the other destinations sit, compared with the central waterfront attractor." type="number" min={0} max={400} step={10} value={recessionFt} onChange={(event) => {
          const next = Number(event.target.value);
          if (Number.isFinite(next)) setRecessionFt(next);
        }} />
      </label>
      <button type="button" onClick={generate}>Generate sketch</button>
      <button type="button" title="Adds a northern Gathering attractor in one pair, and shifts the waterfront Gathering attractor north in the other. The first sketch alternatives stay." onClick={placeNorth}>Northern gathering</button>
      {message ? <p className="site-strategy-note">{message}</p> : null}
      {layouts.length > 0 ? (
        <ul className="site-strategy-nodes">
          {layouts.map((layout) => {
            const sources = layout.nodes.filter((node) => node.kind === "source").length;
            const label = layout.id === "sketch-with-northeast" ? "With northeast" : layout.id === "sketch-without-northeast" ? "Without northeast" : layout.title;
            return (
              <li key={layout.id}>
                <button type="button" title={layout.notes.join(" ")} onClick={() => {
                  if (!window.confirm("Replace the nodes in the strategy editor? Saved network iterations and configurations are not changed.")) return;
                  const count = study.installProposal(layout.nodes);
                  setMessage(`${layout.title}: ${count} nodes in the editor.`);
                }}>
                  <i />
                  <b>{label}</b>
                  <span>{sources} sources · {layout.seeds.length} seeds</span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </section>
  );
}

function useNetworkEdit(study: SiteNetworkStudy | null) {
  return useSyncExternalStore(
    (listener) => study ? study.subscribe(listener) : () => {},
    () => study?.edit ?? EMPTY_EDIT,
    () => EMPTY_EDIT,
  );
}

const INTENT: { id: "waterfront" | "inland" | "road" | "mapped" | "central" | "distinct" | "continuous"; group: "Exploratory" | "Sketch"; title: string }[] = [
  { id: "waterfront", group: "Exploratory", title: "Waterfront rooms" },
  { id: "inland", group: "Exploratory", title: "Inland rooms" },
  { id: "road", group: "Exploratory", title: "Road-buffered rooms" },
  { id: "mapped", group: "Exploratory", title: "Mapped approaches" },
  { id: "central", group: "Sketch", title: "Central and southern gathering" },
  { id: "distinct", group: "Sketch", title: "Distinct northern gathering" },
  { id: "continuous", group: "Sketch", title: "Continuous gathering" },
];

/** Maps a conclusion pair onto a layout the existing generators already build. */
function layoutForIntent(intent: (typeof INTENT)[number]["id"], city: boolean, northeast: boolean): { id: string; blocked: string | null } {
  if (intent === "waterfront") {
    if (city && northeast) return { id: "measured-both-waterfront", blocked: null };
    if (city) return { id: "measured-herald-waterfront", blocked: null };
    return { id: "", blocked: "Waterfront rooms with only the northeast contact are not built. The generator pairs that contact with inland rooms." };
  }
  if (intent === "inland") {
    if (!city && northeast) return { id: "measured-northeast-internal", blocked: null };
    if (!city) return { id: "city-edge-internal", blocked: null };
    return { id: "", blocked: "Inland rooms are built from the northeast contact alone, or from city-edge proposals when both contacts are off." };
  }
  if (intent === "road") {
    if (city && northeast) return { id: "measured-both-road", blocked: null };
    if (!city && !northeast) return { id: "city-edge-road", blocked: null };
    return { id: "", blocked: "Road-buffered rooms are built from both contacts, or from city-edge proposals when both contacts are off." };
  }
  if (intent === "mapped") return { id: "mapped-waterfront", blocked: null };
  if (intent === "central" || intent === "distinct" || intent === "continuous") {
    if (!city) return { id: "", blocked: "Sketch organizations always include the city-side contact. Turn it on to generate this one." };
    const stem = intent === "central" ? "sketch" : intent === "distinct" ? "sketch-north-distinct" : "sketch-north-continuous";
    const suffix = intent === "central" ? (northeast ? "with-northeast" : "without-northeast") : northeast ? "with" : "without";
    return { id: `${stem}-${suffix}`, blocked: null };
  }
  return { id: "", blocked: "That organization is not built." };
}

export function SiteStrategyPanel({
  mode,
  onMode: _onMode,
  network,
  canClear,
  onClearField,
  typology,
}: {
  mode: StrategyMode;
  onMode: (mode: StrategyMode) => void;
  canClear: boolean;
  onClearField: () => void;
  network: {
    study: SiteNetworkStudy | null;
    running: boolean;
    tool: NetworkNodeKind;
    onTool: (tool: NetworkNodeKind) => void;
    onRun: () => void;
    onPause: () => void;
    onReset: () => void;
    onClear: () => void;
    onDelete: () => void;
    onSelect: (id: string) => void;
    onGenerate: (layout: StrategyLayout) => void;
    generating: boolean;
  } | null;
  typology: {
    points: readonly TypologyAttractor[];
    placing: TypologyIntent | null;
    visible: boolean;
    types: Record<TypologyIntent, boolean>;
    selectedId: string | null;
    onPlacing: (kind: TypologyIntent | null) => void;
    onVisible: (visible: boolean) => void;
    onType: (kind: TypologyIntent, visible: boolean) => void;
    onSelect: (id: string | null) => void;
    onDelete: (id: string) => void;
    onClear: () => void;
  };
}) {
  const active = STRATEGY_MODES.find((item) => item.id === mode) ?? STRATEGY_MODES[0];
  const siteNetwork = mode === "site-network" ? network : null;
  const edit = useNetworkEdit(siteNetwork?.study ?? null);
  const sources = edit.nodes.filter((node) => node.kind === "source").length;
  const attractors = edit.nodes.filter((node) => node.kind === "attractor").length;
  const ready = sources > 0 && attractors > 0;
  const [settings, setSettings] = useState<StrategyLayoutSettings>({ ...STRATEGY_LAYOUT_DEFAULTS });
  const [recessionFt, setRecessionFt] = useState(SKETCH_RECESSION_FT);
  const [cityAccess, setCityAccess] = useState(true);
  const [northeast, setNortheast] = useState(true);
  const [intentId, setIntentId] = useState<(typeof INTENT)[number]["id"]>("distinct");
  const [message, setMessage] = useState("");
  const access = pedestrianCandidates().filter((candidate) => candidate.role === "access");
  const chosenIntent = INTENT.find((item) => item.id === intentId) ?? INTENT[0];
  const resolved = layoutForIntent(chosenIntent.id, cityAccess, northeast);
  const generateStrategies = () => {
    if (!siteNetwork?.study || !resolved.id || siteNetwork.generating) return;
    const nextSettings = { ...settings, includeMappedApproaches: chosenIntent.id === "mapped" || settings.includeMappedApproaches };
    const exploratory = buildStrategyLayouts(site, nextSettings);
    const sketch = [...buildSketchLayouts(site, { recessionFt, seedsPerLayout: 3 }), ...buildNorthGatheringLayouts(site, { recessionFt, seedsPerLayout: 4 })];
    const chosen = [...exploratory, ...sketch].find((layout) => layout.id === resolved.id);
    if (!chosen) {
      setMessage("That organization could not be placed on open land.");
      return;
    }
    const sources = chosen.nodes.filter((node) => node.kind === "source").map((node) => `${Math.round(node.x)},${Math.round(node.z)}`).join(" ");
    const attractors = chosen.nodes.filter((node) => node.kind === "attractor").map((node) => `${Math.round(node.x)},${Math.round(node.z)}`).join(" ");
    siteNetwork.study.installProposal(chosen.nodes);
    siteNetwork.onGenerate(chosen);
    setMessage(`${chosenIntent.title}. ${chosen.seeds.length} simulations. Sources ${sources}. Attractors ${attractors}.`);
  };
  return (
    <div className="site-strategy-panel">
      <section className="site-strategy-section" aria-label="Site conclusions">
        <h3>Site conclusions</h3>
        {access.map((candidate) => {
          const city = candidate.side === "city";
          const checked = city ? cityAccess : northeast;
          return (
            <label key={candidate.id} title={city ? "Includes the city-side contact as a source. The gap is not an entrance." : "Includes the northeast contact as a source. The gap is not an entrance."}>
              <input type="checkbox" checked={checked} onChange={(event) => (city ? setCityAccess(event.target.checked) : setNortheast(event.target.checked))} />
              {candidate.title}. Unverified. {candidate.gapFeet == null ? "No gap is stored." : `Gap ${candidate.gapFeet.toFixed(1)} ft.`}
            </label>
          );
        })}
        <p className="site-strategy-note">Views are recorded on each node. Placement uses coastline distance or MacArthur distance. Sun and wind do not move nodes. Baywalk is not a source.</p>
      </section>
      {siteNetwork?.study ? (
        <section className="site-strategy-section" aria-label="Architectural intent">
          <h3>Architectural intent</h3>
          {(["Exploratory", "Sketch"] as const).map((group) => (
            <div key={group} className="site-kind-toggle" role="group" aria-label={group}>
              {INTENT.filter((item) => item.group === group).map((item) => (
                <button key={item.id} type="button" aria-pressed={chosenIntent.id === item.id} data-active={chosenIntent.id === item.id || undefined} onClick={() => setIntentId(item.id)}>
                  {item.title}
                </button>
              ))}
            </div>
          ))}
        </section>
      ) : <p className="site-strategy-note">{active.title} uses the assemblies on this site.</p>}
      {siteNetwork ? (
        <section className="site-strategy-section" aria-label="Generation">
          <h3>Generation</h3>
          <button type="button" disabled={!siteNetwork.study || !resolved.id || siteNetwork.generating} onClick={generateStrategies}>Generate networks</button>
          {resolved.blocked ? <p className="site-strategy-note">{resolved.blocked}</p> : null}
          {message ? <p className="site-strategy-note">{message}</p> : null}
          <div className="site-run-row" role="group" aria-label="Live playback">
            <button type="button" title="Plays the editor simulation. It does not archive a network." data-active={siteNetwork.running || undefined} disabled={!siteNetwork.study || !ready} onClick={siteNetwork.onRun}>Run</button>
            <button type="button" title="Pauses the editor simulation." disabled={!siteNetwork.running} onClick={siteNetwork.onPause}>Pause</button>
            <button type="button" title="Clears the live trails in the editor. Saved networks stay." disabled={!siteNetwork.study} onClick={siteNetwork.onReset}>Reset</button>
          </div>
        </section>
      ) : null}
      <details className="site-strategy-section">
        <summary>Advanced</summary>
        {siteNetwork ? (
          <div className="site-kind-toggle" role="group" aria-label="Place in the view">
            <button type="button" data-kind="source" aria-pressed={siteNetwork.tool === "source"} data-active={siteNetwork.tool === "source" || undefined} onClick={() => siteNetwork.onTool("source")}>Source</button>
            <button type="button" data-kind="attractor" aria-pressed={siteNetwork.tool === "attractor"} data-active={siteNetwork.tool === "attractor" || undefined} onClick={() => siteNetwork.onTool("attractor")}>Attractor</button>
          </div>
        ) : null}
        {siteNetwork?.study ? <WaterGrowthControls study={siteNetwork.study} selectedId={edit.selectedId} /> : null}
        {siteNetwork?.study ? (
          <label>
            Recession, ft
            <input aria-label="North and south recession" type="number" min={0} max={400} step={10} value={recessionFt} onChange={(event) => {
              const next = Number(event.target.value);
              if (Number.isFinite(next)) setRecessionFt(next);
            }} />
          </label>
        ) : null}
        <label>
          City-edge spacing, ft
          <input type="number" min={40} max={400} step={10} value={settings.cityEdgeSpacingFt} onChange={(event) => {
            const next = Number(event.target.value);
            if (Number.isFinite(next)) setSettings((current) => ({ ...current, cityEdgeSpacingFt: next }));
          }} />
        </label>
        <label>
          Seeds
          <input type="number" min={1} max={8} step={1} value={settings.seedsPerLayout} onChange={(event) => {
            const next = Number(event.target.value);
            if (Number.isFinite(next)) setSettings((current) => ({ ...current, seedsPerLayout: next }));
          }} />
        </label>
        {siteNetwork?.study ? <PedestrianCandidates study={siteNetwork.study} edit={edit} /> : null}
        {siteNetwork?.study ? (
          <ul className="site-strategy-nodes">
            {edit.nodes.map((node) => {
              const record = nodeRecord(node);
              const selected = node.id === edit.selectedId;
              return (
                <li key={node.id}>
                  <button type="button" data-kind={node.surface === "water" ? "water" : node.kind} data-record={record} data-active={selected || undefined} onClick={() => siteNetwork.onSelect(node.id)}>
                    <i />
                    <b>{node.kind === "source" ? "Source" : "Attractor"}</b>
                    <span>{RECORD_LABEL[record]}{node.strategy ? ` · ${originLabel(node.strategy.origin)}` : ""}</span>
                  </button>
                  {selected ? <p className="site-strategy-note">{nodeEvidence(node)}</p> : null}
                </li>
              );
            })}
          </ul>
        ) : null}
        {siteNetwork ? <button type="button" disabled={!edit.selectedId} onClick={siteNetwork.onDelete}>Delete selected</button> : null}
        <ArchitecturalAttractors typology={typology} />
        <button type="button" className="site-clear-field" disabled={!canClear} onClick={onClearField}>Clear all</button>
      </details>
    </div>
  );
}

function ArchitecturalAttractors({
  typology,
}: {
  typology: {
    points: readonly TypologyAttractor[];
    placing: TypologyIntent | null;
    visible: boolean;
    types: Record<TypologyIntent, boolean>;
    selectedId: string | null;
    onPlacing: (kind: TypologyIntent | null) => void;
    onVisible: (visible: boolean) => void;
    onType: (kind: TypologyIntent, visible: boolean) => void;
    onSelect: (id: string | null) => void;
    onDelete: (id: string) => void;
    onClear: () => void;
  };
}) {
  const label: Record<TypologyIntent, string> = { lobby: "Lobby", gathering: "Gathering", workspace: "Workspace" };
  return (
    <section className="site-strategy-section site-arch-attractors" aria-label="Architectural attractors">
      <details>
        <summary title="Planning markers. They do not feed the network.">Architectural attractors</summary>
        <div className="site-arch-types" role="group" aria-label="Typology to place">
          {TYPOLOGY_INTENTS.map((kind) => {
            const count = typology.points.filter((point) => point.typology === kind).length;
            return (
              <button
                key={kind}
                type="button"
                data-typology={kind}
                aria-pressed={typology.placing === kind}
                data-active={typology.placing === kind || undefined}
                onClick={() => typology.onPlacing(typology.placing === kind ? null : kind)}
              >
                <i style={{ background: TYPOLOGY_COLOR[kind], color: TYPOLOGY_COLOR[kind] }} />
                <b>{label[kind]}</b>
                <span>{count}</span>
              </button>
            );
          })}
        </div>
        <div className="site-arch-visibility">
          <label>
            <input type="checkbox" checked={typology.visible} onChange={(event) => typology.onVisible(event.target.checked)} />
            Show layer
          </label>
          {TYPOLOGY_INTENTS.map((kind) => (
            <label key={kind}>
              <input type="checkbox" checked={typology.types[kind]} onChange={(event) => typology.onType(kind, event.target.checked)} />
              {label[kind]}
            </label>
          ))}
        </div>
        {typology.placing ? <button type="button" onClick={() => typology.onPlacing(null)}>Navigate</button> : null}
        {typology.points.length > 0 ? (
          <ul className="site-strategy-nodes">
            {typology.points.map((point, index) => (
              <li key={point.id}>
                <button type="button" data-typology={point.typology} data-active={point.id === typology.selectedId || undefined} onClick={() => typology.onSelect(point.id)}>
                  <i style={{ background: TYPOLOGY_COLOR[point.typology] }} />
                  <b>{label[point.typology]} {typology.points.filter((item) => item.typology === point.typology).indexOf(point) + 1 || index + 1}</b>
                </button>
                <button type="button" aria-label={`Delete ${label[point.typology]}`} onClick={() => typology.onDelete(point.id)}>Delete</button>
              </li>
            ))}
          </ul>
        ) : null}
        <button type="button" disabled={typology.points.length === 0} onClick={typology.onClear}>Clear architectural attractors</button>
      </details>
    </section>
  );
}

function PedestrianCandidates({
  study,
  edit,
}: {
  study: SiteNetworkStudy;
  edit: { nodes: readonly { id: string; kind: NetworkNodeKind; x: number; z: number }[]; candidates: SiteNetworkStudy["edit"]["candidates"]; selectedCandidateId: string | null };
}) {
  const selected = edit.candidates.find((item) => item.id === edit.selectedCandidateId) ?? null;
  const approved = selected ? edit.nodes.find((node) => node.id === selected.id) ?? null : null;
  return (
    <section className="site-strategy-section" aria-label="Pedestrian access">
      <h3 title="Contacts stay out of the growth until approved.">Pedestrian access</h3>
      <ul className="site-strategy-nodes site-candidate-list">
        {edit.candidates.map((candidate) => {
          const role = edit.nodes.find((node) => node.id === candidate.id)?.kind;
          return (
            <li key={candidate.id}>
              <button
                type="button"
                data-kind={role ?? "candidate"}
                data-active={candidate.id === edit.selectedCandidateId || undefined}
                onClick={() => study.selectCandidate(candidate.id)}
              >
                <i />
                <b>{candidate.title}</b>
              </button>
            </li>
          );
        })}
      </ul>
      {selected ? (
        <div className="site-candidate-detail">
          <p>Measured {feet(selected.measuredX)} east, {feet(selected.measuredZ)} north.{selected.gapFeet != null ? ` Gap ${feet(selected.gapFeet)}.` : ""}</p>
          {selected.approvable ? null : <p>Off the parcel.</p>}
          <p>{selected.limitation}</p>
          <div className="site-kind-toggle">
            <button type="button" data-kind="source" disabled={!selected.approvable} aria-pressed={approved?.kind === "source"} data-active={approved?.kind === "source" || undefined} onClick={() => study.approveCandidate(selected.id, "source")}>Source</button>
            <button type="button" data-kind="attractor" disabled={!selected.approvable} aria-pressed={approved?.kind === "attractor"} data-active={approved?.kind === "attractor" || undefined} onClick={() => study.approveCandidate(selected.id, "attractor")}>Attractor</button>
          </div>
        </div>
      ) : null}
    </section>
  );
}

export function SiteStrategyAnalysis({ mode }: { mode: StrategyMode }) {
  const active = STRATEGY_MODES.find((item) => item.id === mode) ?? STRATEGY_MODES[0];
  return (
    <section className="site-block site-specs" aria-label="Network analysis">
      <h2 className="site-subtitle">Analysis</h2>
      <p className="site-identity">{active.title}</p>
      <p className="site-note">Waiting for a study.</p>
    </section>
  );
}
