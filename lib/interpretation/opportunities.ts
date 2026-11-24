/**
 * Milestone 2 readings. Every opportunity is an interpretation of measured regions.
 * Nothing here creates a floor, wall, bridge, or other mesh.
 */
import { analyzeBuilding, meshContains, type BuildingAnalysis, type Finding } from "./analyze-building";
import type { BuildingRequest, Vec3 } from "./building";
import { connectedRegions, relateRegions, type RegionRelation, type SurfaceRegion } from "./regions";

export const OPPORTUNITY_CONTRACT = "architectural-interpretation-opportunities-v1" as const;

export type OpportunityFlag =
  | "insufficient-clearance"
  | "isolated"
  | "poor-continuity"
  | "void-conflict"
  | "excessive-modification"
  | "unsupported-assumption";

export type OpportunityType =
  | "stepped-landscape"
  | "partial-platform"
  | "mezzanine"
  | "multi-height-volume"
  | "sheltered-overhang"
  | "lateral-connection"
  | "vertical-connection"
  | "preserve";

export type Opportunity = {
  id: string;
  featureId: string;
  status: "candidate" | "alternative" | "rejected";
  type: OpportunityType;
  clusterIds: string[];
  regionIds: string[];
  effect: string;
  transformation: string;
  measurements: Record<string, number | string | null>;
  confidence: "high" | "medium" | "low" | "unsupported";
  limitations: string[];
  unsuitableBecause: string[];
  flags: OpportunityFlag[];
  generatesGeometry: false;
};

export type AssemblyReading = {
  contract: typeof OPPORTUNITY_CONTRACT;
  milestone: 2;
  generatesGeometry: false;
  assemblyId: string;
  analysis: BuildingAnalysis;
  regions: SurfaceRegion[];
  relations: RegionRelation[];
  opportunities: Opportunity[];
  limitations: string[];
};

function round(value: number, digits = 2): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function finding(report: BuildingAnalysis, id: string): Finding | undefined {
  return report.findings.find((item) => item.id === id);
}

function numeric(item: Finding | undefined, key: string): number | null {
  const value = item?.values[key];
  return typeof value === "number" ? value : null;
}

function place(positions: Float32Array, translation: Vec3): Float32Array {
  const out = new Float32Array(positions.length);
  for (let index = 0; index < positions.length; index += 3) {
    out[index] = positions[index] + translation[0];
    out[index + 1] = positions[index + 1] + translation[1];
    out[index + 2] = positions[index + 2] + translation[2];
  }
  return out;
}

function planOverlap(left: SurfaceRegion, right: SurfaceRegion): number {
  const x = Math.min(left.plan.maxX, right.plan.maxX) - Math.max(left.plan.minX, right.plan.minX);
  const y = Math.min(left.plan.maxY, right.plan.maxY) - Math.max(left.plan.minY, right.plan.minY);
  if (x <= 0 || y <= 0) return 0;
  return x * y;
}

function planDistance(left: SurfaceRegion, right: SurfaceRegion): number {
  const x = Math.max(0, Math.max(left.plan.minX, right.plan.minX) - Math.min(left.plan.maxX, right.plan.maxX));
  const y = Math.max(0, Math.max(left.plan.minY, right.plan.minY) - Math.min(left.plan.maxY, right.plan.maxY));
  return Math.hypot(x, y);
}

function opportunity(partial: Omit<Opportunity, "generatesGeometry">): Opportunity {
  return { ...partial, generatesGeometry: false };
}

function readCluster(
  request: BuildingRequest,
  report: BuildingAnalysis,
  regions: SurfaceRegion[],
  world: Map<string, Float32Array>,
  opportunities: Opportunity[],
) {
  for (const cluster of request.clusters) {
    const slope = finding(report, `${cluster.id}:slope`);
    const thickness = numeric(finding(report, `${cluster.id}:thickness`), "medianFeet");
    const height = (numeric(finding(report, `${cluster.id}:elevation`), "maxZ") ?? 0) - (numeric(finding(report, `${cluster.id}:elevation`), "minZ") ?? 0);
    const overhang = finding(report, `${cluster.id}:void`);
    const cover = numeric(overhang, "overhangMedianFeet");
    const coverSamples = numeric(overhang, "overhangSamples") ?? 0;
    const up = regions.filter((region) => region.clusterId === cluster.id && region.facing === "up" && region.area >= 12);
    const oblique = numeric(slope, "obliqueArea");
    const upArea = numeric(slope, "upArea");
    const positions = world.get(cluster.id);
    opportunities.push(opportunity({
      id: `${cluster.id}:preserve`,
      featureId: `${cluster.id}:morphology`,
      status: "candidate",
      type: "preserve",
      clusterIds: [cluster.id],
      regionIds: [],
      effect: "Leave this cluster's surface uninterrupted. The oblique area is the largest slope class.",
      transformation: "None.",
      measurements: { obliqueArea: oblique, upArea, upFraction: numeric(slope, "upFraction"), heightFeet: round(height, 2) },
      confidence: "medium",
      limitations: ["Preserving the form does not produce a floor. It is a reading of restraint, not a structural certification."],
      unsuitableBecause: ["Unsuitable only if the goal is to maximize new floor area. That goal is not used here."],
      flags: [],
    }));

    if (coverSamples > 0 && cover != null) {
      const lowCover = thickness != null && cover < thickness;
      opportunities.push(opportunity({
        id: `${cluster.id}:shelter`,
        featureId: `${cluster.id}:overhang`,
        status: "candidate",
        type: "sheltered-overhang",
        clusterIds: [cluster.id],
        regionIds: [],
        effect: "Exterior probe cells sit in open air with a surface above them. They can be read as sheltered ground, not as rooms.",
        transformation: "None on the mesh. Using the shelter would still need access, which is not measured.",
        measurements: { coverMedianFeet: cover, coverMinFeet: numeric(overhang, "overhangMinFeet"), samples: coverSamples, thicknessMedianFeet: thickness },
        confidence: "low",
        limitations: ["The probe is 4 feet. A short clearance can be a cell grazing a fold. This is not a code or accessibility judgment."],
        unsuitableBecause: lowCover ? ["The median cover is shorter than the solid's own median thickness, so it is a poor place to assume a person can stand."] : [],
        flags: lowCover ? ["insufficient-clearance", "unsupported-assumption"] : ["unsupported-assumption"],
      }));
      opportunities.push(opportunity({
        id: `${cluster.id}:shelter-preserve`,
        featureId: `${cluster.id}:overhang`,
        status: "alternative",
        type: "preserve",
        clusterIds: [cluster.id],
        regionIds: [],
        effect: "Keep the overhang as part of the morphology instead of assigning it a use.",
        transformation: "None.",
        measurements: { coverMedianFeet: cover },
        confidence: "medium",
        limitations: ["This alternative does not deny the measured air. It refuses to name it a room."],
        unsuitableBecause: [],
        flags: [],
      }));
      opportunities.push(opportunity({
        id: `${cluster.id}:multi-height`,
        featureId: `${cluster.id}:overhang`,
        status: cover > height * 0.4 ? "candidate" : "rejected",
        type: "multi-height-volume",
        clusterIds: [cluster.id],
        regionIds: [],
        effect: "Read the open air under the mass as one tall volume.",
        transformation: cover > height * 0.4 ? "None yet. A tall volume would still not be enclosed." : "Would require treating a short measured gap as a hall.",
        measurements: { coverMedianFeet: cover, clusterHeightFeet: round(height, 2) },
        confidence: cover > height * 0.4 ? "low" : "unsupported",
        limitations: ["Open air inside the bounding probe is not an enclosed room."],
        unsuitableBecause: cover > height * 0.4 ? [] : [`Median cover is ${cover} feet against a cluster height of ${round(height, 1)} feet, so the air is not multi-height.`],
        flags: cover > height * 0.4 ? ["unsupported-assumption"] : ["insufficient-clearance", "unsupported-assumption"],
      }));
    }

    let solidCaps = 0;
    for (const region of up) {
      const featureId = region.id;
      const neighbors = up.filter((other) => other.id !== region.id && planDistance(region, other) <= 6);
      const flags: OpportunityFlag[] = ["unsupported-assumption"];
      if (neighbors.length === 0) flags.push("isolated");
      if (region.zSpan > 2 || region.slopeDeg > 12) flags.push("excessive-modification");
      const level = region.zSpan <= 3 && region.slopeDeg <= 18 && region.area >= 24;
      const sample = positions
        ? [
            region.centroid[0] - region.normal[0] * 0.4,
            region.centroid[1] - region.normal[1] * 0.4,
            region.centroid[2] - region.normal[2] * 0.4,
          ] as Vec3
        : null;
      const inside = positions && sample ? meshContains(positions, cluster.indices, sample) : null;
      if (inside === true) solidCaps += 1;
      opportunities.push(opportunity({
        id: `${region.id}:platform`,
        featureId,
        status: level ? "candidate" : "rejected",
        type: "partial-platform",
        clusterIds: [cluster.id],
        regionIds: [region.id],
        effect: "Read this connected upward patch as a partial exterior cap. Upward facing is not a floor.",
        transformation: level ? "No mesh is cut. Occupation would need an approach that the surface does not contain." : "Would require promoting a small or steep patch into a platform.",
        measurements: {
          area: round(region.area, 1),
          minZ: round(region.minZ, 2),
          maxZ: round(region.maxZ, 2),
          zSpan: round(region.zSpan, 2),
          slopeDeg: round(region.slopeDeg, 1),
          triangles: region.triangles,
          nearbyUpRegions: neighbors.length,
        },
        confidence: level ? "low" : "unsupported",
        limitations: ["The region is an edge-connected normal cone, not a designed slab. Access is not measured."],
        unsuitableBecause: level ? [] : [`Area ${round(region.area, 1)} square feet, slope ${round(region.slopeDeg, 1)} degrees, or height span ${round(region.zSpan, 1)} feet misses the platform filter.`],
        flags,
      }));
      opportunities.push(opportunity({
        id: `${region.id}:preserve`,
        featureId,
        status: "alternative",
        type: "preserve",
        clusterIds: [cluster.id],
        regionIds: [region.id],
        effect: "Leave this patch as uninterrupted morphology.",
        transformation: "None.",
        measurements: { area: round(region.area, 1), slopeDeg: round(region.slopeDeg, 1) },
        confidence: "medium",
        limitations: ["Preferable when the patch is isolated or would have to be flattened."],
        unsuitableBecause: [],
        flags: flags.includes("excessive-modification") ? ["excessive-modification"] : [],
      }));
      opportunities.push(opportunity({
        id: `${region.id}:mezzanine`,
        featureId,
        status: inside === false ? "rejected" : "rejected",
        type: "mezzanine",
        clusterIds: [cluster.id],
        regionIds: [region.id],
        effect: "Read the patch as a deck with open height below it.",
        transformation: "Would require an open volume under the surface. None is cut here.",
        measurements: { solidBelow: inside == null ? null : inside ? 1 : 0, area: round(region.area, 1) },
        confidence: "unsupported",
        limitations: ["A point 0.4 feet along the inward normal is only a sample."],
        unsuitableBecause: [
          inside === true
            ? "The sample under the surface is inside the solid, so the patch is a crown, not a mezzanine."
            : "The sample did not establish a measured open height under the surface.",
        ],
        flags: ["unsupported-assumption"],
      }));
    }

    const steppedPairs = [];
    for (let left = 0; left < up.length; left += 1) {
      for (let right = left + 1; right < up.length; right += 1) {
        const rise = Math.abs(up[left].centroid[2] - up[right].centroid[2]);
        const overlap = planOverlap(up[left], up[right]);
        if (rise < 2) continue;
        steppedPairs.push({ left: up[left], right: up[right], rise, overlap });
      }
    }
    if (steppedPairs.length === 0) {
      opportunities.push(opportunity({
        id: `${cluster.id}:steps-rejected`,
        featureId: `${cluster.id}:steps`,
        status: "rejected",
        type: "stepped-landscape",
        clusterIds: [cluster.id],
        regionIds: up.map((region) => region.id),
        effect: "Read the upward patches as one terraced landscape.",
        transformation: "Would require at least two connected upward regions whose plans overlap and whose centroids differ by 2 feet or more.",
        measurements: { upRegions: up.length },
        confidence: "unsupported",
        limitations: ["Missing steps are not filled with a story grid."],
        unsuitableBecause: ["No pair of upward regions shares plan overlap and a rise of at least 2 feet."],
        flags: ["poor-continuity"],
      }));
    }
    steppedPairs.slice(0, 4).forEach((pair, index) => {
      const continuous = pair.overlap >= 0.2 * Math.min(pair.left.area, pair.right.area);
      const featureId = `${cluster.id}:steps:${index}`;
      opportunities.push(opportunity({
        id: `${featureId}:terrace`,
        featureId,
        status: continuous ? "candidate" : "rejected",
        type: "stepped-landscape",
        clusterIds: [cluster.id],
        regionIds: [pair.left.id, pair.right.id],
        effect: "Read the two upward regions as a step in the landscape.",
        transformation: "None. The rise is already in the mesh.",
        measurements: {
          riseFeet: round(pair.rise, 2),
          planOverlap: round(pair.overlap, 1),
          lowerZ: round(Math.min(pair.left.centroid[2], pair.right.centroid[2]), 2),
          upperZ: round(Math.max(pair.left.centroid[2], pair.right.centroid[2]), 2),
        },
        confidence: continuous ? "low" : "unsupported",
        limitations: ["A plan overlap of two caps is not a stair or a walking sequence."],
        unsuitableBecause: continuous ? [] : ["The shared plan area is small relative to the patches, so continuity is weak."],
        flags: continuous ? ["unsupported-assumption"] : ["poor-continuity", "unsupported-assumption"],
      }));
      opportunities.push(opportunity({
        id: `${featureId}:separate`,
        featureId,
        status: continuous ? "alternative" : "candidate",
        type: "preserve",
        clusterIds: [cluster.id],
        regionIds: [pair.left.id, pair.right.id],
        effect: "Keep the patches as separate morphological events instead of one terrace.",
        transformation: "None.",
        measurements: { riseFeet: round(pair.rise, 2), planOverlap: round(pair.overlap, 1) },
        confidence: continuous ? "low" : "medium",
        limitations: ["Separation does not remove the measured rise."],
        unsuitableBecause: [],
        flags: [],
      }));
      opportunities.push(opportunity({
        id: `${featureId}:shaft`,
        featureId,
        status: "rejected",
        type: "vertical-connection",
        clusterIds: [cluster.id],
        regionIds: [pair.left.id, pair.right.id],
        effect: "Treat the rise as a vertical circulation opening.",
        transformation: "Would require an open shaft. The samples under these crowns read as solid.",
        measurements: { riseFeet: round(pair.rise, 2), solidCrowns: solidCaps },
        confidence: "unsupported",
        limitations: ["Vertical circulation is not implied by two elevations."],
        unsuitableBecause: ["No open gap between the regions was measured. The change in height is solid morphology."],
        flags: ["unsupported-assumption", "poor-continuity"],
      }));
    });

    if (coverSamples > 0 && up.some((region) => region.area >= 24)) {
      opportunities.push(opportunity({
        id: `${cluster.id}:infill-rejected`,
        featureId: `${cluster.id}:overhang`,
        status: "rejected",
        type: "partial-platform",
        clusterIds: [cluster.id],
        regionIds: [],
        effect: "Extend a cap downward and occupy the sheltered air.",
        transformation: "Would fill measured open air. No solid is added.",
        measurements: { coverMedianFeet: cover },
        confidence: "unsupported",
        limitations: ["Filling the air would erase the overhang the probe measured."],
        unsuitableBecause: ["The open cells are a void condition, not spare floor area."],
        flags: ["void-conflict", "excessive-modification"],
      }));
    }
  }
}

function readGaps(request: BuildingRequest, report: BuildingAnalysis, opportunities: Opportunity[]) {
  for (let left = 0; left < request.clusters.length; left += 1) {
    for (let right = left + 1; right < request.clusters.length; right += 1) {
      const a = request.clusters[left];
      const b = request.clusters[right];
      const clearance = finding(report, `${a.id}__${b.id}:clearance`) ?? finding(report, `${b.id}__${a.id}:clearance`);
      const open = numeric(clearance, "openInterval") === 1;
      const lower = numeric(clearance, "lowerFeet");
      const upper = numeric(clearance, "upperFeet");
      const thicknessA = numeric(finding(report, `${a.id}:thickness`), "medianFeet");
      const thicknessB = numeric(finding(report, `${b.id}:thickness`), "medianFeet");
      const depth = thicknessA != null && thicknessB != null ? Math.min(thicknessA, thicknessB) : null;
      const featureId = `gap:${a.id}:${b.id}`;
      const near = open && lower != null && depth != null && lower <= depth + 0.5;
      if (!open) {
        opportunities.push(opportunity({
          id: `${featureId}:blocked`,
          featureId,
          status: "rejected",
          type: "lateral-connection",
          clusterIds: [a.id, b.id],
          regionIds: [],
          effect: "Read the pair as a lateral link.",
          transformation: "None. Another cluster occupies the interval, or the bounds overlap.",
          measurements: { blockedBy: typeof clearance?.values.blockedBy === "string" ? clearance.values.blockedBy : null },
          confidence: "unsupported",
          limitations: ["A blocked interval is not an open passage."],
          unsuitableBecause: ["The measured interval is not open."],
          flags: ["poor-continuity"],
        }));
        continue;
      }
      opportunities.push(opportunity({
        id: `${featureId}:link`,
        featureId,
        status: near ? "candidate" : "rejected",
        type: "lateral-connection",
        clusterIds: [a.id, b.id],
        regionIds: [],
        effect: near
          ? "The open interval is within the smaller solid depth, so the clusters are in spatial proximity. A future link could be studied."
          : "Read the fixture gap as a connection.",
        transformation: "A link would be new geometry. None is generated.",
        measurements: { lowerFeet: lower, upperFeet: upper, smallerThicknessFeet: depth },
        confidence: near ? "low" : "unsupported",
        limitations: ["Proximity is not a bridge, a corridor, or a shared floor."],
        unsuitableBecause: near ? [] : ["The open gap is larger than both clusters' median thickness, so it reads as separation rather than a joint."],
        flags: near ? ["unsupported-assumption"] : ["poor-continuity", "unsupported-assumption"],
      }));
      opportunities.push(opportunity({
        id: `${featureId}:preserve`,
        featureId,
        status: near ? "alternative" : "candidate",
        type: "preserve",
        clusterIds: [a.id, b.id],
        regionIds: [],
        effect: "Keep the measured open interval free of a connector.",
        transformation: "None.",
        measurements: { lowerFeet: lower, upperFeet: upper },
        confidence: near ? "medium" : "high",
        limitations: ["The interval is a fixture result, not a site measurement."],
        unsuitableBecause: [],
        flags: [],
      }));
      opportunities.push(opportunity({
        id: `${featureId}:corridor`,
        featureId,
        status: "rejected",
        type: "lateral-connection",
        clusterIds: [a.id, b.id],
        regionIds: [],
        effect: "Name the gap a corridor.",
        transformation: "Would require a continuous walking surface across the gap. None was measured.",
        measurements: { lowerFeet: lower },
        confidence: "unsupported",
        limitations: ["Clearance between solids is not a path."],
        unsuitableBecause: ["No upward region continues from one cluster onto the other."],
        flags: ["unsupported-assumption", "poor-continuity"],
      }));
    }
  }
}

/** Analysis plus connected regions and architectural readings for one assembly. */
export function readAssembly(request: BuildingRequest): AssemblyReading {
  const analysis = analyzeBuilding(request);
  const regions: SurfaceRegion[] = [];
  const world = new Map<string, Float32Array>();
  for (const cluster of request.clusters) {
    const placement = request.placements.find((item) => item.clusterId === cluster.id);
    const translation = placement?.translation ?? [0, 0, 0];
    const positions = place(cluster.positions, translation);
    world.set(cluster.id, positions);
    regions.push(...connectedRegions(cluster.id, cluster.meshFile, positions, cluster.indices));
  }
  const relations = relateRegions(regions);
  const opportunities: Opportunity[] = [];
  readCluster(request, analysis, regions, world, opportunities);
  readGaps(request, analysis, opportunities);
  return {
    contract: OPPORTUNITY_CONTRACT,
    milestone: 2,
    generatesGeometry: false,
    assemblyId: request.id,
    analysis,
    regions,
    relations,
    opportunities,
    limitations: [
      "Upward regions are not floors. Open probe cells are not rooms. Gaps are not corridors.",
      "Filters such as 2 feet of rise, 24 square feet, and the thickness comparison are morphological heuristics. They are not code, access, or structural checks.",
      "Connected regions stop at a facing change or a bend steeper than 35 degrees across an edge. Separate patches at the same height stay separate.",
      "No architectural solid is generated.",
    ],
  };
}

export function compareReadings(control: AssemblyReading, proximity: AssemblyReading) {
  const count = (reading: AssemblyReading, type: OpportunityType, status: Opportunity["status"]) => reading.opportunities.filter((item) => item.type === type && item.status === status).length;
  return {
    controlId: control.assemblyId,
    proximityId: proximity.assemblyId,
    controlSeparationFeet: control.analysis.placementRule.separationFeet,
    proximityPairGaps: proximity.analysis.placementRule.pairGaps ?? [],
    controlCrossRelations: control.relations.filter((item) => item.kind === "cross-cluster").length,
    proximityCrossRelations: proximity.relations.filter((item) => item.kind === "cross-cluster").length,
    controlLateralCandidates: count(control, "lateral-connection", "candidate"),
    proximityLateralCandidates: count(proximity, "lateral-connection", "candidate"),
    controlLateralRejected: count(control, "lateral-connection", "rejected"),
    proximityPreserveGaps: proximity.opportunities.filter((item) => item.type === "preserve" && item.featureId.startsWith("gap:")).length,
    mezzanineCandidates: count(proximity, "mezzanine", "candidate"),
    generatesGeometry: control.generatesGeometry || proximity.generatesGeometry,
  };
}
