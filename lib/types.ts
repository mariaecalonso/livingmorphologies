export type TypologyId = "lobby" | "workspace" | "gathering";
export type Rating = 0 | 1 | 2;
export type GroupId = "formal" | "spatial" | "atmospheric";

export type CriterionLevel = {
  value: Rating;
  label: "Low" | "Medium" | "High";
  description: string;
};

export type CriterionDefinition = {
  id: string;
  label: string;
  shared: boolean;
  levels: [CriterionLevel, CriterionLevel, CriterionLevel];
};

export type BranchSchema = {
  id: GroupId;
  title: string;
  subtitle: string;
  shared: [CriterionDefinition, CriterionDefinition];
  specific: Record<TypologyId, CriterionDefinition>;
};

export type ArchetypeRecord = {
  id: string;
  name: string;
  ratings: Record<string, Rating>;
  descriptors: Record<GroupId, string>;
};

export type TypologyRecord = {
  id: TypologyId;
  label: string;
  definition: string;
  archetypes: ArchetypeRecord[];
};

export type CriterionInstance = {
  id: string;
  label: string;
  rating: Rating;
  definition: CriterionDefinition;
};

export type CriterionGroup = {
  id: GroupId;
  title: string;
  subtitle: string;
  criteria: CriterionInstance[];
  descriptor: string;
};

export type RatingsMap = Record<string, Rating>;

export type PhysarumParams = {
  seed: number;
  agentCount: number;
  sensorAngle: number;
  sensorDistance: number;
  turnAngle: number;
  stepSize: number;
  deposit: number;
  decay: number;
  spread: number;
  elongate: number;
  centerPull: number;
  contrast: number;
  hierarchy: number;
  visibility: number;
};
