"use client";

import { IconAtmospheric, IconFormal, IconSpatial } from "@/components/hud";
import { TYPOLOGIES, ratingDescription } from "@/lib/catalog";
import { ratingLabel } from "@/lib/physarum";
import { resolveTileModule } from "@/lib/skill4/tiles";
import type { GroupId } from "@/lib/types";
import type { ModuleHandoff } from "@/lib/skill4/adapt";
import { MeshPreview } from "./mesh-preview";
import { moduleMock, TYPOLOGY_COLOR } from "@/lib/skill4/module-mock";
import { useHybrid } from "./hybrid-state";

const GROUP_ICON = {
  formal: IconFormal,
  spatial: IconSpatial,
  atmospheric: IconAtmospheric,
} as const;

export function geometryStatus(handoff: ModuleHandoff) {
  if (handoff.status === "ready" && handoff.source === "mock" && handoff.provisional) {
    return { label: "Provisional mock", available: true };
  }
  return { label: "Geometry unavailable", available: false };
}

export function HybridTiles({ compact = false }: { compact?: boolean }) {
  const { loaded, tiles, selectedId, setSelectedId, chooseArchetype } = useHybrid();

  return (
    <div className="hybrid-slots">
      {tiles.map((tile) => {
        const handoff = resolveTileModule(tile.archetypeId, loaded);
        const identity = handoff.identity;
        const status = geometryStatus(handoff);
        const active = tile.instanceId === selectedId;
        return (
          <article
            key={tile.instanceId}
            className="hybrid-slot"
            data-active={active || undefined}
            data-tile={tile.instanceId}
            data-status={handoff.status}
            data-source={handoff.source}
            onClick={() => setSelectedId(tile.instanceId)}
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
                <div className="hybrid-preview">
                  {identity ? <MeshPreview mesh={moduleMock(tile.archetypeId)} color={TYPOLOGY_COLOR[identity.typologyId]} kind={0} /> : null}
                  {handoff.status === "ready" ? null : <p className="hybrid-missing">{handoff.reason}</p>}
                </div>
                <p className="hybrid-units">Module mock · 20×20×20 · {identity?.typologyLabel}</p>
              </>
            )}
            {compact ? null : <p className="hybrid-source">Source · {handoff.source}</p>}
            {compact || !identity ? null : (
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
            )}
          </article>
        );
      })}
    </div>
  );
}
