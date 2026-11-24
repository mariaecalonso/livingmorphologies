import { designerZoningForNetwork, designerZoningSignature } from "./designer-zoning";
import { finishedClusterSource } from "./finished-cluster-source";
import {
  defaultClusterPose,
  occupancyIdForZone,
  programZoneKind,
  type OccupancyProvenance,
  type PlacedCluster,
} from "./placed-cluster";
import { readPublishedSelectedNetwork } from "./selected-site-network";

export class OccupancyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OccupancyError";
  }
}

export type PlaceOccupancyInput = {
  zoneId: string;
  programId: string;
  finishedClusterId: string;
  provenance?: OccupancyProvenance;
  transform?: PlacedCluster["transform"];
  networkId?: string;
};

export function placeOccupancyRecord(input: PlaceOccupancyInput): PlacedCluster {
  const published = readPublishedSelectedNetwork();
  const networkId = input.networkId || published.massingNetworkId;
  const zones = designerZoningForNetwork(networkId);
  const zone = zones.find((item) => item.id === input.zoneId);
  if (!zone) throw new OccupancyError("That zone is not in the designer zoning for the selected network.");
  const kind = programZoneKind(input.programId);
  if (!kind) throw new OccupancyError("That program has no Lobby / Workspace / Gathering zoning type.");
  if (kind !== zone.kind) throw new OccupancyError(`That program belongs in a ${kind} zone.`);
  if (!input.finishedClusterId) throw new OccupancyError("A finished cluster id is required.");
  const provenance = input.provenance === "assisted" || input.provenance === "automatic-initial" ? input.provenance : "manual";
  return {
    occupancyId: occupancyIdForZone(zone.id),
    zoneId: zone.id,
    programId: input.programId,
    finishedClusterId: input.finishedClusterId,
    transform: input.transform ?? defaultClusterPose(zone),
    selectedNetworkId: networkId,
    zoningSignature: designerZoningSignature(networkId),
    source: finishedClusterSource(input.programId, input.finishedClusterId),
    provenance,
  };
}
