"use client";

import { useEffect, useState } from "react";

type ReviewRow = {
  iteration: number;
  tiles: number;
  size: string;
  planSpread: number;
  path: string;
  meaningfulBranches: number;
  enclosureDirections: number;
  verticalLevels: number;
  score: number | null;
  pass: boolean;
  flags: string[];
  thumb: string;
};

type ReviewBoard = {
  programId: string;
  rows: ReviewRow[];
};

function thumbName(thumb: string) {
  return thumb.split("/").pop() ?? "";
}

export function MorphologyReview() {
  const [boards, setBoards] = useState<ReviewBoard[] | null>(null);
  useEffect(() => {
    let cancel = false;
    fetch("/api/skill4/morphology-review", { cache: "no-store" })
      .then((response) => response.json() as Promise<ReviewBoard[]>)
      .then((next) => {
        if (!cancel) setBoards(next);
      })
      .catch(() => {
        if (!cancel) setBoards([]);
      });
    return () => {
      cancel = true;
    };
  }, []);
  const rows = (boards ?? []).flatMap((board) => board.rows.map((row) => ({ programId: board.programId, ...row })));
  return (
    <div data-morphology-review="">
      {boards === null ? <p className="hybrid-units">Loading Morphology Review</p> : null}
      {boards !== null && rows.length === 0 ? <p className="hybrid-units">No morphology review has been saved.</p> : null}
      {rows.length > 0 ? (
        <table>
          <tbody>
            {rows.map((row) => (
              <tr key={`${row.programId}-${row.iteration}`}>
                <td>{row.programId}</td>
                <td>{String(row.iteration).padStart(2, "0")}</td>
                <td>{row.tiles}</td>
                <td>{row.size}</td>
                <td>{row.planSpread}</td>
                <td>{row.path}</td>
                <td>{row.meaningfulBranches}</td>
                <td>{row.enclosureDirections}</td>
                <td>{row.verticalLevels}</td>
                <td>{row.score ?? "—"}</td>
                <td data-pass={row.pass ? "yes" : "no"}>{row.pass ? "PASS" : "FAIL"}</td>
                <td>{row.flags.join(", ")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
      <div data-morphology-grid="">
        {rows.map((row) => (
          <figure key={`${row.programId}-${row.iteration}`}>
            <img src={`/api/skill4/morphology-review?thumb=${encodeURIComponent(thumbName(row.thumb))}`} alt="" />
            <figcaption>
              <b>{String(row.iteration).padStart(2, "0")} · {row.pass ? "PASS" : "FAIL"}</b>
              {" "}{row.size}
              <br />
              {row.programId}
              {row.flags[0] ? <><br />{row.flags[0]}</> : null}
            </figcaption>
          </figure>
        ))}
      </div>
    </div>
  );
}
