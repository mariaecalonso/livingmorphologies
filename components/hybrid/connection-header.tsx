"use client";

import { FACE_IDS } from "@/lib/skill4/contract";
import { connectionPairLabel, isFaceId, type TileConnection } from "@/lib/skill4/connections";
import { useConnectionBlocked, useHybrid } from "./hybrid-state";

export function ConnectionHeader({
  connection,
  openOnSelect = false,
}: {
  connection: TileConnection;
  openOnSelect?: boolean;
}) {
  const { selectedConnectionId, chooseFace, focusConnection, selectConnection } = useHybrid();
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
      <p className="hybrid-units">
        {connection.faceSelection === "suggested" ? "Suggested from placement · editable" : "Selected faces"}
        {connection.inputsChanged ? " · Generation inputs changed" : ""}
        {blocked ? " · Blocked · geometry unavailable" : " · Not generated"}
      </p>
    </article>
  );
}
