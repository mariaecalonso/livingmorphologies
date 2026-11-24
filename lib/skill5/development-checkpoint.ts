import { selectedClusterAssembly, type ClusterAssemblyRecord } from "./cluster-assemblies";

/**
 * Read-only source contract for Architectural Interpretation production input.
 * Lab I/O names live in `lib/lab-contracts.ts`. This exposes the selected
 * Cluster Assembly. It does not generate enclosure, floors, envelope,
 * circulation, shrinkwrap, or architectural articulation.
 */
export const DEVELOPMENT_CHECKPOINT_CONTRACT = "skill5-development-checkpoint-v1" as const;

export type DevelopmentCheckpoint = {
  contract: typeof DEVELOPMENT_CHECKPOINT_CONTRACT;
  selectedAssemblyId: string | null;
  assembly: ClusterAssemblyRecord | null;
};

export function readDevelopmentCheckpoint(): DevelopmentCheckpoint {
  const assembly = selectedClusterAssembly();
  return {
    contract: DEVELOPMENT_CHECKPOINT_CONTRACT,
    selectedAssemblyId: assembly?.assemblyId ?? null,
    assembly,
  };
}
