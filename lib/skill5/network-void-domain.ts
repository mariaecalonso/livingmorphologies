import type { SitePoint, VoidDomain } from "./network-constrained-void";

/**
 * Builds a void-generation domain from pieces the caller supplies.
 * A missing width, height, or site ring is reported and omitted.
 * Nothing here is a permanent site standard, and the result is not a building envelope.
 */
export type PlanRing = readonly { x: number; z: number }[];

export type DomainZoneInput = {
  id: string;
  plan: PlanRing;
  baseFt?: number;
  heightFt?: number;
};

export type DomainCorridorInput = {
  id: string;
  from: { x: number; z: number };
  to: { x: number; z: number };
  /** Required. A centerline without a width is not a volume. */
  widthFt?: number;
  baseFt?: number;
  heightFt?: number;
};

export type DomainTransitionInput = {
  id: string;
  plan: PlanRing;
  minY?: number;
  maxY?: number;
};

export type DomainExclusionInput = {
  id: string;
  plan: PlanRing;
  minY?: number;
  maxY?: number;
};

export type NetworkDomainInput = {
  source: string;
  provisional: boolean;
  zones?: readonly DomainZoneInput[];
  corridors?: readonly DomainCorridorInput[];
  transitions?: readonly DomainTransitionInput[];
  siteBoundary?: { plan: PlanRing; minY?: number; maxY?: number } | null;
  exclusions?: readonly DomainExclusionInput[];
};

export type NetworkDomainBuild = {
  /** Union of the volumes that were fully specified. Null when nothing could be built. */
  domain: VoidDomain | null;
  /** Volumes that were skipped, and why. */
  missing: { id: string; parameter: string }[];
  /** The pieces that did become volumes, still separate so a caller can inspect them. */
  parts: { id: string; kind: string; domain: VoidDomain }[];
};

export function buildNetworkDomain(input: NetworkDomainInput): NetworkDomainBuild {
  const missing: { id: string; parameter: string }[] = [];
  const parts: NetworkDomainBuild["parts"] = [];
  const push = (id: string, kind: string, domain: VoidDomain | null, parameter: string) => {
    if (!domain) {
      missing.push({ id, parameter });
      return;
    }
    parts.push({ id, kind, domain });
  };
  (input.zones ?? []).forEach((zone) => {
    if (zone.baseFt == null || zone.heightFt == null) push(zone.id, "zone", null, "baseFt and heightFt");
    else push(zone.id, "zone", extrusion(zone.plan, zone.baseFt, zone.baseFt + zone.heightFt, input), "plan");
  });
  (input.corridors ?? []).forEach((corridor) => {
    if (corridor.widthFt == null) push(corridor.id, "corridor", null, "widthFt");
    else if (corridor.baseFt == null || corridor.heightFt == null) push(corridor.id, "corridor", null, "baseFt and heightFt");
    else push(corridor.id, "corridor", corridorVolume(corridor, input), "widthFt");
  });
  (input.transitions ?? []).forEach((transition) => {
    if (transition.minY == null || transition.maxY == null) push(transition.id, "transition", null, "minY and maxY");
    else push(transition.id, "transition", extrusion(transition.plan, transition.minY, transition.maxY, input), "plan");
  });
  if (input.siteBoundary && (input.siteBoundary.minY == null || input.siteBoundary.maxY == null)) {
    missing.push({ id: "site-boundary", parameter: "minY and maxY" });
  }
  const exclusions = (input.exclusions ?? []).flatMap((exclusion) => {
    if (exclusion.minY == null || exclusion.maxY == null) {
      missing.push({ id: exclusion.id, parameter: "minY and maxY" });
      return [];
    }
    const domain = extrusion(exclusion.plan, exclusion.minY, exclusion.maxY, input);
    return domain ? [domain] : [];
  });
  if (parts.length === 0) return { domain: null, missing, parts };
  const min = { x: Infinity, y: Infinity, z: Infinity };
  const max = { x: -Infinity, y: -Infinity, z: -Infinity };
  parts.forEach((part) => {
    min.x = Math.min(min.x, part.domain.min.x);
    min.y = Math.min(min.y, part.domain.min.y);
    min.z = Math.min(min.z, part.domain.min.z);
    max.x = Math.max(max.x, part.domain.max.x);
    max.y = Math.max(max.y, part.domain.max.y);
    max.z = Math.max(max.z, part.domain.max.z);
  });
  const site = input.siteBoundary?.minY != null && input.siteBoundary.maxY != null
    ? extrusion(input.siteBoundary.plan, input.siteBoundary.minY, input.siteBoundary.maxY, input)
    : null;
  return {
    domain: {
      kind: "bounds",
      min,
      max,
      parts: parts.map((part) => part.domain),
      exclusions,
      siteLimit: site ?? undefined,
      source: input.source,
      provisional: input.provisional,
    },
    missing,
    parts,
  };
}

function extrusion(plan: PlanRing, minY: number, maxY: number, input: NetworkDomainInput): VoidDomain | null {
  if (plan.length < 3 || !(maxY > minY)) return null;
  let minX = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxZ = -Infinity;
  plan.forEach((point) => {
    minX = Math.min(minX, point.x);
    minZ = Math.min(minZ, point.z);
    maxX = Math.max(maxX, point.x);
    maxZ = Math.max(maxZ, point.z);
  });
  return {
    kind: "plan-extrusion",
    plan,
    min: { x: minX, y: minY, z: minZ },
    max: { x: maxX, y: maxY, z: maxZ },
    source: input.source,
    provisional: input.provisional,
  };
}

function corridorVolume(corridor: DomainCorridorInput & { widthFt: number; baseFt: number; heightFt: number }, input: NetworkDomainInput): VoidDomain | null {
  const dx = corridor.to.x - corridor.from.x;
  const dz = corridor.to.z - corridor.from.z;
  const length = Math.hypot(dx, dz);
  if (length < 1e-3) return null;
  const px = -dz / length * corridor.widthFt / 2;
  const pz = dx / length * corridor.widthFt / 2;
  const plan = [
    { x: corridor.from.x + px, z: corridor.from.z + pz },
    { x: corridor.to.x + px, z: corridor.to.z + pz },
    { x: corridor.to.x - px, z: corridor.to.z - pz },
    { x: corridor.from.x - px, z: corridor.from.z - pz },
  ];
  return extrusion(plan, corridor.baseFt, corridor.baseFt + corridor.heightFt, input);
}

/** True when a point is inside any built part and outside every exclusion. */
export function pointInBuiltDomain(point: SitePoint, build: NetworkDomainBuild) {
  if (!build.domain) return false;
  if (build.parts.length === 0) return false;
  const excluded = (build.domain.exclusions ?? []).some((exclusion) => inPart(point, exclusion));
  if (excluded) return false;
  return build.parts.some((part) => inPart(point, part.domain));
}

function inPart(point: SitePoint, domain: VoidDomain) {
  if (point.y < domain.min.y || point.y > domain.max.y) return false;
  if (point.x < domain.min.x || point.x > domain.max.x || point.z < domain.min.z || point.z > domain.max.z) return false;
  if (domain.kind === "bounds") return true;
  let inside = false;
  const ring = domain.plan ?? [];
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index, index += 1) {
    const a = ring[index];
    const b = ring[previous];
    const crosses = a.z > point.z !== b.z > point.z;
    if (crosses && point.x < ((b.x - a.x) * (point.z - a.z)) / (b.z - a.z || 1e-9) + a.x) inside = !inside;
  }
  return inside;
}
