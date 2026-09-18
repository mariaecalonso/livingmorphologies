export type TypologyId = "lobby" | "workspace" | "gathering";
export type Rating = 0 | 1 | 2;
export type GroupId = "formal" | "spatial" | "atmospheric";

export type Criterion = {
  id: string;
  label: string;
  rating: Rating;
};

export type CriterionGroup = {
  id: GroupId;
  title: string;
  subtitle: string;
  criteria: Criterion[];
  descriptor: string;
};

export type Archetype = {
  id: string;
  name: string;
  groups: CriterionGroup[];
  synthesis: string;
};

export type Typology = {
  id: TypologyId;
  label: string;
  tagline: string;
  archetypes: Archetype[];
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
