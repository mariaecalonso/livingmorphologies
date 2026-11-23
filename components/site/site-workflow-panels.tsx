"use client";

import { useRouter } from "next/navigation";
import { displayRelationship } from "@/lib/skill5/architectural-strategy";
import type { PocketFit } from "@/lib/skill5/pocket-feasibility";
import { fitLabel } from "@/lib/skill5/pocket-feasibility";
import type { ZoneFacing } from "@/lib/skill5/zoning";
import { polygonAreaSqFt } from "@/lib/skill5/zoning";
import { SITE_WORKFLOW, siteStepHref, ZONE_KINDS, type SiteConnection, type SiteStepId, type SiteWorkflowId, type SiteZone, type SiteZoneKind } from "./site-workflow";
import type { ZoneTool } from "./site-zone-layer";

export function SiteWorkflowNav({ step, onChange }: { step: SiteStepId; onChange?: (step: SiteWorkflowId) => void }) {
  const router = useRouter();
  const open = (id: SiteStepId) => {
    if (id === step) return;
    if (id !== "analysis" && onChange) onChange(id);
    const href = siteStepHref(id, window.location.search);
    if (`${window.location.pathname}${window.location.search}` !== href) router.push(href);
  };
  return (
    <nav className="site-workflow" aria-label="Site workflow">
      {SITE_WORKFLOW.map((item, index) => (
        <span key={item.id} className="site-workflow-step">
          {index > 0 ? <span className="site-workflow-arrow" aria-hidden="true">→</span> : null}
          <button
            type="button"
            role="tab"
            aria-selected={step === item.id}
            data-active={step === item.id || undefined}
            onClick={() => open(item.id)}
          >
            <span>{String(index + 1).padStart(2, "0")}</span>
            {item.label}
          </button>
        </span>
      ))}
    </nav>
  );
}

const ZONE_TOOLS: { id: ZoneTool; label: string }[] = [
  { id: "draw", label: "Draw" },
  { id: "select", label: "Select" },
  { id: "edit", label: "Edit" },
  { id: "move", label: "Move" },
];

export function SiteZoningPanel({
  kind,
  onKind,
  tool,
  onTool,
  zones,
  selectedId,
  hasNetwork,
  networkLabel,
  plan,
  canFinish,
  onFinish,
  notice,
  deleteId,
  onSelect,
  onVisible,
  onDuplicate,
  onAskDelete,
  onConfirmDelete,
  onCancelDelete,
  onStrategy,
  pockets,
  pocketSelection,
  openSegments,
  branchNote,
  onPickPocket,
  onChooseKind,
  onAssign,
  onClearPockets,
  onAddLevel,
  onConsolidate,
  consolidateNote,
  preview,
  strategy,
  shortlist,
  onPreviewShortlist,
  onUseShortlist,
}: {
  kind: SiteZoneKind;
  onKind: (kind: SiteZoneKind) => void;
  tool: ZoneTool;
  onTool: (tool: ZoneTool) => void;
  zones: readonly SiteZone[];
  selectedId: string | null;
  hasNetwork: boolean;
  networkLabel: string;
  plan: boolean;
  canFinish: boolean;
  onFinish: () => void;
  notice: string | null;
  deleteId: string | null;
  onSelect: (id: string) => void;
  onVisible: (id: string) => void;
  onDuplicate: (id: string) => void;
  onAskDelete: (id: string) => void;
  onConfirmDelete: (id: string) => void;
  onCancelDelete: () => void;
  onStrategy: () => void;
  pockets: readonly { id: string; area: number; kind: SiteZoneKind | null; levels: number; band: string; spanEastFt: number; spanNorthFt: number; eastGapFt: number; sourceFt: number | null; attractorFt: number | null; fit: PocketFit; suggestion: string; footprints: number; lobby: "room" | "threshold" | null }[];
  pocketSelection: readonly string[];
  openSegments: number;
  branchNote: string | null;
  onPickPocket: (id: string, shift: boolean) => void;
  onChooseKind: (kind: SiteZoneKind) => void;
  onAssign: (kind: SiteZoneKind) => void;
  onClearPockets: () => void;
  onAddLevel: () => void;
  onConsolidate: () => void;
  consolidateNote: string | null;
  preview: { index: number; title: string } | null;
  strategy: { strategyId: string; arrangementId: string; relationships: readonly { statement: string }[] } | null;
  shortlist: readonly { id: string; index: number; title: string; active: boolean }[];
  onPreviewShortlist: (id: string) => void;
  onUseShortlist: (id: string) => void;
}) {
  const active = ZONE_KINDS.find((item) => item.id === kind) ?? ZONE_KINDS[0];
  return (
    <div className="site-strategy-panel">
      <section className="site-strategy-section" aria-label="Program">
        {preview ? <p className="site-strategy-note" title={preview.title}>Preview {preview.index}. Zoning network stays {networkLabel.split(" · ")[0]}.</p> : hasNetwork ? <p className="site-strategy-note" title={networkLabel}>Zoning {networkLabel.split(" · ")[0]}</p> : (
          <p className="site-strategy-note">No massing network.</p>
        )}
        {!hasNetwork ? <button type="button" onClick={onStrategy}>Site Strategy</button> : null}
        {strategy ? (
          <>
            <p className="site-strategy-note">{strategy.strategyId} · {strategy.arrangementId}</p>
            {strategy.relationships.map((item) => <p key={item.statement} className="site-strategy-note">{displayRelationship(item.statement)}</p>)}
          </>
        ) : null}
        <h3>Shortlist</h3>
        {shortlist.length === 0 ? <p className="site-strategy-note">No networks shortlisted. Zoning keeps one active network.</p> : (
          <ul className="site-strategy-nodes">
            {shortlist.map((item) => (
              <li key={item.id}>
                <button type="button" data-active={item.active || undefined} onClick={() => onPreviewShortlist(item.id)}>
                  <b>{item.index}</b>
                  <span>{item.active ? "Zoning network" : "Preview"} · {item.title}</span>
                </button>
                <button type="button" disabled={item.active} onClick={() => onUseShortlist(item.id)}>Use for Zoning</button>
              </li>
            ))}
          </ul>
        )}
        <h3>Program</h3>
        <div className="site-kind-toggle site-zone-kinds" role="group" aria-label="Program">
          {ZONE_KINDS.map((item) => (
            <button key={item.id} type="button" data-kind={item.id} title={item.note} aria-pressed={kind === item.id} data-active={kind === item.id || undefined} onClick={() => onChooseKind(item.id)}>
              {item.label}
            </button>
          ))}
        </div>
      </section>
      <section className="site-strategy-section" aria-label="Pockets">
        <h3>Pockets</h3>
        {branchNote ? <p className="site-strategy-note">{branchNote}</p> : null}
        <p className="site-strategy-note" title="Copper fits a validated plan. A copper outline is marginal. White does not fit. Cyan is a parcel remainder.">{pockets.length} · {pocketSelection.length} selected{openSegments > 0 ? ` · ${openSegments} open` : ""}</p>
        {pockets.length > 0 ? (
          <ul className="site-strategy-nodes">
            {pockets.map((pocket, index) => {
              const program = pocket.kind ? ZONE_KINDS.find((item) => item.id === pocket.kind)?.label : null;
              const selected = pocketSelection.includes(pocket.id);
              const reading = program ?? [fitLabel(pocket.fit), pocket.suggestion].filter(Boolean).join(" · ");
              return (
                <li key={pocket.id}>
                  <button type="button" data-kind={pocket.kind ?? "pocket"} data-fit={pocket.kind ? undefined : pocket.fit} data-active={selected || undefined} onClick={() => onPickPocket(pocket.id, true)}>
                    <i />
                    <b>{program ?? `Pocket ${index + 1}`}</b>
                    <span>{Math.round(pocket.area).toLocaleString("en-US")} ft² · {reading}{pocket.levels > 1 ? ` · ${pocket.levels} levels` : ""}</span>
                  </button>
                  {selected ? <p className="site-strategy-note">{Math.round(pocket.spanEastFt)} × {Math.round(pocket.spanNorthFt)} ft. {pocket.footprints === 0 ? "No validated plan fits." : pocket.footprints === 1 ? "1 plan fits." : `${pocket.footprints} plans fit.`} {pocket.lobby === "room" ? "Lobby can be a room." : pocket.lobby === "threshold" ? "Lobby threshold only." : ""}</p> : null}
                </li>
              );
            })}
          </ul>
        ) : null}
      </section>
      <section className="site-strategy-section" aria-label="Pocket actions">
        <h3>Actions</h3>
        {consolidateNote ? <p className="site-strategy-note">{consolidateNote}</p> : null}
        <div className="site-zone-actions">
          <button type="button" title={preview ? "Preview only. The zoning network is unchanged." : "Remove zones on the selected faces."} disabled={preview !== null || pocketSelection.length === 0} onClick={onClearPockets}>Clear</button>
          <button type="button" title={preview ? "Preview only. The zoning network is unchanged." : "Stack another zone on the selected faces."} disabled={preview !== null || pocketSelection.length === 0} onClick={onAddLevel}>Add level</button>
          <button type="button" title={preview ? "Preview only. The zoning network is unchanged." : `Assign ${active.label}. Also writes the configuration.`} disabled={preview !== null || pocketSelection.length === 0} onClick={() => onAssign(kind)}>Save</button>
        </div>
        <div className="site-zone-actions">
          <button type="button" title={preview ? "Preview only. The zoning network is unchanged." : "Join faces that already have a program. Drawn outlines stay."} disabled={preview !== null || pockets.length === 0} onClick={onConsolidate}>Consolidate</button>
        </div>
      </section>
      <section className="site-strategy-section" aria-label="Outline tools">
        <div className="site-kind-toggle site-zone-tools" role="group" aria-label="Zoning tool" title={plan ? "Click the site to add corners. Double-click, Enter, or Finish closes the outline." : "Outline edits stay in Plan."}>
          {ZONE_TOOLS.map((item) => (
            <button key={item.id} type="button" aria-pressed={tool === item.id} data-active={tool === item.id || undefined} disabled={preview !== null || (item.id === "draw" && !hasNetwork)} onClick={() => { onKind(kind); onTool(item.id); }}>
              {item.label}
            </button>
          ))}
        </div>
        {tool === "draw" ? <button type="button" disabled={!canFinish} onClick={onFinish}>Finish</button> : null}
        {notice ? <p className="site-strategy-note">{notice}</p> : null}
      </section>
      <section className="site-strategy-section" aria-label="Placed zones">
        {zones.length === 0 ? <p className="site-strategy-note">No regions yet.</p> : (
          <ul className="site-strategy-nodes">
            {zones.map((zone) => (
              <li key={zone.id}>
                <button type="button" data-kind={zone.kind} data-active={zone.id === selectedId || undefined} onClick={() => onSelect(zone.id)}>
                  <i />
                  <b>{zone.name}</b>
                  <span>{Math.round(polygonAreaSqFt(zone.points)).toLocaleString("en-US")} ft²</span>
                </button>
                <div className="site-zone-edit">
                  <button type="button" aria-pressed={zone.visible} onClick={() => onVisible(zone.id)}>{zone.visible ? "Shown" : "Hidden"}</button>
                  <button type="button" onClick={() => onDuplicate(zone.id)}>Duplicate</button>
                  {deleteId === zone.id ? (
                    <>
                      <button type="button" onClick={() => onConfirmDelete(zone.id)}>Confirm delete</button>
                      <button type="button" onClick={onCancelDelete}>Keep</button>
                    </>
                  ) : (
                    <button type="button" className="site-zone-remove" onClick={() => onAskDelete(zone.id)}>Delete</button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

export function SiteZoningInspector({
  zone,
  networkLabel,
  mismatch,
  outsideParcel,
  inWater,
  branchFt,
  junctionFt,
  accessFt,
  waterFt,
  facing,
  totals,
  counts,
  onName,
  onKind,
  onBase,
  onHeight,
  emptyNote,
}: {
  zone: SiteZone | null;
  networkLabel: string;
  mismatch: string | null;
  outsideParcel: boolean;
  inWater: boolean;
  branchFt: number | null;
  junctionFt: number | null;
  accessFt: number | null;
  waterFt: number | null;
  facing: ZoneFacing | null;
  totals: Record<SiteZoneKind, number>;
  counts: Record<SiteZoneKind, number>;
  onName: (name: string) => void;
  onKind: (kind: SiteZoneKind) => void;
  onBase: (feet: number) => void;
  onHeight: (feet: number) => void;
  emptyNote?: string | null;
}) {
  const feet = (value: number | null) => value == null ? "Not on this network" : `${Math.round(value).toLocaleString("en-US")} ft`;
  return (
    <section className="site-block site-specs" aria-label="Zoning">
      <h2 className="site-subtitle">Zoning</h2>
      <p className="site-note">Zoning network: {networkLabel}</p>
      {zone ? (
        <>
          <label className="site-connection-field">
            Name
            <input aria-label="Zone name" value={zone.name} onChange={(event) => onName(event.target.value)} />
          </label>
          <div className="site-kind-toggle site-zone-kinds" role="group" aria-label="Selected program">
            {ZONE_KINDS.map((item) => (
              <button key={item.id} type="button" aria-pressed={zone.kind === item.id} data-active={zone.kind === item.id || undefined} onClick={() => onKind(item.id)}>
                {item.label}
              </button>
            ))}
          </div>
          <p className="site-note">Area {Math.round(polygonAreaSqFt(zone.points)).toLocaleString("en-US")} ft² · {zone.points.length} corners</p>
          <label className="site-connection-field">
            Base elevation, ft
            <input aria-label="Base elevation" type="number" value={zone.baseFt} onChange={(event) => onBase(Number(event.target.value))} />
          </label>
          <label className="site-connection-field">
            Height, ft
            <input aria-label="Zone height" type="number" min={0.1} step={1} value={zone.heightFt} onChange={(event) => onHeight(Number(event.target.value))} />
          </label>
          <p className="site-note">Top {Math.round((zone.baseFt + zone.heightFt) * 10) / 10} ft. Different programs may overlap in plan when their elevations differ.</p>
          {outsideParcel ? <p className="site-note">Part of this region is outside the parcel. It stays editable.</p> : null}
          {inWater ? <p className="site-note">Part of this region lies in the mapped water. It stays editable.</p> : null}
          {mismatch ? <p className="site-note">{mismatch}</p> : null}
          <p className="site-note">Nearest branch {feet(branchFt)}. Nearest junction {feet(junctionFt)}. Nearest approved pedestrian access {feet(accessFt)}. Shore {feet(waterFt)}. {facing ? `Closer to the ${facing === "city" ? "city side" : facing === "waterfront" ? "waterfront" : "middle of the parcel"}.` : ""}</p>
        </>
      ) : <p className="site-note">{emptyNote ?? "Select a pocket to assign a program and set its elevation."}</p>}
      <h2 className="site-subtitle">By program</h2>
      {ZONE_KINDS.map((item) => (
        <p key={item.id} className="site-note">{item.label}: {counts[item.id]} region{counts[item.id] === 1 ? "" : "s"}, {Math.round(totals[item.id]).toLocaleString("en-US")} ft²</p>
      ))}
      <p className="site-note">Area is the sum of each region. Overlaps are not subtracted.</p>
    </section>
  );
}

export function SiteAssemblyStep({
  tiles,
  tileA,
  tileB,
  mode,
  proposal,
  canJoin,
  faces,
  faceA,
  faceB,
  hybridNote,
  hybridBusy,
  candidates,
  selectedCandidate,
  canAddHybrid,
  connections,
  selectedConnection,
  onMode,
  onTileA,
  onTileB,
  onFaceA,
  onFaceB,
  onJoin,
  onFindHybrids,
  onCandidate,
  onAddHybrid,
  onCancel,
  onSelectConnection,
  onRemove,
  showSiteLayers,
  onShowSiteLayers,
}: {
  tiles: readonly { id: string; name: string }[];
  tileA: string;
  tileB: string;
  mode: "direct" | "hybrid";
  proposal: string;
  canJoin: boolean;
  faces: readonly { id: string; label: string }[];
  faceA: string;
  faceB: string;
  hybridNote: string;
  hybridBusy: boolean;
  candidates: readonly { id: string; status: string }[];
  selectedCandidate: string | null;
  canAddHybrid: boolean;
  connections: readonly SiteConnection[];
  selectedConnection: string | null;
  onMode: (mode: "direct" | "hybrid") => void;
  onTileA: (id: string) => void;
  onTileB: (id: string) => void;
  onFaceA: (id: string) => void;
  onFaceB: (id: string) => void;
  onJoin: () => void;
  onFindHybrids: () => void;
  onCandidate: (id: string) => void;
  onAddHybrid: () => void;
  onCancel: () => void;
  onSelectConnection: (id: string) => void;
  onRemove: (id: string) => void;
  showSiteLayers: boolean;
  onShowSiteLayers: (visible: boolean) => void;
}) {
  const nameOf = (id: string) => tiles.find((tile) => tile.id === id)?.name ?? id;
  const chosen = connections.find((link) => link.id === selectedConnection) ?? null;
  return (
    <div className="site-strategy-panel">
      <label className="site-zone-toggle">
        <input type="checkbox" checked={showSiteLayers} onChange={(event) => onShowSiteLayers(event.target.checked)} />
        Zoning and network
      </label>
      <section className="site-strategy-section" aria-label="Tile connection">
        <p className="site-strategy-note">Select two tiles, then choose a direct passage or a Skill 04 hybrid. Nothing is added until it is confirmed.</p>
        {tiles.length < 2 ? <p className="site-strategy-note">Place at least two tiles in Cluster Placement.</p> : (
          <>
            <div className="site-run-row" role="group" aria-label="Connection kind">
              <button type="button" data-active={mode === "direct" || undefined} onClick={() => onMode("direct")}>Direct Join</button>
              <button type="button" data-active={mode === "hybrid" || undefined} onClick={() => onMode("hybrid")}>Hybrid Connection</button>
            </div>
            <label className="site-connection-field">
              First tile
              <select value={tileA} onChange={(event) => onTileA(event.target.value)}>
                <option value="">Select</option>
                {tiles.map((tile) => <option key={tile.id} value={tile.id}>{tile.name}</option>)}
              </select>
            </label>
            <label className="site-connection-field">
              Second tile
              <select value={tileB} onChange={(event) => onTileB(event.target.value)}>
                <option value="">Select</option>
                {tiles.map((tile) => <option key={tile.id} value={tile.id}>{tile.name}</option>)}
              </select>
            </label>
            {mode === "hybrid" ? (
              <>
                <label className="site-connection-field">
                  First face
                  <select value={faceA} onChange={(event) => onFaceA(event.target.value)}>
                    {faces.map((face) => <option key={face.id} value={face.id}>{face.label}</option>)}
                  </select>
                </label>
                <label className="site-connection-field">
                  Second face
                  <select value={faceB} onChange={(event) => onFaceB(event.target.value)}>
                    {faces.map((face) => <option key={face.id} value={face.id}>{face.label}</option>)}
                  </select>
                </label>
                <p className={canAddHybrid ? "site-strategy-note" : "site-alert"}>{hybridNote}</p>
                <div className="site-run-row" role="group" aria-label="Hybrid connection">
                  <button type="button" disabled={hybridBusy || !tileA || !tileB || tileA === tileB} onClick={onFindHybrids}>{hybridBusy ? "Finding hybrids" : "Find hybrids"}</button>
                  <button type="button" disabled={!canAddHybrid} onClick={onAddHybrid}>Add hybrid</button>
                  <button type="button" onClick={onCancel}>Cancel</button>
                </div>
                {candidates.length > 0 ? (
                  <div className="site-run-row" role="group" aria-label="Hybrid candidates">
                    {candidates.map((candidate) => (
                      <button key={candidate.id} type="button" disabled={candidate.status !== "ready"} data-active={candidate.id === selectedCandidate || undefined} onClick={() => onCandidate(candidate.id)}>{candidate.id}</button>
                    ))}
                  </div>
                ) : null}
              </>
            ) : (
              <>
                <p className={canJoin ? "site-strategy-note" : "site-alert"}>{proposal}</p>
                <div className="site-run-row" role="group" aria-label="Direct join">
                  <button type="button" disabled={!canJoin} onClick={onJoin}>Direct Join</button>
                  <button type="button" onClick={onCancel}>Cancel</button>
                </div>
              </>
            )}
          </>
        )}
      </section>
      <section className="site-strategy-section" aria-label="Recorded connections">
        {connections.length === 0 ? <p className="site-strategy-note">No connections recorded.</p> : (
          <ul className="site-strategy-nodes">
            {connections.map((link) => (
              <li key={link.id}>
                <button type="button" data-active={link.id === selectedConnection || undefined} onClick={() => onSelectConnection(link.id)}>
                  <i />
                  <b>{link.mode === "hybrid" ? `Hybrid ${link.candidateId ?? ""}` : "Direct"} · {link.faceA && link.faceB ? `${link.faceA} ${link.faceB}` : ""} · {nameOf(link.tileA)} / {nameOf(link.tileB)}</b>
                </button>
              </li>
            ))}
          </ul>
        )}
        {chosen ? (
          <dl className="site-readout">
            <div><dt>Opening alignment</dt><dd>{chosen.alignment ?? "—"} cells</dd></div>
            <div><dt>Floor continuity</dt><dd>{chosen.floorDelta === 0 ? "Continuous" : `${chosen.floorDelta ?? "—"} cell shift`}</dd></div>
            <div><dt>Mesh integrity</dt><dd>{chosen.integrity === "closed" ? "Closed" : chosen.integrity ?? "Unread"}</dd></div>
            <div><dt>Connection</dt><dd>{chosen.mode === "hybrid" ? `Hybrid ${chosen.candidateId ?? ""}` : chosen.joinType === "stack" ? "Top to bottom" : "Side to side"}</dd></div>
            {chosen.note ? <div><dt>Check</dt><dd>{chosen.note}</dd></div> : null}
            {chosen.review ? <div><dt>Review</dt><dd>{chosen.review}</dd></div> : null}
          </dl>
        ) : null}
        {chosen ? <button type="button" onClick={() => onRemove(chosen.id)}>Remove connection</button> : null}
      </section>
    </div>
  );
}
