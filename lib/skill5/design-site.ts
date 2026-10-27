import type { XZ } from "./site-model";

export type DesignSite = {
  ring: [XZ, XZ, XZ, XZ];
  widthFeet: number;
  depthFeet: number;
  areaSqFt: number;
};

/** North-aligned rectangle of the parcel extents. The stored ring is not modified. */
export function designSiteFromParcel(ring: readonly XZ[]): DesignSite {
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const [x, z] of ring) {
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minZ = Math.min(minZ, z);
    maxZ = Math.max(maxZ, z);
  }
  const widthFeet = maxX - minX;
  const depthFeet = maxZ - minZ;
  const corners: [XZ, XZ, XZ, XZ] = [
    [minX, minZ],
    [maxX, minZ],
    [maxX, maxZ],
    [minX, maxZ],
  ];
  return { ring: corners, widthFeet, depthFeet, areaSqFt: widthFeet * depthFeet };
}
