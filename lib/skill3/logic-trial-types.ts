import type { VerticalViewerField } from "./viewer-field";

export type LogicTrialRun = {
  id: string;
  focus: string;
  focusLabel: string;
  seed: number;
  resolvedHorizon: number;
  status: "STABILIZED" | "ACTIVE_AT_CAP";
  lastDevelopmentalOffset: number;
  acceptedSampleCount: number;
  developmentalEvents: { components: number; opening: number; direction: number };
  field: VerticalViewerField;
};

export type LogicTrialFile = {
  archetypeId: string;
  candidateId: number;
  z0Iteration: number;
  parentChecksum: string;
  runs: LogicTrialRun[];
};
