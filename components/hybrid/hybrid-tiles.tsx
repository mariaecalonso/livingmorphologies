"use client";

import { useEffect, useRef, useState } from "react";
import { IconAtmospheric, IconFormal, IconSpatial } from "@/components/hud";
import { TYPOLOGIES, ratingDescription } from "@/lib/catalog";
import { ratingLabel } from "@/lib/physarum";
import type { FaceId } from "@/lib/skill4/contract";
import { FaceReadout } from "./connection-header";
import type { TileConnection } from "@/lib/skill4/connections";
import { resolveTileModule, type TileInstance } from "@/lib/skill4/tiles";
import { tileBasis } from "@/lib/skill4/tile-basis";
import type { GroupId } from "@/lib/types";
import type { ModuleHandoff, ModuleIdentity } from "@/lib/skill4/adapt";
import { MeshPreview } from "./mesh-preview";
import { TYPOLOGY_COLOR } from "@/lib/skill4/module-mock";
import { FACE_HIGHLIGHT_COLOR, FACE_HIGHLIGHT_OPACITY, faceSurfaceHighlight } from "@/lib/skill4/face-outline";
import { syntheticModuleLabel } from "@/lib/skill4/synthetic-modules";
import { useHybrid } from "./hybrid-state";

const GROUP_ICON = {
  formal: IconFormal,
  spatial: IconSpatial,
  atmospheric: IconAtmospheric,
} as const;

const FACE_LAYOUT: Array<{ face: FaceId; area: string }> = [
  { face: "T", area: "t" },
  { face: "W", area: "w" },
  { face: "N", area: "n" },
  { face: "E", area: "e" },
  { face: "S", area: "s" },
  { face: "B", area: "b" },
];

export function geometryStatus(handoff: ModuleHandoff) {
  if (handoff.status === "ready" && handoff.moduleId.startsWith("synthetic-test:")) {
    return { label: "Test data", available: true };
  }
  if (handoff.status === "ready" && handoff.source === "skill03" && handoff.selectedFinal) {
    return { label: "Skill 3 Final Handoff", available: true };
  }
  if (handoff.status === "ready" && handoff.source === "mock" && handoff.provisional) {
    return { label: "Provisional mock", available: true };
  }
  return { label: "Geometry unavailable", available: false };
}

export function HybridTiles({ compact = false, only, faceNote, locked = false }: { compact?: boolean; only?: string; faceNote?: string; locked?: boolean }) {
  const { loaded, tiles, connections, selectedId, selectedConnectionId, setSelectedId, setCanvasSelection, chooseArchetype, chooseFace, syntheticMode, facePairs } = useHybrid();
  const readoutConnection = connections.find((connection) => connection.id === selectedConnectionId) ?? connections[0] ?? null;

  return (
    <div className="hybrid-slots">
      {readoutConnection ? <FaceReadout connection={readoutConnection} pairs={facePairs[readoutConnection.id] ?? []} /> : null}
      {tiles.filter((tile) => !only || tile.instanceId === only).map((tile) => {
        const handoff = resolveTileModule(tile.archetypeId, loaded);
        const identity = handoff.identity;
        const status = geometryStatus(handoff);
        const active = tile.instanceId === selectedId;
        if (!compact && !only) {
          return (
            <TileSelectionCard
              key={tile.instanceId}
              tile={tile}
              handoff={handoff}
              identity={identity}
              active={active}
              connections={connections}
              selectedConnectionId={selectedConnectionId}
              syntheticMode={syntheticMode}
              locked={locked}
              onSelect={() => {
                setSelectedId(tile.instanceId);
                setCanvasSelection(tile.instanceId);
              }}
              onArchetype={(archetypeId) => {
                if (!locked) chooseArchetype(tile.instanceId, archetypeId);
              }}
              onFace={(face) => {
                chooseTileFace(tile.instanceId, face, connections, selectedConnectionId, chooseFace);
              }}
            />
          );
        }
        return (
          <article
            key={tile.instanceId}
            className="hybrid-slot"
            data-active={active || undefined}
            data-tile={tile.instanceId}
            data-status={handoff.status}
            data-source={handoff.source}
            onClick={() => {
              setSelectedId(tile.instanceId);
              setCanvasSelection(tile.instanceId);
            }}
          >
            <div className="hybrid-slot-head">
              <p className="eyebrow">{tile.instanceId}</p>
              <p className="hybrid-status" data-available={status.available || undefined}>
                {status.label}
              </p>
            </div>
            {compact ? null : (
              <label className="hybrid-field">
                <span className="eyebrow">Archetype</span>
                <select
                  value={tile.archetypeId}
                  onChange={(event) => chooseArchetype(tile.instanceId, event.target.value)}
                  onClick={(event) => event.stopPropagation()}
                >
                  {TYPOLOGIES.map((typology) => (
                    <optgroup key={typology.id} label={typology.label}>
                      {typology.archetypes.map((archetype) => (
                        <option key={archetype.id} value={archetype.id}>
                          {archetype.name}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </label>
            )}
            {identity ? (
              <>
                <p className="hybrid-identity">{identity.name}</p>
                <p className="hybrid-typology">{identity.typologyLabel}</p>
              </>
            ) : null}
            {compact ? null : (
              <>
                <div className="hybrid-preview" data-preview-source={previewSource(syntheticMode, handoff)} data-preview-spin={tile.rotationQuarter}>
                  {previewMesh(syntheticMode, tile.archetypeId, handoff) ? (
                    <MeshPreview mesh={previewMesh(syntheticMode, tile.archetypeId, handoff)} color={active ? previewColor(identity?.typologyId) : [1, 1, 1]} kind={0} contain basis={tileBasis(tile)} />
                  ) : null}
                  {handoff.status === "ready" ? null : <p className="hybrid-missing">{handoff.reason}</p>}
                </div>
                <p className="hybrid-units">{previewCaption(syntheticMode, handoff, identity?.typologyLabel ?? "")}</p>
              </>
            )}
            {compact ? null : <p className="hybrid-source">{sourceLine(handoff)}</p>}
            {faceNote ? <p className="hybrid-units">Selected face · {faceNote}</p> : null}
            {compact || !identity ? null : <CriteriaList identity={identity} />}
          </article>
        );
      })}
    </div>
  );
}

function ArchetypeMenu({
  value,
  label,
  disabled,
  onChange,
}: {
  value: string;
  label: string;
  disabled: boolean;
  onChange: (archetypeId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const name = TYPOLOGIES.flatMap((typology) => typology.archetypes).find((archetype) => archetype.id === value)?.name ?? "Select geometry";

  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useEffect(() => {
    if (!open || !rootRef.current || !listRef.current) return;
    const trigger = rootRef.current.querySelector("button");
    const bounds = rootRef.current.closest(".hybrid-slots")?.getBoundingClientRect();
    if (!trigger || !bounds) return;
    const rect = trigger.getBoundingClientRect();
    const view = trigger.ownerDocument.defaultView;
    const scale = rect.height / Math.max(1, trigger.offsetHeight);
    const floor = Math.max(bounds.top, 0);
    const ceiling = Math.min(bounds.bottom, view?.innerHeight ?? bounds.bottom);
    const below = ceiling - rect.bottom - 10;
    const above = rect.top - floor - 10;
    const room = Math.max(below, above);
    listRef.current.dataset.place = below >= above ? "below" : "above";
    listRef.current.style.maxHeight = `${Math.max(96, room / scale)}px`;
    listRef.current.querySelector("[data-current]")?.scrollIntoView({ block: "nearest" });
  }, [open]);

  return (
    <div className="hybrid-archetype-menu" ref={rootRef} data-open={open || undefined}>
      <button
        type="button"
        aria-label={label}
        aria-expanded={open}
        disabled={disabled}
        onClick={(event) => {
          event.stopPropagation();
          setOpen((current) => !current);
        }}
      >
        <span>{name}</span>
      </button>
      {open ? (
        <div
          className="hybrid-archetype-list"
          ref={listRef}
          role="listbox"
          aria-label={label}
          onClick={(event) => event.stopPropagation()}
        >
          <button type="button" role="option" aria-selected={value === ""} data-current={value === "" || undefined} onClick={() => { onChange(""); setOpen(false); }}>
            Select geometry
          </button>
          {TYPOLOGIES.map((typology) => (
            <div key={typology.id}>
              <p>{typology.label}</p>
              {typology.archetypes.map((archetype) => (
                <button
                  key={archetype.id}
                  type="button"
                  role="option"
                  aria-selected={value === archetype.id}
                  data-current={value === archetype.id || undefined}
                  onClick={() => { onChange(archetype.id); setOpen(false); }}
                >
                  {archetype.name}
                </button>
              ))}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function TileSelectionCard({
  tile,
  handoff,
  identity,
  active,
  connections,
  selectedConnectionId,
  syntheticMode,
  locked = false,
  onSelect,
  onArchetype,
  onFace,
}: {
  tile: TileInstance;
  handoff: ModuleHandoff;
  identity: ModuleIdentity | null;
  active: boolean;
  connections: readonly TileConnection[];
  selectedConnectionId: string | null;
  syntheticMode: boolean;
  locked?: boolean;
  onSelect: () => void;
  onArchetype: (archetypeId: string) => void;
  onFace: (face: FaceId) => void;
}) {
  const assigned = assignedFaces(tile.instanceId, connections);
  const activeConnection = connectionForTile(tile.instanceId, connections, selectedConnectionId);
  const activeFace = activeConnection
    ? (activeConnection.tileAId === tile.instanceId ? activeConnection.faceA : activeConnection.faceB)
    : null;
  const mesh = previewMesh(syntheticMode, tile.archetypeId, handoff);
  const coat = mesh && handoff.status === "ready" && (syntheticMode || handoff.source === "skill03") && activeConnection?.id === selectedConnectionId && activeFace
    ? faceSurfaceHighlight(mesh, handoff.faces[activeFace])
    : null;
  const guides = coat
    ? [{ mesh: coat, color: FACE_HIGHLIGHT_COLOR, opacity: FACE_HIGHLIGHT_OPACITY }]
    : [];
  return (
    <article
      className="hybrid-slot hybrid-slot-board"
      data-active={active || undefined}
      data-tile={tile.instanceId}
      data-status={handoff.status}
      data-source={handoff.source}
      onClick={onSelect}
    >
      <div className="hybrid-tile-identity">
        <p className="hybrid-tile-letter">{tile.instanceId}</p>
        <div className="hybrid-field">
          <ArchetypeMenu
            value={tile.archetypeId}
            label={`${tile.instanceId} archetype`}
            disabled={locked}
            onChange={onArchetype}
          />
        </div>
      </div>
      <div className="hybrid-preview" data-preview-source={previewSource(syntheticMode, handoff)} data-preview-module={handoff.status === "ready" ? handoff.moduleId : ""} data-preview-triangles={mesh?.triangles ?? 0} data-preview-typology={identity?.typologyId ?? ""} data-selected-face={activeFace ?? ""} data-preview-spin={tile.rotationQuarter}>
        {mesh ? (
          <MeshPreview
            mesh={mesh}
            color={active ? previewColor(identity?.typologyId) : [1, 1, 1]}
            kind={0}
            fill
            steer
            fitScale={0.82}
            guides={guides}
            yaw={0.7}
            pitch={0.35}
            basis={tileBasis(tile)}
          />
        ) : null}
        {tile.archetypeId && handoff.status !== "ready" ? <p className="hybrid-missing">{handoff.reason}</p> : null}
      </div>
      {tile.archetypeId ? <div className="hybrid-face-diagram" aria-label={`${tile.instanceId} faces`}>
        {FACE_LAYOUT.map(({ face, area }) => (
          <button
            key={face}
            type="button"
            style={{ gridArea: area }}
            data-active={assigned.has(face) || undefined}
            data-current={face === activeFace || undefined}
            aria-label={`${tile.instanceId} face ${face}`}
            aria-pressed={assigned.has(face)}
            onClick={(event) => {
              event.stopPropagation();
              onSelect();
              onFace(face);
            }}
          >
            {face}
          </button>
        ))}
      </div> : null}
    </article>
  );
}

function CriteriaList({ identity }: { identity: ModuleIdentity }) {
  return (
    <div className="hybrid-criteria">
      {identity.criteria.map((group) => {
        const Icon = GROUP_ICON[group.id as GroupId];
        return (
          <section key={group.id} className="criteria-group">
            <div className="hybrid-criteria-head">
              <Icon />
              <div>
                <p>{group.title}</p>
                <p className="hybrid-criteria-sub">{group.descriptor}</p>
              </div>
            </div>
            {group.criteria.map((criterion) => (
              <div key={criterion.id} className="hybrid-criterion">
                <div className="hybrid-criterion-row">
                  <span>{criterion.label}</span>
                  <span className="hybrid-rating">{ratingLabel(criterion.rating)}</span>
                </div>
                <input
                  className="range-hud"
                  data-high={criterion.rating === 2 ? "true" : "false"}
                  type="range"
                  min={0}
                  max={2}
                  step={1}
                  value={criterion.rating}
                  disabled
                  aria-readonly="true"
                  aria-valuetext={`${ratingLabel(criterion.rating)}. ${ratingDescription(criterion.definition, criterion.rating)}`}
                />
              </div>
            ))}
          </section>
        );
      })}
    </div>
  );
}

function previewSource(syntheticMode: boolean, handoff: ModuleHandoff) {
  if (syntheticMode) return "synthetic";
  if (handoff.status === "ready" && handoff.source === "skill03") return "skill03";
  return "mock";
}

function previewCaption(syntheticMode: boolean, handoff: ModuleHandoff, typologyLabel: string) {
  if (syntheticMode) return syntheticModuleLabel(handoff.status === "ready" ? handoff.moduleId : "") ?? "TEST DATA";
  if (handoff.status === "ready" && handoff.source === "skill03") return handoff.moduleId;
  return `Module mock · 20×20×20 · ${typologyLabel}`;
}

function sourceLine(handoff: ModuleHandoff) {
  if (handoff.status === "ready" && handoff.source === "skill03" && handoff.selectedFinal) {
    return `Source: Skill 3 Final Handoff · ${handoff.moduleId}`;
  }
  if (handoff.status === "ready" && handoff.provisional) return "Source · provisional";
  if (handoff.status !== "ready") return "Geometry unavailable";
  return `Source · ${handoff.source}`;
}

function previewMesh(syntheticMode: boolean, archetypeId: string, handoff: ModuleHandoff) {
  if (!archetypeId) return null;
  if (handoff.status === "ready" && (syntheticMode || handoff.source === "skill03")) return handoff.geometry;
  return null;
}

function previewColor(typologyId?: ModuleIdentity["typologyId"]): [number, number, number] {
  if (typologyId) return TYPOLOGY_COLOR[typologyId];
  return [1, 1, 1];
}

function assignedFaces(tileId: string, connections: readonly TileConnection[]) {
  const faces = new Set<FaceId>();
  for (const connection of connections) {
    if (connection.tileAId === tileId) faces.add(connection.faceA);
    if (connection.tileBId === tileId) faces.add(connection.faceB);
  }
  return faces;
}

function connectionForTile(tileId: string, connections: readonly TileConnection[], selectedConnectionId: string | null) {
  const involved = connections.filter((connection) => connection.tileAId === tileId || connection.tileBId === tileId);
  return involved.find((connection) => connection.id === selectedConnectionId) ?? involved[0] ?? null;
}

function chooseTileFace(
  tileId: string,
  face: FaceId,
  connections: readonly TileConnection[],
  selectedConnectionId: string | null,
  chooseFace: (connectionId: string, side: "faceA" | "faceB", face: FaceId) => void,
) {
  const connection = connectionForTile(tileId, connections, selectedConnectionId);
  if (!connection) return;
  chooseFace(connection.id, connection.tileAId === tileId ? "faceA" : "faceB", face);
}
