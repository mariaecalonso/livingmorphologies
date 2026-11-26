"use client";

import { useEffect, useMemo } from "react";
import { DoubleSide, Shape, ShapeGeometry } from "three";
import type { ArrivalZoningMap, ArrivalZoningRegion } from "@/lib/skill5/arrival-zoning-map";

const FILL_Y = 1.25;
const EDGE_Y = 1.35;

function outlinePositions(ring: readonly { x: number; z: number }[], y: number) {
  const positions: number[] = [];
  for (let index = 0; index < ring.length; index += 1) {
    const from = ring[index];
    const to = ring[(index + 1) % ring.length];
    positions.push(from.x, y, from.z, to.x, y, to.z);
  }
  return new Float32Array(positions);
}

function RegionMesh({ region }: { region: ArrivalZoningRegion }) {
  const geometry = useMemo(() => {
    if (region.ring.length < 3) return null;
    const shape = new Shape();
    shape.moveTo(region.ring[0].x, region.ring[0].z);
    for (let index = 1; index < region.ring.length; index += 1) shape.lineTo(region.ring[index].x, region.ring[index].z);
    shape.closePath();
    const next = new ShapeGeometry(shape);
    next.rotateX(Math.PI / 2);
    next.translate(0, FILL_Y, 0);
    return next;
  }, [region.ring]);
  const line = useMemo(
    () => (region.ring.length >= 3 ? outlinePositions(region.ring, EDGE_Y) : null),
    [region.ring],
  );
  useEffect(() => () => {
    geometry?.dispose();
  }, [geometry]);
  if (!geometry || !line) return null;
  return (
    <group>
      <mesh geometry={geometry} renderOrder={6} raycast={() => null}>
        <meshBasicMaterial color={region.color} transparent opacity={0.1} depthWrite={false} depthTest={false} side={DoubleSide} toneMapped={false} />
      </mesh>
      <lineSegments renderOrder={7} raycast={() => null}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[line, 3]} />
        </bufferGeometry>
        <lineBasicMaterial color={region.color} transparent opacity={0.45} depthWrite={false} depthTest={false} toneMapped={false} linewidth={1} />
      </lineSegments>
    </group>
  );
}

export function ArrivalZoningLayer({ map }: { map: ArrivalZoningMap }) {
  return (
    <group>
      {map.regions.map((region) => (
        <RegionMesh key={region.pocketId} region={region} />
      ))}
    </group>
  );
}
