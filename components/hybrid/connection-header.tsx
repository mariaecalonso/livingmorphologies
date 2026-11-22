"use client";

import { FACE_IDS } from "@/lib/skill4/contract";
import { FACE_WORD, type CompatibleFacePair } from "@/lib/skill4/face-pair";
import { connectionPairLabel, isFaceId, type TileConnection } from "@/lib/skill4/connections";
import { generationStatusLabel } from "@/lib/skill4/hybrid-display";
import { useConnectionBlocked, useHybrid } from "./hybrid-state";

export function FaceReadout({
  connection,
  pairs,
}: {
  connection: TileConnection;
  pairs: readonly CompatibleFacePair[];
}) {
  const selected = pairs.find((pair) => pair.faceA === connection.faceA && pair.faceB === connection.faceB) ?? null;
  const next = pairs.find((pair) => pair.faceA !== connection.faceA || pair.faceB !== connection.faceB) ?? null;
  const auto = connection.faceSelection === "suggested";
  return (
    <p className="hybrid-units" data-face-readout={connection.id}>
      {auto ? "AUTO: " : ""}{connection.tileAId} — {FACE_WORD[connection.faceA]}
      {" · "}
      {auto ? "AUTO: " : ""}{connection.tileBId} — {FACE_WORD[connection.faceB]}
      {" · score "}
      {selected ? selected.score.toFixed(2) : "not in the compatibility record"}
      {" · next "}
      {next ? `${connection.tileAId} ${FACE_WORD[next.faceA]} · ${connection.tileBId} ${FACE_WORD[next.faceB]} · ${next.score.toFixed(2)}` : "none"}
    </p>
  );
}

export function ConnectionHeader({
  connection,
  openOnSelect = false,
}: {
  connection: TileConnection;
  openOnSelect?: boolean;
}) {
  const { selectedConnectionId, chooseFace, focusConnection, selectConnection, facePairs } = useHybrid();
  const blocked = useConnectionBlocked(connection);
  const active = connection.id === selectedConnectionId;
  const select = () => (openOnSelect ? focusConnection(connection.id) : selectConnection(connection.id));

  return (
    <article
      className="hybrid-connection-head"
      data-active={active || undefined}
      data-connection={connection.id}
      data-faces={`${connection.faceA}-${connection.faceB}`}
      data-face-selection={connection.faceSelection}
      data-blocked={blocked || undefined}
    >
      <button type="button" className="hybrid-connection-label" onClick={select}>
        {connectionPairLabel(connection)}
      </button>
      <div className="hybrid-face-row">
        {(["faceA", "faceB"] as const).map((side) => {
          const tileId = side === "faceA" ? connection.tileAId : connection.tileBId;
          const value = side === "faceA" ? connection.faceA : connection.faceB;
          return (
            <label key={side} className="hybrid-field">
              <span className="eyebrow">{tileId} face</span>
              <select
                className="hybrid-face-select"
                value={value}
                aria-label={`${tileId} face`}
                onChange={(event) => {
                  if (isFaceId(event.target.value)) chooseFace(connection.id, side, event.target.value);
                }}
              >
                {FACE_IDS.map((face) => (
                  <option key={face} value={face}>
                    {face}
                  </option>
                ))}
              </select>
            </label>
          );
        })}
      </div>
      <FaceReadout connection={connection} pairs={facePairs[connection.id] ?? []} />
      <p className="hybrid-units">
        {connection.faceSelection === "suggested" ? "Automatic compatibility · editable" : "Manual face override"}
        {connection.inputsChanged ? " · Generation inputs changed" : ""}
        {blocked ? " · Blocked · geometry unavailable" : ` · ${generationStatusLabel(connection.generationStatus)}`}
      </p>
    </article>
  );
}
