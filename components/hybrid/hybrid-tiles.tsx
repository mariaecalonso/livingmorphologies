"use client";

import { IconAtmospheric, IconFormal, IconSpatial } from "@/components/hud";
import { TYPOLOGIES, ratingDescription } from "@/lib/catalog";
import { ratingLabel } from "@/lib/physarum";
import type { FaceId } from "@/lib/skill4/contract";
import type { TileConnection } from "@/lib/skill4/connections";
import { resolveTileModule, type TileInstance } from "@/lib/skill4/tiles";
import type { GroupId } from "@/lib/types";
import type { ModuleHandoff, ModuleIdentity } from "@/lib/skill4/adapt";
import { MeshPreview } from "./mesh-preview";
import { moduleMock, TYPOLOGY_COLOR } from "@/lib/skill4/module-mock";
import { faceFrameOutline } from "@/lib/skill4/face-outline";
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
  if (handoff.status === "ready" && handoff.source === "mock" && handoff.provisional) {
    return { label: "Provisional mock", available: true };
  }
  return { label: "Geometry unavailable", available: false };
}

export function HybridTiles({ compact = false, only, faceNote }: { compact?: boolean; only?: string; faceNote?: string }) {
  const { loaded, tiles, connections, selectedId, selectedConnectionId, setSelectedId, setCanvasSelection, chooseArchetype, chooseFace, syntheticMode } = useHybrid();

  return (
    <div className="hybrid-slots">
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
              status={status}
              active={active}
              connections={connections}
              selectedConnectionId={selectedConnectionId}
              syntheticMode={syntheticMode}
              onSelect={() => {
                setSelectedId(tile.instanceId);
                setCanvasSelection(tile.instanceId);
              }}
              onArchetype={(archetypeId) => chooseArchetype(tile.instanceId, archetypeId)}
              onFace={(face) => chooseTileFace(tile.instanceId, face, connections, selectedConnectionId, chooseFace)}
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
                <div className="hybrid-preview" data-preview-source={syntheticMode ? "synthetic" : "mock"}>
                  {previewMesh(syntheticMode, tile.archetypeId, handoff) ? (
                    <MeshPreview mesh={previewMesh(syntheticMode, tile.archetypeId, handoff)} color={previewColor(identity?.typologyId)} kind={0} contain />
                  ) : null}
                  {handoff.status === "ready" ? null : <p className="hybrid-missing">{handoff.reason}</p>}
                </div>
                <p className="hybrid-units">{syntheticMode ? syntheticModuleLabel(handoff.status === "ready" ? handoff.moduleId : "") ?? "TEST DATA" : `Module mock · 20×20×20 · ${identity?.typologyLabel ?? ""}`}</p>
              </>
            )}
            {compact ? null : <p className="hybrid-source">Source · {handoff.source}{handoff.status === "ready" && handoff.provisional ? " · provisional" : ""}</p>}
            {faceNote ? <p className="hybrid-units">Selected face · {faceNote}</p> : null}
            {compact || !identity ? null : <CriteriaList identity={identity} />}
          </article>
        );
      })}
    </div>
  );
}

function TileSelectionCard({
  tile,
  handoff,
  identity,
  status,
  active,
  connections,
  selectedConnectionId,
  syntheticMode,
  onSelect,
  onArchetype,
  onFace,
}: {
  tile: TileInstance;
  handoff: ModuleHandoff;
  identity: ModuleIdentity | null;
  status: { label: string; available: boolean };
  active: boolean;
  connections: readonly TileConnection[];
  selectedConnectionId: string | null;
  syntheticMode: boolean;
  onSelect: () => void;
  onArchetype: (archetypeId: string) => void;
  onFace: (face: FaceId) => void;
}) {
  const assigned = assignedFaces(tile.instanceId, connections);
  const activeConnection = connectionForTile(tile.instanceId, connections, selectedConnectionId);
  const activeFace = activeConnection
    ? (activeConnection.tileAId === tile.instanceId ? activeConnection.faceA : activeConnection.faceB)
    : null;
  const testLabel = syntheticMode ? syntheticModuleLabel(handoff.status === "ready" ? handoff.moduleId : tile.moduleId) : null;
  const mesh = previewMesh(syntheticMode, tile.archetypeId, handoff);
  const guides = syntheticMode && handoff.status === "ready" && activeFace
    ? [{ mesh: faceFrameOutline(handoff.faces[activeFace]), color: [0.95, 0.78, 0.42] as [number, number, number] }]
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
        <label className="hybrid-field">
          <span className="eyebrow">Archetype</span>
          <select
            value={tile.archetypeId}
            onChange={(event) => onArchetype(event.target.value)}
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
        {testLabel ? <p className="hybrid-identity" data-synthetic-label={tile.instanceId}>{testLabel}</p> : identity ? <p className="hybrid-identity">{identity.name}</p> : null}
        <p className="hybrid-units">{tile.moduleId}</p>
        <p className="hybrid-typology">{identity?.typologyLabel ?? "Typology unavailable"}</p>
        <p className="hybrid-source">Source · {handoff.source}{handoff.status === "ready" && handoff.provisional ? " · provisional" : ""}</p>
        <p className="hybrid-status" data-available={status.available || undefined}>{status.label}</p>
      </div>
      <div className="hybrid-preview" data-preview-source={syntheticMode ? "synthetic" : "mock"} data-preview-typology={identity?.typologyId ?? ""} data-selected-face={activeFace ?? ""} data-preview-yaw={faceView(activeFace).yaw.toFixed(2)}>
        {mesh ? (
          <MeshPreview
            mesh={mesh}
            color={previewColor(identity?.typologyId)}
            kind={0}
            contain
            guides={guides}
            yaw={faceView(activeFace).yaw}
            pitch={faceView(activeFace).pitch}
          />
        ) : null}
        {handoff.status === "ready" ? null : <p className="hybrid-missing">{handoff.reason}</p>}
      </div>
      <div className="hybrid-face-diagram" aria-label={`${tile.instanceId} faces`}>
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
      </div>
      {identity ? <CriteriaList identity={identity} /> : null}
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

function previewMesh(syntheticMode: boolean, archetypeId: string, handoff: ModuleHandoff) {
  if (syntheticMode) return handoff.status === "ready" ? handoff.geometry : null;
  return moduleMock(archetypeId);
}

function previewColor(typologyId?: ModuleIdentity["typologyId"]): [number, number, number] {
  if (typologyId) return TYPOLOGY_COLOR[typologyId];
  return [1, 1, 1];
}

const FACE_VIEW: Record<FaceId, { yaw: number; pitch: number }> = {
  N: { yaw: 0.22, pitch: 0.42 },
  S: { yaw: Math.PI - 0.22, pitch: 0.42 },
  E: { yaw: -1.05, pitch: 0.4 },
  W: { yaw: 1.05, pitch: 0.4 },
  T: { yaw: 0.5, pitch: 1.05 },
  B: { yaw: 0.5, pitch: -0.95 },
};

function faceView(face: FaceId | null) {
  if (!face) return { yaw: 0.7, pitch: 0.35 };
  return FACE_VIEW[face];
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
