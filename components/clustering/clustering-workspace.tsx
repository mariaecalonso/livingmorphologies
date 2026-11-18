"use client";

import { useEffect, useMemo, useState } from "react";
import type { ClusterCatalog } from "@/lib/skill6/catalog";
import { displaySizeLabel, displaySizeOfCount, type ClusterRecord, type ClusterSize, type Vec3 } from "@/lib/skill6/contract";
import { ClusterView, assemblyGeometry, type ViewArchetype, type ViewExtra } from "@/components/clustering/cluster-view";
import { CardView, type StoredAssembly } from "@/components/clustering/card-view";
import { CLUSTER_COLLECTION, EngineLab, isEngineCollection } from "@/components/clustering/engine-lab";
import { JointDiagram } from "@/components/clustering/joint-diagram";
import styles from "@/components/clustering/clustering-workspace.module.css";

export type ClusteringTab = "initial" | "refined";

const COPY: Record<ClusteringTab, { kicker: string; title: string; body: string }> = {
  initial: {
    kicker: "Initial",
    title: "Clustering",
    body: "Rule-based clusters from the fifteen selected meshes. Outer-envelope seating uses yaw, pitch, and roll. A joint is kept when one coherent region meets the residual, alignment, and crossing limits.",
  },
  refined: {
    kicker: "Refined",
    title: "Clustering",
    body: "One joint from placement to refined mass.",
  },
};

type SortId = "tiles" | "solid" | "void" | "diversity" | "exposure";

const SORTS: { id: SortId; label: string }[] = [
  { id: "tiles", label: "Tiles" },
  { id: "solid", label: "Solid" },
  { id: "void", label: "Void" },
  { id: "diversity", label: "Diversity" },
  { id: "exposure", label: "Exposure" },
];

const BANDS: Record<ClusterSize, string> = { small: displaySizeLabel("small"), medium: displaySizeLabel("medium"), large: displaySizeLabel("large") };

function numberOf(cluster: ClusterRecord, sort: SortId): number {
  const metrics = cluster.metrics;
  if (!metrics) return -1;
  if (sort === "tiles") return metrics.tileCount;
  if (sort === "solid") return cluster.assembly?.refined.volume ?? metrics.solidVolume;
  if (sort === "void") return metrics.clusterVoidFraction ?? -1;
  if (sort === "diversity") return metrics.geometricDiversity;
  return metrics.surfaceExposure;
}

type LayerId = "tiles" | "patches" | "union" | "refined";

const LAYERS: { id: LayerId; label: string; shown: string[]; hideTiles: boolean }[] = [
  { id: "tiles", label: "Tiles", shown: [], hideTiles: false },
  { id: "patches", label: "Tiles + patches", shown: ["patch"], hideTiles: false },
  { id: "union", label: "Raw union", shown: ["union"], hideTiles: true },
  { id: "refined", label: "Refined", shown: ["refined"], hideTiles: true },
];

function format(value: number | null, digits = 2) {
  if (value == null || !Number.isFinite(value)) return "—";
  return value.toFixed(digits);
}

function signed(value: number) {
  return `${value > 0 ? "+" : value < 0 ? "−" : ""}${Math.abs(value).toFixed(1)}`;
}

/** Empty presentation canvas. Process and Refined Cluster are reserved; their working views are not built here. */
export function ClusteringPlaceholder({ title }: { title: string }) {
  return (
    <div className={styles.canvas} data-clustering="placeholder">
      <p>{title}</p>
    </div>
  );
}

/** Clustering lab. Initial opens on the engine lab; earlier collections stay on the catalog board. Refined stays open. */
export function ClusteringWorkspace({ tab, frame = true, collection = null }: { tab: ClusteringTab; frame?: boolean; collection?: string | null }) {
  const [source, setSource] = useState<string | null>(collection ?? CLUSTER_COLLECTION);
  if (tab === "refined") {
    return (
      <div className={frame ? styles.view : styles.bare} data-clustering={tab}>
        <JointDiagram />
      </div>
    );
  }
  if (isEngineCollection(source)) return <EngineLab frame={frame} collection={source ?? CLUSTER_COLLECTION} onCollection={setSource} />;
  return <CatalogBoard frame={frame} source={source} setSource={setSource} />;
}

/** Catalog, small-ground, and organization collections. The engine lab has its own board. */
function CatalogBoard({ frame, source, setSource }: { frame: boolean; source: string | null; setSource: (value: string | null) => void }) {
  const [strategy, setStrategy] = useState<"all" | "compact" | "branching" | "vertical" | "integrated">("all");
  const [catalog, setCatalog] = useState<ClusterCatalog | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [size, setSize] = useState<ClusterSize | "all">("all");
  const [sort, setSort] = useState<SortId>("tiles");
  const [selected, setSelected] = useState<string | null>(null);
  const [tileId, setTileId] = useState<string | null>(null);
  const [showContacts, setShowContacts] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    const address = source ? `/api/clustering/catalog?collection=${encodeURIComponent(source)}` : "/api/clustering/catalog";
    void fetch(address, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("The cluster catalog did not load.");
        return response.json() as Promise<ClusterCatalog>;
      })
      .then((body) => setCatalog(body))
      .catch((caught: unknown) => {
        if (caught instanceof DOMException && caught.name === "AbortError") return;
        setError(caught instanceof Error ? caught.message : "The cluster catalog did not load.");
      });
    return () => controller.abort();
  }, [source]);

  const visible = useMemo(() => {
    const clusters = catalog?.clusters ?? [];
    return clusters
      .filter((cluster) => size === "all" || displaySizeOfCount(cluster.metrics?.tileCount ?? cluster.tiles.length) === size)
      .filter((cluster) => source !== "organization-v1" || strategy === "all" || cluster.search?.organization === strategy)
      .slice()
      .sort((left, right) => (left.metrics?.tileCount ?? 0) - (right.metrics?.tileCount ?? 0) || (left.search?.organization ?? "").localeCompare(right.search?.organization ?? "") || numberOf(right, sort) - numberOf(left, sort));
  }, [catalog, size, sort, source, strategy]);

  const empty = useMemo(() => {
    if (!catalog) return "";
    if (size === "all") return "No current assembled cluster is stored.";
    const stored = catalog.archive.filter((entry) => displaySizeOfCount(entry.tiles) === size).length;
    return `No current assembled cluster in ${size} (${BANDS[size]} tiles). ${stored ? `${stored} earlier or unsuccessful records at this size stay in the archive.` : "Nothing at this size is stored."}`;
  }, [catalog, size]);

  useEffect(() => {
    if (visible.length === 0) return;
    if (!visible.some((cluster) => cluster.id === selected)) setSelected(visible[0].id);
  }, [visible, selected]);

  const current = visible.find((cluster) => cluster.id === selected) ?? null;
  const archetypes: ViewArchetype[] = catalog?.archetypes ?? [];
  const assembly = current?.assembly ?? null;
  const reading = current ? catalog?.validation[current.id] ?? null : null;
  const [layer, setLayer] = useState<LayerId>("refined");
  const [extras, setExtras] = useState<{ id: string; list: ViewExtra[] } | null>(null);

  useEffect(() => {
    if (!assembly || !current) return;
    if (extras?.id === current.id) return;
    const controller = new AbortController();
    const collectionQuery = source ? `&collection=${encodeURIComponent(source)}` : "";
    void fetch(`/api/clustering/assembly?id=${encodeURIComponent(current.id)}${collectionQuery}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("The assembly did not load.");
        return response.json() as Promise<StoredAssembly>;
      })
      .then((body) => {
        const list: ViewExtra[] = [];
        if (body.raw) list.push({ id: "union", geometry: assemblyGeometry(body.raw), color: "#d5d5d5" });
        if (body.refined) list.push({ id: "refined", geometry: assemblyGeometry(body.refined), color: "#d5d5d5" });
        for (const patch of body.patches) if (patch) list.push({ id: "patch", geometry: assemblyGeometry(patch), color: "#c77e5f" });
        setExtras({ id: current.id, list });
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [assembly, current, extras, source]);

  const stageTiles = useMemo(() => {
    if (!current) return [];
    if (!assembly) return current.tiles;
    const seated = new Map(assembly.seatedTiles.map((item) => [item.instanceId, item.pose]));
    return current.tiles.map((item) => ({ ...item, pose: seated.get(item.instanceId) ?? item.pose }));
  }, [current, assembly]);
  const tile = stageTiles.find((item) => item.instanceId === tileId) ?? null;
  /** Contact samples are stored in the rigid frame. The assembly draws them with the same ground lift as the tiles. */
  const stageContacts = useMemo(() => {
    if (!current) return undefined;
    const lift = assembly?.ground.lift ?? 0;
    if (!lift) return current.contacts;
    const up = (point: Vec3): Vec3 => [point[0], point[1], point[2] + lift];
    return current.contacts.map((contact) => ({
      ...contact,
      samples: contact.samples.map((sample) => ({ ...sample, host: up(sample.host), guest: up(sample.guest) })),
      rejected: contact.rejected.map((item) => ({ ...item, point: up(item.point) })),
    }));
  }, [current, assembly]);
  const stageExtras = assembly && extras && extras.id === current?.id ? extras.list : undefined;
  const layerSpec = LAYERS.find((item) => item.id === layer) ?? LAYERS[0];
  const showLayer = Boolean(assembly && stageExtras);

  return (
    <div className={frame ? styles.board : styles.boardBare} data-clustering="initial">
      <aside className={styles.list} aria-label="Cluster catalog">
        <p className={styles.kicker}>{source === "organization-v1" ? "Organization" : source === "small-ground-v2" ? "Small ground v2" : source ? "Small ground v1" : "Initial"}</p>
        <h1 className={styles.title}>Clustering</h1>
        <div className={styles.filters}>
          <button type="button" onClick={() => setSource(CLUSTER_COLLECTION)}>Engines</button>
          <button type="button" data-on={source ? "false" : "true"} onClick={() => { setSource(null); setStrategy("all"); setSelected(null); }}>Catalog</button>
          <button type="button" data-on={source === "small-ground-v1" ? "true" : "false"} onClick={() => { setSource("small-ground-v1"); setStrategy("all"); setSelected(null); }}>Small ground</button>
          <button type="button" data-on={source === "small-ground-v2" ? "true" : "false"} onClick={() => { setSource("small-ground-v2"); setStrategy("all"); setSelected(null); }}>Small ground v2</button>
          <button type="button" data-on={source === "organization-v1" ? "true" : "false"} onClick={() => { setSource("organization-v1"); setStrategy("all"); setSelected(null); }}>Organization</button>
        </div>
        {source === "organization-v1" ? (
          <div className={styles.filters}>
            {(["all", "compact", "branching", "vertical"] as const).map((item) => (
              <button key={item} type="button" data-on={strategy === item ? "true" : "false"} onClick={() => { setStrategy(item); setSelected(null); }}>{item}</button>
            ))}
          </div>
        ) : null}
        <div className={styles.filters}>
          {(["all", "small", "medium", "large"] as const).map((band) => (
            <button key={band} type="button" data-on={size === band ? "true" : "false"} onClick={() => setSize(band)}>
              {band === "all" ? "all" : `${band} ${BANDS[band]}`}
            </button>
          ))}
        </div>
        <div className={styles.filters}>
          {SORTS.map((item) => (
            <button key={item.id} type="button" data-on={sort === item.id ? "true" : "false"} onClick={() => setSort(item.id)}>
              {item.label}
            </button>
          ))}
        </div>
        {error ? <p className={styles.body}>{error}</p> : null}
        {!catalog && !error ? <p className={styles.body}>Reading the stored assemblies.</p> : null}
        {catalog && visible.length === 0 ? <p className={styles.body}>{empty}</p> : null}
        <ul className={styles.cards}>
          {visible.map((cluster) => {
            const check = catalog?.validation[cluster.id]?.refined;
            return (
            <li key={cluster.id}>
              <button type="button" className={styles.card} data-on={cluster.id === selected ? "true" : "false"} onClick={() => { setSelected(cluster.id); setTileId(null); }}>
                <span className={styles.cardView}>
                  <CardView cluster={cluster} archetypes={archetypes} collection={source} />
                </span>
                <span className={styles.cardCopy}>
                  <b>{cluster.search?.engine ? `${cluster.search.engine} · ` : ""}{cluster.search?.organization ? `${cluster.search.organization} · ` : ""}{displaySizeOfCount(cluster.metrics?.tileCount ?? cluster.tiles.length) ?? "open"} · {cluster.metrics?.tileCount ?? 0}</b>
                  <i>{check ? `${check.bodies} solid · ${check.cavities} cavities${check.penetrations ? ` · ${check.penetrations} penetrations` : ""}` : `${cluster.assembly?.refined.components ?? "—"} solid · not measured`}</i>
                  <em>{cluster.tiles.map((item) => item.name).filter((name, index, names) => names.indexOf(name) === index).slice(0, 3).join(" · ")}</em>
                </span>
              </button>
            </li>
            );
          })}
        </ul>
      </aside>
      <section className={styles.stage} aria-label="Cluster geometry">
        {current && current.tiles.length > 0 ? (
          <ClusterView
            tiles={stageTiles}
            archetypes={archetypes}
            contacts={stageContacts}
            showContacts={showContacts}
            selectedId={tileId}
            interactive
            marker="stage"
            onSelect={setTileId}
            extras={stageExtras}
            shownExtras={showLayer ? layerSpec.shown : undefined}
            hideTiles={showLayer && layerSpec.hideTiles}
            floorZ={assembly ? 0 : undefined}
          />
        ) : (
          <p className={styles.body}>{catalog ? empty : ""}</p>
        )}
        <div className={styles.tools}>
          <button type="button" onClick={() => document.querySelector<HTMLCanvasElement>("[data-cluster-view='stage']")?.dispatchEvent(new Event("lm-cluster-fit"))}>Fit</button>
          {assembly ? (
            LAYERS.map((item) => (
              <button key={item.id} type="button" data-on={layer === item.id ? "true" : "false"} disabled={!stageExtras} onClick={() => setLayer(item.id)}>{item.label}</button>
            ))
          ) : null}
          <button type="button" data-on={showContacts ? "true" : "false"} onClick={() => setShowContacts((value) => !value)}>Contact</button>
          <span>Drag rotates · shift or right-drag moves · wheel zooms</span>
        </div>
      </section>
      <aside className={styles.detail} aria-label="Cluster specification">
        {current?.metrics ? (
          <div className={styles.spec}>
            <div className={styles.specMain}>
            <p className={styles.kicker}>{current.id}</p>
            <h2 className={styles.title}>{current.search?.engine ? `${current.search.engine} · ` : ""}{current.search?.organization ? `${current.search.organization} · ` : ""}{displaySizeOfCount(current.metrics?.tileCount ?? current.tiles.length) ?? "open"} · {current.metrics?.tileCount ?? current.tiles.length} tiles</h2>
            {source === "organization-v1" ? (
              <div className={styles.filters}>
                {(catalog?.clusters ?? []).filter((cluster) => cluster.metrics?.tileCount === current.metrics?.tileCount && cluster.id.split("-").slice(2).join("-") === current.id.split("-").slice(2).join("-")).map((cluster) => (
                  <button key={cluster.id} type="button" data-on={cluster.id === current.id ? "true" : "false"} onClick={() => { setStrategy(cluster.search?.organization ?? "all"); setSelected(cluster.id); setTileId(null); }}>{cluster.search?.organization ?? cluster.id}</button>
                ))}
              </div>
            ) : null}
            <p className={styles.note}>{current.algorithm} · {current.status}{current.search?.trace ? ` · ${current.search.trace}` : ""}{catalog?.compatibility ? ` · ${catalog.compatibility.compatiblePairs} compatible of ${catalog.compatibility.testedPairs} pairs · ${catalog.compatibility.shiftPoses} slides` : ""}{current.search ? ` · ${current.search.evaluations} evaluations · ${current.search.backtracks} backtracks · ${current.search.stop}${typeof current.search.untried === "number" ? ` · ${current.search.untried} untried` : ""}${typeof current.search.geometricRejections === "number" ? ` · ${current.search.geometricRejections} geometric rejections` : ""}` : ""}</p>
            {current.reason ? <p className={styles.note}>{current.reason}</p> : null}
            <dl className={styles.metrics}>
              <div><dt>Typology</dt><dd>{current.metrics.dominantTypology}{current.metrics.dominantTied ? " · tied" : ""}</dd></div>
              <div><dt>Distribution</dt><dd>{Object.entries(current.metrics.typologyDistribution).map(([id, count]) => `${id} ${count}`).join(" · ")}</dd></div>
              <div><dt>Archetype diversity</dt><dd>{format(current.metrics.archetypeDiversity)} · {current.metrics.uniqueArchetypes} unique</dd></div>
              <div><dt>Tile cell void</dt><dd>{format(current.metrics.tileCellVoidFraction)} · {current.metrics.tileCellVoidFractionAvailability}</dd></div>
              <div><dt>Cluster void</dt><dd>{format(current.metrics.clusterVoidFraction)} · {current.metrics.clusterVoidFractionAvailability}</dd></div>
              <div><dt>Solid volume</dt><dd>{assembly ? `refined ${format(assembly.refined.volume, 0)} · tiles ` : ""}{format(current.metrics.solidVolume, 0)} · overlap {format(current.metrics.overlapVolume, 1)}</dd></div>
              <div><dt>Bounding volume</dt><dd>{format(current.metrics.boundingVolume, 0)}</dd></div>
              <div><dt>Surface exposure</dt><dd>{format(current.metrics.surfaceExposure, 0)} · {current.metrics.surfaceExposureAvailability}</dd></div>
              <div><dt>Connectivity</dt><dd>{current.metrics.connected ? "one component" : `${current.metrics.components} components`} · {current.metrics.contactEdges} joints</dd></div>
              <div><dt>Geometric diversity</dt><dd>{format(current.metrics.geometricDiversity)}</dd></div>
            </dl>
            <p className={styles.note}>
              Tile cell void is 1 − solid / 8000. Cluster void is 1 − combined solid / tight bounding volume. Overlap stays 0 when no triangles cross. Exposure subtracts twice the coherent contact area. Contact draws the accepted region in cyan, normals in white, and rejected aims in copper.
            </p>
            </div>
            <div className={styles.specSide}>
            {assembly ? (
              <>
                <dl className={styles.metrics}>
                  <div><dt>Joints</dt><dd>{assembly.counts["patched-near-contact"]} patched · {assembly.counts["direct-contact"]} direct · {assembly.counts["failed-patch"]} failed</dd></div>
                  <div><dt>Patch</dt><dd>implicit blend · radius {assembly.patchSettings.radius} · voxel {assembly.patchSettings.cell}</dd></div>
                  <div><dt>Raw union</dt><dd>{assembly.union.components ?? "—"} solid · {assembly.union.cavities ?? 0} sealed cavities · {assembly.union.status}</dd></div>
                  <div><dt>Refined</dt><dd>{assembly.refined.components ?? "—"} solid · max shift {format(assembly.refined.maxShift)} · seam creases {assembly.refined.seamSharpEdgesBefore} → {assembly.refined.seamSharpEdgesAfter}</dd></div>
                  <div><dt>Measured</dt><dd>{reading ? `${reading.refined.bodies} body · ${reading.refined.cavities} cavities · genus ${reading.refined.genus} · ${reading.refined.penetrations} penetrations · ${reading.refined.grazes} grazes` : "Not measured for this mesh."}</dd></div>
                  <div><dt>Ground</dt><dd>lift {format(assembly.ground.lift)} · refined min Z {format(reading?.refined.minZ ?? assembly.refined.minZ, 3)}{reading ? ` · tiles min Z ${format(reading.seatedTilesMinZ, 3)} · tiles to surface ${format(reading.refinedToTilesOffset, 3)}` : ""}</dd></div>
                  <div><dt>Graph</dt><dd>depth {assembly.graph.maxDepth} · branches {assembly.graph.branchPoints.join(", ") || "none"} · leaves {assembly.graph.leaves.join(", ")}</dd></div>
                </dl>
                <ul className={styles.tiles}>
                  {assembly.growth.map((step) => {
                    const joint = assembly.joints.find((item) => item.primary && item.guestInstanceId === step.instanceId);
                    const rise = reading?.growth.find((item) => item.instanceId === step.instanceId);
                    return (
                      <li key={step.instanceId}>
                        <button type="button" data-on={tileId === step.instanceId ? "true" : "false"} onClick={() => setTileId(step.instanceId)}>
                          <b>{step.step}</b> {step.instanceId}{step.hostInstanceId ? ` ← ${step.hostInstanceId}` : " seed"}
                          <i>{step.direction ?? "—"} · {step.placement}{rise ? ` · base ${signed(rise.baseChange)}${rise.rejection ? " · rejected" : ""}` : ""}{joint ? ` · ${joint.classification}${joint.patch?.footprint ? ` · patch ${joint.patch.footprint.extent.map((value) => value.toFixed(1)).join(" × ")}` : ""}` : ""}</i>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </>
            ) : null}
            <ul className={styles.tiles}>
              {stageTiles.map((item) => {
                const tilt = reading?.tiles.find((entry) => entry.instanceId === item.instanceId)?.tiltDegrees;
                return (
                <li key={item.instanceId}>
                  <button type="button" data-on={tileId === item.instanceId ? "true" : "false"} onClick={() => setTileId(item.instanceId)}>
                    <b>{item.instanceId}</b> {item.name}
                    <i>{item.typologyId} · {item.pose.mirrorX ? "mirror · " : ""}{tilt != null ? `tilt ${tilt.toFixed(0)}° · ` : ""}{item.pose.translation.map((value) => value.toFixed(1)).join(", ")}</i>
                  </button>
                </li>
                );
              })}
            </ul>
            {tile ? (
              <p className={styles.note}>
                {tile.moduleId}
                <br />
                {assembly ? "seated translation" : "translation"} {tile.pose.translation.map((value) => value.toFixed(2)).join(", ")}
                <br />
                {current.contacts.filter((contact) => contact.hostId === tile.instanceId || contact.guestId === tile.instanceId).map((contact) => (
                  `${contact.attachment} ${contact.searchNote} · ${contact.verdict} · gap ${contact.residualGap?.toFixed(3) ?? "—"} · area ${contact.contactArea.toFixed(2)} · regions ${contact.coherentRegions} · align ${contact.normalAlignment.toFixed(3)} · depth ${contact.deepestCrossing.toFixed(3)} · overlap ${contact.overlapVolume == null ? "—" : contact.overlapVolume.toFixed(3)}`
                )).join(" · ") || "Seed tile"}
              </p>
            ) : null}
            </div>
          </div>
        ) : (
          <>
            <p className={styles.kicker}>{current?.algorithm ?? "Clustering"}</p>
            <p className={styles.body}>{current?.reason ?? COPY.initial.body}</p>
            {current && current.tiles.length > 0 ? (
              <ul className={styles.tiles}>
                {current.tiles.map((item) => (
                  <li key={item.instanceId}><b>{item.instanceId}</b> {item.name}</li>
                ))}
              </ul>
            ) : null}
            {current?.contacts.map((contact) => (
              <p key={`${contact.hostId}-${contact.guestId}`} className={styles.note}>
                {contact.attachment} {contact.searchNote} · {contact.verdict} · area {contact.contactArea.toFixed(2)} · gap {contact.residualGap?.toFixed(3) ?? "—"} · depth {contact.deepestCrossing.toFixed(3)}
              </p>
            ))}
          </>
        )}
      </aside>
    </div>
  );
}

/** A chapter page whose drawing or text is not stored yet. */
export function PendingFrame({ kicker, title, body, frame = false }: { kicker: string; title: string; body: string; frame?: boolean }) {
  return (
    <div className={frame ? styles.view : styles.bare}>
      <section className={frame ? styles.frame : styles.copy} aria-label={title}>
        <p className={styles.kicker}>{kicker}</p>
        <h1 className={styles.title}>{title}</h1>
        <p className={styles.body}>{body}</p>
      </section>
    </div>
  );
}
