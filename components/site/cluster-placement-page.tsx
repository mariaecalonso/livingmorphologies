"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import context from "@/data/skill5/herald-site.json";
import { FINAL_CLUSTER_PAIRS, type FinalClusterPairId } from "@/lib/skill4/final-cluster-pairs";
import type { PlacementCluster, PlacementRank } from "@/lib/skill4/cluster-placement-rank";
import type { GumballPose } from "@/lib/skill5/gumball";
import { SKILL5_MODULE_ENVELOPE_FEET } from "@/lib/skill5/contract";
import {
  mirrorStackPose,
  newOccupancyId,
  occupanciesInZone,
  placementProgramKinds,
  poseForAddedCluster,
  readOccupancyList,
  rotatedPoseDrop,
  rigidGroupMemberPose,
  clusterOverWater,
  clusterSinkMinPoseY,
  seatPoseOnSupport,
  upsertOccupancy,
  type ClusterSitePose,
  type ClusterSupport,
  type PlacedCluster,
} from "@/lib/skill5/placed-cluster";
import type { SiteContext } from "@/lib/skill5/site-model";
import { readZoningList, ZONE_KIND_ORDER, type ZoneKind, type ZoningRegion } from "@/lib/skill5/zoning";
import { announceWorkingOccupancy, placeOccupancy, readWorkingOccupancy, saveClusterAssemblyRecord, sendAssemblyForDevelopment } from "./cluster-assembly-catalog";
import { occupancyMeshKey, occupancyModel, occupancyPoseToGumball, fetchOccupancyMesh, gumballToOccupancyPose } from "./occupancy-solids";
import { ZONE_COLOR } from "./site-zone-layer";
import { PlacementClusterThumb, preloadPlacementThumbs } from "./placement-cluster-thumb";
import { SiteViewport, type SiteViewMode } from "./site-viewport";

const site = context as SiteContext;
const waterRing = site.water.ring;
const QUARTER = Math.PI / 2;
const PLAN_YAW_STEP = Math.PI / 12;
const MODULE_SQFT = SKILL5_MODULE_ENVELOPE_FEET * SKILL5_MODULE_ENVELOPE_FEET;
const VERTICAL_NUDGE_FT = 10;
const PASTE_OFFSET_FT = 24;
const HISTORY_LIMIT = 50;

type PlacementClipboardMember = {
  zoneId: string;
  programId: string;
  finishedClusterId: string;
  transform: ClusterSitePose;
  source: PlacedCluster["source"];
  zoningSignature: string;
  selectedNetworkId: string;
  provenance: PlacedCluster["provenance"];
  relX: number;
  relY: number;
  relZ: number;
};

function clonePlacedCluster(record: PlacedCluster): PlacedCluster {
  return {
    ...record,
    transform: { ...record.transform },
    source: {
      ...record.source,
      modules: record.source.modules.map((module) => ({ ...module })),
    },
  };
}

function cloneOccupancyList(list: readonly PlacedCluster[]) {
  return list.map(clonePlacedCluster);
}

const ZONE_CATEGORIES: Record<ZoneKind, readonly FinalClusterPairId[]> = {
  lobby: ["lobby-lobby", "workspace-lobby", "lobby-gathering", "mixed"],
  workspace: ["workspace-workspace", "workspace-gathering", "workspace-lobby", "mixed"],
  gathering: ["gathering-gathering", "workspace-gathering", "lobby-gathering", "mixed"],
};

function snapQuarterRadians(radians: number) {
  return Math.round(radians / QUARTER) * QUARTER;
}

function snapPlanYawRadians(radians: number) {
  return Math.round(radians / PLAN_YAW_STEP) * PLAN_YAW_STEP;
}

type ArmedCluster = { programId: FinalClusterPairId; clusterId: string; label: string };
type NetworkDraw = { id: string; index: number; title: string; branches: { x0: number; z0: number; x1: number; z1: number }[] };

function snapQuarter(degrees: number) {
  return ((Math.round(degrees / 90) * 90) % 360 + 360) % 360;
}

function snapPlanYaw(degrees: number) {
  return ((Math.round(degrees / 15) * 15) % 360 + 360) % 360;
}

function clusterSupporters(
  occupancy: readonly PlacedCluster[],
  meshes: Record<string, { positions: Float32Array; indices: Uint32Array } | null>,
  excludeId?: string,
  excludeIds?: ReadonlySet<string>,
): ClusterSupport[] {
  return occupancy.flatMap((item) => {
    if (excludeId && item.occupancyId === excludeId) return [];
    if (excludeIds?.has(item.occupancyId)) return [];
    const positions = meshes[occupancyMeshKey(item)]?.positions;
    if (!positions) return [];
    return [{ positions, pose: item.transform }];
  });
}

function PlacementCatalogCard({
  pairId,
  cluster,
  index,
  active,
  onPick,
}: {
  pairId: FinalClusterPairId;
  cluster: PlacementCluster;
  index: number;
  active: boolean;
  onPick: () => void;
}) {
  const label = `Cluster ${String(index + 1).padStart(2, "0")}`;
  return (
    <div className="site-cluster-card" data-active={active || undefined}>
      <button type="button" data-active={active || undefined} onClick={onPick}>
        <span className="site-module-glass">
          <PlacementClusterThumb clusterId={cluster.id.includes(":") ? cluster.id : `${pairId}:${cluster.id}`} />
        </span>
        <em>{label} · {cluster.tileCount} tiles</em>
      </button>
    </div>
  );
}

export function ClusterPlacementPage() {
  const router = useRouter();
  const [network, setNetwork] = useState<NetworkDraw | null>(null);
  const [zones, setZones] = useState<ZoningRegion[]>([]);
  const [pairId, setPairId] = useState<FinalClusterPairId>("lobby-lobby");
  const [rank, setRank] = useState<PlacementRank | null>(null);
  const [armed, setArmed] = useState<ArmedCluster | null>(null);
  const [occupancy, setOccupancy] = useState<PlacedCluster[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const selectedIdsRef = useRef<string[]>([]);
  selectedIdsRef.current = selectedIds;
  const primaryId = selectedIds[selectedIds.length - 1] ?? null;
  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null);
  const [live, setLive] = useState<(GumballPose & { id: string }) | null>(null);
  const [liveTransforms, setLiveTransforms] = useState<Record<string, ClusterSitePose> | null>(null);
  const groupBaseRef = useRef<Map<string, ClusterSitePose> | null>(null);
  const shiftHeldRef = useRef(false);
  const [shiftHeld, setShiftHeld] = useState(false);
  const rigidGroupRef = useRef(false);
  const occupancyRef = useRef(occupancy);
  occupancyRef.current = occupancy;
  const [, setHistoryPast] = useState<PlacedCluster[][]>([]);
  const [, setHistoryFuture] = useState<PlacedCluster[][]>([]);
  const clipboardRef = useRef<{
    anchor: ClusterSitePose;
    members: PlacementClipboardMember[];
  } | null>(null);
  const pasteGenerationRef = useRef(0);

  const selectCluster = useCallback((id: string | null, shiftKey = false) => {
    if (!id) {
      setSelectedIds([]);
      return;
    }
    setSelectedIds((current) => {
      if (shiftKey) {
        if (current.includes(id)) return current.filter((item) => item !== id);
        return [...current, id];
      }
      return [id];
    });
  }, []);

  useEffect(() => {
    groupBaseRef.current = null;
    rigidGroupRef.current = false;
    setLiveTransforms(null);
  }, [selectedIds]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Shift") {
        shiftHeldRef.current = true;
        setShiftHeld(true);
      }
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.key === "Shift") {
        shiftHeldRef.current = false;
        setShiftHeld(false);
      }
    };
    const onBlur = () => {
      shiftHeldRef.current = false;
      setShiftHeld(false);
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
    };
  }, []);
  const [meshes, setMeshes] = useState<Record<string, { positions: Float32Array; indices: Uint32Array } | null>>({});
  const [notice, setNotice] = useState("");
  const [activeView, setActiveView] = useState<SiteViewMode>("plan");
  const [showSiteContext, setShowSiteContext] = useState(true);
  const [showSiteZoning, setShowSiteZoning] = useState(true);
  const [saving, setSaving] = useState(false);
  const [mirroring, setMirroring] = useState(false);
  const [lockedIds, setLockedIds] = useState<string[]>([]);
  const lockedIdsRef = useRef<string[]>([]);
  lockedIdsRef.current = lockedIds;
  const [hiddenIds, setHiddenIds] = useState<string[]>([]);
  const hiddenIdsRef = useRef<string[]>([]);
  hiddenIdsRef.current = hiddenIds;
  const [mixes, setMixes] = useState<Record<string, { lobby: number; workspace: number; gathering: number }>>({});

  useEffect(() => {
    preloadPlacementThumbs();
  }, []);

  useEffect(() => {
    let cancel = false;
    void (async () => {
      const [archiveResponse, zoningResponse] = await Promise.all([
        fetch("/api/site/strategy-archive", { cache: "no-store" }),
        fetch("/api/site/designer-zoning", { cache: "no-store" }),
      ]);
      const archive = await archiveResponse.json() as {
        massingNetworkId?: string;
        iterations?: { id?: string; index?: number; layoutTitle?: string; branches?: NetworkDraw["branches"] }[];
      };
      const zoning = await zoningResponse.json() as { regions?: unknown };
      if (cancel) return;
      const massingId = typeof archive.massingNetworkId === "string" ? archive.massingNetworkId : "";
      const iteration = archive.iterations?.find((item) => item.id === massingId);
      setNetwork(iteration?.id ? {
        id: iteration.id,
        index: iteration.index ?? 0,
        title: iteration.layoutTitle || "Selected network",
        branches: iteration.branches ?? [],
      } : null);
      setZones(readZoningList(zoning.regions).filter((zone) => zone.networkId === massingId));
      setOccupancy(readOccupancyList(readWorkingOccupancy()).filter((item) => item.selectedNetworkId === massingId));
    })().catch(() => {
      if (!cancel) setNotice("The selected network or zoning could not be read.");
    });
    return () => { cancel = true; };
  }, []);

  useEffect(() => {
    if (!network?.id) return;
    try {
      const raw = sessionStorage.getItem(`placement-locks:${network.id}`);
      if (raw) {
        const parsed = JSON.parse(raw) as unknown;
        if (Array.isArray(parsed) && parsed.every((item) => typeof item === "string")) {
          setLockedIds(parsed);
        }
      }
    } catch {
      /* ignore */
    }
  }, [network?.id]);

  useEffect(() => {
    if (!network?.id) return;
    sessionStorage.setItem(`placement-locks:${network.id}`, JSON.stringify(lockedIds));
  }, [lockedIds, network?.id]);

  useEffect(() => {
    if (!network?.id) return;
    try {
      const raw = sessionStorage.getItem(`placement-hidden:${network.id}`);
      if (raw) {
        const parsed = JSON.parse(raw) as unknown;
        if (Array.isArray(parsed) && parsed.every((item) => typeof item === "string")) {
          setHiddenIds(parsed);
        }
      }
    } catch {
      /* ignore */
    }
  }, [network?.id]);

  useEffect(() => {
    if (!network?.id) return;
    sessionStorage.setItem(`placement-hidden:${network.id}`, JSON.stringify(hiddenIds));
  }, [hiddenIds, network?.id]);

  useEffect(() => {
    setLockedIds((current) => current.filter((id) => occupancy.some((item) => item.occupancyId === id)));
    setHiddenIds((current) => current.filter((id) => occupancy.some((item) => item.occupancyId === id)));
  }, [occupancy]);

  useEffect(() => {
    let cancel = false;
    setRank(null);
    void fetch(`/api/skill4/finished-catalog?program=${encodeURIComponent(pairId)}&view=placement`, { cache: "no-store" })
      .then((response) => response.json())
      .then((body: PlacementRank) => {
        if (!cancel) {
        setRank(body?.programId === pairId ? body : null);
        const next: Record<string, { lobby: number; workspace: number; gathering: number }> = {};
        for (const cluster of body?.clusters ?? []) {
          if (cluster.typologyMix) next[`${pairId}:${cluster.id}`] = cluster.typologyMix;
        }
        if (Object.keys(next).length > 0) setMixes((current) => ({ ...current, ...next }));
      }
      })
      .catch(() => {
        if (!cancel) setNotice("The Hybrid Cluster catalog could not be read.");
      });
    return () => { cancel = true; };
  }, [pairId]);

  useEffect(() => {
    const zone = zones.find((item) => item.id === selectedZoneId);
    if (!zone) return;
    const list = ZONE_CATEGORIES[zone.kind];
    if (!list.includes(pairId)) setPairId(list[0]);
  }, [pairId, selectedZoneId, zones]);

  useEffect(() => {
    const missing = occupancy.filter((record) => meshes[occupancyMeshKey(record)] === undefined);
    if (missing.length === 0) return;
    let cancel = false;
    void Promise.all(missing.map(async (record) => {
      try {
        return [occupancyMeshKey(record), await fetchOccupancyMesh(record.programId, record.finishedClusterId)] as const;
      } catch {
        return [occupancyMeshKey(record), null] as const;
      }
    })).then((entries) => {
      if (cancel) return;
      setMeshes((current) => {
        const next = { ...current };
        for (const [key, mesh] of entries) if (next[key] === undefined) next[key] = mesh;
        return next;
      });
    });
    return () => { cancel = true; };
  }, [meshes, occupancy]);

  const applyOccupancyState = useCallback((next: PlacedCluster[]) => {
    setOccupancy(next);
    const others = readOccupancyList(readWorkingOccupancy()).filter((item) => item.selectedNetworkId !== network?.id);
    announceWorkingOccupancy([...others, ...next]);
  }, [network?.id]);

  const commitOccupancy = useCallback((
    next: PlacedCluster[] | ((prev: PlacedCluster[]) => PlacedCluster[]),
  ) => {
    setOccupancy((prev) => {
      const resolved = typeof next === "function" ? next(prev) : next;
      setHistoryPast((past) => [...past.slice(-(HISTORY_LIMIT - 1)), cloneOccupancyList(prev)]);
      setHistoryFuture([]);
      const others = readOccupancyList(readWorkingOccupancy()).filter((item) => item.selectedNetworkId !== network?.id);
      announceWorkingOccupancy([...others, ...resolved]);
      return resolved;
    });
  }, [network?.id]);

  const clearSelection = useCallback(() => {
    setSelectedIds([]);
    setArmed(null);
    setLive(null);
    setLiveTransforms(null);
    groupBaseRef.current = null;
    rigidGroupRef.current = false;
  }, []);

  const undoPlacement = useCallback(() => {
    setHistoryPast((past) => {
      if (past.length === 0) {
        setNotice("Nothing to undo.");
        return past;
      }
      const snapshot = past[past.length - 1]!;
      setHistoryFuture((future) => [cloneOccupancyList(occupancyRef.current), ...future].slice(0, HISTORY_LIMIT));
      applyOccupancyState(cloneOccupancyList(snapshot));
      clearSelection();
      setNotice("Undo.");
      return past.slice(0, -1);
    });
  }, [applyOccupancyState, clearSelection]);

  const redoPlacement = useCallback(() => {
    setHistoryFuture((future) => {
      if (future.length === 0) {
        setNotice("Nothing to redo.");
        return future;
      }
      const snapshot = future[0]!;
      setHistoryPast((past) => [...past.slice(-(HISTORY_LIMIT - 1)), cloneOccupancyList(occupancyRef.current)]);
      applyOccupancyState(cloneOccupancyList(snapshot));
      clearSelection();
      setNotice("Redo.");
      return future.slice(1);
    });
  }, [applyOccupancyState, clearSelection]);

  const lockSelection = useCallback(() => {
    const ids = selectedIdsRef.current.filter((id) => !lockedIdsRef.current.includes(id));
    if (ids.length === 0) {
      setNotice(selectedIdsRef.current.length === 0 ? "Select clusters to lock." : "Selection is already locked.");
      return;
    }
    setLockedIds((current) => [...new Set([...current, ...ids])]);
    setNotice(ids.length > 1 ? `Locked ${ids.length} clusters.` : "Locked cluster.");
  }, []);

  const unlockSelection = useCallback(() => {
    const ids = new Set(selectedIdsRef.current);
    if (ids.size === 0) {
      setNotice("Select locked clusters to unlock.");
      return;
    }
    const before = lockedIdsRef.current.filter((id) => ids.has(id));
    if (before.length === 0) {
      setNotice("Nothing locked in the selection.");
      return;
    }
    setLockedIds((current) => current.filter((id) => !ids.has(id)));
    setNotice(before.length > 1 ? `Unlocked ${before.length} clusters.` : "Unlocked cluster.");
  }, []);

  const toggleLockSelection = useCallback(() => {
    const ids = selectedIdsRef.current;
    if (ids.length === 0) {
      setNotice("Select clusters to lock or unlock.");
      return;
    }
    const allLocked = ids.every((id) => lockedIdsRef.current.includes(id));
    if (allLocked) unlockSelection();
    else lockSelection();
  }, [lockSelection, unlockSelection]);

  const hideSelection = useCallback(() => {
    const ids = selectedIdsRef.current.filter((id) => !hiddenIdsRef.current.includes(id));
    if (ids.length === 0) {
      setNotice(selectedIdsRef.current.length === 0 ? "Select clusters to hide." : "Selection is already hidden.");
      return;
    }
    setHiddenIds((current) => [...new Set([...current, ...ids])]);
    setNotice(ids.length > 1 ? `Hid ${ids.length} clusters.` : "Hid cluster.");
  }, []);

  const unhideSelection = useCallback(() => {
    const ids = new Set(selectedIdsRef.current);
    if (ids.size === 0) {
      setNotice("Select hidden clusters to show.");
      return;
    }
    const before = hiddenIdsRef.current.filter((id) => ids.has(id));
    if (before.length === 0) {
      setNotice("Nothing hidden in the selection.");
      return;
    }
    setHiddenIds((current) => current.filter((id) => !ids.has(id)));
    setNotice(before.length > 1 ? `Showed ${before.length} clusters.` : "Showed cluster.");
  }, []);

  const unhideAll = useCallback(() => {
    if (hiddenIdsRef.current.length === 0) {
      setNotice("No hidden clusters.");
      return;
    }
    const count = hiddenIdsRef.current.length;
    setHiddenIds([]);
    setNotice(count > 1 ? `Showed all ${count} hidden clusters.` : "Showed hidden cluster.");
  }, []);

  const toggleHideSelection = useCallback(() => {
    const ids = selectedIdsRef.current;
    if (ids.length === 0) {
      setNotice("Select clusters to hide or show.");
      return;
    }
    const allHidden = ids.every((id) => hiddenIdsRef.current.includes(id));
    if (allHidden) unhideSelection();
    else hideSelection();
  }, [hideSelection, unhideSelection]);

  const revealHidden = useCallback((id: string) => {
    if (!hiddenIdsRef.current.includes(id)) return;
    setHiddenIds((current) => current.filter((item) => item !== id));
    setSelectedIds([id]);
    const record = occupancyRef.current.find((item) => item.occupancyId === id);
    if (record) setSelectedZoneId(record.zoneId);
    setNotice("Showed cluster.");
  }, []);

  const copySelection = useCallback(() => {
    const ids = selectedIdsRef.current;
    const picks = ids.length > 0
      ? occupancy.filter((item) => ids.includes(item.occupancyId))
      : primaryId
        ? occupancy.filter((item) => item.occupancyId === primaryId)
        : [];
    if (picks.length === 0) {
      setNotice("Select a cluster to copy.");
      return;
    }
    const anchorRecord = picks.find((item) => item.occupancyId === primaryId) ?? picks[0]!;
    const anchor = anchorRecord.transform;
    clipboardRef.current = {
      anchor: { ...anchor },
      members: picks.map((item) => ({
        zoneId: item.zoneId,
        programId: item.programId,
        finishedClusterId: item.finishedClusterId,
        transform: { ...item.transform },
        source: clonePlacedCluster(item).source,
        zoningSignature: item.zoningSignature,
        selectedNetworkId: item.selectedNetworkId,
        provenance: item.provenance,
        relX: item.transform.x - anchor.x,
        relY: item.transform.y - anchor.y,
        relZ: item.transform.z - anchor.z,
      })),
    };
    pasteGenerationRef.current = 0;
    setNotice(picks.length > 1 ? `Copied ${picks.length} clusters.` : "Copied cluster.");
  }, [occupancy, primaryId]);

  const pasteSelection = useCallback(async () => {
    const clip = clipboardRef.current;
    if (!clip || !network) {
      setNotice("Nothing to paste. Copy a selection first (Ctrl+C).");
      return;
    }
    pasteGenerationRef.current += 1;
    const offsetEast = PASTE_OFFSET_FT * pasteGenerationRef.current;
    const anchorX = clip.anchor.x + offsetEast;
    const anchorY = clip.anchor.y;
    const anchorZ = clip.anchor.z;
    const placed: PlacedCluster[] = [];
    try {
      for (const member of clip.members) {
        const zone = zones.find((item) => item.id === member.zoneId);
        if (!zone) continue;
        const transform = {
          ...member.transform,
          x: anchorX + member.relX,
          y: anchorY + member.relY,
          z: anchorZ + member.relZ,
        };
        const occupancyId = newOccupancyId(zone.id, [...occupancyRef.current, ...placed]);
        let record: PlacedCluster;
        try {
          record = await placeOccupancy({
            zoneId: member.zoneId,
            programId: member.programId,
            finishedClusterId: member.finishedClusterId,
            provenance: "manual",
            networkId: network.id,
            occupancyId,
            transform,
            stackOnPlan: { x: transform.x, z: transform.z },
          });
        } catch {
          record = {
            occupancyId,
            zoneId: member.zoneId,
            programId: member.programId,
            finishedClusterId: member.finishedClusterId,
            transform,
            selectedNetworkId: network.id,
            zoningSignature: member.zoningSignature,
            source: member.source,
            provenance: "manual",
          };
        }
        placed.push(record);
      }
      if (placed.length === 0) {
        setNotice("The clipboard could not be placed.");
        return;
      }
      commitOccupancy((current) => [...current, ...placed]);
      setSelectedIds(placed.map((item) => item.occupancyId));
      setSelectedZoneId(placed[0].zoneId);
      setNotice(placed.length > 1 ? `Pasted ${placed.length} clusters.` : "Pasted cluster.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Paste failed.");
    }
  }, [commitOccupancy, network, zones]);

  const placeOnZone = useCallback(async (zoneId: string, at?: { x: number; z: number }, choice?: ArmedCluster) => {
    const zone = zones.find((item) => item.id === zoneId);
    const picked = choice ?? armed;
    if (!zone || !network) return;
    setSelectedZoneId(zoneId);
    const inZone = occupanciesInZone(occupancy, zoneId);
    if (!picked) {
      setSelectedIds(inZone.at(-1) ? [inZone.at(-1)!.occupancyId] : []);
      return;
    }
    const kinds = placementProgramKinds(picked.programId);
    if (!kinds.includes(zone.kind)) {
      setNotice(`${picked.label} belongs in a ${kinds.join(" or ")} zone.`);
      return;
    }
    try {
      const occupancyId = newOccupancyId(zone.id, occupancy);
      const pose = poseForAddedCluster(zone, occupancy, at);
      const record = await placeOccupancy({
        zoneId: zone.id,
        programId: picked.programId,
        finishedClusterId: picked.clusterId,
        provenance: "manual",
        networkId: network.id,
        occupancyId,
        transform: seatPoseOnSupport(
          meshes[`${picked.programId}:${picked.clusterId}`]?.positions ?? null,
          { ...pose, rotationY: snapQuarter(pose.rotationY), rotationX: 0, rotationZ: 0 },
          zone.baseFt,
          clusterSupporters(occupancy, meshes),
        ),
      });
      commitOccupancy((current) => upsertOccupancy(current, record));
      setNotice(`${picked.label} added in ${zone.name}. ${occupanciesInZone([...occupancy, record], zone.id).length} in this zone.`);
      setSelectedIds([record.occupancyId]);
      setArmed(null);
      setLive(null);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "The cluster could not be placed.");
    }
  }, [armed, commitOccupancy, meshes, network, occupancy, zones]);

  const removeSelected = useCallback(() => {
    if (selectedIds.length === 0) return;
    const locked = new Set(lockedIds);
    const drop = selectedIds.filter((id) => !locked.has(id));
    if (drop.length === 0) {
      setNotice("Locked clusters cannot be deleted. Unlock first.");
      return;
    }
    const dropSet = new Set(drop);
    const next = occupancy.filter((item) => !dropSet.has(item.occupancyId));
    setLockedIds((current) => current.filter((id) => !dropSet.has(id)));
    commitOccupancy(next);
    clearSelection();
    const skipped = selectedIds.length - drop.length;
    setNotice(
      drop.length > 1 ? `${drop.length} clusters removed.${skipped ? ` ${skipped} locked, kept.` : ""}` :
        skipped ? "Selection is locked — unlock to delete." : "The selected cluster was removed.",
    );
  }, [clearSelection, commitOccupancy, lockedIds, occupancy, selectedIds]);

  const nudgeSelectedVertical = useCallback((deltaFt: number, shiftKey = false) => {
    const targets = selectedIds.length > 0 ? selectedIds : [];
    if (targets.length === 0) {
      setNotice("Select a cluster in Plan or View, then use ↑ ↓ to move it on site Y.");
      return;
    }
    const step = shiftKey ? VERTICAL_NUDGE_FT / 2 : VERTICAL_NUDGE_FT;
    const delta = deltaFt * step;
    const allowSink = shiftKey && deltaFt < 0;
    const locked = new Set(lockedIds);
    const touch = new Set(targets.filter((id) => !locked.has(id)));
    if (touch.size === 0) {
      setNotice("Locked clusters cannot move on site Y. Unlock first.");
      return;
    }
    let moved = 0;
    let sank = 0;
    let blockedLand = 0;
    const next = occupancy.map((item) => {
      if (!touch.has(item.occupancyId)) return item;
      const zone = zones.find((z) => z.id === item.zoneId);
      const ground = zone?.baseFt ?? 0;
      const mesh = meshes[occupancyMeshKey(item)]?.positions ?? null;
      const drop = mesh ? rotatedPoseDrop(mesh, item.transform) : 0;
      const floorY = ground - drop;
      const nextY = item.transform.y + delta;
      const sinkMin = allowSink && mesh ? clusterSinkMinPoseY(mesh, item.transform, waterRing) : null;
      const overWater = allowSink && mesh ? clusterOverWater(mesh, item.transform, waterRing) : false;
      let y = nextY;
      if (deltaFt < 0) {
        const minY = sinkMin ?? floorY;
        y = Math.max(minY, nextY);
        if (allowSink && !overWater && y <= floorY + 0.001 && nextY < floorY - 0.001) blockedLand += 1;
        if (allowSink && overWater && y < floorY - 0.5) sank += 1;
      }
      if (Math.abs(y - item.transform.y) >= 0.001) moved += 1;
      return { ...item, transform: { ...item.transform, y } };
    });
    if (moved === 0) {
      if (allowSink && blockedLand > 0) {
        setNotice("Shift+↓ sinks only over the bay. Move the footprint into the water first.");
      } else if (allowSink) {
        let atSinkLimit = false;
        for (const item of next) {
          if (!touch.has(item.occupancyId)) continue;
          const mesh = meshes[occupancyMeshKey(item)]?.positions;
          const sinkMin = mesh ? clusterSinkMinPoseY(mesh, item.transform, waterRing) : null;
          if (sinkMin != null && Math.abs(item.transform.y - sinkMin) < 0.5) {
            atSinkLimit = true;
            break;
          }
        }
        setNotice(atSinkLimit ? "Cluster is fully sunk in the bay." : "Cluster is on the zone base.");
      } else {
        setNotice("Cluster is on the zone base.");
      }
      return;
    }
    commitOccupancy(next);
    setLive(null);
    setLiveTransforms(null);
    if (sank > 0) {
      setNotice(sank > 1 ? `Sank ${sank} clusters in the bay.` : "Sank cluster in the bay.");
    } else {
      setNotice(`Moved ${moved} cluster${moved === 1 ? "" : "s"} on site Y${deltaFt > 0 ? " up" : " down"}.`);
    }
  }, [commitOccupancy, lockedIds, meshes, occupancy, selectedIds, zones]);

  const resolveMirrorSource = useCallback((): PlacedCluster | null => {
    if (primaryId) {
      const picked = occupancy.find((item) => item.occupancyId === primaryId);
      if (picked) return picked;
    }
    if (selectedZoneId) {
      const inZone = occupanciesInZone(occupancy, selectedZoneId);
      if (inZone.length > 0) return inZone.at(-1) ?? null;
    }
    return occupancy.at(-1) ?? null;
  }, [occupancy, primaryId, selectedZoneId]);

  const mirrorStackSource = useCallback(async (source: PlacedCluster) => {
    if (!network) {
      setNotice("The selected network is still loading.");
      return;
    }
    const zone = zones.find((item) => item.id === source.zoneId);
    if (!zone) {
      setNotice("That cluster’s zone is not in the current zoning.");
      return;
    }
    const meshKey = occupancyMeshKey(source);
    let mesh = meshes[meshKey];
    if (!mesh?.positions) {
      setNotice("Loading cluster geometry…");
      try {
        mesh = await fetchOccupancyMesh(source.programId, source.finishedClusterId);
        if (mesh) {
          setMeshes((current) => (current[meshKey] === mesh ? current : { ...current, [meshKey]: mesh }));
        }
      } catch {
        mesh = null;
      }
    }
    if (!mesh?.positions) {
      setNotice("The cluster mesh could not be loaded. Try again in a moment.");
      return;
    }
    const transform = mirrorStackPose(mesh.positions, source.transform, zone.baseFt);
    const stackOnPlan = { x: source.transform.x, z: source.transform.z };
    const occupancyId = newOccupancyId(zone.id, occupancy);
    setMirroring(true);
    try {
      let record: PlacedCluster;
      try {
        record = await placeOccupancy({
          zoneId: source.zoneId,
          programId: source.programId,
          finishedClusterId: source.finishedClusterId,
          provenance: "manual",
          networkId: network.id,
          occupancyId,
          transform,
          stackOnPlan,
        });
      } catch {
        record = {
          occupancyId,
          zoneId: source.zoneId,
          programId: source.programId,
          finishedClusterId: source.finishedClusterId,
          transform,
          selectedNetworkId: network.id,
          zoningSignature: source.zoningSignature,
          source: source.source,
          provenance: "manual",
        };
      }
      const stacked = record.transform.mirror
        ? ` Mirror ${record.transform.mirror.toUpperCase()}.`
        : "";
      commitOccupancy((current) => {
        const next = upsertOccupancy(current, record);
        setNotice(`Mirrored copy stacked on ${source.occupancyId}. ${next.length} clusters on site.${stacked}`);
        return next;
      });
      setSelectedIds([record.occupancyId]);
      setSelectedZoneId(zone.id);
      setLive(null);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "The mirrored copy could not be placed.");
    } finally {
      setMirroring(false);
    }
  }, [commitOccupancy, meshes, network, occupancy, zones]);

  const invokeMirrorStack = useCallback(() => {
    if (mirroring) return;
    const source = resolveMirrorSource();
    if (!source) {
      setNotice("Place a cluster in a zone first, then mirror & stack.");
      return;
    }
    if (lockedIds.includes(source.occupancyId)) {
      setNotice("Unlock the cluster before mirror & stack.");
      return;
    }
    if (source.occupancyId !== primaryId) setSelectedIds([source.occupancyId]);
    setSelectedZoneId(source.zoneId);
    void mirrorStackSource(source);
  }, [lockedIds, mirrorStackSource, mirroring, resolveMirrorSource, primaryId]);

  const saveAssembly = useCallback(async () => {
    if (!network || occupancy.length === 0 || saving) {
      setNotice(occupancy.length === 0 ? "Place a cluster before saving." : "The selected network is not loaded.");
      return;
    }
    setSaving(true);
    try {
      const saved = await saveClusterAssemblyRecord({
        selectedNetworkId: network.id,
        zoningSignature: occupancy[0].zoningSignature,
        zones,
        occupancy,
        savedFrom: "placement",
      });
      await sendAssemblyForDevelopment(saved.assemblyId);
      announceWorkingOccupancy(occupancy);
      router.push("/lab/site?sheet=void");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "The assembly could not be saved.");
      setSaving(false);
    }
  }, [network, occupancy, router, saving, zones]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target;
      if (target instanceof HTMLElement && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
      if (event.key === "Escape" || event.key === "Esc") {
        if (selectedIdsRef.current.length > 0 || armed) {
          event.preventDefault();
          event.stopPropagation();
          clearSelection();
          return;
        }
      }
      if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        removeSelected();
      }
      if ((event.key === "m" || event.key === "M") && !event.ctrlKey && !event.metaKey && !event.altKey) {
        event.preventDefault();
        invokeMirrorStack();
      }
      if ((event.key === "l" || event.key === "L") && !event.ctrlKey && !event.metaKey && !event.altKey) {
        event.preventDefault();
        toggleLockSelection();
      }
      if ((event.key === "ArrowUp" || event.key === "ArrowDown") && !event.ctrlKey && !event.metaKey && !event.altKey) {
        event.preventDefault();
        nudgeSelectedVertical(event.key === "ArrowUp" ? 1 : -1, event.shiftKey);
      }
      const mod = event.ctrlKey || event.metaKey;
      if (!mod || event.altKey) return;
      const key = event.key.toLowerCase();
      if (key === "z" && !event.shiftKey) {
        event.preventDefault();
        undoPlacement();
      } else if (key === "y" || (key === "z" && event.shiftKey)) {
        event.preventDefault();
        redoPlacement();
      } else if (key === "c") {
        event.preventDefault();
        copySelection();
      } else if (key === "v") {
        event.preventDefault();
        void pasteSelection();
      } else if (key === "h") {
        event.preventDefault();
        toggleHideSelection();
      }
    };
    window.addEventListener("keydown", onKey, { capture: true });
    return () => window.removeEventListener("keydown", onKey, { capture: true });
  }, [armed, clearSelection, copySelection, invokeMirrorStack, nudgeSelectedVertical, pasteSelection, redoPlacement, removeSelected, toggleHideSelection, toggleLockSelection, undoPlacement]);

  const onGumball = useCallback((pose: GumballPose & { id: string }, commit: boolean, source: SiteViewMode, modifiers?: { shiftKey?: boolean }) => {
    if (lockedIdsRef.current.includes(pose.id)) {
      if (commit) setNotice("That cluster is locked. Unlock to move or rotate.");
      return;
    }
    if (modifiers?.shiftKey) shiftHeldRef.current = true;
    const ids = selectedIdsRef.current.filter((id) => !lockedIdsRef.current.includes(id));
    const inSelection = ids.includes(pose.id);
    const groupTransform = ids.length > 1 && inSelection;
    const targets = groupTransform ? ids : [pose.id];
    if (groupTransform) rigidGroupRef.current = true;
    const seatedFromGumball = (record: PlacedCluster, gumballPose: GumballPose) => {
      const plan = source === "plan";
      const snapped = gumballToOccupancyPose({
        ...gumballPose,
        rotationX: snapQuarterRadians(gumballPose.rotationX),
        rotationY: plan ? snapPlanYawRadians(gumballPose.rotationY) : snapQuarterRadians(gumballPose.rotationY),
        rotationZ: snapQuarterRadians(gumballPose.rotationZ),
      }, record.transform.mirror);
      const oriented = plan
        ? {
          ...snapped,
          rotationX: snapQuarter(record.transform.rotationX ?? 0),
          rotationY: snapPlanYaw(snapped.rotationY),
          rotationZ: snapQuarter(record.transform.rotationZ ?? 0),
        }
        : {
          ...snapped,
          rotationX: snapQuarter(snapped.rotationX ?? 0),
          rotationY: snapQuarter(snapped.rotationY),
          rotationZ: snapQuarter(snapped.rotationZ ?? 0),
        };
      const ground = zones.find((zone) => zone.id === record.zoneId)?.baseFt ?? 0;
      return seatPoseOnSupport(
        meshes[occupancyMeshKey(record)]?.positions ?? null,
        oriented,
        ground,
        clusterSupporters(occupancy, meshes, record.occupancyId),
      );
    };
    const groupExclude = groupTransform ? new Set(targets) : undefined;
    const seatRecordAtPose = (record: PlacedCluster, sitePose: ClusterSitePose) => {
      const ground = zones.find((zone) => zone.id === record.zoneId)?.baseFt ?? 0;
      return seatPoseOnSupport(
        meshes[occupancyMeshKey(record)]?.positions ?? null,
        sitePose,
        ground,
        clusterSupporters(occupancy, meshes, record.occupancyId, groupExclude),
      );
    };
    if (!groupTransform) {
      const record = occupancy.find((item) => item.occupancyId === pose.id);
      if (!record) return;
      const next = seatedFromGumball(record, pose);
      if (!commit) {
        setLiveTransforms(null);
        rigidGroupRef.current = false;
        setLive({ ...occupancyPoseToGumball(next), id: pose.id });
        return;
      }
      groupBaseRef.current = null;
      rigidGroupRef.current = false;
      setLive(null);
      setLiveTransforms(null);
      commitOccupancy((current) => current.map((item) => (item.occupancyId === pose.id ? { ...item, transform: next } : item)));
      return;
    }
    if (!commit && !groupBaseRef.current) {
      const base = new Map<string, ClusterSitePose>();
      for (const id of targets) {
        const record = occupancy.find((item) => item.occupancyId === id);
        if (record) base.set(id, { ...record.transform });
      }
      groupBaseRef.current = base;
      rigidGroupRef.current = true;
    }
    const primary = occupancy.find((item) => item.occupancyId === pose.id);
    if (!primary || !groupBaseRef.current) return;
    const primaryBase = groupBaseRef.current.get(pose.id) ?? primary.transform;
    const primaryNext = seatedFromGumball(primary, pose);
    const transformFor = (record: PlacedCluster, settle: boolean): ClusterSitePose => {
      const base = groupBaseRef.current?.get(record.occupancyId) ?? record.transform;
      const merged = record.occupancyId === pose.id
        ? primaryNext
        : rigidGroupMemberPose(base, primaryBase, primaryNext);
      return settle ? seatRecordAtPose(record, merged) : merged;
    };
    const preview: Record<string, ClusterSitePose> = {};
    for (const id of targets) {
      const record = occupancy.find((item) => item.occupancyId === id);
      if (record) preview[id] = transformFor(record, false);
    }
    if (!commit) {
      setLiveTransforms(preview);
      const primaryPreview = preview[pose.id];
      if (primaryPreview) setLive({ ...occupancyPoseToGumball(primaryPreview), id: pose.id });
      return;
    }
    const finals = new Map<string, ClusterSitePose>();
    for (const id of targets) {
      const record = occupancy.find((item) => item.occupancyId === id);
      if (record) finals.set(id, transformFor(record, true));
    }
    groupBaseRef.current = null;
    rigidGroupRef.current = false;
    setLive(null);
    setLiveTransforms(null);
    commitOccupancy((current) => current.map((item) => {
      const next = finals.get(item.occupancyId);
      return next ? { ...item, transform: next } : item;
    }));
  }, [commitOccupancy, meshes, network?.id, occupancy, zones]);

  const model = useMemo(() => {
    const base = occupancyModel(occupancy, meshes, live, liveTransforms);
    return {
      ...base,
      solids: base.solids,
      zoning: showSiteZoning,
      zoneFills: showSiteZoning,
      zoneCaptions: false,
      zonePalette: ZONE_COLOR,
      branches: network?.branches ?? [],
      zones: zones.map((zone) => ({ id: zone.id, kind: zone.kind, name: zone.name, points: zone.points })),
      anchors: [],
      link: null,
    };
  }, [live, liveTransforms, meshes, network, occupancy, showSiteZoning, zones]);

  const interactionFor = useCallback((source: SiteViewMode) => ({
    selectedId: primaryId,
    selectedIds,
    selectedZoneId,
    onSelect: (id: string | null, modifiers?: { shiftKey?: boolean }) => {
      setActiveView(source);
      selectCluster(id, modifiers?.shiftKey);
      const record = id ? occupancy.find((item) => item.occupancyId === id) : null;
      if (record) setSelectedZoneId(record.zoneId);
    },
    snap: true,
    view: source === "plan" ? "plan" as const : "axon" as const,
    rings: source === "plan" ? ["y" as const] : ["x" as const, "z" as const],
    yawStep: source === "plan" ? PLAN_YAW_STEP : QUARTER,
    gumballLive: live,
    onGumball: (pose: GumballPose & { id: string }, commit: boolean, modifiers?: { shiftKey?: boolean }) => onGumball(pose, commit, source, modifiers),
    shiftGroup: selectedIds.length > 1,
    lockedIds,
    hiddenIds,
    onZone: (zoneId: string) => {
      setActiveView(source);
      setSelectedZoneId(zoneId);
      const inZone = occupanciesInZone(occupancy, zoneId);
      setSelectedIds(inZone.at(-1) ? [inZone.at(-1)!.occupancyId] : []);
    },
  }), [hiddenIds, live, lockedIds, occupancy, onGumball, primaryId, selectCluster, selectedIds, selectedZoneId, shiftHeld]);

  const planModel = useMemo(() => ({ ...model, interaction: interactionFor("plan") }), [interactionFor, model]);
  const viewModel = useMemo(() => ({ ...model, interaction: interactionFor("perspective") }), [interactionFor, model]);

  const cards: PlacementCluster[] = rank?.clusters ?? [];
  const activeZone = zones.find((zone) => zone.id === selectedZoneId) ?? null;
  const categories = activeZone ? ZONE_CATEGORIES[activeZone.kind] : [];
  const activePair = categories.includes(pairId) ? pairId : categories[0];
  const visibleCards = activePair === pairId ? cards : [];
  const rows = visibleCards.length ? Math.ceil(visibleCards.length / 2) : 0;
  const activeZoneKind = activeZone ? ZONE_KIND_ORDER.find((item) => item.id === activeZone.kind) : null;
  const programName = FINAL_CLUSTER_PAIRS.find((pair) => pair.id === activePair)?.label ?? pairId;
  const totals = { lobby: 0, workspace: 0, gathering: 0 };
  let unrecorded = 0;
  for (const record of occupancy) {
    const mix = mixes[`${record.programId}:${record.finishedClusterId}`];
    if (!mix) {
      unrecorded += 1;
      continue;
    }
    totals.lobby += mix.lobby;
    totals.workspace += mix.workspace;
    totals.gathering += mix.gathering;
  }
  const nominal = {
    lobby: totals.lobby * MODULE_SQFT,
    workspace: totals.workspace * MODULE_SQFT,
    gathering: totals.gathering * MODULE_SQFT,
  };
  const nominalTotal = nominal.lobby + nominal.workspace + nominal.gathering;

  const hiddenEntries = useMemo(() => {
    const set = new Set(hiddenIds);
    return occupancy
      .filter((item) => set.has(item.occupancyId))
      .map((item) => {
        const zone = zones.find((z) => z.id === item.zoneId);
        const program = FINAL_CLUSTER_PAIRS.find((pair) => pair.id === item.programId)?.label ?? item.programId;
        return {
          id: item.occupancyId,
          zoneKind: zone?.kind,
          zoneName: zone?.name ?? item.zoneId,
          program,
          clusterId: item.finishedClusterId,
        };
      });
  }, [hiddenIds, occupancy, zones]);

  return (
    <main className="site-view" data-panels="model" data-sheet="placement" data-selected-network={network?.id} data-selected-id={primaryId ?? ""} data-selected-count={selectedIds.length} data-shift-group={(selectedIds.length > 1) || undefined} data-armed={armed ? "true" : "false"} data-views="plan view" data-active-view={activeView} data-site-context={showSiteContext ? "on" : "off"} data-site-zoning={showSiteZoning ? "on" : "off"} data-pose={primaryId ? JSON.stringify(occupancy.find((item) => item.occupancyId === primaryId)?.transform ?? null) : ""}>
      <aside className="site-panel site-panel-library" aria-label="Hybrid cluster catalog">
        <section className="site-block site-placement-board">
          <h2 className="site-subtitle">Cluster Placement</h2>
          <button
            type="button"
            className="site-placement-action"
            data-mirror-stack
            data-ready={occupancy.length > 0 || undefined}
            data-busy={mirroring || undefined}
            disabled={mirroring}
            onClick={(event) => { event.stopPropagation(); invokeMirrorStack(); }}
          >
            {mirroring ? "Mirroring & stacking…" : "Mirror & stack"}
          </button>
          <p className="site-note">{occupancy.length > 0 ? "Uses the selected cluster, or the latest in the zone. Shortcut: M" : "Place a cluster, then one click mirrors and stacks."}</p>
          <p className="site-note">{network ? `Iteration ${network.index} · ${network.title}` : "Selected network"}</p>
          <p className="site-note">{zones.length} zoning regions. Click a zone, then a catalog card. Each card places one cluster and selects it. Drag that cluster to move it. Scroll zooms. Right-drag pans. Left-drag on empty space orbits.</p>
          <div className="site-placement-legend" aria-label="Zoning programs">
            {ZONE_KIND_ORDER.map((kind) => (
              <span key={kind.id} className="site-placement-legend-item">
                <i style={{ background: ZONE_COLOR[kind.id] }} aria-hidden="true" />
                {kind.label}
              </span>
            ))}
          </div>
          {activeZone ? (
            <div className="site-modes" role="group" aria-label="Cluster categories" data-zone-kind={activeZone.kind}>
              {categories.map((id) => {
                const pair = FINAL_CLUSTER_PAIRS.find((item) => item.id === id);
                return (
                  <button key={id} type="button" data-category={id} aria-pressed={id === activePair} data-active={id === activePair || undefined} onClick={() => setPairId(id)}>{pair?.label ?? id}</button>
                );
              })}
            </div>
          ) : <p className="site-note">Click a zone to open its four cluster categories.</p>}
          {notice ? <p className="site-note" data-placement-notice>{notice}</p> : null}
          {visibleCards.length > 0 ? (
            <div className="site-gallery site-gallery-clusters site-placement-catalog" aria-label="Hybrid clusters" data-category={activePair} style={{ gridTemplateRows: `repeat(${rows}, minmax(140px, 1fr))` }}>
              {visibleCards.map((cluster, index) => {
                const label = `Cluster ${String(index + 1).padStart(2, "0")}`;
                const selectedRecord = primaryId ? occupancy.find((item) => item.occupancyId === primaryId) : null;
                const active = selectedRecord?.programId === activePair && selectedRecord.finishedClusterId === cluster.id;
                return (
                  <PlacementCatalogCard
                    key={cluster.id}
                    pairId={activePair}
                    cluster={cluster}
                    index={index}
                    active={active}
                    onPick={() => {
                      if (!selectedZoneId) {
                        setNotice("Select a zone, then choose a cluster.");
                        setArmed(null);
                        return;
                      }
                      const choice = { programId: activePair, clusterId: cluster.id, label: `${programName} ${label}` };
                      setArmed(null);
                      void placeOnZone(selectedZoneId, undefined, choice);
                    }}
                  />
                );
              })}
            </div>
          ) : null}
        </section>
      </aside>
      <section className="site-stage" aria-label="Site">
        <div className="site-frame">
          <header className="site-frame-bar">
            <p className="site-note">
              {selectedIds.length > 1
                ? `${selectedIds.length} clusters — move and rotate as one piece`
                : primaryId
                  ? "Cluster selected"
                  : occupancy.length > 0
                    ? "No cluster selected — mirror & stack uses the latest placed"
                    : "No cluster selected"}
              {notice ? (
                <>
                  {" · "}
                  <span className="site-placement-zone-caption" data-placement-notice>{notice}</span>
                </>
              ) : null}
              {activeZone && activeZoneKind ? (
                <>
                  {" · "}
                    <span className="site-placement-zone-caption" style={{ color: ZONE_COLOR[activeZone.kind] }}>
                      {activeZoneKind.label} — {activeZone.name} · {occupanciesInZone(occupancy, activeZone.id).length} placed
                    </span>
                </>
              ) : null}
              {" · "}L lock/unlock · Ctrl+H hide/show · Ctrl+Z/Y undo/redo · Ctrl+C/V copy/paste. Shift-click multi-select. Escape clears selection.
            </p>
          </header>
          <div className="site-split">
            <div className="site-split-pane" data-view="plan" data-active={activeView === "plan" || undefined} onPointerDown={() => setActiveView("plan")}>
              <p className="site-split-label">Plan</p>
              <div className="site-viewport">
                <SiteViewport
                  context={site}
                  mode="plan"
                  fit="site"
                  clusterNavigation
                  showGrid={false}
                  showAerial={false}
                  frameToken={1}
                  parcelOnly={!showSiteContext}
                  onReadout={() => {}}
                  clusterAssembly={planModel}
                />
              </div>
            </div>
            <div className="site-split-pane" data-view="view" data-active={activeView === "perspective" || undefined} onPointerDown={() => setActiveView("perspective")}>
              <p className="site-split-label">View</p>
              <div className="site-viewport">
                <SiteViewport
                  context={site}
                  mode="perspective"
                  fit="site"
                  clusterNavigation
                  showGrid={false}
                  showAerial={false}
                  frameToken={2}
                  parcelOnly={!showSiteContext}
                  onReadout={() => {}}
                  clusterAssembly={viewModel}
                />
              </div>
            </div>
          </div>
        </div>
      </section>
      <aside className="site-panel site-panel-analysis" aria-label="Program statistics" data-program-statistics>
        <section className="site-block" data-placement-selection-tools>
          <h2 className="site-subtitle">Selection</h2>
          <p className="site-note">Shift-click to add clusters to the selection. Drag any selected cluster or the gumball on the primary to move the set as one rigid piece. ↑ ↓ move on site Y and keep the bottom on the zone ground when rotated. Shift+↓ over the bay sinks into the water.</p>
          <p className="site-note">Ctrl+Z undo · Ctrl+Y redo. Ctrl+C copies the selection; Ctrl+V pastes a copy offset 24 ft east (group layout kept). L locks or unlocks the selection. Ctrl+H hides or shows the selection.</p>
          <p className="site-note">Locked clusters show in clay — they cannot move, rotate, delete, or mirror. Hidden clusters stay placed but disappear from Plan and View until shown again.</p>
          {notice ? <p className="site-note" data-placement-notice>{notice}</p> : null}
          <div className="site-modes site-placement-lock-row" role="group" aria-label="Lock clusters">
            <button
              type="button"
              disabled={selectedIds.length === 0 || selectedIds.every((id) => lockedIds.includes(id))}
              onClick={(event) => { event.stopPropagation(); lockSelection(); }}
            >
              Lock
            </button>
            <button
              type="button"
              disabled={selectedIds.length === 0 || !selectedIds.some((id) => lockedIds.includes(id))}
              onClick={(event) => { event.stopPropagation(); unlockSelection(); }}
            >
              Unlock
            </button>
          </div>
          <div className="site-modes site-placement-lock-row" role="group" aria-label="Hide clusters">
            <button
              type="button"
              disabled={selectedIds.length === 0 || selectedIds.every((id) => hiddenIds.includes(id))}
              onClick={(event) => { event.stopPropagation(); hideSelection(); }}
            >
              Hide
            </button>
            <button
              type="button"
              disabled={selectedIds.length === 0 || !selectedIds.some((id) => hiddenIds.includes(id))}
              onClick={(event) => { event.stopPropagation(); unhideSelection(); }}
            >
              Show
            </button>
          </div>
          {hiddenEntries.length > 0 ? (
            <div className="site-placement-hidden-panel" data-placement-hidden-panel>
              <p className="site-note" data-placement-hidden-count>
                {hiddenEntries.length} hidden ·{" "}
                <button type="button" className="site-placement-inline-action" onClick={(event) => { event.stopPropagation(); unhideAll(); }}>
                  Show all hidden
                </button>
              </p>
              <ul className="site-placement-hidden-list" aria-label="Hidden placed clusters">
                {hiddenEntries.map((entry) => (
                  <li key={entry.id}>
                    <button
                      type="button"
                      className="site-placement-hidden-item"
                      data-selected={selectedIds.includes(entry.id) || undefined}
                      onClick={(event) => { event.stopPropagation(); revealHidden(entry.id); }}
                    >
                      <span className="site-placement-hidden-zone" style={entry.zoneKind ? { color: ZONE_COLOR[entry.zoneKind] } : undefined}>
                        {entry.zoneName}
                      </span>
                      <span className="site-placement-hidden-meta">{entry.program} · {entry.clusterId}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <button
            type="button"
            className="site-placement-action"
            data-mirror-stack
            data-ready={occupancy.length > 0 || undefined}
            data-busy={mirroring || undefined}
            disabled={mirroring}
            onClick={(event) => { event.stopPropagation(); invokeMirrorStack(); }}
          >
            {mirroring ? "Mirroring & stacking…" : "Mirror & stack"}
          </button>
        </section>
        <section className="site-block">
          <h2 className="site-subtitle">Program</h2>
          <p className="site-note">Nominal module envelope. Each constituent morphology tile counts as one {SKILL5_MODULE_ENVELOPE_FEET} ft square ({MODULE_SQFT} sq ft), from the catalog typology mix. This is not measured habitable floor area.</p>
          {(["lobby", "workspace", "gathering"] as const).map((kind) => (
            <p key={kind} className="site-stat" data-program={kind}>
              <span style={{ color: ZONE_COLOR[kind] }}>{ZONE_KIND_ORDER.find((item) => item.id === kind)?.label}</span>
              <strong>{nominal[kind].toLocaleString()} sq ft</strong>
              <span>{totals[kind]} tiles</span>
            </p>
          ))}
          <p className="site-stat" data-program="total">
            <span>Total nominal area</span>
            <strong>{nominalTotal.toLocaleString()} sq ft</strong>
          </p>
          <p className="site-note" data-placement-progress data-placed-count={occupancy.length} data-occupied-zones={new Set(occupancy.map((item) => item.zoneId)).size}>{occupancy.length} placed clusters · {new Set(occupancy.map((item) => item.zoneId)).size} of {zones.length} zones occupied{unrecorded ? ` · ${unrecorded} without a recorded typology mix` : ""}</p>
        </section>
        <section className="site-block" data-placement-display>
          <h2 className="site-subtitle">Display</h2>
          <p className="site-note">Layers in Plan and View. Zoning stays pickable when its overlay is off.</p>
          <div className="site-modes" role="group" aria-label="Display layers">
            <button
              type="button"
              data-placement-context
              data-active={showSiteContext || undefined}
              aria-pressed={showSiteContext}
              onClick={() => setShowSiteContext((current) => !current)}
            >
              Context buildings
            </button>
            <button
              type="button"
              data-placement-zoning
              data-active={showSiteZoning || undefined}
              aria-pressed={showSiteZoning}
              onClick={() => setShowSiteZoning((current) => !current)}
            >
              Strategy & zoning
            </button>
          </div>
        </section>
        <section className="site-block">
          <button type="button" data-save-assembly disabled={saving || occupancy.length === 0} onClick={() => void saveAssembly()}>{saving ? "Saving" : "Save assembly"}</button>
        </section>
      </aside>
    </main>
  );
}