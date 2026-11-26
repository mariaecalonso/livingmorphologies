"use client";

import type { PlacementAssemblyStats } from "@/lib/skill5/placement-assembly-stats";
import { ZONE_COLOR } from "./site-zone-layer";

function StatBar({ value, color }: { value: number; color: string }) {
  const width = Math.min(100, Math.max(0, value));
  return (
    <span className="site-placement-stat-bar" aria-hidden="true">
      <i style={{ width: `${width}%`, background: color }} />
    </span>
  );
}

export function PlacementAssemblyStatsPanel({
  stats,
  nominal,
  nominalTotal,
  moduleSqft,
  moduleEnvelopeFt,
  unrecordedTiles,
}: {
  stats: PlacementAssemblyStats;
  nominal: { lobby: number; workspace: number; gathering: number };
  nominalTotal: number;
  moduleSqft: number;
  moduleEnvelopeFt: number;
  unrecordedTiles: number;
}) {
  const mirroredPercent = stats.clusterCount
    ? Math.round((stats.mirroredCount / stats.clusterCount) * 1000) / 10
    : 0;
  const groundPercent = stats.clusterCount
    ? Math.round((stats.groundCount / stats.clusterCount) * 1000) / 10
    : 0;
  const elevatedPercent = stats.clusterCount
    ? Math.round((stats.elevatedCount / stats.clusterCount) * 1000) / 10
    : 0;

  return (
    <div className="site-placement-stats-scroll">
      <section className="site-block" data-placement-assembly-stats>
        <h2 className="site-subtitle">Assembly</h2>
        <p className="site-stat" data-placement-cluster-total>
          <span>Placed clusters</span>
          <strong>{stats.clusterCount}</strong>
        </p>
        <p className="site-stat" data-placement-zone-occupancy>
          <span>Occupied zones</span>
          <strong>{stats.occupiedZones} / {stats.zoneCount}</strong>
        </p>
        <p className="site-note">Host zoning is where each instance sits. Constituent program below is tile mix from the catalog.</p>
      </section>

      <section className="site-block" data-placement-category-stats>
        <h2 className="site-subtitle">Catalog categories</h2>
        <ul className="site-placement-stat-list">
          {stats.categories.map((row) => (
            <li key={row.id} className="site-placement-stat-row" data-category={row.id}>
              <span className="site-placement-stat-label">{row.label}</span>
              <StatBar value={row.percent} color="#49d7de" />
              <span className="site-placement-stat-value">
                {row.count} <em>{row.percent}%</em>
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="site-block" data-placement-host-stats>
        <h2 className="site-subtitle">Host zoning</h2>
        <ul className="site-placement-stat-list">
          {stats.hostKinds.map((row) => (
            <li key={row.kind} className="site-placement-stat-row" data-host={row.kind}>
              <span className="site-placement-stat-label" style={{ color: ZONE_COLOR[row.kind] }}>{row.label}</span>
              <StatBar value={row.percent} color={ZONE_COLOR[row.kind]} />
              <span className="site-placement-stat-value">
                {row.count} <em>{row.percent}%</em>
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="site-block" data-placement-elevation-stats>
        <h2 className="site-subtitle">Elevation</h2>
        <p className="site-note">Ground contact uses each zone base and the rotated mesh seat, not a fixed Y of zero.</p>
        <ul className="site-placement-stat-list">
          <li className="site-placement-stat-row" data-elevation="ground">
            <span className="site-placement-stat-label">Ground-level</span>
            <StatBar value={groundPercent} color="#c77e5f" />
            <span className="site-placement-stat-value">
              {stats.groundCount} <em>{groundPercent}%</em>
            </span>
          </li>
          <li className="site-placement-stat-row" data-elevation="elevated">
            <span className="site-placement-stat-label">Elevated</span>
            <StatBar value={elevatedPercent} color="#49d7de" />
            <span className="site-placement-stat-value">
              {stats.elevatedCount} <em>{elevatedPercent}%</em>
              {stats.pendingElevation > 0 ? ` · ${stats.pendingElevation} pending mesh` : ""}
            </span>
          </li>
        </ul>
      </section>

      <section className="site-block" data-placement-mirror-stats>
        <h2 className="site-subtitle">Mirror</h2>
        <p className="site-stat" data-placement-mirrored>
          <span>Mirrored instances</span>
          <strong>{stats.mirroredCount} <em>{mirroredPercent}%</em></strong>
        </p>
      </section>

      <section className="site-block">
        <h2 className="site-subtitle">Program</h2>
        <p className="site-note">Constituent morphology tiles — nominal {moduleEnvelopeFt} ft module envelope ({moduleSqft} sq ft each). Not measured habitable area.</p>
        {(["lobby", "workspace", "gathering"] as const).map((kind) => (
          <p key={kind} className="site-stat" data-program={kind}>
            <span style={{ color: ZONE_COLOR[kind] }}>{kind === "lobby" ? "Lobby" : kind === "workspace" ? "Workspace" : "Gathering"} tiles</span>
            <strong>{nominal[kind].toLocaleString()} sq ft</strong>
            <span>{stats.constituentTiles[kind]} tiles</span>
          </p>
        ))}
        <p className="site-stat" data-program="total">
          <span>Total nominal area</span>
          <strong>{nominalTotal.toLocaleString()} sq ft</strong>
        </p>
        {unrecordedTiles > 0 ? (
          <p className="site-note">{unrecordedTiles} placed without a recorded typology mix in the catalog response.</p>
        ) : null}
      </section>
    </div>
  );
}