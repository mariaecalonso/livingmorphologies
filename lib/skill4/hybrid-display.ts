import type { IsoMesh } from "../scan/isomesh";
import { DEFAULT_SELECTED_HYBRID_ID, type GenerationStatus, type TileConnection } from "./connections";
import type { GeneratedHybridCandidate } from "./generated-hybrid-field";
import { MOCK_HYBRID_LABEL, mockHybridField } from "./mock-hybrids";

export type HybridSlotSource = "mock" | "ready" | "empty" | "blocked" | "invalid";

export type HybridDisplaySlot = {
  id: string;
  source: HybridSlotSource;
  mesh: IsoMesh | null;
  label: string;
};

export type HybridDisplay = {
  source: "mock" | "generated";
  banner: string;
  slots: HybridDisplaySlot[];
  selected: HybridDisplaySlot;
};

export function currentGeneratedField(connection: Pick<TileConnection, "signature" | "generatedHybridField">) {
  const field = connection.generatedHybridField;
  if (!field || field.connectionSignature !== connection.signature) return null;
  return field;
}

export function generationStatusLabel(status: GenerationStatus) {
  if (status === "not-generated") return "Not generated";
  if (status === "generating") return "Generating";
  if (status === "ready") return "Ready";
  if (status === "partial") return "Partial";
  if (status === "empty") return "Empty";
  if (status === "blocked") return "Blocked";
  return "Invalid";
}

export function hybridDisplay(connection: Pick<TileConnection, "signature" | "selectedMockId" | "generatedHybridField">): HybridDisplay {
  const generated = currentGeneratedField(connection);
  if (!generated) {
    const field = mockHybridField(connection.signature);
    const slots = field.candidates.map((candidate) => ({
      id: candidate.id,
      source: "mock" as const,
      mesh: candidate.mesh,
      label: candidate.id,
    }));
    return { source: "mock", banner: MOCK_HYBRID_LABEL, slots, selected: pickSlot(slots, connection.selectedMockId) };
  }
  const slots = generated.candidates.map(slotFromGenerated);
  return { source: "generated", banner: "Generated hybrids", slots, selected: pickSlot(slots, connection.selectedMockId) };
}

function slotFromGenerated(candidate: GeneratedHybridCandidate): HybridDisplaySlot {
  if (candidate.status === "ready" && candidate.geometry) {
    return { id: candidate.candidateId, source: "ready", mesh: candidate.geometry, label: candidate.candidateId };
  }
  const source: HybridSlotSource = candidate.status === "empty" || candidate.status === "blocked" ? candidate.status : "invalid";
  const label = source === "empty" ? "Empty" : source === "blocked" ? "Blocked" : "Invalid";
  return { id: candidate.candidateId, source, mesh: null, label };
}

function pickSlot(slots: HybridDisplaySlot[], id: string): HybridDisplaySlot {
  return slots.find((slot) => slot.id === id)
    ?? slots.find((slot) => slot.id === DEFAULT_SELECTED_HYBRID_ID)
    ?? slots[Math.min(12, Math.max(0, slots.length - 1))]
    ?? { id, source: "invalid", mesh: null, label: "Invalid" };
}
