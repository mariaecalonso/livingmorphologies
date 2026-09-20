import { groupsForArchetype, TYPOLOGIES } from "../catalog";
import { hasPrototypeConfig, PROTOTYPE_ARCHETYPE_IDS } from "./archetypes";
import { readArchitecture } from "./architecture";
import { runSimulation, trailPeak } from "./engine";
import { translateArchetype } from "./translate";

function massNear(
  occupancy: number[],
  size: number,
  cx: number,
  cy: number,
  radius: number,
) {
  let mass = 0;
  let total = 0;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const value = occupancy[y * size + x];
      total += value;
      if (Math.hypot(x - cx, y - cy) <= radius) mass += value;
    }
  }
  return total > 1e-6 ? mass / total : 0;
}

function meanNear(
  field: number[],
  size: number,
  cx: number,
  cy: number,
  inner: number,
  outer = inner,
) {
  let sum = 0;
  let count = 0;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const dist = Math.hypot(x - cx, y - cy);
      if (dist < inner || dist > outer) continue;
      sum += field[y * size + x];
      count += 1;
    }
  }
  return count ? sum / count : 0;
}

function agentSpread(agents: Array<{ x: number; y: number }>) {
  const n = Math.max(1, agents.length);
  const cx = agents.reduce((sum, agent) => sum + agent.x, 0) / n;
  const cy = agents.reduce((sum, agent) => sum + agent.y, 0) / n;
  const rms = Math.sqrt(
    agents.reduce(
      (sum, agent) => sum + (agent.x - cx) ** 2 + (agent.y - cy) ** 2,
      0,
    ) / n,
  );
  return rms;
}

function summary(archetypeId: string, seed: number) {
  const translation = translateArchetype(archetypeId);
  const state = runSimulation(translation, seed, 280, 700);
  const coreShare = massNear(
    state.occupancy,
    state.size,
    state.attractor.x,
    state.attractor.y,
    4.5,
  );
  const meanDist = agentSpread(state.agents);
  const outerShare = massNear(
    state.occupancy,
    state.size,
    state.attractor.x,
    state.attractor.y,
    8,
  );
  let weak = 0;
  const peak = trailPeak(state);
  for (const value of state.trails) {
    const n = value / peak;
    if (n > 0.02 && n < 0.22) weak += 1;
  }
  const coreIndex =
    Math.round(state.attractor.y) * state.size + Math.round(state.attractor.x);
  const reading = readArchitecture(state, translation);
  const coreOcc = meanNear(
    reading.occupancy,
    state.size,
    state.attractor.x,
    state.attractor.y,
    0,
    2.2,
  );
  const ringOcc = meanNear(
    reading.occupancy,
    state.size,
    state.attractor.x,
    state.attractor.y,
    3.4,
    6.4,
  );
  const coreVoid = meanNear(
    reading.voidField,
    state.size,
    state.attractor.x,
    state.attractor.y,
    0,
    2.2,
  );
  return {
    id: translation.archetypeId,
    params: translation.params,
    source: state.source,
    attractor: state.attractor,
    iterations: state.iteration,
    agents: state.agents.length,
    coreShare: Number(coreShare.toFixed(3)),
    outerShare: Number(outerShare.toFixed(3)),
    spread: Number(meanDist.toFixed(3)),
    coreD: Number(state.permeabilityField[coreIndex].toFixed(3)),
    weak,
    topology: {
      kind: reading.kind,
      coreOcc: Number(coreOcc.toFixed(3)),
      ringOcc: Number(ringOcc.toFixed(3)),
      coreVoid: Number(coreVoid.toFixed(3)),
      primaryVoids: reading.primaryVoids.length,
      rooms: reading.rooms.length,
      mass: reading.floors.length,
    },
  };
}

const a = summary(PROTOTYPE_ARCHETYPE_IDS[0], 42);
const b = summary(PROTOTYPE_ARCHETYPE_IDS[1], 42);

console.log(JSON.stringify({ voidField: a, containedRoom: b }, null, 2));

if (a.params.nodeSpacing <= b.params.nodeSpacing) {
  throw new Error("Void Field should have greater node spacing than Contained Room");
}
if (a.source.x >= b.source.x) {
  throw new Error("Sources should use opposite bottom corners");
}
if (a.params.geometryVariation >= b.params.geometryVariation) {
  throw new Error("Contained Room should carry higher geometry variation");
}
if (a.weak < 8 || b.weak < 8) {
  throw new Error("Weak trails must remain visible rather than vanish");
}
if (a.agents < 500 || b.agents < 500) {
  throw new Error("Simulation must run hundreds of agents");
}

for (const typology of TYPOLOGIES) {
  for (const record of typology.archetypes) {
    if (!hasPrototypeConfig(record.id)) {
      throw new Error(`Missing Skill 1 recipe for ${typology.id}/${record.id}`);
    }
    const translation = translateArchetype(record.id);
    if (record.id === "void-field" && translation.topology !== "around-absence") {
      throw new Error("Void Field must stay around-absence");
    }
    if (
      record.id === "contained-room-within-volume" &&
      translation.topology !== "contained-interior"
    ) {
      throw new Error("Contained Room must stay contained-interior");
    }
    const groups = groupsForArchetype(translation.typologyId, record, translation.ratings);
    const criteria = groups.flatMap((group) => group.criteria);
    if (translation.traces.length !== criteria.length) {
      throw new Error(`${record.id} must trace every catalog criterion`);
    }
    if (translation.rankings.length !== criteria.length) {
      throw new Error(`${record.id} must rank every criterion against each descriptor`);
    }
    for (const ranking of translation.rankings) {
      if (!ranking.ranks.formal || !ranking.ranks.spatial || !ranking.ranks.atmospheric) {
        throw new Error(`${record.id} ranking for ${ranking.criterionId} is missing a descriptor column`);
      }
    }
  }
}

console.log("Skill 1 maps ranked criteria into Physarum agent behavior for every archetype.");
