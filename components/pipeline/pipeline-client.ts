import type { ResolvedPipeline } from "@/lib/skill5/downstream-pipeline";
import { SELECTED_CLUSTER_ASSEMBLY_EVENT } from "@/components/site/cluster-assembly-catalog";

export const DOWNSTREAM_PIPELINE_EVENT = "living-morphologies.downstream-pipeline";

export function announceDownstreamPipeline(stage: string) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(DOWNSTREAM_PIPELINE_EVENT, { detail: { stage } }));
}

export function subscribePipeline(onChange: () => void) {
  if (typeof window === "undefined") return () => undefined;
  const handler = () => onChange();
  window.addEventListener(SELECTED_CLUSTER_ASSEMBLY_EVENT, handler);
  window.addEventListener(DOWNSTREAM_PIPELINE_EVENT, handler);
  return () => {
    window.removeEventListener(SELECTED_CLUSTER_ASSEMBLY_EVENT, handler);
    window.removeEventListener(DOWNSTREAM_PIPELINE_EVENT, handler);
  };
}

export async function loadPipeline(): Promise<ResolvedPipeline> {
  const response = await fetch("/api/pipeline", { cache: "no-store" });
  if (!response.ok) throw new Error("The downstream pipeline could not be read.");
  return response.json() as Promise<ResolvedPipeline>;
}

export async function stampInterpretation() {
  const response = await fetch("/api/pipeline/interpretation", { method: "PUT" });
  const body = await response.json() as ResolvedPipeline & { error?: string };
  if (!response.ok) throw new Error(body.error || "The Interpretation revision could not be recorded.");
  announceDownstreamPipeline("interpretation");
  return body;
}

export async function stampEnclosure() {
  const response = await fetch("/api/pipeline/enclosure", { method: "PUT" });
  const body = await response.json() as { enclosure?: unknown; finalEnclosedModel?: unknown; error?: string };
  if (!response.ok) throw new Error(body.error || "The Enclosure revision could not be recorded.");
  announceDownstreamPipeline("enclosure");
  return body;
}

export function statusLabel(status: string) {
  if (status === "no-source") return "No source";
  if (status === "source-ready") return "Source ready";
  if (status === "working") return "Working";
  if (status === "complete") return "Complete";
  if (status === "awaiting") return "Awaiting work";
  if (status === "current-source") return "Current source";
  if (status === "stale-source") return "Needs update · older source";
  return status;
}
