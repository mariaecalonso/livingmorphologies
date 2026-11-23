/** Skill 6 units. X and Y are horizontal. Z is up. Cluster meshes are not scaled into meters. */
export const INTERPRETATION_CONTRACT = "architectural-interpretation-v1" as const;

/** The interpretation reads in this order. Floor plates are not sections of the cluster. */
export const INTERPRETATION_WORKFLOW = "Final cluster → bounding box → boolean architectural carving → inserted floor plates" as const;

export const PROPOSALS = [
  {
    id: "preserve",
    label: "Preserve Morphology",
    summary: "The refined cluster stays the exterior wall. Floor plates are new slabs inserted in its bounding box on a tall rhythm and carved against that wall.",
  },
  {
    id: "balanced",
    label: "Balanced Adaptation",
    summary: "The bounding box is the organizing volume. Inserted floor plates, a core, an entrance, and a spine are carved inside it. The cluster remains the enclosing wall.",
  },
  {
    id: "definition",
    label: "Architectural Definition",
    summary: "The same carving, with a tighter inserted rhythm, a larger core, an entrance, and openings. The cluster stays the envelope. Plates are not cut from the cluster.",
  },
] as const;

export type ProposalId = (typeof PROPOSALS)[number]["id"];

export type ElementKind = "mass" | "floor" | "core" | "entrance" | "opening" | "connector" | "column" | "envelope";

export type EncodedMesh = { positions: string; indices: string; triangles: number };

export type ElementEdit = {
  translation: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
};

export type InterpretationElement = {
  id: string;
  kind: ElementKind;
  label: string;
  editable: boolean;
  /** Moving this element recuts the exterior wall. Floor edits move the inserted slab. */
  cutsMass: boolean;
  mesh: EncodedMesh;
  origin: [number, number, number];
  elevation: number | null;
  size: [number, number, number];
};

export type InterpretationSource = {
  id: string;
  meshFile: string;
  tiles: number;
  volume: number;
  triangles: number;
  bounds: { min: [number, number, number]; max: [number, number, number] };
  validation: string | null;
};

export type InterpretationModel = {
  contract: typeof INTERPRETATION_CONTRACT;
  units: "skill6";
  axes: "X and Y horizontal, Z up";
  source: InterpretationSource;
  proposal: { id: ProposalId; label: string; summary: string };
  limitations: string[];
  original: EncodedMesh;
  elements: InterpretationElement[];
};

export function isProposalId(value: string | null): value is ProposalId {
  return PROPOSALS.some((item) => item.id === value);
}

export function proposalOf(id: ProposalId) {
  const found = PROPOSALS.find((item) => item.id === id);
  if (!found) throw new Error(`Unknown proposal: ${id}`);
  return found;
}
