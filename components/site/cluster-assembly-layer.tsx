"use client";

import { useEffect, useMemo } from "react";
import { BufferGeometry, DoubleSide, Float32BufferAttribute, ShaderMaterial, Uint32BufferAttribute } from "three";

export type AssemblySolid = {
  id: string;
  positions: Float32Array;
  indices: Uint32Array;
  color: string;
  opacity: number;
};

export type ClusterAssemblyModel = {
  zoning: boolean;
  clusters: boolean;
  connections: boolean;
  massing: boolean;
  branches: readonly { x0: number; z0: number; x1: number; z1: number }[];
  zones: readonly { kind: "lobby" | "gathering" | "workspace"; points: readonly { x: number; z: number }[] }[];
  anchors: readonly { id: string; x: number; z: number; tested: boolean }[];
  link: { ax: number; az: number; bx: number; bz: number } | null;
  solids: readonly AssemblySolid[];
  voids: readonly AssemblySolid[];
  hybrid: AssemblySolid | null;
  wrap: AssemblySolid | null;
};

const WHITE_VERT = `
  varying vec3 vNormal;
  void main() {
    vNormal = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const WHITE_FRAG = `
  precision highp float;
  varying vec3 vNormal;
  void main() {
    vec3 n = normalize(vNormal);
    if (dot(n, vec3(0.0, 0.0, 1.0)) < 0.0) n = -n;
    float lambert = clamp(dot(n, normalize(vec3(0.42, 0.74, 0.52))), 0.0, 1.0);
    float shadeLit = 0.38 + lambert * 0.24;
    vec3 body = vec3(1.0) * shadeLit;
    float crease = smoothstep(0.5, 0.95, length(fwidth(n))) * 0.22;
    gl_FragColor = vec4(mix(body, vec3(0.96), crease), 1.0);
  }
`;

const VOID_VERT = `
  varying float vHeight;
  void main() {
    vHeight = position.y;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const VOID_FRAG = `
  precision highp float;
  varying float vHeight;
  uniform float uMinY;
  uniform float uMaxY;
  void main() {
    float height = clamp((vHeight - uMinY) / max(0.001, uMaxY - uMinY), 0.0, 1.0);
    float warm = 1.0 - smoothstep(0.08, 0.82, height);
    vec3 teal = vec3(0.058824, 0.450980, 0.466667);
    vec3 clay = vec3(0.780392, 0.494118, 0.372549);
    vec3 hue = mix(teal, clay, warm);
    gl_FragColor = vec4(hue * 0.55, mix(0.72, 0.9, warm));
  }
`;

function heightRange(positions: Float32Array) {
  let min = Infinity;
  let max = -Infinity;
  for (let index = 1; index < positions.length; index += 3) {
    min = Math.min(min, positions[index]);
    max = Math.max(max, positions[index]);
  }
  return { min, max: Math.max(max, min + 1) };
}

function CatalogCluster({ solid }: { solid: AssemblySolid }) {
  const geometry = useMemo(() => {
    const next = new BufferGeometry();
    next.setAttribute("position", new Float32BufferAttribute(solid.positions, 3));
    next.setIndex(new Uint32BufferAttribute(solid.indices, 1));
    next.computeVertexNormals();
    return next;
  }, [solid.indices, solid.positions]);
  const material = useMemo(() => new ShaderMaterial({
    vertexShader: WHITE_VERT,
    fragmentShader: WHITE_FRAG,
    transparent: false,
    depthWrite: true,
    opacity: 1,
    side: DoubleSide,
    toneMapped: false,
  }), []);
  useEffect(() => () => {
    geometry.dispose();
    material.dispose();
  }, [geometry, material]);
  return <mesh geometry={geometry} material={material} raycast={() => undefined} />;
}

function VoidVolume({ solid }: { solid: AssemblySolid }) {
  const geometry = useMemo(() => {
    const next = new BufferGeometry();
    next.setAttribute("position", new Float32BufferAttribute(solid.positions, 3));
    next.setIndex(new Uint32BufferAttribute(solid.indices, 1));
    return next;
  }, [solid.indices, solid.positions]);
  const material = useMemo(() => {
    const range = heightRange(solid.positions);
    return new ShaderMaterial({
      vertexShader: VOID_VERT,
      fragmentShader: VOID_FRAG,
      uniforms: { uMinY: { value: range.min }, uMaxY: { value: range.max } },
      transparent: true,
      depthWrite: false,
      side: DoubleSide,
      toneMapped: false,
    });
  }, [solid.positions]);
  useEffect(() => () => {
    geometry.dispose();
    material.dispose();
  }, [geometry, material]);
  return <mesh geometry={geometry} material={material} raycast={() => undefined} />;
}

function SolidMesh({ solid }: { solid: AssemblySolid }) {
  const geometry = useMemo(() => {
    const next = new BufferGeometry();
    next.setAttribute("position", new Float32BufferAttribute(solid.positions, 3));
    next.setIndex(new Uint32BufferAttribute(solid.indices, 1));
    next.computeVertexNormals();
    return next;
  }, [solid.indices, solid.positions]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <mesh geometry={geometry} raycast={() => undefined}>
      <meshStandardMaterial color={solid.color} transparent={solid.opacity < 0.98} opacity={solid.opacity} depthWrite={solid.opacity >= 0.98} side={DoubleSide} roughness={0.62} metalness={0.02} />
    </mesh>
  );
}

export function ClusterAssemblyLayer({ model }: { model: ClusterAssemblyModel }) {
  const branches = useMemo(() => {
    const positions = new Float32Array(model.branches.length * 6);
    model.branches.forEach((branch, index) => {
      const offset = index * 6;
      positions[offset] = branch.x0;
      positions[offset + 1] = 1.4;
      positions[offset + 2] = branch.z0;
      positions[offset + 3] = branch.x1;
      positions[offset + 4] = 1.4;
      positions[offset + 5] = branch.z1;
    });
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
    return geometry;
  }, [model.branches]);
  const zones = useMemo(() => model.zones.map((zone, zoneIndex) => {
    const positions = new Float32Array(zone.points.length * 6);
    zone.points.forEach((point, index) => {
      const next = zone.points[(index + 1) % zone.points.length];
      const offset = index * 6;
      positions[offset] = point.x;
      positions[offset + 1] = 2.2;
      positions[offset + 2] = point.z;
      positions[offset + 3] = next.x;
      positions[offset + 4] = 2.2;
      positions[offset + 5] = next.z;
    });
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
    const color = zone.kind === "lobby" ? "#9af6f8" : zone.kind === "workspace" ? "#d7d3cc" : "#f0b08a";
    return { id: `${zone.kind}-${zoneIndex}`, geometry, color };
  }), [model.zones]);
  const link = useMemo(() => {
    if (!model.link) return null;
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new Float32BufferAttribute([
      model.link.ax, 8, model.link.az,
      model.link.bx, 8, model.link.bz,
    ], 3));
    return geometry;
  }, [model.link]);
  useEffect(() => () => {
    branches.dispose();
    link?.dispose();
    zones.forEach((zone) => zone.geometry.dispose());
  }, [branches, link, zones]);
  const showClusters = model.clusters || model.connections;
  return (
    <group>
      {model.zoning ? zones.map((zone) => (
        <lineSegments key={zone.id} geometry={zone.geometry} raycast={() => undefined}><lineBasicMaterial color={zone.color} transparent opacity={0.85} /></lineSegments>
      )) : null}
      {model.zoning ? <lineSegments geometry={branches} raycast={() => undefined}><lineBasicMaterial color="#49d7de" transparent opacity={0.45} /></lineSegments> : null}
      {model.zoning && link ? <lineSegments geometry={link} raycast={() => undefined}><lineBasicMaterial color="#c77e5f" /></lineSegments> : null}
      {model.zoning ? model.anchors.map((anchor) => (
        <mesh key={anchor.id} position={[anchor.x, 6, anchor.z]} raycast={() => undefined}>
          <sphereGeometry args={[anchor.tested ? 7 : 4.5, 12, 8]} />
          <meshBasicMaterial color={anchor.tested ? "#c77e5f" : "#49d7de"} />
        </mesh>
      )) : null}
      {model.voids.map((item) => <VoidVolume key={item.id} solid={item} />)}
      {model.massing && model.wrap ? <CatalogCluster solid={model.wrap} /> : null}
      {showClusters ? model.solids.map((item) => <CatalogCluster key={item.id} solid={item} />) : null}
      {model.connections && model.hybrid ? <SolidMesh solid={model.hybrid} /> : null}
    </group>
  );
}
