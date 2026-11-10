"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { BufferGeometry, DoubleSide, Float32BufferAttribute, InstancedMesh, MeshBasicMaterial, Object3D } from "three";
import { STUDY_LIMIT } from "@/components/site/site-geometry";
import { travelVector } from "@/lib/skill5/wind";

function arrowGeometry(length: number) {
  const head = length * 0.32;
  const tail = length * 0.5;
  const half = Math.max(7, length * 0.055);
  const wing = length * 0.2;
  const nose = length * 0.5;
  const neck = nose - head;
  const positions = [
    -half, 0, -tail, half, 0, -tail, half, 0, neck,
    -half, 0, -tail, half, 0, neck, -half, 0, neck,
    -wing, 0, neck, wing, 0, neck, 0, 0, nose,
  ];
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  return geometry;
}

const dummy = new Object3D();

export function WindField({
  fromDegrees,
  density,
  motion,
}: {
  fromDegrees: number;
  density: number;
  motion: number;
}) {
  const mesh = useRef<InstancedMesh>(null);
  const reduced = useRef(false);
  const layout = useMemo(() => {
    const spanX = STUDY_LIMIT.maxX - STUDY_LIMIT.minX;
    const spanZ = STUDY_LIMIT.maxZ - STUDY_LIMIT.minZ;
    const count = 3 + density * 2;
    const stepX = spanX / count;
    const stepZ = spanZ / count;
    const points: Array<[number, number]> = [];
    for (let row = 0; row < count; row += 1) {
      for (let column = 0; column < count; column += 1) {
        points.push([
          STUDY_LIMIT.minX + (column + 0.5) * stepX,
          STUDY_LIMIT.minZ + (row + 0.5) * stepZ,
        ]);
      }
    }
    return { points, step: Math.min(stepX, stepZ), length: Math.min(150, Math.min(stepX, stepZ) * 0.46) };
  }, [density]);
  const geometry = useMemo(() => arrowGeometry(layout.length), [layout.length]);
  const material = useMemo(() => new MeshBasicMaterial({ color: "#f2f2ee", transparent: true, opacity: 0.92, side: DoubleSide, depthWrite: false }), []);

  useEffect(() => {
    reduced.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    return () => {
      geometry.dispose();
      material.dispose();
    };
  }, [geometry, material]);

  useFrame(({ clock }) => {
    const current = mesh.current;
    if (!current) return;
    const travel = travelVector(fromDegrees);
    const turn = Math.atan2(travel.east, travel.north);
    const rate = reduced.current ? 0 : motion;
    layout.points.forEach(([x, z], index) => {
      const phase = (index * 0.173) % 1;
      const offset = ((clock.elapsedTime * rate * 0.18 + phase) % 1) * layout.step;
      dummy.position.set(x + travel.east * offset, 8, z + travel.north * offset);
      dummy.rotation.set(0, turn, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      current.setMatrixAt(index, dummy.matrix);
    });
    current.instanceMatrix.needsUpdate = true;
  });

  return <instancedMesh ref={mesh} args={[geometry, material, layout.points.length]} frustumCulled={false} renderOrder={6} />;
}
