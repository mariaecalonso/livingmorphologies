"use client";

import { useEffect, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import {
  BufferAttribute,
  BufferGeometry,
  Color,
  CustomBlending,
  DoubleSide,
  Group,
  GLSL3,
  Mesh,
  MeshBasicMaterial,
  OneFactor,
  OneMinusSrcAlphaFactor,
  ShaderMaterial,
  type Material,
} from "three";
import type { IsoMesh } from "@/lib/scan/isomesh";
import type { PlacedMesh } from "@/lib/skill4/draw-placed";
import { poseOf, tilePoint } from "@/lib/skill5/gumball";
import type { PlacedModule } from "@/lib/skill5/placement";
import { filmSweepFrame, type FilmSweep } from "@/components/hybrid/validation-panel";

export type SiteAssemblyFilmView = {
  assembly: readonly PlacedMesh[];
  sweep: FilmSweep | null;
  skins: readonly PlacedMesh[];
  onSweepDone: () => void;
};

const CONTACT_FT = 2;

/** Placed tiles in site coordinates, the same meshes Skill 04 shrink-wraps. */
export function siteAssemblyFilmMeshes(
  instances: readonly PlacedModule[],
  meshes: Record<string, IsoMesh>,
  passages: readonly { id: string; positions: number[]; indices: number[] }[],
  shift: Record<string, { x: number; z: number }>,
): PlacedMesh[] {
  const tiles = instances.flatMap((instance) => {
    const source = meshes[instance.provenance.moduleId];
    if (!source || instance.geometryState !== "available") return [];
    const mesh = tileInSite(source, instance, shift[instance.instanceId]);
    return mesh ? [{ id: instance.instanceId, mesh, translate: { x: 0, y: 0, z: 0 }, selected: false }] : [];
  });
  const joints = passages.flatMap((passage) => {
    if (passage.positions.length < 9 || passage.indices.length < 3) return [];
    const positions = Float32Array.from(passage.positions);
    const indices = Uint32Array.from(passage.indices);
    return [{
      id: `passage:${passage.id}`,
      mesh: { positions, normals: new Float32Array(positions.length), indices, triangles: indices.length / 3 },
      translate: { x: 0, y: 0, z: 0 },
      selected: false,
    }];
  });
  return [...tiles, ...joints];
}

/** Tiles that touch, or that a recorded connection joins, share one veil. The rest stay separate. */
export function siteFilmClusters(
  meshes: readonly PlacedMesh[],
  links: readonly { id: string; a: string; b: string }[],
): string[][] {
  const ids = meshes.map((mesh) => mesh.id);
  const parent = new Map(ids.map((id) => [id, id]));
  const find = (id: string): string => {
    const next = parent.get(id);
    if (!next || next === id) return id;
    const root = find(next);
    parent.set(id, root);
    return root;
  };
  const union = (a: string, b: string) => {
    if (!parent.has(a) || !parent.has(b)) return;
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(rb, ra);
  };
  for (const link of links) {
    union(link.a, link.b);
    union(link.a, `passage:${link.id}`);
    union(link.b, `passage:${link.id}`);
  }
  const tiles = meshes.filter((mesh) => !mesh.id.startsWith("passage:"));
  const boxes = tiles.map((mesh) => ({ id: mesh.id, box: boundsOf(mesh) }));
  for (let i = 0; i < boxes.length; i += 1) {
    for (let j = i + 1; j < boxes.length; j += 1) {
      if (touching(boxes[i].box, boxes[j].box)) union(boxes[i].id, boxes[j].id);
    }
  }
  const groups = new Map<string, string[]>();
  for (const id of ids) {
    const root = find(id);
    const list = groups.get(root);
    if (list) list.push(id);
    else groups.set(root, [id]);
  }
  return [...groups.values()];
}

function tileInSite(source: IsoMesh, instance: PlacedModule, shift?: { x: number; z: number }): IsoMesh | null {
  const count = source.positions.length;
  if (count < 9 || source.indices.length < 3) return null;
  const pose = poseOf(instance);
  if (shift) {
    pose.x += shift.x;
    pose.z += shift.z;
  }
  let minY = Infinity;
  const local = new Float32Array(count);
  for (let index = 0; index < count; index += 3) {
    local[index] = source.positions[index];
    local[index + 1] = source.positions[index + 2];
    local[index + 2] = source.positions[index + 1];
    if (local[index + 1] < minY) minY = local[index + 1];
  }
  const positions = new Float32Array(count);
  for (let index = 0; index < count; index += 3) {
    const point = tilePoint({
      x: local[index],
      y: local[index + 1] - minY,
      z: local[index + 2],
    }, pose, instance.mirror);
    positions[index] = point.x;
    positions[index + 1] = point.y;
    positions[index + 2] = point.z;
  }
  return {
    positions,
    normals: new Float32Array(count),
    indices: source.indices,
    triangles: source.indices.length / 3,
  };
}

function boundsOf(mesh: PlacedMesh) {
  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;
  const positions = mesh.mesh.positions;
  for (let index = 0; index < positions.length; index += 3) {
    minX = Math.min(minX, positions[index]);
    minY = Math.min(minY, positions[index + 1]);
    minZ = Math.min(minZ, positions[index + 2]);
    maxX = Math.max(maxX, positions[index]);
    maxY = Math.max(maxY, positions[index + 1]);
    maxZ = Math.max(maxZ, positions[index + 2]);
  }
  return { minX, minY, minZ, maxX, maxY, maxZ };
}

function touching(a: ReturnType<typeof boundsOf>, b: ReturnType<typeof boundsOf>) {
  return a.maxX >= b.minX - CONTACT_FT && b.maxX >= a.minX - CONTACT_FT
    && a.maxY >= b.minY - CONTACT_FT && b.maxY >= a.minY - CONTACT_FT
    && a.maxZ >= b.minZ - CONTACT_FT && b.maxZ >= a.minZ - CONTACT_FT;
}

function overlayOf(drawn: readonly PlacedMesh[]) {
  return drawn.filter((item) => item.id.startsWith("film-wrap") || item.id.startsWith("guide:"));
}

const SHELL_VERT = `
  in vec3 bary;
  out vec3 vNormal;
  out vec3 vBary;
  void main() {
    vNormal = normalize(mat3(modelViewMatrix) * normal);
    vBary = bary;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const SHELL_FRAG = `
  precision highp float;
  in vec3 vNormal;
  in vec3 vBary;
  uniform vec3 uColor;
  uniform float uAlpha;
  out vec4 fragColor;
  void main() {
    vec3 n = normalize(vNormal);
    float facing = n.z;
    if (facing < 0.0) n = -n;
    float rim = pow(1.0 - abs(facing), 2.6);
    float bend = length(fwidth(n));
    float crease = smoothstep(0.2, 0.46, bend) * (1.0 - smoothstep(0.46, 1.2, bend));
    float edgeDist = min(vBary.x, min(vBary.y, vBary.z));
    float fw = fwidth(edgeDist);
    float meshEdge = fw > 0.003 && fw < 0.055 ? (1.0 - smoothstep(fw * 0.15, fw * 0.7, edgeDist)) : 0.0;
    vec3 body = mix(uColor, vec3(1.0), 0.88);
    float shell = facing < 0.0 ? 0.66 : 1.0;
    float alpha = 0.22 * shell * uAlpha;
    vec3 glow = vec3(1.0) * (rim * 0.55 + crease * 0.28 + meshEdge * 0.22);
    fragColor = vec4(body * alpha + glow, alpha);
  }
`;

function shellMaterial() {
  return new ShaderMaterial({
    glslVersion: GLSL3,
    vertexShader: SHELL_VERT,
    fragmentShader: SHELL_FRAG,
    uniforms: {
      uColor: { value: new Color(0.78, 0.94, 0.93) },
      uAlpha: { value: 1 },
    },
    transparent: true,
    depthWrite: true,
    depthTest: true,
    side: DoubleSide,
    blending: CustomBlending,
    blendSrc: OneFactor,
    blendDst: OneMinusSrcAlphaFactor,
    toneMapped: false,
  });
}

function expand(mesh: PlacedMesh["mesh"]) {
  const count = mesh.indices.length;
  const positions = new Float32Array(count * 3);
  const normals = new Float32Array(count * 3);
  const bary = new Float32Array(count * 3);
  for (let index = 0; index < count; index += 1) {
    const source = mesh.indices[index] * 3;
    const target = index * 3;
    positions[target] = mesh.positions[source] ?? 0;
    positions[target + 1] = mesh.positions[source + 1] ?? 0;
    positions[target + 2] = mesh.positions[source + 2] ?? 0;
    normals[target] = mesh.normals[source] ?? 0;
    normals[target + 1] = mesh.normals[source + 1] ?? 1;
    normals[target + 2] = mesh.normals[source + 2] ?? 0;
    const corner = index % 3;
    bary[target + corner] = 1;
  }
  return { positions, normals, bary };
}

export function AssemblyFilmLayer({ assembly, sweep, skins, onSweepDone }: SiteAssemblyFilmView) {
  const group = useRef<Group>(null);
  const live = useRef({ assembly, sweep, skins, onSweepDone });
  live.current = { assembly, sweep, skins, onSweepDone };
  const clock = useRef({ id: -1, start: 0, done: false });
  const resting = useRef<readonly PlacedMesh[] | null>(null);
  const geometries = useRef<BufferGeometry[]>([]);
  const materials = useRef<Material[]>([]);

  useEffect(() => () => {
    geometries.current.forEach((geometry) => geometry.dispose());
    materials.current.forEach((material) => material.dispose());
  }, []);

  useFrame(() => {
    const node = group.current;
    if (!node) return;
    const current = live.current;
    let drawn: readonly PlacedMesh[];
    if (!current.sweep) {
      if (resting.current === current.skins && (current.skins.length > 0 || node.children.length === 0)) return;
      resting.current = current.skins;
      drawn = current.skins;
    } else {
      resting.current = null;
      const sweepNow = current.sweep;
      if (clock.current.id !== sweepNow.id) clock.current = { id: sweepNow.id, start: performance.now(), done: false };
      const t = Math.min(1, (performance.now() - clock.current.start) / sweepNow.duration);
      drawn = overlayOf(filmSweepFrame(current.assembly, sweepNow, t));
      if (t >= 1 && !clock.current.done) {
        clock.current.done = true;
        current.onSweepDone();
      }
    }
    while (node.children.length > drawn.length) {
      const child = node.children[node.children.length - 1];
      node.remove(child);
    }
    drawn.forEach((item, index) => {
      const shell = item.id.startsWith("film-wrap");
      const expected = shell ? "shell" : "guide";
      let mesh = node.children[index] as Mesh | undefined;
      if (!mesh || mesh.userData.kind !== expected) {
        const geometry = new BufferGeometry();
        const material = shell
          ? shellMaterial()
          : new MeshBasicMaterial({ transparent: true, depthWrite: false, side: DoubleSide, toneMapped: false });
        geometries.current.push(geometry);
        materials.current.push(material);
        const next = new Mesh(geometry, material);
        next.userData.kind = expected;
        next.raycast = () => {};
        if (mesh) node.remove(mesh);
        node.add(next);
        const from = node.children.indexOf(next);
        if (from !== index) {
          node.children.splice(from, 1);
          node.children.splice(index, 0, next);
        }
        mesh = next;
      }
      writeMesh(mesh, item, shell);
    });
  });

  return <group ref={group} />;
}

function writeMesh(mesh: Mesh, item: PlacedMesh, shell: boolean) {
  const geometry = mesh.geometry as BufferGeometry;
  if (shell) {
    const flat = expand(item.mesh);
    geometry.setAttribute("position", new BufferAttribute(flat.positions, 3));
    geometry.setAttribute("normal", new BufferAttribute(flat.normals, 3));
    geometry.setAttribute("bary", new BufferAttribute(flat.bary, 3));
    geometry.setIndex(null);
    const material = mesh.material as ShaderMaterial;
    const color = item.color ?? [0.78, 0.94, 0.93];
    material.uniforms.uColor.value.setRGB(color[0], color[1], color[2]);
    material.uniforms.uAlpha.value = item.opacity ?? 1;
    return;
  }
  geometry.setAttribute("position", new BufferAttribute(new Float32Array(item.mesh.positions), 3));
  geometry.setIndex(new BufferAttribute(new Uint32Array(item.mesh.indices), 1));
  geometry.computeVertexNormals();
  const material = mesh.material as MeshBasicMaterial;
  const color = item.color ?? [1, 0.93, 0.86];
  material.color.setRGB(color[0], color[1], color[2]);
  material.opacity = item.opacity ?? 0.78;
}
