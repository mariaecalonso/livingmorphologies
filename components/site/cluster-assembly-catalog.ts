import type { ClusterAssemblyDocument, ClusterAssemblyRecord, PlacedCluster } from "@/lib/skill5/placed-cluster";

export const SELECTED_CLUSTER_ASSEMBLY_EVENT = "living-morphologies.selected-cluster-assembly";
export const WORKING_OCCUPANCY_EVENT = "living-morphologies.working-cluster-occupancy";
export const WORKING_OCCUPANCY_KEY = "living-morphologies.cluster-occupancy.v1";
const SELECTED_MIRROR_KEY = "living-morphologies.selected-cluster-assembly.v1";

export function announceSelectedClusterAssembly(selectedAssemblyId: string | null) {
  if (typeof window === "undefined") return;
  try {
    if (selectedAssemblyId) window.localStorage.setItem(SELECTED_MIRROR_KEY, selectedAssemblyId);
    else window.localStorage.removeItem(SELECTED_MIRROR_KEY);
  } catch {
    /* Disk remains the authority. */
  }
  window.dispatchEvent(new CustomEvent(SELECTED_CLUSTER_ASSEMBLY_EVENT, { detail: { selectedAssemblyId } }));
}

export function mirroredSelectedAssemblyId() {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(SELECTED_MIRROR_KEY);
  } catch {
    return null;
  }
}

export function announceWorkingOccupancy(occupancy: readonly PlacedCluster[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(WORKING_OCCUPANCY_KEY, JSON.stringify(occupancy));
  } catch {
    /* The in-memory workspace still holds occupancy. */
  }
  window.dispatchEvent(new CustomEvent(WORKING_OCCUPANCY_EVENT, { detail: { occupancy } }));
}

export function readWorkingOccupancy(): PlacedCluster[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(WORKING_OCCUPANCY_KEY);
    if (!raw) return [];
    const body = JSON.parse(raw) as unknown;
    return Array.isArray(body) ? body as PlacedCluster[] : [];
  } catch {
    return [];
  }
}

export async function loadClusterAssemblies(): Promise<ClusterAssemblyDocument> {
  const response = await fetch("/api/site/cluster-assemblies", { cache: "no-store" });
  if (!response.ok) throw new Error("The Cluster Assembly catalog could not be read.");
  return response.json() as Promise<ClusterAssemblyDocument>;
}

export async function saveClusterAssemblyRecord(input: {
  name?: string;
  selectedNetworkId: string;
  zoningSignature: string;
  zones: unknown;
  occupancy: readonly PlacedCluster[];
  savedFrom?: "placement" | "auto-initial" | "catalog";
}): Promise<ClusterAssemblyRecord> {
  const response = await fetch("/api/site/cluster-assemblies", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const body = await response.json() as ClusterAssemblyRecord & { error?: string };
  if (!response.ok) throw new Error(body.error || "The Cluster Assembly could not be saved.");
  return body;
}

export async function loadSelectedClusterAssembly() {
  const response = await fetch("/api/site/selected-assembly", { cache: "no-store" });
  if (!response.ok) throw new Error("The selected Cluster Assembly could not be read.");
  return response.json() as Promise<{ selectedAssemblyId: string | null; assembly: ClusterAssemblyRecord | null }>;
}

export async function sendAssemblyForDevelopment(selectedAssemblyId: string) {
  const response = await fetch("/api/site/selected-assembly", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ selectedAssemblyId }),
  });
  const body = await response.json() as { selectedAssemblyId?: string | null; assembly?: ClusterAssemblyRecord | null; error?: string };
  if (!response.ok || typeof body.selectedAssemblyId !== "string") {
    throw new Error(body.error || "The Cluster Assembly could not be sent for Development.");
  }
  announceSelectedClusterAssembly(body.selectedAssemblyId);
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("living-morphologies.downstream-pipeline", { detail: { stage: "selected-assembly" } }));
  }
  return body;
}

export async function loadDevelopmentCheckpoint() {
  const response = await fetch("/api/site/development-checkpoint", { cache: "no-store" });
  if (!response.ok) throw new Error("The Development checkpoint could not be read.");
  return response.json() as Promise<{ selectedAssemblyId: string | null; assembly: ClusterAssemblyRecord | null }>;
}

export async function placeOccupancy(input: {
  zoneId: string;
  programId: string;
  finishedClusterId: string;
  provenance?: PlacedCluster["provenance"];
  transform?: PlacedCluster["transform"];
  networkId?: string;
  occupancyId?: string;
  stackOnPlan?: { x: number; z: number };
}): Promise<PlacedCluster> {
  const response = await fetch("/api/site/cluster-occupancy", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const body = await response.json() as PlacedCluster & { error?: string };
  if (!response.ok) throw new Error(body.error || "The cluster could not be placed.");
  return body;
}

export async function runAutomaticInitialPlacement(): Promise<PlacedCluster[]> {
  const response = await fetch("/api/site/cluster-occupancy/auto-initial", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  const body = await response.json() as { occupancy?: PlacedCluster[]; error?: string };
  if (!response.ok) throw new Error(body.error || "Automatic initial placement could not run.");
  return body.occupancy ?? [];
}
